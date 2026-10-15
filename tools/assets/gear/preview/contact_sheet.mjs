// Render a labelled contact sheet of GLBs with headless Chromium (SwiftShader WebGL).
//   node tools/assets/gear/preview/contact_sheet.mjs <out.png> <file.glb> [file2.glb ...] [--cols 3] [--w 360] [--h 300]
//        [--views q34,side] [--markers 1] [--bg 8a8d90]
//   File paths are relative to the repo root (e.g. public/assets/gear/helmet_2.glb); globs are not expanded.
// Markers: green = eye/sight_eye, cyan = lens mesh, red = muzzle, blue = grip_support, yellow = mount, white = origin.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const argv = process.argv.slice(2);
const opts = {}; const pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { opts[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]); }
const out = pos.shift();
const files = pos.map(f => { const a = path.resolve(f); return a.startsWith(ROOT + '/') ? path.relative(ROOT, a) : '@abs' + a; });
const cols = +(opts.cols || 3), w = +(opts.w || 360), h = +(opts.h || 300), views = opts.views || 'q34,side';
const nv = views.split(',').length;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.gltf': 'model/gltf+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const absOk = u.startsWith('/@abs/') && files.includes(u.slice(1));
  const p = absOk ? u.slice(5) : path.join(ROOT, u);
  if ((!absOk && !p.startsWith(ROOT)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = Math.ceil(files.length / cols);
const page = await browser.newPage({ viewport: { width: w * nv * Math.min(cols, files.length), height: h * rows } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/tools/assets/gear/preview/sheet.html?files=${files.join(',')}&views=${views}&w=${w}&h=${h}&cols=${Math.min(cols, files.length)}&markers=${opts.markers || '0'}&bg=${opts.bg || '8a8d90'}`);
await page.waitForFunction(() => window.__done, null, { timeout: 1800000, polling: 500 });
const info = await page.evaluate(() => window.__done);
await page.evaluate(({ info, cols, w, h, nv }) => {
  info.forEach((it, i) => {
    const d = document.createElement('div');
    d.textContent = `${it.f.split('/').pop().replace('.glb', '')}  ${it.err ? 'ERR' : (it.tris | 0) + ' tris  ' + it.size.join('x') + ' m'}`;
    Object.assign(d.style, { position: 'absolute', left: (i % cols) * w * nv + 6 + 'px', top: Math.floor(i / cols) * h + 4 + 'px', font: '600 13px sans-serif', color: '#fff', textShadow: '0 1px 2px #000' });
    document.body.appendChild(d);
  });
}, { info, cols: Math.min(cols, files.length), w, h, nv });
await page.screenshot({ path: out });
for (const i of info) console.log(i.err ? 'ERR ' + i.f + ' ' + i.err : `${i.f} tris=${i.tris} size=${i.size} min=${i.min} max=${i.max} nodes=${i.names.filter(Boolean).join('|')}`);
await browser.close();
server.close();
console.log('wrote', out);
