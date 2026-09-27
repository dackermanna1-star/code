// Impacts, gore, footsteps, items, world objects, UI and ambience-detail sounds.

import { metalClick, scrape, rustle, glassSmash } from './sfxWeapons.js';

// wood/hinge creak: low sawtooth "stick-slip" through resonant bandpasses
export function creak(K, t, dur, f0, f1, amp = 1, dest = K.out, res = [420, 950, 1850]) {
  const g = K.gain(0, dest);
  K.env(g.gain, t, [[0, 0], [dur * 0.15, amp], [dur * 0.8, amp * 0.8], [dur, 0]]);
  const am = K.gain(0.6, null);
  K.rand(t, dur, 9, 0.4, am.gain);
  for (let k = 0; k < res.length; k++) am.connect(K.bp(res[k] * K.r(0.9, 1.1), 7 - k, K.gain(1 / (k + 1), g)));
  const o = K.osc('sawtooth', f0, t, dur, am);
  K.env(o.frequency, t, [[0, f0], [dur * 0.5, (f0 + f1) * 0.6, 'e'], [dur, f1, 'e']]);
  K.rand(t, dur, 25, f0 * 0.25, o.frequency);
  return g;
}

function wetSplat(K, t, amp = 1, dest = K.out) {
  K.burst(t, { d: 0.08, amp, f: [['lowpass', 1500]], dest, color: 'pink' });
  K.crackle(t, 0.15, [[0, 1200], [0.15, 0]], { len: [0.3, 2], dest: K.lp(2200, 0.7, dest), amp: 0.7 * amp });
  K.squelch(t, 0.14, { f: K.r(500, 900), amp: 0.6 * amp, q: 3, dest });
  K.thump(t, { f0: 140, f1: 70, d: 0.08, amp: 0.5 * amp, dest });
}

function strike(K, t, mat, a) {
  switch (mat) {
    case 'concrete':
      K.burst(t, { d: 0.03, amp: a, f: [['bandpass', K.r(1200, 2000), 1]] });
      K.thump(t, { f0: 95, f1: 60, d: 0.05, amp: a * 0.45 });
      K.crackle(t, 0.06, 300, { len: [0.1, 0.5], dest: K.hp(2500), amp: 0.3 * a });
      break;
    case 'wood':
      K.burst(t, { d: 0.05, amp: a, f: [['bandpass', K.r(450, 600), 2]] });
      K.modal(t, [[K.r(170, 240), 0.09, 0.5 * a], [K.r(420, 520), 0.05, 0.3 * a]]);
      K.thump(t, { f0: 115, f1: 70, d: 0.06, amp: a * 0.5 });
      break;
    case 'metal': {
      const f = K.r(330, 600);
      K.burst(t, { d: 0.02, amp: a * 0.8, f: [['bandpass', 2500, 1]] });
      K.modal(t, [[f, 0.25, 0.3 * a], [f * 2.31, 0.18, 0.25 * a], [f * 3.9, 0.12, 0.18 * a], [f * 5.72, 0.08, 0.1 * a]]);
      K.thump(t, { f0: 130, f1: 80, d: 0.05, amp: a * 0.4 });
      break;
    }
    case 'tile':
      K.burst(t, { d: 0.012, amp: a, f: [['highpass', 2500]] });
      K.burst(t, { d: 0.03, amp: a * 0.6, f: [['bandpass', 1800, 1.5]] });
      K.modal(t, [[K.r(3000, 3600), 0.03, 0.2 * a]]);
      break;
    case 'water':
      K.burst(t, { d: 0.1, amp: a, f: [['bandpass', 900, 0.8]] });
      K.crackle(t, 0.15, 500, { len: [0.2, 1.5], dest: K.bp(2000, 0.8), amp: 0.5 * a });
      K.bubbles(t + 0.01, 0.12, { rate: 40, fLo: 300, fHi: 900, amp: 0.3 * a });
      K.burst(t + 0.02, { d: 0.15, amp: a * 0.5, f: [['lowpass', 450]], color: 'pink' });
      break;
    case 'carpet':
      K.burst(t, { d: 0.06, amp: a, f: [['lowpass', 420]], color: 'pink' });
      K.thump(t, { f0: 85, f1: 55, d: 0.06, amp: a * 0.6 });
      K.burst(t, { d: 0.04, amp: a * 0.15, f: [['bandpass', 2500, 1]] });
      break;
    case 'dirt':
      K.crackle(t, 0.08, 900, { len: [0.2, 1.2], dest: K.bp(1800, 0.8), amp: a });
      K.burst(t, { d: 0.05, amp: a * 0.6, f: [['lowpass', 700]] });
      K.thump(t, { f0: 90, f1: 60, d: 0.05, amp: a * 0.4 });
      break;
  }
}

function stepDef(mat, level = 0.4) {
  return {
    v: 6, dur: 0.4, sr: 32000, level, cat: 'step', crit: true,
    build(K) {
      strike(K, 0.001, mat, 1);
      strike(K, K.r(0.03, 0.06), mat, K.r(0.35, 0.6));
      if (mat === 'wood' && K.chance(0.25)) creak(K, 0.02, 0.18, 45, 70, 0.3);
      if (mat !== 'carpet' && K.chance(0.5)) scrape(K, 0.05, 0.05, 2500, 0.08);
    },
  };
}

function bell(K, t, f, d, amp = 1, dest = K.out) {
  K.modal(t, [[f, d, 0.6], [f * 2.0, d * 0.6, 0.25], [f * 2.76, d * 0.4, 0.18], [f * 5.4, d * 0.2, 0.08], [f * 0.5, d * 0.8, 0.12]], dest, { amp });
}

export const WORLD_SFX = {
  // --- bullet impacts
  impactConcrete: {
    v: 5, dur: 0.5, sr: 44100, level: 0.55, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.008, amp: 1, f: [['highpass', K.r(1800, 2600)]] });
      K.burst(0.001, { d: 0.03, amp: 0.6, f: [['bandpass', K.r(1000, 1600), 1.2]] });
      K.thump(0.001, { f0: 220, f1: 110, d: 0.04, amp: 0.35 });
      K.crackle(0.004, 0.12, [[0, 500], [0.12, 0]], { len: [0.2, 1], dest: K.bp(4500, 0.8), amp: 0.5 });
      K.crackle(0.03, 0.25, [[0, 60], [0.25, 0]], { len: [0.3, 1.5], dest: K.hp(2000), amp: 0.25 });
    },
  },
  impactTile: {
    v: 4, dur: 0.5, sr: 44100, level: 0.55, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.006, amp: 1, f: [['highpass', 3000]] });
      K.modal(0.001, [[K.r(3000, 3800), 0.06, 0.4], [K.r(5000, 6200), 0.04, 0.3]]);
      K.crackle(0.005, 0.2, [[0, 300], [0.2, 0]], { len: [0.1, 0.4], dest: K.hp(4000), amp: 0.4 });
      for (let k = 0; k < 5; k++) K.modal(K.r(0.02, 0.25), [[K.r(4000, 8000), 0.03, 0.08]]);
    },
  },
  impactWood: {
    v: 4, dur: 0.4, sr: 44100, level: 0.55, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.05, amp: 1, f: [['bandpass', K.r(500, 800), 2.5]] });
      K.modal(0.001, [[K.r(200, 260), 0.08, 0.4], [K.r(450, 550), 0.06, 0.3]]);
      K.burst(0.001, { d: 0.006, amp: 0.5, f: [['highpass', 2500]] });
      K.crackle(0.004, 0.06, 600, { len: [0.2, 1], dest: K.bp(2500, 1), amp: 0.5 });
    },
  },
  impactSoft: {
    v: 4, dur: 0.3, sr: 32000, level: 0.45, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.05, amp: 1, f: [['lowpass', 650]], color: 'pink' });
      K.thump(0.001, { f0: 130, f1: 70, d: 0.06, amp: 0.6 });
      K.burst(0.002, { a: 0.005, d: 0.06, amp: 0.2, f: [['bandpass', 1500, 0.8]] });
    },
  },
  impactMetal: {
    v: 6, dur: 1.0, sr: 44100, level: 0.55, cat: 'impact', crit: true,
    build(K, i) {
      const f = K.r(900, 1500);
      K.burst(0.001, { d: 0.01, amp: 1, f: [['highpass', 2000]] });
      K.modal(0.001, [[f, K.r(0.15, 0.3), 0.4], [f * 1.58, 0.2, 0.3], [f * 2.33, 0.15, 0.25], [f * 3.1, 0.1, 0.15]], K.out, { amp: 0.8 });
      if (i % 3 !== 2) {
        // ricochet whine with doppler drop
        const g = K.gain(0, K.out);
        const t = K.r(0.005, 0.02), d = K.r(0.25, 0.45);
        K.env(g.gain, t, [[0, 0], [0.01, 0.35], [d, 0]]);
        const o = K.osc('sine', K.r(2800, 3800), t, d, g);
        o.frequency.exponentialRampToValueAtTime(K.r(1600, 2200), t + d);
        K.lfo(t, d, K.r(30, 50), 20, o.detune);
        K.noise(t, d, 'white', K.gain(0.03, K.bp(3000, 4, g)));
      }
    },
  },
  impactGlass: {
    v: 4, dur: 0.6, sr: 44100, level: 0.5, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.01, amp: 1, f: [['highpass', 2500]] });
      for (let k = 0; k < 10; k++) {
        const f = K.r(3000, 9000);
        K.modal(Math.pow(K.rng(), 2) * 0.2, [[f, K.r(0.02, 0.07), K.r(0.1, 0.3)]]);
      }
    },
  },
  impactWater: {
    v: 4, dur: 0.5, sr: 32000, level: 0.5, cat: 'impact', crit: true,
    build(K) {
      K.burst(0.001, { d: 0.05, amp: 1, f: [['bandpass', 1000, 1]] });
      K.burst(0.001, { d: 0.12, amp: 0.5, f: [['highpass', 2500]] });
      K.bubbles(0.01, 0.12, { rate: 60, fLo: 400, fHi: 1200, amp: 0.4 });
      const o = K.thump(0.005, { f0: 500, f1: 1100, sweep: 0.03, d: 0.05, amp: 0.3 });
    },
  },
  bulletFlesh: {
    v: 5, dur: 0.35, sr: 32000, level: 0.65, cat: 'gore', crit: true,
    build(K) {
      const sat = K.shaper(2);
      K.thump(0.001, { f0: K.r(150, 180), f1: 80, d: 0.06, amp: 1, dest: sat });
      K.burst(0.001, { d: 0.05, amp: 0.8, f: [['lowpass', 1300]], dest: sat });
      K.squelch(0.002, K.r(0.08, 0.14), { f: K.r(800, 1200), amp: 0.6, q: 3 });
      K.burst(0.001, { d: 0.004, amp: 0.3, f: [['highpass', 2500]] });
    },
  },
  headshot: {
    v: 5, dur: 0.6, sr: 44100, level: 0.8, cat: 'gore', crit: true,
    build(K) {
      const sat = K.shaper(2.5);
      K.click(0.001, { f: K.r(2400, 3000), q: 3, d: 0.012, amp: 1, dest: sat });
      K.thump(0.001, { f0: 320, f1: 100, sweep: 0.03, d: 0.05, amp: 0.8, dest: sat });
      K.crackle(0.002, 0.08, 1500, { len: [0.2, 1.2], dest: K.bp(2200, 0.7), amp: 0.8 });
      wetSplat(K, 0.008, 0.9);
      for (let k = 0; k < 4; k++) K.bubbles(K.r(0.15, 0.4), 0.03, { rate: 80, fLo: 500, fHi: 900, amp: 0.1 });
    },
  },
  dismember: {
    v: 4, dur: 0.6, sr: 32000, level: 0.75, cat: 'gore', crit: true,
    build(K) {
      K.squelch(0.001, K.r(0.2, 0.3), { f: K.r(600, 900), amp: 1, q: 3, rate: 50 });
      K.burst(0.001, { d: 0.1, amp: 0.6, f: [['lowpass', 1200]], color: 'pink' });
      const t = K.r(0.04, 0.09);
      K.click(t, { f: K.r(1800, 2600), q: 4, d: 0.015, amp: 0.9 });
      K.click(t + 0.012, { f: K.r(2800, 3500), q: 4, d: 0.01, amp: 0.5 });
      K.crackle(t, 0.05, 1500, { len: [0.2, 0.8], dest: K.bp(3000, 1), amp: 0.5 });
    },
  },
  gibSplat: {
    v: 5, dur: 0.4, sr: 32000, level: 0.6, cat: 'gore', crit: true,
    build(K) { wetSplat(K, 0.001, 1); },
  },
  bodyFall: {
    v: 5, dur: 0.7, sr: 32000, level: 0.6, cat: 'impact', crit: true,
    build(K) {
      K.thump(0.001, { f0: K.r(85, 100), f1: 48, sweep: 0.06, d: 0.18, amp: 1 });
      K.burst(0.001, { d: 0.12, amp: 0.7, f: [['lowpass', 450]], color: 'pink' });
      const t2 = K.r(0.08, 0.16);
      K.thump(t2, { f0: 120, f1: 70, d: 0.08, amp: 0.5 });
      K.burst(t2, { d: 0.06, amp: 0.35, f: [['lowpass', 900]] });
      rustle(K, 0, 0.25, 0.35);
    },
  },

  // --- footsteps
  stepConcrete: stepDef('concrete'),
  stepWood: stepDef('wood'),
  stepMetal: stepDef('metal', 0.42),
  stepTile: stepDef('tile', 0.36),
  stepWater: stepDef('water', 0.45),
  stepCarpet: stepDef('carpet', 0.3),
  stepDirt: stepDef('dirt'),

  // --- items
  heal: {
    v: 3, dur: 1.8, sr: 32000, level: 0.5, cat: 'foley', crit: true,
    build(K) {
      let t = 0.05;
      rustle(K, 0, 0.3, 0.5);
      for (let k = 0; k < K.ri(2, 3); k++) {
        const d = K.r(0.2, 0.4);
        const g = K.gain(0, K.out);
        K.env(g.gain, t, [[0, 0], [0.03, 1], [d * 0.8, 0.7], [d, 0]]);
        K.crackle(t, d, 2500, { len: [0.1, 0.4], dest: K.bp(K.r(2500, 3500), 0.7, g), ampPow: 1.5 });
        K.noise(t, d, 'pink', K.gain(0.15, K.bp(1500, 1, g)));
        t += d + K.r(0.12, 0.3);
      }
      rustle(K, t, 0.3, 0.4);
    },
  },
  pills: {
    v: 3, dur: 1.2, sr: 44100, level: 0.5, cat: 'foley', crit: true,
    build(K) {
      // cap pop
      K.click(0.01, { f: 2200, q: 3, d: 0.015, amp: 0.7 });
      K.thump(0.01, { f0: 600, f1: 300, d: 0.03, amp: 0.3 });
      let t = 0.15;
      for (let s = 0; s < K.ri(2, 3); s++) {
        const n = K.ri(10, 18);
        for (let k = 0; k < n; k++) {
          const tt = t + K.r(0, 0.12);
          K.modal(tt, [[K.r(2500, 4800), K.r(0.008, 0.02), K.r(0.1, 0.3)]]);
          K.burst(tt, { d: 0.006, amp: K.r(0.05, 0.15), f: [['bandpass', 1200, 5]] });
        }
        t += K.r(0.2, 0.28);
      }
    },
  },
  pickup: {
    v: 3, dur: 0.4, sr: 32000, level: 0.45, cat: 'foley', crit: true,
    build(K) {
      rustle(K, 0, 0.15, 0.5);
      K.burst(K.r(0.05, 0.09), { d: 0.03, amp: 0.8, f: [['bandpass', K.r(1500, 2200), 3]] });
      K.thump(0.07, { f0: 300, f1: 180, d: 0.04, amp: 0.3 });
    },
  },
  ammoPickup: {
    v: 3, dur: 0.9, sr: 44100, level: 0.5, cat: 'foley', crit: true,
    build(K) {
      rustle(K, 0, 0.6, 0.5);
      for (let k = 0; k < K.ri(5, 8); k++) {
        const f = K.r(2200, 5000);
        K.modal(K.r(0.02, 0.6), [[f, K.r(0.04, 0.09), 0.3], [f * 1.5, 0.04, 0.15]]);
      }
      K.crackle(0.05, 0.4, 80, { len: [0.3, 1.5], dest: K.bp(1800, 1.5), amp: 0.4 });
      metalClick(K, K.r(0.5, 0.65), 1800, 0.5);
    },
  },
  weaponPickup: {
    v: 3, dur: 0.6, sr: 44100, level: 0.55, cat: 'foley', crit: true,
    build(K) {
      rustle(K, 0, 0.25, 0.5);
      metalClick(K, K.r(0.05, 0.1), K.r(1600, 2000), 0.9, K.out, 0.05);
      metalClick(K, K.r(0.2, 0.3), K.r(2400, 2900), 0.7, K.out, 0.04);
      for (let k = 0; k < 3; k++) K.modal(K.r(0.1, 0.4), [[K.r(3500, 6000), 0.03, 0.1]]);
    },
  },
  flashlight: {
    v: 2, dur: 0.1, sr: 44100, level: 0.35, cat: 'foley', crit: true,
    build(K) { K.click(0.001, { f: 4200, q: 5, d: 0.006, amp: 1 }); K.click(0.014, { f: 2500, q: 4, d: 0.008, amp: 0.6 }); },
  },

  // --- world
  doorOpen: {
    v: 3, dur: 1.4, sr: 32000, level: 0.55, cat: 'world',
    build(K) {
      metalClick(K, 0.01, K.r(2000, 2500), 0.6, K.out, 0.03);
      const d = K.r(0.7, 1.1);
      creak(K, 0.06, d, K.r(28, 40), K.r(55, 80), 0.8);
      K.whoosh(0.1, d, { f0: 200, f1: 500, f2: 200, q: 0.7, amp: 0.15, color: 'pink' });
    },
  },
  doorClose: {
    v: 3, dur: 1.0, sr: 32000, level: 0.6, cat: 'world',
    build(K) {
      creak(K, 0, 0.3, 50, 35, 0.4);
      const t = 0.28;
      K.thump(t, { f0: 95, f1: 60, d: 0.22, amp: 1 });
      K.burst(t, { d: 0.1, amp: 0.7, f: [['lowpass', 650]] });
      K.modal(t, [[K.r(120, 150), 0.2, 0.3], [K.r(280, 320), 0.12, 0.2]]);
      metalClick(K, t + 0.01, 2200, 0.6, K.out, 0.04);
      K.crackle(t, 0.1, 150, { len: [0.3, 1.5], dest: K.bp(2500, 1.5), amp: 0.3 });
    },
  },
  doorBang: {
    v: 4, dur: 0.9, sr: 32000, level: 0.8, cat: 'world',
    build(K) {
      const sat = K.shaper(2.5);
      K.thump(0.001, { f0: K.r(75, 90), f1: 48, d: 0.3, amp: 1.1, dest: sat });
      K.burst(0.001, { d: 0.12, amp: 0.9, f: [['lowpass', 900]], dest: sat });
      K.modal(0.001, [[K.r(110, 140), 0.25, 0.5], [K.r(260, 300), 0.15, 0.3], [K.r(520, 600), 0.08, 0.15]]);
      K.crackle(0.01, 0.15, 400, { len: [0.3, 1.5], dest: K.bp(2500, 1.5), amp: 0.4 });
      if (K.chance(0.5)) metalClick(K, K.r(0.02, 0.05), 1800, 0.3, K.out, 0.08);
    },
  },
  doorBreak: {
    v: 3, dur: 1.8, sr: 32000, level: 0.9, cat: 'world',
    build(K) {
      const sat = K.shaper(3);
      K.thump(0.001, { f0: 80, f1: 40, d: 0.4, amp: 1.2, dest: sat });
      K.burst(0.001, { d: 0.2, amp: 1, f: [['lowpass', 1500]], dest: sat });
      K.crackle(0.002, 0.45, [[0, 1200], [0.45, 50]], { len: [0.3, 3], dest: K.bp(1800, 0.8), amp: 1 });
      for (let k = 0; k < 6; k++) K.burst(K.r(0, 0.3), { d: 0.02, amp: K.r(0.3, 0.6), f: [['highpass', 2000]] });
      K.modal(0.01, [[K.r(150, 200), 0.3, 0.4], [K.r(380, 450), 0.2, 0.3]]);
      K.crackle(0.3, 1.2, [[0, 60], [1.2, 0]], { len: [1, 4], dest: K.lp(1500), amp: 0.6 });
    },
  },
  safeDoorOpen: {
    v: 2, dur: 2.2, sr: 32000, level: 0.7, cat: 'world',
    build(K) {
      metalClick(K, 0.01, K.r(850, 1000), 1, K.out, 0.15);
      K.thump(0.01, { f0: 150, f1: 90, d: 0.12, amp: 0.6 });
      creak(K, 0.15, 1.5, 22, 34, 0.9, K.out, [260, 610, 1300]);
      const g = K.gain(0, K.out);
      K.env(g.gain, 0.4, [[0, 0], [0.3, 0.06], [1.0, 0.02], [1.2, 0]]);
      const o = K.osc('sine', 1750, 0.4, 1.2, g);
      K.rand(0.4, 1.2, 6, 120, o.frequency);
    },
  },
  safeDoorClose: {
    v: 2, dur: 2.6, sr: 32000, level: 0.9, cat: 'world',
    build(K) {
      creak(K, 0, 0.35, 30, 22, 0.4, K.out, [260, 610, 1300]);
      const t = 0.32, f = K.r(140, 180);
      const sat = K.shaper(3);
      K.thump(t, { f0: 75, f1: 40, d: 0.5, amp: 1.2, dest: sat });
      K.burst(t, { d: 0.15, amp: 0.9, f: [['lowpass', 1500]], dest: sat });
      K.modal(t, [[f, 1.3, 0.3], [f * 2.41, 0.9, 0.25], [f * 3.93, 0.55, 0.2], [f * 5.8, 0.35, 0.12], [f * 8.1, 0.2, 0.08]]);
      metalClick(K, t + 0.25, 1100, 0.9, K.out, 0.12);
      K.thump(t + 0.25, { f0: 180, f1: 100, d: 0.1, amp: 0.5 });
    },
  },
  glassBreak: {
    v: 3, dur: 2.0, sr: 44100, level: 0.85, cat: 'world',
    build(K) {
      glassSmash(K, 0.001, 1, 1.0);
      for (let k = 0; k < 14; k++) {
        const t = K.r(0.3, 1.6), f = K.r(2500, 7000);
        K.modal(t, [[f, K.r(0.03, 0.1), K.r(0.05, 0.15)], [f * 1.6, 0.04, 0.05]]);
      }
    },
  },
  woodBreak: {
    v: 3, dur: 1.0, sr: 32000, level: 0.8, cat: 'world',
    build(K) {
      K.burst(0.001, { d: 0.03, amp: 1, f: [['highpass', 800]] });
      K.crackle(0.002, 0.25, [[0, 1500], [0.25, 100]], { len: [0.3, 2], dest: K.bp(2000, 0.8), amp: 1 });
      K.modal(0.001, [[K.r(180, 230), 0.15, 0.5], [K.r(430, 520), 0.1, 0.3]]);
      K.thump(0.001, { f0: 110, f1: 60, d: 0.15, amp: 0.7 });
      K.crackle(0.15, 0.6, [[0, 40], [0.6, 0]], { len: [1, 4], dest: K.lp(1500), amp: 0.5 });
    },
  },
  metalImpact: {
    v: 4, dur: 1.6, sr: 44100, level: 0.75, cat: 'world',
    build(K) {
      const f = K.r(300, 700);
      K.burst(0.001, { d: 0.02, amp: 1, f: [['bandpass', 2000, 1]] });
      K.thump(0.001, { f0: 180, f1: 90, d: 0.08, amp: 0.5 });
      K.modal(0.001, [[f, K.r(0.6, 1.0), 0.4], [f * 2.32, 0.6, 0.3], [f * 4.25, 0.4, 0.2], [f * 6.63, 0.25, 0.12], [f * 1.47, 0.5, 0.15]]);
    },
  },
  carAlarm: {
    v: 1, dur: 6.05, sr: 32000, level: 0.75, cat: 'loop', loop: true, xfade: 0.05,
    build(K) {
      const out = K.shaper(1.8, K.lp(3500));
      const g = K.gain(0.5, out);
      const o = K.osc('square', 900, 0, 6.05, g);
      const f = o.frequency;
      f.setValueAtTime(900, 0);
      // phase 1 (0-2s): wail up/down
      for (let k = 0; k < 4; k++) { f.linearRampToValueAtTime(1600, k * 0.5 + 0.25); f.linearRampToValueAtTime(900, k * 0.5 + 0.5); }
      // phase 2 (2-4s): fast whoops
      for (let k = 0; k < 10; k++) { f.setValueAtTime(700, 2 + k * 0.2); f.exponentialRampToValueAtTime(1800, 2 + k * 0.2 + 0.18); }
      // phase 3 (4-6s): alternating beeps
      for (let k = 0; k < 12; k++) f.setValueAtTime(k % 2 ? 950 : 1250, 4 + k * (2 / 12));
      f.setValueAtTime(900, 6.0);
      const pts = [[0, 0.5]];
      for (let k = 0; k < 12; k++) { const tb = 4 + k / 6; pts.push([tb, 0.5, 's'], [tb + 0.12, 0, 's']); }
      pts.push([6.0, 0.5, 's']);
      K.env(g.gain, 0, pts);
    },
  },
  alarm: {
    v: 1, dur: 2.02, sr: 32000, level: 0.7, cat: 'loop', loop: true, xfade: 0.02,
    build(K) {
      const f = 880;
      for (let k = 0; k < 36; k++) {
        const t = k / 18;
        K.modal(t, [[f, 0.3, 0.5], [f * 2.32, 0.2, 0.35], [f * 4.25, 0.12, 0.2], [f * 6.63, 0.08, 0.1]], K.out, { a: 0.001 });
        K.click(t, { f: 3000, q: 2, d: 0.004, amp: 0.3 });
      }
    },
  },
  generator: {
    v: 1, dur: 3.1, sr: 22050, level: 0.65, cat: 'loop', loop: true, xfade: 0.1,
    build(K) {
      const rate = 25;
      const bus = K.gain(1, K.shaper(2));
      for (let k = 0; k < 3.1 * rate; k++) {
        const t = k / rate;
        K.thump(t, { f0: 90, f1: 55, d: 0.05, amp: k % 2 ? 0.7 : 1, dest: bus });
        K.burst(t, { d: 0.03, amp: 0.4, f: [['lowpass', 600]], dest: bus, color: 'pink' });
        if (k % 4 === 0) K.click(t + 0.01, { f: 1900, q: 3, d: 0.01, amp: 0.15 });
      }
      const ex = K.gain(0.25, K.lp(900));
      K.lfo(0, 3.1, rate, 0.2, ex.gain);
      K.noise(0, 3.1, 'pink', ex);
      K.osc('sawtooth', 50, 0, 3.1, K.gain(0.15, K.lp(300)));
    },
  },
  elevatorMotor: {
    v: 1, dur: 4.3, sr: 32000, level: 0.55, cat: 'loop', loop: true, xfade: 0.3,
    build(K) {
      const D = 4.3;
      K.osc('sawtooth', 100, 0, D, K.gain(0.3, K.lp(600)));
      const w = K.osc('sine', 520, 0, D, K.gain(0.12));
      K.lfo(0, D, 0.7, 8, w.detune);
      K.osc('sine', 1040, 0, D, K.gain(0.04));
      const r = K.gain(0.5, K.lp(260));
      K.rand(0, D, 3, 0.2, r.gain);
      K.noise(0, D, 'brown', r);
      K.crackle(0, D, 6, { len: [1, 3], dest: K.bp(1500, 2), amp: 0.3 });
    },
  },
  elevatorDing: {
    v: 1, dur: 2.0, sr: 32000, level: 0.6, cat: 'world', jitter: 0,
    build(K) { bell(K, 0.001, 1318.5, 1.6, 1); },
  },
  liftMotor: {
    v: 1, dur: 4.3, sr: 32000, level: 0.6, cat: 'loop', loop: true, xfade: 0.3,
    build(K) {
      const D = 4.3;
      const pump = K.gain(0.6, K.out);
      K.lfo(0, D, 12, 0.35, pump.gain, 'triangle');
      K.osc('sawtooth', 220, 0, D, K.gain(0.3, K.bp(900, 2, pump)));
      K.osc('sawtooth', 441, 0, D, K.gain(0.15, K.bp(1800, 3, pump)));
      const gr = K.gain(0.5, K.bp(700, 2));
      K.rand(0, D, 20, 0.3, gr.gain);
      K.noise(0, D, 'pink', gr);
      for (let k = 0; k < 4; k++) {
        const t = K.r(0.2, D - 0.6), sg = K.gain(0, K.out);
        K.env(sg.gain, t, [[0, 0], [0.1, 0.05], [0.35, 0]]);
        const o = K.osc('sine', K.r(1500, 2500), t, 0.4, sg);
        K.rand(t, 0.4, 10, 150, o.frequency);
      }
      K.noise(0, D, 'brown', K.gain(0.3, K.lp(150)));
    },
  },
  helicopter: {
    v: 1, dur: 2.1, sr: 32000, level: 0.8, cat: 'loop', loop: true, xfade: 0.1,
    build(K) {
      const rate = 8.5, D = 2.1;
      const bus = K.gain(1, K.shaper(2));
      for (let k = 0; k < D * rate; k++) {
        const t = k / rate;
        K.burst(t, { a: 0.003, d: 0.07, amp: 1, f: [['lowpass', 700, 1.2]], dest: bus, color: 'pink' });
        K.thump(t, { f0: 70, f1: 45, d: 0.08, amp: 0.8, dest: bus });
        K.burst(t + 0.005, { d: 0.03, amp: 0.25, f: [['bandpass', 1800, 1]], dest: bus });
      }
      const en = K.gain(0.3, K.lp(1500));
      K.noise(0, D, 'pink', en);
      K.osc('sawtooth', 57, 0, D, K.gain(0.12, K.lp(500)));
      K.osc('sine', 4800, 0, D, K.gain(0.012));
      K.osc('sine', 6150, 0, D, K.gain(0.006));
    },
  },
  radioStatic: {
    v: 3, dur: 0.9, sr: 32000, level: 0.5, cat: 'ui',
    build(K) {
      const d = K.r(0.4, 0.8);
      const g = K.gain(0, K.out);
      K.env(g.gain, 0, [[0, 0], [0.01, 1], [d * 0.8, 0.8], [d, 0]]);
      K.rand(0, d, 30, 0.35, g.gain);
      K.noise(0, d, 'white', K.bp(2200, 0.6, g));
      K.crackle(0, d, 200, { len: [0.1, 1], dest: K.hp(1500, 0.7, g), amp: 0.8 });
      K.osc('sine', 1000, 0, 0.03, K.gain(0.15));
    },
  },
  radioBeep: {
    v: 1, dur: 0.25, sr: 32000, level: 0.45, cat: 'ui', jitter: 0,
    build(K) {
      const g = K.gain(0, K.lp(4000));
      K.env(g.gain, 0, [[0, 0], [0.003, 1], [0.06, 1], [0.065, 0], [0.08, 0], [0.083, 1], [0.16, 1], [0.17, 0]]);
      const o = K.osc('square', 1200, 0, 0.18, K.gain(0.4, g));
      o.frequency.setValueAtTime(1600, 0.08);
    },
  },
  buttonPress: {
    v: 2, dur: 0.3, sr: 32000, level: 0.45, cat: 'world',
    build(K) {
      metalClick(K, 0.001, 2600, 0.8, K.out, 0.02);
      const g = K.gain(0, K.out);
      K.env(g.gain, 0.03, [[0, 0], [0.005, 0.3], [0.1, 0.3], [0.12, 0]]);
      K.osc('sine', 950, 0.03, 0.12, g);
    },
  },
  metalGate: {
    v: 2, dur: 3.4, sr: 32000, level: 0.85, cat: 'world',
    build(K) {
      const D = 2.4;
      const g = K.gain(0, K.out);
      K.env(g.gain, 0, [[0, 0], [0.2, 1], [D - 0.2, 0.9], [D, 0.3]]);
      K.crackle(0, D, 70, { len: [0.5, 2], dest: K.bp(1500, 2, g), ampPow: 1 });
      const rb = K.gain(0.6, K.lp(400, 0.7, g));
      K.lfo(0, D, 7, 0.3, rb.gain);
      K.noise(0, D, 'brown', rb);
      for (let k = 0; k < 4; k++) {
        const f = K.r(250, 500);
        K.modal(K.r(0.1, D), [[f, 0.4, 0.15], [f * 2.3, 0.3, 0.1], [f * 3.8, 0.2, 0.06]], g);
      }
      const f = K.r(160, 200);
      K.thump(D, { f0: 100, f1: 50, d: 0.4, amp: 0.9 });
      K.modal(D, [[f, 0.9, 0.35], [f * 2.4, 0.6, 0.25], [f * 3.9, 0.4, 0.15], [f * 5.6, 0.25, 0.1]]);
    },
  },
  drip: {
    v: 6, dur: 0.3, sr: 32000, level: 0.4, cat: 'world', ref: 2,
    build(K) {
      const f = K.r(900, 1700);
      const g = K.gain(0, K.out);
      K.ad(g.gain, 0.001, 0.002, 0.07, 1);
      const o = K.osc('sine', f, 0.001, 0.1, g);
      o.frequency.exponentialRampToValueAtTime(f * K.r(1.5, 2.1), 0.025);
      K.burst(0.001, { d: 0.01, amp: 0.2, f: [['highpass', 3000]] });
    },
  },

  // --- UI
  uiClick: {
    v: 2, dur: 0.12, sr: 44100, level: 0.4, cat: 'ui', crit: true, jitter: 0.01,
    build(K) {
      K.click(0.001, { f: 3200, q: 3, d: 0.01, amp: 0.6 });
      const g = K.gain(0, K.out); K.ad(g.gain, 0.001, 0.001, 0.04, 0.5);
      K.osc('sine', 1250, 0.001, 0.05, g);
    },
  },
  uiHover: {
    v: 1, dur: 0.08, sr: 44100, level: 0.25, cat: 'ui', crit: true, jitter: 0.01,
    build(K) {
      const g = K.gain(0, K.out); K.ad(g.gain, 0.001, 0.002, 0.03, 0.5);
      K.osc('sine', 1900, 0.001, 0.04, g);
      K.click(0.001, { f: 5000, q: 3, d: 0.004, amp: 0.2 });
    },
  },
  objective: {
    v: 1, dur: 2.0, sr: 44100, level: 0.55, cat: 'ui', crit: true, jitter: 0,
    build(K) { bell(K, 0.001, 880, 1.2, 0.8); bell(K, 0.14, 1174.7, 1.5, 1); },
  },
  chapterComplete: {
    v: 1, dur: 4.0, sr: 44100, level: 0.6, cat: 'ui', crit: true, jitter: 0, stereo: true,
    build(K) {
      const notes = [587.3, 698.5, 880, 1174.7];
      notes.forEach((f, k) => bell(K, 0.001 + k * 0.16, f, 2.2, 0.6, K.pan(-0.4 + k * 0.27)));
      // warm pad underneath (D minor add9 resolving to D major)
      const pad = K.gain(0, K.lp(1400));
      K.env(pad.gain, 0, [[0, 0], [0.6, 0.12], [2.8, 0.1], [3.9, 0]]);
      for (const [f, det] of [[146.8, -6], [146.8, 6], [220, 0], [293.7, -4], [370, 4]]) {
        const o = K.osc('sawtooth', f, 0, 3.9, pad, det);
        if (f === 370) { o.frequency.setValueAtTime(349.2, 0); o.frequency.setValueAtTime(370, 1.4); }
      }
    },
  },

  // --- ambience details (used internally by the ambience beds)
  amb_creak: {
    v: 4, dur: 1.8, sr: 22050, level: 0.5, cat: 'amb',
    build(K) { creak(K, 0.01, K.r(0.8, 1.6), K.r(18, 35), K.r(30, 60), 1); },
  },
  amb_tvStatic: {
    v: 3, dur: 3.0, sr: 22050, level: 0.4, cat: 'amb',
    build(K) {
      const d = K.r(1.5, 2.8);
      const g = K.gain(0, K.lp(2200));
      K.env(g.gain, 0, [[0, 0], [0.05, 1], [d - 0.1, 0.9], [d, 0]]);
      K.noise(0, d, 'white', K.gain(0.4, K.bp(3500, 0.5, g)));
      K.osc('sawtooth', 60, 0, d, K.gain(0.05, g));
      let t = 0.1;
      while (t < d - 0.3) {
        const sd = K.r(0.15, 0.5);
        K.voice(t, sd, { f0: [[0, K.r(110, 180)], [sd, K.r(100, 170)]], vowel: [[0, K.pick(['a', 'e', 'o'])], [sd, K.pick(['i', 'u', 'uh'])]], breath: 0.3, dest: K.gain(0.5, g), jitter: 0.02 });
        t += sd + K.r(0.05, 0.2);
      }
    },
  },
  amb_pipeGroan: {
    v: 3, dur: 3.2, sr: 22050, level: 0.55, cat: 'amb',
    build(K) {
      const d = K.r(2.0, 3.0);
      creak(K, 0.01, d, K.r(40, 55), K.r(60, 80), 1, K.out, [180, 420, 760]);
      const g = K.gain(0, K.out);
      K.env(g.gain, 0, [[0, 0], [d * 0.5, 0.3], [d, 0]]);
      const o = K.osc('sine', K.r(55, 70), 0, d, g);
      K.lfo(0, d, 0.8, 40, o.detune);
    },
  },
  amb_monitor: {
    v: 1, dur: 0.2, sr: 22050, level: 0.4, cat: 'amb', jitter: 0,
    build(K) { const g = K.gain(0, K.out); K.env(g.gain, 0, [[0, 0], [0.005, 1], [0.11, 1], [0.13, 0]]); K.osc('sine', 1000, 0, 0.14, g); },
  },
  amb_alarmBeeps: {
    v: 1, dur: 1.3, sr: 22050, level: 0.4, cat: 'amb', jitter: 0,
    build(K) {
      for (let k = 0; k < 3; k++) {
        const g = K.gain(0, K.lp(3000)); const t = k * 0.35;
        K.env(g.gain, t, [[0, 0], [0.005, 0.5], [0.2, 0.5], [0.21, 0]]);
        K.osc('square', 1850, t, 0.22, g);
      }
    },
  },
  amb_thud: {
    v: 3, dur: 1.0, sr: 22050, level: 0.6, cat: 'amb',
    build(K) {
      K.thump(0.001, { f0: 75, f1: 40, d: 0.35, amp: 1 });
      K.burst(0.001, { d: 0.15, amp: 0.6, f: [['lowpass', 500]] });
      K.crackle(0.01, 0.2, 100, { len: [0.5, 2], dest: K.bp(1500, 1.5), amp: 0.3 });
    },
  },
  amb_clank: {
    v: 3, dur: 2.6, sr: 22050, level: 0.5, cat: 'amb',
    build(K) {
      const f = K.r(150, 380);
      K.burst(0.001, { d: 0.03, amp: 0.6, f: [['bandpass', 1500, 1]] });
      K.modal(0.001, [[f, 1.8, 0.4], [f * 2.41, 1.2, 0.3], [f * 3.9, 0.8, 0.2], [f * 5.3, 0.5, 0.1]]);
    },
  },
  amb_siren: {
    v: 2, dur: 9, sr: 16000, level: 0.5, cat: 'amb', jitter: 0.02,
    build(K) {
      const g = K.gain(0, K.lp(1600));
      K.env(g.gain, 0, [[0, 0], [2, 0.8], [7, 0.8], [9, 0]]);
      const o = K.osc('triangle', 650, 0, 9, g);
      const per = K.r(2.8, 3.6);
      o.frequency.setValueAtTime(650, 0);
      for (let t = 0; t < 9; t += per) { o.frequency.linearRampToValueAtTime(1250, t + per * 0.5); o.frequency.linearRampToValueAtTime(650, t + per); }
      K.lfo(0, 9, 0.13, 25, o.detune);
    },
  },
  amb_rat: {
    v: 3, dur: 0.8, sr: 32000, level: 0.35, cat: 'amb',
    build(K) {
      let t = 0.01;
      for (let k = 0; k < K.ri(2, 4); k++) {
        const d = K.r(0.04, 0.09), f = K.r(3500, 6000);
        const g = K.gain(0, K.out);
        K.env(g.gain, t, [[0, 0], [0.005, 0.6], [d, 0]]);
        const o = K.osc('sine', f, t, d, g);
        K.lfo(t, d, K.r(40, 70), 250, o.detune, 'triangle');
        o.frequency.exponentialRampToValueAtTime(f * K.r(0.8, 1.2), t + d);
        t += d + K.r(0.04, 0.12);
      }
    },
  },
  amb_bubble: {
    v: 3, dur: 1.0, sr: 22050, level: 0.4, cat: 'amb',
    build(K) { K.bubbles(0.01, K.r(0.3, 0.8), { rate: K.r(15, 30), fLo: 120, fHi: 450, amp: 1 }); K.squelch(0.01, 0.5, { f: 350, amp: 0.3 }); },
  },
  amb_train: {
    v: 1, dur: 8, sr: 16000, level: 0.55, cat: 'amb',
    build(K) {
      const g = K.gain(0, K.out);
      K.env(g.gain, 0, [[0, 0], [3.5, 1], [5, 0.9], [8, 0]]);
      K.noise(0, 8, 'brown', K.lp(160, 0.7, g));
      const cl = K.gain(0.5, K.lp(900, 0.7, g));
      for (let t = 0.2; t < 7.8; t += 0.36) K.thump(t, { f0: 90, f1: 60, d: 0.08, amp: K.r(0.3, 0.6), dest: cl });
      const sq = K.gain(0, g);
      K.env(sq.gain, 3.5, [[0, 0], [0.8, 0.05], [2, 0]]);
      const o = K.osc('sine', 2400, 3.5, 2, sq);
      K.rand(3.5, 2, 5, 200, o.frequency);
    },
  },
};
