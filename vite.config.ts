import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 12000,
    assetsInlineLimit: 0,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
