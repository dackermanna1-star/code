// Public API of the blocks_east layout package (read-only data for other packages).
//
//   import { EAST, eastLandmarks } from '../blocks_east/api.js'
//
// Everything is in world meters. At runtime the same data is in ctx.registry.blocksEast
// ({ shop, enterable, buildings, landmarks }).

import { REGION, DRIVE, BUILDINGS, PUBLIC, SHOP_DOOR, SITE, LANDMARKS } from './geo.js'

export const EAST = Object.freeze({ REGION, DRIVE, BUILDINGS, PUBLIC, SHOP_DOOR, SITE })

/** Landmarks a player navigates by: [{ name, x, z, height? }]. */
export function eastLandmarks() { return LANDMARKS.map(l => ({ ...l })) }

/** Is (x, z) inside one of the blocks or driveways this package owns? */
export function isEastArea(x, z) {
  for (const r of Object.values(REGION)) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return true
  const d = DRIVE.ns
  if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return true
  const e = DRIVE.ew
  return x >= e.x0 && x < e.x1 && z >= e.z0 && z < e.z1
}
