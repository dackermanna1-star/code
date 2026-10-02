/**
 * Procedural particle sprite atlas (CPU generated once at start-up, uploaded as a
 * sampler2DArray, RGBA8, mipmapped). No external images.
 *
 * Channel encodings by sprite kind (the particle shader's `mode` decides how to read them):
 *  - puffs (SMOKE*): .rg = view-space normal xy (*0.5+0.5) of a union-of-spheres "cauliflower"
 *    puff (+ noise), .b = optical thickness, .a = density (eroded with age in the shader).
 *  - flames (FLAME*): .r = heat (1 = white-hot core), .a = mask.
 *  - masks (GLOW, STAR, SPARKLE, RING, ...): .rgb = shading (white = full tint), .a = alpha.
 *  - colour sprites (HEART, ANGRY): .rgb = sRGB colour, .a = alpha.
 */
import { Rng } from '../../core/rng';

export const SP = {
  SMOKE0: 0, SMOKE1: 1, SMOKE2: 2, SMOKE3: 3,
  FLAME0: 4, FLAME1: 5, FLAME2: 6, FLAME3: 7,
  GLOW: 8,
  STAR: 9,
  SPARKLE: 10,
  HEART: 11,
  ANGRY: 12,
  NOTE: 13,
  GLYPH0: 14, // .. GLYPH0 + 7
  BUBBLE: 22,
  DROP: 23,
  SNOWFLAKE: 24,
  RING: 25,
  CRESCENT: 26,
  FLAKE: 27,
  SQUARE: 28,
  STREAK: 29,
} as const;
export const SPRITE_LAYERS = 30;
export const GLYPH_COUNT = 8;

export interface AtlasData {
  size: number;
  layers: number;
  data: Uint8Array;
}

// ------------------------------------------------------------------------------------ helpers
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Tileable-free 2D value noise with a per-instance permutation. */
class Noise {
  private p = new Float32Array(256 * 256);
  constructor(seed: number) {
    const r = new Rng(seed);
    for (let i = 0; i < this.p.length; i++) this.p[i] = r.next();
  }
  v(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    const P = this.p;
    const i = (a: number, b: number) => P[((a & 255) << 8) | (b & 255)];
    const a = i(xi, yi), b = i(xi + 1, yi), c = i(xi, yi + 1), d = i(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  fbm(x: number, y: number, oct = 4) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      s += this.v(x * f + o * 17.3, y * f - o * 9.1) * amp;
      n += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }
}

/** Distance from p to segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

type PixelFn = (x: number, y: number, out: number[]) => void;

function paint(data: Uint8Array, size: number, layer: number, fn: PixelFn, ss = 2) {
  const out = [0, 0, 0, 0];
  const acc = [0, 0, 0, 0];
  const base = layer * size * size * 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          // uv in [0,1], v = 1 at the top of the sprite
          const u = (x + (sx + 0.5) / ss) / size;
          const v = 1 - (y + (sy + 0.5) / ss) / size;
          out[0] = out[1] = out[2] = out[3] = 0;
          fn(u, v, out);
          // accumulate premultiplied so edges don't pick up garbage colour
          acc[0] += out[0] * out[3]; acc[1] += out[1] * out[3]; acc[2] += out[2] * out[3]; acc[3] += out[3];
        }
      const n = ss * ss;
      const a = acc[3] / n;
      const i = base + ((size - 1 - y) * size + x) * 4; // row 0 = v 0 (bottom) in GL
      const inv = acc[3] > 1e-6 ? 1 / acc[3] : 0;
      data[i] = Math.round(clamp01(acc[0] * inv) * 255);
      data[i + 1] = Math.round(clamp01(acc[1] * inv) * 255);
      data[i + 2] = Math.round(clamp01(acc[2] * inv) * 255);
      data[i + 3] = Math.round(clamp01(a) * 255);
    }
}

/** Dilate colour into fully transparent texels (so bilinear/mips don't bleed black). */
function dilate(data: Uint8Array, size: number, layer: number) {
  const base = layer * size * size * 4;
  for (let pass = 0; pass < 4; pass++) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = base + (y * size + x) * 4;
        if (data[i + 3] > 0) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            const j = base + (yy * size + xx) * 4;
            if (data[j + 3] === 0 && (data[j] | data[j + 1] | data[j + 2]) === 0) continue;
            r += data[j]; g += data[j + 1]; b += data[j + 2]; n++;
          }
        if (n) { data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n; }
      }
  }
}

// ------------------------------------------------------------------------------------ sprites
function puff(seed: number): PixelFn {
  const r = new Rng(seed);
  const nz = new Noise(seed * 7 + 1);
  const spheres: [number, number, number, number][] = [];
  // a big core plus lobes (cauliflower) — upper lobes slightly bigger (billowing)
  spheres.push([0.5, 0.47, 0.0, 0.24]);
  const n = 6 + r.int(4);
  for (let i = 0; i < n; i++) {
    const a = r.next() * Math.PI * 2;
    const d = 0.1 + r.next() * 0.13;
    const cx = 0.5 + Math.cos(a) * d, cy = 0.48 + Math.sin(a) * d * 0.9;
    const rad = 0.09 + r.next() * 0.1 + (cy > 0.5 ? 0.02 : 0);
    spheres.push([cx, cy, (r.next() - 0.5) * 0.1, rad]);
  }
  return (u, v, o) => {
    // perturb the lookup point for ragged edges
    const wx = (nz.fbm(u * 6, v * 6, 3) - 0.5) * 0.06, wy = (nz.fbm(u * 6 + 31, v * 6 + 7, 3) - 0.5) * 0.06;
    const x = u + wx, y = v + wy;
    let best = -1e9, nx = 0, ny = 0, nzv = 1, cover = 0;
    for (const [cx, cy, cz, rad] of spheres) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const r2 = rad * rad;
      // soft coverage contribution
      cover = Math.max(cover, smooth(r2, r2 * 0.35, d2));
      if (d2 >= r2) continue;
      const z = Math.sqrt(r2 - d2) + cz;
      if (z > best) {
        best = z;
        nx = dx / rad; ny = dy / rad; nzv = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      }
    }
    if (cover <= 0) { o[3] = 0; return; }
    // fine detail in the normal (wispy, turbulent surface)
    const e = 1 / 64;
    const h0 = nz.fbm(u * 9, v * 9, 4), hx = nz.fbm((u + e) * 9, v * 9, 4), hy = nz.fbm(u * 9, (v + e) * 9, 4);
    nx += (h0 - hx) * 4.0; ny += (h0 - hy) * 4.0;
    const l = Math.hypot(nx, ny, nzv) || 1;
    nx /= l; ny /= l;
    const detail = nz.fbm(u * 5 + 3, v * 5 + 11, 5);
    const dens = cover * clamp01(0.35 + detail * 0.95);
    o[0] = nx * 0.5 + 0.5;
    o[1] = ny * 0.5 + 0.5;
    o[2] = clamp01(best > -1e8 ? best / 0.3 : 0.2) * (0.6 + 0.4 * detail);
    o[3] = dens;
  };
}

function flame(seed: number): PixelFn {
  const nz = new Noise(seed * 13 + 5);
  const lean = (new Rng(seed).next() - 0.5) * 0.06;
  return (u, v, o) => {
    const y = v;
    if (y < 0.02 || y > 0.98) { o[3] = 0; return; }
    const sway = (nz.fbm(y * 2.5, seed, 3) - 0.5) * 0.22 * y + lean * y;
    const x = u - 0.5 - sway;
    // teardrop profile: round bottom at y~0.22, tapering tip at the top
    const yb = 0.24;
    let w: number;
    if (y < yb) w = 0.2 * Math.sqrt(Math.max(0, 1 - ((yb - y) / (yb - 0.04)) ** 2));
    else w = 0.2 * Math.pow(1 - (y - yb) / (1 - yb), 0.85);
    const edgeN = nz.fbm(u * 8, y * 5 - seed, 3);
    w *= 0.8 + edgeN * 0.45;
    const d = Math.abs(x);
    const m = w > 1e-3 ? smooth(w, w * 0.45, d) : 0;
    // detached tongue at the top
    const heat = clamp01(m * (1.15 - y * 0.95) * (0.75 + 0.5 * nz.fbm(u * 6, y * 6, 2)));
    o[0] = heat;
    o[1] = heat;
    o[2] = heat;
    o[3] = m * smooth(0.98, 0.7, y);
  };
}

function glow(u: number, v: number, o: number[]) {
  const dx = u - 0.5, dy = v - 0.5;
  const d2 = (dx * dx + dy * dy) * 4;
  o[0] = o[1] = o[2] = 1;
  o[3] = Math.exp(-d2 * 7) * 0.85 + Math.exp(-d2 * 30) * 0.15;
  o[3] *= smooth(1, 0.8, Math.sqrt(d2));
}

function star(points: number, sharp: number): PixelFn {
  return (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    const spike = Math.pow(Math.abs(Math.cos((a * points) / 2)), sharp);
    const r = 0.12 + 0.88 * spike;
    o[0] = o[1] = o[2] = 1;
    o[3] = smooth(r, r * 0.25, d) * smooth(1, 0.85, d) + Math.exp(-d * d * 30) * 0.6;
  };
}

function sdHeart(px: number, py: number) {
  // Inigo Quilez' exact heart SDF (point at the origin, lobes up to y ~ 1.1)
  px = Math.abs(px);
  if (py + px > 1) return Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
  const m = 0.5 * Math.max(px + py, 0);
  return Math.sqrt(Math.min((px * px + (py - 1) ** 2), (px - m) ** 2 + (py - m) ** 2)) * Math.sign(px - py);
}

function heart(u: number, v: number, o: number[]) {
  const x = (u - 0.5) * 1.32, y = (v - 0.04) * 1.22;
  const d = sdHeart(x, y);
  const inside = smooth(0.012, -0.012, d);
  if (inside <= 0) { o[3] = 0; return; }
  const rim = smooth(-0.075, -0.03, d); // dark outline band
  const hl = Math.exp(-((x + 0.24) ** 2 + (y - 0.78) ** 2) * 40);
  const shade = 0.72 + 0.28 * clamp01(y);
  o[0] = (0.86 * shade + hl * 0.45) * (1 - rim) + 0.3 * rim;
  o[1] = (0.07 + hl * 0.6) * (1 - rim) + 0.02 * rim;
  o[2] = (0.09 + hl * 0.6) * (1 - rim) + 0.03 * rim;
  o[3] = inside;
}

function angry(nz: Noise): PixelFn {
  return (u, v, o) => {
    // dark storm cloud (three lobes) with a red "anger" cross mark
    let cover = 0;
    for (const [cx, cy, r] of [[0.28, 0.45, 0.2], [0.52, 0.58, 0.26], [0.75, 0.44, 0.2], [0.5, 0.36, 0.22]] as const) {
      const d = Math.hypot(u - cx, v - cy);
      cover = Math.max(cover, smooth(r, r * 0.8, d));
    }
    const n = nz.fbm(u * 7, v * 7, 3);
    const g = 0.18 + 0.12 * n + (v - 0.4) * 0.2;
    o[0] = g; o[1] = g; o[2] = g * 1.05;
    o[3] = cover;
    // vein mark: four curved strokes around the centre (manga anger symbol)
    const cx = u - 0.52, cy = v - 0.48;
    let m = 0;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const px = cx * sx, py = cy * sy;
      // arc bulging toward the centre (the inner half of a circle centred diagonally outward)
      const d = Math.abs(Math.hypot(px - 0.2, py - 0.2) - 0.12);
      if (Math.hypot(px, py) < 0.2 && px > 0.015 && py > 0.015) m = Math.max(m, smooth(0.03, 0.016, d));
    }
    if (m > 0) {
      o[0] = o[0] * (1 - m) + 0.95 * m;
      o[1] = o[1] * (1 - m) + 0.08 * m;
      o[2] = o[2] * (1 - m) + 0.06 * m;
      o[3] = Math.max(o[3], m);
    }
  };
}

function note(u: number, v: number, o: number[]) {
  // eighth note: tilted elliptical head, stem, flag
  const hx = u - 0.38, hy = v - 0.26;
  const c = Math.cos(-0.45), s = Math.sin(-0.45);
  const ex = (hx * c - hy * s) / 0.15, ey = (hx * s + hy * c) / 0.1;
  const head = smooth(1.05, 0.85, Math.hypot(ex, ey));
  const stem = smooth(0.035, 0.022, segDist(u, v, 0.5, 0.3, 0.5, 0.86));
  const fd = segDist(u, v, 0.5, 0.86, 0.68, 0.62);
  const flag = smooth(0.045, 0.03, fd);
  const a = Math.max(head, stem, flag);
  o[0] = o[1] = o[2] = 1;
  o[3] = a;
}

/** Enchanting-table style glyphs (Standard Galactic Alphabet flavoured strokes). */
const GLYPHS: number[][][] = [
  // each glyph: list of segments [ax, ay, bx, by] in 0..1
  [[0.3, 0.8, 0.7, 0.8], [0.7, 0.8, 0.7, 0.2], [0.3, 0.5, 0.55, 0.5]],
  [[0.3, 0.2, 0.3, 0.8], [0.3, 0.8, 0.7, 0.8], [0.5, 0.5, 0.7, 0.5], [0.7, 0.5, 0.7, 0.2]],
  [[0.25, 0.75, 0.75, 0.75], [0.5, 0.75, 0.5, 0.2], [0.35, 0.35, 0.65, 0.35]],
  [[0.3, 0.8, 0.3, 0.3], [0.3, 0.3, 0.7, 0.3], [0.7, 0.3, 0.7, 0.55]],
  [[0.25, 0.25, 0.75, 0.25], [0.5, 0.25, 0.5, 0.8], [0.35, 0.8, 0.65, 0.8], [0.72, 0.55, 0.72, 0.55]],
  [[0.3, 0.2, 0.7, 0.8], [0.3, 0.8, 0.55, 0.8], [0.6, 0.35, 0.6, 0.35]],
  [[0.3, 0.75, 0.7, 0.75], [0.3, 0.75, 0.3, 0.45], [0.7, 0.45, 0.7, 0.2], [0.3, 0.45, 0.7, 0.45]],
  [[0.5, 0.2, 0.5, 0.8], [0.28, 0.6, 0.5, 0.6], [0.5, 0.4, 0.72, 0.4]],
];

function glyph(idx: number): PixelFn {
  const segs = GLYPHS[idx % GLYPHS.length];
  return (u, v, o) => {
    let d = 9;
    for (const [ax, ay, bx, by] of segs) d = Math.min(d, segDist(u, v, ax, ay, bx, by));
    o[0] = o[1] = o[2] = 1;
    o[3] = smooth(0.06, 0.035, d) + 0.25 * Math.exp(-d * d * 250);
  };
}

function bubble(u: number, v: number, o: number[]) {
  const d = Math.hypot(u - 0.5, v - 0.5) * 2;
  const rim = smooth(0.62, 0.86, d) * smooth(1.0, 0.9, d);
  const hl = Math.exp(-((u - 0.36) ** 2 + (v - 0.64) ** 2) * 180);
  o[0] = o[1] = o[2] = 0.85 + hl * 0.15;
  o[3] = clamp01(rim * 0.9 + 0.12 * smooth(1, 0.8, d) + hl);
}

function drop(u: number, v: number, o: number[]) {
  // vertical teardrop, point at the top
  const x = u - 0.5, y = v;
  const r = 0.2;
  const cy = 0.32;
  let m: number;
  if (y < cy) m = smooth(r, r * 0.8, Math.hypot(x, y - cy));
  else {
    const w = r * Math.pow(Math.max(0, 1 - (y - cy) / (0.92 - cy)), 1.3);
    m = smooth(w + 0.01, w * 0.6, Math.abs(x));
  }
  const hl = Math.exp(-((x + 0.07) ** 2 + (y - 0.36) ** 2) * 400);
  o[0] = o[1] = o[2] = 0.7 + 0.3 * hl;
  o[3] = clamp01(m * (0.55 + 0.45 * smooth(0.0, 0.2, Math.abs(x) / Math.max(r, 1e-3))) + hl);
}

function snowflake(u: number, v: number, o: number[]) {
  const x = u - 0.5, y = v - 0.5;
  let d = 9;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const cx = Math.cos(a), cy = Math.sin(a);
    d = Math.min(d, segDist(x, y, 0, 0, cx * 0.42, cy * 0.42));
    for (const t of [0.2, 0.3]) {
      const bx = cx * t, by = cy * t;
      for (const sgn of [-1, 1]) {
        const b2 = a + sgn * 0.75;
        d = Math.min(d, segDist(x, y, bx, by, bx + Math.cos(b2) * 0.1, by + Math.sin(b2) * 0.1));
      }
    }
  }
  const core = Math.exp(-(x * x + y * y) * 60);
  o[0] = o[1] = o[2] = 1;
  o[3] = clamp01(smooth(0.03, 0.012, d) + core * 0.5 + 0.15 * Math.exp(-d * d * 400));
}

function ring(u: number, v: number, o: number[]) {
  const d = Math.hypot(u - 0.5, v - 0.5) * 2;
  o[0] = o[1] = o[2] = 1;
  // sharp leading edge, soft trailing inner falloff
  o[3] = smooth(0.98, 0.9, d) * smooth(0.55, 0.9, d);
}

function crescent(u: number, v: number, o: number[]) {
  // sweep arc: band between two circles, opening downward, brighter on the outer edge
  const x = u - 0.5, y = v - 0.32;
  const d = Math.hypot(x, y);
  const outer = 0.46, inner = 0.3;
  const band = smooth(outer, outer - 0.03, d) * smooth(inner - 0.04, inner + 0.06, d);
  const ang = Math.atan2(y, x); // 0..PI on the upper half
  const arc = smooth(0.05, 0.35, ang) * smooth(Math.PI - 0.05, Math.PI - 0.35, ang);
  const edge = smooth(inner, outer, d);
  o[0] = o[1] = o[2] = 0.65 + 0.35 * edge;
  o[3] = band * arc * (0.45 + 0.55 * edge);
}

function flakeFn(nz: Noise): PixelFn {
  return (u, v, o) => {
    const x = u - 0.5, y = v - 0.5;
    const a = Math.atan2(y, x);
    const r = 0.22 + 0.14 * nz.fbm(Math.cos(a) * 1.5 + 2, Math.sin(a) * 1.5 + 2, 3);
    const d = Math.hypot(x, y);
    o[0] = o[1] = o[2] = 0.8 + 0.2 * nz.fbm(u * 8, v * 8, 2);
    o[3] = smooth(r, r * 0.7, d);
  };
}

function square(u: number, v: number, o: number[]) {
  const d = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
  o[0] = o[1] = o[2] = 1;
  o[3] = smooth(0.85, 0.6, d) * 0.9 + 0.1 * smooth(1, 0.7, d);
}

function streak(u: number, v: number, o: number[]) {
  const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
  o[0] = o[1] = o[2] = 1;
  o[3] = Math.exp(-x * x * 18) * smooth(1, 0.55, Math.abs(y)) * (0.75 + 0.25 * (1 - Math.abs(y)));
}

/** Generates all sprite layers. Deterministic. */
export function generateAtlas(size = 128): AtlasData {
  const layers = SPRITE_LAYERS;
  const data = new Uint8Array(size * size * 4 * layers);
  const nz = new Noise(4242);
  for (let i = 0; i < 4; i++) paint(data, size, SP.SMOKE0 + i, puff(101 + i * 31), 1);
  for (let i = 0; i < 4; i++) paint(data, size, SP.FLAME0 + i, flame(7 + i * 3), 1);
  paint(data, size, SP.GLOW, glow, 1);
  paint(data, size, SP.STAR, star(4, 24));
  paint(data, size, SP.SPARKLE, star(8, 10));
  paint(data, size, SP.HEART, heart);
  paint(data, size, SP.ANGRY, angry(nz));
  paint(data, size, SP.NOTE, note);
  for (let i = 0; i < GLYPH_COUNT; i++) paint(data, size, SP.GLYPH0 + i, glyph(i));
  paint(data, size, SP.BUBBLE, bubble);
  paint(data, size, SP.DROP, drop);
  paint(data, size, SP.SNOWFLAKE, snowflake);
  paint(data, size, SP.RING, ring);
  paint(data, size, SP.CRESCENT, crescent);
  paint(data, size, SP.FLAKE, flakeFn(new Noise(99)));
  paint(data, size, SP.SQUARE, square, 1);
  paint(data, size, SP.STREAK, streak, 1);
  for (let l = 0; l < layers; l++) dilate(data, size, l);
  return { size, layers, data };
}
