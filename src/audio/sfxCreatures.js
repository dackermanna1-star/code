// Infected, special infected and survivor vocal/body sound definitions.
// Vocals use formant-filtered saw/noise sources with pitch contours, jitter,
// vocal-fry roughness and waveshaping; gurgles are bubble blips + wet squelch.

import { rustle } from './sfxWeapons.js';

// zombie-flavoured voice defaults
function zv(K, t, dur, o) {
  return K.voice(t, dur, Object.assign({
    fs: K.r(0.84, 0.95), rough: 0.6, roughHz: K.r(30, 55), jitter: 0.05, jitterHz: 16, drive: 3, breath: 0.25, lp: 3800,
  }, o));
}

function gurgle(K, t, dur, amp = 0.4, dest = K.out, low = false) {
  const g = K.gain(amp, dest);
  K.bubbles(t, dur, { rate: K.r(28, 45), fLo: low ? 90 : 160, fHi: low ? 320 : 520, dest: g, amp: 0.8 });
  K.squelch(t, dur, { f: low ? 320 : 480, q: 3, amp: 0.5, rate: 30, dest: g, a: 0.05 });
  return g;
}

function slap(K, t, amp = 1, dest = K.out) {
  K.burst(t, { d: 0.04, amp, f: [['lowpass', 2200]], dest });
  K.thump(t, { f0: K.r(170, 200), f1: 90, d: 0.07, amp: amp * 0.7, dest });
}

function inhale(K, t, dur, amp = 0.5, dest = K.out, f0 = 1600, f1 = 2600) {
  const g = K.gain(0, dest);
  K.env(g.gain, t, [[0, 0], [dur * 0.6, amp], [dur, 0]]);
  const b = K.bp(f0, 2.2, g);
  K.env(b.frequency, t, [[0, f0], [dur, f1, 'e']]);
  K.noise(t, dur, 'white', b);
  return g;
}

function cough(K, t, amp = 1, f0 = 125, dest = K.out) {
  const d = K.r(0.16, 0.26);
  K.burst(t, { d: 0.02, amp: amp * 0.6, f: [['bandpass', 1400, 1.5]], dest });
  K.voice(t, d, {
    f0: [[0, f0 * 1.15], [d, f0 * 0.8]], vowel: [[0, 'a'], [d, 'uh']], fs: 0.95, breath: 1.4, voiced: 0.45,
    rough: 0.9, roughHz: 45, drive: 4, jitter: 0.06, amp: [[0, 0], [0.006, amp], [d * 0.35, amp * 0.6], [d, 0]], lp: 4500, dest,
  });
  return d;
}

// ---------------------------------------------------------------------------

export const CREATURE_SFX = {
  // --- common infected
  zIdle: {
    v: 12, dur: 2.6, sr: 32000, level: 0.6, cat: 'zvocal', crit: true,
    build(K, i) {
      const type = i % 6;
      if (type === 0 || type === 5) {
        // long moan
        const d = K.r(1.4, 2.4), f = K.r(92, 125);
        zv(K, 0, d, {
          f0: [[0, f], [d * 0.3, f * 1.1], [d * 0.8, f * 0.78], [d, f * 0.66]],
          vowel: [[0, 'uh'], [d * 0.4, K.pick(['aw', 'a', 'o'])], [d, 'u']],
          amp: [[0, 0], [0.18, 0.8], [d * 0.5, 1], [d * 0.85, 0.6], [d, 0]], rough: K.r(0.45, 0.7),
        });
        if (K.chance(0.5)) gurgle(K, d * K.r(0.3, 0.6), d * 0.4, 0.25);
      } else if (type === 1) {
        // groan with throat rattle
        const d = K.r(0.7, 1.1), f = K.r(78, 100);
        zv(K, 0, d, { f0: [[0, f], [d, f * 0.8]], vowel: [[0, 'o'], [d, 'u']], rough: 0.95, roughHz: K.r(22, 32), roughNoise: 0.3, drive: 4.5 });
        gurgle(K, 0.05, d * 0.9, 0.25, K.out, true);
      } else if (type === 2) {
        // gurgly choking
        const d = K.r(0.8, 1.3);
        zv(K, 0, d, { f0: [[0, K.r(100, 125)], [d, 85]], vowel: 'aw', rough: 0.8, amp: [[0, 0], [0.1, 0.5], [d, 0]], tremble: [22, 0.45] });
        gurgle(K, 0, d, 0.7);
        K.squelch(0.1, d * 0.6, { f: 380, q: 3, amp: 0.3 });
      } else if (type === 3) {
        // hissing rasp: inhale then growled exhale
        const di = K.r(0.35, 0.5);
        zv(K, 0, di, { f0: K.r(180, 230), vowel: 'i', fs: 1.05, breath: 1.4, voiced: 0.15, breathHp: 1200, drive: 2, amp: [[0, 0], [di * 0.7, 0.5], [di, 0]] });
        const d = K.r(0.7, 1.0);
        zv(K, di + 0.05, d, { f0: [[0, K.r(75, 90)], [d, 62]], vowel: [[0, 'a'], [d, 'uh']], breath: 0.9, rough: 0.9, roughHz: K.r(25, 35), drive: 5 });
      } else {
        // whimpering wail (unsettling)
        const d = K.r(1.2, 1.8), f = K.r(200, 260);
        zv(K, 0, d, {
          f0: [[0, f], [d * 0.25, f * 1.12], [d * 0.6, f * 0.9], [d, f * 0.62]], vowel: [[0, 'u'], [d * 0.5, 'o'], [d, 'u']],
          fs: 1.03, breath: 0.45, rough: 0.3, roughHz: 60, drive: 2, vib: [5.5, 35], tremble: [9, 0.25],
          amp: [[0, 0], [0.2, 0.7], [d * 0.5, 0.9], [d, 0]],
        });
      }
    },
  },
  zAlert: {
    v: 6, dur: 1.0, sr: 32000, level: 0.8, cat: 'zvocal', crit: true,
    build(K, i) {
      if (i % 3 !== 1) {
        const d = K.r(0.6, 0.9), pk = K.r(520, 720);
        zv(K, 0, d, {
          f0: [[0, 230], [0.08, pk], [d * 0.35, pk * 0.88], [d, pk * 0.45]], vowel: [[0, 'ae'], [d * 0.5, 'a'], [d, 'uh']],
          fs: K.r(0.95, 1.05), rough: 0.5, roughHz: K.r(60, 85), drive: 6, grit: true, dual: K.r(1.42, 1.52), dualAmp: 0.45,
          breath: 0.5, lp: 6000, amp: [[0, 0], [0.03, 1], [d * 0.6, 0.8], [d, 0]], vib: [K.r(7, 11), 45], jitter: 0.07,
        });
      } else {
        // snarl with teeth hiss
        const d = K.r(0.5, 0.8), f = K.r(150, 200);
        zv(K, 0, d, {
          f0: [[0, f], [0.1, f * 1.3], [d, f * 0.9]], vowel: 'ae', rough: 0.95, roughHz: K.r(55, 70), roughNoise: 0.3,
          drive: 5, breath: 0.8, breathHp: 2500, jitter: 0.08, amp: [[0, 0], [0.05, 1], [d * 0.7, 0.7], [d, 0]],
        });
      }
    },
  },
  zChase: {
    v: 6, dur: 1.9, sr: 32000, level: 0.65, cat: 'zvocal', crit: true,
    build(K) {
      let t = 0;
      const n = K.ri(4, 6);
      const f = K.r(140, 190);
      for (let k = 0; k < n; k++) {
        if (k % 2 === 0) {
          const d = K.r(0.12, 0.2) * (k === n - 2 ? 1.8 : 1);
          zv(K, t, d, {
            f0: [[0, f * K.r(0.95, 1.15)], [d, f * 0.8]], vowel: 'a', rough: 0.75, roughHz: 50, drive: 4.5, breath: 0.6,
            amp: [[0, 0], [0.015, 1], [d * 0.6, 0.6], [d, 0]],
          });
          t += d + K.r(0.02, 0.06);
        } else {
          const d = K.r(0.09, 0.14);
          inhale(K, t, d, 0.35, K.out, 1500, 2300);
          t += d + K.r(0.03, 0.08);
        }
      }
    },
  },
  zHit: {
    v: 5, dur: 0.5, sr: 32000, level: 0.8, cat: 'impact', crit: true, ref: 3,
    build(K) {
      K.whoosh(0, 0.08, { f0: 600, f1: 2500, f2: 1200, q: 1.2, amp: 0.4 });
      const t = 0.07;
      slap(K, t, 1);
      K.crackle(t, K.r(0.08, 0.14), 900, { len: [0.2, 1], dest: K.bp(3500, 1), amp: 0.7 });
      rustle(K, t, 0.12, 0.4);
    },
  },
  zShoved: {
    v: 5, dur: 0.5, sr: 32000, level: 0.6, cat: 'zvocal', crit: true,
    build(K) {
      const d = K.r(0.2, 0.35), f = K.r(150, 190);
      zv(K, 0, d, { f0: [[0, f], [0.05, f * 1.12], [d, f * 0.6]], vowel: K.pick(['uh', 'a', 'aw']), rough: 0.7, drive: 3.5, amp: [[0, 0], [0.012, 1], [d * 0.5, 0.6], [d, 0]] });
      K.thump(0.005, { f0: 120, f1: 70, d: 0.1, amp: 0.3 });
    },
  },
  zBurn: {
    v: 3, dur: 2.4, sr: 32000, level: 0.75, cat: 'zvocal',
    build(K) {
      const d = K.r(1.6, 2.2);
      zv(K, 0, d, {
        f0: [[0, 300], [0.15, K.r(520, 650)], [0.5, K.r(450, 600)], [1.2, K.r(500, 650)], [d, 280]], vib: [7, 60],
        vowel: [[0, 'a'], [0.6, 'ae'], [d, 'a']], fs: 1.0, rough: 0.5, roughHz: 80, drive: 6, grit: true, dual: 1.33, dualAmp: 0.4, breath: 0.5, lp: 6000,
        amp: [[0, 0], [0.06, 1], [d * 0.7, 0.8], [d, 0]], tremble: [7, 0.2],
      });
      const g = K.gain(0.35);
      K.crackle(0, d, 150, { len: [0.1, 0.6], dest: K.hp(2500, 0.7, g) });
      K.noise(0, d, 'white', K.gain(0.08, K.hp(4000, 0.7, g)));
    },
  },
  zDeath: {
    v: 6, dur: 1.6, sr: 32000, level: 0.6, cat: 'zvocal', crit: true,
    build(K) {
      const d = K.r(0.8, 1.4), f = K.r(150, 190);
      zv(K, 0, d, {
        f0: [[0, f], [0.1, f * 1.08], [d, K.r(55, 70)]], vowel: [[0, 'a'], [d * 0.4, 'o'], [d, 'u']],
        rough: 0.8, roughHz: 30, drive: 3, breath: 0.4, amp: [[0, 0], [0.03, 1], [d * 0.3, 0.7], [d, 0]],
      });
      gurgle(K, d * 0.2, d * 0.8, 0.45, K.out, true);
      inhale(K, d * 0.85, 0.3, 0.15, K.out, 900, 500);
    },
  },
  hordeScream: {
    v: 3, dur: 5.0, sr: 32000, level: 0.85, cat: 'horde',
    build(K) {
      const dry = K.gain(0.6, K.lp(3200));
      // diffuse smear (small feedback-delay network) to make it sound like a distant crowd
      const wetIn = K.gain(0.5, null);
      const wetOut = K.gain(0.5, K.lp(2200));
      for (const dt of [0.023, 0.037, 0.053, 0.071]) {
        const dl = K.delay(dt * K.r(0.95, 1.05), 0.6, wetOut, 2500);
        wetIn.connect(dl);
      }
      const n = K.ri(15, 19);
      for (let k = 0; k < n; k++) {
        const t = Math.pow(K.rng(), 1.6) * 1.8;
        const d = K.r(0.6, 1.5);
        const pk = K.r(260, 700);
        const g = K.gain(K.r(0.3, 1), dry);
        g.connect(wetIn);
        zv(K, t, d, {
          f0: [[0, pk * 0.5], [K.r(0.06, 0.15), pk], [d * 0.5, pk * K.r(0.8, 1.05)], [d, pk * 0.5]],
          vowel: [[0, K.pick(['ae', 'a', 'aw'])], [d, 'a']], fs: K.r(0.85, 1.1), rough: 0.5, roughHz: K.r(50, 90), drive: 5,
          dual: K.chance(0.5) ? K.r(1.3, 1.5) : 0, breath: 0.5, lp: 5000, dest: g, jitter: 0.06,
          amp: [[0, 0], [0.05, 1], [d * 0.6, 0.7], [d, 0]],
        });
      }
      // crowd rumble under it
      K.burst(0, { color: 'brown', a: 0.6, d: 3, amp: 0.3, f: [['lowpass', 300]] });
    },
  },
  hordeRumble: {
    v: 1, dur: 8.5, sr: 32000, level: 0.65, cat: 'loop', loop: true, xfade: 0.5,
    build(K) {
      const D = 8.5;
      // many feet
      K.crackle(0, D, 45, { len: [2, 7], dest: K.lp(450, 0.7, K.gain(1.2)), ampPow: 1.2 });
      K.crackle(0, D, 25, { len: [1, 3], dest: K.bp(1500, 0.8, K.gain(0.4)), ampPow: 1.5 });
      // shuffling
      const sh = K.gain(0.25, K.bp(900, 0.7));
      K.rand(0, D, 7, 0.12, sh.gain);
      K.noise(0, D, 'pink', sh);
      // distant moans & growls
      const vb = K.gain(0.6, K.lp(1500));
      for (let k = 0; k < 9; k++) {
        const t = K.r(0, D - 1.2), d = K.r(1.0, 2.2), f = K.r(85, 170);
        zv(K, t, d, { f0: [[0, f], [d * 0.4, f * 1.1], [d, f * 0.7]], vowel: [[0, 'uh'], [d, K.pick(['o', 'u', 'a'])]], dest: K.gain(K.r(0.25, 0.6), vb), amp: [[0, 0], [0.3, 0.8], [d * 0.6, 1], [d, 0]] });
      }
      K.noise(0, D, 'brown', K.gain(0.5, K.lp(110)));
    },
  },

  // --- Hunter
  hunterGrowl: {
    v: 4, dur: 2.4, sr: 32000, level: 0.75, cat: 'special',
    build(K) {
      const d = K.r(1.6, 2.2), f = K.r(72, 90);
      zv(K, 0, d, {
        f0: [[0, f], [d * 0.5, f * 1.15], [d, f * 0.9]], vowel: [[0, 'o'], [d * 0.6, 'uh'], [d, 'u']], fs: 0.85,
        rough: 0.95, roughHz: K.r(22, 30), roughNoise: 0.3, drive: 5, grit: true, breath: 0.4, lp: 2600, tremble: [5, 0.3],
        amp: [[0, 0], [0.4, 0.8], [d * 0.6, 1], [d, 0]],
      });
      K.burst(0.1, { a: d * 0.4, d: d * 0.6, amp: 0.12, f: [['highpass', 3000]] });
      if (K.chance(0.6)) K.crackle(d * 0.3, 0.4, 60, { len: [0.2, 0.8], dest: K.bp(2500, 2), amp: 0.3 });
    },
  },
  hunterScream: {
    v: 3, dur: 1.1, sr: 32000, level: 0.9, cat: 'special',
    build(K) {
      const d = K.r(0.8, 1.0), pk = K.r(900, 1100);
      K.voice(0, d, {
        f0: [[0, 350], [0.12, pk], [d * 0.55, pk * 0.9], [d, pk * 0.55]], vowel: [[0, 'ae'], [d * 0.5, 'i'], [d, 'e']], fs: 1.05,
        dual: 1.26, dualAmp: 0.5, drive: 7, grit: true, rough: 0.4, roughHz: 95, breath: 0.6, jitter: 0.05, lp: 7500,
        amp: [[0, 0], [0.04, 1], [d * 0.7, 0.85], [d, 0]],
      });
    },
  },
  hunterPounce: {
    v: 3, dur: 0.9, sr: 32000, level: 0.9, cat: 'special',
    build(K) {
      K.whoosh(0, 0.28, { f0: 300, f1: 1800, f2: 900, q: 1, amp: 0.7, peakAt: 0.8 });
      const t = 0.26;
      const sat = K.shaper(3);
      K.thump(t, { f0: 120, f1: 50, sweep: 0.06, d: 0.25, amp: 1.1, dest: sat });
      K.burst(t, { color: 'pink', d: 0.12, amp: 0.9, f: [['lowpass', 1200]], dest: sat });
      rustle(K, t, 0.2, 0.6);
      zv(K, t - 0.05, 0.3, { f0: [[0, 260], [0.3, 180]], vowel: 'ae', rough: 0.9, drive: 6, breath: 0.6, amp: [[0, 0], [0.02, 0.7], [0.3, 0]] });
    },
  },
  hunterShred: {
    v: 3, dur: 1.6, sr: 32000, level: 0.85, cat: 'special',
    build(K) {
      const D = 1.4;
      zv(K, 0, D, { f0: [[0, K.r(120, 150)], [D, K.r(110, 140)]], vowel: 'ae', rough: 0.9, roughHz: 45, drive: 5, breath: 0.6, dest: K.gain(0.5), tremble: [8, 0.3] });
      let t = 0.02;
      while (t < D - 0.05) {
        const a = K.r(0.6, 1);
        K.burst(t, { d: 0.02, amp: a, f: [['bandpass', K.r(1600, 2600), 1.2]] });
        K.squelch(t, K.r(0.05, 0.09), { f: K.r(600, 1000), amp: a * 0.7, q: 3 });
        K.thump(t, { f0: 160, f1: 80, d: 0.05, amp: a * 0.5 });
        K.crackle(t, 0.05, 700, { len: [0.2, 1], dest: K.hp(2500), amp: 0.4 * a });
        t += K.r(0.07, 0.13);
      }
    },
  },

  // --- Smoker
  smokerCough: {
    v: 4, dur: 2.2, sr: 32000, level: 0.7, cat: 'special',
    build(K) {
      let t = 0.01;
      const n = K.ri(2, 4), f = K.r(110, 140);
      for (let k = 0; k < n; k++) {
        const d = cough(K, t, K.r(0.7, 1), f * K.r(0.9, 1.1));
        gurgle(K, t + d * 0.5, 0.15, 0.2, K.out, true);
        t += d + K.r(0.08, 0.2);
      }
      inhale(K, t + 0.05, K.r(0.3, 0.45), 0.35, K.out, 1200, 2200);
      K.crackle(t + 0.05, 0.4, 40, { len: [0.5, 2], dest: K.bp(900, 2), amp: 0.25 }); // wheeze rattle
    },
  },
  smokerTongue: {
    v: 3, dur: 1.0, sr: 32000, level: 0.85, cat: 'special',
    build(K) {
      K.whoosh(0, 0.13, { f0: 500, f1: 3200, f2: 2000, q: 1.2, amp: 0.8, peakAt: 0.9 });
      const t = 0.12;
      K.burst(t, { d: 0.012, amp: 1, f: [['highpass', 2000]] });
      K.squelch(t, 0.22, { f: 800, q: 3, amp: 0.9, rate: 60 });
      slap(K, t, 0.8);
      const tw = K.gain(0, K.out);
      K.ad(tw.gain, t, 0.005, 0.4, 0.3);
      const o = K.osc('triangle', 150, t, 0.5, tw);
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.4);
      K.lfo(t, 0.5, 18, 30, o.detune);
    },
  },
  smokerChoke: {
    v: 3, dur: 2.4, sr: 32000, level: 0.75, cat: 'voice',
    build(K) {
      let t = 0.02;
      const f = K.r(170, 230);
      while (t < 2.0) {
        const d = K.r(0.25, 0.45);
        K.voice(t, d, {
          f0: [[0, f * K.r(0.9, 1.2)], [d * 0.5, f * K.r(1.1, 1.4)], [d, f * 0.8]], vowel: [[0, K.pick(['i', 'e'])], [d, 'uh']],
          fs: 1.0, breath: 0.9, voiced: 0.5, rough: 0.9, roughHz: K.r(25, 35), drive: 3, jitter: 0.08, tremble: [18, 0.35],
          amp: [[0, 0], [0.02, 0.9], [d * 0.7, 0.6], [d, 0]], lp: 4000,
        });
        t += d + K.r(0.08, 0.25);
      }
      // tongue/rope creak & struggle
      K.crackle(0, 2.2, 45, { len: [1, 3], dest: K.bp(700, 3, K.gain(0.35)), ampPow: 0.8 });
      rustle(K, 0.3, 0.4, 0.4); rustle(K, 1.2, 0.5, 0.4);
    },
  },
  smokerDeath: {
    v: 3, dur: 2.4, sr: 32000, level: 0.8, cat: 'special',
    build(K) {
      const d = cough(K, 0.01, 1, K.r(110, 130));
      const t = d + 0.05;
      // gas cloud puff
      const g = K.gain(0, K.out);
      K.env(g.gain, t, [[0, 0], [0.06, 1], [1.0, 0.0001, 'e']]);
      const f = K.lp(3000, 0.8, g);
      K.env(f.frequency, t, [[0, 3500], [0.8, 400, 'e']]);
      K.noise(t, 1.1, 'pink', f);
      K.thump(t, { f0: 90, f1: 45, d: 0.3, amp: 0.6 });
      // long wheezing exhale
      K.voice(t + 0.2, 1.1, { f0: 90, vowel: 'u', breath: 1.2, voiced: 0.15, rough: 0.8, amp: [[0, 0], [0.1, 0.4], [1.1, 0]], drive: 2 });
    },
  },

  // --- Boomer
  boomerGurgle: {
    v: 4, dur: 2.6, sr: 32000, level: 0.7, cat: 'special',
    build(K) {
      const d = K.r(1.8, 2.4), f = K.r(62, 80);
      const bt = K.r(0.4, d - 0.8);
      K.voice(0, d, {
        f0: [[0, f], [bt, f * 0.9], [bt + 0.08, f * 1.5], [bt + 0.5, f * 1.1], [d, f * 0.75]],
        vowel: [[0, 'o'], [bt, 'u'], [bt + 0.1, 'aw'], [d, 'u']], fs: 0.75, rough: 0.95, roughHz: K.r(18, 25), roughNoise: 0.4,
        drive: 4, breath: 0.2, lp: 1800, jitter: 0.06, sub: 0.4,
        amp: [[0, 0], [0.3, 0.5], [bt, 0.5], [bt + 0.06, 1], [bt + 0.5, 0.6], [d, 0]],
      });
      gurgle(K, 0, d, 0.6, K.out, true);
    },
  },
  boomerVomit: {
    v: 3, dur: 2.2, sr: 32000, level: 0.85, cat: 'special',
    build(K) {
      const d = K.r(1.7, 2.0);
      K.voice(0, d, {
        f0: [[0, 120], [0.15, 165], [d, 90]], vowel: [[0, 'a'], [d, 'aw']], fs: 0.8, rough: 0.8, roughHz: 35, drive: 6, grit: true,
        breath: 0.8, dual: 0.75, dualAmp: 0.5, amp: [[0, 0], [0.08, 1], [d * 0.8, 0.8], [d, 0]], lp: 3500,
      });
      const sp = K.gain(0, K.out);
      K.env(sp.gain, 0.1, [[0, 0], [0.1, 0.9], [d - 0.2, 0.6], [d, 0]]);
      const am = K.gain(0.5, K.bp(1500, 0.8, sp));
      K.rand(0.1, d, 25, 0.45, am.gain);
      K.noise(0.1, d, 'white', am);
      K.crackle(0.1, d - 0.1, 400, { len: [0.3, 2], dest: K.bp(2500, 1, sp), amp: 0.6 });
      K.noise(0.1, d, 'pink', K.gain(0.5, K.lp(600, 0.7, sp)));
    },
  },
  boomerExplode: {
    v: 3, dur: 2.6, sr: 32000, level: 0.95, cat: 'explosion',
    build(K) {
      const sat = K.shaper(4);
      K.thump(0.001, { f0: 65, f1: 28, sweep: 0.2, d: 0.7, amp: 1.3, dest: sat });
      K.burst(0.001, { color: 'pink', d: 0.5, amp: 1, f: [['lowpass', 900]], dest: sat });
      K.burst(0.001, { d: 0.05, amp: 0.7, f: [['bandpass', 1200, 0.8]], dest: sat });
      K.crackle(0.005, 1.0, [[0, 900], [1, 50]], { len: [0.5, 4], dest: K.lp(2200, 0.7), amp: 0.8 });
      for (let k = 0; k < 8; k++) K.squelch(K.r(0, 0.6), K.r(0.06, 0.18), { f: K.r(400, 1200), amp: K.r(0.3, 0.7), q: 3 });
      // falling chunks & drips
      for (let k = 0; k < 10; k++) {
        const t = K.r(0.3, 2.2);
        K.burst(t, { d: 0.04, amp: K.r(0.1, 0.3), f: [['lowpass', 900]] });
        K.bubbles(t, 0.05, { rate: 60, fLo: 300, fHi: 700, amp: 0.15 });
      }
    },
  },
  boomerBile: {
    v: 3, dur: 1.4, sr: 32000, level: 0.8, cat: 'impact',
    build(K) {
      K.burst(0.001, { d: 0.15, amp: 1, f: [['bandpass', 1500, 0.8]] });
      K.crackle(0.001, 0.35, [[0, 1200], [0.35, 50]], { len: [0.3, 2], dest: K.lp(3000), amp: 0.8 });
      K.squelch(0.01, 0.3, { f: 700, amp: 0.7 });
      const sz = K.gain(0, K.out);
      K.env(sz.gain, 0.05, [[0, 0], [0.1, 0.3], [1.2, 0]]);
      K.crackle(0.05, 1.2, 600, { len: [0.1, 0.4], dest: K.hp(3000, 0.7, sz) });
    },
  },

  // --- Tank
  tankRoar: {
    v: 3, dur: 3.4, sr: 32000, level: 0.97, cat: 'tank',
    build(K) {
      const D = K.r(2.8, 3.2);
      const chest = K.peak(120, 1, 6, K.out);
      const bus = K.gain(1, chest);
      const trem = K.gain(0.85, bus);
      K.rand(0, D, 12, 0.15, trem.gain);
      const env = [[0, 0], [0.2, 0.8], [0.4, 1], [D * 0.7, 0.9], [D, 0]];
      const f = K.r(55, 65);
      const contour = [[0, f], [0.25, f * 1.5], [1.2, f * 1.4], [D * 0.8, f * 1.1], [D, f * 0.75]];
      K.voice(0, D, {
        f0: contour, vowel: [[0, 'uh'], [0.3, 'a'], [1.8, 'aw'], [D, 'o']], fs: 0.62, rough: 0.8, roughHz: 28, roughNoise: 0.35,
        drive: 6, grit: true, breath: 0.4, lp: 3000, sub: 0.8, body: 0.5, dest: trem, amp: env, jitter: 0.04,
      });
      K.voice(0.05, D - 0.05, {
        f0: contour.map(([t, v]) => [t, v * 2.02]), vowel: [[0, 'a'], [D, 'aw']], fs: 0.8, rough: 0.9, roughHz: 55, drive: 8,
        breath: 0.3, dest: K.gain(0.5, trem), amp: env, jitter: 0.06,
      });
      // noise roar
      const ng = K.gain(0, K.shaper(3, trem));
      K.env(ng.gain, 0, env.map(([t, v]) => [t, v * 0.5]));
      K.noise(0, D, 'pink', K.bp(520, 1, ng));
      // sub
      const sg = K.gain(0, trem);
      K.env(sg.gain, 0, env.map(([t, v]) => [t, v * 0.6]));
      const so = K.osc('sine', f * 0.7, 0, D, sg);
      K.env(so.frequency, 0, contour.map(([t, v]) => [t, v * 0.7, 'e']));
    },
  },
  tankStep: {
    v: 4, dur: 1.0, sr: 22050, level: 0.9, cat: 'tank', crit: false,
    build(K) {
      const sat = K.shaper(2.5);
      K.thump(0.001, { f0: K.r(52, 60), f1: 27, sweep: 0.12, d: 0.55, amp: 1.3, dest: sat });
      K.burst(0.001, { color: 'brown', d: 0.35, amp: 0.9, f: [['lowpass', 350]], dest: sat });
      K.crackle(0.01, 0.25, [[0, 150], [0.25, 0]], { len: [0.5, 3], dest: K.lp(1500), amp: 0.3 });
    },
  },
  tankPunch: {
    v: 3, dur: 1.1, sr: 32000, level: 0.97, cat: 'tank',
    build(K) {
      K.whoosh(0, 0.12, { f0: 200, f1: 900, f2: 500, amp: 0.5, peakAt: 0.9 });
      const t = 0.1, sat = K.shaper(5);
      K.thump(t, { f0: 95, f1: 35, sweep: 0.1, d: 0.55, amp: 1.4, dest: sat });
      K.burst(t, { d: 0.22, amp: 1, f: [['lowpass', 1500]], dest: sat });
      K.crackle(t, 0.12, 1500, { len: [0.2, 1.5], dest: K.bp(2500, 1), amp: 0.8 });
      K.squelch(t, 0.2, { f: 600, amp: 0.5 });
    },
  },
  tankRock: {
    v: 3, dur: 2.4, sr: 32000, level: 0.9, cat: 'tank',
    build(K) {
      const tr = K.r(1.2, 1.5);
      K.crackle(0, tr, [[0, 40], [tr * 0.7, 350], [tr, 700]], { len: [0.5, 3], dest: K.bp(1200, 0.9), amp: 0.9 });
      const gr = K.gain(0, K.out);
      K.env(gr.gain, 0, [[0, 0], [tr, 0.9], [tr + 0.3, 0]]);
      const am = K.gain(0.5, K.lp(320, 0.8, gr));
      K.rand(0, tr + 0.4, 15, 0.45, am.gain);
      K.noise(0, tr + 0.4, 'brown', am);
      for (let k = 0; k < 4; k++) K.burst(K.r(0.2, tr), { d: 0.03, amp: K.r(0.3, 0.6), f: [['highpass', 1500]] });
      // final tear
      K.burst(tr, { d: 0.05, amp: 1, f: [['highpass', 1000]] });
      K.thump(tr, { f0: 80, f1: 35, d: 0.4, amp: 1 });
      K.crackle(tr, 0.9, [[0, 400], [0.9, 0]], { len: [0.5, 5], dest: K.lp(2000), amp: 0.6 });
    },
  },
  tankRockHit: {
    v: 3, dur: 2.2, sr: 32000, level: 0.97, cat: 'tank',
    build(K) {
      const sat = K.shaper(4);
      K.thump(0.001, { f0: 72, f1: 30, sweep: 0.15, d: 0.7, amp: 1.3, dest: sat });
      K.burst(0.001, { d: 0.3, amp: 1.1, f: [['lowpass', 2500]], fenv: [[0, 3000], [0.3, 500]], dest: sat });
      K.crackle(0.005, 1.5, [[0, 900], [0.3, 300], [1.5, 0]], { len: [0.5, 4], dest: K.bp(1500, 0.7), amp: 0.8 });
      K.crackle(0.05, 1.2, [[0, 40], [1.2, 0]], { len: [3, 8], dest: K.lp(600), amp: 0.7 });
      K.burst(0.02, { color: 'pink', a: 0.05, d: 1.2, amp: 0.3, f: [['lowpass', 1200]] });
    },
  },
  tankDeath: {
    v: 2, dur: 4.8, sr: 32000, level: 0.95, cat: 'tank',
    build(K) {
      const D = 3.2, f = K.r(70, 85);
      K.voice(0, D, {
        f0: [[0, f], [0.3, f * 1.15], [D, 36]], vowel: [[0, 'a'], [1.4, 'o'], [D, 'u']], fs: 0.62, rough: 0.9, roughHz: 24, roughNoise: 0.4,
        drive: 6, grit: true, breath: 0.5, lp: 2400, sub: 0.7, body: 0.5, tremble: [9, 0.3],
        amp: [[0, 0], [0.2, 1], [1.5, 0.8], [2.6, 0.4], [D, 0]],
      });
      gurgle(K, 1.0, 2.2, 0.5, K.out, true);
      const t = D + 0.1;
      K.thump(t, { f0: 55, f1: 24, sweep: 0.2, d: 0.9, amp: 1.2 });
      K.burst(t, { color: 'brown', d: 0.5, amp: 0.8, f: [['lowpass', 400]] });
      K.crackle(t, 0.8, [[0, 200], [0.8, 0]], { len: [0.5, 3], dest: K.lp(1500), amp: 0.4 });
    },
  },

  // --- Witch
  witchCry: {
    v: 6, dur: 7, sr: 32000, level: 0.7, cat: 'witch', chain: true,
    build(K) {
      const dest = K.gain(1);
      let t = 0.02;
      // shaky gasping inhale ("hic" catches)
      const nh = K.ri(1, 3);
      for (let k = 0; k < nh; k++) {
        const d = K.r(0.12, 0.3);
        const g = inhale(K, t, d, K.r(0.25, 0.4), dest, 1700, 2700);
        t += d + K.r(0.03, 0.1);
      }
      t += K.r(0.05, 0.15);
      const fBase = K.r(320, 400);
      const ns = K.ri(2, 4);
      for (let k = 0; k < ns; k++) {
        const d = K.r(0.25, 0.55);
        const f = fBase * K.r(0.92, 1.12);
        K.voice(t, d, {
          f0: [[0, f], [d * 0.3, f * 1.05], [d, f * K.r(0.7, 0.8)]], vowel: [[0, K.pick(['u', 'uh', 'o'])], [d, 'uh']], fs: 1.2,
          breath: 0.7, voiced: 0.7, rough: 0.25, roughHz: 60, jitter: 0.04, vib: [6, 25], tremble: [K.r(8, 11), 0.35],
          amp: [[0, 0], [0.03, 0.8], [d * 0.6, 0.6], [d, 0]], lp: 5000, dest, dual: 1.414, dualAmp: 0.08,
        });
        t += d + K.r(0.06, 0.18);
      }
      // long descending wail
      const d = K.r(0.9, 1.5), f = K.r(430, 540);
      K.voice(t, d, {
        f0: [[0, f], [d * 0.25, f * 1.08], [d, f * K.r(0.5, 0.58)]], vowel: [[0, 'o'], [d, 'u']], fs: 1.2, breath: 0.55, voiced: 0.8,
        rough: 0.2, roughHz: 70, jitter: 0.035, vib: [5.5, 40], tremble: [K.r(6, 9), 0.3], lp: 5000, dest,
        amp: [[0, 0], [0.1, 0.9], [d * 0.6, 0.7], [d, 0]], dual: 0.5, dualAmp: 0.1,
      });
      t += d + K.r(0.2, 0.5);
      // sniffles
      for (let k = 0; k < K.ri(1, 3); k++) {
        K.burst(t, { a: 0.02, d: 0.08, amp: 0.25, f: [['bandpass', K.r(2500, 3500), 2]], dest });
        t += K.r(0.15, 0.3);
      }
    },
  },
  witchGrowl: {
    v: 4, dur: 2.6, sr: 32000, level: 0.75, cat: 'witch',
    build(K) {
      const d = K.r(1.6, 2.4), f = K.r(170, 210);
      K.voice(0, d, {
        f0: [[0, f], [d, f * 0.85]], vowel: [[0, 'ae'], [d, 'i']], fs: 1.12, rough: 0.95, roughHz: K.r(35, 50), roughNoise: 0.4,
        drive: 5, grit: true, breath: 0.9, breathHp: 1500, jitter: 0.07, lp: 6000,
        amp: [[0, 0], [0.1, 0.4], [0.3, 0.15], [0.5, 0.6], [0.7, 0.25], [1.0, 0.9], [d * 0.9, 0.8], [d, 0]],
      });
      K.burst(0, { a: d * 0.5, d: d * 0.5, amp: 0.2, f: [['highpass', 3500]] });
    },
  },
  witchScream: {
    v: 3, dur: 2.4, sr: 32000, level: 0.95, cat: 'witch', ref: 12,
    build(K) {
      const pk = K.r(1100, 1300);
      const D = K.r(1.8, 2.1);
      K.voice(0, D, {
        f0: [[0, 500], [0.08, pk], [0.6, pk * 0.9], [1.4, pk * 0.8], [D, pk * 0.55]], vowel: [[0, 'ae'], [0.5, 'i'], [D, 'ae']], fs: 1.25,
        dual: 1.06, dualAmp: 0.8, sub: 0.3, rough: 0.35, roughHz: 110, drive: 8, grit: true, breath: 0.7, vib: [8, 50], lp: 8000,
        amp: [[0, 0], [0.03, 1], [D * 0.7, 0.85], [D, 0]],
      });
      const ng = K.gain(0, K.out);
      K.env(ng.gain, 0, [[0, 0], [0.1, 0.35], [D, 0]]);
      K.noise(0, D, 'pink', K.bp(2500, 1.5, ng));
    },
  },
  witchSlash: {
    v: 3, dur: 0.8, sr: 32000, level: 0.9, cat: 'witch',
    build(K) {
      K.whoosh(0, 0.12, { f0: 800, f1: 3000, f2: 1500, q: 1.3, amp: 0.7, peakAt: 0.8 });
      const t = 0.1, sat = K.shaper(3);
      K.burst(t, { d: 0.05, amp: 1, f: [['bandpass', 1500, 1]], dest: sat });
      K.thump(t, { f0: 140, f1: 60, d: 0.14, amp: 0.8, dest: sat });
      K.squelch(t, 0.22, { f: 900, amp: 0.8 });
      K.crackle(t, 0.1, 800, { len: [0.2, 1], dest: K.hp(2000), amp: 0.5 });
    },
  },

  // --- Survivors
  hurtMale: {
    v: 8, dur: 0.7, sr: 32000, level: 0.75, cat: 'voice', crit: true,
    build(K, i) { hurt(K, i, 1, 1); },
  },
  hurtFemale: {
    v: 8, dur: 0.7, sr: 32000, level: 0.75, cat: 'voice', crit: true,
    build(K, i) { hurt(K, i, K.r(1.8, 2.0), 1.17); },
  },
  jump: {
    v: 4, dur: 0.4, sr: 32000, level: 0.4, cat: 'foley', crit: true,
    build(K) {
      K.voice(0.02, 0.13, { f0: [[0, 150], [0.13, 130]], vowel: 'uh', breath: 1.0, voiced: 0.2, rough: 0.3, amp: [[0, 0], [0.015, 0.6], [0.13, 0]] });
      rustle(K, 0, 0.2, 0.6);
      for (let k = 0; k < 3; k++) K.modal(K.r(0.02, 0.15), [[K.r(3000, 5000), 0.04, 0.1]]);
    },
  },
  land: {
    v: 4, dur: 0.5, sr: 32000, level: 0.55, cat: 'foley', crit: true,
    build(K) {
      K.thump(0.001, { f0: K.r(100, 120), f1: 55, d: 0.14, amp: 1 });
      K.burst(0.001, { d: 0.05, amp: 0.6, f: [['bandpass', 1500, 1]] });
      rustle(K, 0.01, 0.15, 0.5);
      for (let k = 0; k < 3; k++) K.modal(K.r(0.01, 0.1), [[K.r(2500, 4500), 0.05, 0.12], [K.r(5000, 7000), 0.03, 0.06]]);
    },
  },
  _heartbeat: {
    v: 2, dur: 0.7, sr: 22050, level: 0.85, cat: 'ui', crit: true, jitter: 0,
    build(K) {
      K.thump(0.001, { f0: 68, f1: 40, sweep: 0.06, d: 0.18, amp: 1 });
      K.burst(0.001, { color: 'brown', d: 0.1, amp: 0.4, f: [['lowpass', 160]] });
      K.thump(0.21, { f0: 78, f1: 45, sweep: 0.05, d: 0.14, amp: 0.7 });
      K.burst(0.21, { color: 'brown', d: 0.08, amp: 0.3, f: [['lowpass', 180]] });
    },
  },
};

// pain grunt: several shapes ('uh!', 'agh', 'nngh', 'ow', 'hah')
function hurt(K, i, pm, fs) {
  const type = i % 4;
  const f = K.r(115, 150) * pm;
  let d, f0, vowel, rough = 0.3, drive = 1.6;
  if (type === 0) { d = K.r(0.2, 0.3); f0 = [[0, f], [0.04, f * 1.28], [d, f * 0.9]]; vowel = [[0, 'uh'], [d, 'uh']]; }
  else if (type === 1) { d = K.r(0.35, 0.45); f0 = [[0, f * 1.05], [0.06, f * 1.35], [d, f * 0.8]]; vowel = [[0, 'a'], [d, 'uh']]; drive = 2.2; rough = 0.45; }
  else if (type === 2) { d = K.r(0.3, 0.4); f0 = [[0, f * 1.1], [d * 0.4, f * 1.2], [d, f * 0.85]]; vowel = [[0, 'm'], [d, 'm']]; rough = 0.6; }
  else { d = K.r(0.3, 0.4); f0 = [[0, f * 1.2], [0.05, f * 1.4], [d, f * 0.95]]; vowel = [[0, 'a'], [d * 0.6, 'o'], [d, 'u']]; }
  K.voice(0.005, d, {
    f0, vowel, fs: fs * K.r(0.96, 1.04), breath: 0.35, rough, roughHz: 50, jitter: 0.02, jitterHz: 10, drive, lp: 4200,
    amp: [[0, 0], [K.r(0.008, 0.02), 1], [d * 0.5, 0.75], [d, 0]], body: 0.35,
  });
  inhale(K, 0.005 + d, K.r(0.12, 0.2), 0.12, K.out, 900, 600);
}
