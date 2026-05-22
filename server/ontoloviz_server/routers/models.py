"""External model adapter endpoints (stub).

This namespace is reserved for future integrations that pull ranked phenotype
or drug lists from external sources (LLM agents, scoring pipelines, etc.).
Kept as a stub so the URL shape is locked in early.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["models"])


@router.get("/")
def list_providers() -> dict[str, list[str]]:
    """List configured model providers. Empty until adapters are added."""
    return {"providers": []}
