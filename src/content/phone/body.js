// The physical phone: a worn graphite candybar «NOVA 1120» drawn with Canvas2D in "U" units
// (1 U = one LCD pixel). Separate overlay for the green keypad backlight and pressed keys.

import { mulberry32 } from '../../core/rng.js'

export const BODY_W = 152
export const BODY_H = 352
export const LCD_X = 28
export const LCD_Y = 58
export const VISIBLE_U = 224 // how much of the phone rises above the bottom of the screen

const KX = [10, 56, 102], KY = [205, 230, 255, 280], KW = 40, KH = 21
const LABELS = [
  ['1', 'oo', ''], ['2', 'abc', 'абвг'], ['3', 'def', 'дежз'],
  ['4', 'ghi', 'ийкл'], ['5', 'jkl', 'мноп'], ['6', 'mno', 'рсту'],
  ['7', 'pqrs', 'фхцч'], ['8', 'tuv', 'шщъы'], ['9', 'wxyz', 'ьэюя'],
  ['*', '+', ''], ['0', '␣', ''], ['#', '⇧', ''],
]
const DPAD = { x: 76, y: 172, r: 23, ri: 9.5 }

/** Key geometry for highlights: id → {type, x, y, w, h} */
export const KEYS = (() => {
  const k = {}
  LABELS.forEach((lab, i) => {
    const id = lab[0] === '*' ? 'star' : lab[0] === '#' ? 'hash' : 'k' + lab[0]
    k[id] = { type: 'rr', x: KX[i % 3], y: KY[Math.floor(i / 3)], w: KW, h: KH, r: 6, lab }
  })
  k.softL = { type: 'rr', x: 12, y: 147, w: 38, h: 11, r: 5.5 }
  k.softR = { type: 'rr', x: 102, y: 147, w: 38, h: 11, r: 5.5 }
  k.call = { type: 'rr', x: 12, y: 165, w: 36, h: 20, r: 7 }
  k.end = { type: 'rr', x: 104, y: 165, w: 36, h: 20, r: 7 }
  k.select = { type: 'circle', ...DPAD }
  for (const [id, a] of [['up', -Math.PI / 2], ['right', 0], ['down', Math.PI / 2], ['left', Math.PI]]) k[id] = { type: 'wedge', ...DPAD, a }
  return k
})()

const FONT = '"DejaVu Sans", Verdana, Arial, sans-serif'

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  for (const [t, c] of stops) gr.addColorStop(t, c)
  return gr
}
function keyPath(g, k, grow = 0) {
  if (k.type === 'rr') rr(g, k.x - grow, k.y - grow, k.w + grow * 2, k.h + grow * 2, k.r + grow)
  else if (k.type === 'circle') { g.beginPath(); g.arc(k.x, k.y, k.ri + grow, 0, Math.PI * 2) }
  else if (k.type === 'wedge') {
    g.beginPath()
    g.arc(k.x, k.y, k.r + grow, k.a - 0.72, k.a + 0.72)
    g.arc(k.x, k.y, k.ri + 1.5, k.a + 0.72, k.a - 0.72, true)
    g.closePath()
  }
}
function handset(g, cx, cy, s, rot, color) {
  g.save()
  g.translate(cx, cy); g.rotate(rot); g.scale(s, s)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(-6, -2.2)
  g.quadraticCurveTo(0, -5.2, 6, -2.2)
  g.lineTo(6, 0.8); g.lineTo(3.2, 1.2); g.lineTo(2.6, -0.8)
  g.quadraticCurveTo(0, -1.8, -2.6, -0.8)
  g.lineTo(-3.2, 1.2); g.lineTo(-6, 0.8)
  g.closePath()
  g.fill()
  g.restore()
}

/** Paint the phone body. g is pre-scaled so that 1 unit = 1 U; p = device px per U. */
export function drawBody(g, p = 1) {
  g.clearRect(0, 0, BODY_W, BODY_H)
  const rnd = mulberry32(1120)

  // ---- shell with a soft drop shadow
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = 10 * p
  g.shadowOffsetX = -3 * p
  g.shadowOffsetY = 4 * p
  rr(g, 2, 2, BODY_W - 4, BODY_H - 4, 26)
  g.fillStyle = '#25282c'
  g.fill()
  g.restore()
  rr(g, 2, 2, BODY_W - 4, BODY_H - 4, 26)
  g.fillStyle = lin(g, 2, 0, BODY_W - 2, 0, [[0, '#454b52'], [0.06, '#30353a'], [0.5, '#272a2f'], [0.93, '#1c1e21'], [1, '#121314']])
  g.fill()
  g.fillStyle = lin(g, 0, 0, 0, BODY_H, [[0, 'rgba(255,255,255,0.07)'], [0.35, 'rgba(255,255,255,0.0)'], [1, 'rgba(0,0,0,0.25)']])
  g.fill()
  g.lineWidth = 1
  g.strokeStyle = 'rgba(0,0,0,0.7)'
  g.stroke()
  rr(g, 3.2, 3.2, BODY_W - 6.4, BODY_H - 6.4, 25)
  g.strokeStyle = 'rgba(255,255,255,0.10)'
  g.stroke()

  // ---- front fascia around the display (separate moulding, a hair lighter)
  rr(g, 8, 9, BODY_W - 16, 191, 21)
  g.fillStyle = lin(g, 0, 9, 0, 200, [[0, '#4b5158'], [0.45, '#3b4046'], [1, '#33373c']])
  g.fill()
  g.fillStyle = lin(g, 8, 0, BODY_W - 8, 0, [[0, 'rgba(255,255,255,0.08)'], [0.2, 'rgba(255,255,255,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']])
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.8; g.stroke()
  rr(g, 9, 10, BODY_W - 18, 189, 20)
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 0.6; g.stroke()

  // ---- earpiece
  rr(g, 59, 19, 34, 5, 2.5)
  g.fillStyle = '#0b0c0e'; g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.5; g.stroke()
  g.fillStyle = 'rgba(120,125,130,0.35)'
  for (let i = 0; i < 9; i++) g.fillRect(62 + i * 3.4, 21, 1.2, 1)

  // ---- brand
  g.font = `bold 8.5px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.textAlign = 'center'
  const brand = 'N O V A'
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(brand, 76.4, 39.4)
  g.fillStyle = '#c7ccd2'; g.fillText(brand, 76, 39)

  // ---- display window
  rr(g, 18, 46, 116, 92, 8)
  g.fillStyle = lin(g, 0, 46, 0, 138, [[0, '#1b1e21'], [0.15, '#0b0d0e'], [1, '#050607']])
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 1; g.stroke()
  rr(g, 18.7, 46.7, 114.6, 90.6, 7.5)
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 0.6; g.stroke()
  // LCD frame
  rr(g, LCD_X - 3, LCD_Y - 3, 96 + 6, 68 + 6, 2)
  g.fillStyle = '#121416'; g.fill()
  g.font = `5px ${FONT}`
  g.fillStyle = 'rgba(160,165,170,0.5)'
  g.textAlign = 'right'
  g.fillText('1120', 128, 134.5)

  // ---- soft keys
  for (const id of ['softL', 'softR']) {
    const k = KEYS[id]
    keyPath(g, k)
    g.fillStyle = lin(g, 0, k.y, 0, k.y + k.h, [[0, '#a3a9b0'], [0.5, '#7b8188'], [1, '#5a5f65']])
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.7; g.stroke()
    rr(g, k.x + 2, k.y + 1, k.w - 4, 2.2, 1.1)
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill()
  }
  // ---- call / end
  for (const id of ['call', 'end']) {
    const k = KEYS[id]
    keyPath(g, k)
    g.fillStyle = lin(g, 0, k.y, 0, k.y + k.h, [[0, '#3c4147'], [1, '#24272b']])
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 0.8; g.stroke()
    rr(g, k.x + 3, k.y + 1.2, k.w - 6, 2, 1)
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill()
    if (id === 'call') handset(g, k.x + k.w / 2, k.y + k.h / 2 + 1, 1.25, -0.5, '#58a94a')
    else handset(g, k.x + k.w / 2, k.y + k.h / 2 + 1.5, 1.25, Math.PI * 0.0, '#c4483e')
  }
  // ---- navigation ring + select
  const d = DPAD
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 3 * p; g.shadowOffsetY = 1 * p
  g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  g.fillStyle = lin(g, 0, d.y - d.r, 0, d.y + d.r, [[0, '#b1b7bd'], [0.5, '#80868c'], [1, '#575c62']])
  g.fill()
  g.restore()
  g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.8; g.stroke()
  g.beginPath(); g.arc(d.x, d.y, d.r - 1.2, Math.PI * 1.1, Math.PI * 1.9)
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8; g.stroke()
  // engraved arrows
  g.fillStyle = '#3d4146'
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    const cx = d.x + Math.cos(a) * (d.r - 6.5), cy = d.y + Math.sin(a) * (d.r - 6.5)
    g.save(); g.translate(cx, cy); g.rotate(a)
    g.beginPath(); g.moveTo(2.4, 0); g.lineTo(-1.6, -2.6); g.lineTo(-1.6, 2.6); g.closePath(); g.fill()
    g.restore()
  }
  g.beginPath(); g.arc(d.x, d.y, d.ri + 1.4, 0, Math.PI * 2)
  g.fillStyle = '#2e3236'; g.fill()
  g.beginPath(); g.arc(d.x, d.y, d.ri, 0, Math.PI * 2)
  g.fillStyle = lin(g, 0, d.y - d.ri, 0, d.y + d.ri, [[0, '#8c9298'], [1, '#4c5056']])
  g.fill()
  g.beginPath(); g.arc(d.x, d.y - 1, d.ri - 2.5, Math.PI * 1.15, Math.PI * 1.85)
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.9; g.stroke()

  // ---- keypad (one-piece rubber mat)
  rr(g, 7, 201, BODY_W - 14, 104, 12)
  g.fillStyle = '#1a1c1f'; g.fill()
  LABELS.forEach((lab, i) => {
    const id = lab[0] === '*' ? 'star' : lab[0] === '#' ? 'hash' : 'k' + lab[0]
    const k = KEYS[id]
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 2 * p; g.shadowOffsetY = 1 * p
    keyPath(g, k)
    g.fillStyle = lin(g, 0, k.y, 0, k.y + k.h, [[0, '#3d4248'], [0.5, '#30343a'], [1, '#26292d']])
    g.fill()
    g.restore()
    keyPath(g, k)
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6; g.stroke()
    rr(g, k.x + 3, k.y + 1, k.w - 6, 2, 1)
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fill()
    // worn labels on the most used keys
    const wear = { k2: 0.55, k5: 0.6, k8: 0.75, k0: 0.8 }[id] ?? 1
    drawLabels(g, k, lab, `rgba(214,218,222,${0.88 * wear})`, `rgba(170,176,182,${0.75 * wear})`)
  })

  // ---- microphone
  g.beginPath(); g.arc(76, 322, 1.4, 0, Math.PI * 2); g.fillStyle = '#0c0d0e'; g.fill()

  // ---- wear: hairline scratches on the fascia, rubbed paint on the edges
  g.lineWidth = 0.35
  for (let i = 0; i < 18; i++) {
    const x = 12 + rnd() * 128, y = 12 + rnd() * 185
    if (x > 16 && x < 136 && y > 44 && y < 140) continue
    const a = rnd() * Math.PI, l = 2 + rnd() * 9
    g.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
  }
  for (let i = 0; i < 26; i++) {
    const side = rnd() < 0.5
    const y = 10 + rnd() * 330
    g.fillStyle = `rgba(150,155,160,${0.08 + rnd() * 0.12})`
    g.fillRect(side ? 2.6 + rnd() * 1.2 : BODY_W - 4 - rnd() * 1.2, y, 0.8, 1 + rnd() * 3)
  }
}

function drawLabels(g, k, lab, c1, c2) {
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.font = `bold 10.5px ${FONT}`
  g.fillStyle = c1
  g.fillText(lab[0], k.x + 7, k.y + 15)
  g.font = `5.2px ${FONT}`
  g.fillStyle = c2
  g.textAlign = 'right'
  if (lab[2]) {
    g.fillText(lab[1], k.x + k.w - 5, k.y + 9)
    g.fillText(lab[2], k.x + k.w - 5, k.y + 16)
  } else if (lab[1]) {
    g.font = `6.2px ${FONT}`
    g.fillText(lab[1], k.x + k.w - 6, k.y + 14)
  }
}

/** Keypad backlight (green glow on the labels) and pressed-key shading. */
export function drawGlow(g, pressed, p = 1) {
  g.save()
  g.shadowColor = 'rgba(140,255,90,0.9)'
  g.shadowBlur = 2.5 * p
  for (const k of Object.values(KEYS)) {
    if (!k.lab) continue
    drawLabels(g, k, k.lab, 'rgba(170,255,120,0.85)', 'rgba(150,240,110,0.7)')
  }
  g.restore()
  // light leaking around the soft keys and the ring
  g.fillStyle = 'rgba(120,230,90,0.10)'
  for (const id of ['softL', 'softR', 'call', 'end']) { keyPath(g, KEYS[id], 0.8); g.fill() }
  g.beginPath(); g.arc(DPAD.x, DPAD.y, DPAD.r + 0.9, 0, Math.PI * 2); g.arc(DPAD.x, DPAD.y, DPAD.r - 0.2, 0, Math.PI * 2, true); g.fill()
  for (const id of pressed.keys()) {
    const k = KEYS[id]
    if (!k) continue
    keyPath(g, k)
    g.fillStyle = 'rgba(0,0,0,0.38)'
    g.fill()
  }
}
