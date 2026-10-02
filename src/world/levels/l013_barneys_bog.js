// Level 13: Barney's Bog. A purple swamp: black water you can wade, mud islands, drowned trees
// hung with moss, and boardwalks on stilts that run off in every direction, lit by sickly green
// lanterns. The zones are mutable: when you walk away from a stretch of boardwalk and come
// back, the planks no longer lead where they led. Walkways cross zone borders at fixed places,
// but what joins them inside a zone is re-rolled every time: junctions move, branches appear,
// and walkways stop dead in the water.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as G, propWithXf as withXf } from '../props.js';
import { xfRotX, xfRotZ } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, fbm, cbox, owns, hr, levelDoor, water, env, M } from './kit.js';
import { clamp, lerp, sstep, matRamp, terrainGrid, shadeIdx, scatter, noEvents, px, pr, blades } from './g03_common.js';

const N = 13;
const Z = 32;                 // zone size
const WY = 1.15;              // water surface
const DECK = 1.62;            // boardwalk deck
const HW = 0.78;              // half width of a walkway
const PLAT = 2.0;             // half size of a platform
const PORT_P = 0.64;          // chance that a walkway crosses a zone border
const EX = 16.5, EZ = 27.5;

// ------------------------------------------------------------------ textures
defineTexture('lv13_mud', (p, r) => {
  p.fill([72, 54, 80]);
  p.noise(4, 0.22, 3);
  for (let i = 0; i < 6; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(6, 12), [50, 40, 68], 0.5);
  p.speckle(90, [100, 118, 76], 0.25, 0.6);
  p.speckle(60, [46, 34, 56], 0.4, 0.7);
}, 12);
defineTexture('lv13_moss', (p, r) => {
  p.fill([82, 98, 66]);
  p.noise(3, 0.2, 3);
  for (let i = 0; i < 8; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(5, 10), [96, 70, 96], 0.45);
  p.speckle(120, [118, 140, 84], 0.3, 0.6);
  p.speckle(60, [52, 52, 64], 0.4, 0.7);
}, 12);
defineTexture('lv13_water', (p, r) => {
  p.fill([42, 26, 62]);
  p.map((x, y, c) => {
    const n = pnoise(x, y * 2, 32, 3) * 0.6 + pnoise(x * 2, y * 4, 16, 9) * 0.4;
    const k = 0.7 + n * 0.8;
    return [c[0] * k + n * 8, c[1] * k + n * 4, c[2] * k + n * 20];
  });
  for (let i = 0; i < 26; i++) { const x = (i * 37) % 64, y = (i * 23 + 7) % 64; p.rect(x, y, 3 + (i % 4), 1, [64, 90, 70], 0.5); }
}, 8);
function planks(p, r, horizontal) {
  p.fill([96, 80, 86]);
  const draw = (a, b, w, h) => (horizontal ? [a, b, w, h] : [b, a, h, w]);
  for (let k = 0; k < 8; k++) {
    const d = r.range(0.78, 1.12);
    p.rect(...draw(0, k * 8, 64, 8), [96 * d, 80 * d, 88 * d]);
    p.rect(...draw(0, k * 8, 64, 1), [38, 28, 44]);
    for (let g = 0; g < 5; g++) p.rect(...draw(r.int(0, 56), k * 8 + r.int(2, 6), r.int(6, 20), 1), [76, 62, 72], 0.7);
    if (r.chance(0.5)) p.rect(...draw(r.int(2, 60), k * 8 + 3, 2, 2), [34, 26, 40]);
    // greenish rot
    if (r.chance(0.5)) p.rect(...draw(r.int(0, 50), k * 8 + 1, r.int(6, 14), 6), [96, 120, 78], 0.28);
  }
  p.grain(0.05);
}
defineTexture('lv13_plank_h', (p, r) => planks(p, r, true), 12);
defineTexture('lv13_plank_v', (p, r) => planks(p, r, false), 12);
defineTexture('lv13_post', (p, r) => {
  p.fill([70, 58, 66]);
  p.noise(2, 0.15, 2);
  for (let x = 0; x < 64; x += 3) p.rect(x, 0, 1, 64, [46, 36, 48], 0.6);
  p.stain(32, 52, 18, [92, 118, 76], 0.5);
  void r;
}, 10);
defineTexture('lv13_bark', (p, r) => {
  p.fill([62, 52, 64]);
  p.noise(2, 0.2, 2);
  for (let x = 0; x < 64; x += 2) {
    const d = r.range(0.5, 1.2);
    p.rect(x, 0, 1, 64, [36 * d, 28 * d, 40 * d], 0.7);
    if (r.chance(0.25)) p.rect(x + 1, r.int(0, 50), 1, r.int(6, 20), [104, 92, 112], 0.5);
  }
  p.stain(20, 50, 16, [78, 104, 66], 0.5);
  p.stain(48, 40, 10, [78, 104, 66], 0.4);
}, 12);
defineTexture('lv13_reed', (p, r) => {
  p.clearAlpha(0);
  blades(p, r, { n: 22, cols: [[62, 58, 40], [92, 100, 52], [128, 124, 70]], min: 36, max: 62, lean: 5, w: 1 });
  // cattail heads
  for (let k = 0; k < 4; k++) {
    const x = r.int(8, 56), y = r.int(2, 10);
    pr(p, x, y, 3, 9, [86, 48, 40]); pr(p, x + 1, y - 4, 1, 4, [110, 100, 60]);
    for (let q = y + 9; q < 64; q++) px(p, x + 1, q, [92, 100, 52]);
  }
}, 12);
defineTexture('lv13_hang', (p, r) => {
  p.clearAlpha(0);
  for (let k = 0; k < 14; k++) {
    const x0 = 4 + k * 4 + r.int(-1, 1), h = r.int(22, 62);
    for (let y = 0; y < h; y++) {
      const t = y / h, x = x0 + Math.round(Math.sin(y * 0.22 + k) * 1.4);
      const c = t < 0.2 ? [88, 112, 70] : t < 0.7 ? [122, 150, 88] : [160, 180, 110];
      px(p, x, y, c);
      if (y % 5 === 0) px(p, x + 1, y, c);
    }
  }
}, 10);
defineTexture('lv13_cap', (p, r) => {
  p.fill([230, 90, 200]);
  p.noise(4, 0.2, 2);
  for (let i = 0; i < 12; i++) p.disc(r.int(4, 60), r.int(4, 60), 2, [255, 200, 250], 0.8);
}, 6);
defineTexture('lv13_glow', (p) => { p.fill([190, 255, 130]); p.disc(32, 32, 24, [240, 255, 200], 0.6, 8); }, 6);
defineTexture('lv13_halo', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
    if (d < 1) { p.set(x, y, [190, 255, 140]); p.alpha(x, y, Math.max(0, 1 - d) * 520 - 120); }
  }
}, 4);
defineTexture('lv13_clouds', (p) => {
  p.map((x, y) => {
    const n = pnoise(x, y, 6, 3) * 0.55 + pnoise(x, y, 12, 8) * 0.3 + pnoise(x * 2, y, 16, 5) * 0.15;
    const d = clamp((n - 0.42) * 2.4, 0, 1);
    return [d * 255, (0.6 + 0.4 * pnoise(x, y, 8, 11)) * 255, 0];
  });
}, 0);
defineTexture('lv13_band', (p, r) => {
  p.clearAlpha(0);
  const col = [60, 40, 80];
  // colossal trunks and a ragged line of drowned forest
  for (let x = 0; x < 64; x++) {
    const h = 5 + Math.round(pnoise(x, 0, 16, 5) * 8);
    for (let y = 0; y < h; y++) px(p, x, 63 - y, col);
  }
  for (const [x, w, h] of [[6, 4, 62], [19, 3, 50], [34, 5, 64], [47, 3, 56], [57, 4, 60]]) {
    for (let y = 0; y < h; y++) {
      const ww = w + (y < 8 ? 2 : 0);
      for (let q = 0; q < ww; q++) px(p, x + q - (y < 8 ? 1 : 0), 63 - y, col);
    }
    // a limb
    for (let k = 0; k < 14; k++) px(p, x + w + k, 63 - (h - 14) - Math.floor(k * 0.5), col);
    for (let k = 0; k < 10; k++) px(p, x - k, 63 - (h - 22) - Math.floor(k * 0.6), col);
  }
  void r;
}, 4);

const MUD = matRamp('lv13_mud', 'lv13_mud', { s: 2.2, surf: 'wet' }, [1.15, 1.08, 1.2]);
const MOSS = matRamp('lv13_moss', 'lv13_moss', { s: 2.2, surf: 'grass' }, [1.25, 1.2, 1.12]);
defineMaterial('lv13_water', 'lv13_water', { s: 3, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });
defineMaterial('lv13_plank_h', 'lv13_plank_h', { s: 1.1, surf: 'wood' });
defineMaterial('lv13_plank_v', 'lv13_plank_v', { s: 1.1, surf: 'wood' });
defineMaterial('lv13_post', 'lv13_post', { s: 1.4, surf: 'wood' });
defineMaterial('lv13_bark', 'lv13_bark', { s: 1.6, surf: 'wood' });
defineMaterial('lv13_glow', 'lv13_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.25, chan: 0 });
defineMaterial('lv13_glow_flk', 'lv13_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.25, chan: 2 });
defineMaterial('lv13_glow_dying', 'lv13_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.25, chan: 7 });

// ------------------------------------------------------------------ terrain
const bogH = (x, z) => {
  const b = 0.42 + 0.5 * fbm(x, z, 34, 5, 3);
  const isl = sstep(0.6, 0.8, fbm(x, z, 22, 9, 3));
  return b + isl * 0.9;
};
// the arrival platform: dry ground under it
const hf = (x, z) => {
  const d = Math.hypot(x - EX, z - EZ);
  return lerp(bogH(x, z), 0.8, 1 - sstep(4, 9, d));
};

// ------------------------------------------------------------------ props
defineProp('lv13_reed', {
  build(mb, p, r) {
    const h = p.opts.h ?? 1.5, w = h * 0.7, st = T('lv13_reed');
    const a0 = r.range(0, 3.14);
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * 1.3, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
      mb.card([-c, 0, -s, c, 0, s, c, h, s, -c, h, -s], [s, 0, -c], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});
defineProp('lv13_tree', {
  build(mb, p, r) {
    const bark = S('lv13_bark'), hang = T('lv13_hang');
    const H = (p.opts.h ?? 6.5) * r.range(0.85, 1.2);
    mb.cyl(0, -0.6, 0, 0.62, 1.4, 6, bark, 0);
    mb.cyl(0, 0.7, 0, 0.36, H * 0.55, 6, bark, 0);
    mb.cyl(0, 0.7 + H * 0.55, 0, 0.22, H * 0.45, 5, bark, 2);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r.range(0, 1), y0 = H * (0.55 + 0.12 * i);
      const len = 1.8 + r.next() * 1.8, ex = Math.cos(a) * len, ez = Math.sin(a) * len, ey = y0 + len * 0.55;
      mb.rod(0, y0, 0, ex, ey, ez, 0.1, 4, bark, false);
      // moss hanging from the limb
      for (let k = 0; k < 2; k++) {
        const t = 0.55 + 0.4 * k, mx = ex * t, mz = ez * t, my = y0 + (ey - y0) * t;
        const c = Math.cos(a + 1.57) * 0.55, s = Math.sin(a + 1.57) * 0.55, hh = 1.2 + r.next() * 1.4;
        mb.card([mx - c, my - hh, mz - s, mx + c, my - hh, mz + s, mx + c, my, mz + s, mx - c, my, mz - s], [s, 0, -c], hang, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    }
  },
  boxes: [[-0.5, 0, -0.5, 0.5, 3, 0.5]],
});
defineProp('lv13_giant', {
  build(mb, p, r) {
    const bark = S('lv13_bark'), hang = T('lv13_hang');
    const R = p.opts.r ?? 3, H = p.opts.h ?? 46;
    mb.cyl(0, -1, 0, R * 1.6, 5, 8, bark, 0);
    mb.cyl(0, 3.5, 0, R, H * 0.5, 8, bark, 0);
    mb.cyl(0, 3.5 + H * 0.5, 0, R * 0.7, H * 0.5, 8, bark, 2);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + r.range(0, 1), x = Math.cos(a) * R, z = Math.sin(a) * R, y = 8 + k * 3, hh = 7 + r.next() * 6;
      const c = Math.cos(a + 1.57) * 1.5, s = Math.sin(a + 1.57) * 1.5;
      mb.card([x - c, y - hh, z - s, x + c, y - hh, z + s, x + c, y, z + s, x - c, y, z - s], [s, 0, -c], hang, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: (p) => { const R = (p.opts.r ?? 3) * 1.4; return [[-R, 0, -R, R, 12, R]]; },
});
defineProp('lv13_fungus', {
  build(mb, p, r) {
    const stem = S('lv13_post', { tint: [1.6, 1.4, 1.6] });
    const cap = G('lv13_cap', 1.0, 0);
    const n = 3 + Math.floor(r.next() * 3);
    for (let k = 0; k < n; k++) {
      const a = k * 2.2 + r.range(0, 1), d = k === 0 ? 0 : r.range(0.12, 0.3), h = r.range(0.12, 0.3) * (k === 0 ? 1.5 : 1);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      mb.cyl(x, 0, z, 0.025, h, 4, stem, 0);
      mb.cyl(x, h, z, h * 0.8, h * 0.4, 6, cap, 3);
    }
  },
  light: { y: 0.3, color: [0.85, 0.35, 1.0], rad: 3.2, int: 0.4 },
});
defineProp('lv13_log', {
  build(mb, p, r) {
    const bark = S('lv13_bark'), L = p.opts.len ?? 3;
    mb.rod(-L / 2, 0.14, 0, L / 2, 0.22, r.range(-0.3, 0.3), 0.2, 6, bark, true);
  },
});
// a lantern on a post: glass box and a soft halo made of two crossed cards
defineProp('lv13_lantern', {
  build(mb, p) {
    const ch = p.opts.ch || 0;
    mb.box(-0.12, 0, -0.12, 0.12, 0.34, 0.12, G('lv13_glow', 1.1, ch));
    mb.box(-0.14, 0.34, -0.14, 0.14, 0.4, 0.14, S('lv13_post'));
    mb.box(-0.14, -0.06, -0.14, 0.14, 0, 0.14, S('lv13_post'));
    const h = G('lv13_halo', 0.9, ch);
    const w = 0.7, y0 = 0.17 - w / 2, y1 = 0.17 + w / 2;
    mb.card([-w / 2, y0, 0, w / 2, y0, 0, w / 2, y1, 0, -w / 2, y1, 0], [0, 0, 1], h, [0, 1, 1, 1, 1, 0, 0, 0]);
    mb.card([0, y0, -w / 2, 0, y0, w / 2, 0, y1, w / 2, 0, y1, -w / 2], [1, 0, 0], h, [0, 1, 1, 1, 1, 0, 0, 0]);
  },
});
// the broken end of a walkway: the last planks tipped into the water
defineProp('lv13_endcap', {
  build(mb, p, r) {
    const wood = S('lv13_plank_h'), post = S('lv13_post');
    // local +z points back along the walkway; the deck's end is at z = 0
    withXf(mb, xfRotX(0.5), () => mb.box(-HW + 0.1, DECK - 0.1, 0.0, HW - 0.35, DECK, 0.85, wood));
    withXf(mb, xfRotZ(0.12), () => mb.box(-0.1, DECK - 0.5, -0.25, 0.1, DECK, 0.05, post));
    mb.box(0.3, DECK - 0.13, -0.5, 0.58, DECK, 0.0, wood);
    void r;
  },
});

// ------------------------------------------------------------------ walkways
// ports: where a walkway crosses a zone border. Fixed by the border, so neighbours agree.
const mainS = (zx, zz) => zx === 0 && zz >= -6 && zz <= -1;
const portS = (zx, zz) => (mainS(zx, zz) ? EX : hr(zx, zz, 13) < PORT_P ? zx * Z + 6 + hr(zx, zz, 14) * 20 : -1e9);   // x of the walkway across the south border of zone (zx, zz)
const portE = (zx, zz) => (hr(zx, zz, 11) < PORT_P ? zz * Z + 6 + hr(zx, zz, 12) * 20 : -1e9);                       // z of the walkway across the east border
const has = (v) => v > -1e8;

function nearPath(paths, x, z, m) {
  for (const pa of paths) {
    for (let i = 0; i + 1 < pa.pts.length; i++) {
      const a = pa.pts[i], b = pa.pts[i + 1];
      const x0 = Math.min(a[0], b[0]) - m, x1 = Math.max(a[0], b[0]) + m, z0 = Math.min(a[1], b[1]) - m, z1 = Math.max(a[1], b[1]) + m;
      if (x > x0 && x < x1 && z > z0 && z < z1) return true;
    }
  }
  return false;
}

// polyline from a port to the hub: an S-bend, so junctions are never simple
function route(rng, from, side, hub, zb) {
  const [px0, pz0] = from;
  const f = rng.range(0.3, 0.7);
  if (side === 'N' || side === 'S') {
    const zm = lerp(pz0, hub[1], f);
    return [[px0, pz0], [px0, zm], [hub[0], zm], [hub[0], hub[1]]];
  }
  const xm = lerp(px0, hub[0], f);
  void zb;
  return [[px0, pz0], [xm, pz0], [xm, hub[1]], [hub[0], hub[1]]];
}
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - out[out.length - 1][0], pts[i][1] - out[out.length - 1][1]) > 0.8) out.push(pts[i]);
  return out;
}
function truncate(pts, dist) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      out.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]);
      return out;
    }
    acc += seg;
    out.push(pts[i]);
  }
  return out;
}
const length = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

function lamp(zb, x, z, y, on, dying) {
  if (!owns(zb, x, z)) return;
  if (!on) { zb.box(x - 0.1, y, z - 0.1, x + 0.1, y + 0.3, z + 0.1, M.lv13_post, { collide: false }); return; }
  const ch = dying ? 7 : hr(Math.floor(x), Math.floor(z), 33) < 0.12 ? 2 : 0;
  zb.prop('lv13_lantern', x, y, z, 0, { ch });
  zb.light(x, y + 0.15, z, { color: [0.62, 1.0, 0.42], rad: 9, int: 0.95, ch });
}

function drawPath(zb, path, rng) {
  const pts = path.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ux = dx / len, uz = dz / len;
    const alongX = Math.abs(dx) > Math.abs(dz);
    const insA = i === 0 ? 0 : HW;
    const last = i + 2 === pts.length;
    const insB = last ? (path.hub ? PLAT : 0) : HW;
    const sx = a[0] + ux * insA, sz = a[1] + uz * insA, ex = b[0] - ux * insB, ez = b[1] - uz * insB;
    if (Math.hypot(ex - sx, ez - sz) > 0.05) {
      const mat = alongX ? M.lv13_plank_v : M.lv13_plank_h;
      cbox(zb, Math.min(sx, ex) - (alongX ? 0 : HW), DECK - 0.13, Math.min(sz, ez) - (alongX ? HW : 0), Math.max(sx, ex) + (alongX ? 0 : HW), DECK, Math.max(sz, ez) + (alongX ? HW : 0), mat);
    }
    // corner squares
    if (!last) cbox(zb, b[0] - HW, DECK - 0.13, b[1] - HW, b[0] + HW, DECK, b[1] + HW, M.lv13_plank_h);
    // posts and rails
    const px = -uz, pz = ux;     // sideways
    const phase = 0.5 + (i * 0.7) % 1.2;
    for (let s = phase; s < len - 0.2; s += 2.8) {
      const cx = a[0] + ux * s, cz = a[1] + uz * s;
      for (const side of [-1, 1]) {
        const x = cx + px * side * (HW - 0.1), z = cz + pz * side * (HW - 0.1);
        if (!owns(zb, x, z)) continue;
        const bed = hf(x, z);
        const top = DECK + (path.rail ? 0.95 : 0);
        zb.box(x - 0.07, bed - 0.12, z - 0.07, x + 0.07, top, z + 0.07, M.lv13_post, { collide: path.rail === true });
        if (path.rail && s > phase + 0.1 && side === -1 && path.lamps && (Math.floor(s / 2.8) % 2 === 1)) lamp(zb, x, z, top + 0.05, hr(Math.floor(x), Math.floor(z), 31) > 0.16, hr(Math.floor(x), Math.floor(z), 32) < 0.1);
      }
    }
    if (path.rail) {
      for (const side of [-1, 1]) for (const hh of [0.5, 0.95]) {
        const x0 = a[0] + ux * insA + px * side * (HW - 0.1), z0 = a[1] + uz * insA + pz * side * (HW - 0.1);
        const x1 = b[0] - ux * insB + px * side * (HW - 0.1), z1 = b[1] - uz * insB + pz * side * (HW - 0.1);
        cbox(zb, Math.min(x0, x1) - 0.03, DECK + hh - 0.04, Math.min(z0, z1) - 0.03, Math.max(x0, x1) + 0.03, DECK + hh + 0.03, Math.max(z0, z1) + 0.03, M.lv13_post, { collide: false });
      }
    }
  }
  // the dead end
  if (path.cut) {
    const n = pts.length, a = pts[n - 2], b = pts[n - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    if (owns(zb, b[0], b[1])) zb.prop('lv13_endcap', b[0], 0, b[1], Math.atan2(dx / len, -dz / len), {});
  }
  void rng;
}

function platform(zb, cx, cz, rail) {
  cbox(zb, cx - PLAT, DECK - 0.13, cz - PLAT, cx + PLAT, DECK, cz + PLAT, M.lv13_plank_h);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (PLAT - 0.12), z = cz + sz * (PLAT - 0.12);
    if (owns(zb, x, z)) zb.box(x - 0.09, hf(x, z) - 0.12, z - 0.09, x + 0.09, DECK + (rail ? 1.0 : 0), z + 0.09, M.lv13_post, { collide: rail });
  }
  if (rail) lamp(zb, cx - PLAT + 0.12, cz + PLAT - 0.12, DECK + 1.05, true, false);
}

// ------------------------------------------------------------------ zone
function gen(zb) {
  zb.noConnectivity = true;
  const zx = Math.floor(zb.x0 / Z), zz = Math.floor(zb.z0 / Z);
  const rng = zb.rng;
  terrainGrid(zb, hf, (x, z, h, shade) => {
    const mosses = h > WY + 0.1;
    return (mosses ? MOSS : MUD)[shadeIdx(clamp(shade + (noise(x, z, 7, 4) - 0.5) * 0.4, 0, 0.999))];
  }, [0.7, 0.7], 1.6);
  water(zb, zb.x0, zb.z0, zb.x1, zb.z1, WY, M.lv13_water, 0.84, { sub: 4 });

  // ---- the walkway network of this zone
  const ports = [];
  const nS = portS(zx, zz - 1), nE = portE(zx - 1, zz), sS = portS(zx, zz), eE = portE(zx, zz);
  if (has(nS)) ports.push({ side: 'N', at: [nS, zb.z0], main: mainS(zx, zz - 1) });
  if (has(nE)) ports.push({ side: 'W', at: [zb.x0, nE] });
  if (has(sS)) ports.push({ side: 'S', at: [sS, zb.z1], main: mainS(zx, zz) });
  if (has(eE)) ports.push({ side: 'E', at: [zb.x1, eE] });
  const entry = zx === 0 && zz === 0;
  let hub = [zb.x0 + rng.range(11, 21), zb.z0 + rng.range(11, 21)];
  const mainZone = ports.some((p) => p.main);
  if (mainZone) hub[0] = EX;
  if (entry) hub = [EX, EZ];
  const paths = [];
  for (const po of ports) {
    let pts = dedupe(route(rng, po.at, po.side, hub, zb));
    const total = length(pts);
    let cut = false, hubEnd = true;
    if (!po.main && !entry && rng.chance(0.34) && total > 9) {
      pts = truncate(pts, Math.max(4, total * rng.range(0.3, 0.8)));
      cut = true; hubEnd = false;
    }
    if (pts.length < 2) continue;
    paths.push({ pts, cut, hub: hubEnd, rail: po.main || entry || rng.chance(0.5), lamps: true, main: po.main });
  }
  // a branch off some walkway: a short stub ending on a small platform or in the water
  const stubs = [];
  if (paths.length && rng.chance(0.55)) {
    const base = rng.pick(paths);
    if (base.pts.length > 1) {
      const i = rng.int(0, base.pts.length - 2), a = base.pts[i], b = base.pts[i + 1], t = rng.range(0.3, 0.7);
      const sx = lerp(a[0], b[0], t), sz = lerp(a[1], b[1], t);
      const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), dir = rng.chance(0.5) ? 1 : -1, len = rng.range(5, 11);
      const end = alongX ? [sx, sz + dir * len] : [sx + dir * len, sz];
      if (end[0] > zb.x0 + 4 && end[0] < zb.x1 - 4 && end[1] > zb.z0 + 4 && end[1] < zb.z1 - 4) {
        const pts = [[sx, sz], end];
        const plat = rng.chance(0.6);
        stubs.push({ pts: [[sx, sz], plat ? [alongX ? end[0] : end[0] - dir * PLAT, alongX ? end[1] - dir * PLAT : end[1]] : end], cut: !plat, hub: false, rail: base.rail, lamps: false, plat, end, startInside: true });
        void pts;
      }
    }
  }
  // a lone deck out in the water when nothing else is here
  const lone = !paths.length && !entry && rng.chance(0.6);
  const all = [...paths, ...stubs];

  for (const pa of all) drawPath(zb, pa, rng);
  if (paths.length || entry) platform(zb, hub[0], hub[1], rng.chance(0.6) || entry);
  const sp = stubs.find((s) => s.plat);
  if (sp) platform(zb, sp.end[0], sp.end[1], true);
  let loneAt = null;
  if (lone) { loneAt = [zb.x0 + rng.range(10, 22), zb.z0 + rng.range(10, 22)]; platform(zb, loneAt[0], loneAt[1], rng.chance(0.5)); }

  // ---- the door (by hash, so it does not depend on the layout, only where it stands)
  if (hr(zx, zz, 91) < 0.34 && !entry) {
    const spot = sp ? sp.end : loneAt || (paths.length ? hub : null);
    if (spot) {
      const dxz = sp || loneAt ? [0, 0] : [1.2, 1.2];
      const rot = sp ? (sp.pts[0][0] === sp.pts[1][0] ? (sp.pts[1][1] > sp.pts[0][1] ? 0 : Math.PI) : (sp.pts[1][0] > sp.pts[0][0] ? -Math.PI / 2 : Math.PI / 2)) : Math.PI * 0.75;
      if (sp) { const e = sp.end, a = sp.pts[0]; const ux = Math.sign(e[0] - a[0]), uz = Math.sign(e[1] - a[1]); levelDoor(zb, e[0] + ux * 1.1, e[1] + uz * 1.1, rot, { y: DECK }); }
      else levelDoor(zb, spot[0] + dxz[0], spot[1] + dxz[1], rot, { y: DECK });
    }
  }

  // ---- the bog itself
  const clear = (x, z, m = 1.4) => !nearPath(all, x, z, HW + m) && !(paths.length && Math.hypot(x - hub[0], z - hub[1]) < PLAT + m) && !(sp && Math.hypot(x - sp.end[0], z - sp.end[1]) < PLAT + m) && !(loneAt && Math.hypot(x - loneAt[0], z - loneAt[1]) < PLAT + m);
  const nearPort = (x, z) => ports.some((po) => Math.hypot(x - po.at[0], z - po.at[1]) < 4.5);
  scatter(zb, 2.9, 11, (x, z, i, j, u, v) => {
    const h = hf(x, z);
    if (u > 0.55 || h < WY - 0.5 || !clear(x, z) || nearPort(x, z) || (entry && Math.hypot(x - EX, z - EZ) < 9)) return;
    zb.prop('lv13_reed', x, h - 0.05, z, 0, { h: 1.1 + v * 1.1 });
  });
  scatter(zb, 11, 21, (x, z, i, j, u, v) => {
    if (u > 0.58 || !clear(x, z, 2.6) || nearPort(x, z) || (entry && Math.hypot(x - EX, z - EZ) < 11)) return;
    zb.prop('lv13_tree', x, hf(x, z) - 0.05, z, v * 6.28, { h: 5 + v * 5 });
  });
  scatter(zb, 13, 31, (x, z, i, j, u, v) => {
    const h = hf(x, z);
    if (u > 0.5 || h < WY + 0.15 || !clear(x, z, 1.8)) return;
    zb.prop('lv13_fungus', x, h - 0.03, z, v * 6.28, {});
  });
  scatter(zb, 17, 41, (x, z, i, j, u, v) => {
    if (u > 0.35 || !clear(x, z, 1.8) || nearPort(x, z)) return;
    zb.prop('lv13_log', x, WY - 0.2, z, v * 3.14, { len: 2.5 + u * 4 });
  });
  // colossal trunks, by hand around the door and scattered farther out
  for (const [gx, gz, R, H] of [[EX - 14, EZ - 40, 3.0, 50], [EX + 17, EZ - 52, 3.6, 60], [EX - 27, EZ - 9, 2.6, 48]]) {
    if (owns(zb, gx, gz)) zb.prop('lv13_giant', gx, hf(gx, gz) - 0.8, gz, 0, { r: R, h: H });
  }
  scatter(zb, 96, 51, (x, z, i, j, u) => {
    if (u > 0.55 || Math.hypot(x - EX, z - EZ) < 50 || !clear(x, z, 4)) return;
    zb.prop('lv13_giant', x, hf(x, z) - 0.8, z, 0, { r: 2.4 + u * 3, h: 44 + u * 30 });
  });
  // boards that creak: an emitter at the junction
  if (paths.length) zb.emitter(hub[0], DECK, hub[1], 'lv13_creak', { vol: 0.7, rad: 16 });
  void blades;
}

defineZone('lv13_bog', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.72, 0.58, 0.82],
    mutable: true,
    env: env({ fog: [0.25, 0.15, 0.33], fogNear: 2, fogFar: 38, hum: 0, hvac: 0, reverb: 'outdoor', tone: 'lv13_bog' }),
  }),
  gen,
});

defineLevel(N, {
  name: "BARNEY'S BOG",
  zoneType: 'lv13_bog',
  zoneSize: Z,
  entry: { x: EX, y: DECK, z: EZ, yaw: 0 },
  doorDensity: 0,
  viewRadius: 4,
  grade: { sat: 0.95, tint: [1.1, 0.92, 1.2] },
  sky: {
    top: [0.08, 0.04, 0.16], horizon: [0.25, 0.15, 0.33], ground: [0.14, 0.08, 0.2], curve: 0.5,
    sun: { dir: [-0.28, 0.24, -1], color: [0.7, 0.96, 0.6], size: 0.06, halo: 0.4 },
    stars: 0.5,
    clouds: { layer: 'lv13_clouds', color: [0.32, 0.17, 0.4], amount: 0.75, speed: 0.003, scale: 0.4 },
    band: { layer: 'lv13_band', color: [0.22, 0.13, 0.3], repeat: 3, top: 0.75, bottom: -0.03, fog: 0.5 },
  },
  light: { phoneRadius: 4, phoneIntensity: 0.22 },
  // now and then, far off, boards settle: some walkway has moved
  script(ctx, dt) {
    noEvents(ctx);
    const s = ctx.state, p = ctx.player;
    s.t = (s.t ?? 25) - dt;
    if (s.t > 0) return;
    s.t = 30 + Math.random() * 60;
    const a = Math.random() * 6.283, d = 14 + Math.random() * 20;
    ctx.game.audioCall('play', 'lv13_settle', p.x + Math.sin(a) * d, p.y, p.z - Math.cos(a) * d, { distant: d > 22, vol: 0.9 });
  },
});
