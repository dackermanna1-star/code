// Incoming fire, impacts, flybys, foley and UI sounds.
import {
  TAU,
  addFriedlander,
  addModes,
  addNWave,
  addSweepSine,
  addTone,
  biquad,
  blepSaw,
  blepSquare,
  fadeOut,
  finish,
  hp1,
  lp1,
  mixNorm,
  normalize,
  samples,
  smoothRandom,
  svf,
  white,
} from '../dsp.js';
import { addCrackle, addDebris, addGas, addGrain, addScatterTail, metalModes } from './common.js';

const C = 343;

// Doppler pass: high pitch while approaching, falling quickly around the pass time.
const passSweep = (fHi, fLo, tp, width) => (t) => fLo + (fHi - fLo) / (1 + Math.exp((t - tp) / width));

// Noise that swells as a projectile approaches and decays after it passes, band-passed
// along a doppler sweep with optional roughness (tumbling, turbulence) and a whistle tone.
function addPassNoise(out, at, o, rng, sr) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, o.len));
  if (n <= 32) return;
  const x = white(n, rng.seed());
  const rough = o.rough ? smoothRandom(n, Math.round((n / sr) * o.rough * 2), rng) : null;
  const fall = Math.exp(-1 / (o.fall * sr));
  const ip = samples(sr, o.tp);
  const riseExp = o.riseExp ?? 2;
  const env = new Float32Array(n);
  for (let i = 0; i < ip && i < n; i++) {
    const u = i / ip;
    env[i] = riseExp === 1 ? u : riseExp === 2 ? u * u : u * u * Math.sqrt(u);
  }
  let e = 1;
  for (let i = ip; i < n; i++) {
    env[i] = e;
    e *= fall;
  }
  if (rough) {
    for (let i = 0; i < n; i++) env[i] *= 1 - o.roughDepth + o.roughDepth * Math.abs(rough[i]);
  }
  for (let i = 0; i < n; i++) x[i] *= env[i];
  const sweep = passSweep(o.fHi, o.fLo, o.tp, o.width ?? 0.03);
  svf(x, 'bp', sweep, o.q, sr);
  mixNorm(out, x, at, o.amp, sr);
  if (o.tone) {
    const tone = addSweepSine(new Float32Array(n), 0, n, sweep, env, 1, sr);
    mixNorm(out, tone, at, o.amp * o.tone, sr);
  }
}

// Shell or bomb falling towards a point near the listener. Pitch falls as the
// radial velocity drops on approach; loudness climbs steeply at the end.
function descent(p, rng, sr) {
  const n = samples(sr, p.len);
  const B = 32;
  const nb = Math.ceil(n / B) + 2;
  const fArr = new Float32Array(nb);
  const aArr = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    const t = Math.min(p.len, (b * B) / sr);
    const s = p.speed * (p.len - t);
    const cos = s / Math.hypot(s, p.missPitch);
    fArr[b] = p.f0 / (1 - (p.speed / C) * cos);
    aArr[b] = Math.pow(p.missAmp / Math.hypot(s, p.missAmp), p.ampExp);
  }
  const fAt = (t) => fArr[Math.min(nb - 1, Math.floor((t * sr) / B))];
  const out = new Float32Array(n);
  const flutter = smoothRandom(n, Math.round(p.len * 70), rng);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = aArr[(i / B) | 0] * (0.8 + 0.2 * flutter[i]);
  addSweepSine(out, 0, n, fAt, env, 1, sr, 0.15);
  normalize(out, p.tone);
  const narrow = white(n, rng.seed());
  const rush = white(n, rng.seed());
  for (let i = 0; i < n; i++) {
    const a = aArr[(i / B) | 0];
    narrow[i] *= a;
    rush[i] *= a * Math.sqrt(a) * (0.7 + 0.3 * flutter[i]);
  }
  svf(narrow, 'bp', fAt, p.q, sr);
  svf(rush, 'bp', (t) => fAt(t) * 1.5, 0.9, sr);
  mixNorm(out, narrow, 0, p.narrow, sr);
  mixNorm(out, rush, 0, p.rush, sr);
  return finish(out, sr, { drive: 1.3, fade: 0.012, dc: 30 });
}

export function incomingShell(rng, sr) {
  return descent({
    len: 2.3, speed: rng.range(240, 280), f0: rng.range(480, 560), missPitch: rng.range(150, 210),
    missAmp: 35, ampExp: 1.2, q: 14, tone: 0.35, narrow: 0.6, rush: 0.8,
  }, rng, sr);
}

export function bombWhistle(rng, sr) {
  return descent({
    len: 3.6, speed: rng.range(200, 240), f0: rng.range(440, 520), missPitch: rng.range(230, 290),
    missAmp: 60, ampExp: 1.0, q: 25, tone: 0.8, narrow: 0.4, rush: 0.4,
  }, rng, sr);
}

// Tumbling bullet: impact tick then a whine that drops in pitch and flutters.
export function ricochet(rng, sr) {
  const len = rng.range(0.55, 0.8);
  const out = new Float32Array(samples(sr, len));
  addNWave(out, 0.001, 0.6, 0.0002, sr);
  addGas(out, 0.001, 0.5, { tau: 0.002, hp: 2500 }, rng, sr);
  addModes(out, 0.001, 0.2, [{ f: rng.range(2500, 3500), d: 0.01, a: 1 }], sr);
  const f0 = rng.range(2200, 3800);
  const drop = rng.range(0.35, 0.55);
  const tumble = rng.range(60, 160);
  const start = samples(sr, 0.004);
  const n = out.length - start;
  const breath = white(n, rng.seed());
  const env = new Float32Array(n);
  const d = Math.exp(-1 / (rng.range(0.12, 0.22) * sr));
  const fOf = (t) => f0 * (1 - drop * (1 - Math.exp(-t / 0.18)));
  const att = samples(sr, 0.006);
  const tw = (TAU * tumble) / sr;
  const tc = Math.cos(tw);
  const ts = Math.sin(tw);
  let c = 1;
  let sn = 0;
  let e = 1;
  for (let i = 0; i < n; i++) {
    const nc = c * tc - sn * ts;
    sn = c * ts + sn * tc;
    c = nc;
    env[i] = (i < att ? i / att : 1) * e * (0.55 + 0.45 * sn);
    breath[i] *= env[i];
    e *= d;
  }
  const whine = addSweepSine(new Float32Array(n), 0, n, fOf, env, 1, sr);
  svf(breath, 'bp', fOf, 6, sr);
  mixNorm(out, whine, 0.004, 0.5, sr);
  mixNorm(out, breath, 0.004, 0.25, sr);
  return finish(out, sr, { drive: 1.2, fade: 0.05 });
}

// Non-penetrating hit on armour: a violent clang of plate modes plus spall.
export function impactMetal(rng, sr) {
  const out = new Float32Array(samples(sr, 0.8));
  addNWave(out, 0.001, 0.7, rng.range(0.15, 0.3) / 1000, sr);
  addGas(out, 0.001, 0.6, { tau: 0.003, hp: 2000 }, rng, sr);
  const modes = [
    ...metalModes(rng.range(260, 420), rng.range(0.25, 0.45), rng, 4),
    ...metalModes(rng.range(1100, 1900), rng.range(0.08, 0.16), rng, 3),
    { f: rng.range(3200, 4200), d: 0.04, a: 0.4 },
    { f: rng.range(5200, 6500), d: 0.025, a: 0.3 },
  ];
  addModes(out, 0.0015, 0.5, modes, sr);
  addTone(out, 0.001, 0.4, 180, 120, 0.004, 0.04, sr);
  addDebris(out, 0.01, 0.35, 30, 0.15, 'metal', rng, sr);
  addScatterTail(out, 0.005, 0.06, 0.12, 3500, rng, sr, 25);
  return finish(out, sr, { drive: 2.0, fade: 0.08 });
}

export function impactDirt(rng, sr) {
  const out = new Float32Array(samples(sr, 0.35));
  addTone(out, 0.001, 0.8, rng.range(150, 200), rng.range(80, 110), 0.006, rng.range(0.018, 0.03), sr);
  addGas(out, 0.001, 0.4, { tau: 0.002, hp: 1500 }, rng, sr);
  addGas(out, 0.002, 0.7, { attack: 0.002, tau: rng.range(0.03, 0.05), lp: rng.range(1000, 1800), hp: 150 }, rng, sr);
  const grains = 2 + rng.int(4);
  for (let i = 0; i < grains; i++) {
    addGrain(out, rng.range(0.02, 0.2), rng.range(0.08, 0.25), rng.pick(['soil', 'stone', 'soil']), rng, sr);
  }
  return finish(out, sr, { drive: 1.6, fade: 0.05 });
}

function addCrumble(out, at, amp, tau, rng, sr) {
  const n = samples(sr, tau * 6);
  const x = white(n, rng.seed());
  const grit = smoothRandom(n, Math.round((n / sr) * 300), rng);
  const d = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, grit[i]);
    x[i] *= e * g * g;
    e *= d;
  }
  biquad(x, 'bp', 1500, 0.8, sr);
  mixNorm(out, x, at, amp, sr);
}

export function impactConcrete(rng, sr) {
  const out = new Float32Array(samples(sr, 0.5));
  addNWave(out, 0.001, 0.6, 0.00025, sr);
  addGas(out, 0.001, 0.8, { tau: 0.004, hp: 2000 }, rng, sr);
  addModes(out, 0.001, 0.25, [
    { f: rng.range(800, 1100), d: 0.015, a: 1 },
    { f: rng.range(2000, 2600), d: 0.01, a: 0.6 },
  ], sr);
  addCrumble(out, 0.003, 0.5, rng.range(0.04, 0.07), rng, sr);
  const chips = 3 + rng.int(4);
  for (let i = 0; i < chips; i++) {
    addGrain(out, rng.range(0.03, 0.3), rng.range(0.05, 0.2), rng.pick(['stone', 'brick', 'soil']), rng, sr);
  }
  return finish(out, sr, { drive: 1.8, fade: 0.05 });
}

export function impactWood(rng, sr) {
  const out = new Float32Array(samples(sr, 0.45));
  addModes(out, 0.001, 0.8, [
    { f: rng.range(300, 450), d: 0.04, a: 1 },
    { f: rng.range(700, 900), d: 0.025, a: 0.7 },
    { f: rng.range(1500, 1900), d: 0.012, a: 0.4 },
  ], sr);
  addGas(out, 0.001, 0.5, { tau: 0.003, hp: 1200 }, rng, sr);
  addCrackle(out, 0.003, 0.08, 400, 0.3, rng, sr, { hp: 1500 });
  addGrain(out, rng.range(0.03, 0.12), 0.2, 'snap', rng, sr);
  return finish(out, sr, { drive: 1.5, fade: 0.05 });
}

// Leaves and twigs: grainy high noise, decaying.
function addRustle(out, at, dur, amp, rng, sr, rise = 0) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, dur));
  if (n <= 32) return;
  const x = white(n, rng.seed());
  const grain = smoothRandom(n, Math.round((n / sr) * 150), rng);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const v = 1 - u;
    const env = rise > 0 ? Math.min(1, u / rise) * v * Math.sqrt(v) : v * Math.sqrt(v);
    const g = Math.max(0, grain[i]);
    x[i] *= env * g * g;
  }
  hp1(x, 1400, sr);
  lp1(x, 7000, sr);
  mixNorm(out, x, at, amp, sr);
}

export function treeFall(rng, sr) {
  const out = new Float32Array(samples(sr, 3.6));
  let t = 0.02;
  let rate = 18;
  while (t < 0.85) {
    addModes(out, t, rng.range(0.08, 0.25), [{ f: rng.range(250, 700), d: 0.008, a: 1 }], sr);
    t += 1 / rate;
    rate *= 1.06;
  }
  const gn = samples(sr, 0.85);
  const groan = new Float32Array(gn);
  let ph = 0;
  for (let i = 0; i < gn; i++) {
    const tt = i / sr;
    ph += (TAU * (90 + 25 * Math.sin(TAU * 3.1 * tt) + 15 * Math.sin(TAU * 7.3 * tt))) / sr;
    groan[i] = (tt / 0.85) * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph));
  }
  lp1(groan, 900, sr);
  mixNorm(out, groan, 0.02, 0.18, sr);
  const tc = 0.85;
  addNWave(out, tc, 0.7, 0.0008, sr);
  addGas(out, tc, 0.6, { tau: 0.03, hp: 900 }, rng, sr);
  addCrackle(out, tc, 0.25, 300, 0.5, rng, sr, { hp: 1200 });
  addModes(out, tc, 0.35, [{ f: 420, d: 0.05, a: 1 }, { f: 930, d: 0.03, a: 0.6 }], sr);
  addRustle(out, 0.95, 1.4, 0.35, rng, sr, 0.75);
  const ti = 2.25;
  addTone(out, ti, 0.9, 55, 35, 0.04, 0.25, sr, 0.004);
  addGas(out, ti, 0.7, { attack: 0.004, tau: 0.12, lp: 500 }, rng, sr);
  addDebris(out, ti + 0.02, 0.9, 60, 0.45, 'wood', rng, sr);
  addRustle(out, ti + 0.05, 1.3, 0.3, rng, sr);
  return finish(out, sr, { drive: 2.0, fade: 0.3 });
}

export function parachuteOpen(rng, sr) {
  const out = new Float32Array(samples(sr, 1.2));
  addRustle(out, 0.0, 0.32, 0.4, rng, sr, 0.8);
  const ts = rng.range(0.24, 0.3);
  addFriedlander(out, ts, 0.9, 0.006, 1.6, sr);
  addTone(out, ts, 0.7, 95, 60, 0.02, 0.07, sr, 0.003);
  addGas(out, ts, 0.5, { tau: 0.004, hp: 2500 }, rng, sr);
  const n = samples(sr, 0.85);
  const flap = white(n, rng.seed());
  const rate = rng.range(11, 16);
  const d = Math.exp(-1 / (0.3 * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    const s = Math.sin((TAU * rate * i) / sr);
    flap[i] *= e * (0.3 + 0.7 * s * s);
    e *= d;
  }
  biquad(flap, 'bp', 600, 0.8, sr);
  mixNorm(out, flap, ts + 0.02, 0.35, sr);
  return finish(out, sr, { drive: 1.5, fade: 0.2 });
}

// FPV drone diving at full throttle: four detuned motors spinning up while closing in.
export function droneDive(rng, sr) {
  const len = 2.4;
  const n = samples(sr, len);
  const out = new Float32Array(n);
  const f0 = rng.range(250, 290);
  const f1 = rng.range(410, 470);
  const motors = [1, 1.018, 1.034, 1.052].map((m) => m * rng.jit(1, 0.005));
  const ph = [0, 0, 0, 0];
  const gain = new Float32Array(n);
  const spin = Math.exp(-1 / (0.6 * sr));
  let s = 1;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = (f1 + (f0 - f1) * s) * 1.08;
    s *= spin;
    const g = 3 / (55 * (1 - u) + 3);
    gain[i] = g;
    let v = 0;
    for (let m = 0; m < 4; m++) {
      const dt = (f * motors[m]) / sr;
      ph[m] += dt;
      if (ph[m] >= 1) ph[m] -= 1;
      v += 0.65 * blepSaw(ph[m], dt) + 0.35 * blepSquare(ph[m], dt);
    }
    out[i] = v * g;
  }
  biquad(out, 'peak', 1800, 1.2, sr, 6);
  biquad(out, 'lp', 7000, 0.7, sr);
  const wash = white(n, rng.seed());
  for (let i = 0; i < n; i++) wash[i] *= gain[i];
  hp1(wash, 1500, sr);
  normalize(out, 1);
  mixNorm(out, wash, 0, 0.3, sr);
  return finish(out, sr, { drive: 1.8, fade: 0.015, dc: 40 });
}

// Low, fast jet pass rendered from geometry: retarded emission time, doppler,
// spherical spreading, air absorption, fan whine forward and jet roar aft.
export function jetFlyby(rng, sr) {
  const len = 5.0;
  const n = samples(sr, len);
  const v = rng.range(220, 260);
  const h = rng.range(55, 80);
  const tp = 2.0;
  const B = 32;
  const nb = Math.ceil(n / B) + 2;
  const D = new Float32Array(nb);
  const G = new Float32Array(nb);
  const front = new Float32Array(nb);
  const aft = new Float32Array(nb);
  const cut = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    const tau = (b * B) / sr;
    let te = tau - h / C;
    for (let k = 0; k < 8; k++) {
      const x = v * (te - tp);
      const r = Math.hypot(x, h);
      te -= (te + r / C - tau) / (1 + (v * x) / (r * C));
    }
    const x = v * (te - tp);
    const r = Math.hypot(x, h);
    const cos = -x / r;
    D[b] = 1 / (1 + (v * x) / (r * C));
    G[b] = h / r;
    front[b] = 0.1 + Math.pow(Math.max(0, cos), 1.5);
    aft[b] = 0.3 + 0.7 * Math.pow(Math.max(0, -cos), 0.8);
    cut[b] = 16000 / (1 + r / 150);
  }
  const at = (arr) => (t) => arr[Math.min(nb - 1, Math.floor((t * sr) / B))];
  const out = new Float32Array(n);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i / B) | 0;
    env[i] = G[b] * front[b];
  }
  const dAt = at(D);
  for (const [f, a] of [[2450, 0.5], [3320, 0.35], [4870, 0.2]]) {
    const fj = f * rng.jit(1, 0.05);
    addSweepSine(out, 0, n, (t) => fj * dAt(t), env, a, sr);
  }
  normalize(out, 0.35);
  const roar = white(n, rng.seed());
  const crack = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i / B) | 0;
    roar[i] *= G[b] * aft[b];
  }
  const low = roar.slice();
  svf(roar, 'bp', (t) => 520 * dAt(t), 0.55, sr);
  svf(low, 'lp', (t) => 160 * dAt(t), 0.7, sr);
  mixNorm(out, roar, 0, 1, sr);
  mixNorm(out, low, 0, 0.6, sr);
  addCrackle(crack, 0, len, 140, 1, rng, sr, { hp: 1200, fall: 0 });
  for (let i = 0; i < n; i++) {
    const b = (i / B) | 0;
    crack[i] *= G[b] * G[b] * aft[b];
  }
  mixNorm(out, crack, 0, 0.35, sr);
  svf(out, 'lp', at(cut), 0.7, sr);
  return finish(out, sr, { drive: 1.6, fade: 0.4, dc: 20 });
}

export function shellCasings(rng, sr) {
  const out = new Float32Array(samples(sr, 0.8));
  const casings = 2 + rng.int(3);
  for (let c = 0; c < casings; c++) {
    let t = rng.range(0.0, 0.25);
    let a = rng.range(0.5, 1);
    let gap = rng.range(0.08, 0.14);
    const f0 = rng.range(3000, 5200);
    const bounces = 4 + rng.int(3);
    for (let b = 0; b < bounces && t < 0.85; b++) {
      addModes(out, t, a * 0.5, metalModes(f0 * rng.jit(1, 0.02), rng.range(0.03, 0.07), rng, 3), sr);
      addGas(out, t, a * 0.2, { tau: 0.0008, hp: 4000 }, rng, sr);
      t += gap;
      gap *= 0.6;
      a *= 0.55;
    }
  }
  return finish(out, sr, { drive: 0, fade: 0.05, dc: 40 });
}

export function reload(rng, sr) {
  const out = new Float32Array(samples(sr, 1.3));
  const click = (t, a, f1, f2) => {
    addModes(out, t, a, [{ f: f1, d: 0.006, a: 1 }, { f: f2, d: 0.004, a: 0.6 }], sr);
    addGas(out, t, a * 0.6, { tau: 0.0015, hp: 2000 }, rng, sr);
  };
  const slide = (t, a, f, dur) => addGas(out, t, a, { attack: dur * 0.3, tau: dur * 0.4, f, q: 1.5 }, rng, sr);
  click(0.02, 0.5, 2600, 4100);
  slide(0.04, 0.3, 1800, 0.08);
  const tIn = rng.range(0.38, 0.48);
  slide(tIn - 0.06, 0.25, 2200, 0.06);
  click(tIn, 0.9, 900, 1800);
  addTone(out, tIn, 0.4, 260, 180, 0.005, 0.02, sr);
  click(tIn + 0.03, 0.4, 3000, 4800);
  const tPull = tIn + rng.range(0.32, 0.4);
  slide(tPull, 0.35, 2800, 0.09);
  click(tPull + 0.09, 0.5, 2200, 3600);
  const tRel = tPull + rng.range(0.12, 0.17);
  click(tRel, 1.0, 1200, 2600);
  addModes(out, tRel, 0.4, [{ f: 4800, d: 0.006, a: 1 }], sr);
  addTone(out, tRel, 0.5, 220, 150, 0.005, 0.025, sr);
  return finish(out, sr, { drive: 1.2, fade: 0.05 });
}

// Pea whistle: ~3 kHz tone warbled by the rattling pea, plus breath.
export function squadWhistle(rng, sr) {
  const blasts = rng.chance(0.5) ? [[0.01, 0.22], [0.36, 0.62]] : [[0.01, 0.85]];
  const last = blasts[blasts.length - 1];
  const len = last[0] + last[1] + 0.2;
  const n = samples(sr, len);
  const tone = new Float32Array(n);
  const breath = new Float32Array(n);
  const f0 = rng.range(2850, 3300);
  const jitter = smoothRandom(n, Math.round(len * 40), rng);
  const trill = rng.range(26, 34);
  const freq = new Float32Array(n).fill(f0);
  const env = new Float32Array(n);
  for (const [start, dur] of blasts) {
    const i0 = samples(sr, start);
    const i1 = Math.min(n, samples(sr, start + dur));
    const bend = Math.exp(-1 / (0.04 * sr));
    let bn = 1;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sr;
      const a = Math.min(1, t / 0.015) * Math.min(1, (dur - t) / 0.03);
      const tr = 0.7 * Math.sin(TAU * trill * t) + 0.3 * jitter[i];
      freq[i] = f0 * (1 - 0.05 * bn) * (1 + 0.03 * tr);
      bn *= bend;
      env[i] = a * (0.8 + 0.2 * tr);
      breath[i] = a * (0.6 + 0.4 * Math.abs(tr));
    }
  }
  addSweepSine(tone, 0, n, (t) => freq[Math.min(n - 1, Math.round(t * sr))], env, 1, sr, 0.12);
  const nz = white(n, rng.seed());
  for (let i = 0; i < n; i++) nz[i] *= breath[i];
  biquad(nz, 'bp', f0, 2.5, sr);
  normalize(tone, 1);
  mixNorm(tone, nz, 0, 0.2, sr);
  addScatterTail(tone, 0.02, 0.05, 0.1, 4000, rng, sr, 10);
  return finish(tone, sr, { drive: 0, fade: 0.05, dc: 100 });
}

export function uiClick(rng, sr) {
  const out = new Float32Array(samples(sr, 0.04));
  addModes(out, 0.0005, 0.7, [{ f: 2100, d: 0.003, a: 1 }, { f: 4300, d: 0.0015, a: 0.4 }], sr);
  addGas(out, 0.0005, 0.3, { tau: 0.0006, hp: 3000 }, rng, sr);
  return finish(out, sr, { drive: 0, fade: 0.01, dc: 60, target: 0.6 });
}

export function uiConfirm(rng, sr) {
  const out = new Float32Array(samples(sr, 0.3));
  const blip = (t0, f, dur) => {
    const i0 = samples(sr, t0);
    const n = samples(sr, dur);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-t / (dur * 0.35));
      out[i0 + i] += env * (Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * 2 * f * t));
    }
  };
  blip(0.002, 660, 0.09);
  blip(0.075, 990, 0.2);
  return finish(out, sr, { drive: 0, fade: 0.02, dc: 60, target: 0.5 });
}

// --- Projectile flybys (start right at the pass) ----------------------------

export function bulletCrack(rng, sr) {
  const out = new Float32Array(samples(sr, 0.35));
  const dur = rng.range(0.22, 0.4) / 1000;
  addNWave(out, 0.001, 1, dur, sr);
  addNWave(out, 0.001 + rng.range(0.003, 0.009), rng.range(0.35, 0.55), dur * 1.3, sr);
  addGas(out, 0.001, 0.3, { attack: 0.00005, tau: 0.006, hp: 4000 }, rng, sr);
  addPassNoise(out, 0.0, {
    len: 0.2, tp: 0.004, riseExp: 1, fall: 0.035, fHi: 4200, fLo: 1600, width: 0.012, q: 2, amp: 0.2,
  }, rng, sr);
  addScatterTail(out, 0.004, 0.1, 0.1, 4000, rng, sr, 30);
  return finish(out, sr, { drive: 1.4, fade: 0.03 });
}

export function bulletWhizz(rng, sr) {
  const out = new Float32Array(samples(sr, 0.4));
  addPassNoise(out, 0.0, {
    len: 0.38, tp: 0.07, riseExp: 2, fall: 0.06, fHi: rng.range(2400, 3000), fLo: rng.range(1000, 1300),
    width: 0.018, q: 4, amp: 1, tone: 0.35, rough: 90, roughDepth: 0.3,
  }, rng, sr);
  return finish(out, sr, { drive: 1.2, fade: 0.04, dc: 80 });
}

export function heavyCrack(rng, sr) {
  const out = new Float32Array(samples(sr, 0.6));
  const dur = rng.range(0.7, 1.0) / 1000;
  addNWave(out, 0.001, 1, dur, sr);
  addNWave(out, 0.001 + rng.range(0.004, 0.01), 0.45, dur * 1.3, sr);
  addTone(out, 0.001, 0.4, 130, 80, 0.006, 0.03, sr);
  addPassNoise(out, 0.0, {
    len: 0.5, tp: 0.01, riseExp: 1, fall: 0.09, fHi: 1400, fLo: 500, width: 0.02, q: 1, amp: 0.45,
    rough: 80, roughDepth: 0.6,
  }, rng, sr);
  addScatterTail(out, 0.005, 0.12, 0.15, 3000, rng, sr, 20);
  return finish(out, sr, { drive: 1.8, fade: 0.05 });
}

export function heavyWhizz(rng, sr) {
  const out = new Float32Array(samples(sr, 0.6));
  addPassNoise(out, 0.0, {
    len: 0.58, tp: 0.12, riseExp: 2, fall: 0.1, fHi: rng.range(900, 1100), fLo: rng.range(380, 450),
    width: 0.03, q: 2.5, amp: 1, tone: 0.2, rough: 40, roughDepth: 0.6,
  }, rng, sr);
  return finish(out, sr, { drive: 1.4, fade: 0.05, dc: 40 });
}

export function shellRip(rng, sr) {
  const out = new Float32Array(samples(sr, 1.4));
  addNWave(out, 0.12, 0.9, rng.range(2, 3) / 1000, sr);
  addPassNoise(out, 0.0, {
    len: 1.35, tp: 0.12, riseExp: 1.5, fall: 0.28, fHi: rng.range(900, 1100), fLo: rng.range(220, 300),
    width: 0.05, q: 1.1, amp: 1, rough: 60, roughDepth: 0.65,
  }, rng, sr);
  addScatterTail(out, 0.13, 0.15, 0.35, 1500, rng, sr, 8);
  return finish(out, sr, { drive: 2.2, fade: 0.15 });
}

export function shellWhoosh(rng, sr) {
  const out = new Float32Array(samples(sr, 1.4));
  addPassNoise(out, 0.0, {
    len: 1.35, tp: 0.3, riseExp: 2.5, fall: 0.3, fHi: rng.range(1000, 1200), fLo: rng.range(300, 380),
    width: 0.08, q: 1.3, amp: 1, tone: 0.15, rough: 35, roughDepth: 0.55,
  }, rng, sr);
  return finish(out, sr, { drive: 1.8, fade: 0.15, dc: 30 });
}

export function rocketWhoosh(rng, sr) {
  const out = new Float32Array(samples(sr, 1.5));
  addPassNoise(out, 0.0, {
    len: 1.45, tp: 0.22, riseExp: 2, fall: 0.35, fHi: rng.range(2200, 2600), fLo: rng.range(700, 900),
    width: 0.06, q: 0.7, amp: 1, rough: 70, roughDepth: 0.4,
  }, rng, sr);
  addPassNoise(out, 0.0, {
    len: 1.45, tp: 0.22, riseExp: 2, fall: 0.4, fHi: 800, fLo: 320, width: 0.06, q: 1.2, amp: 0.6,
  }, rng, sr);
  addCrackle(out, 0.1, 0.8, 120, 0.25, rng, sr, { hp: 1500 });
  fadeOut(out, 0.1, sr);
  return finish(out, sr, { drive: 2.0, fade: 0.15 });
}
