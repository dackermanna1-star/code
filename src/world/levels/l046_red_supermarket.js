// Level 46: The Red Supermarket. A big sales floor under dim red light: short gondola runs in a
// regular grid of aisles, hanging signs over every aisle, chiller cases glowing along some of
// them. Every product on every shelf wears the same label: DO NOT CONSUME. Now and then the
// lights stutter and go out; when they come back, some of the aisles (the ones you were not
// looking at) have been stocked differently.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, ceilingLight, levelDoor, hr, env, M, CF, W, cbox } from './kit.js';
import { txt, txtC, mulc, pack, signTexture, pmod, signBoard } from './g06_kit.js';

const N = 46;
const G = 64;
const PX = 4, PZ = 16;        // lattice: gondola every 4 m in x, runs of 10 m every 16 m in z
const RUN0 = 3, RUN1 = 13;    // run cells: z mod 16 in [3, 13)
const CH = 3.1;
const SH = 1.8;

const RED = [200, 40, 36], DRED = [140, 20, 26], PINK = [214, 130, 126], WHITE = [230, 226, 218], BLACK = [26, 22, 24];

// ------------------------------------------------------------------ textures
// a package: red body, white label with two lines of text-like bars
function pkg(p, x, y, w, h, c) {
  pack(p, x, y, w, h, c, 0.22);
  if (w >= 5 && h >= 6) {
    const lx = x + 1, lw = w - 3, ly = y + Math.max(1, (h >> 1) - 2), lh = Math.min(5, h - 3);
    p.rect(lx, ly, lw, lh, WHITE);
    p.rect(lx, ly + 1, lw, 1, BLACK);
    p.rect(lx, ly + 3, Math.max(1, lw - 2), 1, BLACK);
  }
}
const LV = [[1, 12], [14, 12], [27, 12], [40, 12], [53, 10]];

function bayTexture(p, r, style, v) {
  p.fill(style === 4 ? [150, 110, 76] : [64, 56, 58]);
  p.noise(4, 0.06, 2);
  const reds = [RED, DRED, [176, 30, 34], [120, 16, 22]];
  for (const [y0, h] of LV) {
    p.rect(0, y0 + h, 64, 2, [196, 196, 200]);                    // the board
    p.rect(0, y0 + h + 2, 64, 1, [24, 20, 22], 0.6);
    let x = r.int(0, 3);
    while (x < 62) {
      const w = r.int(6, 10), hh = r.int(Math.max(6, h - 4), h), y = y0 + h - hh;
      if (style === 0) pkg(p, x, y, w, hh, r.pick(reds));
      else if (style === 1) { if (r.chance(0.12)) pkg(p, x, y, w, hh, DRED); }
      else if (style === 2) pkg(p, x, y0 + 1, 8, h - 1, RED);
      else if (style === 3) { pkg(p, x, y, w, hh, [226, 222, 214]); p.rect(x + 1, y + 1, w - 3, 2, RED); }
      else { pack(p, x, y, w, hh, [168, 126, 88], 0.15); p.rect(x + 2, y + 3, w - 5, 1, [120, 84, 54]); }
      x += (style === 2 ? 8 : w) + (style === 2 ? 0 : r.int(0, 2));
    }
    if (style !== 4) for (let k = 0; k < 3; k++) p.rect(r.int(2, 54), y0 + h + 2, 7, 2, WHITE);   // shelf-edge tags
  }
  p.grain(0.02);
}
for (let s = 0; s < 5; s++) for (let v = 0; v < 3; v++) {
  defineTexture(`lv46_bay${s}_${v}`, (p, r) => bayTexture(p, r, s, v), 16);
  defineMaterial(`lv46_bay${s}_${v}`, `lv46_bay${s}_${v}`, { su: 1, sv: SH, surf: 'concrete' });
}

defineTexture('lv46_header', (p) => {
  p.fill([150, 20, 26]);
  p.noise(4, 0.05, 2);
  p.rect(0, 0, 64, 3, [230, 226, 218]); p.rect(0, 61, 64, 3, [230, 226, 218]);
  txtC(p, 'DO NOT', 32, 11, WHITE, 1, 2);
  txtC(p, 'CONSUME', 32, 33, WHITE, 1, 2);
}, 6);
defineMaterial('lv46_header', 'lv46_header', { su: 1, sv: 0.45, surf: 'metal' });

defineTexture('lv46_top', (p) => { p.fill([40, 36, 38]); p.noise(4, 0.08, 2); p.rect(0, 0, 64, 3, [90, 84, 86]); }, 6);
defineMaterial('lv46_top', 'lv46_top', { s: 1, surf: 'metal' });
defineTexture('lv46_side', (p) => { p.fill([90, 84, 88]); p.noise(4, 0.06, 2); p.rect(0, 0, 5, 64, [60, 56, 60]); }, 6);
defineMaterial('lv46_side', 'lv46_side', { s: 1, surf: 'metal' });

defineTexture('lv46_floor', (p) => {
  p.fill([84, 34, 32]);
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { p.rect(x, y, 16, 16, ((x + y) / 16) % 2 ? [92, 38, 36] : [78, 30, 30]); p.rect(x, y, 16, 1, [50, 20, 20]); p.rect(x, y, 1, 16, [50, 20, 20]); }
  p.noise(8, 0.08, 2);
  p.speckle(60, [150, 80, 70], 0.2, 0.5);
  p.stain(40, 22, 10, [30, 12, 12], 0.5);
}, 12);
defineMaterial('lv46_floor', 'lv46_floor', { s: 2.4, surf: 'lino' });
defineTexture('lv46_ceil', (p) => {
  p.fill([86, 74, 76]);
  p.noise(4, 0.06, 2);
  for (let i = 0; i < 64; i += 16) { p.rect(i, 0, 1, 64, [40, 34, 36]); p.rect(0, i, 64, 1, [40, 34, 36]); }
  p.stain(30, 30, 12, [50, 40, 36], 0.5);
}, 8);
defineMaterial('lv46_ceil', 'lv46_ceil', { s: 2.4, surf: 'drywall' });

// big pack face for the end-cap displays
defineTexture('lv46_pkg', (p) => {
  p.fill(RED);
  p.noise(4, 0.05, 2);
  p.rect(0, 0, 64, 6, DRED); p.rect(0, 58, 64, 6, DRED);
  p.rect(6, 12, 52, 40, WHITE);
  p.frame(6, 12, 52, 40, BLACK);
  txtC(p, 'DO NOT', 32, 18, BLACK, 1, 2);
  txtC(p, 'CONSUME', 32, 36, BLACK, 1, 2);
}, 8);
defineMaterial('lv46_pkg', 'lv46_pkg', { s: 1, surf: 'plastic' });
defineTexture('lv46_pkg_top', (p) => { p.fill([176, 30, 34]); p.noise(4, 0.06, 2); }, 4);
defineMaterial('lv46_pkg_top', 'lv46_pkg_top', { s: 1, surf: 'plastic' });

// hanging aisle signs
const SIGN = [['DO NOT', 'CONSUME'], ['DO NOT', 'CONSUME'], ['STILL', 'DO NOT'], ['NEVER', 'CONSUME']];
SIGN.forEach((lines, k) => {
  defineTexture(`lv46_sign${k}`, (p) => signTexture(p, [22, 18, 20], [236, 232, 224], lines, { frame: [200, 40, 36], sy: 2, noise: 0.03 }), 6);
  defineMaterial(`lv46_sign${k}`, `lv46_sign${k}`, { s: 1, surf: 'plastic' });
});

// self-lit chiller case front (rows of identical packs in a cold glow)
defineTexture('lv46_fridge', (p, r) => {
  p.fill([200, 70, 66]);
  for (let y = 0; y < 64; y += 16) {
    p.rect(0, y + 12, 64, 4, [235, 235, 235]);
    let x = 1;
    while (x < 60) { pkg(p, x, y + 2, 8, 10, [220, 40, 38]); x += 9; }
  }
  p.noise(4, 0.04, 2);
  void r;
}, 12);
defineMaterial('lv46_fridge', 'lv46_fridge', { su: 1, sv: SH, surf: 'metal', flags: VF.FULLBRIGHT, glow: 0.8 });
defineTexture('lv46_pillar', (p) => { p.fill([160, 150, 150]); p.noise(4, 0.06, 2); p.rect(0, 40, 64, 24, [110, 30, 30]); p.rect(0, 40, 64, 2, [60, 16, 16]); }, 8);
defineMaterial('lv46_pillar', 'lv46_pillar', { su: 1, sv: 3, surf: 'concrete' });
defineMaterial('lv46_rod', 'metal_dark', { s: 1, surf: 'metal' });
defineTexture('lv46_tube', (p) => { p.fill([255, 150, 140]); p.rect(0, 0, 64, 6, [200, 60, 56]); p.rect(0, 58, 64, 6, [200, 60, 56]); p.noise(4, 0.04, 2); }, 6);
defineMaterial('lv46_tube', 'lv46_tube', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: 13 });
defineMaterial('lv46_tube_f', 'lv46_tube', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: 2 });
defineMaterial('lv46_tube_d', 'lv46_tube', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, chan: 6 });
defineMaterial('lv46_tube_off', 'metal_dark', { s: 1, surf: 'metal' });

// ------------------------------------------------------------------ the sales floor
const mutOf = (world, dim, level, x, z) => {
  if (!world || !world.mutation) return 0;
  return world.mutation.get(`${dim}/${level}/${Math.floor(x / G) * G}/${Math.floor(z / G) * G}`) || 0;
};

// what a run looks like: mostly stocked, sometimes bare, repeated, white, backs, or a chiller
function runStyle(rx, rz, mut) {
  const h = hr(rx, rz, 460 + mut * 17);
  if (h < 0.5) return 0;
  if (h < 0.6) return 1;
  if (h < 0.72) return 2;
  if (h < 0.82) return 3;
  if (h < 0.9) return 4;
  return 5;
}
const bayMat = (s, gx, z, k) => (s === 5 ? M.lv46_fridge : M[`lv46_bay${s}_${Math.floor(hr(gx, z, 461 + k * 7) * 3)}`]);

function gen(zb, world) {
  const mut = mutOf(world, zb.zone.dim, zb.zone.level, zb.x0, zb.z0);
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv46_floor);
  zb.cmat.fill(M.lv46_ceil);
  zb.wmat.fill(M.concrete_dark);
  zb.flags.fill(0);
  const top = M.lv46_top, side = M.lv46_side;
  // the run with the door set into it (one per zone, chosen by position only)
  const zc = Math.floor(zb.x0 / G), zr = Math.floor(zb.z0 / G);
  const drx = zc * (G / PX) + Math.floor(hr(zc, zr, 49) * (G / PX)), drz = zr * (G / PZ) + Math.floor(hr(zc, zr, 50) * (G / PZ));
  for (let rx = Math.floor(zb.x0 / PX); rx < zb.x1 / PX; rx++) {
    const gx = rx * PX;
    for (let rz = Math.floor(zb.z0 / PZ); rz < zb.z1 / PZ; rz++) {
      const z0 = rz * PZ + RUN0, z1 = rz * PZ + RUN1;
      const style = runStyle(rx, rz, mut);
      const alt = runStyle(rx + 1000, rz, mut);
      const sb = style === 5 ? 5 : alt === 5 ? 0 : alt;
      const hasDoor = rx === drx && rz === drz;
      const zMid = Math.floor((z0 + z1) / 2);
      for (let z = z0; z < z1; z++) {
        if (!zb.in(gx, z)) continue;
        if (z === z0 || z === z1 - 1) {
          // a pyramid of packs facing the cross aisle
          const dir = z === z0 ? -1 : 1;
          let y = 0;
          const n = style === 5 ? 1 : 3;
          for (let k = 0; k < n; k++) {
            const inset = k * 0.12;
            const m = [side, side, M.lv46_pkg_top, null, dir > 0 ? M.lv46_pkg : side, dir < 0 ? M.lv46_pkg : side];
            zb.box(gx + 0.08 + inset, y, z + 0.1, gx + 0.92 - inset, y + 0.42, z + 0.9, m, { uv: 'fit' });
            y += 0.42;
          }
          continue;
        }
        if (hasDoor && (z === zMid - 1 || z === zMid)) continue;
        zb.box(gx + 0.02, 0, z, gx + 0.98, SH, z + 1, [bayMat(style, gx, z, 0), bayMat(sb, gx, z, 1), top, null, null, null], { uv: 'world' });
      }
      if (hasDoor && zb.in(gx, zMid)) {
        zb.box(gx + 0.02, 0, zMid - 1, gx + 0.98, SH + 0.45, zMid + 1, side, { uv: 'world' });
        levelDoor(zb, gx + 1.13, zMid, Math.PI / 2, { y: 0 });
        zb.light(gx + 1.6, 1.6, zMid, { color: [1.0, 0.5, 0.35], rad: 5, int: 0.5 });
      }
      // header board standing above the run's spine (long boxes: no subdivision)
      cbox(zb, gx + 0.46, SH, z0 + 1, gx + 0.54, SH + 0.45, z1 - 1, M.lv46_header, { sub: 99 });
      // hanging signs over the aisle beside this run, at both mouths
      const k = Math.floor(hr(rx, rz, 470 + mut * 5) * 3.99);
      const sm = M[`lv46_sign${k === 0 ? 0 : k === 1 ? 0 : k}`];
      for (const zz of [z0 - 0.4, z1 + 0.4]) {
        const sx = gx + PX / 2 + 0.5;
        if (zb.in(Math.floor(sx), Math.floor(zz))) signBoard(zb, sx, CH - 0.85, zz, 1.5, 0.75, 'x', sm, sm, M.lv46_rod);
      }
      if (style === 5 && zb.in(gx, zMid)) zb.emitter(gx + 0.5, 1.0, zMid, 'lv46_fridge', { vol: 0.7, rad: 10 });
    }
  }
  // lights: red tubes over the aisles' middles and along the cross aisles (most are on the 'event'
  // channel, so the stutter takes them out together)
  const tube = (x, z, alongZ, u) => {
    const state = u < 0.06 ? 0 : u < 0.14 ? 1 : u < 0.2 ? 2 : 3;
    const mat = [M.lv46_tube_off, M.lv46_tube_f, M.lv46_tube_d, M.lv46_tube][state];
    const hw = alongZ ? 0.22 : 0.7, hl = alongZ ? 0.7 : 0.22;
    zb.box(x - hw, CH - 0.07, z - hl, x + hw, CH, z + hl, mat, { collide: false, skip: 55 });
    if (state) zb.light(x, CH - 0.45, z, { color: [1.0, 0.2, 0.16], rad: 7, int: 0.95, ch: state === 1 ? 2 : state === 2 ? 6 : 13 });
  };
  for (let x = zb.x0; x < zb.x1; x++) {
    if (pmod(x, PX) !== 2) continue;
    for (let rz = Math.floor(zb.z0 / PZ); rz < zb.z1 / PZ; rz++) {
      const z = rz * PZ + 8;
      if (zb.in(x, z)) tube(x + 0.5, z + 0.5, true, hr(x, rz, 480 + mut));
      if (zb.in(x, rz * PZ)) tube(x + 0.5, rz * PZ + 0.5, false, hr(x, rz, 481));
    }
  }
  // a row of carts by the entrance
  for (let k = 0; k < 4; k++) {
    const cx = 36 + k * 0.5, cz = 29.5;
    if (zb.in(Math.floor(cx), Math.floor(cz))) zb.prop('shopping_cart', cx, 0, cz, Math.PI / 2);
  }
}

defineZone('lv46_store', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.4, 0.085, 0.075],
    env: env({ fog: [0.2, 0.025, 0.025], fogNear: 3, fogFar: 36, hum: 0.55, hvac: 0.35, reverb: 'warehouse', tone: 'lv46_store' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the lights stutter out
function flickerPattern(t) {
  // 0..2.6 s: stutter, dark, stutter, back
  if (t < 0.15) return 1;
  if (t < 0.3) return 0.1;
  if (t < 0.5) return 1;
  if (t < 0.62) return 0.0;
  if (t < 0.8) return 0.7;
  if (t < 2.0) return 0.0;
  if (t < 2.15) return 0.6;
  if (t < 2.3) return 0.0;
  if (t < 2.5) return 1;
  if (t < 2.62) return 0.2;
  return 1;
}

defineLevel(N, {
  name: 'THE RED SUPERMARKET',
  zoneType: 'lv46_store',
  zoneSize: G,
  entry: { x: 34.0, y: 0, z: 32.0, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 3,
  grade: { sat: 1.1, tint: [1.08, 0.92, 0.92] },
  light: { phoneRadius: 3.6, phoneIntensity: 0.2 },
  script(ctx, dt) {
    const s = ctx.state, g = ctx.game, p = ctx.player;
    if (s.next === undefined) s.next = 28;
    if (s.ev === undefined) s.ev = -1;
    if (s.ev < 0) {
      s.next -= dt;
      g.flicker.event = 1;
      if (s.next > 0) return;
      s.ev = 0; s.done = false;
      g.audioCall('play', 'flick_off');
    }
    s.ev += dt;
    g.flicker.event = flickerPattern(s.ev);
    // in the dark, restock the zones behind the player
    if (s.ev > 0.9 && !s.done) {
      s.done = true;
      const lvl = g.world.levelOf(p.y);
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const mine = g.world.zoneAt(p.dim, lvl, p.x, p.z);
      let best = null, bd = 9;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, d = 56;
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        const dot = (Math.cos(a) * fx + Math.sin(a) * fz);
        const zone = g.world.zoneAt(p.dim, lvl, x, z);
        if (!zone || zone.key === mine.key || zone.type === 'lv_void') continue;
        if (dot < bd) { bd = dot; best = zone; }
      }
      if (best && bd < 0.2) g.world.mutate(best);
    }
    if (s.ev > 2.9) {
      s.ev = -1;
      s.next = 30 + Math.random() * 50;
      g.flicker.event = 1;
      g.audioCall('play', 'flick_on');
    }
  },
});
