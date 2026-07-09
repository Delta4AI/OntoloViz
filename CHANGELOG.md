# Changelog

## 3.0.4 — 2026-07-09

* Removed the unused `xlsx` (SheetJS) web dependency, eliminating its prototype-pollution and ReDoS advisories. `.xlsx`/`.tsv` uploads are parsed by the existing TSV reader and were never routed through this package.
* Upgraded the web build toolchain — Vite 5 → 8, Vitest 2 → 4, `@vitejs/plugin-react` 4 → 6 — clearing the Vite path-traversal / `server.fs.deny` bypass advisories, the critical Vitest UI-server RCE, and the transitive esbuild dev-server advisory.
* Pinned patched transitive dev dependencies via pnpm `overrides`: `form-data` ≥4.0.6 (CRLF injection), `ws` ≥8.21.0, and `js-yaml` ≥4.2.0 (quadratic-complexity DoS).
