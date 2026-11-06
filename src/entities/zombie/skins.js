// Procedural 64×64 zombie skins (Minecraft skin layout + overlay layer) for every outfit.
// paintZombieSkin(outfit, variant, rng, opts) -> { pix, data: Uint8ClampedArray(64*64*4), info }
// Row 0 of the data is the TOP of the skin image (use with a DataTexture, flipY = false).
import { REGIONS, FREE, faceRect, FACES, SKIN } from './layout.js';

// ------------------------------------------------------------------ pixel buffer helpers
const GLOW_A = 230; // base-layer alpha that marks glowing pixels (eyes)

class Pix {
  constructor(rng) {
    this.d = new Uint8ClampedArray(SKIN * SKIN * 4);
    this.rng = rng;
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= SKIN || y >= SKIN || !c) return;
    const i = (y * SKIN + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) {
    const i = (y * SKIN + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  alpha(x, y) { return this.d[(y * SKIN + x) * 4 + 3]; }
  clear(x, y) { const i = (y * SKIN + x) * 4; this.d[i + 3] = 0; }
  fillRect(r, fn) {
    for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
      const c = fn(x, y, r[2], r[3]);
      if (c) this.set(r[0] + x, r[1] + y, c, c[3] ?? 255);
    }
  }
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shade(c, f) { return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]; }
function jit(rng, c, amt) {
  const k = (rng.next() - 0.5) * 2 * amt;
  return [clamp255(c[0] + k + (rng.next() - 0.5) * amt * 0.5), clamp255(c[1] + k), clamp255(c[2] + k + (rng.next() - 0.5) * amt * 0.5)];
}
function hex(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }

/**
 * Iterate over every pixel of a part layer. cb(face, x, y, w, h, wrap) → colour [r,g,b,(a)] | null.
 * wrap = horizontal coordinate going around the side faces (right→front→left→back), for stripes.
 */
function paintPart(P, part, layer, cb) {
  const reg = REGIONS[part];
  const [u, v] = layer === 'over' ? reg.over : reg.base;
  const [w, h, d] = reg.dims;
  for (const face of FACES) {
    const r = faceRect(u, v, w, h, d, face);
    let wrapOff = 0;
    if (face === 'front') wrapOff = d;
    else if (face === 'left') wrapOff = d + w;
    else if (face === 'back') wrapOff = 2 * d + w;
    for (let y = 0; y < r[3]; y++) {
      for (let x = 0; x < r[2]; x++) {
        const c = cb(face, x, y, r[2], r[3], wrapOff + x);
        if (c) P.set(r[0] + x, r[1] + y, c, c[3] ?? 255);
      }
    }
  }
}
/** image rect for a face of a part */
export function partFaceRect(part, layer, face) {
  const reg = REGIONS[part];
  const [u, v] = layer === 'over' ? reg.over : reg.base;
  const [w, h, d] = reg.dims;
  return faceRect(u, v, w, h, d, face);
}

// ------------------------------------------------------------------ palettes
const HUMAN_TONES = [[236, 196, 164], [222, 176, 140], [198, 150, 112], [166, 118, 84], [128, 88, 60], [96, 64, 44]];
const DECAY = [118, 140, 104];
const HAIR = [[40, 30, 22], [70, 48, 30], [110, 80, 50], [150, 120, 80], [196, 170, 110], [120, 40, 20], [90, 90, 90], [170, 170, 170], [24, 22, 22]];
const SHIRTS = [0x8a2a2a, 0x2f4f7f, 0x3c6e3c, 0x6b6b6b, 0xc8c8c0, 0x2a2a2a, 0x7a5a2a, 0x5a3a6a, 0x9a8a3a, 0x3a7a7a, 0xb06030, 0x4a5a2a, 0x202848];
const PANTS = [0x34466a, 0x2a3550, 0x5a5040, 0x8a7a5a, 0x2a2a2a, 0x555555, 0x3a3a48, 0x6a5a40];
const SHOES = [0x3a2a1e, 0x1e1e1e, 0xd0d0c8, 0x5a3a22, 0x6a6a6a];
const BLOOD_DRY = [74, 22, 16];
const BLOOD = [104, 16, 12];
const FLESH = [150, 62, 56];
const BONE_C = [214, 204, 178];

// ------------------------------------------------------------------ the painter
/**
 * @param outfit one of ZOMBIE_OUTFITS
 * @param variant one of ZOMBIE_VARIANTS
 * @param rng seeded rng (makeRng)
 * @param opts {rot: 0..1 (1 = zombie, ~0.25 = fresh corpse), eyes: 'glow'|'closed'|'dead'}
 * @returns {canvas, ctx, info: {accessories: Set, skin, hairColor}}
 */
export function paintZombieSkin(outfit, variant, rng, opts = {}) {
  const rot = opts.rot ?? 1;
  const P = new Pix(rng);
  const acc = new Set();
  const O2 = { acc, variant, rot, outfit, visor: null, brim: null, pack: null };

  // --- skin tone
  const tone = rng.pick(HUMAN_TONES);
  let skin = mix(tone, DECAY, (0.5 + rng.next() * 0.2) * rot + (1 - rot) * 0.12);
  skin = mix(skin, [skin[0] * 0.6 + 60, skin[1] * 0.6 + 60, skin[2] * 0.6 + 66], 0.25 * rot + 0.2 * (1 - rot)); // pallor
  if (variant === 'brute') skin = shade(mix(skin, [96, 104, 100], 0.35), 0.82);
  if (variant === 'bloater') skin = mix(skin, [176, 170, 104], 0.4);
  if (variant === 'screamer') skin = mix(skin, [190, 192, 180], 0.3);
  if (variant === 'runner') skin = mix(skin, [150, 120, 110], 0.15);
  const rotDark = shade(mix(skin, [70, 84, 52], 0.5), 0.78);
  const bruise = mix(skin, [96, 70, 100], 0.45);
  const skinPx = (x, y, part) => {
    let c = jit(rng, skin, 10);
    const n = rng.next();
    if (n < 0.07 * rot) c = jit(rng, rotDark, 8);
    else if (n < 0.1 * rot) c = jit(rng, bruise, 6);
    return c;
  };
  const hair = rng.pick(HAIR);
  const hairStyle = outfit === 'civilian_f' ? 'long' : rng.weighted([['short', 5], ['bald', 1.5], ['patchy', 2], ['buzz', 2]]);

  // --- 1. base skin everywhere (all base layers + face)
  for (const part of Object.keys(REGIONS)) paintPart(P, part, 'base', (f, x, y) => skinPx(x, y, part));

  // --- 2. face & hair
  paintHead(P, rng, { skin, hair, hairStyle, rot, eyes: opts.eyes || 'glow', variant, outfit });

  // --- 3. clothing per outfit
  O2.skin = skin; O2.hair = hair;
  const O = OUTFITS[outfit] || OUTFITS.civilian;
  O(P, rng, O2);

  // --- 4. decay, tears, blood
  weather(P, rng, O2);

  // --- 5. gore / mouth / accessory swatches
  paintSwatches(P, rng, O2);

  return { pix: P, data: P.d, info: { accessories: acc, skin, hair } };
}

// ------------------------------------------------------------------ head
function paintHead(P, rng, o) {
  const { skin, hair, hairStyle, rot, eyes, variant } = o;
  const socket = shade(mix(skin, [60, 20, 24], 0.35), 0.38);
  const socketDeep = shade(socket, 0.55);
  const glowCol = variant === 'runner' ? [150, 60, 34] : variant === 'screamer' ? [120, 130, 140] : [128, 118, 62];
  const hairPx = () => jit(rng, hair, 12);
  const isHair = (face, x, y) => {
    if (hairStyle === 'bald') return face === 'top' && rng.next() < 0.15;
    if (face === 'top') return hairStyle === 'patchy' ? rng.next() < 0.6 : hairStyle === 'buzz' ? rng.next() < 0.85 : true;
    if (face === 'bottom') return false;
    const maxRow = hairStyle === 'long' ? (face === 'back' ? 8 : face === 'front' ? 1 : 6) :
      hairStyle === 'buzz' ? (face === 'front' ? 0 : 1) : (face === 'back' ? 4 : face === 'front' ? 1 : 2);
    let ok = y <= maxRow;
    if (face === 'front' && hairStyle === 'long' && (x === 0 || x === 7) && y <= 5) ok = true;
    if (face === 'front' && y === 1 && hairStyle !== 'long' && x >= 2 && x <= 5) ok = false; // hairline
    if (hairStyle === 'patchy' && rng.next() < 0.4) ok = false;
    return ok;
  };
  paintPart(P, 'head', 'base', (face, x, y) => {
    if (isHair(face, x, y)) return hairPx();
    return null;
  });
  // face details (front face rect of the base head)
  const F = partFaceRect('head', 'base', 'front');
  const fx = F[0], fy = F[1];
  // brow shadow
  for (let x = 1; x < 7; x++) if (rng.next() < 0.6) P.set(fx + x, fy + 2, shade(skin, 0.8));
  // eyes: sockets rows 3-4, cols 1-2 and 5-6
  for (const ex of [1, 5]) {
    P.set(fx + ex, fy + 3, socket); P.set(fx + ex + 1, fy + 3, socket);
    P.set(fx + ex, fy + 4, socketDeep); P.set(fx + ex + 1, fy + 4, socketDeep);
    const inner = ex === 1 ? ex + 1 : ex;
    if (eyes === 'glow') {
      P.set(fx + inner, fy + 4, glowCol, GLOW_A);
      if (rng.next() < 0.35) P.set(fx + (ex === 1 ? 1 : 6), fy + 3, shade(socket, 0.7));
    } else if (eyes === 'dead') {
      P.set(fx + inner, fy + 4, [196, 196, 186]);
    } else {
      P.set(fx + ex, fy + 4, shade(skin, 0.55)); P.set(fx + ex + 1, fy + 4, shade(skin, 0.55));
      P.set(fx + ex, fy + 3, shade(skin, 0.75)); P.set(fx + ex + 1, fy + 3, shade(skin, 0.75));
    }
    // dark tear streaks / rot under the eyes
    if (rot > 0.5 && rng.next() < 0.5) P.set(fx + ex + (rng.next() < 0.5 ? 0 : 1), fy + 5, shade(skin, 0.6));
  }
  // nose
  P.set(fx + 3, fy + 5, shade(skin, 0.72)); P.set(fx + 4, fy + 5, shade(skin, 0.68));
  if (rot > 0.6 && rng.next() < 0.3) { P.set(fx + 3, fy + 5, [40, 16, 16]); P.set(fx + 4, fy + 5, [52, 20, 18]); }
  // mouth (row 6 is the top row of the jaw): dark slit, a tooth or two
  const lip = [40, 16, 15];
  const wide = variant === 'screamer';
  const m0 = wide ? 1 : 2 + (rng.next() < 0.3 ? 1 : 0), m1 = wide ? 6 : 5 - (rng.next() < 0.3 ? 1 : 0);
  for (let x = m0; x <= m1; x++) P.set(fx + x, fy + 6, lip);
  if (rot > 0.4) {
    const tooth = [168, 156, 120];
    if (rng.next() < 0.7) P.set(fx + 3 + (rng.next() < 0.5 ? 0 : 1), fy + 6, tooth);
    if (wide) { P.set(fx + 2, fy + 6, tooth); P.set(fx + 5, fy + 6, shade(tooth, 0.85)); }
    // blood around the mouth / chin
    for (let k = 0; k < 4; k++) {
      const x = 2 + Math.floor(rng.next() * 4), y = 6 + Math.floor(rng.next() * 2);
      if (P.get(fx + x, fy + y)[0] !== lip[0]) P.set(fx + x, fy + y, jit(rng, rng.next() < 0.5 ? BLOOD : BLOOD_DRY, 10));
    }
  }
  // ears: slight darker pixel on the sides
  for (const face of ['right', 'left']) {
    const r = partFaceRect('head', 'base', face);
    if (hairStyle !== 'long') P.set(r[0] + 4, r[1] + 4, shade(skin, 0.75));
  }
  // decay: rotten patches / exposed skull on the head
  if (rot > 0.5) {
    const n = 1 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const face = rng.pick(['right', 'left', 'back', 'top', 'front']);
      const r = partFaceRect('head', 'base', face);
      const x = Math.floor(rng.next() * (r[2] - 1)), y = face === 'front' ? 0 : Math.floor(rng.next() * (r[3] - 1));
      if (face === 'front' && (x > 0 && x < 7)) continue;
      P.set(r[0] + x, r[1] + y, jit(rng, FLESH, 12));
      if (rng.next() < 0.5) P.set(r[0] + x + 1, r[1] + y, jit(rng, BLOOD_DRY, 10));
      if (rng.next() < 0.35) P.set(r[0] + x, r[1] + y + 1, BONE_C);
    }
  }
}

// ------------------------------------------------------------------ garments
// Each garment helper paints onto base / overlay layers using part-face coordinates.
function cloth(rng, c, amt = 9) { return jit(rng, c, amt); }

function shirt(P, rng, col, o = {}) {
  const sleeves = o.sleeves ?? 4; // rows of sleeve on the arms (12 = long)
  const neck = o.neck ?? 'crew';
  const c = Array.isArray(col) ? col : hex(col);
  paintPart(P, 'torso', 'base', (face, x, y, w, h) => {
    if (face === 'bottom') return null;
    if (face === 'top') return cloth(rng, c);
    if (o.cropRows && y >= o.cropRows) return null;
    if (face === 'front' && y === 0 && neck === 'crew' && x >= 3 && x <= 4) return null;
    if (face === 'front' && neck === 'v' && ((y === 0 && x >= 2 && x <= 5) || (y === 1 && x >= 3 && x <= 4))) return null;
    if (o.pattern) { const p = o.pattern(face, x, y, w, h); if (p) return p; }
    return cloth(rng, c);
  });
  for (const arm of ['armR', 'armL']) {
    paintPart(P, arm, 'base', (face, x, y, w, h, wrap) => {
      if (face === 'bottom') return null;
      if (face === 'top') return sleeves > 0 ? cloth(rng, c) : null;
      if (y < sleeves) {
        if (o.pattern) { const p = o.pattern(face, x, y, w, h, wrap, true); if (p) return p; }
        if (y === sleeves - 1 && sleeves < 11) return cloth(rng, shade(c, 0.85));
        return cloth(rng, c);
      }
      return null;
    });
  }
}

function pants(P, rng, col, o = {}) {
  const rows = o.rows ?? 10; // 12 = to the floor
  const c = Array.isArray(col) ? col : hex(col);
  const shoes = o.shoes === null ? null : (o.shoes ? (Array.isArray(o.shoes) ? o.shoes : hex(o.shoes)) : hex(rng.pick(SHOES)));
  for (const leg of ['legR', 'legL']) {
    paintPart(P, leg, 'base', (face, x, y, w, h) => {
      if (face === 'top') return cloth(rng, c);
      if (face === 'bottom') return shoes ? shade(shoes, 0.7) : null;
      if (shoes && y >= 10) return cloth(rng, y === 10 && (face === 'front') ? shade(shoes, 1.15) : shoes, 6);
      if (y < rows) {
        if (o.pattern) { const p = o.pattern(face, x, y, w, h); if (p) return p; }
        if (o.seam && face === 'front' && x === (leg === 'legR' ? 3 : 0)) return cloth(rng, shade(c, 0.85));
        return cloth(rng, c);
      }
      return null;
    });
  }
  // belt line on the torso bottom row
  if (o.belt !== false) {
    const beltC = o.beltColor ? hex(o.beltColor) : shade(c, 0.6);
    paintPart(P, 'torso', 'base', (face, x, y, w, h) => {
      if (face === 'top' || face === 'bottom') return null;
      if (y === h - 1) return o.belt ? cloth(rng, beltC, 5) : cloth(rng, c);
      return null;
    });
    if (o.buckle) { const F = partFaceRect('torso', 'base', 'front'); P.set(F[0] + 3, F[1] + 11, hex(o.buckle)); P.set(F[0] + 4, F[1] + 11, hex(o.buckle)); }
  }
}

function overlayJacket(P, rng, col, o = {}) {
  const c = Array.isArray(col) ? col : hex(col);
  const open = o.open ?? true;
  const sleeves = o.sleeves ?? 11;
  const rows = o.rows ?? 12;
  paintPart(P, 'torso', 'over', (face, x, y, w, h) => {
    if (face === 'bottom') return null;
    if (face === 'top') return (x === 3 || x === 4) && y > 0 && y < 3 ? null : cloth(rng, c);
    if (y >= rows) return null;
    if (face === 'front' && open && x >= 3 && x <= 4) return null;
    if (face === 'front' && open && y === 0 && (x === 2 || x === 5)) return cloth(rng, shade(c, 0.75));
    if (o.pattern) { const p = o.pattern(face, x, y, w, h); if (p) return p; }
    if (o.zipper && face === 'front' && x === 3) return cloth(rng, shade(c, 0.7));
    return cloth(rng, c);
  });
  for (const arm of ['armR', 'armL']) {
    paintPart(P, arm, 'over', (face, x, y, w, h, wrap) => {
      if (face === 'bottom') return null;
      if (face === 'top') return cloth(rng, c);
      if (y < sleeves) {
        if (o.pattern) { const p = o.pattern(face, x, y, w, h, wrap, true); if (p) return p; }
        if (y === sleeves - 1) return cloth(rng, shade(c, 0.8));
        return cloth(rng, c);
      }
      return null;
    });
  }
}

function overlayVest(P, rng, col, o = {}) {
  const c = Array.isArray(col) ? col : hex(col);
  paintPart(P, 'torso', 'over', (face, x, y, w, h) => {
    if (face === 'bottom') return null;
    if (face === 'top') return (x >= 2 && x <= 5) ? null : cloth(rng, c);
    if (y > (o.rows ?? 10)) return null;
    if (face === 'front' && o.open && x >= 3 && x <= 4) return null;
    if (face === 'front' && y === 0 && x >= 2 && x <= 5) return null;
    if (o.pattern) { const p = o.pattern(face, x, y, w, h); if (p) return p; }
    return cloth(rng, c);
  });
}

function hatOverlay(P, rng, col, rows = 2, o = {}) {
  const c = Array.isArray(col) ? col : hex(col);
  paintPart(P, 'head', 'over', (face, x, y, w, h) => {
    if (face === 'bottom') return null;
    if (face === 'top') return cloth(rng, o.topColor || c, 7);
    const r = face === 'back' ? rows + (o.backExtra ?? 1) : rows;
    if (y < r) {
      if (o.band && y === r - 1) return cloth(rng, hex(o.band), 5);
      return cloth(rng, c, 7);
    }
    return null;
  });
}

function camo(rng, palette) {
  return () => jit(rng, rng.pick(palette), 6);
}
function camoField(rng, palette) {
  // blotchy camo: low-res noise per pixel neighbourhood
  const cells = new Map();
  return (face, x, y) => {
    const k = face + ((x >> 1) * 7 + (y >> 1) * 13);
    if (!cells.has(k)) cells.set(k, rng.pick(palette));
    return jit(rng, rng.next() < 0.75 ? cells.get(k) : rng.pick(palette), 5);
  };
}

function plaid(rng, a, b) {
  const A = hex(a), Bc = hex(b);
  return (face, x, y) => {
    const s = (x % 3 === 0) || (y % 3 === 0);
    const d = (x % 3 === 0) && (y % 3 === 0);
    return jit(rng, d ? shade(Bc, 0.6) : s ? Bc : A, 6);
  };
}

function gloves(P, rng, col) {
  const c = hex(col);
  for (const arm of ['armR', 'armL']) {
    paintPart(P, arm, 'base', (face, x, y) => (face === 'bottom' || y >= 10 ? cloth(rng, c, 6) : null));
  }
}

function bareFeet(P, rng, skin) {
  for (const leg of ['legR', 'legL']) {
    paintPart(P, leg, 'base', (face, x, y) => (face === 'bottom' ? shade(skin, 0.6) : null));
  }
}

// ------------------------------------------------------------------ outfits
const OUTFITS = {
  civilian(P, rng, o) {
    const top = rng.weighted([['tee', 4], ['long', 2], ['flannel', 2], ['hoodie', 2], ['tank', 1]]);
    const sc = rng.pick(SHIRTS);
    if (top === 'tee') shirt(P, rng, sc, { sleeves: 4 });
    else if (top === 'tank') shirt(P, rng, sc, { sleeves: 0, neck: 'v' });
    else if (top === 'long') shirt(P, rng, sc, { sleeves: 10 });
    else if (top === 'flannel') shirt(P, rng, sc, { sleeves: 10, pattern: plaid(rng, sc, rng.pick([0x1a1a1a, 0x2a2a50, 0x8a8a7a])) });
    else {
      shirt(P, rng, sc, { sleeves: 10 });
      overlayJacket(P, rng, sc, { open: false, sleeves: 10, rows: 12, zipper: rng.chance(0.5) });
      // hood bunched at the back of the neck
      const r = partFaceRect('torso', 'over', 'back');
      for (let x = 1; x < 7; x++) P.set(r[0] + x, r[1], shade(hex(sc), 0.8));
    }
    if (top !== 'hoodie' && rng.chance(0.35)) overlayJacket(P, rng, rng.pick([0x3a3a3a, 0x4a5a7a, 0x5a3a22, 0x2a3a2a, 0x6a6a60]), { open: true, sleeves: 10 });
    const pc = rng.pick(PANTS);
    pants(P, rng, pc, { rows: rng.chance(0.15) ? 5 : 10, seam: true, belt: rng.chance(0.5), beltColor: 0x2a1e14 });
    if (rng.chance(0.25)) {
      const cap = hex(rng.pick(SHIRTS));
      hatOverlay(P, rng, cap, 1, { backExtra: 0 });
      o.acc.add('visor'); o.visor = shade(cap, 0.85);
    } else if (rng.chance(0.15)) hatOverlay(P, rng, rng.pick([0x303030, 0x6a2020, 0x2a3a5a]), 2, { backExtra: 1 }); // beanie
  },

  civilian_f(P, rng, o) {
    const top = rng.weighted([['blouse', 3], ['tee', 3], ['tank', 2], ['dress', 2], ['sweater', 2]]);
    const sc = rng.pick([0xa83a5a, 0x7a3a8a, 0x3a6a9a, 0xd0c8b8, 0x6a8a5a, 0xc87a3a, 0x2a2a2a, 0x9a2a2a, 0x5a7aa8]);
    if (top === 'dress') {
      shirt(P, rng, sc, { sleeves: 2, neck: 'v' });
      // skirt over the upper legs
      for (const leg of ['legR', 'legL']) paintPart(P, leg, 'base', (face, x, y) => (face !== 'bottom' && y < 6 ? cloth(rng, hex(sc)) : null));
      for (const leg of ['legR', 'legL']) paintPart(P, leg, 'over', (face, x, y) => (face !== 'bottom' && face !== 'top' && y < 6 ? cloth(rng, shade(hex(sc), 0.9)) : null));
      pants(P, rng, o.skin, { rows: 0, shoes: rng.pick([0x1e1e1e, 0x5a2a2a, 0xd0c8c0]), belt: false });
    } else {
      shirt(P, rng, sc, { sleeves: top === 'tank' ? 0 : top === 'sweater' ? 10 : top === 'blouse' ? 6 : 3, neck: top === 'tank' || top === 'blouse' ? 'v' : 'crew' });
      if (top === 'sweater') overlayJacket(P, rng, sc, { open: false, sleeves: 10, rows: 11 });
      const skirt = rng.chance(0.3);
      if (skirt) {
        const kc = rng.pick([0x2a2a2a, 0x3a3a5a, 0x6a2a2a, 0x8a7a6a]);
        for (const leg of ['legR', 'legL']) paintPart(P, leg, 'base', (face, x, y) => (face !== 'bottom' && y < 5 ? cloth(rng, hex(kc)) : null));
        pants(P, rng, o.skin, { rows: 0, shoes: rng.pick([0x1e1e1e, 0x5a2a2a]), belt: false });
      } else {
        pants(P, rng, rng.pick([0x34466a, 0x2a2a2a, 0x5a5a6a, 0x8a7a6a, 0x3a4a6a]), { rows: 10, seam: true, belt: false });
      }
    }
    // long hair down the back of the torso
    const hair = o.hair;
    paintPart(P, 'torso', 'over', (face, x, y) => (face === 'back' && y < 3 + (x > 1 && x < 6 ? 1 : 0) ? jit(rng, hair, 10) : null));
    if (rng.chance(0.3)) { // necklace / scarf
      const F = partFaceRect('torso', 'base', 'front');
      P.set(F[0] + 3, F[1] + 2, [200, 180, 90]);
    }
  },

  office(P, rng, o) {
    const sc = rng.pick([[226, 226, 220], [196, 214, 232], [230, 222, 200], [210, 210, 214]]);
    const tie = rng.pick([0x8a1a1a, 0x1a2a5a, 0x2a4a2a, 0x5a1a4a, 0x303030]);
    shirt(P, rng, sc, {
      sleeves: 10, neck: 'none', pattern: (face, x, y) => {
        if (face !== 'front') return null;
        if ((x === 3 || x === 4) && y >= 1 && y <= 8) return cloth(rng, hex(tie), 6);
        if (y === 0 && (x === 3 || x === 4)) return cloth(rng, shade(hex(tie), 0.8), 4);
        if (y === 0 && (x === 2 || x === 5)) return cloth(rng, shade(sc, 0.85));
        return null;
      },
    });
    const suit = rng.pick([0x2a2a34, 0x3a3a3a, 0x2a3048, 0x4a4036, 0x50545a]);
    pants(P, rng, suit, { rows: 10, shoes: rng.pick([0x1a1a1a, 0x3a2216]), belt: true, beltColor: 0x141414, buckle: 0xb0a070 });
    if (rng.chance(0.55)) overlayJacket(P, rng, suit, { open: true, sleeves: 10, rows: 12 });
    if (rng.chance(0.2)) { // glasses
      const F = partFaceRect('head', 'over', 'front');
      for (const x of [1, 2, 5, 6]) P.set(F[0] + x, F[1] + 3, [30, 30, 30]);
      P.set(F[0] + 3, F[1] + 3, [30, 30, 30]); P.set(F[0] + 4, F[1] + 3, [30, 30, 30]);
    }
  },

  police(P, rng, o) {
    const navy = [34, 42, 74];
    shirt(P, rng, navy, {
      sleeves: rng.chance(0.5) ? 4 : 10, neck: 'none', pattern: (face, x, y, w, h, wrap, isArm) => {
        if (isArm && face === 'right' && y === 1 && x >= 1 && x <= 2) return [160, 140, 60]; // shoulder patch
        if (isArm && face === 'left' && y === 1 && x >= 1 && x <= 2) return [160, 140, 60];
        if (face !== 'front' || isArm) return null;
        if (x === 5 && y === 2) return [212, 186, 80]; // badge
        if (x === 5 && y === 3) return [180, 150, 60];
        if (x === 2 && y === 2) return [200, 200, 200]; // name tag
        if (x === 3 && y >= 1) return cloth(rng, shade(navy, 0.8), 4); // button line
        if (y === 0 && (x === 2 || x === 5)) return cloth(rng, shade(navy, 0.75), 4);
        return null;
      },
    });
    pants(P, rng, [30, 34, 54], { rows: 10, shoes: 0x101010, belt: true, beltColor: 0x121212, buckle: 0xc0b070 });
    // duty belt holster
    const L = partFaceRect('torso', 'base', 'right');
    P.set(L[0] + 1, L[1] + 10, [20, 20, 20]); P.set(L[0] + 2, L[1] + 10, [20, 20, 20]);
    // radio on the shoulder
    const T = partFaceRect('torso', 'over', 'front');
    P.set(T[0] + 1, T[1] + 1, [24, 24, 24]); P.set(T[0] + 1, T[1] + 2, [24, 24, 24]);
    if (rng.chance(0.4)) {
      overlayVest(P, rng, [40, 44, 40], { rows: 9, pattern: (face, x, y) => (face === 'front' && x === 5 && y === 2 ? [212, 186, 80] : face === 'back' && y >= 3 && y <= 4 && x >= 1 && x <= 6 ? [210, 210, 200] : null) });
    }
    if (rng.chance(0.55)) { hatOverlay(P, rng, navy, 2, { band: 0x101010, backExtra: 0 }); o.acc.add('visor'); o.visor = [20, 20, 20]; }
  },

  military(P, rng, o) {
    const woodland = [[86, 96, 60], [60, 72, 42], [100, 84, 58], [34, 36, 28], [78, 88, 54]];
    const desert = [[176, 156, 116], [150, 128, 92], [196, 180, 140], [120, 100, 72]];
    const pal = rng.chance(0.75) ? woodland : desert;
    const field = camoField(rng, pal);
    shirt(P, rng, pal[0], { sleeves: 10, neck: 'none', pattern: (face, x, y) => field(face + 's', x, y) });
    pants(P, rng, pal[1], { rows: 10, shoes: rng.pick([0x1a1a14, 0x5a4a32]), belt: true, beltColor: 0x2a2a1e, pattern: (face, x, y) => field(face + 'p', x, y) });
    // plate carrier / vest
    const vc = pal === woodland ? [70, 76, 52] : [160, 140, 100];
    overlayVest(P, rng, vc, {
      rows: 9, pattern: (face, x, y) => {
        if (face === 'front' && y >= 6 && y <= 8 && x % 3 !== 2) return cloth(rng, shade(vc, 0.8), 5); // mag pouches
        if (face === 'front' && y === 1 && x === 5) return [60, 60, 60];
        return null;
      },
    });
    // helmet
    const hc = pal === woodland ? [72, 80, 54] : [168, 148, 108];
    hatOverlay(P, rng, hc, 3, { backExtra: 1 });
    o.acc.add('brim'); o.brim = shade(hc, 0.9);
    if (rng.chance(0.4)) { o.acc.add('backpack'); o.pack = 'military'; }
    gloves(P, rng, 0x2a2a20);
  },

  medic(P, rng, o) {
    const scrubs = rng.pick([[70, 140, 140], [80, 120, 170], [90, 150, 110], [120, 100, 160]]);
    shirt(P, rng, scrubs, { sleeves: 4, neck: 'v' });
    pants(P, rng, scrubs, { rows: 11, shoes: rng.pick([0xd0d0d0, 0x2a2a2a, 0x3a6a8a]), belt: false });
    if (rng.chance(0.55)) {
      overlayJacket(P, rng, [228, 228, 224], {
        open: true, sleeves: 10, rows: 12, pattern: (face, x, y) => {
          if (face === 'front' && x === 6 && y === 3) return [60, 80, 160]; // pen in the pocket
          if (face === 'front' && y === 4 && (x === 5 || x === 6 || x === 1)) return [200, 200, 196];
          return null;
        },
      });
    }
    // stethoscope
    const F = partFaceRect('torso', 'base', 'front');
    P.set(F[0] + 2, F[1] + 1, [40, 40, 40]); P.set(F[0] + 5, F[1] + 1, [40, 40, 40]);
    P.set(F[0] + 2, F[1] + 2, [40, 40, 40]); P.set(F[0] + 5, F[1] + 3, [150, 150, 160]);
    if (rng.chance(0.5)) { // surgical mask
      const H = partFaceRect('head', 'over', 'front');
      for (let x = 1; x < 7; x++) { P.set(H[0] + x, H[1] + 5, [170, 200, 210]); P.set(H[0] + x, H[1] + 6, [160, 190, 200]); }
    }
    gloves(P, rng, rng.chance(0.5) ? 0x6a8ac0 : 0xd8d8d0);
  },

  patient(P, rng, o) {
    const gown = rng.pick([[176, 196, 210], [190, 206, 196], [200, 200, 210]]);
    const dot = shade(gown, 0.75);
    const pat = (face, x, y) => ((x + y * 2) % 4 === 0 ? jit(rng, dot, 6) : null);
    shirt(P, rng, gown, { sleeves: 3, neck: 'v', pattern: pat });
    // gown covers the upper legs (base) + flaps
    for (const leg of ['legR', 'legL']) {
      paintPart(P, leg, 'base', (face, x, y) => (face !== 'bottom' && y < 4 ? (pat(face, x, y) || cloth(rng, gown)) : null));
    }
    // open back of the gown (ties)
    const Bk = partFaceRect('torso', 'base', 'back');
    for (let y = 1; y < 12; y++) { P.set(Bk[0] + 3, Bk[1] + y, jit(rng, o.skin, 8)); P.set(Bk[0] + 4, Bk[1] + y, jit(rng, o.skin, 8)); }
    for (const y of [2, 6, 10]) P.set(Bk[0] + 3, Bk[1] + y, [230, 230, 230]);
    bareFeet(P, rng, o.skin);
    if (rng.chance(0.6)) { // socks
      for (const leg of ['legR', 'legL']) paintPart(P, leg, 'base', (face, x, y) => (face !== 'top' && y >= 10 ? [196, 196, 190] : null));
    }
    // ID bracelet
    const A = partFaceRect('armL', 'base', 'front');
    P.set(A[0] + 1, A[1] + 9, [240, 240, 240]); P.set(A[0] + 2, A[1] + 9, [240, 240, 240]);
    // IV bruise on the arm
    const R = partFaceRect('armR', 'base', 'front');
    P.set(R[0] + 1, R[1] + 6, [110, 60, 90]);
  },

  firefighter(P, rng, o) {
    const tan = [150, 128, 78], refl = [214, 214, 150], reflDark = [150, 150, 110];
    shirt(P, rng, [50, 50, 54], { sleeves: 10 });
    pants(P, rng, tan, {
      rows: 10, shoes: 0x141414, belt: false, pattern: (face, x, y) => (y === 7 ? (face === 'front' || face === 'back' ? refl : reflDark) : null),
    });
    overlayJacket(P, rng, tan, {
      open: false, sleeves: 10, rows: 12, zipper: false, pattern: (face, x, y, w, h, wrap, isArm) => {
        if (isArm) return y === 7 ? refl : null;
        if (y === 8 || y === 10) return face === 'front' || face === 'back' ? refl : reflDark;
        if (face === 'front' && x === 3 && y < 8) return [40, 40, 40];
        if (face === 'back' && y >= 2 && y <= 3 && x >= 1 && x <= 6) return [220, 200, 80]; // name plate
        return null;
      },
    });
    const helm = rng.chance(0.7) ? [24, 24, 24] : [200, 170, 40];
    hatOverlay(P, rng, helm, 3, { backExtra: 2 });
    // helmet front shield
    const H = partFaceRect('head', 'over', 'front');
    P.set(H[0] + 3, H[1] + 1, [210, 180, 60]); P.set(H[0] + 4, H[1] + 1, [210, 180, 60]);
    o.acc.add('brim'); o.brim = shade(helm, 0.9);
    gloves(P, rng, 0x3a3020);
  },

  worker(P, rng, o) {
    const tee = rng.pick([[90, 90, 92], [60, 70, 100], [140, 60, 40], [200, 200, 190], [60, 80, 60]]);
    shirt(P, rng, tee, { sleeves: rng.chance(0.6) ? 4 : 10 });
    pants(P, rng, rng.pick([0x34466a, 0x5a5040, 0x3a3a34]), { rows: 10, shoes: rng.pick([0x5a3a1e, 0x3a2a1a]), belt: true, beltColor: 0x2a1e14, seam: true });
    const vis = rng.chance(0.6) ? [230, 120, 30] : [200, 220, 40];
    const silver = [200, 200, 196];
    overlayVest(P, rng, vis, {
      open: true, rows: 10, pattern: (face, x, y) => {
        if (y === 6 || y === 9) return silver;
        if ((face === 'front') && (x === 1 || x === 6) && y < 6) return silver;
        return null;
      },
    });
    const hat = rng.pick([[230, 200, 30], [230, 230, 230], [230, 120, 30], [40, 90, 180]]);
    hatOverlay(P, rng, hat, 2, { backExtra: 1 });
    o.acc.add('brim'); o.brim = shade(hat, 0.92);
    gloves(P, rng, rng.pick([0x8a7a5a, 0x5a4a32, 0xb0a070]));
  },

  prisoner(P, rng, o) {
    const orange = rng.chance(0.9) ? [210, 100, 30] : [196, 120, 50];
    shirt(P, rng, orange, {
      sleeves: 4, neck: 'v', pattern: (face, x, y) => {
        if (face === 'back' && y >= 3 && y <= 4 && x >= 1 && x <= 6 && (x + y) % 2 === 0) return [30, 30, 30]; // "DOC" print
        return null;
      },
    });
    pants(P, rng, orange, { rows: 10, shoes: rng.pick([0xd8d8d0, 0x2a2a2a]), belt: false });
    // white undershirt at the neck
    const F = partFaceRect('torso', 'base', 'front');
    P.set(F[0] + 3, F[1], [220, 220, 216]); P.set(F[0] + 4, F[1], [220, 220, 216]);
    // tattoos on the arms
    if (rng.chance(0.6)) {
      const A = partFaceRect('armR', 'base', 'front');
      P.set(A[0] + 1, A[1] + 6, [50, 60, 80]); P.set(A[0] + 2, A[1] + 7, [50, 60, 80]); P.set(A[0] + 1, A[1] + 7, [50, 60, 80]);
    }
  },

  farmer(P, rng, o) {
    const flannel = rng.pick([0x9a2a22, 0x2a4a8a, 0x3a6a3a, 0x7a6a2a]);
    shirt(P, rng, flannel, { sleeves: 10, pattern: plaid(rng, flannel, 0x1a1a1a) });
    const denim = rng.chance(0.75) ? [52, 72, 116] : [110, 90, 60];
    pants(P, rng, denim, { rows: 10, shoes: rng.pick([0x4a3018, 0x2a2014]), belt: false });
    // overalls bib + straps (base torso)
    paintPart(P, 'torso', 'base', (face, x, y) => {
      if (face === 'top' || face === 'bottom') return null;
      if (face === 'front' && y >= 4) return (x === 3 && y === 6) ? [190, 170, 80] : cloth(rng, denim);
      if (face === 'front' && (x === 1 || x === 6)) return cloth(rng, shade(denim, 0.9));
      if (face === 'front' && y === 4) return [180, 160, 80];
      if (face === 'back' && y >= 6) return cloth(rng, denim);
      if (face === 'back' && (x === 2 || x === 5)) return cloth(rng, shade(denim, 0.9));
      if ((face === 'left' || face === 'right') && y >= 7) return cloth(rng, denim);
      return null;
    });
    if (rng.chance(0.6)) { // trucker cap
      const cap = rng.pick([[200, 50, 40], [40, 80, 40], [220, 220, 210], [40, 60, 120]]);
      hatOverlay(P, rng, cap, 1, { backExtra: 0, topColor: rng.chance(0.5) ? [230, 230, 230] : null });
      o.acc.add('visor'); o.visor = shade(cap, 0.85);
    } else if (rng.chance(0.5)) { // straw hat
      hatOverlay(P, rng, [196, 170, 100], 2, { band: 0x5a3a20, backExtra: 0 });
      o.acc.add('brim'); o.brim = [196, 170, 100];
    }
    gloves(P, rng, 0x8a6a3a);
  },

  hunter(P, rng, o) {
    const pal = [[86, 74, 50], [60, 56, 40], [110, 96, 66], [44, 40, 30], [96, 100, 64]];
    const field = camoField(rng, pal);
    shirt(P, rng, pal[0], { sleeves: 10, pattern: (face, x, y) => field(face + 's', x, y) });
    pants(P, rng, pal[1], { rows: 10, shoes: 0x3a2a18, belt: true, beltColor: 0x2a1e14, pattern: (face, x, y) => field(face + 'p', x, y) });
    const blaze = [236, 96, 20];
    if (rng.chance(0.7)) overlayVest(P, rng, blaze, { open: true, rows: 10 });
    else overlayJacket(P, rng, pal[2], { open: true, sleeves: 10, pattern: (face, x, y) => field(face + 'j', x, y) });
    hatOverlay(P, rng, rng.chance(0.6) ? blaze : pal[0], 1, { backExtra: 0 });
    o.acc.add('visor'); o.visor = rng.chance(0.6) ? shade(blaze, 0.85) : pal[3];
  },

  survivor(P, rng, o) {
    shirt(P, rng, rng.pick(SHIRTS), { sleeves: 10 });
    pants(P, rng, rng.pick([0x34466a, 0x4a4a3a, 0x3a3a3a, 0x5a5040]), { rows: 10, shoes: rng.pick([0x3a2a1a, 0x1a1a1a, 0x5a4a30]), belt: true, beltColor: 0x1e1610, seam: true });
    const jc = rng.pick([[90, 60, 36], [60, 70, 48], [50, 70, 110], [40, 40, 40], [110, 90, 60]]);
    overlayJacket(P, rng, jc, { open: rng.chance(0.6), sleeves: 10, zipper: true });
    o.acc.add('backpack'); o.pack = 'hiking';
    // backpack straps on the front
    const F = partFaceRect('torso', 'over', 'front');
    for (let y = 0; y < 8; y++) { P.set(F[0] + 1, F[1] + y, [40, 36, 30]); P.set(F[0] + 6, F[1] + y, [40, 36, 30]); }
    if (rng.chance(0.4)) { // bandana over the face
      const H = partFaceRect('head', 'over', 'front');
      const bc = rng.pick([[140, 30, 30], [30, 40, 90], [40, 40, 40]]);
      for (let x = 0; x < 8; x++) { P.set(H[0] + x, H[1] + 5, jit(rng, bc, 8)); if (x > 0 && x < 7) P.set(H[0] + x, H[1] + 6, jit(rng, bc, 8)); }
      if (true) P.set(H[0] + 3, H[1] + 7, jit(rng, bc, 8));
    } else if (rng.chance(0.4)) hatOverlay(P, rng, rng.pick([[40, 40, 40], [80, 30, 30], [60, 70, 50]]), 2, { backExtra: 1 });
    gloves(P, rng, rng.pick([0x2a2a2a, 0x5a4030]));
  },
};

// ------------------------------------------------------------------ decay & blood
function weather(P, rng, o) {
  const { skin, rot } = o;
  // dirt on lower legs + shoes, grime everywhere
  for (const leg of ['legR', 'legL']) {
    for (const layer of ['base', 'over']) {
      paintPart(P, leg, layer, (face, x, y, w, h) => {
        if (face === 'top' || face === 'bottom') return null;
        const rect = partFaceRect(leg, layer, face);
        const px = rect[0] + x, py = rect[1] + y;
        if (P.alpha(px, py) === 0) return null;
        if (y >= 7 && rng.next() < 0.18 + (y - 7) * 0.08) { const c = P.get(px, py); return mix(c, [70, 58, 40], 0.45); }
        return null;
      });
    }
  }
  if (rot < 0.1) return;
  // torn clothes: holes in the base layer show skin / flesh, holes in overlays become transparent
  const parts = ['torso', 'torso', 'armR', 'armL', 'legR', 'legL', 'legR', 'legL'];
  const tears = Math.round((3 + rng.next() * 5) * rot);
  for (let k = 0; k < tears; k++) {
    const part = rng.pick(parts);
    const face = rng.pick(['front', 'front', 'back', 'right', 'left']);
    for (const layer of ['base', 'over']) {
      const r = partFaceRect(part, layer, face);
      const x = Math.floor(rng.next() * r[2]), y = Math.floor(rng.next() * (r[3] - 2)) + (part === 'torso' ? 1 : 0);
      const n = 1 + Math.floor(rng.next() * 3);
      for (let j = 0; j < n; j++) {
        const px = r[0] + Math.min(r[2] - 1, x + (j % 2)), py = r[1] + Math.min(r[3] - 1, y + (j >> 1));
        if (layer === 'over') { if (rng.next() < 0.6) P.clear(px, py); }
        else P.set(px, py, rng.next() < 0.25 ? jit(rng, FLESH, 10) : jit(rng, skin, 10));
      }
    }
  }
  // dried blood stains: on the chest (from the mouth), hands, random splats
  const F = partFaceRect('torso', 'base', 'front');
  const FO = partFaceRect('torso', 'over', 'front');
  const drool = Math.round((2 + rng.next() * 6) * rot);
  for (let k = 0; k < drool; k++) {
    const x = 2 + Math.floor(rng.next() * 4);
    let y = 0;
    const len = 1 + Math.floor(rng.next() * 5);
    for (let j = 0; j < len; j++, y++) {
      const c = jit(rng, j < 2 ? BLOOD : BLOOD_DRY, 12);
      P.set(F[0] + x, F[1] + y, c);
      if (P.alpha(FO[0] + x, FO[1] + y) > 0) P.set(FO[0] + x, FO[1] + y, c);
    }
  }
  const splats = Math.round((4 + rng.next() * 6) * rot);
  for (let k = 0; k < splats; k++) {
    const part = rng.pick(['torso', 'torso', 'armR', 'armL', 'legR', 'legL', 'head']);
    const face = rng.pick(['front', 'front', 'right', 'left', 'back']);
    const layer = rng.next() < 0.5 ? 'over' : 'base';
    const r = partFaceRect(part, layer, face);
    const cx = Math.floor(rng.next() * r[2]), cy = Math.floor(rng.next() * r[3]);
    const n = 2 + Math.floor(rng.next() * 4);
    for (let j = 0; j < n; j++) {
      const x = Math.min(r[2] - 1, Math.max(0, cx + Math.round((rng.next() - 0.5) * 2.5)));
      const y = Math.min(r[3] - 1, Math.max(0, cy + Math.round((rng.next() - 0.3) * 3)));
      const px = r[0] + x, py = r[1] + y;
      if (layer === 'over' && P.alpha(px, py) === 0) continue;
      if (part === 'head' && face === 'front' && y >= 2 && y <= 5) continue;
      const c = P.get(px, py);
      P.set(px, py, mix(c, jit(rng, rng.next() < 0.3 ? BLOOD : BLOOD_DRY, 10), 0.75 + rng.next() * 0.25));
    }
  }
  // bloody hands
  for (const arm of ['armR', 'armL']) {
    paintPart(P, arm, 'base', (face, x, y) => {
      if (face === 'top') return null;
      if ((face === 'bottom' || y >= 10) && rng.next() < 0.3 * rot) return jit(rng, rng.next() < 0.7 ? BLOOD_DRY : BLOOD, 10);
      return null;
    });
  }
  // exposed wounds (flesh + bone)
  const wounds = Math.round((1 + rng.next() * 3) * rot);
  for (let k = 0; k < wounds; k++) {
    const part = rng.pick(['torso', 'armR', 'armL', 'legR', 'legL']);
    const face = rng.pick(['front', 'right', 'left', 'back']);
    const r = partFaceRect(part, 'base', face);
    const x = Math.floor(rng.next() * Math.max(1, r[2] - 1)), y = 1 + Math.floor(rng.next() * Math.max(1, r[3] - 3));
    paintWoundAt(P, rng, r, x, y, 1);
    const ro = partFaceRect(part, 'over', face);
    for (let j = 0; j < 4; j++) P.clear(ro[0] + Math.min(ro[2] - 1, x + (j & 1)), ro[1] + Math.min(ro[3] - 1, y + (j >> 1)));
  }
  // ribs showing on screamers / runners (gaunt)
  if (o.variant === 'screamer' || o.variant === 'runner') {
    const rr = partFaceRect('torso', 'base', 'right');
    for (const y of [3, 5, 7]) { P.set(rr[0] + 1, rr[1] + y, shade(skin, 0.6)); P.set(rr[0] + 2, rr[1] + y, shade(skin, 0.65)); }
  }
}

function paintWoundAt(P, rng, r, x, y, size) {
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
  const n = size > 1 ? 6 : 4;
  for (let j = 0; j < n; j++) {
    const px = Math.min(r[2] - 1, Math.max(0, x + pts[j][0])), py = Math.min(r[3] - 1, Math.max(0, y + pts[j][1]));
    const c = j === 0 ? (rng.next() < 0.3 ? BONE_C : [70, 10, 10]) : jit(rng, rng.next() < 0.5 ? FLESH : BLOOD, 12);
    P.set(r[0] + px, r[1] + py, c);
  }
  // drip below
  const dx = Math.min(r[2] - 1, Math.max(0, x));
  for (let j = 2; j < 2 + Math.floor(rng.next() * 3); j++) {
    if (y + j < r[3]) P.set(r[0] + dx, r[1] + y + j, jit(rng, BLOOD_DRY, 10));
  }
}

// ------------------------------------------------------------------ swatches
function paintSwatches(P, rng, o) {
  const { skin } = o;
  // gore: ring of skin+blood (rows 0-1), dark cavity with bone in the middle
  P.fillRect(FREE.gore, (x, y) => {
    if (y < 2) return y === 0 ? jit(rng, mix(skin, BLOOD_DRY, 0.4), 8) : jit(rng, BLOOD, 14);
    const cx = x - 3.5, cy = y - 4.5;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < 1.0) return jit(rng, BONE_C, 10);
    if (d < 1.8) return jit(rng, [150, 30, 26], 14);
    return jit(rng, rng.next() < 0.5 ? FLESH : BLOOD, 16);
  });
  // mouth: palate (rows 0-3, row 0 = front teeth), tongue (rows 4-7, row 7 = front teeth)
  P.fillRect(FREE.mouth, (x, y) => {
    if (y === 0 || y === 7) return (x > 0 && x < 7 && rng.next() < 0.5) ? jit(rng, [160, 148, 110], 14) : [40, 12, 12];
    if (y >= 4 && y <= 6 && x >= 2 && x <= 5) return jit(rng, [120, 40, 46], 10);
    return jit(rng, [44, 10, 10], 8);
  });
  // accessories: accA rows 0-3 visor colour, rows 4-7 brim colour
  const visor = o.visor || [40, 40, 40];
  const brim = o.brim || [40, 40, 40];
  P.fillRect(FREE.accA, (x, y) => (y < 4 ? jit(rng, visor, 6) : jit(rng, brim, 6)));
  // backpack (rows 0-9: back face with pocket + zipper, rows 10-15 sides)
  const packC = o.pack === 'military' ? [70, 76, 52] : rng.pick([[60, 70, 110], [110, 50, 40], [60, 80, 50], [50, 50, 54], [130, 100, 60]]);
  P.fillRect(FREE.accB, (x, y) => {
    if (y < 10) {
      if (y >= 5 && y <= 8 && x >= 1 && x <= 6) return y === 5 ? shade(packC, 0.6) : jit(rng, shade(packC, 0.85), 6); // pocket
      if (y === 1 && x >= 1 && x <= 6) return [30, 30, 30]; // zipper
      if (rng.next() < 0.08) return jit(rng, BLOOD_DRY, 8);
      return jit(rng, packC, 7);
    }
    return jit(rng, shade(packC, 0.8), 6);
  });
  // pustules
  P.fillRect(FREE.accC, (x, y) => {
    const lx = x % 4, ly = y % 4;
    const edge = lx === 0 || ly === 0 || lx === 3 || ly === 3;
    if (edge) return jit(rng, [150, 110, 70], 10);
    return jit(rng, rng.next() < 0.5 ? [214, 206, 120] : [190, 180, 90], 10);
  });
}

// ------------------------------------------------------------------ runtime wounds
/**
 * Paint a fresh wound on a skin pixel buffer (runtime, after a hit). (fx, fy) = pixel inside the face rect
 * of part/face. Blood goes on the base layer and on overlay cloth where it exists.
 */
export function paintWound(pix, rng, part, face, fx, fy, size = 1) {
  const pts = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [2, 0], [-2, 0]];
  const n = Math.min(pts.length, 3 + size * 3);
  for (const layer of ['base', 'over']) {
    const r = partFaceRect(part, layer, face);
    for (let j = 0; j < n; j++) {
      if (j > 0 && rng.next() < 0.25) continue;
      const x = Math.min(r[2] - 1, Math.max(0, fx + pts[j][0])), y = Math.min(r[3] - 1, Math.max(0, fy + pts[j][1]));
      const px = r[0] + x, py = r[1] + y;
      if (layer === 'over') {
        if (pix.alpha(px, py) === 0) continue;
        if (j === 0 && size > 1) { pix.clear(px, py); continue; } // torn through
        pix.set(px, py, jit(rng, rng.next() < 0.6 ? BLOOD : BLOOD_DRY, 12));
      } else {
        const c = j === 0 ? (size > 1 && rng.next() < 0.3 ? BONE_C : [74, 8, 8]) : rng.next() < 0.5 ? FLESH : BLOOD;
        pix.set(px, py, jit(rng, c, 12));
      }
    }
    if (face !== 'top' && face !== 'bottom') { // drips run down
      const len = 1 + Math.floor(rng.next() * (2 + size));
      const x = Math.min(r[2] - 1, Math.max(0, fx + (rng.next() < 0.5 ? 0 : 1)));
      for (let j = 1; j <= len; j++) {
        const y = fy + 1 + j;
        if (y >= r[3]) break;
        const px = r[0] + x, py = r[1] + y;
        if (layer === 'over' && pix.alpha(px, py) === 0) continue;
        pix.set(px, py, jit(rng, BLOOD, 10));
      }
    }
  }
}
