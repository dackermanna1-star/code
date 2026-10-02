// Level 10: Foggy Grassland. An enormous field under permanent fog. Near the door everything is
// familiar: pale grass, a fence, a tree. The farther you walk the less the land agrees with
// itself: the colours turn over, the grass grows into something else, furniture stands in the
// fog, stones, and things that are only there while you do not look closely (mirages that
// vanish when you walk up to them). Fog, sky and ground drift with the distance from the door.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, fbm, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { clamp, lerp, sstep, mix3, matRamp, terrainGrid, shadeIdx, padded, scatter, doorSite, noEvents, px, blades } from './g03_common.js';

const N = 10;
const G = 64;
const EX = 32.5, EZ = 32.5;

// ------------------------------------------------------------------ the drift
// t is a position on a scale of "unfamiliarity" that grows with the distance from the door
const STOPS = [0, 90, 210, 360, 540, 740, 960, 1200];
function phase(r) {
  for (let i = 1; i < STOPS.length; i++) if (r < STOPS[i]) return i - 1 + (r - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1]);
  return STOPS.length - 1 + (r - STOPS[STOPS.length - 1]) / 240;
}
const GROUND = [[0.58, 0.72, 0.48], [0.84, 0.78, 0.46], [0.48, 0.68, 0.54], [0.46, 0.58, 0.76], [0.68, 0.52, 0.8], [0.84, 0.5, 0.56], [0.38, 0.74, 0.72], [0.74, 0.74, 0.78]];
const FOG = [[0.77, 0.8, 0.78], [0.83, 0.81, 0.69], [0.7, 0.8, 0.7], [0.68, 0.76, 0.87], [0.81, 0.72, 0.89], [0.89, 0.72, 0.75], [0.64, 0.85, 0.85], [0.92, 0.92, 0.95]];
const TOP = [[0.66, 0.7, 0.72], [0.74, 0.72, 0.62], [0.62, 0.72, 0.64], [0.58, 0.68, 0.84], [0.7, 0.6, 0.84], [0.84, 0.6, 0.66], [0.52, 0.78, 0.8], [0.82, 0.84, 0.9]];
const at = (arr, t) => { const i = Math.floor(t), f = t - i; return mix3(arr[i % 8], arr[(i + 1) % 8], f); };

// ------------------------------------------------------------------ textures
defineTexture('lv10_grass', (p, r) => {
  p.fill([176, 182, 170]);
  p.noise(4, 0.09, 3);
  p.noise(16, 0.06, 2);
  for (let i = 0; i < 150; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), h = r.int(2, 5), c = r.chance(0.5) ? [140, 150, 132] : [204, 210, 194];
    for (let k = 0; k < h; k++) p.set(x + (k > 2 ? 1 : 0), y - k, c, 0.8);
  }
  for (let i = 0; i < 7; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(5, 9), [128, 140, 120], 0.4);
}, 12);
defineTexture('lv10_tuft', (p, r) => {
  p.clearAlpha(0);
  blades(p, r, { n: 34, cols: [[112, 122, 102], [148, 158, 134], [184, 194, 166]], min: 22, max: 62, lean: 9, w: 2 });
}, 10);
defineTexture('lv10_wheat', (p, r) => {
  p.clearAlpha(0);
  for (let k = 0; k < 26; k++) {
    const x0 = r.range(3, 61), h = r.range(34, 62), dx = r.range(-7, 7);
    for (let y = 0; y < h; y++) {
      const t = y / h, x = x0 + dx * t * t;
      px(p, x, 63 - y, t < 0.7 ? [168, 150, 96] : [214, 196, 128]);
      if (t > 0.8 && t < 0.96 && y % 3 === 0) { px(p, x + 1, 63 - y, [226, 208, 140]); px(p, x - 1, 63 - y, [226, 208, 140]); }
    }
  }
}, 10);
defineTexture('lv10_bark', (p, r) => {
  p.fill([104, 96, 86]);
  p.noise(2, 0.14, 2);
  for (let x = 0; x < 64; x += 2) {
    const d = r.range(0.5, 1.3);
    p.rect(x, 0, 1, 64, [74 * d, 68 * d, 62 * d], 0.7);
    if (r.chance(0.3)) p.rect(x + 1, r.int(0, 50), 1, r.int(6, 18), [140, 132, 120], 0.6);
  }
  p.noise(8, 0.1, 2);
}, 12);
defineTexture('lv10_leaf', (p, r) => {
  p.clearAlpha(0);
  for (let i = 0; i < 90; i++) {
    const a = r.range(0, 6.283), d = Math.sqrt(r.next()) * 29;
    const x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d * 0.8;
    const c = r.pick([[96, 112, 84], [118, 132, 100], [138, 150, 118], [78, 92, 70]]);
    for (let q = 0; q < 6; q++) px(p, x + (q % 3), y + Math.floor(q / 3), c);
  }
}, 10);
defineTexture('lv10_post', (p, r) => {
  p.fill([156, 148, 134]);
  p.noise(2, 0.12, 2);
  for (let y = 0; y < 64; y += 3) p.rect(0, y + r.int(0, 2), 64, 1, [118, 110, 98], 0.5);
  p.noise(8, 0.08, 2);
}, 10);
defineTexture('lv10_stone', (p, r) => {
  p.fill([150, 152, 144]);
  p.noise(3, 0.18, 3);
  for (let i = 0; i < 8; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(4, 9), [112, 128, 98], 0.5);
  p.speckle(120, [186, 188, 178], 0.3, 0.6);
}, 12);
defineTexture('lv10_slab', (p) => {
  p.fill([86, 90, 96]);
  p.noise(2, 0.06, 2);
  p.map((x, y, c) => { const k = 0.9 + 0.1 * pnoise(x * 0.4, y, 16, 3); return [c[0] * k, c[1] * k, c[2] * k]; });
}, 8);
// distant low hills and a few things that are much too tall
defineTexture('lv10_band', (p, r) => {
  p.clearAlpha(0);
  const col = [120, 126, 124];
  for (let x = 0; x < 64; x++) {
    const h = 6 + Math.round(pnoise(x, 0, 8, 5) * 12 + pnoise(x, 0, 16, 9) * 6);
    for (let y = 0; y < h; y++) px(p, x, 63 - y, col);
  }
  for (const [x, h, w] of [[9, 52, 1], [10, 44, 1], [23, 58, 2], [40, 40, 1], [52, 60, 2], [58, 30, 1]]) {
    for (let y = 0; y < h; y++) for (let q = 0; q < w; q++) px(p, x + q, 63 - y, col);
  }
}, 4);

// ground: 8 palettes x 5 shades, one texture
const GM = GROUND.map((c, i) => matRamp(`lv10_g${i}`, 'lv10_grass', { s: 2, surf: 'grass' }, [c[0] / 0.68, c[1] / 0.7, c[2] / 0.66]));
defineMaterial('lv10_bark', 'lv10_bark', { s: 1.6, surf: 'wood' });
defineMaterial('lv10_post', 'lv10_post', { s: 1.2, surf: 'wood' });
defineMaterial('lv10_stone', 'lv10_stone', { s: 2, surf: 'concrete' });
defineMaterial('lv10_slab', 'lv10_slab', { s: 4, surf: 'concrete' });

// ------------------------------------------------------------------ terrain
// (the story the level lives in spans y 0..6: keep the ground between about 0.5 and 5)
const baseH = (x, z) => {
  const dx = x - EX, dz = z - EZ, d2 = dx * dx + dz * dz;
  const r = Math.sqrt(d2);
  const amp = 1 + 1.1 * sstep(260, 900, r);
  const raw = (fbm(x, z, 74, 3, 3) - 0.5) * 4.6 * amp + (noise(x, z, 17, 8) - 0.5) * 0.6 * amp + 1.7 * Math.exp(-d2 / (2 * 46 * 46));
  return 2.7 + 2.1 * Math.tanh(raw / 2.1);
};
const ENTRY_PAD = { x: EX, z: EZ, r0: 3.6, r1: 8.5 };
ENTRY_PAD.h = baseH(EX, EZ);

function groundIdx(x, z, t) {
  const k = Math.floor(t + (noise(x, z, 34, 15) - 0.5) * 0.9 + 0.001);
  return ((k % 8) + 8) % 8;
}

// ------------------------------------------------------------------ props
defineProp('lv10_tuft', {
  build(mb, p, r) {
    const h = p.opts.h ?? 0.7, w = h * 0.95;
    const st = T(p.opts.tex || 'lv10_tuft');
    const a0 = r.range(0, 3.14);
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * 1.3;
      const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
      mb.card([-c, 0, -s, c, 0, s, c, h, s, -c, h, -s], [s, 0, -c], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});
defineProp('lv10_tree', {
  build(mb, p, r) {
    const bark = S('lv10_bark');
    const H = (p.opts.h ?? 4.2) * r.range(0.85, 1.15);
    mb.cyl(0, -0.2, 0, 0.17, H * 0.6, 5, bark, 0);
    mb.cyl(0, H * 0.6 - 0.2, 0, 0.1, H * 0.4, 4, bark, 2);
    const lf = T('lv10_leaf', p.opts.crown ? { tint: p.opts.crown } : undefined);
    const cw = H * 0.62;
    for (let k = 0; k < 3; k++) {
      const a = k * 1.05 + r.range(0, 0.4), c = Math.cos(a) * cw, s = Math.sin(a) * cw;
      const y0 = H * 0.5, y1 = H * 1.12;
      mb.card([-c, y0, -s, c, y0, s, c, y1, s, -c, y1, -s], [s, 0, -c], lf, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
    // a flat layer of leaves
    const y = H * 0.82;
    mb.card([-cw, y, -cw, cw, y, -cw, cw, y, cw, -cw, y, cw], [0, 1, 0], lf, [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  boxes: [[-0.2, 0, -0.2, 0.2, 3, 0.2]],
});
// an impossibly big trunk: its top is lost in the fog
defineProp('lv10_giant', {
  build(mb, p, r) {
    const bark = S('lv10_bark');
    const R = p.opts.r ?? 2.6, H = p.opts.h ?? 80;
    mb.cyl(0, -1, 0, R * 1.5, 4, 8, bark, 0);
    mb.cyl(0, 2.5, 0, R, H * 0.5, 8, bark, 0);
    mb.cyl(0, 2.5 + H * 0.5, 0, R * 0.78, H * 0.5, 8, bark, 2);
    void r;
  },
  boxes: (p) => { const R = (p.opts.r ?? 2.6) * 1.3; return [[-R, 0, -R, R, 12, R]]; },
});
defineProp('lv10_pole', {
  build(mb, p) {
    const wood = S('lv10_post');
    const wire = S('metal_dark');
    const H = 7.2;
    mb.cyl(0, -0.2, 0, 0.14, H, 5, wood, 2);
    mb.box(-1.0, H - 0.5, -0.05, 1.0, H - 0.38, 0.05, wood);
    mb.box(-0.8, H - 1.3, -0.04, 0.8, H - 1.2, 0.04, wood);
    const L = p.opts.span || 0;
    if (L > 0) for (const x of [-0.9, 0, 0.9]) {
      const y = x === 0 ? H : H - 0.4;
      mb.rod(x, y, 0, x, y - 0.55, L / 2, 0.012, 3, wire, false);
      mb.rod(x, y - 0.55, L / 2, x, y, L, 0.012, 3, wire, false);
    }
  },
  boxes: [[-0.2, 0, -0.2, 0.2, 3, 0.2]],
});
defineProp('lv10_stone', {
  build(mb, p, r) {
    const st = S('lv10_stone');
    const H = p.opts.h ?? 2.4, W = H * 0.32;
    const j = () => r.range(-0.12, 0.12) * W;
    mb.box(-W + j(), -0.3, -W * 0.6 + j(), W + j(), H, W * 0.6 + j(), st);
    mb.box(-W * 0.7, H, -W * 0.4, W * 0.6, H + 0.25 * W, W * 0.4, st);
  },
  boxes: (p) => { const W = (p.opts.h ?? 2.4) * 0.32; return [[-W, 0, -W * 0.6, W, 2, W * 0.6]]; },
});
defineProp('lv10_slab', {
  build(mb, p) {
    const H = p.opts.h ?? 14, W = p.opts.w ?? 3.2, D = p.opts.d ?? 0.9;
    mb.box(-W, -0.5, -D, W, H, D, S('lv10_slab'));
  },
  boxes: (p) => [[-(p.opts.w ?? 3.2), 0, -(p.opts.d ?? 0.9), p.opts.w ?? 3.2, 3, p.opts.d ?? 0.9]],
});
// things that are only there while you look from afar: they are gone when you get close
defineProp('lv10_mirage_pylons', {
  build(mb) {
    const m = S('metal_dark');
    for (let k = 0; k < 4; k++) {
      const x = k * 9 - 13.5, h = 14 + (k % 2) * 4;
      mb.rod(x - 0.7, 0, 0, x, h, 0, 0.1, 3, m, false); mb.rod(x + 0.7, 0, 0, x, h, 0, 0.1, 3, m, false);
      mb.box(x - 1.6, h - 1.2, -0.08, x + 1.6, h - 1.05, 0.08, m);
    }
  },
});
defineProp('lv10_mirage_wall', {
  build(mb, p) {
    const st = S('lv10_slab', { tint: [1.2, 1.2, 1.25] });
    mb.box(-9, 0, -0.5, 9, 7, 0.5, st);
    for (let k = 0; k < 5; k++) mb.box(-7 + k * 3.4, 2.2, -0.52, -6 + k * 3.4, 4.4, 0.52, S('glass'));
  },
});

// ------------------------------------------------------------------ zone
const ODD = [
  // [minimum t, weight, kind]
  [0.9, 3, 'mailbox'], [0.9, 2, 'traffic_cone'], [0.9, 3, 'chair_office'], [1.6, 2, 'chair_plastic'],
  [2.1, 2, 'sofa'], [2.1, 2, 'armchair'], [2.1, 2, 'table_round'], [2.3, 3, 'tv'], [3.0, 2, 'shopping_cart'],
  [3.1, 2, 'car'], [3.3, 1.5, 'piano'], [3.5, 1.5, 'bathtub'], [3.8, 2, 'stack_chairs'], [4.1, 1.5, 'box_stack'],
];
function pickOdd(t, u) {
  const list = ODD.filter((o) => t >= o[0]);
  if (!list.length) return null;
  let sum = 0;
  for (const o of list) sum += o[1];
  let a = u * sum;
  for (const o of list) { a -= o[1]; if (a <= 0) return o[2]; }
  return list[list.length - 1][2];
}

// posts every 2.6 m from (ax, az) to (bx, bz) with two rails between them
function fenceRun(zb, hf, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 2.6);
  const dx = (bx - ax) / len, dz = (bz - az) / len;
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const x = ax + dx * k * 2.6, z = az + dz * k * 2.6;
    const y = hf(x, z);
    const mine = owns(zb, x, z);
    if (mine) zb.box(x - 0.07, y - 0.2, z - 0.07, x + 0.07, y + 1.15, z + 0.07, M.lv10_post);
    if (prev && mine) {
      for (const hh of [0.5, 0.95]) {
        const y0 = (y + prev.y) / 2 + hh;
        const t = 0.035;
        zb.box(Math.min(x, prev.x) - t, y0 - 0.05, Math.min(z, prev.z) - t, Math.max(x, prev.x) + t, y0 + 0.04, Math.max(z, prev.z) + t, M.lv10_post, { collide: false });
      }
    }
    prev = { x, z, y };
  }
}

function fenceLines(zb, hf) {
  const C = 48;
  for (let j = Math.floor(zb.z0 / C); j <= Math.floor((zb.z1 - 1) / C); j++) {
    for (let i = Math.floor(zb.x0 / C); i <= Math.floor((zb.x1 - 1) / C); i++) {
      if (hr(i, j, 301) > 0.5) continue;
      const alongX = hr(i, j, 302) < 0.5;
      const a = (alongX ? j : i) * C + 6 + hr(i, j, 303) * 36;
      const s0 = (alongX ? i : j) * C + 3 + hr(i, j, 304) * 14, len = 14 + hr(i, j, 305) * 26;
      if (alongX) fenceRun(zb, hf, s0, a, s0 + len, a); else fenceRun(zb, hf, a, s0, a, s0 + len);
    }
  }
  // one by hand: it runs off from beside the door toward the sun, and stops in the fog
  fenceRun(zb, hf, EX + 4.6, EZ - 4, EX + 4.6, EZ - 56);
}

function gen(zb) {
  zb.noConnectivity = true;
  const pads = [ENTRY_PAD];
  let door = doorSite(zb, 0.66, 71);
  if (door && Math.hypot(door.x - EX, door.z - EZ) < 18) door = null;
  if (door) pads.push({ x: door.x, z: door.z, r0: 2.4, r1: 6.5 });
  const hf = padded(baseH, pads);
  const cx = (zb.x0 + zb.x1) / 2, cz = (zb.z0 + zb.z1) / 2;
  terrainGrid(zb, hf, (x, z, h, shade) => {
    const t = phase(Math.hypot(x + 0.5 - EX, z + 0.5 - EZ));
    const mott = (noise(x, z, 9, 4) - 0.5) * 0.45 + (noise(x, z, 3, 7) - 0.5) * 0.2;
    return GM[groundIdx(x, z, t)][shadeIdx(clamp(shade + mott, 0, 0.999))];
  }, [0.8, -0.6], 2.2);

  const keep = (x, z) => {
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < (p === door ? 2.6 : 3.2)) return false;
    return true;
  };
  const tintAt = (x, z, t, k = 1.0) => { const g = at(GROUND, t); return [g[0] * k / 0.74, g[1] * k / 0.74, g[2] * k / 0.74]; };

  // tufts of grass; they grow taller and change into wheat, then into something else
  scatter(zb, 3.3, 11, (x, z, i, j, u, v) => {
    if (!keep(x, z)) return;
    const t = phase(Math.hypot(x - EX, z - EZ));
    if (u < 0.12) return;
    const wheat = t > 0.9 && t < 2.4 && noise(x, z, 40, 6) > 0.4;
    const h = (wheat ? 1.05 : 0.5) * (0.7 + v * 0.7) * (1 + 0.25 * sstep(2, 5, t));
    const tint = tintAt(x, z, t, 0.9);
    zb.prop('lv10_tuft', x, hf(x, z) - 0.04, z, 0, { h, tex: wheat ? 'lv10_wheat' : 'lv10_tuft', tint: wheat ? [1.1, 1.0, 0.9] : tint });
  });

  // taller clumps in patches
  scatter(zb, 6, 17, (x, z, i, j, u, v) => {
    if (!keep(x, z) || noise(x, z, 24, 12) < 0.52) return;
    const t = phase(Math.hypot(x - EX, z - EZ));
    const n = 3 + Math.floor(v * 3), tint = tintAt(x, z, t, 0.86);
    for (let k = 0; k < n; k++) {
      const a = k * 2.4 + u * 6, d = 0.3 + 0.5 * hr(i + k, j, 18);
      const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      if (!owns(zb, cx, cz)) continue;
      zb.prop('lv10_tuft', cx, hf(cx, cz) - 0.04, cz, 0, { h: 0.8 + hr(i, j + k, 19) * 0.6 + 0.3 * sstep(1.5, 5, t), tint });
    }
  });
  // trees: small, bare-ish, a few; then neat rows; then pale giants
  scatter(zb, 19, 21, (x, z, i, j, u, v) => {
    if (!keep(x, z)) return;
    const t = phase(Math.hypot(x - EX, z - EZ));
    if (u > 0.5 - Math.min(0.2, t * 0.04)) return;
    const g = at(GROUND, t);
    zb.prop('lv10_tree', x, hf(x, z) - 0.05, z, v * 6.28, { h: 3.6 + v * 2.2 + t * 0.25, crown: [g[0] * 1.5, g[1] * 1.5, g[2] * 1.5] });
  });
  // the orchard: from t 1.7 on, trees in perfect rows
  const rowsT = phase(Math.hypot(cx - EX, cz - EZ));
  if (rowsT > 1.7 && rowsT < 4.6) {
    scatter(zb, 7, 31, (x, z, i, j) => {
      const xx = i * 7 + 3.5, zz = j * 7 + 3.5;
      if (!keep(xx, zz) || !owns(zb, xx, zz) || (i + j * 3) % 5 === 0) return;
      zb.prop('lv10_tree', xx, hf(xx, zz) - 0.05, zz, 0, { h: 3.2, crown: [0.95, 1.06, 0.98] });
    });
  }
  fenceLines(zb, hf);

  // telephone poles: lines of them, from the start of the second stage
  for (let j = Math.floor(zb.z0 / 96); j <= Math.floor((zb.z1 - 1) / 96); j++) {
    for (let i = Math.floor(zb.x0 / 96); i <= Math.floor((zb.x1 - 1) / 96); i++) {
      if (hr(i, j, 401) > 0.45) continue;
      const alongX = hr(i, j, 402) < 0.5, n = 3 + Math.floor(hr(i, j, 403) * 4);
      const a = (alongX ? j : i) * 96 + 12 + hr(i, j, 404) * 72, s0 = (alongX ? i : j) * 96 + 6 + hr(i, j, 405) * 20;
      for (let k = 0; k < n; k++) {
        const u = s0 + k * 26, x = alongX ? u : a, z = alongX ? a : u;
        if (!owns(zb, x, z) || !keep(x, z)) continue;
        const t = phase(Math.hypot(x - EX, z - EZ));
        if (t < 0.5 && Math.hypot(x - EX, z - EZ) < 60) continue;
        zb.prop('lv10_pole', x, hf(x, z) - 0.1, z, alongX ? Math.PI / 2 : 0, { span: k < n - 1 ? 26 : 0 });
      }
    }
  }

  // odd things standing in the grass
  scatter(zb, 22, 51, (x, z, i, j, u, v) => {
    const r = Math.hypot(x - EX, z - EZ), t = phase(r);
    if (!keep(x, z) || t < 0.9 || u > clamp((t - 0.7) * 0.22, 0, 0.62)) return;
    const kind = pickOdd(t, v);
    if (!kind) return;
    const y = hf(x, z) + (t > 6.4 && hr(i, j, 52) < 0.5 ? 2.5 + hr(i, j, 53) * 3 : 0);
    zb.prop(kind, x, y, z, hr(i, j, 54) * 6.28, {});
    if (kind === 'chair_office' && hr(i, j, 55) < 0.6) zb.prop('chair_office', x + 1.2, y, z + 0.3, hr(i, j, 56) * 6.28, {});
  });
  // stones and slabs from t 4 on
  scatter(zb, 31, 61, (x, z, i, j, u, v) => {
    const t = phase(Math.hypot(x - EX, z - EZ));
    if (!keep(x, z) || t < 3.9 || u > clamp((t - 3.7) * 0.3, 0, 0.7)) return;
    if (v < 0.55) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.256 + v * 3, sx = x + Math.cos(a) * 4.5, sz = z + Math.sin(a) * 4.5;
        if (owns(zb, sx, sz)) zb.prop('lv10_stone', sx, hf(sx, sz) - 0.1, sz, a, { h: 2.0 + hr(i + k, j, 62) * 1.4 });
      }
    } else {
      zb.prop('lv10_slab', x, hf(x, z) - 0.2, z, v * 6.28, { h: 9 + hr(i, j, 63) * 22, w: 2.4 + hr(i, j, 64) * 2, d: 0.8 });
    }
  });
  // giants: a few by hand around the door, then scattered
  for (const [gx, gz, R, H] of [[EX - 19, EZ - 36, 2.5, 80], [EX + 27, EZ - 43, 3.3, 95], [EX + 46, EZ - 10, 2.0, 70], [EX - 40, EZ + 14, 2.8, 85]]) {
    if (owns(zb, gx, gz)) zb.prop('lv10_giant', gx, hf(gx, gz) - 0.5, gz, 0, { r: R, h: H });
  }
  scatter(zb, 130, 71, (x, z, i, j, u) => {
    if (u > 0.4 || Math.hypot(x - EX, z - EZ) < 70) return;
    zb.prop('lv10_giant', x, hf(x, z) - 0.5, z, 0, { r: 1.8 + u * 4, h: 60 + u * 80 });
  });
  // mirages: seen from afar, gone when you come closer
  scatter(zb, 90, 81, (x, z, i, j, u, v) => {
    const t = phase(Math.hypot(x - EX, z - EZ));
    if (u > clamp(0.2 + t * 0.12, 0, 0.7) || !keep(x, z)) return;
    const k = Math.floor(v * 3);
    zb.dynamic(k === 0 ? 'house_small' : k === 1 ? 'lv10_mirage_pylons' : 'lv10_mirage_wall', x, hf(x, z), z, hr(i, j, 82) * 6.28, {}, { showFar: 20 });
  });

  if (door) levelDoor(zb, door.x, door.z, door.rot, { y: hf(door.x, door.z) });
  void lerp;
}

defineZone('lv10_field', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.96, 1.0, 0.96],
    env: env({ fog: [0.77, 0.8, 0.78], fogNear: 5, fogFar: 46, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv10_fog' }),
  }),
  gen,
});

const SKY = {
  top: [0.66, 0.7, 0.72], horizon: [0.77, 0.8, 0.78], ground: [0.74, 0.77, 0.75], curve: 0.45,
  sun: { dir: [0.16, 0.19, -1], color: [1.0, 0.98, 0.9], size: 0.05, halo: 0.34 },
  band: { layer: 'lv10_band', color: [0.66, 0.7, 0.7], repeat: 5, top: 0.2, bottom: -0.03, fog: 0.84 },
};

defineLevel(N, {
  name: 'FOGGY GRASSLAND',
  zoneType: 'lv10_field',
  zoneSize: G,
  entry: { x: EX, y: ENTRY_PAD.h, z: EZ, yaw: 0 },
  doorDensity: 0.5,
  viewRadius: 4,
  sky: SKY,
  weather: { kind: 'dust', amount: 0.4, color: [0.96, 0.97, 0.92, 0.55], fall: 0.06, wind: [0.3, 0.12], size: 0.02 },
  light: { phoneRadius: 4, phoneIntensity: 0.2 },
  script(ctx, dt) {
    noEvents(ctx);
    const s = ctx.state, p = ctx.player, E = ctx.level.entry;
    const t = phase(Math.hypot(p.x - E.x, p.z - E.z));
    const look = s.look || (s.look = { fog: [0, 0, 0] });
    const f = at(FOG, t), top = at(TOP, t);
    look.fog = f;
    SKY.horizon = f; SKY.ground = f; SKY.top = top;
    look.fogFar = 46 - 8 * sstep(2, 7, t);
    ctx.game.look = look;
    // now and then a long breath of wind goes through the grass
    s.gust = (s.gust ?? 18) - dt;
    if (s.gust <= 0) {
      s.gust = 22 + Math.random() * 40;
      const a = Math.random() * 6.283;
      ctx.game.audioCall('play', 'lv10_gust', p.x + Math.sin(a) * 20, p.y, p.z - Math.cos(a) * 20, { vol: 0.7 });
    }
  },
});
