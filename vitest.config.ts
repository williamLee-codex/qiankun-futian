import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["artifacts/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**"],
  },
});
