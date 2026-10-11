// Zombie survival sounds: fire, the flamethrower, the launchers, gore and the bosses'
// voices. Same synthesis kit as the rest of the bank (dsp.js, the formant grunt).
import { TAU, addBurst, addTone, addMetal, addScrape, addGrains, svf, pwl, white } from './dsp.js';
import { foley, explosion, addGrunt, V } from './foley.js';

// pitch points with a vibrato: [[t, f], ...]
function vib(f0, f1, dur, depth = 0.04, rate = 6, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const f = f0 + (f1 - f0) * (i / n);
    pts.push([t, f * (1 + depth * Math.sin(TAU * rate * t))]);
  }
  return pts;
}

// wet, meaty burst (gibs, splats)
function squelch(x, sr, r, t0, amp) {
  addBurst(x, sr, r, t0, amp, { a: 0.002, tau: r.range(0.04, 0.08), color: 'pink', filters: [['lowpass', r.range(700, 1300), 0.8], ['peaking', 350, 1.2, 6]] });
  addTone(x, sr, t0, { f: r.range(110, 170), f1: 60, glide: 0.03, tau: 0.05, amp: amp * 0.6 });
  addGrains(x, sr, r, { t0, span: 0.12, count: 14, f: [400, 2200], amp: [0.1, 0.4 * amp], decay: 0.08, dur: [0.002, 0.008], q: [1, 3] });
}

// the noise of fire: low roar + crackle (env: t -> 0..1)
function roar(x, sr, r, t0, len, amp, lp = 800, env = () => 1) {
  addBurst(x, sr, r, t0, amp, { len, color: 'brown', env: (t) => env(t) * (0.8 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)), filters: [['lowpass', lp, 0.7]] });
  addBurst(x, sr, r, t0, amp * 0.35, { len, color: 'pink', env: (t) => env(t) * (0.7 + 0.3 * Math.sin(t * 11.7)), filters: [['bandpass', 1600, 0.8]] });
}

export const ZOMBIE_FX = {
  // ---- medkit
  medkit_use: { rate: 22050, dur: 1.5, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.02, 0.22, { f0: 2400, f1: 4200, q: 3, amp: 0.55, grit: 1 }); // zip
    for (let i = 0; i < 9; i++) addMetal(x, sr, r, 0.03 + i * 0.022, { f: r.range(3500, 5200), amp: 0.12, tau: 0.003, n: 2, noise: 0.3 });
    addBurst(x, sr, r, 0.3, 0.35, { a: 0.02, tau: 0.12, color: 'pink', filters: [['bandpass', 1400, 0.8]] }); // rustle
    addMetal(x, sr, r, 0.74, { f: 2200, amp: 0.7, tau: 0.01, body: 0.5, bodyF: 600 }); // injector click
    addBurst(x, sr, r, 0.76, 0.3, { a: 0.01, tau: 0.25, color: 'white', filters: [['highpass', 4000, 0.7]] }); // hiss
    addTone(x, sr, 0.75, { f: 140, f1: 90, glide: 0.05, tau: 0.06, amp: 0.4 });
  }, 0.1) },
  medkit_heal: { rate: 22050, dur: 1.0, peak: 0.4, fn: (P) => foley(P, (x, sr, r) => {
    [523, 659, 784].forEach((f, i) => addTone(x, sr, i * 0.07, { f, tau: 0.22, amp: 0.5, a: 0.01 }));
    addBurst(x, sr, r, 0.05, 0.25, { a: 0.08, tau: 0.3, color: 'pink', filters: [['bandpass', 900, 0.6]] }); // breath out
  }, 0.1) },
  // ---- fire
  fire_loop: { rate: 22050, dur: 4, loop: 0.8, rms: 0.1, fn: (P) => foley(P, (x, sr, r) => {
    roar(x, sr, r, 0, 4.8, 0.7, 700);
    addGrains(x, sr, r, { t0: 0, span: 4.8, shape: 1, count: 260, f: [1200, 7000], amp: [0.05, 0.6], decay: 1000, dur: [0.0004, 0.003] });
  }) },
  fire_ignite: { rate: 22050, dur: 1.4, peak: 0.8, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.04, h: 0.08, tau: 0.3, color: 'pink', sweep: { mode: 'bp', fc: (t) => 300 + 2200 * Math.min(1, t / 0.25), q: 0.8 } });
    addTone(x, sr, 0, { f: 90, f1: 45, glide: 0.2, tau: 0.25, amp: 0.6 });
    addGrains(x, sr, r, { t0: 0.1, span: 1.1, count: 60, f: [1500, 7000], amp: [0.05, 0.4], decay: 0.6 });
  }, 0.15) },
  lighter: { rate: 22050, dur: 0.6, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 4200, amp: 0.8, tau: 0.008, body: 0.4, bodyF: 1400 });
    addScrape(x, sr, r, 0.05, 0.05, { f0: 3000, f1: 5000, q: 2, amp: 0.4, grit: 0.9 });
    addBurst(x, sr, r, 0.09, 0.5, { a: 0.02, tau: 0.15, color: 'pink', filters: [['bandpass', 900, 0.7]] });
  }, 0.08) },
  molotov_break: { rate: 22050, dur: 1.6, peak: 0.9, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: r.range(3200, 4200), amp: 0.7, tau: 0.04, n: 5, noise: 0.4, noiseF: 6000 });
    addGrains(x, sr, r, { t0: 0, span: 0.35, count: 90, shape: 2, f: [3000, 9500], amp: [0.1, 0.8], decay: 0.15, q: [3, 8] });
    addBurst(x, sr, r, 0.04, 1, { a: 0.03, h: 0.1, tau: 0.35, color: 'pink', sweep: { mode: 'bp', fc: (t) => 400 + 2400 * Math.min(1, t / 0.2), q: 0.7 } });
    addTone(x, sr, 0.04, { f: 80, f1: 40, glide: 0.2, tau: 0.3, amp: 0.7 });
  }, 0.2) },
  acid_loop: { rate: 22050, dur: 3, loop: 0.6, rms: 0.06, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.3, { len: 3.6, color: 'white', env: (t) => 0.8 + 0.2 * Math.sin(t * 5), filters: [['highpass', 3500, 0.7]] });
    for (let i = 0; i < 70; i++) addTone(x, sr, r.range(0, 3.5), { f: r.range(180, 700), f1: r.range(400, 1200), glide: 0.01, tau: 0.015, amp: r.range(0.2, 0.6) });
  }) },
  acid_splash: { rate: 22050, dur: 1.2, peak: 0.75, fn: (P) => foley(P, (x, sr, r) => {
    squelch(x, sr, r, 0, 1);
    addBurst(x, sr, r, 0.03, 0.5, { a: 0.02, tau: 0.6, color: 'white', filters: [['highpass', 3000, 0.7]] });
    for (let i = 0; i < 25; i++) addTone(x, sr, r.range(0.02, 0.8), { f: r.range(200, 600), f1: r.range(500, 1200), glide: 0.01, tau: 0.012, amp: 0.4 });
  }, 0.1) },
  // ---- flamethrower
  flame_loop: { rate: 22050, dur: 3, loop: 0.6, rms: 0.13, fn: (P) => foley(P, (x, sr, r) => {
    roar(x, sr, r, 0, 3.6, 0.8, 1100, (t) => 0.85 + 0.15 * Math.sin(TAU * 13 * t));
    addBurst(x, sr, r, 0, 0.4, { len: 3.6, color: 'pink', env: () => 1, filters: [['bandpass', 3800, 1.2]] }); // gas hiss
    addGrains(x, sr, r, { t0: 0, span: 3.6, shape: 1, count: 160, f: [1500, 6000], amp: [0.05, 0.35], decay: 1000 });
  }) },
  flame_start: { rate: 22050, dur: 0.6, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3600, amp: 0.6, tau: 0.01, body: 0.4, bodyF: 900 });
    addBurst(x, sr, r, 0.02, 1, { a: 0.03, h: 0.05, tau: 0.15, color: 'pink', sweep: { mode: 'bp', fc: (t) => 500 + 2000 * Math.min(1, t / 0.12), q: 0.8 } });
    addTone(x, sr, 0.02, { f: 70, f1: 40, glide: 0.1, tau: 0.12, amp: 0.5 });
  }) },
  flame_stop: { rate: 22050, dur: 0.8, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.8, { a: 0.005, tau: 0.25, color: 'pink', sweep: { mode: 'bp', fc: (t) => 1600 - 1200 * Math.min(1, t / 0.3), q: 0.8 } });
    addBurst(x, sr, r, 0.05, 0.3, { a: 0.01, tau: 0.3, color: 'white', filters: [['highpass', 4000, 0.7]] });
  }, 0.1) },
  fuel_in: { rate: 22050, dur: 0.8, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 1900, amp: 1, tau: 0.03, body: 0.7, bodyF: 320, bodyTau: 0.04 });
    addBurst(x, sr, r, 0.06, 0.45, { len: 0.5, color: 'brown', env: (t) => Math.exp(-t / 0.2) * (0.6 + 0.4 * Math.sin(TAU * 9 * t)), filters: [['lowpass', 700, 0.7]] });
  }, 0.1) },
  // ---- launchers
  rpg_fire: { rate: 22050, dur: 2.2, peak: 0.97, fn: (P) => {
    explosion(P, { crack: 0.9, crackTau: 0.01, blast: 1.3, hold: 0.02, blastTau: 0.12, blastLP: 3000, blastResF: 300, thump: 0.9, thumpF0: 90, thumpF1: 40, thumpTau: 0.15, rumble: 0.2, rumbleTau: 0.4, debris: 0, drive: 3,
      tail: { tau: 0.5, lp: 3000, lpEnd: 500, pre: 0.006, slaps: [[0.1, 0.45], [0.25, 0.3], [0.45, 0.15]], wet: 0.45, slapWin: 0.2 } });
  } },
  m32_fire: { rate: 22050, dur: 1.0, peak: 0.85, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 150, f1: 55, glide: 0.04, tau: 0.08, amp: 1 });
    addBurst(x, sr, r, 0, 0.9, { a: 0.0005, tau: 0.05, color: 'pink', filters: [['lowpass', 1400, 0.7], ['peaking', 220, 1, 6]] });
    addMetal(x, sr, r, 0.02, { f: 2600, amp: 0.4, tau: 0.02, body: 0.5, bodyF: 700 });
  }, 0.3) },
  rocket_fly: { rate: 22050, dur: 2, loop: 0.5, rms: 0.12, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { len: 2.5, color: 'pink', env: (t) => 0.85 + 0.15 * Math.sin(TAU * 23 * t), filters: [['bandpass', 1300, 0.6]] });
    addBurst(x, sr, r, 0, 0.5, { len: 2.5, color: 'brown', env: () => 1, filters: [['lowpass', 300, 0.7]] });
  }) },
  rocket_explode: { rate: 22050, dur: 4, variants: 2, peak: 0.99, fn: (P) => explosion(P, {
    crack: 1.1, crackTau: 0.016, blast: 1.8, hold: 0.045, blastTau: 0.26, blastLP: 2200, blastResF: 380, thump: 1.1, thumpF0: 70, thumpF1: 30, thumpTau: 0.3,
    rumble: 0.5, rumbleTau: 0.8, rumbleLP: 380, debris: 160, debrisAmp: 0.5, drive: 3,
    tail: { tau: 0.8, lp: 2400, lpEnd: 300, pre: 0.01, slaps: [[0.14, 0.55], [0.34, 0.4], [0.6, 0.25], [0.95, 0.12]], wet: 0.55, slapWin: 0.3 },
  }) },
  rocket_load: { rate: 22050, dur: 0.7, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0, 0.18, { f0: 1200, f1: 2200, q: 1.5, amp: 0.5, grit: 0.6 });
    addMetal(x, sr, r, 0.2, { f: 1500, amp: 1, tau: 0.04, body: 0.8, bodyF: 260, bodyTau: 0.05 });
  }, 0.1) },
  // ---- gore
  gib: { rate: 22050, dur: 1.2, variants: 3, peak: 0.85, fn: (P) => foley(P, (x, sr, r) => {
    for (let i = 0; i < 5; i++) squelch(x, sr, r, r.range(0, 0.25) * (i ? 1 : 0), i ? r.range(0.4, 0.8) : 1);
    addGrains(x, sr, r, { t0: 0.2, span: 0.8, count: 30, f: [300, 1800], amp: [0.05, 0.3], decay: 0.4, dur: [0.003, 0.012] });
  }, 0.12) },
  gib_land: { rate: 22050, dur: 0.35, variants: 3, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => squelch(x, sr, r, 0, 1)) },
  headpop: { rate: 22050, dur: 0.9, peak: 0.8, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0003, tau: 0.012, filters: [['bandpass', 1400, 0.8]] });
    squelch(x, sr, r, 0.005, 1);
    addBurst(x, sr, r, 0.02, 0.5, { len: 0.7, color: 'pink', env: (t) => Math.exp(-t / 0.25) * (0.5 + 0.5 * Math.sin(TAU * 17 * t)), filters: [['lowpass', 1000, 0.7]] });
  }, 0.1) },
  // ---- bosses (shared)
  boss_intro: { rate: 22050, dur: 4.5, peak: 0.8, fn: (P) => foley(P, (x, sr, r) => {
    for (const [f, a] of [[55, 1], [82.4, 0.6], [110, 0.4], [41.2, 0.7]]) addTone(x, sr, 0, { f, a: 0.6, tau: 1.6, amp: a, len: 4.2, vib: 0.006, vibF: 4 });
    addBurst(x, sr, r, 0, 0.6, { len: 4, color: 'brown', env: (t) => Math.min(1, t / 0.8) * Math.exp(-Math.max(0, t - 1) / 1.2), filters: [['lowpass', 260, 0.7]] });
    addGrunt(x, sr, r, 0.6, 0.6, { dur: 2.2, f0: vib(70, 48, 2.2, 0.05, 5), env: [[0, 0], [0.3, 1], [1.4, 0.8], [2.2, 0]], vowels: [[0, V.o], [1, V.a], [2.2, V.u]], breath: 0.6, grit: 6 });
  }, 0.4, { len: 2, tau: 0.6, lp: 2000, lpEnd: 300, slaps: [[0.2, 0.4], [0.5, 0.25]] }) },
  boss_roar: { rate: 22050, dur: 2.0, variants: 2, peak: 0.9, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = v ? 85 : 70;
    addGrunt(x, sr, r, 0.01, 1, { dur: 1.6, f0: vib(f, f * 0.75, 1.6, 0.06, 7), env: [[0, 0], [0.12, 1], [1.0, 0.85], [1.6, 0]], vowels: [[0, V.ae], [0.4, V.a], [1.6, V.o]], breath: 0.7, grit: 9 });
    addBurst(x, sr, r, 0, 0.5, { len: 1.6, color: 'brown', env: (t) => Math.min(1, t / 0.1) * Math.exp(-t / 0.9), filters: [['lowpass', 220, 0.7]] });
  }, 0.25) },
  boss_growl: { rate: 22050, dur: 1.4, variants: 3, peak: 0.6, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = [60, 72, 55][v % 3];
    addGrunt(x, sr, r, 0.01, 1, { dur: 1.1, f0: vib(f, f * 0.85, 1.1, 0.08, 9), env: [[0, 0], [0.2, 1], [0.8, 0.7], [1.1, 0]], vowels: [[0, V.u], [0.5, V.o], [1.1, V.uh]], breath: 0.6, grit: 7 });
  }, 0.15) },
  boss_attack: { rate: 22050, dur: 0.9, variants: 2, peak: 0.8, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = v ? 120 : 100;
    addGrunt(x, sr, r, 0.005, 1, { dur: 0.6, f0: [[0, f], [0.06, f * 1.5], [0.6, f * 0.8]], env: [[0, 0], [0.03, 1], [0.35, 0.9], [0.6, 0]], vowels: [[0, V.ae], [0.2, V.a], [0.6, V.uh]], breath: 0.7, grit: 9 });
  }, 0.1) },
  boss_die: { rate: 22050, dur: 3.2, peak: 0.9, fn: (P) => foley(P, (x, sr, r) => {
    addGrunt(x, sr, r, 0.01, 1, { dur: 2.6, f0: vib(110, 38, 2.6, 0.07, 6), env: [[0, 0], [0.1, 1], [1.2, 0.8], [2.0, 0.4], [2.6, 0]], vowels: [[0, V.a], [1, V.o], [2.6, V.u]], breath: 0.8, grit: 9 });
    addTone(x, sr, 2.3, { f: 70, f1: 30, glide: 0.1, tau: 0.3, amp: 0.9 });
    addBurst(x, sr, r, 2.3, 0.7, { a: 0.002, tau: 0.2, color: 'pink', filters: [['lowpass', 600, 0.7]] });
  }, 0.3) },
  // ---- the butcher
  cleaver_swing: { rate: 22050, dur: 0.7, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { len: 0.4, color: 'pink', env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.35)) ** 2, sweep: { mode: 'bp', fc: (t) => 300 + 1300 * Math.sin(Math.PI * Math.min(1, t / 0.35)), q: 1.2 } });
    addGrunt(x, sr, r, 0.0, 0.7, { dur: 0.45, f0: [[0, 95], [0.1, 130], [0.45, 80]], env: [[0, 0], [0.04, 1], [0.45, 0]], vowels: [[0, V.uh], [0.45, V.a]], breath: 0.7, grit: 8 });
  }) },
  charge_go: { rate: 22050, dur: 1.2, peak: 0.85, fn: (P) => foley(P, (x, sr, r) => {
    addGrunt(x, sr, r, 0, 1, { dur: 1.0, f0: vib(90, 120, 1.0, 0.07, 8), env: [[0, 0], [0.05, 1], [0.8, 0.8], [1.0, 0]], vowels: [[0, V.a], [1, V.ae]], breath: 0.8, grit: 10 });
    for (let i = 0; i < 4; i++) addTone(x, sr, i * 0.22, { f: 70, f1: 40, glide: 0.05, tau: 0.06, amp: 0.7 });
  }, 0.15) },
  charge_hit: { rate: 22050, dur: 1.0, peak: 0.95, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 90, f1: 35, glide: 0.06, tau: 0.2, amp: 1.2 });
    addBurst(x, sr, r, 0, 1, { a: 0.001, tau: 0.08, color: 'pink', filters: [['lowpass', 1200, 0.7]] });
    squelch(x, sr, r, 0.01, 0.8);
  }, 0.2) },
  charge_wall: { rate: 22050, dur: 1.8, peak: 0.95, fn: (P) => explosion(P, {
    crack: 0.6, crackTau: 0.01, blast: 1, hold: 0.02, blastTau: 0.12, blastLP: 1500, blastResF: 150, thump: 1.4, thumpF0: 70, thumpF1: 30, thumpTau: 0.25,
    rumble: 0, debris: 70, debrisAmp: 0.4, debrisT0: 0.03, debrisSpan: 0.8, drive: 2.4,
    tail: { tau: 0.4, lp: 2400, lpEnd: 400, pre: 0.005, slaps: [[0.1, 0.4], [0.25, 0.2]], wet: 0.4, slapWin: 0.2 },
  }) },
  // ---- the spitter
  spitter_hurl: { rate: 22050, dur: 0.9, peak: 0.75, fn: (P) => foley(P, (x, sr, r) => {
    addGrunt(x, sr, r, 0, 1, { dur: 0.7, f0: vib(140, 100, 0.7, 0.12, 18), env: [[0, 0], [0.05, 1], [0.5, 0.8], [0.7, 0]], vowels: [[0, V.u], [0.4, V.er], [0.7, V.uh]], breath: 0.9, grit: 7 });
  }, 0.1) },
  spit: { rate: 22050, dur: 0.6, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.002, tau: 0.06, color: 'pink', filters: [['bandpass', 1300, 1]] });
    for (let i = 0; i < 8; i++) addTone(x, sr, r.range(0.02, 0.3), { f: r.range(300, 700), f1: r.range(700, 1300), glide: 0.01, tau: 0.01, amp: 0.4 });
  }, 0.1) },
  spitter_burst: { rate: 22050, dur: 1.4, peak: 0.85, fn: (P) => foley(P, (x, sr, r) => {
    for (let i = 0; i < 4; i++) squelch(x, sr, r, i * 0.05, 1 - i * 0.15);
    addGrunt(x, sr, r, 0.05, 0.7, { dur: 1.0, f0: vib(160, 90, 1.0, 0.1, 12), env: [[0, 0], [0.05, 1], [1, 0]], vowels: [[0, V.a], [1, V.u]], breath: 0.9, grit: 8 });
  }, 0.15) },
  // ---- the banshee
  banshee_scream: { rate: 22050, dur: 2.4, peak: 0.95, fn: (P) => foley(P, (x, sr, r) => {
    addGrunt(x, sr, r, 0.01, 1, { dur: 2.0, f0: vib(620, 880, 2.0, 0.035, 7), env: [[0, 0], [0.08, 1], [1.4, 0.9], [2.0, 0]], vowels: [[0, V.ae], [0.6, V.a], [2.0, V.ae]], breath: 0.5, grit: 3 });
    addGrunt(x, sr, r, 0.02, 0.6, { dur: 1.9, f0: vib(930, 1250, 1.9, 0.05, 9), env: [[0, 0], [0.1, 1], [1.9, 0]], vowels: [[0, V.ae], [1.9, V.a]], breath: 0.6, grit: 2.5 });
    addBurst(x, sr, r, 0, 0.35, { len: 2, color: 'white', env: (t) => Math.min(1, t / 0.05) * Math.exp(-t / 1.0), filters: [['highpass', 2500, 0.7]] });
  }, 0.4, { len: 1.5, tau: 0.5, lp: 4000, lpEnd: 900, slaps: [[0.15, 0.5], [0.4, 0.3], [0.7, 0.15]] }) },
  banshee_charge: { rate: 22050, dur: 1.3, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 300, f1: 1400, glide: 0.5, a: 0.3, tau: 1.2, len: 1.1, amp: 0.6, vib: 0.03, vibF: 9 });
    addBurst(x, sr, r, 0, 0.5, { len: 1.1, color: 'white', env: (t) => Math.min(1, t / 0.9), sweep: { mode: 'bp', fc: (t) => 600 + 2500 * Math.min(1, t), q: 2 } });
  }, 0.3) },
  banshee_moan: { rate: 22050, dur: 2.2, variants: 2, peak: 0.5, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = v ? 330 : 280;
    addGrunt(x, sr, r, 0.05, 1, { dur: 1.8, f0: vib(f, f * 0.8, 1.8, 0.03, 5), env: [[0, 0], [0.5, 1], [1.3, 0.7], [1.8, 0]], vowels: [[0, V.u], [0.9, V.o], [1.8, V.u]], breath: 0.6, grit: 1.4 });
  }, 0.45, { len: 1.6, tau: 0.6, lp: 3500, lpEnd: 800, slaps: [[0.2, 0.5], [0.5, 0.3]] }) },
  banshee_attack: { rate: 22050, dur: 0.7, variants: 2, peak: 0.7, fn: (P, v) => foley(P, (x, sr, r) => {
    const f = v ? 760 : 680;
    addGrunt(x, sr, r, 0, 1, { dur: 0.45, f0: [[0, f], [0.08, f * 1.25], [0.45, f * 0.9]], env: [[0, 0], [0.03, 1], [0.45, 0]], vowels: [[0, V.ae], [0.45, V.a]], breath: 0.4, grit: 2.5 });
  }, 0.15) },
  banshee_blink: { rate: 22050, dur: 0.9, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { len: 0.5, color: 'pink', env: (t) => Math.pow(Math.min(1, t / 0.45), 2), sweep: { mode: 'bp', fc: (t) => 300 + 3000 * Math.min(1, t / 0.45), q: 1.5 } });
    for (let i = 0; i < 6; i++) addTone(x, sr, 0.45 + i * 0.03, { f: 2000 + i * 400, tau: 0.08, amp: 0.25 });
  }, 0.3) },
  // ---- the inferno
  fireball_throw: { rate: 22050, dur: 1.0, peak: 0.75, fn: (P) => foley(P, (x, sr, r) => {
    roar(x, sr, r, 0, 0.8, 1, 1200, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.3));
    addBurst(x, sr, r, 0, 0.7, { a: 0.02, tau: 0.25, color: 'pink', sweep: { mode: 'bp', fc: (t) => 2000 - 1500 * Math.min(1, t / 0.4), q: 0.8 } });
  }, 0.15) },
  fireball_hit: { rate: 22050, dur: 2.0, peak: 0.9, fn: (P) => explosion(P, {
    crack: 0.6, crackTau: 0.01, blast: 1.2, hold: 0.03, blastTau: 0.16, blastLP: 1800, blastResF: 250, thump: 0.6, thumpF0: 90, thumpF1: 45, thumpTau: 0.15,
    rumble: 0.2, rumbleTau: 0.4, debris: 40, debrisAmp: 0.3, drive: 2.5,
    tail: { tau: 0.4, lp: 2400, lpEnd: 400, pre: 0.006, slaps: [[0.1, 0.4], [0.25, 0.2]], wet: 0.4, slapWin: 0.2 },
  }) },
  inferno_charge: { rate: 22050, dur: 1.4, peak: 0.7, fn: (P) => foley(P, (x, sr, r) => {
    roar(x, sr, r, 0, 1.3, 1, 900, (t) => Math.min(1, t / 1.0));
    addGrunt(x, sr, r, 0.2, 0.6, { dur: 1.0, f0: vib(65, 90, 1.0, 0.05, 6), env: [[0, 0], [0.6, 1], [1, 0]], vowels: [[0, V.o], [1, V.a]], breath: 0.8, grit: 8 });
  }, 0.2) },
  // ---- the abomination
  slam: { rate: 22050, dur: 3.0, peak: 0.99, fn: (P) => explosion(P, {
    crack: 0.8, crackTau: 0.012, blast: 1.6, hold: 0.04, blastTau: 0.2, blastLP: 1200, blastResF: 120, thump: 1.6, thumpF0: 60, thumpF1: 25, thumpTau: 0.4,
    rumble: 0.6, rumbleTau: 0.9, rumbleLP: 260, debris: 150, debrisAmp: 0.45, debrisT0: 0.05, debrisSpan: 1.5, drive: 2.6,
    tail: { tau: 0.7, lp: 1800, lpEnd: 250, pre: 0.01, slaps: [[0.15, 0.5], [0.4, 0.35], [0.7, 0.2]], wet: 0.5, slapWin: 0.3 },
  }) },
  abom_raise: { rate: 22050, dur: 2.6, peak: 0.7, fn: (P) => foley(P, (x, sr, r) => {
    for (const f of [46, 69, 92]) addTone(x, sr, 0, { f, a: 0.5, tau: 1.2, len: 2.4, amp: 0.5, vib: 0.01, vibF: 3 });
    // whispering voices
    for (let i = 0; i < 6; i++) {
      const n = Math.ceil(0.5 * sr), w = white(n, r);
      for (let k = 0; k < n; k++) w[k] *= Math.sin(Math.PI * k / n) ** 2;
      svf(w, sr, 'bp', pwl([[0, r.range(600, 900)], [0.5, r.range(1200, 2200)]]), 6);
      const t0 = Math.floor(r.range(0.2, 2.0) * sr);
      for (let k = 0; k < n && t0 + k < x.length; k++) x[t0 + k] += w[k] * 0.25;
    }
    addBurst(x, sr, r, 0, 0.4, { len: 2.4, color: 'brown', env: (t) => Math.sin(Math.PI * Math.min(1, t / 2.4)), filters: [['lowpass', 200, 0.7]] });
  }, 0.4) },
};
