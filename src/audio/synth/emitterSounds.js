// Offline synthesis for persistent spatial emitters. Loops are made seamless (tonal parts exactly
// periodic over the loop length, noise parts cross-faded) and are long (>= 9 s); the runtime adds
// slow random modulation and random start offsets so nothing repeats audibly.
import {
  TAU, filt, fillPink, fillBrown, fillWhite, smoothRandom, makeLoop, normalizeRms, normalizePeak, addBubble,
  addNoiseBurst, addMode, addCrackle, combLP, addRoom, dcBlock, fadeIn, fadeOut, scale, clamp, trimTail, addOsc,
} from '../lib/dsp.js';
import { deriveRng, noiseGen } from '../lib/rng.js';
import { makeSpeaker, renderConversation, makeUtterance, renderPhones, makeLaugh } from './voice.js';

/** Add an exactly-periodic sine (rotation oscillator) over the whole buffer. */
export function addSine(out, f, amp, phase, sr) {
  const w = (TAU * f) / sr;
  const c = Math.cos(w), s = Math.sin(w);
  let re = Math.cos(phase) * amp, im = Math.sin(phase) * amp;
  for (let i = 0; i < out.length; i++) {
    out[i] += im;
    const t = re * c - im * s;
    im = re * s + im * c;
    re = t;
  }
}
const periodic = (f, L) => Math.max(1, Math.round(f * L)) / L;

// ------------------------------------------------------------------ HVAC condenser
export function synthHvac(seed, sr = 24000) {
  const r = deriveRng(seed, 'hvac');
  const L = 10;
  const N = Math.round(L * sr), X = Math.round(0.6 * sr);
  const fan = new Float32Array(N + X);
  fillPink(fan, r.seed32());
  const fRot = r.range(12.5, 15.5);
  const turb = smoothRandom(N + X, sr, 0.7, r);
  const flut = smoothRandom(N + X, sr, 9, r);
  for (let i = 0; i < fan.length; i++) {
    const t = i / sr;
    fan[i] *= 1 + 0.16 * Math.sin(TAU * fRot * t) + 0.06 * Math.sin(TAU * 2 * fRot * t + 1.3) + 0.12 * turb[i] + 0.05 * flut[i];
  }
  filt(fan, 'lowpass', 1500, 0.7, sr);
  filt(fan, 'peaking', 420, 1.2, sr, 5);
  filt(fan, 'highpass', 50, 0.7, sr);
  const loop = makeLoop(fan, N, X);
  normalizeRms(loop, 0.1);
  const tone = new Float32Array(N);
  const fm = periodic(r.range(29.2, 29.8), L);
  for (let k = 1; k <= 16; k++) {
    const f = fm * k;
    const bump = 1 + 2.2 * Math.exp(-Math.pow(Math.log(f / 180), 2) / 0.18);
    addSine(tone, f, (bump / Math.pow(k, 1.05)) * r.range(0.5, 1.2), r.range(0, TAU), sr);
  }
  addSine(tone, periodic(120, L), 0.5, r.range(0, TAU), sr);
  addSine(tone, periodic(240, L), 0.2, r.range(0, TAU), sr);
  addSine(tone, periodic(360, L), 0.1, r.range(0, TAU), sr);
  const fb = periodic(fRot * 3, L);
  for (let k = 1; k <= 3; k++) addSine(tone, fb * k, 0.18 / k, r.range(0, TAU), sr);
  normalizeRms(tone, 0.07);
  for (let i = 0; i < N; i++) loop[i] += tone[i];
  normalizeRms(loop, 0.18);
  return loop;
}

export function synthHvacRattles(seed, sr = 24000, count = 6) {
  const r = deriveRng(seed, 'hvac-rattle');
  const out = [];
  for (let v = 0; v < count; v++) {
    const dur = r.range(0.6, 2.4);
    const x = new Float32Array(Math.round((dur + 0.15) * sr));
    const rate = r.range(24, 32);
    const att = r.range(0.08, 0.3), rel = r.range(0.2, 0.5);
    const fA = r.range(350, 700), fB = r.range(900, 1600);
    let t = r.range(0, 0.01);
    while (t < dur) {
      const env = Math.min(1, t / att) * Math.min(1, Math.max(0, (dur - t) / rel));
      const a = env * r.range(0.4, 1);
      const st = Math.round(t * sr);
      addNoiseBurst(x, st, sr, { dur: 0.003, attack: 0.0001, tau: 0.0006, bp: r.range(900, 2200), bpQ: 1, amp: a * 0.6, seed: r.seed32() });
      addMode(x, st, fA * r.range(0.97, 1.03), r.range(0.003, 0.009), a * 0.5, sr, 0);
      addMode(x, st, fB * r.range(0.97, 1.03), r.range(0.002, 0.006), a * 0.3, sr, 0);
      t += (1 / rate) * r.range(0.85, 1.15);
    }
    dcBlock(x, sr, 60);
    normalizePeak(x, 0.8);
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ rooftop kitchen exhaust fan
export function synthExhaust(seed, sr = 24000) {
  const r = deriveRng(seed, 'exhaust');
  const L = 12;
  const N = Math.round(L * sr), X = Math.round(0.8 * sr);
  const a = new Float32Array(N + X);
  const b = new Float32Array(N + X);
  fillBrown(a, r.seed32(), 1, 0.997);
  fillPink(b, r.seed32());
  const fr = r.range(9, 12);
  const sw = smoothRandom(N + X, sr, 0.25, r);
  const whoosh = smoothRandom(N + X, sr, 0.08, r);
  const fast = smoothRandom(N + X, sr, 6, r);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const am = 1 + 0.1 * Math.sin(TAU * fr * t) + 0.28 * sw[i] + 0.2 * whoosh[i] + 0.06 * fast[i];
    a[i] = (a[i] * 0.6 + b[i] * 0.5) * am;
  }
  filt(a, 'lowpass', 2200, 0.7, sr);
  filt(a, 'peaking', 240, 1.3, sr, 7);
  filt(a, 'peaking', 900, 1.0, sr, 2);
  filt(a, 'highpass', 45, 0.7, sr);
  const loop = makeLoop(a, N, X);
  normalizeRms(loop, 0.12);
  const tone = new Float32Array(N);
  const bpf = periodic(fr * 6, L);
  for (let k = 1; k <= 4; k++) addSine(tone, bpf * k, 0.25 / k, r.range(0, TAU), sr);
  addSine(tone, periodic(120, L), 0.08, r.range(0, TAU), sr);
  normalizeRms(tone, 0.03);
  for (let i = 0; i < N; i++) loop[i] += tone[i];
  normalizeRms(loop, 0.16);
  return loop;
}

// ------------------------------------------------------------------ transformer + lamp ballast waveforms
/** Fourier coefficients (real, imag) for an OscillatorNode PeriodicWave at 60 Hz. */
export function transformerWave(seed) {
  const r = deriveRng(seed, 'xfmr');
  const n = 26;
  const real = new Float32Array(n), imag = new Float32Array(n);
  const amps = { 1: 0.08, 2: 1.0, 3: 0.12, 4: 0.45, 5: 0.05, 6: 0.3, 7: 0.04, 8: 0.16, 10: 0.1, 12: 0.07, 14: 0.045, 16: 0.03, 18: 0.02, 20: 0.015, 22: 0.01, 24: 0.008 };
  for (let k = 1; k < n; k++) {
    const a = (amps[k] ?? 0.004) * r.range(0.8, 1.2);
    const ph = r.range(0, TAU);
    real[k] = a * Math.cos(ph);
    imag[k] = a * Math.sin(ph);
  }
  return { real, imag };
}

/** Buzzy 120 Hz ballast waveform (rich harmonics). */
export function ballastWave(seed) {
  const r = deriveRng(seed, 'ballast');
  const n = 48;
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    let a = 1 / Math.pow(k, 0.72);
    if (k % 2 === 0) a *= 0.55;
    a *= r.range(0.7, 1.3);
    const ph = r.range(0, TAU);
    real[k] = a * Math.cos(ph);
    imag[k] = a * Math.sin(ph);
  }
  return { real, imag };
}

/** Mains-synchronous arc sizzle loop (noise bursts at 120 Hz). */
export function synthSizzle(seed, sr) {
  const r = deriveRng(seed, 'sizzle');
  const L = 4;
  const N = Math.round(L * sr), X = Math.round(0.3 * sr);
  const x = new Float32Array(N + X);
  const nz = noiseGen(r.seed32());
  const wob = smoothRandom(N + X, sr, 3, r);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const s = Math.abs(Math.sin(TAU * 60 * t));
    const g = Math.pow(s, 6) * 0.8 + 0.2;
    x[i] = nz() * g * (0.8 + 0.2 * wob[i]);
  }
  filt(x, 'highpass', 3000, 0.7, sr);
  filt(x, 'lowpass', 10000, 0.7, sr);
  const loop = makeLoop(x, N, X);
  normalizeRms(loop, 0.1);
  return loop;
}

export function synthLampCrackles(seed, sr, count = 10) {
  const r = deriveRng(seed, 'lamp-crackle');
  const out = [];
  for (let v = 0; v < count; v++) {
    const dur = r.range(0.02, 0.12);
    const x = new Float32Array(Math.round((dur + 0.03) * sr));
    addCrackle(x, 0, sr, r, {
      dur, rate: r.range(1500, 5000), amp: 1, hp: 1200, lp: 11000, grainMin: 0.00005, grainMax: 0.0003,
      ampPow: 1.6, bigProb: 0.12, shape: (u) => (u < 0.15 ? u / 0.15 : 1 - 0.7 * u),
      ring: [2500, 7000], ringProb: 0.3, ringTau: [0.0004, 0.0015], ringAmp: 0.4,
    });
    if (r.chance(0.5)) addMode(x, 0, r.range(180, 380), r.range(0.003, 0.007), 0.5, sr, 0);
    dcBlock(x, sr, 80);
    normalizePeak(x, 0.9);
    out.push(x);
  }
  return out;
}

export function synthLampTicks(seed, sr, count = 4) {
  const r = deriveRng(seed, 'lamp-tick');
  const out = [];
  for (let v = 0; v < count; v++) {
    const x = new Float32Array(Math.round(0.06 * sr));
    addNoiseBurst(x, 0, sr, { dur: 0.004, attack: 0.00005, tau: 0.0004, hp: 1500, lp: 12000, amp: 1, seed: r.seed32() });
    addMode(x, 0, r.range(2500, 5000), r.range(0.003, 0.008), 0.35, sr, 0);
    addMode(x, 0, r.range(900, 1600), r.range(0.002, 0.005), 0.25, sr, 0);
    normalizePeak(x, 0.9);
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ downspout trickle
export function synthTrickle(seed, sr) {
  const r = deriveRng(seed, 'trickle');
  const L = 11;
  const N = Math.round(L * sr), X = Math.round(0.5 * sr);
  const x = new Float32Array(N + X);
  // fizzy flow bed
  const nz = noiseGen(r.seed32());
  const am = smoothRandom(N + X, sr, 25, r);
  const slow = smoothRandom(N + X, sr, 0.35, r);
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, am[i]);
    x[i] = nz() * a * a * (0.7 + 0.3 * slow[i]) * 0.5;
  }
  filt(x, 'bandpass', 2600, 0.6, sr);
  const total = (N + X) / sr;
  // bubbles from the stream hitting the puddle
  let t = 0;
  while (t < total) {
    const k = Math.min(x.length - 1, Math.round(t * sr));
    const rate = 22 * (1 + 0.6 * slow[k]);
    t += r.exp(1 / Math.max(4, rate));
    addBubble(x, Math.round(t * sr), r.logRange(600, 2800), r.range(1.15, 1.6), r.range(0.002, 0.009), 0.04 + r.exp(0.06), sr);
  }
  // drips from the spout lip
  t = r.range(0.1, 0.5);
  while (t < total) {
    const st = Math.round(t * sr);
    addBubble(x, st, r.range(900, 1500), r.range(1.5, 2.0), r.range(0.012, 0.025), r.range(0.25, 0.45), sr);
    addNoiseBurst(x, st, sr, { dur: 0.004, attack: 0.0001, tau: 0.0006, bp: 3000, bpQ: 1, amp: 0.15, seed: r.seed32() });
    t += r.range(0.35, 1.6);
  }
  // hollow downspout resonance
  const res = x.slice();
  const fp = r.range(350, 450);
  const y = new Float32Array(x.length);
  for (const [m, q, g] of [[1, 12, 1], [2.05, 12, 0.6], [3.1, 10, 0.35]]) {
    const z = res.slice();
    filt(z, 'bandpass', fp * m, q, sr);
    for (let i = 0; i < y.length; i++) y[i] += z[i] * g;
  }
  for (let i = 0; i < x.length; i++) x[i] += y[i] * 1.2;
  dcBlock(x, sr, 120);
  const loop = makeLoop(x, N, X);
  normalizeRms(loop, 0.12);
  return loop;
}

// ------------------------------------------------------------------ storm drain gurgle
export function synthDrain(seed, sr = 24000) {
  const r = deriveRng(seed, 'drain');
  const L = 13;
  const N = Math.round(L * sr), X = Math.round(0.8 * sr);
  const dry = new Float32Array(N + X);
  const total = (N + X) / sr;
  let t = 0.05;
  while (t < total) {
    const base = r.logRange(140, 600);
    const nb = r.int(2, 8);
    let tt = t;
    for (let k = 0; k < nb; k++) {
      addBubble(dry, Math.round(tt * sr), base * r.range(0.8, 1.25), r.range(1.3, 2.2), r.range(0.01, 0.035), r.range(0.2, 0.6), sr, 0.002);
      tt += r.range(0.015, 0.06);
    }
    t += r.range(0.25, 1.5);
  }
  const flow = new Float32Array(N + X);
  fillBrown(flow, r.seed32(), 1, 0.996);
  filt(flow, 'lowpass', 900, 0.7, sr);
  const slow = smoothRandom(N + X, sr, 0.5, r);
  const fall = new Float32Array(N + X);
  fillWhite(fall, r.seed32(), 1);
  filt(fall, 'bandpass', 1200, 0.7, sr);
  for (let i = 0; i < dry.length; i++) dry[i] += flow[i] * 0.25 * (0.7 + 0.3 * slow[i]) + fall[i] * 0.03 * (0.6 + 0.4 * slow[i]);
  const c1 = combLP(dry, sr, 0.023, 0.6, 1500);
  const c2 = combLP(dry, sr, 0.037, 0.5, 1200);
  const res = dry.slice();
  filt(res, 'bandpass', r.range(150, 200), 4, sr);
  const x = new Float32Array(N + X);
  for (let i = 0; i < x.length; i++) x[i] = dry[i] * 0.35 + (c1[i] + c2[i]) * 0.35 + res[i] * 0.6;
  filt(x, 'lowpass', 3500, 0.7, sr);
  dcBlock(x, sr, 50);
  const loop = makeLoop(x, N, X);
  normalizeRms(loop, 0.12);
  return loop;
}

// ------------------------------------------------------------------ muffling (through glass / walls)
function muffle(x, sr, lp, o = {}) {
  filt(x, 'highpass', o.hp ?? 110, 0.7, sr);
  filt(x, 'lowpass', lp, 0.7, sr);
  filt(x, 'lowpass', lp * (o.lp2 ?? 1.15), 0.7, sr);
  if (o.boom) filt(x, 'peaking', o.boom, 1.2, sr, o.boomDb ?? 4);
  return x;
}

function addPadChord(out, sr, r, t0, dur, freqs, amp) {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.round(dur * sr));
  const att = dur * 0.4, rel = dur * 0.45;
  const env = (t) => {
    const e = Math.min(1, t / att) * Math.min(1, Math.max(0, (dur - t) / rel));
    return e * e;
  };
  for (const f of freqs) {
    const vib = r.range(4.5, 5.5);
    const ph0 = r.range(0, TAU);
    for (let h = 1; h <= 6; h++) {
      const ah = amp / h;
      addOsc(out, s0, n, sr, (t) => f * h * (1 + 0.003 * Math.sin(TAU * vib * t + ph0)), (t) => ah * env(t), r.range(0, TAU), 64);
    }
  }
}

// ------------------------------------------------------------------ muffled TV
export function synthTV(seed, sr = 16000) {
  const r = deriveRng(seed, 'tv');
  const dur = 32;
  const spk = [makeSpeaker(r, 'male'), makeSpeaker(r, 'female')];
  const x = renderConversation(r, sr, dur, spk, { turnProb: 0.45, laughProb: 0, uttMin: 1.2, uttMax: 4.5, gapMin: 0.08, gapMax: 0.45, overlapProb: 0.05 });
  normalizeRms(x, 0.1);
  // music swells
  const swells = r.int(2, 3);
  const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]];
  for (let k = 0; k < swells; k++) {
    const t0 = r.range(2, dur - 9);
    const d = r.range(4, 8);
    const pad = new Float32Array(x.length);
    addPadChord(pad, sr, r, t0, d, r.pick(chords).map((f) => f * r.pick([1, 0.5])), 0.05);
    for (let i = 0; i < x.length; i++) x[i] += pad[i];
  }
  // laugh track bursts
  if (r.chance(0.8)) {
    const t0 = r.range(5, dur - 6);
    const crowd = new Float32Array(x.length);
    for (let k = 0; k < 9; k++) {
      const s = makeSpeaker(r, r.chance(0.5) ? 'female' : 'male');
      const Lg = makeLaugh(r, s, t0 + r.range(0, 0.6), { amp: r.range(0.5, 1) });
      renderPhones(crowd, sr, r, s, Lg.phones, 0.5);
    }
    for (let i = 0; i < x.length; i++) x[i] += crowd[i] * 0.6;
  }
  muffle(x, sr, 780, { hp: 120, boom: 240, boomDb: 4 });
  let y = addRoom(x, sr, { rt60: 0.45, damp: 2500, size: 0.6, wet: 0.35, tail: 0.3 });
  y = y.slice(0, x.length);
  dcBlock(y, sr, 60);
  normalizeRms(y, 0.12);
  return y;
}

// ------------------------------------------------------------------ muffled conversation behind a window
export function synthVoices(seed, sr = 16000) {
  const r = deriveRng(seed, 'voices');
  const dur = 30;
  const spk = [makeSpeaker(r, 'male'), makeSpeaker(r, 'female'), makeSpeaker(r, r.chance(0.5) ? 'male' : 'female')];
  spk[2].gain = 0.7;
  const x = renderConversation(r, sr, dur, spk, { turnProb: 0.65, laughProb: 0.16, uttMin: 0.5, uttMax: 2.8, gapMin: 0.12, gapMax: 0.9, overlapProb: 0.2 });
  muffle(x, sr, 900, { hp: 130, boom: 200, boomDb: 3 });
  let y = addRoom(x, sr, { rt60: 0.5, damp: 2500, size: 0.7, wet: 0.4, tail: 0.3 });
  y = y.slice(0, x.length);
  dcBlock(y, sr, 60);
  normalizeRms(y, 0.12);
  return y;
}

// ------------------------------------------------------------------ distant street babble (outdoors)
export function synthStreetBabble(seed, sr = 16000) {
  const r = deriveRng(seed, 'street-babble');
  const dur = 22;
  const spk = [makeSpeaker(r, 'male'), makeSpeaker(r, 'female'), makeSpeaker(r, 'female'), makeSpeaker(r, 'male')];
  spk[2].gain = 0.8; spk[3].gain = 0.75;
  const x = renderConversation(r, sr, dur, spk, { turnProb: 0.7, laughProb: 0.22, uttMin: 0.4, uttMax: 2.2, gapMin: 0.1, gapMax: 0.7, overlapProb: 0.3, excite: 1.15 });
  filt(x, 'highpass', 160, 0.7, sr);
  filt(x, 'lowpass', 2300, 0.7, sr);
  filt(x, 'lowpass', 3000, 0.7, sr);
  dcBlock(x, sr, 60);
  normalizeRms(x, 0.12);
  return x;
}

// ------------------------------------------------------------------ muffled radio (2 songs + DJ)
function renderSong(r, sr, o) {
  const beat = 60 / o.bpm;
  const bars = 8;
  const len = Math.round(bars * 4 * beat * sr);
  const x = new Float32Array(len);
  const semis = (k) => Math.pow(2, k / 12);
  const bassH = [1, 0.45, 0.22, 0.1];
  for (let b = 0; b < bars; b++) {
    const ch = o.prog[b % 4];
    const root = o.key * semis(ch[0]);
    const third = root * semis(ch[1] ? 4 : 3);
    const fifth = root * semis(7);
    const t0 = b * 4 * beat;
    const B = b >= 4;
    // bass line
    const pattern = B ? [[0, 1, 0.8], [1.5, 1, 0.5], [2, 2, 0.7], [3, 1.5, 0.6], [3.5, 1, 0.5]] : [[0, 1, 0.9], [1.5, 1, 0.5], [2.5, 1, 0.6], [3, 1.5, 0.5]];
    for (const [pos, mult, a] of pattern) {
      const f = (mult === 1.5 ? fifth / 2 : (root / 2) * mult) * (root > 140 ? 0.5 : 1);
      const st = Math.round((t0 + pos * beat) * sr);
      for (let h = 0; h < 4; h++) addMode(x, st, f * (h + 1), 0.26, a * 0.5 * bassH[h], sr, 0);
    }
    // kick + snare
    for (let q = 0; q < 4; q++) {
      const st = Math.round((t0 + q * beat) * sr);
      if (q === 0 || q === 2 || (B && q === 3 && b % 2 === 1)) {
        addOsc(x, st, 0.4 * sr, sr, (t) => 48 + 70 * Math.exp(-t / 0.035), (t) => 0.9 * Math.exp(-t / 0.16) * Math.min(1, t / 0.002), 0, 16);
      } else {
        addNoiseBurst(x, st, sr, { dur: 0.25, attack: 0.001, tau: 0.05, lp: 1500, amp: 0.25, seed: r.seed32() });
        addMode(x, st, 185, 0.07, 0.3, sr, 0);
      }
    }
    // chord pad (low-mids)
    const pad = [root, third, fifth].map((f) => (f < 180 ? f * 2 : f));
    const st = Math.round(t0 * sr);
    const d = Math.min(len - st, Math.round(4 * beat * sr));
    const dSec = d / sr;
    for (const f of pad) {
      const env = (t) => Math.min(1, t / 0.08) * (0.7 + 0.3 * Math.exp(-t / 0.8)) * Math.min(1, Math.max(0, (dSec - t) / 0.05));
      addOsc(x, st, d, sr, () => f, (t) => 0.09 * env(t), r.range(0, TAU), 64);
      addOsc(x, st, d, sr, () => 2 * f, (t) => 0.027 * env(t), r.range(0, TAU), 64);
      addOsc(x, st, d, sr, () => 3 * f, (t) => 0.0135 * env(t), r.range(0, TAU), 64);
    }
    // faint lead in the B section
    if (B) {
      for (let q = 0; q < 4; q++) {
        const f = r.pick([root * 2, third * 2, fifth * 2]);
        const s1 = Math.round((t0 + q * beat) * sr);
        const d1 = Math.min(len - s1, Math.round(beat * 0.95 * sr));
        const d1s = d1 / sr;
        const amp = (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.5) * Math.min(1, Math.max(0, (d1s - t) / 0.03)) * 0.08;
        addOsc(x, s1, d1, sr, (t) => f * (1 + 0.004 * Math.sin(TAU * 5.5 * t)), amp, 0, 32);
        addOsc(x, s1, d1, sr, (t) => 3 * f * (1 + 0.004 * Math.sin(TAU * 5.5 * t)), (t) => amp(t) * 0.3, 0, 32);
      }
    }
  }
  return x;
}

/** Returns { songs: [Float32Array, ...], barSec: [..], dj: Float32Array, sr } */
export function synthRadio(seed, sr = 12000) {
  const r = deriveRng(seed, 'radio');
  const songs = [];
  const barSec = [];
  const defs = [
    { bpm: r.range(82, 88), key: 110, prog: [[0, 0], [8, 1], [3, 1], [10, 1]] }, // Am F C G
    { bpm: r.range(70, 76), key: 146.8, prog: [[0, 0], [8, 1], [5, 0], [7, 1]] }, // Dm Bb Gm A
  ];
  for (const d of defs) {
    const x = renderSong(r, sr, d);
    muffle(x, sr, 430, { hp: 45, lp2: 1.6, boom: 85, boomDb: 4 });
    const y = addRoom(x, sr, { rt60: 0.5, damp: 900, size: 0.8, wet: 0.3, tail: 0.0 }).slice(0, x.length);
    dcBlock(y, sr, 30);
    normalizeRms(y, 0.12);
    songs.push(y);
    barSec.push((4 * 60) / d.bpm);
  }
  // DJ talk
  const dj = makeSpeaker(r, 'male');
  dj.rate *= 1.15;
  const djx = new Float32Array(Math.round(6 * sr));
  let t = 0.2;
  while (t < 5.2) {
    const U = makeUtterance(r, dj, t, r.range(0.8, 2.0), { excite: 1.2 });
    renderPhones(djx, sr, r, dj, U.phones, 1);
    t = U.end + r.range(0.1, 0.3);
  }
  muffle(djx, sr, 600, { hp: 120, boom: 220 });
  dcBlock(djx, sr, 60);
  normalizeRms(djx, 0.1);
  fadeIn(djx, Math.round(0.05 * sr));
  fadeOut(djx, Math.round(0.3 * sr));
  return { songs, barSec, dj: djx, sr };
}

export { clamp, scale, trimTail };
