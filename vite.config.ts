import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

// Every sandbox/*.html page is a standalone test scene for one subsystem.
const sandboxDir = resolve(__dirname, 'sandbox');
const sandboxPages: Record<string, string> = {};
if (existsSync(sandboxDir)) {
  for (const f of readdirSync(sandboxDir)) if (f.endsWith('.html')) sandboxPages['sandbox_' + f.replace('.html', '')] = resolve(sandboxDir, f);
}

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false, watch: { ignored: ['**/public/assets/**', '**/docs/**'] } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), ...sandboxPages } },
  },
  optimizeDeps: { exclude: [] },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
