// Same as dev/vite.smoke.config.js, but lets Vite serve the fonts from a node_modules symlinked from outside the
// worktree (otherwise @fontsource files 403 and the UI renders with fallback fonts).
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const real = path.resolve('src/entities/vehicles/CarModels.js');
const nm = fs.existsSync('node_modules') ? fs.realpathSync('node_modules') : null;
export default defineConfig({
  resolve: {
    alias: fs.existsSync(real) ? [] : [{ find: /^.*vehicles\/CarModels\.js$/, replacement: path.resolve('dev/core-carstub.js') }],
  },
  server: { port: 5303, strictPort: true, hmr: false, fs: { allow: ['.', ...(nm ? [nm] : [])] } },
});
