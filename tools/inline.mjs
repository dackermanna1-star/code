// Inline the production build (dist/) into one self-contained HTML file that runs from disk.
// Usage: npm run build:single   ->   ragdoll-lab.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const out = process.argv[3] || 'ragdoll-lab.html';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
let html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const f of files.filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(join(assets, f), 'utf8');
  html = html.replace(new RegExp(`<link rel="stylesheet"[^>]*${f}[^>]*>`), () => `<style>\n${css}\n</style>`);
}
for (const f of files.filter((f) => f.endsWith('.js'))) {
  const js = readFileSync(join(assets, f), 'utf8').replace(/<\/script/g, '<\\/script');
  html = html.replace(new RegExp(`<script type="module"[^>]*${f}[^>]*></script>`), () => `<script type="module">\n${js}\n</script>`);
}
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('some assets were not inlined');
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
