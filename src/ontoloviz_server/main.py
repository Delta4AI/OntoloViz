"""FastAPI entrypoint for the OntoloViz backend."""

from __future__ import annotations

import argparse
import logging
import os
from importlib.resources import as_file, files
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .routers import health, models, obo

logger = logging.getLogger(__name__)

_DEFAULT_DEV_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def _cors_origins() -> list[str]:
    """Resolve allowed CORS origins from `ONTOLOVIZ_CORS_ORIGINS`.

    Comma-separated. Empty / unset → dev defaults (Vite on :5173). In a
    same-origin prod deployment (SPA + API served by this process) the
    middleware is effectively dormant.
    """
    raw = os.environ.get("ONTOLOVIZ_CORS_ORIGINS", _DEFAULT_DEV_ORIGINS)
    return [o.strip() for o in raw.split(",") if o.strip()]


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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
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


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ontoloviz-server",
        description="Run the OntoloViz FastAPI server (bundled SPA + /api/*).",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("ONTOLOVIZ_HOST", "127.0.0.1"),
        help="Bind address (default: 127.0.0.1, env: ONTOLOVIZ_HOST). "
        "Use 0.0.0.0 to expose on all interfaces.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("ONTOLOVIZ_PORT", "8000")),
        help="TCP port (default: 8000, env: ONTOLOVIZ_PORT).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.environ.get("ONTOLOVIZ_WORKERS", "1")),
        help="Worker process count (default: 1, env: ONTOLOVIZ_WORKERS). "
        "Ignored when --reload is set.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=os.environ.get("ONTOLOVIZ_RELOAD", "").lower() in ("1", "true", "yes"),
        help="Enable hot-reload (dev only; forces workers=1). "
        "Env: ONTOLOVIZ_RELOAD=1.",
    )
    parser.add_argument(
        "--proxy-headers",
        action="store_true",
        default=os.environ.get("ONTOLOVIZ_PROXY_HEADERS", "").lower()
        in ("1", "true", "yes"),
        help="Trust X-Forwarded-* headers from a reverse proxy. "
        "Env: ONTOLOVIZ_PROXY_HEADERS=1.",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("ONTOLOVIZ_LOG_LEVEL", "info"),
        choices=["critical", "error", "warning", "info", "debug", "trace"],
        help="Uvicorn log level (default: info, env: ONTOLOVIZ_LOG_LEVEL).",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Shortcut for --reload --host 127.0.0.1.",
    )
    return parser


def run(argv: list[str] | None = None) -> None:
    """Console-script entry point: `ontoloviz-server`.

    Defaults are safe for prod (127.0.0.1, single worker, no reload). Pass
    `--dev` for the Vite-friendly dev loop, or override individual flags.
    """
    import uvicorn

    args = _build_parser().parse_args(argv)

    if args.dev:
        args.reload = True

    workers = 1 if args.reload else max(1, args.workers)
    # Reload requires the import-string form; multi-worker also requires it
    # so each worker can import the app independently.
    app_target: str | FastAPI = (
        "ontoloviz_server.main:app" if (args.reload or workers > 1) else app
    )

    uvicorn.run(
        app_target,
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=workers if not args.reload else None,
        proxy_headers=args.proxy_headers,
        forwarded_allow_ips="*" if args.proxy_headers else None,
        log_level=args.log_level,
    )
