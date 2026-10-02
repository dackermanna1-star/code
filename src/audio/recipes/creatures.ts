/**
 * Creature sounds. Voices use the source-filter synth (dsp/voice.ts) with per-species vocal
 * tract scale, pitch contours, roughness and nasality; non-vocal mobs (skeleton, spider,
 * slime, blaze, golem ...) use physical models.
 */
import { addNoise, alloc, applyDecay, asymClip, highpass, lowpass, mix, peakEq, resample, reverse, softClip, sweep, fade } from '../dsp/core';
import { echo, reverbMono, ringMod, comb } from '../dsp/fx';
import { bubble, bubbles, burst, clicks, crackle, creak, grains, randomModes, ratioModes, scatter, strike, thump, whoosh, PLATE } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { voice, type VoiceOpts } from '../dsp/voice';
import { bodyThud, boom, debris, sizzle, slosh, squelch } from './kit';
import type { SoundSpec } from './types';

type V = Omit<VoiceOpts, 'dur'>;

/** Renders a voice into a fresh buffer with headroom for the tail. */
function vox(sr: number, r: Rand, dur: number, o: V, pad = 0.1): Float32Array {
  const out = alloc(sr, dur + pad);
  voice(out, sr, r, 0.005, { ...o, dur });
  return out;
}

const pickVowels = (r: Rand, dur: number, seqs: readonly (readonly string[])[]): (number | string)[] => {
  const seq = r.pick(seqs);
  const out: (number | string)[] = [];
  for (let i = 0; i < seq.length; i++) out.push((dur * i) / Math.max(1, seq.length - 1), seq[i]);
  return out;
};

// ---------------------------------------------------------------------------------------
// Undead
// ---------------------------------------------------------------------------------------

function zombieGroan(sr: number, r: Rand, dur: number, fA: number, fB: number, fC: number, rough: number, hurt = false): Float32Array {
  const out = vox(sr, r, dur, {
    f0: [0, fA, dur * 0.3, fB, dur * 0.75, (fB + fC) / 2, dur, fC],
    amp: hurt ? [0, 0, 0.012, 1, dur * 0.5, 0.8, dur, 0] : [0, 0, 0.09, 0.75, dur * 0.3, 1, dur * 0.7, 0.85, dur, 0],
    vowel: pickVowels(r, dur, hurt ? [['uh', 'U'], ['a', 'uh'], ['er', 'U']] : [['uh', 'o', 'a', 'o'], ['U', 'a', 'uh'], ['o', 'uh', 'a', 'er'], ['er', 'a', 'o']]),
    scale: 0.86,
    tilt: 1.6,
    breath: [0, 0.4, dur * 0.5, 0.3, dur, 0.55],
    rough: [0, rough * 0.6, dur, rough],
    jitter: 0.022,
    shimmer: 0.14,
    drift: 0.035,
    nasal: 0.08,
    maxHz: 5000,
  });
  // throat rasp layer
  whoosh(out, sr, r, 0.005, dur, { f: [0, 380, 0.5, 520, 1, 300], amp: [0, 0, 0.15, 1, 0.8, 0.8, 1, 0], q: 1.5, gain: 0.12 });
  asymClip(out, 1.8, 0.15);
  lowpass(out, sr, 4200);
  return out;
}

/** Dry bone clacks in quick succession (evenly loud, density gently pulsing). */
function boneRattle(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, rate: number, amp: number): void {
  const k = r.range(1.5, 3);
  const ph = r.next() * Math.PI * 2;
  scatter(r, t0, t0 + dur, (t) => rate * (0.65 + 0.35 * Math.sin(((t - t0) / dur) * Math.PI * 2 * k + ph)), (t) => {
    const a = amp * r.range(0.55, 1);
    const f = r.log(900, 3200);
    strike(out, sr, t, [
      { f, t60: r.range(0.015, 0.03), a: 0.6 },
      { f: f * r.range(1.4, 1.9), t60: 0.015, a: 0.3 },
      { f: f * r.range(2.3, 3.1), t60: 0.01, a: 0.2 },
    ], a);
    burst(out, sr, r, t, 0.002, a * 0.6, 1500, 9000);
  });
}

function spiderHiss(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, amp: number, fc = 4200): void {
  whoosh(out, sr, r, t0, dur, { f: [0, fc * 0.8, 0.5, fc, 1, fc * 0.75], amp: [0, 0, 0.08, 1, 0.7, 0.7, 1, 0], q: 1.6, gain: amp });
}

function chitter(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, rate: number, amp: number): void {
  let t = t0;
  while (t < t0 + dur) {
    const a = amp * r.range(0.4, 1);
    strike(out, sr, t, [{ f: r.log(2200, 4800), t60: 0.006, a }, { f: r.log(5000, 8000), t60: 0.004, a: a * 0.5 }]);
    t += (1 / rate) * r.range(0.6, 1.4);
  }
}

/** Enderman voice: warped formant voice, ring-modulated, partly reversed, with echo. */
function enderVoice(sr: number, r: Rand, dur: number, f: readonly number[], rough: number, rm: number, reversed: boolean): Float32Array {
  let v = vox(sr, r, dur, {
    f0: f,
    amp: [0, 0, dur * 0.1, 1, dur * 0.8, 0.8, dur, 0],
    vowel: pickVowels(r, dur, [['o', 'a', 'u'], ['u', 'e', 'o'], ['a', 'U', 'er']]),
    scale: r.range(0.8, 1.05),
    tilt: 1.5,
    breath: 0.25,
    rough,
    jitter: 0.01,
    vib: [r.range(5, 9), 0.04],
    maxHz: 6000,
  });
  ringMod(v, sr, r.range(28, 60), 0.55 * rm);
  if (reversed) {
    // reverse the first half: unnatural swelling onset typical of the "otherworldly" voice
    const h = Math.floor(v.length * 0.45);
    const a = v.slice(0, h);
    reverse(a);
    fade(a, sr, 0.03, 0.03);
    for (let i = 0; i < h; i++) v[i] = v[i] * 0.4 + a[i] * 0.8;
  }
  v = resample(v, r.range(0.85, 1.1));
  return echo(v, sr, r.range(0.07, 0.11), 0.35, 0.3, 3500, 0.4);
}

// ---------------------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------------------

function moo(sr: number, r: Rand, dur: number, base: number, hurt: boolean): Float32Array {
  const out = vox(sr, r, dur, {
    f0: hurt ? [0, base * 1.3, dur * 0.3, base * 1.5, dur, base * 1.0] : [0, base * 0.85, dur * 0.25, base * 1.25, dur * 0.6, base * 1.12, dur, base * 0.74],
    amp: hurt ? [0, 0, 0.02, 1, dur * 0.7, 0.8, dur, 0] : [0, 0, 0.12, 0.6, dur * 0.35, 1, dur * 0.8, 0.85, dur, 0],
    vowel: hurt ? [0, 'm', dur * 0.2, 'o', dur, 'U'] : [0, 'm', dur * 0.15, 'm', dur * 0.35, 'U', dur * 0.6, 'o', dur * 0.85, 'U', dur, 'u'],
    scale: 0.76,
    tilt: 1.15,
    breath: [0, 0.15, dur * 0.6, 0.3, dur, 0.6],
    rough: [0, 0.3, dur * 0.3, 0.1, dur * 0.8, 0.25, dur, 0.6],
    nasal: [0, 0.9, dur * 0.2, 0.6, dur * 0.35, 0.1, dur * 0.8, 0.15, dur, 0.4],
    jitter: 0.012,
    shimmer: 0.07,
    drift: 0.02,
    vib: [r.range(4, 6), 0.012],
    maxHz: 5000,
  });
  // mouth opening: dark "mm" → open "OO" → closing
  sweep(out, sr, 'lp', hurt ? [0, 1200, dur * 0.25, 4500, dur, 2500] : [0, 900, dur * 0.3, 4500, dur * 0.85, 3000, dur, 1300], 0.7);
  return out;
}

function oink(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f: number, rough: number): void {
  voice(out, sr, r, t0, {
    dur,
    f0: [0, f, dur * 0.35, f * 1.35, dur, f * 1.1],
    amp: [0, 0, 0.012, 1, dur * 0.6, 0.85, dur, 0],
    vowel: [0, 'ng', dur * 0.5, 'U', dur, 'ng'],
    scale: 1.25,
    tilt: 1.15,
    breath: 0.45,
    rough,
    nasal: 0.4,
    jitter: 0.03,
    shimmer: 0.2,
    maxHz: 5000,
  });
  // snort turbulence
  whoosh(out, sr, r, t0, dur * 0.8, { f: [0, 800, 0.5, 1500, 1, 1000], amp: [0, 0, 0.1, 1, 1, 0], q: 2, gain: 0.5 });
}

function cluck(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f: number, long: boolean): void {
  voice(out, sr, r, t0, {
    dur,
    f0: long ? [0, f, dur * 0.4, f * 1.55, dur, f * 1.1] : [0, f * 0.9, dur * 0.4, f * 1.3, dur, f * 1.05],
    amp: [0, 0, 0.006, 1, dur * 0.7, 0.7, dur, 0],
    vowel: long ? [0, 'U', dur * 0.3, 'a', dur, 'uh'] : [0, 'U', dur, 'uh'],
    scale: 1.7,
    tilt: 1.2,
    breath: 0.25,
    rough: 0.35,
    jitter: 0.02,
    shimmer: 0.15,
    maxHz: 7000,
  });
}

function hum(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f: readonly number[], o: Partial<V> = {}): void {
  voice(out, sr, r, t0, {
    dur,
    f0: f,
    amp: [0, 0, 0.03, 1, dur * 0.75, 0.85, dur, 0],
    vowel: [0, 'm', dur * 0.12, 'ng', dur * 0.8, 'ng', dur, 'm'],
    scale: 1.05,
    tilt: 1.3,
    breath: [0, 0.35, 0.04, 0.12, dur, 0.15],
    rough: [0, 0.25, 0.06, 0.08, dur, 0.1],
    nasal: 0.35,
    jitter: 0.008,
    shimmer: 0.05,
    drift: 0.012,
    maxHz: 6000,
    ...o,
  });
}

/** Villager nasal "honk" colouring. */
function villagerEq(b: Float32Array, sr: number): Float32Array {
  peakEq(b, sr, 1350, 1.4, 6);
  peakEq(b, sr, 2600, 2, 3);
  highpass(b, sr, 130);
  return b;
}

function bark(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f: number): void {
  // plosive onset + rough, breathy voiced bark with a noisy body
  burst(out, sr, r, t0, 0.016, 0.8, 300, 5000);
  voice(out, sr, r, t0 + 0.003, {
    dur,
    f0: [0, f * 0.8, dur * 0.15, f * 1.2, dur, f * 0.6],
    amp: [0, 0, 0.005, 1, dur * 0.4, 0.8, dur, 0],
    vowel: [0, 'a', dur * 0.55, 'o', dur, 'u'],
    scale: 1.05,
    tilt: 1.0,
    breath: 0.8,
    rough: 0.85,
    jitter: 0.045,
    shimmer: 0.3,
    maxHz: 7000,
  });
  whoosh(out, sr, r, t0, dur, { f: [0, 1500, 1, 700], amp: [0, 0, 0.08, 1, 0.5, 0.6, 1, 0], q: 1.4, gain: 0.45 });
}

function ghastCry(sr: number, r: Rand, dur: number, f: readonly number[], o: Partial<V>, verb: number): Float32Array {
  const dry = vox(sr, r, dur, {
    f0: f,
    amp: [0, 0, dur * 0.12, 1, dur * 0.7, 0.8, dur, 0],
    vowel: [0, 'a', dur * 0.55, 'o', dur, 'u'],
    scale: 1.25,
    tilt: 1.6,
    breath: 0.45,
    rough: 0.12,
    vib: [5.5, 0.025],
    trem: [r.range(5, 7), 0.25],
    jitter: 0.01,
    maxHz: 7000,
    ...o,
  });
  // a faint octave-down shadow voice for body
  voice(dry, sr, r, 0.005, { dur, f0: f.map((v, i) => (i % 2 ? v * 0.5 : v)), amp: [0, 0, dur * 0.2, 0.3, dur, 0], vowel: [0, 'o', dur, 'u'], scale: 1.1, tilt: 2, breath: 0.6 });
  return reverbMono(dry, sr, { t60: verb, size: 1.6, damp: 0.45, wet: 0.6, predelay: 0.03 });
}

function dragonRoar(sr: number, r: Rand, dur: number, f: readonly number[], verb: number, scream = 0): Float32Array {
  const out = vox(sr, r, dur, {
    f0: f,
    amp: [0, 0, 0.15, 0.9, dur * 0.4, 1, dur * 0.85, 0.7, dur, 0],
    vowel: [0, 'a', dur * 0.4, 'o', dur * 0.8, 'a', dur, 'u'],
    scale: scream ? 0.8 : 0.45,
    tilt: 1.2,
    breath: 0.6,
    rough: 0.9,
    jitter: 0.04,
    shimmer: 0.25,
    drift: 0.05,
    maxHz: 6000,
  });
  // breath / roar noise
  whoosh(out, sr, r, 0.005, dur, { f: [0, 250, 0.5, 700, 1, 300], amp: [0, 0, 0.15, 1, 0.8, 0.8, 1, 0], q: 0.8, gain: 0.5, pink: true });
  asymClip(out, 3, 0.2);
  lowpass(out, sr, scream ? 6000 : 3000);
  return reverbMono(out, sr, { t60: verb, size: 1.8, damp: 0.5, wet: 0.45, predelay: 0.04 });
}

function blazeBreath(sr: number, r: Rand, dur: number, amp: number): Float32Array {
  const n = Math.ceil(dur * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1, 'pink');
  comb(b, sr, r.range(170, 260), 0.82, 0.8);
  sweep(b, sr, 'bp', [0, 900, dur * 0.45, 1600, dur * 0.55, 1200, dur, 2200], 0.9);
  // inhale then rougher exhale
  const split = r.range(0.4, 0.5);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = u < split ? Math.sin((u / split) * Math.PI) * 0.55 : Math.sin(((u - split) / (1 - split)) * Math.PI) * (0.8 + 0.2 * Math.sin(i * 0.004));
    b[i] *= e * amp;
  }
  const out = alloc(sr, dur + 0.1);
  mix(out, b, 0, 1.4);
  crackle(out, sr, r, 0, dur, { rate: 30, amp: 0.25, fLo: 2000, fHi: 7000 });
  clicks(out, sr, r, { t0: 0, t1: dur, rate: 35, fLo: 2000, fHi: 6000, t60Lo: 0.02, t60Hi: 0.08, amp: 0.12, modes: 3 });
  return out;
}

function golemClank(out: Float32Array, sr: number, r: Rand, t0: number, amp: number, lo = 180, hi = 320): void {
  strike(out, sr, t0, ratioModes(r.log(lo, hi), PLATE, 0.7, { tilt: 0.35, decayTilt: 0.45, jitter: 0.03, r }), amp);
  strike(out, sr, t0, randomModes(r, 5, 1500, 6000, 0.08, 0.25, { tilt: 0.3 }), amp * 0.4);
  burst(out, sr, r, t0, 0.004, amp * 0.5, 1000, 10000);
}

// ---------------------------------------------------------------------------------------

export function creatureSounds(): Record<string, SoundSpec> {
  const H = 'hostile' as const;
  const N = 'neutral' as const;
  return {
    // ---------------- zombie ----------------
    'mob.zombie.say': {
      cat: H,
      n: 3,
      level: 0.9,
      pv: 0.06,
      gen: (sr, r) => zombieGroan(sr, r, r.range(0.9, 1.35), r.range(85, 105), r.range(98, 122), r.range(58, 72), r.range(0.6, 0.85)),
    },
    'mob.zombie.hurt': {
      cat: H,
      n: 3,
      level: 0.9,
      pv: 0.06,
      gen: (sr, r) => zombieGroan(sr, r, r.range(0.3, 0.42), r.range(150, 175), r.range(130, 150), r.range(85, 100), 0.5, true),
    },
    'mob.zombie.death': {
      cat: H,
      n: 2,
      level: 0.9,
      gen: (sr, r) => {
        const out = zombieGroan(sr, r, r.range(1.4, 1.8), r.range(115, 130), r.range(105, 120), r.range(48, 58), 0.85);
        whoosh(out, sr, r, out.length / sr - 0.6, 0.55, { f: [0, 900, 1, 400], amp: [0, 0, 0.3, 1, 1, 0], q: 0.8, gain: 0.15 });
        return out;
      },
    },
    'mob.zombie.step': {
      cat: H,
      n: 4,
      level: 0.35,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        bodyThud(out, sr, r, 0.003, 0.8, 0.6);
        whoosh(out, sr, r, 0.01, r.range(0.15, 0.22), { f: [0, 500, 0.5, 1400, 1, 700], amp: [0, 0, 0.2, 1, 1, 0], q: 0.9, gain: 0.5, pink: true });
        grains(out, sr, r, { t0: 0.01, t1: 0.2, rate: 900, fLo: 400, fHi: 3000, q: 1.2, amp: 0.25 });
        return out;
      },
    },
    'mob.drowned.say': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const dur = r.range(0.9, 1.3);
        const out = vox(sr, r, dur, {
          f0: [0, r.range(80, 95), dur * 0.4, r.range(95, 110), dur, r.range(60, 70)],
          amp: [0, 0, 0.1, 0.8, dur * 0.4, 1, dur, 0],
          vowel: pickVowels(r, dur, [['U', 'o', 'a', 'u'], ['uh', 'o', 'u']]),
          scale: 0.84,
          tilt: 1.7,
          breath: 0.35,
          rough: 0.75,
          wobble: 0.28,
          jitter: 0.03,
          shimmer: 0.2,
          maxHz: 4000,
        });
        bubbles(out, sr, r, 0.05, dur, 45, 250, 1200, 0.3, 0.3, 0.6);
        asymClip(out, 1.6, 0.1);
        lowpass(out, sr, 2600);
        return out;
      },
    },

    // ---------------- skeleton ----------------
    'mob.skeleton.say': {
      cat: H,
      n: 3,
      level: 0.75,
      pv: 0.06,
      gen: (sr, r) => {
        const dur = r.range(0.35, 0.6);
        const out = alloc(sr, dur + 0.15);
        boneRattle(out, sr, r, 0.005, dur, r.range(28, 45), 0.8);
        whoosh(out, sr, r, 0.02, dur, { f: [0, 1400, 0.5, 2600, 1, 1800], amp: [0, 0, 0.3, 1, 1, 0], q: 1.2, gain: 0.18 });
        return out;
      },
    },
    'mob.skeleton.hurt': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        strike(out, sr, 0.004, randomModes(r, 6, 600, 3500, 0.02, 0.06, { tilt: 0.25 }), 1);
        burst(out, sr, r, 0.004, 0.004, 0.8, 1500, 10000);
        boneRattle(out, sr, r, 0.02, r.range(0.18, 0.28), 70, 0.6);
        return out;
      },
    },
    'mob.skeleton.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const out = alloc(sr, 1.4);
        boneRattle(out, sr, r, 0.005, 0.35, 60, 0.8);
        debris(out, sr, r, 0.15, 0.9, { amp: 0.35, fLo: 900, fHi: 4000, hard: 1.4, t60: 0.035, density: 0.8 });
        for (let i = 0; i < 4; i++) strike(out, sr, r.range(0.2, 1.0), randomModes(r, 4, 500, 2500, 0.02, 0.05), r.range(0.3, 0.7));
        return out;
      },
    },
    'mob.skeleton.step': {
      cat: H,
      n: 4,
      level: 0.32,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.25);
        strike(out, sr, 0.003, randomModes(r, 5, 800, 3500, 0.015, 0.04), 0.8);
        thump(out, sr, 0.003, 200, 120, 0.05, 0.3);
        if (r.chance(0.6)) strike(out, sr, r.range(0.03, 0.06), randomModes(r, 3, 900, 3000, 0.01, 0.03), 0.35);
        return out;
      },
    },

    // ---------------- creeper ----------------
    'mob.creeper.say': {
      cat: H,
      n: 4,
      level: 0.75,
      pv: 0.08,
      gen: (sr, r) => {
        const dur = r.range(0.14, 0.24);
        const out = alloc(sr, dur + 0.15);
        grains(out, sr, r, { t0: 0.003, t1: dur, rate: (t) => 3000 * Math.sin((t / dur) * Math.PI), fLo: 1500, fHi: 8000, q: 1.6, durLo: 0.001, durHi: 0.006, amp: 0.7, tail: 2 });
        clicks(out, sr, r, { t0: 0.003, t1: dur, rate: 90, fLo: 1500, fHi: 5000, t60Lo: 0.004, t60Hi: 0.012, amp: 0.4, modes: 1 });
        burst(out, sr, r, 0.003, dur * 0.6, 0.15, 150, 1200);
        return out;
      },
    },
    'mob.creeper.hurt': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        grains(out, sr, r, { t0: 0.002, t1: 0.25, rate: (t) => 4500 * Math.exp(-t / 0.08), fLo: 1200, fHi: 9000, q: 1.6, durLo: 0.001, durHi: 0.006, amp: 0.9, tail: 2 });
        clicks(out, sr, r, { t0: 0.002, t1: 0.2, rate: 150, fLo: 1500, fHi: 5000, t60Lo: 0.004, t60Hi: 0.015, amp: 0.5, modes: 1 });
        thump(out, sr, 0.002, 160, 90, 0.08, 0.4);
        return out;
      },
    },
    'mob.creeper.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        grains(out, sr, r, { t0: 0.002, t1: 0.75, rate: (t) => 3500 * Math.exp(-t / 0.3), fLo: 1000, fHi: 8000, q: 1.6, durLo: 0.001, durHi: 0.008, amp: 0.85, tail: 2 });
        clicks(out, sr, r, { t0: 0.002, t1: 0.6, rate: 110, fLo: 1200, fHi: 5000, t60Lo: 0.004, t60Hi: 0.015, amp: 0.45, modes: 1 });
        whoosh(out, sr, r, 0.05, 0.6, { f: [0, 600, 1, 250], amp: [0, 0, 0.2, 1, 1, 0], q: 0.7, gain: 0.3, pink: true });
        return out;
      },
    },

    // ---------------- spider ----------------
    'mob.spider.say': {
      cat: H,
      n: 4,
      level: 0.75,
      pv: 0.07,
      gen: (sr, r) => {
        const dur = r.range(0.3, 0.55);
        const out = alloc(sr, dur + 0.15);
        spiderHiss(out, sr, r, 0.005, dur * 0.7, 0.55, r.range(3500, 5000));
        chitter(out, sr, r, dur * 0.25, dur * 0.7, r.range(22, 38), 0.45);
        voice(out, sr, r, 0.01, { dur: dur * 0.5, f0: [0, 900, 1, 1100], amp: [0, 0, 0.03, 0.2, dur * 0.5, 0], vowel: [0, 'i', 1, 'e'], scale: 1.9, rough: 0.7, breath: 0.6 });
        return out;
      },
    },
    'mob.spider.hurt': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.07,
      gen: (sr, r) => {
        const dur = r.range(0.28, 0.38);
        const out = alloc(sr, dur + 0.15);
        voice(out, sr, r, 0.003, { dur, f0: [0, 1150, dur * 0.3, 1300, dur, 850], amp: [0, 0, 0.01, 1, dur, 0], vowel: [0, 'i', dur, 'e'], scale: 1.9, rough: 0.65, breath: 0.55, tilt: 1.2 });
        spiderHiss(out, sr, r, 0.003, dur, 0.5, 4800);
        return out;
      },
    },
    'mob.spider.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const dur = r.range(0.8, 1.05);
        const out = alloc(sr, dur + 0.2);
        voice(out, sr, r, 0.003, { dur, f0: [0, 1300, dur * 0.2, 1200, dur, 420], amp: [0, 0, 0.02, 1, dur * 0.6, 0.7, dur, 0], vowel: [0, 'i', dur * 0.5, 'e', dur, 'a'], scale: 1.8, rough: [0, 0.5, dur, 0.9], breath: 0.6, tilt: 1.3 });
        spiderHiss(out, sr, r, 0.003, dur, 0.4, 4200);
        chitter(out, sr, r, dur * 0.5, dur * 0.45, 18, 0.35);
        return out;
      },
    },
    'mob.spider.step': {
      cat: H,
      n: 4,
      level: 0.3,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.22);
        const k = 4 + r.int(3);
        for (let i = 0; i < k; i++) {
          const t = 0.003 + r.range(0, 0.13);
          strike(out, sr, t, [{ f: r.log(1800, 4500), t60: 0.01, a: r.range(0.3, 0.8) }, { f: r.log(500, 900), t60: 0.015, a: 0.3 }]);
        }
        grains(out, sr, r, { t0: 0, t1: 0.15, rate: 400, fLo: 2000, fHi: 7000, q: 1.5, amp: 0.15 });
        return out;
      },
    },

    // ---------------- enderman ----------------
    'mob.enderman.idle': {
      cat: H,
      n: 4,
      level: 0.75,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.8, 1.2);
        const a = r.range(130, 180);
        return enderVoice(sr, r, dur, [0, a, dur * 0.3, a * r.range(1.4, 1.8), dur * 0.65, a * r.range(0.7, 0.9), dur, a * r.range(1.0, 1.3)], 0.35, 1, r.chance(0.6));
      },
    },
    'mob.enderman.hurt': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.45, 0.6);
        const v = enderVoice(sr, r, dur, [0, 220, dur * 0.25, 360, dur, 170], 0.6, 1, false);
        whoosh(v, sr, r, 0, dur, { f: [0, 2500, 1, 600], amp: [0, 0, 0.1, 1, 1, 0], q: 1.5, gain: 0.25 });
        softClip(v, 2);
        return v;
      },
    },
    'mob.enderman.death': {
      cat: H,
      n: 2,
      level: 0.9,
      gen: (sr, r) => {
        const dur = r.range(1.4, 1.8);
        const v = enderVoice(sr, r, dur, [0, 300, dur * 0.2, 340, dur * 0.7, 150, dur, 80], 0.7, 1, true);
        softClip(v, 1.8);
        return v;
      },
    },
    'mob.enderman.portal': {
      cat: H,
      n: 4,
      level: 0.8,
      pv: 0.06,
      gen: (sr, r) => {
        const dur = r.range(0.35, 0.5);
        const out = alloc(sr, dur + 0.25);
        const n = Math.ceil(dur * sr);
        const up = r.chance(0.5);
        const fA = up ? r.range(140, 220) : r.range(900, 1300);
        const fB = up ? r.range(700, 1100) : r.range(120, 180);
        let ph = 0;
        let ph2 = 0;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const k = u < 0.12 ? u / 0.12 : 1;
          const f = fA * Math.pow(fB / fA, Math.pow(u, up ? 1.6 : 0.5));
          ph += (6.283185307 * f) / sr;
          ph2 += (6.283185307 * f * 1.503) / sr;
          const e = Math.sin(Math.PI * Math.pow(u, 0.6)) * k;
          out[i] += (Math.sin(ph + 1.5 * Math.sin(ph2)) * 0.7 + Math.sin(ph * 0.5) * 0.3) * e;
        }
        whoosh(out, sr, r, 0, dur, { f: up ? [0, 400, 1, 5000] : [0, 5000, 1, 300], amp: [0, 0, 0.3, 1, 1, 0], q: 3, gain: 0.5 });
        const wet = echo(out, sr, 0.045, 0.45, 0.4, 5000, 0.2);
        return wet;
      },
    },
    'mob.enderman.scream': {
      cat: H,
      n: 3,
      level: 0.95,
      gen: (sr, r) => {
        const dur = r.range(1.1, 1.5);
        const out = alloc(sr, dur + 0.3);
        for (let k = 0; k < 3; k++) {
          const f = r.range(320, 480) * (1 + k * 0.07);
          voice(out, sr, r, 0.005 + k * 0.01, {
            dur,
            f0: [0, f * 0.8, dur * 0.15, f * 1.2, dur * 0.7, f, dur, f * 0.7],
            amp: [0, 0, 0.06, 1, dur * 0.8, 0.8, dur, 0],
            vowel: [0, 'a', dur * 0.5, 'ae', dur, 'a'],
            scale: 1.15,
            tilt: 1.1,
            breath: 0.5,
            rough: 0.85,
            trem: [r.range(10, 14), 0.5],
            jitter: 0.03,
            gain: 0.6,
          });
        }
        ringMod(out, sr, r.range(45, 70), 0.4);
        asymClip(out, 3, 0.15);
        return echo(out, sr, 0.09, 0.3, 0.25, 4000, 0.4);
      },
    },

    // ---------------- cow ----------------
    'mob.cow.say': { cat: N, n: 4, level: 0.9, pv: 0.05, gen: (sr, r) => moo(sr, r, r.range(1.0, 1.45), r.range(108, 135), false) },
    'mob.cow.hurt': { cat: N, n: 3, level: 0.9, pv: 0.05, gen: (sr, r) => moo(sr, r, r.range(0.35, 0.48), r.range(120, 140), true) },
    'mob.cow.step': {
      cat: N,
      n: 4,
      level: 0.35,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.3);
        thump(out, sr, 0.003, 150, 75, 0.09, 0.8);
        burst(out, sr, r, 0.003, 0.006, 0.25, 600, 4000);
        grains(out, sr, r, { t0: 0.003, t1: 0.15, rate: (t) => 2000 * Math.exp(-t / 0.04), fLo: 2500, fHi: 8000, q: 1.3, amp: 0.25 });
        grains(out, sr, r, { t0: 0.003, t1: 0.1, rate: 500, fLo: 300, fHi: 1800, q: 1.1, amp: 0.25 });
        return out;
      },
    },

    // ---------------- pig ----------------
    'mob.pig.say': {
      cat: N,
      n: 4,
      level: 0.8,
      pv: 0.06,
      gen: (sr, r) => {
        const k = 1 + r.int(3);
        const out = alloc(sr, 0.75);
        let t = 0.005;
        const f = r.range(170, 230);
        for (let i = 0; i < k; i++) {
          const d = r.range(0.11, 0.17);
          oink(out, sr, r, t, d, f * r.range(0.9, 1.1), r.range(0.45, 0.7));
          t += d + r.range(0.06, 0.12);
        }
        return out;
      },
    },
    'mob.pig.hurt': {
      cat: N,
      n: 3,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const dur = r.range(0.33, 0.45);
        return vox(sr, r, dur, { f0: [0, 620, dur * 0.25, 900, dur, 700], amp: [0, 0, 0.012, 1, dur * 0.7, 0.75, dur, 0], vowel: [0, 'i', dur * 0.6, 'e', dur, 'i'], scale: 1.35, tilt: 1.25, breath: 0.25, rough: 0.35, nasal: 0.3, jitter: 0.02 });
      },
    },
    'mob.pig.death': {
      cat: N,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const dur = r.range(0.6, 0.8);
        return vox(sr, r, dur, { f0: [0, 850, dur * 0.2, 950, dur, 420], amp: [0, 0, 0.01, 1, dur * 0.6, 0.7, dur, 0], vowel: [0, 'i', dur * 0.5, 'e', dur, 'uh'], scale: 1.35, tilt: 1.3, breath: 0.35, rough: [0, 0.3, dur, 0.7], nasal: 0.3, jitter: 0.025 });
      },
    },

    // ---------------- sheep ----------------
    'mob.sheep.say': {
      cat: N,
      n: 4,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const dur = r.range(0.65, 0.95);
        const f = r.range(260, 320);
        const out = vox(sr, r, dur, {
          f0: [0, f * 0.92, dur * 0.12, f * 1.1, dur * 0.7, f, dur, f * 0.85],
          amp: [0, 0, 0.03, 0.8, dur * 0.2, 1, dur * 0.8, 0.8, dur, 0],
          vowel: [0, 'm', dur * 0.07, 'e', dur * 0.5, 'ae', dur, 'e'],
          nasal: [0, 0.85, dur * 0.08, 0.15, dur, 0.15],
          scale: 1.25,
          tilt: 1.15,
          breath: 0.28,
          rough: 0.18,
          vib: [r.range(6.5, 8.5), 0.045],
          trem: [r.range(6.5, 8.5), 0.55],
          jitter: 0.012,
        });
        return out;
      },
    },
    'mob.sheep.shear': {
      cat: N,
      n: 3,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        for (let i = 0; i < 2; i++) {
          const t = 0.004 + i * r.range(0.1, 0.14);
          whoosh(out, sr, r, t, 0.035, { f: [0, 3000, 1, 6500], amp: [0, 0, 0.5, 1, 1, 0], q: 2, gain: 0.35 });
          burst(out, sr, r, t + 0.03, 0.008, 0.6, 3000, 11000);
          strike(out, sr, t + 0.03, randomModes(r, 4, 2500, 7000, 0.03, 0.07, { tilt: 0.2 }), 0.4);
        }
        grains(out, sr, r, { t0: 0.02, t1: 0.35, rate: 600, fLo: 300, fHi: 2000, q: 0.8, durLo: 0.005, durHi: 0.02, amp: 0.25 });
        return out;
      },
    },

    // ---------------- chicken ----------------
    'mob.chicken.say': {
      cat: N,
      n: 4,
      level: 0.65,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        const k = 2 + r.int(3);
        let t = 0.005;
        const f = r.range(480, 620);
        for (let i = 0; i < k; i++) {
          const long = i === k - 1 && r.chance(0.45);
          const d = long ? r.range(0.18, 0.26) : r.range(0.055, 0.085);
          cluck(out, sr, r, t, d, f * r.range(0.92, 1.1), long);
          t += d + r.range(0.04, 0.09);
        }
        return out;
      },
    },
    'mob.chicken.hurt': {
      cat: N,
      n: 3,
      level: 0.75,
      pv: 0.07,
      gen: (sr, r) => {
        const dur = r.range(0.2, 0.28);
        return vox(sr, r, dur, { f0: [0, 850, dur * 0.3, 1300, dur, 800], amp: [0, 0, 0.005, 1, dur * 0.6, 0.8, dur, 0], vowel: [0, 'a', dur, 'ae'], scale: 1.8, tilt: 1.1, breath: 0.4, rough: 0.6, jitter: 0.03, maxHz: 8000 });
      },
    },
    'mob.chicken.plop': {
      cat: N,
      n: 3,
      level: 0.6,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.2);
        let ph = 0;
        const n = Math.round(0.07 * sr);
        const f0 = r.range(160, 220);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const f = f0 + (f0 * 2.2 - f0) * (1 - Math.exp(-t / 0.012));
          ph += (6.283185307 * f) / sr;
          out[i + 10] += Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.018);
        }
        thump(out, sr, 0.002, 140, 90, 0.05, 0.4);
        return out;
      },
    },

    // ---------------- villager ----------------
    'mob.villager.idle': {
      cat: N,
      n: 4,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r, v) => {
        const out = alloc(sr, 1.0);
        const b = r.range(105, 125);
        const type = v % 4;
        if (type === 0) hum(out, sr, r, 0.005, 0.55, [0, b, 0.2, b * 1.32, 0.55, b * 0.95]);
        else if (type === 1) hum(out, sr, r, 0.005, 0.5, [0, b * 0.95, 0.35, b * 1.45, 0.5, b * 1.5]);
        else if (type === 2) hum(out, sr, r, 0.005, 0.6, [0, b * 1.35, 0.25, b * 1.25, 0.6, b * 0.88]);
        else {
          hum(out, sr, r, 0.005, 0.24, [0, b, 0.12, b * 1.25, 0.24, b * 1.1]);
          hum(out, sr, r, 0.3, 0.32, [0, b * 1.15, 0.12, b * 1.3, 0.32, b * 0.92]);
        }
        return villagerEq(out, sr);
      },
    },
    'mob.villager.yes': {
      cat: N,
      n: 3,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        const b = r.range(110, 125);
        hum(out, sr, r, 0.005, 0.17, [0, b * 1.05, 0.17, b * 1.3]);
        hum(out, sr, r, 0.24, 0.24, [0, b * 1.25, 0.08, b * 1.5, 0.24, b * 1.35]);
        return villagerEq(out, sr);
      },
    },
    'mob.villager.no': {
      cat: N,
      n: 3,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        const b = r.range(110, 125);
        hum(out, sr, r, 0.005, 0.2, [0, b * 1.4, 0.2, b * 1.2]);
        hum(out, sr, r, 0.27, 0.26, [0, b * 1.15, 0.26, b * 0.85]);
        return villagerEq(out, sr);
      },
    },
    'mob.villager.trade': {
      cat: N,
      n: 3,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        const b = r.range(105, 120);
        hum(out, sr, r, 0.005, r.range(0.32, 0.42), [0, b, 0.2, b * 1.12, 0.4, b * 1.45]);
        return villagerEq(out, sr);
      },
    },
    'mob.villager.hurt': {
      cat: N,
      n: 3,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        const b = r.range(160, 190);
        hum(out, sr, r, 0.005, r.range(0.22, 0.3), [0, b, 0.08, b * 1.12, 0.3, b * 0.75], { rough: [0, 0.5, 0.3, 0.3], breath: [0, 0.6, 0.05, 0.3, 0.3, 0.3], amp: [0, 0, 0.008, 1, 0.2, 0.7, 0.3, 0] });
        return villagerEq(out, sr);
      },
    },
    'mob.villager.death': {
      cat: N,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const out = alloc(sr, 1.2);
        const b = r.range(130, 150);
        hum(out, sr, r, 0.005, r.range(0.85, 1.0), [0, b, 0.15, b * 1.1, 1.0, b * 0.58], { rough: [0, 0.2, 1, 0.7], breath: [0, 0.3, 0.6, 0.2, 1, 0.6] });
        return villagerEq(out, sr);
      },
    },

    // ---------------- wolf ----------------
    'mob.wolf.bark': {
      cat: N,
      n: 4,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 0.7);
        const f = r.range(380, 480);
        bark(out, sr, r, 0.005, r.range(0.14, 0.19), f);
        if (r.chance(0.5)) bark(out, sr, r, r.range(0.22, 0.3), r.range(0.13, 0.17), f * r.range(0.95, 1.08));
        asymClip(out, 1.8, 0.1);
        return out;
      },
    },
    'mob.wolf.growl': {
      cat: N,
      n: 3,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r) => {
        const dur = r.range(0.9, 1.3);
        const f = r.range(78, 95);
        const out = vox(sr, r, dur, {
          f0: [0, f, dur * 0.5, f * 1.08, dur, f * 0.95],
          amp: [0, 0, 0.12, 1, dur * 0.8, 0.9, dur, 0],
          vowel: [0, 'u', dur * 0.5, 'o', dur, 'u'],
          scale: 1.0,
          tilt: 1.3,
          breath: 0.3,
          rough: 0.92,
          nasal: 0.35,
          trem: [r.range(14, 22), 0.4],
          jitter: 0.04,
          shimmer: 0.25,
          drift: 0.05,
          maxHz: 4000,
        });
        asymClip(out, 2.2, 0.2);
        lowpass(out, sr, 3000);
        return out;
      },
    },
    'mob.wolf.hurt': {
      cat: N,
      n: 3,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.18, 0.25);
        return vox(sr, r, dur, { f0: [0, 900, dur * 0.25, 1120, dur, 640], amp: [0, 0, 0.006, 1, dur * 0.5, 0.8, dur, 0], vowel: [0, 'i', dur, 'e'], scale: 1.25, tilt: 1.2, breath: 0.3, rough: 0.2, jitter: 0.015 });
      },
    },
    'mob.wolf.whine': {
      cat: N,
      n: 3,
      level: 0.6,
      pv: 0.04,
      gen: (sr, r) => {
        const dur = r.range(0.7, 1.0);
        const f = r.range(720, 900);
        return vox(sr, r, dur, {
          f0: [0, f, dur * 0.3, f * 1.22, dur * 0.6, f * 1.05, dur, f * 1.18],
          amp: [0, 0, 0.08, 1, dur * 0.8, 0.7, dur, 0],
          vowel: [0, 'i', dur, 'i'],
          scale: 1.3,
          tilt: 2.3,
          breath: 0.35,
          nasal: 0.6,
          vib: [5, 0.03],
          jitter: 0.008,
        });
      },
    },

    // ---------------- slimes ----------------
    'mob.slime.small': {
      cat: H,
      n: 4,
      level: 0.6,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        squelch(out, sr, r, 0.003, r.range(0.4, 0.6), 1);
        return out;
      },
    },
    'mob.slime.big': {
      cat: H,
      n: 4,
      level: 0.8,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        squelch(out, sr, r, 0.003, r.range(1.4, 1.9), 1);
        squelch(out, sr, r, r.range(0.06, 0.1), 0.8, 0.4);
        thump(out, sr, 0.003, 110, 60, 0.15, 0.5);
        return out;
      },
    },
    'mob.slime.attack': {
      cat: H,
      n: 3,
      level: 0.7,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        burst(out, sr, r, 0.003, 0.02, 0.5, 200, 3000);
        squelch(out, sr, r, 0.005, r.range(0.8, 1.0), 0.9);
        return out;
      },
    },
    'mob.magmacube.jump': {
      cat: H,
      n: 3,
      level: 0.75,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.9);
        squelch(out, sr, r, 0.003, r.range(1.2, 1.5), 1);
        thump(out, sr, 0.003, 120, 55, 0.18, 0.6);
        sizzle(out, sr, r, 0.03, r.range(0.35, 0.5), 0.5, 0.9);
        return out;
      },
    },

    // ---------------- ghast ----------------
    'mob.ghast.moan': {
      cat: H,
      n: 4,
      level: 0.7,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(1.5, 2.3);
        const a = r.range(430, 520);
        return ghastCry(sr, r, dur, [0, a, dur * 0.3, a * r.range(1.12, 1.25), dur * 0.75, a * 0.92, dur, a * r.range(0.7, 0.78)], {}, 2.4);
      },
    },
    'mob.ghast.scream': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.7, 0.95);
        return ghastCry(sr, r, dur, [0, 780, dur * 0.15, 1150, dur, 680], { rough: 0.5, breath: 0.55, vowel: [0, 'a', dur * 0.6, 'ae', dur, 'e'], scale: 1.4, amp: [0, 0, 0.02, 1, dur * 0.6, 0.8, dur, 0] }, 2);
      },
    },
    'mob.ghast.charge': {
      cat: H,
      n: 2,
      level: 0.8,
      gen: (sr, r) => {
        const dur = r.range(0.6, 0.8);
        return ghastCry(sr, r, dur, [0, 430, dur * 0.7, 900, dur, 960], { vowel: [0, 'u', dur * 0.6, 'a', dur, 'a'], breath: 0.4, rough: 0.25 }, 1.8);
      },
    },
    'mob.ghast.fireball': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.1);
        whoosh(out, sr, r, 0.003, 0.7, { f: [0, 300, 0.25, 1500, 1, 500], amp: [0, 0, 0.12, 1, 0.5, 0.6, 1, 0], q: 0.8, gain: 1, pink: true });
        crackle(out, sr, r, 0.01, 0.6, { rate: 60, amp: 0.4 });
        thump(out, sr, 0.003, 120, 50, 0.25, 0.6);
        burst(out, sr, r, 0.003, 0.05, 0.4, 200, 6000);
        return out;
      },
    },
    'mob.ghast.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const dur = r.range(2.0, 2.4);
        return ghastCry(sr, r, dur, [0, 700, dur * 0.2, 760, dur * 0.7, 380, dur, 240], { rough: [0, 0.2, dur, 0.6], trem: [6, 0.35] }, 2.8);
      },
    },

    // ---------------- blaze ----------------
    'mob.blaze.breathe': { cat: H, n: 3, level: 0.6, pv: 0.06, gen: (sr, r) => blazeBreath(sr, r, r.range(1.0, 1.4), 1) },
    'mob.blaze.hit': {
      cat: H,
      n: 3,
      level: 0.8,
      pv: 0.06,
      gen: (sr, r) => {
        const out = blazeBreath(sr, r, r.range(0.3, 0.4), 1.3);
        strike(out, sr, 0.003, randomModes(r, 6, 900, 5000, 0.08, 0.3, { tilt: 0.3 }), 0.7);
        burst(out, sr, r, 0.003, 0.005, 0.6, 1500, 10000);
        return out;
      },
    },
    'mob.blaze.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const b = blazeBreath(sr, r, 1.2, 1);
        applyDecay(b, sr, 1.2, 0.1);
        const out = alloc(sr, 1.5);
        mix(out, b, 0, 1);
        for (let i = 0; i < 6; i++) strike(out, sr, r.range(0.1, 0.9), randomModes(r, 4, 1200, 5000, 0.06, 0.2, { tilt: 0.2 }), r.range(0.2, 0.5));
        sizzle(out, sr, r, 0.3, 1.0, 0.4, 1);
        return out;
      },
    },
    'mob.blaze.shoot': {
      cat: H,
      n: 3,
      level: 0.8,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        whoosh(out, sr, r, 0.003, 0.35, { f: [0, 400, 0.3, 2200, 1, 800], amp: [0, 0, 0.1, 1, 1, 0], q: 0.9, gain: 1, pink: true });
        crackle(out, sr, r, 0.01, 0.3, { rate: 80, amp: 0.4 });
        thump(out, sr, 0.003, 150, 70, 0.12, 0.4);
        return out;
      },
    },

    // ---------------- zombified piglin ----------------
    'mob.zombiepig.say': {
      cat: H,
      n: 4,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.9);
        const f = r.range(110, 140);
        oink(out, sr, r, 0.005, r.range(0.18, 0.25), f, 0.85);
        oink(out, sr, r, r.range(0.3, 0.4), r.range(0.22, 0.32), f * r.range(0.85, 1.0), 0.9);
        asymClip(out, 1.8, 0.15);
        lowpass(out, sr, 4000);
        return out;
      },
    },
    'mob.zombiepig.angry': {
      cat: H,
      n: 3,
      level: 0.9,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.7, 0.9);
        const out = vox(sr, r, dur, { f0: [0, 200, dur * 0.35, 420, dur, 240], amp: [0, 0, 0.02, 1, dur * 0.7, 0.8, dur, 0], vowel: [0, 'ng', dur * 0.3, 'a', dur * 0.7, 'ae', dur, 'U'], scale: 1.05, tilt: 1.2, breath: 0.5, rough: 0.85, nasal: 0.35, jitter: 0.03, shimmer: 0.2 });
        whoosh(out, sr, r, 0, dur * 0.5, { f: [0, 800, 1, 1500], amp: [0, 0, 0.1, 1, 1, 0], q: 2, gain: 0.3 });
        asymClip(out, 2.5, 0.2);
        return out;
      },
    },
    'mob.zombiepig.hurt': {
      cat: H,
      n: 3,
      level: 0.9,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.3, 0.4);
        const out = vox(sr, r, dur, { f0: [0, 300, dur * 0.3, 380, dur, 200], amp: [0, 0, 0.008, 1, dur, 0], vowel: [0, 'ng', dur * 0.3, 'e', dur, 'U'], scale: 1.1, rough: 0.7, breath: 0.4, nasal: 0.4 });
        asymClip(out, 2, 0.15);
        return out;
      },
    },
    'mob.zombiepig.death': {
      cat: H,
      n: 2,
      level: 0.9,
      gen: (sr, r) => {
        const dur = r.range(0.9, 1.1);
        const out = vox(sr, r, dur, { f0: [0, 320, dur * 0.2, 340, dur, 110], amp: [0, 0, 0.01, 1, dur * 0.6, 0.8, dur, 0], vowel: [0, 'e', dur * 0.4, 'a', dur, 'U'], scale: 1.05, rough: [0, 0.5, dur, 0.9], breath: 0.45, nasal: 0.35 });
        asymClip(out, 2, 0.15);
        return out;
      },
    },

    // ---------------- iron golem ----------------
    'mob.irongolem.walk': {
      cat: N,
      n: 4,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        thump(out, sr, 0.003, 110, 45, 0.25, 1);
        burst(out, sr, r, 0.003, 0.02, 0.3, 100, 1500);
        creak(out, sr, r, 0.02, r.range(0.2, 0.3), { rate: [0, 60, 1, 30], amp: [0, 1, 1, 0.3], modes: randomModes(r, 6, 250, 1800, 0.04, 0.12, { tilt: 0.2 }), gain: 0.8 });
        golemClank(out, sr, r, 0.008, 0.25, 220, 380);
        return out;
      },
    },
    'mob.irongolem.hit': {
      cat: N,
      n: 3,
      level: 0.85,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        golemClank(out, sr, r, 0.003, 1);
        thump(out, sr, 0.003, 120, 60, 0.15, 0.5);
        return out;
      },
    },
    'mob.irongolem.death': {
      cat: N,
      n: 2,
      level: 0.9,
      gen: (sr, r) => {
        const out = alloc(sr, 2.0);
        golemClank(out, sr, r, 0.003, 1, 150, 260);
        golemClank(out, sr, r, r.range(0.15, 0.25), 0.7);
        golemClank(out, sr, r, r.range(0.4, 0.55), 0.8, 130, 200);
        boom(out, sr, r, r.range(0.4, 0.55), 55, 0.6, 0.8);
        debris(out, sr, r, 0.45, 0.9, { amp: 0.25, fLo: 1500, fHi: 7000, hard: 1, t60: 0.1, density: 0.6 });
        return out;
      },
    },

    // ---------------- ender dragon ----------------
    'mob.enderdragon.growl': {
      cat: H,
      n: 3,
      level: 0.95,
      pv: 0.04,
      gen: (sr, r) => {
        const dur = r.range(2.4, 3.2);
        return dragonRoar(sr, r, dur, [0, 52, dur * 0.4, 70, dur, 44], 2.5);
      },
    },
    'mob.enderdragon.wings': {
      cat: H,
      n: 3,
      level: 0.85,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.1);
        whoosh(out, sr, r, 0.003, r.range(0.6, 0.85), { f: [0, 140, 0.35, 420, 1, 110], amp: [0, 0, 0.3, 1, 0.5, 0.5, 1, 0], q: 0.7, gain: 1.3, pink: true });
        thump(out, sr, 0.15, 70, 40, 0.3, 0.4, 0.05);
        grains(out, sr, r, { t0: 0.1, t1: 0.6, rate: 300, fLo: 200, fHi: 1200, q: 0.8, durLo: 0.01, durHi: 0.04, amp: 0.2 });
        burst(out, sr, r, 0.2, 0.03, 0.25, 150, 1500);
        return reverbMono(out, sr, { t60: 1.5, size: 1.4, damp: 0.6, wet: 0.25 });
      },
    },
    'mob.enderdragon.hit': {
      cat: H,
      n: 3,
      level: 0.95,
      pv: 0.04,
      gen: (sr, r) => {
        const dur = r.range(0.9, 1.2);
        return dragonRoar(sr, r, dur, [0, 200, dur * 0.3, 380, dur, 170], 1.8, 1);
      },
    },
    'mob.enderdragon.end': {
      cat: H,
      n: 2,
      level: 1,
      gen: (sr, r) => {
        const out = alloc(sr, 5.6);
        voice(out, sr, r, 0.005, {
          dur: 5.2,
          f0: [0, 60, 1.4, 85, 2.8, 420, 4.0, 380, 5.2, 260],
          amp: [0, 0, 0.3, 0.9, 2.6, 1, 4.6, 0.8, 5.2, 0],
          vowel: [0, 'o', 1.5, 'a', 3, 'ae', 4.5, 'a', 5.2, 'u'],
          scale: 0.6,
          tilt: 1.2,
          breath: 0.6,
          rough: [0, 0.9, 2.8, 0.7, 5.2, 0.8],
          jitter: 0.035,
          shimmer: 0.2,
          drift: 0.04,
          maxHz: 6500,
        });
        whoosh(out, sr, r, 0.005, 5.2, { f: [0, 200, 0.5, 1200, 1, 600], amp: [0, 0, 0.2, 0.8, 0.8, 1, 1, 0], q: 0.7, gain: 0.5, pink: true });
        asymClip(out, 2.6, 0.2);
        lowpass(out, sr, 6500);
        return reverbMono(out, sr, { t60: 3.2, size: 2, damp: 0.5, wet: 0.5, predelay: 0.05 });
      },
    },

    // ---------------- witch ----------------
    'mob.witch.idle': {
      cat: H,
      n: 4,
      level: 0.75,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 1.1);
        const k = 3 + r.int(4);
        let t = 0.005;
        let f = r.range(380, 440);
        for (let i = 0; i < k; i++) {
          const d = r.range(0.075, 0.11);
          voice(out, sr, r, t, {
            dur: d,
            f0: [0, f * 1.05, d, f * 0.92],
            amp: [0, 0, 0.012, 1, d * 0.7, 0.6, d, 0],
            vowel: [0, 'e', d, 'i'],
            scale: 1.3,
            tilt: 1.3,
            breath: [0, 1, 0.02, 0.35, d, 0.4],
            rough: 0.15,
            nasal: 0.3,
            jitter: 0.015,
          });
          t += d + r.range(0.025, 0.05);
          f *= r.range(0.9, 0.97);
        }
        return out;
      },
    },
    'mob.witch.hurt': {
      cat: H,
      n: 3,
      level: 0.8,
      pv: 0.05,
      gen: (sr, r) => {
        const dur = r.range(0.22, 0.3);
        return vox(sr, r, dur, { f0: [0, 380, dur * 0.3, 430, dur, 290], amp: [0, 0, 0.008, 1, dur, 0], vowel: [0, 'a', dur, 'uh'], scale: 1.25, breath: 0.35, rough: 0.25, nasal: 0.2 });
      },
    },
    'mob.witch.death': {
      cat: H,
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const dur = r.range(0.85, 1.05);
        return vox(sr, r, dur, { f0: [0, 420, dur * 0.2, 450, dur, 190], amp: [0, 0, 0.02, 1, dur * 0.6, 0.7, dur, 0], vowel: [0, 'a', dur * 0.6, 'o', dur, 'u'], scale: 1.25, breath: [0, 0.3, dur, 0.7], rough: [0, 0.2, dur, 0.6], nasal: 0.2, vib: [6, 0.03] });
      },
    },
    'mob.witch.drink': {
      cat: H,
      n: 3,
      level: 0.6,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        for (let i = 0; i < 3; i++) {
          const t = 0.005 + i * r.range(0.16, 0.2);
          bubble(out, sr, t, r.range(170, 240), 0.8, 0.08, 1);
          thump(out, sr, t, 130, 80, 0.07, 0.4);
        }
        voice(out, sr, r, 0.62, { dur: 0.25, f0: [0, 360, 0.25, 300], amp: [0, 0, 0.04, 0.5, 0.25, 0], vowel: [0, 'a', 0.25, 'a'], scale: 1.25, breath: 0.8 });
        return out;
      },
    },

    // ---------------- aquatic ----------------
    'mob.squid.say': {
      cat: N,
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.7);
        slosh(out, sr, r, 0.005, r.range(0.3, 0.45), 0.6);
        squelch(out, sr, r, 0.05, 0.5, 0.35);
        lowpass(out, sr, 2500);
        return out;
      },
    },
    'mob.fish.flop': {
      cat: N,
      n: 4,
      level: 0.55,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        const k = 1 + r.int(2);
        for (let i = 0; i < k; i++) {
          const t = 0.003 + i * r.range(0.13, 0.18);
          burst(out, sr, r, t, 0.02, 0.7, 250, 3500);
          thump(out, sr, t, 220, 140, 0.04, 0.4);
          squelch(out, sr, r, t, 0.3, 0.35);
        }
        return out;
      },
    },
  };
}

