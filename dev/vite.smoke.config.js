import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const real = path.resolve('src/entities/vehicles/CarModels.js');
export default defineConfig({
  resolve: {
    alias: fs.existsSync(real) ? [] : [{ find: /^.*vehicles\/CarModels\.js$/, replacement: path.resolve('dev/core-carstub.js') }],
  },
  server: { port: 5198, strictPort: true, hmr: false },
});
