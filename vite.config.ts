import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // Havok ships its own .wasm next to the JS; excluding it from pre-bundling
  // keeps the relative wasm URL working in dev.
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
  server: { host: true },
});
