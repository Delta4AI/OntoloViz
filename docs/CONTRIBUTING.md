# Contributing to OntoloViz

This repo holds three things in one package:

- `src/ontoloviz/` — the legacy Tkinter desktop GUI (published to PyPI).
- `src/ontoloviz_server/` — the FastAPI server (serves the SPA + `/api/*`).
- `web/` — the Vite + React + TypeScript single-page app.

## Prerequisites

- **Python ≥ 3.10** with [`uv`](https://docs.astral.sh/uv/) (dependency + venv management).
- **Node + [`pnpm`](https://pnpm.io/)** for the web frontend.

## One-time setup

```bash
make install        # installs frontend (pnpm) and backend (uv sync --extra dev) deps
```

## Development loop

```bash
make dev            # Vite (:5173) + reloading FastAPI (:8000), /api proxied to the backend
```

Edit under `web/src/` for the frontend; Vite hot-reloads. Edit
`src/ontoloviz_server/` for the API; `--dev` reloads the server. The SPA mount
stays dormant in dev (Vite is the source of truth); the bundle is only built
for release.

Ports already taken locally? Override without touching source:
`VITE_DEV_PORT=5391 VITE_API_TARGET=http://127.0.0.1:9000 ONTOLOVIZ_PORT=9000 make dev`.

## Commands

<!-- AUTO-GENERATED from Makefile — do not edit by hand -->

| Command | Description |
|---------|-------------|
| `make install` | Install frontend (pnpm) and backend (`uv sync --extra dev`) dependencies. |
| `make dev` | Run Vite (`:5173`) and the reloading FastAPI server (`:8000`) concurrently. |
| `make dev-web` | Vite dev server only. |
| `make dev-server` | FastAPI only, with `--dev` (hot reload). |
| `make test` | Run web + server test suites. |
| `make test-web` | Vitest (frontend). |
| `make test-server` | pytest (backend). |
| `make lint` | ESLint (web) + Ruff (Python). |
| `make typecheck` | `tsc --noEmit` (web). |
| `make build` | Full release: build the SPA bundle, then the wheel (with the bundle embedded). |
| `make build-web` | Build the SPA and copy it into `src/ontoloviz_server/web_dist/`. |
| `make build-wheel` | `uv build` → wheel + sdist in `dist/`. |
| `make parity-fixtures` | Regenerate propagation parity fixtures from the Python reference. |
| `make version` | Print the current version (from `/VERSION`). |
| `make set-version` | Set the version (`/VERSION` is the single source of truth). |
| `make clean` | Remove build artifacts. |

<!-- END AUTO-GENERATED -->

## Testing

- Frontend: Vitest (`make test-web`). Propagation/color logic is **parity-tested**
  against the Python reference (`src/ontoloviz/core.py`) via JSON fixtures —
  regenerate with `make parity-fixtures` after changing propagation semantics.
- Backend: pytest (`make test-server`), including the API endpoint suites under
  `tests/server/`.
- Run everything with `make test`. Keep tests passing before opening a PR.

## Code style

- **Web:** ESLint + Prettier, TypeScript strict. `make lint` and `make typecheck`
  must be clean (`eslint --max-warnings 0`).
- **Python:** Ruff (`E,F,I,B,UP,N,SIM`), line length 100, type annotations on
  signatures. The legacy `src/ontoloviz/` GUI is excluded from Ruff.

## Versioning

`/VERSION` is the single source of truth; `pyproject.toml` and the app read it
dynamically. Never edit version literals by hand — use `make set-version`.

## PR checklist

- [ ] `make lint` and `make typecheck` clean
- [ ] `make test` passes (web + server)
- [ ] New behavior covered by tests
- [ ] No secrets, internal hostnames, or deployment-specific values hardcoded
      (config goes through `ONTOLOVIZ_*` env vars / `.env.example`)
- [ ] Docs updated when commands, env vars, or API routes changed
