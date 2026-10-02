// Level 17: The Carrier. A steel deck two hundred metres wide that runs on in both directions
// without end, travelling through a darkness with nothing in it: the stars slide by overhead,
// the hull never stops humming, and everything built on the deck leans a hair to one side and
// back again as if the whole structure were riding a swell that is not there. Container yards,
// hangars, a bridge tower with lit windows; gratings reach out over the void to doors that
// open onto somewhere else. The deck simply ends at its edges.
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, CF, hr, cbox, owns, ceilingLight } from './kit.js';
import { fdiv, placeDoor, quiet, ambientEvents, flickerHook, mulc, mixc, TAU } from './g02_kit.js';

const N = 17;
const SW = VF.SWAY;
const Z0 = 5, Z1 = 187;                  // the deck runs from z = 5 to z = 187; zones 0..2 (z 0..192) hold the ship

// ------------------------------------------------------------------ textures
defineTexture('lv17_deck', (p, r) => {
  p.fill([92, 98, 108]);
  p.noise(4, 0.1, 3);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    const o = (y / 8) % 2 ? 4 : 0;
    p.line(x + o + 1, y + 1, x + o + 5, y + 5, [96, 100, 110]);
    p.line(x + o + 5, y + 1, x + o + 1, y + 5, [44, 46, 54]);
  }
  p.grain(0.05);
  for (let i = 0; i < 4; i++) p.stain(r.int(0, 63), r.int(0, 63), r.range(6, 12), [96, 70, 50], 0.35);
  p.rect(0, 0, 64, 1, [30, 32, 38]); p.rect(0, 0, 1, 64, [30, 32, 38]);
}, 12);
defineTexture('lv17_hull', (p, r) => {
  p.fill([64, 72, 84]);
  p.noise(4, 0.1, 3);
  for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, [34, 38, 46]);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [34, 38, 46]);
  for (let y = 2; y < 64; y += 16) for (let x = 2; x < 64; x += 6) p.set(x, y, [96, 104, 116]);
  p.grain(0.05);
  for (let i = 0; i < 5; i++) p.drip(r.int(0, 63), 0, r.int(14, 50), [30, 34, 40], 0.4, 2);
  p.map((x, y, c) => mulc(c, 0.85 + 0.3 * pnoise(x, y, 4, 7)));
}, 12);
defineTexture('lv17_ports', (p, r) => {
  p.fill([16, 18, 24]);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const lit = r.chance(0.58);
    const c = lit ? mulc([255, 208, 118], 0.8 + r.next() * 0.3) : [30, 34, 42];
    p.rect(tx * 16 + 2, ty * 16 + 4, 12, 8, c);
    if (lit) p.rect(tx * 16 + 2, ty * 16 + 7, 12, 1, mulc(c, 0.7));
  }
}, 10);
defineTexture('lv17_wall', (p, r) => {
  p.fill([112, 118, 112]);
  p.noise(4, 0.09, 3);
  for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, [70, 76, 72]);
  for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, [70, 76, 72]);
  p.grain(0.05);
  for (let i = 0; i < 4; i++) p.drip(r.int(0, 63), 0, r.int(14, 44), [60, 64, 58], 0.35, 2);
  p.stain(r.int(10, 54), r.int(10, 54), 9, [88, 70, 50], 0.35);
}, 12);
for (const [k, base] of [['r', [150, 54, 40]], ['b', [52, 82, 140]], ['g', [58, 112, 84]], ['y', [186, 150, 54]]]) {
  defineTexture('lv17_cont_' + k, (p, r) => {
    p.fill(base);
    for (let x = 0; x < 64; x += 4) { p.rect(x, 0, 1, 64, mulc(base, 0.72)); p.rect(x + 1, 0, 1, 64, mulc(base, 1.12), 0.6); }
    p.noise(4, 0.1, 2);
    p.rect(0, 0, 64, 3, mulc(base, 0.6)); p.rect(0, 61, 64, 3, mulc(base, 0.6));
    p.map((x, y, c) => mixc(c, [120, 70, 40], Math.max(0, pnoise(x, y, 6, 5) - 0.62) * 2.2));
    p.grain(0.05);
    for (let i = 0; i < 3; i++) p.drip(r.int(0, 63), 3, r.int(10, 40), mulc(base, 0.5), 0.4, 1);
  }, 10);
}
defineTexture('lv17_rail', (p) => { p.map((x, y) => (((x + y) >> 3) % 2 ? [220, 176, 40] : [34, 34, 34])); }, 4);
defineTexture('lv17_lamp', (p) => { p.fill([255, 214, 150]); p.disc(32, 32, 22, [255, 250, 230]); }, 4);
defineTexture('lv17_red', (p) => { p.fill([255, 50, 40]); p.disc(32, 32, 20, [255, 160, 130]); }, 4);
defineTexture('lv17_green', (p) => { p.fill([40, 255, 110]); p.disc(32, 32, 20, [170, 255, 200]); }, 4);
defineTexture('lv17_line', (p) => { p.fill([0, 0, 0]); p.clearAlpha(0); p.rect(28, 0, 8, 64, [226, 196, 56]); for (let y = 0; y < 64; y++) for (let x = 28; x < 36; x++) p.alpha(x, y, 255); }, 4);
// the sky: sparse points of light that slide across it ("clouds": red = density, green = shade)
defineTexture('lv17_lights', (p, r) => {
  p.fill([0, 0, 0]);
  for (let i = 0; i < 46; i++) {
    const x = r.int(0, 63), y = r.int(0, 63), len = r.chance(0.35) ? 3 : r.chance(0.5) ? 2 : 1;
    const v = r.chance(0.3) ? 255 : r.chance(0.5) ? 190 : 120;
    for (let k = 0; k < len; k++) p.set(x + k, y, [v, 230, 120]);
  }
}, 5);
defineTexture('lv17_horizon', (p, r) => {
  p.clearAlpha(0);
  const dark = [4, 5, 9];
  // far, faint rows of lights along a long low shape
  for (let x = 0; x < 64; x++) { const h = 3 + Math.round(2 * pnoise(x, 0, 16, 3)); for (let y = 64 - h; y < 64; y++) { p.set(x, y, dark); p.alpha(x, y, 255); } }
  for (let i = 0; i < 18; i++) { const x = r.int(0, 63), y = 62 - r.int(0, 2); p.set(x, y, [255, 200, 120]); p.alpha(x, y, 255); }
  for (const x of [10, 40]) { for (let y = 40; y < 64; y++) { p.set(x, y, dark); p.alpha(x, y, 255); } p.set(x, 38, [255, 60, 50]); p.alpha(x, 38, 255); }
}, 6);

defineMaterial('lv17_deck', 'lv17_deck', { s: 4, surf: 'metal', stain: 0.1, flags: SW });
defineMaterial('lv17_hull', 'lv17_hull', { s: 6, surf: 'metal', stain: 0.1, flags: SW });
defineMaterial('lv17_ports', 'lv17_ports', { s: 16, flags: VF.FULLBRIGHT | VF.NOFOG | SW, glow: 0.95 });
defineMaterial('lv17_wall', 'lv17_wall', { s: 4, surf: 'metal', stain: 0.1, flags: SW });
for (const k of ['r', 'b', 'g', 'y']) defineMaterial('lv17_cont_' + k, 'lv17_cont_' + k, { s: 4, surf: 'metal', flags: SW });
defineMaterial('lv17_rail', 'lv17_rail', { s: 1, surf: 'metal', flags: SW });
defineMaterial('lv17_grate', 'grate', { s: 0.8, surf: 'metal', flags: SW });
defineMaterial('lv17_steel', 'metal_dark', { s: 1.5, surf: 'metal', flags: SW });
defineMaterial('lv17_lamp', 'lv17_lamp', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG | SW, glow: 1.25 });
defineMaterial('lv17_red', 'lv17_red', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG | SW, glow: 1.2, chan: 14 });
defineMaterial('lv17_green', 'lv17_green', { s: 1, flags: VF.FULLBRIGHT | VF.NOFOG | SW, glow: 1.1 });
const CONT = ['lv17_cont_r', 'lv17_cont_b', 'lv17_cont_g', 'lv17_cont_y'];

// ------------------------------------------------------------------ props
defineProp('lv17_funnel', {
  build(mb) {
    const st = S('lv17_wall'), dk = S('lv17_steel'), red = S('lv17_cont_r');
    mb.cyl(0, 0, 0, 5.5, 20, 12, st, 3);
    mb.cyl(0, 20, 0, 5.6, 4, 12, dk, 3);
    mb.cyl(0, 12, 0, 5.7, 2.4, 12, red, 0);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; mb.box(Math.cos(a) * 5.6 - 0.12, 0, Math.sin(a) * 5.6 - 0.12, Math.cos(a) * 5.6 + 0.12, 14, Math.sin(a) * 5.6 + 0.12, dk, { skip: 8 }); }
  },
  boxes: [[-5.6, 0, -5.6, 5.6, 24, 5.6]],
  emitter: { snd: 'g02_diesel', vol: 1, rad: 40, y: 2 },
});
defineProp('lv17_vent', {
  build(mb, p) {
    const dk = S('lv17_steel'), st = S('lv17_wall');
    mb.cyl(0, 0, 0, 0.45, 1.6, 8, st, 3);
    mb.cyl(0, 1.6, 0, 0.9, 0.5, 8, dk, 3);
    mb.cyl(0, 2.1, 0, 0.5, 0.15, 8, dk, 3);
  },
  boxes: [[-0.9, 0, -0.9, 0.9, 2.2, 0.9]],
  emitter: { snd: 'fan', vol: 0.6, rad: 12, y: 1.5 },
});
defineProp('lv17_mast', {
  build(mb, p) {
    const H = p.opts.h || 20, dk = S('lv17_steel');
    mb.cyl(0, 0, 0, 0.25, H, 6, dk, 3);
    mb.box(-1.2, H * 0.7, -0.05, 1.2, H * 0.7 + 0.1, 0.05, dk);
    mb.box(-0.25, H, -0.25, 0.25, H + 0.5, 0.25, S('lv17_red'));
    mb.box(-1.3, H * 0.7 - 0.2, -0.2, -1.1, H * 0.7, 0.2, S('lv17_red'));
    mb.box(1.1, H * 0.7 - 0.2, -0.2, 1.3, H * 0.7, 0.2, S('lv17_green'));
  },
  boxes: [[-0.3, 0, -0.3, 0.3, 6, 0.3]],
  emitter: { snd: 'g02_wire', vol: 0.6, rad: 18, y: 6 },
});
defineProp('lv17_pole', {
  build(mb) {
    const dk = S('lv17_steel');
    mb.box(-0.1, 0, -0.1, 0.1, 9, 0.1, dk, { skip: 8 });
    mb.box(-0.1, 8.7, -0.1, 1.4, 8.9, 0.1, dk);
    mb.box(0.9, 8.55, -0.35, 1.7, 8.7, 0.35, S('lv17_lamp'));
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 3, 0.15]],
  light: { y: 7.4, x: 1.3, color: [1.0, 0.76, 0.42], rad: 10, int: 2.1 },
});
defineProp('lv17_bollard', {
  build(mb) { const dk = S('lv17_steel'); mb.cyl(0, 0, 0, 0.22, 0.6, 6, dk, 3); mb.cyl(0, 0.6, 0, 0.3, 0.12, 6, S('lv17_rail'), 3); },
  boxes: [[-0.25, 0, -0.25, 0.25, 0.7, 0.25]],
});

// ------------------------------------------------------------------ lots
const lotKind = (zi, zj) => {
  if (zi === 0 && zj === 0) return 0;                       // the arrival: open deck
  if (zi === 1 && zj === 0) return 3;                       // and the bridge tower beside it
  const u = hr(zi, zj, 801);
  return u < 0.3 ? 1 : u < 0.5 ? 2 : u < 0.66 ? 3 : u < 0.84 ? 0 : 4;    // yard, hangar, bridge tower, open, funnels
};

function box(zb, x0, y0, z0, x1, y1, z1, mat, o) { return cbox(zb, x0, y0, z0, x1, y1, z1, mat, o); }

function yard(zb, ox, oz, zi, zj) {
  for (let row = 0; row < 8; row++) {
    const z = oz + 8 + row * 6;
    for (let slot = 0; slot < 4; slot++) {
      const x = ox + 5 + slot * 14;
      const u = hr(zi * 8 + slot, zj * 8 + row, 811);
      if (u < 0.28) continue;
      const stack = 1 + (u > 0.55) + (u > 0.82);
      const m = M[CONT[Math.floor(hr(slot, row + zi * 31, 812 + zj) * 4)]];
      for (let s = 0; s < stack; s++) {
        const mm = s ? M[CONT[Math.floor(hr(slot + s, row, 813 + zi) * 4)]] : m;
        box(zb, x, s * 2.6, z, x + 12, s * 2.6 + 2.6, z + 2.5, mm);
      }
    }
  }
  for (const [lx, lz] of [[ox + 2, oz + 2], [ox + 62, oz + 62], [ox + 62, oz + 2], [ox + 2, oz + 62]]) if (owns(zb, lx, lz)) zb.prop('lv17_pole', lx, 0, lz, hr(lx | 0, lz | 0, 814) * TAU, {});
  if (owns(zb, ox + 31, oz + 4)) zb.prop('lv17_pole', ox + 31, 0, oz + 4, 0, {});
}

function hangar(zb, ox, oz, zi, zj) {
  const x0 = ox + 6, x1 = ox + 58, z0 = oz + 12, z1 = oz + 52, H = 10;
  // walls are solid cells, the roof is a ceiling
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (!zb.in(x, z)) continue;
    const i = zb.i(x, z);
    const wall = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
    // two wide doors in each long wall, one in each end
    const door = (z === z0 || z === z1 - 1) ? ((x - x0) % 26 >= 9 && (x - x0) % 26 < 17) : ((z - z0) >= 17 && (z - z0) < 23);
    if (wall && !door) { zb.solid[i] = M.lv17_wall; zb.ceil[i] = H; }
    else { zb.ceil[i] = H; zb.cmat[i] = M.lv17_hull; zb.wmat[i] = M.lv17_wall; }
  }
  // lights, racks and machinery inside
  for (let x = x0 + 6; x < x1 - 4; x += 10) for (let z = z0 + 6; z < z1 - 4; z += 14) if (zb.in(x, z)) ceilingLight(zb, x + 0.5, z + 0.5, 'highbay', hr(x, z, 821) < 0.12 ? 'flicker' : 'on', { color: [1.0, 0.86, 0.6], rad: 10, mul: 1.3 });
  for (let k = 0; k < 14; k++) {
    const x = x0 + 4 + hr(k, zi, 822) * (x1 - x0 - 8), z = z0 + 4 + hr(k, zj, 823) * (z1 - z0 - 8);
    if (!owns(zb, x, z) || (z > z0 + 15 && z < z0 + 25 && false)) continue;
    const t = hr(k, zi + zj * 7, 824);
    zb.prop(t < 0.4 ? 'a_drum' : t < 0.6 ? 'a_pump' : t < 0.8 ? 'pallet' : 'box_stack', x, 0, z, hr(k, 5, 825) * TAU, { on: true });
  }
  for (let x = x0 + 4; x < x1 - 6; x += 12) if (owns(zb, x, z0 + 3)) zb.prop('rack', x, 0, z0 + 2.4, 0, { w: 2.7, h: 6, levels: 3 });
  // a door in the end wall of the hangar
  placeDoor(zb, x1 - 2.4, oz + 32, -Math.PI / 2, {});
  void zj;
}

function tower(zb, ox, oz, zi, zj) {
  const x0 = ox + 14, z0 = oz + 14;
  box(zb, x0, 0, z0, x0 + 22, 11, z0 + 30, M.lv17_wall);
  box(zb, x0 + 3, 11, z0 + 4, x0 + 19, 19, z0 + 26, M.lv17_wall);
  box(zb, x0 - 1, 19, z0 + 2, x0 + 23, 22.5, z0 + 28, M.lv17_steel);
  // lit window rows on every face, a little proud of the walls
  for (const [y0, y1, a, b] of [[3, 6, 0, 22], [7.5, 10, 0, 22]]) {
    box(zb, x0 + a, y0, z0 - 0.06, x0 + b, y1, z0, M.lv17_ports, { collide: false });
    box(zb, x0 + a, y0, z0 + 30, x0 + b, y1, z0 + 30.06, M.lv17_ports, { collide: false });
  }
  box(zb, x0 - 0.06, 3, z0 + 2, x0, 6, z0 + 28, M.lv17_ports, { collide: false });
  box(zb, x0 + 22, 3, z0 + 2, x0 + 22.06, 6, z0 + 28, M.lv17_ports, { collide: false });
  box(zb, x0 + 3, 13, z0 + 3.94, x0 + 19, 17, z0 + 4, M.lv17_ports, { collide: false });
  box(zb, x0 + 3, 13, z0 + 26, x0 + 19, 17, z0 + 26.06, M.lv17_ports, { collide: false });
  // the bridge: a wide band of windows all round the top
  for (const [ax0, az0, ax1, az1] of [[x0 - 1, z0 + 1.94, x0 + 23, z0 + 2], [x0 - 1, z0 + 28, x0 + 23, z0 + 28.06]]) box(zb, ax0, 19.3, az0, ax1, 21.6, az1, M.lv17_ports, { collide: false });
  if (owns(zb, x0 + 11, z0 + 15)) { zb.prop('lv17_mast', x0 + 11, 22.5, z0 + 15, 0, { h: 18 }); }
  zb.light(x0 + 11, 4.2, z0 - 2, { color: [1.0, 0.8, 0.5], rad: 9, int: 1.3 });
  zb.light(x0 + 11, 4.2, z0 + 32, { color: [1.0, 0.8, 0.5], rad: 9, int: 1.3 });
  zb.light(x0 - 2, 4.2, z0 + 15, { color: [1.0, 0.8, 0.5], rad: 9, int: 1.3 });
  zb.light(x0 + 24, 4.2, z0 + 15, { color: [1.0, 0.8, 0.5], rad: 9, int: 1.3 });
  // a door at the foot of the tower
  placeDoor(zb, x0 + 7, z0 - 0.16, 0, {});
  void zi; void zj;
}

function funnels(zb, ox, oz, zi, zj) {
  for (const [dx, dz] of [[20, 24], [44, 40]]) if (owns(zb, ox + dx, oz + dz)) zb.prop('lv17_funnel', ox + dx, 0, oz + dz, 0, {});
  for (let k = 0; k < 6; k++) { const x = ox + 8 + hr(k, zi, 831) * 48, z = oz + 8 + hr(k, zj, 832) * 48; if (owns(zb, x, z) && Math.hypot(x - ox - 20, z - oz - 24) > 8 && Math.hypot(x - ox - 44, z - oz - 40) > 8) zb.prop('lv17_vent', x, 0, z, 0, {}); }
  zb.light(ox + 32, 5, oz + 32, { color: [1.0, 0.72, 0.4], rad: 10, int: 1.2 });
  for (const [lx, lz] of [[ox + 6, oz + 6], [ox + 58, oz + 58], [ox + 58, oz + 6], [ox + 6, oz + 58]]) if (owns(zb, lx, lz)) zb.prop('lv17_pole', lx, 0, lz, hr(lx | 0, lz | 0, 833) * TAU, {});
}

function openDeck(zb, ox, oz, zi, zj) {
  const poles = zi === 0 && zj === 0 ? [[24, 32], [56, 32], [40, 56]] : [[16, 16], [48, 16], [16, 48], [48, 48]];
  for (const [lx, lz] of poles) if (owns(zb, ox + lx, oz + lz)) zb.prop('lv17_pole', ox + lx, 0, oz + lz, hr(lx, lz + zi, 841) * TAU, {});
  for (let k = 0; k < 5; k++) { const x = ox + 6 + hr(k, zi, 842) * 52, z = oz + 6 + hr(k, zj, 843) * 52; if (owns(zb, x, z)) zb.prop(k < 3 ? 'lv17_vent' : 'lv17_bollard', x, 0, z, 0, {}); }
  // painted lane lines along the deck
  for (let k = 0; k < 4; k++) zb.decal(ox + 8 + k * 16, 0, oz + 32, 'up', 1.0, 16, 'lv17_line', { rot: Math.PI / 2 });
  // a door on a plate near the lamps
  const dx = ox + 28 + hr(zi, zj, 844) * 10, dz = oz + 28 + hr(zi, zj, 845) * 10;
  if (!(zi === 0 && zj === 0)) { placeDoor(zb, dx, dz, hr(zi, zj, 846) < 0.5 ? 0 : Math.PI, {}); if (owns(zb, dx, dz)) zb.prop('lv17_bollard', dx + 1.2, 0, dz, 0, {}); }
}

// a grating that reaches out over the void, with rails and a door at its end. Each of the zones it
// crosses draws its own part (north: zones 0 and -1; south: zones 2 and 3).
function gangway(zb, ox, zi, north) {
  const side = north ? 0 : 2;
  if (hr(zi, side, 851) > 0.7 && zi !== 0) return;
  const gx = zi === 0 && north ? 44 : ox + 20 + Math.floor(hr(zi, side, 852) * 24), len = 16;
  const edge = north ? Z0 : Z1, dir = north ? -1 : 1;
  const ze = edge + dir * len;
  const zlo = Math.min(edge, ze), zhi = Math.max(edge, ze);
  const p0 = north ? zlo : zhi - 7, p1 = north ? zlo + 7 : zhi;                    // the end platform
  box(zb, gx - 1.5, -0.2, zlo, gx + 1.5, 0, zhi, M.lv17_grate);
  box(zb, gx - 4, -0.2, p0, gx + 4, 0, p1, M.lv17_grate);
  const r0 = north ? zlo + 7 : zlo, r1 = north ? zhi : zhi - 7;
  for (const sx of [-1.5, 1.5]) box(zb, gx + sx - 0.05, 0, r0, gx + sx + 0.05, 1.05, r1, M.lv17_rail);
  for (const sx of [-4, 4]) box(zb, gx + sx - 0.05, 0, p0, gx + sx + 0.05, 1.05, p1, M.lv17_rail);
  box(zb, gx - 4, 0, north ? zlo : zhi - 0.1, gx + 4, 1.05, north ? zlo + 0.1 : zhi, M.lv17_rail);
  if (owns(zb, gx, ze - dir * 3)) zb.light(gx, 3, ze - dir * 3, { color: [1.0, 0.86, 0.6], rad: 9, int: 1.3 });
  placeDoor(zb, gx, ze - dir * 1.4, north ? Math.PI : 0, { y: 0 });
  if (owns(zb, gx + 3.6, ze - dir * 1.4)) zb.prop('lv17_mast', gx + 3.6, 0, ze - dir * 1.4, 0, { h: 10 });
  if (owns(zb, gx, zs0(north))) zb.prop('lv17_pole', gx + 2.4, 0, zs0(north), north ? 0 : Math.PI, {});
}
const zs0 = (north) => (north ? Z0 + 3 : Z1 - 3);

function gen(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.flags.fill(0);
  zb.ceil.fill(NaN);
  const w = x1 - x0;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = (z - z0) * w + (x - x0);
    zb.floor[i] = 0; zb.fmat[i] = M.lv17_deck; zb.wmat[i] = M.lv17_wall;
    if (z < Z0 || z >= Z1) { zb.floor[i] = NaN; zb.flags[i] = CF.VOID; }
  }
  const zi = fdiv(x0, 64), zj = fdiv(z0, 64);
  const ox = zi * 64, oz = zj * 64;
  if (zj <= 0) gangway(zb, ox, zi, true);
  if (zj >= 2) gangway(zb, ox, zi, false);
  if (zj < 0 || zj > 2) return;
  // the hull below the deck edge, with rows of lit ports along its flank
  if (zj === 0) {
    cbox(zb, x0, -48, Z0 - 2, x1, -0.4, Z0, M.lv17_hull);
    for (const y of [-6, -13, -20, -27]) cbox(zb, x0, y, Z0 - 2.06, x1, y + 2.4, Z0 - 2, M.lv17_ports, { collide: false });
  }
  if (zj === 2) {
    cbox(zb, x0, -48, Z1, x1, -0.4, Z1 + 2, M.lv17_hull);
    for (const y of [-6, -13, -20, -27]) cbox(zb, x0, y, Z1 + 2, x1, y + 2.4, Z1 + 2.06, M.lv17_ports, { collide: false });
  }
  // railings along the edges, with gaps
  for (let x = x0; x < x1; x += 2) {
    for (const [z, ok] of [[Z0 + 0.3, zj === 0], [Z1 - 0.3, zj === 2]]) {
      if (!ok) continue;
      const gap = hr(Math.floor(x / 16), zj, 861) < 0.5 || (zi === 0 && zj === 0 && x >= 36 && x < 52);
      if (gap) continue;
      cbox(zb, x - 0.05, 0, z - 0.05, x + 0.05, 1.05, z + 0.05, M.lv17_rail);
      cbox(zb, x, 0.95, z - 0.04, x + 2, 1.05, z + 0.04, M.lv17_rail);
      cbox(zb, x, 0.5, z - 0.03, x + 2, 0.56, z + 0.03, M.lv17_rail, { collide: false });
    }
  }
  if (zi === 0 && zj === 0) { zb.light(27, 4, 10, { color: [1.0, 0.8, 0.5], rad: 10, int: 1.3 }); zb.light(37, 4, 10, { color: [1.0, 0.8, 0.5], rad: 10, int: 1.3 }); zb.light(32, 4, 20, { color: [1.0, 0.8, 0.5], rad: 10, int: 1.0 }); }
  const kind = lotKind(zi, zj);
  if (kind === 1) yard(zb, ox, oz, zi, zj);
  else if (kind === 2) hangar(zb, ox, oz, zi, zj);
  else if (kind === 3) tower(zb, ox, oz, zi, zj);
  else if (kind === 4) funnels(zb, ox, oz, zi, zj);
  else openDeck(zb, ox, oz, zi, zj);
  // nav lights along the edge
  for (const [x, z] of [[ox + 8, Z0 + 0.2], [ox + 40, Z0 + 0.2], [ox + 8, Z1 - 0.2], [ox + 40, Z1 - 0.2]]) {
    if (!zb.in(x, z)) continue;
    const south = z > 96;
    zb.box(x - 0.15, 0.7, z - 0.15, x + 0.15, 1.2, z + 0.15, south ? M.lv17_green : M.lv17_red, { collide: false });
  }
  // a string of small lamps all along each deck edge: it runs on to the horizon both ways
  for (let x = x0 + 2; x < x1; x += 4) {
    if (zj === 0) cbox(zb, x - 0.1, 0.05, Z0 + 0.5, x + 0.1, 0.28, Z0 + 0.7, M.lv17_lamp, { collide: false });
    if (zj === 2) cbox(zb, x - 0.1, 0.05, Z1 - 0.7, x + 0.1, 0.28, Z1 - 0.5, M.lv17_lamp, { collide: false });
  }
  // deck floodlights along the edges and the middle
  for (let x = ox + 16; x < ox + 64; x += 32) for (const z of [Z0 + 9, 96, Z1 - 9]) if (owns(zb, x, z) && !(zi === 0 && zj === 0 && z === Z0 + 9)) zb.prop('lv17_pole', x, 0, z, Math.PI, {});
}

defineZone('lv17_ship', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.22, 0.24, 0.32],
    env: env({ fog: [0.012, 0.014, 0.026], fogNear: 20, fogFar: 84, hum: 0, hvac: 0.4, reverb: 'hall', tone: 'g02_carrier' }),
  }),
  gen,
});

const SKY = {
  top: [0.004, 0.006, 0.02], horizon: [0.012, 0.015, 0.032], ground: [0.004, 0.005, 0.012], curve: 0.6, stars: 0.5,
  clouds: { layer: 'lv17_lights', color: [1.0, 0.86, 0.62], amount: 1, speed: 0.34, scale: 0.55 },
  band: { layer: 'lv17_horizon', color: [0.03, 0.035, 0.07], repeat: 5, top: 0.06, bottom: -0.03, fog: 0.4 },
};

defineLevel(N, {
  name: 'THE CARRIER',
  zoneType: (ctx) => (ctx.z0 >= -64 && ctx.z0 < 256 ? 'lv17_ship' : 'lv_void'),
  zoneSize: 64,
  entry: { x: 12, y: 0, z: 14, yaw: Math.PI / 2, pitch: 0.14 },
  doorDensity: 0,
  viewRadius: 5,
  sky: SKY,
  light: { phoneRadius: 4.5, phoneIntensity: 0.28 },
  script(ctx, dt) {
    quiet(ctx);
    const st = ctx.state;
    st.t = (st.t ?? 40) - dt;
    // now and then the engines surge: the rumble swells, the lights dip, the stars run faster
    if (st.t <= 0) { st.t = 70 + Math.random() * 80; st.surgeAt = ctx.time; ctx.game.audioCall('play', 'g02_surge', undefined, undefined, undefined, { vol: 1 }); }
    const age = st.surgeAt === undefined ? 99 : ctx.time - st.surgeAt;
    const sky = ctx.game.env && ctx.game.env.sky;
    if (sky && sky.clouds) sky.clouds.speed = 0.34 + (age < 8 ? 0.7 * Math.sin((Math.PI * age) / 8) : 0);
    flickerHook(ctx, N, (f, t) => {
      if (age < 7) for (let ch = 1; ch <= 4; ch++) f.v[ch] *= 0.55 + 0.45 * Math.abs(Math.sin(t * (3 + ch) + age));
    });
    ambientEvents(ctx, dt, [
      { snd: 'g02_hull_groan', every: [22, 55], dist: [12, 30], vol: [0.5, 1], y: 0, first: 14 },
      { snd: 'g02_bulkhead', every: [30, 80], dist: [18, 45], vol: [0.5, 1], y: 1.5 },
      { snd: 'g02_clang_far', every: [20, 60], dist: [20, 50], vol: [0.4, 0.9], y: 4 },
    ]);
  },
});
