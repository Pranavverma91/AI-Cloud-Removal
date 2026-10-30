import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("frontend") } },
  test: {
    include: ["frontend/tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["frontend/tests/setup.ts"],
  },
});
