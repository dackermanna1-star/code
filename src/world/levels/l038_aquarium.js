// Level 38: The Aquarium. Dark, tall corridors between tanks as big as halls. The tanks hold no
// water, yet their walls ripple with blue light, the sand floor shimmers and weed sways in a
// current that is not there. Some corridors run straight through a tank in a glass tube.
// Endless: 64 m blocks, corridors on the block lines, a tank (or a pump hall) in each block.
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M, CF } from './kit.js';
import { glowMat, animMaterial, animKeep, mixc, mulc, TAU } from './g07_kit.js';

const N = 38;
const P = 64, CW = 3, CH = 7, TOP = 14, SAND = -0.4, WT = 0.6;

// ------------------------------------------------------------------ textures
defineTexture('lv38_tile', (p) => {
  p.fill([38, 66, 74]); p.noise(5, 0.12, 3);
  for (let k = 0; k < 64; k += 16) { p.rect(k, 0, 1, 64, [20, 38, 46], 0.9); p.rect(0, k, 64, 1, [20, 38, 46], 0.9); }
  for (let i = 0; i < 7; i++) p.drip(5 + i * 9, 0, 20 + (i * 13) % 40, [22, 40, 44], 0.35, 2);
  p.rect(0, 52, 64, 12, [66, 84, 84], 0.18); p.speckle(80, [90, 108, 106], 0.2, 0.5);
}, 12);
defineTexture('lv38_kick', (p) => { p.fill([48, 62, 68]); p.noise(5, 0.12, 3); p.rect(0, 0, 64, 3, [30, 42, 48]); p.speckle(80, [74, 90, 92], 0.2, 0.5); }, 8);
defineTexture('lv38_floor', (p) => {
  p.fill([26, 38, 44]); p.noise(6, 0.1, 3);
  for (let k = 0; k < 64; k += 32) { p.rect(k, 0, 1, 64, [14, 22, 28], 0.9); p.rect(0, k, 64, 1, [14, 22, 28], 0.9); }
  p.rect(6, 6, 18, 2, [60, 100, 110], 0.25); p.rect(38, 40, 20, 2, [60, 100, 110], 0.25); p.speckle(100, [60, 78, 84], 0.2, 0.5);
}, 8);
defineTexture('lv38_ceil', (p) => {
  p.fill([22, 30, 36]); p.noise(5, 0.1, 3);
  for (let k = 0; k < 64; k += 32) { p.rect(k, 0, 2, 64, [12, 18, 22]); p.rect(0, k, 64, 2, [12, 18, 22]); }
  p.speckle(60, [40, 52, 58], 0.2, 0.5);
}, 8);
// caustics: the zero lines of the difference of two noise fields, shifted a little per frame
function caustic(p, f, base, line, thr, seed = 0) {
  p.map((x, y) => {
    const a = pnoise(x, y + f * 8, 5, 11 + seed), b = pnoise(x + f * 6, y, 5, 29 + seed), c = pnoise(x, y, 3, 5 + seed);
    const t = Math.max(0, 1 - Math.abs(a - b) / thr);
    const bb = mulc(base, 0.65 + 0.7 * c);
    return mixc(bb, line, t * t);
  });
}
animMaterial('lv38_cw', 'lv38_cw', (p, f) => caustic(p, f, [14, 66, 100], [150, 238, 255], 0.085), { su: 6, sv: 6, glow: 0.85, chan: 9, flags: VF.SCROLL | VF.WOBBLE, surf: 'tile' });
animMaterial('lv38_cf', 'lv38_cf', (p, f) => {
  p.fill([150, 168, 156]); p.noise(6, 0.12, 3);
  p.speckle(200, [196, 210, 198], 0.3, 0.6); p.speckle(120, [96, 112, 104], 0.3, 0.6);
  caustic(p, f, [70, 110, 116], [200, 250, 255], 0.07, 3);
  // blend the sand back in
}, { su: 6, sv: 6, glow: 0.8, chan: 10, flags: VF.SCROLL, surf: 'concrete' });
animMaterial('lv38_cs', 'lv38_cs', (p, f) => caustic(p, f, [60, 150, 190], [235, 255, 255], 0.1, 7), { su: 8, sv: 8, glow: 1.2, chan: 10, flags: VF.SCROLL | VF.WOBBLE, surf: 'tile' });
// moving light on the corridor floor: only the bright lines, the rest cut away
animMaterial('lv38_cdec', 'lv38_cd', (p, f) => {
  p.fill([170, 240, 255]); p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = pnoise(x, y + f * 8, 4, 41), b = pnoise(x + f * 6, y, 4, 57);
    const edge = Math.min(x, 63 - x, y, 63 - y) / 14;
    if (Math.abs(a - b) < 0.05 * Math.min(1, edge)) p.alpha(x, y, 255);
  }
}, { s: 1, glow: 0.6, chan: 9, colors: 4 });
defineTexture('lv38_glass', (p) => {
  p.fill([188, 224, 236]); p.noise(5, 0.08, 2);
  for (let i = 0; i < 6; i++) p.rect(6 + i * 10, 0, 1, 64, [236, 248, 255], 0.4);
  p.line(4, 50, 40, 8, [240, 250, 255], 0.5); p.line(20, 60, 58, 30, [240, 250, 255], 0.35);
  p.rect(0, 52, 64, 12, [120, 150, 150], 0.35); p.speckle(40, [250, 255, 255], 0.3, 0.6);
}, 10);
defineTexture('lv38_rock', (p) => { p.fill([70, 92, 108]); p.noise(4, 0.2, 3); p.speckle(120, [110, 134, 150], 0.3, 0.6); p.speckle(80, [38, 52, 66], 0.3, 0.7); }, 10);
defineTexture('lv38_bone', (p) => { p.fill([226, 232, 232]); p.noise(4, 0.1, 3); p.speckle(80, [170, 184, 188], 0.3, 0.6); p.rect(0, 0, 64, 3, [250, 252, 252]); }, 8);
defineTexture('lv38_kelp', (p) => {
  p.fill([40, 120, 84]); p.clearAlpha(0);
  for (let s = 0; s < 4; s++) {
    let x = 8 + s * 16;
    for (let y = 63; y >= 0; y--) {
      x += Math.sin(y * 0.2 + s * 2) * 0.5;
      p.rectA(Math.round(x) - 1, y, 3, 1, 255);
      if (y % 9 === 3) { p.rectA(Math.round(x) + 2, y, 5, 3, 255); p.rectA(Math.round(x) - 6, y - 4, 5, 3, 255); }
    }
  }
  p.map((x, y, c) => [c[0] * (0.7 + 0.5 * (y / 64)), c[1] * (0.7 + 0.5 * (y / 64)), c[2]]);
}, 8);
defineTexture('lv38_grate', (p) => { p.fill([34, 46, 52]); for (let k = 0; k < 64; k += 8) { p.rect(k, 0, 5, 64, [76, 92, 98]); p.rect(0, k, 64, 2, [20, 28, 32]); } }, 8);
defineTexture('lv38_metal', (p) => { p.fill([52, 66, 72]); p.noise(5, 0.12, 2); p.rect(0, 0, 64, 2, [96, 112, 118]); p.speckle(60, [30, 40, 44], 0.3, 0.6); }, 8);
defineTexture('lv38_pump', (p) => {
  p.fill([62, 90, 86]); p.noise(4, 0.1, 2);
  p.rect(6, 8, 52, 20, [40, 62, 60]); p.disc(32, 18, 7, [20, 34, 34]); p.disc(32, 18, 3, [150, 200, 190]);
  p.rect(6, 36, 52, 3, [34, 50, 50]); p.rect(6, 46, 52, 3, [34, 50, 50]); p.rect(48, 52, 8, 4, [220, 60, 40]);
}, 12);
const SIGNS = [['KELP', 'FOREST'], ['OPEN', 'OCEAN'], ['THE', 'DEEP'], ['CORAL', 'REEF'], ['TIDE', 'POOL'], ['NO', 'FLASH']];
SIGNS.forEach((l, i) => defineTexture('lv38_sign' + i, signTex(l, [18, 70, 82], [190, 240, 240], 1), 8));

// ------------------------------------------------------------------ materials
defineMaterial('lv38_tile', 'lv38_tile', { s: 3, surf: 'tile', stain: 0.1 });
defineMaterial('lv38_kick', 'lv38_kick', { s: 3, surf: 'concrete' });
defineMaterial('lv38_floor', 'lv38_floor', { s: 2, surf: 'wet' });
defineMaterial('lv38_ceil', 'lv38_ceil', { s: 3, surf: 'drywall' });
glowMat('lv38_glass', 'lv38_glass', 0.55, { s: 3, surf: 'tile' });
glowMat('lv38_rockm', 'lv38_rock', 0.62, { s: 1.5, surf: 'concrete', chan: 9 });
glowMat('lv38_bonem', 'lv38_bone', 0.8, { s: 1.5, surf: 'concrete', chan: 10 });
defineMaterial('lv38_grate', 'lv38_grate', { s: 1, surf: 'metal' });
defineMaterial('lv38_metal', 'lv38_metal', { s: 1.5, surf: 'metal' });
defineMaterial('lv38_pump', 'lv38_pump', { s: 4, surf: 'metal' });

// ------------------------------------------------------------------ props (all lit by the tank)
defineProp('lv38_rock', {
  build(mb, p, r) {
    const n = 3 + Math.floor(r.next() * 3), st = S('lv38_rockm');
    let w = p.opts.w || 3;
    for (let k = 0; k < n; k++) {
      const x = r.range(-w * 0.4, w * 0.4), z = r.range(-w * 0.4, w * 0.4), s = r.range(0.5, 1) * w * (1 - k * 0.12), h = r.range(0.6, 1.4) * w * (1 - k * 0.15);
      mb.box(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, st);
    }
  },
  boxes: (p) => [[-(p.opts.w || 3) * 0.5, 0, -(p.opts.w || 3) * 0.5, (p.opts.w || 3) * 0.5, (p.opts.w || 3) * 1.1, (p.opts.w || 3) * 0.5]],
});
defineProp('lv38_coral', {
  build(mb, p, r) {
    const st = S('lv38_bonem');
    const branch = (x, y, z, h, w, d) => {
      mb.box(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2, st);
      if (d <= 0) return;
      for (const s of [-1, 1]) branch(x + s * w * 1.2 + r.range(-0.1, 0.1), y + h * 0.7, z + r.range(-0.4, 0.4), h * 0.6, w * 0.7, d - 1);
    };
    branch(0, 0, 0, p.opts.h || 1.8, 0.45, 2);
  },
  boxes: [[-0.6, 0, -0.6, 0.6, 1.5, 0.6]],
});
defineProp('lv38_kelp', {
  build(mb, p, r) {
    const h = p.opts.h || 7, st = T('lv38_kelp', { flags: VF.FULLBRIGHT | VF.SWAY, lit: false, color: [0.08, 0.08, 0.08], flk: [0.62, 0.62, 0.62], chan: 10 });
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + r.range(0, 0.5), c = Math.cos(a) * 1.0, s = Math.sin(a) * 1.0;
      mb.card([-c, 0, -s, c, 0, s, c, h, s, -c, h, -s], [s, 0, -c], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});
defineProp('lv38_ruin', {
  build(mb, p, r) {
    const st = S('lv38_bonem');
    for (let k = 0; k < 4; k++) {
      const x = k * 3.2 - 4.8, h = r.range(2, 6.5);
      mb.cyl(x, 0, r.range(-0.5, 0.5), 0.55, h, 8, st, 1);
      mb.box(x - 0.8, 0, -0.8, x + 0.8, 0.4, 0.8, st);
      if (r.chance(0.5)) mb.box(x - 1.0, h, -0.7, x + 1.0, h + 0.5, 0.7, st);
    }
    mb.box(-6, 0, 1.6, -3.6, 0.9, 2.5, st); mb.box(2, 0, -2.4, 4.2, 0.7, -1.5, st);
  },
  boxes: [[-5.4, 0, -1, 5.4, 4, 1]],
});
defineProp('lv38_pump', {
  build(mb, p) {
    const m = S('lv38_pump'), st = S('lv38_metal');
    mb.box(-1.2, 0, -0.8, 1.2, 2.2, 0.8, [m, m, st, null, m, m], { uv: ['fit', 'fit', 'world', 'world', 'fit', 'fit'] });
    mb.cyl(1.9, 0, 0, 0.35, 3.2, 8, st, 1); mb.cyl(-1.9, 0, 0, 0.35, 4.6, 8, st, 1);
    mb.rod(1.9, 3.2, 0, -1.9, 4.6, 0, 0.18, 6, st);
  },
  boxes: [[-2.3, 0, -0.9, 2.3, 2.3, 0.9]],
  emitter: { snd: 'lv38_pump', y: 1.2, vol: 0.9, rad: 24 },
});

// ------------------------------------------------------------------ the zone
const sideRect = {
  W: (b, t0, t1, a0, a1) => [b.x0 + a0, b.z0 + t0, b.x0 + a1, b.z0 + t1],
  E: (b, t0, t1, a0, a1) => [b.x1 - a1, b.z0 + t0, b.x1 - a0, b.z0 + t1],
  N: (b, t0, t1, a0, a1) => [b.x0 + t0, b.z0 + a0, b.x0 + t1, b.z0 + a1],
  S: (b, t0, t1, a0, a1) => [b.x0 + t0, b.z1 - a1, b.x1 - (b.x1 - b.x0 - t1), b.z1 - a0],
};
// materials of a wall box seen from the side: [+x, -x, +y, -y, +z, -z] with inner/outer on the right faces
function wallMats(side, inner, outer, end) {
  const m = [null, null, null, null, null, null];
  if (side === 'W') { m[0] = inner; m[1] = outer; m[4] = end; m[5] = end; }
  else if (side === 'E') { m[0] = outer; m[1] = inner; m[4] = end; m[5] = end; }
  else if (side === 'N') { m[4] = inner; m[5] = outer; m[0] = end; m[1] = end; }
  else { m[4] = outer; m[5] = inner; m[0] = end; m[1] = end; }
  return m;
}

function tankSide(zb, b, side, back, gap, bi, bj, k) {
  const L = b.x1 - b.x0, secN = 3, sw = L / secN;
  const R = (t0, t1, a0, a1) => sideRect[side](b, t0, t1, a0, a1);
  const box = (t0, t1, a0, a1, y0, y1, mats, o = {}) => { const r = R(t0, t1, a0, a1); zb.box(r[0], y0, r[1], r[2], y1, r[3], mats, { sub: 4, ...o }); };
  const solid = wallMats(side, M.lv38_cw, M.lv38_tile, M.lv38_tile);
  // the part above the corridor ceiling: solid all along
  box(0, L, 0, WT, CH, TOP, solid);
  // the part under it, section by section
  const specs = [];
  for (let s = 0; s < secN; s++) {
    const t0 = s * sw, t1 = (s + 1) * sw;
    const glass = !back && (s === 1 || hr(bi * 7 + k, bj * 3 + s, 38) < 0.7);
    specs.push([t0, t1, glass]);
  }
  for (const [t0, t1, glass] of specs) {
    // a gap in the wall (the mouth of a tube) cuts through the section
    const cuts = gap ? [[gap[0], gap[1]]] : [];
    let ranges = [[t0, t1]];
    for (const [c0, c1] of cuts) ranges = ranges.flatMap(([a, c]) => (c1 <= a || c0 >= c ? [[a, c]] : [[a, Math.max(a, c0)], [Math.min(c, c1), c]].filter(([u, v]) => v - u > 0.01)));
    if (!glass || gap) {
      for (const [a, c] of ranges) box(a, c, 0, WT, -0.6, CH, solid);
      if (gap && gap[0] >= t0 && gap[1] <= t1) box(gap[0], gap[1], 0, WT, 3.7, CH, solid);
      continue;
    }
    box(t0, t0 + 0.7, 0, WT, -0.6, CH, solid); box(t1 - 0.7, t1, 0, WT, -0.6, CH, solid);       // pillars
    box(t0 + 0.7, t1 - 0.7, 0, WT, -0.6, 0.7, wallMats(side, M.lv38_cw, M.lv38_kick, M.lv38_kick));   // the kick under the glass
    box(t0 + 0.7, t1 - 0.7, WT / 2 - 0.06, WT / 2 + 0.06, 0.7, CH, wallMats(side, M.lv38_glass, M.lv38_glass, null), { alpha: 0.2, sub: 8 });
    const tm = (t0 + t1) / 2;
    // light from the tank spills into the corridor, and moves on the floor
    const c = side === 'W' ? [b.x0 - 1.4, zb.z0 + (b.z0 - zb.z0) + tm] : side === 'E' ? [b.x1 + 1.4, b.z0 + tm] : side === 'N' ? [b.x0 + tm, b.z0 - 1.4] : [b.x0 + tm, b.z1 + 1.4];
    const horiz = side === 'W' || side === 'E';
    for (const o of [-5, 5]) {
      const lx = horiz ? c[0] : c[0] + o, lz = horiz ? c[1] + o : c[1];
      if (owns(zb, lx, lz)) zb.light(lx, 3.4, lz, { color: [0.25, 0.65, 1.0], rad: 10, int: 0.95, ch: 9 + ((s_(t0) + k) % 2) });
    }
    if (owns(zb, c[0], c[1])) zb.decal(c[0], 0, c[1], 'up', horiz ? 5 : 11, horiz ? 11 : 5, 'lv38_cd0', { lit: false, glow: 0.5, ch: 10, flags: VF.ANIM | VF.SCROLL });
  }
}
const s_ = (t) => Math.floor(t) & 1;

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  const bi = Math.round(x0 / P), bj = Math.round(z0 / P);
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(CF.VOID);
  zb.noConnectivity = true;
  const b = { x0: x0 + CW, z0: z0 + CW, x1: x1 - CW, z1: z1 - CW };
  const kind = (bi === 0 && bj === 0) ? 0 : (() => { const u = hr(bi, bj, 3); return u < 0.18 ? 2 : u < 0.4 ? 1 : 0; })();
  // corridors: the four half corridors around the block
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const corr = x < b.x0 || x >= b.x1 || z < b.z0 || z >= b.z1;
    const hall = kind === 2;
    if (!corr && !hall) return;
    zb.floor[i] = 0; zb.ceil[i] = CH; zb.flags[i] = 0;
    zb.fmat[i] = M.lv38_floor; zb.cmat[i] = M.lv38_ceil; zb.wmat[i] = M.lv38_tile;
  });
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const back = (bi === 0 && bj === 0) ? 'E' : ['W', 'E', 'N', 'S'][Math.floor(hr(bi, bj, 4) * 4)];
  const tubeX = hr(bi, bj, 5) < 0.5;
  if (kind !== 2) {
    // the tank: sand, a luminous ceiling, walls with windows
    zb.box(b.x0, -1.2, b.z0, b.x1, SAND, b.z1, [null, null, M.lv38_cf, null, null, null], { sub: 7 });
    zb.box(b.x0, TOP, b.z0, b.x1, TOP + 0.5, b.z1, [null, null, null, M.lv38_cs, null, null], { sub: 7 });
    const half = 2.3;
    for (const side of ['W', 'E', 'N', 'S']) {
      let gap = null;
      if (kind === 1 && ((tubeX && (side === 'W' || side === 'E')) || (!tubeX && (side === 'N' || side === 'S')))) gap = tubeX ? [cz - b.z0 - half, cz - b.z0 + half] : [cx - b.x0 - half, cx - b.x0 + half];
      tankSide(zb, b, side, side === back, gap, bi, bj, side.charCodeAt(0));
    }
    seabed(zb, b, bi, bj, kind === 1, tubeX);
    if (kind === 1) tube(zb, b, tubeX, cx, cz);
  } else {
    hall(zb, b, bi, bj, cx, cz);
  }
  corridorDoors(zb, x0, z0, x1, z1, b, bi, bj);
  animKeep(zb, 'lv38_cw', 'lv38_cf', 'lv38_cs', 'lv38_cdec');
}

// the sea floor: ruins, rocks, bleached coral, weed. Everything is lit by the tank itself.
function seabed(zb, b, bi, bj, tube, tubeX) {
  const nrm = (v) => v;
  // ruined columns, a few big rocks
  const ru = 1 + Math.floor(hr(bi, bj, 20) * 3);
  for (let k = 0; k < ru; k++) {
    const x = b.x0 + 14 + hr(bi, bj, 21 + k) * (b.x1 - b.x0 - 28), z = b.z0 + 14 + hr(bi, bj, 31 + k) * (b.z1 - b.z0 - 28);
    if (tube && (tubeX ? Math.abs(z - (b.z0 + b.z1) / 2) < 9 : Math.abs(x - (b.x0 + b.x1) / 2) < 9)) continue;
    zb.prop('lv38_ruin', x, SAND, z, Math.floor(hr(bi * 3 + k, bj, 22) * 4) * Math.PI / 2, {});
  }
  for (let k = 0; k < 26; k++) {
    const x = b.x0 + 3 + hr(bi, bj, 40 + k) * (b.x1 - b.x0 - 6), z = b.z0 + 3 + hr(bi, bj, 80 + k) * (b.z1 - b.z0 - 6);
    if (tube && (tubeX ? Math.abs(z - (b.z0 + b.z1) / 2) < 3.4 : Math.abs(x - (b.x0 + b.x1) / 2) < 3.4)) continue;
    const u = hr(bi * 5 + k, bj, 120);
    if (u < 0.3) zb.prop('lv38_rock', x, SAND, z, hr(k, bi, 130) * 6.28, { w: 2 + hr(k, bj, 131) * 5 });
    else if (u < 0.6) zb.prop('lv38_coral', x, SAND, z, hr(k, bi, 132) * 6.28, { h: 1.2 + hr(k, bj, 133) * 1.8 });
    else zb.prop('lv38_kelp', x, SAND, z, hr(k, bi, 134) * 6.28, { h: 4 + hr(k, bj, 135) * 8 });
  }
  void nrm;
}

// a glass tube through the tank, joining two corridors
function tube(zb, b, tubeX, cx, cz) {
  const hw = 2.2, hgt = 3.5;
  const R = (u0, u1, v0, v1) => (tubeX ? [b.x0 + u0, cz - hw + v0, b.x0 + u1, cz - hw + v1] : [cx - hw + v0, b.z0 + u0, cx - hw + v1, b.z0 + u1]);
  const len = tubeX ? b.x1 - b.x0 : b.z1 - b.z0;
  const put = (u0, u1, v0, v1, y0, y1, m, o = {}) => { const r = R(u0, u1, v0, v1); zb.box(r[0], y0, r[1], r[2], y1, r[3], m, { sub: 4, ...o }); };
  put(0, len, 0, 2 * hw, -0.3, 0, [null, null, M.lv38_grate, M.lv38_metal, null, null]);
  const gm = tubeX ? [null, null, null, null, M.lv38_glass, M.lv38_glass] : [M.lv38_glass, M.lv38_glass, null, null, null, null];
  put(0, len, -0.06, 0.06, 0, hgt, gm, { alpha: 0.2, sub: 8 }); put(0, len, 2 * hw - 0.06, 2 * hw + 0.06, 0, hgt, gm, { alpha: 0.2, sub: 8 });
  put(0, len, 0, 2 * hw, hgt, hgt + 0.1, [null, null, M.lv38_glass, M.lv38_glass, null, null], { alpha: 0.2, sub: 8 });
  for (let u = 3; u < len; u += 6) {
    put(u - 0.2, u + 0.2, -0.15, 0.15, 0, hgt + 0.2, M.lv38_metal, { sub: 0 }); put(u - 0.2, u + 0.2, 2 * hw - 0.15, 2 * hw + 0.15, 0, hgt + 0.2, M.lv38_metal, { sub: 0 });
    put(u - 0.2, u + 0.2, -0.15, 2 * hw + 0.15, hgt, hgt + 0.3, M.lv38_metal, { sub: 0, collide: false });
    const lx = tubeX ? b.x0 + u : cx, lz = tubeX ? cz : b.z0 + u;
    zb.light(lx, 3.0, lz, { color: [0.3, 0.7, 1.0], rad: 8, int: 0.8, ch: 9 + (Math.floor(u / 6) & 1) });
  }
}

// a pump hall: a dry plinth in blue light with the machinery that feeds the tanks
function hall(zb, b, bi, bj, cx, cz) {
  const tile = M.lv38_tile;
  const L = b.x1 - b.x0;
  const gaps = [[L / 2 - 3, L / 2 + 3]];
  for (const side of ['W', 'E', 'N', 'S']) {
    const R = (t0, t1, a0, a1) => sideRect[side](b, t0, t1, a0, a1);
    const m = wallMats(side, tile, tile, tile);
    for (const [t0, t1] of [[0, gaps[0][0]], [gaps[0][1], L]]) { const r = R(t0, t1, 0, WT); zb.box(r[0], 0, r[1], r[2], CH, r[3], m, { sub: 4 }); }
    const r = R(gaps[0][0], gaps[0][1], 0, WT); zb.box(r[0], 3.4, r[1], r[2], CH, r[3], m, { sub: 4 });
  }
  cbox(zb, cx - 9, 0, cz - 9, cx + 9, 0.4, cz + 9, M.lv38_kick, { sub: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(zb, cx + sx * 12 - 0.5, 0, cz + sz * 12 - 0.5, cx + sx * 12 + 0.5, CH, cz + sz * 12 + 0.5, M.lv38_tile, { sub: 3 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3;
    zb.prop('lv38_pump', cx + Math.cos(a) * 18, 0, cz + Math.sin(a) * 18, a + Math.PI / 2, {});
  }
  zb.light(cx, 3.0, cz, { color: [0.3, 0.7, 1.0], rad: 10, int: 1.0, ch: 9 });
  zb.light(cx + 6, 3.0, cz + 6, { color: [0.3, 0.8, 0.9], rad: 8, int: 0.7, ch: 10 });
  levelDoor(zb, cx, cz - 3, 0, { y: 0.4 });
  zb.decal(cx, 0.4, cz, 'up', 12, 12, 'lv38_cd0', { lit: false, glow: 0.5, ch: 10, flags: VF.ANIM | VF.SCROLL });
}

// level doors stand in the corridors and at corners
function corridorDoors(zb, x0, z0, x1, z1, b, bi, bj) {
  if (hr(bi, bj, 60) < 0.7) {
    const alongX = hr(bi, bj, 61) < 0.5, t = 14 + hr(bi, bj, 62) * 36;
    if (alongX) levelDoor(zb, x0 + t, z0 + 0.9, Math.PI);
    else levelDoor(zb, x0 + 0.9, z0 + t, -Math.PI / 2);
  }
  if (hr(bi, bj, 63) < 0.4) levelDoor(zb, x1 - 1.0, z1 - 14 - hr(bi, bj, 64) * 30, Math.PI / 2);
  // a bench and a sign now and then
  if (hr(bi, bj, 65) < 0.8) zb.prop('bench', x0 + 1.2, 0, z0 + 9 + hr(bi, bj, 66) * 40, Math.PI / 2, { len: 2 });
}

defineZone('lv38_aquarium', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.05, 0.08, 0.11],
    env: env({ fog: [0.025, 0.07, 0.1], fogNear: 8, fogFar: 78, hum: 0.1, hvac: 0.2, reverb: 'hall', tone: 'lv38_filter' }),
  }),
  gen,
});

// now and then the glass creaks under the weight of nothing
function script(ctx, dt) {
  const s = ctx.state, p = ctx.player;
  s.t = (s.t ?? 30) - dt;
  if (s.t > 0) return;
  s.t = 35 + Math.random() * 60;
  const a = Math.random() * TAU, d = 14 + Math.random() * 18;
  ctx.game.audioCall('play', Math.random() < 0.6 ? 'lv38_creak' : 'lv38_gurgle', p.x + Math.sin(a) * d, p.y + 1.5, p.z - Math.cos(a) * d, { distant: true, vol: 0.9 });
}

defineLevel(N, {
  name: 'THE AQUARIUM',
  zoneType: 'lv38_aquarium',
  zoneSize: P,
  entry: { x: 0.5, y: 0, z: 31.5, yaw: Math.PI / 2 },
  doorDensity: 0.5,
  viewRadius: 4,
  light: { phoneRadius: 4, phoneIntensity: 0.3 },
  script,
});
void pnoise; void signTex;
