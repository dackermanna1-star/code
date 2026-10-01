// Pocket dimensions: spaces outside the main building, reached through portal vestibules.
// definePocket(id, {name, zoneType, entry: {level, ox, oz}, sign, low, partition?})
// The pocket's zone type must stamp a 'return' vestibule at `entry` (see stampVestibule) with
// Lg 3 and the same `low` flag, so arriving and leaving are seamless. The vestibule footprint
// (x: ox-1..ox+4, z: oz-1..oz+8) must lie inside ONE zone; with the default partition zones are
// 64 m squares aligned to multiples of 64, so keep the entry well inside one of them.
import { SB_UNITS } from '../config.js';

export const POCKETS = {};

export function definePocket(id, def) {
  const P = Object.assign({ id, name: 'pocket', low: false, sign: null, entry: { level: 0, ox: 0, oz: 0 } }, def);
  if (!P.partition) {
    // default: a grid of 64 m zones of the pocket's type (open borders, so it reads as one space)
    P.partition = () => {
      const out = [];
      for (let z = 0; z < SB_UNITS; z += 8) for (let x = 0; x < SB_UNITS; x += 8) out.push({ x, z, w: 8, d: 8, type: P.zoneType });
      return out;
    };
  }
  POCKETS[id] = P;
  return P;
}

export function pocketIds() { return Object.keys(POCKETS).map(Number); }
