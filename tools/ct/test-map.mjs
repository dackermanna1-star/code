#!/usr/bin/env node
// Engine test PWAD for Chinatown: a small map named CHINATWN holding every
// thing type, line special and sector special of tools/ct/SPEC.md, with
// crude placeholder textures, flats and sprites under the real names and in
// the real formats (8-rotation zombies, vehicles and props, so the 3D models
// build). Lets the engine be tested before the real map and art exist.
//
// Usage: node tools/ct/test-map.mjs [out.wad]      (default build/ct/test/ct-test.wad)
// Play:  npm start, then /?pwad=build/ct/test/ct-test.wad&map=CHINATWN
// Test:  CT_WAD=build/ct/test/ct-test.wad npm test
//
// Layout (map units, +y north):
//   subway room S (0..512 x 0..384): start, every pickup, key items, zombies,
//     use lines 904/2..10 on its west wall, door (special 1) east to room R3
//   chained gate 903/50 north to corridor C1, portal 900/100 between C1 and
//     C2 (partner in the annex at x 2048), trigger 905/130 into the street
//   street (-512..1024 x 512..1536, sky): vehicles (VPOL with its blocking
//     outline), props, heli nodes, spawn markers; board 903/51 and glass
//     903/56 east to the sewer pool W (sector 64); lethal line 906 north to
//     the bay B (sector 65); 905/133 north to the extraction zone E (66, tag
//     160); button 904/1 and the tag-1 door to room R2; ladder 902/80 up to
//     the deck (tag 80, with the 9061 landing)
//   chain annex (1600..2944 x 144..1056): arch gate 2, doors 4/5/7, ladder
//     902/81 up to its landing (tag 81), crank gate 6, boards 903/52-55,
//     glass 903/57, triggers 905/132/140 (905/131 is on the deck), the
//     welder garage (tag 8) with a blowtorch spot, director markers of
//     every group

import fs from 'node:fs';
import path from 'node:path';
import { buildNodes, encodeNodeLumps, buildBlockmap, zeroReject } from './lib/bsp.mjs';
import { validate } from './lib/validate.mjs';
import { CT_MAP, CT_ZOMBIES, CT_DECORATIONS, CT_KEY_ITEMS } from '../../src/game/ct/info.js';

const root = new URL('../..', import.meta.url).pathname;
const out = process.argv[2] || path.join(root, 'build/ct/test/ct-test.wad');

// --- WAD reading / palette -------------------------------------------------------

function readLump(buf, name) {
  const n = buf.readInt32LE(4), dir = buf.readInt32LE(8);
  for (let i = 0; i < n; i++) {
    const o = dir + i * 16;
    if (buf.toString('latin1', o + 8, o + 16).replace(/\0.*$/, '').toUpperCase() === name) {
      return buf.subarray(buf.readInt32LE(o), buf.readInt32LE(o) + buf.readInt32LE(o + 4));
    }
  }
  throw new Error(`${name} missing`);
}

const PAL = readLump(fs.readFileSync(path.join(root, 'assets/wads/doom1.wad')), 'PLAYPAL');
const colCache = new Map();
// Nearest palette index to an RGB colour.
function col(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  if (colCache.has(key)) return colCache.get(key);
  let best = 0, bd = Infinity;
  for (let i = 0; i < 256; i++) {
    if (i === 247) continue;
    const dr = PAL[i * 3] - r, dg = PAL[i * 3 + 1] - g, db = PAL[i * 3 + 2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = i; }
  }
  colCache.set(key, best);
  return best;
}
const shade = (rgb, k) => col(...rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))));

// Deterministic noise for the patterns.
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };

// --- Images and lump encoders ------------------------------------------------------

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h); this.mask = new Uint8Array(w * h); }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c; this.mask[y * this.w + x] = 1;
  }
  rect(x0, y0, x1, y1, c) {
    for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
  }
  fill(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, fn(x, y)); return this; }
  disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) this.set(cx + x, cy + y, c); }
}

// DOOM picture format (patches, sprites, menu graphics).
function picture(img, left, top) {
  const cols = [];
  for (let x = 0; x < img.w; x++) {
    const bytes = [];
    let y = 0;
    while (y < img.h) {
      if (!img.mask[y * img.w + x]) { y++; continue; }
      const start = y;
      while (y < img.h && img.mask[y * img.w + x] && y - start < 128) y++;
      bytes.push(start, y - start, 0);
      for (let k = start; k < y; k++) bytes.push(img.px[k * img.w + x]);
      bytes.push(0);
    }
    bytes.push(255);
    cols.push(Buffer.from(bytes));
  }
  const head = Buffer.alloc(8 + 4 * img.w);
  head.writeInt16LE(img.w, 0); head.writeInt16LE(img.h, 2);
  head.writeInt16LE(Math.round(left), 4); head.writeInt16LE(Math.round(top), 6);
  let off = head.length;
  cols.forEach((c, i) => { head.writeUInt32LE(off, 8 + 4 * i); off += c.length; });
  return Buffer.concat([head, ...cols]);
}

const flatLump = (img) => Buffer.from(img.px);

// --- Wall textures -------------------------------------------------------------------

const C = {
  brick: [140, 52, 36], mortar: [96, 88, 80], tile: [208, 208, 200], grout: [112, 112, 104],
  conc: [120, 116, 108], dark: [20, 20, 24], neonRed: [255, 40, 40], gold: [255, 200, 40],
  fence: [150, 150, 150], wood: [130, 90, 50], glass: [150, 190, 230], metal: [100, 104, 112],
  asphalt: [56, 56, 60], line: [220, 200, 60], sewer: [70, 80, 40], bay: [20, 30, 60],
};

function brickTex(w, h, base) {
  return new Img(w, h).fill((x, y) => {
    const row = Math.floor(y / 16), bx = (x + (row & 1) * 16) % 32;
    if (y % 16 === 15 || bx === 31) return shade(C.mortar, 0.9 + rnd() * 0.2);
    return shade(base, 0.8 + rnd() * 0.3);
  });
}
function tileTex(w, h, base, size = 16) {
  return new Img(w, h).fill((x, y) => (x % size === 0 || y % size === 0 ? shade(C.grout, 1) : shade(base, 0.92 + rnd() * 0.1)));
}
function noiseTex(w, h, base, amt = 0.25) {
  return new Img(w, h).fill(() => shade(base, 1 - amt / 2 + rnd() * amt));
}
function neonTex(w, h) {
  const img = new Img(w, h).fill(() => shade(C.dark, 1));
  for (let i = 0; i < 12; i++) {
    const x = 4 + rnd() * (w - 12), y = 4 + rnd() * (h - 12), s = 4 + rnd() * 6;
    img.rect(x, y, x + s, y + 2, col(...C.neonRed)); img.rect(x + s / 2, y, x + s / 2 + 2, y + s, col(...C.gold));
  }
  for (let x = 0; x < w; x++) { img.set(x, 0, col(...C.neonRed)); img.set(x, h - 1, col(...C.neonRed)); }
  return img;
}
function fenceTex(open) {
  const img = new Img(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    if (open && x > 52 && x < 76 && y > 30 && y < 100) continue;
    if ((x + y) % 10 === 0 || (x - y + 640) % 10 === 0) img.set(x, y, shade(C.fence, 0.8 + rnd() * 0.3));
  }
  img.rect(0, 0, 128, 4, shade(C.metal, 1)); img.rect(0, 124, 128, 128, shade(C.metal, 1));
  img.rect(0, 0, 4, 128, shade(C.metal, 1)); img.rect(124, 0, 128, 128, shade(C.metal, 1)); img.rect(62, 0, 66, 128, shade(C.metal, 0.9));
  if (!open) { img.rect(54, 56, 74, 60, shade(C.metal, 1.3)); img.rect(58, 60, 70, 72, col(...C.gold)); }
  return img;
}
function plankTex(w, h, broken) {
  const img = new Img(w, h);
  for (let p = 0; p < 4; p++) {
    const y0 = 12 + p * 30;
    for (let x = 0; x < w; x++) {
      if (broken && (x > w * 0.4 && x < w * 0.7)) continue;
      for (let y = y0; y < y0 + 18; y++) img.set(x, y + Math.round((x - w / 2) * 0.08 * (p % 2 ? 1 : -1)), shade(C.wood, 0.8 + rnd() * 0.3));
    }
  }
  return img;
}
function glassTex(broken) {
  const img = new Img(64, 128);
  img.rect(0, 0, 64, 3, shade(C.metal, 1)); img.rect(0, 125, 64, 128, shade(C.metal, 1));
  img.rect(0, 0, 3, 128, shade(C.metal, 1)); img.rect(61, 0, 64, 128, shade(C.metal, 1));
  for (let i = 0; i < 30; i++) { const x = 8 + rnd() * 40, y = 8 + rnd() * 100; img.rect(x, y, x + 8, y + 1, shade(C.glass, 1.1)); }
  if (broken) for (let i = 0; i < 6; i++) { const x = 3 + rnd() * 50; img.rect(x, 3, x + 6, 20 + rnd() * 30, shade(C.glass, 0.9)); }
  return img;
}
function ladderTex(base, raised) {
  const img = noiseTex(64, 128, base, 0.15);
  const y0 = raised ? 0 : 8, y1 = raised ? 48 : 128;
  img.rect(14, y0, 18, y1, shade(C.metal, 1.2)); img.rect(46, y0, 50, y1, shade(C.metal, 1.2));
  for (let y = y0 + 6; y < y1; y += 12) img.rect(14, y, 50, y + 2, shade(C.metal, 1.4));
  return img;
}
function panelTex(lit, on = [40, 255, 40], off = [150, 20, 20]) {
  const img = noiseTex(64, 64, C.metal, 0.1);
  img.rect(16, 16, 48, 48, shade(C.dark, 1)); img.disc(32, 32, 10, lit ? col(...on) : col(...off));
  return img;
}
function doorTex() {
  const img = noiseTex(64, 128, C.metal, 0.12);
  img.rect(4, 4, 60, 6, shade(C.metal, 0.7)); img.rect(48, 60, 56, 66, shade(C.metal, 1.6));
  return img;
}
function skyTex() {
  const img = new Img(1024, 128).fill((x, y) => shade([30, 24, 60], 0.4 + y / 128 * 0.8));
  let x = 0;
  while (x < 1024) {
    const w = 30 + Math.floor(rnd() * 70), h = 30 + Math.floor(rnd() * 70);
    for (let yy = 128 - h; yy < 128; yy++) for (let xx = x; xx < Math.min(1024, x + w); xx++) {
      const win = (xx % 8 < 3) && (yy % 10 < 4) && rnd() < 0.3;
      img.set(xx, yy, win ? col(255, 220, 120) : shade(C.dark, 1));
    }
    x += w + Math.floor(rnd() * 12);
  }
  return img;
}

// name -> image (one patch) or [patch images] for the sky.
const TEXTURES = {
  CTTILE1: tileTex(128, 128, C.tile), CTBRK1: brickTex(128, 128, C.brick), CTCONC1: noiseTex(128, 128, C.conc),
  CTNSG1: neonTex(32, 128), CTNSG2: neonTex(128, 32),
  CTGATE1: fenceTex(false), CTGATE2: fenceTex(true), CTBORD1: plankTex(64, 128, false), CTBORD3: plankTex(64, 128, true),
  CTGLAS1: glassTex(false), CTGLAS2: glassTex(true), CTLADR1: ladderTex(C.conc, false), CTLADR2: ladderTex(C.wood, false),
  CTLADR3: ladderTex(C.wood, true), CTBUT1: panelTex(false), CTBUT2: panelTex(true), CTDOOR2: doorTex(),
  CTGEN1: panelTex(true, [240, 200, 40]), CTCRNK1: panelTex(true, [160, 160, 170]),
  CTSOCK1: panelTex(false, [0, 0, 0], [40, 40, 40]), CTSOCK2: panelTex(true, [240, 240, 240]),
  CTRADI1: panelTex(false, [0, 0, 0], [60, 60, 50]), CTRADI2: panelTex(true, [80, 200, 255]),
  CTPADL1: panelTex(true, [230, 200, 60]), CTPADL2: panelTex(false, [0, 0, 0], [90, 80, 60]),
  CTSTEP1: noiseTex(64, 32, C.conc, 0.3), CTDARK1: noiseTex(64, 64, C.dark, 0.1), CTSKY1: skyTex(),
};

// --- Flats -------------------------------------------------------------------------

const flat = (fn) => new Img(64, 64).fill(fn);
const water = (base, phase) => flat((x, y) => shade(base, 0.7 + 0.3 * Math.sin((x + y + phase * 21) / 5) * Math.cos((x - phase * 13) / 7) + rnd() * 0.1));
const FLATS = {
  CFTILE1: tileTex(64, 64, [180, 176, 160], 32), CFASPH1: flat(() => shade(C.asphalt, 0.85 + rnd() * 0.3)),
  CFASPH2: flat((x, y) => (x >= 30 && x < 34 && y < 32 ? col(...C.line) : shade(C.asphalt, 0.85 + rnd() * 0.3))),
  CFCONC1: flat(() => shade(C.conc, 0.85 + rnd() * 0.25)), CFSIDE1: tileTex(64, 64, [150, 146, 140], 32),
  CFNLIT1: flat((x, y) => (x % 32 < 2 || y % 32 < 2 ? shade(C.metal, 1) : col(250, 250, 230))),
  CFCEIL1: tileTex(64, 64, [170, 170, 160], 16), CFWOOD1: flat((x, y) => shade(C.wood, (y % 8 === 0 ? 0.6 : 0.9) + rnd() * 0.15)),
  CFSEW1: water(C.sewer, 0), CFSEW2: water(C.sewer, 1), CFSEW3: water(C.sewer, 2),
  CFBAY1: water(C.bay, 0), CFBAY2: water(C.bay, 1), CFBAY3: water(C.bay, 2),
};

// --- Sprites -----------------------------------------------------------------------

const SKIN = [170, 150, 120];
const ZOMBIE_LOOK = {
  ZCV1: { shirt: [60, 90, 140], pants: [50, 50, 60] }, ZCV2: { shirt: [220, 220, 210], pants: [40, 40, 40] },
  ZCV3: { shirt: [150, 40, 40], pants: [70, 60, 100] }, ZCV4: { shirt: [90, 110, 70], pants: [60, 50, 40] },
  ZRUN: { shirt: [120, 60, 30], pants: [40, 40, 50] }, ZKID: { shirt: [200, 160, 40], pants: [40, 60, 120] },
};

// One rotated zombie frame (0-3 walk, 4 reach, 5 strike, 6 pain), rot 1-8.
function zombieFrame(look, h, frame, rot) {
  const s = h / 58;
  const a = (rot - 1) * Math.PI / 4;
  const ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
  const face = Math.sin(a) >= 0 ? -1 : 1; // which screen side the arms reach toward
  const W = Math.ceil(56 * s), img = new Img(W, h + 2);
  const cx = W / 2;
  const stride = frame < 4 ? Math.sin(frame * Math.PI / 2) * 7 * s : 0;
  const skin = shade(look.pain && frame === 6 ? [230, 80, 80] : SKIN, 1), shirt = shade(look.shirt, frame === 6 ? 1.4 : 1);
  // legs
  for (const side of [-1, 1]) {
    const lx = cx + side * 4 * s * ca + side * stride * sa;
    img.rect(lx - 3 * s, h - 26 * s, lx + 3 * s, h, shade(look.pants, 1));
  }
  // torso
  const tw = (17 * ca + 9 * sa) * s;
  img.rect(cx - tw / 2, h - 46 * s, cx + tw / 2, h - 25 * s, shirt);
  // arms: forward when reaching, raised for the strike
  const reach = frame === 4 ? 16 : frame === 5 ? 20 : 12;
  const armY = frame === 5 ? h - 50 * s : h - 43 * s;
  for (const side of [-1, 1]) {
    const ax = cx + side * (tw / 2 + 1.5 * s) * ca;
    const len = reach * s * sa;
    const x0 = Math.min(ax, ax + face * len), x1 = Math.max(ax, ax + face * len);
    img.rect(x0 - 1.5 * s, armY, x1 + 1.5 * s, armY + 4 * s, skin);
    if (ca > 0.5) img.rect(ax - 1.5 * s, armY, ax + 1.5 * s, armY + 14 * s * ca, skin);
  }
  // head
  img.disc(cx + face * 2 * s * sa, h - 51 * s, Math.max(3, Math.round(5 * s)), skin);
  img.rect(cx - 4 * s, h - 57 * s, cx + 4 * s, h - 54 * s, shade([40, 30, 20], 1));
  return { img, left: W / 2, top: h };
}

// Death frames H-L (rotation 0): the body sinking to the ground.
function zombieDeath(look, h, k) {
  const s = h / 58;
  const W = Math.ceil(60 * s), img = new Img(W, h + 2);
  const t = k / 4; // 0 = falling, 1 = lying
  const bodyH = Math.max(10 * s, h * (1 - t * 0.85)), bodyW = 16 * s + 34 * s * t;
  img.rect(W / 2 - bodyW / 2, h - bodyH, W / 2 + bodyW / 2, h, shade(look.shirt, 0.9));
  img.rect(W / 2 - bodyW / 2, h - bodyH * 0.3, W / 2 + bodyW / 2, h, shade(look.pants, 1));
  img.disc(W / 2 + bodyW / 2 * t, h - bodyH + 4, Math.max(3, Math.round(5 * s)), shade(SKIN, 0.9));
  for (let i = 0; i < 6 * k; i++) img.set(W / 2 - bodyW / 2 + rnd() * bodyW, h - rnd() * 3, col(140, 0, 0));
  return { img, left: W / 2, top: h };
}

// A box seen from rotation rot (0 = one view): length along the thing's
// facing, width across, height; windows and wheels for vehicles.
function boxFrame(o, rot, frame = 0) {
  const a = rot ? (rot - 1) * Math.PI / 4 : 0.6;
  const w = Math.max(4, Math.round(o.w * Math.abs(Math.cos(a)) + o.l * Math.abs(Math.sin(a))));
  const top = o.hang ? o.top : o.h;
  const img = new Img(w, Math.max(o.h, top) + 1);
  const y0 = o.hang ? 0 : img.h - 1 - o.h;
  if (o.hang) img.rect(w / 2 - 1, 0, w / 2 + 1, top - o.h, shade(C.dark, 1));
  const by = o.hang ? top - o.h : y0;
  img.rect(0, by, w, by + o.h, (x, y) => shade(o.color, 0.85 + 0.15 * Math.sin(x / 7) + ((y - by) / o.h) * -0.2));
  if (o.vehicle) {
    img.rect(3, by + o.h * 0.12, w - 3, by + o.h * 0.38, shade([60, 80, 110], 1));
    const side = Math.abs(Math.sin(a));
    if (side > 0.3) for (const f of [0.2, 0.8]) img.rect(w * f - 8, img.h - 12, w * f + 8, img.h - 1, shade(C.dark, 1));
    if (o.lights) { img.rect(w / 2 - 12, by - 5, w / 2, by, col(255, 0, 0)); img.rect(w / 2, by - 5, w / 2 + 12, by, col(0, 60, 255)); }
    if (o.rotor) img.rect(frame ? w * 0.1 : 0, by - 6, frame ? w * 0.9 : w, by - 3, shade(C.dark, 1.5));
  }
  return { img, left: w / 2, top: o.hang ? top : img.h - 1 };
}

const VEHICLE_SIZE = {
  VPOL: [180, 80, 56, [30, 30, 40]], VAMB: [220, 90, 96, [230, 230, 230]], VTAX: [180, 80, 56, [230, 190, 30]],
  VVAN: [200, 84, 84, [180, 180, 190]], VPCK: [200, 84, 68, [120, 40, 30]], VSED: [176, 78, 54, [60, 90, 70]],
  VSUV: [190, 84, 72, [40, 40, 50]], VTRK: [300, 96, 116, [200, 200, 200]], VFTR: [340, 100, 116, [200, 30, 30]],
  VGRB: [300, 100, 116, [70, 110, 60]], VMIL: [220, 96, 90, [90, 100, 60]], VHEL: [300, 80, 90, [60, 60, 70]],
};
const PROP_SIZE = {
  PBAR: [48, 16, 32, [150, 150, 140]], PSAW: [40, 8, 40, [220, 140, 30]], PCON: [16, 16, 24, [240, 110, 20]],
  PGEN: [96, 56, 56, [200, 180, 40]], PRAD: [32, 24, 44, [90, 80, 60]], PWLD: [32, 24, 44, [90, 100, 110]],
  PTRA: [22, 22, 38, [80, 90, 80]], PHYD: [14, 14, 30, [200, 40, 30]], PPHN: [20, 16, 72, [120, 130, 140]],
  PBEN: [48, 16, 30, [110, 80, 50]], PLMP: [12, 12, 128, [70, 70, 75]], PLNT: [16, 16, 24, [230, 30, 30]],
  PCRT: [40, 40, 40, [150, 110, 60]], PPAL: [46, 46, 46, [170, 130, 80]],
};
const ITEM_SIZE = { IGAS: [14, 10, 18, [200, 30, 30]], IPLG: [16, 10, 10, [40, 40, 40]], ITOR: [18, 8, 16, [230, 120, 20]] };

const sprites = [];
const addSprite = (name, f) => sprites.push({ name, data: picture(f.img, f.left, f.top) });
for (const z of CT_ZOMBIES) {
  const look = ZOMBIE_LOOK[z.spr], h = z.spr === 'ZKID' ? 42 : 58;
  for (let fr = 0; fr < 7; fr++) for (let r = 1; r <= 8; r++) addSprite(`${z.spr}${String.fromCharCode(65 + fr)}${r}`, zombieFrame(look, h, fr, r));
  for (let k = 0; k < 5; k++) addSprite(`${z.spr}${String.fromCharCode(72 + k)}0`, zombieDeath(look, h, k));
}
for (const d of [...CT_DECORATIONS, { spr: 'VHEL', rot: 8 }]) {
  const v = VEHICLE_SIZE[d.spr], p = PROP_SIZE[d.spr];
  const [l, w, h, color] = v || p;
  const o = { l, w, h, color, vehicle: !!v, lights: d.spr === 'VPOL', rotor: d.spr === 'VHEL', hang: d.spr === 'PLNT', top: d.height };
  const frames = d.spr === 'VHEL' ? 2 : 1;
  for (let fr = 0; fr < frames; fr++) {
    const fc = String.fromCharCode(65 + fr);
    if (d.rot) for (let r = 1; r <= 8; r++) addSprite(`${d.spr}${fc}${r}`, boxFrame(o, r, fr));
    else addSprite(`${d.spr}${fc}0`, boxFrame(o, 0, fr));
  }
}
for (const it of CT_KEY_ITEMS) {
  const [l, w, h, color] = ITEM_SIZE[it.spr];
  addSprite(`${it.spr}A0`, boxFrame({ l, w, h, color }, 0));
}

// --- Map ------------------------------------------------------------------------------

const ML = { BLOCKING: 1, BLOCKMONSTERS: 2, TWOSIDED: 4, DONTPEGTOP: 8, DONTPEGBOTTOM: 16 };

// Axis-aligned rooms; edges shared by two rooms become two-sided lines.
const rooms = [];
const room = (name, x1, y1, x2, y2, o = {}) => {
  const r = { name, x1, y1, x2, y2, floor: 0, ceil: 128, ftex: 'CFCONC1', ctex: 'CFCEIL1', light: 160, special: 0, tag: 0, wall: 'CTCONC1', ...o };
  rooms.push(r);
  return r;
};
const SKY = { ctex: 'F_SKY1' };
const S = room('subway', 0, 0, 512, 384, { ftex: 'CFTILE1', ctex: 'CFNLIT1', wall: 'CTTILE1' });
const C1 = room('corridor1', 192, 384, 320, 448, { wall: 'CTTILE1', light: 140 });
const C2 = room('corridor2', 192, 448, 320, 512, { wall: 'CTTILE1', light: 140 });
const ST = room('street', -512, 512, 1024, 1536, { ceil: 320, ftex: 'CFASPH2', wall: 'CTBRK1', light: 176, ...SKY });
const W = room('sewer pool', 1024, 768, 1280, 1024, { floor: -16, ftex: 'CFSEW1', wall: 'CTCONC1', light: 112, special: 64 });
const B = room('bay', -512, 1536, -256, 1792, { floor: -64, ceil: 320, ftex: 'CFBAY1', light: 144, special: 65, ...SKY });
const E = room('extraction', 512, 1536, 704, 1792, { ceil: 320, ftex: 'CFWOOD1', light: 176, special: 66, tag: 160, ...SKY });
const D1 = room('door 1', 768, 1536, 832, 1552, { ceil: 0, tag: 1, wall: 'CTDOOR2' });
const R2 = room('room 2', 736, 1552, 896, 1792, { ftex: 'CFWOOD1', light: 128, wall: 'CTBRK1' });
const DK = room('deck', 1024, 1280, 1280, 1536, { floor: 136, ceil: 320, tag: 80, ftex: 'CFWOOD1', light: 176, ...SKY });
const D2 = room('door 2', 512, 128, 528, 192, { ceil: 0, wall: 'CTCONC1' });
const R3 = room('room 3', 528, 64, 768, 320, { ftex: 'CFCONC1', light: 144 });
const A1 = room('annex1', 2048, 0, 2304, 128, { wall: 'CTTILE1' });
const A2 = room('annex2', 2048, 128, 2304, 256, { wall: 'CTNSG2' });
// The rest of the objective chain (tools/ct/test-ct.mjs): the arch gate
// (tag 2), shortcut doors 4/5, the sewer-exit ladder 902/81 up to its
// landing (tag 81), the crank gate (tag 6) with the yard north of it, the
// dock warehouse behind door 7 and the side room behind boards 903/55,
// the welder garage and its doorway (tag 8).
const Z = { ceil: 256, light: 150 };
const G0 = room('chain hall', 1600, 400, 1856, 656, Z);
room('arch gate', 1856, 464, 1872, 592, { ceil: 0, tag: 2, wall: 'CTDOOR2' });
const G1 = room('gate yard', 1872, 400, 2128, 656, Z);
room('door 4', 2128, 464, 2144, 592, { ceil: 0, tag: 4, wall: 'CTDOOR2' });
room('switch room', 2144, 400, 2400, 656, Z);
room('door 5', 2400, 464, 2416, 592, { ceil: 0, tag: 5, wall: 'CTDOOR2' });
const G5 = room('sewer exit', 2416, 400, 2672, 656, Z);
const L81 = room('back room landing', 2416, 144, 2672, 384, { floor: 128, ceil: 256, tag: 81, light: 150 });
room('weld gate', 2480, 656, 2608, 672, { ceil: 0, tag: 6, wall: 'CTDOOR2' });
room('north yard', 2416, 672, 2672, 928, Z);
room('door 7', 2672, 736, 2688, 864, { ceil: 0, tag: 7, wall: 'CTDOOR2' });
room('dock warehouse', 2688, 672, 2944, 928, Z);
room('side room', 2688, 928, 2944, 1056, Z);
room('garage doorway', 2208, 656, 2272, 672, { ceil: 128, tag: 8 });
room('welder garage', 2144, 672, 2400, 800, { ceil: 128, light: 120 });

// Extra vertices that split walls (use lines, ladder, breakables).
const splits = [[896, 1536], [960, 1536], [1024, 896], [2496, 400], [2560, 400], [2752, 928], [2880, 928]];
for (let y = 32; y <= 320; y += 32) splits.push([0, y]);

const verts = [];
const vindex = new Map();
const vert = (x, y) => {
  const k = `${x},${y}`;
  if (!vindex.has(k)) { vindex.set(k, verts.length); verts.push([x, y]); }
  return vindex.get(k);
};
const points = [...rooms.flatMap((r) => [[r.x1, r.y1], [r.x1, r.y2], [r.x2, r.y2], [r.x2, r.y1]]), ...splits];
const segs = new Map();
for (const r of rooms) {
  // Clockwise, so the room is on each edge's right (front) side.
  const corners = [[r.x1, r.y1], [r.x1, r.y2], [r.x2, r.y2], [r.x2, r.y1]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay);
    const ts = [0, 1];
    for (const [px, py] of points) {
      const t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len);
      const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (cross === 0 && t > 0 && t < 1) ts.push(t);
    }
    const uniq = [...new Set(ts)].sort((a, b) => a - b);
    for (let k = 0; k < uniq.length - 1; k++) {
      const p = [ax + (bx - ax) * uniq[k], ay + (by - ay) * uniq[k]], q = [ax + (bx - ax) * uniq[k + 1], ay + (by - ay) * uniq[k + 1]];
      const key = [p, q].map((v) => v.join(',')).sort().join('|');
      if (!segs.has(key)) segs.set(key, { a: p, b: q, rooms: [] });
      segs.get(key).rooms.push({ room: r, a: p, b: q });
    }
  }
}

const lines = [];
for (const s of segs.values()) {
  if (s.rooms.length > 2) throw new Error(`overlapping rooms at ${s.a}`);
  const [f, b] = s.rooms;
  lines.push({ a: f.a, b: f.b, front: f.room, back: b ? b.room : null, special: 0, tag: 0, flags: b ? ML.TWOSIDED : ML.BLOCKING, tex: {} });
}
// Inner lines (both sides the same sector), e.g. vehicle outlines.
const inner = (x1, y1, x2, y2, r, o = {}) => lines.push({ a: [x1, y1], b: [x2, y2], front: r, back: r, special: 0, tag: 0, flags: ML.TWOSIDED | ML.BLOCKING, tex: {}, ...o });

// The line through (x, y); `front` flips it so that room is on its front side.
function line(x, y, o = {}) {
  const l = lines.find((L) => {
    const [ax, ay] = L.a, [bx, by] = L.b;
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) !== 0) return false;
    return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
  });
  if (!l) throw new Error(`no line at ${x},${y}`);
  if (o.front && l.front !== o.front) {
    [l.a, l.b] = [l.b, l.a];
    [l.front, l.back] = [l.back, l.front];
  }
  const { front, tex, flags, ...rest } = o;
  Object.assign(l, rest);
  if (flags !== undefined) l.flags |= flags;
  if (tex) Object.assign(l.tex, tex);
  return l;
}

// Use lines 904/2..10 on the subway's west wall, 904/1 by the tag-1 door.
const PANELS = { 2: 'CTGEN1', 7: 'CTPADL1', 8: 'CTCRNK1', 9: 'CTSOCK1', 10: 'CTRADI1' };
for (let t = 2; t <= 10; t++) line(0, 16 + 32 * (t - 1), { special: 904, tag: t, tex: { mid: PANELS[t] || 'CTBUT1' } });
line(736, 1536, { special: 904, tag: 1, tex: { mid: 'CTBUT1' } });
line(0, 16, { tex: { mid: 'CTNSG1' } }); // neon by the start
// Chained gate (breakable), portal pair, objective triggers.
line(256, 384, { special: 903, tag: 50, flags: ML.BLOCKING, tex: { mid: 'CTGATE1' } });
line(256, 448, { front: C1, special: 900, tag: 100 });
line(2176, 128, { front: A1, special: 900, tag: 100 });
line(256, 512, { special: 905, tag: 130 });
line(600, 1536, { special: 905, tag: 133 });
line(-384, 1536, { front: ST, special: 906 });
line(1024, 832, { special: 903, tag: 51, flags: ML.BLOCKING, tex: { mid: 'CTBORD1' } });
line(1024, 960, { special: 903, tag: 56, flags: ML.BLOCKING, tex: { mid: 'CTGLAS1' } });
line(1024, 1400, { tex: { lower: 'CTSTEP1' } });
line(928, 1536, { special: 902, tag: 80, tex: { mid: 'CTLADR3' } });
// The chain annex: doors, ladder 81, breakables, triggers.
for (const [x, y] of [[1856, 528], [1872, 528], [2128, 528], [2144, 528], [2400, 528], [2416, 528], [2544, 656], [2544, 672], [2672, 800], [2688, 800], [2240, 656], [2240, 672]]) {
  line(x, y, { tex: { upper: 'CTDOOR2' } });
}
line(2528, 400, { special: 902, tag: 81, tex: { mid: 'CTLADR1' } });
line(2816, 928, { special: 903, tag: 55, flags: ML.BLOCKING, tex: { mid: 'CTBORD1' } });
line(2912, 928, { special: 903, tag: 57, flags: ML.BLOCKING, tex: { mid: 'CTGLAS1' } });
// The tag-1 door (opened by the script) and a plain DOOM door (special 1).
line(800, 1536, { front: ST, tex: { upper: 'CTDOOR2' } });
line(800, 1552, { front: R2, tex: { upper: 'CTDOOR2' } });
line(512, 160, { front: S, special: 1, tex: { upper: 'CTDOOR2' } });
line(528, 160, { front: R3, special: 1, tex: { upper: 'CTDOOR2' } });
// The police car's blocking outline (no textures, street on both sides).
const car = [-380, 760];
inner(car[0] - 90, car[1] - 40, car[0] + 90, car[1] - 40, ST);
inner(car[0] + 90, car[1] - 40, car[0] + 90, car[1] + 40, ST);
inner(car[0] + 90, car[1] + 40, car[0] - 90, car[1] + 40, ST);
inner(car[0] - 90, car[1] + 40, car[0] - 90, car[1] - 40, ST);

// Boards and the sewer plank standing free in the annex; objective triggers.
inner(2000, 420, 2000, 480, G1, { special: 903, tag: 52, tex: { mid: 'CTBORD1' } });
inner(2050, 420, 2050, 480, G1, { special: 903, tag: 53, tex: { mid: 'CTBORD1' } });
inner(2600, 600, 2660, 600, G5, { special: 903, tag: 54, tex: { mid: 'CTBORD1' } });
inner(1060, 1300, 1060, 1500, DK, { flags: ML.TWOSIDED, special: 905, tag: 131 });
inner(2440, 250, 2650, 250, L81, { flags: ML.TWOSIDED, special: 905, tag: 132 });
inner(1700, 410, 1700, 646, G0, { flags: ML.TWOSIDED, special: 905, tag: 140 });

// Things.
const things = [];
const thing = (x, y, angle, type, options = 7) => things.push({ x, y, angle, type, options });
thing(64, 48, 90, 1);
CT_KEY_ITEMS.forEach((it, i) => thing(128 + 48 * i, 48, 0, it.doomednum));
thing(600, 120, 0, 9040); thing(700, 120, 0, 9040); // more gas can candidate spots
thing(700, 260, 0, 9042);
[2001, 2002, 2005, 2007, 2048, 2008, 2049, 2011, 2012, 8].forEach((t, i) => thing(48 + 44 * i, 112, 0, t));
thing(464, 48, 0, 2018);
CT_ZOMBIES.forEach((z, i) => thing(64 + 72 * i, 300, 270, z.doomednum));
[[100, 900], [300, 1000], [500, 900], [700, 1100], [-100, 1300], [900, 700]].forEach(([x, y], i) => thing(x, y, 270, CT_ZOMBIES[i % 6].doomednum));
thing(1150, 900, 180, 9000);
thing(816, 1700, 270, 9005);
thing(480, 220, 1, 9010); thing(0, 1000, 2, 9010); thing(2176, 200, 3, 9010);
thing(1150, 1400, 180, 9061);
thing(2528, 330, 270, 9061);
thing(2272, 740, 0, 9042); // the welder garage's blowtorch spot
// Director markers for the chain's waves (angle = group).
thing(1640, 600, 2, 9010); thing(2272, 560, 3, 9010); thing(2544, 800, 5, 9010);
thing(2000, 600, 6, 9010); thing(2300, 450, 140, 9010);
[[0, 1300], [300, 1350], [600, 1650]].forEach(([x, y], i) => thing(x, y, i, 9062));
const vehicles = CT_DECORATIONS.filter((d) => d.spr.startsWith('V'));
vehicles.forEach((d, i) => {
  if (i === 0) { thing(car[0], car[1], 0, d.doomednum); return; }
  const row = i < 6 ? 0 : 1, k = row ? i - 6 : i;
  thing(-250 + 230 * k, row ? 1180 : 700, row ? 90 : 45 * k, d.doomednum);
});
CT_DECORATIONS.filter((d) => d.spr.startsWith('P')).forEach((d, i) => thing(-460 + 66 * i, 1440, 45 * i, d.doomednum));
thing(816, 1600, 0, 9131); thing(600, 300, 0, 9131);

// --- Compile the map lumps -----------------------------------------------------------

const sectors = rooms.map((r) => r);
const sides = [];
const lineRecs = [];
for (const l of lines) {
  const v1 = vert(...l.a), v2 = vert(...l.b);
  const two = !!l.back;
  const side = (r, other) => {
    const t = l.tex;
    const wall = r.wall;
    const rec = {
      sector: sectors.indexOf(r), top: '-', bottom: '-', mid: '-',
    };
    if (!two) rec.mid = t.mid || wall;
    else {
      // Both sides get uppers/lowers wherever the heights differ (doors move).
      if (other.ceil !== r.ceil) rec.top = t.upper || wall;
      if (other.floor !== r.floor) rec.bottom = t.lower || wall;
      if (t.mid) rec.mid = t.mid;
    }
    sides.push(rec);
    return sides.length - 1;
  };
  const f = side(l.front, l.back);
  const b = two ? side(l.back, l.front) : 0xffff;
  lineRecs.push({ v1, v2, flags: l.flags, special: l.special, tag: l.tag, f, b });
}

const name8 = (s, buf, off) => { buf.fill(0, off, off + 8); buf.write(s.toUpperCase().slice(0, 8), off, 'ascii'); };
const nodes = buildNodes({ verts, lines: lineRecs.map((l) => ({ v1: l.v1, v2: l.v2, f: l.f, b: l.b })), sides: sides.map((s) => ({ s: s.sector })) });
const nodeLumps = encodeNodeLumps(nodes);
const THINGS = Buffer.alloc(things.length * 10);
things.forEach((t, i) => [t.x, t.y, t.angle, t.type, t.options].forEach((v, k) => THINGS.writeInt16LE(v, i * 10 + k * 2)));
const LINEDEFS = Buffer.alloc(lineRecs.length * 14);
lineRecs.forEach((l, i) => [l.v1, l.v2, l.flags, l.special, l.tag, l.f, l.b].forEach((v, k) => LINEDEFS.writeUInt16LE(v, i * 14 + k * 2)));
const SIDEDEFS = Buffer.alloc(sides.length * 30);
sides.forEach((s, i) => {
  const o = i * 30;
  SIDEDEFS.writeInt16LE(0, o); SIDEDEFS.writeInt16LE(0, o + 2);
  name8(s.top, SIDEDEFS, o + 4); name8(s.bottom, SIDEDEFS, o + 12); name8(s.mid, SIDEDEFS, o + 20);
  SIDEDEFS.writeInt16LE(s.sector, o + 28);
});
const SECTORS = Buffer.alloc(sectors.length * 26);
sectors.forEach((r, i) => {
  const o = i * 26;
  SECTORS.writeInt16LE(r.floor, o); SECTORS.writeInt16LE(r.ceil, o + 2);
  name8(r.ftex, SECTORS, o + 4); name8(r.ctex, SECTORS, o + 12);
  SECTORS.writeInt16LE(r.light, o + 20); SECTORS.writeInt16LE(r.special, o + 22); SECTORS.writeInt16LE(r.tag, o + 24);
});
const mapLumps = [
  [CT_MAP, Buffer.alloc(0)], ['THINGS', THINGS], ['LINEDEFS', LINEDEFS], ['SIDEDEFS', SIDEDEFS],
  ['VERTEXES', nodeLumps.VERTEXES], ['SEGS', nodeLumps.SEGS], ['SSECTORS', nodeLumps.SSECTORS], ['NODES', nodeLumps.NODES],
  ['SECTORS', SECTORS], ['REJECT', zeroReject(sectors.length)],
  ['BLOCKMAP', buildBlockmap(nodes.verts, lineRecs.map((l) => ({ v1: l.v1, v2: l.v2 })))],
];

// --- Textures (own PNAMES + TEXTURE1), then the WAD ----------------------------------------

const patches = [];
const texDefs = [];
for (const [name, img] of Object.entries(TEXTURES)) {
  if (name === 'CTSKY1') {
    const parts = [];
    for (let k = 0; k < 8; k++) {
      const p = new Img(128, 128);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) p.set(x, y, img.px[y * 1024 + k * 128 + x]);
      patches.push({ name: `CTSKY1${String.fromCharCode(65 + k)}`, data: picture(p, 0, 0) });
      parts.push({ patch: patches.length - 1, x: k * 128 });
    }
    texDefs.push({ name, w: 1024, h: 128, parts });
    continue;
  }
  patches.push({ name: `${name}P`, data: picture(img, 0, 0) });
  texDefs.push({ name, w: img.w, h: img.h, parts: [{ patch: patches.length - 1, x: 0 }] });
}
const PNAMES = Buffer.alloc(4 + 8 * patches.length);
PNAMES.writeInt32LE(patches.length, 0);
patches.forEach((p, i) => name8(p.name, PNAMES, 4 + 8 * i));
const texBodies = texDefs.map((t) => {
  const b = Buffer.alloc(22 + 10 * t.parts.length);
  name8(t.name, b, 0);
  b.writeInt16LE(t.w, 12); b.writeInt16LE(t.h, 14); b.writeInt16LE(t.parts.length, 20);
  t.parts.forEach((p, i) => { b.writeInt16LE(p.x, 22 + 10 * i); b.writeInt16LE(0, 24 + 10 * i); b.writeInt16LE(p.patch, 26 + 10 * i); b.writeInt16LE(1, 28 + 10 * i); });
  return b;
});
const texHead = Buffer.alloc(4 + 4 * texBodies.length);
texHead.writeInt32LE(texBodies.length, 0);
let texOff = texHead.length;
texBodies.forEach((b, i) => { texHead.writeInt32LE(texOff, 4 + 4 * i); texOff += b.length; });

const lumps = [
  ...mapLumps,
  ['PNAMES', PNAMES], ['TEXTURE1', Buffer.concat([texHead, ...texBodies])],
  ['P_START', Buffer.alloc(0)], ...patches.map((p) => [p.name, p.data]), ['P_END', Buffer.alloc(0)],
  ['F_START', Buffer.alloc(0)], ...Object.entries(FLATS).map(([n, img]) => [n, flatLump(img)]), ['F_END', Buffer.alloc(0)],
  ['S_START', Buffer.alloc(0)], ...sprites.map((s) => [s.name, s.data]), ['S_END', Buffer.alloc(0)],
];
let size = 12;
for (const [, d] of lumps) size += d.length;
const wad = Buffer.alloc(size + 16 * lumps.length);
wad.write('PWAD', 0, 'ascii');
wad.writeInt32LE(lumps.length, 4);
let pos = 12;
const dir = [];
for (const [n, d] of lumps) { d.copy(wad, pos); dir.push([pos, d.length, n]); pos += d.length; }
wad.writeInt32LE(pos, 8);
for (const [o, s, n] of dir) { wad.writeInt32LE(o, pos); wad.writeInt32LE(s, pos + 4); name8(n, wad, pos + 8); pos += 16; }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, wad);

const v = validate(wad, CT_MAP, { quiet: true });
console.log(`wrote ${path.relative(root, out)} (${(wad.length / 1048576).toFixed(2)} MB): ${rooms.length} sectors, ${lines.length} lines, `
  + `${things.length} things, ${texDefs.length} textures, ${Object.keys(FLATS).length} flats, ${sprites.length} sprite frames`);
if (v.errs.length) {
  for (const e of v.errs.slice(0, 20)) console.error(`  ${e}`);
  console.error(`map ${CT_MAP} failed validation (${v.errs.length} problems)`);
  process.exit(1);
}
console.log(`map ${CT_MAP} validated: ${JSON.stringify(v.stats)}`);
