// Procedural texture toolkit: tileable noise fields, canvas helpers, colour utilities and
// height → normal conversion. Every generator in src/render/proctex produces a 256×256
// TexOutput from these primitives. Everything here is deterministic (seeded) and seamless
// (all noise lattices wrap at the texture border), so textures tile without visible seams.
//
// Conventions:
//  * Channel = Float32Array of SIZE*SIZE values, row-major, row 0 = TOP of the image (canvas
//    order). The texture library flips rows when packing layers so the image is upright on
//    geometry (v increases upwards).
//  * Colours are sRGB in 0..1 while compositing (textures store sRGB albedo).
//  * Height fields are 0..1; `heightToNormal` turns them into OpenGL-convention normal maps
//    (+X right, +Y up in the image).

export const SIZE = 256;
export const PIX = SIZE * SIZE;
const MASK = SIZE - 1;

export type Channel = Float32Array;

/** Output of one procedural generator. */
export interface TexOutput {
  /** RGBA8, rgb = sRGB albedo (alpha ignored). Rows top→bottom. */
  rgba: Uint8ClampedArray;
  /** Height field 0..1 used to derive the normal map (omit/null = flat normal). */
  height?: Channel | null;
  /** Bump strength for `height` (slope multiplier, typical 1..8). */
  bump?: number;
  /** Relative roughness per pixel or constant (1 = the surface's nominal roughness). */
  rough?: Channel | number;
  /** Emissive mask 0..1 (omit = fully emissive wherever the surface is emissive). */
  emissive?: Channel | null;
}

// ------------------------------------------------------------------ hashing / rng

/** Integer lattice hash → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Small seeded PRNG (mulberry32) for placement decisions inside generators. */
export class Prng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x1234567;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length) % a.length];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

// ------------------------------------------------------------------ math helpers

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const fract = (x: number): number => x - Math.floor(x);

export function channel(fill = 0): Channel {
  const c = new Float32Array(PIX);
  if (fill !== 0) c.fill(fill);
  return c;
}

/** Rescale a channel to 0..1 in place (no-op for constant channels). */
export function normalize(c: Channel): Channel {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const d = hi - lo;
  if (d < 1e-9) {
    c.fill(0.5);
    return c;
  }
  const inv = 1 / d;
  for (let i = 0; i < c.length; i++) c[i] = (c[i] - lo) * inv;
  return c;
}

/** out = a*wa + b*wb (+ bias), allocation-free when `out` given. */
export function combine(a: Channel, wa: number, b: Channel, wb: number, bias = 0, out: Channel = channel()): Channel {
  for (let i = 0; i < PIX; i++) out[i] = a[i] * wa + b[i] * wb + bias;
  return out;
}

export function mapChannel(c: Channel, f: (v: number, i: number) => number, out: Channel = channel()): Channel {
  for (let i = 0; i < PIX; i++) out[i] = f(c[i], i);
  return out;
}

export function fromFn(f: (x: number, y: number) => number): Channel {
  const c = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) c[i++] = f(x, y);
  return c;
}

/** Bilinear sample with wrap (x, y in pixels). */
export function sample(c: Channel, x: number, y: number): number {
  const fx = Math.floor(x),
    fy = Math.floor(y);
  const tx = x - fx,
    ty = y - fy;
  const x0 = fx & MASK,
    y0 = fy & MASK,
    x1 = (x0 + 1) & MASK,
    y1 = (y0 + 1) & MASK;
  const a = c[y0 * SIZE + x0],
    b = c[y0 * SIZE + x1],
    d = c[y1 * SIZE + x0],
    e = c[y1 * SIZE + x1];
  return (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
}

// ------------------------------------------------------------------ noise

/**
 * Tileable value noise with `px` × `py` lattice cells across the texture (quintic fade).
 * Different px/py give anisotropic noise (grain, brushing, fibres). Range 0..1.
 */
export function noise(px: number, py: number, seed: number, out: Channel = channel()): Channel {
  px = Math.max(1, Math.round(px));
  py = Math.max(1, Math.round(py));
  const lat = new Float32Array(px * py);
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) lat[j * px + i] = hash2(i, j, seed);
  const ix0 = new Int32Array(SIZE),
    ix1 = new Int32Array(SIZE),
    wx = new Float32Array(SIZE);
  const sx = px / SIZE;
  for (let x = 0; x < SIZE; x++) {
    const f = x * sx;
    const i = Math.floor(f);
    const t = f - i;
    ix0[x] = i % px;
    ix1[x] = (i + 1) % px;
    wx[x] = t * t * t * (t * (t * 6 - 15) + 10);
  }
  const sy = py / SIZE;
  let o = 0;
  for (let y = 0; y < SIZE; y++) {
    const f = y * sy;
    const j = Math.floor(f);
    const t = f - j;
    const wy = t * t * t * (t * (t * 6 - 15) + 10);
    const r0 = (j % py) * px,
      r1 = ((j + 1) % py) * px;
    for (let x = 0; x < SIZE; x++) {
      const a = lat[r0 + ix0[x]],
        b = lat[r0 + ix1[x]],
        c = lat[r1 + ix0[x]],
        d = lat[r1 + ix1[x]];
      const w = wx[x];
      const top = a + (b - a) * w,
        bot = c + (d - c) * w;
      out[o++] = top + (bot - top) * wy;
    }
  }
  return out;
}

/** Fractal (fBm) tileable noise; base periods px/py double per octave. Normalised 0..1. */
export function fbm(px: number, py: number, octaves: number, seed: number, gain = 0.5): Channel {
  const out = channel();
  const tmp = channel();
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    noise(px << o, py << o, seed + o * 1013, tmp);
    for (let i = 0; i < PIX; i++) out[i] += tmp[i] * amp;
    amp *= gain;
  }
  return normalize(out);
}

/** Ridged fBm (sharp crests: veins, cracks, creases). Normalised 0..1. */
export function ridged(px: number, py: number, octaves: number, seed: number, gain = 0.5): Channel {
  const out = channel();
  const tmp = channel();
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    noise(px << o, py << o, seed + o * 7919, tmp);
    for (let i = 0; i < PIX; i++) {
      const r = 1 - Math.abs(tmp[i] * 2 - 1);
      out[i] += r * r * amp;
    }
    amp *= gain;
  }
  return normalize(out);
}

/** White noise (one random value per pixel). */
export function whiteNoise(seed: number): Channel {
  const c = channel();
  let s = seed >>> 0 || 1;
  for (let i = 0; i < PIX; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    c[i] = (s >>> 0) / 4294967296;
  }
  return c;
}

export interface Cells {
  /** Distance to the nearest feature point (in cell units, ~0..1). */
  f1: Channel;
  /** Distance to the second nearest feature point. */
  f2: Channel;
  /** Random 0..1 id of the nearest cell. */
  id: Channel;
}

/** Tileable Worley/cellular noise with `n` × `n` jittered cells (aspect via ny). */
export function cells(n: number, seed: number, jitter = 1, ny = n): Cells {
  n = Math.max(1, Math.round(n));
  ny = Math.max(1, Math.round(ny));
  const fx = new Float32Array(n * ny),
    fy = new Float32Array(n * ny),
    fid = new Float32Array(n * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      fx[k] = i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter;
      fy[k] = j + 0.5 + (hash2(i, j, seed + 77) - 0.5) * jitter;
      fid[k] = hash2(i, j, seed + 191);
    }
  const f1 = channel(),
    f2 = channel(),
    id = channel();
  const csx = n / SIZE,
    csy = ny / SIZE;
  let o = 0;
  for (let y = 0; y < SIZE; y++) {
    const py = (y + 0.5) * csy;
    const cj = Math.floor(py);
    for (let x = 0; x < SIZE; x++) {
      const px = (x + 0.5) * csx;
      const ci = Math.floor(px);
      let d1 = 1e9,
        d2 = 1e9,
        best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj;
        const wj = ((jj % ny) + ny) % ny;
        const offY = jj - wj;
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di;
          const wi = ((ii % n) + n) % n;
          const k = wj * n + wi;
          const dx = fx[k] + (ii - wi) - px;
          const dy = fy[k] + offY - py;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      }
      f1[o] = Math.sqrt(d1);
      f2[o] = Math.sqrt(d2);
      id[o] = fid[best];
      o++;
    }
  }
  return { f1, f2, id };
}

/** Separable box blur with wrap; `passes` ≥ 2 approximates a gaussian. */
export function blur(c: Channel, radius: number, passes = 2): Channel {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return c;
  const tmp = channel();
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < SIZE; y++) {
      const row = y * SIZE;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += c[row + (k & MASK)];
      for (let x = 0; x < SIZE; x++) {
        tmp[row + x] = acc * inv;
        acc += c[row + ((x + r + 1) & MASK)] - c[row + ((x - r) & MASK)];
      }
    }
    for (let x = 0; x < SIZE; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(k & MASK) * SIZE + x];
      for (let y = 0; y < SIZE; y++) {
        c[y * SIZE + x] = acc * inv;
        acc += tmp[((y + r + 1) & MASK) * SIZE + x] - tmp[((y - r) & MASK) * SIZE + x];
      }
    }
  }
  return c;
}

/** Domain warp: out(x,y) = src(x + (wx-0.5)*amt, y + (wy-0.5)*amt) (amt in pixels). */
export function warp(src: Channel, wx: Channel, wy: Channel, amt: number): Channel {
  const out = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) out[i] = sample(src, x + (wx[i] - 0.5) * amt, y + (wy[i] - 0.5) * amt);
  return out;
}

// ------------------------------------------------------------------ colour

export type RGB = [number, number, number];

/** 0xRRGGBB → sRGB triple 0..1. */
export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const css = (c: RGB, a = 1): string =>
  a >= 1
    ? `rgb(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)})`
    : `rgba(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)},${a})`;

/** Gradient lookup: stops sorted by position (0..1), colours 0xRRGGBB. Returns a 256-entry LUT. */
export function gradientLUT(stops: Array<[number, number]>): Float32Array {
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 1 && stops[k + 1][0] < t) k++;
    const [p0, c0] = stops[k];
    const [p1, c1] = stops[Math.min(k + 1, stops.length - 1)];
    const u = p1 > p0 ? clamp01((t - p0) / (p1 - p0)) : 0;
    const a = hex(c0),
      b = hex(c1);
    lut[i * 3] = a[0] + (b[0] - a[0]) * u;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * u;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * u;
  }
  return lut;
}

/** Image in float sRGB channels (compositing buffer). */
export class Img {
  readonly r = channel();
  readonly g = channel();
  readonly b = channel();

  static solid(c: RGB): Img {
    const im = new Img();
    im.r.fill(c[0]);
    im.g.fill(c[1]);
    im.b.fill(c[2]);
    return im;
  }

  /** Colour each pixel from a scalar field through a gradient LUT. */
  static fromGradient(t: Channel, lut: Float32Array): Img {
    const im = new Img();
    for (let i = 0; i < PIX; i++) {
      const k = Math.round(clamp01(t[i]) * 255) * 3;
      im.r[i] = lut[k];
      im.g[i] = lut[k + 1];
      im.b[i] = lut[k + 2];
    }
    return im;
  }

  static fromRGBA(d: Uint8ClampedArray): Img {
    const im = new Img();
    for (let i = 0, j = 0; i < PIX; i++, j += 4) {
      im.r[i] = d[j] / 255;
      im.g[i] = d[j + 1] / 255;
      im.b[i] = d[j + 2] / 255;
    }
    return im;
  }

  /** Multiply brightness by (1 + (m-0.5)*2*amount) per pixel. */
  modulate(m: Channel, amount: number): this {
    for (let i = 0; i < PIX; i++) {
      const k = 1 + (m[i] - 0.5) * 2 * amount;
      this.r[i] *= k;
      this.g[i] *= k;
      this.b[i] *= k;
    }
    return this;
  }

  /** Multiply by a scalar field (0..1) blended: mix(1, m, amount). */
  darken(m: Channel, amount: number): this {
    for (let i = 0; i < PIX; i++) {
      const k = 1 - amount + m[i] * amount;
      this.r[i] *= k;
      this.g[i] *= k;
      this.b[i] *= k;
    }
    return this;
  }

  /** Blend towards colour c by per-pixel weight w*amount. */
  blend(c: RGB, w: Channel, amount = 1): this {
    for (let i = 0; i < PIX; i++) {
      const t = clamp01(w[i] * amount);
      this.r[i] += (c[0] - this.r[i]) * t;
      this.g[i] += (c[1] - this.g[i]) * t;
      this.b[i] += (c[2] - this.b[i]) * t;
    }
    return this;
  }

  /** Blend another image in by per-pixel weight. */
  blendImg(o: Img, w: Channel, amount = 1): this {
    for (let i = 0; i < PIX; i++) {
      const t = clamp01(w[i] * amount);
      this.r[i] += (o.r[i] - this.r[i]) * t;
      this.g[i] += (o.g[i] - this.g[i]) * t;
      this.b[i] += (o.b[i] - this.b[i]) * t;
    }
    return this;
  }

  /** Add small per-pixel colour jitter (n in 0..1, centred). */
  jitter(n: Channel, amount: number): this {
    for (let i = 0; i < PIX; i++) {
      const d = (n[i] - 0.5) * amount;
      this.r[i] += d;
      this.g[i] += d;
      this.b[i] += d;
    }
    return this;
  }

  /** Luminance (Rec.709 on sRGB values, approximate). */
  luma(): Channel {
    const c = channel();
    for (let i = 0; i < PIX; i++) c[i] = this.r[i] * 0.2126 + this.g[i] * 0.7152 + this.b[i] * 0.0722;
    return c;
  }

  toRGBA(): Uint8ClampedArray {
    const d = new Uint8ClampedArray(PIX * 4);
    for (let i = 0, j = 0; i < PIX; i++, j += 4) {
      d[j] = this.r[i] * 255 + 0.5;
      d[j + 1] = this.g[i] * 255 + 0.5;
      d[j + 2] = this.b[i] * 255 + 0.5;
      d[j + 3] = 255;
    }
    return d;
  }
}

// ------------------------------------------------------------------ canvas

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Canvas2D {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  g: Ctx2D;
}

/** Create a 2D canvas (OffscreenCanvas when available, else a detached <canvas>). */
export function makeCanvas(w = SIZE, h = SIZE): Canvas2D {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(w, h);
  else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
  }
  const g = canvas.getContext("2d", { willReadFrequently: true }) as Ctx2D | null;
  if (!g) throw new Error("proctex: 2D canvas unavailable");
  return { canvas, g };
}

export function readRGBA(c: Canvas2D): Uint8ClampedArray {
  return c.g.getImageData(0, 0, SIZE, SIZE).data;
}

/** Draw an Img into a canvas (to continue with vector drawing on top). */
export function putImg(c: Canvas2D, im: Img): void {
  const id = c.g.createImageData(SIZE, SIZE);
  id.data.set(im.toRGBA());
  c.g.putImageData(id, 0, 0);
}

/**
 * Call `draw(dx, dy)` for every wrapped copy of a shape centred at (x, y) with bounding
 * radius r, so shapes crossing the border continue on the opposite side (seamless tiling).
 */
export function wrapDraw(x: number, y: number, r: number, draw: (dx: number, dy: number) => void): void {
  const xs = [0];
  const ys = [0];
  if (x - r < 0) xs.push(SIZE);
  if (x + r > SIZE) xs.push(-SIZE);
  if (y - r < 0) ys.push(SIZE);
  if (y + r > SIZE) ys.push(-SIZE);
  for (const dx of xs) for (const dy of ys) draw(dx, dy);
}

/** Extract a single channel (0..1) from RGBA canvas data. ch: 0=r,1=g,2=b,3=a, 4=luma. */
export function rgbaChannel(d: Uint8ClampedArray, ch: number): Channel {
  const c = channel();
  for (let i = 0, j = 0; i < PIX; i++, j += 4) {
    c[i] = ch === 4 ? (d[j] * 0.2126 + d[j + 1] * 0.7152 + d[j + 2] * 0.0722) / 255 : d[j + ch] / 255;
  }
  return c;
}

/** Render a canvas-drawn mask (white on black) into a channel. */
export function maskFromCanvas(draw: (g: Ctx2D) => void): Channel {
  const c = makeCanvas();
  c.g.fillStyle = "#000";
  c.g.fillRect(0, 0, SIZE, SIZE);
  c.g.fillStyle = "#fff";
  c.g.strokeStyle = "#fff";
  draw(c.g);
  return rgbaChannel(readRGBA(c), 0);
}

// ------------------------------------------------------------------ normals

/**
 * Height field (0..1, row 0 = top) → RGBA8 tangent-space normal map, OpenGL convention
 * (+X = image right, +Y = image up), wrap-around central differences. `strength` scales
 * the slope (height units per texel). Alpha = 255 (callers may replace it).
 */
export function heightToNormal(h: Channel, strength: number, out = new Uint8ClampedArray(PIX * 4)): Uint8ClampedArray {
  for (let y = 0; y < SIZE; y++) {
    const up = ((y - 1) & MASK) * SIZE,
      dn = ((y + 1) & MASK) * SIZE,
      row = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const l = h[row + ((x - 1) & MASK)],
        r = h[row + ((x + 1) & MASK)];
      const u = h[up + x],
        d = h[dn + x];
      // dh/du (right) and dh/dv (up: towards smaller row index)
      const nx = -(r - l) * 0.5 * strength;
      const ny = -(u - d) * 0.5 * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const j = (row + x) * 4;
      out[j] = (nx * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 2] = (inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 3] = 255;
    }
  }
  return out;
}

// ------------------------------------------------------------------ text helpers

export const FONT_SANS = 'Inter, "Liberation Sans", Arial, Helvetica, sans-serif';
export const FONT_SERIF = '"Liberation Serif", "DejaVu Serif", Georgia, "Times New Roman", serif';
export const FONT_MONO = '"JetBrains Mono", "DejaVu Sans Mono", "Liberation Mono", Consolas, monospace';
export const FONT_COND = '"Liberation Sans Narrow", "Arial Narrow", Inter, sans-serif';

/** Draw text fitted to a max width (shrinks the font if needed). */
export function fitText(
  g: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  px: number,
  family: string,
  weight = "normal",
  align: CanvasTextAlign = "center",
): void {
  let size = px;
  g.font = `${weight} ${size}px ${family}`;
  let w = g.measureText(text).width;
  if (w > maxW && w > 0) {
    size = Math.max(4, Math.floor((size * maxW) / w));
    g.font = `${weight} ${size}px ${family}`;
  }
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(text, x, y);
}
