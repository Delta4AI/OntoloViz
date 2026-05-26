# syntax=docker/dockerfile:1.7

# --- Stage 1: build the web frontend ---------------------------------------
FROM node:20-bookworm-slim AS web-builder

WORKDIR /web
RUN corepack enable

COPY web/package.json web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY web/ ./
RUN pnpm build

# --- Stage 2: assemble the Python wheel ------------------------------------
FROM python:3.12-slim-bookworm AS wheel-builder

WORKDIR /src
RUN pip install --no-cache-dir build

COPY pyproject.toml MANIFEST.in VERSION README.md LICENSE ./
COPY src/ ./src/
COPY --from=web-builder /web/dist/ ./src/ontoloviz_server/web_dist/

RUN python -m build --wheel --outdir /wheels

# --- Stage 3: lean runtime --------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

# Run as non-root.
RUN useradd --create-home --uid 10001 ontoloviz
WORKDIR /home/ontoloviz

COPY --from=wheel-builder /wheels/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm -rf /tmp/*.whl

USER ontoloviz

ENV ONTOLOVIZ_HOST=0.0.0.0 \
    ONTOLOVIZ_PORT=8000 \
    ONTOLOVIZ_WORKERS=4 \
    ONTOLOVIZ_PROXY_HEADERS=1 \
    ONTOLOVIZ_LOG_LEVEL=info \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=3).status==200 else 1)"

ENTRYPOINT ["ontoloviz-server"]
