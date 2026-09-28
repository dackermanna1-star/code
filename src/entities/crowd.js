// Instanced renderer for common infected. The whole horde is ONE draw call
// (plus one per shadow map): a single continuous skinned body mesh (see
// partgeo.buildBody) drawn with instancing, with every instance's 12 bone
// frames and its appearance record stored in a float data texture that the
// vertex/fragment shaders read with texelFetch(gl_InstanceID).
//
// Appearance is fully procedural per instance: female / heavy / emaciated body
// morphs, outfit archetypes per location (civilians, office workers, hospital
// patients and staff, police, construction and airport crews...), garment
// cuts, patterns, optional accessories (hoods, skirts, coats, caps, hard hats,
// ties, long hair, backpacks, ear defenders), torn clothes exposing grey-green
// flesh, bite wounds, dried blood (capped), grime, hair styles and bald
// patches, and faintly glowing sunken eyes. Severed bones collapse into
// bloody stumps.
import * as THREE from 'three';
import { J, NBONES, boneMatrices, footMatrix as _footMatrix } from './body.js';
import { buildBody, bindMatrices, RECT, REG, ACC, headGrid, sampleHead, TORSO_LEN } from './partgeo.js';
import { Atlas, noise, rng, sstep, PARTMAP } from './charpaint.js';
import { patchLighting } from './charshade.js';

export const footMatrix = _footMatrix;

const DATA_W = 52; // 36 bone texels (12 bones x 3 rows) + 16 appearance texels
const LOOK0 = 36;

// Head shape shared by all commons (sunken, gaunt, slack-jawed)
const CROWD_HEAD = { gaunt: 0.75, socket: 1.3, mouthOpen: 0.0022, jawDrop: 0.007, brow: 1.12, cheek: 1.1, lips: 0.85, neck: 0.95 };

// ============================================================ textures ==
let SHARED = null;
function sharedAssets() {
  if (SHARED) return SHARED;
  const t0 = performance.now();
  const atlas = paintCrowdAtlas(1024);
  SHARED = {
    detail: atlas.rawTexture(),
    normal: atlas.normalTexture(1.1),
    noise: crowdNoise(),
  };
  SHARED.ms = performance.now() - t0;
  return SHARED;
}

// Tileable noise (repeat): R tears, G blood + drips, B wound spots / bald patches, A pattern / strands
function crowdNoise() {
  const S = 256, d = new Uint8Array(S * S * 4);
  const N = noise();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    const tear = N.fbm.at(u * 2, v * 2) * 0.65 + N.ridge.at(u * 3, v * 1.5) * 0.35;
    const drip = N.fbm.at(u * 6, v * 0.75);
    const blood = Math.min(1, N.blot.at(u * 2, v * 2) * 0.75 + drip * 0.45);
    const cell = N.cell.at(u * 2, v * 2);
    const spot = Math.min(1, (1 - cell) * 0.7 + N.fine.at(u, v) * 0.35);
    const pat = N.fine.at(u * 1.5, v * 1.5) * 0.6 + N.fbm.at(u * 4, v * 4) * 0.4;
    d[i] = tear * 255; d[i + 1] = blood * 255; d[i + 2] = spot * 255; d[i + 3] = pat * 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Detail atlas. Channels per region:
//  head : R eye mask, G skin luminance, B mouth (lips .33, teeth .66, cavity 1), A hair field
//  body : R cloth luminance, G skin luminance, B fixed wounds / bites, A grime
//  hand : B nails ; foot : B sole (1) / laces (.5) ; accessories: R material, B details
function paintCrowdAtlas(S) {
  const A = new Atlas(S);
  A.a4 = new Float32Array(S * S);
  const N = noise();
  const grid = headGrid(CROWD_HEAD, 64, 48);
  const p = [0, 0, 0], n = [0, 0, 0];
  const TAU = Math.PI * 2;
  // ---------------------------------------------------------------- head
  A.region(RECT.head, (c) => {
    const ao = sampleHead(grid, c.u, c.v, p, n);
    const x = p[0], y = p[1], z = p[2], ax = Math.abs(x);
    const su = c.u * 2.2, sv = c.v * 1.4;
    let lum = 0.8 * (0.5 + 0.5 * ao);
    // sunken sockets & cheek hollows
    const eyeD = Math.hypot((ax - 0.032) / 0.021, (y - 0.054) / 0.017, (z + 0.09) / 0.03);
    lum *= 1 - 0.45 * sstep(1.6, 0.6, eyeD);
    lum *= 1 - 0.18 * Math.exp(-(((ax - 0.05) / 0.016) ** 2 + ((y + 0.0) / 0.02) ** 2));
    // veins at temples / neck, wrinkles, mottling
    const vein = sstep(0.8, 0.92, N.ridge.at(su * 2, sv * 2));
    lum *= 1 - vein * 0.25 * (sstep(0.03, 0.06, ax) + sstep(-0.04, -0.09, y));
    lum *= 0.92 + N.fbm.at(su * 2, sv * 2) * 0.16;
    // brows (dark)
    const bx = ax - 0.033, by = y - (0.076 + 0.005 * Math.cos(bx * 40));
    const brow = sstep(0.027, 0.02, Math.abs(bx)) * sstep(0.0045, 0.0015, Math.abs(by)) * (z < -0.07 ? 1 : 0);
    lum *= 1 - brow * 0.55;
    // nostrils, mouth line
    const nos = Math.exp(-(((ax - 0.0085) / 0.0045) ** 2 + ((y - 0.006) / 0.003) ** 2 + ((z + 0.108) / 0.01) ** 2));
    lum *= 1 - nos * 0.8;
    // eyes (glow mask)
    const ed = Math.hypot((ax - 0.032) / 0.0125, (y - 0.056) / 0.0085);
    const eye = sstep(1.0, 0.55, ed) * (z < -0.07 ? 1 : 0);
    // mouth: lips, teeth, cavity (open slack mouth)
    const my = y + 0.02;
    const mouthD = Math.hypot(x / 0.0175, my / 0.0048);
    const lipD = Math.hypot(x / 0.021, my / 0.0125);
    let m = 0;
    if (z < -0.085) {
      if (lipD < 1) m = 0.33;
      if (mouthD < 1.35) m = 0.66;
      if (mouthD < 0.8) m = 1.0;
    }
    // hair field: 0.5 at a typical hairline, 1 deep in the scalp
    const back = sstep(0.0, 0.06, z);
    const line = 0.088 - 0.045 * sstep(-0.03, 0.03, z) - 0.07 * back - 0.012 * sstep(0.055, 0.07, ax) * (1 - back);
    let hf = 0.5 + (y - line) * 11;
    const earZone = sstep(0.07, 0.08, ax) * sstep(0.085, 0.02, y) * (1 - back);
    hf -= earZone * 0.6;
    hf += (N.fine.at(su * 6, sv * 6) - 0.5) * 0.08;
    c.col = [eye, Math.min(1, lum), m];
    c.a4 = Math.max(0, Math.min(1, hf));
    c.h = (1 - ao) * -0.3 + brow * 0.15 + (m > 0.3 && m < 0.5 ? 0.1 : 0) + (N.fine.at(su * 4, sv * 4) - 0.5) * 0.12;
  });
  // ------------------------------------------------------ body regions
  const bite = (cx, cy, x, y, r = 0.018) => {
    // ring of tooth marks + torn centre
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx / 1.2, dy);
    const ang = Math.atan2(dy, dx);
    const ring = sstep(0.004, 0.0, Math.abs(d - r)) * (Math.cos(ang * 7) > 0.2 ? 1 : 0.3);
    const core = sstep(r * 0.75, r * 0.3, d);
    return Math.max(ring * 0.8, core);
  };
  const clothFolds = (su, sv, k = 1) => {
    const f1 = N.ridge.at(su * 1.1, sv * 2.2), f2 = N.fbm.at(su * 1.7, sv * 1.2);
    return Math.max(0, (f1 - 0.55) * 1.6) * 0.6 * k + (f2 - 0.5) * 0.2;
  };
  A.region(RECT.torso, (c) => {
    const m = PARTMAP.torso;
    const a = (c.u - 0.5) * TAU, t = m.tA + c.v * (m.tB - m.tA), h = t * TORSO_LEN;
    const aa = Math.abs(a);
    const su = c.u * 3, sv = c.v * 2;
    // folds: waist bunching, armpit diagonals, back drape
    let fold = clothFolds(su, sv);
    fold += 0.35 * Math.max(0, Math.sin(h * 110 + N.fbm.at(su, sv) * 4)) * sstep(0.2, 0.08, Math.abs(h - 0.1));
    fold += 0.3 * Math.max(0, Math.sin((h * 60 + aa * 3) + N.fbm.at(su * 2, sv) * 3)) * sstep(0.12, 0.0, Math.abs(h - 0.33)) * sstep(0.5, 0.9, aa) * sstep(1.6, 1.2, aa);
    const seam = sstep(0.018, 0.004, Math.abs(aa - Math.PI / 2) * 0.16) + sstep(0.005, 0.001, Math.abs(h - 0.445)) * sstep(0.8, 1.2, aa);
    const weave = N.fine.at(su * 8, sv * 8);
    const cloth = 0.8 * (1 - fold * 0.35) * (1 - seam * 0.25) * (0.94 + weave * 0.1);
    // skin: ribs, collarbones, navel, veins, bruises
    let sk = 0.8;
    const ribs = Math.pow(Math.max(0, Math.sin(h * 95)), 3) * sstep(0.12, 0.2, h) * sstep(0.38, 0.3, h) * sstep(0.3, 0.9, aa) * sstep(2.6, 2.0, aa);
    sk *= 1 - ribs * 0.25;
    sk *= 1 - 0.3 * Math.exp(-(((h - 0.1) / 0.008) ** 2) - ((a / 0.05) ** 2));
    sk *= 1 - 0.18 * sstep(0.004, 0.0, Math.abs(h - 0.425 + 0.02 * Math.cos(a * 2))) * sstep(0.2, 0.4, aa) * sstep(1.2, 0.9, aa);
    sk *= 1 - 0.25 * sstep(0.82, 0.93, N.ridge.at(su * 1.5, sv * 1.5));
    sk *= 0.9 + N.blot.at(su, sv) * 0.2;
    // wounds (fixed bites / gashes), intensity scaled per instance
    let w = 0;
    const sx = a * 0.15; // ~metres around
    w = Math.max(w, bite(-0.15, 0.46, sx, h));
    w = Math.max(w, bite(0.24, 0.16, sx, h, 0.022));
    w = Math.max(w, bite(0.42, 0.31, sx, h, 0.02));
    const gash = sstep(0.006, 0.0, Math.abs((h - 0.24) - (sx + 0.1) * 0.5)) * sstep(0.08, 0.0, Math.abs(sx + 0.1));
    w = Math.max(w, gash);
    const grime = sstep(0.4, 0.8, N.blot.at(su * 1.2 + 0.4, sv * 1.2) * 0.7 + (0.3 - h) * 0.5);
    c.col = [cloth, sk, w];
    c.a4 = grime;
    c.h = -fold * 0.6 + seam * 0.25 + weave * 0.06 - ribs * 0.1 - w * 0.3;
  });
  const limb = (rect, part) => A.region(rect, (c) => {
    const m = PARTMAP[part];
    const a = (c.u - 0.5) * TAU + m.aOff, t = m.tA + c.v * (m.tB - m.tA);
    const su = c.u * 2, sv = c.v * 2.5;
    let fold = clothFolds(su, sv, 0.8);
    const joint = part === 'uarm' ? sstep(0.25, 0.0, Math.abs(t - 1.0)) : part === 'farm' ? sstep(0.2, 0.0, Math.abs(t)) : part === 'thigh' ? sstep(0.2, 0.0, Math.abs(t - 1.0)) + sstep(0.12, 0, Math.abs(t)) * 0.5 : sstep(0.2, 0, Math.abs(t)) + sstep(0.15, 0, Math.abs(t - 0.95)) * 0.8;
    fold += joint * 0.5 * Math.max(0, Math.sin(t * 90 + N.fbm.at(su, sv) * 5));
    const seamD = Math.min(Math.abs(Math.sin(a / 2)), Math.abs(Math.cos(a / 2))) * 0.05; // at a = 0 / pi
    const seam = sstep(0.004, 0.001, Math.abs(Math.sin((a + Math.PI / 2) / 1)) * 0.05) ;
    const weave = N.fine.at(su * 8, sv * 8);
    const cloth = 0.8 * (1 - fold * 0.35) * (1 - seam * 0.2) * (0.94 + weave * 0.1);
    let sk = 0.8 * (0.9 + N.blot.at(su, sv) * 0.2);
    const vein = sstep(0.8, 0.92, N.ridge.at(su * 0.8, sv * 2.5));
    sk *= 1 - vein * (part === 'farm' ? 0.35 : 0.2);
    let w = 0;
    if (part === 'farm') { w = Math.max(bite(0.0, 0.45 * 0.3, (a - 0.3) * 0.04, t * 0.3, 0.016), bite(0.0, 0.7 * 0.3, (a + 2.5) * 0.04, t * 0.3, 0.015)); }
    if (part === 'uarm') w = bite(0.0, 0.35 * 0.29, (a - 2.2) * 0.05, t * 0.29, 0.018);
    if (part === 'shin') w = bite(0.0, 0.3 * 0.47, a * 0.05, t * 0.47, 0.02);
    if (part === 'thigh') w = sstep(0.006, 0, Math.abs((t * 0.45 - 0.2) - a * 0.03)) * sstep(0.06, 0, Math.abs(t * 0.45 - 0.2));
    const scratch = sstep(0.0025, 0.0, Math.abs(((a * 0.04 + t * 0.1) % 0.05 + 0.05) % 0.05 - 0.025)) * sstep(0.7, 0.8, N.fbm.at(su * 2, sv));
    w = Math.max(w, scratch * 0.6);
    const grime = sstep(0.45, 0.85, N.blot.at(su + 0.2, sv) * 0.7 + (part === 'shin' ? 0.35 * c.v : part === 'farm' ? 0.2 : 0));
    c.col = [cloth, sk, w];
    c.a4 = grime;
    c.h = -fold * 0.6 + seam * 0.2 + weave * 0.06 - w * 0.3 + vein * 0.1;
  });
  limb(RECT.uarm, 'uarm'); limb(RECT.farm, 'farm'); limb(RECT.thigh, 'thigh'); limb(RECT.shin, 'shin');
  // ---------------------------------------------------------------- hand
  A.region(RECT.hand, (c) => {
    const su = c.u * 2, sv = c.v * 2;
    let sk = 0.8 * (0.88 + N.blot.at(su, sv) * 0.24);
    let nail = 0, knuckle = 0;
    if (c.u < 0.45) { // palm tube: u around (0.5 of the sub-rect = back of hand), v along
      const lu = c.u / 0.45;
      const back = sstep(0.3, 0.05, Math.abs(lu - 0.5));
      knuckle = back * sstep(0.85, 0.95, c.v) * (0.5 + 0.5 * Math.cos(lu * 60));
      sk *= 1 - sstep(0.82, 0.93, N.ridge.at(su * 2, sv)) * back * 0.4;
    } else if (c.u >= 0.5) { // fingers
      const lu = ((c.u - 0.5) % 0.1) / 0.1;
      const dors = sstep(0.28, 0.12, Math.abs(lu - 0.5));
      nail = dors * sstep(0.74, 0.8, c.v) * sstep(0.98, 0.94, c.v);
      knuckle = dors * (Math.exp(-(((c.v - 0.45) / 0.03) ** 2)) + Math.exp(-(((c.v - 0.7) / 0.025) ** 2)));
    }
    sk *= 1 - knuckle * 0.25;
    c.col = [0.8, sk, nail];
    c.a4 = sstep(0.5, 0.8, N.blot.at(su + 0.5, sv));
    c.h = knuckle * -0.2 + nail * 0.2 + (N.fine.at(su * 5, sv * 5) - 0.5) * 0.08;
  });
  // ---------------------------------------------------------------- feet
  A.region(RECT.foot, (c) => {
    const a = (c.u - 0.5) * TAU, t = c.v;
    const aa = Math.abs(a);
    const sole = sstep(1.9, 2.1, aa);
    const soleLine = sstep(0.05, 0.0, Math.abs(aa - 2.0));
    const lace = sstep(0.5, 0.3, aa) * sstep(0.28, 0.35, t) * sstep(0.62, 0.55, t);
    const laceLines = lace * (Math.sin(t * 160) > 0.3 ? 1 : 0.4);
    const toe = sstep(0.8, 0.85, t) * sstep(1.2, 0.6, aa);
    const toeGap = (1 - sole) * sstep(0.85, 0.9, t) * (Math.abs(Math.sin(a * 5)) < 0.15 ? 1 : 0);
    const stitch = soleLine * (Math.sin(t * 300) > 0 ? 1 : 0.6) + sstep(0.01, 0, Math.abs(t - 0.78)) * sstep(1.4, 1.0, aa) * 0.6;
    c.col = [0.8 * (1 - stitch * 0.3) * (1 - soleLine * 0.4), 0.8 * (1 - toeGap * 0.5), sole > 0.5 ? 1 : laceLines > 0.5 ? 0.5 : 0];
    c.a4 = sstep(0.4, 0.8, N.blot.at(c.u * 2, c.v * 2) * 0.6 + (sole * 0.3));
    c.h = -soleLine * 0.4 + laceLines * 0.2 + toe * 0.05 - toeGap * 0.3 + (N.fine.at(c.u * 4, c.v * 4) - 0.5) * 0.08;
  });
  // --------------------------------------------------------- accessories
  const accFill = (rect, fn) => A.region(rect, (c) => {
    const su = c.u * 2 + rect[0] * 7, sv = c.v * 2 + rect[1] * 5;
    const f = clothFolds(su, sv, 0.7);
    const weave = N.fine.at(su * 6, sv * 6);
    c.col = [0.8 * (1 - f * 0.3) * (0.95 + weave * 0.08), 0.8, 0];
    c.a4 = sstep(0.5, 0.85, N.blot.at(su, sv));
    c.h = -f * 0.5 + weave * 0.05;
    if (fn) fn(c, su, sv);
  });
  accFill(RECT.acc0); // hood
  accFill(RECT.acc1, (c) => { const pleat = Math.pow(Math.abs(Math.sin(c.u * Math.PI * 14)), 0.5); c.col[0] *= 0.85 + pleat * 0.15 * c.v; c.h += pleat * 0.2 * c.v; if (c.v > 0.95) c.col[0] *= 0.8; });
  accFill(RECT.acc2, (c) => { // coat: pockets, lapels, buttons
    const a = (c.u - 0.5) * TAU, aa = Math.abs(a);
    const h = 0.5 - c.v * 1.02;
    const pocket = sstep(0.01, 0.0, Math.abs(Math.max(Math.abs(aa - 0.8) - 0.28, Math.abs(h + 0.05) - 0.07))) ;
    const lapel = sstep(0.18, 0.28, h) * sstep(0.9, 0.5, aa);
    const button = (aa < 0.2 && Math.abs(aa - 0.13) < 0.05 && Math.abs(((h + 1) % 0.09) - 0.045) < 0.012 && h < 0.2 && h > -0.1) ? 1 : 0;
    c.col[0] *= 1 - pocket * 0.35 - lapel * 0.12;
    c.col[2] = Math.max(lapel * 0.5, button);
    c.h += -pocket * 0.3 + lapel * 0.1 + button * 0.3;
  });
  accFill(RECT.acc3, (c) => { const logo = c.v < 0.7 && Math.hypot((c.u - 0.5) * 3, (c.v - 0.35) * 3) < 0.35 ? 1 : 0; const panel = sstep(0.02, 0, Math.abs(((c.u * 6) % 1) - 0.5) - 0.48); c.col[2] = logo; c.col[0] *= 1 - panel * 0.3; });
  accFill(RECT.acc4, (c) => { const band = c.v < 0.35 ? 1 : 0; const badge = Math.hypot((c.u - 0.5) * 4, (c.v - 0.55) * 3) < 0.25 ? 1 : 0; c.col[2] = badge ? 1 : band ? 0.5 : 0; });
  accFill(RECT.acc5, (c) => { c.col[0] = 0.82 + N.fine.at(c.u * 6, c.v * 6) * 0.06 - sstep(0.85, 0.95, N.ridge.at(c.u * 3, c.v * 3)) * 0.2; const st = Math.hypot((c.u - 0.75) * 4, (c.v - 0.5) * 3) < 0.3 ? 1 : 0; c.col[2] = st; c.h = 0; });
  accFill(RECT.acc6, (c) => { const s = Math.sin((c.u * 3 + c.v * 12) * Math.PI * 2) > 0.6 ? 1 : 0; c.col[2] = s; c.col[0] = 0.85; });
  accFill(RECT.acc7, (c) => { const s = N.fine.at(c.u * 14, c.v * 1.5) * 0.6 + N.fbm.at(c.u * 8, c.v) * 0.4; c.col[0] = 0.55 + s * 0.5; c.h = s * 0.3; });
  accFill(RECT.acc8, (c) => { const zip = sstep(0.012, 0.0, Math.abs(c.v - 0.62)) * sstep(0.35, 0.2, Math.abs(c.u - 0.5)); const pk = sstep(0.01, 0, Math.abs(Math.max(Math.abs(c.u - 0.5) - 0.12, Math.abs(c.v - 0.35) - 0.12))); c.col[2] = Math.max(zip, pk) * 0.6; c.col[0] *= 1 - zip * 0.3 - pk * 0.3; });
  accFill(RECT.acc9);
  A.dilate(3);
  return A;
}

// ============================================================ material ==
const VERT_PARS = /* glsl */`
uniform highp sampler2D uData;
attribute vec4 aSkin;
attribute vec2 aLocal;
attribute vec3 aMorphF;
attribute vec3 aMorphB;
flat varying int vInst;
varying vec4 vReg;
varying vec2 vLoc;
vec3 cwP; vec3 cwN;
vec4 cwFetch( int x ) { return texelFetch( uData, ivec2( x, gl_InstanceID ), 0 ); }
void crowdSkin() {
  vec4 L6 = cwFetch( ${LOOK0 + 6} );
  vec4 L8 = cwFetch( ${LOOK0 + 8} );
  vec4 L9 = cwFetch( ${LOOK0 + 9} );
  vec4 L13 = cwFetch( ${LOOK0 + 13} );
  int ireg = int( aSkin.w + 0.5 );
  vec3 pos = position + aMorphF * L8.z + aMorphB * L8.w;
  bool hide = false;
  if ( ireg >= 10 ) {
    int acc = ireg - 10;
    int flags = int( L6.w + 0.5 );
    if ( ( ( flags >> acc ) & 1 ) == 0 ) hide = true;
    if ( acc == 2 && pos.y < 0.97 ) pos.y = 0.97 + ( pos.y - 0.97 ) * L9.w;
  }
  if ( ireg == 0 || ireg == 2 || ireg == 12 ) pos += normal * L13.x;
  else if ( ireg == 3 ) pos += normal * L13.x * 0.7;
  int b0 = int( aSkin.x + 0.5 ), b1 = int( aSkin.y + 0.5 );
  float w = aSkin.z;
  vec4 p4 = vec4( pos, 1.0 );
  vec4 r0 = cwFetch( b0 * 3 ), r1 = cwFetch( b0 * 3 + 1 ), r2 = cwFetch( b0 * 3 + 2 );
  vec3 P = vec3( dot( r0, p4 ), dot( r1, p4 ), dot( r2, p4 ) );
  vec3 N = vec3( dot( r0.xyz, normal ), dot( r1.xyz, normal ), dot( r2.xyz, normal ) );
  if ( w < 0.999 ) {
    vec4 s0 = cwFetch( b1 * 3 ), s1 = cwFetch( b1 * 3 + 1 ), s2 = cwFetch( b1 * 3 + 2 );
    vec3 P1 = vec3( dot( s0, p4 ), dot( s1, p4 ), dot( s2, p4 ) );
    vec3 N1 = vec3( dot( s0.xyz, normal ), dot( s1.xyz, normal ), dot( s2.xyz, normal ) );
    P = mix( P1, P, w ); N = mix( N1, N, w );
  }
  if ( hide ) P = vec3( 0.0 );
  cwP = P; cwN = normalize( N + vec3( 0.0, 1e-5, 0.0 ) );
  int sv = int( L6.z + 0.5 );
  float st = 0.0;
  if ( ( ( sv >> b0 ) & 1 ) == 1 ) st += w;
  if ( ( ( sv >> b1 ) & 1 ) == 1 ) st += 1.0 - w;
  float side = ( b0 == 2 || b0 == 3 || b0 == 6 || b0 == 7 || b0 == 10 ) ? -1.0 : ( ( b0 == 4 || b0 == 5 || b0 == 8 || b0 == 9 || b0 == 11 ) ? 1.0 : 0.0 );
  vInst = gl_InstanceID;
  vReg = vec4( aSkin.w, st, side, 0.0 );
  vLoc = aLocal;
}
`;

const FRAG_PARS = /* glsl */`
uniform sampler2D uDetail;
uniform sampler2D uNoiseT;
uniform highp sampler2D uData;
flat varying int vInst;
varying vec4 vReg;
varying vec2 vLoc;
float cwRough; vec3 cwEmis; float cwNK;
vec4 cwL( int k ) { return texelFetch( uData, ivec2( ${LOOK0} + k, vInst ), 0 ); }
float cwBand( float x, float a, float b, float e ) { return smoothstep( a - e, a + e, x ) * ( 1.0 - smoothstep( b - e, b + e, x ) ); }
vec3 cwPattern( int pat, vec3 c1, vec3 c2, vec2 p ) {
  if ( pat == 1 ) { // plaid
    vec2 q = fract( p * 7.0 );
    float a = step( 0.55, q.x ), b = step( 0.55, q.y );
    float thin = max( step( 0.9, fract( p.x * 14.0 + 0.2 ) ), step( 0.9, fract( p.y * 14.0 + 0.2 ) ) );
    vec3 c = mix( c1, c2, ( a + b ) * 0.42 );
    return mix( c, c * 0.5 + c2 * 0.15, thin * 0.6 );
  }
  if ( pat == 2 ) return mix( c1, c2, step( 0.5, fract( p.y * 11.0 ) ) );
  if ( pat == 3 ) { vec2 g = fract( p * 18.0 ) - 0.5; return mix( c1, c2, smoothstep( 0.2, 0.13, length( g ) ) ); }
  if ( pat == 4 ) return mix( c1, c2, step( 0.93, fract( p.x * 22.0 ) ) * 0.7 );
  if ( pat == 5 ) { float n = texture2D( uNoiseT, p * 0.9 ).a; return mix( c1, c2, smoothstep( 0.5, 0.56, n ) ); }
  return c1;
}
vec3 crowdSurface( vec2 auv ) {
  vec4 D = texture2D( uDetail, auv );
  int reg = int( vReg.x + 0.5 );
  float st = vReg.y, side = vReg.z;
  vec4 L0 = cwL( 0 ), L1 = cwL( 1 ), L2 = cwL( 2 ), L3 = cwL( 3 ), L4 = cwL( 4 ), L5 = cwL( 5 ), L6 = cwL( 6 ), L7 = cwL( 7 );
  vec4 L8 = cwL( 8 ), L9 = cwL( 9 ), L10 = cwL( 10 ), L11 = cwL( 11 ), L12 = cwL( 12 ), L13 = cwL( 13 ), L14 = cwL( 14 ), L15 = cwL( 15 );
  int topS = int( L1.w + 0.5 ), botS = int( L2.w + 0.5 ), outS = int( L3.w + 0.5 ), accS = int( L4.w + 0.5 ), hairS = int( L5.w + 0.5 );
  int pat = int( L10.x + 0.5 );
  float decay = L0.w;
  vec2 seed = L8.xy;
  float u = vLoc.x, t = vLoc.y;
  vec2 nco = vec2( u, t * 0.45 ) + seed + vec2( float( reg ) * 0.37, float( reg ) * 0.13 );
  vec4 NZ = texture2D( uNoiseT, nco * vec2( 1.6, 2.4 ) );
  float skinLum = D.g * 1.25;
  vec3 skinC = L0.rgb * ( 0.88 + 0.24 * texture2D( uNoiseT, nco * 0.8 + 0.5 ).a );
  vec3 flesh = skinC * skinLum;
  vec3 col = flesh;
  float rough = 0.5, skinM = 1.0, isC = 0.0, gloss = 0.0;
  vec3 cc = vec3( 0.5 );
  vec3 emis = vec3( 0.0 );
  float clothLum = D.r * 1.25;
  float bloodBias = 0.0;
  bool outerSleeve = ( outS == 1 || outS >= 3 ) && outS != 2 && outS != 9;
  if ( reg == 0 ) {
    // ------------------------------------------------------------ torso
    float h = t * ${TORSO_LEN.toFixed(4)};
    float a = ( u - 0.5 ) * 6.2831853, aa = abs( a );
    vec2 sp = vec2( a * 0.15, h );
    float waist = 0.07;
    bool bare = botS == 4;
    float topLow = ( topS == 1 || topS == 5 || topS == 10 ) ? waist - 0.005 : ( topS == 4 ? -1.0 : ( topS == 7 ? 0.03 : -0.05 ) );
    float neck = 0.49 - 0.022 * smoothstep( 1.2, 0.0, aa );
    if ( topS == 8 || topS == 7 ) neck = 0.49 - 0.12 * max( 0.0, 1.0 - aa / 0.55 );
    else if ( topS == 1 || topS == 5 || topS == 9 || topS == 10 ) neck = 0.505 - 0.065 * max( 0.0, 1.0 - aa / 0.3 );
    else if ( topS == 3 ) neck = 0.4 - 0.05 * smoothstep( 1.2, 0.0, aa );
    else if ( topS == 4 ) neck = 0.47 - 0.03 * smoothstep( 1.0, 0.0, aa );
    else if ( topS == 2 || topS == 6 ) neck = 0.5 - 0.012 * smoothstep( 1.2, 0.0, aa );
    float topCover = step( topLow, h ) * step( h, neck );
    if ( topS == 3 && h > 0.36 ) topCover = step( h, 0.5 ) * max( cwBand( aa, 0.45, 0.72, 0.02 ), cwBand( aa, 2.35, 2.65, 0.02 ) );
    if ( topS == 4 && aa > 2.85 && h > -0.08 ) topCover = 0.0;
    float ty = 0.0;
    if ( h < waist && !bare ) { cc = L2.rgb; isC = 1.0; ty = 2.0;
      if ( botS == 0 ) { // jeans: back pockets, front pocket curves, fly seam
        float bp = max( abs( aa - 2.55 ) - 0.32, abs( h + 0.035 ) - 0.055 );
        cc *= 1.0 - 0.3 * smoothstep( 0.01, 0.0, abs( bp ) );
        cc *= 1.0 - 0.25 * smoothstep( 0.008, 0.0, abs( length( vec2( ( aa - 1.05 ) * 0.15, h - 0.07 ) ) - 0.06 ) ) * step( aa, 1.3 );
        cc *= 1.0 - 0.3 * smoothstep( 0.012, 0.0, abs( a * 0.15 - 0.012 ) ) * step( -0.1, h ) * step( h, 0.03 );
      }
    }
    if ( topCover > 0.5 ) { cc = cwPattern( pat, L1.rgb, L11.rgb, sp ); isC = 1.0; ty = 1.0; }
    if ( bare && h < waist && topCover < 0.5 ) { cc = vec3( 0.55, 0.53, 0.5 ); isC = 1.0; }
    // belt
    bool tucked = topLow > 0.0 || topS == 3;
    if ( !bare && tucked && botS != 6 && botS != 7 && abs( h - ( waist - 0.006 ) ) < 0.016 ) {
      cc = vec3( 0.03, 0.025, 0.02 ); isC = 1.0; gloss = 0.4;
      if ( abs( a ) < 0.09 && abs( h - ( waist - 0.006 ) ) < 0.012 ) { cc = vec3( 0.45, 0.42, 0.36 ); gloss = 0.8; }
      if ( topS == 5 && L13.y > 0.5 ) { float pouch = step( 0.6, fract( a * 2.2 ) ); cc *= 1.0 + pouch * 0.6; }
    }
    if ( ty == 1.0 ) {
      if ( topS == 1 || topS == 5 || topS == 9 || topS == 10 ) {
        cc *= 1.0 - 0.18 * smoothstep( 0.008, 0.0, abs( abs( a ) - 0.035 ) ) * step( h, neck );
        float bt = step( length( vec2( a * 0.14, mod( h - 0.02, 0.075 ) - 0.037 ) ), 0.0055 ) * step( h, neck - 0.02 ) * step( waist, h ) * step( abs( a ), 0.05 );
        cc = mix( cc, vec3( 0.6, 0.58, 0.55 ), bt );
        // collar band
        cc *= 1.0 - 0.25 * smoothstep( 0.006, 0.0, abs( h - neck + 0.012 ) ) * step( 0.25, aa );
      }
      if ( topS == 1 || topS == 8 || topS == 9 || topS == 5 ) {
        float e = max( abs( a + 0.5 ) - 0.2, abs( h - 0.32 ) - 0.055 );
        cc *= 1.0 - 0.3 * smoothstep( 0.012, 0.0, abs( e ) );
        if ( topS == 5 ) { float e2 = max( abs( a - 0.5 ) - 0.2, abs( h - 0.32 ) - 0.055 ); cc *= 1.0 - 0.3 * smoothstep( 0.012, 0.0, abs( e2 ) );
          cc *= 1.0 - 0.3 * smoothstep( 0.01, 0.0, abs( h - 0.365 ) ) * step( abs( abs( a ) - 0.5 ), 0.2 ); }
      }
      if ( topS == 2 ) {
        float e = max( abs( a ) - 0.62 + ( h - 0.07 ) * 0.9, abs( h - 0.14 ) - 0.075 );
        cc *= 1.0 - 0.3 * smoothstep( 0.012, 0.0, abs( e ) );
        cc = mix( cc, vec3( 0.8, 0.78, 0.74 ), smoothstep( 0.03, 0.012, abs( abs( a ) - 0.13 ) ) * cwBand( h, 0.36, 0.49, 0.004 ) );
        cc *= 1.0 - 0.2 * step( h, 0.0 ) * step( -0.05, h ); // ribbed hem
      }
      if ( topS == 5 ) {
        float badge = step( length( vec2( ( a + 0.5 ) * 0.15, h - 0.4 ) ), 0.017 ) * step( 0.5, L13.y );
        cc = mix( cc, vec3( 0.7, 0.55, 0.2 ), badge ); gloss += badge;
        cc = mix( cc, vec3( 0.05 ), step( abs( a - 0.5 ), 0.14 ) * step( abs( h - 0.4 ), 0.009 ) * 0.8 );
        cc = mix( cc, L11.rgb, cwBand( aa, 1.3, 1.85, 0.03 ) * step( 0.425, h ) );
      }
      if ( topS == 7 ) cc *= 1.0 - 0.2 * smoothstep( 0.01, 0.0, abs( h - neck + 0.008 ) );
      if ( pat == 6 ) {
        float n = texture2D( uNoiseT, vec2( a * 0.35, h * 1.5 ) + seed ).a;
        cc = mix( cc, L11.rgb, step( aa, 0.45 ) * cwBand( h, 0.2, 0.38, 0.01 ) * step( 0.48, n ) );
      }
    }
    if ( outS == 1 || outS == 6 || outS == 7 || outS == 8 ) {
      float open = ( outS == 7 || outS == 8 ) ? 0.0 : 0.14 + 0.12 * smoothstep( 0.2, 0.46, h );
      if ( step( -0.07, h ) * step( h, 0.51 ) * step( open, aa ) > 0.5 ) {
        cc = L3.rgb; isC = 1.0; ty = 3.0;
        if ( outS == 7 ) { cc *= 1.0 - 0.5 * smoothstep( 0.012, 0.0, abs( a * 0.15 ) ); gloss = 0.45; }
        else if ( outS == 8 ) { cc *= 0.86 + 0.14 * abs( sin( h * 70.0 ) ); cc *= 1.0 - 0.4 * smoothstep( 0.01, 0.0, abs( a * 0.15 ) ); }
        else cc *= 1.0 - 0.35 * smoothstep( 0.03, 0.0, aa - open );
        if ( outS == 6 ) cc *= 0.9 + 0.1 * abs( sin( a * 40.0 ) );
        if ( h < -0.04 ) cc *= 0.85;
      }
    }
    if ( outS == 2 || outS == 9 ) {
      float arm = cwBand( aa, 1.15, 1.95, 0.03 ) * step( 0.3, h );
      if ( step( 0.0, h ) * step( h, 0.475 ) * ( 1.0 - arm ) * step( 0.035, aa ) > 0.5 ) {
        cc = L3.rgb; isC = 1.0; ty = 3.0;
        if ( outS == 2 ) {
          float s = max( max( cwBand( h, 0.14, 0.18, 0.004 ), cwBand( h, 0.26, 0.3, 0.004 ) ), cwBand( aa, 0.42, 0.58, 0.01 ) * step( 0.3, h ) );
          cc = mix( cc, vec3( 0.62, 0.64, 0.62 ), s );
          emis += vec3( 0.06, 0.06, 0.05 ) * s;
          gloss += s * 0.5;
        } else { cc *= 0.9 + 0.1 * step( 0.5, fract( h * 14.0 ) ); gloss = 0.1; }
      }
    }
    if ( accS == 3 ) {
      float ly = abs( aa - ( 0.33 - ( 0.5 - h ) * 0.85 ) );
      cc = mix( cc, L4.rgb, smoothstep( 0.035, 0.015, ly ) * cwBand( h, 0.3, 0.5, 0.005 ) );
      float card = step( abs( a ), 0.2 ) * cwBand( h, 0.22, 0.3, 0.003 );
      cc = mix( cc, vec3( 0.8, 0.8, 0.78 ), card ); if ( card > 0.5 ) isC = 1.0;
    }
    if ( accS == 2 && h > 0.43 && h < 0.53 ) { cc = L4.rgb * ( 0.85 + 0.15 * sin( a * 12.0 + h * 40.0 ) ); isC = 1.0; }
    if ( ( ( int( L6.w + 0.5 ) >> 8 ) & 1 ) == 1 && ty != 3.0 ) { // backpack straps
      float strap = smoothstep( 0.04, 0.025, abs( aa - 0.65 - ( 0.45 - h ) * 0.2 ) ) * step( 0.12, h );
      strap = max( strap, smoothstep( 0.05, 0.03, abs( aa - 2.45 ) ) * step( 0.1, h ) );
      cc = mix( cc, L15.rgb * 0.6, strap ); isC = max( isC, strap );
    }
    bloodBias = 0.25 * smoothstep( 0.25, 0.45, h ) * smoothstep( 1.0, 0.2, aa );
  } else if ( reg == 1 ) {
    // ------------------------------------------------------------- head
    float hf = D.a, hl = L10.z;
    float hm = 0.0;
    if ( hairS == 1 ) hm = smoothstep( hl, hl + 0.05, hf ) * 0.55;
    else if ( hairS >= 2 && hairS <= 4 ) hm = smoothstep( hl, hl + 0.035, hf );
    else if ( hairS == 5 ) hm = smoothstep( hl, hl + 0.035, hf ) * smoothstep( 0.62, 0.52, texture2D( uNoiseT, nco * 2.5 ).b );
    float strand = texture2D( uNoiseT, vec2( u * 9.0, t * 0.7 ) + seed ).a;
    vec3 hc = L5.rgb * ( 0.65 + 0.7 * strand );
    // stubble (men)
    float beard = ( 1.0 - L8.z ) * L11.w * smoothstep( 0.18, 0.12, abs( u - 0.5 ) ) * cwBand( t, 0.3, 0.46, 0.02 ) * step( D.b, 0.2 );
    col = mix( col, L5.rgb * 0.45, beard * ( 0.4 + 0.3 * strand ) );
    col = mix( col, hc, hm ); skinM = 1.0 - hm; rough = mix( rough, 0.75, hm );
    if ( hairS == 6 ) { float capm = smoothstep( 0.28, 0.33, hf ); col = mix( col, L5.rgb * ( 0.85 + 0.15 * strand ), capm ); skinM *= 1.0 - capm; isC = 0.0; rough = mix( rough, 0.9, capm ); }
    // mouth
    float m = D.b;
    if ( m > 0.83 ) { col = vec3( 0.03, 0.008, 0.006 ); skinM = 0.0; }
    else if ( m > 0.5 ) { col = vec3( 0.32, 0.27, 0.18 ) * ( 0.6 + 0.4 * strand ); skinM = 0.0; rough = 0.3; }
    else if ( m > 0.2 ) { col = mix( col, vec3( 0.1, 0.04, 0.05 ) * skinLum, 0.7 ); rough = 0.35; }
    // eyes
    float e = D.r;
    col = mix( col, vec3( 0.28, 0.25, 0.16 ), e );
    emis += vec3( 1.0, 0.78, 0.42 ) * L10.w * e * e * 0.9;
    skinM *= 1.0 - e; rough = mix( rough, 0.12, e );
    // surgical mask
    if ( L14.y > 0.5 ) {
      float mk = smoothstep( 0.17, 0.15, abs( u - 0.5 ) ) * cwBand( t, 0.33, 0.5, 0.01 );
      vec3 mc = L14.y > 1.5 ? vec3( 0.75, 0.78, 0.76 ) : vec3( 0.35, 0.55, 0.6 );
      col = mix( col, mc * ( 0.9 + 0.1 * sin( t * 400.0 ) ), mk ); skinM *= 1.0 - mk; rough = mix( rough, 0.9, mk );
      col = mix( col, vec3( 0.9 ), smoothstep( 0.004, 0.0, abs( abs( u - 0.5 ) - 0.2 ) ) * cwBand( t, 0.38, 0.48, 0.01 ) * step( 0.5, mk + 1.0 ) * 0.0 );
    }
    bloodBias = 0.35 * smoothstep( 0.2, 0.08, abs( u - 0.5 ) ) * cwBand( t, 0.28, 0.44, 0.03 );
  } else if ( reg == 2 || reg == 3 ) {
    // ------------------------------------------------------------- arms
    float s = reg == 2 ? t : 1.0 + t;
    float sl = side < 0.0 ? L7.x : L7.y;
    float rag = ( texture2D( uNoiseT, vec2( u * 3.0, s * 0.6 ) + seed ).r - 0.5 ) * 0.2 * L6.y;
    if ( s < sl + rag ) { cc = cwPattern( pat, L1.rgb, L11.rgb, vec2( u * 0.3, s * 0.3 ) ); isC = 1.0;
      float hem = smoothstep( 0.05, 0.0, abs( s - sl - rag + 0.03 ) );
      cc *= 1.0 - hem * 0.25;
      if ( topS == 5 && reg == 2 ) cc = mix( cc, L11.rgb * 1.3, step( length( vec2( ( u - 0.5 ) * 0.33, t * 0.29 - 0.07 ) ), 0.028 ) );
      if ( topS == 2 || topS == 6 ) cc *= 1.0 - 0.2 * step( 1.85, s ); // ribbed cuffs
    }
    if ( outerSleeve && s < 1.93 + rag * 0.5 ) { cc = L3.rgb; isC = 1.0;
      if ( outS == 7 ) gloss = 0.45; if ( outS == 8 ) cc *= 0.86 + 0.14 * abs( sin( s * 25.0 ) );
      if ( outS == 4 ) cc *= 1.0 - 0.15 * step( 1.85, s );
    }
  } else if ( reg == 4 ) {
    // ------------------------------------------------------------- hand
    float nail = D.b;
    col = mix( col, vec3( 0.2, 0.18, 0.12 ) * skinLum, nail * 0.8 );
    rough = mix( rough, 0.3, nail );
    if ( L12.w > 0.5 ) { cc = L12.rgb; isC = 1.0; gloss = L12.w > 1.5 ? 0.6 : 0.0; }
    bloodBias = 0.35;
  } else if ( reg == 5 || reg == 6 ) {
    // ------------------------------------------------------------- legs
    float s = reg == 5 ? t : 1.0 + t;
    float pl = side < 0.0 ? L7.z : L7.w;
    float rag = ( texture2D( uNoiseT, vec2( u * 3.0, s * 0.6 ) + seed ).r - 0.5 ) * 0.2 * L6.y;
    if ( topS == 4 && reg == 5 && t < 0.42 + rag ) { cc = cwPattern( pat, L1.rgb, L11.rgb, vec2( u * 0.4, t * 0.45 ) ); isC = 1.0; }
    else if ( botS != 3 && botS != 4 && s < pl + rag ) {
      cc = L2.rgb; isC = 1.0;
      float lat = abs( u - 0.5 ), ant = abs( u - 0.75 );
      if ( botS == 0 ) { cc *= 1.0 - 0.3 * smoothstep( 0.012, 0.0, lat ) - 0.2 * smoothstep( 0.012, 0.0, min( u, 1.0 - u ) );
        cc = mix( cc, cc * 1.35 + vec3( 0.03, 0.035, 0.04 ), smoothstep( 0.2, 0.0, ant ) * ( reg == 5 ? 0.5 : 0.25 ) * smoothstep( 0.9, 0.5, abs( s - 0.9 ) ) ); }
      if ( botS == 1 ) cc *= 1.0 - 0.25 * smoothstep( 0.01, 0.0, ant );
      if ( botS == 5 ) { float pk = max( abs( lat ) * 0.35 - 0.035, abs( t - 0.45 ) * 0.45 - 0.05 ); cc *= 1.0 - 0.35 * smoothstep( 0.01, 0.0, abs( pk ) ) * ( reg == 5 ? 1.0 : 0.0 );
        if ( L13.w > 0.5 && reg == 6 && abs( t - 0.62 ) < 0.035 ) { cc = vec3( 0.65, 0.66, 0.64 ); emis += vec3( 0.05 ) ; gloss = 0.5; } }
      if ( botS == 7 ) cc *= 1.0 - 0.2 * step( 1.9, s );
      float hem = smoothstep( 0.04, 0.0, abs( s - pl - rag + 0.02 ) );
      cc *= 1.0 - hem * 0.25;
    } else if ( botS == 3 && L13.z > 0.5 ) { col = mix( col, vec3( 0.03, 0.025, 0.025 ), 0.6 ); skinM = 0.4; rough = 0.35; }
    bloodBias = reg == 6 ? 0.08 : 0.0;
  } else if ( reg == 7 ) {
    // ------------------------------------------------------------- feet
    int shoe = int( L14.x + 0.5 );
    if ( shoe != 3 ) {
      cc = L9.rgb; isC = 1.0;
      float sole = step( 0.9, D.b ), lace = step( 0.4, D.b ) * ( 1.0 - sole );
      if ( shoe == 0 ) { cc = mix( cc, vec3( 0.62, 0.6, 0.56 ), sole ); cc = mix( cc, vec3( 0.6 ), lace * 0.7 ); }
      else if ( shoe == 1 ) { cc = mix( cc, cc * 0.5, sole ); gloss = 0.75 * ( 1.0 - sole ); }
      else if ( shoe == 2 ) { cc = mix( cc, vec3( 0.03 ), sole ); cc = mix( cc, cc * 0.6, lace ); gloss = 0.25; }
      else if ( shoe == 4 ) { cc = mix( cc, cc * 0.8, sole ); }
    } else { col *= 0.85; bloodBias = 0.1; }
  } else if ( reg >= 10 ) {
    // ------------------------------------------------------ accessories
    int acc = reg - 10;
    isC = 1.0;
    if ( acc == 0 ) { cc = L1.rgb * ( t < 0.02 || t > 0.98 ? 0.7 : 1.0 ); }
    else if ( acc == 1 ) { cc = cwPattern( pat == 6 ? 0 : pat, L2.rgb, L11.rgb, vec2( u * 1.0, t * 0.45 ) ); }
    else if ( acc == 2 ) { cc = L3.rgb; if ( D.b > 0.7 ) { cc = vec3( 0.08 ); gloss = 0.6; } else if ( D.b > 0.3 && outS == 3 ) cc *= 0.8;
      if ( outS == 4 ) cc *= 1.0 - 0.1 * step( 0.0, sin( u * 80.0 ) ) * 0.0; }
    else if ( acc == 3 ) { cc = L15.rgb; if ( t > 1.5 ) cc *= 0.7; if ( D.b > 0.5 && t < 1.5 ) cc = L11.rgb; }
    else if ( acc == 4 ) { cc = L15.rgb; if ( D.b > 0.3 && D.b < 0.7 ) { cc = vec3( 0.03 ); gloss = 0.3; } if ( D.b > 0.8 ) { cc = vec3( 0.7, 0.56, 0.22 ); gloss = 1.0; } if ( t > 1.5 ) { cc = vec3( 0.02 ); gloss = 0.9; } }
    else if ( acc == 5 ) { cc = L15.rgb; gloss = 0.65; if ( D.b > 0.5 ) cc = vec3( 0.7, 0.1, 0.08 ); }
    else if ( acc == 6 ) { cc = mix( L4.rgb, L11.rgb, D.b * 0.7 ); gloss = 0.35; }
    else if ( acc == 7 ) { float s2 = texture2D( uNoiseT, vec2( u * 10.0, t * 0.8 ) + seed ).a; cc = L5.rgb * ( 0.6 + 0.8 * s2 ); isC = 0.0; col = cc * clothLum; skinM = 0.0; rough = 0.7; }
    else if ( acc == 8 ) { cc = L15.rgb; if ( D.b > 0.3 ) cc *= 0.6; }
    else { cc = L15.rgb; gloss = 0.3; }
  }
  // ------------------------------------------------------ tears, wounds
  if ( isC > 0.5 ) {
    float thr = 1.0 - L6.y * 0.5;
    float tf = NZ.r;
    float inBody = reg <= 7 ? 1.0 : 0.0;
    float torn = smoothstep( thr, thr + 0.015, tf ) * inBody;
    float fray = smoothstep( thr - 0.05, thr, tf ) * ( 1.0 - torn ) * inBody;
    cc *= 1.0 - fray * 0.6;
    isC *= 1.0 - torn;
  }
  float lumC = clothLum * ( 1.0 - gloss * 0.1 );
  col = mix( col, cc * lumC, isC );
  skinM *= 1.0 - isC;
  rough = mix( rough, mix( 0.9, 0.3, clamp( gloss, 0.0, 1.0 ) ), isC );
  // wounds on bare flesh
  if ( reg < 10 ) {
    float fixedW = ( reg == 0 || reg == 2 || reg == 3 || reg == 5 || reg == 6 ) ? D.b * L10.y : 0.0;
    float wd = max( fixedW, smoothstep( 1.0 - L10.y * 0.22, 1.0, texture2D( uNoiseT, nco * 1.3 + 0.2 ).b ) );
    if ( reg == 1 ) wd = smoothstep( 1.0 - L10.y * 0.18, 1.0, texture2D( uNoiseT, nco * 1.3 + 0.2 ).b ) * ( 1.0 - D.r );
    float woundM = smoothstep( 0.35, 0.6, wd ) * ( 1.0 - isC * 0.8 );
    col = mix( col, vec3( 0.13, 0.025, 0.02 ) * ( 0.7 + 0.5 * NZ.a ), woundM );
    col = mix( col, vec3( 0.26, 0.04, 0.03 ), smoothstep( 0.8, 0.95, wd ) * ( 1.0 - isC ) );
    rough = mix( rough, 0.3, woundM );
    skinM *= 1.0 - woundM * 0.7;
  }
  // dried blood (capped coverage: clothes and skin always show through)
  float amt = min( L6.x, 0.5 ) + bloodBias * step( 0.01, L6.x );
  float bm = texture2D( uNoiseT, nco * vec2( 1.2, 0.9 ) + 0.3 ).g;
  float bl = smoothstep( 1.0 - amt, 1.0 - amt + 0.22, bm ) * step( 0.01, L6.x );
  col = mix( col, vec3( 0.085, 0.014, 0.01 ), bl * 0.75 );
  rough = mix( rough, 0.38, bl * 0.5 );
  // grime
  col *= 1.0 - D.a * ( 0.2 + 0.3 * decay ) * ( reg == 1 ? 0.0 : 1.0 );
  // stumps
  float stm = smoothstep( 0.12, 0.4, st );
  col = mix( col, vec3( 0.2, 0.018, 0.012 ), stm );
  col = mix( col, vec3( 0.5, 0.45, 0.38 ), smoothstep( 0.62, 0.7, st ) * smoothstep( 0.8, 0.7, st ) );
  rough = mix( rough, 0.25, stm );
  skinM *= 1.0 - stm;
  cwRough = rough; cwEmis = emis; cwNK = mix( 0.3, 1.0, isC );
  gSkin = skinM * 0.85;
  return col;
}
`;

function makeCrowdMaterial(tex, dataTex) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, normalMap: tex.normal });
  m.normalScale.set(1, 1);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uData = { value: dataTex };
    sh.uniforms.uDetail = { value: tex.detail };
    sh.uniforms.uNoiseT = { value: tex.noise };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', 'crowdSkin();\nvec3 objectNormal = cwN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = cwP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', 'diffuseColor.rgb = crowdSurface( vNormalMapUv );')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cwRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( nonPerturbedNormal, normal, cwNK ) );')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += cwEmis;');
    patchLighting(sh); // after FRAG_PARS so the gSkin globals precede it
  };
  m.customProgramCacheKey = () => 'crowd-skinned-v2';
  return m;
}
function makeDepthMaterial(dataTex, Base, opts) {
  const m = new Base(opts);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uData = { value: dataTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', 'crowdSkin();\nvec3 transformed = cwP;');
  };
  m.customProgramCacheKey = () => 'crowd-depth-' + Base.name;
  return m;
}

// ============================================================= outfits ==
const L = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const Lm = (arr) => arr.map(L);
// Human skin tones, pushed towards grey-green / waxy by zombify()
const SKIN_BASE = Lm([0xe6c3a4, 0xd8ad8a, 0xc49070, 0xa87152, 0x8a5a3e, 0x6b4430, 0x4e3222, 0xd9b99a]);
const ZOMBIE_TINTS = Lm([0x8f9784, 0x9aa08c, 0x8c8f8a, 0xa39d86, 0x88907f]);
const TEE = Lm([0x2a2d33, 0x5a5f66, 0x8a8f94, 0xb8b4ac, 0x7a2a26, 0x2e4c6e, 0x3e5a34, 0x6b5a3a, 0x9a8a4a, 0x4a3a5e, 0x1b1d20, 0xc8c2b6, 0x8a4a2a, 0x2f6b6b, 0xa08050]);
const SHIRT = Lm([0xd8d6d0, 0xb8c8d8, 0xd8c8c8, 0xc8d0b8, 0xe0dcd0, 0x9aa8b8]);
const JEANS = Lm([0x2a3a5a, 0x34466a, 0x1e2a44, 0x44587a, 0x26282e, 0x3a3a3a]);
const SLACKS = Lm([0x2a2a2e, 0x1e1f24, 0x3a3834, 0x4a4238, 0x262a36, 0x5a5448]);
const CHINO = Lm([0x8a7a5a, 0x6a6048, 0x4a4a3e, 0x9a8a6a]);
const SUIT = Lm([0x22242a, 0x1a1c24, 0x2e2e32, 0x262c3e, 0x3a342c, 0x444448]);
const COAT = Lm([0x8a7a60, 0x3a3a3c, 0x22252c, 0x5a4a3a, 0x2c3440, 0x6a6a64]);
const JACKET = Lm([0x2e3e5e, 0x3a4a2e, 0x5a3a26, 0x1e1e22, 0x6a6a70, 0x7a2a22, 0x3a2e24]);
const DRESS = Lm([0x7a2a3a, 0x2a3a6a, 0x1e1e24, 0x6a5a8a, 0x3a6a5a, 0xa0806a, 0x8a3a2a, 0xb8a890]);
const HAIR = Lm([0x0e0b09, 0x1e140e, 0x33241a, 0x4e3624, 0x6e4e30, 0x9a7a4e, 0xb89a6a, 0x5a2a18, 0x7a7670, 0xa8a49c]);
const SCRUBS = Lm([0x3a7a7a, 0x2e5a7a, 0x3a6a4a, 0x2a3a5a, 0x6a3a4a, 0x5a8a9a, 0x7a6a9a]);
const GOWN = Lm([0x9ab8c8, 0xa8c8c0, 0xc8d0d4, 0x8aa8c0]);
const HIVIS = Lm([0xc8d020, 0xe07a10, 0xd8e030, 0xe86a18]);
const HAT = Lm([0xd8d0b0, 0xe0c020, 0xe8e8e0, 0xd86a18, 0x2a52a0]);
const BACKPACK = Lm([0x2a2a30, 0x3a4a6a, 0x6a2a2a, 0x3a5a3a, 0x8a6a2a, 0x5a5a5a]);
const SHOES_CASUAL = Lm([0x1a1a1c, 0x3a3230, 0x6a6a6a, 0xa8a8a0, 0x2a2a3a, 0x5a3a24]);
const SHOES_DRESS = Lm([0x0e0c0c, 0x2a1a10, 0x1a1210]);
const BOOTS = Lm([0x3a2a1a, 0x1a1614, 0x5a4428, 0x2a2420]);

const TOP = { TEE: 0, SHIRT: 1, HOODIE: 2, TANK: 3, GOWN: 4, UNIFORM: 5, SWEATER: 6, BLOUSE: 7, SCRUBS: 8, FLANNEL: 9, POLO: 10 };
const BOT = { JEANS: 0, SLACKS: 1, SHORTS: 2, SKIRT: 3, BARE: 4, WORK: 5, SCRUB: 6, SWEATS: 7 };
const OUT = { NONE: 0, JACKET: 1, HIVIS: 2, SUIT: 3, LABCOAT: 4, OVERCOAT: 5, CARDIGAN: 6, LEATHER: 7, PARKA: 8, TACTICAL: 9 };
const SHOE = { SNEAKER: 0, DRESS: 1, BOOT: 2, BARE: 3, SLIPPER: 4 };

function baseLook(r) {
  const female = r() < 0.42;
  return {
    female, fat: r() < 0.2 ? 0.4 + r() * 0.6 : r() < 0.3 ? -0.45 * r() : (r() - 0.5) * 0.3,
    top: TOP.TEE, topC: null, pat: 0, pat2: null, sleeve: r() < 0.6 ? 0.42 : 1.95,
    bot: BOT.JEANS, botC: null, pants: 2.0,
    out: OUT.NONE, outC: [0.2, 0.2, 0.2], hem: 1,
    acc: 0, accC: [0.5, 0.1, 0.1], accS: 0,
    hair: 2, hairC: null, hairline: 0.45,
    shoe: SHOE.SNEAKER, shoeC: null, glove: null, gloveKind: 1,
    bulk: 0, badge: 0, stockings: 0, workStripe: 0, mask: 0, hatC: [0.8, 0.7, 0.2], beard: 0,
  };
}
function pickHair(o, r, pick) {
  if (o.female) {
    const k = r();
    o.hair = k < 0.55 ? 4 : k < 0.85 ? 3 : k < 0.93 ? 2 : 5;
    if (o.hair === 4) o.acc |= 1 << ACC.LONGHAIR;
    o.hairline = 0.34 + r() * 0.08;
  } else {
    const k = r();
    o.hair = k < 0.12 ? 0 : k < 0.36 ? 1 : k < 0.78 ? 2 : k < 0.86 ? 3 : 5;
    o.hairline = 0.38 + r() * 0.3;
    o.beard = r() < 0.5 ? 0.3 + r() * 0.6 : 0;
  }
  o.hairC = pick(HAIR);
  if (r() < 0.12) o.hair = 5; // zombie hair loss
}
// Archetype builders mutate the look
const ARCH = {
  tee(o, r, pick) { o.top = TOP.TEE; o.topC = pick(TEE); o.pat = r() < 0.25 ? 6 : r() < 0.15 ? 2 : 0; o.pat2 = pick(TEE); o.sleeve = r() < 0.75 ? 0.42 : 1.95;
    const k = r(); if (k < 0.55) { o.bot = BOT.JEANS; o.botC = pick(JEANS); } else if (k < 0.7) { o.bot = BOT.SHORTS; o.botC = pick(CHINO.concat(JEANS)); o.pants = 0.42; } else if (k < 0.85) { o.bot = BOT.WORK; o.botC = pick(CHINO); } else { o.bot = BOT.SWEATS; o.botC = pick(Lm([0x5a5a5e, 0x2a2a30, 0x3a4050])); o.pants = 1.97; }
    o.shoe = r() < 0.75 ? SHOE.SNEAKER : SHOE.BOOT; o.shoeC = pick(o.shoe === SHOE.BOOT ? BOOTS : SHOES_CASUAL); },
  hoodie(o, r, pick) { ARCH.tee(o, r, pick); o.top = TOP.HOODIE; o.pat = r() < 0.2 ? 6 : 0; o.sleeve = 1.95; o.bulk = 0.006; if (r() < 0.8) o.acc |= 1 << ACC.HOOD; },
  jacket(o, r, pick) { ARCH.tee(o, r, pick); if (o.bot === BOT.SHORTS) { o.bot = BOT.JEANS; o.pants = 2; } o.out = r() < 0.25 ? OUT.LEATHER : OUT.JACKET; o.outC = o.out === OUT.LEATHER ? pick(Lm([0x141212, 0x2a1a12, 0x3a2418])) : pick(JACKET); o.bulk = 0.008; },
  shirt(o, r, pick) { o.top = TOP.SHIRT; o.topC = pick(SHIRT); o.pat = r() < 0.2 ? 4 : 0; o.pat2 = mulC(o.topC, 0.7); o.sleeve = r() < 0.35 ? 1.05 : 1.95;
    o.bot = BOT.SLACKS; o.botC = pick(SLACKS.concat(CHINO)); o.shoe = SHOE.DRESS; o.shoeC = pick(SHOES_DRESS);
    if (r() < 0.6 && !o.female) { o.acc |= 1 << ACC.TIE; o.accC = pick(Lm([0x6a1a1a, 0x1a2a5a, 0x2a2a2a, 0x5a4a1a, 0x3a1a3a])); o.pat2 = pick(Lm([0x8a8a8a, 0x2a2a2a, 0x9a7a3a])); } },
  flannel(o, r, pick) { ARCH.tee(o, r, pick); if (o.bot === BOT.SHORTS) { o.bot = BOT.JEANS; o.pants = 2; } o.top = TOP.FLANNEL; o.pat = 1; const p = pick([[0x7a1a14, 0x141414], [0x1e3a6a, 0x2a5a2a], [0x3a5a2a, 0x1a1a1a], [0x8a6a2a, 0x3a2a1a], [0x6a1a1a, 0x2a2a4a]]); o.topC = L(p[0]); o.pat2 = L(p[1]); o.sleeve = r() < 0.4 ? 1.05 : 1.95; o.shoe = SHOE.BOOT; o.shoeC = pick(BOOTS); },
  tank(o, r, pick) { ARCH.tee(o, r, pick); o.top = TOP.TANK; o.pat = 0; o.sleeve = -0.2; },
  sweater(o, r, pick) { ARCH.tee(o, r, pick); if (o.bot === BOT.SHORTS) { o.bot = BOT.SLACKS; o.botC = pick(SLACKS); o.pants = 2; } o.top = TOP.SWEATER; o.pat = r() < 0.2 ? 2 : 0; o.sleeve = 1.95; o.bulk = 0.005; },
  dress(o, r, pick) { o.female = true; o.top = r() < 0.4 ? TOP.TANK : TOP.BLOUSE; o.topC = pick(DRESS); o.pat = r() < 0.3 ? 5 : r() < 0.2 ? 3 : 0; o.pat2 = pick(DRESS); o.sleeve = o.top === TOP.TANK ? -0.2 : 0.4;
    o.bot = BOT.SKIRT; o.botC = o.topC; o.acc |= 1 << ACC.SKIRT; o.stockings = r() < 0.35 ? 1 : 0; o.shoe = r() < 0.6 ? SHOE.DRESS : SHOE.SNEAKER; o.shoeC = pick(SHOES_DRESS.concat(SHOES_CASUAL)); o.hem = 1; },
  blouseSkirt(o, r, pick) { o.female = true; o.top = TOP.BLOUSE; o.topC = pick(SHIRT.concat(Lm([0xd8b8c0, 0xc8d8e8]))); o.sleeve = r() < 0.5 ? 0.4 : 1.95;
    o.bot = BOT.SKIRT; o.botC = pick(SUIT.concat(Lm([0x5a5a5a, 0x3a2a2a]))); o.pat = 0; if (r() < 0.2) { o.pat = 1; o.pat2 = pick(TEE); } o.acc |= 1 << ACC.SKIRT; o.stockings = r() < 0.5 ? 1 : 0; o.shoe = SHOE.DRESS; o.shoeC = pick(SHOES_DRESS); },
  polo(o, r, pick) { ARCH.tee(o, r, pick); o.top = TOP.POLO; o.pat = r() < 0.2 ? 2 : 0; o.sleeve = 0.4; o.bot = BOT.SLACKS; o.botC = pick(CHINO); o.pants = 2; },
  suit(o, r, pick) { ARCH.shirt(o, r, pick); o.out = OUT.SUIT; o.outC = pick(SUIT); o.botC = o.outC; o.acc |= 1 << ACC.COAT; o.hem = 0.42; o.sleeve = 1.95;
    if (o.female) { o.acc &= ~(1 << ACC.TIE); o.top = TOP.BLOUSE; if (r() < 0.6) { o.bot = BOT.SKIRT; o.acc |= 1 << ACC.SKIRT; o.stockings = 1; } } else if (r() < 0.85) { o.acc |= 1 << ACC.TIE; } },
  overcoat(o, r, pick) { (r() < 0.5 ? ARCH.sweater : ARCH.shirt)(o, r, pick); o.out = OUT.OVERCOAT; o.outC = pick(COAT); o.acc |= 1 << ACC.COAT; o.hem = 0.9 + r() * 0.1; o.bulk = 0.006; if (r() < 0.4) { o.accS = 2; o.accC = pick(TEE); } },
  parka(o, r, pick) { ARCH.tee(o, r, pick); if (o.bot === BOT.SHORTS) { o.bot = BOT.JEANS; o.pants = 2; } o.out = OUT.PARKA; o.outC = pick(Lm([0x2a3a2a, 0x1a1e2a, 0x6a2a1a, 0x3a3a3e, 0x5a5a3a])); o.bulk = 0.016; if (r() < 0.5) o.acc |= 1 << ACC.HOOD; o.topC = o.outC; },
  cardigan(o, r, pick) { ARCH.blouseSkirt(o, r, pick); o.out = OUT.CARDIGAN; o.outC = pick(Lm([0x8a7a6a, 0x5a4a5a, 0x3a4a5a, 0x9a8a7a, 0x6a3a3a])); o.bulk = 0.004; },
  gown(o, r, pick) { o.top = TOP.GOWN; o.topC = pick(GOWN); o.pat = 3; o.pat2 = mulC(o.topC, 0.75); o.sleeve = 0.34; o.bot = BOT.BARE; o.pants = -1; o.shoe = r() < 0.6 ? SHOE.BARE : SHOE.SLIPPER; o.shoeC = L(0xa8b8c0); if (r() < 0.25) o.hair = 5; },
  scrubs(o, r, pick) { o.top = TOP.SCRUBS; o.topC = pick(SCRUBS); o.sleeve = 0.36; o.bot = BOT.SCRUB; o.botC = o.topC; o.shoe = SHOE.SNEAKER; o.shoeC = pick(SHOES_CASUAL);
    if (r() < 0.4) { o.hair = 6; o.hairC = r() < 0.5 ? o.topC : pick(SCRUBS); o.acc &= ~(1 << ACC.LONGHAIR); } if (r() < 0.45) o.mask = r() < 0.7 ? 1 : 2; if (r() < 0.45) { o.glove = L(0x5a6ab8); o.gloveKind = 2; } if (r() < 0.3) { o.accS = 3; o.accC = pick(Lm([0x1a3a8a, 0x8a1a1a, 0x1a1a1a])); } },
  doctor(o, r, pick) { ARCH.shirt(o, r, pick); o.out = OUT.LABCOAT; o.outC = L(0xd8dcd8); o.acc |= 1 << ACC.COAT; o.hem = 0.85; if (r() < 0.5) { o.accS = 3; o.accC = pick(Lm([0x1a3a8a, 0x8a1a1a])); } if (r() < 0.2) o.mask = 1; },
  police(o, r, pick) { o.top = TOP.UNIFORM; o.topC = pick(Lm([0x1a2238, 0x141a2a, 0x22263a, 0x2a3040])); o.pat2 = mulC(o.topC, 0.6); o.badge = 1; o.sleeve = r() < 0.5 ? 0.42 : 1.95;
    o.bot = BOT.SLACKS; o.botC = pick(Lm([0x14161e, 0x1a1c26])); o.shoe = r() < 0.5 ? SHOE.BOOT : SHOE.DRESS; o.shoeC = L(0x0e0e10);
    if (r() < 0.45) { o.acc |= 1 << ACC.PCAP; o.hatC = mulC(o.topC, 0.9); } if (r() < 0.3) { o.out = OUT.TACTICAL; o.outC = L(0x16181c); o.bulk = 0.004; } if (r() < 0.3 && !o.female) o.acc |= 1 << ACC.TIE, o.accC = L(0x0e0e10); },
  security(o, r, pick) { ARCH.police(o, r, pick); o.topC = pick(Lm([0xb8bcc0, 0xa8b8c8, 0xd0d0cc, 0x6a7078])); o.pat2 = L(0x1a1a1e); o.badge = r() < 0.5 ? 1 : 0; o.botC = L(0x16161a); o.out = OUT.NONE; o.hatC = L(0x16161a); },
  construction(o, r, pick) { (r() < 0.5 ? ARCH.tee : ARCH.flannel)(o, r, pick); o.out = OUT.HIVIS; o.outC = pick(HIVIS); o.bot = r() < 0.5 ? BOT.JEANS : BOT.WORK; o.botC = o.bot === BOT.JEANS ? pick(JEANS) : pick(CHINO.concat(Lm([0x2a2e3a]))); o.pants = 2;
    o.shoe = SHOE.BOOT; o.shoeC = pick(BOOTS); if (r() < 0.75) { o.acc |= 1 << ACC.HARDHAT; o.hatC = pick(HAT); } if (r() < 0.4) { o.glove = pick(Lm([0x9a8a6a, 0x5a5a4a, 0x8a7a2a])); } o.workStripe = r() < 0.3 ? 1 : 0; o.female = r() < 0.12; },
  mechanic(o, r, pick) { o.top = TOP.UNIFORM; o.topC = pick(Lm([0x2a3a5a, 0x4a4a4a, 0x5a5a3a, 0x3a3a44])); o.pat2 = o.topC; o.bot = BOT.WORK; o.botC = o.topC; o.sleeve = r() < 0.5 ? 1.05 : 1.95; o.shoe = SHOE.BOOT; o.shoeC = pick(BOOTS); if (r() < 0.3) { o.acc |= 1 << ACC.CAP; o.hatC = pick(TEE); } },
  utility(o, r, pick) { ARCH.tee(o, r, pick); o.out = OUT.HIVIS; o.outC = L(0xe06a10); o.bot = BOT.WORK; o.botC = pick(Lm([0x2a2e3a, 0x1e2230])); o.pants = 2; o.shoe = SHOE.BOOT; o.shoeC = pick(BOOTS); if (r() < 0.4) { o.acc |= 1 << ACC.HARDHAT; o.hatC = pick(HAT); } else if (r() < 0.4) { o.acc |= 1 << ACC.CAP; o.hatC = L(0xd86a18); } },
  commuter(o, r, pick) { const k = r(); (k < 0.3 ? ARCH.overcoat : k < 0.55 ? ARCH.jacket : k < 0.75 ? ARCH.parka : ARCH.hoodie)(o, r, pick); if (r() < 0.3) { o.acc |= 1 << ACC.BACKPACK; o.hatC = pick(BACKPACK); } if (r() < 0.12) { o.acc |= 1 << ACC.CAP; o.hatC = pick(TEE); } },
  mta(o, r, pick) { ARCH.utility(o, r, pick); o.topC = pick(Lm([0x1a2a4a, 0x2a2a2e])); o.outC = L(0xe86a18); },
  homeless(o, r, pick) { ARCH.parka(o, r, pick); o.outC = pick(Lm([0x3a3428, 0x2a2a24, 0x4a3a2a])); o.decayX = 0.3; o.beard = 1; if (r() < 0.4) { o.acc |= 1 << ACC.CAP; o.hatC = pick(TEE); } },
  traveler(o, r, pick) { const k = r(); (k < 0.3 ? ARCH.tee : k < 0.5 ? ARCH.hoodie : k < 0.65 ? ARCH.jacket : k < 0.78 ? ARCH.dress : k < 0.9 ? ARCH.polo : ARCH.overcoat)(o, r, pick); if (r() < 0.55) { o.acc |= 1 << ACC.BACKPACK; o.hatC = pick(BACKPACK); } if (r() < 0.12) { o.acc |= 1 << ACC.CAP; o.hatC = pick(TEE); } if (r() < 0.2) { o.accS = 3; o.accC = pick(Lm([0x1a3a8a, 0x8a1a1a, 0x2a6a2a])); } },
  pilot(o, r, pick) { o.female = r() < 0.2; o.top = TOP.UNIFORM; o.topC = L(0xdcdcd6); o.pat2 = L(0x1a1a1e); o.badge = 1; o.sleeve = r() < 0.6 ? 0.42 : 1.95; o.bot = BOT.SLACKS; o.botC = L(0x14161c); o.shoe = SHOE.DRESS; o.shoeC = L(0x0c0c0c);
    o.acc |= 1 << ACC.TIE; o.accC = L(0x101014); o.pat2 = L(0x8a7a3a); if (r() < 0.55) { o.acc |= 1 << ACC.PCAP; o.hatC = L(0x16181e); } if (r() < 0.3) { o.out = OUT.SUIT; o.outC = L(0x16181e); o.acc |= 1 << ACC.COAT; o.hem = 0.42; o.sleeve = 1.95; } },
  attendant(o, r, pick) { o.female = r() < 0.75; ARCH.suit(o, r, pick); o.outC = pick(Lm([0x1a2238, 0x5a1a22, 0x22262e])); o.botC = o.outC; if (o.female) { o.bot = BOT.SKIRT; o.acc |= 1 << ACC.SKIRT; o.acc &= ~(1 << ACC.TIE); o.accS = 2; o.accC = pick(Lm([0xa82a2a, 0xc8a030, 0x2a5aa8])); o.stockings = 1; } },
  ramp(o, r, pick) { ARCH.tee(o, r, pick); o.topC = pick(Lm([0x1a2a4a, 0x2a2a2e, 0x3a3a3a])); o.out = OUT.HIVIS; o.outC = pick(HIVIS); o.bot = BOT.WORK; o.botC = pick(Lm([0x1a1e2a, 0x2a2a2e])); o.pants = 2; o.shoe = SHOE.BOOT; o.shoeC = pick(BOOTS);
    if (r() < 0.65) { o.acc |= 1 << ACC.EARMUFF; o.hatC = pick(Lm([0xe07010, 0xd8c020, 0xa82020])); } if (r() < 0.5) o.glove = pick(Lm([0x2a2a2a, 0x8a7a5a])); o.workStripe = 1; },
  tsa(o, r, pick) { ARCH.police(o, r, pick); o.topC = pick(Lm([0xb8c8dc, 0xdcdcd8])); o.pat2 = L(0x14161c); o.botC = L(0x14161c); o.out = OUT.NONE; o.acc &= ~(1 << ACC.PCAP); o.accS = 3; o.accC = L(0x1a2a6a); if (r() < 0.4) { o.glove = L(0x1a1a24); o.gloveKind = 2; } },
};
function mulC(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
const OUTFIT_SETS = {
  civilian: [['tee', 5], ['hoodie', 2.2], ['jacket', 2], ['shirt', 1], ['flannel', 1.6], ['tank', 0.8], ['sweater', 1], ['dress', 1.4], ['blouseSkirt', 0.8], ['polo', 0.8], ['suit', 0.5], ['overcoat', 0.5], ['parka', 0.6]],
  hospital: [['gown', 5], ['scrubs', 3], ['doctor', 1.6], ['civilian', 1.2]],
  worker: [['construction', 4], ['mechanic', 1.5], ['utility', 2], ['civilian', 1]],
  police: [['police', 5], ['security', 2], ['civilian', 1]],
  subway: [['commuter', 4], ['suit', 1.2], ['mta', 1], ['homeless', 0.8], ['civilian', 3]],
  airport: [['traveler', 5], ['pilot', 0.9], ['attendant', 1.1], ['ramp', 1.6], ['tsa', 1.1], ['suit', 0.8], ['civilian', 2]],
  office: [['shirt', 3], ['suit', 2.2], ['blouseSkirt', 2], ['cardigan', 1], ['polo', 1], ['doctor', 0.1], ['civilian', 1]],
};
function pickWeighted(list, r) {
  let tot = 0; for (const [, w] of list) tot += w;
  let x = r() * tot;
  for (const [k, w] of list) { x -= w; if (x <= 0) return k; }
  return list[0][0];
}

// Build the full appearance record (also the gore-facing body.look).
function makeLook(outfit, r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const o = baseLook(r);
  let set = OUTFIT_SETS[outfit] || OUTFIT_SETS.civilian;
  let arch = pickWeighted(set, r);
  if (arch === 'civilian') arch = pickWeighted(OUTFIT_SETS.civilian, r);
  const wasFemale = o.female;
  pickHair(o, r, pick);
  ARCH[arch](o, r, pick);
  if (o.female !== wasFemale) { const keepHat = o.hair === 6; o.acc &= ~(1 << ACC.LONGHAIR); if (!keepHat) pickHair(o, r, pick); }
  if (o.acc & (1 << ACC.HARDHAT | 1 << ACC.PCAP | 1 << ACC.CAP | 1 << ACC.EARMUFF)) o.acc &= ~(1 << ACC.LONGHAIR);
  if (o.acc & (1 << ACC.HARDHAT | 1 << ACC.PCAP)) o.acc &= ~(1 << ACC.EARMUFF);
  if (!o.topC) o.topC = pick(TEE);
  if (!o.botC) o.botC = pick(JEANS);
  if (!o.shoeC) o.shoeC = pick(SHOES_CASUAL);
  if (!o.pat2) o.pat2 = mulC(o.topC, 0.6);
  // zombified skin
  const human = pick(SKIN_BASE), tint = pick(ZOMBIE_TINTS);
  const zk = 0.38 + r() * 0.3;
  let skin = human.map((v, i) => (v * (1 - zk) + tint[i] * zk) * (0.72 + r() * 0.2));
  const decay = Math.min(1, 0.35 + r() * 0.6 + (o.decayX || 0));
  // sleeve asymmetry from torn clothing
  const tear = 0.1 + r() * 0.75;
  const sl = o.sleeve, slL = sl > 0 && r() < tear * 0.4 ? sl * (0.3 + r() * 0.5) : sl, slR = sl > 0 && r() < tear * 0.4 ? sl * (0.3 + r() * 0.5) : sl;
  const pl = o.pants, plL = pl > 1 && r() < tear * 0.3 ? pl * (0.55 + r() * 0.35) : pl, plR = pl > 1 && r() < tear * 0.3 ? pl * (0.55 + r() * 0.35) : pl;
  return {
    o, arch, skin, decay, tear, sleeves: [slL, slR], pants: [plL, plR],
    blood: 0.15 + r() * 0.35, wounds: 0.2 + r() * 0.8, glow: 0.35 + r() * 0.65, seed: [r() * 7, r() * 7],
  };
}

// ============================================================ renderer ==
export class CrowdRenderer {
  constructor(scene, capacity = 160) {
    this.cap = capacity;
    this.scene = scene;
    const assets = sharedAssets();
    this.data = new Float32Array(DATA_W * capacity * 4);
    this.dataTex = new THREE.DataTexture(this.data, DATA_W, capacity, THREE.RGBAFormat, THREE.FloatType);
    this.dataTex.minFilter = this.dataTex.magFilter = THREE.NearestFilter;
    this.dataTex.generateMipmaps = false;
    this.dataTex.needsUpdate = true;
    const built = crowdGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    for (const k in built.geometry.attributes) geo.setAttribute(k, built.geometry.attributes[k]);
    geo.setIndex(built.geometry.index);
    geo.instanceCount = capacity;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = geo;
    this.mat = makeCrowdMaterial(assets, this.dataTex);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'crowd';
    this.mesh.customDepthMaterial = makeDepthMaterial(this.dataTex, THREE.MeshDepthMaterial, { depthPacking: THREE.RGBADepthPacking });
    this.mesh.customDistanceMaterial = makeDepthMaterial(this.dataTex, THREE.MeshDistanceMaterial, {});
    scene.add(this.mesh);
    this.meshes = [this.mesh];
    this.inv = bindMatrices().inv;
    this.slots = new Array(capacity).fill(null);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.bm = new Float32Array(NBONES * 16);
  }

  // Allocate a slot and randomise appearance. Returns slot or -1.
  alloc(body, outfit = 'civilian', rng0 = Math.random) {
    if (this.free.length === 0) return -1;
    const slot = this.free.pop();
    this.slots[slot] = body;
    const r = rng(Math.floor(rng0() * 4294967295));
    const lk = makeLook(outfit, r);
    const o = lk.o;
    if (body._baseScale == null) body._baseScale = body.scale;
    body.scale = body._baseScale * (o.female ? 0.95 : 1);
    body.look = { skin: lk.skin, cloth: o.out && o.out !== OUT.HIVIS ? o.outC : o.topC, pants: o.bot === BOT.BARE ? lk.skin : o.botC, hair: o.hairC, sleeve: Math.max(lk.sleeves[0], lk.sleeves[1]) > 1 || (o.out && o.out !== OUT.HIVIS && o.out !== OUT.TACTICAL) ? 1.1 : 0.4, outfit: lk.arch, female: o.female };
    body.bloodAmt = lk.blood;
    const d = this.data, b = slot * DATA_W * 4 + LOOK0 * 4;
    const put = (k, x, y, z, w) => { const i = b + k * 4; d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = w; };
    const c3 = (k, c, w) => put(k, c[0], c[1], c[2], w);
    c3(0, lk.skin, lk.decay);
    c3(1, o.topC, o.top);
    c3(2, o.botC, o.bot);
    c3(3, o.outC, o.out);
    c3(4, o.accC, o.accS);
    c3(5, o.hairC, o.hair);
    put(6, lk.blood, lk.tear, 0, o.acc);
    put(7, lk.sleeves[0], lk.sleeves[1], lk.pants[0], lk.pants[1]);
    put(8, lk.seed[0], lk.seed[1], o.female ? 1 : 0, o.fat);
    c3(9, o.shoeC, o.hem);
    put(10, o.pat, lk.wounds, o.hairline, lk.glow);
    c3(11, o.pat2, o.beard);
    c3(12, o.glove || [0, 0, 0], o.glove ? o.gloveKind : 0);
    put(13, o.bulk, o.badge, o.stockings, o.workStripe);
    put(14, o.shoe, o.mask, 0, 0);
    c3(15, o.hatC, 0);
    this.writeBody(slot, body);
    return slot;
  }
  setBlood(slot, amount) {
    if (slot < 0) return;
    this.data[slot * DATA_W * 4 + (LOOK0 + 6) * 4] = Math.min(1, amount);
    this.dataTex.needsUpdate = true;
  }
  release(slot) {
    if (slot < 0 || !this.slots[slot]) return;
    this.slots[slot] = null;
    this.free.push(slot);
    this.data.fill(0, slot * DATA_W * 4, slot * DATA_W * 4 + LOOK0 * 4);
    this.dataTex.needsUpdate = true;
  }
  // Write the 12 skinning matrices (current bone frame x inverse rest frame) for one body.
  writeBody(slot, body) {
    const d = this.data, base = slot * DATA_W * 4;
    if (!body.visible) { d.fill(0, base, base + LOOK0 * 4); this.dataTex.needsUpdate = true; return; }
    const bm = boneMatrices(body, this.bm);
    const inv = this.inv;
    for (let k = 0; k < NBONES; k++) {
      const m = k * 16, iv = inv[k], o = base + k * 12;
      // S = M * inv(B) ; store rows 0..2 (3x4 affine)
      for (let r = 0; r < 3; r++) {
        const m0 = bm[m + r], m1 = bm[m + 4 + r], m2 = bm[m + 8 + r], m3 = bm[m + 12 + r];
        d[o + r * 4] = m0 * iv[0] + m1 * iv[1] + m2 * iv[2];
        d[o + r * 4 + 1] = m0 * iv[4] + m1 * iv[5] + m2 * iv[6];
        d[o + r * 4 + 2] = m0 * iv[8] + m1 * iv[9] + m2 * iv[10];
        d[o + r * 4 + 3] = m0 * iv[12] + m1 * iv[13] + m2 * iv[14] + m3;
      }
    }
    // severed bone mask (feet follow the shins)
    let sev = body.severed & 0x3ff;
    if (sev & (1 << 7)) sev |= 1 << 10;
    if (sev & (1 << 9)) sev |= 1 << 11;
    d[base + (LOOK0 + 6) * 4 + 2] = sev;
    this.dataTex.needsUpdate = true;
  }
}

let CROWD_GEO = null;
function crowdGeometry() {
  if (CROWD_GEO) return CROWD_GEO;
  CROWD_GEO = buildBody({ lod: 'crowd', accessories: true, head: CROWD_HEAD, hand: { curl: 0.42, spread: 0.35, fingerLen: 1.03 }, foot: {} },
    { crowd: true, morphs: { F: { female: 1 }, B: { fat: 1 } } });
  return CROWD_GEO;
}

export const SKINS = SKIN_BASE, CLOTHS = TEE, PANTS = JEANS, HAIR_COLORS = HAIR;
export { HAIR_COLORS as HAIR, OUTFIT_SETS };
