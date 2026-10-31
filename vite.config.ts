import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> regular multi-file build in dist/
// `npm run build:single` -> one self-contained HTML file in dist-single/ (easy to share / host anywhere)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    sourcemap: mode !== 'single',
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
}));
