// Offline synthesis for the autonomous ambience: city bed, wind, distant cars, sirens, elevated train,
// distant dog. Distant events are pre-filtered for distance and get baked early echoes; the runtime
// additionally routes them through the dark "city" convolution reverb.
import {
  TAU, filt, fillPink, fillBrown, fillWhite, smoothRandom, makeLoop, normalizeRms, normalizePeak,
  addNoiseBurst, addMode, dcBlock, fadeIn, fadeOut, SVF, clamp, addOsc,
} from '../lib/dsp.js';
import { deriveRng, noiseGen } from '../lib/rng.js';
import { makeSpeaker, renderPhones } from './voice.js';

// ------------------------------------------------------------------ city bed
export function synthCityRumble(seed, sr = 8000) {
  const r = deriveRng(seed, 'city-rumble');
  const L = 24;
  const N = Math.round(L * sr), X = Math.round(1.5 * sr);
  const common = new Float32Array(N + X);
  fillBrown(common, r.seed32(), 1, 0.998);
  const chs = [];
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(N + X);
    fillBrown(x, r.seed32(), 1, 0.998);
    const roar = new Float32Array(N + X);
    fillPink(roar, r.seed32());
    filt(roar, 'bandpass', 380, 0.5, sr);
    const sw1 = smoothRandom(N + X, sr, 0.08, r);
    const sw2 = smoothRandom(N + X, sr, 0.3, r);
    for (let i = 0; i < x.length; i++) {
      x[i] = (x[i] * 0.55 + common[i] * 0.6 + roar[i] * 0.9) * (1 + 0.35 * sw1[i] + 0.12 * sw2[i]);
    }
    filt(x, 'lowpass', 220, 0.7, sr);
    filt(x, 'lowpass', 600, 0.7, sr);
    filt(x, 'highpass', 24, 0.7, sr);
    chs.push(makeLoop(x, N, X));
  }
  const g = 0.1 / Math.max(1e-9, Math.hypot(rms(chs[0]), rms(chs[1])) / Math.SQRT2);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chs;
}

function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }

export function synthCityHiss(seed, sr) {
  const r = deriveRng(seed, 'city-hiss');
  const L = 14;
  const N = Math.round(L * sr), X = Math.round(1 * sr);
  // swells: far-away wet tyres
  const env = new Float32Array(N + X);
  for (let i = 0; i < env.length; i++) env[i] = 0.35;
  let t = 0;
  while (t < (N + X) / sr) {
    const c = t + r.range(0, 2);
    const w = r.range(1.2, 3.5);
    const a = r.range(0.25, 1);
    const i0 = Math.max(0, Math.round((c - 3 * w) * sr));
    const i1 = Math.min(env.length, Math.round((c + 3 * w) * sr));
    for (let i = i0; i < i1; i++) { const u = (i / sr - c) / w; env[i] += a * Math.exp(-0.5 * u * u); }
    t += r.range(2, 6);
  }
  const chs = [];
  for (let ch = 0; ch < 2; ch++) {
    const x = new Float32Array(N + X);
    fillWhite(x, r.seed32(), 1);
    const sw = smoothRandom(N + X, sr, 0.5, r);
    for (let i = 0; i < x.length; i++) x[i] *= env[i] * (1 + 0.2 * sw[i]);
    filt(x, 'bandpass', 2600, 0.45, sr);
    filt(x, 'lowpass', 6500, 0.7, sr);
    filt(x, 'highpass', 900, 0.7, sr);
    chs.push(makeLoop(x, N, X));
  }
  const g = 0.1 / Math.max(1e-9, Math.hypot(rms(chs[0]), rms(chs[1])) / Math.SQRT2);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chs;
}

// ------------------------------------------------------------------ wind
export function synthWindNoise(seed, sr = 24000) {
  const r = deriveRng(seed, 'wind');
  const L = 16;
  const N = Math.round(L * sr), X = Math.round(1 * sr);
  const common = new Float32Array(N + X);
  fillPink(common, r.seed32());
  const chs = [];
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(N + X);
    fillPink(x, r.seed32());
    const flutter = smoothRandom(N + X, sr, 2.5, r);
    for (let i = 0; i < x.length; i++) x[i] = (x[i] * 0.7 + common[i] * 0.55) * (1 + 0.25 * flutter[i]);
    filt(x, 'lowpass', 3200, 0.7, sr);
    filt(x, 'highpass', 35, 0.7, sr);
    chs.push(makeLoop(x, N, X));
  }
  const g = 0.15 / Math.max(1e-9, Math.hypot(rms(chs[0]), rms(chs[1])) / Math.SQRT2);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chs;
}

// ------------------------------------------------------------------ distant car (several streets away)
export function synthDistantCar(seed, idx, sr = 22050) {
  const r = deriveRng(seed, 'dcar' + idx);
  const dur = r.range(7, 10);
  const n = Math.round(dur * sr);
  const x = new Float32Array(n);
  const tc = dur * r.range(0.42, 0.58);
  const sA = r.range(1.4, 2.4), sB = sA * r.range(0.8, 1.1);
  const dop = r.range(0.02, 0.035);
  const nz = noiseGen(r.seed32());
  const bandA = new SVF(900, 0.7, sr);
  const bandB = new SVF(2500, 0.8, sr);
  const f0 = r.range(28, 45);
  let ph = 0;
  const BL = 32;
  const rough = smoothRandom(Math.ceil(n / BL) + 2, sr / BL, 18, r);
  for (let b = 0; b < n; b += BL) {
    const t = b / sr;
    const u = (t - tc) / (t < tc ? sA : sB);
    const env = Math.exp(-0.5 * u * u);
    const D = 1 + dop * Math.tanh((tc - t) / 0.9);
    bandA.set((700 + 800 * env) * D, 0.7, sr);
    bandB.set((2200 + 900 * env) * D, 0.8, sr);
    const ro = 0.8 + 0.2 * rough[b / BL];
    const pe = Math.pow(env, 1.3) * 0.25;
    const inc = (f0 * D) / sr;
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) {
      const w = nz() * ro;
      bandA.tick(w);
      bandB.tick(w);
      ph += inc;
      if (ph >= 1) ph -= 1;
      const pulse = ph < 0.22 ? 1 - ph / 0.22 : 0;
      x[b + i] = env * (bandA.bp + bandB.bp * 0.45) + pulse * pe;
    }
  }
  filt(x, 'lowpass', 1800, 0.7, sr);
  filt(x, 'lowpass', 2400, 0.7, sr);
  filt(x, 'highpass', 55, 0.7, sr);
  fadeIn(x, Math.round(0.2 * sr));
  fadeOut(x, Math.round(0.3 * sr));
  normalizePeak(x, 0.9);
  return x;
}

// ------------------------------------------------------------------ siren (wail/yelp, Doppler, distant)
export function synthSiren(seed, idx, sr = 16000) {
  const r = deriveRng(seed, 'siren' + idx);
  const dur = r.range(22, 28);
  const n = Math.round(dur * sr);
  const fLo = r.range(620, 720), fHi = r.range(1350, 1550);
  const prog = [];
  let t = 0;
  while (t < dur) {
    const mode = prog.length === 0 ? 'wail' : r.chance(0.35) ? 'yelp' : 'wail';
    const d = mode === 'wail' ? r.range(1.5, 2.5) * r.range(3.8, 5.2) : r.range(2.5, 5);
    prog.push({ mode, t0: t, t1: t + d, period: mode === 'wail' ? r.range(3.8, 5.2) : r.range(0.26, 0.32) });
    t += d;
  }
  const tc = dur * r.range(0.4, 0.6);
  const dt = r.range(2, 4);
  const dop = r.range(0.02, 0.035);
  const BL = 16;
  const occl = smoothRandom(Math.ceil(n / BL) + 2, sr / BL, 0.35, r);
  const x = new Float32Array(n);
  let re = 1, im = 0;
  let p = 0;
  let fPrev = fLo;
  const e3 = 1 - Math.exp(-3);
  for (let b = 0; b < n; b += BL) {
    const tt = b / sr;
    while (p < prog.length - 1 && tt >= prog[p].t1) p++;
    const seg = prog[p];
    const u = (((tt - seg.t0) / seg.period) % 1 + 1) % 1;
    let f;
    if (seg.mode === 'wail') {
      f = u < 0.45 ? fLo + (fHi - fLo) * ((1 - Math.exp((-3 * u) / 0.45)) / e3) : fHi - (fHi - fLo) * Math.pow((u - 0.45) / 0.55, 1.4);
    } else {
      f = u < 0.5 ? fLo + (fHi - fLo) * (u / 0.5) : fHi - (fHi - fLo) * ((u - 0.5) / 0.5);
    }
    fPrev += (f - fPrev) * 0.28;
    const D = 1 + dop * Math.tanh((tc - tt) / dt);
    const w = (TAU * fPrev * D) / sr;
    const c = Math.cos(w), sn = Math.sin(w);
    const fa = clamp(tt / (dur * 0.28), 0, 1);
    const fb = clamp((dur - tt) / (dur * 0.35), 0, 1);
    const env = Math.pow(fa * fa * (3 - 2 * fa), 1.2) * Math.pow(fb * fb * (3 - 2 * fb), 1.2) * (1 + 0.38 * occl[b / BL]);
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) {
      const v = 2.2 * im;
      x[b + i] = ((v * (27 + v * v)) / (27 + 9 * v * v)) * env;
      const tr = re * c - im * sn;
      im = re * sn + im * c;
      re = tr;
    }
    const mag = Math.sqrt(re * re + im * im) || 1;
    re /= mag; im /= mag;
  }
  filt(x, 'highpass', 320, 0.7, sr);
  filt(x, 'peaking', 1100, 0.9, sr, 4);
  filt(x, 'lowpass', 1700, 0.7, sr);
  filt(x, 'lowpass', 2300, 0.7, sr);
  // baked building echoes (one darker copy, several delays)
  const e = x.slice();
  filt(e, 'lowpass', 900, 0.7, sr);
  for (const [d, g] of [[0.11, 0.45], [0.23, 0.32], [0.37, 0.24], [0.56, 0.15], [0.81, 0.09]]) {
    const off = Math.round(d * r.range(0.85, 1.15) * sr);
    for (let i = n - 1; i >= off; i--) x[i] += e[i - off] * g;
  }
  fadeOut(x, Math.round(0.5 * sr));
  normalizePeak(x, 0.9);
  return x;
}

// ------------------------------------------------------------------ elevated train ("L")
export function synthTrain(seed, idx, sr = 22050) {
  const r = deriveRng(seed, 'train' + idx);
  const dur = r.range(26, 32);
  const n = Math.round(dur * sr);
  const x = new Float32Array(n);
  const v = r.range(11, 15);
  const nCars = r.int(4, 8);
  const carLen = 14.6;
  const trainLen = nCars * carLen;
  const tc = dur * r.range(0.45, 0.55);
  const passHalf = trainLen / (2 * v);
  const W = passHalf + r.range(2.5, 4);
  const envAt = (t) => {
    const u = (t - tc) / W;
    const u2 = u * u;
    return (1 / Math.sqrt(1 + u2 * u2)) * clamp(t / 1.5, 0, 1) * clamp((dur - t) / 2, 0, 1);
  };
  const E = new Float32Array(n);
  for (let i = 0; i < n; i += 64) {
    const e0 = envAt(i / sr), e1 = envAt((i + 64) / sr);
    const m = Math.min(64, n - i);
    for (let k = 0; k < m; k++) E[i + k] = e0 + ((e1 - e0) * k) / 64;
  }
  // wheel clacks over rail joints
  const axles = [];
  for (let c = 0; c < nCars; c++) {
    const base = c * carLen;
    for (const tr of [carLen / 2 - 4.9, carLen / 2 + 4.9]) { axles.push(base + tr - 1.05); axles.push(base + tr + 1.05); }
  }
  const joints = [[-11.9, 0.45], [0, 1], [11.9, 0.55], [23.8, 0.25]];
  const tFront0 = tc - passHalf;
  for (const [xj, wj] of joints) {
    for (const o of axles) {
      const tt = tFront0 + (xj + o) / v + r.range(-0.004, 0.004);
      if (tt < 0 || tt >= dur - 0.05) continue;
      const a = envAt(tt) * wj * r.range(0.7, 1.2);
      if (a < 0.01) continue;
      const st = Math.round(tt * sr);
      addNoiseBurst(x, st, sr, { dur: 0.008, attack: 0.0002, tau: r.range(0.0015, 0.003), bp: r.range(600, 2400), bpQ: 0.8, amp: a * 0.5, seed: r.seed32() });
      addMode(x, st, r.range(280, 520), r.range(0.012, 0.02), a * 0.5, sr, 0);
      addMode(x, st, r.range(900, 1400), r.range(0.004, 0.008), a * 0.18, sr, 0);
      addMode(x, st, r.range(90, 130), r.range(0.025, 0.04), a * 0.45, sr, 0);
    }
  }
  // rumble + wheel roar + structure resonance
  const rum = new Float32Array(n);
  fillBrown(rum, r.seed32(), 0.9, 0.997);
  const roar = new Float32Array(n);
  fillPink(roar, r.seed32(), 1.3);
  filt(roar, 'bandpass', r.range(450, 750), 0.7, sr);
  const BL = 64;
  const slow = smoothRandom(Math.ceil(n / BL) + 2, sr / BL, 1.2, r);
  for (let i = 0; i < n; i++) rum[i] = (rum[i] + roar[i]) * E[i] * (1 + 0.2 * slow[(i / BL) | 0]);
  filt(rum, 'lowpass', 420, 0.7, sr);
  filt(rum, 'peaking', r.range(60, 85), 2, sr, 6);
  for (let i = 0; i < n; i++) x[i] += rum[i] * 0.55;
  // traction motor whine
  const fw = r.range(380, 520);
  const ea = (t) => E[Math.min(n - 1, Math.round(t * sr))];
  addOsc(x, 0, n, sr, (t) => fw * (1 + 0.02 * Math.tanh((tc - t) / 3)), (t) => ea(t) * 0.012, 0, 64);
  addOsc(x, 0, n, sr, (t) => 2 * fw * (1 + 0.02 * Math.tanh((tc - t) / 3)), (t) => ea(t) * 0.005, 0, 64);
  // faint metallic squeal on a curve
  if (r.chance(0.8)) {
    const fs = r.range(3000, 4200);
    const t0 = dur * r.range(0.3, 0.45), t1 = dur * r.range(0.6, 0.8);
    const gate = smoothRandom(Math.ceil(((t1 - t0) * sr) / BL) + 2, sr / BL, 1.5, r);
    const g = (t) => Math.max(0, gate[Math.min(gate.length - 1, ((t * sr) / BL) | 0)] - 0.15) * ea(t0 + t) * clamp(t / 1.5, 0, 1) * clamp((t1 - t0 - t) / 1.5, 0, 1) * 0.05;
    const fv = (k) => (t) => fs * k * (1 + 0.006 * Math.sin(TAU * 6.2 * t));
    addOsc(x, Math.round(t0 * sr), (t1 - t0) * sr, sr, fv(1), g, 0, 32);
    addOsc(x, Math.round(t0 * sr), (t1 - t0) * sr, sr, fv(1.48), (t) => g(t) * 0.5, 0, 32);
  }
  filt(x, 'lowpass', 1700, 0.7, sr);
  filt(x, 'lowpass', 2600, 0.7, sr);
  filt(x, 'highpass', 30, 0.7, sr);
  fadeOut(x, Math.round(0.6 * sr));
  normalizePeak(x, 0.9);
  return x;
}

// ------------------------------------------------------------------ distant dog bark
export function synthBarks(seed, sr = 16000, count = 3) {
  const r = deriveRng(seed, 'dog');
  const out = [];
  for (let k = 0; k < count; k++) {
    const dog = makeSpeaker(r, 'male');
    dog.f0 = r.range(330, 460); dog.fs = r.range(1.05, 1.25); dog.breath = 0.2;
    const x = new Float32Array(Math.round(0.5 * sr));
    const t0 = 0.02;
    const d = r.range(0.14, 0.24);
    const Fu = [350 * dog.fs, 800 * dog.fs, 2400 * dog.fs, 3300];
    const Fa = [700 * dog.fs, 1350 * dog.fs, 2500 * dog.fs, 3400];
    const phones = [
      { t0, t1: t0 + 0.03, F: Fu, av: 0.7, ah: 0.3, af: 0, ff: 3000, f0a: dog.f0 * 0.9, f0b: dog.f0 * 1.2 },
      { t0: t0 + 0.03, t1: t0 + d, F: Fa, av: 1, ah: 0.35, af: 0, ff: 3000, f0a: dog.f0 * 1.2, f0b: dog.f0 * 0.7 },
    ];
    renderPhones(x, sr, r, dog, phones, 1);
    filt(x, 'highpass', 250, 0.7, sr);
    filt(x, 'lowpass', 1600, 0.7, sr);
    dcBlock(x, sr, 60);
    normalizePeak(x, 0.9);
    out.push(x);
  }
  return out;
}
