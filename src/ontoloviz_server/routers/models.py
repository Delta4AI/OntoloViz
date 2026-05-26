"""External model adapter endpoints.

This namespace is reserved for future integrations that pull ranked phenotype
or drug lists from external sources (LLM agents, scoring pipelines, etc.).

The contract is locked in here as typed Pydantic models so the frontend can
integrate against the schema before any concrete adapter ships. Concrete
adapters wire themselves into ``_PROVIDERS`` at startup; the registry is
currently empty.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["models"])


class ModelProvider(BaseModel):
    """Metadata for a single model provider registered with the backend."""

    id: str
    label: str
    kind: Literal["phenotype", "drug"]
    description: str = ""


class PredictRequest(BaseModel):
    """A request for a ranked list from a specific provider."""

    provider_id: str = Field(alias="providerId")
    query: str
    """Free-text query that the adapter interprets — e.g. a disease name or
    a target protein. Adapters define their own conventions."""
    limit: int = Field(default=100, ge=1, le=5000)

    model_config = {"populate_by_name": True}


class PredictionItem(BaseModel):
    """One entry in a ranked prediction list."""

    id: str
    label: str = ""
    score: float


class PredictResponse(BaseModel):
    """Adapter response — the ranked list ready for TSV-like ingestion."""

    provider_id: str = Field(alias="providerId")
    items: list[PredictionItem]

    model_config = {"populate_by_name": True}


# Empty until the first concrete adapter lands. Adapters register themselves
# by adding a ``ModelProvider`` entry plus a callable in a sibling module —
# wiring deferred so this file stays declarative.
_PROVIDERS: dict[str, ModelProvider] = {}


@router.get("/", response_model=list[ModelProvider])
def list_providers() -> list[ModelProvider]:
    """List configured model providers. Empty until adapters are added."""
    return list(_PROVIDERS.values())


@router.post("/predict", response_model=PredictResponse)
def predict(_payload: PredictRequest) -> PredictResponse:
    """Run a prediction against the chosen provider.

    Returns 501 when no adapter is registered for the requested provider. The
    contract is documented in OpenAPI so frontends can integrate against the
    schema independently of which adapters are deployed.
    """
    if not _PROVIDERS:
        raise HTTPException(
            status_code=501,
            detail="no model adapters registered",
        )
    raise HTTPException(
        status_code=404,
        detail=f"unknown provider: {_payload.provider_id}",
    )
