/**
 * Procedural sound-effect recipes. Each recipe receives a fully prepared voice context (`Sc`)
 * and schedules oscillators / filtered noise into it. Main transients sit at t = 0 so sounds stay
 * frame-synced with the action; the few deliberate pre-swells are kept under ~0.1 s, except
 * `transform` (1.2 s riser into its impact) and `meteor_fall` (an incoming crescendo).
 */
import type { SfxId } from './types';
import {
  applyEnv, fm, lfo, noise, partials, rand, thump, tone,
  type Sc,
} from './synth';

type Recipe = (s: Sc) => void;

/* ------------------------------------------------------------------ */
/* Aspect signatures: elemental timbre layered on top of base sounds   */
/* ------------------------------------------------------------------ */

export type SigMode = 'launch' | 'impact' | 'burst' | 'beam';

/** Adds the elemental flavour of `s.aspect` (no-op when no aspect is given). */
export function aspectSig(s: Sc, mode: SigMode, peak: number, dur: number, t = 0): void {
  const a = s.aspect;
  if (!a) return;
  const hit = mode === 'impact' || mode === 'burst';
  switch (a) {
    case 'inferno': {
      // Roaring crackle: bandpassed roar + fire crackle + low body.
      noise(s, { color: 'pink', t, dur, attack: hit ? 0.006 : dur * 0.25, peak: peak * 0.6, env: hit ? 'exp' : 'bell', filter: { type: 'bandpass', f: 360, f2: 950, glide: dur * 0.6, q: 0.9 } });
      noise(s, { color: 'crackle', t, dur: dur * 1.15, attack: 0.008, peak: peak * 0.75, filter: { type: 'bandpass', f: 2300, q: 0.8 } });
      noise(s, { color: 'brown', t, dur, attack: 0.015, peak: peak * 0.5, filter: { type: 'lowpass', f: 480 } });
      break;
    }
    case 'radiance': {
      // Bright harmonic chime + airy shimmer.
      partials(s, { base: 1046.5, ratios: [1, 1.5, 2, 3, 4.01], decay: dur * 1.7, peak: peak * 0.55, t, jitter: 0.003 });
      noise(s, { color: 'white', t, dur, attack: dur * 0.2, peak: peak * 0.22, env: 'bell', filter: { type: 'highpass', f: 6500 }, am: { rate: 22, depth: 0.6 } });
      if (mode === 'beam' || mode === 'burst') {
        tone(s, { type: 'triangle', f: 523.25, t, dur: dur * 1.2, attack: dur * 0.25, peak: peak * 0.18, env: 'bell', vibrato: { rate: 5.5, depth: 0.006 } });
      }
      break;
    }
    case 'verdant': {
      // Organic rustle (fluttering leaves) + woody knocks.
      noise(s, { color: 'pink', t, dur, attack: dur * 0.3, peak: peak * 0.6, env: 'bell', filter: { type: 'bandpass', f: 1250, f2: 2500, glide: dur, q: 1.1 }, am: { rate: 17, depth: 0.85 } });
      tone(s, { type: 'triangle', f: 430, f2: 300, t, dur: 0.12, peak: peak * 0.5 });
      tone(s, { type: 'triangle', f: 575, f2: 410, t: t + 0.05, dur: 0.1, peak: peak * 0.34 });
      if (hit) tone(s, { type: 'triangle', f: 310, f2: 220, t: t + 0.1, dur: 0.12, peak: peak * 0.3 });
      break;
    }
    case 'frost': {
      // Crystalline glass partials + crisp hiss.
      partials(s, { base: 2300, ratios: [1, 1.37, 1.79, 2.31, 2.83, 3.41], decay: [dur * 0.9, dur * 0.5, dur * 0.7, dur * 0.35, dur * 0.25, dur * 0.2], peak: peak * 0.5, t, jitter: 0.03 });
      noise(s, { color: 'white', t, dur: dur * 0.6, attack: 0.003, peak: peak * 0.3, filter: { type: 'highpass', f: 5500 } });
      if (hit) noise(s, { color: 'crackle', t, dur: dur * 0.5, peak: peak * 0.35, filter: { type: 'highpass', f: 4500 }, rate: 1.7 });
      break;
    }
    case 'tempest': {
      // Electric zap + sparks + mains-like buzz.
      tone(s, { type: 'sawtooth', f: 1800, f2: 140, glide: dur * 0.6, t, dur: dur * 0.7, peak: peak * 0.3, filter: { type: 'lowpass', f: 5200 } });
      noise(s, { color: 'crackle', t, dur, attack: 0.002, peak: peak * 0.85, filter: { type: 'highpass', f: 2500 }, rate: 1.6 });
      tone(s, { type: 'square', f: 120, t, dur: dur * 0.5, peak: peak * 0.14, filter: { type: 'lowpass', f: 900 } });
      break;
    }
    case 'void': {
      // Deep wobbling sub + reverse swell.
      const o = tone(s, { type: 'sine', f: 95, f2: 42, glide: dur, t, dur: dur * 1.2, peak: peak * 0.8, attack: 0.01 });
      lfo(s, o.frequency, 7, 14, s.t + t * s.st, dur * 1.2 * s.st);
      noise(s, { color: 'pink', t, dur: Math.min(0.12, dur * 0.4), peak: peak * 0.35, env: 'swell', filter: { type: 'lowpass', f: 700 } });
      noise(s, { color: 'brown', t: t + 0.05, dur: dur * 0.8, peak: peak * 0.3, env: 'bell', attack: dur * 0.3, filter: { type: 'lowpass', f: 380 } });
      break;
    }
    case 'chrono': {
      // Clock ticks + phasey beating shimmer + metallic ring.
      for (let k = 0; k < 3; k++) noise(s, { color: 'white', t: t + k * 0.06, dur: 0.02, peak: peak * 0.5, filter: { type: 'bandpass', f: 3200 - k * 400, q: 12 } });
      tone(s, { type: 'sine', f: 880, f2: 1320, glide: dur, t, dur, peak: peak * 0.22, attack: dur * 0.2, env: 'bell' });
      tone(s, { type: 'sine', f: 884.5, f2: 1326, glide: dur, t, dur, peak: peak * 0.22, attack: dur * 0.2, env: 'bell' });
      partials(s, { base: 1500, ratios: [1, 2.4, 3.9], decay: dur * 1.2, peak: peak * 0.25, t });
      break;
    }
  }
}

/** Formant-filtered saw choir chord ("aah" / "ooh"). */
export function choirChord(s: Sc, semis: number[], baseF: number, t: number, dur: number, peak: number, vowel: 'a' | 'o' = 'a'): void {
  const ctx = s.ctx;
  const t0 = s.t + t * s.st;
  const d = dur * s.st;
  const busIn = ctx.createGain();
  busIn.gain.value = 1;
  const sum = ctx.createGain();
  applyEnv(sum.gain, t0, peak, d * 0.45, d, 'bell');
  const formants: [number, number, number][] = vowel === 'a'
    ? [[800, 7, 1], [1150, 9, 0.55], [2900, 11, 0.22]]
    : [[420, 7, 1], [820, 9, 0.5], [2600, 11, 0.14]];
  for (const [f, q, g] of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g * 3.2;
    busIn.connect(bp);
    bp.connect(gg);
    gg.connect(sum);
  }
  sum.connect(s.out);
  const stopAt = t0 + d + 0.05;
  for (const st of semis) {
    const f = baseF * Math.pow(2, st / 12) * s.p;
    for (const det of [-11, 0, 11]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det + rand(-3, 3);
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6 + rand(-0.4, 0.4);
      const vg = ctx.createGain();
      vg.gain.value = f * 0.006;
      vib.connect(vg);
      vg.connect(o.frequency);
      const og = ctx.createGain();
      og.gain.value = 0.33;
      o.connect(og);
      og.connect(busIn);
      o.start(t0);
      vib.start(t0);
      o.stop(stopAt);
      vib.stop(stopAt);
      s.v.track(o, stopAt);
      s.v.track(vib, stopAt);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

const SAW_CHORD = [[110, -6], [130.81, 0], [164.81, 6], [220, 0]] as const;

export const SFX: Record<SfxId, Recipe> = {
  /* ---------------- movement ---------------- */
  whoosh_light: (s) => {
    s.rev(0.04);
    noise(s, { color: 'white', dur: 0.17, attack: 0.05, peak: 0.62 + 0.28 * s.i, env: 'bell', filter: { type: 'bandpass', f: 520, f2: 2700, glide: 0.13, q: 1.4 } });
  },
  whoosh_heavy: (s) => {
    s.rev(0.06);
    noise(s, { color: 'pink', dur: 0.34, attack: 0.1, peak: 0.62 + 0.22 * s.i, env: 'bell', filter: { type: 'bandpass', f: 260, f2: 1500, glide: 0.26, q: 1.1 } });
    tone(s, { f: 85, f2: 55, dur: 0.3, attack: 0.08, peak: 0.12 + 0.1 * s.i, env: 'bell' });
  },
  whoosh_blade: (s) => {
    s.rev(0.07);
    noise(s, { color: 'white', dur: 0.19, attack: 0.04, peak: 0.7 + 0.2 * s.i, env: 'bell', filter: { type: 'bandpass', f: 1400, f2: 6500, glide: 0.14, q: 3.2 } });
    tone(s, { f: 3000, f2: 4700, glide: 0.12, dur: 0.14, attack: 0.03, peak: 0.06, env: 'bell' });
  },
  dash: (s) => {
    s.rev(0.05);
    noise(s, { color: 'white', dur: 0.26, attack: 0.012, peak: 0.32 + 0.12 * s.i, filter: { type: 'bandpass', f: 3200, f2: 420, glide: 0.22, q: 1.3 } });
    thump(s, { f0: 130, f1: 48, dur: 0.18, peak: 0.3 + 0.15 * s.i });
  },
  jump: (s) => {
    noise(s, { color: 'pink', dur: 0.2, attack: 0.05, peak: 0.2, env: 'bell', filter: { type: 'bandpass', f: 380, f2: 1300, glide: 0.15, q: 1.2 } });
    thump(s, { f0: 105, f1: 60, dur: 0.1, peak: 0.18 });
  },
  land: (s) => {
    thump(s, { f0: 150, f1: 45, dur: 0.16, peak: 0.42 + 0.15 * s.i });
    noise(s, { color: 'brown', dur: 0.14, attack: 0.003, peak: 0.3, filter: { type: 'lowpass', f: 900 } });
  },
  land_heavy: (s) => {
    s.rev(0.12 + 0.1 * s.i);
    noise(s, { color: 'white', dur: 0.03, peak: 0.3, filter: { type: 'highpass', f: 2500 } });
    thump(s, { f0: 125, f1: 33, dur: 0.38 + 0.2 * s.i, peak: 0.72, dist: 6 });
    noise(s, { color: 'crackle', t: 0.01, dur: 0.35, attack: 0.004, peak: 0.35, filter: { type: 'highpass', f: 1400 } });
    noise(s, { color: 'brown', dur: 0.6 + 0.4 * s.i, attack: 0.01, peak: 0.45 + 0.2 * s.i, filter: { type: 'lowpass', f: 260 } });
  },
  footstep: (s) => {
    noise(s, { color: 'brown', dur: 0.06, peak: 0.16, filter: { type: 'lowpass', f: 1300 } });
    thump(s, { f0: 190, f1: 90, dur: 0.06, peak: 0.12 });
  },
  teleport_out: (s) => {
    s.rev(0.16);
    tone(s, { type: 'sine', f: 280, f2: 2600, glide: 0.13, dur: 0.17, attack: 0.005, peak: 0.3 });
    tone(s, { type: 'triangle', f: 560, f2: 5200, glide: 0.13, dur: 0.15, peak: 0.09 });
    noise(s, { color: 'white', dur: 0.1, peak: 0.42, env: 'swell', filter: { type: 'highpass', f: 1800, f2: 7000, glide: 0.1 } });
    noise(s, { color: 'white', t: 0.1, dur: 0.07, peak: 0.32, filter: { type: 'bandpass', f: 6000, q: 0.8 } });
  },
  teleport_in: (s) => {
    s.rev(0.18);
    noise(s, { color: 'white', dur: 0.045, peak: 0.2, env: 'swell', filter: { type: 'bandpass', f: 5000, f2: 1800, glide: 0.045, q: 0.8 } });
    tone(s, { type: 'sine', f: 2400, f2: 260, glide: 0.08, dur: 0.12, peak: 0.2 });
    thump(s, { t: 0.04, f0: 210, f1: 70, dur: 0.14, peak: 0.42 });
    noise(s, { color: 'pink', t: 0.04, dur: 0.16, peak: 0.22, filter: { type: 'lowpass', f: 2600, f2: 400, glide: 0.15 } });
  },

  /* ---------------- melee ---------------- */
  hit_light: (s) => {
    s.rev(0.05);
    noise(s, { color: 'white', dur: 0.012, peak: 0.35, filter: { type: 'highpass', f: 3000 } });
    thump(s, { f0: 240, f1: 85, dur: 0.1, peak: 0.5 + 0.15 * s.i });
    noise(s, { color: 'pink', dur: 0.06, peak: 0.28, filter: { type: 'bandpass', f: 1300, q: 1.1 } });
  },
  hit_medium: (s) => {
    s.rev(0.1);
    noise(s, { color: 'white', dur: 0.015, peak: 0.4, filter: { type: 'highpass', f: 2500 } });
    thump(s, { f0: 190, f1: 58, dur: 0.17 + 0.05 * s.i, peak: 0.62, dist: 3 });
    noise(s, { color: 'pink', dur: 0.1, peak: 0.34, filter: { type: 'bandpass', f: 900, f2: 500, glide: 0.08, q: 1 } });
    noise(s, { color: 'brown', dur: 0.16, peak: 0.2, filter: { type: 'lowpass', f: 400 } });
  },
  hit_heavy: (s) => {
    s.rev(0.18 + 0.12 * s.i);
    const sz = 0.7 + 0.5 * s.i;
    noise(s, { color: 'white', dur: 0.02, peak: 0.45, filter: { type: 'highpass', f: 2200 } });
    thump(s, { f0: 165, f1: 40, dur: 0.32 * sz, peak: 0.78, dist: 8 });
    noise(s, { color: 'pink', dur: 0.18, peak: 0.42, dist: 4, filter: { type: 'bandpass', f: 700, f2: 280, glide: 0.15, q: 0.9 } });
    tone(s, { f: 52, dur: 0.45 * sz, attack: 0.01, peak: 0.35 * sz });
    noise(s, { color: 'brown', t: 0.02, dur: 0.4 * sz, peak: 0.25, filter: { type: 'lowpass', f: 350 } });
  },
  hit_crit: (s) => {
    s.rev(0.3 + 0.15 * s.i);
    const sz = 0.8 + 0.5 * s.i;
    noise(s, { color: 'white', dur: 0.025, peak: 0.5, filter: { type: 'highpass', f: 2000 } });
    thump(s, { f0: 180, f1: 36, dur: 0.42 * sz, peak: 0.85, dist: 12 });
    noise(s, { color: 'pink', dur: 0.22, peak: 0.45, dist: 6, filter: { type: 'bandpass', f: 900, f2: 260, glide: 0.2, q: 0.8 } });
    partials(s, { base: 2100, ratios: [1, 1.41, 1.93, 2.67, 3.3], decay: 0.55, peak: 0.16, jitter: 0.02 });
    tone(s, { f: 46, dur: 0.6 * sz, attack: 0.01, peak: 0.4 * sz });
    noise(s, { color: 'white', t: 0.01, dur: 0.35, peak: 0.12, filter: { type: 'highpass', f: 5000 } });
  },
  slash_hit: (s) => {
    s.rev(0.1);
    noise(s, { color: 'white', dur: 0.1, peak: 0.42, filter: [{ type: 'highpass', f: 2400 }, { type: 'peaking', f: 5200, q: 2, gain: 8 }] });
    tone(s, { type: 'sawtooth', f: 1900, f2: 820, glide: 0.1, dur: 0.12, peak: 0.07, filter: { type: 'bandpass', f: 2200, q: 2 } });
    thump(s, { f0: 170, f1: 70, dur: 0.12, peak: 0.42 });
  },
  block: (s) => {
    s.rev(0.08);
    thump(s, { f0: 280, f1: 150, dur: 0.09, peak: 0.42 });
    noise(s, { color: 'pink', dur: 0.07, peak: 0.36, filter: { type: 'bandpass', f: 1500, q: 2 } });
    partials(s, { base: 820, ratios: [1, 1.5, 2.12], decay: 0.12, peak: 0.12 });
  },
  guard_break: (s) => {
    s.rev(0.35);
    noise(s, { color: 'white', dur: 0.04, peak: 0.55, filter: { type: 'highpass', f: 1800 } });
    partials(s, { base: 2900, ratios: [1, 1.19, 1.47, 1.73, 2.08, 2.36, 2.71], decay: [0.5, 0.3, 0.42, 0.22, 0.35, 0.18, 0.26], peak: 0.34, jitter: 0.05 });
    noise(s, { color: 'crackle', dur: 0.5, peak: 0.45, filter: { type: 'highpass', f: 3000 }, rate: 1.4 });
    thump(s, { f0: 115, f1: 38, dur: 0.45, peak: 0.7, dist: 6 });
    noise(s, { color: 'pink', t: 0.02, dur: 0.6, peak: 0.25, filter: { type: 'lowpass', f: 3000, f2: 300, glide: 0.55 } });
  },
  parry: (s) => {
    s.rev(0.35);
    noise(s, { color: 'white', dur: 0.008, peak: 0.4, filter: { type: 'highpass', f: 4000 } });
    partials(s, { base: 1420, ratios: [1, 2.76, 5.4, 8.93], decay: [0.7, 0.45, 0.3, 0.2], peak: 0.44, gains: [1, 0.6, 0.35, 0.2] });
    tone(s, { f: 1424.5, dur: 0.7, peak: 0.08 });
    thump(s, { f0: 240, f1: 120, dur: 0.06, peak: 0.2 });
  },
  perfect_parry: (s) => {
    s.rev(0.55);
    noise(s, { color: 'white', dur: 0.01, peak: 0.45, filter: { type: 'highpass', f: 4000 } });
    partials(s, { base: 1900, ratios: [1, 2.76, 5.4, 8.93, 13.34], decay: [1.5, 0.9, 0.6, 0.4, 0.25], peak: 0.46, gains: [1, 0.55, 0.35, 0.22, 0.12] });
    tone(s, { f: 1906, dur: 1.4, peak: 0.08 });
    for (let k = 0; k < 4; k++) tone(s, { f: 3800 * (1 + k * 0.25), t: 0.03 + k * 0.035, dur: 0.9, attack: 0.02, peak: 0.035, vibrato: { rate: 6 + k, depth: 0.004 } });
    tone(s, { f: 220, f2: 38, glide: 0.5, dur: 0.6, attack: 0.005, peak: 0.45 });
  },
  clash: (s) => {
    s.rev(0.3);
    noise(s, { color: 'white', dur: 0.03, peak: 0.45, filter: { type: 'bandpass', f: 3200, q: 0.8 } });
    partials(s, { base: 930, ratios: [1, 1.48, 2.13, 2.91, 3.7, 4.53], decay: [0.8, 0.55, 0.65, 0.4, 0.3, 0.22], peak: 0.42, jitter: 0.015 });
    thump(s, { f0: 200, f1: 80, dur: 0.12, peak: 0.36 });
    noise(s, { color: 'crackle', dur: 0.25, peak: 0.25, filter: { type: 'highpass', f: 4000 }, rate: 1.5 });
  },
  clash_heavy: (s) => {
    s.rev(0.5);
    noise(s, { color: 'white', dur: 0.04, peak: 0.5, filter: { type: 'bandpass', f: 2500, q: 0.7 } });
    partials(s, { base: 520, ratios: [1, 1.52, 2.21, 2.97, 3.86, 4.7], decay: [1.4, 1.0, 0.9, 0.6, 0.45, 0.3], peak: 0.44, jitter: 0.012 });
    thump(s, { f0: 95, f1: 30, dur: 0.6, peak: 0.85, dist: 10 });
    noise(s, { color: 'pink', dur: 0.7, peak: 0.35, filter: { type: 'lowpass', f: 3500, f2: 200, glide: 0.65 } });
    noise(s, { color: 'crackle', dur: 0.4, peak: 0.3, filter: { type: 'highpass', f: 3500 }, rate: 1.3 });
  },
  grab: (s) => {
    noise(s, { color: 'pink', dur: 0.08, peak: 0.3, filter: { type: 'bandpass', f: 2100, q: 3 } });
    thump(s, { f0: 210, f1: 120, dur: 0.08, peak: 0.3 });
    tone(s, { f: 420, f2: 190, glide: 0.1, dur: 0.12, peak: 0.12, type: 'triangle' });
  },
  throw_slam: (s) => {
    s.rev(0.2);
    noise(s, { color: 'pink', dur: 0.16, attack: 0.05, peak: 0.3, env: 'bell', filter: { type: 'bandpass', f: 300, f2: 1400, glide: 0.14, q: 1 } });
    const t = 0.14;
    noise(s, { color: 'white', t, dur: 0.02, peak: 0.4, filter: { type: 'highpass', f: 2200 } });
    thump(s, { t, f0: 130, f1: 34, dur: 0.42, peak: 0.85, dist: 8 });
    noise(s, { color: 'brown', t, dur: 0.6, peak: 0.42, filter: { type: 'lowpass', f: 300 } });
    noise(s, { color: 'crackle', t, dur: 0.35, peak: 0.3, filter: { type: 'highpass', f: 1500 } });
  },

  /* ---------------- energy & abilities ---------------- */
  charge_release: (s) => {
    s.rev(0.3);
    noise(s, { color: 'pink', dur: 0.08, peak: 0.28, env: 'swell', filter: { type: 'bandpass', f: 600, f2: 3000, glide: 0.08, q: 1 } });
    const t = 0.07;
    noise(s, { color: 'white', t, dur: 0.5, peak: 0.42, filter: { type: 'bandpass', f: 3500, f2: 300, glide: 0.45, q: 0.9 } });
    fm(s, { t, f: 300, f2: 90, ratio: 1.41, index: 6, index2: 0.5, dur: 0.5, peak: 0.28 });
    thump(s, { t, f0: 140, f1: 40, dur: 0.4, peak: 0.6, dist: 4 });
    aspectSig(s, 'burst', 0.45, 0.6, t);
  },
  projectile_fire: (s) => {
    s.rev(0.12);
    fm(s, { f: 900, f2: 280, ratio: 2.01, index: 3, index2: 0.3, dur: 0.2, peak: 0.18, glide: 0.18 });
    noise(s, { color: 'white', dur: 0.14, peak: 0.16, filter: { type: 'bandpass', f: 2600, f2: 900, glide: 0.12, q: 1.2 } });
    thump(s, { f0: 160, f1: 80, dur: 0.08, peak: 0.18 });
    if (s.aspect) aspectSig(s, 'launch', 0.4 + 0.15 * s.i, 0.3 + 0.1 * s.i);
    else tone(s, { type: 'square', f: 660, f2: 220, glide: 0.15, dur: 0.16, peak: 0.08, filter: { type: 'lowpass', f: 3000 } });
  },
  projectile_hit: (s) => {
    s.rev(0.15);
    thump(s, { f0: 170, f1: 55, dur: 0.18, peak: 0.45 + 0.2 * s.i, dist: 3 });
    noise(s, { color: 'pink', dur: 0.2, peak: 0.3, filter: { type: 'lowpass', f: 3500, f2: 500, glide: 0.18 } });
    if (s.aspect) aspectSig(s, 'impact', 0.42, 0.35);
    else noise(s, { color: 'crackle', dur: 0.2, peak: 0.25, filter: { type: 'bandpass', f: 2500, q: 0.8 } });
  },
  beam_fire: (s) => {
    s.rev(0.4);
    const sz = 0.8 + 0.4 * s.i;
    noise(s, { color: 'white', dur: 0.05, peak: 0.45, filter: { type: 'highpass', f: 1500 } });
    thump(s, { f0: 120, f1: 32, dur: 0.6 * sz, peak: 0.8, dist: 8 });
    noise(s, { color: 'pink', dur: 1.0 * sz, attack: 0.03, peak: 0.5, filter: { type: 'bandpass', f: 1800, f2: 600, glide: 0.8, q: 0.7 } });
    for (const [f, d] of [[55, -9], [55, 9], [82.4, 0], [110, 5]] as const) {
      tone(s, { type: 'sawtooth', f, detune: d, dur: 1.0 * sz, attack: 0.02, peak: 0.12, filter: { type: 'lowpass', f: 2500, f2: 700, glide: 0.9, q: 2 } });
    }
    fm(s, { f: 1400, ratio: 0.53, index: 5, dur: 0.7, peak: 0.08, filter: { type: 'highpass', f: 1500 } });
    aspectSig(s, 'beam', 0.5, 0.9);
  },
  explosion_small: (s) => {
    s.rev(0.2);
    noise(s, { color: 'white', dur: 0.02, peak: 0.4, filter: { type: 'highpass', f: 2000 } });
    thump(s, { f0: 130, f1: 38, dur: 0.35 + 0.15 * s.i, peak: 0.7, dist: 6 });
    noise(s, { color: 'pink', dur: 0.45 + 0.2 * s.i, peak: 0.45, dist: 3, filter: { type: 'lowpass', f: 2800, f2: 260, glide: 0.4 } });
    noise(s, { color: 'crackle', t: 0.02, dur: 0.4, peak: 0.25, filter: { type: 'bandpass', f: 1800, q: 0.7 } });
    aspectSig(s, 'impact', 0.35, 0.4);
  },
  explosion_big: (s) => {
    s.rev(0.4);
    const sz = 0.8 + 0.5 * s.i;
    noise(s, { color: 'white', dur: 0.04, peak: 0.6, filter: { type: 'highpass', f: 1600 } });
    thump(s, { f0: 80, f1: 24, dur: 1.2 * sz, glide: 0.9, peak: 0.95, dist: 14 });
    noise(s, { color: 'brown', dur: 1.6 * sz, attack: 0.01, peak: 0.6, filter: { type: 'lowpass', f: 1600, f2: 140, glide: 1.4 } });
    noise(s, { color: 'pink', dur: 0.8 * sz, peak: 0.4, dist: 5, filter: { type: 'lowpass', f: 5000, f2: 500, glide: 0.6 } });
    noise(s, { color: 'crackle', t: 0.05, dur: 1.2 * sz, peak: 0.3, filter: { type: 'bandpass', f: 1500, q: 0.6 }, rate: 0.8 });
    aspectSig(s, 'impact', 0.3, 0.6);
  },
  shockwave: (s) => {
    s.rev(0.35);
    tone(s, { f: 95, f2: 28, glide: 0.55, dur: 0.65 + 0.2 * s.i, attack: 0.004, peak: 0.75, dist: 3 });
    noise(s, { color: 'pink', dur: 0.75, attack: 0.01, peak: 0.42, filter: { type: 'lowpass', f: 4500, f2: 180, glide: 0.7 } });
    noise(s, { color: 'white', dur: 0.3, attack: 0.002, peak: 0.18, filter: { type: 'highpass', f: 3000, f2: 8000, glide: 0.25 } });
  },
  thunder: (s) => {
    s.rev(0.45);
    const sz = 0.8 + 0.4 * s.i;
    noise(s, { color: 'white', dur: 0.06, peak: 0.7, filter: { type: 'highpass', f: 1200 } });
    noise(s, { color: 'crackle', dur: 0.35, peak: 0.5, filter: { type: 'highpass', f: 900 }, rate: 1.2 });
    thump(s, { f0: 90, f1: 30, dur: 0.6, peak: 0.6, dist: 6 });
    noise(s, { color: 'brown', t: 0.03, dur: 2.6 * sz, attack: 0.15, peak: 0.6, filter: { type: 'lowpass', f: 320, f2: 90, glide: 2.4 }, am: { rate: 3.3, depth: 0.7 } });
  },
  lightning_zap: (s) => {
    s.rev(0.15);
    noise(s, { color: 'white', dur: 0.02, peak: 0.4, filter: { type: 'highpass', f: 3000 } });
    tone(s, { type: 'sawtooth', f: 2200, f2: 110, glide: 0.14, dur: 0.2, peak: 0.25, filter: { type: 'lowpass', f: 6000 } });
    noise(s, { color: 'crackle', dur: 0.28, peak: 0.6, filter: { type: 'highpass', f: 2800 }, rate: 1.8 });
    tone(s, { type: 'square', f: 118, dur: 0.18, peak: 0.12, filter: { type: 'lowpass', f: 1200 } });
  },
  fire_burst: (s) => {
    s.rev(0.2);
    noise(s, { color: 'pink', dur: 0.65, attack: 0.05, peak: 0.55, env: 'bell', filter: { type: 'bandpass', f: 280, f2: 1300, glide: 0.4, q: 0.8 } });
    noise(s, { color: 'crackle', dur: 0.7, peak: 0.5, filter: { type: 'bandpass', f: 2200, q: 0.8 } });
    noise(s, { color: 'brown', dur: 0.6, attack: 0.03, peak: 0.45, filter: { type: 'lowpass', f: 420 } });
    thump(s, { f0: 110, f1: 45, dur: 0.3, peak: 0.4 });
  },
  ice_shatter: (s) => {
    s.rev(0.3);
    noise(s, { color: 'white', dur: 0.04, peak: 0.35, filter: { type: 'highpass', f: 3500 } });
    for (let k = 0; k < 9; k++) tone(s, { f: rand(2200, 8000), t: rand(0, 0.06), dur: rand(0.05, 0.35), peak: rand(0.05, 0.12) });
    noise(s, { color: 'crackle', dur: 0.35, peak: 0.45, filter: { type: 'highpass', f: 4000 }, rate: 1.6 });
    thump(s, { f0: 160, f1: 70, dur: 0.12, peak: 0.35 });
  },
  void_pulse: (s) => {
    s.rev(0.35);
    noise(s, { color: 'pink', dur: 0.1, peak: 0.3, env: 'swell', filter: { type: 'lowpass', f: 900 } });
    const t = 0.09;
    const o = tone(s, { f: 62, dur: 0.9, t, attack: 0.01, peak: 0.75 });
    lfo(s, o.frequency, 6, 18, s.t + t * s.st, 0.9 * s.st);
    fm(s, { t, f: 180, f2: 60, ratio: 0.5, index: 4, dur: 0.7, peak: 0.2 });
    noise(s, { color: 'brown', t, dur: 0.6, peak: 0.25, filter: { type: 'lowpass', f: 300 } });
  },
  radiant_chime: (s) => {
    s.rev(0.55);
    [1, 1.26, 1.5, 2, 2.52].forEach((r, k) => partials(s, { base: 880 * r, ratios: [1, 2, 3], decay: [1.5, 0.8, 0.4], peak: 0.17, t: k * 0.035 }));
    noise(s, { color: 'white', dur: 0.8, attack: 0.05, peak: 0.08, env: 'bell', filter: { type: 'highpass', f: 7000 }, am: { rate: 18, depth: 0.7 } });
  },
  earth_rumble: (s) => {
    s.rev(0.2);
    noise(s, { color: 'brown', dur: 1.3, attack: 0.08, peak: 0.6, filter: { type: 'lowpass', f: 220 }, am: { rate: 11, depth: 0.6 } });
    for (let k = 0; k < 5; k++) thump(s, { t: k * 0.18 + rand(0, 0.06), f0: rand(90, 140), f1: 40, dur: 0.2, peak: rand(0.25, 0.45) });
    noise(s, { color: 'crackle', dur: 1.1, peak: 0.25, filter: { type: 'bandpass', f: 900, q: 0.8 }, rate: 0.6 });
  },
  nature_burst: (s) => {
    s.rev(0.2);
    noise(s, { color: 'pink', dur: 0.55, attack: 0.08, peak: 0.45, env: 'bell', filter: { type: 'bandpass', f: 900, f2: 2200, glide: 0.4, q: 1 }, am: { rate: 16, depth: 0.8 } });
    for (let k = 0; k < 4; k++) tone(s, { type: 'triangle', f: rand(300, 620), f2: rand(200, 300), t: k * 0.05, dur: 0.1, peak: 0.22 });
    noise(s, { color: 'white', dur: 0.4, attack: 0.05, peak: 0.1, env: 'bell', filter: { type: 'highpass', f: 6000 } });
    thump(s, { f0: 130, f1: 60, dur: 0.18, peak: 0.3 });
  },
  chrono_tick: (s) => {
    s.rev(0.4);
    noise(s, { color: 'white', dur: 0.015, peak: 0.85, filter: { type: 'bandpass', f: 3300, q: 10 } });
    noise(s, { color: 'white', t: 0.22, dur: 0.015, peak: 0.72, filter: { type: 'bandpass', f: 2200, q: 10 } });
    partials(s, { base: 1760, ratios: [1, 2.32, 4.1], decay: 0.45, peak: 0.26 });
    tone(s, { f: 1320, f2: 660, glide: 0.4, t: 0.22, dur: 0.4, peak: 0.08, env: 'bell', attack: 0.1 });
  },
  meteor_fall: (s) => {
    s.rev(0.3);
    const d = 1.3;
    tone(s, { f: 1900, f2: 260, glide: d, dur: d, attack: d * 0.7, peak: 0.16, env: 'bell' });
    noise(s, { color: 'pink', dur: d, attack: d * 0.9, peak: 0.55, env: 'bell', filter: { type: 'bandpass', f: 600, f2: 1600, glide: d, q: 0.8 } });
    noise(s, { color: 'crackle', dur: d, attack: d * 0.8, peak: 0.35, env: 'bell', filter: { type: 'bandpass', f: 2000, q: 0.7 } });
    noise(s, { color: 'brown', dur: d, attack: d * 0.85, peak: 0.45, env: 'bell', filter: { type: 'lowpass', f: 300 } });
  },
  meteor_impact: (s) => {
    s.rev(0.45);
    const sz = 0.9 + 0.5 * s.i;
    noise(s, { color: 'white', dur: 0.05, peak: 0.65, filter: { type: 'highpass', f: 1200 } });
    thump(s, { f0: 70, f1: 22, dur: 1.4 * sz, glide: 1.0, peak: 1.0, dist: 16 });
    noise(s, { color: 'brown', dur: 2.0 * sz, peak: 0.65, filter: { type: 'lowpass', f: 1400, f2: 110, glide: 1.8 } });
    noise(s, { color: 'pink', dur: 0.9, peak: 0.45, dist: 6, filter: { type: 'lowpass', f: 6000, f2: 400, glide: 0.8 } });
    noise(s, { color: 'crackle', t: 0.08, dur: 1.5 * sz, peak: 0.4, filter: { type: 'bandpass', f: 1200, q: 0.5 }, rate: 0.7 });
    for (let k = 0; k < 6; k++) thump(s, { t: 0.2 + k * 0.17 + rand(0, 0.08), f0: rand(150, 260), f1: 60, dur: 0.12, peak: rand(0.12, 0.25) });
  },
  time_stop: (s) => {
    s.rev(0.6);
    // Instant freeze: crack + deep "bwomm" + ringing, then the world "inhales".
    noise(s, { color: 'white', dur: 0.03, peak: 0.5, filter: { type: 'highpass', f: 2500 } });
    noise(s, { color: 'white', dur: 0.02, peak: 0.45, filter: { type: 'bandpass', f: 3300, q: 10 } });
    tone(s, { f: 130, f2: 36, glide: 1.0, dur: 1.5, attack: 0.004, peak: 0.8, dist: 5 });
    tone(s, { f: 3520, dur: 2.2, attack: 0.05, peak: 0.05, vibrato: { rate: 5, depth: 0.003 } });
    partials(s, { base: 660, ratios: [1, 1.5, 2.25, 3.37], decay: 1.8, peak: 0.18 });
    noise(s, { color: 'white', t: 0.1, dur: 0.6, peak: 0.25, env: 'swell', filter: { type: 'highpass', f: 2500, f2: 9000, glide: 0.6 } });
  },
  time_resume: (s) => {
    s.rev(0.4);
    tone(s, { f: 38, f2: 220, glide: 0.3, dur: 0.34, attack: 0.12, peak: 0.55, env: 'bell' });
    noise(s, { color: 'white', dur: 0.3, attack: 0.16, peak: 0.3, env: 'bell', filter: { type: 'bandpass', f: 400, f2: 5000, glide: 0.28, q: 0.9 } });
    noise(s, { color: 'white', t: 0.26, dur: 0.04, peak: 0.45, filter: { type: 'highpass', f: 2000 } });
    thump(s, { t: 0.26, f0: 160, f1: 50, dur: 0.25, peak: 0.5 });
  },
  rewind: (s) => {
    s.rev(0.35);
    const d = 0.9;
    const n = noise(s, { color: 'pink', dur: d, attack: 0.1, peak: 0.85, env: 'hold', filter: { type: 'bandpass', f: 2400, f2: 500, glide: d, q: 2.5 } });
    lfo(s, n.playbackRate, 9, 0.35, s.t, d * s.st);
    const o = tone(s, { type: 'sawtooth', f: 880, f2: 220, glide: d, dur: d, attack: 0.05, peak: 0.16, env: 'hold', filter: { type: 'lowpass', f: 2500 } });
    lfo(s, o.frequency, 11, 60, s.t, d * s.st);
    partials(s, { base: 1200, ratios: [1, 1.5, 2], decay: 0.3, peak: 0.12, t: d - 0.05 });
  },
  shield_up: (s) => {
    s.rev(0.35);
    for (const f of [440, 660, 880, 1320]) tone(s, { f, dur: 0.6, attack: 0.12, peak: 0.08, env: 'bell', vibrato: { rate: 7, depth: 0.004 } });
    tone(s, { f: 200, f2: 520, glide: 0.25, dur: 0.35, attack: 0.05, peak: 0.25, env: 'bell' });
    noise(s, { color: 'white', dur: 0.5, attack: 0.1, peak: 0.1, env: 'bell', filter: { type: 'highpass', f: 6000 } });
  },
  shield_hit: (s) => {
    s.rev(0.25);
    partials(s, { base: 720, ratios: [1, 1.53, 2.43, 3.3], decay: [0.35, 0.25, 0.18, 0.12], peak: 0.34 });
    thump(s, { f0: 220, f1: 110, dur: 0.1, peak: 0.35 });
    noise(s, { color: 'white', dur: 0.05, peak: 0.18, filter: { type: 'bandpass', f: 3000, q: 1 } });
  },
  shield_break: (s) => {
    s.rev(0.45);
    noise(s, { color: 'white', dur: 0.05, peak: 0.45, filter: { type: 'highpass', f: 2500 } });
    for (let k = 0; k < 10; k++) tone(s, { f: rand(1800, 7500), t: rand(0, 0.08), dur: rand(0.08, 0.5), peak: rand(0.05, 0.12) });
    noise(s, { color: 'crackle', dur: 0.5, peak: 0.5, filter: { type: 'highpass', f: 3500 }, rate: 1.4 });
    tone(s, { f: 110, f2: 34, glide: 0.4, dur: 0.5, peak: 0.6, dist: 4 });
  },
  reflect: (s) => {
    s.rev(0.3);
    noise(s, { color: 'white', dur: 0.03, peak: 0.35, filter: { type: 'highpass', f: 3000 } });
    partials(s, { base: 1650, ratios: [1, 2.76, 5.4], decay: [0.4, 0.25, 0.15], peak: 0.3 });
    tone(s, { f: 420, f2: 2600, glide: 0.08, dur: 0.1, peak: 0.2 });
    tone(s, { f: 3200, f2: 1400, glide: 0.35, t: 0.05, dur: 0.38, peak: 0.08, env: 'lin', attack: 0.01 });
  },
  chains: (s) => {
    s.rev(0.2);
    for (let k = 0; k < 9; k++) {
      const t = k * 0.045 + rand(0, 0.02);
      partials(s, { base: rand(1600, 3200), ratios: [1, 1.43, 2.11], decay: 0.09, peak: rand(0.1, 0.18), t });
      noise(s, { color: 'white', t, dur: 0.012, peak: 0.12, filter: { type: 'bandpass', f: 4000, q: 2 } });
    }
    thump(s, { t: 0.4, f0: 180, f1: 80, dur: 0.15, peak: 0.4 });
    partials(s, { t: 0.4, base: 640, ratios: [1, 1.5, 2.3], decay: 0.3, peak: 0.22 });
  },
  gravity: (s) => {
    s.rev(0.35);
    const o = tone(s, { f: 210, f2: 34, glide: 0.8, dur: 0.95, attack: 0.02, peak: 0.7 });
    lfo(s, o.frequency, 5, 9, s.t, 0.95 * s.st);
    noise(s, { color: 'pink', dur: 0.5, peak: 0.35, env: 'swell', filter: { type: 'lowpass', f: 900, f2: 300, glide: 0.5 } });
    fm(s, { f: 90, f2: 40, ratio: 0.5, index: 3, dur: 0.9, peak: 0.2 });
  },
  blade_summon: (s) => {
    s.rev(0.35);
    for (let k = 0; k < 4; k++) {
      const t = k * 0.07;
      partials(s, { base: 2400 + k * 180, ratios: [1, 1.34, 2.07, 2.9], decay: [0.6, 0.4, 0.3, 0.2], peak: 0.22, t, vibrato: { rate: 7, depth: 0.003 } });
      noise(s, { color: 'white', t, dur: 0.1, attack: 0.03, peak: 0.22, env: 'bell', filter: { type: 'bandpass', f: 3000, f2: 7000, glide: 0.1, q: 2.5 } });
    }
  },
  spatial_cut: (s) => {
    s.rev(0.4);
    for (let k = 0; k < 5; k++) {
      const t = k * 0.055 + rand(0, 0.015);
      noise(s, { color: 'white', t, dur: 0.05, peak: 0.42, filter: [{ type: 'highpass', f: 2500 }, { type: 'peaking', f: rand(4000, 7000), q: 3, gain: 10 }] });
    }
    partials(s, { base: 2900, ratios: [1, 1.41, 2.2], decay: 0.7, peak: 0.12, t: 0.05 });
    thump(s, { t: 0.3, f0: 140, f1: 38, dur: 0.4, peak: 0.6, dist: 5 });
  },
  heal: (s) => {
    s.rev(0.5);
    [0, 4, 7, 12, 16].forEach((st, k) => tone(s, { f: 523.25 * Math.pow(2, st / 12), t: k * 0.09, dur: 0.8, attack: 0.08, peak: 0.2, env: 'bell', type: 'triangle' }));
    noise(s, { color: 'white', dur: 1.0, attack: 0.3, peak: 0.12, env: 'bell', filter: { type: 'highpass', f: 5000 }, am: { rate: 9, depth: 0.6 } });
  },
  transform: (s) => {
    s.rev(0.55);
    const r = 1.2; // riser into the impact
    noise(s, { color: 'white', dur: r, attack: r * 0.95, peak: 0.4, env: 'bell', filter: { type: 'bandpass', f: 300, f2: 6000, glide: r, q: 1.2 } });
    for (const d of [-14, 0, 14]) {
      tone(s, { type: 'sawtooth', f: 110, f2: 440, glide: r, dur: r, detune: d, attack: r * 0.9, peak: 0.07, env: 'bell', filter: { type: 'lowpass', f: 600, f2: 5000, glide: r } });
    }
    noise(s, { color: 'white', t: r, dur: 0.05, peak: 0.6, filter: { type: 'highpass', f: 1500 } });
    thump(s, { t: r, f0: 90, f1: 26, dur: 1.2, glide: 0.8, peak: 0.95, dist: 12 });
    noise(s, { color: 'pink', t: r, dur: 1.5, attack: 0.02, peak: 0.45, filter: { type: 'bandpass', f: 500, f2: 250, glide: 1.4, q: 0.6 } });
    aspectSig(s, 'burst', 0.55, 1.4, r);
  },
  ultimate_cutin: (s) => {
    s.rev(0.45);
    noise(s, { color: 'white', dur: 0.22, attack: 0.15, peak: 0.4, env: 'bell', filter: { type: 'bandpass', f: 800, f2: 7000, glide: 0.2, q: 1 } });
    const t = 0.2;
    for (const [f, d] of [[55, -8], [55, 8], [82.4, 0], [110, -5], [164.8, 5]] as const) {
      tone(s, { t, type: 'sawtooth', f, detune: d, dur: 1.3, attack: 0.01, peak: 0.09, dist: 2, filter: { type: 'lowpass', f: 300, f2: 2000, glide: 0.15, q: 3 } });
    }
    thump(s, { t, f0: 120, f1: 36, dur: 0.6, peak: 0.7, dist: 6 });
    partials(s, { t, base: 2200, ratios: [1, 1.5, 2.01], decay: 0.9, peak: 0.1 });
  },
  aura_flare: (s) => {
    s.rev(0.35);
    noise(s, { color: 'pink', dur: 0.75, attack: 0.18, peak: 0.45, env: 'bell', filter: { type: 'bandpass', f: 250, f2: 1400, glide: 0.5, q: 0.8 } });
    tone(s, { f: 55, f2: 82, glide: 0.4, dur: 0.75, attack: 0.15, peak: 0.4, env: 'bell' });
    aspectSig(s, 'burst', 0.45, 0.7);
  },
  burst: (s) => {
    s.rev(0.4);
    noise(s, { color: 'white', dur: 0.06, peak: 0.25, env: 'swell', filter: { type: 'highpass', f: 2000 } });
    const t = 0.05;
    thump(s, { t, f0: 110, f1: 30, dur: 0.55, peak: 0.85, dist: 8 });
    noise(s, { color: 'white', t, dur: 0.6, peak: 0.45, filter: { type: 'lowpass', f: 6000, f2: 300, glide: 0.5 } });
    aspectSig(s, 'burst', 0.5, 0.6, t);
  },

  /* ---------------- drama ---------------- */
  last_stand: (s) => {
    s.rev(0.6);
    noise(s, { color: 'white', dur: 0.04, peak: 0.5, filter: { type: 'highpass', f: 1500 } });
    tone(s, { f: 52, f2: 26, glide: 1.8, dur: 2.2, attack: 0.005, peak: 0.9, dist: 6 });
    for (const t of [0.5, 1.3]) {
      thump(s, { t, f0: 70, f1: 42, dur: 0.14, peak: 0.55 });
      thump(s, { t: t + 0.2, f0: 62, f1: 38, dur: 0.12, peak: 0.42 });
    }
    tone(s, { f: 4186, dur: 2.5, attack: 0.3, peak: 0.03, env: 'bell' });
    choirChord(s, [0, 3, 7, 12], 220, 0.3, 2.4, 0.14, 'a');
  },
  heartbeat: (s) => {
    thump(s, { f0: 68, f1: 40, dur: 0.15, peak: 0.6, attack: 0.004 });
    thump(s, { t: 0.2, f0: 60, f1: 36, dur: 0.13, peak: 0.45, attack: 0.004 });
    noise(s, { color: 'brown', dur: 0.12, peak: 0.12, filter: { type: 'lowpass', f: 180 } });
  },
  ko: (s) => {
    s.rev(0.7);
    noise(s, { color: 'white', dur: 0.05, peak: 0.6, filter: { type: 'highpass', f: 1500 } });
    thump(s, { f0: 140, f1: 28, dur: 1.0, glide: 0.6, peak: 1.0, dist: 18 });
    noise(s, { color: 'pink', dur: 0.5, peak: 0.45, dist: 6, filter: { type: 'bandpass', f: 1000, f2: 200, glide: 0.4, q: 0.7 } });
    partials(s, { base: 1760, ratios: [1, 1.5, 2.37, 3.1], decay: 2.2, peak: 0.12 });
    tone(s, { f: 160, f2: 30, glide: 1.5, t: 0.05, dur: 1.8, attack: 0.02, peak: 0.4 });
  },
  finisher_slash: (s) => {
    s.rev(0.65);
    noise(s, { color: 'white', dur: 0.06, peak: 0.6, filter: [{ type: 'highpass', f: 3000 }, { type: 'peaking', f: 6500, q: 2, gain: 9 }] });
    partials(s, { base: 2400, ratios: [1, 1.003, 2.01, 3.02], decay: [1.8, 1.8, 0.9, 0.5], peak: 0.26, vibrato: { rate: 5, depth: 0.004 } });
    tone(s, { f: 200, f2: 50, glide: 0.4, dur: 0.5, peak: 0.45 });
  },
  finish_boom: (s) => {
    s.rev(0.7);
    const sz = 1 + 0.4 * s.i;
    noise(s, { color: 'white', dur: 0.06, peak: 0.7, filter: { type: 'highpass', f: 1000 } });
    thump(s, { f0: 75, f1: 20, dur: 1.8 * sz, glide: 1.3, peak: 1.0, dist: 20 });
    noise(s, { color: 'brown', dur: 2.5 * sz, peak: 0.7, filter: { type: 'lowpass', f: 1800, f2: 90, glide: 2.2 } });
    noise(s, { color: 'pink', dur: 1.2, peak: 0.5, dist: 8, filter: { type: 'lowpass', f: 7000, f2: 300, glide: 1.0 } });
    noise(s, { color: 'crackle', t: 0.1, dur: 2.0 * sz, peak: 0.35, filter: { type: 'bandpass', f: 1300, q: 0.5 }, rate: 0.7 });
  },
  dramatic_hit: (s) => {
    s.rev(0.55);
    thump(s, { f0: 105, f1: 55, dur: 0.6, peak: 0.85, dist: 3 });
    noise(s, { color: 'pink', dur: 0.25, peak: 0.35, filter: { type: 'bandpass', f: 400, q: 0.8 } });
    noise(s, { color: 'white', dur: 0.18, peak: 0.3, filter: { type: 'highpass', f: 1800 } });
    for (const [f, d] of SAW_CHORD) tone(s, { type: 'sawtooth', f, detune: d, dur: 0.7, peak: 0.07, filter: { type: 'lowpass', f: 2200, f2: 500, glide: 0.5 } });
  },
  slowmo_in: (s) => {
    s.rev(0.3);
    tone(s, { f: 420, f2: 55, glide: 0.5, dur: 0.6, attack: 0.01, peak: 0.45, env: 'lin' });
    noise(s, { color: 'pink', dur: 0.55, attack: 0.02, peak: 0.35, filter: { type: 'bandpass', f: 3000, f2: 200, glide: 0.5, q: 1 } });
  },
  slowmo_out: (s) => {
    s.rev(0.2);
    tone(s, { f: 55, f2: 320, glide: 0.33, dur: 0.38, attack: 0.15, peak: 0.4, env: 'bell' });
    noise(s, { color: 'pink', dur: 0.35, attack: 0.2, peak: 0.3, env: 'bell', filter: { type: 'bandpass', f: 250, f2: 3500, glide: 0.33, q: 1 } });
  },

  /* ---------------- environment ---------------- */
  wall_splat: (s) => {
    s.rev(0.3);
    noise(s, { color: 'white', dur: 0.03, peak: 0.5, filter: { type: 'highpass', f: 1800 } });
    thump(s, { f0: 115, f1: 34, dur: 0.5, peak: 0.9, dist: 10 });
    noise(s, { color: 'crackle', dur: 0.6, peak: 0.45, filter: { type: 'highpass', f: 1200 }, rate: 0.9 });
    noise(s, { color: 'brown', dur: 0.7, peak: 0.45, filter: { type: 'lowpass', f: 320 } });
  },
  pillar_break: (s) => {
    s.rev(0.35);
    noise(s, { color: 'pink', dur: 0.12, peak: 0.6, dist: 4, filter: { type: 'bandpass', f: 800, q: 0.8 } });
    thump(s, { f0: 100, f1: 30, dur: 0.6, peak: 0.8, dist: 8 });
    for (let k = 0; k < 10; k++) thump(s, { t: 0.08 + k * 0.11 + rand(0, 0.06), f0: rand(120, 300), f1: rand(50, 90), dur: rand(0.06, 0.16), peak: rand(0.12, 0.3) });
    noise(s, { color: 'crackle', dur: 1.3, peak: 0.35, filter: { type: 'bandpass', f: 1500, q: 0.6 }, rate: 0.8 });
    noise(s, { color: 'brown', dur: 1.4, attack: 0.05, peak: 0.45, filter: { type: 'lowpass', f: 250 } });
  },
  debris: (s) => {
    for (let k = 0; k < 6; k++) {
      const t = rand(0, 0.4);
      thump(s, { t, f0: rand(180, 420), f1: rand(70, 140), dur: rand(0.04, 0.1), peak: rand(0.1, 0.22) });
      noise(s, { color: 'white', t, dur: 0.02, peak: rand(0.06, 0.13), filter: { type: 'bandpass', f: rand(1500, 4000), q: 1.5 } });
    }
  },
  rumble: (s) => {
    s.rev(0.2);
    noise(s, { color: 'brown', dur: 1.6, attack: 0.25, peak: 0.6, env: 'bell', filter: { type: 'lowpass', f: 160 }, am: { rate: 7, depth: 0.5 } });
    tone(s, { f: 38, dur: 1.5, attack: 0.3, peak: 0.25, env: 'bell' });
  },

  /* ---------------- ui ---------------- */
  ui_select: (s) => {
    tone(s, { f: 1250, dur: 0.06, peak: 0.12, type: 'triangle' });
    tone(s, { t: 0.04, f: 1875, dur: 0.08, peak: 0.1, type: 'triangle' });
  },
  ui_vs: (s) => {
    s.rev(0.5);
    noise(s, { color: 'white', dur: 0.2, attack: 0.15, peak: 0.35, env: 'bell', filter: { type: 'bandpass', f: 600, f2: 6000, glide: 0.18, q: 1 } });
    const t = 0.18;
    thump(s, { t, f0: 110, f1: 40, dur: 0.6, peak: 0.85, dist: 6 });
    partials(s, { t, base: 880, ratios: [1, 1.48, 2.13, 2.91], decay: 1.2, peak: 0.25 });
    noise(s, { t, color: 'white', dur: 1.2, peak: 0.15, filter: { type: 'highpass', f: 5000 } });
  },
  ui_fight: (s) => {
    s.rev(0.6);
    thump(s, { f0: 120, f1: 38, dur: 0.8, peak: 0.95, dist: 8 });
    noise(s, { color: 'white', dur: 1.6, peak: 0.3, filter: { type: 'highpass', f: 4500 } });
    for (const [f, d] of [...SAW_CHORD, [261.63, 3]] as const) tone(s, { type: 'sawtooth', f, detune: d, dur: 1.0, peak: 0.07, filter: { type: 'lowpass', f: 3000, f2: 600, glide: 0.8 } });
    noise(s, { color: 'pink', dur: 0.3, peak: 0.35, filter: { type: 'bandpass', f: 500, q: 0.8 } });
  },
  victory: (s) => {
    s.rev(0.6);
    [0, 4, 7, 12].forEach((st, k) => {
      const f = 261.63 * Math.pow(2, st / 12);
      tone(s, { type: 'sawtooth', f, t: k * 0.12, dur: 1.6 - k * 0.12, attack: 0.04, peak: 0.13, filter: { type: 'lowpass', f: 1800 } });
      tone(s, { type: 'triangle', f: f * 2, t: k * 0.12, dur: 1.2, attack: 0.01, peak: 0.11 });
    });
    noise(s, { color: 'white', t: 0.36, dur: 1.4, peak: 0.12, filter: { type: 'highpass', f: 6000 } });
  },
  countdown: (s) => {
    tone(s, { f: 880, dur: 0.18, peak: 0.22 });
    tone(s, { f: 1760, dur: 0.08, peak: 0.06 });
    noise(s, { color: 'white', dur: 0.01, peak: 0.2, filter: { type: 'highpass', f: 3000 } });
  },
};

/** Sounds that keep exact pitch (musical / UI). */
export const NO_VARIATION: ReadonlySet<SfxId> = new Set<SfxId>(['victory', 'countdown', 'ui_select', 'ui_vs', 'ui_fight', 'heal', 'radiant_chime', 'last_stand']);

/** Dropped first when the voice budget is exhausted. */
export const LOW_PRIORITY: ReadonlySet<SfxId> = new Set<SfxId>(['footstep', 'debris', 'whoosh_light', 'ui_select', 'jump', 'land']);

/** Huge impacts that briefly dip the music (sidechain feel) when intensity > 0.8. */
export const SIDECHAIN_TRIGGERS: ReadonlySet<SfxId> = new Set<SfxId>(['hit_heavy', 'hit_crit', 'explosion_big', 'finish_boom', 'meteor_impact', 'ko', 'clash_heavy']);
