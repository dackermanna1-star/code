// Danny Kovach — stocky class clown. Backwards red snapback (hair poking through the strap hole, brim behind
// the head), short brown hair, broad grin, thick neck; satin Eagles Starter jacket (midnight green / silver /
// white) with a striped knit collar; backpack strap over the near shoulder.
import { PAL, mix, darken } from './palette.js';
import { material, spline } from './portraits_core.js';
import { stdMats, paleRamp } from './portraits_human.js';
import { drawSmudges } from './portraits_face.js';
import { L, strand, hairVol, enrolledSkin, stitch } from './portraits_parts.js';

const SKIN = ['#4a1a18', mix(PAL.skin_dd, PAL.skin_d, 0.5), mix(mix(PAL.skin_d, PAL.skin, 0.5), '#c45a50', 0.2),
  mix(PAL.skin, PAL.skin_l, 0.22), mix(PAL.skin_l, PAL.white, 0.08), mix(PAL.skin_l, PAL.white, 0.45)];
const HAIR = ['#120a06', '#24160c', PAL.hair_b, mix(PAL.hair_b, PAL.hair_b_l, 0.6), mix(PAL.hair_b_l, PAL.tan, 0.35), mix(PAL.tan, PAL.tan_l, 0.4)];
const GREEN = ['#03090a', '#081719', '#0f2528', '#173538', '#22494b', '#4a7a78']; // midnight green satin
const SKIN_TONE = [0.2, 0.38, 0.55, 1.06];

export const DANNY = {
  seed: 2207,
  shift: [1, 1],
  exprBase: { eye: { gx: -0.4 } },
  face: {
    cx: 46, yaw: 0.3,
    rows: [[22, 13.5, 14.5, 0], [27, 18.5, 19, 0], [34, 21, 21.5, 0], [42, 22, 22.5, 0], [50, 22, 22.5, 0], [57, 21.6, 21.8, 0.6],
      [63, 20.6, 20.6, 1.6], [67.5, 19.4, 19.2, 3], [71.5, 17.2, 17.2, 4.6], [75, 13.4, 14.4, 6.4], [77.6, 8.8, 11.4, 7.8], [79.4, 4.6, 8.4, 8.6]],
  },
  materials(E, o) {
    let skin = paleRamp(SKIN, (E.pale || 0) * 0.9, '#d4d0cc');
    if (o.enrolled) skin = enrolledSkin(skin, o.half ? 0.55 : 1);
    const hair = o.enrolled ? HAIR.map((c) => mix(c, '#6a6058', 0.2)) : HAIR;
    return [
      material('skin', skin, { tone: SKIN_TONE, dither: 0.012 }),
      material('blush', skin.map((c, i) => mix(c, '#d85a54', i === 0 ? 0 : 0.2)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#6a4a6e', 0.35)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('dirt', skin.map((c) => mix(c, '#5a4a3e', 0.42)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('stubble', skin.map((c) => mix(c, '#5a4a48', 0.16)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('lip', ['#3e1418', '#5e2228', '#86403e', '#a8645a', '#c4826e', '#d89e88'], { tone: SKIN_TONE, dither: 0, line: false }),
      material('lash', ['#0e0806', '#1c110a', '#2e1c10', '#3e2816', '#52361e', '#684628'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#0e0805', '#1e130b', '#2e1e12', '#3e2a18', '#503820', '#64482a'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', o.enrolled && !o.half ? ['#2a2620', '#463e34', '#625a4c', '#7e7462', '#988e7a', '#b0a690'] : ['#0e0805', '#20120a', '#382010', '#52321a', '#704a2a', '#8e643c'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('irisGlass', ['#3a3226', '#5c4e38', '#7e6c4e', '#9c8a66', '#b8a680', '#d0c09c'], { tone: [0.15, 0.3, 0.55, 0.95], dither: 0, line: false, inner: false, flat: 0.6 }),
      material('hair', hair, { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.02, spec: 0.3, specAt: 0.9, specW: 0.07 }),
      material('cap', ['#22080a', '#40100f', '#5e1a18', '#7c2622', '#963630', '#ae4c42'], { tone: [0.16, 0.38, 0.64, 1.0], dither: 0.015 }),
      material('capUnder', ['#0c100c', '#162016', '#203022', '#2c3e2c', '#3a4e38', '#4c6248'], { tone: [0.16, 0.38, 0.64, 1.0], dither: 0 }),
      material('strap', ['#08080a', '#121216', '#1c1c22', '#282830', '#36363f', '#4a4a54'], { tone: [0.2, 0.42, 0.7, 1.0], dither: 0, gloss: 0.15 }),
      material('satin', GREEN, { tone: [0.15, 0.36, 0.62, 1.0], dither: 0.015, gloss: 0.55, glossAt: 0.99, glossW: 0.025 }),
      material('knitW', ['#3a3c40', '#6c6e70', '#a0a2a2', '#cfcfcc', '#e8e6e0', '#f6f4ee'], { tone: [0.15, 0.36, 0.62, 0.98], dither: 0 }),
      material('knitS', ['#26282c', '#44474c', '#686c70', '#8c9094', '#a8acae', '#c4c6c6'], { tone: [0.15, 0.36, 0.62, 0.98], dither: 0, gloss: 0.2 }),
      material('knitG', GREEN, { tone: [0.15, 0.36, 0.62, 0.98], dither: 0 }),
      material('snap', ['#2a2c30', '#4e5258', '#7c8086', '#a6aaae', '#cfd2d4', '#f2f2f0'], { tone: [0.15, 0.36, 0.62, 0.98], dither: 0, line: false }),
      material('pack', ['#0a0c0e', '#14181c', '#1e2428', '#283036', '#343e44', '#465258'], { tone: [0.2, 0.42, 0.7, 1.0], dither: 0.01 }),
      ...stdMats(),
    ];
  },
  features() {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.42, y: 50.5, w: 10, hu: 3.5, hl: 2.4, ri: 3.2, rp: 1.35, irisW: 1, irisShiftN: -0.6, cIn: 0.5, cOut: 0.1, peak: -0.1, archPow: 2.2,
        lash: [1, 1, 2], flick: 0, crease: true, creaseGap: 1.2, lowerLine: 0.45, irisDy: -0.3,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'irisGlass', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 43.4, uIn: 0.12, uPk: 0.45, uOut: 0.85, pkY: -0.7, outY: 0.6, w: [2.8, 2.6, 1.5], mat: 'brow', skinMat: 'skin', farW: 0.92 },
      nose: { y: 61.2, e: 4.9, tipW: 2.9, skinMat: 'skin' },
      mouth: { y: 68.8, hw: 0.31, farK: 1, h: 5.5, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: { y: 54, h: 11.5, w: 6.4, back: 4, far: true, near: true, farPoke: 2 },
      neck: { x: 47, yTop: 66, yBot: 96, wTop: 9, wBot: 10.5, lean: 1.5, z: 1 },
      blush: { u: 0.5, y: 60, rx: 3.8, ry: 1.8, mat: 'blush' },
      sweat: [[57, 34.5], [67, 60]],
      underMat: 'bruise',
      detailOn: ['blush', 'bruise', 'dirt', 'stubble'],
      browOn: ['hair'],
    };
  },
  hairBack({ rig, sids }) {
    const zb = hairVol(46, 46, 28, -14);
    // nape / back of head under the cap
    sids.hair.add(rig.poly([[22, 30], [20, 40], [21, 52], [24, 62], [30, 66], [62, 64], [69, 52], [70, 38], [66, 28]], { mat: 'hair', smooth: true, rim: 2, rimDepth: 2, z: zb }));
  },
  bodyBack({ rig }) {
    // knit collar, back half (behind the neck)
    rig.poly([[32, 88], [36, 82], [47, 79.5], [58, 82], [63, 87], [62, 92], [33, 92]], { mat: 'knitG', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -1 });
  },
  bodyFront(ctx) { dannyBody(ctx); },
  hairFront(ctx) { dannyHair(ctx); },
  grimeFace({ rig, face }, g) {
    const on = ['skin', 'blush', 'stubble'];
    const c1 = face.proj(0.55, 63), c2 = face.proj(-0.3, 40);
    const list = [[c1[0], c1[1], 3, 1.8, 0.5]];
    if (g >= 2) list.push([c2[0], c2[1], 3.2, 1.6, 0.45]);
    drawSmudges(rig, list, { mat: 'dirt', on });
    if (g >= 2) {
      const a = face.proj(-0.62, 57), b = face.proj(-0.5, 61);
      rig.strokeH([[a[0], a[1]], [b[0], b[1]]], ['lip', -1], { onlyMat: on });
    }
  },
  grimeBody({ rig, r }, g) {
    for (let k = 0; k < g * 18; k++) {
      const x = Math.floor(r() * 96), y = 96 + Math.floor(r() * 24); const i = y * 96 + x;
      if (rig.mats[rig.mat[i]]?.name === 'satin') rig.setPix(i, 'satin', 1);
    }
  },
};

function dannyBody({ rig, E }) {
  const sh = E.shoulder || 0;
  const s = (y, k = 1) => y - sh * 3 * k;
  const torsoZ = (x) => 4 + 12 * Math.sqrt(Math.max(0, 1 - ((x - 48) / 62) ** 2));
  // puffy satin body, snapped closed
  rig.poly([[-6, s(101)], [2, s(95.5)], [13, s(91)], [25, s(88, 0.7)], [34, s(86, 0.4)], [61, s(86, 0.4)], [72, s(88, 0.7)], [84, s(91.5)], [94, s(96)], [102, s(100)], [102, 124], [-6, 124]],
    { mat: 'satin', smooth: true, seg: 3, rim: 6, rimDepth: 6, z: torsoZ, edgeOpen: 1 });
  // sleeve / shoulder seams (raglan-ish) with a puffy fold
  rig.strokeH(spline([[22, s(89, 0.7)], [18, 100], [16, 112], [15, 124]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['satin'] });
  rig.strokeH(spline([[73, s(89, 0.7)], [77, 100], [79, 112], [80, 124]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['satin'] });
  // satin folds: crease (dark) + ridge (light) pairs
  const fold = (pts, k = 1) => {
    rig.strokeH(spline(pts, { seg: 4 }), (t, x, y, i) => (t > 0.08 && t < 0.92 ? [rig.mat[i], -k] : null), { onlyMat: ['satin'] });
    rig.strokeH(spline(pts.map(([x, y]) => [x + 0.8, y - 1]), { seg: 4 }), (t, x, y, i) => (t > 0.15 && t < 0.85 ? [rig.mat[i], 1] : null), { onlyMat: ['satin'] });
  };
  fold([[8, 110], [16, 106], [24, 104.5]]);
  fold([[36, 108], [41, 113], [44, 120]]);
  fold([[60, 101], [64, 110], [63, 119]]);
  fold([[84, 104], [90, 110], [95, 113]]);
  // placket + snaps
  rig.strokeH(spline([[49.5, 96], [50.2, 108], [50.6, 124]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['satin'] });
  for (const y of [103, 112, 121]) { rig.dotH(51.6, y, 'snap', 0); rig.dotH(52.6, y, 'snap', -1); rig.dotH(51.6, y - 1, 'snap', 1); }
  // tiny silver wing logo on the far chest
  const wing = [[64, 107], [69, 104.5], [74, 104], [71, 105.8], [73.5, 106], [69.5, 107.4], [66, 108]];
  rig.poly(wing, { mat: 'knitS', rim: 0, z: (x) => torsoZ(x) + 0.5 });
  rig.strokeH([[65, 107.5], [70, 105.5]], ['knitW', 0]);
  // knit collar front: two halves meeting in a V at the throat, striped green / white / silver
  const nearC = [[32.5, s(86, 0.4)], [38, 89], [44, 93], [48.6, 97.5], [49.6, 93], [45, 89.4], [39.5, 85.6], [35.5, 83]];
  const farC = [[61.5, s(86, 0.4)], [57.5, 89], [53.5, 93], [50.6, 97.5], [49.8, 93], [53.2, 89.2], [57.2, 85.4], [59.5, 83]];
  for (const [poly, edge] of [[nearC, [[32.5, s(86, 0.4)], [38, 89], [44, 93], [48.6, 97.5]]], [farC, [[61.5, s(86, 0.4)], [57.5, 89], [53.5, 93], [50.6, 97.5]]]]) {
    const sid = rig.poly(poly, { mat: 'knitG', rim: 1.6, rimDepth: 1.6, z: (x) => torsoZ(x) + 2.5 });
    const pl = spline(edge, { seg: 4 });
    rig.paint([28, 78, 66, 100], (hx, hy, x, y, i) => {
      if (rig.sid[i] !== sid) return null;
      let best = 99; for (let k = 0; k < pl.length - 1; k++) best = Math.min(best, segDist(hx, hy, pl[k], pl[k + 1]));
      const b = Math.floor(best);
      return b === 1 ? ['knitW', 0] : b === 3 ? ['knitS', 0] : null;
    });
  }
  // backpack strap over the near shoulder
  rig.poly([[22, s(89, 0.7)], [28, s(88, 0.6)], [31, 104], [33, 124], [26, 124], [24.5, 104]], { mat: 'pack', rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 2, edgeOpen: 1 });
  stitch(rig, [[26.8, s(90, 0.7)], [28.5, 104], [29.5, 122]], ['pack'], { mat: 'pack', every: 3, off: 2 });
  for (const [x, y] of [[26, 109], [27, 109], [28, 109], [29, 109], [30, 109]]) rig.dotH(x, y, 'snap', -1);
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  let t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
}

function dannyHair({ rig, sids, o, face }) {
  const zh = hairVol(46, 46, 28, -2);
  const g = o.grime || 0;
  // short hair below the cap: near sideburn / around the ear, far temple, a tuft through the snap hole
  L(rig, sids, [[26, 36], [23.5, 42], [23, 48], [24, 53]], 5, 5, 2, { z: zh, depth: 1.6, clip: (i) => !sids.ears.has(rig.sid[i]) });
  L(rig, sids, [[22, 37], [19.5, 45], [20, 54], [22.5, 61]], 4.5, 5, 2.4, { z: hairVol(46, 46, 28, -5), depth: 1.6, clip: (i) => !sids.ears.has(rig.sid[i]) });
  L(rig, sids, [[67, 35], [68.5, 41], [68.4, 47], [67, 52]], 4, 4, 1.6, { z: zh, depth: 1.4 });
  // cap: dome + band + backwards brim
  const zc = (x, y) => { const [hx, hy] = rig.toH(x, y); return hairVol(46, 46, 28, 2)(hx, hy) + 2; };
  const capPts = [[25, 38.5], [30, 34], [38, 31], [47, 30], [56, 31], [63, 33.5], [68, 37.5], [70, 30], [68.5, 22], [63, 15.5], [55, 11.5], [46, 10.5], [37, 11.5], [29, 15.5], [23.5, 21], [20.5, 28], [20, 34], [21.5, 40]];
  const capSid = rig.poly(capPts, { mat: 'cap', smooth: true, seg: 4, rim: 4, rimDepth: 3, z: zc });
  // snapback opening with a hair tuft + strap
  const hole = [[46.5, 30.5], [47.2, 26.5], [50, 24.2], [53.2, 25], [55, 28], [55.5, 31]];
  rig.poly(hole, { mat: 'hair', smooth: true, seg: 3, rim: 1.5, rimDepth: 1, z: (x, y) => zc(x, y) - 1.5 });
  rig.strokeH(spline([[47.5, 29.6], [51, 29.2], [55, 30]], { seg: 3 }), ['strap', 0]);
  rig.strokeH(spline([[47.3, 30.6], [51, 30.3], [55.3, 31]], { seg: 3 }), ['strap', -1]);
  for (const x of [49, 51, 53]) rig.dotH(x, 29.4, 'snap', 0);
  // panel seams + top button
  for (const seam of [[[46.5, 11], [49, 18], [50, 24]], [[46.5, 11], [37, 20], [31.5, 32]], [[46.5, 11], [58, 19], [63.5, 32]]]) {
    rig.strokeH(spline(seam, { seg: 4 }), (t, x, y, i) => (rig.sid[i] === capSid ? ['cap', -1] : null));
  }
  rig.ellipse(46.5, 10.6, 1.6, 1.1, { mat: 'cap', rim: 1, rimDepth: 0.6, z: (x, y) => zc(x, y) + 1.5 });
  // brim sticking out behind the head
  rig.poly([[23.5, 26], [14, 27], [7, 30], [5.8, 33], [9.5, 35.2], [16, 35.6], [23.5, 36]], { mat: 'cap', smooth: true, seg: 3, rim: 2, rimDepth: 1.5, z: (x, y) => zc(x, y) - 4 });
  rig.strokeH(spline([[22.5, 35.4], [15, 35.2], [8.5, 34.4], [6.2, 32.6]], { seg: 3 }), ['capUnder', 0]);
  // strays poking out under the band
  strand(rig, [[31.5, 33], [30, 36.2], [30.6, 38.6]], 'hair', 0, false);
  strand(rig, [[61.5, 33], [63, 36], [62.2, 38.4]], 'hair', 0, false);
  if (g >= 1) strand(rig, [[50.5, 25], [52.5, 21.5], [55.5, 20.5]], 'hair', 1, false);
  if (g >= 2) { strand(rig, [[24.5, 38], [21, 36.5], [18, 38]], 'hair', 0, false); strand(rig, [[44, 31], [42.2, 34], [42.8, 36.4]], 'hair', 0); }
}

export const DANNY_EXPR = {
  neutral: { brow: { y: 0.12 }, eye: { open: 0.95, lower: 0.15 }, mouth: { smile: 0.28, smileF: 0.15 } },
  grin: { tilt: -0.05, brow: { y: 0.4, inner: 0.1 }, eye: { open: 0.8, lower: 0.62 }, mouth: { open: 0.55, shape: 'grin', smile: 0.85, width: 1.15, teeth: 1 }, cheek: 1, blush: 0.15 },
  laugh: { tilt: -0.09, hy: -1.5, brow: { y: 0.55 }, eye: { shut: 'happy' }, mouth: { open: 1.1, shape: 'laugh', smile: 0.7, width: 1.25, teeth: 1 }, cheek: 1, blush: 0.35 },
  talk: { brow: { y: 0.25 }, eye: { open: 0.98, lower: 0.1 }, mouth: { open: 0.55, shape: 'talk', smile: 0.2, width: 0.85 } },
  smug: { tilt: -0.07, hy: -0.5, brow: { farY: 0.55, nearY: -0.1 }, eye: { open: 0.62, lower: 0.35, gx: -0.5 }, mouth: { smileF: 0.8, smileN: 0.05, dx: 0.03 } },
  nervous: { shoulder: 0.45, brow: { inner: 0.95, furrow: 0.35, y: 0.2 }, eye: { open: 1.05, innerUp: 0.45, gx: 0.75 }, mouth: { open: 0.3, shape: 'grin', smile: 0.5, teeth: 1, width: 1.05, tremble: 0.45 }, sweat: 1 },
  scared: { shoulder: 0.8, brow: { inner: 1.2, y: 0.7, furrow: 0.3 }, eye: { open: 1.32, pupil: 0.6, iris: 0.9 }, mouth: { open: 0.68, shape: 'O', width: 0.65, smile: -0.2 }, sweat: 1, pale: 0.35 },
  sad: { pitch: 0.4, tilt: 0.05, brow: { inner: 1.05, furrow: 0.3 }, eye: { open: 0.68, outerDown: 0.5, gy: 0.7, wet: 0.3, innerUp: 0.3 }, mouth: { smile: -0.5, press: 1 } },
  serious: { pitch: 0.12, brow: { y: -0.3, furrow: 0.45, inner: -0.15 }, eye: { open: 0.88 }, mouth: { smile: -0.1, press: 1, width: 0.95 } },
  relieved: { shoulder: -0.4, tilt: -0.06, hy: -0.5, brow: { inner: 0.55, y: 0.3 }, eye: { shut: 'soft' }, mouth: { open: 0.3, shape: 'talk', smile: 0.5, width: 0.95 }, blush: 0.15 },
  entranced: { __enr: true, tilt: 0.05, brow: { y: -0.12 }, eye: { open: 0.78, glassy: 1, gx: 0, gy: 0.15, diverge: 0.12 }, mouth: { open: 0.16, shape: 'talk', width: 0.55, smile: -0.05 }, pale: 0.3 },
  flicker: { __enr: 'half', tilt: 0.03, brow: { inner: 0.8, furrow: 0.45, farY: -0.1 }, eye: { open: 0.9, farGlassy: 1, farOpen: 0.82, gx: -0.2 }, mouth: { open: 0.26, shape: 'grin', smile: 0.45, smileF: -0.15, teeth: 1, width: 1, tremble: 0.6 }, sweat: 1, pale: 0.25 },
};
