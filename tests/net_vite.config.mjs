// Separate no-HMR dev server (port 5190) with the co-op relay, for network tests.
import { defineConfig } from 'vite';
import { attachRelay } from '../server/relay.js';
export default defineConfig({
  root: new URL('..', import.meta.url).pathname,
  base: './',
  server: { port: 5190, strictPort: true, hmr: false, watch: { ignored: ['**/tests/**'] } },
  plugins: [{ name: 'coop-relay', configureServer(server) { if (server.httpServer) attachRelay(server.httpServer, '/net', (s) => console.log('[relay]', s)); } }],
});
