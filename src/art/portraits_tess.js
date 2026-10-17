// Tess Dolan — protagonist portrait rig.
// Copper-red messy shoulder-length hair tucked behind her LEFT ear (the far side in this 3/4 view), loose
// strands across her face, freckles, pale, gray-green eyes; oversized light-wash denim jacket over a black tee.
import { PAL, mix, darken, lighten } from './palette.js';
import { material, rampFrom } from './portraits_core.js';
import { stdMats, paleRamp } from './portraits_human.js';
import { drawSmudges } from './portraits_face.js';
import { L, strand, hairVol, denimDetails, enrolledSkin } from './portraits_parts.js';

const SKIN = ['#4a1c22', mix(PAL.skin_dd, PAL.skin_d, 0.55), mix(mix(PAL.skin_d, PAL.skin, 0.5), '#c4605a', 0.18),
  mix(PAL.skin, PAL.skin_l, 0.4), mix(PAL.skin_l, PAL.white, 0.18), mix(PAL.skin_l, PAL.white, 0.55)];
const HAIR = ['#260905', PAL.hair_r_dd, PAL.hair_r_d, mix(PAL.hair_r_d, PAL.hair_r, 0.5), PAL.hair_r, mix(PAL.hair_r_l, PAL.hair_r_ll, 0.25)];
const HAIR_LIT = [PAL.hair_r_dd, PAL.hair_r_d, mix(PAL.hair_r_d, PAL.hair_r, 0.5), PAL.hair_r, mix(PAL.hair_r, PAL.hair_r_l, 0.6), PAL.hair_r_ll];

export const TESS = {
  seed: 1611,
  shift: [2, -1],
  exprBase: { eye: { gx: -0.5 } },
  face: {
    cx: 45, yaw: 0.32,
    rows: [[21, 13, 14, 0], [26, 18, 18.5, 0], [33, 20.2, 21, 0], [41, 21, 22, 0], [50, 20.8, 22, 0], [56, 20.2, 21, 0.6],
      [61.5, 18.8, 19.8, 1.8], [66, 16.6, 18.2, 3.4], [70, 13.4, 15.8, 5.2], [73.4, 9.4, 12.8, 7], [75.9, 5.6, 9.8, 8.2], [77.7, 2.2, 7, 8.6]],
  },
  materials(E, o) {
    let skin = paleRamp(SKIN, (E.pale || 0) * 0.9, '#d8d4d6');
    if (o.enrolled) skin = enrolledSkin(skin, o.half ? 0.5 : 1);
    const hair = o.enrolled ? HAIR.map((c, i) => mix(c, '#8a6a5a', 0.18 + i * 0.02)) : HAIR;
    return [
      material('skin', skin, { tone: [0.2, 0.38, 0.55, 1.06], dither: 0.012 }),
      material('freckle', skin.map((c, i) => mix(c, i < 3 ? PAL.freckle : '#c47a58', 0.3)), { tone: [0.2, 0.38, 0.55, 1.06], dither: 0, line: false }),
      material('blush', skin.map((c, i) => mix(c, '#e06a6a', i === 0 ? 0 : 0.2)), { tone: [0.2, 0.38, 0.55, 1.06], dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#6a4a6e', 0.35)), { tone: [0.2, 0.38, 0.55, 1.06], dither: 0, line: false }),
      material('dirt', skin.map((c) => mix(c, '#5a4a3e', 0.42)), { tone: [0.2, 0.38, 0.55, 1.06], dither: 0, line: false }),
      material('scratch', ['#3a0c0e', '#5e1416', '#8a2a26', '#b04a40', '#c86a5a', '#da8a76'], { dither: 0, line: false }),
      material('lip', ['#3e1418', '#5e2228', '#8a4044', '#b06a66', '#cc8a80', '#e0a898'], { tone: [0.2, 0.38, 0.55, 1.06], dither: 0, line: false }),
      material('lash', ['#120605', '#240e09', '#3e160d', '#5a2213', '#76321c', '#904428'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#1c0806', '#34110a', '#4e190d', '#662312', '#7c2e17', '#92401f'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', o.enrolled ? ['#2a2a26', '#4a4a42', '#6e6c60', '#8e8a7c', '#aaa494', '#c4bcaa'] : ['#0e1612', '#1d2e26', '#33493d', '#4c6a58', '#6e8e78', '#9ab6a0'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('irisGlass', ['#3a3226', '#5c4e38', '#7e6c4e', '#9c8a66', '#b8a680', '#d0c09c'], { tone: [0.15, 0.3, 0.55, 0.95], dither: 0, line: false, inner: false, flat: 0.6 }),
      material('hair', hair, { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.02, spec: 0.42, specAt: 0.9, specW: 0.06 }),
      material('hairBack', hair.map((c) => darken(c, 0.15)), { tone: [0.2, 0.45, 0.75, 1.1], dither: 0.02, spec: 0.12 }),
      ...denimMats(),
      ...stdMats(),
    ];
  },
  features(E) {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.43, y: 50, w: 10.6, irisShiftN: -0.9, hu: 3.9, hl: 2.6, ri: 3.6, rp: 1.45, irisW: 1.0, cIn: 0.8, cOut: -0.6, peak: -0.2, archPow: 2.6,
        lash: [1, 2, 2.4], flick: 1.2, flickRise: 2.2, crease: true, creaseGap: 1.4, lowerLine: 0.55, irisDy: -0.4,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'irisGlass', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 43.2, uIn: 0.14, uPk: 0.5, uOut: 0.84, pkY: -1.3, outY: 0.8, w: [2.0, 1.8, 0.9], mat: 'brow', skinMat: 'skin', farW: 0.9 },
      nose: { y: 60.5, e: 4.4, tipW: 2.3, skinMat: 'skin' },
      mouth: { y: 67.6, hw: 0.27, farK: 1, h: 5, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: { y: 53.5, h: 10, w: 5, back: 3, far: true, near: false, farPoke: 3.6 },
      neck: { x: 46, yTop: 64, yBot: 96, wTop: 6.2, wBot: 7.4, lean: 1.8, z: 1 },
      freckles: { n: 15, uSpread: 0.5, y0: 54.5, y1: 59.5, mat: 'freckle' },
      blush: { u: 0.5, y: 59.5, rx: 3.6, ry: 1.7, mat: 'blush' },
      sweat: [[58.5, 34], [66.5, 61]],
      underMat: 'bruise',
      detailOn: ['freckle', 'blush', 'bruise', 'dirt'],
    };
  },
  hairBack({ rig, sids }) {
    const zb = hairVol(46, 44, 29, -15);
    // dark backing mass so gaps between locks read as depth, not holes
    sids.hair.add(rig.poly([[46, 11], [34, 12], [25, 18], [20, 28], [18, 42], [17, 56], [16, 70], [14.5, 84], [15, 93], [20, 97], [27, 95],
      [32, 88], [58, 86], [66, 86], [71, 76], [72, 62], [72, 46], [71, 32], [67, 21], [59, 13]], { mat: 'hairBack', smooth: true, rim: 3, rimDepth: 3, z: zb }));
    // back locks (behind face & neck): near side hangs to the shoulder, far side tucked & shorter
    L(rig, sids, [[20, 40], [16, 56], [15, 74], [13, 92]], 7, 8, 4, { z: zb, mat: 'hairBack', depth: 3 });
    L(rig, sids, [[24, 56], [20, 70], [21, 84], [19, 97]], 6, 7, 3, { z: zb, mat: 'hairBack', depth: 3 });
    L(rig, sids, [[70, 30], [73, 46], [72, 62], [69, 80]], 6, 7, 3, { z: zb, mat: 'hairBack', depth: 3 });
    L(rig, sids, [[66, 56], [69, 68], [67, 78], [63, 87]], 5, 6, 2.5, { z: zb, mat: 'hairBack', depth: 2.5 });
  },
  bodyBack({ rig }) {
    // collar stand behind the neck (inner face, in shadow)
    rig.poly([[32, 86], [37, 81], [47, 79.5], [57, 81], [63, 85], [62, 92], [33, 93]], { mat: 'denim', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -1 });
  },
  bodyFront(ctx) { tessBody(ctx); },
  hairFront(ctx) { tessHairFront(ctx); },
  grimeFace({ rig, face }, g) {
    const on = ['skin', 'freckle', 'blush', 'bruise'];
    const c1 = face.proj(-0.6, 63), c2 = face.proj(0.2, 36), c3 = face.proj(0.55, 72);
    const list = [[c1[0], c1[1], 3.2, 2, 0.55]];
    if (g >= 2) list.push([c2[0], c2[1], 3, 1.6, 0.45], [c3[0], c3[1], 2.4, 1.6, 0.5]);
    drawSmudges(rig, list, { mat: 'dirt', on });
    if (g >= 2) {
      const a = face.proj(0.5, 56.5), b = face.proj(0.66, 60);
      rig.strokeH([[a[0], a[1]], [b[0], b[1]]], [ 'scratch', 0, 2 ], { onlyMat: on });
      rig.strokeH([[a[0] + 0.6, a[1] - 0.8], [b[0] + 0.6, b[1] - 0.8]], ['skin', 1], { onlyMat: on });
    }
  },
  grimeBody({ rig, r }, g) {
    // dust and grime on the denim
    const n = g * 26;
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * 96), y = 96 + Math.floor(r() * 24);
      const i = y * 96 + x; const mn = rig.mats[rig.mat[i]]?.name;
      if (mn === 'denim') rig.setPix(i, 'denimDust', 0);
    }
    if (g >= 2) {
      for (let k = 0; k < 14; k++) {
        const x = 8 + Math.floor(r() * 22), y = 106 + Math.floor(r() * 12);
        const i = y * 96 + x; if (rig.mats[rig.mat[i]]?.name === 'denim') rig.setPix(i, 'denim', -1);
      }
    }
  },
};

function denimMats() {
  return [
    material('denim', ['#182036', '#2a3a58', mix(PAL.denim_d, PAL.denim, 0.45), mix(PAL.denim, PAL.denim_l, 0.45), mix(PAL.denim_l, PAL.denim_ll, 0.4), mix(PAL.denim_ll, PAL.white, 0.25)], { tone: [0.2, 0.45, 0.74, 1.04], dither: 0.006 }),
    material('denimDust', ['#2c2a30', mix(PAL.denim_d, PAL.g4, 0.4), mix(PAL.denim, PAL.g5, 0.45), mix(PAL.denim_l, PAL.paper_d, 0.45), mix(PAL.denim_ll, PAL.paper, 0.45), PAL.paper], { dither: 0, line: false }),
    material('stitch', ['#2e2a2a', mix(PAL.denim_d, PAL.mustard_d, 0.5), mix(PAL.denim, PAL.mustard, 0.45), mix(PAL.denim_l, '#b89a5a', 0.45), mix(PAL.denim_ll, '#cdb47a', 0.45), '#d8cca8'], { tone: [0.2, 0.45, 0.74, 1.04], dither: 0, line: false, inner: false }),
    material('button', ['#24120a', PAL.brown_d, PAL.rust, '#a8683a', '#c88a54', '#e6b07a'], { dither: 0 }),
    material('tee', ['#050508', '#0c0c12', '#15151d', '#1f2029', '#2b2c38', '#3b3d4c'], { tone: [0.2, 0.42, 0.7, 1.0], dither: 0.05 }),
  ];
}

function tessBody({ rig, E }) {
  const sh = E.shoulder || 0; // + raised (tense), - slumped
  const s = (y, k = 1) => y - sh * 3.2 * k;
  const torsoZ = (x) => 3 + 11 * Math.sqrt(Math.max(0, 1 - ((x - 47) / 64) ** 2));
  // black tee (chest), crew neckline
  rig.poly([[30, s(91, 0.4)], [38, s(89, 0.3)], [47, 94], [56.5, s(89, 0.3)], [64, s(91, 0.4)], [66, 124], [28, 124]], { mat: 'tee', smooth: false, rim: 3, rimDepth: 3, z: (x) => torsoZ(x) - 2, edgeOpen: 1 });
  // crew-neck rib band
  rig.strokeH([[37.5, s(89.5, 0.3)], [42, 92.6], [47, 94.3], [52, 92.6], [56.5, s(89.5, 0.3)]], ['tee', 1]);
  rig.strokeH([[37.5, s(90.5, 0.3)], [42, 93.6], [47, 95.3], [52, 93.6], [56.5, s(90.5, 0.3)]], ['tee', -1]);
  // jacket panels (open front)
  const nearPanel = [[-6, s(104)], [2, s(98)], [12, s(93.5)], [24, s(90, 0.7)], [33, s(87, 0.4)], [36.5, 95], [38.5, 105], [40.5, 114], [41.5, 124], [-6, 124]];
  const farPanel = [[60, s(87, 0.4)], [70, s(89, 0.7)], [82, s(93)], [92, s(97.5)], [102, s(102)], [102, 124], [59.5, 124], [59.8, 113], [60.4, 101], [60.8, 93]];
  rig.poly(nearPanel, { mat: 'denim', rim: 5, rimDepth: 5, z: torsoZ, edgeOpen: 1 });
  rig.poly(farPanel, { mat: 'denim', rim: 5, rimDepth: 5, z: (x) => torsoZ(x) - 0.5, edgeOpen: 1 });
  // collar wings (lie over the shoulders, points on the chest)
  const nearCollar = [[29.5, s(84, 0.5)], [24, s(88, 0.7)], [18, s(93, 0.9)], [21, s(97, 0.8)], [27, 102.5], [33.5, 108.5], [36.2, 101], [35.6, 94], [34, 88]];
  const farCollar = [[60.5, s(84.5, 0.5)], [65, s(87.5, 0.7)], [71.5, s(91.5, 0.9)], [68, 97], [63.5, 102.5], [60.6, 106.5], [60.4, 98], [60.2, 91]];
  rig.poly(nearCollar, { mat: 'denim', rim: 2.5, rimDepth: 2.5, z: (x) => torsoZ(x) + 3.5, smooth: false });
  rig.poly(farCollar, { mat: 'denim', rim: 2.5, rimDepth: 2.5, z: (x) => torsoZ(x) + 3, smooth: false });
  denimDetails(rig, { nearCollar, farCollar, sh, s });
}

function tessHairFront({ rig, sids, E, o, face }) {
  const zf = hairVol(46, 44, 29, -3.5);
  const zs = hairVol(46, 44, 29, -6);
  const earSids = sids.ears;
  const noEar = (i) => !earSids.has(rig.sid[i]);
  const g = o.grime || 0;
  // hair cap: guarantees the scalp is covered between locks; hairline follows the forehead
  sids.hair.add(rig.poly([[24, 40], [23, 26], [30, 15], [44, 9.5], [58, 11.5], [67, 18], [70, 30], [67.5, 38], [63, 30.5], [57, 24.5],
    [48, 26], [40, 29], [33, 33], [28, 42]], { mat: 'hair', smooth: true, rim: 3, rimDepth: 2.5, z: (x, y) => zs(...rig.toH(x, y)) + 1, clip: noEar }));
  // far side: swept back from the part, tucked behind the (far) ear
  L(rig, sids, [[57, 14], [63, 14], [69, 21], [71, 31]], 6, 7, 4.5, { z: zs, depth: 3, strands: 1 });
  L(rig, sids, [[57, 17.5], [63.5, 21], [67, 30], [67.6, 42]], 5, 5.4, 2.6, { z: zf, depth: 2.6, strands: 1, clip: noEar });
  L(rig, sids, [[58, 19], [61.5, 25], [64, 33], [64.6, 39.5]], 3.6, 3.6, 1.4, { z: zf, depth: 2, clip: noEar });
  // crown, near side volume
  L(rig, sids, [[55, 13], [45, 7.5], [31, 11], [22, 26]], 7, 9.5, 6, { z: zs, depth: 3.5, strands: 2 });
  L(rig, sids, [[54, 15.5], [42, 12], [29, 19], [21.5, 38]], 6.5, 8.5, 5, { z: zs, depth: 3.2, strands: 2 });
  // near curtain over temple & (hidden) right ear: three broad clumps, ends flipping out/in
  L(rig, sids, [[27, 24], [17.5, 38], [15, 62], [12, 88]], 8, 9, 4, { z: hairVol(46, 44, 29, -9), depth: 2.2, strands: 1 });
  L(rig, sids, [[30.5, 21], [21, 33], [18.6, 54], [17.5, 77]], 8, 8.5, 3.5, { z: zs, depth: 2.4, strands: 1 });
  L(rig, sids, [[22, 64], [17.6, 79], [19.5, 91], [14, 99.5]], 6.5, 6, 2, { z: hairVol(46, 44, 29, 2), depth: 2.2, strands: 1 });
  L(rig, sids, [[29.5, 35], [24, 50], [23.2, 66], [24.6, 82]], 5.2, 5.6, 1.8, { z: zf, depth: 2, strands: 1 });
  L(rig, sids, [[25.5, 70], [24, 82], [27, 90.5], [25, 97]], 4.2, 4, 1.4, { z: hairVol(46, 44, 29, 3), depth: 1.8 });
  // side-swept fringe from the part toward the near side
  L(rig, sids, [[54.5, 17], [46, 18.5], [36, 26], [31.5, 41]], 7, 8.5, 2.2, { z: zf, depth: 3, strands: 2 });
  L(rig, sids, [[55, 18.5], [50.5, 24], [44.5, 31], [40.5, 40.5]], 5.4, 6.2, 1.6, { z: zf, depth: 2.6, strands: 1 });
  L(rig, sids, [[56, 19], [55.5, 25.5], [52.5, 32], [49.5, 37.5]], 4, 4.2, 1.2, { z: zf, depth: 2.2 });
  L(rig, sids, [[50, 20], [43, 25.5], [37.5, 33.5], [36.5, 44]], 3.6, 4.2, 1.2, { z: hairVol(46, 44, 29, -2.5), depth: 2.2 });
  // loose strands across the face (thin, crisp)
  strand(rig, [[42, 30], [37.6, 36.5], [35.6, 42.5]], 'hair', 0);
  strand(rig, [[51.5, 29], [48.8, 36], [47.6, 42.5]], 'hair', 0);
  // crown flyaways (more as the night goes on)
  if (g >= 1) {
    strand(rig, [[52, 10], [55, 6], [59, 6.5]], 'hair', 0, false);
    strand(rig, [[24, 30], [18.5, 30], [15.5, 35]], 'hair', 0, false);
    strand(rig, [[58, 27], [56, 35], [57.5, 42]], 'hair', 1);
  }
  if (g >= 2) {
    strand(rig, [[30, 14], [25, 10.5], [21, 13]], 'hair', 0, false);
    strand(rig, [[70, 26], [74.5, 31], [75, 38]], 'hair', 0, false);
    strand(rig, [[40.5, 34], [42.5, 44], [41.5, 52]], 'hair', 1);
    strand(rig, [[17, 70], [12, 78], [12.5, 86]], 'hair', 0, false);
  }
}

// ---- expressions ---------------------------------------------------------------------------------------
export const TESS_EXPR = {
  neutral: { eye: { open: 0.9 }, mouth: { smile: -0.08 }, brow: { y: -0.05 } },
  curious: { tilt: 0.1, brow: { y: 0.5, farY: 0.45, inner: 0.15 }, eye: { open: 1.1, gx: 0.35, gy: -0.45 }, mouth: { smile: 0.05, open: 0.3, shape: 'O', width: 0.5 } },
  talk: { brow: { y: 0.15 }, eye: { open: 0.95 }, mouth: { open: 0.55, shape: 'talk', width: 0.82, smile: 0.04 } },
  smirk: { tilt: -0.06, brow: { farY: 0.55, nearY: -0.15 }, eye: { open: 0.74, lower: 0.38, gx: -0.4 }, mouth: { smileF: 0.8, smileN: -0.1, dx: 0.03 } },
  smile: { tilt: 0.03, brow: { y: 0.28, inner: 0.1 }, eye: { open: 0.82, lower: 0.58, cheek: 0.6 }, mouth: { smile: 0.72, width: 1.08 }, blush: 0.3, cheek: 0.8 },
  laugh: { tilt: -0.09, hy: -1.5, brow: { y: 0.5 }, eye: { shut: 'happy' }, mouth: { open: 1, shape: 'laugh', smile: 0.65, width: 1.25, teeth: 1 }, blush: 0.5, cheek: 1 },
  confused: { tilt: 0.13, brow: { nearY: -0.45, farY: 0.8, inner: 0.3, furrow: 0.25 }, eye: { open: 1, gx: -0.6, gy: -0.55, nearOpen: 0.88 }, mouth: { smileN: -0.3, smileF: 0.2, open: 0.16, shape: 'talk', width: 0.55 } },
  skeptical: { tilt: -0.08, brow: { farY: 1.05, nearY: -0.45, furrow: 0.25 }, eye: { open: 0.68, farOpen: 1.18, gx: 0.1 }, mouth: { smileN: -0.25, smileF: 0.25, press: 1 } },
  suspicious: { tilt: 0.03, hx: -1, brow: { y: -0.6, furrow: 0.85, inner: -0.4 }, eye: { open: 0.5, lower: 0.5, gx: 0.95, gy: 0.05 }, mouth: { smile: -0.2, width: 0.85, press: 1 } },
  worried: { brow: { inner: 1.1, furrow: 0.5, y: 0.1 }, eye: { open: 1, innerUp: 0.6, gx: -0.2, gy: 0.3 }, mouth: { smile: -0.45, open: 0.14, shape: 'talk', width: 0.55 } },
  anxious: { shoulder: 0.6, brow: { inner: 1.15, furrow: 0.65, y: 0.2 }, eye: { open: 1.1, innerUp: 0.6, gx: 0.85, gy: 0.1, pupil: 0.8 }, mouth: { smile: -0.3, press: 1, tremble: 0.9, width: 0.85 }, sweat: 1 },
  scared: { shoulder: 0.9, hy: 0.5, brow: { inner: 1.25, y: 0.65, furrow: 0.3 }, eye: { open: 1.32, innerUp: 0.4, pupil: 0.7, iris: 0.9, gy: -0.1 }, mouth: { open: 0.62, shape: 'O', width: 0.6, smile: -0.25 }, sweat: 1, pale: 0.35 },
  terrified: { shoulder: 1.1, hy: 1.5, tilt: -0.06, brow: { inner: 1.55, y: 0.9, furrow: 0.6 }, eye: { open: 1.5, innerUp: 0.55, pupil: 0.45, iris: 0.8, gx: 0.15 }, mouth: { open: 0.85, shape: 'scream', width: 0.95, smile: -0.55, tremble: 0.8, lowerTeeth: 0.6, teeth: 0.6 }, sweat: 2, pale: 0.7 },
  shocked: { hy: -2, brow: { y: 1.3, inner: 0.3 }, eye: { open: 1.45, pupil: 0.6, iris: 0.85 }, mouth: { open: 0.95, shape: 'O', width: 0.66 }, pale: 0.3 },
  horrified: { shoulder: 0.9, hy: -1, tilt: 0.06, brow: { y: 1, inner: 1.5, furrow: 0.85 }, eye: { open: 1.5, innerUp: 0.5, pupil: 0.4, iris: 0.8, gy: 0.2 }, mouth: { open: 1.1, shape: 'scream', width: 1.1, smile: -0.85, teeth: 0.8, lowerTeeth: 0.9 }, sweat: 2, pale: 0.8 },
  disgusted: { tilt: -0.09, hx: -1.5, brow: { y: -0.45, furrow: 0.9, nearY: -0.3, farY: 0.15 }, eye: { open: 0.55, lower: 0.6, gx: 0.6, gy: 0.2, nearOpen: 0.85 }, mouth: { smileN: 0.05, smileF: -0.5, open: 0.36, shape: 'grimace', teeth: 1, width: 0.88, snarl: 1 }, noseWrinkle: 1 },
  angry: { pitch: 0.5, hy: 1, brow: { y: -0.8, furrow: 1.3, inner: -0.9 }, eye: { open: 1, angry: 1, pupil: 0.75 }, mouth: { smile: -0.6, open: 0.36, shape: 'grimace', teeth: 1, width: 0.95 }, blush: 0.2, noseWrinkle: 0.5 },
  determined: { pitch: 0.3, brow: { y: -0.4, furrow: 0.6, inner: -0.4 }, eye: { open: 0.9, lower: 0.2, angry: 0.35 }, mouth: { smile: -0.1, smileF: 0.12, press: 1, width: 0.95 } },
  sad: { pitch: 0.45, tilt: 0.06, brow: { inner: 1.1, y: -0.1, furrow: 0.35 }, eye: { open: 0.72, innerUp: 0.45, outerDown: 0.6, gy: 0.8, gx: -0.2, wet: 0.4 }, mouth: { smile: -0.6, press: 1 } },
  crying: { pitch: 0.5, tilt: -0.06, brow: { inner: 1.5, furrow: 0.7, y: 0.15 }, eye: { open: 0.45, lower: 0.4, innerUp: 0.5, wet: 1, gy: 0.45 }, mouth: { open: 0.55, shape: 'frown', smile: -0.9, tremble: 1, width: 1, teeth: 0.3 }, tears: 1, blush: 0.6 },
  exhausted: { shoulder: -0.9, pitch: 0.3, tilt: 0.07, brow: { inner: 0.4, y: -0.25 }, eye: { open: 0.42, gy: 0.4, outerDown: 0.4 }, mouth: { open: 0.2, shape: 'talk', width: 0.55, smile: -0.15 }, darkCircles: 1, pale: 0.25 },
  dissociated: { brow: { y: -0.15 }, eye: { open: 0.92, gx: 0.05, gy: 0.15, pupil: 0.7, noHi: true, diverge: 0.22 }, mouth: { smile: -0.05, open: 0.08, shape: 'talk', width: 0.5 }, pale: 0.45, darkCircles: 0.45 },
  devastated: { shoulder: -0.6, pitch: 0.55, tilt: 0.09, brow: { inner: 1.6, furrow: 0.6 }, eye: { open: 0.6, innerUp: 0.7, outerDown: 0.6, wet: 1, gy: 0.6 }, mouth: { open: 0.45, shape: 'frown', smile: -1, tremble: 0.9, width: 0.95 }, tears: 0.7, pale: 0.35 },
  relieved: { shoulder: -0.45, tilt: -0.07, hy: -1, brow: { inner: 0.6, y: 0.3 }, eye: { shut: 'soft' }, mouth: { open: 0.24, shape: 'talk', smile: 0.45, width: 0.85 }, blush: 0.2 },
  eyes_shut: { shoulder: 1.1, pitch: 0.45, hy: 1, brow: { y: -0.6, inner: 0.7, furrow: 1.1 }, eye: { shut: 'squeeze' }, mouth: { smile: -0.5, press: 1, tremble: 0.5, width: 0.8 }, noseWrinkle: 0.7, sweat: 1 },
  look_away: { pitch: 0.35, tilt: -0.07, hx: -1, brow: { inner: 0.6, furrow: 0.3 }, eye: { open: 0.72, gx: -1, gy: 0.75 }, mouth: { smile: -0.25, press: 1, bite: 1, width: 0.85 } },
};
