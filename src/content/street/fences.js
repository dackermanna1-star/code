// Fences fitted along polylines on the terrain: concrete diamond-pattern panels ПО-2
// (2.5 × 2 m), low painted arched lawn fences, kindergarten steel bars with points, chain-link
// (рабица) on pipe posts, temporary green corrugated construction fence, and half-buried
// painted tyres as a border. Panels run along local +X; the "outside" face is local +Z.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, seedInt, RNG, angleAlong, rotXZ, speckle } from './lib.js'
import { drawGraffiti, GRAFFITI, drawPlate } from './signs.js'
import { PLATES } from './texts.js'
import './materials.js'

const fenceOpts = { lods: [1, 2], lodDistances: [50], maxDistance: 200 }

// ПО-2: rhombus relief rendered as raised ridges (lighter) on the panel face
function buildPO2(variant) {
  const m = new VoxelModel(10, 9, 1)
  const face = M('street_po2_face'), ridge = M('street_po2_rib'), dark = M('concrete_dark')
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 10; x++) {
      // rhombus lattice: two families of diagonal ribs
      const rib = (x + y) % 4 === 0 || ((x - y) % 4 + 4) % 4 === 0
      m.set(x, y, 0, rib ? ridge : face)
    }
  m.fill(0, 0, 0, 10, 1, 1, dark)
  const rng = rngFor('po2' + variant)
  speckle(m, rng, [face, ridge], dark, 0.06)
  // rust streaks from the embedded mounting loops at the top corners
  for (const x of [1, 8]) { m.set(x, 7, 0, M('metal_rust')); m.set(x, 6, 0, M('street_rust_light')) }
  if (variant === 1) { m.set(4, 7, 0, 0); m.set(5, 7, 0, 0); m.set(5, 6, 0, M('concrete_dark')) } // chipped top
  snowTop(m, { chance: 0.92, seed: 3 + variant })
  return m
}
defineModel('street_fence_po2', () => buildPO2(0), fenceOpts)
defineModel('street_fence_po2_chipped', () => buildPO2(1), fenceOpts)

defineModel('street_fence_lawn', () => {
  const m = new VoxelModel(8, 3, 1)
  const p = M('paint_matte')
  for (let k = 0; k < 2; k++) {
    const x0 = k * 4
    m.set(x0, 0, 0, p); m.set(x0, 1, 0, p); m.set(x0 + 1, 1, 0, p); m.set(x0 + 2, 1, 0, p); m.set(x0 + 3, 1, 0, p); m.set(x0 + 3, 0, 0, p)
  }
  rustify(m, rngFor('lawnfence'), [p], 0.15)
  snowTop(m, { chance: 0.35, seed: 5 })
  return m
}, { lods: [1], maxDistance: 110 })

defineModel('street_fence_bars', () => {
  const m = new VoxelModel(10, 8, 1)
  const p = M('paint_matte')
  m.fill(0, 0, 0, 1, 7, 1, p)
  m.fill(0, 1, 0, 10, 1, 1, p)
  m.fill(0, 5, 0, 10, 1, 1, p)
  for (let x = 2; x < 10; x += 2) m.fill(x, 0, 0, 1, 7, 1, p)
  rustify(m, rngFor('barsfence'), [p], 0.05, { bottomBias: 3 })
  snowTop(m, { chance: 0.55, seed: 7 })
  return m
}, fenceOpts)

function buildChain(torn) {
  const m = new VoxelModel(10, 7, 1)
  const net = M('street_galvanized'), post = M('metal_gray')
  m.fill(0, 0, 0, 1, 7, 1, post)
  m.fill(0, 6, 0, 10, 1, 1, post)
  for (let y = 0; y < 6; y++) for (let x = 1; x < 10; x++) if ((x + y) % 2 === 0) m.set(x, y, 0, net)
  if (torn) { m.clear(4, 0, 0, 3, 3, 1); m.set(4, 0, 0, net); m.set(6, 1, 0, net) }
  rustify(m, rngFor('chain' + torn), [net], 0.1)
  snowTop(m, { chance: 0.4, seed: 9 })
  return m
}
defineModel('street_fence_chainlink', () => buildChain(false), fenceOpts)
defineModel('street_fence_chainlink_torn', () => buildChain(true), fenceOpts)

defineModel('street_fence_construction', () => {
  const m = new VoxelModel(10, 9, 1)
  for (let x = 0; x < 10; x++) m.fill(x, 0, 0, 1, 8, 1, x % 2 ? M('metal_green') : M('street_paint_green_dark'))
  m.fill(0, 0, 0, 1, 9, 1, M('metal_dark'))
  m.fill(0, 0, 0, 10, 1, 1, M('concrete_dark'))
  rustify(m, rngFor('constr'), [M('metal_green'), M('street_paint_green_dark')], 0.08)
  snowTop(m, { chance: 0.85, seed: 11 })
  return m
}, fenceOpts)

const TYPES = {
  po2: { model: v => (v % 5 === 3 ? 'street_fence_po2_chipped' : 'street_fence_po2'), len: 2.5 },
  concrete: { model: v => (v % 5 === 3 ? 'street_fence_po2_chipped' : 'street_fence_po2'), len: 2.5 },
  lawn: { model: () => 'street_fence_lawn', len: 2.0, tints: [0x5c7556, 0x7a7748, 0x4f6a5a, 0x6e7046] },
  bars: { model: () => 'street_fence_bars', len: 2.5, tints: [0x2f4a36, 0x2a2b2c, 0x3d5568] },
  kindergarten: { model: () => 'street_fence_bars', len: 2.5, tints: [0x2f4a36, 0x2a2b2c, 0x3d5568] },
  chainlink: { model: v => (v % 7 === 4 ? 'street_fence_chainlink_torn' : 'street_fence_chainlink'), len: 2.5 },
  construction: { model: () => 'street_fence_construction', len: 2.5 },
  tyres: { model: () => 'street_tyre_half', len: 0.8, tints: [0xaaa79e, 0x8e4a3e, 0x5a7282, 0xa08e52, 0x5c7254] },
}

/**
 * Fit fence panels along a polyline on the terrain.
 * opts: { points: [[x,z], ...], type: 'po2'|'lawn'|'bars'|'chainlink'|'construction'|'tyres',
 *   seed, tint (paint colour; tyres alternate), closed (repeat first point), outside: 'left'|'right'
 *   (which side the +Z face looks at; default right of the walking direction), graffiti (0..1
 *   chance per concrete panel, default 0.12), sign (construction: add the warning plate) }
 * Returns the array of placements.
 */
export function placeFence(ctx, opts) {
  const type = TYPES[opts.type] ? opts.type : 'po2'
  const T = TYPES[type]
  const pts = (opts.points || []).slice()
  if (opts.closed && pts.length > 2) pts.push(pts[0])
  const seed = seedInt(opts.seed, 17)
  const rng = new RNG(seed)
  const out = []
  let k = 0
  const tint = opts.tint ?? (T.tints ? T.tints[rng.int(0, T.tints.length - 1)] : undefined)
  const flip = opts.outside === 'left'
  const grafChance = opts.graffiti ?? 0.12
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1]
    const dx = x1 - x0, dz = z1 - z0
    const len = Math.hypot(dx, dz)
    if (len < 0.05) continue
    const n = Math.max(1, Math.ceil(len / T.len - 0.08))
    const step = len / n
    const ux = dx / len, uz = dz / len
    let angle = angleAlong(dx, dz)
    if (flip) angle += Math.PI
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * step
      // alternate a tiny perpendicular offset so overlapping panel ends never z-fight
      const off = (k % 2 ? 0.018 : -0.018)
      const x = x0 + ux * t - uz * off, z = z0 + uz * t + ux * off
      const ptint = type === 'tyres' ? T.tints[(k + (seed % 3)) % T.tints.length] : tint
      const p = put(ctx, T.model(k + seed), { x, z, angle, seed: seed + k, tint: ptint, tag: 'fence' })
      if (p) out.push(p)
      // graffiti on concrete panels
      if ((type === 'po2' || type === 'concrete') && ctx.signs && rng.chance(grafChance)) {
        const txt = GRAFFITI[rng.int(0, GRAFFITI.length - 1)]
        const side = rng.chance(0.7) ? 1 : -1
        const [gx, gz] = rotXZ(rng.float(-0.6, 0.6), side * 0.135, angle)
        const col = rng.pick(['#2b2b30', '#3a2a5a', '#5a2222', '#1f3a5a', '#e0ddd0'])
        ctx.signs.add({ x: x + gx, y: (p ? p.y : 0) + rng.float(0.7, 1.4), z: z + gz, angle: angle + (side < 0 ? Math.PI : 0), w: rng.float(0.9, 1.6), h: 0.45, ppm: 64, draw: drawGraffiti(txt, seed + k, col) })
      }
      k++
    }
  }
  if (type === 'construction' && opts.sign !== false && out.length && ctx.signs) {
    const p = out[Math.floor(out.length / 2)]
    const [sx, sz] = rotXZ(0, 0.135, p.angle)
    ctx.signs.add({ x: p.x + sx, y: p.y + 1.3, z: p.z + sz, angle: p.angle, w: 1.1, h: 0.45, ppm: 96, draw: drawPlate(PLATES.construction.ru.split('\n'), { bg: '#e8e2c8', color: '#a8261e', border: '#a8261e' }), aged: 0.3 })
  }
  return out
}

export const FENCE_TYPES = Object.keys(TYPES)
