// Small shared helpers for the blocks_west layout (ground pads, paths + nav, safe sections).

import { M } from '../../core/materials.js'
import { paintPath } from '../base/api.js'
import { RNG, fbm2, valueNoise2 } from '../../core/rng.js'
import { snowBank } from '../nature/api.js'
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

/**
 * Paved courtyard sidewalk at 0.25 m: packed snow over asphalt, worn in soft patches (dirty
 * snow where people walk, a little bare asphalt and the odd frozen puddle) — noise clusters,
 * never single random cells (those read as holes at eye height).
 */
export function paveWalk(ctx, x0, z0, x1, z1, seed = 1) {
  shoulderRect(ctx, x0, z0, x1, z1, 1.4)
  const packed = M('snow_packed'), dirty = M('snow_dirty'), ice = M('ice'), asph = M('asphalt'), snow = M('snow')
  ctx.terrain.apply(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (x, z) => {
    const n = fbm2(x * 0.32, z * 0.32, 3, seed)
    const w = valueNoise2(x * 0.11, z * 0.11, seed + 11)
    let mat = packed
    if (n > 0.66) mat = snow
    else if (n < 0.3) mat = dirty
    if (n < 0.22 && w > 0.55) mat = asph
    if (n < 0.2 && w < 0.3) mat = ice
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
 * Courtyard lawn snow: flat 0.5 m with rare small wind-packed lumps (0.75 m) in a few zones.
 * Large 0.75 m plateaus (base paintYard) read as terraces at eye height, so they stay small.
 */
export function paintLawn(ctx, x0, z0, x1, z1, seed = 9) {
  const snow = M('snow'), fresh = M('snow_fresh')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const zone = fbm2(x * 0.035, z * 0.035, 2, seed)
    const n = fbm2(x * 0.5, z * 0.5, 2, seed + 7)
    const h = zone > 0.6 && n > 0.68 ? 3 : 2
    const m = fbm2(x * 0.5, z * 0.5, 2, seed + 1) > 0.55 || h === 3 ? fresh : snow
    return { h, mat: m }
  })
}

/**
 * A plough windrow along a straight edge, broken into pieces with openings (people climb over
 * where it is low, cross where it is cut) and varying height. axis 'x': runs along x from a to b,
 * across w0..w1 (z); axis 'z': runs along z, across w0..w1 (x). gaps = absolute [from, to].
 */
export function windrow(ctx, axis, w0, w1, a, b, height, gaps, seed, dirtySide) {
  const rng = new RNG(seed)
  const cuts = (gaps || []).map(g => [Math.min(g[0], g[1]), Math.max(g[0], g[1])]).sort((p, q) => p[0] - q[0])
  const pieces = []
  let cur = a
  for (const [g0, g1] of cuts) {
    if (g1 <= cur || g0 >= b) continue
    if (g0 > cur) pieces.push([cur, g0])
    cur = Math.max(cur, g1)
  }
  if (cur < b) pieces.push([cur, b])
  for (const [p0, p1] of pieces) {
    let s0 = p0
    while (p1 - s0 > 30) {
      const e = s0 + rng.float(14, 28)
      emit(s0, e)
      s0 = e + rng.float(2.0, 3.5)
    }
    if (p1 - s0 > 2.5) emit(s0, p1)
  }
  function emit(s0, s1) {
    const h = height * rng.float(0.7, 1.15)
    if (axis === 'z') snowBank(ctx, w0, s0, w1, s1, h, { dirtySide, seed: rng.int(1, 1e6) })
    else snowBank(ctx, s0, w0, s1, w1, h, { dirtySide, seed: rng.int(1, 1e6) })
  }
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

/**
 * Trodden path through the lawn snow (a 0.25 m trench, as real тропинки are): white trampled snow
 * at the edges, a greyer packed strip down the middle; registered for pedestrians, optionally
 * with an old footprint trail (laid in init).
 */
export function trodden(ctx, points, o = {}) {
  const width = o.width ?? 1.5
  const seed = o.seed ?? 5, wobble = o.wobble ?? 0.5
  shoulder(ctx, points, width / 2 + 1.6)
  paintPath(ctx, { points, width, wobble, seed, mat: o.edgeMat ?? M('snow') })
  paintPath(ctx, { points, width: Math.max(0.5, width * 0.45), wobble, seed, mat: o.mat ?? M('snow_packed') })
  if (o.nav !== false) ctx.navPaths.push({ points: points.map(p => [p[0], p[1]]), kind: o.kind ?? 'trodden' })
  if (o.trail) TRAILS.push({ points: o.trail === true ? points : o.trail, age: o.age ?? 0.45 })
}

/** Old footprint trails, laid in init() on the final terrain (see index.js). */
export const TRAILS = []
export function layTrails(ctx) {
  if (!ctx.footprints?.addTrail) return
  for (const t of TRAILS) safe('trail', () => ctx.footprints.addTrail(t.points, ctx.terrain, t.age))
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

/**
 * Make sure an entrance's bulb works (the residential helper breaks a seeded share of them):
 * re-lights the dark fixture and adds the same calibrated light the helper would have added.
 */
export function ensureEntranceLamp(ctx, building, e, o = {}) {
  if (!e || e.lamp) return e?.lamp ?? null
  const lamps = (building?.placements || []).filter(p => p.tag === 'lamp')
  let best = null, bd = Infinity
  for (const p of lamps) {
    const d = Math.hypot(p.x - e.x, p.z - e.z)
    if (d < bd) { bd = d; best = p }
  }
  if (!best || bd > 1.5) return null
  best.flag = 1
  const fx = Math.sin(e.angle), fz = Math.cos(e.angle)
  const l = ctx.lights.add({
    x: best.x + fx * 0.8, y: best.y - 0.175, z: best.z + fz * 0.8, color: 0xffd29a, intensity: o.intensity ?? 4.4, range: 8.5,
    type: 'point', schedule: 'night', domain: 'outdoor', flicker: o.flicker ?? 'none', placement: best, halo: true, haloSize: 0.6, tag: 'entrance_lamp',
  })
  e.lamp = l
  return l
}
