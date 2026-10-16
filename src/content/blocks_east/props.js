// Small models of the blocks_east package: the abandoned construction site in Block C
// (foundation blocks, a strip foundation with rusty rebar, a site trailer, concrete rings, the
// object passport board). All outdoor tops carry snow; every model keeps one free row on top
// so addSnow has room.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'

const SNOW = () => M('snow')

/** Speckle a material over the visible faces of a box (rust runs, grime). */
function speckle(m, rng, x0, y0, z0, w, h, d, mat, p) {
  for (let y = y0; y < y0 + h; y++)
    for (let z = z0; z < z0 + d; z++)
      for (let x = x0; x < x0 + w; x++)
        if (m.get(x, y, z) && rng.chance(p)) m.set(x, y, z, mat)
}

// ФБС foundation block, 2.5 × 0.5 × 0.75 m with two lifting loops. Long axis local X.
defineModel('be_fbs', () => {
  const m = new VoxelModel(10, 4, 3)
  const rng = new RNG(11)
  m.fill(0, 0, 0, 10, 2, 3, M('concrete'))
  speckle(m, rng, 0, 0, 0, 10, 2, 3, M('concrete_dark'), 0.18)
  speckle(m, rng, 0, 0, 0, 10, 1, 3, M('earth'), 0.12)
  m.set(2, 2, 1, M('metal_rust')); m.set(7, 2, 1, M('metal_rust'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 220 })

// A heap of ФБС blocks dumped crosswise (2 layers), 3.0 × 1.25 × 2.5 m.
defineModel('be_fbs_pile', () => {
  const m = new VoxelModel(12, 6, 10)
  const rng = new RNG(12)
  for (let i = 0; i < 3; i++) m.fill(1, 0, i * 3 + (i ? 1 : 0), 10, 2, 3, M('concrete'))
  for (let i = 0; i < 3; i++) m.fill(i * 4 + 1, 2, 0, 3, 2, 10, M(i === 1 ? 'concrete_light' : 'concrete'))
  m.fill(0, 4, 3, 10, 1, 3, 0)
  speckle(m, rng, 0, 0, 0, 12, 4, 10, M('concrete_dark'), 0.2)
  speckle(m, rng, 0, 0, 0, 12, 1, 10, M('earth'), 0.15)
  m.set(3, 4, 2, M('metal_rust')); m.set(8, 4, 7, M('metal_rust'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 220 })

// Strip foundation, 6 × 0.75 m section with rusty rebar sticking up 0.75–1.75 m, a few bent.
defineModel('be_foundation', () => {
  const m = new VoxelModel(24, 11, 4)
  const rng = new RNG(13)
  m.fill(0, 0, 0, 24, 3, 4, M('concrete'))
  speckle(m, rng, 0, 0, 0, 24, 3, 4, M('concrete_dark'), 0.22)
  speckle(m, rng, 0, 2, 0, 24, 1, 4, M('metal_rust'), 0.05) // rust bleeding from the bars
  // snow on the concrete first (rebar added after so it stays bare)
  m.addSnow({ mat: SNOW(), depth: 1 })
  for (let x = 1; x < 24; x += 2) {
    for (const z of [0, 3]) {
      if (rng.chance(0.12)) continue
      const h = rng.int(3, 7)
      for (let y = 3; y < 3 + h && y < 10; y++) m.set(x, y, z, M('metal_rust'))
      if (rng.chance(0.3)) { const top = Math.min(9, 3 + h); m.set(Math.min(23, x + 1), top, z, M('metal_rust')) }
    }
  }
  return m
}, { lods: [1, 2], lodDistances: [45], maxDistance: 200 })

// Site trailer (бытовка-вагончик) 6 × 2.5 × 2.5 m on timber sleepers: corrugated walls in faded
// blue, a door at one end of the long side, a small dark window with a cracked pane, roof snow.
// Front (door side) = local −Z.
defineModel('be_bytovka', () => {
  const m = new VoxelModel(24, 12, 10)
  const rng = new RNG(14)
  const body = M('metal_blue'), rib = M('metal_gray'), rust = M('metal_rust')
  m.fill(1, 0, 1, 1, 1, 8, M('wood_dark')); m.fill(22, 0, 1, 1, 1, 8, M('wood_dark'))
  m.fill(11, 0, 1, 1, 1, 8, M('wood_dark'))
  m.walls(0, 1, 0, 24, 9, 10, body)
  // corrugation ribs on the long sides
  for (let x = 1; x < 24; x += 2) { m.fill(x, 2, 0, 1, 7, 1, rib); m.fill(x, 2, 9, 1, 7, 1, rib) }
  m.fill(0, 1, 0, 24, 1, 10, M('metal_dark'))
  m.fill(0, 10, 0, 24, 1, 10, M('metal_gray')) // roof
  m.fill(1, 2, 1, 22, 8, 8, 0)
  // door (local −Z side, near the +X end) and a window
  m.fill(18, 2, 0, 4, 7, 1, M('metal_brown'))
  m.set(18, 5, 0, M('metal_dark'))
  m.fill(5, 5, 0, 5, 3, 1, M('metal_dark'))
  m.set(7, 6, 0, M('glass_frosted'))
  m.fill(4, 4, 0, 7, 1, 1, rib)
  // rust round the bottom and under the window
  speckle(m, rng, 0, 1, 0, 24, 2, 10, rust, 0.35)
  speckle(m, rng, 4, 2, 0, 7, 2, 1, rust, 0.4)
  speckle(m, rng, 0, 3, 0, 24, 7, 10, M('metal_gray'), 0.06)
  // step plank before the door
  m.fill(18, 0, 0, 4, 1, 1, M('wood'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  m.setPivot(12, 0, 5)
  return m
}, { lods: [1, 2], lodDistances: [55], maxDistance: 260 })

// Two concrete well rings (Ø1.5 m) lying on their sides, snow inside and on top.
defineModel('be_rings', () => {
  const m = new VoxelModel(14, 8, 7)
  const conc = M('concrete_light')
  for (const [cx, n] of [[3.5, 6], [10.5, 6]]) {
    m.cylinderZ(cx, 3.5, 0, n, 3.2, conc)
    m.cylinderZ(cx, 3.5, 0, n, 2.2, 0)
  }
  // snow drifted inside the bottom of each ring
  m.fill(2, 1, 0, 3, 1, 6, M('snow')); m.fill(9, 1, 0, 3, 1, 6, M('snow'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  return m
}, { lods: [1, 2], lodDistances: [45], maxDistance: 200 })

// Object passport board («паспорт объекта») on two posts: 2.5 m wide, board 1.25 m tall at
// 1.0–2.25 m. The text is a sign added by the layout. Board front = local −Z.
defineModel('be_passport', () => {
  const m = new VoxelModel(11, 11, 2)
  m.fill(0, 0, 1, 1, 10, 1, M('metal_dark')); m.fill(10, 0, 1, 1, 10, 1, M('metal_dark'))
  m.fill(1, 4, 1, 9, 5, 1, M('wood_painted_blue'))
  m.fill(1, 9, 1, 9, 1, 1, M('metal_dark'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  return m
}, { lods: [1], maxDistance: 160 })

// A lone short post for the lost glove at the site gate (rusty pipe 1.0 m).
defineModel('be_post', () => {
  const m = new VoxelModel(1, 5, 1)
  m.fill(0, 0, 0, 1, 4, 1, M('metal_rust'))
  m.addSnow({ mat: SNOW(), depth: 1 })
  return m
}, { lods: [1], maxDistance: 120 })
