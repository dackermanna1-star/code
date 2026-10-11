// Dev tool (reference workflow): find where a screenshot was taken by rendering the original
// map (tools/preview/bsp.html + tools/serve-gamefiles.mjs, your own game files) from many
// viewpoints.
//
//   node tools/find-view.mjs <ref.png> <floors.json> [opts as key=value]
//     yaw=a,b      yaw search range (deg)          pitch=a,b   pitch range
//     region=x0,y0,x1,y1   candidate area          cell=64     candidate grid (units)
//     yawstep=5 pitchstep=4   eye=53 eye height above the floor
//         mask=x0,y0,x1,y1(fractions) area to ignore (HUD/gun), repeatable via ';'
//
// Every candidate pose (grid positions x yaw x pitch) is scored by locally normalised
// correlation with the screenshot (structure only, so lighting differences between
// engines don't matter); the best few are refined by coordinate descent.
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

// ---- joint search with locally normalised correlation (lighting-independent structure)
const yawStep = +(opt.yawstep || 5), pitchStep = +(opt.pitchstep || 4);
await page.evaluate(() => {
  const F = window.__fv, { W, H, n } = F;
  const R = 3; // 7x7 window
  F.lnc = (g) => {
    const I = new Float64Array((W + 1) * (H + 1)), I2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let s = 0, s2 = 0; for (let x = 0; x < W; x++) { const v = g[y * W + x]; s += v; s2 += v * v; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; I2[(y + 1) * (W + 1) + x + 1] = I2[y * (W + 1) + x + 1] + s2; } }
    const out = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const a = (y1 * (W + 1) + x1), b = (y0 * (W + 1) + x1), c = (y1 * (W + 1) + x0), d = (y0 * (W + 1) + x0);
      const cnt = (x1 - x0) * (y1 - y0);
      const m = (I[a] - I[b] - I[c] + I[d]) / cnt, m2 = (I2[a] - I2[b] - I2[c] + I2[d]) / cnt;
      out[y * W + x] = (g[y * W + x] - m) / (Math.sqrt(Math.max(0, m2 - m * m)) + 8);
    }
    return out;
  };
  const gr = new Float32Array(n); for (let i = 0; i < n; i++) gr[i] = F.ref[i * 3] * 0.299 + F.ref[i * 3 + 1] * 0.587 + F.ref[i * 3 + 2] * 0.114;
  F.refL = F.lnc(gr);
  // sky region of the screenshot by colour (blue sky / white clouds), and coarse edges
  const skyRef = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = F.ref[i * 3], g = F.ref[i * 3 + 1], b = F.ref[i * 3 + 2];
    skyRef[i] = (b > r + 12 && b > 110) || (r > 175 && g > 175 && b > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 40) ? 1 : 0;
  }
  F.skyRef = skyRef;
  const coarseEdges = (g) => {
    const cw = W >> 2, ch = H >> 2, e = new Float32Array(cw * ch);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; const m = Math.hypot(g[i + 1] - g[i - 1], g[i + W] - g[i - W]);
      e[(y >> 2) * cw + (x >> 2)] += m;
    }
    let mu = 0; for (const v of e) mu += v; mu /= e.length; let sd = 0; for (const v of e) sd += (v - mu) ** 2; sd = Math.sqrt(sd / e.length) || 1;
    for (let i = 0; i < e.length; i++) e[i] = (e[i] - mu) / sd;
    return e;
  };
  F.refE = coarseEdges(gr);
  const keepC = new Uint8Array((W >> 2) * (H >> 2)); for (let y = 0; y < H >> 2; y++) for (let x = 0; x < W >> 2; x++) keepC[y * (W >> 2) + x] = F.keep[(y * 4 + 2) * W + x * 4 + 2];
  F.score = (eye, pitch, yaw) => {
    const { m, d } = F.grabMask(eye, pitch, yaw); // geometry mask, world only
    let inter = 0, uni = 0;
    for (let i = 0; i < n; i++) { if (!F.keep[i]) continue; const a = 1 - m[i], b = F.skyRef[i]; if (a & b) inter++; if (a | b) uni++; }
    const g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    const e = coarseEdges(g);
    let s = 0, k = 0; for (let i = 0; i < e.length; i++) if (keepC[i]) { s += e[i] * F.refE[i]; k++; }
    return (uni ? inter / uni : 1) + 0.5 * s / k;
  };
});
const scoreList = (list) => page.evaluate((list) => list.map(([x, y, z, pitch, yaw]) => [window.__fv.score([x, y, z], pitch, yaw), x, y, z, pitch, yaw]), list);
const poses = [];
for (const [x, y, z] of cands) for (let yaw = yawA; yaw <= yawB; yaw += yawStep) for (let p = pitA; p <= pitB; p += pitchStep) poses.push([x, y, z + eyeH, p, yaw]);
console.log(`${cands.length} positions, ${poses.length} poses`);
let res = [];
for (let i = 0; i < poses.length; i += 500) res.push(...await scoreList(poses.slice(i, i + 500)));
res.sort((a, b) => b[0] - a[0]);
const fmt = (r) => `${r[0].toFixed(3)}  pos=${Math.round(r[1])},${Math.round(r[2])},${Math.round(r[3] - eyeH)} ang=${r[4]},${r[5]}`;
console.log('coarse:'); for (const r of res.slice(0, 8)) console.log('  ' + fmt(r));
// local refinement (coordinate descent) from the best few distinct starts
const starts = [];
for (const r of res) { if (starts.every((s) => Math.hypot(s[1] - r[1], s[2] - r[2]) > 96)) starts.push(r); if (starts.length >= 4) break; }
const final = [];
for (let best of starts) {
  const steps = [[32, 4], [16, 2], [8, 1], [4, 0.5]];
  for (const [dp, da] of steps) {
    let improved = true;
    while (improved) {
      improved = false;
      const [, x, y, z, p, yw] = best;
      const nb = [[x + dp, y, z, p, yw], [x - dp, y, z, p, yw], [x, y + dp, z, p, yw], [x, y - dp, z, p, yw], [x, y, z + dp / 2, p, yw], [x, y, z - dp / 2, p, yw], [x, y, z, p + da, yw], [x, y, z, p - da, yw], [x, y, z, p, yw + da], [x, y, z, p, yw - da]];
      const sc = await scoreList(nb);
      for (const s of sc) if (s[0] > best[0] + 1e-4) { best = s; improved = true; }
    }
  }
  final.push(best);
}
final.sort((a, b) => b[0] - a[0]);
console.log('refined:'); for (const r of final) console.log('  ' + fmt(r));
await browser.close();
