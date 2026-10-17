// Crisp text for the 960×540 UI buffer.
//
// Canvas fillText anti-aliases, which smears pixel fonts. We rasterise each glyph (or each static
// run of text) once into a small canvas, snap its alpha to 0/255 ("crisp"), then blit it at integer
// positions. Glyph-by-glyph drawing also gives us per-letter effects (typewriter fades, shake,
// colour spans) for free. Handwriting faces may opt out of the alpha snap (crisp: false).

const MEASURE = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

/** Snap alpha (crisp) and whiten rgb so the raster can be tinted with 'source-in'. */
function whitenAlpha(c, crisp, thr) {
  const x = c.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const t = thr * 255;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    d[i] = d[i + 1] = d[i + 2] = 255;
    if (crisp) d[i + 3] = a >= t ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
}

function tint(src, color) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const RUN_CACHE_MAX = 900;

export class BitmapFont {
  /**
   * @param {object} o
   *  family, size (px), weight, italic, crisp (snap alpha), threshold (0..1),
   *  lineHeight (px), tracking (extra px per glyph), skew (synthetic slant, e.g. -0.18)
   */
  constructor(o) {
    this.family = o.family; this.size = o.size; this.weight = o.weight || 400;
    this.italic = !!o.italic; this.crisp = o.crisp !== false; this.threshold = o.threshold ?? 0.5;
    this.tracking = o.tracking || 0; this.skew = o.skew || 0;
    this.pixelItalic = o.pixelItalic || 0; // pixel-step slant (px per band), keeps the dot grid intact
    this.css = `${this.italic ? 'italic ' : ''}${this.weight} ${this.size}px "${this.family}"`;
    MEASURE.font = this.css;
    const m = MEASURE.measureText('Hgjy|ÉQ');
    this.ascent = Math.ceil(m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? this.size * 0.8);
    this.descent = Math.ceil(m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? this.size * 0.2);
    this.lineHeight = o.lineHeight || Math.round((this.ascent + this.descent) * 1.08);
    this.capHeight = Math.ceil(MEASURE.measureText('H').actualBoundingBoxAscent || this.size * 0.7);
    this.pad = Math.ceil(this.size * 0.35) + Math.ceil(Math.abs(this.skew) * this.size);
    this._adv = new Map();
    this._glyphs = new Map();
    this._runs = new Map();
    this._runW = new Map();
  }

  /** Advance of one glyph (fractional; positions are rounded at draw time). */
  adv(ch) {
    let a = this._adv.get(ch);
    if (a === undefined) {
      MEASURE.font = this.css;
      a = MEASURE.measureText(ch).width + this.tracking;
      this._adv.set(ch, a);
    }
    return a;
  }

  /** Width of a string drawn glyph-by-glyph. */
  gwidth(str) { let w = 0; for (const ch of str) w += this.adv(ch); return w; }

  /** Width of a string drawn as one run (with kerning). */
  width(str) {
    str = String(str);
    let w = this._runW.get(str);
    if (w === undefined) {
      MEASURE.font = this.css;
      w = Math.ceil(MEASURE.measureText(str).width + this.tracking * str.length);
      if (this._runW.size > 2000) this._runW.clear();
      this._runW.set(str, w);
    }
    return w;
  }

  _raster(str, w) {
    const p = this.pad;
    const c = makeCanvas(Math.ceil(w) + p * 2, this.ascent + this.descent + p * 2);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = this.css;
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#fff';
    if (this.skew) x.setTransform(1, 0, this.skew, 1, -this.skew * (p + this.ascent), 0);
    if (this.tracking) {
      let cx = p;
      for (const ch of str) { x.fillText(ch, cx, p + this.ascent); cx += this.adv(ch); }
    } else {
      x.fillText(str, p, p + this.ascent);
    }
    whitenAlpha(c, this.crisp, this.threshold);
    return this.pixelItalic ? this._shear(c) : c;
  }

  /** Pixel italic: shift horizontal bands right by whole steps toward the top (no resampling). */
  _shear(src) {
    const out = makeCanvas(src.width, src.height);
    const x = out.getContext('2d');
    const step = this.pixelItalic;
    const base = this.pad + this.ascent;
    const band = Math.max(2, Math.round(this.capHeight / 3 / step) * step);
    for (let y = 0; y < src.height; y += 1) {
      const shift = y < base ? Math.floor((base - 1 - y) / band) * step : 0; // descenders stay put
      x.drawImage(src, 0, y, src.width, 1, shift, y, src.width, 1);
    }
    return out;
  }

  _glyph(ch) {
    let g = this._glyphs.get(ch);
    if (!g) {
      g = { base: this._raster(ch, this.adv(ch)), tints: new Map() };
      this._glyphs.set(ch, g);
    }
    return g;
  }

  /** Draw one glyph with its top-left (line box top) at (x, y). */
  glyph(ctx, ch, x, y, color, alpha = 1) {
    if (ch === ' ' || alpha <= 0) return;
    const g = this._glyph(ch);
    let c = g.tints.get(color);
    if (!c) { c = tint(g.base, color); g.tints.set(color, c); }
    if (alpha < 1) { const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha; ctx.drawImage(c, Math.round(x) - this.pad, Math.round(y) - this.pad); ctx.globalAlpha = a; }
    else ctx.drawImage(c, Math.round(x) - this.pad, Math.round(y) - this.pad);
  }

  /** Draw a whole run (cached raster, kerning preserved). align: 'left' | 'center' | 'right'. Returns width. */
  draw(ctx, str, x, y, color, { align = 'left', alpha = 1 } = {}) {
    str = String(str);
    if (!str) return 0;
    const key = str + '\u0000' + color;
    let c = this._runs.get(key);
    if (!c) {
      const base = this._raster(str, this.width(str));
      c = tint(base, color);
      if (this._runs.size >= RUN_CACHE_MAX) this._runs.delete(this._runs.keys().next().value);
      this._runs.set(key, c);
    } else {
      // LRU refresh
      this._runs.delete(key); this._runs.set(key, c);
    }
    const w = this.width(str);
    let dx = x;
    if (align === 'center') dx = x - w / 2;
    else if (align === 'right') dx = x - w;
    const a0 = ctx.globalAlpha;
    if (alpha < 1) ctx.globalAlpha = a0 * alpha;
    ctx.drawImage(c, Math.round(dx) - this.pad, Math.round(y) - this.pad);
    ctx.globalAlpha = a0;
    return w;
  }

  /** Word-wrap plain text to lines no wider than maxW (run widths). Honors '\n'. */
  wrap(str, maxW) {
    const out = [];
    for (const para of String(str).split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (line && this.width(t) > maxW) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
}

// ---- font registry ---------------------------------------------------------------------------
const fonts = new Map();
/** Get (and cache) a BitmapFont for a spec object. */
export function font(spec) {
  const key = JSON.stringify(spec);
  let f = fonts.get(key);
  if (!f) { f = new BitmapFont(spec); fonts.set(key, f); }
  return f;
}
/** Drop every cached raster (e.g. if fonts finished loading late). */
export function resetFonts() { fonts.clear(); }

// ---- dialogue markup -------------------------------------------------------------------------
// {p} {p=1.2}  *emphasis*  {shake}..{/shake}  {slow}..{/slow}  {red}..{/red}  {dim}..{/dim}
export const S_EM = 1, S_SHAKE = 2, S_SLOW = 4, S_RED = 8, S_DIM = 16;
const TAGS = { shake: S_SHAKE, slow: S_SLOW, red: S_RED, dim: S_DIM };

/** Parse markup into tokens: { ch, s } glyphs, { pause } and { br }. */
export function parseMarkup(text) {
  const out = [];
  let s = 0;
  const str = String(text ?? '');
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '{') {
      const j = str.indexOf('}', i);
      if (j > i) {
        const tag = str.slice(i + 1, j).trim();
        const m = tag.match(/^p(?:=([\d.]+))?$/);
        if (m) { out.push({ pause: m[1] ? parseFloat(m[1]) : 0.4 }); i = j; continue; }
        const close = tag.startsWith('/');
        const bit = TAGS[close ? tag.slice(1) : tag];
        if (bit) { s = close ? (s & ~bit) : (s | bit); i = j; continue; }
      }
    }
    if (c === '*') { s ^= S_EM; continue; }
    if (c === '\n') { out.push({ br: true }); continue; }
    out.push({ ch: c, s });
  }
  return out;
}

/** Strip all markup (for measuring / plain display). */
export const plainText = (text) => parseMarkup(text).map((t) => t.ch ?? (t.br ? '\n' : '')).join('');

/**
 * Lay out markup tokens into lines of positioned glyphs.
 * fontFor(styleBits) → BitmapFont. Returns { lines: [{ glyphs: [{ ch, s, x, f, pause }], w }] }.
 * Pauses attach to the next glyph (pauseBefore) so the typewriter can honour them.
 */
export function layoutMarkup(tokens, fontFor, maxW) {
  // group into words (runs of non-space glyphs), spaces and breaks
  const items = [];
  let word = null, pending = 0;
  const flush = () => { if (word) { items.push(word); word = null; } };
  for (const t of tokens) {
    if (t.pause !== undefined) { pending += t.pause; continue; }
    if (t.br) { flush(); items.push({ br: true }); continue; }
    const g = { ch: t.ch, s: t.s, f: fontFor(t.s), pause: pending };
    pending = 0;
    if (t.ch === ' ') { flush(); items.push({ space: g }); continue; }
    if (!word) word = { glyphs: [], w: 0 };
    word.glyphs.push(g); word.w += g.f.adv(g.ch);
  }
  flush();
  if (pending && items.length) items.push({ tailPause: pending });

  const lines = [];
  let line = { glyphs: [], w: 0 };
  let pendingSpace = null;
  const newLine = () => { lines.push(line); line = { glyphs: [], w: 0 }; pendingSpace = null; };
  for (const it of items) {
    if (it.br) { newLine(); continue; }
    if (it.tailPause) { line.tailPause = it.tailPause; continue; }
    if (it.space) { if (line.glyphs.length) pendingSpace = it.space; continue; }
    const sw = pendingSpace ? pendingSpace.f.adv(' ') : 0;
    if (line.glyphs.length && line.w + sw + it.w > maxW) {
      // carry a pause that sat on the dropped space onto the word's first glyph
      if (pendingSpace?.pause) it.glyphs[0].pause += pendingSpace.pause;
      newLine();
    } else if (pendingSpace) {
      pendingSpace.x = line.w; line.glyphs.push(pendingSpace); line.w += sw; pendingSpace = null;
    }
    for (const g of it.glyphs) { g.x = line.w; line.glyphs.push(g); line.w += g.f.adv(g.ch); }
  }
  if (line.glyphs.length || !lines.length) lines.push(line);
  return { lines };
}
