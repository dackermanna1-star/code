// Level 90: THE ABANDONED HOTEL POOL. A hall of glass and iron that nobody has entered for years:
// forests of pillars, a roof of dirty skylights letting in a dull light, dust hanging in the air,
// pools of perfectly still green water. Now and then a ripple crosses the surface although
// nothing touches it.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfRotZ } from '../../core/math.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, openGround, cbox, owns, hr, levelDoor, env, M, CF, FACE, only, facing } from './kit.js';
import { defineHotelProps } from './g10_hotel.js';
import { mix, tiles, dust, dynamicsOf } from './g10_common.js';

const N = 90;
const B = 64;           // one zone = 64 x 64 m of hall
const H = 14;           // height under the skylights
const WATER = -0.14, FLOOR = -1.1;

// ---------------------------------------------------------------- textures
defineTexture('lv90_deck', (p, r) => {
  tiles(p, 8, [176, 160, 130], [112, 98, 76], r, 0.07);
  for (let i = 0; i < 4; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.line(x, y, x + r.int(-14, 14), y + r.int(-14, 14), [84, 72, 54], 0.8); }
  p.stain(r.int(10, 54), r.int(10, 54), 9, [120, 108, 70], 0.4);
  dust(p, 0.5, [166, 152, 122], 3);
  p.grain(0.03);
}, 14);
defineTexture('lv90_coping', (p, r) => {
  tiles(p, 4, [190, 182, 156], [118, 106, 84], r, 0.06);
  p.rect(0, 0, 64, 6, [112, 124, 80], 0.5);
  dust(p, 0.45, [166, 152, 122], 5);
  p.grain(0.03);
}, 12);
defineTexture('lv90_poolwall', (p, r) => {
  tiles(p, 8, [96, 118, 90], [60, 76, 58], r, 0.08);
  p.rect(0, 0, 64, 14, [78, 86, 44], 0.7);                 // the old waterline
  p.rect(0, 14, 64, 2, [124, 112, 60], 0.6);
  p.map((x, y, c) => (y > 40 ? [c[0] * 0.8, c[1] * 0.85, c[2] * 0.7] : c));
  p.stain(r.int(8, 56), r.int(24, 56), 10, [50, 70, 40], 0.5);
  p.grain(0.04);
}, 12);
defineTexture('lv90_poolfloor', (p, r) => {
  tiles(p, 4, [78, 98, 70], [48, 62, 46], r, 0.08);
  p.stain(20, 20, 14, [60, 70, 36], 0.7); p.stain(46, 44, 12, [60, 70, 36], 0.7);
  p.grain(0.05);
}, 10);
// still, green, dusted: no ripple in the texture at all
defineTexture('lv90_water', (p, r) => {
  p.fill([78, 92, 56]);
  p.map((x, y, c) => {
    const n = pnoise(x, y, 4, 7) * 0.6 + pnoise(x, y, 8, 2) * 0.4;
    const k = 0.8 + n * 0.45;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  // the skylights, mirrored faintly in water that never moves
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { p.rect(tx * 32 + 5, ty * 32 + 5, 22, 22, [150, 148, 118], 0.28); p.rect(tx * 32 + 15, ty * 32 + 5, 2, 22, [60, 70, 44], 0.4); p.rect(tx * 32 + 5, ty * 32 + 15, 22, 2, [60, 70, 44], 0.4); }
  for (let i = 0; i < 12; i++) p.stain(r.int(0, 63), r.int(0, 63), r.int(3, 8), [118, 108, 62], 0.5);
  dust(p, 0.18, [130, 120, 86], 9);
}, 10);
// skylights: panes of dirty glass lit from behind, a frame of iron, some panes gone
function skylight(seed, broken, clean) {
  return (p, r) => {
    p.fill([52, 46, 40]);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const x = tx * 16 + 1, y = ty * 16 + 1, u = r.next();
      let c = mix([196, 190, 166], [150, 144, 120], r.next() * 0.9);
      if (u < broken) c = [28, 28, 30];
      else if (u > 1 - clean) c = [236, 236, 218];
      p.rect(x, y, 14, 14, c);
      for (let k = 0; k < 3; k++) p.rect(x + r.int(0, 12), y, 1, 14, mix(c, [110, 100, 78], 0.4), 0.5);
      p.rect(x, y + 12, 14, 2, mix(c, [120, 110, 80], 0.4), 0.5);
    }
    void seed;
  };
}
defineTexture('lv90_sky0', skylight(1, 0.04, 0.05), 12);
defineTexture('lv90_sky1', skylight(2, 0.14, 0.04), 12);
defineTexture('lv90_sky2', skylight(3, 0.0, 0.0), 12);
defineTexture('lv90_sky3', skylight(4, 0.08, 0.2), 12);
defineTexture('lv90_pillar', (p, r) => {
  p.fill([188, 178, 154]);
  p.noise(5, 0.1, 3);
  for (let x = 0; x < 64; x += 16) p.rect(x, 0, 1, 64, [140, 130, 108], 0.5);
  for (let i = 0; i < 6; i++) p.drip(r.int(0, 63), 0, r.int(20, 60), [100, 88, 56], r.range(0.2, 0.4), 2);
  p.rect(0, 0, 64, 5, [150, 118, 70], 0.5);
  p.rect(0, 59, 64, 5, [150, 118, 70], 0.5);
  dust(p, 0.3, [168, 156, 128], 11);
}, 12);
defineTexture('lv90_beam', (p, r) => {
  p.fill([86, 66, 52]);
  p.noise(4, 0.12, 2);
  for (let x = 4; x < 64; x += 8) { p.rect(x, 8, 2, 2, [52, 40, 32]); p.rect(x, 54, 2, 2, [52, 40, 32]); }
  p.stain(r.int(10, 50), 30, 14, [120, 70, 30], 0.5);
}, 8);
defineTexture('lv90_cushion', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [196, 188, 162]); p.rect(x + 8, 0, 8, 64, [140, 128, 100]); }
  dust(p, 0.55, [166, 150, 120], 4);
}, 8);
defineTexture('lv90_canopy', (p) => {
  for (let x = 0; x < 64; x += 16) { p.rect(x, 0, 8, 64, [182, 170, 140]); p.rect(x + 8, 0, 8, 64, [124, 84, 66]); }
  dust(p, 0.5, [160, 146, 116], 6);
  for (let i = 0; i < 5; i++) p.rect((i * 29) % 60, (i * 17) % 60, 4, 4, [30, 28, 24], 0.8);
}, 8);
defineTexture('lv90_canopy2', (p) => { p.fill([192, 184, 166]); dust(p, 0.5, [160, 146, 116], 8); p.grain(0.04); }, 6);
defineTexture('lv90_frame', (p) => { p.fill([156, 150, 132]); p.noise(5, 0.14, 2); p.speckle(40, [130, 80, 40], 0.4, 0.8); }, 6);
defineTexture('lv90_post', (p) => { p.fill([70, 64, 54]); p.noise(4, 0.12, 2); p.speckle(30, [120, 80, 40], 0.4, 0.8); }, 6);
defineTexture('lv90_stone', (p) => { p.fill([170, 160, 138]); p.noise(5, 0.1, 3); dust(p, 0.4, [160, 148, 120], 12); }, 8);
defineTexture('lv90_trunk', (p) => { p.fill([72, 58, 42]); for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 2, [46, 36, 26]); p.noise(8, 0.12, 2); }, 6);
defineTexture('lv90_frond', (p) => {
  p.fill([100, 82, 46]);
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) {
    const half = Math.max(0, 1 + Math.sin((y / 63) * Math.PI) * 10);
    for (let x = 32 - half; x <= 32 + half; x++) {
      if (((Math.floor(y / 3) + (x > 32 ? 1 : 0)) % 2) && Math.abs(x - 32) > half - 3) continue;
      if (((x * 7 + y * 13) % 11) < 2) continue;
      p.set(x, y, Math.abs(x - 32) < 1 ? [60, 46, 26] : [104 + (y % 5) * 4, 88 + (x % 4) * 3, 50]);
      p.alpha(x, y, 255);
    }
  }
}, 8);
defineTexture('lv90_lampglow', (p) => { p.fill([150, 140, 110]); }, 2);
defineTexture('lv90_rubble', (p, r) => {
  p.fill([128, 118, 100]);
  p.noise(6, 0.2, 3);
  p.speckle(120, [80, 72, 60], 0.5, 0.9);
  p.speckle(40, [190, 180, 160], 0.4, 0.9);
  void r;
}, 8);
// a patch of daylight fallen through a missing pane
defineTexture('lv90_patch', (p) => {
  p.clearAlpha(0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.abs(x - 32) / 30, dy = Math.abs(y - 32) / 30;
    const d = Math.max(dx, dy);
    if (d < 1) {
      const mull = Math.abs(x - 32) < 1.5 || Math.abs(y - 32) < 1.5;
      p.set(x, y, mull ? [180, 170, 140] : [244, 236, 204]);
      p.alpha(x, y, Math.min(255, (1 - d) * 520));
    }
  }
}, 6);
// ripple ring
defineTexture('lv90_ringcol', (p) => { p.fill([214, 222, 200]); }, 2);
defineTexture('lv90_ring', (p) => {
  p.clearAlpha(0);
  p.fill([206, 214, 190]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (d > 27 && d < 31.5) p.alpha(x, y, 255);
  }
}, 4);
// dead leaves and dust rafts on the water
defineTexture('lv90_scum', (p, r) => {
  p.clearAlpha(0);
  for (let i = 0; i < 26; i++) {
    const cx = r.int(6, 58), cy = r.int(6, 58), c = r.pick([[96, 80, 44], [110, 96, 60], [70, 66, 36], [124, 114, 80]]);
    for (let k = 0; k < 7; k++) { p.set(cx + k * 0.8, cy + (k % 2), c); p.alpha(cx + k * 0.8, cy + (k % 2), 255); p.set(cx + k * 0.8, cy + 1 + (k % 2), c); p.alpha(cx + k * 0.8, cy + 1 + (k % 2), 255); }
  }
}, 8);
defineTexture('lv90_sign_a', (p) => {
  p.fill([196, 188, 164]); p.frame(0, 0, 64, 64, [90, 40, 30]); p.frame(2, 2, 60, 60, [90, 40, 30]);
  p.text('POOL', 32 - 12, 14, [110, 40, 30], 1); p.text('CLOSED', 32 - 17, 30, [110, 40, 30], 1);
  p.stain(32, 40, 16, [150, 130, 90], 0.4); dust(p, 0.3, [166, 150, 120], 3);
}, 6);
defineTexture('lv90_sign_b', (p) => {
  p.fill([60, 80, 90]); p.frame(0, 0, 64, 64, [190, 186, 170]);
  p.text('NO', 32 - 6, 10, [220, 214, 190], 1); p.text('LIFE-', 32 - 14, 24, [220, 214, 190], 1); p.text('GUARD', 32 - 15, 38, [220, 214, 190], 1);
  dust(p, 0.4, [150, 140, 110], 8);
}, 6);
defineTexture('lv90_sign_c', (p) => {
  p.fill([120, 96, 56]); p.frame(0, 0, 64, 64, [210, 190, 130]);
  p.text('TOWELS', 32 - 17, 14, [236, 224, 180], 1); p.text('ROOM 4', 32 - 17, 34, [236, 224, 180], 1);
  dust(p, 0.4, [150, 140, 110], 8);
}, 6);
defineTexture('lv90_cabin', (p, r) => {
  p.fill([150, 134, 100]);
  for (let x = 0; x < 64; x += 8) p.rect(x, 0, 1, 64, [100, 86, 60], 0.7);
  p.noise(4, 0.1, 2);
  p.stain(r.int(10, 54), r.int(10, 54), 10, [100, 90, 56], 0.5);
  dust(p, 0.4, [160, 146, 116], 14);
}, 10);

// ---------------------------------------------------------------- materials
defineMaterial('lv90_deck', 'lv90_deck', { s: 4, surf: 'tile', stain: 0.1 });
defineMaterial('lv90_coping', 'lv90_coping', { s: 2, surf: 'tile', stain: 0.08 });
defineMaterial('lv90_poolwall', 'lv90_poolwall', { s: 4, surf: 'tile' });
defineMaterial('lv90_poolfloor', 'lv90_poolfloor', { s: 3, surf: 'water' });
defineMaterial('lv90_water', 'lv90_water', { s: 6, surf: 'water' });
for (let k = 0; k < 4; k++) defineMaterial('lv90_sky' + k, 'lv90_sky' + k, { s: 8, flags: VF.FULLBRIGHT, glow: 0.78 });
defineMaterial('lv90_pillar', 'lv90_pillar', { su: 2.4, sv: 6, surf: 'concrete', stain: 0.12 });
defineMaterial('lv90_beam', 'lv90_beam', { s: 2, surf: 'metal' });
defineMaterial('lv90_cushion', 'lv90_cushion', { s: 0.8, surf: 'carpet' });
defineMaterial('lv90_canopy', 'lv90_canopy', { s: 1.2, surf: 'carpet' });
defineMaterial('lv90_canopy2', 'lv90_canopy2', { s: 1.2, surf: 'carpet' });
defineMaterial('lv90_frame', 'lv90_frame', { s: 1.5, surf: 'metal' });
defineMaterial('lv90_post', 'lv90_post', { s: 1.5, surf: 'metal' });
defineMaterial('lv90_stone', 'lv90_stone', { s: 1.5, surf: 'concrete' });
defineMaterial('lv90_trunk', 'lv90_trunk', { s: 1, surf: 'wood' });
defineMaterial('lv90_rubble', 'lv90_rubble', { s: 1.2, surf: 'concrete' });
defineMaterial('lv90_cabin', 'lv90_cabin', { s: 1.6, surf: 'wood', stain: 0.1 });

defineHotelProps('lv90', { cushion: 'lv90_cushion', frame: 'lv90_frame', canopy: 'lv90_canopy', canopyB: 'lv90_canopy2', trunk: 'lv90_trunk', frond: 'lv90_frond', post: 'lv90_post', stone: 'lv90_stone', lampGlow: 'lv90_lampglow' }, { dead: true });

// ---------------------------------------------------------------- props
// one ring of a ripple, lying on the water (hidden until the script shows it)
defineProp('lv90_ring', {
  build(mb, p) {
    const R = p.opts.r || 1, w = 0.16 + R * 0.05, n = 18;
    const st = T('lv90_ringcol', { lit: false, color: [0.5, 0.52, 0.46], flk: [0, 0, 0], flags: VF.WOBBLE });
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = Math.sin(a0), z0 = -Math.cos(a0), x1 = Math.sin(a1), z1 = -Math.cos(a1);
      mb.quad([x0 * (R - w), 0, z0 * (R - w), x1 * (R - w), 0, z1 * (R - w), x1 * (R + w), 0, z1 * (R + w), x0 * (R + w), 0, z0 * (R + w)], [0, 1, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});
defineProp('lv90_sign', {
  build(mb, p) {
    const tex = T(p.opts.tex || 'lv90_sign_a', { lit: true });
    const post = S('lv90_post');
    for (const sx of [-1, 1]) mb.box(sx * 0.42 - 0.03, 0, -0.03, sx * 0.42 + 0.03, 1.3, 0.03, post, { skip: 8 });
    withXf(mb, xfRotZ(p.opts.tilt || 0), () => mb.box(-0.5, 0.62, -0.04, 0.5, 1.36, 0.04, [post, post, post, post, tex, tex], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 1], [1, 0, 0, 1]] }));
  },
  boxes: [[-0.5, 0, -0.06, 0.5, 1.36, 0.06]],
});
// a changing cabin with a bench, its door long gone
defineProp('lv90_cabin', {
  build(mb, p) {
    const w = S('lv90_cabin'), W = 2.0, D = 1.8;
    mb.box(-W / 2, 0, D / 2 - 0.05, W / 2, 2.2, D / 2, w, { skip: 8 });
    mb.box(-W / 2, 0, -D / 2, -W / 2 + 0.05, 2.2, D / 2, w, { skip: 8 });
    mb.box(W / 2 - 0.05, 0, -D / 2, W / 2, 2.2, D / 2, w, { skip: 8 });
    mb.box(-W / 2 - 0.05, 2.2, -D / 2 - 0.05, W / 2 + 0.05, 2.28, D / 2 + 0.05, S('lv90_post'));
  },
  boxes: [[-1.02, 0, 0.85, 1.02, 2.2, 0.92], [-1.02, 0, -0.9, -0.93, 2.2, 0.92], [0.93, 0, -0.9, 1.02, 2.2, 0.92]],
});
defineProp('lv90_ladder', {
  build(mb) {
    const c = S('lv90_frame');
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.27 - 0.025, 0.0, -0.03, sx * 0.27 + 0.025, 0.95, 0.03, c, { skip: 8 });
      mb.box(sx * 0.27 - 0.025, 0.92, -0.03, sx * 0.27 + 0.025, 0.98, 0.52, c);
      mb.box(sx * 0.27 - 0.025, -1.1, 0.46, sx * 0.27 + 0.025, 0.98, 0.52, c, { skip: 4 });
    }
    for (let y = 0.7; y > -1.0; y -= 0.3) mb.box(-0.27, y - 0.015, 0.47, 0.27, y + 0.015, 0.51, c);
  },
});
// a diving board on its stand
defineProp('lv90_board', {
  build(mb) {
    mb.box(-0.5, 0, -0.3, 0.5, 0.7, 0.5, S('lv90_stone'));
    mb.box(-0.3, 0.7, -2.6, 0.3, 0.78, 0.5, S('lv90_cushion'));
  },
  boxes: [[-0.5, 0, -0.3, 0.5, 0.7, 0.5], [-0.3, 0, -2.6, 0.3, 0.78, -0.3]],
});
defineProp('lv90_buoy', {
  build(mb) {
    mb.cyl(0, 0, 0, 0.08, 1.4, 5, S('lv90_post'), 3);
    mb.cyl(0.18, 1.0, 0, 0.3, 0.1, 8, S('lv90_canopy'), 3, null, 0);
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 1.4, 0.1]],
});

// ---------------------------------------------------------------- layout
// the pool of each zone: shape and place are fixed by the zone's coordinates
function poolOf(i, j) {
  if (i === 0 && j === 0) return { x0: 12, z0: 26, x1: 56, z1: 38, kind: 0 };
  const u = hr(i, j, 701);
  if (u < 0.3) return { x0: 10, z0: 24 + Math.floor(hr(i, j, 702) * 3) * 4, x1: 54, z1: 36 + Math.floor(hr(i, j, 702) * 3) * 4, kind: 0 };
  if (u < 0.55) return { x0: 24 + Math.floor(hr(i, j, 703) * 3) * 4, z0: 10, x1: 36 + Math.floor(hr(i, j, 703) * 3) * 4, z1: 54, kind: 1 };
  if (u < 0.8) return { x0: 18, z0: 18, x1: 46, z1: 46, kind: 2 };
  return null;
}

function gen(zb) {
  const bi = Math.floor(zb.x0 / B), bj = Math.floor(zb.z0 / B);
  const ox = bi * B, oz = bj * B;
  zb.noConnectivity = true;
  openGround(zb, M.lv90_deck, 0);
  const P = poolOf(bi, bj);
  // roof: a few 8 m panes are gone altogether (open sky), the rest of the glass is dirty
  const holes = [];
  for (let q = 0; q < 2; q++) {
    if (hr(bi * 3 + q, bj, 710) < 0.38) {
      const hx = 2 + Math.floor(hr(bi, bj + q, 711) * 4) * 2, hz = 2 + Math.floor(hr(bi + q, bj, 712) * 4) * 2;
      holes.push({ x0: hx * 8 - 8, z0: hz * 8 - 8, x1: hx * 8 + 0, z1: hz * 8 + 0 });
    }
  }
  const inHole = (u, v) => holes.some((h) => u >= h.x0 && u < h.x1 && v >= h.z0 && v < h.z1);
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, k) => {
    const u = x - ox, v = z - oz;
    zb.ceil[k] = inHole(u, v) ? NaN : H;
    zb.cmat[k] = M['lv90_sky' + Math.floor(hr((x >> 3) + 31 * (z >> 3), (z >> 3) * 7 + (x >> 3), 713) * 4)];
    if (P) {
      if (u >= P.x0 && u < P.x1 && v >= P.z0 && v < P.z1) { zb.floor[k] = FLOOR; zb.fmat[k] = M.lv90_poolfloor; zb.flags[k] |= CF.WET; return; }
      if (u >= P.x0 - 2 && u < P.x1 + 2 && v >= P.z0 - 2 && v < P.z1 + 2) { zb.fmat[k] = M.lv90_coping; zb.wmat[k] = M.lv90_poolwall; }
    }
  });

  // daylight that gets through the cleanest panes lands on the floor in slanted patches
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) {
    const x = ox + bx * 8, z = oz + bz * 8;
    if (Math.floor(hr((x >> 3) + 31 * (z >> 3), (z >> 3) * 7 + (x >> 3), 713) * 4) !== 3 || hr(bx + bi * 8, bz + bj * 8, 714) > 0.65) continue;
    const px = x + 7, pz = z + 5;
    if (P && px - ox > P.x0 - 1 && px - ox < P.x1 + 1 && pz - oz > P.z0 - 1 && pz - oz < P.z1 + 1) continue;
    if (owns(zb, px, pz)) { zb.decal(px, 0, pz, 'up', 5.5, 5.5, 'lv90_patch', { lit: false, glow: 0.8, rot: 0.2 }); zb.light(px, 2.5, pz, { color: [1.0, 0.94, 0.78], rad: 9, int: 0.35 }); }
  }

  // iron beams under the glass, and pillars on a 16 m grid
  for (let t = 8; t < B; t += 16) {
    zb.box(ox, H - 0.7, oz + t - 0.25, ox + B, H - 0.05, oz + t + 0.25, M.lv90_beam, { collide: false, sub: 16 });
    zb.box(ox + t - 0.25, H - 0.7, oz, ox + t + 0.25, H - 0.05, oz + B, M.lv90_beam, { collide: false, sub: 16 });
    for (let s = 8; s < B; s += 16) {
      const px = ox + t, pz = oz + s;
      if (bi === 0 && bj === 0 && Math.abs(px - ENTRY.x) < 1.2 && Math.abs(pz - ENTRY.z) < 2.5) continue;
      zb.box(px - 0.6, 0, pz - 0.6, px + 0.6, H, pz + 0.6, M.lv90_pillar, { sub: 4 });
      zb.box(px - 0.8, 0, pz - 0.8, px + 0.8, 0.5, pz + 0.8, M.lv90_stone, { sub: 4 });
    }
  }
  // light: the glass is dirty, the hall dim; where the roof is open the floor gets real light
  for (let t = 6; t < B; t += 12) for (let s = 6; s < B; s += 12) zb.light(ox + t, 7, oz + s, { color: [1.0, 0.94, 0.8], rad: 11, int: 0.5 });
  for (const h of holes) {
    const cx = ox + (h.x0 + h.x1) / 2, cz = oz + (h.z0 + h.z1) / 2;
    zb.light(cx, 5, cz, { color: [1.0, 0.96, 0.84], rad: 12, int: 0.8 });
    zb.decal(cx, 0, cz, 'up', 7.5, 7.5, 'lv90_patch', { lit: false, glow: 0.85 });
    // rubble where it fell, and a drip from the edge
    for (let q = 0; q < 6; q++) {
      const rx = cx + (hr(q, bi, 720) - 0.5) * 7, rz = cz + (hr(q, bj, 721) - 0.5) * 7, s = 0.3 + hr(q, bi + bj, 722) * 0.8;
      if (owns(zb, rx, rz)) zb.box(rx - s / 2, 0, rz - s / 2, rx + s / 2, s * 0.6, rz + s / 2, M.lv90_rubble, { collide: s > 0.5 });
    }
    zb.emitter(cx, 2, cz, 'lv90_drip', { vol: 0.8, rad: 16 });
  }

  // the pool: the still water, a ladder, scum, a board; lanes of old deck chairs
  const spots = [];
  if (P) {
    cbox(zb, ox + P.x0, WATER - 0.02, oz + P.z0, ox + P.x1, WATER, oz + P.z1, M.lv90_water, { alpha: 0.9, collide: false, skip: only(FACE.PY), sub: 8 });
    const wcx = ox + (P.x0 + P.x1) / 2, wcz = oz + (P.z0 + P.z1) / 2;
    for (let q = 0; q < 5; q++) {
      const sx = ox + P.x0 + 2 + hr(bi + q, bj, 730) * (P.x1 - P.x0 - 4), sz = oz + P.z0 + 2 + hr(bi, bj + q, 731) * (P.z1 - P.z0 - 4);
      if (owns(zb, sx, sz)) zb.decal(sx, WATER + 0.01, sz, 'up', 3 + hr(q, bi, 732) * 3, 3 + hr(q, bj, 733) * 3, 'lv90_scum', { rot: hr(q, bi * 3, 734) * 6.28 });
    }
    // two ripple spots per pool; three rings each, shown one after the other by the script
    for (let q = 0; q < 2; q++) {
      const sx = ox + P.x0 + 4 + hr(bi * 5 + q, bj, 740) * (P.x1 - P.x0 - 8), sz = oz + P.z0 + 3 + hr(bi, bj * 5 + q, 741) * (P.z1 - P.z0 - 6);
      if (!owns(zb, sx, sz)) continue;
      const id = (bi * 73856093) ^ (bj * 19349663) ^ q;
      for (let k = 0; k < 4; k++) zb.dynamic('lv90_ring', sx, WATER + 0.03, sz, 0, { r: 0.45 + k * 0.7, collide: false }, { showFar: 1e9, tag: 'lv90_ring', spot: id, k, x: sx, z: sz });
      spots.push([sx, sz]);
    }
    void wcx; void wcz;
    // ladders, a board, buoys, signs on the coping
    const lx = (t) => ox + P.x0 + t, lz = (t) => oz + P.z0 + t;
    if (owns(zb, lx(8), lz(-0.3))) zb.prop('lv90_ladder', lx(8), 0, lz(-0.3), 0, {});
    if (owns(zb, lx(P.x1 - P.x0 - 6), lz(P.z1 - P.z0 + 0.3))) zb.prop('lv90_ladder', lx(P.x1 - P.x0 - 6), 0, lz(P.z1 - P.z0 + 0.3), Math.PI, {});
    if (hr(bi, bj, 750) < 0.6) {
      const bx = lx(6), bz = lz(P.z1 - P.z0 + 1.2);
      if (owns(zb, bx, bz)) zb.prop('lv90_board', bx, 0, bz, 0, {});
    }
    for (let q = 0; q < 3; q++) {
      const t = 0.15 + 0.7 * hr(bi * 3 + q, bj, 751);
      const sx = lx(t * (P.x1 - P.x0)), sz = q & 1 ? lz(P.z1 - P.z0 + 2.4) : lz(-2.4);
      if (owns(zb, sx, sz) && !(bi === 0 && bj === 0 && Math.abs(sx - ENTRY.x) < 4)) zb.prop('lv90_sign', sx, 0, sz, q & 1 ? 0 : Math.PI, { tex: ['lv90_sign_a', 'lv90_sign_b', 'lv90_sign_c'][q], tilt: (hr(q, bi, 752) - 0.5) * 0.15 });
    }
  }

  // loungers along the pool, some knocked over; tables with stacked chairs; dead palms in planters
  const nearEntry = (x, z, r) => bi === 0 && bj === 0 && Math.hypot(x - ENTRY.x, z - ENTRY.z) < r;
  if (P) {
    const sides = [
      { dx: 0, dz: 1, along: 'x', a0: P.x0, a1: P.x1, at: (t) => [ox + t, oz + P.z0 - 4.5] },
      { dx: 0, dz: -1, along: 'x', a0: P.x0, a1: P.x1, at: (t) => [ox + t, oz + P.z1 + 4.5] },
      { dx: 1, dz: 0, along: 'z', a0: P.z0, a1: P.z1, at: (t) => [ox + P.x0 - 4.5, oz + t] },
      { dx: -1, dz: 0, along: 'z', a0: P.z0, a1: P.z1, at: (t) => [ox + P.x1 + 4.5, oz + t] },
    ];
    sides.forEach((sd, si) => {
      const rot = facing(sd.dx, sd.dz);
      for (let t = sd.a0 + 2, k = 0; t < sd.a1 - 2; t += 3.1, k++) {
        const h = hr(bi * 11 + k, bj * 5 + si, 760);
        const [x, z] = sd.at(t);
        if (!owns(zb, x, z) || nearEntry(x, z, 6)) continue;
        if (h < 0.42) {
          const knocked = h < 0.07;
          zb.prop('lv90_lounger', x, knocked ? 0.35 : 0, z, rot + (hr(k, si, 761) - 0.5) * (knocked ? 2.5 : 0.25), knocked ? { roll: 1.2, up: 0.4 } : { up: 0.2 + hr(k, si, 762) * 0.6 });
        } else if (h < 0.5) zb.prop('lv90_table', x, 0, z, 0, {});
        else if (h < 0.56) zb.prop('lv90_planter', x, 0, z, 0, { s: 1.0 });
        else if (h < 0.6) zb.prop('lv90_parasol', x, 0, z, rot, {});
      }
    });
  }
  // a poolside bar or a garden court in the zones without a pool
  if (!P) {
    const cx = ox + 32, cz = oz + 32;
    zb.prop('counter', cx - 3, 0, cz, Math.PI / 2, { len: 4 });
    zb.prop('counter', cx + 3, 0, cz, Math.PI / 2, { len: 4 });
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2, x = cx + Math.sin(a) * 9, z = cz - Math.cos(a) * 9;
      zb.prop(q & 1 ? 'table_round' : 'stack_chairs', x, 0, z, a, {});
    }
    for (let q = 0; q < 4; q++) zb.prop('lv90_planter', cx - 14 + (q & 1) * 28, 0, cz - 14 + (q >> 1) * 28, 0, { s: 1.4 });
  }
  // fallen ceiling tiles and dust drifts here and there
  for (let q = 0; q < 14; q++) {
    const x = ox + 3 + hr(bi * 7 + q, bj, 770) * (B - 6), z = oz + 3 + hr(bi, bj * 7 + q, 771) * (B - 6);
    if (P && x - ox > P.x0 - 1 && x - ox < P.x1 + 1 && z - oz > P.z0 - 1 && z - oz < P.z1 + 1) continue;
    if (nearEntry(x, z, 5)) continue;
    if (owns(zb, x, z)) zb.decal(x, 0, z, 'up', 2 + hr(q, bi, 772) * 3, 2 + hr(q, bj, 773) * 3, 'dec_stain2', { rot: hr(q, bi + bj, 774) * 6.28 });
  }

  // changing cabins, one or two with a door inside
  for (let q = 0; q < 3; q++) {
    if (hr(bi * 3 + q, bj * 5, 780) > 0.75 && q > 0) continue;
    const u = 6 + hr(bi + q * 7, bj, 781) * (B - 12), v = 6 + hr(bi, bj + q * 7, 782) * (B - 12);
    const x = ox + Math.round(u) + 0.5, z = oz + Math.round(v) + 0.5;
    if (P && u > P.x0 - 5 && u < P.x1 + 5 && v > P.z0 - 5 && v < P.z1 + 5) continue;
    if (!owns(zb, x, z) || nearEntry(x, z, 8)) continue;
    const rot = Math.floor(hr(q, bi + bj, 783) * 4) * Math.PI / 2;
    zb.prop('lv90_cabin', x, 0, z, rot, {});
    if (q < 2) levelDoor(zb, x - Math.sin(rot) * 0.3, z + Math.cos(rot) * 0.3, rot, {});
  }
  void spots; void withXf;
}

export const ENTRY = { x: 7.5, y: 0, z: 32.5, yaw: Math.PI / 2, pitch: 0.02 };

defineZone('lv90_hall', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.27, 0.25, 0.19],
    env: env({ fog: [0.3, 0.27, 0.2], fogNear: 8, fogFar: 52, hum: 0, hvac: 0, reverb: 'hall', tone: 'lv90' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE ABANDONED HOTEL POOL',
  zoneType: 'lv90_hall',
  zoneSize: B,
  entry: ENTRY,
  doorDensity: 1,
  viewRadius: 4,
  sky: { top: [0.62, 0.6, 0.52], horizon: [0.7, 0.66, 0.54], ground: [0.4, 0.37, 0.3], curve: 0.6 },
  weather: { kind: 'dust', amount: 0.75, indoor: true, color: [0.9, 0.84, 0.64, 0.5], fall: 0.03, wind: [0.02, 0.008], size: 0.022 },
  light: { phoneRadius: 3.8, phoneIntensity: 0.2 },
  // from time to time the water stirs: a ring spreads across the surface although nothing touches it
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 10) - dt;
    if (s.ev) {
      s.ev.t += dt;
      const e = s.ev;
      // show ring k between k*0.45 s and k*0.45 + 1.0 s
      for (const d of e.rings) {
        const k = d.anim.k, on = e.t > k * 0.45 && e.t < k * 0.45 + 1.1;
        d.anim.showFar = on ? 0 : 1e9;
      }
      if (e.t > 4.2) {
        for (const d of e.rings) d.anim.showFar = 1e9;
        s.ev = null;
        ctx.game.look = null;
      } else if (e.t > 0.2 && e.t < 3.6) {
        ctx.game.look = { grade: { sat: 0.62, tint: [0.92, 1.0, 1.04] }, fogFar: 40 };
      } else ctx.game.look = null;
      return;
    }
    if (s.t > 0) return;
    s.t = 22 + Math.random() * 40;
    // pick the spot nearest to the player (within 34 m)
    const p = ctx.player;
    const all = dynamicsOf(ctx, 'lv90_ring');
    let best = null, bd = 34;
    for (const d of all) {
      const dd = Math.hypot(d.anim.x - p.x, d.anim.z - p.z);
      if (dd < bd && (!s.last || s.last !== d.anim.spot || all.length < 6)) { bd = dd; best = d.anim; }
    }
    if (!best) { s.t = 6; return; }
    s.last = best.spot;
    const rings = all.filter((d) => d.anim.spot === best.spot);
    s.ev = { t: 0, rings };
    ctx.game.audioCall('play', 'lv90_ripple', best.x, p.y, best.z, { vol: 1 });
  },
});
