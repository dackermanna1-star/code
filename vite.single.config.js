// Single-file build: everything (JS, CSS, mesh workers) inlined into one index.html, for
// sharing the game as a standalone page.
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 100000000,
  },
})
