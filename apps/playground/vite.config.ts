import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@nyven-stream/protocol": path.resolve(__dirname, "../../packages/protocol/src"),
      "@nyven-stream/core": path.resolve(__dirname, "../../packages/core/src"),
      "@nyven-stream/transport": path.resolve(__dirname, "../../packages/transport/src"),
      "@nyven-stream/adapters": path.resolve(__dirname, "../../packages/adapters/src"),
      "@nyven-stream/renderer": path.resolve(__dirname, "../../packages/renderer/src"),
      "@nyven-stream/renderer/styles.css": path.resolve(__dirname, "../../packages/renderer/src/styles.css"),
    },
  },
  server: {
    port: 5173,
  },
});
