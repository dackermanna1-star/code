// Canvas drawings for residential signs: entrance plates, house-number boxes, intercom panels,
// apartment door faces, mailboxes, floor numbers, lift panels, graffiti and notices.
// All deterministic (seeded), no Math.random.

import { SIGN_FONT, PLAIN_FONT, HAND_FONT, drawText } from '../../render/Signs.js'
import { RNG } from '../../core/rng.js'

export const PLATE_BLUE = '#1f4e96'

/** «Подъезд 3 · кв. 37–72» */
export function drawEntrancePlate(n, a, b) {
  return (c, W, H) => {
    c.fillStyle = PLATE_BLUE; c.fillRect(0, 0, W, H)
    c.strokeStyle = '#d8dde6'; c.lineWidth = Math.max(1, H * 0.05); c.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12)
    c.fillStyle = '#eef0f2'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = `bold ${Math.round(H * 0.38)}px ${SIGN_FONT}`
    c.fillText(`Подъезд ${n}`, W / 2, H * 0.36)
    c.font = `${Math.round(H * 0.27)}px ${SIGN_FONT}`
    c.fillText(`кв. ${a}–${b}`, W / 2, H * 0.72)
  }
}

/** Blue house-number box: street on top, big number, корпус. */
export function drawHousePlate(street, house, korpus, lit = false) {
  return (c, W, H) => {
    c.fillStyle = lit ? '#2a5cab' : PLATE_BLUE; c.fillRect(0, 0, W, H)
    c.strokeStyle = '#e8ebef'; c.lineWidth = H * 0.035; c.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1)
    c.fillStyle = '#f2f3f4'; c.textAlign = 'center'; c.textBaseline = 'middle'
    let fs = H * 0.2
    c.font = `bold ${Math.round(fs)}px ${SIGN_FONT}`
    for (let i = 0; i < 12 && c.measureText(street).width > W * 0.86; i++) { fs *= 0.9; c.font = `bold ${Math.max(4, Math.round(fs))}px ${SIGN_FONT}` }
    c.fillText(street, W / 2, H * 0.24)
    c.fillRect(W * 0.08, H * 0.4, W * 0.84, Math.max(1, H * 0.02))
    c.font = `bold ${Math.round(H * 0.46)}px ${SIGN_FONT}`
    const num = String(house)
    if (korpus) {
      c.textAlign = 'right'
      c.fillText(num, W * 0.56, H * 0.7)
      c.textAlign = 'left'
      c.font = `bold ${Math.round(H * 0.24)}px ${SIGN_FONT}`
      c.fillText(`корп. ${korpus}`, W * 0.6, H * 0.74)
    } else c.fillText(num, W / 2, H * 0.7)
  }
}

/** Big painted end-wall number «12/2». Transparent background. */
export function drawGableNumber(text) {
  return (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.fillStyle = 'rgba(70,72,74,0.95)'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = `bold ${Math.round(H * 0.82)}px ${SIGN_FONT}`
    c.fillText(text, W / 2, H * 0.54)
  }
}

/** Intercom (домофон) panel: red 7-segment display, worn keypad, key reader, grille. */
export function drawIntercom(seed, brand) {
  const r = new RNG(seed)
  return (c, W, H) => {
    const g = c.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#b9bcbf'); g.addColorStop(1, '#8e9295')
    c.fillStyle = g; c.fillRect(0, 0, W, H)
    c.fillStyle = '#2b2d2f'; c.font = `bold ${Math.round(H * 0.055)}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'top'
    c.fillText(brand, W / 2, H * 0.02)
    // display
    c.fillStyle = '#1a0806'; c.fillRect(W * 0.12, H * 0.09, W * 0.76, H * 0.11)
    c.fillStyle = '#ff2a1a'; c.font = `bold ${Math.round(H * 0.09)}px ${PLAIN_FONT}`; c.textBaseline = 'middle'
    c.fillText(r.chance(0.5) ? '- - - -' : '  C  ', W / 2, H * 0.145)
    // keypad 3×4, numbers worn off on the most used keys
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'В']
    for (let i = 0; i < 12; i++) {
      const kx = W * (0.2 + (i % 3) * 0.3), ky = H * (0.29 + Math.floor(i / 3) * 0.1)
      c.fillStyle = '#5d6164'; c.fillRect(kx - W * 0.11, ky - H * 0.035, W * 0.22, H * 0.07)
      if (!r.chance(0.25)) { c.fillStyle = '#d6d8da'; c.font = `bold ${Math.round(H * 0.045)}px ${PLAIN_FONT}`; c.fillText(keys[i], kx, ky + H * 0.003) }
    }
    // key reader ("таблетка")
    c.fillStyle = '#2b2d2f'; c.beginPath(); c.arc(W / 2, H * 0.73, W * 0.13, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#9fa3a6'; c.beginPath(); c.arc(W / 2, H * 0.73, W * 0.07, 0, Math.PI * 2); c.fill()
    // speaker grille
    c.fillStyle = '#3a3c3e'
    for (let i = 0; i < 4; i++) c.fillRect(W * 0.25, H * (0.84 + i * 0.035), W * 0.5, H * 0.015)
  }
}

const NAIL = '#b89a58'
/** Apartment door face: leatherette with nail diamonds, steel, or oak vinyl; number plate. */
export function drawAptDoor(style, color, number, seed) {
  const r = new RNG(seed)
  return (c, W, H) => {
    c.fillStyle = color; c.fillRect(0, 0, W, H)
    if (style <= 2) {
      // dermatin over batting: quilted diamonds strung on wire with brass nails
      const d = W / 4
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = Math.max(1, W * 0.01)
      for (let k = -8; k < 16; k++) {
        c.beginPath(); c.moveTo(k * d, 0); c.lineTo(k * d + H, H); c.stroke()
        c.beginPath(); c.moveTo(k * d, 0); c.lineTo(k * d - H, H); c.stroke()
      }
      c.fillStyle = NAIL
      for (let y = d / 2; y < H; y += d / 2)
        for (let x = (Math.round(y / (d / 2)) % 2) * d / 2; x < W; x += d) { c.beginPath(); c.arc(x, y, W * 0.018, 0, 7); c.fill() }
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(W * 0.04, H * 0.02, W * 0.92, H * 0.96)
      if (r.chance(0.3)) { c.fillStyle = 'rgba(210,190,150,0.6)'; c.fillRect(W * (0.1 + r.next() * 0.5), H * (0.5 + r.next() * 0.3), W * 0.12, H * 0.04) } // torn, stuffing showing
    } else if (style === 4) {
      // vinyl "oak"
      for (let x = 0; x < W; x += 2) { c.fillStyle = `rgba(40,25,10,${0.06 + 0.08 * Math.abs(Math.sin(x * 0.7 + seed))})`; c.fillRect(x, 0, 1, H) }
      c.strokeStyle = 'rgba(30,18,8,0.5)'; c.lineWidth = 2
      c.strokeRect(W * 0.15, H * 0.08, W * 0.7, H * 0.36); c.strokeRect(W * 0.15, H * 0.52, W * 0.7, H * 0.4)
    } else {
      // steel, hammer finish
      for (let i = 0; i < W * H * 0.05; i++) { c.fillStyle = `rgba(0,0,0,${r.next() * 0.12})`; c.fillRect(r.next() * W, r.next() * H, 1, 1) }
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; c.strokeRect(W * 0.08, H * 0.04, W * 0.84, H * 0.92)
    }
    // handle, locks, peephole
    c.fillStyle = style <= 2 ? '#c9b37a' : '#b9bcbe'
    c.fillRect(W * 0.78, H * 0.48, W * 0.12, H * 0.025)
    c.fillStyle = '#222'
    c.fillRect(W * 0.81, H * 0.53, W * 0.035, H * 0.02)
    if (style >= 3) c.fillRect(W * 0.81, H * 0.4, W * 0.035, H * 0.02)
    c.beginPath(); c.arc(W * 0.5, H * 0.3, W * 0.03, 0, 7); c.fill()
    c.fillStyle = '#b0a070'; c.beginPath(); c.arc(W * 0.5, H * 0.3, W * 0.018, 0, 7); c.fill()
    // number
    c.fillStyle = style <= 2 ? '#d9c690' : '#dadcdc'
    c.font = `bold ${Math.round(H * 0.06)}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(String(number), W * 0.5, H * 0.2)
  }
}

/** Doorbell button with the flat number scrawled next to it. */
export function drawBell(number) {
  return (c, W, H) => {
    c.fillStyle = '#d9d6cc'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#5a5650'; c.beginPath(); c.arc(W / 2, H * 0.42, W * 0.22, 0, 7); c.fill()
    c.fillStyle = '#2a2826'; c.beginPath(); c.arc(W / 2, H * 0.42, W * 0.12, 0, 7); c.fill()
    c.fillStyle = '#333'; c.font = `${Math.round(H * 0.22)}px ${PLAIN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(String(number), W / 2, H * 0.84)
  }
}

/** Painted floor number on the landing wall (transparent background). */
export function drawFloorNumber(n, color = '#8e2a22') {
  return (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.fillStyle = color; c.textBaseline = 'middle'
    c.font = `bold ${Math.round(H * 0.86)}px ${SIGN_FONT}`
    c.textAlign = 'right'
    c.fillText(String(n), W * 0.42, H * 0.54)
    c.font = `bold ${Math.round(H * 0.5)}px ${SIGN_FONT}`
    c.textAlign = 'left'
    c.fillText('ЭТАЖ', W * 0.47, H * 0.6)
  }
}

/** Rows of mailboxes with stencilled numbers and flyers sticking out. */
export function drawMailboxes(first, last, color, seed) {
  const r = new RNG(seed)
  return (c, W, H) => {
    const n = last - first + 1
    const cols = Math.ceil(n / 6), rows = Math.ceil(n / cols)
    c.fillStyle = color; c.fillRect(0, 0, W, H)
    const cw = W / cols, rh = H / rows
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * rh
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; c.strokeRect(x + 1, y + 1, cw - 2, rh - 2)
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x + cw * 0.15, y + rh * 0.18, cw * 0.7, rh * 0.08)
      c.fillStyle = '#e8e8e0'; c.font = `bold ${Math.round(rh * 0.28)}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(String(first + i), x + cw / 2, y + rh * 0.62)
      if (r.chance(0.3)) { c.fillStyle = r.pick(['#e8e2c8', '#f0d040', '#d04040', '#ffffff']); c.fillRect(x + cw * 0.2, y + rh * 0.05, cw * 0.5, rh * 0.15) }
      if (r.chance(0.12)) { c.fillStyle = 'rgba(30,20,10,0.7)'; c.fillRect(x + cw * 0.1, y + rh * 0.1, cw * 0.8, rh * 0.8) } // burnt
    }
  }
}

/** Floor electrical cabinet door with the warning triangle. */
export function drawCabinet(seed) {
  const r = new RNG(seed)
  return (c, W, H) => {
    c.fillStyle = '#7c807e'; c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2; c.strokeRect(2, 2, W - 4, H - 4)
    const tx = W * 0.5, ty = H * 0.25, s = W * 0.32
    c.fillStyle = '#e8c02a'; c.beginPath(); c.moveTo(tx, ty - s * 0.6); c.lineTo(tx + s * 0.62, ty + s * 0.45); c.lineTo(tx - s * 0.62, ty + s * 0.45); c.closePath(); c.fill()
    c.strokeStyle = '#111'; c.lineWidth = 2; c.stroke()
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(tx + s * 0.08, ty - s * 0.32); c.lineTo(tx - s * 0.14, ty + s * 0.08); c.lineTo(tx + s * 0.02, ty + s * 0.06); c.lineTo(tx - s * 0.08, ty + s * 0.36); c.lineTo(tx + s * 0.14, ty - s * 0.02); c.lineTo(tx - s * 0.01, ty); c.closePath(); c.fill()
    drawText(c, W, H * 0.5, { lines: ['Опасно!', 'Электрическое', 'напряжение'], color: '#1a1a1a', font: SIGN_FONT, pad: 2 })
    c.save(); c.translate(0, H * 0.5); c.restore()
    c.fillStyle = 'rgba(0,0,0,0)'
    if (r.chance(0.5)) { c.fillStyle = '#d9d2b8'; c.fillRect(W * 0.2, H * 0.72, W * 0.6, H * 0.12); c.fillStyle = '#333'; c.font = `${Math.round(H * 0.06)}px ${HAND_FONT}`; c.textAlign = 'center'; c.fillText('Корвина 24/7', W / 2, H * 0.8) }
  }
}

/** Round lift call button on a small steel plate. */
export function drawLiftCall() {
  return (c, W, H) => {
    c.fillStyle = '#8c9093'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#2e2f30'; c.beginPath(); c.arc(W / 2, H / 2, W * 0.32, 0, 7); c.fill()
    c.fillStyle = '#c86a30'; c.beginPath(); c.arc(W / 2, H / 2, W * 0.18, 0, 7); c.fill()
  }
}

/** Lift cab button column: floors bottom→top, two columns, some melted with a lighter. */
export function drawCabPanel(floors, seed, dead = []) {
  const r = new RNG(seed)
  const rows = Math.ceil(floors / 2)
  return (c, W, H) => {
    c.fillStyle = '#9ea2a4'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#2b2b2b'; c.font = `bold ${Math.round(H * 0.035)}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('400 кг · 5 чел.', W / 2, H * 0.035)
    for (let k = 1; k <= floors; k++) {
      const col = (k - 1) % 2, row = Math.floor((k - 1) / 2)
      const x = W * (col ? 0.7 : 0.3), y = H * (0.88 - row * (0.76 / Math.max(1, rows - 0.5)))
      const rr = Math.min(W * 0.16, H * 0.035)
      const melted = dead.includes(k) || r.chance(0.15)
      c.fillStyle = melted ? '#4a2c18' : '#1c1c1c'; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill()
      if (melted) { c.fillStyle = 'rgba(20,10,5,0.8)'; c.beginPath(); c.arc(x + rr * 0.2, y - rr * 0.3, rr * 1.2, 0, 7); c.fill() }
      else { c.fillStyle = '#e8e8e8'; c.font = `bold ${Math.round(rr * 1.1)}px ${PLAIN_FONT}`; c.fillText(String(k), x, y + 1) }
    }
    c.fillStyle = '#c8b030'; c.beginPath(); c.arc(W * 0.3, H * 0.955, Math.min(W * 0.12, H * 0.025), 0, 7); c.fill()
    c.fillStyle = '#9b1c16'; c.beginPath(); c.arc(W * 0.7, H * 0.955, Math.min(W * 0.12, H * 0.025), 0, 7); c.fill()
  }
}

/** Scratched / markered texts on walls (transparent background). */
export const GRAFFITI = [
  { ru: 'Цой жив', en: 'Tsoi lives' },
  { ru: 'Спартак — чемпион', en: 'Spartak are champions' },
  { ru: 'КОНИ', en: '"The Horses" (CSKA fans)' },
  { ru: 'Лена + Саша = любовь', en: 'Lena + Sasha = love' },
  { ru: 'Здесь был Вася', en: 'Vasya was here' },
  { ru: 'Коля лох', en: "Kolya's a loser" },
  { ru: 'Даша, я тебя люблю', en: 'Dasha, I love you' },
  { ru: 'Эмо — отстой', en: 'Emo sucks' },
  { ru: 'ХОЙ!', en: 'Hoy! (Sektor Gaza)' },
  { ru: 'КиШ', en: 'Korol i Shut (band)' },
  { ru: 'Rammstein', en: 'Rammstein' },
  { ru: 'Ⓐ', en: 'anarchy sign' },
  { ru: 'не курить!!!', en: 'no smoking!!!' },
  { ru: 'Макс 2007', en: 'Max 2007' },
  { ru: 'ЦСКА', en: 'CSKA' },
  { ru: 'кто прочитал тот лох', en: "whoever read this is a loser" },
  { ru: '8-916-...-..-..  Света', en: "Sveta's phone number (scratched out)" },
  { ru: 'Linkin Park', en: 'Linkin Park' },
]

export function drawGraffiti(item, seed, color) {
  const r = new RNG(seed)
  return (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.save()
    c.translate(W / 2, H / 2)
    c.rotate((r.next() - 0.5) * 0.18)
    c.fillStyle = color
    c.font = `${r.chance(0.5) ? 'bold ' : ''}${Math.round(H * 0.5)}px ${HAND_FONT}`
    c.textAlign = 'center'; c.textBaseline = 'middle'
    let size = H * 0.5
    while (c.measureText(item.ru).width > W * 0.95 && size > 4) { size *= 0.9; c.font = `${Math.round(size)}px ${HAND_FONT}` }
    c.fillText(item.ru, 0, 0)
    c.restore()
  }
}

/** Handwritten / printed paper notice (opaque paper). */
export function drawNotice(lines, o = {}) {
  return (c, W, H) => {
    c.fillStyle = o.paper ?? '#dcd6c4'; c.fillRect(0, 0, W, H)
    drawText(c, W, H, { lines, color: o.color ?? '#222', font: o.hand ? HAND_FONT : SIGN_FONT, weight: o.hand ? 'normal' : 'bold', pad: Math.round(H * 0.08) })
    c.fillStyle = 'rgba(220,220,200,0.6)'
    c.fillRect(0, 0, W * 0.18, H * 0.08); c.fillRect(W * 0.82, 0, W * 0.18, H * 0.08)
  }
}

export const NOTICES = {
  liftBroken: { ru: 'ЛИФТ НЕ РАБОТАЕТ', en: 'LIFT OUT OF ORDER' },
  roof: { ru: 'Выход на кровлю закрыт.\nКлючи в ДЕЗ', en: 'Roof exit locked.\nKeys at the DEZ (housing office)' },
  closeDoor: { ru: 'Уважаемые жители!\nЗакрывайте дверь подъезда!', en: 'Dear residents!\nClose the entrance door!' },
  cats: { ru: 'Не закрывайте продухи —\nтам живут кошки', en: "Don't block the vents —\ncats live there" },
  refuse: { ru: 'Мусорокамера', en: 'Refuse room' },
  noEntry: { ru: 'Посторонним вход воспрещён', en: 'No unauthorised entry' },
  snowFall: { ru: 'Осторожно!\nСход снега и наледи', en: 'Caution!\nFalling snow and ice' },
  chute: { ru: 'Мусоропровод\nне засорять!', en: 'Garbage chute —\ndo not clog!' },
}
