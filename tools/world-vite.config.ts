// Vite config for the World agent's dev server: same as the project config but with HMR disabled, so edits by
// other agents (which trigger full page reloads) do not interrupt long headless screenshot runs.
import base from '../vite.config';

const cfg = base as Record<string, any>;
export default {
  ...cfg,
  server: { ...(cfg.server ?? {}), hmr: false },
};
