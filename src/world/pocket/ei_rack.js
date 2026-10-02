// The racking lattice of the Scaffolded Suburb (pocket 5). Everything is a pure function of the
// coordinates: double rows of cargo racking run north-south, separated by wide aisles and
// cross streets, and each bay of each tier holds a two storey house. Zones only emit their own
// part of it (brushes are clipped to the zone, entities belong to the zone they stand in).
import { M } from '../gen/common.js';
import { ceilingLight } from '../gen/common.js';
import { cbox, owns, hr, FACE } from './e_util.js';
import { hash32 } from '../../core/rng.js';

export const LAT = {
  AX0: 160.5, ZC0: 147.5,           // centre of aisle 0 (the vestibule's axis) and of cross street 0
  T: 8.0, DK: 0.32,                 // tier pitch and deck thickness
  BAY: 7.6, NB: 4, RD: 6.8,         // bay length (along the aisle), bays per run, row depth
  AW: 8.4, CW: 8.4,                 // aisle and cross street width
};
LAT.BW = LAT.RD * 2;
LAT.PX = LAT.BW + LAT.AW;
LAT.RL = LAT.NB * LAT.BAY;
LAT.PZ = LAT.RL + LAT.CW;
const { AX0, ZC0, T, DK, BAY, NB, RD, AW, CW, BW, PX, RL, PZ } = LAT;

export const blockX0 = (i) => AX0 + AW / 2 + i * PX;
export const runZ0 = (j) => ZC0 + CW / 2 + j * PZ;
// number of tiers of a row (0 = west row of the block, 1 = east row) in block i, run j
export const tiers = (i, j, row) => 3 + Math.floor(hr(i * 2 + row, j, 11) * 3);
export const deckTop = (k) => k * T + DK;

const WARM = [[1.0, 0.78, 0.46], [1.0, 0.84, 0.56], [0.95, 0.9, 0.62], [1.0, 0.72, 0.42], [0.82, 0.92, 0.78]];

export function genRacks(zb) {
  const iLo = Math.floor((zb.x0 - (AX0 + AW / 2) - BW) / PX), iHi = Math.ceil((zb.x1 - (AX0 + AW / 2)) / PX);
  const jLo = Math.floor((zb.z0 - (ZC0 + CW / 2) - RL) / PZ), jHi = Math.ceil((zb.z1 - (ZC0 + CW / 2)) / PZ);
  const out = { houses: 0 };
  for (let j = jLo; j <= jHi; j++) {
    const z0 = runZ0(j);
    if (z0 - 1 >= zb.z1 || z0 + RL + 1 <= zb.z0) continue;
    for (let i = iLo; i <= iHi; i++) {
      const x0 = blockX0(i);
      if (x0 - AW - 1 >= zb.x1 || x0 + BW + 1 <= zb.x0) continue;
      rackRun(zb, i, j, x0, z0, out);
    }
  }
  return out;
}

function rackRun(zb, i, j, x0, z0, out) {
  const nA = tiers(i, j, 0), nB = tiers(i, j, 1), nMax = Math.max(nA, nB);
  const xl = [x0, x0 + RD, x0 + 2 * RD];
  const topOf = [nA, Math.max(nA, nB), nB];
  const U = 0.18;
  // ---- uprights (blue), with hazard stripes around the feet
  for (let m = 0; m < 3; m++) {
    const top = topOf[m] * T - 0.3;
    for (let b = 0; b <= NB; b++) {
      const ux = xl[m], uz = z0 + b * BAY;
      cbox(zb, ux - U, 0, uz - U, ux + U, top, uz + U, M.rack_blue, { skip: FACE.PY | FACE.NY, sub: T / 3 });
      cbox(zb, ux - U - 0.1, 0, uz - U - 0.1, ux + U + 0.1, 0.55, uz + U + 0.1, M.hazard, { skip: FACE.NY, sub: 1 });
    }
  }
  // ---- decks (giant pallets) and the beams under them
  for (let row = 0; row < 2; row++) {
    const n = row === 0 ? nA : nB;
    const xa = xl[row] - 0.1, xb = xl[row + 1] + (row === 1 ? 0.1 : 0);
    for (let k = 0; k < n; k++) {
      const y = deckTop(k);
      if (k === 0) cbox(zb, xa, 0, z0 - U, xb, DK, z0 + RL + U, M.ei_deck, { skip: FACE.NY, sub: 3.8 });
      else cbox(zb, xa, y - DK, z0 - U, xb, y, z0 + RL + U, M.ei_deck, { skip: FACE.PY, sub: 3.8 });
    }
  }
  for (let m = 0; m < 3; m++) {
    const top = m === 1 ? nMax : m === 0 ? nA : nB;
    for (let k = 1; k < top; k++) {
      const y = deckTop(k) - DK;
      cbox(zb, xl[m] - 0.1, y - 0.46, z0 - U, xl[m] + 0.1, y, z0 + RL + U, M.rack_orange, { skip: FACE.PY, sub: BAY / 2 });
    }
  }
  // ---- ties across the aisle west of this block, and the work lamps hanging from them
  const nW = tiers(i - 1, j, 1), nT = Math.min(nA, nW);
  for (const b of [0, 2, NB]) {
    const uz = z0 + b * BAY;
    for (let k = 1; k < nT; k++) {
      const y = deckTop(k) - DK;
      cbox(zb, x0 - AW, y - 0.46, uz - 0.1, x0, y, uz + 0.1, M.rack_orange, { skip: FACE.PY, sub: 4.2 });
    }
    const lx = x0 - AW / 2;
    if (nT >= 2 && owns(zb, lx, uz)) {
      const y = deckTop(1) - DK - 0.46;
      const u = hr(i * 7 + b, j, 21);
      const state = u < 0.1 ? 'off' : u < 0.2 ? 'flicker' : 'on';
      ceilingLight(zb, lx, uz, 'highbay', state, { y: y + 0.05, hang: 2.5, rad: 8, int: 0.95, color: [0.82, 0.92, 1.0] });
      if (state === 'on' && u > 0.55) zb.emitter(lx, y - 1, uz, 'hum_strip', { vol: 0.12, rad: 8 });
    }
  }
  // ---- the houses
  for (let row = 0; row < 2; row++) {
    const n = row === 0 ? nA : nB;
    const dir = row === 0 ? -1 : 1;           // the front faces the aisle
    for (let b = 0; b < NB; b++) {
      for (let k = 0; k < n; k++) {
        const h = hr(i * 131 + b * 17 + row, j * 7 + k, 31);
        if (h < 0.07 + (k === 0 ? 0 : 0.05)) continue;   // an empty slot
        const D = 5.4 + hr(i + b, j + k, 33) * 0.3;
        const W = 6.0 + hr(i + b, j * 3 + k, 34) * 0.7;
        const fx = (row === 0 ? xl[0] : xl[2]) - dir * 0.7;   // front face
        const cx = fx - dir * D / 2, cz = z0 + (b + 0.5) * BAY;
        if (!owns(zb, cx, cz)) continue;
        const y = deckTop(k);
        const v = hash32(i * 73856093 ^ j * 19349663 ^ (b * 2 + row) * 83492791 ^ k * 2654435761);
        zb.prop('ei_house', cx, y, cz, row === 0 ? -Math.PI / 2 : Math.PI / 2, { v, w: W, d: D, collide: k === 0 });
        out.houses++;
        // the lights are on: warm light spilling into the aisle
        const lit = hr(i + b * 5, j + k * 11, 35) < 0.9;
        if (lit) {
          const c = WARM[Math.floor(hr(i + b, j + row * 3 + k, 36) * WARM.length)];
          zb.light(fx + dir * 1.2, y + 3.0, cz, { rad: 7.5, int: 0.58, color: c });
        }
      }
    }
  }
  void CW;
}
