# Deploy contract: help / deploy / status / logs / down
service := "ontoloviz"
branch := "main"
app_home := "/opt/ontoloviz"
venv := app_home / "venv"
env_file := "/etc/ontoloviz.env"

[private]
default: help

# list available recipes
help:
    @just --list --unsorted

# pull code, build, refresh unit, restart service, check it serves the SPA
deploy: pull build unit && verify
    sudo systemctl restart {{service}}

# show service status
status:
    systemctl status {{service}} --no-pager

# follow service logs
logs:
    journalctl -u {{service}} -f -n 100

# stop the service
[confirm]
down:
    sudo systemctl stop {{service}}

# fast-forward the deploy branch; fails as root, on another branch, or with local edits
[private]
pull:
    test "$(id -u)" -ne 0 || { echo "run just as your normal user, not root" >&2; exit 1; }
    test "$(git rev-parse --abbrev-ref HEAD)" = "{{branch}}" || { echo "not on {{branch}}" >&2; exit 1; }
    git pull --ff-only

# build the SPA + wheel and install it into the service venv
[private]
build:
    cd web && pnpm install --frozen-lockfile
    make build
    test -d {{venv}} || { sudo install -d -o "$(id -un)" -g "$(id -gn)" {{app_home}} && uv venv --seed {{venv}}; }
    # Two steps so a same-version rebuild still replaces the embedded SPA:
    # pick up changed deps, then force-reinstall the package files.
    {{venv}}/bin/pip install --quiet dist/ontoloviz-$(cat VERSION)-py3-none-any.whl
    {{venv}}/bin/pip install --quiet --force-reinstall --no-deps dist/ontoloviz-$(cat VERSION)-py3-none-any.whl

# install/refresh the versioned unit file, run as the deploying user
[private]
unit:
    sed "s/@USER@/$(id -un)/" deploy/{{service}}.service | sudo tee /etc/systemd/system/{{service}}.service >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable {{service}}

# wait for /api/health, then fail if the SPA bundle isn't served
[private]
verify:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -r {{env_file}} ]; then set -a; . {{env_file}}; set +a; fi
    host="${ONTOLOVIZ_HOST:-127.0.0.1}"
    if [ "$host" = 127.0.0.1 ]; then
        echo "WARNING: bound to 127.0.0.1; a dockerized reverse proxy can't reach it (set ONTOLOVIZ_HOST=0.0.0.0 in {{env_file}})" >&2
    fi
    [ "$host" != 0.0.0.0 ] || host=127.0.0.1
    base="http://${host}:${ONTOLOVIZ_PORT:-8000}"
    for _ in $(seq 15); do curl -fsS "$base/api/health" >/dev/null 2>&1 && break; sleep 1; done
    curl -fsS "$base/api/health" >/dev/null || { echo "/api/health is down; inspect: just logs" >&2; exit 1; }
    # Vite hashes use [A-Za-z0-9_-], e.g. index-Bz_kf-Qd.js
    curl -fsS "$base/" | grep -qE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' \
        || { echo "server is up but not serving the SPA bundle (wheel built without the frontend?)" >&2; exit 1; }
    echo "{{service}} is serving the SPA at $base"
