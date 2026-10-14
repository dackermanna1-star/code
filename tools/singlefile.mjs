// Packs the production build (dist/) into one self-contained HTML file that
// runs straight from disk (file://): the JS bundle and CSS are inlined and
// every sound and font is embedded as base64 (read by src/core/embedded.ts).
// Usage: npm run build:single   ->  release/SealHunter.html
import fs from 'node:fs';
import path from 'node:path';

const outFile = process.argv[2] ?? 'release/SealHunter.html';
const dist = process.argv[3] ?? 'dist';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// Embedded assets: everything copied from public/ (audio, fonts).
const assets = {};
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(wav|ttf)$/i.test(ent.name)) assets[path.relative(dist, full).split(path.sep).join('/')] = fs.readFileSync(full).toString('base64');
  }
};
walk(path.join(dist, 'audio'));
walk(path.join(dist, 'fonts'));

const scriptSafe = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/, (_, src) => {
  const code = fs.readFileSync(path.join(dist, src), 'utf8');
  return `<script type="module">${scriptSafe(code)}</script>`;
});
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/, (_, href) => {
  const css = fs.readFileSync(path.join(dist, href), 'utf8');
  return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
});
if (/src="\.\/|href="\.\//.test(html)) throw new Error('unresolved relative reference left in index.html');

// Base64 never contains '<', so the JSON is safe inside a script tag.
const assetScript = `<script>window.__SH_ASSETS=${JSON.stringify(assets)};</script>`;
html = html.replace('<head>', `<head>\n${assetScript}`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`${outFile}: ${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB, ${Object.keys(assets).length} embedded assets`);
