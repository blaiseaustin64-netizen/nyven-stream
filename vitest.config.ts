import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/**/src/**/*.{test,spec}.{ts,js}",
      "packages/**/__tests__/**/*.{test,spec}.{ts,js}",
      "apps/**/src/**/*.{test,spec}.{ts,js}",
      "tests/**/*.{test,spec}.{ts,js}",
    ],
    testTimeout: 15_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@nyven-stream/protocol": path.resolve(__dirname, "packages/protocol/src"),
      "@nyven-stream/core": path.resolve(__dirname, "packages/core/src"),
      "@nyven-stream/transport": path.resolve(__dirname, "packages/transport/src"),
    },
  },
});
