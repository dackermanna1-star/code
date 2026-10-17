// Denise Webb (15, 1979) — the lure. Rounded 70s afro, Marcus's gentle eyes, warm smile; green & gold
// marching-band uniform (high gold-trimmed stand collar, gold braid across the chest, brass buttons).
// 'lure' glows warm and is a little too perfect; 'wrong' tilts too far with unfocused eyes and husk amber
// showing at the edges; 'peace' is the real girl, eyes closed.
import { PAL, mix } from './palette.js';
import { material, spline, PW, PH, bay, clamp, lerp, hexToRgb } from './portraits_core.js';
import { stdMats } from './portraits_human.js';
import { L, strand, hairVol, valueNoise, enrolledDarkSkin } from './portraits_parts.js';
import { darkPale } from './portraits_marcus.js';

const SKIN = ['#140806', '#2e1610', '#502c1e', mix(PAL.dskin_d, PAL.dskin, 0.7), mix(PAL.dskin, PAL.dskin_l, 0.85), mix(PAL.dskin_l, '#d49a64', 0.55)];
const HAIR = ['#050303', '#0d0807', '#18110c', '#261b13', '#3a2a1c', '#584030'];
const GREEN = ['#070e0a', '#0f1c14', '#182b1e', '#223c29', '#2e5036', '#46694a'];
const GOLD = ['#2a1e08', PAL.brass_d, mix(PAL.brass_d, PAL.brass, 0.6), PAL.brass, PAL.gold, PAL.gold_l];
const SKIN_TONE = [0.2, 0.36, 0.55, 1.06];

export const DENISE = {
  seed: 1964,
  shift: [0, 0],
  pivot: [47, 76],
  neckPose: 'body',
  defaultExpr: 'lure',
  exprBase: { eye: { gx: -0.42 } },
  face: {
    cx: 46, yaw: 0.28,
    rows: [[21, 13, 14, 0], [26, 17.8, 18.5, 0], [33, 20, 21, 0], [41, 20.8, 22, 0], [50, 20.6, 22, 0], [56, 20.2, 21, 0.6],
      [61.5, 18.8, 19.8, 1.8], [66, 16.4, 18.2, 3.4], [70, 13, 15.8, 5.2], [73.4, 9, 12.8, 7], [76, 5.4, 9.8, 8.2], [77.8, 2.2, 7, 8.6]],
  },
  materials(E, o) {
    let skin = darkPale(SKIN, (E.pale || 0) * 0.8);
    if (E.husk) skin = enrolledDarkSkin(skin, E.husk);
    return [
      material('skin', skin, { tone: SKIN_TONE, dither: 0.012, flat: E.flatSkin || 0 }),
      material('blush', skin.map((c, i) => mix(c, '#b04040', i === 0 ? 0 : 0.18)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#2a1a2a', 0.3)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('lip', ['#140606', '#2a0e10', '#44181c', '#5c2828', '#763832', '#904a40'], { tone: SKIN_TONE, dither: 0, line: false }),
      material('lash', ['#050303', '#0a0706', '#120c0a', '#1a120e', '#241a14', '#30221a'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#050303', '#0c0807', '#140e0b', '#1e1510', '#2a1d16', '#38281e'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', E.husk ? ['#2a1e10', '#4a3418', '#6e4e22', '#94702e', '#b48c40', '#d0aa5c'] : ['#080403', '#160b06', '#28160c', '#3e2414', '#583820', '#765034'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('hair', HAIR, { tone: [0.2, 0.42, 0.72, 0.98], dither: 0.01 }),
      material('uni', GREEN, { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.015 }),
      material('gold', GOLD, { tone: [0.16, 0.38, 0.66, 1.0], dither: 0, gloss: 0.35, glossAt: 0.97, glossW: 0.04 }),
      material('crack', ['#3e2a10', PAL.amber_d, PAL.amber, PAL.amber_l, PAL.amber_ll, '#fff0c8'], { dither: 0, line: false, inner: false }),
      ...stdMats({ sclera: ['#2e2422', '#5a4a46', '#8c807a', '#b8aea4', '#d4ccc0', '#ebe6dc'] }),
    ];
  },
  features() {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.43, y: 50, w: 10.6, hu: 3.6, hl: 2.4, ri: 3.4, rp: 1.4, irisW: 1, irisShiftN: -0.6, cIn: 0.4, cOut: 0.2, peak: -0.08, archPow: 2.3,
        lash: [1, 2, 2], flick: 0.9, flickRise: 1.6, crease: true, creaseGap: 1.3, lowerLine: 0.5, irisDy: -0.2,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'iris', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 43.2, uIn: 0.13, uPk: 0.5, uOut: 0.84, pkY: -1.2, outY: 0.8, w: [2.1, 1.9, 0.9], mat: 'brow', skinMat: 'skin', farW: 0.9 },
      nose: { y: 60.6, e: 4.0, tipW: 3.0, skinMat: 'skin', nearNostril: -1 },
      mouth: { y: 67.8, hw: 0.28, farK: 1, h: 4.8, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: null,
      neck: { x: 46.5, yTop: 62, yBot: 98, wTop: 6.4, wBot: 7.4, lean: 1.6, z: 1 },
      blush: { u: 0.5, y: 59.5, rx: 3.6, ry: 1.7, mat: 'blush' },
      underMat: 'bruise',
      detailOn: ['blush', 'bruise'],
    };
  },
  hairBack({ rig, sids, r }) {
    // the afro: a big rounded, cloud-bumpy mass with a curl texture in the height field
    const cx = 41.5, cy = 33, rx = 33, ry = 30;
    const pts = [];
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      const bump = 1 + 0.03 * Math.sin(a * 13 + 1.3) + 0.022 * Math.sin(a * 23 + 0.4) + 0.012 * Math.sin(a * 37);
      pts.push([cx + Math.cos(a) * rx * bump, cy + Math.sin(a) * ry * bump * (Math.sin(a) > 0 ? 0.95 : 1)]);
    }
    const vol = hairVol(cx + 3, cy + 8, 34, -12);
    const curl = (hx, hy) => 2.2 * valueNoise(hx, hy, 2.4, 5) + 1.1 * valueNoise(hx, hy, 1.2, 9);
    sids.hair.add(rig.poly(pts, {
      mat: 'hair', rim: 9, rimDepth: 9,
      z: (x, y) => { const [hx, hy] = rig.toH(x, y); return vol(hx, hy) + curl(hx, hy); },
    }));
  },
  bodyBack({ rig }) {
    rig.poly([[33, 86], [36, 78.5], [47, 77], [58, 78.5], [61, 86], [60, 92], [34, 92]], { mat: 'uni', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -1 });
  },
  bodyFront(ctx) { deniseBody(ctx); },
  hairFront({ rig, sids, face }) {
    // hairline: soft rounded edge across the forehead and temples
    const vol = hairVol(45, 40, 28, -1);
    rig.poly([[22, 44], [21, 30], [28, 18], [40, 12.5], [53, 13], [64, 19.5], [70, 30], [69.5, 41], [66.5, 37], [60, 33], [52, 31.6], [44, 32], [36, 33.6], [29, 37], [25.5, 45]],
      { mat: 'hair', smooth: true, seg: 4, rim: 3, rimDepth: 2, z: (x, y) => { const [hx, hy] = rig.toH(x, y); return vol(hx, hy) + 2.2 * valueNoise(hx, hy, 2.4, 5) + 1.1 * valueNoise(hx, hy, 1.2, 9); } });
  },
  faceExtra({ rig, face, E }) {
    if (!E.husk) return;
    // a hairline crack of husk amber across the far cheek
    const on = ['skin', 'blush', 'bruise'];
    const pts = [face.proj(0.38, 55), face.proj(0.5, 58.5), face.proj(0.46, 61), face.proj(0.6, 64.5)].map(([x, y]) => [x, y]);
    rig.strokeH(spline(pts, { seg: 3 }), (t) => ['crack', 0, t < 0.5 ? 4 : 3], { onlyMat: on });
  },
  post(d, rig, idx, light, lightName, exprId) {
    if (exprId === 'peace') return;
    // warm glow: an amber rim on the silhouette, strongest along the top & far edge ("faintly glowing")
    const A = hexToRgb(PAL.amber_l), B = hexToRgb(PAL.amber_ll);
    const wrong = exprId === 'wrong';
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = y * PW + x; if (!rig.mat[i]) continue;
      const e = rig.edge[i];
      if (e > 3.2) {
        // overall warm cast; 'wrong' is drained
        if (wrong) { const l = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]; d[i * 4] = lerp(d[i * 4], l, 0.25); d[i * 4 + 1] = lerp(d[i * 4 + 1], l, 0.25); d[i * 4 + 2] = lerp(d[i * 4 + 2], l, 0.25); }
        else { d[i * 4] = Math.min(255, d[i * 4] * 1.05 + 4); d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * 1.02 + 2); }
        continue;
      }
      // solid 1-px rim on the silhouette, a broken second row inside it
      const C = e <= 1.2 ? B : A;
      const k = e <= 1.2 ? (wrong ? 0.5 : 0.38) : (bay(x, y) < 0.5 ? (wrong ? 0.3 : 0.2) : 0);
      if (e > 2.2 || !k) continue;
      d[i * 4] = lerp(d[i * 4], C[0], k); d[i * 4 + 1] = lerp(d[i * 4 + 1], C[1], k); d[i * 4 + 2] = lerp(d[i * 4 + 2], C[2], k);
    }
  },
};

function deniseBody({ rig, E }) {
  const sh = E.shoulder || 0;
  const s = (y, k = 1) => y - sh * 3 * k;
  const torsoZ = (x) => 3 + 12 * Math.sqrt(Math.max(0, 1 - ((x - 47) / 60) ** 2));
  // uniform jacket (closed), squared band shoulders
  const usid = rig.poly([[-6, s(100)], [2, s(94.5)], [13, s(90.5)], [25, s(88, 0.7)], [34, s(86.5, 0.4)], [60, s(86.5, 0.4)], [71, s(88, 0.7)], [83, s(91)], [93, s(95.5)], [102, s(99.5)], [102, 124], [-6, 124]],
    { mat: 'uni', smooth: true, seg: 3, rim: 5, rimDepth: 5, z: torsoZ, edgeOpen: 1 });
  // epaulettes (gold edged)
  for (const [a, b] of [[[31, s(87.5, 0.5)], [10, s(93)]], [[63, s(87.5, 0.5)], [84, s(92)]]]) {
    rig.strokeH(spline([a, b], { seg: 3 }), (t, x, y, i) => (rig.sid[i] === usid ? ['gold', 0] : null));
    rig.strokeH(spline([[a[0], a[1] + 3], [b[0], b[1] + 3]], { seg: 3 }), (t, x, y, i) => (rig.sid[i] === usid ? ['gold', -1] : null));
  }
  // gold braid across the chest: three looping cords with brass buttons at the centre line
  for (const [k, y0] of [[0, 101], [1, 108], [2, 115]]) {
    const cord = (side) => spline([[47.5, y0], [47.5 + side * 7, y0 - 1.2], [47.5 + side * 14, y0 + 0.4], [47.5 + side * 18, y0 + 2.6]], { seg: 4 });
    for (const sd of [-1, 1]) {
      rig.strokeH(cord(sd), (t, x, y, i) => (rig.sid[i] === usid ? ['gold', t > 0.85 ? -1 : 0] : null));
      rig.strokeH(cord(sd).map(([x, y]) => [x, y + 1]), (t, x, y, i) => (rig.sid[i] === usid && t < 0.8 ? ['gold', -2] : null));
    }
    rig.dotH(47.4, y0 - 0.5, 'gold', 1); rig.dotH(48.4, y0 - 0.5, 'gold', 0); rig.dotH(47.4, y0 + 0.5, 'gold', -1); rig.dotH(48.4, y0 + 0.5, 'gold', -1);
  }
  // high stand collar, gold piping on top, closed at the throat with a lyre pin
  const csid = rig.poly([[33.5, s(87, 0.4)], [33.5, 80.5], [40, 82], [47.5, 83], [55, 82], [61, 80.5], [61, s(87, 0.4)], [55, 89.6], [47.5, 90.8], [40, 89.6]],
    { mat: 'uni', smooth: false, rim: 2.2, rimDepth: 2.2, z: (x) => torsoZ(x) + 3 });
  rig.strokeH(spline([[33.5, 80.8], [40, 82.3], [47.5, 83.3], [55, 82.3], [61, 80.8]], { seg: 4 }), (t, x, y, i) => (rig.sid[i] === csid ? ['gold', 1] : null));
  rig.strokeH(spline([[33.5, s(86.4, 0.4)], [40, 89], [47.5, 90.2], [55, 89], [61, s(86.4, 0.4)]], { seg: 4 }), (t, x, y, i) => (rig.sid[i] === csid ? ['gold', -1] : null));
  rig.strokeH([[47.5, 84.2], [47.5, 89.6]], (t, x, y, i) => (rig.sid[i] === csid ? ['uni', -2] : null));
  for (const [x, y, o] of [[37, 85.5, 1], [38, 85, 0], [38, 86.5, -1], [57, 85.5, 0], [58, 85, -1]]) rig.dotH(x, y, 'gold', o);
}

export const DENISE_EXPR = {
  lure: { tilt: 0, brow: { y: 0.15, inner: 0.1 }, eye: { open: 0.96, lower: 0.25 }, mouth: { smile: 0.62, width: 1.05 }, blush: 0.15, flatSkin: 0.2 },
  wrong: { tilt: 0.36, hx: -3, brow: { y: 0.15, inner: 0.1 }, eye: { open: 1.08, lower: 0.1, pupil: 0.45, noHi: true, diverge: 0.38, gx: 0.05, gy: -0.05 }, mouth: { smile: 0.6, smileN: 0.12, smileF: -0.08, open: 0.08, shape: 'talk', width: 1.05 }, husk: 0.55, pale: 0.1 },
  peace: { tilt: 0.07, brow: { inner: 0.3, y: 0.05 }, eye: { shut: 'soft' }, mouth: { smile: 0.3 }, blush: 0.1 },
};
