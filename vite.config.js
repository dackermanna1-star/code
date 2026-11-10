import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`            -> dist/ (regular static site, relative paths)
// `npm run build -- --mode single` -> dist-single/index.html (everything inlined in one file)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 6000,
    assetsInlineLimit: mode === 'single' ? 100000000 : 4096,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
