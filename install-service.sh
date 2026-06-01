#!/usr/bin/env bash
set -euo pipefail

# OntoloViz — install as a systemd service (wheel-based; this host needs no Node).
#
# The server serves a PRE-BUILT SPA bundle embedded in the wheel. This script
# installs a wheel into a dedicated venv and registers a systemd unit, so no
# Node/pnpm is required here. The wheel MUST have been built with `make build`
# (build-web THEN build-wheel) — `uv build` alone omits the frontend bundle and
# the server would silently degrade to API-only (the post-deploy check catches
# this).
#
# Usage:
#   sudo ./install-service.sh [path/to/ontoloviz-<ver>.whl]
# With no argument, the newest dist/*.whl in this repo is used.
#
# Deployment config is injected via env (conventional defaults otherwise):
#   ONTOLOVIZ_HOST  bind address   (default 0.0.0.0 for proxied deploys; set 127.0.0.1 for host-local only)
#   ONTOLOVIZ_PORT  listen port    (default 8000)
#   ONTOLOVIZ_PROXY_HEADERS  trust X-Forwarded-* (default 0; set 1 behind TLS proxy)
# e.g. reverse-proxied deployment on a custom port:
#   sudo ONTOLOVIZ_HOST=0.0.0.0 ONTOLOVIZ_PORT=49317 ONTOLOVIZ_PROXY_HEADERS=1 ./install-service.sh

SERVICE_NAME="ontoloviz"
DESCRIPTION="OntoloViz web server (FastAPI + bundled SPA)"
APP_HOME="${ONTOLOVIZ_APP_HOME:-/opt/ontoloviz}"
VENV="$APP_HOME/venv"
ENV_FILE="${ONTOLOVIZ_ENV_FILE:-/etc/ontoloviz.env}"
UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: must run as root (use sudo)." >&2
    exit 1
fi

SERVICE_USER="${SUDO_USER:-}"
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    echo "ERROR: run via 'sudo' from a normal login user; the service must not run as root." >&2
    exit 1
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

# Deployment config — conventional defaults; override via env at install time.
# Default bind is 0.0.0.0 so a containerized/external reverse proxy can reach the
# service (e.g. nginx-in-Docker via host.docker.internal); exposure is then gated
# upstream by the firewall/VPN, not by this address. Set ONTOLOVIZ_HOST=127.0.0.1
# explicitly for a host-local-only deployment.
# Track whether each value was passed explicitly: an existing env file is
# write-once, so without this a re-run override (e.g. ONTOLOVIZ_PORT=49317) is
# silently ignored — the trap that strands the service on the wrong port/bind.
HOST_EXPLICIT="${ONTOLOVIZ_HOST+set}"
PORT_EXPLICIT="${ONTOLOVIZ_PORT+set}"
PROXY_EXPLICIT="${ONTOLOVIZ_PROXY_HEADERS+set}"
BIND="${ONTOLOVIZ_HOST:-0.0.0.0}"
PORT="${ONTOLOVIZ_PORT:-8000}"
PROXY_HEADERS="${ONTOLOVIZ_PROXY_HEADERS:-0}"

# --- locate the wheel ------------------------------------------------------
WHEEL="${1:-}"
if [ -z "$WHEEL" ]; then
    WHEEL="$(ls -t "$SCRIPT_DIR"/dist/*.whl 2>/dev/null | head -1 || true)"
fi
if [ -z "$WHEEL" ] || [ ! -f "$WHEEL" ]; then
    cat >&2 <<'EOF'
ERROR: no wheel found. Either:

  Build on this host first (as your normal user, NOT root):
    cd web && pnpm install            # one-time (needs node + pnpm + uv)
    make build                        # → dist/ontoloviz-<ver>-py3-none-any.whl
  then re-run this installer with sudo. (The relative-base build works under
  any reverse-proxy sub-path as-is — no VITE_BASE needed.)

  Or copy a CI/dev-built wheel into ./dist/, or pass its path:
    sudo ./install-service.sh /path/to/ontoloviz-<ver>.whl
EOF
    exit 1
fi
echo "Using wheel: $WHEEL"

# --- venv + install --------------------------------------------------------
# Create the venv with uv when available: uv seeds pip from its own bundled
# wheels, so this works even where the system lacks python3-venv/ensurepip
# (Debian/Ubuntu split that into a separate package, and `sudo` uses root's
# python, not your login shell's). --seed keeps pip inside the venv so
# update-service.sh's `pip install` path still works. `sudo` also strips the
# invoking user's PATH, so probe the usual per-user uv install locations.
# Falls back to the stdlib venv module on hosts that have python3-venv but no uv.
UV="$(command -v uv 2>/dev/null || true)"
if [ -z "$UV" ]; then
    USER_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
    for c in "$USER_HOME/.local/bin/uv" "$USER_HOME/.cargo/bin/uv" /usr/local/bin/uv /usr/bin/uv; do
        [ -x "$c" ] && { UV="$c"; break; }
    done
fi

if [ ! -d "$VENV" ]; then
    mkdir -p "$APP_HOME"
    if [ -n "$UV" ]; then
        "$UV" venv --seed "$VENV"
    else
        python3 -m venv "$VENV"
    fi || {
        echo "ERROR: could not create venv. Install uv, or on Debian/Ubuntu: apt install python3-venv" >&2
        exit 1
    }
fi
"$VENV/bin/pip" install --quiet --upgrade pip
# Two steps so a same-version rebuild (new SPA bundle, unchanged /VERSION) still
# replaces the embedded files: first pick up any new/changed deps, then force the
# package contents to be reinstalled regardless of version.
"$VENV/bin/pip" install --quiet "$WHEEL"
"$VENV/bin/pip" install --quiet --force-reinstall --no-deps "$WHEEL"
if [ ! -x "$VENV/bin/ontoloviz-server" ]; then
    echo "ERROR: wheel did not install the 'ontoloviz-server' entry point." >&2
    exit 1
fi

chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$APP_HOME"

# --- env file --------------------------------------------------------------
# Created once with the resolved values. On re-run we never clobber an
# operator-customized file; we only reconcile keys passed explicitly THIS run,
# so `sudo ONTOLOVIZ_HOST=0.0.0.0 ONTOLOVIZ_PORT=49317 ./install-service.sh`
# actually applies even though the file already exists.
reconcile_env_kv() {
    local key="$1" val="$2" explicit="$3"
    [ -n "$explicit" ] || return 0
    if grep -qE "^${key}=" "$ENV_FILE"; then
        grep -qxF "${key}=${val}" "$ENV_FILE" && return 0
        sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
    echo "  set ${key}=${val}"
}

if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<EOF
# OntoloViz server environment (written by install-service.sh).

# Bind address. 0.0.0.0 lets an external/dockerized reverse proxy connect;
# exposure is then controlled upstream (firewall / VPN), not by this address.
ONTOLOVIZ_HOST=${BIND}

# Listen port.
ONTOLOVIZ_PORT=${PORT}

# Trust X-Forwarded-* from a TLS-terminating proxy (correct scheme/redirects).
ONTOLOVIZ_PROXY_HEADERS=${PROXY_HEADERS}

# Keep a single worker: the /api/ontology handoff store is per-process, so
# multiple workers would 404 intermittently.
ONTOLOVIZ_WORKERS=1

# Comma-separated allowed CORS origins. Same-origin (SPA + API behind one
# proxy) needs none. Set only if a *different* origin calls the API directly —
# e.g. another app POSTing ontologies from its own domain.
# ONTOLOVIZ_CORS_ORIGINS=https://your-host.example.com
EOF
    chown "$SERVICE_USER":"$SERVICE_GROUP" "$ENV_FILE"
    chmod 640 "$ENV_FILE"
elif [ -n "$HOST_EXPLICIT$PORT_EXPLICIT$PROXY_EXPLICIT" ]; then
    echo "[..] reconciling explicit overrides into existing ${ENV_FILE}:"
    reconcile_env_kv ONTOLOVIZ_HOST "$BIND" "$HOST_EXPLICIT"
    reconcile_env_kv ONTOLOVIZ_PORT "$PORT" "$PORT_EXPLICIT"
    reconcile_env_kv ONTOLOVIZ_PROXY_HEADERS "$PROXY_HEADERS" "$PROXY_EXPLICIT"
fi

# --- compose the unit ------------------------------------------------------
read -r -d '' UNIT_CONTENT <<EOF || true
[Unit]
Description=${DESCRIPTION}
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${APP_HOME}
EnvironmentFile=-${ENV_FILE}
ExecStart=${VENV}/bin/ontoloviz-server
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_HOME}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# --- write unit (idempotent) + (re)start -----------------------------------
if [ -f "$UNIT" ] && printf '%s\n' "$UNIT_CONTENT" | cmp -s - "$UNIT" \
        && systemctl is-enabled --quiet "$SERVICE_NAME"; then
    echo "[OK] unit unchanged; reinstalled wheel, restarting."
    systemctl restart "$SERVICE_NAME"
else
    printf '%s\n' "$UNIT_CONTENT" > "$UNIT"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME"
fi

# --- post-deploy healthcheck (fail loudly on silent SPA degradation) -------
H="127.0.0.1"; P="8000"
# shellcheck disable=SC1090
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
if [ -n "${ONTOLOVIZ_HOST:-}" ] && [ "${ONTOLOVIZ_HOST}" != "0.0.0.0" ]; then H="$ONTOLOVIZ_HOST"; fi
if [ -n "${ONTOLOVIZ_PORT:-}" ]; then P="$ONTOLOVIZ_PORT"; fi
BASE="http://${H}:${P}"

echo "Waiting for ${BASE} ..."
ok=0
for _ in $(seq 1 15); do
    if curl -fsS "${BASE}/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
done
if [ "$ok" -ne 1 ]; then
    echo "ERROR: /api/health did not come up. Inspect: journalctl -u ${SERVICE_NAME} -e" >&2
    exit 1
fi
if ! curl -fsS "${BASE}/" 2>/dev/null | grep -q 'index-[A-Za-z0-9]*\.js'; then
    echo "ERROR: server is up but the SPA bundle is NOT being served." >&2
    echo "       The wheel was likely built without the frontend (use 'make build', not 'uv build')." >&2
    exit 1
fi

echo "[OK] ${SERVICE_NAME} is running and serving the SPA at ${BASE}"
echo
echo "  status:  systemctl status ${SERVICE_NAME}"
echo "  logs:    journalctl -u ${SERVICE_NAME} -f"
echo "  config:  ${ENV_FILE}  (edit, then: sudo systemctl restart ${SERVICE_NAME})"
echo "  update:  ./update-service.sh   (run as ${SERVICE_USER}, not root)"
echo "  remove:  sudo systemctl disable --now ${SERVICE_NAME} && sudo rm ${UNIT} && sudo systemctl daemon-reload"
