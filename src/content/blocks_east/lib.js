// Small shared helpers for the blocks_east layout: error isolation, keep-out rectangles (so
// trees, props and cars never land on paths, porches or driveways), and ground painting that
// matches the shared base helpers (road/driveway y 0, sidewalks & paths y 0.25, lawn snow 0.5).

import { M } from '../../core/materials.js'
import { RNG, fbm2, valueNoise2 } from '../../core/rng.js'
import { paintPath, paintSidewalk } from '../base/api.js'

export const PKG = 'blocks_east'

/** Run a build step; log and continue if it throws, so one broken part never empties the region. */
export function safe(name, fn) {
  try { return fn() } catch (e) {
    console.error(`[${PKG}] ${name} failed`, e)
    return null
  }
}

// ---- keep-out rectangles --------------------------------------------------------------
const KEEP = []
export function resetKeep() { KEEP.length = 0 }
/** Mark [x0,x1]×[z0,z1] (any order) as occupied, grown by `pad` metres. */
export function keep(x0, z0, x1, z1, pad = 0, tag = '') {
  KEEP.push([Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad, tag])
}
/** Is (x, z) inside any keep-out rect (grown by `r`)? */
export function blocked(x, z, r = 0) {
  for (const k of KEEP) if (x > k[0] - r && x < k[2] + r && z > k[1] - r && z < k[3] + r) return true
  return false
}
/** Keep-out for a polyline path of given half-width. */
export function keepLine(pts, half) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.ceil(len / 3))
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n
      keep(x, z, x, z, half)
    }
  }
}

// ---- ground ---------------------------------------------------------------------------
/** Driveway rectangle at road level (y 0): packed snow, two dirty ruts along the axis, rare ice. */
export function paintDrive(ctx, x0, z0, x1, z1, axis, seed = 21) {
  const packed = M('snow_packed'), dirty = M('snow_dirty'), slush = M('slush'), ice = M('ice')
  const c = axis === 'x' ? (z0 + z1) / 2 : (x0 + x1) / 2
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const along = axis === 'x' ? x : z
    const across = (axis === 'x' ? z : x) - c
    const wob = (valueNoise2(along * 0.06, 3.1, seed) - 0.5) * 0.5
    const a = Math.abs(across - wob)
    let mat = packed
    if (Math.abs(a - 0.8) < 0.3) mat = valueNoise2(along * 0.4, across * 3, seed + 1) > 0.25 ? dirty : slush
    else if (fbm2(x * 0.2, z * 0.2, 2, seed + 4) > 0.7) mat = dirty
    if (valueNoise2(x * 0.9, z * 0.9, seed + 7) > 0.94) mat = ice
    return { h: 0, mat }
  })
}

/** Paved strip at 0.25 (sidewalk); `curbSide` 'n'|'s'|'e'|'w' paints a 1-voxel curb line on that edge. */
export function paintWalk(ctx, x0, z0, x1, z1, seed = 3, curbSide = null) {
  paintSidewalk(ctx, x0, z0, x1, z1, seed)
  if (!curbSide) return
  const t = ctx.terrain, V = 0.25, curb = M('curb')
  if (curbSide === 'n') t.paintRect(x0, z0, x1, z0 + V, curb)
  if (curbSide === 's') t.paintRect(x0, z1 - V, x1, z1, curb)
  if (curbSide === 'w') t.paintRect(x0, z0, x0 + V, z1, curb)
  if (curbSide === 'e') t.paintRect(x1 - V, z0, x1, z1, curb)
}

/** Parking surface at road level: packed snow, grey slush where wheels turn, frozen puddles. */
export function paintLot(ctx, x0, z0, x1, z1, seed = 5) {
  const packed = M('snow_packed'), dirty = M('snow_dirty'), slush = M('slush'), snow = M('snow')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const n = fbm2(x * 0.25, z * 0.25, 3, seed)
    let mat = packed
    if (n > 0.64) mat = snow
    else if (n < 0.3) mat = dirty
    if (valueNoise2(x * 0.7, z * 0.7, seed + 3) > 0.9) mat = slush
    return { h: 0, mat }
  })
}

/** Flat packed area at 0.25 (forecourt, apron). */
export function paintApron(ctx, x0, z0, x1, z1, seed = 8) { paintSidewalk(ctx, x0, z0, x1, z1, seed) }

/**
 * A footpath through the snow at 0.25: cleared courtyard path (`cleared`) or a narrow trodden
 * line. Pushes a navPath and (optionally) a short footprint trail on its last metres.
 * o: { width, kind ('path'|'trodden'|'sidewalk'), wobble, seed, mat, trail: age 0..1, trailLen (m), nav }
 */
export function walkway(ctx, pts, o = {}) {
  const trodden = o.kind === 'trodden'
  const width = o.width ?? (trodden ? 1.2 : 2.0)
  const wobble = o.wobble ?? (trodden ? 0.7 : 0.15)
  if (trodden && !o.mat) {
    // a trodden line through deep snow: loose trampled snow at the sides, a narrow packed,
    // greyer tread in the middle where most feet go
    paintPath(ctx, { points: pts, width, wobble, seed: o.seed ?? 5, mat: M('snow') })
    paintPath(ctx, { points: pts, width: Math.max(0.5, width * 0.45), wobble, seed: o.seed ?? 5, mat: M('snow_packed') })
  } else {
    paintPath(ctx, { points: pts, width, wobble, seed: o.seed ?? 5, mat: o.mat ?? M('snow_packed') })
  }
  if (o.nav !== false) ctx.navPaths.push({ points: pts.map(p => [p[0], p[1]]), kind: o.kind ?? 'path' })
  if (o.trail !== undefined && ctx.footprints) {
    // footprints share a 1400-print ring buffer with the player: only the last `trailLen` metres
    const tl = o.trailLen ?? 25
    const tail = tailOf(pts, tl)
    try { ctx.footprints.addTrail(tail, ctx.terrain, o.trail) } catch (e) { /* optional */ }
  }
  keepLine(pts, width / 2 + 1.2)
}

/** The last `len` metres of a polyline. */
export function tailOf(pts, len) {
  const out = [pts[pts.length - 1]]
  let left = len
  for (let i = pts.length - 1; i > 0 && left > 0; i--) {
    const [bx, bz] = pts[i], [ax, az] = pts[i - 1]
    const d = Math.hypot(bx - ax, bz - az)
    if (d <= left) { out.unshift(pts[i - 1]); left -= d } else {
      const t = left / d
      out.unshift([bx + (ax - bx) * t, bz + (az - bz) * t])
      left = 0
    }
  }
  return out
}

/** Points every `step` metres along a segment (inclusive ends trimmed by `pad`). */
export function along(x0, z0, x1, z1, step, pad = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(0, Math.floor((len - 2 * pad) / step))
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (pad + i * step) / len
    out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t])
  }
  return out
}

export function rngFor(seed) { return new RNG(seed >>> 0) }

/** Signs/street-convention angle (front faces (sin a, cos a)) facing from (x,z) toward (tx,tz). */
export const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z)
