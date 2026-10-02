// The racking lattice of the Scaffolded Suburb (pocket 5). Everything is a pure function of the
// coordinates: double rows of cargo racking run north-south, separated by wide aisles and
// cross streets, and each bay of each tier holds a two storey house. Zones only emit their own
// part of it (brushes are clipped to the zone, entities belong to the zone they stand in).
import { M, ceilingLight } from '../gen/common.js';
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
      cbox(zb, ux - U, 0, uz - U, ux + U, top, uz + U, M.rack_blue, { skip: FACE.PY | FACE.NY, sub: T / 2 });
      cbox(zb, ux - U - 0.1, 0, uz - U - 0.1, ux + U + 0.1, 0.55, uz + U + 0.1, M.hazard, { skip: FACE.NY, sub: 1 });
      // location tag at eye level on the face toward the aisle
      if (m !== 1 && zb.in(Math.floor(ux), Math.floor(uz)) && hr(i * 11 + m, j * 13 + b, 41) < 0.7) {
        const t = 'ei_tag' + Math.floor(hr(i + m, j + b, 42) * 4);
        zb.decal(m === 0 ? ux - U : ux + U, 1.75, uz, m === 0 ? 'nx' : 'px', 0.34, 0.34, t);
      }
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
  for (let b = 0; b <= NB; b++) {
    const uz = z0 + b * BAY;
    for (let k = 1; k < nT; k++) {
      if (b % 2 === 1 && k > 1) break;
      const y = deckTop(k) - DK;
      cbox(zb, x0 - AW, y - 0.46, uz - 0.1, x0, y, uz + 0.1, M.rack_orange, { skip: FACE.PY, sub: 4.2 });
    }
    const lx = x0 - AW / 2;
    if (nT >= 2 && b === 2 && owns(zb, lx, uz)) {
      // numbered board hanging from the tie, turning a little in the draught
      const y = deckTop(1) - DK - 0.46;
      zb.dynamic('ei_aislesign', lx, y, uz, 0, { tex: 'ei_aisle' + (((i % 8) + 8) % 8), collide: false }, { osc: [0.18, 0.08, hr(i, j, 25) * 6.28] });
    }
    if (nT >= 2 && owns(zb, lx, uz)) {
      const y = deckTop(1) - DK - 0.46;
      const u = hr(i * 7 + b, j, 21);
      const dark = hr(i, j, 22) < 0.08;
      const state = dark || u < 0.1 ? 'off' : u < 0.2 ? 'flicker' : 'on';
      const cu = hr(i, j, 23);
      const color = cu < 0.6 ? [0.84, 0.93, 1.0] : cu < 0.85 ? [1.0, 0.86, 0.62] : [0.8, 1.0, 0.82];
      ceilingLight(zb, lx, uz, 'highbay', state, { y: y + 0.05, hang: 2.5, rad: 8, int: 1.25, color });
      if (state === 'on' && u > 0.55) zb.emitter(lx, y - 1, uz, 'hum_strip', { vol: 0.12, rad: 8 });
    }
  }
  // ---- street lamps at the corners where the cross streets meet the aisles
  for (const [lx, rot] of [[xl[0] - 1.2, Math.PI / 2], [xl[2] + 1.2, -Math.PI / 2]]) {
    for (const lz of [z0 - 1.3, z0 + RL + 1.3]) {
      if (!owns(zb, lx, lz)) continue;
      if (hr(i * 5 + (lx < x0 + RD ? 0 : 1), j * 3 + (lz < z0 ? 0 : 1), 27) < 0.75) zb.prop('ei_streetlamp', lx, 0, lz, rot, { sa: Math.floor(hr(i, 5, 28) * 6), sb: Math.floor(hr(j, 9, 29) * 6) });
    }
  }
  // ---- the houses
  for (let row = 0; row < 2; row++) {
    const n = row === 0 ? nA : nB;
    const dir = row === 0 ? -1 : 1;           // the front faces the aisle
    const stocked = hr(i * 2 + row, j, 12) < 0.3 ? 1 + Math.floor(hr(i * 2 + row, j, 13) * (n - 1)) : n;
    for (let b = 0; b < NB; b++) {
      for (let k = 0; k < Math.min(n, stocked); k++) {
        const h = hr(i * 131 + b * 17 + row, j * 7 + k, 31);
        if (h < 0.07 + (k === 0 ? 0 : 0.05)) continue;   // an empty slot
        const D = 5.2 + hr(i + b, j + k, 33) * 0.3;
        const W = 6.0 + hr(i + b, j * 3 + k, 34) * 0.7;
        const fx = (row === 0 ? xl[0] : xl[2]) - dir * 0.7;   // front face
        const cx = fx - dir * D / 2, cz = z0 + (b + 0.5) * BAY;
        const y = deckTop(k);
        // wrapping, cages and mailboxes are decided by coordinates alone: they may reach into the next zone
        const bx0 = Math.min(cx - D / 2, cx + D / 2), bx1 = Math.max(cx - D / 2, cx + D / 2);
        if (hr(i + b * 3, j * 5 + k, 45) < 0.05) cbox(zb, bx0 - 0.45, y, cz - W / 2 - 0.25, bx1 + 0.45, y + 7.4, cz + W / 2 + 0.25, M.grate, { collide: false, skip: FACE.NY | FACE.PY, sub: 1 });
        else if (hr(i + b * 3, j * 5 + k, 43) < 0.1) cbox(zb, bx0 - 0.5, y, cz - W / 2 - 0.3, bx1 + 0.5, y + 7.3, cz + W / 2 + 0.3, M.white, { alpha: 0.5, tint: [0.85, 1.05, 1.3], collide: false, skip: FACE.NY, sub: 1 });
        // ground floor houses are solid: invisible collision brushes (a prop's own boxes are lost past the
        // edge of the 16 m chunk it is anchored in, which a house this size often crosses)
        if (k === 0) cbox(zb, bx0 - (row === 0 ? 0.3 : 0), 0, cz - W / 2, bx1 + (row === 1 ? 0.3 : 0), 6.6, cz + W / 2, M.ei_deck, { render: false });
        if (k === 0 && hr(i + b * 7, j + row * 13, 44) < 0.4) {
          const mx = row === 0 ? xl[0] - 0.75 : xl[2] + 0.75, mz = cz + 1.9;
          if (owns(zb, mx, mz)) zb.prop('mailbox', mx, 0, mz, row === 0 ? -Math.PI / 2 : Math.PI / 2, {});
        }
        if (!owns(zb, cx, cz)) continue;
        const v = hash32(i * 73856093 ^ j * 19349663 ^ (b * 2 + row) * 83492791 ^ k * 2654435761);
        zb.prop('ei_house', cx, y, cz, row === 0 ? -Math.PI / 2 : Math.PI / 2, { v, w: W, d: D, collide: false });
        out.houses++;
        // the lights are on: warm light spilling into the aisle
        if (hr(i + b * 5, j + k * 11, 35) < 0.9) {
          const c = WARM[Math.floor(hr(i + b, j + row * 3 + k, 36) * WARM.length)];
          zb.light(fx + dir * 1.2, y + 3.0, cz, { rad: 8, int: 0.72, color: c });
        }
      }
    }
  }
}
