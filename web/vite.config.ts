import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Config is read from .env files merged with process.env (process.env wins).
// This lets a deployment persist its choices in a gitignored
// `web/.env.production.local` — e.g. `VITE_BASE=/ontoloviz/` — so a rebuild
// on the host always uses the right base without re-passing env vars.
//
//   VITE_BASE        deployment base path (default "./", relative — works at
//                    root or any sub-path). Set to an absolute path only to
//                    force it (e.g. CDN); must then start and end with "/".
//   VITE_DEV_PORT    dev server port (default 5173)
//   VITE_API_TARGET  dev /api proxy target (default http://127.0.0.1:8000)
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // Relative base by default → the build is mount-point agnostic: it works at
  // the root OR under any reverse-proxy sub-path (e.g. /ontoloviz/) with zero
  // config, because asset and API URLs resolve relative to the page. Set
  // VITE_BASE only to force an absolute base (e.g. assets on a CDN path).
  const BASE = env.VITE_BASE ?? "./";
  const DEV_PORT = Number(env.VITE_DEV_PORT ?? 5173);
  const API_TARGET = env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

  return {
    base: BASE,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: DEV_PORT,
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: [],
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts"],
    },
  };
});
