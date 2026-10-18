// colonel_hand's background: the worn 1970s laminate and Tess, head down on her folded arms, her face
// turned toward the hand. Painted with the portraits' ramps (portraits_tess.js: SKIN, HAIR, denim) and
// their rules: short ramps, hard bands, clean 1-px lines, locks of hair as shapes with gaps between them.
//
// Layout (frame px): her face in 3/4 profile, nose at x≈318, the shut eye at (345,148), the ear far back at
// x≈395 with the hair tucked behind it; the solid mass of hair ends at x≈446 and breaks into lock tips
// (≥10 px clear of the right edge). Two forelocks lie on the desk toward the hand, one of them under his
// index fingertip; a third falls onto her brow. Her small right hand holds a pencil by his little finger.
import { HField } from './colonel_gbuf.js';
import { Cel, celMat, bay, h01, vn, clamp, lerp, quad, inPoly, polyDist, domePoly } from './colonel_cg_cel.js';
import { CM } from './colonel_cg_handkit.js';
import { hexToRgb } from './palette.js';
import { rng } from './util.js';

const W = 480, H = 270;
const T6 = [0.12, 0.28, 0.48, 0.7, 0.92];
const T5 = [0.12, 0.3, 0.52, 0.76];
// the desk & room
celMat(CM.DESK, { ramp: ['#0b0908', '#1d1611', '#352a20', '#524331', '#705d43', '#8d7756', '#a99169'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0.05, seam: false });
celMat(CM.DESK_G, { ramp: ['#090706', '#18120d', '#2d231a', '#45382a', '#60503a', '#7b684b', '#93805c'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0.05, seam: false });
celMat(CM.CARVE, { ramp: ['#060504', '#120e0a', '#221a13', '#33281d', '#44372a', '#574734', '#6a583f'], th: [0.08, 0.18, 0.32, 0.48, 0.64, 0.8], dith: 0 });
celMat(CM.FLOOR, { ramp: ['#020203', '#050608', '#0a0b0f', '#111318', '#1a1c22'], th: [0.1, 0.25, 0.45, 0.7], dith: 0.05, seam: false });
celMat(CM.DESK_EDGE, { ramp: ['#060606', '#121214', '#222226', '#3a3a40', '#5a5a62', '#86868e'], th: T6, dith: 0 });
// Tess: the portrait ramps (light-wash denim, fair freckled skin, copper hair)
const DEN = ['#182036', '#2a3a58', '#476288', '#6887ac', '#8ca8c8', '#b2c5d9'];
const SKIN = ['#4a1c22', '#8e5b47', '#bf7e65', '#deac8c', '#efcdb1', '#f8e4d0'];
const HAIR = ['#260905', '#4e1a0e', '#7c2812', '#973617', '#b2441b', '#e27a38'];
const mixh = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join(''); };
celMat(CM.DENIM, { ramp: DEN, th: [0.12, 0.26, 0.44, 0.62, 0.84], dith: 0, line: 0, lineLit: 1, gap: 2.5 });
celMat(CM.DENIM_D, { ramp: DEN.map((c) => mixh(c, '#0a1020', 0.3)), th: [0.12, 0.26, 0.44, 0.62, 0.84], dith: 0, line: 0, gap: 2.5 });
celMat(CM.STITCH, { ramp: ['#2a1408', '#5a2e10', '#8a4c1c', '#b8763a', '#d89c5c', '#eebc80'], th: T6, dith: 0 });
const SKT = [0.16, 0.32, 0.5, 0.72, 1.0];
celMat(CM.SKIN, { ramp: SKIN, th: SKT, dith: 0, line: 0, lineLit: 1, gap: 2 });
celMat(CM.CHEEK, { ramp: SKIN.map((c, i) => mixh(c, '#e06a6a', i ? 0.2 : 0)), th: SKT, dith: 0, line: 0, lineLit: 1, gap: 2 });
celMat(CM.FRECKLE, { ramp: SKIN.map((c, i) => mixh(c, i < 3 ? '#b6694a' : '#c47a58', 0.34)), th: SKT, dith: 0 });
celMat(CM.HAIR, { ramp: HAIR, th: [0.12, 0.26, 0.42, 0.6, 0.84], dith: 0, line: 0, lineLit: 1, gap: 2.2 });
celMat(CM.HAIR_D, { ramp: HAIR.map((c) => mixh(c, '#140402', 0.18)), th: [0.12, 0.26, 0.42, 0.6, 0.84], dith: 0, line: 0, gap: 2.2 });
celMat(CM.LASH, { ramp: ['#1a0604', '#2e0c08', '#4a160e', '#5e1e12', '#702818'], th: T5, dith: 0 });
celMat(CM.TNAIL, { ramp: ['#4a1c22', '#a06a5a', '#d09a88', '#ecc4b4', '#f8dcd0'], th: T5, dith: 0 });
// her pencil
celMat(CM.PENCIL, { ramp: ['#161004', '#3e2c0c', '#6c5218', '#9e7c2a', '#c8a43e', '#e8c860'], th: T6, dith: 0, line: 0, gap: 1 });
celMat(CM.PWOOD, { ramp: ['#24160c', '#4e3420', '#7c5838', '#a87c54', '#cca478'], th: T5, dith: 0, line: 0, gap: 1 });
celMat(CM.GRAPHITE, { ramp: ['#08080a', '#18181c', '#2c2c32', '#46464e', '#686872'], th: T5, dith: 0 });
celMat(CM.ERASER, { ramp: ['#2a1014', '#5a2630', '#8c4250', '#b86272', '#d88a96'], th: T5, dith: 0, line: 0, gap: 1 });
celMat(CM.FERRULE, { ramp: ['#141412', '#34342e', '#5c5a50', '#888478', '#b2ae9e', '#dedad0'], th: T6, dith: 0, line: 0, gap: 1 });

/** Per-grade LUT fixes: under the fire her hair keeps its copper in the dark tones (no black beret). */
export function bgLUTPatch(lut, name) {
  if (!name.startsWith('red')) return lut;
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
  const dim = name === 'redDim';
  const hair = (dim ? ['#2a0703', '#4c1206', '#74200a', '#9a3412', '#c24c1c', '#e8702c'] : ['#320804', '#5a1608', '#86280c', '#ae3c14', '#d65a20', '#ff8a3a']).map(hex);
  for (const m of [CM.HAIR, CM.HAIR_D]) if (lut[m]) lut[m] = Uint32Array.from(hair);
  return lut;
}

// ------------------------------------------------------------------------------------------ the desk
const DESK_EDGE_PTS = [[18, 0], [W + 4, 12]];   // far edge (just in frame at the right)
const DESK_LEFT = [[18, 0], [6, H + 4]];        // left edge
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
  const band = (a, b, nrmv) => {
    cel.stroke([a, b], (x, y) => { for (let k = 0; k < 3; k++) { const xx = x - Math.round(nrmv[0] * k), yy = y - Math.round(nrmv[1] * k); if (cel.matAt(xx, yy) !== CM.FLOOR) cel.put(xx, yy, CM.DESK_EDGE, { z: 0.5, n: [nrmv[0] * 0.6, nrmv[1] * 0.6, 0.8], sid: 3, fix: k === 0 ? 4 : k === 1 ? 3 : -1 }); } });
  };
  band(DESK_EDGE_PTS[0], DESK_EDGE_PTS[1], [0, -1]);
  band(DESK_LEFT[0], DESK_LEFT[1], [-1, 0]);
  // scratches: fine, pale, mostly along the grain; a few gouges
  for (let k = 0; k < 64; k++) {
    const x = 20 + r() * 460, y = 18 + r() * 250, a = (r() < 0.75 ? (r() - 0.5) * 0.4 : r() * 3.1), L = 4 + r() * 24;
    const lite = r() < 0.7;
    cel.stroke([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], (px, py, tt) => { if (tt > 0.1 && tt < 0.92 && ((px * 7 + py) % 5) !== 0) cel.shift(px, py, lite ? 1 : -1, [CM.DESK, CM.DESK_G]); });
  }
  // carved initials: tiny, faint, filled with years of graphite
  carve(cel, 404, 34, 'KR 91');
  carve(cel, 40, 226, 'J+M');
  carve(cel, 150, 252, 'HH');
  // a ring stain from a can, long ago — well away from her
  for (let a = 0.5; a < 5.4; a += 0.02) { const x = Math.round(440 + Math.cos(a) * 12), y = Math.round(54 + Math.sin(a) * 9); if (vn(a * 20, 0, 3, 8) > 0.45) cel.shift(x, y, 1, [CM.DESK, CM.DESK_G]); }
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
      if ((i + j + cx) % 4 === 0) continue;                       // worn: broken strokes
      const x = cx + i, y = y0 + j;
      if (cel.matAt(x, y) === CM.DESK || cel.matAt(x, y) === CM.DESK_G) cel.shift(x, y, -1, [CM.DESK, CM.DESK_G]);
    }
    cx += g[0].length + 1;
  }
}

// ------------------------------------------------------------------------------------------ Tess
/** A height field over a sub-rectangle of the frame, addressed in frame coordinates. */
function subHF(box, k) {
  const [x0, y0, x1, y1] = box, hf = new HField(x1 - x0, y1 - y0, k);
  const P = (pts) => pts.map(([x, y]) => [x - x0, y - y0]);
  return {
    hf, x0, y0,
    blob: (cx, cy, rx, ry, hgt, o = {}) => hf.blob(cx - x0, cy - y0, rx, ry, hgt, o),
    tube: (ax, ay, r0, bx, by, r1, o) => hf.tube(ax - x0, ay - y0, r0, bx - x0, by - y0, r1, o),
    groove: (pts, r, d) => hf.groove(P(pts), r, d),
    fold: (pts, r, d) => hf.fold(P(pts), r, d),
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

function buildArms(cel) {
  const D = CM.DENIM;
  // her back & shoulders, nearest the camera, falling off the bottom of the frame
  limb(cel, 100, [280, 222, 480, 270], (hf) => { hf.blob(408, 306, 124, 76, 74, { mat: D, p: 0.5 }); hf.blob(334, 282, 46, 40, 58, { mat: D, p: 0.55 }); }, {
    carve: (hf) => { hf.groove([[372, 246], [404, 258], [440, 250]], 3, 4); hf.groove([[318, 262], [330, 280], [326, 300]], 4, 5); },
  });
  // right forearm (under): from past the frame's right edge to its cuff under the left elbow
  limb(cel, 101, [224, 156, 480, 240], (hf) => hf.tube(496, 184, 23, 252, 214, 20, { mat: D, z0: 0, z1: 0, k: 0.95 }), {
    carve: (hf) => { for (const x of [452, 470]) hf.groove([[x, 166], [x + 4, 184], [x + 1, 204]], 2.6, 3.5); },
  });
  // the right sleeve's cuff: a turned band, the hand comes out of it to the left
  limb(cel, 102, [222, 188, 286, 240], (hf) => hf.tube(248, 214, 19.5, 262, 212, 20.5, { mat: D, z0: 1, z1: 1, k: 0.95 }));
  // left upper arm down to the elbow, and the left forearm folded across, under her face
  limb(cel, 103, [224, 186, 354, 270], (hf) => hf.tube(320, 300, 30, 262, 222, 25, { mat: D, z0: 24, z1: 14, k: 0.9 }), {
    carve: (hf) => { hf.groove([[264, 228], [278, 238], [296, 240]], 3, 4); hf.groove([[282, 252], [298, 258], [314, 258]], 3, 3.5); },
  });
  limb(cel, 104, [228, 160, 468, 238], (hf) => {
    hf.tube(266, 210, 24, 440, 197, 21, { mat: D, z0: 14, z1: 12, k: 0.95 });
    hf.blob(266, 212, 26, 24, 22, { base: 14, mat: D, p: 0.55 });                  // the elbow
    hf.blob(352, 196, 36, 13, 40, { base: 14, mat: D, p: 0.6 });                   // fabric bunched up under her cheek
    hf.tube(312, 183, 11, 352, 188, 12, { mat: D, z0: 44, z1: 44, k: 0.95 });       // ... and up over her mouth: she hides in it
    hf.tube(352, 188, 12, 396, 192, 10, { mat: D, z0: 44, z1: 40, k: 0.95 });
  }, {
    carve: (hf) => {
      for (const [x, d] of [[296, 3.5], [320, 3], [410, 3.5], [430, 3]]) hf.groove([[x, 184], [x + 5, 199], [x + 2, 218]], 2.8, d);
      hf.fold([[302, 192], [320, 202], [338, 213]], 3, 3);
    },
  });
}

function denimDetail(cel) {
  const den = [CM.DENIM];
  // flat-felled seams: a dark fold line with copper stitching beside it
  const seam = (pts, sids, stitchSide = 2) => cel.stroke(pts, (x, y) => {
    const i = cel.idx(x, y); if (i < 0 || !den.includes(cel.mat[i]) || (sids && !sids.includes(cel.sid[i]))) return;
    cel.mat[i] = CM.DENIM_D; cel.fix[i] = -1;
    const j = cel.idx(x, y + stitchSide); if (j >= 0 && cel.mat[j] === CM.DENIM && ((x + y) % 3 === 0)) cel.mat[j] = CM.STITCH;
  });
  seam(quad([278, 197], [362, 193], [444, 187], 30), [104]);          // left forearm, outer seam
  seam(quad([446, 176], [470, 174], [496, 170], 12), [101]);          // right forearm
  seam(quad([272, 228], [294, 254], [316, 288], 16), [103], 1);       // left upper arm
  seam(quad([318, 266], [400, 248], [486, 258], 30), [100]);          // yoke across her back
  // the right cuff: its seam ring set well back from the opening (no button at the end)
  cel.stroke([[264, 194], [266, 232]], (x, y) => { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === 102) cel.mat[i] = CM.DENIM_D; });
  cel.stroke([[240, 198], [238, 230]], (x, y) => { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === 102) cel.off[i] = -1; });   // the opening's rolled lip
  // light-wash wear on the tops of the folds; a faint twill
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (cel.mat[i] !== CM.DENIM) continue;
    if (vn(x, y * 3, 9, 41) > 0.72 && cel.ny[i] < -0.15) cel.off[i] += 1;
    if (((x * 2 + y) % 7) === 0 && cel.fix[i] < 0 && vn(x, y, 6, 42) > 0.55) cel.off[i] -= 1;
  }
}

// ---- her head: the face in 3/4 profile on the left (turned toward him), the ear far back, the skull
// under a mass of hair that stops short of the right edge
const SKULL = { cx: 390, cy: 141, rx: 58, ry: 54 };
const FACE = {
  prof: [[334, 113], [329, 120], [327, 128], [326, 136], [328, 142], [325, 147], [320, 153], [316, 158], [317, 162], [321, 164], [324, 166], [322, 169], [324, 173], [328, 178], [332, 186],
    [350, 192], [370, 194], [388, 188], [398, 178], [402, 162], [401, 146], [396, 132], [386, 122], [370, 116], [352, 113]],
  eye: [345, 149], brow: [340, 137], ear: [396, 158], nose: [317, 160],
};
function sculptFace(cel) {
  const g = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  const x0 = 306, y0 = 104, w = 106, h = 98, zb = new Float32Array(w * h).fill(-1e9);
  const [ex, ey] = FACE.ear;
  const earIn = (fx, fy) => ((fx - ex) / 6.5) ** 2 + ((fy - ey) / 10.5) ** 2 < 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x0 + x + 0.5, fy = y0 + y + 0.5;
    const ear = earIn(fx, fy);
    if (!inPoly(FACE.prof, fx, fy) && !ear) continue;
    let z = 40 + Math.sqrt(Math.min(polyDist(FACE.prof, fx, fy), 18) / 18) * 13;
    z += 3 * g(fx, fy, 335, 136, 9, 3.5);                // brow ridge
    z -= 3.4 * g(fx, fy, 345, 149, 7, 4);                // eye socket
    z += 3.4 * g(fx, fy, 352, 161, 11, 6);               // cheekbone
    z += 3.2 * g(fx, fy, 322, 156, 5, 6);                // nose
    z -= 1.2 * g(fx, fy, 374, 150, 12, 14);              // the temple, flat, turning toward the ear
    z -= 1.6 * g(fx, fy, 372, 176, 12, 9);               // the hollow under the cheekbone
    if (ear) z = 55 + Math.sqrt(Math.max(0, 1 - ((fx - ex) / 6.5) ** 2 - ((fy - ey) / 10.5) ** 2)) * 4 - 2.6 * g(fx, fy, ex - 0.5, ey, 2.4, 5.5);
    zb[y * w + x] = z;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = zb[i]; if (z < -1e8) continue;
    const zz = (j, ok) => (ok && zb[j] > -1e8 ? zb[j] : z - 2);
    const gx = (zz(i + 1, x < w - 1) - zz(i - 1, x > 0)) * 0.5, gy = (zz(i + w, y < h - 1) - zz(i - w, y > 0)) * 0.5;
    const fx = x0 + x, fy = y0 + y;
    cel.put(fx, fy, CM.SKIN, { z, n: [-gx, -gy, 1], sid: earIn(fx + 0.5, fy + 0.5) ? 122 : 120, fix: -1, off: 0, mode: 'z', flag: 2 });
  }
}

/**
 * Hair as locks (the portrait's way): a solid mass over the skull (its outline pulled in), and over it
 * ribbons of hair from the crown — forward to the hairline, back and down past the mass as separate
 * lock tips, tucked behind the ear; two forelocks on the desk toward the hand and one on her brow.
 */
function buildHair(cel, r, o = {}) {
  const locks = [];
  const add = (pts, w0, k = {}) => locks.push({ pts, w0, id: locks.length, ...k });
  // the crown: hair radiates from it — back and down to her collar, up and over onto the desk, forward
  // to the hairline (ending in bangs on her forehead). Every lock runs past the skull and ends in its own
  // tapered tip, so the silhouette is a dome broken into tips with gaps between them.
  const crown = [418, 106];
  const radial = [
    // [angle (deg, 0 = right, 90 = down), reach past the skull, width, bend] — all curl the same way (a whorl)
    [70, 10, 9, 0.16], [50, 13, 10, 0.16], [30, 11, 10, 0.17], [10, 12, 11, 0.17], [-10, 13, 11, 0.18],
    [-30, 11, 11, 0.18], [-52, 10, 11, 0.18], [-74, 10, 11, 0.17], [-98, 12, 10, 0.16], [-122, 9, 9, 0.15],
  ];
  const skullR = (a) => { const c = Math.cos(a), s2 = Math.sin(a); return 1 / Math.sqrt((c / SKULL.rx) ** 2 + (s2 / SKULL.ry) ** 2); };
  for (const [deg, reach, w0, bend] of radial) {
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    // distance from the crown to the skull's edge along this way (the crown is off-centre)
    let R = 10; while (R < 160 && (((crown[0] + ca * R) - SKULL.cx) / SKULL.rx) ** 2 + (((crown[1] + sa * R) - SKULL.cy) / SKULL.ry) ** 2 < 1) R += 1;
    void skullR;
    const L = R + reach + (r() - 0.5) * 4;
    const p0 = [crown[0] + ca * 3, crown[1] + sa * 3], p2 = [crown[0] + ca * L, crown[1] + sa * L];
    const p1 = [crown[0] + ca * L * 0.55 - sa * L * bend, crown[1] + sa * L * 0.55 + ca * L * bend];
    if (p2[0] > W - 12) p2[0] = W - 12 - r() * 3;
    add(quad(p0, p1, p2, 18), w0 + r() * 2, { back: deg > -60, tip: true });
  }
  // forward over the top to the hairline
  const front = [[340, 113], [348, 108], [360, 102], [374, 96], [390, 92]];
  front.forEach((p2, k) => add(quad([crown[0] - 2 - k, crown[1] + 2 - k], [lerp(crown[0], p2[0], 0.5) - 2, lerp(crown[1], p2[1], 0.5) - 14 + k * 2], p2, 18), 9 + r() * 2, { top: true }));
  // over the temple, tucked behind the ear and down onto her collar
  add(quad([354, 113], [388, 118], [405, 146], 16), 7.5, { temple: true });
  add(quad([366, 109], [398, 118], [411, 154], 16), 8, { temple: true });
  add(quad([404, 142], [414, 166], [410, 198], 12), 7, { behind: true });
  // bangs: short locks falling from the hairline onto her forehead (none crosses the eye)
  add(quad([346, 110], [340, 116], [336, 126], 10), 4.2, { fore: true, brow: true });
  add(quad([353, 112], [350, 119], [349, 127], 10), 3.6, { fore: true, brow: true });
  add(quad([366, 113], [370, 122], [376, 132], 10), 3.4, { fore: true, brow: true });
  // the forelocks: two on the desk toward the hand (the upper one runs under his index fingertip)
  add([...quad([344, 106], [324, 100], [308, 110], 10), ...quad([308, 110], [290, 124], [266, 136], 12).slice(1)], 6, { fore: true, desk: true });
  add([...quad([337, 112], [324, 112], [314, 120], 9), ...quad([314, 120], [306, 126], [303, 134], 7).slice(1)], 5, { fore: true, desk: true });
  add(quad([342, 99], [330, 88], [316, 86], 10), 4, { fore: true, desk: true });
  // coverage & ownership: later locks lie on top
  const own = new Int16Array(W * H).fill(-1), across = new Float32Array(W * H), along = new Float32Array(W * H);
  const widthAt = (Lk, t) => {
    if (Lk.fore) return Lk.w0 * (t < 0.55 ? 1 : Math.max(0.12, 1 - (t - 0.55) / 0.45)) ** 0.9;
    if (Lk.top) return Lk.w0 * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(0.5, t * 0.6)));
    if (Lk.tip) return Lk.w0 * Math.min(1, 0.45 + t * 2) * (t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38) ** 0.75);
    return Lk.w0 * (t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4) ** 0.7) * (0.92 + 0.08 * Math.cos(t * 7 + Lk.id));
  };
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
  // the solid mass: the skull ellipse with its outline pulled in (the locks make the silhouette)
  const inMass = (x, y) => {
    const u = (x + 0.5 - SKULL.cx) / (SKULL.rx - 4), v = (y + 0.5 - SKULL.cy) / (SKULL.ry - 3);
    return u * u + v * v < 1 && x < 450 && y < 192;
  };
  const dome = (x, y) => { const u = (x + 0.5 - SKULL.cx) / SKULL.rx, v = (y + 0.5 - SKULL.cy) / SKULL.ry, q = Math.max(0, 1 - u * u - v * v); return [u * 0.9, v * 0.9, Math.sqrt(q) + 0.12]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const mass = inMass(x, y);
    const Lk = own[i] >= 0 ? locks[own[i]] : null;
    if (!mass && !Lk) continue;
    const onFace = cel.mat[i] === CM.SKIN && (cel.sid[i] === 120 || cel.sid[i] === 122);
    if (onFace && !(Lk && (Lk.brow || Lk.temple || Lk.behind))) continue;                 // the face shows, except under those locks
    if (onFace && Lk && Lk.temple && cel.sid[i] === 122) continue;                       // the ear stays in front of the tucked hair
    const q = Lk ? across[i] : 0;
    let n, zz;
    if (Lk && Lk.desk) { n = [q * 0.6, -0.15, 1]; zz = Math.max(0, cel.z[i]) + 2.5; }
    else if (Lk && (Lk.tip || Lk.behind) && !mass) { const dn = dome(x, y); n = [dn[0] * 0.7 + q * 0.55, dn[1] * 0.7, 0.85]; zz = Math.max(cel.z[i], 20) + 6 + (1 - along[i]) * 4; }
    else { const dn = dome(x, y), tq = Lk ? Lk.pts[Math.min(Lk.pts.length - 1, Math.round(along[i] * (Lk.pts.length - 1)))] : null; n = [dn[0] + q * 0.5, dn[1] + q * 0.2, dn[2]]; zz = 52 + dn[2] * 14 + (Lk ? 2 + Lk.id * 0.05 : 0); void tq; }
    if (Lk && Lk.brow) zz = Math.max(zz, cel.z[i] + 3);
    if (Lk && Lk.temple && onFace) zz = cel.z[i] + 2.5;
    cel.put(x, y, mass && !Lk ? CM.HAIR_D : CM.HAIR, { z: zz, n, sid: 200 + (Lk ? Lk.id : 99), fix: -1, off: 0 });
  }
  // separations where a lock lies on another (broken), strands along each lock, clumped dark tips
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if ((cel.mat[i] !== CM.HAIR && cel.mat[i] !== CM.HAIR_D) || own[i] < 0) continue;
    const Lk = locks[own[i]];
    let sep = false;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (own[j] >= 0 && own[j] > own[i] && (cel.mat[j] === CM.HAIR)) sep = true;
    if (sep && along[i] > (Lk.tip ? 0.3 : 0.1) && vn(x, y, 7, Lk.id) > 0.3) { cel.fix[i] = 1; continue; }
    const sq = Math.abs(((across[i] + 1) * 1.3 + Lk.id * 0.37) % 1 - 0.5);
    if (sq < 0.05 && along[i] > 0.15 && along[i] < 0.85 && vn(x, y, 5, Lk.id + 50) > 0.6) cel.off[i] -= 1;
    if (along[i] > 0.9 && !Lk.top) cel.off[i] -= 1;
    // a highlight streak on each lock, on its side toward the light (tube from the upper left; fire below)
    const t = along[i], q = across[i];
    if (t > 0.12 && t < 0.62 && Math.abs(q + 0.38) < 0.2 && vn(x * 0.5, y, 4, Lk.id + 90) > 0.38) cel.flag[i] |= 16;
    if (t > 0.3 && t < 0.85 && Math.abs(q - 0.4) < 0.2 && vn(x * 0.5, y, 4, Lk.id + 91) > 0.38) cel.flag[i] |= 32;
  }
  return locks;
}

/** Her face: the squeezed-shut eye, the knitted brow, nostril, lips, flushed cheek, freckles, the ear. */
function paintFace(cel, F, r) {
  const [ex, ey] = F.eye;
  const skin = [CM.SKIN, CM.CHEEK];
  const isS = (x, y) => { const i = cel.idx(x, y); return i >= 0 && skin.includes(cel.mat[i]); };
  const P = (x, y, m, k) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i])) { cel.mat[i] = m; cel.fix[i] = k; } };
  const T = (x, y, k) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i])) cel.fix[i] = k; };
  const S = (x, y, d) => { const i = cel.idx(x, y); if (i >= 0 && skin.includes(cel.mat[i]) && cel.fix[i] < 0) cel.off[i] += d; };
  // flushed cheek where it presses into the sleeve
  for (let y = 156; y < 194; y++) for (let x = 330; x < 392; x++) {
    const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== CM.SKIN || cel.sid[i] !== 120) continue;
    const d = ((x - 358) / 18) ** 2 + ((y - 176) / 11) ** 2;
    if (d < 0.75 || (d < 1 && ((x + y) & 1))) cel.mat[i] = CM.CHEEK;
  }
  // the shut eye: the lid squeezed into a downward arc, heavier at the outer corner
  const lash = quad([ex - 7, ey - 1], [ex - 1, ey + 3], [ex + 7, ey], 18);
  cel.stroke(lash, (x, y, tt) => { P(x, y, CM.LASH, tt > 0.45 ? 0 : 1); if (tt > 0.5) P(x, y - 1, CM.LASH, 1); });
  for (const [dx, dy] of [[-4, 3], [-1, 3], [2, 3], [5, 2], [7, 1]]) P(ex + dx, ey + dy, CM.LASH, 2);        // lashes
  cel.stroke(quad([ex - 6, ey - 4], [ex, ey - 7], [ex + 7, ey - 4], 12), (x, y) => T(x, y, 2));           // upper lid fold, pulled tight
  cel.stroke(quad([ex - 5, ey + 5], [ex + 1, ey + 7], [ex + 6, ey + 4], 10), (x, y) => T(x, y, 2));       // lower lid pushed up
  for (let k = 0; k < 2; k++) cel.stroke([[ex + 9, ey - 1 + k * 3], [ex + 13, ey - 2 + k * 5]], (x, y) => T(x, y, 2));   // squeezing: crow's feet
  // the brow: copper-dark, pulled down and in at its inner end (knitted)
  const [bx, by] = F.brow;
  cel.stroke(quad([bx - 8, by + 4], [bx, by - 2], [bx + 10, by - 1], 16), (x, y, tt) => { P(x, y, CM.LASH, 3); if (tt < 0.7) P(x, y + 1, CM.LASH, 2); if (tt > 0.15 && tt < 0.6) P(x, y - 1, CM.LASH, 4); });
  cel.stroke([[bx - 8, by + 6], [bx - 6, by + 9]], (x, y) => T(x, y, 2));                                  // the knit between the brows
  // nose: lit ridge, nostril, the shadow under it; lips pressed into the sleeve
  cel.stroke([[328, 143], [320, 156]], (x, y) => S(x, y, 1));
  T(319, 162, 1); T(320, 162, 1); T(321, 163, 2);
  cel.stroke([[322, 166], [325, 169]], (x, y) => T(x, y, 2));
  for (const [x, y] of [[323, 171], [324, 172], [325, 172], [326, 173]]) P(x, y, CM.CHEEK, 2);
  T(325, 170, 1); T(326, 171, 1);
  // the ear: rim, the dark of its bowl, the lobe
  const [qx, qy] = F.ear;
  cel.stroke(quad([qx + 2, qy - 8], [qx - 4, qy], [qx + 2, qy + 8], 12), (x, y) => T(x, y, 2));
  cel.stroke(quad([qx + 3, qy - 5], [qx, qy], [qx + 3, qy + 5], 10), (x, y) => T(x, y, 1));
  cel.stroke(quad([qx - 3, qy - 9], [qx - 7, qy], [qx - 3, qy + 9], 12), (x, y) => S(x, y, 1));
  // freckles: across the cheek and the bridge of the nose (sparse, never in pairs)
  for (let k = 0; k < 34; k++) {
    const x = Math.round(328 + r() * 40), y = Math.round(152 + r() * 20);
    const i = cel.idx(x, y); if (i < 0 || !skin.includes(cel.mat[i]) || cel.fix[i] >= 0 || !isS(x + 1, y) || !isS(x, y + 1) || !isS(x - 1, y)) continue;
    if (Math.hypot(x - ex, y - ey) < 8) continue;
    cel.mat[i] = CM.FRECKLE;
  }
}

/** Her right hand, small, curled loosely around the pencil — the portrait's skin, a 1-px line. */
function buildHand(cel) {
  // the pencil: dropped against the curl of her fingers, its point toward his little finger
  const a = [198, 238], b = [262, 216], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
  const n = [-d[1], d[0]];
  for (let s = -6; s <= L + 8; s += 0.5) for (let k = -2.6; k <= 2.6; k += 0.5) {
    const x = Math.round(a[0] + d[0] * s + n[0] * k), y = Math.round(a[1] + d[1] * s + n[1] * k);
    const q = k / 2.6;
    let m = CM.PENCIL, rr = 2.6;
    if (s < 0) { m = CM.GRAPHITE; rr = 2.6 * (1 + s / 6); }
    else if (s < 6) { m = CM.PWOOD; rr = 2.6 * Math.min(1, 0.35 + s / 6); }
    else if (s > L - 1 && s <= L + 3) m = CM.FERRULE;
    else if (s > L + 3) m = CM.ERASER;
    if (Math.abs(k) > rr) continue;
    const facet = Math.round(q * 1.5) / 1.5;
    cel.put(x, y, m, { z: 3 + Math.sqrt(Math.max(0, 1 - q * q)) * 2.5, n: [n[0] * facet, n[1] * facet, Math.sqrt(Math.max(0.1, 1 - facet * facet))], sid: 130, fix: -1, off: 0, mode: 'z' });
  }
  // the hand: back of the hand coming out of the cuff, a row of four knuckles, the curled fingers
  // wrapped over the pencil, the thumb lying along it
  const hf = subHF([200, 192, 252, 244], 0.45);
  hf.blob(240, 214, 10, 9.5, 9, { base: 4, mat: CM.SKIN, p: 0.6 });                 // back of the hand
  const kn = [[229, 205], [227.5, 210.5], [227, 216.5], [228, 222]];                 // knuckles, index → little
  kn.forEach(([x, y], k) => hf.blob(x, y, 3.8 - k * 0.2, 3.6 - k * 0.2, 2.6, { base: 9, mat: CM.SKIN, p: 0.55 }));
  // the curled fingers: one rounded roll wrapped over the pencil (the segments only as creases)
  hf.tube(223, 204, 4.4, 222.5, 224, 4.0, { mat: CM.SKIN, z0: 6, z1: 5, k: 0.8 });
  hf.tube(240, 225, 3.4, 228, 229, 3.0, { mat: CM.SKIN, z0: 7, z1: 6, k: 0.8 });     // the thumb along the pencil
  hf.finalize();
  hf.groove([[235, 206], [233.5, 214], [234.5, 221]], 1.0, 0.7);                    // where the knuckles fold
  cel.fromHF(hf.hf, { sid: 110, mode: 'z', dx: hf.x0, dy: hf.y0 });
  for (let y = 192; y < 244; y++) for (let x = 200; x < 252; x++) { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === 110) cel.flag[i] |= 2; }
  // creases between the curled fingers, fingernails just showing at the roll's front
  for (let k = 0; k < 3; k++) { const y = (kn[k][1] + kn[k + 1][1]) / 2; cel.stroke([[224.5, y - 0.5], [219.5, y + 0.6]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === CM.SKIN && cel.sid[i] === 110) cel.fix[i] = 1; }); }
  kn.forEach(([, y], k) => { const i = cel.idx(219, Math.round(y + 0.5)); if (i >= 0 && cel.mat[i] === CM.SKIN) { cel.mat[i] = CM.TNAIL; cel.fix[i] = 3; } if (k < 3) { const j = cel.idx(219, Math.round(y + 1.5)); if (j >= 0 && cel.mat[j] === CM.SKIN) { cel.mat[j] = CM.TNAIL; cel.fix[j] = 2; } } });
}

export function buildBackground() {
  const r = rng(1018);
  const cel = new Cel(W, H);
  buildDesk(cel, r);
  buildArms(cel);
  buildHand(cel);   // (the pencil goes in after the arms: its end slides under her cuff)
  // the skull under the hair (keeps the head's volume where locks leave gaps)
  const hh = subHF([SKULL.cx - SKULL.rx - 2, SKULL.cy - SKULL.ry - 2, SKULL.cx + SKULL.rx + 2, SKULL.cy + SKULL.ry + 2], 0.18);
  sculptFace(cel);
  buildHair(cel, r);
  paintFace(cel, FACE, r);
  denimDetail(cel);
  cel.cavity(5, 0.05, 0.5);
  void hh;
  return cel;
}
export { FACE, SKULL };
