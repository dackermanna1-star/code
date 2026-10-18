// The Colonel's hand, as the CGs paint it (colonel_hand, vhs_frames 3, locker_slits' knocking fist).
// One kit so the motif stays the same everywhere: a corpulent right hand with a real thumb, a gold
// signet sunk into the little finger and a dark stone strangling the ring finger, thick yellowed nails.
//
// Discipline (the portraits' rules): ONE flesh ramp of 7 tones (waxy grey-pink; the top tone only where a
// highlight is placed), a cooler accent for the veins, a livid one for the congested finger, a liver-spot
// brown; hard cel bands on a light level smoothed over each surface first, no texture noise. The volume is
// a few big planes — the back of the hand a broad slab with four knuckle RIDGES along the bones (their
// highlights drawn 2 × 6 px along the bone, the valleys between them two steps down), tendons converging
// on the wrist; four fingers of different widths and lengths, fanned, the little one short and curled.
// Each finger's top runs level (one long highlight) while its silhouette narrows ~1 px a side between the
// joints, swells at the middle joint, tapers to ~75 % at the tip and squashes wider at the pad. Detail is
// placed, not sprinkled: over each middle joint an oval pocket of loose skin with 4-5 short broken lines
// (never across the whole finger), two faint ones at the end joint; horn nails ~62 % of the finger's width
// set into their folds; soft cool veins with a Y fork; a few small liver spots by the wrist and thumb; a
// few grey hairs; rings sunk 3 px wide into the flesh; the wrist's flesh rolling over the cuff in lobes.
//
// Coordinates: a pose puts the middle finger's knuckle at C (frame px), the fingers along `ang`, the
// thumb on the `side` (+1: thumb to the left of the fingers' way, i.e. a right hand seen from above).
// Local units (u along the fingers, v toward the thumb) are scaled by s.
import { HField } from './colonel_gbuf.js';
import { celMat, bay, vn, clamp, lerp, sstep, quad, inPoly, polyDist } from './colonel_cg_cel.js';
import { rng } from './util.js';
import { hexToRgb } from './palette.js';

// material ids (shared with the scenes that import CM)
export const CM = {
  DESK: 1, DESK_G: 2, FLOOR: 3, DESK_EDGE: 4, CARVE: 5,
  DENIM: 10, DENIM_D: 11, STITCH: 12, SKIN: 13, CHEEK: 14, FRECKLE: 15, HAIR: 16, LASH: 17, TNAIL: 18, HAIR_D: 19,
  FLESH: 20, VEIN: 21, SPOT: 22, NAIL: 23, GHAIR: 24, GOLD: 25, STONE: 26, HOTF: 27, HOTR: 28, FLESH_V: 29,
  WOOL: 30, WOOL_W: 31, BRASS: 32, VERD: 33, THREAD: 34,
  PENCIL: 40, PWOOD: 41, GRAPHITE: 42, ERASER: 43, FERRULE: 44, TBTN: 45, BROW: 46,
};
const mixh = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join(''); };
// the hand: waxy grey-pink, 7 tones. Bands: 1 deep turn · 2 shadow plane · 3 low mid · 4 crown · 5 lit plane ·
// 6 the waxy sheen (and the placed highlights); 0 is the outline.
export const FLESH_RAMP = ['#291a1e', '#4a3238', '#6b4d53', '#8c6c6c', '#ac8c88', '#ccb0a6', '#e6d2c6'];
const FL_TH = [0.15, 0.28, 0.42, 0.57, 0.75, 1.06];   // tone 6 only where a highlight is placed
const FL = { th: FL_TH, line: 0, lineLit: 1, gap: 2.6, seam: false, smooth: 2, clean: true, sgroup: CM.FLESH, spec: { at: 0.93, w: 0.05, k: 0.06 } };
celMat(CM.FLESH, { ramp: FLESH_RAMP, ...FL });
celMat(CM.VEIN, { ramp: FLESH_RAMP.map((c, i) => mixh(c, '#7c88b8', 0.34 - i * 0.03)), ...FL, line: null, spec: null });
celMat(CM.FLESH_V, { ramp: FLESH_RAMP.map((c) => mixh(c, '#6e4a6c', 0.32)), ...FL });
celMat(CM.SPOT, { ramp: FLESH_RAMP.map((c, i) => mixh(FLESH_RAMP[Math.max(0, i - 1)], '#8a6040', 0.42)), ...FL, line: null, spec: null });
// nails: yellowed horn (base #8e7a62 blending into the skin, mid #bca684, a lengthwise sheen)
celMat(CM.NAIL, { ramp: ['#2a1e14', '#4e4030', '#7a6a50', '#a08c68', '#c4b08a', '#dccaa4', '#eee2c4'], th: [0.16, 0.3, 0.45, 0.61, 0.79, 0.99], line: null, gap: 1.5, seam: false });
celMat(CM.GHAIR, { ramp: ['#1c1a1e', '#363238', '#545056', '#747072', '#949090', '#b4b0ac'], th: [0.18, 0.36, 0.56, 0.78, 1.0], seam: false });
celMat(CM.GOLD, { ramp: ['#1e1406', '#4a3510', '#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c'], th: [0.2, 0.4, 0.62, 0.86, 1.04], gap: 1, seam: false, spec: { at: 0.95, w: 0.05, k: 0.4 } });
celMat(CM.STONE, { ramp: ['#08030a', '#1a0812', '#30101e', '#4c1a2c', '#7a3a4c', '#a86a78'], th: [0.2, 0.42, 0.66, 0.9, 1.1], seam: false });
// hot pixels on the metal: HOTF burns only under the tube (a gold glint), HOTR only under the fire;
// their colours are patched per grade (patchLUT) — elsewhere they read as the gold around them
celMat(CM.HOTF, { ramp: ['#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c', '#fff4cc'], th: [0.2, 0.45, 0.7, 0.95], seam: false });
celMat(CM.HOTR, { ramp: ['#4a3510', '#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c'], th: [0.2, 0.45, 0.7, 0.95], seam: false });
// the cuff: navy wool, wet in places, tarnished brass
celMat(CM.WOOL, { ramp: ['#05070e', '#0e1426', '#1a2442', '#28365e', '#3c4e7c', '#56699a'], th: [0.14, 0.32, 0.54, 0.8, 1.02], line: 0, lineLit: 1, gap: 3, seam: false, smooth: 1 });
celMat(CM.WOOL_W, { ramp: ['#04050b', '#0a0f1e', '#141d36', '#213052', '#344a76', '#7488b8'], th: [0.14, 0.32, 0.54, 0.84, 0.99], line: 0, lineLit: 1, gap: 3, seam: false, smooth: 1, sgroup: CM.WOOL, spec: { at: 0.94, w: 0.04, k: 0.35 } });
celMat(CM.BRASS, { ramp: ['#140d05', '#33250e', '#5a4519', '#836a2c', '#a88c44', '#cdb46c'], th: [0.16, 0.36, 0.58, 0.82, 1.0], line: 0, gap: 1, seam: false, spec: { at: 0.95, w: 0.05, k: 0.45 } });
celMat(CM.VERD, { ramp: ['#0e1612', '#1c2c24', '#30483a', '#4a6652', '#68846c'], th: [0.2, 0.42, 0.66, 0.9], seam: false });
celMat(CM.THREAD, { ramp: ['#141418', '#2e2e36', '#4c4a52', '#6e6a6c', '#928c86'], th: [0.2, 0.42, 0.66, 0.9], seam: false });

export const FLESHY = [CM.FLESH, CM.VEIN, CM.SPOT, CM.FLESH_V];
const isFlesh = (m) => m === CM.FLESH || m === CM.VEIN || m === CM.SPOT || m === CM.FLESH_V;

/** Per-grade colours for the hot pixels (call on a LUT from gradeLUT). Under the fire the flesh gets its own
 * ramp with the mid-reds the grade would crush (else it posterizes into carved wood); name 'redDim' is the
 * flicker dip, 'redDead' the slack hand. */
const RED_FLESH = ['#120405', '#2a0909', '#46120e', '#641e14', '#842c1a', '#a83e22', '#d0602e', '#f08a44'];
export function patchLUT(lut, red, name = red ? 'red' : 'fluor') {
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
  const gold = lut[CM.GOLD];
  if (!gold) return lut;
  lut[CM.HOTF] = red ? Uint32Array.from([1, 2, 3, 3, 4].map((k) => gold[k])) : Uint32Array.from(['#8a6a2a', '#c09a48', '#e8cc78', '#fff0bc', '#fffbe8'].map(hex));
  lut[CM.HOTR] = red ? Uint32Array.from(['#c0602a', '#e88a3c', '#ffb050', '#ffc874', '#ffe0a0'].map(hex)) : Uint32Array.from([1, 2, 3, 3, 4].map((k) => gold[k]));
  if (!red) {
    const horn = ['#2a1e14', '#4e4030', '#7a6a50', '#a08c68', '#c4b08a', '#dccaa4', '#eee2c4'];
    const sh = name === 'dim' ? -1 : 0;
    lut[CM.NAIL] = Uint32Array.from(horn.map((_, k) => hex(horn[Math.max(0, Math.min(horn.length - 1, k + sh))])));
  }
  if (red) {
    const sh = name === 'redDim' ? 0 : 1, dead = name === 'redDead';
    const ramp = FLESH_RAMP.map((_, k) => RED_FLESH[Math.min(RED_FLESH.length - 1, k + sh)]).map((c) => (dead ? mixh(c, '#2a1414', 0.35) : c));
    lut[CM.FLESH] = Uint32Array.from(ramp.map(hex));
    lut[CM.VEIN] = Uint32Array.from(ramp.map((c, k) => hex(mixh(c, '#2a0c2a', 0.16 + k * 0.01))));
    lut[CM.FLESH_V] = Uint32Array.from(ramp.map((c) => hex(mixh(c, '#3a0830', 0.16))));
    lut[CM.SPOT] = Uint32Array.from(ramp.map((c) => hex(mixh(c, '#300c06', 0.18))));
    // the metal catches the fire (dark gold read as empty sockets); the horn of the nails stays dull
    const gold = ['#1a0602', '#3c1406', '#6c260a', '#a24614', '#d87028', '#ffa850'].map((c) => (dead ? mixh(c, '#2a1414', 0.3) : c));
    lut[CM.GOLD] = Uint32Array.from(gold.map((c, k) => hex(gold[Math.max(0, k - (name === 'redDim' ? 1 : 0))])));
    const horn = ['#160604', '#2c0e08', '#48180c', '#622412', '#7c3018', '#963e1e', '#b04e26'];
    lut[CM.NAIL] = Uint32Array.from(horn.map((_, k) => hex(horn[Math.max(0, k - (name === 'redDim' ? 1 : 0))])));
    // the navy wool: near black, its top two tones the fire's rim along the cuff
    const dimK = name === 'redDim' ? 0.8 : 1;
    const wool = ['#050203', '#0b0407', '#14070c', '#220c12', mixh('#6a2410', '#050203', 1 - dimK), mixh('#c25a20', '#3a1008', 1 - dimK)].map((c) => (dead ? mixh(c, '#140606', 0.4) : c));
    lut[CM.WOOL] = Uint32Array.from(wool.map(hex));
    lut[CM.WOOL_W] = Uint32Array.from(wool.map(hex));
    const brass = ['#120603', '#2a0e05', '#4a1c08', '#7a3210', '#c0601c', '#ffa448'].map((c) => (dead ? mixh(c, '#2a1414', 0.3) : c));
    lut[CM.BRASS] = Uint32Array.from(brass.map((c, k) => hex(brass[Math.max(0, k - (name === 'redDim' ? 1 : 0))])));
  }
  return lut;
}

// ---------------------------------------------------------------------------------------- fields
/** A soft-union height field over a frame-space box (HField in local pixels). */
class Field {
  constructor(x0, y0, x1, y1, k) {
    this.x0 = Math.floor(x0); this.y0 = Math.floor(y0);
    this.w = Math.max(1, Math.ceil(x1) - this.x0); this.h = Math.max(1, Math.ceil(y1) - this.y0);
    this.hf = new HField(this.w, this.h, k);
  }
  blob(cx, cy, rx, ry, hgt, o = {}) { this.hf.blob(cx - this.x0, cy - this.y0, rx, ry, hgt, o); }
  tube(a, r0, b, r1, o = {}) { this.hf.tube(a[0] - this.x0, a[1] - this.y0, r0, b[0] - this.x0, b[1] - this.y0, r1, o); }
  /** Add an analytic surface: fn(fx, fy) → z | null (frame coords of the pixel centre). */
  fn(f, mat) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const z = f(x + this.x0 + 0.5, y + this.y0 + 0.5);
      if (z != null) this.hf._add(y * this.w + x, z, mat);
    }
  }
  finalize() { this.hf.finalize(); return this; }
  /** After finalize: edit heights. fn(fx, fy, z) → new z | undefined. */
  edit(fn) { this.hf.each(0, 0, this.w - 1, this.h - 1, (x, y, z) => fn(x + this.x0 + 0.5, y + this.y0 + 0.5, z)); }
  groove(pts, r, d) { this.hf.groove(pts.map(([x, y]) => [x - this.x0, y - this.y0]), r, d); }
  fold(pts, r, d) { this.hf.fold(pts.map(([x, y]) => [x - this.x0, y - this.y0]), r, d); }
  toCel(cel, o = {}) { cel.fromHF(this.hf, { ...o, dx: this.x0 - cel.ox, dy: this.y0 - cel.oy }); }
}
export { Field };

// ---------------------------------------------------------------------------------------- skeleton
// the four fingers (local units): knuckle (u, v), splay (rad, + toward the thumb) and drift (per segment),
// segment lengths, radii at knuckle / PIP / DIP / tip, the axis height at each joint; bend: per-joint droop.
// Different on purpose: index 20 px wide, middle 22 and the longest, ring 21 and swollen past its stone,
// the little finger 15, short and curled; fanned a few degrees each way so the tips never line up.
const FINGERS = [
  { name: 'index', mu: -3, mv: 31, splay: 0.11, drift: -0.04, len: [42, 26, 21], r: [9.9, 9.0, 8.4, 7.5], z: [8, 8.5, 5.5, 2.5] },
  { name: 'middle', mu: 2, mv: 9, splay: 0.02, drift: 0.006, len: [48, 30, 24], r: [10.7, 9.7, 9.0, 8.1], z: [8.5, 9, 6, 2.5] },
  { name: 'ring', mu: -2, mv: -13, splay: -0.075, drift: 0.03, len: [44, 27, 22], r: [10.1, 9.8, 9.1, 8.0], z: [8, 8.5, 5.5, 2.5] },
  { name: 'pinky', mu: -13, mv: -33, splay: -0.15, drift: 0.065, len: [32, 19, 15], r: [7.9, 7.1, 6.6, 6.0], z: [7, 7, 4.5, 2], bend: [0.05, 0.22, 0.28] },
];
const THUMB = { base: [-80, 33], ang: 0.42, len: [36, 28], r: [17, 14.5, 12.4, 11], z: [14, 10, 6] };
// raised veins on the back (local u, v): a trunk from the wrist forking toward two knuckle valleys, and a
// shorter one by the little-finger edge
const VEINS = [
  [[-170, -2], [-152, -4], [-134, 0], [-116, -2], [-100, -1]],
  [[-100, -1], [-88, 5], [-76, 11], [-64, 16], [-52, 19]],
  [[-100, -1], [-87, -4], [-74, -2], [-62, -4], [-50, -2]],
  [[-158, -29], [-142, -25], [-127, -28], [-114, -24]],
];
/** Catmull-Rom through control points → dense polyline. */
function crs(P, seg = 6) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}
/** Distance to a polyline and the fraction along it (a cheap reject far outside its box). */
function nearPL(pts, u, v, pt = false) {
  const bb = pts.bb || (pts.bb = pts.reduce((b, [a, c]) => [Math.min(b[0], a), Math.min(b[1], c), Math.max(b[2], a), Math.max(b[3], c)], [1e9, 1e9, -1e9, -1e9]));
  if (u < bb[0] - 12 || v < bb[1] - 12 || u > bb[2] + 12 || v > bb[3] + 12) return [99, 0, 0, 0];
  let best = 1e18, bt = 0, acc = 0, total = 0, bu = 0, bv = 0;
  const L = []; for (let j = 0; j + 1 < pts.length; j++) { const l = Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]); L.push(l); total += l; }
  for (let j = 0; j + 1 < pts.length; j++) {
    const [ua, va] = pts[j], du = pts[j + 1][0] - ua, dv = pts[j + 1][1] - va, L2 = du * du + dv * dv || 1e-9;
    let t = ((u - ua) * du + (v - va) * dv) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d2 = (u - ua - du * t) ** 2 + (v - va - dv * t) ** 2;
    if (d2 < best) { best = d2; bt = (acc + t * L[j]) / (total || 1); if (pt) { bu = ua + du * t; bv = va + dv * t; } }
    acc += L[j];
  }
  return [Math.sqrt(best), bt, bu, bv];
}

/** Pose → skeleton in frame coords. pose: { C, ang, s, side, z0, swell 0..1, curl 0..1, bends, rings } */
export function handSkel(pose) {
  const s = pose.s ?? 1, side = pose.side ?? 1, sw = pose.swell ?? 0, z0 = pose.z0 ?? 0, curl = pose.curl ?? 0;
  const f = [Math.cos(pose.ang), Math.sin(pose.ang)], t = [f[1] * side, -f[0] * side];
  const P = (u, v) => [pose.C[0] + (f[0] * u + t[0] * v) * s, pose.C[1] + (f[1] * u + t[1] * v) * s];
  const L = (fx, fy) => { const dx = fx - pose.C[0], dy = fy - pose.C[1]; return [(dx * f[0] + dy * f[1]) / s, (dx * t[0] + dy * t[1]) / s]; };
  const R = (r) => r * s * (1 + sw * 0.035);
  const dirOf = (a) => [f[0] * Math.cos(a) + t[0] * Math.sin(a), f[1] * Math.cos(a) + t[1] * Math.sin(a)];
  const fingers = FINGERS.map((fg, i) => {
    let [x, y] = P(fg.mu, fg.mv), a = fg.splay, zz = z0 + fg.z[0] * s, bend = 0;
    const joints = [[x, y, zz]], segs = [], bends = pose.bends?.[i] || [0, 0, 0], own = fg.bend || [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const bk = (bends[k] || 0) + (curl ? 0 : own[k]);
      bend += bk + curl * [0.7, 1.0, 0.65][k];
      const d = dirOf(a), Lk = fg.len[k] * s * (1 + sw * 0.01), Lp = Lk * Math.cos(Math.min(1.45, bend));
      const nx = x + d[0] * Lp, ny = y + d[1] * Lp;
      const nz = curl || bend ? zz - Lk * Math.sin(Math.min(1.45, bend)) * (pose.dropK ?? 0.6) * (curl ? 1 : 0.35) : z0 + fg.z[k + 1] * s;
      segs.push({ a: [x, y], b: [nx, ny], d, L: Lp, r0: R(fg.r[k]), r1: R(fg.r[k + 1]), z0: zz, z1: nz });
      x = nx; y = ny; zz = nz; joints.push([x, y, zz]);
      a += fg.drift;
    }
    const sg = segs[2], tipR = R(fg.r[3]);
    const tip = [sg.b[0] + sg.d[0] * tipR * 0.92, sg.b[1] + sg.d[1] * tipR * 0.92];
    return { ...fg, i, joints, segs, tipR, tip, mcp: joints[0] };
  });
  // the thumb: from its fat mound near the wrist, lying on its side along the index
  const ta = THUMB.ang * (pose.thumbAng ?? 1);
  let [tx, ty] = P(THUMB.base[0], THUMB.base[1]), tz = z0 + THUMB.z[0] * s;
  const tsegs = [];
  for (let k = 0; k < 2; k++) {
    const d = dirOf(ta + (k ? -0.12 : 0)), Lk = THUMB.len[k] * s * (pose.thumbLen ?? 1);
    const nx = tx + d[0] * Lk, ny = ty + d[1] * Lk, nz = z0 + THUMB.z[k + 1] * s;
    tsegs.push({ a: [tx, ty], b: [nx, ny], d, L: Lk, r0: R(THUMB.r[k * 2]), r1: R(THUMB.r[k * 2 + 1]), z0: tz, z1: nz });
    tx = nx; ty = ny; tz = nz;
  }
  const ts = tsegs[1], ttipR = R(THUMB.r[3]);
  const thumb = { segs: tsegs, tipR: ttipR, tip: [ts.b[0] + ts.d[0] * ttipR * 0.9, ts.b[1] + ts.d[1] * ttipR * 0.9], ip: tsegs[0].b, base: tsegs[0].a };
  const veins = VEINS.map((p) => crs(p, 6));
  return { pose, s, side, f, t, P, L, R, z0, fingers, thumb, veins, rings: pose.rings || {} };
}

// ---------------------------------------------------------------------------------------- sculpt
/**
 * Sculpt the hand into the cel (flesh only; details come after). Returns the skeleton.
 * o: { wrist: u where the flesh stops (inside the cuff), noThumb }
 */
export function sculptHand(cel, pose, o = {}) {
  const S = handSkel(pose), { P, L, R, z0, s, fingers, thumb } = S;
  const FM = CM.FLESH;
  // bounding box of everything (frame coords)
  const pts = [P(-170, -60), P(-170, 70), P(40, 80), P(130, 60), P(130, -60)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const fg of fingers) for (const [x, y] of [fg.tip, fg.mcp]) { x0 = Math.min(x0, x - 30); y0 = Math.min(y0, y - 30); x1 = Math.max(x1, x + 30); y1 = Math.max(y1, y + 30); }
  // ---- A: the back of the hand, knuckles, thenar mound, finger roots, wrist (one soft mass)
  const A = new Field(x0, y0, x1, y1, 0.24 / s);
  const uW = o.wrist ?? -150;
  const plate = [[uW, -38], [-96, -41], [-50, -42], [-26, -40], [-12, -34], [-3, -16], [2, 6], [0, 26], [-5, 36], [-30, 40], [-66, 43], [uW, 41]];
  const Hu = (u) => (24 - 6 * sstep(-80, -8, u)) * s;      // high over the wrist, down to the fingers' own height at the knuckles
  // across the hand: a gently falling plane on the thumb side, a crown, a rounded turn on the little-finger side
  const plateP = (v) => {
    const vc = 2;
    if (v >= vc) return 1 - 0.4 * ((v - vc) / 46) ** 1.3;
    const w = Math.min(1, (vc - v) / 44); return Math.sqrt(Math.max(0, 1 - w ** 2.4));
  };
  // tendons from one point at the wrist, fanning out to the index, middle and ring knuckles: low ridges
  const W0 = [-136, 3];
  const tendons = [0, 1, 2].map((k) => quad(W0, [-80, (W0[1] + FINGERS[k].mv) * 0.48 + (k - 1) * 2], [FINGERS[k].mu - 14, FINGERS[k].mv * 0.93], 16));
  const ridge = (u, v) => {
    let best = 0;
    for (const tp of tendons) {
      const [d, tt] = nearPL(tp, u, v);
      const h = Math.exp(-((d / 3.6) ** 2)) * Math.sin(Math.PI * Math.min(1, tt * 1.05)) ** 0.8;
      if (h > best) best = h;
    }
    return best * 0.9 * s;
  };
  // (the veins are painted in detailHand, not sculpted: a sculpted ridge lights into a white line)
  S.veinsL = VEINS.map((p) => crs(p, 6));
  A.fn((fx, fy) => {
    const [u, v] = L(fx, fy);
    if (u < uW - 2 || u > 8 || v < -44 || v > 46 || !inPoly(plate, u, v)) return null;
    const d = polyDist(plate, u, v);
    const e = Math.sqrt(Math.min(d, 8) / 8);
    return z0 + (Hu(u) * Math.max(plateP(v), 0.08) + ridge(u, v)) * e;
  }, FM);
  // the wrist going into the cuff: thick, round
  A.tube(P(uW - 30, 2), R(50), P(uW + 34, 2), R(48), { mat: FM, z0, z1: z0, k: 0.5, p: 0.6 });
  // knuckle domes: long along the bone (a ridge, not a ball)
  for (const fg of fingers) {
    const a = P(fg.mu - 17, fg.mv * 0.96), b = P(fg.mu + 1, fg.mv), r = R(fg.r[0] * 0.55), kk = 0.45;
    A.tube(a, r * 0.75, b, r, { mat: FM, z0: z0 + Hu(fg.mu - 17) - r * 0.75 * kk + 1.2 * s, z1: z0 + Hu(fg.mu) - r * kk + 2.4 * s, k: kk, p: 0.6 });
  }
  // the finger roots (blend into the knuckles), the thenar mound and the thumb's root
  for (const fg of fingers) { const sg = fg.segs[0], mid = [lerp(sg.a[0], sg.b[0], 0.28), lerp(sg.a[1], sg.b[1], 0.28)]; A.tube(sg.a, sg.r0 * 1.1, mid, lerp(sg.r0, sg.r1, 0.28) * 1.04, { mat: FM, z0: sg.z0, z1: lerp(sg.z0, sg.z1, 0.28), k: 0.86, p: 0.5 }); }
  if (!o.noThumb) {
    { const [mx, my] = P(-86, 30); A.blob(mx, my, R(22), R(22), 23 * s, { base: z0, p: 0.6, mat: FM }); }
    const tg = thumb.segs[0], mid = [lerp(tg.a[0], tg.b[0], 0.4), lerp(tg.a[1], tg.b[1], 0.4)];
    A.tube(tg.a, tg.r0, mid, lerp(tg.r0, tg.r1, 0.4), { mat: FM, z0: tg.z0, z1: lerp(tg.z0, tg.z1, 0.4), k: 0.85, p: 0.5 });
  }
  A.finalize();
  // the dimples between the knuckle domes
  for (let k = 0; k < 3; k++) {
    const a = fingers[k], b = fingers[k + 1], [mx, my] = P((a.mu + b.mu) / 2 - 2, (a.mv + b.mv) / 2);
    A.edit((fx, fy, z) => { const d = Math.hypot(fx - mx, fy - my) / R(4.5); if (d < 1) return z - 1.0 * s * (1 - d * d); });
  }
  A.toCel(cel, { sid: 20, mode: 'z' });
  // ---- B: each finger in its own field (hard union with the others: real crevices between them)
  for (const fg of fingers) {
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const [x, y] of [...fg.joints, fg.tip]) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const pad = fg.segs[0].r0 + 4, B = new Field(bx0 - pad, by0 - pad, bx1 + pad, by1 + pad, 0.34 / s);
    // each phalanx a smooth capsule whose TOP runs level (one long highlight along the finger) while its
    // silhouette narrows ~1 px a side between the joints, swells 1-2 px at the middle joint, and squashes a
    // little wider behind the tip (the pad under the weight)
    const jointAt = [0, fg.segs[0].L, fg.segs[0].L + fg.segs[1].L];            // along-the-finger positions of MCP, PIP, DIP
    fg.segs.forEach((sg, k) => {
      const L2 = sg.L * sg.L || 1;
      B.fn((fx, fy) => {
        let t = ((fx - sg.a[0]) * sg.d[0] + (fy - sg.a[1]) * sg.d[1]) / (sg.L || 1);
        const tc = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = fx - sg.a[0] - sg.d[0] * sg.L * tc, ey = fy - sg.a[1] - sg.d[1] * sg.L * tc, dist = Math.hypot(ex, ey);
        const Rh = lerp(sg.r0, sg.r1, tc);
        const along = jointAt[k] + tc * sg.L;
        let Rs = Rh - (k ? 0.75 : 0.35) * s * Math.sin(Math.PI * tc);
        Rs += 1.3 * s * Math.exp(-(((along - jointAt[1]) / (3.2 * s)) ** 2)) + 0.55 * s * Math.exp(-(((along - jointAt[2]) / (2.6 * s)) ** 2));
        if (k === 2) Rs += 1.1 * s * sstep(0.62, 0.98, t);
        if (dist >= Rs) return null;
        void L2;
        return lerp(sg.z0, sg.z1, tc) + Rh * 0.9 * Math.sqrt(Math.max(0, 1 - (dist / Rs) ** 2));
      }, FM);
    });
    const sg = fg.segs[2];
    B.blob(sg.b[0], sg.b[1], fg.tipR * 1.02, fg.tipR * 1.02, fg.tipR * 0.86, { base: sg.z1, p: 0.55, mat: FM });
    B.finalize();
    // joints (no grooves in the sculpt: the skin is painted — see detailHand)
    fg.creases = [];
    for (const [jsg, dip] of [[fg.segs[1], false], [fg.segs[2], true]]) fg.creases.push({ c: jsg.a, d: jsg.d, n: [-jsg.d[1], jsg.d[0]], r: jsg.r0, dip });
    // a ring cuts in: a groove for the band, the flesh swelling on both sides of it
    const kind = S.rings[fg.i];
    if (kind) {
      const r0 = fg.segs[0], c = [lerp(r0.a[0], r0.b[0], 0.6), lerp(r0.a[1], r0.b[1], 0.6)], d = r0.d, bw = Math.max(1.5, 1.75 * s);   // a 3-4 px band
      fg.ring = { kind, c, d, n: [-d[1], d[0]], r: lerp(r0.r0, r0.r1, 0.6), bw, z: lerp(r0.z0, r0.z1, 0.6) };
      B.edit((fx, fy, z) => {
        const a = (fx - c[0]) * d[0] + (fy - c[1]) * d[1];
        if (Math.abs(a) > bw + 5 * s) return;
        const q = Math.abs(a);
        const lip = 1.6 * s * Math.exp(-(((q - bw - 1.6 * s) / (1.3 * s)) ** 2));
        const cut = q < bw + 0.6 * s ? 1.6 * s : 0;
        return z + lip - cut;
      });
    }
    B.toCel(cel, { sid: 40 + fg.i, mode: 'z' });
    // where the finger rises out of the back of the hand: no outline (a soft turn, not a seam)
    for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) {
      const i = y * cel.w + x; if (cel.sid[i] !== 40 + fg.i) continue;
      const [u] = L(x + cel.ox + 0.5, y + cel.oy + 0.5); if (u < fg.mu + 14) cel.flag[i] |= 1;
    }
  }
  // ---- T: the thumb
  if (!o.noThumb) {
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const sg of thumb.segs) for (const [x, y] of [sg.a, sg.b]) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const pad = R(THUMB.r[0]) + 6, T = new Field(bx0 - pad, by0 - pad, bx1 + pad, by1 + pad, 0.34 / s);
    thumb.segs.forEach((sg) => T.tube(sg.a, sg.r0, sg.b, sg.r1, { mat: FM, z0: sg.z0, z1: sg.z1, k: 0.85, p: 0.5 }));
    const ip = thumb.segs[1].a;
    T.blob(ip[0], ip[1], thumb.segs[1].r0 * 1.04, thumb.segs[1].r0 * 1.04, thumb.segs[1].r0 * 0.85, { base: thumb.segs[1].z0, p: 0.5, mat: FM });
    const ts = thumb.segs[1];
    T.blob(ts.b[0], ts.b[1], thumb.tipR, thumb.tipR, thumb.tipR * 0.85, { base: ts.z1, p: 0.55, mat: FM });
    T.finalize();
    T.toCel(cel, { sid: 44, mode: 'z' });
  }
  return S;
}

// ---------------------------------------------------------------------------------------- detail
/** Which finger a flesh pixel belongs to (by surface id): 0..3 fingers, 4 thumb, -1 back of hand. */
const fingerOf = (sid) => (sid >= 40 && sid <= 44 ? sid - 40 : -1);

/**
 * Paint the placed detail onto the sculpted hand. o.L / o.LR: the tube's and the fire's directions (for the
 * knuckles' highlights). o: { seed, hairs (count on the back), spots, veins, congest }
 * Flags: 16 a highlight under the tube, 32 under the fire, 128 the wet sheen on the knuckles under the fire.
 */
export function detailHand(cel, S, o = {}) {
  const r = rng(o.seed ?? 1894), { P, L: toL, s, fingers, thumb } = S;
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const flesh = (x, y) => { const i = at(x, y); return i >= 0 && isFlesh(cel.mat[i]) ? i : -1; };
  const Lxy = (() => { const Lv = o.L || [-0.32, -0.66, 0.68], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  const LRxy = (() => { const Lv = o.LR || [0.2, 0.6, 0.78], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  const { w, h } = cel;
  const sh = (i, d) => { if (i >= 0 && cel.fix[i] < 0) cel.off[i] = d < 0 ? Math.min(cel.off[i], d) : Math.max(cel.off[i], d); };
  // 1. crevices between the fingers past the webs: one dark line
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!isFlesh(cel.mat[i])) continue;
    const fi = fingerOf(cel.sid[i]); if (fi < 0 || fi > 3) continue;
    const [u] = toL(x + cel.ox + 0.5, y + cel.oy + 0.5);
    const web = fingers[fi].mu + 14;
    if (u < web) continue;
    for (const j of [i + 1, i + w, i - 1, i - w]) {
      const fj = fingerOf(cel.sid[j]);
      if (fj >= 0 && fj <= 3 && fj !== fi && isFlesh(cel.mat[j]) && cel.z[j] >= cel.z[i] - 0.5) { cel.fix[i] = u < web + 8 ? 2 : 1; break; }
    }
  }
  // 2. knuckles: the valleys between them two steps down (one at their rims); on each crest a highlight drawn
  // ALONG the bone, ~2 × 6 px, for each light (the fire's is the wet sheen)
  for (let k = 0; k < 3; k++) {
    const a = fingers[k], b = fingers[k + 1], [mx, my] = P((a.mu + b.mu) / 2 - 7, (a.mv + b.mv) / 2), ru = 9.5 * s, rv = 2.3 * s;
    for (let y = Math.floor(my - ru); y <= my + ru; y++) for (let x = Math.floor(mx - ru); x <= mx + ru; x++) {
      const i = flesh(x, y); if (i < 0 || cel.sid[i] !== 20) continue;
      const px = x + 0.5 - mx, py = y + 0.5 - my, au = px * S.f[0] + py * S.f[1], av = px * S.t[0] + py * S.t[1];
      const e = (au / ru) ** 2 + (av / rv) ** 2;
      if (e < 0.22) sh(i, -2); else if (e < 0.7 || (e < 1 && ((x + y) & 1))) sh(i, -1);
    }
  }
  const mark = (x, y, bit) => { const i = flesh(x, y); if (i >= 0 && cel.fix[i] < 0) cel.flag[i] |= bit; };
  const streak = (u0, u1, v, bit, wid = 2) => {
    for (let q = 0; q <= 1; q += 0.04) {
      const [x, y] = P(lerp(u0, u1, q), v);
      for (let k = 0; k < wid; k++) mark(Math.round(x + S.t[0] * k * 0.9), Math.round(y + S.t[1] * k * 0.9), bit);
    }
  };
  fingers.forEach((fg, k) => {
    if (k === 3) return;                                   // the little finger's knuckle is down in the turn
    const vt = fg.mv + (Lxy[0] * S.t[0] + Lxy[1] * S.t[1]) * fg.r[0] * 0.3;   // the crest's lit side
    streak(fg.mu - 8, fg.mu - 8 + 6 / s, vt, 16);
    const vr = fg.mv + (LRxy[0] * S.t[0] + LRxy[1] * S.t[1]) * fg.r[0] * 0.3;
    if (k === 1 || k === 2) streak(fg.mu - 8, fg.mu - 8 + 3 / s, vr, 32 | 128, 2);   // under the fire: a wet streak on two crests
  });
  // 3. veins: soft raised ridges 2-3 px wide — a cool core, one step lighter on the edge toward the light, one
  // step darker on the other, no outline; a Y from the wrist forking between the 2nd and 3rd knuckles
  if (o.veins !== false) {
    const vl = S.veinsL || S.veins;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!isFlesh(cel.mat[i]) || cel.sid[i] !== 20 || cel.fix[i] >= 0) continue;
      const [u, v] = toL(x + cel.ox + 0.5, y + cel.oy + 0.5);
      if (u < -175 || u > -40) continue;
      let bd = 9, side = 0, kk = 0;
      vl.forEach((vp, k) => {
        const [d, tt, cu, cv] = nearPL(vp, u, v, true);
        if (k > 0 && (tt < 0.02 || tt > 0.95)) return;
        if (d < bd) { bd = d; kk = k; const [cx, cy] = P(cu, cv); side = (x + cel.ox + 0.5 - cx) * Lxy[0] + (y + cel.oy + 0.5 - cy) * Lxy[1]; }
      });
      const px = bd * s;   // distance in frame px
      if (px < 0.85 * (kk === 3 ? 0.7 : 1)) { if (cel.mat[i] === CM.FLESH) { cel.mat[i] = CM.VEIN; cel.off[i] = Math.min(cel.off[i], -1); } }   // the cool mid core
      else if (px < 1.9 && side > 0) { if (cel.mat[i] === CM.FLESH) cel.mat[i] = CM.VEIN; }                     // its lit edge: the skin's own value, cooled
      else if (px < 2.0 && side < 0) cel.off[i] = Math.min(cel.off[i], -1);                                     // its shadow edge
    }
  }
  // 3b. mottling (optional, large and clean-edged)
  for (const [u0, v0, ru, rv, mat] of o.mottle ?? []) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (cel.mat[i] !== CM.FLESH || cel.sid[i] !== 20) continue;
      const [u, v] = toL(x + cel.ox + 0.5, y + cel.oy + 0.5);
      const e = ((u - u0) / ru) ** 2 + ((v - v0) / rv) ** 2 + Math.sin(u * 0.4 + v * 0.3) * 0.18;
      if (e < 1) cel.mat[i] = mat;
    }
  }
  // 4. liver spots: 6-10 small irregular warm-brown blots (2-5 px), clustered by the wrist and the thumb's root
  const spot = (cx, cy, rad) => {
    const lobes = [[0, 0, 1]];
    for (let k = 0; k < 2; k++) { const a = r() * 6.283, d = rad * (0.4 + r() * 0.4); lobes.push([Math.cos(a) * d, Math.sin(a) * d, 0.5 + r() * 0.35]); }
    for (let y = Math.floor(cy - rad * 2); y <= cy + rad * 2; y++) for (let x = Math.floor(cx - rad * 2); x <= cx + rad * 2; x++) {
      const i = flesh(x, y); if (i < 0 || cel.mat[i] !== CM.FLESH) continue;
      if (lobes.some(([lx, ly, lr]) => Math.hypot(x + 0.5 - cx - lx, y + 0.5 - cy - ly) < rad * lr)) cel.mat[i] = CM.SPOT;
    }
  };
  const spots = o.spots ?? [[-106, 12, 2.2], [-101, 19, 1.3], [-97, 3, 1.6], [-108, -17, 1.9], [-93, 27, 1.1], [-82, 35, 2.0], [-76, 41, 1.3], [-89, 41, 1.5], [-99, -9, 1.1]];
  for (const [u, v, rx] of spots) { const [x, y] = P(u, v); spot(x, y, rx * s); }
  // 5. hairs: few, grey, lying along the hand on the wrist half and the finger roots
  const hair = (x0, y0, len) => {
    let x = x0, y = y0; const d = S.f, bendA = (r() - 0.5) * 0.5;
    for (let j = 0; j < len; j++) {
      const i = flesh(Math.round(x), Math.round(y)); if (i < 0) break;
      cel.mat[i] = CM.GHAIR; cel.fix[i] = j === 0 || j === len - 1 ? 4 : 3;
      x += d[0] + d[1] * bendA * (j / len); y += d[1] - d[0] * bendA * (j / len);
    }
  };
  for (let k = 0; k < (o.hairs ?? 5); k++) { const [x, y] = P(-110 + r() * 46, -30 + r() * 56); hair(x, y, 4 + Math.floor(r() * 3)); }
  // 6. the joints. Over the middle joint an oval pocket of loose skin one step down, with 4-6 short broken
  // 1-px lines (3-7 px) bowed toward the tip, inside 55 % of the finger's width; over the end joint two faint
  // short lines; nothing at the base knuckle; no line ever reaches the silhouette
  const joint = (cr, sid, dip) => {
    const { c, d, n, r: rr } = cr;
    const half = rr * (dip ? 0.36 : 0.55);                 // half of the span across the finger
    if (!dip) {
      const ra = 3.6 * s, rb = rr * 0.46;
      for (let y = Math.floor(c[1] - rb - ra); y <= c[1] + rb + ra; y++) for (let x = Math.floor(c[0] - rb - ra); x <= c[0] + rb + ra; x++) {
        const i = flesh(x, y); if (i < 0 || cel.sid[i] !== sid) continue;
        const px = x + 0.5 - c[0], py = y + 0.5 - c[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
        const e = ((a + 0.6 * s) / ra) ** 2 + (b / rb) ** 2;
        if (e < 0.6 || (e < 1 && ((x + y) & 1))) sh(i, -1);
      }
    }
    const lines = dip ? [[-0.9, 0.42, 0], [1.0, 0.32, 0.3]] : [[-2.9, 0.34, -0.25], [-1.0, 0.62, 0.05], [0.9, 0.55, -0.12], [2.7, 0.3, 0.3], [1.6, 0.22, 0.75]];
    lines.forEach(([ak, lenK, shiftB]) => {
      const hl = half * lenK, b0 = shiftB * half, pts = [];
      const deep = !dip && lenK >= 0.55;                     // only the longest lines cut deeper than the pocket
      for (let q = -1; q <= 1; q += 0.1) { const b = b0 + q * hl, a = ak * s + Math.min(1.6, hl * 0.45) * (1 - q * q); pts.push([c[0] + d[0] * a + n[0] * b, c[1] + d[1] * a + n[1] * b]); }
      let gap = r() < 0.5 ? Math.floor(r() * 4) + 2 : -1, cnt = 0;
      cel.stroke(pts, (x, y) => {
        cnt++; if (cnt === gap) return;                      // broken: one gap per line
        const i = flesh(x, y); if (i < 0 || cel.sid[i] !== sid || cel.fix[i] >= 0) return;
        cel.off[i] = Math.min(cel.off[i], deep ? -2 : -1);
      });
    });
  };
  fingers.forEach((fg) => fg.creases?.forEach((cr) => joint(cr, 40 + fg.i, cr.dip)));
  if (thumb && cel.sidAt(Math.round(thumb.ip[0] - cel.ox), Math.round(thumb.ip[1] - cel.oy)) === 44) {
    const sg = thumb.segs[1];
    joint({ c: sg.a, d: sg.d, n: [-sg.d[1], sg.d[0]], r: sg.r0 }, 44, true);
  }
  // 7. the ring finger beyond its stone: congested, livid (one clean boundary)
  if (o.congest !== false) for (const fg of fingers) {
    const rg = fg.ring; if (!rg || rg.kind !== 'stone') continue;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (cel.mat[i] !== CM.FLESH || cel.sid[i] !== 40 + fg.i) continue;
      const fx = x + cel.ox + 0.5, fy = y + cel.oy + 0.5, a = (fx - rg.c[0]) * rg.d[0] + (fy - rg.c[1]) * rg.d[1];
      const k = (a - rg.bw - 3 * s) / (12 * s);
      if (k > 0.5 || (k > 0.36 && ((x + y) & 1))) cel.mat[i] = CM.FLESH_V;
    }
  }
}

/**
 * Nails: thick yellowed horn set into their beds. The plate is ~62 % of the finger's width, with 2-3 px of
 * flesh each side (the side folds one step down) and a 1-px curved cuticle; horn/ivory with 1-px ridges
 * running lengthwise (never across); the free edge stands 2 px past the pad, grime under it. The thumb's
 * nail is seen edge-on: a sliver along its outer edge.
 */
export function paintNails(cel, S, o = {}) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const s = S.s, long = o.long ?? 1;
  const Lxy = (() => { const Lv = o.L || [-0.32, -0.66, 0.68], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  for (const fg of S.fingers) {
    if (o.skip?.includes(fg.i)) continue;
    const sg = fg.segs[2], d = sg.d, n = [-d[1], d[0]], tipR = fg.tipR, sid = 40 + fg.i;
    const tipA = sg.L + tipR * 0.92;                        // the flesh tip, along d from the DIP
    const fleshHalf = (a) => (a <= sg.L ? lerp(sg.r0, sg.r1, clamp(a / sg.L)) : Math.sqrt(Math.max(0, (tipR * 1.02) ** 2 - (a - sg.L) ** 2))) * 0.97;
    const nailL = Math.max(7, tipA * 0.46);
    const a0 = tipA - nailL;
    const hw = Math.max(2.2, fleshHalf(a0 + nailL * 0.4) * 0.62);   // half the plate: ~62 % of the finger
    const over = Math.max(1.6, 2.2 * s * long);               // the free edge past the pad
    const litSide = Math.sign(n[0] * Lxy[0] + n[1] * Lxy[1]) || 1;
    const R2 = Math.ceil(tipA + tipR + 6);
    for (let y = Math.floor(sg.a[1] - R2); y <= sg.a[1] + R2; y++) for (let x = Math.floor(sg.a[0] - R2); x <= sg.a[0] + R2; x++) {
      const px = x + 0.5 - sg.a[0], py = y + 0.5 - sg.a[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
      if (a < a0 - 2 || a > tipA + over + 1) continue;
      const i = at(x, y); if (i < 0) continue;
      const onFinger = isFlesh(cel.mat[i]) && cel.sid[i] === sid;
      const ab = Math.abs(b), bl = b * litSide;
      const cut = a0 + (ab / hw) ** 2 * 2.2 * s;              // the cuticle's curve, round toward the base
      // the end of the flesh under the nail at this b (the pad's outline)
      const padEnd = sg.L + Math.sqrt(Math.max(0, (tipR * 1.02) ** 2 - b * b)) * 0.97;
      let k;
      if (onFinger && a < padEnd - 0.3) {
        if (a < cut - 1.05) {
          if (ab < hw + 1 && a > cut - 2.1) cel.off[i] = Math.max(cel.off[i], 0);                      // the skin just behind the cuticle
          continue;
        }
        if (ab > hw + 1.3) continue;
        if (ab > hw) { cel.off[i] = Math.min(cel.off[i], -1); continue; }                                 // the side folds, a step down
        if (a < cut) { cel.fix[i] = 1; cel.flag[i] |= 8; continue; }                                    // the 1-px cuticle line
        // the plate: mid horn, its lit half a step up, the far edge a step down, lengthwise ridges
        k = bl > hw * 0.15 ? 4 : 3;
        if (bl < -(hw - 1.1)) k = 2;
        if (Math.abs(bl - hw * 0.45) < 0.5 && a > cut + 1) k = 5;                                       // the sheen, along the lit ridge
        else if (Math.abs(b + hw * 0.1 * litSide) < 0.5 || Math.abs(bl + hw * 0.62) < 0.5) k = Math.max(2, k - 1);   // ridges
      } else {
        // past the pad: grime first (seen under the edge), then the free edge, rounded at its corners
        const lim = hw - (a - padEnd) * 0.6;
        if (ab > lim || a > padEnd + over - (ab / Math.max(1, hw)) ** 2 * 1.2) continue;
        if (a < padEnd - 0.3) continue;
        k = a < padEnd + 0.75 ? 0 : (bl > 0 ? 5 : 4);
      }
      const zz = (onFinger ? cel.z[i] : sg.z1 + tipR * 0.5) + 0.8;
      cel.put(x - cel.ox, y - cel.oy, CM.NAIL, { z: zz, n: [n[0] * (b / hw) * 0.5, n[1] * (b / hw) * 0.5, 1], sid: 60 + fg.i, fix: k, off: 0 });
      cel.flag[i] |= 8;
    }
  }
  // the thumb: the nail turned away, seen edge-on — a 2-3 px sliver along its outer edge
  const th = S.thumb;
  if (th && !o.noThumb) {
    const sg = th.segs[1], d = sg.d, n = [-d[1], d[0]], side = S.side;
    const out = [-n[0] * side, -n[1] * side];
    const tipA = sg.L + th.tipR * 0.9;
    const isT = (x, y) => { const i = at(x, y); return i >= 0 && cel.sid[i] === 44 && (isFlesh(cel.mat[i]) || cel.mat[i] === CM.NAIL); };
    const R2 = Math.ceil(tipA + th.tipR + 4), marks = [];
    for (let y = Math.floor(sg.a[1] - R2); y <= sg.a[1] + R2; y++) for (let x = Math.floor(sg.a[0] - R2); x <= sg.a[0] + R2; x++) {
      if (!isT(x, y)) continue;
      const a = (x + 0.5 - sg.a[0]) * d[0] + (y + 0.5 - sg.a[1]) * d[1], b = (x + 0.5 - sg.a[0]) * out[0] + (y + 0.5 - sg.a[1]) * out[1];
      if (a < tipA * 0.4 || a > tipA - 1.2 * s || b < 0) continue;
      let rim = 9;
      for (let k = 1; k <= 5; k++) if (!isT(Math.round(x + out[0] * k), Math.round(y + out[1] * k))) { rim = k; break; }
      if (rim <= 5) marks.push([x, y, rim, a]);
    }
    const thick = Math.max(2, Math.round(2.6 * s));
    for (const [x, y, rim, a] of marks) {
      const i = at(x, y);
      const taper = a < tipA * 0.55 ? 1 : 0;
      if (rim <= thick - taper) cel.put(x - cel.ox, y - cel.oy, CM.NAIL, { z: cel.z[i] + 0.6, sid: 64, fix: rim === 1 ? 3 : 4, off: 0 });
      else if (rim === thick - taper + 1) cel.off[i] = Math.min(cel.off[i], -1);                     // the fold over it
    }
  }
}

/**
 * Rings sunk into the flesh: only a 2-3 px sliver of band across the finger top, the flesh bulging over
 * both edges (the swelling is in the sculpt; here the band and the dark crease where skin meets metal).
 * The signet's oval face sits in the trench; the dark stone in a thin bezel. Hot pixels for each light.
 */
export function paintRings(cel, S, o = {}) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy), s = S.s;
  const LF = (() => { const Lv = o.L || [-0.32, -0.66, 0.68], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  const LR = [0.2, 0.98];   // the fire, from below
  for (const fg of S.fingers) {
    const rg = fg.ring; if (!rg) continue;
    const { c, d, n, r, bw } = rg, sid = 40 + fg.i;
    const vis = r * 0.84;                       // the flesh swallows the band at the finger's sides
    for (let y = Math.floor(c[1] - r - 3); y <= c[1] + r + 3; y++) for (let x = Math.floor(c[0] - r - 3); x <= c[0] + r + 3; x++) {
      const i = at(x, y); if (i < 0 || !isFlesh(cel.mat[i]) || (cel.sid[i] !== sid && cel.sid[i] !== 20)) continue;
      const px = x + 0.5 - c[0], py = y + 0.5 - c[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
      const q = Math.abs(b) / vis;
      if (q > 1) continue;
      const half = bw * (1 - q * q * 0.15);
      const aa = Math.abs(a);
      if (aa <= half) cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: cel.z[i] + 0.2, n: [n[0] * (b / r) * 0.9, n[1] * (b / r) * 0.9, Math.sqrt(Math.max(0.15, 1 - (b / r) ** 2 * 0.8))], sid: 70, fix: -1, off: 0, flag: 1 });
      else if (aa <= half + 1.05) cel.fix[i] = 1;                                         // the crease where the skin meets the metal
      else if (aa <= half + 2.1 && q < 0.9) { if (a < 0) cel.off[i] = Math.max(cel.off[i], 1); else cel.off[i] = Math.min(cel.off[i], -1); }   // the flesh bulging over it (lit on the knuckle side)
    }
    // hot pixels: 1-2 px on the band's lit edge for each light
    const hot = (Ld, m) => {
      const sgn = Math.sign(n[0] * Ld[0] + n[1] * Ld[1]) || 1;
      for (const k of [0.62, 0.74]) { const x = Math.round(c[0] + n[0] * sgn * vis * k), y = Math.round(c[1] + n[1] * sgn * vis * k), i = at(x, y); if (i >= 0 && cel.mat[i] === CM.GOLD) { cel.mat[i] = m; cel.fix[i] = 3; } }
    };
    if (rg.kind === 'signet') {
      // the signet's face: a flat oval turned up to the light, its crest worn nearly smooth; the flesh
      // swells against it on both sides along the finger (no ring of outline around it)
      const rx = r * 0.52, ry = Math.max(2.6, 2.9 * s);
      for (let y = Math.floor(c[1] - r); y <= c[1] + r; y++) for (let x = Math.floor(c[0] - r); x <= c[0] + r; x++) {
        const px = x + 0.5 - c[0], py = y + 0.5 - c[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
        const e = (a / ry) ** 2 + (b / rx) ** 2; if (e > 1.7) continue;
        const i = at(x, y); if (i < 0) continue;
        if (e > 1) {
          if (isFlesh(cel.mat[i]) && (cel.sid[i] === sid || cel.sid[i] === 20)) { if (e < 1.3 && Math.abs(a) > ry * 0.5) cel.fix[i] = 1; else if (Math.abs(a) > ry * 0.5) cel.off[i] = Math.max(cel.off[i], 1); }
          continue;
        }
        const rim = e > 0.55;
        const nn = rim ? [px / rx * 0.5, py / rx * 0.5, 0.85] : [0.04, -0.04, 1];
        cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: (cel.z[i] || rg.z) + 2, n: nn, sid: 71, fix: -1, off: rim ? 0 : -1, flag: 1 });
        if (s >= 1 && e > 0.42 && e < 0.62) cel.off[i] = -2;                // the engraved border, worn (too small to read below full size)
      }
      hot(LF, CM.HOTF); hot(LR, CM.HOTR);
      // the hot rim under the fire also catches the bezel's lower edge
      { const sgn = Math.sign(d[0] * LR[0] + d[1] * LR[1]) || 1; for (const k of [-0.3, 0.3]) { const x = Math.round(c[0] + d[0] * sgn * ry * 0.85 + n[0] * rx * k), y = Math.round(c[1] + d[1] * sgn * ry * 0.85 + n[1] * rx * k), i = at(x, y); if (i >= 0 && cel.mat[i] === CM.GOLD) { cel.mat[i] = CM.HOTR; cel.fix[i] = 3; } } }
    } else {
      // a dark stone, swollen flesh pressing up around its bezel
      const sr = s >= 1 ? Math.max(2.6, r * 0.3) : Math.max(1.6, r * 0.22);
      for (let y = Math.floor(c[1] - sr - 3); y <= c[1] + sr + 3; y++) for (let x = Math.floor(c[0] - sr - 3); x <= c[0] + sr + 3; x++) {
        const e = Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]);
        const i = at(x, y); if (i < 0) continue;
        if (e < sr) cel.put(x - cel.ox, y - cel.oy, CM.STONE, { z: rg.z + r + 3, n: [(x + 0.5 - c[0]) / sr * 0.7, (y + 0.5 - c[1]) / sr * 0.7, 0.8], sid: 72, fix: -1, off: 0, flag: 1 });
        else if (e < sr + 1.1) cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: rg.z + r + 2, n: [(x + 0.5 - c[0]) / e, (y + 0.5 - c[1]) / e, 0.7], sid: 71, fix: -1, off: 0, flag: 1 });
        else if (e < sr + 2.1 && isFlesh(cel.mat[i]) && cel.sid[i] === sid) cel.fix[i] = 1;
      }
      hot(LF, CM.HOTF); hot(LR, CM.HOTR);
      // the stone's glints: a cold one up toward the tube, one hot pinpoint toward the fire
      // a dull garnet: one elongated reflection (2-3 px, along the finger) toward each light, never a pinpoint
      const g = (Ld, m, k) => {
        for (const q of [-0.9, 0, 0.9]) {
          const x = Math.round(c[0] + Ld[0] * sr * 0.42 + d[0] * q), y = Math.round(c[1] + Ld[1] * sr * 0.42 + d[1] * q), i = at(x, y);
          if (i >= 0 && cel.mat[i] === CM.STONE) { cel.mat[i] = m; cel.fix[i] = q ? k - 1 : k; }
        }
      };
      g(LF, CM.STONE, 5); g(LR, CM.HOTR, 2);
    }
  }
}

// ---------------------------------------------------------------------------------------- the cuff
/** An uncapped cylinder into a Field (a sleeve is cut flat): z = zbase + r·k·(1−q²)^p. */
function cylinder(F, a, b, ra, rb, za, zb, o = {}) {
  const k = o.k ?? 0.6, mat = o.mat, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2);
  F.fn((fx, fy) => {
    const t = ((fx - a[0]) * dx + (fy - a[1]) * dy) / L2;
    if (t < 0 || t > 1) return null;
    const dd = Math.abs((fx - a[0]) * dy - (fy - a[1]) * dx) / L, r = ra + (rb - ra) * t;
    if (dd >= r) return null;
    const q = dd / r;
    return za + (zb - za) * t + r * k * Math.pow(1 - q * q, o.p ?? 0.5);
  }, mat);
}

/**
 * The navy sleeve & cuff the wrist vanishes into, and the roll of flesh bulging over the cuff's edge.
 * Writes into the cel. o: { back (how far the sleeve goes up the arm, local u), rise (its height there),
 * edge (u of the cuff's edge), box: [x0,y0,x1,y1] limit (frame) }
 */
export function sculptCuff(cel, S, o = {}) {
  const { P, L: toL, s, z0, R } = S, sw = S.pose.swell ?? 0;
  const edge = o.edge ?? -114, back = o.back ?? -560, rise = o.rise ?? 160;
  const corners = [P(back, -100), P(back, 100), P(edge + 6, -90), P(edge + 6, 90)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of corners) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (o.box) { x0 = Math.max(x0, o.box[0]); y0 = Math.max(y0, o.box[1]); x1 = Math.min(x1, o.box[2]); y1 = Math.min(y1, o.box[3]); }
  const F = new Field(x0, y0, x1, y1, 0.2 / s);
  // the sleeve climbs away toward his elbow, widening as it nears the camera
  cylinder(F, P(back, 0), P(edge - 46, 0), R(88 + sw * 1.5), R(70 + sw), z0 + rise * s, z0 + 20 * s, { mat: CM.WOOL, k: 0.62, p: 0.6 });
  // the cuff: a turned-back band strained around the wrist, cut off where the flesh comes out
  cylinder(F, P(edge - 48, 0), P(edge, 0), R(71 + sw * 1.2), R(69 + sw * 1.2), z0 + 15 * s, z0 + 13 * s, { mat: CM.WOOL_W, k: 0.6, p: 0.55 });
  F.finalize();
  // the seam where the cuff is set on; drag folds down the sleeve; strain lines pulling at the button
  F.groove([P(edge - 48, -80), P(edge - 49, 0), P(edge - 48, 80)], 2.6 * s, 4.5 * s);
  F.fold([P(edge - 90, -90), P(edge - 104, -20), P(edge - 96, 40), P(edge - 78, 90)], 6 * s, 9 * s);
  F.fold([P(edge - 160, -96), P(edge - 176, -10), P(edge - 150, 86)], 8 * s, 12 * s);
  F.groove([P(edge - 230, -100), P(edge - 246, -30), P(edge - 252, 44), P(edge - 230, 100)], 10 * s, 10 * s);
  for (let k = 0; k < 4; k++) F.groove([P(edge - 4, -22 + k * 13), P(edge - 16, -10 + k * 9), P(edge - 30, 2 + k * 3)], 1.5 * s, 2 * s);   // strain, pulling at the button
  F.edit((fx, fy, z) => { const [u] = toL(fx, fy); const du = u - edge; if (du > -5 && du <= 0) return z + 1.6 * s * Math.sin(Math.PI * (du + 5) / 5); });   // the cuff's rolled lip
  F.toCel(cel, { sid: 30, mode: 'z', clip: o.clip });
  for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) { const i = y * cel.w + x; if (cel.mat[i] === CM.WOOL_W) cel.sid[i] = 31; }
  // the roll of flesh bulging over the cuff's edge: lying on the wool, convex and uneven — 3-5 px past the edge
  // in the middle of the wrist, sagging there, little at the sides; a squeezed crease just behind it on the
  // wrist, and a black undercut on the WOOL under its lip
  const ex0 = Math.floor(x0), ey0 = Math.floor(y0);
  const lim = 64;
  const over = (v) => { const a = Math.min(1, Math.abs(v + 6) / lim); return s * (0.8 + 2.2 * Math.pow(Math.max(0, 1 - a * a), 0.7) + 3.4 * Math.exp(-(((v + 34) / 15) ** 2)) + 3.0 * Math.exp(-(((v - 8) / 13) ** 2)) + 0.4 * Math.sin(v * 0.31 + 2.1)); };   // two lobes of flesh, pinched between
  for (let y = ey0; y < y1; y++) for (let x = ex0; x < x1; x++) {
    const [u, v] = toL(x + 0.5, y + 0.5);
    if (Math.abs(v + 2) > lim + 2) continue;
    const du = (edge - u) * s;   // px into the cuff from its edge
    if (du < -6 * s || du > 8 * s) continue;
    const i = cel.idx(x - cel.ox, y - cel.oy); if (i < 0) continue;
    const w = Math.max(0.6, over(v));
    if (du < 0) {
      if (isFlesh(cel.mat[i]) && cel.fix[i] < 0) {
        if (du > -1.6 * s && du < -0.4 * s) cel.off[i] = Math.min(cel.off[i], -2);          // the crease where the roll folds over
        else if (du > -3.4 * s && du <= -1.6 * s) cel.off[i] = Math.min(cel.off[i], -1);
      }
      continue;
    }
    if (cel.mat[i] !== CM.WOOL_W && cel.mat[i] !== CM.WOOL && !isFlesh(cel.mat[i])) continue;
    if (du > w) { if (du < w + 1.6 * s && (cel.mat[i] === CM.WOOL_W || cel.mat[i] === CM.WOOL)) { cel.fix[i] = 0; cel.flag[i] |= 1; } continue; }   // the black undercut under its lip
    const q = clamp(du / w);
    const zc = cel.z[i] + 1.5 * s;
    // the same skin as the wrist it hangs from (its normal borrowed from a few px back), shaded by hand: the
    // fold a step down, a lit crest, the lip turning down onto the wool a step down again
    const j = cel.idx(Math.round(x + S.f[0] * (du + 5 * s)) - cel.ox, Math.round(y + S.f[1] * (du + 5 * s)) - cel.oy);
    const nf = j >= 0 && isFlesh(cel.mat[j]) ? [cel.nx[j], cel.ny[j], cel.nz[j]] : [0, 0, 1];
    const offR = q < 0.2 ? -1 : q < 0.66 ? 0 : -1;
    cel.put(x - cel.ox, y - cel.oy, CM.FLESH, { z: zc + 2.4 * s * Math.sqrt(Math.max(0, 1 - q * q)), n: nf, sid: 21, fix: -1, off: offR, flag: 1 });
  }
  return { edge, F };
}

/** Cuff detail: big wet patches (glossy), the worn rim, tarnished brass buttons pulled by the strain. */
export function detailCuff(cel, S, o = {}) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const { P, s } = S, edge = o.edge ?? -114;
  const isW = (m) => m === CM.WOOL || m === CM.WOOL_W;
  // the sleeve soaked in patches: darker and glossier (large, clean shapes — no speckle)
  for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) {
    const i = y * cel.w + x; if (cel.mat[i] !== CM.WOOL) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    if (vn(fx, fy, 34, 92) + vn(fx, fy, 13, 93) * 0.25 > 0.72) cel.mat[i] = CM.WOOL_W;
  }
  // brass buttons on the cuff, pulled sideways by the strain, green in the crevices
  const button = (u, v, rad, eagle) => {
    const [bx, by] = P(u, v);
    const bi = at(Math.round(bx), Math.round(by)); if (bi < 0 || !isW(cel.mat[bi])) return;
    const bz = cel.z[bi];
    for (let y = Math.floor(by - rad - 3); y <= by + rad + 3; y++) for (let x = Math.floor(bx - rad - 3); x <= bx + rad + 3; x++) {
      const px = x + 0.5 - bx, py = y + 0.5 - by, e = Math.hypot(px, py) / rad;
      const i = at(x, y); if (i < 0) continue;
      if (e > 1) { if (e < 1.28 && isW(cel.mat[i])) cel.fix[i] = e < 1.14 ? 0 : 1; continue; }   // the wool puckers around it
      const dome = Math.sqrt(Math.max(0, 1 - e * e));
      cel.put(x - cel.ox, y - cel.oy, CM.BRASS, { z: bz + 2 + dome * rad * 0.5, n: [px / rad, py / rad, dome + 0.35], sid: 33, fix: -1, off: 0, flag: eagle && e > 0.45 && e < 0.95 && (px * 0.42 + py * 0.91) / rad > 0.3 ? 32 : 0 });
      if (e > 0.72 && e < 0.88) cel.mat[i] = CM.VERD;
      else if (eagle && e < 0.5 && ((Math.abs(py) < rad * 0.12 && Math.abs(px) < rad * 0.46) || (Math.abs(px) < rad * 0.12 && py > -rad * 0.36 && py < rad * 0.3))) cel.off[i] = 1;
    }
  };
  for (const [u, v, rad, eg] of o.buttons || [[edge - 30, 6, 7.5, true], [edge - 28, -24, 4.6, false]]) button(u, v, rad * s, eg);
  // the cuff catches a little of the tube (it is part of him, not of the dark)
  for (let y = 0; y < cel.h; y++) for (let x = 0; x < cel.w; x++) {
    const i = y * cel.w + x; if (cel.mat[i] !== CM.WOOL_W && cel.mat[i] !== CM.WOOL) continue;
    const [u] = S.L(x + cel.ox + 0.5, y + cel.oy + 0.5);
    if (u > edge - 52) cel.lum[i] += 0.1 * clamp((u - edge + 60) / 20);
  }
}

/** Lift the placed highlights for one light (bit 16 tube / 32 fire) by a step; returns an undo. */
export function liftHighlights(cel, bit, mats = null) {
  const { off, flag, mat } = cel, saved = off.slice();
  for (let i = 0; i < off.length; i++) if ((flag[i] & bit) && (mats ? mats.includes(mat[i]) : isFlesh(mat[i]))) off[i] = Math.min(3, off[i] + 1);
  return () => off.set(saved);
}

/**
 * Cast shadow of a layer onto the plane z = z0 (layer coords): cov (0 none, 1 dithered rim, 2 full) and
 * occ, the height of the occluder that threw it (a raised receiver above that height is not in it).
 */
export function shadowMask(cel, L, z0 = 0) {
  const { w, h, z, mat } = cel;
  const hard = new Uint8Array(w * h), cov = new Uint8Array(w * h), occ = new Float32Array(w * h);
  const px = -L[0] / L[2], py = -L[1] / L[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mat[i]) continue;
    const zi = Math.max(0, z[i] - z0);
    let lo = zi;
    for (const j of [i - 1, i + 1, i - w, i + w]) { const zj = j >= 0 && j < w * h && mat[j] ? Math.max(0, z[j] - z0) : 0; lo = Math.min(lo, zj); }
    const zl = Math.max(0, lo - 1.5);
    const ax = x + px * zi, ay = y + py * zi, bx = x + px * zl, by = y + py * zl;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= n; k++) {
      const xx = Math.round(ax + (bx - ax) * k / n), yy = Math.round(ay + (by - ay) * k / n);
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { const j = yy * w + xx; hard[j] = 1; if (zi > occ[j]) occ[j] = zi; }
    }
  }
  // close pinholes; a 1-px rim (value 1) the compositor dithers, full cover = 2
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let s = 0, oz = occ[i]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * w + dx; s += hard[j]; if (occ[j] > oz) oz = occ[j]; }
    cov[i] = hard[i] ? (s >= 7 ? 2 : 1) : s >= 5 ? 1 : 0;
    if (cov[i] && !occ[i]) occ[i] = oz;
  }
  return { cov, occ };
}

/** Distance (chamfer) from flesh resting on the plane, for contact lines and halos (layer coords). */
export function contactDist(cel, sel) {
  const { w, h } = cel, D = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) D[i] = sel(i) ? 0 : 99;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = D[i]; if (!v) continue; if (x > 0) v = Math.min(v, D[i - 1] + 1); if (y > 0) { v = Math.min(v, D[i - w] + 1); if (x > 0) v = Math.min(v, D[i - w - 1] + 1.41); if (x < w - 1) v = Math.min(v, D[i - w + 1] + 1.41); } D[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = D[i]; if (!v) continue; if (x < w - 1) v = Math.min(v, D[i + 1] + 1); if (y < h - 1) { v = Math.min(v, D[i + w] + 1); if (x < w - 1) v = Math.min(v, D[i + w + 1] + 1.41); if (x > 0) v = Math.min(v, D[i + w - 1] + 1.41); } D[i] = v; }
  return D;
}
export { isFlesh, fingerOf };
