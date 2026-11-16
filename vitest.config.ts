import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts?(x)", "games/*/test/**/*.test.ts?(x)"],
    environment: "node",
  },
});
