// Builds the game and inlines everything (JS, CSS, fonts) into one self-contained HTML file:
//   npm run build:single   ->  release/DeadCounty.html  (open it directly in Chrome / Edge / Firefox, no server needed)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

const dist = path.join(root, 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assets = path.join(dist, 'assets');
const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml' };

// CSS: inline, with font files turned into data URIs
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/g, (_, file) => {
  let css = fs.readFileSync(path.join(assets, file), 'utf8');
  css = css.replace(/url\((?:\.\/)?([^)'"]+\.(woff2?|png|svg))\)/g, (m, f) => {
    const p = path.join(assets, path.basename(f));
    if (!fs.existsSync(p)) return m;
    return `url(data:${MIME[path.extname(p)]};base64,${fs.readFileSync(p).toString('base64')})`;
  });
  return `<style>${css}</style>`;
});

// JS: inline as a module script (escape any closing script tags inside the bundle)
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/g, (_, file) => {
  const js = fs.readFileSync(path.join(assets, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});

// the module script must run after #game / #ui exist: move it to the end of <body>
const m = html.match(/<script type="module">[\s\S]*?<\/script>/);
if (m) {
  const i = html.indexOf(m[0]);
  html = html.slice(0, i) + html.slice(i + m[0].length);
  const j = html.lastIndexOf('</body>');
  html = html.slice(0, j) + m[0] + '\n' + html.slice(j);
}

const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'DeadCounty.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
