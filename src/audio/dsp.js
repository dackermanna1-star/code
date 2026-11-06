// Dead County audio — DSP foundation.
// Seeded RNG, cached noise buffers, a small graph-building helper ("Synth") used by every sound
// recipe inside an OfflineAudioContext, JS buffer generators (crackle, impulse responses) and
// post-processing (trim / normalise / seamless loop crossfade).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => Math.pow(10, db / 20);

/** mulberry32 – small fast seeded PRNG, returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeBuffer(length, sampleRate, channels = 1) {
  length = Math.max(1, length | 0);
  if (typeof AudioBuffer === 'function') {
    try {
      return new AudioBuffer({ length, sampleRate, numberOfChannels: channels });
    } catch (e) {
      /* fall through */
    }
  }
  // very old browsers: borrow a throwaway offline context
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return new Ctx(channels, length, sampleRate).createBuffer(channels, length, sampleRate);
}

// ---------------------------------------------------------------------------------------------
// Noise buffers (shared between all contexts; an AudioBuffer is not bound to a context)
// ---------------------------------------------------------------------------------------------
const NOISE_SECONDS = 5;
const _noise = new Map();

/** Seamless looping noise of a given colour: 'white' | 'pink' | 'brown'. RMS ≈ 0.3 for all kinds. */
export function noiseBuffer(kind, sr) {
  const key = kind + ':' + sr;
  let buf = _noise.get(key);
  if (buf) return buf;
  const n = Math.floor(NOISE_SECONDS * sr);
  buf = makeBuffer(n, sr, 1);
  const d = buf.getChannelData(0);
  const r = mulberry32(kind === 'white' ? 101 : kind === 'pink' ? 202 : 303);
  if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else if (kind === 'brown') {
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = (b + 0.02 * (r() * 2 - 1)) / 1.02;
      d[i] = b;
    }
  } else {
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  }
  // remove DC, normalise RMS to 0.3
  let mean = 0;
  for (let i = 0; i < n; i++) mean += d[i];
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    d[i] -= mean;
    ss += d[i] * d[i];
  }
  const k = 0.3 / Math.sqrt(ss / n);
  for (let i = 0; i < n; i++) d[i] *= k;
  // crossfade the end into the start so the buffer loops seamlessly
  const xf = Math.floor(0.05 * sr);
  const loopLen = n - xf;
  const out = makeBuffer(loopLen, sr, 1);
  const o = out.getChannelData(0);
  for (let i = 0; i < loopLen; i++) o[i] = d[i];
  for (let i = 0; i < xf; i++) {
    const x = i / xf;
    o[i] = d[i] * Math.sqrt(x) + d[loopLen + i] * Math.sqrt(1 - x);
  }
  _noise.set(key, out);
  return out;
}

/**
 * Sparse random grains ("crackle"): Poisson process of tiny decaying noise bursts or pings.
 * Used for gravel, leaves, fire, rain drops, cloth rips, bone crunches...
 * opts: rate (grains/s), gmin/gmax (grain length s), pow (amplitude distribution exponent; higher =
 * more small grains), env(x01)→0..1 density envelope, ping (0 = noise grains, else sine grains of
 * random freq in [ping, ping2]).
 */
export function crackleBuffer(sr, dur, opts, rnd) {
  const { rate = 200, gmin = 0.0004, gmax = 0.003, pow = 2.5, env = null, ping = 0, ping2 = 0, decay = 5 } = opts;
  const n = Math.max(1, Math.ceil(dur * sr));
  const buf = makeBuffer(n, sr, 1);
  const d = buf.getChannelData(0);
  let t = 0;
  let guard = 0;
  while (guard++ < 200000) {
    t += -Math.log(1 - rnd() * 0.999999) / rate;
    if (t >= dur) break;
    if (env && rnd() > env(t / dur)) continue;
    const amp = Math.pow(rnd(), pow) * (rnd() < 0.5 ? -1 : 1);
    const gl = Math.max(3, Math.floor((gmin + (gmax - gmin) * rnd()) * sr));
    const i0 = Math.floor(t * sr);
    const dm = Math.exp(-decay / gl); // per-sample decay multiplier
    let e = amp;
    if (ping > 0) {
      // sine "ping" grain (glass shards, droplets): ~0.4 ms raised-cosine attack so it rings rather than clicks
      const f = ping + (ping2 - ping) * rnd();
      const w = (2 * Math.PI * f) / sr;
      const cw = Math.cos(w), sw = Math.sin(w);
      let c = 1, sn = 0;
      const att = Math.max(2, Math.floor(0.0004 * sr));
      for (let j = 0; j < gl && i0 + j < n; j++) {
        const a = j < att ? 0.5 - 0.5 * Math.cos((Math.PI * j) / att) : 1;
        d[i0 + j] += e * a * sn;
        const c2 = c * cw - sn * sw;
        sn = sn * cw + c * sw;
        c = c2;
        e *= dm;
      }
    } else {
      for (let j = 0; j < gl && i0 + j < n; j++) {
        d[i0 + j] += e * (rnd() * 2 - 1);
        e *= dm;
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Waveshaper curves
// ---------------------------------------------------------------------------------------------
const _curves = new Map();
/** tanh soft clip; the curve covers inputs in [-4, 4] (a 0.25 pre-gain is applied by Synth.sat).
 *  Small-signal gain is 1, output saturates at ±1/k: larger k = harder drive. */
function tanhCurve(k) {
  const key = 'tanh' + k;
  let c = _curves.get(key);
  if (c) return c;
  const N = 2048;
  c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = ((i / (N - 1)) * 2 - 1) * 4;
    c[i] = Math.tanh(k * x) / k; // unity small-signal gain, saturates at ±1/k
  }
  _curves.set(key, c);
  return c;
}
/** asymmetric "fuzz" curve for harsh distortion (adds even harmonics) */
function fuzzCurve(k) {
  const key = 'fuzz' + k;
  let c = _curves.get(key);
  if (c) return c;
  const N = 2048;
  c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = ((i / (N - 1)) * 2 - 1) * 4;
    const y = x >= 0 ? Math.tanh(k * x) : Math.tanh(k * 0.6 * x) * 0.8;
    c[i] = y / k;
  }
  _curves.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Synth: graph-building helper bound to one (offline) context and one variant
// ---------------------------------------------------------------------------------------------
export class Synth {
  constructor(ctx, out, rnd) {
    this.ctx = ctx;
    this.out = out;
    this.r = rnd;
    this.sr = ctx.sampleRate;
    this.T = ctx.length ? ctx.length / ctx.sampleRate : 30;
  }
  // --- randomness -------------------------------------------------------------------------
  rand(a = 0, b = 1) {
    return a + (b - a) * this.r();
  }
  irand(a, b) {
    return a + Math.floor(this.r() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.r() * arr.length)];
  }
  chance(p) {
    return this.r() < p;
  }
  /** multiplicative variation: v * (1 ± amt) */
  vary(v, amt = 0.1) {
    return v * (1 + (this.r() * 2 - 1) * amt);
  }
  // --- nodes ------------------------------------------------------------------------------
  g(v = 1) {
    const n = this.ctx.createGain();
    n.gain.value = v;
    return n;
  }
  f(type, freq, Q = 0.7071, gainDb = 0) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = Math.min(freq, this.sr * 0.49);
    n.Q.value = Q;
    if (gainDb) n.gain.value = gainDb;
    return n;
  }
  lp(f, Q) {
    return this.f('lowpass', f, Q);
  }
  hp(f, Q) {
    return this.f('highpass', f, Q);
  }
  bp(f, Q = 1) {
    return this.f('bandpass', f, Q);
  }
  peak(f, Q, db) {
    return this.f('peaking', f, Q, db);
  }
  osc(type, freq, t0 = 0, t1 = this.T) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    t0 = Math.max(0, t0);
    o.start(t0);
    o.stop(Math.max(t0 + 0.001, Math.min(t1, this.T)));
    return o;
  }
  noise(kind = 'white', t0 = 0, t1 = this.T, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(kind, this.sr);
    s.loop = true;
    s.playbackRate.value = rate;
    t0 = Math.max(0, t0);
    s.start(t0, this.r() * (s.buffer.duration - 0.05));
    s.stop(Math.max(t0 + 0.001, Math.min(t1, this.T)));
    return s;
  }
  src(buffer, t0 = 0, rate = 1, loop = false, t1 = this.T) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    s.playbackRate.value = rate;
    s.start(Math.max(0, t0));
    if (loop) s.stop(Math.min(t1, this.T));
    return s;
  }
  konst(v = 0, t0 = 0, t1 = this.T) {
    const c = this.ctx.createConstantSource();
    c.offset.value = v;
    c.start(Math.max(0, t0));
    c.stop(Math.min(t1, this.T));
    return c;
  }
  delay(t, max = t + 0.01) {
    const d = this.ctx.createDelay(Math.max(max, t + 0.001));
    d.delayTime.value = t;
    return d;
  }
  /** soft saturator: {in, out} composite with a 0.25 pre-gain so inputs up to ±4 are safe */
  sat(k = 2, kind = 'tanh') {
    const pre = this.g(0.25);
    const ws = this.ctx.createWaveShaper();
    ws.curve = kind === 'fuzz' ? fuzzCurve(k) : tanhCurve(k);
    ws.oversample = '2x';
    pre.connect(ws);
    return { in: pre, out: ws, connect: (d) => ws.connect(d.in || d) };
  }
  /** connect nodes (or {in,out} composites) in series, returns the last */
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i].out || nodes[i];
      const b = nodes[i + 1].in || nodes[i + 1];
      a.connect(b);
    }
    return nodes[nodes.length - 1];
  }
  // --- envelopes --------------------------------------------------------------------------
  /**
   * Automation from a point list: [[time, value, kind?, tau?], ...]
   * kind: 'l' linear (default), 'e' exponential, 's' set, 't' setTarget(tau)
   */
  env(param, pts) {
    for (let i = 0; i < pts.length; i++) {
      const [t, v, kind, tau] = pts[i];
      const tt = Math.max(0, t);
      if (i === 0 || kind === 's') param.setValueAtTime(v, tt);
      else if (kind === 'e') param.exponentialRampToValueAtTime(Math.max(1e-5, Math.abs(v)) * (v < 0 ? -1 : 1), tt);
      else if (kind === 't') param.setTargetAtTime(v, tt, tau || 0.05);
      else param.linearRampToValueAtTime(v, tt);
    }
  }
  /** percussive: 0 → peak in `a` (linear), then exponential decay with time-constant tau */
  perc(param, t, peak, a, tau, hold = 0) {
    t = Math.max(0, t);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.0002, a));
    if (hold > 0) param.setValueAtTime(peak, t + a + hold);
    param.setTargetAtTime(0, t + a + hold, Math.max(0.0005, tau));
  }
  /**
   * Smooth random control signal (ConstantSourceNode whose offset ramps between random targets
   * ~`rate` times per second). Output in [lo, hi]. Connect to an AudioParam.
   */
  randCtl(t0, dur, rate, lo, hi, smooth = true) {
    const c = this.konst(lo + (hi - lo) * this.r(), t0, t0 + dur + 0.05);
    let t = t0;
    const end = t0 + dur;
    let guard = 0;
    while (t < end && guard++ < 2000) {
      t += (0.5 + this.r()) / rate;
      const v = lo + (hi - lo) * this.r();
      if (smooth) c.offset.linearRampToValueAtTime(v, Math.min(t, end + 0.04));
      else c.offset.setValueAtTime(v, Math.min(t, end + 0.04));
    }
    return c;
  }
}

// ---------------------------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------------------------
export function dataStats(d) {
  let peak = 0, ss = 0, nan = false;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (v !== v || v === Infinity || v === -Infinity) {
      nan = true;
      continue;
    }
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    ss += v * v;
  }
  return { peak, rms: Math.sqrt(ss / Math.max(1, d.length)), nan };
}

export function bufferStats(buf) {
  let peak = 0, ss = 0, nan = false, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v !== v || v === Infinity || v === -Infinity) {
        nan = true;
        continue;
      }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      ss += v * v;
    }
    n += d.length;
  }
  return { peak, rms: Math.sqrt(ss / Math.max(1, n)), nan, duration: buf.duration };
}

/**
 * Trim trailing silence, fade the tail, remove NaNs and peak-normalise.
 * Returns {buffer, rawPeak, rawRms, nan}.
 */
export function finalizeBuffer(bufOrData, srOrOpts, opts) {
  let d, sr;
  if (bufOrData.getChannelData) {
    d = bufOrData.getChannelData(0);
    sr = bufOrData.sampleRate;
    opts = srOrOpts;
  } else {
    d = bufOrData;
    sr = srOrOpts;
  }
  const { normalize = 0.89, trimDb = -60, fadeOut = 0.008, keepLength = false } = opts || {};
  let nan = false;
  let peak = 0, ss = 0;
  for (let i = 0; i < d.length; i++) {
    let v = d[i];
    if (v !== v || !isFinite(v)) {
      nan = true;
      v = d[i] = 0;
    }
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    ss += v * v;
  }
  const rawRms = Math.sqrt(ss / d.length);
  if (peak < 1e-7) {
    const b = makeBuffer(d.length, sr, 1);
    b.getChannelData(0).set(d);
    return { buffer: b, rawPeak: peak, rawRms, nan };
  }
  let end = d.length;
  let truncated = false;
  if (!keepLength) {
    const thr = peak * dbToGain(trimDb);
    end = d.length - 1;
    while (end > 0 && Math.abs(d[end]) < thr) end--;
    truncated = end > d.length - Math.floor(0.03 * sr);
    end = Math.min(d.length, end + Math.floor(0.01 * sr));
  }
  const out = makeBuffer(end, sr, 1);
  const o = out.getChannelData(0);
  const k = normalize ? normalize / peak : 1;
  for (let i = 0; i < end; i++) o[i] = d[i] * k;
  if (!keepLength) {
    // a tail that is still audible at the render limit gets a long, smooth (cosine) fade instead of a cut
    const fl = Math.min(end, Math.floor((truncated ? Math.min(0.3, end / sr * 0.18) : fadeOut) * sr));
    for (let i = 0; i < fl; i++) o[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fl);
  }
  // tiny fade-in to kill any DC step at sample 0
  const fi = Math.min(end, 16);
  for (let i = 0; i < fi; i++) o[i] *= i / fi;
  return { buffer: out, rawPeak: peak, rawRms, nan };
}

/**
 * Turn a buffer rendered as (loopLen + xfade) seconds into a seamless loop of loopLen seconds by
 * crossfading the overhang into the start. mode 'power' (uncorrelated noise) or 'linear'.
 */
export function makeLoopBuffer(bufOrData, sr, loopLen, xfade, mode = 'power', normalize = 0.89) {
  const d = bufOrData.getChannelData ? bufOrData.getChannelData(0) : bufOrData;
  if (bufOrData.getChannelData) sr = bufOrData.sampleRate;
  const L = Math.min(d.length, Math.floor(loopLen * sr));
  const X = Math.min(Math.floor(xfade * sr), d.length - L);
  const out = makeBuffer(L, sr, 1);
  const o = out.getChannelData(0);
  for (let i = 0; i < L; i++) o[i] = d[i] !== d[i] ? 0 : d[i];
  for (let i = 0; i < X; i++) {
    const x = i / X;
    const a = mode === 'linear' ? x : Math.sqrt(x);
    const b = mode === 'linear' ? 1 - x : Math.sqrt(1 - x);
    const tail = d[L + i] !== d[L + i] ? 0 : d[L + i];
    o[i] = o[i] * a + tail * b;
  }
  let peak = 0;
  for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(o[i]));
  if (normalize && peak > 1e-7) {
    const k = normalize / peak;
    for (let i = 0; i < L; i++) o[i] *= k;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Impulse responses (generated in JS: decaying stereo noise + early reflections + darkening)
// ---------------------------------------------------------------------------------------------
/**
 * opts: dur, rt60, predelay, early: [[time, gain], ...], lp0, lp1 (one-pole lowpass cutoff at start/end),
 * density, hp (highpass of the IR), seed
 */
export function makeImpulseResponse(sr, opts) {
  const {
    dur = 2.5,
    rt60 = 2,
    predelay = 0.01,
    early = [],
    lp0 = 8000,
    lp1 = 1200,
    hp = 120,
    seed = 7,
    width = 1,
    gain = 1,
  } = opts;
  const n = Math.floor(dur * sr);
  const buf = makeBuffer(n, sr, 2);
  const r = mulberry32(seed);
  const decayK = 6.907755 / rt60; // ln(1000)
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  const p0 = Math.floor(predelay * sr);
  const fade = Math.floor(0.004 * sr);
  for (let c = 0; c < 2; c++) {
    const d = chans[c];
    let lpState = 0, hpState = 0, hpPrev = 0;
    const hpA = Math.exp((-2 * Math.PI * hp) / sr);
    const envMul = Math.exp(-decayK / sr);
    let env = 1, a = 0;
    for (let i = p0; i < n; i++) {
      if (((i - p0) & 63) === 0) {
        // darkening lowpass: coefficient updated every 64 samples
        const x = (i - p0) / sr / (dur - predelay);
        const fc = lp0 * Math.pow(lp1 / lp0, Math.min(1, x));
        a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      }
      const w = r() * 2 - 1;
      lpState += a * (w - lpState);
      // one-pole highpass
      const y = hpA * (hpState + lpState - hpPrev);
      hpPrev = lpState;
      hpState = y;
      let g = env;
      if (i - p0 < fade) g *= (i - p0) / fade;
      if (n - i < fade * 8) g *= (n - i) / (fade * 8);
      d[i] = y * g;
      env *= envMul;
    }
    // early reflections: small filtered clusters
    for (const [et, eg] of early) {
      const pos = Math.floor((et + (c ? 0.0007 * width : 0) + (r() - 0.5) * 0.002) * sr);
      const len = Math.floor(0.004 * sr);
      for (let j = 0; j < len && pos + j < n; j++) {
        d[pos + j] += eg * (r() * 2 - 1) * Math.exp((-j / len) * 4) * 1.5;
      }
    }
  }
  // decorrelate width: mix channels for narrower image
  if (width < 1) {
    const [L, R] = chans;
    const m = (1 - width) * 0.5;
    for (let i = 0; i < n; i++) {
      const l = L[i], rr = R[i];
      L[i] = l * (1 - m) + rr * m;
      R[i] = rr * (1 - m) + l * m;
    }
  }
  // energy normalise so convolver output level is predictable
  let ss = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) ss += chans[c][i] * chans[c][i];
  const k = gain / Math.sqrt(ss / 2 + 1e-12);
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) chans[c][i] *= k;
  return buf;
}
