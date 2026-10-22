// Explosion family. A real detonation heard nearby is a sharp shock front, a
// sub-bass pressure punch, a turbulent fireball roar whose brightness collapses
// within a fraction of a second, crackle, soil and fragments raining down, and
// the terrain answering with rolling echoes. Saturation mimics how overloaded
// real recordings (and ears) render such peaks.
import {
  addEchoes,
  addFriedlander,
  addModes,
  addNWave,
  addTone,
  echoTaps,
  finish,
  samples,
} from '../dsp.js';
import {
  addCrackle,
  addDebris,
  addGas,
  addRoar,
  addRollingRumble,
  addSandRain,
  makeFar,
  metalModes,
} from './common.js';

export const EXPLOSIONS = {
  explosion_small: {
    len: 1.4, crack: 0.8, crackMs: 0.5, T: 2.5, b: 1.6,
    sub: 0.4, subF0: 120, subF1: 55, subGlide: 0.02, subTau: 0.07,
    body: 0.75, bodyTau: 0.09, lp0: 9000, lp1: 700, lpTau: 0.05,
    crackle: 0.18, crackleRate: 120, crackleDur: 0.15,
    debris: 0.13, debrisStart: 0.22, debrisDur: 0.8, debrisRate: 60, debrisKind: 'dirt',
    rumble: 0.12, rumbleTau: 0.3, echoes: 3, echoMax: 0.9, drive: 2.6,
  },
  explosion_medium: {
    len: 2.0, crack: 0.8, crackMs: 0.8, T: 4.5, b: 1.5,
    sub: 0.6, subF0: 95, subF1: 42, subGlide: 0.035, subTau: 0.15,
    body: 0.8, bodyTau: 0.17, lp0: 8000, lp1: 450, lpTau: 0.08,
    crackle: 0.22, crackleRate: 90, crackleDur: 0.3,
    debris: 0.12, debrisStart: 0.35, debrisDur: 1.3, debrisRate: 70, debrisKind: 'dirt',
    rumble: 0.2, rumbleTau: 0.45, echoes: 4, echoMax: 1.4, drive: 3.0,
  },
  explosion_large: {
    len: 3.0, crack: 0.75, crackMs: 1.2, T: 8, b: 1.4,
    sub: 0.9, subF0: 75, subF1: 32, subGlide: 0.05, subTau: 0.35,
    body: 0.85, bodyTau: 0.3, lp0: 7000, lp1: 320, lpTau: 0.12,
    crackle: 0.22, crackleRate: 70, crackleDur: 0.5,
    debris: 0.12, debrisStart: 0.5, debrisDur: 2.0, debrisRate: 80, debrisKind: 'dirt',
    rumble: 0.28, rumbleTau: 0.7, echoes: 5, echoMax: 2.0, drive: 3.4,
  },
  explosion_huge: {
    len: 4.6, crack: 0.7, crackMs: 2, T: 15, b: 1.3,
    sub: 1.0, subF0: 55, subF1: 22, subGlide: 0.08, subTau: 0.7,
    body: 0.9, bodyTau: 0.55, lp0: 5500, lp1: 220, lpTau: 0.2,
    crackle: 0.2, crackleRate: 60, crackleDur: 0.8,
    debris: 0.13, debrisStart: 0.6, debrisDur: 3.2, debrisRate: 110, debrisKind: 'dirt', sand: 0.06,
    rumble: 0.36, rumbleTau: 1.0, echoes: 6, echoMax: 3.0, drive: 3.8,
  },
  explosion_air: {
    len: 3.6, crack: 0.9, crackMs: 1.2, T: 7, b: 1.6,
    sub: 0.55, subF0: 80, subF1: 38, subGlide: 0.05, subTau: 0.25,
    body: 0.8, bodyTau: 0.45, lp0: 6000, lp1: 500, lpTau: 0.25, swell: 0.6,
    crackle: 0.32, crackleRate: 80, crackleDur: 1.2,
    debris: 0.07, debrisStart: 0.8, debrisDur: 2.4, debrisRate: 18, debrisKind: 'metal',
    rumble: 0.26, rumbleTau: 0.9, echoes: 7, echoMax: 2.8, drive: 3.0,
  },
};

export const EXPLOSION_FAR = {
  explosion_small: { lp: 900, hp: 60, echoes: 4, echoMax: 1.4, echoSrc: 0.2, extra: 0.6 },
  explosion_medium: { lp: 750, hp: 45, echoes: 5, echoMax: 1.8, echoSrc: 0.3, extra: 0.8 },
  explosion_large: { lp: 600, hp: 35, echoes: 6, echoMax: 2.4, echoSrc: 0.4, extra: 0.8 },
  explosion_huge: { lp: 420, hp: 25, echoes: 6, echoMax: 3.0, echoSrc: 0.6, extra: 0.6 },
  explosion_air: { lp: 700, hp: 40, echoes: 6, echoMax: 3.0, echoSrc: 0.4, extra: 0.6 },
  vehicle_destroyed: { lp: 650, hp: 40, echoes: 5, echoMax: 2.4, echoSrc: 0.4, extra: 0.6 },
};

export function farExplosion(name) {
  const p = EXPLOSION_FAR[name];
  return (near, rng, sr) => makeFar(near, rng, sr, p);
}

function blastCore(out, t, p, rng, sr) {
  const crack = p.crack * rng.range(0.85, 1.05);
  addNWave(out, t, crack, rng.jit(p.crackMs, 0.15) / 1000, sr);
  addGas(out, t, crack * 0.35, { attack: 0.0001, tau: 0.003, length: 0.025, hp: 2500 }, rng, sr);
  const T = rng.jit(p.T, 0.12) / 1000;
  addFriedlander(out, t + 0.0004, 1, T, p.b, sr);
  addTone(out, t, p.sub * rng.range(0.9, 1.05), rng.jit(p.subF0, 0.08), rng.jit(p.subF1, 0.08),
    p.subGlide, rng.jit(p.subTau, 0.12), sr, 0.0015);
  addRoar(out, t, p.body, {
    tau: rng.jit(p.bodyTau, 0.12), attack: 0.0015, lp0: rng.jit(p.lp0, 0.1), lp1: rng.jit(p.lp1, 0.1),
    lpTau: p.lpTau, boil: 28, boilDepth: 0.4, swell: p.swell ?? 0, swellTau: 0.12,
  }, rng, sr);
}

export function explosion(p, rng, sr) {
  const out = new Float32Array(samples(sr, p.len));
  const t = 0.001;
  blastCore(out, t, p, rng, sr);
  addCrackle(out, t + 0.004, p.crackleDur, p.crackleRate, p.crackle, rng, sr, { hp: 900 });
  addRollingRumble(out, t + 0.04, p.rumble, rng.jit(p.rumbleTau, 0.12), rng, sr, { lp: 220, rate: 3.5, attack: 0.12 });
  addEchoes(out, Math.min(0.5, p.len * 0.12), echoTaps(rng, p.echoes, 0.2, p.echoMax, 0.34, 1500, 600), sr);
  addDebris(out, t + rng.jit(p.debrisStart, 0.15), p.debrisDur, p.debrisRate, p.debris, p.debrisKind, rng, sr);
  if (p.sand) addSandRain(out, t + p.debrisStart, p.debrisDur, p.sand, rng, sr);
  return finish(out, sr, { drive: p.drive, fade: 0.3 });
}

// Armoured vehicle brewing up: heavy blast, the hull ringing like a bell,
// secondary pops of ammunition and fuel, a fire whoosh and metal fragments.
export function vehicleDestroyed(rng, sr) {
  const p = { ...EXPLOSIONS.explosion_large, len: 3.8, body: 0.8, debrisKind: 'metal', debrisRate: 40 };
  const out = new Float32Array(samples(sr, p.len));
  const t = 0.001;
  blastCore(out, t, p, rng, sr);
  const hull = [];
  const f0 = rng.range(90, 140);
  for (const [ratio, d, a] of [[1, 1.1, 1], [1.53, 0.8, 0.7], [2.41, 0.55, 0.55], [3.37, 0.35, 0.4], [4.9, 0.2, 0.3]]) {
    hull.push({ f: f0 * ratio * rng.jit(1, 0.03), d: d * rng.jit(1, 0.15), a });
  }
  addModes(out, t + 0.002, 0.28, hull, sr);
  addRoar(out, t + 0.25, 0.32, {
    tau: 0.9, attack: 0.25, lp0: 2500, lp1: 600, lpTau: 0.8, boil: 18, boilDepth: 0.5, brownMix: 0.5,
  }, rng, sr);
  const pops = 3 + rng.int(4);
  for (let i = 0; i < pops; i++) {
    const at = t + rng.range(0.45, 3.2);
    const a = rng.range(0.12, 0.35);
    addFriedlander(out, at, a, rng.range(0.6, 2.5) / 1000, 1.8, sr);
    addGas(out, at, a * 0.8, { tau: rng.range(0.02, 0.06), f: rng.range(500, 1400), q: 0.7 }, rng, sr);
  }
  addCrackle(out, t + 0.3, 3.5, 40, 0.12, rng, sr, { hp: 1100, fall: 0.6 });
  addRollingRumble(out, t + 0.04, p.rumble, 1.0, rng, sr, { lp: 220, rate: 3.5 });
  addEchoes(out, 0.45, echoTaps(rng, 5, 0.2, 2.5, 0.32, 1500, 600), sr);
  addDebris(out, t + 0.4, 2.4, p.debrisRate, 0.12, 'metal', rng, sr);
  return finish(out, sr, { drive: 3.2, fade: 0.3 });
}

// Ammunition cooking off: a burning chain of rounds and charges popping,
// cracking and occasionally detonating, with a propellant fire roaring under it.
export function ammoCookoff(rng, sr) {
  const len = 4.6;
  const out = new Float32Array(samples(sr, len));
  addRoar(out, 0.0, 0.25, {
    length: len, tau: 1.5, attack: 0.3, lp0: 1800, lp1: 900, lpTau: 2, boil: 9, boilDepth: 0.6, brownMix: 0.6,
  }, rng, sr);
  let t = 0.05;
  while (t < len - 0.6) {
    const fade = Math.pow(1 - (0.8 * t) / len, 1.5);
    const big = rng.chance(0.07 * fade);
    const mid = !big && rng.chance(0.25);
    const a = (big ? rng.range(0.7, 1) : mid ? rng.range(0.3, 0.55) : rng.range(0.08, 0.28)) * fade;
    const T = big ? rng.range(4, 7) : mid ? rng.range(1.5, 3) : rng.range(0.3, 0.9);
    addFriedlander(out, t, a, T / 1000, 1.7, sr);
    addGas(out, t, a * 0.7, {
      tau: big ? 0.12 : mid ? 0.04 : 0.008, f: big ? 500 : mid ? 900 : 1800, q: 0.7, lp: big ? 3000 : 7000,
    }, rng, sr);
    if (big) addTone(out, t, a * 0.6, 90, 45, 0.03, 0.15, sr);
    // Rounds cook off in clusters: short gaps inside a cluster, longer between.
    t += (rng.chance(0.7) ? rng.range(0.02, 0.12) : rng.range(0.15, 0.5)) / fade;
  }
  addCrackle(out, 0.05, len - 0.4, 70, 0.18, rng, sr, { hp: 1500, fall: 0.9 });
  for (let i = 0; i < 3; i++) {
    const at = rng.range(0.4, len - 1.5);
    addGas(out, at, 0.18, { attack: 0.08, tau: 0.35, f: rng.range(1200, 2400), q: 1.5 }, rng, sr);
  }
  addEchoes(out, 1.2, echoTaps(rng, 4, 0.2, 1.4, 0.25, 1500, 700), sr);
  return finish(out, sr, { drive: 2.6, fade: 0.4 });
}

// Building collapse: structural cracks, a swelling rumble, tons of masonry
// crashing down, some glass, then settling dust and trickling debris.
export function buildingCollapse(rng, sr) {
  const len = 5.5;
  const out = new Float32Array(samples(sr, len));
  for (let i = 0; i < 4 + rng.int(3); i++) {
    const at = rng.range(0.0, 0.7);
    const a = rng.range(0.35, 0.7);
    addNWave(out, at, a * 0.5, rng.range(0.4, 1.2) / 1000, sr);
    addModes(out, at, a * 0.4, [
      { f: rng.range(400, 900), d: 0.03, a: 1 },
      { f: rng.range(1200, 2200), d: 0.015, a: 0.6 },
    ], sr);
    addGas(out, at, a * 0.5, { tau: 0.02, f: rng.range(800, 2000), q: 0.8 }, rng, sr);
  }
  addRoar(out, 0.5, 0.75, {
    length: 4.9, tau: 1.4, attack: 0.7, lp0: 1400, lp1: 260, lpTau: 1.8, boil: 7, boilDepth: 0.55, brownMix: 0.8,
  }, rng, sr);
  addRollingRumble(out, 0.6, 0.6, 1.5, rng, sr, { lp: 150, rate: 5, attack: 0.6 });
  addDebris(out, 0.6, 4.0, 70, 0.55, 'masonry', rng, sr);
  addDebris(out, 1.2, 3.4, 25, 0.3, 'masonry', rng, sr);
  for (let i = 0; i < 6; i++) {
    addModes(out, rng.range(0.8, 2.6), rng.range(0.04, 0.1), metalModes(rng.range(2600, 4800), 0.05, rng, 3), sr);
  }
  addSandRain(out, 2.0, 3.4, 0.08, rng, sr);
  addEchoes(out, 2.5, echoTaps(rng, 3, 0.15, 0.6, 0.2, 1200, 600), sr);
  return finish(out, sr, { drive: 2.4, fade: 0.5 });
}

// Loose debris clattering down (rubble, fragments, dirt clods).
export function debrisFall(rng, sr) {
  const len = 1.4;
  const out = new Float32Array(samples(sr, len));
  addDebris(out, 0.0, 1.25, 45, 0.8, rng.pick(['dirt', 'masonry', 'metal']), rng, sr);
  addDebris(out, 0.05, 1.2, 20, 0.5, 'dirt', rng, sr);
  return finish(out, sr, { drive: 1.5, fade: 0.15 });
}

// Fuel igniting: a breathy "whoomph" that blooms and settles into crackling flame.
export function fireBurst(rng, sr) {
  const len = 2.0;
  const out = new Float32Array(samples(sr, len));
  addRoar(out, 0.0, 1.0, {
    tau: 0.45, attack: 0.09, lp0: 500, lp1: 1600, lpTau: 0.12, boil: 14, boilDepth: 0.5, brownMix: 0.65, swell: 0.4,
  }, rng, sr);
  addTone(out, 0.02, 0.45, 70, 45, 0.08, 0.18, sr, 0.04);
  addCrackle(out, 0.1, 1.8, 50, 0.25, rng, sr, { hp: 1300 });
  return finish(out, sr, { drive: 1.8, fade: 0.3 });
}
