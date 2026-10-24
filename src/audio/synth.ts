// Offline synthesis of one-shot sound effects into AudioBuffers using small
// JS DSP primitives (noise, oscillators, biquads, envelopes). No samples are
// shipped; every crash, crunch and tinkle is generated at startup.

export type SynthFn = (sr: number, seed: number) => Float32Array;

class Rnd {
  s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return ((this.s >>> 0) / 4294967296);
  }
  bi(): number {
    return this.next() * 2 - 1;
  }
}

/** RBJ biquad */
class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  static bandpass(sr: number, f: number, q: number): Biquad {
    const b = new Biquad();
    const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const a0 = 1 + al;
    b.b0 = al / a0; b.b1 = 0; b.b2 = -al / a0; b.a1 = (-2 * c) / a0; b.a2 = (1 - al) / a0;
    return b;
  }
  static lowpass(sr: number, f: number, q = 0.707): Biquad {
    const b = new Biquad();
    const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const a0 = 1 + al;
    b.b0 = (1 - c) / 2 / a0; b.b1 = (1 - c) / a0; b.b2 = (1 - c) / 2 / a0; b.a1 = (-2 * c) / a0; b.a2 = (1 - al) / a0;
    return b;
  }
  static highpass(sr: number, f: number, q = 0.707): Biquad {
    const b = new Biquad();
    const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const a0 = 1 + al;
    b.b0 = (1 + c) / 2 / a0; b.b1 = -(1 + c) / a0; b.b2 = (1 + c) / 2 / a0; b.a1 = (-2 * c) / a0; b.a2 = (1 - al) / a0;
    return b;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

function softClip(x: number, drive: number): number {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

/** Heavy crash: low thump + resonant metal crunch + rattling debris. */
export const crashHeavy: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 1.6);
  const out = new Float32Array(len);
  const res = [180, 410, 730, 1180, 1750, 2600, 3900].map((f) => Biquad.bandpass(sr, f * (0.8 + r.next() * 0.4), 6 + r.next() * 10));
  const thumpF = 55 + r.next() * 30;
  const lp = Biquad.lowpass(sr, 5000);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const n = r.bi();
    // thump
    ph += (2 * Math.PI * thumpF * (1 + 1.5 * Math.exp(-t * 18))) / sr;
    const thump = Math.sin(ph) * Math.exp(-t * 9) * 1.4;
    // crunch: noise burst through resonators with crackle modulation
    const crackle = r.next() < 0.02 * Math.exp(-t * 3) ? r.bi() * 4 : 0;
    const env = Math.exp(-t * 4.5) * (t < 0.004 ? t / 0.004 : 1);
    let met = 0;
    for (const b of res) met += b.run((n + crackle) * env);
    // late rattles
    const rattle = r.next() < 0.004 * Math.exp(-t * 2) ? r.bi() * 0.6 : 0;
    out[i] = softClip(lp.run(thump + met * 0.9 + rattle + n * env * 0.25), 1.6);
  }
  return normalize(out, 0.95);
};

/** Lighter impact: short bang. */
export const crashLight: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.6);
  const out = new Float32Array(len);
  const res = [320, 860, 1500, 2900, 4300].map((f) => Biquad.bandpass(sr, f * (0.8 + r.next() * 0.5), 8 + r.next() * 8));
  let ph = 0;
  const f0 = 90 + r.next() * 60;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const n = r.bi();
    ph += (2 * Math.PI * f0) / sr;
    const env = Math.exp(-t * 11);
    let met = 0;
    for (const b of res) met += b.run(n * env);
    out[i] = met * 0.9 + Math.sin(ph) * Math.exp(-t * 20) * 0.8 + n * env * 0.15;
  }
  return normalize(out, 0.85);
};

/** Metal deformation creak/crunch (granular). */
export const crunch: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.7);
  const out = new Float32Array(len);
  const bp = Biquad.bandpass(sr, 900 + r.next() * 1200, 3);
  const bp2 = Biquad.bandpass(sr, 2500 + r.next() * 2000, 5);
  let grain = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    if (r.next() < 0.0025) grain = 1;
    grain *= 0.996;
    const n = r.bi() * grain;
    const env = Math.min(1, t * 40) * Math.exp(-t * 3.5);
    out[i] = (bp.run(n) * 1.2 + bp2.run(n) * 0.6) * env;
  }
  return normalize(out, 0.7);
};

/** Glass shatter: bright noise burst + tinkles. */
export const glass: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 1.4);
  const out = new Float32Array(len);
  const hp = Biquad.highpass(sr, 2500);
  const tinkles: { t: number; f: number; a: number }[] = [];
  for (let k = 0; k < 70; k++) tinkles.push({ t: Math.pow(r.next(), 2) * 1.0, f: 2500 + r.next() * 7000, a: 0.2 + r.next() * 0.6 });
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const burst = hp.run(r.bi()) * Math.exp(-t * 14) * 1.2;
    let tk = 0;
    for (const k of tinkles) {
      const dt = t - k.t;
      if (dt > 0 && dt < 0.12) tk += Math.sin(2 * Math.PI * k.f * dt) * Math.exp(-dt * 45) * k.a;
    }
    out[i] = burst + tk * 0.5;
  }
  return normalize(out, 0.8);
};

/** Heavy metal clang (inharmonic partials). */
export const metalHit: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 1.8);
  const out = new Float32Array(len);
  const f0 = 120 + r.next() * 120;
  const partials = [1, 2.76, 5.4, 8.93, 13.3].map((m, i) => ({ f: f0 * m * (1 + (r.next() - 0.5) * 0.02), a: 1 / (i + 1), d: 2.2 + i * 1.5 }));
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (const p of partials) s += Math.sin(2 * Math.PI * p.f * t) * p.a * Math.exp(-t * p.d);
    const click = r.bi() * Math.exp(-t * 80) * 0.8;
    out[i] = s + click;
  }
  return normalize(out, 0.8);
};

/** Dull thud (landing, body slam). */
export const thud: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.5);
  const out = new Float32Array(len);
  const lp = Biquad.lowpass(sr, 400);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * (60 + 40 * Math.exp(-t * 25))) / sr;
    out[i] = Math.sin(ph) * Math.exp(-t * 12) + lp.run(r.bi()) * Math.exp(-t * 18) * 1.5;
  }
  return normalize(out, 0.85);
};

export const whoosh: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 1.1);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = 300 + 900 * Math.sin(Math.PI * Math.min(1, t / 1.0));
    const bp = whooshBp(sr, f);
    const env = Math.sin(Math.PI * Math.min(1, t / 1.0)) ** 2;
    out[i] = bp.run(r.bi()) * env;
  }
  return normalize(out, 0.7);
};
let wbp: Biquad | null = null;
let wbpF = 0;
function whooshBp(sr: number, f: number): Biquad {
  if (!wbp || Math.abs(f - wbpF) > 20) {
    const nb = Biquad.bandpass(sr, f, 1.2);
    if (wbp) {
      nb.x1 = wbp.x1; nb.x2 = wbp.x2; nb.y1 = wbp.y1; nb.y2 = wbp.y2;
    }
    wbp = nb;
    wbpF = f;
  }
  return wbp;
}

export const hiss: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.8);
  const out = new Float32Array(len);
  const hp = Biquad.highpass(sr, 1800);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    out[i] = hp.run(r.bi()) * Math.min(1, t * 30) * Math.exp(-t * 4);
  }
  return normalize(out, 0.5);
};

export const hydraulic: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 1.4);
  const out = new Float32Array(len);
  const lp = Biquad.lowpass(sr, 700);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * (70 + 30 * Math.sin(t * 3))) / sr;
    const env = Math.min(1, t * 6) * Math.exp(-t * 1.5);
    out[i] = (Math.sin(ph) * 0.6 + lp.run(r.bi()) * 0.8 + Math.sign(Math.sin(ph * 2)) * 0.1) * env;
  }
  return normalize(out, 0.6);
};

export const piston: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.6);
  const out = new Float32Array(len);
  const bp = Biquad.bandpass(sr, 900, 2);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const blast = bp.run(r.bi()) * Math.exp(-t * 10) * 1.5;
    const clank = Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 15) * (t > 0.05 ? 1 : 0);
    out[i] = blast + clank * 0.6;
  }
  return normalize(out, 0.75);
};

export const beep: SynthFn = (sr) => {
  const len = Math.floor(sr * 0.35);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const on = (t < 0.12 || (t > 0.2 && t < 0.32)) ? 1 : 0;
    out[i] = Math.sign(Math.sin(2 * Math.PI * 1300 * t)) * 0.3 * on;
  }
  return out;
};

export const release: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.7);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const clunk = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 14);
    const chain = r.next() < 0.03 * Math.exp(-t * 5) ? r.bi() : 0;
    out[i] = clunk + chain * 0.8 + r.bi() * Math.exp(-t * 40) * 0.4;
  }
  return normalize(out, 0.75);
};

/** Tire burst / pop. */
export const pop: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.9);
  const out = new Float32Array(len);
  const lp = Biquad.lowpass(sr, 1800);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const bang = r.bi() * Math.exp(-t * 60) * 2;
    const hissS = r.bi() * Math.exp(-t * 3) * 0.35 * (t > 0.02 ? 1 : 0);
    out[i] = lp.run(bang) + hissS;
  }
  return normalize(out, 0.85);
};

/** Part tearing off: screech + clank. */
export const tear: SynthFn = (sr, seed) => {
  const r = new Rnd(seed);
  const len = Math.floor(sr * 0.9);
  const out = new Float32Array(len);
  const bp = Biquad.bandpass(sr, 1400 + r.next() * 800, 9);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const screech = bp.run(r.bi()) * Math.exp(-t * 6) * 2.5;
    const clank = Math.sin(2 * Math.PI * (260 + r.next() * 2) * t) * Math.exp(-t * 9) * 0.6;
    out[i] = screech + clank;
  }
  return normalize(out, 0.8);
};

export const horn: SynthFn = (sr) => {
  const len = Math.floor(sr * 0.6);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 40) * Math.min(1, (0.6 - t) * 30);
    out[i] = (Math.sign(Math.sin(2 * Math.PI * 420 * t)) * 0.5 + Math.sign(Math.sin(2 * Math.PI * 520 * t)) * 0.5) * env * 0.4;
  }
  return out;
};

/** Seamless noise loop for continuous sounds. */
export function noiseLoop(sr: number, seconds: number, color: 'white' | 'pink' | 'brown', seed = 1): Float32Array {
  const r = new Rnd(seed);
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = r.bi();
    if (color === 'white') out[i] = w * 0.5;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    } else {
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  }
  // crossfade ends for seamless looping
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = out[i] * a + out[len - fade + i] * (1 - a);
  }
  return out.subarray(0, len - fade);
}

export const SFX: Record<string, { fn: SynthFn; variants: number }> = {
  crashHeavy: { fn: crashHeavy, variants: 4 },
  crashLight: { fn: crashLight, variants: 4 },
  crunch: { fn: crunch, variants: 4 },
  glass: { fn: glass, variants: 3 },
  metalHit: { fn: metalHit, variants: 3 },
  thud: { fn: thud, variants: 3 },
  whoosh: { fn: whoosh, variants: 2 },
  hiss: { fn: hiss, variants: 1 },
  hydraulic: { fn: hydraulic, variants: 1 },
  piston: { fn: piston, variants: 2 },
  beep: { fn: beep, variants: 1 },
  release: { fn: release, variants: 2 },
  pop: { fn: pop, variants: 2 },
  tear: { fn: tear, variants: 3 },
  horn: { fn: horn, variants: 1 },
};
