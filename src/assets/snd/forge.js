// Zombie survival Milestone 3 sounds: the weapon forge (zforge.js): the forge hammer, a tier up, elemental procs (fire, shock, cryo, blast, drain).
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// list every name in your SOUND_GROUPS line in recipes.js too (the bank, the preview tool).
//  - buying: forge_hammer (two hammer blows on the anvil and the quench hiss: Tiers I-IV),
//    forge_tier5 (the same with a deep boom and a rising shimmer: Tier V), forge_round (a round
//    type loaded: a canister clacks home and hums up)
//  - procs, at the zombie hit: forge_ignite (a fuel whoomph), forge_shock (a short crackling
//    zap), forge_chill (ice crackle), forge_freeze (crystals growing over a body), forge_shatter
//    (a frozen one breaking up as it dies), forge_blast (a small, dry explosion), forge_siphon
//    (blood drawn back to the shooter: a rising suck and a pulse)
import { TAU, addBurst, addTone, addMetal, addGrains, addScrape } from './dsp.js';
import { foley } from './weapons.js';
import { explosion } from './foley.js';

// glassy partials scattered over [t0, t0 + span] (ice, crystals)
function glassy(x, sr, r, t0, span, count, amp, f0 = 2500, f1 = 9000, shape = 2) {
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.pow(r(), shape) * span;
    addTone(x, sr, t, { f: r.logRange(f0, f1), tau: r.range(0.01, 0.06), amp: amp * r.range(0.2, 1) * Math.exp(-(t - t0) / Math.max(0.05, span)), phase: r() * TAU, a: 0.0001 });
  }
}

// one hammer blow on the anvil: a bright strike, the anvil's ring and the thud of the block
function anvil(x, sr, r, t0, amp) {
  addBurst(x, sr, r, t0, 0.8 * amp, { a: 0.0001, tau: 0.003, filters: [['highpass', 1800, 0.7]] });
  addMetal(x, sr, r, t0, { f: r.jit(1180, 0.04), amp, tau: 0.42, fall: 0.86, n: 6, ratios: [1, 2.32, 2.71, 3.9, 5.12, 6.3], noise: 0.4, body: 0.8, bodyF: 210, bodyTau: 0.09 });
  addTone(x, sr, t0, { f: 95, f1: 60, glide: 0.04, tau: 0.08, amp: 0.5 * amp, a: 0.0008 });
}

export const FORGE_FX = {
  forge_hammer: { dur: 1.5, variants: 2, peak: 0.6, attn: 'none', jitter: 0.02, fn: (P, v) => foley(P, (x, sr, r) => {
    anvil(x, sr, r, 0, 1);
    anvil(x, sr, r, v ? 0.24 : 0.27, 0.8);
    // the quench: a hiss of steam that dies away
    addBurst(x, sr, r, 0.52, 0.55, { a: 0.03, h: 0.05, tau: 0.32, color: 'white', filters: [['highpass', 2600, 0.7], ['peaking', 5200, 1, 5]] });
    addGrains(x, sr, r, { t0: 0.52, span: 0.6, count: 26, f: [3000, 8000], amp: [0.03, 0.15], decay: 0.3 });
  }, 0.12) },
  forge_tier5: { dur: 2.6, peak: 0.72, attn: 'none', jitter: 0, fn: (P) => foley(P, (x, sr, r) => {
    anvil(x, sr, r, 0, 1);
    anvil(x, sr, r, 0.22, 0.9);
    anvil(x, sr, r, 0.42, 1.1);
    addTone(x, sr, 0.42, { f: 70, f1: 34, glide: 0.25, tau: 0.6, amp: 1, a: 0.002 }); // the boom
    addBurst(x, sr, r, 0.42, 0.7, { a: 0.002, tau: 0.25, color: 'brown', filters: [['lowpass', 300, 0.7]] });
    // a rising shimmer: the metal glowing up (detuned pairs gliding up an octave)
    for (const [f, d] of [[440, 1.004], [660, 0.996], [880, 1.006], [1320, 0.994]]) {
      addTone(x, sr, 0.5, { f: f * d, f1: f * 2 * d, glide: 0.5, tau: 0.7, amp: 0.16, a: 0.25, vib: 0.004, vibF: 5 });
    }
    addBurst(x, sr, r, 0.7, 0.45, { a: 0.05, h: 0.1, tau: 0.5, color: 'white', filters: [['highpass', 3000, 0.7]] });
  }, 0.2) },
  forge_round: { dur: 1.0, peak: 0.55, attn: 'none', jitter: 0.02, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 2900, amp: 0.8, tau: 0.02, body: 0.6, bodyF: 640, bodyTau: 0.025 }); // the canister goes in
    addMetal(x, sr, r, 0.11, { f: 2300, amp: 1, tau: 0.03, body: 0.8, bodyF: 480, bodyTau: 0.03 }); // ...and locks
    addTone(x, sr, 0.16, { f: 220, f1: 660, glide: 0.18, tau: 0.35, amp: 0.4, a: 0.03, vib: 0.01, vibF: 9 }); // it hums up
    addTone(x, sr, 0.16, { f: 330, f1: 990, glide: 0.18, tau: 0.3, amp: 0.18, a: 0.03 });
    addScrape(x, sr, r, 0.15, 0.3, { f0: 1500, f1: 5000, q: 1.2, amp: 0.2, grit: 0.2, color: 'pink' });
  }, 0.1) },
  forge_ignite: { rate: 22050, dur: 0.7, variants: 3, peak: 0.6, jitter: 0.05, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.012, h: 0.02, tau: 0.09, color: 'pink', sweep: { mode: 'bp', fc: (t) => 280 + 2400 * Math.min(1, t / 0.08), q: 0.8 } });
    addTone(x, sr, 0, { f: r.jit(120, 0.1), f1: 55, glide: 0.06, tau: 0.08, amp: 0.55, a: 0.002 });
    addGrains(x, sr, r, { t0: 0.04, span: 0.45, count: 28, f: [1500, 7000], amp: [0.05, 0.35], decay: 0.25 });
  }, 0.06) },
  forge_shock: { rate: 22050, dur: 0.55, variants: 3, peak: 0.55, jitter: 0.05, fn: (P) => foley(P, (x, sr, r) => {
    const buzz = r.range(700, 1100);
    addBurst(x, sr, r, 0, 1, { a: 0.0003, tau: 0.06, filters: [['highpass', 1600, 0.7]], env: (t) => (0.55 + 0.45 * Math.sign(Math.sin(t * buzz))) * Math.exp(-t / 0.06) });
    addTone(x, sr, 0, { f: r.jit(3200, 0.1), f1: 700, glide: 0.04, tau: 0.06, amp: 0.4 });
    addTone(x, sr, 0, { f: 140, f1: 80, glide: 0.04, tau: 0.05, amp: 0.35 });
    addGrains(x, sr, r, { t0: 0, span: 0.28, count: 45, f: [2000, 8000], amp: [0.1, 0.6], decay: 0.12, dur: [0.0003, 0.0015] });
  }, 0.05) },
  forge_chill: { rate: 22050, dur: 0.5, variants: 3, peak: 0.42, jitter: 0.06, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.6, { a: 0.004, tau: 0.05, filters: [['highpass', 3500, 0.7]] }); // a cold breath
    addGrains(x, sr, r, { t0: 0, span: 0.25, count: 30, f: [3500, 9000], amp: [0.08, 0.5], decay: 0.1, dur: [0.0003, 0.0012] }); // ice crackle
    glassy(x, sr, r, 0.01, 0.2, 8, 0.35, 3000, 8000);
  }, 0.05) },
  forge_freeze: { rate: 22050, dur: 1.1, variants: 2, peak: 0.6, jitter: 0.03, fn: (P) => foley(P, (x, sr, r) => {
    // the crystals race over it: crackle rising in density, a glassy cluster, a low creak of the ice setting
    addGrains(x, sr, r, { t0: 0, span: 0.45, count: 80, shape: 0.6, f: [2500, 9000], amp: [0.08, 0.55], decay: 1, dur: [0.0003, 0.0015] });
    glassy(x, sr, r, 0.05, 0.45, 18, 0.5, 2200, 9000, 1);
    addBurst(x, sr, r, 0, 0.5, { a: 0.18, tau: 0.08, filters: [['highpass', 2500, 0.7]] });
    addTone(x, sr, 0.08, { f: 160, f1: 110, glide: 0.3, tau: 0.25, amp: 0.3, a: 0.05, vib: 0.03, vibF: 23 });
    addMetal(x, sr, r, 0.42, { f: 4300, amp: 0.45, tau: 0.09, n: 4, noise: 0.1 }); // ...set
  }, 0.12) },
  forge_shatter: { rate: 22050, dur: 1.0, variants: 2, peak: 0.62, jitter: 0.04, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.9, { a: 0.0002, tau: 0.03, filters: [['highpass', 2200, 0.7]] });
    addTone(x, sr, 0, { f: 180, f1: 70, glide: 0.05, tau: 0.07, amp: 0.45 }); // the body gives
    glassy(x, sr, r, 0, 0.55, 46, 0.55, 2000, 9500);
    addGrains(x, sr, r, { t0: 0.01, span: 0.6, count: 50, shape: 2, f: [2500, 9000], amp: [0.05, 0.35], decay: 0.25 });
  }, 0.1) },
  forge_blast: { rate: 22050, dur: 1.0, variants: 3, peak: 0.7, jitter: 0.04, fn: (P) => explosion(P, {
    crack: 0.9, crackTau: 0.006, crackHP: 1200, blast: 1.1, hold: 0.008, blastTau: 0.07, blastLP: 2200, blastResF: 180,
    thumpF0: 120, thumpF1: 45, thumpGlide: 0.04, thumpTau: 0.12, thump: 0.9, debris: 18, debrisT0: 0.04, debrisSpan: 0.4, debrisAmp: 0.2, debrisDecay: 0.2,
    drive: 2, tail: { tau: 0.12, lp: 3500, lpEnd: 900, wet: 0.18, slaps: [] },
  }) },
  forge_siphon: { rate: 22050, dur: 0.75, variants: 2, peak: 0.5, jitter: 0.05, fn: (P) => foley(P, (x, sr, r) => {
    // drawn in: a swell that rises and is cut off (a reversed breath), a wet pull, then a pulse
    addBurst(x, sr, r, 0, 0.8, { len: 0.32, color: 'pink', env: (t) => Math.pow(Math.min(1, t / 0.3), 2.2) * (t < 0.3 ? 1 : 0), sweep: { mode: 'bp', fc: (t) => 350 + 1500 * Math.min(1, t / 0.3), q: 1.6 } });
    addTone(x, sr, 0.05, { f: 420, f1: 180, glide: 0.12, tau: 0.12, amp: 0.25, a: 0.08 });
    addTone(x, sr, 0.32, { f: 62, f1: 44, glide: 0.04, tau: 0.07, amp: 0.8, a: 0.003 }); // the pulse
    addTone(x, sr, 0.46, { f: 58, f1: 42, glide: 0.04, tau: 0.06, amp: 0.45, a: 0.003 });
  }, 0.06) },
};
