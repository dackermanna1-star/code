// Small utility buildings: the transformer substation (ТП) with its «Не влезай — убьёт!» plates
// and 100 Hz hum, and the bus-terminal dispatcher booth (диспетчерская) with a lit window,
// a desk lamp, a kettle, a red telephone, a timetable, and a stovepipe on the roof.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, frameFor, put, sign, readable, interact, light, flatten, navPath, reg, seed01, seedInt, win,
  pasteFigure, drawText, dangerPlate, SIGN_FONT, PLAIN_FONT,
} from './lib.js'
import { addEmitter, RT } from './runtime.js'

// ---- transformer substation (6 × 4.5 m) -------------------------------------------------------
const TX = 26, TZ = 20, TY = 17
defineModel('pub_substation', () => {
  const m = new VoxelModel(TX, TY, TZ)
  const rng = new RNG(2417)
  const wall = M('brick_silicate')
  m.fill(1, 0, 1, TX - 2, 14, TZ - 2, M('concrete'))
  m.fill(1, 0, 1, TX - 2, 2, 1, M('concrete_dark')); m.fill(1, 0, TZ - 2, TX - 2, 2, 1, M('concrete_dark'))
  m.fill(1, 2, 1, TX - 2, 12, 1, wall); m.fill(1, 2, TZ - 2, TX - 2, 12, 1, wall)
  m.fill(1, 2, 1, 1, 12, TZ - 2, wall); m.fill(TX - 2, 2, 1, 1, 12, TZ - 2, wall)
  m.fill(1, 0, 1, 1, 2, TZ - 2, M('concrete_dark')); m.fill(TX - 2, 0, 1, 1, 2, TZ - 2, M('concrete_dark'))
  m.fill(0, 14, 0, TX, 1, TZ, M('concrete'))
  m.fill(0, 15, 0, TX, 1, TZ, M('roof_tar'))
  // two pairs of steel doors with louvres
  for (const dx of [3, 15]) {
    m.fill(dx, 0, 1, 8, 10, 1, M('metal_gray'))
    for (let y = 0; y < 10; y++) m.set(dx + 4, y, 1, M('metal_dark'))
    // louvre panels in the upper part of each leaf (slats)
    for (const lx0 of [dx + 1, dx + 5]) for (const y of [6, 8]) for (let x = lx0; x < lx0 + 2; x++) m.set(x, y, 1, M('metal_dark'))
    m.fill(dx - 1, 10, 1, 10, 1, 1, M('concrete_light'))
    for (let k = 0; k < 10; k++) m.set(dx + rng.int(0, 7), rng.int(0, 4), 1, M('metal_rust'))
    m.set(dx + 3, 4, 1, M('chrome'))
  }
  // vent grilles high on the sides
  for (const z of [5, 12]) for (let y = 9; y <= 11; y++) for (let k = 0; k < 3; k++) { m.set(1, y, z + k, (y + k) % 2 ? M('metal_dark') : M('concrete_dark')); m.set(TX - 2, y, z + k, (y + k) % 2 ? M('metal_dark') : M('concrete_dark')) }
  // cables entering at the back
  for (const x of [6, 9, 18]) { m.set(x, 0, TZ - 1, M('rubber')); m.set(x, 1, TZ - 1, M('rubber')) }
  // weathering
  for (let k = 0; k < 20; k++) { const x = rng.int(1, TX - 2), y = rng.int(3, 13); if (m.get(x, y, 1) === wall) m.set(x, y, 1, M('concrete')) }
  m.addSnow({ mat: M('snow'), depth: 1, seed: 4 })
  for (let z = 0; z < TZ; z++) for (let x = 0; x < TX; x++) if (m.get(x, 16, z) === M('snow') && (x + z) % 3) m.set(x, 16, z, M('snow'))
  return m
}, { occludesSnow: true, lods: [1, 2], lodDistances: [50], maxDistance: 300 })

/**
 * Transformer substation (ТП). Footprint 6 × 4.5 m centred on (x, z); doors on local −Z.
 * opts: { x, z, rot | angle, y, seed, number (e.g. 2417) }
 */
export function placeSubstation(ctx, o) {
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 7))
  const num = o.number ?? rng.int(1100, 2999)
  flatten(ctx, F, -3.25, -2.75, 3.25, 2.5, F.y, M('snow_packed'))
  const p = put(ctx, F, 'pub_substation', 0, 0, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'substation' } })
  const front = -(TZ / 2 - 1) * V
  sign(ctx, F, 0, 2.95, front, 0, -1, { w: 1.6, h: 0.32, ppm: 90, aged: 0.5, seed: 3, draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: [`ТП-${num}`], color: 'rgba(30,30,30,0.85)', font: SIGN_FONT }) } })
  for (const dx of [-1.75, 1.25]) sign(ctx, F, dx, 1.7, front, 0, -1, { w: 0.34, h: 0.34, ppm: 140, aged: 0.35, seed: rng.int(1, 99), draw: dangerPlate })
  sign(ctx, F, 2.75, 1.25, front, 0, -1, { w: 0.42, h: 0.2, ppm: 140, aged: 0.4, seed: 9, lines: ['ОАО «Мосэнергосеть»', 'Авар. 8-495-...'], bg: '#e8e4d8', color: '#1d2a55', font: PLAIN_FONT })
  readable(ctx, F, -0.2, 1.7, front - 0.2, [3.6, 0.6, 0.4], {
    ru: `НЕ ВЛЕЗАЙ — УБЬЁТ!\n\nТП-${num}\nОАО «Мосэнергосеть»\nПри аварии звонить: 8-495-…`,
    en: `KEEP OUT — IT WILL KILL YOU!\n\nTransformer substation TP-${num}\n"Mosenergoset" JSC\nIn an emergency call: 8-495-…`, style: 'sign',
  })
  // graffiti on the side wall
  sign(ctx, F, 3.0 + 0.01, 1.3, 0.2, 1, 0, { w: 1.6, h: 0.7, ppm: 60, draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: [rng.pick(['ЦСКА', 'КОНИ', 'Спартак', 'Цой жив'])], color: 'rgba(40,40,60,0.8)', font: SIGN_FONT, italic: true }) } })
  addEmitter({ name: 'transformer_hum', pos: F.p(0, 1.5, 0), gain: 0.38, radius: 28, refDistance: 2.5 })
  reg(ctx, 'substations', { x: F.x, z: F.z, number: num })
  return { placement: p, frame: F, number: num }
}

// ---- dispatcher booth (6.5 × 3.5 m) -----------------------------------------------------------
const DX = 26, DZ = 15, DY = 15
defineModel('pub_dispatcher', () => {
  const m = new VoxelModel(DX, DY, DZ)
  m.setPivot(DX / 2, 0, 1 + (DZ - 1) / 2)
  const white = M('pub_paint_white'), blue = M('metal_blue')
  m.fill(0, 0, 1, DX, 1, DZ - 1, M('concrete'))
  m.fill(1, 0, 2, DX - 2, 1, DZ - 3, M('linoleum'))
  m.walls(0, 1, 1, DX, 10, DZ - 1, white, 1)
  for (const y of [1, 2]) { m.fill(0, y, 1, DX, 1, 1, blue); m.fill(0, y, DZ - 1, DX, 1, 1, blue); m.fill(0, y, 1, 1, 1, DZ - 1, blue); m.fill(DX - 1, y, 1, 1, 1, DZ - 1, blue) }
  m.fill(0, 10, 1, DX, 1, 1, blue)
  // window and door
  win(m, 'front', 3, 4, 11, 5, { d0: 1, depth: 0, glass: M('pub_glass_warm'), frame: M('plastic_white'), cols: 2 })
  m.fill(17, 1, 1, 4, 8, 1, blue); m.set(20, 5, 1, M('chrome'))
  // roof with an overhang, roofing felt, the stovepipe
  m.fill(0, 11, 0, DX, 1, DZ, M('metal_gray'))
  m.fill(0, 12, 1, DX, 1, DZ - 1, M('roof_tar'))
  for (let y = 12; y < 15; y++) m.set(DX - 4, y, DZ - 3, M('metal_dark'))
  // interior
  m.addInterior(1, 1, 2, DX - 2, 10, DZ - 3)
  m.fill(2, 1, 2, 12, 3, 3, M('wood_dark'))
  m.set(4, 4, 2, M('metal_green')); m.set(4, 5, 2, M('lamp_warm'))
  m.set(7, 4, 3, M('chrome')); m.set(9, 4, 2, M('metal_red')); m.fill(11, 4, 3, 2, 1, 1, M('paper'))
  m.set(12, 4, 2, M('plastic_dark'))
  pasteFigure(m, 7, 1, 5, 0, { pose: 'sit', top: M('wall_paint_brown'), bottom: M('metal_dark'), hair: M('fabric_red'), armsFront: true })
  m.set(15, 1, 11, M('metal_red')); m.set(15, 2, 11, M('taillight'))
  m.fill(1, 1, 10, 4, 6, 3, M('wood')) // cupboard
  m.set(13, 9, 7, M('lamp_bulb'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 6 })
  // the warm stovepipe keeps a hole in the snow around it
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (m.get(DX - 4 + dx, 13, DZ - 3 + dz) === M('snow')) m.set(DX - 4 + dx, 13, DZ - 3 + dz, 0)
  return m
}, { occludesSnow: true, lods: [1, 2], lodDistances: [50], maxDistance: 260 })

const DISP_LINES = [
  { ru: 'Шестьсот сорок восьмой? Скоро будет.', en: 'The 648? It\'ll be here soon.' },
  { ru: 'Интервал двадцать минут. Ждите.', en: 'Twenty-minute interval. Wait.' },
  { ru: 'Скоро. Скоро будет.', en: 'Soon. It\'ll be here soon.' },
  { ru: 'Последний? Нет, не последний.', en: 'The last one? No, not the last one.' },
]

/**
 * Bus-terminal dispatcher booth. Footprint 6.5 × 3.5 m centred on (x, z); window and door on
 * local −Z. opts: { x, z, rot | angle, y, seed, route ('648') }
 */
export function placeDispatcherBooth(ctx, o) {
  const F = frameFor(ctx, o)
  const route = o.route ?? '648'
  flatten(ctx, F, -3.5, -2.25, 3.5, 2.0, F.y, M('snow_packed'))
  const p = put(ctx, F, 'pub_dispatcher', 0, 0, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'dispatcher' } })
  const front = -(DZ - 1) / 2 * V
  light(ctx, F, -1.4, 2.0, front + 1.2, { color: 0xffc27a, intensity: 1.5, range: 5, domain: 'indoor', halo: false })
  light(ctx, F, -1.4, 1.7, front - 0.4, { type: 'spot', dir: [0, -0.6, -1], cone: 70, inner: 30, color: 0xffc888, intensity: 3.5, range: 7, schedule: 'night', halo: false })
  const lamp = put(ctx, F, 'pub_lamp_wall_bulb', (19 - DX / 2) * V, front, { ly: 2.35, tag: 'lamp' })
  light(ctx, F, (19 - DX / 2) * V, 2.3, front - 0.5, { type: 'spot', dir: [0, -1, -0.3], cone: 70, inner: 30, color: 0xffc47e, intensity: 5, range: 8, schedule: 'night', placement: lamp, haloSize: 0.5, tag: 'lamp' })
  sign(ctx, F, -1.4, 2.4, front, 0, -1, { w: 2.6, h: 0.3, ppm: 90, lines: ['ДИСПЕТЧЕРСКАЯ'], bg: '#e8e6dc', color: '#1f3f7a', font: SIGN_FONT, aged: 0.2, seed: 1 })
  // timetable board on the wall right of the door
  const tt = ['АВТОБУС № ' + route, 'Ст. м. «Заречная» — мкр. «Восточный»', 'ИНТЕРВАЛ ДВИЖЕНИЯ', 'Будни: 5.40–7.00 — 15 мин', '7.00–10.00 — 6–8 мин', '10.00–17.00 — 12 мин', '17.00–20.00 — 7 мин', '20.00–1.00 — 20 мин', 'Выходные: 15–20 мин']
  sign(ctx, F, 2.55, 1.6, front, 0, -1, { w: 0.62, h: 0.8, ppm: 140, aged: 0.45, seed: 5, draw: (c, W, H) => drawText(c, W, H, { lines: tt, bg: '#efeee6', color: '#151515', font: PLAIN_FONT, weight: 'normal', lineGap: 0.12, border: '#2a3a6a' }) })
  readable(ctx, F, 2.55, 1.6, front - 0.2, [0.7, 0.9, 0.3], {
    title: 'Расписание', ru: tt.join('\n'),
    en: `BUS No. ${route}\nZarechnaya metro station — Vostochny microdistrict\nSERVICE INTERVAL\nWeekdays: 5:40–7:00 — every 15 min\n7:00–10:00 — every 6–8 min\n10:00–17:00 — every 12 min\n17:00–20:00 — every 7 min\n20:00–1:00 — every 20 min\nWeekends: every 15–20 min`, style: 'notice',
  })
  sign(ctx, F, (19 - DX / 2) * V, 1.5, front - 0.01, 0, -1, { w: 0.4, h: 0.16, ppm: 160, lines: ['ПОСТОРОННИМ', 'ВХОД ВОСПРЕЩЁН'], bg: '#dcd8cc', color: '#8a1a14', font: PLAIN_FONT, aged: 0.4, seed: 8 })
  // inside: the timetable copy and a 2008 calendar on the back wall
  sign(ctx, F, -2.0, 1.75, (DZ - 1 - (1 + (DZ - 1) / 2)) * V, 0, -1, { w: 0.5, h: 0.6, ppm: 100, indoor: true, draw: (c, W, H) => drawText(c, W, H, { lines: ['2008', 'ЯНВАРЬ', 'пн вт ср чт пт сб вс'], bg: '#e8e2d0', color: '#7a1a1a', font: PLAIN_FONT }) })
  let k = 0
  interact(ctx, F, -1.4, 1.5, front - 0.15, [2.8, 1.3, 0.4], {
    tag: 'dispatcher', reach: 2.4,
    prompt: { ru: 'Постучать в окно', en: 'Knock on the window' },
    onUse(game) {
      const l = DISP_LINES[k++ % DISP_LINES.length]
      game.audio?.play?.('door_wood', { pos: F.p(-1.4, 1.5, front), gain: 0.2 })
      game.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 3.8)
      game.audio?.play?.('kiosk_voice', { pos: F.p(-1.4, 1.4, front + 1), gain: 0.4 })
    },
  })
  addEmitter({ name: 'radio_distant', pos: F.p(0.6, 1.2, front + 0.8), gain: 0.14, radius: 16, refDistance: 1, cutoff: 2500 })
  const [sx, sy, sz] = F.p((DX - 4 - DX / 2 + 0.5) * V, 15 * V, (DZ - 3 - 1 - (DZ - 1) / 2 + 0.5) * V)
  RT.pendingSteam.push({ x: sx, y: sy, z: sz, kind: 'vent', rate: 2, size: 0.35, tag: 'stovepipe' })
  reg(ctx, 'dispatchers', { x: F.x, z: F.z, route })
  navPath(ctx, F, [[(19 - DX / 2) * V, front - 1], [(19 - DX / 2) * V, front - 8]], 'path', { to: 'dispatcher' })
  return { placement: p, frame: F }
}

export const SUBSTATION_DIMS = { w: 6, d: 4.5, h: 3.75 }
export const DISPATCHER_DIMS = { w: 6.5, d: 3.5, h: 3.0 }
