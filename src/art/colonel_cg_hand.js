// colonel_hand (Ch2 heads-down; Ch8 Register under mine-fire red): Tess's desk from just above. She is
// small and frightened — copper hair spilling over her folded denim arms, one squeezed-shut eye and a
// sliver of freckled cheek. Beside her face the Colonel's hand rests flat on the laminate: enormous
// (the palm alone bigger than her head), waxy and mottled, rings sunk into the flesh, yellowed nails
// too long with dirt under them, the wrist vanishing into a wet navy cuff stretched to bursting.
//
// Layers (all cel-shaded through colonel_cg_cel.js): the background (desk + Tess) lit and in shadow,
// the hand (+cuff + sleeve, larger than the frame so it can slide in), and the hand's cast-shadow
// mask. compose() puts them together for any reach / slack / breath / flicker state.
import { HField } from './colonel_gbuf.js';
import { Cel, celMat, light, shadeCel, outline, gradeLUT, packTones, bay, h01, vn, fbm, clamp, lerp, sstep, quad } from './colonel_cg_cel.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;

// ------------------------------------------------------------------------------------------ materials
export const CM = {
  DESK: 1, DESK_G: 2, FLOOR: 3, DESK_EDGE: 4, CARVE: 5,
  DENIM: 10, DENIM_D: 11, STITCH: 12, SKIN: 13, CHEEK: 14, FRECKLE: 15, HAIR: 16, LASH: 17, TNAIL: 18,
  FLESH: 20, FLESH_R: 21, FLESH_Y: 22, FLESH_V: 23, SPOT: 24, NAIL: 25, GHAIR: 26, GOLD: 27, STONE: 28, VEIN: 29, NAIL_BED: 35,
  WOOL: 30, WOOL_W: 31, BRASS: 32, VERD: 33, THREAD: 34,
  PENCIL: 40, PWOOD: 41, GRAPHITE: 42, ERASER: 43, FERRULE: 44,
};
const T7 = [0.1, 0.22, 0.37, 0.55, 0.74, 0.97];
const T6 = [0.1, 0.24, 0.42, 0.62, 0.84];
const T5 = [0.12, 0.3, 0.52, 0.76];
// the desk & room
celMat(CM.DESK, { ramp: ['#0b0908', '#1d1611', '#352a20', '#524331', '#705d43', '#8d7756', '#a99169'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0.05, seam: false });
celMat(CM.DESK_G, { ramp: ['#090706', '#18120d', '#2d231a', '#45382a', '#60503a', '#7b684b', '#93805c'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0.05, seam: false });
celMat(CM.CARVE, { ramp: ['#060504', '#120e0a', '#221a13', '#33281d', '#44372a', '#574734', '#6a583f'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0 });
celMat(CM.FLOOR, { ramp: ['#020203', '#050608', '#0a0b0f', '#111318', '#1a1c22'], th: [0.1, 0.25, 0.45, 0.7], dith: 0.05, seam: false });
celMat(CM.DESK_EDGE, { ramp: ['#060606', '#121214', '#222226', '#3a3a40', '#5a5a62', '#86868e'], th: T6, dith: 0 });
// Tess
celMat(CM.DENIM, { ramp: ['#0d1220', '#1a2740', '#2c4262', '#456285', '#6787aa', '#8eabc9', '#b5cadf'], th: T7, dith: 0, line: 0, lineLit: 1, gap: 2.5 });
celMat(CM.DENIM_D, { ramp: ['#090d18', '#131d33', '#203150', '#31486c', '#47638a', '#5f7ea4', '#7d98ba'], th: T7, dith: 0, line: 0, gap: 2.5 });
celMat(CM.STITCH, { ramp: ['#2a1408', '#5a2e10', '#8a4c1c', '#b8763a', '#d89c5c', '#eebc80'], th: T6, dith: 0 });
celMat(CM.SKIN, { ramp: ['#2a1410', '#5a3024', '#8c5240', '#bb7b60', '#dca084', '#f0c4a6', '#fbe0c9'], th: T7, dith: 0, line: 1, lineLit: 2, gap: 2 });
celMat(CM.CHEEK, { ramp: ['#2a1210', '#5c2a24', '#904638', '#bf6a56', '#dc8c76', '#efb098', '#f9ccb8'], th: T7, dith: 0, line: 1, lineLit: 2, gap: 2 });
celMat(CM.FRECKLE, { ramp: ['#2a120a', '#4a2214', '#6c331e', '#8c482c', '#a85e3c', '#bb7048', '#c98058'], th: T7, dith: 0 });
celMat(CM.HAIR, { ramp: ['#140504', '#3a1007', '#641d0b', '#8f2f12', '#b4461b', '#d96a2a', '#f3994f'], th: [0.08, 0.2, 0.36, 0.54, 0.8, 0.98], dith: 0, line: 0, lineLit: 1, gap: 2.2, spec: { at: 0.9, w: 0.07, k: 0.32 } });
celMat(CM.LASH, { ramp: ['#0c0403', '#200906', '#36100a', '#4e190e', '#662414'], th: T5, dith: 0 });
celMat(CM.TNAIL, { ramp: ['#2a1814', '#5c3a34', '#94665a', '#c4968a', '#e6bcb0', '#f8dcd2'], th: T6, dith: 0 });
// the Colonel's hand: waxy gray-pink, livid in the creases, mottled
const FL = { th: [0.12, 0.25, 0.42, 0.62, 0.86, 0.99], dith: 0, line: 0, lineLit: 2, gap: 2.4, spec: { at: 0.965, w: 0.035, k: 0.4 } };
celMat(CM.FLESH, { ramp: ['#1b1118', '#3b2630', '#634a50', '#8e7375', '#b29c96', '#d1c1b4', '#ebe1d0'], ...FL });
celMat(CM.FLESH_R, { ramp: ['#1d0f17', '#43232e', '#70424b', '#9a696c', '#ba8f88', '#d5b2a4', '#ebd4c4'], ...FL });
celMat(CM.FLESH_Y, { ramp: ['#1a1513', '#3a3027', '#635746', '#8b816c', '#ada38c', '#ccc4aa', '#e7e1c9'], ...FL });
celMat(CM.FLESH_V, { ramp: ['#150c19', '#311e38', '#543856', '#785a74', '#987c90', '#b49eaa', '#d0c2c8'], ...FL });
celMat(CM.VEIN, { ramp: ['#17121c', '#352a3a', '#5a4c60', '#80748a', '#a39cac', '#c2bcc6', '#ddd8dc'], ...FL, line: null });
celMat(CM.SPOT, { ramp: ['#1c130d', '#3a281b', '#5a3f29', '#77583a', '#90704d', '#a5845f', '#b69672'], ...FL, line: null });
celMat(CM.NAIL, { ramp: ['#1a140a', '#40341e', '#6e5e3c', '#9a8860', '#bba97c', '#d6c89c', '#efe6c4'], th: [0.12, 0.25, 0.42, 0.62, 0.86, 0.99], dith: 0, line: 0, lineLit: 2, gap: 6, spec: { at: 0.96, w: 0.04, k: 0.45 } });
celMat(CM.NAIL_BED, { ramp: ['#1c1214', '#3e2c2a', '#6a5448', '#957c68', '#b8a084', '#d2bea0', '#ece0c4'], th: [0.12, 0.25, 0.42, 0.62, 0.86, 0.99], dith: 0, line: null, spec: { at: 0.96, w: 0.04, k: 0.5 } });
celMat(CM.GHAIR, { ramp: ['#262628', '#4a4a4c', '#767472', '#a29e98', '#c8c4bc', '#e6e2da'], th: T6, dith: 0 });
celMat(CM.GOLD, { ramp: ['#1a1005', '#45300f', '#755a20', '#a48238', '#cba852', '#ead186', '#fff2cc'], th: [0.1, 0.24, 0.4, 0.58, 0.76, 0.92], dith: 0, line: 0, lineLit: 1, gap: 1, spec: { at: 0.96, w: 0.05, k: 0.5 } });
celMat(CM.STONE, { ramp: ['#050207', '#12070e', '#260c18', '#421626', '#662638', '#c89aac'], th: [0.15, 0.32, 0.52, 0.75, 0.97], dith: 0, line: 0, gap: 1, spec: { at: 0.97, w: 0.04, k: 0.8 } });
// the cuff
celMat(CM.WOOL, { ramp: ['#03050a', '#0a0e1b', '#141c35', '#202c4e', '#303f68', '#46578a', '#6a7cab'], th: [0.08, 0.2, 0.36, 0.54, 0.76, 0.97], dith: 0, line: 0, lineLit: 1, gap: 3 });
celMat(CM.WOOL_W, { ramp: ['#020308', '#070a16', '#0e142a', '#172140', '#243458', '#43588a', '#8a9fcc'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.96], dith: 0, line: 0, lineLit: 1, gap: 3, spec: { at: 0.93, w: 0.05, k: 0.4 } });
celMat(CM.BRASS, { ramp: ['#110b04', '#2c200b', '#503c16', '#785e25', '#9f823b', '#c2a55c', '#e4d092'], th: [0.1, 0.24, 0.4, 0.58, 0.78, 0.94], dith: 0, line: 0, gap: 1, spec: { at: 0.95, w: 0.06, k: 0.5 } });
celMat(CM.VERD, { ramp: ['#0b130f', '#18271f', '#2a4134', '#405c4a', '#5a7862', '#7a967e'], th: T6, dith: 0 });
celMat(CM.THREAD, { ramp: ['#141418', '#2e2e36', '#4c4a52', '#6e6a6c', '#928c86', '#b6ae9e'], th: T6, dith: 0 });
// her pencil
celMat(CM.PENCIL, { ramp: ['#161004', '#3e2c0c', '#6c5218', '#9e7c2a', '#c8a43e', '#e8c860'], th: T6, dith: 0, line: 0, gap: 1 });
celMat(CM.PWOOD, { ramp: ['#24160c', '#4e3420', '#7c5838', '#a87c54', '#cca478'], th: T5, dith: 0, line: 0, gap: 1 });
celMat(CM.GRAPHITE, { ramp: ['#08080a', '#18181c', '#2c2c32', '#46464e', '#686872'], th: T5, dith: 0 });
celMat(CM.ERASER, { ramp: ['#2a1014', '#5a2630', '#8c4250', '#b86272', '#d88a96'], th: T5, dith: 0, line: 0, gap: 1 });
celMat(CM.FERRULE, { ramp: ['#141412', '#34342e', '#5c5a50', '#888478', '#b2ae9e', '#dedad0'], th: T6, dith: 0, line: 0, gap: 1 });

const FLESHY = [CM.FLESH, CM.FLESH_R, CM.FLESH_Y, CM.FLESH_V, CM.SPOT, CM.VEIN];

// ------------------------------------------------------------------------------------------ lights & grades
// fluorescent tube overhead, toward the top of the frame: shadows fall down the desk toward Tess
const FLUOR = light({ L: [0.1, -0.66, 0.74], amb: 0.2, key: 0.86, shadow: 0.78, steps: 56,
  falloff: (x, y) => { const d = Math.hypot((x - 238) / 290, (y - 128) / 200); return clamp(1.12 - d * d * 0.95, 0.12, 1.08); } });
// the breaker's fire, from below and in front: everything lit from underneath, shadows thrown back up
const RED = light({ L: [0.22, 0.58, 0.78], amb: 0.03, key: 0.92, shadow: 0.86, steps: 40, rim: [0.15, 0.95, 0.55],
  falloff: (x, y) => { const d = Math.hypot((x - 240) / 300, (y - 250) / 230); return clamp(1.25 - d * d * 0.9, 0.06, 1.12); } });
export const GRADES = {
  fluor: { lit: '#f6fff2', litGain: 1.0, dark: '#a8bcbc', darkGain: 1.0, desat: 0.08 },
  dim: { lit: '#d4ecd2', litGain: 0.9, dark: '#7a9494', darkGain: 0.9, desat: 0.2, shift: -1 },
  red: { lit: '#ff8448', litGain: 1.22, dark: '#6e0a06', darkGain: 0.72, desat: 0.72, crush: 0.62, abyss: '#0c0101' },
  redDim: { lit: '#f07040', litGain: 1.1, dark: '#5a0806', darkGain: 0.66, desat: 0.74, crush: 0.66, abyss: '#0a0101', shift: -1 },
  // the hand gone slack: the blood leaves it (applied to hand layers only, mixed by slack)
  fluorDead: { lit: '#e0ece8', litGain: 0.94, dark: '#4a5a64', darkGain: 0.55, desat: 0.55 },
  redDead: { lit: '#d07050', litGain: 0.98, dark: '#3a0a0a', darkGain: 0.6, desat: 0.8, crush: 0.55, abyss: '#0e0202' },
};
export const LIGHTS = { fluor: FLUOR, red: RED };

// ------------------------------------------------------------------------------------------ geometry helpers
const nrm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t];
}

/**
 * Sculpt the Colonel's hand into a height field (buffer coords = frame − (ox, oy)).
 * o: { C (middle knuckle, frame px), f (fingers' way), s (scale), swell 0..1, z (rest height),
 *      side (+1 right hand / −1 left), curl 0..1, spread, rings: { finger: kind } }
 * Returns the skeleton (frame coords) for the detail passes.
 */
export function sculptHand(hf, o) {
  const s = o.s ?? 1, sw = o.swell ?? 0, side = o.side ?? 1, z0 = o.z ?? 0, curl = o.curl ?? 0, ox = o.ox ?? 0, oy = o.oy ?? 0;
  const f = nrm(o.f), t = [f[1] * side, -f[0] * side];
  const P = (u, v) => [o.C[0] + (f[0] * u + t[0] * v) * s, o.C[1] + (f[1] * u + t[1] * v) * s];
  const B = (u, v) => { const [x, y] = P(u, v); return [x - ox, y - oy]; };
  const R = (r) => r * s * (1 + sw * 0.035);
  const FM = CM.FLESH;
  const blob = (u, v, rx, ry, hgt, p = 0.55, base = z0) => { const [x, y] = B(u, v); hf.blob(x, y, R(rx), R(ry), R(hgt), { base, p, mat: FM }); };
  // the back of the hand: a broad puffy dome that never narrows into a wrist
  { const [ax, ay] = B(-118, -4), [bx, by] = B(-14, -6); hf.tube(ax, ay, R(60), bx, by, R(58), { mat: FM, z0, z1: z0, k: 0.5, p: 0.6 }); }
  blob(-46, 44, 36, 30, 27, 0.6);                   // thumb's fat pad
  blob(-58, -50, 30, 22, 24, 0.6);                  // heel on the little-finger side
  blob(-72, -6, 54, 50, 33, 0.7);                   // swell of the back
  // the wrist, wider than the hand, and the roll of flesh hanging over the cuff
  { const [ax, ay] = B(-172, -2), [bx, by] = B(-108, -4); hf.tube(ax, ay, R(64), bx, by, R(62), { mat: FM, z0, z1: z0, k: 0.56, p: 0.6 }); }
  blob(-118, -4, 15, 68, 39, 0.5);
  // fingers: different lengths and thicknesses; the ring finger strangled by its ring
  const spread = o.spread ?? 1;
  const fingers = [
    { name: 'index', mu: 6, mv: 37, ang: 0.12, len: [47, 29, 24], r: [18, 16.8, 15.6, 13.6] },
    { name: 'middle', mu: 10, mv: 9, ang: 0.02, len: [51, 32, 26], r: [18.4, 17.2, 16, 14] },
    { name: 'ring', mu: 4, mv: -19, ang: -0.1, len: [45, 29, 24], r: [16.8, 16.2, 15, 13.4] },
    { name: 'pinky', mu: -9, mv: -44, ang: -0.25, len: [35, 23, 20], r: [14.4, 13.6, 12.8, 11.6] },
  ];
  const bends = o.bends || [[0.08, 0.1, 0.06], [0.06, 0.08, 0.05], [0.1, 0.12, 0.06], [0.16, 0.2, 0.1]];
  const out = { P, B, f, t, s, side, fingers: [], nails: [], rings: [], thumb: null, z0 };
  fingers.forEach((fg, i) => {
    let [x, y] = P(fg.mu, fg.mv);
    let dir = rot(f, -fg.ang * spread * side);
    let z = z0;
    const joints = [[x, y, z]], segs = [];
    // knuckle pad: fat swallows the knuckle (a dimple, not a bump)
    { const [bx, by] = [x - ox - dir[0] * R(6), y - oy - dir[1] * R(6)]; hf.blob(bx, by, R(fg.r[0] * 1.05), R(fg.r[0] * 1.15), R(fg.r[0] * 1.15), { base: z0, p: 0.6, mat: FM }); }
    for (let k = 0; k < 3; k++) {
      const bend = (bends[i][k] || 0) + curl * [0.75, 1.05, 0.7][k];
      const L = fg.len[k] * s * (1 + sw * 0.01) * Math.cos(Math.min(1.4, bend));
      const nx = x + dir[0] * L, ny = y + dir[1] * L;
      const nz = z + (curl ? Math.sin(Math.min(1.4, bend)) * fg.len[k] * s * (k === 0 ? 0.5 : -0.25) : 0);
      const r0 = R(fg.r[k]), r1 = R(fg.r[k + 1]);
      hf.tube(x - ox, y - oy, r0, nx - ox, ny - oy, r1, { mat: FM, z0: z, z1: Math.max(z0, nz), k: 0.92, p: 0.5 });
      // sausage: each segment bulges between its creases
      const mx = (x + nx) / 2 - ox, my = (y + ny) / 2 - oy, a = Math.atan2(dir[1], dir[0]);
      const bl = R(fg.r[k] * 1.02), bw = L * 0.36;
      hf.blob(mx, my, Math.max(bl, bw), Math.max(bl, bw), (r0 + r1) * 0.5 * 0.99, { base: (z + Math.max(z0, nz)) / 2, p: 0.55, mat: FM, clip: (px, py) => {
        const ux = (px + 0.5 - mx) * Math.cos(a) + (py + 0.5 - my) * Math.sin(a), vy = -(px + 0.5 - mx) * Math.sin(a) + (py + 0.5 - my) * Math.cos(a);
        return (ux / bw) ** 2 + (vy / bl) ** 2 < 1;
      } });
      segs.push({ ax: x, ay: y, bx: nx, by: ny, r0, r1, dir: dir.slice(), L, z });
      x = nx; y = ny; z = Math.max(z0, nz);
      joints.push([x, y, z]);
      // fingers curve slightly toward the middle finger, each its own way
      dir = rot(dir, (i === 0 ? -0.05 : i === 3 ? 0.07 : i === 2 ? 0.03 : 0.01) * side);
    }
    // the bulbous fingertip
    const tip = segs[2], tr = R(fg.r[3]);
    { const tx = tip.bx - tip.dir[0] * tr * 0.15 - ox, ty = tip.by - tip.dir[1] * tr * 0.15 - oy; hf.blob(tx, ty, tr * 1.14, tr * 1.14, tr * 1.0, { base: z, p: 0.55, mat: FM }); }
    out.fingers.push({ ...fg, joints, segs, idx: i, tipR: tr });
  });
  // thumb: lies along the hand, its tip turned in, nail seen edge-on
  {
    const tb = [[-62, 42], [-26, 62], [8, 74], [36, 80]];
    const rr = [20, 18.5, 16.5, 14];
    const pts = tb.map(([u, v]) => P(u + (side > 0 ? 0 : 0), v));
    for (let k = 0; k < 3; k++) hf.tube(pts[k][0] - ox, pts[k][1] - oy, R(rr[k]), pts[k + 1][0] - ox, pts[k + 1][1] - oy, R(rr[k + 1]), { mat: FM, z0, z1: z0, k: 0.85, p: 0.55 });
    const tipD = nrm([pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]]);
    hf.blob(pts[3][0] - ox - tipD[0] * R(2), pts[3][1] - oy - tipD[1] * R(2), R(14.5), R(14.5), R(13), { base: z0, p: 0.55, mat: FM });
    out.thumb = { pts, rr: rr.map(R), tipD };
  }
  hf.finalize();
  // creases: knuckle line, finger joints (deep, on the back), the wrist rolls
  out.fingers.forEach((fg) => {
    for (let k = 1; k < 3; k++) {
      const [jx, jy] = fg.joints[k], d = fg.segs[k].dir, n = [-d[1], d[0]], r = fg.segs[k].r0;
      const pts = [[jx - n[0] * r * 0.95, jy - n[1] * r * 0.95], [jx + d[0] * r * 0.2, jy + d[1] * r * 0.2], [jx + n[0] * r * 0.95, jy + n[1] * r * 0.95]].map(([a, b]) => [a - ox, b - oy]);
      hf.groove(pts, r * (k === 1 ? 0.32 : 0.26), r * (k === 1 ? 0.3 : 0.22));
    }
    // the dimple where a knuckle should be
    const [kx, ky] = fg.joints[0], d = fg.segs[0].dir;
    hf.pit(kx - ox - d[0] * R(4), ky - oy - d[1] * R(4), R(5), R(4), R(1.1), 0.8);
  });
  // ring grooves: the band cuts in, the flesh swells on both sides
  for (const [fi, kind] of Object.entries(o.rings || {})) {
    const fg = out.fingers[fi]; if (!fg) continue;
    const sg = fg.segs[0], u = 0.5, cx = sg.ax + (sg.bx - sg.ax) * u, cy = sg.ay + (sg.by - sg.ay) * u, d = sg.dir, n = [-d[1], d[0]], r = (sg.r0 + sg.r1) / 2;
    hf.groove([[cx - n[0] * r * 1.1 - ox, cy - n[1] * r * 1.1 - oy], [cx - ox, cy - oy], [cx + n[0] * r * 1.1 - ox, cy + n[1] * r * 1.1 - oy]], r * 0.28, r * 0.42);
    out.rings.push({ fi: +fi, kind, cx, cy, d, n, r, z: sg.z });
  }
  // wrist rolls: the flesh folds over itself where it meets the cuff
  for (let k = 0; k < 2; k++) {
    const pts = [B(-100 - k * 14, -66), B(-104 - k * 14, -20), B(-102 - k * 14, 24), B(-96 - k * 14, 62)];
    hf.fold(pts, R(4), R(6 - k * 2));
  }
  return out;
}

/** Per-pixel finger id (nearest finger axis beyond the knuckles; −1 = palm/back). */
function fingerMap(cel, H) {
  const { w, h } = cel, map = new Int8Array(w * h).fill(-1);
  // flatten the axes: [ax, ay, dx, dy, L2, r0, r1, fi, skipStart]
  const S = [];
  H.fingers.forEach((fg, fi) => fg.segs.forEach((sg, k) => {
    const ex = k === 2 ? sg.dir[0] * fg.tipR : 0, ey = k === 2 ? sg.dir[1] * fg.tipR : 0;
    const dx = sg.bx + ex - sg.ax, dy = sg.by + ey - sg.ay;
    S.push([sg.ax, sg.ay, dx, dy, dx * dx + dy * dy || 1e-9, sg.r0, sg.r1, fi, k === 0 ? 1 : 0]);
  }));
  const th = H.thumb;
  for (let k = 1; k < 3; k++) { const dx = th.pts[k + 1][0] - th.pts[k][0], dy = th.pts[k + 1][1] - th.pts[k][1]; S.push([th.pts[k][0], th.pts[k][1], dx, dy, dx * dx + dy * dy || 1e-9, th.rr[k], th.rr[k + 1], 4, 0]); }
  const NS = S.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = cel.mat[i];
    if (!FLESHY.includes(m) && m !== CM.NAIL && m !== CM.NAIL_BED) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    let best = 1.12, bi = -1;
    for (let q = 0; q < NS; q++) {
      const g = S[q];
      let t = ((fx - g[0]) * g[2] + (fy - g[1]) * g[3]) / g[4];
      if (g[8] && t <= 0.02) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = fx - g[0] - g[2] * t, ey = fy - g[1] - g[3] * t;
      const qd = Math.sqrt(ex * ex + ey * ey) / (g[5] + (g[6] - g[5]) * t);
      if (qd < best) { best = qd; bi = g[7]; }
    }
    map[i] = bi;
  }
  return map;
}

/**
 * Paint the hand's surface detail into the cel (after fromHF). This is where it stops being a glove:
 * creases, dimples, the strangled ring finger, mottling, liver spots, gray hairs, the nails.
 */
export function detailHand(cel, H, o = {}) {
  const r = rng(o.seed ?? 1894);
  const { w, h } = cel;
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const isF = (x, y) => { const i = at(x, y); return i >= 0 && FLESHY.includes(cel.mat[i]); };
  const toneF = (x, y, k) => { const i = at(x, y); if (i >= 0 && FLESHY.includes(cel.mat[i])) cel.fix[i] = k; };
  const shiftF = (x, y, d) => { const i = at(x, y); if (i >= 0 && FLESHY.includes(cel.mat[i])) cel.off[i] = Math.max(-5, Math.min(5, cel.off[i] + d)); };
  const setM = (x, y, m) => { const i = at(x, y); if (i >= 0 && FLESHY.includes(cel.mat[i])) cel.mat[i] = m; };
  const fm = fingerMap(cel, H);
  // surface ids per finger → selective outlines between fingers where one rides over the next
  for (let i = 0; i < w * h; i++) if (fm[i] >= 0) cel.sid[i] = 40 + fm[i];
  // 1. mottling: blotches of livid red-violet and sallow yellow, crisp-edged (no airbrush)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (cel.mat[i] !== CM.FLESH) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    if (fm[i] < 0) {
      // livedo: the blood sitting in a net under the skin
      const q = 1 - Math.abs(2 * vn(fx + vn(fx, fy, 9, 57) * 6, fy, 7, 58) - 1), q2 = vn(fx, fy, 22, 59);
      if (q > 0.86 && q2 > 0.38) { cel.mat[i] = CM.FLESH_R; continue; }
      if (fbm(fx + 40, fy - 17, 13, 62) > 0.72) { cel.mat[i] = CM.FLESH_Y; continue; }
      continue;
    }
    const a = fbm(fx, fy, 16, 61), b = fbm(fx + 40, fy - 17, 13, 62);
    if (a > 0.6) cel.mat[i] = CM.FLESH_R;
    else if (b > 0.7) cel.mat[i] = CM.FLESH_Y;
  }
  // 1b. blood where it pools: reddened knuckles and joints, congested fingertips; sallow wax on the tops
  const blush = (cx, cy, rx, ry, m, dens = 0.75) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + (vn(x, y, 3, 55) - 0.5) * 0.6;
      const i = at(x, y); if (i < 0 || e > 1 || cel.mat[i] !== CM.FLESH && cel.mat[i] !== CM.FLESH_Y) continue;
      if (e < 0.55 || bay(x, y) < dens) cel.mat[i] = m;
    }
  };
  H.fingers.forEach((fg) => {
    const [kx, ky] = fg.joints[0]; blush(kx, ky, fg.r[0] * 0.9 * H.s, fg.r[0] * 0.9 * H.s, CM.FLESH_R, 0.5);
    for (let k = 1; k < 3; k++) { const [jx, jy] = fg.joints[k]; blush(jx, jy, fg.segs[k].r0 * 0.75, fg.segs[k].r0 * 0.75, CM.FLESH_R, 0.5); }
    const t = fg.segs[2]; blush(t.bx, t.by, fg.tipR * 1.1, fg.tipR * 1.1, CM.FLESH_R, 0.65);
  });
  { const [x, y] = H.P(-62, 4); blush(x, y, 34 * H.s, 26 * H.s, CM.FLESH_Y, 0.45); }
  // 2. the ring finger beyond its ring: livid, congested
  for (const rg of H.rings) {
    if (rg.kind !== 'stone') continue;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (fm[i] !== rg.fi || !FLESHY.includes(cel.mat[i])) continue;
      const fx = x + cel.ox, fy = y + cel.oy, along = (fx - rg.cx) * rg.d[0] + (fy - rg.cy) * rg.d[1];
      if (along > rg.r * 0.3 + (bay(fx, fy) < 0.5 ? 1 : 0) && cel.mat[i] !== CM.SPOT) cel.mat[i] = CM.FLESH_V;
    }
  }
  // hand-local coordinates (u along the fingers from the middle knuckle, v toward the thumb)
  const [c0x, c0y] = H.P(0, 0);
  const uOf = (fx, fy) => ((fx - c0x) * H.f[0] + (fy - c0y) * H.f[1]) / H.s;
  // 3. the crevices between fingers, only past the webs (the back of the hand is one swollen piece)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (fm[i] < 0) continue;
    const fx = x + cel.ox, fy = y + cel.oy, web = fm[i] === 4 ? -22 : H.fingers[fm[i]].mu + 16 - (fm[i] === 3 ? 6 : 0);
    if (uOf(fx, fy) < web) continue;
    for (const j of [i + 1, i + w, i - 1, i - w]) {
      if (fm[j] >= 0 && fm[j] !== fm[i] && FLESHY.includes(cel.mat[j]) && (fm[i] !== 4 || fm[j] === 0) && (fm[j] !== 4 || fm[i] === 0)) { cel.fix[i] = uOf(fx, fy) < web + 6 ? 1 : 0; break; }
    }
  }
  // 4. the backs of the joints: loose skin bunched into a patch of curved wrinkles, each with a lit lip
  const onFinger = (x, y, fi) => { const i = at(x, y); return i >= 0 && fm[i] === fi && FLESHY.includes(cel.mat[i]) && cel.fix[i] < 0; };
  H.fingers.forEach((fg, fi) => {
    for (let k = 1; k < 3; k++) {
      const [jx, jy] = fg.joints[k], d = fg.segs[k].dir, n = [-d[1], d[0]], rr = fg.segs[k].r0;
      const pa = rr * (k === 1 ? 0.55 : 0.38), pw = rr * 0.78;
      // the patch: the skin is slacker and duller here
      for (let y = Math.floor(jy - rr); y <= jy + rr; y++) for (let x = Math.floor(jx - rr); x <= jx + rr; x++) {
        const a = (x + 0.5 - jx) * d[0] + (y + 0.5 - jy) * d[1], b = (x + 0.5 - jx) * n[0] + (y + 0.5 - jy) * n[1];
        const e = (a / pa) ** 2 + (b / pw) ** 2;
        if (e < 1 && onFinger(x, y, fi) && (e < 0.7 || bay(x, y) < 0.5)) cel.off[at(x, y)] -= 1;
      }
      const nL = k === 1 ? 3 : 2;
      for (let j = 0; j < nL; j++) {
        const m = j - (nL - 1) / 2, along = m * 2.6 * H.s + (r() - 0.5);
        const half = rr * (0.72 - Math.abs(m) * 0.16) * (0.85 + r() * 0.3), bow = -rr * 0.16;
        const cx = jx + d[0] * along, cy = jy + d[1] * along, sk = (r() - 0.5) * 2;
        const pts = quad([cx - n[0] * half + d[0] * sk, cy - n[1] * half + d[1] * sk], [cx + d[0] * bow, cy + d[1] * bow], [cx + n[0] * half - d[0] * sk, cy + n[1] * half - d[1] * sk], 12);
        cel.stroke(pts, (x, y, tt) => {
          if (tt < 0.08 || tt > 0.92 || ((x * 5 + y * 3) % 11 === 0)) return;
          const i = at(x, y); if (i < 0 || fm[i] !== fi || !FLESHY.includes(cel.mat[i])) return;
          cel.off[i] -= 2;
          const lx = Math.round(x + d[0] * 1.2), ly = Math.round(y + d[1] * 1.2), li = at(lx, ly);
          if (li >= 0 && fm[li] === fi && FLESHY.includes(cel.mat[li]) && cel.off[li] >= -1) cel.off[li] += 2;
        });
      }
    }
    // the knuckle: a dimple in the fat, not a bump
    const [kx, ky] = fg.joints[0], d = fg.segs[0].dir, n = [-d[1], d[0]];
    const c = [kx - d[0] * 3 * H.s, ky - d[1] * 3 * H.s], rr = fg.r[0] * 0.24 * H.s;
    cel.stroke(quad([c[0] - n[0] * rr, c[1] - n[1] * rr], [c[0] - d[0] * rr * 0.6, c[1] - d[1] * rr * 0.6], [c[0] + n[0] * rr, c[1] + n[1] * rr], 8), (x, y, tt) => { if (tt > 0.2 && tt < 0.8) shiftF(x, y, -1); });
  });
  // the thumb's joint, and the web between thumb and index
  if (H.thumb) {
    const th = H.thumb, [jx, jy] = th.pts[2], d = th.tipD, n = [-d[1], d[0]], rr = th.rr[2];
    for (let j = 0; j < 3; j++) {
      const m = j - 1, along = m * 2.6 * H.s, half = rr * (0.6 - Math.abs(m) * 0.15);
      const cx = jx + d[0] * along, cy = jy + d[1] * along;
      cel.stroke(quad([cx - n[0] * half, cy - n[1] * half], [cx - d[0] * rr * 0.15, cy - d[1] * rr * 0.15], [cx + n[0] * half, cy + n[1] * half], 10), (x, y, tt) => {
        if (tt < 0.1 || tt > 0.9) return;
        const i = at(x, y); if (i < 0 || fm[i] !== 4 || !FLESHY.includes(cel.mat[i])) return;
        cel.off[i] -= 2;
        const li = at(Math.round(x + d[0] * 1.2), Math.round(y + d[1] * 1.2)); if (li >= 0 && fm[li] === 4 && cel.off[li] >= -1) cel.off[li] += 2;
      });
    }
  }
  // crepe: the old skin of the back of the hand, fine and diagonal
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (fm[i] >= 0 || !FLESHY.includes(cel.mat[i]) || cel.fix[i] >= 0) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    // short wrinkles in two crossing directions, only where the noise says the skin is slack
    const a1 = ((fx * 2 + fy) % 9 + 9) % 9, a2 = ((fx - fy * 2) % 11 + 11) % 11;
    const slack = vn(fx, fy, 12, 78);
    if (slack > 0.5 && ((a1 === 0 && h01(fx >> 2, fy >> 1, 79) < 0.5) || (a2 === 0 && h01(fx >> 1, fy >> 2, 80) < 0.35))) cel.off[i] -= 1;
  }
  // 5. liver spots (irregular, a few large, many small) and fine gray hairs on the back
  const spot = (cx, cy, rad) => {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) / rad + (vn(x, y, 2.2, 71) - 0.5) * 0.7;
      if (d < 1) setM(x, y, CM.SPOT);
    }
  };
  const back = (u, v) => H.P(u, v);
  for (let k = 0; k < 9; k++) { const [x, y] = back(-110 + r() * 100, -48 + r() * 92); spot(x, y, (1.6 + r() * 2.6) * H.s); }
  for (let k = 0; k < 16; k++) { const [x, y] = back(-120 + r() * 140, -54 + r() * 104); spot(x, y, (0.7 + r() * 0.8) * H.s); }
  H.fingers.forEach((fg) => { if (r() < 0.8) { const sg = fg.segs[0], u = 0.2 + r() * 0.5; spot(sg.ax + (sg.bx - sg.ax) * u + (r() - 0.5) * 6, sg.ay + (sg.by - sg.ay) * u + (r() - 0.5) * 6, (0.9 + r() * 1.2) * H.s); } });
  // veins: blue-gray under the waxy skin, wandering and forking toward the wrist (2 px, no darker)
  for (let k = 0; k < 3; k++) {
    let [u, v] = [-18 - r() * 16, -30 + k * 30 + r() * 10];
    const pts = [];
    for (let j = 0; j < 12; j++) { pts.push(back(u, v)); u -= 8 + r() * 3; v += (vn(j * 3, k * 7, 2, 66) - 0.5) * 14 + (k - 1.5) * 1.2; }
    cel.stroke(pts, (x, y, tt) => {
      if (tt < 0.06) return;
      for (const [dx, dy] of [[0, 0], [1, 0]]) { const i = at(x + dx, y + dy); if (i >= 0 && FLESHY.includes(cel.mat[i]) && cel.mat[i] !== CM.SPOT) { cel.mat[i] = CM.VEIN; } }
    });
  }
  // hairs: coarse gray hairs, each a dark curved line with a lit edge
  const hair = (x0, y0, a, L) => {
    let x = x0, y = y0;
    for (let j = 0; j < L; j++) {
      const i = at(Math.round(x), Math.round(y));
      if (i < 0 || !FLESHY.includes(cel.mat[i])) break;
      cel.mat[i] = CM.GHAIR; cel.fix[i] = j === L - 1 ? 3 : 1;
      const si = at(Math.round(x - Math.sin(a)), Math.round(y + Math.cos(a))); if (si >= 0 && FLESHY.includes(cel.mat[si]) && cel.fix[si] < 0) cel.off[si] += 1;
      x += Math.cos(a); y += Math.sin(a); a += 0.16;
    }
  };
  for (let k = 0; k < 22; k++) { const [x, y] = back(-112 + r() * 96, -50 + r() * 96); hair(x, y, Math.atan2(H.f[1], H.f[0]) + (r() - 0.5) * 1.1, 4 + Math.floor(r() * 4)); }
  H.fingers.forEach((fg) => { for (let k = 0; k < 4; k++) { const sg = fg.segs[0], u = 0.1 + r() * 0.4; hair(sg.ax + (sg.bx - sg.ax) * u + (r() - 0.5) * 9, sg.ay + (sg.by - sg.ay) * u + (r() - 0.5) * 9, Math.atan2(sg.dir[1], sg.dir[0]) + (r() - 0.5) * 0.9, 4 + Math.floor(r() * 3)); } });
  // pores / grain: sparse single darker pixels on the lit flesh
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!FLESHY.includes(cel.mat[i]) || cel.fix[i] >= 0) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    if (h01(fx, fy, 81) < 0.006) cel.off[i] -= 1;
  }
}

/** Nails: thick, yellowed, ridged, a little too long, with dirt under the free edge. Frame coords. */
export function paintNails(cel, H, o = {}) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const list = H.fingers.map((fg) => ({ ax: fg.segs[2].ax, ay: fg.segs[2].ay, d: fg.segs[2].dir, L: fg.segs[2].L, z: fg.segs[2].z, tipR: fg.tipR, shift: 0, wk: 1 }));
  if (H.thumb && o.thumb !== false) {
    const th = H.thumb, L = Math.hypot(th.pts[3][0] - th.pts[2][0], th.pts[3][1] - th.pts[2][1]);
    list.push({ ax: th.pts[2][0], ay: th.pts[2][1], d: th.tipD, L, z: H.z0, tipR: th.rr[3], shift: 0.3 * H.side, wk: 0.78 });
  }
  const long = o.long ?? 1;
  for (const N of list) {
    const d = N.d, n = [-d[1], d[0]], tipR = N.tipR;
    const fleshEnd = N.L + tipR * 0.9;
    const base = fleshEnd - tipR * 1.3, end = fleshEnd + 3.6 * H.s * long;   // the free edge: too long
    const hw = tipR * 0.5 * N.wk, bc = N.shift * tipR;
    const R2 = tipR * 3 + 8;
    const cx = N.ax + d[0] * fleshEnd, cy = N.ay + d[1] * fleshEnd;
    for (let y = Math.floor(cy - R2); y <= cy + R2; y++) for (let x = Math.floor(cx - R2); x <= cx + R2; x++) {
      const px = x + 0.5 - N.ax, py = y + 0.5 - N.ay, a = px * d[0] + py * d[1], b = px * n[0] + py * n[1] - bc;
      if (a < base || a > end) continue;
      const kb = hw * 0.75, ke = hw * 0.55;
      const capB = a < base + kb ? Math.sqrt(Math.max(0, 1 - ((base + kb - a) / kb) ** 2)) : 1;
      const capE = a > end - ke ? Math.sqrt(Math.max(0, 1 - ((a - (end - ke)) / ke) ** 2)) : 1;
      const lim = hw * Math.min(capB, capE) * (1 + 0.08 * (a - base) / (end - base));
      if (Math.abs(b) > lim) continue;
      const i = at(x, y); if (i < 0) continue;
      const onFlesh = FLESHY.includes(cel.mat[i]) || cel.mat[i] === CM.NAIL || cel.mat[i] === CM.NAIL_BED;
      if (!onFlesh && a < fleshEnd - 1.5) continue;
      const q = b / Math.max(1, lim);
      const nzz = Math.sqrt(Math.max(0.08, 1 - q * q * 0.8));
      const zz = (onFlesh && cel.mat[i] !== CM.NAIL && cel.mat[i] !== CM.NAIL_BED ? cel.z[i] : N.z + tipR * 0.9) + 1.2;
      const hyp = fleshEnd - 1.4 - q * q * 2.4;            // where the nail leaves its bed: a curved line
      const free = a > hyp;
      cel.put(x - cel.ox, y - cel.oy, free ? CM.NAIL : CM.NAIL_BED, { z: zz, n: [n[0] * q * 0.75 + d[0] * 0.12, n[1] * q * 0.75 + d[1] * 0.12, nzz], sid: free ? 61 : (cel.sid[i] || 60), fix: -1, off: 0 });
      cel.lum[i] = 0;
      if (a - base < 1.3 + q * q * 1.6) { cel.mat[i] = CM.FLESH_R; cel.off[i] = -2; }                 // the cuticle fold, swollen over the root
      else if (Math.abs(q) > 0.82 && a < fleshEnd - 1) { cel.mat[i] = CM.FLESH; cel.off[i] = -1; }   // sides sunk in the fingertip
      else if (a > hyp - 1.7 && a <= hyp) { cel.mat[i] = CM.NAIL; cel.fix[i] = a > hyp - 0.85 ? 0 : 1; }   // the dirt under it
      else if (free) cel.off[i] = 1;                                                                   // free edge: opaque, paler
      else {
        if (Math.abs(((q + 1) * 2.3) % 1 - 0.5) < 0.1) cel.off[i] = -1;                                 // ridges
        if (a - base < 3.2) cel.off[i] -= 1;                                                            // the dull root
        if (Math.abs(q + 0.35) < 0.14 && a - base > 3 && a < hyp - 2.5) cel.off[i] += 2;                // the gloss streak
      }
    }
  }
}

/** Rings: a gold band sunk between two lips of flesh; the signet, or a dark stone in a claw setting. */
export function paintRings(cel, H) {
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  for (const rg of H.rings) {
    const { cx, cy, d, n, r } = rg;
    const bw = 2.4 * H.s;
    for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.5; y++) for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
      if (Math.abs(a) > bw || Math.abs(b) > r * 0.98) continue;
      const i = at(x, y); if (i < 0 || !FLESHY.includes(cel.mat[i])) continue;
      const q = b / r;
      // swallowed at the sides: only a sliver of band shows where the flesh bulges over it
      if (Math.abs(a) > bw * (1 - Math.abs(q) * 0.55)) continue;
      cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: cel.z[i] + 0.4, n: [n[0] * q * 0.9 + d[0] * (a / bw) * 0.5, n[1] * q * 0.9 + d[1] * (a / bw) * 0.5, Math.sqrt(Math.max(0.1, 1 - q * q))], sid: 70, fix: -1, off: 0 });
    }
    // the flesh lips: a dark line where flesh meets metal, a bright roll just beyond
    for (const sgn of [-1, 1]) {
      for (let k = -r; k <= r; k += 0.5) {
        const q = k / r, aa = sgn * (bw * (1 - Math.abs(q) * 0.55) + 0.8);
        const x = Math.round(cx + d[0] * aa + n[0] * k), y = Math.round(cy + d[1] * aa + n[1] * k);
        const i = at(x, y); if (i < 0 || !FLESHY.includes(cel.mat[i])) continue;
        cel.fix[i] = 0;
        const x2 = Math.round(cx + d[0] * (aa + sgn * 2.2) + n[0] * k), y2 = Math.round(cy + d[1] * (aa + sgn * 2.2) + n[1] * k);
        const j = at(x2, y2); if (j >= 0 && FLESHY.includes(cel.mat[j]) && cel.fix[j] < 0 && q < 0.4) cel.off[j] += 1;
      }
    }
    if (rg.kind === 'signet') {
      // a flat oval face turned up to the light, an engraved crest worn nearly smooth
      const rx = r * 0.62, ry = r * 0.5;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy, a = px * d[0] + py * d[1], b = px * n[0] + py * n[1];
        const e = (a / ry) ** 2 + (b / rx) ** 2; if (e > 1) continue;
        const i = at(x, y); if (i < 0) continue;
        const rim = e > 0.62;
        cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: (cel.z[i] || rg.z) + 3, n: rim ? [px / rx, py / rx, 0.7] : [0.05, -0.05, 1], sid: 71, fix: -1, off: rim ? 0 : -1 });
        if (!rim && e < 0.4 && ((Math.abs(b) < 0.8) || (Math.abs(a) < 0.8 && Math.abs(b) < rx * 0.4) || (Math.abs(Math.abs(b) - rx * 0.35) < 0.6 && a > -1))) cel.fix[i] = 2;
      }
    } else if (rg.kind === 'stone') {
      const sr = r * 0.52;
      for (let y = Math.floor(cy - sr - 3); y <= cy + sr + 3; y++) for (let x = Math.floor(cx - sr - 3); x <= cx + sr + 3; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy, e = Math.hypot(px, py);
        const i = at(x, y); if (i < 0) continue;
        if (e < sr) cel.put(x - cel.ox, y - cel.oy, CM.STONE, { z: rg.z + r + 5, n: [px / sr * 0.8, py / sr * 0.8, Math.sqrt(Math.max(0.1, 1 - (e / sr) ** 2 * 0.64))], sid: 72, fix: -1, off: 0 });
        else if (e < sr + 1.6) cel.put(x - cel.ox, y - cel.oy, CM.GOLD, { z: rg.z + r + 4, n: [px / e, py / e, 0.6], sid: 71, fix: -1, off: 0 });
      }
      // claws
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6, x = Math.round(cx + Math.cos(a) * (sr + 0.5)), y = Math.round(cy + Math.sin(a) * (sr + 0.5)); const i = at(x, y); if (i >= 0) { cel.mat[i] = CM.GOLD; cel.fix[i] = 5; } }
    }
  }
}

/** An uncapped cylinder (a sleeve is cut flat where the hand comes out): z = zbase + r·k·√(1−q²). */
export function cylinder(hf, a, b, ra, rb, za, zb, o = {}) {
  const k = o.k ?? 0.6, mat = o.mat, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2);
  const pad = Math.max(ra, rb) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad)), x1 = Math.min(hf.w - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - pad)), y1 = Math.min(hf.h - 1, Math.ceil(Math.max(a[1], b[1]) + pad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - a[0], py = y + 0.5 - b[1] + (b[1] - a[1]);
    const t = (px * dx + (y + 0.5 - a[1]) * dy) / L2;
    if (t < 0 || t > 1) continue;
    const d = Math.abs(px * dy - (y + 0.5 - a[1]) * dx) / L, r = ra + (rb - ra) * t;
    if (d >= r) continue;
    const q = d / r;
    hf._add(y * hf.w + x, za + (zb - za) * t + r * k * Math.pow(1 - q * q, o.p ?? 0.5), mat);
  }
}

/** The navy sleeve & cuff the wrist vanishes into. Writes into hf (buffer coords). */
export function sculptCuff(hf, H, o = {}) {
  const ox = o.ox ?? 0, oy = o.oy ?? 0, sw = o.swell ?? 0, S = H.s;
  const B = (u, v) => { const [x, y] = H.P(u, v); return [x - ox, y - oy]; };
  const back = o.back ?? 460, rise = o.rise ?? 150;
  // the sleeve climbs away toward his elbow (off frame), widening as it nears the camera
  cylinder(hf, B(-back, 0), B(-151, 0), (84 + sw) * S, (69 + sw * 0.6) * S, H.z0 + rise * S, H.z0 + 18 * S, { mat: CM.WOOL, k: 0.62, p: 0.6 });
  // the cuff: a turned-back band, strained tight around the wrist, cut off where the flesh comes out
  cylinder(hf, B(-153, 0), B(-111, 0), (72 + sw) * S, (71 + sw) * S, H.z0 + 15 * S, H.z0 + 12 * S, { mat: CM.WOOL_W, k: 0.62, p: 0.55 });
  hf.finalize();
  // the seam where the cuff is set on, and big drag folds down the sleeve from the bent elbow
  hf.groove([B(-153, -76), B(-154, 0), B(-153, 76)], 2.6 * S, 5 * S);
  hf.fold([B(-196, -86), B(-212, -24), B(-204, 34), B(-186, 86)], 6 * S, 9 * S);
  hf.fold([B(-262, -92), B(-280, -12), B(-258, 80)], 8 * S, 12 * S);
  hf.groove([B(-340, -98), B(-356, -30), B(-362, 44), B(-340, 98)], 10 * S, 10 * S);
  hf.groove([B(-210, 46), B(-280, 60), B(-360, 70)], 7 * S, 6 * S);
  // tension creases pulling toward the buttons
  for (let k = 0; k < 3; k++) hf.groove([B(-116, 6 + k * 18), B(-128, 18 + k * 18), B(-146, 30 + k * 16)], 1.8 * S, 2.4 * S);
}

/** Cuff surface detail: wool fibre, wet patches, the worn rim, the split seam with thread, brass buttons. */
export function detailCuff(cel, H, o = {}) {
  const r = rng(o.seed ?? 61);
  const at = (x, y) => cel.idx(x - cel.ox, y - cel.oy);
  const { w, h } = cel;
  const isW = (m) => m === CM.WOOL || m === CM.WOOL_W;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!isW(cel.mat[i])) continue;
    cel.sid[i] = cel.mat[i] === CM.WOOL ? 30 : 31;
    const fx = x + cel.ox, fy = y + cel.oy;
    // fibre: short dashes along the weave, a few lighter nubs
    const q = h01(fx >> 1, fy, 91);
    if (q < 0.06) cel.off[i] -= 1; else if (q > 0.975) cel.off[i] += 1;
    // the sleeve is soaked in patches: darker and glossier
    if (cel.mat[i] === CM.WOOL && fbm(fx, fy, 16, 92) > 0.6) cel.mat[i] = CM.WOOL_W;
  }
  // the cuff's worn rim against the wrist, and the shadow the overhanging flesh throws on it
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (cel.mat[i] === CM.WOOL_W && cel.sid[i] === 31) {
      let fl = false; for (const j of [i - 1, i + 1, i - w, i + w]) if (FLESHY.includes(cel.mat[j])) fl = true;
      if (fl) { cel.fix[i] = 0; const [bx, by] = [x - Math.round(H.f[0] * 2), y - Math.round(H.f[1] * 2)]; const j = by * w + bx; if (j >= 0 && cel.mat[j] === CM.WOOL_W && cel.fix[j] < 0) cel.off[j] -= 1; }
    }
  }
  // frayed edge: threads lying over the wrist flesh
  for (let k = -62; k <= 62; k += 3) {
    const [ex, ey] = H.P(-111, k);
    const L = 2 + Math.floor(r() * 4);
    for (let j = 0; j < L; j++) {
      const x = Math.round(ex + H.f[0] * j + (r() - 0.5)), y = Math.round(ey + H.f[1] * j);
      const i = at(x, y); if (i < 0 || !FLESHY.includes(cel.mat[i])) continue;
      if (r() < 0.55) { cel.mat[i] = CM.THREAD; cel.fix[i] = j ? 2 : 1; }
    }
  }
  // tarnished brass buttons in a row on the cuff, pulled sideways by the strain, green in the crevices
  const button = (u, v, rad, eagle) => {
    const [bx, by] = H.P(u, v);
    const bi = at(Math.round(bx), Math.round(by)); if (bi < 0 || !isW(cel.mat[bi])) return;
    const bz = cel.z[bi];
    for (let y = Math.floor(by - rad - 3); y <= by + rad + 3; y++) for (let x = Math.floor(bx - rad - 3); x <= bx + rad + 3; x++) {
      const px = x + 0.5 - bx, py = y + 0.5 - by, e = Math.hypot(px, py) / rad;
      const i = at(x, y); if (i < 0) continue;
      if (e > 1) { if (e < 1.3 && isW(cel.mat[i])) cel.fix[i] = e < 1.15 ? 0 : 1; continue; }   // the wool puckers around it
      const dome = Math.sqrt(Math.max(0, 1 - e * e));
      cel.put(x - cel.ox, y - cel.oy, CM.BRASS, { z: bz + 2 + dome * rad * 0.5, n: [px / rad, py / rad, dome + 0.3], sid: 33, fix: -1, off: 0 });
      if (e > 0.74 && e < 0.88) cel.mat[i] = CM.VERD;                                            // the low ring inside the rim
      else if (eagle && e < 0.55) {                                                              // an eagle, worn to a lump
        const wing = Math.abs(py + rad * 0.05) < rad * 0.13 && Math.abs(px) < rad * 0.5, body = Math.abs(px) < rad * 0.13 && py > -rad * 0.4 && py < rad * 0.35;
        if (wing || body) cel.off[i] = 1;
        else if (h01(x, y, 95) < 0.25) cel.mat[i] = CM.VERD;
      }
    }
    // stress lines radiating from the strained buttonhole
    for (let k = 0; k < 4; k++) {
      const a = Math.atan2(H.f[1], H.f[0]) + Math.PI + (k - 1.5) * 0.45;
      cel.stroke([[bx + Math.cos(a) * rad * 1.4, by + Math.sin(a) * rad * 1.4], [bx + Math.cos(a) * rad * (2.4 + (k & 1)), by + Math.sin(a) * rad * (2.4 + (k & 1))]], (x, y) => { const i = at(x, y); if (i >= 0 && isW(cel.mat[i]) && cel.fix[i] < 0) cel.off[i] -= 1; });
    }
  };
  button(-128, 46, 4.5 * H.s, false);
  button(-130, 24, 7.5 * H.s, true);
  button(-130, 2, 4.5 * H.s, false);
  // something wet runs out of the cuff onto the back of the hand
  {
    let [x, y] = H.P(-110, 16);
    for (let j = 0; j < 10; j++) {
      const i = at(Math.round(x), Math.round(y));
      if (i >= 0 && FLESHY.includes(cel.mat[i])) { cel.off[i] = j === 9 ? 2 : 1; }
      x += H.f[0]; y += H.f[1] + 0.12;
    }
  }
}

// ------------------------------------------------------------------------------------------ the background
const DESK_EDGE_PTS = [[18, 26], [W + 4, 10]];   // far edge (rising slightly to the right)
const DESK_LEFT = [[18, 26], [6, H + 4]];        // left edge
function deskIn(x, y) {
  const [a, b] = DESK_EDGE_PTS, [c, d] = DESK_LEFT;
  const top = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  const left = c[0] + (d[0] - c[0]) * (y - c[1]) / (d[1] - c[1]);
  return y >= top && x >= left;
}

function buildDesk(cel, r) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (deskIn(x + 0.5, y + 0.5)) {
      // wood-grain laminate: long streaks, a few darker figure lines
      const g = vn(x * 0.18 + vn(x, y, 40, 3) * 30, y * 2.2, 1, 5);
      const g2 = vn(x * 0.05, y * 0.9 + vn(x, y, 60, 4) * 8, 1, 6);
      const m = (g > 0.66 || (g2 > 0.7 && g > 0.45)) ? CM.DESK_G : CM.DESK;
      cel.put(x, y, m, { z: 0, n: [0, 0, 1], sid: 1 });
    } else cel.put(x, y, CM.FLOOR, { z: -40, n: [0, 0, 1], sid: 2, flag: 1 });
  }
  // the desk's edge banding (T-molding) along the far and left edges
  const band = (a, b, nrmv) => {
    cel.stroke([a, b], (x, y) => { for (let k = 0; k < 3; k++) { const xx = x - Math.round(nrmv[0] * k), yy = y - Math.round(nrmv[1] * k); if (cel.matAt(xx, yy) !== CM.FLOOR) cel.put(xx, yy, CM.DESK_EDGE, { z: 0.5, n: [nrmv[0] * 0.6, nrmv[1] * 0.6, 0.8], sid: 3, fix: k === 0 ? 4 : k === 1 ? 3 : -1 }); } });
  };
  band(DESK_EDGE_PTS[0], DESK_EDGE_PTS[1], [0, -1]);
  band(DESK_LEFT[0], DESK_LEFT[1], [-1, 0]);
  // the pencil groove along the far edge
  cel.stroke([[60, 37], [W, 26]], (x, y) => { cel.shift(x, y, -2, [CM.DESK, CM.DESK_G]); cel.shift(x, y + 1, -1, [CM.DESK, CM.DESK_G]); cel.shift(x, y + 2, 1, [CM.DESK, CM.DESK_G]); });
  // scratches: fine, pale, mostly along the grain; a few gouges
  for (let k = 0; k < 70; k++) {
    const x = 20 + r() * 460, y = 30 + r() * 240, a = (r() < 0.75 ? (r() - 0.5) * 0.4 : r() * 3.1), L = 4 + r() * 26;
    const lite = r() < 0.7;
    cel.stroke([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], (px, py, tt) => { if (tt > 0.1 && tt < 0.92 && ((px * 7 + py) % 5) !== 0) cel.shift(px, py, lite ? 1 : -1, [CM.DESK, CM.DESK_G]); });
  }
  // carved initials: tiny, faint, filled with years of graphite
  carve(cel, 404, 52, 'KR 91');
  carve(cel, 62, 238, 'J+M');
  carve(cel, 440, 230, 'HH');
  // a ring stain from a can, long ago
  for (let a = 0.6; a < 5.2; a += 0.02) { const x = Math.round(452 + Math.cos(a) * 13), y = Math.round(96 + Math.sin(a) * 10); if (vn(a * 20, 0, 3, 8) > 0.45) cel.shift(x, y, 1, [CM.DESK, CM.DESK_G]); }
}
const GLYPH = {
  K: ['101', '110', '100', '110', '101'], R: ['110', '101', '110', '101', '101'], 9: ['111', '101', '111', '001', '011'], 1: ['010', '110', '010', '010', '111'],
  J: ['011', '001', '001', '101', '010'], M: ['10001', '11011', '10101', '10001', '10001'], '+': ['000', '010', '111', '010', '000'], H: ['101', '101', '111', '101', '101'], ' ': ['00', '00', '00', '00', '00'],
};
function carve(cel, x0, y0, text) {
  let cx = x0;
  for (const ch of text) {
    const g = GLYPH[ch] || GLYPH[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] !== '1') continue;
      const x = cx + i, y = y0 + j + ((i + cx) % 3 === 0 ? 0 : 0);
      if (cel.matAt(x, y) === CM.DESK || cel.matAt(x, y) === CM.DESK_G) { cel.put(x, y, CM.CARVE, { z: -0.5 }); }
    }
    cx += g[0].length + 1;
  }
}

/** Tess at her desk: hunched toward us, head down on her folded denim arms, face turned to the hand. */
const HEAD = { cx: 392, cy: 148, rx: 46, ry: 50 };
/** A height field over a sub-rectangle of the frame, addressed in frame coordinates. */
function subHF(box, k) {
  const [x0, y0, x1, y1] = box, hf = new HField(x1 - x0, y1 - y0, k);
  const P = (pts) => pts.map(([x, y]) => [x - x0, y - y0]);
  return {
    hf, x0, y0,
    blob: (cx, cy, rx, ry, hgt, o = {}) => hf.blob(cx - x0, cy - y0, rx, ry, hgt, o.clip ? { ...o, clip: (x, y) => o.clip(x + x0, y + y0) } : o),
    tube: (ax, ay, r0, bx, by, r1, o) => hf.tube(ax - x0, ay - y0, r0, bx - x0, by - y0, r1, o),
    groove: (pts, r, d) => hf.groove(P(pts), r, d),
    fold: (pts, r, d) => hf.fold(P(pts), r, d),
    pit: (cx, cy, rx, ry, d, sft) => hf.pit(cx - x0, cy - y0, rx, ry, d, sft),
    finalize() { hf.finalize(); return this; },
  };
}
function limb(cel, sid, box, build, o = {}) {
  const sh = subHF(box, o.k ?? 0.2);
  build(sh);
  sh.finalize();
  if (o.carve) o.carve(sh);
  cel.fromHF(sh.hf, { sid, mode: 'z', dx: sh.x0, dy: sh.y0 });
  return sh;
}
function buildTess(cel, r) {
  const D = CM.DENIM;
  // her back & shoulders, nearest the camera, falling off the bottom of the frame
  limb(cel, 100, [280, 222, 480, 270], (hf) => { hf.blob(408, 306, 124, 76, 74, { mat: D, p: 0.5 }); hf.blob(334, 282, 46, 40, 58, { mat: D, p: 0.55 }); }, {
    carve: (hf) => { hf.groove([[372, 246], [404, 258], [440, 250]], 3, 4); hf.groove([[318, 262], [330, 280], [326, 300]], 4, 5); },
  });
  // right forearm (under): from the elbow past the frame's right edge to her hand at the far left
  limb(cel, 101, [224, 156, 480, 240], (hf) => hf.tube(496, 184, 23, 250, 214, 20, { mat: D, z0: 0, z1: 0, k: 0.95 }), {
    carve: (hf) => { for (const x of [452, 470]) hf.groove([[x, 166], [x + 4, 184], [x + 1, 204]], 2.6, 3.5); },
  });
  // the right sleeve's cuff and her hand, small, peeking from under the left elbow
  limb(cel, 102, [218, 186, 286, 240], (hf) => hf.tube(244, 214, 20.5, 260, 212, 21, { mat: D, z0: 1, z1: 1, k: 0.95 }));
  limb(cel, 110, [204, 196, 252, 246], (hf) => {
    hf.blob(232, 220, 11, 10, 9, { base: 3, mat: CM.SKIN, p: 0.6 });
    for (let k = 0; k < 4; k++) hf.tube(228 - k * 0.6, 209 + k * 5.2, 3.5, 219 - k * 0.8, 211 + k * 5.4, 3.1, { mat: CM.SKIN, z0: 4, z1: 3, k: 0.95 });
  }, { k: 0.35 });
  // left upper arm down to the elbow, and the left forearm folded across, under her face
  limb(cel, 103, [224, 186, 354, 270], (hf) => hf.tube(318, 300, 30, 256, 216, 25, { mat: D, z0: 24, z1: 14, k: 0.9 }), {
    carve: (hf) => { hf.groove([[262, 226], [276, 236], [294, 238]], 3, 4); hf.groove([[280, 250], [296, 256], [312, 256]], 3, 3.5); },
  });
  limb(cel, 104, [226, 166, 468, 238], (hf) => {
    hf.tube(258, 205, 24, 440, 196, 21, { mat: D, z0: 14, z1: 12, k: 0.95 });
    hf.blob(258, 207, 26, 24, 22, { base: 14, mat: D, p: 0.55 });                  // the elbow
    hf.blob(352, 194, 32, 14, 58, { base: 14, mat: D, p: 0.6 });                   // fabric bunched up around her mouth
  }, {
    carve: (hf) => {
      for (const [x, d] of [[292, 3.5], [318, 3], [404, 3.5], [424, 3]]) hf.groove([[x, 182], [x + 5, 198], [x + 2, 218]], 2.8, d);
      hf.fold([[300, 190], [318, 200], [336, 212]], 3, 3);
    },
  });
  // ---- her head, down on the arm: skull under the hair, the face in profile on the left (turned
  // toward him), drawn as a shape (forehead, brow, nose, lip; the rest pressed into the sleeve)
  const hh = subHF([HEAD.cx - HEAD.rx - 2, HEAD.cy - HEAD.ry - 2, HEAD.cx + HEAD.rx + 2, HEAD.cy + HEAD.ry + 2], 0.18);
  hh.blob(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 44, { base: 30, mat: CM.HAIR, p: 0.5 });
  hh.finalize();
  cel.fromHF(hh.hf, { sid: 121, mode: 'z', dx: hh.x0, dy: hh.y0 });
  sculptFace(cel);
  return { face: FACE };
}

// her face's profile (frame px): hairline → forehead → brow → nose → lip → into the sleeve, then back
// up the jaw to the ear. The eye, brow, ear and freckles are placed by hand in paintFace.
const FACE = {
  prof: [[338, 114], [331, 121], [328, 130], [327, 137], [328, 141], [325, 147], [320, 154], [315, 160], [317, 163], [322, 164], [325, 166], [323, 170], [326, 176], [330, 184],
    [352, 190], [364, 182], [370, 172], [372, 160], [368, 146], [362, 130], [352, 119]],
  eye: [343, 148], brow: [339, 137], ear: [373, 156], nose: [316, 160],
};
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyDist(pts, x, y) {
  let d = 1e9;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1])[0]);
  return d;
}
function sculptFace(cel) {
  const g = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  const x0 = 300, y0 = 100, w = 90, h = 100, zb = new Float32Array(w * h).fill(-1e9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x0 + x + 0.5, fy = y0 + y + 0.5;
    const ear = ((fx - FACE.ear[0]) / 6.5) ** 2 + ((fy - FACE.ear[1]) / 10) ** 2 < 1;
    if (!inPoly(FACE.prof, fx, fy) && !ear) continue;
    let z = 52 + Math.sqrt(Math.min(polyDist(FACE.prof, fx, fy), 16) / 16) * 12;
    z += 3 * g(fx, fy, 334, 136, 8, 3.5);                // brow ridge
    z -= 3.5 * g(fx, fy, 343, 148, 6.5, 3.6);            // eye socket
    z += 3 * g(fx, fy, 345, 160, 9, 5);                  // cheekbone
    z += 3 * g(fx, fy, 321, 156, 5, 6);                  // nose
    z -= 2 * g(fx, fy, 360, 170, 9, 8);                  // the hollow under the cheekbone
    if (ear) z = 66 + Math.sqrt(Math.max(0, 1 - ((fx - FACE.ear[0]) / 6.5) ** 2 - ((fy - FACE.ear[1]) / 10) ** 2)) * 4 - 2.5 * g(fx, fy, FACE.ear[0] - 0.5, FACE.ear[1], 2.5, 5);
    zb[y * w + x] = z;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = zb[i]; if (z < -1e8) continue;
    const zz = (j, ok) => (ok && zb[j] > -1e8 ? zb[j] : z - 2);
    const gx = (zz(i + 1, x < w - 1) - zz(i - 1, x > 0)) * 0.5, gy = (zz(i + w, y < h - 1) - zz(i - w, y > 0)) * 0.5;
    const fx = x0 + x, fy = y0 + y;
    const ear = ((fx + 0.5 - FACE.ear[0]) / 6.5) ** 2 + ((fy + 0.5 - FACE.ear[1]) / 10) ** 2 < 1;
    cel.put(fx, fy, CM.SKIN, { z, n: [-gx, -gy, 1], sid: ear ? 122 : 120, fix: -1, off: 0, mode: 'z' });
  }
}

/**
 * Hair as one domed mass broken into locks: every lock starts at the crown, follows the skull and
 * falls past its edge onto the sleeves and the desk (a long spill toward the hand). Lighting uses the
 * dome's normal so the mass reads as a head of hair; locks only add separations, strands and tips.
 */
function buildHair(cel, r) {
  const locks = [];
  const add = (pts, w0, o = {}) => locks.push({ pts, w0, id: locks.length, ...o });
  // the part runs along the top of her head, from the hairline back
  const part = (t) => [338 + t * 92, 110 - t * 8 + Math.sin(t * 3) * 2];
  // over the top: short locks falling onto the desk beyond her head
  for (let k = 0; k < 6; k++) {
    const t = 0.1 + k * 0.15, p0 = part(t);
    add(quad([p0[0] - 6, p0[1] + 4], [p0[0] + 10, p0[1] - 6], [p0[0] + 26 + r() * 8, p0[1] - 7 + r() * 5], 12), 10 + r() * 3, { top: true });
  }
  // the visible side: swept back from the part, over the skull, falling onto her collar and the arm
  for (let k = 0; k < 11; k++) {
    const t = 0.02 + k * 0.095, p0 = part(t);
    const end = [380 + k * 9 + r() * 6, 196 + k * 2.5 + r() * 8];
    const mid = [lerp(p0[0], end[0], 0.35) + 22, lerp(p0[1], end[1], 0.45) - 2];
    add(quad(p0, mid, end, 18), 11 + r() * 4);
  }
  // along her temple: combed back and tucked behind the ear
  for (let k = 0; k < 3; k++) {
    const p0 = [340 + k * 7, 116 + k * 2];
    add(quad(p0, [360 + k * 2, 128 + k * 3], [378 + k * 3, 152 + k * 6], 14), 6 + r() * 2, { temple: true });
  }
  // the heavy side that slid forward: spilling over the top-left of her head onto the desk, toward his fingers
  for (let k = 0; k < 5; k++) {
    const p0 = part(0.08 + k * 0.05), p1 = [318 - k * 2, 100 + k * 3], p2 = [300 - k * 3 + r() * 4, 106 + k * 7 + r() * 5];
    add(quad(p0, p1, p2, 16), 8 + r() * 2.5, { spill: true });
  }
  // loose strands across her face (she can't brush them away)
  for (let k = 0; k < 2; k++) add(quad([346 + k * 6, 116], [338 - k * 2, 132], [333 + k * 8, 150 + k * 6], 14), 1.4, { stray: true, bang: true });
  // coverage & ownership: later locks lie on top
  const own = new Int16Array(W * H).fill(-1), across = new Float32Array(W * H), along = new Float32Array(W * H);
  const widthAt = (Lk, t) => Lk.stray ? Lk.w0 * (t < 0.85 ? 1 : 0.6) : Lk.w0 * (t < 0.7 ? 1 - t * 0.25 : Math.max(0, 1 - (t - 0.7) / 0.3) ** 0.6 * 0.82) * (0.9 + 0.1 * Math.cos(t * 7 + Lk.id));
  for (const Lk of locks) {
    const n = Lk.pts.length - 1;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = Lk.pts[k], [bx, by] = Lk.pts[k + 1];
      const wmax = Lk.w0 + 1, sx = bx - ax, sy = by - ay, L2 = sx * sx + sy * sy || 1e-9, Ls = Math.sqrt(L2);
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - wmax)); y <= Math.min(H - 1, Math.max(ay, by) + wmax); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - wmax)); x <= Math.min(W - 1, Math.max(ax, bx) + wmax); x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        let tt = (px * sx + py * sy) / L2; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const ex = px - sx * tt, ey = py - sy * tt, dd = Math.sqrt(ex * ex + ey * ey);
        const t = (k + tt) / n, wv = widthAt(Lk, t);
        if (dd > wv) continue;
        const i = y * W + x;
        own[i] = Lk.id; along[i] = t;
        across[i] = clamp((px * sy - py * sx) / Ls / Math.max(1, wv), -1, 1);
      }
    }
  }
  // write: on the dome the normal is the skull's; spilled hair lies on whatever is under it
  const inSkull = (x, y) => ((x + 0.5 - HEAD.cx) / HEAD.rx) ** 2 + ((y + 0.5 - HEAD.cy) / HEAD.ry) ** 2 < 1;
  const dome = (x, y) => { const u = (x + 0.5 - HEAD.cx) / HEAD.rx, v = (y + 0.5 - HEAD.cy) / HEAD.ry, q = Math.max(0, 1 - u * u - v * v); return [u * 0.8, v * 0.8, Math.sqrt(q) + 0.15]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const ins = inSkull(x, y) && cel.mat[i] === CM.HAIR;
    if (own[i] < 0 && !ins) continue;
    if (!ins && cel.mat[i] === CM.SKIN && !locks[own[i]]?.bang) continue;       // the face shows through, except under the bangs
    const Lk = own[i] >= 0 ? locks[own[i]] : null;
    const q = Lk ? across[i] : 0;
    let n;
    if (ins) { const dn = dome(x, y); n = [dn[0] + q * 0.25, dn[1], dn[2]]; }
    else n = [q * 0.55 + (cel.nx[i] || 0) * 0.4, (cel.ny[i] || 0) * 0.4 - 0.1, 1];
    const zz = ins ? cel.z[i] + 4 : Math.max(cel.z[i], 0) + 3 + (Lk ? (1 - along[i]) * 2 : 0);
    cel.put(x, y, CM.HAIR, { z: zz, n, sid: 200 + (Lk ? Lk.id : 99), fix: -1, off: 0 });
  }
  // separations between locks (broken), strands along each lock, highlight dashes, clumped tips
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (cel.mat[i] !== CM.HAIR || own[i] < 0) continue;
    const Lk = locks[own[i]];
    // separation: my neighbour belongs to a lock lying over mine
    let sep = false;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (own[j] >= 0 && own[j] > own[i] && cel.mat[j] === CM.HAIR) sep = true;
    if (sep && vn(x, y, 6, Lk.id) > 0.42) { cel.off[i] -= 2; continue; }
    // strand grooves: thin darker lines following the lock
    const sq = Math.abs(((across[i] + 1) * 2.2 + Lk.id * 0.37) % 1 - 0.5);
    if (sq < 0.07 && along[i] > 0.1 && vn(x, y, 4, Lk.id + 50) > 0.45) cel.off[i] -= 1;
    // tips go dark & thin
    if (along[i] > 0.9) cel.off[i] -= 1;
  }
  return locks;
}

/** Her face: the squeezed-shut eye, the knitted brow, nostril, flushed cheek and freckles — by hand. */
function paintFace(cel, F, r) {
  const [ex, ey] = F.eye;
  const skin = [CM.SKIN, CM.CHEEK];
  const isS = (x, y) => { const i = cel.idx(x, y); return i >= 0 && skin.includes(cel.mat[i]); };
  const P = (x, y, m, k) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i])) { cel.mat[i] = m; cel.fix[i] = k; } };
  const T = (x, y, k) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i])) cel.fix[i] = k; };
  const S = (x, y, d) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i]) && cel.fix[i] < 0) cel.off[i] += d; };
  // flushed cheek where it presses into the sleeve
  for (let y = 152; y < 190; y++) for (let x = 326; x < 372; x++) {
    const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== CM.SKIN || cel.sid[i] !== 120) continue;
    const d = ((x - 349) / 15) ** 2 + ((y - 168) / 9) ** 2;
    if (d < 1 && (d < 0.6 || bay(x, y) < 0.5)) cel.mat[i] = CM.CHEEK;
  }
  // the shut eye: lids squeezed into a downward arc, heavy at the outer corner
  const lash = quad([ex - 6, ey - 1], [ex - 1, ey + 3], [ex + 6, ey], 16);
  cel.stroke(lash, (x, y, tt) => { P(x, y, CM.LASH, tt > 0.5 ? 0 : 1); if (tt > 0.55) P(x, y - 1, CM.LASH, 1); });
  for (const [dx, dy] of [[-3, 3], [0, 3], [3, 3], [5, 2]]) P(ex + dx, ey + dy, CM.LASH, 2);              // lashes
  cel.stroke(quad([ex - 5, ey - 4], [ex, ey - 6], [ex + 6, ey - 4], 10), (x, y) => T(x, y, 2));          // upper lid fold
  cel.stroke(quad([ex - 4, ey + 5], [ex + 1, ey + 6], [ex + 5, ey + 4], 8), (x, y) => T(x, y, 3));       // lower lid pushed up
  for (let k = 0; k < 2; k++) cel.stroke([[ex + 7, ey - 1 + k * 3], [ex + 11, ey - 2 + k * 5]], (x, y) => T(x, y, 3));   // crow's feet
  // the brow: thick, copper-dark, pulled down at the inner end
  const [bx, by] = F.brow;
  cel.stroke(quad([bx - 7, by + 3], [bx, by - 2], [bx + 9, by - 1], 14), (x, y, tt) => { P(x, y, CM.HAIR, 2); if (tt < 0.7) P(x, y + 1, CM.HAIR, 1); if (tt > 0.2 && tt < 0.6) P(x, y - 1, CM.HAIR, 3); });
  cel.stroke([[bx - 8, by + 4], [bx - 9, by + 7]], (x, y) => T(x, y, 2));                                // the knit
  // nose: lit ridge, nostril, the shadow it throws on the upper lip
  cel.stroke([[328, 142], [319, 156]], (x, y) => S(x, y, 1));
  T(319, 161, 1); T(320, 161, 2); T(321, 162, 2);
  cel.stroke([[322, 165], [325, 168]], (x, y) => T(x, y, 2));
  P(324, 170, CM.CHEEK, 2); P(325, 171, CM.CHEEK, 2);                                                    // her lip, pressed
  // the ear: rim and the dark of its bowl
  const [qx, qy] = F.ear;
  cel.stroke(quad([qx + 1, qy - 7], [qx - 3, qy], [qx + 1, qy + 7], 10), (x, y) => T(x, y, 2));
  cel.stroke(quad([qx + 2, qy - 5], [qx, qy], [qx + 2, qy + 5], 8), (x, y) => T(x, y, 1));
  cel.stroke(quad([qx - 3, qy - 8], [qx - 6, qy], [qx - 3, qy + 8], 10), (x, y) => S(x, y, 1));
  // freckles: the cheek and across the bridge of the nose
  for (let k = 0; k < 26; k++) {
    const x = Math.round(328 + r() * 32), y = Math.round(151 + r() * 18);
    const i = cel.idx(x, y); if (i < 0 || !skin.includes(cel.mat[i]) || cel.fix[i] >= 0 || !isS(x + 1, y) || !isS(x, y + 1)) continue;
    cel.mat[i] = CM.FRECKLE; cel.off[i] = r() < 0.5 ? 0 : 1;
  }
}

function buildPencil(cel) {
  // her pencil, rolled against the edge of his little finger
  const a = [190, 236], b = [246, 226], d = nrm([b[0] - a[0], b[1] - a[1]]), n = [-d[1], d[0]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let s = -6; s <= L + 8; s += 0.5) for (let k = -3; k <= 3; k += 0.5) {
    const x = Math.round(a[0] + d[0] * s + n[0] * k), y = Math.round(a[1] + d[1] * s + n[1] * k);
    const q = k / 3;
    let m = CM.PENCIL, rr = 3;
    if (s < 0) { m = CM.GRAPHITE; rr = 3 * (1 + s / 6); }
    else if (s < 7) { m = CM.PWOOD; rr = 3 * Math.min(1, 0.35 + s / 7); }
    else if (s > L - 1 && s <= L + 3) m = CM.FERRULE;
    else if (s > L + 3) m = CM.ERASER;
    if (Math.abs(k) > rr) continue;
    const facet = Math.round(q * 1.5) / 1.5;
    cel.put(x, y, m, { z: 3 + Math.sqrt(Math.max(0, 1 - q * q)) * 3, n: [n[0] * facet, n[1] * facet, Math.sqrt(Math.max(0.1, 1 - facet * facet))], sid: 130, fix: -1, off: 0 });
  }
}

// ------------------------------------------------------------------------------------------ build
const LAYER = { ox: -380, oy: -170, w: W + 380, h: H + 170 };
export const PROF = {};
const prof = (k, f) => { const a = performance.now(); const r = f(); PROF[k] = (PROF[k] || 0) + Math.round(performance.now() - a); return r; };
const HAND_POSE = { C: [176, 106], f: [0.86, 0.5], s: 1.06, side: 1, z: 0, rings: { 3: 'signet', 2: 'stone' } };

// the background, in slices (each a few tens of ms) so it can be built in idle time
function* bgGen() {
  const r = rng(1018);
  const cel = new Cel(W, H);
  prof('desk', () => buildDesk(cel, r)); yield;
  buildPencil(cel);
  const F = prof('tess', () => buildTess(cel, r)); yield;
  prof('hair', () => buildHair(cel, r)); yield;
  paintFace(cel, F.face, r);
  prof('denim', () => denimDetail(cel, r));
  prof('bgcav', () => cel.cavity(5, 0.05, 0.5));
  state.bg = cel;
}
function denimDetail(cel, r) {
  const den = [CM.DENIM];
  // flat-felled seams: a dark fold line with copper stitching beside it
  const seam = (pts, sids, stitchSide = 2) => cel.stroke(pts, (x, y, tt) => {
    const i = cel.idx(x, y); if (i < 0 || !den.includes(cel.mat[i]) || (sids && !sids.includes(cel.sid[i]))) return;
    cel.mat[i] = CM.DENIM_D; cel.fix[i] = -1;
    const j = cel.idx(x, y + stitchSide); if (j >= 0 && cel.mat[j] === CM.DENIM && ((x + y) % 3 === 0)) cel.mat[j] = CM.STITCH;
  });
  seam(quad([274, 196], [360, 192], [444, 186], 30), [104]);          // left forearm, outer seam
  seam(quad([446, 176], [470, 174], [496, 170], 12), [101]);          // right forearm
  seam(quad([270, 226], [292, 252], [314, 286], 16), [103], 1);       // left upper arm
  seam(quad([318, 266], [400, 248], [486, 258], 30), [100]);          // yoke across her back
  // the right sleeve's cuff: a seam ring and a copper button by her hand
  cel.stroke([[263, 194], [265, 230]], (x, y) => { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === 102) { cel.mat[i] = CM.DENIM_D; } });
  for (const [x, y] of [[252, 206]]) {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) cel.put(x + i, y + j, CM.STITCH, { z: 30, n: [i * 0.3, j * 0.3, 1], sid: 105, fix: -1 });
    cel.tone(x, y, 1);
  }
  // light-wash wear: paler on the tops of the folds; the twill
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (cel.mat[i] !== CM.DENIM) continue;
    if (vn(x, y * 3, 9, 41) > 0.7 && cel.ny[i] < -0.15) cel.off[i] += 1;
    if (((x * 2 + y) % 5) === 0 && cel.fix[i] < 0) cel.off[i] -= 1;
  }
}

/** The hand + cuff layer (larger than the frame, origin LAYER.ox/oy). */
/** The hand + cuff layer (larger than the frame, origin LAYER.ox/oy), in slices. */
function* handGen(swell) {
  const cel = new Cel(LAYER.w, LAYER.h, LAYER.ox, LAYER.oy);
  const hf = new HField(LAYER.w, LAYER.h, 0.16);
  const Hd = prof('sculpt', () => sculptHand(hf, { ...HAND_POSE, swell: swell / 2, ox: LAYER.ox, oy: LAYER.oy })); yield;
  const cf = new HField(LAYER.w, LAYER.h, 0.2);
  prof('cuffsculpt', () => sculptCuff(cf, Hd, { ox: LAYER.ox, oy: LAYER.oy, swell: swell / 2 })); yield;
  // the flesh roll overhangs the cuff: flesh wins where it rises above it
  prof('fromHF', () => { cel.fromHF(cf, { sid: 30, mode: 'any' }); cel.fromHF(hf, { sid: 20, mode: 'z' }); });
  prof('cuffdetail', () => detailCuff(cel, Hd)); yield;
  prof('handdetail', () => detailHand(cel, Hd)); yield;
  prof('rings', () => { paintRings(cel, Hd); paintNails(cel, Hd); });
  prof('handcav', () => cel.cavity(4, 0.07, 0.55));
  state.hand.set(swell, { cel, Hd });
}

/** Shadow coverage the hand layer throws onto the plane z = 0 (layer coords), plus contact AO. */
function shadowMask(cel, lt) {
  const { w, h, z, mat } = cel;
  const hard = new Uint8Array(w * h), cov = new Float32Array(w * h), ao = new Float32Array(w * h);
  // every surface pixel throws the shadow of its column onto z = 0: a segment from its foot toward
  // the shadow side; interior pixels only need the short piece their neighbours don't already cover
  const px = -lt.L[0] / lt.L[2], py = -lt.L[1] / lt.L[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mat[i]) continue;
    const zi = Math.max(0, z[i]);
    let lo = zi;
    for (const j of [i - 1, i + 1, i - w, i + w]) { const zj = j >= 0 && j < w * h && mat[j] ? Math.max(0, z[j]) : 0; lo = Math.min(lo, zj); }
    const z0 = Math.max(0, lo - 1.5);
    const ax = x + px * zi, ay = y + py * zi, bx = x + px * z0, by = y + py * z0;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= n; k++) {
      const xx = Math.round(ax + (bx - ax) * k / n), yy = Math.round(ay + (by - ay) * k / n);
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) hard[yy * w + xx] = 1;
    }
  }
  // close pinholes, then a one-pixel soft rim the compositor dithers
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += hard[i + dy * w + dx];
    cov[i] = hard[i] ? (s >= 7 ? 1 : 0.75) : s >= 5 ? 0.75 : s >= 2 ? 0.35 : 0;
  }
  // contact: right next to the flesh resting on the desk the laminate darkens (chamfer distance)
  const D = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) D[i] = mat[i] && z[i] < 30 ? 0 : 99;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = D[i]; if (!v) continue; if (x > 0) v = Math.min(v, D[i - 1] + 1); if (y > 0) { v = Math.min(v, D[i - w] + 1); if (x > 0) v = Math.min(v, D[i - w - 1] + 1.41); if (x < w - 1) v = Math.min(v, D[i - w + 1] + 1.41); } D[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = D[i]; if (!v) continue; if (x < w - 1) v = Math.min(v, D[i + 1] + 1); if (y < h - 1) { v = Math.min(v, D[i + w] + 1); if (x < w - 1) v = Math.min(v, D[i + w + 1] + 1.41); if (x > 0) v = Math.min(v, D[i + w - 1] + 1.41); } D[i] = v; }
  for (let i = 0; i < w * h; i++) if (!mat[i]) ao[i] = D[i] <= 1.5 ? 2 : D[i] <= 3 ? 1 : D[i] <= 4.5 ? 0.5 : 0;
  return { cov, ao };
}

const state = { bg: null, hand: new Map(), mask: new Map(), shaded: new Map(), gens: new Map() };

/** Shaded background (lit + in the hand's shadow) for a light: packed tones. */
function shadeBg(lightName) {
  const cel = state.bg, lt = LIGHTS[lightName];
  const lit = prof('bgshade', () => outline(cel, shadeCel(cel, lt)));
  const dark = prof('bgshadeD', () => outline(cel, shadeCel(cel, { ...lt, key: lt.key * (1 - lt.shadow) }, { noCast: true })));
  state.shaded.set('bg|' + lightName, { lit: packTones(cel, lit.tone), dark: packTones(cel, dark.tone), z: cel.z });
}
function shadeHand(swell, lightName) {
  const { cel } = state.hand.get(swell), lt = LIGHTS[lightName];
  const sh = prof('handshade', () => outline(cel, shadeCel(cel, lt, { steps: 30 }), { lit: 0.7 }));
  state.shaded.set(`hand|${swell}|${lightName}`, { p: packTones(cel, sh.tone) });
}
function* prepGen(lightName) {
  if (!state.bg) yield* bgGen();
  if (!state.shaded.has('bg|' + lightName)) { shadeBg(lightName); yield; }
  for (const sw of [1, 0, 2]) {
    if (!state.shaded.has(`hand|${sw}|${lightName}`)) {
      if (!state.hand.has(sw)) yield* handGen(sw);
      shadeHand(sw, lightName); yield;
    }
    if (sw === 1 && !state.mask.has(lightName)) { state.mask.set(lightName, prof('mask', () => shadowMask(state.hand.get(1).cel, LIGHTS[lightName]))); yield; }
  }
  state.hand.clear();      // the shaded tones stay; the heavy buffers are rebuilt if the other light is needed
}

// reach 0 → the hand is out of frame, back along its arm; 1 → resting
const HAND_DIR = nrm(HAND_POSE.f);
const OUT_DIST = 420;
export function handOffset(reach, slack) {
  const k = 1 - clamp(reach);
  const back = OUT_DIST * (k * k * (3 - 2 * k)) + clamp(slack) ** 1.6 * 150;
  return [Math.round(-HAND_DIR[0] * back), Math.round(-HAND_DIR[1] * back)];
}

const luts = new Map();
function lut(name) { if (!luts.has(name)) luts.set(name, gradeLUT(GRADES[name])); return luts.get(name); }

/**
 * Compose one frame. s: { light: 'fluor'|'red', dim: bool (flicker dip), swell: 0..2, reach, slack }.
 * Returns an ImageData-backed canvas (cached by the caller).
 */
const bgRGBA = new Map();
function bgColors(lightName, gname) {
  const key = lightName + '|' + gname;
  if (bgRGBA.has(key)) return bgRGBA.get(key);
  const bg = state.shaded.get('bg|' + lightName), G = lut(gname), n = W * H;
  const lit = new Uint32Array(n), dark = new Uint32Array(n), lit1 = new Uint32Array(n), lit2 = new Uint32Array(n), dark1 = new Uint32Array(n), dark2 = new Uint32Array(n);
  const col = (v, d) => { if (!v) return 0; const m = v >> 8, t = Math.max(0, (v & 255) - d); return G[m][t]; };
  for (let i = 0; i < n; i++) {
    lit[i] = col(bg.lit[i], 0); lit1[i] = col(bg.lit[i], 1); lit2[i] = col(bg.lit[i], 2);
    dark[i] = col(bg.dark[i], 0); dark1[i] = col(bg.dark[i], 1); dark2[i] = col(bg.dark[i], 2);
  }
  const out = { lit: [lit, lit1, lit2], dark: [dark, dark1, dark2] };
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
  const bg = state.shaded.get('bg|' + lightName), hd = state.shaded.get(`hand|${sw}|${lightName}`), m = state.mask.get(lightName);
  const L = LIGHTS[lightName].L, px = -L[0] / L[2], py = -L[1] / L[2];
  const [dx, dy] = handOffset(s.reach ?? 1, s.slack ?? 0);
  const gname = lightName === 'red' ? (s.dim ? 'redDim' : 'red') : (s.dim ? 'dim' : 'fluor');
  const G = lut(gname), GD = lut(lightName === 'red' ? 'redDead' : 'fluorDead');
  const BC = bgColors(lightName, gname);
  const slack = clamp(s.slack ?? 0);
  const c = into || makeCanvas(W, H), ctx = ctxOf(c);
  const img = ctx.createImageData(W, H), d = new Uint32Array(img.data.buffer);
  const lw = LAYER.w, lh = LAYER.h, lox = LAYER.ox, loy = LAYER.oy, zb = bg.z, cov = m.cov, ao = m.ao, hp = hd.p;
  for (let y = 0; y < H; y++) {
    const hy = y - dy - loy, rowH = hy >= 0 && hy < lh ? hy * lw : -1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // the hand layer, shifted by the reach offset
      if (rowH >= 0) {
        const hx = x - dx - lox;
        if (hx >= 0 && hx < lw) {
          const v = hp[rowH + hx];
          if (v) { d[i] = (slack > 0 && bay(x, y) < slack * 0.85 ? GD : G)[v >> 8][v & 255]; continue; }
        }
      }
      // background: in the hand's shadow? (sample the plane mask where this surface's ray meets z = 0)
      const z = zb[i] > 0 ? zb[i] : 0;
      const mx = Math.round(x + px * z - dx - lox), my = Math.round(y + py * z - dy - loy);
      let set = BC.lit, k = 0;
      if (mx >= 0 && my >= 0 && mx < lw && my < lh) {
        const j = my * lw + mx;
        if (cov[j] > 0 && bay(x, y) < cov[j]) set = BC.dark;
        const a = ao[j];
        if (z < 3 && a > 0 && (a >= 1 || ((x + y) & 1))) k = a >= 2 ? 2 : 1;
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
  return !!state.bg && state.mask.has(lightName) && [0, 1, 2].every((sw) => state.shaded.has(`hand|${sw}|${lightName}`)) && state.shaded.has('bg|' + lightName);
}
export function handReady(lightName, swell) {
  return !!state.bg && state.shaded.has('bg|' + lightName) && state.shaded.has(`hand|${swell}|${lightName}`) && state.mask.has(lightName);
}
