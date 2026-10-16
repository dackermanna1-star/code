// Canvas drawing for street signage: road signs (pictograms drawn with paths), stop plates,
// posters, notices and pole flyers with tear-off tabs. Deterministic (seeded wobble only).

import { SIGN_FONT, PLAIN_FONT, HAND_FONT, SERIF_FONT, drawText } from '../../render/Signs.js'
import { RNG } from '../../core/rng.js'
import { FLYERS, POSTERS, BEER_WARNING, LOST_DOG } from './texts.js'
import { rotXZ, seedInt } from './lib.js'

/** Add a sign at a local offset (meters, model space) of an origin {x, y, z, angle}. */
export function signLocal(ctx, o, lx, ly, lz, s) {
  if (!ctx.signs) return null
  const [dx, dz] = rotXZ(lx, lz, o.angle ?? 0)
  return ctx.signs.add({ ...s, x: o.x + dx, y: o.y + ly, z: o.z + dz, angle: (o.angle ?? 0) + (s.flip ? Math.PI : 0) })
}

// ---- small canvas helpers -----------------------------------------------------------------
function wobbleText(c, text, x, y, size, font, color, rng, weight = '') {
  c.font = `${weight} ${size}px ${font}`
  c.fillStyle = color
  c.textBaseline = 'top'
  let cx = x
  for (const ch of text) {
    c.save()
    c.translate(cx, y + (rng.next() - 0.5) * size * 0.12)
    c.rotate((rng.next() - 0.5) * 0.06)
    c.fillText(ch, 0, 0)
    c.restore()
    cx += c.measureText(ch).width
  }
  return cx
}

function fitLines(c, lines, W, font, weight, maxSize) {
  let size = maxSize
  c.font = `${weight} ${size}px ${font}`
  let mw = 0
  for (const l of lines) mw = Math.max(mw, c.measureText(l).width)
  if (mw > W) size *= W / mw
  return size
}

// ---- pole flyers & notices ----------------------------------------------------------------

/** Draw an A5-ish flyer with tear-off phone tabs along the bottom. tabsLeft: how many tabs remain. */
export function drawFlyer(item, seed, tabsLeft = -1) {
  return (c, W, H) => {
    const rng = new RNG(seed)
    c.fillStyle = rng.chance(0.25) ? '#d9d3b0' : '#e2e0d6'
    c.fillRect(0, 0, W, H)
    const lines = item.ru.split('\n')
    const top = H * 0.06, bodyH = H * 0.6
    const font = rng.chance(0.4) ? HAND_FONT : PLAIN_FONT
    const size = Math.min(fitLines(c, lines, W * 0.9, font, 'bold', bodyH / (lines.length * 1.25)), H * 0.16)
    lines.forEach((l, i) => {
      c.font = `bold ${size}px ${font}`
      const w = c.measureText(l).width
      wobbleText(c, l, (W - w) / 2, top + i * size * 1.25, size, font, i === 0 ? '#1a1a1a' : '#2a2a30', rng, 'bold')
    })
    // tear-off tabs
    const n = 7
    const tw = W / n
    const ty = H * 0.72
    const keep = tabsLeft < 0 ? n - rng.int(0, 4) : tabsLeft
    const kept = new Set()
    if (tabsLeft >= 0) { for (let i = 0; i < keep; i++) kept.add(rng.int(0, n - 1)) } else { for (let i = 0; i < n; i++) if (rng.next() < keep / n) kept.add(i) }
    for (let i = 0; i < n; i++) {
      if (!kept.has(i)) { c.clearRect(i * tw + 1, ty + H * 0.03, tw - 2, H - ty); continue }
      c.strokeStyle = 'rgba(40,40,40,0.5)'
      c.lineWidth = 1
      c.beginPath(); c.moveTo(i * tw + 0.5, ty); c.lineTo(i * tw + 0.5, H); c.stroke()
      c.save()
      c.translate(i * tw + tw * 0.68, H - 2)
      c.rotate(-Math.PI / 2)
      c.font = `${Math.max(5, tw * 0.5)}px ${PLAIN_FONT}`
      c.fillStyle = '#222'
      c.textBaseline = 'middle'
      c.fillText(item.tab ?? '', 0, 0)
      c.restore()
    }
    c.strokeStyle = 'rgba(30,30,30,0.6)'
    c.setLineDash([2, 2])
    c.beginPath(); c.moveTo(0, ty); c.lineTo(W, ty); c.stroke()
    c.setLineDash([])
    // tape corners
    c.fillStyle = 'rgba(200,200,180,0.55)'
    c.fillRect(0, 0, W * 0.2, H * 0.05); c.fillRect(W * 0.8, 0, W * 0.2, H * 0.05)
  }
}

/** Typed / handwritten notice sheet. */
export function drawNotice(item, seed) {
  return (c, W, H) => {
    const rng = new RNG(seed)
    const hand = rng.chance(0.35)
    c.fillStyle = hand ? '#dcd8c8' : '#e4e3dc'
    c.fillRect(0, 0, W, H)
    const lines = []
    const font = hand ? HAND_FONT : PLAIN_FONT
    const words = item.ru.split('\n')
    c.font = `${H * 0.07}px ${font}`
    // greedy wrap
    for (const para of words) {
      let cur = ''
      for (const w of para.split(' ')) {
        const t = cur ? cur + ' ' + w : w
        if (c.measureText(t).width > W * 0.88 && cur) { lines.push(cur); cur = w } else cur = t
      }
      lines.push(cur)
    }
    let size = Math.min(H * 0.075, (H * 0.9) / (lines.length * 1.2))
    let y = H * 0.05
    lines.forEach((l, i) => {
      const first = i === 0
      c.font = `${first ? 'bold ' : ''}${size}px ${font}`
      const w = c.measureText(l).width
      const x = first ? (W - w) / 2 : W * 0.06
      if (hand) wobbleText(c, l, x, y, size, font, '#25305a', rng, first ? 'bold' : '')
      else { c.fillStyle = '#1c1c1c'; c.textBaseline = 'top'; c.fillText(l, x, y) }
      y += size * 1.2
    })
    c.fillStyle = 'rgba(190,190,170,0.6)'
    c.fillRect(W * 0.4, 0, W * 0.2, H * 0.035)
  }
}

/** Flyer on a lamp pole / tree: a small tear-off sheet facing `angle`. */
export function addPoleFlyer(ctx, o) {
  if (!ctx.signs) return null
  const seed = seedInt(o.seed, 3)
  const rng = new RNG(seed)
  const item = o.item ?? FLYERS[rng.int(0, FLYERS.length - 1)]
  const w = Math.min(0.21, (o.halfWidth ?? 0.125) * 2 - 0.02), h = 0.3
  const [dx, dz] = rotXZ(0, (o.halfWidth ?? 0.125) + 0.012, o.angle)
  const s = ctx.signs.add({ x: o.x + dx, y: o.y, z: o.z + dz, angle: o.angle, w, h, ppm: 220, draw: drawFlyer(item, seed), aged: 0.3 + rng.next() * 0.5, seed })
  if (ctx.interactions) {
    ctx.interactions.add({
      x: o.x + dx, y: o.y, z: o.z + dz, size: [0.3, 0.32, 0.3], reach: 1.8, tag: 'notice',
      prompt: { ru: 'Читать', en: 'Read' },
      onUse(game) { game.ui.showNote({ ru: `${item.ru}\n\n${item.tab}`, en: item.en, style: 'paper' }) },
    })
  }
  return s
}

export { LOST_DOG }

// ---- road signs -------------------------------------------------------------------------

function pedestrian(c, x, y, s, color) {
  c.fillStyle = color
  c.strokeStyle = color
  c.lineCap = 'round'
  c.lineWidth = s * 0.11
  c.beginPath(); c.arc(x + s * 0.08, y - s * 0.38, s * 0.08, 0, Math.PI * 2); c.fill()
  c.beginPath()
  c.moveTo(x + s * 0.06, y - s * 0.27); c.lineTo(x - s * 0.02, y + s * 0.02) // body
  c.moveTo(x - s * 0.02, y + s * 0.02); c.lineTo(x - s * 0.16, y + s * 0.3) // back leg
  c.moveTo(x - s * 0.02, y + s * 0.02); c.lineTo(x + s * 0.12, y + s * 0.18); c.lineTo(x + s * 0.12, y + s * 0.32) // front leg
  c.moveTo(x + s * 0.04, y - s * 0.2); c.lineTo(x - s * 0.13, y - s * 0.05) // arm back
  c.moveTo(x + s * 0.04, y - s * 0.2); c.lineTo(x + s * 0.18, y - s * 0.06) // arm front
  c.stroke()
}

function child(c, x, y, s, color) {
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = s * 0.12
  c.beginPath(); c.arc(x, y - s * 0.32, s * 0.09, 0, Math.PI * 2); c.fill()
  c.beginPath()
  c.moveTo(x, y - s * 0.2); c.lineTo(x - s * 0.03, y + s * 0.05)
  c.moveTo(x - s * 0.03, y + s * 0.05); c.lineTo(x - s * 0.14, y + s * 0.28)
  c.moveTo(x - s * 0.03, y + s * 0.05); c.lineTo(x + s * 0.1, y + s * 0.27)
  c.moveTo(x, y - s * 0.14); c.lineTo(x - s * 0.14, y - s * 0.02)
  c.moveTo(x, y - s * 0.14); c.lineTo(x + s * 0.14, y - s * 0.04)
  c.stroke()
}

/** Road sign face drawers. type: crossing | children | noparking | nostopping | residential | dogs | stop_a | stop_t */
export function drawRoadSign(type) {
  return (c, W, H) => {
    const s = Math.min(W, H)
    c.clearRect(0, 0, W, H)
    const blue = '#2a4f8c', red = '#b4302a', white = '#e6e6e0', black = '#1c1c1c'
    if (type === 'crossing') {
      c.fillStyle = white; c.fillRect(0, 0, W, H)
      c.fillStyle = blue; c.fillRect(s * 0.04, s * 0.04, W - s * 0.08, H - s * 0.08)
      c.fillStyle = white
      c.beginPath(); c.moveTo(W / 2, s * 0.14); c.lineTo(W - s * 0.12, H - s * 0.14); c.lineTo(s * 0.12, H - s * 0.14); c.closePath(); c.fill()
      c.fillStyle = black
      for (let i = 0; i < 4; i++) c.fillRect(s * (0.26 + i * 0.13), H - s * 0.25, s * 0.07, s * 0.06)
      pedestrian(c, W / 2, H * 0.58, s * 0.62, black)
    } else if (type === 'children') {
      c.fillStyle = red
      c.beginPath(); c.moveTo(W / 2, s * 0.02); c.lineTo(W - s * 0.02, H - s * 0.06); c.lineTo(s * 0.02, H - s * 0.06); c.closePath(); c.fill()
      c.fillStyle = white
      c.beginPath(); c.moveTo(W / 2, s * 0.17); c.lineTo(W - s * 0.15, H - s * 0.14); c.lineTo(s * 0.15, H - s * 0.14); c.closePath(); c.fill()
      child(c, W * 0.44, H * 0.64, s * 0.42, black)
      child(c, W * 0.58, H * 0.67, s * 0.34, black)
    } else if (type === 'noparking' || type === 'nostopping') {
      c.fillStyle = red; c.beginPath(); c.arc(W / 2, H / 2, s * 0.48, 0, Math.PI * 2); c.fill()
      c.fillStyle = blue; c.beginPath(); c.arc(W / 2, H / 2, s * 0.37, 0, Math.PI * 2); c.fill()
      c.strokeStyle = red; c.lineWidth = s * 0.09
      c.save(); c.beginPath(); c.arc(W / 2, H / 2, s * 0.37, 0, Math.PI * 2); c.clip()
      c.beginPath(); c.moveTo(W / 2 - s * 0.4, H / 2 - s * 0.4); c.lineTo(W / 2 + s * 0.4, H / 2 + s * 0.4)
      if (type === 'nostopping') { c.moveTo(W / 2 + s * 0.4, H / 2 - s * 0.4); c.lineTo(W / 2 - s * 0.4, H / 2 + s * 0.4) }
      c.stroke(); c.restore()
    } else if (type === 'residential') {
      c.fillStyle = blue; c.fillRect(0, 0, W, H)
      c.fillStyle = white; c.fillRect(s * 0.07, s * 0.07, W - s * 0.14, H - s * 0.14)
      c.fillStyle = black
      // house
      c.beginPath(); c.moveTo(W * 0.62, H * 0.2); c.lineTo(W * 0.86, H * 0.4); c.lineTo(W * 0.38, H * 0.4); c.closePath(); c.fill()
      c.fillRect(W * 0.43, H * 0.4, W * 0.38, H * 0.3)
      c.fillStyle = white; c.fillRect(W * 0.58, H * 0.5, W * 0.08, H * 0.2)
      c.fillStyle = black
      child(c, W * 0.22, H * 0.7, s * 0.4, black)
      c.fillRect(W * 0.1, H * 0.82, W * 0.8, H * 0.04)
    } else if (type === 'dogs' || type === 'childrenPlate') {
      const txt = type === 'dogs' ? ['ВЫГУЛ СОБАК', 'ЗАПРЕЩЁН'] : ['ОСТОРОЖНО,', 'ДЕТИ!']
      drawText(c, W, H, { lines: txt, bg: type === 'dogs' ? '#e2e0d8' : '#d8b13a', color: type === 'dogs' ? '#a52a22' : '#1b1b1b', border: '#1b1b1b', font: SIGN_FONT })
    } else if (type === 'stop_a' || type === 'stop_t') {
      c.fillStyle = '#e8e6de'; c.fillRect(0, 0, W, H)
      c.strokeStyle = blue; c.lineWidth = s * 0.06; c.strokeRect(s * 0.05, s * 0.05, W - s * 0.1, H - s * 0.1)
      c.fillStyle = type === 'stop_a' ? '#1f3f7a' : '#1f3f7a'
      c.font = `bold ${H * 0.72}px ${SIGN_FONT}`
      c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(type === 'stop_a' ? 'А' : 'Т', W / 2, H * 0.54)
    }
  }
}

/** Grey back of a sign plate (unpainted galvanized steel). */
export function drawSignBack(round) {
  return (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.fillStyle = '#7d8183'
    if (round === 'circle') { c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) * 0.48, 0, Math.PI * 2); c.fill() } else if (round === 'triangle') {
      c.beginPath(); c.moveTo(W / 2, 1); c.lineTo(W - 1, H - 2); c.lineTo(1, H - 2); c.closePath(); c.fill()
    } else c.fillRect(0, 0, W, H)
  }
}

// ---- posters ----------------------------------------------------------------------------

/** Poster / billboard face for a POSTERS entry (or id). Restrained period print look. */
export function drawPoster(p, seed = 1) {
  const item = typeof p === 'string' ? POSTERS.find(q => q.id === p) ?? POSTERS[0] : p
  return (c, W, H) => {
    const rng = new RNG(seed)
    c.fillStyle = item.bg; c.fillRect(0, 0, W, H)
    const lines = item.ru.split('\n')
    // simple graphic motif per id
    if (item.id === 'luch') {
      c.fillStyle = '#1b1b1b'
      for (let i = 0; i < 6; i++) c.fillRect(W * 0.72 + i * W * 0.045, 0, W * 0.02, H)
    } else if (item.id === 'mobitel') {
      c.fillStyle = '#f0e8e0'; c.beginPath(); c.ellipse(W * 0.82, H * 0.5, W * 0.08, H * 0.3, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = item.bg; c.beginPath(); c.ellipse(W * 0.82, H * 0.5, W * 0.04, H * 0.16, 0, 0, Math.PI * 2); c.fill()
    } else if (item.id === 'family') {
      // chamomile logo
      c.fillStyle = '#f7f4e8'
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; c.beginPath(); c.ellipse(W * 0.8 + Math.cos(a) * H * 0.16, H * 0.5 + Math.sin(a) * H * 0.16, H * 0.09, H * 0.04, a, 0, Math.PI * 2); c.fill() }
      c.strokeStyle = '#c9c4ae'; c.lineWidth = 1
      c.fillStyle = '#d9a52a'; c.beginPath(); c.arc(W * 0.8, H * 0.5, H * 0.08, 0, Math.PI * 2); c.fill()
    } else if (item.id === 'flats') {
      c.fillStyle = '#9fb0c4'
      for (let i = 0; i < 4; i++) c.fillRect(W * (0.64 + i * 0.08), H * (0.25 + (i % 2) * 0.1), W * 0.06, H * 0.75)
      c.fillStyle = '#e8e6d8'
      for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) c.fillRect(W * (0.65 + i * 0.08), H * (0.33 + (i % 2) * 0.1 + j * 0.08), W * 0.012, H * 0.03)
    } else if (item.id === 'disco') {
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(${200 + rng.int(0, 55)},${80 + rng.int(0, 120)},${180 + rng.int(0, 70)},0.5)`; c.fillRect(rng.float(0.6, 0.98) * W, rng.next() * H, W * 0.02, W * 0.02) }
    } else if (item.id === 'newyear') {
      c.fillStyle = '#e8e8e0'
      for (let i = 0; i < 40; i++) c.fillRect(rng.next() * W, rng.next() * H, 2, 2)
      c.fillStyle = '#2f6a3a'; c.beginPath(); c.moveTo(W * 0.82, H * 0.12); c.lineTo(W * 0.92, H * 0.8); c.lineTo(W * 0.72, H * 0.8); c.closePath(); c.fill()
    } else if (item.id === 'vetrov') {
      c.fillStyle = '#4a4f5a'; c.beginPath(); c.arc(W * 0.8, H * 0.45, H * 0.25, 0, Math.PI * 2); c.fill()
      c.fillRect(W * 0.68, H * 0.68, W * 0.24, H * 0.32)
    } else if (item.id === 'beer') {
      c.fillStyle = '#c8962a'; c.fillRect(W * 0.78, H * 0.12, W * 0.08, H * 0.58)
      c.fillStyle = '#f2ead0'; c.fillRect(W * 0.78, H * 0.12, W * 0.08, H * 0.1)
    }
    const textW = W * 0.62
    const size = Math.min(fitLines(c, lines, textW, SIGN_FONT, 'bold', H * 0.32), (H * (item.warning ? 0.7 : 0.82)) / (lines.length * 1.15))
    c.fillStyle = item.fg
    c.textBaseline = 'top'; c.textAlign = 'left'
    let y = (H * (item.warning ? 0.82 : 1) - size * 1.15 * lines.length) / 2
    lines.forEach((l, i) => {
      c.font = `bold ${i === 0 ? size : size * 0.82}px ${i === 0 ? SIGN_FONT : PLAIN_FONT}`
      c.fillText(l, W * 0.05, y)
      y += size * 1.15
    })
    if (item.warning) {
      c.fillStyle = '#f0ede2'; c.fillRect(0, H * 0.84, W, H * 0.16)
      c.fillStyle = '#111'; c.font = `bold ${H * 0.07}px ${PLAIN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(BEER_WARNING, W / 2, H * 0.92)
    }
    if (item.ru.includes('*')) {
      c.font = `${H * 0.035}px ${PLAIN_FONT}`; c.fillStyle = item.fg; c.textAlign = 'right'; c.textBaseline = 'bottom'
      c.fillText('* при подключении тарифа «Свой круг». Подробности на сайте.', W * 0.98, H * 0.98)
    }
  }
}

export function posterById(id) { return POSTERS.find(p => p.id === id) }
export function posterBySeed(seed) { const r = new RNG(seedInt(seed, 5)); return POSTERS[r.int(0, POSTERS.length - 1)] }

/** Stop name plate: «ОСТАНОВКА» + name. */
export function drawStopPlate(name) {
  return (c, W, H) => {
    c.fillStyle = '#e6e4dc'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#1f3f7a'; c.fillRect(0, 0, W, H * 0.34)
    c.fillStyle = '#eceae2'; c.font = `bold ${H * 0.24}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('ОСТАНОВКА', W / 2, H * 0.18)
    c.fillStyle = '#1b1b1b'
    let size = H * 0.36
    c.font = `bold ${size}px ${SIGN_FONT}`
    const w = c.measureText(name).width
    if (w > W * 0.92) { size *= W * 0.92 / w; c.font = `bold ${size}px ${SIGN_FONT}` }
    c.fillText(name, W / 2, H * 0.66)
  }
}

/** Small route-number plates row, e.g. ['36','73'] with a kind letter. */
export function drawRoutes(routes, kind) {
  return (c, W, H) => {
    c.clearRect(0, 0, W, H)
    const n = Math.max(1, routes.length)
    const w = W / n
    routes.forEach((r, i) => {
      c.fillStyle = '#ecebe4'; c.fillRect(i * w + 1, 0, w - 2, H)
      c.strokeStyle = '#1f3f7a'; c.lineWidth = 2; c.strokeRect(i * w + 2, 1, w - 4, H - 2)
      c.fillStyle = kind === 'trolleybus' ? '#1f3f7a' : '#1b1b1b'
      c.font = `bold ${H * 0.7}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(r, i * w + w / 2, H * 0.55)
    })
  }
}

/** Faded interval timetable sheet behind a scratched plastic frame. */
export function drawTimetable(lines) {
  return (c, W, H) => {
    c.fillStyle = '#5d6266'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#d6d2c2'; c.fillRect(W * 0.05, H * 0.04, W * 0.9, H * 0.92)
    c.fillStyle = '#3a3d48'
    const ls = lines.split('\n')
    let y = H * 0.08
    const size = H * 0.075
    ls.forEach((l, i) => {
      c.font = `${i < 3 ? 'bold ' : ''}${i === 0 ? size * 1.2 : size * 0.78}px ${i < 3 ? SIGN_FONT : PLAIN_FONT}`
      c.textAlign = i < 3 ? 'center' : 'left'; c.textBaseline = 'top'
      const x = i < 3 ? W / 2 : W * 0.09
      c.fillText(l, x, y, W * 0.84)
      y += (i === 0 ? size * 1.35 : size * 1.05)
    })
    // sun-faded diagonal and scratches
    const g = c.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, 'rgba(220,215,190,0.55)'); g.addColorStop(1, 'rgba(220,215,190,0.05)')
    c.fillStyle = g; c.fillRect(W * 0.05, H * 0.04, W * 0.9, H * 0.92)
  }
}

/** Plate with plain lines (helper over drawText). */
export function drawPlate(lines, o = {}) {
  return (c, W, H) => drawText(c, W, H, { lines, bg: o.bg ?? '#e4e2da', color: o.color ?? '#1b1b1b', border: o.border, font: o.font ?? SIGN_FONT, weight: o.weight ?? 'bold', lineGap: o.lineGap ?? 0.18, pad: o.pad })
}

/** Spray-painted / marker graffiti on a transparent canvas. */
export function drawGraffiti(text, seed, color = '#2a2a2e') {
  return (c, W, H) => {
    const rng = new RNG(seed)
    c.clearRect(0, 0, W, H)
    c.save()
    c.translate(W * 0.05, H * 0.5)
    c.rotate((rng.next() - 0.5) * 0.18)
    const size = H * 0.6
    const font = rng.chance(0.5) ? HAND_FONT : SERIF_FONT
    c.font = `bold ${size}px ${font}`
    const w = c.measureText(text).width
    const k = Math.min(1, (W * 0.9) / w)
    c.scale(k, 1)
    c.globalAlpha = 0.85
    wobbleText(c, text, 0, -size * 0.5, size, font, color, rng, 'bold')
    c.restore()
  }
}

export const GRAFFITI = ['Цой жив', 'Спартак — чемпион', 'КиШ', 'Лена + Саша', 'Здесь был Вася', 'ЦСКА', 'Хой!', 'Rammstein', 'Ⓐ', 'Даша, я тебя люблю', '2007', 'Эмо — отстой']
export const GRAFFITI_EN = { 'Цой жив': 'Tsoi lives', 'Спартак — чемпион': 'Spartak are champions', 'КиШ': 'KiSh (Korol i Shut, a punk band)', 'Лена + Саша': 'Lena + Sasha', 'Здесь был Вася': 'Vasya was here', 'ЦСКА': 'CSKA', 'Хой!': 'Hoy! (Sektor Gaza)', 'Даша, я тебя люблю': 'Dasha, I love you', 'Эмо — отстой': 'Emo sucks' }
