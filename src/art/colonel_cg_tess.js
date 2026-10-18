// Tess at her desk, head down on her folded arms — colonel_hand's subject (colonel_cg_desk.js lays the desk
// under her). She follows her portrait's rules (portraits_tess.js), because her portrait sits right under
// her in the dialogue box: the face is PAINTED, not lit — the portrait's own skin ramp, three tones and a
// highlight with 2-level dithered transitions, 1-px features (two lash arcs, two thin brows lifted at their
// inner ends, one crease at the outer corner, a 2-px highlight down the bridge, freckles two steps down).
// Copper hair as locks with 1-px strand lines under one smooth crown; light-wash denim as a few planes
// separated by VALUE only — dark lines are kept for real seams (cuff, sleeve) and silhouettes.
// Everything that must read sits above y≈190 (in Ch2 the dialogue box covers the rest).
//
// Layout (frame px): her face turned toward the hand, seen from above in 3/4 — brow, the near eye (≈351,144)
// and the far one at the contour, the bridge of the nose, a squashed sliver of cheek. The forearm she lies
// on runs right → left under the face (32 px thick, its top edge undulating at y≈150-157 with a fold pushed
// up under the eye) and rises at its wrist end round the left of the face to y≈140 (x≈305-320), hiding the
// tip of the nose; her hand is lost in the cuff (≈294-304). Under it the other forearm, its elbow at the left
// (≈276,205), the upper arm going down out of frame; her back at the bottom right. Hair: one smooth arc over
// the crown, bangs, temple locks over the back of the cheek, long locks spilling onto the sleeve, and ONE
// slack lock slipping onto the desk, stopping short of his middle fingertip. Her pencil lies loose by the cuff.
import { celMat, vn, clamp, lerp, inPoly, polyDist } from './colonel_cg_cel.js';
import { CM } from './colonel_cg_handkit.js';
import { hexToRgb } from './palette.js';

const W = 480, H = 270;
const mixh = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join(''); };

// ------------------------------------------------------------------------------------------ materials
// light-wash denim, one value step under the portrait's (the hand, not her jacket, is the bright thing here)
const DEN = ['#111827', '#1b273f', '#2a3a58', '#405880', '#5c7ca2', '#7c98ba'];
const DEN_TH = [0.14, 0.3, 0.5, 0.72, 0.94];
// her portrait's skin ramp (portraits_tess.js): 0 line · 1 contact (#8e5b47) · 2 shade · 3 mid · 4 lit · 5 highlight
export const TESS_SKIN = ['#4a1c22', '#8e5b47', '#bf7e65', '#deac8c', '#ecc8ab', '#f6e0cb'];
const SKT = [0.15, 0.3, 0.47, 0.68, 0.98];
const HAIR = ['#260905', '#4e1a0e', '#7c2812', '#973617', '#b2441b', '#e27a38'];
const HTH = [0.13, 0.28, 0.45, 0.64, 0.9];
const LASH = ['#1a0604', '#2e0c08', '#4a160e', '#5e1e12', '#702818', '#86341e'];
celMat(CM.DENIM, { ramp: DEN, th: DEN_TH, line: 0, lineLit: 1, gap: 2.5, seam: false, smooth: 1, clean: true });
celMat(CM.DENIM_D, { ramp: DEN.map((c) => mixh(c, '#0a1020', 0.35)), th: DEN_TH, line: 0, gap: 2.5, seam: false, smooth: 1, clean: true });
celMat(CM.STITCH, { ramp: ['#24140c', '#4a2c16', '#7a4c26', '#a26c38', '#c08a4c', '#d8a868'], th: DEN_TH, seam: false });
celMat(CM.TBTN, { ramp: ['#1c0e06', '#42220e', '#6e3c18', '#9a5c2a', '#c08046', '#e0aa70'], th: [0.15, 0.3, 0.5, 0.72, 0.95], seam: false });
// the face's tones are painted per pixel (fix); these ramps only colour them
celMat(CM.SKIN, { ramp: TESS_SKIN, th: SKT, line: null, seam: false });
celMat(CM.CHEEK, { ramp: TESS_SKIN.map((c, i) => (i < 2 ? c : mixh(c, '#f0a09a', 0.2))), th: SKT, line: null, seam: false });
celMat(CM.FRECKLE, { ramp: TESS_SKIN.map((_, k) => TESS_SKIN[Math.max(0, k - 2)]), th: SKT, line: null, seam: false });   // two steps down
celMat(CM.HAIR, { ramp: HAIR, th: HTH, line: 0, lineLit: 1, gap: 2, seam: false, smooth: 1, clean: true, spec: { at: 0.93, w: 0.06, k: 0.22 } });
celMat(CM.HAIR_D, { ramp: HAIR.map((c) => mixh(c, '#140402', 0.25)), th: HTH, line: 0, gap: 2, seam: false, smooth: 1, clean: true });
celMat(CM.LASH, { ramp: LASH, th: SKT, seam: false });
celMat(CM.BROW, { ramp: HAIR, th: HTH, seam: false });
celMat(CM.TNAIL, { ramp: ['#4a1c22', '#a06a5a', '#d09a88', '#ecc4b4', '#f6dacc'], th: [0.15, 0.3, 0.5, 0.75], seam: false });
// her pencil
celMat(CM.PENCIL, { ramp: ['#161004', '#3e2c0c', '#6c5218', '#9e7c2a', '#c8a43e', '#e8c860'], th: [0.12, 0.28, 0.48, 0.7, 0.92], line: 0, gap: 1, seam: false });
celMat(CM.PWOOD, { ramp: ['#24160c', '#4e3420', '#7c5838', '#a87c54', '#cca478'], th: [0.12, 0.3, 0.52, 0.76], line: 0, gap: 1, seam: false });
celMat(CM.GRAPHITE, { ramp: ['#08080a', '#18181c', '#2c2c32', '#46464e', '#686872'], th: [0.12, 0.3, 0.52, 0.76], seam: false });
celMat(CM.ERASER, { ramp: ['#2a1014', '#5a2630', '#8c4250', '#b86272', '#d88a96'], th: [0.12, 0.3, 0.52, 0.76], line: 0, gap: 1, seam: false });
celMat(CM.FERRULE, { ramp: ['#141412', '#34342e', '#5c5a50', '#888478', '#b2ae9e', '#dedad0'], th: [0.12, 0.28, 0.48, 0.7, 0.92], line: 0, gap: 1, seam: false });

const hex = (h) => { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
/**
 * Per-grade LUT fixes. Under the tube her skin, lashes and brows keep their PORTRAIT colours (the cool grade
 * would turn her khaki and older than the girl in the dialogue box): the flicker dip is one step down. Under
 * the fire her hair keeps its copper in the dark tones (no black beret), and the denim stays a cool
 * maroon-violet a step darker than the desk, so her arms never melt into the laminate.
 */
export function tessLUTPatch(lut, name) {
  if (!name.startsWith('red')) {
    if (name !== 'fluor' && name !== 'dim') return lut;
    const sh = name === 'dim' ? 1 : 0;
    // the tube: at most a breath cooler than the portrait; the dip: a step down, a touch greyer
    const cool = (c) => mixh(c, '#d8e0e4', name === 'dim' ? 0.1 : 0.04);
    const row = (ramp) => Uint32Array.from(ramp.map((_, k) => hex(cool(ramp[Math.max(0, k - sh)]))));
    lut[CM.SKIN] = row(TESS_SKIN);
    lut[CM.CHEEK] = row(TESS_SKIN.map((c, i) => (i < 2 ? c : mixh(c, '#f0a09a', 0.2))));
    lut[CM.FRECKLE] = row(TESS_SKIN.map((_, k) => TESS_SKIN[Math.max(0, k - 2)]));
    lut[CM.LASH] = row(LASH);
    lut[CM.BROW] = row(HAIR);
    return lut;
  }
  const dim = name === 'redDim';
  const hair = (dim ? ['#240603', '#441006', '#6c1e0a', '#8e3010', '#b4461a', '#dc6a2a'] : ['#2c0703', '#521407', '#7e260c', '#a43a14', '#cc561e', '#f88638']).map(hex);
  for (const m of [CM.HAIR, CM.HAIR_D]) if (lut[m]) lut[m] = Uint32Array.from(hair);
  const den = (dim ? ['#060306', '#0e060e', '#160a16', '#200e1e', '#2c1428', '#381a32'] : ['#080408', '#120812', '#1c0c1a', '#2a1224', '#3a182e', '#4c2038']).map(hex);
  lut[CM.DENIM] = Uint32Array.from(den);
  lut[CM.DENIM_D] = Uint32Array.from(den.map((_, k) => den[Math.max(0, k - 1)]));
  return lut;
}

// ------------------------------------------------------------------------------------------ geometry helpers
/** Catmull-Rom through control points → dense polyline. */
function cr(P, seg = 8) {
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
/** Nearest-point queries on a polyline: { d, t (0..1 by length), side (+1 = right of travel), dir }. */
function polyline(pts) {
  const n = pts.length - 1, cum = [0];
  for (let k = 0; k < n; k++) cum.push(cum[k] + Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
  const total = cum[n] || 1;
  return {
    pts, total,
    near(x, y) {
      let best = 1e18, bt = 0, bs = 1, bd = [1, 0];
      for (let k = 0; k < n; k++) {
        const [ax, ay] = pts[k], dx = pts[k + 1][0] - ax, dy = pts[k + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
        let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax - dx * t, ey = y - ay - dy * t, d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; const L = Math.sqrt(L2); bt = (cum[k] + t * L) / total; bs = dx * ey - dy * ex >= 0 ? 1 : -1; bd = [dx / L, dy / L]; }
      }
      return { d: Math.sqrt(best), t: bt, side: bs, dir: bd };
    },
    at(t) {
      const s = clamp(t) * total;
      let k = 0; while (k < n - 1 && cum[k + 1] < s) k++;
      const L = cum[k + 1] - cum[k] || 1, u = (s - cum[k]) / L;
      const dx = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1];
      return { p: [pts[k][0] + dx * u, pts[k][1] + dy * u], dir: [dx / L, dy / L] };
    },
  };
}
/** y of a polyline given as x-sorted points, at x (clamped at the ends). */
function yAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 0; k + 1 < pts.length; k++) if (x <= pts[k + 1][0]) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; return ay + (by - ay) * (x - ax) / (bx - ax || 1); }
  return pts[pts.length - 1][1];
}
const bboxOf = (pts, pad = 0) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [Math.max(0, Math.floor(x0 - pad)), Math.max(0, Math.floor(y0 - pad)), Math.min(W - 1, Math.ceil(x1 + pad)), Math.min(H - 1, Math.ceil(y1 + pad))];
};
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/** A height surface: zf(x, y) → z | null at pixel centres; normals from the z field (a drop at the silhouette). */
function surf(cel, box, zf, o) {
  const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1, zb = new Float32Array(w * h).fill(-1e9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const z = zf(x0 + x + 0.5, y0 + y + 0.5); if (z != null) zb[y * w + x] = z; }
  const drop = o.drop ?? 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = zb[i]; if (z < -1e8) continue;
    const g = (j, ok) => (ok && zb[j] > -1e8 ? zb[j] : z - drop);
    const gx = (g(i + 1, x < w - 1) - g(i - 1, x > 0)) * 0.5, gy = (g(i + w, y < h - 1) - g(i - w, y > 0)) * 0.5;
    const mat = o.matFn ? o.matFn(x0 + x, y0 + y) : o.mat;
    cel.put(x0 + x, y0 + y, mat, { z, n: [-gx, -gy, 1], sid: o.sid, fix: -1, off: 0, mode: o.mode || 'any', flag: o.flag });
  }
}

// ------------------------------------------------------------------------------------------ denim
/**
 * A sleeve as a few broad planes: across its width q (−1 the edge toward the top of the frame, +1 the far
 * one) the surface turns in facets — a lit upper edge, the broad top, the turn, the underside. The facet
 * edges jog along the sleeve (fabric, not a pipe). Planes meet by value only: no line between them.
 * o: { sid, mat, z(x, y, q), poly, top, bot, jog, facets, clip }
 */
function sleeve(cel, o) {
  const box = bboxOf(o.poly, 1);
  const facet = o.facets || [[-0.6, -0.9], [0.3, -0.2], [0.72, 0.4], [9, 1.1]];
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const fx = x + 0.5, fy = y + 0.5;
    if (!inPoly(o.poly, fx, fy) || (o.clip && !o.clip(x, y))) continue;
    let q, n;
    if (o.across) {
      // a sleeve running down the frame: planes across x (−1 its left edge, toward the light)
      const l = o.across.left(fy), r = o.across.right(fy);
      q = clamp(2 * (fx - l) / Math.max(1, r - l) - 1, -1, 1);
    } else {
      const t0 = yAt(o.top, fx), t1 = yAt(o.bot, fx);
      q = clamp(2 * (fy - t0) / Math.max(1, t1 - t0) - 1, -1, 1);
    }
    if (o.jog) q += o.jog(fx);
    let tilt = facet[facet.length - 1][1];
    for (const [lim, tl] of facet) if (q < lim) { tilt = tl; break; }
    if (o.across) n = norm3([tilt, -0.25, 1]);
    else {
      const slope = (yAt(o.top, fx + 2) + yAt(o.bot, fx + 2) - yAt(o.top, fx - 2) - yAt(o.bot, fx - 2)) / 8;   // the sleeve's own slant
      n = norm3([-slope * tilt + (o.lean || 0), tilt, 1]);
    }
    cel.put(x, y, o.mat || CM.DENIM, { z: o.z(fx, fy, q), n, sid: o.sid, fix: -1, off: 0, mode: 'any' });
  }
}
/** A 1-px line on given sids (a real seam): d = tone shift (or fix). */
function line(cel, pts, sids, d, o = {}) {
  cel.stroke(pts, (x, y, t) => {
    if (o.t && (t < o.t[0] || t > o.t[1])) return;
    const i = cel.idx(x, y); if (i < 0 || !sids.includes(cel.sid[i])) return;
    if (o.mat && !o.mat.includes(cel.mat[i])) return;
    if (o.fix != null) cel.fix[i] = o.fix; else cel.off[i] = clamp(cel.off[i] + d, -4, 3);
    if (o.setMat) cel.mat[i] = o.setMat;
  });
}
/**
 * A fold in the denim, by VALUE only (no line): along the path a 1-px lit lip on the light side (above, for a
 * path drawn left → right) and a shade wedge on the other, `w` px at its widest, tapering to both ends.
 */
function fold(cel, ctl, sids, o = {}) {
  const pts = cr(ctl, 6), pl = polyline(pts), w = o.w ?? 2.5, box = bboxOf(pts, w + 2);
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = cel.idx(x, y); if (i < 0 || !sids.includes(cel.sid[i]) || cel.fix[i] >= 0) continue;
    if (cel.mat[i] !== CM.DENIM && cel.mat[i] !== CM.DENIM_D) continue;
    const r = pl.near(x + 0.5, y + 0.5);
    const taper = Math.sin(Math.PI * clamp(r.t)) ** 0.7;
    if (r.side < 0) { if (o.lip !== false && r.d < 0.9 * taper + 0.15 && taper > 0.35) cel.off[i] = Math.max(cel.off[i], 1); }
    else if (r.d < w * taper) cel.off[i] = Math.min(cel.off[i], -(o.dark ?? 1));
  }
}
/** Copper topstitching: every third pixel along a path. */
function stitches(cel, pts, sids, every = 3) {
  let n = 0;
  cel.stroke(pts, (x, y) => { const i = cel.idx(x, y); if (i < 0 || !sids.includes(cel.sid[i]) || (cel.mat[i] !== CM.DENIM && cel.mat[i] !== CM.DENIM_D)) return; if (n++ % every === 0) { cel.mat[i] = CM.STITCH; cel.off[i] = 0; } });
}

// the forearm she lies on: right (her elbow, off frame) → left (its cuff, the wrist turned up by her face).
// Its top edge undulates under the face (a fold pushed up under the eye at x≈350) and rises round the left
// of the face to y≈140.
const ARM_TOP = [[290, 158], [296, 157.5], [301, 156.5], [305, 154.5], [309, 150.5], [312, 146], [315, 142.2], [318, 140.4], [321, 140.6], [324, 142.4], [327, 145.4],
  [330, 148.6], [334, 151], [338, 152.4], [342, 152.8], [346, 151.8], [349, 150.6], [352, 151], [355, 152.6], [359, 153.8], [364, 153.2], [369, 154.2],
  [375, 155.6], [382, 156], [390, 155.6], [400, 157], [412, 159], [436, 161], [466, 162], [490, 162]];
const ARM_BOT = [[292, 180], [297, 185], [306, 187.5], [322, 188.5], [350, 188.5], [390, 189], [440, 191], [490, 192]];
const CUFF_X = [294, 305];    // the cuff band (left: its opening, right: where it is set on)
const ARM_SID = 104, CUFF_SID = 102, BACK_SID = 100, ELBOW_SID = 103, LOW_SID = 105;
// the bunched fabric under and beside her face stands up toward it
const bunch = (x) => 18 * Math.exp(-(((x - 335) / 26) ** 2));

function buildArms(cel) {
  // her back and shoulders, under the arms (bottom right; the dialogue box covers it in Ch2) — in their shadow
  const back = [[318, 214], [400, 212], [486, 211], [486, 274], [344, 274]];
  sleeve(cel, { poly: back, top: [[310, 212], [490, 210]], bot: [[310, 274], [490, 274]], sid: BACK_SID, mat: CM.DENIM_D, z: (x, y, q) => 30 + 16 * (1 - Math.abs(q)),
    facets: [[-0.5, -0.3], [0.4, 0.1], [9, 0.5]] });
  // the other forearm, under this one: its elbow at the left (a round point under her cuff), its hand off
  // frame right under her other elbow
  const LOW_TOP = [[266, 194], [280, 188], [300, 186], [400, 187], [490, 188]], LOW_BOT = [[266, 210], [280, 213], [300, 215], [400, 215], [490, 214]];
  const low = [[271, 203], [272, 197], [276, 192], [283, 188], [296, 186], [490, 187], [490, 214], [400, 215], [310, 215], [292, 215], [281, 212], [274, 208]];
  sleeve(cel, { poly: low, top: LOW_TOP, bot: LOW_BOT, sid: LOW_SID, mat: CM.DENIM_D, z: (x, y, q) => 12 + 8 * Math.sqrt(Math.max(0, 1 - q * q)),
    facets: [[-0.3, -0.75], [0.45, -0.12], [9, 0.6]] });
  // from its elbow the upper arm goes down to her shoulder, out of frame (planes across its width)
  const upper = [[276, 207], [288, 214], [306, 216], [322, 222], [340, 274], [298, 274], [282, 236]];
  sleeve(cel, { poly: upper, top: [[270, 205], [340, 205]], bot: [[270, 274], [340, 274]], sid: ELBOW_SID, mat: CM.DENIM_D, z: (x, y) => 16 + 6 * clamp((y - 205) / 40),
    across: { left: (y) => 278 + (y - 207) * 0.33, right: (y) => 318 + (y - 216) * 0.38 }, facets: [[-0.5, -0.8], [0.35, -0.1], [9, 0.7]] });
  // the elbow: folds converging on its point; the crook between forearm and upper arm in deep shade
  fold(cel, [[275, 199], [283, 196], [293, 197]], [LOW_SID], { w: 1.8 });
  fold(cel, [[277, 207], [286, 205], [296, 207]], [LOW_SID], { w: 1.8 });
  for (let y = 205; y < 240; y++) for (let x = 284; x < 340; x++) {
    const i = cel.idx(x, y); if (i < 0) continue;
    const e = 318 + (y - 216) * 0.38;                         // the upper arm's inner edge, against the forearm and her back
    if (cel.sid[i] === ELBOW_SID && x > e - 3) cel.off[i] = Math.min(cel.off[i], -1);
    if ((cel.sid[i] === LOW_SID && y > 209 && x > 296) || (cel.sid[i] === BACK_SID && x < e + 6)) cel.off[i] = Math.min(cel.off[i], y < 214 ? -1 : -2);
  }
  line(cel, cr([[280, 216], [290, 230], [298, 250], [304, 272]], 6), [ELBOW_SID], -1);                    // the outer seam down the upper arm
  stitches(cel, cr([[282, 216], [292, 230], [300, 250], [306, 272]], 6), [ELBOW_SID]);
  // her back: in the shadow of her head and arms
  for (let y = 205; y < H; y++) for (let x = 300; x < W; x++) { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === BACK_SID) cel.off[i] = Math.min(cel.off[i], -1); }
  // the lower arm, the upper arm and her back take no cast shadows (the hanging locks would bite teeth into
  // them): the band under the top forearm is painted instead, one step down, dithered at its lower edge
  for (let y = 180; y < H; y++) for (let x = 260; x < W; x++) {
    const i = cel.idx(x, y); if (i < 0 || (cel.sid[i] !== LOW_SID && cel.sid[i] !== ELBOW_SID && cel.sid[i] !== BACK_SID)) continue;
    cel.flag[i] |= 2;
    if (cel.sid[i] !== LOW_SID) continue;
    const d = y - yAt(ARM_BOT, x + 0.5);
    if (d < 4 || (d < 6 && ((x + y) & 1))) cel.off[i] = Math.min(cel.off[i], -1);
  }
  // the forearm under her face (on top of everything but her head)
  const arm = [...ARM_TOP.filter(([x]) => x >= CUFF_X[1] - 1), ...ARM_BOT.slice().reverse().filter(([x]) => x >= CUFF_X[1] - 1)];
  sleeve(cel, { poly: arm, top: ARM_TOP, bot: ARM_BOT, sid: ARM_SID, z: (x, y, q) => 24 + 9 * Math.sqrt(Math.max(0, 1 - q * q)) + bunch(x) * clamp(0.9 - q * 0.7),
    facets: [[-0.62, -0.9], [0.25, -0.2], [0.7, 0.35], [9, 1.1]], jog: (x) => Math.sin(x * 0.09) * 0.08 + Math.sin(x * 0.031 + 1) * 0.1 });
  // the cuff: a turned band, a hair proud of the sleeve, set on with a seam; her hand is lost inside it
  const cuff = [[CUFF_X[0] - 1, 162], [CUFF_X[0] + 2, 158], [CUFF_X[1], 156], [CUFF_X[1] + 1, 187], [CUFF_X[0] + 4, 186], [CUFF_X[0] - 1, 181], [CUFF_X[0] - 2, 172]];
  sleeve(cel, { poly: cuff, top: [[290, 160], [306, 156]], bot: [[290, 182], [306, 187]], sid: CUFF_SID, z: (x, y, q) => 30 + 8 * Math.sqrt(Math.max(0, 1 - q * q)),
    facets: [[-0.55, -0.9], [0.3, -0.25], [0.72, 0.35], [9, 1.0]] });
  line(cel, cr([[CUFF_X[1], 156], [CUFF_X[1] + 1, 170], [CUFF_X[1] + 1, 187]], 4), [CUFF_SID, ARM_SID], -2);   // where the cuff is set on (a real seam)
  stitches(cel, cr([[CUFF_X[1] - 2, 158], [CUFF_X[1] - 1, 170], [CUFF_X[1] - 1, 185]], 4), [CUFF_SID], 3);
  // the opening: the dark inside of the sleeve along its left edge — nothing of her hand shows
  for (let y = 150; y < 192; y++) for (let x = CUFF_X[0] - 3; x < CUFF_X[0] + 6; x++) {
    const i = cel.idx(x, y); if (i < 0 || cel.sid[i] !== CUFF_SID) continue;
    const l = cel.idx(x - 1, y), l2 = cel.idx(x - 2, y);
    if (l >= 0 && cel.sid[l] !== CUFF_SID) { cel.fix[i] = y > 164 && y < 182 ? 0 : 1; }
    else if (l2 >= 0 && cel.sid[l2] !== CUFF_SID && y > 165 && y < 180) cel.fix[i] = 1;
  }
  // button on the cuff
  for (const [dx, dy, k] of [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 1], [-1, 0, 2], [0, -1, 4], [-1, 1, 1], [1, -1, 2]]) {
    const i = cel.idx(CUFF_X[0] + 6 + dx, 166 + dy); if (i >= 0 && cel.sid[i] === CUFF_SID) { cel.mat[i] = CM.TBTN; cel.fix[i] = k; }
  }
  // the outer seam along the forearm (flat-felled: a seam line and its stitching)
  line(cel, cr([[306, 181], [340, 183], [400, 184], [470, 186]], 6), [ARM_SID], -1);
  stitches(cel, cr([[306, 183], [340, 185], [400, 186], [470, 188]], 6), [ARM_SID]);
  // folds by value: the sleeve pushed up against her cheek in a ridge, two folds running off it down-left;
  // the slack at the wrist; a few drag folds along the forearm (none parallel, none evenly spaced)
  fold(cel, [[309, 158], [316, 150], [323, 145]], [ARM_SID], { w: 2.6, dark: 1 });
  fold(cel, [[314, 170], [322, 160], [331, 154]], [ARM_SID], { w: 2.2 });
  fold(cel, [[344, 158], [352, 156], [360, 160], [364, 166]], [ARM_SID], { w: 2 });
  fold(cel, [[378, 160], [388, 165], [392, 174]], [ARM_SID], { w: 2 });
  fold(cel, [[418, 164], [428, 168], [432, 177]], [ARM_SID], { w: 2.2 });
  fold(cel, [[452, 167], [462, 171], [465, 180]], [ARM_SID], { w: 1.8 });
  // wear: the lit tops of the folds go one lighter in a few places (light-wash)
  for (let y = 136; y < 200; y++) for (let x = 296; x < W; x++) {
    const i = cel.idx(x, y); if (i < 0 || cel.sid[i] !== ARM_SID || cel.mat[i] !== CM.DENIM) continue;
    if (cel.ny[i] < -0.3 && vn(x * 0.4, y * 1.5, 6, 41) > 0.7) cel.off[i] = Math.max(cel.off[i], 1);
  }
}

/** Her pencil, dropped: lying loose on the desk by the cuff, rolled a few px toward his fingers. */
function buildPencil(cel) {
  const a = [256, 184], b = [285, 178], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
  const n = [-d[1], d[0]];
  for (let s = -6; s <= L + 5; s += 0.4) for (let k = -2.2; k <= 2.2; k += 0.4) {
    const x = Math.round(a[0] + d[0] * s + n[0] * k), y = Math.round(a[1] + d[1] * s + n[1] * k);
    let m = CM.PENCIL, rr = 2.0;
    if (s < 0) { m = CM.GRAPHITE; rr = 2.0 * (1 + s / 6); }
    else if (s < 6) { m = CM.PWOOD; rr = 2.0 * Math.min(1, 0.3 + s / 6); }
    else if (s > L - 3 && s <= L) m = CM.FERRULE;
    else if (s > L) m = CM.ERASER;
    if (Math.abs(k) > rr) continue;
    const q = k / 2.0, facet = q < -0.33 ? -0.75 : q > 0.33 ? 0.75 : 0;
    cel.put(x, y, m, { z: 3 + Math.sqrt(Math.max(0, 1 - q * q)) * 2, n: [n[0] * facet, n[1] * facet, 1], sid: 130, fix: -1, off: 0, mode: 'z' });
  }
}

// ------------------------------------------------------------------------------------------ face
export const FACE = {
  // 3/4 view, turned toward the hand: the left contour is the far brow and the far eye's socket, the bridge
  // of the nose going down-left under the sleeve's rise; the face runs on under the sleeve to the temple
  poly: [[352, 104], [342, 107], [335, 113], [331, 121], [330, 128], [329.2, 133], [328.6, 136], [329.4, 139], [330.6, 142], [329.8, 145], [327.8, 148], [325.5, 152], [323, 160],
    [327, 168], [337, 176], [353, 180], [366, 175], [371, 164], [372, 150], [372, 132], [370, 116], [366, 107], [360, 103]],
  eye: [351, 144], farEye: [332, 144], brow: [350, 137], nose: [326, 156],
};
const FACE_SID = 120;
const BRIDGE = [[341, 139], [327, 157]];
const bridgeX = (y) => BRIDGE[0][0] + (y - BRIDGE[0][1]) * (BRIDGE[1][0] - BRIDGE[0][0]) / (BRIDGE[1][1] - BRIDGE[0][1]);
function buildFace(cel) {
  const P = FACE.poly;
  surf(cel, bboxOf(P, 1), (x, y) => {
    if (!inPoly(P, x, y)) return null;
    let z = 44 + 10 * Math.sqrt(Math.min(polyDist(P, x, y), 14) / 14);
    z += 3.5 * Math.exp(-(((x - bridgeX(y)) / 2.6) ** 2)) * clamp((y - 138) / 6);   // the nose
    return z;
  }, { mat: CM.SKIN, sid: FACE_SID, flag: 1 | 2 });
}

/**
 * Paint the face (after the hair and the sleeve have taken their share of it): the portrait's tones laid as
 * shapes — lit skin, the sockets and the near side of the bridge one step down, the temple turning away under
 * the hair, the hair's own shadow, the cheek squashed up against the sleeve with a 1-px contact shadow — and
 * the features, all 1 px.
 */
function paintFace(cel) {
  const isSkinI = (i) => i >= 0 && cel.sid[i] === FACE_SID && (cel.mat[i] === CM.SKIN || cel.mat[i] === CM.CHEEK || cel.mat[i] === CM.FRECKLE);
  const isHair = (i) => i >= 0 && (cel.mat[i] === CM.HAIR || cel.mat[i] === CM.HAIR_D);
  const isDen = (i) => i >= 0 && (cel.mat[i] === CM.DENIM || cel.mat[i] === CM.DENIM_D || cel.mat[i] === CM.STITCH);
  const isDesk = (i) => i >= 0 && (cel.mat[i] === CM.DESK || cel.mat[i] === CM.DESK_G);
  const [ex, ey] = FACE.eye, [fx, fy] = FACE.farEye;
  // 1. the tones as shapes (the portrait's way): lit skin; the near socket, its inner corner by the bridge, the
  // far socket and the near side of the bridge a step down; the temple turning away under the hair a step,
  // then two. A shape's rim is a 2-level checker, nothing wider.
  const box = bboxOf(FACE.poly, 1);
  const ell = (px, py, cx, cy, rx, ry) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
  const chk = (x, y) => ((x + y) & 1) === 0;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = cel.idx(x, y); if (!isSkinI(i)) continue;
    const px = x + 0.5, py = y + 0.5;
    let k = 4;
    const down = (e, kk = 3) => { if (e < 0.85 || (e < 1.2 && chk(x, y))) k = Math.min(k, kk); };
    down(ell(px, py, ex - 1.2, ey - 1.6, 5.6, 2.5));                 // the near socket, lids squeezed into it
    down(ell(px, py, ex - 6.2, ey - 0.6, 1.8, 2.2), 3);               // its inner corner, by the bridge
    down(ell(px, py, fx + 0.3, fy - 1.2, 2.6, 2.0));                  // the far socket
    const db = px - bridgeX(py);
    if (py > 140 && py < 152 && db > 1 && db < 3.6) k = Math.min(k, db < 3 || chk(x, y) ? 3 : 4);   // the near side of the bridge
    if (px > 362.5) k = Math.min(k, 3); else if (px > 360.5 && chk(x, y)) k = Math.min(k, 3);        // the temple
    if (px > 368.5) k = Math.min(k, 2); else if (px > 366.5 && chk(x, y)) k = Math.min(k, 2);
    cel.mat[i] = CM.SKIN; cel.fix[i] = k;
  }
  const T = (x, y, k, mode = 'set') => { const i = cel.idx(x, y); if (!isSkinI(i)) return; cel.fix[i] = mode === 'min' ? Math.min(cel.fix[i], k) : mode === 'max' ? Math.max(cel.fix[i], k) : k; };
  const P = (x, y, m, k) => { const i = cel.idx(x, y); if (!isSkinI(i)) return; cel.mat[i] = m; cel.fix[i] = k; };
  // 2. the hair's shadow on the skin (light from the top left): the row under a lock one step down, dithered
  // at the second; where the face meets the dark desk, a soft turn (one step, never a line)
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = cel.idx(x, y); if (!isSkinI(i)) continue;
    const up = cel.idx(x, y - 1), up2 = cel.idx(x, y - 2), lf = cel.idx(x - 1, y), ul = cel.idx(x - 1, y - 1);
    if (isHair(up) || isHair(lf) || isHair(ul)) cel.fix[i] = Math.max(2, cel.fix[i] - 1);
    else if (isHair(up2) && ((x + y) & 1)) cel.fix[i] = Math.max(2, cel.fix[i] - 1);
    if (isDesk(lf) || isDesk(up)) cel.fix[i] = Math.min(cel.fix[i], 3);
  }
  // 3. where the cheek sinks into the sleeve: the skin squashed up, a 1-px contact shadow along the fabric
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = cel.idx(x, y); if (!isSkinI(i)) continue;
    if (isDen(cel.idx(x, y + 1))) cel.fix[i] = 1;
    else if (isDen(cel.idx(x + 1, y)) || isDen(cel.idx(x - 1, y))) cel.fix[i] = Math.min(cel.fix[i], 2);
  }
  // 4. the eyes, squeezed shut: each one 1-px lash arc (#4a160e) with a flick at its outer corner; the squeeze
  // shows only as one short crease beyond the near eye's outer corner
  const nearLash = [[-4, -1], [-3, 0], [-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0], [3, 0]];
  for (const [dx, dy] of nearLash) P(ex + dx, ey + dy, CM.LASH, 2);
  P(ex + 4, ey + 1, CM.LASH, 3);                                       // the flick, lashes swept down and out
  T(ex - 4, ey - 2, 3, 'min');                                         // the lid's crease above the inner end
  for (const [dx, dy] of [[6, -1], [7, -2]]) T(ex + dx, ey + dy, 3, 'min');   // the squeeze at the outer corner
  for (const [dx, dy] of [[-2, -1], [-1, -1], [0, -1], [1, -1]]) T(ex + dx, ey + dy, 4, 'max');   // the lid, pulled tight and lit
  for (const [dx, dy] of [[0, 2], [1, 2], [2, 2]]) T(ex + dx, ey + dy, 5, 'max');                  // the cheek bulging up under it
  const farLash = [[-2, 1], [-1, 0], [0, 0], [1, 1], [2, 1]];
  for (const [dx, dy] of farLash) P(fx + dx, fy + dy, CM.LASH, 2);
  P(fx - 3, fy + 2, CM.LASH, 3);                                       // its flick, at the contour
  // 5. the brows: 1-px, hair-dark, their inner ends lifted (fear pulls them up and together, never down)
  const [bx, by] = FACE.brow;
  for (const [dx, dy, k] of [[-5, -2, 3], [-4, -1, 2], [-3, -1, 2], [-2, 0, 2], [-1, 0, 2], [0, 0, 2], [1, 0, 2], [2, 0, 2], [3, 1, 2], [4, 1, 2], [5, 1, 3]]) P(bx + dx, by + dy, CM.BROW, k);
  for (const [dx, dy, k] of [[2, -1, 3], [1, -1, 2], [0, 0, 2], [-1, 0, 2], [-2, 0, 2], [-3, 1, 3]]) P(fx + dx, fy - 7 + dy, CM.BROW, k);
  // 6. the bridge: one short highlight down its lit edge; the tip is behind the sleeve
  for (const y of [146, 147, 148]) T(Math.round(bridgeX(y + 0.5) - 0.5), y, 5);
  // 7. freckles: 1-px dots two steps darker (#bf7e65 on #ecc8ab), a few over the bridge and across the
  // visible cheek — placed, never touching, never on a feature
  const isDen2 = (x, y) => isDen(cel.idx(x, y));
  for (const [dx, dy] of [[-12, -3], [-10, 0], [-13, 1], [6, 2], [9, 1], [12, 3], [3, 3], [-7, 3], [8, -1]]) {
    const x = ex + dx, y = ey + dy, i = cel.idx(x, y);
    if (!isSkinI(i) || cel.mat[i] !== CM.SKIN || cel.fix[i] < 4) continue;
    if (isDen2(x, y + 1) || isDen2(x, y + 2)) continue;
    let ok = true;
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = cel.idx(x + ax, y + ay); if (!isSkinI(j) || cel.mat[j] !== CM.SKIN) ok = false; }
    if (ok) cel.mat[i] = CM.FRECKLE;
  }
}

// ------------------------------------------------------------------------------------------ hair
const SKULL = { cx: 392, cy: 133, rx: 60, ry: 53 };
// the crown's silhouette (one smooth arc) and its few notches
const CROWN = cr([[331, 118], [334, 106], [343, 95], [357, 87], [375, 81], [396, 79], [415, 83], [431, 92], [443, 105], [450, 122], [452, 140], [450, 158], [446, 170]], 8);
const NOTCHES = [[367, 84], [424, 88], [447, 113]];
// the fringe over her forehead (the hair mass covers the skin above it): side-swept, pointed tips hanging
// to the brows on the left, higher toward the parting
const FRINGE = [[324, 121], [332, 122.5], [340, 123], [348, 122.5], [356, 121], [364, 119], [372, 117], [400, 116]];
function domeN(x, y) {
  const u = (x - SKULL.cx) / SKULL.rx, v = (y - SKULL.cy) / SKULL.ry, q = Math.max(0, 1 - u * u - v * v);
  return [u * 0.95, v * 0.95, Math.sqrt(q) + 0.18];
}
const domeZ = (x, y) => { const u = (x - SKULL.cx) / SKULL.rx, v = (y - SKULL.cy) / SKULL.ry; return 50 + 18 * Math.sqrt(Math.max(0, 1 - u * u - v * v)); };

/**
 * One lock: a ribbon along a Catmull-Rom spine, widths w0 → wm → w1 (px), rolled across its width, lying on
 * `base` (the skull, the sleeve or the desk). Strand lines (1 px, one step darker) at the given fractions.
 */
function lock(cel, ctl, o, reg) {
  const pts = cr(ctl, 8), pl = polyline(pts);
  const wAt = (t) => (t < 0.5 ? lerp(o.w0, o.wm, t * 2) : lerp(o.wm, o.w1, ((t - 0.5) * 2) ** (o.tipP ?? 1)));
  const box = bboxOf(pts, Math.max(o.w0, o.wm, o.w1) / 2 + 2);
  const sid = o.sid, roll = o.roll ?? 0.75;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const fx = x + 0.5, fy = y + 0.5, rr = pl.near(fx, fy), hw = wAt(rr.t) / 2;
    if (rr.d > hw || hw < 0.45) continue;
    if (o.clip && !o.clip(x, y, rr.t)) continue;
    const q = rr.side * rr.d / Math.max(0.5, hw), perp = [-rr.dir[1], rr.dir[0]];
    const b = o.base(fx, fy, cel.idx(x, y));
    const n = [b.n[0] + perp[0] * q * roll, b.n[1] + perp[1] * q * roll, b.n[2]];
    const z = b.z + (o.depth ?? 2.4) * Math.sqrt(Math.max(0, 1 - q * q));
    const flag = (o.flag || 0) | (hw < 1.7 ? 1 : 0);    // no outline round the thin tips (they'd turn to dark wire)
    if (cel.put(x, y, CM.HAIR, { z, n, sid, fix: -1, off: 0, mode: o.mode || 'any', flag })) { const i = cel.idx(x, y); reg.along[i] = rr.t; reg.q[i] = q; }
  }
  // strand lines, following the lock
  for (const [qs, t0, t1] of o.strands || []) {
    const sp = [];
    for (let k = 0; k <= 40; k++) { const t = t0 + (t1 - t0) * k / 40, a = pl.at(t), hw = wAt(t) / 2; sp.push([a.p[0] - a.dir[1] * qs * hw, a.p[1] + a.dir[0] * qs * hw]); }
    line(cel, sp, [sid], -1, { mat: [CM.HAIR] });
  }
  // the tip: its last pixels one step darker (clumped ends)
  if (o.tipDark) for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const i = cel.idx(x, y); if (i >= 0 && cel.sid[i] === sid && reg.along[i] > 0.9 && reg.along[i] < 0.97) cel.off[i] = Math.min(cel.off[i], -1); }
}

function* buildHairGen(cel) {
  const reg = { along: new Float32Array(W * H), q: new Float32Array(W * H) };
  // what's under a lock that leaves the skull: the sleeve or the face (lying on it), else the desk
  const under = (x, y, i) => {
    const zz = i >= 0 ? cel.z[i] : 0;
    const dz = domeZ(x, y), inside = ((x - SKULL.cx) / SKULL.rx) ** 2 + ((y - SKULL.cy) / SKULL.ry) ** 2 < 1;
    if (inside && dz > zz) return { z: dz, n: domeN(x, y) };
    return { z: Math.max(zz, 0) + 1.5, n: [0, -0.12, 1] };
  };
  // 1. the mass: inside the crown's arc and the skull, everything the face doesn't own — the dark between locks
  const crownPoly = [...CROWN, [440, 182], [400, 186], [360, 176], [330, 140]];
  const nb = bboxOf(crownPoly, 1);
  for (let y = nb[1]; y <= nb[3]; y++) for (let x = nb[0]; x <= nb[2]; x++) {
    const fx = x + 0.5, fy = y + 0.5; if (!inPoly(crownPoly, fx, fy)) continue;
    const i = cel.idx(x, y); if (i < 0) continue;
    if (cel.sid[i] === FACE_SID && fy > yAt(FRINGE, fx)) continue;            // the face shows under the fringe
    if (NOTCHES.some(([nx, ny]) => Math.hypot(fx - nx, fy - ny) < 1.9 && polyDist(crownPoly, fx, fy) < 2.2)) continue;
    if ((cel.sid[i] === ARM_SID || cel.sid[i] === CUFF_SID) && fy > yAt(ARM_TOP, fx) - 1) continue;
    cel.put(x, y, CM.HAIR_D, { z: Math.max(domeZ(fx, fy), cel.z[i] + 1) + 1, n: domeN(fx, fy), sid: 199, fix: -1, off: 0, mode: 'any' });
  }
  const clipCrown = (x, y) => inPoly(crownPoly, x + 0.5, y + 0.5) && !NOTCHES.some(([nx, ny]) => Math.hypot(x + 0.5 - nx, y + 0.5 - ny) < 1.9);
  yield;
  // 2. the locks, all from her side parting (≈ 372,90): back over the crown, behind the ear and down onto the
  // sleeve and her shoulder in long straight locks; forward over the temple and the back of the cheek; and a
  // side-swept sheet of bangs over the forehead. Later ones lie on top.
  const L = (ctl, o) => lock(cel, ctl, { base: under, ...o }, reg);
  const crownOr = (t0) => (x, y, t) => t > t0 || clipCrown(x, y);
  L([[388, 82], [414, 84], [436, 97], [451, 120], [458, 146], [466, 170], [476, 190], [486, 204]], { sid: 201, w0: 8, wm: 16, w1: 6, strands: [[-0.3, 0.1, 0.9], [0.35, 0.25, 0.9]], clip: crownOr(0.6) });
  L([[380, 90], [406, 94], [428, 108], [442, 132], [450, 158], [458, 180], [466, 198]], { sid: 202, w0: 8, wm: 15, w1: 3, strands: [[0, 0.15, 0.88]], clip: crownOr(0.66) });
  L([[376, 97], [398, 105], [416, 121], [428, 144], [434, 168], [440, 186], [446, 198]], { sid: 203, w0: 7, wm: 14, w1: 2.5, strands: [[-0.35, 0.2, 0.86], [0.3, 0.3, 0.8]], clip: crownOr(0.72) });
  L([[373, 103], [391, 115], [404, 134], [411, 156], [416, 176], [424, 192]], { sid: 204, w0: 6, wm: 13, w1: 2.5, strands: [[0.1, 0.2, 0.85]] });
  yield;
  // along the top of the crown, toward the forehead
  L([[394, 81], [372, 83], [354, 89], [341, 100], [334, 112], [331, 121]], { sid: 205, w0: 7, wm: 10, w1: 4, strands: [[0.2, 0.15, 0.8]], clip: clipCrown });
  // forward over the temple and the back of the cheek (hair over ~40% of it), ends on the sleeve
  L([[371, 104], [381, 121], [386, 142], [386, 160], [383, 174]], { sid: 206, w0: 6, wm: 14, w1: 3, strands: [[-0.25, 0.2, 0.85], [0.3, 0.3, 0.8]] });
  L([[366, 104], [369, 122], [366, 140], [362, 154], [360, 163]], { sid: 207, w0: 6, wm: 13, w1: 1.5, strands: [[0, 0.25, 0.8]] });
  yield;
  // the bangs: a side-swept sheet from the parting down-left over the forehead, a pointed edge above the brow
  const bang = { depth: 1.6, roll: 0.55, tipP: 1.8 };
  L([[360, 92], [347, 98], [337, 110], [332, 122], [331, 133.5]], { ...bang, sid: 210, w0: 6, wm: 9, w1: 1.1, strands: [[0.1, 0.25, 0.7]] });
  L([[368, 90], [355, 97], [345, 109], [340, 120], [338.5, 131.5]], { ...bang, sid: 209, w0: 7, wm: 10, w1: 1.2, strands: [[-0.2, 0.2, 0.75]] });
  L([[376, 97], [369, 109], [363, 120], [360.5, 130.5]], { ...bang, sid: 215, w0: 6, wm: 8, w1: 1.1 });
  L([[372, 92], [361, 101], [352, 112], [347, 123], [343.5, 134.5]], { ...bang, sid: 208, w0: 7, wm: 10, w1: 1.1, strands: [[0.25, 0.2, 0.8]] });
  L([[374, 95], [365, 106], [358, 118], [354, 128.5]], { ...bang, sid: 214, w0: 6, wm: 8, w1: 1.2 });
  // 3. ONE lock slipped off her forehead onto the desk: 5-6 px at the root, a slack S-curve lying flat on the
  // laminate to a 1-px end — stopping short of his middle fingertip (the gap is the point)
  const onDesk = (x, y, i) => ({ z: (i >= 0 && cel.sid[i] !== FACE_SID ? Math.max(0, cel.z[i]) : 0) + 1.6, n: [-0.25, -0.4, 1] });
  L([[336, 120], [330, 123], [326, 127], [324, 131], [321, 134], [316, 135.2], [312, 134.4], [309, 132.6]], { base: onDesk, roll: 0.3, depth: 0.6, flag: 1, sid: 211, w0: 6, wm: 3.8, w1: 0.9, tipP: 1.4, strands: [[0.15, 0.15, 0.6]] });
  return reg;
}

/** Tess, in painting order: the pencil, her face, the arms over its lower half, the hair; then the face's
 * paint (it needs to know where hair and sleeve lie) — as a generator (each step a few tens of ms). */
export function* buildTessGen(cel, r) {
  buildPencil(cel);
  buildFace(cel); yield;
  buildArms(cel); yield;
  const reg = yield* buildHairGen(cel); yield;
  paintFace(cel);
  return reg;
}
export function buildTess(cel, r) { const g = buildTessGen(cel, r); for (;;) { const st = g.next(); if (st.done) return st.value; } }
export { SKULL, ARM_TOP };
