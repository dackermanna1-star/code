// Modal synthesis of resonant impacts (pure). An impact excites the structural modes of the
// struck object; each mode is a damped sinusoid. Physically motivated choices:
//   * f0 ∝ size^-sizeExp (bigger objects sound lower; damped materials vary less with size),
//   * partial ratio tables per material/shape (bars, plates, shells, sheets),
//   * damping law α_k = alphaG + alphaR·f_k  → higher partials die faster and bigger
//     (lower) objects ring longer (Aramaki et al.: the main cue for material perception),
//   * strike position x weights mode k by |sin((k+1)πx)| (nodes are not excited),
//   * a contact pulse of finite duration low-passes the excitation (contactWeight),
//   * a short strike-noise transient whose colour reflects hardness, plus a low "thump"
//     for dead materials (drywall, concrete, soft, flesh) whose energy goes into the body.

import type { SoundProfile } from "../../destruction/model/materials.ts";
import type { Rng } from "../../core/rng.ts";
import {
  LN1000,
  Noise,
  addMode,
  addModes,
  addNoiseBurst,
  addThump,
  bounces,
  buf,
  clamp,
  contactWeight,
  fadeOut,
  peakOf,
  type Mode,
} from "./dsp.ts";

export interface ModalProfile {
  /** Fundamental (Hz) of an object with characteristic size 0.3 m. */
  fRef: number;
  /** f0 = fRef · (0.3 / size)^sizeExp. */
  sizeExp: number;
  /** Partial frequency ratios (relative to f0) and base amplitudes. */
  ratios: readonly number[];
  amps: readonly number[];
  /** Alternative ratios for small objects (< 0.15 m), e.g. bell-like glassware. */
  ratiosSmall?: readonly number[];
  /** Damping law (1/s): α_k = alphaG + alphaR · f_k;  T60 = ln(1000)/α. */
  alphaG: number;
  alphaR: number;
  /** Random partial detuning (fraction) between variations. */
  jitter: number;
  /** Corner frequency (Hz) of the contact pulse for a hard striker. */
  contactFc: number;
  /** Strike-noise transient: level relative to the modal peak, decay (s), filters, grit. */
  noiseAmp: number;
  noiseDecay: number;
  noiseHp: number;
  noiseLp?: number;
  grit?: number;
  /** Low body thump (Hz at size 0.3 m, scaled by the size law), level, decay (s). */
  thumpHz?: number;
  thumpAmp?: number;
  thumpDecay?: number;
  /** Beating partner partials (fraction detune) — metals shimmer. */
  beat?: number;
  /** "Oil-can" sub mode level (thin sheet metal wobble). */
  wobble?: number;
  /** Internal rattle clicks (loose components inside electronics). */
  rattle?: number;
  /** Duration cap (s). */
  maxLen: number;
  /** Restitution of small pieces of this material (debris rattles). */
  bounce: number;
}

/** Characteristic sizes of the three pre-rendered size classes (m). */
export const SIZE_CLASSES = { s: 0.08, m: 0.3, l: 1.1 } as const;
export type SizeClass = keyof typeof SIZE_CLASSES;

const R_BAR = [1, 2.756, 5.404, 8.933, 13.34, 18.64];

export const MODAL: Readonly<Record<SoundProfile, ModalProfile>> = {
  glass: {
    fRef: 900, sizeExp: 1, ratiosSmall: [1, 2.32, 4.25, 6.63, 9.38],
    ratios: [1, 1.59, 2.14, 2.65, 3.16, 3.91, 4.65, 5.42, 6.21, 7.0, 8.1],
    amps: [1, 0.7, 0.55, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.18, 0.15],
    alphaG: 5, alphaR: 0.0016, jitter: 0.03, contactFc: 12000,
    noiseAmp: 0.25, noiseDecay: 0.0025, noiseHp: 2500, maxLen: 1.6, bounce: 0.35,
  },
  ceramic: {
    fRef: 750, sizeExp: 1, ratios: [1, 1.71, 2.75, 3.9, 5.2, 6.7, 8.3], amps: [1, 0.55, 0.75, 0.4, 0.45, 0.25, 0.18],
    alphaG: 6, alphaR: 0.003, jitter: 0.04, contactFc: 10000,
    noiseAmp: 0.3, noiseDecay: 0.003, noiseHp: 1500, maxLen: 1.2, bounce: 0.3,
  },
  stone: {
    fRef: 700, sizeExp: 0.9, ratios: [1, 1.8, 2.6, 3.7, 4.9, 6.3], amps: [1, 0.75, 0.55, 0.4, 0.3, 0.2],
    alphaG: 25, alphaR: 0.008, jitter: 0.05, contactFc: 8000,
    noiseAmp: 0.55, noiseDecay: 0.005, noiseHp: 700, grit: 0.4, maxLen: 0.5, bounce: 0.28,
  },
  concrete: {
    fRef: 280, sizeExp: 0.7, ratios: [1, 1.52, 2.3, 3.4, 4.6], amps: [1, 0.6, 0.45, 0.3, 0.2],
    alphaG: 60, alphaR: 0.03, jitter: 0.06, contactFc: 6000,
    noiseAmp: 1.0, noiseDecay: 0.009, noiseHp: 250, noiseLp: 7000, grit: 0.7,
    thumpHz: 75, thumpAmp: 0.6, thumpDecay: 0.025, maxLen: 0.45, bounce: 0.25,
  },
  drywall: {
    fRef: 150, sizeExp: 0.6, ratios: [1, 1.62, 2.31, 3.1, 4.2], amps: [1, 0.6, 0.45, 0.3, 0.2],
    alphaG: 35, alphaR: 0.06, jitter: 0.06, contactFc: 2800,
    noiseAmp: 0.7, noiseDecay: 0.012, noiseHp: 150, noiseLp: 3500, grit: 0.5,
    thumpHz: 90, thumpAmp: 0.8, thumpDecay: 0.035, maxLen: 0.5, bounce: 0.15,
  },
  wood: {
    fRef: 420, sizeExp: 1, ratios: [1, 2.57, 4.1, 5.9, 8.0, 10.4], amps: [1, 0.55, 0.42, 0.26, 0.16, 0.1],
    alphaG: 14, alphaR: 0.022, jitter: 0.05, contactFc: 6000,
    noiseAmp: 0.35, noiseDecay: 0.004, noiseHp: 500, noiseLp: 9000, maxLen: 0.7, bounce: 0.4,
  },
  metal: {
    fRef: 1100, sizeExp: 1, ratios: R_BAR, amps: [1, 0.7, 0.5, 0.35, 0.25, 0.18],
    alphaG: 1.6, alphaR: 0.0007, jitter: 0.02, contactFc: 14000, beat: 0.0035,
    noiseAmp: 0.18, noiseDecay: 0.002, noiseHp: 2000, maxLen: 3.0, bounce: 0.45,
  },
  metalThin: {
    fRef: 480, sizeExp: 1, ratios: [1, 1.47, 2.09, 2.56, 3.12, 3.71, 4.32, 5.11, 6.02, 7.23, 8.6, 10.1],
    amps: [1, 0.72, 0.62, 0.55, 0.5, 0.46, 0.42, 0.38, 0.35, 0.3, 0.27, 0.24],
    alphaG: 3.5, alphaR: 0.0025, jitter: 0.06, contactFc: 12000, beat: 0.006, wobble: 0.35,
    noiseAmp: 0.35, noiseDecay: 0.004, noiseHp: 1000, maxLen: 2.2, bounce: 0.4,
  },
  plastic: {
    fRef: 600, sizeExp: 1, ratios: [1, 1.83, 2.9, 4.2, 5.7], amps: [1, 0.5, 0.4, 0.25, 0.15],
    alphaG: 30, alphaR: 0.03, jitter: 0.06, contactFc: 6000,
    noiseAmp: 0.5, noiseDecay: 0.003, noiseHp: 800, thumpHz: 300, thumpAmp: 0.3, thumpDecay: 0.012, maxLen: 0.4, bounce: 0.5,
  },
  electronics: {
    fRef: 520, sizeExp: 1, ratios: [1, 1.9, 3.1, 4.4, 5.9], amps: [1, 0.55, 0.4, 0.3, 0.2],
    alphaG: 28, alphaR: 0.03, jitter: 0.06, contactFc: 6000, rattle: 6,
    noiseAmp: 0.5, noiseDecay: 0.003, noiseHp: 700, thumpHz: 260, thumpAmp: 0.35, thumpDecay: 0.015, maxLen: 0.5, bounce: 0.45,
  },
  soft: {
    fRef: 110, sizeExp: 0.5, ratios: [1, 1.45], amps: [1, 0.3],
    alphaG: 70, alphaR: 0.1, jitter: 0.1, contactFc: 700,
    noiseAmp: 0.8, noiseDecay: 0.02, noiseHp: 60, noiseLp: 900, thumpHz: 75, thumpAmp: 1.0, thumpDecay: 0.04, maxLen: 0.3, bounce: 0.1,
  },
  paper: {
    fRef: 320, sizeExp: 0.6, ratios: [1, 1.6, 2.4], amps: [1, 0.5, 0.3],
    alphaG: 60, alphaR: 0.05, jitter: 0.1, contactFc: 4500,
    noiseAmp: 1.3, noiseDecay: 0.016, noiseHp: 900, noiseLp: 6000, thumpHz: 130, thumpAmp: 0.45, thumpDecay: 0.02, maxLen: 0.3, bounce: 0.15,
  },
  flesh: {
    fRef: 160, sizeExp: 0.5, ratios: [1, 1.7], amps: [1, 0.35],
    alphaG: 55, alphaR: 0.08, jitter: 0.1, contactFc: 1500,
    noiseAmp: 0.6, noiseDecay: 0.014, noiseHp: 300, noiseLp: 2500, thumpHz: 95, thumpAmp: 1.0, thumpDecay: 0.045, maxLen: 0.35, bounce: 0.1,
  },
};

/** Fundamental frequency (Hz) of a profile at a characteristic size (m). */
export function fundamental(p: ModalProfile, size: number): number {
  return p.fRef * Math.pow(0.3 / clamp(size, 0.004, 6), p.sizeExp);
}

/** Build the mode list for one struck object. */
export function impactModes(sr: number, rng: Rng, p: ModalProfile, size: number, opts: { alphaMul?: number; maxModes?: number; contactFc?: number } = {}): Mode[] {
  const f0 = fundamental(p, size) * (1 + p.jitter * 0.5 * rng.gauss());
  const ratios = size < 0.15 && p.ratiosSmall ? p.ratiosSmall : p.ratios;
  const x = rng.range(0.12, 0.88); // strike position along the object
  const fc = opts.contactFc ?? p.contactFc;
  const alphaMul = opts.alphaMul ?? 1;
  const maxModes = opts.maxModes ?? ratios.length;
  const nyq = sr * 0.45;
  const modes: Mode[] = [];
  for (let k = 0; k < ratios.length && k < maxModes; k++) {
    const f = f0 * ratios[k] * (1 + (k === 0 ? 0.3 : 1) * p.jitter * rng.gauss() * 0.5);
    if (!(f > 20) || f >= nyq) continue;
    const pos = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * (k + 1) * x));
    const a = (p.amps[k] ?? p.amps[p.amps.length - 1]) * pos * contactWeight(f, fc) * (0.8 + 0.4 * rng.next());
    const alpha = (p.alphaG + p.alphaR * f) * alphaMul * (0.85 + 0.3 * rng.next());
    modes.push({ f, a, alpha });
    if (p.beat) {
      const fb = f * (1 + p.beat * (0.5 + rng.next()));
      if (fb < nyq) modes.push({ f: fb, a: a * 0.55, alpha: alpha * 1.1 });
    }
  }
  return modes;
}

/** Longest T60 (s) among modes. */
export function longestT60(modes: readonly Mode[]): number {
  let t = 0;
  for (const m of modes) t = Math.max(t, LN1000 / Math.max(m.alpha, 0.05));
  return t;
}

/**
 * Render one resonant impact of a profile at a given object size (m).
 * Returns an un-normalised mono buffer.
 */
export function synthImpact(sr: number, rng: Rng, noise: Noise, p: ModalProfile, size: number): Float32Array {
  const modes = impactModes(sr, rng, p, size);
  const rattleTime = p.rattle ? 0.16 : 0;
  const len = Math.min(p.maxLen, longestT60(modes) * 0.9 + 0.03) + rattleTime;
  const out = buf(sr, Math.max(len, 0.06));
  addModes(out, 0, sr, modes);
  const ref = Math.max(peakOf(out), 1e-3);
  const sizeLaw = Math.pow(0.3 / clamp(size, 0.01, 6), p.sizeExp);

  // Strike-noise transient (hardness colour: high-passed for hard materials).
  addNoiseBurst(out, 0, sr, noise, p.noiseAmp * ref, {
    attack: 0.0002,
    decay: p.noiseDecay * (0.8 + 0.4 * rng.next()),
    hp: p.noiseHp,
    lp: Math.min(p.noiseLp ?? p.contactFc * 1.2, sr * 0.45),
    grit: p.grit,
  });
  if (p.thumpHz && p.thumpAmp) {
    const fT = clamp(p.thumpHz * Math.pow(sizeLaw, 0.6), 35, 900) * (0.9 + 0.2 * rng.next());
    addThump(out, 0, sr, fT, p.thumpAmp * ref, (p.thumpDecay ?? 0.03) * Math.pow(clamp(size / 0.3, 0.3, 4), 0.3), 0.35, 0.01);
  }
  if (p.wobble && modes.length) {
    // Oil-can sub-mode of a thin panel: a low "bwong" decaying over ~0.3 s.
    addMode(out, 0, sr, modes[0].f * rng.range(0.3, 0.4), p.wobble * ref, rng.range(7, 12), 0);
  }
  if (p.rattle) {
    // Loose internals clicking after the main hit.
    let t = 0.008;
    const n = Math.max(2, Math.round(p.rattle * (0.6 + 0.8 * rng.next())));
    for (let i = 0; i < n; i++) {
      t += noise.exp(0.022);
      const f = rng.range(1600, 5200);
      addMode(out, t * sr, sr, f, ref * rng.range(0.06, 0.22) * Math.exp(-t * 6), rng.range(250, 500), 0);
      addMode(out, t * sr, sr, f * 2.7, ref * rng.range(0.03, 0.1) * Math.exp(-t * 6), 600, 0);
    }
  }
  fadeOut(out, sr, Math.min(0.2 * out.length / sr, 0.25));
  return out;
}

/** Tiny piece impact (1–3.5 cm): a few short modes + click. */
export function synthTick(sr: number, rng: Rng, noise: Noise, p: ModalProfile, size: number): Float32Array {
  const out = buf(sr, 0.12);
  addTickInto(out, 0, sr, rng, noise, p, size, 1);
  return out;
}

/** Mix a tiny-piece impact into `out` at n0 (used by rattles, crumbles, shatters). */
export function addTickInto(out: Float32Array, n0: number, sr: number, rng: Rng, noise: Noise, p: ModalProfile, size: number, amp: number, modes?: Mode[]): Mode[] {
  // Tiny pieces: cap the size law so frequencies stay musical (< 0.3·sr), damp harder.
  const exp = Math.min(p.sizeExp, 0.7);
  const f0 = clamp(p.fRef * Math.pow(0.3 / clamp(size, 0.005, 0.2), exp), 200, sr * 0.3);
  const ms =
    modes ??
    p.ratios.slice(0, 3).map((r, k) => {
      const f = f0 * r * (1 + 0.04 * rng.gauss());
      return { f, a: (p.amps[k] ?? 0.3) * (0.6 + 0.8 * rng.next()), alpha: (p.alphaG + p.alphaR * f) * rng.range(2, 3.5) + 25 };
    });
  addModes(out, n0, sr, ms, amp);
  addNoiseBurst(out, n0, sr, noise, amp * 0.5 * (p.noiseAmp + 0.2), { attack: 0.0001, decay: 0.0012 + p.noiseDecay * 0.3, hp: Math.max(p.noiseHp, 600), grit: p.grit });
  return ms;
}

/**
 * Glass/ceramic "tink" grain: a short bell-like ping (3 modes). alphaMul > 1 shortens it.
 */
export function addTink(out: Float32Array, n0: number, sr: number, f0: number, amp: number, alphaMul = 3, ratios: readonly number[] = [1, 2.32, 4.25], amps: readonly number[] = [1, 0.6, 0.35]): void {
  for (let k = 0; k < ratios.length; k++) {
    const f = f0 * ratios[k];
    const a = amp * amps[k];
    if (f >= Math.min(sr * 0.45, 16000)) break;
    if (k > 0 && a < 0.004) break; // inaudible upper partial of a faint grain
    addMode(out, n0, sr, f, a, (5 + 0.0016 * f) * alphaMul, 0);
  }
}

/**
 * Debris settling rattle: `pieces` small fragments land and bounce (physical bounce timing:
 * Δt = 2v/g, speed × restitution per bounce); each impact is a tick with the piece's own modes.
 */
export function synthRattle(sr: number, rng: Rng, noise: Noise, p: ModalProfile, pieces: number, spread = 0.12, maxDur = 1.4): Float32Array {
  const out = buf(sr, maxDur);
  for (let i = 0; i < pieces; i++) {
    const size = 0.008 * Math.pow(7, rng.next()); // 0.8 – 5.6 cm
    const t0 = rng.next() * spread + (i === 0 ? 0 : rng.next() * 0.05);
    const v0 = rng.range(0.9, 2.6);
    const e = clamp(p.bounce * rng.range(0.8, 1.2), 0.05, 0.7);
    const ampP = Math.pow(size / 0.03, 0.8) * rng.range(0.5, 1);
    let modes: Mode[] | undefined;
    for (const [t, a] of bounces(v0, e, 7, 0.15)) {
      const tt = t0 + t;
      if (tt > maxDur - 0.08) break;
      modes = addTickInto(out, tt * sr, sr, rng, noise, p, size, ampP * a, modes);
      // Rotation changes which modes ring: re-randomise amplitudes slightly.
      if (modes) for (const m of modes) m.a *= rng.range(0.7, 1.3);
    }
    if (p === MODAL.glass && rng.chance(0.3)) {
      // Shard skittering along the floor.
      addNoiseBurst(out, (t0 + 0.15 + rng.next() * 0.2) * sr, sr, noise, 0.08 * ampP, { attack: 0.01, hold: rng.range(0.03, 0.09), decay: 0.02, hp: 3500, lp: 11000, grit: 0.8 });
    }
  }
  fadeOut(out, sr, 0.05);
  return out;
}
