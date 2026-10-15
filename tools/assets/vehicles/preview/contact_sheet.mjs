// Render a labelled contact sheet of vehicle GLBs with headless Chromium (SwiftShader WebGL).
//   node tools/assets/vehicles/preview/contact_sheet.mjs <out.png> [--files a.glb,b.glb] [--base /public/assets/vehicles/]
//        [--views q34,rear34,side] [--cols 1] [--w 640] [--h 400] [--markers 1] [--hdri /abs/path.hdr] [--zoom 1]
// Markers: green = seat_*, yellow = light_*, red = exhaust, blue = steering_wheel/handlebar, magenta = prop_*, orange = ramp.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const args = process.argv.slice(2);
const out = args[0] || 'vehicles_sheet.png';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', '/public/assets/vehicles/');
let files = opt('files', '');
if (!files) {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/vehicles/manifest.json'), 'utf8'));
  files = man.vehicles.map(v => v.file).join(',');
}
const hdriPath = opt('hdri', process.env.VEH_HDRI || '');
const cols = +opt('cols', 1), w = +opt('w', 640), h = +opt('h', 400), views = opt('views', 'q34,rear34,side');
const nv = views.split(',').length;
const list = files.split(',');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let p;
  if (url.startsWith('/__hdri/')) p = hdriPath;
  else if (url.startsWith('/__abs/')) p = url.slice(6);
  else p = path.join(ROOT, url);
  if (!p || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = Math.ceil(list.length / cols);
const page = await browser.newPage({ viewport: { width: w * nv * cols, height: h * rows } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
const qs = new URLSearchParams({ files: list.join(','), base, views, w, h, cols, markers: opt('markers', '0'), zoom: opt('zoom', '1'), exposure: opt('exposure', '0.9'), envi: opt('envi', '0.8') });
await page.goto(`http://127.0.0.1:${port}/tools/assets/vehicles/preview/sheet.html?${qs}`);
await page.waitForFunction(() => window.__done, null, { timeout: 1800000, polling: 500 });
await page.evaluate(({ list, cols, w, h, nv }) => {
  list.forEach((id, i) => {
    const d = document.createElement('div');
    d.textContent = id.replace('.glb', '');
    Object.assign(d.style, { position: 'absolute', left: (i % cols) * w * nv + 8 + 'px', top: Math.floor(i / cols) * h + 6 + 'px', font: '600 15px sans-serif', color: '#fff', textShadow: '0 1px 3px #000' });
    document.body.appendChild(d);
  });
}, { list, cols, w, h, nv });
await page.screenshot({ path: out });
const info = await page.evaluate(() => window.__done);
for (const i of info) console.log(i.err ? `ERR ${i.f} ${i.err}` : `${i.f} tris=${i.tris} draws=${i.draws} size=${i.size}`);
await browser.close();
server.close();
console.log('wrote', out);
