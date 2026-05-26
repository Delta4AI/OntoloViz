"""OBO ingestion endpoints.

Two surfaces:

  * ``POST /api/obo/parse`` — accepts an OBO file body and returns the parsed
    ontology in the same shape the frontend builds locally from TSV uploads.
  * ``GET  /api/obo/fetch?url=…`` — proxies a remote OBO fetch (CORS-safe),
    enforces a size cap, and returns the parsed result.

Parsing itself is delegated to ``ontoloviz_server.obo_parser`` so it stays
unit-testable without spinning the HTTP stack.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException

from ..obo_parser import parse_obo
from ..schemas import Ontology, ParseObooRequest

router = APIRouter(tags=["obo"])

_FETCH_TIMEOUT = 30.0
_MAX_BYTES = 50 * 1024 * 1024  # 50 MB — covers HPO/MP/GO snapshots comfortably


@router.post("/parse", response_model=Ontology)
def parse_obo_endpoint(payload: ParseObooRequest) -> Ontology:
    """Parse an OBO document and return the resulting ontology."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="empty OBO body")
    return parse_obo(payload.text)


@router.get("/fetch", response_model=Ontology)
async def fetch_obo(url: str) -> Ontology:
    """Fetch an OBO file from ``url`` and return the parsed ontology."""
    if not url:
        raise HTTPException(status_code=400, detail="url query parameter required")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="url must be http(s)")

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

    return parse_obo(text)
