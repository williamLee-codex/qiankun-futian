import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./artifacts/qiankun-farm/src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    maxWorkers: 4,
    // Node's test runner owns the .mjs suites; running them in Vitest executes
    // their side effects but cannot collect their tests.
    exclude: ["**/node_modules/**", "**/*.mjs", "**/dist/**"],
  },
});
