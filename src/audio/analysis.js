// =============================================================================
// Numeric audio analysis for headless verification (we cannot listen in CI):
// RMS / peak (dBFS), NaN count, clipping, spectral centroid and octave-band
// energy of an AudioBuffer (or a slice of it).
// =============================================================================

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -200);

/** Stats of a buffer from `from` seconds (mixes channels to mono for the spectrum). */
export function analyzeBuffer(buffer, from = 0, to = null) {
  const sr = buffer.sampleRate, ch = buffer.numberOfChannels;
  const i0 = Math.floor(from * sr), i1 = Math.min(buffer.length, to == null ? buffer.length : Math.floor(to * sr));
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let sum = 0, peak = 0, nan = 0, clip = 0;
  const n = Math.max(1, i1 - i0), mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let c = 0; c < ch; c++) {
      const v = chans[c][i0 + i];
      if (!(v === v)) { nan++; continue; }
      const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++;
      sum += v * v; m += v;
    }
    mono[i] = m / ch;
  }
  const rms = Math.sqrt(sum / (n * ch));
  // averaged power spectrum
  const N = 8192, spec = new Float64Array(N / 2);
  let frames = 0;
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  for (let s = 0; s + N <= n; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[s + i] || 0) * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (frames > 64) break;
  }
  let tot = 0, cen = 0;
  for (let k = 1; k < N / 2; k++) { const f = k * sr / N; tot += spec[k]; cen += spec[k] * f; }
  const bands = {};
  for (const b of [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) {
    let e = 0;
    for (let k = 1; k < N / 2; k++) { const f = k * sr / N; if (f >= b / 1.414 && f < b * 1.414) e += spec[k]; }
    bands[b] = tot > 0 ? +(10 * Math.log10(e / tot + 1e-12)).toFixed(1) : -120;
  }
  return { duration: +(n / sr).toFixed(3), rmsDb: db(rms), peakDb: db(peak), nan, clip, centroid: tot > 0 ? Math.round(cen / tot) : 0, bands };
}
