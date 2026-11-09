import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds the whole game into ONE self-contained HTML file (dist-single/index.html):
 * JS, CSS and the Havok physics .wasm (as a base64 data URL) are all inlined,
 * so it can be opened straight from disk or shared as a single file.
 */
export default defineConfig({
  base: "./",
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: "es2022",
    outDir: "dist-single",
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
  },
});
