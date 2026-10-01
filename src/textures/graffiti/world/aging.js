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
/**
 * Tileable GT x GT erosion detail: chips (value noise at `fine` px), mid-scale flaking
 * (value noise at `mid` px) and pixel jitter. Values 0..255, mean ~128.
 */
function grainTile(fine, mid) {
  const kf = Math.max(1, Math.round(GT / fine)), km = Math.max(1, Math.round(GT / mid));
  const key = kf + ':' + km;
  let g = grainCache.get(key);
  if (g) return g;
  g = new Uint8Array(GT * GT);
  const sf = kf / GT, sm = km / GT;
  for (let y = 0; y < GT; y++) {
    for (let x = 0; x < GT; x++) {
      const v = vnoise(x * sf, y * sf, 4242, kf, kf) * 0.42
        + vnoise(x * sm, y * sm, 5151, km, km) * 0.38
        + vnoise(x * sm * 2, y * sm * 2, 5152, km * 2, km * 2) * 0.1
        + hashf(x, y, 4243) * 0.1;
      g[y * GT + x] = (v * 255) | 0;
    }
  }
  grainCache.set(key, g);
  return g;
}

/** Bilinear sample of a quarter-res field at full-res pixel (x, y). */
function sampleQ(f, F, x, y) {
  const fx = x / F.q, fy = y / F.q;
  const ix = fx | 0, iy = fy | 0;
  const tx = fx - ix, ty = fy - iy;
  const i0 = iy * F.qW + ix;
  const a = f[i0], b = f[i0 + 1], c = f[i0 + F.qW], d = f[i0 + F.qW + 1];
  return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
}

export class Accumulator {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    const n = W * H;
    this.c = new Float32Array(n * 4); // premultiplied rgb + alpha
    this.m = new Float32Array(n * 3); // premultiplied metal, gloss + weight
    this.paper = new Float32Array(n);
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
    const pW = pshift ? Math.ceil(W / 2) : W;
    const c = this.c, m = this.m, paper = this.paper;
    const wt = opts.wallTone;
    const fadeT = 0.78 * (1 - Math.exp(-t / 11)) * (opts.fadeMul ?? 1);
    const thr = 1.28 - 0.62 * (1 - Math.exp(-t / 12)) - 0.3 * Math.min(1, t / 80);
    const thrPaper = thr - 0.28 - 0.25 * (1 - Math.exp(-t / 3));
    const soft = 0.09;
    const ero = opts.erosion ?? 1;
    const thin = 0.28 * (1 - Math.exp(-t / 14));
    const glossK = Math.exp(-t / 3.5);
    const metalK = Math.exp(-t / 10);
    const grimeK = Math.min(0.55, t * 0.03);
    const dirt0 = wt[0] * 0.42, dirt1 = wt[1] * 0.4, dirt2 = wt[2] * 0.38;
    const gx = ((opts.eraIndex * 73) % 97) * 7, gy = ((opts.eraIndex * 41) % 89) * 5;
    const grain = F.grain;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const prow = (y >> pshift) * pW;
      const gyy = ((y + gy) & 511) << 9;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const a8 = img[i * 4 + 3];
        if (a8 === 0) continue;
        let a = a8 / 255;
        let r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
        const pi4 = (prow + (x >> pshift)) * 4;
        const pa = pimg[pi4 + 3] / 255;
        const isPaper = pimg[pi4 + 2] > 128 && pa > 0.3;
        // erosion
        const E = sampleQ(F.ero, F, x, y) + (grain[gyy + ((x + gx) & 511)] / 255 - 0.5) * 0.5;
        const th = isPaper ? thrPaper : thr;
        let k = smooth(th - soft, th + soft, E) * ero;
        if (k > 1) k = 1;
        a *= (1 - k) * (1 - thin * (isPaper ? 0.3 : 1));
        if (a < 0.003) continue;
        // fade toward chalky wall-tinted color
        if (fadeT > 0) {
          let f = fadeT * sampleQ(F.fade, F, x, y);
          if (f > 0.95) f = 0.95;
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          const chalk = l * 0.9 + 20;
          const tr = chalk * 0.65 + wt[0] * 0.35, tg = chalk * 0.65 + wt[1] * 0.35, tb = chalk * 0.65 + wt[2] * 0.35;
          r += (tr - r) * f;
          g += (tg - g) * f;
          b += (tb - b) * f;
        }
        if (grimeK > 0) {
          const gk = grimeK * sampleQ(F.grime, F, x, y);
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
        // props
        const w = a < pa ? a : pa;
        if (w > 0) {
          const mi = i * 3;
          const metal = pimg[pi4] * metalK;
          const gloss = 38 + (pimg[pi4 + 1] - 38) * glossK;
          const iw = 1 - w;
          m[mi] = metal * w + m[mi] * iw;
          m[mi + 1] = gloss * w + m[mi + 1] * iw;
          m[mi + 2] = w + m[mi + 2] * iw;
          if (isPaper) {
            const p = a;
            if (p > paper[i]) paper[i] = p;
          }
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
    // smooth color estimate at half resolution for low-coverage texels so that
    // linear filtering / mipmapping of the straight-alpha texture has no fringes
    const fill = pullPushHalf(c, 4, W, H, [0, 1, 2], 3, 2);
    const pfill = pullPushHalf(m, 3, W, H, [0, 1], 2, 4);
    const hw = fill.w, qw = pfill.w;
    let cov = 0;
    for (let y = 0; y < H; y++) {
      const hy = (y >> 1) * hw;
      const qy = (y >> 2) * qw;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = c[i * 4 + 3];
        cov += a;
        const hi = (hy + (x >> 1)) * 3;
        let r, g, b;
        if (a >= 0.06) {
          r = c[i * 4] / a; g = c[i * 4 + 1] / a; b = c[i * 4 + 2] / a;
        } else {
          const k = a / 0.06;
          const ia = a > 1e-6 ? 1 / a : 0;
          r = c[i * 4] * ia * k + fill.d[hi] * (1 - k);
          g = c[i * 4 + 1] * ia * k + fill.d[hi + 1] * (1 - k);
          b = c[i * 4 + 2] * ia * k + fill.d[hi + 2] * (1 - k);
        }
        const o = i * 4;
        col[o] = r; col[o + 1] = g; col[o + 2] = b;
        col[o + 3] = a * 255 + 0.5;
        const pw = m[i * 3 + 2];
        if (pw > 0.05) { pr[o] = m[i * 3] / pw; pr[o + 1] = m[i * 3 + 1] / pw; }
        else { const qi = (qy + (x >> 2)) * 2; pr[o] = pfill.d[qi]; pr[o + 1] = pfill.d[qi + 1]; }
        const pp = paper[i];
        pr[o + 2] = pp > 0.25 ? 255 : pp * 1020;
        pr[o + 3] = a > 0.012 ? 255 : 0;
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
 * Pull-push hole filling on a premultiplied buffer, starting at 1/f resolution
 * (f = 2 or 4). src: interleaved floats with `stride`; channels c0..c(nc-1) are
 * premultiplied by the weight channel `ai`. Returns un-premultiplied filled values
 * { d: Float32Array(w*h*nc), w, h, f }.
 */
function pullPushHalf(src, stride, W, H, chans, ai, f = 2) {
  const nc = chans.length;
  const S = 4; // packed: up to 3 channels + weight
  const w0 = Math.max(1, Math.ceil(W / f)), h0 = Math.max(1, Math.ceil(H / f));
  const cur = new Float32Array(w0 * h0 * S);
  const c0 = chans[0], c1 = chans[1], c2 = nc > 2 ? chans[2] : -1;
  const inv = 1 / (f * f);
  for (let y = 0; y < H; y++) {
    const row = ((y / f) | 0) * w0;
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * stride;
      const a = src[si + ai];
      if (a <= 0) continue;
      const di = (row + ((x / f) | 0)) * S;
      cur[di] += src[si + c0] * inv;
      cur[di + 1] += src[si + c1] * inv;
      if (c2 >= 0) cur[di + 2] += src[si + c2] * inv;
      cur[di + 3] += a * inv;
    }
  }
  const levels = [{ d: cur, w: w0, h: h0 }];
  let w = w0, h = h0, prev = cur;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, (w + 1) >> 1), nh = Math.max(1, (h + 1) >> 1);
    const nd = new Float32Array(nw * nh * S);
    for (let y = 0; y < h; y++) {
      const drow = (y >> 1) * nw;
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * S;
        const di = (drow + (x >> 1)) * S;
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
    const P = levels[L + 1];
    for (let y = 0; y < lh; y++) {
      const prow = (y >> 1) * P.w;
      for (let x = 0; x < lw; x++) {
        const i = (y * lw + x) * S;
        const a = d[i + 3];
        if (a >= 1) continue;
        const ia = 1 - a;
        const pi = (prow + (x >> 1)) * S;
        d[i] += P.d[pi] * ia;
        d[i + 1] += P.d[pi + 1] * ia;
        d[i + 2] += P.d[pi + 2] * ia;
        d[i + 3] += P.d[pi + 3] * ia;
      }
    }
  }
  const out = new Float32Array(w0 * h0 * nc);
  for (let i = 0; i < w0 * h0; i++) {
    const a = cur[i * S + 3];
    const k = a > 1e-6 ? 1 / a : 0;
    out[i * nc] = a > 1e-6 ? cur[i * S] * k : 128;
    out[i * nc + 1] = a > 1e-6 ? cur[i * S + 1] * k : 128;
    if (nc > 2) out[i * nc + 2] = a > 1e-6 ? cur[i * S + 2] * k : 128;
  }
  return { d: out, w: w0, h: h0, f };
}
