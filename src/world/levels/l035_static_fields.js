// Level 35: Static Fields. A flat, endless grassland under a cold sky, mown in long scan lines,
// with radio masts, antenna rows and concrete huts standing in it and pads of pure TV static
// lying in the grass. Out here everything is on some frequency: hold up the phone and turn,
// and the landscape you see changes with the dial (red, green phosphor, white-out).
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { RNG } from '../../core/rng.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfRotX } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, fbm, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { TAU, clamp, lerp, sstep, matRamp, terrainGrid, shadeIdx, padded, scatter, doorSite, noEvents, px, pr } from './g03_common.js';

const N = 35;
const G = 64;
const EX = 32.5, EZ = 44.5;

// ------------------------------------------------------------------ textures
defineTexture('lv35_grass', (p, r) => {
  p.fill([120, 128, 100]);
  p.noise(4, 0.1, 3);
  p.noise(16, 0.07, 2);
  for (let i = 0; i < 130; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), h = r.int(2, 4), c = r.chance(0.5) ? [92, 102, 78] : [152, 160, 128];
    for (let k = 0; k < h; k++) p.set(x, y - k, c, 0.85);
  }
  // a little static in everything
  p.speckle(110, [224, 228, 232], 0.25, 0.6);
  p.speckle(70, [30, 34, 40], 0.3, 0.6);
}, 14);
for (let f = 0; f < 4; f++) {
  defineTexture('lv35_static' + f, (p) => {
    const rng = new RNG(35000 + f * 131);
    p.map((x, y) => {
      const v = rng.next() * 215 + 25, tw = rng.next() < 0.04 ? 60 : 0;
      return [v, v + tw * 0.2, v * 1.04 + tw];
    });
    p.map((x, y, c) => (y % 2 ? [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72] : c));
    // a rolling bar
    p.rect(0, (f * 17 + 9) % 64, 64, 5, [255, 255, 255], 0.16);
  }, 8);
}
defineTexture('lv35_paint', (p) => {
  p.fill([236, 236, 230]);
  for (let y = 0; y < 64; y += 32) p.rect(0, y, 64, 16, [214, 52, 38]);
  p.noise(4, 0.08, 2);
}, 6);
defineTexture('lv35_beacon', (p) => { p.fill([255, 40, 30]); p.disc(32, 32, 22, [255, 170, 150], 0.7, 8); }, 4);
defineTexture('lv35_concrete', (p, r) => {
  p.fill([156, 158, 156]);
  p.noise(3, 0.12, 3);
  for (let y = 16; y < 64; y += 16) p.rect(0, y, 64, 1, [118, 120, 120], 0.8);
  for (let i = 0; i < 6; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(5, 10), [124, 130, 112], 0.4);
  p.speckle(60, [200, 200, 198], 0.3, 0.6);
}, 10);
defineTexture('lv35_dishface', (p) => {
  p.fill([226, 228, 230]);
  for (let k = 1; k < 5; k++) p.ring(32, 32, k * 7, 1, [188, 192, 198], 0.9);
  p.disc(32, 32, 3, [150, 154, 160]);
}, 6);
defineTexture('lv35_cloud', (p) => {
  p.map((x, y) => {
    const n = pnoise(x, y * 2, 4, 3) * 0.6 + pnoise(x, y * 2, 8, 8) * 0.3 + pnoise(x, y, 16, 5) * 0.1;
    const d = clamp((n - 0.5) * 2.6, 0, 1);
    return [d * 255, (0.65 + 0.35 * pnoise(x, y, 8, 11)) * 255, 0];
  });
}, 0);
// four horizons, one per frequency (lighter near the ground, darker higher up)
function bandTex(kind) {
  return (p, r) => {
    p.clearAlpha(0);
    const cl = (y) => { const t = clamp((63 - y) / 63, 0, 1); return [lerp(132, 66, t), lerp(144, 80, t), lerp(166, 108, t)]; };
    const dot = (x, y) => px(p, x, y, cl(y));
    if (kind === 0) {
      // low hills, and masts: thin lattices much too tall
      for (let x = 0; x < 64; x++) { const h = 3 + Math.round(pnoise(x, 0, 8, 5) * 6); for (let y = 0; y < h; y++) dot(x, 63 - y); }
      for (const [x, h, w] of [[6, 64, 2], [22, 48, 1], [37, 64, 2], [50, 40, 1], [58, 58, 1]]) {
        for (let y = 0; y < h; y++) {
          dot(x, 63 - y);
          if (w > 1) dot(x + 1, 63 - y);
          if (y % 6 === 3) { dot(x - 1, 63 - y); dot(x + w, 63 - y); }
          if (y % 12 === 0 && y > 2) { dot(x - 2, 63 - y); dot(x + w + 1, 63 - y); }
        }
        px(p, x, 63 - h, [255, 70, 50]);
      }
    } else if (kind === 1) {
      // a forest of masts, packed
      for (let k = 0; k < 20; k++) {
        const x = Math.floor(k * 3.3 + r.range(0, 2)), h = r.int(22, 64);
        for (let y = 0; y < h; y++) dot(x, 63 - y);
        if (k % 3 === 0) for (let y = 6; y < h; y += 6) { dot(x - 1, 63 - y); dot(x + 1, 63 - y); }
        if (k % 2 === 0) px(p, x, 63 - h, [255, 90, 70]);
      }
    } else if (kind === 2) {
      // a wall of dishes: huge discs on thin stems
      for (const [x, y, rr] of [[8, 22, 7], [26, 32, 9], [46, 18, 6], [58, 38, 7]]) {
        for (let q = 0; q < 63 - y; q++) dot(x, 63 - q);
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (dx * dx + dy * dy <= rr * rr && dy < 2) dot(x + dx, y + dy);
      }
    } else {
      // a grid: a giant antenna array filling the horizon
      for (let x = 0; x < 64; x += 8) for (let y = 0; y < 54; y++) dot(x, 63 - y);
      for (let y = 6; y < 54; y += 9) for (let x = 0; x < 64; x++) dot(x, 63 - y);
    }
  };
}
for (let k = 0; k < 4; k++) defineTexture('lv35_band' + k, bandTex(k), 5);

// the field, mown in scan lines
const GM = matRamp('lv35_grass', 'lv35_grass', { s: 2, surf: 'grass' }, [1.0, 1.02, 1.0]);
defineMaterial('lv35_static', 'lv35_static0', { s: 2, surf: 'gel', flags: VF.FULLBRIGHT | VF.ANIM, glow: 0.95 });
// (animated materials only get their first texture uploaded by the engine: three hidden slivers
// per zone make sure the other frames reach the GPU too)
for (let f = 1; f < 4; f++) defineMaterial('lv35_sf' + f, 'lv35_static' + f, { s: 2, surf: 'gel', flags: VF.FULLBRIGHT, glow: 0.95 });
defineMaterial('lv35_paint', 'lv35_paint', { s: 4, surf: 'metal' });
defineMaterial('lv35_beacon', 'lv35_beacon', { s: 1, flags: VF.FULLBRIGHT, glow: 1.3, chan: 14 });
defineMaterial('lv35_concrete', 'lv35_concrete', { s: 2.4, surf: 'concrete' });
defineMaterial('lv35_dish', 'lv35_dishface', { s: 6, surf: 'metal' });

// ------------------------------------------------------------------ terrain
const baseH = (x, z) => 1.3 + (fbm(x, z, 70, 3, 3) - 0.5) * 1.5 + (noise(x, z, 14, 8) - 0.5) * 0.22;
const ENTRY_PAD = { x: EX, z: EZ, r0: 3.4, r1: 8 };
ENTRY_PAD.h = baseH(EX, EZ);

// static pads: irregular blobs, one candidate per 36 m square
function pads(zb, door) {
  const out = [];
  const C = 36, i0 = Math.floor((zb.x0 - 9) / C), i1 = Math.floor((zb.x1 + 9) / C), j0 = Math.floor((zb.z0 - 9) / C), j1 = Math.floor((zb.z1 + 9) / C);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (hr(i, j, 5) > 0.5) continue;
      const x = (i + 0.2 + 0.6 * hr(i, j, 6)) * C, z = (j + 0.2 + 0.6 * hr(i, j, 7)) * C;
      if (Math.hypot(x - EX, z - EZ) < 16) continue;
      out.push({ x, z, r: 2.5 + hr(i, j, 8) * 4.5, i, j });
    }
  }
  if (door) out.push({ x: door.x, z: door.z, r: 2.6, door: true });
  return out;
}
const inPad = (pl, x, z) => {
  for (const q of pl) {
    const d = Math.hypot(x - q.x, z - q.z), w = q.door ? 0.12 : 0.55;
    if (d < q.r * (1 + (noise(x, z, 3.5, 21) - 0.5) * w)) return true;
  }
  return false;
};

// ------------------------------------------------------------------ props
// a lattice mast with red and white bands, guy wires and blinking beacons
defineProp('lv35_mast', {
  build(mb, p) {
    const H = p.opts.h ?? 40, W = 0.8 + H * 0.014, tw = W * 0.4;
    const paint = S('lv35_paint'), metal = S('metal_dark'), wire = S('metal_dark');
    const ang = [0.3, 0.3 + 2.094, 0.3 + 4.189];
    const at = (t, k) => { const w = lerp(W, tw, t); return [Math.cos(ang[k]) * w, t * H, Math.sin(ang[k]) * w]; };
    for (let k = 0; k < 3; k++) { const a = at(0, k), b = at(1, k); mb.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.07, 3, k === 0 ? paint : metal, false); }
    const n = Math.max(2, Math.floor(H / 4.5));
    for (let s = 0; s <= n; s++) {
      for (let k = 0; k < 3; k++) {
        const a = at(s / n, k), b = at(s / n, (k + 1) % 3);
        if (s > 0) mb.rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.035, 3, metal, false);
        if (s < n) { const c = at((s + 1) / n, (k + 1) % 3); mb.rod(a[0], a[1], a[2], c[0], c[1], c[2], 0.03, 3, metal, false); }
      }
    }
    // beacons
    const bc = S('lv35_beacon');
    for (const t of [1, 0.5]) { const y = t * H; mb.box(-0.16, y, -0.16, 0.16, y + 0.4, 0.16, bc); }
    mb.rod(0, H, 0, 0, H + 3, 0, 0.04, 3, metal, false);
    // guy wires
    if (H > 30) for (let k = 0; k < 3; k++) {
      const a = k * 2.094 + 1.0, y = H * 0.62, d = H * 0.5;
      const t = at(0.62, k);
      mb.rod(t[0], y, t[2], Math.cos(a) * d, 0, Math.sin(a) * d, 0.02, 3, wire, false);
    }
  },
  boxes: (p) => { const W = 0.8 + (p.opts.h ?? 40) * 0.014 + 0.15; return [[-W, 0, -W, W, 3, W]]; },
  emitter: { snd: 'lv35_carrier', y: 5, vol: 0.5, rad: 30 },
});
defineProp('lv35_hut', {
  build(mb, p) {
    const c = S('lv35_concrete'), dk = S('metal_dark');
    mb.box(-2.1, 0, -1.5, 2.1, 2.7, 1.5, c);
    mb.box(-2.3, 2.7, -1.7, 2.3, 2.9, 1.7, c);
    mb.box(-0.5, 0, -1.52, 0.5, 2.0, -1.46, dk, { skip: 63 & ~32 });
    mb.box(1.2, 1.3, -1.52, 1.9, 2.1, -1.46, dk, { skip: 63 & ~32 });
    mb.rod(1.4, 2.9, 0.4, 1.4, 6.5, 0.4, 0.04, 3, dk, false);
    mb.rod(-1.4, 2.9, 0.4, -1.4, 5.2, 0.4, 0.04, 3, dk, false);
    mb.box(-0.15, 1.5, -1.53, 0.15, 1.7, -1.5, S('lv35_beacon'));
  },
  boxes: [[-2.3, 0, -1.7, 2.3, 2.9, 1.7]],
  emitter: { snd: 'static', vol: 0.5, rad: 12, y: 1.5 },
});
defineProp('lv35_dish', {
  build(mb, p) {
    const metal = S('metal'), face = S('lv35_dish');
    mb.cyl(0, 0, 0, 0.35, 2.6, 6, S('lv35_concrete'), 3);
    mb.box(-0.2, 2.5, -0.2, 0.2, 3.0, 0.2, metal);
    withXf(mb, xfRotX(-0.95), () => {
      mb.cyl(0, 3.0, 0, 2.6, 0.18, 12, metal, 2, face);
      mb.cyl(0, 3.18, 0, 2.6, 0.08, 12, face, 1, face);
      mb.rod(0, 3.18, 0, 0, 5.6, 0, 0.05, 3, metal, false);
    });
  },
  boxes: [[-0.5, 0, -0.5, 0.5, 3, 0.5]],
});
// one element of an antenna row: a pole with crossbars
defineProp('lv35_yagi', {
  build(mb, p) {
    const m = S('metal'), d = S('metal_dark');
    const H = p.opts.h ?? 4.6;
    mb.box(-0.04, 0, -0.04, 0.04, H, 0.04, d, { skip: 8 });
    for (let k = 0; k < 4; k++) {
      const y = H - 0.3 - k * 0.7, w = 1.5 - k * 0.28;
      mb.box(-w, y, -0.025, w, y + 0.05, 0.025, m);
    }
    mb.box(-0.025, H - 2.2, -0.9, 0.025, H - 2.15, 0.9, m);
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 3, 0.1]],
});
defineProp('lv35_pillar', {
  build(mb, p) {
    // a concrete anchor block with a rusty ring
    mb.box(-0.6, 0, -0.6, 0.6, 0.5, 0.6, S('lv35_concrete'));
    mb.box(-0.1, 0.5, -0.1, 0.1, 0.8, 0.1, S('metal_dark'));
  },
  boxes: [[-0.6, 0, -0.6, 0.6, 0.5, 0.6]],
});

// ------------------------------------------------------------------ zone
function row(zb, hf, ax, az, bx, bz, step, fn) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / step), dx = (bx - ax) / len, dz = (bz - az) / len;
  for (let k = 0; k <= n; k++) {
    const x = ax + dx * k * step, z = az + dz * k * step;
    if (owns(zb, x, z)) fn(x, z, hf(x, z), k);
  }
}

function gen(zb) {
  zb.noConnectivity = true;
  const pl0 = [ENTRY_PAD];
  let door = doorSite(zb, 0.86, 71);
  if (door && Math.hypot(door.x - EX, door.z - EZ) < 20) door = null;
  if (door) pl0.push({ x: door.x, z: door.z, r0: 3.2, r1: 7 });
  const hf = padded(baseH, pl0);
  const pl = pads(zb, door);
  // one pad of static in the first view, a dozen metres in front of the door
  if (zb.in(Math.floor(EX - 3), Math.floor(EZ - 14))) pl.push({ x: EX - 3, z: EZ - 14, r: 3.6 });
  terrainGrid(zb, hf, (x, z, h, shade) => {
    if (inPad(pl, x + 0.5, z + 0.5)) return M.lv35_static;
    // scan lines: wide mown stripes whose direction changes from field to field
    const dir = hr(Math.floor(x / 96), Math.floor(z / 96), 3) < 0.5;
    const stripe = (Math.floor((dir ? x : z) / 4) & 1) ? 0.09 : -0.07;
    return GM[shadeIdx(clamp(shade * 0.7 + 0.3 + stripe + (noise(x, z, 8, 6) - 0.5) * 0.25, 0, 0.999))];
  }, [0.7, 0.4], 1.2);
  for (let f = 1; f < 4; f++) zb.box(zb.x0 + 30 + f, 0.2, zb.z0 + 30, zb.x0 + 30.2 + f, 0.26, zb.z0 + 30.2, M['lv35_sf' + f], { collide: false });
  const free = (x, z, m = 3) => !pl.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + m) && Math.hypot(x - EX, z - EZ) > 6;

  // masts: sparse, and a long avenue of them running away from the door
  scatter(zb, 52, 11, (x, z, i, j, u, v) => {
    if (u > 0.6 || !free(x, z, 3)) return;
    zb.prop('lv35_mast', x, hf(x, z) - 0.2, z, v * 6.28, { h: 28 + v * 40 });
  });
  for (let k = 0; k < 8; k++) {
    const x = EX + 7 + (k % 2) * 1.5, z = EZ - 26 - k * 30;
    if (owns(zb, x, z)) zb.prop('lv35_mast', x, hf(x, z) - 0.2, z, k, { h: 38 + k * 6 });
  }
  // a giant one, far enough to be a line in the sky
  if (owns(zb, EX - 30, EZ - 70)) zb.prop('lv35_mast', EX - 30, hf(EX - 30, EZ - 70) - 0.2, EZ - 70, 0.4, { h: 90 });
  // antenna rows
  for (let j = Math.floor(zb.z0 / 80); j <= Math.floor((zb.z1 - 1) / 80); j++) {
    for (let i = Math.floor(zb.x0 / 80); i <= Math.floor((zb.x1 - 1) / 80); i++) {
      if (hr(i, j, 21) > 0.5) continue;
      const alongX = hr(i, j, 22) < 0.5, a = (alongX ? j : i) * 80 + 12 + hr(i, j, 23) * 56, s0 = (alongX ? i : j) * 80 + 6 + hr(i, j, 24) * 16, n = 5 + Math.floor(hr(i, j, 25) * 8);
      const ax = alongX ? s0 : a, az = alongX ? a : s0, bx = alongX ? s0 + n * 5 : a, bz = alongX ? a : s0 + n * 5;
      row(zb, hf, ax, az, bx, bz, 5, (x, z, y) => { if (free(x, z, 1.5)) zb.prop('lv35_yagi', x, y - 0.1, z, alongX ? 0 : Math.PI / 2, {}); });
    }
  }
  // huts and dishes
  scatter(zb, 70, 31, (x, z, i, j, u, v) => {
    if (u > 0.4 || !free(x, z, 4)) return;
    if (v < 0.55) zb.prop('lv35_hut', x, hf(x, z) - 0.05, z, Math.floor(v * 40) * Math.PI / 2, {});
    else zb.prop('lv35_dish', x, hf(x, z) - 0.1, z, v * 6.28, {});
  });
  // anchor blocks scattered around
  scatter(zb, 14, 41, (x, z, i, j, u, v) => {
    if (u > 0.12 || !free(x, z, 2)) return;
    zb.prop('lv35_pillar', x, hf(x, z) - 0.1, z, v * 6.28, {});
  });
  // the pads hum
  for (const q of pl) if (!q.door && owns(zb, q.x, q.z)) zb.emitter(q.x, hf(q.x, q.z) + 0.4, q.z, 'static', { vol: 0.55, rad: 16 });
  if (door) {
    levelDoor(zb, door.x, door.z, door.rot, { y: hf(door.x, door.z) });
    zb.emitter(door.x, hf(door.x, door.z) + 0.5, door.z, 'static', { vol: 0.4, rad: 9 });
  }
}

defineZone('lv35_field', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [1.0, 1.02, 1.04],
    env: env({ fog: [0.7, 0.78, 0.86], fogNear: 20, fogFar: 74, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv35_static' }),
  }),
  gen,
});

// ------------------------------------------------------------------ frequencies
const FREQ = [
  { fog: [0.7, 0.78, 0.86], top: [0.4, 0.55, 0.82], tint: [1, 1, 1], sat: 1, weather: null, stars: 0 },
  { fog: [0.5, 0.13, 0.11], top: [0.3, 0.03, 0.05], tint: [1.25, 0.8, 0.78], sat: 0.85, weather: { kind: 'dust', amount: 0.7, color: [1, 0.5, 0.4, 0.7], fall: 0.2, wind: [1.5, 0.4], size: 0.025 }, stars: 0 },
  { fog: [0.03, 0.17, 0.09], top: [0.0, 0.05, 0.03], tint: [0.55, 1.3, 0.7], sat: 0.3, weather: null, stars: 0.9 },
  { fog: [0.93, 0.93, 0.96], top: [0.78, 0.8, 0.9], tint: [1.02, 1.02, 1.1], sat: 0.0, weather: { kind: 'snow', amount: 1, color: [1, 1, 1, 0.95], fall: 2.5, wind: [0, 0], size: 0.03 }, stars: 0 },
];
const SKY = FREQ.map((f, k) => ({
  top: f.top, horizon: f.fog, ground: f.fog, curve: 0.55, stars: f.stars,
  clouds: { layer: 'lv35_cloud', color: k === 2 ? [0.05, 0.3, 0.15] : k === 1 ? [0.55, 0.15, 0.12] : [0.95, 0.96, 1.0], amount: 0.5, speed: 0.006, scale: 0.4 },
  band: { layer: 'lv35_band' + k, color: k === 0 ? [1, 1, 1] : f.fog.map((c) => c * 0.9 + 0.1), repeat: 4, top: k === 0 ? 1.1 : 0.9, bottom: -0.04, fog: k === 0 ? 0.25 : 0.2 },
  sun: k === 0 ? { dir: [0.45, 0.32, -1], color: [1, 0.98, 0.9], size: 0.04, halo: 0.25 } : undefined,
}));

defineLevel(N, {
  name: 'STATIC FIELDS',
  zoneType: 'lv35_field',
  zoneSize: G,
  entry: { x: EX, y: ENTRY_PAD.h, z: EZ, yaw: 0 },
  doorDensity: 0,
  viewRadius: 4,
  sky: SKY[0],
  light: { phoneRadius: 4, phoneIntensity: 0.2 },
  // the phone is a receiver: while it is held up the dial follows where you look
  script(ctx, dt) {
    noEvents(ctx);
    const g = ctx.game, p = ctx.player, s = ctx.state;
    if (!s.cur) s.cur = { fog: [...FREQ[0].fog], tint: [1, 1, 1], sat: 1, idx: 0, look: {} };
    const up = !!(g.phone && g.phone.up);
    const u = ((((p.yaw / TAU) % 1) + 1) % 1) * 4;
    const idx = up ? Math.floor(u + 0.5) % 4 : 0;
    if (idx !== s.cur.idx) {
      s.cur.idx = idx;
      g.audioCall('play', 'lv35_tune', undefined, undefined, undefined, { vol: 0.9 });
    }
    const F = FREQ[idx], c = s.cur, k = Math.min(1, dt * 5);
    for (let i = 0; i < 3; i++) { c.fog[i] += (F.fog[i] - c.fog[i]) * k; c.tint[i] += (F.tint[i] - c.tint[i]) * k; }
    c.sat += (F.sat - c.sat) * k;
    const look = c.look;
    look.fog = F.fog; look.sky = SKY[idx]; look.weather = F.weather; look.tone = up ? 'lv35_tuned' : 'lv35_static';
    look.grade = { sat: F.sat, tint: F.tint };
    g.look = look;
    // direct writes: the dial answers at once instead of fading over a second
    if (g.env) {
      for (let i = 0; i < 3; i++) g.env.fog[i] = c.fog[i];
      if (g.env.grade) { g.env.grade.sat = c.sat; for (let i = 0; i < 3; i++) g.env.grade.tint[i] = c.tint[i]; }
    }
  },
});
void RNG;
