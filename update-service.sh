#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# OntoloViz — update the running systemd service.
#
# Two modes:
#   wheel  (default, no Node needed): install a freshly built or CI-produced
#          wheel into the service venv, then restart.
#   source (--build, needs Node+pnpm+uv): git pull + `make build` to rebuild
#          the SPA bundle AND the wheel here, then install + restart.
#
# A plain `git pull && systemctl restart` would serve a STALE SPA bundle (the
# served frontend lives inside the installed wheel, not the repo) — always go
# through one of these paths.
#
# Run as the service user (NOT root); only privileged steps use sudo.
#
# Usage:
#   ./update-service.sh [path/to/new.whl]   # wheel mode (newest dist/*.whl if omitted)
#   ./update-service.sh --build             # source mode (rebuild here)

SERVICE_NAME="ontoloviz"
APP_HOME="${ONTOLOVIZ_APP_HOME:-/opt/ontoloviz}"
VENV="$APP_HOME/venv"
ENV_FILE="${ONTOLOVIZ_ENV_FILE:-/etc/ontoloviz.env}"

if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: do not run as root. Run as the service user; sudo is used per-command." >&2
    exit 1
fi

WHEEL=""
if [ "${1:-}" = "--build" ]; then
    # --- source mode: rebuild bundle + wheel here (needs Node + pnpm + uv) --
    for tool in git node pnpm uv; do
        command -v "$tool" >/dev/null 2>&1 || {
            echo "ERROR: --build needs '$tool' on PATH. Install node + pnpm (corepack) + uv." >&2
            exit 1
        }
    done
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
        echo "WARNING: on branch '${branch}', not main/master."
        read -rp "Continue? [y/N] " confirm
        [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
    fi
    git pull
    # Sync frontend deps to the (possibly updated) lockfile before building.
    # The relative-base build is mount-point agnostic, so no VITE_BASE is needed.
    ( cd web && pnpm install --frozen-lockfile )
    make build   # build-web (pnpm) THEN build-wheel — order matters
    WHEEL="$(ls -t dist/*.whl 2>/dev/null | head -1 || true)"
else
    WHEEL="${1:-}"
    if [ -z "$WHEEL" ]; then
        WHEEL="$(ls -t dist/*.whl 2>/dev/null | head -1 || true)"
    fi
fi

if [ -z "$WHEEL" ] || [ ! -f "$WHEEL" ]; then
    echo "ERROR: no wheel found. Pass a path, drop one in ./dist/, or use --build." >&2
    exit 1
fi
echo "Installing wheel: $WHEEL"

if [ ! -w "$VENV/bin" ]; then
    echo "ERROR: cannot write to ${VENV}. Run this as the service user that owns ${APP_HOME}." >&2
    exit 1
fi
# Two steps so a same-version rebuild (new SPA bundle, unchanged /VERSION) still
# replaces the embedded files: first pick up any new/changed deps, then force the
# package contents to be reinstalled regardless of version.
"$VENV/bin/pip" install --quiet "$WHEEL"
"$VENV/bin/pip" install --quiet --force-reinstall --no-deps "$WHEEL"

sudo systemctl restart "$SERVICE_NAME"

# --- post-deploy healthcheck (same assertions as install) ------------------
H="127.0.0.1"; P="8000"
# shellcheck disable=SC1090
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
if [ -n "${ONTOLOVIZ_HOST:-}" ] && [ "${ONTOLOVIZ_HOST}" != "0.0.0.0" ]; then H="$ONTOLOVIZ_HOST"; fi
if [ -n "${ONTOLOVIZ_PORT:-}" ]; then P="$ONTOLOVIZ_PORT"; fi
BASE="http://${H}:${P}"

# The host-local healthcheck below passes even when a containerized/external
# reverse proxy can't reach the service. A 127.0.0.1 bind is unreachable via
# host.docker.internal and 502s at the proxy — warn loudly so it isn't missed.
if [ "${ONTOLOVIZ_HOST:-127.0.0.1}" = "127.0.0.1" ]; then
    echo "WARNING: ONTOLOVIZ_HOST=127.0.0.1 — a containerized/external reverse proxy"
    echo "         (e.g. nginx via host.docker.internal) cannot reach this and will 502."
    echo "         For a proxied deploy set ONTOLOVIZ_HOST=0.0.0.0 in ${ENV_FILE},"
    echo "         then: sudo systemctl restart ${SERVICE_NAME}"
fi

ok=0
for _ in $(seq 1 15); do
    if curl -fsS "${BASE}/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
done
if [ "$ok" -ne 1 ]; then
    echo "ERROR: /api/health down after restart. Inspect: journalctl -u ${SERVICE_NAME} -e" >&2
    exit 1
fi
if ! curl -fsS "${BASE}/" 2>/dev/null | grep -q 'index-[A-Za-z0-9]*\.js'; then
    echo "ERROR: server is up but the SPA bundle is NOT being served." >&2
    echo "       The wheel was built without the frontend (use 'make build', not 'uv build')." >&2
    exit 1
fi

echo "[OK] ${SERVICE_NAME} updated and serving the SPA at ${BASE}"
