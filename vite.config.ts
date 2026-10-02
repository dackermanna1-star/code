import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
