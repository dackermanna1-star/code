// Weapon fire and weapon handling recipes.
//
// A gunshot is layered the way the original 22 kHz CS 1.6 samples are built:
//   click   - 1-3 ms broadband transient (the "tick" at the very front)
//   crack   - bandpassed noise burst with a fast exponential decay (supersonic crack)
//   body    - lowpassed noise with a short hold + decay and a resonant peak that gives
//             each gun its own "bark"
//   thump   - pitch-dropping sine (muzzle blast pressure, 40-150 Hz)
//   mech    - metallic action clack (bolt carrier / slide)
// summed and pushed through tanh saturation (that compressed GoldSrc punch), then a
// reverberant tail made of diffuse decay + discrete slap echoes (dust2's walls).

import {
  addTail, addBurst, addTone, addMetal, addScrape, addGrains, mixInto, biquad, normalize, softclip,
} from './dsp.js';

// ------------------------------------------------------------ gunshot model ---

// Global voicing: the per-gun tables below give relative weights; these keep
// the low end in check (2003-era samples are mid-heavy, made for small speakers).
const THUMP_GAIN = 0.42;
const THUMP_TAU = 0.6;
const RUMBLE_GAIN = 0.3;

function gunshot(P, w) {
  const { sr, rng } = P;
  const J = (x, a = 0.06) => rng.jit(x, a);
  const dry = P.arr();

  // click
  const click = new Float32Array(Math.ceil(0.004 * sr));
  for (let i = 0; i < click.length; i++) click[i] = (rng() * 2 - 1) * Math.exp(-i / (0.0005 * sr));
  click[0] = 1;
  click[1] = -0.6;
  biquad(click, sr, 'highpass', w.clickHP ?? 1500, 0.7);
  normalize(click, 1);
  mixInto(dry, click, 0, w.click ?? 0.8);

  // crack (several near-coincident ones for shotgun pellets)
  const pellets = w.pellets ?? 1;
  for (let k = 0; k < pellets; k++) {
    addBurst(dry, sr, rng, k ? rng.range(0.0006, 0.005) : 0, (w.crack ?? 1) * (k ? rng.range(0.35, 0.7) : 1), {
      a: 0.00015,
      tau: J(w.crackTau ?? 0.012, 0.1),
      filters: [['bandpass', J(w.crackF ?? 2500, 0.08), w.crackQ ?? 0.8], ['highshelf', 5000, 0.7, w.air ?? 0]],
    });
  }

  // body / blast
  const bodyFilters = [
    ['lowpass', J(w.bodyLP ?? 2200, 0.08), 0.8],
    ['peaking', J(w.resF ?? 450, 0.06), w.resQ ?? 2.5, w.resG ?? 6],
  ];
  if (w.res2F) bodyFilters.push(['peaking', J(w.res2F, 0.05), w.res2Q ?? 4, w.res2G ?? 5]);
  addBurst(dry, sr, rng, 0.0003, w.body ?? 1, {
    a: 0.0005, h: J(w.hold ?? 0.008, 0.15), tau: J(w.bodyTau ?? 0.045, 0.1), color: w.bodyColor ?? 'white', filters: bodyFilters,
  });

  // low thump
  addTone(dry, sr, 0, {
    f: J(w.thumpF0 ?? 140, 0.05), f1: Math.max(62, w.thumpF1 ?? 55), glide: w.thumpGlide ?? 0.03,
    tau: J((w.thumpTau ?? 0.07) * THUMP_TAU, 0.1), amp: (w.thump ?? 0.9) * THUMP_GAIN, a: 0.0012,
  });

  // sub rumble for the big ones
  if (w.rumble) {
    addBurst(dry, sr, rng, 0.004, w.rumble * RUMBLE_GAIN, { a: 0.006, h: 0.02, tau: w.rumbleTau ?? 0.18, color: 'brown', filters: [['lowpass', 220, 0.7]] });
  }

  // action
  if (w.mech) {
    addMetal(dry, sr, rng, w.mechT ?? 0.003, {
      f: J(w.mechF ?? 3200, 0.05), amp: w.mech, tau: w.mechTau ?? 0.012, body: 0.5, bodyF: w.mechBodyF ?? 900, bodyTau: 0.014,
    });
  }

  softclip(dry, w.drive ?? 3);
  if (w.tail) addTail(dry, dry, sr, rng, w.tail);
  P.play(dry, P.out);
}

/** Suppressed shot: the muffled "pfft" + a prominent mechanical "tchk". */
function suppressed(P, w) {
  const { sr, rng } = P;
  const J = (x, a = 0.06) => rng.jit(x, a);
  const dry = P.arr();

  // the "pf": gas puff through the baffles
  addBurst(dry, sr, rng, 0, w.puff ?? 1, {
    a: 0.0007, h: J(w.puffHold ?? 0.003, 0.2), tau: J(w.puffTau ?? 0.02, 0.1),
    filters: [['bandpass', J(w.puffF ?? 1200, 0.07), w.puffQ ?? 0.7], ['lowpass', w.puffLP ?? 4000, 0.7]],
  });
  // the "ft": softer, longer airy hiss
  addBurst(dry, sr, rng, 0.002, w.hiss ?? 0.35, {
    a: 0.003, h: 0.004, tau: J(w.hissTau ?? 0.03, 0.1), filters: [['bandpass', J(w.hissF ?? 3000, 0.08), 0.9]],
  });
  // low gas pressure
  addBurst(dry, sr, rng, 0.001, w.low ?? 0.55, { a: 0.0015, tau: 0.03, color: 'pink', filters: [['lowpass', 420, 0.7]] });
  addTone(dry, sr, 0, { f: J(w.thumpF0 ?? 170, 0.05), f1: 75, glide: 0.02, tau: 0.032, amp: w.thump ?? 0.5, a: 0.001 });
  // breech tick
  addBurst(dry, sr, rng, 0, w.tick ?? 0.45, { a: 0.00004, tau: 0.0006, filters: [['highpass', 2500, 0.7]] });
  // action clack(s)
  addMetal(dry, sr, rng, w.mechT ?? 0.004, {
    f: J(w.mechF ?? 2800, 0.05), amp: w.mech ?? 0.75, tau: w.mechTau ?? 0.014, body: 0.6, bodyF: J(w.mechBodyF ?? 700, 0.05), bodyTau: 0.02,
  });
  if (w.mech2) {
    addMetal(dry, sr, rng, J(w.mech2T ?? 0.04, 0.1), {
      f: J(w.mech2F ?? 3400, 0.05), amp: w.mech2, tau: 0.01, body: 0.45, bodyF: J(w.mech2BodyF ?? 950, 0.05), bodyTau: 0.016,
    });
  }
  softclip(dry, w.drive ?? 1.6);
  addTail(dry, dry, sr, rng, { tau: 0.075, lp: 3200, lpEnd: 900, slaps: [[0.06, 0.25]], wet: w.wet ?? 0.16, slapWin: 0.06 });
  P.play(dry, P.out);
}

// -------------------------------------------------------- weapon voicings ---

const tail = (wet, tau, len, slaps, lp = 3500, lpEnd = 700) => ({ wet, tau, len, slaps, lp, lpEnd, pre: 0.006 });

const RIFLE_SLAPS = [[0.075, 0.45], [0.17, 0.3], [0.29, 0.14]];
const PISTOL_SLAPS = [[0.06, 0.4], [0.14, 0.22]];
const BIG_SLAPS = [[0.11, 0.55], [0.24, 0.42], [0.41, 0.28], [0.63, 0.16], [0.9, 0.08]];

/** name -> { dur: render seconds, variants, peak: normalised peak, p: gunshot() voicing } */
export const GUNS = {
  ak47: {
    dur: 1.1, variants: 3, peak: 0.95,
    p: { crackF: 1800, crackTau: 0.016, crackQ: 0.7, hold: 0.012, bodyTau: 0.06, bodyLP: 1900, resF: 380, resG: 7, res2F: 1150, res2G: 4,
      thump: 1.0, thumpF0: 130, thumpF1: 50, thumpTau: 0.09, drive: 3.6, mech: 0.3, mechF: 2900, rumble: 0.35,
      tail: tail(0.42, 0.28, 1.0, RIFLE_SLAPS, 3000, 600) },
  },
  m4a1: {
    dur: 0.9, variants: 3, peak: 0.93,
    p: { crackF: 3000, crackTau: 0.01, crackQ: 0.8, air: 3, hold: 0.006, bodyTau: 0.038, bodyLP: 2900, resF: 540, resG: 6, res2F: 1900, res2G: 3,
      thump: 0.75, thumpF0: 150, thumpF1: 60, thumpTau: 0.06, drive: 3.0, mech: 0.32, mechF: 3600,
      tail: tail(0.34, 0.2, 0.8, RIFLE_SLAPS, 4000, 800) },
  },
  galil: {
    dur: 1.0, variants: 3, peak: 0.94,
    p: { crackF: 2200, crackTau: 0.013, hold: 0.01, bodyTau: 0.05, bodyLP: 2200, resF: 430, resQ: 3, resG: 7, res2F: 1500, res2G: 4,
      thump: 0.9, thumpF0: 135, thumpF1: 52, thumpTau: 0.075, drive: 3.3, mech: 0.42, mechF: 2700, mechBodyF: 750,
      tail: tail(0.38, 0.24, 0.9, RIFLE_SLAPS, 3200, 650) },
  },
  famas: {
    dur: 0.85, variants: 3, peak: 0.92,
    p: { crackF: 3400, crackTau: 0.009, air: 4, hold: 0.005, bodyTau: 0.034, bodyLP: 3300, resF: 620, resG: 6, res2F: 2400, res2G: 4,
      thump: 0.62, thumpF0: 160, thumpF1: 62, thumpTau: 0.055, drive: 2.9, mech: 0.38, mechF: 4200, mechBodyF: 1200,
      tail: tail(0.32, 0.18, 0.8, RIFLE_SLAPS, 4200, 900) },
  },
  sg552: {
    dur: 1.0, variants: 3, peak: 0.94,
    p: { crackF: 2600, crackTau: 0.012, hold: 0.009, bodyTau: 0.05, bodyLP: 2500, resF: 480, resQ: 4, resG: 8, res2F: 2900, res2Q: 6, res2G: 6,
      thump: 0.85, thumpF0: 140, thumpF1: 55, thumpTau: 0.07, drive: 3.3, mech: 0.3, mechF: 3300,
      tail: tail(0.38, 0.24, 0.9, RIFLE_SLAPS, 3500, 700) },
  },
  aug: {
    dur: 0.9, variants: 3, peak: 0.93,
    p: { crackF: 2800, crackTau: 0.01, hold: 0.005, bodyTau: 0.04, bodyLP: 2700, resF: 720, resQ: 3, resG: 7, res2F: 1300, res2G: 3,
      thump: 0.7, thumpF0: 150, thumpF1: 58, thumpTau: 0.06, drive: 3.0, mech: 0.35, mechF: 3900, mechBodyF: 1100,
      tail: tail(0.34, 0.2, 0.8, RIFLE_SLAPS, 3800, 800) },
  },
  m249: {
    dur: 1.1, variants: 3, peak: 0.96,
    p: { crackF: 1600, crackTau: 0.018, crackQ: 0.6, hold: 0.014, bodyTau: 0.065, bodyLP: 1700, resF: 330, resG: 7, res2F: 900, res2G: 4,
      thump: 1.1, thumpF0: 120, thumpF1: 45, thumpTau: 0.1, drive: 4.0, mech: 0.4, mechF: 2400, mechBodyF: 600, rumble: 0.45,
      tail: tail(0.45, 0.3, 1.0, RIFLE_SLAPS, 2800, 550) },
  },
  mp5: {
    dur: 0.7, variants: 2, peak: 0.85,
    p: { crackF: 2400, crackTau: 0.008, hold: 0.004, bodyTau: 0.03, bodyLP: 2400, resF: 560, resG: 6, res2F: 1700, res2G: 3,
      thump: 0.55, thumpF0: 160, thumpF1: 70, thumpTau: 0.045, drive: 2.5, mech: 0.42, mechT: 0.012, mechF: 3500, mechBodyF: 1000,
      tail: tail(0.3, 0.15, 0.6, PISTOL_SLAPS, 3500, 800) },
  },
  mac10: {
    dur: 0.7, variants: 2, peak: 0.86,
    p: { crackF: 1700, crackTau: 0.01, crackQ: 0.6, hold: 0.006, bodyTau: 0.036, bodyLP: 1800, resF: 300, resQ: 3, resG: 8, res2F: 1100, res2Q: 5, res2G: 5,
      thump: 0.8, thumpF0: 140, thumpF1: 60, thumpTau: 0.05, drive: 4.2, mech: 0.45, mechF: 2600, mechBodyF: 700,
      tail: tail(0.3, 0.15, 0.6, PISTOL_SLAPS, 3000, 700) },
  },
  ump45: {
    dur: 0.8, variants: 2, peak: 0.88,
    p: { crackF: 1900, crackTau: 0.01, hold: 0.007, bodyTau: 0.045, bodyLP: 2000, resF: 280, resG: 7, res2F: 1300, res2G: 3,
      thump: 0.95, thumpF0: 120, thumpF1: 50, thumpTau: 0.07, drive: 3.2, mech: 0.38, mechT: 0.01, mechF: 3000, mechBodyF: 800,
      tail: tail(0.32, 0.18, 0.7, PISTOL_SLAPS, 3200, 700) },
  },
  p90: {
    dur: 0.7, variants: 2, peak: 0.85,
    p: { crackF: 3600, crackTau: 0.007, air: 4, hold: 0.003, bodyTau: 0.028, bodyLP: 3600, resF: 820, resQ: 4, resG: 7, res2F: 2600, res2G: 4,
      thump: 0.5, thumpF0: 180, thumpF1: 70, thumpTau: 0.04, drive: 2.8, mech: 0.35, mechF: 4300, mechBodyF: 1300,
      tail: tail(0.3, 0.15, 0.6, PISTOL_SLAPS, 4000, 900) },
  },
  awp: {
    dur: 2.4, variants: 1, peak: 0.98,
    p: { click: 1.0, crack: 1.2, crackF: 1500, crackTau: 0.026, crackQ: 0.6, hold: 0.02, bodyTau: 0.11, bodyLP: 1600, resF: 250, resQ: 2, resG: 6, res2F: 800, res2G: 4,
      thump: 1.4, thumpF0: 110, thumpF1: 36, thumpGlide: 0.05, thumpTau: 0.18, drive: 4.5, rumble: 0.8, rumbleTau: 0.35,
      tail: tail(0.6, 0.55, 2.2, BIG_SLAPS, 2200, 300) },
  },
  scout: {
    dur: 1.5, variants: 1, peak: 0.95,
    p: { crackF: 3200, crackTau: 0.014, air: 3, hold: 0.008, bodyTau: 0.05, bodyLP: 3000, resF: 520, resG: 6, res2F: 2000, res2G: 3,
      thump: 0.8, thumpF0: 150, thumpF1: 55, thumpTau: 0.08, drive: 3.3,
      tail: tail(0.5, 0.36, 1.4, [[0.09, 0.5], [0.21, 0.35], [0.37, 0.2], [0.58, 0.1]], 3200, 450) },
  },
  g3sg1: {
    dur: 1.5, variants: 1, peak: 0.96,
    p: { crackF: 1800, crackTau: 0.018, hold: 0.012, bodyTau: 0.07, bodyLP: 1900, resF: 320, resG: 7, res2F: 1000, res2G: 4,
      thump: 1.1, thumpF0: 125, thumpF1: 45, thumpTau: 0.11, drive: 4.0, mech: 0.38, mechF: 2600, mechBodyF: 650, rumble: 0.45,
      tail: tail(0.5, 0.4, 1.4, [[0.1, 0.5], [0.23, 0.35], [0.4, 0.2]], 2800, 450) },
  },
  sg550: {
    dur: 1.5, variants: 1, peak: 0.96,
    p: { crackF: 2400, crackTau: 0.015, hold: 0.01, bodyTau: 0.06, bodyLP: 2300, resF: 420, resG: 7, res2F: 1600, res2G: 4,
      thump: 1.0, thumpF0: 135, thumpF1: 50, thumpTau: 0.095, drive: 3.8, mech: 0.32, mechF: 3100, rumble: 0.35,
      tail: tail(0.48, 0.38, 1.4, [[0.1, 0.5], [0.22, 0.33], [0.38, 0.18]], 3000, 500) },
  },
  m3: {
    dur: 1.6, variants: 1, peak: 0.98,
    p: { pellets: 4, crackF: 1300, crackTau: 0.03, crackQ: 0.6, hold: 0.022, bodyTau: 0.09, bodyLP: 1400, resF: 200, resG: 6, res2F: 700, res2G: 4,
      thump: 1.4, thumpF0: 100, thumpF1: 40, thumpGlide: 0.04, thumpTau: 0.14, drive: 4.5, rumble: 0.7, rumbleTau: 0.25,
      tail: tail(0.52, 0.42, 1.5, BIG_SLAPS, 2400, 380) },
  },
  xm1014: {
    dur: 1.4, variants: 2, peak: 0.97,
    p: { pellets: 3, crackF: 1650, crackTau: 0.024, crackQ: 0.65, hold: 0.016, bodyTau: 0.075, bodyLP: 1750, resF: 240, resG: 6, res2F: 900, res2G: 4,
      thump: 1.2, thumpF0: 110, thumpF1: 44, thumpTau: 0.12, drive: 4.2, rumble: 0.55, mech: 0.35, mechT: 0.03, mechF: 2500, mechBodyF: 600,
      tail: tail(0.46, 0.36, 1.3, [[0.1, 0.5], [0.22, 0.36], [0.38, 0.2]], 2600, 420) },
  },
  deagle: {
    dur: 1.3, variants: 1, peak: 0.97,
    p: { crack: 1.1, crackF: 1900, crackTau: 0.02, crackQ: 0.7, hold: 0.014, bodyTau: 0.08, bodyLP: 2000, resF: 350, resQ: 3, resG: 9, res2F: 1250, res2G: 5,
      thump: 1.2, thumpF0: 135, thumpF1: 48, thumpTau: 0.12, drive: 4.2, rumble: 0.5, mech: 0.32, mechT: 0.02, mechF: 2700, mechBodyF: 700,
      tail: tail(0.48, 0.38, 1.3, [[0.09, 0.5], [0.2, 0.36], [0.35, 0.2], [0.55, 0.1]], 2800, 450) },
  },
  usp: {
    dur: 0.9, variants: 1, peak: 0.88,
    p: { crackF: 2100, crackTau: 0.011, hold: 0.006, bodyTau: 0.045, bodyLP: 2200, resF: 330, resG: 7, res2F: 1400, res2G: 3,
      thump: 0.9, thumpF0: 140, thumpF1: 55, thumpTau: 0.07, drive: 3.0, mech: 0.32, mechT: 0.015, mechF: 3100, mechBodyF: 850,
      tail: tail(0.34, 0.24, 0.9, PISTOL_SLAPS, 3200, 650) },
  },
  glock: {
    dur: 0.75, variants: 1, peak: 0.82,
    p: { crackF: 2700, crackTau: 0.008, hold: 0.004, bodyTau: 0.03, bodyLP: 2600, resF: 600, resG: 6, res2F: 1800, res2G: 3,
      thump: 0.55, thumpF0: 170, thumpF1: 70, thumpTau: 0.045, drive: 2.5, mech: 0.32, mechT: 0.012, mechF: 3600, mechBodyF: 1100,
      tail: tail(0.3, 0.17, 0.7, PISTOL_SLAPS, 3500, 750) },
  },
  p228: {
    dur: 0.8, variants: 1, peak: 0.86,
    p: { crackF: 3200, crackTau: 0.01, air: 3, hold: 0.005, bodyTau: 0.035, bodyLP: 3000, resF: 520, resQ: 3, resG: 7, res2F: 2200, res2G: 4,
      thump: 0.7, thumpF0: 160, thumpF1: 62, thumpTau: 0.05, drive: 3.0, mech: 0.32, mechT: 0.013, mechF: 3800,
      tail: tail(0.32, 0.2, 0.8, PISTOL_SLAPS, 3800, 800) },
  },
  elite: {
    dur: 0.8, variants: 2, peak: 0.85,
    p: { crackF: 2500, crackTau: 0.009, hold: 0.005, bodyTau: 0.034, bodyLP: 2500, resF: 470, resG: 6, res2F: 1600, res2G: 3,
      thump: 0.65, thumpF0: 155, thumpF1: 60, thumpTau: 0.05, drive: 2.8, mech: 0.3, mechT: 0.013, mechF: 3400,
      tail: tail(0.32, 0.19, 0.8, PISTOL_SLAPS, 3500, 750) },
  },
  fiveseven: {
    dur: 0.75, variants: 1, peak: 0.84,
    p: { crackF: 3800, crackTau: 0.008, air: 5, hold: 0.003, bodyTau: 0.028, bodyLP: 3800, resF: 900, resQ: 3, resG: 6, res2F: 2700, res2G: 4,
      thump: 0.5, thumpF0: 190, thumpF1: 75, thumpTau: 0.04, drive: 2.7, mech: 0.35, mechT: 0.012, mechF: 4500, mechBodyF: 1400,
      tail: tail(0.3, 0.18, 0.7, PISTOL_SLAPS, 4200, 900) },
  },
};

export const SUPPRESSED = {
  m4a1_silenced: {
    dur: 0.5, variants: 3, peak: 0.62,
    p: { puffF: 1100, puffTau: 0.022, hissF: 2800, mech: 0.8, mechF: 2700, mechBodyF: 650, mech2: 0.45, mech2T: 0.045, mech2F: 3300, drive: 1.7, wet: 0.16 },
  },
  usp_silenced: {
    dur: 0.45, variants: 2, peak: 0.52,
    p: { puffF: 1600, puffTau: 0.016, puffHold: 0.002, hissF: 3600, hissTau: 0.022, low: 0.4, thump: 0.35, thumpF0: 200,
      mech: 0.65, mechT: 0.012, mechF: 3500, mechBodyF: 950, mech2: 0.35, mech2T: 0.03, mech2F: 4100, drive: 1.5, wet: 0.13 },
  },
  tmp: {
    dur: 0.45, variants: 3, peak: 0.56,
    p: { puffF: 1350, puffTau: 0.02, hissF: 3200, low: 0.45, thump: 0.4, thumpF0: 185,
      mech: 0.62, mechT: 0.003, mechF: 3100, mechBodyF: 820, mech2: 0.4, mech2T: 0.032, mech2F: 3700, drive: 1.7, wet: 0.15 },
  },
};

// ------------------------------------------------------------- handling ---

// Helper: a JS-only foley sound, rendered straight through the master chain.
function foley(P, build, wet = 0, ir) {
  const x = P.arr();
  build(x, P.sr, P.rng);
  if (wet) addTail(x, x, P.sr, P.rng, { tau: 0.04, lp: 5000, lpEnd: 1500, ...ir, wet });
  P.play(x, P.out);
}

export const HANDLING = {
  clipout: { dur: 0.42, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 3800, amp: 0.45, tau: 0.008, body: 0.3, bodyF: 1200 });
    addScrape(x, sr, r, 0.025, 0.09, { f0: 1700, f1: 2600, q: 1.8, amp: 0.3, grit: 0.7 });
    addMetal(x, sr, r, 0.11, { f: 2400, amp: 1, tau: 0.02, body: 0.75, bodyF: 420, bodyTau: 0.03 });
    addMetal(x, sr, r, 0.165, { f: 3300, amp: 0.3, tau: 0.01, body: 0.2, bodyF: 800 });
    addGrains(x, sr, r, { t0: 0.115, span: 0.08, count: 8, f: [2500, 6000], amp: [0.05, 0.2], decay: 0.04 });
  }, 0.12) },
  clipin: { dur: 0.4, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.07, { f0: 1500, f1: 2300, q: 1.6, amp: 0.3, grit: 0.6 });
    addBurst(x, sr, r, 0.068, 0.5, { a: 0.001, tau: 0.012, color: 'pink', filters: [['lowpass', 900, 0.7]] });
    addMetal(x, sr, r, 0.07, { f: 2100, amp: 1, tau: 0.024, body: 1.0, bodyF: 380, bodyTau: 0.035 });
    addMetal(x, sr, r, 0.084, { f: 4200, amp: 0.55, tau: 0.009, body: 0.2, bodyF: 1300 });
  }, 0.12) },
  boltpull: { dur: 0.35, peak: 0.58, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 3500, amp: 0.5, tau: 0.008, body: 0.25, bodyF: 900 });
    addScrape(x, sr, r, 0.01, 0.085, { f0: 2500, f1: 3600, q: 3, amp: 0.35, grit: 0.8 });
    addGrains(x, sr, r, { t0: 0.015, span: 0.075, count: 10, shape: 1, f: [3000, 6000], amp: [0.08, 0.2], decay: 1 });
    addMetal(x, sr, r, 0.1, { f: 2800, amp: 0.95, tau: 0.016, body: 0.5, bodyF: 600, bodyTau: 0.022 });
  }, 0.12) },
  boltrelease: { dur: 0.32, peak: 0.62, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 3900, amp: 0.3, tau: 0.006 });
    addScrape(x, sr, r, 0.004, 0.032, { f0: 3400, f1: 2400, q: 2.5, amp: 0.3, grit: 0.4 });
    addMetal(x, sr, r, 0.038, { f: 2300, amp: 1, tau: 0.028, body: 0.9, bodyF: 450, bodyTau: 0.032 });
    addMetal(x, sr, r, 0.049, { f: 4100, amp: 0.45, tau: 0.01 });
  }, 0.14) },
  slideback: { dur: 0.25, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 4200, amp: 0.45, tau: 0.007 });
    addScrape(x, sr, r, 0.008, 0.055, { f0: 3000, f1: 4300, q: 2.5, amp: 0.3, grit: 0.6 });
    addMetal(x, sr, r, 0.068, { f: 3600, amp: 0.85, tau: 0.012, body: 0.35, bodyF: 820, bodyTau: 0.016 });
  }, 0.1) },
  sliderelease: { dur: 0.25, peak: 0.55, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.022, { f0: 4000, f1: 3000, q: 2, amp: 0.25, grit: 0.3 });
    addMetal(x, sr, r, 0.024, { f: 3200, amp: 1, tau: 0.016, body: 0.55, bodyF: 700, bodyTau: 0.02 });
    addMetal(x, sr, r, 0.032, { f: 4700, amp: 0.4, tau: 0.008 });
  }, 0.1) },
  pistol_clipout: { dur: 0.25, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 4500, amp: 0.45, tau: 0.006 });
    addScrape(x, sr, r, 0.018, 0.05, { f0: 2500, f1: 3500, q: 1.8, amp: 0.25, grit: 0.5 });
    addMetal(x, sr, r, 0.075, { f: 3000, amp: 0.75, tau: 0.012, body: 0.45, bodyF: 650, bodyTau: 0.018 });
  }, 0.1) },
  pistol_clipin: { dur: 0.25, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.042, { f0: 2200, f1: 3000, q: 1.8, amp: 0.25, grit: 0.5 });
    addMetal(x, sr, r, 0.048, { f: 2800, amp: 1, tau: 0.014, body: 0.7, bodyF: 600, bodyTau: 0.022 });
    addMetal(x, sr, r, 0.057, { f: 5000, amp: 0.4, tau: 0.007 });
  }, 0.1) },
  shotgun_insert: { dur: 0.25, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.05, { f0: 1300, f1: 1800, q: 1.4, amp: 0.3, grit: 0.4, color: 'pink' });
    addTone(x, sr, 0.04, { f: 190, f1: 120, glide: 0.02, tau: 0.022, amp: 0.55 });
    addBurst(x, sr, r, 0.04, 0.5, { a: 0.0006, tau: 0.01, filters: [['bandpass', 1200, 1.2]] });
    addMetal(x, sr, r, 0.055, { f: 2600, amp: 0.7, tau: 0.012, body: 0.6, bodyF: 900, bodyTau: 0.015 });
  }, 0.1) },
  shotgun_pump: { dur: 0.48, peak: 0.62, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.085, { f0: 900, f1: 1600, q: 1.2, amp: 0.4, grit: 0.6, color: 'pink' });
    addMetal(x, sr, r, 0.085, { f: 1900, amp: 1, tau: 0.024, body: 1.0, bodyF: 330, bodyTau: 0.04 });
    addScrape(x, sr, r, 0.15, 0.065, { f0: 1700, f1: 1100, q: 1.2, amp: 0.4, grit: 0.6, color: 'pink' });
    addMetal(x, sr, r, 0.22, { f: 2200, amp: 1, tau: 0.024, body: 1.0, bodyF: 360, bodyTau: 0.04 });
    addMetal(x, sr, r, 0.229, { f: 3900, amp: 0.35, tau: 0.008 });
  }, 0.14) },
  awp_bolt: { dur: 0.75, peak: 0.6, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 3000, amp: 0.65, tau: 0.012, body: 0.4, bodyF: 700 });
    addScrape(x, sr, r, 0.06, 0.1, { f0: 2000, f1: 2800, q: 2, amp: 0.35, grit: 0.7 });
    addMetal(x, sr, r, 0.168, { f: 2500, amp: 0.9, tau: 0.02, body: 0.6, bodyF: 500, bodyTau: 0.03 });
    addMetal(x, sr, r, 0.2, { f: 5200, amp: 0.25, tau: 0.04, n: 3 }); // ejected case
    addScrape(x, sr, r, 0.32, 0.085, { f0: 2800, f1: 2000, q: 2, amp: 0.35, grit: 0.7 });
    addMetal(x, sr, r, 0.41, { f: 2400, amp: 1, tau: 0.022, body: 0.7, bodyF: 480, bodyTau: 0.03 });
    addMetal(x, sr, r, 0.52, { f: 3300, amp: 0.8, tau: 0.014, body: 0.5, bodyF: 650, bodyTau: 0.02 });
  }, 0.12) },
  dryfire_rifle: { dur: 0.15, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 2600, amp: 1, tau: 0.014, body: 0.65, bodyF: 550, bodyTau: 0.02 });
    addMetal(x, sr, r, 0.006, { f: 3900, amp: 0.25, tau: 0.006 });
  }, 0.1) },
  dryfire_pistol: { dur: 0.12, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 3600, amp: 1, tau: 0.01, body: 0.45, bodyF: 900, bodyTau: 0.014 });
  }, 0.08) },
  deploy: { dur: 0.42, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.0, 0.16, { f0: 1100, f1: 2600, q: 0.8, amp: 0.35, grit: 0.3, color: 'pink', rise: 0.5 });
    for (const [t, f, a] of [[0.05, 3600, 0.35], [0.095, 4400, 0.25], [0.14, 2900, 0.4], [0.19, 3900, 0.3]]) {
      addMetal(x, sr, r, t + r.range(-0.008, 0.008), { f: r.jit(f, 0.08), amp: a, tau: 0.008, body: 0.2, bodyF: 1100 });
    }
    addMetal(x, sr, r, 0.245, { f: 2500, amp: 0.85, tau: 0.016, body: 0.5, bodyF: 600, bodyTau: 0.022 });
  }, 0.1) },
  zoom: { dur: 0.14, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0.0, { f: 2000, amp: 0.8, tau: 0.01, body: 0.5, bodyF: 1100, bodyTau: 0.012, n: 3 });
    addBurst(x, sr, r, 0.004, 0.35, { a: 0.004, h: 0.012, tau: 0.01, filters: [['bandpass', 4200, 1.4]] });
    addMetal(x, sr, r, 0.03, { f: 3100, amp: 0.35, tau: 0.006, n: 3 });
  }, 0.06) },
  silencer_screw: { dur: 1.15, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    const ticks = 11;
    let t = 0.03;
    for (let i = 0; i < ticks; i++) {
      addMetal(x, sr, r, t, { f: r.jit(3700, 0.08), amp: r.range(0.25, 0.45), tau: 0.006, n: 4, body: 0.15, bodyF: 1400 });
      addScrape(x, sr, r, t + 0.008, 0.05, { f0: 2300, f1: 2700, q: 1.5, amp: 0.08, grit: 0.8 });
      t += 0.085 - i * 0.002 + r.range(-0.01, 0.01);
    }
    addMetal(x, sr, r, t + 0.03, { f: 2700, amp: 0.9, tau: 0.018, body: 0.55, bodyF: 620, bodyTau: 0.024 });
  }, 0.1) },
};

export { foley, gunshot, suppressed };
