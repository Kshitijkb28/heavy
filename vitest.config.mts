import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // same switch as next.config.ts: CONTENT_FIXTURE runs the suite against a fixture
      "@content": path.resolve(import.meta.dirname, process.env.CONTENT_FIXTURE || "src/data/content.json"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
