// Dev server for automated tests: no HMR reloads from files being edited elsewhere.
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { port: 5180, hmr: false, watch: { ignored: ['**/src/audio/**', '**/tests/**'] } },
});
