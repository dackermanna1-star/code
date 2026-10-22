// Gunfire recipes: small arms, light cannons, tank/artillery guns, mortars and
// the rotary aircraft cannon. Each shot is built from the physical pieces of a
// real report: supersonic N-wave crack, Friedlander muzzle blast, turbulent gas
// noise, a low thump, ground reflection, near scatter and terrain echoes.
import {
  addEchoes,
  addFriedlander,
  addModes,
  addNWave,
  addTone,
  brown,
  echoTaps,
  fadeIn,
  finish,
  hp1,
  lp1,
  mixAt,
  normalize,
  samples,
  softClip,
  white,
} from '../dsp.js';
import { addGas, addRoar, addRollingRumble, addScatterTail, makeFar, metalModes } from './common.js';

// Near-field parameters (a few metres beside the weapon). crackMs, gap, T and
// the *Tau fields with ms units are in milliseconds; len and tailTau in seconds.
export const GUNS = {
  rifle: {
    len: 0.45, crack: 0.8, crackMs: 0.22, gap: [0.3, 1.2], T: 0.5, b: 2.2,
    bright: 0.5, brightTau: 3.5, brightHp: 1800, body: 0.55, bodyF: 1600, bodyTau: 10, bodyLP: 7000,
    thump: 0.28, thumpF: 150, thumpTau: 15, tail: 0.09, tailTau: 0.09, echoes: 3, mech: 0.03, drive: 2.2,
  },
  rifle_ak: {
    len: 0.5, crack: 0.65, crackMs: 0.28, gap: [0.4, 1.4], T: 0.75, b: 2.0,
    bright: 0.36, brightTau: 4, brightHp: 1200, body: 0.7, bodyF: 950, bodyTau: 16, bodyLP: 4800,
    thump: 0.36, thumpF: 115, thumpTau: 17, tail: 0.1, tailTau: 0.1, echoes: 3, mech: 0.035, drive: 2.4,
  },
  lmg: {
    len: 0.45, crack: 0.8, crackMs: 0.23, gap: [0.3, 1.2], T: 0.6, b: 2.1,
    bright: 0.48, brightTau: 4, brightHp: 1600, body: 0.56, bodyF: 1450, bodyTau: 12, bodyLP: 6500,
    thump: 0.24, thumpF: 138, thumpTau: 12, tail: 0.1, tailTau: 0.1, echoes: 3, mech: 0.04, drive: 2.3,
  },
  gpmg: {
    len: 0.55, crack: 0.85, crackMs: 0.32, gap: [0.5, 1.6], T: 0.95, b: 2.0,
    bright: 0.4, brightTau: 5, brightHp: 1100, body: 0.72, bodyF: 850, bodyTau: 20, bodyLP: 4500,
    thump: 0.42, thumpF: 100, thumpTau: 21, tail: 0.12, tailTau: 0.13, echoes: 3, mech: 0.04, drive: 2.6,
  },
  sniper: {
    len: 1.1, crack: 1.0, crackMs: 0.45, gap: [0.6, 2.0], T: 1.25, b: 1.8,
    bright: 0.65, brightTau: 7, brightHp: 1200, body: 0.75, bodyF: 850, bodyTau: 28, bodyLP: 6000,
    thump: 0.36, thumpF: 82, thumpTau: 24, tail: 0.16, tailTau: 0.32, echoes: 5, echoMax: 0.24, drive: 2.8,
  },
  pistol: {
    len: 0.32, crack: 0.15, crackMs: 0.14, gap: [0.2, 0.6], T: 0.42, b: 2.4,
    bright: 0.42, brightTau: 3, brightHp: 2000, body: 0.5, bodyF: 2000, bodyTau: 8, bodyLP: 8000,
    thump: 0.22, thumpF: 175, thumpTau: 11, tail: 0.07, tailTau: 0.07, echoes: 3, mech: 0.025, drive: 2.0,
  },
  smg: {
    len: 0.34, crack: 0.18, crackMs: 0.15, gap: [0.2, 0.6], T: 0.46, b: 2.3,
    bright: 0.45, brightTau: 3.2, brightHp: 1900, body: 0.55, bodyF: 1800, bodyTau: 9, bodyLP: 7500,
    thump: 0.26, thumpF: 165, thumpTau: 12, tail: 0.08, tailTau: 0.08, echoes: 3, mech: 0.03, drive: 2.1,
  },
  hmg: {
    len: 0.75, crack: 1.0, crackMs: 0.6, gap: [0.8, 2.2], T: 1.7, b: 1.8,
    bright: 0.45, brightTau: 6, brightHp: 1000, body: 0.8, bodyF: 700, bodyTau: 30, bodyLP: 4200,
    thump: 0.55, thumpF: 72, thumpTau: 30, tail: 0.14, tailTau: 0.2, echoes: 4, mech: 0.05, drive: 3.0,
  },
  autocannon: {
    len: 0.85, crack: 0.7, crackMs: 0.9, gap: [1, 3], T: 2.4, b: 1.9,
    bright: 0.35, brightTau: 6, brightHp: 900, body: 0.8, bodyF: 560, bodyTau: 36, bodyLP: 3400,
    thump: 0.7, thumpF: 60, thumpTau: 42, tail: 0.15, tailTau: 0.24, echoes: 4, echoMax: 0.12,
    clank: 0.07, drive: 3.0,
  },
  aa_gun: {
    len: 0.8, crack: 1.0, crackMs: 0.75, gap: [0.8, 2.5], T: 1.8, b: 2.0,
    bright: 0.5, brightTau: 5, brightHp: 1300, body: 0.8, bodyF: 780, bodyTau: 26, bodyLP: 4800,
    thump: 0.5, thumpF: 76, thumpTau: 30, tail: 0.14, tailTau: 0.22, echoes: 4, echoMax: 0.12, drive: 3.0,
  },
  heli_gun: {
    len: 0.85, crack: 0.5, crackMs: 0.9, gap: [1, 3], T: 2.2, b: 1.9,
    bright: 0.35, brightTau: 6, brightHp: 900, body: 0.8, bodyF: 440, bodyTau: 40, bodyLP: 2800,
    thump: 0.65, thumpF: 64, thumpTau: 40, tail: 0.15, tailTau: 0.25, echoes: 4, echoMax: 0.12, drive: 3.0,
    hollow: { amp: 0.22, modes: [{ f: 330, d: 0.05, a: 1 }, { f: 520, d: 0.035, a: 0.6 }] },
  },
};

// Distance layer: air absorption + ground effect cut-offs and echo spread.
export const GUN_FAR = {
  rifle: { lp: 2000, hp: 220 },
  rifle_ak: { lp: 1700, hp: 180 },
  lmg: { lp: 1900, hp: 200 },
  gpmg: { lp: 1600, hp: 160 },
  sniper: { lp: 1700, hp: 150, echoMax: 1.1, extra: 0.9 },
  pistol: { lp: 2200, hp: 250 },
  smg: { lp: 2100, hp: 240 },
  hmg: { lp: 1300, hp: 110, echoMax: 0.9, extra: 0.8 },
  autocannon: { lp: 1100, hp: 80, echoMax: 1.0, extra: 0.9 },
  aa_gun: { lp: 1400, hp: 100, echoMax: 1.0, extra: 0.9 },
  heli_gun: { lp: 1000, hp: 80, echoMax: 1.0, extra: 0.9 },
  tank_cannon: { lp: 650, hp: 35, echoes: 6, echoMax: 2.4, extra: 1.0, echoSrc: 0.35 },
  howitzer: { lp: 480, hp: 28, echoes: 6, echoMax: 2.6, extra: 1.0, echoSrc: 0.4 },
  mortar: { lp: 750, hp: 60, echoes: 5, echoMax: 1.6, extra: 0.8, echoSrc: 0.2 },
};

function addMech(out, at, amp, rng, sr) {
  addModes(out, at, amp, [
    { f: rng.range(2200, 2800), d: 0.006, a: 1 },
    { f: rng.range(3500, 4200), d: 0.004, a: 0.6 },
    { f: rng.range(5000, 6200), d: 0.003, a: 0.4 },
  ], sr);
  addGas(out, at, amp * 0.8, { tau: 0.0012, hp: 2500 }, rng, sr);
  const back = at + rng.range(0.025, 0.045);
  addModes(out, back, amp * 0.6, [
    { f: rng.range(1800, 2400), d: 0.005, a: 1 },
    { f: rng.range(3800, 4600), d: 0.003, a: 0.5 },
  ], sr);
}

export function gunshot(p, rng, sr) {
  const out = new Float32Array(samples(sr, p.len));
  const ground = rng.range(0.7, 2.2) / 1000;
  const gg = rng.range(0.4, 0.65);
  let t = 0.001;
  if (p.crack > 0) {
    const dur = rng.jit(p.crackMs, 0.15) / 1000;
    const a = p.crack * rng.range(0.85, 1.1);
    addNWave(out, t, a, dur, sr);
    addNWave(out, t + ground * 0.8, a * gg * 0.6, dur * 1.15, sr);
    addGas(out, t, a * 0.25, { attack: 0.00005, tau: 0.0022, length: 0.012, hp: 3200 }, rng, sr);
    t += rng.range(p.gap[0], p.gap[1]) / 1000;
  }
  const T = rng.jit(p.T, 0.12) / 1000;
  addFriedlander(out, t, 1, T, p.b, sr);
  addFriedlander(out, t + ground, gg, T * 1.15, p.b, sr);
  addGas(out, t, p.bright * rng.range(0.8, 1.1), {
    attack: 0.0001, tau: rng.jit(p.brightTau, 0.2) / 1000, hp: p.brightHp, lp: 9500,
  }, rng, sr);
  addGas(out, t + 0.0002, p.body * rng.range(0.85, 1.1), {
    attack: 0.0003, tau: rng.jit(p.bodyTau, 0.15) / 1000, f: rng.jit(p.bodyF, 0.12), q: 0.8, lp: p.bodyLP,
  }, rng, sr);
  const tf = rng.jit(p.thumpF, 0.08);
  addTone(out, t, p.thump * rng.range(0.85, 1.1), tf * 1.8, tf, 0.004, rng.jit(p.thumpTau, 0.12) / 1000, sr, 0.0004);
  if (p.hollow) {
    const modes = p.hollow.modes.map((m) => ({ f: rng.jit(m.f, 0.06), d: m.d, a: m.a }));
    addModes(out, t + 0.001, p.hollow.amp, modes, sr);
  }
  addEchoes(out, 0.03, echoTaps(rng, p.echoes, 0.012, p.echoMax ?? 0.09, 0.2, 4200, 2600), sr);
  addScatterTail(out, t + 0.004, p.tail, p.tailTau, 3200, rng, sr, 28);
  if (p.mech) addMech(out, t + rng.range(0.035, 0.06), p.mech, rng, sr);
  if (p.clank) addModes(out, t + rng.range(0.05, 0.09), p.clank, metalModes(rng.range(380, 700), 0.06, rng), sr);
  return finish(out, sr, { drive: p.drive, fade: 0.03 });
}

// Tank guns, howitzers and mortars: a long Friedlander blast, sub-bass punch,
// a fireball body whose brightness collapses, and rolling terrain echoes.
export const CANNONS = {
  tank_cannon: {
    len: 3.2, crack: 1.0, crackMs: 1.5, T: 7.5, b: 1.5,
    sub: 0.95, subF0: 80, subF1: 33, subGlide: 0.05, subTau: 0.3,
    body: 0.85, bodyTau: 0.15, lp0: 9000, lp1: 420, lpTau: 0.06,
    roar: 0.55, roarF: 420, roarTau: 0.35, ring: 0.1,
    rumble: 0.32, rumbleTau: 0.8, echoes: 6, echoMax: 2.2, drive: 3.4,
  },
  howitzer: {
    len: 3.4, crack: 0.4, crackMs: 2.2, T: 11, b: 1.4,
    sub: 1.0, subF0: 62, subF1: 26, subGlide: 0.07, subTau: 0.42,
    body: 0.85, bodyTau: 0.22, lp0: 5000, lp1: 260, lpTau: 0.09,
    roar: 0.45, roarF: 300, roarTau: 0.45,
    rumble: 0.38, rumbleTau: 0.9, echoes: 7, echoMax: 2.6, drive: 3.2,
  },
  mortar: {
    len: 1.5, crack: 0, T: 3.2, b: 1.8,
    sub: 0.55, subF0: 130, subF1: 66, subGlide: 0.01, subTau: 0.08,
    body: 0.6, bodyTau: 0.06, lp0: 6000, lp1: 700, lpTau: 0.03,
    roar: 0.25, roarF: 900, roarTau: 0.08,
    tube: { amp: 0.45, modes: [{ f: 66, d: 0.09, a: 1 }, { f: 198, d: 0.05, a: 0.55 }, { f: 330, d: 0.035, a: 0.35 }] },
    whoosh: 0.2, rumble: 0.18, rumbleTau: 0.4, echoes: 4, echoMax: 1.1, drive: 2.6,
  },
};

export function cannon(p, rng, sr) {
  const out = new Float32Array(samples(sr, p.len));
  let t = 0.001;
  if (p.crack > 0) {
    const a = p.crack * rng.range(0.9, 1.05);
    addNWave(out, t, a, rng.jit(p.crackMs, 0.1) / 1000, sr);
    addGas(out, t, a * 0.3, { attack: 0.0001, tau: 0.004, length: 0.03, hp: 2500 }, rng, sr);
    t += rng.range(0.6, 2.2) / 1000;
  }
  const T = rng.jit(p.T, 0.1) / 1000;
  addFriedlander(out, t, 1, T, p.b, sr);
  addFriedlander(out, t + rng.range(0.003, 0.007), 0.45, T * 1.25, p.b, sr);
  addTone(out, t, p.sub, rng.jit(p.subF0, 0.08), rng.jit(p.subF1, 0.08), p.subGlide, rng.jit(p.subTau, 0.1), sr, 0.002);
  addRoar(out, t, p.body, {
    tau: rng.jit(p.bodyTau, 0.1), attack: 0.0015, lp0: p.lp0, lp1: p.lp1, lpTau: p.lpTau, boil: 40, boilDepth: 0.3,
  }, rng, sr);
  if (p.roar) {
    addGas(out, t + 0.005, p.roar, { attack: 0.01, tau: rng.jit(p.roarTau, 0.1), f: rng.jit(p.roarF, 0.1), q: 0.6, lp: 2000 }, rng, sr);
  }
  if (p.tube) {
    const modes = p.tube.modes.map((m) => ({ f: rng.jit(m.f, 0.05), d: m.d, a: m.a }));
    addModes(out, t + 0.0015, p.tube.amp, modes, sr);
  }
  if (p.whoosh) addGas(out, t + 0.012, p.whoosh, { attack: 0.012, tau: 0.05, f: rng.jit(1600, 0.15), q: 1.2 }, rng, sr);
  if (p.ring) {
    addModes(out, t + 0.002, p.ring, [
      { f: rng.jit(185, 0.1), d: 0.2, a: 1 },
      { f: rng.jit(420, 0.1), d: 0.12, a: 0.7 },
      { f: rng.jit(770, 0.1), d: 0.08, a: 0.5 },
    ], sr);
  }
  addRollingRumble(out, t + 0.03, p.rumble, rng.jit(p.rumbleTau, 0.1), rng, sr, { lp: 260, rate: 4, attack: 0.1 });
  addEchoes(out, 0.35, echoTaps(rng, p.echoes, 0.22, p.echoMax, 0.36, 1800, 700), sr);
  return finish(out, sr, { drive: p.drive, fade: 0.25 });
}

export function farLayer(name) {
  const p = GUN_FAR[name];
  return (near, rng, sr) => makeFar(near, rng, sr, p);
}

// Rotary aircraft cannon. Rounds at 65-100 Hz merge into a ripping tone; the
// buffer holds a spin-up and a seamless loop region so any burst length works.
export const JET_GUNS = [
  { rate: 65, T: 1.9, crack: 0.5, bodyF: 700, thumpF: 95, drive: 3.6 },
  { rate: 98, T: 1.3, crack: 0.6, bodyF: 950, thumpF: 120, drive: 3.4 },
];

function addRound(out, at, amp, p, rng, sr) {
  addNWave(out, at, amp * p.crack, 0.0004, sr);
  addFriedlander(out, at + 0.0004, amp, rng.jit(p.T, 0.1) / 1000, 2, sr);
  addGas(out, at, amp * 0.6, { tau: 0.005, f: rng.jit(p.bodyF, 0.15), q: 0.7, lp: 5000 }, rng, sr);
  addTone(out, at, amp * 0.5, p.thumpF * 1.6, p.thumpF, 0.003, 0.01, sr);
}

function addGunRoar(out, from, to, amp, attack, rng, sr) {
  const n = to - from;
  const w = white(n, rng.seed());
  const b = brown(n, rng.seed(), sr, 40);
  const att = attack * sr;
  for (let i = 0; i < n; i++) {
    const a = i < att ? 0.25 + 0.75 * (i / att) : 1;
    w[i] = (0.4 * w[i] + 0.6 * b[i]) * a;
  }
  lp1(lp1(w, 1600, sr), 2200, sr);
  hp1(w, 60, sr);
  normalize(w, 1);
  mixAt(out, w, from / sr, amp, sr);
}

export function jetGun(p, rng, sr) {
  const attack = 0.22;
  const period = 1 / p.rate;
  const loopPeriods = Math.round(0.8 * p.rate);
  const xf = samples(sr, 0.04);
  const total = attack + 0.05 + (loopPeriods + 2) * period;
  const out = new Float32Array(samples(sr, total));
  let t = 0.002;
  let firstSteady = -1;
  while (t < total - 0.004) {
    const u = Math.min(1, t / attack);
    const rate = p.rate * (0.5 + 0.5 * u * u * (3 - 2 * u));
    addRound(out, t + rng.bi() * 0.0003, (0.55 + 0.45 * u) * rng.range(0.82, 1.12), p, rng, sr);
    if (u >= 1 && firstSteady < 0) firstSteady = t;
    t += 1 / rate;
  }
  addGunRoar(out, 0, out.length, 0.35, attack, rng, sr);
  normalize(out, 1);
  softClip(out, p.drive);
  hp1(out, 18, sr);
  normalize(out, 0.95);
  const ls = Math.round((firstSteady - 0.002) * sr);
  const le = ls + Math.round(loopPeriods * period * sr);
  // Crossfade the loop end towards the samples just before loopStart.
  for (let i = 0; i < xf; i++) {
    const w = i / xf;
    out[le - xf + i] = out[le - xf + i] * (1 - w) + out[ls - xf + i] * w;
  }
  return { ch: [out.slice(0, le)], loopStart: ls / sr, loopEnd: le / sr };
}

// Release of a burst: barrels spin down, the roar decays into the open sky.
export function jetGunTail(p, rng, sr) {
  const out = new Float32Array(samples(sr, 0.9));
  let t = 0;
  while (t < 0.17) {
    const u = t / 0.17;
    addRound(out, t, Math.pow(1 - u, 1.4) * rng.range(0.82, 1.12), p, rng, sr);
    t += 1 / (p.rate * (1 - 0.45 * u));
  }
  const n = samples(sr, 0.7);
  const roar = new Float32Array(out.length);
  addGunRoar(roar, 0, n, 1, 0.001, rng, sr);
  const d = Math.exp(-1 / (0.07 * sr));
  let e = 1;
  for (let i = samples(sr, 0.03); i < roar.length; i++) {
    roar[i] *= e;
    e *= d;
  }
  mixAt(out, roar, 0, 0.35, sr);
  addScatterTail(out, 0.02, 0.12, 0.25, 1800, rng, sr, 8);
  normalize(out, 1);
  softClip(out, p.drive);
  hp1(out, 18, sr);
  fadeIn(out, 0.012, sr);
  return finish(out, sr, { drive: 0, dc: 0, fade: 0.1 });
}
