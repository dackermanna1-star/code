// Post-build step: inline the bundled JS and CSS into a single HTML file
// (dist/wreckfield.html) that runs from any static host or from disk.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const htmlPath = join(dist, 'index.html');
if (!existsSync(htmlPath)) {
  console.error('dist/index.html not found; run vite build first');
  process.exit(1);
}
let html = readFileSync(htmlPath, 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_m, src) => {
  const code = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${code}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="(\.\/assets\/[^"]+)">/g, (_m, href) => {
  const css = readFileSync(join(dist, href), 'utf8');
  return `<style>${css}</style>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const out = join(dist, 'wreckfield.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB)`);
