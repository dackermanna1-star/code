// Unit tests for the procedural sound bank: coverage, sanity of every buffer, determinism,
// physically motivated spectral properties and generation cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOUND_DEFS, SOUND_BY_ID, PROFILES, DEBRIS_PROFILES, renderVariant, resolveSound, sizeRate, generateBank, NORM_PEAK_DB, SIZE_FAMILIES } from "../../src/audio/bank.ts";
import { spectralCentroid, fundamentalEstimate, effectiveDuration, loopSeamRatio, peak, toDb } from "../../src/audio/analysis.ts";

const SR = 48000;
const render = (id: string, v = 0) => {
  const d = SOUND_BY_ID.get(id);
  assert.ok(d, `missing ${id}`);
  return renderVariant(d!, v, SR);
};

test("bank covers every material profile × size class and the brief's generator list", () => {
  for (const p of PROFILES) for (const s of ["s", "m", "l"]) assert.ok(SOUND_BY_ID.has(`impact.${p}.${s}`), `impact.${p}.${s}`);
  for (const p of DEBRIS_PROFILES) {
    assert.ok(SOUND_BY_ID.has(`tick.${p}`));
    assert.ok(SOUND_BY_ID.has(`rattle.${p}`));
  }
  const required = [
    "shatter.glass.s", "shatter.glass.l", "shatter.tempered", "shatter.ceramic.s", "shatter.ceramic.l",
    "break.wood.crack", "break.wood.snap", "break.wood.splinter", "break.drywall.punch", "break.drywall.crumble",
    "break.concrete.chip", "break.concrete.crumble", "metal.dent", "metal.clang", "metal.tear", "break.plastic.crack",
    "break.plastic.snap", "bond.screw", "bond.nail", "bond.glue", "bond.weld", "bond.mortar", "creak.hinge", "creak.wood",
    "strain.wood", "strain.metal", "swing.light", "swing.medium", "swing.heavy", "punch.thud", "kick.thud", "ouch",
    "step.wood", "step.tile", "step.carpet", "step.concrete", "jump", "land", "cloth.grab", "cloth.throw", "cloth.drop",
    "door.creak", "door.latch", "door.slam", "bulb.pop", "spark.crackle", "elec.buzz", "water.spray", "water.drip",
    "fridge.hum", "amb.city", "amb.horn", "amb.wind", "alarm.chirp", "fall.distant",
  ];
  for (const id of required) assert.ok(SOUND_BY_ID.has(id), id);
  // Ids are unique.
  assert.equal(new Set(SOUND_DEFS.map((d) => d.id)).size, SOUND_DEFS.length);
});

test("every sound renders finite, audible, normalised buffers (variant 0)", () => {
  for (const d of SOUND_DEFS) {
    const r = renderVariant(d, 0, SR);
    assert.ok(r.chans.length >= 1, d.id);
    for (const c of r.chans) {
      assert.ok(c.length > 10, `${d.id} length`);
      let bad = 0;
      for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) bad++;
      assert.equal(bad, 0, `${d.id} has NaN`);
      const pk = peak(c);
      assert.ok(pk > 0.05, `${d.id} silent (peak ${pk})`);
      assert.ok(pk <= Math.pow(10, NORM_PEAK_DB / 20) + 1e-4, `${d.id} clips (peak ${pk})`);
    }
    if (d.loop) for (const c of r.chans) assert.ok(loopSeamRatio(c) < 12, `${d.id} loop seam ${loopSeamRatio(c).toFixed(1)}`);
    else assert.ok(r.chans[0].length / r.sr < 3.5, `${d.id} too long`);
  }
});

test("rendering is deterministic per id and variant; variants differ", () => {
  const a = render("impact.wood.m", 1).chans[0];
  const b = render("impact.wood.m", 1).chans[0];
  assert.deepEqual(a, b);
  const c = render("impact.wood.m", 2).chans[0];
  assert.notDeepEqual(a.slice(0, 2000), c.slice(0, 2000));
});

test("glass sounds brighter than wood (spectral centroid)", () => {
  for (const s of ["s", "m", "l"]) {
    const g = render(`impact.glass.${s}`);
    const w = render(`impact.wood.${s}`);
    const cg = spectralCentroid(g.chans[0], g.sr);
    const cw = spectralCentroid(w.chans[0], w.sr);
    assert.ok(cg > cw * 1.3, `${s}: glass ${cg.toFixed(0)} Hz vs wood ${cw.toFixed(0)} Hz`);
  }
  const sh = render("shatter.glass.l");
  const sw = render("break.wood.snap");
  assert.ok(spectralCentroid(sh.chans[0], sh.sr) > spectralCentroid(sw.chans[0], sw.sr) * 1.5);
});

test("larger objects sound lower (fundamental falls with size class)", () => {
  for (const p of ["glass", "ceramic", "wood", "metal", "metalThin", "plastic", "stone"]) {
    const f = ["s", "m", "l"].map((s) => {
      const r = render(`impact.${p}.${s}`);
      return fundamentalEstimate(r.chans[0], r.sr);
    });
    assert.ok(f[0] > f[1] && f[1] > f[2], `${p}: ${f.map((x) => x.toFixed(0)).join(" > ")}`);
    // Roughly inverse-proportional to size for resonant materials (0.08 / 0.3 / 1.1 m).
    assert.ok(f[0] / f[2] > 4, `${p} ratio ${(f[0] / f[2]).toFixed(1)}`);
  }
});

test("material damping: metal rings longest, wood/drywall/soft are short; shatters outlast knocks", () => {
  const dur = (id: string) => {
    const r = render(id);
    return effectiveDuration(r.chans[0], r.sr, -40);
  };
  const metal = dur("impact.metal.m");
  const glass = dur("impact.glass.m");
  const wood = dur("impact.wood.m");
  const dry = dur("impact.drywall.m");
  const soft = dur("impact.soft.m");
  assert.ok(metal > glass && glass > wood, `metal ${metal} glass ${glass} wood ${wood}`);
  assert.ok(wood > soft && dry < 0.3, `wood ${wood} drywall ${dry} soft ${soft}`);
  assert.ok(dur("shatter.glass.l") > 3 * wood, "shatter longer than a knock");
  assert.ok(dur("shatter.glass.l") > dur("shatter.glass.s"), "pane shatter longer than glassware");
  assert.ok(dur("shatter.tempered") > 1.0, "dicing shower lasts > 1 s");
});

test("footsteps: tile clicks brighter than carpet thuds", () => {
  const t = render("step.tile");
  const c = render("step.carpet");
  assert.ok(spectralCentroid(t.chans[0], t.sr) > 4 * spectralCentroid(c.chans[0], c.sr));
});

test("swing whooshes: heavier tool = lower and slower", () => {
  const l = render("swing.light");
  const h = render("swing.heavy");
  assert.ok(spectralCentroid(l.chans[0], l.sr) > spectralCentroid(h.chans[0], h.sr) * 1.3);
  assert.ok(effectiveDuration(h.chans[0], h.sr) > effectiveDuration(l.chans[0], l.sr));
});

test("resolveSound: families pick size classes and pitch-correct; aliases work", () => {
  const a = resolveSound("impact.wood", 0.07)!;
  assert.equal(a.def.id, "impact.wood.s");
  assert.ok(a.rate > 1, "smaller than the class → pitched up");
  assert.equal(resolveSound("impact.wood", 2.0)!.def.id, "impact.wood.l");
  assert.equal(resolveSound("impact.wood")!.def.id, "impact.wood.m");
  assert.equal(resolveSound("fridgeHum")!.def.id, "fridge.hum");
  assert.equal(resolveSound("Smoke Alarm")!.def.id, "alarm.chirp");
  assert.equal(resolveSound("nope.nothing"), null);
  const d = SOUND_BY_ID.get("impact.glass.m")!;
  assert.equal(sizeRate(d, 0.3), 1);
  assert.ok(sizeRate(d, 0.001) <= 2 && sizeRate(d, 100) >= 0.5, "rate clamped");
  assert.ok(SIZE_FAMILIES.includes("impact.metal"));
});

test("full bank generation is within budget and reports stats", async () => {
  let n = 0;
  const t0 = performance.now();
  const st = await generateBank({ sr: SR, sync: true, budgetMs: 1e9, sink: () => n++ });
  const ms = performance.now() - t0;
  assert.equal(st.buffers, n);
  assert.equal(n, SOUND_DEFS.reduce((a, d) => a + d.variants, 0));
  assert.ok(st.bytes < 70e6, `bank ${(st.bytes / 1e6).toFixed(1)} MB`);
  // Generous bound for a loaded CI machine; typical desktop ≈ 0.6–1.2 s.
  assert.ok(ms < 8000, `generation ${ms.toFixed(0)} ms`);
  console.log(`  bank: ${n} buffers, ${(st.bytes / 1e6).toFixed(1)} MB, ${ms.toFixed(0)} ms (cpu ${st.cpuMs.toFixed(0)} ms)`);
});

test("budget keeps coverage: variant 0 of everything even with a zero budget", async () => {
  const seen = new Map<string, number>();
  const st = await generateBank({ sr: 24000, sync: true, budgetMs: 0, sink: (d) => seen.set(d.id, (seen.get(d.id) ?? 0) + 1) });
  assert.equal(seen.size, SOUND_DEFS.length);
  assert.ok(st.skippedVariants > 0);
  for (const v of seen.values()) assert.equal(v, 1);
});

test("loudness normalisation keeps families comparable", () => {
  const lv = (id: string) => {
    const r = render(id);
    return toDb(peak(r.chans[0]));
  };
  // Peaks of normalised one-shots stay within a sane window.
  for (const id of ["impact.wood.m", "impact.metal.m", "shatter.glass.l", "step.wood", "bond.screw"]) {
    const p = lv(id);
    assert.ok(p > -20 && p <= -0.99, `${id} peak ${p.toFixed(1)} dBFS`);
  }
});
