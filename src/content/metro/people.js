// Passenger and staff silhouettes in 1/8 m voxels (meshed at VOXEL·0.5): men and women in winter
// coats, three poses each (standing, two walk frames), and a seated woman for the staff booths.
// Coats are `paint_matte`, so every placement's `tint` gives the coat its colour.
//
// Local frame (fine voxels): x across the shoulders (0..4), z front-to-back (0..2, the FRONT is
// z = 0, i.e. local −Z), y up (0..14). Pivot: feet centre. A placement with angle θ faces
// (−sin θ, −cos θ); use faceAngle(dx, dz) to face a direction.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { MAT } from './materials.js'
import { fineModel } from './vox.js'

export const faceAngle = (dx, dz) => Math.atan2(-dx, -dz)

function person(kind, pose) {
  const m = new VoxelModel(5, 15, 5)
  const z0 = 1 // body occupies z 1..3 so walking legs can reach z 0 and z 4
  const coat = MAT.paintMatte, legs = kind === 'man' ? MAT.plasticDark : MAT.woodDark, boot = MAT.rubber
  const hem = kind === 'man' ? 5 : 3
  // legs (two columns at x 1 and x 3)
  const lf = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0 // left leg fore/aft
  for (const [x, s] of [[1, lf], [3, -lf]]) {
    for (let y = 0; y < hem + 1; y++) {
      const off = y < 3 ? s : 0
      const z = z0 + 1 + off
      m.set(x, y, z, y === 0 ? boot : y < 2 && kind === 'woman' ? boot : legs)
      if (y === 0 && off !== 0) m.set(x, y, z0 + 1, 0)
    }
  }
  // coat body
  for (let y = hem; y < 11; y++) for (let x = 0; x < 5; x++) for (let z = z0; z < z0 + 3; z++) {
    const waist = y < 8 && (x === 0 || x === 4)
    if (waist) continue
    m.set(x, y, z, coat)
  }
  // arms (hang at the sides, swing when walking)
  for (const [x, s] of [[0, -lf], [4, lf]]) {
    for (let y = 6; y < 10; y++) m.set(x, y, z0 + 1 + (y < 8 ? s : 0), coat)
    m.set(x, 5, z0 + 1 + s, MAT.skin)
  }
  // a bag on the woman's right arm
  if (kind === 'woman') { m.set(4, 5, z0 + 1 + lf, MAT.leatherette); m.set(4, 4, z0 + 1 + lf, MAT.leatherette) }
  // collar, head, hat
  for (let x = 1; x < 4; x++) for (let z = z0; z < z0 + 3; z++) m.set(x, 11, z, x === 2 && z === z0 ? MAT.skin : coat)
  for (let x = 1; x < 4; x++) for (let z = z0; z < z0 + 3; z++) for (let y = 12; y < 14; y++) m.set(x, y, z, z === z0 && y === 12 ? MAT.skin : kind === 'man' ? MAT.woodDark : MAT.metalBrown)
  m.set(2, 12, z0, MAT.skin); m.set(1, 12, z0, MAT.skin); m.set(3, 12, z0, MAT.skin)
  for (let x = 1; x < 4; x++) for (let z = z0; z < z0 + 3; z++) m.set(x, 14, z, kind === 'man' ? MAT.woodDark : MAT.plasticDark) // fur hat
  m.setPivot(2.5, 0, 2.5)
  return fineModel(m)
}

function seated(uniform) {
  const m = new VoxelModel(5, 12, 6)
  const coat = MAT.paintMatte
  // shins and boots in front, thighs forward, torso upright at the back
  for (const x of [1, 3]) {
    for (let y = 0; y < 4; y++) m.set(x, y, 1, y === 0 ? MAT.rubber : MAT.woodDark)
    for (let z = 1; z < 4; z++) m.set(x, 4, z, coat)
  }
  for (let y = 4; y < 9; y++) for (let x = 0; x < 5; x++) for (let z = 3; z < 5; z++) if (!(y < 6 && (x === 0 || x === 4))) m.set(x, y, z, coat)
  for (const x of [0, 4]) { m.set(x, 6, 2, coat); m.set(x, 6, 1, MAT.skin) } // forearms on the desk
  for (let x = 1; x < 4; x++) for (let z = 3; z < 5; z++) {
    m.set(x, 9, z, x === 2 && z === 3 ? MAT.skin : coat)
    m.set(x, 10, z, z === 3 ? MAT.skin : MAT.metalBrown)
    m.set(x, 11, z, uniform ? MAT.metalRed : MAT.metalBrown)
  }
  m.setPivot(2.5, 0, 3)
  return fineModel(m)
}

const PEOPLE_OPTS = { indoor: true, contact: false, collide: false, lods: [0.5], lodDistances: [], maxDistance: 120 }
for (const kind of ['man', 'woman']) {
  for (const pose of ['stand', 'walk1', 'walk2']) defineModel(`metro_${kind}_${pose}`, () => person(kind, pose), PEOPLE_OPTS)
}
defineModel('metro_staff_seated', () => seated(true), PEOPLE_OPTS)
defineModel('metro_cashier_seated', () => seated(false), PEOPLE_OPTS)

/** Faded winter coat colours (tints for paint_matte). */
export const COATS = [0x2c2a2a, 0x3b3530, 0x4a3b2e, 0x2e3440, 0x3a3f3a, 0x5a4a3a, 0x4b2f2f, 0x343a46, 0x6a5a4a, 0x25282c]
export const UNIFORM = 0x26314c
