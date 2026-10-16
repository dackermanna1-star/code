// The underground vestibule off the underpass: pendulum glass doors under «ВХОД В МЕТРО», the
// ticket office «КАССЫ» (one window lit, one closed), a line of АКП-73-style turnstiles with the
// controller's glass booth, fences, the line map, rules, fares, and the escalator head.

import { defineModel } from '../../core/models.js'
import { MAT } from './materials.js'
import { WB, V, h3 } from './vox.js'
import { Y, VEST, VEST_DOOR, TURN, ESC } from './layout.js'
import { drawMetroEntrance, drawLightbox, drawFares, drawLineMap, drawNotice, drawText, SIGN_FONT } from './drawings.js'
import { T } from './texts.js'
import { TUBE_GLOW } from './underpass.js'

const F0 = Y.FLOOR, C0 = Y.CEIL

/** Turnstile cabinets (z0 of each 0.5 m cabinet) and lanes (z0, z1, entry?). */
export const CABINETS = Array.from({ length: TURN.n }, (_, i) => TURN.z0 + i * (TURN.cab + TURN.lane))
export const LANES = Array.from({ length: TURN.n - 1 }, (_, i) => {
  const z0 = TURN.z0 + TURN.cab + i * (TURN.cab + TURN.lane)
  return { i, z0, z1: z0 + TURN.lane, entry: i < 4 }
})
export const KASSA = { x0: 393, x1: 398.5, z0: 531, z1: 533.25, win1: [394, 395.5], win2: [396.5, 398] }
export const BOOTH = { x0: 400.5, x1: 402.5, z0: 544, z1: 546 }

defineModel('metro_vestibule', () => {
  const b = new WB(VEST.x0, Y.SLAB, VEST.z0, VEST.x1, Y.CEIL_TOP, VEST.z1)
  const m = b.m
  b.fill(VEST.x0, Y.SLAB, VEST.z0, VEST.x1, Y.CEIL_TOP, VEST.z1, MAT.concrete)
  b.clear(VEST.x0, F0, VEST_DOOR.z0, VEST.hx0, C0, VEST_DOOR.z1) // passage
  b.clear(VEST.hx0, F0, VEST.hz0, VEST.hx1, C0, VEST.hz1) // hall
  b.clear(VEST.hx1, Y.SLAB, ESC.wallN[1], VEST.x1, C0, ESC.wallS[0]) // escalator opening (incl. floor)
  // kassa room: partition with two windows, the staff door on its east side
  const K = KASSA
  b.fill(K.x0, F0, K.z1 - V, K.x1, C0, K.z1, MAT.marbleGray)
  b.fill(K.x1 - V, F0, K.z0, K.x1, C0, K.z1, MAT.marbleGray)
  for (const [w0, w1] of [K.win1, K.win2]) {
    b.fill(w0, F0 + 1.0, K.z1 - V, w1, F0 + 2.0, K.z1, MAT.air) // the hatch (see glass note in underpass.js)
    b.fill(w0, F0 + 1.75, K.z1 - V, w1, F0 + 2.0, K.z1, MAT.chrome)
    b.fill(w0, F0 + 0.75, K.z1, w1, F0 + 1.0, K.z1 + V, MAT.metalGray) // counter ledge / coin tray
  }
  b.fill(K.x1 - V, F0, K.z0 + 0.5, K.x1, F0 + 2.0, K.z0 + 1.5, MAT.woodDark) // staff door
  b.fill(K.x0, F0, K.z0, K.x1 - V, F0 + V, K.z1 - V, MAT.linoleum)
  b.fill(K.x0 + 0.25, F0 + V, K.z0 + 0.25, K.x1 - 0.5, F0 + 0.75, K.z0 + 1.0, MAT.wood) // desk
  b.fill(K.x0 + 0.75, F0 + 0.75, K.z0 + 0.5, K.x0 + 1.25, F0 + 1.0, K.z0 + 0.75, MAT.plasticDark) // till
  b.fill(K.x0 + 2.5, F0 + 0.75, K.z0 + 0.25, K.x0 + 2.75, F0 + 1.0, K.z0 + 0.5, MAT.lampBulb) // desk lamp
  b.fill(K.x0 + 3.5, F0 + 0.75, K.z0 + 0.25, K.x0 + 4.25, F0 + 1.0, K.z0 + 0.75, MAT.paper) // ticket rolls
  // the doors: four bronze-anodised posts, transom, two closed bays and the open middle bay
  const D = VEST_DOOR, bronze = MAT.metalBrown
  for (const z of [D.z0, 538.875, 540.875, D.z1 - V]) b.fill(390, F0, z, 390.5, C0, z + V, bronze)
  b.fill(390, F0 + 2.25, D.z0, 390.5, C0, D.z1, bronze)
  for (const [z0, z1] of [[D.z0 + V, 538.875], [541.125, D.z1 - V]]) {
    b.fill(390.125, F0, z0, 390.375, F0 + 2.25, z1, MAT.glassFrosted)
    b.fill(390.125, F0, z0, 390.375, F0 + 0.25, z1, bronze)
    b.fill(390.125, F0 + 2.0, z0, 390.375, F0 + 2.25, z1, bronze)
    b.fill(390.125, F0 + 1.0, z0, 390.375, F0 + 1.25, z1, MAT.chrome) // push plates
  }
  for (const z of [539.125, 540.625]) { // open leaves swung inwards
    b.fill(390.5, F0, z, 391.5, F0 + 2.25, z + V, MAT.glassFrosted)
    b.fill(390.5, F0, z, 391.5, F0 + 0.25, z + V, bronze)
    b.fill(390.5, F0 + 2.0, z, 391.5, F0 + 2.25, z + V, bronze)
    b.fill(391.25, F0, z, 391.5, F0 + 2.25, z + V, bronze)
  }
  b.fill(390.5, C0 - 0.25, D.z0, 391.5, C0, D.z1, MAT.metalGray) // warm-air curtain box
  // fences from the walls to the turnstile line, and from the booth to the south wall
  const fx = 401.5
  for (const [z0, z1] of [[VEST.hz0, TURN.z0], [546, VEST.hz1]]) {
    b.fill(fx, F0, z0, fx + V, F0 + 0.75, z1, MAT.metalGray)
    b.fill(fx, F0 + 0.75, z0, fx + V, F0 + 1.0, z1, MAT.chrome)
  }
  // police door on the south wall
  b.fill(396, F0, VEST.hz1, 397.25, F0 + 2.0, VEST.hz1 + V, MAT.woodDark)

  // ---- skins
  b.skin(VEST.x0, Y.SLAB, VEST.z0, VEST.x1, Y.CEIL_TOP, VEST.z1, {
    floor: (i, j, k) => {
      const x = b.wx(i), z = b.wz(k)
      if (x > K.x0 && x < K.x1 && z < K.z1) return 0 // kassa keeps its linoleum
      if (x < 393) {
        if (x < 392 && h3(i, 0, k, 3) > 0.35) return MAT.rubber // mats inside the doors
        return h3(i, 0, k, 4) > 0.6 ? MAT.wet : MAT.slush
      }
      if (x >= ESC.xTop - 0.5 && z > ESC.wallN[1] && z < ESC.wallS[0]) return MAT.metalGray // comb plates
      // granite with gabbro borders along the walls and a band across at the turnstiles
      const edge = z < VEST.hz0 + 0.5 || z > VEST.hz1 - 0.5 || x < 393.5
      if (edge) return MAT.gabbro
      if (Math.abs(x - 401.75) < 0.5) return MAT.gabbro
      const slab = h3(Math.floor(i / 2), 2, Math.floor(k / 2), 9)
      let mat = slab < 0.65 ? MAT.granite : slab < 0.985 ? MAT.graniteGrey : MAT.graniteLight
      if (Math.abs(z - 540) < 0.13) mat = MAT.floorTileRed
      // tracked-in meltwater and salt rims, thinning out from the doors toward the turnstiles
      const tracked = Math.max(0, Math.min(1, (400 - x) / 7))
      if (h3(i, 1, k, 5) > 1 - 0.09 * tracked) mat = MAT.wet
      else if (h3(i, 1, k, 6) > 1 - 0.05 * tracked) mat = MAT.graniteLight
      return mat
    },
    ceil: (i, j, k) => (h3(i, 7, k, 2) > 0.94 ? MAT.concreteLight : MAT.whitewash),
    wall: (i, j, k) => {
      const x = b.wx(i), z = b.wz(k), y = b.wy(j) - F0
      const id = m.get(i, j, k)
      if (id === MAT.glass || id === MAT.glassFrosted || id === bronze || id === MAT.chrome || id === MAT.woodDark || id === MAT.metalGray) return 0
      if (x > K.x0 && x < K.x1 && z < K.z1 - V) return MAT.whitewash // inside the kassa
      if (y < 0.25) return MAT.gabbro
      if (y < 1.5) return MAT.marbleGray
      return h3(i, j, k, 12) > 0.96 ? MAT.tileCream : MAT.marbleWhite
    },
  })
  return m
}, { indoor: true, occludesSnow: true, contact: false, lods: [1], maxDistance: 150 })

/** АКП-73-style turnstile cabinet (pivot: west end, centre, floor). exit: red lamps facing west. */
function turnstile(exit) {
  const b = new WB(0, 0, -0.25, 1.5, 1.25, 0.25)
  b.fill(0, 0, -0.25, 1.5, 0.75, 0.25, MAT.metalGray)
  b.fill(0, 0.75, -0.25, 1.5, 1.0, 0.25, MAT.metalDark) // top cover
  b.fill(0.25, 0, -0.25, 1.25, 0.25, 0.25, MAT.concreteDark) // kick plate
  if (!exit) {
    b.fill(0, 1.0, -0.125, 0.25, 1.0 + V, 0.125, MAT.kioskWarm) // the yellow «метка» target
    b.fill(0.25, 1.0, -0.125, 0.5, 1.0 + V, 0.125, MAT.plasticDark) // trips-left display
    b.fill(0, 0.5, -0.125, 0.0 + V, 0.75, 0.125, MAT.signalGreen) // green arrow (west face)
  } else {
    b.fill(0, 0.5, -0.125, V, 0.75, 0.125, MAT.taillight) // red cross
    b.fill(1.25, 0.5, -0.125, 1.5, 0.75, 0.125, MAT.signalGreen) // exit allowed (east face)
  }
  return b.pivot(0, 0, 0)
}
defineModel('metro_turnstile', () => turnstile(false), { indoor: true, contact: false, lods: [1], maxDistance: 80 })
defineModel('metro_turnstile_exit', () => turnstile(true), { indoor: true, contact: false, lods: [1], maxDistance: 80 })

/** The closed flaps of one lane (shown and solid only when they slam). Pivot: lane centre. */
defineModel('metro_turnstile_flaps', () => {
  const b = new WB(-0.125, 0, -0.375, 0.125, 0.5, 0.375)
  b.fill(-0.125, 0, -0.375, 0.125, 0.5, 0.375, MAT.metalGray)
  b.fill(-0.125, 0.25, -0.375, 0.125, 0.5, 0.375, MAT.rubber)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 60 })

/** Controller's glass booth (pivot: north-west corner, floor). */
defineModel('metro_control_booth', () => {
  const b = new WB(0, 0, 0, 2, 2.5, 2)
  b.fill(0, 0, 0, 2, 1.0, 2, MAT.metalGray)
  b.fill(0.25, V, 0.25, 1.75, 1.0, 1.75, MAT.air)
  b.fill(0, 1.75, 0, 2, 2.0, 2, MAT.metalGray) // glazing bars (the panes themselves are left out)
  for (const [x, z] of [[0, 0], [1.75, 0], [0, 1.75], [1.75, 1.75]]) b.fill(x, 0, z, x + V, 2.25, z + V, MAT.metalGray)
  b.fill(0, 2.0, 0, 2, 2.25, 2, MAT.plasticWhite)
  b.fill(1.75, 0, 0.5, 2, 2.0, 1.25, MAT.metalGray) // door (east)
  b.fill(0.25, V, 0.25, 1.75, 0.5, 0.5, MAT.wood) // desk along the west glass
  b.fill(0.5, 0.75, 0.25, 0.75, 1.0, 0.5, MAT.lampBulb)
  b.fill(0.25, V, 0.25, 1.75, V * 2, 1.75, MAT.linoleum)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 80 })

/** Hanging 2000s lightbox (pivot: top centre at the ceiling; faces ±x). */
defineModel('metro_lightbox', () => {
  const b = new WB(-0.125, -0.75, -1.125, 0.125, 0, 1.125)
  b.fill(-0.125, -0.75, -1.125, 0.125, -0.25, 1.125, MAT.plasticWhite)
  for (const z of [-0.75, 0.5]) b.fill(-0.125, -0.25, z, 0.125, 0, z + V, MAT.metalGray) // hangers
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, collide: false, cullBottom: false, lods: [1], maxDistance: 120 })

export function buildVestibule(ctx, out) {
  const { world, lights, signs, zones, interactions } = ctx
  const ud = { pkg: 'metro', noRelocate: true }
  out.underground.push(world.place('metro_vestibule', { x: VEST.x0, y: Y.SLAB, z: VEST.z0, rot: 0, tag: 'metro_vestibule', userData: ud }))

  // ---- turnstiles and flaps
  CABINETS.forEach((z0, i) => {
    const exit = i >= 5
    out.underground.push(world.place(exit ? 'metro_turnstile_exit' : 'metro_turnstile', { x: TURN.x0, y: F0, z: z0 + TURN.cab / 2, rot: 0, tag: 'turnstile', userData: ud }))
  })
  for (const L of LANES) {
    const p = world.place('metro_turnstile_flaps', { x: TURN.x0 + 0.875, y: F0 + 0.5, z: (L.z0 + L.z1) / 2, rot: 0, visible: false, collide: false, tag: 'turnstile_flap', userData: ud })
    out.flaps.push({ lane: L, p, t: 0 })
  }
  // «ВХОДА НЕТ» on the exit lanes, «ВЫХОД» arrows for those coming up
  for (const L of LANES.filter(l => !l.entry)) {
    const zc = (L.z0 + L.z1) / 2
    signs.add({ x: TURN.x0 - 0.01, y: F0 + 1.55, z: zc, angle: -Math.PI / 2, w: 0.5, h: 0.5, ppm: 96, indoor: true, draw: (c, W, H) => {
      c.fillStyle = '#e9e7e0'; c.fillRect(0, 0, W, H)
      c.fillStyle = '#c8261c'; c.beginPath(); c.arc(W / 2, H * 0.4, H * 0.3, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#fff'; c.fillRect(W * 0.3, H * 0.36, W * 0.4, H * 0.08)
      c.save(); c.translate(0, H * 0.72); drawText(c, W, H * 0.28, { lines: ['ВХОДА НЕТ'], color: '#1a1a1a', font: SIGN_FONT, pad: 2 }); c.restore()
    } })
    signs.add({ x: TURN.x1 + 0.01, y: F0 + 1.55, z: zc, angle: Math.PI / 2, w: 0.5, h: 0.32, ppm: 96, indoor: true, lines: ['ВЫХОД'], bg: '#2e7a42', color: '#f1f1ea', font: SIGN_FONT })
  }
  out.underground.push(world.place('metro_control_booth', { x: BOOTH.x0, y: F0, z: BOOTH.z0, rot: 0, tag: 'metro_booth', userData: ud }))
  out.lightGroups.vestibule.push(lights.add({ x: BOOTH.x0 + 0.8, y: F0 + 1.9, z: BOOTH.z0 + 1.0, color: 0xffd7a0, intensity: 0.7, range: 3, domain: 'indoor', halo: false }))

  // ---- signs
  signs.add({ x: VEST.x0 - 0.01, y: F0 + 2.5, z: (VEST_DOOR.z0 + VEST_DOOR.z1) / 2, angle: -Math.PI / 2, w: 5.4, h: 0.46, ppm: 64, draw: (c, W, H) => drawMetroEntrance(c, W, H, 'ВХОД В МЕТРО · СТАНЦИЯ «ЗАРЕЧНАЯ»'), emissive: 1.1, indoor: true, aged: 0.15, seed: 1 })
  signs.add({ x: 396, y: F0 + 2.4, z: KASSA.z1 + 0.01, angle: 0, w: 2.4, h: 0.42, ppm: 64, lines: ['КАССЫ'], bg: '#e9e7e0', color: '#1b1b1b', font: SIGN_FONT, emissive: 1.0, indoor: true })
  signs.add({ x: 397.25, y: F0 + 1.45, z: KASSA.z1 + 0.01, angle: 0, w: 0.9, h: 0.3, ppm: 90, lines: ['КАССА ЗАКРЫТА'], bg: '#ddd8c8', color: '#8a1f18', font: SIGN_FONT, indoor: true, aged: 0.3, seed: 2 })
  signs.add({ x: 393.01, y: F0 + 1.6, z: 535.1, angle: Math.PI / 2, w: 1.0, h: 1.3, ppm: 80, draw: drawFares, indoor: true, aged: 0.15, seed: 4 })
  signs.add({ x: 404.75, y: F0 + 1.6, z: VEST.hz0 + 0.01, angle: 0, w: 2.2, h: 1.4, ppm: 72, draw: drawLineMap, indoor: true, aged: 0.2, seed: 5 })
  signs.add({ x: 399.6, y: F0 + 1.6, z: VEST.hz0 + 0.01, angle: 0, w: 0.8, h: 1.1, ppm: 80, draw: (c, W, H) => drawNotice(c, W, H, { title: 'ПРАВИЛА', lines: ['пользования', 'метрополитеном', '', 'Стойте справа,', 'проходите слева.', 'Держитесь', 'за поручень.'] }), indoor: true, aged: 0.3, seed: 6 })
  signs.add({ x: 393.01, y: F0 + 1.6, z: 545.5, angle: Math.PI / 2, w: 0.9, h: 0.6, ppm: 80, draw: (c, W, H) => drawNotice(c, W, H, { title: 'СТАНЦИЯ «ЗАРЕЧНАЯ»', lines: ['Часы работы', '5:30 — 1:00'] }), indoor: true, aged: 0.15, seed: 7 })
  signs.add({ x: 396.6, y: F0 + 2.25, z: VEST.hz1 - 0.01, angle: Math.PI, w: 1.1, h: 0.28, ppm: 80, lines: ['МИЛИЦИЯ'], bg: '#1d3f7a', color: '#f0f0ea', font: SIGN_FONT, indoor: true })
  signs.add({ x: 390.51, y: F0 + 1.4, z: 538.0, angle: Math.PI / 2, w: 0.5, h: 0.5, ppm: 72, draw: (c, W, H) => drawNotice(c, W, H, { title: 'ВХОД', lines: ['→'] }), indoor: true })
  // hanging lightboxes: «ВЫХОД В ГОРОД» over the passage, «К ПОЕЗДАМ» before the escalators
  out.underground.push(world.place('metro_lightbox', { x: 394.5, y: C0, z: 540, rot: 0, tag: 'metro_sign', userData: ud }))
  signs.add({ x: 394.5 + 0.135, y: C0 - 0.5, z: 540, angle: Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['ВЫХОД В ГОРОД', 'к проспекту Строителей'], arrow: 'left', mark: '#c8261c' }), emissive: 1.0, indoor: true })
  signs.add({ x: 394.5 - 0.135, y: C0 - 0.5, z: 540, angle: -Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['К ПОЕЗДАМ'], arrow: 'right', mark: '#c8261c' }), emissive: 1.0, indoor: true })
  out.underground.push(world.place('metro_lightbox', { x: 409.5, y: C0, z: 540, rot: 0, tag: 'metro_sign', userData: ud }))
  signs.add({ x: 409.5 - 0.135, y: C0 - 0.5, z: 540, angle: -Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['К ПОЕЗДАМ', 'на Центр'], arrow: 'down', mark: '#c8261c' }), emissive: 1.0, indoor: true })
  signs.add({ x: 409.5 + 0.135, y: C0 - 0.5, z: 540, angle: Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['ВЫХОД В ГОРОД'], arrow: 'left', mark: '#c8261c' }), emissive: 1.0, indoor: true })

  // ---- interactions
  const note = (x, y, z, size, n, style, prompt = { ru: 'Читать', en: 'Read' }) => interactions.add({ x, y, z, size, prompt, tag: 'notice', onUse(game) { game.ui.showNote({ ...n, style }) } })
  note(393.2, F0 + 1.6, 535.1, [0.3, 1.3, 1.0], { ru: 'СТОИМОСТЬ ПРОЕЗДА\n(с 1 января 2008 г.)\n\n1 поездка — 19 р.\n2 поездки — 38 р.\n5 поездок — 84 р.\n10 поездок — 155 р.\n20 поездок — 280 р.\n60 поездок — 580 р.\nМесячный, 70 поездок — 600 р.\nМесячный без ограничений — 860 р.', en: 'FARES\n(from 1 January 2008)\n\n1 trip — 19 rub.\n2 trips — 38 rub.\n5 trips — 84 rub.\n10 trips — 155 rub.\n20 trips — 280 rub.\n60 trips — 580 rub.\nMonthly, 70 trips — 600 rub.\nMonthly unlimited — 860 rub.' }, 'notice')
  note(404.75, F0 + 1.6, VEST.hz0 + 0.2, [2.2, 1.4, 0.3], T.map, 'paper', { ru: 'Схема линий', en: 'Line map' })
  note(399.6, F0 + 1.6, VEST.hz0 + 0.2, [0.8, 1.1, 0.3], T.rules, 'notice')
  note(393.2, F0 + 1.6, 545.5, [0.3, 0.6, 0.9], T.stationHours, 'notice')
  interactions.add({ x: 397.25, y: F0 + 1.45, z: KASSA.z1 + 0.25, size: [1.4, 0.9, 0.4], prompt: { ru: 'Касса закрыта', en: 'Window closed' }, tag: 'kassa',
    onUse(game) { game.ui.say({ ru: 'За стеклом — табличка «Касса закрыта».', en: 'Behind the glass: a sign, "Window closed".' }, 3) } })

  // ---- lights (cool tubes in a grid; the kassa glows warm)
  for (const [x, z] of [[396.5, 536], [396.5, 544], [403, 535], [403, 545], [401.5, 540], [408.5, 540]]) {
    out.lightGroups.vestibule.push(lights.add({ x, y: C0 - 0.35, z, color: 0xe8f0ea, intensity: 1.9, range: 8.5, domain: 'indoor', halo: false, tag: 'metro_tube' }))
  }
  out.lightGroups.vestibule.push(lights.add({ x: 395.5, y: F0 + 2.1, z: 532.2, color: 0xffcf96, intensity: 1.1, range: 4.5, domain: 'indoor', halo: false, tag: 'metro_kassa' }))
  for (let x = 395.5; x < 411; x += 3) for (const z of [534.25, 540, 545.75]) {
    const p = world.place('metro_fixture', { x, y: C0, z, rot: 0, tag: 'metro_tube', flag: h3(Math.round(x), 0, Math.round(z), 3) > 0.9 ? 0 : TUBE_GLOW, userData: ud })
    out.underground.push(p)
    out.tubes.push({ x, y: C0 - 0.2, z, state: p.flag ? 'ok' : 'dead' })
  }

  // ---- zone
  zones.add({ name: 'metro_vestibule', type: 'metro', min: [VEST.x0, Y.SLAB, VEST.z0], max: [VEST.x1, C0 + 0.1, VEST.z1], indoor: true,
    reverb: 'hall', snow: false, wind: 0.05, traffic: 0.12, priority: 1, exposure: 1.05, data: { pkg: 'metro' } })
  ctx.navPaths.push({ points: [[386, 540], [392, 540], [400, 538.1], [404, 540], [412, 540]], kind: 'metro', y: F0 })
}
