// Offline synthesis for spatial one-shots and car-pass loops.
import {
  TAU, filt, fillPink, fillBrown, fillWhite, smoothRandom, makeLoop, normalizeRms, normalizePeak,
  addNoiseBurst, addMode, addGlideMode, addBubble, addCrackle, dcBlock, fadeOut, trimTail, clamp, SVF,
} from '../lib/dsp.js';
import { deriveRng, noiseGen } from '../lib/rng.js';
import { addSine } from './emitterSounds.js';

function fin(x, sr, peak = 0.9, hp = 30) {
  dcBlock(x, sr, hp);
  const y = trimTail(x, sr, 1.5e-4);
  fadeOut(y, Math.round(0.004 * sr));
  normalizePeak(y, peak);
  return y;
}

// ------------------------------------------------------------------ drips
function dripWater(r, sr) {
  const x = new Float32Array(Math.round(0.3 * sr));
  const s0 = 2;
  addNoiseBurst(x, s0, sr, { dur: 0.003, attack: 0.00005, tau: 0.0003, bp: r.range(2500, 5000), bpQ: 0.9, amp: r.range(0.15, 0.3), seed: r.seed32() });
  if (r.chance(0.78)) addBubble(x, s0 + Math.round(r.range(0.0005, 0.003) * sr), r.logRange(900, 2600), r.range(1.3, 2.2), r.range(0.005, 0.016), 1, sr);
  else addGlideMode(x, s0, r.range(400, 700), r.range(650, 1000), 0.01, r.range(0.006, 0.012), 0.8, sr);
  if (r.chance(0.5)) addBubble(x, s0 + Math.round(r.range(0.03, 0.07) * sr), r.logRange(1800, 4000), r.range(1.2, 1.6), r.range(0.002, 0.006), r.range(0.15, 0.35), sr);
  return fin(x, sr, 0.9, 150);
}
function dripMetal(r, sr) {
  const x = new Float32Array(Math.round(0.35 * sr));
  addNoiseBurst(x, 2, sr, { dur: 0.003, attack: 0.00005, tau: 0.00025, hp: 2000, lp: 12000, amp: 0.6, seed: r.seed32() });
  const nm = r.int(3, 6);
  for (let k = 0; k < nm; k++) addMode(x, 2, r.logRange(1500, 7000), r.range(0.008, 0.04), r.range(0.2, 0.6), sr, 0);
  addCrackle(x, 2 + Math.round(0.002 * sr), sr, r, { dur: 0.02, rate: 600, amp: 0.15, hp: 3000, lp: 10000, shape: (u) => 1 - u });
  return fin(x, sr, 0.9, 300);
}
function dripGround(r, sr) {
  const x = new Float32Array(Math.round(0.12 * sr));
  addNoiseBurst(x, 2, sr, { dur: 0.012, attack: 0.0001, tau: r.range(0.0015, 0.004), bp: r.range(1200, 3500), bpQ: 0.8, amp: 1, seed: r.seed32() });
  addMode(x, 2, r.range(200, 400), r.range(0.003, 0.006), 0.35, sr, 0);
  addCrackle(x, 2 + Math.round(0.001 * sr), sr, r, { dur: r.range(0.01, 0.03), rate: 500, amp: 0.3, hp: 2500, lp: 9000, shape: (u) => 1 - u });
  if (r.chance(0.4)) addBubble(x, 2 + Math.round(r.range(0.002, 0.01) * sr), r.logRange(2000, 4000), 1.3, 0.002, 0.2, sr);
  return fin(x, sr, 0.9, 120);
}
function dripPlastic(r, sr) {
  const x = new Float32Array(Math.round(0.2 * sr));
  const f = r.range(300, 1100);
  addNoiseBurst(x, 2, sr, { dur: 0.003, attack: 0.00005, tau: 0.0004, bp: 2500, bpQ: 0.8, amp: 0.4, seed: r.seed32() });
  addMode(x, 2, f, r.range(0.008, 0.025), 1, sr, 0);
  addMode(x, 2, f * r.range(2.1, 2.5), r.range(0.004, 0.01), 0.35, sr, 0);
  addCrackle(x, 2, sr, r, { dur: 0.015, rate: 400, amp: 0.15, hp: 3000, lp: 9000, shape: (u) => 1 - u });
  return fin(x, sr, 0.9, 100);
}

// ------------------------------------------------------------------ cans and bottles
function canModes(r) {
  const n = r.int(8, 14);
  const m = [];
  for (let i = 0; i < n; i++) m.push({ f: r.logRange(1100, 7000), tau: r.range(0.006, 0.035), a: r.range(0.2, 1) });
  return m;
}
function canHit(x, sr, r, st, modes, amp, subset = 1) {
  addNoiseBurst(x, st, sr, { dur: 0.004, attack: 0.00005, tau: 0.0005, hp: 1500, lp: 12000, amp: amp * 0.5, seed: r.seed32() });
  for (const m of modes) if (r.chance(subset)) addMode(x, st, m.f * r.range(0.995, 1.005), m.tau * r.range(0.7, 1.2), amp * m.a * 0.3, sr, 0);
  addMode(x, st, r.range(300, 600), 0.006, amp * 0.25, sr, 0);
}
function rollSegment(x, sr, r, t0, dur, rot0, rot1, amp, hitFn, o = {}) {
  const n0 = Math.round(t0 * sr);
  const n = Math.min(x.length - n0, Math.round(dur * sr));
  if (n <= 0) return;
  const grit = new Float32Array(n);
  const nz = noiseGen(r.seed32());
  const BL = 16;
  const wob = smoothRandom(Math.ceil(n / BL) + 2, sr / BL, 7, r);
  let phase = r.next();
  const att = 0.03 * sr;
  for (let b = 0; b < n; b += BL) {
    const u = b / n;
    const rot = rot0 + (rot1 - rot0) * u;
    const e = amp * (1 - Math.pow(u, 1.6)) * Math.min(1, b / att);
    const cs = 0.5 + 0.5 * Math.cos(TAU * phase);
    const g = e * (0.55 + 0.45 * cs * cs * cs) * (0.8 + 0.2 * wob[b / BL]);
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) grit[b + i] = nz() * g;
    phase += (rot * m) / sr;
    if (phase >= 1) {
      phase -= 1;
      if (hitFn && r.chance(o.hitProb ?? 0.6)) hitFn(n0 + b, e);
    }
  }
  const hollow = grit.slice();
  filt(grit, 'highpass', o.gritHP ?? 1500, 0.7, sr);
  filt(grit, 'lowpass', o.gritLP ?? 9000, 0.7, sr);
  filt(hollow, 'bandpass', o.hollowF ?? r.range(500, 900), o.hollowQ ?? 3, sr);
  const ga = o.gritAmp ?? 0.35, ha = o.hollowAmp ?? 1.0;
  for (let i = 0; i < n; i++) x[n0 + i] += grit[i] * ga + hollow[i] * ha;
}

function canKick(r, sr) {
  const x = new Float32Array(Math.round(2.8 * sr));
  const modes = canModes(r);
  // boot contact + can
  addNoiseBurst(x, 2, sr, { dur: 0.04, attack: 0.0005, tau: 0.006, lp: 1200, hp: 80, amp: 0.6, seed: r.seed32() });
  canHit(x, sr, r, 2, modes, 1);
  let t = r.range(0.08, 0.25);
  let gap = r.range(0.12, 0.22);
  let a = r.range(0.45, 0.7);
  const nb = r.int(3, 5);
  for (let k = 0; k < nb; k++) {
    canHit(x, sr, r, Math.round(t * sr), modes, a, 0.6);
    t += gap;
    gap *= r.range(0.55, 0.75);
    a *= r.range(0.55, 0.75);
  }
  const rollDur = r.range(0.6, 1.6);
  rollSegment(x, sr, r, t, rollDur, r.range(5, 9), r.range(1.5, 3), a * 0.8, (st, e) => canHit(x, sr, r, st, modes, e * 0.35, 0.35));
  return fin(x, sr);
}
function canRoll(r, sr) {
  const dur = 5;
  const x = new Float32Array(Math.round((dur + 0.3) * sr));
  const modes = canModes(r);
  rollSegment(x, sr, r, 0.02, dur, r.range(6, 9), r.range(1, 2), 0.6, (st, e) => canHit(x, sr, r, st, modes, e * 0.35, 0.35));
  // ensure a soft fade-in so playback from an offset doesn't click
  return fin(x, sr);
}
function bottleModes(r) {
  const f1 = r.range(900, 1500);
  return [
    { f: f1, tau: r.range(0.05, 0.12), a: 1 },
    { f: f1 * r.range(2.2, 2.6), tau: r.range(0.03, 0.08), a: 0.6 },
    { f: f1 * r.range(3.6, 4.4), tau: r.range(0.02, 0.05), a: 0.4 },
    { f: f1 * r.range(5.5, 6.5), tau: r.range(0.01, 0.03), a: 0.25 },
  ];
}
function glassHit(x, sr, r, st, modes, amp, subset = 1) {
  addNoiseBurst(x, st, sr, { dur: 0.003, attack: 0.00004, tau: 0.0003, hp: 2500, lp: 14000, amp: amp * 0.45, seed: r.seed32() });
  for (const m of modes) if (r.chance(subset)) addMode(x, st, m.f * r.range(0.998, 1.002), m.tau * r.range(0.8, 1.1), amp * m.a * 0.35, sr, 0);
}
function bottleKick(r, sr) {
  const x = new Float32Array(Math.round(3 * sr));
  const modes = bottleModes(r);
  addNoiseBurst(x, 2, sr, { dur: 0.04, attack: 0.0005, tau: 0.006, lp: 1000, hp: 80, amp: 0.55, seed: r.seed32() });
  glassHit(x, sr, r, 2, modes, 1);
  let t = r.range(0.1, 0.3);
  let a = r.range(0.4, 0.6);
  const nb = r.int(1, 3);
  for (let k = 0; k < nb; k++) {
    glassHit(x, sr, r, Math.round(t * sr), modes, a, 0.7);
    t += r.range(0.06, 0.15);
    a *= 0.6;
  }
  const rollDur = r.range(0.8, 2.0);
  rollSegment(x, sr, r, t, rollDur, r.range(3, 5), r.range(1, 2), 0.5, (st, e) => glassHit(x, sr, r, st, modes, e * 0.25, 0.5), {
    hollowF: r.range(250, 450), hollowQ: 2.5, gritHP: 1200, gritAmp: 0.3, hitProb: 0.5,
  });
  if (r.chance(0.4)) glassHit(x, sr, r, Math.round((t + rollDur) * sr), modes, 0.35, 0.8);
  return fin(x, sr);
}

// ------------------------------------------------------------------ rustles
function bumpEnv(len, sr, r, n) {
  const BL = 32;
  const nb = Math.ceil(len / BL) + 1;
  const coarse = new Float32Array(nb);
  const dur = len / sr;
  for (let k = 0; k < n; k++) {
    const c = r.range(0.1, 0.8) * dur;
    const w = r.range(0.08, 0.3) * dur;
    const a = r.range(0.4, 1);
    for (let j = 0; j < nb; j++) { const u = ((j * BL) / sr - c) / w; coarse[j] += a * Math.exp(-0.5 * u * u); }
  }
  let m = 0;
  for (let j = 0; j < nb; j++) m = Math.max(m, coarse[j]);
  const env = new Float32Array(len);
  const inv = m > 0 ? 1 / m : 1;
  for (let i = 0; i < len; i++) {
    const j = (i / BL) | 0;
    const f = (i - j * BL) / BL;
    env[i] = (coarse[j] + (coarse[Math.min(nb - 1, j + 1)] - coarse[j]) * f) * inv;
  }
  return env;
}
function paperRustle(r, sr) {
  const dur = r.range(0.5, 1.6);
  const n = Math.round(dur * sr);
  const x = new Float32Array(n + Math.round(0.05 * sr));
  const env = bumpEnv(n, sr, r, r.int(2, 4));
  addCrackle(x, 0, sr, r, {
    dur, rate: r.range(150, 450), amp: 0.9, bp: r.range(1500, 4500), bpQ: 0.6, grainMin: 0.0002, grainMax: 0.0012,
    shape: (u) => env[Math.min(n - 1, Math.floor(u * n))], ring: [1500, 6000], ringProb: 0.4, ringTau: [0.0008, 0.003], ringAmp: 0.6,
  });
  const slide = new Float32Array(n);
  fillWhite(slide, r.seed32(), 1);
  filt(slide, 'bandpass', r.range(900, 2500), 0.5, sr);
  for (let i = 0; i < n; i++) x[i] += slide[i] * env[i] * 0.25;
  filt(x, 'lowpass', 7000, 0.7, sr);
  return fin(x, sr, 0.9, 150);
}
function plasticRustle(r, sr) {
  const dur = r.range(0.5, 1.8);
  const n = Math.round(dur * sr);
  const x = new Float32Array(n + Math.round(0.05 * sr));
  const env = bumpEnv(n, sr, r, r.int(2, 5));
  addCrackle(x, 0, sr, r, {
    dur, rate: r.range(300, 900), amp: 0.8, hp: 2500, lp: 12000, grainMin: 0.0001, grainMax: 0.0006,
    shape: (u) => env[Math.min(n - 1, Math.floor(u * n))], ring: [3000, 9000], ringProb: 0.7, ringTau: [0.0005, 0.002], ringAmp: 0.7,
  });
  const flap = new Float32Array(n);
  fillWhite(flap, r.seed32(), 1);
  const ff = r.range(6, 14);
  for (let i = 0; i < n; i++) { const s = 0.5 + 0.5 * Math.sin((TAU * ff * i) / sr); flap[i] *= s * s * env[i]; }
  filt(flap, 'bandpass', r.range(600, 2200), 0.6, sr);
  for (let i = 0; i < n; i++) x[i] += flap[i] * 0.5;
  return fin(x, sr, 0.9, 150);
}
function garbageShift(r, sr) {
  const x = new Float32Array(Math.round(2.0 * sr));
  addNoiseBurst(x, 2, sr, { dur: 0.6, attack: r.range(0.02, 0.04), tau: r.range(0.08, 0.15), lp: r.range(350, 550), hp: 50, amp: 1, seed: r.seed32() });
  addMode(x, 2, r.range(90, 160), r.range(0.03, 0.06), 0.3, sr, 0);
  const cr = plasticRustle(r, sr);
  const off = Math.round(r.range(0.0, 0.1) * sr);
  for (let i = 0; i < cr.length && off + i < x.length; i++) x[off + i] += cr[i] * 0.3;
  if (r.chance(0.5)) canHit(x, sr, r, Math.round(r.range(0.1, 0.5) * sr), canModes(r), r.range(0.2, 0.4), 0.5);
  else if (r.chance(0.4)) glassHit(x, sr, r, Math.round(r.range(0.1, 0.5) * sr), bottleModes(r), r.range(0.15, 0.3), 0.7);
  if (r.chance(0.4)) addNoiseBurst(x, Math.round(r.range(0.4, 0.9) * sr), sr, { dur: 0.4, attack: 0.03, tau: 0.08, lp: 450, hp: 50, amp: 0.5, seed: r.seed32() });
  return fin(x, sr, 0.9, 40);
}

// ------------------------------------------------------------------ door rattle / wire creak
function doorRattle(r, sr) {
  const x = new Float32Array(Math.round(1.6 * sr));
  const panel = [];
  for (let k = 0; k < r.int(4, 6); k++) panel.push({ f: r.logRange(250, 1400), tau: r.range(0.01, 0.04), a: r.range(0.3, 1) });
  const nk = r.int(3, 8);
  let t = 0.005;
  const peakAt = r.range(0.2, 0.7);
  for (let k = 0; k < nk; k++) {
    const u = k / Math.max(1, nk - 1);
    const a = (0.5 + 0.5 * Math.exp(-Math.pow((u - peakAt) / 0.35, 2))) * r.range(0.6, 1);
    const st = Math.round(t * sr);
    addNoiseBurst(x, st, sr, { dur: 0.01, attack: 0.0002, tau: 0.0015, bp: r.range(500, 1500), bpQ: 0.8, amp: a * 0.5, seed: r.seed32() });
    addMode(x, st, r.range(90, 160), r.range(0.015, 0.03), a * 0.6, sr, 0);
    for (const m of panel) addMode(x, st, m.f * r.range(0.99, 1.01), m.tau, a * m.a * 0.2, sr, 0);
    if (r.chance(0.35)) addMode(x, st + Math.round(0.002 * sr), r.range(2000, 4000), r.range(0.005, 0.015), a * 0.2, sr, 0);
    t += r.range(0.04, 0.14);
  }
  return fin(x, sr, 0.9, 50);
}
function wireCreak(r, sr) {
  const dur = r.range(0.5, 1.5);
  const n = Math.round(dur * sr);
  const x = new Float32Array(n + Math.round(0.2 * sr));
  const pulses = new Float32Array(n);
  const rA = r.range(40, 120), rB = r.range(90, 250), rC = r.range(40, 160);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const rate = u < 0.5 ? rA + (rB - rA) * (u / 0.5) : rB + (rC - rB) * ((u - 0.5) / 0.5);
    ph += (rate * (1 + 0.15 * (r.next() - 0.5))) / sr;
    if (ph >= 1) {
      ph -= 1;
      const env = Math.sin(Math.PI * u);
      pulses[i] = env * (0.6 + 0.4 * r.next());
    }
  }
  const out = new Float32Array(n);
  for (let k = 0; k < r.int(2, 3); k++) {
    const y = pulses.slice();
    filt(y, 'bandpass', r.logRange(700, 3000), r.range(8, 15), sr);
    for (let i = 0; i < n; i++) out[i] += y[i];
  }
  for (let i = 0; i < n; i++) x[i] = out[i];
  return fin(x, sr, 0.9, 200);
}

// ------------------------------------------------------------------ car-pass loops
export function synthCarEngine(seed, idx, sr = 24000) {
  const r = deriveRng(seed, 'car-engine' + idx);
  const L = 4;
  const N = Math.round(L * sr), X = Math.round(0.4 * sr);
  const f = Math.round(r.range(38, 62) * L * 2) / (L * 2);
  const tone = new Float32Array(N);
  const formant = r.range(140, 300);
  for (let k = 1; k <= 22; k++) {
    const fk = f * k;
    const w = 1 / Math.pow(k, 0.7) * (1 + 1.5 * Math.exp(-Math.pow(Math.log(fk / formant), 2) / 0.25));
    addSine(tone, fk, w * r.range(0.6, 1.2), r.range(0, TAU), sr);
    addSine(tone, fk - f / 2, w * 0.2 * r.range(0.3, 1), r.range(0, TAU), sr);
  }
  const nz = new Float32Array(N + X);
  fillBrown(nz, r.seed32(), 1, 0.995);
  filt(nz, 'lowpass', 500, 0.7, sr);
  const loopN = makeLoop(nz, N, X);
  normalizeRms(tone, 0.1);
  normalizeRms(loopN, 0.05);
  for (let i = 0; i < N; i++) tone[i] += loopN[i];
  filt(tone, 'lowpass', 1600, 0.7, sr);
  normalizeRms(tone, 0.12);
  return tone;
}
export function synthCarTires(seed, idx, sr) {
  const r = deriveRng(seed, 'car-tires' + idx);
  const L = 5;
  const N = Math.round(L * sr), X = Math.round(0.5 * sr);
  const w = new Float32Array(N + X);
  fillWhite(w, r.seed32(), 1);
  const roar = w.slice();
  filt(roar, 'bandpass', r.range(600, 900), 0.6, sr);
  const hiss = w.slice();
  filt(hiss, 'bandpass', r.range(3000, 4200), 0.7, sr);
  filt(hiss, 'lowpass', 9000, 0.7, sr);
  const spray = new Float32Array(N + X);
  addCrackle(spray, 0, sr, r, { dur: (N + X) / sr, rate: r.range(600, 1200), amp: 1, hp: 2500, lp: 11000, shape: () => 1, ampPow: 2 });
  const burst = smoothRandom(N + X, sr, 4, r);
  const rot = r.range(6, 8);
  const x = new Float32Array(N + X);
  const rum = new Float32Array(N + X);
  fillBrown(rum, r.seed32(), 1, 0.99);
  filt(rum, 'lowpass', 220, 0.7, sr);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const am = 1 + 0.05 * Math.sin(TAU * rot * t);
    x[i] = (roar[i] * 1.0 + hiss[i] * 0.85 + spray[i] * 0.35 * (0.5 + 0.5 * Math.max(0, burst[i])) + rum[i] * 0.4) * am;
  }
  filt(x, 'highpass', 70, 0.7, sr);
  const loop = makeLoop(x, N, X);
  normalizeRms(loop, 0.12);
  return loop;
}

// ------------------------------------------------------------------ bank
const ONESHOT_DEFS = {
  'drip.water': [10, dripWater, 'full'],
  'drip.metal': [8, dripMetal, 'full'],
  'drip.ground': [8, dripGround, 'full'],
  'drip.plastic': [8, dripPlastic, 'full'],
  canKick: [4, canKick, 'lo'],
  canRoll: [2, canRoll, 'lo'],
  bottleKick: [4, bottleKick, 'lo'],
  paperRustle: [6, paperRustle, 'lo'],
  plasticRustle: [6, plasticRustle, 'lo'],
  garbageShift: [6, garbageShift, 'lo'],
  doorRattle: [5, doorRattle, 'lo'],
  wireCreak: [5, wireCreak, 'lo'],
};
export const ONESHOT_BANKS = Object.keys(ONESHOT_DEFS);

/**
 * Returns { rates: {name: sampleRate}, [name]: Float32Array[] } for the requested banks. Drips are rendered
 * at the full rate, the larger one-shots at <= 32 kHz (their content is band-limited well below 16 kHz).
 */
export async function synthOneShots(seed, sr, y, names = ONESHOT_BANKS) {
  const bank = { rates: {} };
  const lo = Math.min(32000, sr);
  for (const name of names) {
    const def = ONESHOT_DEFS[name];
    if (!def) continue;
    const [count, fn, kind] = def;
    const rate = kind === 'full' ? sr : lo;
    const r = deriveRng(seed, 'os-' + name);
    bank[name] = [];
    bank.rates[name] = rate;
    for (let i = 0; i < count; i++) {
      bank[name].push(fn(r, rate));
      if (count > 5 && i === (count >> 1)) await y();
    }
    await y();
  }
  return bank;
}

export { clamp, SVF, fillPink };
