import * as THREE from 'three';

/**
 * Procedural pixel textures for Last Lookout. Every texture is painted texel by texel into a small
 * float buffer (32-128 px) with a seeded RNG, tileable value noise and hand-tuned palette ramps,
 * then posterised to a few dozen colours (the 8-bit CLUT look) and uploaded with nearest filtering
 * and nearest-sampled mipmaps (NearestMipmapLinear: crisp up close, no sparkle far away). Alpha-cut
 * foliage gets its own mip chain that keeps its coverage, so trees do not thin out with distance.
 *
 * Nothing touches the DOM until `createTextures()` is called.
 */

// ---------------------------------------------------------------------------------------------
// RNG, hashing, tileable noise

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iy, seed = 0) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise: lattice period (px, py), coordinates in lattice units. */
export function vnoise(x, y, px = 256, py = 256, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v, p) => ((v % p) + p) % p;
  const x0 = m(ix, px), x1 = m(ix + 1, px), y0 = m(iy, py), y1 = m(iy + 1, py);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, px, py, oct = 4, seed = 0) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y, px, py, seed + i * 17);
    n += a;
    x *= 2;
    y *= 2;
    px *= 2;
    py *= 2;
    a *= 0.5;
  }
  return s / n;
}

export function hex(h) {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

/** Piecewise-linear palette ramp: stops [[t, 0xrrggbb], ...] sorted by t. */
export function ramp(stops) {
  const S = stops.map(([t, c]) => [t, hex(c)]);
  return (t, out = [0, 0, 0]) => {
    t = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < S.length - 2 && t > S[i + 1][0]) i++;
    const [t0, c0] = S[i], [t1, c1] = S[i + 1];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    out[0] = c0[0] + (c1[0] - c0[0]) * k;
    out[1] = c0[1] + (c1[1] - c0[1]) * k;
    out[2] = c0[2] + (c1[2] - c0[2]) * k;
    return out;
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER4[(x & 3) + (y & 3) * 4] + 0.5) / 16;

// ---------------------------------------------------------------------------------------------
// Pixel buffer

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 4);
  }
  i(x, y) {
    const w = this.w, h = this.h;
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
    return (y * w + x) * 4;
  }
  set(x, y, c, a = 1) {
    const i = this.i(x | 0, y | 0), d = this.d;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = a;
    return this;
  }
  /** Blend toward colour c by t (alpha kept unless given). */
  mix(x, y, c, t, a) {
    const i = this.i(x | 0, y | 0), d = this.d;
    d[i] += (c[0] - d[i]) * t;
    d[i + 1] += (c[1] - d[i + 1]) * t;
    d[i + 2] += (c[2] - d[i + 2]) * t;
    if (a !== undefined) d[i + 3] = a;
    return this;
  }
  mul(x, y, k) {
    const i = this.i(x | 0, y | 0), d = this.d;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
    return this;
  }
  alpha(x, y, a) {
    this.d[this.i(x | 0, y | 0) + 3] = a;
    return this;
  }
  getA(x, y) {
    return this.d[this.i(x | 0, y | 0) + 3];
  }
  get(x, y, out = [0, 0, 0]) {
    const i = this.i(x | 0, y | 0), d = this.d;
    out[0] = d[i];
    out[1] = d[i + 1];
    out[2] = d[i + 2];
    return out;
  }
  fill(c, a = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a);
    return this;
  }
  rect(x0, y0, w, h, c, t = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t >= 1 ? this.set(x, y, c, this.getA(x, y)) : this.mix(x, y, c, t);
    return this;
  }
  /** Fill a rect fully opaque (alpha 1). */
  rectA(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, 1);
    return this;
  }
  line(x0, y0, x1, y1, c, t = 1, a) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      this.mix(x, y, c, t, a);
    }
    return this;
  }
  disc(cx, cy, r, c, t = 1, a) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.mix(x, y, c, t, a);
      }
    }
    return this;
  }
  /** Per-texel callback f(x, y, out) writing a colour; returns alpha (or undefined = 1). */
  paint(f) {
    const c = [0, 0, 0];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const a = f(x, y, c);
        this.set(x, y, c, a === undefined ? 1 : a);
      }
    }
    return this;
  }
  /** Posterise to n levels per channel with an ordered dither (the CLUT look). */
  quantize(n = 24, dither = 0.6) {
    const d = this.d;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4, b = (bayer(x, y) - 0.5) * dither;
        for (let k = 0; k < 3; k++) d[i + k] = Math.min(1, Math.max(0, Math.round(d[i + k] * n + b) / n));
      }
    }
    return this;
  }
  toImageData() {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let k = 0; k < out.length; k++) out[k] = Math.round(Math.min(1, Math.max(0, this.d[k])) * 255);
    return out;
  }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d');
    const id = g.createImageData(this.w, this.h);
    id.data.set(this.toImageData());
    g.putImageData(id, 0, 0);
    return c;
  }
  /** Copy another Pix into this one at (ox, oy). */
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const si = (y * src.w + x) * 4, di = this.i(ox + x, oy + y);
        for (let k = 0; k < 4; k++) this.d[di + k] = src.d[si + k];
      }
    }
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Bitmap font (5x7) for signage, painted texel by texel

const GLYPHS = {
  A: '.###.#...##...######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....##..#..##...', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
  3: '####.....#....#.###.....#....#####.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
  6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#...#..##..', '.': '.........................##...##..', '-': '...............###...............',
  '!': '..#....#....#....#....#.........#..', "'": '..#....#...#.......................', ':': '......##...##.........##...##......',
  '/': '....#...#....#...#...#....#...#....', '&': '.##..#..#.#.#...#...#.#.##..#..##.#', '$': '..#...#####.#...###...#.#####...#..',
  ' ': '...................................',
};

/**
 * Draw text with the 5x7 font. opts: { scale = 1, jitter = 0 (hand-painted wobble, texels),
 * drip = 0 (paint runs below strokes), seed, spacing = 1 }. Returns the text width in texels.
 */
export function drawText(pix, text, x0, y0, color, opts = {}) {
  const s = opts.scale ?? 1, sp = opts.spacing ?? 1;
  const R = rng(opts.seed ?? 7);
  let x = x0;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    const jx = opts.jitter ? Math.round((R() - 0.5) * opts.jitter) : 0, jy = opts.jitter ? Math.round((R() - 0.5) * opts.jitter) : 0;
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (g[gy * 5 + gx] !== '#') continue;
        for (let yy = 0; yy < s; yy++) {
          for (let xx = 0; xx < s; xx++) {
            pix.set(x + gx * s + xx + jx, y0 + gy * s + yy + jy, color, 1);
          }
        }
        if (opts.drip && gy === 6 && R() < opts.drip) {
          const len = 1 + Math.floor(R() * 4 * s);
          for (let k = 0; k < len; k++) pix.set(x + gx * s + jx, y0 + 7 * s + k + jy, color, 1);
        }
      }
    }
    x += (5 + sp) * s;
  }
  return x - x0 - sp * s;
}

export function textWidth(text, scale = 1, spacing = 1) {
  return text.length * (5 + spacing) * scale - spacing * scale;
}

// ---------------------------------------------------------------------------------------------
// Texture upload

/** Mip chain for alpha-cut textures that keeps the coverage at alphaTest 0.5. */
function alphaMips(pix) {
  const levels = [pix];
  let cur = pix;
  const cov = (p, k) => {
    let n = 0;
    for (let i = 3; i < p.d.length; i += 4) if (p.d[i] * k >= 0.5) n++;
    return n / (p.w * p.h);
  };
  const target = cov(pix, 1);
  while (cur.w > 1 || cur.h > 1) {
    const w = Math.max(1, cur.w >> 1), h = Math.max(1, cur.h >> 1);
    const nxt = new Pix(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = cur.i(Math.min(cur.w - 1, x * 2 + dx), Math.min(cur.h - 1, y * 2 + dy));
            const al = cur.d[i + 3];
            r += cur.d[i] * al;
            g += cur.d[i + 1] * al;
            b += cur.d[i + 2] * al;
            a += al;
          }
        }
        const o = (y * w + x) * 4;
        nxt.d[o] = a > 0 ? r / a : 0;
        nxt.d[o + 1] = a > 0 ? g / a : 0;
        nxt.d[o + 2] = a > 0 ? b / a : 0;
        nxt.d[o + 3] = a / 4;
      }
    }
    // scale alpha so the coverage at 0.5 matches the base level
    let lo = 0.5, hi = 4;
    for (let it = 0; it < 14; it++) {
      const m = (lo + hi) / 2;
      if (cov(nxt, m) < target) lo = m; else hi = m;
    }
    for (let i = 3; i < nxt.d.length; i += 4) nxt.d[i] = Math.min(1, nxt.d[i] * hi);
    levels.push(nxt);
    cur = nxt;
  }
  return levels;
}

/** Upload a Pix as a THREE texture. opts: { repeat = true, mips = true, alpha = false, srgb = true } */
export function toTexture(pix, opts = {}) {
  const repeat = opts.repeat ?? true, mips = opts.mips ?? true;
  let t;
  if (opts.alpha && mips) {
    const chain = alphaMips(pix).map((p) => p.toCanvas());
    t = new THREE.CanvasTexture(chain[0]);
    t.mipmaps = chain;
    t.generateMipmaps = false;
  } else {
    t = new THREE.CanvasTexture(pix.toCanvas());
    t.generateMipmaps = mips;
  }
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = opts.linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = mips ? (opts.linear ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter) : opts.linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Palettes

const P = {
  grass: ramp([[0, 0x2f3219], [0.3, 0x4c4c28], [0.55, 0x666236], [0.8, 0x847a45], [1, 0xa39456]]),
  dirt: ramp([[0, 0x2e2418], [0.3, 0x4f3e2a], [0.6, 0x6e573a], [0.85, 0x8a7150], [1, 0xa68b66]]),
  asphalt: ramp([[0, 0x1b1b1d], [0.35, 0x2c2c2f], [0.7, 0x3b3b3e], [1, 0x505052]]),
  brick: ramp([[0, 0x40201a], [0.35, 0x6a3426], [0.7, 0x844430], [1, 0x9c5a42]]),
  greyWood: ramp([[0, 0x3a352e], [0.35, 0x5e584e], [0.7, 0x7c7568], [1, 0x9a9284]]),
  redWood: ramp([[0, 0x3e1610], [0.35, 0x66241a], [0.7, 0x833328], [1, 0x9e5244]]),
  white: ramp([[0, 0x5e5a50], [0.35, 0x8e8a7c], [0.7, 0xb0ac9c], [1, 0xc8c4b2]]),
  rust: ramp([[0, 0x3a1c0e], [0.4, 0x6a3418], [0.75, 0x8e4c22], [1, 0xa86a3a]]),
  steel: ramp([[0, 0x3c4244], [0.4, 0x606868], [0.75, 0x828a88], [1, 0xa2a8a4]]),
  shingle: ramp([[0, 0x1e1c1c], [0.4, 0x363232], [0.75, 0x4a4442], [1, 0x5e5650]]),
  green: ramp([[0, 0x16201a], [0.4, 0x24382a], [0.75, 0x34503a], [1, 0x4a6a4c]]),
  concrete: ramp([[0, 0x4a4844], [0.4, 0x6c6a64], [0.75, 0x8a8880], [1, 0xa4a29a]]),
  corn: ramp([[0, 0x3a3018], [0.3, 0x6a5a30], [0.6, 0x8e7a44], [0.85, 0xae9858], [1, 0xc8b070]]),
  hay: ramp([[0, 0x5a4820], [0.4, 0x8a7236], [0.75, 0xae9648], [1, 0xcab466]]),
  bark: ramp([[0, 0x1e1a16], [0.4, 0x3a322a], [0.75, 0x524840], [1, 0x6a6052]]),
  burnt: ramp([[0, 0x0c0a0a], [0.35, 0x1e1a18], [0.7, 0x342e2a], [1, 0x4e4640]]),
  sand: ramp([[0, 0x4a3e2a], [0.4, 0x6e5e40], [0.75, 0x8e7c58], [1, 0xa69470]]),
};

const tmp = [0, 0, 0];
const tmp2 = [0, 0, 0];

// ---------------------------------------------------------------------------------------------
// Painters (each returns a Pix)

/** Ground detail, grass: a near-neutral multiplier (mean ~0.5) with blade strokes. */
function grassDetail() {
  const p = new Pix(64, 64);
  const R = rng(11);
  p.paint((x, y, c) => {
    const n = fbm(x / 8, y / 8, 8, 8, 3, 3);
    const v = 0.44 + 0.16 * n;
    c[0] = v * 1.02;
    c[1] = v;
    c[2] = v * 0.9;
  });
  // blades: short vertical-ish strokes, light tips over dark roots
  for (let k = 0; k < 260; k++) {
    const x = Math.floor(R() * 64), y = Math.floor(R() * 64), len = 2 + Math.floor(R() * 4);
    const lean = R() < 0.5 ? 0 : R() < 0.5 ? -1 : 1;
    for (let j = 0; j < len; j++) {
      const t = j / len;
      const v = 0.3 + 0.42 * t + R() * 0.08;
      tmp[0] = v * (1.04 + R() * 0.06);
      tmp[1] = v;
      tmp[2] = v * 0.82;
      p.set(x + Math.round(lean * t * 1.5), y - j, tmp);
    }
  }
  return p.quantize(20);
}

/** Ground detail, dirt: pebbles, cracks and clods (neutral, mean ~0.5). */
function dirtDetail() {
  const p = new Pix(64, 64);
  const R = rng(12);
  p.paint((x, y, c) => {
    const n = fbm(x / 6, y / 6, 64 / 6, 64 / 6, 3, 5);
    const v = 0.42 + 0.18 * n;
    c[0] = v * 1.04;
    c[1] = v;
    c[2] = v * 0.92;
  });
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(R() * 64), y = Math.floor(R() * 64), r = R() < 0.8 ? 0.7 : 1.3;
    const v = 0.55 + R() * 0.2;
    p.disc(x, y, r, [v, v * 0.97, v * 0.9]);
    p.mix(x, y + Math.ceil(r) + 0, [0.2, 0.18, 0.16], 0.6);
  }
  // cracks
  for (let k = 0; k < 6; k++) {
    let x = R() * 64, y = R() * 64, a = R() * Math.PI * 2;
    for (let j = 0; j < 14; j++) {
      p.mix(x, y, [0.2, 0.18, 0.15], 0.55);
      a += (R() - 0.5) * 1.2;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  return p.quantize(20);
}

/** Asphalt road, 64 across x 128 along: aggregate, cracks, tar patches, faded lines. */
function asphalt() {
  const p = new Pix(64, 128);
  const R = rng(21);
  p.paint((x, y, c) => {
    const n = fbm(x / 10, y / 10, 6.4, 12.8, 3, 9);
    P.asphalt(0.35 + 0.35 * n + (hash2(x, y, 4) - 0.5) * 0.22, c);
  });
  // tar patches (darker, smoother rectangles)
  for (let k = 0; k < 4; k++) {
    const x = 6 + Math.floor(R() * 44), y = Math.floor(R() * 128), w = 6 + Math.floor(R() * 14), h = 5 + Math.floor(R() * 16);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.mix(x + i, y + j, P.asphalt(0.18 + hash2(i, j, k) * 0.08, tmp), 0.85);
  }
  // cracks: wandering dark lines, some branching
  for (let k = 0; k < 9; k++) {
    let x = 4 + R() * 56, y = R() * 128, a = R() < 0.5 ? Math.PI / 2 : R() * Math.PI;
    const n = 10 + Math.floor(R() * 26);
    for (let j = 0; j < n; j++) {
      p.mix(x, y, [0.06, 0.06, 0.07], 0.75);
      a += (R() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  // edge lines (white, broken) and the centre dashes (yellow, faded)
  const fade = (x, y) => 0.25 + 0.55 * fbm(x / 3, y / 5, 64 / 3, 128 / 5, 2, 31);
  for (let y = 0; y < 128; y++) {
    for (const ex of [4, 5, 58, 59]) if (hash2(ex, y >> 2, 3) > 0.15) p.mix(ex, y, [0.72, 0.71, 0.66], fade(ex, y));
    if (y % 64 < 34) for (const cx of [31, 32]) p.mix(cx, y, [0.74, 0.62, 0.26], fade(cx, y) + 0.1);
  }
  // crumbling edges into gravel
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 3; x++) {
      if (hash2(x, y, 8) < 0.6 - x * 0.18) p.set(x, y, P.sand(0.3 + hash2(x, y, 9) * 0.4, tmp));
      if (hash2(63 - x, y, 8) < 0.6 - x * 0.18) p.set(63 - x, y, P.sand(0.3 + hash2(x, y, 10) * 0.4, tmp));
    }
  }
  return p.quantize(22);
}

/** Dirt road, 32 across x 64 along: two ruts, a grassy hump, ragged dithered edges (alpha). */
function dirtRoad(track = false) {
  const p = new Pix(32, 64);
  p.paint((x, y, c) => {
    const n = fbm(x / 5, y / 6, 6.4, 64 / 6, 3, track ? 44 : 41);
    const u = (x + 0.5) / 32;
    const rut = Math.exp(-(((u - 0.28) / 0.07) ** 2)) + Math.exp(-(((u - 0.72) / 0.07) ** 2));
    const hump = Math.exp(-(((u - 0.5) / 0.09) ** 2));
    P.dirt(0.5 + 0.3 * n - rut * 0.28 + (hash2(x, y, 2) - 0.5) * 0.18, c);
    // grass on the hump and creeping in from the edges
    const edge = Math.max(0, Math.abs(u - 0.5) * 2 - 0.72) / 0.28;
    const g = Math.min(1, hump * (track ? 1.1 : 0.75) * (0.6 + 0.6 * n) + edge * 0.9 * (0.5 + n));
    if (g > 0.35 + bayer(x, y) * 0.5) P.grass(0.35 + 0.4 * n + hash2(x, y, 5) * 0.2, c);
    // ragged edge: dithered alpha
    const a = 1 - Math.max(0, Math.abs(u - 0.5) * 2 - (track ? 0.6 : 0.78)) / (track ? 0.4 : 0.22) - (n - 0.5) * 0.6;
    return a > bayer(x, y) ? 1 : 0;
  });
  // puddle-dark ruts with a few pebbles
  const R = rng(track ? 45 : 43);
  for (let k = 0; k < 18; k++) {
    const x = Math.floor(R() * 32), y = Math.floor(R() * 64);
    if (p.getA(x, y) > 0) p.mix(x, y, [0.6, 0.56, 0.48], 0.5);
  }
  return p.quantize(20);
}

/** Gravel (yard, shoulders, the compound floor). */
function gravel() {
  const p = new Pix(64, 64);
  const R = rng(51);
  p.paint((x, y, c) => {
    P.sand(0.35 + 0.25 * fbm(x / 8, y / 8, 8, 8, 3, 50), c);
  });
  for (let k = 0; k < 420; k++) {
    const x = Math.floor(R() * 64), y = Math.floor(R() * 64);
    const v = R();
    const col = v < 0.5 ? P.concrete(0.3 + R() * 0.6, tmp) : P.sand(0.4 + R() * 0.6, tmp);
    p.set(x, y, col);
    if (R() < 0.5) p.set(x + 1, y, col);
    p.mix(x, y + 1, [0.15, 0.13, 0.1], 0.45);
  }
  return p.quantize(20);
}

/** Red-brown brick, running bond, 64 x 64 (2.4 m square). */
function brick() {
  const p = new Pix(64, 64);
  const mortar = hex(0x7e766a);
  p.fill(mortar);
  const bw = 8, bh = 4;
  for (let row = 0; row < 16; row++) {
    const off = row % 2 ? 4 : 0;
    for (let col = -1; col < 9; col++) {
      const x0 = col * bw + off, y0 = row * bh;
      const base = 0.3 + hash2(col + 20, row, 7) * 0.5;
      const sooty = hash2(col, row + 40, 7) < 0.12;
      for (let j = 0; j < bh - 1; j++) {
        for (let i = 0; i < bw - 1; i++) {
          let v = base + (hash2(x0 + i, y0 + j, 3) - 0.5) * 0.16 + (j === 0 ? 0.08 : 0) - (j === bh - 2 ? 0.08 : 0);
          if (sooty) v *= 0.55;
          p.set(x0 + i, y0 + j, P.brick(v, tmp));
        }
      }
    }
  }
  // grime streaks
  for (let x = 0; x < 64; x++) {
    const s = fbm(x / 6, 0, 64 / 6, 1, 2, 9);
    for (let y = 0; y < 64; y++) if (fbm(x / 6, y / 20, 64 / 6, 64 / 20, 2, 19) * s > 0.42) p.mul(x, y, 0.82);
  }
  return p.quantize(20);
}

/** Vertical boards. palette: greyWood | redWood | cabin; gaps between boards; knots; grain. */
function boards(pal, seed, opts = {}) {
  const p = new Pix(64, 64);
  const R = rng(seed);
  const bw = opts.board ?? 8;
  p.paint((x, y, c) => {
    const b = Math.floor(x / bw);
    const bx = x % bw;
    const tone = hash2(b, 0, seed) * 0.3;
    const grain = fbm(x / 1.5, y / 14, 64 / 1.5, 64 / 14, 2, seed + b);
    let v = 0.35 + tone + 0.3 * grain + (hash2(x, y, seed) - 0.5) * 0.08;
    if (bx === 0) v = 0.08; // gap
    if (bx === 1) v *= 0.8;
    if (bx === bw - 1) v *= 1.08;
    pal(v, c);
    // weathering: paint worn off near the bottom (rows near y=63 are the bottom in UV v=0? the
    // texture's v grows upward, canvas y grows down: y near 63 is the bottom of the wall)
    if (opts.wear) {
      const w = fbm(x / 4, y / 6, 16, 64 / 6, 3, seed + 3) + (y / 64) * opts.wear;
      if (w > 0.95) P.greyWood(0.35 + grain * 0.4, c);
    }
  });
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(R() * 64), y = Math.floor(R() * 64);
    if (x % bw < 2) continue;
    p.mix(x, y, [0.12, 0.08, 0.05], 0.7).mix(x, y + 1, [0.12, 0.08, 0.05], 0.4);
  }
  // nail heads at the cross rails
  for (let b = 0; b < 64 / bw; b++) for (const ny of [10, 52]) p.mix(b * bw + 3, ny, [0.15, 0.13, 0.12], 0.8);
  return p.quantize(22);
}

/** White clapboard (horizontal laps) with peeling paint. */
function clapboard() {
  const p = new Pix(64, 64);
  p.paint((x, y, c) => {
    const lap = y % 6;
    const n = fbm(x / 6, y / 6, 64 / 6, 64 / 6, 3, 61);
    let v = 0.62 + 0.25 * n + (lap === 0 ? 0.12 : 0) - (lap === 5 ? 0.38 : 0) - (lap === 4 ? 0.1 : 0);
    P.white(v, c);
    const peel = fbm(x / 5, y / 4, 64 / 5, 16, 3, 63);
    if (peel > 0.66 && lap < 4) P.greyWood(0.35 + n * 0.3, c);
    // dirt toward the bottom of the texture (the base of the wall)
    if (y > 44) {
      const k = (y - 44) / 20;
      c[0] *= 1 - 0.25 * k;
      c[1] *= 1 - 0.27 * k;
      c[2] *= 1 - 0.3 * k;
    }
  });
  return p.quantize(22);
}

/** Corrugated metal with rust (vertical ridges every 4 texels). 32 x 32. */
function corrugated(rusty = 1) {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const ridge = [0.85, 1.1, 0.95, 0.62][x % 4];
    const n = fbm(x / 4, y / 4, 8, 8, 3, 71);
    P.steel(0.5 * ridge + 0.15 * n, c);
    const r = fbm(x / 3, y / 5, 32 / 3, 32 / 5, 3, 72) + (y / 32) * 0.25;
    if (r > 0.62 - rusty * 0.1) P.rust((0.35 + n * 0.4) * ridge, c);
    // streaks running down from the rivets
    if (fbm(x / 2, y / 16, 16, 2, 2, 73) > 0.62) {
      c[0] *= 0.85;
      c[1] *= 0.78;
      c[2] *= 0.72;
    }
  });
  return p.quantize(20);
}

/** Roof shingles in staggered courses (palette: shingle or green). */
function shingles(pal = P.shingle, seed = 81) {
  const p = new Pix(64, 64);
  p.paint((x, y, c) => {
    const row = Math.floor(y / 5), off = row % 2 ? 4 : 0;
    const col = Math.floor((x + off) / 8);
    const ry = y % 5, rx = (x + off) % 8;
    let v = 0.35 + hash2(col, row, seed) * 0.4 + (fbm(x / 5, y / 5, 64 / 5, 64 / 5, 2, seed) - 0.5) * 0.2;
    if (ry === 4) v *= 0.45; // shadow under each course
    if (rx === 0) v *= 0.7; // gaps
    if (hash2(col, row, seed + 1) < 0.05) v *= 0.4; // a missing shingle
    pal(v, c);
    // lichen / moss
    if (fbm(x / 7, y / 7, 64 / 7, 64 / 7, 3, seed + 5) > 0.66) {
      c[0] = c[0] * 0.7 + 0.12;
      c[1] = c[1] * 0.7 + 0.14;
      c[2] = c[2] * 0.7 + 0.06;
    }
  });
  return p.quantize(20);
}

/** Concrete: slab joints, stains, a few cracks. */
function concrete(seed = 91) {
  const p = new Pix(64, 64);
  const R = rng(seed);
  p.paint((x, y, c) => {
    const n = fbm(x / 9, y / 9, 64 / 9, 64 / 9, 4, seed);
    P.concrete(0.45 + 0.3 * n + (hash2(x, y, seed) - 0.5) * 0.12, c);
    if (x % 32 === 0 || y % 32 === 0) {
      c[0] *= 0.7;
      c[1] *= 0.7;
      c[2] *= 0.7;
    }
    const st = fbm(x / 12, y / 5, 64 / 12, 64 / 5, 2, seed + 2);
    if (st > 0.62) {
      c[0] *= 0.82;
      c[1] *= 0.8;
      c[2] *= 0.76;
    }
  });
  for (let k = 0; k < 4; k++) {
    let x = R() * 64, y = R() * 64, a = R() * 6.28;
    for (let j = 0; j < 18; j++) {
      p.mix(x, y, [0.2, 0.2, 0.19], 0.6);
      a += (R() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  return p.quantize(20);
}

/** Galvanised tower steel with rust drips (32 x 32). */
function towerSteel() {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const n = fbm(x / 4, y / 4, 8, 8, 3, 101);
    P.steel(0.42 + 0.22 * n + (hash2(x, y, 1) - 0.5) * 0.08, c);
    // a few rust specks and short drips (galvanised, weathered, not candy-striped)
    const drip = fbm(x / 1.5, y / 6, 32 / 1.5, 32 / 6, 2, 103);
    if (drip > 0.7) {
      const r = P.rust(0.35 + n * 0.3, tmp2);
      c[0] = c[0] * 0.6 + r[0] * 0.4;
      c[1] = c[1] * 0.6 + r[1] * 0.4;
      c[2] = c[2] * 0.6 + r[2] * 0.4;
    }
  });
  return p.quantize(18);
}

/** Bark: vertical fissures (32 x 32). */
function bark() {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const f = fbm(x / 2, y / 9, 16, 32 / 9, 3, 111);
    const n = hash2(x, y, 112);
    P.bark(f * 1.1 + (n - 0.5) * 0.12 - (Math.abs(((x * 0.37 + f * 3) % 1) - 0.5) < 0.12 ? 0.3 : 0), c);
  });
  return p.quantize(16);
}

/** Leaf clusters (alpha-cut), neutral-ish olive so instance colours can tint autumn hues. */
function foliage(seed = 121) {
  const p = new Pix(64, 64);
  const R = rng(seed);
  p.fill([0, 0, 0], 0);
  for (let k = 0; k < 150; k++) {
    const cx = R() * 64, cy = R() * 64, r = 2 + R() * 4;
    const lit = R();
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1 || hash2(x, y, k) < d * 0.5) continue;
        // lit from the upper left inside each clump
        const sh = 0.35 + 0.5 * lit + ((cx - x) + (cy - y)) / (r * 6) + (hash2(x, y, seed) - 0.5) * 0.25;
        p.set(x, y, [0.32 * sh + 0.06, 0.36 * sh + 0.06, 0.18 * sh + 0.03], 1);
      }
    }
  }
  return p.quantize(18, 0.5);
}

/** A tree card (alpha): pine | broad | bare | poplar, drawn as a front-on silhouette. */
function treeCard(kind, seed) {
  const W = kind === 'pine' || kind === 'poplar' ? 64 : 128, H = 128;
  const p = new Pix(W, H);
  p.fill([0, 0, 0], 0);
  const R = rng(seed);
  const cx = W / 2;
  const trunkCol = (v) => P.bark(v, tmp2);
  if (kind === 'pine') {
    // trunk
    for (let y = 96; y < H; y++) for (let x = cx - 2; x < cx + 2; x++) p.set(x, y, trunkCol(0.3 + hash2(x, y, 1) * 0.3), 1);
    // tiers of drooping branches
    for (let tier = 0; tier < 9; tier++) {
      const ty = 8 + tier * 11, tw = 4 + tier * 3.1;
      for (let y = ty; y < ty + 16; y++) {
        const k = (y - ty) / 16;
        const half = tw * (0.35 + 0.65 * k) * (0.85 + R() * 0.15);
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const e = Math.abs(x - cx) / Math.max(1, half);
          if (hash2(x, y, seed) < e * e * 0.7) continue;
          const v = 0.25 + 0.4 * (1 - k) + (x < cx ? 0.12 : -0.05) + (hash2(x, y, seed + 1) - 0.5) * 0.3;
          p.set(x, y, [0.1 + 0.16 * v, 0.15 + 0.2 * v, 0.1 + 0.11 * v], 1);
        }
      }
    }
  } else if (kind === 'poplar') {
    for (let y = 100; y < H; y++) for (let x = cx - 2; x < cx + 2; x++) p.set(x, y, trunkCol(0.35 + hash2(x, y, 2) * 0.3), 1);
    for (let y = 6; y < 110; y++) {
      const k = (y - 6) / 104;
      const half = 13 * Math.sin(Math.PI * Math.pow(k, 0.7)) * (0.8 + 0.3 * vnoise(y / 5, 0, 64, 1, seed));
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const e = Math.abs(x - cx) / Math.max(1, half);
        if (hash2(x, y, seed) < e * 0.6) continue;
        const v = 0.35 + 0.4 * fbm(x / 3, y / 3, 64, 64, 2, seed) + (x < cx ? 0.1 : -0.1);
        p.set(x, y, [0.34 * v + 0.08, 0.34 * v + 0.07, 0.16 * v + 0.03], 1);
      }
    }
  } else {
    // broad / bare: trunk + recursive branches; broad adds leaf clumps along the branches
    const branch = (x, y, a, len, w, depth) => {
      const n = Math.ceil(len);
      let px = x, py = y;
      for (let j = 0; j < n; j++) {
        px += Math.cos(a);
        py -= Math.sin(a);
        a += (R() - 0.5) * 0.25;
        const ww = Math.max(0.5, w * (1 - j / n * 0.5));
        for (let dx = -Math.floor(ww); dx <= Math.floor(ww); dx++) p.set(px + dx, py, trunkCol(0.25 + (dx < 0 ? 0.2 : 0) + hash2(px, py, 3) * 0.2), 1);
      }
      if (depth > 0) {
        const k = 2 + (R() < 0.4 ? 1 : 0);
        for (let i = 0; i < k; i++) branch(px, py, a + (R() - 0.5) * 1.6, len * (0.55 + R() * 0.2), w * 0.6, depth - 1);
      } else if (kind === 'broad') {
        const r = 6 + R() * 7;
        for (let yy = -r; yy <= r; yy++) {
          for (let xx = -r; xx <= r; xx++) {
            const d = Math.hypot(xx, yy * 1.2) / r;
            if (d > 1 || hash2(px + xx, py + yy, seed) < d * 0.8) continue;
            const v = 0.3 + 0.5 * (1 - (yy + r) / (2 * r)) + (xx < 0 ? 0.1 : -0.05) + (hash2(xx, yy, 9) - 0.5) * 0.25;
            p.set(px + xx, py + yy, [0.3 * v + 0.07, 0.32 * v + 0.07, 0.16 * v + 0.03], 1);
          }
        }
      }
    };
    for (let y = 92; y < H; y++) for (let x = cx - 3; x <= cx + 3; x++) p.set(x, y, trunkCol(0.25 + (x < cx ? 0.2 : 0) + hash2(x, y, 5) * 0.2), 1);
    branch(cx, 94, Math.PI / 2, 26, 3, kind === 'bare' ? 4 : 3);
    branch(cx, 98, Math.PI / 2 + 0.6, 18, 2, 3);
    branch(cx, 99, Math.PI / 2 - 0.6, 18, 2, 3);
  }
  return p.quantize(16, 0.4);
}

/** A strip of treeline silhouettes, 256 x 64, tileable horizontally (alpha). */
function treeline(seed = 141) {
  const p = new Pix(256, 64);
  p.fill([0, 0, 0], 0);
  const R = rng(seed);
  // a dense lower band, then crowns: pines (triangles) and round broadleaf tops
  for (let x = 0; x < 256; x++) {
    const base = 30 + 8 * fbm(x / 20, 0, 256 / 20, 1, 3, seed);
    for (let y = Math.floor(base); y < 64; y++) p.set(x, y, [0.11, 0.13, 0.1], 1);
  }
  for (let k = 0; k < 70; k++) {
    const x = R() * 256, h = 18 + R() * 26, pine = R() < 0.55, w = pine ? 4 + R() * 4 : 7 + R() * 8;
    const top = 64 - 20 - h;
    for (let y = Math.floor(top); y < 50; y++) {
      const k2 = (y - top) / h;
      const half = pine ? w * Math.min(1, k2 * 1.15) : w * Math.sqrt(Math.max(0, 1 - (2 * k2 - 1) ** 2)) * (k2 > 0.5 ? 1 : 0.95);
      for (let xx = Math.floor(x - half); xx <= x + half; xx++) {
        const e = Math.abs(xx - x) / Math.max(1, half);
        if (hash2(xx, y, seed + k) < e * 0.55) continue;
        const v = 0.5 + (xx < x ? 0.18 : -0.1) + (hash2(xx, y, 3) - 0.5) * 0.25 + (1 - k2) * 0.15;
        p.set(xx, y, pine ? [0.08 + 0.08 * v, 0.12 + 0.1 * v, 0.09 + 0.06 * v] : [0.13 + 0.13 * v, 0.14 + 0.11 * v, 0.08 + 0.06 * v], 1);
      }
    }
  }
  return p.quantize(14, 0.4);
}

/** Corn rows (alpha): dry late-season stalks, leaves and tassels, 64 x 64 (1.6 m x 2.4 m). */
function cornRow() {
  const p = new Pix(64, 64);
  p.fill([0, 0, 0], 0);
  const R = rng(151);
  for (let s = 0; s < 9; s++) {
    const x0 = 3 + s * 7 + Math.floor(R() * 3), top = 4 + Math.floor(R() * 10);
    // stalk
    for (let y = top; y < 64; y++) {
      const v = 0.45 + 0.25 * (y / 64) + (hash2(x0, y, 1) - 0.5) * 0.1;
      p.set(x0, y, P.corn(v, tmp), 1).set(x0 + 1, y, P.corn(v - 0.15, tmp), 1);
    }
    // tassel
    for (let k = 0; k < 4; k++) p.line(x0, top, x0 + (k - 1.5) * 1.5, top - 3 - (k % 2), P.corn(0.95, tmp), 1, 1);
    // leaves: arcs out and down
    for (let l = 0; l < 6; l++) {
      const ly = top + 8 + l * 7 + Math.floor(R() * 3), dir = l % 2 ? 1 : -1, len = 6 + Math.floor(R() * 6);
      for (let j = 0; j < len; j++) {
        const lx = x0 + dir * (j + 1), yy = ly - Math.round(Math.sin((j / len) * 2.2) * 3) + Math.floor((j * j) / (len * 2.2));
        const v = 0.62 + 0.25 * (1 - j / len) - (dir > 0 ? 0.12 : 0) + (hash2(lx, yy, 5) - 0.5) * 0.15;
        p.set(lx, yy, P.corn(v, tmp), 1);
        if (j < len * 0.6) p.set(lx, yy + 1, P.corn(v - 0.2, tmp), 1);
      }
    }
    // a cob
    if (R() < 0.7) {
      const cy = top + 22 + Math.floor(R() * 10);
      for (let j = 0; j < 6; j++) p.set(x0 + 2, cy + j, P.hay(0.5 + (j % 2) * 0.2, tmp), 1).set(x0 + 3, cy + j + 1, P.hay(0.35, tmp), 1);
    }
  }
  return p.quantize(16, 0.4);
}

/** Corn canopy from above (alpha): a tangle of drooping leaves. */
function cornTop() {
  const p = new Pix(64, 64);
  p.fill([0, 0, 0], 0);
  const R = rng(161);
  for (let k = 0; k < 120; k++) {
    let x = R() * 64, y = R() * 64, a = R() * 6.28;
    const len = 5 + R() * 8, v0 = 0.45 + R() * 0.4;
    for (let j = 0; j < len; j++) {
      p.set(x, y, P.corn(v0 - (j / len) * 0.2, tmp), 1);
      a += (R() - 0.5) * 0.4;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  return p.quantize(14, 0.4);
}

/** Grass tufts card (alpha): a clump of blades seen from the side. 32 x 32. */
function grassTuft() {
  const p = new Pix(32, 32);
  p.fill([0, 0, 0], 0);
  const R = rng(171);
  for (let k = 0; k < 26; k++) {
    let x = 6 + R() * 20, y = 31;
    const h = 8 + R() * 20, lean = (R() - 0.5) * 0.9, dry = R() < 0.25;
    for (let j = 0; j < h; j++) {
      const v = 0.25 + 0.45 * (j / h) + (hash2(k, j, 1) - 0.5) * 0.1;
      p.set(x, y, dry ? P.hay(v * 0.75, tmp) : P.grass(v * 0.85, tmp), 1);
      x += lean * (j / h) * 1.2;
      y -= 1;
    }
  }
  return p.quantize(14, 0.4);
}

/** Hay: straw strands (side of a round bale) and the rolled end (spiral). 64 x 32 atlas. */
function hay() {
  const p = new Pix(64, 32);
  // left half: side (strands along u)
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const s = fbm(x / 8, y / 1.2, 4, 32 / 1.2, 2, 181);
      P.hay(0.3 + 0.6 * s + (hash2(x, y, 2) - 0.5) * 0.15, tmp);
      p.set(x, y, tmp);
    }
  }
  // right half: the end, a spiral roll
  for (let y = 0; y < 32; y++) {
    for (let x = 32; x < 64; x++) {
      const dx = x - 48 + 0.5, dy = y - 16 + 0.5;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const spiral = Math.sin(r * 1.6 - a * 1.0);
      const v = r > 15.5 ? 0.25 : 0.42 + 0.22 * spiral + (hash2(x, y, 3) - 0.5) * 0.2 - (r < 2 ? 0.2 : 0);
      p.set(x, y, P.hay(v, tmp));
    }
  }
  return p.quantize(16);
}

/** Burlap sandbags in courses (32 x 32). */
function sandbags() {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
    const bx = (x + off) % 16, by = y % 8;
    const ex = Math.min(bx, 15 - bx) / 3, ey = Math.min(by, 7 - by) / 2;
    const bulge = Math.min(1, Math.min(ex, ey));
    const weave = ((x + y) % 2) * 0.06;
    P.sand(0.2 + 0.55 * bulge + weave + (hash2(x, y, row) - 0.5) * 0.1 - (by === 7 ? 0.2 : 0), c);
  });
  return p.quantize(16);
}

/** Chain-link mesh (alpha): 1-texel wires on a diamond grid, 32 x 32 (one diamond ~ 6 cm). */
function chainLink() {
  const p = new Pix(32, 32);
  p.fill([0, 0, 0], 0);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const a = (x + y) % 8, b = (x - y + 64) % 8;
      if (a === 0 || b === 0) {
        const v = 0.55 + 0.3 * hash2(x, y, 1) - (a === 0 && b === 0 ? 0 : 0.05);
        p.set(x, y, [v * 0.95, v * 0.97, v], 1);
      }
    }
  }
  return p;
}

/** Steel bar grating (alpha), 32 x 32. */
function grating() {
  const p = new Pix(36, 36);
  p.fill([0, 0, 0], 0);
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 36; x++) {
      if (x % 6 === 0 || y === 0) {
        const v = 0.28 + 0.16 * hash2(x, y, 3) + (x % 6 === 0 ? 0.06 : 0);
        P.steel(v, tmp);
        if (fbm(x / 4, y / 4, 8, 8, 2, 7) > 0.68) {
          const r = P.rust(v, tmp2);
          tmp[0] = (tmp[0] + r[0]) / 2;
          tmp[1] = (tmp[1] + r[1]) / 2;
          tmp[2] = (tmp[2] + r[2]) / 2;
        }
        p.set(x, y, tmp, 1);
      }
    }
  }
  return p;
}

/** Charred wood (burnt houses): black boards with grey ash and a few raw-wood scars. */
function charred() {
  const p = new Pix(64, 64);
  p.paint((x, y, c) => {
    const b = Math.floor(x / 8), bx = x % 8;
    const alligator = Math.abs(Math.sin(y * 0.9 + hash2(b, Math.floor(y / 3), 2) * 4)) < 0.25 ? -0.15 : 0;
    const n = fbm(x / 4, y / 6, 16, 64 / 6, 3, 191);
    let v = 0.35 + 0.35 * n + alligator + (bx === 0 ? -0.3 : 0);
    P.burnt(v, c);
    if (fbm(x / 6, y / 6, 64 / 6, 64 / 6, 2, 193) > 0.7) P.greyWood(0.2 + n * 0.3, c);
  });
  return p.quantize(16);
}

/** The cabin's stained boards (exterior). */
function cabinWood() {
  return boards(ramp([[0, 0x2a1810], [0.35, 0x4c2c1c], [0.7, 0x6a3e28], [1, 0x8a5838]]), 201, { board: 8, wear: 0.5 });
}

/** Honey pine boards inside the cabin (horizontal, knotty). */
function cabinPine() {
  const p = new Pix(64, 64);
  const pal = ramp([[0, 0x3a2414], [0.35, 0x6e4a2a], [0.7, 0x926838], [1, 0xb08850]]);
  p.paint((x, y, c) => {
    const b = Math.floor(y / 8), by = y % 8;
    const grain = fbm(x / 14, y / 1.5, 64 / 14, 64 / 1.5, 2, 207 + b);
    let v = 0.4 + 0.22 * hash2(b, 0, 205) + 0.3 * grain + (hash2(x, y, 206) - 0.5) * 0.06;
    if (by === 0) v = 0.12;
    if (by === 1) v *= 0.85;
    pal(v, c);
  });
  const R = rng(208);
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(R() * 64), y = 2 + Math.floor(R() * 8) * 8 + Math.floor(R() * 4);
    p.mix(x, y, [0.2, 0.12, 0.06], 0.75).mix(x + 1, y, [0.25, 0.15, 0.08], 0.5);
  }
  return p.quantize(20);
}

/** A window decal: frame + dark panes (some broken), 32 x 32 (alpha frame). */
function windowTex(broken = 0.3, seed = 211) {
  const p = new Pix(32, 32);
  const R = rng(seed);
  const frame = hex(0x9a968a);
  p.fill(frame, 1);
  // panes: 2 x 2 sash
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x0 = 3 + px * 14, y0 = 3 + py * 14;
      const brk = R() < broken;
      for (let y = y0; y < y0 + 12; y++) {
        for (let x = x0; x < x0 + 12; x++) {
          const refl = Math.max(0, 1 - Math.abs((x - x0) - (y - y0) * 0.6 - 4) / 3) * 0.25;
          const v = 0.08 + refl + (y - y0) * 0.004;
          p.set(x, y, [v * 0.9, v, v * 1.15], 1);
        }
      }
      if (brk) {
        // jagged hole: black with a shard outline
        const cx = x0 + 3 + R() * 6, cy = y0 + 3 + R() * 6, r = 3 + R() * 4;
        for (let y = y0; y < y0 + 12; y++) {
          for (let x = x0; x < x0 + 12; x++) {
            const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
            if (d < r * (0.6 + 0.4 * Math.abs(Math.sin(a * 3 + seed)))) p.set(x, y, [0.02, 0.02, 0.025], 1);
          }
        }
      }
    }
  }
  // dark outline
  for (let k = 0; k < 32; k++) {
    p.mix(k, 0, [0, 0, 0], 0.5).mix(k, 31, [0, 0, 0], 0.5).mix(0, k, [0, 0, 0], 0.5).mix(31, k, [0, 0, 0], 0.5);
  }
  return p.quantize(16);
}

/** Car atlas 64 x 64: [0..31,0..31] paint (white, tinted by vertex colour) with rust and grime;
 *  [32..63,0..31] window glass; [0..31,32..63] tyre + hub; [32..63,32..63] burnt shell. */
function carAtlas() {
  const p = new Pix(64, 64);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = fbm(x / 5, y / 5, 32 / 5, 32 / 5, 3, 221);
      let c = [0.78 + n * 0.2, 0.78 + n * 0.2, 0.78 + n * 0.2];
      const rust = fbm(x / 4, y / 4, 8, 8, 3, 222) + (y / 32) * 0.3;
      if (rust > 0.78) c = P.rust(0.3 + n * 0.5, [0, 0, 0]);
      if (y > 24) c = c.map((v) => v * (0.75 - (y - 24) * 0.02));
      p.set(x, y, c);
    }
    for (let x = 32; x < 64; x++) {
      const g = 0.06 + Math.max(0, 1 - Math.abs((x - 32) - y * 0.7 - 8) / 5) * 0.18 + (y / 32) * 0.08;
      p.set(x, y, [g * 0.85, g * 0.92, g * 1.1]);
    }
  }
  for (let y = 32; y < 64; y++) {
    for (let x = 0; x < 32; x++) {
      const r = Math.hypot(x - 15.5, y - 47.5);
      const v = r < 6 ? 0.45 + hash2(x, y, 1) * 0.1 : r < 7 ? 0.2 : r < 15.5 ? 0.08 + ((Math.atan2(y - 47.5, x - 15.5) * 6) % 1 > 0.5 ? 0.03 : 0) : 0.05;
      p.set(x, y, [v, v, v * 1.05]);
    }
    for (let x = 32; x < 64; x++) {
      const n = fbm(x / 4, y / 4, 8, 8, 3, 225);
      P.burnt(0.25 + n * 0.6, tmp);
      if (n > 0.66) P.rust(0.25 + n * 0.3, tmp);
      p.set(x, y, tmp);
    }
  }
  return p.quantize(20);
}

/**
 * Signs atlas, 256 x 256 (rects listed in SIGN_UV, in texels, origin top-left):
 * range boards, KEEP OUT, the gas station's pole sign, the town sign, the store's board,
 * the water tower band, the fuel tank labels and the HELP on the farmhouse roof.
 */
export const SIGN_UV = {};
function signs() {
  const p = new Pix(256, 256);
  p.fill([0, 0, 0], 0);
  const put = (key, x, y, w, h) => (SIGN_UV[key] = [x, y, w, h]);
  const black = [0.06, 0.06, 0.06], white = [0.86, 0.85, 0.8], red = [0.62, 0.12, 0.08], yellow = [0.86, 0.68, 0.16];
  // range boards: 64 x 40 each (white, black border, number, a red band)
  [100, 150, 200, 250].forEach((d, i) => {
    const x0 = (i % 2) * 64, y0 = Math.floor(i / 2) * 40;
    put(`range${d}`, x0, y0, 64, 40);
    p.rectA(x0, y0, 64, 40, black);
    for (let y = y0 + 2; y < y0 + 38; y++) {
      for (let x = x0 + 2; x < x0 + 62; x++) {
        const n = fbm(x / 6, y / 6, 256, 256, 2, 231);
        p.set(x, y, [white[0] - 0.15 * n, white[1] - 0.15 * n, white[2] - 0.17 * n], 1);
      }
    }
    const t = String(d);
    drawText(p, t, x0 + 32 - Math.floor(textWidth(t, 3, 1) / 2), y0 + 5, black, { scale: 3, spacing: 1 });
    p.rectA(x0 + 2, y0 + 30, 60, 8, red);
    drawText(p, 'M', x0 + 30, y0 + 30, white, { scale: 1 });
    // weathering, a bullet hole or two
    const R = rng(d);
    for (let k = 0; k < 3; k++) {
      const hx = x0 + 6 + Math.floor(R() * 52), hy = y0 + 6 + Math.floor(R() * 28);
      p.set(hx, hy, [0.02, 0.02, 0.02], 1).mix(hx + 1, hy, white, 0.6);
    }
  });
  // KEEP OUT: hand-painted red on grey planks, 128 x 32 at (128, 0)
  put('keepout', 128, 0, 128, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 128; x < 256; x++) {
      const b = Math.floor(y / 8), v = 0.35 + 0.3 * fbm(x / 1.5, y / 10, 256, 256, 2, 233 + b) + (y % 8 === 0 ? -0.25 : 0);
      p.set(x, y, P.greyWood(v, tmp), 1);
    }
  }
  drawText(p, 'KEEP OUT', 128 + 64 - Math.floor(textWidth('KEEP OUT', 2, 1) / 2), 6, [0.58, 0.07, 0.05], { scale: 2, jitter: 2, drip: 0.35, seed: 5 });
  // gas pole sign: 96 x 72 at (128, 32): red header LAST CHANCE, big GAS, price board
  put('gas', 128, 32, 96, 72);
  p.rectA(128, 32, 96, 72, [0.1, 0.1, 0.12]);
  p.rectA(130, 34, 92, 16, red);
  drawText(p, 'LAST CHANCE', 128 + 48 - Math.floor(textWidth('LAST CHANCE', 1, 1) / 2), 38, white, {});
  p.rectA(130, 52, 92, 30, yellow);
  drawText(p, 'GAS', 128 + 48 - Math.floor(textWidth('GAS', 3, 2) / 2), 57, [0.12, 0.08, 0.06], { scale: 3, spacing: 2 });
  p.rectA(130, 84, 92, 18, [0.88, 0.87, 0.82]);
  drawText(p, 'EAT  1.29', 128 + 48 - Math.floor(textWidth('EAT  1.29', 1, 1) / 2), 89, black, {});
  // town sign: green, 96 x 40 at (0, 80)
  put('town', 0, 80, 96, 40);
  p.rectA(0, 80, 96, 40, [0.82, 0.83, 0.78]);
  p.rectA(2, 82, 92, 36, [0.1, 0.32, 0.18]);
  drawText(p, 'HOLLOW CREEK', 48 - Math.floor(textWidth('HOLLOW CREEK', 1, 1) / 2), 89, white, {});
  drawText(p, 'POP 312', 48 - Math.floor(textWidth('POP 312', 1, 1) / 2), 103, white, {});
  // someone crossed out the population
  p.line(26, 106, 70, 106, [0.6, 0.1, 0.08], 1, 1).line(26, 107, 70, 105, [0.6, 0.1, 0.08], 1, 1);
  {
    const R = rng(3);
    for (let k = 0; k < 7; k++) {
      const hx = 4 + Math.floor(R() * 88), hy = 83 + Math.floor(R() * 34);
      p.set(hx, hy, [0.02, 0.02, 0.02], 1).mix(hx + 1, hy + 1, white, 0.7).mix(hx - 1, hy, white, 0.4);
    }
  }
  // store board: 128 x 24 at (96, 104)
  put('store', 96, 104, 128, 24);
  for (let y = 104; y < 128; y++) for (let x = 96; x < 224; x++) p.set(x, y, P.redWood(0.3 + 0.25 * fbm(x / 2, y / 8, 256, 256, 2, 241), tmp), 1);
  drawText(p, 'GENERAL STORE', 160 - Math.floor(textWidth('GENERAL STORE', 1, 1) / 2), 112, [0.85, 0.8, 0.62], {});
  // water tower band: 128 x 16 at (0, 128) (white band, black letters)
  put('tower', 0, 128, 128, 16);
  for (let y = 128; y < 144; y++) for (let x = 0; x < 128; x++) p.set(x, y, P.white(0.55 + 0.3 * fbm(x / 4, y / 4, 256, 256, 2, 251), tmp), 1);
  drawText(p, 'HOLLOW CREEK', 64 - Math.floor(textWidth('HOLLOW CREEK', 1, 1) / 2), 132, [0.1, 0.1, 0.1], {});
  // tank labels: 64 x 12 each at (128, 128) and (128, 140)
  for (const [k, txt, y0] of [['diesel', 'DIESEL', 128], ['unleaded', 'UNLEADED', 140]]) {
    put(k, 128, y0, 64, 12);
    p.rectA(128, y0, 64, 12, [0.82, 0.81, 0.76]);
    drawText(p, txt, 160 - Math.floor(textWidth(txt, 1, 1) / 2), y0 + 3, [0.65, 0.12, 0.08], {});
  }
  // HELP, white paint on the roof (alpha), 96 x 32 at (0, 160)
  put('help', 0, 160, 96, 32);
  drawText(p, 'HELP', 48 - Math.floor(textWidth('HELP', 4, 2) / 2), 162, [0.86, 0.85, 0.8], { scale: 4, spacing: 2, jitter: 3, seed: 9 });
  // graffiti (alpha): THEY COME AT NIGHT, 128 x 12 at (96, 160)
  put('graffiti', 96, 160, 128, 12);
  drawText(p, 'THEY COME AT NIGHT', 96 + 64 - Math.floor(textWidth('THEY COME AT NIGHT', 1, 1) / 2), 162, [0.5, 0.08, 0.06], { jitter: 1, drip: 0.3, seed: 4 });
  // speed limit 55: 24 x 32 at (224, 32)
  put('speed', 224, 32, 24, 32);
  p.rectA(224, 32, 24, 32, black);
  p.rectA(225, 33, 22, 30, white);
  drawText(p, '55', 226, 44, black, { scale: 1, spacing: 1 });
  drawText(p, 'SPEED', 224, 35, black, { scale: 1, spacing: 0 });
  return p;
}

/**
 * Props atlas, 128 x 128: ammo crate side (0,0,32,32), crate top (32,0), radio panel (64,0),
 * map (96,0,32,32), calendar (0,32,16,24), can label (16,32,16,16), jerry can (32,32), generator
 * panel (64,32), lantern glass (96,32,16,16), cot blanket (0,64,32,32), mine top (32,64,16,16),
 * barrel side (48,64,32,32), barrel top (80,64,16,16), bullet box (96,64,16,16), tarp (0,96,32,32).
 */
export const PROP_UV = {
  crate: [0, 0, 32, 32], crateTop: [32, 0, 32, 32], radio: [64, 0, 32, 32], map: [96, 0, 32, 32],
  calendar: [0, 32, 16, 24], can: [16, 32, 16, 16], jerry: [32, 32, 32, 32], genPanel: [64, 32, 32, 32],
  lanternGlass: [96, 32, 16, 16], blanket: [0, 64, 32, 32], mine: [32, 64, 16, 16], barrel: [48, 64, 32, 32],
  barrelTop: [80, 64, 16, 16], ammoBox: [96, 64, 16, 16], tarp: [0, 96, 32, 32], metal: [32, 96, 32, 32],
  wood: [64, 96, 32, 32], rope: [96, 96, 16, 16], cloth: [112, 96, 16, 16],
};
function props() {
  const p = new Pix(128, 128);
  const U = PROP_UV;
  const area = (k, f) => {
    const [x0, y0, w, h] = U[k];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x0 + x, y0 + y, f(x, y, w, h, [0, 0, 0]), 1);
  };
  const od = ramp([[0, 0x262a18], [0.5, 0x485030], [1, 0x6a7448]]);
  area('crate', (x, y, w, h, c) => {
    const frame = x < 3 || x > w - 4 || y < 3 || y > h - 4 || Math.abs(x - y) < 2;
    return od((frame ? 0.65 : 0.45) + (fbm(x / 3, y / 3, 32, 32, 2, 261) - 0.5) * 0.3 + (y % 6 === 0 && !frame ? -0.2 : 0), c);
  });
  drawText(p, '7.62', U.crate[0] + 5, U.crate[1] + 12, [0.82, 0.78, 0.55], {});
  area('crateTop', (x, y, w, h, c) => od(0.45 + (x % 8 === 0 ? -0.25 : 0) + (fbm(x / 2, y / 8, 32, 32, 2, 262) - 0.5) * 0.3, c));
  area('radio', (x, y, w, h, c) => {
    const v = 0.22 + (fbm(x / 3, y / 3, 32, 32, 2, 263) - 0.5) * 0.08;
    c[0] = v * 0.9; c[1] = v; c[2] = v * 0.85;
    if (y > 4 && y < 14 && x > 3 && x < 18) { c[0] = 0.62; c[1] = 0.5; c[2] = 0.22; } // tuning dial window
    if (y > 6 && y < 12 && x === 6 + ((y * 3) % 10)) { c[0] = 0.8; c[1] = 0.1; c[2] = 0.05; }
    if ((x - 25) ** 2 + (y - 9) ** 2 < 10) { c[0] = 0.08; c[1] = 0.08; c[2] = 0.08; }
    if (y > 18 && y < 28 && x > 3 && x < 28 && (x + y) % 3 === 0) { c[0] = 0.1; c[1] = 0.1; c[2] = 0.1; } // speaker grille
    return c;
  });
  area('map', (x, y, w, h, c) => {
    const e = fbm(x / 6, y / 6, 64, 64, 3, 264);
    const contour = Math.abs(((e * 7) % 1) - 0.5) < 0.08;
    c[0] = 0.78 - e * 0.15; c[1] = 0.74 - e * 0.12; c[2] = 0.6 - e * 0.1;
    if (contour) { c[0] *= 0.7; c[1] *= 0.68; c[2] *= 0.6; }
    if (Math.abs(y - 20 - Math.sin(x / 5) * 2) < 1) { c[0] = 0.25; c[1] = 0.4; c[2] = 0.6; } // the river
    if (Math.abs(x - 15) < 1 && Math.abs(y - 15) < 1) { c[0] = 0.75; c[1] = 0.08; c[2] = 0.05; } // the tower
    return c;
  });
  // red circles and crosses on the map (where they come from)
  for (const [mx, my] of [[100, 5], [124, 12], [103, 27], [121, 26]]) {
    p.set(mx - 1, my, [0.7, 0.1, 0.05], 1).set(mx + 1, my, [0.7, 0.1, 0.05], 1).set(mx, my - 1, [0.7, 0.1, 0.05], 1).set(mx, my + 1, [0.7, 0.1, 0.05], 1);
  }
  area('calendar', (x, y, w, h, c) => {
    c[0] = 0.86; c[1] = 0.84; c[2] = 0.78;
    if (y < 7) { c[0] = 0.62; c[1] = 0.14; c[2] = 0.1; }
    if (y > 8 && (x % 3 === 0 || (y - 9) % 3 === 0)) { c[0] = 0.55; c[1] = 0.54; c[2] = 0.5; }
    // days crossed off
    if (y > 9 && y < 21 && x > 0 && ((x + y) % 3 === 1) && (y - 9) * 5 + x < 40) { c[0] = 0.15; c[1] = 0.15; c[2] = 0.15; }
    return c;
  });
  area('can', (x, y, w, h, c) => {
    const band = y > 4 && y < 12;
    c[0] = band ? 0.7 : 0.62; c[1] = band ? 0.18 : 0.62; c[2] = band ? 0.12 : 0.6;
    if (band && y > 6 && y < 10 && x % 4 < 2) { c[0] = 0.9; c[1] = 0.85; c[2] = 0.7; }
    return c;
  });
  area('jerry', (x, y, w, h, c) => {
    const v = 0.4 + (fbm(x / 4, y / 4, 32, 32, 2, 265) - 0.5) * 0.2 + (Math.abs(x - y) < 2 || Math.abs(x + y - 31) < 2 ? 0.12 : 0);
    c[0] = 0.75 * v + 0.1; c[1] = 0.25 * v; c[2] = 0.18 * v;
    return c;
  });
  area('genPanel', (x, y, w, h, c) => {
    const v = 0.35 + (fbm(x / 4, y / 4, 32, 32, 2, 266) - 0.5) * 0.15;
    c[0] = 0.55 * v + 0.15; c[1] = 0.6 * v + 0.12; c[2] = 0.35 * v + 0.05;
    if ((x - 8) ** 2 + (y - 10) ** 2 < 14) { c[0] = 0.85; c[1] = 0.85; c[2] = 0.78; }
    if ((x - 22) ** 2 + (y - 10) ** 2 < 14) { c[0] = 0.85; c[1] = 0.85; c[2] = 0.78; }
    if (y > 18 && y < 24 && x > 5 && x < 26) { c[0] = 0.08; c[1] = 0.08; c[2] = 0.08; }
    return c;
  });
  area('lanternGlass', (x, y, w, h, c) => {
    const v = 0.85 - Math.abs(x - 7.5) * 0.04;
    c[0] = v; c[1] = v * 0.78; c[2] = v * 0.45;
    if (x === 0 || x === 15 || y < 2 || y > 13) { c[0] = 0.15; c[1] = 0.14; c[2] = 0.12; }
    return c;
  });
  area('blanket', (x, y, w, h, c) => {
    const check = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
    const v = 0.35 + (fbm(x / 3, y / 3, 32, 32, 2, 267) - 0.5) * 0.15;
    c[0] = (check ? 0.62 : 0.32) * v + 0.06; c[1] = (check ? 0.16 : 0.24) * v + 0.04; c[2] = (check ? 0.12 : 0.18) * v + 0.04;
    return c;
  });
  area('mine', (x, y, w, h, c) => {
    const r = Math.hypot(x - 7.5, y - 7.5);
    const v = r < 2 ? 0.5 : r < 3 ? 0.18 : 0.38 + (hash2(x, y, 1) - 0.5) * 0.1;
    c[0] = v * 0.85; c[1] = v * 0.95; c[2] = v * 0.6;
    return c;
  });
  area('barrel', (x, y, w, h, c) => {
    const rib = y === 8 || y === 9 || y === 22 || y === 23;
    const v = 0.5 + (fbm(x / 3, y / 3, 32, 32, 2, 268) - 0.5) * 0.25 + (rib ? 0.15 : 0);
    c[0] = 0.72 * v + 0.12; c[1] = 0.12 * v; c[2] = 0.08 * v;
    if (fbm(x / 3, y / 4, 32, 32, 3, 269) > 0.68) { c[0] = 0.4; c[1] = 0.2; c[2] = 0.1; }
    if (y > 12 && y < 19 && x > 9 && x < 22) { c[0] = 0.85; c[1] = 0.75; c[2] = 0.2; } // hazard label
    if (y > 13 && y < 18 && x > 13 && x < 18 && (x + y) % 2) { c[0] = 0.1; c[1] = 0.1; c[2] = 0.1; }
    return c;
  });
  area('barrelTop', (x, y, w, h, c) => {
    const r = Math.hypot(x - 7.5, y - 7.5);
    const v = r > 7 ? 0.35 : r > 6 ? 0.6 : 0.5 + (hash2(x, y, 2) - 0.5) * 0.1;
    c[0] = 0.72 * v + 0.1; c[1] = 0.14 * v; c[2] = 0.1 * v;
    if ((x - 4) ** 2 + (y - 7) ** 2 < 2) { c[0] = 0.2; c[1] = 0.2; c[2] = 0.2; }
    return c;
  });
  area('ammoBox', (x, y, w, h, c) => {
    const v = 0.45 + (y < 3 ? 0.15 : 0) + (hash2(x, y, 3) - 0.5) * 0.1;
    return od(v, c);
  });
  area('tarp', (x, y, w, h, c) => {
    const f = fbm(x / 5, y / 5, 32 / 5, 32 / 5, 3, 271);
    const v = 0.3 + 0.4 * f + (Math.sin((x + f * 8) * 0.8) > 0.8 ? -0.12 : 0);
    c[0] = 0.18 * v + 0.05; c[1] = 0.3 * v + 0.06; c[2] = 0.42 * v + 0.08;
    return c;
  });
  area('metal', (x, y, w, h, c) => {
    const v = 0.45 + (fbm(x / 4, y / 4, 8, 8, 3, 272) - 0.5) * 0.3;
    P.steel(v, c);
    if (fbm(x / 3, y / 3, 32 / 3, 32 / 3, 2, 273) > 0.7) P.rust(v, c);
    return c;
  });
  area('wood', (x, y, w, h, c) => P.greyWood(0.4 + 0.35 * fbm(x / 1.5, y / 10, 32 / 1.5, 3.2, 2, 274) - (x % 8 === 0 ? 0.25 : 0), c));
  area('rope', (x, y, w, h, c) => P.hay(0.35 + ((x + y) % 4 < 2 ? 0.3 : 0), c));
  area('cloth', (x, y, w, h, c) => {
    const v = 0.4 + (fbm(x / 3, y / 3, 16, 16, 2, 275) - 0.5) * 0.3;
    c[0] = v * 0.62; c[1] = v * 0.55; c[2] = v * 0.45;
    return c;
  });
  return p.quantize(24, 0.4);
}

/** Crow sprite sheet 64 x 16: perched, wings up, wings level, wings down (alpha). */
function crows() {
  const p = new Pix(64, 16);
  p.fill([0, 0, 0], 0);
  const body = [0.05, 0.05, 0.06], hl = [0.16, 0.16, 0.2];
  // frame 0: perched (side view, facing right)
  const perched = [
    '................', '................', '................', '..........##....', '.........####...', '........######>.',
    '.......#######..', '...##########...', '.############...', '..##########....', '....#######.....', '.....#...#......',
    '.....#...#......', '................', '................', '................',
  ];
  const up = [
    '..#.........#...', '..##.......##...', '...##.....##....', '....##...##.....', '.....##.##......', '......####......',
    '.....######>....', '...#######......', '....#####.......', '......#.#.......', '................', '................',
    '................', '................', '................', '................',
  ];
  const level = [
    '................', '................', '................', '................', '................', '.......##.......',
    '##...######>..##', '.#############..', '...##########...', '.....#####......', '......#.#.......', '................',
    '................', '................', '................', '................',
  ];
  const down = [
    '................', '................', '................', '................', '................', '.......##.......',
    '......######>...', '....#########...', '...##.#####.##..', '..##...#.#...##.', '.##...........#.', '.#..............',
    '................', '................', '................', '................',
  ];
  [perched, up, level, down].forEach((rows, f) => {
    rows.forEach((r, y) => {
      for (let x = 0; x < 16; x++) {
        const ch = r[x];
        if (ch === '#') p.set(f * 16 + x, y, y < 7 && x > 6 ? hl : body, 1);
        if (ch === '>') p.set(f * 16 + x, y, [0.22, 0.2, 0.18], 1);
      }
    });
  });
  return p;
}

/** The moon: a pale disc with maria (alpha), 32 x 32. */
function moon() {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const r = Math.hypot(x - 15.5, y - 15.5) / 15.5;
    const m = fbm(x / 6, y / 6, 64, 64, 3, 281);
    const v = 0.92 - (m > 0.55 ? 0.22 : 0) - r * r * 0.12;
    c[0] = v * 0.98;
    c[1] = v * 0.97;
    c[2] = v * 0.88;
    return r <= 1 ? 1 : 0;
  });
  return p.quantize(12, 0.6);
}

/** Radial falloff for light pools / glows (linear filtered, no mips needed). */
function radial(n = 64, power = 2) {
  const p = new Pix(n, n);
  p.paint((x, y, c) => {
    const r = Math.min(1, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2));
    const v = Math.pow(1 - r, power);
    c[0] = c[1] = c[2] = v;
  });
  return p;
}

/** Headstone granite / stonework. */
function stone() {
  const p = new Pix(32, 32);
  p.paint((x, y, c) => {
    const n = fbm(x / 4, y / 4, 8, 8, 3, 291);
    P.concrete(0.35 + 0.4 * n + (hash2(x, y, 3) - 0.5) * 0.15, c);
    if (fbm(x / 3, y / 3, 32 / 3, 32 / 3, 2, 292) > 0.68) {
      c[0] = c[0] * 0.6 + 0.12;
      c[1] = c[1] * 0.6 + 0.16;
      c[2] = c[2] * 0.6 + 0.06;
    }
  });
  return p.quantize(14);
}

/** Water ripples (neutral, used as a brightness/normal-ish perturbation). */
function ripples() {
  const p = new Pix(64, 64);
  p.paint((x, y, c) => {
    const n = fbm(x / 4, y / 2, 16, 32, 3, 301);
    const s = Math.sin((y + n * 6) * 0.9) * 0.5 + 0.5;
    c[0] = c[1] = c[2] = 0.3 + 0.5 * s * n;
  });
  return p;
}

/** A tattered flag / cloth for wind flags and the windsock: red and white bands. 16 x 16. */
function flag() {
  const p = new Pix(16, 16);
  p.paint((x, y, c) => {
    const band = Math.floor(x / 4) % 2;
    const v = 0.8 + (hash2(x, y, 1) - 0.5) * 0.15;
    if (band) { c[0] = 0.78 * v; c[1] = 0.18 * v; c[2] = 0.1 * v; } else { c[0] = 0.85 * v; c[1] = 0.83 * v; c[2] = 0.76 * v; }
    // ragged trailing edge
    return x > 12 && hash2(x, y, 3) < (x - 12) / 4 ? 0 : 1;
  });
  return p;
}

// ---------------------------------------------------------------------------------------------

let CACHE = null;

/**
 * Build (once) and return every texture. Keys: grassDetail, dirtDetail, asphalt, dirtRoad, track,
 * gravel, brick, greyPlanks, redPlanks, clapboard, corrugated, shingles, greenShingles, concrete,
 * towerSteel, bark, foliage, pine, broad, bare, poplar, treeline, corn, cornTop, grassTuft, hay,
 * sandbag, chainLink, grating, charred, cabinWood, window, windowBroken, car, signs, props, crows,
 * moon, glow, pool, stone, ripples, flag.
 */
export function createTextures() {
  if (CACHE) return CACHE;
  const T = {};
  const add = (k, pix, o) => (T[k] = toTexture(pix, o));
  // the ground's detail maps are multipliers (mean 0.5, x2 in the shader): linear data, not colour
  add('grassDetail', grassDetail(), { srgb: false });
  add('dirtDetail', dirtDetail(), { srgb: false });
  add('asphalt', asphalt());
  add('dirtRoad', dirtRoad(false), { alpha: true });
  add('track', dirtRoad(true), { alpha: true });
  add('gravel', gravel());
  add('brick', brick());
  add('greyPlanks', boards(P.greyWood, 131, { wear: 0 }));
  add('redPlanks', boards(P.redWood, 133, { wear: 0.6 }));
  add('clapboard', clapboard());
  add('corrugated', corrugated(1));
  add('shingles', shingles());
  add('greenShingles', shingles(P.green, 85));
  add('concrete', concrete());
  add('towerSteel', towerSteel());
  add('bark', bark());
  add('foliage', foliage(), { alpha: true });
  add('pine', treeCard('pine', 401), { alpha: true, repeat: false });
  add('broad', treeCard('broad', 402), { alpha: true, repeat: false });
  add('bare', treeCard('bare', 403), { alpha: true, repeat: false });
  add('poplar', treeCard('poplar', 404), { alpha: true, repeat: false });
  add('treeline', treeline(), { alpha: true });
  add('corn', cornRow(), { alpha: true });
  add('cornTop', cornTop(), { alpha: true });
  add('grassTuft', grassTuft(), { alpha: true, repeat: false });
  add('hay', hay());
  add('sandbag', sandbags());
  add('chainLink', chainLink(), { alpha: true });
  add('grating', grating(), { alpha: true });
  add('charred', charred());
  add('cabinWood', cabinWood());
  add('cabinPine', cabinPine());
  add('window', windowTex(0.15, 211));
  add('windowBroken', windowTex(0.75, 213));
  add('car', carAtlas());
  add('signs', signs(), { alpha: true, repeat: false });
  add('props', props(), { repeat: false });
  add('crows', crows(), { mips: false, repeat: false });
  add('moon', moon(), { mips: false, repeat: false });
  add('glow', radial(64, 2.2), { mips: false, repeat: false, linear: true, srgb: false });
  add('pool', radial(64, 1.4), { mips: false, repeat: false, linear: true, srgb: false });
  add('stone', stone());
  add('ripples', ripples(), { linear: true, srgb: false });
  add('flag', flag(), { alpha: true, mips: false });
  CACHE = T;
  return T;
}
