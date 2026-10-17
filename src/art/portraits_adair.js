// Miss Ruth Adair (1979) — the Reflection. Only ever seen in glass: brown hair pinned up in a twist, cat-eye
// glasses, mustard cardigan over a pointed-collar blouse. The post pass renders her "through a mirror":
// cooler, desaturated, lifted blacks, reflection streaks, a faint back-surface double image, dissolving edges.
import { PAL, mix } from './palette.js';
import { material, spline, PW, PH, bay, clamp, lerp } from './portraits_core.js';
import { stdMats, paleRamp } from './portraits_human.js';
import { L, strand, hairVol } from './portraits_parts.js';
import { hash2 } from './util.js';

const SKIN = ['#3e1e24', mix(PAL.skin_dd, PAL.skin_d, 0.55), mix(mix(PAL.skin_d, PAL.skin, 0.5), '#b46060', 0.12),
  mix(PAL.skin, PAL.skin_l, 0.3), mix(PAL.skin_l, PAL.white, 0.12), mix(PAL.skin_l, PAL.white, 0.45)];
const HAIR = ['#120a06', '#22140c', '#352014', PAL.hair_b_l, mix(PAL.hair_b_l, PAL.tan, 0.45), mix(PAL.tan, PAL.tan_l, 0.5)];
const SKIN_TONE = [0.2, 0.38, 0.55, 1.06];

export const ADAIR = {
  seed: 1979,
  shift: [-1, 0],
  defaultExpr: 'sad',
  exprBase: { eye: { gx: -0.35 }, darkCircles: 0.35 },
  face: {
    cx: 46, yaw: 0.3,
    rows: [[20, 12.5, 14, 0], [25, 17.4, 18.5, 0], [32, 19.6, 21, 0], [40, 20.4, 22, 0], [49, 20.2, 22, 0], [55, 19.8, 21, 0.6],
      [61, 18.2, 19.8, 1.8], [66, 15.4, 18.2, 3.4], [70.5, 12, 15.6, 5.4], [74.2, 8.4, 12.8, 7.2], [77, 4.8, 9.8, 8.4], [79, 1.8, 7, 8.8]],
  },
  materials(E, o) {
    const skin = paleRamp(SKIN, (E.pale || 0) * 0.9, '#d0ccd0');
    return [
      material('skin', skin, { tone: SKIN_TONE, dither: 0.02, ditherT: [0.02, 0.035, 0.06, 0.008] }),
      material('blush', skin.map((c, i) => mix(c, '#d06a6a', i === 0 ? 0 : 0.16)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('bruise', skin.map((c) => mix(c, '#6a4a6e', 0.3)), { tone: SKIN_TONE, dither: 0, line: false }),
      material('lip', ['#3a1418', '#5a2226', '#844040', '#a85e5a', '#c27a70', '#d6968a'], { tone: SKIN_TONE, dither: 0, line: false }),
      material('lash', ['#0a0605', '#160e0a', '#24160e', '#322014', '#422c1c', '#543a26'], { tone: [0.6, 1.2, 1.6, 2], dither: 0, line: false, inner: false }),
      material('brow', ['#0c0705', '#1a100a', '#2a1a10', '#3a2618', '#4c3420', '#60442c'], { tone: [0.25, 0.5, 0.8, 1.1], dither: 0, line: false, inner: false }),
      material('iris', ['#0c0a06', '#1c160c', '#302614', '#463a20', '#5e5030', '#7a6a44'], { tone: [0.2, 0.45, 0.85, 1.2], dither: 0, line: false, inner: false, flat: 0.5 }),
      material('hair', HAIR, { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.02, spec: 0.4, specAt: 0.9, specW: 0.06 }),
      material('frame', ['#0a0605', '#180e08', '#2a180e', '#3e2616', '#563820', '#704c2e'], { tone: [0.16, 0.38, 0.66, 1.0], dither: 0, line: false, inner: false, gloss: 0.3 }),
      material('cardigan', ['#1a1408', '#30260e', '#4a3c18', '#665424', '#806c32', '#9a8646'], { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.015 }),
      material('blouse', ['#2e2b26', '#57524a', '#837c6e', '#aaa290', '#c6bea8', '#ddd6c2'], { tone: [0.16, 0.38, 0.66, 1.02], dither: 0.01 }),
      material('button', ['#1a120e', '#2e2018', '#463224', '#5e4632', '#7a5e44', '#94785a'], { dither: 0, line: false }),
      material('chain', ['#2a2410', '#4a401c', '#6e5e2a', '#94803c', '#b8a052', '#d6c070'], { dither: 0, line: false, inner: false }),
      ...stdMats(),
    ];
  },
  features() {
    return {
      skinMat: 'skin',
      eye: {
        uc: 0.43, y: 49.5, w: 10.2, hu: 3.3, hl: 2.3, ri: 3.1, rp: 1.3, irisW: 1, irisShiftN: -0.1, cIn: 0.6, cOut: 0.1, peak: 0.05, archPow: 2.2,
        lash: [1, 2, 2], flick: 1, flickRise: 1.8, crease: true, creaseGap: 1.5, lowerLine: 0.55, irisDy: -0.2,
        skinMat: 'skin', lashMat: 'lash', irisMat: 'iris', irisGlassMat: 'iris', scleraMat: 'sclera', pupilMat: 'pupil', glintMat: 'glint',
      },
      brow: { y: 42.4, uIn: 0.13, uPk: 0.52, uOut: 0.84, pkY: -1.5, outY: 0.8, w: [1.8, 1.6, 0.8], mat: 'brow', skinMat: 'skin', farW: 0.9 },
      nose: { y: 60.4, e: 4.4, tipW: 2.3, skinMat: 'skin' },
      mouth: { y: 67.8, hw: 0.26, farK: 1, h: 4.8, lipMat: 'lip', skinMat: 'skin', mouthMat: 'mouth', teethMat: 'teeth', tongueMat: 'tongue' },
      ear: { y: 52.5, h: 10.5, w: 5.2, back: 4, far: false, near: true },
      neck: { x: 46, yTop: 64, yBot: 98, wTop: 6.2, wBot: 7.2, lean: 1.8, z: 1 },
      blush: { u: 0.5, y: 59, rx: 3.4, ry: 1.6, mat: 'blush' },
      sweat: [[58, 37], [66, 60]],
      underMat: 'bruise',
      detailOn: ['blush', 'bruise'],
    };
  },
  hairBack({ rig, sids }) {
    const zb = hairVol(45, 44, 28, -12);
    // the twist / bun at the back of the head
    sids.hair.add(rig.poly([[30, 16], [22, 19], [16.5, 26], [16, 34], [19.5, 41], [26, 44], [30, 40]], { mat: 'hair', smooth: true, rim: 4, rimDepth: 4, z: zb }));
    rig.strokeH(spline([[27, 18.5], [21, 23], [19, 30], [21, 37], [26, 41]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], -1], { onlyMat: ['hair'] });
    rig.strokeH(spline([[24, 22], [20.5, 29], [22.5, 36]], { seg: 4 }), (t, x, y, i) => [rig.mat[i], 1], { onlyMat: ['hair'] });
    // bobby pins holding the twist
    rig.strokeH([[22.5, 25], [25.5, 27]], ['chain', 1], { onlyMat: ['hair'] });
    rig.strokeH([[20.5, 33], [23.5, 33.6]], ['chain', 0], { onlyMat: ['hair'] });
  },
  bodyBack({ rig }) {
    rig.poly([[33, 88], [37, 83], [46, 81.5], [56, 83], [61, 88], [60, 94], [34, 94]], { mat: 'cardigan', smooth: true, rim: 2, rimDepth: 2, z: 0, off: -1 });
  },
  bodyFront(ctx) { adairBody(ctx); },
  faceExtra(ctx) { adairGlasses(ctx); },
  hairFront(ctx) { adairHair(ctx); },
  foreground(ctx) { if (ctx.E.point) adairHand(ctx); },
  post(d, rig, idx, light) { glassPost(d, rig); },
};

function adairBody({ rig, E }) {
  const sh = E.shoulder || 0;
  const s = (y, k = 1) => y - sh * 3 * k;
  const torsoZ = (x) => 3 + 11 * Math.sqrt(Math.max(0, 1 - ((x - 46) / 60) ** 2));
  rig.poly([[34, s(89, 0.4)], [40, 88], [46, 95], [52, 88], [58, s(89, 0.4)], [58, 124], [34, 124]], { mat: 'blouse', rim: 3, rimDepth: 3, z: (x) => torsoZ(x) - 2.5, edgeOpen: 1 });
  const near = [[-6, s(104)], [3, s(98)], [14, s(93.5)], [25, s(90, 0.7)], [33.5, s(88, 0.4)], [36.5, 96], [39.5, 106], [42, 115], [43, 124], [-6, 124]];
  const far = [[59, s(88, 0.4)], [68, s(90, 0.7)], [80, s(93.5)], [90, s(98)], [102, s(103)], [102, 124], [50, 124], [51.5, 115], [54, 106], [56.5, 96]];
  const kn = rig.poly(near, { mat: 'cardigan', rim: 5, rimDepth: 5, z: torsoZ, edgeOpen: 1 });
  const kf = rig.poly(far, { mat: 'cardigan', rim: 5, rimDepth: 5, z: (x) => torsoZ(x) - 0.4, edgeOpen: 1 });
  rig.paint([-6, 84, 102, 124], (hx, hy, x, y, i) => ((rig.sid[i] === kn || rig.sid[i] === kf) && hash2(x, y, 5) % 19 === 0 ? ['cardigan', -1] : null));
  for (const y of [104, 113, 122]) { rig.dotH(38.6 + (y - 104) * 0.2, y, 'button', 2); rig.dotH(38.6 + (y - 104) * 0.2, y + 1, 'button', 0); }
  // big pointed 70s blouse collar over the cardigan
  const cN = [[34, s(87, 0.4)], [39, 89], [45, 95], [44, 98], [37, 104], [35.5, 97], [33, s(90, 0.4)]];
  const cF = [[58, s(87, 0.4)], [53.5, 89], [47.5, 95], [48.5, 97.5], [55, 102], [56.5, 96], [59, s(90, 0.4)]];
  rig.poly(cN, { mat: 'blouse', rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 2 });
  rig.poly(cF, { mat: 'blouse', rim: 2, rimDepth: 2, z: (x) => torsoZ(x) + 1.8 });
  // thin chain
  rig.strokeH(spline([[39, 92], [43, 99], [46.5, 102.5], [50, 99], [53, 92]], { seg: 4 }), (t, x, y, i) => (rig.mats[rig.mat[i]].name === 'blouse' && (x + y) % 2 === 0 ? ['chain', 0] : null));
}

function adairGlasses({ rig, face, E }) {
  const on = ['skin', 'blush', 'bruise', 'sclera', 'iris', 'pupil', 'glint', 'lash', 'brow', 'tear'];
  const L2 = [];
  for (const near of [true, false]) {
    const u = near ? -0.43 : 0.43;
    const [ex, ey0] = face.proj(u, 49.5 + (E.pitch || 0) * 1.5);
    const ey = ey0 + 0.6;
    const sc = face.scaleAt(u, 49.5);
    const w = 6.6 * sc, h = 5.0;
    const out = near ? -1 : 1;
    // cat-eye: flat-ish brow line rising to a pointed outer wing, rounded bottom
    const pts = spline([
      [ex - out * w * 0.95, ey - h * 0.55], [ex, ey - h * 0.72], [ex + out * w * 0.75, ey - h * 0.9], [ex + out * w * 1.12, ey - h * 1.3],
      [ex + out * w * 0.98, ey - h * 0.2], [ex + out * w * 0.5, ey + h * 0.72], [ex - out * w * 0.25, ey + h * 0.82], [ex - out * w * 0.92, ey + h * 0.15],
    ], { closed: true, seg: 5 });
    pts.push(pts[0]);
    rig.strokeH(pts, (t) => ['frame', t < 0.42 ? 0 : -1], { onlyMat: on });
    // thick upper rim
    rig.strokeH(pts.slice(0, Math.floor(pts.length * 0.38)).map(([x, y]) => [x, y - 1]), ['frame', 1], { onlyMat: on });
    L2.push({ ex, ey, w, h, out });
    if (!E.noGlare) {
      const g = [[ex - out * w * 0.45, ey - h * 0.05], [ex - out * w * 0.05, ey - h * 0.45]];
      rig.strokeH(g, ['glint', 0, 4], { onlyMat: on });
    }
  }
  const [n, f] = L2;
  rig.strokeH(spline([[n.ex + n.w * 0.92, n.ey - 2.2], [(n.ex + f.ex) / 2, n.ey - 3], [f.ex - f.w * 0.92, f.ey - 2.2]], { seg: 4 }), ['frame', 0], { onlyMat: on });
  rig.strokeH([[n.ex - n.w * 1.05, n.ey - 4.5], [n.ex - n.w - 6, n.ey - 3.5]], ['frame', -1], { onlyMat: on });
}

function adairHair({ rig, sids, E }) {
  const zf = hairVol(45, 44, 28, -2.5);
  const zs = hairVol(45, 44, 28, -5.5);
  // swept up and back from a soft side part into the twist; temples exposed, ears visible
  L(rig, sids, [[56, 14], [46, 9.5], [33, 12], [24, 22]], 8, 10, 6, { z: zs, depth: 3, strands: 2 });
  L(rig, sids, [[58, 17], [48, 15.5], [36, 19.5], [27, 28]], 7, 8, 4, { z: zf, depth: 2.8, strands: 1 });
  L(rig, sids, [[57, 19.5], [48, 22.5], [38, 27.5], [29.5, 37]], 6, 7, 3, { z: zf, depth: 2.6, strands: 1 });
  L(rig, sids, [[60, 18], [67, 21], [69.5, 30], [67, 41]], 6, 6.6, 4, { z: zs, depth: 2.6, strands: 1 });
  L(rig, sids, [[59, 21.5], [64.5, 26], [66, 33], [64, 40]], 4.4, 4.6, 2, { z: zf, depth: 2 });
  // soft wave over the forehead
  L(rig, sids, [[57, 18.5], [52, 24], [46, 29], [40.5, 32]], 5, 5.4, 1.4, { z: zf, depth: 2.2 });
  // escaped tendrils: exhausted, a long day
  strand(rig, [[31, 34], [29.4, 42], [30.5, 52], [29, 60]], 'hair', 1, false);
  strand(rig, [[66.5, 40], [68, 48], [66.8, 56]], 'hair', 0, false);
}

function adairHand({ rig }) {
  // raised left hand pointing off-frame (viewer's right), cardigan sleeve rising from the bottom
  const tz = 18;
  rig.poly([[69, 124], [71, 104], [73, 93], [78.5, 85], [87.5, 86], [86, 97], [84, 110], [84, 124]], { mat: 'cardigan', smooth: true, seg: 3, rim: 4, rimDepth: 4, z: tz, edgeOpen: 1 });
  rig.strokeH(spline([[73.5, 93.5], [79.5, 88.5], [87, 89]], { seg: 3 }), (t, x, y, i) => [rig.mat[i], -2], { onlyMat: ['cardigan'] });
  // back of the hand + curled fingers (knuckle rows), extended index finger, thumb over it
  rig.poly([[74.5, 85], [75, 77], [78.5, 72.5], [85, 71], [89.5, 73], [90, 79.5], [87.5, 85], [80, 87]], { mat: 'skin', smooth: true, seg: 3, rim: 2.6, rimDepth: 2.6, z: tz + 2 });
  rig.poly([[86, 70.2], [92, 69.2], [96.5, 69.2], [97, 72.6], [92, 73.2], [87, 74.6]], { mat: 'skin', rim: 1.6, rimDepth: 1.4, z: tz + 3, edgeOpen: 1 });
  rig.poly([[79.5, 72.5], [82.6, 68.6], [87.4, 68.8], [87.4, 71.4], [83, 72.8]], { mat: 'skin', smooth: true, seg: 2, rim: 1.2, rimDepth: 1, z: tz + 3.5 });
  for (const y of [76.6, 79.8, 82.8]) rig.strokeH([[82.6, y], [89, y - 0.6]], ['skin', -1]);
  rig.strokeH([[88, 71.2], [93, 70.8]], ['skin', -1]);
  rig.dotH(95.6, 70, 'skin', 1);
}

/** Through-the-glass treatment. */
function glassPost(d, rig) {
  const COOL = [151, 175, 203], DEEP = [27, 39, 65];
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; if (!rig.mat[i]) continue;
    let r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    r = lerp(lum, r, 0.68); g = lerp(lum, g, 0.68); b = lerp(lum, b, 0.68);
    // cool cast + lifted blacks (glass never quite holds a true black)
    r = lerp(r, COOL[0] * (lum / 200), 0.15); g = lerp(g, COOL[1] * (lum / 200), 0.15); b = lerp(b, COOL[2] * (lum / 200), 0.15);
    const lift = clamp(1 - lum / 90, 0, 1) * 0.3;
    r = lerp(r, DEEP[0] + 20, lift); g = lerp(g, DEEP[1] + 22, lift); b = lerp(b, DEEP[2] + 26, lift);
    // reflection streaks (diagonal, top-right → bottom-left): solid core, dithered shoulders
    const t = x + y * 0.85;
    const d1 = Math.abs(t - 94), d2 = Math.abs(t - 109);
    let k = 0;
    if (d1 < 2) k = 0.17; else if (d1 < 4 && bay(x, y) < 0.5) k = 0.17;
    if (d2 < 0.8) k = Math.max(k, 0.12);
    if (k) { r = lerp(r, 236, k); g = lerp(g, 242, k); b = lerp(b, 250, k); }
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
    // the reflection thins out toward the bottom of the glass
    const fade = clamp((y - 110) / 10, 0, 1);
    if (fade > 0 && bay(x + 1, y + 2) < fade) d[i * 4 + 3] = 0;
  }
  // faint back-surface double: a cool contour offset from the silhouette
  const solid = (x, y) => x >= 0 && y >= 0 && x < PW && y < PH && rig.mat[y * PW + x] && y < 100;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; if (d[i * 4 + 3]) continue;
    const sx = x - 2, sy = y - 1;
    if (!solid(sx, sy)) continue;
    if (solid(sx - 1, sy) && solid(sx + 1, sy) && solid(sx, sy - 1) && solid(sx, sy + 1)) continue;
    d[i * 4] = 58; d[i * 4 + 1] = 70; d[i * 4 + 2] = 92; d[i * 4 + 3] = 255;
  }
}

export const ADAIR_EXPR = {
  sad: { pitch: 0.2, tilt: 0.05, brow: { inner: 1.0, furrow: 0.3 }, eye: { open: 0.7, outerDown: 0.45, innerUp: 0.3, gy: 0.35, wet: 0.6 }, mouth: { smile: -0.35, press: 1 } },
  urgent: { hx: 1, shoulder: 0.3, brow: { y: 0.5, inner: 1.05, furrow: 0.6 }, eye: { open: 1.25, pupil: 0.7 }, mouth: { open: 0.6, shape: 'talk', width: 0.85, smile: -0.25 } },
  pointing: { point: true, tilt: -0.04, brow: { y: 0.3, inner: 0.6, furrow: 0.3 }, eye: { open: 1.08, gx: 0.95, gy: -0.1 }, mouth: { smile: -0.15, press: 1 } },
  peace: { tilt: 0.07, brow: { inner: 0.35, y: 0.1 }, eye: { shut: 'soft' }, mouth: { smile: 0.38 }, darkCircles: 0.1 },
};
