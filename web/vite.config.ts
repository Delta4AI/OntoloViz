import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Deployment base path. Default "/" (root / dedicated host). Set
// VITE_BASE=/ontoloviz/ when building for a sub-path reverse proxy so asset
// and API URLs resolve under that prefix. Must start and end with "/".
const BASE = process.env.VITE_BASE ?? "/";
// Dev server port + API proxy target. Conventional defaults; override via
// VITE_DEV_PORT / VITE_API_TARGET when a port is already taken locally.
const DEV_PORT = Number(process.env.VITE_DEV_PORT ?? 5173);
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
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
});
