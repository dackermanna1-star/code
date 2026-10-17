// Marcus Webb — the quiet one. Tall, dark skin with rich warm shading, close-cropped hair under a black knit
// beanie, gentle eyes; olive M-65 field jacket (stand collar, epaulettes, snap storm flap) over a charcoal tee;
// headphones resting around his neck, cord running into the jacket.
import { PAL, mix } from './palette.js';
import { material, spline, rimLight } from './portraits_core.js';
import { stdMats } from './portraits_human.js';
import { drawSmudges } from './portraits_face.js';
import { hairVol, enrolledDarkSkin, stitch } from './portraits_parts.js';
import { hash2 } from './util.js';

const SKIN = ['#120606', '#2a1210', '#4a2418', mix(PAL.dskin_d, PAL.dskin, 0.55), mix(PAL.dskin, PAL.dskin_l, 0.75), mix(PAL.dskin_l, '#d0945e', 0.55)];
const SKIN_TONE = [0.2, 0.36, 0.55, 1.1];

export function darkPale(ramp, k) {
  if (k <= 0) return ramp;
  return ramp.map((c, i) => mix(c, mix(c, '#8a8078', 0.5), k * (i === 0 ? 0.2 : 0.7)));
}

export const MARCUS = {
  seed: 4409,
  shift: [0, -4],
  exprBase: { eye: { gx: -0.35 } },
  face: {
    cx: 46, yaw: 0.3,
    rows: [[20, 13, 14, 0], [25, 18, 18.5, 0], [32, 20.4, 21, 0], [40, 21.2, 22, 0], [49, 21, 22, 0], [55, 20.6, 21.4, 0.6],
      [61, 19.8, 20.4, 1.6], [66, 18.6, 18.8, 3], [70.5, 16.4, 16.6, 4.6], [74.5, 13, 14, 6.4], [77.4, 8.8, 11, 7.8], [79.4, 4, 8, 8.6]],
  },
  materials(E, o) {
    let skin = darkPale(SKIN, (E.pale || 0) * 0.8);
    if (o.enrolled) skin = enrolledDarkSkin(skin);
    return [
      material('skin', skin, { tone: SKIN_TONE, dither: 0.02, ditherT: [0.02, 0.035, 0.06, 0.008] }),
      material('blush', skin.map((c, i) => mix(c, '#a03a3a', i === 0 ? 0 : 0.16)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#2a1a2a', 0.3)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('dirt', skin.map((c) => mix(c, '#3a3430', 0.35)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('crop', skin.map((c, i) => mix(c, '#0a0808', 0.72 - i * 0.04)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('lip', ['#120606', '#2a1012', '#44201f', '#5c302c', '#764038', '#90564a'], { tone: SKIN_TONE, dither: 0, line: false }),
      material('lash', ['#050303', '#0a0706', '#120c0a', '#1a120e', '#241a14', '#30221a'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#050303', '#0c0807', '#140e0b', '#1e1510', '#2a1d16', '#38281e'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', o.enrolled ? ['#2a2620', '#463e34', '#625a4c', '#7e7462', '#988e7a', '#b0a690'] : ['#080403', '#140a06', '#24140c', '#382012', '#50321e', '#6c4830'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('irisGlass', ['#3a3226', '#5c4e38', '#7e6c4e', '#9c8a66', '#b8a680', '#d0c09c'], { tone: [0.15, 0.3, 0.55, 0.95], dither: 0, line: false, inner: false, flat: 0.6 }),
      material('beanie', ['#040406', '#0a0a0e', '#121218', '#1c1c24', '#282832', '#3a3a48'], { tone: [0.18, 0.42, 0.72, 1.06], dither: 0.015 }),
      material('olive', ['#0b0b07', '#17180e', '#252616', '#36381f', '#4a4c2b', '#64663c'], { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.015 }),
      material('tee', ['#08080a', '#121216', '#1c1c22', '#26262e', '#32323c', '#42424e'], { tone: [0.2, 0.42, 0.7, 1.0], dither: 0.01 }),
      material('phones', ['#050506', '#0c0c0e', '#16161a', '#222228', '#303038', '#4a4a56'], { tone: [0.16, 0.38, 0.66, 1.0], dither: 0, gloss: 0.35, glossAt: 0.97, glossW: 0.03 }),
      material('metal', ['#1e2024', '#3e4248', '#646a70', '#8c9298', '#b4b8bc', '#e2e4e4'], { tone: [0.16, 0.38, 0.66, 1.0], dither: 0, line: false }),
      material('snap', ['#1a1a14', '#34342a', '#56563e', '#767656', '#969672', '#b8b892'], { tone: [0.16, 0.38, 0.66, 1.0], dither: 0, line: false }),
      ...stdMats({ sclera: ['#2e2422', '#5a4a46', '#8c807a', '#b8aea4', '#d4ccc0', '#ebe6dc'], sweat: ['#140806', '#3a2016', '#6a4430', '#8e6448', '#b48a6a', '#e8d2c0'] }),
    ];
  },
  features() {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.43, y: 49.5, w: 10.2, hu: 3.4, hl: 2.4, ri: 3.3, rp: 1.4, irisW: 1, irisShiftN: -0.1, cIn: 0.4, cOut: 0.5, peak: 0.05, archPow: 2.2,
        lash: [1, 2, 2.4], flick: 0, crease: true, creaseGap: 1.3, lowerLine: 0.45, lowerOff: -1, irisDy: -0.1,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'irisGlass', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 42.8, uIn: 0.12, uPk: 0.46, uOut: 0.84, pkY: -0.8, outY: 1.1, w: [2.6, 2.3, 1.2], mat: 'brow', skinMat: 'skin', farW: 0.92 },
      nose: { y: 60.4, e: 4.3, tipW: 3.2, skinMat: 'skin', nearNostril: -1 },
      mouth: { y: 68, hw: 0.3, farK: 1, h: 5, fullLips: true, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: { y: 52.5, h: 11, w: 5.6, back: 4, far: true, near: true, farPoke: 2.2 },
      neck: { x: 47, yTop: 64, yBot: 98, wTop: 8, wBot: 9.4, lean: 1.6, z: 1 },
      blush: { u: 0.5, y: 59, rx: 3.6, ry: 1.7, mat: 'blush' },
      sweat: [[58, 39.5], [67, 59]],
      underMat: 'bruise',
      detailOn: ['blush', 'bruise', 'dirt', 'crop'],
    };
  },
  hairBack({ rig, sids }) {
    // back of the beanie
    rig.poly([[23, 36], [21, 26], [27, 16], [38, 10.5], [50, 10], [61, 13.5], [68, 21], [70.5, 32], [68, 40], [24, 42]], { mat: 'beanie', smooth: true, rim: 3, rimDepth: 3, z: hairVol(46, 44, 28, -12) });
  },
  bodyBack({ rig }) {
    // stand collar, inside back
    rig.poly([[33, 86], [36, 78], [47, 76], [58, 78], [62, 86], [61, 92], [34, 92]], { mat: 'olive', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -2 });
  },
  bodyFront(ctx) { marcusBody(ctx); },
  afterFace(ctx) { marcusCrop(ctx); },
  hairFront(ctx) { marcusBeanie(ctx); },
  post(d, rig, idx, light, lightName) { if (lightName === 'normal' || lightName === 'dawn') rimLight(d, rig, ['skin', 'crop'], '#8fa6c8', 0.3, 40); },
  grimeFace({ rig, face }, g) {
    const on = ['skin', 'blush', 'bruise', 'crop'];
    const c1 = face.proj(-0.5, 64), c2 = face.proj(0.45, 40);
    const list = [[c1[0], c1[1], 3, 1.8, 0.45]];
    if (g >= 2) list.push([c2[0], c2[1], 3, 1.5, 0.45]);
    drawSmudges(rig, list, { mat: 'dirt', on });
    if (g >= 2) {
      const a = face.proj(0.3, 70), b = face.proj(0.5, 72.5);
      rig.strokeH([[a[0], a[1]], [b[0], b[1]]], ['lip', 0], { onlyMat: on });
    }
  },
  grimeBody({ rig, r }, g) {
    for (let k = 0; k < g * 22; k++) {
      const x = Math.floor(r() * 96), y = 92 + Math.floor(r() * 28); const i = y * 96 + x;
      if (rig.mats[rig.mat[i]]?.name === 'olive') rig.setPix(i, 'olive', 1);
    }
  },
};

function marcusCrop({ rig, face }) {
  // close-cropped hair at temples & sideburns, under the beanie cuff: fine dark texture over skin
  const on = ['skin'];
  rig.paint([18, 30, 74, 58], (hx, hy, x, y, i) => {
    const L0 = face.local(hx, hy);
    const sideN = L0 ? L0.u < -0.84 : hx < 27;
    const sideF = L0 ? L0.u > 0.9 : false;
    if (!(sideN || sideF)) return null;
    const lim = sideN ? 49 - (L0 ? (-0.84 - L0.u) * 10 : 0) : 45;
    if (hy > lim) return null;
    return hash2(x, y, 3) % 5 === 0 ? ['crop', 1] : ['crop', 0];
  }, { onlyMat: on });
}

function marcusBeanie({ rig, sids, E }) {
  const zb = (x, y) => hairVol(46, 44, 28, 2.5)(...rig.toH(x, y));
  // crown (slightly slouchy at the back) + folded rib cuff
  const crown = [[24.5, 34], [22, 25], [27, 15.5], [37, 9.5], [49, 8.5], [60, 11.5], [67.5, 18.5], [70.5, 28], [69.5, 34.5], [60, 32], [46, 31], [33, 32]];
  const csid = rig.poly(crown, { mat: 'beanie', smooth: true, seg: 4, rim: 4, rimDepth: 3, z: zb });
  const cuff = [[23.5, 43], [22.5, 34.5], [33, 31.5], [46, 30.5], [60, 31.5], [70, 34.5], [70, 41.5], [60, 38.4], [46, 37.4], [33, 38.6]];
  const fsid = rig.poly(cuff, { mat: 'beanie', smooth: true, seg: 3, rim: 2.5, rimDepth: 2, z: (x, y) => zb(x, y) + 1.2 });
  sids.hair.add(csid); sids.hair.add(fsid);
  // vertical ribs on the cuff, faint knit rows on the crown
  rig.paint([18, 26, 76, 46], (hx, hy, x, y, i) => {
    if (rig.sid[i] === fsid) return x % 2 ? ['beanie', -1] : null;
    return null;
  });
  rig.paint([18, 6, 76, 36], (hx, hy, x, y, i) => (rig.sid[i] === csid && hash2(x, y, 11) % 9 === 0 ? ['beanie', -1] : null));
  rig.strokeH(spline([[23, 35], [33, 32], [46, 31], [60, 32], [70, 35]], { seg: 4 }), (t, x, y, i) => (rig.sid[i] === fsid ? ['beanie', -1] : null));
}

function marcusBody({ rig, E }) {
  const sh = E.shoulder || 0;
  const s = (y, k = 1) => y - sh * 3 * k;
  const torsoZ = (x) => 3 + 12 * Math.sqrt(Math.max(0, 1 - ((x - 48) / 64) ** 2));
  // charcoal tee at the open neck
  rig.poly([[36, s(86, 0.4)], [47, 89.5], [58, s(86, 0.4)], [60, 124], [34, 124]], { mat: 'tee', rim: 3, rimDepth: 3, z: (x) => torsoZ(x) - 2, edgeOpen: 1 });
  rig.strokeH(spline([[38, s(86.5, 0.3)], [42.5, 89], [47, 90], [52, 89], [56, s(86.5, 0.3)]], { seg: 3 }), ['tee', 1]);
  // jacket body (broad shoulders), front open at the neck, zipped lower
  const near = [[-6, s(100)], [3, s(94)], [15, s(89.5)], [27, s(86.5, 0.7)], [35, s(84.5, 0.4)], [38.5, 92], [42, 100], [45.5, 110], [46.5, 124], [-6, 124]];
  const far = [[59.5, s(84.5, 0.4)], [70, s(86.5, 0.7)], [82, s(90)], [93, s(95)], [102, s(99)], [102, 124], [46, 124], [47.2, 110], [50.5, 100], [55.5, 92]];
  rig.poly(near, { mat: 'olive', rim: 5, rimDepth: 5, z: torsoZ, edgeOpen: 1 });
  rig.poly(far, { mat: 'olive', rim: 5, rimDepth: 5, z: (x) => torsoZ(x) - 0.3, edgeOpen: 1 });
  // storm flap with snaps down the front
  rig.strokeH(spline([[42, 100], [45.5, 110], [46.6, 124]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['olive'] });
  for (const y of [106, 116]) { rig.dotH(43.2 + (y - 106) * 0.12, y, 'snap', 0); rig.dotH(43.2 + (y - 106) * 0.12, y - 1, 'snap', 1); }
  // stand collar halves (open), turned slightly outward
  const cN = [[35, s(84.5, 0.4)], [33.5, s(78, 0.3)], [36.5, 76.5], [39.5, 83], [40, 92], [38.5, 92]];
  const cF = [[59.5, s(84.5, 0.4)], [60.6, s(78, 0.3)], [57.8, 76.8], [55.4, 83], [55, 92], [56.2, 92]];
  rig.poly(cN, { mat: 'olive', rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 2.5 });
  rig.poly(cF, { mat: 'olive', rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 2 });
  stitch(rig, [[34.6, s(80, 0.3)], [37.5, 78.6]], ['olive'], { mat: 'olive', every: 2, off: -1 });
  // epaulettes along the shoulder tops
  for (const [a, b] of [[[33, s(86, 0.5)], [14, s(91)]], [[61, s(86, 0.5)], [80, s(90.5)]]]) {
    rig.strokeH(spline([a, b], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['olive'] });
    rig.strokeH(spline([[a[0], a[1] + 2.4], [b[0], b[1] + 2.4]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['olive'] });
    rig.strokeH(spline([[a[0], a[1] + 1.2], [b[0], b[1] + 1.2]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], 1], { onlyMat: ['olive'] });
  }
  // chest pocket flaps (cut off by the frame): seam, flap, shadowed lower edge, snap
  for (const [x0, x1, y0] of [[12, 28, 111.5], [64, 79, 111]]) {
    rig.strokeH([[x0, y0], [x1, y0 - 0.4]], (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['olive'] });
    rig.strokeH([[x0 + 0.5, y0 + 4], [x1 - 0.5, y0 + 3.6]], (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['olive'] });
    rig.strokeH([[x0 + 1, y0 + 5], [x1 - 1, y0 + 4.6]], (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['olive'] });
    rig.strokeH([[x0 + 1, y0 + 1], [x1 - 1, y0 + 0.6]], (t, x, y, i) => [rig.mat[i], 1], { onlyMat: ['olive'] });
    rig.dotH((x0 + x1) / 2, y0 + 3, 'snap', 0);
  }
  // headphones resting around the neck: band behind, cups on the collarbones, cord into the jacket
  rig.strokeH(spline([[35, s(84, 0.4)], [37, 82], [40, 81]], { seg: 3 }), ['metal', 0]);
  rig.strokeH(spline([[60, s(84, 0.4)], [58, 82], [55, 81]], { seg: 3 }), ['metal', 0]);
  const cup = (cx, cy, rx, ry, z) => {
    rig.ellipse(cx, cy, rx, ry, { mat: 'phones', rim: 2.2, rimDepth: 2.5, z: (x) => torsoZ(x) + z });
    // silver rim + darker foam pad centre
    const pts = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push([cx + Math.cos(a) * (rx - 0.6), cy + Math.sin(a) * (ry - 0.6)]); }
    rig.strokeH(pts, (t, x, y, i) => (rig.mats[rig.mat[i]].name === 'phones' ? ['metal', t > 0.45 && t < 0.95 ? 0 : -1] : null));
    rig.ellipse(cx + 0.3, cy - 0.2, rx * 0.45, ry * 0.42, { mat: 'phones', rim: 1, rimDepth: 0.8, z: (x) => torsoZ(x) + z + 1.5, off: -1 });
  };
  cup(33.5, s(90, 0.5), 5, 4.2, 4);
  cup(61.5, s(90, 0.5), 3.8, 3.8, 3.5);
  rig.strokeH(spline([[36, s(93, 0.4)], [38, 99], [39.5, 106], [40.5, 112]], { seg: 4 }), (t, x, y, i) => (rig.mats[rig.mat[i]].name === 'olive' || rig.mats[rig.mat[i]].name === 'tee' ? ['phones', 1] : null));
}

export const MARCUS_EXPR = {
  neutral: { eye: { open: 0.86 }, mouth: { smile: 0.02 } },
  soft_smile: { tilt: 0.04, brow: { inner: 0.2, y: 0.15 }, eye: { open: 0.78, lower: 0.45 }, mouth: { smile: 0.55, width: 1.02 } },
  talk: { brow: { y: 0.15 }, eye: { open: 0.9 }, mouth: { open: 0.5, shape: 'talk', width: 0.8 } },
  thoughtful: { pitch: 0.3, tilt: 0.06, brow: { furrow: 0.45, inner: 0.3, nearY: -0.1 }, eye: { open: 0.62, gx: -0.9, gy: 0.65 }, mouth: { smile: -0.1, smileF: 0.06, press: 1, width: 0.88 } },
  worried: { brow: { inner: 1.2, furrow: 0.6, y: 0.1 }, eye: { open: 0.98, innerUp: 0.5, gy: 0.25, gx: -0.1 }, mouth: { smile: -0.42, press: 1 } },
  scared: { shoulder: 0.8, brow: { inner: 1.3, y: 0.75, furrow: 0.35 }, eye: { open: 1.35, pupil: 0.58, iris: 0.88 }, mouth: { open: 0.66, shape: 'O', width: 0.62, smile: -0.2 }, sweat: 1, pale: 0.3 },
  urgent: { shoulder: 0.45, pitch: 0.2, hx: 1.5, brow: { y: 0.3, furrow: 1.1, inner: 0.5 }, eye: { open: 1.18, pupil: 0.78 }, mouth: { open: 0.8, shape: 'talk', width: 1.0, smile: -0.25 } },
  sad: { pitch: 0.45, tilt: 0.06, brow: { inner: 1.1, furrow: 0.35 }, eye: { open: 0.64, outerDown: 0.6, innerUp: 0.35, gy: 0.75, wet: 0.4 }, mouth: { smile: -0.55, press: 1 } },
  grief: { pitch: 0.55, tilt: -0.06, shoulder: -0.3, brow: { inner: 1.5, furrow: 0.8 }, eye: { open: 0.36, lower: 0.38, innerUp: 0.5, wet: 1, gy: 0.4 }, mouth: { open: 0.5, shape: 'frown', smile: -0.9, tremble: 1, width: 0.98 }, tears: 1 },
  determined: { pitch: 0.28, brow: { y: -0.45, furrow: 0.7, inner: -0.4 }, eye: { open: 0.88, lower: 0.2, angry: 0.35 }, mouth: { smile: -0.1, press: 1, width: 0.95 } },
  relieved: { shoulder: -0.45, tilt: -0.06, hy: -0.5, brow: { inner: 0.55, y: 0.25 }, eye: { shut: 'soft' }, mouth: { open: 0.24, shape: 'talk', smile: 0.5, width: 0.88 } },
  entranced: { __enr: true, tilt: 0.05, brow: { y: -0.12 }, eye: { open: 0.76, glassy: 1, gx: 0, gy: 0.15, diverge: 0.12 }, mouth: { open: 0.15, shape: 'talk', width: 0.55, smile: -0.04 }, pale: 0.25 },
};
