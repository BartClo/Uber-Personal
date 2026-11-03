import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    // Defaults made explicit: silences vitest perf hints (pool/isolate) without changing behavior.
    pool: "forks",
    isolate: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
