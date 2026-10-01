// Inlines the Vite build (single JS chunk) into one self-contained HTML file:
// dist/alley.html — playable from file:// or any static host.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)];
for (const m of scripts) {
  const file = path.join(dist, m[1].replace(/^\.\//, ''));
  const js = fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(m[0], () => `<script type="module">\n${js}\n</script>`);
}
// drop modulepreload links (everything is inline now)
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
fs.writeFileSync(path.join(dist, 'alley.html'), html);
console.log(`dist/alley.html  ${(html.length / 1024).toFixed(0)} KiB`);
