// Render a labelled contact sheet of weapon GLBs (side + 3/4 view) with headless Chromium (SwiftShader WebGL).
//   node tools/assets/weapons/preview/contact_sheet.mjs <out.png> [--ids a,b,c] [--cols 2] [--w 640] [--h 260] [--markers 1] [--views side,q34]
// Markers: red = muzzle, green = sight_eye, blue = grip_support, yellow = rail_top, white = origin (firing-hand grip).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const args = process.argv.slice(2);
const out = args[0] || 'weapons_sheet.png';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/weapons/manifest.json'), 'utf8'));
const ids = (opt('ids', '') || manifest.weapons.map(w => w.id).join(',')).split(',');
const cols = +opt('cols', 2), w = +opt('w', 640), h = +opt('h', 260), views = opt('views', 'side,q34');
const nv = views.split(',').length;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = Math.ceil(ids.length / cols);
const page = await browser.newPage({ viewport: { width: w * nv * cols, height: h * rows } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const files = ids.map(i => i + '.glb').join(',');
await page.goto(`http://127.0.0.1:${port}/tools/assets/weapons/preview/sheet.html?files=${files}&views=${views}&w=${w}&h=${h}&cols=${cols}&markers=${opt('markers', '0')}`);
await page.waitForFunction(() => window.__done, null, { timeout: 900000, polling: 500 });
// labels
await page.evaluate(({ ids, cols, w, h, nv }) => {
  ids.forEach((id, i) => {
    const d = document.createElement('div');
    d.textContent = id;
    Object.assign(d.style, { position: 'absolute', left: (i % cols) * w * nv + 6 + 'px', top: Math.floor(i / cols) * h + 4 + 'px', font: '600 14px sans-serif', color: '#fff', textShadow: '0 1px 2px #000' });
    document.body.appendChild(d);
  });
}, { ids, cols, w, h, nv });
await page.screenshot({ path: out });
const info = await page.evaluate(() => window.__done);
for (const i of info) if (i.err) console.log('ERR', i.f, i.err);
await browser.close();
server.close();
console.log('wrote', out);
