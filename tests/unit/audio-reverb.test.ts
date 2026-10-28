// Unit tests for the generated room impulse responses and IR weighting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IR_SPECS, generateIR, irWeights } from "../../src/audio/reverb.ts";
import { schroederRT60, spectralCentroid } from "../../src/audio/analysis.ts";
import { Biquad } from "../../src/audio/synth/dsp.ts";

const SR = 48000;

test("IRs decay with the specified RT60 (±20 %) and are mid-band normalised", () => {
  for (const spec of IR_SPECS) {
    const [l, r] = generateIR(spec, SR);
    assert.equal(l.length, r.length);
    let e = 0;
    for (const ch of [l, r]) {
      const bp = new Biquad().bandpass(SR, 800, 0.35);
      for (let i = 0; i < ch.length; i++) {
        const y = bp.process(ch[i]);
        e += y * y;
      }
    }
    const t = (spec.trim ?? 1) ** 2;
    assert.ok(Math.abs(e - t) < 1e-3 * t, `${spec.id} mid-band energy ${e}`);
    const rt = schroederRT60(l, SR);
    assert.ok(Math.abs(rt - spec.rt60) / spec.rt60 < 0.2, `${spec.id}: RT60 ${rt.toFixed(2)} vs ${spec.rt60}`);
    assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite));
    // Stereo decorrelation.
    let dot = 0,
      nl = 0,
      nr = 0;
    for (let i = 0; i < l.length; i++) {
      dot += l[i] * r[i];
      nl += l[i] * l[i];
      nr += r[i] * r[i];
    }
    assert.ok(Math.abs(dot / Math.sqrt(nl * nr)) < 0.5, `${spec.id} channels too correlated`);
  }
});

test("tiled bathroom is longer and brighter than the dead bedroom", () => {
  const tiled = generateIR(IR_SPECS.find((s) => s.id === "tiled")!, SR)[0];
  const dead = generateIR(IR_SPECS.find((s) => s.id === "dead")!, SR)[0];
  assert.ok(tiled.length > dead.length * 2);
  // Brightness of the late tail (after 50 ms).
  const s = Math.floor(0.05 * SR);
  assert.ok(spectralCentroid(tiled, SR, s) > spectralCentroid(dead, SR, s) * 1.2);
});

test("irWeights interpolates between archetypes and sums to 1", () => {
  const sum = (w: number[]) => w[0] + w[1] + w[2];
  for (const rt of [0.05, 0.3, 0.35, 0.55, 0.65, 1.1, 2.5]) assert.ok(Math.abs(sum(irWeights({ rt60: rt })) - 1) < 1e-9);
  assert.deepEqual(irWeights({ rt60: 1.1 }), [1, 0, 0]);
  assert.deepEqual(irWeights({ rt60: 0.3 }), [0, 0, 1]);
  const w = irWeights({ rt60: 0.6 });
  assert.ok(w[1] > w[0] && w[0] > 0, "kitchen/hall mostly living with some tiled");
  assert.deepEqual(irWeights(null), irWeights({ rt60: 0.5 }));
});
