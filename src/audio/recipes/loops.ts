/**
 * Looping textures. Each generator renders `len` seconds (loop length + crossfade overlap);
 * the renderer folds the overlap back onto the head so the loop is seamless.
 */
import { addNoise, alloc, highpass, lowpass, mix, peakEq, smoothRandom, sweep, TAU, lowShelf } from '../dsp/core';
import { chorus } from '../dsp/fx';
import { bubble, bubbles, burst, crackle, grains, ping, ratioModes, scatter, strike, whoosh, PLATE } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { sizzle } from './kit';
import type { LoopSpec, Out } from './types';

function roar(sr: number, r: Rand, len: number, lp: number, flicker: number, amp: number): Float32Array {
  const n = Math.ceil(len * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1, 'brown');
  addNoise(b, r, 0, n, 0.08, 'pink');
  lowpass(b, sr, lp);
  const am = smoothRandom(r, sr, n, flicker);
  const am2 = smoothRandom(r, sr, n, flicker * 0.23);
  for (let i = 0; i < n; i++) b[i] *= (0.55 + 0.3 * am[i] + 0.15 * am2[i]) * amp;
  return b;
}

function stereoPair(sr: number, r: Rand, len: number, fn: (out: Float32Array, rr: Rand, ch: number) => void): Float32Array[] {
  const L = alloc(sr, len);
  const R = alloc(sr, len);
  fn(L, r.fork(1), 0);
  fn(R, r.fork(2), 1);
  return [L, R];
}

/** Shared bed generator: the same correlated component in both channels + decorrelated detail. */
function widen(sr: number, r: Rand, len: number, common: (out: Float32Array, rr: Rand) => void, detail: (out: Float32Array, rr: Rand, ch: number) => void, width = 0.6): Float32Array[] {
  const c = alloc(sr, len);
  common(c, r.fork(7));
  const [L, R] = stereoPair(sr, r, len, detail);
  for (let i = 0; i < L.length; i++) {
    L[i] = c[i] * (1 - width * 0.5) + L[i];
    R[i] = c[i] * (1 - width * 0.5) + R[i];
  }
  return [L, R];
}

/** Mid-band fire "breath": pink noise band-passed around `fc` with flicker. */
function flame(sr: number, r: Rand, len: number, fc: number, amp: number): Float32Array {
  const n = Math.ceil(len * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1, 'pink');
  sweep(b, sr, 'bp', fc, 0.6);
  const am = smoothRandom(r, sr, n, 9);
  const am2 = smoothRandom(r, sr, n, 1.7);
  for (let i = 0; i < n; i++) b[i] *= (0.55 + 0.3 * am[i] + 0.15 * am2[i]) * amp;
  return b;
}

function fireLoop(sr: number, r: Rand, len: number, o: { lp: number; crackle: number; pops: number; hiss: number }): Out {
  const out = alloc(sr, len);
  mix(out, roar(sr, r, len, o.lp, 7, 1), 0, 0.35);
  mix(out, flame(sr, r, len, o.lp * 0.9, 1), 0, 1.4);
  crackle(out, sr, r, 0, len, { rate: o.crackle, amp: 0.55, pops: o.pops });
  if (o.hiss > 0) {
    const n = out.length;
    const h = new Float32Array(n);
    addNoise(h, r, 0, n, 1);
    sweep(h, sr, 'bp', 4200, 1.2);
    const am = smoothRandom(r, sr, n, 3);
    for (let i = 0; i < n; i++) out[i] += h[i] * o.hiss * Math.max(0, am[i]);
  }
  return out;
}

function droneTones(out: Float32Array, sr: number, r: Rand, freqs: readonly number[], amp: number, wobble = 0.004): void {
  const n = out.length;
  for (let k = 0; k < freqs.length; k++) {
    let ph = r.next() * TAU;
    const rate = r.range(0.05, 0.2);
    const off = r.next() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (TAU * freqs[k] * (1 + wobble * Math.sin(TAU * rate * t + off))) / sr;
      out[i] += Math.sin(ph + 0.35 * Math.sin(2 * ph)) * amp * (0.75 + 0.25 * Math.sin(TAU * rate * 0.7 * t + off * 2));
    }
  }
}

function cricket(out: Float32Array, sr: number, r: Rand, len: number): void {
  const f = r.range(3800, 5200);
  const period = r.range(0.45, 0.9);
  const pulses = 2 + r.int(3);
  const amp = r.range(0.15, 0.4);
  let t = r.range(0, period);
  while (t < len) {
    for (let p = 0; p < pulses; p++) {
      const s0 = Math.round((t + p * 0.03) * sr);
      const n = Math.round(0.016 * sr);
      for (let i = 0; i < n && s0 + i < out.length; i++) {
        const u = i / n;
        out[s0 + i] += Math.sin((TAU * f * i) / sr) * Math.sin(Math.PI * u) * amp;
      }
    }
    t += period * r.range(0.95, 1.05);
  }
}

export function loopSpecs(): Record<string, LoopSpec> {
  const o = loopTable();
  // the spec lists `portal.portal` as the portal hum: accept it as a loop name too
  o['portal.portal'] = o['loop.portal'];
  return o;
}

function loopTable(): Record<string, LoopSpec> {
  return {
    'loop.fire': { cat: 'blocks', dur: 5, gen: (sr, r, len) => fireLoop(sr, r, len, { lp: 520, crackle: 18, pops: 0.25, hiss: 0.05 }) },
    'loop.campfire': { cat: 'blocks', dur: 6, gen: (sr, r, len) => fireLoop(sr, r, len, { lp: 420, crackle: 26, pops: 0.35, hiss: 0.03 }) },
    'loop.furnace': {
      cat: 'blocks',
      dur: 5,
      level: 0.8,
      gen: (sr, r, len) => {
        const out = fireLoop(sr, r, len, { lp: 320, crackle: 6, pops: 0.2, hiss: 0 }) as Float32Array;
        peakEq(out, sr, 600, 2.5, 5);
        return out;
      },
    },
    'loop.lava': {
      cat: 'blocks',
      dur: 6,
      gen: (sr, r, len) => {
        const out = alloc(sr, len);
        mix(out, roar(sr, r, len, 160, 2, 1.2), 0, 1);
        scatter(r, 0, len - 0.3, 7, (t) => bubble(out, sr, t, r.range(110, 380), r.range(0.2, 0.6), 0.2, 0.5));
        scatter(r, 0.2, len - 0.4, 0.9, (t) => {
          bubble(out, sr, t, r.range(170, 300), 0.8, 0.2, 0.5);
          sizzle(out, sr, r, t + 0.01, 0.15, 0.25, 1);
        });
        return out;
      },
    },
    'loop.portal': {
      cat: 'blocks',
      dur: 6,
      xf: 1,
      gen: (sr, r, len) => {
        const n = Math.ceil(len * sr);
        const out = new Float32Array(n);
        droneTones(out, sr, r, [r.range(70, 80), r.range(105, 118), r.range(140, 150)], 0.1, 0.01);
        lowpass(out, sr, 700);
        const nz = new Float32Array(n);
        addNoise(nz, r, 0, n, 1, 'pink');
        const fa: number[] = [];
        for (let t = 0; t <= len + 0.05; t += 0.05) fa.push(t, 750 * Math.pow(2.4, Math.sin(TAU * 0.45 * t) * Math.sin(TAU * 0.13 * t + 1)));
        sweep(nz, sr, 'bp', fa, 4);
        for (let i = 0; i < n; i++) out[i] += nz[i] * 2.2;
        return chorus(out, sr, { rate: 0.25, depth: 0.004, delay: 0.012, mix: 0.5 });
      },
    },
    'loop.beacon': {
      cat: 'blocks',
      dur: 4,
      xf: 1,
      gen: (sr, r, len) => {
        const out = alloc(sr, len);
        const f = r.range(105, 115);
        droneTones(out, sr, r, [f, f * 2, f * 3, f * 5, f * 8], 0.12, 0.002);
        for (let i = 0; i < out.length; i++) out[i] *= 0.8 + 0.2 * Math.sin(TAU * 1.5 * (i / sr));
        lowpass(out, sr, 2500);
        return out;
      },
    },
    'loop.minecart': {
      cat: 'neutral',
      dur: 4,
      gen: (sr, r, len) => {
        const out = alloc(sr, len);
        mix(out, roar(sr, r, len, 300, 12, 1), 0, 0.9);
        const step = r.range(0.55, 0.7);
        for (let t = r.range(0, step); t < len; t += step) {
          strike(out, sr, t, ratioModes(r.log(300, 420), PLATE, 0.15, { tilt: 0.4, jitter: 0.03, r }), 0.5);
          strike(out, sr, t + 0.09, ratioModes(r.log(300, 420), PLATE, 0.12, { tilt: 0.4, jitter: 0.03, r }), 0.35);
          burst(out, sr, r, t, 0.004, 0.3, 1000, 8000);
        }
        whoosh(out, sr, r, 0, len, { f: [0, 1800, 0.5, 2300, 1, 1900], amp: [0, 0.4, 0.5, 0.7, 1, 0.4], q: 12, gain: 0.15 });
        return out;
      },
    },
    'loop.water_flow': {
      cat: 'blocks',
      dur: 6,
      gen: (sr, r, len) => {
        const out = alloc(sr, len);
        bubbles(out, sr, r, 0, len - 0.05, 140, 300, 1600, 0.35, 0.15);
        const n = out.length;
        const w = new Float32Array(n);
        addNoise(w, r, 0, n, 1, 'pink');
        const fc: number[] = [];
        for (let t = 0; t <= len + 0.1; t += 0.1) fc.push(t, 700 * Math.pow(1.6, r.bi()));
        sweep(w, sr, 'bp', fc, 1.1);
        for (let i = 0; i < n; i++) out[i] += w[i] * 0.6;
        grains(out, sr, r, { t0: 0, t1: len, rate: 900, fLo: 2500, fHi: 8000, q: 1.5, amp: 0.12 });
        return out;
      },
    },
    'loop.rain': {
      cat: 'weather',
      dur: 6,
      stereo: true,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            addNoise(c, rr, 0, c.length, 0.6, 'pink');
            highpass(c, sr, 350);
            lowpass(c, sr, 9000);
          },
          (o, rr) => {
            grains(o, sr, rr, { t0: 0, t1: len, rate: 1600, fLo: 2000, fHi: 9500, q: 1.4, durLo: 0.0006, durHi: 0.003, amp: 0.5, tail: 2.5 });
            bubbles(o, sr, rr, 0, len - 0.05, 55, 1200, 4500, 0.18, 0.3, 1.4);
            grains(o, sr, rr, { t0: 0, t1: len, rate: 220, fLo: 300, fHi: 1400, q: 1.2, durLo: 0.002, durHi: 0.008, amp: 0.25 });
          },
          0.5,
        ),
    },
    'loop.rain_indoor': {
      cat: 'weather',
      dur: 6,
      stereo: true,
      div: 2,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            addNoise(c, rr, 0, c.length, 0.6, 'brown');
            addNoise(c, rr, 0, c.length, 0.25, 'pink');
            lowpass(c, sr, 700);
          },
          (o, rr) => {
            grains(o, sr, rr, { t0: 0, t1: len, rate: 450, fLo: 700, fHi: 3000, q: 1.3, durLo: 0.002, durHi: 0.008, amp: 0.5 });
            scatter(rr, 0.2, len - 0.3, 0.6, (t) => bubble(o, sr, t, rr.range(900, 1800), 0.2, 0.3));
            lowpass(o, sr, 3000);
          },
        ),
    },
    'loop.underwater': {
      cat: 'ambient',
      dur: 8,
      stereo: true,
      div: 4,
      xf: 1,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            mix(c, roar(sr, rr, len, 380, 0.5, 1), 0, 1);
          },
          (o, rr) => {
            bubbles(o, sr, rr, 0, len - 0.1, 9, 250, 900, 0.3, 0.2, 0.6);
            const n = o.length;
            const w = new Float32Array(n);
            addNoise(w, rr, 0, n, 1, 'pink');
            const fc: number[] = [];
            for (let t = 0; t <= len + 0.2; t += 0.2) fc.push(t, 450 * Math.pow(1.5, Math.sin(TAU * 0.11 * t + rr.next() * 6)));
            sweep(w, sr, 'bp', fc, 2.5);
            for (let i = 0; i < n; i++) o[i] += w[i] * 0.8;
            lowpass(o, sr, 1400);
          },
        ),
    },
    'loop.cave': {
      cat: 'ambient',
      dur: 8,
      stereo: true,
      div: 4,
      xf: 1,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => mix(c, roar(sr, rr, len, 220, 0.4, 1), 0, 1),
          (o, rr) => {
            addNoise(o, rr, 0, o.length, 0.35, 'pink');
            lowpass(o, sr, 650);
          },
        ),
    },
    'loop.wind': {
      cat: 'weather',
      dur: 8,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) => {
        // shared gust envelope (both ears hear the same gust) with per-channel noise:
        // gusts brighten the body and raise a whistle that only sings in strong gusts
        const n = Math.ceil(len * sr);
        const gust = smoothRandom(r.fork(3), sr, n, 0.22);
        const flutter = smoothRandom(r.fork(4), sr, n, 2.2);
        const G = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = 0.5 + 0.5 * gust[i];
          G[i] = x * x * (3 - 2 * x);
        }
        const out: Float32Array[] = [];
        for (let c = 0; c < 2; c++) {
          const rr = r.fork(10 + c);
          const body = new Float32Array(n);
          addNoise(body, rr, 0, n, 1, 'pink');
          const wh = body.slice();
          const fl: number[] = [];
          const fh: number[] = [];
          for (let t = 0; t <= len + 0.05; t += 0.05) {
            const k = G[Math.min(n - 1, Math.round(t * sr))];
            fl.push(t, 300 + 800 * k);
            fh.push(t, 450 + 650 * k + 40 * c);
          }
          sweep(body, sr, 'lp', fl, 0.7);
          sweep(wh, sr, 'bp', fh, 7);
          const o = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const k = G[i];
            o[i] = body[i] * (0.25 + 0.75 * k) * (0.9 + 0.1 * flutter[i]) + wh[i] * 0.9 * k * k * (0.8 + 0.2 * flutter[i]);
          }
          out.push(o);
        }
        return out;
      },
    },
    'loop.nether': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            droneTones(c, sr, rr, [110, 164.8, 219], 0.14, 0.006);
            mix(c, roar(sr, rr, len, 120, 0.6, 1), 0, 0.6);
            mix(c, flame(sr, rr, len, 320, 0.8), 0, 0.5);
            lowpass(c, sr, 1200);
          },
          (o, rr) => {
            whoosh(o, sr, rr, rr.range(0, len * 0.3), len * 0.6, { f: [0, 200, 0.5, 380, 1, 180], amp: [0, 0, 0.5, 1, 1, 0], q: 1.5, gain: 0.35, pink: true });
            crackle(o, sr, rr, 0, len, { rate: 1.5, amp: 0.15, fLo: 800, fHi: 3000 });
          },
        ),
    },
    'loop.nether.crimson': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            droneTones(c, sr, rr, [82.4, 123.5, 164.8], 0.16, 0.01);
            const br = roar(sr, rr, len, 260, 0.25, 1);
            for (let i = 0; i < br.length; i++) br[i] *= 0.5 + 0.5 * Math.sin(TAU * 0.2 * (i / sr));
            mix(c, br, 0, 1);
            lowpass(c, sr, 700);
          },
          (o, rr) => {
            scatter(rr, 0.3, len - 0.5, 0.5, (t) => ping(o, sr, t, rr.range(200, 350), 0.3, 0.2));
            grains(o, sr, rr, { t0: 0, t1: len, rate: 40, fLo: 600, fHi: 2000, q: 2, amp: 0.15 });
          },
        ),
    },
    'loop.nether.warped': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            droneTones(c, sr, rr, [65.4, 98, 130.8], 0.12, 0.004);
            lowpass(c, sr, 900);
          },
          (o, rr) => {
            const n = o.length;
            const w = new Float32Array(n);
            addNoise(w, rr, 0, n, 1, 'pink');
            const fc: number[] = [];
            for (let t = 0; t <= len + 0.1; t += 0.1) fc.push(t, 1100 * Math.pow(1.8, Math.sin(TAU * 0.07 * t + rr.next() * 6)));
            sweep(w, sr, 'bp', fc, 14);
            for (let i = 0; i < n; i++) o[i] += w[i] * 0.9;
            scatter(rr, 0.3, len - 1, 0.4, (t) => ping(o, sr, t, rr.range(700, 1600), 1.2, 0.08));
          },
        ),
    },
    'loop.nether.soul': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => mix(c, roar(sr, rr, len, 140, 0.4, 1), 0, 0.8),
          (o, rr) => {
            whoosh(o, sr, rr, 0, len, { f: [0, 320, 0.3, 700, 0.6, 420, 1, 800], amp: [0, 0.5, 0.3, 1, 0.6, 0.6, 1, 0.9], q: 6, gain: 0.6 });
            whoosh(o, sr, rr, 0, len, { f: [0, 500, 1, 300], amp: [0, 0.6, 1, 0.6], q: 1, gain: 0.25, pink: true });
          },
        ),
    },
    'loop.nether.basalt': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            mix(c, roar(sr, rr, len, 150, 0.8, 1.2), 0, 1);
            droneTones(c, sr, rr, [98, 146.8], 0.1, 0.008);
            mix(c, flame(sr, rr, len, 400, 0.7), 0, 0.4);
          },
          (o, rr) => {
            crackle(o, sr, rr, 0, len, { rate: 4, amp: 0.3, fLo: 600, fHi: 3000 });
            const n = o.length;
            const h = new Float32Array(n);
            addNoise(h, rr, 0, n, 1);
            sweep(h, sr, 'bp', 3500, 0.8);
            const am = smoothRandom(rr, sr, n, 0.3);
            for (let i = 0; i < n; i++) o[i] += h[i] * 0.12 * Math.max(0, am[i]);
          },
        ),
    },
    'loop.end': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 1.5,
      gen: (sr, r, len) =>
        widen(
          sr,
          r,
          len,
          (c, rr) => {
            const n = c.length;
            const w = new Float32Array(n);
            addNoise(w, rr, 0, n, 1, 'pink');
            const res = new Float32Array(n);
            for (const f of [110, 164.8, 220, 277.2]) {
              const t = w.slice();
              sweep(t, sr, 'bp', f, 25);
              for (let i = 0; i < n; i++) res[i] += t[i];
            }
            for (let i = 0; i < n; i++) c[i] += res[i] * 1.5 + w[i] * 0.05;
            lowpass(c, sr, 1500);
          },
          (o, rr) => {
            whoosh(o, sr, rr, rr.range(0, 3), 6, { f: [0, 1200, 0.5, 1900, 1, 1400], amp: [0, 0, 0.5, 1, 1, 0], q: 18, gain: 0.25 });
          },
        ),
    },
    'loop.night': {
      cat: 'ambient',
      dur: 6,
      stereo: true,
      gen: (sr, r, len) =>
        stereoPair(sr, r, len, (o, rr) => {
          for (let k = 0; k < 3; k++) cricket(o, sr, rr, len);
          const n = o.length;
          const air = new Float32Array(n);
          addNoise(air, rr, 0, n, 0.15, 'pink');
          lowpass(air, sr, 1200);
          for (let i = 0; i < n; i++) o[i] += air[i];
        }),
    },
    'loop.ocean': {
      cat: 'ambient',
      dur: 10,
      stereo: true,
      div: 2,
      xf: 2,
      gen: (sr, r, len) =>
        stereoPair(sr, r, len, (o, rr) => {
          const n = o.length;
          const w = new Float32Array(n);
          addNoise(w, rr, 0, n, 1, 'pink');
          const per = rr.range(4, 6.5);
          const off = rr.next() * per;
          const fc: number[] = [];
          for (let t = 0; t <= len + 0.1; t += 0.05) {
            const ph = ((t + off) % per) / per;
            fc.push(t, 300 + 2600 * Math.pow(Math.max(0, Math.sin(Math.PI * ph)), 3));
          }
          sweep(w, sr, 'lp', fc, 0.7);
          for (let i = 0; i < n; i++) {
            const ph = ((i / sr + off) % per) / per;
            o[i] = w[i] * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * ph), 2));
          }
          lowShelf(o, sr, 200, 4);
        }),
    },
  };
}

