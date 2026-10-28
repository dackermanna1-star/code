// Fixture builders: every registered object builds with full validation and NO warnings,
// realistic masses (ranges stated per object), features wired to real parts, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { FIXTURES_OBJECTS, buildCurtains, buildVenetianBlind, buildBaseboardHeater } from "../../src/objects/fixtures/index.ts";
import { buildWallClock } from "../../src/objects/fixtures/hardware.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import type { AssemblyDef, PartDef } from "../../src/destruction/model/types.ts";

Builder.warnMode = "throw";

const partMass = (p: PartDef): number => p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
const mass = (d: AssemblyDef): number => d.parts.reduce((s, p) => s + partMass(p), 0);

/** Mass ranges (kg) per object type — real-world references from the brief / product data. */
const RANGES: Record<string, [number, number]> = {
  flushMountLight: [1, 2.5], // brief: flush-mount fixture 1–2.5 kg
  pendantLight: [1.5, 3], // brief: pendant 1.5–3 kg
  trackLight: [0.6, 1.5], // 1.1 m 3-head track bar
  schoolhouseLight: [1, 2.5], // opal glass globe + fitter
  battenLight: [0.2, 0.6], // porcelain lampholder + bulb
  ceilingFan: [6, 9], // brief: ceiling fan 6–9 kg
  venetianBlind: [1.5, 3], // brief: blinds 1.5–3 kg per window
  curtains: [3, 7], // rod + rings + two ~1.2 kg panels
  smokeDetector: [0.12, 0.35],
  thermostat: [0.1, 0.35],
  baseboardHeater: [4, 7], // brief: baseboard heater 4–7 kg
  miniSplitAC: [9, 13], // brief: AC indoor unit 9–13 kg
  doorChime: [0.2, 0.8],
  wallClock: [0.3, 1.0],
  doorStop: [0.05, 0.2],
  robeHooks: [0.2, 0.8],
  fullLengthMirror: [4, 9],
};

function finite(d: AssemblyDef): boolean {
  for (const p of d.parts) for (const v of p.poly.verts) if (!Number.isFinite(v.x + v.y + v.z)) return false;
  for (const b of d.bonds) if (b.anchor && !Number.isFinite(b.anchor.x + b.anchor.y + b.anchor.z)) return false;
  return true;
}

for (const [type, build] of Object.entries(FIXTURES_OBJECTS)) {
  test(`${type}: builds (full validation, no warnings), realistic mass, deterministic`, () => {
    const d = build({ validate: "full" });
    assert.equal(d.type, type);
    assert.ok(d.parts.length > 0);
    assert.ok(finite(d), "no NaN/Infinity");
    const m = mass(d);
    const [lo, hi] = RANGES[type];
    assert.ok(m >= lo && m <= hi, `${type} mass ${m.toFixed(2)} kg outside [${lo}, ${hi}]`);
    const names = new Set(d.parts.map((p) => p.name));
    for (const f of d.features ?? []) assert.ok(names.has((f as { part: string }).part), `feature ${f.type} on unknown part`);
    for (const b of d.bonds) {
      assert.ok(names.has(b.a), `bond part ${b.a}`);
      assert.ok(b.b === "world" || names.has(b.b), `bond part ${b.b}`);
    }
    assert.ok(d.bonds.some((b) => b.b === "world"), "fixtures are anchored to the building");
    const again = build({ validate: "full" });
    assert.equal(JSON.stringify(again), JSON.stringify(d), "deterministic");
  });
}

test("every light is a mains bulb part made of glass with a warm 2700–3000 K colour", () => {
  for (const type of ["flushMountLight", "pendantLight", "trackLight", "schoolhouseLight", "battenLight", "ceilingFan"]) {
    const d = FIXTURES_OBJECTS[type]();
    const lights = (d.features ?? []).filter((f) => f.type === "light");
    assert.ok(lights.length >= 1, `${type} has lights`);
    for (const l of lights) {
      if (l.type !== "light") continue;
      const part = d.parts.find((p) => p.name === l.part)!;
      assert.equal(part.mat, "glass", `${type}: light part is glass`);
      assert.equal(l.mains, true);
      assert.ok([0xffa957, 0xffb46b].includes(l.color), `${type}: warm colour`);
      // shared photometric scale: ceiling fixtures ~1.5–2× a table lamp (lamps ~0.7–1.0)
      assert.ok(l.intensity >= 1 && l.intensity <= 2 && l.range >= 4 && l.range <= 8, `${type}: intensity/range`);
    }
    // one light feature per fixture (interior-light cap per material is shared with other areas)
    assert.equal(lights.length, 1, `${type}: one light feature`);
  }
  const track = FIXTURES_OBJECTS.trackLight();
  const spot = track.features!.find((f) => f.type === "light");
  assert.ok(spot && spot.type === "light" && spot.kind === "spot" && spot.part.endsWith("lens1"), "one wide spot on the middle head");
  assert.equal(track.parts.filter((p) => /lens\d$/.test(p.name) && p.mat === "glass").length, 3, "three glowing lenses");
  // the fan's second candle bulb glows without its own light
  const fan = FIXTURES_OBJECTS.ceilingFan();
  assert.equal(fan.parts.filter((p) => p.name.endsWith("_glass") && p.name.startsWith("bulb")).length, 2);
});

test("glass bowl and globe are held by exactly three thumbscrews spread around the rim", () => {
  for (const [type, fixed] of [
    ["flushMountLight", "pan"],
    ["schoolhouseLight", "fitter"],
  ] as const) {
    const d = FIXTURES_OBJECTS[type]();
    const screws = d.bonds.filter((b) => b.kind === "screw" && b.b === fixed && /^(bowl|globe)_/.test(b.a));
    assert.equal(screws.length, 3, `${type}: three thumbscrews`);
  }
});

test("wall clock: one set of hands matching the printed dial, clockwise from the front, centred texture", () => {
  const d = buildWallClock({ validate: "full" });
  // hands at the printed 10:09:36; from the front (+Z) the viewer's right is −X
  // the hand's centroid lies on its axis, past the spindle (tip longer than tail)
  const tip = (name: string): { x: number; y: number } => {
    const vs = d.parts.find((p) => p.name === name)!.poly.verts;
    return { x: vs.reduce((s, v) => s + v.x, 0) / vs.length, y: vs.reduce((s, v) => s + v.y, 0) / vs.length };
  };
  const ang = (name: string): number => ((Math.atan2(-tip(name).x, tip(name).y) * 180) / Math.PI + 360) % 360;
  const near = (a: number, b: number): boolean => Math.abs(((a - b + 540) % 360) - 180) < 1;
  assert.ok(near(ang("hand_hour"), (10 + 9.6 / 60) * 30), `hour ${ang("hand_hour")}`);
  assert.ok(near(ang("hand_minute"), 9.6 * 6), `minute ${ang("hand_minute")}`);
  assert.ok(near(ang("hand_second"), 216), `second ${ang("hand_second")}`);
  const dial = d.parts.find((p) => p.name === "dial")!;
  const cap = dial.poly.faces.find((f) => f.n.z > 0.9)!;
  assert.ok(cap.attr.uv.u.x < -0.99 && cap.attr.uv.v.y > 0.99, "upright, unmirrored dial");
  assert.ok(Math.abs(cap.attr.uv.u0 - 0.15) < 1e-9 && Math.abs(cap.attr.uv.v0 - 0.15) < 1e-9, "texture centred on the dial");
});

test("mini-split blower is rigid (no motor) and the thermostat has no microwave screen", () => {
  const ac = FIXTURES_OBJECTS.miniSplitAC();
  assert.equal((ac.features ?? []).filter((f) => f.type === "motor").length, 0);
  assert.ok(!ac.bonds.some((b) => b.kind === "hinge" && (b.a === "blower" || b.b === "blower")));
  const th = FIXTURES_OBJECTS.thermostat();
  assert.equal((th.features ?? []).filter((f) => f.type === "screen").length, 0);
});

test("builder options are clamped to buildable ranges (no warnings at the edges)", () => {
  for (const len of [0.3, 0, Number.NaN, 5]) {
    const d = buildBaseboardHeater({ len, validate: "full" });
    assert.ok(finite(d));
  }
  for (const o of [{ tilt: 0 }, { tilt: 90 }, { drop: 0.15 }, { w: 0.1 }, { slat: 0.2 }]) {
    const d = buildVenetianBlind({ ...o, validate: "full" });
    assert.ok(finite(d));
    assert.ok(d.parts.filter((p) => p.name.startsWith("slat")).length >= 5, JSON.stringify(o));
  }
  const d = buildCurtains({ rodLen: 1.5, brackets: [0], panels: [{ x0: -0.6, dir: 1, strips: 0 }], rodHeight: 2.2, validate: "full" });
  assert.equal(d.parts.filter((p) => p.name.startsWith("strip")).length, 1);
  assert.throws(() => buildCurtains({ rodLen: 0, brackets: [0], panels: [], rodHeight: 2.2 }));
});

test("ceiling fan: free-spinning hinged rotor driven by a mains motor, 5 blades screwed to irons", () => {
  const d = FIXTURES_OBJECTS.ceilingFan();
  const motor = d.features!.find((f) => f.type === "motor");
  assert.ok(motor && motor.type === "motor");
  assert.ok(motor.speed >= 12.5 && motor.speed <= 19, "2–3 rev/s");
  const hinges = d.bonds.filter((b) => b.kind === "hinge" && b.joint?.group === motor.joint);
  assert.equal(hinges.length, 2, "two bearing pivots");
  for (const h of hinges) {
    assert.ok(h.joint!.max - h.joint!.min >= 2 * Math.PI - 1e-6, "free rotation");
    assert.ok(Math.abs(h.joint!.axis.y) > 0.999, "vertical axis");
  }
  const blades = d.parts.filter((p) => p.name.startsWith("blade"));
  assert.equal(blades.length, 5);
  for (const bl of blades) {
    const bb = d.bonds.filter((b) => b.a === bl.name || b.b === bl.name);
    assert.equal(bb.length, 1);
    assert.equal(bb[0].kind, "screw");
  }
  // the light kit stays on the static side (not on the rotor)
  const rotor = new Set<string>();
  for (const p of d.parts) if (/^(shell|flange|iron|blade)/.test(p.name)) rotor.add(p.name);
  for (const f of d.features!) if (f.type === "light") assert.ok(!rotor.has(f.part));
});

test("venetian blind: ~30 thin aluminium slats weakly clipped to fabric ladders; stack hangs on hinges", () => {
  for (const w of [1.7, 2.1]) {
    const d = buildVenetianBlind({ w });
    const slats = d.parts.filter((p) => p.name.startsWith("slat"));
    assert.ok(slats.length >= 25 && slats.length <= 40, `slat count ${slats.length}`);
    for (const s of slats) {
      assert.equal(s.mat, "aluminum");
      assert.ok((s.tessCell ?? 0) > 0, "slats dent");
      const bonds = d.bonds.filter((b) => b.a === s.name);
      assert.ok(bonds.length >= 4 && bonds.every((b) => b.kind === "clip" && (b.strength ?? 99) <= 3), "weak ladder bonds");
    }
    const ladders = d.parts.filter((p) => p.name.startsWith("ladder"));
    assert.ok(ladders.length >= 4 && ladders.every((p) => p.mat === "fabric"));
    const hinges = d.bonds.filter((b) => b.kind === "hinge");
    assert.ok(hinges.length >= ladders.length + 1);
  }
});

test("curtains: each panel 1–2 kg of fabric strips glued edge to edge, hinged to steel rings around the rod", () => {
  const d = buildCurtains({
    rodLen: 2.7,
    brackets: [-1.3, 0, 1.3],
    panels: [
      { x0: -1.24, dir: 1, strips: 5 },
      { x0: 1.24, dir: -1, strips: 5 },
    ],
    rodHeight: 2.42,
    validate: "full",
  });
  for (const pi of [0, 1]) {
    const strips = d.parts.filter((p) => p.name.startsWith(`strip${pi}_`));
    assert.equal(strips.length, 5);
    const kg = strips.reduce((s, p) => s + partMass(p), 0);
    assert.ok(kg >= 1 && kg <= 2, `panel mass ${kg}`);
    assert.ok(strips.every((p) => p.mat === "fabric"));
    for (const s of strips) assert.equal(d.bonds.filter((b) => b.a === s.name && b.kind === "hinge").length, 1);
  }
  const rod = d.parts.find((p) => p.name === "rod")!;
  assert.equal(rod.mat, "steel");
  // hem 15 mm above the floor (rod centre at 2.42 m)
  let minY = Infinity;
  for (const p of d.parts) for (const v of p.poly.verts) minY = Math.min(minY, v.y);
  assert.ok(Math.abs(minY + 2.42 - 0.015) < 0.003, `hem height ${minY + 2.42}`);
});

test("baseboard heater length variants stay within 4–7 kg", () => {
  for (const len of [1.2, 1.5]) {
    const m = mass(buildBaseboardHeater({ len }));
    assert.ok(m >= 4 && m <= 7, `heater ${len} m: ${m}`);
  }
});

test("part budget of the area stays reasonable per object", () => {
  for (const [type, build] of Object.entries(FIXTURES_OBJECTS)) {
    const n = build().parts.length;
    assert.ok(n <= 90, `${type}: ${n} parts`);
  }
});
