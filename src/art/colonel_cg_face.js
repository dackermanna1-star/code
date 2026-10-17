// colonel_face: extreme close-up under Tess's flashlight. His portrait's small, serene, almost-human
// face — too smooth, waxy, doll-like — pressed into the vast dough of a head that is anything but
// smooth: pored, mottled, flecked with coarse hairs, sweating in its folds. The geometry is the
// shared head rig (colonel_face.js drawHead); the rendering is the cel pipeline (colonel_cg_cel.js).
// params.lit 0..1 = how much of the light is on him (cheap re-quantization of one lighting pass).
import { GBuf, M } from './colonel_gbuf.js';
import { drawHead, repaintEyes, FACE_EXPR } from './colonel_face.js';
import { Cel, celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, celFromGB, bay, h01, vn, fbm, clamp } from './colonel_cg_cel.js';
import { rng } from './util.js';

const W = 480, H = 270;
// ---------------------------------------------------------------------------------------- materials
export const FM = { DOUGH: 60, DOUGH_R: 61, DOUGH_Y: 62, FACE: 63, BLUSH: 64, WHISK: 65, SCLERA: 66, IRIS: 67, PUPIL: 68, LIP: 69, MOUTH: 70, DOUGH_D: 71, BHAIR: 72, SWEAT: 73 };
const TD = [0.08, 0.19, 0.33, 0.52, 0.74, 0.95];
const DJ = [0.055, 8, 0.03];
const DF = 5;
// the dough: pale, cool, dead, with livid and sallow patches
celMat(FM.DOUGH, { jit: DJ, fold: DF, ramp: ['#09080a', '#1f1819', '#3e3230', '#665650', '#8f7e72', '#b6a594', '#dacbb6'], th: TD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.97, w: 0.03, k: 0.3 } });
celMat(FM.DOUGH_R, { jit: DJ, fold: DF, ramp: ['#0a0709', '#22151a', '#45282e', '#6e4448', '#95686a', '#b98e8a', '#d9b6a8'], th: TD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.97, w: 0.03, k: 0.3 } });
celMat(FM.DOUGH_Y, { jit: DJ, fold: DF, ramp: ['#090908', '#1c1a15', '#3a362a', '#625c48', '#8a846a', '#b0aa8c', '#d4cfb0'], th: TD, line: 0, lineLit: 1, gap: 4, spec: { at: 0.97, w: 0.03, k: 0.3 } });
celMat(FM.DOUGH_D, { jit: DJ, fold: DF, ramp: ['#070506', '#170f10', '#2e2020', '#4a3634', '#6a524a', '#8c7466', '#ac9682'], th: TD, line: 0, gap: 4 });
// the face: warmer, waxier, smoother — fewer, wider bands, a doll's sheen
celMat(FM.FACE, { ramp: ['#100a0a', '#33221f', '#5f463f', '#8f7163', '#bb9c88', '#dcc5ae', '#f5e8d6'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5, spec: { at: 0.94, w: 0.05, k: 0.55 } });
celMat(FM.BLUSH, { ramp: ['#120a0a', '#3a201e', '#6a403a', '#9c6a5e', '#c4907e', '#e2b4a0', '#f6d6c4'], th: [0.08, 0.2, 0.36, 0.56, 0.8, 0.95], line: 1, lineLit: 2, gap: 3.5, spec: { at: 0.94, w: 0.05, k: 0.55 } });
celMat(FM.LIP, { ramp: ['#120808', '#341a18', '#5c302c', '#864a42', '#a8665a', '#c48676'], th: [0.1, 0.24, 0.42, 0.64, 0.86], line: 0, gap: 3 });
celMat(FM.MOUTH, { ramp: ['#000000', '#060101', '#100404', '#1c0808', '#2a0e0e'], th: [0.2, 0.45, 0.7, 0.95], gap: 3 });
// whiskers: gray, combed
celMat(FM.WHISK, { ramp: ['#0b0b0c', '#252528', '#46454a', '#6e6c6c', '#9a968f', '#c2bdb2', '#e2ddd2'], th: [0.08, 0.2, 0.36, 0.54, 0.74, 0.94], line: 0, lineLit: 1, gap: 2.5 });
celMat(FM.BHAIR, { ramp: ['#0b0b0c', '#252528', '#46454a', '#6e6c6c', '#9a968f', '#c2bdb2', '#dcd8cc'], th: TD, seam: false });
// the eyes: yellowed whites, a gray iris, wet
celMat(FM.SCLERA, { ramp: ['#0c0b09', '#2a2620', '#544c40', '#827866', '#aaa08a', '#cbc3aa', '#ebe5d0'], th: [0.08, 0.2, 0.36, 0.54, 0.74, 0.94], line: 0, gap: 1.5, spec: { at: 0.97, w: 0.03, k: 0.8 } });
celMat(FM.IRIS, { ramp: ['#040507', '#0e141c', '#1c2a38', '#30465a', '#4c6680', '#7a94aa'], th: [0.1, 0.24, 0.42, 0.62, 0.84], gap: 1, spec: { at: 0.96, w: 0.04, k: 1.2 } });
celMat(FM.PUPIL, { ramp: ['#010102', '#040406', '#08080c', '#101016', '#cfd8e0'], th: [0.2, 0.5, 0.85, 1.25], gap: 1, spec: { at: 0.95, w: 0.04, k: 1.4 } });
celMat(FM.SWEAT, { ramp: ['#0e0c0c', '#2e2a28', '#5c5652', '#8e8882', '#c2bcb4', '#f2eee6'], th: [0.1, 0.25, 0.45, 0.65, 0.85], seam: false });

const MAP = {
  [M.FLESH]: { mat: FM.DOUGH, sid: 1 }, [M.FLESH_D]: { mat: FM.DOUGH_D, sid: 1 }, [M.FACE]: { mat: FM.FACE, sid: 2 }, [M.BLUSH]: { mat: FM.BLUSH, sid: 2 },
  [M.HAIR]: { mat: FM.WHISK, sid: 3 }, [M.EYE]: { mat: FM.SCLERA, sid: 4 }, [M.IRIS]: { mat: FM.IRIS, sid: 5 }, [M.DARK]: { mat: FM.PUPIL, sid: 6 },
  [M.LIP]: { mat: FM.LIP, sid: 2 }, [M.MOUTH]: { mat: FM.MOUTH, sid: 7 },
};
const DOUGHS = [FM.DOUGH, FM.DOUGH_R, FM.DOUGH_Y, FM.DOUGH_D];

// the flashlight, held low and to the left of him; lit 1 = full beam on his face
const BEAM = light({ L: [-0.5, 0.26, 0.83], amb: 0.05, key: 1.02, shadow: 0.75, steps: 30, spec: 1 });
const beamFall = (x, y, lit) => { const r = 0.6 + 0.4 * lit, d = Math.hypot((x - 222) / 330, (y - 136) / 240) / r; return clamp(1.12 - d * d * 0.85, 0, 1.08); };
export const FACE_GRADE = { lit: '#fff0d8', litGain: 1.02, dark: '#5a6078', darkGain: 0.8, desat: 0.1, crush: 0.5, abyss: '#030305' };

/** Texture the dough so it never reads as rubber: mottling, pores, stretch, coarse hairs, sweat. */
export function textureDough(cel, r, o = {}) {
  const { w, h } = cel, fc = o.faceC || [240, 130], fr = o.faceR || 110;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (cel.mat[i] !== FM.DOUGH) continue;
    const fx = x + cel.ox, fy = y + cel.oy;
    // livedo: a net of livid blood under the skin, broken; a few sallow patches
    const q = 1 - Math.abs(2 * vn(fx + vn(fx, fy, 14, 35) * 9, fy, 11, 36) - 1);
    if (q > 0.9 && vn(fx, fy, 30, 37) > 0.52 && h01(fx >> 1, fy >> 1, 38) > 0.2) cel.mat[i] = FM.DOUGH_R;
    else if (fbm(fx + 50, fy, 26, 32) > 0.7) cel.mat[i] = FM.DOUGH_Y;
    // pores: tiny pits, each with a lit lip toward the light
    if (h01(fx, fy, 33) < 0.012) { cel.off[i] -= 1; const j = i - 1 + w; if (j < w * h && DOUGHS.includes(cel.mat[j]) && cel.fix[j] < 0) cel.off[j] += 1; }
  }
  // coarse hairs sprouting from the dough
  for (let k = 0; k < (o.hairs ?? 60); k++) {
    let x = r() * w, y = r() * h, a = -1.2 + r() * 2.4 + (r() < 0.5 ? Math.PI : 0);
    const i0 = cel.idx(x, y); if (i0 < 0 || !DOUGHS.includes(cel.mat[i0])) continue;
    const L = 3 + Math.floor(r() * 5);
    for (let j = 0; j < L; j++) {
      const i = cel.idx(x, y); if (i < 0 || !DOUGHS.includes(cel.mat[i]) && cel.mat[i] !== FM.BHAIR) break;
      cel.mat[i] = FM.BHAIR; cel.fix[i] = -1; cel.off[i] = j < L - 1 ? -2 : -1;
      x += Math.cos(a); y += Math.sin(a); a += 0.18;
    }
  }
  // sweat standing in the folds near the face: a bright bead over a dark pixel
  for (let k = 0; k < (o.sweat ?? 400); k++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * fr;
    const x = Math.round(fc[0] + Math.cos(a) * d * 1.4), y = Math.round(fc[1] + Math.sin(a) * d);
    const i = cel.idx(x, y); if (i < 0 || !DOUGHS.includes(cel.mat[i]) || cel.ao[i] > 0.8) continue;
    const j = cel.idx(x, y + 1); if (j < 0 || !DOUGHS.includes(cel.mat[j])) continue;
    cel.mat[i] = FM.SWEAT; cel.off[i] = 2; cel.flag[i] |= 1;
    cel.fix[j] = 1;
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

// ---------------------------------------------------------------------------------------- build
const P0 = { ...FACE_EXPR.serene, eyeSmile: 0.15, cx: 240, cy: 118, s: 4.6, seed: 1841, chins: 3, collar: false };
export const BLINKS = { open: null, l: [0, 0.36], both: [0, 0], r: [0.42, 0] };
const st = { gb: null, cel: null, lev: null, frames: new Map(), patches: new Map(), eyeRect: null };

function baseGB() {
  if (st.gb) return st.gb;
  const gb = new GBuf(W, H);
  drawHead(gb, P0);
  gb.folds(1.4 * P0.s, 0.72, 0.9);
  gb.ssao(9, 0.012, 0.35);
  return (st.gb = gb);
}
function toCel(gb, blink = null, P = P0, o = {}) {
  const cel = celFromGB(gb, MAP);
  textureDough(cel, rng(P.seed || 1841), { faceC: [P.cx, P.cy + 12], faceR: 24 * P.s, ...o });
  finishFace(cel);
  wetEyes(cel, blink, P);
  return cel;
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
function wetEyes(cel, blink, P = P0) {
  const s = P.s, hw = 3.45 * s, hh = 2.1 * s;
  for (const sd of [-1, 1]) {
    const L = sd < 0, lid = blink ? blink[L ? 0 : 1] : (L ? P.lidL : P.lidR);
    if (lid < 0.15) continue;
    const gz = L ? P.gazeL : P.gazeR, ex = P.cx + sd * 6 * s, ey = P.cy + 0.2 * s;
    const ix = ex + gz[0] * hw * 0.55, lidY = ey - hh + (1 - lid) * hh * 2;
    const cx = Math.round(ix - 0.35 * s), cy = Math.round(lidY + 1.6);
    for (const [dx, dy, k] of [[0, 0, 4], [1, 0, 4], [0, 1, 3]]) { const i = cel.idx(cx + dx, cy + dy); if (i >= 0 && (cel.mat[i] === FM.IRIS || cel.mat[i] === FM.PUPIL)) { cel.mat[i] = FM.PUPIL; cel.fix[i] = k; } }
    // the wet line along the lower lid
    for (let x = Math.round(ex - hw * 0.6); x <= ex + hw * 0.6; x++) {
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
  const s = P0.s, ex0 = Math.floor(P0.cx - 12 * s), ex1 = Math.ceil(P0.cx + 12 * s), ey0 = Math.floor(P0.cy - 5 * s), ey1 = Math.ceil(P0.cy + 4.5 * s);
  st.eyeRect = [ex0, ey0, ex1, ey1];
  return st.cel;
}
const levFor = (lit) => (i, x, y, l) => {
  const full = beamFall(x, y, 1), now = beamFall(x, y, lit);
  return full > 0 ? (l - 0.0) * (0.35 + 0.65 * lit) * (now / full) + 0.012 * lit : 0;
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
/** The face at a flashlight level (0..levels-1). */
export function faceFrame(level, levels) {
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
export function blinkPatch(state, level, levels) {
  const key = `${state}|${level}`;
  if (st.patches.has(key)) return st.patches.get(key);
  baseCel();
  const gb = baseGB().clone();
  repaintEyes(gb, { ...P0, blink: BLINKS[state] });
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
export function faceReady() { return !!st.cel; }
/** Background prep in slices. */
export function prepFace(levels) {
  if (!st.gb) { baseGB(); return false; }
  if (!st.cel) { baseCel(); return false; }
  for (let lv = levels - 1; lv >= 0; lv--) if (!st.frames.has(`open|${lv}`)) { faceFrame(lv, levels); return false; }
  return true;
}
