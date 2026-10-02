// Parking grid shared by the garage levels: bays, cars and the lamps that come on as you pass.
// Everything is a pure function of coordinates so that zones agree and scripts can find cars.
import { hr } from './kit.js';
import { vehicleOf, carLength } from './g05_kit.js';

// the channels the headlight cars borrow from the engine's flicker table (a level script hooks
// the update and drives them, see hookFlicker)
export const REACT = [9, 10, 11, 12, 14, 15];

// Level 29 grid: modules 16 m deep along z (bays 5 | aisle 6 | bays 5), columns every 8 m in
// x, three bays between columns.
export const MZ = 16, CX = 8, BW = 8 / 3;

// a car in bay (i, k) [column i, bay k of 0..2] of module j, row 0 (north of the aisle) or 1
export function bayCar(i, k, j, row, era = 3) {
  const h = hr(i * 3 + k, j * 2 + row, 2901);
  if (h > 0.62) return null;
  const v = vehicleOf(era, hr(i * 3 + k, j * 2 + row, 2902), hr(i * 3 + k, j * 2 + row, 2903));
  const back = hr(i * 3 + k, j * 2 + row, 2904) < 0.3;          // backed in: tail toward the wall
  const lights = hr(i * 3 + k, j * 2 + row, 2905);
  // row 0 stands on z in [0, 5) of its module, nose to the north (-z) unless backed in
  const z = j * MZ + (row === 0 ? 2.5 : 13.5);
  const rot = ((row === 0) !== back) ? 0 : Math.PI;
  const x = i * CX + (k + 0.5) * BW + (hr(i * 3 + k, j, 2906) - 0.5) * 0.3;
  const out = { x, z, rot, kind: v.kind, tint: v.tint, hl: 0, ch: 0, back, len: carLength(v.kind) };
  if (lights < 0.035) out.hl = 1;                                 // lamps on, steady
  else if (lights < 0.2) { out.hl = 2; out.ch = REACT[(((Math.floor(x / 16) + 2 * j) % 6) + 6) % 6]; }
  return out;
}

// reactive cars within r metres of (px, pz): calls fn(car)
export function reactiveNear(px, pz, r, fn, era = 3) {
  const j0 = Math.floor((pz - r) / MZ), j1 = Math.floor((pz + r) / MZ);
  const i0 = Math.floor((px - r) / CX), i1 = Math.floor((px + r) / CX);
  for (let j = j0; j <= j1; j++) for (let row = 0; row < 2; row++) for (let i = i0; i <= i1; i++) for (let k = 0; k < 3; k++) {
    const c = bayCar(i, k, j, row, era);
    if (c && c.hl === 2 && Math.abs(c.x - px) < r && Math.abs(c.z - pz) < r) fn(c);
  }
}
