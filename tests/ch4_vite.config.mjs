// Isolated dev server for Chapter 4 testing (port 5184): the campaign module is
// swapped for tests/ch4_campaign.js so other chapters being edited in parallel
// cannot break the build.
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export default defineConfig({
  root,
  base: './',
  server: { port: 5184, strictPort: true, hmr: false, watch: { ignored: ['**/src/audio/**', '**/tests/**'] } },
  plugins: [{
    name: 'ch4-campaign', enforce: 'pre',
    resolveId(src, importer) { if (src === './levels/campaign.js' && importer && importer.replace(/\\/g, '/').endsWith('src/session.js')) return path.join(root, 'tests/ch4_campaign.js'); return null; },
  }],
});
