// The split-level tract house of the Cul-de-sac of Hollow Frames (pocket 3).
// 12 x 11 m. Front half (garage room, entry, living room) sits at the lawn level; a stairwell
// of half-flight carpeted steps leads up to the back half (hall and three bedrooms) which is
// 1.35 m higher. Every wall is raw drywall inside and siding outside, every floor carpet, and
// there is not a stick of furniture. The front door stands open.
import { W, CF, M, stairs } from '../gen/common.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { face, tface, rotAlong } from './eh_common.js';
import { FACE, only } from './e_util.js';

export const HW = 12, HD = 11;           // footprint in cells
export const GROUND = 0.15;              // lawn / sidewalk level (road is 0)
export const F0 = 0.30, F1 = 1.65;       // finished floors: front half, back half
export const CH = 2.6;                   // ceiling height above each floor
const TOP0 = F0 + CH, TOP1 = F1 + CH;    // wall tops

// ---------------------------------------------------------------- assets
// builder-grade carpet, fine pile, the colour of old oatmeal
defineTexture('eh_carpet', (p) => {
  p.fill([168, 152, 124]);
  p.grain(0.1);
  p.noise(8, 0.05, 2);
  p.speckle(260, [150, 134, 108], 0.25, 0.6);
  p.speckle(120, [186, 172, 144], 0.25, 0.5);
}, 16);
defineMaterial('eh_carpet', 'eh_carpet', { s: 1.4, surf: 'carpet', stain: 0.05 });

// ---------------------------------------------------------------- roof prop
// Local frame: facade at z = 0 (front faces -z), the house extends toward +z, lateral x centred.
const LAT = 6.55;                        // roof half width (overhang included)
const WALL_X = 6.12;                     // outer face of the side walls
const RT = 0.12;                         // slab thickness
const ROOF = [[-0.7, 3.05], [5.0, 4.5], [8.4, 5.55], [11.7, 4.45]]; // (v, top y)
function roofTop(v) {
  for (let k = 0; k < ROOF.length - 1; k++) {
    const [v0, y0] = ROOF[k], [v1, y1] = ROOF[k + 1];
    if (v <= v1 || k === ROOF.length - 2) return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
  }
  return 0;
}
const roofUnder = (v) => roofTop(v) - RT;
// props are lit a little brighter than cell geometry; the tint evens siding fills out
const TINT = 0.74;

defineProp('eh_roof_split', {
  build(mb, p) {
    const shingle = S('shingles', { tint: [0.9, 0.9, 0.92] });
    const siding = S(p.opts.siding || 'siding', { tint: [TINT, TINT, TINT] });
    const brick = S('brick', { tint: [TINT, TINT, TINT] });
    const under = S('plastic_white', { tint: [0.62, 0.62, 0.62] });
    for (let k = 0; k < ROOF.length - 1; k++) {
      const [v0, y0] = ROOF[k], [v1, y1] = ROOF[k + 1];
      // top and underside
      face(mb, [-LAT, y0, v0], [LAT, y0, v0], [LAT, y1, v1], [-LAT, y1, v1], [0, 1, 0], shingle, shingle.su, shingle.sv);
      face(mb, [-LAT, y0 - RT, v0], [LAT, y0 - RT, v0], [LAT, y1 - RT, v1], [-LAT, y1 - RT, v1], [0, -1, 0], under, 2, 2);
      // slab edges
      for (const sx of [-1, 1]) {
        face(mb, [sx * LAT, y0 - RT, v0], [sx * LAT, y0, v0], [sx * LAT, y1, v1], [sx * LAT, y1 - RT, v1], [sx, 0, 0], under, 2, 2);
      }
    }
    const [vf, yf] = ROOF[0], [vb, yb] = ROOF[ROOF.length - 1];
    face(mb, [-LAT, yf - RT, vf], [LAT, yf - RT, vf], [LAT, yf, vf], [-LAT, yf, vf], [0, 0, -1], under, 2, 2);
    face(mb, [-LAT, yb - RT, vb], [LAT, yb - RT, vb], [LAT, yb, vb], [-LAT, yb, vb], [0, 0, 1], under, 2, 2);
    // frieze boards closing the gap between wall tops and the roof underside, front and back
    face(mb, [-WALL_X, TOP0, -0.12], [WALL_X, TOP0, -0.12], [WALL_X, roofUnder(-0.12), -0.12], [-WALL_X, roofUnder(-0.12), -0.12], [0, 0, -1], siding, siding.su, siding.sv);
    face(mb, [-WALL_X, TOP1, 11.12], [WALL_X, TOP1, 11.12], [WALL_X, roofUnder(11.12), 11.12], [-WALL_X, roofUnder(11.12), 11.12], [0, 0, 1], siding, siding.su, siding.sv);
    // gable fills on both sides: front half (lower wall tops) and back half
    for (const sx of [-1, 1]) {
      const x = sx * WALL_X, h = [sx, 0, 0];
      face(mb, [x, TOP0, 0], [x, TOP0, 5], [x, roofUnder(5), 5], [x, roofUnder(0), 0], h, siding, siding.su, siding.sv, [0, -1, 0]);
      const P = [[5, TOP1], [11.12, TOP1], [11.12, roofUnder(11.12)], [8.4, roofUnder(8.4)], [5, roofUnder(5)]].map(([v, y]) => [x, y, v]);
      tface(mb, P[0], P[1], P[2], h, siding, siding.su, siding.sv);
      tface(mb, P[0], P[2], P[3], h, siding, siding.su, siding.sv);
      tface(mb, P[0], P[3], P[4], h, siding, siding.su, siding.sv);
    }
    // chimney
    const cy0 = roofTop(7.6) - 0.5;
    mb.box(2.6, cy0, 7.1, 3.5, 6.7, 8.0, brick, { skip: 8 });
    mb.box(2.5, 6.7, 7.0, 3.6, 6.82, 8.1, S('concrete', { tint: [TINT, TINT, TINT] }), { skip: 8 });
  },
  boxes: [],
});

// A front door leaf hinged at the origin (the leaf runs along local +x), so a dynamic
// prop's rotation swings it about the hinge.
defineProp('eh_door_leaf', {
  build(mb, p) {
    const st = T('house_door', { tint: [0.9, 0.9, 0.9] });
    const edge = S('wood_dark');
    const FIT = [0, 0, 1, 1];
    mb.box(0, 0.02, -0.025, 0.92, 2.05, 0.025, [edge, edge, edge, null, st, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
    mb.box(0.78, 0.98, -0.06, 0.84, 1.02, 0.06, S('chrome'));
  },
  boxes: [],
});

// ---------------------------------------------------------------- the house
// The engine closes every cell that has a ceiling next to an open-sky cell with a wall up to the
// 6 m level height, which would wall each house up to 6 m. So the one-cell ring of ground around
// a house is made VOID (the rule skips void neighbours) and its ground is a brush slab instead.
function groundRing(zb, fr, driveMat, EXT) {
  for (let v = -1; v <= HD; v++) {
    for (let u = -1; u <= HW; u++) {
      if (u >= 0 && u < HW && v >= 0 && v < HD) continue;
      // beside the raised back half the wall base (and so the window sills) follows the upper floor
      fr.setCell(u, v, { floor: v >= 5 && (u < 0 || u >= HW || v >= HD) ? F1 : GROUND, ceil: NaN, flags: CF.VOID | CF.NOPROPS });
    }
  }
  const slab = (u0, v0, u1, v1, mat) => {
    const xa = fr.x(u0, v0), xb = fr.x(u1, v1), za = fr.z(u0, v0), zb2 = fr.z(u1, v1);
    zb.box(Math.min(xa, xb), GROUND - 0.3, Math.min(za, zb2), Math.max(xa, xb), GROUND, Math.max(za, zb2), mat, { skip: only(FACE.PY), sub: 2 });
  };
  const grass = M.grass_dead;
  // front row (the driveway runs up to the garage), back row, and the two side columns
  slab(-1, -1, 0, 0, grass);
  slab(0, -1, 5, 0, driveMat);
  slab(5, -1, HW + 1, 0, grass);
  slab(-1, HD, HW + 1, HD + 1, grass);
  slab(-1, 0, 0, HD, grass);
  slab(HW, 0, HW + 1, HD, grass);
  // siding foundation under the raised back half, flush with the thin walls (+-0.1)
  const found = (u0, v0, u1, v1) => {
    const xa = fr.x(u0, v0), xb = fr.x(u1, v1), za = fr.z(u0, v0), zb2 = fr.z(u1, v1);
    zb.box(Math.min(xa, xb), GROUND, Math.min(za, zb2), Math.max(xa, xb), F1, Math.max(za, zb2), EXT, { sub: 2 });
  };
  found(-0.1, 4.9, 0.1, HD + 0.1);
  found(HW - 0.1, 4.9, HW + 0.1, HD + 0.1);
  found(0.1, HD - 0.1, HW - 0.1, HD + 0.1);
}

export function buildHouse(zb, fr, o) {
  const EXT = o.ext, INT = M.drywall_raw, CARPET = M.eh_carpet;
  groundRing(zb, fr, o.driveMat || M.concrete_floor, EXT);
  const floorOf = (v) => (v < 5 ? F0 : F1);

  // ---- cells: carpet floors, raw drywall ceilings
  for (let v = 0; v < HD; v++) {
    for (let u = 0; u < HW; u++) {
      const f = floorOf(v);
      let ceil = f + CH;
      if (u >= 10 && v >= 2 && v <= 4) ceil = TOP1;       // stairwell is as tall as the upper level
      fr.setCell(u, v, { floor: f, ceil, fmat: CARPET, cmat: INT, wmat: INT, flags: 0, solid: 0 });
    }
  }
  // stairs rising toward the back (+v) from the front half to the back half
  const c0 = fr.cell(10, 2), c1 = fr.cell(11, 4);
  const sx0 = Math.min(c0[0], c1[0]), sx1 = Math.max(c0[0], c1[0]) + 1;
  const sz0 = Math.min(c0[1], c1[1]), sz1 = Math.max(c0[1], c1[1]) + 1;
  const dir = fr.vx > 0 ? '+x' : fr.vx < 0 ? '-x' : fr.vz > 0 ? '+z' : '-z';
  stairs(zb, sx0, sz0, sx1, sz1, dir, F0, F1, CARPET);
  for (let v = 2; v <= 4; v++) for (let u = 10; u <= 11; u++) fr.setCell(u, v, { ceil: TOP1 });

  // ---- exterior walls
  fr.hEdges(0, 5, 0, W.WALL, EXT, INT);               // garage front (closed door painted on)
  fr.hEdges(5, 7, 0, W.DOOR, EXT, INT);               // the front door: wide open
  fr.hEdges(7, 8, 0, W.WALL, EXT, INT);
  fr.hEdges(8, 10, 0, W.WINDOW, EXT, INT);            // living room picture window
  fr.hEdges(10, 12, 0, W.WALL, EXT, INT);
  fr.vEdges(0, 0, HD, W.WALL, EXT, INT);              // west (left) side
  fr.vEdges(0, 8, 9, W.WINDOW, EXT, INT);
  fr.vEdges(12, 0, HD, W.WALL, INT, EXT);             // east (right) side
  fr.vEdges(12, 1, 2, W.WINDOW, INT, EXT);
  fr.vEdges(12, 8, 9, W.WINDOW, INT, EXT);
  fr.hEdges(0, 12, HD, W.WALL, INT, EXT);             // back
  for (const u of [1, 5, 9]) fr.hEdges(u, u + 1, HD, W.WINDOW, INT, EXT);

  // ---- interior walls (raw drywall both sides)
  fr.vEdges(5, 0, 1, W.WALL, INT, INT);               // garage room | entry
  fr.vEdges(5, 1, 3, W.ARCH, INT, INT);
  fr.vEdges(5, 3, 5, W.WALL, INT, INT);
  fr.hEdges(0, 10, 5, W.WALL, INT, INT);              // split between the two halves (steps at u 10-11)
  fr.vEdges(10, 2, 5, W.WALL, INT, INT);              // stairwell
  fr.hEdges(0, 12, 7, W.WALL, INT, INT);              // hall | bedrooms
  for (const u of [1, 5, 9]) fr.hEdges(u, u + 1, 7, W.DOOR, INT, INT);
  fr.vEdges(4, 7, HD, W.WALL, INT, INT);
  fr.vEdges(8, 7, HD, W.WALL, INT, INT);

  // ---- outside dressing
  fr.decal(2.5, GROUND + 1.15, -0.1, 0, -1, 4.5, 2.2, 'garage_door');
  // the front door leaf, ajar in the wind
  const hx = fr.x(5.16, 0.0), hz = fr.z(5.16, 0.0);
  if (zb.in(Math.floor(hx), Math.floor(hz))) {
    const rot = rotAlong(fr.vx, fr.vz) + 0.1;
    zb.dynamic('eh_door_leaf', hx, F0, hz, rot, {}, { osc: [0.14, 0.06, o.phase || 0] });
  }

  // ---- daylight: one soft light per room (no fixtures anywhere)
  const lights = [[2.5, 2.5, F0], [7.5, 2.2, F0], [10.5, 3.2, F0 + 0.7], [6, 6, F1], [2, 9, F1], [6, 9, F1], [10, 9, F1]];
  for (const [lu, lv, f] of lights) {
    const x = fr.x(lu, lv), z = fr.z(lu, lv);
    if (zb.in(Math.floor(x), Math.floor(z))) zb.light(x, f + 2.0, z, { rad: 7, int: o.light ?? 0.5, color: [1, 0.97, 0.9] });
  }

  // ---- roof
  const rx = fr.x(HW / 2, 0), rz = fr.z(HW / 2, 0);
  if (!o.noRoof) zb.prop('eh_roof_split', rx, 0, rz, Math.atan2(fr.fx, -fr.fz), { siding: o.sidingName || 'siding', collide: false });
}

export { CF };
