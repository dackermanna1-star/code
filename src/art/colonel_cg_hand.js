// colonel_hand (Ch2 heads-down; Ch8 the Register under the mine-fire red): Tess's desk from just above.
// She is small and frightened — copper hair spilling over her folded denim arms, one squeezed-shut eye,
// a sliver of freckled cheek. Beside her face the Colonel's hand rests flat on the laminate: enormous
// (the back of it alone is bigger than her head), waxy, rings sunk into the flesh, yellowed nails, the
// wrist vanishing into a wet navy cuff stretched to bursting. The tube is up to the left: the hand's
// shadow falls across the desk toward her.
//
// Layers (cel-shaded through colonel_cg_cel.js): the background (desk + Tess, colonel_cg_desk.js / _tess.js) lit
// and in shadow; the hand + cuff + sleeve (colonel_cg_handkit.js), larger than the frame so it can slide
// in; the hand's cast-shadow mask and its contact with the desk. composeHand() puts them together for
// any reach / slack / breath / flicker state.
import { light, shadeCel, lightCel, quantize, outline, gradeLUT, packTones, bay, clamp, vn, celDef } from './colonel_cg_cel.js';
import { Cel } from './colonel_cg_cel.js';
import { CM, FLESHY, sculptHand, detailHand, paintNails, paintRings, sculptCuff, detailCuff, shadowMask, contactDist, patchLUT, isFlesh, liftHighlights } from './colonel_cg_handkit.js';
import { buildBackgroundGen, bgLUTPatch } from './colonel_cg_desk.js';
import { makeCanvas, ctxOf } from './util.js';

export { CM };
const W = 480, H = 270;

// ------------------------------------------------------------------------------------------ lights & grades
// the tube up to the left of the desk: the hand's shadow falls down and to the right, toward her
const L_FLUOR = [-0.32, -0.66, 0.68];
const FLUOR = light({ L: L_FLUOR, amb: 0.2, key: 0.86, shadow: 0.78, steps: 60,
  falloff: (x, y) => { const d = Math.hypot((x - 170) / 320, (y - 90) / 220); return clamp(1.1 - d * d * 0.9, 0.12, 1.08); } });
// the desk and Tess: the pool of the tube centred on her, falling to dark at the left edge and up under his cuff
const FLUOR_BG = light({ L: L_FLUOR, amb: 0.2, key: 0.86, shadow: 0.78, steps: 60,
  falloff: (x, y) => { const d = Math.hypot((x - 330) / 270, (y - 140) / 200); return clamp((0.98 - d * d * 0.6) * (0.94 + vn(x, y, 70, 5) * 0.12), 0.32, 0.95); } });
// the breaker's fire, from below and in front: everything lit from underneath, shadows thrown back up
const RED = light({ L: [0.2, 0.6, 0.78], amb: 0.03, key: 0.95, shadow: 0.86, steps: 40, rim: [0.15, 0.95, 0.5],
  falloff: (x, y) => { const d = Math.hypot((x - 240) / 300, (y - 250) / 230); return clamp((1.25 - d * d * 0.9) * (0.93 + vn(x, y, 60, 9) * 0.14), 0.06, 1.12); } });
// the same fire on the hand, without the falloff's mottling (its planes stay calm)
const RED_HAND = light({ L: [0.2, 0.6, 0.78], amb: 0.03, key: 0.95, shadow: 0.86, steps: 40, rim: [0.15, 0.95, 0.5],
  falloff: (x, y) => { const d = Math.hypot((x - 240) / 300, (y - 250) / 230); return clamp(1.25 - d * d * 0.9, 0.06, 1.12); } });
export const GRADES = {
  fluor: { lit: '#f6fff2', litGain: 1.0, dark: '#a8bcbc', darkGain: 1.0, desat: 0.06 },
  dim: { lit: '#d4ecd2', litGain: 0.9, dark: '#7a9494', darkGain: 0.9, desat: 0.18, shift: -1 },
  red: { lit: '#ff8448', litGain: 1.22, dark: '#6e0a06', darkGain: 0.72, desat: 0.72, crush: 0.62, abyss: '#0c0101' },
  redDim: { lit: '#f07040', litGain: 1.1, dark: '#5a0806', darkGain: 0.66, desat: 0.74, crush: 0.66, abyss: '#0a0101', shift: -1 },
  // the hand gone slack: the blood leaves it (applied to the hand layer only, mixed by slack)
  fluorDead: { lit: '#e0ece8', litGain: 0.94, dark: '#4a5a64', darkGain: 0.55, desat: 0.55 },
  redDead: { lit: '#d07050', litGain: 0.98, dark: '#3a0a0a', darkGain: 0.6, desat: 0.8, crush: 0.55, abyss: '#0e0202' },
};
export const LIGHTS = { fluor: FLUOR, red: RED };
const BG_LIGHTS = { fluor: FLUOR_BG, red: RED };
const CONTACT = { fluor: [10, 9, 10], red: [14, 2, 2] };

// ------------------------------------------------------------------------------------------ the pose
const ANG = (25 * Math.PI) / 180;
export const HAND_POSE = { C: [180, 92], ang: ANG, s: 1.12, side: 1, z0: 0, rings: { 3: 'signet', 2: 'stone' } };
const LAYER = { ox: -380, oy: -170, w: W + 380, h: H + 170 };
export const PROF = {};
const prof = (k, f) => { const a = performance.now(); const r = f(); PROF[k] = (PROF[k] || 0) + Math.round(performance.now() - a); return r; };

const state = { bg: null, hand: new Map(), mask: new Map(), contact: null, shaded: new Map(), gens: new Map() };

// the background, in one slice (a few tens of ms)
function* bgGen() {
  const g = buildBackgroundGen();
  for (;;) { const st = prof('bg', () => g.next()); if (st.done) { state.bg = st.value; break; } yield; }
}
/** The hand + cuff layer (larger than the frame, origin LAYER.ox/oy), in slices. */
function* handGen(swell) {
  const cel = new Cel(LAYER.w, LAYER.h, LAYER.ox, LAYER.oy);
  const S = prof('sculpt', () => sculptHand(cel, { ...HAND_POSE, swell: swell / 2 })); yield;
  const cf = prof('cuff', () => sculptCuff(cel, S, { box: [LAYER.ox, LAYER.oy, LAYER.ox + LAYER.w, LAYER.oy + LAYER.h] })); yield;
  prof('cuffdetail', () => detailCuff(cel, S, { edge: cf.edge })); yield;
  prof('handdetail', () => { detailHand(cel, S, { L: L_FLUOR, LR: RED.L }); paintRings(cel, S, { L: L_FLUOR }); paintNails(cel, S, { L: L_FLUOR }); }); yield;
  prof('handcav', () => cel.cavity(4, 0.03, 0.22));
  state.hand.set(swell, { cel, S });
}

/** The contact of the resting hand with the desk (layer coords): line (≤1 px) and the grease halo near the tips. */
function contactMap(cel, S) {
  const { w, h, mat, z } = cel;
  const low = (i) => isFlesh(mat[i]) && z[i] < 22;
  const D = contactDist(cel, low);
  const tips = [...S.fingers.map((f) => [f.tip, f.tipR * 1.5]), [S.thumb.tip, S.thumb.tipR * 1.4]];
  const tipSel = (i) => {
    if (!mat[i] || !(isFlesh(mat[i]) || mat[i] === CM.NAIL)) return false;
    const x = (i % w) + cel.ox, y = ((i / w) | 0) + cel.oy;
    return tips.some(([p, r]) => Math.hypot(x - p[0], y - p[1]) < r);
  };
  const DT = contactDist(cel, tipSel);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (mat[i]) continue;
    if (D[i] <= 1) out[i] = 1;
    else if (DT[i] > 1.5 && DT[i] <= 6.5) out[i] = DT[i] <= 4 ? 2 : 3;
  }
  return out;
}

const luts = new Map();
function lut(name) {
  if (!luts.has(name)) { const l = gradeLUT(GRADES[name]); patchLUT(l, name.startsWith('red'), name); bgLUTPatch(l, name); luts.set(name, l); }
  return luts.get(name);
}

/** Light a cel in horizontal bands (one slice each: the shadow march is the heavy part). Returns lev. */
function* lightBands(cel, lt, opts, bands) {
  const lev = new Float32Array(cel.w * cel.h), step = Math.ceil(cel.h / bands);
  for (let y0 = 0; y0 < cel.h; y0 += step) {
    const part = lightCel(cel, lt, { ...opts, rect: [0, y0, cel.w, Math.min(cel.h, y0 + step)] });
    lev.set(part.subarray(y0 * cel.w, Math.min(cel.h, y0 + step) * cel.w), y0 * cel.w);
    yield;
  }
  return lev;
}
/** Shaded background (lit + in the hand's shadow) for a light: packed tones — in slices. */
function* shadeBg(lightName) {
  const cel = state.bg, lt = BG_LIGHTS[lightName];
  const lev = yield* lightBands(cel, lt, lightName === 'red' ? { noCast: true } : { steps: 60 }, lightName === 'red' ? 1 : 3);
  const undo = liftHighlights(cel, lightName === 'red' ? 32 : 16, [CM.HAIR, CM.HAIR_D, CM.SKIN]);
  const lit = prof('bgshade', () => packTones(cel, outline(cel, quantize(cel, lev)).tone));
  undo(); yield;
  const undo2 = liftHighlights(cel, lightName === 'red' ? 32 : 16, [CM.HAIR, CM.HAIR_D, CM.SKIN]);
  const dark = prof('bgshadeD', () => {
    const sh = outline(cel, shadeCel(cel, { ...lt, key: lt.key * (1 - lt.shadow) }, { noCast: true }));
    // painted pixels (Tess's face, the cuff's opening, the button) don't relight: in his shadow they go two steps down
    for (let i = 0; i < sh.tone.length; i++) if (cel.fix[i] >= 0 && cel.mat[i] !== CM.DESK_EDGE) sh.tone[i] = Math.max(Math.min(sh.tone[i], 1), sh.tone[i] - 2);
    return packTones(cel, sh.tone);
  });
  undo2();
  state.shaded.set('bg|' + lightName, { lit, dark, z: cel.z });
}
function* shadeHand(swell, lightName) {
  const { cel } = state.hand.get(swell), red = lightName === 'red', lt = red ? RED_HAND : LIGHTS[lightName];
  const lev = yield* lightBands(cel, lt, { noCast: true }, 3);
  const undo = liftHighlights(cel, red ? 32 : 16);
  // under the fire the back of the hand is banded on a wider average (big calm planes, not carved wood)
  const FD = celDef(CM.FLESH), sm0 = FD.smooth;
  if (red) for (const m of FLESHY) celDef(m).smooth = 4;
  const sh = prof('handshade', () => outline(cel, quantize(cel, lev), { lit: 0.72 }));
  if (red) for (const m of FLESHY) celDef(m).smooth = sm0;
  undo();
  if (red) {
    const { w, h, mat, fix } = cel, T = sh.tone;
    // the knuckles are wet: a short specular streak on two crests goes to the top of the ramp
    for (let i = 0; i < T.length; i++) if ((cel.flag[i] & 128) && isFlesh(mat[i])) T[i] = 6;
    // the fire catches the cuff: a 2-px rim along the wool's edges that face it (its lip at the wrist, its lower
    // silhouette), so the arm goes on out of frame instead of ending in a glove's gauntlet
    const isW = (m) => m === CM.WOOL || m === CM.WOOL_W;
    const fd = [0.42, 0.91];
    for (let y = 2; y < h - 4; y++) for (let x = 2; x < w - 4; x++) {
      const i = y * w + x; if (!isW(mat[i]) || fix[i] === 0) continue;
      for (let k = 1; k <= 2; k++) {
        const j = (y + Math.round(fd[1] * k)) * w + x + Math.round(fd[0] * k);
        if (!isW(mat[j]) || fix[j] === 0) { T[i] = Math.max(T[i], k === 1 ? 5 : 4); break; }
      }
    }
    // ... and the big brass button's lower rim
    for (let i = 0; i < T.length; i++) if (mat[i] === CM.BRASS && (cel.flag[i] & 32)) T[i] = Math.max(T[i], 5);
  }
  state.shaded.set(`hand|${swell}|${lightName}`, { p: packTones(cel, sh.tone) });
}
function* prepGen(lightName) {
  if (!state.bg) yield* bgGen();
  if (!state.shaded.has('bg|' + lightName)) { yield* shadeBg(lightName); yield; }
  for (const sw of [1, 0, 2]) {
    if (!state.shaded.has(`hand|${sw}|${lightName}`)) {
      if (!state.hand.has(sw)) yield* handGen(sw);
      yield* shadeHand(sw, lightName); yield;
    }
    if (sw === 1 && !state.mask.has(lightName)) {
      const { cel, S } = state.hand.get(1);
      const m = prof('mask', () => shadowMask(cel, LIGHTS[lightName].L)); yield;
      if (!state.contact) { state.contact = prof('contact', () => contactMap(cel, S)); yield; }
      state.mask.set(lightName, m);
    }
  }
  state.hand.clear();      // the shaded tones stay; the heavy buffers are rebuilt if the other light is needed
}

// reach 0 → the hand is out of frame, back along its arm; 1 → resting
const HAND_DIR = [Math.cos(ANG), Math.sin(ANG)];
const OUT_DIST = 430;
export function handOffset(reach, slack) {
  const k = 1 - clamp(reach);
  const back = OUT_DIST * (k * k * (3 - 2 * k)) + clamp(slack) ** 1.6 * 150;
  return [Math.round(-HAND_DIR[0] * back), Math.round(-HAND_DIR[1] * back)];
}

/** A blend of two LUTs (packed RGBA per material/tone), cached by name and step. */
function lutBlend(a, b, t) {
  const key = `${a}>${b}|${t}`;
  if (luts.has(key)) return luts.get(key);
  const A = lut(a), B = lut(b), out = [];
  A.forEach((ra, id) => {
    if (!ra) return;
    const rb = B[id], o = new Uint32Array(ra.length);
    for (let k = 0; k < ra.length; k++) {
      const p = ra[k], q = rb[k], m = (sh) => Math.round(((p >>> sh) & 255) * (1 - t) + ((q >>> sh) & 255) * t);
      o[k] = ((255 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)) >>> 0;
    }
    out[id] = o;
  });
  luts.set(key, out);
  return out;
}

const bgRGBA = new Map();
function bgColors(lightName, gname) {
  const key = lightName + '|' + gname;
  if (bgRGBA.has(key)) return bgRGBA.get(key);
  const bg = state.shaded.get('bg|' + lightName), G = lut(gname), n = W * H;
  const mk = () => new Uint32Array(n);
  const lit = mk(), dark = mk(), lit1 = mk(), dark1 = mk(), up = mk(), dup = mk();
  const col = (v, d) => { if (!v) return 0; const m = v >> 8, row = G[m], t = Math.max(0, Math.min(row.length - 1, (v & 255) - d)); return row[t]; };
  for (let i = 0; i < n; i++) {
    lit[i] = col(bg.lit[i], 0); lit1[i] = col(bg.lit[i], 1); up[i] = col(bg.lit[i], -1);
    dark[i] = col(bg.dark[i], 0); dark1[i] = col(bg.dark[i], 1); dup[i] = col(bg.dark[i], -1);
  }
  const out = { lit: [lit, lit1, up], dark: [dark, dark1, dup] };
  bgRGBA.set(key, out);
  return out;
}

/**
 * Compose one frame. s: { light: 'fluor'|'red', dim: bool (flicker dip), swell: 0..2, reach, slack }.
 * Returns a canvas (the caller caches it).
 */
export function composeHand(s, into = null) {
  const lightName = s.light === 'red' ? 'red' : 'fluor';
  while (!handReady(lightName, 1)) prepHand(lightName);
  const sw = handReady(lightName, s.swell | 0) ? s.swell | 0 : 1;
  const bg = state.shaded.get('bg|' + lightName), hd = state.shaded.get(`hand|${sw}|${lightName}`), msk = state.mask.get(lightName), cov = msk.cov, occ = msk.occ, con = state.contact;
  const L = LIGHTS[lightName].L, px = -L[0] / L[2], py = -L[1] / L[2];
  const reach = s.reach ?? 1, slack = s.slack ?? 0;
  const [dx, dy] = handOffset(reach, slack);
  const gname = lightName === 'red' ? (s.dim ? 'redDim' : 'red') : (s.dim ? 'dim' : 'fluor');
  const G = lut(gname);
  const GH = slack > 0 ? lutBlend(gname, lightName === 'red' ? 'redDead' : 'fluorDead', Math.round(clamp(slack) * 8) / 8 * 0.9) : G;
  const BC = bgColors(lightName, gname);
  const [cr, cg, cb] = CONTACT[lightName], CC = ((255 << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
  const resting = dx === 0 && dy === 0;
  const c = into || makeCanvas(W, H), ctx = ctxOf(c);
  const img = ctx.createImageData(W, H), d = new Uint32Array(img.data.buffer);
  const lw = LAYER.w, lh = LAYER.h, lox = LAYER.ox, loy = LAYER.oy, zb = bg.z, hp = hd.p;
  for (let y = 0; y < H; y++) {
    const hy = y - dy - loy, rowH = hy >= 0 && hy < lh ? hy * lw : -1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // the hand layer, shifted by the reach offset
      if (rowH >= 0) {
        const hx = x - dx - lox;
        if (hx >= 0 && hx < lw) {
          const v = hp[rowH + hx];
          if (v) { d[i] = GH[v >> 8][v & 255]; continue; }
        }
      }
      // background: in the hand's shadow? (sample the plane mask where this surface's ray meets z = 0)
      const z = zb[i] > 0 ? zb[i] : 0;
      const mx = Math.round(x + px * z - dx - lox), my = Math.round(y + py * z - dy - loy);
      let set = BC.lit, k = 0;
      if (mx >= 0 && my >= 0 && mx < lw && my < lh) {
        const j = my * lw + mx, cv = cov[j];
        if (cv && z < occ[j] + 2 && (cv === 2 || bay(x, y) < 0.5)) set = BC.dark;     // (a receiver above the hand is not in its shadow)
      }
      // where the flesh meets the desk: a hard dark line; a faint grease halo around the resting tips
      if (z < 2 && slack < 0.2) {
        const hx = x - dx - lox, hy2 = y - dy - loy;
        if (hx >= 0 && hy2 >= 0 && hx < lw && hy2 < lh) {
          const q = con[hy2 * lw + hx];
          if (q === 1) { d[i] = CC; continue; }
          if (resting && q >= 2 && (q === 2 || bay(x, y) < 0.5)) k = 1;
        }
      }
      d[i] = set[k][i];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Background prep in slices (each call does one; a few tens of ms); returns true when all is built. */
export function prepHand(lightName = 'fluor') {
  if (handDone(lightName)) return true;
  let g = state.gens.get(lightName);
  if (!g) { g = prepGen(lightName); state.gens.set(lightName, g); }
  if (g.next().done) { state.gens.delete(lightName); return handDone(lightName); }
  return false;
}
function handDone(lightName) {
  return !!state.bg && state.mask.has(lightName) && !!state.contact && [0, 1, 2].every((sw) => state.shaded.has(`hand|${sw}|${lightName}`)) && state.shaded.has('bg|' + lightName);
}
export function handReady(lightName, swell) {
  return !!state.bg && state.shaded.has('bg|' + lightName) && state.shaded.has(`hand|${swell}|${lightName}`) && state.mask.has(lightName) && !!state.contact;
}
