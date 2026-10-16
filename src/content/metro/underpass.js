// The pedestrian underpass under проспект Строителей: two stair halls, a 32 m tiled corridor with
// kiosk bays (some lit, some shuttered), fluorescent tubes (one dying, one dead), a payphone,
// posters and notices, meltwater puddles, a leaking ceiling seam with a bucket under it.

import { defineModel } from '../../core/models.js'
import { MAT } from './materials.js'
import { WB, V, h3, fineModel } from './vox.js'
import { Y, UNDERPASS, HALL_N, HALL_S, CORRIDOR, BAY, VEST_DOOR, STAIRS } from './layout.js'
import { drawPoster, drawNotice, drawCard, drawTearOff, drawText, SIGN_FONT, PLAIN_FONT, HAND_FONT } from './drawings.js'
import { T } from './texts.js'

const F0 = Y.FLOOR, C0 = Y.CEIL // floor top / ceiling underside

/** Kiosk bays along the corridor: [side, z0, kind]. side 'W' faces east, 'E' faces west. */
export const KIOSKS = [
  ['W', 525.0, 'flowers'], ['W', 527.5, 'phones'], ['W', 530.0, 'dvd'], ['W', 546.0, 'closed_press'], ['W', 548.5, 'closed_rent'],
  ['E', 525.0, 'shoes'], ['E', 527.5, 'closed_tights'], ['E', 546.0, 'closed_optics'], ['E', 548.5, 'closed_photo'],
]
const KW = 2.5 // kiosk width along the corridor

// ---------------------------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------------------------
defineModel('metro_underpass', () => {
  const U = UNDERPASS
  const b = new WB(U.x0, Y.SLAB, U.z0, U.x1, Y.CEIL_TOP, U.z1)
  const m = b.m
  b.fill(U.x0, Y.SLAB, U.z0, U.x1, Y.CEIL_TOP, U.z1, MAT.concrete)
  const carve = (x0, z0, x1, z1) => b.clear(x0, F0, z0, x1, C0, z1)
  carve(HALL_N.x0, HALL_N.z0, HALL_N.x1, HALL_N.z1)
  carve(HALL_S.x0, HALL_S.z0, HALL_S.x1, HALL_S.z1)
  carve(CORRIDOR.x0, CORRIDOR.z0, CORRIDOR.x1, CORRIDOR.z1)
  for (const st of STAIRS) {
    const z0 = st.rot === 0 ? U.z0 : HALL_S.z1, z1 = st.rot === 0 ? HALL_N.z0 : U.z1
    carve(st.x0 + 0.5, z0, st.x1 - 0.5, z1)
  }
  for (const [side, z0] of KIOSKS) carve(side === 'W' ? BAY.w0 : BAY.e0, z0, side === 'W' ? BAY.w1 : BAY.e1, z0 + KW)
  // the vestibule passage: through the east bay zone and the structural wall
  carve(BAY.e0, VEST_DOOR.z0, U.x1, VEST_DOOR.z1)
  // the vestibule model owns everything east of x 390 around the doors
  b.clear(390, Y.SLAB, 530.5, U.x1, Y.CEIL_TOP, 549.5)

  // ---- skins
  const tileAt = (i, j, k) => {
    const y = b.wy(j) - F0
    let mat = y < 1.0 ? MAT.tileBeige : y < 1.25 ? MAT.tileBrown : MAT.tileWhite
    const n = h3(i, j, k, 31)
    // mismatched repairs come in small rectangular patches
    const p = h3(Math.floor(i / 3), Math.floor(j / 2), Math.floor(k / 3), 77)
    if (p > 0.93 && y > 0.5) mat = p > 0.965 ? MAT.tileBlue : MAT.tileCream
    if (n > 0.985 && y > 1.3) mat = MAT.concreteLight // missing tile, grey cement
    if (y < 0.25 && n > 0.45) mat = MAT.concreteDark // splash grime at the skirting
    return mat
  }
  const floorAt = (i, j, k) => {
    const n = h3(i, 0, k, 13)
    const slab = h3(Math.floor(i / 2), 1, Math.floor(k / 2), 17)
    let mat = slab < 0.45 ? MAT.granite : slab < 0.8 ? MAT.floorTile : MAT.graniteLight
    if (n > 0.97) mat = MAT.concreteDark // chipped
    // the worn middle strip is darker and wetter
    const x = b.wx(i), z = b.wz(k)
    if (Math.abs(x - 385) < 1.2 && h3(i, 2, k, 5) > 0.7) mat = MAT.floorTile
    // meltwater: at the stair feet, in the middle of the corridor, under the leak
    const puddles = [[379, 520.2, 1.3, 0.8], [391, 520.4, 1.1, 0.9], [379, 559.8, 1.0, 0.7], [391.2, 559.6, 1.4, 0.8],
      [384.6, 534.0, 0.9, 1.6], [386.2, 551.2, 1.3, 1.5], [383.4, 541.5, 0.6, 0.8]]
    for (const [px, pz, rx, rz] of puddles) {
      const dx = (x - px) / rx, dz = (z - pz) / rz
      const d = dx * dx + dz * dz + (h3(i, 3, k, 23) - 0.5) * 0.5
      if (d < 1) { mat = MAT.wet; break }
    }
    // flattened cardboard and a rubber mat at the stair feet
    if (x > 378 && x < 379.75 && z > 519.25 && z < 520.0) mat = MAT.wood
    if (x > 390 && x < 392 && z > 560.0 && z < 560.5) mat = MAT.rubber
    return mat
  }
  const ceilAt = (i, j, k) => {
    const x = b.wx(i), z = b.wz(k)
    let mat = MAT.whitewash
    const n = h3(i, 9, k, 3)
    if (n > 0.9) mat = MAT.concreteLight
    // the leaking seam: a long yellowish-grey stain
    const d = Math.hypot(x - 386.2, (z - 551.2) * 0.5)
    if (d < 1.4 && h3(i, 5, k, 8) < 1.2 - d * 0.6) mat = d < 0.5 ? MAT.concreteDark : MAT.concrete
    // a crack along the seam across the corridor
    if (Math.abs(z - 551.0) < 0.13 && h3(i, 6, k, 2) > 0.3) mat = MAT.concrete
    return mat
  }
  b.skin(U.x0, Y.SLAB, U.z0, U.x1, Y.CEIL_TOP, U.z1, { floor: floorAt, ceil: ceilAt, wall: tileAt })
  // a skirting line of dark tiles in the halls where the stairs land
  return m
}, { indoor: true, occludesSnow: true, contact: false, lods: [1], maxDistance: 150 })

// ---------------------------------------------------------------------------------------------
// Kiosks (local: x 0..2.5 along the front, z 0..2 depth with the front at z = 0, y 0..2.75)
// pivot: front centre at floor level. rot 3 → faces east (west bays), rot 1 → faces west.
// ---------------------------------------------------------------------------------------------

function kioskShell(b, frame) {
  b.fill(0, 0, 0, 2.5, 2.75, 2.0, MAT.air)
  b.fill(0, 0, 0, 0.25, 2.75, 2.0, frame)
  b.fill(2.25, 0, 0, 2.5, 2.75, 2.0, frame)
  b.fill(0, 0, 1.75, 2.5, 2.75, 2.0, MAT.plasticWhite)
  b.fill(0, 2.5, 0, 2.5, 2.75, 2.0, frame)
  b.fill(0.25, 0, 0.25, 2.25, V, 1.75, MAT.linoleum)
}

function litKiosk(kind) {
  const b = new WB(0, 0, 0, 2.5, 2.75, 2.0)
  const frame = MAT.metalGray
  kioskShell(b, frame)
  const glow = kind === 'flowers' || kind === 'shoes' ? MAT.kioskWarm : MAT.kioskCold
  // front: panel, glass band with mullions, sign band
  b.fill(0, 0, 0, 2.5, 0.75, V, kind === 'dvd' ? MAT.metalBlue : MAT.metalGray)
  b.fill(0.25, 0.75, 0, 2.25, 2.0, V, MAT.glass)
  for (const x of [0.25 + 0.75, 1.75]) b.fill(x - 0.0, 0.75, 0, x + V, 2.0, V, frame)
  b.fill(0, 2.0, 0, 2.5, 2.5, V, MAT.plasticWhite)
  // counter ledge with the little serving hatch frame
  b.fill(0.25, 0.75, -V, 2.25, 1.0, 0, MAT.metalGray)
  // glowing back wall (lit shelves) and a lit ceiling panel
  b.fill(0.25, 0.5, 1.5, 2.25, 2.25, 1.75, glow)
  b.fill(0.5, 2.25, 0.5, 2.0, 2.5, 1.5, glow)
  const r = (i, j, k, s) => h3(i, j, k, s)
  if (kind === 'flowers') {
    // tiered stand with buckets of roses, carnations and chrysanthemums
    for (let x = 0.25; x < 2.25; x += V) for (let z = 0.5; z < 1.5; z += V) {
      const i = b.ix(x), k = b.iz(z)
      const tier = z < 1.0 ? 0.25 : 0.5
      b.fill(x, V, z, x + V, tier, z + V, MAT.metalGray)
      const top = tier + (r(i, 1, k, 4) < 0.6 ? 0.5 : 0.75)
      b.fill(x, tier, z, x + V, top - V, z + V, MAT.needles)
      const c = r(i, 2, k, 9)
      b.fill(x, top - V, z, x + V, top, z + V, c < 0.45 ? MAT.fabricRed : c < 0.65 ? MAT.plasticWhite : c < 0.8 ? MAT.metalYellow : MAT.metalRed)
    }
  } else if (kind === 'phones') {
    // glass display shelves with boxed phones, cases, chargers, top-up cards
    for (const y of [0.75, 1.25, 1.75]) {
      b.fill(0.25, y - V, 0.25, 2.25, y, 0.75, MAT.chrome)
      for (let x = 0.5; x < 2.0; x += 0.5) {
        const c = r(b.ix(x), b.iy(y), 0, 5)
        b.fill(x, y, 0.25, x + V, y + V, 0.5, c < 0.4 ? MAT.plasticDark : c < 0.6 ? MAT.metalBlue : c < 0.8 ? MAT.plasticWhite : MAT.metalRed)
      }
    }
    b.fill(0.5, 1.0, 1.25, 2.0, 2.0, 1.5, MAT.metalBlue) // operator poster on the back
  } else if (kind === 'dvd') {
    // walls papered with DVD boxes
    const cols = [MAT.metalRed, MAT.metalBlue, MAT.plasticDark, MAT.metalYellow, MAT.plasticWhite, MAT.metalGreen, MAT.woodDark]
    for (let x = 0.25; x < 2.25; x += V) for (let y = 0.5; y < 2.25; y += V) {
      const c = cols[Math.floor(r(b.ix(x), b.iy(y), 3, 7) * cols.length)]
      if (r(b.ix(x), b.iy(y), 1, 2) < 0.8) b.fill(x, y, 1.25, x + V, y + V, 1.5, c)
    }
    for (let z = 0.5; z < 1.5; z += V) for (let y = 0.75; y < 2.0; y += V) {
      b.fill(0.25, y, z, 0.5, y + V, z + V, cols[Math.floor(r(1, b.iy(y), b.iz(z), 8) * cols.length)])
      b.fill(2.0, y, z, 2.25, y + V, z + V, cols[Math.floor(r(2, b.iy(y), b.iz(z), 8) * cols.length)])
    }
    b.fill(1.5, 0.75, 0.5, 2.0, 1.0, 1.0, MAT.plasticDark) // a little TV playing a trailer
    b.fill(1.5, 1.0, 0.5, 2.0, 1.25, 0.75, MAT.tv)
  } else if (kind === 'shoes') {
    b.fill(0.25, 0.25, 0.5, 2.25, 0.75, 1.0, MAT.wood) // workbench
    b.fill(1.5, 0.75, 0.5, 2.0, 1.0, 0.75, MAT.metalDark) // last / machine
    for (let x = 0.5; x < 2.0; x += V) for (let y = 1.25; y < 2.0; y += 0.25) if (r(b.ix(x), b.iy(y), 0, 3) < 0.5) b.set(x, y, 1.45, MAT.chrome) // key blanks
    b.fill(0.5, 0.25, 1.25, 1.0, 0.5, 1.5, MAT.woodDark) // shoes waiting
    b.fill(1.25, 0.25, 1.25, 1.5, 0.5, 1.5, MAT.leatherette)
  }
  return b.pivot(1.25, 0, 0)
}

function closedKiosk(kind) {
  const b = new WB(0, 0, 0, 2.5, 2.75, 2.0)
  const frame = kind === 'closed_rent' ? MAT.metalRust : MAT.metalGray
  kioskShell(b, frame)
  b.fill(0.25, V, 0.25, 2.25, 2.5, 1.75, MAT.concreteDark) // nobody gets to see inside
  // roller shutter: alternating slats, bottom rail, the shutter box
  for (let y = 0; y < 2.0; y += V) {
    const j = b.iy(y)
    b.fill(0.25, y, 0, 2.25, y + V, V, j % 2 ? MAT.metalGray : MAT.metalDark)
  }
  b.fill(0.25, 0, 0, 2.25, V, V, MAT.metalRust)
  b.fill(0, 2.0, 0, 2.5, 2.25, V, frame)
  b.fill(0, 2.25, 0, 2.5, 2.5, V, MAT.plasticWhite)
  // rust streaks and a padlock
  for (let x = 0.25; x < 2.25; x += V) if (h3(b.ix(x), 0, 0, kind.length) > 0.75) b.fill(x, 0, 0, x + V, 0.75, V, MAT.metalRust)
  b.fill(1.125, V, -V, 1.375, 0.5, 0, MAT.metalDark)
  return b.pivot(1.25, 0, 0)
}

for (const k of ['flowers', 'phones', 'dvd', 'shoes']) defineModel('metro_kiosk_' + k, () => litKiosk(k), { indoor: true, contact: false, lods: [1], maxDistance: 90 })
for (const k of ['closed_press', 'closed_rent', 'closed_tights', 'closed_optics', 'closed_photo']) defineModel('metro_kiosk_' + k, () => closedKiosk(k), { indoor: true, contact: false, lods: [1], maxDistance: 90 })

/** Ceiling fluorescent fixture (pivot: top centre). Length along local x. */
defineModel('metro_fixture', () => {
  const b = new WB(-0.75, -V, -0.25, 0.75, 0, 0.25)
  b.fill(-0.75, -V, -0.25, 0.75, 0, 0.25, MAT.plasticWhite)
  b.fill(-0.5, -V, -0.25, 0.5, 0, 0.25, MAT.fluorescent)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, collide: false, lods: [1], maxDistance: 110 })

/** Wall payphone under its hood (pivot: wall plane, floor level; front = local −z). */
defineModel('metro_payphone', () => {
  const b = new WB(-0.5, 0, -0.75, 0.5, 2.5, 0)
  b.fill(-0.25, 1.0, -0.25, 0.25, 1.75, 0, MAT.metalGray) // body
  b.fill(-0.25, 1.25, -0.5, 0.0, 1.5, -0.25, MAT.chrome) // keypad block
  b.fill(0.0, 1.5, -0.5, 0.25, 1.75, -0.25, MAT.plasticDark) // display / card slot
  b.fill(-0.5, 1.0, -0.5, -0.25, 1.75, -0.25, MAT.metalDark) // handset on its hook
  b.fill(-0.5, 1.75, -0.75, 0.5, 2.0, 0, MAT.metalBlue) // hood roof
  b.fill(-0.5, 1.25, -0.75, -0.375, 1.75, 0, MAT.metalBlue)
  b.fill(0.375, 1.25, -0.75, 0.5, 1.75, 0, MAT.metalBlue)
  b.fill(-0.375, 2.0, -0.125, 0.375, 2.25, 0, MAT.plasticWhite) // «ТАКСОФОН» plate
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 70 })

/** Enamel bucket under the leak (fine voxels, 1/8 m). */
defineModel('metro_bucket', () => {
  const b = new WB(0, 0, 0, 5, 4, 5) // fine units
  b.fill(1, 0, 1, 4, 4, 4, MAT.metalBlue)
  b.fill(2, 1, 2, 3, 4, 3, MAT.air)
  b.fill(2, 2, 2, 3, 3, 3, MAT.wet)
  b.fill(0, 3, 2, 1, 4, 3, MAT.metalGray) // handle ends
  b.fill(4, 3, 2, 5, 4, 3, MAT.metalGray)
  b.m.setPivot(2.5, 0, 2.5)
  return fineModel(b.m)
}, { indoor: true, contact: false, collide: false, lods: [0.5], lodDistances: [], maxDistance: 50 })

// ---------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------

const KIOSK_SIGNS = {
  flowers: { lines: ['ЦВЕТЫ'], bg: '#2f6a3a', color: '#f4f0e0', emissive: 0.9, note: T.flowers },
  phones: { lines: ['САЛОН СВЯЗИ • АКСЕССУАРЫ'], bg: '#e6e2d6', color: '#1d3f8a', emissive: 0.9, note: T.phones },
  dvd: { lines: ['CD • DVD • MP3'], bg: '#151515', color: '#f2c230', emissive: 0.9, note: T.dvd },
  shoes: { lines: ['РЕМОНТ ОБУВИ • КЛЮЧИ'], bg: '#e9e4d2', color: '#7a2a1e', emissive: 0.8, note: T.shoes },
  closed_press: { lines: ['МОС-ПРЕССА'], bg: '#e8e8e2', color: '#1f4e9c', emissive: 0, aged: 0.5 },
  closed_rent: { lines: ['ВЫПЕЧКА • КОФЕ'], bg: '#7b5a3a', color: '#efe3c6', emissive: 0, aged: 0.7 },
  closed_tights: { lines: ['ЧУЛКИ • КОЛГОТКИ'], bg: '#d9c9d6', color: '#5a2a4a', emissive: 0, aged: 0.45 },
  closed_optics: { lines: ['ОПТИКА • ЧАСЫ'], bg: '#e0e4e8', color: '#123a5a', emissive: 0, aged: 0.5 },
  closed_photo: { lines: ['ФОТО НА ДОКУМЕНТЫ'], bg: '#f0e6c8', color: '#8a1f18', emissive: 0, aged: 0.6 },
}

/** Corridor fluorescent fixtures: [x, z, rot, state] — state 'ok' | 'dying' | 'dead' | 'dim'. */
export const FIXTURES = [
  [385, 525.75, 1, 'ok'], [385, 529.25, 1, 'dim'], [385, 532.75, 1, 'ok'], [385, 536.25, 1, 'ok'],
  [385, 539.75, 1, 'ok'], [385, 543.25, 1, 'dying'], [385, 546.75, 1, 'ok'], [385, 550.25, 1, 'dead'],
  [385, 553.75, 1, 'ok'],
  [380.25, 521.75, 0, 'ok'], [389.75, 521.75, 0, 'ok'], [380.25, 558.25, 0, 'ok'], [389.75, 558.25, 0, 'dim'],
]

export function buildUnderpass(ctx, out) {
  const { world, lights, signs, zones, interactions } = ctx
  const ud = { pkg: 'metro', noRelocate: true }
  out.underground.push(world.place('metro_underpass', { x: UNDERPASS.x0, y: Y.SLAB, z: UNDERPASS.z0, rot: 0, tag: 'metro_underpass', userData: ud }))

  // ---- kiosks
  for (const [side, z0, kind] of KIOSKS) {
    const zc = z0 + KW / 2
    const fx = side === 'W' ? BAY.w1 : BAY.e0
    const p = world.place('metro_kiosk_' + kind, { x: fx, y: F0, z: zc, rot: side === 'W' ? 3 : 1, tag: 'kiosk', userData: { ...ud, kind } })
    out.underground.push(p)
    const ang = side === 'W' ? Math.PI / 2 : -Math.PI / 2
    const nx = side === 'W' ? 1 : -1
    const S = KIOSK_SIGNS[kind]
    signs.add({ x: fx + nx * 0.01, y: F0 + 2.25, z: zc, angle: ang, w: 2.4, h: 0.48, ppm: 64, lines: S.lines, bg: S.bg, color: S.color,
      font: SIGN_FONT, emissive: S.emissive, indoor: true, aged: S.aged ?? 0.2, seed: Math.round(z0 * 10) })
    if (!kind.startsWith('closed')) {
      const warm = kind === 'flowers' || kind === 'shoes'
      out.lightGroups.underpass.push(lights.add({ x: fx - nx * 1.0, y: F0 + 2.1, z: zc, color: warm ? 0xffc68a : 0xdfeeff, intensity: 0.9, range: 4.5, domain: 'indoor', halo: false, tag: 'metro_kiosk' }))
      // hand-written price card in the window and the readable price list
      const card = kind === 'flowers' ? ['Роза — 70 р.', 'Гвоздика — 35 р.'] : kind === 'dvd' ? ['10 фильмов', 'на 1 диске — 100 р.'] : kind === 'phones' ? ['Чехлы от 150 р.', 'Зарядки 250 р.'] : ['Ключи — 80 р.', 'Набойки — 150 р.']
      signs.add({ x: fx + nx * 0.02, y: F0 + 1.15, z: zc - 0.55, angle: ang, w: 0.5, h: 0.32, ppm: 96, draw: (c, W, H) => drawCard(c, W, H, { lines: card }), indoor: true, seed: z0 })
      interactions.add({ x: fx + nx * 0.2, y: F0 + 1.3, z: zc, size: [0.6, 1.2, KW - 0.4], prompt: { ru: 'Посмотреть', en: 'Look' }, tag: 'metro_kiosk',
        onUse(game) {
          game.ui.showNote({ ru: S.note.ru, en: S.note.en, style: 'hand' })
          if (game.audio?.ready && game.audio.has?.('kiosk_voice')) game.audio.play('kiosk_voice', { pos: [fx - nx * 0.8, F0 + 1.5, zc], phrase: 0 })
        } })
      out.kiosks.push({ kind, x: fx - nx * 0.9, z: zc, y: F0 + 1.4 })
    } else {
      const card = kind === 'closed_rent' ? T.closedRent : T.closed
      signs.add({ x: fx + nx * 0.27, y: F0 + 1.3, z: zc + 0.3, angle: ang, w: 0.6, h: 0.4, ppm: 80, draw: (c, W, H) => drawCard(c, W, H, { lines: card.ru.split('\n'), color: '#202020' }), indoor: true, aged: 0.4, seed: z0 + 3 })
    }
  }

  // ---- fluorescent tubes
  for (const [x, z, rot, state] of FIXTURES) {
    const p = world.place('metro_fixture', { x, y: C0, z, rot, flag: state === 'dead' ? 0 : state === 'dim' ? 0.55 : 1, tag: 'metro_tube', userData: ud })
    out.underground.push(p)
    out.tubes.push({ x, y: C0 - 0.2, z, state })
    if (state === 'dead') continue
    const L = lights.add({ x, y: C0 - 0.35, z, color: 0xe4f2e6, intensity: state === 'dim' ? 1.0 : 1.7, range: 7.5, domain: 'indoor', halo: false,
      flicker: state === 'dying' ? 'dying' : 'none', placement: state === 'dying' ? p : null, tag: 'metro_tube' })
    out.lightGroups.underpass.push(L)
  }

  // ---- payphone on the west wall
  out.underground.push(world.place('metro_payphone', { x: CORRIDOR.x0, y: F0, z: 538.75, rot: 3, tag: 'payphone', userData: ud }))
  signs.add({ x: CORRIDOR.x0 + 0.01, y: F0 + 2.125, z: 538.75, angle: Math.PI / 2, w: 0.7, h: 0.22, ppm: 80, lines: ['ТАКСОФОН'], bg: '#e2e0d8', color: '#1d3f8a', indoor: true, aged: 0.3, seed: 2 })
  signs.add({ x: CORRIDOR.x0 + 0.26, y: F0 + 1.62, z: 538.62, angle: Math.PI / 2, w: 0.2, h: 0.2, ppm: 120, lines: ['01', '02', '03'], bg: '#c9c4b4', color: '#8a1f18', indoor: true })
  interactions.add({ x: CORRIDOR.x0 + 0.35, y: F0 + 1.4, z: 538.75, size: [0.5, 0.9, 0.7], prompt: { ru: 'Снять трубку', en: 'Pick up the receiver' }, tag: 'payphone',
    onUse(game) {
      const a = game.audio
      if (a?.ready && a.has?.('payphone_dial')) {
        const em = a.play('payphone_dial', { gain: 0.5, bus: 'ui' })
        setTimeout(() => { try { em?.stop(0.1) } catch { /* ignore */ } }, 4200)
      }
      game.ui.say({ ru: 'В трубке — ровный гудок. Карты нет.', en: 'A steady dial tone. You have no phone card.' }, 4)
    } })
  out.payphones.push({ x: CORRIDOR.x0 + 0.3, z: 538.75, y: F0 })

  // ---- the leak and its bucket
  out.underground.push(world.place('metro_bucket', { x: 386.3, y: F0, z: 551.3, angle: 0.4, tag: 'metro_prop', dynamic: false, collide: false }))
  out.drips.push([386.2, C0 - 0.05, 551.2])

  // ---- posters, notices, the odd graffiti tag
  const W0 = CORRIDOR.x0 + 0.01, E0 = CORRIDOR.x1 - 0.01
  const wallW = Math.PI / 2, wallE = -Math.PI / 2
  const read = (x, y, z, size, note, style = 'paper') => interactions.add({ x, y, z, size, prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ...note, style }) } })
  const posters = [
    // [x, z, angle, w, h, draw, note, style]
    [W0, 534.6, wallW, 0.8, 1.15, (c, W, H) => drawPoster(c, W, H, { band: '#c8261c', title: 'ЕВРОСВЯЗЬ', lines: ['Телефоны', 'от 990 р.!', 'Цены просто', 'поразительные'], foot: 'салон — у выхода к проспекту', seed: 1 }), T.eurosvyaz, 'notice'],
    [W0, 543.6, wallW, 0.8, 1.15, (c, W, H) => drawPoster(c, W, H, { band: '#e2b51c', titleColor: '#1b1b1b', title: 'ПЧЕЛАЛАЙН', lines: ['Говори', 'без границ!', 'Тариф «Ночной»'], foot: '0 коп./мин с 00:00 до 08:00', seed: 2 }), T.beeline, 'notice'],
    [E0, 534.2, wallE, 0.6, 0.85, (c, W, H) => drawNotice(c, W, H, { title: 'ВНИМАНИЕ!', lines: ['С 1 ЯНВАРЯ 2008 Г.', 'ИЗМЕНЯЕТСЯ', 'СТОИМОСТЬ ПРОЕЗДА', '1 поездка — 19 р.'] }), T.fareNotice, 'notice'],
    [E0, 544.4, wallE, 0.62, 0.85, (c, W, H) => drawPoster(c, W, H, { band: '#2b5aa0', title: 'КРЕДИТ', lines: ['за 15 минут!', 'Без справок', 'и поручителей'], foot: '☎ 8 (495) 7…', seed: 3 }), T.credit, 'notice'],
    [W0, 551.8, wallW, 0.7, 0.9, (c, W, H) => drawPoster(c, W, H, { band: '#3d6a8a', title: 'ОКНА ПВХ', lines: ['Замер —', 'бесплатно!', 'Скидка 10%'], foot: 'Тёплый дом — к зиме!', seed: 4 }), T.windows, 'notice'],
  ]
  for (const [x, z, a, w, h, draw, note, style] of posters) {
    signs.add({ x, y: F0 + 1.55, z, angle: a, w, h, ppm: 72, draw, indoor: true, aged: 0.45, seed: Math.round(z) })
    read(x + Math.sin(a) * 0.15, F0 + 1.55, z, [0.35, h, w], note, style)
  }
  // tear-off adverts taped next to the payphone and by the south stairs
  const tears = [[W0, 540.15, wallW, T.room, false, [1, 4]], [W0, 540.75, wallW, T.work, false, [0, 2, 3]], [E0, 552.6, wallE, T.dog, true, []]]
  for (const [x, z, a, note, hand, torn] of tears) {
    signs.add({ x, y: F0 + 1.45, z, angle: a, w: 0.42, h: 0.55, ppm: 110, draw: (c, W, H) => drawTearOff(c, W, H, { lines: note.ru.split('\n').slice(0, 3), phone: note.phone, torn, hand }), indoor: true, aged: 0.35, seed: Math.round(z * 3) })
    read(x + Math.sin(a) * 0.12, F0 + 1.45, z, [0.3, 0.55, 0.42], note, hand ? 'hand' : 'paper')
  }
  signs.add({ x: E0, y: F0 + 1.7, z: 531.0, angle: wallE, w: 0.9, h: 0.5, ppm: 72, draw: (c, W, H) => drawNotice(c, W, H, { title: 'ТОРГОВЛЯ', lines: ['В ПЕРЕХОДЕ БЕЗ РАЗРЕШЕНИЯ', 'ЗАПРЕЩЕНА'] }), indoor: true, aged: 0.3, seed: 9 })
  read(E0 - 0.12, F0 + 1.7, 531.0, [0.3, 0.5, 0.9], T.noTrade, 'notice')
  signs.add({ x: W0, y: F0 + 2.25, z: 545.2, angle: wallW, w: 0.5, h: 0.32, ppm: 80, draw: (c, W, H) => {
    c.fillStyle = '#e8e6de'; c.fillRect(0, 0, W, H)
    c.strokeStyle = '#b8221a'; c.lineWidth = H * 0.08; c.beginPath(); c.arc(W * 0.22, H / 2, H * 0.36, 0, Math.PI * 2); c.stroke()
    c.beginPath(); c.moveTo(W * 0.22 - H * 0.25, H / 2 - H * 0.25); c.lineTo(W * 0.22 + H * 0.25, H / 2 + H * 0.25); c.stroke()
    c.save(); c.translate(W * 0.42, 0); drawText(c, W * 0.56, H, { lines: ['КУРИТЬ', 'ЗАПРЕЩЕНО'], color: '#1a1a1a', font: SIGN_FONT, pad: 2 }); c.restore()
  }, indoor: true, aged: 0.25 })
  // marker tags on the tiles
  for (const [x, z, a, txt, col] of [[E0, 553.6, wallE, 'ЦОЙ ЖИВ', '#2b2b2b'], [W0, 553.2, wallW, 'KISH', '#3a3a8a'], [E0, 535.6, wallE, 'Лёха+Таня', '#5a2020']]) {
    signs.add({ x, y: F0 + 1.05, z, angle: a, w: 0.9, h: 0.35, ppm: 64, draw: (c, W, H) => { c.clearRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.rotate(-0.08); c.fillStyle = col; c.font = `bold ${H * 0.62}px ${HAND_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 0); c.restore() }, indoor: true })
  }
  // signs at the stair feet pointing to the exits
  for (const [x, z, a, lines] of [[385, HALL_N.z0 + 0.01, 0, ['← ВЫХОД К ДОМАМ →', 'микрорайон «Восточный»']], [385, HALL_S.z1 - 0.01, Math.PI, ['← ВЫХОД К АВТОБУСАМ →', 'остановка «Метро Заречная»']]]) {
    signs.add({ x, y: F0 + 2.3, z, angle: a, w: 3.2, h: 0.5, ppm: 64, lines, bg: '#e6e4dc', color: '#1b1b1b', font: SIGN_FONT, indoor: true, aged: 0.3, seed: 4 })
  }

  // ---- zones
  zones.add({ name: 'underpass', type: 'underpass', min: [UNDERPASS.x0, Y.SLAB, UNDERPASS.z0], max: [390, Y.CEIL + 0.1, UNDERPASS.z1],
    indoor: true, reverb: 'underpass', snow: false, wind: 0.2, traffic: 0.35, exposure: 0.85, data: { pkg: 'metro' } })
  zones.add({ name: 'underpass', type: 'underpass', min: [390, Y.SLAB, UNDERPASS.z0], max: [UNDERPASS.x1, Y.CEIL + 0.1, 530.5],
    indoor: true, reverb: 'underpass', snow: false, wind: 0.2, traffic: 0.35, exposure: 0.85, data: { pkg: 'metro' } })
  zones.add({ name: 'underpass', type: 'underpass', min: [390, Y.SLAB, 549.5], max: [UNDERPASS.x1, Y.CEIL + 0.1, UNDERPASS.z1],
    indoor: true, reverb: 'underpass', snow: false, wind: 0.2, traffic: 0.35, exposure: 0.85, data: { pkg: 'metro' } })

  // ---- walkers' routes (documented; the life package ignores kind 'underpass')
  ctx.navPaths.push({ points: [[379, 509], [379, 519.5], [385, 522], [385, 558], [391, 560.5], [391, 571]], kind: 'underpass', y: F0 })
}
