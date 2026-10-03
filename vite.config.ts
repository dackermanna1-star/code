import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> dist/ (multi-file static site)
// `npm run build:single` -> dist-single/index.html (everything inlined, opens from file://)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  // NO_HMR=1 keeps scripted playtests from reloading while files change.
  server: { port: 5173, strictPort: false, hmr: process.env.NO_HMR ? false : undefined },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
