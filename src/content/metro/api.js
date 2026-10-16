// Public helpers of the metro package.
//
//   import { METRO, placeMetroSign, placeUnderpassSign, isMetroArea, metroStatus } from '../metro/api.js'
//
// The package places itself (underpass, station, trains); other packages only need these if they
// want an extra «М» pylon pointing to the station (bus terminal, a courtyard exit) or the blue
// underpass sign somewhere else, or want to know whether a point belongs to the metro.

import { Y, STAIRS, UNDERPASS, VEST, ESC, PLAT, TRACK, TUNNEL, FOOTPRINT, LOWER } from './layout.js'
import { addPylon, addUnderpassSign } from './surface.js'

/** Read-only geometry of the underpass and the station (meters). */
export const METRO = Object.freeze({ Y, STAIRS, UNDERPASS, VEST, ESC, PLAT, TRACK, TUNNEL, FOOTPRINT, LOWER })

/**
 * A red «М» pylon (≈4.3 m, lit lightbox on all four sides, «ЗАРЕЧНАЯ» plates, red night glow).
 * o: { x, z, y? (default: terrain height), name? } → placement
 * Example: placeMetroSign(ctx, { x: 532, z: 574.5 })  // at the bus terminal
 * Call during build() (it adds signs, which are baked at load).
 */
export function placeMetroSign(ctx, o) {
  let y = o.y
  if (y === undefined) { const h = ctx.terrain.heightAt(o.x, o.z); y = Number.isFinite(h) ? h : Y.SIDEWALK }
  return addPylon(ctx, o.x, o.z, y, o.name ?? 'ЗАРЕЧНАЯ')
}

/**
 * Blue road sign 5.17.2 (pedestrian underpass pictogram) with a «ПОДЗЕМНЫЙ ПЕРЕХОД» plate.
 * o: { x, z, angle (0 faces south, π north), y? } → placement of the post. Call during build().
 */
export function placeUnderpassSign(ctx, o) {
  let y = o.y
  if (y === undefined) { const h = ctx.terrain.heightAt(o.x, o.z); y = Number.isFinite(h) ? h : Y.SIDEWALK }
  return addUnderpassSign(ctx, o.x, o.z, o.angle ?? 0, y)
}

/** True if (x, y, z) is inside the underpass/station complex or on one of its stairs. */
export function isMetroArea(x, y, z) {
  for (const st of STAIRS) {
    const z0 = Math.min(st.zTop, st.zBot), z1 = Math.max(st.zTop, st.zBot)
    if (x >= st.x0 && x <= st.x1 && z >= z0 && z <= z1 && y < 2.5) return true
  }
  if (y > -1.2) return false
  if (x >= UNDERPASS.x0 && x <= UNDERPASS.x1 && z >= UNDERPASS.z0 && z <= UNDERPASS.z1) return true
  if (x >= VEST.x0 && x <= VEST.x1 && z >= VEST.z0 && z <= VEST.z1) return true
  return x >= TUNNEL.west[0] && x <= TUNNEL.east[1] && z >= 530 && z <= 550 && y < -3
}

/** Live state for debugging / other systems: { phase, trainVisible, trainTrack, trainHead, interval, nextArrivalIn }. */
export function metroStatus(ctx) { return ctx?.registry?.metro ? { ...ctx.registry.metro } : null }
