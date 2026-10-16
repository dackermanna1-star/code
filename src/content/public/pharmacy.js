// «АПТЕКА» — a small pharmacy pavilion with a lit green cross. Enterable 8:00–22:00 (glass
// door, a pharmacist in a white coat behind the counter, shelves of boxes, an old medical
// scale); at night the door is locked and you ring the «night window» hatch.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, frameFor, put, sign, readable, interact, light, zone, flatten, navPath, reg, seed01, seedInt,
  win, pasteFigure, lightBox, drawText, PLAIN_FONT,
} from './lib.js'
import { addEmitter, addDoor, later } from './runtime.js'

const X = 28, Y = 16, Z = 22
const PX = 14, PZ = 12
const FW = 2
const DOOR_X = 3
const lx = vx => (vx - PX) * V
const lz = vz => (vz - PZ) * V

defineModel('pub_pharmacy', () => {
  const m = new VoxelModel(X, Y, Z)
  m.setPivot(PX, 0, PZ)
  const rng = new RNG(5151)
  const z0 = FW, z1 = Z - 1
  const paintM = M('paint_matte'), white = M('whitewash'), tileW = M('wall_tile_white')
  m.fill(0, 0, z0, X, 1, Z - z0, M('granite'))
  for (let z = z0 + 2; z <= z1 - 2; z++) for (let x = 2; x <= X - 3; x++) m.set(x, 0, z, (x + z) % 2 ? M('floor_tile') : M('wall_tile_beige'))
  m.walls(0, 1, z0, X, 12, Z - z0, paintM, 1)
  m.walls(1, 1, z0 + 1, X - 2, 12, Z - z0 - 2, white, 1)
  for (let y = 1; y <= 5; y++) {
    m.fill(1, y, z0 + 1, 1, 1, Z - z0 - 2, tileW); m.fill(X - 2, y, z0 + 1, 1, 1, Z - z0 - 2, tileW)
    m.fill(1, y, z1 - 1, X - 2, 1, 1, tileW)
  }
  for (let y = 1; y <= 2; y++) { m.fill(0, y, z0, X, 1, 1, M('granite')); m.fill(0, y, z0, 1, 1, Z - z0, M('granite')); m.fill(X - 1, y, z0, 1, 1, Z - z0, M('granite')); m.fill(0, y, z1, X, 1, 1, M('granite')) }
  m.fill(1, 12, z0 + 1, X - 2, 1, Z - z0 - 2, white)
  m.fill(0, 13, z0, X, 1, Z - z0, M('roof_tar'))
  m.fill(0, 12, z0, X, 1, 1, paintM); m.fill(0, 12, z1, X, 1, 1, paintM)
  m.walls(0, 14, z0, X, 1, Z - z0, M('metal_gray'), 1)
  // storefront: green-framed glazing
  win(m, 'front', 9, 3, 17, 8, { d0: z0, depth: 1, glass: M('pub_glass_cold'), frame: M('metal_green'), cols: 3, snow: 0.7, rng })
  // door opening + green frame
  m.clear(DOOR_X, 1, z0, 4, 9, 2)
  for (let y = 1; y <= 10; y++) { m.set(DOOR_X - 1, y, z0, M('metal_green')); m.set(DOOR_X + 4, y, z0, M('metal_green')) }
  m.fill(DOOR_X - 1, 10, z0, 6, 1, 1, M('metal_green'))
  // night window hatch right of the door + bell button
  win(m, 'front', 7, 4, 2, 3, { d0: z0, depth: 1, glass: M('glass_clear'), frame: M('metal_green') })
  // sign box
  m.fill(2, 11, 0, 24, 3, 2, M('plastic_white'))
  m.fill(2, 11, 0, 24, 1, 1, M('metal_green'))
  // side window
  win(m, 'right', z0 + 4, 3, 8, 8, { depth: 1, glass: M('pub_glass_cold'), frame: M('metal_green'), cols: 2, snow: 0.7, rng })
  // porch step
  m.fill(1, 0, 0, 9, 1, 2, M('granite'))
  // interior
  const IZ0 = z0 + 2, IZ1 = z1 - 2
  m.addInterior(2, 1, IZ0, X - 4, 11, IZ1 - IZ0 + 1)
  // counter across the room (z 12..13): glass display front, dark wood top
  m.fill(8, 1, 12, 18, 2, 2, M('wood_dark'))
  for (const y of [3, 4]) m.fill(8, y, 12, 18, 1, 1, M('glass_clear'))
  m.fill(8, 5, 12, 18, 1, 2, M('wood_dark'))
  for (let x = 9; x <= 24; x++) if (rng.chance(0.7)) m.set(x, 3, 13, M(rng.pick(['plastic_white', 'metal_green', 'metal_blue', 'plastic_white', 'metal_red'])))
  m.fill(8, 1, 14, 1, 5, 6, M('wood_dark')) // side panel closing the staff area
  m.fill(17, 6, 12, 2, 1, 1, M('plastic_dark')); m.set(18, 6, 12, M('pub_screen'))
  // shelves along the back wall (z 18..19), boxes with coloured stripes
  for (let y = 1; y <= 10; y++) { m.set(8, y, 18, M('wood')); m.set(25, y, 18, M('wood')) }
  for (const y of [1, 3, 5, 7, 9]) m.fill(8, y, 18, 18, 1, 2, M('wood'))
  for (const y of [2, 4, 6, 8]) for (let x = 9; x <= 24; x++) if (!rng.chance(0.15)) m.set(x, y, 18, M(rng.pick(['plastic_white', 'plastic_white', 'metal_green', 'metal_blue', 'metal_red', 'metal_yellow', 'plastic_white'])))
  // side display cabinet (glass) on the left wall
  m.fill(2, 1, 8, 2, 2, 8, M('wood_dark'))
  for (const y of [3, 4, 5, 6]) m.fill(3, y, 8, 1, 1, 8, M('glass_clear'))
  for (const y of [3, 5]) for (let z = 8; z <= 15; z++) if (rng.chance(0.7)) m.set(2, y, z, M(rng.pick(['plastic_white', 'metal_yellow', 'metal_red', 'metal_green'])))
  m.fill(2, 7, 8, 2, 1, 8, M('wood_dark'))
  // the medical scale by the window and a chair
  m.fill(21, 1, 5, 2, 1, 2, M('metal_gray')); m.fill(22, 2, 6, 1, 4, 1, M('plastic_white')); m.set(22, 6, 6, M('chrome'))
  m.fill(12, 1, 6, 2, 2, 2, M('wood')); m.fill(12, 3, 7, 2, 2, 1, M('wood'))
  // fluorescent fixtures
  for (const [x, z] of [[6, 8], [16, 8], [12, 16], [20, 16]]) { m.fill(x, 11, z, 5, 1, 2, M('plastic_white')); m.fill(x + 1, 11, z, 3, 1, 1, M('fluorescent')) }
  // pharmacist in a white coat behind the counter
  pasteFigure(m, 15, 1, 15, 0, { top: M('plastic_white'), bottom: M('plastic_white'), hair: M('wood_dark'), hat: M('plastic_white'), armsFront: true, coatLong: true })
  m.addSnow({ mat: M('snow'), depth: 1, seed: 21 })
  for (let z = z0 + 1; z < z1; z++) for (let x = 1; x < X - 1; x++) {
    if (m.get(x, 14, z) === M('snow') && (Math.sin(x * 0.4 + z * 0.2) > 0.3 || Math.min(x - 1, X - 2 - x, z - z0 - 1, z1 - 1 - z) < 2)) m.set(x, 15, z, M('snow'))
  }
  return m
}, { occludesSnow: true, lods: [1, 2], lodDistances: [55] })

// glass door with a green aluminium frame; pivot = hinge
defineModel('pub_glass_door', () => {
  const m = new VoxelModel(4, 9, 1)
  m.fill(0, 0, 0, 4, 9, 1, M('metal_green'))
  m.fill(1, 1, 0, 2, 7, 1, M('glass_clear'))
  m.set(3, 4, 0, M('chrome'))
  m.setPivot(0, 0, 0)
  return m
}, { dynamic: true, contact: false, lods: [1] })

// the green cross light-box on a bracket, perpendicular to the facade (readable from both
// directions along the street). Pivot at the wall end of the bracket.
defineModel('pub_pharmacy_cross', () => {
  const m = new VoxelModel(1, 5, 7)
  m.fill(0, 0, 0, 1, 5, 5, M('metal_dark'))
  m.fill(0, 1, 2, 1, 3, 1, M('pub_lamp_green'))
  m.fill(0, 2, 1, 1, 1, 3, M('pub_lamp_green'))
  m.fill(0, 2, 5, 1, 1, 2, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(0.5, 0, 7)
  return m
}, { contact: false, collide: false, lods: [1], maxDistance: 300 })

const PRICES = {
  title: 'Цены на лекарства',
  ru: 'Аскорбиновая кислота — 12 р.\nГематоген — 10 р.\nЦитрамон — 9 р.\nАнальгин — 18 р.\nУголь активированный — 7 р.\nВалидол — 15 р.\nАнтигриппин-М (порошки) — 145 р.\nПластырь — 6 р.\n\nБез рецепта не отпускаются: антибиотики.',
  en: 'Medicine prices\nAscorbic acid — 12 rub.\nHematogen bar — 10 rub.\nCitramon — 9 rub.\nAnalgin — 18 rub.\nActivated charcoal — 7 rub.\nValidol — 15 rub.\nAntigrippin-M (sachets) — 145 rub.\nSticking plaster — 6 rub.\n\nNot sold without a prescription: antibiotics.',
}
const LINES = [
  { ru: 'Слушаю вас.', en: 'Yes, what do you need?' },
  { ru: 'Рецепт есть?', en: 'Do you have a prescription?' },
  { ru: 'Аскорбинка? Двенадцать рублей.', en: 'Ascorbic acid? Twelve roubles.' },
]

/** Day hours: 8:00–22:00 (minutes from midnight). */
const isDay = game => {
  const m = game?.atmos?.minutes ?? 720
  return m >= 480 && m < 1320
}

/**
 * Place the pharmacy pavilion «АПТЕКА». Footprint 7 × 5 m centred on (x, z), entrance on local −Z
 * (left end), green cross on a bracket above the door. Open 8–22; night window otherwise.
 * opts: { x, z, rot | angle, y, seed, tint, name ('АПТЕКА'), flatten=true }
 */
export function placePharmacy(ctx, o) {
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 51))
  const tint = o.tint ?? [0xc2c4bb, 0xb9c2b8, 0xc7c1b2][rng.int(0, 2)]
  if (o.flatten !== false) {
    flatten(ctx, F, -3.75, -3.0, 3.75, 2.6, F.y, M('snow_packed'))
  }
  const p = put(ctx, F, 'pub_pharmacy', 0, 0, { tint, seed: seed01(o.seed, 2), tag: 'shop', userData: { kind: 'pharmacy' } })
  const doorP = put(ctx, F, 'pub_glass_door', lx(DOOR_X), lz(FW), { ly: V, dynamic: true, tag: 'entrance', userData: { kind: 'pharmacy_door' } })
  const inner = { min: null, max: null }
  const z1 = zone(ctx, F, lx(1), 0.1, lz(FW + 1), lx(X - 1), 3.0, lz(Z - 1), {
    name: 'pharmacy', type: 'shop', indoor: true, reverb: 'shop', wind: 0.08, traffic: 0.15, snow: false, priority: 2,
  })
  inner.min = z1.min; inner.max = z1.max
  const inside = game => {
    const pp = game.player?.pos
    return pp && pp.x > inner.min[0] && pp.x < inner.max[0] && pp.z > inner.min[2] && pp.z < inner.max[2]
  }
  const door = addDoor(ctx, {
    placement: doorP, closed: F.a, swing: 1, open: 1.5, width: 1, center: F.p(lx(DOOR_X + 2), 1.3, lz(FW + 0.5)),
    size: F.size(1.1, 2.3, 0.7), autoClose: 6,
    sounds: { open: 'door_metal_open', close: 'door_metal_slam', chime: 'shop_bell' },
    isLocked: game => !isDay(game) && !inside(game),
    lockedLabel: { ru: 'Дверь заперта', en: 'The door is locked' },
    lockedNote: { ru: 'Заперто. «Ночью обслуживание через окно».', en: 'Locked. "At night, service through the window."' },
  })
  // the cross on its bracket above the door, and the lights
  const cross = put(ctx, F, 'pub_pharmacy_cross', lx(1.5), lz(FW), { ly: 10.5 * V, tag: 'lamp', userData: { kind: 'pharmacy_cross' } })
  light(ctx, F, lx(1.5), 3.2, lz(FW - 3), { color: 0x3cff7a, intensity: 2.2, range: 7, placement: cross, haloSize: 0.7, tag: 'pharmacy_cross' })
  light(ctx, F, lx(12), 2.7, lz(9), { color: 0xf2f4e6, intensity: 2.2, range: 8, domain: 'indoor', halo: false })
  // after 22:00 only the night light burns; the tube voxels and far glass follow (placement flag)
  light(ctx, F, lx(17), 2.7, lz(16), { color: 0xf2f4e6, intensity: 2.0, range: 8, domain: 'indoor', halo: false, placement: p,
    schedule: env => isDay(env.game) ? 1 : 0.35 })
  light(ctx, F, lx(17), 2.3, lz(FW - 1.5), { type: 'spot', dir: [0, -0.65, -1], cone: 70, inner: 30, color: 0xe8f4ee, intensity: 9, range: 10, schedule: 'night', halo: false, scatter: 0.4 })
  // signs
  const name = o.name ?? 'АПТЕКА'
  sign(ctx, F, lx(14), 12 * V + 0.06, lz(0), 0, -1, {
    w: 5.8, h: 0.66, ppm: 60, emissive: 1.2,
    draw: lightBox({ lines: [name], color: '#1c7a3c', bg: '#eef1ea', vignette: 0.25 }),
  })
  readable(ctx, F, lx(14), 3.1, lz(0) - 0.2, [5.8, 0.7, 0.4], { ru: name, en: 'PHARMACY', style: 'sign' })
  sign(ctx, F, lx(8), 1.95, lz(FW), 0, -1, { w: 0.48, h: 0.2, ppm: 160, lines: ['НОЧНОЕ ОКНО', 'звоните'], bg: '#e8ecdf', color: '#1c5a30', font: PLAIN_FONT })
  sign(ctx, F, lx(DOOR_X + 2), 1.25, lz(FW + 0.6) - 0.02, 0, -1, {
    w: 0.36, h: 0.3, ppm: 160, aged: 0.2, seed: 9,
    draw: (c, W, H) => drawText(c, W, H, { lines: ['АПТЕКА', 'Режим работы:', 'с 8.00 до 22.00', 'ночью — через окно'], bg: '#f0f0e8', color: '#1c3a28', font: PLAIN_FONT }),
  })
  readable(ctx, F, lx(DOOR_X + 2), 1.25, lz(FW) - 0.2, [0.5, 0.4, 0.3], { ru: 'АПТЕКА\nРежим работы: с 8.00 до 22.00\nНочью обслуживание через окно', en: 'PHARMACY\nOpen 8:00 to 22:00\nAt night, service through the window', style: 'sign' })
  // posters inside
  sign(ctx, F, lx(2), 1.8, lz(17), 1, 0, {
    w: 0.7, h: 0.95, ppm: 90, indoor: true, aged: 0.2, seed: 4,
    draw: (c, W, H) => { drawText(c, W, H, { lines: ['ГРИПП!', 'Защити себя', 'и своих', 'близких', 'Сделай прививку'], bg: '#d8e6ee', color: '#1a3a7a' }) },
  })
  readable(ctx, F, lx(2.3), 1.8, lz(17), [0.3, 1.0, 0.8], { ru: 'ГРИПП! Защити себя и своих близких.\nСделай прививку.\nПрививочный кабинет поликлиники № 112, каб. 14', en: 'FLU! Protect yourself and your loved ones.\nGet vaccinated.\nVaccination room of polyclinic No. 112, room 14', style: 'notice' })
  readable(ctx, F, lx(16.5), 1.2, lz(11.6), [4.4, 0.8, 0.5], { ...PRICES, style: 'ticket' }, { prompt: { ru: 'Смотреть цены', en: 'Look at the prices' } })
  // speak to the pharmacist (inside) or ring the night window
  let k = 0
  interact(ctx, F, lx(16.5), 1.45, lz(13), [1.6, 0.8, 1.0], {
    tag: 'pharmacist', reach: 2.6,
    prompt: { ru: 'Обратиться к фармацевту', en: 'Speak to the pharmacist' },
    onUse(game) {
      const l = LINES[k++ % LINES.length]
      game.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 3.5)
      game.audio?.play?.('cashier_voice', { pos: F.p(lx(16.5), 1.6, lz(16)), gain: 0.5 })
    },
  })
  let ringing = false
  interact(ctx, F, lx(8), 1.35, lz(FW) - 0.15, [0.6, 0.6, 0.4], {
    tag: 'bell', reach: 2.2,
    prompt: { ru: 'Позвонить в ночное окно', en: 'Ring the night window' },
    onUse(game) {
      if (ringing) return
      ringing = true
      game.audio?.play?.('doorbell', { pos: F.p(lx(8), 1.6, lz(FW + 3)), gain: 0.35 })
      later(3.2, g => {
        ringing = false
        const l = isDay(g) ? { ru: 'Заходите, открыто!', en: 'Come in, it\'s open!' } : { ru: 'Слушаю. Что вам?', en: 'Yes? What do you need?' }
        g.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 3.5)
        g.audio?.play?.('cashier_voice', { pos: F.p(lx(8), 1.6, lz(FW + 2)), gain: 0.45 })
      })
    },
  })
  addEmitter({ name: 'fluorescent_buzz', pos: F.p(lx(17), 2.8, lz(9)), gain: 0.14, radius: 12, refDistance: 1 })
  const entrance = [F.wx(lx(DOOR_X + 2), lz(-3)), F.wz(lx(DOOR_X + 2), lz(-3))]
  navPath(ctx, F, [[lx(DOOR_X + 2), lz(-1)], [lx(DOOR_X + 2), lz(-24)]], 'path', { to: 'pharmacy' })
  reg(ctx, 'shops', { kind: 'pharmacy', name, x: F.x, z: F.z, y: F.y, angle: F.a, entrance, door, interior: inner, placement: p, hours: [8, 22] })
  reg(ctx, 'entrances', { x: entrance[0], y: F.y, z: entrance[1], angle: F.ang(0, -1), kind: 'pharmacy', enterable: true })
  return { placement: p, door, cross, frame: F, interior: inner }
}

export const PHARMACY_DIMS = { w: 7, d: 5, h: 3.75 }
