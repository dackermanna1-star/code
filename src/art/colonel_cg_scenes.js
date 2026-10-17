// Scene pieces for the Colonel's CGs: the giant ringed hand (shared), Tess at her desk (colonel_hand).
import { GBuf, HField, M, defMat, rampFrom, rig, shade, imgToCanvas, fbm, vnoise, hnoise } from './colonel_gbuf.js';
import { PAL, mix } from './palette.js';
import { rng } from './util.js';

const W = 480, H = 270;
const dk = (c, k) => mix(c, '#000000', k), lt = (c, k) => mix(c, '#ffffff', k);

// ---- scene materials (ids 40+ are owned by the CG scenes)
export const SM = { HAIR_R: 40, SKIN: 41, DENIM: 42, DESK: 43, DESK_EDGE: 44, METAL: 45, FRECKLE: 46, LASH: 47, CARDIGAN: 48, CHALK: 49, WALL_G: 50, WALL_C: 51, FLOOR: 52, OLIVE: 53, BEANIE: 54, DSKIN: 55, GLASS: 56, LOCKER: 57, LOCKER_D: 58, TILE: 59, WOOD: 60, NAVY_CUFF: 61 };
defMat(SM.HAIR_R, { ramp: rampFrom([dk(PAL.hair_r_dd, 0.6), dk(PAL.hair_r_dd, 0.2), PAL.hair_r_d, mix(PAL.hair_r, PAL.brown, 0.25), mix(PAL.hair_r_l, PAL.tan_l, 0.2), mix(PAL.hair_r_ll, PAL.paper, 0.3)], 9), spec: 0.3, shin: 9, dith: 0.75,
  tex: (x, y) => (vnoise(x * 0.35 + y * 0.9, y * 0.12 - x * 0.05, 2.2, 5) - 0.5) * 0.22 });
defMat(SM.SKIN, { ramp: rampFrom([dk(PAL.skin_dd, 0.5), PAL.skin_dd, PAL.skin_d, PAL.skin, PAL.skin_l, lt(PAL.skin_l, 0.35)], 9), spec: 0.25, shin: 14, dith: 0.5, wrap: 0.3 });
defMat(SM.FRECKLE, { ramp: rampFrom([dk(PAL.freckle, 0.6), dk(PAL.freckle, 0.3), PAL.freckle, mix(PAL.freckle, PAL.skin_l, 0.4)], 6), dith: 0.3 });
defMat(SM.LASH, { ramp: [dk(PAL.hair_r_dd, 0.75), dk(PAL.hair_r_dd, 0.55), dk(PAL.hair_r_dd, 0.3), PAL.hair_r_dd], dith: 0.2 });
defMat(SM.DENIM, { ramp: rampFrom([dk(PAL.denim_d, 0.55), PAL.denim_d, PAL.denim, PAL.denim_l, PAL.denim_ll, lt(PAL.denim_ll, 0.4)], 9), spec: 0.05, dith: 0.7, bump: [1.6, 0.35, 15],
  tex: (x, y) => (((x + y * 2) % 5 === 0) ? -0.05 : 0.01) + (fbm(x, y, 18, 4) - 0.5) * 0.18 });
defMat(SM.DESK, { ramp: rampFrom([dk(PAL.brown_dd, 0.6), dk(PAL.brown_dd, 0.2), mix(PAL.brown_d, PAL.g2, 0.3), mix(PAL.tan, PAL.g4, 0.45), mix(PAL.tan_l, PAL.g5, 0.45), mix(PAL.cream_l, PAL.g6, 0.4)], 9), spec: 0.35, shin: 18, dith: 0.6,
  tex: (x, y) => (vnoise(x * 0.08, y * 1.4, 1.6, 21) - 0.5) * 0.12 + (vnoise(x * 0.5, y * 0.05, 3, 22) - 0.5) * 0.05 });
defMat(SM.DESK_EDGE, { ramp: rampFrom([dk(PAL.brown_dd, 0.6), PAL.brown_dd, PAL.brown_d, PAL.brown, PAL.tan], 7), spec: 0.2, dith: 0.5 });
defMat(SM.METAL, { ramp: rampFrom([dk(PAL.g1, 0.5), PAL.g1, PAL.g2, PAL.g3, PAL.g4, PAL.g5], 8), spec: 0.8, shin: 20, dith: 0.5 });
defMat(SM.CARDIGAN, { ramp: rampFrom([dk(PAL.g2, 0.5), PAL.g2, PAL.g3, PAL.g4, PAL.g5, PAL.g6], 9), dith: 0.7, bump: [1.5, 0.5, 33], tex: (x, y) => ((((x >> 1) + (y >> 2)) & 1) ? 0.04 : -0.04) });
defMat(SM.CHALK, { ramp: rampFrom([dk(PAL.slate, 0.6), PAL.slate, PAL.slate_l, mix(PAL.slate_l, PAL.green_l, 0.4)], 7), dith: 0.8, tex: (x, y) => (fbm(x, y, 20, 3) - 0.5) * 0.15 });
defMat(SM.WALL_G, { ramp: rampFrom([dk(PAL.green_dd, 0.5), PAL.green_dd, PAL.green_d, PAL.green, PAL.green_l, PAL.mint], 9), dith: 0.8, tex: (x, y) => (fbm(x, y, 12, 6) - 0.5) * 0.18 });
defMat(SM.WALL_C, { ramp: rampFrom([dk(PAL.cream_d, 0.7), dk(PAL.cream_d, 0.4), PAL.cream_d, PAL.cream, PAL.cream_l, lt(PAL.cream_l, 0.3)], 9), dith: 0.8, tex: (x, y) => (fbm(x, y, 14, 7) - 0.5) * 0.2 });
defMat(SM.FLOOR, { ramp: rampFrom([dk(PAL.mustard_d, 0.7), dk(PAL.mustard_d, 0.4), PAL.mustard_d, mix(PAL.mustard, PAL.green_d, 0.3), mix(PAL.tan, PAL.mustard, 0.5)], 8), dith: 0.8, tex: (x, y) => (fbm(x, y, 9, 8) - 0.5) * 0.2 });
defMat(SM.OLIVE, { ramp: rampFrom([dk(PAL.green_dd, 0.6), PAL.green_dd, mix(PAL.green_d, PAL.mustard_d, 0.4), mix(PAL.green, PAL.mustard, 0.4), mix(PAL.green_l, PAL.tan, 0.3)], 9), dith: 0.7, bump: [2, 0.3, 44] });
defMat(SM.BEANIE, { ramp: rampFrom([dk(PAL.ink, 0.5), PAL.ink, PAL.night, PAL.shadow, PAL.g1, PAL.g2], 8), dith: 0.6, bump: [1.5, 0.5, 45] });
defMat(SM.DSKIN, { ramp: rampFrom([dk(PAL.dskin_dd, 0.5), PAL.dskin_dd, PAL.dskin_d, PAL.dskin, PAL.dskin_l, lt(PAL.dskin_l, 0.25)], 8), spec: 0.35, shin: 14, dith: 0.5 });
defMat(SM.GLASS, { ramp: rampFrom([dk(PAL.blue_dd, 0.6), PAL.blue_dd, PAL.blue_d, PAL.blue, PAL.blue_l], 7), spec: 1, shin: 30, dith: 0.6 });
defMat(SM.LOCKER, { ramp: rampFrom([dk(PAL.green_dd, 0.75), dk(PAL.green_dd, 0.45), PAL.green_dd, PAL.green_d, mix(PAL.green, PAL.g4, 0.4), mix(PAL.green_l, PAL.g5, 0.5)], 9), spec: 0.5, shin: 12, dith: 0.8,
  tex: (x, y) => (fbm(x, y, 7, 12) - 0.5) * 0.14 + (hnoise(x, y, 13) < 0.02 ? -0.08 : 0) });
defMat(SM.LOCKER_D, { ramp: rampFrom([dk(PAL.ink, 0.5), PAL.ink, dk(PAL.green_dd, 0.4), PAL.green_dd, PAL.green_d], 7), spec: 0.3, dith: 0.8 });
defMat(SM.TILE, { ramp: rampFrom([dk(PAL.g2, 0.5), PAL.g2, PAL.g4, mix(PAL.g5, PAL.cream, 0.4), PAL.cream_l], 8), spec: 0.5, shin: 16, dith: 0.6 });
defMat(SM.WOOD, { ramp: rampFrom([dk(PAL.wood_d, 0.5), PAL.wood_d, PAL.wood, PAL.wood_l, PAL.maple], 8), spec: 0.3, dith: 0.6, tex: (x, y) => (vnoise(x * 1.5, y * 0.1, 2, 9) - 0.5) * 0.12 });
defMat(SM.NAVY_CUFF, { ramp: rampFrom([dk(PAL.navy_dd, 0.65), PAL.navy_dd, PAL.navy_d, PAL.navy, PAL.navy_l, mix(PAL.navy_l, PAL.blue_l, 0.45)], 10), spec: 0.08, dith: 0.75, bump: [1.6, 0.45, 23],
  tex: (x, y) => ((((x + y) >> 1) & 1) ? 0.03 : -0.03) + (fbm(x, y, 9, 4) - 0.5) * 0.14 });

// the hand's flesh: pale and swollen, livid (gray-violet) in the creases, mottled like poor circulation
SM.HFLESH = 62;
defMat(SM.HFLESH, {
  ramp: rampFrom([dk(PAL.velvet_d, 0.55), mix(PAL.flesh_dd, PAL.velvet_d, 0.45), mix(PAL.flesh_d, PAL.velvet, 0.2), mix(PAL.flesh, PAL.skin_d, 0.22), mix(PAL.flesh_l, PAL.skin, 0.3), mix(PAL.flesh_l, PAL.skin_l, 0.45)], 10),
  spec: 0.32, shin: 16, dith: 0.75, bump: [3.5, 0.22, 63], wrap: 0.2,
  tex: (x, y) => (fbm(x, y, 11, 64) - 0.5) * 0.14 + (hnoise(x, y, 65) < 0.02 ? -0.06 : 0),
  alt: { ramp: rampFrom([dk(PAL.velvet_d, 0.6), PAL.velvet_d, mix(PAL.flesh_d, PAL.velvet, 0.45), mix(PAL.flesh, PAL.velvet, 0.25), mix(PAL.flesh_l, PAL.red_l, 0.12), lt(PAL.flesh_l, 0.2)], 10), f: (x, y) => Math.max(0, fbm(x, y, 17, 66) - 0.55) * 2.2 },
});

// ------------------------------------------------------------------------------------ the hand
/**
 * Sculpt the enormous hand into a height field. o: { cx, cy (palm centre), fwd [x,y] (fingers' way),
 * s (scale, 1 ≈ desk CG), swell 0..1, z (base height), curl 0..1 (gripping a shoulder), cuff (bool),
 * thumbSide (+1/-1) }. Returns { hf, rings: [...], cuff: {...}, nails: [...] } for detail passes.
 */
export function buildHand(w, h, o) {
  const s = o.s ?? 1, sw = o.swell ?? 0, z0 = o.z ?? 0, curl = o.curl ?? 0, ts = o.thumbSide ?? 1;
  const f = norm(o.fwd || [0.6, 0.8]), t = [f[1] * ts, -f[0] * ts]; // t: toward the thumb
  const P = (a, b) => [o.cx + f[0] * a * s + t[0] * b * s, o.cy + f[1] * a * s + t[1] * b * s];
  const hf = new HField(w, h, 0.17 / s);
  const R = (r) => r * s * (1 + sw * 0.04);
  const FM = o.mat ?? M.FLESH;
  // every volume rests on the surface below (z0): no cliffs, so no false outlines inside the hand
  { const [ax, ay] = P(-60, 0), [bx, by] = P(14, 0); hf.tube(ax, ay, R(50), bx, by, R(55), { mat: FM, z0, z1: z0, k: 0.52 }); }
  { const [cx, cy] = P(-14, 32); hf.blob(cx, cy, R(30), R(28), R(24), { base: z0, mat: FM, p: 0.6 }); }   // thumb pad
  { const [cx, cy] = P(-96, 0); hf.blob(cx, cy, R(58), R(60), R(44), { base: z0, mat: FM, p: 0.6 }); }   // wrist bulging from the cuff
  const rings = [], nails = [];
  const fingers = [
    { b: 34, ang: -0.3, len: [40, 31, 25], r: 16.5 },
    { b: 11, ang: -0.07, len: [45, 34, 28], r: 18 },
    { b: -12, ang: 0.17, len: [41, 31, 25], r: 17 },
    { b: -33, ang: 0.42, len: [32, 24, 21], r: 14 },
  ];
  fingers.forEach((fg, i) => {
    let [x, y] = P(30, fg.b * 0.9);
    let a = Math.atan2(f[1], f[0]) + fg.ang * ts; // fan out away from the thumb side
    let r = fg.r;
    for (let k = 0; k < 3; k++) {
      const L = fg.len[k] * s * (1 + sw * 0.02);
      a += curl * [0.55, 0.75, 0.6][k] * ts * 0.6;
      const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
      const r1 = r * (k === 2 ? 0.86 : 0.94);
      const zz = z0 + (curl ? (k === 0 ? R(10) : k === 1 ? R(6) : 0) : 0);
      hf.tube(x, y, R(r), nx, ny, R(r1), { mat: FM, z0: zz, z1: zz, k: 0.85 });
      if (k === 0) rings.push({ i, x0: x, y0: y, x1: nx, y1: ny, r: R(r), a, z: zz });
      if (k === 2) nails.push({ x: x + Math.cos(a) * L * 0.74, y: y + Math.sin(a) * L * 0.74, a, r: R(r1), z: zz });
      fg.joints = fg.joints || []; fg.joints.push([nx, ny, a, R(r1)]);
      x = nx; y = ny; r = r1;
    }
  });
  // thumb, tucked along the side
  { const [x0, y0] = P(-6, 50), [x1, y1] = P(28, 68), [x2, y2] = P(54, 74);
    hf.tube(x0, y0, R(21), x1, y1, R(18), { mat: FM, z0, z1: z0, k: 0.85 });
    hf.tube(x1, y1, R(18), x2, y2, R(15), { mat: FM, z0, z1: z0, k: 0.85 });
    nails.push({ x: x1 + (x2 - x1) * 0.82, y: y1 + (y2 - y1) * 0.82, a: Math.atan2(y2 - y1, x2 - x1), r: R(15), z: z0 }); }
  hf.finalize();
  // knuckle creases across each finger joint; fat rolls at the wrist
  fingers.forEach((fg) => {
    const [kx, ky] = P(30, fg.b * 0.9);
    hf.groove([[kx - t[0] * R(13), ky - t[1] * R(13)], [kx + f[0] * R(4), ky + f[1] * R(4)], [kx + t[0] * R(13), ky + t[1] * R(13)]], R(4), R(3.5));
    for (const [jx, jy, ja, jr] of fg.joints.slice(0, 2)) {
      const px = -Math.sin(ja), py = Math.cos(ja);
      hf.groove([[jx - px * jr, jy - py * jr], [jx + Math.cos(ja) * jr * 0.15, jy + Math.sin(ja) * jr * 0.15], [jx + px * jr, jy + py * jr]], jr * 0.3, jr * 0.24);
    }
  });
  for (let k = 0; k < 3; k++) { const [ax, ay] = P(-46 - k * 13, 56), [bx, by] = P(-52 - k * 13, 0), [cx, cy] = P(-46 - k * 13, -56); hf.fold([[ax, ay], [bx, by], [cx, cy]], R(4), R(7)); }
  return { hf, rings, nails, P, f, t, R };
}
const FLESHY = new Set([M.FLESH, 62]);
function norm([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

/** Rings sunk into the fingers: a gold band in a groove, flesh bulging on both sides; stones. */
export function sinkRings(hf, H_, which = [0, 1, 3]) {
  const out = [];
  for (const ri of H_.rings) {
    if (!which.includes(ri.i)) continue;
    const u = 0.42, cx = ri.x0 + (ri.x1 - ri.x0) * u, cy = ri.y0 + (ri.y1 - ri.y0) * u;
    const px = -Math.sin(ri.a), py = Math.cos(ri.a);
    const hw = ri.r * 1.05, bw = ri.r * 0.26;
    // groove where the ring cuts in, then the band itself sits below the bulges
    hf.groove([[cx - px * hw, cy - py * hw], [cx, cy], [cx + px * hw, cy + py * hw]], bw * 1.6, ri.r * 0.35);
    out.push({ cx, cy, px, py, hw, bw, a: ri.a, i: ri.i, r: ri.r });
  }
  return out;
}
export function paintRings(gb, rings, stoneMats = [M.RIB_R, M.DARK, null, null]) {
  for (const rg of rings) {
    const ax = Math.cos(rg.a), ay = Math.sin(rg.a);
    for (let k = -rg.hw; k <= rg.hw; k += 0.5) for (let j = -rg.bw; j <= rg.bw; j += 0.5) {
      const x = Math.round(rg.cx + rg.px * k + ax * j), y = Math.round(rg.cy + rg.py * k + ay * j);
      if (!FLESHY.has(gb.matAt(x, y))) continue;
      const i = y * gb.w + x;
      // the band's visible arc only where it isn't swallowed (thin at the sides)
      const side = Math.abs(k) / rg.hw;
      if (side > 0.9) continue;
      gb._put(i, M.GOLD, rg.px * (k / rg.hw) * 0.9 + ax * (j / rg.bw) * 0.4, rg.py * (k / rg.hw) * 0.9 + ay * (j / rg.bw) * 0.4, 0.8, gb.z[i] + 0.5, { mode: 'any', ao: 1, lum: 0 });
    }
    const st = stoneMats[rg.i];
    if (st) { // a signet / a dull red stone, set in the band
      const sx = rg.cx, sy = rg.cy, rr = rg.bw * 2.2;
      gb.ell(sx, sy, rr, rr, { mat: M.GOLD, z: gb.z[Math.round(sy) * gb.w + Math.round(sx)] + 0.5, rz: rr * 0.6, mode: 'any' });
      gb.ell(sx, sy, rr * 0.62, rr * 0.62, { mat: st, z: gb.z[Math.round(sy) * gb.w + Math.round(sx)] + 1, rz: rr * 0.5, mode: 'any' });
    }
  }
}
export function paintNails(gb, nails) {
  for (const n of nails) {
    const ax = Math.cos(n.a), ay = Math.sin(n.a);
    // small nails sunk in puffed fingertips
    for (let k = -n.r * 0.45; k <= n.r * 0.45; k += 0.5) for (let j = -n.r * 0.35; j <= n.r * 0.4; j += 0.5) {
      const e = (k / (n.r * 0.45)) ** 2 + (j / (n.r * 0.4)) ** 2; if (e > 1) continue;
      const x = Math.round(n.x - ay * k + ax * j), y = Math.round(n.y + ax * k + ay * j);
      if (!FLESHY.has(gb.matAt(x, y))) continue;
      const i = y * gb.w + x;
      gb._put(i, M.NAIL, gb.nx[i] * 0.6, gb.ny[i] * 0.6, 1, gb.z[i] + 0.3, { mode: 'any', ao: e > 0.7 ? 0.75 : 1, lum: 0 });
    }
  }
}

// ------------------------------------------------------------------------------------ desk scene
const HAND_RIG = (dim) => rig({
  amb: dim ? 0.07 : 0.13, shadowTint: dim ? '#4a5260' : '#6e7684', keyTint: '#f2fff4', exposure: 1.02, gamma: 1.1,
  lights: [{ d: [0.18, -0.55, 0.82], i: dim ? 0.4 : 0.86, sh: 70, shK: 0.42, bias: 1.5 }, { d: [-0.6, 0.3, 0.75], i: 0.08, spec: 0 }],
});

export function buildDeskScene({ swell = 0, dim = 0 } = {}) {
  const gb = new GBuf(W, H);
  const r = rng(1018);
  // ---- desk top (flat, camera straight above), far edge with the dark floor beyond
  gb.poly([[0, 14], [W, 8], [W, H], [0, H]], { mat: SM.DESK, z: 0, n: [0, 0, 1] });
  gb.poly([[0, 10], [W, 4], [W, 9], [0, 15]], { mat: SM.DESK_EDGE, z: 0, n: [0, -0.7, 0.7] });
  // pencil groove & pencil
  for (let x = 30; x < 330; x++) { const y = Math.round(24 - x * 0.012); gb.dim(x, y, 0.55); gb.dim(x, y + 1, 1, 0.05); }
  gb.cap(190, 21, 2, 262, 20, 2, { mat: M.GOLD, z: 3, rzk: 1, mode: 'any' });
  gb.cap(262, 20, 2, 268, 20, 1.2, { mat: SM.WOOD, z: 3, rzk: 1, mode: 'any' });
  gb.cap(184, 21, 2.1, 190, 21, 2.1, { mat: M.RIB_R, z: 3.2, rzk: 1, mode: 'any' });
  // carved initials, scratches, ink
  carve(gb, 318, 44, 'KR 91', 2);
  carve(gb, 70, 226, 'J+M', 2);
  carve(gb, 392, 112, 'HOLLOW', 1);
  for (let k = 0; k < 40; k++) { const x = r() * W, y = 20 + r() * (H - 20), a = r() * 0.6 - 0.3, L = 6 + r() * 30; gb.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, null, { k: 0.85 + r() * 0.08 }); }
  for (let k = 0; k < 3; k++) { const x = 380 + r() * 80, y = 30 + r() * 60; gb.ell(x, y, 3 + r() * 4, 2 + r() * 3, { mat: SM.DESK, z: 0.1, rz: 0.5, mode: 'any', ao: 0.55 }); }
  // ---- Tess: arms folded on the desk, head down on them, face turned toward the hand
  const tf = new HField(W, H, 0.12);
  // folded forearms (denim, sleeves pushed up)
  tf.tube(196, 262, 26, 470, 246, 29, { mat: SM.DENIM, z0: 18, z1: 20, k: 0.75 });
  tf.tube(250, 292, 28, 488, 276, 30, { mat: SM.DENIM, z0: 22, z1: 22, k: 0.75 });
  tf.blob(176, 258, 20, 15, 16, { base: 8, mat: SM.SKIN, p: 0.6 });                     // her hand, curled
  for (let k = 0; k < 4; k++) tf.tube(164 + k * 3, 247 + k * 6.5, 6, 152 + k * 2.5, 252 + k * 6.5, 5.5, { mat: SM.SKIN, z0: 18, z1: 16, k: 0.8 });
  tf.tube(176, 256, 14, 202, 260, 18, { mat: SM.SKIN, z0: 14, z1: 18, k: 0.8 });        // wrist
  // her face, turned left, cheek on the arm
  tf.blob(300, 240, 34, 30, 34, { base: 26, mat: SM.SKIN, p: 0.6 });
  tf.blob(278, 232, 10, 9, 8, { base: 50, mat: SM.SKIN, p: 0.6 });                      // nose tip
  tf.blob(358, 222, 66, 54, 30, { base: 22, mat: SM.HAIR_R, p: 0.5 });                    // under-layer of hair
  tf.finalize();
  // hair: locks from her hairline sweeping back over the crown and spilling down over her arm
  const lock = (x0, y0, z0, ang, L, bend, r0, droop) => {
    let px = x0, py = y0, pz = z0;
    for (let j = 1; j <= 7; j++) {
      const u = j / 7, a = ang + bend * u;
      const nx = x0 + Math.cos(ang + bend * u * 0.5) * L * u, ny = y0 + Math.sin(ang + bend * u * 0.5) * L * u + droop * u * u;
      const nz = z0 + (u < 0.45 ? u * 10 : 4.5 - (u - 0.45) * (z0 - 16) * 1.6);
      tf.tube(px, py, r0 * (1 - (j - 1) / 7 * 0.75), nx, ny, r0 * (1 - j / 7 * 0.75), { mat: SM.HAIR_R, z0: pz, z1: Math.max(16, nz), k: 0.5 });
      px = nx; py = ny; pz = Math.max(16, nz);
    }
  };
  for (let k = 0; k < 46; k++) {
    const t = k / 45, a0 = Math.PI * (0.75 + t * 0.95);          // around the hairline (left side of her head)
    const x0 = 352 + Math.cos(a0) * 44 + (r() - 0.5) * 8, y0 = 214 + Math.sin(a0) * 34 + (r() - 0.5) * 8;
    lock(x0, y0, 66 + r() * 6, -0.15 + (r() - 0.5) * 0.5 + t * 0.25, 90 + r() * 50, 0.6 + r() * 0.5, 9 + r() * 4, 30 + r() * 30);
  }
  for (let k = 0; k < 7; k++) lock(318 + r() * 20, 190 + r() * 16, 70, 2.2 + r() * 0.5, 34 + r() * 20, 0.4, 5, 24); // a few falling over her face
  for (let k = 0; k < 70; k++) { // fine strand grooves along the flow
    const x0 = 312 + r() * 60, y0 = 176 + r() * 50, a = -0.1 + (r() - 0.5) * 0.5, L = 50 + r() * 70;
    const pts = []; for (let j = 0; j <= 6; j++) { const u = j / 6; pts.push([x0 + Math.cos(a + u * 0.7) * L * u, y0 + Math.sin(a + u * 0.7) * L * u + u * u * 30]); }
    tf.groove(pts, 1.1, 1 + r() * 1.6);
  }
  // sleeve folds, the rolled cuff
  for (let k = 0; k < 6; k++) { const x = 230 + k * 40 + r() * 10; tf.groove([[x, 238], [x + 6, 252], [x + 2, 268]], 3, 4); }
  tf.toGB(gb);
  // her face: eye squeezed shut, knitted brow, freckles
  gb.curve(287, 220, 296, 226, 307, 222, (x, y) => { gb.pix(x, y, SM.LASH, { mode: 'over' }); gb.pix(x, y + 1, SM.LASH, { mode: 'over', lum: 0.15 }); });
  for (let k = 0; k < 4; k++) gb.line(290 + k * 5, 226, 289 + k * 5, 229, SM.LASH, { mode: 'over' });
  gb.curve(285, 214, 296, 216, 306, 213, (x, y) => gb.dim(x, y, 0.7));               // crease above the shut lid
  gb.curve(286, 207, 298, 206, 308, 210, (x, y) => gb.pix(x, y, SM.HAIR_R, { mode: 'over', lum: -0.15 })); // brow
  for (let k = 0; k < 12; k++) { const x = 284 + r() * 34, y = 230 + r() * 22; if (gb.matAt(x | 0, y | 0) === SM.SKIN) gb.pix(x, y, SM.FRECKLE, { mode: 'over' }); }
  // ---- the hand (with its cuff), resting beside her face
  const hand = buildHand(W, H, { cx: 150, cy: 112, fwd: [0.62, 0.78], s: 1, swell, z: 0, thumbSide: 1, mat: SM.HFLESH });
  const rings = sinkRings(hand.hf, hand, [0, 1, 3]);
  // cuff: the frock coat's sleeve coming in from the top-left corner, a turned-back cuff band at its end
  const cuff = new HField(W, H, 0.12);
  { const [ax, ay] = hand.P(-280, 0), [bx, by] = hand.P(-150, 0); cuff.tube(ax, ay, 82, bx, by, 74, { mat: SN.NAVY, z0: 6, z1: 10, k: 0.6 }); }
  { const [ax, ay] = hand.P(-156, 0), [bx, by] = hand.P(-128, 0); cuff.tube(ax, ay, 80, bx, by, 78, { mat: SN.NAVY, z0: 14, z1: 14, k: 0.6 }); }
  cuff.finalize();
  { const [ax, ay] = hand.P(-156, -80), [bx, by] = hand.P(-158, 0), [cx, cy] = hand.P(-156, 80); cuff.groove([[ax, ay], [bx, by], [cx, cy]], 4, 9); }
  for (let k = 0; k < 4; k++) { const [ax, ay] = hand.P(-185 - k * 26, -76), [bx, by] = hand.P(-200 - k * 26, 6), [cx, cy] = hand.P(-190 - k * 26, 70); cuff.groove([[ax, ay], [bx, by], [cx, cy]], 7, 8); }
  hand.hf.maxWith(cuff);
  hand.hf.toGB(gb);
  paintRings(gb, rings);
  paintNails(gb, hand.nails);
  // cuff edge: frayed threads + the brass cuff button
  { const [ex, ey] = hand.P(-129, 0), px = -hand.f[1], py = hand.f[0];
    for (let k = -80; k <= 80; k += 2) {
      const x = Math.round(ex + px * k), y = Math.round(ey + py * k);
      if (gb.matAt(x, y) !== SN.NAVY) continue;
      gb.dim(x, y, 0.55);
      const L = 2 + ((k * 7) & 3);
      for (let j = 1; j <= L; j++) { const xx = Math.round(x + hand.f[0] * j), yy = Math.round(y + hand.f[1] * j); if ((k & 2) && FLESHY.has(gb.matAt(xx, yy))) gb.pix(xx, yy, SN.NAVY, { mode: 'any', lum: -0.05 }); }
    }
    for (const [ba, bb] of [[-143, 40], [-143, 58], [-143, 22]]) { // three small cuff buttons along the seam
      const [bx, by] = hand.P(ba, bb);
      if (!gb.matAt(Math.round(bx), Math.round(by))) continue;
      const bz = gb.z[Math.round(by) * W + Math.round(bx)];
      gb.ell(bx, by, 6.5, 6.5, { mat: M.BRASS, z: bz + 1, rz: 3, mode: 'any' });
      gb.ell(bx - 1, by - 1, 2.5, 2.5, { mat: M.BRASS, z: bz + 2.5, rz: 2, mode: 'any' });
      gb.dim(Math.round(bx + 4), Math.round(by + 6), 0.6); gb.dim(Math.round(bx + 5), Math.round(by + 5), 0.6);
    }
  }
  // knuckle hairs & fine creases on the swollen back of the hand
  for (let k = 0; k < 14; k++) { const [x, y] = hand.P(10 + r() * 18, -40 + r() * 80); gb.line(x, y, x + 3, y + 2, null, { k: 0.8 }); }
  gb.folds(2.4, 0.72, 0.9);
  gb.ssao(6, 0.018, 0.35);
  const img = shade(gb, HAND_RIG(dim), {
    focus: (x, y) => { const d = Math.hypot((x - 230) / 330, (y - 150) / 230); return 1 - Math.min(1, d * d) * 0.75; },
  });
  return imgToCanvas(img);
}
const SN = { NAVY: SM.NAVY_CUFF };

// cut letters into a surface: dark groove with a lit lower lip
const GLYPHS = {
  K: ['1001', '1010', '1100', '1010', '1001'], R: ['1110', '1001', '1110', '1010', '1001'], 9: ['0110', '1001', '0111', '0001', '0110'], 1: ['0100', '1100', '0100', '0100', '1110'],
  J: ['0011', '0001', '0001', '1001', '0110'], M: ['10001', '11011', '10101', '10001', '10001'], '+': ['000', '010', '111', '010', '000'], H: ['1001', '1001', '1111', '1001', '1001'],
  O: ['0110', '1001', '1001', '1001', '0110'], L: ['1000', '1000', '1000', '1000', '1111'], W: ['10001', '10001', '10101', '11011', '10001'], ' ': ['00', '00', '00', '00', '00'],
};
export function carve(gb, x0, y0, text, sc = 2) {
  let cx = x0;
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] !== '1') continue;
      for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) {
        const x = cx + i * sc + a, y = y0 + j * sc + b + Math.round((i + j) * 0.2);
        if ((x * 3 + y) % 7 === 0) continue; // the knife skipped
        gb.dim(x, y, 0.5); gb.dim(x, y + 1, 1, 0.04);
      }
    }
    cx += (g[0].length + 1) * sc;
  }
}
