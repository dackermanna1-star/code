// Level 29: The Parking Structure. An underground garage that never stops: a low concrete
// ceiling on a grid of columns, painted bays, one-way arrows, rows of fluorescent tubes that
// fade into the dark. Exit signs hang everywhere and point nowhere. The headlights of parked
// cars come on as you pass (and some were never off).
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M, ceilingLight } from './kit.js';
import { hookFlicker, smooth } from './g05_kit.js';
import { MZ, CX, bayCar, reactiveNear, REACT } from './g05_garage.js';

const N = 29;
const CEIL = 2.55;
const SOLID = (r, g, b) => [r, g, b];

// ------------------------------------------------------------------ textures
function slab(p, seed, bay) {
  p.fill([62, 66, 62]);
  p.noise(3, 0.12, 3);
  p.noise(8, 0.09, 2, seed + 3);
  p.grain(0.06);
  const r = p.rng;
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(4, 9), [28, 30, 30], 0.5);
  p.speckle(40, [96, 98, 90], 0.3, 0.6);
  p.rect(0, 0, 64, 1, [40, 42, 40], 0.8); p.rect(0, 0, 1, 64, [40, 42, 40], 0.8);    // saw cuts every 8 m
  if (bay) {
    for (const lx of [0, 21, 43]) p.rect(lx, 0, 1, 64, [206, 198, 140]);
  } else {
    for (let x = 0; x < 40; x++) { p.set(x, 63, [214, 184, 60]); p.set(x, 0, [214, 184, 60]); }
    // tyre-polished lanes
    for (const ly of [14, 49]) p.rect(0, ly, 64, 7, [88, 92, 86], 0.18);
  }
}
defineTexture('lv29_aisle_a', (p) => slab(p, 11, false), 10);
defineTexture('lv29_aisle_b', (p) => slab(p, 23, false), 10);
defineTexture('lv29_bay_a', (p) => slab(p, 31, true), 10);
defineTexture('lv29_bay_b', (p) => slab(p, 47, true), 10);
defineTexture('lv29_column', (p) => {
  p.fill([108, 110, 104]);
  p.noise(4, 0.09, 3);
  p.grain(0.04);
  p.stain(20, 20, 9, [70, 72, 66], 0.4);
  // painted guard at the foot: yellow and black chevrons, a white band above it
  p.map((x, y, c) => (y >= 43 ? ((((x + y) >> 3) & 1) ? [200, 170, 36] : [34, 32, 28]) : null));
  p.rect(0, 40, 64, 2, [210, 206, 190]);
  p.rect(0, 38, 64, 1, [60, 62, 58], 0.7);
}, 10);
defineTexture('lv29_wall', (p) => {
  p.fill([142, 150, 138]);
  p.noise(5, 0.1, 3);
  p.grain(0.04);
  for (let i = 0; i < 6; i++) p.drip(p.rng.int(0, 63), 0, p.rng.int(10, 40), [92, 100, 90], 0.25, 1);
  p.rect(0, 46, 64, 18, [62, 78, 66]);
  p.rect(0, 45, 64, 1, [200, 200, 186], 0.8);
  p.noise(4, 0.08, 2, 5);
  p.speckle(30, [180, 184, 170], 0.3, 0.6);
}, 10);
defineTexture('lv29_ceil', (p) => {
  p.fill([96, 98, 92]);
  p.noise(5, 0.1, 3);
  p.grain(0.05);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [70, 72, 68], 0.7);
  p.stain(40, 30, 10, [60, 66, 60], 0.45);
  p.speckle(30, [128, 130, 120], 0.3, 0.6);
}, 10);
defineTexture('lv29_plate', (p) => {
  p.fill([226, 226, 214]);
  p.frame(0, 0, 64, 64, [40, 40, 36]);
  p.text('C', 8, 14, [30, 30, 28], 4);
  p.text('7', 34, 14, [30, 30, 28], 4);
}, 4);

defineMaterial('lv29_aisle_a', 'lv29_aisle_a', { su: 8, sv: 8, surf: 'concrete' });
defineMaterial('lv29_aisle_b', 'lv29_aisle_b', { su: 8, sv: 8, surf: 'concrete' });
defineMaterial('lv29_bay_a', 'lv29_bay_a', { su: 8, sv: 8, surf: 'concrete' });
defineMaterial('lv29_bay_b', 'lv29_bay_b', { su: 8, sv: 8, surf: 'concrete' });
defineMaterial('lv29_column', 'lv29_column', { su: 2.5, sv: 2.55, surf: 'concrete' });
defineMaterial('lv29_wall', 'lv29_wall', { su: 4, sv: 3.2, surf: 'concrete', stain: 0.1 });
defineMaterial('lv29_ceil', 'lv29_ceil', { s: 4, surf: 'concrete', stain: 0.06 });

// ------------------------------------------------------------------ layout
// cores (stairwell blocks) end the aisle: 8 m wide, a full module deep, every 32 m at most
const isCoreSlot = (si, j) => (si === 0 && j === 0) || hr(si, j, 2911) < 0.17;
const inCore = (x, z) => {
  const si = Math.floor(x / 32), rel = x - si * 32;
  return rel >= 8 && rel < 16 && isCoreSlot(si, Math.floor(z / MZ));
};
// the arrival door stands 0.75 m behind the cell centre the player is put on, so the wall there
// is a brush that ends 0.12 m behind it (cells would only give whole metres)
const ENTRY = { x: 17.5, z: 7.5, wall: 16.63 };

function gen(zb) {
  zb.noConnectivity = true;
  const { x0, z0, x1, z1 } = zb;
  zb.ceil.fill(CEIL);
  zb.floor.fill(0);
  zb.flags.fill(0);
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const zi = ((z % MZ) + MZ) % MZ;
    const aisle = zi >= 5 && zi < 11;
    const v = hr(Math.floor(x / 8), Math.floor(z / 8), 2912) < 0.5 ? 'a' : 'b';
    zb.fmat[i] = M[(aisle ? 'lv29_aisle_' : 'lv29_bay_') + v];
    zb.cmat[i] = M.lv29_ceil;
    zb.wmat[i] = M.lv29_wall;
    if (inCore(x, z)) zb.solid[i] = M.lv29_wall;
  });
  const jA = Math.floor(z0 / MZ), jB = Math.floor((z1 - 1) / MZ);
  const iA = Math.floor(x0 / CX), iB = Math.floor((x1 - 1) / CX);
  for (let j = jA; j <= jB; j++) {
    const zb0 = j * MZ;
    // columns on the three lines of the module
    for (let i = iA - 1; i <= iB + 1; i++) {
      const cx = i * CX;
      for (const dz of [0, 5, 11]) {
        const cz = zb0 + dz;
        if (cx < x0 - 1 || cx > x1 + 1 || cz < z0 - 1 || cz > z1 + 1) continue;
        if (inCore(cx - 1, cz) || inCore(cx, cz) || inCore(cx - 1, cz - 1) || inCore(cx, cz - 1)) continue;
        cbox(zb, cx - 0.35, 0, cz - 0.35, cx + 0.35, CEIL, cz + 0.35, M.lv29_column);
      }
      // beams: along x over the aisle edges, across the aisle between them
      for (const dz of [5, 11]) {
        if (!inCore(cx, zb0 + dz)) cbox(zb, cx, CEIL - 0.4, zb0 + dz - 0.35, cx + CX, CEIL, zb0 + dz + 0.35, M.lv29_ceil, { sub: 2 });
      }
      if (!inCore(cx, zb0 + 8)) cbox(zb, cx - 0.25, CEIL - 0.34, zb0 + 5.35, cx + 0.25, CEIL, zb0 + 10.65, M.lv29_ceil, { sub: 2 });
    }
    // tubes: bars across the aisle under every cross beam (so the row reads from far away), a
    // flush tube between them, and one over each row of bays
    for (let i = iA; i <= iB; i++) {
      const cx = i * CX;
      for (const [lx, lz, rot, len, hung] of [[cx, zb0 + 8, 0, 2.6, true], [cx + 4, zb0 + 8, 0, 1.2, false], [cx + 4, zb0 + 2.5, 1, 1.2, false], [cx + 4, zb0 + 13.5, 1, 1.2, false]]) {
        if (!zb.in(Math.floor(lx), Math.floor(lz)) || inCore(lx, lz)) continue;
        const u = hr(Math.floor(lx * 2), Math.floor(lz * 2), 2920);
        const dark = hr(Math.floor(lx / 24), Math.floor(lz / 32), 2925) < 0.1;
        const state = dark ? 'off' : u < 0.05 ? 'off' : u < 0.1 ? 'dying' : u < 0.19 ? 'flicker' : 'on';
        const hue = hr(Math.floor(lx / 40), Math.floor(lz / 48), 2926);
        const color = hue < 0.62 ? [0.8, 0.95, 0.86] : hue < 0.85 ? [1.0, 0.88, 0.66] : [0.72, 0.84, 1.0];
        if (hung) {
          const ch = state === 'dying' ? 5 + (i & 3) : state === 'flicker' ? 1 + (i & 3) : 0;
          zb.fixture(lx, lz, 'tube', state !== 'off', { ch, rot, l: len, y: CEIL - 0.3 });
          if (state !== 'off') zb.light(lx, CEIL - 0.85, lz, { color, rad: 7.2, int: 0.9, ch });
        } else ceilingLight(zb, lx, lz, 'tube', state, { rot, l: len, color, rad: 6.8, int: 0.8 });
      }
    }
    // painted arrows down the aisle (one way, alternating by module)
    for (let i = iA; i <= iB; i++) {
      const ax = i * CX + 4, az = zb0 + 8;
      if (!zb.in(Math.floor(ax), Math.floor(az)) || inCore(ax, az)) continue;
      if (hr(i, j, 2930) < 0.5) zb.decal(ax, 0, az - 0.9, 'up', 2.4, 2.4, 'g05_arrow', { rot: (j & 1) ? Math.PI : 0 });
    }
    // hanging exit signs below the cross beams: they point wherever
    for (let i = iA; i <= iB; i++) {
      const sx = i * CX, sz = zb0 + 8;
      if (hr(i, j, 2940) > 0.3 || !owns(zb, sx, sz) || inCore(sx, sz)) continue;
      const dirs = ['l', 'r', 'u', 'd'];
      zb.prop('g05_exit', sx, CEIL - 0.34, sz, Math.PI / 2, { dir: dirs[Math.floor(hr(i, j, 2941) * 4)], dir2: dirs[Math.floor(hr(i, j, 2942) * 4)] });
      zb.box(sx - 0.02, CEIL - 0.34, sz - 0.02, sx + 0.02, CEIL - 0.3, sz + 0.02, M.metal_dark, { collide: false });
    }
    // cars
    for (let row = 0; row < 2; row++) for (let i = iA - 1; i <= iB; i++) for (let k = 0; k < 3; k++) {
      const c = bayCar(i, k, j, row);
      if (!c || !owns(zb, c.x, c.z) || inCore(c.x, c.z)) continue;
      zb.prop('g05_car', c.x, 0, c.z, c.rot, { kind: c.kind, tint: c.tint, hl: c.hl ? 1 : 0, ch: c.ch, tail: c.hl ? 1 : 0, tch: c.ch });
    }
  }
  // the cores: doors, signs, an extinguisher
  for (let si = Math.floor(x0 / 32) - 1; si <= Math.floor(x1 / 32); si++) for (let j = jA; j <= jB; j++) {
    if (!isCoreSlot(si, j)) continue;
    const ex = si * 32 + 16, wx = si * 32 + 8, dz = j * MZ + 7.5;
    const entryCore = si === 0 && j === 0;
    const fx = entryCore ? ENTRY.wall : ex;
    if (entryCore) cbox(zb, ex, 0, j * MZ, ENTRY.wall, CEIL, j * MZ + MZ, M.lv29_wall);
    if (owns(zb, ex, dz)) {
      zb.decal(fx, 1.85, dz + 1.3, 'px', 0.8, 0.8, 'sign_stairs');
      zb.prop('extinguisher', fx + 0.02, 0, dz - 1.7, Math.PI / 2, {});
      zb.prop('g05_exit', fx + 0.06, 2.35, dz, Math.PI / 2, { dir: 'u', dir2: 'd' });
      if (!entryCore) levelDoor(zb, ex + 0.13, dz, Math.PI / 2, {});
    }
    if (owns(zb, wx - 1, dz)) {
      zb.prop('door', wx - 0.03, 0, dz + 0.0, -Math.PI / 2, { tex: 'door_metal' });
      zb.decal(wx, 1.85, dz + 1.3, 'nx', 0.8, 0.8, 'sign_stairs');
      zb.prop('g05_exit', wx - 0.06, 2.35, dz, -Math.PI / 2, { dir: 'd', dir2: 'u' });
    }
  }
  // the car in the aisle at the arrival, lamps burning
  if (owns(zb, 41.5, 8)) zb.prop('g05_car', 41.5, 0, 8, -Math.PI / 2, { kind: 'sedan', tint: [0.7, 0.72, 0.76], hl: 1, tail: 1 });
  // a low vent drone, hum from the tubes
  const mx = Math.floor((x0 + x1) / 2) + 0.5, mz = Math.floor((z0 + z1) / 2) + 0.5;
  zb.emitter(mx, 2.2, mz, 'g05_vent', { vol: 0.5, rad: 40 });
  if (hr(x0, z0, 2950) < 0.6) zb.emitter(mx + 9, 2.2, mz + 5, 'hum_strip', { vol: 0.35, rad: 12 });
}

defineZone('lv29_garage', {
  ...LEVEL_ZONE,
  doors: true,
  params: () => ({
    ambient: [0.09, 0.1, 0.09],
    ceilH: CEIL,
    env: env({ fog: [0.045, 0.062, 0.056], fogNear: 3, fogFar: 48, hum: 0.25, hvac: 0.5, reverb: 'warehouse', tone: 'g05_garage' }),
  }),
  gen,
});

// ------------------------------------------------------------------ the headlights
// A car's lamps come on when you pass within ~10 m, stutter, and stay lit until you are far.
function react(ctx, dt) {
  const s = ctx.state, p = ctx.player;
  if (!s.ch) s.ch = {};
  const near = {};
  reactiveNear(p.x, p.z, 12, (c) => {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (!near[c.ch] || d < near[c.ch].d) near[c.ch] = { d, c };
  });
  for (const ch of REACT) {
    const st = s.ch[ch] || (s.ch[ch] = { on: 0, t: 0, away: 0 });
    const hit = near[ch];
    if (hit && hit.d < 9.5 && !st.on) {
      st.on = 1; st.t = 0; st.away = 0;
      ctx.game.audioCall('play', 'g05_relay', hit.c.x, 0.7, hit.c.z, { vol: 0.8 });
    }
    if (st.on) {
      st.t += dt;
      if (!hit) { st.away += dt; if (st.away > 25) { st.on = 0; } } else st.away = 0;
    }
  }
}

function applyChannels(ctx) {
  const s = ctx.state;
  hookFlicker(ctx.game, N, (v, t) => {
    for (const ch of REACT) {
      const st = s.ch && s.ch[ch];
      if (!st || !st.on) { v[ch] = 0; continue; }
      const a = st.t;
      // a stutter as the lamps catch, then steady
      v[ch] = a < 0.45 ? (Math.sin(a * 83) + Math.sin(a * 37) > 0.2 ? 1 : 0.05) : 1;
    }
  });
}

defineLevel(N, {
  name: 'THE PARKING STRUCTURE',
  zoneType: 'lv29_garage',
  zoneSize: 64,
  bands: [0],
  entry: { x: ENTRY.x, y: 0, z: ENTRY.z, yaw: Math.PI / 2, pitch: 0 },
  doorDensity: 0.55,
  viewRadius: 3,
  sky: null,
  light: { phoneRadius: 4.2, phoneIntensity: 0.26 },
  script(ctx, dt) {
    const s = ctx.state;
    applyChannels(ctx);
    react(ctx, dt);
    // far-off sounds of the concrete
    s.t = (s.t ?? 25) - dt;
    if (s.t <= 0) {
      s.t = 30 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 25, p = ctx.player;
      ctx.game.audioCall('play', Math.random() < 0.5 ? 'g05_creak' : 'g05_far_clunk', p.x + Math.sin(a) * d, 1, p.z - Math.cos(a) * d, { distant: true, vol: 0.9 });
    }
  },
});
void smooth; void SOLID;
