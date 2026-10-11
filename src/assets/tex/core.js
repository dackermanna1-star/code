// Core toolkit for the procedural texture library.
// Everything here works on plain typed arrays (no DOM) so generation is fast,
// deterministic and runnable anywhere. All noise is periodic over the texture
// size so world textures tile seamlessly.

// ---------------------------------------------------------------- PRNG / hash

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer lattice hash -> [0,1). */
export function hash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Rng {
  constructor(seed) {
    this.s = (seed >>> 0) || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  /** inclusive integer range */
  int(a, b) {
    return a + Math.floor((b - a + 1) * this.next());
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  /** roughly normal, std ~1 */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
}

// ---------------------------------------------------------------- math

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smooth(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const mod = (a, n) => ((a % n) + n) % n;

// ---------------------------------------------------------------- buffer pool
// Generation allocates many short-lived full-size fields; recycling them
// between textures avoids most garbage-collection work.

const pool = new Map();
let live = [];

/** Zero-filled Float32Array, recycled by recycle(). */
export function F32(n) {
  const l = pool.get(n);
  let b;
  if (l && l.length) {
    b = l.pop();
    b.fill(0);
  } else b = new Float32Array(n);
  live.push(b);
  return b;
}

/** Give every buffer handed out since the last call back to the pool. */
export function recycle(keepBytes = 24 << 20) {
  let bytes = 0;
  for (const l of pool.values()) for (const b of l) bytes += b.byteLength;
  for (const b of live) {
    if (bytes + b.byteLength > keepBytes) continue;
    let l = pool.get(b.length);
    if (!l) pool.set(b.length, (l = []));
    l.push(b);
    bytes += b.byteLength;
  }
  live = [];
}

/** Release all pooled memory. */
export function drainPool() {
  pool.clear();
  live = [];
}

// ---------------------------------------------------------------- noise fields

/** Add one octave of tileable gradient noise (period = cx x cy cells over w x h). */
function perlinOctave(out, w, h, cx, cy, seed, amp, turb) {
  const n = cx * cy;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let j = 0; j < cy; j++) {
    for (let i = 0; i < cx; i++) {
      const a = hash(i, j, seed) * Math.PI * 2;
      gx[j * cx + i] = Math.cos(a);
      gy[j * cx + i] = Math.sin(a);
    }
  }
  // per column: fractional position in its cell and the fade weight;
  // per cell: the first column whose pixel centre falls in it
  const xf = new Float32Array(w), xu = new Float32Array(w);
  const cellStart = new Int32Array(cx + 1);
  let cur = -1;
  for (let x = 0; x < w; x++) {
    const p = ((x + 0.5) * cx) / w;
    const i0 = Math.floor(p);
    xf[x] = p - i0;
    xu[x] = fade(p - i0);
    while (cur < i0) cellStart[++cur] = x;
  }
  while (cur < cx) cellStart[++cur] = w;
  for (let y = 0; y < h; y++) {
    const p = ((y + 0.5) * cy) / h;
    const j0 = Math.floor(p);
    const fy = p - j0;
    const v = fade(fy);
    const r0 = (j0 % cy) * cx;
    const r1 = ((j0 + 1) % cy) * cx;
    const fy1 = fy - 1;
    const row = y * w;
    for (let i = 0; i < cx; i++) {
      const i1 = i + 1 === cx ? 0 : i + 1;
      // gradient dot products are linear in fx inside a cell: a = Ag*fx + Ac
      const Ag = gx[r0 + i], Ac = gy[r0 + i] * fy;
      const Bg = gx[r0 + i1], Bc = gy[r0 + i1] * fy - Bg;
      const Cg = gx[r1 + i], Cc = gy[r1 + i] * fy1;
      const Dg = gx[r1 + i1], Dc = gy[r1 + i1] * fy1 - Dg;
      const xe = cellStart[i + 1];
      for (let x = cellStart[i]; x < xe; x++) {
        const fx = xf[x], u = xu[x];
        const a = Ag * fx + Ac, b = Bg * fx + Bc, c = Cg * fx + Cc, d = Dg * fx + Dc;
        const top = a + (b - a) * u;
        const val = top + (c + (d - c) * u - top) * v;
        out[row + x] += turb ? (val < 0 ? -amp * val : amp * val) : amp * val;
      }
    }
  }
}

/** Min-max normalise in place to [0,1]. */
export function normalize(f) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const s = mx > mn ? 1 / (mx - mn) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - mn) * s;
  return f;
}

/**
 * Tileable fractal noise, normalised to [0,1].
 * cx/cy = lattice cells across the texture for the first octave.
 */
export function fbm(w, h, o = {}) {
  const { cx = 4, cy = cx, oct = 4, gain = 0.5, seed = 1, turb = false, norm = true } = o;
  const out = F32(w * h);
  let amp = 1, fx = cx, fy = cy;
  for (let k = 0; k < oct; k++) {
    if (fx > w * 1.01 || fy > h * 1.01) break;
    perlinOctave(out, w, h, Math.max(1, Math.round(fx)), Math.max(1, Math.round(fy)), (seed * 7919 + k * 1013) | 0, amp, turb);
    amp *= gain;
    fx *= 2;
    fy *= 2;
  }
  if (norm) normalize(out);
  return out;
}

/** A tileable field shifted by (dx,dy): a cheap decorrelated copy of a field. */
export function shifted(f, w, h, dx, dy) {
  const out = F32(w * h);
  for (let y = 0; y < h; y++) {
    const sy = ((y + dy) % h) * w;
    for (let x = 0; x < w; x++) out[y * w + x] = f[sy + ((x + dx) % w)];
  }
  return out;
}

/** Per-pixel white noise in [0,1). */
export function white(w, h, seed) {
  const out = F32(w * h);
  for (let i = 0; i < out.length; i++) out[i] = hash(i, 7, seed);
  return out;
}

/** Bilinear sample of a field with wrap-around. */
export function sample(f, w, h, x, y) {
  x -= 0.5;
  y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  let xa, xb, ya, yb;
  if ((w & (w - 1)) === 0 && (h & (h - 1)) === 0) {
    xa = x0 & (w - 1);
    xb = (x0 + 1) & (w - 1);
    ya = (y0 & (h - 1)) * w;
    yb = ((y0 + 1) & (h - 1)) * w;
  } else {
    xa = mod(x0, w);
    xb = (xa + 1) % w;
    ya = mod(y0, h) * w;
    yb = ((mod(y0, h) + 1) % h) * w;
  }
  const a = f[ya + xa], b = f[ya + xb], c = f[yb + xa], d = f[yb + xb];
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/**
 * Tileable Voronoi. Returns cell id, distance to own feature point (f1) and the
 * exact distance to the nearest cell border (edge), all per pixel. Cells that
 * share a `group` value are treated as one region (no border between them).
 */
export function voronoi(w, h, cx, cy, seed, jitter = 0.85, warpX = null, warpY = null, group = null) {
  const n = cx * cy, sx = w / cx, sy = h / cy;
  const fpx = new Float32Array(n), fpy = new Float32Array(n);
  for (let j = 0; j < cy; j++)
    for (let i = 0; i < cx; i++) {
      const k = j * cx + i;
      fpx[k] = (i + 0.5 + (hash(i, j, seed) - 0.5) * jitter) * sx;
      fpy[k] = (j + 0.5 + (hash(i, j, seed + 17) - 0.5) * jitter) * sy;
    }
  // per cell (including one ring of wrapped cells) the 9 candidate points and
  // their pairwise distances
  const ew = cx + 2, eh = cy + 2;
  const cpx = new Float32Array(ew * eh * 9), cpy = new Float32Array(ew * eh * 9), cid = new Int32Array(ew * eh * 9);
  const pd = new Float32Array(ew * eh * 81);
  for (let cj = -1; cj <= cy; cj++)
    for (let ci = -1; ci <= cx; ci++) {
      const base = ((cj + 1) * ew + ci + 1) * 9;
      let m = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj, jw = mod(jj, cy), oy = ((jj - jw) / cy) * h;
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di, iw = mod(ii, cx), ox = ((ii - iw) / cx) * w;
          const k = jw * cx + iw;
          cpx[base + m] = fpx[k] + ox;
          cpy[base + m] = fpy[k] + oy;
          cid[base + m] = k;
          m++;
        }
      }
      const pb = ((cj + 1) * ew + ci + 1) * 81;
      for (let a = 0; a < 9; a++)
        for (let b = 0; b < 9; b++) {
          const dx = cpx[base + a] - cpx[base + b], dy = cpy[base + a] - cpy[base + b];
          pd[pb + a * 9 + b] = Math.sqrt(dx * dx + dy * dy);
        }
    }
  const id = new Int32Array(w * h), f1 = F32(w * h), edge = F32(w * h);
  const ddx = F32(w * h), ddy = F32(w * h);
  const cd = new Float32Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const X = x + 0.5 + (warpX ? warpX[i] : 0);
      const Y = y + 0.5 + (warpY ? warpY[i] : 0);
      let ci = Math.floor(X / sx), cj = Math.floor(Y / sy);
      ci = ci < -1 ? -1 : ci > cx ? cx : ci;
      cj = cj < -1 ? -1 : cj > cy ? cy : cj;
      const cell = (cj + 1) * ew + ci + 1;
      const base = cell * 9;
      let best = 0, bd = Infinity;
      for (let m = 0; m < 9; m++) {
        const dx = cpx[base + m] - X, dy = cpy[base + m] - Y;
        const d = dx * dx + dy * dy;
        cd[m] = d;
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      let e = Infinity;
      const pb = cell * 81 + best * 9;
      const gb = group ? group[cid[base + best]] : -1;
      for (let k = 0; k < 9; k++) {
        if (k === best) continue;
        if (group && group[cid[base + k]] === gb) continue; // merged cells: no border
        const len = pd[pb + k];
        if (len < 1e-4) continue;
        const de = (cd[k] - bd) / (2 * len);
        if (de < e) e = de;
      }
      id[i] = cid[base + best];
      ddx[i] = X - cpx[base + best];
      ddy[i] = Y - cpy[base + best];
      f1[i] = Math.sqrt(bd);
      edge[i] = e;
    }
  }
  return { id, f1, edge, dx: ddx, dy: ddy, fpx, fpy, n };
}

/** Index tables for wrap-around (or clamped) neighbour access. */
function wrapIdx(n, off, wrap) {
  const t = new Int32Array(n);
  for (let i = 0; i < n; i++) t[i] = wrap ? mod(i + off, n) : clamp(i + off, 0, n - 1);
  return t;
}

// ---------------------------------------------------------------- filters

/** Separable box blur with wrap-around, radius r (integer). */
export function boxBlur(src, w, h, r, wrap = true) {
  if (r <= 0) return src;
  const tmp = F32(w * h), out = F32(w * h);
  const norm = 1 / (2 * r + 1);
  const ax = wrapIdx(w, r + 1, wrap), sxi = wrapIdx(w, -r, wrap);
  const ay = wrapIdx(h, r + 1, wrap), syi = wrapIdx(h, -r, wrap);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[o + (wrap ? mod(k, w) : clamp(k, 0, w - 1))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * norm;
      s += src[o + ax[x]] - src[o + sxi[x]];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[(wrap ? mod(k, h) : clamp(k, 0, h - 1)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * norm;
      s += tmp[ay[y] * w + x] - tmp[syi[y] * w + x];
    }
  }
  return out;
}

/** Approximate gaussian: three box passes. */
export function blur(src, w, h, r, wrap = true) {
  if (r <= 0) return src;
  const rr = Math.max(1, Math.round(r / 1.7));
  return boxBlur(boxBlur(boxBlur(src, w, h, rr, wrap), w, h, rr, wrap), w, h, rr, wrap);
}

/** Small 3x3 tent blur with wrap (sub-pixel softening). */
export function soften(src, w, h, amt = 1, wrap = true) {
  const out = F32(w * h);
  const xm = wrapIdx(w, -1, wrap), xp = wrapIdx(w, 1, wrap), ymT = wrapIdx(h, -1, wrap), ypT = wrapIdx(h, 1, wrap);
  for (let y = 0; y < h; y++) {
    const o = y * w, om = ymT[y] * w, op = ypT[y] * w;
    for (let x = 0; x < w; x++) {
      const a = xm[x], b = xp[x];
      const c = src[o + x];
      const e = src[o + a] + src[o + b] + src[om + x] + src[op + x];
      const d = src[om + a] + src[om + b] + src[op + a] + src[op + b];
      out[o + x] = c + ((c * 4 + e * 2 + d) / 16 - c) * amt;
    }
  }
  return out;
}

/**
 * Lambert shading of a height field, normalised so a flat surface = 1.
 * light = direction towards the light in image space (x right, y DOWN, z out).
 */
export function lambert(hf, w, h, strength = 1, light = [-0.45, -0.75, 0.6], wrap = true) {
  let [lx, ly, lz] = light;
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  lx /= ll;
  ly /= ll;
  lz /= ll;
  const out = F32(w * h);
  const xm = wrapIdx(w, -1, wrap), xp = wrapIdx(w, 1, wrap), ymT = wrapIdx(h, -1, wrap), ypT = wrapIdx(h, 1, wrap);
  const k = 0.5 * strength, il = 1 / lz;
  for (let y = 0; y < h; y++) {
    const o = y * w, om = ymT[y] * w, op = ypT[y] * w;
    for (let x = 0; x < w; x++) {
      const dx = (hf[o + xp[x]] - hf[o + xm[x]]) * k;
      const dy = (hf[op + x] - hf[om + x]) * k;
      const d = (-dx * lx - dy * ly + lz) / Math.sqrt(dx * dx + dy * dy + 1);
      out[o + x] = d > 0 ? d * il : 0;
    }
  }
  return out;
}

/**
 * Hard-ish cast shadows on a height field: march towards the light (dx,dy per
 * step in pixels); the pixel is shadowed if terrain rises above the ray.
 * Returns 1 = lit, 0 = fully shadowed (softened by penetration depth).
 */
export function castShadow(hf, w, h, dx, dy, steps, rise, soft = 0.5, wrap = true) {
  const out = F32(w * h);
  const ox = new Int32Array(steps + 1), oy = new Int32Array(steps + 1);
  for (let k = 1; k <= steps; k++) {
    ox[k] = Math.round(dx * k);
    oy[k] = Math.round(dy * k);
  }
  const inv = 1 / soft;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const h0 = hf[y * w + x];
      let occ = 0;
      for (let k = 1; k <= steps; k++) {
        let sx = x + ox[k], sy = y + oy[k];
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
          if (!wrap) break;
          sx = mod(sx, w);
          sy = mod(sy, h);
        }
        const over = hf[sy * w + sx] - h0 - rise * k;
        if (over > occ) occ = over;
      }
      const v = occ * inv;
      out[y * w + x] = v >= 1 ? 0 : 1 - v;
    }
  }
  return out;
}

/** Ambient occlusion estimate: how far below its blurred neighbourhood a pixel is. */
export function cavity(hf, w, h, r, wrap = true) {
  const b = blur(hf, w, h, r, wrap);
  const out = F32(w * h);
  for (let i = 0; i < out.length; i++) out[i] = b[i] - hf[i];
  return out;
}

// ---------------------------------------------------------------- images

export function makeImg(w, h, alpha = false) {
  const n = w * h;
  return {
    w,
    h,
    r: F32(n),
    g: F32(n),
    b: F32(n),
    a: alpha ? F32(n) : null,
  };
}

/** Supersampled image -> box-downsample by integer factor. */
export function downsample(img, f) {
  const w = img.w / f, h = img.h / f;
  const out = makeImg(w, h, !!img.a);
  const inv = 1 / (f * f);
  const chans = img.a ? ['r', 'g', 'b', 'a'] : ['r', 'g', 'b'];
  for (const c of chans) {
    const s = img[c], d = out[c];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let j = 0; j < f; j++) {
          const o = (y * f + j) * img.w + x * f;
          for (let i = 0; i < f; i++) acc += s[o + i];
        }
        d[y * w + x] = acc * inv;
      }
  }
  return out;
}

/**
 * Final touches shared by opaque world textures:
 *  grain    - per-pixel luminance noise amplitude (0..255 units)
 *  chroma   - per-pixel colour noise amplitude
 *  sharpen  - unsharp-mask amount (photo "crunch")
 *  soft     - pre-sharpen softening amount (0..1)
 */
export function finish(img, o = {}) {
  const { grain = 0, chroma = 0, sharpen = 0, soft = 0, seed = 1, wrap = true } = o;
  const { w, h } = img;
  for (const c of ['r', 'g', 'b']) {
    let s = img[c];
    if (soft > 0) s = soften(s, w, h, soft, wrap);
    if (sharpen > 0) {
      const b = soften(s, w, h, 1, wrap);
      for (let i = 0; i < s.length; i++) s[i] += (s[i] - b[i]) * sharpen;
    }
    img[c] = s;
  }
  if (grain > 0 || chroma > 0) {
    const n = w * h;
    const rng = new Rng(seed * 2654435761);
    for (let i = 0; i < n; i++) {
      const gn = (rng.next() + rng.next() - 1) * grain;
      img.r[i] += gn + (rng.next() - 0.5) * chroma;
      img.g[i] += gn + (rng.next() - 0.5) * chroma;
      img.b[i] += gn + (rng.next() - 0.5) * chroma;
    }
  }
  return img;
}

/** Convert float image to RGBA bytes. */
export function toRGBA(img) {
  const n = img.w * img.h;
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    d[i * 4] = img.r[i] + 0.5;
    d[i * 4 + 1] = img.g[i] + 0.5;
    d[i * 4 + 2] = img.b[i] + 0.5;
    d[i * 4 + 3] = img.a ? img.a[i] * 255 + 0.5 : 255;
  }
  return d;
}

/**
 * Median-cut palette quantisation (WAD3-style 8-bit palette) in place.
 * Works on a 15-bit histogram and splits boxes by counting (no sorting).
 */
export function quantize(data, maxColors = 256) {
  const n = data.length >> 2;
  const cnt = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  const keys = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    keys[i] = k;
    cnt[k]++;
    sr[k] += r;
    sg[k] += g;
    sb[k] += b;
  }
  let nb = 0;
  for (let k = 0; k < 32768; k++) if (cnt[k]) nb++;
  if (nb <= maxColors) return data;
  const bins = new Int32Array(nb);
  const av = [new Float32Array(32768), new Float32Array(32768), new Float32Array(32768)];
  nb = 0;
  for (let k = 0; k < 32768; k++)
    if (cnt[k]) {
      bins[nb++] = k;
      av[0][k] = sr[k] / cnt[k];
      av[1][k] = sg[k] / cnt[k];
      av[2][k] = sb[k] / cnt[k];
    }
  // a box is a range [s,e) of `bins`
  const boxes = [];
  const stat = (s, e) => {
    let c = 0, r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
    for (let i = s; i < e; i++) {
      const k = bins[i];
      c += cnt[k];
      const r = av[0][k], g = av[1][k], b = av[2][k];
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
      if (g < g0) g0 = g;
      if (g > g1) g1 = g;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    const rr = r1 - r0, rg = g1 - g0, rb = b1 - b0;
    const axis = rr >= rg && rr >= rb ? 0 : rg >= rb ? 1 : 2;
    const rng = axis === 0 ? rr : axis === 1 ? rg : rb;
    return { s, e, count: c, axis, score: e - s > 1 ? rng * rng * Math.sqrt(c) : -1 };
  };
  boxes.push(stat(0, nb));
  const hist = new Float64Array(256);
  while (boxes.length < maxColors) {
    let bi = -1, bs = 0;
    for (let i = 0; i < boxes.length; i++)
      if (boxes[i].score > bs) {
        bs = boxes[i].score;
        bi = i;
      }
    if (bi < 0) break;
    const bx = boxes[bi], A = av[bx.axis];
    hist.fill(0);
    for (let i = bx.s; i < bx.e; i++) hist[A[bins[i]] | 0] += cnt[bins[i]];
    let acc = 0, cut = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= bx.count / 2) {
        cut = v;
        break;
      }
    }
    // partition in place: values <= cut go left
    let lo = bx.s, hi = bx.e - 1;
    while (lo <= hi) {
      if ((A[bins[lo]] | 0) <= cut) lo++;
      else {
        const t = bins[lo];
        bins[lo] = bins[hi];
        bins[hi] = t;
        hi--;
      }
    }
    if (lo === bx.s || lo === bx.e) {
      // degenerate split (all on one side): split the range in half instead
      lo = (bx.s + bx.e) >> 1;
    }
    boxes[bi] = stat(bx.s, lo);
    boxes.push(stat(lo, bx.e));
  }
  const map = new Int32Array(32768);
  const pr = new Float32Array(boxes.length), pg = new Float32Array(boxes.length), pb = new Float32Array(boxes.length);
  boxes.forEach((bx, pi) => {
    let c = 0, r = 0, g = 0, b = 0;
    for (let i = bx.s; i < bx.e; i++) {
      const k = bins[i];
      c += cnt[k];
      r += sr[k];
      g += sg[k];
      b += sb[k];
      map[k] = pi;
    }
    pr[pi] = r / c;
    pg[pi] = g / c;
    pb[pi] = b / c;
  });
  for (let i = 0; i < n; i++) {
    const p = map[keys[i]];
    data[i * 4] = pr[p] + 0.5;
    data[i * 4 + 1] = pg[p] + 0.5;
    data[i * 4 + 2] = pb[p] + 0.5;
  }
  return data;
}
