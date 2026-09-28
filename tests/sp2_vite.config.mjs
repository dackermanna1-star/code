// Private dev server for tests/scen_specials2.mjs (no HMR; watches src/audio so audio edits are served fresh).
import { defineConfig } from 'vite';
export default defineConfig({ root: '/home/user/code', base: './', server: { port: 5187, hmr: false, watch: { ignored: ['**/tests/**', '**/src/levels/**'] } } });
