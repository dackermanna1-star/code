// Launch recipes: rocket and missile motors (bang, ignition, receding roar with
// doppler and air absorption), the 40 mm "bloop", flares and smoke grenades.
import {
  addFriedlander,
  addModes,
  addTone,
  brown,
  finish,
  mixAt,
  normalize,
  samples,
  smoothRandom,
  svf,
  white,
} from '../dsp.js';
import { addCrackle, addGas, addScatterTail } from './common.js';

const C = 343;

export const LAUNCHES = {
  rpg_launch: {
    len: 1.6, bang: 1.0, bangT: 2.0, bangBody: 0.6, ignite: 0.11, igniteBang: 0.45,
    motor: 0.8, burn: 0.9, speed: 180, r0: 6, lp0: 7000, roarF: 700, whistle: 0.15, crackle: 0.25, drive: 2.6,
  },
  atgm_launch: {
    len: 2.4, bang: 0.55, bangT: 1.4, bangBody: 0.4, ignite: 0.22, igniteBang: 0.3,
    motor: 0.75, burn: 1.9, speed: 150, r0: 5, lp0: 9000, roarF: 1100, whistle: 0.1, crackle: 0.12, drive: 2.2,
  },
  missile_launch: {
    len: 2.6, bang: 0.4, bangT: 1.5, bangBody: 0.5, ignite: 0, igniteBang: 0,
    motor: 1.0, burn: 2.3, speed: 320, r0: 6, lp0: 7500, roarF: 600, whistle: 0.12, crackle: 0.35, drive: 2.8,
  },
  sam_launch: {
    len: 3.0, bang: 0.6, bangT: 1.6, bangBody: 0.4, ignite: 0.3, igniteBang: 0.55,
    motor: 1.0, burn: 2.6, speed: 380, r0: 5, lp0: 8000, roarF: 650, whistle: 0.12, crackle: 0.35, drive: 2.8,
  },
  mlrs_launch: {
    len: 1.9, bang: 0.7, bangT: 3.5, bangBody: 0.7, ignite: 0, igniteBang: 0,
    motor: 1.0, burn: 1.4, speed: 260, r0: 8, lp0: 5500, roarF: 400, whistle: 0.05, crackle: 0.45, drive: 3.2,
  },
  rocket_pod: {
    len: 1.1, bang: 0.5, bangT: 1.2, bangBody: 0.4, ignite: 0, igniteBang: 0,
    motor: 0.9, burn: 0.7, speed: 450, r0: 5, lp0: 9000, roarF: 900, whistle: 0.15, crackle: 0.3, drive: 2.6,
  },
};

// Receding rocket motor: spherical spreading from a source accelerating away,
// doppler-lowered spectrum and air absorption, with exhaust flutter and crackle.
function addMotor(out, at, p, rng, sr) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, p.burn + 0.5));
  if (n <= 32) return;
  const w = white(n, rng.seed());
  const br = brown(n, rng.seed(), sr, 40);
  const flutter = smoothRandom(n, Math.round((n / sr) * 60), rng);
  const att = samples(sr, 0.025);
  const burnEnd = samples(sr, p.burn);
  const off = Math.exp(-1 / (0.09 * sr));
  let tailEnv = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const r = p.r0 + p.speed * t * Math.min(1, t / 0.3 + 0.3);
    let env = p.r0 / r;
    if (i < att) env *= i / att;
    if (i > burnEnd) {
      env *= tailEnv;
      tailEnv *= off;
    }
    w[i] = (0.55 * w[i] + 0.45 * br[i]) * env * (0.75 + 0.25 * flutter[i]);
  }
  const doppler = (t) => 1 / (1 + (p.speed / C) * Math.min(1, t / 0.25));
  const absorb = (t) => 1 / (1 + (p.r0 + p.speed * t) / 900);
  const lp = w.slice();
  svf(lp, 'lp', (t) => p.lp0 * doppler(t) * absorb(t), 0.7, sr);
  const band = w.slice();
  svf(band, 'bp', (t) => p.roarF * doppler(t), 1.1, sr);
  const tone = w;
  svf(tone, 'bp', (t) => 2600 * doppler(t), 9, sr);
  normalize(lp, 1);
  normalize(band, 1);
  normalize(tone, 1);
  mixAt(out, lp, at, p.motor, sr);
  mixAt(out, band, at, p.motor * 0.6, sr);
  mixAt(out, tone, at, p.motor * p.whistle, sr);
  addCrackle(out, at + 0.01, p.burn, 90, p.motor * p.crackle, rng, sr, { hp: 1500, fall: 1.5 });
}

function addBang(out, at, amp, T, body, rng, sr) {
  addFriedlander(out, at, amp, rng.jit(T, 0.1) / 1000, 1.8, sr);
  addGas(out, at, amp * body, { tau: rng.range(0.015, 0.03), f: rng.range(600, 1000), q: 0.7, lp: 5000 }, rng, sr);
  addTone(out, at, amp * 0.4, 160, 85, 0.008, 0.03, sr);
}

export function rocketLaunch(p, rng, sr) {
  const out = new Float32Array(samples(sr, p.len));
  const t = 0.001;
  if (p.bang > 0) addBang(out, t, p.bang, p.bangT, p.bangBody, rng, sr);
  const ig = t + p.ignite * rng.range(0.85, 1.15);
  if (p.igniteBang > 0) {
    addFriedlander(out, ig, p.igniteBang, rng.range(0.8, 1.4) / 1000, 2, sr);
    addGas(out, ig, p.igniteBang * 0.8, { tau: 0.02, hp: 1200 }, rng, sr);
  }
  addMotor(out, ig, p, rng, sr);
  addScatterTail(out, 0.01, 0.12, 0.25, 2200, rng, sr, 10);
  return finish(out, sr, { drive: p.drive, fade: 0.15 });
}

// 40 mm grenade launcher: a soft, hollow "bloop".
export function grenadeLaunch(rng, sr) {
  const out = new Float32Array(samples(sr, 0.45));
  addFriedlander(out, 0.001, 0.7, rng.range(2.2, 3.0) / 1000, 2.0, sr);
  addTone(out, 0.001, 0.9, rng.range(230, 270), rng.range(140, 170), 0.006, 0.025, sr, 0.001);
  addModes(out, 0.002, 0.25, [
    { f: rng.range(420, 520), d: 0.02, a: 1 },
    { f: rng.range(900, 1100), d: 0.01, a: 0.5 },
  ], sr);
  addGas(out, 0.001, 0.4, { tau: 0.012, f: 900, q: 0.8, lp: 3000 }, rng, sr);
  addScatterTail(out, 0.006, 0.08, 0.08, 2500, rng, sr, 20);
  return finish(out, sr, { drive: 1.8, fade: 0.05 });
}

// Countermeasure flares: rapid pops from the dispenser and the hiss of burning magnesium.
export function flareLaunch(rng, sr) {
  const out = new Float32Array(samples(sr, 1.6));
  const pops = 3 + rng.int(4);
  let t = 0.001;
  for (let i = 0; i < pops; i++) {
    addFriedlander(out, t, rng.range(0.6, 1), rng.range(0.6, 1.0) / 1000, 2.2, sr);
    addGas(out, t, 0.5, { tau: 0.006, hp: 1500 }, rng, sr);
    addGas(out, t + 0.01, 0.22, { attack: 0.03, tau: 0.3, f: rng.range(2500, 4500), q: 1.2 }, rng, sr);
    t += rng.range(0.07, 0.16);
  }
  addCrackle(out, 0.05, 1.2, 40, 0.15, rng, sr, { hp: 2000 });
  return finish(out, sr, { drive: 2.0, fade: 0.3 });
}

// Vehicle smoke dischargers: a quick salvo of dull pops, then a soft hiss.
export function smokeLaunch(rng, sr) {
  const out = new Float32Array(samples(sr, 0.9));
  const pops = 4 + rng.int(5);
  let t = 0.001;
  for (let i = 0; i < pops; i++) {
    const a = rng.range(0.6, 1);
    addFriedlander(out, t, a, rng.range(2.5, 3.5) / 1000, 1.9, sr);
    addTone(out, t, a * 0.7, 190, 110, 0.006, 0.03, sr);
    addGas(out, t, a * 0.35, { tau: 0.015, f: 700, q: 0.8 }, rng, sr);
    t += rng.range(0.03, 0.07);
  }
  addGas(out, t + 0.05, 0.12, { attack: 0.05, tau: 0.2, f: 3000, q: 0.7 }, rng, sr);
  addScatterTail(out, 0.01, 0.1, 0.15, 2000, rng, sr, 15);
  return finish(out, sr, { drive: 2.0, fade: 0.1 });
}
