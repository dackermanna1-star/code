// Canvas renderers that turn library texts (texts.js) into things on walls: paper notices with
// tape and tear-off strips, faded colour posters, spray paint and marker graffiti, price tags,
// plates, metro light boxes. All deterministic per seed. Used by api.js through signs.add({draw}).

import { mulberry32 } from '../../core/rng.js'
import { SIGN_FONT, PLAIN_FONT, SERIF_FONT } from '../../render/Signs.js'

export const HAND_STACK = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Marker Felt", "DejaVu Sans", cursive'
const TYPE = '"Courier New", "Liberation Mono", "DejaVu Sans Mono", monospace'

const PAPER = {
  white: '#e9e7df', yellow: '#e9dfa8', blue: '#cdd9e2', pink: '#ecd1d4', green: '#d4e2c8',
  notebook: '#e8e6dc', newsprint: '#dcd5c2', cardboard: '#cdb994',
}

// ---- small helpers ---------------------------------------------------------------------------
export function wrapLines(g, text, maxW) {
  const out = []
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (const word of para.split(' ')) {
      const cand = line ? line + ' ' + word : word
      if (g.measureText(cand).width <= maxW || !line) line = cand
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}
/** Largest font size (px) so that text wrapped to maxW fits maxH. */
function fitWrap(g, text, maxW, maxH, family, weight = '', start = 40, min = 4, lh = 1.2, style = '') {
  let size = start
  for (; size > min; size -= Math.max(0.5, size * 0.06)) {
    g.font = `${style}${weight} ${size}px ${family}`
    const lines = wrapLines(g, text, maxW)
    if (lines.length * size * lh <= maxH && lines.every(l => g.measureText(l).width <= maxW)) return { size, lines }
  }
  g.font = `${style}${weight} ${min}px ${family}`
  return { size: min, lines: wrapLines(g, text, maxW) }
}
function fitLine(g, text, maxW, maxH, family, weight = 'bold', style = '') {
  let size = maxH
  g.font = `${style}${weight} ${size}px ${family}`
  const w = g.measureText(text).width
  if (w > maxW) size = Math.max(3, size * maxW / w)
  g.font = `${style}${weight} ${size}px ${family}`
  return size
}
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}
/** Text drawn letter by letter with seeded wobble (handwriting, marker). */
function wobblyText(g, text, x, y, rnd, amt, align = 'left') {
  const w = g.measureText(text).width
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  const save = g.textAlign
  g.textAlign = 'left'
  let drift = 0
  for (const ch of text) {
    drift += (rnd() - 0.5) * amt * 0.5
    drift *= 0.85
    g.save()
    g.translate(cx, y + drift + (rnd() - 0.5) * amt)
    g.rotate((rnd() - 0.5) * 0.12)
    g.fillText(ch, 0, 0)
    g.restore()
    cx += g.measureText(ch).width * (0.96 + rnd() * 0.08)
  }
  g.textAlign = save
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255
  const f = c => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))))
  return `rgb(${f(r)},${f(gg)},${f(b)})`
}

/** Paper sheet with a slight rotation inside a transparent margin. Returns the paper rect. */
function paperSheet(g, W, H, color, rnd, o = {}) {
  const m = o.margin ?? Math.round(Math.min(W, H) * 0.05)
  const ang = o.flat ? 0 : (rnd() - 0.5) * 0.035
  g.translate(W / 2, H / 2); g.rotate(ang); g.translate(-W / 2, -H / 2)
  const x = m, y = m, w = W - m * 2, h = H - m * 2
  g.fillStyle = color
  g.fillRect(x, y, w, h)
  // light fold / wrinkle shading
  for (let i = 0; i < 3; i++) {
    const fx = x + rnd() * w
    const gr = g.createLinearGradient(fx - w * 0.15, 0, fx + w * 0.15, 0)
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${0.03 + rnd() * 0.04})`); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(x, y, w, h)
  }
  // vignette
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(w, h) * 0.3, W / 2, H / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,55,30,0.18)')
  g.fillStyle = vg
  g.fillRect(x, y, w, h)
  return { x, y, w, h, m }
}
function tape(g, x, y, w, h, rnd, corners = 'all') {
  const t = Math.max(3, Math.round(Math.min(w, h) * 0.07))
  const L = t * 3.2
  const pts = corners === 'top' ? [[x, y], [x + w, y]] : [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
  for (const [cx, cy] of pts) {
    if (rnd() < 0.18) continue
    g.save()
    g.translate(cx, cy)
    g.rotate((cx > x ? 1 : -1) * (cy > y ? -1 : 1) * (0.7 + (rnd() - 0.5) * 0.4))
    g.fillStyle = `rgba(232,226,190,${0.55 + rnd() * 0.15})`
    g.fillRect(-L / 2, -t / 2, L, t)
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.fillRect(-L / 2, -t / 2, L, Math.max(1, t * 0.25))
    g.restore()
  }
}
function notebookGrid(g, p, step) {
  g.strokeStyle = 'rgba(80,110,170,0.22)'
  g.lineWidth = Math.max(0.5, step * 0.08)
  g.beginPath()
  for (let x = p.x + step * 0.5; x < p.x + p.w; x += step) { g.moveTo(x, p.y); g.lineTo(x, p.y + p.h) }
  for (let y = p.y + step * 0.5; y < p.y + p.h; y += step) { g.moveTo(p.x, y); g.lineTo(p.x + p.w, y) }
  g.stroke()
  // the red margin line of a school exercise book
  g.strokeStyle = 'rgba(190,60,60,0.35)'
  g.beginPath(); g.moveTo(p.x + p.w - step * 2.5, p.y); g.lineTo(p.x + p.w - step * 2.5, p.y + p.h); g.stroke()
}
function tearStrips(g, p, text, rnd, ink, font, torn = null) {
  const n = Math.max(5, Math.min(10, Math.round(p.w / (p.h * 0.075))))
  const sh = p.h * 0.27
  const top = p.y + p.h - sh
  const sw = p.w / n
  g.save()
  g.strokeStyle = 'rgba(40,40,40,0.55)'
  g.setLineDash([Math.max(1, sw * 0.12), Math.max(1, sw * 0.1)])
  g.lineWidth = Math.max(0.5, sw * 0.03)
  g.beginPath(); g.moveTo(p.x, top); g.lineTo(p.x + p.w, top); g.stroke()
  g.setLineDash([])
  for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(p.x + i * sw, top); g.lineTo(p.x + i * sw, p.y + p.h); g.stroke() }
  g.restore()
  const size = Math.min(sw * 0.62, sh / Math.max(6, text.length) * 1.75)
  g.fillStyle = ink
  g.font = `${size}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < n; i++) {
    g.save()
    g.translate(p.x + (i + 0.5) * sw, top + sh / 2)
    g.rotate(-Math.PI / 2)
    g.fillText(text, 0, 0, sh * 0.92)
    g.restore()
  }
  // some strips have been torn off
  const gone = torn === 'allButOne' ? Array.from({ length: n }, (_, i) => i !== Math.floor(n * 0.6))
    : Array.isArray(torn) ? torn : Array.from({ length: n }, () => rnd() < 0.4)
  g.save()
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < n; i++) {
    if (!gone[i]) continue
    const x0 = p.x + i * sw + 0.5
    g.beginPath()
    g.moveTo(x0, top + sh * (0.02 + rnd() * 0.12))
    for (let k = 1; k <= 4; k++) g.lineTo(x0 + (sw - 1) * k / 4, top + sh * (0.02 + rnd() * 0.15))
    g.lineTo(x0 + sw - 1, p.y + p.h + p.m + 2)
    g.lineTo(x0, p.y + p.h + p.m + 2)
    g.closePath()
    g.fill()
  }
  g.restore()
  return top
}

// ---- notices ------------------------------------------------------------------------------------
/**
 * Paper notice. o: { seed, tape (default true), tornTabs: bool[] | null, ink, paper, flat }
 */
export function drawNotice(g, W, H, item, o = {}) {
  const rnd = mulberry32(((o.seed ?? 1) * 7919 + 13) | 0)
  const hand = item.look === 'handwritten' || item.style === 'hand'
  const paperKey = o.paper ?? item.paper ?? (hand ? 'notebook' : 'white')
  g.save()
  const p = paperSheet(g, W, H, PAPER[paperKey] ?? paperKey, rnd, o)
  if (paperKey === 'notebook') notebookGrid(g, p, Math.max(3, p.w / 34))
  const ink = o.ink ?? item.ink ?? (hand ? '#2b3a8f' : '#1c1c1c')
  const pad = p.w * 0.08
  let y = p.y + pad
  const bottom = item.tear ? p.y + p.h * 0.71 : p.y + p.h - pad
  const family = hand ? HAND_STACK : (item.sub === 'official' ? SERIF_FONT : PLAIN_FONT)
  g.fillStyle = ink
  g.textBaseline = 'top'
  // photo for lost pets
  if (item.photo) {
    const ph = p.h * 0.2, pw = ph * 1.25
    const px = p.x + (p.w - pw) / 2, py = y + p.h * 0.1
    g.fillStyle = '#8d8a82'; g.fillRect(px, py, pw, ph)
    g.fillStyle = '#4a4740'
    g.beginPath(); g.ellipse(px + pw * 0.5, py + ph * 0.62, pw * 0.3, ph * 0.26, 0, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(px + pw * 0.66, py + ph * 0.36, pw * 0.14, ph * 0.16, 0, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.moveTo(px + pw * 0.6, py + ph * 0.24); g.lineTo(px + pw * 0.62, py + ph * 0.08); g.lineTo(px + pw * 0.7, py + ph * 0.22); g.fill()
    g.fillStyle = 'rgba(30,30,30,0.25)'
    for (let i = 0; i < 40; i++) g.fillRect(px + rnd() * pw, py + rnd() * ph, 1, 1)
    g.fillStyle = ink
    if (item.title) {
      const ts = fitLine(g, item.title, p.w - pad * 2, p.h * 0.075, family, 'bold')
      g.textAlign = 'center'
      g.fillText(item.title, p.x + p.w / 2, y)
      y += ts * 1.15
    }
    y = py + ph + p.h * 0.03
  } else if (item.title) {
    const ts = fitLine(g, item.title, p.w - pad * 2, (hand ? 0.075 : 0.07) * p.h * (item.title.length < 12 ? 1.25 : 1), family, 'bold')
    g.textAlign = 'center'
    if (hand) wobblyText(g, item.title, p.x + p.w / 2, y, rnd, ts * 0.12, 'center')
    else g.fillText(item.title, p.x + p.w / 2, y)
    y += ts * 1.45
  }
  // body
  const bodyH = bottom - y - (item.footer ? p.h * 0.06 : 0)
  const fit = fitWrap(g, item.ru, p.w - pad * 2, bodyH, family, '', p.h * (hand ? 0.1 : 0.05), 3, hand ? 1.3 : 1.22)
  g.textAlign = item.sub === 'official' || hand ? 'left' : 'center'
  const bx = g.textAlign === 'left' ? p.x + pad : p.x + p.w / 2
  for (const line of fit.lines) {
    if (hand) wobblyText(g, line, bx, y, rnd, fit.size * 0.1, g.textAlign)
    else g.fillText(line, bx, y)
    y += fit.size * (hand ? 1.3 : 1.22)
  }
  if (item.addendum) {
    // someone else has written underneath, in another pen
    g.save()
    g.fillStyle = '#151515'
    g.font = `bold ${Math.max(4, fit.size * 1.15)}px ${HAND_STACK}`
    g.textAlign = 'right'
    g.translate(p.x + p.w - pad, Math.min(bottom - fit.size * 1.6, y + fit.size * 0.5))
    g.rotate(-0.12)
    wobblyText(g, item.addendum, 0, 0, rnd, fit.size * 0.1, 'right')
    g.restore()
  }
  if (item.footer) {
    g.font = `italic ${Math.max(3, fit.size * 0.92)}px ${family}`
    g.textAlign = 'right'
    g.fillText(item.footer, p.x + p.w - pad, Math.min(bottom - fit.size, y + fit.size * 0.4))
  }
  // a pen signature / a stamp on official notices
  if (item.sub === 'official' && rnd() < 0.5) {
    g.strokeStyle = 'rgba(40,60,150,0.55)'
    g.lineWidth = Math.max(0.6, p.w * 0.008)
    const sx = p.x + p.w * 0.72, sy = p.y + p.h * 0.86, r = p.w * 0.09
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.arc(sx, sy, r * 0.72, 0, Math.PI * 2); g.stroke()
  }
  if (item.tear) tearStrips(g, p, item.tear, rnd, ink, hand ? HAND_STACK : PLAIN_FONT, o.tornTabs)
  if (o.tape !== false) tape(g, p.x, p.y, p.w, p.h, rnd, hand ? 'top' : 'all')
  g.restore()
}

// ---- posters -------------------------------------------------------------------------------------
/** Colour-printed advertising poster. o: { seed, fade (0..1) } */
export function drawPoster(g, W, H, item, o = {}) {
  const rnd = mulberry32(((o.seed ?? 1) * 4241 + 7) | 0)
  if (item.look === 'flyer' || item.layout === 'flyer') return drawFlyer(g, W, H, item, rnd, o)
  const c = item.colors ?? { bg: '#eeeeee', fg: '#222222', accent: '#c01818' }
  const lay = item.layout ?? 'shop'
  const pad = W * 0.07
  g.save()
  g.fillStyle = c.bg
  g.fillRect(0, 0, W, H)
  // print texture: halftone-ish speckle
  g.fillStyle = 'rgba(0,0,0,0.05)'
  for (let i = 0; i < W * H * 0.01; i++) g.fillRect(rnd() * W, rnd() * H, 1, 1)
  const brandBand = () => {
    if (!item.brand) return pad
    const bh = H * 0.11
    if (lay === 'operator' && /МобиТел/.test(item.brand)) {
      g.fillStyle = c.accent
      g.beginPath(); g.ellipse(W / 2, pad + bh * 0.55, bh * 0.42, bh * 0.55, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = c.bg
      g.beginPath(); g.ellipse(W / 2, pad + bh * 0.55, bh * 0.18, bh * 0.28, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = c.fg
      fitLine(g, item.brand, W - pad * 2, bh * 0.5, SIGN_FONT)
      g.textAlign = 'center'; g.textBaseline = 'top'
      g.fillText(item.brand, W / 2, pad + bh * 1.2)
      return pad + bh * 1.8
    }
    g.fillStyle = c.fg
    g.textAlign = 'center'; g.textBaseline = 'top'
    fitLine(g, item.brand, W - pad * 2, bh * 0.62, SIGN_FONT)
    g.fillText(item.brand, W / 2, pad)
    return pad + bh * 0.9
  }
  let y
  if (lay === 'operator' && /Луч/.test(item.brand ?? '')) {
    // black and yellow stripes
    g.save(); g.beginPath(); g.rect(0, H * 0.9, W, H * 0.1); g.clip()
    g.fillStyle = '#141414'
    for (let x = -H; x < W + H; x += W * 0.12) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + W * 0.06, H); g.lineTo(x + W * 0.06 + H * 0.1, H * 0.9); g.lineTo(x + H * 0.1, H * 0.9); g.fill() }
    g.restore()
  }
  if (lay === 'credit' || lay === 'concert') {
    // light rays / glow behind the headline
    const gr = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.8)
    gr.addColorStop(0, shade(c.bg, 0.25)); gr.addColorStop(1, c.bg)
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
    if (lay === 'concert') {
      g.fillStyle = c.accent
      for (let i = 0; i < 26; i++) { const s = 1 + rnd() * 2.5; g.fillRect(rnd() * W, rnd() * H * 0.55, s, s) }
    }
  }
  y = brandBand()
  // illustration
  const ill = { x: pad, y: y + H * 0.02, w: W - pad * 2, h: H * 0.3 }
  let drewIll = true
  g.fillStyle = c.accent; g.strokeStyle = c.accent; g.lineWidth = Math.max(1, W * 0.012)
  if (lay === 'pizza') {
    const r = Math.min(ill.w, ill.h) * 0.48
    g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(W / 2, ill.y + ill.h / 2, r, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#c9382a'; g.beginPath(); g.arc(W / 2, ill.y + ill.h / 2, r * 0.86, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#f2e3b0'
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * r * 0.7; g.beginPath(); g.arc(W / 2 + Math.cos(a) * d, ill.y + ill.h / 2 + Math.sin(a) * d, r * 0.1, 0, 6.28); g.fill() }
  } else if (lay === 'windows') {
    const w = ill.h * 0.8, x = W / 2 - w / 2
    g.fillStyle = '#ffffff'; g.fillRect(x, ill.y, w, ill.h)
    g.fillStyle = '#bfe0f5'; g.fillRect(x + w * 0.08, ill.y + ill.h * 0.06, w * 0.38, ill.h * 0.88); g.fillRect(x + w * 0.54, ill.y + ill.h * 0.06, w * 0.38, ill.h * 0.88)
    g.strokeStyle = '#9aa4ad'; g.lineWidth = Math.max(1, w * 0.02); g.strokeRect(x, ill.y, w, ill.h)
  } else if (lay === 'realestate') {
    g.fillStyle = shade(c.fg, 0.55)
    for (let i = 0; i < 5; i++) {
      const bw = ill.w * 0.16, bh = ill.h * (0.5 + rnd() * 0.5)
      const bx = ill.x + i * ill.w * 0.2
      g.fillRect(bx, ill.y + ill.h - bh, bw, bh)
      g.fillStyle = c.accent
      for (let k = 0; k < 6; k++) g.fillRect(bx + bw * 0.2 + (k % 2) * bw * 0.4, ill.y + ill.h - bh + bh * 0.1 + Math.floor(k / 2) * bh * 0.25, bw * 0.2, bh * 0.08)
      g.fillStyle = shade(c.fg, 0.55)
    }
  } else if (lay === 'repair') {
    const s = ill.h
    g.beginPath(); g.moveTo(W / 2 - s * 0.6, ill.y + s * 0.45); g.lineTo(W / 2, ill.y); g.lineTo(W / 2 + s * 0.6, ill.y + s * 0.45); g.fill()
    g.fillStyle = shade(c.fg, 0.3); g.fillRect(W / 2 - s * 0.42, ill.y + s * 0.45, s * 0.84, s * 0.55)
    g.fillStyle = c.bg; g.fillRect(W / 2 - s * 0.1, ill.y + s * 0.62, s * 0.2, s * 0.38)
  } else if (lay === 'internet') {
    g.lineWidth = Math.max(1, W * 0.02)
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W / 2, ill.y + ill.h, ill.h * (0.35 + i * 0.25), Math.PI * 1.2, Math.PI * 1.8); g.stroke() }
    g.beginPath(); g.arc(W / 2, ill.y + ill.h, ill.h * 0.12, 0, 6.28); g.fill()
  } else if (lay === 'civic' && /СЕМЬ/.test(item.title)) {
    const cx = W / 2, cy = ill.y + ill.h / 2, r = ill.h * 0.42
    g.fillStyle = '#ffffff'; g.strokeStyle = shade(c.fg, 0.4); g.lineWidth = 1
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.45, r * 0.16, a, 0, 6.28); g.fill(); g.stroke() }
    g.fillStyle = c.accent; g.beginPath(); g.arc(cx, cy, r * 0.3, 0, 6.28); g.fill()
  } else if (lay === 'english') {
    const fw = ill.h * 1.5, fx = W / 2 - fw / 2
    g.fillStyle = '#13306b'; g.fillRect(fx, ill.y, fw, ill.h)
    g.strokeStyle = '#ffffff'; g.lineWidth = ill.h * 0.2
    g.beginPath(); g.moveTo(fx, ill.y); g.lineTo(fx + fw, ill.y + ill.h); g.moveTo(fx + fw, ill.y); g.lineTo(fx, ill.y + ill.h); g.stroke()
    g.strokeStyle = '#d7262e'; g.lineWidth = ill.h * 0.08; g.stroke()
    g.fillStyle = '#ffffff'; g.fillRect(fx + fw * 0.42, ill.y, fw * 0.16, ill.h); g.fillRect(fx, ill.y + ill.h * 0.38, fw, ill.h * 0.24)
    g.fillStyle = '#d7262e'; g.fillRect(fx + fw * 0.46, ill.y, fw * 0.08, ill.h); g.fillRect(fx, ill.y + ill.h * 0.44, fw, ill.h * 0.12)
  } else if (lay === 'operator') {
    // a candybar phone sending out radio waves
    const ph = ill.h, pw = ph * 0.46, px = W / 2 - pw / 2
    g.fillStyle = c.fg === '#ffffff' ? shade(c.bg, -0.45) : c.fg
    rr(g, px, ill.y, pw, ph, pw * 0.22); g.fill()
    g.fillStyle = '#c9dc98'; rr(g, px + pw * 0.14, ill.y + ph * 0.14, pw * 0.72, ph * 0.32, pw * 0.05); g.fill()
    g.fillStyle = c.bg
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.fillRect(px + pw * (0.17 + k * 0.25), ill.y + ph * (0.56 + r * 0.1), pw * 0.16, ph * 0.055)
    g.strokeStyle = c.accent === c.bg ? c.fg : c.accent
    g.lineWidth = Math.max(1, W * 0.014)
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(px + pw * 0.92, ill.y + ph * 0.3, pw * 0.2 * i, -Math.PI * 0.45, -Math.PI * 0.05); g.stroke() }
  } else if (lay === 'credit') {
    // fanned banknotes
    for (let i = 0; i < 3; i++) {
      g.save()
      g.translate(W / 2, ill.y + ill.h * 0.9); g.rotate((i - 1) * 0.28)
      const bw = ill.h * 1.3, bh = ill.h * 0.6
      g.fillStyle = ['#c9d6b0', '#d8c9a8', '#c2cfd8'][i]; g.fillRect(-bw / 2, -bh - ill.h * 0.2, bw, bh)
      g.strokeStyle = 'rgba(40,50,40,0.6)'; g.lineWidth = Math.max(1, bw * 0.015); g.strokeRect(-bw / 2 + bw * 0.04, -bh - ill.h * 0.2 + bh * 0.08, bw * 0.92, bh * 0.84)
      g.fillStyle = 'rgba(40,60,40,0.75)'; g.font = `bold ${bh * 0.32}px ${SIGN_FONT}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic'
      g.fillText('1000', bw * 0.42, -ill.h * 0.2 - bh * 0.18)
      g.restore()
    }
  } else if (lay === 'beer') {
    const bw = ill.h * 0.28
    g.fillStyle = '#5a3a12'; rr(g, W / 2 - bw / 2, ill.y + ill.h * 0.25, bw, ill.h * 0.75, bw * 0.2); g.fill()
    g.fillRect(W / 2 - bw * 0.18, ill.y, bw * 0.36, ill.h * 0.3)
    g.fillStyle = c.accent; g.fillRect(W / 2 - bw / 2, ill.y + ill.h * 0.5, bw, ill.h * 0.25)
  } else drewIll = false
  y = drewIll ? ill.y + ill.h + H * 0.04 : y + H * 0.06
  // headline
  g.fillStyle = lay === 'credit' || lay === 'lottery' ? c.accent : c.fg
  g.textAlign = 'center'; g.textBaseline = 'top'
  const hfit = fitWrap(g, item.title ?? '', W - pad * 2, H * (drewIll ? 0.2 : 0.3), SIGN_FONT, 'bold', H * 0.12, 4, 1.08)
  for (const l of hfit.lines) { g.fillText(l, W / 2, y); y += hfit.size * 1.08 }
  y += H * 0.025
  // body
  g.fillStyle = lay === 'credit' ? c.fg : (lay === 'concert' ? c.accent : c.fg)
  const footerH = item.footer ? H * 0.08 : (lay === 'operator' && /Луч/.test(item.brand ?? '') ? H * 0.12 : 0)
  const bfit = fitWrap(g, item.ru ?? '', W - pad * 2, H - y - pad - footerH, PLAIN_FONT, 'bold', H * 0.055, 3, 1.2)
  for (const l of bfit.lines) { g.fillText(l, W / 2, y); y += bfit.size * 1.2 }
  // footer / small print
  if (item.footer) {
    const warn = /ПИВА/.test(item.footer)
    if (warn) {
      const fh = H * 0.1
      g.fillStyle = '#ffffff'; g.fillRect(0, H - fh, W, fh)
      g.fillStyle = '#111111'
      const fs = fitWrap(g, item.footer, W - pad, fh * 0.9, PLAIN_FONT, 'bold', fh * 0.4, 2, 1.1)
      let fy = H - fh + (fh - fs.lines.length * fs.size * 1.1) / 2
      for (const l of fs.lines) { g.fillText(l, W / 2, fy); fy += fs.size * 1.1 }
    } else {
      g.fillStyle = shade(c.fg, lay === 'operator' || lay === 'credit' ? -0.1 : 0.25)
      const fs = fitWrap(g, item.footer, W - pad * 2, footerH, PLAIN_FONT, '', H * 0.026, 2, 1.15)
      let fy = H - pad * 0.6 - fs.lines.length * fs.size * 1.15
      for (const l of fs.lines) { g.fillText(l, W / 2, fy); fy += fs.size * 1.15 }
    }
  }
  // fading in the weather: washed out colours and a pale top edge where the sun hit
  const fade = o.fade ?? item.aged ?? 0.3
  g.fillStyle = `rgba(232,232,225,${0.12 + fade * 0.25})`
  g.fillRect(0, 0, W, H)
  const wg = g.createLinearGradient(0, 0, 0, H)
  wg.addColorStop(0, `rgba(240,240,235,${fade * 0.25})`); wg.addColorStop(0.4, 'rgba(240,240,235,0)')
  g.fillStyle = wg; g.fillRect(0, 0, W, H)
  // paste wrinkles
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1
  for (let i = 0; i < 4; i++) { const x = rnd() * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * W * 0.3, H); g.stroke() }
  g.restore()
}

function drawFlyer(g, W, H, item, rnd, o) {
  g.save()
  const p = paperSheet(g, W, H, PAPER.white, rnd, o)
  // photocopier grime
  g.fillStyle = 'rgba(0,0,0,0.12)'
  for (let i = 0; i < p.w * p.h * 0.004; i++) g.fillRect(p.x + rnd() * p.w, p.y + rnd() * p.h, 1, 1)
  const pad = p.w * 0.08
  g.fillStyle = '#151515'
  g.textAlign = 'center'; g.textBaseline = 'top'
  let y = p.y + pad
  const tfit = fitWrap(g, item.title ?? '', p.w - pad * 2, p.h * 0.28, SIGN_FONT, 'bold', p.h * 0.12, 4, 1.05)
  for (const l of tfit.lines) { g.fillText(l, p.x + p.w / 2, y); y += tfit.size * 1.05 }
  y += p.h * 0.03
  const bfit = fitWrap(g, item.ru ?? '', p.w - pad * 2, p.h * 0.71 - y + p.y, PLAIN_FONT, '', p.h * 0.06, 3, 1.2)
  for (const l of bfit.lines) { g.fillText(l, p.x + p.w / 2, y); y += bfit.size * 1.2 }
  if (item.footer) tearStrips(g, p, item.footer, rnd, '#151515', PLAIN_FONT)
  tape(g, p.x, p.y, p.w, p.h, rnd, 'top')
  g.restore()
}

// ---- graffiti ---------------------------------------------------------------------------------------
/** Measure a graffiti item's natural aspect ratio (w / h) for its look. */
export function graffitiAspect(item) {
  const c = document.createElement('canvas').getContext('2d')
  const look = item.look ?? 'spray'
  const lines = String(item.ru).split('\n')
  c.font = `${look === 'spray' || look === 'stencil' ? 'bold ' : ''}100px ${look === 'marker' || look === 'chalk' || look === 'dust' || look === 'scratch' ? HAND_STACK : SIGN_FONT}`
  const w = Math.max(...lines.map(l => c.measureText(l).width))
  let a = (w + 40) / (lines.length * 115 + 30)
  if (item.heart) return 1.25
  if (item.anarchy) a += 1.0
  return a
}

/**
 * Text painted, written or scratched on a wall, on a transparent canvas.
 * o: { seed, color }
 */
export function drawGraffiti(g, W, H, item, o = {}) {
  const rnd = mulberry32(((o.seed ?? 1) * 1597 + 31) | 0)
  const look = item.look ?? 'spray'
  const color = o.color ?? item.color ?? (look === 'chalk' ? '#e8e4da' : look === 'scratch' ? '#cfcac0' : look === 'dust' ? '#a8a49a' : '#1b1b1b')
  const text = String(item.ru)
  const lines = item.heart ? text.replace(/ (=|\d)/, '\n$1').split('\n') : text.split('\n')
  const handish = look === 'marker' || look === 'chalk' || look === 'dust' || look === 'scratch'
  const family = handish ? HAND_STACK : SIGN_FONT
  const weight = look === 'spray' || look === 'stencil' || look === 'tag' ? 'bold' : ''
  let left = W * 0.04
  let avail = W * 0.92
  if (item.anarchy) { avail -= H * 0.95; left += H * 0.95 }
  if (item.heart) { left = W * 0.24; avail = W * 0.52 }
  // size to fit
  let size = (item.heart ? H * 0.36 : H * 0.82) / lines.length
  g.font = `${look === 'tag' ? 'italic ' : ''}${weight} ${size}px ${family}`
  const mw = Math.max(...lines.map(l => g.measureText(l).width))
  if (mw > avail) size *= avail / mw
  g.font = `${look === 'tag' ? 'italic ' : ''}${weight} ${size}px ${family}`
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  const cx = left + avail / 2
  const cy0 = (item.heart ? H * 0.44 : H / 2) - (lines.length - 1) * size * 0.55
  // paint layer drawn on a scratch canvas so we can dither the overspray
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H
  const s = c2.getContext('2d')
  s.font = g.font; s.textBaseline = 'middle'; s.textAlign = 'center'
  s.fillStyle = color; s.strokeStyle = color
  s.lineJoin = 'round'; s.lineCap = 'round'
  const tilt = (rnd() - 0.5) * (look === 'tag' ? 0.25 : 0.08)
  s.translate(cx, H / 2); s.rotate(tilt); s.translate(-cx, -H / 2)
  lines.forEach((l, i) => {
    const y = cy0 + i * size * 1.1
    if (look === 'marker' || look === 'chalk' || look === 'dust') { wobblyText(s, l, cx, y, rnd, size * 0.06, 'center') }
    else if (look === 'scratch') {
      s.lineWidth = Math.max(1, size * 0.04)
      s.strokeText(l, cx + (rnd() - 0.5) * 2, y)
    } else if (look === 'tag') {
      s.lineWidth = size * 0.16
      s.strokeStyle = '#121212'
      s.strokeText(l, cx, y)
      s.fillText(l, cx, y)
      s.lineWidth = size * 0.06
      s.beginPath(); s.moveTo(cx - mw * 0.45 * size / (H * 0.82), y + size * 0.55); s.quadraticCurveTo(cx, y + size * 0.85, cx + mw * 0.5 * size / (H * 0.82), y + size * 0.4); s.strokeStyle = color; s.stroke()
    } else {
      s.lineWidth = size * (look === 'stencil' ? 0.02 : 0.05)
      s.fillText(l, cx, y); s.strokeText(l, cx, y)
    }
  })
  if (item.heart) {
    s.setTransform(1, 0, 0, 1, 0, 0)
    s.lineWidth = Math.max(1.5, H * 0.025)
    const hx = W / 2, top = H * 0.2, bot = H * 0.95, hw = W * 0.46
    s.beginPath()
    s.moveTo(hx, bot)
    s.bezierCurveTo(hx - hw * 0.3, bot - H * 0.18, hx - hw * 1.08, H * 0.52, hx - hw * 0.92, H * 0.24)
    s.bezierCurveTo(hx - hw * 0.78, H * 0.02, hx - hw * 0.12, H * 0.02, hx, top)
    s.bezierCurveTo(hx + hw * 0.12, H * 0.02, hx + hw * 0.78, H * 0.02, hx + hw * 0.92, H * 0.24)
    s.bezierCurveTo(hx + hw * 1.08, H * 0.52, hx + hw * 0.3, bot - H * 0.18, hx, bot)
    s.stroke()
  }
  if (item.anarchy) {
    const r = H * 0.4, ax = W * 0.04 + r, ay = H / 2
    s.lineWidth = Math.max(2, r * 0.16)
    s.beginPath(); s.arc(ax, ay, r, 0, Math.PI * 2); s.stroke()
    s.beginPath(); s.moveTo(ax - r * 0.75, ay + r * 0.85); s.lineTo(ax, ay - r * 1.15); s.lineTo(ax + r * 0.75, ay + r * 0.85)
    s.moveTo(ax - r * 0.55, ay + r * 0.15); s.lineTo(ax + r * 0.55, ay + r * 0.15); s.stroke()
  }
  // dither: drips, overspray, chalk dropout
  const img = s.getImageData(0, 0, W, H)
  const d = img.data
  if (look === 'chalk' || look === 'dust' || look === 'scratch') {
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && rnd() < (look === 'chalk' ? 0.35 : 0.2)) d[i] = 0
  }
  if (look === 'spray' || look === 'stencil' || look === 'tag') {
    // overspray speckle around the strokes (only fully opaque pixels survive the sign shader)
    const src = new Uint8Array(W * H)
    for (let i = 0, j = 3; i < src.length; i++, j += 4) src[i] = d[j] > 100 ? 1 : 0
    const rgb = hexRgb(color)
    const R = Math.max(1, Math.round(size * 0.06))
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (src[i]) continue
        // near paint?
        let near = false
        for (let k = 0; k < 4 && !near; k++) {
          const xx = x + Math.round((rnd() - 0.5) * 2 * R), yy = y + Math.round((rnd() - 0.5) * 2 * R)
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && src[yy * W + xx]) near = true
        }
        if (near && rnd() < 0.22) { const j = i * 4; d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255 }
      }
    }
    // drips under heavy strokes
    if (look === 'spray') {
      for (let n = 0; n < 6 + rnd() * 8; n++) {
        const x = Math.floor(rnd() * W)
        let y0 = -1
        for (let y = H - 1; y >= 0; y--) if (src[y * W + x]) { y0 = y; break }
        if (y0 < 0) continue
        const len = Math.floor(size * (0.15 + rnd() * 0.5))
        for (let y = y0; y < Math.min(H, y0 + len); y++) {
          const j = (y * W + x) * 4
          d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255
        }
      }
    }
  }
  s.putImageData(img, 0, 0)
  g.drawImage(c2, 0, 0)
}
function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ---- price tags --------------------------------------------------------------------------------------
export function drawPriceTag(g, W, H, item, o = {}) {
  const rnd = mulberry32(((o.seed ?? 1) * 313 + 3) | 0)
  const promo = item.promo
  g.fillStyle = promo ? '#f3d21a' : '#f1f0ea'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#6b6b6b'; g.lineWidth = Math.max(1, W * 0.01)
  g.strokeRect(0.5, 0.5, W - 1, H - 1)
  const pad = W * 0.05
  g.textBaseline = 'top'
  let y = pad * 0.6
  if (promo) {
    g.fillStyle = '#c4161c'; g.fillRect(0, 0, W, H * 0.24)
    g.fillStyle = '#ffffff'; g.textAlign = 'center'
    fitLine(g, promo, W - pad * 2, H * 0.2, SIGN_FONT)
    g.fillText(promo, W / 2, H * 0.02)
    y = H * 0.27
  }
  g.fillStyle = '#1a1a1a'; g.textAlign = 'left'
  const nfit = fitWrap(g, item.title ?? item.ru, W - pad * 2, H * 0.3, PLAIN_FONT, 'bold', H * 0.14, 3, 1.1)
  for (const l of nfit.lines) { g.fillText(l, pad, y); y += nfit.size * 1.1 }
  // price
  const price = item.price ?? ''
  const unit = item.unit ? `Цена за 1 ${item.unit}` : ''
  g.font = `${Math.max(3, H * 0.09)}px ${PLAIN_FONT}`
  g.fillStyle = '#333'
  g.fillText(unit, pad, H * 0.62)
  g.fillStyle = promo ? '#c4161c' : '#111'
  const ps = fitLine(g, price, W * 0.55, H * 0.36, PLAIN_FONT, 'bold')
  g.textAlign = 'right'
  g.fillText(price, W - pad, H * 0.94 - ps)
  g.textAlign = 'left'
  g.font = `${Math.max(2, H * 0.07)}px ${PLAIN_FONT}`
  g.fillStyle = '#555'
  g.fillText(`${String(10 + Math.floor(rnd() * 3)).padStart(2, '0')}.01.08  Подпись ___`, pad, H * 0.84)
}

// ---- plates, labels, light boxes ----------------------------------------------------------------------
/** Everything rectangular with lettering: shop labels, hours, cards, stickers, plates, metro boxes. */
export function drawPlate(g, W, H, item, o = {}) {
  const rnd = mulberry32(((o.seed ?? 1) * 977 + 5) | 0)
  const look = item.look
  const c = item.colors ?? {}
  const lines = String(item.ru).split('\n')
  g.save()
  if (look === 'lightbox') {
    g.fillStyle = '#e9e9e4'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, W, H * 0.04); g.fillRect(0, H * 0.96, W, H * 0.04)
    // the red М
    const ms = H * 0.62
    g.fillStyle = '#d0201a'
    g.font = `bold ${ms}px ${SIGN_FONT}`
    g.textBaseline = 'middle'; g.textAlign = 'center'
    g.fillText('М', H * 0.5, H / 2 + ms * 0.04)
    g.fillStyle = '#161616'
    g.textAlign = 'left'
    const x0 = H * 1.0
    if (item.list) {
      fitLine(g, lines[0], W - x0 - H * 0.3, H * 0.32, SIGN_FONT)
      g.fillText(lines[0], x0, H * 0.27)
      fitLine(g, item.list.join(' — '), W - x0 - H * 0.3, H * 0.2, SIGN_FONT, '')
      g.fillText(item.list.join(' — '), x0, H * 0.68)
    } else if (item.sub2) {
      fitLine(g, lines[0], W - x0 - H * 0.9, H * 0.4, SIGN_FONT)
      g.fillText(lines[0], x0, H * 0.34)
      fitLine(g, item.sub2, W - x0 - H * 0.9, H * 0.2, SIGN_FONT, '')
      g.fillText(item.sub2, x0, H * 0.72)
    } else {
      fitLine(g, lines[0], W - x0 - H * 0.9, H * 0.48, SIGN_FONT)
      g.fillText(lines[0], x0, H / 2)
    }
    if (!item.list && !/НЕТ/.test(item.ru)) {
      // arrow
      const ax = W - H * 0.55, ay = H / 2, s = H * 0.28
      g.beginPath(); g.moveTo(ax + s, ay); g.lineTo(ax, ay - s * 0.9); g.lineTo(ax, ay - s * 0.35); g.lineTo(ax - s, ay - s * 0.35)
      g.lineTo(ax - s, ay + s * 0.35); g.lineTo(ax, ay + s * 0.35); g.lineTo(ax, ay + s * 0.9); g.closePath(); g.fill()
    }
    g.restore(); return
  }
  if (look === 'rules') {
    g.fillStyle = '#ecebe5'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#3a3a3a'; g.lineWidth = Math.max(1, W * 0.012); g.strokeRect(W * 0.02, W * 0.02, W * 0.96, H - W * 0.04)
    const pad = W * 0.07
    g.fillStyle = '#121212'; g.textAlign = 'center'; g.textBaseline = 'top'
    let y = pad
    const tf = fitWrap(g, item.title ?? '', W - pad * 2, H * 0.16, SIGN_FONT, 'bold', H * 0.06, 3, 1.1)
    for (const l of tf.lines) { g.fillText(l, W / 2, y); y += tf.size * 1.1 }
    y += H * 0.02
    g.textAlign = 'left'
    const bf = fitWrap(g, item.ru, W - pad * 2, H - y - pad, PLAIN_FONT, '', H * 0.04, 2, 1.25)
    for (const l of bf.lines) { g.fillText(l, pad, y); y += bf.size * 1.25 }
    g.restore(); return
  }
  if (look === 'handcard') {
    g.translate(W / 2, H / 2); g.rotate((rnd() - 0.5) * 0.06); g.translate(-W / 2, -H / 2)
    g.fillStyle = rnd() < 0.5 ? '#d9c9a5' : '#ece8dc'
    g.fillRect(W * 0.03, H * 0.04, W * 0.94, H * 0.92)
    g.fillStyle = 'rgba(80,60,30,0.15)'
    for (let i = 0; i < W * H * 0.004; i++) g.fillRect(rnd() * W, rnd() * H, 1, 1)
    g.fillStyle = rnd() < 0.3 ? '#a3141a' : '#161616'
    g.textAlign = 'center'; g.textBaseline = 'top'
    const f = fitWrap(g, item.ru, W * 0.84, H * 0.8, HAND_STACK, 'bold', H * 0.4, 3, 1.15)
    let y = (H - f.lines.length * f.size * 1.15) / 2
    for (const l of f.lines) { wobblyText(g, l, W / 2, y, rnd, f.size * 0.08, 'center'); y += f.size * 1.15 }
    tape(g, W * 0.03, H * 0.04, W * 0.94, H * 0.92, rnd, 'top')
    g.restore(); return
  }
  // generic plates
  let bg = c.bg, fg = c.fg
  if (!bg) {
    if (look === 'label') { bg = '#1f4fa0'; fg = '#ffffff' } else if (look === 'sticker') { bg = item.ru === 'К СЕБЕ' ? '#c4161c' : '#1f6b3a'; fg = '#ffffff' } else if (look === 'hours') { bg = '#f0efe9'; fg = '#1a1a1a' } else { bg = '#f0efe9'; fg = '#1a1a1a' }
  }
  const r = look === 'plate' || look === 'house' || look === 'stop' ? Math.min(W, H) * 0.08 : 0
  rr(g, 0, 0, W, H, r); g.fillStyle = bg; g.fill()
  if (look === 'plate' || look === 'house' || look === 'hours' || look === 'danger' || look === 'hydrant') {
    rr(g, Math.min(W, H) * 0.05, Math.min(W, H) * 0.05, W - Math.min(W, H) * 0.1, H - Math.min(W, H) * 0.1, r * 0.7)
    g.strokeStyle = fg; g.lineWidth = Math.max(1, Math.min(W, H) * (look === 'danger' ? 0.06 : 0.025)); g.stroke()
  }
  g.fillStyle = fg
  g.textAlign = 'center'; g.textBaseline = 'middle'
  let x0 = 0, x1 = W
  if (look === 'danger') {
    // lightning bolt
    const s = H * 0.35, bx = W * 0.2, by = H * 0.5
    g.beginPath(); g.moveTo(bx + s * 0.2, by - s); g.lineTo(bx - s * 0.35, by + s * 0.1); g.lineTo(bx + s * 0.05, by + s * 0.1)
    g.lineTo(bx - s * 0.2, by + s); g.lineTo(bx + s * 0.4, by - s * 0.2); g.lineTo(bx, by - s * 0.2); g.closePath(); g.fill()
    x0 = W * 0.36
  }
  if (look === 'stop') {
    g.beginPath(); g.arc(H * 0.34, H / 2, H * 0.24, 0, Math.PI * 2); g.fillStyle = '#1f9a4a'; g.fill()
    g.fillStyle = '#ffffff'; g.font = `bold ${H * 0.3}px ${SIGN_FONT}`; g.fillText('А', H * 0.34, H / 2 + H * 0.02)
    g.fillStyle = fg
    x0 = H * 0.5
  }
  if (look === 'hydrant') {
    // arrow under the letters
    g.fillRect(W * 0.2, H * 0.78, W * 0.5, H * 0.05)
    g.beginPath(); g.moveTo(W * 0.78, H * 0.805); g.lineTo(W * 0.68, H * 0.72); g.lineTo(W * 0.68, H * 0.89); g.fill()
  }
  const pad = Math.min(W, H) * (look === 'stop' ? 0.08 : 0.14)
  if (lines.length === 1 && lines[0].length > 22 && look !== 'shopsign') {
    // a long one-liner (rules plates): wrap it into a block
    const f = fitWrap(g, lines[0], (x1 - x0) - pad * 2, H - pad * 2, SIGN_FONT, 'bold', H * 0.3, 3, 1.15)
    let yy = H / 2 - (f.lines.length - 1) * f.size * 1.15 / 2
    for (const l of f.lines) { g.fillText(l, (x0 + x1) / 2, yy); yy += f.size * 1.15 }
    g.restore(); return
  }
  const n = lines.length
  const lh = (H - pad * 2) / n
  if (look === 'hydrant') {
    lines.forEach((l, i) => {
      fitLine(g, l, W * 0.6, H * (i ? 0.2 : 0.26), SIGN_FONT, 'bold')
      g.fillText(l, W / 2, H * (0.27 + i * 0.27))
    })
    g.restore(); return
  }
  lines.forEach((l, i) => {
    const big = look === 'house' && i === lines.length - 1
    const maxH = lh * (big ? 0.95 : 0.78)
    const fam = look === 'painted' ? HAND_STACK : SIGN_FONT
    const sz = fitLine(g, l, (x1 - x0) - pad * 2, maxH, fam, 'bold')
    const yy = pad + lh * (i + 0.5)
    if (look === 'painted') wobblyText(g, l, (x0 + x1) / 2, yy, rnd, sz * 0.06, 'center')
    else g.fillText(l, (x0 + x1) / 2, yy)
  })
  g.restore()
}

// ---- dispatch -------------------------------------------------------------------------------------
const NOTICE_LOOKS = new Set(['printed', 'handwritten', 'tearoff', 'official'])
const PLATE_LOOKS = new Set(['label', 'hours', 'handcard', 'sticker', 'plate', 'lightbox', 'rules', 'house', 'stop', 'painted', 'danger', 'hydrant', 'shopsign'])
const GRAFFITI_LOOKS = new Set(['spray', 'marker', 'scratch', 'stencil', 'tag', 'chalk', 'dust'])

/** Pick the renderer for an item by its `look`. */
export function drawItem(g, W, H, item, o = {}) {
  const look = o.look ?? item.look
  const it = o.look ? { ...item, look: o.look } : item
  if (NOTICE_LOOKS.has(look)) return drawNotice(g, W, H, it, o)
  if (look === 'poster' || look === 'flyer') return drawPoster(g, W, H, it, o)
  if (GRAFFITI_LOOKS.has(look)) return drawGraffiti(g, W, H, it, o)
  if (look === 'pricetag') return drawPriceTag(g, W, H, it, o)
  if (PLATE_LOOKS.has(look)) return drawPlate(g, W, H, it, o)
  return drawNotice(g, W, H, { ...it, look: 'printed' }, o)
}

/** Default physical size [w, h] in metres for a look. */
export function defaultSize(item, look = item.look) {
  switch (look) {
    case 'handwritten': return item.paper === 'notebook' || !item.paper ? [0.165, 0.205] : [0.21, 0.15]
    case 'printed': case 'official': return [0.21, 0.297]
    case 'tearoff': return [0.21, 0.297]
    case 'poster': return [0.6, 0.84]
    case 'flyer': return [0.21, 0.297]
    case 'pricetag': return [0.075, 0.05]
    case 'label': return [1.2, 0.22]
    case 'hours': return [0.32, 0.2]
    case 'handcard': return [0.3, 0.17]
    case 'sticker': return [0.22, 0.07]
    case 'plate': return [0.9, 0.24]
    case 'house': return [0.9, 0.5]
    case 'stop': return [0.7, 0.3]
    case 'painted': return [0.6, 0.38]
    case 'danger': return [0.3, 0.2]
    case 'hydrant': return [0.26, 0.2]
    case 'shopsign': return [2.4, 0.5]
    case 'lightbox': return [2.2, 0.42]
    case 'rules': return [0.6, 0.8]
    default: {
      // graffiti: height by look, width by text
      const h = { spray: 0.5, stencil: 0.22, tag: 0.55, marker: 0.14, scratch: 0.07, chalk: 0.3, dust: 0.16 }[look] ?? 0.4
      const maxW = { spray: 2.6, stencil: 1.6, tag: 1.6, marker: 0.9, scratch: 0.45, chalk: 1.4, dust: 0.6 }[look] ?? 2
      let hh = item.small ? h * 0.5 : item.heart ? 0.34 : h
      const a = graffitiAspect({ ...item, look })
      if (hh * a > maxW) hh = maxW / a
      return [hh * a, hh]
    }
  }
}

/** Pixels per metre for a look so textures stay ~100–512 px. */
export function defaultPpm(w, h, look) {
  const target = { pricetag: 110, sticker: 160, poster: 380, flyer: 230, lightbox: 640, rules: 420, label: 360, plate: 300, house: 300, shopsign: 520, spray: 360, tag: 320 }[look] ?? 230
  return Math.max(40, Math.min(1400, target / Math.max(w, h)))
}
