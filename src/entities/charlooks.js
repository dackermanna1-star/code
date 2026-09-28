// Character recipes: geometry spec (partgeo.buildBody) + atlas painters for
// the four survivors and the special infected. Assets are built once per
// character (and texture size) and shared by every rig instance.
//   atlas A (material 0): skin, face, eyes, under-clothes, trousers, shoes
//   atlas B (material 1): outer garments, hair, beards, hats, accessories
import * as THREE from 'three';
import { buildBody, headGrid, sampleHead, RECT, REG, BONE, TORSO_LEN, torsoPoint, headDir } from './partgeo.js';
import {
  Atlas, noise, lin, mix3, mul3, fabric, denim, leather, skin, paintHead, paintEye, applyDirt, applyBlood,
  rectMask, partCoords, adiff, sstep, rng, scalpMask, beardMask,
} from './charpaint.js';
import { characterMaterial } from './charshade.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));

let TEX_SIZE = 1024;
export function setCharacterDetail(size) { TEX_SIZE = size; }

// ================================================================ masks ==
// Hair strands luminance along the flow direction
function strands(N, u, v, k = 1) {
  const a = Math.round(26 * k), b = Math.round(55 * k);
  return 0.55 + 0.45 * (N.fine.at(u * a, v * 3) * 0.6 + N.fine.at(u * b, v * 5 + 0.3) * 0.4);
}

// =========================================================== painters ==
const T = (c) => { partCoords('torso', c); c.aa = Math.abs(c.a0); c.sx = c.a0 * 0.15; c.hh = c.hm; };
const lat = (a) => Math.abs(adiff(a, Math.PI / 2)); // 0 at the lateral side of a limb
const ant = (a) => Math.abs(adiff(a, Math.PI)); // 0 at the anterior side
const post = (a) => Math.abs(adiff(a, 0));

function foldField(N, su, sv, k = 1) {
  const f1 = N.ridge.at(su * 0.6, sv * 1.1), f2 = N.fbm.at(su * 0.9, sv * 0.8);
  return (Math.max(0, (f1 - 0.68) * 2.2) * 0.35 + (f2 - 0.5) * 0.3) * k;
}
function torsoFolds(N, c) {
  const h = c.hh, aa = c.aa;
  let f = foldField(N, c.u * 3, c.v * 2);
  f += 0.22 * Math.max(0, Math.sin(h * 70 + N.fbm.at(c.u * 3, c.v) * 7)) * sstep(0.14, 0.04, Math.abs(h - 0.1)) * N.blot.at(c.u * 2, c.v);
  f += 0.2 * Math.max(0, Math.sin(h * 45 + aa * 3.2 + N.fbm.at(c.u * 5, c.v) * 5)) * sstep(0.1, 0.0, Math.abs(h - 0.34)) * sstep(0.5, 0.9, aa) * sstep(1.7, 1.25, aa);
  return f;
}
function limbFolds(N, c, part) {
  let f = foldField(N, c.u * 2, c.v * 2.5, 0.8);
  const t = c.t;
  const joint = part === 'uarm' ? sstep(0.25, 0, Math.abs(t - 1.0)) : part === 'farm' ? sstep(0.2, 0, Math.abs(t)) + sstep(0.12, 0, Math.abs(t - 0.95)) * 0.6
    : part === 'thigh' ? sstep(0.2, 0, Math.abs(t - 1.0)) + sstep(0.14, 0, Math.abs(t)) * 0.6 : sstep(0.2, 0, Math.abs(t)) + sstep(0.2, 0, Math.abs(t - 0.95)) * 0.9;
  f += joint * 0.35 * Math.max(0, Math.sin(t * 55 + c.a * 2 + N.fbm.at(c.u * 2, c.v) * 6)) * (0.5 + N.blot.at(c.u * 2, c.v));
  return f;
}

// Trousers on thighs + shins. o: {color, kind:'jeans'|'cargo'|'slacks', dirt, blood, blouse, fade}
function paintTrousers(A, o) {
  const N = noise();
  for (const part of ['thigh', 'shin']) {
    A.region(RECT[part], (c) => {
      partCoords(part, c);
      const len = part === 'thigh' ? 0.45 : 0.47;
      const sv = c.t * len * 2.2, su = c.u * 0.6;
      let folds = limbFolds(N, c, part);
      if (o.blouse && part === 'shin') folds += sstep(o.blouse - 0.05, o.blouse + 0.05, c.t) * 0.5 * Math.max(0, Math.sin(c.a * 9 + c.t * 30));
      const la = lat(c.a), an = ant(c.a), me = Math.abs(adiff(c.a, -Math.PI / 2));
      if (o.kind === 'jeans') {
        const fade = 0.25 * sstep(0.9, 0.2, an) * (part === 'thigh' ? 1 : 0.4) + 0.3 * gauss(c.t - (part === 'thigh' ? 1.0 : 0.0), 0.12) * sstep(1.0, 0.3, an) + (o.fade ?? 0);
        denim(c, o.color, { su, sv, fade, folds });
        const seam = sstep(0.05, 0.015, la) + sstep(0.04, 0.012, me);
        c.col = mul3(c.col, 1 - seam * 0.25);
        const st = sstep(0.055, 0.045, la) * sstep(0.03, 0.04, la) * (Math.sin(c.t * 400) > 0 ? 1 : 0);
        c.col = mix3(c.col, [0.45, 0.3, 0.1], st * 0.6);
        c.h += seam * 0.2;
      } else {
        fabric(c, o.color, { su: su * 1.5, sv: sv * 1.5, folds, mottle: 0.12, rough: o.kind === 'slacks' ? 0.8 : 0.92 });
        if (o.kind === 'slacks') { const cr = sstep(0.06, 0.0, an); c.col = mul3(c.col, 1 + cr * 0.12); c.h += cr * 0.4; }
        const seam = sstep(0.04, 0.012, la) + sstep(0.04, 0.012, me);
        c.col = mul3(c.col, 1 - seam * 0.2);
        if (o.kind === 'cargo' && part === 'thigh') {
          const px = adiff(c.a, Math.PI / 2) * 0.085, py = c.t * len;
          const [inP, edgeP] = rectMask(px, py, -0.07, 0.07, 0.15, 0.3, 0.004);
          const [, flapE] = rectMask(px, py, -0.075, 0.075, 0.26, 0.31, 0.003);
          c.col = mul3(c.col, 1 - edgeP * 0.35 - flapE * 0.3);
          c.h += inP * 0.15 - edgeP * 0.3;
          const btn = Math.hypot(px, py - 0.28) < 0.006 ? 1 : 0;
          c.col = mix3(c.col, [0.08, 0.07, 0.05], btn);
        }
        if (o.kind === 'cargo' && part === 'thigh') { const knee = gauss(c.t - 0.95, 0.08) * sstep(1.0, 0.4, an); c.col = mul3(c.col, 1 - knee * 0.12); }
      }
      applyDirt(c, (o.dirt ?? 0.3) * (part === 'shin' ? 0.8 + c.t * 0.6 : 0.6), su * 3, sv);
      applyBlood(c, o.blood ?? 0.08, su * 2, sv * 0.5);
    });
  }
}
// Waist band / hips / seat of the trousers inside the torso region.
function trouserTorso(N, c, o) {
  const h = c.hh, aa = c.aa, a = c.a0;
  const su = c.u * 2.5, sv = c.v * 2;
  const folds = foldField(N, su, sv, 0.7);
  if (o.kind === 'jeans') denim(c, o.color, { su: c.u * 1.2, sv: h * 2.2, folds, fade: 0.1 * sstep(0.7, 0.2, aa) });
  else fabric(c, o.color, { su: c.u * 1.5, sv: h * 3.3, folds, mottle: 0.12, rough: o.kind === 'slacks' ? 0.8 : 0.92 });
  // fly, pockets, back pockets, belt loops
  const fly = sstep(0.006, 0.0, Math.abs(c.sx - 0.018)) * sstep(-0.13, -0.1, h);
  let line = fly;
  const fp = Math.abs(Math.hypot((aa - 1.0) * 0.15, h - 0.075) - 0.065) < 0.003 && aa < 1.35 && h < 0.07 ? 1 : 0;
  line = Math.max(line, fp);
  if (o.kind === 'jeans' || o.kind === 'cargo') {
    const bx = (aa - 2.55) * 0.15, by = h + 0.04;
    const e = Math.max(Math.abs(bx) - 0.058 + (by < -0.03 ? (-0.03 - by) * 0.5 : 0), Math.abs(by) - 0.055);
    line = Math.max(line, sstep(0.004, 0.0, Math.abs(e)));
  }
  const loops = sstep(0.006, 0.0, Math.abs(((aa * 0.15 + 0.03) % 0.1) - 0.05)) * sstep(0.05, 0.06, h) * sstep(0.095, 0.085, h);
  c.col = mul3(c.col, 1 - line * 0.35);
  c.h -= line * 0.3;
  // belt
  if (o.belt !== false && h > 0.052 && h < 0.088) {
    leather(c, o.beltColor || lin(0x1a120c), { su: c.u * 3, sv: h * 6 });
    const buckle = aa < (o.bigBuckle ? 0.25 : 0.12) && h > 0.055 && h < 0.085;
    if (buckle) { c.col = o.bigBuckle ? [0.45, 0.4, 0.32] : [0.52, 0.5, 0.46]; c.rough = 0.25; c.h = 0.4; }
    c.col = mul3(c.col, 1 - sstep(0.006, 0.0, Math.abs(h - 0.056)) * 0.4 - sstep(0.006, 0.0, Math.abs(h - 0.084)) * 0.4);
  } else c.col = mul3(c.col, 1 - loops * 0.2);
}

// Top garments on the torso. o: {color, neck:'crew'|'v'|'scoop'|'collar', hem, placket, pocket, rib, print}
function topTorso(N, c, o) {
  const h = c.hh, aa = c.aa;
  const folds = torsoFolds(N, c);
  fabric(c, o.color, { su: c.u * 3, sv: h * 4, folds, mottle: 0.12, scale: o.fine ? 1.4 : 1 });
  const neck = o.neck === 'v' ? 0.49 - 0.11 * Math.max(0, 1 - aa / 0.55) : o.neck === 'scoop' ? 0.45 - 0.05 * sstep(1.2, 0.0, aa) : 0.49 - 0.02 * sstep(1.2, 0, aa);
  const rib = sstep(0.018, 0.012, neck - h) * sstep(0.0, 0.004, neck - h);
  c.col = mul3(c.col, 1 - rib * 0.12);
  c.h += rib * 0.25;
  const side = sstep(0.02, 0.005, Math.abs(Math.abs(c.a0) - Math.PI / 2) * 0.15);
  const shoulder = sstep(0.005, 0.0015, Math.abs(h - 0.445)) * sstep(0.7, 1.1, aa);
  c.col = mul3(c.col, 1 - (side + shoulder) * 0.18);
  if (o.placket) {
    const pl = sstep(0.006, 0.0, Math.abs(Math.abs(c.sx) - 0.016));
    c.col = mul3(c.col, 1 - pl * 0.2);
    const by = ((h - 0.02) % 0.078 + 0.078) % 0.078 - 0.039;
    const btn = Math.hypot(c.sx, by) < 0.0055 && h < neck && h > 0.07 ? 1 : 0;
    c.col = mix3(c.col, mul3(o.color, 0.82), btn);
    c.h += btn * 0.3 + pl * 0.1;
  }
  if (o.pocket) {
    const px = c.sx + 0.075, py = h - 0.315;
    const [inP, e] = rectMask(px, py, -0.045, 0.045, -0.05, 0.05, 0.003);
    c.col = mul3(c.col, 1 - e * 0.3);
    c.h += inP * 0.1 - e * 0.25;
    if (o.pen && Math.abs(px + 0.02) < 0.004 && py > 0.035 && py < 0.07) { c.col = [0.02, 0.02, 0.05]; c.rough = 0.3; }
  }
  if (o.sweat) {
    const pit = gauss(Math.abs(c.aa) - 1.57, 0.25) * gauss(h - 0.34, 0.05);
    c.col = mix3(c.col, [c.col[0] * 0.85, c.col[1] * 0.8, c.col[2] * 0.6], pit * o.sweat);
  }
  return neck;
}

// Skin + tattoos for arms. o: {tone, hair (0..1 arm hair), tattoo(c) -> [ink, rgb]}
function armSkin(c, o, part) {
  const N = noise();
  const su = c.u * 1.2, sv = c.t * 0.9;
  skin(c, o.tone, { su, sv, veins: part === 'farm' ? 0.5 : 0.2, red: 0.05 });
  if (o.hair) {
    const hr = N.fine.at(c.u * 30, c.t * 6) * sstep(0.4, 0.8, N.fine.at(c.u * 12, c.t * 20));
    c.col = mix3(c.col, mul3(c.col, 0.55), hr * o.hair * (part === 'farm' ? sstep(1.2, 0.2, ant(c.a)) : 0.4));
  }
  if (part === 'uarm') { const elbow = gauss(c.t - 1.0, 0.06) * gauss(post(c.a), 0.7); c.col = mul3(c.col, 1 - elbow * 0.12); c.h -= elbow * 0.2 * Math.abs(Math.sin(c.t * 150)); }
  if (o.tattoo) {
    const [ink, col] = o.tattoo(c, part);
    if (ink > 0) { c.col = mix3(c.col, col, ink * 0.88); c.rough = lerp(c.rough, 0.55, ink); }
  }
  if (o.dirt) applyDirt(c, o.dirt, su * 3, sv * 3);
  if (o.blood) applyBlood(c, o.blood, su * 2, sv);
}
// Hands: palm + fingers from the hand sub-rects.
function paintHands(A, o) {
  const N = noise();
  A.region(RECT.hand, (c) => {
    const tone = o.tone;
    skin(c, tone, { su: c.u * 3, sv: c.v * 2, red: 0.1 });
    let dorsal = 0, nail = 0, crease = 0;
    if (c.u < 0.45) {
      const lu = c.u / 0.45;
      dorsal = sstep(0.32, 0.12, Math.abs(lu - 0.5));
      const palmSide = sstep(0.3, 0.05, Math.abs(lu - 0.0)) + sstep(0.3, 0.05, Math.abs(lu - 1.0));
      if (o.palm) c.col = mix3(c.col, o.palm, palmSide * 0.7);
      crease = palmSide * (sstep(0.006, 0, Math.abs(c.v - 0.55 - Math.sin(lu * 9) * 0.04)) + sstep(0.006, 0, Math.abs(c.v - 0.72 + lu * 0.1)));
      const tendon = dorsal * sstep(0.85, 0.95, N.ridge.at(lu * 2, c.v * 0.6)) * sstep(0.2, 0.7, c.v);
      c.h += tendon * 0.2;
      const kn = dorsal * sstep(0.84, 0.96, c.v) * (0.5 + 0.5 * Math.cos(lu * TAU * 4));
      c.col = mul3(c.col, 1 - kn * 0.12);
      c.h += kn * 0.2;
    } else if (c.u >= 0.5) {
      const fi = Math.min(4, Math.floor((c.u - 0.5) / 0.1));
      const lu = (c.u - 0.5 - fi * 0.1) / 0.1;
      dorsal = sstep(0.3, 0.1, Math.abs(lu - 0.5));
      const nl = fi === 4 ? [0.8, 0.98] : [0.76, 0.97];
      nail = dorsal * sstep(nl[0], nl[0] + 0.03, c.v) * sstep(nl[1], nl[1] - 0.02, c.v) * sstep(0.26, 0.2, Math.abs(lu - 0.5));
      const knuckles = [0.12, 0.45, 0.71];
      for (const k of knuckles) crease += gauss(c.v - k, 0.018) * (0.5 + 0.5 * Math.abs(Math.sin((lu - 0.5) * 20))) * dorsal;
      const palmSide = 1 - sstep(0.25, 0.4, Math.abs(lu - 0.5));
      if (o.palm) c.col = mix3(c.col, o.palm, (1 - dorsal) * 0.6);
      crease += (1 - dorsal) * (gauss(c.v - 0.45, 0.01) + gauss(c.v - 0.72, 0.01)) * 0.6 * (1 - palmSide);
    }
    c.col = mul3(c.col, 1 - crease * 0.3);
    c.h -= crease * 0.3;
    if (nail > 0) {
      const nc = o.nails || mix3(mul3(tone, 1.1), [0.85, 0.72, 0.68], 0.4);
      c.col = mix3(c.col, nc, nail); c.rough = lerp(c.rough, 0.25, nail); c.h += nail * 0.15; c.skin *= 1 - nail;
    }
    if (o.gloveFn) o.gloveFn(c, dorsal);
    if (o.dirt) applyDirt(c, o.dirt, c.u * 4, c.v * 3);
    if (o.blood) applyBlood(c, o.blood, c.u * 3, c.v * 2);
  });
}
// Shoes. o: {kind:'boot'|'sneaker'|'dress'|'bare', color, sole, laces, tone}
function paintFeet(A, o) {
  const N = noise();
  A.region(RECT.foot, (c) => {
    const a = (c.u - 0.5) * TAU, t = c.v, aa = Math.abs(a);
    if (o.kind === 'bare') {
      skin(c, o.tone, { su: c.u * 2, sv: c.v * 2 });
      const toes = sstep(0.8, 0.86, t) * (Math.abs(Math.sin(a * 5.5)) < 0.18 ? 1 : 0) * sstep(2.2, 1.6, aa);
      c.col = mul3(c.col, 1 - toes * 0.5); c.h -= toes * 0.4;
      const nails = sstep(0.93, 0.96, t) * sstep(0.9, 0.5, aa) * (Math.abs(Math.sin(a * 5.5)) > 0.5 ? 1 : 0);
      c.col = mix3(c.col, mul3(o.tone, 1.1), nails * 0.5);
      const soleD = sstep(1.8, 2.3, aa);
      c.col = mul3(c.col, 1 - soleD * 0.35);
      applyDirt(c, o.dirt ?? 0.8, c.u * 3, c.v * 3);
      if (o.blood) applyBlood(c, o.blood, c.u * 2, c.v * 2);
      return;
    }
    const sole = sstep(1.95, 2.08, aa);
    const soleTop = sstep(0.05, 0.0, Math.abs(aa - 2.0));
    if (o.kind === 'dress') {
      leather(c, o.color, { su: c.u * 2, sv: c.v * 2 });
      c.rough *= 0.55;
      const cap = sstep(0.006, 0.0, Math.abs(t - 0.8)) * sstep(1.3, 0.8, aa);
      c.col = mul3(c.col, 1 - cap * 0.4);
      const lace = sstep(0.28, 0.18, aa) * sstep(0.34, 0.38, t) * sstep(0.52, 0.48, t);
      c.col = mix3(c.col, [0.02, 0.02, 0.02], lace * (Math.sin(t * 180) > 0 ? 0.9 : 0.4));
    } else if (o.kind === 'boot') {
      leather(c, o.color, { su: c.u * 2, sv: c.v * 2, folds: sstep(0.35, 0.25, Math.abs(t - 0.2)) * 0.3 * Math.abs(Math.sin(a * 6 + t * 30)) });
      const lace = sstep(0.3, 0.2, aa) * sstep(0.08, 0.14, t) * sstep(0.6, 0.54, t);
      const x = Math.sin(t * 140);
      c.col = mix3(c.col, o.laces || [0.05, 0.04, 0.03], lace * (Math.abs(x) < 0.5 ? 0.9 : 0.2));
      const hooks = sstep(0.34, 0.3, aa) * sstep(0.28, 0.24, aa) * (Math.sin(t * 70) > 0.8 ? 1 : 0) * sstep(0.08, 0.12, t) * sstep(0.6, 0.5, t);
      c.col = mix3(c.col, [0.4, 0.38, 0.34], hooks); if (hooks) c.rough = 0.3;
      if (o.buckle) { const bk = sstep(0.01, 0.0, Math.abs(t - 0.22)) * sstep(1.4, 1.0, aa); c.col = mix3(c.col, [0.02, 0.02, 0.02], bk); const bb = Math.hypot((aa - 1.2) * 0.04, t - 0.22) < 0.012 && a > 0 ? 1 : 0; c.col = mix3(c.col, [0.5, 0.48, 0.44], bb); }
    } else { // sneaker
      fabric(c, o.color, { su: c.u * 3, sv: c.v * 3, mottle: 0.1 });
      const toeCap = sstep(0.82, 0.86, t) * sstep(1.9, 1.6, aa);
      c.col = mix3(c.col, o.sole || [0.75, 0.73, 0.7], toeCap * 0.9);
      const lace = sstep(0.34, 0.22, aa) * sstep(0.34, 0.38, t) * sstep(0.66, 0.62, t);
      c.col = mix3(c.col, o.laces || [0.8, 0.78, 0.74], lace * (Math.abs(Math.sin(t * 150)) < 0.5 ? 0.95 : 0.3));
      const stripe = sstep(0.012, 0.0, Math.abs(Math.abs(a) - 1.35 + (t - 0.5) * 0.8)) * sstep(0.25, 0.3, t) * sstep(0.75, 0.7, t);
      if (o.stripe) c.col = mix3(c.col, o.stripe, stripe);
    }
    const sc = o.kind === 'sneaker' ? (o.sole || [0.75, 0.73, 0.7]) : o.kind === 'boot' ? [0.03, 0.028, 0.025] : [0.05, 0.035, 0.025];
    c.col = mix3(c.col, mul3(sc, 0.95 + N.fine.at(c.u * 4, c.v * 4) * 0.1), sole);
    if (sole > 0.5) c.rough = 0.85;
    const tread = sole * (Math.sin(t * 160) > 0.3 ? 1 : 0) * sstep(2.6, 2.9, aa);
    c.h += -soleTop * 0.4 + tread * 0.3;
    c.col = mul3(c.col, 1 - soleTop * 0.3);
    applyDirt(c, o.dirt ?? 0.4, c.u * 3, c.v * 3);
  });
}

// Head hair / beard on atlas B's head rect.
function paintHeadHair(B, grid, o) {
  const N = noise();
  const p = [0, 0, 0], n = [0, 0, 0];
  B.region(RECT.head, (c) => {
    const ao = sampleHead(grid, c.u, c.v, p, n);
    const sm = o.scalp ? scalpMask(p, o.scalp) : 0;
    const bm = o.beard ? beardMask(p, o.beard) : 0;
    let col = [0.05, 0.04, 0.03];
    // coverage (alpha-tested): strand-noisy edges instead of mesh steps
    const edgeN = N.fine.at(c.u * 60, c.v * 14) * 0.6 + N.fine.at(c.u * 140, c.v * 30) * 0.4; // integer u multipliers: seamless
    const covOf = (m) => clamp(m + (edgeN - 0.5) * 0.9 * (1 - Math.abs(2 * m - 1)), 0, 1);
    if (o.hat && p[1] > o.hat.line(p) - 0.003) {
      c.alpha = 1;
      const f = N.fine.at(c.u * 20, c.v * 10), l = o.hat.line(p);
      if (p[1] < l + 0.011) { c.col = mul3(o.hat.band, 0.85 + f * 0.2); c.rough = 0.55; c.h = -sstep(0.002, 0, Math.abs(p[1] - l - 0.011)) * 0.2; }
      else {
        c.col = mul3(o.hat.color, 0.82 + f * 0.3); c.rough = 0.95; c.h = f * 0.15;
        if (o.hat.flash) { const d = Math.hypot(p[0] + 0.03, p[1] - l - 0.03); if (d < 0.017 && p[2] < -0.04) { c.col = d < 0.011 ? [0.5, 0.42, 0.18] : [0.06, 0.08, 0.05]; c.rough = d < 0.011 ? 0.35 : 0.8; c.h = 0.3; } }
      }
      c.ao = 0.6 + 0.4 * ao; c.skin = 0;
      return;
    }
    c.alpha = covOf(Math.max(sm, bm));
    if (bm > sm && o.beard) {
      const curl = N.fine.at(c.u * 24, c.v * 9) * 0.55 + N.fine.at(c.u * 60, c.v * 20) * 0.25 + N.blot.at(c.u * 6, c.v * 4) * 0.2;
      const bc = o.beard.color;
      col = mul3(mix3(bc, o.beard.color2 || bc, sstep(0.35, 0.75, N.blot.at(c.u * 5, c.v * 3))), 0.72 + curl * 0.4);
      c.h = curl * 0.25;
      c.rough = 0.75;
    } else {
      const st = strands(N, c.u, c.v, o.scalp?.fine ?? 1);
      const hc = o.scalp?.color || [0.05, 0.04, 0.03];
      col = mul3(mix3(hc, o.scalp?.color2 || hc, sstep(0.4, 0.8, N.blot.at(c.u * 3, c.v * 2))), 0.45 + st * 0.75);
      c.h = st * 0.6;
      c.rough = o.scalp?.rough ?? 0.62;
    }
    c.col = mul3(col, 0.55 + 0.45 * ao);
    c.ao = 0.6 + 0.4 * ao;
    c.skin = 0;
  });
}

// =========================================================== recipes ==
// Each recipe: spec(), paintA(A, grid), paintB(B, grid), options.
const SURV = {};
const SPEC = {};

// ------------------------------------------------------------------ Bill
SURV.bill = {
  spec: () => ({
    muscle: 0.25, fat: 0.18, eyes: true,
    head: { brow: 1.25, nose: 1.12, noseLen: 1.08, jaw: 1.05, cheek: 1.05, ear: 1.1, gaunt: 0.25, chin: 1.05 },
    hand: { curl: 0.52 }, foot: { boot: true, width: 1.03 },
    layers: [
      { kind: 'torso', mat: 1, off: 0.017, h0: -0.2, h1: 0.49, offFn: billPockets },
      { kind: 'sleeve', part: 'uarm', mat: 1, off: 0.012, bulge: (t, a) => 0.003 * gauss(t - 0.3, 0.1) * gauss(lat(a), 0.5) },
      { kind: 'sleeve', part: 'farm', mat: 1, off: 0.012, t1: 0.93, hem: true, bulge: (t) => 0.004 * sstep(0.8, 0.9, t) },
      { kind: 'collar', mat: 1, h: 0.475, height: 0.055, off: 0.021, open: 0.16, flare: 0.01, roll: 0.004 },
      { kind: 'leg', part: 'shin', mat: 0, off: 0.013, t0: 0.66, rect: RECT.boot },
      { kind: 'leg', part: 'thigh', mat: 0, off: 0.008, t0: 0.28, t1: 0.66, keep: (t, a) => lat(a) < 0.62 },
      { kind: 'hair', mat: 1, thick: (p) => { const m = scalpMask(p, BILL_SCALP); return m > 0.02 ? 0.0035 * m : -1; } },
      { kind: 'hair', mat: 1, thick: (p) => { const m = beardMask(p, BILL_BEARD); return m > 0.01 ? 0.0012 + m * (0.003 + 0.008 * sstep(0.0, -0.07, p[1])) : -1; } },
      { kind: 'hair', mat: 1, thick: beretThick, warp: beretWarp, minOff: 0.003 },
      { custom: cigarette },
    ],
  }),
  paintA(A, grid) {
    const tone = lin(0xc09070);
    paintHead(A, RECT.head, grid, { skin: tone, lips: lin(0x9a6a5a), brow: lin(0x9a948a), browThick: 1.4, stubble: 0.6, stubbleCol: lin(0x8a867e), wrinkles: 1, redness: 1.35, hair: lin(0x9a968e), scalp: BILL_SCALP, beardShape: BILL_BEARD, dirt: 0.25, scar: true });
    paintEye(A, RECT.eye, { iris: lin(0x5a7080), bloodshot: 0.4 });
    const N = noise();
    const olive = lin(0x5a5c3c), cargo = lin(0x6a6048);
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.05) { const nk = topTorso(N, c, { color: olive, neck: 'crew' }); if (c.hh > nk) skin(c, tone, { su: c.u * 3, sv: c.v * 2, red: 0.1 }); applyDirt(c, 0.3, c.u * 3, c.v * 2); }
      else trouserTorso(N, c, { kind: 'cargo', color: cargo });
    });
    A.region(RECT.uarm, (c) => { partCoords('uarm', c); if (c.t < 0.35) fabric(c, olive, { su: c.u, sv: c.t, folds: limbFolds(N, c, 'uarm') }); else armSkin(c, { tone, hair: 0.5 }, 'uarm'); });
    A.region(RECT.farm, (c) => { partCoords('farm', c); armSkin(c, { tone, hair: 0.7, dirt: 0.3 }, 'farm'); });
    paintHands(A, { tone, dirt: 0.35 });
    paintTrousers(A, { kind: 'cargo', color: cargo, dirt: 0.45, blouse: 0.68 });
    paintFeet(A, { kind: 'boot', color: lin(0x1c1814), dirt: 0.6 });
    A.region(RECT.boot, (c) => { partCoords('shin', c); leather(c, lin(0x1c1814), { su: c.u * 2, sv: c.t, folds: 0.4 * Math.max(0, Math.sin(c.t * 60 + c.a * 3)) }); const lace = sstep(0.35, 0.2, ant(c.a)); c.col = mix3(c.col, [0.04, 0.035, 0.03], lace * (Math.abs(Math.sin(c.t * 90)) < 0.5 ? 1 : 0.3)); if (c.t < 0.72) c.col = mul3(c.col, 0.7); applyDirt(c, 0.6, c.u * 3, c.t); });
  },
  paintB(B, grid) {
    const N = noise();
    const jacket = lin(0x55593a);
    B.region(RECT.torso, (c) => {
      T(c);
      const h = c.hh, sx = c.sx, aa = c.aa;
      const folds = torsoFolds(N, c) * 1.1;
      fabric(c, jacket, { su: c.u * 3, sv: h * 4, folds, mottle: 0.22, rough: 0.9 });
      // storm flap over the zip, snaps
      const flap = sstep(0.004, 0.0, Math.abs(sx - 0.028)) * sstep(-0.2, -0.18, h);
      const snap = Math.hypot(sx - 0.018, ((h + 0.2) % 0.085) - 0.042) < 0.006 && h < 0.44 ? 1 : 0;
      c.col = mul3(c.col, 1 - flap * 0.35);
      c.col = mix3(c.col, [0.14, 0.13, 0.1], snap); c.h += snap * 0.3 - flap * 0.3;
      // four pockets with flaps (chest + hip)
      for (const [cx, cy, w, hh] of [[-0.085, 0.29, 0.06, 0.065], [0.085, 0.29, 0.06, 0.065], [-0.1, -0.08, 0.075, 0.08], [0.1, -0.08, 0.075, 0.08]]) {
        const [inP, e] = rectMask(sx, h, cx - w, cx + w, cy - hh, cy + hh, 0.003);
        const [, fe] = rectMask(sx, h, cx - w - 0.004, cx + w + 0.004, cy + hh - 0.03, cy + hh + 0.004, 0.003);
        c.col = mul3(c.col, 1 - e * 0.35 - fe * 0.35);
        c.h += inP * 0.1 - e * 0.3 - fe * 0.3;
        const b = Math.hypot(sx - cx, h - (cy + hh - 0.012)) < 0.006 ? 1 : 0;
        c.col = mix3(c.col, [0.12, 0.11, 0.08], b);
      }
      // name tape above the right chest pocket, shoulder epaulettes
      const tape = rectMask(sx, h, 0.035, 0.135, 0.37, 0.385, 0.002)[0];
      c.col = mix3(c.col, [0.08, 0.08, 0.05], tape * 0.8);
      const ep = sstep(0.05, 0.03, Math.abs(aa - Math.PI / 2) * 0.15) * sstep(0.43, 0.45, h);
      c.col = mul3(c.col, 1 - ep * 0.12);
      // drawstring waist, wear at the hem
      c.col = mul3(c.col, 1 - sstep(0.006, 0, Math.abs(h - 0.08)) * 0.25);
      applyDirt(c, 0.5, c.u * 3, c.v * 2);
      applyBlood(c, 0.1, c.u * 2, c.v);
    });
    const sleeve = (part) => B.region(RECT[part], (c) => {
      partCoords(part, c);
      const folds = limbFolds(N, c, part) * 1.2;
      fabric(c, jacket, { su: c.u * 1.2, sv: c.t * 0.8, folds, mottle: 0.22 });
      if (part === 'uarm') {
        // shoulder patch (lateral): round unit patch
        const px = adiff(c.a, Math.PI / 2) * 0.06, py = (c.t - 0.18) * 0.29;
        const d = Math.hypot(px, py);
        if (d < 0.032) { c.col = d < 0.028 ? (d < 0.012 ? [0.6, 0.5, 0.15] : [0.05, 0.08, 0.2]) : [0.5, 0.45, 0.2]; c.h += 0.3; c.rough = 0.8; }
        const pocket = rectMask(adiff(c.a, Math.PI / 2) * 0.06, (c.t - 0.45) * 0.29, -0.025, 0.025, -0.035, 0.03, 0.002)[1];
        c.col = mul3(c.col, 1 - pocket * 0.3);
      } else {
        const cuff = sstep(0.84, 0.87, c.t);
        c.col = mul3(c.col, 1 - sstep(0.012, 0, Math.abs(c.t - 0.86)) * 0.3);
        c.h += cuff * 0.1;
        const tab = rectMask(adiff(c.a, 0.3) * 0.04, c.t, -0.012, 0.012, 0.86, 0.92, 0.003)[1];
        c.col = mul3(c.col, 1 - tab * 0.3);
        applyDirt(c, 0.6 * c.t, c.u * 3, c.t * 2);
      }
      applyDirt(c, 0.35, c.u * 2, c.t * 2);
    });
    sleeve('uarm'); sleeve('farm');
    B.region(RECT.collar, (c) => { fabric(c, mul3(jacket, 0.95), { su: c.u * 3, sv: c.v, folds: 0.1 }); c.col = mul3(c.col, 1 - sstep(0.1, 0.0, c.v) * 0.3); });
    paintHeadHair(B, grid, {
      scalp: Object.assign({ color: lin(0xb8b4aa), color2: lin(0x8a867e), fine: 1.5 }, BILL_SCALP), beard: Object.assign({ color: lin(0xc8c4ba), color2: lin(0x9a968c) }, BILL_BEARD),
      hat: { line: beretLine, color: lin(0x2e3c24), band: lin(0x1a1410), flash: true },
    });
    // cigarette: filter, paper, ember
    B.region(RECT.extra0, (c) => { const v = c.v; c.col = v < 0.3 ? [0.55, 0.38, 0.2] : v > 0.93 ? [0.12, 0.1, 0.09] : [0.82, 0.8, 0.76]; c.rough = 0.8; c.skin = 0; });
  },
  emissive: (E) => { E.region(RECT.extra0, (c) => { c.col = c.v > 0.95 ? [1.0, 0.35, 0.05] : [0, 0, 0]; }); },
};
const BILL_SCALP = { front: 0.14, temple: 0.12, side: 0.08, nape: -0.025 };
const BILL_BEARD = { sideburns: 1 };
function billPockets(h, a) {
  const sx = a * 0.15;
  let o = 0;
  for (const [cx, cy, w, hh] of [[-0.085, 0.29, 0.06, 0.065], [0.085, 0.29, 0.06, 0.065], [-0.1, -0.08, 0.075, 0.08], [0.1, -0.08, 0.075, 0.08]]) {
    const dx = Math.abs(sx - cx) - w, dy = Math.abs(h - cy) - hh;
    o = Math.max(o, 0.005 * sstep(0.004, -0.004, Math.max(dx, dy)));
  }
  return o + 0.003 * gauss(h - 0.08, 0.01);
}
// Beret: a felt shell over the skull, band hugging the head, crown pulled
// over to the right side.
const beretLine = (p) => 0.104 - 0.014 * sstep(-0.07, 0.07, p[0]) + 0.006 * sstep(-0.02, 0.06, p[2]);
function beretThick(p) {
  const y = p[1], l = beretLine(p);
  if (y < l) return -1;
  return 0.0045 + 0.018 * sstep(l + 0.01, l + 0.05, y);
}
function beretWarp(p, n, u, v, t) {
  if (t <= 0) return;
  const l = beretLine(p);
  const k = sstep(l + 0.012, l + 0.05, p[1]);
  p[0] += 0.03 * k * (0.35 + 0.65 * sstep(-0.06, 0.07, p[0]));
  p[1] = Math.min(p[1], 0.172 - 0.01 * sstep(-0.05, 0.08, p[0])) - 0.006 * k * sstep(0.0, 0.08, p[0]);
}
function cigarette(C) {
  const P = C.add(new C.Piece({ region: REG.HAIR, bone: BONE.HEAD, mat: 1, name: 'cig' }));
  const s = [0.014, -0.02, -0.101], d = [0.25, -0.28, -0.93];
  const L = 0.055;
  const pts = []; const rad = [];
  for (let i = 0; i <= 4; i++) { const k = i / 4; pts.push([s[0] + d[0] * L * k, s[1] + d[1] * L * k, s[2] + d[2] * L * k]); rad.push(0.0037); }
  C.sweep(P, pts, rad, 6, RECT.extra0, { up: [0, 1, 0], capEnd: true });
}

// ------------------------------------------------------------------ Zoey
SURV.zoey = {
  spec: () => ({
    female: 1, bust: 0.85, eyes: true, fat: -0.1,
    head: { nose: 0.9, noseLen: 0.95, jaw: 0.94, lips: 1.1, cheek: 1.08, ear: 0.92, chin: 0.95 },
    hand: { curl: 0.5 }, foot: { chunky: 0.6 },
    layers: [
      { kind: 'torso', mat: 1, off: 0.011, h0: -0.045, h1: 0.49, open: (h) => (h > 0.4 ? 0.2 + (h - 0.4) * 2.5 : 0.17) },
      { kind: 'sleeve', part: 'uarm', mat: 1, off: 0.011 },
      { kind: 'sleeve', part: 'farm', mat: 1, off: 0.01, t1: 0.95, hem: true },
      { kind: 'collar', mat: 1, h: 0.47, height: 0.05, off: 0.019, open: 0.4, flare: 0.012 },
      { kind: 'hair', mat: 1, thick: (p) => { const m = scalpMask(p, ZOEY_SCALP); return m > 0.02 ? m * (0.004 + 0.004 * sstep(0.06, 0.14, p[1]) + 0.004 * sstep(0.02, 0.08, p[2])) : -1; }, warp: zoeyFringe },
      { custom: ponytail },
    ],
  }),
  paintA(A, grid) {
    const tone = lin(0xe6bfa0);
    paintHead(A, RECT.head, grid, { skin: tone, lips: lin(0xb86a6a), brow: lin(0x3a2418), browThick: 0.8, freckles: 0.35, makeup: 0.7, redness: 0.9, hair: lin(0x3a2214), scalp: ZOEY_SCALP, dirt: 0.12 });
    paintEye(A, RECT.eye, { iris: lin(0x6a4a2a) });
    const N = noise();
    const top = lin(0xdcd8d0), jeans = lin(0x34466a);
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.06) {
        const neck = topTorso(N, c, { color: top, neck: 'scoop', fine: true });
        if (c.hh > neck) skin(c, tone, { su: c.u * 3, sv: c.v * 2 });
        applyDirt(c, 0.2, c.u * 3, c.v * 2);
        applyBlood(c, 0.08, c.u * 2, c.v);
      } else trouserTorso(N, c, { kind: 'jeans', color: jeans, beltColor: lin(0x2a1a14) });
    });
    A.region(RECT.uarm, (c) => { partCoords('uarm', c); armSkin(c, { tone }, 'uarm'); });
    A.region(RECT.farm, (c) => { partCoords('farm', c); armSkin(c, { tone }, 'farm'); });
    paintHands(A, { tone, nails: lin(0x6a1a22), dirt: 0.2 });
    paintTrousers(A, { kind: 'jeans', color: jeans, dirt: 0.3, fade: 0.05 });
    paintFeet(A, { kind: 'sneaker', color: lin(0x2e2a2c), sole: [0.72, 0.7, 0.66], laces: [0.75, 0.72, 0.68], stripe: lin(0x9a2a3a), dirt: 0.45 });
  },
  paintB(B, grid) {
    const N = noise();
    const red = lin(0xa0283e), white = lin(0xe6e2da);
    B.region(RECT.torso, (c) => {
      T(c);
      const h = c.hh;
      fabric(c, red, { su: c.u * 3, sv: h * 4, folds: torsoFolds(N, c) * 0.9, mottle: 0.1, rough: 0.7, scale: 1.5 });
      // zipper tape along the opening edges
      const open = h > 0.4 ? 0.2 + (h - 0.4) * 2.5 : 0.17;
      const edge = sstep(0.05, 0.0, c.aa - open);
      c.col = mix3(c.col, [0.12, 0.1, 0.1], sstep(0.02, 0.0, c.aa - open) * 0.8);
      c.col = mix3(c.col, white, edge * sstep(0.02, 0.03, c.aa - open) * 0.7);
      // side panels piping
      const pip = sstep(0.012, 0.004, Math.abs(Math.abs(c.a0) - Math.PI / 2) * 0.15);
      c.col = mix3(c.col, white, pip * 0.9);
      // ribbed hem band
      if (h < 0.0) { c.col = mul3(c.col, 0.85 + 0.15 * Math.abs(Math.sin(c.u * 400))); c.h += 0.1; }
      applyDirt(c, 0.25, c.u * 3, c.v * 2);
      applyBlood(c, 0.12, c.u * 2, c.v);
    });
    const sleeve = (part) => B.region(RECT[part], (c) => {
      partCoords(part, c);
      fabric(c, red, { su: c.u * 1.2, sv: c.t, folds: limbFolds(N, c, part), mottle: 0.1, rough: 0.7, scale: 1.5 });
      const l = adiff(c.a, Math.PI / 2) * 0.05;
      const st = sstep(0.004, 0.002, Math.abs(Math.abs(l) - 0.007));
      c.col = mix3(c.col, white, st);
      if (part === 'farm' && c.t > 0.82) { c.col = mul3(c.col, 0.82 + 0.18 * Math.abs(Math.sin(c.u * 300))); c.h += 0.1; }
      applyDirt(c, 0.3, c.u * 2, c.t * 2);
    });
    sleeve('uarm'); sleeve('farm');
    B.region(RECT.collar, (c) => { fabric(c, red, { su: c.u * 3, sv: c.v, rough: 0.7 }); c.col = mul3(c.col, 0.85 + 0.15 * Math.abs(Math.sin(c.u * 500))); });
    paintHeadHair(B, grid, { scalp: Object.assign({ color: lin(0x3a2214), color2: lin(0x5a3a22), fine: 1.2, rough: 0.5 }, ZOEY_SCALP) });
    B.region(RECT.ponytail, (c) => {
      const st = strands(N, c.u, c.v * 0.5, 1.4);
      c.col = mul3(mix3(lin(0x3a2214), lin(0x5a3a22), N.blot.at(c.u * 2, c.v)), 0.4 + st * 0.8);
      c.rough = 0.5; c.h = st * 0.6;
      if (c.v < 0.1) { c.col = [0.02, 0.02, 0.025]; c.rough = 0.4; }
    });
  },
};
const ZOEY_SCALP = { front: 0.124, temple: 0.106, side: 0.08, nape: -0.02, peak: 0.006 };
function zoeyFringe(p, n, u, v, t) {
  // swept fringe: pull front hair down and to the side
  if (p[2] < -0.05 && p[1] > 0.07 && t > 0) {
    const k = sstep(-0.05, -0.09, p[2]) * sstep(0.07, 0.1, p[1]);
    p[1] -= 0.008 * k; p[0] += 0.006 * k * (p[0] > 0 ? 1 : 0.3); p[2] -= 0.004 * k;
  }
}
function ponytail(C) {
  const P = C.add(new C.Piece({ region: REG.HAIR, bone: BONE.HEAD, mat: 1, name: 'ponytail' }));
  const pts = [[0, 0.112, 0.07], [0, 0.1, 0.1], [0, 0.07, 0.125], [0.002, 0.02, 0.135], [0.005, -0.04, 0.128], [0.008, -0.1, 0.115], [0.01, -0.15, 0.1]];
  const rad = [[0.024, 0.02], [0.024, 0.02], [0.021, 0.018], [0.025, 0.02], [0.022, 0.017], [0.016, 0.012], [0.006, 0.005]];
  C.sweep(P, pts, rad, 10, RECT.ponytail, { up: [0, 0, 1], capEnd: true });
  for (let i = 0; i < P.count; i++) {
    const y = P.p[i * 3 + 1];
    C.setW(P, i, BONE.HEAD, BONE.TORSO, 1 - 0.5 * sstep(0.0, -0.13, y));
  }
}

// ----------------------------------------------------------------- Louis
SURV.louis = {
  spec: () => ({
    fat: 0.12, eyes: true,
    head: { skull: 1.03, nose: 1.12, noseLen: 0.95, lips: 1.2, jaw: 1.02, brow: 1.05, cheekW: 1.03, ear: 1.02 },
    hand: { curl: 0.5 }, foot: {},
    layers: [
      { kind: 'collar', mat: 0, h: 0.48, height: 0.036, off: 0.009, open: 0.3, flare: 0.008, drop: 0.006, rect: RECT.collar },
      { kind: 'tie', mat: 0, h0: 0.452, h1: 0.12, loose: true, rect: RECT.tie },
      { kind: 'sleeve', part: 'uarm', mat: 0, off: 0.011, t1: 1.04, bulge: (t, a) => 0.004 * gauss(post(a), 1.0) * sstep(0.4, 0.9, t) },
      { kind: 'sleeve', part: 'farm', mat: 0, off: 0.012, t0: -0.1, t1: 0.2, rect: RECT.cuff, bulge: (t) => 0.007 * Math.sin(clamp((t + 0.1) / 0.3, 0, 1) * Math.PI) },
      { custom: watch },
    ],
  }),
  paintA(A, grid) {
    const tone = lin(0x6a4430);
    paintHead(A, RECT.head, grid, { skin: tone, lips: lin(0x4a2a24), brow: lin(0x0e0a08), stubble: 0.35, stubbleCol: lin(0x100c0a), redness: 0.4, shaved: 1, scalp: { front: 0.13, temple: 0.112 }, dirt: 0.12, wrinkles: 0.3 });
    paintEye(A, RECT.eye, { iris: lin(0x3a2214) });
    const N = noise();
    const shirt = lin(0xe2e0da), slacks = lin(0x34353c);
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.07) {
        const nk = topTorso(N, c, { color: shirt, neck: 'crew', placket: true, pocket: true, pen: true, sweat: 0.6, fine: true });
        if (c.hh > nk + 0.02) skin(c, tone, { su: c.u * 3, sv: c.v * 2 });
        // open collar V showing skin at the throat
        if (c.hh > 0.44 && c.aa < 0.3 * (c.hh - 0.44) / 0.06 + 0.02) skin(c, tone, { su: c.u * 3, sv: c.v * 2 });
        // yoke seam at the back
        c.col = mul3(c.col, 1 - sstep(0.004, 0.0, Math.abs(c.hh - 0.4)) * sstep(2.2, 2.6, c.aa) * 0.2);
        applyDirt(c, 0.25, c.u * 3, c.v * 2);
        applyBlood(c, 0.14, c.u * 2, c.v);
      } else trouserTorso(N, c, { kind: 'slacks', color: slacks, beltColor: lin(0x0e0c0a) });
    });
    A.region(RECT.uarm, (c) => { partCoords('uarm', c); fabric(c, shirt, { su: c.u * 1.2, sv: c.t, folds: limbFolds(N, c, 'uarm') * 1.2, mottle: 0.08, scale: 1.4 }); applyDirt(c, 0.25, c.u * 2, c.t * 2); });
    A.region(RECT.farm, (c) => { partCoords('farm', c); armSkin(c, { tone, hair: 0.8 }, 'farm'); });
    A.region(RECT.cuff, (c) => { partCoords('farm', c); const f = Math.abs(Math.sin(c.t * 60)) * 0.5 + N.fine.at(c.u * 3, c.v * 3) * 0.3; fabric(c, shirt, { su: c.u, sv: c.v, folds: f * 0.5 }); c.col = mul3(c.col, 1 - sstep(0.06, 0.0, Math.abs(c.t - 0.02)) * 0.2); });
    paintHands(A, { tone, palm: lin(0xb88868), dirt: 0.2 });
    paintTrousers(A, { kind: 'slacks', color: slacks, dirt: 0.25 });
    paintFeet(A, { kind: 'dress', color: lin(0x0c0a0a), dirt: 0.25 });
    A.region(RECT.collar, (c) => { fabric(c, shirt, { su: c.u * 2, sv: c.v, mottle: 0.06 }); c.col = mul3(c.col, 1 - sstep(0.12, 0, Math.abs(c.v - 0.5)) * 0.08); applyDirt(c, 0.3, c.u * 3, c.v); });
    A.region(RECT.tie, (c) => {
      const d = Math.sin((c.u * 2 + c.v * 9) * Math.PI * 2) > 0.55 ? 1 : 0;
      c.col = mix3(lin(0x8a1a1a), lin(0x3a0a0e), d * 0.8);
      const f = N.fine.at(c.u * 6, c.v * 6);
      c.col = mul3(c.col, 0.9 + f * 0.15); c.rough = 0.45; c.h = f * 0.1;
    });
  },
  paintB(B) {
    B.region(RECT.extra0, (c) => { const face = c.u > 0.35 && c.u < 0.65 && c.v > 0.3 && c.v < 0.7; c.col = face ? [0.55, 0.55, 0.52] : [0.02, 0.02, 0.022]; c.rough = face ? 0.2 : 0.55; });
  },
};
function watch(C) {
  const P = new C.Piece({ region: REG.FARM, bone: BONE.FARMR, mat: 1, name: 'watch' });
  const k = C.armBulkL * C.armFat * C.thin * 0.96 + 0.04;
  C.tube(P, { ts: [0.84, 0.87, 0.9, 0.92], segs: 16, rect: RECT.extra0, aOff: Math.PI / 2, tA: 0.84, tB: 0.92,
    fn: (t, a, out) => { C.limbPoint(C.FARM_KEYS, t, a, k, k, null, out, 0.004 + 0.004 * gauss(Math.abs(adiff(a, 0)) - 0, 0.5)); out[1] = t; } });
  C.add(C.mirrorPiece(P)); // left wrist
}

// --------------------------------------------------------------- Francis
SURV.francis = {
  spec: () => ({
    muscle: 0.8, fat: 0.25, chest: 1.06, armBulk: 1.16, neck: 1.1, eyes: true, handScale: 1.08,
    head: { jaw: 1.14, brow: 1.22, nose: 1.1, chin: 1.15, cheekW: 1.06, ear: 1.05, crooked: 0.7, skull: 1.02 },
    hand: { curl: 0.55 }, foot: { boot: true, width: 1.06 },
    layers: [
      { kind: 'torso', mat: 1, off: 0.014, h0: -0.03, h1: 0.478, open: (h) => (h > 0.3 ? 0.32 + (h - 0.3) * 1.6 : 0.3), keep: (h, a) => !(h > 0.3 && h < 0.44 && Math.abs(Math.abs(a) - 1.62) < 0.5) },
      { kind: 'sleeve', part: 'uarm', mat: 0, off: 0.006, t0: -0.14, t1: 0.36, hem: true },
      { kind: 'leg', part: 'shin', mat: 0, off: 0.014, t0: 0.7, rect: RECT.boot },
      { kind: 'hair', mat: 1, thick: (p) => { const m = scalpMask(p, FRANCIS_SCALP); return m > 0.02 ? 0.0028 * m : -1; } },
      { kind: 'hair', mat: 1, thick: (p) => { const m = beardMask(p, FRANCIS_BEARD); return m > 0.01 ? 0.001 + m * (0.0015 + 0.005 * sstep(-0.035, -0.07, p[1])) : -1; } },
    ],
  }),
  paintA(A, grid) {
    const tone = lin(0xc8966e);
    paintHead(A, RECT.head, grid, { skin: tone, lips: lin(0x8a5a4a), brow: lin(0x1a120c), browThick: 1.5, stubble: 0.85, stubbleCol: lin(0x1a1410), wrinkles: 0.55, redness: 1.1, hair: lin(0x1e1610), scalp: FRANCIS_SCALP, beardShape: FRANCIS_BEARD, dirt: 0.3, scar: true });
    paintEye(A, RECT.eye, { iris: lin(0x4a3018), bloodshot: 0.45 });
    const N = noise();
    const tee = lin(0xd6d2c8), jeans = lin(0x2c3850);
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.06) { const nk = topTorso(N, c, { color: tee, neck: 'crew' }); if (c.hh > nk) skin(c, tone, { su: c.u * 3, sv: c.v * 2, red: 0.1 }); applyDirt(c, 0.45, c.u * 3, c.v * 2); applyBlood(c, 0.16, c.u * 2, c.v); }
      else trouserTorso(N, c, { kind: 'jeans', color: jeans, beltColor: lin(0x140e0a), bigBuckle: true });
    });
    const tat = francisTattoo;
    A.region(RECT.uarm, (c) => { partCoords('uarm', c); if (c.t < 0.36) { fabric(c, tee, { su: c.u, sv: c.t, folds: limbFolds(N, c, 'uarm') }); c.col = mul3(c.col, 1 - sstep(0.03, 0.0, Math.abs(c.t - 0.34)) * 0.12); applyDirt(c, 0.4, c.u * 2, c.t); } else armSkin(c, { tone, hair: 0.4, tattoo: tat, dirt: 0.2 }, 'uarm'); });
    A.region(RECT.farm, (c) => { partCoords('farm', c); armSkin(c, { tone, hair: 0.7, tattoo: tat, dirt: 0.3, blood: 0.1 }, 'farm'); });
    paintHands(A, { tone, dirt: 0.45, blood: 0.12 });
    paintTrousers(A, { kind: 'jeans', color: jeans, dirt: 0.5, fade: 0.1 });
    paintFeet(A, { kind: 'boot', color: lin(0x121010), buckle: true, dirt: 0.55 });
    A.region(RECT.boot, (c) => { partCoords('shin', c); leather(c, lin(0x121010), { su: c.u * 2, sv: c.t, folds: 0.35 * Math.max(0, Math.sin(c.t * 50 + c.a * 2)) }); const strap = sstep(0.02, 0.0, Math.abs(c.t - 0.8)); c.col = mul3(c.col, 1 - strap * 0.4); if (Math.abs(c.t - 0.8) < 0.018 && lat(c.a) < 0.25) { c.col = [0.5, 0.48, 0.44]; c.rough = 0.25; } applyDirt(c, 0.5, c.u * 3, c.t); });
  },
  paintB(B, grid) {
    const N = noise();
    const vest = lin(0x141210);
    B.region(RECT.torso, (c) => {
      T(c);
      const h = c.hh, sx = c.sx;
      leather(c, vest, { su: c.u * 2.5, sv: h * 3, folds: torsoFolds(N, c) * 0.8 });
      // stitched edges along the opening and hem
      const open = h > 0.3 ? 0.32 + (h - 0.3) * 1.6 : 0.3;
      const e = c.aa - open;
      const st = sstep(0.03, 0.02, e) * sstep(0.012, 0.018, e) * (Math.sin(h * 500) > 0 ? 1 : 0);
      c.col = mix3(c.col, [0.25, 0.22, 0.18], st * 0.6);
      const hem = sstep(0.012, 0.0, Math.abs(h + 0.015));
      c.col = mul3(c.col, 1 - hem * 0.3);
      // snaps down the front
      const snap = Math.hypot(Math.abs(sx) - open * 0.15 - 0.012, ((h + 0.02) % 0.09) - 0.045) < 0.006 && h < 0.35 ? 1 : 0;
      c.col = mix3(c.col, [0.5, 0.48, 0.45], snap); if (snap) c.rough = 0.2;
      // back patch: skull with wings in a circle + rockers
      if (c.aa > 2.3) {
        const bx = adiff(c.a0, Math.PI) * 0.15, by = h - 0.26;
        const r = Math.hypot(bx, by);
        let ink = 0, col = [0.7, 0.66, 0.58];
        if (r < 0.07) {
          ink = 1; col = [0.62, 0.1, 0.06];
          const skull = Math.hypot(bx / 1.1, by - 0.008) < 0.03 || (Math.abs(bx) < 0.015 && by < -0.012 && by > -0.036);
          if (skull) col = [0.8, 0.78, 0.7];
          const eyeh = Math.hypot(Math.abs(bx) - 0.011, by - 0.008) < 0.007;
          if (eyeh) col = [0.03, 0.03, 0.03];
          const wing = Math.abs(bx) > 0.032 && Math.abs(by - 0.01 + Math.abs(bx) * 0.2) < 0.012 * (1 + Math.sin(Math.abs(bx) * 300) * 0.3);
          if (wing) col = [0.75, 0.72, 0.62];
          if (Math.abs(r - 0.066) < 0.004) col = [0.75, 0.62, 0.3];
        }
        const rocker = Math.abs(Math.hypot(bx, by + 0.02) - 0.12) < 0.018 && by > 0.03;
        if (rocker) { ink = 1; col = Math.abs(Math.hypot(bx, by + 0.02) - 0.12) < 0.014 ? [0.62, 0.1, 0.06] : [0.75, 0.62, 0.3]; }
        if (ink) { c.col = mul3(col, 0.85 + N.fine.at(c.u * 8, c.v * 8) * 0.2); c.rough = 0.85; c.h = 0.2; }
      }
      // small front patch
      const fp = rectMask(sx, h, -0.13, -0.07, 0.3, 0.34, 0.002);
      if (fp[0] > 0.5) { c.col = [0.6, 0.12, 0.08]; c.rough = 0.85; }
      c.col = mix3(c.col, [0.7, 0.62, 0.3], fp[1] * 0.8);
      applyDirt(c, 0.35, c.u * 3, c.v * 2);
    });
    paintHeadHair(B, grid, { scalp: Object.assign({ color: lin(0x1e1610), fine: 2 }, FRANCIS_SCALP), beard: Object.assign({ color: lin(0x2e2218), color2: lin(0x4a3828) }, FRANCIS_BEARD) });
  },
};
const FRANCIS_SCALP = { front: 0.13, temple: 0.112, side: 0.082, nape: -0.02 };
const FRANCIS_BEARD = { goatee: true, width: 1.05 };
function francisTattoo(c, part) {
  const N = noise();
  const a = c.a, t = c.t;
  const ink = [0.04, 0.06, 0.09];
  if (part === 'uarm') {
    // tribal flames rising from the elbow over the lateral/posterior side
    const x = adiff(a, Math.PI / 2);
    const f = Math.sin(x * 4 + t * 3) * 0.3 + N.fbm.at(c.u * 1.5, t * 0.8) * 0.6;
    const flame = (Math.sin(x * 6 + f * 3) * 0.5 + 0.5) - (1 - t) * 1.3 + 0.3;
    const edge = sstep(0.48, 0.52, flame) * sstep(0.4, 0.5, t);
    // eagle / skull medallion on the lateral upper arm
    const px = x * 0.06, py = (t - 0.55) * 0.29;
    const r = Math.hypot(px, py);
    if (r < 0.034 && t < 0.8) {
      const sk = Math.hypot(px / 1.1, py - 0.004) < 0.018;
      const eye = Math.hypot(Math.abs(px) - 0.007, py - 0.004) < 0.005;
      if (Math.abs(r - 0.031) < 0.003) return [1, ink];
      if (sk && !eye) return [0.9, [0.5, 0.48, 0.42]];
      if (eye) return [1, ink];
      return [0.85, [0.35, 0.06, 0.05]];
    }
    return [edge, ink];
  }
  // forearm: rose + barbed band near the wrist + script band
  const x = adiff(a, Math.PI);
  const px = x * 0.045, py = (t - 0.4) * 0.3;
  const r = Math.hypot(px, py);
  if (r < 0.03) {
    const ang = Math.atan2(py, px);
    const petal = Math.sin(ang * 5 + r * 300) * 0.5 + 0.5;
    if (Math.abs(petal - 0.5) < 0.12 || r > 0.027) return [1, ink];
    return [0.9, [0.45, 0.05, 0.06]];
  }
  if (Math.abs(py) < 0.05 && Math.abs(px) < 0.05 && Math.abs(Math.abs(px) - 0.04) < 0.012 && py < 0) return [0.9, [0.08, 0.28, 0.1]]; // leaves
  const band = Math.abs(t - 0.75) < 0.03 ? (Math.abs(Math.sin(a * 12 + t * 40)) < 0.3 ? 1 : Math.abs(t - 0.75) > 0.024 ? 1 : 0) : 0;
  if (band) return [0.9, ink];
  const flame2 = N.fbm.at(c.u * 2, t) + Math.sin(adiff(a, 0) * 5) * 0.15 - t * 0.5;
  return [sstep(0.5, 0.53, flame2) * sstep(0.35, 0.25, t), ink];
}

// ============================================================= specials ==
const zombieSkin = (hex, c, o = {}) => skin(c, lin(hex), Object.assign({ su: c.u * 2, sv: c.v * 2, decay: 0.8, veins: 0.6, red: -0.1, rough: 0.45 }, o));
SPEC.hunter = {
  spec: () => ({
    muscle: 0.35, thin: 0.35, eyes: false,
    head: { gaunt: 0.7, socket: 1.25, jawDrop: 0.006, mouthOpen: 0.003, brow: 1.1 },
    hand: { curl: 0.3, spread: 0.3, claw: 0.012 }, foot: { chunky: 0.4 },
    layers: [
      { kind: 'torso', mat: 1, off: 0.015, h0: -0.12, h1: 0.5 },
      { kind: 'sleeve', part: 'uarm', mat: 1, off: 0.014 },
      { kind: 'sleeve', part: 'farm', mat: 1, off: 0.013, t1: 0.97, hem: true },
      { kind: 'hood', mat: 1, thick: hunterHood, warp: hunterHoodWarp, minOff: 0.004, neckFollow: 0.75 },
      { kind: 'sleeve', part: 'farm', mat: 1, off: 0.019, t0: 0.5, t1: 0.66, rect: RECT.extra0 },
      { kind: 'sleeve', part: 'farm', mat: 1, off: 0.018, t0: 0.78, t1: 0.92, rect: RECT.extra0 },
      { kind: 'leg', part: 'shin', mat: 0, off: 0.009, t0: 0.4, t1: 0.52, rect: RECT.extra1 },
    ],
  }),
  paintA(A, grid) {
    const N = noise();
    paintHead(A, RECT.head, grid, { skin: lin(0x8a8478), lips: lin(0x3a2426), decay: 1, veins: 0.8, sunken: 0.8, redness: 0.2, dirt: 0.4, blood: 0.9, stubble: 0.4 });
    A.region(RECT.torso, (c) => { T(c); if (c.hh > 0.06) zombieSkin(0x8a8478, c); else trouserTorso(N, c, { kind: 'jeans', color: lin(0x1e2436), belt: false }); });
    A.region(RECT.uarm, (c) => { partCoords('uarm', c); zombieSkin(0x8a8478, c); });
    A.region(RECT.farm, (c) => { partCoords('farm', c); zombieSkin(0x8a8478, c); applyBlood(c, 0.4, c.u * 2, c.v); });
    paintHands(A, { tone: lin(0x7a7468), dirt: 0.6, blood: 0.5, nails: [0.1, 0.08, 0.06] });
    paintTrousers(A, { kind: 'jeans', color: lin(0x1e2436), dirt: 0.7, blood: 0.2, fade: 0.1 });
    paintFeet(A, { kind: 'sneaker', color: lin(0x3a3a3c), sole: [0.45, 0.43, 0.4], dirt: 0.8 });
    A.region(RECT.extra1, (c) => { const f = Math.abs(Math.sin(c.v * 40 + c.u * 6)); c.col = mul3([0.42, 0.42, 0.4], 0.8 + f * 0.25); c.rough = 0.5; c.h = f * 0.3; applyDirt(c, 0.6, c.u * 2, c.v); });
  },
  paintB(B, grid) {
    const N = noise();
    const hood = lin(0x2a3240);
    B.region(RECT.torso, (c) => {
      T(c);
      fabric(c, hood, { su: c.u * 3, sv: c.hh * 4, folds: torsoFolds(N, c) * 1.2, mottle: 0.2 });
      const e = Math.max(Math.abs(c.a0) - 0.62 + (c.hh - 0.07) * 0.9, Math.abs(c.hh - 0.14) - 0.075);
      c.col = mul3(c.col, 1 - sstep(0.012, 0, Math.abs(e)) * 0.35);
      c.col = mix3(c.col, [0.55, 0.53, 0.5], sstep(0.03, 0.012, Math.abs(c.aa - 0.13)) * sstep(0.34, 0.36, c.hh) * sstep(0.5, 0.48, c.hh));
      if (c.hh < -0.06) c.col = mul3(c.col, 0.85 + 0.15 * Math.abs(Math.sin(c.u * 300)));
      applyDirt(c, 0.6, c.u * 3, c.v * 2); applyBlood(c, 0.35, c.u * 2, c.v);
    });
    for (const part of ['uarm', 'farm']) B.region(RECT[part], (c) => { partCoords(part, c); fabric(c, hood, { su: c.u, sv: c.t, folds: limbFolds(N, c, part) * 1.2, mottle: 0.2 }); applyDirt(c, 0.6, c.u * 2, c.t); applyBlood(c, part === 'farm' ? 0.4 : 0.2, c.u * 2, c.t); });
    B.region(RECT.head, (c) => {
      fabric(c, hood, { su: c.u * 2, sv: c.v * 2, folds: foldField(N, c.u * 3, c.v * 3) * 1.3, mottle: 0.2 });
      c.col = mul3(c.col, 0.8);
      applyDirt(c, 0.5, c.u * 2, c.v * 2);
    });
    // duct tape
    B.region(RECT.extra0, (c) => { const w = N.ridge.at(c.u * 3, c.v * 2); c.col = mul3([0.55, 0.55, 0.53], 0.8 + w * 0.3); c.rough = 0.45; c.h = w * 0.4 + (Math.abs(Math.sin(c.v * 22)) < 0.1 ? -0.3 : 0); applyDirt(c, 0.7, c.u * 3, c.v); applyBlood(c, 0.3, c.u * 2, c.v); });
  },
};
function hunterHood(p) {
  const x = p[0], y = p[1], z = p[2], ax = Math.abs(x);
  // face opening
  const inOpen = z < 0.0 && ax < 0.06 - Math.max(0, -0.01 - y) * 0.15 && y < 0.07 && y > -0.085;
  if (inOpen && z < -0.03) return -1;
  if (y < -0.13) return -1;
  return 0.02 + 0.014 * sstep(0.0, 0.08, z) + 0.008 * sstep(0.05, 0.15, y);
}
function hunterHoodWarp(p, n, u, v, t) {
  // pull the rim forward over the brow so the eyes stay in shadow
  if (p[2] < -0.02 && p[1] > 0.02) { const k = sstep(-0.02, -0.08, p[2]) * sstep(0.02, 0.09, p[1]); p[2] -= 0.022 * k; p[1] -= 0.008 * k; }
  if (p[1] < -0.06) p[2] += 0.01;
}

SPEC.smoker = {
  spec: () => ({
    thin: 1.0, fat: -0.3, eyes: false,
    head: { gaunt: 1.0, swell: 1.3, socket: 1.35, jawDrop: 0.012, mouthOpen: 0.004, nose: 0.9, neck: 0.9 },
    hand: { curl: 0.45, spread: 0.25, fingerLen: 1.18 }, foot: {},
    layers: [
      { kind: 'torso', mat: 1, off: 0.012, h0: 0.0, h1: 0.49, keep: smokerHoles },
      { kind: 'sleeve', part: 'uarm', mat: 1, off: 0.01, t1: 0.5, hem: true },
      { custom: (C) => boils(C, 0x8a7a4a, [[0.045, 0.01, -0.06, 0.03], [0.058, -0.02, -0.04, 0.026], [0.05, -0.06, -0.02, 0.028], [0.035, -0.09, 0.0, 0.03], [0.06, 0.03, -0.03, 0.02], [0.03, -0.03, -0.075, 0.018], [0.065, -0.05, 0.02, 0.022]], BONE.HEAD) },
      { custom: (C) => boils(C, 0x8a7a4a, [[0.07, 0.42, -0.06, 0.035], [0.1, 0.44, -0.02, 0.03], [0.05, 0.46, 0.02, 0.028], [0.13, 0.4, 0.03, 0.025]], BONE.TORSO) },
    ],
  }),
  paintA(A, grid) {
    const N = noise();
    const t0 = 0x6a7058;
    paintHead(A, RECT.head, grid, { skin: lin(t0), lips: lin(0x3a2a24), decay: 1, veins: 1, sunken: 0.9, redness: 0.1, dirt: 0.5, blood: 0.5, stubble: 0.6,
      post: (c, p) => { const sw = Math.exp(-(((p[0] - 0.045) / 0.035) ** 2) - ((p[1] / 0.045) ** 2) - (((p[2] + 0.05) / 0.05) ** 2)); c.col = mix3(c.col, [0.4, 0.36, 0.2], sw * 0.6); } });
    A.region(RECT.torso, (c) => { T(c); if (c.hh > 0.04) { zombieSkin(t0, c, { decay: 1 }); const rib = Math.pow(Math.max(0, Math.sin(c.hh * 95)), 3) * sstep(0.12, 0.2, c.hh) * sstep(0.38, 0.3, c.hh); c.col = mul3(c.col, 1 - rib * 0.3); c.h -= rib * 0.4; } else trouserTorso(N, c, { kind: 'slacks', color: lin(0x3a3228) }); });
    for (const part of ['uarm', 'farm']) A.region(RECT[part], (c) => { partCoords(part, c); zombieSkin(t0, c, { decay: 1 }); });
    paintHands(A, { tone: lin(0x5a6048), dirt: 0.6, blood: 0.3, nails: [0.12, 0.1, 0.05] });
    paintTrousers(A, { kind: 'slacks', color: lin(0x3a3228), dirt: 0.7, blood: 0.15 });
    paintFeet(A, { kind: 'dress', color: lin(0x2a1e14), dirt: 0.8 });
    A.region(RECT.extra0, (c) => { const r = Math.hypot(c.u - 0.5, c.v - 0.5); c.col = mix3([0.55, 0.45, 0.2], [0.3, 0.12, 0.08], sstep(0.2, 0.45, r)); c.rough = 0.25; c.skin = 0.5; c.h = -r; });
  },
  paintB(B) {
    const N = noise();
    const shirt = lin(0x6a5a3e);
    B.region(RECT.torso, (c) => { T(c); fabric(c, shirt, { su: c.u * 3, sv: c.hh * 4, folds: torsoFolds(N, c) * 1.3, mottle: 0.3 }); applyDirt(c, 0.9, c.u * 3, c.v * 2); applyBlood(c, 0.3, c.u * 2, c.v); });
    B.region(RECT.uarm, (c) => { partCoords('uarm', c); fabric(c, shirt, { su: c.u, sv: c.t, folds: limbFolds(N, c, 'uarm'), mottle: 0.3 }); applyDirt(c, 0.9, c.u * 3, c.t); });
  },
};
function smokerHoles(h, a) {
  const N = noise();
  const u = a / TAU + 0.5;
  return N.fbm.at(u * 2.3, h * 2.5 + 0.3) < 0.66 || h > 0.42;
}
// Pustules / tumours: small spheres merged onto the surface of a bone.
function boils(C, hex, list, bone) {
  const P = C.add(new C.Piece({ region: REG.TORSO, bone, mat: 0, name: 'boils' }));
  for (const [x, y, z, r] of list) {
    const k = P.count;
    C.ellipsoid(P, [0, 0, 0], [r, r * 0.9, r], 8, 6, RECT.extra0);
    for (let i = k; i < P.count; i++) {
      P.p[i * 3] += x; P.p[i * 3 + 1] += y; P.p[i * 3 + 2] += z;
      if (bone === BONE.TORSO) {
        // place relative to the torso surface (y given in metres above pelvis)
        P.p[i * 3 + 1] /= TORSO_LEN;
      }
    }
  }
  if (bone === BONE.TORSO) C.weightTorso(P, C.spec);
}

SPEC.boomer = {
  spec: () => ({
    fat: 2.4, muscle: 0, eyes: false, neck: 1.6, armBulk: 1.05, legBulk: 1.2, handFat: 1.25,
    head: { swell: 0.8, jaw: 1.35, cheekW: 1.25, neck: 1.7, gaunt: 0, chin: 1.3, socket: 1.2, mouthOpen: 0.003 },
    bumps: (h, a) => 0.012 * Math.max(0, Math.sin(a * 7 + h * 30) * Math.sin(a * 3 - h * 40)) * gauss(h - 0.12, 0.25),
    hand: { curl: 0.5, spread: 0.2 }, foot: { width: 1.2 },
    layers: [
      { custom: (C) => { const L = []; const r = rng(55); for (let i = 0; i < 26; i++) { const a = (r() - 0.5) * 5.2, h = -0.05 + r() * 0.45; const p = [0, 0, 0]; torsoPoint(h, a, C.spec, p, -0.006); L.push([p[0], h, p[2], 0.012 + r() * 0.022]); } boils(C, 0, L, BONE.TORSO); } },
      { custom: (C) => boils(C, 0, [[0.05, 0.0, -0.07, 0.014], [-0.055, 0.02, -0.06, 0.012], [0.06, -0.06, -0.02, 0.018], [-0.03, -0.08, -0.05, 0.016], [0.0, 0.1, -0.06, 0.01]], BONE.HEAD) },
    ],
  }),
  paintA(A, grid) {
    const N = noise();
    const t0 = 0x9a9868;
    paintHead(A, RECT.head, grid, { skin: lin(t0), lips: lin(0x5a4a34), decay: 0.9, veins: 0.9, sunken: 0.5, redness: 0.1, dirt: 0.5, blood: 0.7 });
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.02) {
        zombieSkin(t0, c, { decay: 1, veins: 1 });
        const stretch = sstep(0.8, 0.95, N.ridge.at(c.u * 6, c.v * 1.2)) * gauss(c.hh - 0.1, 0.15);
        c.col = mix3(c.col, [0.55, 0.42, 0.38], stretch * 0.6); c.h -= stretch * 0.2;
        const bile = sstep(0.55, 0.8, N.blot.at(c.u * 2, c.v * 2)) * gauss(c.hh - 0.35, 0.15) * gauss(c.a0, 0.8);
        c.col = mix3(c.col, [0.25, 0.28, 0.05], bile * 0.7); c.rough = lerp(c.rough, 0.2, bile);
      } else trouserTorso(N, c, { kind: 'slacks', color: lin(0x3a3428) });
    });
    for (const part of ['uarm', 'farm']) A.region(RECT[part], (c) => { partCoords(part, c); zombieSkin(t0, c, { decay: 1 }); });
    paintHands(A, { tone: lin(0x8a8858), dirt: 0.6, blood: 0.2 });
    paintTrousers(A, { kind: 'slacks', color: lin(0x3a3428), dirt: 0.8, blood: 0.1 });
    paintFeet(A, { kind: 'dress', color: lin(0x2a2018), dirt: 0.7 });
    A.region(RECT.extra0, (c) => { const r = Math.hypot(c.u - 0.5, c.v - 0.5); c.col = mix3([0.7, 0.62, 0.3], [0.45, 0.3, 0.14], sstep(0.15, 0.45, r)); c.rough = 0.2; c.skin = 0.6; c.h = -r * 0.5; });
  },
  paintB() {},
};

SPEC.tank = {
  spec: () => ({
    muscle: 2.2, chest: 1.45, hump: 1.5, hunchW: 1.3, armBulkR: 2.85, armBulkL: 2.45, legBulk: 1.35, neck: 2.0, eyes: false, handScale: 1.85,
    headScale: 0.84, headDrop: 0.035,
    head: { skull: 0.95, brow: 1.5, jaw: 1.3, gaunt: 0.2, socket: 1.2, nose: 0.9, neck: 2.2, mouthOpen: 0.002 },
    hand: { curl: 0.72 }, foot: { bare: true, width: 1.25 },
    layers: [
      { kind: 'leg', part: 'thigh', mat: 0, off: 0.01, t0: -0.2, t1: 0.75, rect: RECT.extra1, keep: (t, a) => t < 0.55 + 0.15 * Math.sin(a * 5) },
    ],
  }),
  paintA(A, grid) {
    const N = noise();
    const t0 = 0xa07e6c;
    const muscleShade = (c, amp) => { const f = N.ridge.at(c.u * 3, c.v * 2.5); c.col = mul3(c.col, 1 - sstep(0.7, 0.9, f) * amp); c.h -= sstep(0.7, 0.9, f) * amp; };
    paintHead(A, RECT.head, grid, { skin: lin(t0), lips: lin(0x5a3a30), decay: 0.8, veins: 1, sunken: 0.6, redness: 0.4, dirt: 0.5, blood: 0.5, scar: true });
    A.region(RECT.torso, (c) => {
      T(c);
      if (c.hh > 0.02) {
        zombieSkin(t0, c, { decay: 0.7, veins: 1.2 });
        const abs = sstep(0.004, 0.0, Math.abs(c.sx)) * sstep(0.02, 0.06, c.hh) * sstep(0.3, 0.26, c.hh) + sstep(0.004, 0, Math.abs(((c.hh - 0.04) % 0.06) - 0.03)) * sstep(0.08, 0.02, Math.abs(c.sx)) * sstep(0.3, 0.26, c.hh);
        const pec = sstep(0.006, 0.0, Math.abs(c.hh - 0.27 + Math.abs(c.sx) * 0.3)) * sstep(0.2, 0.05, Math.abs(c.sx)) * sstep(1.2, 0.6, c.aa);
        c.col = mul3(c.col, 1 - (abs + pec) * 0.35); c.h -= (abs + pec) * 0.5;
        muscleShade(c, 0.15);
      } else trouserTorso(N, c, { kind: 'jeans', color: lin(0x262a36), belt: false });
    });
    for (const part of ['uarm', 'farm']) A.region(RECT[part], (c) => { partCoords(part, c); zombieSkin(t0, c, { decay: 0.7, veins: 1.4 }); muscleShade(c, 0.2); applyBlood(c, 0.2, c.u * 2, c.v); });
    paintHands(A, { tone: lin(0x906e5c), dirt: 0.7, blood: 0.4, nails: [0.15, 0.1, 0.07] });
    for (const part of ['thigh', 'shin']) A.region(RECT[part], (c) => { partCoords(part, c); zombieSkin(t0, c, { decay: 0.7, veins: 1 }); applyDirt(c, 0.7, c.u * 2, c.v); });
    A.region(RECT.extra1, (c) => { partCoords('thigh', c); denim(c, lin(0x262a36), { su: c.u, sv: c.t, folds: limbFolds(N, c, 'thigh') }); const fr = sstep(0.5, 0.56, c.t + 0.08 * Math.sin(c.a * 17)); c.col = mul3(c.col, 1 - fr * 0.4); applyDirt(c, 0.8, c.u * 3, c.t); applyBlood(c, 0.2, c.u * 2, c.t); });
    paintFeet(A, { kind: 'bare', tone: lin(0x8a6a5a), dirt: 1, blood: 0.2 });
  },
  paintB() {},
};

SPEC.witch = {
  spec: () => ({
    female: 1, thin: 1.4, bust: 0.45, fat: -0.35, eyes: true,
    head: { gaunt: 0.55, socket: 1.25, jaw: 0.9, nose: 0.85, lips: 0.8, mouthOpen: 0.0025 },
    hand: { curl: 0.28, spread: 0.3, claw: 0.075, fingerLen: 1.38 }, handScale: 1.05, foot: { bare: true, width: 0.9 },
    layers: [
      { kind: 'torso', mat: 1, off: 0.008, h0: -0.12, h1: 0.4, extendBelow: { n: 5, len: 0.34 }, flareFrom: -0.12, flare: 0.5, keep: witchHem, skirtWeights: true, rect: RECT.torso },
      { kind: 'hair', mat: 1, thick: (p) => { const m = scalpMask(p, { front: 0.12, temple: 0.1, nape: -0.03 }); return m > 0.02 ? m * 0.012 : -1; } },
      { custom: witchHair },
    ],
  }),
  paintA(A, grid) {
    const N = noise();
    const t0 = 0xc8c2ba;
    paintHead(A, RECT.head, grid, { skin: lin(t0), lips: lin(0x6a4a50), decay: 0.6, veins: 1.2, sunken: 0.8, redness: 0.1, dirt: 0.25, blood: 0.6, hair: lin(0xd8d6ce), scalp: { front: 0.12 } });
    paintEye(A, RECT.eye, { iris: [0.9, 0.12, 0.05], sclera: [0.6, 0.45, 0.4], bloodshot: 1, glow: [1, 0.2, 0.05] });
    for (const part of ['torso', 'uarm', 'farm', 'thigh', 'shin']) A.region(RECT[part], (c) => { partCoords(part, c); if (part === 'torso') T(c); zombieSkin(t0, c, { decay: 0.6, veins: 1.2 }); applyBlood(c, part === 'farm' ? 0.5 : 0.15, c.u * 2, c.v); });
    paintHands(A, { tone: lin(0xb8b2aa), blood: 0.6, nails: [0.08, 0.06, 0.05] });
    paintFeet(A, { kind: 'bare', tone: lin(0xb8b2aa), dirt: 0.8 });
  },
  paintB(B, grid) {
    const N = noise();
    B.region(RECT.torso, (c) => { T(c); fabric(c, lin(0xc8c2b8), { su: c.u * 3, sv: c.hh * 4, folds: torsoFolds(N, c) * 1.3, mottle: 0.25, scale: 1.4 }); applyDirt(c, 0.6, c.u * 3, c.v * 2); applyBlood(c, 0.45, c.u * 2, c.v); if (c.hh > 0.3) { const strap = sstep(0.02, 0.01, Math.abs(c.aa - 0.7)); c.col = mul3(c.col, 1 - strap * 0.2); } });
    B.region(RECT.head, (c) => { const st = strands(N, c.u, c.v, 1.3); c.col = mul3([0.78, 0.77, 0.72], 0.5 + st * 0.6); c.rough = 0.55; c.h = st * 0.5; });
    B.region(RECT.ponytail, (c) => { const st = strands(N, c.u, c.v * 0.3, 1.5); c.col = mul3([0.78, 0.77, 0.72], 0.45 + st * 0.65); c.rough = 0.55; c.h = st * 0.5; applyBlood(c, 0.2 * c.v, c.u * 2, c.v); });
  },
  emissiveA: (E) => { E.region(RECT.eye, (c) => { const ph = (c.u - 0.5) * TAU, th = (1 - c.v) * Math.PI; const z = -Math.cos(ph) * Math.sin(th); c.col = z < -0.6 ? [1.0, 0.18, 0.05] : [0, 0, 0]; }); },
};
function witchHem(h, a) {
  if (h > 0.3 && Math.abs(Math.abs(a) - 1.57) < 0.55) return false; // arm holes
  if (h > 0.34 && Math.abs(a) < 0.5) return false; // neckline
  const N = noise();
  return h > -0.4 + N.fbm.at(a / TAU + 0.5, 0.3) * 0.18;
}
function witchHair(C) {
  const r = rng(31);
  const P = C.add(new C.Piece({ region: REG.HAIR, bone: BONE.HEAD, mat: 1, name: 'witchhair' }));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + (r() - 0.5) * 0.3;
    const dx = Math.sin(a), dz = -Math.cos(a);
    const front = dz < -0.3;
    const len = front ? 0.28 + r() * 0.12 : 0.34 + r() * 0.16;
    const pts = [], rad = [];
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      const rr = 0.085 + 0.02 * s + (front ? 0.012 * s : 0);
      pts.push([dx * rr * 0.9 + Math.sin(s * 3 + i) * 0.01, 0.11 - s * len, dz * rr * 1.05 + (front ? -0.018 * s : 0.02 * s)]);
      const w = (0.03 - 0.022 * s) * (0.8 + r() * 0.4);
      rad.push([w, 0.006 * (1 - s * 0.6)]);
    }
    const k0 = P.count;
    C.sweep(P, pts, rad, 6, RECT.ponytail, { up: [dx, 0, dz], capEnd: true });
    for (let q = k0; q < P.count; q++) { const y = P.p[q * 3 + 1]; C.setW(P, q, BONE.HEAD, BONE.TORSO, 1 - 0.55 * sstep(0.0, -0.2, y)); }
  }
}

// Generic fallback survivor from colours (unknown characters)
function genericRecipe(look) {
  const tone = lin(look.skin ?? 0xc49a7a);
  return {
    spec: () => ({ eyes: true, female: look.female ? 1 : 0 }),
    paintA(A, grid) {
      const N = noise();
      paintHead(A, RECT.head, grid, { skin: tone, hair: lin(look.hair ?? 0x2a2018) });
      paintEye(A, RECT.eye, {});
      A.region(RECT.torso, (c) => { T(c); if (c.hh > 0.06) topTorso(N, c, { color: lin(look.shirt ?? 0x777777) }); else trouserTorso(N, c, { kind: 'jeans', color: lin(look.pants ?? 0x333344) }); });
      A.region(RECT.uarm, (c) => { partCoords('uarm', c); fabric(c, lin(look.shirt ?? 0x777777), {}); });
      A.region(RECT.farm, (c) => { partCoords('farm', c); armSkin(c, { tone }, 'farm'); });
      paintHands(A, { tone });
      paintTrousers(A, { kind: 'jeans', color: lin(look.pants ?? 0x333344) });
      paintFeet(A, { kind: 'sneaker', color: lin(look.shoes ?? 0x1a1612) });
    },
    paintB() {},
  };
}

// ============================================================== assets ==
const cache = new Map();
export function getCharacterAsset(look) {
  const id = look?.id || 'generic';
  const key = id + ':' + TEX_SIZE + (id === 'generic' ? JSON.stringify(look) : '');
  if (cache.has(key)) return cache.get(key);
  const R = SURV[id] || SPEC[id] || genericRecipe(look || {});
  const spec = Object.assign({ lod: 'hi' }, R.spec());
  const built = buildBody(spec, { skinned: true });
  const grid = headGrid(Object.assign({}, spec.head, { female: spec.female || 0 }), 96, 72);
  const S = TEX_SIZE;
  const A = new Atlas(S);
  R.paintA(A, grid);
  A.dilate(4);
  const B = new Atlas(S);
  B.alpha = new Float32Array(S * S);
  R.paintB(B, grid);
  B.dilate(4);
  const emisA = R.emissiveA ? emissiveTex(R.emissiveA) : null;
  const emisB = R.emissive ? emissiveTex(R.emissive) : null;
  const texA = { albedo: A.albedoTexture(), normal: A.normalTexture(0.75), orm: A.ormTexture() };
  const texB = { albedo: B.albedoTexture(), normal: B.normalTexture(0.75), orm: B.ormTexture() };
  const matA = characterMaterial(texA, { emissiveMap: emisA, emissiveIntensity: 2.5 });
  const matB = characterMaterial(texB, { emissiveMap: emisB, emissiveIntensity: 3, clothWrap: 0.3, alphaTest: 0.5 });
  const asset = {
    id, geometry: built.geometry, materials: [matA, matB], bindInv: built.bind.inv, textures: { A: texA, B: texB },
    radius: (spec.hump ? 1.5 : spec.fat > 1 ? 1.3 : 1),
    // first-person arm description (viewmodel): forearm sleeves, bulk, hand size
    viewSleeves: (spec.layers || []).filter((l) => l.kind === 'sleeve' && l.part === 'farm'),
    armBulk: (spec.armBulkR ?? spec.armBulk ?? 1) * (1 - (spec.female || 0) * 0.14) * (1 + (spec.fat || 0) * 0.18),
    handScale: spec.handScale ?? (1 - (spec.female || 0) * 0.1),
  };
  cache.set(key, asset);
  return asset;
}
function emissiveTex(fn) {
  const E = new Atlas(128);
  E.region([0, 0, 1, 1], (c) => { c.col = [0, 0, 0]; });
  fn(E);
  return E.albedoTexture();
}
export { SURV, SPEC };
