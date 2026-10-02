// Shared helpers for the pocket dimensions in auditorium.js, hollowframes.js, culdesac.js,
// suburb.js and pools.js. Everything here is coordinate based so every zone can compute its own
// slice of a structure that spans many zones.
import { CF, M } from '../gen/common.js';
import { stampVestibule } from '../portals.js';
import { rand3 } from '../../core/rng.js';

// Wipe a zone to nothing (no floors, no ceilings, nothing rendered).
export function voidAll(zb) {
  zb.floor.fill(NaN);
  zb.ceil.fill(NaN);
  zb.flags.fill(CF.VOID);
  zb.noConnectivity = true;
}

// Faces of a box (for `skip` masks): 1:+x 2:-x 4:+y 8:-y 16:+z 32:-z
export const FACE = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 };
// skip mask that keeps only the given faces
export const only = (...faces) => 63 & ~faces.reduce((a, b) => a | b, 0);

// Brush clipped to the zone rectangle. Each zone only emits its own part of a structure that
// crosses zone borders, so nothing is drawn twice; faces on the cut are skipped.
export function cbox(zb, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  const a = Math.max(x0, zb.x0), b = Math.max(z0, zb.z0), c = Math.min(x1, zb.x1), d = Math.min(z1, zb.z1);
  if (a >= c || b >= d || y1 <= y0) return null;
  let skip = opts.skip || 0;
  if (c < x1) skip |= FACE.PX;
  if (a > x0) skip |= FACE.NX;
  if (d < z1) skip |= FACE.PZ;
  if (b > z0) skip |= FACE.NZ;
  if ((skip & 63) === 63 && opts.collide === false) return null;
  return zb.box(a, y0, b, c, y1, d, mat, Object.assign({}, opts, { skip }));
}

// Is the anchor of an entity inside this zone? (entities are emitted by exactly one zone)
export const owns = (zb, x, z) => zb.in(Math.floor(x), Math.floor(z));

// Integer indices k with a0 + k*step inside [lo, hi)
export function kRange(a0, step, lo, hi) {
  return [Math.ceil((lo - a0) / step - 1e-9), Math.ceil((hi - a0) / step - 1e-9) - 1];
}

// Deterministic 0..1 value for integer coordinates (pockets look the same in every world).
export const hr = (a, b, salt) => rand3(a | 0, b | 0, salt | 0, 0x5eed);

// Stamp the 'return' vestibule (Lg 3) and wrap it in a free-standing shell so it reads as a
// small building (booth, shed, site office...) instead of a box rising to the 6 m band:
//  * the one-cell ring around it becomes VOID (no soffits) with a brush floor slab, so both
//    doors still open onto walkable ground;
//  * the two notches of the S-bend disappear inside the shell;
//  * shell walls with openings at both doors, plus an optional flat roof slab.
// o: { floorMat, shellMat, height, roofMat, roofOver, roofT, roof:false, thick }
export function shelledReturn(zb, id, E, o = {}) {
  if (!zb.in(E.ox, E.oz)) return null;
  const ox = E.ox, oz = E.oz, D = 7;
  stampVestibule(zb, { kind: 'return', dim: id, level: E.level, ox, oz, Lg: 3, low: false });
  const corridor = new Set();
  for (let k = 4; k <= 6; k++) corridor.add(ox + ',' + (oz + k));
  for (let x = ox; x <= ox + 2; x++) corridor.add(x + ',' + (oz + 3));
  for (let k = 0; k <= 2; k++) corridor.add((ox + 2) + ',' + (oz + k));
  zb.fill(ox - 1, oz - 1, ox + 4, oz + D + 1, (x, z, i) => {
    if (corridor.has(x + ',' + z)) return;
    zb.flags[i] = (zb.flags[i] | CF.VOID | CF.NOPROPS) & ~CF.GATE;
    zb.floor[i] = 0;
    zb.ceil[i] = NaN;
  });
  const fm = o.floorMat || M.concrete_floor;
  const top = only(FACE.PY);
  // (1 m subdivision keeps the vertices on the cell grid: no T-junction cracks at the seams)
  zb.box(ox - 1, -0.3, oz - 1, ox + 4, 0, oz, fm, { skip: top, sub: 1 });
  zb.box(ox - 1, -0.3, oz + D, ox + 4, 0, oz + D + 1, fm, { skip: top, sub: 1 });
  zb.box(ox - 1, -0.3, oz, ox, 0, oz + D, fm, { skip: top, sub: 1 });
  zb.box(ox + 3, -0.3, oz, ox + 4, 0, oz + D, fm, { skip: top, sub: 1 });
  const sm = o.shellMat || zb.params.wallMat || M.concrete;
  const H = o.height ?? 3.0;
  const t0 = 0.02, t1 = o.thick ?? 0.2; // the shell hugs the vestibule's own 0.2 m walls
  const DH = 2.1, dl = 0.1, dr = 0.9;   // door openings (W.DOOR between its posts)
  const roof = o.roof !== false;
  const T = roof ? 0 : FACE.PY;
  // west / east walls
  zb.box(ox - t1, 0, oz - t1, ox - t0, H, oz + D + t1, sm, { skip: only(FACE.NX, FACE.PZ, FACE.NZ, T) });
  zb.box(ox + 3 + t0, 0, oz - t1, ox + 3 + t1, H, oz + D + t1, sm, { skip: only(FACE.PX, FACE.PZ, FACE.NZ, T) });
  // south wall, door of the entry leg at x in [ox+dl, ox+dr]
  const sz0 = oz + D + t0, sz1 = oz + D + t1;
  zb.box(ox - t0, 0, sz0, ox + dl, H, sz1, sm, { skip: only(FACE.PZ, FACE.PX, T) });
  zb.box(ox + dr, 0, sz0, ox + 3 + t0, H, sz1, sm, { skip: only(FACE.PZ, FACE.NX, T) });
  zb.box(ox + dl, DH, sz0, ox + dr, H, sz1, sm, { skip: only(FACE.PZ, FACE.NY, T) });
  // north wall, door of the exit leg at x in [ox+2+dl, ox+2+dr]
  const nz0 = oz - t1, nz1 = oz - t0;
  zb.box(ox - t0, 0, nz0, ox + 2 + dl, H, nz1, sm, { skip: only(FACE.NZ, FACE.PX, T) });
  zb.box(ox + 2 + dr, 0, nz0, ox + 3 + t0, H, nz1, sm, { skip: only(FACE.NZ, FACE.NX, T) });
  zb.box(ox + 2 + dl, DH, nz0, ox + 2 + dr, H, nz1, sm, { skip: only(FACE.NZ, FACE.NY, T) });
  if (roof) {
    const ov = o.roofOver ?? 0.3, rt = o.roofT ?? 0.22;
    zb.box(ox - t1 - ov, H, oz - t1 - ov, ox + 3 + t1 + ov, H + rt, oz + D + t1 + ov, o.roofMat || sm);
  }
  return {
    ox, oz, D, H, x0: ox - t1, z0: oz - t1, x1: ox + 3 + t1, z1: oz + D + t1,
    southDoor: [ox + 0.5, oz + D + 0.5], northDoor: [ox + 2.5, oz - 0.5],
  };
}
