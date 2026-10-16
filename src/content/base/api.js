// Shared ground-painting helpers for layout packages, so every district treats roads, curbs,
// sidewalks, driveways and trodden paths the same way.
//
// Height conventions (meters): road / driveway surface 0.0, sidewalks & courtyard paths 0.25,
// untouched lawn snow 0.5, plowed banks 0.6–1.4.

import { M } from '../../core/materials.js'
import { RNG, fbm2, valueNoise2 } from '../../core/rng.js'
import { VOXEL } from '../../core/constants.js'

const snap = v => Math.round(v / VOXEL) * VOXEL

/**
 * Straight road (east-west if axis 'x', north-south if 'z') from (x0,z0) to (x1,z1) as a
 * rectangle. Lanes get darker wet tyre tracks; the space between lanes is dirty packed snow.
 * opts: { axis, lanes: [centers along the cross axis], laneWidth=3.5, curb=true, banks=true,
 *         bankSides: ['min','max'], bankHeight=0.9, seed, gaps: [[from,to]] (no bank, e.g. crossings, driveways) }
 */
export function paintRoad(ctx, o) {
  const { terrain } = ctx
  const rng = new RNG(o.seed ?? 11)
  const ax = o.axis ?? 'x'
  const x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1)
  const z0 = Math.min(o.z0, o.z1), z1 = Math.max(o.z0, o.z1)
  const slush = M('slush'), wet = M('asphalt_wet'), dirty = M('snow_dirty'), packed = M('snow_packed')
  const laneW = o.laneWidth ?? 3.5
  const lanes = o.lanes ?? []
  const seed = o.seed ?? 11
  terrain.apply(x0, z0, x1, z1, (x, z) => {
    const along = ax === 'x' ? x : z
    const across = ax === 'x' ? z : x
    let mat = slush
    // tyre tracks: two wheel ruts per lane, ~1.6 m apart
    let best = 99
    for (const c of lanes) best = Math.min(best, Math.abs(across - c))
    if (lanes.length) {
      const inLane = best < laneW / 2
      if (inLane) {
        const w1 = Math.abs(best - 0.8)
        const wobble = (valueNoise2(along * 0.05, across * 0.3, seed) - 0.5) * 0.35
        mat = Math.abs(w1 + wobble) < 0.32 ? wet : slush
      } else {
        // between lanes: ridge of grey slush/packed snow
        mat = valueNoise2(along * 0.3, across * 2, seed + 3) > 0.45 ? dirty : packed
      }
    }
    // occasional brown slush patches
    if (fbm2(x * 0.15, z * 0.15, 2, seed + 9) > 0.68) mat = slush
    return { h: 0, mat }
  })
  if (o.curb !== false) {
    const sides = o.bankSides ?? ['min', 'max']
    for (const side of sides) {
      const c = ax === 'x' ? (side === 'min' ? z0 : z1) : (side === 'min' ? x0 : x1)
      const cs = side === 'min' ? c - VOXEL : c
      if (ax === 'x') terrain.paintRect(x0, cs, x1, cs + VOXEL, M('curb'))
      else terrain.paintRect(cs, z0, cs + VOXEL, z1, M('curb'))
    }
  }
  if (o.banks !== false) {
    const sides = o.bankSides ?? ['min', 'max']
    const h = o.bankHeight ?? 0.9
    for (const side of sides) {
      const len = ax === 'x' ? x1 - x0 : z1 - z0
      for (let d = 0; d < len; d += rng.float(2.5, 5)) {
        const along = (ax === 'x' ? x0 : z0) + d
        if (o.gaps && o.gaps.some(([a, b]) => along > a - 2 && along < b + 2)) continue
        const off = rng.float(0.6, 1.3)
        const c = ax === 'x' ? (side === 'min' ? z0 - off : z1 + off) : (side === 'min' ? x0 - off : x1 + off)
        const rx = rng.float(1.6, 3.4), rz = rng.float(0.7, 1.2)
        const hh = h * rng.float(0.55, 1.15)
        const bankMat = rng.chance(0.35) ? dirty : M('snow_bank')
        if (ax === 'x') terrain.mound(along, c, rx, rz, hh, bankMat, 0.2, rng.int(0, 1e6))
        else terrain.mound(c, along, rz, rx, hh, bankMat, 0.2, rng.int(0, 1e6))
      }
    }
  }
}

/** Sidewalk / paved area at 0.25 m: packed snow with slush near busy edges and worn centre. */
export function paintSidewalk(ctx, x0, z0, x1, z1, seed = 3) {
  const packed = M('snow_packed'), dirty = M('snow_dirty'), snow = M('snow'), ice = M('ice')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const n = fbm2(x * 0.35, z * 0.35, 3, seed)
    let mat = packed
    if (n > 0.66) mat = snow
    else if (n < 0.28) mat = dirty
    if (valueNoise2(x * 1.3, z * 1.3, seed + 5) > 0.93) mat = ice
    return { h: 1, mat }
  })
}

/**
 * Driveway (проезд) along a polyline at road height with tyre ruts in packed snow and low
 * plowed banks. opts: { points: [[x,z],...], width=6, banks=true, seed }
 */
export function paintDriveway(ctx, o) {
  const { terrain } = ctx
  const w = o.width ?? 6
  const pts = o.points
  const seed = o.seed ?? 21
  const rng = new RNG(seed)
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    terrain.paintLine(ax, az, bx, bz, w, { mat: M('snow_packed'), height: 0 })
    // two ruts
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1
    const nx = -dz / len, nz = dx / len
    for (const off of [-0.8, 0.8]) {
      terrain.paintLine(ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, 0.55, { mat: M('snow_dirty'), only: new Set([M('snow_packed')]) })
    }
    if (o.banks !== false) {
      for (let d = 0; d < len; d += rng.float(3, 6)) {
        for (const side of [-1, 1]) {
          if (rng.chance(0.25)) continue
          const t = d / len
          const off = side * (w / 2 + rng.float(0.4, 1.0))
          terrain.mound(ax + dx * t + nx * off, az + dz * t + nz * off, rng.float(1.2, 2.6), rng.float(1.2, 2.6), rng.float(0.3, 0.75), M('snow_bank'), 0.25, rng.int(0, 1e6))
        }
      }
    }
  }
}

/**
 * Trodden footpath through deep snow (narrow, slightly meandering) at 0.25 m.
 * opts: { points, width=1.4, wobble=0.6, seed, mat }
 */
export function paintPath(ctx, o) {
  const { terrain } = ctx
  const seed = o.seed ?? 5
  const w = o.width ?? 1.4
  const wob = o.wobble ?? 0.6
  const mat = o.mat ?? M('snow_packed')
  const pts = o.points
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.ceil(len / 2))
    const nx = -(bz - az) / (len || 1), nz = (bx - ax) / (len || 1)
    let prev = null
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const s = (valueNoise2((ax + (bx - ax) * t) * 0.12, (az + (bz - az) * t) * 0.12, seed) - 0.5) * 2 * wob
      const end = k === 0 || k === n ? 0 : 1
      const p = [ax + (bx - ax) * t + nx * s * end, az + (bz - az) * t + nz * s * end]
      if (prev) terrain.paintLine(prev[0], prev[1], p[0], p[1], w, { mat, height: 0.25 })
      prev = p
    }
  }
}

/** Untouched lawn snow (0.5 m) with gentle undulation. */
export function paintYard(ctx, x0, z0, x1, z1, seed = 9) {
  const snow = M('snow'), fresh = M('snow_fresh')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const n = fbm2(x * 0.08, z * 0.08, 3, seed)
    return { h: n > 0.62 ? 3 : 2, mat: fbm2(x * 0.5, z * 0.5, 2, seed + 1) > 0.55 ? fresh : snow }
  })
}

/** A plowed pile of dirty snow (end of a driveway, parking corner). */
export function plowPile(ctx, x, z, size = 3, seed = 1) {
  const rng = new RNG(seed)
  for (let i = 0; i < 4; i++) {
    ctx.terrain.mound(x + rng.float(-size, size) * 0.4, z + rng.float(-size, size) * 0.4, size * rng.float(0.5, 0.9), size * rng.float(0.5, 0.9), size * rng.float(0.25, 0.45), M('snow_dirty'), 0.6, rng.int(0, 1e6))
  }
}

/** Drift of fresh snow piled against a wall/fence line from (x0,z0) to (x1,z1). */
export function driftAlong(ctx, x0, z0, x1, z1, height = 0.5, seed = 2) {
  const rng = new RNG(seed)
  const len = Math.hypot(x1 - x0, z1 - z0)
  for (let d = 0; d < len; d += rng.float(1.5, 3)) {
    const t = d / len
    ctx.terrain.mound(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rng.float(1, 2.2), rng.float(1, 2.2), height * rng.float(0.5, 1.1), M('snow_fresh'), 0.5, rng.int(0, 1e6))
  }
}

export { snap }
