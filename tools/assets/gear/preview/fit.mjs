// Fit check render: node tools/assets/gear/preview/fit.mjs <out.png> --char a.glb,b.glb --gear "file@x,y,z;file2@Bone:x,y,z"
//   (x,y,z = root-space position, or Bone:x,y,z = offset from that bone's rest position, e.g. helmet_2.glb@Head:0,0.1,0.008)
//   [--views front,side,back,q34] [--box x0,y0,z0,x1,y1,z1] [--w 360 --h 420]   (paths relative to the cwd; files outside the repo are served too)
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const a = process.argv.slice(2); const out = a[0];
const o = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const fix = (f) => { const a = path.resolve(f); return a.startsWith(ROOT + '/') ? path.relative(ROOT, a) : '@abs' + a; };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const abs = u.startsWith('/@abs/');
  const p = abs ? u.slice(5) : path.join(ROOT, u);
  if (abs && !p.endsWith('.glb')) { res.writeHead(404); res.end(); return; }
  if ((!abs && !p.startsWith(ROOT)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const chars = o('char', 'public/assets/characters/survivor_m_shirt.glb').split(',').map(fix).join(',');
const gearArg = o('gear', '').split(';').filter(Boolean).map(s => { const i = s.lastIndexOf('@'); return fix(s.slice(0, i)) + '@' + s.slice(i + 1); }).join(';');
const views = o('views', 'front,side,back,q34'); const w = +o('w', 360), h = +o('h', 420);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: w * views.split(',').length, height: h * chars.split(',').length } });
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/tools/assets/gear/preview/fit.html?char=${chars}&gear=${encodeURIComponent(gearArg)}&views=${views}&w=${w}&h=${h}&box=${o('box', '-0.35,0.9,-0.4,0.35,1.95,0.4')}`);
await page.waitForFunction(() => window.__done, null, { timeout: 600000, polling: 500 });
await page.screenshot({ path: out }); await browser.close(); server.close(); console.log('wrote', out);
