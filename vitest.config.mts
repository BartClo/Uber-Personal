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
    // Las suites de integración limpian las mismas tablas: en paralelo se pisarían.
    fileParallelism: !process.env.SUPABASE_TEST_URL,
    setupFiles: ["./vitest.setup.ts"],
  },
});
