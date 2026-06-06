import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone browser build of the same renderer. electron-vite is NOT used here;
// this is a plain Vite SPA whose output the FastAPI sidecar serves at "/".
// In dev, `/api` and `/mcp` proxy to the sidecar running on BEATOS_HTTP_PORT=8765.
const SIDECAR = process.env.BEATOS_SIDECAR_ORIGIN ?? "http://127.0.0.1:8765";

export default defineConfig({
  root: resolve("src/renderer"),
  base: "./",
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@": resolve("src/renderer/src"),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve("out/web"),
    emptyOutDir: true,
  },
  server: {
    // Fixed port so the proxy config and any bookmarked dev URL stay stable;
    // strictPort fails fast if 5173 is taken rather than silently moving.
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: SIDECAR, changeOrigin: true },
      "/mcp": { target: SIDECAR, changeOrigin: true, ws: true },
    },
  },
});
