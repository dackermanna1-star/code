// Placement helpers for trees and plants: single trees, scattered groves, area sampling.

import { getModelDef } from '../../core/models.js'
import { RNG, hash2 } from '../../core/rng.js'
import { SPECIES } from './trees.js'
import { natureState, addTreeRecord, treesNear, placeModel } from './state.js'

const TAU = Math.PI * 2
const SIZE_WORDS = { tiny: 0.05, small: 0.2, young: 0.2, medium: 0.5, large: 0.8, old: 0.95, huge: 1 }

/** Deterministic seed from coordinates. */
export function seedAt(x, z, salt = 0) {
  return hash2(Math.round(x * 16) ^ (salt * 7919), Math.round(z * 16) + salt * 104729)
}

function parseSpecies(spec) {
  // 'poplar' | 'poplar:pollarded'
  const [species, kind] = String(spec).split(':')
  return { species, kind: kind || null }
}

/**
 * Pick a variant record of a species. size: number (target height m) | 'small' | 'medium' |
 * 'large' | 0..1 quantile via {q}. kind filters variant kinds (e.g. 'pollarded', 'blue').
 */
export function pickVariant(species, o, rng) {
  const sp = SPECIES[species]
  if (!sp) return null
  let list = sp.variants
  if (o.kind) {
    const f = list.filter(v => v.kind === o.kind)
    if (f.length) list = f
  }
  if (o.variant !== undefined && o.variant !== null) {
    if (typeof o.variant === 'string') return sp.variants.find(v => v.name === o.variant) || list[0]
    return sp.variants[((o.variant | 0) % sp.variants.length + sp.variants.length) % sp.variants.length]
  }
  const size = o.size
  if (size === undefined || size === null) return list[Math.floor(rng.next() * list.length)]
  const sorted = [...list].sort((a, b) => a.height - b.height)
  if (typeof size === 'number' && size > 1.5) {
    // nearest heights, a little randomness between the two closest
    sorted.sort((a, b) => Math.abs(a.height - size) - Math.abs(b.height - size))
    return sorted[rng.chance(0.7) || sorted.length < 2 ? 0 : 1]
  }
  const q = typeof size === 'number' ? size : (SIZE_WORDS[size] ?? 0.5)
  const i = Math.round(q * (sorted.length - 1) + rng.float(-0.6, 0.6))
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))]
}

/**
 * Place one tree.
 * o: { x, z, y?, species: 'birch'|'poplar'|'maple'|'linden'|'apple'|'spruce'|'rowan'|'sapling'
 *      (optionally 'poplar:pollarded', 'spruce:blue', 'maple:negundo', 'birch:clump'),
 *      size (m | 'small'|'medium'|'large'), variant (index | model name), kind,
 *      rot (quarter turns) | angle (radians), seed, tag }
 * Places the trunk model and, for deciduous species, its fine-voxel crown model (`<name>_crown`).
 * Returns a tree handle { placement, crown, species, name, x, y, z, height, crownR, perches(), snowSpots() }.
 */
export function placeTree(ctx, o) {
  const s = natureState(ctx)
  const { species, kind } = parseSpecies(o.species ?? 'birch')
  const seed = o.seed ?? seedAt(o.x, o.z, 3)
  const rng = new RNG(seed)
  const v = pickVariant(SPECIES[species] ? species : 'birch', { ...o, kind: o.kind ?? kind }, rng)
  if (!v) return null
  const angle = o.angle ?? ((o.rot ?? rng.int(0, 3)) * Math.PI / 2)
  const p = placeModel(ctx, v.name, {
    x: o.x, z: o.z, y: o.y, yOffset: o.yOffset, angle, seed: rng.next(), tag: o.tag ?? 'tree',
    userData: { species, kind: v.kind, nature: true },
  })
  if (!p) return null
  // the fine-voxel crown (branches and twigs) shares the trunk's transform
  const crown = v.crown ? placeModel(ctx, v.crown, {
    x: o.x, z: o.z, y: p.y, angle, seed: p.seed, tag: 'tree_crown', userData: { species, kind: v.kind, nature: true, trunk: p },
  }) : null
  const nat = getModelDef(v.name).model.nature || { height: v.height, crownR: 3, perches: [], snowSpots: [] }
  const t = {
    placement: p, crown, species, kind: v.kind, name: v.name, x: o.x, z: o.z, y: p.y,
    height: nat.height, crownR: nat.crownR, meta: nat,
    perches() { return nat.perches.map(q => p.toWorld(q[0], q[1], q[2])) },
    snowSpots() { return nat.snowSpots.map(q => p.toWorld(q[0], q[1], q[2])) },
    lastClump: -1e9,
  }
  addTreeRecord(s, t)
  return t
}

/** Point-in-polygon (even-odd), polygon = [[x,z], ...]. */
export function inPolygon(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Area description → { bbox:[x0,z0,x1,z1], area m², contains(x,z) }. */
export function areaOf(o) {
  if (o.polygon) {
    const P = o.polygon
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]); z0 = Math.min(z0, P[i][1]); z1 = Math.max(z1, P[i][1])
      a += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1])
    }
    return { bbox: [x0, z0, x1, z1], area: Math.abs(a) / 2, contains: (x, z) => inPolygon(x, z, P) }
  }
  const r = o.rect
  const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3])
  return { bbox: [x0, z0, x1, z1], area: (x1 - x0) * (z1 - z0), contains: (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1 }
}

/**
 * Sample well-spaced points in an area. o: { rect | polygon, count | density (per 100 m²),
 * minSpacing, avoid(x,z), seed, clump (0..1: chance a point lands near an earlier one),
 * clumpRadius, existing: [[x,z]] (also kept clear) }
 */
export function samplePoints(o) {
  const A = areaOf(o)
  const rng = new RNG(o.seed ?? 1)
  const count = o.count ?? Math.round((o.density ?? 1) * A.area / 100)
  const sp = o.minSpacing ?? 3
  const sp2 = sp * sp
  const cell = Math.max(1, sp)
  const grid = new Map()
  const key = (x, z) => (Math.floor(x / cell) + 2048) * 8192 + Math.floor(z / cell) + 2048
  const pts = []
  const near = (x, z) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const l = grid.get((cx + dx + 2048) * 8192 + cz + dz + 2048)
        if (!l) continue
        for (const q of l) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < sp2) return true
      }
    return false
  }
  const add = (x, z, mark) => {
    const k = key(x, z)
    let l = grid.get(k)
    if (!l) grid.set(k, l = [])
    l.push([x, z])
    if (mark) pts.push([x, z])
  }
  for (const e of o.existing || []) add(e[0], e[1], false)
  const [x0, z0, x1, z1] = A.bbox
  let tries = 0
  const maxTries = count * 40 + 50
  while (pts.length < count && tries++ < maxTries) {
    let x, z
    if (pts.length && o.clump && rng.chance(o.clump)) {
      const b = pts[Math.floor(rng.next() * pts.length)]
      const a = rng.float(0, TAU), d = rng.float(sp, (o.clumpRadius ?? sp * 2.2))
      x = b[0] + Math.cos(a) * d; z = b[1] + Math.sin(a) * d
    } else {
      x = rng.float(x0, x1); z = rng.float(z0, z1)
    }
    if (!A.contains(x, z)) continue
    if (o.avoid && o.avoid(x, z)) continue
    if (near(x, z)) continue
    add(x, z, true)
  }
  return pts
}

function weightedList(spec) {
  if (typeof spec === 'string') return [[spec, 1]]
  if (Array.isArray(spec)) return spec.map(s => [s, 1])
  return Object.entries(spec)
}

/**
 * Scatter trees. o: { rect:[x0,z0,x1,z1] | polygon:[[x,z],...], count | density (trees per
 * 100 m²), species: 'birch' | {birch:0.6, poplar:0.4, 'poplar:pollarded':0.2},
 * avoid(x,z) → true to skip, minSpacing (m, default 4), seed, clump (0..1), size, sizes:{species:size} }
 * Existing nature trees are kept clear too. Returns the array of tree handles.
 */
export function scatterTrees(ctx, o) {
  const s = natureState(ctx)
  const seed = o.seed ?? 77
  const A = areaOf(o)
  const existing = []
  const [x0, z0, x1, z1] = A.bbox
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  for (const t of treesNear(s, cx, cz, Math.hypot(x1 - x0, z1 - z0) / 2 + 10, [])) existing.push([t.x, t.z])
  const pts = samplePoints({ ...o, seed, minSpacing: o.minSpacing ?? 4, existing })
  const rng = new RNG(seed * 13 + 5)
  const list = weightedList(o.species ?? 'birch')
  const out = []
  for (const [x, z] of pts) {
    const spec = rng.weighted(list)
    const { species } = parseSpecies(spec)
    const size = o.sizes?.[species] ?? o.size
    const t = placeTree(ctx, { x, z, species: spec, size, seed: hash2(seed, out.length * 7 + 1) })
    if (t) out.push(t)
  }
  return out
}
