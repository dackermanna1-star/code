// Numeric audio analysis used by the audio lab and scripts/audio-check.mjs:
// level statistics, Welch spectra, spectral centroid, band energy, envelopes,
// decay, loop seams and periodicity. Pure functions over Float32Array.

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// Averaged (Welch, Hann, 50% overlap) power spectrum of x[from, from + len).
export function spectrum(x, sr, { from = 0, len = x.length - from, size = 2048 } = {}) {
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const end = Math.min(x.length, from + len);
  let frames = 0;
  for (let s = from; s + size <= end || (frames === 0 && s < end); s += size / 2) {
    for (let i = 0; i < size; i++) {
      const v = s + i < end ? x[s + i] : 0;
      re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (s + size > end) break;
  }
  return { power, binHz: sr / size, frames };
}

export function centroid(spec) {
  let num = 0;
  let den = 0;
  for (let k = 1; k < spec.power.length; k++) {
    num += k * spec.binHz * spec.power[k];
    den += spec.power[k];
  }
  return den > 0 ? num / den : 0;
}

export function bandRatio(spec, lo, hi) {
  let band = 0;
  let total = 0;
  for (let k = 1; k < spec.power.length; k++) {
    const f = k * spec.binHz;
    total += spec.power[k];
    if (f >= lo && f < hi) band += spec.power[k];
  }
  return total > 0 ? band / total : 0;
}

export function peakFreq(spec, lo, hi) {
  let best = 0;
  let bestK = 0;
  for (let k = 1; k < spec.power.length; k++) {
    const f = k * spec.binHz;
    if (f < lo || f >= hi) continue;
    if (spec.power[k] > best) {
      best = spec.power[k];
      bestK = k;
    }
  }
  return bestK * spec.binHz;
}

export function levels(x) {
  let peak = 0;
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) {
      bad++;
      continue;
    }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  return { peak, rms, bad, crestDb: 20 * Math.log10(peak / Math.max(rms, 1e-12)) };
}

// RMS envelope in windows of `win` seconds.
export function envelope(x, sr, win = 0.01) {
  const n = Math.max(1, Math.round(win * sr));
  const out = new Float64Array(Math.ceil(x.length / n));
  for (let w = 0; w < out.length; w++) {
    let s = 0;
    const end = Math.min(x.length, (w + 1) * n);
    for (let i = w * n; i < end; i++) s += x[i] * x[i];
    out[w] = Math.sqrt(s / Math.max(1, end - w * n));
  }
  return out;
}

const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));

// Peak position and how long the envelope takes to fall 20 and 40 dB below its peak.
export function decay(x, sr) {
  const win = 0.005;
  const env = envelope(x, sr, win);
  let pk = 0;
  let pi = 0;
  for (let i = 0; i < env.length; i++) {
    if (env[i] > pk) {
      pk = env[i];
      pi = i;
    }
  }
  const fall = (dropDb) => {
    // last window still above the threshold
    let last = pi;
    for (let i = pi; i < env.length; i++) if (db(env[i]) > db(pk) - dropDb) last = i;
    return (last - pi) * win;
  };
  const q = Math.floor(env.length / 4);
  const head = env.slice(0, Math.max(1, q)).reduce((a, b) => a + b * b, 0);
  const tail = env.slice(env.length - Math.max(1, q)).reduce((a, b) => a + b * b, 0);
  return { peakAt: pi * win, t20: fall(20), t40: fall(40), tailToHeadDb: 10 * Math.log10(Math.max(tail, 1e-20) / Math.max(head, 1e-20)) };
}

// How abrupt the loop boundary is: the wrap-around step compared with the largest
// step inside the loop (a click would be the biggest jump in the whole signal) and
// with the 99th-percentile step.
export function loopSeam(x) {
  const diffs = [];
  let max = 1e-9;
  for (let i = 1; i < x.length; i++) {
    const d = Math.abs(x[i] - x[i - 1]);
    if (d > max) max = d;
    if (i % 7 === 0) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const p99 = diffs[Math.floor(diffs.length * 0.99)] || 1e-9;
  const seam = Math.abs(x[0] - x[x.length - 1]);
  return { seam, p99, max, ratio: seam / max, p99Ratio: seam / p99 };
}

// Strongest periodicity of the amplitude envelope between minHz and maxHz.
export function envelopePeriodicity(x, sr, minHz, maxHz) {
  const win = 0.002;
  const env = envelope(x, sr, win);
  let mean = 0;
  for (const v of env) mean += v;
  mean /= env.length;
  const e = env.map((v) => v - mean);
  const lagMin = Math.max(1, Math.floor(1 / maxHz / win));
  const lagMax = Math.min(e.length - 1, Math.ceil(1 / minHz / win));
  let e0 = 0;
  for (const v of e) e0 += v * v;
  let best = -1;
  let bestLag = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = 0; i + lag < e.length; i++) s += e[i] * e[i + lag];
    const r = s / Math.max(e0, 1e-20);
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return { hz: bestLag ? 1 / (bestLag * win) : 0, strength: best };
}

// Envelope modulation depth (std/mean of a coarse RMS envelope), e.g. engine beating.
export function modulationDepth(x, sr, win = 0.05) {
  const env = envelope(x, sr, win);
  let m = 0;
  for (const v of env) m += v;
  m /= env.length;
  let s = 0;
  for (const v of env) s += (v - m) * (v - m);
  return Math.sqrt(s / env.length) / Math.max(m, 1e-12);
}

// Mixes all channels of an AudioBuffer to one Float32Array.
export function mono(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

// Summary used by the checks for one buffer.
export function describe(buffer, { loop = false } = {}) {
  const x = mono(buffer);
  const sr = buffer.sampleRate;
  const lv = levels(x);
  const spec = spectrum(x, sr, { len: Math.min(x.length, Math.round(sr * 1.5)) });
  const out = {
    seconds: buffer.duration,
    rate: sr,
    channels: buffer.numberOfChannels,
    peak: lv.peak,
    rmsDb: db(lv.rms),
    crestDb: lv.crestDb,
    bad: lv.bad,
    centroid: centroid(spec),
    low: bandRatio(spec, 20, 150),
    high: bandRatio(spec, 3000, sr / 2),
  };
  if (loop) {
    const seam = loopSeam(x);
    out.seam = seam.ratio;
    out.modDepth = modulationDepth(x, sr);
  } else {
    Object.assign(out, decay(x, sr));
    out.endAbs = Math.abs(x[x.length - 1]);
  }
  return out;
}
