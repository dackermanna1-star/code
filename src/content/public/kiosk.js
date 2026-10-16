// Small street kiosks (ларьки): tobacco, newspapers, flowers, shawarma, groceries, and a closed
// one behind a roller shutter. A 3.0 × 2.5 m painted sheet-steel box on a low base, glazed
// front with a serving hatch, goods packed against the glass, a fluorescent tube, and a
// vendor in a fur hat sitting inside. The body colour is the placement tint.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, frameFor, put, sign, readable, interact, light, navPath, reg, seed01, seedInt,
  pasteFigure, lightBox, handText, drawText, SIGN_FONT, PLAIN_FONT,
} from './lib.js'
import { addEmitter, RT } from './runtime.js'

const X = 12, Y = 16, Z = 11 // Y leaves room for roof snow (+ a small drift)
const lx = vx => (vx - X / 2) * V
const lz = vz => (vz - Z / 2) * V

const TYPES = ['tabak', 'pechat', 'flowers', 'shawarma', 'produkty', 'closed']

function goods(m, rng, x0, x1, y0, y1, z, pal, gap = 0.1) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (!rng.chance(gap)) m.set(x, y, z, M(rng.pick(pal)))
}

function buildKiosk(type) {
  const m = new VoxelModel(X, Y, Z)
  const rng = new RNG(900 + TYPES.indexOf(type) * 17)
  const body = M('paint')
  const frame = M('metal_dark')
  // base and floor
  m.fill(0, 0, 1, X, 1, Z - 1, M('metal_dark'))
  m.fill(1, 0, 2, X - 2, 1, Z - 3, M('linoleum'))
  // walls
  m.fill(0, 1, 1, 1, 10, Z - 1, body)
  m.fill(X - 1, 1, 1, 1, 10, Z - 1, body)
  m.fill(0, 1, Z - 1, X, 10, 1, body)
  // front: lower panel, glass band, frame posts
  m.fill(0, 1, 1, X, 3, 1, body)
  m.fill(1, 4, 1, X - 2, 6, 1, M('pub_glass_warm'))
  for (const x of [0, 4, 7, X - 1]) m.fill(x, 4, 1, 1, 6, 1, frame)
  m.fill(0, 10, 1, X, 1, 1, frame)
  m.fill(0, 3, 1, X, 1, 1, frame)
  // serving hatch (окошко) with a coin ledge outside
  m.clear(5, 4, 1, 2, 2, 1)
  m.fill(5, 4, 1, 2, 1, 1, M('metal_gray'))
  m.fill(4, 3, 0, 4, 1, 1, M('metal_gray'))
  // ceiling, sign band (front box), roof with eaves
  m.fill(0, 10, 1, X, 1, Z - 1, M('plastic_white'))
  m.fill(0, 11, 0, X, 2, 2, M('plastic_white'))
  m.fill(0, 11, 0, X, 1, 1, frame)
  m.fill(0, 13, 0, X, 1, Z, M('metal_gray'))
  m.fill(0, 11, 2, X, 2, Z - 2, body)
  // side window on the right flank (most kiosks have one)
  m.fill(X - 1, 5, 3, 1, 4, 3, M('pub_glass_warm'))
  // fluorescent tube on the ceiling
  m.fill(2, 9, 5, 8, 1, 1, M('plastic_white'))
  m.fill(3, 9, 5, 6, 1, 1, M('fluorescent'))
  // inside: back shelves full of goods, display shelf behind the glass
  const pal = {
    tabak: ['plastic_white', 'metal_red', 'metal_blue', 'chrome', 'metal_yellow', 'plastic_dark', 'plastic_white'],
    pechat: ['paper', 'paper', 'plastic_white', 'metal_blue', 'metal_red', 'metal_yellow'],
    produkty: ['metal_brown', 'needles', 'chrome', 'metal_red', 'metal_yellow', 'pub_glass_goods', 'metal_blue'],
    shawarma: ['pub_bread', 'plastic_white', 'chrome'],
    flowers: ['needles'],
    closed: ['pub_cardboard'],
  }[type]
  for (const y of [2, 4, 6]) m.fill(1, y, 8, X - 2, 1, 2, M('wood'))
  for (const y of [3, 5, 7]) goods(m, rng, 1, X - 2, y, y, 9, pal, 0.15)
  for (const y of [3, 5, 7]) goods(m, rng, 1, X - 2, y, y, 8, pal, 0.35)
  if (type !== 'flowers' && type !== 'shawarma' && type !== 'closed') {
    // goods packed behind the glass on stepped shelves, many pressed right into the window
    m.fill(1, 3, 2, X - 2, 1, 2, M('wood'))
    goods(m, rng, 1, 4, 4, 8, 2, pal, 0.25)
    goods(m, rng, 7, X - 2, 4, 8, 2, pal, 0.25)
    for (let y = 4; y <= 8; y++) for (let x = 1; x <= X - 2; x++) {
      if (m.get(x, y, 1) !== M('pub_glass_warm')) continue
      if (rng.chance(y <= 6 ? 0.55 : 0.35)) m.set(x, y, 1, M(rng.pick(pal)))
    }
  }
  // vendor (seated, fur hat, dark coat) behind the hatch, and a small heater
  if (type !== 'closed') {
    m.fill(4, 1, 6, 4, 2, 2, M('wood_dark')) // stool
    pasteFigure(m, 4, 1, 4, 0, { pose: 'sit', top: M(type === 'shawarma' ? 'plastic_white' : 'leatherette'), bottom: M('metal_dark'), hat: M(type === 'shawarma' ? 'plastic_white' : 'bark'), armsFront: true })
    m.set(9, 1, 6, M('metal_red')); m.set(9, 2, 6, M('taillight'))
  }
  if (type === 'flowers') {
    // glazed flanks, warm lamp, buckets of roses, carnations and chrysanthemums
    m.fill(0, 4, 2, 1, 6, 6, M('glass_clear'))
    m.fill(X - 1, 4, 2, 1, 6, 6, M('glass_clear'))
    m.fill(1, 3, 2, X - 2, 1, 1, M('glass_clear')) // fogged low pane
    m.set(5, 9, 4, M('lamp_warm')); m.set(6, 9, 4, M('lamp_warm'))
    for (let i = 0; i < 6; i++) {
      const bx = 1 + i * 1.7 | 0, bz = 2 + (i % 2)
      m.set(bx, 1, bz, M('metal_gray')); m.set(bx, 2, bz, M('metal_gray'))
      const head = M(rng.pick(['fabric_red', 'fabric_red', 'plastic_white', 'metal_yellow', 'plaster_pink']))
      m.set(bx, 3, bz, M('needles'))
      m.set(bx, 4, bz, head)
      if (rng.chance(0.6)) m.set(bx, 5, bz, head)
    }
    m.clear(8, 9, 5, 2, 1, 1)
  }
  if (type === 'shawarma') {
    // vertical spit with a glowing grill behind the right pane, prep counter
    m.set(9, 3, 3, M('chrome'))
    m.fill(9, 4, 3, 1, 4, 1, M('pub_sausage'))
    m.set(8, 4, 3, M('pub_sausage')); m.set(8, 5, 3, M('pub_sausage')); m.set(8, 6, 3, M('pub_bread'))
    m.set(9, 8, 3, M('chrome'))
    m.fill(10, 4, 3, 1, 4, 1, M('taillight'))
    m.fill(1, 3, 2, 4, 1, 2, M('chrome'))
    m.set(2, 4, 2, M('pub_bread')); m.set(3, 4, 2, M('plastic_white'))
    // stovepipe / vent through the roof
    m.set(9, 14, 8, M('metal_dark')); m.set(9, 15, 8, M('metal_dark'))
  }
  if (type === 'pechat') {
    // white body band in blue at the top (fixed colours over the tint)
    m.fill(0, 11, 0, X, 2, 1, M('metal_blue'))
    // magazines clipped on wires behind the glass (paper layer)
    for (let y = 4; y <= 8; y += 2) for (let x = 1; x <= X - 2; x++) if (x < 5 || x > 6) m.set(x, y, 2, M(rng.pick(['paper', 'plastic_white', 'metal_red', 'metal_blue', 'metal_yellow', 'paper'])))
  }
  if (type === 'closed') {
    // roller shutter down over the glazing and the hatch, padlocked
    for (let y = 3; y <= 10; y++) m.fill(0, y, 0, X, 1, 1, M(y % 2 ? 'metal_gray' : 'concrete_light'))
    m.fill(0, 10, 0, X, 1, 1, M('metal_dark'))
    m.set(6, 3, 0, M('chrome'))
    // dark inside: the tube is dead, the glass behind the shutter is plain dark glass
    m.replace(M('fluorescent'), M('plastic_white'))
    m.replace(M('pub_glass_warm'), M('pub_glass_dark'))
  }
  // weathering: rust eating the bottom of the sheet panels (salt slush), streaks from the roof
  // corners, a riveted patch sheet on the left flank
  const rust = M('metal_rust')
  const rustAt = (x, y, z, p) => { if (m.get(x, y, z) === body && rng.chance(p)) m.set(x, y, z, rust) }
  for (let x = 0; x < X; x++) { rustAt(x, 1, 1, 0.3); rustAt(x, 2, 1, 0.08); rustAt(x, 1, Z - 1, 0.5); rustAt(x, 2, Z - 1, 0.15) }
  for (let z = 1; z < Z; z++) { rustAt(0, 1, z, 0.5); rustAt(X - 1, 1, z, 0.5); rustAt(0, 2, z, 0.15); rustAt(X - 1, 2, z, 0.15) }
  for (const [x, z] of [[0, 1], [X - 1, 1], [0, Z - 1], [X - 1, Z - 1]]) {
    const n = rng.int(1, 5)
    for (let y = 10; y > 10 - n; y--) rustAt(x, y, z, 0.8)
  }
  for (let y = 5; y <= 7; y++) for (let z = Z - 4; z <= Z - 3; z++) if (m.get(0, y, z) === body) m.set(0, y, z, M('metal_gray'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 3 })
  // a soft drift on the roof, deeper toward the back
  for (let z = 2; z < Z; z++) for (let x = 1; x < X - 1; x++)
    if (m.get(x, 14, z) === M('snow') && m.get(x, 15, z) === 0 && ((x * 5 + z * 3) % 7 < 3 || z > Z - 4)) m.set(x, 15, z, M('snow'))
  return m
}

for (const t of TYPES) defineModel('pub_kiosk_' + t, () => buildKiosk(t), { occludesSnow: true, lods: [1, 2], lodDistances: [50] })

const SIGNS = {
  tabak: { lines: ['ТАБАК'], bg: '#1d2f55', color: '#f0e9d6', sub: 'СИГАРЕТЫ • ЗАЖИГАЛКИ • ПИВО • ВОДЫ' },
  pechat: { lines: ['ПЕЧАТЬ'], bg: '#2a4f99', color: '#f2f2f2', sub: '«МОС-ПРЕССА» • ГАЗЕТЫ • ЖУРНАЛЫ' },
  flowers: { lines: ['ЦВЕТЫ 24'], bg: '#efe9dc', color: '#2f6a3a', sub: 'КРУГЛОСУТОЧНО' },
  shawarma: { lines: ['ШАУРМА'], bg: '#e8c040', color: '#8a1a10', sub: 'ХОТ-ДОГ • ЧЕБУРЕКИ • ЧАЙ • КОФЕ' },
  produkty: { lines: ['ПРОДУКТЫ 24 ЧАСА'], bg: '#efeee6', color: '#b11e1e', sub: 'ПИВО • ВОДЫ • СОКИ' },
  closed: { lines: ['ПЕЧАТЬ'], bg: '#5a6a80', color: '#cfd2d6', sub: '' },
}
const TRANSL = {
  tabak: 'TOBACCO — cigarettes, lighters, beer, soft drinks',
  pechat: 'PRESS — "Mos-Pressa": newspapers, magazines',
  flowers: 'FLOWERS 24 — open round the clock',
  shawarma: 'SHAWARMA — hot dogs, chebureki, tea, coffee',
  produkty: 'GROCERIES 24 HOURS — beer, water, juice',
  closed: 'PRESS (closed)',
}
const VENDOR = {
  tabak: [{ ru: 'Каких вам?', en: 'Which ones?' }, { ru: 'Мелочи не будет?', en: 'Got any small change?' }],
  pechat: [{ ru: '«Теленеделя» новая пришла.', en: 'The new "TV Week" is in.' }, { ru: 'Сканворды вон там, сбоку.', en: 'The crosswords are there, on the side.' }],
  flowers: [{ ru: 'Розы свежие, сегодня привезли.', en: 'The roses are fresh, came in today.' }, { ru: 'Вам завернуть?', en: 'Shall I wrap them?' }],
  shawarma: [{ ru: 'Шаурма с собой? Пять минут.', en: 'Shawarma to go? Five minutes.' }, { ru: 'Острый соус кладём?', en: 'Hot sauce?' }],
  produkty: [{ ru: 'Что вам?', en: 'What would you like?' }, { ru: 'Пиво холодное кончилось.', en: 'We\'re out of cold beer.' }],
}

/**
 * Place a kiosk. Footprint 3.0 × 2.5 m centred on (x, z), glazed front + hatch on local −Z.
 * opts: { x, z, rot | angle, y, type: 'tabak'|'pechat'|'flowers'|'shawarma'|'produkty'|'closed', seed, tint,
 *         sign (override sign text for 'closed'), drifts=true (terrain snow mounds at the back and flanks) }
 * Returns { placement, light, frame }.
 */
export function placeKiosk(ctx, o) {
  const type = TYPES.includes(o.type) ? o.type : 'tabak'
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 77))
  const tints = {
    tabak: [0x3e4d5c, 0x4a5a52, 0x5a4a44], pechat: [0xc4c6c0, 0xb8bcb8], flowers: [0x4a6450, 0x5a6e60],
    shawarma: [0xc0a060, 0xb8b0a0], produkty: [0x8a9aaa, 0x9aa49a, 0x7e8a96], closed: [0x6a7078, 0x7a6e60, 0x5e6a5e],
  }[type]
  const tint = o.tint ?? tints[rng.int(0, tints.length - 1)]
  const p = put(ctx, F, 'pub_kiosk_' + type, 0, 0, { tint, seed: seed01(o.seed, 5), tag: 'kiosk', userData: { kind: 'kiosk', type } })
  // snow drifted against the back and the flanks (the front is trodden by customers)
  if (o.drifts !== false) {
    for (const [ax, az, rx, rz, h] of [[0, lz(Z) + 0.75, 1.5, 0.55, 0.4], [lx(0) - 0.6, 0.2, 0.45, 1.0, 0.25], [lx(X) + 0.6, 0.2, 0.45, 1.0, 0.25]]) {
      const [wx, , wz] = F.p(ax, 0, az), s = F.size(rx, 0, rz)
      ctx.terrain.mound(wx, wz, s[0], s[2], h * rng.float(0.6, 1.1), M('snow_fresh'), 0.5, rng.int(0, 1e6))
    }
  }
  const S = SIGNS[type]
  const lit = type !== 'closed'
  const text = o.sign ? [o.sign] : S.lines
  sign(ctx, F, 0, 12 * V, lz(0), 0, -1, {
    w: 2.9, h: 0.46, ppm: 80, emissive: lit ? 1.1 : 0, aged: lit ? 0.15 : 0.6, seed: rng.int(1, 999),
    draw: lightBox({ lines: text, bg: S.bg, color: S.color, vignette: lit ? 0.25 : 0.5, dead: lit && rng.chance(0.3) ? [0.7, 0.95] : null }),
  })
  readable(ctx, F, 0, 2.95, lz(0) - 0.2, [2.9, 0.5, 0.4], { ru: text.join(' ') + (S.sub ? '\n' + S.sub : ''), en: TRANSL[type], style: 'sign' })
  let L = null
  if (lit) {
    const warm = type === 'flowers' || type === 'shawarma'
    // the lamp under the sign box lights the window display, the hatch and the snow in front
    L = light(ctx, F, 0, 2.55, lz(-0.4), { color: warm ? 0xffd29a : 0xeef0dc, intensity: warm ? 2.6 : 2.3, range: 7, haloSize: 0.45, tag: 'kiosk_light' })
    // LED ticker / promo strip behind the glass
    if (type === 'tabak' || type === 'produkty') {
      sign(ctx, F, 0, 9.5 * V, lz(2) - 0.01, 0, -1, {
        w: 2.4, h: 0.13, ppm: 160, emissive: 1.6,
        draw: (c, W, H) => { c.fillStyle = '#100604'; c.fillRect(0, 0, W, H); drawText(c, W, H, { lines: [S.sub], color: '#ff3a1a', font: PLAIN_FONT, weight: 'bold', pad: 1 }) },
      })
    }
    // hand-written price cards inside the glass
    const cards = {
      tabak: ['Ява — 28 р.', 'LD — 32 р.', 'Парламент — 65'],
      produkty: ['Пиво 0,5 — 35 р.', 'Чипсы — 22', 'Сок 1 л — 45'],
      pechat: ['Теленеделя — 18 р.', 'Сканворды — 15'],
      flowers: ['Роза — 70 р.', 'Гвоздика — 35 р.'],
      shawarma: ['Шаурма в лаваше — 80 р.', 'Шаурма в пите — 70 р.', 'Хот-дог — 35 р.', 'Чебурек — 25 р.', 'Чай, кофе — 20 р.'],
    }[type]
    if (type === 'shawarma') {
      // menu board on the left of the glazing, outside
      sign(ctx, F, lx(2), 1.75, lz(1), 0, -1, { w: 0.85, h: 0.95, ppm: 110, aged: 0.3, seed: 12, draw: (c, W, H) => handText(c, W, H, { lines: ['МЕНЮ', ...cards], bg: '#efe8cf', color: ['#9a1c10', '#1d2a6a'], seed: 12 }) })
      readable(ctx, F, lx(2), 1.75, lz(1) - 0.15, [0.9, 1.0, 0.3], {
        title: 'МЕНЮ', ru: cards.join('\n'), en: 'Shawarma in lavash — 80 rub.\nShawarma in pita — 70 rub.\nHot dog — 35 rub.\nChebureki pastry — 25 rub.\nTea, coffee — 20 rub.', style: 'hand',
      })
    } else {
      cards.forEach((t, i) => {
        sign(ctx, F, lx(i < 2 ? 2 + i * 1.3 : 9), 1.15 + (i % 2) * 0.12, lz(2) - 0.01, 0, -1, { w: 0.3, h: 0.14, ppm: 200, draw: (c, W, H) => handText(c, W, H, { lines: [t], bg: i % 2 ? '#f0e050' : '#f2efe2', color: '#1a1a50', seed: i + 3 }) })
      })
    }
    // knock on the hatch: a few words from the vendor
    let k = rng.int(0, 5)
    interact(ctx, F, 0, 1.15, lz(0.5), [0.8, 0.6, 0.5], {
      tag: 'kiosk', reach: 2.2,
      prompt: { ru: 'Постучать в окошко', en: 'Knock on the hatch' },
      onUse(game) {
        const l = VENDOR[type][k++ % VENDOR[type].length]
        game.audio?.play?.('door_wood', { pos: F.p(0, 1.2, lz(1)), gain: 0.18 })
        game.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 3.5)
        game.audio?.play?.('kiosk_voice', { pos: F.p(0, 1.3, lz(4)), gain: 0.5 })
      },
    })
    addEmitter({ name: type === 'shawarma' ? 'ventilation' : 'radio_distant', pos: F.p(0, 1.6, lz(5)), gain: type === 'shawarma' ? 0.15 : 0.1, radius: 14, refDistance: 1, cutoff: 2500 })
    if (type === 'shawarma') {
      const [sx, sy, sz] = F.p(lx(9.5), 16 * V, lz(8.5))
      RT.pendingSteam.push({ x: sx, y: sy, z: sz, kind: 'vent', rate: 2.5, size: 0.4, tag: 'shawarma_vent' })
    }
  } else {
    // closed: a sheet of paper taped to the shutter
    sign(ctx, F, lx(3.5), 1.6, lz(0), 0, -1, { w: 0.42, h: 0.3, ppm: 140, aged: 0.7, seed: rng.int(1, 99), draw: (c, W, H) => handText(c, W, H, { lines: ['СДАЁТСЯ', 'В АРЕНДУ', '8-916-...-..-..'], bg: '#e6e2d4', color: '#202020', seed: 7 }) })
    readable(ctx, F, lx(3.5), 1.6, lz(0) - 0.15, [0.5, 0.4, 0.3], { ru: 'СДАЁТСЯ В АРЕНДУ\nтел. 8-916-…  (цифры размыты)', en: 'FOR RENT\nphone 8-916-…  (the digits have run in the wet)', style: 'hand' })
    sign(ctx, F, lx(8.5), 1.3, lz(0), 0, -1, { w: 0.9, h: 0.45, ppm: 70, draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: ['КиШ'], color: 'rgba(30,30,30,0.85)', font: SIGN_FONT, italic: true }) } })
  }
  reg(ctx, 'kiosks', { type, x: F.x, z: F.z, angle: F.a, lit, placement: p })
  navPath(ctx, F, [[0, lz(-2)], [0, lz(-10)]], 'path', { to: 'kiosk' })
  return { placement: p, light: L, frame: F }
}

export const KIOSK_TYPES = TYPES
export const KIOSK_DIMS = { w: 3.0, d: 2.75, h: 3.5 }
