// Raw RGBA pixel buffers for procedural pixel art (UI icons, wand sprites, ...).
// Pure TypeScript so everything can be generated and tested in Node; only toCanvas/toDataURL need a DOM.

export type RGBA = readonly [number, number, number, number];
/** '#rgb', '#rgba', '#rrggbb', '#rrggbbaa', 'transparent', or an [r, g, b, a] tuple (0..255). */
export type ColorLike = string | RGBA;

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const colorCache = new Map<string, RGBA>();

export function parseColor(c: ColorLike): RGBA {
  if (typeof c !== 'string') return c;
  const hit = colorCache.get(c);
  if (hit) return hit;
  let out: RGBA;
  if (c === 'transparent' || c === 'none' || c === '') out = TRANSPARENT;
  else {
    let s = c.charAt(0) === '#' ? c.slice(1) : c;
    if (s.length === 3 || s.length === 4) s = s.replace(/./g, (ch) => ch + ch);
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) throw new Error(`pixels: bad colour "${c}"`);
    const v = parseInt(s.slice(0, 6), 16);
    const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255;
    out = [(v >> 16) & 255, (v >> 8) & 255, v & 255, a];
  }
  colorCache.set(c, out);
  return out;
}

function hex2(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return (v < 16 ? '0' : '') + v.toString(16);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + hex2(r) + hex2(g) + hex2(b);
}

/** Linear mix of two colours (t = 0 -> a, t = 1 -> b), returned as '#rrggbb'. */
export function mixHex(a: ColorLike, b: ColorLike, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

export function lighten(c: ColorLike, t: number): string {
  return mixHex(c, '#ffffff', t);
}

export function darken(c: ColorLike, t: number): string {
  return mixHex(c, '#000000', t);
}

/** Same colour with a new alpha (0..1). */
export function withAlpha(c: ColorLike, a: number): RGBA {
  const p = parseColor(c);
  return [p[0], p[1], p[2], Math.max(0, Math.min(255, Math.round(a * 255)))];
}

/** HSL (h in degrees, s/l in 0..1) to '#rrggbb'. */
export function hslHex(h: number, s: number, l: number): string {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/** Relative luminance-ish brightness 0..1 (cheap, for tests / contrast decisions). */
export function brightness(c: ColorLike): number {
  const p = parseColor(c);
  return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
}

export class PixelImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number, fill?: ColorLike) {
    this.w = Math.max(1, Math.floor(w));
    this.h = Math.max(1, Math.floor(h));
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
    if (fill !== undefined) this.fillRect(0, 0, this.w, this.h, fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Overwrites one pixel (alpha included). Out-of-bounds writes are ignored. */
  set(x: number, y: number, c: ColorLike): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return this;
    const p = parseColor(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = p[0];
    this.data[i + 1] = p[1];
    this.data[i + 2] = p[2];
    this.data[i + 3] = p[3];
    return this;
  }

  /** Alpha-composites a colour over one pixel ("source over"). */
  blend(x: number, y: number, c: ColorLike): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return this;
    const p = parseColor(c);
    const sa = p[3] / 255;
    if (sa <= 0) return this;
    if (sa >= 1) return this.set(x, y, p);
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) d[i + k] = (p[k] * sa + d[i + k] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
    return this;
  }

  /** [r, g, b, a]; transparent black outside the image. */
  get(x: number, y: number): RGBA {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return TRANSPARENT;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  /** '#rrggbb' of a pixel, or null when fully transparent / out of bounds. */
  getHex(x: number, y: number): string | null {
    const p = this.get(x, y);
    return p[3] === 0 ? null : rgbToHex(p[0], p[1], p[2]);
  }

  alphaAt(x: number, y: number): number {
    return this.get(x, y)[3];
  }

  isOpaque(x: number, y: number): boolean {
    return this.alphaAt(x, y) > 0;
  }

  clear(): this {
    this.data.fill(0);
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number, c: ColorLike): this {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    const p = parseColor(c);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, p);
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number, c: ColorLike): this {
    this.fillRect(x, y, w, 1, c);
    this.fillRect(x, y + h - 1, w, 1, c);
    this.fillRect(x, y, 1, h, c);
    this.fillRect(x + w - 1, y, 1, h, c);
    return this;
  }

  /** Bresenham line, both end points included. */
  line(x0: number, y0: number, x1: number, y1: number, c: ColorLike): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const p = parseColor(c);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, p);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /**
   * Pixel-art circle. Pixel centres sit on integer coordinates; use a .5 centre for even diameters.
   * filled=false draws a 1px ring.
   */
  circle(cx: number, cy: number, r: number, c: ColorLike, filled = true): this {
    return this.ellipse(cx, cy, r, r, c, filled);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: ColorLike, filled = true): this {
    const p = parseColor(c);
    const inside = (x: number, y: number, ax: number, ay: number) => {
      if (ax <= 0 || ay <= 0) return false;
      const dx = (x - cx) / (ax + 0.4);
      const dy = (y - cy) / (ay + 0.4);
      return dx * dx + dy * dy < 0.999;
    };
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y, rx, ry)) continue;
        if (!filled) {
          // keep only pixels with a 4-neighbour outside the shape
          if (inside(x + 1, y, rx, ry) && inside(x - 1, y, rx, ry) && inside(x, y + 1, rx, ry) && inside(x, y - 1, rx, ry))
            continue;
        }
        this.set(x, y, p);
      }
    return this;
  }

  /** Even-odd scanline polygon fill (pixel centres). */
  fillPolygon(pts: ReadonlyArray<readonly [number, number]>, c: ColorLike): this {
    if (pts.length < 3) return this;
    const p = parseColor(c);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const yc = y + 0.001;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if (ay <= yc !== by <= yc) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] + 0.5); x++) this.set(x, y, p);
    }
    return this;
  }

  /**
   * Adds a 1px outline in `colorHex` on every transparent pixel touching an opaque one
   * (4-neighbourhood, or 8 with diagonal=true). Pixels at least `minAlpha` count as opaque.
   */
  outline(colorHex: ColorLike = '#120c0c', diagonal = false, minAlpha = 1): this {
    const { w, h, data } = this;
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] >= minAlpha ? 1 : 0;
    const p = parseColor(colorHex);
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x] === 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (solid[y * w + x]) continue;
        let touch = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
        if (!touch && diagonal) touch = at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1);
        if (touch) this.set(x, y, p);
      }
    return this;
  }

  /** Composites `src` onto this image with its top-left at (dx, dy). */
  blit(src: PixelImage, dx = 0, dy = 0): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        this.blend(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], a]);
      }
    return this;
  }

  /** Recolours every opaque pixel through `fn` (return null to keep it). */
  mapColors(fn: (r: number, g: number, b: number, a: number, x: number, y: number) => ColorLike | null): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const [r, g, b, a] = this.get(x, y);
        if (a === 0) continue;
        const c = fn(r, g, b, a, x, y);
        if (c !== null) this.set(x, y, c);
      }
    return this;
  }

  clone(): PixelImage {
    const o = new PixelImage(this.w, this.h);
    o.data.set(this.data);
    return o;
  }

  flipX(): PixelImage {
    const o = new PixelImage(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.set(this.w - 1 - x, y, this.get(x, y));
    return o;
  }

  countOpaque(): number {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i] > 0) n++;
    return n;
  }

  equals(o: PixelImage): boolean {
    if (o.w !== this.w || o.h !== this.h) return false;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== o.data[i]) return false;
    return true;
  }

  /** Browser only: a canvas of size (w*scale, h*scale) with hard nearest-neighbour pixels. */
  toCanvas(scale = 1): HTMLCanvasElement {
    if (typeof document === 'undefined') throw new Error('PixelImage.toCanvas needs a DOM (browser only)');
    const s = Math.max(1, Math.floor(scale));
    const canvas = document.createElement('canvas');
    canvas.width = this.w * s;
    canvas.height = this.h * s;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const out = img.data;
    const W = canvas.width;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (this.data[i + 3] === 0) continue;
        for (let sy = 0; sy < s; sy++) {
          let o = ((y * s + sy) * W + x * s) * 4;
          for (let sx = 0; sx < s; sx++, o += 4) {
            out[o] = this.data[i];
            out[o + 1] = this.data[i + 1];
            out[o + 2] = this.data[i + 2];
            out[o + 3] = this.data[i + 3];
          }
        }
      }
    ctx.putImageData(img, 0, 0);
    canvas.style.imageRendering = 'pixelated';
    return canvas;
  }

  /** Browser only: PNG data URL (nearest-neighbour upscaled). */
  toDataURL(scale = 1): string {
    return this.toCanvas(scale).toDataURL('image/png');
  }
}

// ---------------------------------------------------------------------------------------------
// Tiny deterministic RNG + string hashing (self-contained so the art stays stable).

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combines integers into one 32-bit seed. */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= Math.imul((p | 0) ^ 0x85ebca6b, 0xc2b2ae35);
    h = Math.imul((h << 13) | (h >>> 19), 5) + 0xe6546b64;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/** mulberry32 seeded RNG. */
export class PixelRng {
  private s: number;
  constructor(seed: number | string) {
    this.s = (typeof seed === 'string' ? hashString(seed) : Math.floor(seed) >>> 0) || 0x2545f491;
  }
  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** Convenience: seeded RNG factory. */
export function rng(seed: number | string): PixelRng {
  return new PixelRng(seed);
}
