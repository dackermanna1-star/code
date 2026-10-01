// Pocket dimensions: spaces outside the main building, reached through portal vestibules.
// definePocket(id, {name, zoneType, entry: {level, ox, oz}, sign, low, partition?})
// The pocket's zone type must stamp a 'return' vestibule at `entry` (see stampVestibule) with
// Lg 3 and the same `low` flag, so arriving and leaving are seamless.
import { SB_UNITS } from '../config.js';

export const POCKETS = {};

export function definePocket(id, def) {
  const P = Object.assign({ id, name: 'pocket', low: false, sign: null, entry: { level: 0, ox: 0, oz: 0 } }, def);
  if (!P.partition) {
    // default: every super-block is one big zone of the pocket's type
    P.partition = () => [{ x: 0, z: 0, w: SB_UNITS, d: SB_UNITS, type: P.zoneType }];
  }
  POCKETS[id] = P;
  return P;
}

export function pocketIds() { return Object.keys(POCKETS).map(Number); }
