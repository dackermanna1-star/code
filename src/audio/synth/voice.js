// Formant "babble" synthesizer: unintelligible speech-like utterances, back-channels and laughter.
// Glottal pulse source (with jitter/shimmer) -> cascade of 4 Klatt resonators, plus aspiration and
// frication noise. Rendered offline into Float32Arrays (low sample rate is fine: it gets muffled).
import { TAU, clamp, filt } from '../lib/dsp.js';
import { noiseGen } from '../lib/rng.js';

const VOWELS = {
  i: [270, 2290, 3010, 3500], I: [390, 1990, 2550, 3500], e: [530, 1840, 2480, 3500],
  ae: [660, 1720, 2410, 3500], a: [730, 1090, 2440, 3400], o: [570, 840, 2410, 3400],
  U: [440, 1020, 2240, 3300], u: [300, 870, 2240, 3300], V: [640, 1190, 2390, 3400],
  er: [490, 1350, 1690, 3300], schwa: [500, 1500, 2500, 3500],
};
const VKEYS = Object.keys(VOWELS);
const BW = [75, 105, 150, 230];
// Glottal flow pulse (Rosenberg-like) lookup table: open phase 0.42, closing 0.16
const GLOT = new Float32Array(1025);
for (let i = 0; i <= 1024; i++) {
  const p = i / 1024;
  GLOT[i] = p < 0.42 ? 0.5 * (1 - Math.cos((Math.PI * p) / 0.42)) : p < 0.58 ? Math.cos((Math.PI * 0.5 * (p - 0.42)) / 0.16) : 0;
}

export function makeSpeaker(r, kind) {
  if (kind === 'female') {
    return { kind, f0: r.range(175, 225), fs: r.range(1.12, 1.2), breath: r.range(0.06, 0.12), loud: r.range(0.75, 1.0), laughF0: r.range(280, 360), rate: r.range(4.3, 5.6) };
  }
  if (kind === 'child') {
    return { kind, f0: r.range(240, 290), fs: r.range(1.25, 1.32), breath: 0.08, loud: 0.8, laughF0: r.range(330, 420), rate: r.range(4.0, 5.0) };
  }
  return { kind: 'male', f0: r.range(92, 130), fs: r.range(0.96, 1.04), breath: r.range(0.04, 0.08), loud: r.range(0.8, 1.0), laughF0: r.range(165, 230), rate: r.range(3.8, 5.0) };
}

function vowelF(key, spk, r) {
  const v = VOWELS[key];
  return [v[0] * spk.fs * r.range(0.94, 1.06), v[1] * spk.fs * r.range(0.95, 1.05), v[2] * spk.fs * r.range(0.97, 1.03), v[3] * spk.fs];
}

/** Build a phone list for an utterance starting at t (s), roughly `dur` long. */
export function makeUtterance(r, spk, t, dur, o = {}) {
  const phones = [];
  const nSyl = Math.max(1, Math.round(dur * spk.rate * r.range(0.85, 1.1)));
  const question = r.chance(o.questionProb ?? 0.22);
  const excite = o.excite ?? r.range(0.9, 1.2);
  let time = t;
  let stressCount = r.int(1, 3);
  const f0Start = spk.f0 * r.range(1.05, 1.18) * excite;
  const f0End = spk.f0 * r.range(0.8, 0.9);
  let prevF = null;
  for (let s = 0; s < nSyl; s++) {
    const u = s / Math.max(1, nSyl - 1);
    let f0 = f0Start + (f0End - f0Start) * u;
    let sd = (1 / spk.rate) * r.range(0.7, 1.3);
    let amp = spk.loud * r.range(0.75, 1.0);
    if (--stressCount <= 0) {
      stressCount = r.int(2, 4);
      sd *= 1.3; f0 *= r.range(1.12, 1.3); amp *= 1.2;
    }
    const last = s === nSyl - 1;
    let f0b = f0 * r.range(0.96, 1.02);
    if (last) { f0b = question ? f0 * r.range(1.2, 1.35) : f0 * r.range(0.78, 0.88); sd *= 1.25; }
    const vk = r.pick(VKEYS);
    const F = vowelF(vk, spk, r);
    // onset consonant
    const kind = r.pick(['none', 'stop', 'stop', 'fric', 'nasal', 'h', 'approx', 'approx']);
    let ct = 0;
    if (kind === 'stop') {
      const clo = r.range(0.02, 0.045);
      phones.push({ t0: time, t1: time + clo, F: prevF || F, av: 0, ah: 0, af: 0, ff: 3000, f0a: f0, f0b: f0 });
      phones.push({ t0: time + clo, t1: time + clo + 0.012, F, av: 0, ah: 0.15, af: 0.5, ff: r.range(1500, 4000), f0a: f0, f0b: f0 });
      ct = clo + 0.012;
    } else if (kind === 'fric') {
      const fd = r.range(0.045, 0.09);
      phones.push({ t0: time, t1: time + fd, F: prevF || F, av: r.chance(0.4) ? 0.25 : 0, ah: 0.05, af: 0.45, ff: r.range(2500, 5500), f0a: f0, f0b: f0 });
      ct = fd;
    } else if (kind === 'nasal') {
      const nd = r.range(0.04, 0.07);
      phones.push({ t0: time, t1: time + nd, F: [260 * spk.fs, r.range(900, 1700) * spk.fs, 2400 * spk.fs, 3300 * spk.fs], av: 0.45, ah: 0, af: 0, ff: 3000, f0a: f0, f0b: f0 });
      ct = nd;
    } else if (kind === 'h') {
      const hd = r.range(0.03, 0.06);
      phones.push({ t0: time, t1: time + hd, F, av: 0, ah: 0.55, af: 0, ff: 3000, f0a: f0, f0b: f0 });
      ct = hd;
    } else if (kind === 'approx') {
      const ad = r.range(0.035, 0.06);
      phones.push({ t0: time, t1: time + ad, F: [300 * spk.fs, r.pick([700, 1100, 1300]) * spk.fs, r.pick([1600, 2200, 2600]) * spk.fs, 3300 * spk.fs], av: 0.6, ah: 0, af: 0, ff: 3000, f0a: f0, f0b: f0 });
      ct = ad;
    }
    const vd = Math.max(0.05, sd - ct);
    phones.push({ t0: time + ct, t1: time + ct + vd, F, av: amp, ah: spk.breath, af: 0, ff: 3000, f0a: f0, f0b });
    prevF = F;
    time += sd;
    // occasional word gap
    if (!last && r.chance(0.18)) time += r.range(0.03, 0.09);
  }
  return { phones, end: time };
}

/** Laughter bout: series of aspirated "ha" pulses with descending pitch. */
export function makeLaugh(r, spk, t, o = {}) {
  const phones = [];
  const n = o.pulses ?? r.int(4, 9);
  let f0 = spk.laughF0 * r.range(0.95, 1.15);
  let amp = spk.loud * r.range(0.9, 1.15) * (o.amp ?? 1);
  const vk = r.pick(['a', 'V', 'ae', 'e', 'i']);
  let time = t;
  const period = r.range(0.17, 0.23);
  for (let k = 0; k < n; k++) {
    const F = vowelF(vk, spk, r);
    const hd = r.range(0.025, 0.045);
    const vd = r.range(0.07, 0.12);
    phones.push({ t0: time, t1: time + hd, F, av: amp * 0.15, ah: amp * 0.7, af: 0, ff: 3000, f0a: f0, f0b: f0 });
    phones.push({ t0: time + hd, t1: time + hd + vd, F, av: amp, ah: amp * 0.35, af: 0, ff: 3000, f0a: f0 * 1.04, f0b: f0 * 0.93 });
    time += period * r.range(0.9, 1.1);
    f0 *= r.range(0.94, 0.985);
    amp *= r.range(0.82, 0.95);
  }
  if (r.chance(0.35)) {
    // breathy inhale
    phones.push({ t0: time + 0.05, t1: time + 0.05 + r.range(0.2, 0.35), F: vowelF('i', spk, r), av: 0, ah: amp * 0.35, af: 0.1, ff: 4000, f0a: f0, f0b: f0 });
    time += 0.4;
  }
  return { phones, end: time };
}

/** Render phones of one speaker additively into `out`. */
export function renderPhones(out, sr, r, spk, phones, gain = 1) {
  if (!phones.length) return;
  const tStart = Math.max(0, phones[0].t0 - 0.02);
  const tEnd = phones[phones.length - 1].t1 + 0.06;
  const i0 = Math.max(0, Math.floor(tStart * sr));
  const i1 = Math.min(out.length, Math.ceil(tEnd * sr));
  if (i1 <= i0) return;
  let ns = (r.seed32() | 0) || 0x1234567;
  const BLK = 32;
  const kF = 1 - Math.exp(-BLK / (0.022 * sr));
  const kA = 1 - Math.exp(-1 / (0.007 * sr));
  const kP = 1 - Math.exp(-1 / (0.03 * sr));
  const F = phones[0].F.slice();
  const ex = BW.map((bw) => Math.exp((-Math.PI * bw) / sr));
  const Cc = BW.map((bw) => -Math.exp((-TAU * bw) / sr));
  let A0 = 0, B0 = 0, A1 = 0, B1 = 0, A2 = 0, B2 = 0, A3 = 0, B3 = 0;
  const C0 = Cc[0], C1 = Cc[1], C2 = Cc[2], C3 = Cc[3];
  let y0a = 0, y0b = 0, y1a = 0, y1b = 0, y2a = 0, y2b = 0, y3a = 0, y3b = 0;
  let p = 0;
  let av = 0, ah = 0, af = 0;
  let f0 = phones[0].f0a;
  let phase = r.next();
  let prevG = 0;
  let fy1 = 0, fy2 = 0, fx1 = 0, fx2 = 0;
  let fb0 = 0, fa1 = 0, fa2 = 0;
  let curFF = -1;
  const lim = sr * 0.45;
  for (let b = i0; b < i1; b += BLK) {
    const t = b / sr;
    while (p < phones.length - 1 && t >= phones[p].t1) p++;
    const ph = phones[p];
    const inside = t >= ph.t0 && t < ph.t1;
    const T = ph.F;
    F[0] += (T[0] - F[0]) * kF; F[1] += (T[1] - F[1]) * kF; F[2] += (T[2] - F[2]) * kF; F[3] += (T[3] - F[3]) * kF;
    B0 = 2 * ex[0] * Math.cos((TAU * Math.min(F[0], lim)) / sr); A0 = 1 - B0 - C0;
    B1 = 2 * ex[1] * Math.cos((TAU * Math.min(F[1], lim)) / sr); A1 = 1 - B1 - C1;
    B2 = 2 * ex[2] * Math.cos((TAU * Math.min(F[2], lim)) / sr); A2 = 1 - B2 - C2;
    B3 = 2 * ex[3] * Math.cos((TAU * Math.min(F[3], lim)) / sr); A3 = 1 - B3 - C3;
    if (ph.ff !== curFF) {
      curFF = ph.ff;
      const w0 = (TAU * Math.min(curFF, lim)) / sr;
      const alpha = Math.sin(w0) / 2.4;
      const a0 = 1 + alpha;
      fb0 = alpha / a0; fa1 = (-2 * Math.cos(w0)) / a0; fa2 = (1 - alpha) / a0;
    }
    ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
    const jitter = 1 + ns * 4.656612873077393e-10 * 0.012;
    const tav = inside ? ph.av : 0;
    const tah = inside ? ph.ah : 0;
    const taf = inside ? ph.af : 0;
    const dur = Math.max(1e-3, ph.t1 - ph.t0);
    const u = inside ? Math.min(1, Math.max(0, (t - ph.t0) / dur)) : 1;
    const tf0 = ph.f0a + (ph.f0b - ph.f0a) * u;
    const m = Math.min(BLK, i1 - b);
    for (let i = 0; i < m; i++) {
      av += (tav - av) * kA;
      ah += (tah - ah) * kA;
      af += (taf - af) * kA;
      f0 += (tf0 - f0) * kP;
      phase += (f0 * jitter) / sr;
      if (phase >= 1) phase -= 1;
      const g = GLOT[(phase * 1024) | 0];
      const e = (g - prevG) * (sr / (f0 * 6));
      prevG = g;
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const n1 = ns * 4.656612873077393e-10;
      let x = e * av + n1 * ah * 0.35 * (0.6 + 0.4 * g);
      let y = A0 * x + B0 * y0a + C0 * y0b; y0b = y0a; y0a = y; x = y;
      y = A1 * x + B1 * y1a + C1 * y1b; y1b = y1a; y1a = y; x = y;
      y = A2 * x + B2 * y2a + C2 * y2b; y2b = y2a; y2a = y; x = y;
      y = A3 * x + B3 * y3a + C3 * y3b; y3b = y3a; y3a = y; x = y;
      let fy = 0;
      if (af > 1e-5 || fy1 > 1e-7 || fy1 < -1e-7) {
        ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
        const fn = ns * 4.656612873077393e-10 * af;
        fy = fb0 * fn - fb0 * fx2 - fa1 * fy1 - fa2 * fy2;
        fx2 = fx1; fx1 = fn; fy2 = fy1; fy1 = fy;
      }
      out[b + i] += (x + fy * 0.6) * gain;
    }
  }
}

/**
 * Render a multi-speaker conversation (turn-taking, back-channels, laughter) of `dur` seconds.
 * o: { turnProb, laughProb, uttMin, uttMax, gapMin, gapMax, overlapProb }
 */
export function renderConversation(r, sr, dur, speakers, o = {}) {
  const out = new Float32Array(Math.round(dur * sr));
  let t = r.range(0.1, 0.4);
  let cur = 0;
  let guard = 0;
  while (t < dur - 0.6 && guard++ < 2000) {
    if (speakers.length > 1 && r.chance(o.turnProb ?? 0.6)) cur = (cur + 1 + r.int(0, speakers.length - 2)) % speakers.length;
    const spk = speakers[cur];
    const g = spk.gain ?? 1;
    if (r.chance(o.laughProb ?? 0.12)) {
      const L = makeLaugh(r, spk, t);
      renderPhones(out, sr, r, spk, L.phones, g);
      // contagious laughter
      if (speakers.length > 1 && r.chance(0.45)) {
        const other = speakers[(cur + 1) % speakers.length];
        const L2 = makeLaugh(r, other, t + r.range(0.1, 0.4), { amp: 0.8 });
        renderPhones(out, sr, r, other, L2.phones, other.gain ?? 1);
      }
      t = L.end + r.range(0.2, 0.6);
      continue;
    }
    const U = makeUtterance(r, spk, t, r.range(o.uttMin ?? 0.6, o.uttMax ?? 3.0), o);
    renderPhones(out, sr, r, spk, U.phones, g);
    if (speakers.length > 1 && r.chance(o.overlapProb ?? 0.15)) {
      const other = speakers[(cur + 1) % speakers.length];
      const B = makeUtterance(r, other, U.end - r.range(0.1, 0.35), r.range(0.2, 0.45), { questionProb: 0 });
      renderPhones(out, sr, r, other, B.phones, (other.gain ?? 1) * 0.7);
    }
    let gap = r.range(o.gapMin ?? 0.15, o.gapMax ?? 0.8);
    if (r.chance(0.12)) gap *= 3;
    t = U.end + gap;
  }
  return out;
}

/** Simple speech band shaping used before muffling (removes rumble from the glottal model). */
export function voiceBand(x, sr) {
  filt(x, 'highpass', 90, 0.7, sr);
  return x;
}
