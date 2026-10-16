// Waste: the courtyard container area (3–4 steel 0.75 m³ containers, some lids open with snow
// and bags inside, in a three-sided brick or corrugated-sheet enclosure), discarded bags and
// boxes, a New Year tree thrown out with its tinsel still on (it is mid-January), litter bins
// (concrete vase urn, tilting metal urn on two posts) and a broken kitchen chair in the snow.
// Front = local +Z (the open side / the container's front); pivot bottom-centre.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, seedInt, RNG, rotXZ, localToWorld, reg, speckle } from './lib.js'
import { drawPlate } from './signs.js'
import { PLATES } from './texts.js'
import './materials.js'

export const CONTAINER_TINTS = [0x3e6648, 0x4a6a50, 0x56705e, 0x5a6a6e, 0x6a6a5e, 0x4e5f73]

function buildContainer(open) {
  const m = new VoxelModel(5, 7, 5)
  const p = M('paint')
  // body z 1..3 (0.75 m deep), 1.0 m tall; skids underneath
  m.fill(0, 0, 1, 5, 1, 3, M('metal_dark'))
  m.fill(0, 1, 1, 5, 3, 3, p)
  m.fill(1, 1, 2, 3, 3, 1, M('plastic_dark')) // contents (seen only when open)
  // rim and lifting pins
  m.fill(0, 3, 1, 5, 1, 1, M('paint_matte')); m.fill(0, 3, 3, 5, 1, 1, M('paint_matte'))
  m.set(0, 2, 2, M('metal_dark')); m.set(4, 2, 2, M('metal_dark'))
  if (open) {
    m.clear(1, 3, 2, 3, 1, 1)
    // lid flipped back, leaning against the back
    m.fill(0, 4, 0, 5, 3, 1, p)
    m.set(1, 3, 2, M('plastic_dark')); m.set(2, 3, 2, M('street_cardboard')); m.set(3, 2, 2, M('plastic_dark'))
  } else {
    m.fill(0, 4, 1, 5, 1, 3, p)
  }
  rustify(m, rngFor('container' + open), [p, M('paint_matte')], 0.18, { bottomBias: 2 })
  snowTop(m, { chance: 0.95, seed: open ? 3 : 4, vary: open ? 0 : 1 })
  m.setPivot(2.5, 0, 2.5)
  return m
}
defineModel('street_container', () => buildContainer(false), { lods: [1], maxDistance: 160 })
defineModel('street_container_open', () => buildContainer(true), { lods: [1], maxDistance: 160 })

function buildEnclosure(kind) {
  const W = 26, D = 8, H = 6
  const m = new VoxelModel(W, H + 2, D)
  const rng = rngFor('encl' + kind)
  if (kind === 'brick') {
    const b = M('brick_red'), bs = M('brick_silicate')
    m.fill(0, 0, 0, W, H, 1, b)
    m.fill(0, 0, 0, 1, H, D, b); m.fill(W - 1, 0, 0, 1, H, D, b)
    m.fill(0, H - 1, 0, W, 1, 1, bs); m.fill(0, H - 1, 0, 1, 1, D, bs); m.fill(W - 1, H - 1, 0, 1, 1, D, bs)
    speckle(m, rng, [b], M('concrete_dark'), 0.06)
    m.clear(0, H - 1, D - 1, 1, 1, 1); m.set(W - 1, H - 1, D - 2, 0) // knocked-off bricks
    for (let i = 0; i < 5; i++) m.set(rng.int(2, W - 3), rng.int(0, 2), 0, M('concrete_dark')) // soot by the bottom
  } else {
    const a = M('paint'), b2 = M('paint_matte')
    const sheet = (x, y, z) => m.set(x, y, z, (x + z) % 2 ? a : b2)
    for (let y = 0; y < H - 1; y++) { for (let x = 0; x < W; x++) sheet(x, y, 0); for (let z = 0; z < D; z++) { sheet(0, y, z); sheet(W - 1, y, z) } }
    for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1], [12, 0]]) m.fill(x, 0, z, 1, H, 1, M('metal_dark'))
    rustify(m, rng, [a, b2], 0.16, { bottomBias: 2 })
    m.clear(W - 1, 0, 3, 1, 2, 2) // bent-in corner sheet
  }
  snowTop(m, { chance: 0.95, seed: 8 })
  return m
}
defineModel('street_garbage_enclosure_brick', () => buildEnclosure('brick'), { lods: [1, 2], lodDistances: [60], maxDistance: 220 })
defineModel('street_garbage_enclosure_metal', () => buildEnclosure('metal'), { lods: [1, 2], lodDistances: [60], maxDistance: 220 })

defineModel('street_trash_bag', () => {
  const m = new VoxelModel(2, 3, 2)
  m.fill(0, 0, 0, 2, 2, 2, M('plastic_dark'))
  m.set(1, 0, 1, M('plastic_dark')); m.set(0, 1, 1, 0)
  m.set(1, 2, 0, M('plastic_dark'))
  snowTop(m, { chance: 0.7, seed: 1 })
  return m
}, { lods: [1], maxDistance: 80 })

defineModel('street_trash_box', () => {
  const m = new VoxelModel(3, 3, 2)
  const c = M('street_cardboard')
  m.fill(0, 0, 0, 3, 2, 2, c)
  m.set(0, 2, 0, c); m.set(2, 2, 1, c) // open flaps
  m.set(1, 1, 0, M('wood_dark'))
  snowTop(m, { chance: 0.9, seed: 2 })
  return m
}, { lods: [1], maxDistance: 80 })

// thrown-out New Year tree: lying on its side along X, tinsel still on
defineModel('street_discarded_tree', () => {
  const m = new VoxelModel(9, 4, 5)
  const rng = rngFor('xmastree')
  m.fill(0, 1, 2, 9, 1, 1, M('bark'))
  for (let x = 1; x < 9; x++) {
    const r = Math.max(0.6, (9 - x) * 0.28)
    for (let z = 0; z < 5; z++)
      for (let y = 0; y < 4; y++) {
        const d = Math.hypot(z - 2, (y - 1.2) * 1.3)
        if (d <= r && rng.chance(0.82)) m.set(x, y, z, M('needles'))
      }
  }
  for (let i = 0; i < 6; i++) { const x = rng.int(2, 8), z = rng.int(0, 4), y = rng.int(1, 3); if (m.get(x, y, z)) m.set(x, y, z, M('street_tinsel')) }
  m.set(8, 2, 2, M('street_tinsel'))
  snowTop(m, { chance: 0.6, seed: 4, mat: M('snow_fresh') })
  return m
}, { lods: [1], maxDistance: 90, collide: false })

defineModel('street_bin_concrete', () => {
  const m = new VoxelModel(3, 4, 3)
  const c = M('concrete')
  m.set(1, 0, 1, c); m.set(1, 1, 1, c)
  m.fill(0, 2, 0, 3, 2, 3, c)
  m.set(1, 3, 1, M('plastic_dark'))
  m.set(0, 3, 0, M('concrete_dark')); m.set(2, 2, 2, M('concrete_dark'))
  snowTop(m, { chance: 1, seed: 5 })
  m.set(1, 3, 1, M('street_cardboard'))
  return m
}, { lods: [1], maxDistance: 90 })

defineModel('street_bin_metal', () => {
  const m = new VoxelModel(4, 4, 2)
  const g = M('metal_dark')
  m.fill(0, 0, 0, 1, 4, 1, g); m.fill(3, 0, 0, 1, 4, 1, g)
  m.fill(1, 1, 0, 2, 2, 2, M('paint'))
  m.set(1, 2, 1, M('plastic_dark'))
  rustify(m, rngFor('binmetal'), [M('paint')], 0.25)
  snowTop(m, { chance: 0.9, seed: 6 })
  m.setPivot(2, 0, 0.5)
  return m
}, { lods: [1], maxDistance: 90 })

defineModel('street_chair_broken', () => {
  const m = new VoxelModel(2, 4, 2)
  const w = M('wood_dark')
  m.set(0, 0, 0, w); m.set(1, 0, 1, w); m.set(0, 0, 1, w) // one leg gone
  m.fill(0, 1, 0, 2, 1, 2, M('leatherette'))
  m.set(0, 2, 0, w); m.set(1, 3, 0, w); m.set(0, 3, 0, w)
  snowTop(m, { chance: 0.9, seed: 7 })
  return m
}, { lods: [1], maxDistance: 70 })

const S = (name, tag = 'litter') => (ctx, o = {}) => put(ctx, name, { ...o, tag: o.tag ?? tag, seed: seedInt(o.seed, 5) })
export const placeTrashBag = S('street_trash_bag')
export const placeTrashBox = S('street_trash_box')
export const placeDiscardedTree = S('street_discarded_tree')
export const placeBrokenChair = S('street_chair_broken')

/** Litter bin (урна). opts: { x, z, angle, type: 'concrete'|'metal', tint, seed } */
export function placeLitterBin(ctx, o = {}) {
  const r = new RNG(seedInt(o.seed ?? (o.x * 7 + o.z * 3), 13))
  const type = o.type ?? (r.chance(0.5) ? 'concrete' : 'metal')
  return put(ctx, type === 'metal' ? 'street_bin_metal' : 'street_bin_concrete', { ...o, tint: o.tint ?? CONTAINER_TINTS[r.int(0, CONTAINER_TINTS.length - 1)], tag: 'bin' })
}

/** Single container. opts: { x, z, angle, open, tint, seed } */
export function placeContainer(ctx, o = {}) {
  const r = new RNG(seedInt(o.seed ?? (o.x * 5 + o.z * 9), 17))
  return put(ctx, (o.open ?? r.chance(0.35)) ? 'street_container_open' : 'street_container', { ...o, tint: o.tint ?? CONTAINER_TINTS[r.int(0, CONTAINER_TINTS.length - 1)], tag: 'container' })
}

/**
 * Garbage container area. The open side faces local +Z (front, `angle`).
 * opts: { x, z, angle, seed, enclosure: 'brick'|'metal'|'none', count: 3..4, tree: auto, litter: auto }
 * Footprint ≈ 6.5 × 2 m (+1.5 m of litter in front).
 */
export function placeGarbageArea(ctx, opts) {
  const seed = seedInt(opts.seed ?? (opts.x * 3 + opts.z * 11), 29)
  const rng = new RNG(seed)
  const angle = opts.angle ?? 0
  const o = { x: opts.x, z: opts.z, angle }
  const kind = opts.enclosure ?? (rng.chance(0.6) ? 'brick' : 'metal')
  const out = []
  let encl = null
  if (kind !== 'none') {
    encl = put(ctx, `street_garbage_enclosure_${kind}`, { x: opts.x, z: opts.z, angle, seed, tint: 0x5f6a62, tag: 'garbage' })
    if (encl) out.push(encl)
  }
  const n = Math.max(1, Math.min(4, opts.count ?? rng.int(3, 4)))
  const tint = CONTAINER_TINTS[rng.int(0, CONTAINER_TINTS.length - 1)]
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 1.45 + rng.float(-0.08, 0.08)
    const [x, z] = localToWorld(o, lx, -0.05)
    const p = placeContainer(ctx, { x, z, angle: angle + rng.float(-0.06, 0.06), open: rng.chance(0.4), tint: rng.chance(0.75) ? tint : CONTAINER_TINTS[rng.int(0, 5)], seed: seed + i })
    if (p) out.push(p)
  }
  // things that did not make it into the containers
  const litter = opts.litter ?? true
  if (litter) {
    const nb = rng.int(1, 3)
    for (let i = 0; i < nb; i++) { const [x, z] = localToWorld(o, rng.float(-3, 3), rng.float(1.1, 1.9)); out.push(placeTrashBag(ctx, { x, z, angle: rng.float(0, 6.28), seed: seed + 40 + i })) }
    if (rng.chance(0.6)) { const [x, z] = localToWorld(o, rng.float(-3, 3), rng.float(1.2, 2)); out.push(placeTrashBox(ctx, { x, z, angle: rng.float(0, 6.28) })) }
    if (opts.tree ?? rng.chance(0.65)) { const [x, z] = localToWorld(o, rng.float(-2.5, 2.5), rng.float(1.6, 2.6)); out.push(placeDiscardedTree(ctx, { x, z, angle: rng.float(0, 6.28) })) }
    if (rng.chance(0.25)) { const [x, z] = localToWorld(o, rng.chance(0.5) ? -3.9 : 3.9, rng.float(0.5, 1.5)); out.push(placeBrokenChair(ctx, { x, z, angle: rng.float(0, 6.28) })) }
  }
  // stencil plate on the back wall
  if (ctx.signs && encl) {
    const [sx, sz] = rotXZ(rng.float(-1.5, 1.5), -0.98 + 0.26, angle)
    ctx.signs.add({ x: opts.x + sx, y: encl.y + 1.25, z: opts.z + sz, angle, w: 1.0, h: 0.32, ppm: 96, draw: drawPlate(PLATES.container.ru.split('\n'), { bg: '#d9d6c8', color: '#7a2a22' }), aged: 0.5, seed })
  }
  reg(ctx, 'garbage', { x: opts.x, z: opts.z, angle })
  return out.filter(Boolean)
}
