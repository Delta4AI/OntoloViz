/**
 * Base-path-aware URL helper.
 *
 * In production the SPA and its `/api/*` backend are one service served behind
 * a single origin — possibly under a sub-path when fronted by a reverse proxy
 * (e.g. `/ontoloviz/`). The build uses a relative base (`./`) by default, so
 * `import.meta.env.BASE_URL` is `"./"` and URLs resolve relative to the page —
 * the same bundle works at the root or any sub-path with no config. (An
 * absolute `VITE_BASE` like `/ontoloviz/` is also supported; it ends with `/`.)
 *
 * Every same-origin URL the app builds at runtime — API calls and `public/`
 * assets referenced from JSX (which Vite does NOT rewrite, unlike index.html) —
 * must go through {@link withBase} so it resolves correctly under any base.
 */
const BASE = import.meta.env.BASE_URL ?? "./";

/** Prefix a root-absolute path (e.g. `/api/health`, `/logo.svg`) with the app base. */
export function withBase(path: string): string {
  return BASE + path.replace(/^\/+/, "");
}
