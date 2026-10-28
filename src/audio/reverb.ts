// Room impulse responses generated at startup (pure). Three archetypes cover the apartment:
//   tiled  – small bright bathroom, RT60 ≈ 1.1 s, dense early reflections + flutter echo
//            between parallel tiled walls (≈ 2.5 m apart → 14.6 ms period),
//   living – medium furnished living room, RT60 ≈ 0.55 s,
//   dead   – carpeted bedroom with soft furnishings, RT60 ≈ 0.3 s, dark.
// Late reverb = band-split noise with per-band exponential decay (high frequencies decay
// faster in absorbent rooms), stereo-decorrelated; energy-normalised so that a send gain g
// gives a wet/dry energy ratio of g².

import { Biquad, Noise, clamp } from "./synth/dsp.ts";
import type { RoomAcoustics } from "../core/context.ts";

export interface IrSpec {
  id: "tiled" | "living" | "dead";
  rt60: number;
  /** T60 multiplier of the high band (> 3 kHz) and low band (< 300 Hz) relative to mid. */
  hfRatio: number;
  lfRatio: number;
  preDelay: number;
  /** Early reflections: count, spread (s), level relative to the late field onset. */
  early: { count: number; spread: number; gain: number };
  /** Optional flutter echo (period s, first-tap gain, per-tap decay). */
  flutter?: { period: number; gain: number; decay: number };
}

export const IR_SPECS: readonly IrSpec[] = [
  { id: "tiled", rt60: 1.1, hfRatio: 0.85, lfRatio: 1.05, preDelay: 0.002, early: { count: 16, spread: 0.022, gain: 0.8 }, flutter: { period: 0.0146, gain: 0.3, decay: 0.8 } },
  { id: "living", rt60: 0.55, hfRatio: 0.6, lfRatio: 1.15, preDelay: 0.005, early: { count: 10, spread: 0.035, gain: 0.55 } },
  { id: "dead", rt60: 0.3, hfRatio: 0.4, lfRatio: 1.2, preDelay: 0.004, early: { count: 6, spread: 0.025, gain: 0.35 } },
];

/** Render a stereo impulse response for a spec at sample rate sr. */
export function generateIR(spec: IrSpec, sr: number, seed = 1234): Float32Array[] {
  const tail = spec.rt60 * Math.max(1, spec.lfRatio) * 1.15; // ≈ −69 dB at the end
  const n = Math.max(64, Math.ceil((spec.preDelay + spec.early.spread + tail) * sr));
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const noise = new Noise((seed * 7919 + c * 104729 + spec.id.length * 31) >>> 0);
    const out = new Float32Array(n);
    // ---- late field: three bands with their own decay rates.
    const lp = new Biquad().lowpass(sr, 300);
    const bpH = new Biquad().highpass(sr, 300);
    const bpL = new Biquad().lowpass(sr, 3000);
    const hp = new Biquad().highpass(sr, 3000);
    const air = new Biquad().lowpass(sr, Math.min(16000, sr * 0.45));
    const kL = Math.exp(-Math.log(1000) / (spec.rt60 * spec.lfRatio * sr));
    const kM = Math.exp(-Math.log(1000) / (spec.rt60 * sr));
    const kH = Math.exp(-Math.log(1000) / (spec.rt60 * spec.hfRatio * sr));
    const onset = Math.floor((spec.preDelay + spec.early.spread * 0.35) * sr);
    const fadeN = Math.max(1, Math.floor(0.012 * sr));
    let eL = 1,
      eM = 1,
      eH = 1;
    for (let i = onset; i < n; i++) {
      const w = noise.white();
      const k = i - onset;
      const fi = k < fadeN ? 0.5 - 0.5 * Math.cos((Math.PI * k) / fadeN) : 1;
      out[i] = air.process(lp.process(w) * eL + bpL.process(bpH.process(w)) * eM + hp.process(w) * eH) * fi;
      eL *= kL;
      eM *= kM;
      eH *= kH;
    }
    // Late-field energy reference for scaling the early part.
    let lateE = 0;
    for (let i = onset; i < Math.min(n, onset + Math.floor(0.02 * sr)); i++) lateE += out[i] * out[i];
    const lateAmp = Math.sqrt(lateE / Math.max(1, Math.floor(0.02 * sr))) * 6;
    // ---- early reflections (different per channel → width).
    for (let r = 0; r < spec.early.count; r++) {
      const u = (r + noise.u()) / spec.early.count;
      const t = spec.preDelay + spec.early.spread * u * u * 0.9 + 0.0005;
      const i0 = Math.floor(t * sr);
      const a = spec.early.gain * lateAmp * (1 - 0.6 * u) * (0.6 + 0.4 * noise.u()) * (noise.u() < 0.5 ? -1 : 1);
      // 3-tap smoothed impulse (wall absorption softens reflections).
      if (i0 + 2 < n) {
        out[i0] += a * 0.5;
        out[i0 + 1] += a;
        out[i0 + 2] += a * 0.5;
      }
    }
    // ---- flutter echo between parallel hard walls.
    if (spec.flutter) {
      const per = spec.flutter.period * (c ? 1.03 : 1);
      let a = spec.flutter.gain * lateAmp;
      for (let k = 1; k < 60; k++) {
        const i0 = Math.floor((spec.preDelay + k * per) * sr);
        if (i0 + 3 >= n || a < 1e-5) break;
        out[i0] += a * 0.4;
        out[i0 + 1] += a * 0.8;
        out[i0 + 2] += a * 0.4;
        a *= spec.flutter.decay;
      }
    }
    chans.push(out);
  }
  // Energy normalisation across both channels.
  let e = 0;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
  const g = e > 0 ? 1 / Math.sqrt(e) : 1;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return chans;
}

/**
 * Weights over the three IRs [tiled, living, dead] for a room's acoustics, interpolated in
 * log(RT60) between the archetypes (0.3 s dead, 0.55 s living, 1.1 s tiled).
 */
export function irWeights(a: Pick<RoomAcoustics, "rt60"> | null, out: number[] = [0, 0, 0]): number[] {
  const rt = clamp(a?.rt60 ?? 0.5, 0.05, 3);
  const L = Math.log(rt);
  const dead = Math.log(0.3),
    mid = Math.log(0.55),
    tiled = Math.log(1.1);
  out[0] = out[1] = out[2] = 0;
  if (L <= dead) out[2] = 1;
  else if (L <= mid) {
    const t = (L - dead) / (mid - dead);
    out[1] = t;
    out[2] = 1 - t;
  } else if (L <= tiled) {
    const t = (L - mid) / (tiled - mid);
    out[0] = t;
    out[1] = 1 - t;
  } else out[0] = 1;
  return out;
}
