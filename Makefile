.PHONY: dev dev-web dev-server install test test-web test-server lint typecheck build clean

# --- Top-level dev loop ----------------------------------------------------

dev:
	@echo "Starting V2 frontend (web/) and backend (server/) concurrently..."
	@trap 'kill 0' INT TERM; \
	$(MAKE) -s dev-server & \
	$(MAKE) -s dev-web & \
	wait

dev-web:
	cd web && pnpm dev

dev-server:
	cd server && uv run ontoloviz-server

# --- Install ---------------------------------------------------------------

install:
	cd web && pnpm install
	cd server && uv sync --extra dev

# --- Tests -----------------------------------------------------------------

test: test-web test-server

test-web:
	cd web && pnpm test

test-server:
	cd server && uv run pytest -q

# --- Quality ---------------------------------------------------------------

lint:
	cd web && pnpm lint
	cd server && uv run ruff check .

typecheck:
	cd web && pnpm typecheck

# --- Build -----------------------------------------------------------------

build:
	cd web && pnpm build

# --- Cleanup ---------------------------------------------------------------

clean:
	rm -rf web/dist web/node_modules/.vite server/.pytest_cache server/.ruff_cache
