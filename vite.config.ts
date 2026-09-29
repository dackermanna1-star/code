import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000,
    cssCodeSplit: mode !== 'single',
    rollupOptions: mode === 'single' ? { output: { inlineDynamicImports: true } } : {},
  },
  server: { host: true, port: 5173 },
}));
