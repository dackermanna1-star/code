// Procedural footsteps: a woman in knee-high heeled boots.
// heel = sharp click (broadband transient + heel-tip/boot modes 1.5-4 kHz, 20-60 ms) + surface layer
// toe  = duller sole/forefoot slap + surface layer;  scuff = light friction drag.
import {
  TAU, SVF, addMode, addGlideMode, addBubble, addNoiseBurst, addCrackle, filt, dcBlock,
  normalizePeak, smoothRandom, trimTail, fadeOut, monoSound,
} from '../lib/dsp.js';
import { deriveRng } from '../lib/rng.js';

export const SURFACES = ['asphalt', 'concrete', 'metal', 'grate', 'puddle', 'wet', 'debris', 'glass', 'wood', 'cardboard'];
export const PARTS = ['heel', 'toe', 'scuff'];

// Per-surface parameters of the shared heel/toe cores.
const P = {
  asphalt:  { lp: [6200, 8200], click: 1.0, body: 0.95, decay: 0.85, f1: [1500, 2250], tock: 0.34, thump: 0.3, toeLP: [1300, 2200], toeAmp: 1, toeThump: 0.35, toeScrape: 0.10, len: 0.2 },
  concrete: { lp: [10500, 14500], click: 1.1, body: 1.05, decay: 1.15, f1: [1750, 2600], tock: 0.3, thump: 0.2, toeLP: [2000, 3200], toeAmp: 1, toeThump: 0.25, toeScrape: 0.16, len: 0.2 },
  metal:    { lp: [8500, 12000], click: 0.85, body: 0.55, decay: 0.9, f1: [1600, 2400], tock: 0.22, thump: 0.1, toeLP: [1500, 2600], toeAmp: 0.8, toeThump: 0.2, toeScrape: 0.1, len: 0.75 },
  grate:    { lp: [8000, 11000], click: 0.85, body: 0.5, decay: 0.85, f1: [1600, 2400], tock: 0.22, thump: 0.12, toeLP: [1500, 2500], toeAmp: 0.8, toeThump: 0.2, toeScrape: 0.1, len: 0.6 },
  puddle:   { lp: [2300, 3300], click: 0.42, body: 0.3, decay: 0.5, f1: [1400, 2000], tock: 0.3, thump: 0.38, toeLP: [800, 1300], toeAmp: 0.6, toeThump: 0.4, toeScrape: 0.0, len: 0.5 },
  wet:      { lp: [4800, 6400], click: 0.85, body: 0.8, decay: 0.75, f1: [1500, 2200], tock: 0.34, thump: 0.3, toeLP: [1100, 1900], toeAmp: 0.9, toeThump: 0.35, toeScrape: 0.05, len: 0.32 },
  debris:   { lp: [7500, 9500], click: 0.8, body: 0.65, decay: 0.8, f1: [1500, 2300], tock: 0.3, thump: 0.25, toeLP: [1500, 2600], toeAmp: 0.8, toeThump: 0.3, toeScrape: 0.15, len: 0.3 },
  glass:    { lp: [8000, 10500], click: 0.75, body: 0.55, decay: 0.8, f1: [1500, 2300], tock: 0.28, thump: 0.25, toeLP: [1600, 2800], toeAmp: 0.75, toeThump: 0.3, toeScrape: 0.15, len: 0.35 },
  wood:     { lp: [6500, 9000], click: 0.8, body: 0.5, decay: 0.8, f1: [1400, 2100], tock: 0.25, thump: 0.12, toeLP: [1200, 2000], toeAmp: 0.85, toeThump: 0.2, toeScrape: 0.08, len: 0.32 },
  cardboard:{ lp: [2800, 4000], click: 0.35, body: 0.22, decay: 0.45, f1: [1300, 1900], tock: 0.2, thump: 0.3, toeLP: [900, 1500], toeAmp: 0.7, toeThump: 0.35, toeScrape: 0.04, len: 0.3 },
};

// ---------------------------------------------------------------- shared cores
function heelCore(out, sr, r, p, s0) {
  const lp = r.range(p.lp[0], p.lp[1]);
  // 1) contact transient: extremely short broadband burst
  addNoiseBurst(out, s0, sr, {
    dur: 0.005, attack: r.range(0.00004, 0.0001), tau: r.range(0.0002, 0.0005),
    hp: r.range(650, 1100), lp, lp2: lp * 1.4, amp: p.click * r.range(0.85, 1.1), seed: r.seed32(),
  });
  // 2) heel-tip / boot resonances (inharmonic, 1.5-4.5 kHz)
  const f1 = r.range(p.f1[0], p.f1[1]);
  const ratios = [1, r.range(1.3, 1.5), r.range(1.76, 2.05), r.range(2.3, 2.75), r.range(2.9, 3.4)];
  for (let k = 0; k < ratios.length; k++) {
    const f = f1 * ratios[k];
    const att = 1 / (1 + Math.pow(f / (lp * 0.9), 4));
    const tau = r.range(0.0035, 0.0085) * p.decay * Math.pow(f1 / f, 0.5);
    const amp = p.body * (k === 0 ? r.range(0.3, 0.46) : r.range(0.07, 0.26)) * att;
    addMode(out, s0, f, tau, amp, sr, r.range(0, 0.3));
  }
  // 3) heel block "tock" (lower boot body)
  addMode(out, s0, r.range(650, 1150), r.range(0.0035, 0.0075) * p.decay, p.tock * r.range(0.6, 1.0), sr, 0);
  // 4) ground/body thump with falling pitch (weight transfer)
  addGlideMode(out, s0, r.range(130, 190), r.range(70, 100), 0.01, r.range(0.006, 0.012), p.thump * r.range(0.7, 1.0), sr);
}

function toeCore(out, sr, r, p, s0) {
  // sole/forefoot slap: softer attack, duller spectrum
  addNoiseBurst(out, s0, sr, {
    dur: 0.09, attack: r.range(0.0008, 0.002), tau: r.range(0.006, 0.013),
    hp: r.range(130, 240), lp: r.range(p.toeLP[0], p.toeLP[1]), amp: p.toeAmp * r.range(0.8, 1.1), seed: r.seed32(),
  });
  addGlideMode(out, s0, r.range(110, 150), r.range(62, 88), 0.012, r.range(0.009, 0.016), p.toeThump * r.range(0.7, 1), sr);
  for (let k = 0; k < 2; k++) {
    addMode(out, s0 + Math.round(r.range(0, 0.001) * sr), r.range(380, 950), r.range(0.002, 0.005), p.toeAmp * r.range(0.08, 0.2), sr, 0);
  }
  if (p.toeScrape > 0) {
    addNoiseBurst(out, s0 + Math.round(r.range(0.004, 0.012) * sr), sr, {
      dur: 0.06, attack: 0.006, tau: r.range(0.008, 0.016), bp: r.range(2000, 4500), bpQ: 0.9,
      amp: p.toeScrape * r.range(0.5, 1), seed: r.seed32(),
    });
  }
}

function scuffCore(out, sr, r, s0, dur, f) {
  const n = Math.min(out.length - s0, Math.round(dur * sr));
  if (n <= 0) return 0;
  const tmp = new Float32Array(n);
  let ns = (r.seed32() | 0) || 0x5a5a5a5;
  const rough = smoothRandom((n >> 2) + 2, sr / 4, r.range(110, 260), r);
  const BL = 16;
  const slow = smoothRandom(Math.ceil(n / BL) + 2, sr / BL, r.range(12, 25), r);
  const att = r.range(0.015, 0.04);
  const rel = r.range(0.05, 0.11);
  for (let b = 0; b < n; b += BL) {
    const t = b / sr;
    let env = t < att ? Math.pow(t / att, 1.5) : 1;
    if (t > dur - rel) env *= Math.pow(Math.max(0, (dur - t) / rel), 2);
    env *= (1 - 0.35 * (t / dur)) * (0.75 + 0.25 * slow[b / BL]);
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) {
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const g = 0.5 + 0.65 * rough[(b + i) >> 2];
      tmp[b + i] = g > 0 ? ns * 4.656612873077393e-10 * env * g : 0;
    }
  }
  if (f.hp) filt(tmp, 'highpass', f.hp, 0.7, sr);
  if (f.bp) filt(tmp, 'bandpass', f.bp, f.bpQ ?? 0.8, sr);
  if (f.lp) filt(tmp, 'lowpass', f.lp, 0.7, sr);
  const amp = f.amp ?? 1;
  for (let i = 0; i < n; i++) out[s0 + i] += tmp[i] * amp;
  return n;
}

// ---------------------------------------------------------------- surface layers
function addWetTsk(out, sr, r, s0, amp) {
  addNoiseBurst(out, s0 + Math.round(r.range(0.0005, 0.002) * sr), sr, {
    dur: 0.07, attack: 0.001, tau: r.range(0.008, 0.02), bp: r.range(4200, 7000), bpQ: 0.8, amp, seed: r.seed32(),
  });
  addCrackle(out, s0 + Math.round(0.001 * sr), sr, r, {
    dur: r.range(0.02, 0.045), rate: r.range(500, 1200), amp: amp * 1.3, hp: 2500, lp: 9500,
    shape: (u) => (1 - u) * (1 - u),
  });
}

function addSplash(out, sr, r, s0, size) {
  // surface slap
  addNoiseBurst(out, s0, sr, { dur: 0.05, attack: 0.0004, tau: r.range(0.005, 0.01), bp: r.range(700, 1500), bpQ: 0.7, amp: 0.6 * size, seed: r.seed32() });
  // spray: rough, decaying broadband noise
  const dur = r.range(0.16, 0.3) * (0.75 + 0.25 * size);
  const n = Math.min(out.length - s0, Math.round(dur * sr));
  const tmp = new Float32Array(n);
  let ns = (r.seed32() | 0) || 0x3c3c3c3;
  const rough = smoothRandom((n >> 2) + 2, sr / 4, r.range(60, 130), r);
  const na = Math.max(1, Math.round(r.range(0.003, 0.008) * sr));
  const kd = Math.exp(-1 / ((dur / r.range(3, 4.2)) * sr));
  let env = 1;
  const BL = 32;
  for (let b = 0; b < n; b += BL) {
    const q = b / n;
    const tail = 1 - q * q * q * q;
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) {
      const k = b + i;
      let e;
      if (k < na) e = k / na;
      else { env *= kd; e = env; }
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const rv = rough[k >> 2];
      tmp[k] = ns * 4.656612873077393e-10 * e * tail * (0.35 + 0.65 * (rv < 0 ? -rv : rv));
    }
  }
  filt(tmp, 'highpass', r.range(800, 1100), 0.7, sr);
  filt(tmp, 'lowpass', r.range(5500, 8000), 0.7, sr);
  const sa = 0.34 * size;
  for (let i = 0; i < n; i++) out[s0 + i] += tmp[i] * sa;
  // droplets falling back + entrained bubbles
  const count = Math.round(r.range(6, 13) * size);
  for (let k = 0; k < count; k++) {
    const t = Math.min(dur * 1.3, 0.015 + r.exp(0.075));
    const st = s0 + Math.round(t * sr);
    const fall = Math.exp(-t / 0.18);
    if (r.chance(0.65)) addBubble(out, st, r.logRange(900, 3200), r.range(1.2, 1.9), r.range(0.003, 0.011), r.range(0.05, 0.17) * size * (0.4 + 0.6 * fall), sr);
    else addNoiseBurst(out, st, sr, { dur: 0.004, attack: 0.0001, tau: 0.0006, bp: r.range(2000, 5000), bpQ: 1.2, amp: r.range(0.06, 0.16) * size, seed: r.seed32() });
  }
  // low "plop" of the boot entering water (rising pitch)
  addGlideMode(out, s0 + Math.round(0.003 * sr), r.range(170, 300), r.range(320, 480), 0.015, r.range(0.012, 0.024), 0.22 * size, sr);
}

function addSquelch(out, sr, r, s0, size) {
  const dur = r.range(0.045, 0.1) * size;
  const n = Math.min(out.length - s0, Math.round(dur * sr));
  const svf = new SVF(500, 4, sr);
  let ns = (r.seed32() | 0) || 0x7e7e7e7;
  const fA = r.range(420, 700);
  const fB = r.range(1300, 2300);
  const am = r.range(60, 150);
  const amp = r.range(0.25, 0.4) * size;
  const wc = Math.cos((TAU * am) / sr), ws = Math.sin((TAU * am) / sr);
  let re = 1, im = 0;
  const BL = 16;
  for (let b = 0; b < n; b += BL) {
    const u = b / n;
    svf.set(fA * Math.pow(fB / fA, u), 4, sr);
    const env = Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - u * 0.3) * amp;
    const m = Math.min(BL, n - b);
    for (let i = 0; i < m; i++) {
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      svf.tick(ns * 4.656612873077393e-10 * (0.55 + 0.45 * im));
      const tr = re * wc - im * ws; im = re * ws + im * wc; re = tr;
      out[s0 + b + i] += svf.bp * env;
    }
  }
  // thin film splash
  addNoiseBurst(out, s0, sr, { dur: 0.09, attack: 0.0015, tau: r.range(0.012, 0.025), hp: 2200, lp: 8500, amp: 0.2 * size, seed: r.seed32() });
  const drops = r.int(1, 4);
  for (let k = 0; k < drops; k++) {
    addBubble(out, s0 + Math.round(r.range(0.01, 0.09) * sr), r.logRange(1400, 3500), r.range(1.2, 1.6), r.range(0.002, 0.006), r.range(0.03, 0.08) * size, sr);
  }
}

function addPlate(out, sr, r, s0, o) {
  const nModes = r.int(o.nMin ?? 8, o.nMax ?? 13);
  for (let k = 0; k < nModes; k++) {
    const f = r.logRange(o.lo, o.hi);
    const t60 = r.range(o.t60[0], o.t60[1]) * Math.pow(1200 / f, 0.35);
    const tau = t60 / 6.9;
    const amp = r.range(0.04, 0.2) * o.amp;
    addMode(out, s0, f, tau, amp, sr, 0);
    if (r.chance(0.4)) addMode(out, s0, f * (1 + r.range(0.002, 0.008)), tau * r.range(0.8, 1.1), amp * r.range(0.4, 0.8), sr, 0);
  }
  if (o.hollow) addMode(out, s0, r.range(140, 320), r.range(0.02, 0.045), o.hollow, sr, 0);
}

function addRattle(out, sr, r, s0, o) {
  let gap = r.range(0.014, 0.035);
  let t = gap;
  let a = r.range(0.35, 0.6) * o.amp;
  const n = r.int(o.nMin ?? 2, o.nMax ?? 5);
  for (let i = 0; i < n; i++) {
    const st = s0 + Math.round(t * sr);
    addNoiseBurst(out, st, sr, { dur: 0.004, attack: 0.0001, tau: 0.0004, hp: 1500, lp: 9000, amp: a * 0.45, seed: r.seed32() });
    addMode(out, st, r.range(120, 260), r.range(0.006, 0.014), a * 0.35 * (o.frame ?? 1), sr, 0);
    for (let j = 0; j < 3; j++) addMode(out, st, r.logRange(o.lo, o.hi), r.range(0.01, 0.03), a * r.range(0.05, 0.15), sr, 0);
    gap *= r.range(0.55, 0.8);
    t += gap + r.range(0.004, 0.012);
    a *= r.range(0.45, 0.7);
  }
}

function addCrunch(out, sr, r, s0, o) {
  const n = r.int(o.nMin, o.nMax);
  for (let i = 0; i < n; i++) {
    const t = Math.min(o.span, r.exp(o.mean));
    const st = s0 + Math.round(t * sr);
    const a = o.amp * Math.pow(r.next(), 1.8) * (1 - (0.6 * t) / o.span);
    addNoiseBurst(out, st, sr, { dur: 0.003, attack: 0.00005, tau: r.range(0.0001, 0.0005), hp: o.hp, lp: o.lp, amp: a, seed: r.seed32() });
    if (r.chance(0.5)) addMode(out, st, r.logRange(o.ring[0], o.ring[1]), r.range(0.0006, 0.003), a * 0.6, sr, 0);
  }
  if (o.grit) addCrackle(out, s0, sr, r, { dur: o.span * 0.8, rate: 700, amp: o.grit, hp: 2500, lp: 11000, shape: (u) => 1 - u });
}

function addGlass(out, sr, r, s0, amount) {
  const n = Math.round(r.int(5, 11) * amount);
  for (let i = 0; i < n; i++) {
    const t = Math.min(0.16, r.exp(0.035));
    const st = s0 + Math.round(t * sr);
    const a = Math.pow(r.next(), 1.5) * 0.5 * (1 - t / 0.25);
    addNoiseBurst(out, st, sr, { dur: 0.003, attack: 0.00005, tau: 0.0003, hp: 3000, lp: 12000, amp: a * 0.6, seed: r.seed32() });
    const parts = r.int(1, 3);
    for (let k = 0; k < parts; k++) addMode(out, st, r.logRange(3000, 9500), r.range(0.004, 0.02), a * r.range(0.15, 0.4), sr, 0);
  }
  addCrackle(out, s0, sr, r, { dur: r.range(0.04, 0.1), rate: 900, amp: 0.3 * amount, hp: 3000, lp: 12000, shape: (u) => 1 - u });
}

function addWood(out, sr, r, s0, amp) {
  const f1 = r.range(140, 260);
  const ratios = [1, r.range(2.6, 2.9), r.range(5.1, 5.6), r.range(8.5, 9.3)];
  const w = [0.6, 0.35, 0.2, 0.1];
  for (let k = 0; k < ratios.length; k++) {
    addMode(out, s0, f1 * ratios[k], r.range(0.012, 0.03) / Math.pow(ratios[k], 0.4), amp * w[k] * r.range(0.7, 1.1), sr, 0);
  }
  addMode(out, s0, r.range(420, 900), r.range(0.006, 0.014), amp * 0.45, sr, 0);
  if (r.chance(0.55)) {
    const st = s0 + Math.round(r.range(0.008, 0.022) * sr);
    addNoiseBurst(out, st, sr, { dur: 0.006, attack: 0.0002, tau: 0.001, bp: r.range(800, 1600), bpQ: 1, amp: amp * 0.25, seed: r.seed32() });
    addMode(out, st, f1 * r.range(1.8, 2.2), 0.01, amp * 0.18, sr, 0);
  }
}

function addCardboard(out, sr, r, s0, amp) {
  addNoiseBurst(out, s0, sr, { dur: 0.07, attack: 0.0015, tau: r.range(0.008, 0.016), lp: r.range(700, 1100), hp: 90, amp: amp * 0.7, seed: r.seed32() });
  addMode(out, s0, r.range(160, 320), r.range(0.008, 0.015), amp * 0.45, sr, 0);
  addMode(out, s0, r.range(480, 820), r.range(0.004, 0.008), amp * 0.2, sr, 0);
  addCrackle(out, s0 + Math.round(0.003 * sr), sr, r, {
    dur: r.range(0.05, 0.12), rate: r.range(60, 160), amp: amp * 0.28, bp: r.range(1500, 3500), bpQ: 0.7,
    grainMax: 0.0008, shape: (u) => 1 - u,
  });
  addNoiseBurst(out, s0 + Math.round(0.004 * sr), sr, { dur: 0.06, attack: 0.006, tau: 0.012, bp: r.range(500, 900), bpQ: 1.2, amp: amp * 0.25, seed: r.seed32() });
}

function addSqueak(out, sr, r, s0, amp) {
  const dur = r.range(0.04, 0.09);
  const n = Math.round(dur * sr);
  const f0 = r.range(900, 1800);
  const vib = r.range(25, 45);
  let ph = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const u = i / n;
    const f = f0 * (1 + 0.04 * Math.sin((TAU * vib * i) / sr) + 0.1 * u);
    ph += (TAU * f) / sr;
    const env = Math.sin(Math.PI * u);
    out[s0 + i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph)) * env * amp;
  }
}

// ---------------------------------------------------------------- per-surface builders
function buildHeel(surf, r, sr) {
  const p = P[surf];
  const out = new Float32Array(Math.round(p.len * sr));
  const s0 = 2;
  heelCore(out, sr, r, p, s0);
  switch (surf) {
    case 'asphalt': addWetTsk(out, sr, r, s0, r.range(0.09, 0.15)); break;
    case 'concrete':
      if (r.chance(0.6)) addCrackle(out, s0, sr, r, { dur: 0.02, rate: 400, amp: 0.12, hp: 3000, lp: 12000, shape: (u) => 1 - u });
      break;
    case 'metal':
      addPlate(out, sr, r, s0, { lo: 800, hi: 4000, t60: [0.15, 0.4], amp: 0.9, hollow: r.range(0.15, 0.3) });
      if (r.chance(0.6)) addRattle(out, sr, r, s0, { lo: 900, hi: 3500, amp: 0.45, nMin: 1, nMax: 2, frame: 0.6 });
      break;
    case 'grate':
      addPlate(out, sr, r, s0, { lo: 1000, hi: 4200, t60: [0.12, 0.3], amp: 0.75, nMin: 6, nMax: 10, hollow: r.range(0.08, 0.16) });
      addRattle(out, sr, r, s0, { lo: 900, hi: 3800, amp: 0.85, nMin: 2, nMax: 5, frame: 1 });
      break;
    case 'puddle': addSplash(out, sr, r, s0, r.range(0.8, 1.05)); break;
    case 'wet': addSquelch(out, sr, r, s0, r.range(0.6, 0.9)); addWetTsk(out, sr, r, s0, 0.08); break;
    case 'debris': addCrunch(out, sr, r, s0, { nMin: 15, nMax: 35, mean: 0.03, span: 0.12, amp: 0.55, hp: 1500, lp: 9000, ring: [2000, 7000], grit: 0.08 }); break;
    case 'glass': addGlass(out, sr, r, s0, 1); break;
    case 'wood': addWood(out, sr, r, s0, 0.75); break;
    case 'cardboard': addCardboard(out, sr, r, s0, 0.9); break;
  }
  return out;
}

function buildToe(surf, r, sr) {
  const p = P[surf];
  const out = new Float32Array(Math.round(Math.max(0.2, p.len) * sr * 1.1));
  const s0 = 2;
  toeCore(out, sr, r, p, s0);
  switch (surf) {
    case 'asphalt': addWetTsk(out, sr, r, s0 + Math.round(0.003 * sr), r.range(0.1, 0.17)); break;
    case 'concrete': addCrackle(out, s0, sr, r, { dur: 0.04, rate: 500, amp: 0.1, hp: 3000, lp: 12000, shape: (u) => 1 - u }); break;
    case 'metal':
      addPlate(out, sr, r, s0, { lo: 700, hi: 3200, t60: [0.12, 0.3], amp: 0.45, nMin: 6, nMax: 9, hollow: r.range(0.15, 0.3) });
      break;
    case 'grate':
      addPlate(out, sr, r, s0, { lo: 900, hi: 3600, t60: [0.1, 0.25], amp: 0.4, nMin: 5, nMax: 8, hollow: 0.1 });
      addRattle(out, sr, r, s0, { lo: 900, hi: 3600, amp: 0.7, nMin: 2, nMax: 4, frame: 1 });
      break;
    case 'puddle': addSplash(out, sr, r, s0, r.range(1.1, 1.45)); break;
    case 'wet': addSquelch(out, sr, r, s0, r.range(0.9, 1.25)); break;
    case 'debris': addCrunch(out, sr, r, s0, { nMin: 20, nMax: 45, mean: 0.045, span: 0.16, amp: 0.6, hp: 1200, lp: 8000, ring: [1800, 6500], grit: 0.1 }); break;
    case 'glass': addGlass(out, sr, r, s0, 1.4); break;
    case 'wood': addWood(out, sr, r, s0, 0.55); break;
    case 'cardboard': addCardboard(out, sr, r, s0, 1.1); break;
  }
  return out;
}

const SCUFF = {
  asphalt: { bp: 1900, bpQ: 0.7, hp: 500, lp: 7000 },
  concrete: { bp: 3200, bpQ: 0.6, hp: 900, lp: 11000 },
  metal: { bp: 2500, bpQ: 0.8, hp: 800, lp: 9000 },
  grate: { bp: 2200, bpQ: 0.8, hp: 700, lp: 9000 },
  puddle: { bp: 1100, bpQ: 0.6, hp: 250, lp: 4000 },
  wet: { bp: 1500, bpQ: 0.6, hp: 350, lp: 6000 },
  debris: { bp: 2600, bpQ: 0.6, hp: 700, lp: 9000 },
  glass: { bp: 3800, bpQ: 0.7, hp: 1500, lp: 12000 },
  wood: { bp: 1000, bpQ: 0.9, hp: 250, lp: 5000 },
  cardboard: { bp: 1300, bpQ: 0.7, hp: 300, lp: 5000 },
};

function buildScuff(surf, r, sr) {
  const dur = r.range(0.13, 0.28);
  const out = new Float32Array(Math.round((dur + 0.35) * sr));
  const s0 = 2;
  const f = SCUFF[surf];
  scuffCore(out, sr, r, s0, dur, { ...f, bp: f.bp * r.range(0.8, 1.25), amp: 1 });
  switch (surf) {
    case 'metal':
    case 'grate': {
      // metallic scrape: excite a few resonances with the friction
      for (let k = 0; k < 4; k++) addMode(out, s0 + Math.round(r.range(0, dur) * sr), r.logRange(1200, 4500), r.range(0.02, 0.08), r.range(0.05, 0.12), sr, 0);
      if (surf === 'grate') {
        const bars = r.int(3, 6);
        for (let k = 0; k < bars; k++) {
          const st = s0 + Math.round(((k + r.range(0.2, 0.8)) / bars) * dur * sr);
          addNoiseBurst(out, st, sr, { dur: 0.003, attack: 0.0001, tau: 0.0004, hp: 1500, lp: 9000, amp: 0.35, seed: r.seed32() });
          addMode(out, st, r.range(1500, 3500), r.range(0.006, 0.02), 0.12, sr, 0);
        }
      }
      break;
    }
    case 'puddle': {
      const drops = r.int(3, 7);
      for (let k = 0; k < drops; k++) addBubble(out, s0 + Math.round(r.range(0.01, dur + 0.1) * sr), r.logRange(800, 2600), r.range(1.2, 1.7), r.range(0.003, 0.01), r.range(0.05, 0.14), sr);
      break;
    }
    case 'wet':
      if (r.chance(0.35)) addSqueak(out, sr, r, s0 + Math.round(r.range(0.02, dur * 0.6) * sr), r.range(0.08, 0.16));
      break;
    case 'debris':
      addCrunch(out, sr, r, s0, { nMin: 15, nMax: 30, mean: dur * 0.4, span: dur, amp: 0.45, hp: 1200, lp: 8000, ring: [2000, 6000] });
      break;
    case 'glass':
      addGlass(out, sr, r, s0, 0.9);
      break;
    case 'cardboard':
      addCrackle(out, s0, sr, r, { dur, rate: 120, amp: 0.3, bp: 2500, bpQ: 0.7, grainMax: 0.0008, shape: (u) => 1 - 0.5 * u });
      break;
    default:
      break;
  }
  return out;
}

function finalize(x, sr, r) {
  dcBlock(x, sr, 30);
  let y = trimTail(x, sr, 2e-4);
  fadeOut(y, Math.round(0.003 * sr));
  normalizePeak(y, 0.95 * r.range(0.86, 1.0));
  return y;
}

/** Clothing rustle (very quiet fabric swish), mono. */
function buildCloth(r, sr) {
  const dur = r.range(0.18, 0.32);
  const out = new Float32Array(Math.round((dur + 0.02) * sr));
  scuffCore(out, sr, r, 0, dur, { bp: r.range(1400, 3200), bpQ: 0.6, hp: 600, lp: 8000, amp: 1 });
  addCrackle(out, Math.round(r.range(0.02, dur * 0.5) * sr), sr, r, { dur: dur * 0.5, rate: 60, amp: 0.4, hp: 1500, lp: 7000, grainMax: 0.001, shape: (u) => 1 - u });
  return finalize(out, sr, r);
}

/**
 * Synthesize the full footstep bank. Returns { [surface]: { heel: Float32Array[], toe: [...], scuff: [...] }, cloth: [...] , sr }
 */
export async function synthFootsteps(seed, sr, y, counts = { heel: 8, toe: 8, scuff: 8, cloth: 6 }) {
  const bank = { sr };
  for (const surf of SURFACES) {
    bank[surf] = { heel: [], toe: [], scuff: [] };
    const r = deriveRng(seed, 'fs-' + surf);
    for (let i = 0; i < counts.heel; i++) bank[surf].heel.push(finalize(buildHeel(surf, r, sr), sr, r));
    await y();
    for (let i = 0; i < counts.toe; i++) bank[surf].toe.push(finalize(buildToe(surf, r, sr), sr, r));
    await y();
    for (let i = 0; i < counts.scuff; i++) bank[surf].scuff.push(finalize(buildScuff(surf, r, sr), sr, r));
    await y();
  }
  const rc = deriveRng(seed, 'fs-cloth');
  bank.cloth = [];
  for (let i = 0; i < counts.cloth; i++) bank.cloth.push(buildCloth(rc, sr));
  return bank;
}

export { monoSound };
