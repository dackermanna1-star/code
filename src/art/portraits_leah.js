// Leah Brandt — deadpan best friend. Sleek dark chin-length bob with blunt bangs, round wire glasses (glare
// streaks, eyes visible behind), oversized gray knit cardigan over a cream Peter-Pan-collar blouse.
import { PAL, mix } from './palette.js';
import { material, spline } from './portraits_core.js';
import { stdMats, paleRamp } from './portraits_human.js';
import { drawSmudges } from './portraits_face.js';
import { L, strand, hairVol, enrolledSkin } from './portraits_parts.js';
import { hash2 } from './util.js';

const SKIN = ['#46202a', mix(PAL.skin_dd, PAL.skin_d, 0.5), mix(mix(PAL.skin_d, PAL.skin, 0.55), '#b85a62', 0.12),
  mix(PAL.skin, PAL.skin_l, 0.36), mix(PAL.skin_l, PAL.white, 0.14), mix(PAL.skin_l, PAL.white, 0.5)];
const HAIR = ['#050407', '#0c0a0e', '#151218', '#1f1b23', '#2c2832', '#4e4a5c'];
const SKIN_TONE = [0.2, 0.38, 0.55, 1.06];

export const LEAH = {
  seed: 3301,
  shift: [1, 0],
  exprBase: { eye: { gx: -0.35, open: 0.78 } },
  face: {
    cx: 46, yaw: 0.3,
    rows: [[21, 13, 14, 0], [26, 17.6, 18.5, 0], [33, 19.6, 21, 0], [41, 20.4, 22, 0], [50, 20.2, 22, 0], [56, 19.6, 21, 0.6],
      [61.5, 18.2, 19.6, 1.8], [66, 15.8, 18, 3.4], [70, 12.6, 15.6, 5.2], [73.4, 8.8, 12.8, 7], [76, 5.2, 9.8, 8.2], [77.8, 2, 7, 8.6]],
  },
  materials(E, o) {
    let skin = paleRamp(SKIN, (E.pale || 0) * 0.9, '#d4d2d8');
    if (o.enrolled) skin = enrolledSkin(skin);
    const hair = o.enrolled ? HAIR.map((c) => mix(c, '#3a342e', 0.25)) : HAIR;
    return [
      material('skin', skin, { tone: SKIN_TONE, dither: 0.02, ditherT: [0.02, 0.035, 0.06, 0.008], flat: E.flatSkin || 0 }),
      material('blush', skin.map((c, i) => mix(c, '#d8606a', i === 0 ? 0 : 0.2)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#6a4a6e', 0.35)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('dirt', skin.map((c) => mix(c, '#5a4a3e', 0.42)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('lip', ['#3a1220', '#5a2030', '#84404a', '#a8626a', '#c48082', '#d89c9a'], { tone: SKIN_TONE, dither: 0, line: false }),
      material('lash', ['#060508', '#0e0b0e', '#181418', '#241e22', '#30282c', '#3e3438'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#060508', '#100c10', '#1a1518', '#261f22', '#32292c', '#403438'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', o.enrolled ? ['#2a2620', '#463e34', '#625a4c', '#7e7462', '#988e7a', '#b0a690'] : ['#0a0605', '#180e0a', '#2a1a12', '#3e281a', '#563a26', '#725036'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('irisGlass', ['#3a3226', '#5c4e38', '#7e6c4e', '#9c8a66', '#b8a680', '#d0c09c'], { tone: [0.15, 0.3, 0.55, 0.95], dither: 0, line: false, inner: false, flat: 0.6 }),
      material('hair', hair, { tone: [0.18, 0.4, 0.7, 1.06], dither: 0.015, spec: 0.6, specAt: 0.93, specW: 0.035 }),
      material('wire', ['#141418', '#26262c', '#3c3c44', '#5a5a64', '#7c7c86', '#a8a8b0'], { tone: [0.15, 0.35, 0.6, 0.95], dither: 0, line: false, inner: false, flat: 0.3 }),
      material('knit', ['#121216', '#202026', '#2e2e36', '#42424a', '#585860', '#72727a'], { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.02 }),
      material('blouse', ['#2e2b26', '#57524a', '#837c6e', '#aaa290', '#c6bea8', '#ddd6c2'], { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.01 }),
      material('button', ['#1a120e', '#2e2018', '#463224', '#5e4632', '#7a5e44', '#94785a'], { dither: 0, line: false }),
      ...stdMats(),
    ];
  },
  features() {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.43, y: 50.5, w: 10.4, hu: 3.6, hl: 2.4, ri: 3.4, rp: 1.4, irisW: 1, irisShiftN: -0.1, cIn: 0.7, cOut: -0.3, peak: 0.05, archPow: 2.4,
        lash: [1, 2, 2], flick: 0.9, flickRise: 1.6, crease: true, creaseGap: 1.3, lowerLine: 0.5, irisDy: -0.2,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'irisGlass', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 43.4, uIn: 0.13, uPk: 0.48, uOut: 0.82, pkY: -0.5, outY: 0.6, w: [2.0, 1.8, 0.9], mat: 'brow', skinMat: 'skin', farW: 0.9 },
      nose: { y: 60.6, e: 4.2, tipW: 2.2, skinMat: 'skin' },
      mouth: { y: 67.6, hw: 0.25, farK: 1, h: 4.8, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: null,
      neck: { x: 46, yTop: 64, yBot: 96, wTop: 6, wBot: 7, lean: 1.8, z: 1 },
      blush: { u: 0.5, y: 59.5, rx: 3.4, ry: 1.6, mat: 'blush' },
      sweat: [[58, 47.5], [66, 61]],
      underMat: 'bruise',
      detailOn: ['blush', 'bruise', 'dirt'],
    };
  },
  hairBack({ rig, sids }) {
    const zb = hairVol(46, 46, 28, -14);
    sids.hair.add(rig.poly([[46, 12], [33, 14], [24, 22], [20, 34], [18.5, 48], [18.5, 62], [19.5, 74], [24, 79.5], [32, 80], [60, 79], [68, 76], [72, 64], [72.5, 48], [71, 32], [66, 20], [57, 13.5]],
      { mat: 'hair', smooth: true, rim: 3, rimDepth: 3, z: zb, off: -1 }));
  },
  bodyBack({ rig }) {
    rig.poly([[33, 88], [37, 84], [47, 82.5], [57, 84], [62, 88], [61, 94], [34, 94]], { mat: 'knit', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -1 });
  },
  bodyFront(ctx) { leahBody(ctx); },
  faceExtra(ctx) { leahGlasses(ctx); },
  hairFront(ctx) { leahHair(ctx); },
  grimeFace({ rig, face }, g) {
    const on = ['skin', 'blush', 'bruise'];
    const c1 = face.proj(-0.55, 64), c2 = face.proj(0.62, 66);
    const list = [[c1[0], c1[1], 2.8, 1.7, 0.5]];
    if (g >= 2) list.push([c2[0], c2[1], 2.5, 1.6, 0.5]);
    drawSmudges(rig, list, { mat: 'dirt', on });
    if (g >= 2) {
      // a thin scratch on the near cheekbone, under the lens (the forehead is too short under the bangs for one)
      const a = face.proj(-0.62, 57.5), b = face.proj(-0.47, 60.5);
      rig.strokeH([[a[0], a[1]], [b[0], b[1]]], ['lip', -1], { onlyMat: on });
    }
  },
  grimeBody({ rig, r }, g) {
    for (let k = 0; k < g * 22; k++) {
      const x = Math.floor(r() * 96), y = 96 + Math.floor(r() * 24); const i = y * 96 + x;
      if (rig.mats[rig.mat[i]]?.name === 'knit') rig.setPix(i, 'knit', 1);
    }
  },
};

function leahBody({ rig, E }) {
  const sh = E.shoulder || 0;
  const s = (y, k = 1) => y - sh * 3 * k;
  const torsoZ = (x) => 3 + 11 * Math.sqrt(Math.max(0, 1 - ((x - 47) / 62) ** 2));
  // cream blouse in the V
  rig.poly([[35, s(90, 0.4)], [40, 88], [47, 93], [54, 88], [59, s(90, 0.4)], [58, 124], [36, 124]], { mat: 'blouse', rim: 3, rimDepth: 3, z: (x) => torsoZ(x) - 2.5, edgeOpen: 1 });
  rig.strokeH(spline([[47.3, 97], [47.6, 108], [47.8, 124]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['blouse'] });
  for (const y of [103, 112, 121]) rig.dotH(48.6, y, 'button', 3);
  // oversized cardigan: droopy shoulders, deep V
  const near = [[-6, s(103)], [3, s(97)], [14, s(92.5)], [25, s(89.5, 0.7)], [33.5, s(87.5, 0.4)], [37.5, 95], [40.5, 104], [43, 114], [44.5, 124], [-6, 124]];
  const far = [[60.5, s(87.5, 0.4)], [70, s(89.5, 0.7)], [82, s(93)], [92, s(98)], [102, s(102)], [102, 124], [53.5, 124], [55, 114], [56.5, 104], [58, 95]];
  const kn = rig.poly(near, { mat: 'knit', rim: 5, rimDepth: 5, z: torsoZ, edgeOpen: 1 });
  const kf = rig.poly(far, { mat: 'knit', rim: 5, rimDepth: 5, z: (x) => torsoZ(x) - 0.5, edgeOpen: 1 });
  // ribbed button band along both front edges + knit texture
  rig.paint([-6, 84, 102, 124], (hx, hy, x, y, i) => {
    if (rig.sid[i] !== kn && rig.sid[i] !== kf) return null;
    const edgeN = (hx - lerpX(near, hy));
    const edgeF = (lerpX(far, hy) - hx);
    if (rig.sid[i] === kn && edgeN > -3.2 && edgeN <= 0) return ['knit', x % 2 ? 0 : -1];
    if (rig.sid[i] === kf && edgeF > -3.2 && edgeF <= 0) return ['knit', x % 2 ? 0 : -1];
    // faint knit: sparse irregular purl dots
    return (hash2(x, y, 7) % 23 === 0) ? ['knit', -1] : null;
  });
  for (const y of [106, 115]) { rig.dotH(39.4, y - 0.5, 'button', 2); rig.dotH(40.4, y - 0.5, 'button', 1); rig.dotH(39.4, y + 0.5, 'button', 0); }
  // drooping shoulder seams
  rig.strokeH(spline([[16, s(92)], [13, 104], [11, 124]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['knit'] });
  rig.strokeH(spline([[80, s(92.5)], [83, 104], [84, 124]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['knit'] });
  // Peter Pan collar: two rounded flaps over the cardigan neckline
  const flapN = [[34, s(87, 0.4)], [38.5, 87.5], [44, 90.5], [46.8, 94], [45.2, 98], [40, 98.5], [35.5, 95], [33, s(90, 0.4)]];
  const flapF = [[60, s(87, 0.4)], [56, 87.5], [51, 90.5], [48.2, 94], [49.5, 97.6], [54, 98], [58, 95], [60.5, s(90, 0.4)]];
  rig.poly(flapN, { mat: 'blouse', smooth: true, seg: 3, rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 2 });
  rig.poly(flapF, { mat: 'blouse', smooth: true, seg: 3, rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 1.8 });
}
function lerpX(poly, y) {
  // x of the inner front edge (vertices 5..8 near / 6..9 far) at height y
  let best = null;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) {
      if (Math.abs(b[1] - a[1]) < 0.01) continue;
      const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      if (x > 20 && x < 75) best = x;
    }
  }
  return best ?? -999;
}

function leahGlasses({ rig, face, E, o, eyes }) {
  const on = ['skin', 'blush', 'bruise', 'dirt', 'sclera', 'iris', 'pupil', 'glint', 'lash', 'brow', 'irisGlass', 'tear'];
  const lens = [];
  for (const side of ['near', 'far']) {
    const near = side === 'near';
    const u = near ? -0.43 : 0.43;
    const [ex, ey] = face.proj(u, 50.5 + (E.pitch || 0) * 1.5);
    const sc = face.scaleAt(u, 50.5);
    const rx = (near ? 5.9 : 5.3) * sc, ry = near ? 5.2 : 5.0;
    lens.push({ ex, ey, rx, ry, near });
    // ring
    const pts = [];
    for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; pts.push([ex + Math.cos(a) * rx, ey + 0.8 + Math.sin(a) * ry]); }
    rig.strokeH(pts, (t, x, y, i) => {
      const a = t * Math.PI * 2; // light from top-left: brighter upper-left arc
      const lit = Math.cos(a - Math.PI * 1.25);
      return ['wire', lit > 0.5 ? 1 : lit < -0.3 ? -1 : 0];
    }, { onlyMat: on });
    // faint lens-edge shadow on the cheek under the rim
    rig.strokeH(pts.slice(5, 16).map(([x, y]) => [x, y + 1]), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['skin', 'blush'] });
    // glare: a short streak hugging the upper-left rim (the false Leah's lenses reflect nothing)
    if (!E.noGlare) {
      const g1 = [];
      for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.08 + k * 0.05); g1.push([ex + Math.cos(a) * (rx - 1.3), ey + 0.4 + Math.sin(a) * (ry - 1.3)]); }
      rig.strokeH(g1, (t) => ['glint', 0, t > 0.25 && t < 0.75 ? 5 : 4], { onlyMat: on });
      rig.dotH(ex + rx * 0.45, ey + ry * 0.5, 'glint', 0, 3, { onlyMat: on });
    }
  }
  // bridge + temples
  const [n, f] = lens;
  rig.strokeH(spline([[n.ex + n.rx - 0.3, n.ey - 1], [(n.ex + f.ex) / 2 + 0.5, n.ey - 2.2], [f.ex - f.rx + 0.3, f.ey - 1]], { seg: 4 }), ['wire', 0], { onlyMat: on });
  rig.strokeH([[n.ex - n.rx, n.ey - 1.5], [n.ex - n.rx - 6, n.ey - 2.5]], ['wire', -1], { onlyMat: on });
  rig.strokeH([[f.ex + f.rx, f.ey - 1.5], [f.ex + f.rx + 3, f.ey - 2]], ['wire', -1], { onlyMat: on });
}

function leahHair({ rig, sids, o }) {
  const zf = hairVol(46, 46, 28, -2.5);
  const zs = hairVol(46, 46, 28, -6);
  const g = o.grime || 0;
  // crown dome
  sids.hair.add(rig.poly([[22, 40], [21, 28], [27, 18], [37, 12], [48, 10.5], [59, 13], [67, 20], [71, 30], [70.5, 38], [60, 37.5], [46, 38], [32, 37.5]], { mat: 'hair', smooth: true, rim: 4, rimDepth: 3, z: (x, y) => zs(...rig.toH(x, y)) + 1.5 }));
  // blunt bangs: one curtain across the forehead, cut straight just above the brows, a few soft separations
  const bang = [[24.5, 39.5], [24, 30], [29, 19], [38, 13.5], [48, 12.5], [58, 15], [65.5, 21], [68.5, 30], [68, 38.5], [62, 38.2], [54, 38.8], [46, 38.9], [38, 38.5], [30, 38]];
  const bsid = rig.poly(bang, { mat: 'hair', smooth: true, seg: 4, rim: 3, rimDepth: 2.2, z: (x, y) => zf(...rig.toH(x, y)) + 0.5 });
  sids.hair.add(bsid);
  for (const [x0, x1, y1] of [[33, 32, 40], [39.5, 39, 40.5], [46.5, 46.6, 40.9], [53, 54, 40.7], [59, 61, 40.1], [64, 66.6, 39]]) {
    rig.strokeH(spline([[x0 + 1.5, 26], [x0 + 0.5, 34], [x1, y1]], { seg: 4 }), (t, x, y, i) => (rig.sid[i] === bsid && t > 0.35 ? ['hair', -1] : null));
  }
  // side curtains framing the face, A-line: longer in front, ends tucking under at the jaw
  L(rig, sids, [[26, 22], [19.5, 38], [18.5, 58], [22.5, 77]], 8, 9, 6, { z: zs, depth: 2.4 });
  L(rig, sids, [[29.5, 33], [24.5, 46], [24, 62], [28, 77.5]], 6, 6.4, 4.4, { z: zf, depth: 2 });
  L(rig, sids, [[65, 22], [70.5, 36], [71, 56], [68.5, 75]], 7, 7.5, 5, { z: zs, depth: 2.2 });
  L(rig, sids, [[65, 36], [67, 48], [67.2, 61], [64.6, 74.5]], 4.6, 4.8, 3.4, { z: zf, depth: 1.8 });
  // the blunt ends: a darker inward curl line along the bottom
  rig.strokeH(spline([[18.6, 72], [21.5, 77.6], [26, 78.8], [29.5, 78]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['hair'] });
  rig.strokeH(spline([[72, 70], [70, 75], [66, 76.6]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['hair'] });
  if (g >= 1) { strand(rig, [[40, 13], [37, 9.5], [33.5, 10]], 'hair', 1, false); strand(rig, [[56, 39.5], [57.5, 43], [56.5, 46]], 'hair', 0); }
  if (g >= 2) { strand(rig, [[68, 24], [72.5, 26], [74.5, 31]], 'hair', 1, false); strand(rig, [[20, 60], [16, 66], [16.5, 72]], 'hair', 1, false); }
}

export const LEAH_EXPR = {
  neutral: { mouth: { smile: -0.04 }, brow: { y: -0.05 } },
  deadpan: { brow: { y: -0.2, nearY: -0.05 }, eye: { open: 0.5, lower: 0.3, gx: -0.5 }, mouth: { smile: -0.1, press: 1, width: 0.85 } },
  smirk: { tilt: -0.05, brow: { farY: 0.4 }, eye: { open: 0.66, lower: 0.35, gx: -0.5 }, mouth: { smileF: 0.7, smileN: -0.05, dx: 0.02 } },
  talk: { brow: { y: 0.1 }, eye: { open: 0.86 }, mouth: { open: 0.45, shape: 'talk', width: 0.72 } },
  annoyed: { tilt: -0.06, hx: -0.5, brow: { y: -0.45, furrow: 0.75, nearY: -0.15 }, eye: { open: 0.58, lower: 0.25, gx: 0.85, gy: -0.1 }, mouth: { smile: -0.32, smileN: -0.15, press: 1 } },
  worried: { brow: { inner: 1.45, furrow: 0.45, y: 0.1 }, eye: { open: 1.08, innerUp: 0.5, gx: -0.2, gy: 0.2 }, mouth: { smile: -0.45, press: 1, width: 0.85 } },
  scared: { shoulder: 0.8, brow: { inner: 1.2, y: 0.65, furrow: 0.3 }, eye: { open: 1.32, pupil: 0.62, iris: 0.9 }, mouth: { open: 0.6, shape: 'O', width: 0.6, smile: -0.2 }, sweat: 1, pale: 0.3 },
  hurt: { pitch: 0.3, tilt: 0.05, brow: { inner: 1.5, furrow: 0.4 }, eye: { open: 0.62, innerUp: 0.45, wet: 0.8, gx: 0.55, gy: 0.55 }, mouth: { smile: -0.55, press: 1, tremble: 0.35 } },
  crying: { pitch: 0.45, tilt: -0.05, brow: { inner: 1.4, furrow: 0.65, y: 0.1 }, eye: { open: 0.48, lower: 0.35, innerUp: 0.5, wet: 1, gy: 0.4 }, mouth: { open: 0.5, shape: 'frown', smile: -0.85, tremble: 1, width: 0.95 }, tears: 1, blush: 0.55 },
  smile: { tilt: 0.04, brow: { y: 0.2, inner: 0.1 }, eye: { open: 0.8, lower: 0.52 }, mouth: { smile: 0.62, width: 1.02 }, blush: 0.28 },
  relieved: { shoulder: -0.35, tilt: -0.05, brow: { inner: 0.55, y: 0.25 }, eye: { shut: 'soft' }, mouth: { open: 0.18, shape: 'talk', smile: 0.35, width: 0.8 }, blush: 0.15 },
  entranced: { __enr: true, tilt: 0.04, brow: { y: -0.12 }, eye: { open: 0.8, glassy: 1, gx: 0, gy: 0.18, diverge: 0.12 }, mouth: { open: 0.14, shape: 'talk', width: 0.5, smile: -0.05 }, pale: 0.3 },
  // the false Leah: perfectly composed. Eyes fully open (she never is), dead-centre stare, pupils small and
  // still, symmetric smile held too long that never reaches the eyes, lenses that reflect nothing.
  false: { tilt: 0, brow: { y: 0.08 }, eye: { open: 1.02, gx: -0.42, gy: 0, pupil: 0.62, lower: 0 }, mouth: { smile: 0.5, width: 1.04 }, noGlare: true, pale: 0.12, flatSkin: 0.45 },
};
