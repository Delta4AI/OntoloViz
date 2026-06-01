# Sending an ontology to OntoloViz from another app

This is the contract another application uses to hand a fully-built ontology to
OntoloViz and have the web app render it. Your app builds the tree, `POST`s it
to the backend, gets back a short id, and opens the web app at
`?session=<id>`. The frontend fetches that id and draws the sunburst.

```
your app ──POST /api/ontology──▶ backend  ──▶ { "id": "<token>" }
   │
   └─ open browser: https://<ontoloviz-host>/?session=<token>
                              │
        frontend GET /api/ontology/<token> ──▶ render
```

No file upload, no OBO conversion: you send the same JSON structure the web app
builds internally, so propagation and rendering behave identically regardless
of source.

## The two endpoints

| Method & path                 | Body / params           | Returns                          |
| ----------------------------- | ----------------------- | -------------------------------- |
| `POST /api/ontology`          | an `Ontology` JSON body | `{ "id": "<token>" }`            |
| `GET  /api/ontology/{id}`     | —                       | the stored `Ontology`, or `404`  |

The live, machine-readable schema is always available from a running backend:

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON (for client codegen): `http://localhost:8000/openapi.json`

The schemas there are the source of truth — `Ontology`, `OntologySubtree`,
`OntologyNode`, and `CreateOntologyResponse`. This page documents the same
shape in prose.

## The `Ontology` payload

```jsonc
{
  "format": "parent-based",        // "parent-based" | "separator-based" | "atc"
  "countLabel": "Counts",          // column label shown in the UI (optional)
  "subtrees": {
    "<rootId>": {
      "rootId": "<rootId>",        // must equal the key
      "nodes": {
        "<nodeId>": { /* OntologyNode, keyed by its own id */ }
      }
    }
  },
  "nodeCount": 0,                  // total nodes across all subtrees
  "warnings": []                   // optional free-text notes surfaced in the UI
}
```

One ontology holds one or more **subtrees** (e.g. MeSH has 16 top-level
categories). Each subtree is a map of nodes keyed by node id, and exactly one
node is the root (its `parent` is `""`).

### `OntologyNode` fields

| Field         | Type    | Required | Meaning                                                         |
| ------------- | ------- | -------- | --------------------------------------------------------------- |
| `id`          | string  | yes      | Canonical node id (the map key).                                |
| `level`       | integer | yes      | Depth from the subtree root; the root is `0`.                   |
| `parent`      | string  | no       | Parent node id; `""` for the root. Defaults to `""`.            |
| `label`       | string  | no       | Display label. Defaults to the id if empty.                     |
| `count`       | number  | no       | Raw value before propagation. Defaults to `0`.                  |
| `description` | string  | no       | Long-form text shown in the tooltip.                            |
| `comment`     | string  | no       | Optional free-text comment (MeSH-style).                        |
| `color`       | string  | no       | `#RRGGBB` / `#RRGGBBAA` override; empty = default.              |
| `meshId`      | string  | no       | Original MeSH id for separator-based trees; empty otherwise.    |
| `synthetic`   | boolean | no       | `true` if synthesized to fill a gap in the parent chain.        |

Field names are **camelCase** on the wire (`nodeCount`, `countLabel`,
`rootId`, `meshId`). A minimal node is `{ "id": "x", "level": 0 }`.

## Example

A complete, valid two-node ontology lives at
[`examples/ontology-handoff-example.json`](./examples/ontology-handoff-example.json).

Push it and open the result (`$PORT` = whatever the server is bound to;
default `8000`, set via `ONTOLOVIZ_PORT`):

```bash
PORT=8000
# 1. POST the ontology, capture the id
ID=$(curl -s -X POST http://localhost:$PORT/api/ontology \
       -H 'Content-Type: application/json' \
       --data @docs/examples/ontology-handoff-example.json | jq -r .id)

# 2. Open OntoloViz on that handoff
echo "http://localhost:$PORT/?session=$ID"
```

In dev the frontend runs on Vite (`http://localhost:5173`) and proxies `/api`
to the backend (`http://127.0.0.1:8000`), so the link is
`http://localhost:5173/?session=$ID`. In a bundled production deployment the
SPA and API are **one service** sharing one origin (default `:8000`).

### Behind a reverse proxy (sub-path)

When fronted by a reverse proxy under a sub-path (e.g. `/ontoloviz/`), no
special build is needed — the default relative-base build resolves asset and
`/api` URLs relative to the page. Just have the proxy strip the prefix (nginx:
trailing-slash `proxy_pass`). Everything then lives under the one prefix:

```bash
# Another app pushes an ontology through the proxy and builds the open link:
ID=$(curl -s -X POST https://your-host/ontoloviz/api/ontology \
       -H 'Content-Type: application/json' \
       --data @ontology.json | jq -r .id)
echo "https://your-host/ontoloviz/?session=$ID"
```

A server-to-server POST needs no CORS. Only a browser POST from a *different*
origin does — set `ONTOLOVIZ_CORS_ORIGINS` then. See `install-service.sh` and
the repo deployment notes for the systemd + proxy wiring.

## Constraints

- **Transient.** A handoff expires ~1 hour after creation and is dropped on
  backend restart — it is a live handoff, not storage. Expired or unknown ids
  return `404`. Once the frontend loads a handoff it strips `?session=` from the
  URL so the token doesn't linger in history; like an upload, a reload starts
  fresh rather than re-fetching.
- **Single worker.** The handoff store lives in one process. Run the backend
  single-worker (the default); under multiple workers a handoff created on one
  worker is invisible to the others.
- **Capability token.** The id is a 128-bit `secrets.token_urlsafe` value;
  whoever holds the link can read the ontology. There is no per-user auth —
  put your own auth in front if you expose this beyond a trusted network.
- **Bounded store.** Only the most recent handful of handoffs are retained; the
  oldest is evicted past the cap. Don't rely on a handoff persisting after a
  newer batch.
- **Validated on ingest.** A payload that doesn't match the schema is rejected
  with `422` before anything is stored, so client integration errors surface
  immediately.
