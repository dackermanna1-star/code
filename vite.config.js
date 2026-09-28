import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';

// Mount the co-op relay (/net) on the dev and preview servers so hosting a
// game works out of the box with `npm run dev`.
const relay = () => ({
  name: 'coop-relay',
  configureServer(server) { if (server.httpServer) attachRelay(server.httpServer, '/net', (s) => console.log('[relay]', s)); },
  configurePreviewServer(server) { if (server.httpServer) attachRelay(server.httpServer, '/net', (s) => console.log('[relay]', s)); },
});

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [relay()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
});
