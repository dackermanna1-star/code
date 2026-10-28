// Unit tests: kit sub-assemblies (src/objects/lib/kit.ts). Every helper must produce a valid,
// warning-free assembly (full validation) with real-world masses and the right joints/features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import * as K from "../../src/objects/lib/kit.ts";
import { qaxisAngle, qrot, vdot, v3 } from "../../src/geom/vec.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

Builder.warnMode = "collect";
Builder.validation = "full";

const mk = (type: string) => new Builder(type, type, "misc", 1);
function done(b: Builder): AssemblyDef {
  const def = b.build();
  assert.deepEqual(b.warnings, [], `${b.type} warnings:\n  ${b.warnings.join("\n  ")}`);
  return def;
}
const inRange = (what: string, x: number, lo: number, hi: number) => assert.ok(x >= lo && x <= hi, `${what} = ${x.toFixed(3)} not in [${lo}, ${hi}]`);
const bondsOfKind = (def: AssemblyDef, kind: string) => def.bonds.filter((b) => b.kind === kind);

test("hingeAxis: positive rotation moves the free edge towards the opening side", () => {
  for (const [e, o] of [
    [v3(1, 0, 0), v3(0, 0, 1)],
    [v3(-1, 0, 0), v3(0, 0, 1)],
    [v3(1, 0, 0), v3(0, 0, -1)],
    [v3(0, 0, 1), v3(0, 1, 0)],
  ]) {
    const ax = K.hingeAxis(e, o);
    const r = qrot(qaxisAngle(ax, 0.3), e);
    assert.ok(vdot(r, o) > 0.29, "opens towards o");
  }
  assert.throws(() => K.hingeAxis([1, 0, 0], [2, 0, 0]));
});

test("fastenSeam / screwGrid / glueByArea", () => {
  const b = mk("seam");
  const stud = b.box("stud", "softwood", "wood_pine", [0.038, 2.4, 0.089], [0, 1.2, 0]);
  const sheet = b.box("sheet", "gypsum", "paint_wall", [1.2, 2.4, 0.0125], [0, 1.2, 0.05075], { supported: true });
  const n = K.screwGrid(b, sheet, stud);
  assert.equal(n, Math.round(2.4 / 0.3) + 1);
  assert.equal(b.bondsOf(sheet)[0].strength, n * 30);
  assert.equal(K.glueByArea(0.01), 40);
  assert.equal(K.glueByArea(1), 400);
  const lone = b.box("lone", "softwood", "wood_pine", [0.1, 0.1, 0.1], [2, 0.05, 0]);
  assert.throws(() => K.fastenSeam(b, lone, stud, "screw"), /do not touch/);
  b.tag(lone, "loose");
  done(b);
});

test("cabinetCarcass: base cabinet with toe kick, rails, shelf; wall cabinet with full top", () => {
  const b = mk("carcass");
  const base = K.cabinetCarcass(b, "base", { w: 0.6, h: 0.72, d: 0.56, toeKick: { h: 0.1 }, top: "rails", shelves: [0.42] });
  assert.equal(base.top.length, 2);
  assert.ok(base.back && base.toeKick && base.shelves.length === 1);
  const def0 = b.info();
  inRange("base cabinet kg", def0.mass, 15, 30);
  assert.ok(bondsOfKind(b.build(), "friction").length === 2, "shelf rests on pins (friction both sides)");
  const b2 = mk("wall");
  const wall = K.cabinetCarcass(b2, "wall", { w: 0.8, h: 0.75, d: 0.33, top: "full", fixedShelves: [0.38] });
  b2.world(wall.back!, "screw", 140, [0, 0.7, -0.165]);
  inRange("wall cabinet kg", b2.info().mass, 12, 28);
  done(b2);
});

test("drawer: box + front on two runners in one slider group, handle", () => {
  const b = mk("drawer");
  const c = K.cabinetCarcass(b, "c", { w: 0.6, h: 0.72, d: 0.56, toeKick: { h: 0.1 }, top: "rails" });
  const d = K.drawer(b, "d1", { w: 0.6 - 0.036 - 0.026, h: 0.14, d: 0.5, front: { w: 0.596, h: 0.18 }, fixed: [c.left, c.right] }, [0, 0.55, 0.28]);
  const def = done(b);
  const sl = def.bonds.filter((x) => x.kind === "slider");
  assert.equal(sl.length, 2);
  assert.ok(sl.every((s) => s.joint!.group === d.group && Math.abs(s.joint!.axis.z - 1) < 1e-9));
  assert.ok(Math.abs(sl[0].joint!.max - 0.425) < 1e-9, "travel 0.85 d");
  assert.ok(d.handle.length === 3, "bar handle = bar + 2 posts");
});

test("hingedDoorPanel: hollow-core interior door and solid cabinet door", () => {
  const b = mk("door");
  const jamb = b.box("jamb", "softwood", "wood_pine", [0.03, 2.05, 0.1], [-0.43, 1.025, 0]);
  b.world(jamb, "nail", 200, [-0.43, 1, 0]);
  const strike = b.box("strike", "softwood", "wood_pine", [0.03, 2.05, 0.1], [0.43, 1.025, 0]);
  b.world(strike, "nail", 200, [0.43, 1, 0]);
  // jamb at -X = the viewer's right (left-handed world) → "right" hinges
  const d = K.hingedDoorPanel(b, "door", { w: 0.82, h: 2.04, hinge: "right", fixed: jamb, latch: { strength: 40, fixed: strike } }, [0, 0.005, 0]);
  const info = b.info();
  inRange("hollow door kg", info.mass - b.mass(jamb) - b.mass(strike), 9, 16);
  const def = done(b);
  const hinges = def.bonds.filter((x) => x.kind === "hinge");
  assert.equal(hinges.length, 3);
  assert.ok(hinges.every((h) => h.joint!.group === d.group && h.b === jamb));
  const latch = def.bonds.find((x) => x.kind === "latch")!;
  assert.ok(latch && latch.b === strike && latch.a === d.lockPart && latch.joint!.group === d.group);
  assert.ok(d.skins.every((s) => def.parts.find((p) => p.name === s)!.supported), "skins fail locally (supported)");
  assert.ok(d.core.some((c) => c.includes("comb")), "honeycomb core present");
  assert.equal(d.leaves.length, 3);
  // hinges sit on the jamb side; rotating by +angle swings the free edge (+X from the hinges) to +Z
  assert.ok(hinges.every((h) => h.joint!.pivot.x < -0.4));
  const ax = hinges[0].joint!.axis;
  const r = qrot(qaxisAngle(ax, 1), v3(1, 0, 0));
  assert.ok(r.z > 0.8);
  // "left" (viewer's left) = +X
  const bl = mk("lefty");
  const j2 = bl.box("jamb", "softwood", "wood_pine", [0.03, 2.05, 0.1], [0.43, 1.025, 0]);
  bl.world(j2, "nail", 200, [0.43, 1, 0]);
  K.hingedDoorPanel(bl, "door", { w: 0.82, h: 2.04, hinge: "left", fixed: j2, latch: false }, [0, 0.005, 0]);
  assert.ok(bl.build().bonds.filter((x) => x.kind === "hinge").every((h) => h.joint!.pivot.x > 0.4));

  const b2 = mk("cabdoor");
  const side = b2.box("side", "particleboard", "laminate_white", [0.018, 0.72, 0.56], [-0.309, 0.36, 0]);
  const cd = K.hingedDoorPanel(b2, "cd", { w: 0.596, h: 0.7, hinge: "right", fixed: side }, [0, 0.01, 0.289]);
  const def2 = done(b2);
  assert.equal(def2.bonds.filter((x) => x.kind === "hinge").length, 2);
  const catchB = def2.bonds.find((x) => x.kind === "latch")!;
  assert.equal(catchB.strength, 3, "magnetic catch");
  inRange("cabinet door kg", b2.mass(cd.slab), 3, 7);
});

test("shelfBoard, tableBase + attachTop", () => {
  const b = mk("table");
  const base = K.tableBase(b, "base", { w: 1.2, d: 0.75, h: 0.735, leg: 0.06, taper: 0.045, stretchers: { y: 0.15, layout: "H" } });
  const top = b.box("top", "hardwood", "wood_oak", [1.3, 0.025, 0.85], [0, 0.7475, 0]);
  assert.equal(K.attachTop(b, top, base.aprons), 4);
  inRange("dining table kg", b.info().mass, 25, 60);
  done(b);
  const bl = mk("legs");
  const legs = K.legs4(bl, "legs", { w: 0.8, d: 0.4, h: 0.15, leg: 0.035, taper: 0.025 });
  const bodyPart = bl.box("body", "particleboard", "laminate_white", [0.8, 0.5, 0.4], [0, 0.4, 0]);
  for (const l of legs) bl.screw(l, bodyPart, 2, 30);
  done(bl);
  const b2 = mk("shelf");
  const l = b2.box("l", "particleboard", "laminate_white", [0.018, 1, 0.3], [-0.209, 0.5, 0]);
  const r = b2.box("r", "particleboard", "laminate_white", [0.018, 1, 0.3], [0.209, 0.5, 0]);
  b2.screw(l, b2.box("base", "particleboard", "laminate_white", [0.436, 0.018, 0.3], [0, 0.009 - 0.018, 0]), 2);
  b2.screw(r, "base", 2);
  K.shelfBoard(b2, "s", { w: 0.399, d: 0.28, between: [l, r] }, [0, 0.5, 0]);
  const def = done(b2);
  assert.equal(def.bonds.filter((x) => x.kind === "friction").length, 2);
});

test("glassPaneInFrame: single and double glazing held by weak bonds", () => {
  const b = mk("window");
  const w = K.glassPaneInFrame(b, "sash", { w: 1, h: 1.2, bar: 0.05, depth: 0.06, mat: "aluminum", surf: "aluminum", glazing: 2, kg: 3.5 });
  assert.equal(w.panes.length, 2);
  const def = done(b);
  for (const p of w.panes) {
    const bonds = def.bonds.filter((x) => x.a === p || x.b === p);
    assert.equal(bonds.length, 4);
    assert.ok(bonds.every((x) => (x.strength ?? 99) <= 6), "glass held weakly so shards stay in the frame");
  }
  inRange("double-glazed sash kg", b.info().mass, 20, 30);
});

test("hardware: buttons, knob, bar/pull/lever handles", () => {
  const b = mk("hw");
  const panel = b.box("panel", "plastic", "plastic", [0.3, 0.3, 0.003], [0, 0.15, -0.0015]);
  const keys = K.buttonGrid(b, "key", { on: panel, rows: 4, cols: 3, size: [0.02, 0.012] }, [0, 0.15, 0]);
  assert.equal(keys.length, 12);
  K.knob(b, "knob", { on: panel }, [0.12, 0.27, 0]);
  K.barHandle(b, "bar", { on: panel, len: 0.096 }, [0, 0.04, 0]);
  K.pullHandle(b, "pull", { on: panel, len: 0.08 }, [-0.1, 0.27, 0]);
  K.leverHandle(b, "lever", { on: panel, side: -1 }, [0.1, 0.05, 0]);
  const def = done(b);
  const presses = def.bonds.filter((x) => x.kind === "press" && keys.includes(x.a));
  assert.equal(presses.length, 12);
  assert.ok(presses.every((x) => x.strength === 2));
});

test("pcb, screenPanel, sheetMetalBox", () => {
  const b = mk("elec");
  const box = K.sheetMetalBox(b, "case", { w: 0.4, h: 0.3, d: 0.35 });
  const def0 = b.info();
  inRange("sheet box kg", def0.mass, 2.5, 4.5);
  const p = K.pcb(b, "pcb", { w: 0.1, h: 0.08, mount: { to: box.bottom! } }, [0, 0.0008 + 0.0016 + 0.0005, 0], [-90, 0, 0]);
  K.screenPanel(b, "screen", { w: 0.4, h: 0.22, content: "monitor" }, [0, 0.15, 0.175 + 0.012 + 0.0001]);
  b.clip("screen_back", box.left!, 10); // screen closes the open front of the case
  const def = done(b);
  assert.ok(def.features!.some((f) => f.type === "sparks" && f.part === p.board));
  assert.ok(def.features!.some((f) => f.type === "screen" && f.part === "screen_lcd" && f.content === "monitor"));
  assert.ok(def.bonds.filter((x) => x.kind === "weld" && x.a.startsWith("case_")).length >= 8, "every seam spot-welded");
  assert.ok(def.parts.filter((x) => x.name.startsWith("case_")).every((x) => (x.tessCell ?? 0) > 0), "sheet panels tessellated for dents");
});

test("soft goods: cushion, pillow, mattress carry stuffing and realistic mass", () => {
  const b = mk("soft");
  const c = K.cushion(b, "seat", { size: [0.6, 0.12, 0.6] }, [0, 0, 0]);
  const p = K.pillow(b, "pillow", {}, [1, 0, 0]);
  const m = K.mattress(b, "mat", { w: 1.52, l: 2.03 }, [0, 0, 3]);
  for (const x of [c, p, m]) b.tag(x, "loose");
  const def = done(b);
  assert.equal(def.features!.filter((f) => f.type === "stuffing").length, 3);
  inRange("seat cushion kg", b.mass(c), 0.5, 2);
  inRange("pillow kg", b.mass(p), 0.3, 1.5);
  inRange("queen mattress kg", b.mass(m), 25, 45);
});

test("books: 4-part hardcover and 1-part paperback", () => {
  const b = mk("books");
  const hb = K.book(b, "hb", { hardcover: true }, [0, 0, 0]);
  const pb = K.book(b, "pb", { parts: 1, t: 0.02, hardcover: false }, [0.05, 0, 0]);
  b.tag(pb.pages, "loose");
  const def = done(b);
  assert.equal(hb.all.length, 4);
  inRange("hardcover kg", hb.all.reduce((s, x) => s + b.mass(x), 0), 0.4, 1.0);
  assert.ok(def.features!.some((f) => f.type === "stuffing" && f.kind === "paper"));
});

test("vessels: plate, bowl, mug, glass, bottles, vase", () => {
  const ranges: Array<[string, (b: Builder) => string[], number, number]> = [
    ["plate", (b) => K.plate(b, "plate"), 0.4, 0.75],
    ["bowl", (b) => K.bowl(b, "bowl"), 0.2, 0.5],
    ["mug", (b) => K.mug(b, "mug").all, 0.3, 0.45],
    ["glass", (b) => K.drinkingGlass(b, "glass"), 0.15, 0.32],
    ["wine", (b) => K.bottle(b, "wine", { kind: "wine" }).all, 0.4, 0.75],
    ["beer", (b) => K.bottle(b, "beer", { kind: "beer" }).all, 0.17, 0.32],
    ["vase", (b) => K.vase(b, "vase"), 0.5, 1.6],
  ];
  for (const [name, f, lo, hi] of ranges) {
    const b = mk(name);
    const parts = f(b);
    const def = done(b);
    inRange(`${name} kg`, b.info().mass, lo, hi);
    assert.ok(parts.length <= 20, `${name}: ${parts.length} parts (small objects ≤ 20)`);
    assert.ok(def.bonds.every((x) => x.kind === "fused"), `${name}: one fused shell`);
    if (name === "wine" || name === "beer") assert.ok(def.features!.some((x) => x.type === "liquid"), "bottle has liquid");
    const minY = Math.min(...def.parts.flatMap((p) => p.poly.verts.map((v) => v.y)));
    assert.ok(Math.abs(minY) < 1e-9, `${name} rests on y = 0 (min y ${minY})`);
  }
});

test("pictureFrame hangs on a weak nail; lightBulb carries the light", () => {
  const b = mk("pic");
  const pf = K.pictureFrame(b, "pic", { w: 0.5, h: 0.4, art: "painting_1" });
  const def = done(b);
  const nail = def.bonds.find((x) => x.b === "world")!;
  assert.ok(nail.kind === "nail" && (nail.strength ?? 0) <= 15 && nail.a === pf.bars[0]);
  const b2 = mk("bulb");
  const bulb = K.lightBulb(b2, "bulb", { socket: true, range: 5 }, [0, 0.03, 0]);
  const def2 = done(b2);
  const light = def2.features!.find((f) => f.type === "light")!;
  assert.ok(light.type === "light" && light.part === bulb.glass && light.range === 5);
  inRange("bulb glass kg", b2.mass(bulb.glass), 0.01, 0.06);
});

test("cable and pipe: tear-apart segments, pipe water on alternate segments", () => {
  const b = mk("lines");
  const stud = b.box("stud", "softwood", "wood_pine", [0.038, 2.4, 0.089], [0, 1.2, 0]);
  const cab = K.cable(b, "cable", [[0.03, 0.3, 0], [0.03, 1.1, 0], [0.03, 1.1, 0.3]], { sparks: 0.3, start: { to: stud } });
  const px = -0.019 - 0.0075; // pipe runs along the stud's face
  const pp = K.pipe(b, "pipe", [[px, 0.2, 0.0], [px, 0.8, 0.0], [px, 1.4, 0.0], [px, 1.4, 0.4], [-0.3, 1.4, 0.4]], { start: { to: stud } });
  b.clip(pp[1], stud, 20);
  b.clip(cab[1], stud, 20);
  const def = done(b);
  const water = def.features!.filter((f) => f.type === "water");
  assert.deepEqual(
    water.map((w) => (w as { part: string }).part),
    pp.filter((_, i) => i % 2 === 0),
    "one leak source per broken joint",
  );
  const kgm = K.pipeKgPerM(0.015, 0.0008, 8900, true);
  inRange("15 mm copper pipe kg/m (full)", kgm, 0.4, 0.5);
  inRange("pipe segment mass", b.mass(pp[0]), 0.6 * kgm - 1e-9, 0.6 * kgm + 1e-9);
  assert.equal(def.features!.filter((f) => f.type === "sparks").length, cab.length);
});
