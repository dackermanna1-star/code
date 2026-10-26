import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html') } },
  },
  // NO_HMR=1 disables live reload (useful for headless screenshot tooling)
  server: { host: true, hmr: process.env.NO_HMR ? false : undefined },
});
