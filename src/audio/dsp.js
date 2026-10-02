// Offline DSP toolkit for the procedural sound bank: noise, filters, oscillators, modal
// resonators, envelopes, PS-ADPCM grit and loop helpers. Pure functions on Float32Arrays –
// nothing here touches Web Audio or the DOM, so the module is safe to import in Node.

export const SR = 22050;          // default generation rate (PS1 SPU territory)
export const SR_LO = 11025;       // low-fi rate for rumble / distant material
export const TAU = Math.PI * 2;
const PRIME = 8192;               // samples used to warm filters up when processing loops

// ------------------------------------------------------------------------------ basics
export function makeRng(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.jit = (v, f) => v * (1 + (r() * 2 - 1) * f);
  r.chance = (p) => r() < p;
  return r;
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const ns = (sec, sr = SR) => Math.max(1, Math.round(sec * sr));
export const alloc = (sec, sr = SR) => new Float32Array(ns(sec, sr));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
// frequency nudged so it completes a whole number of cycles in a loop of L seconds
export const cyc = (f, L) => Math.max(1, Math.round(f * L)) / L;

export function white(n, r) {
  const a = new Float32Array(n);
  let x = (r() * 4294967296) >>> 0 || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; a[i] = (x >>> 0) / 2147483648 - 1; }
  return a;
}

// ------------------------------------------------------------------------------ filters
// Factories return a stateful per-sample step function y = f(x).
function coefs(type, freq, q = 0.7071, gainDb = 0, sr = SR) {
  const f = Math.max(5, Math.min(freq, sr * 0.475));
  const w = (TAU * f) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;     // 0 dB peak
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'ls': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 'hs': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
    default: throw new Error('biquad: unknown type ' + type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export function biquad(type, freq, q = 0.7071, gainDb = 0, sr = SR) {
  const [b0, b1, b2, a1, a2] = coefs(type, freq, q, gainDb, sr);
  let z1 = 0, z2 = 0;
  return (x) => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
}

// spec: ['lp'|'hp'|'bp'|'notch'|'peak'|'ls'|'hs', freq, q, gainDb] | ['lp1'|'hp1', freq] | step fn
export function mkFilter(spec, sr = SR) {
  if (typeof spec === 'function') return spec;
  const [t, f, q, g] = spec;
  if (t === 'lp1' || t === 'hp1') {
    const a = 1 - Math.exp((-TAU * f) / sr);
    let y = 0;
    return t === 'lp1' ? (x) => (y += a * (x - y)) : (x) => x - (y += a * (x - y));
  }
  return biquad(t, f, q ?? 0.7071, g ?? 0, sr);
}

// Chunked processing: the *G generator variants yield every CHUNK samples so the caller can
// time-slice long buffers across frames; the plain versions run the same code in one go.
export const CHUNK = 16384;
export function drain(g) { let r = g.next(); while (!r.done) r = g.next(); return r.value; }

function filterState(sp, sr) {
  if (typeof sp === 'function') return { fn: sp, kind: 0 };
  const t = sp[0];
  if (t === 'lp1' || t === 'hp1') return { kind: t === 'lp1' ? 1 : 2, k: 1 - Math.exp((-TAU * sp[1]) / sr), y: 0 };
  const c = coefs(t, sp[1], sp[2] ?? 0.7071, sp[3] ?? 0, sr);
  return { kind: 3, b0: c[0], b1: c[1], b2: c[2], a1: c[3], a2: c[4], z1: 0, z2: 0 };
}
// run one filter over a[s..e) (write=false only advances the state: used to prime loops)
function runFilter(st, a, s, e, write) {
  if (st.kind === 3) {
    const b0 = st.b0, b1 = st.b1, b2 = st.b2, a1 = st.a1, a2 = st.a2;
    let z1 = st.z1, z2 = st.z2;
    if (write) for (let i = s; i < e; i++) { const x = a[i], y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; a[i] = y; }
    else for (let i = s; i < e; i++) { const x = a[i], y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; }
    st.z1 = z1; st.z2 = z2;
  } else if (st.kind) {
    const k = st.k;
    let y = st.y;
    if (!write) for (let i = s; i < e; i++) y += k * (a[i] - y);
    else if (st.kind === 1) for (let i = s; i < e; i++) { y += k * (a[i] - y); a[i] = y; }
    else for (let i = s; i < e; i++) { const x = a[i]; y += k * (x - y); a[i] = x - y; }
    st.y = y;
  } else {
    const f = st.fn;
    if (write) for (let i = s; i < e; i++) a[i] = f(a[i]);
    else for (let i = s; i < e; i++) f(a[i]);
  }
}

// Run filters in series over a buffer in place. circular=true first feeds each filter the tail
// of the buffer so the state at index 0 matches a buffer that loops (keeps loop seams clean).
export function* filterG(a, specs, sr = SR, circular = false, chunk = CHUNK) {
  const n = a.length;
  for (const sp of specs) {
    const st = filterState(sp, sr);
    if (circular) runFilter(st, a, Math.max(0, n - PRIME), n, false);
    for (let s = 0; s < n; s += chunk) {
      const e = Math.min(n, s + chunk);
      runFilter(st, a, s, e, true);
      if (e < n) yield;
    }
  }
  return a;
}
export function filter(a, specs, sr = SR, circular = false) { return drain(filterG(a, specs, sr, circular, 1 << 30)); }

// Zavalishin TPT state-variable filter with a time-varying cutoff fcAt(tSeconds) (sampled every
// 16 samples). mode: 'lp' | 'bp' (peak gain Q) | 'bpn' (unity peak) | 'hp'.
export function* svfG(a, mode, q, fcAt, sr = SR, circular = false, chunk = CHUNK) {
  const n = a.length, k = 1 / q, lo = 8, hi = sr * 0.45;
  const m = mode === 'lp' ? 0 : mode === 'bp' ? 1 : mode === 'bpn' ? 3 : 2;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const run = (s, e, write) => {
    for (let i = s; i < e; i++) {
      if ((i & 15) === 0 || i === s) {
        const fc = clamp(fcAt(i / sr), lo, hi), g = Math.tan((Math.PI * fc) / sr);
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
      }
      const x = a[i], v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      if (write) a[i] = m === 0 ? v2 : m === 1 ? v1 : m === 3 ? k * v1 : x - k * v1 - v2;
    }
  };
  if (circular) run(Math.max(0, n - PRIME), n, false);
  for (let s = 0; s < n; s += chunk) {
    const e = Math.min(n, s + chunk);
    run(s, e, true);
    if (e < n) yield;
  }
  return a;
}
export function svf(a, mode, q, fcAt, sr = SR, circular = false) { return drain(svfG(a, mode, q, fcAt, sr, circular, 1 << 30)); }

// feedback comb y[n] = x[n] + g*y[n-d] (metallic colouration, flutter echoes)
export function comb(a, delaySamples, g) {
  const d = Math.max(1, Math.round(delaySamples));
  for (let i = d; i < a.length; i++) a[i] += g * a[i - d];
  return a;
}

// ------------------------------------------------------------------------------ sources
// Noise burst: linear attack, optional hold, exponential decay (time constant dec seconds),
// then filtered (so the filters ring like a struck body).
export function burst(r, { att = 0.001, hold = 0, dec = 0.05, dur, f = [], sr = SR }) {
  const n = ns(dur ?? att + hold + dec * 7, sr), a = new Float32Array(n);
  const na = Math.max(1, Math.round(att * sr)), nh = Math.round(hold * sr), kd = Math.exp(-1 / (dec * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    let env;
    if (i < na) env = i / na;
    else if (i < na + nh) env = 1;
    else { env = e; e *= kd; }
    a[i] = (r() * 2 - 1) * env;
  }
  return f.length ? filter(a, f, sr) : a;
}

// Oscillator with exponential glide f0 -> f1 (time constant `glide`), linear attack then
// exponential decay. shape: sin | tri | sq | saw. h2/h3 add 2nd/3rd harmonic (sine only).
export function tone({ f0, f1 = f0, glide = 0.05, att = 0.002, dec = 0.1, dur, shape = 'sin', sr = SR, ph = 0, vib = 0, vibF = 5, h2 = 0, h3 = 0 }) {
  const n = ns(dur ?? att + dec * 7, sr), a = new Float32Array(n);
  const na = Math.max(1, Math.round(att * sr)), kd = Math.exp(-1 / (dec * sr)), kg = glide > 0 ? Math.exp(-1 / (glide * sr)) : 0;
  let f = f0, p = ph, e = 1;
  for (let i = 0; i < n; i++) {
    let env;
    if (i < na) env = i / na; else { env = e; e *= kd; }
    const fi = vib ? f * (1 + vib * Math.sin((TAU * vibF * i) / sr)) : f;
    p += (TAU * fi) / sr;
    if (p > 1e4) p -= TAU * Math.floor(p / TAU);
    let v;
    if (shape === 'sin') v = Math.sin(p) + (h2 ? h2 * Math.sin(2 * p) : 0) + (h3 ? h3 * Math.sin(3 * p) : 0);
    else {
      const u = (p / TAU) % 1;
      v = shape === 'tri' ? 1 - 4 * Math.abs(u - 0.5) : shape === 'sq' ? (u < 0.5 ? 1 : -1) : 2 * u - 1;
    }
    a[i] = v * env;
    f = f1 + (f - f1) * kg;
  }
  return a;
}

// Damped sinusoids (modal synthesis): list of [freqHz, decaySec, amp]. Each mode starts at
// zero phase (a strike). The buffer is long enough for the slowest mode to fall ~60 dB.
export function modesBuf(list, sr = SR, maxSec = 5) {
  let longest = 0;
  for (const m of list) longest = Math.max(longest, m[1]);
  const n = ns(Math.min(maxSec, longest * 6.9 + 0.002), sr), out = new Float32Array(n);
  for (const [f, d, amp] of list) {
    if (!(f > 0 && f < sr * 0.48) || !amp) continue;
    const w = (TAU * f) / sr, rr = Math.exp(-1 / (d * sr)), c = Math.cos(w) * rr, s = Math.sin(w) * rr;
    let re = amp, im = 0;
    const m = Math.min(n, ns(d * 6.9, sr) + 1);
    for (let i = 0; i < m; i++) { out[i] += im; const t = re * c - im * s; im = re * s + im * c; re = t; }
  }
  return out;
}

// Sparse random impulses (grit, crinkle, droplets): `rate` per second with an attack/decay
// amplitude envelope, then filtered.
export function crackle(r, { dur, rate, dec, att = 0, f = [], sr = SR }) {
  const n = ns(dur, sr), a = new Float32Array(n), p = rate / sr, na = att * sr, kd = (dec ?? dur / 3) * sr;
  for (let i = 0; i < n; i++) {
    if (r() >= p) continue;
    const env = (na > 0 && i < na ? i / na : 1) * Math.exp(-i / kd);
    a[i] += (r() * 2 - 1) * env;
  }
  return f.length ? filter(a, f, sr) : a;
}

// Small air bubble (Minnaert resonance): a sine with a slight upward chirp and fast decay.
export function bubble(f0, dec, rise = 0.3, sr = SR) {
  const n = ns(dec * 6.5, sr), a = new Float32Array(n), na = Math.max(1, 0.0008 * sr);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f0 * (1 + rise * Math.min(1, t / (dec * 2)));
    p += (TAU * f) / sr;
    a[i] = Math.sin(p) * Math.exp(-t / dec) * Math.min(1, i / na);
  }
  return a;
}

// Rubber/vinyl squeak: chirp with fast vibrato and a bell-shaped envelope.
export function squeak(r, dur, f0, f1, sr = SR) {
  const n = ns(dur, sr), a = new Float32Array(n);
  const vf = r.range(28, 46), vd = r.range(0.03, 0.07);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = i / n;
    const f = (f0 + (f1 - f0) * u) * (1 + vd * Math.sin(TAU * vf * t));
    p += (TAU * f) / sr;
    const e = Math.pow(Math.sin(Math.PI * u), 1.5);
    a[i] = (Math.sin(p) + 0.35 * Math.sin(2 * p + 0.5) + 0.12 * Math.sin(3 * p)) * e;
  }
  return a;
}

// Stick-slip friction (creaks, groans): impulses at a wandering rate rateAt(t) with amplitude
// envAt(t), run through a bank of resonators res = [[freq, q, gain], ...].
export function stickSlip(r, dur, rateAt, envAt, res, sr = SR) {
  const n = ns(dur, sr), a = new Float32Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (i < next) continue;
    const t = i / sr, amp = envAt(t);
    a[i] += amp * (0.6 + 0.4 * r());
    if (i + 1 < n) a[i + 1] -= amp * 0.5 * r();
    next = i + Math.max(1, Math.round(sr / Math.max(1, rateAt(t) * (0.85 + 0.3 * r()))));
  }
  const out = new Float32Array(n);
  for (const [f, q, g] of res) {
    const b = filter(a.slice(), [['bp', f, q]], sr);
    for (let i = 0; i < n; i++) out[i] += b[i] * g;
  }
  return out;
}

// Single-cycle wavetable from partials [[harmonic, amp, phase], ...]
export function wavetable(partials, size = 2048) {
  const t = new Float32Array(size + 1);
  for (const [h, amp, ph = 0] of partials) {
    const w = (TAU * h) / size;
    for (let j = 0; j <= size; j++) t[j] += amp * Math.sin(w * j + ph);
  }
  return t;
}

// Add a wavetable oscillator at a constant frequency (use cyc() for loops so the phase returns
// exactly to its start). gain may be a number or fn(tSeconds) sampled every 32 samples.
export function oscAdd(out, table, f, gain = 1, sr = SR, phase = 0) {
  const size = table.length - 1, inc = f / sr, gf = typeof gain === 'function';
  let p = phase - Math.floor(phase), g = gf ? 0 : gain;
  for (let i = 0; i < out.length; i++) {
    if (gf && (i & 31) === 0) g = gain(i / sr);
    const x = p * size, j = x | 0, fr = x - j;
    out[i] += (table[j] + (table[j + 1] - table[j]) * fr) * g;
    p += inc;
    if (p >= 1) p -= 1;
  }
  return out;
}

// Piecewise-linear envelope from [[t, v], ...] (t ascending)
export function envelope(n, sr, pts) {
  const e = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const p0 = pts[k], p1 = pts[Math.min(k + 1, pts.length - 1)];
    e[i] = t <= p0[0] ? p0[1] : t >= p1[0] ? p1[1] : p0[1] + ((p1[1] - p0[1]) * (t - p0[0])) / (p1[0] - p0[0]);
  }
  return e;
}

// Smooth periodic random function with whole cycles in L seconds; returns fn(t) in about [-1, 1].
export function loopLfo(r, L, cycles = [1, 2, 3]) {
  const parts = cycles.map((c) => [c, r() * TAU, r.range(0.5, 1)]);
  const sum = parts.reduce((s, p) => s + p[2], 0), N = 2048, tab = new Float32Array(N + 1);
  for (let j = 0; j <= N; j++) { let v = 0; for (const [c, ph, amp] of parts) v += amp * Math.sin((TAU * c * j) / N + ph); tab[j] = v / sum; }
  return (t) => {
    let u = (t / L) % 1;
    if (u < 0) u += 1;
    const x = u * N, j = x | 0;
    return tab[j] + (tab[j + 1] - tab[j]) * (x - j);
  };
}

// ------------------------------------------------------------------------------ mixing
export function mixInto(dst, src, at = 0, gain = 1) {
  const n = Math.min(src.length, dst.length - at);
  for (let i = Math.max(0, -at); i < n; i++) dst[at + i] += src[i] * gain;
  return dst;
}
// add with wrap-around (loop buffers): whatever runs past the end continues at the start
export function mixWrap(dst, src, at = 0, gain = 1) {
  const L = dst.length;
  let j = ((at % L) + L) % L;
  for (let i = 0; i < src.length; i++) { dst[j] += src[i] * gain; if (++j === L) j = 0; }
  return dst;
}
export function mulInto(a, e) { for (let i = 0; i < a.length; i++) a[i] *= e[i]; return a; }
export function scale(a, k) { for (let i = 0; i < a.length; i++) a[i] *= k; return a; }

export function peakOf(a) { let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m; }
export function rmsOf(a, from = 0, to = a.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
export function normPeak(a, target = 0.9) { const p = peakOf(a); return p > 1e-9 ? scale(a, target / p) : a; }
// scale to an RMS target without letting the peak exceed maxPeak
export function normRms(a, target, maxPeak = 0.95) {
  const r = rmsOf(a), p = peakOf(a);
  if (r < 1e-9) return a;
  let k = target / r;
  if (p * k > maxPeak) k = maxPeak / p;
  return scale(a, k);
}
// add src scaled to an RMS of `level` (handy for blending noise layers)
export function mixRms(dst, src, level) {
  const r = rmsOf(src);
  return r > 1e-9 ? mixInto(dst, src, 0, level / r) : dst;
}
export function fadeEdges(a, inSec, outSec, sr = SR) {
  const ni = Math.min(a.length, Math.round(inSec * sr)), no = Math.min(a.length, Math.round(outSec * sr));
  for (let i = 0; i < ni; i++) a[i] *= i / ni;
  for (let i = 0; i < no; i++) a[a.length - 1 - i] *= i / no;
  return a;
}
export function softClip(a, drive = 1.5) {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * drive) * k;
  return a;
}

// Circular time-varying delay (tape/mechanism wow) for loops: y(t) = x(t - depth*sin(2pi c t / L)).
export function wowLoop(a, sr, depthSec, cycles = 1) {
  const n = a.length, out = new Float32Array(n), d = depthSec * sr;
  for (let i = 0; i < n; i++) {
    let x = i - d * Math.sin((TAU * cycles * i) / n);
    x = ((x % n) + n) % n;
    const j = x | 0, fr = x - j;
    out[i] = a[j] * (1 - fr) + a[(j + 1) % n] * fr;
  }
  return out;
}

// Turn a buffer of length L+X into a seamless loop of length L by crossfading the overhang into
// the start (equal power for uncorrelated material).
export function loopXfade(a, L, X, equalPower = true) {
  const out = a.slice(0, L);
  for (let i = 0; i < X; i++) {
    const u = (i + 0.5) / X;
    const wi = equalPower ? Math.sin((u * Math.PI) / 2) : u, wo = equalPower ? Math.cos((u * Math.PI) / 2) : 1 - u;
    out[i] = a[i] * wi + a[L + i] * wo;
  }
  return out;
}

export function resampleLinear(a, srIn, srOut) {
  if (srIn === srOut) return a.slice();
  const n = Math.max(1, Math.round((a.length * srOut) / srIn)), o = new Float32Array(n), k = srIn / srOut, last = a.length - 1;
  for (let i = 0; i < n; i++) {
    const x = i * k, j = x | 0, fr = x - j;
    o[i] = j >= last ? a[last] * (1 - fr) : a[j] + (a[j + 1] - a[j]) * fr;
  }
  return o;
}

// ------------------------------------------------------------------------------ PS1 grit
// PS-ADPCM (VAG) encode + decode round trip: 28-sample blocks, 4-bit residuals, 5 predictors,
// 13 shifts. Adds the slightly gritty, level-dependent quantisation noise of PlayStation samples.
// loop=true primes the decoder with the buffer's tail so the loop point stays clean.
const VAG = [[0, 0], [60, 0], [115, -52], [98, -55], [122, -60]];
export function* adpcmG(a, loop = false, chunkBlocks = 600) {
  const n = a.length;
  const pre = loop ? Math.min(n - (n % 28), 28 * 24) : 0;
  const total = n + pre, X = new Int32Array(total);
  for (let k = 0; k < total; k++) {
    const v = a[k < pre ? n - pre + k : k - pre];
    X[k] = v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32767 + (v < 0 ? -0.5 : 0.5)) | 0;
  }
  let s1 = 0, s2 = 0, blocks = 0;
  for (let b = 0; b < total; b += 28) {
    if (++blocks % chunkBlocks === 0) yield;
    const e = Math.min(total, b + 28);
    // largest residual of each predictor over the block (on the source samples)
    let p1 = b > 0 ? X[b - 1] : 0, p2 = b > 1 ? X[b - 2] : 0, m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0;
    for (let k = b; k < e; k++) {      // branchless |d| and max: noise defeats branch prediction
      const x = X[k];
      let d = x, sg = d >> 31;
      m0 = Math.max(m0, (d ^ sg) - sg);
      d = x - ((p1 * 60 + 32) >> 6); sg = d >> 31; m1 = Math.max(m1, (d ^ sg) - sg);
      d = x - ((p1 * 115 - p2 * 52 + 32) >> 6); sg = d >> 31; m2 = Math.max(m2, (d ^ sg) - sg);
      d = x - ((p1 * 98 - p2 * 55 + 32) >> 6); sg = d >> 31; m3 = Math.max(m3, (d ^ sg) - sg);
      d = x - ((p1 * 122 - p2 * 60 + 32) >> 6); sg = d >> 31; m4 = Math.max(m4, (d ^ sg) - sg);
      p2 = p1; p1 = x;
    }
    let best = 0, mx = m0;
    if (m1 < mx) { mx = m1; best = 1; }
    if (m2 < mx) { mx = m2; best = 2; }
    if (m3 < mx) { mx = m3; best = 3; }
    if (m4 < mx) { mx = m4; best = 4; }
    let sh = 0;
    while (sh < 12 && mx > 7 << sh) sh++;
    const c0 = VAG[best][0], c1 = VAG[best][1], half = sh ? 1 << (sh - 1) : 0;
    // encode with the decoder's own history (error feedback) and keep the decoded result
    for (let k = b; k < e; k++) {
      const pred = (s1 * c0 + s2 * c1 + 32) >> 6;
      let q = (X[k] - pred + half) >> sh;
      q = q < -8 ? -8 : q > 7 ? 7 : q;
      let y = (q << sh) + pred;
      y = y < -32768 ? -32768 : y > 32767 ? 32767 : y;
      s2 = s1; s1 = y;
      if (k >= pre) a[k - pre] = y / 32768;
    }
  }
  return a;
}
export function adpcm(a, loop = false) { return drain(adpcmG(a, loop, 1 << 30)); }

// Statistics used by the tests (and handy when tuning): peak, RMS, NaN count and, for loops,
// how the jump across the loop point compares with the typical sample-to-sample step.
export function analyse(a, loop = false) {
  let nan = 0, pk = 0, s = 0, ds = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const av = Math.abs(v);
    if (av > pk) pk = av;
    s += v * v;
    if (i) { const d = v - a[i - 1]; ds += d * d; }
  }
  const rms = Math.sqrt(s / a.length), dRms = Math.sqrt(ds / Math.max(1, a.length - 1));
  const res = { n: a.length, peak: pk, rms, nan };
  if (loop && a.length > 2) {
    const jump = Math.abs(a[0] - a[a.length - 1]);
    // second-order check: does x[0] continue the slope of the last samples?
    const pred = 2 * a[a.length - 1] - a[a.length - 2], curv = Math.abs(a[0] - pred);
    res.seam = dRms > 1e-12 ? jump / dRms : 0;
    res.seam2 = dRms > 1e-12 ? curv / dRms : 0;
  }
  return res;
}
