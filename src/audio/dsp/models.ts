/**
 * Physical-model-ish building blocks: modal resonators (impacts), granular texture,
 * Minnaert bubbles, Karplus-Strong strings, stick-slip creaks, whooshes and fire crackle.
 * All functions ADD into an output buffer at a time offset (seconds).
 */
import { Biquad, TAU, clamp, envLog, env, SVF } from './core';
import type { Rand } from './rand';

export interface Mode {
  /** Frequency (Hz). */
  f: number;
  /** Time to decay by 60 dB (s). */
  t60: number;
  /** Peak amplitude. */
  a: number;
}

/**
 * Struck modal bank: each mode is an exponentially decaying sinusoid starting in sine phase
 * (no DC step). `attack` (s) softens the onset (soft contact / compliant mallet).
 */
export function strike(out: Float32Array, sr: number, t0: number, modes: readonly Mode[], gain = 1, attack = 0): void {
  const s0 = Math.max(0, Math.round(t0 * sr));
  if (s0 >= out.length) return;
  const qa = attack > 0 ? Math.exp(-1 / (attack * sr)) : 0;
  for (let m = 0; m < modes.length; m++) {
    const md = modes[m];
    if (!(md.f > 0 && md.f < sr * 0.46) || md.a === 0) continue;
    const w = (TAU * md.f) / sr;
    const t60 = Math.max(0.002, md.t60);
    const r = Math.exp(-6.907755 / (t60 * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    const n = Math.min(out.length - s0, Math.ceil(t60 * 1.35 * sr) + 2);
    let y2 = 0;
    let y1 = md.a * gain * r * Math.sin(w);
    if (attack > 0) {
      let q = qa;
      for (let i = 1; i < n; i++) {
        q *= qa;
        out[s0 + i] += y1 * (1 - q);
        const y = c1 * y1 - c2 * y2;
        y2 = y1;
        y1 = y;
      }
    } else {
      for (let i = 1; i < n; i++) {
        out[s0 + i] += y1;
        const y = c1 * y1 - c2 * y2;
        y2 = y1;
        y1 = y;
      }
    }
  }
}

/**
 * Driven modal bank: filters `x` through resonators (unity-ish peak gain) and adds the
 * result into `out` at sample `at`, letting each mode ring out after the input ends.
 */
export function resonate(x: Float32Array, out: Float32Array, sr: number, modes: readonly Mode[], at = 0, gain = 1): void {
  for (let m = 0; m < modes.length; m++) {
    const md = modes[m];
    if (!(md.f > 0 && md.f < sr * 0.46) || md.a === 0) continue;
    const w = (TAU * md.f) / sr;
    const r = Math.exp(-6.907755 / (Math.max(0.002, md.t60) * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    const norm = (1 - r) * 2 * Math.max(0.05, Math.sin(w)) * md.a * gain;
    const n = Math.min(out.length - at, x.length + Math.ceil(md.t60 * 1.3 * sr));
    let y1 = 0;
    let y2 = 0;
    const xl = x.length;
    for (let i = 0; i < n; i++) {
      const y = (i < xl ? x[i] * norm : 0) + c1 * y1 - c2 * y2;
      y2 = y1;
      y1 = y;
      if (at + i >= 0) out[at + i] += y;
    }
  }
}

/** Amplitude weight of a mode at frequency f for a contact of duration `contact` seconds. */
export function contactWeight(f: number, contact: number): number {
  const fc = 1 / (2.5 * Math.max(1e-5, contact));
  const x = f / fc;
  return 1 / (1 + x * x);
}

/**
 * Random inharmonic mode cluster. Decay shortens with frequency (`decayTilt`), amplitude
 * falls with frequency (`tilt`) and by the contact filter.
 */
export function randomModes(
  r: Rand,
  n: number,
  fLo: number,
  fHi: number,
  t60Lo: number,
  t60Hi: number,
  o: { tilt?: number; contact?: number; decayTilt?: number; amp?: number } = {},
): Mode[] {
  const modes: Mode[] = [];
  const tilt = o.tilt ?? 0.5;
  const dt = o.decayTilt ?? 0.5;
  for (let i = 0; i < n; i++) {
    const f = r.log(fLo, fHi);
    const rel = f / fLo;
    const t60 = r.log(t60Lo, t60Hi) * Math.pow(rel, -dt * 0.5);
    const a = (o.amp ?? 1) * r.range(0.35, 1) * Math.pow(rel, -tilt) * (o.contact ? contactWeight(f, o.contact) : 1);
    modes.push({ f, t60, a });
  }
  return modes;
}

/** Free-free bar (xylophone / struck beam) ratios. */
export const BAR = [1, 2.756, 5.404, 8.933, 13.34, 18.64];
/** Clamped circular plate ratios (metal sheets, bells-ish). */
export const PLATE = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 4.06, 4.15, 4.6];
/** Church-bell-like partial ratios (hum, prime, tierce, quint, nominal ...). */
export const BELL = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433];

/** Modes from a ratio table. */
export function ratioModes(f0: number, ratios: readonly number[], t60: number, o: { tilt?: number; decayTilt?: number; jitter?: number; r?: Rand; contact?: number; amps?: readonly number[] } = {}): Mode[] {
  const modes: Mode[] = [];
  const tilt = o.tilt ?? 0.6;
  const dt = o.decayTilt ?? 0.7;
  for (let i = 0; i < ratios.length; i++) {
    const j = o.r && o.jitter ? 1 + o.r.bi() * o.jitter : 1;
    const f = f0 * ratios[i] * j;
    const rel = ratios[i] / ratios[0];
    const a = (o.amps ? o.amps[i] ?? 0.1 : Math.pow(rel, -tilt)) * (o.contact ? contactWeight(f, o.contact) : 1);
    modes.push({ f, t60: t60 * Math.pow(rel, -dt), a });
  }
  return modes;
}

/** Single decaying sinusoid "ping". */
export function ping(out: Float32Array, sr: number, t0: number, f: number, t60: number, amp: number): void {
  strike(out, sr, t0, [{ f, t60, a: amp }]);
}

// ---------------------------------------------------------------------------------------
// Granular texture
// ---------------------------------------------------------------------------------------

const gbq = new Biquad();

/**
 * Short band-pass noise grain: ~0.15 ms attack, exponential decay to −60 dB at `dur`.
 * With `norm`, amplitude is compensated for bandwidth so grains of different f/q have
 * similar loudness.
 */
export function grain(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f: number, q: number, amp: number, norm = true): void {
  const s0 = Math.round(t0 * sr);
  if (s0 < 0 || s0 >= out.length) return;
  const n = Math.min(out.length - s0, Math.max(4, Math.ceil(dur * sr)));
  const fc = Math.min(f, sr * 0.45);
  gbq.set('bp', sr, fc, q).reset();
  const comp = norm ? Math.min(6, Math.sqrt((q * sr * 0.5) / fc) * 0.35) : 1;
  const k = Math.exp(-6.907755 / n);
  const na = Math.max(1, Math.round(0.00015 * sr));
  let e = amp * comp;
  for (let i = 0; i < n; i++) {
    const a = i < na ? (e * i) / na : e;
    if (i >= na) e *= k;
    out[s0 + i] += gbq.tick(r.bi() * a);
  }
}

/**
 * Poisson scatter of events in [t0, t1). A time-varying rate uses thinning (Lewis-Shedler):
 * candidates at the peak rate, accepted with probability rate(t)/peak — so the density follows
 * the curve exactly (no stray late events). Returns the number of events.
 */
export function scatter(r: Rand, t0: number, t1: number, rate: number | ((t: number) => number), fn: (t: number, i: number) => void, max = 20000): number {
  let i = 0;
  if (typeof rate === 'number') {
    if (!(rate > 1e-4)) return 0;
    let t = t0;
    while (i < max) {
      t += -Math.log(1 - r.next()) / rate;
      if (t >= t1) break;
      fn(t, i++);
    }
    return i;
  }
  let peak = 0;
  const probes = 96;
  for (let k = 0; k <= probes; k++) peak = Math.max(peak, rate(t0 + ((t1 - t0) * k) / probes));
  peak *= 1.15;
  if (!(peak > 1e-4)) return 0;
  let t = t0;
  while (i < max) {
    t += -Math.log(1 - r.next()) / peak;
    if (t >= t1) break;
    if (r.next() * peak < rate(t)) fn(t, i++);
  }
  return i;
}

export interface GrainCloud {
  t0: number;
  t1: number;
  /** Events per second (constant or function of absolute time). */
  rate: number | ((t: number) => number);
  fLo: number;
  fHi: number;
  q?: number;
  durLo?: number;
  durHi?: number;
  amp: number;
  /** Amplitude envelope over absolute time (multiplies). */
  shape?: (t: number) => number;
  /** Heavy-tail power for amplitudes (higher = more small grains). */
  tail?: number;
}

/** Cloud of noise grains — crunch, rustle, grit, rain, fizz. */
export function grains(out: Float32Array, sr: number, r: Rand, c: GrainCloud): number {
  const q = c.q ?? 1.5;
  const dl = c.durLo ?? 0.002;
  const dh = c.durHi ?? 0.012;
  const tp = c.tail ?? 2;
  return scatter(r, c.t0, c.t1, c.rate, (t) => {
    const a = c.amp * r.tail(tp) * (c.shape ? c.shape(t) : 1);
    if (a < 1e-5) return;
    grain(out, sr, r, t, r.log(dl, dh), r.log(c.fLo, c.fHi), q * r.range(0.7, 1.4), a);
  });
}

/** Cloud of tiny modal clicks (hard fragments: gravel, shards, chain links). */
export function clicks(
  out: Float32Array,
  sr: number,
  r: Rand,
  c: { t0: number; t1: number; rate: number | ((t: number) => number); fLo: number; fHi: number; t60Lo: number; t60Hi: number; amp: number; modes?: number; shape?: (t: number) => number; tail?: number },
): number {
  const nm = c.modes ?? 2;
  const tp = c.tail ?? 2;
  const ms: Mode[] = [];
  for (let i = 0; i < nm; i++) ms.push({ f: 0, t60: 0, a: 0 });
  return scatter(r, c.t0, c.t1, c.rate, (t) => {
    const a = c.amp * r.tail(tp) * (c.shape ? c.shape(t) : 1);
    if (a < 1e-5) return;
    const f0 = r.log(c.fLo, c.fHi);
    for (let i = 0; i < nm; i++) {
      ms[i].f = f0 * (i === 0 ? 1 : r.range(1.3, 2.9) * i);
      ms[i].t60 = r.log(c.t60Lo, c.t60Hi) / (1 + i * 0.6);
      ms[i].a = a / (1 + i);
    }
    strike(out, sr, t, ms);
  });
}

// ---------------------------------------------------------------------------------------
// Liquids
// ---------------------------------------------------------------------------------------

/**
 * Minnaert bubble (van den Doel 2005): rising-pitch exponentially damped sinusoid.
 * f0 ≈ 3.26 kHz / radius(mm). `xi` controls the pitch rise.
 */
export function bubble(out: Float32Array, sr: number, t0: number, f0: number, amp: number, xi = 0.1, dScale = 1): void {
  const s0 = Math.round(t0 * sr);
  if (s0 < 0 || s0 >= out.length) return;
  const d = (0.13 * f0 + 0.0072 * Math.pow(f0, 1.5)) * dScale;
  const sigma = xi * d;
  const n = Math.min(out.length - s0, Math.ceil((7.5 / d) * sr));
  const k = Math.exp(-d / sr);
  const na = Math.max(1, Math.round(0.0004 * sr));
  let e = amp;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = Math.min(sr * 0.45, f0 * (1 + sigma * t));
    ph += (TAU * f) / sr;
    const a = i < na ? (e * i) / na : e;
    out[s0 + i] += a * Math.sin(ph);
    e *= k;
  }
}

/** Many bubbles: radius distribution maps to frequency range. */
export function bubbles(out: Float32Array, sr: number, r: Rand, t0: number, t1: number, rate: number | ((t: number) => number), fLo: number, fHi: number, amp: number, xi = 0.1, dScale = 1): number {
  return scatter(r, t0, t1, rate, (t) => {
    const f = r.log(fLo, fHi);
    bubble(out, sr, t, f, amp * r.range(0.25, 1) * Math.pow(fLo / f, 0.3), xi * r.range(0.5, 1.6), dScale);
  });
}

// ---------------------------------------------------------------------------------------
// Strings, creaks, air
// ---------------------------------------------------------------------------------------

/** Karplus-Strong plucked string with brightness and pick-position comb. */
export function pluck(
  out: Float32Array,
  sr: number,
  r: Rand,
  t0: number,
  f0: number,
  o: { dur: number; t60?: number; bright?: number; pick?: number; amp?: number },
): void {
  const s0 = Math.round(t0 * sr);
  if (s0 < 0 || s0 >= out.length) return;
  const n = Math.min(out.length - s0, Math.ceil(o.dur * sr));
  const bright = clamp(o.bright ?? 0.5, 0, 1);
  const s = 0.5 - 0.47 * bright;
  const L = Math.max(2, sr / f0 - s);
  const g = Math.pow(10, -3 / ((o.t60 ?? 2) * f0));
  const size = Math.ceil(L) + 4;
  const line = new Float32Array(size);
  const P = Math.max(2, Math.floor(L));
  const exc = new Float32Array(P);
  let lp = 0;
  const a = 0.15 + 0.8 * bright;
  let mean = 0;
  for (let i = 0; i < P; i++) {
    lp += a * (r.bi() - lp);
    exc[i] = lp;
    mean += lp;
  }
  mean /= P;
  for (let i = 0; i < P; i++) exc[i] -= mean;
  if (o.pick) {
    const d = Math.max(1, Math.round(o.pick * P));
    for (let i = P - 1; i >= d; i--) exc[i] -= exc[i - d];
  }
  const amp = o.amp ?? 1;
  let w = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let rp = w - L;
    while (rp < 0) rp += size;
    const i0 = Math.floor(rp);
    const fr = rp - i0;
    const a0 = line[i0 % size];
    const a1 = line[(i0 + 1) % size];
    const d = a0 + (a1 - a0) * fr;
    const filt = (1 - s) * d + s * prev;
    prev = d;
    const y = (i < P ? exc[i] : 0) + g * filt;
    line[w] = y;
    w = (w + 1) % size;
    out[s0 + i] += y * amp;
  }
}

/**
 * Stick-slip friction (door hinges, wood creaks, ropes): an irregular impulse train whose
 * rate follows `rate` (pulses/s over normalized time) excites a resonator bank.
 */
export function creak(
  out: Float32Array,
  sr: number,
  r: Rand,
  t0: number,
  dur: number,
  o: { rate: readonly number[]; amp: readonly number[]; modes: readonly Mode[]; jitter?: number; gain?: number; noise?: number },
): void {
  const n = Math.ceil(dur * sr);
  const x = new Float32Array(n);
  const jit = o.jitter ?? 0.25;
  let t = 0;
  while (t < dur) {
    const u = t / dur;
    const rate = Math.max(1, envLog(o.rate, u));
    const a = env(o.amp, u);
    const i = Math.round(t * sr);
    if (i < n && a > 0) {
      x[i] += a * (0.6 + 0.4 * r.next()) * r.sign() * (r.chance(0.08) ? 1.8 : 1);
      if (o.noise) {
        const m = Math.min(n, i + Math.round(0.0015 * sr));
        for (let j = i + 1; j < m; j++) x[j] += a * o.noise * r.bi() * (1 - (j - i) / (m - i));
      }
    }
    t += (1 / rate) * (1 + jit * r.bi());
  }
  resonate(x, out, sr, o.modes, Math.round(t0 * sr), o.gain ?? 1);
}

/**
 * Air movement: coloured noise through a swept band-pass. `f` and `amp` are breakpoint
 * curves over normalized time 0..1.
 */
export function whoosh(
  out: Float32Array,
  sr: number,
  r: Rand,
  t0: number,
  dur: number,
  o: { f: readonly number[]; amp: readonly number[]; q?: number | readonly number[]; gain?: number; pink?: boolean },
): void {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0 || s0 < 0) return;
  const s = new SVF();
  const gain = o.gain ?? 1;
  const blk = 16;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  for (let i = 0; i < n; i += blk) {
    const u = i / n;
    const fc = clamp(envLog(o.f, u), 20, sr * 0.45);
    const q = typeof o.q === 'number' ? o.q : o.q ? env(o.q, u) : 1.2;
    const g = Math.tan((Math.PI * fc) / sr);
    const k = 1 / Math.max(0.1, q);
    const e = Math.min(n, i + blk);
    for (let j = i; j < e; j++) {
      const a = env(o.amp, j / n);
      let w = r.bi();
      if (o.pink) {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        w = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.2;
      }
      s.tick(w, g, k);
      out[s0 + j] += s.bp * k * a * gain;
    }
  }
}

/** Low body "thump": sine with exponential pitch glide f0→f1 and decay. */
export function thump(out: Float32Array, sr: number, t0: number, f0: number, f1: number, dur: number, amp: number, attack = 0.0015): void {
  const s0 = Math.round(t0 * sr);
  if (s0 < 0 || s0 >= out.length) return;
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  const k = Math.exp(-6.907755 / n);
  const na = Math.max(1, Math.round(attack * sr));
  const ratio = f1 / f0;
  let e = amp;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = f0 * Math.pow(ratio, Math.min(1, u * 3));
    ph += (TAU * f) / sr;
    const a = i < na ? (amp * i) / na : e;
    if (i >= na) e *= k;
    out[s0 + i] += a * Math.sin(ph);
  }
}

/** Short filtered noise burst (contact transients, scrapes). */
export function burst(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, amp: number, hp: number, lp: number, attack = 0.0002): void {
  const s0 = Math.round(t0 * sr);
  if (s0 < 0 || s0 >= out.length) return;
  const n = Math.min(out.length - s0, Math.max(4, Math.ceil(dur * sr)));
  const h = new Biquad('hp', sr, hp, 0.7071);
  const l = new Biquad('lp', sr, lp, 0.7071);
  const k = Math.exp(-6.907755 / n);
  const na = Math.max(1, Math.round(attack * sr));
  let e = amp;
  for (let i = 0; i < n; i++) {
    const a = i < na ? (amp * i) / na : e;
    if (i >= na) e *= k;
    out[s0 + i] += l.tick(h.tick(r.bi() * a));
  }
}

/**
 * Fire crackle: heavy-tailed clicks & pops (resinous wood snapping) — `rate` events/s.
 */
export function crackle(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, o: { rate: number; amp?: number; fLo?: number; fHi?: number; pops?: number; shape?: (t: number) => number }): void {
  const amp = o.amp ?? 1;
  const fLo = o.fLo ?? 1500;
  const fHi = o.fHi ?? 7000;
  const pops = o.pops ?? 0.2;
  scatter(r, t0, t0 + dur, o.rate, (t) => {
    const a = amp * r.tail(2.6) * (o.shape ? o.shape(t) : 1);
    if (r.chance(pops)) {
      // bigger pop: low-mid noise burst + small resonance
      grain(out, sr, r, t, r.log(0.006, 0.03), r.log(500, 2200), r.range(0.8, 2), a * 1.4);
      ping(out, sr, t, r.log(250, 900), r.log(0.01, 0.04), a * 0.5);
    } else {
      // sharp tick: tiny resonance + noise spike
      ping(out, sr, t, r.log(fLo, fHi), r.log(0.002, 0.012), a);
      grain(out, sr, r, t, r.log(0.0008, 0.003), r.log(fLo, fHi), 1.2, a * 0.8);
    }
  });
}
