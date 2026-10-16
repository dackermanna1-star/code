// A 1-bit LCD framebuffer (96×68, like a mid-2000s candybar phone) with drawing primitives,
// the bitmap font, and a presenter that paints it onto a canvas as real LCD pixels
// (backlight gradient, pixel shadows on the backplane, contrast, backlight off).

import { glyph, CELL_H, ICONS } from './font.js'

export const LCD_W = 96
export const LCD_H = 68
/** Backlit glass around the pixel matrix, in LCD pixels per side (real LCDs never draw to the edge). */
export const LCD_MARGIN = 2

export class LCD {
  constructor(w = LCD_W, h = LCD_H) {
    this.w = w
    this.h = h
    this.buf = new Uint8Array(w * h)
    this.ink = 1
  }

  clear(v = 0) { this.buf.fill(v) }

  set(x, y, v = 1) {
    x |= 0; y |= 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.buf[y * this.w + x] = v
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.buf[y * this.w + x]
  }

  fillRect(x, y, w, h, v = 1) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0)
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0)
    for (let j = y0; j < y1; j++) this.buf.fill(v, j * this.w + x0, j * this.w + x1)
  }
  rect(x, y, w, h, v = 1) {
    this.hline(x, x + w - 1, y, v); this.hline(x, x + w - 1, y + h - 1, v)
    this.vline(x, y, y + h - 1, v); this.vline(x + w - 1, y, y + h - 1, v)
  }
  /** Rounded-corner frame (1 px corner cut). */
  roundRect(x, y, w, h, v = 1) {
    this.hline(x + 1, x + w - 2, y, v); this.hline(x + 1, x + w - 2, y + h - 1, v)
    this.vline(x, y + 1, y + h - 2, v); this.vline(x + w - 1, y + 1, y + h - 2, v)
  }
  hline(x0, x1, y, v = 1) { for (let x = x0; x <= x1; x++) this.set(x, y, v) }
  vline(x, y0, y1, v = 1) { for (let y = y0; y <= y1; y++) this.set(x, y, v) }
  /** Dotted horizontal line (separators). */
  dots(x0, x1, y, step = 2, v = 1) { for (let x = x0; x <= x1; x += step) this.set(x, y, v) }
  line(x0, y0, x1, y1, v = 1) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, v)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  circle(cx, cy, r, fill = false, v = 1) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y)
        if (fill ? d <= r + 0.3 : Math.abs(d - r) < 0.5) this.set(cx + x, cy + y, v)
      }
    }
  }
  invert(x, y, w, h) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0)
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0)
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.buf[j * this.w + i] ^= 1
  }
  /** Fill pixels in a box where fn(x, y) (local coords) is true. */
  shape(x, y, w, h, fn, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (fn(i, j)) this.set(x + i, y + j, v)
  }
  icon(name, x, y, v = 1) {
    const rows = typeof name === 'string' ? ICONS[name] : name
    if (!rows) return 0
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') this.set(x + i, y + j, v) })
    return rows[0].length
  }

  // ---- text ----------------------------------------------------------------------------------
  /** Width in pixels of a string. font: 'small' | 'bold' | 'big' (2× digits) */
  measure(str, font = 'small') {
    let w = 0
    const s = String(str)
    const k = font === 'big' ? 2 : 1
    for (let i = 0; i < s.length; i++) {
      const g = glyph(s[i])
      w += (g.w + 1 + (font === 'bold' ? 1 : 0)) * k
    }
    return Math.max(0, w - k)
  }

  /**
   * Draw text; (x, y) = top-left of the 10 px cell (caps start at y+1).
   * o: { font, align: 'left'|'center'|'right', v (ink 0/1), clip: [x0, x1] }
   * Returns the drawn width.
   */
  text(str, x, y, o = {}) {
    const s = String(str)
    const font = o.font ?? 'small'
    const v = o.v ?? 1
    const k = font === 'big' ? 2 : 1
    const bold = font === 'bold'
    const w = this.measure(s, font)
    let cx = o.align === 'center' ? Math.round(x - w / 2) : o.align === 'right' ? x - w : x
    const clip0 = o.clip ? o.clip[0] : -1e9, clip1 = o.clip ? o.clip[1] : 1e9
    for (let i = 0; i < s.length; i++) {
      const g = glyph(s[i])
      const px = g.px
      for (let p = 0; p < px.length; p += 2) {
        for (let a = 0; a < k; a++) {
          for (let b = 0; b < k; b++) {
            const X = cx + px[p] * k + a, Y = y + px[p + 1] * k + b
            if (X < clip0 || X > clip1) continue
            this.set(X, Y, v)
            if (bold) this.set(X + 1, Y, v)
          }
        }
      }
      cx += (g.w + 1 + (bold ? 1 : 0)) * k
    }
    return w
  }

  /** Word-wrap a string into lines that fit maxW. Honors '\n'. */
  wrap(str, maxW, font = 'small') {
    const out = []
    for (const para of String(str).split('\n')) {
      const words = para.split(' ')
      let line = ''
      for (const word of words) {
        const cand = line ? line + ' ' + word : word
        if (this.measure(cand, font) <= maxW) { line = cand; continue }
        if (line) out.push(line)
        // break very long words
        let w = word
        while (this.measure(w, font) > maxW) {
          let n = w.length - 1
          while (n > 1 && this.measure(w.slice(0, n) + '-', font) > maxW) n--
          out.push(w.slice(0, n) + '-')
          w = w.slice(n)
        }
        line = w
      }
      out.push(line)
    }
    return out
  }

  /** Text truncated with '..' to fit maxW. */
  fit(str, maxW, font = 'small') {
    let s = String(str)
    if (this.measure(s, font) <= maxW) return s
    while (s.length > 1 && this.measure(s + '..', font) > maxW) s = s.slice(0, -1)
    return s + '..'
  }
}

export const LINE_H = CELL_H

// ---- presentation ------------------------------------------------------------------------------

const PALETTE = {
  lit: { bg0: [176, 201, 118], bg1: [150, 182, 96], ink: [24, 36, 18], shadow: [92, 118, 58] },
  dim: { bg0: [104, 116, 92], bg1: [92, 103, 82], ink: [30, 36, 26], shadow: [76, 86, 66] },
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rgb = (c, a = 1) => a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`

/**
 * Paint the framebuffer onto a 2D canvas context at `px` device pixels per LCD pixel.
 * light: 0 (backlight off) .. 1 (on). contrast: 1..7.
 */
export function presentLCD(lcd, g, px, light, contrast) {
  const m = LCD_MARGIN * px
  const W = lcd.w * px + m * 2, H = lcd.h * px + m * 2
  g.setTransform(1, 0, 0, 1, 0, 0)
  const P = PALETTE
  const bg0 = mix(P.dim.bg0, P.lit.bg0, light), bg1 = mix(P.dim.bg1, P.lit.bg1, light)
  const ink = mix(P.dim.ink, P.lit.ink, light), sh = mix(P.dim.shadow, P.lit.shadow, light)
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, rgb(bg1))
  grad.addColorStop(0.35, rgb(bg0))
  grad.addColorStop(1, rgb(mix(bg0, [205, 222, 150], 0.25 * light)))
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  const gap = px >= 4 ? 1 : 0
  const s = px - gap
  const off = Math.max(1, Math.round(px * 0.35))
  const cAlpha = 0.5 + Math.max(1, Math.min(7, contrast)) * 0.07
  const buf = lcd.buf, w = lcd.w, h = lcd.h
  g.translate(m, m)
  // pixel shadow on the backplane (the classic STN "ghost" offset)
  g.fillStyle = rgb(sh, 0.55 * cAlpha)
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      if (!buf[y * w + x]) { x++; continue }
      let x2 = x
      while (x2 < w && buf[y * w + x2]) x2++
      g.fillRect(x * px + off, y * px + off, (x2 - x) * px - gap, s)
      x = x2
    }
  }
  g.fillStyle = rgb(ink, cAlpha)
  if (gap) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[y * w + x]) g.fillRect(x * px, y * px, s, s)
  } else {
    for (let y = 0; y < h; y++) {
      let x = 0
      while (x < w) {
        if (!buf[y * w + x]) { x++; continue }
        let x2 = x
        while (x2 < w && buf[y * w + x2]) x2++
        g.fillRect(x * px, y * px, (x2 - x) * px, px)
        x = x2
      }
    }
  }
  // faint pixel grid when the pixels are big enough to show it
  if (px >= 3) {
    g.fillStyle = `rgba(0,0,0,${0.035 + 0.02 * light})`
    for (let x = 1; x < w; x++) g.fillRect(x * px - 1, 0, 1, h * px)
    for (let y = 1; y < h; y++) g.fillRect(0, y * px - 1, w * px, 1)
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
}
