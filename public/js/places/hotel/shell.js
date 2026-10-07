// Shared bits for laying out the hotel: the floor levels, the wall styles
// (wallpaper + its trims) and a few helpers for walls, doorways and faces.
import { H } from './state.js';

export const FL = { B: -15, F1: 0, F2: 15, F3: 30 };
export const DOOR_W = 4, DOOR_H = 8.4;

let S = null;
/** Wall styles: a material for the face and the trims along it. */
export function styles() {
  if (S) return S;
  const M = H.M;
  const fancy = (mat) => ({ mat, trim: { wain: { mat: M.panel, h: 3.6 }, rail: M.woodDark, base: M.woodDark, crown: M.crown } });
  const plain = (mat, crown = M.crown) => ({ mat, trim: { base: M.woodDark, crown } });
  S = {
    corridor: fancy(M.wallGreen),
    rose: plain(M.wallRose), blue: plain(M.wallBlue), burg: plain(M.wallBurgundy), child: plain(M.wallChild),
    green: plain(M.wallGreen), cream: { mat: M.wallCream, trim: { base: M.marbleBlack, crown: M.crown } },
    panel: { mat: M.panel, trim: { crown: M.crown } },
    plaster: { mat: M.wallPlaster, trim: { base: M.woodDark } },
    burnt: { mat: M.charred, trim: {} },
    tile: { mat: M.subway, trim: { base: M.marbleBlack } },
    brick: { mat: M.brickPaint, trim: { base: M.woodDark } },
    redbrick: { mat: M.brickRed, trim: {} },
    concrete: { mat: M.concreteWall, trim: {} },
    stair: { mat: M.stairWall, trim: { base: M.woodDark } },
    office: fancy(M.wallBurgundy),
    ball: { mat: M.wallCream, trim: { wain: { mat: M.panel, h: 4.4 }, rail: M.gold, base: M.woodDark, crown: M.crown } },
    kitchen: { mat: M.subway, trim: {} },
    ext: { mat: M.brickRed, trim: {} },
  };
  return S;
}

/**
 * A wall: axis 'x' runs along x at z = c (neg = the -z side), axis 'z' along z at x = c (neg = the -x side).
 * neg/pos are styles (or null for a face nobody sees). doors: centres along the wall of DOOR_W openings;
 * o.holes: extra openings [{a, b, y0, y1}] (absolute heights).
 */
export function W(axis, c, a0, a1, y, h, neg, pos, o = {}) {
  const holes = [...(o.holes || [])];
  for (const d of o.doors || []) { const w = typeof d === 'object' ? d.w : DOOR_W, at = typeof d === 'object' ? d.at : d, dh = typeof d === 'object' ? d.h ?? DOOR_H : DOOR_H; holes.push({ a: at - w / 2, b: at + w / 2, y0: y, y1: y + dh }); }
  H.kit.wall(axis, c, a0, a1, y, y + h, { t: o.t ?? 1, neg: neg?.mat, pos: pos?.mat, holes, trim: { neg: o.noTrim ? null : neg?.trim, pos: o.noTrim ? null : pos?.trim }, collide: o.collide, ends: o.ends, tint: o.tint });
}
/** Just one face of a wall (no collider): side -1 shows toward -axis. */
export function face(axis, c, a0, a1, y0, y1, side, mat, o = {}) {
  const t = o.t ?? 1, d0 = c + side * t / 2 - (side < 0 ? 0.02 : 0), d1 = d0 + 0.02;
  const f = side < 0 ? (axis === 'x' ? 'nz' : 'nx') : (axis === 'x' ? 'pz' : 'px');
  if (axis === 'x') H.kit.box(a0, a1, y0, y1, d0, d1, mat, { faces: [f], tint: o.tint });
  else H.kit.box(d0, d1, y0, y1, a0, a1, mat, { faces: [f], tint: o.tint });
}
/** Floor and ceiling of a rectangular room. */
export function slab(x0, x1, z0, z1, y, h, floorMat, ceilMat, o = {}) {
  if (floorMat) H.kit.floor(x0, x1, z0, z1, y, floorMat, { surface: o.surface, tile: o.tile });
  if (ceilMat) H.kit.ceiling(x0, x1, z0, z1, y + h, ceilMat, { collide: o.ceilCollide });
}
/** A rug (a flat textured box) on the floor. */
export function rug(x0, x1, z0, z1, y, mat, o = {}) {
  H.kit.box(x0, x1, y, y + (o.t ?? 0.06), z0, z1, mat, { faces: ['py', 'nx', 'px', 'nz', 'pz'], uv: 'local', rep: o.rep || [1, 1], tint: o.tint });
}
