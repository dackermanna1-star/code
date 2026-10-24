/**
 * Procedural sound effect library. Every generator has the signature
 * `(ac, out, t, params) => duration` and builds a small short-lived graph
 * feeding `out`, so it renders identically into an AudioContext or an
 * OfflineAudioContext. All instances are randomized (pitch, filter, levels).
 */
import type { SurfaceMaterial } from '../physics/Physics';
import { getKit, mkOsc, mkNoise, mkFilter, mkGain, mkShaper, envPerc, envAHR, rand, randi, chance, pick, clamp, expRand, mtof } from './dsp';
import { thump, noiseHit, grains, modal, ping, squelch, droplets, lowpassTo } from './layers';

export interface SfxParams {
  /** linear gain multiplier (applied by the caller on the voice output) */
  vol: number;
  /** pitch multiplier */
  pitch: number;
  /** intensity (~0..1.6): impact strength, damage, ... */
  strength: number;
  heavy?: boolean;
  kick?: boolean;
  head?: boolean;
  crit?: boolean;
  material?: SurfaceMaterial;
  other?: string;
  part?: number;
  variant?: string;
}

export type SfxGen = (ac: BaseAudioContext, out: AudioNode, t: number, p: SfxParams) => number;

export interface SfxDef {
  gen: SfxGen;
  /** level normalization */
  gain: number;
  /** reverb send amount */
  wet: number;
  /** voice stealing priority */
  prio: number;
  /** concurrency group (shares a cap) */
  group?: string;
}

const HEAD = 2;
const isLimb = (part: number | undefined): boolean => part !== undefined && part >= 3;

// ====================================================================== combat

/** Meaty body layer shared by punches and weapon hits: low thump + mid smack. */
function flesh(ac: BaseAudioContext, out: AudioNode, t: number, s: number, heavy: boolean, head: boolean, pitch: number): void {
  thump(ac, out, t, {
    f0: (heavy ? rand(88, 106) : rand(112, 142)) * pitch,
    f1: (heavy ? rand(37, 43) : rand(47, 57)) * pitch,
    drop: heavy ? 0.08 : 0.055,
    tau: heavy ? 0.07 : 0.045,
    amp: (0.5 + 0.2 * s) * (heavy ? 1.15 : 1),
    drive: 0.9,
  });
  noiseHit(ac, out, t, { type: 'bandpass', f: rand(650, 1150) * (head ? 1.3 : 1) * pitch, q: 1.0, tau: heavy ? 0.028 : 0.02, amp: 0.38 + 0.14 * s });
}

const punch: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.3, 1.6);
  const heavy = !!(p.heavy || p.kick);
  const head = !!p.head;
  const crit = !!p.crit;
  const pit = p.pitch * rand(0.94, 1.06);
  flesh(ac, out, t, s, heavy, head, pit);
  // skin slap
  noiseHit(ac, out, t + rand(0, 0.002), { type: 'bandpass', f: rand(2300, 3400) * (head ? 1.22 : 1), q: 0.9, tau: head ? 0.011 : 0.008, amp: (head ? 0.5 : 0.36) * (p.kick ? 0.6 : 1) });
  // clothes (body shots)
  if (!head) noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: rand(450, 750), tau: 0.035, amp: 0.22 });
  // bone / cartilage crunch
  if (heavy || crit || (head && chance(0.55)))
    grains(ac, out, t + 0.001, { f: rand(1600, 2900), q: 1.3, n: 4 + (heavy ? 3 : 0) + (crit ? 7 : 0), spread: 0.022 + (crit ? 0.035 : 0), amp: 0.3 + (crit ? 0.1 : 0) });
  if (crit) thump(ac, out, t + 0.012, { f0: 70 * pit, f1: 30, drop: 0.14, tau: 0.1, amp: 0.25, drive: 0.6 });
  return heavy || crit ? 0.65 : 0.5;
};

/** Blocked hit: muffled forearm thud. */
const block: SfxGen = (ac, out, t, p) => {
  const heavy = !!p.heavy;
  const lp = lowpassTo(ac, out, heavy ? 1100 : 750, 0.7);
  thump(ac, lp, t, { f0: rand(118, 140) * p.pitch, f1: rand(56, 66), drop: 0.05, tau: heavy ? 0.055 : 0.04, amp: heavy ? 0.75 : 0.6, drive: 0.6 });
  noiseHit(ac, lp, t, { type: 'lowpass', f: rand(500, 800), tau: 0.03, amp: 0.55 });
  noiseHit(ac, out, t, { type: 'bandpass', f: rand(900, 1300), q: 0.8, tau: 0.012, amp: 0.16 });
  if (heavy) grains(ac, out, t, { f: 1800, q: 1.2, n: 4, spread: 0.02, amp: 0.18 });
  return 0.45;
};

/** Parry: bright clang + swish. */
const parry: SfxGen = (ac, out, t, p) => {
  const f = rand(600, 820) * p.pitch;
  const end = modal(ac, out, t, { f, ratios: [1, 2.756, 5.404, 8.933], taus: [0.3, 0.19, 0.11, 0.06], amps: [1, 0.55, 0.32, 0.15], amp: 0.36 });
  noiseHit(ac, out, t, { type: 'highpass', f: 2500, tau: 0.004, amp: 0.45 });
  modal(ac, out, t + 0.004, { f: rand(3000, 3400), ratios: [1, 1.48], taus: [0.16, 0.1], amps: [1, 0.6], amp: 0.05 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 1500, f1: 4200, sweep: 0.1, q: 1.6, att: 0.02, tau: 0.05, amp: 0.25 });
  thump(ac, out, t, { f0: 140, f1: 70, drop: 0.04, tau: 0.03, amp: 0.35 });
  return end - t;
};

const hitGlass: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.4, 1.5);
  flesh(ac, out, t, s, false, !!p.head, p.pitch);
  modal(ac, out, t, { f: rand(720, 1100) * p.pitch, ratios: [1, 2.02, 3.17, 4.4], taus: [0.06, 0.04, 0.025, 0.015], amps: [1, 0.5, 0.35, 0.2], amp: 0.3 });
  noiseHit(ac, out, t, { type: 'highpass', f: 4000, tau: 0.0035, amp: 0.32 });
  modal(ac, out, t + 0.002, { f: rand(2900, 4100), ratios: [1, 1.41, 1.93], taus: [0.04, 0.03, 0.02], amps: [1, 0.7, 0.5], amp: 0.05 });
  return 0.55;
};

const hitWood: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.4, 1.5);
  const heavy = !!p.heavy;
  flesh(ac, out, t, s, heavy, !!p.head, p.pitch);
  const f = (heavy ? rand(165, 235) : rand(260, 400)) * p.pitch;
  modal(ac, out, t, { f, ratios: [1, 2.76, 5.04, 7.3], taus: [0.075, 0.035, 0.02, 0.012], amps: [1, 0.55, 0.3, 0.15], amp: heavy ? 0.4 : 0.34 });
  noiseHit(ac, out, t, { type: 'bandpass', f: rand(800, 1300), q: 1.2, tau: 0.014, amp: 0.3 });
  if (heavy || p.crit) grains(ac, out, t + 0.002, { f: rand(1500, 2500), q: 1.2, n: 7, spread: 0.04, amp: 0.3 });
  return 0.55;
};

const hitMetal: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.4, 1.5);
  const heavy = !!p.heavy;
  flesh(ac, out, t, s, heavy, !!p.head, p.pitch);
  const f = (heavy ? rand(185, 290) : rand(370, 600)) * p.pitch;
  const taus = heavy ? [0.5, 0.34, 0.21, 0.12, 0.07] : [0.32, 0.21, 0.13, 0.08, 0.05];
  const end = modal(ac, out, t, { f, ratios: [1, 2.756, 5.404, 8.933, 13.34], taus, amps: [1, 0.6, 0.38, 0.22, 0.1], amp: 0.3, jitter: 0.01 });
  noiseHit(ac, out, t, { type: 'highpass', f: 3000, tau: 0.004, amp: 0.38 });
  if (heavy) grains(ac, out, t + 0.002, { f: rand(1500, 2400), q: 1.2, n: 8, spread: 0.045, amp: 0.32 });
  return end - t;
};

/** Frying pan: BONNNG with a long, beating ring. */
const hitPan: SfxGen = (ac, out, t, p) => {
  flesh(ac, out, t, 1.1, true, !!p.head, p.pitch);
  const f = rand(165, 225) * p.pitch;
  noiseHit(ac, out, t, { type: 'bandpass', f: 2200, q: 0.9, tau: 0.01, amp: 0.45 });
  // the two near-unison fundamentals beat slowly ("wah-wah" ring)
  const end = modal(ac, out, t, {
    f,
    ratios: [1, 1.0045, 2.32, 2.98, 4.15, 5.6, 6.95],
    taus: [0.75, 0.7, 0.42, 0.32, 0.2, 0.13, 0.08],
    amps: [0.5, 0.36, 0.3, 0.2, 0.13, 0.08, 0.045],
    amp: 0.5,
    jitter: 0.002,
    bend: 1.035,
    bendT: 0.09,
  });
  return end - t;
};

/** Blade: swish + wet squelch + thin metallic shing. variant 'pierce' = stab. */
const hitBlade: SfxGen = (ac, out, t, p) => {
  const stab = p.variant === 'pierce';
  if (!stab) noiseHit(ac, out, t, { type: 'bandpass', f: 6000, f1: 2400, sweep: 0.06, q: 1.4, att: 0.004, tau: 0.03, amp: 0.32 });
  thump(ac, out, t, { f0: rand(120, 140) * p.pitch, f1: 55, drop: 0.05, tau: stab ? 0.045 : 0.035, amp: stab ? 0.55 : 0.42, drive: 0.6 });
  squelch(ac, out, t + 0.004, { f0: rand(1300, 1800), f1: rand(280, 420), dur: rand(0.09, 0.15), amp: stab ? 0.7 : 0.55, q: 4, bumps: stab ? 2 : 3 });
  if (!stab) modal(ac, out, t, { f: rand(2900, 3500), ratios: [1, 1.57], taus: [0.06, 0.04], amps: [1, 0.6], amp: 0.06 });
  grains(ac, out, t + 0.03, { type: 'lowpass', f: 1300, n: randi(2, 4), spread: 0.18, amp: 0.15, grain: 0.006 });
  return 0.5;
};

const hitPlastic: SfxGen = (ac, out, t, p) => {
  flesh(ac, out, t, 0.6, false, !!p.head, p.pitch);
  modal(ac, out, t, { f: rand(430, 700) * p.pitch, ratios: [1, 2.2, 3.6], taus: [0.04, 0.025, 0.015], amps: [1, 0.5, 0.3], amp: 0.4 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 1600, q: 1.4, tau: 0.01, amp: 0.3 });
  return 0.4;
};

const hitCeramic: SfxGen = (ac, out, t, p) => {
  flesh(ac, out, t, 0.9, false, !!p.head, p.pitch);
  modal(ac, out, t, { f: rand(1200, 2000) * p.pitch, ratios: [1, 1.71, 2.62, 3.8], taus: [0.06, 0.04, 0.03, 0.02], amps: [1, 0.6, 0.4, 0.2], amp: 0.24 });
  noiseHit(ac, out, t, { type: 'highpass', f: 3500, tau: 0.003, amp: 0.32 });
  return 0.45;
};

/** Electric guitar to the face: open strings twang through a little crunch, body boom, wood crack. */
const hitGuitar: SfxGen = (ac, out, t, p) => {
  flesh(ac, out, t, 1.3, true, !!p.head, p.pitch);
  thump(ac, out, t, { f0: 180, f1: 105, drop: 0.05, tau: 0.09, amp: 0.38 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 240, q: 2, tau: 0.08, amp: 0.38 });
  grains(ac, out, t, { f: 2200, q: 1, n: 10, spread: 0.06, amp: 0.32 });
  const bus = mkGain(ac, 1);
  const ws = mkShaper(ac, getKit(ac).curves.crunch);
  const lp = mkFilter(ac, 'lowpass', 5000, 0.9);
  lp.frequency.setValueAtTime(5000, t);
  lp.frequency.setTargetAtTime(1100, t, 0.45);
  const g = mkGain(ac, 0.22);
  bus.connect(ws);
  ws.connect(lp);
  lp.connect(g);
  g.connect(out);
  const strings = [40, 45, 50, 55, 59, 64]; // E A D G B E open strings
  for (const m of strings) {
    if (chance(0.2)) continue;
    const f = mtof(m) * rand(0.99, 1.01);
    const t0 = t + rand(0, 0.014);
    const o = mkOsc(ac, 'sawtooth', f * rand(1.01, 1.04), t0, t + 2.4);
    o.frequency.exponentialRampToValueAtTime(f * rand(0.985, 0.996), t0 + 0.4);
    const sg = mkGain(ac, 0);
    envPerc(sg.gain, t0, 0.14, 0.002, rand(0.25, 0.45));
    o.connect(sg);
    sg.connect(bus);
  }
  return 2.5;
};

// ====================================================================== gore

/** Tearing: band-passed noise chopped at `rate` Hz. */
function tear(ac: BaseAudioContext, out: AudioNode, t: number, f: number, dur: number, amp: number, rate: number): void {
  grains(ac, out, t, { f, q: 1.4, n: Math.max(3, Math.round(dur * rate)), spread: dur, amp, grain: (1 / rate) * 0.55 });
}

const goreCarve: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.2, 1.5);
  squelch(ac, out, t, { f0: rand(900, 1500), f1: rand(250, 400), dur: rand(0.06, 0.11) * (0.75 + 0.35 * s), amp: 0.35 + 0.3 * s, q: 3.5, bumps: 2 });
  grains(ac, out, t + 0.012, { type: 'lowpass', f: 1400, n: 2 + Math.round(4 * s), spread: 0.16, amp: 0.16 + 0.1 * s, grain: 0.006 });
  return 0.4;
};

const goreSever: SfxGen = (ac, out, t, p) => {
  grains(ac, out, t, { f: rand(1200, 2200), q: 1.2, n: 9, spread: 0.045, amp: 0.6, grain: 0.0025 });
  noiseHit(ac, out, t, { type: 'highpass', f: 1500, tau: 0.005, amp: 0.5 });
  thump(ac, out, t, { f0: 110 * p.pitch, f1: 50, drop: 0.06, tau: 0.05, amp: 0.55, drive: 0.6 });
  squelch(ac, out, t + 0.01, { f0: rand(1600, 2100), f1: rand(220, 320), dur: rand(0.2, 0.28), amp: 0.7, q: 3.5, bumps: 3 });
  tear(ac, out, t + 0.005, rand(750, 1050), 0.16, 0.35, 45);
  noiseHit(ac, out, t + 0.03, { type: 'bandpass', f: 2600, q: 0.8, att: 0.03, hold: 0.1, tau: 0.12, amp: 0.13 });
  droplets(ac, out, t + 0.08, { n: 6, spread: 0.5, amp: 0.13 });
  grains(ac, out, t + 0.15, { type: 'lowpass', f: 1300, n: 6, spread: 0.45, amp: 0.18, grain: 0.007 });
  return 1.0;
};

const goreHead: SfxGen = (ac, out, t, p) => {
  thump(ac, out, t, { f0: 95 * p.pitch, f1: 34, drop: 0.1, tau: 0.11, amp: 0.75, drive: 0.9 });
  noiseHit(ac, out, t, { type: 'highpass', f: 1300, tau: 0.006, amp: 0.65 });
  grains(ac, out, t, { f: rand(1300, 2200), q: 1.1, n: 15, spread: 0.06, amp: 0.65, grain: 0.0028 });
  noiseHit(ac, out, t, { type: 'lowpass', f: 1200, tau: 0.07, amp: 0.6 });
  squelch(ac, out, t + 0.012, { f0: rand(1900, 2400), f1: rand(180, 260), dur: rand(0.26, 0.34), amp: 0.75, q: 3, bumps: 4 });
  noiseHit(ac, out, t + 0.04, { type: 'bandpass', f: 2400, q: 0.8, att: 0.04, hold: 0.15, tau: 0.15, amp: 0.13 });
  droplets(ac, out, t + 0.1, { n: 12, spread: 0.85, amp: 0.13 });
  grains(ac, out, t + 0.2, { type: 'lowpass', f: 1200, n: 12, spread: 0.8, amp: 0.2, grain: 0.008 });
  return 1.3;
};

// ====================================================================== physical impacts

const SOFT = new Set(['fabric', 'carpet', 'flesh', 'rubber', 'paper']);

const impact: SfxGen = (ac, out, t, p) => {
  const m = p.material ?? 'wood';
  const s = clamp(p.strength, 0.03, 1.6);
  const damp = SOFT.has(p.other ?? '') ? 0.5 : 1;
  const lvl = Math.pow(s, 0.75);
  const br = clamp(0.4 + 0.6 * s, 0.4, 1.2);
  const pit = p.pitch;
  let end = t + 0.25;
  switch (m) {
    case 'wood': {
      end = modal(ac, out, t, { f: rand(150, 320) * pit, ratios: [1, 2.42, 4.47, 6.85], taus: [0.055 * damp, 0.028 * damp, 0.015, 0.009], amps: [1, 0.55 * br, 0.32 * br, 0.16 * br], amp: 0.5 * lvl });
      noiseHit(ac, out, t, { type: 'bandpass', f: rand(600, 1200) * br, q: 1.2, tau: 0.012, amp: 0.38 * lvl });
      if (s > 0.5) thump(ac, out, t, { f0: 110, f1: 60, drop: 0.04, tau: 0.035, amp: 0.35 * lvl });
      break;
    }
    case 'metal': {
      const dl = (0.35 + 0.65 * Math.min(s, 1)) * damp;
      end = modal(ac, out, t, {
        f: expRand(280, 900) * pit,
        ratios: [1, 2.756, 5.404, 8.933, 13.34],
        taus: [0.55 * dl, 0.36 * dl, 0.22 * dl, 0.13 * dl, 0.08 * dl],
        amps: [1, 0.65, 0.45 * br, 0.28 * br, 0.14 * br],
        amp: 0.3 * lvl,
        jitter: 0.01,
      });
      noiseHit(ac, out, t, { type: 'highpass', f: 2800, tau: 0.004, amp: 0.35 * lvl * br });
      break;
    }
    case 'glass': {
      end = modal(ac, out, t, { f: expRand(1500, 3000) * pit, ratios: [1, 1.58, 2.41, 3.3], taus: [0.12 * damp, 0.08 * damp, 0.05, 0.03], amps: [1, 0.5, 0.35, 0.2], amp: 0.22 * lvl });
      ping(ac, out, t, rand(550, 1000) * pit, 0.025 * damp, 0.25 * lvl);
      noiseHit(ac, out, t, { type: 'highpass', f: 5000, tau: 0.0025, amp: 0.25 * lvl });
      break;
    }
    case 'ceramic': {
      end = modal(ac, out, t, { f: expRand(1100, 2200) * pit, ratios: [1, 1.73, 2.65, 3.82], taus: [0.05 * damp, 0.035, 0.024, 0.015], amps: [1, 0.6, 0.4, 0.2], amp: 0.3 * lvl });
      noiseHit(ac, out, t, { type: 'highpass', f: 3500, tau: 0.003, amp: 0.3 * lvl });
      if (s > 0.6) thump(ac, out, t, { f0: 200, f1: 120, drop: 0.02, tau: 0.02, amp: 0.2 * lvl });
      break;
    }
    case 'tile': {
      noiseHit(ac, out, t, { type: 'bandpass', f: rand(2200, 3200), q: 1.2, tau: 0.006, amp: 0.5 * lvl });
      modal(ac, out, t, { f: rand(900, 1400) * pit, ratios: [1, 2.3], taus: [0.025, 0.012], amps: [1, 0.5], amp: 0.2 * lvl });
      thump(ac, out, t, { f0: 160, f1: 90, drop: 0.02, tau: 0.02, amp: 0.25 * lvl });
      break;
    }
    case 'concrete':
    case 'plaster': {
      thump(ac, out, t, { f0: 95 * pit, f1: 55, drop: 0.035, tau: 0.035, amp: 0.45 * lvl, drive: 0.5 });
      noiseHit(ac, out, t, { type: 'lowpass', f: m === 'plaster' ? 700 : 1100, tau: 0.025, amp: 0.5 * lvl });
      if (s > 0.4) grains(ac, out, t + 0.004, { f: 1500, q: 1, n: randi(4, 8), spread: 0.05, amp: 0.25 * lvl });
      break;
    }
    case 'fabric':
    case 'carpet': {
      noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: rand(300, 450), tau: 0.04, amp: 0.5 * lvl });
      thump(ac, out, t, { f0: 75 * pit, f1: 45, drop: 0.04, tau: 0.04, amp: 0.32 * lvl });
      break;
    }
    case 'flesh': {
      thump(ac, out, t, { f0: rand(85, 105) * pit, f1: 45, drop: 0.05, tau: 0.04, amp: 0.45 * lvl, drive: 0.5 });
      noiseHit(ac, out, t, { type: 'bandpass', f: rand(1200, 2000), q: 1, tau: 0.008, amp: 0.3 * lvl });
      noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: 500, tau: 0.03, amp: 0.3 * lvl });
      break;
    }
    case 'rubber': {
      thump(ac, out, t, { f0: 165 * pit, f1: 100, drop: 0.04, tau: 0.05, amp: 0.45 * lvl });
      noiseHit(ac, out, t, { type: 'lowpass', f: 500, tau: 0.02, amp: 0.3 * lvl });
      break;
    }
    case 'plastic': {
      end = modal(ac, out, t, { f: rand(400, 800) * pit, ratios: [1, 2.15, 3.6], taus: [0.035 * damp, 0.02, 0.012], amps: [1, 0.5, 0.3], amp: 0.35 * lvl });
      noiseHit(ac, out, t, { type: 'bandpass', f: 1600, q: 1.4, tau: 0.01, amp: 0.3 * lvl });
      break;
    }
    case 'paper':
    default: {
      grains(ac, out, t, { f: rand(1600, 2600), q: 0.9, n: randi(4, 7), spread: 0.05, amp: 0.25 * lvl, grain: 0.004 });
      noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: 600, tau: 0.02, amp: 0.2 * lvl });
      break;
    }
  }
  return Math.max(end - t, 0.25);
};

/** Glass shatter: crack, spray, many tinkling partials, bouncing shards. */
function shatterGlass(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  const tl = lowpassTo(ac, out, 7000);
  noiseHit(ac, tl, t, { type: 'highpass', f: 1500, tau: 0.009, amp: 0.7 });
  thump(ac, out, t, { f0: (big ? 170 : 270) * pit, f1: big ? 80 : 150, drop: 0.03, tau: 0.035, amp: 0.42 });
  noiseHit(ac, tl, t + 0.002, { type: 'bandpass', f: 3800, q: 0.8, tau: big ? 0.13 : 0.085, amp: 0.45 });
  noiseHit(ac, tl, t + 0.003, { type: 'highpass', f: 5000, att: 0.004, tau: big ? 0.16 : 0.1, amp: 0.06 });
  const n = Math.round((big ? 16 : 11) * clamp(s, 0.7, 1.3));
  let end = t + 0.5;
  for (let i = 0; i < n; i++) {
    const dt = Math.pow(Math.random(), 2.2) * (big ? 0.85 : 0.6);
    const f = expRand(2000, 6000) * pit;
    end = Math.max(end, ping(ac, tl, t + dt + 0.004, f, rand(0.012, 0.05), rand(0.05, 0.12) * (1 - 0.6 * dt), chance(0.4) ? f * rand(1.3, 1.6) : 0));
  }
  for (let i = 0; i < (big ? 4 : 2); i++) {
    const dt = rand(0.12, 0.6);
    end = Math.max(end, modal(ac, tl, t + dt, { f: rand(1800, 3400), ratios: [1, 1.6], taus: [0.03, 0.02], amps: [1, 0.5], amp: rand(0.05, 0.1) }));
  }
  return end - t;
}

function breakWood(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  noiseHit(ac, out, t, { type: 'highpass', f: 1000, tau: 0.007, amp: 0.8 });
  thump(ac, out, t, { f0: 150 * pit, f1: 70, drop: 0.06, tau: 0.06, amp: 0.55, drive: 0.6 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 300, q: 1.2, tau: 0.06, amp: 0.45 });
  grains(ac, out, t + 0.003, { f: rand(1400, 2600), q: 1.1, n: 14 + (big ? 8 : 0), spread: big ? 0.35 : 0.22, amp: 0.5, grain: 0.003 });
  let end = t + 0.6;
  for (let i = 0; i < (big ? 4 : 2); i++)
    end = Math.max(end, modal(ac, out, t + rand(0.08, 0.5), { f: rand(250, 500), ratios: [1, 2.6, 4.9], taus: [0.04, 0.02, 0.01], amps: [1, 0.5, 0.25], amp: rand(0.15, 0.3) * s }));
  return end - t;
}

function breakCeramic(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  const tl = lowpassTo(ac, out, 8000);
  noiseHit(ac, out, t, { type: 'highpass', f: 1500, tau: 0.008, amp: 0.7 });
  thump(ac, out, t, { f0: 220 * pit, f1: 110, drop: 0.03, tau: 0.03, amp: 0.35 });
  noiseHit(ac, tl, t, { type: 'bandpass', f: 3200, q: 0.8, tau: 0.05, amp: 0.4 });
  let end = t + 0.4;
  const n = big ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const dt = Math.pow(Math.random(), 2) * 0.5;
    end = Math.max(end, modal(ac, tl, t + dt, { f: expRand(1300, 4200) * pit, ratios: [1, 1.7], taus: [rand(0.015, 0.04), 0.012], amps: [1, 0.5], amp: rand(0.08, 0.2) * (1 - dt) }));
  }
  return end - t;
}

function breakMetal(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  thump(ac, out, t, { f0: 120 * pit, f1: 55, drop: 0.06, tau: 0.06, amp: 0.5, drive: 0.6 });
  let end = modal(ac, out, t, { f: rand(170, 260) * pit, ratios: [1, 2.756, 5.404, 8.933], taus: [1.0, 0.6, 0.35, 0.2], amps: [1, 0.7, 0.45, 0.25], amp: 0.24, jitter: 0.012 });
  noiseHit(ac, out, t, { type: 'highpass', f: 2000, tau: 0.15, amp: 0.3 });
  for (let i = 0; i < (big ? 6 : 4); i++)
    end = Math.max(end, modal(ac, out, t + rand(0.05, 0.6), { f: rand(500, 1500), ratios: [1, 2.756, 5.4], taus: [0.15, 0.09, 0.05], amps: [1, 0.5, 0.3], amp: rand(0.08, 0.16) }));
  return end - t;
}

function breakPlastic(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  noiseHit(ac, out, t, { type: 'highpass', f: 1200, tau: 0.006, amp: 0.55 });
  grains(ac, out, t, { f: 1800, q: 1.2, n: 10, spread: 0.12, amp: 0.4, grain: 0.003 });
  let end = t + 0.4;
  for (let i = 0; i < 4; i++)
    end = Math.max(end, modal(ac, out, t + rand(0.05, 0.4), { f: rand(500, 900) * pit, ratios: [1, 2.2], taus: [0.03, 0.015], amps: [1, 0.5], amp: rand(0.12, 0.22) }));
  return end - t;
}

function breakSoft(ac: BaseAudioContext, out: AudioNode, t: number, s: number): number {
  tear(ac, out, t, rand(900, 1500), 0.22, 0.4, 60);
  noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: 700, tau: 0.06, amp: 0.4 });
  return 0.5;
}

function crumble(ac: BaseAudioContext, out: AudioNode, t: number, s: number, big: boolean, pit: number): number {
  thump(ac, out, t, { f0: 90 * pit, f1: 40, drop: 0.08, tau: 0.08, amp: 0.6, drive: 0.6 });
  noiseHit(ac, out, t, { type: 'lowpass', f: 900, tau: 0.08, amp: 0.55 });
  grains(ac, out, t + 0.01, { f: rand(900, 1700), q: 0.9, n: big ? 26 : 16, spread: big ? 0.55 : 0.35, amp: 0.45, grain: 0.004 });
  return 0.9;
}

const breakGen: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.5, 1.6);
  const big = s >= 1.35 || !!p.heavy;
  const pit = p.pitch * rand(0.94, 1.06);
  switch (p.material ?? 'glass') {
    case 'glass':
      return shatterGlass(ac, out, t, s, big, pit);
    case 'wood':
      return breakWood(ac, out, t, s, big, pit);
    case 'ceramic':
    case 'tile':
      return breakCeramic(ac, out, t, s, big, pit);
    case 'metal':
      return breakMetal(ac, out, t, s, big, pit);
    case 'plastic':
    case 'rubber':
      return breakPlastic(ac, out, t, s, big, pit);
    case 'fabric':
    case 'carpet':
    case 'paper':
      return breakSoft(ac, out, t, s);
    default:
      return crumble(ac, out, t, s, big, pit);
  }
};

// ====================================================================== movement

function creak(ac: BaseAudioContext, out: AudioNode, t: number, amp: number, len = rand(0.15, 0.32)): void {
  const f0 = rand(170, 320);
  const o = mkOsc(ac, 'sawtooth', f0, t, t + len + 0.05);
  o.frequency.linearRampToValueAtTime(f0 * rand(0.85, 1.2), t + len);
  const bp = mkFilter(ac, 'bandpass', rand(700, 1200), 3);
  const am = mkGain(ac, 0.5);
  const lfo = mkOsc(ac, 'square', rand(22, 40), t, t + len + 0.05);
  const lg = mkGain(ac, 0.5);
  lfo.connect(lg);
  lg.connect(am.gain);
  const g = mkGain(ac, 0);
  envAHR(g.gain, t, amp, 0.04, Math.max(0, len - 0.08), 0.02);
  o.connect(bp);
  bp.connect(am);
  am.connect(g);
  g.connect(out);
}

const footstep: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.15, 1.2);
  const pit = p.pitch * rand(0.93, 1.07);
  const toe = rand(0.03, 0.06);
  switch (p.material ?? 'wood') {
    case 'tile':
    case 'ceramic':
      noiseHit(ac, out, t, { type: 'bandpass', f: rand(2400, 3400), q: 1.4, tau: 0.006, amp: 0.42 * s });
      thump(ac, out, t, { f0: 140 * pit, f1: 90, drop: 0.02, tau: 0.018, amp: 0.25 * s });
      noiseHit(ac, out, t + toe, { type: 'bandpass', f: rand(2000, 3000), q: 1.2, tau: 0.004, amp: 0.2 * s });
      break;
    case 'concrete':
    case 'plaster':
      thump(ac, out, t, { f0: 110 * pit, f1: 65, drop: 0.025, tau: 0.02, amp: 0.3 * s });
      grains(ac, out, t, { f: rand(1200, 2000), q: 0.9, n: randi(4, 8), spread: 0.05, amp: 0.3 * s, grain: 0.003 });
      noiseHit(ac, out, t + toe, { type: 'bandpass', f: 1400, q: 1, tau: 0.008, amp: 0.15 * s });
      break;
    case 'carpet':
    case 'fabric':
    case 'paper':
      noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: rand(350, 550), tau: 0.03, amp: 0.4 * s });
      thump(ac, out, t, { f0: 90 * pit, f1: 55, drop: 0.03, tau: 0.02, amp: 0.2 * s });
      break;
    case 'metal':
      thump(ac, out, t, { f0: 120 * pit, f1: 70, drop: 0.025, tau: 0.02, amp: 0.3 * s });
      modal(ac, out, t, { f: rand(500, 800) * pit, ratios: [1, 2.756, 5.4], taus: [0.12, 0.07, 0.04], amps: [1, 0.5, 0.3], amp: 0.13 * s });
      noiseHit(ac, out, t + toe, { type: 'bandpass', f: 2500, q: 1.2, tau: 0.005, amp: 0.18 * s });
      break;
    case 'glass':
      thump(ac, out, t, { f0: 110 * pit, f1: 65, drop: 0.025, tau: 0.02, amp: 0.28 * s });
      grains(ac, out, t, { type: 'highpass', f: 3500, n: randi(6, 12), spread: 0.06, amp: 0.25 * s, grain: 0.0015 });
      break;
    case 'flesh':
      thump(ac, out, t, { f0: 90 * pit, f1: 50, drop: 0.03, tau: 0.03, amp: 0.3 * s });
      squelch(ac, out, t, { f0: 900, f1: 300, dur: 0.06, amp: 0.25 * s, q: 3, bumps: 1 });
      break;
    case 'wood':
    default:
      thump(ac, out, t, { f0: rand(95, 125) * pit, f1: rand(55, 68), drop: 0.03, tau: 0.024, amp: 0.38 * s, drive: 0.3 });
      noiseHit(ac, out, t, { type: 'bandpass', f: rand(380, 650) * pit, q: 1.3, tau: 0.018, amp: 0.38 * s });
      noiseHit(ac, out, t + toe, { type: 'bandpass', f: rand(800, 1400), q: 1.2, tau: 0.009, amp: 0.18 * s });
      if (chance(0.035)) creak(ac, out, t + 0.02, 0.05 * s);
      break;
  }
  return 0.35;
};

const whoosh: SfxGen = (ac, out, t, p) => {
  const heavy = !!p.heavy;
  const s = clamp(p.strength, 0.3, 1.5);
  const pit = p.pitch * rand(0.9, 1.1);
  const dur = (heavy ? rand(0.26, 0.34) : rand(0.13, 0.19)) / Math.max(pit, 0.5);
  const f0 = (heavy ? 260 : 450) * pit;
  const f1 = (heavy ? 1000 : 1650) * pit;
  const f2 = (heavy ? 420 : 700) * pit;
  const k = getKit(ac);
  const end = t + dur + 0.03;
  const src = mkNoise(ac, k.white, t, end);
  const bp = mkFilter(ac, 'bandpass', f0, heavy ? 1.1 : 1.4);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = mkGain(ac, 0);
  const a = (heavy ? 0.5 : 0.5) * s * 4.2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(a, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.002, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  if (heavy) noiseHit(ac, out, t + dur * 0.2, { type: 'lowpass', f: 230, att: dur * 0.25, tau: dur * 0.25, amp: 0.35 * s });
  return dur + 0.05;
};

/** Ragdoll hitting the floor / walls. */
const bodyFall: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.1, 1.5);
  const limb = isLimb(p.part);
  const pit = p.pitch * rand(0.92, 1.08);
  thump(ac, out, t, { f0: rand(80, 105) * pit, f1: rand(38, 46), drop: 0.07, tau: 0.045 + 0.05 * s, amp: (0.42 + 0.3 * Math.min(s, 1.2)) * (limb ? 0.55 : 1), drive: 0.7 });
  noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: rand(400, 650), tau: 0.035 + 0.03 * s, amp: 0.45 * s });
  noiseHit(ac, out, t + 0.002, { type: 'bandpass', f: rand(1200, 2200), q: 1, tau: 0.008, amp: 0.28 * s * (limb ? 1.3 : 0.8) });
  modal(ac, out, t, { f: rand(120, 180), ratios: [1, 2.3], taus: [0.04, 0.02], amps: [1, 0.4], amp: 0.2 * s });
  if (p.part === HEAD) modal(ac, out, t + 0.004, { f: rand(280, 380) * pit, ratios: [1, 2.6], taus: [0.03, 0.015], amps: [1, 0.5], amp: 0.22 * s });
  if (s > 1.0) grains(ac, out, t + 0.002, { f: 1800, q: 1.2, n: 5, spread: 0.03, amp: 0.2 * s });
  return 0.6;
};

const drip: SfxGen = (ac, out, t, p) => {
  if (chance(0.5)) droplets(ac, out, t, { n: 1, spread: 0.001, amp: 0.35, lo: 500, hi: 1100 });
  else grains(ac, out, t, { type: 'lowpass', f: 1500, n: 1, spread: 0.001, amp: 0.5, grain: 0.006 });
  return 0.15;
};

// ====================================================================== feedback stings (2D)

const killSting: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 1, 2);
  thump(ac, out, t, { f0: 140, f1: 42, drop: 0.09, tau: 0.1, amp: 0.62, drive: 0.8 });
  const end = t + 1.7;
  const o = mkOsc(ac, 'sine', 66 * Math.pow(s, 0.15), t, end);
  o.frequency.exponentialRampToValueAtTime(29, t + 0.95);
  const g = mkGain(ac, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.012);
  g.gain.setTargetAtTime(0, t + 0.12, 0.3);
  o.connect(g);
  g.connect(out);
  const o2 = mkOsc(ac, 'triangle', 132, t, end);
  o2.frequency.exponentialRampToValueAtTime(58, t + 0.95);
  const g2 = mkGain(ac, 0);
  envPerc(g2.gain, t, 0.12, 0.01, 0.22);
  o2.connect(g2);
  g2.connect(out);
  noiseHit(ac, out, t, { buf: 'brown', type: 'lowpass', f: 220, tau: 0.2, amp: 0.4 });
  noiseHit(ac, out, t, { type: 'highpass', f: 3000, att: 0.002, tau: 0.1, amp: 0.07 });
  return 1.7;
};

const playerHurt: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.3, 1.5);
  const lp = lowpassTo(ac, out, 900, 0.7);
  thump(ac, lp, t, { f0: 95, f1: 40, drop: 0.08, tau: 0.08, amp: 0.6 * s, drive: 0.8 });
  noiseHit(ac, lp, t, { buf: 'pink', type: 'lowpass', f: 500, tau: 0.05, amp: 0.5 * s });
  return 0.6;
};

const playerDeath: SfxGen = (ac, out, t, p) => {
  thump(ac, out, t, { f0: 110, f1: 30, drop: 0.25, tau: 0.25, amp: 0.7, drive: 0.8 });
  noiseHit(ac, out, t, { buf: 'brown', type: 'lowpass', f: 180, att: 0.01, tau: 0.6, amp: 0.5 });
  const o = mkOsc(ac, 'sine', 55, t, t + 3.2);
  o.frequency.exponentialRampToValueAtTime(26, t + 2.5);
  const g = mkGain(ac, 0);
  envPerc(g.gain, t, 0.35, 0.05, 0.7);
  o.connect(g);
  g.connect(out);
  return 3.2;
};

// ====================================================================== player actions / interactions

const land: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.2, 1.5);
  thump(ac, out, t, { f0: 85, f1: 42, drop: 0.06, tau: 0.05 + 0.03 * s, amp: 0.55 * s, drive: 0.6 });
  noiseHit(ac, out, t, { buf: 'pink', type: 'lowpass', f: 600, tau: 0.04, amp: 0.4 * s });
  impact(ac, out, t, { ...p, material: p.material ?? 'wood', strength: 0.5 * s });
  return 0.5;
};

const cloth: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.2, 1.5);
  noiseHit(ac, out, t, { type: 'bandpass', f: rand(700, 1300), f1: rand(400, 700), sweep: 0.08, q: 0.8, att: 0.02, tau: 0.035, amp: 0.35 * s });
  return 0.3;
};

const grab: SfxGen = (ac, out, t, p) => {
  cloth(ac, out, t, p);
  noiseHit(ac, out, t + 0.01, { type: 'bandpass', f: 1800, q: 1, tau: 0.008, amp: 0.3 });
  thump(ac, out, t, { f0: 120, f1: 70, drop: 0.03, tau: 0.02, amp: 0.25 });
  return 0.3;
};

const rage: SfxGen = (ac, out, t, p) => {
  thump(ac, out, t + 0.35, { f0: 70, f1: 28, drop: 0.3, tau: 0.3, amp: 0.75, drive: 0.9 });
  // reverse-ish swell into the hit
  noiseHit(ac, out, t, { type: 'bandpass', f: 300, f1: 2500, sweep: 0.35, q: 0.9, att: 0.33, tau: 0.03, amp: 0.4 });
  const o = mkOsc(ac, 'sawtooth', 55, t + 0.35, t + 2.4);
  o.frequency.exponentialRampToValueAtTime(41, t + 2.2);
  const lp = mkFilter(ac, 'lowpass', 300, 1.5);
  const g = mkGain(ac, 0);
  envPerc(g.gain, t + 0.35, 0.3, 0.02, 0.5);
  o.connect(lp);
  lp.connect(g);
  g.connect(out);
  heartbeat(ac, out, t + 0.9, p);
  return 2.4;
};

const heartbeat: SfxGen = (ac, out, t, p) => {
  const s = clamp(p.strength, 0.3, 1.5);
  thump(ac, out, t, { f0: 62, f1: 40, drop: 0.05, tau: 0.045, amp: 0.6 * s, drive: 0.5 });
  thump(ac, out, t + 0.21, { f0: 56, f1: 38, drop: 0.05, tau: 0.055, amp: 0.42 * s, drive: 0.5 });
  return 0.6;
};

const doorSlam: SfxGen = (ac, out, t, p) => {
  thump(ac, out, t, { f0: 90, f1: 45, drop: 0.06, tau: 0.08, amp: 0.65, drive: 0.6 });
  const end = modal(ac, out, t, { f: rand(85, 110), ratios: [1, 2.4, 4.1], taus: [0.12, 0.06, 0.03], amps: [1, 0.5, 0.3], amp: 0.4 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 700, q: 1, tau: 0.03, amp: 0.4 });
  grains(ac, out, t + 0.02, { f: 2400, q: 2, n: 8, spread: 0.18, amp: 0.15 });
  return end - t;
};

const doorCreak: SfxGen = (ac, out, t, p) => {
  creak(ac, out, t, 0.32, rand(0.5, 0.9));
  return 1.0;
};

const drink: SfxGen = (ac, out, t, p) => {
  // three gulps then a satisfied "ahh"-ish exhale
  for (let i = 0; i < 3; i++) {
    const tt = t + i * rand(0.32, 0.4);
    const o = mkOsc(ac, 'sine', rand(170, 210), tt, tt + 0.12);
    o.frequency.exponentialRampToValueAtTime(rand(90, 120), tt + 0.09);
    const g = mkGain(ac, 0);
    envPerc(g.gain, tt, 0.4, 0.008, 0.025);
    o.connect(g);
    g.connect(out);
    noiseHit(ac, out, tt, { type: 'bandpass', f: 500, q: 2, tau: 0.03, amp: 0.25 });
  }
  noiseHit(ac, out, t + 1.2, { type: 'bandpass', f: 1100, q: 1.2, att: 0.05, hold: 0.15, tau: 0.12, amp: 0.15 });
  return 1.8;
};

const tap: SfxGen = (ac, out, t, p) => {
  // beer tap: hiss + glass filling (resonance rising)
  const dur = 2.2;
  const k = getKit(ac);
  const src = mkNoise(ac, k.white, t, t + dur + 0.1);
  const bp = mkFilter(ac, 'bandpass', 420, 3);
  bp.frequency.setValueAtTime(420, t);
  bp.frequency.linearRampToValueAtTime(1250, t + dur);
  const g = mkGain(ac, 0);
  envAHR(g.gain, t, 0.9, 0.08, dur - 0.2, 0.05);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  noiseHit(ac, out, t, { type: 'highpass', f: 4000, att: 0.03, hold: dur - 0.2, tau: 0.05, amp: 0.08 });
  return dur + 0.2;
};

const register: SfxGen = (ac, out, t, p) => {
  // cha-ching: drawer clunk + two bell dings
  thump(ac, out, t, { f0: 140, f1: 80, drop: 0.03, tau: 0.03, amp: 0.35 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 900, f1: 500, sweep: 0.25, q: 1.5, att: 0.02, hold: 0.15, tau: 0.04, amp: 0.25 });
  modal(ac, out, t + 0.08, { f: 2100, ratios: [1, 1.27, 1.62, 2.31], taus: [0.25, 0.2, 0.15, 0.1], amps: [1, 0.6, 0.45, 0.25], amp: 0.14 });
  const end = modal(ac, out, t + 0.24, { f: 2650, ratios: [1, 1.27, 1.62, 2.31], taus: [0.4, 0.3, 0.2, 0.12], amps: [1, 0.6, 0.45, 0.25], amp: 0.16 });
  return end - t;
};

const bell: SfxGen = (ac, out, t, p) => {
  // brass bar bell (LAST CALL!) rung three times
  let end = t;
  for (let i = 0; i < 3; i++)
    end = modal(ac, out, t + i * 0.36, { f: 880 * p.pitch, ratios: [0.5, 1, 1.19, 1.5, 2.0, 2.52, 3.0], taus: [0.9, 0.8, 0.5, 0.4, 0.3, 0.2, 0.12], amps: [0.4, 1, 0.5, 0.35, 0.3, 0.15, 0.08], amp: 0.2 });
  return end - t;
};

const coin: SfxGen = (ac, out, t, p) => {
  ping(ac, out, t, 3500, 0.08, 0.16, 5120);
  ping(ac, out, t + 0.07, 3300, 0.05, 0.1, 4800);
  thump(ac, out, t + 0.3, { f0: 300, f1: 200, drop: 0.02, tau: 0.02, amp: 0.15 });
  grains(ac, out, t + 0.3, { f: 2600, q: 2, n: 6, spread: 0.2, amp: 0.1 });
  return 0.7;
};

const flush: SfxGen = (ac, out, t, p) => {
  const k = getKit(ac);
  const dur = 2.6;
  const src = mkNoise(ac, k.white, t, t + dur + 0.2);
  const lp = mkFilter(ac, 'lowpass', 400, 0.8);
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.linearRampToValueAtTime(1600, t + 0.4);
  lp.frequency.linearRampToValueAtTime(500, t + dur);
  const g = mkGain(ac, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.35);
  g.gain.linearRampToValueAtTime(0.25, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(out);
  droplets(ac, out, t + 0.5, { n: 10, spread: 1.8, amp: 0.12, lo: 200, hi: 500 });
  return dur + 0.2;
};

const phone: SfxGen = (ac, out, t, p) => {
  // old bell telephone: two rings
  const dur = 2.2;
  for (const [off, len] of [[0, 0.9], [1.25, 0.9]] as const) {
    const tt = t + off;
    const o = mkOsc(ac, 'triangle', 1500, tt, tt + len);
    const o2 = mkOsc(ac, 'triangle', 1900, tt, tt + len);
    const am = mkGain(ac, 0.5);
    const lfo = mkOsc(ac, 'square', 20, tt, tt + len);
    const lg = mkGain(ac, 0.5);
    lfo.connect(lg);
    lg.connect(am.gain);
    const g = mkGain(ac, 0);
    envAHR(g.gain, tt, 0.07, 0.01, len - 0.1, 0.02);
    o.connect(am);
    o2.connect(am);
    am.connect(g);
    g.connect(out);
  }
  return dur;
};

const arcade: SfxGen = (ac, out, t, p) => {
  const notes = pick([[72, 76, 79, 84], [84, 79, 76, 72], [60, 67, 72, 79, 84], [76, 74, 72, 71]]);
  const step = rand(0.05, 0.08);
  notes.forEach((m, i) => {
    const tt = t + i * step;
    const o = mkOsc(ac, 'square', mtof(m), tt, tt + step);
    const g = mkGain(ac, 0);
    envAHR(g.gain, tt, 0.06, 0.003, step * 0.7, 0.01);
    o.connect(g);
    g.connect(out);
  });
  return notes.length * step + 0.1;
};

const dart: SfxGen = (ac, out, t, p) => {
  modal(ac, out, t, { f: rand(500, 700), ratios: [1, 2.5], taus: [0.03, 0.015], amps: [1, 0.4], amp: 0.35 });
  noiseHit(ac, out, t, { type: 'bandpass', f: 2500, q: 1.5, tau: 0.004, amp: 0.3 });
  return 0.3;
};

const glassClink: SfxGen = (ac, out, t, p) => {
  const f = expRand(2200, 3600) * p.pitch;
  const end = modal(ac, out, t, { f, ratios: [1, 1.52, 2.33], taus: [0.18, 0.1, 0.06], amps: [1, 0.4, 0.25], amp: 0.2 });
  if (chance(0.6)) modal(ac, out, t + rand(0.004, 0.012), { f: f * rand(1.08, 1.25), ratios: [1, 1.5], taus: [0.14, 0.08], amps: [1, 0.4], amp: 0.14 });
  return end - t;
};

function uiBlip(f: number, f1: number, dur: number, amp: number, type: OscillatorType = 'triangle'): SfxGen {
  return (ac, out, t) => {
    const o = mkOsc(ac, type, f, t, t + dur + 0.02);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, amp, 0.002, dur * 0.3);
    o.connect(g);
    g.connect(out);
    return dur + 0.05;
  };
}

const uiConfirm: SfxGen = (ac, out, t) => {
  uiBlip(660, 660, 0.08, 0.2)(ac, out, t, { vol: 1, pitch: 1, strength: 1 });
  uiBlip(990, 990, 0.12, 0.2)(ac, out, t + 0.07, { vol: 1, pitch: 1, strength: 1 });
  return 0.3;
};

// ====================================================================== registry

const MATERIALS: SurfaceMaterial[] = ['wood', 'tile', 'metal', 'glass', 'plaster', 'fabric', 'flesh', 'concrete', 'carpet', 'ceramic', 'rubber', 'plastic', 'paper'];

/** Weapon `sound` family -> generator. */
export const WEAPON_HIT: Record<string, SfxGen> = {
  glass: hitGlass,
  wood: hitWood,
  metal: hitMetal,
  pan: hitPan,
  blade: hitBlade,
  plastic: hitPlastic,
  ceramic: hitCeramic,
  guitar: hitGuitar,
};

export const SFX: Record<string, SfxDef> = {
  punch: { gen: punch, gain: 0.85, wet: 0.22, prio: 6, group: 'hit' },
  block: { gen: block, gain: 0.8, wet: 0.18, prio: 5, group: 'hit' },
  parry: { gen: parry, gain: 0.8, wet: 0.3, prio: 6, group: 'hit' },
  hit_glass: { gen: hitGlass, gain: 0.72, wet: 0.25, prio: 6, group: 'hit' },
  hit_wood: { gen: hitWood, gain: 0.62, wet: 0.25, prio: 6, group: 'hit' },
  hit_metal: { gen: hitMetal, gain: 0.56, wet: 0.3, prio: 6, group: 'hit' },
  hit_pan: { gen: hitPan, gain: 0.6, wet: 0.3, prio: 7, group: 'hit' },
  hit_blade: { gen: hitBlade, gain: 1.05, wet: 0.2, prio: 6, group: 'hit' },
  hit_plastic: { gen: hitPlastic, gain: 0.75, wet: 0.2, prio: 5, group: 'hit' },
  hit_ceramic: { gen: hitCeramic, gain: 0.68, wet: 0.25, prio: 5, group: 'hit' },
  hit_guitar: { gen: hitGuitar, gain: 0.58, wet: 0.3, prio: 7, group: 'hit' },
  gore_carve: { gen: goreCarve, gain: 0.85, wet: 0.15, prio: 4, group: 'gore' },
  gore_sever: { gen: goreSever, gain: 0.95, wet: 0.2, prio: 7, group: 'gore' },
  gore_head: { gen: goreHead, gain: 0.65, wet: 0.25, prio: 8, group: 'gore' },
  impact: { gen: impact, gain: 0.85, wet: 0.25, prio: 3, group: 'impact' },
  break: { gen: breakGen, gain: 0.85, wet: 0.3, prio: 5, group: 'break' },
  footstep: { gen: footstep, gain: 0.8, wet: 0.12, prio: 1, group: 'step' },
  whoosh: { gen: whoosh, gain: 0.8, wet: 0.1, prio: 2, group: 'whoosh' },
  body_fall: { gen: bodyFall, gain: 0.72, wet: 0.22, prio: 3, group: 'fall' },
  drip: { gen: drip, gain: 0.35, wet: 0.2, prio: 0, group: 'drip' },
  kill_sting: { gen: killSting, gain: 0.45, wet: 0.35, prio: 9, group: 'sting' },
  player_hurt: { gen: playerHurt, gain: 0.7, wet: 0, prio: 8, group: 'sting' },
  player_death: { gen: playerDeath, gain: 0.75, wet: 0.4, prio: 9, group: 'sting' },
  land: { gen: land, gain: 0.7, wet: 0.12, prio: 3 },
  jump: { gen: cloth, gain: 0.5, wet: 0.05, prio: 2 },
  dodge: { gen: (ac, out, t, p) => (cloth(ac, out, t, p), whoosh(ac, out, t, { ...p, strength: 0.6 })), gain: 0.6, wet: 0.05, prio: 2 },
  throw: { gen: (ac, out, t, p) => whoosh(ac, out, t, { ...p, strength: 1.1 }), gain: 0.8, wet: 0.08, prio: 3 },
  pickup: { gen: (ac, out, t, p) => (cloth(ac, out, t, { ...p, strength: 0.5 }), impact(ac, out, t + 0.03, { ...p, strength: 0.15 })), gain: 0.6, wet: 0.08, prio: 2 },
  grab: { gen: grab, gain: 0.7, wet: 0.08, prio: 4 },
  rage: { gen: rage, gain: 0.7, wet: 0.35, prio: 9, group: 'sting' },
  heartbeat: { gen: heartbeat, gain: 0.6, wet: 0, prio: 5 },
  door_slam: { gen: doorSlam, gain: 0.68, wet: 0.35, prio: 5 },
  door_creak: { gen: doorCreak, gain: 0.6, wet: 0.3, prio: 2 },
  drink: { gen: drink, gain: 0.6, wet: 0.1, prio: 4 },
  tap: { gen: tap, gain: 0.45, wet: 0.2, prio: 2 },
  register: { gen: register, gain: 0.7, wet: 0.3, prio: 4 },
  bell: { gen: bell, gain: 0.7, wet: 0.45, prio: 7 },
  coin: { gen: coin, gain: 0.6, wet: 0.25, prio: 3 },
  flush: { gen: flush, gain: 0.5, wet: 0.3, prio: 2 },
  phone: { gen: phone, gain: 0.6, wet: 0.3, prio: 3 },
  arcade: { gen: arcade, gain: 0.5, wet: 0.15, prio: 2 },
  dart: { gen: dart, gain: 0.7, wet: 0.2, prio: 3 },
  glass_clink: { gen: glassClink, gain: 0.6, wet: 0.35, prio: 1 },
  ui_click: { gen: uiBlip(1200, 900, 0.03, 0.18), gain: 0.6, wet: 0, prio: 9, group: 'ui' },
  ui_hover: { gen: uiBlip(1800, 1600, 0.02, 0.08, 'sine'), gain: 0.5, wet: 0, prio: 9, group: 'ui' },
  ui_back: { gen: uiBlip(700, 420, 0.09, 0.18), gain: 0.6, wet: 0, prio: 9, group: 'ui' },
  ui_confirm: { gen: uiConfirm, gain: 0.6, wet: 0, prio: 9, group: 'ui' },
};

// convenience aliases: impact_<material>, break_<material>, footstep_<material>
for (const m of MATERIALS) {
  SFX['impact_' + m] = { ...SFX.impact, gen: (ac, out, t, p) => impact(ac, out, t, { ...p, material: m }) };
  SFX['break_' + m] = { ...SFX.break, gen: (ac, out, t, p) => breakGen(ac, out, t, { ...p, material: m }) };
  SFX['footstep_' + m] = { ...SFX.footstep, gen: (ac, out, t, p) => footstep(ac, out, t, { ...p, material: m }) };
}

/** Concurrent voice cap per group. */
export const GROUP_CAP: Record<string, number> = {
  hit: 10,
  gore: 4,
  impact: 12,
  break: 4,
  step: 8,
  whoosh: 6,
  fall: 6,
  drip: 2,
  sting: 3,
  ui: 4,
};
