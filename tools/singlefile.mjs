// Post-build: inline the bundled JS (and any CSS) into dist/index.html so the
// whole game is one self-contained HTML file that runs from file://.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.?\/?([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.?\/?([^"]+)">/g, (m, href) => `<style>${fs.readFileSync(path.join(dist, href), 'utf8')}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
const out = path.join(dist, 'dead-center.html');
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
