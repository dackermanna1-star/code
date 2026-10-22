// colonel_face: extreme close-up under Tess's flashlight. His portrait's small, serene, almost-human
// face — too smooth, waxy, doll-like — pressed into the vast dough of a head that is anything but
// smooth: pored, mottled, flecked with coarse hairs, sweating in its folds. The geometry is the
// shared head rig (colonel_face.js drawHead); the rendering is the cel pipeline (colonel_cg_cel.js).
// params.lit 0..1 = how much of the light is on him (cheap re-quantization of one lighting pass).
import { GBuf, M } from './colonel_gbuf.js';
import { drawHead, repaintEyes, FACE_EXPR, HOWL_MATS } from './colonel_face.js';
import { celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, celFromGB, bay, h01, vn, clamp, sstep } from './colonel_cg_cel.js';
import { rng } from './util.js';

const W = 480, H = 270;
// ---------------------------------------------------------------------------------------- materials
export const FM = { DOUGH: 60, DOUGH_R: 61, DOUGH_Y: 62, FACE: 63, BLUSH: 64, WHISK: 65, SCLERA: 66, IRIS: 67, PUPIL: 68, LIP: 69, MOUTH: 70, DOUGH_D: 71, BHAIR: 72, SWEAT: 73, FACE_V: 74, DOUGH_V: 75, TOOTH: 76, GUM: 77, TONGUE: 78, FLUSH: 79 };
const TD = [0.09, 0.22, 0.4, 0.62, 0.86, 1.06];
const TDD = [0.1, 0.26, 0.46, 0.7, 0.98, 1.2];
const DJ = null;
const DF = 4;
// the dough: pale, cool, dead, with livid and sallow patches
celMat(FM.DOUGH, { jit: DJ, dith: 0, smooth: 3, clean: true, sgroup: FM.DOUGH, fold: DF, ramp: ['#09080a', '#1f1819', '#3e3230', '#665650', '#8f7e72', '#b6a594', '#dacbb6'], th: TDD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.95, w: 0.04, k: 0.45 } });
celMat(FM.DOUGH_R, { jit: DJ, dith: 0, smooth: 3, clean: true, sgroup: FM.DOUGH, fold: DF, ramp: ['#0a0709', '#22151a', '#45282e', '#6e4448', '#95686a', '#b98e8a', '#d9b6a8'], th: TDD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.95, w: 0.04, k: 0.45 } });
celMat(FM.DOUGH_Y, { jit: DJ, dith: 0, smooth: 3, clean: true, sgroup: FM.DOUGH, fold: DF, ramp: ['#090908', '#1c1a15', '#3a362a', '#625c48', '#8a846a', '#b0aa8c', '#d4cfb0'], th: TDD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.95, w: 0.04, k: 0.45 } });
celMat(FM.DOUGH_D, { jit: DJ, dith: 0, smooth: 1, clean: true, fold: DF, ramp: ['#070506', '#170f10', '#2e2020', '#4a3634', '#6a524a', '#8c7466', '#ac9682'], th: TD, line: 0, gap: 4 });
// veins: the dough's own ramp, gone desaturated violet only in the shadow transition (tones 2-3)
celMat(FM.DOUGH_V, { jit: DJ, dith: 0, smooth: 3, clean: true, sgroup: FM.DOUGH, fold: DF, ramp: ['#09080a', '#1f1819', '#3a3040', '#5c5064', '#8f7e72', '#b6a594', '#dacbb6'], th: TDD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.95, w: 0.04, k: 0.45 } });
// the face: warmer, waxier, smoother — fewer, wider bands, a doll's sheen
celMat(FM.FACE, { ramp: ['#100a0a', '#33221f', '#5f463f', '#8f7163', '#bb9c88', '#dcc5ae', '#f5e8d6'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5, spec: { at: 0.94, w: 0.05, k: 0.55 } });
celMat(FM.BLUSH, { ramp: ['#120a0a', '#3a201e', '#6a403a', '#9c6a5e', '#c4907e', '#e2b4a0', '#f6d6c4'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5, spec: { at: 0.94, w: 0.05, k: 0.55 } });
celMat(FM.FACE_V, { ramp: ['#100a0c', '#32222a', '#5c4650', '#8a7076', '#b49aa0', '#d4c0c0', '#eee2de'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5 });
celMat(FM.LIP, { ramp: ['#120808', '#341a18', '#5c302c', '#864a42', '#a8665a', '#c48676'], th: [0.1, 0.24, 0.42, 0.64, 0.86], line: 0, gap: 3 });
celMat(FM.MOUTH, { ramp: ['#000000', '#060101', '#100404', '#1c0808', '#2a0e0e'], th: [0.2, 0.45, 0.7, 0.95], gap: 3 });
// whiskers: gray, combed
celMat(FM.WHISK, { ramp: ['#0b0b0c', '#252528', '#46454a', '#6e6c6c', '#9a968f', '#c2bdb2', '#e8e4da'], th: [0.08, 0.2, 0.36, 0.54, 0.74, 0.94], seam: false });
celMat(FM.BHAIR, { ramp: ['#0b0b0c', '#252528', '#46454a', '#6e6c6c', '#9a968f', '#c2bdb2', '#dcd8cc'], th: TD, seam: false });
// the eyes: yellowed whites, a gray iris, wet
celMat(FM.SCLERA, { ramp: ['#0c0b09', '#2a2620', '#544c40', '#827866', '#aaa08a', '#cbc3aa', '#ebe5d0'], th: [0.08, 0.2, 0.36, 0.54, 0.74, 0.94], line: 0, gap: 1.5, spec: { at: 0.97, w: 0.03, k: 0.8 } });
celMat(FM.IRIS, { ramp: ['#040507', '#0e141c', '#1c2a38', '#30465a', '#4c6680', '#7a94aa'], th: [0.1, 0.24, 0.42, 0.62, 0.84], gap: 1, spec: { at: 0.96, w: 0.04, k: 1.2 } });
celMat(FM.PUPIL, { ramp: ['#010102', '#040406', '#08080c', '#101016', '#cfd8e0'], th: [0.2, 0.5, 0.85, 1.25], gap: 1, spec: { at: 0.95, w: 0.04, k: 1.4 } });
// the howl's inside (fury): old yellowed teeth, a dark gum, the tongue low in the dark
celMat(FM.TOOTH, { ramp: ['#0e0b06', '#2e2618', '#5a4c32', '#8a7a58', '#b4a47e', '#d6caa4'], th: [0.08, 0.2, 0.38, 0.6, 0.84], line: 0, gap: 2, spec: { at: 0.95, w: 0.05, k: 0.6 } });
celMat(FM.GUM, { ramp: ['#100506', '#2c0e10', '#4e1c1e', '#743030', '#94484a'], th: [0.1, 0.26, 0.48, 0.74], line: 0, gap: 2 });
celMat(FM.TONGUE, { ramp: ['#060203', '#160708', '#2c1012', '#47201f', '#64302c'], th: [0.12, 0.3, 0.55, 0.85], gap: 3, spec: { at: 0.95, w: 0.05, k: 0.5 } });
// rage: blood up in the cheeks, the nose and the knot of the brow — still the face's waxy bands
celMat(FM.FLUSH, { ramp: ['#120909', '#391f1d', '#674038', '#986656', '#c08e78', '#deb29c', '#f2d2c0'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5, spec: { at: 0.94, w: 0.05, k: 0.55 } });
celMat(FM.SWEAT, { ramp: ['#0e0c0c', '#2e2a28', '#5c5652', '#8e8882', '#c2bcb4', '#f2eee6'], th: [0.1, 0.25, 0.45, 0.65, 0.85], seam: false });

const MAP = {
  [M.FLESH]: { mat: FM.DOUGH, sid: 1 }, [M.FLESH_D]: { mat: FM.DOUGH_D, sid: 1 }, [M.FACE]: { mat: FM.FACE, sid: 2 }, [M.BLUSH]: { mat: FM.BLUSH, sid: 2 },
  [M.HAIR]: { mat: FM.WHISK, sid: 3 }, [M.EYE]: { mat: FM.SCLERA, sid: 4 }, [M.IRIS]: { mat: FM.IRIS, sid: 5 }, [M.DARK]: { mat: FM.PUPIL, sid: 6 },
  [M.LIP]: { mat: FM.LIP, sid: 2 }, [M.MOUTH]: { mat: FM.MOUTH, sid: 7 },
  [HOWL_MATS.TEETH]: { mat: FM.TOOTH, sid: 8 }, [HOWL_MATS.GUM]: { mat: FM.GUM, sid: 8 }, [HOWL_MATS.TONGUE]: { mat: FM.TONGUE, sid: 9 }, [HOWL_MATS.SPIT]: { mat: FM.SWEAT, sid: 10 },
};
const DOUGHS = [FM.DOUGH, FM.DOUGH_R, FM.DOUGH_Y, FM.DOUGH_D, FM.DOUGH_V];

// the flashlight, held low and to the left of him; lit 1 = full beam on his face
const BEAM = light({ L: [-0.42, -0.36, 0.83], amb: 0.06, key: 1.0, shadow: 0.45, steps: 30, spec: 1, rim: [0.72, 0.5, 0.18] });
const beamFall = (x, y, lit, c = [222, 136], k = 1) => { const r = (0.6 + 0.4 * lit) * k, d = Math.hypot((x - c[0]) / 330, (y - c[1]) / 240) / r; return clamp(1.12 - d * d * 0.85, 0, 1.08); };
export const FACE_GRADE = { lit: '#fff0d8', litGain: 1.02, dark: '#5a6078', darkGain: 0.8, desat: 0.1, crush: 0.5, abyss: '#030305' };

/**
 * Texture the dough with restraint (the portraits' rule: almost no noise). Pores cluster on the lit
 * planes near the face; a few broad veins (they only show violet in the shadow transitions — see
 * DOUGH_V); a handful of coarse hairs; a few sweat beads, 2-3 px, standing on the brightest planes.
 * o: { faceC, faceR, L (key light), pores (density), veins, hairs, sweat }
 */
export function textureDough(cel, r, o = {}) {
  const { w, h } = cel, fc = o.faceC || [240, 130], fr = o.faceR || 110;
  const Lv = o.L || [-0.5, 0.26, 0.83], ll = Math.hypot(...Lv), L = Lv.map((v) => v / ll);
  const ndl = (i) => cel.nx[i] * L[0] + cel.ny[i] * L[1] + cel.nz[i] * L[2];
  const near = (x, y) => Math.hypot((x - fc[0]) / (fr * 1.35), (y - fc[1]) / fr);
  // pores: tiny pits in clusters, only where the light lies on the dough near the face
  const pd = o.pores ?? 0.035;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (cel.mat[i] !== FM.DOUGH) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    if (near(fx, fy) > 1.05 || ndl(i) < 0.72) continue;
    if (vn(fx, fy, 11, 34) > 0.58 && h01(fx, fy, 33) < pd) cel.off[i] -= 1;
  }
  // veins: a few broad, wandering paths (violet only where the light turns away)
  for (let k = 0; k < (o.veins ?? 5); k++) {
    let x = r() * w, y = r() * h, a = r() * 6.283;
    const n = 30 + Math.floor(r() * 30);
    for (let j = 0; j < n; j++) {
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        if ((dx === 2 || dy === 2) && bay(Math.round(x) + dx, Math.round(y) + dy) < 0.5) continue;
        const i = cel.idx(x + dx, y + dy); if (i >= 0 && cel.mat[i] === FM.DOUGH) cel.mat[i] = FM.DOUGH_V;
      }
      x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; a += (vn(j * 7, k * 13, 3, 36) - 0.5) * 0.5;
    }
  }
  // coarse hairs sprouting from the dough: few, dark, curved
  for (let k = 0; k < (o.hairs ?? 14); k++) {
    let x = r() * w, y = r() * h, a = -1.2 + r() * 2.4 + (r() < 0.5 ? Math.PI : 0);
    const i0 = cel.idx(x, y); if (i0 < 0 || !DOUGHS.includes(cel.mat[i0])) continue;
    const Ln = 4 + Math.floor(r() * 4);
    for (let j = 0; j < Ln; j++) {
      const i = cel.idx(x, y); if (i < 0 || !DOUGHS.includes(cel.mat[i]) && cel.mat[i] !== FM.BHAIR) break;
      cel.mat[i] = FM.BHAIR; cel.fix[i] = j < Ln - 1 ? 1 : 2;
      x += Math.cos(a); y += Math.sin(a); a += 0.16;
    }
  }
  // sweat: a handful of beads on the brightest planes near the face — a 2-3 px bead, a dark lip under it
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < (o.sweat ?? 8); tries++) {
    const a = r() * 6.283, d = (0.55 + r() * 0.5) * fr;
    const x = Math.round(fc[0] + Math.cos(a) * d * 1.3), y = Math.round(fc[1] + Math.sin(a) * d);
    const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== FM.DOUGH || ndl(i) < 0.86) continue;
    const big = r() < 0.5;
    const px = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [0, 1]];
    if (px.some(([dx, dy]) => { const j = cel.idx(x + dx, y + dy); return j < 0 || cel.mat[j] !== FM.DOUGH; })) continue;
    px.forEach(([dx, dy], k) => { const j = cel.idx(x + dx, y + dy); cel.mat[j] = FM.SWEAT; cel.off[j] = k === 0 ? 2 : 0; cel.flag[j] |= 1; });   // (it dims with the light)
    for (const [dx, dy] of [[0, big ? 2 : 1], [1, 2]]) { const j = cel.idx(x + dx, y + dy); if (j >= 0 && DOUGHS.includes(cel.mat[j])) cel.off[j] = Math.min(cel.off[j], -2); }
    placed++;
  }
}

/** The face stays smooth; the dough lapping over its edge is a lit lip, not a drawn line. */
function finishFace(cel) {
  const { w, h } = cel;
  const isF = (m) => m === FM.FACE || m === FM.BLUSH;
  for (let i = 0; i < w * h; i++) if (isF(cel.mat[i]) && cel.off[i] < 0) cel.off[i] = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (isF(cel.mat[i])) {
      let nd = false; for (const j of [i - 1, i + 1, i - w, i + w]) if (DOUGHS.includes(cel.mat[j])) nd = true;
      if (nd) cel.flag[i] |= 1;                      // no outline on the face's rim
    } else if (DOUGHS.includes(cel.mat[i])) {
      let nf = false; for (const j of [i - 1, i + 1, i - w, i + w]) if (isF(cel.mat[j])) nf = true;
      if (nf) { cel.flag[i] |= 1; cel.off[i] += 1; } // the lip of dough over it
    }
  }
}

/**
 * (fury) No rim, no mask: the face's skin goes over into the dough across a few px — the face's own colour
 * dithering out into a band of livid, warmer dough, then the dough — with no line and no lit lip anywhere.
 */
function meltRim(cel) {
  const { w, h } = cel, n = w * h;
  const isF = (m) => m === FM.FACE || m === FM.BLUSH || m === FM.FACE_V;
  const isD = (m) => m === FM.DOUGH || m === FM.DOUGH_V || m === FM.DOUGH_R || m === FM.DOUGH_Y;
  const dist = (seed) => {
    const D = new Float32Array(n).fill(99);
    for (let i = 0; i < n; i++) if (seed(cel.mat[i])) D[i] = 0;
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w] + 1, D[i - w - 1] + 1.4, D[i - w + 1] + 1.4); }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w] + 1, D[i + w + 1] + 1.4, D[i + w - 1] + 1.4); }
    return D;
  };
  const toD = dist(isD), toF = dist(isF);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = cel.mat[i], b = bay(x, y);
    // the face sunk under the fat that closes over it: occluded where the dough overhangs (above, beside)
    if (isF(m) && toD[i] < 8) {
      let k = 9;
      for (let d = 1; d <= 8; d++) { if (y - d >= 0 && isD(cel.mat[i - d * w])) { k = Math.min(k, d); break; } }
      for (let d = 1; d <= 5; d++) { if ((x - d >= 0 && isD(cel.mat[i - d])) || (x + d < w && isD(cel.mat[i + d]))) { k = Math.min(k, d * 1.5); break; } }
      if (k < 9) cel.ao[i] *= 0.5 + 0.5 * sstep(0, 8, k);
    }
    if (isF(m) && toD[i] < 4.5) {
      cel.flag[i] |= 1;
      if (b > toD[i] / 4.5 + 0.12) { cel.mat[i] = FM.DOUGH_R; cel.sid[i] = 1; }
    } else if (m === FM.DOUGH && toF[i] < 9) {
      cel.flag[i] |= 1;
      if (b > 0.15 + toF[i] / 9) cel.mat[i] = FM.DOUGH_R;
    } else if ((isD(m) || m === FM.WHISK) && toF[i] < 12) cel.flag[i] |= 1;   // (no line where the fat closes over the chops)
  }
}

// ---------------------------------------------------------------------------------------- build
// the dough as stacked horizontal fat rolls — a scalp fold and the brow roll over the little forehead,
// rolls stacked down each cheek (three on his left, two on his right: never symmetric), jowls hanging in
// tiers under the chin — over a head mass whose outline bulges unevenly (no oval, no hood rim)
export function doughRolls({ B }) {
  B(0, 4, 44, 46, 54, 0.32);                                         // the mass of the head
  B(-37, 8, 12, 20, 52, 0.5); B(38, 0, 11, 22, 53, 0.5);            // uneven bulges at its sides
  B(-30, -22, 12, 10, 51, 0.5); B(30, 30, 14, 12, 52, 0.5);
  B(-1, -17, 26, 7, 60, 0.5);                                        // the brow roll's swell
  B(-23, 6, 10, 18, 59, 0.45); B(23, 8, 10, 16, 59, 0.45);          // the cheeks' swell
  B(1, 34, 24, 12, 58, 0.45);                                        // the jowls' swell
}
// the rolls are made by their creases: each a fold whose upper side overhangs the lower (left → right
// strokes drop the side below) — stacked horizontally down the cheeks, tiered under the chin
export function doughCreases({ fold }) {
  fold([[-30, -21], [-12, -23.6], [6, -23.8], [24, -21.6], [33, -18]], 1.3, 2.4);   // under the scalp fold
  fold([[-26, -11.6], [-13, -13.2], [0, -13.6], [13, -13.2], [25, -11.2]], 1.5, 3.2); // under the brow roll
  for (const [u0, u1, v, d] of [[-36, -14, 0.5, 2.6], [-37, -14, 9.5, 2.8], [-34, -14, 18.5, 2.6]]) fold([[u0, v - 1.6], [(u0 + u1) / 2, v + 0.8], [u1, v]], 1.2, d);   // his left cheek: three rolls
  for (const [u0, u1, v, d] of [[14, 36, 4.5, 2.6], [14, 37, 15.5, 2.8]]) fold([[u0, v], [(u0 + u1) / 2, v + 1], [u1, v - 1.8]], 1.2, d);   // his right: two
  fold([[-16, 29.5], [-6, 31.6], [6, 31.6], [17, 29.2]], 1.3, 2.8);                   // under the chin
  fold([[-27, 37], [-10, 40], [8, 40.2], [28, 37.2]], 1.4, 3);                        // the next
  fold([[-34, 44.5], [-12, 48], [12, 48.2], [35, 44.6]], 1.4, 3);                     // and the next
}
// fury: the fat closing in on the face — the brow roll pressed down onto the brows, the cheek rolls lapping
// over its sides, folds of the chins shoved up into the corners of the mouth, the jowls over the jaw — so
// no clean rim is left between face and dough (the rolls sit between doughCreases' creases)
export function doughOverFury({ lip }) {
  // where the fat has closed in (angle on the face's oval → how far in its edge now reaches): deep over the
  // forehead, down onto the brows; unevenly over the cheeks (his left more than his right); shoved up at the
  // corners of the mouth; over the jaw
  const g = (a, c, w) => { let d = Math.abs(a - c) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return Math.exp(-((d / w) ** 2)); };
  lip((a) => 0.92 - 0.39 * g(a, -1.62, 0.62) - 0.12 * g(a, -2.55, 0.32) - 0.13 * g(a, 3.0, 0.3) - 0.13 * g(a, 2.42, 0.26) - 0.15 * g(a, 0.1, 0.4) - 0.12 * g(a, 0.82, 0.24) - 0.11 * g(a, 2.18, 0.2),
    3.4, (a) => 2.6 * g(a, -1.62, 0.5) + 1.2 * g(a, 0.82, 0.3) + 1.2 * g(a, 2.3, 0.3) + 2.6 * g(a, 0.1, 0.45) + 2.0 * g(a, 3.05, 0.4));   // (over the chops)
}
// the cheek rolls' creases run on over the face's edge (rig: carved into dough and face alike)
const FURY_RIM_FOLDS = [
  [[[-19, 0.2], [-14, 1.4], [-10.6, 2.8]], 1.0, 2.2], [[[-19, 9.4], [-14, 10.4], [-10.4, 11.8]], 1.0, 2.4], [[[-17, 18.6], [-12.5, 19.2], [-9.6, 20.6]], 1.0, 2.2],
  [[[10.6, 6.0], [14, 5.0], [19, 4.6]], 1.0, 2.2], [[[10.2, 16.8], [13.6, 15.9], [18.5, 15.6]], 1.0, 2.4],
];
const P0 = { ...FACE_EXPR.serene, eyeSmile: 0.15, cx: 240, cy: 118, s: 4.6, seed: 1841, chins: 3, collar: false, noStretch: true, pitDepth: 7, dough: doughRolls, doughFolds: doughCreases };
// the CG's own state (ch8.escape, DESIGN §5.1 #15b "full face, fury"): rage — the brows driven down onto the
// glaring eyes, the nose wrinkled, the cheeks bunched, the mouth torn wide and dropped far too far; the fat
// closing over its edges. Framed for the game's presentation: the voice box covers y ≥ 188, so the whole
// face, brow to lower lip, sits above it (the jowls and chins go on under the box). The serene face stays
// available (params.fury 0) for anything that wants it.
const PF = { ...P0, ...FACE_EXPR.fury, s: 5.3, cy: 74, pitDepth: 3, doughOver: doughOverFury, rimFolds: FURY_RIM_FOLDS, beamC: [228, 88], beamK: 0.86, vigC: [240, 100] };
export const FACE_MODES = { serene: P0, fury: PF };
export const BLINKS = { open: null, l: [0, 0.36], both: [0, 0], r: [0.42, 0] };
const mk = () => ({ gb: null, cel: null, lev: null, frames: new Map(), patches: new Map(), eyeRect: null });
const STS = { serene: mk(), fury: mk() };
let st = STS.fury, PM = PF;
const use = (mode) => { const m = mode === 'serene' ? 'serene' : 'fury'; st = STS[m]; PM = FACE_MODES[m]; };

function baseGB() {
  if (st.gb) return st.gb;
  const gb = new GBuf(W, H);
  drawHead(gb, PM);
  gb.folds(1.4 * PM.s, 0.72, 0.9);
  gb.ssao(9, 0.008, 0.22);
  return (st.gb = gb);
}
function toCel(gb, blink = null, P = PM, o = {}) {
  const cel = celFromGB(gb, MAP);
  // the whiskers throw no shadow on the face (dark gaps between their tips read as teeth)
  for (let i = 0; i < cel.w * cel.h; i++) if (cel.mat[i] === FM.WHISK) cel.flag[i] |= 4;
  for (let y = 0; y < cel.h - 4; y++) for (let x = 0; x < cel.w; x++) {
    const i = y * cel.w + x; if (cel.mat[i] !== FM.WHISK) continue;
    for (let k = 1; k <= 4; k++) { const j = i + k * cel.w; if (cel.mat[j] === FM.FACE || cel.mat[j] === FM.LIP || cel.mat[j] === FM.BLUSH) cel.ao[j] = Math.max(cel.ao[j], 0.92); }
  }
  textureDough(cel, rng(P.seed || 1841), { faceC: [P.cx, P.cy + 12], faceR: 24 * P.s, L: BEAM.L, pores: 0.012, veins: 2, hairs: 8, ...o });
  if (P.howl) meltRim(cel); else finishFace(cel);
  humanize(cel, P);
  wetEyes(cel, blink, P);
  return cel;
}
// almost human: the colour a living face has in its hollows and at its tips, and combed whiskers
function humanize(cel, P) {
  const s = P.s, sl = P.slide || [0, 0], X = (u) => P.cx + (u + sl[0]) * s, Y = (v) => P.cy + (v + sl[1]) * s;
  const isF = (m) => m === FM.FACE || m === FM.BLUSH;
  const zone = (u0, v0, ru, rv, fn) => {
    for (let y = Math.floor(Y(v0 - rv)); y <= Y(v0 + rv); y++) for (let x = Math.floor(X(u0 - ru)); x <= X(u0 + ru); x++) {
      const i = cel.idx(x, y); if (i < 0) continue;
      const e = ((x + 0.5 - X(u0)) / (ru * s)) ** 2 + ((y + 0.5 - Y(v0)) / (rv * s)) ** 2;
      if (e < 1) fn(i, e, x, y);
    }
  };
  for (const sd of [-1, 1]) {
    zone(sd * 6, 3.2, 3.4, 1.15, (i, e, x, y) => { if (isF(cel.mat[i]) && (e < 0.6 || bay(x, y) < 0.5)) cel.mat[i] = FM.FACE_V; });   // the bags under his eyes
    zone(sd * 2.7, 0.5, 0.55, 0.45, (i) => { if (isF(cel.mat[i]) || cel.mat[i] === FM.SCLERA) { cel.mat[i] = FM.BLUSH; cel.off[i] = -1; } });  // the wet pink corners
  }
  zone(0, 7.2, 2.6, 2.0, (i, e, x, y) => { if (cel.mat[i] === FM.FACE && (e < 0.55 || bay(x, y) < 0.5)) cel.mat[i] = FM.BLUSH; });       // the nose's tip
  if (P.scowl) {
    // rage: the blood up in the bunched cheeks, the nose, the knot between the brows (dithered out at the edges)
    const fl = (i, e, x, y) => { if (isF(cel.mat[i]) && (e < 0.6 || bay(x, y) < (0.86 - e) * 3.8)) cel.mat[i] = FM.FLUSH; };
    for (const sd of [-1, 1]) zone(sd * 8.2, 6.6, 5.4, 3.6, fl);
    zone(0, 5.6, 3.0, 3.6, fl); zone(0, -1.8, 3.2, 2.6, fl);
  }
  if (!(P.mouth > 0.3)) zone(0, (P.mouthY ?? 14.9) + 1.1, 4.6, 0.9, (i) => { if (isF(cel.mat[i])) cel.mat[i] = FM.LIP; });                                                     // his lower lip
}
/** A head (drawHead params P) as a textured cel, ready to light. */
export function headCel(P, o = {}) {
  const gb = new GBuf(o.w || W, o.h || H);
  drawHead(gb, P);
  gb.folds(1.4 * P.s, 0.72, 0.9);
  gb.ssao(Math.round(2 * P.s), 0.012, 0.35);
  return toCel(gb, null, P, o);
}
export { liftRing };
// the eyes are the most human thing about him: wet, a catchlight under each heavy lid
function wetEyes(cel, blink, P = PM) {
  const s = P.s, hw = 3.45 * s, hh = 2.1 * s;
  for (const sd of [-1, 1]) {
    const L = sd < 0, lid = blink ? blink[L ? 0 : 1] : (L ? P.lidL : P.lidR);
    if (lid < 0.15) continue;
    const gz = L ? P.gazeL : P.gazeR, ex = P.cx + sd * 6 * s, ey = P.cy + 0.2 * s;
    const ix = ex + gz[0] * hw * 0.55, lidY = ey - hh + (1 - lid) * hh * 2 + (P.lidTilt || 0) * hh * clamp((1 - sd * (ix + 0.5 - ex) / hw) / 2);
    const cx = Math.round(ix - 0.35 * s), cy = Math.round(lidY + 1.6);
    for (const [dx, dy, k] of [[0, 0, 4], [1, 0, 4], [0, 1, 3]]) { const i = cel.idx(cx + dx, cy + dy); if (i >= 0 && (cel.mat[i] === FM.IRIS || cel.mat[i] === FM.PUPIL)) { cel.mat[i] = FM.PUPIL; cel.fix[i] = k; } }
    // the wet line along the lower lid (not at the slit's distance: there it reads as teeth)
    if (s < 10) for (let x = Math.round(ex - hw * 0.6); x <= ex + hw * 0.6; x++) {
      for (let y = Math.round(ey + hh * 0.5); y <= ey + hh * 1.3; y++) {
        const i = cel.idx(x, y), j = cel.idx(x, y + 1);
        if (i >= 0 && j >= 0 && (cel.mat[i] === FM.SCLERA || cel.mat[i] === FM.IRIS) && (cel.mat[j] === FM.FACE || cel.mat[j] === FM.BLUSH)) { cel.mat[j] = FM.SCLERA; cel.fix[j] = 5; break; }
      }
    }
  }
}
function baseCel() {
  if (st.cel) return st.cel;
  st.cel = toCel(baseGB());
  st.lev = lightCel(st.cel, BEAM);
  liftRing(st.cel, st.lev);
  // where the eyes are: the only region the blink states repaint
  const s = PM.s, ex0 = Math.floor(PM.cx - 12 * s), ex1 = Math.ceil(PM.cx + 12 * s), ey0 = Math.floor(PM.cy - 5 * s), ey1 = Math.ceil(PM.cy + 4.5 * s);
  st.eyeRect = [ex0, ey0, ex1, ey1];
  return st.cel;
}
const vig = (x, y, c = [238, 136]) => { const d = Math.hypot((x - c[0]) / 214, (y - c[1]) / 150) * (0.92 + vn(x, y, 40, 61) * 0.16); const t = clamp((d - 0.66) / 0.4); return 1 - 0.75 * t * t * (3 - 2 * t); };
const levFor = (lit) => (i, x, y, l) => {
  const full = beamFall(x, y, 1, PM.beamC, PM.beamK), now = beamFall(x, y, lit, PM.beamC, PM.beamK);
  return full > 0 ? (l - 0.0) * (0.35 + 0.65 * lit) * (now / full) * vig(x, y, PM.vigC) + 0.012 * lit : 0;
};
let LUT = null;
const lut = () => LUT || (LUT = gradeLUT(FACE_GRADE));

function liftRing(cel, lev) {
  // the dough right around the face is stretched thin and wet: it catches the beam
  const { w, h } = cel, D = new Float32Array(w * h).fill(99);
  for (let i = 0; i < w * h; i++) if (cel.mat[i] === FM.FACE || cel.mat[i] === FM.BLUSH) D[i] = 0;
  for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w] + 1, D[i - w - 1] + 1.4, D[i - w + 1] + 1.4); }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w] + 1, D[i + w + 1] + 1.4, D[i + w - 1] + 1.4); }
  for (let i = 0; i < w * h; i++) if (DOUGHS.includes(cel.mat[i]) && D[i] < 14) lev[i] += 0.1 * (1 - D[i] / 14);
}
/** The face at a flashlight level (0..levels-1); mode 'fury' (default) | 'serene'. */
export function faceFrame(level, levels, mode = 'fury') {
  use(mode);
  const key = `open|${level}`;
  if (st.frames.has(key)) return st.frames.get(key);
  const cel = baseCel(), lit = level / (levels - 1);
  const sh = outline(cel, quantize(cel, st.lev, { levFn: levFor(lit) }), { lit: 0.6 });
  const c = packedToCanvas(packTones(cel, sh.tone), W, H, lut());
  bgFill(c);
  st.frames.set(key, c);
  return c;
}
/** A blink state's eye patch (canvas + offset) at a level. */
export function blinkPatch(state, level, levels, mode = 'serene') {
  use(mode);
  const key = `${state}|${level}`;
  if (st.patches.has(key)) return st.patches.get(key);
  baseCel();
  const gb = baseGB().clone();
  repaintEyes(gb, { ...PM, blink: BLINKS[state] });
  const [x0, y0, x1, y1] = st.eyeRect;
  // only the eye band is re-lit: copy it into a fresh cel of the base
  const cel = toCel(gb, BLINKS[state]), lit = level / (levels - 1);
  const rect = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  const lev = lightCel(cel, BEAM, { rect });
  liftRing(cel, lev);
  const sh = outline(cel, quantize(cel, lev, { levFn: levFor(lit), rect }), { lit: 0.6, rect });
  const p = packTones(cel, sh.tone);
  const pw = x1 - x0, ph = y1 - y0, sub = new Uint16Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) sub[y * pw + x] = p[(y + y0) * W + x + x0];
  const c = packedToCanvas(sub, pw, ph, lut());
  const out = { canvas: c, x: x0, y: y0 };
  st.patches.set(key, out);
  return out;
}
function bgFill(c) {
  // the void around him
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = '#030305'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
}
export function faceReady(mode = 'fury') { use(mode); return !!st.cel; }
/** Background prep in slices. */
export function prepFace(levels, mode = 'fury') {
  use(mode);
  if (!st.gb) { baseGB(); return false; }
  if (!st.cel) { baseCel(); return false; }
  for (let lv = levels - 1; lv >= 0; lv--) if (!st.frames.has(`open|${lv}`)) { faceFrame(lv, levels, mode); return false; }
  return true;
}
