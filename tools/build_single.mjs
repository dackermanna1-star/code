// Build a single self-contained HTML file (JS, CSS and 3D assets embedded).
// usage: npm run build:single   ->  standalone/walk-and-wardrobe.html
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });
const dist = path.join(root, 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// inline css
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/, (_, f) =>
  `<style>${fs.readFileSync(path.join(dist, f), 'utf8')}</style>`);

// embed assets as base64 -> blob URLs (decoded before the app starts)
const assetsDir = path.join(root, 'public', 'assets');
const files = ['character.glb', 'character.json', 'mocap.json', 'mocap.bin', ...fs.readdirSync(path.join(assetsDir, 'hair')).map((f) => 'hair/' + f)];
const parts = files.map((f) => {
  const b64 = fs.readFileSync(path.join(assetsDir, f)).toString('base64');
  const mime = f.endsWith('.json') ? 'application/json' : f.endsWith('.bin') ? 'application/octet-stream' : 'model/gltf-binary';
  return `${JSON.stringify(f)}:[${JSON.stringify(mime)},"${b64}"]`;
});
const loader = `<script>(function(){var d={${parts.join(',')}};window.__ASSETS={};for(var k in d){var s=atob(d[k][1]),n=s.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=s.charCodeAt(i);window.__ASSETS[k]=URL.createObjectURL(new Blob([u],{type:d[k][0]}));}})();</script>`;

// inline the app bundle (module script) after the asset loader
html = html.replace(/<script type="module" crossorigin src="\.?\/?(assets\/[^"]+\.js)"><\/script>/, (_, f) => {
  const js = fs.readFileSync(path.join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return loader + `<script type="module">${js}</script>`;
});
if (/src="\.?\/?assets\//.test(html)) throw new Error('unresolved asset reference in html');
const outDir = path.join(root, 'standalone');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'walk-and-wardrobe.html');
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
