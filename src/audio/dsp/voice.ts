/**
 * Source-filter voice synthesizer for creatures, villagers and player grunts.
 *
 *  source:  band-limited additive glottal pulse (harmonics with spectral tilt, computed with
 *           the Chebyshev sine recurrence — alias free), jitter / shimmer / drift, vibrato,
 *           period-doubling "roughness" (vocal fry, growls) and pulsed aspiration noise.
 *  filter:  5 parallel time-varying formant band-passes (TPT SVF) following a vowel
 *           trajectory, scaled by a vocal-tract-length factor, plus a nasal branch
 *           (low nasal formant + anti-resonance) for hums like "hmm" and "moo".
 */
import { SVF, TAU, clamp, curve, env, envLog } from './core';
import type { Rand } from './rand';

export interface Vowel {
  f: readonly number[];
  a: readonly number[];
  bw: readonly number[];
}

const BW = [80, 100, 140, 200, 280];

/** Adult-male formant targets (Hz) and relative amplitudes. */
export const VOWELS: Record<string, Vowel> = {
  a: { f: [730, 1090, 2440, 3400, 4500], a: [1, 0.75, 0.35, 0.22, 0.1], bw: BW },
  o: { f: [570, 840, 2410, 3300, 4500], a: [1, 0.65, 0.2, 0.15, 0.08], bw: BW },
  u: { f: [300, 870, 2240, 3200, 4400], a: [1, 0.35, 0.12, 0.08, 0.05], bw: BW },
  U: { f: [440, 1020, 2240, 3200, 4400], a: [1, 0.5, 0.18, 0.1, 0.06], bw: BW },
  uh: { f: [640, 1190, 2390, 3300, 4500], a: [1, 0.7, 0.3, 0.2, 0.1], bw: BW },
  e: { f: [530, 1840, 2480, 3500, 4500], a: [1, 0.6, 0.45, 0.25, 0.12], bw: BW },
  i: { f: [270, 2290, 3010, 3700, 4600], a: [1, 0.4, 0.4, 0.3, 0.15], bw: BW },
  ae: { f: [660, 1720, 2410, 3400, 4500], a: [1, 0.7, 0.4, 0.25, 0.12], bw: BW },
  er: { f: [490, 1350, 1690, 3300, 4500], a: [1, 0.7, 0.5, 0.2, 0.1], bw: BW },
  m: { f: [250, 1100, 2100, 3200, 4300], a: [1, 0.07, 0.05, 0.03, 0.02], bw: [60, 150, 200, 250, 300] },
  n: { f: [260, 1500, 2450, 3300, 4300], a: [1, 0.12, 0.09, 0.04, 0.02], bw: [60, 150, 200, 250, 300] },
  /** Nasal "honk" (villager): open-ish vowel with strong low nasal resonance. */
  ng: { f: [320, 1250, 2300, 3200, 4300], a: [1, 0.4, 0.22, 0.08, 0.04], bw: [70, 120, 180, 250, 300] },
};

export type VowelKey = keyof typeof VOWELS;

export interface VoiceOpts {
  /** Duration in seconds. */
  dur: number;
  /** f0 breakpoints [t(s), Hz, ...] (log interpolated). */
  f0: readonly number[];
  /** Amplitude breakpoints [t, gain, ...]. */
  amp: readonly number[];
  /** Vowel trajectory [t, 'a', t, 'o', ...]; formants interpolate between targets. */
  vowel: readonly (number | string)[];
  /** Formant frequency scale (1 = adult man; <1 bigger animal; >1 smaller). */
  scale?: number;
  /** Source spectral tilt exponent (harmonic k amplitude ∝ k^-tilt). ~1 pressed/bright, 2 soft. */
  tilt?: number;
  /** Aspiration noise level (constant or breakpoints). */
  breath?: number | readonly number[];
  /** Relative per-period f0 jitter (0.01 = 1%). */
  jitter?: number;
  /** Relative per-period amplitude shimmer. */
  shimmer?: number;
  /** Slow random pitch drift depth (relative) and rate. */
  drift?: number;
  driftRate?: number;
  /** Period-doubling roughness 0..1 (growl, vocal fry) — constant or breakpoints. */
  rough?: number | readonly number[];
  /** Vibrato [rate Hz, depth relative]. */
  vib?: readonly [number, number];
  /** Tremolo [rate Hz, depth 0..1]. */
  trem?: readonly [number, number];
  /** Nasal coupling 0..1 (constant or breakpoints). */
  nasal?: number | readonly number[];
  /** Formant bandwidth multiplier. */
  bw?: number;
  /** Harmonic ceiling (Hz). */
  maxHz?: number;
  /** Output gain. */
  gain?: number;
  /** Fast random formant wobble depth (gurgling, wet voices). */
  wobble?: number;
}

interface FormantSet {
  f: Float64Array;
  a: Float64Array;
  bw: Float64Array;
}

function vowelAt(traj: readonly (number | string)[], t: number, scale: number, out: FormantSet): void {
  // find bracketing keys
  let i = 0;
  while (i + 2 < traj.length && t > (traj[i + 2] as number)) i += 2;
  const ta = traj[i] as number;
  const va = VOWELS[traj[i + 1] as string] ?? VOWELS.uh;
  let vb = va;
  let u = 0;
  if (i + 2 < traj.length && t > ta) {
    const tb = traj[i + 2] as number;
    vb = VOWELS[traj[i + 3] as string] ?? VOWELS.uh;
    u = clamp((t - ta) / Math.max(1e-6, tb - ta), 0, 1);
    u = u * u * (3 - 2 * u);
  }
  for (let k = 0; k < 5; k++) {
    out.f[k] = (va.f[k] + (vb.f[k] - va.f[k]) * u) * scale;
    out.a[k] = va.a[k] + (vb.a[k] - va.a[k]) * u;
    out.bw[k] = (va.bw[k] + (vb.bw[k] - va.bw[k]) * u) * Math.sqrt(scale);
  }
}

const cv = (v: number | readonly number[] | undefined, t: number, d: number): number => (v === undefined ? d : typeof v === 'number' ? v : env(v, t));

/** Renders a voice into `out` at t0 (seconds). */
export function voice(out: Float32Array, sr: number, r: Rand, t0: number, o: VoiceOpts): void {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(o.dur * sr));
  if (n <= 0 || s0 < 0) return;
  const scale = o.scale ?? 1;
  const tilt = o.tilt ?? 1.4;
  const jitter = o.jitter ?? 0.006;
  const shimmer = o.shimmer ?? 0.04;
  const drift = o.drift ?? 0.01;
  const driftRate = o.driftRate ?? 4;
  const maxHz = Math.min(o.maxHz ?? 7000, sr * 0.45);
  const gain = o.gain ?? 1;
  const bwMul = o.bw ?? 1;
  const wob = o.wobble ?? 0;
  const vib = o.vib;
  const trem = o.trem;

  const f0c = curve(sr, n, o.f0, true);
  const ampc = curve(sr, n, o.amp);

  // harmonic amplitude table
  const KMAX = 400;
  const tab = new Float64Array(KMAX + 2);
  for (let k = 1; k <= KMAX; k++) tab[k] = Math.pow(k, -tilt);

  const src = new Float32Array(n);
  const asp = new Float32Array(n);
  let phase = 0;
  let periodJ = 0;
  let periodS = 1;
  let parity = 0;
  let dv = 0;
  let dTarget = 0;
  const dStep = Math.max(1, Math.round(sr / driftRate));
  let roughNow = cv(o.rough, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % dStep === 0) dTarget = r.bi() * drift;
    dv += (dTarget - dv) * (8 / sr) * driftRate;
    let f = f0c[i] * (1 + dv + periodJ);
    if (vib) f *= 1 + vib[1] * Math.sin(TAU * vib[0] * t);
    phase += f / sr;
    if (phase >= 1) {
      phase -= 1;
      periodJ = r.gauss() * jitter;
      periodS = 1 + r.gauss() * shimmer;
      parity ^= 1;
      roughNow = cv(o.rough, t, 0);
    }
    const th = TAU * phase;
    const s1 = Math.sin(th);
    const c2 = 2 * Math.cos(th);
    const kf = maxHz / Math.max(20, f);
    const K = Math.min(KMAX, Math.floor(kf));
    let sp = 0;
    let sc = s1;
    let sum = tab[1] * s1;
    for (let k = 2; k <= K; k++) {
      const sn = c2 * sc - sp;
      sp = sc;
      sc = sn;
      sum += tab[k] * sn;
    }
    // fade the next harmonic in smoothly so pitch glides don't click
    if (K + 1 <= KMAX) {
      const sn = c2 * sc - sp;
      sum += tab[K + 1] * sn * clamp(kf - K, 0, 1);
    }
    const rough = roughNow;
    const pd = parity ? 1 - rough * 0.75 : 1;
    src[i] = sum * periodS * pd;
    // aspiration pulsed with the glottal cycle
    asp[i] = r.bi() * (0.55 + 0.45 * Math.max(0, Math.sin(th - 0.6)));
  }

  // formant filtering at control rate
  const F = 5;
  const filters: SVF[] = [];
  for (let k = 0; k < F; k++) filters.push(new SVF());
  const nasalF = new SVF();
  const anti = new SVF();
  const fs: FormantSet = { f: new Float64Array(F), a: new Float64Array(F), bw: new Float64Array(F) };
  const g = new Float64Array(F);
  const kk = new Float64Array(F);
  const blk = 32;
  let wobA = 0;
  let wobB = 0;
  for (let i = 0; i < n; i += blk) {
    const t = i / sr;
    vowelAt(o.vowel, t, scale, fs);
    if (wob > 0) {
      wobA += (r.bi() - wobA) * 0.5;
      wobB += (r.bi() - wobB) * 0.5;
    }
    for (let k = 0; k < F; k++) {
      let fk = fs.f[k];
      if (wob > 0 && k < 2) fk *= 1 + wob * (k === 0 ? wobA : wobB);
      fk = clamp(fk, 60, sr * 0.45);
      g[k] = Math.tan((Math.PI * fk) / sr);
      const q = fk / Math.max(20, fs.bw[k] * bwMul);
      kk[k] = 1 / Math.max(0.3, q);
    }
    const breath = cv(o.breath, t, 0.08);
    const nasal = cv(o.nasal, t, 0);
    const gn = Math.tan((Math.PI * Math.min(sr * 0.45, 270 * Math.sqrt(scale))) / sr);
    const ga = Math.tan((Math.PI * Math.min(sr * 0.45, 1000 * scale)) / sr);
    const e = Math.min(n, i + blk);
    for (let j = i; j < e; j++) {
      const x = src[j] + asp[j] * breath * 2.2;
      let y = 0;
      let sign = 1;
      for (let k = 0; k < F; k++) {
        const fl = filters[k];
        fl.tick(x, g[k], kk[k]);
        y += sign * fs.a[k] * fl.bp * kk[k] * (1 + k * 0.35);
        sign = -sign;
      }
      if (nasal > 0) {
        nasalF.tick(x, gn, 0.5);
        anti.tick(y, ga, 0.7);
        // notch (lp + hp) carves the anti-resonance, nasal formant adds the hum
        const notched = anti.lp + anti.hp;
        y = y * (1 - nasal) + nasal * (notched * 0.6 + nasalF.bp * 0.5 * 1.6);
      }
      let a = ampc[j];
      if (trem) a *= 1 - trem[1] * 0.5 * (1 - Math.cos(TAU * trem[0] * (j / sr)));
      out[s0 + j] += y * a * gain;
    }
  }
}

/** Convenience: f0 contour with a pitch "arc" (start, peak at `peakAt` 0..1, end). */
export function arc(dur: number, start: number, peak: number, end: number, peakAt = 0.35): number[] {
  return [0, start, dur * peakAt, peak, dur, end];
}

/** Breakpoints for a swell envelope (attack, sustain level, release). */
export function swell(dur: number, attack: number, release: number, sustain = 1, peak = 1): number[] {
  return [0, 0, attack, peak, Math.max(attack, dur - release) * 0.999, sustain, dur, 0];
}

/** Helper for jittered log-interp values. */
export const jit = (r: Rand, v: number, amt: number): number => v * (1 + r.bi() * amt);
export { envLog };
