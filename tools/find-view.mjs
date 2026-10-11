// Dev tool (reference workflow): find where a screenshot was taken by rendering the original
// map (tools/preview/bsp.html + tools/serve-gamefiles.mjs, your own game files) from many
// viewpoints.
//
//   node tools/find-view.mjs <ref.png> <floors.json> [opts as key=value]
//     yaw=a,b      yaw search range (deg)          pitch=a,b   pitch range
//     region=x0,y0,x1,y1   candidate area          cell=64     candidate grid (units)
//     eye=53       eye height above the floor      mask=x0,y0,x1,y1(fractions) area to ignore (HUD/gun), repeatable via ';'
//
// Step 1 aligns yaw/pitch on the skybox alone (it sits at infinity, so only the view
// angles matter). Step 2 derives the screenshot's sky/geometry mask from that
// alignment. Step 3 scores every candidate eye position by silhouette IoU with the
// mask plus gradient correlation, then refines around the best ones.
// floors.json comes from tools/compare-bsp.mjs.
import { createRequire } from 'module';
import fs from 'fs';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [refPath, floorsPath, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map((s) => s.split('=')));
const num = (s) => s.split(',').map(Number);
const [yawA, yawB] = num(opt.yaw || '0,359');
const [pitA, pitB] = num(opt.pitch || '-10,10');
const eyeH = +(opt.eye || 53);
const cell = +(opt.cell || 64);
const region = opt.region ? num(opt.region) : null;
const masks = (opt.mask || '0.5,0.5,1,1;0,0,0.08,0.14;0,0.94,1,1').split(';').map(num);

const ident = execSync(`python3 -c "from PIL import Image;im=Image.open('${refPath}');print(im.width,im.height)"`).toString().trim().split(' ').map(Number);
const W = 192, H = Math.round(192 * ident[1] / ident[0]);
const refRaw = execSync(`python3 -c "
from PIL import Image;import sys
im=Image.open('${refPath}').convert('RGB').resize((${W},${H}),Image.BILINEAR)
sys.stdout.buffer.write(im.tobytes())"`);

const fl = JSON.parse(fs.readFileSync(floorsPath));
const [X0, , , Y1] = fl.bounds; const st = fl.step;
const cands = [];
for (let j = 0; j < fl.H; j += cell / st) for (let i = 0; i < fl.W; i += cell / st) {
  const x = X0 + (i + 0.5) * st, y = Y1 - (j + 0.5) * st;
  if (region && (x < region[0] || y < region[1] || x > region[2] || y > region[3])) continue;
  for (const z of fl.orig[j * fl.W + i]) cands.push([x, y, z]);
}

const browser = await playwright.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export function createHotContext(){return{accept(){},dispose(){},prune(){},invalidate(){},on(){},send(){}}};export function updateStyle(){};export function removeStyle(){};export function injectQuery(u){return u}' }));
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
await page.goto('http://localhost:5173/tools/preview/bsp.html?noloop=1');
await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });

// shared page-side helpers
await page.evaluate(({ ref, W, H, masks }) => {
  const n = W * H;
  window.__fv = {
    W, H, n,
    ref: new Float32Array(ref),
    keep: (() => { const k = new Uint8Array(n); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = x / W, v = y / H; k[y * W + x] = masks.some((m) => u >= m[0] && v >= m[1] && u <= m[2] && v <= m[3]) ? 0 : 1; } return k; })(),
    c2: Object.assign(document.createElement('canvas'), { width: W, height: H }),
    grab(eye, pitch, yaw, world) {
      const r = window.__r;
      for (const m of r.world.children) if (m !== window.__skybox) m.visible = world;
      window.__skybox.visible = true;
      r.setView(eye, pitch, yaw, 0);
      window.__skybox.userData.follow(eye);
      r.render(false);
      const ctx = this.c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(r.canvas, 0, 0, W, H);
      return ctx.getImageData(0, 0, W, H).data;
    },
    grabMask(eye, pitch, yaw) { // 1 where geometry covers the sky
      const r = window.__r;
      for (const m of r.world.children) m.visible = m !== window.__skybox;
      window.__skybox.visible = false;
      r.renderer.setClearColor(0x000000, 1);
      r.setView(eye, pitch, yaw, 0);
      r.render(false);
      const ctx = this.c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(r.canvas, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data, m = new Uint8Array(this.n);
      for (let i = 0; i < this.n; i++) m[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] > 6 ? 1 : 0;
      return { m, d };
    },
  };
}, { ref: Array.from(refRaw), W, H, masks });

// ---- step 1: sky alignment (upper part of the image, robust L1 on colour)
const sky = await page.evaluate(({ yawA, yawB, pitA, pitB }) => {
  const F = window.__fv, { W, H, n, ref, keep } = F;
  const score = (yaw, pitch) => {
    const d = F.grab([0, 0, 2000], pitch, yaw, false);
    const errs = [];
    for (let y = 0; y < H * 0.45; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!keep[i]) continue;
      errs.push(Math.abs(d[i * 4] - ref[i * 3]) + Math.abs(d[i * 4 + 1] - ref[i * 3 + 1]) + Math.abs(d[i * 4 + 2] - ref[i * 3 + 2]));
    }
    errs.sort((a, b) => a - b);
    let s = 0; const k = Math.floor(errs.length * 0.5); for (let i = 0; i < k; i++) s += errs[i]; // best half: ignores buildings
    return s / k;
  };
  let best = [1e9, 0, 0];
  for (let yaw = yawA; yaw <= yawB; yaw += 2) for (let p = pitA; p <= pitB; p += 2) { const s = score(yaw, p); if (s < best[0]) best = [s, yaw, p]; }
  for (let step of [0.5, 0.125]) {
    const [, by, bp] = best;
    for (let yaw = by - step * 4; yaw <= by + step * 4; yaw += step) for (let p = bp - step * 4; p <= bp + step * 4; p += step) { const s = score(yaw, p); if (s < best[0]) best = [s, yaw, p]; }
  }
  return best;
}, { yawA, yawB, pitA, pitB });
console.log(`sky alignment: yaw ${sky[1]} pitch ${sky[2]} (err ${sky[0].toFixed(1)})`);
const [, YAW, PITCH] = sky;

// ---- step 2: screenshot geometry mask = pixels that differ from the aligned skybox
const refMaskInfo = await page.evaluate(({ YAW, PITCH }) => {
  const F = window.__fv, { W, H, n, ref, keep } = F;
  const d = F.grab([0, 0, 2000], PITCH, YAW, false);
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = Math.abs(d[i * 4] - ref[i * 3]) + Math.abs(d[i * 4 + 1] - ref[i * 3 + 1]) + Math.abs(d[i * 4 + 2] - ref[i * 3 + 2]) > 60 ? 1 : 0;
  // fill downward: anything below a geometry pixel in the same column is geometry too
  for (let x = 0; x < W; x++) { let on = false; for (let y = 0; y < H; y++) { const i = y * W + x; if (m[i]) on = true; else if (on) m[i] = 1; } }
  F.refMask = m;
  let s = ''; for (let y = 0; y < H; y += 4) { for (let x = 0; x < W; x += 2) s += keep[y * W + x] ? (m[y * W + x] ? '#' : '.') : ' '; s += '\n'; }
  return s;
}, { YAW, PITCH });
console.log(refMaskInfo);

// ---- step 3: silhouette search
const scoreAll = (list, yaw, pitch) => page.evaluate(({ list, yaw, pitch, eyeH }) => {
  const F = window.__fv, { n, keep, refMask } = F;
  const out = [];
  for (const [x, y, z] of list) {
    const { m } = F.grabMask([x, y, z + eyeH], pitch, yaw);
    let inter = 0, uni = 0;
    for (let i = 0; i < n; i++) { if (!keep[i]) continue; const a = m[i], b = refMask[i]; if (a & b) inter++; if (a | b) uni++; }
    out.push([inter / (uni || 1), x, y, z]);
  }
  return out;
}, { list, yaw, pitch, eyeH });

let res = await scoreAll(cands, YAW, PITCH);
res.sort((a, b) => b[0] - a[0]);
console.log('coarse best:'); for (const r of res.slice(0, 8)) console.log('  ', r.map((v) => Math.round(v * 1000) / 1000).join(' '));
// refine around the top 5 with a finer grid (free-floating eye: floors can differ locally)
const fine = [];
for (const [, x, y, z] of res.slice(0, 5)) for (let dx = -48; dx <= 48; dx += 16) for (let dy = -48; dy <= 48; dy += 16) for (const dz of [-8, 0, 8]) fine.push([x + dx, y + dy, z + dz]);
res = await scoreAll(fine, YAW, PITCH);
res.sort((a, b) => b[0] - a[0]);
console.log('refined best:'); for (const r of res.slice(0, 8)) console.log('  ', r.map((v) => Math.round(v * 1000) / 1000).join(' '));
const [, bx, by, bz] = res[0];
console.log(`\nbest view: pos=${bx},${by},${bz} ang=${PITCH},${YAW}  (feet; eye +${eyeH})`);
await browser.close();
