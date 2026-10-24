import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  server: { host: true },
});
