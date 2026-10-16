// Small nature props: snow chunks thrown by the plough, things buried in plough piles, the
// falling snow clump, and the pond warning-sign post.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { RNG } from '../../core/rng.js'
import { MAT } from './materials.js'

// ---- snow chunks: lumps of packed, dirty snow at the foot of plough piles -----------------------
function chunk(seed, size) {
  const rng = new RNG(seed)
  const n = size + 3
  const m = new VoxelModel(n, n, n)
  const c = n / 2
  for (let k = 0; k < 3; k++) {
    const rx = rng.float(size * 0.35, size * 0.6), ry = rng.float(size * 0.3, size * 0.5), rz = rng.float(size * 0.35, size * 0.6)
    m.ellipsoid(c + rng.float(-0.8, 0.8), ry + rng.float(-0.3, 0.2), c + rng.float(-0.8, 0.8), rx, ry, rz, rng.chance(0.5) ? MAT.snowDirty : MAT.snowBank)
  }
  // grimy sides, fresher top
  for (let y = 0; y < n; y++)
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const id = m.get(x, y, z)
        if (!id) continue
        if (!m.get(x, y + 1, z)) { if (rng.chance(0.7)) m.set(x, y, z, MAT.snow) }
        else if (rng.chance(0.25)) m.set(x, y, z, MAT.snowGrime)
      }
  return m
}
;[[1, 2], [2, 3], [3, 4], [4, 5]].forEach(([i, s]) => defineModel(`nature_snow_chunk_${i - 1}`, () => chunk(700 + i, s), { lods: [1], maxDistance: 120 }))

// ---- the falling clump (dynamic, non-colliding) ---------------------------------------------------
defineModel('nature_snow_clump', () => {
  const m = new VoxelModel(3, 2, 3)
  m.fill(0, 0, 1, 3, 1, 1, MAT.snowBranch)
  m.fill(1, 0, 0, 1, 2, 3, MAT.snowBranch)
  m.set(1, 1, 1, MAT.snowBranch)
  return m
}, { lods: [1], maxDistance: 80, collide: false, contact: false, dynamic: true })

// ---- things that end up in a plough pile ------------------------------------------------------------
// Each is modelled already tilted/half-sunk; place it on the pile surface (pivot = its base).

/** Discarded New Year tree (ёлка) lying at an angle, with a strand of tinsel. */
defineModel('nature_buried_yolka', () => {
  const m = new VoxelModel(12, 8, 7)
  const rng = new RNG(11)
  // stem at ~25°
  for (let i = 0; i < 11; i++) m.set(i, Math.round(1 + i * 0.45), 3, MAT.bark)
  for (let i = 1; i < 10; i++) {
    const y = 1 + i * 0.45, r = 3.0 - i * 0.26
    for (let dz = -3; dz <= 3; dz++)
      for (let dy = -2; dy <= 2; dy++) {
        if (dz * dz + dy * dy * 1.6 > r * r || !rng.chance(0.62)) continue
        m.setIfEmpty(i, Math.round(y + dy), 3 + dz, MAT.needles)
      }
  }
  // tinsel: silvery strand and a forgotten red bauble
  for (let i = 2; i < 9; i++) m.set(i, Math.round(2.6 + i * 0.45 + (i % 2)), 3 + ((i % 3) - 1) * 2, MAT.chrome)
  m.set(5, 5, 1, MAT.metalRed)
  m.addSnow({ mat: MAT.snowBranch, depth: 1, chance: 0.55, seed: 3 })
  m.setPivot(5, 1, 3.5)
  return m
}, { lods: [1, 2], lodDistances: [40], maxDistance: 140, collide: false })

/** Car tyre standing half-buried. */
defineModel('nature_buried_tire', () => {
  const m = new VoxelModel(4, 4, 2)
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const dx = x - 1.5, dy = y - 1.5
    const d = Math.hypot(dx, dy)
    if (d > 0.9 && d < 2.2) m.fill(x, y, 0, 1, 1, 2, MAT.rubber)
  }
  m.addSnow({ mat: MAT.snowBranch, depth: 1, chance: 0.6, seed: 5 })
  m.setPivot(2, 1, 1)
  return m
}, { lods: [1], maxDistance: 100 })

/** Children's sled (санки) sticking up out of the snow. */
defineModel('nature_buried_sled', () => {
  const m = new VoxelModel(2, 5, 3)
  m.fill(0, 0, 0, 1, 4, 1, MAT.metalGray)
  m.fill(0, 0, 2, 1, 4, 1, MAT.metalGray)
  m.fill(1, 1, 0, 1, 3, 3, MAT.paint)
  m.set(0, 4, 0, MAT.metalGray); m.set(0, 4, 2, MAT.metalGray)
  m.fill(0, 4, 1, 1, 1, 1, MAT.metalGray)
  m.setPivot(1, 1, 1.5)
  return m
}, { lods: [1], maxDistance: 90 })

/** A ski stuck upright in the pile. */
defineModel('nature_buried_ski', () => {
  const m = new VoxelModel(1, 8, 1)
  m.fill(0, 0, 0, 1, 7, 1, MAT.paint)
  m.set(0, 7, 0, MAT.snowBranch)
  m.setPivot(0.5, 2, 0.5)
  return m
}, { lods: [1], maxDistance: 90 })

/** Old wooden chair, upside down, legs in the air. */
defineModel('nature_buried_chair', () => {
  const m = new VoxelModel(3, 5, 3)
  m.fill(0, 1, 0, 3, 1, 3, MAT.woodDark)
  for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]]) m.fill(x, 2, z, 1, 2, 1, MAT.woodDark)
  m.fill(0, 0, 2, 3, 1, 1, MAT.woodDark)
  m.addSnow({ mat: MAT.snowBranch, depth: 1, chance: 0.7, seed: 9 })
  m.setPivot(1.5, 1, 1.5)
  return m
}, { lods: [1], maxDistance: 90 })

/** Wooden pallet edge. */
defineModel('nature_buried_pallet', () => {
  const m = new VoxelModel(5, 3, 2)
  for (let y = 0; y < 3; y++) m.fill(0, y, 0, 5, 1, 1, MAT.wood)
  m.fill(0, 0, 1, 1, 3, 1, MAT.wood); m.fill(2, 0, 1, 1, 3, 1, MAT.wood); m.fill(4, 0, 1, 1, 3, 1, MAT.wood)
  m.addSnow({ mat: MAT.snowBranch, depth: 1, chance: 0.8, seed: 13 })
  m.setPivot(2.5, 1, 1)
  return m
}, { lods: [1], maxDistance: 90 })

export const BURIED = ['yolka', 'tire', 'sled', 'ski', 'chair', 'pallet']
export const BURIED_TINT = { sled: [0x8a3a30, 0x47607a, 0x4f6450], ski: [0x9a3a2a, 0x3f5878, 0xb0903a] }

// ---- pond warning sign: steel post with a board (text drawn via ctx.signs) -----------------------
// Board front faces local −Z (rot 0 → the board reads toward the north).
defineModel('nature_sign_post', () => {
  const m = new VoxelModel(6, 11, 2)
  m.fill(1, 0, 1, 1, 10, 1, MAT.metalGray)
  m.fill(4, 0, 1, 1, 10, 1, MAT.metalGray)
  m.fill(0, 6, 1, 6, 4, 1, MAT.metalDark)
  m.set(1, 3, 1, MAT.metalRust); m.set(4, 2, 1, MAT.metalRust)
  m.addSnow({ mat: MAT.snowBranch, depth: 1, seed: 21 })
  m.setPivot(3, 0, 1.5)
  return m
}, { lods: [1, 2], lodDistances: [40], maxDistance: 120 })
