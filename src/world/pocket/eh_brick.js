// Props of the Infinite Cul-de-Sac (pocket 4): the windowless two-storey brick house with its
// open garage and the concrete wall one metre behind the door, and the sodium streetlamp.
// Models face local -z (the street side); the facade is the plane z = 0 and the house extends
// toward +z. The house is a purely visual prop: its collision is laid down by the zone as
// invisible brushes (a prop's own collision boxes would stop at its chunk's border).
import { defineProp, propMat as S, propGlow as G, propTex as T } from '../props.js';
import { VF } from '../materials.js';
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { face, tface } from './eh_common.js';

export const HWID = 5.5;               // half width of the house
export const HDEP = 9;                 // depth
export const WALL_H = 6.0;             // wall height to the eaves
export const GAR = 2.4;                // half width of the garage opening
export const GAR_H = 2.45;             // opening height
export const ALC = 1.0;                // how far the concrete wall stands behind the facade

// chunky brick (four courses to the tile) so that it survives the low resolution
defineTexture('eh_brick', (p, r) => {
  p.fill([128, 124, 116]);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let b = -1; b < 3; b++) {
      const t = r.next();
      const c = [118 + t * 34, 52 + t * 18, 38 + t * 12];
      p.rect(off + b * 32 + 1, row * 16 + 1, 30, 14, c);
      p.shade(off + b * 32 + 1, row * 16 + 1, 30, 3, 0.08);
      p.shade(off + b * 32 + 1, row * 16 + 12, 30, 3, -0.1);
    }
  }
  p.grain(0.07);
  p.noise(8, 0.05, 2);
}, 16);
defineMaterial('eh_brick', 'eh_brick', { su: 2.0, sv: 1.0, surf: 'concrete', stain: 0.05 });

// a slightly paler, bluer road surface than the daytime one so that the lamps' pools show on it
defineTexture('eh_asphalt', (p) => {
  p.fill([88, 88, 96]);
  p.grain(0.1);
  p.noise(4, 0.1, 2);
  p.speckle(170, [136, 136, 144], 0.3, 0.7);
  p.speckle(90, [58, 58, 66], 0.3, 0.7);
}, 16);
defineMaterial('eh_asphalt', 'eh_asphalt', { s: 3, surf: 'asphalt' });

// sodium lamp lens
defineTexture('eh_sodium', (p) => {
  p.fill([255, 168, 70]);
  p.disc(32, 32, 24, [255, 204, 120]);
  p.disc(32, 32, 12, [255, 236, 176]);
}, 8);

// roof profile (z, y of the top surface): eave, ridge, eave
const RIDGE = [[-0.6, 6.05], [4.5, 8.7], [9.6, 6.05]];
const RT = 0.14;
const LAT = HWID + 0.55;
const roofTop = (z) => (z <= 4.5 ? RIDGE[0][1] + ((z - RIDGE[0][0]) / (4.5 - RIDGE[0][0])) * (RIDGE[1][1] - RIDGE[0][1]) : RIDGE[1][1] + ((z - 4.5) / (RIDGE[2][0] - 4.5)) * (RIDGE[2][1] - RIDGE[1][1]));
export const roofUnder = (z) => roofTop(z) - RT;

defineProp('eh_brickhouse', {
  build(mb, p) {
    // props are lit brighter than cell geometry (ambient boost), so the paint is toned down
    const k = 0.74 * (p.opts.shade || 1);
    const brick = S('eh_brick', { tint: [k, k * 0.98, k * 0.96] });
    const conc = S('concrete', { tint: [k * 0.95, k * 0.95, k] });
    const roof = S('shingles', { tint: [0.9, 0.9, 0.95] });
    const trim = S('wood_dark', { tint: [0.5, 0.5, 0.52] });
    const white = S('plastic_white', { tint: [k * 0.9, k * 0.9, k * 0.9] });
    const glow = { ...G('light_panel', 1.1), flags: VF.FULLBRIGHT };
    const H = WALL_H, G2 = GAR, A = ALC;
    // walls: left and right of the garage, the brick over the opening, the concrete wall inside
    mb.box(-HWID, 0, 0, -G2, H, HDEP, [null, brick, null, null, brick, brick], { sub: 2 });
    mb.box(G2, 0, 0, HWID, H, HDEP, [brick, null, null, null, brick, brick], { sub: 2 });
    mb.box(-G2, GAR_H, 0, G2, H, HDEP, [null, null, null, null, brick, brick], { sub: 2 });
    mb.box(-G2, 0, A, G2, GAR_H, HDEP, [null, null, null, null, null, conc], { sub: 1.2 });
    // jambs and soffit of the opening
    face(mb, [-G2, 0, 0], [-G2, 0, A], [-G2, GAR_H, A], [-G2, GAR_H, 0], [1, 0, 0], brick, brick.su, brick.sv);
    face(mb, [G2, 0, 0], [G2, 0, A], [G2, GAR_H, A], [G2, GAR_H, 0], [-1, 0, 0], brick, brick.su, brick.sv);
    face(mb, [-G2, GAR_H, 0], [G2, GAR_H, 0], [G2, GAR_H, A], [-G2, GAR_H, A], [0, -1, 0], conc, 2, 2);
    // the door, rolled up under the lintel, and the bare tube that lights the garage
    mb.box(-G2 + 0.06, GAR_H - 0.34, 0.12, G2 - 0.06, GAR_H - 0.04, 0.62, white, { skip: 4 });
    mb.box(-0.9, GAR_H - 0.38, 0.72, 0.9, GAR_H - 0.33, 0.9, [white, white, white, glow, white, white]);

    // roof: two slabs, gable fills, frieze boards
    for (let i = 0; i < 2; i++) {
      const [z0, y0] = RIDGE[i], [z1, y1] = RIDGE[i + 1];
      face(mb, [-LAT, y0, z0], [LAT, y0, z0], [LAT, y1, z1], [-LAT, y1, z1], [0, 1, 0], roof, roof.su, roof.sv);
      face(mb, [-LAT, y0 - RT, z0], [LAT, y0 - RT, z0], [LAT, y1 - RT, z1], [-LAT, y1 - RT, z1], [0, -1, 0], trim, 2, 2);
      for (const sx of [-1, 1]) face(mb, [sx * LAT, y0 - RT, z0], [sx * LAT, y0, z0], [sx * LAT, y1, z1], [sx * LAT, y1 - RT, z1], [sx, 0, 0], trim, 2, 2);
    }
    face(mb, [-LAT, RIDGE[0][1] - RT, RIDGE[0][0]], [LAT, RIDGE[0][1] - RT, RIDGE[0][0]], [LAT, RIDGE[0][1], RIDGE[0][0]], [-LAT, RIDGE[0][1], RIDGE[0][0]], [0, 0, -1], trim, 2, 2);
    face(mb, [-LAT, RIDGE[2][1] - RT, RIDGE[2][0]], [LAT, RIDGE[2][1] - RT, RIDGE[2][0]], [LAT, RIDGE[2][1], RIDGE[2][0]], [-LAT, RIDGE[2][1], RIDGE[2][0]], [0, 0, 1], trim, 2, 2);
    face(mb, [-HWID, H, -0.01], [HWID, H, -0.01], [HWID, roofUnder(-0.01), -0.01], [-HWID, roofUnder(-0.01), -0.01], [0, 0, -1], brick, brick.su, brick.sv);
    face(mb, [-HWID, H, HDEP + 0.01], [HWID, H, HDEP + 0.01], [HWID, roofUnder(HDEP + 0.01), HDEP + 0.01], [-HWID, roofUnder(HDEP + 0.01), HDEP + 0.01], [0, 0, 1], brick, brick.su, brick.sv);
    for (const sx of [-1, 1]) {
      const x = sx * (HWID + 0.01), h = [sx, 0, 0];
      const P = [[0, H], [HDEP, H], [HDEP, roofUnder(HDEP)], [4.5, roofUnder(4.5)], [0, roofUnder(0)]].map(([z, y]) => [x, y, z]);
      tface(mb, P[0], P[1], P[2], h, brick, brick.su, brick.sv);
      tface(mb, P[0], P[2], P[3], h, brick, brick.su, brick.sv);
      tface(mb, P[0], P[3], P[4], h, brick, brick.su, brick.sv);
    }
    // the driveway: a slab 5 cm proud of the lawn from the garage to the kerb (a decal here z-fights
    // with the ground quads near the camera)
    const drive = S('sidewalk', { tint: [k * 1.05, k * 1.05, k * 1.1] });
    mb.box(-G2, 0, -(p.opts.drive || 9), G2, 0.05, 0, drive, { skip: 8, sub: 1.5 });
    // chimney
    mb.box(3.5, roofTop(6.4) - 0.6, 5.9, 4.4, 10.4, 6.8, brick, { skip: 8 });
    mb.box(3.4, 10.4, 5.8, 4.5, 10.55, 6.9, conc, { skip: 8 });
  },
  boxes: [],
  // the garage's light, spilling out onto the driveway, and the faint buzz of its tube
  light: { x: 0, y: 1.9, z: 0.1, color: [0.76, 0.97, 0.9], rad: 8, int: 1.0 },
  emitter: { snd: 'hum_strip', vol: 0.1, rad: 8, y: 1.9, cond: (p) => !!p.opts.hum },
});

// Sodium streetlamp. The arm reaches toward local -z (the road). opts.ch: flicker channel,
// opts.dead: a lamp that has gone out.
defineProp('eh_streetlamp', {
  build(mb, p) {
    const metal = S('metal_dark', { tint: [0.7, 0.7, 0.74] });
    const lens = p.opts.dead ? S('plastic_gray', { tint: [0.35, 0.35, 0.38] }) : { ...G('eh_sodium', 1.3, p.opts.ch || 0), flags: VF.FULLBRIGHT | VF.NOFOG };
    mb.box(-0.16, 0, -0.16, 0.16, 0.45, 0.16, metal, { skip: 8 });
    mb.cyl(0, 0.45, 0, 0.09, 4.75, 6, metal, 2);
    mb.rod(0, 5.1, 0, 0, 5.4, -1.0, 0.055, 4, metal, false);
    mb.rod(0, 5.4, -1.0, 0, 5.4, -2.1, 0.055, 4, metal, false);
    // lamp head: a lantern with a dark cap
    mb.box(-0.27, 5.2, -2.6, 0.27, 5.44, -1.7, [lens, lens, metal, lens, lens, lens]);
  },
  boxes: [[-0.2, 0, -0.2, 0.2, 5.2, 0.2]],
  light: { x: 0, y: 4.9, z: -2.15, color: [1.0, 0.72, 0.4], rad: 8, int: 1.2, cond: (p) => !p.opts.dead },
  emitter: { snd: 'transformer', vol: 0.12, rad: 9, y: 4.5, cond: (p) => !!p.opts.hum && !p.opts.dead },
});

// A short lantern post for the back yards.
defineProp('eh_gardenlamp', {
  build(mb, p) {
    const metal = S('metal_dark', { tint: [0.7, 0.7, 0.74] });
    const lens = { ...G('eh_sodium', 1.25), flags: VF.FULLBRIGHT | VF.NOFOG };
    mb.cyl(0, 0, 0, 0.07, 2.6, 5, metal, 2);
    mb.box(-0.2, 2.6, -0.2, 0.2, 3.1, 0.2, [lens, lens, metal, metal, lens, lens]);
  },
  boxes: [[-0.12, 0, -0.12, 0.12, 3, 0.12]],
  light: { x: 0, y: 2.9, z: 0, color: [1.0, 0.76, 0.46], rad: 8, int: 1.15 },
});

// The street sign that stands at the mouth of every cul-de-sac. Faces local -z.
defineProp('eh_roadsign', {
  build(mb, p) {
    const metal = S('metal_dark', { tint: [0.65, 0.65, 0.7] });
    const st = T('eh_sign_culdesac', { tint: [0.85, 0.85, 0.85] });
    const FIT = [0, 0, 1, 1];
    mb.cyl(0, 0, 0, 0.04, 2.4, 5, metal, 2);
    mb.box(-0.4, 1.65, -0.07, 0.4, 2.45, -0.03, [metal, metal, metal, metal, metal, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
  boxes: [[-0.1, 0, -0.1, 0.1, 2.4, 0.1]],
});
