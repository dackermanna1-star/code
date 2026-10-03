import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> dist/ (multi-file static site)
// `npm run build:single` -> dist-single/index.html (everything inlined, opens from file://)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  server: { port: 5173, strictPort: false, hmr: process.env.NO_HMR || process.env.MUNCH_SHIMS ? false : undefined },
  // MUNCH_SHIMS=1 swaps in tiny dev stand-ins for modules that are still being written.
  resolve: process.env.MUNCH_SHIMS
    ? {
        alias: [
          { find: /^.*\/food\/process$/, replacement: '/src/dev/shims/process.ts' },
          { find: /^(\.\.\/)+recipes$/, replacement: '/src/dev/shims/recipes.ts' },
        ],
      }
    : undefined,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
