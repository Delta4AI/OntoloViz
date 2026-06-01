"""OBO ingestion endpoints.

Two surfaces:

  * ``POST /api/obo/parse`` — accepts an OBO file body and returns the parsed
    ontology in the same shape the frontend builds locally from TSV uploads.
  * ``GET  /api/obo/fetch?url=…`` — proxies a remote OBO fetch (CORS-safe),
    enforces a size cap, and returns the parsed result.

Parsing itself is delegated to ``ontoloviz_server.obo_parser`` so it stays
unit-testable without spinning the HTTP stack.

The ``/fetch`` route memoises results in a small in-process LRU+TTL cache
keyed on ``(url, root_id, min_node_size)``. OBO Foundry releases are daily
at most, so re-downloading 50–150 MB on every preset click is wasteful.
The cache is cleared by process restart — no disk persistence.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from time import monotonic

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..obo_parser import parse_obo
from ..schemas import Ontology, ParseObooRequest

router = APIRouter(tags=["obo"])

_FETCH_TIMEOUT = 30.0
# 150 MB cap. Covers HPO/GO/MONDO/UBERON comfortably and chebi_lite (~53 MB);
# the full `chebi.obo` (~260 MB) is still rejected — that release ships
# structures/formulas we don't visualize.
_MAX_BYTES = 150 * 1024 * 1024

_CACHE_TTL_SECONDS = 24 * 60 * 60
_CACHE_MAX_ENTRIES = 8


@dataclass(frozen=True)
class _CacheEntry:
    ontology: Ontology
    inserted_at: float


_CacheKey = tuple[str, str | None, int | None]
_cache: OrderedDict[_CacheKey, _CacheEntry] = OrderedDict()


def _cache_get(key: _CacheKey) -> Ontology | None:
    """Return the cached ontology if fresh; evict and miss otherwise."""
    entry = _cache.get(key)
    if entry is None:
        return None
    if monotonic() - entry.inserted_at > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    _cache.move_to_end(key)  # LRU touch
    return entry.ontology


def _cache_put(key: _CacheKey, ontology: Ontology) -> None:
    _cache[key] = _CacheEntry(ontology=ontology, inserted_at=monotonic())
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX_ENTRIES:
        _cache.popitem(last=False)


def _reset_cache() -> None:
    """Test helper — drop all cached entries."""
    _cache.clear()


@router.post("/parse", response_model=Ontology)
def parse_obo_endpoint(payload: ParseObooRequest) -> Ontology:
    """Parse an OBO document and return the resulting ontology."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="empty OBO body")
    return parse_obo(
        payload.text,
        root_id=payload.root_id,
        min_node_size=payload.min_node_size,
    )


@router.get("/fetch", response_model=Ontology)
async def fetch_obo(
    url: str,
    root_id: str | None = Query(default=None, alias="rootId"),
    min_node_size: int | None = Query(default=None, alias="minNodeSize", ge=1),
) -> Ontology:
    """Fetch an OBO file from ``url`` and return the parsed ontology.

    Optional ``rootId`` / ``minNodeSize`` query params mirror the desktop
    GUI's per-ontology overrides (e.g. HPO → ``HP:0000118``) so the web
    client can produce the same per-system subtree split.

    Results are cached for 24h keyed on ``(url, root_id, min_node_size)``;
    a second request for the same triple returns immediately without
    re-downloading or re-parsing.
    """
    if not url:
        raise HTTPException(status_code=400, detail="url query parameter required")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="url must be http(s)")

    cache_key: _CacheKey = (url, root_id, min_node_size)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(
            timeout=_FETCH_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {exc}") from exc

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"upstream {resp.status_code} from {url}",
        )

    body = resp.content
    if len(body) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"OBO file exceeds {_MAX_BYTES // (1024 * 1024)} MB cap",
        )

    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=415, detail="OBO body is not utf-8") from exc

    ontology = parse_obo(text, root_id=root_id, min_node_size=min_node_size)
    _cache_put(cache_key, ontology)
    return ontology
