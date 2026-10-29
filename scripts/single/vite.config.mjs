import { defineConfig } from "vite";
export default defineConfig({
  root: new URL("../..", import.meta.url).pathname,
  base: "./",
  publicDir: false,
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  worker: { format: "es", rollupOptions: { output: { inlineDynamicImports: true } } },
  build: {
    target: "es2022", sourcemap: false, chunkSizeWarningLimit: 50000, assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
