// Every baked sound in Last Ferry: a recipe per name, rendered on demand into
// sample buffers (see AudioSystem.bake). Nothing is loaded from files.
//
// Each recipe gets a K (sample rate + a seeded RNG for its variant) and
// returns a mono or stereo buffer; the baker peak-normalises it to 0.95 and
// the def's `gain` sets the mix level. Several variants per sound keep
// repeated events from sounding mechanical (plus a little random pitch).
import { curve, sweep, type Buf, type Vowel } from './dsp';
import type { K } from './kit';

export type Bus = 'sfx' | 'ui' | 'music' | 'amb';

export interface SoundDef {
  /** Baked variants (a random one plays unless PlayOpts.variant is set). */
  variants?: number;
  /** Mix level after normalisation. */
  gain?: number;
  bus?: Bus;
  /** Max simultaneous voices of this sound. */
  limit?: number;
  /** Shared voice group with its own limit (GROUP_LIMITS). */
  group?: string;
  /** Higher survives voice stealing (1..6). */
  priority?: number;
  /** Reverb send 0..1. */
  verb?: number;
  /** ± random playback-rate spread (default 0.04). */
  spread?: number;
  /** Bake at this fraction of the context sample rate (dark sounds: 0.5 halves the cost). */
  rate?: number;
  render(k: K): Buf | [Buf, Buf];
}

export const GROUP_LIMITS: Record<string, number> = {
  voice: 5,
  hit: 7,
  gore: 6,
  shot: 6,
  debris: 6,
  crackle: 8,
  amb: 6,
  ui: 4,
};

// ------------------------------------------------------------- helpers

const VOWEL_PATHS: Vowel[][] = [
  ['uh', 'a', 'uh'],
  ['o', 'a', 'o'],
  ['u', 'o', 'uh'],
  ['er', 'a', 'u'],
  ['uh', 'ae', 'uh'],
  ['ou', 'a', 'er'],
  ['o', 'uh', 'u'],
];

/** Shambler-style moan: rise-and-fall pitch, vowel glide, creak and wetness. */
function moan(k: K, o: { f0: number; d: number; tract: number; fry: number; gurgle: number; breath: number; path?: Vowel[] }): Buf {
  const { d, f0 } = o;
  const path = o.path ?? k.rng.pick(VOWEL_PATHS);
  const peakT = k.r(0.25, 0.5) * d;
  const pitch = curve([
    [0, f0 * k.r(0.82, 0.95)],
    [peakT, f0 * k.r(1.08, 1.22)],
    [d * 0.78, f0 * k.r(0.95, 1.02)],
    [d, f0 * k.r(0.7, 0.82)],
  ]);
  const amp = curve([
    [0, 0],
    [Math.min(0.18, d * 0.15), 0.75],
    [peakT, 1],
    [d * 0.82, 0.6],
    [d, 0],
  ]);
  const x = k.groan(d, {
    f0: pitch,
    amp,
    vowels: [
      [0, path[0]],
      [peakT, path[1]],
      [d, path[2]],
    ],
    tract: o.tract,
    fry: o.fry,
    gurgle: o.gurgle,
    breath: o.breath,
  });
  // Chest rumble under the voice.
  const chest = k.brown(d);
  k.lp(chest, 160);
  k.mul(chest, k.env(d, [[0, 0], [peakT, 1], [d, 0]]));
  k.add(x, chest, 0.25);
  k.lp(x, 3800);
  k.warm(x, 1.8, 0.15);
  return k.fade(x, 4, 40);
}

/** Splatter of small wet drips over a time span. */
function drips(k: K, x: Buf, from: number, to: number, count: number, g: number): void {
  for (let i = 0; i < count; i++) {
    const t = from + (to - from) * Math.pow(k.rng.next(), 1.4);
    const a = g * (1 - ((t - from) / (to - from)) * 0.7) * k.r(0.4, 1);
    if (k.rng.chance(0.5)) k.add(x, k.bubble(k.r(250, 750), k.r(0.03, 0.07)), a * 0.6, t);
    else k.add(x, k.squelch(0.08, k.r(1500, 2600), k.r(500, 900), k.r(0.008, 0.02), 3), a, t);
  }
}

/** Rapid bone crackles. */
function crackles(k: K, x: Buf, at: number, span: number, count: number, g: number): void {
  for (let i = 0; i < count; i++) {
    const t = at + k.rng.next() * span;
    k.add(x, k.click(k.r(1200, 4500), k.r(1.5, 5), k.r(0.002, 0.005), 0.03), g * k.r(0.4, 1), t);
  }
}

/** Fire crackles (pops and ticks). */
function fizz(k: K, x: Buf, from: number, to: number, rate: number, g: number): void {
  let t = from;
  while (true) {
    t += -Math.log(1 - k.rng.next() * 0.999) / rate;
    if (t >= to) break;
    const fade = 1 - (t - from) / (to - from);
    k.add(x, k.click(k.r(1500, 6000), k.r(1, 3), k.r(0.001, 0.004), 0.02), g * fade * k.r(0.3, 1), t);
  }
}

/** One gull syllable ("kyow"). */
function gullCall(k: K, d: number, fHi: number, fLo: number): Buf {
  const f = sweep(fHi, fLo, d * 0.85);
  const a = k.tone(d, f, 'saw');
  const b = k.tone(d, (t) => f(t) * 2, 'square');
  k.add(a, b, 0.3);
  const x = Float32Array.from(a);
  k.bp(a, 2300, 1.4);
  k.bp(x, 4200, 2.2);
  k.add(a, x, 0.5);
  return k.mul(a, k.env(d, [[0, 0], [0.012, 1], [d * 0.45, 0.85], [d, 0]]));
}

/** Ship's bell strike (partials of a bronze bell). */
function bellStrike(k: K, d: number, f: number, decay = 1.6): Buf {
  const m = k.modal(d, [
    [f * 0.5, decay * 1.4, 0.35],
    [f, decay, 1],
    [f * 1.183, decay * 0.75, 0.45],
    [f * 1.506, decay * 0.6, 0.3],
    [f * 2.0, decay * 0.5, 0.42],
    [f * 2.514, decay * 0.36, 0.22],
    [f * 2.662, decay * 0.3, 0.18],
    [f * 3.011, decay * 0.25, 0.14],
    [f * 4.166, decay * 0.18, 0.08],
  ]);
  k.add(m, k.click(f * 4, 1.5, 0.002, 0.03), 0.5);
  return m;
}

/** A soft, rounded tone (music): sine + a little triangle, with vibrato. */
function softNote(k: K, d: number, f: number, attack: number, release: number, vib = 0.004): Buf {
  const fv = (t: number) => f * (1 + vib * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.4));
  const a = k.tone(d, fv);
  k.add(a, k.tone(d, fv, 'tri'), 0.35);
  k.add(a, k.tone(d, (t) => fv(t) * 2), 0.12);
  return k.mul(a, k.env(d, [[0, 0], [attack, 1], [d - release, 0.8], [d, 0]]));
}

/** Detuned saw stack through a lowpass (pads, brass). */
function sawStack(k: K, d: number, f: number, detune: number, cutoff: Parameters<K['lp']>[1], q = 0.9): Buf {
  const x = k.tone(d, f * (1 - detune), 'saw', k.rng.next());
  k.add(x, k.tone(d, f, 'saw', k.rng.next()), 1);
  k.add(x, k.tone(d, f * (1 + detune), 'saw', k.rng.next()), 1);
  return k.lp(x, cutoff, q);
}

const NOTE = (semisFromA4: number) => 440 * Math.pow(2, semisFromA4 / 12);

// ------------------------------------------------------------- recipes

export const SOUNDS: Record<string, SoundDef> = {
  // ======================================================== weapons
  revolver_fire: {
    variants: 4,
    gain: 0.82,
    priority: 4,
    group: 'shot',
    verb: 0.25,
    render(k) {
      const x = k.gunshot({
        d: 1.1,
        crack: 1.4,
        blastDecay: k.r(0.022, 0.03),
        blastLp0: 9000,
        blastLp1: 900,
        thumpF0: 170,
        thumpF1: 55,
        thumpDecay: 0.07,
        thumpGain: 1.1,
        tail: 0.75,
        tailGain: 0.35,
        drive: 2.2,
        slap: k.r(0.095, 0.115),
        slapGain: 0.2,
      });
      k.add(x, k.metal(k.r(2900, 3300), 0.05, 0.3), 0.04);
      return k.wide(x, 7, 0.25);
    },
  },
  revolver_cock: {
    gain: 0.3,
    render(k) {
      const x = k.out(0.2);
      k.add(x, k.click(3200, 6, 0.004), 1);
      k.add(x, k.metal(4400, 0.02, 0.1), 0.15, 0.002);
      k.add(x, k.click(2300, 5, 0.006), 0.8, 0.055);
      return x;
    },
  },
  revolver_reload_start: {
    gain: 0.42,
    render(k) {
      const x = k.out(1.0);
      k.add(x, k.click(2800, 5, 0.005), 1);
      k.add(x, k.slide(0.08, 1500, 3000, 3), 0.4, 0.01);
      k.add(x, k.slide(0.1, 800, 1800, 2.5), 0.5, 0.12);
      for (let i = 0; i < 6; i++) {
        const t = 0.22 + i * 0.035 + k.r(0, 0.03);
        const f = k.r(4200, 6400);
        k.add(x, k.metal(f, 0.07, 0.4), 0.22, t);
        k.add(x, k.wood(k.r(900, 1300), 0.012, 0.1), 0.25, t);
        k.add(x, k.metal(f * 1.02, 0.05, 0.3), 0.08, t + k.r(0.06, 0.1));
      }
      return x;
    },
  },
  revolver_reload_end: {
    gain: 0.42,
    render(k) {
      const x = k.out(0.75);
      k.add(x, k.slide(0.12, 2000, 1200, 3), 0.5);
      k.add(x, k.click(2500, 4, 0.007), 1, 0.15);
      k.add(x, k.metal(1800, 0.06, 0.3), 0.3, 0.15);
      let t = 0.24;
      let dt = 0.024;
      for (let i = 0; i < 9; i++) {
        k.add(x, k.click(3600 - i * 120, 6, 0.003), 0.55 * (1 - i * 0.08), t);
        t += dt;
        dt *= 1.16;
      }
      return x;
    },
  },
  nail_fire: {
    variants: 4,
    gain: 0.5,
    limit: 5,
    priority: 3,
    group: 'shot',
    render(k) {
      const d = 0.3;
      const x = k.out(d);
      k.add(x, k.burst(d, 0.001, 0.03, { hp: 1500, lp: 7000 }), 0.55);
      k.add(x, k.burst(d, 0.004, 0.05, { bp: 3200, q: 0.7 }), 0.3, 0.025);
      k.add(x, k.thump(d, 230, 70, 0.03), 1);
      k.add(x, k.modal(d, [[k.r(380, 460), 0.02, 1], [k.r(900, 1050), 0.012, 0.5]]), 0.6);
      k.add(x, k.metal(k.r(2100, 2500), 0.03, 0.2), 0.22, 0.004);
      k.drive(x, 1.6);
      return k.fade(x, 0.2, 10);
    },
  },
  nail_impact: {
    variants: 4,
    gain: 0.32,
    limit: 4,
    group: 'hit',
    render(k) {
      const x = k.out(0.16);
      k.add(x, k.wood(k.r(600, 820), 0.02, 0.15), 0.7);
      k.add(x, k.squelch(0.15, 1800, 500, 0.02), 0.5);
      k.add(x, k.click(4200, 3, 0.002), 0.5);
      return x;
    },
  },
  nail_reload: {
    gain: 0.42,
    render(k) {
      const x = k.out(0.65);
      k.add(x, k.slide(0.3, 600, 1400, 2), 0.6);
      k.add(x, k.click(3000, 5, 0.005), 1, 0.32);
      k.add(x, k.metal(1800, 0.05, 0.3), 0.3, 0.32);
      k.add(x, k.click(2200, 5, 0.006), 0.8, 0.46);
      k.add(x, k.burst(0.2, 0.002, 0.04, { hp: 2500 }), 0.25, 0.48);
      return x;
    },
  },
  shotgun_fire: {
    variants: 3,
    gain: 1,
    priority: 5,
    group: 'shot',
    verb: 0.3,
    render(k) {
      const x = k.gunshot({
        d: 1.5,
        crack: 1.2,
        blastDecay: k.r(0.05, 0.06),
        blastLp0: 6500,
        blastLp1: 500,
        thumpF0: 115,
        thumpF1: 38,
        thumpDecay: 0.16,
        thumpGain: 1.5,
        tail: 1.1,
        tailGain: 0.5,
        drive: 3,
        slap: k.r(0.11, 0.13),
        slapGain: 0.28,
      });
      return k.wide(x, 9, 0.3);
    },
  },
  shotgun_pump: {
    gain: 0.55,
    render(k) {
      const x = k.out(0.45);
      k.add(x, k.slide(0.12, 900, 2200, 2.5), 0.6);
      k.add(x, k.click(1800, 5, 0.008), 1, 0.1);
      k.add(x, k.metal(1400, 0.04, 0.2), 0.3, 0.1);
      k.add(x, k.slide(0.1, 2000, 1000, 2.5), 0.55, 0.16);
      k.add(x, k.click(2600, 4, 0.01), 1, 0.25);
      k.add(x, k.metal(1100, 0.05, 0.25), 0.4, 0.25);
      k.add(x, k.wood(500, 0.02, 0.1), 0.3, 0.25);
      return x;
    },
  },
  shotgun_shell_in: {
    variants: 2,
    gain: 0.38,
    render(k) {
      const x = k.out(0.2);
      k.add(x, k.slide(0.08, 1200, 2500, 3), 0.5);
      k.add(x, k.click(2000, 5, 0.008), 1, 0.07);
      k.add(x, k.wood(1800, 0.01, 0.1), 0.3, 0.07);
      return x;
    },
  },
  shell_drop: {
    variants: 3,
    gain: 0.26,
    limit: 3,
    group: 'debris',
    render(k) {
      const x = k.out(0.4);
      const f = k.r(900, 1150);
      k.add(x, k.wood(f, 0.025, 0.2), 1);
      const t1 = k.r(0.1, 0.14);
      k.add(x, k.wood(f * 1.05, 0.02, 0.15), 0.5, t1);
      k.add(x, k.wood(f * 1.1, 0.015, 0.12), 0.22, t1 + k.r(0.06, 0.09));
      return x;
    },
  },
  brass_drop: {
    variants: 4,
    gain: 0.2,
    limit: 4,
    group: 'debris',
    render(k) {
      const x = k.out(0.45);
      const f = k.r(4200, 5600);
      k.add(x, k.metal(f, 0.12, 0.4), 1);
      k.add(x, k.wood(1200, 0.01, 0.1), 0.4);
      const t1 = k.r(0.07, 0.1);
      k.add(x, k.metal(f * 1.01, 0.08, 0.3), 0.45, t1);
      k.add(x, k.metal(f * 1.02, 0.05, 0.2), 0.2, t1 + k.r(0.05, 0.07));
      return x;
    },
  },
  flare_fire: {
    variants: 2,
    gain: 0.72,
    priority: 4,
    group: 'shot',
    verb: 0.25,
    render(k) {
      const d = 1.0;
      const x = k.out(d);
      k.add(x, k.thump(d, 190, 60, 0.05), 1);
      k.add(x, k.burst(d, 0.0005, 0.02, { lp: 3000 }), 0.8);
      k.drive(x, 2);
      const w = k.noise(d);
      k.bp(w, curve([[0, 500], [0.25, 2600], [0.9, 1300]]), 1.5);
      k.mul(w, k.env(d, [[0, 0], [0.03, 1], [0.3, 0.7], [0.95, 0]]));
      k.add(x, w, 0.6, 0.02);
      fizz(k, x, 0.04, 0.9, 40, 0.12);
      return k.fade(x, 0.2, 40);
    },
  },
  flare_burn: {
    gain: 0.42,
    render(k) {
      const d = 1.6;
      const x = k.out(d);
      k.add(x, k.wood(300, 0.04, 0.3), 0.5);
      const s = k.noise(d);
      k.hp(s, 3000);
      k.mul(s, k.env(d, [[0, 0], [0.02, 1], [1.2, 0.3], [1.6, 0]]));
      k.add(x, s, 0.5);
      fizz(k, x, 0, 1.4, 25, 0.25);
      return x;
    },
  },
  flare_reload: {
    gain: 0.42,
    render(k) {
      const x = k.out(0.75);
      k.add(x, k.click(2000, 4, 0.006), 1);
      k.add(x, k.metal(1300, 0.06, 0.3), 0.35);
      k.add(x, k.wood(400, 0.03, 0.2), 0.7, 0.25);
      k.add(x, k.slide(0.06, 800, 1500, 2), 0.4, 0.2);
      k.add(x, k.click(2600, 4, 0.006), 1, 0.5);
      k.add(x, k.metal(1500, 0.05, 0.25), 0.35, 0.5);
      return x;
    },
  },
  harpoon_fire: {
    variants: 2,
    gain: 0.85,
    priority: 5,
    group: 'shot',
    verb: 0.25,
    render(k) {
      const d = 1.1;
      const x = k.out(d);
      k.add(x, k.burst(d, 0.001, 0.05, { lp: 3500 }), 0.9);
      k.add(x, k.thump(d, 140, 50, 0.08), 1.2);
      k.add(x, k.pluck(d, 98, 0.6, 0.6), 0.5);
      k.add(x, k.pluck(d, 147, 0.4, 0.7), 0.3);
      const z = k.noise(d);
      k.bp(z, sweep(900, 5000, 0.35), 4);
      k.mul(z, k.perc(d, 0.003, 0.2));
      k.add(x, z, 0.4, 0.02);
      k.drive(x, 1.8);
      return k.fade(x, 0.2, 40);
    },
  },
  harpoon_reel: {
    gain: 0.45,
    render(k) {
      const d = 1.3;
      const f = sweep(180, 320, 1.2);
      const x = k.tone(d, f, 'saw');
      k.add(x, k.tone(d, (t) => f(t) / 2, 'square'), 0.3);
      k.bp(x, 900, 2);
      k.mul(x, k.env(d, [[0, 0], [0.05, 1], [1.1, 0.8], [1.3, 0]]));
      for (let t = 0.02; t < 1.2; t += 1 / 22) k.add(x, k.click(3000, 6, 0.003), 0.35, t);
      const hum = k.tone(d, 60, 'tri');
      k.mul(hum, k.env(d, [[0, 0], [0.05, 1], [1.2, 1], [1.3, 0]]));
      k.add(x, hum, 0.25);
      return x;
    },
  },
  harpoon_skewer: {
    variants: 3,
    gain: 0.58,
    limit: 5,
    group: 'gore',
    render(k) {
      const x = k.out(0.45);
      k.add(x, k.squelch(0.4, 2000, 300, 0.06), 1);
      crackles(k, x, 0.005, 0.05, 6, 0.4);
      k.add(x, k.thump(0.4, 120, 60, 0.05), 0.7);
      return x;
    },
  },
  harpoon_reload: {
    gain: 0.42,
    render(k) {
      const x = k.out(1.1);
      for (let i = 0; i < 6; i++) k.add(x, k.click(2800, 6, 0.003), 0.5, i * 0.05);
      k.add(x, k.slide(0.2, 500, 1200, 2), 0.5, 0.35);
      k.add(x, k.click(2200, 4, 0.007), 1, 0.6);
      k.add(x, k.metal(1200, 0.06, 0.3), 0.4, 0.6);
      k.add(x, k.burst(0.3, 0.002, 0.15, { hp: 2000 }), 0.3, 0.75);
      return x;
    },
  },
  outboard_pull: {
    gain: 0.66,
    render(k) {
      const d = 1.45;
      const x = k.out(d);
      const rip = k.noise(0.32);
      k.bp(rip, sweep(400, 2400, 0.28), 2);
      k.mul(rip, k.env(0.32, [[0, 0], [0.04, 1], [0.24, 0.8], [0.32, 0]]));
      k.add(x, rip, 0.7);
      const whirr = k.tone(0.5, sweep(30, 70, 0.25), 'saw');
      k.lp(whirr, 600);
      k.mul(whirr, k.env(0.5, [[0, 0], [0.1, 1], [0.5, 0]]));
      k.add(x, whirr, 0.5);
      const pop = (t: number, a: number) => {
        k.add(x, k.thump(0.12, 95, 40, 0.025), a, t);
        k.add(x, k.burst(0.06, 0.0005, 0.01, { lp: 1600 }), a * 0.7, t);
      };
      // Two coughs, then it catches.
      for (let i = 0; i < 4; i++) pop(0.36 + i / 16, 0.6 * (1 - i * 0.2));
      let t = 0.8;
      let rate = 14;
      while (t < 1.42) {
        pop(t, 0.85);
        t += 1 / rate;
        rate = Math.min(30, rate * 1.12);
      }
      return k.fade(x, 1, 30);
    },
  },
  outboard_stop: {
    gain: 0.5,
    render(k) {
      const d = 1.1;
      const x = k.out(d);
      let t = 0;
      let rate = 26;
      let a = 0.9;
      while (t < 0.9) {
        k.add(x, k.thump(0.12, 90, 40, 0.025), a, t);
        k.add(x, k.burst(0.06, 0.0005, 0.01, { lp: 1400 }), a * 0.6, t);
        t += (1 / rate) * k.r(0.8, 1.4);
        rate *= 0.9;
        a *= 0.93;
      }
      k.add(x, k.burst(0.4, 0.01, 0.12, { hp: 2000 }), 0.25, 0.75);
      k.add(x, k.metal(2400, 0.08, 0.3), 0.15, 0.95);
      return x;
    },
  },
  outboard_shot: {
    variants: 6,
    gain: 0.3,
    limit: 3,
    priority: 3,
    group: 'shot',
    spread: 0.06,
    render(k) {
      return k.gunshot({
        d: 0.2,
        crack: 1,
        blastDecay: 0.008,
        blastLp0: 8000,
        blastLp1: 1500,
        thumpF0: 180,
        thumpF1: 90,
        thumpDecay: 0.02,
        thumpGain: 0.7,
        tail: 0.12,
        tailGain: 0.15,
        drive: 2,
      });
    },
  },
  outboard_reload: {
    gain: 0.48,
    render(k) {
      const x = k.out(1.3);
      k.add(x, k.wood(250, 0.04, 0.3), 0.8);
      k.add(x, k.metal(700, 0.08, 0.4), 0.4);
      for (let i = 0; i < 10; i++) k.add(x, k.metal(k.r(2000, 4000), 0.03, 0.1), 0.25, 0.25 + i * 0.035 + k.r(0, 0.02));
      k.add(x, k.metal(900, 0.1, 0.4), 0.6, 0.8);
      k.add(x, k.click(2000, 3, 0.008), 1, 0.8);
      k.add(x, k.slide(0.12, 600, 1800, 2.5), 0.5, 1.0);
      k.add(x, k.click(2500, 4, 0.006), 0.8, 1.12);
      return x;
    },
  },
  empty_click: {
    gain: 0.38,
    limit: 2,
    render(k) {
      const x = k.out(0.08);
      k.add(x, k.click(3500, 8, 0.003, 0.06), 1);
      k.add(x, k.click(1800, 3, 0.004, 0.06), 0.4);
      return x;
    },
  },
  weapon_switch: {
    variants: 2,
    gain: 0.32,
    render(k) {
      const x = k.out(0.32);
      const r = k.noise(0.2);
      k.bp(r, 1200, 0.6);
      k.mul(r, k.env(0.2, [[0, 0], [0.05, 0.6], [0.18, 0]]));
      k.add(x, r, 0.6);
      k.add(x, k.click(2600, 4, 0.006), 1, 0.12);
      k.add(x, k.metal(1600, 0.04, 0.2), 0.3, 0.12);
      return x;
    },
  },
  buy: {
    gain: 0.5,
    priority: 4,
    render(k) {
      const x = k.out(1.0);
      k.add(x, k.slide(0.15, 400, 800, 1), 0.5);
      k.add(x, k.wood(180, 0.05, 0.3), 0.5, 0.05);
      k.add(x, k.metal(2637, 0.35, 0.9), 0.6, 0.02);
      k.add(x, k.modal(0.9, [[3951, 0.3, 0.5], [5274, 0.2, 0.25]]), 0.4, 0.02);
      for (let i = 0; i < 5; i++) k.add(x, k.metal(k.r(4000, 7000), 0.08, 0.2), 0.12, 0.2 + i * 0.06 + k.r(0, 0.03));
      return x;
    },
  },

  // ===================================================== zombie voices
  groan: {
    rate: 0.5,
    variants: 10,
    gain: 0.5,
    group: 'voice',
    verb: 0.18,
    spread: 0,
    render(k) {
      return moan(k, { f0: k.r(72, 105), d: k.r(1.0, 1.8), tract: k.r(0.82, 0.95), fry: k.r(0.3, 0.55), gurgle: k.r(0.1, 0.35), breath: 0.24 });
    },
  },
  groan_jogger: {
    rate: 0.5,
    variants: 4,
    gain: 0.45,
    group: 'voice',
    verb: 0.15,
    spread: 0,
    render(k) {
      const d = 1.4;
      const x = k.out(d);
      for (let i = 0; i < 3; i++) {
        const t = i * k.r(0.28, 0.34);
        const br = k.noise(0.2);
        k.bp(br, k.r(1000, 1400), 1);
        k.mul(br, k.env(0.2, [[0, 0], [0.04, 1], [0.18, 0]]));
        k.add(x, br, 0.6, t);
        const v = k.voice(0.18, { f0: k.r(125, 150), amp: curve([[0, 0], [0.04, 1], [0.18, 0]]), vowels: [[0, 'a']], breath: 0.6, fry: 0.3, tract: 0.95 });
        k.add(x, v, 0.4, t);
      }
      k.add(x, moan(k, { f0: k.r(110, 130), d: 0.5, tract: 0.9, fry: 0.5, gurgle: 0.2, breath: 0.4, path: ['uh', 'a', 'uh'] }), 0.8, 0.9);
      return x;
    },
  },
  groan_bloater: {
    rate: 0.5,
    variants: 4,
    gain: 0.58,
    group: 'voice',
    verb: 0.18,
    spread: 0,
    render(k) {
      const d = k.r(1.6, 2.2);
      const x = moan(k, { f0: k.r(52, 68), d, tract: k.r(0.74, 0.8), fry: 0.55, gurgle: 0.6, breath: 0.2, path: k.rng.pick([['o', 'ou', 'u'], ['uh', 'o', 'ou']] as Vowel[][]) });
      const slosh = k.brown(d);
      k.lp(slosh, 220);
      k.mul(slosh, k.wander(d, 5));
      k.add(x, slosh, 0.25);
      drips(k, x, 0.3, d, 4, 0.2);
      return x;
    },
  },
  groan_riot: {
    rate: 0.5,
    variants: 3,
    gain: 0.48,
    group: 'voice',
    verb: 0.1,
    spread: 0,
    render(k) {
      const d = k.r(1.1, 1.6);
      const x = moan(k, { f0: k.r(78, 95), d, tract: 0.86, fry: 0.4, gurgle: 0.1, breath: 0.3 });
      k.lp(x, 850);
      k.comb(x, 0.0026, 0.5, 0.35, 0.3);
      for (const t of [0, d * 0.75]) {
        const b = k.noise(0.4);
        k.hp(b, 2000);
        k.mul(b, k.env(0.4, [[0, 0], [0.15, 1], [0.4, 0]]));
        k.add(x, b, 0.12, t);
      }
      return x;
    },
  },
  groan_dave: {
    rate: 0.5,
    variants: 3,
    gain: 0.62,
    group: 'voice',
    priority: 4,
    verb: 0.3,
    spread: 0,
    render(k) {
      const d = k.r(2.2, 2.8);
      const x = moan(k, { f0: k.r(42, 54), d, tract: 0.7, fry: 0.65, gurgle: 0.4, breath: 0.18, path: ['o', 'a', 'ou'] });
      const low = moan(k, { f0: k.r(26, 30), d, tract: 0.64, fry: 0.4, gurgle: 0.3, breath: 0.1, path: ['ou', 'o', 'u'] });
      k.add(x, low, 0.7);
      k.drive(x, 1.6);
      return k.wide(x, 11, 0.3);
    },
  },
  crawler_gurgle: {
    rate: 0.5,
    variants: 5,
    gain: 0.46,
    group: 'voice',
    verb: 0.12,
    spread: 0,
    render(k) {
      const d = k.r(1.0, 1.4);
      const x = k.groan(d, {
        f0: curve([[0, k.r(80, 95)], [d * 0.5, k.r(92, 105)], [d, k.r(70, 80)]]),
        amp: curve([[0, 0], [0.1, 0.9], [d * 0.7, 1], [d, 0]]),
        vowels: [[0, 'u'], [d * 0.5, 'o'], [d, 'u']],
        gurgle: 0.85,
        breath: 0.35,
        fry: 0.5,
        tract: 0.85,
      });
      k.lp(x, 3200);
      drips(k, x, 0.05, d, 6, 0.25);
      return k.fade(x, 3, 30);
    },
  },
  scream_burn: {
    variants: 3,
    gain: 0.32,
    group: 'voice',
    priority: 3,
    verb: 0.2,
    spread: 0.03,
    render(k) {
      const d = 1.4;
      const base = k.r(0.9, 1.15);
      const vib = (t: number) => 1 + 0.03 * Math.sin(2 * Math.PI * 7 * t);
      const f = curve([[0, 280 * base], [0.1, 520 * base], [0.8, 470 * base], [1.3, 250 * base]]);
      const x = k.voice(d, {
        f0: (t) => f(t) * vib(t),
        amp: curve([[0, 0], [0.06, 1], [1.0, 0.8], [1.4, 0]]),
        vowels: [[0, 'a'], [0.5, 'ae'], [1.4, 'a']],
        tract: 1.05,
        bright: 0.9,
        breath: 0.35,
        fry: 0.12,
        jitter: 0.03,
      });
      k.drive(x, 2.4);
      const fire = k.noise(d);
      k.lp(fire, 900);
      k.mul(fire, k.env(d, [[0, 0], [0.1, 1], [1.4, 0]]));
      k.add(x, fire, 0.25);
      return k.fade(x, 3, 40);
    },
  },
  grab: {
    variants: 3,
    gain: 0.52,
    group: 'voice',
    priority: 4,
    render(k) {
      const d = 0.5;
      const x = k.voice(d, {
        f0: curve([[0, 100], [0.1, 125], [0.5, 90]]),
        amp: curve([[0, 0], [0.03, 1], [0.35, 0.7], [0.5, 0]]),
        vowels: [[0, 'a'], [0.5, 'uh']],
        fry: 0.8,
        gurgle: 0.3,
        bright: 0.6,
        tract: 0.85,
        breath: 0.3,
      });
      k.warm(x, 2.2, 0.2);
      const cloth = k.noise(0.25);
      k.bp(cloth, 1500, 0.7);
      k.mul(cloth, k.env(0.25, [[0, 0], [0.03, 1], [0.25, 0]]));
      k.add(x, cloth, 0.35);
      return k.fade(x, 1, 20);
    },
  },
  trip: {
    variants: 2,
    gain: 0.5,
    render(k) {
      const x = k.out(0.6);
      const oof = k.voice(0.22, { f0: curve([[0, 110], [0.22, 85]]), amp: curve([[0, 0], [0.02, 1], [0.22, 0]]), vowels: [[0, 'u'], [0.22, 'uh']], fry: 0.4, tract: 0.88 });
      k.add(x, oof, 0.6);
      k.add(x, k.wood(140, 0.05, 0.3), 0.9, 0.12);
      k.add(x, k.thump(0.4, 85, 45, 0.06), 1, 0.12);
      return x;
    },
  },
  twitch: {
    variants: 3,
    gain: 0.34,
    group: 'gore',
    render(k) {
      const d = 0.7;
      const c = k.noise(d);
      k.comb(c, 1 / k.r(160, 260), 0.9, 0.8, 0.4);
      k.bp(c, 700, 0.8);
      k.mul(c, k.wander(d, 30));
      k.mul(c, k.env(d, [[0, 0], [0.1, 1], [0.6, 0.6], [0.7, 0]]));
      crackles(k, c, 0.05, 0.55, 8, 0.25);
      return c;
    },
  },
  rise: {
    rate: 0.5,
    variants: 2,
    gain: 0.55,
    group: 'voice',
    priority: 3,
    verb: 0.15,
    spread: 0.03,
    render(k) {
      const d = 1.6;
      const x = k.groan(d, {
        f0: curve([[0, 52], [1.3, 96], [1.6, 85]]),
        amp: curve([[0, 0], [0.2, 0.6], [1.2, 1], [1.6, 0]]),
        vowels: [[0, 'u'], [0.8, 'o'], [1.5, 'a']],
        fry: 0.7,
        gurgle: 0.4,
        tract: 0.84,
      });
      k.lp(x, 3500);
      crackles(k, x, 0.1, 0.8, 10, 0.35);
      const cloth = k.noise(d);
      k.bp(cloth, 900, 0.6);
      k.mul(cloth, k.env(d, [[0, 0], [0.3, 0.3], [1, 0.2], [1.6, 0]]));
      k.add(x, cloth, 0.2);
      return k.fade(x, 3, 30);
    },
  },
  player_hurt: {
    variants: 5,
    gain: 0.5,
    limit: 2,
    priority: 4,
    render(k) {
      const d = 0.28;
      const f = k.r(112, 135);
      const x = k.voice(d, {
        f0: curve([[0, f * 1.1], [0.08, f * 1.2], [0.28, f * 0.85]]),
        amp: curve([[0, 0], [0.015, 1], [0.12, 0.7], [0.28, 0]]),
        vowels: [[0, k.rng.pick(['uh', 'a', 'o'] as Vowel[])], [0.28, 'uh']],
        tract: 1,
        bright: 0.6,
        breath: 0.3,
        fry: 0.15,
      });
      return k.fade(x, 1, 20);
    },
  },
  player_cough: {
    variants: 2,
    gain: 0.45,
    limit: 1,
    priority: 4,
    render(k) {
      const x = k.out(0.95);
      for (const t of [0, k.r(0.24, 0.3), k.r(0.48, 0.56)]) {
        k.add(x, k.burst(0.15, 0.003, 0.06, { bp: 900, q: 0.8 }), 0.8, t);
        k.add(x, k.voice(0.12, { f0: 150, amp: curve([[0, 0], [0.01, 1], [0.12, 0]]), vowels: [[0, 'a']], breath: 0.75, tract: 1 }), 0.5, t);
      }
      return x;
    },
  },
  player_death: {
    gain: 0.6,
    priority: 5,
    verb: 0.2,
    render(k) {
      const d = 1.7;
      const x = k.voice(1.3, {
        f0: curve([[0, 150], [0.15, 165], [1.2, 90]]),
        amp: curve([[0, 0], [0.04, 1], [0.9, 0.6], [1.3, 0]]),
        vowels: [[0, 'a'], [0.6, 'o'], [1.3, 'u']],
        breath: 0.3,
        fry: 0.35,
        tract: 0.98,
        bright: 0.5,
      });
      const o = k.out(d);
      k.add(o, x, 1);
      k.add(o, k.wood(130, 0.06, 0.4), 1, 1.05);
      k.add(o, k.thump(0.5, 80, 45, 0.06), 1, 1.05);
      return o;
    },
  },
  jump: {
    variants: 2,
    gain: 0.32,
    limit: 1,
    render(k) {
      const x = k.out(0.3);
      k.add(x, k.voice(0.13, { f0: k.r(135, 150), amp: curve([[0, 0], [0.01, 1], [0.13, 0]]), vowels: [[0, 'uh']], breath: 0.4, tract: 1 }), 0.6);
      const w = k.noise(0.3);
      k.bp(w, sweep(500, 1500, 0.2), 1);
      k.mul(w, k.env(0.3, [[0, 0], [0.08, 1], [0.3, 0]]));
      k.add(x, w, 0.35);
      return x;
    },
  },
  land: {
    variants: 2,
    gain: 0.38,
    limit: 1,
    render(k) {
      const x = k.out(0.3);
      k.add(x, k.wood(k.r(130, 150), 0.05, 0.3), 1);
      k.add(x, k.thump(0.3, 90, 50, 0.04), 0.8);
      return x;
    },
  },

  // ============================================================ gore
  hit_flesh: {
    variants: 6,
    gain: 0.48,
    limit: 5,
    group: 'hit',
    render(k) {
      const d = 0.22;
      const x = k.out(d);
      k.add(x, k.thump(d, 140, 70, 0.03), 0.8);
      k.add(x, k.squelch(d, k.r(1400, 2000), k.r(300, 500), 0.035, 2.5), 1);
      k.add(x, k.burst(0.05, 0.0002, 0.003, { bp: 2500, q: 0.8 }), 0.4);
      return k.fade(x, 0.1, 10);
    },
  },
  hit_head: {
    variants: 4,
    gain: 0.8,
    limit: 4,
    group: 'hit',
    priority: 3,
    render(k) {
      const d = 0.45;
      const x = k.out(d);
      k.add(x, k.click(3000, 1.5, 0.004), 1);
      k.add(x, k.modal(0.1, [[k.r(1700, 1900), 0.012, 1], [k.r(2800, 3000), 0.008, 0.6]]), 0.6);
      k.add(x, k.squelch(0.4, 2500, 400, 0.07, 2), 1, 0.004);
      drips(k, x, 0.05, 0.4, 4, 0.25);
      return k.fade(x, 0.1, 15);
    },
  },
  bone_crunch: {
    variants: 4,
    gain: 0.5,
    group: 'gore',
    render(k) {
      const x = k.out(0.3);
      crackles(k, x, 0, 0.09, 10, 0.8);
      k.add(x, k.thump(0.3, 110, 60, 0.04), 0.5);
      k.add(x, k.squelch(0.2, 1200, 400, 0.03), 0.4, 0.02);
      return x;
    },
  },
  splat: {
    variants: 4,
    gain: 0.44,
    group: 'gore',
    render(k) {
      const x = k.out(0.6);
      k.add(x, k.squelch(0.5, 1800, 250, 0.08, 2), 1);
      drips(k, x, 0.05, 0.55, 8, 0.4);
      return x;
    },
  },
  gib: {
    variants: 3,
    gain: 0.72,
    priority: 4,
    group: 'gore',
    verb: 0.2,
    render(k) {
      const d = 1.1;
      const x = k.out(d);
      k.add(x, k.thump(d, 90, 35, 0.15), 1.2);
      const b = k.noise(d);
      k.lp(b, sweep(4000, 300, 0.4));
      k.mul(b, k.perc(d, 0.0005, 0.12));
      k.add(x, b, 0.8);
      k.add(x, k.squelch(1.0, 1500, 200, 0.2, 1.5), 1);
      crackles(k, x, 0, 0.15, 12, 0.5);
      drips(k, x, 0.1, 1.05, 20, 0.45);
      k.drive(x, 1.8);
      return k.wide(x, 8, 0.3);
    },
  },
  headoff: {
    variants: 2,
    gain: 0.68,
    priority: 4,
    group: 'gore',
    render(k) {
      const d = 1.1;
      const x = k.out(d);
      k.add(x, k.thump(d, 160, 60, 0.05), 1);
      k.add(x, k.click(2500, 1.2, 0.004), 0.8);
      k.add(x, k.squelch(0.5, 2200, 350, 0.08, 2), 1);
      const f = k.noise(d);
      k.bp(f, 1200, 0.8);
      k.mul(f, k.wander(d, 15));
      k.mul(f, k.env(d, [[0, 0], [0.08, 1], [0.9, 0.2], [1.1, 0]]));
      k.add(x, f, 0.35);
      drips(k, x, 0.1, 1.0, 10, 0.3);
      return x;
    },
  },
  bodyfall: {
    variants: 5,
    gain: 0.52,
    limit: 4,
    group: 'debris',
    render(k) {
      const d = 0.6;
      const x = k.out(d);
      const f = k.r(115, 160);
      k.add(x, k.wood(f, 0.06, 0.4), 0.9);
      k.add(x, k.thump(d, 80, 45, 0.06), 1);
      k.add(x, k.squelch(0.3, 900, 300, 0.04), 0.4);
      const t1 = k.r(0.12, 0.2);
      k.add(x, k.wood(f * 1.2, 0.04, 0.3), 0.4, t1);
      k.add(x, k.thump(0.3, 90, 50, 0.04), 0.4, t1);
      k.add(x, k.wood(f * 1.4, 0.03, 0.2), 0.15, t1 + k.r(0.08, 0.14));
      return x;
    },
  },
  plate_hit: {
    variants: 3,
    gain: 0.52,
    limit: 4,
    group: 'hit',
    render(k) {
      const x = k.out(0.9);
      k.add(x, k.metal(k.r(780, 950), 0.35, 0.9, 0.8), 1);
      k.add(x, k.click(3000, 2, 0.004), 0.5);
      k.add(x, k.thump(0.2, 200, 100, 0.02), 0.3);
      return x;
    },
  },
  plate_off: {
    variants: 2,
    gain: 0.58,
    priority: 3,
    render(k) {
      const d = 1.6;
      const x = k.out(d);
      const f = k.r(600, 750);
      k.add(x, k.metal(f, 0.5, 1.6), 1);
      let t = 0.35;
      let a = 0.5;
      for (let i = 0; i < 3; i++) {
        k.add(x, k.metal(f * 1.1, 0.12, 0.5), a, t);
        k.add(x, k.wood(300, 0.03, 0.2), a * 0.6, t);
        t += 0.2 * (1 - i * 0.3);
        a *= 0.6;
      }
      return x;
    },
  },
  ricochet: {
    variants: 3,
    gain: 0.36,
    limit: 3,
    render(k) {
      const d = 0.45;
      const f = sweep(k.r(2600, 3200), k.r(1000, 1300), 0.4);
      const x = k.tone(d, (t) => f(t) * (1 + 0.02 * Math.sin(2 * Math.PI * 30 * t)));
      k.add(x, k.tone(d, f, 'saw'), 0.15);
      k.mul(x, k.perc(d, 0.002, 0.15));
      k.add(x, k.click(3500, 2, 0.003), 0.8);
      return x;
    },
  },
  bloater_pop: {
    variants: 2,
    gain: 0.8,
    priority: 5,
    verb: 0.2,
    render(k) {
      const d = 1.8;
      const x = k.out(d);
      k.add(x, k.burst(0.05, 0.0001, 0.004, { hp: 800 }), 1.2);
      k.add(x, k.thump(d, 120, 40, 0.12), 1.2);
      const fart = k.voice(1.4, {
        f0: curve([[0, k.r(68, 76)], [0.5, 62], [1.2, 50], [1.4, 42]]),
        amp: curve([[0, 0], [0.06, 1], [0.8, 0.6], [1.4, 0]]),
        vowels: [[0, 'u'], [0.7, 'ou'], [1.4, 'u']],
        fry: 0.9,
        gurgle: 0.9,
        tract: 0.7,
        breath: 0.3,
        bw: 1.6,
      });
      k.add(x, fart, 0.8, 0.05);
      drips(k, x, 0.1, 1.6, 26, 0.45);
      const hiss = k.noise(d);
      k.hp(hiss, 2500);
      k.mul(hiss, k.perc(d, 0.01, 0.4));
      k.add(x, hiss, 0.22);
      k.drive(x, 1.5);
      return k.wide(x, 9, 0.3);
    },
  },
  belch: {
    rate: 0.5,
    variants: 2,
    gain: 0.75,
    priority: 5,
    verb: 0.3,
    render(k) {
      const d = 1.6;
      const x = k.voice(d, {
        f0: curve([[0, 62], [0.2, 72], [1.0, 55], [1.4, 46]]),
        amp: curve([[0, 0], [0.05, 1], [1.0, 0.75], [1.45, 0]]),
        vowels: [[0, 'o'], [0.4, 'a'], [1.2, 'ou']],
        fry: 0.85,
        gurgle: 0.5,
        tract: 0.72,
        breath: 0.2,
        bright: 0.45,
      });
      k.drive(x, 2);
      const hiss = k.noise(d);
      k.hp(hiss, 2000);
      k.mul(hiss, k.env(d, [[0, 0], [0.8, 0.2], [1.2, 0.6], [1.6, 0]]));
      k.add(x, hiss, 0.25);
      return k.wide(k.fade(x, 2, 40), 10, 0.3);
    },
  },
  enrage: {
    rate: 0.5,
    gain: 0.6,
    priority: 5,
    verb: 0.3,
    render(k) {
      const d = 1.7;
      const x = k.voice(d, {
        f0: curve([[0, 70], [0.3, 120], [1.0, 105], [1.5, 70]]),
        amp: curve([[0, 0], [0.08, 1], [1.2, 0.8], [1.6, 0]]),
        vowels: [[0, 'a'], [0.6, 'ae'], [1.5, 'a']],
        fry: 0.5,
        bright: 0.8,
        tract: 0.75,
        breath: 0.25,
      });
      k.drive(x, 2.6);
      for (let i = 0; i < 20; i++) k.add(x, k.burst(0.04, 0.001, 0.01, { bp: k.r(1800, 3200), q: 0.5 }), 0.4, 0.6 + i * 0.018 + k.r(0, 0.01));
      return k.wide(x, 10, 0.3);
    },
  },
  stretcher_drop: {
    gain: 0.52,
    render(k) {
      const x = k.out(0.9);
      k.add(x, k.metal(420, 0.25, 0.8), 0.7);
      k.add(x, k.metal(910, 0.15, 0.5), 0.4);
      k.add(x, k.wood(200, 0.05, 0.3), 0.8);
      k.add(x, k.burst(0.3, 0.005, 0.05, { lp: 800 }), 0.5);
      k.add(x, k.metal(470, 0.15, 0.5), 0.35, 0.15);
      k.add(x, k.wood(230, 0.04, 0.3), 0.4, 0.15);
      return x;
    },
  },
  stomp: {
    variants: 2,
    gain: 0.55,
    render(k) {
      const x = k.out(0.35);
      k.add(x, k.wood(k.r(120, 140), 0.06, 0.3), 1);
      k.add(x, k.thump(0.35, 100, 50, 0.05), 1);
      k.add(x, k.burst(0.1, 0.001, 0.02, { lp: 900 }), 0.5);
      return x;
    },
  },
  stomp_kill: {
    variants: 3,
    gain: 0.68,
    priority: 4,
    group: 'gore',
    render(k) {
      const x = k.out(0.65);
      k.add(x, k.wood(k.r(120, 140), 0.06, 0.3), 0.9);
      k.add(x, k.thump(0.4, 100, 45, 0.06), 1);
      crackles(k, x, 0.005, 0.07, 10, 0.7);
      k.add(x, k.squelch(0.5, 2000, 300, 0.07, 2), 1, 0.01);
      drips(k, x, 0.08, 0.6, 6, 0.3);
      return x;
    },
  },
  kick: {
    variants: 3,
    gain: 0.52,
    render(k) {
      const x = k.out(0.35);
      k.add(x, k.thump(0.3, 150, 70, 0.04), 1);
      k.add(x, k.squelch(0.2, 1500, 500, 0.03), 0.5);
      const w = k.noise(0.25);
      k.bp(w, sweep(500, 1200, 0.15), 1);
      k.mul(w, k.env(0.25, [[0, 0], [0.04, 1], [0.15, 0]]));
      k.add(x, w, 0.3);
      return x;
    },
  },
  splash: {
    variants: 2,
    gain: 0.6,
    verb: 0.2,
    render(k) {
      const d = 1.3;
      const x = k.noise(d);
      k.lp(x, curve([[0, 4000], [0.15, 1800], [1.2, 600]]));
      k.mul(x, k.env(d, [[0, 0], [0.01, 1], [0.1, 0.6], [0.7, 0.15], [1.2, 0]]));
      k.add(x, k.thump(d, 90, 40, 0.08), 0.6);
      for (let i = 0; i < 22; i++) k.add(x, k.bubble(k.r(300, 900), k.r(0.03, 0.08)), k.r(0.1, 0.35), k.r(0.1, 1.1));
      return k.wide(x, 8, 0.3);
    },
  },
  ash: {
    gain: 0.3,
    render(k) {
      const d = 0.7;
      const x = k.noise(d);
      k.lp(x, 1200);
      k.mul(x, k.env(d, [[0, 0], [0.05, 0.4], [0.7, 0]]));
      for (let i = 0; i < 30; i++) {
        const t = Math.pow(k.rng.next(), 1.5) * 0.55;
        k.add(x, k.wood(k.r(800, 3000), 0.005, 0.05), 0.3 * (1 - t), t);
      }
      return x;
    },
  },

  // ======================================================= fire & gas
  ignite: {
    variants: 2,
    gain: 0.62,
    priority: 3,
    verb: 0.2,
    render(k) {
      const d = 1.0;
      const x = k.noise(d);
      k.lp(x, sweep(200, 2500, 0.25), 0.9);
      k.mul(x, k.env(d, [[0, 0], [0.08, 1], [0.6, 0.3], [0.95, 0]]));
      k.add(x, k.thump(d, 70, 40, 0.15), 0.8);
      fizz(k, x, 0.1, 0.95, 30, 0.2);
      return x;
    },
  },
  sizzle: {
    gain: 0.32,
    render(k) {
      const d = 0.9;
      const x = k.noise(d);
      k.hp(x, 3500);
      k.mul(x, k.env(d, [[0, 0], [0.01, 1], [0.85, 0]]));
      fizz(k, x, 0, 0.6, 20, 0.3);
      return x;
    },
  },
  crackle: {
    variants: 8,
    gain: 0.22,
    group: 'crackle',
    spread: 0.15,
    render(k) {
      const x = k.out(0.06);
      const n = 1 + k.rng.int(3);
      for (let i = 0; i < n; i++) k.add(x, k.click(k.r(1500, 5000), k.r(1, 2.5), k.r(0.002, 0.006), 0.05), k.r(0.4, 1), i * k.r(0.004, 0.012));
      return x;
    },
  },
  gas_release: {
    variants: 2,
    gain: 0.5,
    render(k) {
      const d = 1.4;
      const x = k.noise(d);
      k.hp(x, 1800);
      k.bp(x, 4000, 0.6);
      k.mul(x, k.env(d, [[0, 0], [0.03, 1], [0.6, 0.5], [1.3, 0]]));
      for (let i = 0; i < 20; i++) k.add(x, k.bubble(k.r(150, 400), k.r(0.05, 0.1)), k.r(0.3, 0.8), k.r(0, 0.6));
      return x;
    },
  },
  gas_explosion: {
    variants: 2,
    gain: 1,
    priority: 5,
    verb: 0.3,
    render(k) {
      const d = 2.4;
      const x = k.out(d);
      k.add(x, k.thump(d, 70, 28, 0.35, 0.3), 1.4);
      const b = k.pink(d);
      k.lp(b, sweep(5000, 250, 0.8));
      k.mul(b, k.perc(d, 0.001, 0.25));
      k.add(x, b, 1);
      const roar = k.brown(d);
      k.lp(roar, 600);
      k.mul(roar, k.env(d, [[0, 0], [0.05, 1], [1.5, 0.2], [2.2, 0]]));
      k.add(x, roar, 0.8);
      fizz(k, x, 0.2, 2.0, 25, 0.3);
      k.drive(x, 2.2);
      k.echo(x, 0.18, 0.25, 2, 900);
      return k.wide(x, 12, 0.35);
    },
  },
  crate_crash: {
    variants: 2,
    gain: 0.8,
    priority: 4,
    verb: 0.2,
    render(k) {
      const d = 1.6;
      const x = k.out(d);
      k.add(x, k.thump(d, 100, 45, 0.12), 1);
      k.add(x, k.burst(d, 0.0005, 0.04, { lp: 3000 }), 0.8);
      for (let i = 0; i < 26; i++) {
        const t = Math.pow(k.rng.next(), 1.6) * 0.55;
        k.add(x, k.wood(k.r(300, 1800), k.r(0.01, 0.04), 0.2), 0.6 * (1 - t * 1.2) * k.r(0.4, 1), t);
      }
      for (let i = 0; i < 4; i++) k.add(x, k.click(k.r(1500, 2500), 1, 0.01, 0.05), 0.6, k.r(0, 0.05));
      // The fish: wet slaps flopping on the planks (it's a fish crate).
      for (let i = 0; i < 7; i++) {
        const t = k.r(0.15, 1.3);
        k.add(x, k.squelch(0.1, k.r(1100, 1500), 400, 0.025, 2), 0.45, t);
        k.add(x, k.thump(0.08, 160, 90, 0.015), 0.2, t);
      }
      k.drive(x, 1.6);
      return k.wide(x, 9, 0.3);
    },
  },
  crane_snap: {
    gain: 0.6,
    priority: 4,
    render(k) {
      const d = 0.9;
      const x = k.out(d);
      k.add(x, k.click(2500, 1, 0.002), 1.2);
      k.add(x, k.pluck(d, 220, 0.3, 0.9), 0.5);
      k.add(x, k.metal(1200, 0.2, 0.6), 0.3);
      const creak = k.noise(0.4);
      k.comb(creak, 1 / 180, 0.9, 0.8, 0.4);
      k.bp(creak, 600, 0.8);
      k.mul(creak, k.env(0.4, [[0, 0], [0.1, 1], [0.4, 0]]));
      k.add(x, creak, 0.4, 0.1);
      const wh = k.tone(0.5, sweep(1500, 700, 0.5));
      k.mul(wh, k.env(0.5, [[0, 0], [0.1, 0.5], [0.45, 1], [0.5, 0]]));
      k.add(x, wh, 0.12, 0.15);
      return x;
    },
  },
  cannon_fire: {
    variants: 2,
    gain: 0.9,
    priority: 5,
    verb: 0.35,
    render(k) {
      const x = k.gunshot({
        d: 2.2,
        crack: 0.4,
        blastDecay: 0.09,
        blastLp0: 2500,
        blastLp1: 300,
        thumpF0: 70,
        thumpF1: 30,
        thumpDecay: 0.3,
        thumpGain: 1.6,
        tail: 1.8,
        tailGain: 0.6,
        drive: 2.5,
        slap: 0.35,
        slapGain: 0.3,
      });
      return k.wide(x, 12, 0.35);
    },
  },
  cannon_explosion: {
    variants: 2,
    gain: 1,
    priority: 6,
    verb: 0.3,
    render(k) {
      const d = 2.6;
      const x = k.out(d);
      k.add(x, k.thump(d, 80, 25, 0.4, 0.35), 1.5);
      const b = k.pink(d);
      k.lp(b, sweep(7000, 200, 1.0));
      k.mul(b, k.perc(d, 0.0005, 0.3));
      k.add(x, b, 1.1);
      for (let i = 0; i < 30; i++) {
        const t = k.r(0.1, 1.3);
        k.add(x, k.wood(k.r(300, 1500), k.r(0.01, 0.03), 0.15), 0.3 * (1.4 - t), t);
      }
      drips(k, x, 0.2, 1.5, 12, 0.3);
      k.drive(x, 2.5);
      k.echo(x, 0.22, 0.25, 2, 800);
      return k.wide(x, 12, 0.35);
    },
  },
  shell_whistle: {
    gain: 0.22,
    render(k) {
      const d = 0.75;
      const f = sweep(2400, 700, 0.7);
      const x = k.tone(d, (t) => f(t) * (1 + 0.01 * Math.sin(2 * Math.PI * 9 * t)));
      const n = k.noise(d);
      k.bp(n, f, 6);
      k.add(x, n, 0.4);
      return k.mul(x, k.env(d, [[0, 0], [0.1, 0.5], [0.6, 1], [0.75, 0]]));
    },
  },

  // ========================================================= the pier
  horn: {
    rate: 0.5,
    gain: 0.78,
    priority: 6,
    verb: 0.45,
    render(k) {
      const d = 4.8;
      const notes = [73.42, 87.31, 110.0];
      const pitch = curve([[0, 0.955], [0.3, 1.0], [3.6, 1.0], [4.4, 0.985]]);
      const chan = (side: number): Buf => {
        const x = k.out(d);
        notes.forEach((f, i) => {
          for (const det of [-1, 1]) {
            const fr = f * (1 + det * (0.0035 + 0.0012 * i) + side * 0.0016);
            k.add(x, k.tone(d, (t) => fr * pitch(t), 'pulse', k.rng.next(), 0.36), 0.5 - i * 0.08);
          }
        });
        k.lp(x, 950, 0.9);
        k.peq(x, 380, 1.4, 8);
        k.peq(x, 1150, 2, 4);
        const air = k.pink(d);
        k.bp(air, 600, 0.7);
        k.add(x, air, 0.12);
        k.mul(x, k.env(d, [[0, 0], [0.2, 0.7], [0.45, 1], [3.7, 0.95], [4.2, 0.3], [4.8, 0]]));
        k.drive(x, 1.3);
        k.echo(x, 0.42 + side * 0.03, 0.3, 2, 900);
        return k.fade(x, 2, 60);
      };
      return [chan(-1), chan(1)];
    },
  },
  gull: {
    variants: 6,
    gain: 0.28,
    bus: 'amb',
    group: 'amb',
    spread: 0.06,
    render(k) {
      const laugh = k.v % 3 === 2;
      const n = laugh ? 5 + k.rng.int(3) : 2 + k.rng.int(3);
      const gap = laugh ? k.r(0.08, 0.11) : k.r(0.2, 0.28);
      const d = n * gap + 0.4;
      const x = k.out(d);
      for (let i = 0; i < n; i++) {
        const sd = laugh ? k.r(0.06, 0.08) : k.r(0.13, 0.18);
        const hi = laugh ? k.r(1500, 1700) : k.r(1600, 2000);
        k.add(x, gullCall(k, sd, hi, hi * k.r(0.55, 0.68)), laugh ? 0.7 : 1, i * gap + k.r(0, 0.02));
      }
      k.echo(x, 0.16, 0.15, 1, 2000);
      return x;
    },
  },
  gulls_flee: {
    gain: 0.42,
    priority: 3,
    render(k) {
      const d = 1.6;
      const x = k.out(d);
      let t = 0;
      let rate = 10;
      let a = 1;
      for (let i = 0; i < 14; i++) {
        k.add(x, k.burst(0.08, 0.005, 0.03, { lp: 700, bp: 420, q: 0.6 }), a, t);
        t += 1 / rate;
        rate *= 0.97;
        a *= 0.9;
      }
      k.add(x, gullCall(k, 0.16, 1900, 1100), 0.5, 0.05);
      k.add(x, gullCall(k, 0.14, 1750, 1050), 0.4, 0.3);
      return k.wide(x, 10, 0.4);
    },
  },
  cheer: {
    rate: 0.5,
    variants: 2,
    gain: 0.58,
    priority: 3,
    verb: 0.3,
    render(k) {
      const d = 2.6;
      const L = k.out(d);
      const R = k.out(d);
      for (let i = 0; i < 16; i++) {
        const start = k.r(0, 0.45);
        const vd = k.r(0.6, 1.4);
        const f = k.r(140, 300);
        const woo = k.rng.chance(0.35);
        const v = k.voice(vd, {
          f0: woo ? curve([[0, f * 0.9], [vd * 0.3, f * 1.35], [vd, f * 0.9]]) : curve([[0, f], [vd * 0.2, f * 1.15], [vd, f * 0.8]]),
          amp: curve([[0, 0], [0.05, 1], [vd * 0.7, 0.7], [vd, 0]]),
          vowels: woo ? [[0, 'u'], [vd, 'o']] : [[0, 'e'], [vd * 0.3, 'ae'], [vd, 'a']],
          tract: f > 200 ? 1.15 : 1,
          breath: 0.3,
          bright: 0.6,
          jitter: 0.02,
        });
        const p = k.r(0, 1);
        k.add(L, v, 0.5 * (1 - p * 0.7), start);
        k.add(R, v, 0.5 * (0.3 + p * 0.7), start);
      }
      for (let i = 0; i < 70; i++) {
        const t = k.r(0.3, 2.4);
        const c = k.burst(0.03, 0.0005, 0.012, { bp: k.r(1200, 2200), q: 0.7 });
        const p = k.rng.next();
        k.add(L, c, 0.3 * (1 - p), t);
        k.add(R, c, 0.3 * p, t);
      }
      const wh = k.tone(0.7, curve([[0, 1800], [0.25, 2600], [0.7, 1700]]));
      k.mul(wh, k.env(0.7, [[0, 0], [0.05, 1], [0.6, 0.8], [0.7, 0]]));
      k.add(L, wh, 0.08, 0.4);
      k.add(R, wh, 0.12, 0.4);
      k.lp(L, 6000);
      k.lp(R, 6000);
      return [k.fade(L, 5, 200), k.fade(R, 5, 200)];
    },
  },
  boarding_step: {
    variants: 4,
    gain: 0.22,
    limit: 2,
    render(k) {
      const x = k.out(0.3);
      k.add(x, k.metal(k.r(300, 420), 0.08, 0.3), 0.6);
      k.add(x, k.wood(200, 0.03, 0.2), 0.4);
      k.add(x, k.thump(0.2, 120, 70, 0.02), 0.4);
      return x;
    },
  },
  coin: {
    variants: 3,
    gain: 0.26,
    bus: 'ui',
    limit: 3,
    render(k) {
      const p = [1, 1.122, 1.26][k.v % 3];
      const x = k.modal(0.45, [[2794 * p, 0.18, 1], [4186 * p, 0.12, 0.6], [5588 * p, 0.08, 0.35], [7040 * p, 0.05, 0.2]]);
      k.add(x, k.click(6000, 2, 0.002), 0.3);
      return x;
    },
  },
  coin_big: {
    gain: 0.42,
    bus: 'ui',
    render(k) {
      const x = k.out(1.1);
      k.add(x, k.click(3000, 2, 0.004), 0.6);
      k.add(x, k.slide(0.08, 600, 900, 1), 0.3);
      k.add(x, k.modal(1.0, [[2637, 0.4, 1], [3136, 0.4, 0.8], [3951, 0.3, 0.6], [5274, 0.2, 0.4]]), 0.8, 0.06);
      for (let i = 0; i < 8; i++) k.add(x, k.metal(k.r(4000, 7500), 0.07, 0.2), 0.12, 0.15 + i * 0.07 + k.r(0, 0.03));
      return x;
    },
  },
  sting_nice: {
    gain: 0.38,
    bus: 'ui',
    render(k) {
      const d = 1.1;
      const x = k.out(d);
      [NOTE(-7), NOTE(-4), NOTE(0), NOTE(5)].forEach((f, i) => {
        const n = k.tone(0.8, f * 2, 'tri');
        k.add(n, k.tone(0.8, f * 4), 0.3);
        k.mul(n, k.perc(0.8, 0.003, 0.22));
        k.add(x, n, 0.6, i * 0.06);
      });
      k.echo(x, 0.12, 0.3, 3, 4000);
      return x;
    },
  },
  sting_massacre: {
    gain: 0.5,
    bus: 'ui',
    render(k) {
      const d = 1.5;
      const x = k.out(d);
      const stab = (f: number) => sawStack(k, d, f, 0.006, sweep(3000, 500, 0.8), 1);
      for (const f of [NOTE(-31), NOTE(-19), NOTE(-16), NOTE(-12)]) k.add(x, stab(f), 0.3);
      k.mul(x, k.perc(d, 0.004, 0.35));
      k.add(x, k.thump(d, 110, 50, 0.25), 0.9);
      k.drive(x, 1.6);
      return k.wide(x, 10, 0.3);
    },
  },
  sting_headshot: {
    gain: 0.3,
    bus: 'ui',
    render(k) {
      const x = k.out(0.6);
      k.add(x, k.metal(1760, 0.25, 0.6), 0.5);
      const t = k.tone(0.6, 2637);
      k.mul(t, k.perc(0.6, 0.002, 0.15));
      k.add(x, t, 0.6);
      return x;
    },
  },
  tidy: {
    gain: 0.34,
    bus: 'ui',
    render(k) {
      const x = k.out(0.45);
      k.add(x, k.wood(900, 0.03, 0.2), 0.8);
      k.add(x, k.modal(0.4, [[1318, 0.2, 1], [2637, 0.1, 0.3]]), 0.5, 0.04);
      return x;
    },
  },
  bell: {
    gain: 0.5,
    priority: 4,
    verb: 0.35,
    render(k) {
      const d = 2.6;
      const x = k.out(d);
      k.add(x, bellStrike(k, d, 740), 1);
      k.add(x, bellStrike(k, d - 0.32, 740), 0.9, 0.32);
      return k.wide(x, 9, 0.3);
    },
  },
  alarm_bell: {
    gain: 0.36,
    priority: 4,
    render(k) {
      const d = 1.6;
      const x = k.out(d);
      for (let i = 0; i < 8; i++) k.add(x, bellStrike(k, 0.6, 1100, 0.35), 0.6, i * 0.12);
      return x;
    },
  },

  // ============================================================== ui
  ui_move: {
    gain: 0.16,
    bus: 'ui',
    group: 'ui',
    spread: 0,
    render(k) {
      const x = k.tone(0.06, 2100);
      k.mul(x, k.perc(0.06, 0.001, 0.012));
      k.add(x, k.click(5000, 3, 0.001, 0.02), 0.2);
      return x;
    },
  },
  ui_select: {
    gain: 0.24,
    bus: 'ui',
    group: 'ui',
    spread: 0,
    render(k) {
      const x = k.out(0.16);
      for (const [f, t] of [[1320, 0], [1760, 0.04]] as const) {
        const n = k.tone(0.1, f, 'tri');
        k.mul(n, k.perc(0.1, 0.001, 0.025));
        k.add(x, n, 1, t);
      }
      return x;
    },
  },
  ui_back: {
    gain: 0.22,
    bus: 'ui',
    group: 'ui',
    spread: 0,
    render(k) {
      const x = k.out(0.16);
      for (const [f, t] of [[1760, 0], [1175, 0.04]] as const) {
        const n = k.tone(0.1, f, 'tri');
        k.mul(n, k.perc(0.1, 0.001, 0.025));
        k.add(x, n, 1, t);
      }
      return x;
    },
  },
  ui_toggle: {
    gain: 0.2,
    bus: 'ui',
    group: 'ui',
    spread: 0.02,
    render(k) {
      const x = k.wood(1600, 0.008, 0.06);
      const t = k.tone(0.06, 2400);
      k.mul(t, k.perc(0.06, 0.001, 0.006));
      return k.add(x, t, 0.5);
    },
  },
  ui_open: {
    gain: 0.2,
    bus: 'ui',
    group: 'ui',
    spread: 0,
    render(k) {
      const x = k.noise(0.3);
      k.bp(x, sweep(500, 2500, 0.25), 1.2);
      return k.mul(x, k.env(0.3, [[0, 0], [0.15, 1], [0.3, 0]]));
    },
  },
  ui_deny: {
    gain: 0.1,
    bus: 'ui',
    group: 'ui',
    spread: 0,
    render(k) {
      const x = k.tone(0.14, 140, 'square');
      k.lp(x, 1200);
      return k.mul(x, k.env(0.14, [[0, 0], [0.005, 1], [0.12, 0.8], [0.14, 0]]));
    },
  },

  // ======================================================== ambience
  wave_slap: {
    variants: 5,
    gain: 0.4,
    bus: 'amb',
    group: 'amb',
    render(k) {
      const d = 1.1;
      const x = k.brown(d);
      k.lp(x, curve([[0, 300], [0.08, 700], [0.9, 250]]));
      k.mul(x, k.env(d, [[0, 0], [0.06, 1], [0.35, 0.4], [1.0, 0]]));
      k.add(x, k.wood(k.r(80, 100), 0.08, 0.5), 0.35, 0.04);
      for (let i = 0; i < 8; i++) k.add(x, k.bubble(k.r(200, 500), k.r(0.04, 0.09)), 0.15, k.r(0.08, 0.8));
      return k.wide(x, 10, 0.4);
    },
  },
  creak: {
    variants: 4,
    gain: 0.22,
    bus: 'amb',
    group: 'amb',
    render(k) {
      const d = k.r(0.8, 1.4);
      const x = k.noise(d);
      k.comb(x, 1 / k.r(180, 320), 0.93, 0.85, 0.35);
      k.bp(x, k.r(500, 900), 1);
      const sl = k.wander(d, 30);
      for (let i = 0; i < sl.length; i++) sl[i] = Math.max(0, sl[i]);
      k.mul(x, sl);
      k.mul(x, k.env(d, [[0, 0], [0.15, 1], [d - 0.2, 0.7], [d, 0]]));
      return x;
    },
  },
  siren: {
    rate: 0.5,
    variants: 2,
    gain: 0.18,
    bus: 'amb',
    verb: 0.4,
    render(k) {
      const d = 5;
      const f =
        k.v % 2 === 0
          ? (t: number) => 600 + 520 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 2.4))
          : (t: number) => (Math.floor(t / 0.6) % 2 === 0 ? 440 : 554);
      const x = k.tone(d, f, 'saw');
      k.add(x, k.tone(d, (t) => f(t) * 1.004, 'saw'), 0.7);
      k.bp(x, 900, 1.5);
      k.lp(x, 1500);
      k.mul(x, k.env(d, [[0, 0], [1, 1], [4, 0.9], [5, 0]]));
      k.echo(x, 0.3, 0.35, 2, 1000);
      return k.wide(x, 14, 0.4);
    },
  },
  bell_buoy: {
    gain: 0.14,
    bus: 'amb',
    verb: 0.5,
    render(k) {
      const d = 3;
      const x = bellStrike(k, d, k.r(500, 540), 2.2);
      k.lp(x, 1500);
      return x;
    },
  },
  car_alarm: {
    rate: 0.5,
    gain: 0.1,
    bus: 'amb',
    verb: 0.4,
    render(k) {
      const d = 3;
      const x = k.tone(d, (t) => (t < 2 ? (Math.floor(t * 4) % 2 === 0 ? 900 : 1200) : 700 + 900 * ((t * 3) % 1)), 'square');
      k.bp(x, 1100, 1);
      k.lp(x, 2000);
      k.mul(x, k.env(d, [[0, 0], [0.05, 1], [2.9, 1], [3, 0]]));
      k.echo(x, 0.35, 0.3, 2, 1200);
      return x;
    },
  },
  distant_scream: {
    rate: 0.5,
    variants: 2,
    gain: 0.1,
    bus: 'amb',
    verb: 0.5,
    render(k) {
      const d = 1.5;
      const f = curve([[0, 400], [0.2, 620], [1.2, 520], [1.5, 350]]);
      const x = k.voice(d, { f0: f, amp: curve([[0, 0], [0.1, 1], [1.2, 0.7], [1.5, 0]]), vowels: [[0, 'a'], [1.5, 'ae']], tract: 1.15, bright: 0.85, breath: 0.3 });
      k.lp(x, 2000);
      k.echo(x, 0.3, 0.3, 2, 1200);
      return x;
    },
  },
  town_boom: {
    rate: 0.5,
    gain: 0.24,
    bus: 'amb',
    verb: 0.4,
    render(k) {
      const d = 2.5;
      const x = k.thump(d, 55, 28, 0.5, 0.3);
      const r = k.pink(d);
      k.lp(r, 400);
      k.mul(r, k.env(d, [[0, 0], [0.05, 1], [2.5, 0]]));
      k.add(x, r, 0.6);
      k.echo(x, 0.5, 0.3, 2, 500);
      return x;
    },
  },

  // =========================================================== music
  mus_heart: {
    rate: 0.5,
    gain: 0.85,
    bus: 'music',
    spread: 0,
    render(k) {
      const x = k.thump(0.4, 78, 42, 0.07, 0.05);
      k.add(x, k.burst(0.05, 0.001, 0.008, { lp: 500 }), 0.3);
      return k.fade(x, 0.5, 30);
    },
  },
  mus_heart2: {
    rate: 0.5,
    gain: 0.62,
    bus: 'music',
    spread: 0,
    render(k) {
      return k.fade(k.thump(0.35, 88, 48, 0.06, 0.05), 0.5, 30);
    },
  },
  mus_taiko: {
    variants: 2,
    gain: 0.75,
    bus: 'music',
    spread: 0.02,
    render(k) {
      const x = k.thump(1.0, 115, 55, 0.18, 0.06);
      k.add(x, k.burst(1.0, 0.0005, 0.03, { lp: 1200 }), 0.4);
      k.add(x, k.modal(1.0, [[180, 0.15, 0.3], [290, 0.08, 0.15]]), 1);
      k.drive(x, 1.5);
      return k.fade(x, 0.5, 60);
    },
  },
  mus_hat: {
    variants: 2,
    gain: 0.36,
    bus: 'music',
    spread: 0.03,
    render(k) {
      return k.burst(0.08, 0.0005, 0.018, { hp: 7000 });
    },
  },
  mus_pluck: {
    rate: 0.5,
    gain: 0.8,
    bus: 'music',
    spread: 0,
    render(k) {
      const d = 0.7;
      const x = k.tone(d, 55, 'saw');
      k.add(x, k.tone(d, 27.5, 'square'), 0.4);
      k.lp(x, sweep(1600, 160, 0.35), 2);
      k.mul(x, k.perc(d, 0.003, 0.18));
      return k.fade(x, 0.5, 40);
    },
  },
  mus_brass: {
    rate: 0.5,
    gain: 0.7,
    bus: 'music',
    priority: 6,
    spread: 0,
    render(k) {
      const d = 3;
      const L = k.out(d);
      const R = k.out(d);
      const notes = [NOTE(-31), NOTE(-24), NOTE(-19), NOTE(-16), NOTE(-13)];
      notes.forEach((f, i) => {
        const s = sawStack(k, d, f, 0.005, curve([[0, 300], [0.35, 2600], [1.4, 1400], [3, 500]]), 1.2);
        k.mul(s, k.env(d, [[0, 0], [0.1, 1], [1.6, 0.8], [3, 0]]));
        k.add(L, s, 0.32 * (i % 2 ? 0.7 : 1));
        k.add(R, s, 0.32 * (i % 2 ? 1 : 0.7));
      });
      // Timpani roll into a hit.
      for (let i = 0; i < 12; i++) {
        const t = 0.05 + i * 0.05;
        const th = k.thump(0.6, 95, 60, 0.12, 0.05);
        k.add(L, th, 0.12 + i * 0.03, t);
        k.add(R, th, 0.12 + i * 0.03, t);
      }
      const boom = k.thump(d, 70, 30, 0.6, 0.2);
      k.add(L, boom, 0.9, 0.65);
      k.add(R, boom, 0.9, 0.65);
      const cym = k.noise(d);
      k.hp(cym, 5000);
      k.mul(cym, k.env(d, [[0, 0], [0.62, 0.6], [0.66, 1], [2.6, 0]]));
      k.add(L, cym, 0.15);
      k.add(R, cym, 0.15);
      k.drive(L, 1.4);
      k.drive(R, 1.4);
      return [k.fade(L, 2, 80), k.fade(R, 2, 80)];
    },
  },
  mus_gameover: {
    rate: 0.5,
    gain: 0.6,
    bus: 'music',
    priority: 6,
    verb: 0.4,
    spread: 0,
    render(k) {
      const d = 7;
      const x = k.out(d);
      const drone = sawStack(k, d, NOTE(-31), 0.004, 380, 0.7);
      k.add(drone, sawStack(k, d, NOTE(-24), 0.004, 380, 0.7), 0.6);
      k.mul(drone, k.env(d, [[0, 0], [1.2, 1], [5.5, 0.8], [7, 0]]));
      k.add(x, drone, 0.18);
      const line = [NOTE(0), NOTE(-4), NOTE(-5), NOTE(-7), NOTE(-9), NOTE(-7)];
      const times = [0.2, 1.1, 1.9, 2.7, 3.6, 4.4];
      const lens = [0.95, 0.85, 0.85, 0.95, 0.9, 2.4];
      line.forEach((f, i) => k.add(x, softNote(k, lens[i], f / 2, 0.08, 0.3), 0.5, times[i]));
      k.add(x, k.thump(2, 50, 30, 0.6, 0.2), 0.5, 4.4);
      k.echo(x, 0.38, 0.3, 3, 1500);
      return k.wide(k.fade(x, 2, 400), 12, 0.35);
    },
  },
  mus_victory: {
    rate: 0.5,
    gain: 0.6,
    bus: 'music',
    priority: 6,
    verb: 0.4,
    spread: 0,
    render(k) {
      const d = 7.5;
      const x = k.out(d);
      const pad = (f: number, at: number, len: number, g: number) => {
        const s = sawStack(k, len, f, 0.005, 1700, 0.7);
        k.mul(s, k.env(len, [[0, 0], [0.5, 1], [len - 1.2, 0.85], [len, 0]]));
        k.add(x, s, g, at);
      };
      // D major → B minor → G → A → D.
      const chords: Array<[number[], number, number]> = [
        [[NOTE(-19), NOTE(-15), NOTE(-12)], 0, 1.8],
        [[NOTE(-22), NOTE(-19), NOTE(-15)], 1.6, 1.6],
        [[NOTE(-26), NOTE(-22), NOTE(-19)], 3.0, 1.4],
        [[NOTE(-24), NOTE(-20), NOTE(-17)], 4.2, 1.2],
        [[NOTE(-19), NOTE(-15), NOTE(-12), NOTE(-7)], 5.2, 2.3],
      ];
      for (const [fs, at, len] of chords) for (const f of fs) pad(f, at, len + 0.4, 0.07);
      const mel: Array<[number, number, number]> = [
        [NOTE(-7), 0.1, 0.4],
        [NOTE(-3), 0.5, 0.4],
        [NOTE(0), 0.9, 0.7],
        [NOTE(5), 1.6, 1.2],
        [NOTE(4), 3.0, 0.6],
        [NOTE(2), 3.6, 0.6],
        [NOTE(0), 4.2, 0.9],
        [NOTE(5), 5.2, 2.2],
      ];
      for (const [f, at, len] of mel) {
        k.add(x, softNote(k, len, f, 0.04, 0.25), 0.32, at);
        const b = k.modal(len, [[f * 2, 0.5, 1], [f * 4, 0.25, 0.3]]);
        k.add(x, b, 0.06, at);
      }
      k.echo(x, 0.33, 0.3, 3, 2500);
      return k.wide(k.fade(x, 2, 500), 12, 0.35);
    },
  },
  mus_swell: {
    rate: 0.5,
    gain: 0.7,
    bus: 'music',
    spread: 0,
    render(k) {
      const d = 2.6;
      const x = k.noise(d);
      k.hp(x, 3000);
      k.mul(x, k.env(d, [[0, 0], [2.0, 1], [2.1, 0]]));
      const pad = sawStack(k, d, NOTE(-31), 0.005, curve([[0, 200], [2, 1500], [2.6, 400]]));
      k.add(pad, sawStack(k, d, NOTE(-24), 0.005, curve([[0, 200], [2, 1500], [2.6, 400]])), 0.7);
      k.mul(pad, k.env(d, [[0, 0], [2.0, 1], [2.6, 0]]));
      k.add(x, pad, 0.25);
      k.add(x, k.thump(0.6, 90, 45, 0.15), 0.6, 2.0);
      return k.wide(x, 10, 0.4);
    },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);
