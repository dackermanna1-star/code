// Knife, grenades, player (steps, hits, voice), world impacts.

import {
  TAU, addTail, addBurst, addTone, addMetal, addScrape, addGrains, mixInto, normalize, softclip, svf, pwl, biquad,
  glottal, white, pink, envBell,
} from './dsp.js';
import { foley } from './weapons.js';
export { foley };

// ------------------------------------------------------------ explosions ---

export function explosion(P, e) {
  const { sr, rng } = P;
  const J = (x, a = 0.08) => rng.jit(x, a);
  const dry = P.arr();
  // initial crack
  addBurst(dry, sr, rng, 0, e.crack ?? 1, { a: 0.0002, tau: J(e.crackTau ?? 0.012), filters: [['highpass', e.crackHP ?? 800, 0.7]] });
  // blast body
  addBurst(dry, sr, rng, 0.0008, e.blast ?? 1.5, {
    a: 0.0015, h: J(e.hold ?? 0.03), tau: J(e.blastTau ?? 0.22), color: 'pink',
    filters: [['lowpass', J(e.blastLP ?? 1400), 0.7], ['peaking', e.blastResF ?? 120, 0.7, 6]],
  });
  // pressure thump
  addTone(dry, sr, 0, { f: J(e.thumpF0 ?? 75, 0.05), f1: e.thumpF1 ?? 28, glide: e.thumpGlide ?? 0.08, tau: J(e.thumpTau ?? 0.35), amp: e.thump ?? 1.4, a: 0.001 });
  // rumble
  if (e.rumble) {
    addBurst(dry, sr, rng, 0.01, e.rumble, {
      color: 'brown', len: e.rumbleLen ?? 2.5,
      env: (t) => (t < 0.05 ? t / 0.05 : 1) * Math.exp(-t / (e.rumbleTau ?? 0.7)) * (0.75 + 0.25 * Math.sin(TAU * 3.1 * t + 1.3) * Math.sin(TAU * 1.3 * t)),
      filters: [['lowpass', e.rumbleLP ?? 350, 0.7]],
    });
  }
  // debris / pebbles
  if (e.debris) {
    addGrains(dry, sr, rng, {
      t0: e.debrisT0 ?? 0.12, span: e.debrisSpan ?? 1.6, count: e.debris, shape: 1.4, dur: [0.0005, 0.004],
      amp: [0.04, e.debrisAmp ?? 0.35], decay: e.debrisDecay ?? 0.7, f: [1200, 7000], q: [1, 4],
    });
  }
  if (e.ring) addMetal(dry, sr, rng, 0.002, { f: e.ringF ?? 1700, amp: e.ring, tau: e.ringTau ?? 0.25, fall: 0.85, noise: 0 });
  softclip(dry, e.drive ?? 2.5);
  addTail(dry, dry, sr, rng, e.tail);
  P.play(dry, P.out);
}

// ------------------------------------------------------------- voice ---

export const V = {
  a: [730, 1090, 2440, 3400],
  uh: [640, 1190, 2390, 3400],
  er: [490, 1350, 1690, 3300],
  o: [570, 840, 2410, 3400],
  u: [320, 870, 2240, 3300],
  ae: [660, 1720, 2410, 3400],
};

/**
 * Abstract formant "grunt": glottal pulse train + breath through four
 * time-varying formant bandpasses. Mixed into `out` at t0, peak-normalised to amp.
 */
export function addGrunt(out, sr, rng, t0, amp, { dur, f0, env, vowels, breath = 0.15, grit = 1.5 }) {
  const n = Math.ceil(dur * sr);
  const f0Fn = pwl(f0);
  const aFn = pwl(env);
  const src = glottal(n, sr, rng, f0Fn, { jitter: 0.03, shimmer: 0.15 });
  normalize(src, 1);
  const br = white(n, rng);
  for (let i = 0; i < n; i++) {
    const a = aFn(i / sr);
    src[i] = (src[i] + br[i] * breath) * a;
  }
  const mix = new Float32Array(n);
  const gains = [1, 0.6, 0.32, 0.16];
  const qs = [5, 8, 11, 12];
  for (let k = 0; k < 4; k++) {
    const fk = pwl(vowels.map(([t, F]) => [t, F[k]]));
    const x = Float32Array.from(src);
    svf(x, sr, 'bp', fk, qs[k]);
    for (let i = 0; i < n; i++) mix[i] += x[i] * gains[k];
  }
  normalize(mix, 1);
  softclip(mix, grit);
  normalize(mix, 1);
  mixInto(out, mix, t0 * sr, amp);
}

// --------------------------------------------------------------- recipes ---

const slash = (P, v) => foley(P, (x, sr, r) => {
  const n = Math.ceil(0.34 * sr);
  const w = pink(n, r);
  const rise = v ? 0.07 : 0.09;
  const fall = v ? 0.15 : 0.18;
  for (let i = 0; i < n; i++) w[i] *= envBell(i / sr, rise, fall);
  const fc = v ? pwl([[0, 650], [rise, 2700], [rise + fall, 900]]) : pwl([[0, 500], [rise, 2200], [rise + fall, 700]]);
  svf(w, sr, 'bp', fc, 1.3);
  normalize(w, 1);
  mixInto(x, w, 0, 1);
  const a = white(n, r);
  for (let i = 0; i < n; i++) a[i] *= envBell(i / sr - 0.02, rise, fall * 0.6);
  svf(a, sr, 'bp', (t) => 4200 + 1800 * Math.sin(Math.min(1, t / (rise + fall)) * Math.PI), 2);
  normalize(a, 1);
  mixInto(x, a, 0, 0.18);
});

const fleshHit = (x, sr, r, { thump = 1, slapLP = 2200, sq = 0.5, sqF = 900, sqTau = 0.035, tick = 0.25, low = 170 } = {}) => {
  addTone(x, sr, 0, { f: r.jit(low, 0.08), f1: low * 0.5, glide: 0.015, tau: 0.03, amp: thump * 0.5, a: 0.0008 });
  addBurst(x, sr, r, 0, 1, { a: 0.0004, tau: r.jit(0.014, 0.15), color: 'pink', filters: [['lowpass', r.jit(slapLP, 0.1), 0.7], ['peaking', r.jit(800, 0.15), 1.5, 6]] });
  const f0 = r.jit(sqF, 0.15);
  addBurst(x, sr, r, 0.002, sq, { a: 0.003, h: 0.008, tau: sqTau, sweep: { mode: 'bp', fc: (t) => f0 * (1 - 0.45 * Math.min(1, t / 0.06)), q: 3 } });
  if (tick) addMetal(x, sr, r, 0, { f: r.jit(3500, 0.1), amp: tick, tau: 0.006, n: 3 });
};

const shellBounce = (x, sr, r, { f = 4200, amps = [1, 0.6, 0.4, 0.22, 0.12], gaps = [0.085, 0.055, 0.035, 0.025], tau = 0.035, brass = true }) => {
  let t = 0;
  amps.forEach((a, i) => {
    if (brass) {
      addMetal(x, sr, r, t, { f: r.jit(f, 0.04), amp: a, tau: tau * (0.7 + 0.3 * a), n: 4, ratios: [1, 1.59, 2.14, 2.83], noise: 0.35, noiseF: 6000, spread: 0.02 });
    } else {
      addBurst(x, sr, r, t, a * 0.8, { a: 0.0003, tau: 0.004, filters: [['bandpass', 1800, 1.5]] });
      addTone(x, sr, t, { f: r.jit(1100, 0.05), tau: 0.012, amp: a * 0.5, phase: r() * TAU });
      addTone(x, sr, t, { f: r.jit(2350, 0.05), tau: 0.008, amp: a * 0.3, phase: r() * TAU });
      addTone(x, sr, t, { f: r.jit(420, 0.05), tau: 0.015, amp: a * 0.45, phase: r() * TAU });
    }
    if (i < gaps.length) t += r.jit(gaps[i], 0.2);
  });
};

export const FOLEY = {
  // ---- knife
  knife_deploy: { dur: 0.75, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.22, { f0: 3000, f1: 6800, q: 4, amp: 0.45, grit: 0.35, rise: 0.25 });
    const ring = { f: 2150, amp: 0.9, tau: 0.22, fall: 0.82, n: 4, ratios: [1, 1.58, 2.71, 3.62], noise: 0.1, spread: 0.01 };
    addMetal(x, sr, r, 0.07, ring);
    addMetal(x, sr, r, 0.07, { ...ring, f: 2150 * 1.006, amp: 0.6 });
  }, 0.1) },
  knife_slash: { dur: 0.36, variants: 2, peak: 0.45, fn: (P, v) => slash(P, v) },
  knife_hit: { dur: 0.35, variants: 4, peak: 0.62, fn: (P) => foley(P, (x, sr, r) => fleshHit(x, sr, r, { sq: r.range(0.35, 0.6) }), 0.08) },
  knife_hitwall: { dur: 0.55, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.002, filters: [['bandpass', 3500, 0.9]] });
    addMetal(x, sr, r, 0, { f: 2600, amp: 0.9, tau: 0.14, fall: 0.8, n: 5, ratios: [1, 1.58, 2.71, 3.62, 4.4], noise: 0.2 });
    addScrape(x, sr, r, 0.008, 0.08, { f0: 5200, f1: 3000, q: 3, amp: 0.25, grit: 0.7 });
    addGrains(x, sr, r, { t0: 0.002, span: 0.05, count: 12, f: [1500, 5000], amp: [0.1, 0.3], decay: 0.03 });
  }, 0.12) },
  knife_stab: { dur: 0.5, peak: 0.7, fn: (P) => foley(P, (x, sr, r) => {
    fleshHit(x, sr, r, { thump: 1.2, slapLP: 1700, sq: 0.6, sqF: 700, sqTau: 0.07, tick: 0.3, low: 130 });
    const pull = new Float32Array(Math.ceil(0.2 * sr));
    fleshHit(pull, sr, r, { thump: 0.2, slapLP: 1200, sq: 1, sqF: 600, sqTau: 0.05, tick: 0 });
    normalize(pull, 1);
    mixInto(x, pull, 0.11 * sr, 0.35);
  }, 0.08) },
  // ---- grenades
  pinpull: { dur: 0.4, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3200, amp: 0.6, tau: 0.02, n: 4 });
    addScrape(x, sr, r, 0.008, 0.04, { f0: 4000, f1: 5200, q: 3, amp: 0.2, grit: 0.5 });
    addTone(x, sr, 0.004, { f: 4800, tau: 0.07, amp: 0.2 });
    addMetal(x, sr, r, 0.11, { f: 2400, amp: 0.7, tau: 0.03, body: 0.3, bodyF: 1100 });
  }, 0.1) },
  grenade_bounce: { dur: 0.35, variants: 2, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: r.jit(640, 0.05), amp: 1, tau: 0.06, fall: 0.75, n: 5, ratios: [1, 1.73, 2.69, 3.92, 5.1], noise: 0.5, noiseF: 2500, body: 0.5, bodyF: 230, bodyTau: 0.025 });
    addBurst(x, sr, r, 0, 0.4, { a: 0.0005, tau: 0.008, color: 'pink', filters: [['lowpass', 1200, 0.7]] });
  }, 0.08) },
  he_explode: { rate: 22050, dur: 3.2, variants: 3, peak: 0.98, fn: (P) => explosion(P, {
    crack: 1, crackTau: 0.014, blast: 1.6, hold: 0.035, blastTau: 0.2, blastLP: 2400, blastResF: 450, thump: 0.75, thumpF0: 85, thumpF1: 40, thumpTau: 0.22,
    rumble: 0.35, rumbleTau: 0.5, rumbleLP: 400, debris: 110, debrisAmp: 0.45, drive: 2.8,
    tail: { tau: 0.6, lp: 2600, lpEnd: 350, pre: 0.01, slaps: [[0.12, 0.5], [0.3, 0.35], [0.55, 0.2], [0.85, 0.1]], wet: 0.5, slapWin: 0.3 },
  }) },
  flashbang_explode: { rate: 22050, dur: 2.0, peak: 0.95, fn: (P) => explosion(P, {
    crack: 1.2, crackTau: 0.02, crackHP: 1500, blast: 1.1, hold: 0.012, blastTau: 0.07, blastLP: 3600, blastResF: 600, thump: 0.5, thumpF0: 120, thumpF1: 55, thumpTau: 0.07,
    ring: 0.35, ringF: 1750, ringTau: 0.25, debris: 0, drive: 3.0,
    tail: { tau: 0.42, lp: 3400, lpEnd: 600, pre: 0.008, slaps: [[0.1, 0.5], [0.24, 0.32], [0.42, 0.16]], wet: 0.5, slapWin: 0.15 },
  }) },
  smoke_explode: { rate: 22050, dur: 3.4, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.7, { a: 0.0004, tau: 0.015, color: 'pink', filters: [['lowpass', 2000, 0.7]] });
    addTone(x, sr, 0, { f: 150, f1: 70, glide: 0.02, tau: 0.04, amp: 0.55 });
    const n = Math.ceil(3.2 * sr);
    const h = white(n, r);
    let flut = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 255) === 0) flut = 0.8 + 0.2 * r();
      const env = Math.min(1, t / 0.09) * (t < 1.4 ? 1 : Math.exp(-(t - 1.4) / 0.55)) * flut * (0.9 + 0.1 * Math.sin(TAU * 7.3 * t));
      h[i] *= env;
    }
    svf(h, sr, 'hp', 1200, 0.7);
    svf(h, sr, 'bp', (t) => 3600 - 700 * Math.min(1, t / 3), 0.7);
    biquad(h, sr, 'lowpass', 7000, 0.7);
    normalize(h, 1);
    mixInto(x, h, 0.02 * sr, 0.5);
  }) },
  // ---- player
  step_sand: { dur: 0.25, variants: 4, peak: 0.36, fn: (P) => foley(P, (x, sr, r) => {
    // heel thud + gravelly granular crunch (heel cluster, then a lighter toe roll)
    addBurst(x, sr, r, 0, 0.8, { a: 0.0015, tau: 0.018, color: 'pink', filters: [['lowpass', 520, 0.7], ['peaking', 220, 1.2, 4]] });
    addBurst(x, sr, r, 0.002, 0.35, { a: 0.004, tau: 0.03, color: 'pink', filters: [['bandpass', r.jit(1100, 0.15), 0.7]] });
    addGrains(x, sr, r, { t0: 0.001, span: 0.11, count: 70, shape: 1.6, dur: [0.0004, 0.0025], amp: [0.15, 1], decay: 0.06, f: [600, 4200], q: [0.8, 2.5] });
    addGrains(x, sr, r, { t0: r.range(0.04, 0.06), span: 0.08, count: 28, shape: 1.3, dur: [0.0003, 0.002], amp: [0.1, 0.5], decay: 0.04, f: [800, 5000], q: [0.8, 2.5] });
  }) },
  step_stone: { dur: 0.18, variants: 4, peak: 0.34, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0002, tau: r.jit(0.004, 0.15), filters: [['bandpass', r.jit(2200, 0.12), 0.9]] });
    addBurst(x, sr, r, 0.0005, 0.6, { a: 0.0008, tau: 0.012, color: 'pink', filters: [['lowpass', 900, 0.7], ['peaking', r.jit(300, 0.1), 2, 6]] });
    addTone(x, sr, 0, { f: r.jit(260, 0.08), tau: 0.018, amp: 0.28, phase: r() * TAU });
    addTone(x, sr, 0, { f: r.jit(1350, 0.08), tau: 0.01, amp: 0.14, phase: r() * TAU });
    addGrains(x, sr, r, { t0: 0.002, span: 0.05, count: 12, f: [2000, 6000], amp: [0.1, 0.35], decay: 0.03 });
    addBurst(x, sr, r, r.range(0.03, 0.04), 0.25, { a: 0.001, tau: 0.01, filters: [['bandpass', 3000, 1]] });
  }, 0.05) },
  step_wood: { dur: 0.3, variants: 4, peak: 0.36, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.7, { a: 0.0002, tau: 0.003, filters: [['bandpass', r.jit(1800, 0.1), 1]] });
    addBurst(x, sr, r, 0, 0.6, { a: 0.0008, tau: 0.015, color: 'pink', filters: [['lowpass', 1200, 0.7]] });
    const base = r.jit(160, 0.08);
    [[1, 1, 0.055], [1.95, 0.6, 0.04], [3.3, 0.4, 0.03], [5.4, 0.22, 0.02]].forEach(([m, a, tau]) => addTone(x, sr, 0, { f: base * m * r.jit(1, 0.03), amp: a * 0.7, tau, phase: r() * TAU, a: 0.0005 }));
    addBurst(x, sr, r, r.range(0.028, 0.04), 0.2, { a: 0.0005, tau: 0.008, filters: [['bandpass', 1400, 1.2]] });
  }) },
  step_metal: { dur: 0.32, variants: 4, peak: 0.32, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.7, { a: 0.0002, tau: 0.003, filters: [['bandpass', 3000, 0.9]] });
    addMetal(x, sr, r, 0, { f: r.jit(520, 0.08), amp: 1, tau: 0.075, fall: 0.85, n: 6, ratios: [1, 1.71, 2.43, 3.67, 5.1, 6.3], noise: 0.4, noiseF: 2500, spread: 0.03 });
    addTone(x, sr, 0, { f: r.jit(150, 0.1), tau: 0.03, amp: 0.4, a: 0.0008 });
    addGrains(x, sr, r, { t0: 0.01, span: 0.06, count: 10, f: [1500, 5000], amp: [0.05, 0.2], decay: 0.05 });
  }, 0.06) },
  land: { dur: 0.35, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 150, f1: 70, glide: 0.025, tau: 0.04, amp: 0.5, a: 0.001 });
    addBurst(x, sr, r, 0, 0.7, { a: 0.0015, tau: 0.035, color: 'pink', filters: [['lowpass', 900, 0.7], ['peaking', 350, 1, 4]] });
    addGrains(x, sr, r, { t0: 0.001, span: 0.12, count: 70, shape: 1.6, dur: [0.0004, 0.0025], amp: [0.1, 0.7], decay: 0.06, f: [900, 5000], q: [0.8, 2.5] });
    addGrains(x, sr, r, { t0: 0.025, span: 0.1, count: 40, shape: 1.6, dur: [0.0004, 0.0025], amp: [0.1, 0.5], decay: 0.05, f: [900, 5000], q: [0.8, 2.5] });
    addMetal(x, sr, r, 0.03, { f: 3300, amp: 0.2, tau: 0.008, n: 3 });
    addMetal(x, sr, r, 0.065, { f: 4100, amp: 0.15, tau: 0.006, n: 3 });
  }) },
  jump: { dur: 0.22, peak: 0.2, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0, 0.14, { f0: 800, f1: 1900, q: 0.9, amp: 0.6, grit: 0.3, color: 'pink', rise: 0.45 });
    addMetal(x, sr, r, 0.025, { f: 3800, amp: 0.25, tau: 0.007, n: 3 });
    addMetal(x, sr, r, 0.07, { f: 3100, amp: 0.15, tau: 0.006, n: 3 });
  }) },
  hit_flesh: { dur: 0.25, variants: 3, peak: 0.65, fn: (P) => foley(P, (x, sr, r) => {
    fleshHit(x, sr, r, { thump: 1, slapLP: 2800, sq: r.range(0.3, 0.5), sqTau: 0.025, tick: 0, low: 180 });
    addGrains(x, sr, r, { t0: 0.001, span: 0.04, count: 10, f: [1500, 4000], amp: [0.1, 0.3], decay: 0.02 });
  }) },
  hit_kevlar: { dur: 0.22, variants: 2, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: r.jit(190, 0.06), f1: 100, glide: 0.015, tau: 0.025, amp: 0.45, a: 0.0006 });
    addBurst(x, sr, r, 0, 1, { a: 0.0002, tau: 0.006, filters: [['bandpass', r.jit(1800, 0.1), 1]] });
    addBurst(x, sr, r, 0, 0.5, { a: 0.001, tau: 0.025, color: 'pink', filters: [['lowpass', 700, 0.7], ['peaking', 400, 1.5, 4]] });
    addGrains(x, sr, r, { t0: 0.001, span: 0.045, count: 25, f: [2500, 7000], amp: [0.1, 0.4], decay: 0.025, q: [0.7, 1.5] });
  }) },
  headshot: { dur: 0.5, peak: 0.75, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.004, filters: [['bandpass', 3500, 0.8]] });
    addMetal(x, sr, r, 0, { f: 2900, amp: 1.1, tau: 0.12, fall: 0.8, n: 5, ratios: [1, 1.38, 1.93, 2.51, 3.12], noise: 0.6, noiseF: 5000, spread: 0.01 });
    addTone(x, sr, 0, { f: 200, f1: 100, glide: 0.02, tau: 0.02, amp: 0.4 });
  }, 0.08) },
  die: { rate: 22050, dur: 0.75, variants: 3, peak: 0.4, fn: (P, v) => foley(P, (x, sr, r) => {
    const d = [
      { dur: 0.62, f0: [[0, 130], [0.05, 160], [0.25, 125], [0.5, 82], [0.62, 70]], env: [[0, 0], [0.025, 1], [0.3, 0.8], [0.5, 0.35], [0.62, 0]], vowels: [[0, V.uh], [0.2, V.a], [0.45, V.o], [0.62, V.u]], breath: 0.12 },
      { dur: 0.56, f0: [[0, 190], [0.06, 215], [0.3, 150], [0.56, 95]], env: [[0, 0], [0.02, 1], [0.25, 0.85], [0.45, 0.3], [0.56, 0]], vowels: [[0, V.ae], [0.12, V.a], [0.4, V.uh], [0.56, V.er]], breath: 0.1 },
      { dur: 0.46, f0: [[0, 155], [0.04, 172], [0.2, 115], [0.4, 85]], env: [[0, 0], [0.015, 1], [0.12, 0.9], [0.28, 0.4], [0.46, 0]], vowels: [[0, V.er], [0.15, V.uh], [0.4, V.o]], breath: 0.25 },
    ][v % 3];
    addGrunt(x, sr, r, 0.005, 1, d);
    if (v === 2) addBurst(x, sr, r, 0.42, 0.25, { a: 0.03, h: 0.05, tau: 0.06, filters: [['bandpass', 1500, 0.6]] });
  }, 0.08) },
  // a hostage answering a CT ("okay" / "let's go"): two quick voiced syllables
  hostage_use: { rate: 22050, dur: 0.55, variants: 2, peak: 0.4, fn: (P, v) => foley(P, (x, sr, r) => {
    const d = [
      { dur: 0.42, f0: [[0, 170], [0.12, 190], [0.2, 150], [0.32, 205], [0.42, 160]], env: [[0, 0], [0.02, 0.9], [0.13, 0.7], [0.18, 0.15], [0.22, 1], [0.36, 0.6], [0.42, 0]], vowels: [[0, V.o], [0.16, V.o], [0.22, V.ae], [0.42, V.er]], breath: 0.18 },
      { dur: 0.48, f0: [[0, 200], [0.1, 220], [0.22, 175], [0.3, 195], [0.48, 140]], env: [[0, 0], [0.02, 1], [0.15, 0.6], [0.2, 0.2], [0.25, 0.9], [0.4, 0.5], [0.48, 0]], vowels: [[0, V.ae], [0.18, V.uh], [0.24, V.o], [0.48, V.u]], breath: 0.15 },
    ][v % 2];
    addGrunt(x, sr, r, 0.005, 1, d);
  }, 0.06) },
  pain: { rate: 22050, dur: 0.32, variants: 2, peak: 0.36, fn: (P, v) => foley(P, (x, sr, r) => {
    const d = [
      { dur: 0.25, f0: [[0, 200], [0.04, 222], [0.2, 160]], env: [[0, 0], [0.012, 1], [0.1, 0.8], [0.25, 0]], vowels: [[0, V.uh], [0.25, V.er]], breath: 0.15 },
      { dur: 0.27, f0: [[0, 230], [0.05, 248], [0.22, 175]], env: [[0, 0], [0.012, 1], [0.12, 0.75], [0.27, 0]], vowels: [[0, V.a], [0.27, V.uh]], breath: 0.15 },
    ][v % 2];
    addGrunt(x, sr, r, 0.003, 1, d);
  }, 0.06) },
  fall_damage: { rate: 22050, dur: 0.45, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 95, f1: 48, glide: 0.03, tau: 0.06, amp: 1, a: 0.001 });
    addBurst(x, sr, r, 0, 0.8, { a: 0.001, tau: 0.03, color: 'pink', filters: [['lowpass', 600, 0.7]] });
    addGrains(x, sr, r, { t0: 0.001, span: 0.06, count: 30, f: [800, 4000], amp: [0.1, 0.5], decay: 0.03 });
    addGrunt(x, sr, r, 0.03, 0.7, { dur: 0.3, f0: [[0, 175], [0.05, 188], [0.28, 120]], env: [[0, 0], [0.015, 1], [0.12, 0.8], [0.3, 0]], vowels: [[0, V.o], [0.15, V.u], [0.3, V.u]], breath: 0.2 });
  }, 0.06) },
  // ---- world
  ric: { dur: 0.5, variants: 5, peak: 0.52, fn: (P, v) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: r.jit(0.003, 0.2), filters: [['bandpass', r.jit(3000, 0.15), 0.8]] });
    addMetal(x, sr, r, 0, { f: r.range(2500, 3800), amp: 0.5, tau: 0.006, n: 3 });
    addGrains(x, sr, r, { t0: 0.001, span: 0.08, count: 15, f: [1500, 5000], amp: [0.1, 0.3], decay: 0.04 });
    if (v === 1 || v === 2 || v === 4) {
      const f = r.range(4200, 5800);
      const f1 = r.range(1700, 2600);
      const glide = r.range(0.14, 0.26);
      const tau = r.range(0.12, 0.2);
      const vibF = r.range(30, 60);
      addTone(x, sr, 0.004, { f, f1, glide, tau, a: 0.006, amp: 0.45, vib: 0.015, vibF });
      addTone(x, sr, 0.004, { f: f * 1.5, f1: f1 * 1.5, glide, tau: tau * 0.6, a: 0.006, amp: 0.12, vib: 0.015, vibF });
    } else {
      addMetal(x, sr, r, 0.001, { f: r.range(3000, 4200), amp: 0.7, tau: 0.04, n: 4, noise: 0.2 });
    }
  }, 0.08) },
  impact_sand: { dur: 0.38, variants: 3, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0005, h: 0.003, tau: r.jit(0.03, 0.15), color: 'pink', filters: [['lowpass', r.jit(2200, 0.1), 0.7], ['peaking', 700, 1, 4]] });
    addTone(x, sr, 0, { f: 120, f1: 60, glide: 0.02, tau: 0.03, amp: 0.5 });
    addGrains(x, sr, r, { t0: 0.005, span: 0.28, count: 55, shape: 1.8, dur: [0.0003, 0.0015], f: [2000, 8000], amp: [0.05, 0.25], decay: 0.12 });
  }) },
  impact_wood: { dur: 0.3, variants: 3, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.004, filters: [['bandpass', r.jit(2800, 0.1), 1]] });
    const b = r.jit(380, 0.08);
    [[1, 0.7, 0.03], [2, 0.45, 0.02], [3.7, 0.3, 0.012], [5.8, 0.2, 0.008]].forEach(([m, a, tau]) => addTone(x, sr, 0, { f: b * m * r.jit(1, 0.03), amp: a, tau, phase: r() * TAU, a: 0.0003 }));
    addGrains(x, sr, r, { t0: 0.001, span: 0.06, count: 20, f: [2000, 6000], amp: [0.1, 0.4], decay: 0.03 });
  }, 0.06) },
  impact_metal: { dur: 0.55, variants: 3, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.002, filters: [['bandpass', 4000, 0.9]] });
    addMetal(x, sr, r, 0, { f: r.range(1300, 1800), amp: 0.9, tau: 0.14, fall: 0.75, n: 6, ratios: [1, 1.58, 2.31, 2.97, 3.84, 4.65], noise: 0.3 });
  }, 0.08) },
  glass: { dur: 0.8, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.8, { a: 0.0002, tau: 0.04, filters: [['highpass', 2500, 0.7]] });
    for (let i = 0; i < 40; i++) {
      const t = Math.pow(r(), 2) * 0.5;
      addTone(x, sr, t, { f: r.logRange(2500, 9000), tau: r.range(0.01, 0.05), amp: r.range(0.1, 0.6) * Math.exp(-t / 0.2), phase: r() * TAU, a: 0.0001 });
    }
    addGrains(x, sr, r, { t0: 0.002, span: 0.4, count: 40, shape: 2, f: [3000, 9000], amp: [0.05, 0.3], decay: 0.15 });
  }, 0.08) },
  shell: { dur: 0.45, variants: 3, peak: 0.26, fn: (P) => foley(P, (x, sr, r) => shellBounce(x, sr, r, { f: r.range(3900, 4700) })) },
  shotgun_shell: { dur: 0.45, peak: 0.26, fn: (P) => foley(P, (x, sr, r) => shellBounce(x, sr, r, { amps: [1, 0.5, 0.3, 0.15], gaps: [0.1, 0.07, 0.05], brass: false })) },
  ammo_pickup: { dur: 0.25, peak: 0.48, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3200, amp: 0.8, tau: 0.01, body: 0.5, bodyF: 700, bodyTau: 0.015 });
    addMetal(x, sr, r, 0.055, { f: 2600, amp: 1, tau: 0.014, body: 0.6, bodyF: 520, bodyTau: 0.02 });
    addGrains(x, sr, r, { t0: 0.06, span: 0.09, count: 10, f: [3000, 6000], amp: [0.05, 0.2], decay: 0.04 });
  }, 0.08) },
  defuser_on: { dur: 0.3, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0, 0.12, { f0: 1200, f1: 2000, q: 0.9, amp: 0.45, grit: 0.4, color: 'pink' });
    addMetal(x, sr, r, 0.05, { f: 3800, amp: 0.5, tau: 0.01 });
    addMetal(x, sr, r, 0.09, { f: 2900, amp: 0.7, tau: 0.012, body: 0.3, bodyF: 800 });
    addMetal(x, sr, r, 0.13, { f: 4600, amp: 0.4, tau: 0.008 });
  }, 0.08) },
  // ---- zombie survival: rough, breathy formant voices
  zombie_idle: { rate: 22050, dur: 1.7, variants: 4, peak: 0.42, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = [78, 92, 70, 100][v % 4];
    const d = r.range(1.1, 1.6);
    addGrunt(x, sr, r, 0.02, 1, {
      dur: d,
      f0: [[0, f * 0.9], [d * 0.25, f * 1.15], [d * 0.6, f], [d, f * 0.7]],
      env: [[0, 0], [0.12, 0.8], [d * 0.4, 1], [d * 0.75, 0.6], [d, 0]],
      vowels: v % 2 ? [[0, V.uh], [d * 0.4, V.a], [d, V.o]] : [[0, V.u], [d * 0.3, V.o], [d * 0.6, V.uh], [d, V.er]],
      breath: 0.45, grit: 5,
    });
  }, 0.1) },
  zombie_attack: { rate: 22050, dur: 0.75, variants: 3, peak: 0.5, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = [115, 130, 100][v % 3];
    addGrunt(x, sr, r, 0.01, 1, {
      dur: 0.6, f0: [[0, f], [0.06, f * 1.45], [0.3, f * 1.25], [0.6, f * 0.8]],
      env: [[0, 0], [0.03, 1], [0.35, 0.9], [0.6, 0]],
      vowels: [[0, V.ae], [0.15, V.a], [0.6, V.uh]], breath: 0.7, grit: 8,
    });
  }, 0.08) },
  zombie_pain: { rate: 22050, dur: 0.45, variants: 2, peak: 0.42, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = [120, 105][v % 2];
    addGrunt(x, sr, r, 0.005, 1, {
      dur: 0.38, f0: [[0, f], [0.05, f * 1.25], [0.38, f * 0.75]],
      env: [[0, 0], [0.015, 1], [0.15, 0.8], [0.38, 0]],
      vowels: [[0, V.a], [0.38, V.uh]], breath: 0.5, grit: 6,
    });
  }, 0.06) },
  zombie_die: { rate: 22050, dur: 1.1, variants: 2, peak: 0.48, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = [125, 105][v % 2];
    addGrunt(x, sr, r, 0.005, 1, {
      dur: 0.95, f0: [[0, f], [0.1, f * 0.9], [0.6, f * 0.58], [0.95, f * 0.42]],
      // a wet, broken-up gurgle
      env: [[0, 0], [0.04, 1], [0.2, 0.55], [0.25, 0.9], [0.4, 0.45], [0.45, 0.75], [0.6, 0.3], [0.66, 0.5], [0.95, 0]],
      vowels: [[0, V.uh], [0.3, V.o], [0.95, V.u]], breath: 0.6, grit: 6,
    });
  }, 0.1) },
  zombie_wave: { rate: 22050, dur: 2.6, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 55, f1: 41, glide: 1.6, tau: 1.0, amp: 1, a: 0.01 });
    addTone(x, sr, 0, { f: 82.5, f1: 61, glide: 1.6, tau: 0.8, amp: 0.5, a: 0.01 });
    addBurst(x, sr, r, 0, 0.6, { a: 0.3, tau: 0.8, color: 'pink', filters: [['lowpass', 400, 0.7]] });
    addGrunt(x, sr, r, 0.5, 0.5, { dur: 1.8, f0: [[0, 70], [0.6, 85], [1.8, 55]], env: [[0, 0], [0.4, 1], [1.2, 0.7], [1.8, 0]], vowels: [[0, V.u], [0.8, V.o], [1.8, V.u]], breath: 0.5, grit: 4 });
  }, 0.35) },
};
