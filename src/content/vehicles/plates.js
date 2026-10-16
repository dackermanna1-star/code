// Russian licence plates (2008 format) and route boards, drawn on canvases.
//   civil:  «А 123 ВС | 77 RUS ▭» white, black characters, region box with the tricolour
//   route:  yellow «АВ 123 | 77» for buses, trolleybuses, marshrutkas and taxis
// Only the 12 Cyrillic letters that look like Latin ones are used: А В Е К М Н О Р С Т У Х.

import { SIGN_FONT, PLAIN_FONT } from '../../render/Signs.js'

const LETTERS = 'АВЕКМНОРСТУХ'
const REGIONS = ['77', '77', '77', '97', '99', '99', '177', '50', '90', '150', '77', '97']

/** A random plate. kind: 'civil' | 'route'. */
export function makePlate(rng, kind = 'civil') {
  const L = () => LETTERS[rng.int(0, LETTERS.length - 1)]
  const num = String(rng.int(1, 999)).padStart(3, '0')
  const region = kind === 'route' ? (rng.chance(0.85) ? '77' : '99') : REGIONS[rng.int(0, REGIONS.length - 1)]
  if (kind === 'route') return { kind, text: `${L()}${L()} ${num}`, region }
  return { kind, text: `${L()} ${num} ${L()}${L()}`, region }
}

/** Plate as plain text (for captions / registry). */
export function plateString(p) { return `${p.text} ${p.region}${p.kind === 'civil' ? ' RUS' : ''}` }

/** Draw a plate onto a canvas of size W×H (aspect ≈ 520:112). opts.dirt 0..1 */
export function drawPlate(c, W, H, p, opts = {}) {
  const yellow = p.kind === 'route'
  c.fillStyle = yellow ? '#d9ae22' : '#e9e8e0'
  c.fillRect(0, 0, W, H)
  const bw = Math.max(1, Math.round(H * 0.06))
  c.strokeStyle = '#151515'
  c.lineWidth = bw
  c.strokeRect(bw / 2, bw / 2, W - bw, H - bw)
  const split = Math.round(W * 0.77)
  c.fillStyle = '#151515'
  c.fillRect(split, 0, bw, H)
  // main characters: letters smaller than digits, as on the real plate
  c.textBaseline = 'alphabetic'
  c.textAlign = 'center'
  const parts = p.kind === 'civil' ? [p.text[0], p.text.slice(2, 5), p.text.slice(6)] : [p.text.slice(0, 2), p.text.slice(3)]
  const big = H * 0.78, small = H * 0.6
  const widths = parts.map((s, i) => {
    const digits = /\d/.test(s)
    c.font = `bold ${digits ? big : small}px ${PLAIN_FONT}`
    return c.measureText(s).width
  })
  const gap = H * 0.14
  const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)
  const avail = split - bw * 3
  const k = Math.min(1, avail / total)
  let x = bw * 1.5 + (avail - total * k) / 2
  parts.forEach((s, i) => {
    const digits = /\d/.test(s)
    c.save()
    c.translate(x + widths[i] * k / 2, H * 0.84)
    c.scale(k, 1)
    c.font = `bold ${digits ? big : small}px ${PLAIN_FONT}`
    c.fillText(s, 0, 0)
    c.restore()
    x += (widths[i] + gap) * k
  })
  // region box
  const rx = split + bw, rw = W - rx - bw
  c.font = `bold ${H * (p.kind === 'civil' ? 0.5 : 0.62)}px ${PLAIN_FONT}`
  c.save()
  const rwid = c.measureText(p.region).width
  const rk = Math.min(1, (rw * 0.9) / rwid)
  c.translate(rx + rw / 2, p.kind === 'civil' ? H * 0.56 : H * 0.8)
  c.scale(rk, 1)
  c.fillText(p.region, 0, 0)
  c.restore()
  if (p.kind === 'civil') {
    c.font = `bold ${H * 0.2}px ${PLAIN_FONT}`
    c.fillText('RUS', rx + rw * 0.36, H * 0.86)
    const fx = rx + rw * 0.66, fw = rw * 0.24, fh = H * 0.21, fy = H * 0.67
    c.fillStyle = '#f0f0f0'; c.fillRect(fx, fy, fw, fh / 3)
    c.fillStyle = '#0039a6'; c.fillRect(fx, fy + fh / 3, fw, fh / 3)
    c.fillStyle = '#d52b1e'; c.fillRect(fx, fy + 2 * fh / 3, fw, fh / 3)
  }
  // winter grime: slush spatter from the bottom, a little salt
  const dirt = opts.dirt ?? 0.4
  if (dirt > 0) {
    let s = (opts.seed ?? 7) * 9301 + 49297
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < W * H * 0.05 * dirt; i++) {
      const yy = H * (1 - Math.pow(r(), 1.8))
      c.fillStyle = `rgba(${70 + r() * 30},${62 + r() * 25},${50 + r() * 20},${0.2 + r() * 0.45 * dirt})`
      c.fillRect(r() * W, yy, 1 + r() * 2, 1 + r() * 2)
    }
  }
}

/**
 * Route board (маршрутный указатель): number + terminal names. o: { num, kind: 'bus'|'trolleybus'|'taxi',
 * from, to, led (orange LED look), via }
 */
export function drawRouteBoard(c, W, H, o) {
  if (o.led) {
    c.fillStyle = '#16120c'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#ff9a2a'
  } else {
    c.fillStyle = '#e4e2d6'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#121212'
  }
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  const numW = Math.min(W * 0.26, H * 1.6)
  c.font = `bold ${H * 0.8}px ${SIGN_FONT}`
  const nw = c.measureText(o.num).width
  c.save()
  c.translate(numW / 2, H * 0.54)
  c.scale(Math.min(1, (numW * 0.9) / nw), 1)
  c.fillText(o.num, 0, 0)
  c.restore()
  if (!o.led) { c.fillStyle = '#121212'; c.fillRect(numW, H * 0.08, Math.max(1, H * 0.04), H * 0.84) }
  const lines = [o.from, o.to].filter(Boolean)
  const lh = H / (lines.length + 0.4)
  c.font = `bold ${lh * 0.72}px ${SIGN_FONT}`
  lines.forEach((t, i) => {
    const tw = c.measureText(t).width
    const avail = W - numW - H * 0.2
    c.save()
    c.translate(numW + H * 0.1 + avail / 2, lh * (i + 0.7))
    c.scale(Math.min(1, avail / tw), 1)
    c.fillText(t, 0, 0)
    c.restore()
  })
  if (o.led) {
    // LED dot matrix: darken a grid
    c.fillStyle = 'rgba(10,8,6,0.55)'
    const st = Math.max(2, Math.round(H / 12))
    for (let x = 0; x < W; x += st) c.fillRect(x, 0, 1, H)
    for (let y = 0; y < H; y += st) c.fillRect(0, y, W, 1)
  }
}

/** Big painted numerals (fleet numbers, «ЭР2-1048»), optionally on a coloured field. */
export function drawPainted(c, W, H, text, o = {}) {
  if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H) }
  c.fillStyle = o.color ?? '#e6e2d4'
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  c.font = `bold ${H * 0.82}px ${o.font ?? SIGN_FONT}`
  const tw = c.measureText(text).width
  c.save()
  c.translate(W / 2, H * 0.55)
  c.scale(Math.min(1, (W * 0.94) / tw), 1)
  c.fillText(text, 0, 0)
  c.restore()
}

// ---- route data (fictional microdistrict «Восточный», metro «Заречная») ----------------------

export const ROUTES = {
  trolleybus: [
    { num: '41', from: 'Ст. м. «Заречная»', to: 'Мкр. «Восточный»' },
    { num: '63', from: 'Ул. Берёзовая', to: 'Платформа «Заводская»' },
  ],
  bus: [
    { num: '648', from: 'Ст. м. «Заречная»', to: '9-й микрорайон' },
    { num: '276', from: 'Мкр. «Восточный»', to: 'Платформа «Заводская»' },
    { num: '613', from: 'Ст. м. «Заречная»', to: 'Ул. Заводская' },
  ],
  taxi: [
    { num: '512м', from: 'М. «Заречная»', to: 'ул. Строителей — ДК' },
    { num: '139м', from: 'Мкр. «Восточный»', to: 'Рынок' },
  ],
}
/** English glosses for the catalog / captions. */
export const ROUTE_EN = {
  'Ст. м. «Заречная»': 'Zarechnaya metro station', 'Мкр. «Восточный»': 'Vostochny microdistrict',
  'Ул. Берёзовая': 'Beryozovaya Street', 'Платформа «Заводская»': 'Zavodskaya railway platform',
  '9-й микрорайон': '9th microdistrict', 'Ул. Заводская': 'Zavodskaya Street', 'М. «Заречная»': 'Zarechnaya metro',
  'ул. Строителей — ДК': 'Stroiteley St — House of Culture', 'Рынок': 'Market',
}
