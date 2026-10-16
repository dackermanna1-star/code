// Brick garage-cooperative rows (ГСК): boxes 3.25 × 6.5 m under a flat felt roof, steel
// swing doors in assorted faded colours with rust, stencilled numbers, padlocks, snow drifted
// against them — and one open garage with a bulb hanging inside, shelves of jars and tyres,
// a radio playing, and an old classic Lada.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, frameFor, put, sign, readable, light, zone, flatten, paint, navPath, reg, seedInt, drawText,
  handText, SIGN_FONT,
} from './lib.js'
import { addEmitter } from './runtime.js'

const GX = 13, GZ = 27, GY = 14
const UNIT_W = GX * V // 3.25 m
const UNIT_D = (GZ - 1) * V // 6.5 m (plus 0.25 m roof lip)

function garageBox(brickName) {
  const m = new VoxelModel(GX, GY, GZ)
  const brick = M(brickName)
  const rng = new RNG(brickName.length * 31)
  m.fill(0, 0, 1, GX, 1, GZ - 1, M('concrete'))
  m.fill(0, 1, 1, 1, 10, GZ - 1, brick) // left (shared) wall
  m.fill(0, 1, GZ - 1, GX, 10, 1, brick) // back wall
  m.fill(1, 1, 1, 1, 9, 1, brick); m.fill(GX - 1, 1, 1, 1, 9, 1, brick) // jambs
  m.fill(0, 10, 1, GX, 1, 1, M('concrete_light')) // lintel
  m.fill(0, 11, 0, GX, 1, GZ, M('concrete'))
  m.fill(0, 12, 0, GX, 1, GZ, M('roof_tar'))
  // roof edge flashing + water stains under the lip
  m.fill(0, 11, 0, GX, 1, 1, M('metal_gray'))
  for (let x = 0; x < GX; x++) if (rng.chance(0.3)) m.set(x, 9, 1, M('concrete_dark'))
  for (let y = 2; y < 10; y++) if (rng.chance(0.25)) m.set(0, y, 1, M('concrete_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 3 })
  // a deeper uneven snow layer on the roof
  for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) if (m.get(x, 13, z) === M('snow') && ((x * 3 + z * 5) % 7) < 3) m.set(x, 13, z, M('snow'))
  m.setPivot(GX / 2, 0, 1 + (GZ - 1) / 2)
  return m
}
defineModel('pub_garage_box', () => garageBox('brick_silicate'), { occludesSnow: true, lods: [1, 2], lodDistances: [50], maxDistance: 320 })
defineModel('pub_garage_box_red', () => garageBox('brick_red'), { occludesSnow: true, lods: [1, 2], lodDistances: [50], maxDistance: 320 })

function endWall(brickName) {
  const m = new VoxelModel(1, GY, GZ)
  m.fill(0, 1, 1, 1, 10, GZ - 1, M(brickName))
  m.fill(0, 0, 1, 1, 1, GZ - 1, M('concrete'))
  m.fill(0, 11, 0, 1, 1, GZ, M('concrete')); m.fill(0, 12, 0, 1, 1, GZ, M('roof_tar'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(0.5, 0, 1 + (GZ - 1) / 2)
  return m
}
defineModel('pub_garage_end', () => endWall('brick_silicate'), { lods: [1], maxDistance: 320 })
defineModel('pub_garage_end_red', () => endWall('brick_red'), { lods: [1], maxDistance: 320 })

// closed swing doors (10 × 9 voxels, 2.5 × 2.25 m); colour = tint. Three variants.
function garageDoor(variant) {
  const m = new VoxelModel(10, 9, 1)
  const p = M('paint')
  const rng = new RNG(71 + variant * 13)
  m.fill(0, 0, 0, 10, 9, 1, p)
  for (let y = 0; y < 9; y++) m.set(5, y, 0, M('metal_dark'))
  if (variant === 0) {
    // wicket door outline in the left leaf + padlock
    for (let y = 0; y < 8; y++) { m.set(1, y, 0, M('metal_dark')) }
    m.fill(1, 7, 0, 4, 1, 1, M('metal_dark'))
    m.set(4, 4, 0, M('chrome'))
  } else if (variant === 1) {
    // vertical ribs + hasp with a big padlock
    for (let x = 1; x < 10; x += 2) if (x !== 5) for (let y = 1; y < 8; y++) m.set(x, y, 0, M('metal_dark'))
    m.set(5, 4, 0, M('chrome')); m.set(6, 4, 0, M('chrome'))
  } else {
    // patched with a different sheet, welded seams
    m.fill(6, 0, 0, 4, 4, 1, M('metal_gray'))
    m.fill(1, 5, 0, 3, 3, 1, M('metal_rust'))
    m.set(5, 3, 0, M('chrome'))
  }
  // rust along the bottom and hinges
  for (let x = 0; x < 10; x++) if (rng.chance(0.6)) m.set(x, 0, 0, M('metal_rust'))
  for (let k = 0; k < 6; k++) m.set(rng.int(0, 9), rng.int(1, 3), 0, M('metal_rust'))
  for (const y of [1, 7]) { m.set(0, y, 0, M('metal_dark')); m.set(9, y, 0, M('metal_dark')) }
  return m
}
for (let v = 0; v < 3; v++) defineModel('pub_garage_door' + (v ? '_' + 'abc'[v] : ''), () => garageDoor(v), { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 260 })

// both door leaves swung open to 90° (outward); pivot at the middle of the opening, facade plane
defineModel('pub_garage_doors_open', () => {
  const m = new VoxelModel(10, 9, 6)
  const p = M('paint')
  m.fill(0, 0, 0, 1, 9, 5, p); m.fill(9, 0, 0, 1, 9, 5, p)
  m.fill(0, 0, 0, 1, 1, 5, M('metal_rust')); m.fill(9, 0, 0, 1, 1, 5, M('metal_rust'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(5, 0, 5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 260 })

// interior of the open garage: shelves with jars and cans, tyres, workbench with a vice,
// canisters, a bulb on a cord. Fits inside one box; pivot = box pivot.
defineModel('pub_garage_interior', () => {
  const m = new VoxelModel(GX, 11, GZ)
  const rng = new RNG(919)
  // shelves on the left wall
  for (let z = 6; z <= 22; z += 8) for (let y = 1; y <= 8; y++) m.set(1, y, z, M('wood_dark'))
  for (const y of [2, 5, 8]) m.fill(1, y, 6, 2, 1, 17, M('wood'))
  for (const y of [3, 6]) for (let z = 6; z <= 22; z++) if (rng.chance(0.55)) m.set(1, y, z, M(rng.pick(['glass_clear', 'glass_clear', 'metal_red', 'chrome', 'pub_cardboard', 'metal_yellow'])))
  // tyres stacked at the back right
  for (let k = 0; k < 4; k++) m.fill(10, 1 + k, 22, 2, 1, 3, M('rubber'))
  // workbench with a vice at the back
  m.fill(3, 1, 24, 5, 3, 2, M('wood_dark')); m.set(4, 4, 24, M('metal_dark')); m.set(6, 4, 25, M('metal_gray'))
  // canisters and a car battery by the right wall
  m.fill(11, 1, 4, 1, 2, 1, M('metal_red')); m.fill(11, 1, 6, 1, 2, 1, M('metal_green')); m.set(11, 1, 9, M('plastic_dark'))
  // the bulb on its cord
  m.set(6, 10, 13, M('metal_dark')); m.set(6, 9, 13, M('lamp_bulb'))
  m.setPivot(GX / 2, 0, 1 + (GZ - 1) / 2)
  return m
}, { contact: false, lods: [1], maxDistance: 120 })

// a classic Lada (VAZ-2106 style), body = tint, nose toward local −Z; 4.0 × 1.75 × 1.5 m
defineModel('pub_car_classic', () => {
  const m = new VoxelModel(7, 6, 16)
  const p = M('paint')
  m.fill(0, 1, 0, 7, 2, 16, p)
  m.fill(1, 3, 4, 5, 2, 8, M('glass_car'))
  m.fill(1, 5, 5, 5, 1, 6, p)
  for (const z of [4, 11]) for (const x of [1, 5]) m.fill(x, 3, z, 1, 2, 1, p)
  m.fill(0, 1, 0, 7, 1, 1, M('chrome')); m.fill(0, 1, 15, 7, 1, 1, M('chrome'))
  m.set(1, 2, 0, M('plastic_white')); m.set(5, 2, 0, M('plastic_white'))
  m.set(0, 2, 15, M('metal_red')); m.set(6, 2, 15, M('metal_red'))
  m.fill(2, 2, 0, 3, 1, 1, M('metal_dark'))
  for (const z of [2, 3, 12, 13]) { m.set(0, 0, z, M('rubber')); m.set(6, 0, z, M('rubber')) }
  m.fill(0, 0, 2, 1, 2, 2, M('rubber')); m.fill(6, 0, 2, 1, 2, 2, M('rubber'))
  m.fill(0, 0, 12, 1, 2, 2, M('rubber')); m.fill(6, 0, 12, 1, 2, 2, M('rubber'))
  return m
}, { lods: [1, 2], lodDistances: [40], maxDistance: 200 })

const DOOR_TINTS = [0x3e5a44, 0x3a5272, 0x5a4232, 0x6a6e6c, 0x7a3a2a, 0x2e4436, 0x8a7c4a, 0x4a5a6a, 0x5e6250]

/**
 * A row of brick garages. The row footprint (count × 3.25 m wide, 6.5 m deep) is centred on
 * (x, z); doors face local −Z. One garage is open (bulb, car, radio) unless openIndex = -1.
 * opts: { x, z, rot | angle, y, count=10, seed, brick: 'white'|'red', openIndex, numberStart=1, name ('Мотор-3') }
 * Returns { boxes: [...], doors: [...], open: index, frame }
 */
export function placeGarageRow(ctx, o) {
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 41))
  const count = Math.max(1, Math.min(60, o.count ?? 10))
  const red = (o.brick ?? (rng.chance(0.5) ? 'white' : 'red')) === 'red'
  const W = count * UNIT_W
  const openIndex = o.openIndex ?? rng.int(0, count - 1)
  const n0 = o.numberStart ?? 1
  const y = F.y
  // footprint + an apron in front of the doors
  flatten(ctx, F, -W / 2 - 0.25, -UNIT_D / 2 - 0.25, W / 2 + 0.5, UNIT_D / 2, y, M('snow_packed'))
  flatten(ctx, F, -W / 2 - 1, -UNIT_D / 2 - 5, W / 2 + 1, -UNIT_D / 2 - 0.25, y, M('snow_packed'))
  const boxes = [], doors = []
  const front = -UNIT_D / 2
  for (let i = 0; i < count; i++) {
    const cx = -W / 2 + (i + 0.5) * UNIT_W
    boxes.push(put(ctx, F, red ? 'pub_garage_box_red' : 'pub_garage_box', cx, 0, { tag: 'garage', userData: { kind: 'garage', n: n0 + i } }))
    const tint = DOOR_TINTS[rng.int(0, DOOR_TINTS.length - 1)]
    const dlx = cx + 0.125
    const num = n0 + i
    if (i === openIndex) {
      doors.push(put(ctx, F, 'pub_garage_doors_open', dlx, front + 0.25, { ly: V, tint }))
      const inner = put(ctx, F, 'pub_garage_interior', cx, 0, { ly: 0 })
      put(ctx, F, 'pub_car_classic', cx, 0, { ly: V, tint: rng.pick([0x5a1a24, 0xc2ae84, 0x23304f, 0x8c2a22, 0xd8d6cc]), tag: 'car', userData: { kind: 'car', parked: 'garage' } })
      light(ctx, F, cx - 0.125, 2.3, -0.25, { color: 0xffd49a, intensity: 2.2, range: 7, placement: inner, haloSize: 0.5, tag: 'garage_bulb' })
      light(ctx, F, cx, 2.2, front + 0.6, { type: 'spot', dir: [0, -0.7, -1], cone: 60, inner: 30, color: 0xffd49a, intensity: 4.5, range: 12, halo: false, scatter: 0.5 })
      addEmitter({ name: 'radio_distant', pos: F.p(cx, 1.4, 1.5), gain: 0.22, radius: 26, refDistance: 1.5, cutoff: 3000 })
      // tyre tracks out of the open garage, cleared snow
      paint(ctx, F, cx - 1.2, front - 8, cx + 1.4, front, M('snow_dirty'))
      reg(ctx, 'storySpots', { kind: 'open_garage', x: F.wx(cx, front - 1), z: F.wz(cx, front - 1) })
      zone(ctx, F, cx - UNIT_W / 2 + 0.25, 0.1, front + 0.25, cx + UNIT_W / 2 - 0.25, 2.6, UNIT_D / 2 - 0.25, {
        name: 'garage', type: 'room', indoor: false, reverb: 'room', wind: 0.3, traffic: 0.5, snow: false, priority: 1,
      })
    } else {
      const variant = rng.int(0, 2)
      doors.push(put(ctx, F, 'pub_garage_door' + (variant ? '_' + 'abc'[variant] : ''), dlx, front + 0.375, { ly: V, tint, tag: 'garage_door' }))
      // snow drifted against the closed door
      const [wx, , wz] = F.p(dlx, 0, front - 0.7)
      ctx.terrain.mound(wx, wz, 1.35, 0.8, rng.float(0.25, 0.55), M('snow_fresh'), 0.5, rng.int(0, 1e6))
    }
    // stencilled number on the door / lintel
    const isOpen = i === openIndex
    sign(ctx, F, dlx - 0.75, isOpen ? 2.62 : 1.95, isOpen ? front : front + 0.25, 0, -1, {
      w: 0.42, h: 0.26, ppm: 120, offset: 0.03,
      draw: (c, W2, H2) => { c.clearRect(0, 0, W2, H2); drawText(c, W2, H2, { lines: [String(num)], color: 'rgba(232,228,214,0.92)', font: SIGN_FONT }) },
    })
    if (i !== openIndex && rng.chance(0.12)) {
      sign(ctx, F, dlx + 0.55, 1.05, front + 0.25, 0, -1, { w: 0.95, h: 0.42, ppm: 80, offset: 0.03, draw: (c, W2, H2) => { c.clearRect(0, 0, W2, H2); handText(c, W2, H2, { lines: ['ПРОДАМ', '8-916-...'], color: '#e6e2d4', seed: i }) } })
    }
  }
  put(ctx, F, red ? 'pub_garage_end_red' : 'pub_garage_end', W / 2 + 0.125, 0, {})
  // cooperative signboard on the west end wall + notice
  const name = o.name ?? `Мотор-${rng.int(1, 9)}`
  sign(ctx, F, -W / 2, 2.0, -1.0, -1, 0, { w: 1.6, h: 0.5, ppm: 80, aged: 0.5, seed: rng.int(1, 99), lines: [`ГСК «${name.toUpperCase()}»`], bg: '#2a4466', color: '#e8e4d8', font: SIGN_FONT })
  sign(ctx, F, -W / 2, 1.35, 1.1, -1, 0, { w: 0.45, h: 0.6, ppm: 120, aged: 0.6, seed: rng.int(1, 99), draw: (c, W2, H2) => handText(c, W2, H2, { lines: ['ВНИМАНИЕ!', 'Членские', 'взносы', 'до 15 числа', 'Председатель'], bg: '#ddd8c8', color: '#1a1a40', seed: 3 }) })
  readable(ctx, F, -W / 2 - 0.2, 1.6, 0, [0.3, 1.2, 3.2], {
    ru: `ГСК «${name.toUpperCase()}»\nВНИМАНИЕ! Членские взносы сдавать до 15 числа каждого месяца. Должники будут отключены от электричества.\nПредседатель`,
    en: `Garage cooperative "${name}"\nATTENTION! Membership fees are due by the 15th of each month. Debtors will be cut off from the electricity.\nThe Chairman`, style: 'paper',
  })
  navPath(ctx, F, [[-W / 2 - 2, front - 3], [W / 2 + 2, front - 3]], 'path', { to: 'garages' })
  reg(ctx, 'garageRows', { x: F.x, z: F.z, angle: F.a, count, width: W, open: openIndex })
  return { boxes, doors, open: openIndex, frame: F }
}

export const GARAGE_DIMS = { unit: [UNIT_W, UNIT_D], height: 3.0 }
