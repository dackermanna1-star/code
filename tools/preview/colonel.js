// Colonel contact sheets. ?part=sprite|portraits|cg|all (default all) &scale=3
//   ?part=one&cg=<id>&t=<s>&p=<json params>&scale=2   one CG frame, no chrome (for iteration shots)
//   ?part=vhs                                         the vhs_frames through the game's camcorder filter
//   ?part=bench                                       build timings (colonel_bench.js)
import { initColonel, getColonelSprite } from '../../src/art/colonel.js';
import { initColonelPortraits, getColonelPortrait, COLONEL_PORTRAIT_EXPRS, COLONEL_LIGHTS } from '../../src/art/portraits_colonel.js';
import { initColonelCg, getColonelCg, COLONEL_CG_IDS } from '../../src/art/cg_colonel.js';
import { PAL } from '../../src/art/palette.js';
import { makeCanvas, ctxOf, tinyText } from '../../src/art/util.js';

const q = new URLSearchParams(location.search);
const part = q.get('part') || 'all';
const root = document.getElementById('root');
const timings = {};

function label(text) { const d = document.createElement('div'); d.textContent = text; d.style.margin = '6px 0 2px'; root.appendChild(d); }
function show(c, scale = 1) {
  const out = document.createElement('canvas'); out.width = c.width * scale; out.height = c.height * scale;
  const x = out.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, out.width, out.height);
  root.appendChild(out); return out;
}

// 24×32 human silhouette for scale (Tess-ish: red hair, denim)
function human() {
  const c = makeCanvas(24, 32), x = ctxOf(c);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  R(8, 4, 8, 9, PAL.hair_r); R(9, 6, 6, 6, PAL.skin); R(7, 13, 10, 9, PAL.denim); R(9, 13, 6, 3, PAL.ink);
  R(8, 22, 3, 7, PAL.ink); R(13, 22, 3, 7, PAL.ink); R(8, 29, 3, 2, PAL.white); R(13, 29, 3, 2, PAL.white);
  R(6, 14, 2, 8, PAL.denim_d); R(16, 14, 2, 8, PAL.denim_d);
  return c;
}

function floorTile(x, w, h) { // lit linoleum checker
  for (let ty = 0; ty < h; ty += 8) for (let tx = 0; tx < w; tx += 8) {
    x.fillStyle = ((tx + ty) / 8) % 2 ? '#7d7a5c' : '#8f8b68'; x.fillRect(tx, ty, 8, 8);
  }
}

async function spriteSheet() {
  let t0 = performance.now();
  await initColonel();
  const sp = getColonelSprite();
  timings.sprite = Math.round(performance.now() - t0);
  const names = Object.keys(sp.anims);
  const S = Number(q.get('scale') || 3);
  const step = Number(q.get('step') || 1);
  const maxF = Math.max(...names.map((n) => Math.ceil(sp.anims[n].frames.length / step)));
  const filter = q.get('anims');
  const list = filter ? names.filter((n) => filter.split(',').some((f) => n.startsWith(f))) : names;
  for (const bg of (q.get('bg') || 'black,floor').split(',')) {
    label(`SPRITE on ${bg} — ${list.length} anims, frame 64×64, anchor (${sp.ax},${sp.ay})`);
    const cw = 64 * (maxF + 1) + 30, ch = list.length * 66;
    const c = makeCanvas(cw, ch), x = ctxOf(c);
    if (bg === 'floor') floorTile(x, cw, ch); else if (bg === 'dark') { x.fillStyle = '#0d0f17'; x.fillRect(0, 0, cw, ch); } else { x.fillStyle = '#000'; x.fillRect(0, 0, cw, ch); }
    list.forEach((n, row) => {
      const a = sp.anims[n];
      tinyText(x, 1, row * 66 + 2, n, bg === 'floor' ? '#222' : '#888');
      x.drawImage(human(), 2, row * 66 + 64 - 2 - 30);
      a.frames.filter((_, i) => i % step === 0).forEach((f, i) => {
        const ox = 30 + i * 64, oy = row * 66;
        x.drawImage(f, ox, oy);
        if (q.get('anchor')) { x.fillStyle = '#f0f'; x.fillRect(ox + sp.ax, oy + sp.ay, 1, 1); }
      });
    });
    show(c, S);
  }
}

async function zoom() {
  await initColonel();
  const sp = getColonelSprite();
  const list = (q.get('zoom') || 'idle_down:0,idle_up:0,idle_left:0,idle_right:0').split(',');
  const c = makeCanvas(list.length * 66, 66), x = ctxOf(c);
  x.fillStyle = q.get('zbg') || '#7d7a5c'; x.fillRect(0, 0, c.width, c.height);
  list.forEach((s, i) => { const [n, f] = s.split(':'); const a = sp.anims[n]; if (a) x.drawImage(a.frames[Number(f) % a.frames.length], i * 66 + 1, 1); });
  label('ZOOM ' + list.join(' '));
  show(c, Number(q.get('zscale') || 7));
}

async function darkTest() {
  // the game multiplies deep darkness over everything: simulate (dark blue multiply + flashlight pool)
  await initColonel();
  const sp = getColonelSprite();
  const W = 480, H = 140, c = makeCanvas(W, H), x = ctxOf(c);
  floorTile(x, W, H);
  const poses = ['idle_down', 'drag_left', 'idle_up', 'drag_right', 'lunge_down', 'mound', 'lectern_down', 'peek_left'];
  poses.forEach((n, i) => { if (sp.anims[n]) x.drawImage(sp.anims[n].frames[0], 4 + i * 59, 30); });
  x.drawImage(human(), 230, 60);
  const d = makeCanvas(W, H), dx = ctxOf(d);
  dx.fillStyle = '#16192a'; dx.fillRect(0, 0, W, H);
  // flashlight pool (crisp rings)
  const rings = [[80, '#2a2d40'], [62, '#4a4c5e'], [46, '#8a8a90'], [30, '#d8d2c4']];
  for (const [r, col] of rings) { dx.fillStyle = col; dx.beginPath(); dx.arc(300, 70, r, 0, 7); dx.fill(); }
  x.globalCompositeOperation = 'multiply'; x.drawImage(d, 0, 0); x.globalCompositeOperation = 'source-over';
  label('IN DARKNESS (simulated multiply + flashlight pool)');
  show(c, 3);
}

async function portraits() {
  const t0 = performance.now();
  await initColonelPortraits();
  const exprs = (q.get('expr') || COLONEL_PORTRAIT_EXPRS.join(',')).split(',');
  const lights = (q.get('light') || COLONEL_LIGHTS.join(',')).split(',');
  const S = Number(q.get('pscale') || 2);
  label(`PORTRAITS 96×120 (${S}x) — rows: ${exprs.join(', ')} · cols: ${lights.join(', ')}`);
  const c = makeCanvas(lights.length * 100, exprs.length * 124), x = ctxOf(c);
  x.fillStyle = '#1a1a22'; x.fillRect(0, 0, c.width, c.height);
  exprs.forEach((e, r) => lights.forEach((l, k) => x.drawImage(getColonelPortrait(e, { light: l }), k * 100 + 2, r * 124 + 2)));
  timings.portraits = Math.round(performance.now() - t0);
  if (q.get('crop')) { const [cx, cy, cw, ch] = q.get('crop').split(',').map(Number); const k = makeCanvas(cw * lights.length + 2 * lights.length, ch * exprs.length + 2 * exprs.length), kx = ctxOf(k); exprs.forEach((e, r) => lights.forEach((l, j) => kx.drawImage(getColonelPortrait(e, { light: l }), cx, cy, cw, ch, j * (cw + 2), r * (ch + 2), cw, ch))); show(k, Number(q.get('cropscale') || 8)); }
  else show(c, S);
}

async function cgs() {
  const t0 = performance.now();
  await initColonelCg();
  const only = q.get('cg');
  const S = Number(q.get('cscale') || 1);
  const sets = {
    colonel_hand: [{ t: 0, p: { dim: false } }, { t: 1.3, p: { dim: true } }, { t: 0, p: { light: 'red', dim: false } }, { t: 0, p: { reach: 0.6 } }, { t: 0, p: { slack: 0.6 } }],
    colonel_face: [{ t: 0, p: { lit: 1 } }, { t: 1, p: { lit: 0.5 } }, { t: 2.2, p: { lit: 0.15 } }, { t: 3.25, p: { lit: 1 } }],
    locker_slits: q.get('lk') ? q.get('lk').split(';').map((v) => { const [ph, fi, tt] = v.split(',').map(Number); return { t: tt || 0, p: { phase: ph, faceIn: fi } }; }) : [{ t: 0, p: { phase: 0.1, faceIn: 0 } }, { t: 0.5, p: { phase: 0.3, faceIn: 0 } }, { t: 1, p: { phase: 0.55, faceIn: 0 } }, { t: 1.4, p: { phase: 0.8, faceIn: 0 } }, { t: 2, p: { phase: 1, faceIn: 0.5 } }, { t: 3, p: { phase: 1, faceIn: 1 } }],
    vhs_frames: [0, 1, 2, 3, 4, 5].map((f) => ({ t: 0, p: { frame: f } })),
  };
  for (const id of COLONEL_CG_IDS) {
    if (only && !only.split(',').includes(id)) continue;
    const cg = getColonelCg(id);
    for (const s of sets[id]) {
      label(`${id} t=${s.t} ${JSON.stringify(s.p || {})}`);
      const c = makeCanvas(480, 270), x = ctxOf(c);
      const t1 = performance.now();
      cg.draw(x, s.t, s.p || {});
      timings[`${id}`] = (timings[id] || 0) + Math.round(performance.now() - t1);
      show(c, S);
    }
  }
  timings.cg = Math.round(performance.now() - t0);
}

// one CG frame, no chrome: ?part=one&cg=colonel_hand&t=0&p={"light":"red"}&scale=2
async function one() {
  await initColonelCg();
  const cg = getColonelCg(q.get('cg') || 'colonel_hand');
  const p = JSON.parse(q.get('p') || '{}'), t = Number(q.get('t') || 0);
  const c = makeCanvas(480, 270), x = ctxOf(c);
  const t1 = performance.now();
  cg.draw(x, t, p);
  timings.one = Math.round(performance.now() - t1);
  root.style.padding = '0';
  show(c, Number(q.get('scale') || 2));
}

// the VHS frames as the player sees them: through the game's camcorder filter, 2x, in a grid
async function vhsSheet() {
  const { vhsFilter } = await import('../../src/ui/vhsfx.js');
  const cg = getColonelCg('vhs_frames');
  const n = cg.frames || 5, S = 1;
  const grid = makeCanvas(480 * 2 * S + 10, Math.ceil(n / 2) * (270 * S + 10)), gx = ctxOf(grid);
  gx.fillStyle = '#000'; gx.fillRect(0, 0, grid.width, grid.height);
  for (let f = 0; f < n; f++) {
    const src = makeCanvas(480, 270), out = makeCanvas(480, 270), tmp = makeCanvas(480, 270);
    const x = ctxOf(src); x.fillStyle = '#000'; x.fillRect(0, 0, 480, 270);
    cg.draw(x, 0, { frame: f });
    vhsFilter(src, out, tmp, 1.3 + f, { strength: 1, pause: true });
    gx.drawImage(out, (f % 2) * (480 * S + 10), Math.floor(f / 2) * (270 * S + 10), 480 * S, 270 * S);
  }
  root.style.padding = '0';
  show(grid, Number(q.get('scale') || 1));
}

(async () => {
  try {
    if (part === 'one') await one();
    if (part === 'vhs') await vhsSheet();
    if (part === 'all' || part === 'sprite') await spriteSheet();
    if (part === 'bench') { const { bench } = await import('./colonel_bench.js'); console.log('bench ' + JSON.stringify(await bench())); }
    if (part === 'zoom') await zoom();
    if (part === 'all' || part === 'dark') await darkTest();
    if (part === 'all' || part === 'portraits') await portraits();
    if (part === 'all' || part === 'cg') await cgs();
  } catch (e) { console.error(e.stack || e); }
  console.log('timings ' + JSON.stringify(timings));
  window.__ready = true;
})();
