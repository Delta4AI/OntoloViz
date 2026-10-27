# OntoloViz Server — Runbook

Operational guide for deploying and running the OntoloViz web server
(`ontoloviz-server`: FastAPI + bundled SPA, one process, one port).

## Architecture in one paragraph

In production there is a **single service**. The FastAPI process serves the
built SPA *and* the `/api/*` endpoints on one port from one origin. The
frontend is a static bundle embedded in the wheel under
`ontoloviz_server/web_dist/` — there is no separate frontend server in
production (`:5173` is the Vite dev server only). The handoff API and the SPA
therefore live behind the same origin (and the same reverse-proxy prefix, if
any).

## Deployment (systemd, `just deploy`)

The host builds the SPA bundle and the wheel itself, installs the wheel into
`/opt/ontoloviz/venv`, and runs it under the versioned unit
`deploy/ontoloviz.service`. Run `just` as your normal user (not root); only
individual steps use `sudo`, so `git pull` keeps your SSH keys. The service
runs as the user who deployed it.

| Recipe | Meaning |
|--------|---------|
| `just deploy` | `git pull --ff-only` on `main` → `pnpm install` → `make build` → install wheel → refresh unit → restart → healthcheck |
| `just status` | `systemctl status ontoloviz` |
| `just logs` | Follow the journal |
| `just down` | Stop the service (asks first) |

`deploy` is idempotent: a rerun rebuilds, reinstalls and restarts, nothing
else. It refuses to run as root, off `main`, or with local edits on the
server. It ends with a healthcheck that **fails loudly** if `/api/health`
doesn't come up or the SPA bundle isn't served (a wheel built without the
frontend).

### First install

```bash
# Toolchain (Debian/Ubuntu): just + Node (gives corepack) + pnpm + uv
sudo apt install -y just nodejs && sudo corepack enable pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh

# Server config (optional; the server defaults to 127.0.0.1:8000). Behind a
# dockerized reverse proxy, bind 0.0.0.0 and trust forwarded headers:
sudo install -m640 -o "$USER" .env.example /etc/ontoloviz.env
sudoedit /etc/ontoloviz.env      # ONTOLOVIZ_HOST=0.0.0.0, ONTOLOVIZ_PORT, ONTOLOVIZ_PROXY_HEADERS=1

just deploy
```

Config changes: edit `/etc/ontoloviz.env`, then `sudo systemctl restart ontoloviz`
(or `just deploy`).

The frontend builds with a **relative base** by default, so the *same* bundle
works at the root or under any reverse-proxy sub-path (e.g. `/ontoloviz/`) with
**no build-time config**: just have the proxy strip the prefix (trailing-slash
`proxy_pass`). Set `VITE_BASE=/abs/path/` only to force an absolute base.

**Rollback:** check out the previous release's commit on the server and rerun
the build + install steps (`git checkout v<ver> && make build`), or revert on
`main` and `just deploy`. The two-step `pip install` reinstalls the package
files even on a same-version wheel, so a known-good build always overwrites a
bad one.

## Run directly (no systemd, no proxy)

```bash
ontoloviz-server                                       # 127.0.0.1:8000, base /
ONTOLOVIZ_HOST=0.0.0.0 ONTOLOVIZ_PORT=8000 ontoloviz-server   # LAN-reachable
```

Fully supported and appropriate for local/internal use. Front with a TLS proxy
only when exposing to the public internet.

## Environment variables

<!-- AUTO-GENERATED from .env.example — do not edit by hand -->

| Variable | Default | Description |
|----------|---------|-------------|
| `ONTOLOVIZ_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to accept connections from outside (e.g. a dockerized reverse proxy). |
| `ONTOLOVIZ_PORT` | `8000` | TCP port the FastAPI server listens on. |
| `ONTOLOVIZ_WORKERS` | `1` | Worker processes. **Keep at 1** — the `/api/ontology` handoff store is in-process; multiple workers would 404 intermittently. Ignored when reload is on. |
| `ONTOLOVIZ_RELOAD` | `0` | Hot-reload on source changes. Dev only — must be `0` in production. |
| `ONTOLOVIZ_PROXY_HEADERS` | `0` | Trust `X-Forwarded-*`. Set `1` behind nginx/Caddy/an LB for correct scheme/redirects. |
| `ONTOLOVIZ_LOG_LEVEL` | `info` | Uvicorn log level: `critical`/`error`/`warning`/`info`/`debug`/`trace`. |
| `ONTOLOVIZ_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed CORS origins. Unused for same-origin deployments; set only when a *different* origin calls the API directly. |

<!-- END AUTO-GENERATED -->

## API surface

<!-- AUTO-GENERATED from src/ontoloviz_server/routers/ — do not edit by hand -->

| Method & path | Purpose |
|---------------|---------|
| `GET /api/health` | Liveness + version. Used by the deploy healthcheck and the in-app indicator. |
| `POST /api/obo/parse` | Parse an OBO document body → ontology JSON. |
| `GET /api/obo/fetch?url=…` | Fetch a remote `.obo` (size-capped, 24h cached) → ontology JSON. |
| `POST /api/ontology` | Store a pushed ontology → `{ "id": "<token>" }` (handoff). |
| `GET /api/ontology/{id}` | Retrieve a stored ontology, or `404` if unknown/expired. |
| `GET /api/models/` | List model adapters (reserved; empty). |
| `POST /api/models/predict` | Reserved adapter endpoint (`501` until adapters land). |

Live, machine-readable schema: `/docs` (Swagger UI) and `/openapi.json` on a
running server. Ontology-handoff details: [ontology-handoff.md](./ontology-handoff.md).

<!-- END AUTO-GENERATED -->

## Health check

```bash
curl -fsS http://127.0.0.1:8000/api/health        # {"status":"ok","version":"…"}
curl -fsS http://127.0.0.1:8000/ | grep index-    # SPA bundle is being served
```

## Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Browser shows landing/404, API works | Stale or frontend-less bundle served | Rebuild with `make build` and re-deploy; never `uv build` alone. |
| Assets 404 behind a proxy sub-path | Proxy not stripping the prefix, or `VITE_BASE` forced to an absolute path | Use a trailing-slash `proxy_pass` (strips the prefix); the default relative-base build needs no `VITE_BASE`. |
| Handoff link 404s intermittently | Multiple workers, per-process store | Run single-worker (`ONTOLOVIZ_WORKERS=1`). |
| Dockerized proxy can't reach the service | Bound to `127.0.0.1` | Set `ONTOLOVIZ_HOST=0.0.0.0`; control exposure upstream. |
| Wrong scheme in redirects behind TLS proxy | Forwarded headers not trusted | Set `ONTOLOVIZ_PROXY_HEADERS=1`. |
| Handoff id stopped working | Expired (~1h TTL) or backend restarted (in-memory) | Re-POST the ontology for a fresh id. |
