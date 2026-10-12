import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: { host: true, port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
