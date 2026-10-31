import { defineConfig } from 'vite';

// The Last Lookout game: its own page and bundle (npm run build:tower -> last-lookout.html).
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174 },
  build: {
    target: 'es2022', outDir: 'dist-tower', chunkSizeWarningLimit: 4000, modulePreload: false, assetsInlineLimit: 100000000,
    rollupOptions: { input: 'tower.html' },
  },
});
