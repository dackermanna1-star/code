import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Last Ferry is its own Vite app inside the Seal Hunter repo (shares node_modules).
export default defineConfig({
  root: __dirname,
  base: './',
  server: { host: '127.0.0.1', port: 5180 },
  preview: { host: '127.0.0.1', port: 4180 },
  build: {
    target: 'es2022',
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  test: {
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
