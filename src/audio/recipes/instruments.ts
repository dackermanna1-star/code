/**
 * Music instrument samples for the generative score. Rendered per sample root and pitched
 * with playbackRate at runtime. Sustaining instruments render a seamless loop region.
 *
 *  piano  — additive with stiff-string inharmonicity, hammer-position comb, per-partial
 *           two-stage decay (prompt + aftersound), detuned unison strings, hammer thump.
 *  pad    — warm detuned polyBLEP saws through a gentle low-pass (stereo loop).
 *  bell   — soft celesta / glass partials.
 *  pluck  — harp-like Karplus-Strong.
 *  drone  — dark low cluster for the Nether (stereo loop).
 *  choir  — breathy "oo" formant pad for the End / underwater (stereo loop).
 */
import { TAU, addNoise, alloc, clamp, highpass, lowpass, midiHz, peakEq, sweep } from '../dsp/core';
import { chorus } from '../dsp/fx';
import { pluck, ratioModes, strike, thump, burst } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { voice } from '../dsp/voice';

export interface InstSpec {
  /** Sample roots (MIDI). */
  roots: readonly number[];
  /** Seamless sustain loop: whole buffer loops (pads). */
  loop?: boolean;
  stereo?: boolean;
  /** Peak level of each rendered sample. */
  peak: number;
  /** Render at sampleRate / div (content well below the reduced Nyquist) — saves memory. */
  div?: 1 | 2 | 4;
  render: (sr: number, r: Rand, midi: number) => Float32Array[];
}

function polyblep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Equal-power fold of `xf` seconds of overlap onto the head → seamless loop of `dur`. */
export function foldLoop(c: Float32Array, sr: number, dur: number, xf: number): Float32Array {
  const N = Math.round(dur * sr);
  const X = Math.min(Math.round(xf * sr), c.length - N);
  const o = c.slice(0, N);
  for (let i = 0; i < X; i++) {
    const w = (i / X) * Math.PI * 0.5;
    o[i] = c[i] * Math.sin(w) + c[N + i] * Math.cos(w);
  }
  return o;
}

function piano(sr: number, r: Rand, midi: number): Float32Array[] {
  const f0 = midiHz(midi);
  const dur = clamp(7.5 - (midi - 36) * 0.09, 2.8, 7.5);
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const B = 0.00007 * Math.pow(2, (midi - 48) / 16) + (midi < 40 ? 0.0002 : 0);
  const fmax = Math.min(sr * 0.45, 9000);
  const strikePos = 1 / r.range(7, 8.5);
  const T0 = clamp(16 * Math.pow(2, -(midi - 36) / 13), 1.2, 16);
  const strings = midi < 38 ? 1 : 2;
  const det = [0, r.range(0.6, 1.1)];
  const bright = clamp(1.1 - (midi - 60) / 60, 0.6, 1.3);
  for (let k = 1; k < 64; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk >= fmax) break;
    const comb = Math.abs(Math.sin(Math.PI * k * strikePos));
    const ham = Math.exp(-fk / (2600 * bright));
    const A = (Math.pow(k, -0.75) * (0.25 + 0.75 * comb) * ham) / strings;
    if (A < 1e-4) continue;
    const T = T0 / (1 + 0.00035 * fk) / (1 + 0.12 * (k - 1));
    const kFast = Math.exp(-6.907755 / (Math.max(0.05, T * 0.16) * sr));
    const kSlow = Math.exp(-6.907755 / (T * sr));
    for (let s = 0; s < strings; s++) {
      const f = fk * Math.pow(2, (det[s] * (s === 0 ? 0 : 1)) / 1200);
      const w = (TAU * f) / sr;
      // recursive oscillator (sine phase)
      const c1 = 2 * Math.cos(w);
      let y1 = Math.sin(w + r.next() * 0.2);
      let y2 = Math.sin(r.next() * 0.2);
      let e1 = 0.72;
      let e2 = 0.28;
      const len = Math.min(n, Math.ceil(T * 1.2 * sr));
      for (let i = 0; i < len; i++) {
        out[i] += y2 * A * (e1 + e2);
        const y = c1 * y1 - y2;
        y2 = y1;
        y1 = y;
        e1 *= kFast;
        e2 *= kSlow;
      }
    }
  }
  // gentle attack (hammer felt) and hammer thump
  const na = Math.round(0.002 * sr);
  for (let i = 0; i < na; i++) out[i] *= i / na;
  thump(out, sr, 0, 90, 60, 0.05, 0.08 * bright);
  burst(out, sr, r, 0, 0.012, 0.05 * bright, 200, 1800);
  peakEq(out, sr, 130, 1, 2);
  peakEq(out, sr, 260, 1.2, 1.5);
  lowpass(out, sr, 8000);
  return [out];
}

function pad(sr: number, r: Rand, midi: number): Float32Array[] {
  const f = midiHz(midi);
  const dur = 4;
  const xf = 0.8;
  const len = dur + xf;
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const n = Math.ceil(len * sr);
    const b = new Float32Array(n);
    const dets = [-11, -4, 3, 9].map((d) => d + r.bi() * 2);
    const ph = dets.map(() => r.next());
    let sub = r.next();
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < dets.length; k++) {
        const fk = f * Math.pow(2, dets[k] / 1200);
        const dt = fk / sr;
        ph[k] += dt;
        if (ph[k] >= 1) ph[k] -= 1;
        s += 2 * ph[k] - 1 - polyblep(ph[k], dt);
      }
      sub += (f * 0.5) / sr;
      if (sub >= 1) sub -= 1;
      b[i] = s * 0.22 + Math.sin(TAU * sub) * 0.25;
    }
    const cut: number[] = [];
    for (let t = 0; t <= len + 0.05; t += 0.05) cut.push(t, clamp(f * 4, 600, 2200) * (1 + 0.15 * Math.sin(TAU * 0.25 * t + c)));
    sweep(b, sr, 'lp', cut, 0.8);
    lowpass(b, sr, 3500);
    chans.push(foldLoop(chorus(b, sr, { rate: 0.4 + c * 0.13, depth: 0.003, delay: 0.01, mix: 0.4 }), sr, dur, xf));
  }
  return chans;
}

function bell(sr: number, r: Rand, midi: number): Float32Array[] {
  const f = midiHz(midi);
  const out = alloc(sr, 3.2);
  strike(out, sr, 0.001, ratioModes(f, [1, 2.0, 3.01, 4.17, 5.43, 6.8], 2.6, { tilt: 1.3, decayTilt: 0.9, jitter: 0.002, r }), 1, 0.002);
  strike(out, sr, 0.001, ratioModes(f * 1.0015, [1], 2.2, {}), 0.3, 0.002);
  return [out];
}

function harp(sr: number, r: Rand, midi: number): Float32Array[] {
  const out = alloc(sr, 2.6);
  pluck(out, sr, r, 0.001, midiHz(midi), { dur: 2.5, t60: clamp(3.2 - (midi - 48) * 0.04, 1.2, 3.2), bright: 0.55, pick: 0.17, amp: 1 });
  peakEq(out, sr, 250, 1, 2);
  return [out];
}

function drone(sr: number, r: Rand, midi: number): Float32Array[] {
  const f = midiHz(midi);
  const dur = 6;
  const xf = 1.5;
  const len = dur + xf;
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const n = Math.ceil(len * sr);
    const b = new Float32Array(n);
    const ratios = [1, 1.004, 1.498, 2.01, 0.5];
    const ph = ratios.map(() => r.next());
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < ratios.length; k++) {
        const dt = (f * ratios[k]) / sr;
        ph[k] += dt;
        if (ph[k] >= 1) ph[k] -= 1;
        s += (2 * ph[k] - 1 - polyblep(ph[k], dt)) * (k === 4 ? 0.6 : 0.3);
      }
      b[i] = s;
    }
    const cut: number[] = [];
    for (let t = 0; t <= len + 0.05; t += 0.05) cut.push(t, f * 3 * (1 + 0.5 * Math.sin(TAU * 0.09 * t + c * 2)));
    sweep(b, sr, 'lp', cut, 1.4);
    const nz = new Float32Array(n);
    addNoise(nz, r, 0, n, 0.4, 'brown');
    lowpass(nz, sr, 200);
    for (let i = 0; i < n; i++) b[i] += nz[i];
    chans.push(foldLoop(b, sr, dur, xf));
  }
  return chans;
}

function choir(sr: number, r: Rand, midi: number): Float32Array[] {
  const f = midiHz(midi);
  const dur = 5;
  const xf = 1;
  const len = dur + xf;
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const b = alloc(sr, len);
    for (let k = 0; k < 2; k++) {
      const ff = f * Math.pow(2, (r.bi() * 8) / 1200);
      voice(b, sr, r, 0, {
        dur: len,
        f0: [0, ff, len, ff],
        amp: [0, 1, len, 1],
        vowel: [0, 'u', len * 0.5, 'o', len, 'u'],
        scale: 1.15,
        tilt: 2.2,
        breath: 0.55,
        vib: [r.range(4.5, 5.5), 0.006],
        jitter: 0.002,
        shimmer: 0.01,
        drift: 0.003,
        maxHz: 5000,
        gain: 0.5,
      });
    }
    highpass(b, sr, 120);
    chans.push(foldLoop(chorus(b, sr, { rate: 0.3 + c * 0.1, depth: 0.004, delay: 0.015, mix: 0.5 }), sr, dur, xf));
  }
  return chans;
}

export const INSTRUMENTS: Record<string, InstSpec> = {
  piano: { roots: [36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88], peak: 0.7, div: 2, render: piano },
  pad: { roots: [36, 43, 48, 55, 60, 67, 72], loop: true, stereo: true, peak: 0.5, div: 2, render: pad },
  bell: { roots: [60, 66, 72, 78, 84, 90, 96], peak: 0.6, render: bell },
  pluck: { roots: [43, 48, 54, 60, 66, 72, 78, 84], peak: 0.6, div: 2, render: harp },
  drone: { roots: [26, 31, 36, 43], loop: true, stereo: true, peak: 0.5, div: 4, render: drone },
  choir: { roots: [55, 62, 69, 76], loop: true, stereo: true, peak: 0.45, div: 2, render: choir },
};

/** Nearest sample root for a MIDI note. */
export function nearestRoot(inst: InstSpec, midi: number): number {
  let best = inst.roots[0];
  for (const m of inst.roots) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  return best;
}
