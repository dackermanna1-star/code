// Level 39: Concrete Forest. A forest in which every tree is poured concrete: fluted trunks,
// slab canopies, rebar sprouting from broken limbs. Dim grey light and a few sodium lamps. Now
// and then the light goes out all at once; when it comes back the trees are not where they were.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as GL, propWithXf as withXf } from '../props.js';
import { xfRotZ } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, fbm, owns, hr, levelDoor, poleLamp, env, M } from './kit.js';
import { TAU, clamp, lerp, sstep, matRamp, terrainGrid, shadeIdx, padded, scatter, cells, doorSite, noEvents, px } from './g03_common.js';

const N = 39;
const G = 64;
const EX = 32.5, EZ = 48.5;

// ------------------------------------------------------------------ textures
defineTexture('lv39_conc', (p, r) => {
  p.fill([118, 118, 112]);
  p.noise(3, 0.1, 3);
  p.noise(12, 0.08, 2);
  // formwork: boards and tie holes
  p.rect(0, 0, 64, 1, [86, 86, 82]); p.rect(0, 32, 64, 1, [86, 86, 82]);
  p.rect(0, 0, 1, 64, [92, 92, 88], 0.8); p.rect(32, 0, 1, 64, [92, 92, 88], 0.8);
  for (const [x, y] of [[16, 16], [48, 16], [16, 48], [48, 48]]) { p.disc(x, y, 1.6, [60, 60, 58]); p.set(x + 1, y + 1, [140, 140, 134]); }
  for (let i = 0; i < 9; i++) p.drip(r.int(0, 63), r.int(0, 20), r.int(14, 44), [74, 76, 70], r.range(0.2, 0.4), r.int(1, 3));
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(36, 63), r.int(5, 9), [92, 108, 84], 0.35);
  p.speckle(80, [150, 150, 144], 0.3, 0.6);
  p.speckle(50, [60, 60, 58], 0.3, 0.6);
}, 12);
defineTexture('lv39_conc_dark', (p, r) => {
  p.fill([78, 78, 76]);
  p.noise(3, 0.14, 3);
  for (let i = 0; i < 8; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(6, 11), [52, 54, 50], 0.5);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [56, 56, 54], 0.8);
  p.speckle(60, [112, 112, 108], 0.25, 0.5);
}, 8);
defineTexture('lv39_gravel', (p, r) => {
  p.fill([112, 108, 100]);
  p.noise(4, 0.14, 3);
  p.noise(16, 0.1, 2);
  for (let i = 0; i < 160; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), c = r.pick([[148, 144, 134], [76, 74, 70], [128, 120, 108], [96, 100, 94]]);
    p.rect(x, y, r.int(1, 3), r.int(1, 2), c, 0.9);
  }
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(6, 10), [88, 100, 78], 0.35);
}, 14);
defineTexture('lv39_pool', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
    if (d < 1) { p.set(x, y, [150, 170, 190]); p.alpha(x, y, Math.max(0, 1 - d * d) * 480 - 80); }
  }
}, 4);
defineTexture('lv39_band', (p, r) => {
  p.clearAlpha(0);
  const col = [40, 42, 46];
  // far trees: trunks with flat slab crowns, in a ragged row
  for (const [x, h, w, c] of [[4, 34, 2, 7], [14, 44, 2, 9], [27, 28, 3, 7], [38, 50, 2, 10], [49, 36, 2, 8], [58, 42, 3, 9]]) {
    for (let y = 0; y < h; y++) for (let q = 0; q < w; q++) px(p, x + q, 63 - y, col);
    for (let q = -c; q <= c + w; q++) { px(p, x + q, 63 - h, col); px(p, x + q, 63 - h - 1, col); px(p, x + q, 63 - h - 2, col); }
  }
  for (let x = 0; x < 64; x++) { const hh = 4 + Math.round(pnoise(x, 0, 16, 3) * 6); for (let y = 0; y < hh; y++) px(p, x, 63 - y, col); }
  void r;
}, 4);

const GR = matRamp('lv39_gravel', 'lv39_gravel', { s: 2, surf: 'concrete' }, [0.95, 0.94, 0.92]);
defineMaterial('lv39_conc', 'lv39_conc', { s: 2.4, surf: 'concrete' });
defineMaterial('lv39_conc_dark', 'lv39_conc_dark', { s: 2.4, surf: 'concrete' });

// ------------------------------------------------------------------ terrain
const baseH = (x, z) => 1.7 + (fbm(x, z, 60, 4, 3) - 0.5) * 1.6 + (noise(x, z, 11, 9) - 0.5) * 0.2;
const ENTRY_PAD = { x: EX, z: EZ, r0: 3.4, r1: 8 };
ENTRY_PAD.h = baseH(EX, EZ);

// ------------------------------------------------------------------ props
// four kinds of tree: a trunk carrying plates, a plain umbrella, a broken stump with rebar, a fork
defineProp('lv39_tree', {
  build(mb, p, r) {
    const conc = S('lv39_conc'), dark = S('lv39_conc_dark'), rust = S('rust');
    const kind = p.opts.kind ?? 0, H = (p.opts.h ?? 11) * r.range(0.9, 1.12);
    const R = r.range(0.55, 0.8);
    // flared foot, trunk, narrower upper trunk
    mb.cyl(0, -0.6, 0, R * 1.5, 1.3, 8, conc, 0);
    mb.cyl(0, 0.6, 0, R, H * 0.5, 8, conc, 0);
    mb.cyl(0, 0.6 + H * 0.5, 0, R * 0.8, H * 0.5, 8, conc, kind === 2 ? 3 : 0);
    const slab = (cx, y, cz, w, d, t) => mb.box(cx - w, y, cz - d, cx + w, y + t, cz + d, [conc, conc, conc, dark, conc, conc]);
    if (kind === 0) {
      slab(r.range(-1, 1), H + 0.4, r.range(-1, 1), r.range(2.8, 4), r.range(2.4, 3.6), 0.5);
      slab(r.range(-2, 2), H + 1.6, r.range(-2, 2), r.range(1.4, 2.4), r.range(1.4, 2.2), 0.45);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + r.range(0, 1), len = r.range(2, 3.4);
        mb.rod(0, H * 0.62, 0, Math.cos(a) * len, H * 0.62 + len * 0.5, Math.sin(a) * len, 0.17, 4, conc, true);
        slab(Math.cos(a) * len, H * 0.62 + len * 0.5, Math.sin(a) * len, 1.2, 1.1, 0.36);
      }
    } else if (kind === 1) {
      mb.cyl(0, H, 0, 0.75 * R + 0.3, 0.8, 8, conc, 0);
      mb.cyl(0, H + 0.4, 0, r.range(4, 5.6), 0.6, 8, conc, 1, conc);
      mb.cyl(0, H + 0.28, 0, r.range(4, 5.6), 0.14, 8, dark, 2);
    } else if (kind === 2) {
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + r.range(0, 0.5), t = r.range(0.2, 0.7), y = 0.6 + H;
        mb.rod(Math.cos(a) * R * 0.5, y, Math.sin(a) * R * 0.5, Math.cos(a) * R * (0.5 + t), y + r.range(1.2, 2.6), Math.sin(a) * R * (0.5 + t), 0.025, 3, rust, false);
      }
    } else {
      for (const s of [-1, 1]) {
        mb.rod(0, H * 0.55, 0, s * 2.6, H * 0.9, r.range(-1, 1), 0.34, 5, conc, true);
        slab(s * 2.6, H * 0.9, 0, r.range(1.4, 2.2), r.range(1.2, 1.9), 0.4);
      }
    }
  },
  boxes: (p) => [[-0.7, 0, -0.7, 0.7, 4, 0.7]],
});
defineTexture('lv39_halo', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
    if (d < 1) { p.set(x, y, [255, 170, 90]); p.alpha(x, y, Math.max(0, 1 - d) * 520 - 100); }
  }
}, 4);
defineTexture('lv39_lampface', (p) => { p.fill([255, 190, 110]); p.disc(32, 32, 24, [255, 236, 190], 0.7, 8); }, 6);
// a sodium lamp: concrete post, a hood, a glowing face and a halo around it
defineProp('lv39_lamp', {
  build(mb, p) {
    const ch = p.opts.ch || 0, H = p.opts.h ?? 5.4, dir = p.opts.arm ?? 0.8;
    const conc = S('lv39_conc'), dark = S('metal_dark');
    mb.cyl(0, -0.2, 0, 0.16, H + 0.2, 6, conc, 0);
    mb.box(-0.05, H - 0.1, -0.05, dir, H, 0.05, dark);
    const lx = dir - 0.1;
    mb.box(lx - 0.4, H - 0.12, -0.2, lx + 0.4, H - 0.02, 0.2, dark);
    mb.box(lx - 0.34, H - 0.2, -0.16, lx + 0.34, H - 0.12, 0.16, GL('lv39_lampface', 1.3, ch));
    const h = GL('lv39_halo', 0.85, ch), w = 2.2, y = H - 0.25;
    mb.card([lx - w / 2, y - w / 2, 0, lx + w / 2, y - w / 2, 0, lx + w / 2, y + w / 2, 0, lx - w / 2, y + w / 2, 0], [0, 0, 1], h, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.card([lx, y - w / 2, -w / 2, lx, y - w / 2, w / 2, lx, y + w / 2, w / 2, lx, y + w / 2, -w / 2], [1, 0, 0], h, [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  boxes: [[-0.2, 0, -0.2, 0.2, 3, 0.2]],
});
// broken beams and blocks on the ground
defineProp('lv39_rubble', {
  build(mb, p, r) {
    const conc = S('lv39_conc'), dark = S('lv39_conc_dark');
    for (let k = 0; k < 4; k++) {
      const x = r.range(-1, 1), z = r.range(-1, 1), w = r.range(0.2, 0.7), h = r.range(0.15, 0.5), d = r.range(0.2, 0.6);
      mb.box(x - w, -0.1, z - d, x + w, h, z + d, k % 2 ? conc : dark);
    }
    mb.rod(-1.2, 0.25, 0.7, 1.6, 0.3, 0.9, 0.04, 3, S('rust'), false);
  },
});
// a fallen limb
defineProp('lv39_beam', {
  build(mb, p, r) {
    const L = p.opts.len ?? 4;
    mb.box(-L / 2, 0, -0.35, L / 2, 0.55, 0.35, [S('lv39_conc'), S('lv39_conc'), S('lv39_conc'), S('lv39_conc_dark'), S('lv39_conc'), S('lv39_conc')]);
    mb.rod(L / 2, 0.3, 0, L / 2 + 0.7, 0.35, 0.2, 0.03, 3, S('rust'), false);
    void r;
  },
  boxes: (p) => [[-(p.opts.len ?? 4) / 2, 0, -0.35, (p.opts.len ?? 4) / 2, 0.55, 0.35]],
});

// ------------------------------------------------------------------ zone
function lampAt(zb, x, z, y, ch, arm, h = 5.4) {
  if (!owns(zb, x, z)) return;
  zb.prop('lv39_lamp', x, y - 0.05, z, 0, { ch, arm, h });
  zb.light(x + arm - 0.1, y + h - 0.5, z, { color: [1.0, 0.6, 0.26], rad: 12, int: 1.0, ch });
  zb.emitter(x, y + h, z, 'lv39_lamp', { vol: 0.5, rad: 14 });
}

function gen(zb) {
  zb.noConnectivity = true;
  const pl0 = [ENTRY_PAD];
  let door = doorSite(zb, 0.86, 71);
  if (door && Math.hypot(door.x - EX, door.z - EZ) < 18) door = null;
  if (door) pl0.push({ x: door.x, z: door.z, r0: 2.6, r1: 6.5 });
  const hf = padded(baseH, pl0);
  terrainGrid(zb, hf, (x, z, h, shade) => GR[shadeIdx(clamp(shade + (noise(x, z, 6, 3) - 0.5) * 0.35, 0, 0.999))], [0.6, 0.6], 1.4);

  const clear = (x, z, m = 2.4) => {
    if (Math.hypot(x - EX, z - EZ) < 7) return false;
    if (door && Math.hypot(x - door.x, z - door.z) < m + 1.5) return false;
    // keep a long clear aisle in front of the door at the start: the first view
    if (Math.abs(x - EX) < 2.6 && z < EZ + 1 && z > EZ - 62) return false;
    return true;
  };
  // trees stand in loose columns: a wide jittered grid with the x spread kept narrow, so
  // aisles run through the forest
  cells(zb, 8.5, (i, j) => {
    const u = hr(i, j, 11), v = hr(i, j, 19);
    if (u > 0.82) return;
    const x = (i + 0.5 + (hr(i, j, 12) - 0.5) * 0.5) * 8.5, z = (j + 0.5 + (hr(i, j, 13) - 0.5) * 0.9) * 8.5;
    if (!owns(zb, x, z) || !clear(x, z)) return;
    const kind = v < 0.46 ? 0 : v < 0.68 ? 1 : v < 0.82 ? 2 : 3;
    zb.prop('lv39_tree', x, hf(x, z) - 0.05, z, v * 40, { kind, h: 9 + hr(i, j, 14) * 7 });
    // some of them drip
    if (hr(i, j, 15) < 0.15) zb.emitter(x + 0.8, hf(x, z) + 1.5, z, 'drip', { vol: 0.5, rad: 9 });
    // light pools on the ground under the canopy gaps
    if (hr(i, j, 16) < 0.3) zb.decal(x + 3.2 * (hr(i, j, 17) - 0.5), hf(x, z) + 0.05, z + 3.4 * (hr(i, j, 18) - 0.5), 'up', 4.5, 4.5, 'lv39_pool', { lit: false, glow: 0.18 });
  });
  scatter(zb, 6, 21, (x, z, i, j, u, v) => {
    if (u > 0.34 || !clear(x, z, 1.4)) return;
    if (v < 0.6) zb.prop('lv39_rubble', x, hf(x, z), z, v * 40, {});
    else zb.prop('lv39_beam', x, hf(x, z) - 0.1, z, v * 6.28, { len: 3 + u * 6 });
  });
  // sodium lamps on poles, now and then; the door always has one
  scatter(zb, 40, 31, (x, z, i, j, u, v) => {
    if (u > 0.7 || !clear(x, z, 2)) return;
    lampAt(zb, x, z, hf(x, z), hr(i, j, 33) < 0.25 ? 2 : 0, 0.8);
  });
  // the lamp ahead of the first view, far down the aisle
  for (const lz of [EZ - 30, EZ - 60]) if (owns(zb, EX + 1.5, lz)) {
    lampAt(zb, EX + 1.5, lz, hf(EX + 1.5, lz), 0, -0.8);
  }
  if (door) {
    const y = hf(door.x, door.z);
    levelDoor(zb, door.x, door.z, door.rot, { y });
    lampAt(zb, door.x + 1.7, door.z + 0.6, y, 0, -0.8, 4.4);
  }
}

defineZone('lv39_forest', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.7, 0.72, 0.78],
    env: env({ fog: [0.15, 0.16, 0.18], fogNear: 4, fogFar: 42, hum: 0, hvac: 0, reverb: 'hall', tone: 'lv39_concrete' }),
  }),
  gen,
});

const GRADE = { sat: 0.9, tint: [1, 1, 1.03] };
defineLevel(N, {
  name: 'CONCRETE FOREST',
  zoneType: 'lv39_forest',
  zoneSize: G,
  entry: { x: EX, y: ENTRY_PAD.h, z: EZ, yaw: 0 },
  doorDensity: 0,
  viewRadius: 3,
  grade: GRADE,
  sky: {
    top: [0.08, 0.09, 0.115], horizon: [0.15, 0.16, 0.18], ground: [0.09, 0.1, 0.11], curve: 0.5,
    band: { layer: 'lv39_band', color: [0.22, 0.24, 0.27], repeat: 4, top: 0.6, bottom: -0.03, fog: 0.5 },
  },
  weather: { kind: 'ash', amount: 0.3, color: [0.62, 0.62, 0.6, 0.5], fall: 0.35, wind: [0.05, 0.02], size: 0.02 },
  light: { phoneRadius: 4.2, phoneIntensity: 0.26 },
  // the lights fail all together: stutter, black, and when they come back the forest has moved
  script(ctx, dt) {
    noEvents(ctx);
    const g = ctx.game, p = ctx.player, s = ctx.state;
    if (s.phase === undefined) { s.phase = 'idle'; s.t = 28 + Math.random() * 30; s.f = 1; }
    s.t -= dt;
    const T = GRADE.tint;
    if (s.phase === 'idle') {
      s.f = 1;
      if (s.t <= 0) { s.phase = 'stutter'; s.t = 0.9; s.moved = false; g.audioCall('play', 'lv39_off', undefined, undefined, undefined, { vol: 1 }); }
      return;
    }
    if (s.phase === 'stutter') {
      s.f = Math.floor(s.t * 14) % 2 ? 0.08 : (s.t < 0.35 ? 0.35 : 0.9);
      if (s.t <= 0) { s.phase = 'dark'; s.t = 2.2 + Math.random() * 2.2; s.f = 0.015; }
    } else if (s.phase === 'dark') {
      s.f = 0.015;
      if (!s.moved && s.t < 1.4) {
        s.moved = true;
        // everything is somewhere else: step out of the old arrangement without being seen to
        const a = Math.random() * TAU, d = 7 + Math.random() * 5;
        g.spawnAt(p.dim, p.x + Math.sin(a) * d, p.y, p.z - Math.cos(a) * d, p.yaw);
      }
      if (s.t <= 0) { s.phase = 'back'; s.t = 0.8; g.audioCall('play', 'lv39_on', undefined, undefined, undefined, { vol: 1 }); }
    } else {
      // coming back: three false starts and then steady
      const u = 1 - s.t / 0.8;
      s.f = u < 0.2 ? 0.015 + 0.5 * (Math.floor(u * 40) % 2) : u < 0.5 ? 0.12 : lerp(0.3, 1, sstep(0.5, 1, u));
      if (s.t <= 0) { s.phase = 'idle'; s.t = 45 + Math.random() * 80; s.f = 1; }
    }
    const e = g.env && g.env.grade;
    if (e) { for (let i = 0; i < 3; i++) e.tint[i] = T[i] * s.f; }
  },
});
void T; void withXf; void xfRotZ; void VF; void lerp;
