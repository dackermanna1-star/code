// Analysis checks for every procedural sound (we can't listen in CI, so we measure): no NaN, safe
// peaks, sensible durations, consistent loudness, click-free edges, seamless loops, warm spectra.
import { describe, expect, it } from 'vitest';
import { SFX, SFX_NAMES, SFX_PEAK_CAP, SFX_REF_DB, renderSfx } from '../src/audio/sfx';
import { LOOPS, LOOP_NAMES, LOOP_PEAK_CAP, renderLoopEvent, renderLoopLayer } from '../src/audio/loops';
import { PHRASE_TRIM, VOICE_PEAK_CAP, VOICE_PHRASES, VOICE_REF_DB, renderPhrase } from '../src/audio/voice';
import { allFinite, integratedDb, momentaryMaxDb, peak } from '../src/audio/dsp';
import { RENDER_SR, sfxVariants } from '../src/audio/engine';

const SR = RENDER_SR;

function mean(b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i];
  return s / Math.max(1, b.length);
}

/** Share of spectral energy above `f` Hz (averaged Hann-windowed FFT frames). */
function energyAbove(b: Float32Array, sr: number, f: number): number {
  const N = 2048;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let hi = 0;
  let tot = 0;
  for (let s = 0; s < Math.max(1, b.length - N / 2); s += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = (b[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      tot += p;
      if ((k * sr) / N >= f) hi += p;
    }
  }
  return hi / (tot || 1);
}
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const k = i + j + len / 2;
        const vr = re[k] * cr - im[k] * ci;
        const vi = re[k] * ci + im[k] * cr;
        re[k] = re[i + j] - vr;
        im[k] = im[i + j] - vi;
        re[i + j] += vr;
        im[i + j] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Median fundamental (Hz) over the loud, clearly periodic frames (normalised autocorrelation). */
function medianF0(b: Float32Array, sr: number): number {
  const N = 1024;
  const energy = (s: number) => {
    let e = 0;
    for (let i = 0; i < N; i++) e += b[s + i] * b[s + i];
    return e;
  };
  let maxE = 0;
  for (let s = 0; s + N <= b.length; s += N / 2) maxE = Math.max(maxE, energy(s));
  const f0s: number[] = [];
  for (let s = 0; s + N <= b.length; s += N / 2) {
    const e0 = energy(s);
    if (e0 < 0.1 * maxE) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = Math.floor(sr / 1400); lag <= Math.ceil(sr / 100); lag++) {
      let c = 0;
      let e1 = 0;
      for (let i = 0; i + lag < N; i++) {
        c += b[s + i] * b[s + i + lag];
        e1 += b[s + i + lag] * b[s + i + lag];
      }
      const r = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    if (best > 0.6) f0s.push(sr / bestLag);
  }
  f0s.sort((x, y) => x - y);
  return f0s.length ? f0s[Math.floor(f0s.length / 2)] : 0;
}

describe('one-shot sound effects', () => {
  it.each(SFX_NAMES)('%s: safe, sized, loudness-normalised, click-free', (name) => {
    const spec = SFX[name];
    const target = SFX_REF_DB + (spec.loud ?? 0);
    const louds: number[] = [];
    for (let v = 0; v < sfxVariants(spec); v++) {
      const b = renderSfx(name, SR, v + 1);
      expect(allFinite(b)).toBe(true);
      const p = peak(b);
      expect(p).toBeGreaterThan(0.02);
      expect(p).toBeLessThanOrEqual(SFX_PEAK_CAP + 1e-3);
      const dur = b.length / SR;
      expect(dur).toBeGreaterThanOrEqual(0.02);
      expect(dur).toBeLessThanOrEqual(spec.dur + 0.01);
      const m = momentaryMaxDb(b, SR);
      if (p < SFX_PEAK_CAP - 0.01) {
        expect(Math.abs(m - target)).toBeLessThan(0.6);
        louds.push(m);
      } else expect(m).toBeLessThan(target + 0.6);
      // no clicks at the edges, no DC
      expect(Math.abs(b[0])).toBeLessThan(1e-3);
      expect(Math.abs(b[b.length - 1])).toBeLessThan(2e-3);
      expect(Math.abs(mean(b))).toBeLessThan(0.01 * p + 1e-4);
    }
    if (louds.length > 1) expect(Math.max(...louds) - Math.min(...louds)).toBeLessThan(1.2);
  });

  it('render the same way at other context rates', () => {
    for (const name of SFX_NAMES) {
      const b = renderSfx(name, 44100, 1);
      expect(allFinite(b)).toBe(true);
      expect(peak(b)).toBeLessThanOrEqual(SFX_PEAK_CAP + 1e-3);
    }
  });

  it('stay warm: no sound is dominated by energy above 6 kHz', () => {
    for (const name of SFX_NAMES) expect([name, energyAbove(renderSfx(name, SR, 1), SR, 6000) < 0.62]).toEqual([name, true]);
  });
});

describe('loops', () => {
  for (const name of LOOP_NAMES) {
    it(`${name}: seamless, safe, at its loudness target`, () => {
      LOOPS[name].layers.forEach((spec, l) => {
        const b = renderLoopLayer(name, l, SR);
        expect(allFinite(b)).toBe(true);
        expect(b.length).toBe(Math.round(spec.len * SR));
        const p = peak(b);
        expect(p).toBeLessThanOrEqual(LOOP_PEAK_CAP + 1e-3);
        const db = integratedDb(b, SR);
        if (p < LOOP_PEAK_CAP - 0.01) expect(Math.abs(db - spec.db)).toBeLessThan(0.5);
        else expect(db).toBeLessThan(spec.db + 0.5);
        expect(Math.abs(mean(b))).toBeLessThan(1e-4);
        // the wrap-around step is no bigger than steps inside the loop
        let maxStep = 0;
        for (let i = 1; i < b.length; i++) maxStep = Math.max(maxStep, Math.abs(b[i] - b[i - 1]));
        expect(Math.abs(b[0] - b[b.length - 1])).toBeLessThanOrEqual(maxStep);
        expect(energyAbove(b, SR, 6000)).toBeLessThan(0.35);
      });
      const ev = LOOPS[name].events;
      if (ev) {
        for (let v = 0; v < ev.variants; v++) {
          const e = renderLoopEvent(name, SR, v + 1);
          expect(e).not.toBeNull();
          expect(allFinite(e as Float32Array)).toBe(true);
          expect(peak(e as Float32Array)).toBeLessThan(0.65);
        }
      }
    });
  }
});

describe("Mochi's voice", () => {
  it.each(VOICE_PHRASES)('%s: safe, consistent loudness, varied takes', (phrase) => {
    const target = VOICE_REF_DB + (PHRASE_TRIM[phrase] ?? 0);
    const takes = [1, 2, 3].map((seed) => renderPhrase(phrase, SR, seed));
    for (const b of takes) {
      expect(allFinite(b)).toBe(true);
      const p = peak(b);
      expect(p).toBeLessThanOrEqual(VOICE_PEAK_CAP + 1e-3);
      const dur = b.length / SR;
      expect(dur).toBeGreaterThan(0.25);
      expect(dur).toBeLessThan(1.8);
      const m = momentaryMaxDb(b, SR);
      if (p < VOICE_PEAK_CAP - 0.01) expect(Math.abs(m - target)).toBeLessThan(0.6);
      expect(Math.abs(b[0])).toBeLessThan(1e-3);
      expect(Math.abs(b[b.length - 1])).toBeLessThan(2e-3);
    }
    // every take is a little different
    expect(takes[0].length !== takes[1].length || takes[0].some((x, i) => x !== takes[1][i])).toBe(true);
  });

  it('is a small, high-pitched creature (burps excepted)', () => {
    const noisy = new Set(['hungry', 'spicy', 'sigh', 'gasp', 'cough', 'hot', 'burp']);
    for (const phrase of VOICE_PHRASES) {
      if (noisy.has(phrase)) continue;
      const f0 = medianF0(renderPhrase(phrase, SR, 1), SR);
      expect([phrase, f0 >= 350 && f0 <= 1000]).toEqual([phrase, true]);
    }
    const burp = medianF0(renderPhrase('burp', SR, 1), SR);
    expect(burp).toBeGreaterThan(120);
    expect(burp).toBeLessThan(320);
  });
});
