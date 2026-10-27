import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { host: '0.0.0.0', port: 5173 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
