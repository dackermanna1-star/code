// Small residential models: porches with canopies, the dynamic entrance door, the propped-open
// tambour door, entrance/ceiling lamps and the lift (cab + landing door leaves).

import { VoxelModel } from '../../core/VoxelModel.js'
import { RNG } from '../../core/rng.js'
import { G } from './series.js'
import { MAT } from './vox.js'

/** Porch model width/depth in voxels; the door is centred at local x = 7, facade plane z = 10. */
export const PORCH = { W: 14, D: 10, H: G + 16, doorX0: 5, doorX1: 9 }

export function buildPorch(variant) {
  const T = MAT()
  const rng = new RNG(4100 + variant * 77)
  const { W, D, H } = PORCH
  const m = new VoxelModel(W, H, D)
  m.setPivot(W / 2, G, D)
  // foundation + platform (top at grade + 0.5 m) and steps (1 voxel each)
  m.fill(1, 0, 2, W - 2, G + 2, D - 2, T.concrete)
  m.fill(0, 0, 0, W, G + 1, 2, T.concrete)
  if (variant !== 1) { m.fill(0, 0, 2, 1, G + 1, D - 2, T.concrete); m.fill(W - 1, 0, 2, 1, G + 1, D - 2, T.concrete) }
  else { m.fill(0, 0, 2, 1, G, D - 2, T.concrete_dark); m.fill(W - 1, 0, 2, 1, G, D - 2, T.concrete_dark) }
  // worn edge of the steps
  for (let x = 0; x < W; x++) if (rng.chance(0.25)) m.set(x, G, 0, T.concrete_dark)
  const cy = G + 11 // canopy row
  if (variant === 0) {
    // cantilevered concrete slab with roofing felt and struts at the wall
    m.fill(0, cy, 1, W, 1, D - 1, T.concrete_light)
    m.fill(0, cy + 1, 1, W, 1, D - 1, T.roof_tar)
    for (const x of [1, W - 2]) { m.set(x, cy - 1, D - 1, T.metal_dark); m.set(x, cy - 1, D - 2, T.metal_dark); m.set(x, cy - 2, D - 1, T.metal_dark) }
    // handrail on one side of the steps
    m.fill(W - 1, G + 1, 1, 1, 4, 1, T.metal_green)
    m.fill(W - 1, G + 4, 1, 1, 1, D - 2, T.metal_green)
    m.fill(W - 1, G + 1, D - 2, 1, 3, 1, T.metal_green)
    // sand box with a shovel
    m.fill(10, G + 2, 7, 3, 2, 2, T.wood)
    m.set(11, G + 4, 8, T.snow)
    m.fill(12, G + 4, 8, 1, 3, 1, T.wood_dark)
  } else if (variant === 1) {
    // slab on two steel pipe posts, rails on both sides
    m.fill(0, cy, 0, W, 1, D, T.concrete_light)
    m.fill(0, cy + 1, 0, W, 1, D, T.roof_tar)
    for (const x of [1, W - 2]) m.fill(x, G + 2, 1, 1, cy - G - 2, 1, T.metal_dark)
    for (const x of [1, W - 2]) { m.fill(x, G + 5, 2, 1, 1, D - 3, T.metal_dark); m.fill(x, G + 2, 5, 1, 3, 1, T.metal_dark) }
  } else {
    // re-roofed in corrugated sheet, slightly sloped, with a ramp on one side
    m.fill(0, cy, 1, W, 1, D - 1, T.concrete)
    for (let x = 0; x < W; x++) m.fill(x, cy + 1, 1, 1, 1, D - 1, x & 1 ? T.metal_gray : T.chrome)
    m.fill(0, cy + 2, D - 3, W, 1, 3, T.metal_gray)
    m.fill(1, G + 1, 0, 3, 1, 2, T.concrete_dark)
    m.fill(W - 1, G + 1, 1, 1, 4, 1, T.metal_dark)
    m.fill(W - 1, G + 4, 1, 1, 1, D - 2, T.metal_dark)
  }
  // intercom panel on the wall right of the door (1.4 m above the platform)
  m.fill(PORCH.doorX1 + 1, G + 7, D - 1, 1, 2, 1, T.chrome)
  // snow: canopy deep, steps patchy, a trodden gap in front of the door
  m.addSnow({ mat: T.snow, depth: 1, seed: 33 + variant, chance: 1 })
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      const top = topOf(m, x, z)
      if (top < 0) continue
      const mat = m.get(x, top, z)
      if (top >= cy && mat === T.snow && rng.chance(0.75)) m.setIfEmpty(x, top + 1, z, T.snow)
      if (top < cy && mat === T.snow) {
        const path = x >= PORCH.doorX0 - 1 && x <= PORCH.doorX1
        if (path || rng.chance(0.45)) m.set(x, top, z, 0)
      }
    }
  // icicles along the canopy's front edge
  for (let x = 0; x < W; x++) if (rng.chance(0.3)) {
    const len = rng.int(1, 3)
    for (let k = 1; k <= len; k++) m.setIfEmpty(x, cy - k, variant === 1 ? 0 : 1, T.ice)
  }
  return m
}

function topOf(m, x, z) {
  for (let y = m.sy - 1; y >= 0; y--) if (m.get(x, y, z)) return y
  return -1
}

/** Steel entrance door leaf, 1.0 × 2.0 m; pivot on the hinge line at the leaf's inner face. */
export function buildEntranceDoor() {
  const T = MAT()
  const m = new VoxelModel(4, 8, 2)
  m.fill(0, 0, 1, 4, 8, 1, T.paint)
  m.fill(1, 7, 0, 2, 1, 1, T.metal_dark) // door closer
  m.set(3, 3, 0, T.metal_gray) // handle
  m.setPivot(0, 0, 2)
  return m
}

/** Wooden tambour door with a frosted pane (propped open with a brick). */
export function buildInnerDoor() {
  const T = MAT()
  const m = new VoxelModel(4, 8, 1)
  m.fill(0, 0, 0, 4, 8, 1, T.wood_painted_blue)
  m.fill(1, 4, 0, 2, 3, 1, T.glass_frosted)
  m.setPivot(0, 0, 1)
  return m
}

export function buildLampEntrance() {
  const T = MAT()
  const m = new VoxelModel(1, 1, 1)
  m.set(0, 0, 0, T.lamp_warm)
  m.setPivot(0.5, 0.5, 1)
  return m
}

export function buildLampCeiling() {
  const T = MAT()
  const m = new VoxelModel(1, 1, 1)
  m.set(0, 0, 0, T.lamp_bulb)
  m.setPivot(0.5, 1, 0.5)
  return m
}

/** Lift cab: 1.5 × 1.0 m inside, wood-grain laminate, fluorescent ceiling, open doorway at −Z. */
export const CAB = { W: 8, H: 11, D: 6, doorX0: 2, doorX1: 6 }
export function buildLiftCab() {
  const T = MAT()
  const { W, H, D } = CAB
  const m = new VoxelModel(W, H, D)
  m.fill(0, 0, 0, W, 1, D, T.linoleum)
  m.fill(0, 1, 0, W, H - 2, D, T.res_laminate)
  m.fill(1, 1, 1, W - 2, H - 2, D - 2, 0)
  m.fill(CAB.doorX0, 1, 0, CAB.doorX1 - CAB.doorX0, H - 3, 1, 0)
  m.fill(0, H - 1, 0, W, 1, D, T.plastic_white)
  m.fill(3, H - 1, 2, 2, 1, 2, T.fluorescent)
  // aluminium trim and the button column on the right wall
  m.fill(1, 1, 1, 1, H - 2, 1, T.chrome)
  m.fill(W - 2, 1, 1, 1, H - 2, 1, T.chrome)
  m.fill(W - 1, 3, 1, 1, 5, 2, T.metal_gray)
  m.addInterior(1, 1, 1, W - 2, H - 2, D - 2)
  m.setPivot(0, 0, 0)
  return m
}

export function buildLiftLeaf() {
  const T = MAT()
  const m = new VoxelModel(2, 8, 1)
  m.fill(0, 0, 0, 2, 8, 1, T.metal_gray)
  m.setPivot(0, 0, 0)
  return m
}
