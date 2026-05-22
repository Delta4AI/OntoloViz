# OntoloViz Server

FastAPI backend for the OntoloViz web app.

## Endpoints

- `GET  /api/health` — startup probe used by the frontend.
- `POST /api/obo/parse` — parse an OBO document and return the ontology.
- `GET  /api/obo/fetch?url=…` — CORS-safe proxy that fetches an OBO file from
  a remote URL and returns the parsed result.
- `GET  /api/models/` — list registered external model adapters.
- `POST /api/models/predict` — request a ranked list from a registered adapter.

Propagation runs in the browser (TypeScript) so that exported interactive
HTML works offline. The server only handles ingestion and external adapters.

## Quickstart

```bash
cd server
uv sync --extra dev
uv run ontoloviz-server     # http://127.0.0.1:8000
```

OpenAPI docs at `http://127.0.0.1:8000/docs`.

## Tests

```bash
uv run pytest
```
