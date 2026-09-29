/**
 * Tiny offline DSP toolkit. Everything renders into Float32Arrays that are
 * later wrapped as AudioBuffers.
 */
export let SR = 44100;
export function setSampleRate(sr: number) {
  SR = sr;
}

let seed = 1234567;
export function srand(s: number) {
  seed = s >>> 0 || 1;
}
/** Deterministic xorshift noise in [-1, 1]. */
export function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
}
export const rr = (a: number, b: number) => a + (rnd() * 0.5 + 0.5) * (b - a);

export const buf = (sec: number) => new Float32Array(Math.max(1, Math.round(sec * SR)));

export function white(sec: number) {
  const b = buf(sec);
  for (let i = 0; i < b.length; i++) b[i] = rnd();
  return b;
}

export function brown(sec: number) {
  const b = buf(sec);
  let last = 0;
  for (let i = 0; i < b.length; i++) {
    last = (last + 0.02 * rnd()) / 1.02;
    b[i] = last * 3.5;
  }
  return b;
}

export function pink(sec: number) {
  const b = buf(sec);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < b.length; i++) {
    const w = rnd();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    b[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return b;
}

type FreqFn = number | ((t: number) => number);
const fval = (f: FreqFn, t: number) => (typeof f === 'number' ? f : f(t));

/** RBJ biquad, frequency may vary over time (coefficients refreshed every 16 samples). */
export function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp' | 'peak' | 'notch', freq: FreqFn, q = 0.707, gainDb = 0) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0) {
      const f = Math.min(SR * 0.45, Math.max(10, fval(freq, i / SR)));
      const w0 = (2 * Math.PI * f) / SR;
      const cs = Math.cos(w0);
      const sn = Math.sin(w0);
      const alpha = sn / (2 * q);
      let a0 = 1;
      switch (type) {
        case 'lp':
          b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
          break;
        case 'hp':
          b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
          break;
        case 'bp':
          b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
          break;
        case 'notch':
          b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
          break;
        case 'peak': {
          const A = Math.pow(10, gainDb / 40);
          b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
          break;
        }
      }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    }
    const xi = x[i];
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

/** One-pole lowpass (cheap smoothing). */
export function onepole(x: Float32Array, f: number) {
  const y = new Float32Array(x.length);
  const a = Math.exp((-2 * Math.PI * f) / SR);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    s = x[i] * (1 - a) + s * a;
    y[i] = s;
  }
  return y;
}

/** Multiply by an envelope function of time. */
export function env(x: Float32Array, fn: (t: number) => number) {
  for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR);
  return x;
}

/** attack (s) then exponential decay (tau s). */
export const ad = (attack: number, tau: number, delay = 0) => (t: number) => {
  t -= delay;
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / tau);
};

/** Oscillator with time-varying frequency. */
export function osc(sec: number, freq: FreqFn, type: 'sine' | 'saw' | 'square' | 'tri' = 'sine', phase = 0) {
  const b = buf(sec);
  let ph = phase;
  for (let i = 0; i < b.length; i++) {
    const f = fval(freq, i / SR);
    ph += f / SR;
    ph -= Math.floor(ph);
    let v: number;
    switch (type) {
      case 'saw':
        v = ph * 2 - 1;
        break;
      case 'square':
        v = ph < 0.5 ? 1 : -1;
        break;
      case 'tri':
        v = 1 - 4 * Math.abs(ph - 0.5);
        break;
      default:
        v = Math.sin(ph * Math.PI * 2);
    }
    b[i] = v;
  }
  return b;
}

/** Exponential sweep from f0 to f1 over dur seconds. */
export const sweep = (f0: number, f1: number, dur: number) => (t: number) => f0 * Math.pow(f1 / f0, Math.min(1, t / dur));

export function gain(x: Float32Array, g: number) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** Mix src into dst (in place) at an offset in seconds. Grows nothing: clipped to dst. */
export function mix(dst: Float32Array, src: Float32Array, g = 1, offset = 0) {
  const o = Math.round(offset * SR);
  const n = Math.min(src.length, dst.length - o);
  for (let i = 0; i < n; i++) if (o + i >= 0) dst[o + i] += src[i] * g;
  return dst;
}

export function drive(x: Float32Array, amount: number) {
  if (amount <= 0) return x;
  const k = Math.tanh(amount);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * amount) / k;
  return x;
}

export function normalize(x: Float32Array, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 1e-6) gain(x, peak / m);
  return x;
}

/** Fade the last `sec` seconds to zero (avoid clicks). */
export function fadeOut(x: Float32Array, sec = 0.01) {
  const n = Math.min(x.length, Math.round(sec * SR));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
}
export function fadeIn(x: Float32Array, sec = 0.002) {
  const n = Math.min(x.length, Math.round(sec * SR));
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}

/** Feedback echo (slapback) with lowpassed repeats. */
export function echo(x: Float32Array, delay: number, fb: number, lp: number, repeats = 3) {
  const out = new Float32Array(x);
  let src = x;
  for (let r = 1; r <= repeats; r++) {
    src = onepole(src, lp);
    mix(out, src, Math.pow(fb, r), delay * r * (1 + (r - 1) * 0.15));
  }
  return out;
}

/** Sum of damped sinusoids (metal pings, casings). */
export function modal(sec: number, modes: [number, number, number][]) {
  const b = buf(sec);
  for (const [f, amp, tau] of modes) {
    const w = (2 * Math.PI * f) / SR;
    for (let i = 0; i < b.length; i++) b[i] += Math.sin(w * i) * amp * Math.exp(-i / SR / tau);
  }
  return b;
}

/** Short noise burst through a resonant bandpass (mechanical clicks). */
export function click(sec: number, f: number, q: number, tau: number, level = 1) {
  const n = white(sec);
  env(n, ad(0.0003, tau));
  return gain(biquad(n, 'bp', f, q), level * 3);
}

/** Formant-filtered pulse voice (zombie groans, grunts). */
export function voice(sec: number, f0: FreqFn, formants: [FreqFn, number, number][], breath = 0.2, jitter = 0.04, fry = 0) {
  const b = buf(sec);
  let ph = 0;
  let jt = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    if ((i & 255) === 0) jt = rnd() * jitter;
    const f = fval(f0, t) * (1 + jt);
    ph += f / SR;
    if (ph >= 1) ph -= 1;
    // glottal pulse approximation (skewed saw)
    let v = ph < 0.6 ? ph / 0.6 : (1 - ph) / 0.4;
    v = v * 2 - 1;
    if (fry > 0) v *= 1 - fry * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 34 + rnd() * 0.3));
    b[i] = v + rnd() * breath;
  }
  const out = buf(sec);
  for (const [ff, q, g] of formants) mix(out, biquad(b, 'bp', ff, q), g);
  return out;
}
