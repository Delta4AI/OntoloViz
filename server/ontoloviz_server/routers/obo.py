"""OBO ingestion endpoints (stub).

The frontend cannot fetch arbitrary OBO URLs directly (CORS). This router
will proxy the fetch and stream the parsed result. Full implementation lands
in a later phase; the route shape is fixed here so the frontend can integrate
against it early.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["obo"])


@router.get("/fetch")
def fetch_obo(url: str) -> dict[str, str]:
    """Fetch an OBO ontology from `url` and return parsed nodes.

    Stub: returns 501 until the parser lands.
    """
    if not url:
        raise HTTPException(status_code=400, detail="url query parameter required")
    raise HTTPException(status_code=501, detail="OBO fetch not yet implemented")
