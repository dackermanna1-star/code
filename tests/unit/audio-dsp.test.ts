// Unit tests for the pure DSP primitives used by the procedural sound bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Biquad, Noise, addMode, addThump, addNoiseBurst, makeLoop, normalize, trimTail, maxWindowRms, peakOf, poisson, bounces, stickSlip, dbToGain, alphaFromT60 } from "../../src/audio/synth/dsp.ts";
import { dominantFrequency, effectiveDuration, loopSeamRatio, rms, schroederRT60 } from "../../src/audio/analysis.ts";

const SR = 48000;

test("addMode renders a damped sinusoid with the requested frequency and T60", () => {
  const b = new Float32Array(SR);
  addMode(b, 0, SR, 1000, 0.5, alphaFromT60(0.5));
  assert.ok(Math.abs(dominantFrequency(b, SR) - 1000) < 5, "frequency");
  // Envelope after 0.5 s should be ~-60 dB relative to the start.
  const early = rms(b, 0, 2400);
  const late = rms(b, 24000 - 1200, 24000 + 1200);
  const drop = 20 * Math.log10(late / early);
  assert.ok(drop < -50 && drop > -70, `decay ${drop.toFixed(1)} dB`);
  assert.equal(b[0], 0, "sine phase starts at zero (no click)");
});

test("addMode ignores invalid input and clips to buffer bounds", () => {
  const b = new Float32Array(100);
  addMode(b, 50, SR, NaN, 1, 10);
  addMode(b, 50, SR, 30000, 1, 10); // above Nyquist
  addMode(b, 50, SR, 1000, 0, 10);
  assert.equal(peakOf(b), 0);
  addMode(b, -20, SR, 1000, 1, 10); // negative start: only the tail lands
  addMode(b, 95, SR, 1000, 1, 10); // runs past the end
  assert.ok(b.every(Number.isFinite));
});

test("Biquad low-pass attenuates high frequencies and stays stable", () => {
  const lo = new Float32Array(SR / 4);
  const hi = new Float32Array(SR / 4);
  for (let i = 0; i < lo.length; i++) {
    lo[i] = Math.sin((2 * Math.PI * 200 * i) / SR);
    hi[i] = Math.sin((2 * Math.PI * 8000 * i) / SR);
  }
  new Biquad().lowpass(SR, 1000).run(lo);
  new Biquad().lowpass(SR, 1000).run(hi);
  assert.ok(rms(lo, 2000) > 0.6, "pass band");
  assert.ok(rms(hi, 2000) < 0.02, "stop band");
  // Extreme parameters are clamped (no NaN).
  const x = new Float32Array(1000).fill(1);
  new Biquad().bandpass(SR, 1e9, 0).run(x);
  assert.ok(x.every(Number.isFinite));
});

test("Noise is deterministic and roughly zero-mean, unit-range", () => {
  const a = new Noise(42),
    b = new Noise(42);
  let s = 0,
    mx = 0;
  for (let i = 0; i < 10000; i++) {
    const v = a.white();
    assert.equal(v, b.white());
    s += v;
    mx = Math.max(mx, Math.abs(v));
  }
  assert.ok(Math.abs(s / 10000) < 0.05);
  assert.ok(mx <= 1);
  for (let i = 0; i < 1000; i++) assert.ok(Number.isFinite(a.pink()) && Number.isFinite(a.brownian()));
});

test("thump and noise burst render finite, decaying signals", () => {
  const b = new Float32Array(SR / 2);
  addThump(b, 0, SR, 90, 1, 0.04);
  addNoiseBurst(b, 100, SR, new Noise(1), 0.5, { decay: 0.01, hp: 500, lp: 6000, grit: 0.7 });
  assert.ok(b.every(Number.isFinite));
  assert.ok(peakOf(b) > 0.3);
  assert.ok(effectiveDuration(b, SR, -40) < 0.35);
});

test("trimTail removes silence and fades; normalize hits loudness target without clipping", () => {
  const b = new Float32Array(SR);
  addMode(b, 0, SR, 500, 0.9, alphaFromT60(0.1));
  const t = trimTail(b, SR);
  assert.ok(t.length < SR * 0.25, `trimmed to ${t.length}`);
  assert.equal(t[t.length - 1], 0);
  const g = normalize([t], SR, -16, -1);
  assert.ok(g > 0);
  assert.ok(peakOf(t) <= dbToGain(-1) + 1e-6);
});

test("makeLoop produces a seamless loop", () => {
  const n = new Noise(7);
  const b = new Float32Array(SR * 2);
  const lp = new Biquad().lowpass(SR, 800);
  for (let i = 0; i < b.length; i++) b[i] = lp.process(n.white());
  const loop = makeLoop(b, SR * 0.25);
  assert.equal(loop.length, b.length - SR * 0.25);
  assert.ok(loopSeamRatio(loop) < 6, `seam ratio ${loopSeamRatio(loop)}`);
});

test("poisson / bounces / stickSlip behave physically", () => {
  let count = 0;
  poisson(new Noise(3), 1, 200, () => 100, () => count++);
  assert.ok(count > 60 && count < 140, `poisson count ${count}`);
  const bs = bounces(2, 0.5);
  assert.ok(bs.length >= 3);
  for (let i = 1; i < bs.length; i++) {
    assert.ok(bs[i][0] > bs[i - 1][0], "times increase");
    assert.ok(bs[i][1] < bs[i - 1][1], "amplitudes decrease");
  }
  // Interval between bounces = 2v/g.
  assert.ok(Math.abs(bs[1][0] - (2 * 2 * 0.5) / 9.81) < 1e-9);
  const s = stickSlip(SR, new Noise(5), 0.3, () => 200, () => 1);
  assert.ok(s.every(Number.isFinite) && peakOf(s) > 0.5);
});

test("maxWindowRms and schroederRT60 sanity", () => {
  const b = new Float32Array(SR);
  for (let i = 0; i < b.length; i++) b[i] = Math.sin(i);
  assert.ok(Math.abs(maxWindowRms(b, SR) - Math.SQRT1_2) < 0.02);
  // Exponentially decaying noise with T60 = 0.8 s.
  const n = new Noise(9);
  const ir = new Float32Array(SR * 2);
  const k = Math.exp(-Math.log(1000) / (0.8 * SR));
  let e = 1;
  for (let i = 0; i < ir.length; i++, e *= k) ir[i] = n.white() * e;
  const rt = schroederRT60(ir, SR);
  assert.ok(Math.abs(rt - 0.8) < 0.08, `rt60 ${rt}`);
});
