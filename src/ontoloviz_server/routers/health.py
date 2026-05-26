"""Health-check endpoint consumed by the frontend at startup."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from .. import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)
