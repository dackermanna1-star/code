import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        showdown: resolve(__dirname, 'showdown.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
