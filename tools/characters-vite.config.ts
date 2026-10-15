// Dev-server config for the Characters agent's automated tests: same as vite.config.ts but with HMR off
// (other agents edit files concurrently; full-page reloads would kill running Playwright sessions) and
// public/assets watched so newly delivered assets are served without a restart.
// Usage: npx vite --config tools/characters-vite.config.ts --port 5202 --strictPort
import base from '../vite.config';

const b = base as Record<string, any>;
export default {
  ...b,
  server: { ...(b.server ?? {}), hmr: false, watch: { ignored: ['**/docs/**', '**/node_modules/**'] } },
};
