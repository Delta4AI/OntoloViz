# OntoloViz Web (V2)

Browser-based ontology visualization. The successor to the deleted Dash port.

## Stack

- Vite + React 18 + TypeScript (strict)
- D3 (`d3-hierarchy`, `d3-scale`, `d3-shape`) for layout math
- Canvas 2D for rendering (WebGL only if profiling demands it)
- Tailwind for styling
- Zustand for state
- papaparse + SheetJS for file parsing
- Vitest for tests

## Quickstart

```bash
cd web
pnpm install
pnpm dev          # http://localhost:5173 — proxies /api to FastAPI on :8000
```

Start the backend separately (see `../server/README.md`) or use `make dev` at
the repo root to run both concurrently.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Vite dev server with HMR                  |
| `pnpm build`     | Type-check + production build to `dist/`  |
| `pnpm preview`   | Preview the production build              |
| `pnpm typecheck` | `tsc --noEmit`                            |
| `pnpm lint`      | ESLint (zero warnings)                    |
| `pnpm format`    | Prettier write                            |
| `pnpm test`      | Vitest run                                |

## Layout

```
web/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/    # UI components
│   └── lib/           # Pure logic: parsing, propagation, color, layout
└── tests/             # Vitest specs; parity fixtures land here later
```

## Roadmap

The scaffold is intentionally bare. Subsequent phases:

1. TSV/XLSX parsing + data model
2. Propagation engine in TS (parity-tested against `src/ontoloviz/core.py`)
3. Single-tree renderer (D3 partition + Canvas) with zoom + breadcrumbs
4. Settings panel + color scale builder
5. Virtualized summary grid with linked hover/search
6. Exports: high-DPI PNG, SVG, self-contained interactive HTML
7. Backend OBO loader + future model API integration
