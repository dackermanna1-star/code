/**
 * Effects: 8-line feedback-delay-network reverb (for baking space into one-shots),
 * procedural impulse responses for the realtime ConvolverNodes, chorus, echo, ring-mod.
 */
import { Biquad, TAU, clamp, fade } from './core';
import type { Rand } from './rand';

export interface ReverbOpts {
  /** Decay time (s) at low/mid frequencies. */
  t60: number;
  /** Room size multiplier for the delay lengths (0.3 small … 2 huge). */
  size?: number;
  /** High-frequency damping 0..1 (higher = darker tail). */
  damp?: number;
  /** Pre-delay (s). */
  predelay?: number;
  /** Wet / dry gains. */
  wet?: number;
  dry?: number;
  /** Extra tail length (s) appended (default t60). */
  tail?: number;
  /** Input diffusion 0..1. */
  diffusion?: number;
  /** Delay-line modulation depth (samples) — smooths metallic ringing. */
  mod?: number;
}

const FDN_BASE = [0.0297, 0.0371, 0.0411, 0.0437, 0.0473, 0.0531, 0.0599, 0.0677];

/**
 * Stereo FDN reverb (Householder feedback, per-line damping, input allpass diffusion,
 * slow delay modulation). Returns [L, R] including the dry signal.
 */
export function reverb(input: Float32Array, sr: number, o: ReverbOpts): Float32Array[] {
  const tail = o.tail ?? o.t60;
  const n = input.length + Math.ceil(tail * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const size = o.size ?? 1;
  const N = 8;
  const lens: number[] = [];
  const lines: Float32Array[] = [];
  const idx = new Int32Array(N);
  const gains = new Float64Array(N);
  const lps = new Float64Array(N);
  const damp = clamp(o.damp ?? 0.4, 0, 0.95);
  const dc = 1 - damp * 0.9; // one-pole coefficient (1 = no damping)
  for (let i = 0; i < N; i++) {
    const len = Math.max(8, Math.round(FDN_BASE[i] * size * sr));
    lens.push(len);
    lines.push(new Float32Array(len + 8));
    gains[i] = Math.pow(10, (-3 * len) / (o.t60 * sr));
  }
  // input diffusers
  const apd = [0.0047, 0.0036, 0.00254, 0.0017].map((s) => Math.max(2, Math.round(s * sr * Math.max(0.5, size))));
  const apb = apd.map((d) => new Float32Array(d));
  const api = new Int32Array(apd.length);
  const apg = 0.62 * (o.diffusion ?? 0.8);
  const pd = Math.max(1, Math.round((o.predelay ?? 0.01) * sr));
  const pre = new Float32Array(pd);
  let pi = 0;
  const wet = o.wet ?? 0.35;
  const dry = o.dry ?? 1;
  const modDepth = o.mod ?? 6;
  const outs = new Float64Array(N);
  for (let t = 0; t < n; t++) {
    const x = t < input.length ? input[t] : 0;
    // predelay
    const xd = pre[pi];
    pre[pi] = x;
    pi = (pi + 1) % pd;
    // diffusion
    let d = xd;
    for (let k = 0; k < apd.length; k++) {
      const buf = apb[k];
      const bi = api[k];
      const v = buf[bi];
      const w = d + apg * v;
      buf[bi] = w;
      d = v - apg * w;
      api[k] = (bi + 1) % apd[k];
    }
    // read lines (with slow modulation on two lines)
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const len = lens[i];
      const line = lines[i];
      let rp = idx[i] - len;
      if (i < 2 && modDepth > 0) rp -= modDepth * (1 + Math.sin((TAU * (0.13 + i * 0.07) * t) / sr)) * 0.5;
      while (rp < 0) rp += line.length;
      const r0 = Math.floor(rp);
      const fr = rp - r0;
      const a = line[r0 % line.length];
      const b = line[(r0 + 1) % line.length];
      let v = a + (b - a) * fr;
      lps[i] = lps[i] + dc * (v - lps[i]);
      v = lps[i] * gains[i];
      outs[i] = v;
      sum += v;
    }
    const hh = (2 / N) * sum;
    let l = 0;
    let rr = 0;
    for (let i = 0; i < N; i++) {
      const fb = outs[i] - hh;
      const line = lines[i];
      line[idx[i]] = fb + d * (i & 1 ? 0.5 : -0.5);
      idx[i] = (idx[i] + 1) % line.length;
      if (i & 1) rr += outs[i] * (i & 2 ? 1 : -1);
      else l += outs[i] * (i & 2 ? -1 : 1);
    }
    L[t] = x * dry + l * wet * 0.5;
    R[t] = x * dry + rr * wet * 0.5;
  }
  return [L, R];
}

/** Mono convenience wrapper (sums the stereo FDN output). */
export function reverbMono(input: Float32Array, sr: number, o: ReverbOpts): Float32Array {
  const [L, R] = reverb(input, sr, o);
  for (let i = 0; i < L.length; i++) L[i] = (L[i] + R[i]) * 0.5;
  return L;
}

export interface IROpts {
  dur: number;
  /** T60 at 125 Hz and at 8 kHz (log-interpolated across octave bands). */
  t60Lo: number;
  t60Hi: number;
  predelay?: number;
  /** Number of discrete early reflections and the window they spread over (s). */
  early?: number;
  earlySpread?: number;
  earlyGain?: number;
  /** Fade-in of the diffuse tail (s). */
  build?: number;
  lowCut?: number;
  highCut?: number;
}

/**
 * Procedural stereo impulse response: octave-band decaying noise (frequency-dependent
 * T60) + sparse early reflections. Energy-normalized so wet levels are predictable.
 */
export function makeIR(sr: number, r: Rand, o: IROpts): Float32Array[] {
  const n = Math.ceil(o.dur * sr);
  const bands = [125, 250, 500, 1000, 2000, 4000, 8000, 14000];
  const pd = Math.round((o.predelay ?? 0.005) * sr);
  const build = Math.max(1, Math.round((o.build ?? 0.02) * sr));
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    const tmp = new Float32Array(n);
    for (let b = 0; b < bands.length; b++) {
      const fc = bands[b];
      if (fc >= sr * 0.45) continue;
      const u = Math.log(fc / 125) / Math.log(8000 / 125);
      const t60 = Math.max(0.05, o.t60Lo * Math.pow(o.t60Hi / o.t60Lo, clamp(u, 0, 1.2)));
      const k = Math.exp(-6.907755 / (t60 * sr));
      tmp.fill(0);
      let e = 1;
      for (let i = pd; i < n; i++) {
        const ramp = i - pd < build ? (i - pd) / build : 1;
        tmp[i] = r.bi() * e * ramp;
        e *= k;
      }
      new Biquad('bp', sr, fc, 1.1).run(tmp);
      for (let i = 0; i < n; i++) out[i] += tmp[i];
    }
    // early reflections
    const ne = o.early ?? 0;
    const spread = o.earlySpread ?? 0.06;
    for (let k = 0; k < ne; k++) {
      const t = (o.predelay ?? 0.005) + Math.pow(r.next(), 1.5) * spread;
      const i = Math.round(t * sr);
      if (i < n) out[i] += (o.earlyGain ?? 0.5) * r.sign() * (1 - t / (spread * 1.6)) * r.range(0.4, 1);
    }
    if (o.lowCut) new Biquad('hp', sr, o.lowCut, 0.7071).run(out);
    if (o.highCut) new Biquad('lp', sr, o.highCut, 0.7071).run(out);
    fade(out, sr, 0, Math.min(0.2, o.dur * 0.2));
    chans.push(out);
  }
  let energy = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) energy += c[i] * c[i];
  const g = 1 / Math.sqrt(Math.max(1e-12, energy / 2));
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chans;
}

/** Multi-voice chorus (modulated delays) → returns new mono buffer. */
export function chorus(b: Float32Array, sr: number, o: { rate?: number; depth?: number; delay?: number; mix?: number; voices?: number } = {}): Float32Array {
  const rate = o.rate ?? 0.6;
  const depth = (o.depth ?? 0.003) * sr;
  const base = (o.delay ?? 0.012) * sr;
  const mixAmt = o.mix ?? 0.5;
  const V = o.voices ?? 3;
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) {
    let acc = 0;
    for (let v = 0; v < V; v++) {
      const d = base + depth * (0.5 + 0.5 * Math.sin((TAU * rate * (1 + v * 0.31) * i) / sr + v * 2.1));
      const p = i - d;
      const k = Math.floor(p);
      if (k < 0) continue;
      const fr = p - k;
      acc += b[k] + (b[k + 1 < b.length ? k + 1 : k] - b[k]) * fr;
    }
    out[i] = b[i] * (1 - mixAmt) + (acc / V) * mixAmt;
  }
  return out;
}

/** Feedback echo (with low-pass in the loop). Extends the buffer by `tail` seconds. */
export function echo(b: Float32Array, sr: number, time: number, fb: number, mixAmt: number, lp = 4000, tail = 1): Float32Array {
  const d = Math.max(1, Math.round(time * sr));
  const out = new Float32Array(b.length + Math.round(tail * sr));
  out.set(b);
  const line = new Float32Array(d);
  let w = 0;
  const a = Math.exp((-TAU * lp) / sr);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    const del = line[w];
    y = del + a * (y - del);
    const x = i < b.length ? b[i] : 0;
    line[w] = x + y * fb;
    w = (w + 1) % d;
    out[i] += y * mixAmt;
  }
  return out;
}

/** Ring modulation with a sine of frequency f (Hz) — metallic / alien timbres. */
export function ringMod(b: Float32Array, sr: number, f: number, mixAmt = 1): Float32Array {
  for (let i = 0; i < b.length; i++) b[i] = b[i] * (1 - mixAmt) + b[i] * Math.sin((TAU * f * i) / sr) * mixAmt;
  return b;
}

/** Sample-and-hold decimation + quantisation (8-bit "bit" timbre). */
export function bitcrush(b: Float32Array, hold: number, bits: number): Float32Array {
  const q = Math.pow(2, bits - 1);
  let v = 0;
  for (let i = 0; i < b.length; i++) {
    if (i % hold === 0) v = Math.round(b[i] * q) / q;
    b[i] = v;
  }
  return b;
}

/** Comb filter (metallic resonance, e.g. blaze breath) — feedforward+feedback. */
export function comb(b: Float32Array, sr: number, f: number, fb: number, mixAmt = 1): Float32Array {
  const d = Math.max(1, Math.round(sr / f));
  const line = new Float32Array(d);
  let w = 0;
  for (let i = 0; i < b.length; i++) {
    const y = line[w];
    const v = b[i] + y * fb;
    line[w] = v;
    w = (w + 1) % d;
    b[i] = b[i] * (1 - mixAmt) + y * mixAmt;
  }
  return b;
}
