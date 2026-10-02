// Level 57: The Yellow Forest. Every tree is painted the faded yellow of Level 0: trunks wrapped
// in striped wallpaper that peels off in long curling strips, crowns made of stained ceiling
// tiles with fluorescent tubes hanging under them, damp carpet underfoot. The light between the
// trunks is the light of the corridors. A line of footprints is pressed into the carpet, leading
// off from a spot in the open; following them is not a good idea.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propGlow as GL } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, noise, owns, hr, levelDoor, env, M } from './kit.js';
import { TAU, clamp, lerp, matRamp, terrainGrid, shadeIdx, cells, doorSite, noEvents, px, pr } from './g03_common.js';

const N = 57;
const G = 64;
const FLOOR = 0.6;
const EX = 32.5, EZ = 40.5;

// ------------------------------------------------------------------ textures
defineTexture('lv57_carpet', (p, r) => {
  p.fill([156, 138, 74]);
  p.noise(3, 0.1, 3);
  p.grain(0.07);
  // the pattern of the building's carpet: small darker flecks in rows
  for (let y = 0; y < 64; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) p.rect(x, y, 1, 2, [128, 112, 56], 0.7);
  for (let i = 0; i < 7; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(6, 11), [112, 96, 48], 0.5);
  for (let i = 0; i < 3; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(5, 8), [96, 104, 56], 0.4);
}, 14);
defineTexture('lv57_bark', (p, r) => {
  // the wallpaper: stripes with chevron dashes between them, gone brown where it is wet
  p.fill([198, 180, 102]);
  p.noise(2, 0.06, 2);
  for (let x = 0; x < 64; x += 8) {
    p.rect(x, 0, 1, 64, [172, 152, 82], 0.7);
    p.rect(x + 1, 0, 1, 64, [214, 198, 126], 0.4);
    for (let y = (x / 8) % 2 ? 2 : 0; y < 64; y += 4) { p.set(x + 4, y, [172, 152, 82], 0.5); p.set(x + 3, y + 1, [172, 152, 82], 0.3); p.set(x + 5, y + 1, [172, 152, 82], 0.3); }
  }
  for (let i = 0; i < 6; i++) p.drip(r.int(0, 63), r.int(0, 14), r.int(20, 56), [120, 96, 48], r.range(0.25, 0.5), r.int(1, 2));
  for (let i = 0; i < 3; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(6, 11), [138, 112, 54], 0.45);
  // a torn patch showing the bare wood underneath
  p.rect(r.int(6, 40), r.int(6, 44), r.int(5, 12), r.int(8, 18), [100, 78, 44], 0.9);
  p.grain(0.03);
}, 14);
// the strips of wallpaper hanging off the crown like leaves
defineTexture('lv57_strip', (p, r) => {
  p.clearAlpha(0);
  for (let k = 0; k < 7; k++) {
    const x0 = 4 + k * 9 + r.int(-1, 1), h = r.int(34, 62), w = r.int(3, 5);
    for (let y = 0; y < h; y++) {
      const curl = Math.round(Math.sin(y * 0.16 + k * 1.7) * 2.2), ww = y > h - 6 ? Math.max(1, w - Math.floor((y - (h - 6)) / 2)) : w;
      for (let q = 0; q < ww; q++) px(p, x0 + curl + q, y, (q + y) % 8 < 1 ? [172, 152, 82] : [198 - (q === 0 ? 20 : 0), 180 - (q === 0 ? 20 : 0), 102]);
    }
  }
}, 8);
// a footprint: ball, waist and heel pressed into the carpet (mirrored for the other foot)
function sole(mirror) {
  return (p) => {
    p.clearAlpha(0);
    const mx = (x) => (mirror ? 63 - x : x);
    const c = [58, 44, 18];
    const blob = (cx, cy, rx, ry) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1) { p.set(mx(x), y, c); p.alpha(mx(x), y, Math.max(0, 1 - d * 0.7) * 400 - 20); }
      }
    };
    blob(31, 15, 15, 14);
    blob(34, 34, 9, 13);
    blob(33, 52, 11, 9);
  };
}
defineTexture('lv57_foot_l', sole(false), 4);
defineTexture('lv57_foot_r', sole(true), 4);
// a sky that is a suspended ceiling: soft squares of cloud
defineTexture('lv57_clouds', (p) => {
  p.map((x, y) => {
    const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
    const base = 0.35 + 0.65 * ((Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.6;
    const edge = (x % 16 === 0 || y % 16 === 0) ? 0.5 : 1;
    const d = clamp(base * edge * (0.7 + 0.3 * pnoise(x, y, 8, 3)), 0, 1);
    return [d * 255, (0.5 + 0.5 * pnoise(x, y, 4, 9)) * 255, 0];
  });
}, 0);
defineTexture('lv57_band', (p, r) => {
  p.clearAlpha(0);
  const col = [120, 104, 52];
  // far columns carrying tiled crowns
  for (const [x, h, w, c] of [[3, 24, 2, 4], [12, 34, 2, 5], [22, 20, 3, 4], [33, 40, 2, 6], [44, 26, 2, 4], [53, 36, 3, 5], [60, 22, 2, 4]]) {
    for (let y = 0; y < h; y++) for (let q = 0; q < w; q++) px(p, x + q, 63 - y, col);
    for (let q = -c; q <= c + w; q++) for (let k = 0; k < 2; k++) px(p, x + q, 63 - h - k, col);
  }
  for (let x = 0; x < 64; x++) { const hh = 3 + Math.round(pnoise(x, 0, 16, 3) * 5); for (let y = 0; y < hh; y++) px(p, x, 63 - y, col); }
  void r;
}, 4);

const CARPET = matRamp('lv57_carpet', 'lv57_carpet', { s: 1.4, surf: 'carpet' }, [1, 1, 0.98]);
defineMaterial('lv57_bark', 'lv57_bark', { su: 1.4, sv: 2.0, surf: 'wood' });
defineMaterial('lv57_foot_dummy', 'lv57_carpet', { s: 1.4, surf: 'carpet' });

// ------------------------------------------------------------------ the trail
const D = (() => { const l = Math.hypot(0.16, -0.99); return [0.16 / l, -0.99 / l]; })();
const NRM = [-D[1], D[0]];
const START = [EX + 1.0, EZ - 4.5];
const TRAIL = 210;
const wob = (s) => 7 * Math.sin(s / 33) + 0.6 * Math.sin(s / 9 + 1.3);
const dwob = (s) => (7 / 33) * Math.cos(s / 33) + (0.6 / 9) * Math.cos(s / 9 + 1.3);
const trailAt = (s) => [START[0] + D[0] * s + NRM[0] * wob(s), START[1] + D[1] * s + NRM[1] * wob(s)];
const trailDir = (s) => { const dx = D[0] + NRM[0] * dwob(s), dz = D[1] + NRM[1] * dwob(s), l = Math.hypot(dx, dz); return [dx / l, dz / l]; };

// ------------------------------------------------------------------ props
// a trunk in wallpaper with a baseboard, and a crown of ceiling tile with a tube lit under it
defineProp('lv57_tree', {
  build(mb, p, r) {
    const bark = S('lv57_bark'), base = S('wood_dark', { tint: [1.2, 1.1, 0.9] }), tile = S('ceil_tile_old'), strip = T('lv57_strip');
    const H = (p.opts.h ?? 5) * r.range(0.9, 1.15), R = r.range(0.3, 0.44), ch = p.opts.ch || 0;
    mb.cyl(0, -0.1, 0, R, H + 0.1, 8, bark, 0);
    mb.cyl(0, -0.1, 0, R + 0.035, 0.34, 8, base, 1);
    // a ring of "crown molding" under the tiles
    mb.cyl(0, H - 0.14, 0, R + 0.07, 0.14, 8, base, 3);
    const w = r.range(1.2, 1.9), d = r.range(1.2, 1.9), x = r.range(-0.4, 0.4), z = r.range(-0.4, 0.4);
    mb.box(x - w, H, z - d, x + w, H + 0.07, z + d, [tile, tile, tile, tile, tile, tile]);
    // an offset second tile higher up, askew like a leaf
    mb.box(x - w * 0.55 + 0.9, H + 0.5, z - d * 0.55 - 0.7, x + w * 0.55 + 0.9, H + 0.56, z + d * 0.55 - 0.7, tile);
    // the tube under the crown
    mb.box(x - w * 0.8, H - 0.1, z - 0.07, x + w * 0.8, H, z + 0.07, GL('light_panel', 1.1, ch));
    mb.box(x - w * 0.8, H - 0.06, z + d * 0.55 - 0.07, x + w * 0.8, H, z + d * 0.55 + 0.07, GL('light_panel', 1.1, ch));
    // hanging wallpaper strips
    const n = 5 + Math.floor(r.next() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r.range(0, 0.5), rr = r.range(R + 0.1, w * 0.9), cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, hh = r.range(1.2, 2.6), ww = r.range(0.35, 0.6);
      const tx = Math.cos(a + 1.57) * ww, tz = Math.sin(a + 1.57) * ww;
      mb.card([cx - tx, H - hh, cz - tz, cx + tx, H - hh, cz + tz, cx + tx, H, cz + tz, cx - tx, H, cz - tz], [Math.cos(a), 0, Math.sin(a)], strip, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.45, 0, -0.45, 0.45, 3, 0.45]],
  light: { y: 4.3, color: [1.0, 0.95, 0.66], rad: 8.5, int: 0.95 },
});
// a power cord looping down from a crown and across the floor
defineProp('lv57_cord', {
  build(mb, p, r) {
    const k = S('plastic_black');
    const H = p.opts.h ?? 4;
    mb.rod(0, H, 0, 0.5, H * 0.5, 0.3, 0.02, 3, k, false);
    mb.rod(0.5, H * 0.5, 0.3, 0.9, 0.05, 0.9, 0.02, 3, k, false);
    mb.rod(0.9, 0.04, 0.9, r.range(2.5, 4), 0.04, r.range(1.5, 3.5), 0.02, 3, k, false);
  },
});
// a lone ceiling tile and tube lying on the carpet, still lit
defineProp('lv57_fallen', {
  build(mb, p, r) {
    mb.box(-0.6, 0, -0.6, 0.6, 0.05, 0.6, S('ceil_tile_old'));
    mb.box(-0.5, 0.05, -0.05, 0.5, 0.1, 0.05, GL('light_panel', 1.1, 0));
    void r;
  },
  light: { y: 0.4, color: [1.0, 0.95, 0.66], rad: 3.5, int: 0.5 },
});

// ------------------------------------------------------------------ zone
function gen(zb) {
  zb.noConnectivity = true;
  terrainGrid(zb, () => FLOOR, (x, z, h, shade) => CARPET[shadeIdx(clamp(0.55 + (noise(x, z, 5, 3) - 0.5) * 0.6 + (noise(x, z, 17, 5) - 0.5) * 0.3, 0, 0.999))]);
  const door = doorSite(zb, 0.68, 71, 8);
  const clearOfDoor = (x, z, m) => !door || Math.hypot(x - door.x, z - door.z) > m;
  const aisle = (x, z) => Math.abs(x - EX) < 2.4 && z < EZ + 2 && z > EZ - 70;     // the opening view

  // trees in loose rows: aisles run through the forest
  cells(zb, 7.5, (i, j) => {
    if (hr(i, j, 11) > 0.84) return;
    const x = (i + 0.5 + (hr(i, j, 12) - 0.5) * 0.6) * 7.5, z = (j + 0.5 + (hr(i, j, 13) - 0.5) * 0.9) * 7.5;
    if (!owns(zb, x, z) || aisle(x, z) || Math.hypot(x - EX, z - EZ) < 4.5 || !clearOfDoor(x, z, 3)) return;
    // keep clear of the trail
    for (let s = 0; s < TRAIL; s += 6) { const t = trailAt(s); if (Math.abs(t[0] - x) < 2 && Math.abs(t[1] - z) < 2) return; }
    const ch = hr(i, j, 14) < 0.08 ? 2 : hr(i, j, 14) > 0.97 ? 7 : 0;
    zb.prop('lv57_tree', x, FLOOR - 0.02, z, hr(i, j, 15) * 6.28, { h: 4.4 + hr(i, j, 16) * 1.8, ch });
    if (hr(i, j, 17) < 0.18) zb.prop('lv57_cord', x + 0.5, FLOOR, z, hr(i, j, 18) * 6.28, { h: 4.4 });
    if (hr(i, j, 19) < 0.5) zb.emitter(x, FLOOR + 4.4, z, 'hum_strip', { vol: 0.28, rad: 9 });
  });
  cells(zb, 17, (i, j) => {
    if (hr(i, j, 21) > 0.4) return;
    const x = (i + 0.2 + hr(i, j, 22) * 0.6) * 17, z = (j + 0.2 + hr(i, j, 23) * 0.6) * 17;
    if (!owns(zb, x, z) || aisle(x, z) || Math.hypot(x - EX, z - EZ) < 6) return;
    zb.prop('lv57_fallen', x, FLOOR, z, hr(i, j, 24) * 6.28, {});
  });

  // the footprints
  for (let s = 0, k = 0; s < TRAIL; s += 0.62, k++) {
    const t = trailAt(s), d = trailDir(s);
    const side = k % 2 ? 1 : -1, off = 0.12 * side;
    const x = t[0] - d[1] * off, z = t[1] + d[0] * off;
    if (!owns(zb, x, z)) continue;
    zb.decal(x, FLOOR, z, 'up', 0.2, 0.44, side > 0 ? 'lv57_foot_r' : 'lv57_foot_l', { rot: Math.atan2(d[0], -d[1]) });
  }
  // where they stop: a door that has no handle
  const end = trailAt(TRAIL + 1.2), ed = trailDir(TRAIL);
  if (owns(zb, end[0], end[1])) zb.prop('level_door', end[0], FLOOR, end[1], Math.atan2(ed[0], -ed[1]) + Math.PI, { useY: 1.0, useR: 0.9, message: 'It has no handle.' });

  if (door) {
    levelDoor(zb, door.x, door.z, door.rot, { y: FLOOR });
  }
}

defineZone('lv57_forest', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.66, 0.6, 0.36],
    env: env({ fog: [0.6, 0.55, 0.3], fogNear: 3, fogFar: 36, hum: 0.5, hvac: 0, reverb: 'hall', tone: 'lv57_damp' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE YELLOW FOREST',
  zoneType: 'lv57_forest',
  zoneSize: G,
  entry: { x: EX, y: FLOOR, z: EZ, yaw: 0 },
  doorDensity: 0.5,
  viewRadius: 4,
  grade: { sat: 1.05, tint: [1.04, 1.0, 0.9] },
  sky: {
    top: [0.74, 0.68, 0.4], horizon: [0.6, 0.55, 0.3], ground: [0.5, 0.45, 0.24], curve: 0.5,
    clouds: { layer: 'lv57_clouds', color: [0.86, 0.8, 0.5], amount: 0.7, speed: 0.002, scale: 0.5 },
    band: { layer: 'lv57_band', color: [0.7, 0.64, 0.34], repeat: 4, top: 0.42, bottom: -0.03, fog: 0.7 },
  },
  light: { phoneRadius: 3.8, phoneIntensity: 0.22 },
  script(ctx) { noEvents(ctx); },
});
void lerp; void pr; void M;
