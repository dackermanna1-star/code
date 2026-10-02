/**
 * Offline signal analysis for the debug page and the automated audio check: level/peak,
 * envelope timing, spectral centroid / roll-off / band balance and spectrograms.
 */

/** In-place iterative radix-2 complex FFT (n = power of two). */
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
      let cr = 1;
      let ci = 0;
      const h = len >> 1;
      for (let k = 0; k < h; k++) {
        const ar = re[i + k + h] * cr - im[i + k + h] * ci;
        const ai = re[i + k + h] * ci + im[i + k + h] * cr;
        re[i + k + h] = re[i + k] - ar;
        im[i + k + h] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

export interface SoundMetrics {
  /** Buffer length (s). */
  duration: number;
  /** Time until the envelope finally drops below −60 dB re peak (s). */
  activeDuration: number;
  peak: number;
  peakDb: number;
  /** RMS over the active part (dBFS). */
  rmsDb: number;
  /** Energy-weighted spectral centroid (Hz). */
  centroid: number;
  /** 85 % energy roll-off (Hz). */
  rolloff: number;
  /** Energy fractions below 250 Hz and above 4 kHz. */
  low: number;
  high: number;
  /** Mean (DC) value. */
  dc: number;
  /** |first| / |last| sample relative to peak (click risk at the edges). */
  startRel: number;
  endRel: number;
  /** Time to reach 50 % of peak (s). */
  attack: number;
  finite: boolean;
}

/** Mono mixdown. */
export function mono(ch: Float32Array[]): Float32Array {
  if (ch.length === 1) return ch[0];
  const n = ch[0].length;
  const m = new Float32Array(n);
  for (const c of ch) for (let i = 0; i < n; i++) m[i] += c[i] / ch.length;
  return m;
}

export function analyze(ch: Float32Array[], sr: number): SoundMetrics {
  const x = mono(ch);
  const n = x.length;
  let finite = true;
  let peak = 0;
  let sum = 0;
  let peakAt = 0;
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) {
        finite = false;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) {
        peak = a;
        peakAt = i;
      }
    }
  }
  for (let i = 0; i < n; i++) sum += x[i];
  // envelope (5 ms RMS) for active duration & attack
  const w = Math.max(1, Math.round(0.005 * sr));
  let last = 0;
  let attack = -1;
  let rmsAcc = 0;
  let rmsN = 0;
  const thr = peak * 0.001; // −60 dB
  for (let i = 0; i < n; i += w) {
    let s = 0;
    const e = Math.min(n, i + w);
    for (let j = i; j < e; j++) s += x[j] * x[j];
    const r = Math.sqrt(s / Math.max(1, e - i));
    if (r > thr) last = e;
  }
  for (let i = 0; i < n; i++) {
    if (attack < 0 && Math.abs(x[i]) >= peak * 0.5) attack = i / sr;
    if (i < last) {
      rmsAcc += x[i] * x[i];
      rmsN++;
    }
  }
  // spectrum (energy-weighted over all frames)
  const N = 2048;
  const hop = 1024;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const P = new Float64Array(N / 2);
  const frames = Math.max(1, Math.ceil((Math.max(last, N) - N) / hop) + 1);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (o + i < n ? x[o + i] : 0) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  let tot = 0;
  let wsum = 0;
  let lo = 0;
  let hi = 0;
  const df = sr / N;
  for (let k = 1; k < N / 2; k++) {
    const f = k * df;
    tot += P[k];
    wsum += P[k] * f;
    if (f < 250) lo += P[k];
    if (f > 4000) hi += P[k];
  }
  let acc = 0;
  let rolloff = 0;
  for (let k = 1; k < N / 2; k++) {
    acc += P[k];
    if (acc >= tot * 0.85) {
      rolloff = k * df;
      break;
    }
  }
  const db = (v: number) => (v > 0 ? 20 * Math.log10(v) : -200);
  void peakAt;
  return {
    duration: n / sr,
    activeDuration: last / sr,
    peak,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(rmsAcc / Math.max(1, rmsN))),
    centroid: tot > 0 ? wsum / tot : 0,
    rolloff,
    low: tot > 0 ? lo / tot : 0,
    high: tot > 0 ? hi / tot : 0,
    dc: sum / Math.max(1, n),
    startRel: peak > 0 ? Math.abs(x[0]) / peak : 0,
    endRel: peak > 0 ? Math.abs(x[n - 1]) / peak : 0,
    attack: Math.max(0, attack),
    finite,
  };
}

export interface Spectrogram {
  /** Column-major dB values: frame f, row y → data[f * rows + y] (y = 0 at the lowest frequency). */
  data: Float32Array;
  frames: number;
  rows: number;
  fMin: number;
  fMax: number;
  hopSec: number;
  /** Per-frame RMS (dB) for a level strip. */
  level: Float32Array;
}

/** Log-frequency spectrogram (rows spaced logarithmically between fMin and fMax). */
export function spectrogram(ch: Float32Array[], sr: number, o: { rows?: number; fftSize?: number; hop?: number; fMin?: number; fMax?: number } = {}): Spectrogram {
  const x = mono(ch);
  const N = o.fftSize ?? 2048;
  const hop = o.hop ?? 256;
  const rows = o.rows ?? 256;
  const fMin = o.fMin ?? 30;
  const fMax = Math.min(o.fMax ?? 20000, sr / 2);
  const frames = Math.max(1, Math.floor((x.length - 1) / hop) + 1);
  const data = new Float32Array(frames * rows);
  const level = new Float32Array(frames);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const mag = new Float64Array(N / 2);
  const rowLo = new Float64Array(rows);
  const rowHi = new Float64Array(rows);
  for (let y = 0; y < rows; y++) {
    rowLo[y] = fMin * Math.pow(fMax / fMin, y / rows);
    rowHi[y] = fMin * Math.pow(fMax / fMin, (y + 1) / rows);
  }
  const df = sr / N;
  for (let f = 0; f < frames; f++) {
    const o0 = f * hop - N / 2;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const j = o0 + i;
      const v = j >= 0 && j < x.length ? x[j] : 0;
      re[i] = v * win[i];
      im[i] = 0;
      if (i >= N / 2 - hop / 2 && i < N / 2 + hop / 2) e += v * v;
    }
    level[f] = 10 * Math.log10(Math.max(1e-12, e / hop));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] = (re[k] * re[k] + im[k] * im[k]) / (N * N * 0.25);
    for (let y = 0; y < rows; y++) {
      const k0 = Math.max(1, Math.floor(rowLo[y] / df));
      const k1 = Math.max(k0, Math.min(N / 2 - 1, Math.floor(rowHi[y] / df)));
      let m = 0;
      for (let k = k0; k <= k1; k++) m = Math.max(m, mag[k]);
      data[f * rows + y] = 10 * Math.log10(Math.max(1e-14, m));
    }
  }
  return { data, frames, rows, fMin, fMax, hopSec: hop / sr, level };
}

/** Inferno-like colormap (t in 0..1) → [r, g, b] 0..255. */
export function colormap(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.15, 31, 12, 72],
    [0.3, 85, 15, 109],
    [0.45, 136, 34, 106],
    [0.6, 186, 54, 85],
    [0.72, 227, 89, 51],
    [0.85, 249, 140, 10],
    [0.95, 246, 201, 50],
    [1, 252, 255, 164],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const u = (c - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return [252, 255, 164];
}
