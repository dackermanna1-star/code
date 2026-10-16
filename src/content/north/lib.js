// Small shared helpers for the north layout package (park, ул. Заводская, industrial edge,
// railway). Everything here is deterministic and allocation-light.

import { VOXEL } from '../../core/constants.js'
import { getModelDef } from '../../core/models.js'

export const V = VOXEL
export const PI = Math.PI
export const HALF_PI = Math.PI / 2
export const TAU = Math.PI * 2

/** Push a pedestrian route (rounded points) for the life package. */
export function nav(ctx, points, kind = 'path', extra = {}) {
  if (!ctx.navPaths || !points || points.length < 2) return
  ctx.navPaths.push({ points: points.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), kind, ...extra })
}

/** Append to a registry array. */
export function reg(ctx, key, v) {
  if (!ctx.registry) return v
  ;(ctx.registry[key] ||= []).push(v)
  return v
}

/** Terrain height at (x, z), never -Infinity. */
export function groundY(ctx, x, z, fallback = 0.5) {
  const h = ctx.terrain.heightAt(x, z)
  return Number.isFinite(h) ? h : fallback
}

/** Is another content package loaded (by name)? */
export function hasPkg(ctx, name) {
  return (ctx.game?.modules || []).some(m => m.name === name)
}

/** Run fn and swallow (but log once) any error, so one broken prop never kills the district. */
export function safe(label, fn) {
  try { return fn() } catch (e) {
    console.warn(`[north] ${label} failed:`, e?.message || e)
    return null
  }
}

/**
 * Fine-voxel model support (rails, thin rods): the model is authored in voxels of
 * VOXEL * scale and declared with lods [scale, 0.999]; the 0.999 level is a plain 25 cm
 * reduction. (Engine request: a first-class voxelScale option.)
 */
export function fineModel(m, scale = 0.5) {
  m.voxelScale = scale
  const base = Object.getPrototypeOf(m).downsample
  m.downsample = function (f, minFill, lodRemap) {
    const k = Math.round(f / scale)
    if (k <= 1) return this
    return base.call(this, k, 1, lodRemap)
  }
  return m
}

/** world.place for a fine model (fixes the AABB the engine computes in 25 cm units first). */
export function placeFine(ctx, name, o) {
  const d = getModelDef(name)
  if (d && !d._northFine) {
    d._northFine = true
    const s = d.model?.voxelScale
    if (s && s !== 1) for (let k = 0; k < 3; k++) { d.min[k] *= s; d.max[k] *= s }
  }
  return ctx.world.place(name, o)
}

/** Point along a polyline at distance d. */
export function alongPolyline(pts, d) {
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const L = Math.hypot(bx - ax, bz - az)
    if (acc + L >= d || i === pts.length - 2) {
      const t = L > 0 ? Math.min(1, Math.max(0, (d - acc) / L)) : 0
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (L || 1), dz: (bz - az) / (L || 1), seg: i }
    }
    acc += L
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0, seg: 0 }
}

export function polylineLength(pts) {
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  return L
}

/** Distance from (x, z) to a polyline. */
export function distToPolyline(x, z, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const dx = bx - ax, dz = bz - az
    const L2 = dx * dx + dz * dz || 1e-9
    let t = ((x - ax) * dx + (z - az) * dz) / L2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const ex = ax + dx * t - x, ez = az + dz * t - z
    best = Math.min(best, Math.hypot(ex, ez))
  }
  return best
}

/** Smooth a polyline with Chaikin corner cutting (keeps the end points). */
export function chaikin(pts, iterations = 2) {
  let p = pts
  for (let it = 0; it < iterations; it++) {
    const out = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1]
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75])
    }
    out.push(p[p.length - 1])
    p = out
  }
  return p
}

/** Resample a polyline every `step` meters (end point included). */
export function resample(pts, step) {
  const L = polylineLength(pts)
  const n = Math.max(1, Math.round(L / step))
  const out = []
  for (let i = 0; i <= n; i++) { const a = alongPolyline(pts, (i / n) * L); out.push([a.x, a.z]) }
  return out
}

/** Angle (Signs / street convention: front faces (sin a, cos a)) facing direction (dx, dz). */
export const facing = (dx, dz) => Math.atan2(dx, dz)

/** Placement angle that turns model +X onto direction (dx, dz) (THREE convention). */
export const alongAngle = (dx, dz) => Math.atan2(-dz, dx)
