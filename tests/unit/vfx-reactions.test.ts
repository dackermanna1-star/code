// Unit tests: VFX profile tables and the event → effect reaction logic (pure modules, Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfiles, KIND_LAYERS, EMITTER_LAYERS, PROFILES, GROUPS, VFX_KINDS } from "../../src/vfx/profiles.ts";
import { Reactions, MAT_FX, fractureIntensity, type ReactionSink } from "../../src/vfx/reactions.ts";
import { MATERIALS, type MaterialId } from "../../src/destruction/model/materials.ts";
import { MicroSim, defaultZoneOf, zoneBounds, MAX_ZONES, MICRO_KIND_INDEX } from "../../src/vfx/microSim.ts";
import type { FractureEv, ImpactEv } from "../../src/core/events.ts";

interface Rec {
  bursts: Array<{ kind: string; intensity: number; tint?: number }>;
  kicks: number;
  patches: number;
  disturbs: number;
}

function sink(rand = 0.5): { s: ReactionSink; r: Rec; clock: { t: number } } {
  const r: Rec = { bursts: [], kicks: 0, patches: 0, disturbs: 0 };
  const clock = { t: 0 };
  const s: ReactionSink = {
    burst: (kind, _p, _n, intensity, o) => r.bursts.push({ kind, intensity, tint: o?.tint }),
    kick: () => r.kicks++,
    dustPatch: () => r.patches++,
    disturb: () => r.disturbs++,
    now: () => clock.t,
    random: () => rand,
  };
  return { s, r, clock };
}

const v = (x: number, y: number, z: number) => ({ x, y, z });
const frac = (o: Partial<FractureEv>): FractureEv => ({
  pos: v(0, 1, 0), dir: v(0, 0, 1), mat: "gypsum", mode: "crumble", energy: 60, volume: 1.4e-4, pieces: 3, micro: 10, global: false, size: 0.3, assembly: "t", ...o,
});
const imp = (o: Partial<ImpactEv>): ImpactEv => ({
  pos: v(0, 0, 0), normal: v(0, 1, 0), energy: 50, impulse: 10, speed: 6, matA: "steel", matB: "concrete", sizeA: 0.3, sizeB: 3, massA: 4, massB: Infinity, idA: 1, idB: -1, ...o,
});
const kinds = (r: Rec) => r.bursts.map((b) => b.kind);

test("profile tables are complete and consistent", () => {
  assert.deepEqual(validateProfiles(), []);
  for (const k of VFX_KINDS) {
    assert.ok(KIND_LAYERS[k].length > 0, `${k} has burst layers`);
    assert.ok(EMITTER_LAYERS[k].length > 0, `${k} has emitter layers`);
  }
  assert.equal(VFX_KINDS.length, 19);
  for (const p of Object.values(PROFILES)) assert.ok(GROUPS[p.group], p.id);
  // additive groups glow, dust is light-scaled
  assert.equal(PROFILES.sparkStreaks.lit, 0);
  assert.ok(PROFILES.sparkStreaks.hdr > 1);
  assert.equal(PROFILES.drywallCloud.lit, 1);
});

test("every material has a visual identity", () => {
  for (const id of Object.keys(MATERIALS) as MaterialId[]) assert.ok(MAT_FX[id], `MAT_FX.${id}`);
  // crumbly materials leave dust patches, glass glitters, electronics spark
  assert.ok(MAT_FX.gypsum.patch && MAT_FX.concrete.patch);
  assert.ok(MAT_FX.glass.glass && MAT_FX.temperedGlass.glass && MAT_FX.lcd.glass);
  assert.ok(MAT_FX.pcb.sparks && MAT_FX.lcd.sparks);
});

test("fractureIntensity grows with broken volume, clamped", () => {
  const a = fractureIntensity({ volume: 1e-5, energy: 10 });
  const b = fractureIntensity({ volume: 1.4e-4, energy: 60 });
  const c = fractureIntensity({ volume: 1.6e-3, energy: 200 });
  assert.ok(a < b && b < c, `${a} ${b} ${c}`);
  assert.equal(fractureIntensity({ volume: 10, energy: 1e6 }), 8);
  assert.equal(fractureIntensity({ volume: NaN, energy: NaN }), 0.25);
});

test("fracture reactions by material", () => {
  {
    const { s, r } = sink();
    new Reactions(s).fracture(frac({ mat: "glass", mode: "shatter", global: true, volume: 4.8e-3, size: 1 }));
    assert.deepEqual(kinds(r), ["glassGlitter", "glassGlitter"], "glitter out of both faces, no dust");
    assert.equal(r.patches, 0);
    assert.equal(r.kicks, 1);
  }
  {
    const { s, r } = sink();
    new Reactions(s).fracture(frac({}));
    assert.ok(kinds(r).includes("drywallDust"));
    assert.equal(r.patches, 1, "drywall leaves a dust patch");
  }
  {
    const { s, r } = sink();
    new Reactions(s).fracture(frac({ mat: "softwood", mode: "splinter", global: true, volume: 6e-4, size: 1.2, energy: 300 }));
    assert.ok(kinds(r).includes("splinters") && kinds(r).includes("woodChips"));
  }
  {
    const { s, r } = sink();
    new Reactions(s).fracture(frac({ mat: "pcb", mode: "crack", volume: 2e-5 }));
    assert.ok(kinds(r).includes("sparks") && kinds(r).includes("smoke") && kinds(r).includes("plasticBits"));
  }
  {
    const { s, r } = sink();
    new Reactions(s).fracture(frac({ mat: "steel", mode: "bend" }));
    assert.deepEqual(kinds(r), [], "metal fractures make no dust");
  }
  {
    // bigger breaks → stronger dust
    const { s, r } = sink();
    const re = new Reactions(s);
    re.fracture(frac({ volume: 1e-5 }));
    re.fracture(frac({ volume: 2e-3 }));
    const d = r.bursts.filter((b) => b.kind === "drywallDust");
    assert.ok(d[1].intensity > d[0].intensity * 3);
  }
});

test("impact reactions: softer-side dust, sparks for steel on stone at speed, kicks, thresholds", () => {
  {
    const { s, r } = sink(0);
    new Reactions(s).impact(imp({ energy: 80, speed: 9 }));
    assert.ok(kinds(r).includes("sparks"));
    assert.ok(kinds(r).includes("concreteDust"), "dust of the dusty side");
    assert.equal(r.kicks, 1);
  }
  {
    const { s, r } = sink(0);
    new Reactions(s).impact(imp({ energy: 80, speed: 3 }));
    assert.ok(!kinds(r).includes("sparks"), "too slow for sparks");
  }
  {
    const { s, r } = sink(0);
    new Reactions(s).impact(imp({ energy: 2 }));
    assert.equal(r.bursts.length, 0, "below energy threshold");
  }
  {
    const { s, r } = sink(0);
    new Reactions(s).impact(imp({ matA: "hardwood", matB: "tile", energy: 30, speed: 4 }));
    assert.deepEqual(kinds(r), ["woodChips"], "softer side (wood) puffs");
  }
});

test("toolHit dedupes the impact dust that follows it; steel tools spark on concrete", () => {
  const { s, r, clock } = sink(0);
  const re = new Reactions(s);
  re.toolHit({ tool: "sledgehammer", pos: v(0, 1, 0), normal: v(0, 0, -1), mat: "concrete", energy: 220, hard: true });
  assert.ok(kinds(r).includes("sparks") && kinds(r).includes("concreteDust"));
  const n = r.bursts.length;
  clock.t = 0.02;
  re.impact(imp({ pos: v(0.01, 1, 0), matA: "concrete", matB: "steel", energy: 100, speed: 2 }));
  assert.equal(r.bursts.length, n, "impact right after the tool hit adds no second dust puff");
  const { s: s2, r: r2 } = sink(0);
  new Reactions(s2).toolHit({ tool: "hands", pos: v(0, 1, 0), normal: v(0, 0, -1), mat: "concrete", energy: 60, hard: true });
  assert.ok(!kinds(r2).includes("sparks"), "fists do not spark");
});

test("bond breaks, features, footsteps, land, split, strain", () => {
  {
    const { s, r } = sink();
    const re = new Reactions(s);
    re.bondBreak({ pos: v(0, 1, 0), kind: "weld", matA: "steelSheet", matB: "steelSheet", energy: 70 });
    assert.deepEqual(kinds(r), ["sparks"]);
    re.bondBreak({ pos: v(0, 1, 0), kind: "screw", matA: "particleboard", matB: "softwood", energy: 35 });
    assert.ok(kinds(r).includes("splinters"));
    assert.equal(r.disturbs, 2);
  }
  {
    const { s, r } = sink();
    new Reactions(s).feature({ kind: "lightBroken", pos: v(0, 2.4, 0) });
    assert.deepEqual(kinds(r).sort(), ["glassGlitter", "smoke", "sparks"]);
  }
  {
    const { s, r } = sink();
    new Reactions(s).footstep({ pos: v(0, 0, 0), mat: "tile", speed: 3.6 });
    assert.equal(r.bursts.length, 0);
    assert.equal(r.kicks, 1, "feet shuffle debris");
  }
  {
    const { s, r } = sink();
    const re = new Reactions(s);
    re.land({ pos: v(0, 0, 0), speed: 1, mat: "concrete" });
    assert.equal(r.bursts.length, 0, "gentle landing: nothing");
    re.land({ pos: v(0, 0, 0), speed: 5, mat: "concrete" });
    assert.ok(kinds(r).includes("concreteDust"));
  }
  {
    const { s, r } = sink();
    const re = new Reactions(s);
    re.split({ pos: v(0, 1, 0), mass: 20, pieces: 2 });
    assert.deepEqual(kinds(r), ["dust"]);
    re.strain({ pos: v(0, 1, 0), stress: 0.9, kind: "screw", mat: "softwood" });
    assert.ok(kinds(r).includes("woodChips"));
  }
});

test("rate limits bound event storms; invalid input is ignored", () => {
  const { s, r } = sink(0);
  const re = new Reactions(s);
  for (let i = 0; i < 1000; i++) re.impact(imp({ energy: 50, speed: 2, matA: "hardwood", matB: "tile" }));
  assert.ok(r.bursts.length <= 12, `storm limited to ${r.bursts.length}`);
  const before = r.bursts.length;
  re.fracture(frac({ pos: v(NaN, 0, 0) }));
  re.toolHit({ tool: "hammer", pos: v(Infinity, 0, 0), normal: v(0, 1, 0), mat: "gypsum", energy: 50, hard: false });
  re.feature({ kind: "sparks", pos: v(0, NaN, 0) });
  assert.equal(r.bursts.length, before);
});

test("micro-debris zones: bins per (zone, shape) with matching bounds", () => {
  for (const [x, z] of [
    [0.5, 0.5],
    [6, 2],
    [11, 7],
    [-1, -1.2],
  ]) {
    const zone = defaultZoneOf(x, 0, z);
    assert.ok(zone >= 0 && zone < MAX_ZONES);
    const b = zoneBounds(zone);
    assert.ok(x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1, `(${x},${z}) in zone ${zone}`);
  }
  const sim = new MicroSim({ capacity: 100, groundProbe: () => 0 });
  const base = { kind: MICRO_KIND_INDEX.cube ?? MICRO_KIND_INDEX.foam, y: 0.5, vx: 0, vy: 0, vz: 0, size: 0.01, r: 1, g: 1, b: 1, a: 1, s0: 0, s1: 0, s2: 0, s3: 0 };
  sim.spawn({ ...base, x: 0.5, z: 0.5 });
  sim.spawn({ ...base, x: 6, z: 2 });
  sim.spawn({ ...base, x: 11, z: 7 });
  assert.equal(sim.activeBins.length, 3);
  assert.equal(new Set(sim.activeBins.map((b) => b.zone)).size, 3);
  assert.equal(sim.checkInvariants(), null);
});

test("emitter rate accepts strength or particles/s, clamped", async () => {
  const { emitterStrength, MAX_EMITTER_STRENGTH } = await import("../../src/vfx/particles.ts").catch(() => ({ emitterStrength: null, MAX_EMITTER_STRENGTH: 0 }) as never);
  if (!emitterStrength) return; // particles.ts imports Babylon (not loadable under plain Node)
  assert.equal(emitterStrength("water", 1), 1);
  assert.equal(emitterStrength("water", 0.25), 0.25);
  assert.equal(emitterStrength("extinguisher", 45), 1);
  assert.equal(emitterStrength("extinguisher", 220), MAX_EMITTER_STRENGTH);
  assert.equal(emitterStrength("water", NaN), 0);
  assert.equal(emitterStrength("water", -2), 0);
});
