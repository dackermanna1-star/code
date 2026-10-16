// Small shared helpers for the blocks_west layout (ground pads, paths + nav, safe sections).

import { M } from '../../core/materials.js'
import { paintPath } from '../base/api.js'
import { fbm2, valueNoise2 } from '../../core/rng.js'
import { residentialSize } from '../residential/api.js'

/** Run a part of the build; log (do not throw) on failure so one broken prop never kills a district. */
export function safe(name, fn) {
  try { return fn() } catch (e) {
    console.error(`[content:blocks_west] ${name} failed`, e)
    return null
  }
}

/** Flat pad at absolute height h (m) — under buildings so lawn bumps never poke through floors. */
export function pad(ctx, x0, z0, x1, z1, h = 0.25, mat = M('snow_packed')) {
  const hv = Math.round(h / 0.25)
  ctx.terrain.apply(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), () => ({ h: hv, mat }))
}

/** Paved courtyard sidewalk (tile-less asphalt under packed snow) at 0.25 m. */
export function paveWalk(ctx, x0, z0, x1, z1, seed = 1) {
  shoulderRect(ctx, x0, z0, x1, z1, 1.4)
  const packed = M('snow_packed'), dirty = M('snow_dirty'), ice = M('ice'), asph = M('asphalt')
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  ctx.terrain.apply(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (x, z) => {
    const r = rnd()
    let mat = packed
    if (r < 0.05) mat = ice
    else if (r < 0.12) mat = dirty
    else if (r < 0.15) mat = asph
    return { h: 1, mat }
  })
}

/**
 * World rect of a residential building's body (+margins) for (x, z, rot) as placeResidential
 * takes them. Returns {x0,z0,x1,z1} and the size record.
 */
export function resRect(series, floors, sections, x, z, rot, extra = 0) {
  const s = residentialSize(series, floors, sections)
  const L = s.length, D = s.depth
  const f = s.frontMargin, b = s.backMargin
  let r
  switch (rot & 3) {
    case 0: r = { x0: x, x1: x + L, z0: z - f, z1: z + D + b }; break
    case 1: r = { x0: x - f, x1: x + D + b, z0: z - L, z1: z }; break
    case 2: r = { x0: x - L, x1: x, z0: z - D - b, z1: z + f }; break
    default: r = { x0: x - D - b, x1: x + f, z0: z, z1: z + L }
  }
  r.x0 -= extra; r.z0 -= extra; r.x1 += extra; r.z1 += extra
  return { ...r, size: s }
}

/** Body-only rect (no porches/balconies) — for ground pads. */
export function resBody(series, floors, sections, x, z, rot) {
  const s = residentialSize(series, floors, sections)
  const L = s.length, D = s.depth
  switch (rot & 3) {
    case 0: return { x0: x, x1: x + L, z0: z, z1: z + D }
    case 1: return { x0: x, x1: x + D, z0: z - L, z1: z }
    case 2: return { x0: x - L, x1: x, z0: z - D, z1: z }
    default: return { x0: x - D, x1: x, z0: z, z1: z + L }
  }
}

/**
 * Courtyard lawn snow: 0.5 m with small wind-packed drift patches (0.75 m) — smaller and more
 * broken than base paintYard's 12 m plateaus, which read as terraces at eye height.
 */
export function paintLawn(ctx, x0, z0, x1, z1, seed = 9) {
  const snow = M('snow'), fresh = M('snow_fresh')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const big = fbm2(x * 0.045, z * 0.045, 2, seed)
    const n = fbm2(x * 0.21, z * 0.17, 3, seed + 7) * 0.7 + valueNoise2(x * 0.9, z * 0.9, seed + 3) * 0.3
    const h = n + (big - 0.5) * 0.25 > 0.69 ? 3 : 2
    const m = fbm2(x * 0.5, z * 0.5, 2, seed + 1) > 0.55 ? fresh : snow
    return { h, mat: m }
  })
}

/** Lower snow lumps (> maxH) within `r` m of a polyline, so paths never sit in 0.5 m trenches. */
export function shoulder(ctx, pts, r = 2.2, maxH = 0.5) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z) }
  const mv = Math.round(maxH / 0.25)
  ctx.terrain.apply(x0 - r, z0 - r, x1 + r, z1 + r, (x, z, h) => {
    if (h <= mv) return null
    if (h > mv + 2) return null // real banks / piles stay
    return distToPolyline(x, z, pts) < r ? { h: mv } : null
  })
}

/** Same for a rect (sidewalk edges, passages). */
export function shoulderRect(ctx, x0, z0, x1, z1, r = 1.6, maxH = 0.5) {
  const mv = Math.round(maxH / 0.25)
  ctx.terrain.apply(Math.min(x0, x1) - r, Math.min(z0, z1) - r, Math.max(x0, x1) + r, Math.max(z0, z1) + r, (x, z, h) => (h > mv && h <= mv + 2 ? { h: mv } : null))
}

/** Trodden path through snow: paint it, register it for pedestrians, optionally lay old footprints. */
export function trodden(ctx, points, o = {}) {
  shoulder(ctx, points, (o.width ?? 1.3) / 2 + 1.6)
  paintPath(ctx, { points, width: o.width ?? 1.3, wobble: o.wobble ?? 0.5, seed: o.seed ?? 5, mat: o.mat })
  if (o.nav !== false) ctx.navPaths.push({ points: points.map(p => [p[0], p[1]]), kind: o.kind ?? 'trodden' })
  if (o.trail && ctx.footprints?.addTrail) {
    try { ctx.footprints.addTrail(o.trail === true ? points : o.trail, ctx.terrain, o.age ?? 0.45) } catch (e) { void e }
  }
}

/** Distance from point to a polyline segment list. */
export function distToPolyline(x, z, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const dx = bx - ax, dz = bz - az
    const l2 = dx * dx + dz * dz || 1
    let t = ((x - ax) * dx + (z - az) * dz) / l2
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return best
}

/** Keep-out registry for tree scattering etc.: rects [x0,z0,x1,z1] and polylines with radius. */
export class KeepOut {
  constructor() { this.rects = []; this.lines = []; this.circles = [] }
  rect(x0, z0, x1, z1, m = 0) { this.rects.push([Math.min(x0, x1) - m, Math.min(z0, z1) - m, Math.max(x0, x1) + m, Math.max(z0, z1) + m]); return this }
  line(pts, r) { this.lines.push([pts, r]); return this }
  circle(x, z, r) { this.circles.push([x, z, r]); return this }
  hit(x, z) {
    for (const [a, b, c, d] of this.rects) if (x > a && x < c && z > b && z < d) return true
    for (const [x0, z0, r] of this.circles) if (Math.hypot(x - x0, z - z0) < r) return true
    for (const [pts, r] of this.lines) if (distToPolyline(x, z, pts) < r) return true
    return false
  }
}

export const lerp = (a, b, t) => a + (b - a) * t
