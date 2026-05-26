.PHONY: dev dev-web dev-server install test test-web test-server lint typecheck build build-web build-wheel clean parity-fixtures version set-version

# --- Top-level dev loop ----------------------------------------------------

dev:
	@echo "Starting frontend (web/) and backend (ontoloviz-server) concurrently..."
	@trap 'kill 0' INT TERM; \
	$(MAKE) -s dev-server & \
	$(MAKE) -s dev-web & \
	wait

dev-web:
	cd web && pnpm dev

# Backend runs out of the unified repo-root package. Editable installs do NOT
# auto-rebuild the JS bundle — Vite's dev server is the source of truth for
# the frontend in development; the SPA mount in main.py stays dormant when
# src/ontoloviz_server/web_dist/ is empty.
dev-server:
	uv run ontoloviz-server --dev

# --- Install ---------------------------------------------------------------

install:
	cd web && pnpm install
	uv sync --extra dev

# --- Tests -----------------------------------------------------------------

test: test-web test-server

test-web:
	cd web && pnpm test

test-server:
	uv run pytest -q

# --- Quality ---------------------------------------------------------------

lint:
	cd web && pnpm lint
	uv run ruff check .

typecheck:
	cd web && pnpm typecheck

# --- Build -----------------------------------------------------------------

# Full release build: compile the web frontend, embed it into the Python
# package, and produce wheel + sdist under ./dist/.
build: build-web build-wheel

build-web:
	cd web && pnpm build
	rm -rf src/ontoloviz_server/web_dist
	mkdir -p src/ontoloviz_server/web_dist
	cp -r web/dist/. src/ontoloviz_server/web_dist/

build-wheel:
	uv build

# --- Parity ----------------------------------------------------------------

# Regenerate JSON fixtures under web/tests/fixtures/parity/ from the
# Python reference (src/ontoloviz/core.py + tests/parity logic). Run after
# changing the propagation semantics in either language.
parity-fixtures:
	uv run python tests/parity/generate_fixtures.py

# --- Version ---------------------------------------------------------------

# Print the canonical version (root VERSION file is the source of truth).
# Both the wheel and web/package.json read it (statically or dynamically);
# pyproject.toml picks it up via [tool.setuptools.dynamic].
version:
	@cat VERSION

# Usage: make set-version VERSION=3.0.1
set-version:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make set-version VERSION=X.Y.Z"; exit 1; fi
	@echo "$(VERSION)" > VERSION
	@node -e "const f='web/package.json';const j=require('fs').readFileSync(f,'utf8');const o=JSON.parse(j);o.version='$(VERSION)';require('fs').writeFileSync(f,JSON.stringify(o,null,2)+'\n')"
	@echo "Version set to $(VERSION) (VERSION + web/package.json). pyproject.toml picks it up dynamically."

# --- Cleanup ---------------------------------------------------------------

clean:
	rm -rf web/dist web/node_modules/.vite
	rm -rf src/ontoloviz_server/web_dist
	rm -rf dist build src/ontoloviz.egg-info
	rm -rf .pytest_cache .ruff_cache .mypy_cache
