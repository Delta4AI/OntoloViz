# Changelog

## 3.0.5 — 2026-10-27

* **Breaking (deploy):** Replaced `install-service.sh` and `update-service.sh` with `just deploy`, which pulls `main`, builds the SPA and wheel on the host, installs the versioned unit `deploy/ontoloviz.service` and runs the healthcheck. The host now needs `just`, Node, pnpm and uv; installing a prebuilt wheel is no longer supported (roll back by deploying an older commit). Server config stays in `/etc/ontoloviz.env`, see `docs/RUNBOOK.md`.
* Upgraded server dependencies past known advisories: `anyio` (TLS host-name spoofing), `starlette` (form-limit DoS), `urllib3` (unbounded chunk buffering, ignored HTTPS-proxy TLS config) and `certifi`.
* Moved the web test runner to Vitest 4 and bumped Vite to 6.4.5 and PostCSS to 8.5.31, clearing the critical `tinypool` RCE advisories plus the Vitest mocker, Vite `launch-editor`/`server.fs.allow` and transitive build-tool advisories. Dev and build tooling only; nothing shipped to the browser changed.
* Node colors picked by hand in the data table now override the count-based color scale instead of being recolored straight away. They are cleared when a new ontology is loaded or the app is reset.
* Fixed the data table's color picker raising the loading overlay and recomputing the tree on every drag tick. The swatch now previews live, and the color is applied once when the picker closes.

## 3.0.4 — 2026-07-09

* Removed the unused `xlsx` (SheetJS) web dependency, eliminating its prototype-pollution and ReDoS advisories. `.xlsx`/`.tsv` uploads are parsed by the existing TSV reader and were never routed through this package.
* Upgraded the web build toolchain — Vite 5 → 6.4.3, Vitest 2 → 3.2 — clearing the Vite path-traversal / `server.fs.deny` bypass advisories, the critical Vitest UI-server RCE, and the transitive esbuild dev-server advisory.
* Pinned patched transitive dev dependencies via pnpm `overrides` (in `pnpm-workspace.yaml`): `form-data` ≥4.0.6 (CRLF injection), `ws` ≥8.21.0, and `js-yaml` ≥4.2.0 (quadratic-complexity DoS).
