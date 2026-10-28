// Pure signal analysis helpers (FFT, spectral centroid, dominant frequency, effective
// duration, Schroeder decay). Used by unit tests and runtime probes; not used in the hot path.

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Average power spectrum (Hann-windowed frames of `n` samples, 50 % overlap). */
export function powerSpectrum(b: Float32Array, n = 2048, start = 0, end = b.length): Float64Array {
  const ps = new Float64Array(n / 2);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let frames = 0;
  const e = Math.min(end, b.length);
  for (let s = Math.max(0, start); s < e; s += n / 2) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n && s + i < e; i++) re[i] = b[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    fft(re, im);
    for (let k = 0; k < n / 2; k++) ps[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (frames) for (let k = 0; k < ps.length; k++) ps[k] /= frames;
  return ps;
}

/** Spectral centroid (Hz), power-weighted, over [start, end) samples. */
export function spectralCentroid(b: Float32Array, sr: number, start = 0, end = b.length): number {
  const n = 2048;
  const ps = powerSpectrum(b, n, start, end);
  let num = 0,
    den = 0;
  for (let k = 1; k < ps.length; k++) {
    const f = (k * sr) / n;
    num += f * ps[k];
    den += ps[k];
  }
  return den > 0 ? num / den : 0;
}

/** Frequency (Hz) of the strongest spectral peak (parabolic interpolation). */
export function dominantFrequency(b: Float32Array, sr: number, start = 0, end = b.length, fMin = 30): number {
  const n = 8192;
  const ps = powerSpectrum(b, n, start, end);
  let best = 0,
    bk = 1;
  const k0 = Math.max(1, Math.floor((fMin * n) / sr));
  for (let k = k0; k < ps.length - 1; k++) {
    if (ps[k] > best) {
      best = ps[k];
      bk = k;
    }
  }
  const a = Math.sqrt(ps[bk - 1] ?? 0),
    m = Math.sqrt(ps[bk]),
    c = Math.sqrt(ps[bk + 1] ?? 0);
  const den = a - 2 * m + c;
  const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
  return ((bk + off) * sr) / n;
}

/** Lowest strong spectral peak: first local max within `rangeDb` of the global max. */
export function fundamentalEstimate(b: Float32Array, sr: number, rangeDb = 12, fMin = 30): number {
  const n = 8192;
  const ps = powerSpectrum(b, n);
  let gmax = 0;
  for (let k = 1; k < ps.length; k++) gmax = Math.max(gmax, ps[k]);
  const th = gmax * Math.pow(10, -rangeDb / 10);
  const k0 = Math.max(2, Math.floor((fMin * n) / sr));
  for (let k = k0; k < ps.length - 2; k++) {
    if (ps[k] >= th && ps[k] >= ps[k - 1] && ps[k] >= ps[k + 1] && ps[k] >= ps[k - 2] && ps[k] >= ps[k + 2]) return (k * sr) / n;
  }
  return dominantFrequency(b, sr);
}

/** Time (s) after which the 10 ms RMS envelope stays below peakRMS + thresholdDb. */
export function effectiveDuration(b: Float32Array, sr: number, thresholdDb = -40): number {
  const w = Math.max(16, Math.round(0.01 * sr));
  const env: number[] = [];
  for (let s = 0; s < b.length; s += w) {
    let acc = 0;
    const e = Math.min(b.length, s + w);
    for (let i = s; i < e; i++) acc += b[i] * b[i];
    env.push(Math.sqrt(acc / Math.max(1, e - s)));
  }
  const pk = Math.max(...env, 1e-12);
  const th = pk * Math.pow(10, thresholdDb / 20);
  let last = 0;
  for (let i = 0; i < env.length; i++) if (env[i] >= th) last = i;
  return ((last + 1) * w) / sr;
}

export function rms(b: Float32Array, start = 0, end = b.length): number {
  let s = 0;
  const e = Math.min(end, b.length);
  for (let i = Math.max(0, start); i < e; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, e - start));
}

export function peak(b: Float32Array): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i]));
  return p;
}

export const toDb = (x: number): number => (x > 1e-12 ? 20 * Math.log10(x) : -240);

/**
 * Reverb time estimate from an impulse response via Schroeder backward integration: fits
 * the decay between −5 and −25 dB (T20) and extrapolates to 60 dB.
 */
export function schroederRT60(ir: Float32Array, sr: number): number {
  const n = ir.length;
  const edc = new Float64Array(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    acc += ir[i] * ir[i];
    edc[i] = acc;
  }
  const tot = edc[0] || 1e-30;
  let t5 = -1,
    t25 = -1;
  for (let i = 0; i < n; i++) {
    const db = 10 * Math.log10(edc[i] / tot + 1e-30);
    if (t5 < 0 && db <= -5) t5 = i / sr;
    if (t25 < 0 && db <= -25) {
      t25 = i / sr;
      break;
    }
  }
  if (t5 < 0 || t25 < 0 || t25 <= t5) return 0;
  return ((t25 - t5) * 60) / 20;
}

/** Ratio of the seam jump |x[0] − x[N−1]| to the median absolute sample step (loop quality). */
export function loopSeamRatio(b: Float32Array): number {
  const steps: number[] = [];
  const stride = Math.max(1, Math.floor(b.length / 4000));
  for (let i = 1; i < b.length; i += stride) steps.push(Math.abs(b[i] - b[i - 1]));
  steps.sort((x, y) => x - y);
  const med = steps[steps.length >> 1] || 1e-9;
  return Math.abs(b[0] - b[b.length - 1]) / med;
}
