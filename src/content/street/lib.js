// Shared helpers for the street package: voxel weathering, placement shortcuts, per-game
// runtime state, small math. Everything deterministic (seeded RNG, never Math.random).

import { M } from '../../core/materials.js'
import { RNG, hashString } from '../../core/rng.js'
import { VOXEL } from '../../core/constants.js'

export { M, RNG, VOXEL }

/** Stable RNG from a name + optional numeric salt (for model builders). */
export function rngFor(name, salt = 0) { return new RNG(hashString(name) ^ Math.imul(salt + 1, 0x9e3779b1)) }

/** Normalise a seed given as 0..1 float, integer or undefined into a uint32. */
export function seedInt(seed, fallback = 1) {
  if (seed === undefined || seed === null || Number.isNaN(seed)) return fallback >>> 0
  if (typeof seed === 'string') return hashString(seed)
  if (seed > 0 && seed < 1) return Math.floor(seed * 4294967295) >>> 0
  return (Math.floor(seed) >>> 0) || fallback
}
/** 0..1 float version of a seed (for placement.seed). */
export function seedFloat(seed) { return (seedInt(seed, 12345) % 100000) / 100000 }

// ---- voxel weathering ------------------------------------------------------------------

/**
 * Replace a fraction of voxels of the given materials with rust, biased toward the bottom
 * and toward exposed edges. mats: array of material ids; amount 0..1.
 */
export function rustify(m, rng, mats, amount = 0.15, opts = {}) {
  const set = new Set(mats)
  const rust = opts.rust ?? M('metal_rust')
  const light = opts.light ?? M('street_rust_light')
  const bottomBias = opts.bottomBias ?? 1.2
  for (let y = 0; y < m.sy; y++) {
    const yk = 1 + bottomBias * (1 - y / Math.max(1, m.sy - 1))
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const id = m.data[m.idx(x, y, z)]
        if (!set.has(id)) continue
        if (rng.next() < amount * yk * 0.5) m.set(x, y, z, rng.next() < 0.6 ? rust : light)
      }
  }
  return m
}

/** Vertical streak of `mat` running down from (x, y0, z) for `len` voxels over existing solid voxels. */
export function streak(m, x, y0, z, len, mat, only = null) {
  for (let y = y0; y > y0 - len && y >= 0; y--) {
    const id = m.get(x, y, z)
    if (!id) continue
    if (only && !only.has(id)) continue
    m.set(x, y, z, mat)
  }
  return m
}

/** Random speckle of `mat` over voxels of materials in `mats` (chips, dirt). */
export function speckle(m, rng, mats, mat, chance) {
  const set = new Set(mats)
  for (let i = 0; i < m.data.length; i++) if (set.has(m.data[i]) && rng.next() < chance) m.data[i] = mat
  return m
}

/** Snow on every exposed top with sensible defaults. */
export function snowTop(m, opts = {}) {
  return m.addSnow({ mat: opts.mat ?? M('snow'), depth: opts.depth ?? 1, chance: opts.chance ?? 1, seed: opts.seed ?? 7, vary: opts.vary ?? 0, skip: opts.skip, onlyAbove: opts.onlyAbove ?? 0 })
}

/** Thin straight bar from a to b (voxel coords, inclusive). */
export function bar(m, x0, y0, z0, x1, y1, z1, mat) { return m.line(x0, y0, z0, x1, y1, z1, mat) }

// ---- placement helpers ----------------------------------------------------------------

/**
 * Transform a local offset (meters, model space: +X right, +Z front) by an angle into world.
 * Matches World placement: world = pos + RotY(angle)·local.
 */
export function rotXZ(lx, lz, angle) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [lx * c + lz * s, -lx * s + lz * c]
}

/** World position of a local point relative to a placement origin (x,z,angle). */
export function localToWorld(o, lx, lz) {
  const [dx, dz] = rotXZ(lx, lz, o.angle ?? 0)
  return [o.x + dx, o.z + dz]
}

/** Ground height at (x, z) via terrain, finite. */
export function groundY(ctx, x, z) {
  const h = ctx.terrain?.heightAt?.(x, z)
  return Number.isFinite(h) ? h : 0
}

/** Place a model with our angle convention (front = local +Z faces (sin a, cos a)). */
export function put(ctx, name, o) {
  const opts = { x: o.x, z: o.z, angle: o.angle ?? 0 }
  if (o.y !== undefined) opts.y = o.y
  if (o.yOffset !== undefined) opts.yOffset = o.yOffset
  if (o.seed !== undefined) opts.seed = seedFloat(o.seed)
  if (o.tint !== undefined) opts.tint = o.tint
  if (o.flag !== undefined) opts.flag = o.flag
  if (o.tag !== undefined) opts.tag = o.tag
  if (o.collide !== undefined) opts.collide = o.collide
  if (o.dynamic !== undefined) opts.dynamic = o.dynamic
  if (o.visible !== undefined) opts.visible = o.visible
  if (o.userData !== undefined) opts.userData = o.userData
  return ctx.world.place(name, opts)
}

/** Angle so that a model's local +X runs along direction (dx, dz). */
export function angleAlong(dx, dz) { return Math.atan2(-dz, dx) }
/** Angle so that a model's front (local +Z) faces direction (dx, dz). */
export function angleFacing(dx, dz) { return Math.atan2(dx, dz) }

// ---- runtime state --------------------------------------------------------------------

const states = new WeakMap()
/** Per-game runtime state shared by helpers (dynamic swings, carousels, lights, phones). */
export function getState(ctx) {
  const key = ctx.game || ctx
  let s = states.get(key)
  if (!s) {
    s = {
      swings: [], carousels: [], trafficLights: [], payphones: [], handsets: [], benches: [],
      sit: null, time: 0,
    }
    states.set(key, s)
  }
  return s
}

/** Push into ctx.registry[key] (array), creating it. */
export function reg(ctx, key, item) {
  if (!ctx.registry) return item
  if (!Array.isArray(ctx.registry[key])) ctx.registry[key] = []
  ctx.registry[key].push(item)
  return item
}

export const TAU = Math.PI * 2
export function wrapAngle(a) { return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI }
