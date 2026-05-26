"""FastAPI entrypoint for the OntoloViz backend."""

from __future__ import annotations

import logging
from importlib.resources import as_file, files
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .routers import health, models, obo

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    app = FastAPI(
        title="OntoloViz Server",
        version=__version__,
        description=(
            "Backend for the OntoloViz web app. "
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

    _mount_web_frontend(app)

    return app


def _mount_web_frontend(app: FastAPI) -> None:
    """Mount the bundled SPA at `/` if `web_dist/` shipped in the wheel.

    In dev mode (editable install without a frontend build) the directory
    is absent; the Vite dev server serves the frontend instead via the
    existing /api proxy, so we simply skip the mount.
    """
    try:
        dist_resource = files("ontoloviz_server") / "web_dist"
        with as_file(dist_resource) as resolved:
            dist_path = Path(resolved)
    except (FileNotFoundError, ModuleNotFoundError, NotADirectoryError):
        dist_path = None  # type: ignore[assignment]

    if dist_path is None or not (dist_path / "index.html").is_file():
        logger.warning(
            "web_dist/index.html not found in package; SPA mount skipped "
            "(expected in dev mode — run `make build` to produce a bundle)."
        )
        return

    assets_dir = dist_path / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="spa-assets")

    index_file = dist_path / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404)
        if full_path:
            candidate = dist_path / full_path
            if candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(index_file)


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
