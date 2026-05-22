# OntoloViz Server (V2 backend)

FastAPI backend for the V2 web app. Responsibilities:

- **`/api/health`** — frontend startup probe.
- **`/api/obo/*`** — CORS-safe OBO ontology fetch + parse (stub).
- **`/api/models/*`** — namespace reserved for future external model adapters.

Propagation does **not** run here. It runs in the browser (TypeScript) so that
exported interactive HTML works offline.

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
