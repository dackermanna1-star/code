// The Colonel's hand, as the CGs paint it (colonel_hand, vhs_frames 3, locker_slits' knocking fist).
// One kit so the motif stays the same everywhere: a corpulent right hand with a real thumb, a gold
// signet sunk into the little finger and a dark stone strangling the ring finger, thick yellowed nails.
//
// Discipline (the portraits' rules): ONE flesh ramp of 6 tones, a violet accent for veins and the
// congested finger, a liver-spot brown; hard cel bands, no texture noise. The volume is a few big
// planes — the back of the hand is built as a broad slab (lit thumb-side plane, mid crown, a turn into
// shadow at the little-finger edge) with four knuckle domes along its front and fat fingers whose
// shafts stay smooth between the joints. Detail is placed, not sprinkled: one crease cluster per joint,
// a few liver spots and hairs, two veins, sunk rings, nails inset in their beds.
//
// Coordinates: a pose puts the middle finger's knuckle at C (frame px), the fingers along `ang`, the
// thumb on the `side` (+1: thumb to the left of the fingers' way, i.e. a right hand seen from above).
// Local units (u along the fingers, v toward the thumb) are scaled by s.
import { HField } from './colonel_gbuf.js';
import { celMat, bay, h01, vn, clamp, lerp, sstep, quad, inPoly, polyDist } from './colonel_cg_cel.js';
import { rng } from './util.js';

// material ids (shared with the scenes that import CM)
export const CM = {
  DESK: 1, DESK_G: 2, FLOOR: 3, DESK_EDGE: 4, CARVE: 5,
  DENIM: 10, DENIM_D: 11, STITCH: 12, SKIN: 13, CHEEK: 14, FRECKLE: 15, HAIR: 16, LASH: 17, TNAIL: 18, HAIR_D: 19,
  FLESH: 20, VEIN: 21, SPOT: 22, NAIL: 23, GHAIR: 24, GOLD: 25, STONE: 26, HOTF: 27, HOTR: 28, FLESH_V: 29,
  WOOL: 30, WOOL_W: 31, BRASS: 32, VERD: 33, THREAD: 34,
  PENCIL: 40, PWOOD: 41, GRAPHITE: 42, ERASER: 43, FERRULE: 44,
};
// the hand: waxy gray-pink, cel-banded. Bands: 1 deep turn · 2 shadow plane · 3 crown · 4 lit plane ·
// 5 sheen (and the painted knuckle highlights); 0 is the outline.
const FL_TH = [0.2, 0.42, 0.66, 0.9, 1.08];
const FL = { th: FL_TH, dith: 0, line: 0, lineLit: 1, gap: 2.6, spec: null };
celMat(CM.FLESH, { ramp: ['#331e1e', '#663f3b', '#956a5e', '#bc9480', '#d9b99e', '#eedcbf'], ...FL });
celMat(CM.VEIN, { ramp: ['#2e1d26', '#573f4c', '#7f6370', '#a18890', '#bfa8a8', '#d6c4bc'], ...FL, line: null });
celMat(CM.FLESH_V, { ramp: ['#2e1b26', '#573a4a', '#7e5f6c', '#a2868c', '#c0a8a8', '#d8c6c0'], ...FL });
celMat(CM.SPOT, { ramp: ['#2c1c16', '#4c3426', '#6e5038', '#8c6c4c', '#a6865e', '#bc9c72'], ...FL, line: null, spec: null });
celMat(CM.NAIL, { ramp: ['#241e14', '#3a3020', '#917859', '#a08a62', '#b49e72', '#cfb891'], th: [0.2, 0.4, 0.6, 0.85, 1.1], dith: 0, line: null, gap: 1.5 });
celMat(CM.GHAIR, { ramp: ['#1c1a1e', '#363238', '#545056', '#747072', '#949090', '#b4b0ac'], th: FL_TH, dith: 0 });
celMat(CM.GOLD, { ramp: ['#1e1406', '#4a3510', '#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c'], th: [0.2, 0.4, 0.62, 0.86, 1.04], dith: 0, gap: 1, spec: { at: 0.95, w: 0.05, k: 0.4 } });
celMat(CM.STONE, { ramp: ['#070208', '#170810', '#2e0f1c', '#4e1a2e', '#8a5068'], th: [0.25, 0.5, 0.8, 1.05], dith: 0 });
// hot pixels on the metal: HOTF burns only under the tube (a gold glint), HOTR only under the fire;
// their colours are patched per grade (patchLUT) — elsewhere they read as the gold around them
celMat(CM.HOTF, { ramp: ['#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c', '#fff4cc'], th: [0.2, 0.45, 0.7, 0.95], dith: 0 });
celMat(CM.HOTR, { ramp: ['#4a3510', '#7c5e22', '#ab8a3e', '#d2b462', '#f0dc9c'], th: [0.2, 0.45, 0.7, 0.95], dith: 0 });
// the cuff: navy wool, wet in places, tarnished brass
celMat(CM.WOOL, { ramp: ['#05070e', '#0e1426', '#1a2442', '#28365e', '#3c4e7c', '#56699a'], th: [0.14, 0.32, 0.54, 0.8, 1.02], dith: 0, line: 0, lineLit: 1, gap: 3 });
celMat(CM.WOOL_W, { ramp: ['#04050b', '#0a0f1e', '#141d36', '#213052', '#344a76', '#7488b8'], th: [0.14, 0.32, 0.54, 0.84, 0.99], dith: 0, line: 0, lineLit: 1, gap: 3, spec: { at: 0.94, w: 0.04, k: 0.35 } });
celMat(CM.BRASS, { ramp: ['#140d05', '#33250e', '#5a4519', '#836a2c', '#a88c44', '#cdb46c'], th: [0.16, 0.36, 0.58, 0.82, 1.0], dith: 0, line: 0, gap: 1, spec: { at: 0.95, w: 0.05, k: 0.45 } });
celMat(CM.VERD, { ramp: ['#0e1612', '#1c2c24', '#30483a', '#4a6652', '#68846c'], th: [0.2, 0.42, 0.66, 0.9], dith: 0 });
celMat(CM.THREAD, { ramp: ['#141418', '#2e2e36', '#4c4a52', '#6e6a6c', '#928c86'], th: [0.2, 0.42, 0.66, 0.9], dith: 0 });

export const FLESHY = [CM.FLESH, CM.VEIN, CM.SPOT, CM.FLESH_V];
const isFlesh = (m) => m === CM.FLESH || m === CM.VEIN || m === CM.SPOT || m === CM.FLESH_V;

/** Per-grade colours for the hot pixels (call on a LUT from gradeLUT). */
export function patchLUT(lut, red) {
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
  const gold = lut[CM.GOLD];
  if (!gold) return lut;
  lut[CM.HOTF] = red ? Uint32Array.from([1, 2, 3, 3, 4].map((k) => gold[k])) : Uint32Array.from(['#8a6a2a', '#c09a48', '#e8cc78', '#fff0bc', '#fffbe8'].map(hex));
  lut[CM.HOTR] = red ? Uint32Array.from(['#c0602a', '#e88a3c', '#ffb050', '#ffc874', '#ffe0a0'].map(hex)) : Uint32Array.from([1, 2, 3, 3, 4].map((k) => gold[k]));
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
// the four fingers (local units): knuckle (u, v), splay (rad, + toward the thumb), segment lengths,
// radii at knuckle / PIP / DIP / tip, the axis height at each joint (the fingers arch a little)
const FINGERS = [
  { name: 'index', mu: -3, mv: 37, splay: 0.06, len: [46, 28, 23], r: [15.5, 15, 13.4, 11.8], z: [8, 8.5, 5, 2] },
  { name: 'middle', mu: 2, mv: 11, splay: 0.0, len: [50, 31, 25], r: [16.2, 15.6, 14, 12.2], z: [8, 9, 5.5, 2] },
  { name: 'ring', mu: -3, mv: -15, splay: -0.07, len: [46, 28, 23], r: [15.4, 15, 13.2, 11.6], z: [8, 8.5, 5, 2] },
  { name: 'pinky', mu: -14, mv: -39, splay: -0.17, len: [35, 22, 19], r: [13.4, 12.8, 11.6, 10.4], z: [7, 7, 4, 1.5] },
];
const THUMB = { base: [-84, 40], ang: 0.56, len: [38, 29], r: [19, 16.5, 14, 12.4], z: [15, 11, 6] };

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
    const joints = [[x, y, zz]], segs = [], bends = pose.bends?.[i] || [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      bend += (bends[k] || 0) + curl * [0.7, 1.0, 0.65][k];
      const d = dirOf(a), Lk = fg.len[k] * s * (1 + sw * 0.01), Lp = Lk * Math.cos(Math.min(1.45, bend));
      const nx = x + d[0] * Lp, ny = y + d[1] * Lp;
      const nz = curl || bends[k] ? zz - Lk * Math.sin(Math.min(1.45, bend)) * (pose.dropK ?? 0.6) : z0 + fg.z[k + 1] * s;
      segs.push({ a: [x, y], b: [nx, ny], d, L: Lp, r0: R(fg.r[k]), r1: R(fg.r[k + 1]), z0: zz, z1: nz });
      x = nx; y = ny; zz = nz; joints.push([x, y, zz]);
      a += (i === 0 ? -0.04 : i === 3 ? 0.05 : i === 2 ? 0.02 : 0.005);     // each curves its own way toward the middle
    }
    const sg = segs[2], tipR = R(fg.r[3]);
    const tip = [sg.b[0] + sg.d[0] * tipR * 0.92, sg.b[1] + sg.d[1] * tipR * 0.92];
    return { ...fg, i, joints, segs, tipR, tip, mcp: joints[0] };
  });
  // the thumb: from its fat mound near the wrist, ~35° off the index, lying on its side
  const ta = THUMB.ang * (pose.thumbAng ?? 1);
  let [tx, ty] = P(THUMB.base[0], THUMB.base[1]), tz = z0 + THUMB.z[0] * s;
  const tsegs = [];
  for (let k = 0; k < 2; k++) {
    const d = dirOf(ta + (k ? -0.12 : 0)), Lk = THUMB.len[k] * s * (pose.thumbLen ?? 1);
    const nx = tx + d[0] * Lk, ny = ty + d[1] * Lk, nz = z0 + THUMB.z[k + 1] * s;
    tsegs.push({ a: [tx, ty], b: [nx, ny], d, L: Lk, r0: R(THUMB.r[k + 1 - (k ? 0 : 1)] * (k ? 1 : 1)), r1: R(THUMB.r[k + 1 + (k ? 1 : 0)]), z0: tz, z1: nz });
    tx = nx; ty = ny; tz = nz;
  }
  tsegs[0].r0 = R(THUMB.r[0]); tsegs[0].r1 = R(THUMB.r[1]); tsegs[1].r0 = R(THUMB.r[2]); tsegs[1].r1 = R(THUMB.r[3]);
  const ts = tsegs[1], ttipR = R(THUMB.r[3]);
  const thumb = { segs: tsegs, tipR: ttipR, tip: [ts.b[0] + ts.d[0] * ttipR * 0.9, ts.b[1] + ts.d[1] * ttipR * 0.9], ip: tsegs[0].b, base: tsegs[0].a };
  return { pose, s, side, f, t, P, L, R, z0, fingers, thumb, rings: pose.rings || {} };
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
  const pts = [P(-170, -70), P(-170, 75), P(40, 90), P(130, 60), P(130, -70)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const fg of fingers) for (const [x, y] of [fg.tip, fg.mcp]) { x0 = Math.min(x0, x - 30); y0 = Math.min(y0, y - 30); x1 = Math.max(x1, x + 30); y1 = Math.max(y1, y + 30); }
  // ---- A: the back of the hand, knuckles, thenar mound, finger roots, wrist (one soft mass)
  const A = new Field(x0, y0, x1, y1, 0.24 / s);
  const uW = o.wrist ?? -150;
  const plate = [[uW, -60], [-90, -58], [-46, -55], [-20, -50], [-8, -40], [0, -14], [3, 10], [-1, 36], [-6, 50], [-34, 55], [-70, 60], [uW, 60]];
  const Hu = (u) => (23 + 5 * sstep(-120, -12, u)) * s;
  // across the hand: a gently falling plane on the thumb side, a crown, a rounded turn on the little-finger side
  const plateP = (v) => {
    const vc = -8;
    if (v >= vc) return 1 - 0.42 * ((v - vc) / 62) ** 1.25;
    const w = Math.min(1, (vc - v) / 52); return Math.sqrt(Math.max(0, 1 - w ** 2.4));
  };
  // tendons fanning from the wrist to the index, middle and ring knuckles: low ridges under the skin
  const tendons = o.tendons === false ? [] : [0, 1, 2].map((k) => { const fg = fingers[k]; return quad([-112, 6 - k * 8], [-64, (6 - k * 8 + fg.mv) * 0.5 + 3], [fg.mu - 14, fg.mv * 0.9], 12); });
  const ridge = (u, v) => {
    let best = 0;
    for (const pts of tendons) for (let j = 0; j + 1 < pts.length; j++) {
      const [ua, va] = pts[j], [ub, vb] = pts[j + 1], dx = ub - ua, dy = vb - va, L2 = dx * dx + dy * dy;
      let t = ((u - ua) * dx + (v - va) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(u - ua - dx * t, v - va - dy * t), tt = (j + t) / (pts.length - 1);
      const h = Math.exp(-((d / 3.6) ** 2)) * Math.sin(Math.PI * Math.min(1, tt * 1.08)) ** 0.7;
      if (h > best) best = h;
    }
    return best * 1.7 * s;
  };
  A.fn((fx, fy) => {
    const [u, v] = L(fx, fy);
    if (u < uW - 2 || u > 8 || v < -62 || v > 64 || !inPoly(plate, u, v)) return null;
    const d = polyDist(plate, u, v);
    const e = Math.sqrt(Math.min(d, 8) / 8);
    return z0 + (Hu(u) * Math.max(plateP(v), 0.08) + ridge(u, v)) * e;
  }, FM);
  // the wrist going into the cuff: thick, round
  A.tube(P(uW - 30, -2), R(60), P(uW + 34, -2), R(58), { mat: FM, z0, z1: z0, k: 0.5, p: 0.6 });
  // knuckle domes
  for (const fg of fingers) {
    const [kx, ky] = P(fg.mu - 3, fg.mv), r = R(fg.r[0] * 0.92);
    A.blob(kx, ky, r, r, Hu(fg.mu) * 0.9 + 6 * s, { base: z0, p: 0.62, mat: FM });
  }
  // the finger roots (blend into the knuckles), the thenar mound and the thumb's root
  for (const fg of fingers) { const sg = fg.segs[0], mid = [lerp(sg.a[0], sg.b[0], 0.42), lerp(sg.a[1], sg.b[1], 0.42)]; A.tube(sg.a, sg.r0, mid, lerp(sg.r0, sg.r1, 0.42), { mat: FM, z0: sg.z0, z1: lerp(sg.z0, sg.z1, 0.42), k: 0.9, p: 0.5 }); }
  if (!o.noThumb) {
    { const [mx, my] = P(-86, 38); A.blob(mx, my, R(30), R(30), 25 * s, { base: z0, p: 0.6, mat: FM }); }
    const tg = thumb.segs[0], mid = [lerp(tg.a[0], tg.b[0], 0.4), lerp(tg.a[1], tg.b[1], 0.4)];
    A.tube(tg.a, tg.r0, mid, lerp(tg.r0, tg.r1, 0.4), { mat: FM, z0: tg.z0, z1: lerp(tg.z0, tg.z1, 0.4), k: 0.85, p: 0.5 });
  }
  A.finalize();
  // the dimples between the knuckle domes
  for (let k = 0; k < 3; k++) {
    const a = fingers[k], b = fingers[k + 1], [mx, my] = P((a.mu + b.mu) / 2 - 2, (a.mv + b.mv) / 2);
    A.edit((fx, fy, z) => { const d = Math.hypot(fx - mx, fy - my) / R(5); if (d < 1) return z - 0.8 * s * (1 - d * d); });
  }
  A.toCel(cel, { sid: 20, mode: 'z' });
  // ---- B: each finger in its own field (hard union with the others: real crevices between them)
  for (const fg of fingers) {
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const [x, y] of [...fg.joints, fg.tip]) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const pad = fg.segs[0].r0 + 4, B = new Field(bx0 - pad, by0 - pad, bx1 + pad, by1 + pad, 0.34 / s);
    fg.segs.forEach((sg) => B.tube(sg.a, sg.r0, sg.b, sg.r1, { mat: FM, z0: sg.z0, z1: sg.z1, k: 0.9, p: 0.5 }));
    const sg = fg.segs[2];
    B.blob(sg.b[0], sg.b[1], fg.tipR * 1.02, fg.tipR * 1.02, fg.tipR * 0.86, { base: sg.z1, p: 0.55, mat: FM });
    B.finalize();
    // a ring cuts in: a groove for the band, the flesh swelling on both sides of it
    const kind = S.rings[fg.i];
    if (kind) {
      const r0 = fg.segs[0], c = [lerp(r0.a[0], r0.b[0], 0.52), lerp(r0.a[1], r0.b[1], 0.52)], d = r0.d, bw = 1.5 * s;
      fg.ring = { kind, c, d, n: [-d[1], d[0]], r: lerp(r0.r0, r0.r1, 0.52), bw, z: lerp(r0.z0, r0.z1, 0.52) };
      B.edit((fx, fy, z) => {
        const a = (fx - c[0]) * d[0] + (fy - c[1]) * d[1];
        if (Math.abs(a) > bw + 5 * s) return;
        const q = Math.abs(a);
        const lip = 1.5 * s * Math.exp(-(((q - bw - 1.6 * s) / (1.3 * s)) ** 2));
        const cut = q < bw + 0.6 * s ? 1.6 * s : 0;
        return z + lip - cut;
      });
    }
    B.toCel(cel, { sid: 40 + fg.i, mode: 'z' });
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
 * Paint the placed detail onto the sculpted hand. light: { L } (the key light, for where highlights go).
 * o: { seed, hairs (count on the back), spots, veins, congest (the ring finger beyond its stone) }
 */
export function detailHand(cel, S, o = {}) {
  const r = rng(o.seed ?? 1894), { P, L: toL, s, fingers, thumb } = S;
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const flesh = (x, y) => { const i = at(x, y); return i >= 0 && isFlesh(cel.mat[i]) ? i : -1; };
  const shift = (x, y, d, floor = 1) => { const i = flesh(x, y); if (i >= 0 && cel.fix[i] < 0) cel.off[i] = Math.max(-floor - 4, Math.min(3, cel.off[i] + d)); };
  const Lxy = (() => { const Lv = o.L || [-0.32, -0.66, 0.68], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  const LRxy = (() => { const Lv = o.LR || [0.2, 0.6, 0.78], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  // 1. crevices between the fingers past the webs: one dark line (not black)
  const { w, h } = cel;
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
  // 2. knuckles: a 2-3 px highlight on each dome's lit side (per light: flag 16 tube, 32 fire), a 1 px
  // dimple between them
  const mark = (x, y, bit) => { const i = flesh(x, y); if (i >= 0 && cel.fix[i] < 0) cel.flag[i] |= bit; };
  fingers.forEach((fg, k) => {
    const [kx, ky] = P(fg.mu - 3, fg.mv), rr = fg.r[0] * 0.92 * s;
    for (const [Ld, bit] of [[Lxy, 16], [LRxy, 32]]) {
      const hx = Math.round(kx + Ld[0] * rr * 0.34), hy = Math.round(ky + Ld[1] * rr * 0.34);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]].slice(0, k === 3 ? 2 : 3)) mark(hx + dx, hy + dy, bit);
    }
    if (k < 3) {
      const b = fingers[k + 1], [mx, my] = P((fg.mu + b.mu) / 2 - 1, (fg.mv + b.mv) / 2);
      const i = flesh(Math.round(mx), Math.round(my)); if (i >= 0) cel.off[i] = -1;
    }
  });
  // 3. each shaft: smooth between its joints, one broad highlight along its lit side (per light)
  const shafts = [];
  fingers.forEach((fg) => fg.segs.forEach((sg, k) => shafts.push({ sg, sid: 40 + fg.i, t0: k === 0 ? 0.48 : 0.2, t1: k === 2 ? 0.95 : 0.8, w: k === 2 ? 2 : 3 })));
  if (thumb) thumb.segs.forEach((sg, k) => shafts.push({ sg, sid: 44, t0: k === 0 ? 0.5 : 0.2, t1: k ? 0.9 : 0.82, w: 3 }));
  for (const { sg, sid, t0, t1, w } of shafts) {
    const n = [-sg.d[1], sg.d[0]];
    for (const [Ld, bit] of [[Lxy, 16], [LRxy, 32]]) {
      const side = (n[0] * Ld[0] + n[1] * Ld[1]) >= 0 ? 1 : -1;
      const steps = Math.ceil(sg.L * 2);
      for (let j = 0; j <= steps; j++) {
        const t = t0 + (t1 - t0) * (j / steps), r = lerp(sg.r0, sg.r1, t);
        const ww = w * Math.min(1, Math.sin(Math.PI * (j / steps)) * 2.2);
        for (let q = 0; q < ww; q += 0.5) {
          const off = r * 0.36 + q - ww / 2;
          const x = Math.round(lerp(sg.a[0], sg.b[0], t) + n[0] * side * off), y = Math.round(lerp(sg.a[1], sg.b[1], t) + n[1] * side * off);
          const i = flesh(x, y); if (i >= 0 && cel.sid[i] === sid && cel.fix[i] < 0) cel.flag[i] |= bit;
        }
      }
    }
  }
  // 4. veins: two, violet, broad and soft, from the wrist toward the valleys between the knuckles
  for (let k = 0; k < (o.veins ?? 2); k++) {
    const pts = k === 0 ? [P(-130, -22), P(-104, -30), P(-78, -24), P(-56, -30), P(-34, -27)] : [P(-130, 20), P(-108, 14), P(-84, 24), P(-60, 22), P(-40, 26)];
    const sm = []; for (let j = 0; j + 1 < pts.length; j++) { const a = pts[j], b = pts[j + 1], c = pts[j + 2] || b; sm.push(...quad(a, b, [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], 8)); }
    cel.stroke(sm, (x, y, tt) => {
      if (tt < 0.05 || tt > 0.96) return;
      const wv = tt < 0.75 ? 3 : 2;
      for (let q = 0; q < wv; q++) for (const [dx, dy] of [[q, 0], [0, q]]) {
        const i = flesh(x + dx, y + dy); if (i < 0 || fingerOf(cel.sid[i]) >= 0 || cel.mat[i] === CM.SPOT) continue;
        if ((tt > 0.82 || q === 2) && bay(x + dx, y + dy) < 0.5) continue;
        cel.mat[i] = CM.VEIN;
      }
    });
  }
  // 5. liver spots: a handful, irregular, on the wrist half and the back
  const spot = (cx, cy, rad) => {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) / rad + (h01(x, y, 71) - 0.5) * 0.45;
      const i = flesh(x, y); if (i >= 0 && d < 1 && cel.mat[i] === CM.FLESH) cel.mat[i] = CM.SPOT;
    }
  };
  const spots = o.spots ?? [[-104, -24, 3.2], [-92, 6, 2.2], [-70, -36, 2.6], [-58, 22, 1.6], [-120, 18, 2.4], [-40, -8, 1.4], [-84, -44, 1.5]];
  for (const [u, v, rad] of spots) { const [x, y] = P(u, v); spot(x, y, rad * s); }
  // 6. hairs: few, dark, lying along the hand on the wrist half and the finger roots
  const hair = (x0, y0, len) => {
    let x = x0, y = y0; const d = S.f, bendA = (r() - 0.5) * 0.5;
    for (let j = 0; j < len; j++) {
      const i = flesh(Math.round(x), Math.round(y)); if (i < 0) break;
      cel.mat[i] = CM.GHAIR; cel.fix[i] = j === len - 1 ? 2 : 1;
      x += d[0] + d[1] * bendA * (j / len); y += d[1] - d[0] * bendA * (j / len);
    }
  };
  for (let k = 0; k < (o.hairs ?? 9); k++) { const [x, y] = P(-128 + r() * 58, -42 + r() * 80); hair(x, y, 3 + Math.floor(r() * 3)); }
  fingers.forEach((fg) => { if (fg.i === 3) return; const sg = fg.segs[0]; for (let k = 0; k < 2; k++) { const u = 0.14 + r() * 0.24, sd = (r() - 0.5) * 0.7 * sg.r0; hair(lerp(sg.a[0], sg.b[0], u) + sg.d[1] * sd, lerp(sg.a[1], sg.b[1], u) - sg.d[0] * sd, 3 + Math.floor(r() * 2)); } });
  // 7. creases: one cluster per joint (PIP, DIP) — 2-3 short curves bowed toward the tip, one step darker
  const cluster = (c, d, rr, lens, sid) => {
    const n = [-d[1], d[0]];
    lens.forEach((len, j) => {
      const along = (j - (lens.length - 1) / 2) * 2.1 * s, half = len / 2, bow = Math.max(1, len * 0.22);
      const cx = c[0] + d[0] * along, cy = c[1] + d[1] * along;
      cel.stroke(quad([cx - n[0] * half - d[0] * bow * 0.2, cy - n[1] * half - d[1] * bow * 0.2], [cx + d[0] * bow, cy + d[1] * bow], [cx + n[0] * half - d[0] * bow * 0.2, cy + n[1] * half - d[1] * bow * 0.2], 10), (x, y) => {
        const i = flesh(x, y); if (i < 0 || cel.sid[i] !== sid || cel.fix[i] >= 0) return;
        cel.off[i] = Math.min(cel.off[i], -1);
      });
    });
  };
  fingers.forEach((fg) => {
    const k1 = fg.segs[1], k2 = fg.segs[2], sc = s * (fg.i === 3 ? 0.85 : 1);
    cluster(k1.a, k1.d, k1.r0, [5 * sc, 7 * sc, 5 * sc], 40 + fg.i);
    cluster(k2.a, k2.d, k2.r0, [4 * sc, 5 * sc], 40 + fg.i);
  });
  if (thumb && cel.sidAt(Math.round(thumb.ip[0] - cel.ox), Math.round(thumb.ip[1] - cel.oy)) === 44) {
    const sg = thumb.segs[1], c = [sg.a[0] + sg.d[1] * 2 * s, sg.a[1] - sg.d[0] * 2 * s];
    cluster(c, sg.d, sg.r0, [6 * s, 8 * s], 44);
  }
  // 8. the ring finger beyond its stone: congested, livid (the violet accent, dithered in)
  if (o.congest !== false) for (const fg of fingers) {
    const rg = fg.ring; if (!rg || rg.kind !== 'stone') continue;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (cel.mat[i] !== CM.FLESH || cel.sid[i] !== 40 + fg.i) continue;
      const fx = x + cel.ox + 0.5, fy = y + cel.oy + 0.5, a = (fx - rg.c[0]) * rg.d[0] + (fy - rg.c[1]) * rg.d[1];
      const k = (a - rg.bw - 4 * s) / (14 * s);
      if (k > 1 || (k > 0 && bay(x + cel.ox, y + cel.oy) < k)) cel.mat[i] = CM.FLESH_V;
    }
  }
}

/**
 * Nails: inset plates (about 60% of the finger's width, 3 px of skin wall each side), starting a third
 * of the way back from the tip; a dirt line where the free edge leaves the flesh; the free edge darker,
 * overhanging 2-3 px. The thumb's nail is seen edge-on: a sliver along its outer edge.
 */
export function paintNails(cel, S, o = {}) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const s = S.s, long = o.long ?? 1;
  const Lxy = (() => { const Lv = o.L || [-0.32, -0.66, 0.68], l = Math.hypot(Lv[0], Lv[1]) || 1; return [Lv[0] / l, Lv[1] / l]; })();
  for (const fg of S.fingers) {
    if (o.skip?.includes(fg.i)) continue;
    const sg = fg.segs[2], d = sg.d, n = [-d[1], d[0]], tipR = fg.tipR, sid = 40 + fg.i;
    const tipA = sg.L + tipR * 0.92;                       // the flesh tip, along d from the DIP
    const nailL = Math.max(7, tipA * 0.42);                 // the plate: from a third of the way back
    const a0 = tipA - nailL, over = Math.max(2, 2.6 * s * long), a1 = tipA + over;
    const hw = Math.max(2, tipR * 0.6);
    const fleshHalf = (a) => (a <= sg.L ? lerp(sg.r0, sg.r1, clamp(a / sg.L)) : Math.sqrt(Math.max(0, (tipR * 1.02) ** 2 - (a - sg.L) ** 2))) * 0.97;
    const wall = Math.max(2, 2.6 * s);
    const litSide = Math.sign(n[0] * Lxy[0] + n[1] * Lxy[1]) || 1;
    const freeStart = tipA - 1.6 * s;                     // where the nail leaves the flesh
    const hwFree = Math.max(1.5, Math.min(hw, fleshHalf(freeStart) - wall));
    const R2 = Math.ceil(tipA + tipR + 6);
    for (let y = Math.floor(sg.a[1] - R2); y <= sg.a[1] + R2; y++) for (let x = Math.floor(sg.a[0] - R2); x <= sg.a[0] + R2; x++) {
      const px = x + 0.5 - sg.a[0], py = y + 0.5 - sg.a[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
      if (a < a0 - 1.2 || a > a1) continue;
      const i = at(x, y); if (i < 0) continue;
      const onFinger = isFlesh(cel.mat[i]) && cel.sid[i] === sid;
      let k;
      if (a < freeStart) {
        // the plate, inset between walls of skin; a round cuticle
        const lim = Math.min(hw, fleshHalf(a) - wall);
        const cuticle = a0 + (b / hw) ** 2 * 1.6 * s;
        if (!onFinger || Math.abs(b) > lim + 0.5) continue;
        if (a < cuticle) { if (a > cuticle - 1.3) cel.off[i] = Math.min(cel.off[i], -1); continue; }   // the cuticle fold
        if (Math.abs(b) > lim - 0.5) { cel.off[i] = Math.min(cel.off[i], -1); continue; }               // the groove at its side
        k = b * litSide > lim - 1.6 ? 4 : b * -litSide > lim - 1.6 ? 3 : 4;
      } else {
        // the free edge: overhangs the fingertip by 2-3 px, following its curve; dirt in the first row
        const tipAt = sg.L + Math.sqrt(Math.max(0, (tipR * 1.02) ** 2 - b * b)) * 0.97;
        if (Math.abs(b) > hwFree + 0.3 || a > tipAt + over - (b / hwFree) ** 2 * 1.2 * s) continue;
        k = a < freeStart + 1 ? 1 : 2;
      }
      const zz = (onFinger ? cel.z[i] : sg.z1 + tipR * 0.5) + 0.8;
      cel.put(x - cel.ox, y - cel.oy, CM.NAIL, { z: zz, n: [n[0] * (b / hw) * 0.5, n[1] * (b / hw) * 0.5, 1], sid: 60 + fg.i, fix: k, off: 0 });
      cel.flag[i] |= 8;
    }
    // one light pixel on the plate, toward the light
    const la = a0 + nailL * 0.42, lb = litSide * hw * 0.4;
    const lx = Math.round(sg.a[0] + d[0] * la + n[0] * lb), ly = Math.round(sg.a[1] + d[1] * la + n[1] * lb), li = at(lx, ly);
    if (li >= 0 && cel.mat[li] === CM.NAIL && cel.fix[li] === 4) cel.fix[li] = 5;
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
      if (a < tipA * 0.38 || a > tipA - 1.2 * s || b < 0) continue;
      let rim = 9;
      for (let k = 1; k <= 5; k++) if (!isT(Math.round(x + out[0] * k), Math.round(y + out[1] * k))) { rim = k; break; }
      if (rim <= 5) marks.push([x, y, rim, a]);
    }
    const thick = Math.max(3, Math.round(3.4 * s));
    for (const [x, y, rim, a] of marks) {
      const i = at(x, y);
      const taper = a < tipA * 0.52 ? 1 : 0;          // thinner where it disappears into its fold
      if (rim <= thick - taper) cel.put(x - cel.ox, y - cel.oy, CM.NAIL, { z: cel.z[i] + 0.6, sid: 64, fix: rim === 1 ? 0 : rim === 2 ? 5 : rim === 3 ? 4 : 3, off: 0 });
      else if (rim === thick - taper + 1) cel.fix[i] = 1;                          // the nail fold
    }
    // its free edge, just past the tip on the outer side
    const ex = sg.a[0] + d[0] * (tipA + 0.6 * s), ey = sg.a[1] + d[1] * (tipA + 0.6 * s);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
      const x = Math.round(ex + out[0] * (th.tipR * 0.45 + k) + d[0] * j), y = Math.round(ey + out[1] * (th.tipR * 0.45 + k) + d[1] * j), i = at(x, y);
      if (i >= 0 && !isFlesh(cel.mat[i]) && cel.mat[i] !== CM.NAIL) cel.put(x - cel.ox, y - cel.oy, CM.NAIL, { z: (sg.z1 || 0) + 8, sid: 64, fix: j ? 1 : 2, off: 0 });
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
      const i = at(x, y); if (i < 0 || !isFlesh(cel.mat[i]) || cel.sid[i] !== sid) continue;
      const px = x + 0.5 - c[0], py = y + 0.5 - c[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
      const q = Math.abs(b) / vis;
      if (q > 1) continue;
      const half = bw * (1 - q * q * 0.35);
      const aa = Math.abs(a);
      if (aa <= half) cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: cel.z[i] + 0.2, n: [n[0] * (b / r) * 0.9, n[1] * (b / r) * 0.9, Math.sqrt(Math.max(0.15, 1 - (b / r) ** 2 * 0.8))], sid: 70, fix: -1, off: 0, flag: 1 });
      else if (aa <= half + 1.05) cel.fix[i] = 1;                                         // the crease where the skin meets the metal
      else if (aa <= half + 1.05 + 2 * s && q < 0.92) { cel.off[i] = Math.max(cel.off[i], 1); cel.flag[i] |= 0; }   // the flesh bulging over it
    }
    // hot pixels: 1-2 px on the band's lit edge for each light
    const hot = (Ld, m) => {
      const sgn = Math.sign(n[0] * Ld[0] + n[1] * Ld[1]) || 1;
      for (const k of [0.62, 0.74]) { const x = Math.round(c[0] + n[0] * sgn * vis * k), y = Math.round(c[1] + n[1] * sgn * vis * k), i = at(x, y); if (i >= 0 && cel.mat[i] === CM.GOLD) { cel.mat[i] = m; cel.fix[i] = 3; } }
    };
    if (rg.kind === 'signet') {
      // the signet's face: a flat oval turned up to the light, its crest worn nearly smooth; the flesh
      // swells against it on both sides along the finger (no ring of outline around it)
      const rx = r * 0.46, ry = Math.max(3, 3.6 * s);
      for (let y = Math.floor(c[1] - r); y <= c[1] + r; y++) for (let x = Math.floor(c[0] - r); x <= c[0] + r; x++) {
        const px = x + 0.5 - c[0], py = y + 0.5 - c[1], a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
        const e = (a / ry) ** 2 + (b / rx) ** 2; if (e > 1.6) continue;
        const i = at(x, y); if (i < 0) continue;
        if (e > 1) {
          if (isFlesh(cel.mat[i]) && cel.sid[i] === sid) { if (e < 1.25 && Math.abs(a) > ry * 0.6) cel.fix[i] = 1; else if (Math.abs(a) > ry * 0.6) cel.off[i] = Math.max(cel.off[i], 1); }
          continue;
        }
        const rim = e > 0.5;
        const nn = rim ? [px / rx * 0.55, py / rx * 0.55, 0.8] : [0.04, -0.04, 1];
        cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: (cel.z[i] || rg.z) + 2, n: nn, sid: 71, fix: -1, off: rim ? 0 : -1, flag: 1 });
        if (!rim && e < 0.25 && (Math.abs(b) < 0.7 || Math.abs(a) < 0.7)) cel.off[i] = -2;     // the worn crest
      }
      hot(LF, CM.HOTF); hot(LR, CM.HOTR);
      // the hot rim under the fire also catches the bezel's lower edge
      { const sgn = Math.sign(d[0] * LR[0] + d[1] * LR[1]) || 1; for (const k of [-0.3, 0.3]) { const x = Math.round(c[0] + d[0] * sgn * ry * 0.85 + n[0] * rx * k), y = Math.round(c[1] + d[1] * sgn * ry * 0.85 + n[1] * rx * k), i = at(x, y); if (i >= 0 && cel.mat[i] === CM.GOLD) { cel.mat[i] = CM.HOTR; cel.fix[i] = 3; } } }
    } else {
      // a dark stone, swollen flesh pressing up around its bezel
      const sr = Math.max(2.6, r * 0.3);
      for (let y = Math.floor(c[1] - sr - 3); y <= c[1] + sr + 3; y++) for (let x = Math.floor(c[0] - sr - 3); x <= c[0] + sr + 3; x++) {
        const e = Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]);
        const i = at(x, y); if (i < 0) continue;
        if (e < sr) cel.put(x - cel.ox, y - cel.oy, CM.STONE, { z: rg.z + r + 3, n: [(x + 0.5 - c[0]) / sr * 0.7, (y + 0.5 - c[1]) / sr * 0.7, 0.8], sid: 72, fix: -1, off: 0, flag: 1 });
        else if (e < sr + 1.1) cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: rg.z + r + 2, n: [(x + 0.5 - c[0]) / e, (y + 0.5 - c[1]) / e, 0.7], sid: 71, fix: -1, off: 0, flag: 1 });
        else if (e < sr + 2.1 && isFlesh(cel.mat[i]) && cel.sid[i] === sid) cel.fix[i] = 1;
      }
      hot(LF, CM.HOTF); hot(LR, CM.HOTR);
      // the stone's glints: a cold one up toward the tube, one hot pinpoint toward the fire
      const g = (Ld, m, k) => { const x = Math.round(c[0] + Ld[0] * sr * 0.45), y = Math.round(c[1] + Ld[1] * sr * 0.45), i = at(x, y); if (i >= 0 && cel.mat[i] === CM.STONE) { cel.mat[i] = m; cel.fix[i] = k; } };
      g(LF, CM.HOTF, 3); g(LR, CM.HOTR, 4);
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
  // the roll of flesh bulging over the cuff's edge: 3-5 px of flesh lying on the wool, round, uneven;
  // a squeezed valley just behind it on the wrist
  const ex0 = Math.floor(x0), ey0 = Math.floor(y0);
  for (let y = ey0; y < y1; y++) for (let x = ex0; x < x1; x++) {
    const [u, v] = toL(x + 0.5, y + 0.5);
    const lim = 66;
    if (Math.abs(v + 2) > lim) continue;
    const du = (edge - u) * s;   // px into the cuff from its edge
    if (du < -6 * s || du > 6 * s) continue;
    const i = cel.idx(x - cel.ox, y - cel.oy); if (i < 0) continue;
    const across = Math.abs(v + 2) / lim;
    const w = s * (3.6 + Math.sin(v * 0.21) * 0.9 + Math.sin(v * 0.07 + 1) * 0.6) * (1 - across ** 4 * 0.7);
    if (du < 0) { if (isFlesh(cel.mat[i]) && du > -4.5 * s && cel.fix[i] < 0 && (du < -1.2 * s || bay(x, y) < 0.5)) cel.off[i] = Math.min(cel.off[i], -1); continue; }
    if (cel.mat[i] !== CM.WOOL_W && !isFlesh(cel.mat[i])) continue;
    if (du > w) { if (du < w + 1.2 && cel.mat[i] === CM.WOOL_W) { cel.fix[i] = 0; cel.flag[i] |= 1; } continue; }   // its shadow on the wool
    const q = clamp(du / w);
    const zc = cel.z[i] + 1.5 * s;
    const nf = [S.f[0] * (0.5 - q) * 1.8, S.f[1] * (0.5 - q) * 1.8, 1];
    cel.put(x - cel.ox, y - cel.oy, CM.FLESH, { z: zc, n: nf, sid: 21, fix: -1, off: 0 });
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
      cel.put(x - cel.ox, y - cel.oy, CM.BRASS, { z: bz + 2 + dome * rad * 0.5, n: [px / rad, py / rad, dome + 0.35], sid: 33, fix: -1, off: 0 });
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

/** Cast-shadow coverage + contact of a layer onto the plane z = z0 (layer coords). */
export function shadowMask(cel, L, z0 = 0) {
  const { w, h, z, mat } = cel;
  const hard = new Uint8Array(w * h), cov = new Uint8Array(w * h);
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
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) hard[yy * w + xx] = 1;
    }
  }
  // close pinholes; a 1-px rim (value 1) the compositor dithers, full cover = 2
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += hard[i + dy * w + dx];
    cov[i] = hard[i] ? (s >= 7 ? 2 : 1) : s >= 5 ? 1 : 0;
  }
  return cov;
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
