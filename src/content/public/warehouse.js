// Warehouse base (база): a corrugated-steel shed with a gable roof, a concrete loading dock with
// rubber bumpers and a canopy, roll-up doors (one half open), pallets and boxes — plus the
// base gate with barbed wire and a guard booth (будка охраны) with a lit window, a small TV,
// a kettle, and a fluorescent lamp on a bracket buzzing over the gate.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, HALF_PI, frameFor, put, sign, readable, interact, light, flatten, paint, navPath, reg, seed01,
  seedInt, pasteFigure, drawText, SIGN_FONT, PLAIN_FONT,
} from './lib.js'
import { addEmitter } from './runtime.js'

const WX = 144, WZ = 84, DOCK = 12, WTOP = 28, RIDGE = 6
const WPZ = DOCK + (WZ - DOCK) / 2
const lxW = vx => (vx - WX / 2) * V
const lzW = vz => (vz - WPZ) * V

defineModel('pub_warehouse', () => {
  const m = new VoxelModel(WX, WTOP + RIDGE + 3, WZ)
  m.setPivot(WX / 2, 0, WPZ)
  const rng = new RNG(2468)
  const zc = (DOCK + WZ - 1) / 2, half = (WZ - DOCK) / 2
  const roofY = z => WTOP + Math.floor(RIDGE * (1 - Math.abs(z - zc) / half) + 0.0001)
  // body (solid), plinth, corrugated cladding, roof
  for (let z = DOCK; z < WZ; z++) {
    const ry = roofY(z)
    m.fill(0, 0, z, WX, ry, 1, M('concrete'))
    m.fill(0, ry - 1, z, WX, 2, 1, M('metal_gray'))
  }
  const rib = (k) => k % 2 ? M('metal_gray') : M('panel_gray')
  for (let y = 5; y < WTOP; y++) {
    for (let x = 0; x < WX; x++) { m.set(x, y, DOCK, rib(x)); m.set(x, y, WZ - 1, rib(x)) }
    for (let z = DOCK; z < WZ; z++) { m.set(0, y, z, rib(z)); m.set(WX - 1, y, z, rib(z)) }
  }
  // gable ends
  for (let z = DOCK; z < WZ; z++) for (let y = WTOP; y < roofY(z) - 1; y++) { m.set(0, y, z, rib(z)); m.set(WX - 1, y, z, rib(z)) }
  m.fill(0, 0, DOCK, WX, 5, 1, M('concrete')); m.fill(0, 0, WZ - 1, WX, 5, 1, M('concrete'))
  m.fill(0, 0, DOCK, 1, 5, WZ - DOCK, M('concrete')); m.fill(WX - 1, 0, DOCK, 1, 5, WZ - DOCK, M('concrete'))
  // loading dock
  m.fill(8, 0, 0, WX - 16, 5, DOCK, M('concrete'))
  m.fill(8, 4, 0, WX - 16, 1, 1, M('metal_dark'))
  for (let x = 12; x < WX - 10; x += 16) m.fill(x, 2, 0, 2, 2, 1, M('rubber'))
  // side stair at the right end of the dock + rail
  for (let s = 0; s < 4; s++) m.fill(WX - 8 + s, 0, 3, 1, s + 1, 6, M('concrete_light'))
  for (let x = WX - 8; x < WX - 4; x++) m.set(x, 7, 2, M('metal_dark'))
  // canopy over the dock
  m.fill(6, 22, 1, WX - 12, 1, DOCK - 1, M('metal_gray'))
  for (let x = 10; x < WX - 8; x += 24) { m.set(x, 21, DOCK - 1, M('metal_dark')); m.set(x, 20, DOCK - 2, M('metal_dark')); m.set(x, 19, DOCK - 3, M('metal_dark')) }
  // roll-up doors (ribs), the middle one half open (dark gap)
  const doorsX = [24, 64, 104]
  doorsX.forEach((dx, i) => {
    for (let y = 5; y < 19; y++) for (let x = dx; x < dx + 16; x++) m.set(x, y, DOCK, y % 2 ? M('metal_gray') : M('concrete_light'))
    m.fill(dx - 1, 19, DOCK, 18, 2, 1, M('metal_dark'))
    if (i === 1) m.fill(dx, 5, DOCK, 16, 4, 1, M('metal_dark'))
  })
  // personnel door
  m.fill(48, 5, DOCK, 4, 9, 1, M('metal_brown')); m.set(51, 9, DOCK, M('chrome'))
  // high strip windows
  for (const x of [8, 44, 84, 124]) for (let k = 0; k < 12; k++) { m.set(x + k, 22, DOCK, k % 3 ? M('pub_glass_dark') : M('metal_dark')); m.set(x + k, 23, DOCK, k % 3 ? M('pub_glass_dark') : M('metal_dark')) }
  // pallets and boxes on the dock, a pallet truck
  for (const [px, pz, h] of [[14, 3, 3], [19, 4, 2], [42, 2, 4], [88, 5, 1], [123, 3, 3]]) {
    m.fill(px, 5, pz, 4, 1, 4, M('wood'))
    for (let k = 0; k < h; k++) m.fill(px, 6 + k, pz, 4, 1, 4, k === h - 1 && rng.chance(0.5) ? M('pub_cardboard') : M('pub_cardboard'))
  }
  m.fill(70, 5, 3, 2, 1, 4, M('metal_yellow')); m.set(70, 6, 3, M('metal_dark')); m.set(70, 7, 3, M('metal_dark'))
  // rust streaks on the cladding
  for (let k = 0; k < 50; k++) {
    const x = rng.int(1, WX - 2), y0 = rng.int(8, WTOP - 1)
    for (let y = y0; y > y0 - rng.int(3, 10) && y > 5; y--) if (rng.chance(0.8)) m.set(x, y, DOCK, M('metal_rust'))
  }
  m.addSnow({ mat: M('snow'), depth: 1, seed: 17 })
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [70, 180], maxDistance: 900 })

// sliding base gate 6 m with barbed wire on top; pivot at the left post
defineModel('pub_gate_base', () => {
  const m = new VoxelModel(26, 12, 1)
  m.fill(0, 0, 0, 1, 11, 1, M('concrete')); m.fill(25, 0, 0, 1, 11, 1, M('concrete'))
  m.fill(1, 0, 0, 24, 1, 1, M('metal_dark')); m.fill(1, 9, 0, 24, 1, 1, M('metal_dark'))
  m.fill(1, 1, 0, 24, 5, 1, M('metal_green'))
  for (let x = 1; x < 25; x += 2) m.fill(x, 6, 0, 1, 3, 1, M('metal_dark'))
  for (let x = 1; x < 25; x += 2) m.set(x, 10, 0, M('metal_gray'))
  m.set(13, 4, 0, M('chrome')); m.set(13, 3, 0, M('metal_gray'))
  const rng = new RNG(6)
  for (let k = 0; k < 18; k++) m.set(rng.int(1, 24), rng.int(1, 5), 0, M('metal_rust'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 3 })
  m.setPivot(0.5, 0, 0.5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 220 })

// guard booth 2.5 × 2.25 m: windows on three sides, door at the back; body = tint
defineModel('pub_guard_booth', () => {
  const m = new VoxelModel(10, 13, 9)
  const p = M('paint')
  m.fill(0, 0, 0, 10, 1, 9, M('metal_dark'))
  m.fill(1, 0, 1, 8, 1, 7, M('linoleum'))
  m.walls(0, 1, 0, 10, 9, 9, p, 1)
  // windows
  m.fill(2, 4, 0, 6, 4, 1, M('pub_glass_warm'))
  m.fill(0, 4, 2, 1, 4, 4, M('pub_glass_warm')); m.fill(9, 4, 2, 1, 4, 4, M('pub_glass_warm'))
  m.set(5, 4, 0, p); m.set(5, 5, 0, p); m.set(5, 6, 0, p); m.set(5, 7, 0, p)
  // door at the back
  m.fill(5, 1, 8, 3, 8, 1, M('metal_brown')); m.set(5, 5, 8, M('chrome'))
  // roof
  m.fill(0, 10, 0, 10, 1, 9, M('metal_gray')); m.fill(0, 11, 0, 10, 1, 9, M('roof_tar'))
  // inside: desk under the front window, TV, kettle, logbook, heater, guard
  m.fill(1, 1, 1, 8, 2, 2, M('wood_dark'))
  m.fill(1, 3, 1, 2, 2, 1, M('plastic_dark')); m.set(2, 3, 1, M('tv_screen')); m.set(1, 3, 1, M('tv_screen'))
  m.set(7, 3, 1, M('chrome')); m.set(5, 3, 2, M('paper'))
  m.set(8, 1, 6, M('metal_red')); m.set(8, 2, 6, M('taillight'))
  pasteFigure(m, 3, 1, 3, 0, { pose: 'sit', top: M('plastic_dark'), bottom: M('plastic_dark'), hat: M('plastic_dark'), armsFront: true })
  m.set(5, 9, 4, M('lamp_bulb'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 8 })
  return m
}, { occludesSnow: true, lods: [1, 2], lodDistances: [40], maxDistance: 220 })

// fluorescent tube lamp on a wall/pole bracket (cold light); pivot at the mounting point
defineModel('pub_lamp_tube_bracket', () => {
  const m = new VoxelModel(1, 2, 4)
  m.fill(0, 1, 0, 1, 1, 4, M('metal_dark'))
  m.fill(0, 0, 0, 1, 1, 3, M('fluorescent'))
  m.setPivot(0.5, 1, 4)
  return m
}, { contact: false, collide: false, lods: [1], maxDistance: 200 })

// boom barrier (шлагбаум): post + 4 m red/white arm, lowered; pivot at the post
defineModel('pub_barrier', () => {
  const m = new VoxelModel(18, 6, 2)
  m.fill(0, 0, 0, 2, 5, 2, M('metal_dark'))
  for (let x = 2; x < 18; x++) m.set(x, 4, 0, ((x - 2) >> 1) % 2 ? M('metal_red') : M('pub_paint_white'))
  m.set(17, 0, 0, M('metal_dark')); m.set(17, 1, 0, M('metal_dark')); m.set(17, 2, 0, M('metal_dark')); m.set(17, 3, 0, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(1, 0, 1)
  return m
}, { contact: false, lods: [1], maxDistance: 180 })

const GUARD_LINES = [
  { ru: 'Куда? Закрыто. Приходите утром.', en: 'Where to? It\'s closed. Come in the morning.' },
  { ru: 'Пропуск есть?', en: 'Got a pass?' },
  { ru: 'Нет тут никого. Склад до восьми.', en: 'There\'s nobody here. The warehouse is open until eight.' },
]

/**
 * Guard booth with its interior lamp, a fluorescent bracket lamp and a «knock» interaction.
 * Footprint 2.5 × 2.25 m centred on (x, z); front window faces local −Z.
 * opts: { x, z, rot | angle, y, seed, tint, label ('ОХРАНА') }
 */
export function placeGuardBooth(ctx, o) {
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 29))
  const p = put(ctx, F, 'pub_guard_booth', 0, 0, { tint: o.tint ?? rng.pick([0xc4c6c0, 0x8aa0b0, 0xa0a890]), tag: 'building', userData: { kind: 'guard_booth' } })
  light(ctx, F, 0, 2.1, 0, { color: 0xffcf90, intensity: 1.8, range: 6, placement: p, haloSize: 0.4, schedule: env => 0.6 + 0.4 * env.night, tag: 'booth_light' })
  const tube = put(ctx, F, 'pub_lamp_tube_bracket', -1.25, -0.9, { ly: 2.5, q: 1, tag: 'lamp' })
  light(ctx, F, -1.6, 2.4, -1.3, { type: 'spot', dir: [-0.3, -1, -0.4], cone: 75, inner: 35, color: 0xdcecee, intensity: 6, range: 11, schedule: 'night', placement: tube, flicker: rng.chance(0.5) ? 'buzz' : 'dying', haloSize: 0.6, tag: 'lamp' })
  sign(ctx, F, 0, 2.38, -1.125, 0, -1, { w: 1.2, h: 0.24, ppm: 100, lines: [o.label ?? 'ОХРАНА'], bg: '#1d3a66', color: '#eee', font: SIGN_FONT, aged: 0.3, seed: 2 })
  let k = 0
  interact(ctx, F, 0, 1.4, -1.25, [1.6, 1.0, 0.5], {
    tag: 'guard', reach: 2.4,
    prompt: { ru: 'Постучать в окно', en: 'Knock on the window' },
    onUse(game) {
      const l = GUARD_LINES[k++ % GUARD_LINES.length]
      game.audio?.play?.('door_wood', { pos: F.p(0, 1.4, -1.1), gain: 0.2 })
      game.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 3.5)
      game.audio?.play?.('kiosk_voice', { pos: F.p(0, 1.3, 0), gain: 0.45 })
    },
  })
  addEmitter({ name: 'tv_muffled', pos: F.p(-0.6, 1.0, -0.6), gain: 0.2, radius: 14, refDistance: 1 })
  addEmitter({ name: 'fluorescent_buzz', pos: F.p(-1.4, 2.5, -1.2), gain: 0.15, radius: 12, refDistance: 1 })
  return { placement: p, frame: F }
}

/**
 * Warehouse base: shed 36 × 18 m centred on (x, z) with its 3 m loading dock on local −Z; the
 * gate (6 m) stands 14 m in front of the dock with the guard booth inside the fence, right of it.
 * opts: { x, z, rot (quarter turns), y, seed, gate=true, name ('СКЛАД № 2') }
 * Returns { placement, gate, booth, frame, gatePos: [x,z] }
 */
export function placeWarehouse(ctx, o) {
  const F = frameFor(ctx, { ...o, angle: (o.rot ?? 0) * HALF_PI })
  const rng = new RNG(seedInt(o.seed, 19))
  const y = F.y
  flatten(ctx, F, -18.25, lzW(0) - 0.25, 18.25, lzW(WZ) + 0.25, y, M('snow_dirty'))
  const p = put(ctx, F, 'pub_warehouse', 0, 0, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'warehouse' } })
  // yard in front: packed, rutted snow
  paint(ctx, F, -16, lzW(0) - 14, 16, lzW(0), M('snow_packed'))
  // truck ruts from the gate to the dock: two dirty tracks in the packed yard snow
  {
    const ax = 8, az = lzW(0) - 26, bx = 4, bz = lzW(0) - 2
    const len = Math.hypot(bx - ax, bz - az), px = (bz - az) / len, pz = -(bx - ax) / len
    for (const s of [-0.85, 0.85]) {
      ctx.terrain.paintLine(F.wx(ax + px * s, az + pz * s), F.wz(ax + px * s, az + pz * s), F.wx(bx + px * s, bz + pz * s), F.wz(bx + px * s, bz + pz * s), 0.5, { mat: M('snow_dirty') })
    }
  }
  // signs on the shed
  const name = o.name ?? 'СКЛАД № 2'
  sign(ctx, F, lxW(64), 5.6, lzW(DOCK), 0, -1, { w: 4.2, h: 0.75, ppm: 50, aged: 0.5, seed: 3, draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: [name], color: 'rgba(225,222,210,0.9)', font: SIGN_FONT }) } })
  sign(ctx, F, lxW(50), 2.2, lzW(DOCK), 0, -1, { w: 0.7, h: 0.35, ppm: 110, aged: 0.4, seed: 4, lines: ['ОАО «МОССНАБТОРГ»', 'отдел приёмки'], bg: '#e4e0d4', color: '#1d2a55', font: PLAIN_FONT })
  sign(ctx, F, lxW(36), 3.0, lzW(DOCK), 0, -1, { w: 0.55, h: 0.3, ppm: 110, aged: 0.5, seed: 5, lines: ['НЕ КУРИТЬ!'], bg: '#c8261c', color: '#f0e8d8', font: SIGN_FONT })
  readable(ctx, F, lxW(50), 2.2, lzW(DOCK) - 0.25, [0.8, 0.5, 0.4], { ru: `${name}\nОАО «Мосснабторг», отдел приёмки\nПриём товара с 8.00 до 17.00`, en: `${name.replace('СКЛАД', 'WAREHOUSE')}\n"Mossnabtorg" JSC, receiving department\nGoods received 8:00 to 17:00`, style: 'sign' })
  // dock floodlight (mercury, cold), some yard light
  const fl = put(ctx, F, 'pub_lamp_tube_bracket', lxW(72), lzW(DOCK), { ly: 5.4, tag: 'lamp' })
  light(ctx, F, lxW(72), 5.3, lzW(DOCK) - 1.2, { type: 'spot', dir: [0, -1, -0.5], cone: 70, inner: 32, color: 0xcfe2e4, intensity: 12, range: 16, schedule: 'street', placement: fl, haloSize: 0.7, tag: 'lamp' })
  let gate = null, booth = null
  const gz = lzW(0) - 14
  if (o.gate !== false) {
    flatten(ctx, F, 2, gz - 1.5, 15, gz + 4, y, M('snow_dirty'))
    gate = put(ctx, F, 'pub_gate_base', 5.0 - 3.25, gz, { tag: 'gate' })
    sign(ctx, F, 8.5, 1.2, gz - 0.14, 0, -1, { w: 0.9, h: 0.5, ppm: 100, aged: 0.4, seed: 7, lines: ['ВЪЕЗД', 'ПО ПРОПУСКАМ', 'Охраняемая территория'], bg: '#e2ddcf', color: '#8a1a14', font: PLAIN_FONT })
    readable(ctx, F, 8.5, 1.2, gz - 0.3, [1.0, 0.6, 0.3], { ru: 'ВЪЕЗД ПО ПРОПУСКАМ\nОхраняемая территория', en: 'ENTRY BY PASS ONLY\nGuarded premises', style: 'sign' })
    booth = placeGuardBooth(ctx, { x: F.wx(11.5, gz + 2), z: F.wz(11.5, gz + 2), y, angle: F.a, seed: o.seed })
  }
  reg(ctx, 'industrial', { kind: 'warehouse', x: F.x, z: F.z, y, angle: F.a, gate: [F.wx(5, gz), F.wz(5, gz)] })
  navPath(ctx, F, [[5, gz - 1], [5, gz - 12]], 'path', { to: 'warehouse_gate' })
  return { placement: p, gate, booth, frame: F, gatePos: [F.wx(5, gz), F.wz(5, gz)] }
}

export const WAREHOUSE_DIMS = { shed: [36, 18], dock: 3, height: 8.5, gateOffset: 14 }
