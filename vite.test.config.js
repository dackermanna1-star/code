// Dev server for automated tests: no HMR reloads from files being edited elsewhere.
import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';
export default defineConfig({
  base: './',
  server: { port: 5180, hmr: false, watch: { ignored: ['**/src/audio/**', '**/tests/**'] } },
  plugins: [{ name: 'coop-relay', configureServer(server) { if (server.httpServer) attachRelay(server.httpServer, '/net'); } }],
});
