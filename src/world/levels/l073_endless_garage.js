// Level 73: The Endless Garage. A multi-storey car park that goes on in every direction: slabs
// of decks 96 m wide and as long as you care to walk, separated by canyons you can see straight
// across. The sides are open to a dusk that does not end. Every deck holds the cars of another
// decade (fins at the bottom, today at the top), connected by long ramps. Some engines are still
// warm: you can hear them tick.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, cbox, hr, levelDoor, env, M, CF } from './kit.js';
import { vehicleOf, outQuad, UVQ } from './g05_kit.js';

const N = 73;
const ZS = 128;                 // zone = one slab segment with half a canyon on each side
const S0 = 16, S1 = 112;        // slab spans x in [S0, S1) of every zone
const CEIL = 4.0;               // clear height under a deck
const MOD = 16;                 // module: bays 5 | aisle 6 | bays 5, six of them across the slab
const RAMP_L = 42;
const HOLE0 = Math.ceil(RAMP_L * 0.25);    // the deck above is open over the upper part of a ramp
const ERA = [0, 1, 3, 4];       // the decade of each deck, bottom to top

// ------------------------------------------------------------------ textures
function concrete(p, base, seed) {
  p.fill(base);
  p.noise(4, 0.1, 3);
  p.noise(10, 0.07, 2, seed + 2);
  p.grain(0.05);
}
defineTexture('lv73_deck_bay', (p) => {
  concrete(p, [116, 112, 106], 3);
  const r = p.rng;
  for (let i = 0; i < 3; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(4, 9), [70, 66, 62], 0.45);
  p.rect(0, 0, 64, 1, [236, 222, 150]); p.rect(0, 32, 64, 1, [236, 222, 150]);
  p.rect(0, 0, 1, 64, [80, 76, 72], 0.5);
}, 10);
defineTexture('lv73_deck_aisle', (p) => {
  concrete(p, [104, 100, 98], 9);
  const r = p.rng;
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(5, 11), [58, 54, 54], 0.5);
  p.speckle(40, [150, 146, 138], 0.3, 0.6);
  p.rect(0, 0, 64, 1, [80, 76, 72], 0.5); p.rect(0, 0, 1, 64, [80, 76, 72], 0.5);
}, 10);
defineTexture('lv73_wall', (p) => {
  concrete(p, [196, 186, 164], 5);
  p.rect(0, 40, 64, 8, [190, 128, 60]);
  p.rect(0, 39, 64, 1, [120, 80, 40], 0.7);
  p.rect(0, 48, 64, 1, [120, 80, 40], 0.7);
  for (let i = 0; i < 5; i++) p.drip(p.rng.int(0, 63), 0, p.rng.int(8, 36), [140, 128, 108], 0.3, 1);
}, 12);
defineTexture('lv73_ceil', (p) => {
  concrete(p, [152, 146, 136], 7);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [118, 112, 104], 0.7);
  p.stain(30, 36, 12, [110, 104, 96], 0.4);
}, 10);
defineTexture('lv73_column', (p) => {
  concrete(p, [196, 196, 196], 1);
  p.rect(0, 0, 64, 2, [150, 150, 150], 0.5);
  p.rect(0, 44, 64, 1, [90, 90, 90], 0.5);
}, 10);

defineMaterial('lv73_deck_bay', 'lv73_deck_bay', { su: 5, sv: 5, surf: 'concrete' });
defineMaterial('lv73_deck_aisle', 'lv73_deck_aisle', { s: 6, surf: 'concrete' });
defineMaterial('lv73_wall', 'lv73_wall', { su: 4, sv: 3.2, surf: 'concrete', stain: 0.08 });
defineMaterial('lv73_ceil', 'lv73_ceil', { s: 4, surf: 'concrete', stain: 0.05 });
// columns are painted in the colour of their deck
const DECK_COL = [[1.1, 0.5, 0.38], [1.1, 0.88, 0.36], [0.45, 0.9, 0.6], [0.5, 0.66, 1.1]];
DECK_COL.forEach((c, k) => defineMaterial('lv73_column' + k, 'lv73_column', { su: 3, sv: 3, surf: 'concrete', tint: c }));

// ------------------------------------------------------------------ the ramp's side wall
// A parapet that follows the slope, with a skirt that hides the underside of the ramp: one piece
// per prop (opts.len metres along +z, rising opts.rise; dir +1: the wall stands on +x of the
// origin with the ramp on its -x side, dir -1: the other way round).
defineProp('lv73_rampside', {
  build(mb, p) {
    const len = p.opts.len || 8, rise = p.opts.rise || 1.2, ph = 1.1, th = 0.3, low = -1.8;
    const dir = p.opts.dir || 1;
    const st = S('lv73_wall'), top = S('lv73_ceil');
    const x0 = dir > 0 ? 0 : -th, x1 = dir > 0 ? th : 0;
    const ix = dir > 0 ? x0 : x1, ox = dir > 0 ? x1 : x0;
    const from = [(x0 + x1) / 2, 0, len / 2];
    const cy = (z) => (rise * z) / len;
    outQuad(mb, [ox, low, 0], [ox, low, len], [ox, cy(len) + ph, len], [ox, ph, 0], st, UVQ, from);
    outQuad(mb, [ix, 0, 0], [ix, cy(len), len], [ix, cy(len) + ph, len], [ix, ph, 0], st, UVQ, from);
    outQuad(mb, [x0, ph, 0], [x1, ph, 0], [x1, cy(len) + ph, len], [x0, cy(len) + ph, len], top, UVQ, from);
    outQuad(mb, [x0, low, len], [x1, low, len], [x1, cy(len) + ph, len], [x0, cy(len) + ph, len], st, UVQ, from);
  },
  boxes: (p) => {
    const dir = p.opts.dir || 1, len = p.opts.len || 8, rise = p.opts.rise || 1.2, out = [];
    for (let k = 0; k < Math.ceil(len); k++) out.push([dir > 0 ? 0 : -0.3, -1.8, k, dir > 0 ? 0.3 : 0, (rise * Math.min(k + 1, len)) / len + 1.1, Math.min(k + 1, len)]);
    return out;
  },
});

// ------------------------------------------------------------------ layout
// one ramp up per deck, in an aisle of its own, starting at a z that depends on the zone
const rampOf = (k, zi) => ({ x: S0 + MOD * (1 + 2 * k) + 5, z: 8 + 24 * ((((zi * 2 + k) % 4) + 4) % 4), w: 6 });
const bridgeAt = (c, zi, k) => (hr(c, zi * 4 + k, 7301) < 0.85 ? { z: 24 + 16 * Math.floor(hr(c, zi, 7302) * 5) } : null);
const ENTRY = { x: 20.5, z: 60.5, k: 2 };
const WALL_X = ENTRY.x + 0.75 + 0.12 + 0.01;   // wall plane behind the arrival door (east of the player)

function car(zb, k, x, z, rot) {
  const era = Math.max(0, Math.min(4, ERA[k] + (hr(x * 4, z * 4, 7310) < 0.2 ? -1 : hr(x * 4, z * 4, 7311) > 0.85 ? 1 : 0)));
  const v = vehicleOf(era, hr(x * 7, z * 3, 7312), hr(x * 3, z * 7, 7313));
  const warm = hr(x * 5, z * 5, 7314) < 0.13;
  const lit = hr(x * 5, z * 5, 7315) < 0.05;
  zb.prop('g05_car', x, 0, z, rot, { kind: v.kind, tint: v.tint, warm, hl: lit ? 1 : 0, tail: lit || warm ? 1 : 0 });
}

function gen(zb) {
  zb.noConnectivity = true;
  const k = zb.zone.level;
  const { x0, z0, x1, z1 } = zb;
  const zi = Math.floor(z0 / ZS), xi = Math.floor(x0 / ZS);
  const top = k === 3;
  const entryZone = k === ENTRY.k && xi === 0 && zi === 0;
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(CF.VOID);
  const rampUp = k < 3 ? rampOf(k, zi) : null;
  const rampIn = k > 0 ? rampOf(k - 1, zi) : null;
  const R = (r, a, b) => ({ xa: x0 + r.x, xb: x0 + r.x + r.w, za: z0 + r.z + a, zb: z0 + r.z + b });
  const up = rampUp && R(rampUp, 0, RAMP_L), hole = rampIn && R(rampIn, HOLE0, RAMP_L), inFull = rampIn && R(rampIn, 0, RAMP_L);
  const within = (r, x, z, pad = 0) => r && x > r.xa - pad && x < r.xb + pad && z >= r.za - pad && z < r.zb + pad;
  // bridges over the canyon on either side of this slab
  const bR = bridgeAt(xi, zi, k), bL = bridgeAt(xi - 1, zi, k);
  const onBridge = (x, z) => (bR && x >= x0 + S1 && z >= z0 + bR.z && z < z0 + bR.z + 6) || (bL && x < x0 + S0 && z >= z0 + bL.z && z < z0 + bL.z + 6);
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const lx = x - x0;
    const slab = lx >= S0 && lx < S1;
    if (!slab && !onBridge(x, z)) return;
    zb.flags[i] = 0;
    const mi = slab ? ((lx - S0) % MOD) : 6;
    zb.floor[i] = 0;
    zb.ceil[i] = top && slab ? NaN : slab ? CEIL : 3.4;
    zb.fmat[i] = slab && !(mi >= 5 && mi < 11) ? M.lv73_deck_bay : M.lv73_deck_aisle;
    zb.cmat[i] = M.lv73_ceil;
    zb.wmat[i] = M.lv73_wall;
    if (within(up, x + 0.5, z + 0.5)) {
      const row = z - up.za;
      zb.floor[i] = (6 * (row + 0.5)) / RAMP_L;
      zb.flags[i] = CF.SMOOTH;
      zb.fmat[i] = M.lv73_deck_aisle;
      if (row >= HOLE0) zb.ceil[i] = NaN;
    }
    if (within(hole, x + 0.5, z + 0.5)) zb.floor[i] = NaN;
  });
  const colM = M['lv73_column' + k];

  // cores with a level door: brush blocks in the east row of a module, the door on the aisle side
  const cores = [];
  for (let m = 0; m < 6; m++) for (let j = 0; j < 2; j++) {
    const isEntry = entryZone && m === 0 && j === 0;
    if (!isEntry && hr(m + xi * 6, j + zi * 2, 7350 + k) > 0.45) continue;
    const zc = isEntry ? 56 : j * 64 + 8 * (1 + Math.floor(hr(m, j + zi * 2, 7351) * 6));
    const c = { mx: x0 + S0 + m * MOD, z0: z0 + zc, entry: isEntry };
    c.xf = isEntry ? x0 + WALL_X : c.mx + 11;
    if (!isEntry && (within(up, c.mx + 8, c.z0 + 4, 8) || within(inFull, c.mx + 8, c.z0 + 4, 8))) continue;
    cores.push(c);
  }
  const inCore = (x, z) => cores.some((c) => x > c.xf - 1.2 && x < c.mx + 16.5 && z > c.z0 - 1.4 && z < c.z0 + 9.4);

  // edges of the slab: a kerb and cable rails (you can see through them), a deep fascia beam above
  const rail = (xa, za, zb_, w) => {
    cbox(zb, xa - w, 0, za, xa + w, 0.22, zb_, M.concrete, { sub: 8 });
    for (const y of [0.55, 1.02]) cbox(zb, xa - 0.035, y, za, xa + 0.035, y + 0.06, zb_, M.metal_dark, { sub: 16 });
    for (let pz = Math.ceil(za / 4) * 4; pz < zb_; pz += 4) cbox(zb, xa - 0.05, 0, pz - 0.05, xa + 0.05, 1.08, pz + 0.05, M.metal_dark, { sub: 4 });
  };
  const edge = (xa, xb, b) => {
    const gaps = b ? [[z0 + b.z, z0 + b.z + 6]] : [];
    let a = z0;
    for (const [g0, g1] of [...gaps, [z1, z1]]) {
      if (g0 > a) {
        rail((xa + xb) / 2, a, g0, 0.2);
        if (!top) cbox(zb, xa, CEIL + 0.1, a, xb + 0.2, 6.0, g0, M.lv73_ceil, { sub: 3 });
      }
      a = g1;
    }
  };
  edge(x0 + S0, x0 + S0 + 0.3, bL);
  edge(x0 + S1 - 0.3, x0 + S1, bR);
  for (const [b, bx0, bx1] of [[bR, x0 + S1, x1], [bL, x0, x0 + S0]]) {
    if (!b) continue;
    for (const dz of [0.15, 5.85]) {
      cbox(zb, bx0, 0, z0 + b.z + dz - 0.15, bx1, 0.22, z0 + b.z + dz + 0.15, M.concrete, { sub: 8 });
      for (const y of [0.55, 1.02]) cbox(zb, bx0, y, z0 + b.z + dz - 0.035, bx1, y + 0.06, z0 + b.z + dz + 0.035, M.metal_dark, { sub: 16 });
    }
  }
  // columns: every 8 m in z along the lines of each module
  if (!top) for (let m = 0; m < 6; m++) for (const dx of [0.5, 5, 11]) {
    const cx = x0 + S0 + m * MOD + dx;
    for (let j = Math.floor(z0 / 8); j * 8 < z1; j++) {
      const cz = j * 8;
      if (cz < z0 || cz >= z1 || cx < x0 + S0 + 0.7 || cx > x0 + S1 - 0.7) continue;
      if (within(up, cx, cz, 1) || within(inFull, cx, cz, 1) || inCore(cx, cz)) continue;
      cbox(zb, cx - 0.4, 0, cz - 0.4, cx + 0.4, 6.0, cz + 0.4, colM, { sub: 3 });
      if (dx !== 0.5 && j % 2 === 0) {
        zb.decal(cx, 1.5, cz - 0.41, 'nz', 0.5, 0.7, 'digit_' + (k + 1), { lit: true });
        zb.decal(cx, 1.5, cz + 0.41, 'pz', 0.5, 0.7, 'digit_' + (k + 1), { lit: true });
      }
    }
  }
  // beams across the slab above every column line
  if (!top) for (let j = Math.floor(z0 / 8); j * 8 < z1; j++) {
    const cz = j * 8;
    if (cz >= z0 && cz < z1) cbox(zb, x0 + S0, CEIL - 0.7, cz - 0.3, x0 + S1, CEIL, cz + 0.3, M.lv73_ceil, { sub: 4, collide: false });
  }
  // the ramp's sloping sides, the hole's edges
  if (up) {
    for (let s = 0; s < RAMP_L; s += 8) {
      const len = Math.min(8, RAMP_L - s), y = (6 * s) / RAMP_L, rise = (6 * len) / RAMP_L;
      if (zb.in(Math.floor(up.xa), Math.floor(up.za + s))) {
        zb.prop('lv73_rampside', up.xa, y, up.za + s, 0, { dir: -1, rise, len });
        zb.prop('lv73_rampside', up.xb, y, up.za + s, 0, { dir: 1, rise, len });
      }
    }
    for (let s = 4; s < RAMP_L; s += 8) zb.light((up.xa + up.xb) / 2, (6 * s) / RAMP_L + 2.6, up.za + s, { color: [1.0, 0.72, 0.42], rad: 9, int: 0.9 });
  }
  if (hole) {
    cbox(zb, hole.xa - 0.3, -2, hole.za, hole.xa, 1.1, hole.zb, M.lv73_wall, { sub: 4 });
    cbox(zb, hole.xb, -2, hole.za, hole.xb + 0.3, 1.1, hole.zb, M.lv73_wall, { sub: 4 });
    cbox(zb, hole.xa - 0.3, -2, hole.za - 0.3, hole.xb + 0.3, 1.1, hole.za, M.lv73_wall, { sub: 4 });
  }
  // cars, a third of the bays
  for (let m = 0; m < 6; m++) {
    const mx = x0 + S0 + m * MOD;
    for (let b = Math.floor(z0 / 2.5); b * 2.5 < z1; b++) {
      const cz = b * 2.5 + 1.25;
      if (cz < z0 || cz >= z1) continue;
      for (const side of [0, 1]) {
        const cx = side === 0 ? mx + 2.5 : mx + 13.5;
        if (hr(b, m * 2 + side + xi * 12, 7320 + k) > 0.34) continue;
        if (within(up, cx, cz, 1) || within(inFull, cx, cz, 1) || inCore(cx, cz)) continue;
        if (entryZone && Math.abs(cz - ENTRY.z) < 9 && cx < 36) continue;
        const back = hr(b, m * 2 + side + xi * 12, 7330) < 0.3;
        car(zb, k, cx, cz, (side === 0) !== back ? -Math.PI / 2 : Math.PI / 2);
      }
    }
  }
  // lights: warm lamps along the aisles under the beams, the glow of the sky along both edges
  if (!top) for (let m = 0; m < 6; m++) for (let j = Math.floor(z0 / 8); j * 8 < z1; j++) {
    const lx = x0 + S0 + m * MOD + 8, lz = j * 8 + 4;
    if (lz < z0 || lz >= z1 || within(up, lx, lz, 0) || within(inFull, lx, lz, 0)) continue;
    const u = hr(Math.floor(lx), lz, 7340);
    const state = u < 0.07 ? 0 : u < 0.14 ? 2 : 1;
    const ch = state === 2 ? 5 + (j & 3) : u > 0.9 ? 1 + (j & 3) : 0;
    zb.fixture(lx, lz, 'tube', state !== 0, { ch, rot: 1, l: 2.2, y: CEIL - 0.02 });
    if (state) zb.light(lx, CEIL - 0.9, lz, { color: [1.0, 0.72, 0.42], rad: 8.4, int: 0.95, ch });
  }
  for (let j = Math.floor(z0 / 10); j * 10 < z1; j++) {
    const lz = j * 10 + 5;
    if (lz < z0 || lz >= z1) continue;
    for (const lx of [x0 + S0 + 2.5, x0 + S1 - 2.5]) zb.light(lx, top ? 2.6 : 2.2, lz, { color: [0.55, 0.5, 0.95], rad: 11, int: top ? 0.5 : 0.6 });
  }
  // the roof deck: tall lamp poles along both edges and down the middle of the aisles
  if (top) {
    const pole = (px, pz, arm) => {
      if (pz < z0 || pz >= z1 || px < x0 || px >= x1 || within(up, px, pz, 0) || within(inFull, px, pz, 1) || inCore(px, pz)) return;
      zb.box(px - 0.1, 0, pz - 0.1, px + 0.1, 7.2, pz + 0.1, M.metal_dark);
      zb.box(px - 0.06, 7.1, pz - 0.9, px + 0.06, 7.2, pz + 0.9, M.metal_dark, { collide: false });
      for (const s of [-1, 1]) zb.box(px - 0.2, 6.98, pz + s * 0.9 - 0.3, px + 0.2, 7.1, pz + s * 0.9 + 0.3, M.glow_bulb, { collide: false });
      zb.light(px + arm, 6.2, pz, { color: [1.0, 0.76, 0.5], rad: 10, int: 0.9 });
    };
    for (let j = Math.floor(z0 / 12); j * 12 < z1; j++) { pole(x0 + S0 + 1.2, j * 12 + 6, 1); pole(x0 + S1 - 1.2, j * 12 + 6, -1); }
    for (let m = 0; m < 6; m++) for (let j = Math.floor(z0 / 16); j * 16 < z1; j++) pole(x0 + S0 + m * MOD + 8, j * 16 + 8, 0);
  }
  // the cores themselves
  for (const c of cores) {
    const hgt = top ? 3.2 : CEIL;
    if (!zb.in(Math.floor(c.xf + 1), Math.floor(c.z0 + 1)) && !zb.in(Math.floor(c.mx + 14), Math.floor(c.z0 + 1))) continue;
    cbox(zb, c.xf, 0, c.z0, c.mx + 16.5, hgt, c.z0 + 8, M.lv73_wall, { sub: 2 });
    if (top) cbox(zb, c.xf - 0.2, hgt, c.z0 - 0.2, c.mx + 16.7, hgt + 0.2, c.z0 + 8.2, M.lv73_ceil);
    const dz = c.z0 + 4 + (c.entry ? 0.5 : 0);
    if (zb.in(Math.floor(c.xf - 1), Math.floor(dz))) {
      zb.decal(c.xf, 1.9, dz + 1.4, 'nx', 0.8, 0.8, 'sign_stairs');
      zb.prop('extinguisher', c.xf - 0.03, 0, dz - 1.8, -Math.PI / 2, {});
      if (!c.entry) levelDoor(zb, c.xf - 0.13, dz, -Math.PI / 2, {});
    }
  }
}

defineZone('lv73_garage', {
  ...LEVEL_ZONE,
  doors: true,
  params: (zone) => ({
    ambient: zone.level === 3 ? [0.62, 0.5, 0.62] : [0.3, 0.25, 0.34],
    env: env({ fog: [0.5, 0.34, 0.42], fogNear: 8, fogFar: 78, hum: 0.05, hvac: 0.2, reverb: 'hall', tone: 'g05_dusk' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE ENDLESS GARAGE',
  zoneType: 'lv73_garage',
  zoneSize: ZS,
  bands: [0, 1, 2, 3],
  entry: { x: ENTRY.x, y: ENTRY.k * 6, z: ENTRY.z, yaw: -Math.PI / 2, pitch: 0.03 },
  doorDensity: 0.7,
  viewRadius: 4,
  fallTo: 'entry',
  sky: {
    top: [0.05, 0.05, 0.2], horizon: [0.92, 0.5, 0.42], ground: [0.24, 0.15, 0.28], curve: 0.5,
    sun: { dir: [1, -0.04, 0.25], color: [1.0, 0.55, 0.35], size: 0, halo: 0.55 },
    stars: 0.45,
    clouds: { layer: 'g05_clouds', color: [0.8, 0.45, 0.5], amount: 0.45, speed: 0.001, scale: 0.3 },
  },
  grade: { sat: 1.05, tint: [1.02, 0.97, 1.0] },
  light: { phoneRadius: 3.4, phoneIntensity: 0.16 },
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 20) - dt;
    if (s.t > 0) return;
    s.t = 30 + Math.random() * 60;
    const p = ctx.player, a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
    ctx.game.audioCall('play', 'g05_panel', p.x + Math.sin(a) * d, p.y + 1, p.z - Math.cos(a) * d, { distant: true, vol: 0.8 });
  },
});
