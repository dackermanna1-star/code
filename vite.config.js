import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  // NO_HMR=1 serves without live reload (stable headless screenshots while files change)
  server: { host: true, hmr: process.env.NO_HMR ? false : undefined },
});
