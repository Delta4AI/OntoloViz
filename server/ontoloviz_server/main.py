"""FastAPI entrypoint for the OntoloViz V2 backend."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .routers import health, models, obo


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    app = FastAPI(
        title="OntoloViz Server",
        version=__version__,
        description=(
            "Backend for the OntoloViz V2 web app. "
            "Handles OBO ingestion and (future) external model adapters."
        ),
    )

    # Dev-only: the Vite dev server proxies /api, so CORS is rarely hit in
    # development. Kept permissive for now; tighten before any public deploy.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(obo.router, prefix="/api/obo")
    app.include_router(models.router, prefix="/api/models")

    return app


app = create_app()


def run() -> None:
    """Console-script entry point: `ontoloviz-server`."""
    import uvicorn

    uvicorn.run(
        "ontoloviz_server.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
