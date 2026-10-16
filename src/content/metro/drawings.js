// Canvas painters for the metro's signs, plates, posters and lightboxes. All drawing is
// deterministic (seeded) so the city looks the same on every visit.

import { SIGN_FONT, PLAIN_FONT, SERIF_FONT, HAND_FONT, drawText } from '../../render/Signs.js'
import { RNG } from '../../core/rng.js'

export { SIGN_FONT, PLAIN_FONT, SERIF_FONT, HAND_FONT, drawText }

/** The 2008-era metro «М»: splayed stems meeting low in the middle. */
export function pathM(ctx, x, y, w, h) {
  const P = [[0.06, 0.92], [0.15, 0.08], [0.29, 0.08], [0.5, 0.5], [0.71, 0.08], [0.85, 0.08], [0.94, 0.92],
    [0.77, 0.92], [0.72, 0.36], [0.55, 0.7], [0.45, 0.7], [0.28, 0.36], [0.23, 0.92]]
  ctx.beginPath()
  P.forEach(([u, v], i) => (i ? ctx.lineTo(x + u * w, y + v * h) : ctx.moveTo(x + u * w, y + v * h)))
  ctx.closePath()
}

/** Lightbox face: red М on a warm white field with a thin dark frame. */
export function drawMBox(ctx, W, H) {
  ctx.fillStyle = '#2a2b2c'; ctx.fillRect(0, 0, W, H)
  const b = Math.max(2, Math.round(W * 0.05))
  ctx.fillStyle = '#ece7da'; ctx.fillRect(b, b, W - 2 * b, H - 2 * b)
  ctx.fillStyle = '#c8261c'
  pathM(ctx, W * 0.14, H * 0.14, W * 0.72, H * 0.72)
  ctx.fill()
}

/** Station-name plate under the М. */
export function drawNamePlate(ctx, W, H, name = 'ЗАРЕЧНАЯ') {
  ctx.fillStyle = '#2a2b2c'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#e9e5d8'; ctx.fillRect(2, 2, W - 4, H - 4)
  drawText(ctx, W, H, { lines: [name], color: '#1b1b1b', font: SIGN_FONT, pad: Math.round(H * 0.2) })
}

/** Road sign 5.17.2-style: white figure going down a stair on blue. */
export function drawUnderpassPictogram(ctx, W, H) {
  ctx.fillStyle = '#1d4f9c'; ctx.fillRect(0, 0, W, H)
  const b = Math.round(W * 0.05)
  ctx.strokeStyle = '#eef0f2'; ctx.lineWidth = Math.max(1, b * 0.6)
  ctx.strokeRect(b, b, W - 2 * b, H - 2 * b)
  // inner white field
  const ix = W * 0.16, iy = H * 0.16, iw = W * 0.68, ih = H * 0.68
  ctx.fillStyle = '#eef0f2'; ctx.fillRect(ix, iy, iw, ih)
  ctx.fillStyle = '#1d4f9c'
  // stairs going down to the right
  const n = 4
  ctx.beginPath()
  ctx.moveTo(ix + iw * 0.05, iy + ih * 0.42)
  for (let i = 0; i < n; i++) {
    const x = ix + iw * (0.05 + 0.2 * i), y = iy + ih * (0.42 + 0.13 * i)
    ctx.lineTo(x + iw * 0.2, y); ctx.lineTo(x + iw * 0.2, y + ih * 0.13)
  }
  ctx.lineTo(ix + iw * 0.95, iy + ih * 0.95); ctx.lineTo(ix + iw * 0.05, iy + ih * 0.95)
  ctx.closePath(); ctx.fill()
  // figure stepping down
  const fx = ix + iw * 0.36, fy = iy + ih * 0.12
  ctx.beginPath(); ctx.arc(fx, fy + ih * 0.04, ih * 0.06, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = Math.max(2, iw * 0.07); ctx.lineCap = 'round'; ctx.strokeStyle = '#1d4f9c'
  ctx.beginPath()
  ctx.moveTo(fx, fy + ih * 0.12); ctx.lineTo(fx + iw * 0.04, fy + ih * 0.3) // body
  ctx.moveTo(fx + iw * 0.04, fy + ih * 0.3); ctx.lineTo(fx - iw * 0.04, fy + ih * 0.44) // back leg
  ctx.moveTo(fx + iw * 0.04, fy + ih * 0.3); ctx.lineTo(fx + iw * 0.14, fy + ih * 0.36) // front leg
  ctx.moveTo(fx + iw * 0.01, fy + ih * 0.16); ctx.lineTo(fx - iw * 0.08, fy + ih * 0.26) // arm
  ctx.moveTo(fx + iw * 0.02, fy + ih * 0.16); ctx.lineTo(fx + iw * 0.12, fy + ih * 0.22)
  ctx.stroke()
}

/** Blue text band «ПОДЗЕМНЫЙ ПЕРЕХОД». */
export function drawUnderpassBand(ctx, W, H, lines = ['ПОДЗЕМНЫЙ ПЕРЕХОД']) {
  ctx.fillStyle = '#1d4f9c'; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#e6e8ea'; ctx.lineWidth = Math.max(1, H * 0.06)
  ctx.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16)
  drawText(ctx, W, H, { lines, color: '#f0f1f2', font: SIGN_FONT, pad: Math.round(H * 0.22) })
}

/** «ВХОД В МЕТРО» transom over the vestibule doors (red М left). */
export function drawMetroEntrance(ctx, W, H, text = 'ВХОД В МЕТРО') {
  ctx.fillStyle = '#eae6da'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#c8261c'
  pathM(ctx, H * 0.12, H * 0.12, H * 0.9, H * 0.76); ctx.fill()
  ctx.save(); ctx.translate(H * 1.1, 0)
  drawText(ctx, W - H * 1.2, H, { lines: [text], color: '#1a1a1a', font: SIGN_FONT, pad: Math.round(H * 0.2) })
  ctx.restore()
}

/**
 * 2000s hanging lightbox: white face, black capitals, an arrow and a small line-colour mark.
 * o: { lines: [main, sub?], arrow: 'left'|'right'|'up'|'down'|null, mark: '#hex' }
 */
export function drawLightbox(ctx, W, H, o) {
  ctx.fillStyle = '#e9e8e2'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#5c5f61'; ctx.fillRect(0, 0, W, Math.max(1, H * 0.05)); ctx.fillRect(0, H - Math.max(1, H * 0.05), W, Math.max(1, H * 0.05))
  let x0 = H * 0.15
  if (o.mark) {
    ctx.fillStyle = o.mark
    ctx.beginPath(); ctx.arc(x0 + H * 0.2, H / 2, H * 0.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `bold ${H * 0.26}px ${SIGN_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('М', x0 + H * 0.2, H / 2 + 1)
    x0 += H * 0.55
  }
  const aw = o.arrow ? H * 0.7 : 0
  if (o.arrow) drawArrow(ctx, o.arrow === 'left' ? x0 : W - aw - H * 0.1, H * 0.15, aw, H * 0.7, o.arrow, '#161616')
  const tx = o.arrow === 'left' ? x0 + aw + H * 0.1 : x0
  const tw = W - tx - (o.arrow && o.arrow !== 'left' ? aw + H * 0.2 : H * 0.15)
  ctx.save(); ctx.translate(tx, 0)
  const lines = o.lines
  if (lines.length > 1) {
    drawText(ctx, tw, H * 0.62, { lines: [lines[0]], color: '#141414', font: SIGN_FONT, align: 'left', pad: Math.round(H * 0.1) })
    ctx.translate(0, H * 0.58)
    drawText(ctx, tw, H * 0.36, { lines: [lines[1]], color: '#2b2b2b', font: SIGN_FONT, weight: 'normal', align: 'left', pad: Math.round(H * 0.05) })
  } else drawText(ctx, tw, H, { lines, color: '#141414', font: SIGN_FONT, align: 'left', pad: Math.round(H * 0.2) })
  ctx.restore()
}

export function drawArrow(ctx, x, y, w, h, dir, color) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] ?? 0)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(w * 0.45, 0); ctx.lineTo(0, -h * 0.42); ctx.lineTo(0, -h * 0.16); ctx.lineTo(-w * 0.45, -h * 0.16)
  ctx.lineTo(-w * 0.45, h * 0.16); ctx.lineTo(0, h * 0.16); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** Metal capitals mounted on the track wall (transparent background). */
export function drawWallLetters(ctx, W, H, text) {
  ctx.clearRect(0, 0, W, H)
  const size = H * 0.86
  ctx.font = `bold ${size}px ${SIGN_FONT}`
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
  // spread the letters over the width like individually mounted capitals
  const chars = [...text]
  const step = W / chars.length
  chars.forEach((c, i) => {
    const cx = step * (i + 0.5)
    ctx.fillStyle = 'rgba(40,34,26,0.9)'; ctx.fillText(c, cx + 2, H / 2 + 2) // shadow on the tiles
    ctx.fillStyle = '#b9b49f'; ctx.fillText(c, cx, H / 2)
    ctx.fillStyle = 'rgba(255,250,235,0.35)'; ctx.fillText(c, cx - 1, H / 2 - 1)
    ctx.fillStyle = '#a19b86'; ctx.fillText(c, cx, H / 2 + 1)
  })
}

/** A printed poster / ad: o = { bg, title, lines, accent, foot, seed } */
export function drawPoster(ctx, W, H, o) {
  const r = new RNG(o.seed ?? 7)
  ctx.fillStyle = o.bg ?? '#ddd6c4'; ctx.fillRect(0, 0, W, H)
  if (o.band) { ctx.fillStyle = o.band; ctx.fillRect(0, 0, W, H * 0.28) }
  ctx.save()
  drawText(ctx, W, H * 0.28, { lines: [o.title], color: o.titleColor ?? '#f2efe6', font: SIGN_FONT, pad: Math.round(H * 0.04) })
  ctx.restore()
  if (o.art) o.art(ctx, W, H, r)
  ctx.save(); ctx.translate(0, H * 0.3)
  drawText(ctx, W, H * 0.5, { lines: o.lines, color: o.color ?? '#202020', font: o.font ?? PLAIN_FONT, weight: o.weight ?? 'bold', pad: Math.round(W * 0.06), lineGap: 0.25 })
  ctx.restore()
  if (o.foot) {
    ctx.save(); ctx.translate(0, H * 0.82)
    drawText(ctx, W, H * 0.16, { lines: [o.foot], color: o.accent ?? '#8a1f18', font: SIGN_FONT, pad: Math.round(H * 0.02) })
    ctx.restore()
  }
}

/** Plain paper notice: title + lines, typed. */
export function drawNotice(ctx, W, H, o) {
  ctx.fillStyle = o.bg ?? '#e3dfd2'; ctx.fillRect(0, 0, W, H)
  ctx.save()
  drawText(ctx, W, H * 0.22, { lines: [o.title], color: '#151515', font: PLAIN_FONT, pad: Math.round(H * 0.04) })
  ctx.translate(0, H * 0.22)
  drawText(ctx, W, H * 0.74, { lines: o.lines, color: '#262626', font: o.font ?? PLAIN_FONT, weight: 'normal', pad: Math.round(W * 0.08), lineGap: 0.3 })
  ctx.restore()
}

/** Hand-written card (kiosk prices, «АРЕНДА», «Закрыто»). */
export function drawCard(ctx, W, H, o) {
  ctx.fillStyle = o.bg ?? '#e7e2cf'; ctx.fillRect(0, 0, W, H)
  drawText(ctx, W, H, { lines: o.lines, color: o.color ?? '#1d2a6e', font: HAND_FONT, weight: 'bold', pad: Math.round(H * 0.08), lineGap: 0.15 })
}

/** Tear-off advert («Сдаётся комната» with phone-number tabs). */
export function drawTearOff(ctx, W, H, o) {
  ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, W, H * 0.7)
  drawText(ctx, W, H * 0.7, { lines: o.lines, color: '#1c1c1c', font: o.hand ? HAND_FONT : PLAIN_FONT, weight: 'bold', pad: Math.round(W * 0.07), lineGap: 0.2 })
  const n = 7
  for (let i = 0; i < n; i++) {
    if (o.torn && o.torn.includes(i)) continue
    const x = (W / n) * i
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(x + 1, H * 0.7, W / n - 2, H * 0.3)
    ctx.save(); ctx.translate(x + W / n / 2, H * 0.85); ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#222'; ctx.font = `${Math.max(6, W / n * 0.42)}px ${PLAIN_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(o.phone, 0, 0)
    ctx.restore()
  }
}

/** Fare board «СТОИМОСТЬ ПРОЕЗДА» (1 Jan 2008 fares). */
export function drawFares(ctx, W, H) {
  ctx.fillStyle = '#e5e3da'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#23417a'; ctx.fillRect(0, 0, W, H * 0.16)
  drawText(ctx, W, H * 0.16, { lines: ['СТОИМОСТЬ ПРОЕЗДА'], color: '#f2f2ee', font: SIGN_FONT, pad: Math.round(H * 0.025) })
  const rows = FARES
  const top = H * 0.2, rh = (H * 0.72) / rows.length
  ctx.font = `bold ${rh * 0.6}px ${PLAIN_FONT}`
  ctx.textBaseline = 'middle'
  rows.forEach(([a, b], i) => {
    const y = top + rh * (i + 0.5)
    ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'left'; ctx.fillText(a, W * 0.07, y)
    ctx.textAlign = 'right'; ctx.fillText(b, W * 0.93, y)
    ctx.fillStyle = '#b9b5aa'; ctx.fillRect(W * 0.07, y + rh * 0.45, W * 0.86, 1)
  })
  ctx.fillStyle = '#555'; ctx.font = `${H * 0.035}px ${PLAIN_FONT}`; ctx.textAlign = 'center'
  ctx.fillText('с 1 января 2008 г.', W / 2, H * 0.95)
}

export const FARES = [
  ['1 поездка', '19 р.'], ['2 поездки', '38 р.'], ['5 поездок', '84 р.'], ['10 поездок', '155 р.'],
  ['20 поездок', '280 р.'], ['60 поездок', '580 р.'], ['Месячный, 70 поездок', '600 р.'], ['Месячный, без огранич.', '860 р.'],
]

/** Fictional line map («СХЕМА ЛИНИЙ»): our line plus a few others, rings and dots. */
export function drawLineMap(ctx, W, H) {
  ctx.fillStyle = '#efede6'; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#b8b4a8'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, W - 4, H - 4)
  ctx.fillStyle = '#1f1f1f'; ctx.font = `bold ${H * 0.07}px ${SIGN_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('СХЕМА ЛИНИЙ МЕТРОПОЛИТЕНА', W * 0.04, H * 0.04)
  const cx = W * 0.52, cy = H * 0.56
  // ring
  ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = H * 0.022
  ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.16, H * 0.2, 0, 0, Math.PI * 2); ctx.stroke()
  const lines = [
    ['#c8261c', [[0.08, 0.95], [0.3, 0.75], [0.52, 0.56], [0.74, 0.36], [0.95, 0.2]]],
    ['#2c8a3e', [[0.1, 0.25], [0.35, 0.4], [0.52, 0.56], [0.7, 0.7], [0.92, 0.92]]],
    ['#2650a8', [[0.05, 0.56], [0.3, 0.58], [0.52, 0.56], [0.75, 0.55], [0.97, 0.6]]],
    ['#d07a1c', [[0.52, 0.18], [0.5, 0.4], [0.52, 0.56], [0.56, 0.75], [0.6, 0.97]]],
  ]
  for (const [col, pts] of lines) {
    ctx.strokeStyle = col; ctx.lineWidth = H * 0.018
    ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(u * W, v * H) : ctx.moveTo(u * W, v * H))); ctx.stroke()
    ctx.fillStyle = '#fff'
    for (const [u, v] of pts) { ctx.beginPath(); ctx.arc(u * W, v * H, H * 0.012, 0, Math.PI * 2); ctx.fill() }
  }
  // «Заречная» — the terminus at the bottom-left end of the red line, with a «вы здесь» dot
  ctx.fillStyle = '#c8261c'; ctx.beginPath(); ctx.arc(0.08 * W, 0.95 * H, H * 0.022, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#1f1f1f'; ctx.font = `bold ${H * 0.045}px ${PLAIN_FONT}`; ctx.textBaseline = 'bottom'
  ctx.fillText('Заречная', 0.11 * W, 0.94 * H)
  ctx.font = `${H * 0.034}px ${PLAIN_FONT}`; ctx.fillStyle = '#555'
  ctx.fillText('Улица Строителей', 0.25 * W, 0.8 * H)
  ctx.fillText('Молодёжная', 0.38 * W, 0.7 * H)
  ctx.fillText('Площадь Труда', 0.55 * W, 0.53 * H)
}
