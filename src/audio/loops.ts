// Continuous loop recipes (sizzle, boil, blender, room tone...).
//
// Each loop is one or more mono layers with co-prime-ish lengths (e.g. 3.1 s + 4.3 s) so their
// combination takes a long time to repeat. Layers are built to be *exactly* seamless:
//  - noise beds are generated as a looped white sequence and filtered circularly (two passes),
//  - hums use frequencies quantised to an integer number of cycles per loop,
//  - one-shot events (crackles, bubbles) are placed with wrap-around.
// Sparse, recognisable events (bird chirps, oven ticks, freezer tinkles) are NOT baked into the
// loop: they're rendered as variants and scattered at random intervals at runtime.

import type { LoopName } from './types';
import {
  Rng,
  Noise,
  Biquad,
  Svf,
  TAU,
  periodicWobble,
  addWrapped,
  integratedDb,
  dbToGain,
  peak,
  scale,
  rms,
  dcBlock,
  fadeIn,
  trimTail,
  normalizeLoudness,
} from './dsp';
import { Sig } from './synth';

/** Seamless loop builder. */
export class LoopBuf {
  readonly d: Float32Array;
  readonly n: number;
  readonly nz: Noise;
  constructor(
    readonly sr: number,
    readonly len: number,
    readonly rng: Rng,
  ) {
    this.n = Math.max(64, Math.round(len * sr));
    this.d = new Float32Array(this.n);
    this.nz = new Noise(rng);
  }
  /** Frequency rounded to an integer number of cycles per loop. */
  quant(f: number): number {
    const k = Math.max(1, Math.round((f * this.n) / this.sr));
    return (k * this.sr) / this.n;
  }
  white(): Float32Array {
    const b = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) b[i] = this.rng.next() * 2 - 1;
    return b;
  }
  /** Runs a per-sample process circularly (warm-up pass, then the kept pass) → seamless. */
  circular(src: Float32Array, run: (x: number, i: number) => number): Float32Array {
    const out = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) run(src[i], i);
    for (let i = 0; i < this.n; i++) out[i] = run(src[i], i);
    return out;
  }
  /** Coloured (pink/brown) noise from a white loop, seamless. */
  color(src: Float32Array, kind: 'pink' | 'brown'): Float32Array {
    if (kind === 'brown') {
      let z = 0;
      return this.circular(src, (x) => (z = (z + 0.02 * x) / 1.02) * 3.5);
    }
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0;
    return this.circular(src, (w) => {
      p0 = 0.99886 * p0 + w * 0.0555179;
      p1 = 0.99332 * p1 + w * 0.0750759;
      p2 = 0.969 * p2 + w * 0.153852;
      p3 = 0.8665 * p3 + w * 0.3104856;
      p4 = 0.55 * p4 + w * 0.5329522;
      p5 = -0.7616 * p5 - w * 0.016898;
      const o = p0 + p1 + p2 + p3 + p4 + p5 + p6 + w * 0.5362;
      p6 = w * 0.115926;
      return o * 0.11;
    });
  }
  filt(src: Float32Array, ...bq: Biquad[]): Float32Array {
    let cur = src;
    for (const b of bq) cur = this.circular(cur, (x) => b.run(x));
    return cur;
  }
  /** Time-varying SVF (cutoff curve must itself be periodic over the loop). */
  sweep(src: Float32Array, type: 'lp' | 'bp' | 'hp', fc: (i: number) => number, q: number): Float32Array {
    const svf = new Svf();
    return this.circular(src, (x, i) => {
      if ((i & 15) === 0) svf.set(fc(i), q, this.sr);
      svf.run(x);
      return type === 'lp' ? svf.lp : type === 'hp' ? svf.hp : svf.bpn;
    });
  }
  /** Smooth periodic random curve in about -1..1 (`pps` control points per second). */
  curve(pps: number): Float32Array {
    return periodicWobble(this.n, Math.max(3, Math.round(pps * this.len)), this.rng);
  }
  /** Periodic amplitude-modulation gain: 1 - depth * (0..1). */
  wobble(pps: number, depth: number): Float32Array {
    const c = this.curve(pps);
    for (let i = 0; i < this.n; i++) c[i] = Math.max(0, 1 - depth * (0.5 + 0.5 * c[i]));
    return c;
  }
  /** Exactly periodic sinusoidal AM gain at ~`hz`. */
  am(hz: number, depth: number): Float32Array {
    const f = this.quant(hz);
    const out = new Float32Array(this.n);
    const ph = this.rng.next() * TAU;
    for (let i = 0; i < this.n; i++) out[i] = 1 - depth * (0.5 + 0.5 * Math.sin(ph + (TAU * f * i) / this.sr));
    return out;
  }
  /** Exactly periodic harmonic tone with amplitude `amp(h)` for harmonic h = 1..maxH. */
  harmonic(f0: number, amp: (h: number) => number, maxH: number): Float32Array {
    const f = this.quant(f0);
    const out = new Float32Array(this.n);
    for (let h = 1; h <= maxH; h++) {
      const a = amp(h);
      if (!a || f * h > this.sr * 0.45) continue;
      const w = (TAU * f * h) / this.sr;
      const ph = this.rng.next() * TAU;
      for (let i = 0; i < this.n; i++) out[i] += a * Math.sin(ph + w * i);
    }
    return out;
  }
  /** Adds `src` (optionally amplitude-modulated) scaled to the given RMS level. */
  add(src: Float32Array, level: number, mod?: Float32Array): this {
    const tmp = mod ? src.map((v, i) => v * mod[i]) : src;
    const r = rms(tmp);
    if (r > 0) for (let i = 0; i < this.n; i++) this.d[i] += (tmp[i] * level) / r;
    return this;
  }
  /** Renders a one-shot at time t (s) and wraps it around the loop end. */
  event(t: number, dur: number, draw: (s: Sig) => void, gain = 1): this {
    const s = new Sig(this.sr, dur, this.rng);
    draw(s);
    addWrapped(this.d, s.d, Math.round(t * this.sr), gain);
    return this;
  }
}

export function mul(...arrs: Float32Array[]): Float32Array {
  const out = Float32Array.from(arrs[0]);
  for (let k = 1; k < arrs.length; k++) {
    const a = arrs[k];
    for (let i = 0; i < out.length; i++) out[i] *= a[i];
  }
  return out;
}

export interface LoopLayerSpec {
  /** loop length (s) */
  len: number;
  /** integrated K-weighted loudness target for this layer (dB) */
  db: number;
  /** fixed stereo offset of the layer (-1..1) */
  pan?: number;
  /** high-shelf cut above ~5.5 kHz (dB, negative) — keeps hissy beds warm over long sessions */
  tame?: number;
  render: (lb: LoopBuf) => void;
}
export interface LoopEventSpec {
  /** random gap between events (s) */
  every: readonly [number, number];
  /** momentary loudness of an event (dB) */
  db: number;
  variants: number;
  /** random pan spread (±) */
  pan?: number;
  /** random pitch variation (± semitones) */
  pv?: number;
  dur: number;
  render: (s: Sig) => void;
}
export interface LoopSpec {
  layers: LoopLayerSpec[];
  events?: LoopEventSpec;
}

// ---------------------------------------------------------------------------------------------
// Recipes

function crackleLayer(lb: LoopBuf, perSec: number, f: readonly [number, number], q: readonly [number, number], durMax: number, ampPow: number): void {
  const r = lb.rng;
  const count = Math.round(lb.len * perSec);
  for (let k = 0; k < count; k++)
    lb.event(r.next() * lb.len, 0.008, (s) =>
      s.click(0, { f: r.range(f[0], f[1]), q: r.range(q[0], q[1]), amp: 0.12 + 0.88 * Math.pow(r.next(), ampPow), dur: r.range(0.0003, durMax) }),
    );
}

function spits(lb: LoopBuf, perSec: number, gain: readonly [number, number]): void {
  const r = lb.rng;
  const count = Math.round(lb.len * perSec);
  for (let k = 0; k < count; k++)
    lb.event(
      r.next() * lb.len,
      0.08,
      (s) => {
        s.click(0, { f: r.range(1200, 3000), q: 2.5, amp: 1, dur: r.range(0.002, 0.005) });
        s.noise(0.002, { dur: 0.06, type: 'hp', f: 3000, attack: 0.001, tau: 0.014, amp: 0.4 });
      },
      r.range(gain[0], gain[1]),
    );
}

function roomBed(lb: LoopBuf): void {
  const sr = lb.sr;
  lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().lowpass(480, 0.7, sr), new Biquad().highpass(60, 0.7, sr)), 0.1, lb.wobble(0.3, 0.35));
  lb.add(lb.filt(lb.white(), new Biquad().bandpass(4000, 0.4, sr)), 0.012, lb.wobble(0.5, 0.5));
}

function birdChirp(s: Sig): void {
  const r = s.rng;
  const n = r.int(2, 5);
  const base = r.range(2600, 4200);
  const kind = r.int(0, 2);
  let t = 0.01;
  for (let k = 0; k < n; k++) {
    const d = r.range(0.04, 0.09);
    const f0 = base * r.range(0.92, 1.08);
    const f1 = kind === 0 ? f0 * 1.35 : kind === 1 ? f0 * 0.72 : f0 * r.range(0.8, 1.3);
    s.tone(t, {
      dur: d,
      f: (x) => f0 + (f1 - f0) * x + 0.06 * f0 * Math.sin(TAU * 3 * x),
      harm: [1, 0.12],
      env: (x) => Math.pow(Math.sin(Math.PI * x), 1.5),
      amp: 0.5 * r.range(0.6, 1),
    });
    t += d + r.range(0.03, 0.09);
  }
  s.lowpass(6000);
}

export const LOOPS: Record<LoopName, LoopSpec> = {
  sizzle: {
    layers: [
      {
        len: 3.1,
        db: -31,
        tame: -4,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.white(), new Biquad().highpass(1800, 0.7, sr), new Biquad().lowpass(9500, 0.7, sr)), 0.1, mul(lb.wobble(0.9, 0.35), lb.wobble(13, 0.25)));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(3500, 0.6, sr)), 0.04, lb.wobble(6, 0.4));
        },
      },
      {
        len: 4.3,
        db: -30,
        tame: -4,
        render: (lb) => {
          crackleLayer(lb, 70, [2500, 8000], [1, 2], 0.0015, 3);
          spits(lb, 4, [0.5, 1.2]);
        },
      },
    ],
  },
  grill: {
    layers: [
      {
        len: 3.3,
        db: -33,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.white(), new Biquad().highpass(1200, 0.7, sr), new Biquad().lowpass(7000, 0.7, sr)), 0.1, mul(lb.wobble(0.7, 0.3), lb.wobble(9, 0.3)));
          lb.add(lb.filt(lb.color(lb.white(), 'brown'), new Biquad().lowpass(250, 0.7, sr)), 0.08, lb.wobble(1.5, 0.5));
        },
      },
      {
        len: 4.7,
        db: -30,
        tame: -3,
        render: (lb) => {
          const r = lb.rng;
          crackleLayer(lb, 26, [900, 4000], [1.5, 3], 0.003, 2.5);
          for (let k = 0; k < Math.round(lb.len * 2); k++)
            lb.event(r.next() * lb.len, 0.12, (s) => s.noise(0, { dur: 0.1, type: 'hp', f: 1500, attack: 0.001, tau: 0.025, amp: 1 }), r.range(0.3, 0.7));
        },
      },
    ],
  },
  boil: {
    layers: [
      {
        len: 2.9,
        db: -33,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.color(lb.white(), 'brown'), new Biquad().lowpass(300, 0.7, sr)), 0.1, lb.wobble(2, 0.4));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(700, 0.7, sr)), 0.05, lb.wobble(14, 0.6));
        },
      },
      {
        len: 4.1,
        db: -29,
        render: (lb) => {
          const r = lb.rng;
          for (let k = 0; k < Math.round(lb.len * 18); k++)
            lb.event(r.next() * lb.len, 0.3, (s) =>
              s.bubble(0, { f: 250 * Math.pow(3.6, r.next()), rise: r.range(0.4, 0.9), tau: r.range(0.015, 0.04), amp: 0.3 + 0.7 * r.next() }),
            );
          for (let k = 0; k < Math.round(lb.len * 2); k++)
            lb.event(r.next() * lb.len, 0.45, (s) => s.bubble(0, { f: r.range(150, 250), rise: 0.6, tau: 0.06, amp: 1 }), 0.8);
        },
      },
    ],
  },
  fryer: {
    layers: [
      {
        len: 3.1,
        db: -28,
        tame: -4,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.white(), new Biquad().highpass(1500, 0.7, sr), new Biquad().lowpass(10000, 0.7, sr)), 0.1, mul(lb.wobble(1.1, 0.25), lb.wobble(16, 0.3)));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(900, 0.6, sr)), 0.07, lb.wobble(25, 0.6));
        },
      },
      {
        len: 4.3,
        db: -28,
        tame: -4,
        render: (lb) => {
          crackleLayer(lb, 220, [2000, 9000], [0.9, 1.6], 0.0012, 3);
          spits(lb, 10, [0.4, 1]);
        },
      },
    ],
  },
  blender: {
    layers: [
      {
        len: 3.0,
        db: -27,
        render: (lb) => {
          const sr = lb.sr;
          const saw = lb.harmonic(142, (h) => 1 / h, 48);
          const c = lb.curve(0.7);
          const motor = lb.sweep(saw, 'bp', (i) => 1150 * Math.pow(1.5, c[i]), 1.3);
          lb.add(motor, 0.1, mul(lb.wobble(4, 0.25), lb.am(11, 0.3)));
          lb.add(lb.filt(saw, new Biquad().lowpass(500, 0.8, sr)), 0.06, lb.am(11, 0.2));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(1500, 0.7, sr)), 0.05, lb.wobble(3, 0.5));
          const out = lb.filt(lb.d, new Biquad().lowpass(4500, 0.7, sr));
          lb.d.set(out);
        },
      },
      {
        len: 4.1,
        db: -35,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.white(), new Biquad().bandpass(2500, 1, sr)), 0.1, lb.wobble(9, 0.7));
        },
      },
    ],
  },
  oven: {
    layers: [
      {
        len: 4.0,
        db: -35,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.harmonic(100, (h) => [0.6, 1, 0.5, 0.3, 0.15][h - 1] ?? 0, 5), 0.04, lb.wobble(0.5, 0.15));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().lowpass(900, 0.7, sr)), 0.1, lb.wobble(1.2, 0.15));
          lb.add(lb.filt(lb.white(), new Biquad().bandpass(320, 0.6, sr)), 0.04, lb.wobble(0.8, 0.3));
        },
      },
    ],
    events: {
      every: [2.5, 6],
      db: -42,
      variants: 3,
      dur: 0.15,
      pan: 0.3,
      render: (s) => {
        s.click(0, { f: s.rng.range(2500, 4000), q: 3, amp: 0.6 });
        s.modal(0, s.rng.range(1800, 2600), [[1, 0.2, 0.03], [2.7, 0.1, 0.02]]);
      },
    },
  },
  microwave: {
    layers: [
      {
        len: 3.0,
        db: -32,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.harmonic(120, (h) => [1, 0.7, 0.5, 0.35, 0.22, 0.12, 0.08][h - 1] ?? 0, 7), 0.06, lb.wobble(0.7, 0.1));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(600, 0.5, sr)), 0.1, lb.wobble(1.5, 0.12));
          lb.add(lb.filt(lb.white(), new Biquad().bandpass(2200, 0.7, sr)), 0.025, lb.wobble(2, 0.2));
          lb.add(lb.filt(lb.color(lb.white(), 'brown'), new Biquad().lowpass(120, 0.7, sr)), 0.06, lb.wobble(0.67, 0.5));
        },
      },
    ],
  },
  toaster: {
    layers: [
      {
        len: 2.0,
        db: -38,
        render: (lb) => {
          const r = lb.rng;
          for (let k = 0; k < 8; k++)
            lb.event(Math.max(0, k * 0.25 + r.bi() * 0.003), 0.03, (s) => {
              s.click(0, { f: k % 2 ? 2600 : 3200, q: 4, amp: k % 2 ? 0.5 : 0.7, dur: 0.0008 });
              s.modal(0, k % 2 ? 1900 : 2300, [[1, 0.1, 0.008]]);
            });
          lb.add(lb.harmonic(120, (h) => [1, 0.5, 0.35, 0.2][h - 1] ?? 0, 4), 0.012);
          for (let k = 0; k < 10; k++)
            lb.event(r.next() * lb.len, 0.01, (s) => s.click(0, { f: r.range(3000, 7000), q: 1.5, amp: 0.1 + 0.1 * r.next(), dur: 0.0008 }));
        },
      },
    ],
  },
  freezer: {
    layers: [
      {
        len: 3.7,
        db: -34,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(2500, 0.5, sr)), 0.1, lb.wobble(0.6, 0.45));
          lb.add(lb.filt(lb.white(), new Biquad().highpass(6000, 0.7, sr)), 0.03, lb.wobble(1, 0.4));
          lb.add(lb.harmonic(60, (h) => [1, 0.6, 0.3][h - 1] ?? 0, 3), 0.015);
        },
      },
    ],
    events: {
      every: [0.5, 1.8],
      db: -40,
      variants: 5,
      dur: 0.6,
      pan: 0.6,
      pv: 2,
      render: (s) => {
        const r = s.rng;
        const f = r.range(3000, 6000);
        s.modal(0, f, [[1, 0.5, r.range(0.08, 0.2)], [2.32, 0.15, 0.06], [4.25, 0.05, 0.03]]);
        if (r.chance(0.5)) s.modal(r.range(0.04, 0.12), f * r.pick([1.12, 1.25, 1.5]), [[1, 0.3, 0.1]]);
      },
    },
  },
  'fridge-hum': {
    layers: [
      {
        len: 3.0,
        db: -41,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.harmonic(50, (h) => [0.5, 1, 0.7, 0.5, 0.3, 0.2, 0.12][h - 1] ?? 0, 7), 0.05, lb.wobble(0.5, 0.12));
          lb.add(lb.harmonic(410, () => 1, 1), 0.004, lb.wobble(0.8, 0.5));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().lowpass(500, 0.7, sr)), 0.02);
        },
      },
    ],
  },
  pour: {
    layers: [
      {
        len: 2.3,
        db: -32,
        render: (lb) => {
          const sr = lb.sr;
          lb.add(lb.filt(lb.white(), new Biquad().bandpass(1800, 0.6, sr)), 0.1, lb.wobble(40, 0.55));
          lb.add(lb.filt(lb.color(lb.white(), 'pink'), new Biquad().bandpass(500, 1.2, sr)), 0.06, lb.wobble(18, 0.6));
        },
      },
      {
        len: 3.1,
        db: -29,
        render: (lb) => {
          const r = lb.rng;
          for (let k = 0; k < Math.round(lb.len * 40); k++)
            lb.event(r.next() * lb.len, 0.2, (s) =>
              s.bubble(0, { f: 500 * Math.pow(5, r.next()), rise: r.range(0.5, 1.2), tau: r.range(0.008, 0.025), amp: 0.3 + 0.7 * r.next() }),
            );
        },
      },
    ],
  },
  room: {
    layers: [
      { len: 5.3, db: -47, pan: -0.55, render: roomBed },
      { len: 6.1, db: -47, pan: 0.55, render: roomBed },
    ],
    events: { every: [3.5, 11], db: -40, variants: 6, dur: 1.0, pan: 0.75, pv: 1.5, render: birdChirp },
  },
};

export const LOOP_NAMES = Object.keys(LOOPS) as LoopName[];

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

export const LOOP_PEAK_CAP = 0.85;

/** Renders one seamless layer of a loop (mono), normalised to the layer's loudness target. */
export function renderLoopLayer(name: LoopName, layer: number, sr: number, seed = 0): Float32Array {
  const spec = LOOPS[name].layers[layer];
  const lb = new LoopBuf(sr, spec.len, new Rng(seed * 6007 + hashName(name) + layer * 101));
  spec.render(lb);
  if (spec.tame) lb.d.set(lb.filt(lb.d, new Biquad().highshelf(5500, spec.tame, sr)));
  const d = lb.d;
  // remove any DC circularly (keeps the seam intact)
  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += d[i];
  mean /= d.length;
  for (let i = 0; i < d.length; i++) d[i] -= mean;
  const cur = integratedDb(d, sr);
  let g = dbToGain(spec.db - cur);
  const p = peak(d) * g;
  if (p > LOOP_PEAK_CAP) g *= LOOP_PEAK_CAP / p;
  return scale(d, g);
}

/** Renders one variant of a loop's sporadic event (bird chirp, tick...). */
export function renderLoopEvent(name: LoopName, sr: number, seed: number): Float32Array | null {
  const ev = LOOPS[name].events;
  if (!ev) return null;
  const s = new Sig(sr, ev.dur, new Rng(seed * 3301 + hashName(name) + 7));
  ev.render(s);
  dcBlock(s.d, sr, 12);
  fadeIn(s.d, 8);
  const out = trimTail(s.d, sr, -60, 0.005);
  normalizeLoudness(out, sr, ev.db, 0.6);
  return out;
}
