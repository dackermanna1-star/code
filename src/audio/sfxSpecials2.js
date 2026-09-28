// Charger / Jockey / Spitter sounds and the acid pool (all original, fully
// synthesised with the dsp Kit like the rest of the creature set).
//   Charger: low bellowing idle, a rising war-bellow tell before the charge,
//            a roaring run, thundering steps, body impacts and ground slams.
//   Jockey:  a giggling cackle (the tell), a shriek on the leap, frantic
//            gibbering while riding, a strangled squeal on death.
//   Spitter: wet hissing idle, a throat-gathering hock (the tell), the spit,
//            the splat, a looping acid sizzle and skin-burn hiss.

function zv(K, t, dur, o) {
  return K.voice(t, dur, Object.assign({
    fs: K.r(0.84, 0.95), rough: 0.6, roughHz: K.r(30, 55), jitter: 0.05, jitterHz: 16, drive: 3, breath: 0.25, lp: 3800,
  }, o));
}
function wet(K, t, dur, amp = 0.5, dest = K.out, lo = 160, hi = 520) {
  const g = K.gain(amp, dest);
  K.bubbles(t, dur, { rate: K.r(30, 48), fLo: lo, fHi: hi, dest: g, amp: 0.8 });
  K.squelch(t, dur, { f: (lo + hi) * 0.8, q: 3, amp: 0.45, rate: 32, dest: g, a: 0.04 });
  return g;
}
function hiss(K, t, dur, amp = 0.4, f = 4200, dest = K.out) {
  const g = K.gain(0, dest);
  K.env(g.gain, t, [[0, 0], [Math.min(0.08, dur * 0.2), amp], [dur, 0]]);
  K.noise(t, dur, 'white', K.hp(f, 0.8, g));
  return g;
}

export const SPECIAL2_SFX = {
  // ------------------------------------------------------------ Charger
  chargerIdle: {
    v: 4, dur: 2.6, sr: 32000, level: 0.8, cat: 'special',
    build(K) {
      const d = K.r(1.5, 2.1), f = K.r(58, 70);
      zv(K, 0, d, {
        f0: [[0, f], [d * 0.35, f * 1.25], [d * 0.7, f * 1.05], [d, f * 0.8]], vowel: [[0, 'o'], [d * 0.4, 'aw'], [d, 'uh']], fs: 0.7,
        rough: 0.95, roughHz: K.r(20, 26), roughNoise: 0.4, drive: 5, grit: true, breath: 0.35, lp: 2200, sub: 0.5,
        amp: [[0, 0], [0.25, 0.8], [d * 0.5, 1], [d, 0]],
      });
      // nasal snort
      const t = d + 0.05;
      K.burst(t, { d: 0.18, amp: 0.5, f: [['bandpass', 900, 1.2]], color: 'pink' });
      K.burst(t + 0.02, { d: 0.1, amp: 0.3, f: [['lowpass', 400]], color: 'brown' });
    },
  },
  chargerWarn: {
    v: 3, dur: 1.6, sr: 32000, level: 0.97, cat: 'special',
    build(K) {
      const d = K.r(1.15, 1.35), f = K.r(85, 100);
      const chest = K.peak(140, 1, 5, K.out);
      zv(K, 0, d, {
        f0: [[0, f], [0.2, f * 1.9], [d * 0.6, f * 2.1], [d, f * 1.4]], vowel: [[0, 'uh'], [0.2, 'a'], [d * 0.7, 'aw'], [d, 'o']], fs: 0.72,
        rough: 0.85, roughHz: 32, roughNoise: 0.35, drive: 7, grit: true, dual: 0.75, dualAmp: 0.45, breath: 0.5, lp: 4200, sub: 0.4,
        amp: [[0, 0], [0.08, 0.7], [0.3, 1], [d * 0.8, 0.9], [d, 0]], dest: chest,
      });
      // foot stamps / pawing
      for (const t of [0.15, 0.55, 0.9]) {
        K.thump(t, { f0: 70, f1: 32, sweep: 0.1, d: 0.3, amp: 0.8 });
        K.burst(t, { color: 'brown', d: 0.15, amp: 0.5, f: [['lowpass', 400]] });
      }
    },
  },
  chargerCharge: {
    v: 3, dur: 2.0, sr: 32000, level: 0.97, cat: 'special',
    build(K) {
      const d = K.r(1.5, 1.8), f = K.r(150, 175);
      zv(K, 0, d, {
        f0: [[0, f * 0.8], [0.12, f * 1.3], [d * 0.5, f * 1.2], [d, f * 0.7]], vowel: [[0, 'ae'], [d * 0.5, 'a'], [d, 'aw']], fs: 0.82,
        rough: 0.7, roughHz: 48, drive: 8, grit: true, dual: 1.5, dualAmp: 0.35, breath: 0.7, lp: 6000, tremble: [9, 0.25],
        amp: [[0, 0], [0.05, 1], [d * 0.75, 0.85], [d, 0]],
      });
      K.whoosh(0.05, d, { f0: 200, f1: 900, f2: 400, q: 0.8, amp: 0.35, peakAt: 0.5 });
    },
  },
  chargerStep: {
    v: 4, dur: 0.8, sr: 22050, level: 0.85, cat: 'tank',
    build(K) {
      const sat = K.shaper(2.2);
      K.thump(0.001, { f0: K.r(62, 72), f1: 34, sweep: 0.1, d: 0.4, amp: 1.1, dest: sat });
      K.burst(0.001, { color: 'brown', d: 0.22, amp: 0.8, f: [['lowpass', 420]], dest: sat });
      K.burst(0.005, { d: 0.03, amp: 0.25, f: [['bandpass', 1800, 1]] });
    },
  },
  chargerImpact: {
    v: 3, dur: 1.2, sr: 32000, level: 0.97, cat: 'tank',
    build(K) {
      const sat = K.shaper(5);
      K.thump(0.001, { f0: K.r(85, 100), f1: 30, sweep: 0.12, d: 0.6, amp: 1.4, dest: sat });
      K.burst(0.001, { color: 'pink', d: 0.3, amp: 1, f: [['lowpass', 1400]], dest: sat });
      K.crackle(0.002, 0.18, 1400, { len: [0.2, 1.5], dest: K.bp(2600, 1), amp: 0.7 });
      K.squelch(0.01, 0.15, { f: 520, amp: 0.5 });
      // debris settling
      K.crackle(0.12, 0.6, [[0, 300], [0.6, 0]], { len: [0.5, 3], dest: K.lp(2500), amp: 0.3 });
    },
  },
  chargerSlam: {
    v: 4, dur: 1.2, sr: 32000, level: 0.97, cat: 'tank',
    build(K) {
      K.whoosh(0, 0.16, { f0: 160, f1: 700, f2: 300, amp: 0.4, peakAt: 0.9 });
      const t = 0.14, sat = K.shaper(4);
      K.thump(t, { f0: 75, f1: 28, sweep: 0.15, d: 0.6, amp: 1.4, dest: sat });
      K.burst(t, { color: 'brown', d: 0.3, amp: 0.9, f: [['lowpass', 600]], dest: sat });
      K.crackle(t, 0.1, 2200, { len: [0.2, 1], dest: K.hp(2200), amp: 0.6 }); // crunch
      K.squelch(t, 0.25, { f: K.r(380, 560), amp: 0.7, q: 3 });
      zv(K, t - 0.1, 0.35, { f0: [[0, 110], [0.35, 70]], vowel: 'uh', fs: 0.7, rough: 0.9, drive: 6, amp: [[0, 0], [0.05, 0.6], [0.35, 0]], lp: 2000 });
    },
  },
  chargerDeath: {
    v: 2, dur: 2.4, sr: 32000, level: 0.95, cat: 'special',
    build(K) {
      const d = K.r(1.4, 1.7), f = K.r(110, 125);
      zv(K, 0, d, {
        f0: [[0, f * 1.4], [0.2, f * 1.6], [d * 0.6, f * 0.9], [d, f * 0.45]], vowel: [[0, 'a'], [d * 0.5, 'aw'], [d, 'u']], fs: 0.72,
        rough: 0.9, roughHz: 26, roughNoise: 0.4, drive: 6, grit: true, breath: 0.6, lp: 3000, sub: 0.4,
        amp: [[0, 0], [0.05, 1], [d * 0.6, 0.7], [d, 0]],
      });
      wet(K, d * 0.5, d * 0.5, 0.4, K.out, 90, 300);
      K.thump(d + 0.1, { f0: 60, f1: 30, d: 0.5, amp: 1 });
      K.burst(d + 0.1, { color: 'brown', d: 0.3, amp: 0.6, f: [['lowpass', 500]] });
    },
  },

  // ------------------------------------------------------------- Jockey
  jockeyLaugh: {
    v: 6, dur: 1.9, sr: 32000, level: 0.85, cat: 'special',
    build(K) {
      let t = 0.02;
      const n = K.ri(5, 9), f = K.r(330, 420);
      for (let k = 0; k < n; k++) {
        const d = K.r(0.07, 0.12);
        const p = f * K.r(0.85, 1.25) * (1 + 0.04 * k);
        K.voice(t, d, {
          f0: [[0, p * 1.1], [d, p * 0.85]], vowel: [[0, K.pick(['i', 'e', 'ae'])], [d, 'i']], fs: 1.12, breath: 0.9, voiced: 0.7,
          rough: 0.6, roughHz: 70, drive: 4, grit: true, jitter: 0.08, lp: 6500,
          amp: [[0, 0], [0.008, 1], [d * 0.6, 0.6], [d, 0]],
        });
        inhaleClick(K, t + d);
        t += d + K.r(0.03, 0.08);
      }
      // wheezing intake at the end
      const g = K.gain(0, K.out);
      K.env(g.gain, t, [[0, 0], [0.12, 0.35], [0.3, 0]]);
      K.noise(t, 0.3, 'white', K.bp(2600, 2, g));
    },
  },
  jockeyLeap: {
    v: 3, dur: 0.9, sr: 32000, level: 0.92, cat: 'special',
    build(K) {
      const d = K.r(0.5, 0.65), pk = K.r(700, 850);
      K.voice(0, d, {
        f0: [[0, 380], [0.1, pk], [d, pk * 1.15]], vowel: [[0, 'ae'], [d * 0.4, 'i'], [d, 'i']], fs: 1.15,
        dual: 1.33, dualAmp: 0.4, drive: 7, grit: true, rough: 0.45, roughHz: 90, breath: 0.6, lp: 8000,
        amp: [[0, 0], [0.03, 1], [d * 0.8, 0.9], [d, 0]],
      });
      K.whoosh(0.05, 0.35, { f0: 400, f1: 1600, f2: 700, q: 1, amp: 0.4, peakAt: 0.6 });
    },
  },
  jockeyRide: {
    v: 5, dur: 1.6, sr: 32000, level: 0.88, cat: 'special',
    build(K) {
      let t = 0.01;
      const f = K.r(360, 460);
      while (t < 1.3) {
        const d = K.r(0.05, 0.1);
        K.voice(t, d, {
          f0: [[0, f * K.r(0.8, 1.35)], [d, f * K.r(0.7, 1.1)]], vowel: K.pick(['i', 'e', 'ae', 'uh']), fs: 1.1, breath: 0.8, voiced: 0.6,
          rough: 0.7, roughHz: 60, drive: 5, grit: true, jitter: 0.1, lp: 6000,
          amp: [[0, 0], [0.006, 0.9], [d, 0]],
        });
        t += d + K.r(0.01, 0.05);
      }
      wet(K, 0.1, 1.1, 0.2, K.out, 300, 900);
    },
  },
  jockeyDeath: {
    v: 2, dur: 1.4, sr: 32000, level: 0.9, cat: 'special',
    build(K) {
      const d = K.r(0.8, 1.0), f = K.r(500, 600);
      K.voice(0, d, {
        f0: [[0, f], [0.15, f * 1.2], [d, f * 0.35]], vowel: [[0, 'i'], [d * 0.5, 'e'], [d, 'uh']], fs: 1.1, breath: 0.8,
        rough: 0.8, roughHz: 40, drive: 6, grit: true, jitter: 0.1, tremble: [14, 0.4], lp: 6000,
        amp: [[0, 0], [0.02, 1], [d * 0.7, 0.5], [d, 0]],
      });
      wet(K, d * 0.6, 0.4, 0.3);
    },
  },

  // ------------------------------------------------------------ Spitter
  spitterIdle: {
    v: 4, dur: 2.4, sr: 32000, level: 0.8, cat: 'special',
    build(K) {
      const d = K.r(1.3, 1.9), f = K.r(150, 190);
      K.voice(0, d, {
        f0: [[0, f], [d * 0.5, f * 0.85], [d, f * 1.1]], vowel: [[0, 'e'], [d * 0.5, 'ae'], [d, 'i']], fs: 1.05, breath: 1.3, voiced: 0.35,
        rough: 0.9, roughHz: 30, drive: 4, jitter: 0.07, tremble: [7, 0.3], lp: 5500,
        amp: [[0, 0], [0.2, 0.7], [d * 0.6, 0.9], [d, 0]],
      });
      wet(K, 0.1, d, 0.45, K.out, 250, 800);
      hiss(K, d * 0.4, d * 0.7, 0.18, 3800);
    },
  },
  spitterHock: {
    v: 3, dur: 1.2, sr: 32000, level: 0.92, cat: 'special',
    build(K) {
      // throat gathers acid: rising gargle + snorting inhale
      const g = K.gain(0, K.out);
      K.env(g.gain, 0, [[0, 0], [0.7, 0.9], [0.85, 0]]);
      K.bubbles(0, 0.85, { rate: 40, fLo: 120, fHi: 900, dest: g, amp: 0.9 });
      const b = K.bp(700, 3, g);
      K.env(b.frequency, 0, [[0, 400], [0.8, 1600, 'e']]);
      K.noise(0, 0.85, 'pink', b);
      K.voice(0.05, 0.8, { f0: [[0, 120], [0.8, 260]], vowel: [[0, 'uh'], [0.8, 'er']], fs: 1, breath: 1, voiced: 0.4, rough: 1, roughHz: 22, drive: 5, grit: true, amp: [[0, 0], [0.2, 0.5], [0.75, 0.8], [0.8, 0]], lp: 3500 });
    },
  },
  spitterSpit: {
    v: 3, dur: 0.8, sr: 32000, level: 0.95, cat: 'special',
    build(K) {
      K.burst(0.001, { d: 0.06, amp: 1, f: [['bandpass', 1300, 0.8]] });
      K.squelch(0.001, 0.2, { f: 700, amp: 0.9, q: 3, rate: 60 });
      K.voice(0, 0.18, { f0: [[0, 220], [0.18, 150]], vowel: 'uh', breath: 1.2, voiced: 0.4, rough: 0.8, drive: 5, amp: [[0, 0], [0.01, 0.8], [0.18, 0]], lp: 4000 });
      K.whoosh(0.02, 0.3, { f0: 900, f1: 2400, f2: 1200, q: 1.1, amp: 0.3, peakAt: 0.3 });
    },
  },
  spitterSplat: {
    v: 3, dur: 1.6, sr: 32000, level: 0.95, cat: 'impact',
    build(K) {
      K.burst(0.001, { d: 0.12, amp: 1, f: [['bandpass', 1100, 0.7]] });
      K.thump(0.001, { f0: 140, f1: 70, d: 0.12, amp: 0.6 });
      for (let k = 0; k < 6; k++) K.squelch(K.r(0, 0.2), K.r(0.05, 0.14), { f: K.r(500, 1300), amp: K.r(0.3, 0.6), q: 3 });
      // the acid starts eating the floor
      const sz = K.gain(0, K.out);
      K.env(sz.gain, 0.05, [[0, 0], [0.15, 0.5], [1.4, 0]]);
      K.crackle(0.05, 1.4, 900, { len: [0.1, 0.4], dest: K.hp(3200, 0.7, sz) });
      K.noise(0.05, 1.4, 'white', K.gain(0.25, K.hp(5000, 0.7, sz)));
    },
  },
  acidSizzle: {
    v: 1, dur: 3.05, sr: 32000, level: 0.6, cat: 'loop', loop: true, xfade: 0.15,
    build(K) {
      const D = 3.05;
      const bus = K.gain(1, K.out);
      const h = K.gain(0.28, K.hp(4200, 0.7, bus));
      K.rand(0, D, 6, 0.1, h.gain);
      K.noise(0, D, 'white', h);
      K.crackle(0, D, 700, { len: [0.1, 0.5], dest: K.hp(2600, 0.7, K.gain(0.7, bus)) });
      K.bubbles(0, D, { rate: 18, fLo: 400, fHi: 1400, dest: K.gain(0.25, bus), amp: 0.8 });
    },
  },
  acidBurn: {
    v: 3, dur: 0.7, sr: 32000, level: 0.7, cat: 'impact',
    build(K) {
      hiss(K, 0, 0.55, 0.5, 3500);
      K.crackle(0, 0.5, 1200, { len: [0.1, 0.4], dest: K.hp(3000), amp: 0.5 });
    },
  },
  spitterDeath: {
    v: 2, dur: 2.2, sr: 32000, level: 0.95, cat: 'special',
    build(K) {
      const d = K.r(0.8, 1.0), f = K.r(260, 320);
      K.voice(0, d, {
        f0: [[0, f], [0.1, f * 1.3], [d, f * 0.5]], vowel: [[0, 'ae'], [d * 0.5, 'e'], [d, 'uh']], fs: 1.05, breath: 1, voiced: 0.6,
        rough: 0.9, roughHz: 28, drive: 6, grit: true, jitter: 0.08, lp: 5000,
        amp: [[0, 0], [0.02, 1], [d * 0.6, 0.6], [d, 0]],
      });
      wet(K, d * 0.4, 0.6, 0.6, K.out, 200, 700);
      K.burst(d * 0.7, { d: 0.1, amp: 0.8, f: [['bandpass', 900, 0.7]] });
      hiss(K, d * 0.7, 1.2, 0.35, 3800);
    },
  },
};

// tiny glottal click between laugh syllables
function inhaleClick(K, t) {
  K.burst(t, { d: 0.008, amp: 0.15, f: [['bandpass', 2500, 2]] });
}
