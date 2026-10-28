// Unit tests: VFX profile tables and the event → effect reaction logic (pure modules, Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfiles, KIND_LAYERS, EMITTER_LAYERS, PROFILES, GROUPS, VFX_KINDS } from "../../src/vfx/profiles.ts";
import { Reactions, MAT_FX, DUST_FX, fractureIntensity, type ReactionSink } from "../../src/vfx/reactions.ts";
import { EmitterRate, MAX_EMITTER_STRENGTH as MAX_STRENGTH } from "../../src/vfx/emitterRate.ts";
import { roomZoneOf, roomZoneBounds, ROOM_ZONE_GRID_BASE } from "../../src/vfx/zones.ts";
import { ROOMS } from "../../src/world/plan.ts";
import { MATERIALS, type MaterialId } from "../../src/destruction/model/materials.ts";
import { MicroSim, defaultZoneOf, zoneBounds, MAX_ZONES, MICRO_KIND_INDEX } from "../../src/vfx/microSim.ts";
import type { FractureEv, ImpactEv } from "../../src/core/events.ts";

interface Rec {
  bursts: Array<{ kind: string; intensity: number; tint?: number }>;
  kicks: number;
  patches: number;
  disturbs: number;
  patchNormals: Array<{ x: number; y: number; z: number } | undefined>;
  revalidations: Array<{ radius: number; surfaceRadius: number }>;
}

function sink(rand = 0.5): { s: ReactionSink; r: Rec; clock: { t: number } } {
  const r: Rec = { bursts: [], kicks: 0, patches: 0, disturbs: 0, patchNormals: [], revalidations: [] };
  const clock = { t: 0 };
  const s: ReactionSink = {
    burst: (kind, _p, _n, intensity, o) => r.bursts.push({ kind, intensity, tint: o?.tint }),
    kick: () => r.kicks++,
    dustPatch: (_p, _s, _t, n) => {
      r.patches++;
      r.patchNormals.push(n);
    },
    disturb: () => r.disturbs++,
    revalidate: (_p, radius, surfaceRadius) => r.revalidations.push({ radius, surfaceRadius }),
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

test("emitter rate: strength contract, legacy particle rates scale from the first value", () => {
  const warns: string[] = [];
  const water = new EmitterRate((m) => warns.push(m));
  assert.equal(water.resolve("water", 1), 1);
  assert.equal(water.resolve("water", 0.25), 0.25);
  assert.equal(water.resolve("water", 1.3), 1.3);
  assert.equal(water.resolve("water", 6), MAX_STRENGTH, "strengths are capped");
  assert.equal(water.resolve("water", NaN), 0);
  assert.equal(water.resolve("water", -2), 0);
  assert.equal(water.perSecond, false);
  // the tools module: created at 220 "particles/s" (full pressure), then setRate(220 × pressure)
  const ext = new EmitterRate((m) => warns.push(m));
  assert.equal(ext.resolve("extinguisher", 220), 1, "full pressure = nominal, not the cap");
  assert.ok(ext.perSecond);
  let prev = -1;
  for (const pressure of [0.2, 0.35, 0.5, 0.75, 1]) {
    const s = ext.resolve("extinguisher", 220 * pressure);
    assert.ok(Math.abs(s - pressure) < 1e-9, `pressure ${pressure} → ${s}`);
    assert.ok(s > prev, "monotonic");
    prev = s;
  }
  // continuous across the old 8/9 boundary
  assert.ok(Math.abs(ext.resolve("extinguisher", 9) - ext.resolve("extinguisher", 8)) < 0.01);
  assert.ok(warns.length <= 1, "warns at most once");
});

test("fracture dust follows the shared material table's dust kind", () => {
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const dk = MATERIALS[id].dust;
    if (dk) assert.equal(MAT_FX[id].dust, DUST_FX[dk], `${id}: ${dk}`);
    if (MATERIALS[id].sparks) assert.ok(MAT_FX[id].sparks, `${id} sparks`);
  }
  assert.equal(MAT_FX.gypsum.dust, "drywallDust");
  assert.equal(MAT_FX.insulation.dust, "insulationFluff");
  assert.equal(MAT_FX.ceramic.dust, "dust");
  assert.equal(MAT_FX.mdf.dust, "woodChips");
  // materials without a shared DustKind keep their hand-tuned faint puff
  assert.equal(MAT_FX.fabric.dust, "dust");
  const { s, r } = sink();
  new Reactions(s).fracture(frac({ mat: "plaster" }));
  assert.ok(r.bursts.some((b) => b.kind === "drywallDust" && b.tint === MAT_FX.plaster.dustTint), "plaster → tinted drywall cloud");
});

test("wall fractures pass the outward normal to the dust patch; supports are revalidated", () => {
  const { s, r } = sink();
  const re = new Reactions(s);
  re.fracture(frac({ mat: "gypsum", dir: v(0, 0, 1), volume: 0.036, size: 2.4, global: true }));
  assert.equal(r.patches, 1);
  assert.deepEqual(r.patchNormals[0], { x: -0, y: -0, z: -1 });
  assert.equal(r.revalidations.length, 1);
  assert.ok(r.revalidations[0].surfaceRadius > 0.5, "a snapped panel removes wall decals over a large area");
  re.fracture(frac({ mat: "gypsum", volume: 1.4e-4, global: false }));
  assert.ok(r.revalidations[1].surfaceRadius < 0.2, "a small breakout removes only nearby wall decals");
  re.split({ pos: v(0, 1, 0), mass: 20, pieces: 2 });
  re.moved(v(0, 0.8, 0));
  assert.equal(r.revalidations.length, 4);
  assert.equal(r.revalidations[3].surfaceRadius, 0, "moving an object never removes wall marks");
});

test("micro-debris zones follow the apartment rooms", () => {
  for (let i = 0; i < ROOMS.length; i++) {
    const rm = ROOMS[i];
    const cx = (rm.x0 + rm.x1) / 2,
      cz = (rm.z0 + rm.z1) / 2;
    const zone = roomZoneOf(cx, 0, cz);
    assert.equal(zone, i, rm.id);
    const b = roomZoneBounds(zone);
    assert.deepEqual(b, { x0: rm.x0, x1: rm.x1, z0: rm.z0, z1: rm.z1 });
  }
  // living vs bedroom 2 either side of x = 9.2 are different zones (old 4 m grid merged them)
  assert.notEqual(roomZoneOf(9.0, 0, 2), roomZoneOf(9.4, 0, 2));
  // outside every room: fallback grid, still valid
  const z = roomZoneOf(-3, 0, -5);
  assert.ok(z >= ROOM_ZONE_GRID_BASE && z < MAX_ZONES);
  const b = roomZoneBounds(z);
  assert.ok(-3 >= b.x0 && -3 < b.x1 && -5 >= b.z0 && -5 < b.z1);
  const sim = new MicroSim({ capacity: 10, groundProbe: () => 0, zoneOf: roomZoneOf });
  const base = { kind: MICRO_KIND_INDEX.foam, y: 0.5, vx: 0, vy: 0, vz: 0, size: 0.01, r: 1, g: 1, b: 1, a: 1, s0: 0, s1: 0, s2: 0, s3: 0 };
  sim.spawn({ ...base, x: -3, z: -5 });
  assert.equal(sim.activeBins[0].zone, z);
  assert.equal(sim.checkInvariants(), null);
});
