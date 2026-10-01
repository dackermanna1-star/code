// Weathering fields, per-era aging + compositing into float accumulators, and
// final output (hole clearing, pull-push color bleed, ImageData / canvases).

import { fbm, vnoise, hashf } from '../core/noise.js';
import { createCanvas, get2d } from '../core/canvas.js';

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Precompute weathering fields for a surface.
 * S: { widthM, heightM, ppm, groundLine, holes, seed, periodicX }
 * Returns { W, H, qW, qH, ero (quarter-res Float32), grime (quarter-res), grain (full-res Uint8) }
 */
export function buildFields(S, W, H, rng) {
  const q = 8;
  const qW = Math.ceil(W / q) + 2, qH = Math.ceil(H / q) + 2;
  const ero = new Float32Array(qW * qH);
  const grime = new Float32Array(qW * qH);
  const fade = new Float32Array(qW * qH);
  const seed = rng.int(0, 1e6);
  const ppm = S.ppm;
  const per = S.periodicX ? S.widthM : 0;
  // streak sources: roofline drips, under holes (sills), random runs
  const streaks = [];
  const nTop = Math.round(S.widthM * rng.range(0.25, 0.6));
  for (let i = 0; i < nTop; i++) {
    streaks.push({ x: rng.range(0, S.widthM), w: rng.range(0.08, 0.5), y0: S.heightM - rng.range(0, 0.8), len: rng.range(1.5, S.heightM), k: rng.range(0.25, 0.65) });
  }
  for (const hole of S.holes || []) {
    if (hole.kind === 'door' || hole.kind === 'shutter') continue;
    const n = Math.max(1, Math.round(hole.w / 0.35));
    for (let i = 0; i < n; i++) {
      streaks.push({ x: hole.x + rng.range(0, hole.w), w: rng.range(0.06, 0.3), y0: hole.y, len: rng.range(0.8, 3.5), k: rng.range(0.3, 0.75) });
    }
  }
  const nRand = Math.round(S.widthM * rng.range(0.1, 0.3));
  for (let i = 0; i < nRand; i++) {
    streaks.push({ x: rng.range(0, S.widthM), w: rng.range(0.05, 0.25), y0: rng.range(1.5, S.heightM), len: rng.range(0.5, 2.5), k: rng.range(0.2, 0.5) });
  }
  // lattice scales chosen so periodic surfaces (poles) wrap exactly
  const sc1 = per ? per / Math.max(1, Math.round(per / 0.55)) : 0.55;
  const sc3 = per ? per / Math.max(1, Math.round(per / 2.2)) : 2.2;
  const lac = per ? 2 : 2.03;
  for (let j = 0; j < qH; j++) {
    const vM = (j * q) / ppm; // canvas meters from top
    const yM = S.heightM - vM; // meters above segment bottom
    const hAG = yM - (S.groundLine || 0);
    const ground = hAG < 0 ? 1 : Math.exp(-hAG / 0.32) * 0.75 + Math.exp(-hAG / 1.2) * 0.12;
    for (let i = 0; i < qW; i++) {
      const xM = (i * q) / ppm;
      const n1 = fbm(xM / sc1, vM / sc1, seed, 3, lac, 0.5, per ? Math.round(per / sc1) : 0);
      let st = 0;
      for (let k = 0; k < streaks.length; k++) {
        const s = streaks[k];
        let dx = Math.abs(xM - s.x);
        if (per) dx = Math.min(dx, per - dx);
        if (dx > s.w * 1.5) continue;
        const below = s.y0 - yM;
        if (below < 0 || below > s.len) continue;
        const along = 1 - below / s.len;
        const across = Math.exp(-(dx * dx) / (s.w * s.w * 0.35));
        const wav = 0.65 + 0.35 * vnoise(xM / (s.w * 0.4 + 0.02), vM / 0.8, seed + k);
        st = Math.max(st, s.k * across * Math.min(1, along * 1.6) * wav);
      }
      const idx = j * qW + i;
      ero[idx] = 0.55 * n1 + 0.14 + ground * 0.8 + st * 0.75;
      grime[idx] = Math.min(1, ground * 0.9 + st * 0.8 + 0.15 * n1);
      fade[idx] = 0.7 + 0.6 * fbm(xM / sc3, vM / sc3, seed + 311, 2, lac, 0.5, per ? Math.round(per / sc3) : 0) + 0.25 * st;
    }
  }
  const grain = grainTile(Math.max(1, 0.016 * ppm), Math.max(2, 0.11 * ppm));
  return { W, H, q, qW, qH, ero, grime, fade, grain };
}

const grainCache = new Map();
const GT = 512;

/** Periodic value noise over a GT x GT tile with k lattice cells per side (fast path). */
function latticeTile(k, seed, out, weight) {
  const L = new Float32Array(k * k);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) L[j * k + i] = hashf(i, j, seed);
  const s = k / GT;
  const sx = new Float32Array(GT), ix0 = new Int32Array(GT), ix1 = new Int32Array(GT);
  for (let x = 0; x < GT; x++) {
    const f = x * s, i = f | 0, t = f - i;
    sx[x] = t * t * (3 - 2 * t);
    ix0[x] = i % k;
    ix1[x] = (i + 1) % k;
  }
  for (let y = 0; y < GT; y++) {
    const r0 = ix0[y] * k, r1 = ix1[y] * k, ty = sx[y];
    const row = y * GT;
    for (let x = 0; x < GT; x++) {
      const a = L[r0 + ix0[x]], b = L[r0 + ix1[x]], c = L[r1 + ix0[x]], d = L[r1 + ix1[x]];
      const tx = sx[x];
      const ab = a + (b - a) * tx, cd = c + (d - c) * tx;
      out[row + x] += (ab + (cd - ab) * ty) * weight;
    }
  }
}

/**
 * Tileable GT x GT erosion detail: chips (value noise at `fine` px), mid-scale flaking
 * (value noise at `mid` px) and pixel jitter. Values 0..255, mean ~128.
 */
function grainTile(fine, mid) {
  const kf = Math.max(1, Math.round(GT / fine)), km = Math.max(1, Math.round(GT / mid));
  const key = kf + ':' + km;
  let g = grainCache.get(key);
  if (g) return g;
  const acc = new Float32Array(GT * GT);
  latticeTile(kf, 4242, acc, 0.42);
  latticeTile(km, 5151, acc, 0.38);
  latticeTile(Math.min(GT, km * 2), 5152, acc, 0.1);
  g = new Uint8Array(GT * GT);
  for (let y = 0; y < GT; y++) {
    for (let x = 0; x < GT; x++) {
      const i = y * GT + x;
      g[i] = ((acc[i] + hashf(x, y, 4243) * 0.1) * 255) | 0;
    }
  }
  grainCache.set(key, g);
  return g;
}

let accCache = null;

export class Accumulator {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    const n = W * H;
    this.c = new Float32Array(n * 4); // premultiplied rgb + alpha
    this.m = new Float32Array(n * 3); // premultiplied metal, gloss + weight
    this.paper = new Float32Array(n);
  }

  /** Reuse the buffers of the previous surface when the size matches (less GC). */
  static get(W, H) {
    if (accCache && accCache.W === W && accCache.H === H) {
      accCache.c.fill(0);
      accCache.m.fill(0);
      accCache.paper.fill(0);
      return accCache;
    }
    accCache = new Accumulator(W, H);
    return accCache;
  }

  /**
   * Age an era layer and composite it.
   * img: color ImageData data, pimg: props ImageData data, t: age in years.
   * opts: { wallTone, eraIndex, erosion (mult), fadeMul, paperBoost }
   */
  composite(img, pimg, F, t, opts) {
    const W = this.W, H = this.H;
    // props layer may be rendered at half resolution (pshift = 1)
    const pshift = opts.pshift ?? 0;
    // optional sub-region (px): img covers [rx0, rx0+rw) x [ry0, ry0+rh); pimg covers
    // the matching props region starting at (prx0, pry0) with width prw
    const R = opts.region || { x0: 0, y0: 0, w: W, h: H, px0: 0, py0: 0, pw: pshift ? Math.ceil(W / 2) : W };
    const rx0 = R.x0, ry0 = R.y0, rw = R.w, rh = R.h;
    const prx0 = R.px0, pry0 = R.py0, pW = R.pw;
    const c = this.c, m = this.m, paper = this.paper;
    const wt = opts.wallTone;
    const fadeT = 0.85 * (1 - Math.exp(-t / 8)) * (opts.fadeMul ?? 1);
    const thr = 1.12 - 0.5 * (1 - Math.exp(-t / 9)) - 0.12 * Math.min(1, t / 60);
    const thrPaper = thr - 0.28 - 0.25 * (1 - Math.exp(-t / 3));
    const soft = 0.09;
    const ero = opts.erosion ?? 1;
    const thin = 0.4 * (1 - Math.exp(-t / 10));
    const glossK = Math.exp(-t / 3.5);
    const defGloss = 38 + (150 - 38) * glossK;
    const metalK = Math.exp(-t / 10);
    const grimeK = Math.min(0.6, t * 0.035);
    const dirt0 = wt[0] * 0.42, dirt1 = wt[1] * 0.4, dirt2 = wt[2] * 0.38;
    const wl = 0.299 * wt[0] + 0.587 * wt[1] + 0.114 * wt[2];
    const gx = ((opts.eraIndex * 73) % 97) * 7, gy = ((opts.eraIndex * 41) % 89) * 5;
    const grain = F.grain;
    const invQ = 1 / F.q, qW = F.qW;
    const eroF = F.ero, fadeF = F.fade, grimeF = F.grime;
    for (let y = ry0; y < ry0 + rh; y++) {
      const fy = y * invQ, iy = fy | 0, ty = fy - iy;
      const qrow = iy * qW;
      const row = y * W;
      const lrow = (y - ry0) * rw - rx0;
      const prow = ((y >> pshift) - pry0) * pW - prx0;
      const gyy = ((y + gy) & 511) << 9;
      for (let x = rx0; x < rx0 + rw; x++) {
        const i = row + x;
        const li = (lrow + x) * 4;
        const a8 = img[li + 3];
        if (a8 === 0) continue;
        let a = a8 / 255;
        let r = img[li], g = img[li + 1], b = img[li + 2];
        const pi4 = (prow + (x >> pshift)) * 4;
        const pa = pimg[pi4 + 3] / 255;
        const isPaper = pimg[pi4 + 2] > 128 && pa > 0.3;
        // shared bilinear setup for the three coarse weathering fields
        const fx = x * invQ, ix = fx | 0, tx = fx - ix;
        const q0 = qrow + ix, q1 = q0 + qW;
        const E0 = eroF[q0] + (eroF[q0 + 1] - eroF[q0]) * tx, E1 = eroF[q1] + (eroF[q1 + 1] - eroF[q1]) * tx;
        // erosion
        const E = E0 + (E1 - E0) * ty + (grain[gyy + ((x + gx) & 511)] / 255 - 0.5) * 0.5;
        const th = isPaper ? thrPaper : thr;
        let k = smooth(th - soft, th + soft, E) * ero;
        if (k > 1) k = 1;
        a *= (1 - k) * (1 - thin * (isPaper ? 0.3 : 1));
        if (a < 0.003) continue;
        // fade: colored pigments lose chroma (chalking), blacks lift only slightly
        // toward grey, everything picks up a little wall tint
        if (fadeT > 0) {
          const f0 = fadeF[q0] + (fadeF[q0 + 1] - fadeF[q0]) * tx, f1 = fadeF[q1] + (fadeF[q1 + 1] - fadeF[q1]) * tx;
          let f = fadeT * (f0 + (f1 - f0) * ty);
          if (f > 0.95) f = 0.95;
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          const dk = f * 0.85;
          r = l + (r - l) * (1 - dk);
          g = l + (g - l) * (1 - dk);
          b = l + (b - l) * (1 - dk);
          const lift = (wl * 0.55 + 40 - l) * f * (l < 90 ? 0.32 : 0.18);
          const tint = f * 0.2;
          r += lift + (wt[0] - r) * tint;
          g += lift + (wt[1] - g) * tint;
          b += lift + (wt[2] - b) * tint;
        }
        if (grimeK > 0) {
          const g0 = grimeF[q0] + (grimeF[q0 + 1] - grimeF[q0]) * tx, g1 = grimeF[q1] + (grimeF[q1 + 1] - grimeF[q1]) * tx;
          const gk = grimeK * (g0 + (g1 - g0) * ty);
          r += (dirt0 - r) * gk;
          g += (dirt1 - g) * gk;
          b += (dirt2 - b) * gk;
        }
        const ia = 1 - a;
        const ci = i * 4;
        c[ci] = r * a + c[ci] * ia;
        c[ci + 1] = g * a + c[ci + 1] * ia;
        c[ci + 2] = b * a + c[ci + 2] * ia;
        c[ci + 3] = a + c[ci + 3] * ia;
        // props: explicit material where the props layer was drawn, default spray
        // paint (metal 0, gloss 150) for the rest of the coverage
        {
          const mi = i * 3;
          let metal = 0, gloss = defGloss;
          if (pa > 0.004) {
            const k = pa >= a ? 1 : pa / a;
            metal = pimg[pi4] * metalK * k;
            gloss = (38 + (pimg[pi4 + 1] - 38) * glossK) * k + defGloss * (1 - k);
          }
          m[mi] = metal * a + m[mi] * ia;
          m[mi + 1] = gloss * a + m[mi + 1] * ia;
          m[mi + 2] = a + m[mi + 2] * ia;
          if (isPaper && a > paper[i]) paper[i] = a;
        }
      }
    }
  }

  /** Zero coverage inside rects (px). */
  clearRects(rects) {
    const W = this.W, H = this.H;
    for (const r of rects) {
      const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(W, Math.ceil(r.x1));
      const y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(H, Math.ceil(r.y1));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * W + x;
          this.c[i * 4] = this.c[i * 4 + 1] = this.c[i * 4 + 2] = this.c[i * 4 + 3] = 0;
          this.m[i * 3] = this.m[i * 3 + 1] = this.m[i * 3 + 2] = 0;
          this.paper[i] = 0;
        }
      }
    }
  }

  /** Build output ImageData (bled colors) and canvases. */
  finish(opts = {}) {
    const W = this.W, H = this.H, n = W * H;
    const c = this.c, m = this.m, paper = this.paper;
    const col = new Uint8ClampedArray(n * 4);
    const pr = new Uint8ClampedArray(n * 4);
    const col32 = new Uint32Array(col.buffer);
    const pr32 = new Uint32Array(pr.buffer);
    // smooth color estimate at half resolution for low-coverage texels so that
    // linear filtering / mipmapping of the straight-alpha texture has no fringes
    const fill = pullPushHalf(c, W, H);
    const fd = fill.d;
    const hw = fill.w;
    let cov = 0;
    const clampB = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0);
    const DEF_PROPS = 150 << 8;
    for (let y = 0; y < H; y++) {
      const hy = (y >> 1) * hw;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const ci = i * 4;
        const a = c[ci + 3];
        const hi = (hy + (x >> 1)) * 3;
        if (a < 0.0005) {
          col32[i] = clampB(fd[hi]) | (clampB(fd[hi + 1]) << 8) | (clampB(fd[hi + 2]) << 16);
          pr32[i] = DEF_PROPS; // default spray material where no paint (props.a = 0)
          continue;
        }
        cov += a;
        let r, g, b;
        if (a >= 0.06) {
          const ia = 1 / a;
          r = c[ci] * ia; g = c[ci + 1] * ia; b = c[ci + 2] * ia;
        } else {
          const k = a / 0.06, ia = 1 / a;
          r = c[ci] * ia * k + fd[hi] * (1 - k);
          g = c[ci + 1] * ia * k + fd[hi + 1] * (1 - k);
          b = c[ci + 2] * ia * k + fd[hi + 2] * (1 - k);
        }
        col32[i] = (clampB(r) | (clampB(g) << 8) | (clampB(b) << 16) | (clampB(a * 255) << 24)) >>> 0;
        const mi = i * 3;
        const pw = m[mi + 2];
        let mr = 0, mg = 150;
        if (pw > 0.005) { mr = m[mi] / pw; mg = m[mi + 1] / pw; }
        const pp = paper[i];
        pr32[i] = (clampB(mr) | (clampB(mg) << 8) | (clampB(pp > 0.25 ? 255 : pp * 1020) << 16) | ((a > 0.012 ? 255 : 0) << 24)) >>> 0;
      }
    }
    const colorImage = new ImageData(col, W, H);
    const propsImage = new ImageData(pr, W, H);
    let color = null, props = null;
    if (opts.canvases !== false) {
      color = createCanvas(W, H);
      get2d(color).putImageData(colorImage, 0, 0);
      props = createCanvas(W, H);
      get2d(props).putImageData(propsImage, 0, 0);
    }
    return { color, props, colorImage, propsImage, coverage: cov / n };
  }
}

/**
 * Pull-push hole filling on the premultiplied color accumulator (rgb + alpha,
 * stride 4), starting at half resolution. Returns un-premultiplied filled colors
 * { d: Float32Array(w*h*3), w, h }.
 */
function pullPushHalf(src, W, H) {
  const w0 = Math.max(1, (W + 1) >> 1), h0 = Math.max(1, (H + 1) >> 1);
  const cur = new Float32Array(w0 * h0 * 4);
  for (let y = 0; y < H; y++) {
    const row = (y >> 1) * w0;
    let si = y * W * 4;
    for (let x = 0; x < W; x++, si += 4) {
      const a = src[si + 3];
      if (a <= 0) continue;
      const di = (row + (x >> 1)) * 4;
      cur[di] += src[si] * 0.25;
      cur[di + 1] += src[si + 1] * 0.25;
      cur[di + 2] += src[si + 2] * 0.25;
      cur[di + 3] += a * 0.25;
    }
  }
  const levels = [{ d: cur, w: w0, h: h0 }];
  let w = w0, h = h0, prev = cur;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, (w + 1) >> 1), nh = Math.max(1, (h + 1) >> 1);
    const nd = new Float32Array(nw * nh * 4);
    for (let y = 0; y < h; y++) {
      const drow = (y >> 1) * nw;
      let si = y * w * 4;
      for (let x = 0; x < w; x++, si += 4) {
        const di = (drow + (x >> 1)) * 4;
        nd[di] += prev[si] * 0.25;
        nd[di + 1] += prev[si + 1] * 0.25;
        nd[di + 2] += prev[si + 2] * 0.25;
        nd[di + 3] += prev[si + 3] * 0.25;
      }
    }
    levels.push({ d: nd, w: nw, h: nh });
    prev = nd; w = nw; h = nh;
  }
  for (let L = levels.length - 2; L >= 0; L--) {
    const { d, w: lw, h: lh } = levels[L];
    const P = levels[L + 1], pd = P.d;
    for (let y = 0; y < lh; y++) {
      const prow = (y >> 1) * P.w;
      let i = y * lw * 4;
      for (let x = 0; x < lw; x++, i += 4) {
        const a = d[i + 3];
        if (a >= 1) continue;
        const ia = 1 - a;
        const pi = (prow + (x >> 1)) * 4;
        d[i] += pd[pi] * ia;
        d[i + 1] += pd[pi + 1] * ia;
        d[i + 2] += pd[pi + 2] * ia;
        d[i + 3] += pd[pi + 3] * ia;
      }
    }
  }
  const out = new Float32Array(w0 * h0 * 3);
  for (let i = 0, j = 0, k = 0; i < w0 * h0; i++, j += 4, k += 3) {
    const a = cur[j + 3];
    if (a > 1e-6) {
      const ia = 1 / a;
      out[k] = cur[j] * ia; out[k + 1] = cur[j + 1] * ia; out[k + 2] = cur[j + 2] * ia;
    } else {
      out[k] = out[k + 1] = out[k + 2] = 128;
    }
  }
  return { d: out, w: w0, h: h0 };
}
