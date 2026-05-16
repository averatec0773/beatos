import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/renderer/src/test/setup.ts"],
    globals: true,
    include: ["src/renderer/src/**/*.test.{ts,tsx}", "src/main/**/*.test.ts", "src/shared/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src/renderer/src"),
    },
  },
});
