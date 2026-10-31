import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2022',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    copyPublicDir: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
