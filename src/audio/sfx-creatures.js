// Dead County audio — zombie vocalisations, player body/voice sounds, animals.
// Zombie voices: formant synthesis (detuned sawtooth + subharmonic + AM growl + breath noise through
// band-pass formant banks with random vowel morphs and pitch contours), shifted down for a bigger,
// wrong-sounding throat. Every variant draws its own contour / vowels / roughness.

import { burst, tone, voice, crackle, bubbles, thud, scrape, click } from './instruments.js';

const ZV = { cat: 'sfx', sr: 'lo', group: 'zvoice', groupCap: 10, cap: 4, ref: 3, maxDist: 45, send: 0.14, pv: 0.09, vv: 0.15, prio: 3 };

const ZVOW = ['u', 'o', 'uh', 'aw', 'a', 'er'];

/** random vowel path with n points spread over the sound */
function vowelPath(s, pool, n) {
  const pts = [[0, s.pick(pool)]];
  for (let i = 1; i < n; i++) pts.push([Math.min(1, i / (n - 1) + s.rand(-0.08, 0.08)), s.pick(pool)]);
  pts.sort((a, b) => a[0] - b[0]);
  return pts;
}
/** random pitch contour (semitones): start, wander, end drop */
function contourPath(s, { start = 0, peak = 3, end = -6, wiggles = 2, wig = 1.5 }) {
  const pts = [[0, start + s.rand(-1, 1)]];
  const pkAt = s.rand(0.15, 0.45);
  pts.push([pkAt, peak + s.rand(-1, 1)]);
  for (let i = 0; i < wiggles; i++) pts.push([pkAt + ((1 - pkAt) * (i + 1)) / (wiggles + 2), peak * 0.4 + s.rand(-wig, wig)]);
  pts.push([1, end + s.rand(-1.5, 1.5)]);
  return pts;
}

/** wet "throat" layer: gurgling crackle under the voice */
function throatGunk(s, t, dur, peak) {
  crackle(s, { t, dur, rate: 260, gmin: 0.002, gmax: 0.008, pow: 1.6, filters: [['lowpass', 900], ['highpass', 120]], peak, ampEnv: [[0, 0], [0.2, 1], [0.8, 0.8], [1, 0]] });
}

export const CREATURE_SOUNDS = {
  // ------------------------------------------------------------------ zombies
  zombie_groan: {
    ...ZV, dur: 2.6, variants: 6, level: 0.58,
    render: (s, v) => {
      const dur = s.rand(1.2, 2.3);
      const fry = v % 3 === 2; // glottal-fry (creaky) variants
      voice(s, {
        t: 0.02, dur, f0: s.rand(66, 100), contour: contourPath(s, { start: -1, peak: s.rand(1, 4), end: s.rand(-9, -5) }),
        beat: s.rand(10, 25), beatGain: 0.6, sub: s.rand(0.25, 0.5),
        jitter: s.rand(0.4, 0.9), jitterRate: 10,
        rough: fry ? 0.42 : s.rand(0.22, 0.4), roughRate: fry ? s.rand(16, 22) : s.rand(24, 38), roughWave: fry ? 'square' : 'sine', roughJit: 6,
        vowels: vowelPath(s, ZVOW, s.irand(2, 4)), fshift: s.rand(0.78, 0.9), bw: s.rand(1.6, 2.2),
        breath: s.rand(0.1, 0.2), breathF: 1100, raw: 0.14,
        drive: 1.6, preDrive: 2, lp: s.rand(3000, 4200),
        env: [[0, 0], [s.rand(0.1, 0.25), 1], [0.55, s.rand(0.7, 1)], [0.85, 0.6], [1, 0]],
      });
      if (s.chance(0.5)) throatGunk(s, 0.1, dur * 0.8, 0.12);
    },
  },
  zombie_idle: {
    ...ZV, dur: 2.0, variants: 6, level: 0.5, ref: 2.5, maxDist: 30,
    render: (s, v) => {
      // low breathy moans / grunts, sometimes two short ones
      const n = v % 3 === 0 ? 2 : 1;
      let t = 0.02;
      for (let i = 0; i < n; i++) {
        const dur = n === 2 ? s.rand(0.45, 0.7) : s.rand(0.8, 1.5);
        voice(s, {
          t, dur, f0: s.rand(58, 86), contour: [[0, s.rand(0, 2)], [0.4, s.rand(0, 2)], [1, s.rand(-6, -3)]],
          beat: s.rand(8, 20), sub: s.rand(0.3, 0.5), jitter: 0.6,
          rough: s.rand(0.28, 0.42), roughRate: s.rand(16, 28), roughWave: v % 2 ? 'square' : 'sine', roughJit: 5,
          vowels: vowelPath(s, ['u', 'o', 'er', 'uh'], 2), fshift: s.rand(0.75, 0.85), bw: 2.0,
          breath: s.rand(0.35, 0.6), breathF: 900, breathQ: 0.6, raw: 0.2,
          drive: 1.3, preDrive: 2, lp: 2600,
          env: [[0, 0], [0.25, 0.8], [0.6, 1], [1, 0]],
        });
        t += dur + s.rand(0.08, 0.25);
      }
    },
  },
  zombie_alert: {
    ...ZV, dur: 1.2, variants: 5, level: 0.58, maxDist: 55, cap: 3,
    render: (s) => {
      const dur = s.rand(0.6, 0.95);
      voice(s, {
        t: 0.01, dur, f0: s.rand(140, 200), contour: [[0, -3], [0.15, s.rand(2, 5)], [0.5, s.rand(0, 3)], [1, s.rand(-8, -4)]],
        beat: s.rand(20, 40), beatGain: 0.7, sub: s.rand(0.3, 0.45),
        jitter: 1.1, jitterRate: 18, rough: s.rand(0.32, 0.45), roughRate: s.rand(45, 65), roughJit: 12,
        vowels: vowelPath(s, ['a', 'ae', 'aw', 'uh'], 3), fshift: s.rand(0.85, 0.95), bw: 1.7,
        breath: 0.2, breathF: 2000, hiss: 0.05, hissF: 3000,
        drive: 3, preDrive: 3, fuzz: true, lp: 5200,
        env: [[0, 0], [0.06, 1], [0.5, 0.9], [0.8, 0.5], [1, 0]],
      });
    },
  },
  zombie_attack: {
    ...ZV, dur: 0.9, variants: 5, level: 0.56, maxDist: 40, cap: 4,
    render: (s) => {
      const dur = s.rand(0.38, 0.6);
      voice(s, {
        t: 0.005, dur, f0: s.rand(165, 240), contour: [[0, 2], [0.2, 4], [1, s.rand(-7, -4)]],
        beat: 30, sub: 0.35, jitter: 1.4, jitterRate: 20, rough: 0.4, roughRate: s.rand(50, 75), roughJit: 12,
        vowels: vowelPath(s, ['a', 'ae', 'aw'], 2), fshift: 0.9, bw: 1.7,
        breath: 0.25, breathF: 2000, hiss: 0.07,
        drive: 3.5, preDrive: 3.5, fuzz: true, lp: 5500,
        env: [[0, 0], [0.05, 1], [0.6, 0.85], [1, 0]],
      });
      burst(s, { t: 0, kind: 'pink', a: 0.02, tau: 0.08, peak: 0.2, filters: [['bandpass', 1200, 0.7]] });
    },
  },
  zombie_hurt: {
    ...ZV, dur: 0.7, variants: 5, level: 0.5, cap: 4,
    render: (s) => {
      const dur = s.rand(0.25, 0.42);
      voice(s, {
        t: 0.005, dur, f0: s.rand(110, 165), contour: [[0, s.rand(3, 7)], [0.25, s.rand(4, 8)], [1, s.rand(-6, -2)]],
        beat: 25, sub: 0.35, jitter: 1, rough: 0.28, roughRate: 40, roughJit: 10,
        vowels: vowelPath(s, ['uh', 'a', 'aw', 'er'], 2), fshift: 0.85, bw: 1.7,
        breath: 0.25, breathF: 1500, drive: 2.2, preDrive: 2.5, lp: 4200,
        env: [[0, 0], [0.08, 1], [0.5, 0.7], [1, 0]],
      });
    },
  },
  zombie_death: {
    ...ZV, dur: 2.4, variants: 4, level: 0.64, cap: 3,
    render: (s) => {
      const dur = s.rand(1.2, 1.9);
      voice(s, {
        t: 0.01, dur, f0: s.rand(95, 130), contour: [[0, 2], [0.15, 3], [0.6, -4], [1, -13]],
        beat: 18, sub: 0.45, jitter: 1.2, rough: 0.4, roughRate: s.rand(18, 28), roughWave: 'square', roughJit: 8,
        wet: s.rand(0.3, 0.45), wetRate: 35,
        vowels: [[0, s.pick(['a', 'aw'])], [0.4, 'o'], [1, 'u']], fshift: 0.82, bw: 1.9,
        breath: 0.3, breathF: 1000, raw: 0.2, drive: 2, preDrive: 2.5, lp: 3500,
        env: [[0, 0], [0.08, 1], [0.4, 0.8], [0.75, 0.35], [1, 0]],
      });
      throatGunk(s, 0.1, dur, 0.3);
      bubbles(s, { t: dur * 0.4, dur: dur * 0.6, count: 10, fmin: 150, fmax: 500, peak: 0.16, len: 0.06 });
      // final rattling exhale
      burst(s, { t: dur * 0.85, kind: 'pink', a: 0.05, tau: 0.18, peak: 0.22, filters: [['bandpass', 700, 0.8]] });
    },
  },
  zombie_scream: {
    ...ZV, dur: 2.8, variants: 3, level: 0.6, ref: 6, maxDist: 120, cap: 2, send: 0.25,
    render: (s) => {
      const dur = s.rand(1.5, 2.3);
      const f0 = s.rand(560, 820);
      const common = {
        t: 0.01, dur, contour: [[0, -4], [0.12, 1], [0.6, s.rand(1, 3)], [1, s.rand(-8, -4)]],
        jitter: 0.8, jitterRate: 16, vib: { rate: s.rand(7, 10), depth: s.rand(0.5, 1), delay: 0.1, wobble: 2 },
        rough: 0.22, roughRate: s.rand(60, 90), roughJit: 20,
        vowels: vowelPath(s, ['a', 'ae', 'i', 'e'], 3), bw: 1.4,
        breath: 0.3, breathF: 3000, hiss: 0.08, hissF: 4500, drive: 3, preDrive: 3, fuzz: true, lp: 9000,
        env: [[0, 0], [0.06, 0.9], [0.2, 1], [0.75, 0.9], [1, 0]],
      };
      voice(s, { ...common, f0, beat: 35, fshift: s.rand(1.0, 1.15) });
      // inhuman second voice a tritone above, quieter
      voice(s, { ...common, f0: f0 * 1.414, beat: 20, fshift: 1.2, gain: 0.35 });
    },
  },
  zombie_brute_roar: {
    ...ZV, dur: 2.8, variants: 3, level: 0.88, ref: 6, maxDist: 90, cap: 2, send: 0.2, sr: 'lo',
    render: (s) => {
      const dur = s.rand(1.5, 2.2);
      voice(s, {
        t: 0.01, dur, f0: s.rand(52, 72), contour: [[0, -2], [0.2, 3], [0.55, 2], [1, -6]],
        beat: 12, beatGain: 0.8, sub: 0.7, subWave: 'sawtooth', jitter: 0.8,
        rough: 0.45, roughRate: s.rand(26, 36), roughJit: 6,
        vowels: vowelPath(s, ['aw', 'a', 'o'], 3), fshift: s.rand(0.62, 0.72), bw: 1.9,
        breath: 0.22, breathF: 800, raw: 0.35, rawLp: 700, hiss: 0.04,
        drive: 3.5, preDrive: 3, fuzz: true, lp: 2600,
        env: [[0, 0], [0.12, 1], [0.7, 0.9], [1, 0]],
      });
      // chest rumble
      burst(s, { t: 0.05, kind: 'brown', a: 0.2, hold: dur * 0.5, tau: 0.3, peak: 0.45, filters: [['lowpass', 180]] });
    },
  },
  zombie_runner_shriek: {
    ...ZV, dur: 1.3, variants: 4, level: 0.5, ref: 5, maxDist: 80, cap: 2, send: 0.2,
    render: (s) => {
      const dur = s.rand(0.5, 0.9);
      voice(s, {
        t: 0.01, dur, f0: s.rand(380, 600), contour: [[0, -5], [0.25, s.rand(3, 6)], [0.6, 2], [1, -7]],
        beat: 40, jitter: 1.2, jitterRate: 20, vib: { rate: 13, depth: 0.6, delay: 0.2 },
        rough: 0.3, roughRate: s.rand(70, 100), roughJit: 20,
        vowels: vowelPath(s, ['i', 'ae', 'e', 'a'], 3), fshift: s.rand(0.95, 1.1), bw: 1.5,
        breath: 0.35, breathF: 3000, hiss: 0.12, hissF: 4000,
        drive: 3.5, preDrive: 3, fuzz: true, lp: 7000,
        env: [[0, 0], [0.08, 1], [0.6, 0.85], [1, 0]],
      });
    },
  },
  zombie_bloater_pop: {
    cat: 'sfx', sr: 'mid', dur: 1.6, variants: 3, level: 0.74, ref: 5, maxDist: 60, cap: 2, send: 0.18, pv: 0.06, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: 85, f1: 35, tau: 0.12, peak: 1.2, noise: 1, noiseLp: 600, noiseTau: 0.06 });
      burst(s, { t: 0, kind: 'white', a: 0.0005, tau: 0.03, peak: 0.9, filters: [['bandpass', 900, 0.6]] });
      // wet splatter: dense squelchy crackle decaying
      crackle(s, { t: 0.005, dur: 0.6, rate: 1400, gmin: 0.001, gmax: 0.006, pow: 1.3, filters: [['lowpass', 2200], ['highpass', 200]], peak: 1, ampEnv: [[0, 1], [0.3, 0.5], [1, 0]] });
      // gore landing around
      crackle(s, { t: 0.15, dur: 0.9, rate: 40, gmin: 0.004, gmax: 0.015, pow: 1.2, filters: [['lowpass', 1500]], density: (x) => 1 - x, peak: 0.6 });
      bubbles(s, { t: 0.05, dur: 1.0, count: 16, fmin: 150, fmax: 700, peak: 0.3, len: 0.07, skew: 1.5 });
    },
  },
  zombie_bash: {
    cat: 'sfx', sr: 'mid', dur: 0.8, variants: 4, level: 0.63, ref: 5, maxDist: 50, cap: 4, send: 0.15, pv: 0.07, vv: 0.12,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(70, 90), f1: 38, tau: 0.09, peak: 1.2, noise: 0.9, noiseLp: 700, noiseTau: 0.05 });
      tone(s, { t: 0, f: s.rand(110, 150), tau: 0.08, peak: 0.5 });
      tone(s, { t: 0, f: s.rand(230, 300), tau: 0.05, peak: 0.3 });
      burst(s, { t: 0, kind: 'white', a: 0.0005, tau: 0.015, peak: 0.6, filters: [['bandpass', 1200, 0.8]] });
      // latch / hinge rattle
      for (let i = 0; i < s.irand(2, 4); i++) click(s, { t: 0.03 + i * s.rand(0.03, 0.05), f: s.rand(1800, 2600), q: 1.5, tau: 0.003, peak: 0.3 * (1 - i * 0.2), ring: 0.02, body: 0.3, bodyF: 200 });
      if (s.chance(0.5)) crackle(s, { t: 0.002, dur: 0.1, rate: 800, gmin: 0.0005, gmax: 0.003, filters: [['bandpass', 1800, 0.6]], peak: 0.35, ampEnv: [[0, 1], [1, 0]] });
    },
  },

  // ------------------------------------------------------------------ player voice / body
  player_hurt: {
    cat: 'inner', sr: 'lo', dur: 0.6, variants: 5, level: 0.6, cap: 2, pv: 0.05, vv: 0.1, send: 0.03,
    render: (s) => {
      const dur = s.rand(0.22, 0.34);
      voice(s, {
        t: 0.005, dur, f0: s.rand(115, 145), contour: [[0, 2], [0.3, 1], [1, -4]],
        beat: 8, jitter: 0.4, rough: 0.12, roughRate: 30,
        vowels: vowelPath(s, ['uh', 'u', 'er', 'a'], 2), fshift: 1.0, bw: 1.3,
        breath: 0.4, breathF: 1500, drive: 1.6, preDrive: 2,
        env: [[0, 0], [0.1, 1], [0.5, 0.7], [1, 0]],
      });
      burst(s, { t: 0, kind: 'pink', a: 0.005, tau: 0.04, peak: 0.25, filters: [['bandpass', 1300, 0.8]] });
    },
  },
  player_hurt_heavy: {
    cat: 'inner', sr: 'lo', dur: 1.0, variants: 4, level: 0.63, cap: 2, pv: 0.04, vv: 0.08, send: 0.04,
    render: (s) => {
      const dur = s.rand(0.5, 0.7);
      voice(s, {
        t: 0.005, dur, f0: s.rand(150, 185), contour: [[0, 0], [0.2, 3], [0.6, 1], [1, -6]],
        beat: 12, jitter: 0.6, vib: { rate: 6, depth: 0.4, delay: 0.3 },
        rough: 0.25, roughRate: 45, roughJit: 10,
        vowels: [[0, 'a'], [0.6, 'a'], [1, 'uh']], fshift: 1.0, bw: 1.3,
        breath: 0.4, breathF: 1800, hiss: 0.05, drive: 2.5, preDrive: 2,
        env: [[0, 0], [0.06, 1], [0.6, 0.8], [1, 0]],
      });
    },
  },
  player_death: {
    cat: 'inner', sr: 'lo', dur: 2.6, variants: 2, level: 0.8, cap: 1, pv: 0.02, vv: 0.05, send: 0.08,
    render: (s) => {
      voice(s, {
        t: 0.01, dur: 1.4, f0: s.rand(150, 170), contour: [[0, 2], [0.15, 3], [0.6, -2], [1, -9]],
        beat: 12, jitter: 0.8, vib: { rate: 5, depth: 0.6, delay: 0.2 }, rough: 0.3, roughRate: 35,
        wet: 0.25, wetRate: 30,
        vowels: [[0, 'a'], [0.5, 'uh'], [1, 'u']], fshift: 1.0, bw: 1.4,
        breath: 0.45, breathF: 1500, drive: 2.2, preDrive: 2,
        env: [[0, 0], [0.06, 1], [0.5, 0.75], [1, 0]],
      });
      burst(s, { t: 1.45, kind: 'pink', a: 0.08, tau: 0.25, peak: 0.35, filters: [['bandpass', 900, 0.8]] });
      throatGunk(s, 0.9, 1.0, 0.15);
    },
  },
  cough: {
    cat: 'inner', sr: 'lo', dur: 1.3, variants: 4, level: 0.55, cap: 2, pv: 0.05, vv: 0.1, send: 0.05, ref: 2, maxDist: 25,
    render: (s) => {
      const n = s.irand(2, 3);
      let t = 0.005;
      for (let i = 0; i < n; i++) {
        const pk = i === 0 ? 1 : s.rand(0.6, 0.9);
        burst(s, { t, kind: 'white', a: 0.004, tau: s.rand(0.05, 0.08), peak: pk, filters: [['bandpass', s.rand(900, 1400), 0.7], ['lowpass', 3500]] });
        voice(s, {
          t: t + 0.01, dur: s.rand(0.12, 0.2), f0: s.rand(130, 170), contour: [[0, 1], [1, -3]],
          rough: 0.4, roughRate: 40, vowels: [[0, 'uh'], [1, 'er']], bw: 1.6,
          breath: 0.6, breathF: 1500, drive: 2, preDrive: 2, gain: 0.5 * pk,
          env: [[0, 0], [0.1, 1], [1, 0]],
        });
        t += s.rand(0.22, 0.33);
      }
    },
  },
  breath_heavy: {
    cat: 'inner', sr: 'lo', dur: 1.8, variants: 4, level: 0.4, cap: 2, pv: 0.05, vv: 0.1, send: 0.02,
    render: (s) => {
      // inhale (rising, higher)
      const ti = s.rand(0.45, 0.6);
      burst(s, { t: 0.01, kind: 'white', env: [[0.01, 0], [ti * 0.7, 0.55], [ti, 0.2], [ti + 0.05, 0]], filters: [['bandpass', 1600, 0.9], ['peaking', 2600, 2, 6]], fenv: [[0.01, 1300], [ti, 1900, 'e']] });
      // exhale (falling, slightly voiced "huh")
      const te = ti + s.rand(0.05, 0.12);
      const de = s.rand(0.55, 0.8);
      burst(s, { t: te, kind: 'white', env: [[te, 0], [te + 0.08, 1], [te + de * 0.6, 0.5], [te + de, 0]], filters: [['bandpass', 1100, 0.8], ['peaking', 1700, 2, 4]], fenv: [[te, 1300], [te + de, 800, 'e']] });
      voice(s, { t: te + 0.02, dur: de * 0.5, f0: s.rand(100, 125), contour: [[0, 0], [1, -3]], vowels: [[0, 'uh']], bw: 1.5, breath: 0.6, breathF: 1200, gain: 0.08, env: [[0, 0], [0.2, 1], [1, 0]] });
    },
  },
  heartbeat: {
    cat: 'inner', sr: 'lo', dur: 0.55, variants: 3, level: 0.42, cap: 2, pv: 0.02, vv: 0.05, send: 0,
    render: (s) => {
      const lp = s.lp(220, 0.7);
      lp.connect(s.out);
      thud(s, { t: 0.005, f: 62, f1: 42, glide: 0.03, tau: 0.05, peak: 1, noise: 0.3, noiseLp: 160, noiseTau: 0.03, dest: lp });
      thud(s, { t: 0.15 + s.rand(0, 0.03), f: 56, f1: 40, glide: 0.03, tau: 0.045, peak: 0.6, noise: 0.2, noiseLp: 150, dest: lp });
    },
  },
  eat: {
    cat: 'inner', sr: 'mid', dur: 1.4, variants: 4, level: 0.5, cap: 2, pv: 0.06, vv: 0.1, send: 0.02, ref: 2, maxDist: 12,
    render: (s) => {
      let t = 0.005;
      const n = s.irand(3, 4);
      for (let i = 0; i < n; i++) {
        const pk = i === 0 ? 1 : s.rand(0.5, 0.85);
        crackle(s, { t, dur: s.rand(0.08, 0.12), rate: s.rand(1200, 2000), gmin: 0.0005, gmax: 0.003, pow: 1.4, filters: [['bandpass', s.rand(1400, 2200), 0.5]], peak: pk, ampEnv: [[0, 1], [1, 0]] });
        crackle(s, { t: t + 0.02, dur: 0.12, rate: 300, gmin: 0.002, gmax: 0.006, filters: [['lowpass', 1200]], peak: 0.3 * pk });
        thud(s, { t, f: 100, f1: 70, tau: 0.02, peak: 0.25 * pk });
        t += s.rand(0.24, 0.34);
      }
    },
  },
  drink: {
    cat: 'inner', sr: 'lo', dur: 1.6, variants: 3, level: 0.5, cap: 2, pv: 0.05, vv: 0.1, send: 0.02, ref: 2, maxDist: 12,
    render: (s) => {
      let t = 0.02;
      const n = s.irand(2, 3);
      for (let i = 0; i < n; i++) {
        tone(s, { t, f: s.rand(240, 290), f1: s.rand(120, 150), glide: 0.06, a: 0.004, tau: 0.04, peak: 0.6 });
        bubbles(s, { t: t + 0.01, dur: 0.08, count: 2, fmin: 300, fmax: 600, peak: 0.25, len: 0.04 });
        burst(s, { t: t + 0.04, kind: 'pink', a: 0.01, tau: 0.05, peak: 0.35, filters: [['bandpass', 700, 1]] });
        t += s.rand(0.36, 0.46);
      }
      burst(s, { t, kind: 'white', a: 0.03, tau: 0.12, peak: 0.12, filters: [['bandpass', 1200, 0.8]] });
    },
  },
  bandage: {
    cat: 'sfx', sr: 'mid', dur: 1.3, variants: 3, level: 0.45, cap: 2, pv: 0.06, vv: 0.1, send: 0.03, ref: 2, maxDist: 12,
    render: (s) => {
      const d1 = s.rand(0.28, 0.38);
      scrape(s, { t: 0, dur: d1, f: 2200, f1: 3200, q: 0.8, peak: 1, rough: 0.95, roughRate: 350, env: [[0, 0], [0.05, 1], [0.8, 0.9], [1, 0]] });
      crackle(s, { t: 0, dur: d1, rate: 1500, gmin: 0.0003, gmax: 0.0012, filters: [['bandpass', 2500, 0.6]], peak: 0.5 });
      const t2 = d1 + s.rand(0.12, 0.25);
      scrape(s, { t: t2, dur: 0.18, f: 2600, f1: 3400, q: 0.8, peak: 0.7, rough: 0.95, roughRate: 400 });
      scrape(s, { t: t2 + 0.3, dur: 0.35, f: 1500, q: 0.6, peak: 0.25, rough: 0.4, roughRate: 30, kind: 'pink' });
    },
  },
  pills: {
    cat: 'sfx', sr: 'mid', dur: 0.9, variants: 3, level: 0.4, cap: 2, pv: 0.06, vv: 0.1, send: 0.03, ref: 2, maxDist: 12,
    render: (s) => {
      for (let i = 0; i < 3; i++) {
        const t = i * s.rand(0.15, 0.2);
        crackle(s, { t, dur: 0.08, rate: 300, gmin: 0.003, gmax: 0.01, decay: 6, ping: 3000, ping2: 6500, pow: 1, peak: 0.7 });
        click(s, { t, f: 1500, q: 2, tau: 0.004, peak: 0.4, body: 0.3, bodyF: 600 });
      }
      click(s, { t: 0.62, f: 1200, q: 1.2, tau: 0.004, peak: 0.6, body: 0.4, bodyF: 500 });
    },
  },
  zipper: {
    cat: 'ui', sr: 'mid', dur: 0.6, variants: 3, level: 0.35, cap: 2, pv: 0.06, vv: 0.1, send: 0,
    render: (s) => {
      const d = s.rand(0.35, 0.48);
      const o = s.osc('sawtooth', 70, 0, d + 0.05);
      s.env(o.frequency, [[0, s.rand(60, 80)], [d, s.rand(170, 230), 'e']]);
      s.randCtl(0, d, 40, -150, 150).connect(o.detune);
      const g = s.g(0);
      s.env(g.gain, [[0, 0], [0.03, 1], [d * 0.8, 0.9], [d, 0]]);
      s.chain(o, s.hp(2000, 0.7), s.bp(3500, 1), g, s.out);
      scrape(s, { t: 0, dur: d, f: 4000, q: 1, peak: 0.25, rough: 0.5 });
    },
  },

  // ------------------------------------------------------------------ animals / distant life
  wolf_howl: {
    cat: 'amb', sr: 'vlo', dur: 4.6, variants: 3, level: 0.5, ref: 60, maxDist: 3000, cap: 2, send: 0.5, pv: 0.05, vv: 0.1,
    render: (s) => {
      const lp = s.lp(2200, 0.7);
      lp.connect(s.out);
      const dur = s.rand(2.6, 3.8);
      voice(s, {
        t: 0.05, dur, f0: s.rand(310, 360), contour: [[0, -1], [0.2, s.rand(8, 10)], [0.6, s.rand(9, 11)], [0.8, s.rand(7, 9)], [1, s.rand(2, 4)]],
        wave: 'triangle', beat: 6, beatGain: 0.4, vib: { rate: 5, depth: 0.25, delay: 0.3 }, jitter: 0.15,
        vowels: [[0, 'u'], [0.3, 'o'], [0.8, 'o'], [1, 'u']], fshift: 1.1, bw: 1.2, nf: 3,
        breath: 0.1, breathF: 1200, raw: 0.6, rawLp: 1500, drive: 1.2, preDrive: 1,
        env: [[0, 0], [0.2, 0.8], [0.4, 1], [0.85, 0.8], [1, 0]], dest: lp,
      });
      const d1 = s.delay(0.45), g1 = s.g(0.35);
      s.chain(lp, d1, s.lp(1200), g1, s.out);
    },
  },
  dog_bark: {
    cat: 'amb', sr: 'vlo', dur: 2.4, variants: 3, level: 0.45, ref: 50, maxDist: 2000, cap: 2, send: 0.4, pv: 0.06, vv: 0.1,
    render: (s) => {
      const lp = s.lp(2500, 0.7);
      lp.connect(s.out);
      const n = s.irand(2, 4);
      let t = 0.02;
      const f0 = s.rand(280, 420);
      for (let i = 0; i < n; i++) {
        voice(s, {
          t, dur: s.rand(0.12, 0.2), f0, contour: [[0, 3], [0.3, 4], [1, -4]],
          beat: 25, rough: 0.4, roughRate: 60, jitter: 0.8,
          vowels: [[0, 'a'], [1, 'u']], fshift: 1.15, bw: 1.5, breath: 0.4, breathF: 2000,
          drive: 4, preDrive: 3, env: [[0, 0], [0.08, 1], [0.4, 0.8], [1, 0]], dest: lp,
        });
        t += s.rand(0.3, 0.55);
      }
      const d1 = s.delay(0.38), g1 = s.g(0.3);
      s.chain(lp, d1, s.lp(1000), g1, s.out);
    },
  },
  distant_scream: {
    cat: 'amb', sr: 'vlo', dur: 3.4, variants: 4, level: 0.45, ref: 40, maxDist: 3000, cap: 2, send: 0.5, pv: 0.05, vv: 0.1,
    render: (s, v) => {
      const lp = s.lp(s.rand(1300, 1900), 0.7);
      lp.connect(s.out);
      const human = v % 2 === 0;
      const dur = s.rand(1.0, 1.8);
      voice(s, {
        t: 0.02, dur, f0: human ? s.rand(480, 640) : s.rand(600, 800), contour: [[0, -3], [0.15, 1], [0.7, human ? 0 : 2], [1, -6]],
        beat: human ? 8 : 35, jitter: 0.6, vib: { rate: human ? 6 : 9, depth: 0.5, delay: 0.2 }, rough: human ? 0.1 : 0.35, roughRate: 70,
        vowels: [[0, 'a'], [0.5, human ? 'a' : 'ae'], [1, 'uh']], fshift: human ? 1.05 : 1.1, bw: 1.3,
        breath: 0.25, breathF: 2500, drive: human ? 2.5 : 5, preDrive: 2,
        env: [[0, 0], [0.08, 1], [0.7, 0.85], [1, 0]], dest: lp,
      });
      for (const [dt, g] of [[0.35, 0.4], [0.8, 0.25], [1.3, 0.12]]) {
        const d = s.delay(dt * s.rand(0.9, 1.1)), gg = s.g(g);
        s.chain(lp, d, s.lp(900), gg, s.out);
      }
    },
  },
  owl: {
    cat: 'amb', sr: 'vlo', dur: 3.2, variants: 3, level: 0.4, ref: 15, maxDist: 1500, cap: 1, send: 0.35, pv: 0.03, vv: 0.1,
    render: (s) => {
      // great-horned rhythm: hoo, hoo-hoo, hoooo, hoo
      const f = s.rand(330, 400);
      const pat = [[0, 0.32, 1], [0.55, 0.16, 0.8], [0.76, 0.16, 0.85], [1.05, 0.5, 1], [1.75, 0.3, 0.8]];
      for (const [t0, d, pk] of pat) {
        const t = 0.02 + t0 * s.rand(0.95, 1.05);
        const o = s.osc('sine', f, t, t + d + 0.1);
        s.env(o.frequency, [[t, f * 0.97], [t + d * 0.3, f], [t + d, f * 0.92, 'e']]);
        const g = s.g(0);
        s.env(g.gain, [[t, 0], [t + 0.05, pk], [t + d * 0.7, pk * 0.8], [t + d, 0]]);
        const h = s.osc('sine', f * 2, t, t + d + 0.1);
        const hg = s.g(0.08);
        s.chain(h, hg, g);
        s.chain(o, g, s.out);
        burst(s, { t, kind: 'pink', env: [[t, 0], [t + 0.05, pk * 0.12], [t + d, 0]], filters: [['bandpass', f * 1.2, 2]] });
      }
    },
  },
};
