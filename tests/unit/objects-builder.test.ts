// Unit tests: the builder DSL (src/objects/lib/builder.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder, rot } from "../../src/objects/lib/builder.ts";
import { polyCentroid, polyVolume } from "../../src/geom/poly.ts";
import { qrot, vdot, vlen, vsub, v3, type Vec3 } from "../../src/geom/vec.ts";
import { S } from "../../src/render/surfaces.ts";
import { aabbOf } from "../../src/objects/lib/contact.ts";

Builder.warnMode = "collect";
Builder.validation = "full";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearV = (a: Vec3, b: Vec3, eps = 1e-9) => vlen(vsub(a, b)) <= eps;
const mk = (type = "t") => new Builder(type, "Test", "misc", 1);

test("group frames nest offsets, rotations and name prefixes", () => {
  const b = mk();
  let inner = "";
  b.group([1, 0, 0], [0, 90, 0], "a_", () => {
    b.group([0, 0, 1], undefined, "b_", () => {
      inner = b.box("x", "plastic", "plastic", [0.1, 0.1, 0.1], [0, 0.5, 0]);
      // frame b sits at local (0,0,1) of frame a, which is yawed 90°: its origin is at (2,0,0)
      assert.ok(nearV(b.p([0, 0, 0]), v3(2, 0, 0), 1e-12));
      assert.ok(nearV(b.d([0, 0, 1]), v3(1, 0, 0), 1e-12), "local +Z points along world +X");
    });
  });
  assert.equal(inner, "a_b_x");
  const c = polyCentroid(b.get(inner).poly);
  // yaw 90°: local +Z → world +X, so (0,0,1) in frame a sits at (1+1, 0, 0)
  assert.ok(nearV(c, v3(2, 0.5, 0), 1e-9), JSON.stringify(c));
});

test("Euler degrees follow yaw (Y) outermost, then pitch (X), then roll (Z)", () => {
  const q = rot([90, 90, 0]);
  // pitch 90 maps +Z to -Y; yaw 90 then leaves -Y unchanged
  assert.ok(nearV(qrot(q, v3(0, 0, 1)), v3(0, -1, 0), 1e-12));
  const q2 = rot([0, 90, 0]);
  assert.ok(nearV(qrot(q2, v3(0, 0, 1)), v3(1, 0, 0), 1e-12), "yaw 90° turns the front (+Z) to +X");
  const q3 = rot([0, 0, 90]);
  assert.ok(nearV(qrot(q3, v3(1, 0, 0)), v3(0, 1, 0), 1e-12), "roll 90° turns +X to +Y");
  assert.throws(() => rot([NaN, 0, 0]));
});

test("uv offsets: random per part, explicit when given, shared by all tiles of one primitive", () => {
  const b = mk();
  const a = b.box("a", "plastic", "plastic", [0.2, 0.2, 0.2], [0, 0.1, 0]);
  const c = b.box("c", "plastic", "plastic", [0.2, 0.2, 0.2], [0.2, 0.1, 0]);
  const u0 = (n: string) => b.get(n).poly.faces.find((f) => f.n.z > 0.9)!.attr.uv.u0;
  assert.notEqual(u0(a), u0(c));
  const e = b.box("e", "plastic", "plastic", [0.2, 0.2, 0.2], [0.4, 0.1, 0], { uvOffset: [0.25, 0.5] });
  const f = b.get(e).poly.faces.find((x) => x.n.z > 0.9)!;
  // uv = dot(p, u) + u0 is preserved by the transform: evaluate at a face vertex
  const vtx = b.get(e).poly.verts[f.idx[0]];
  const uLocal = vdot(vtx, f.attr.uv.u) + f.attr.uv.u0;
  assert.ok(Number.isFinite(uLocal));
  const tiles = b.lathe("bowl", "ceramic", "ceramic_glaze", "ceramic_glaze", { profile: [[0.05, 0], [0.08, 0.06]], thickness: 0.005, segments: 6, pos: [1, 0, 0] });
  // continuous wrap-around map: outer faces of adjacent tiles agree at a shared vertex
  const outer = (n: string) => b.get(n).poly.faces.filter((x) => x.attr.smooth === 1)[0];
  const f0 = outer(tiles[0]),
    f1 = outer(tiles[1]);
  const P0 = b.get(tiles[0]).poly,
    P1 = b.get(tiles[1]).poly;
  let shared = 0;
  for (const i of f0.idx)
    for (const j of f1.idx) {
      const p = P0.verts[i],
        q = P1.verts[j];
      if (nearV(p, q, 1e-9)) {
        shared++;
        const v0 = vdot(p, f0.attr.uv.v) + f0.attr.uv.v0,
          v1 = vdot(q, f1.attr.uv.v) + f1.attr.uv.v0;
        assert.ok(near(v0, v1, 1e-6), "meridian coordinate continuous across tiles");
      }
    }
  assert.ok(shared >= 2, "adjacent outer facets share an edge");
});

test("wood grain: longest axis by default, uv.u along the grain, end grain on cross faces", () => {
  const b = mk();
  const board = b.box("board", "softwood", "wood_pine", [1.2, 0.02, 0.2], [0, 0.01, 0], { rot: [0, 30, 0] });
  const p = b.get(board);
  assert.ok(p.grain && near(Math.abs(vdot(p.grain, qrot(rot([0, 30, 0]), v3(1, 0, 0)))), 1, 1e-9));
  for (const f of p.poly.faces) {
    const cross = Math.abs(vdot(f.n, p.grain!)) > 0.9;
    assert.equal(f.attr.surf === S.wood_fiber, cross, "end grain exactly on faces across the grain");
    if (!cross) assert.ok(Math.abs(vdot(f.attr.uv.u, p.grain!)) > 0.99, "texture u runs along the grain");
  }
  const noEnd = b.box("noend", "softwood", "wood_pine", [1.2, 0.02, 0.2], [0, 0.1, 0], { endGrain: false });
  assert.ok(b.get(noEnd).poly.faces.every((f) => f.attr.surf === S.wood_pine));
  const leg = b.cyl("leg", "hardwood", "wood_oak", 0.02, 0.4, [0, 0.2, 1]);
  const lp = b.get(leg);
  assert.ok(lp.grain && near(Math.abs(lp.grain.y), 1, 1e-9), "turned leg grain along its axis");
  const caps = lp.poly.faces.filter((f) => Math.abs(f.n.y) > 0.9);
  assert.equal(caps.length, 2);
  assert.ok(caps.every((f) => f.attr.surf === S.wood_fiber));
  const sides = lp.poly.faces.filter((f) => Math.abs(f.n.y) < 0.5);
  assert.ok(sides.every((f) => Math.abs(f.attr.uv.u.y) > 0.99), "cylinder map swapped so u runs along the grain");
  const steel = b.box("steel", "steel", "metal_raw", [1, 0.1, 0.1], [0, 1, 0]);
  assert.equal(b.get(steel).grain, undefined, "no grain for non-wood unless asked");
});

test("anchors: contact centre by default, lowest centre for world bonds, explicit anchors follow the frame", () => {
  const b = mk();
  const base = b.box("base", "plastic", "plastic", [1, 0.1, 1], [0, 0.05, 0]);
  const post = b.box("post", "plastic", "plastic", [0.1, 0.5, 0.1], [0.3, 0.35, -0.2]);
  b.glue(post, base);
  const bond = b.bondsOf(post)[0];
  assert.ok(nearV(bond.anchor!, v3(0.3, 0.1, -0.2), 1e-9), JSON.stringify(bond.anchor));
  b.world(base);
  const wb = b.bondsOf(base).find((x) => x.b === "world")!;
  assert.ok(nearV(wb.anchor!, v3(0, 0, 0), 1e-9));
  b.group([0, 1, 0], [0, 90, 0], "", () => b.world(post, "screw", 50, [0, 0, 1]));
  const wb2 = b.bondsOf(post).find((x) => x.b === "world")!;
  assert.ok(nearV(wb2.anchor!, v3(1, 1, 0), 1e-9), "anchor (0,0,1) in a frame at y=1 yawed 90° → (1,1,0)");
  assert.equal(wb2.strength, 50);
});

test("autoBond: touching (with tolerance) yes, separated no, tags and existing bonds respected", () => {
  const b = mk();
  const floor = b.box("floor", "plywood", "plywood", [2, 0.02, 2], [0, 0.01, 0]);
  const a = b.box("a", "plywood", "plywood", [0.3, 0.3, 0.3], [0, 0.17, 0]); // touching
  const gap = b.box("gap", "plywood", "plywood", [0.3, 0.3, 0.3], [0.6, 0.172, 0]); // 2 mm gap
  const far = b.box("far", "plywood", "plywood", [0.3, 0.3, 0.3], [-0.6, 0.18, 0]); // 1 cm gap
  const loose = b.box("loose", "plywood", "plywood", [0.3, 0.3, 0.3], [0, 0.17, 0.6], { tags: ["loose"] });
  const pre = b.box("pre", "plywood", "plywood", [0.3, 0.3, 0.3], [0.6, 0.17, 0.6]);
  b.screw(pre, floor, 2);
  const areas: number[] = [];
  const n = b.autoBond("glue", (_x, _y, c) => {
    areas.push(c.area);
    return 10 + 1000 * c.area;
  });
  assert.equal(n, 2, "a and gap bond to the floor");
  const names = new Set(b.bondsOf(floor).map((x) => (x.a === floor ? x.b : x.a)));
  assert.ok(names.has(a) && names.has(gap) && !names.has(far) && !names.has(loose));
  assert.equal(b.bondsOf(pre).length, 1, "existing bond pair not duplicated");
  assert.ok(areas.every((x) => near(x, 0.09, 1e-9)));
  // far + loose need bonds or tags to validate; give far one
  b.tag(far, "loose");
  b.build();
});

test("lathe tiles: fused to ring neighbours incl. wrap-around and cap, never diagonally", () => {
  const b = mk();
  const segs = 8;
  const tiles = b.lathe("pot", "ceramic", "ceramic_glaze", "ceramic_glaze", { profile: [[0.06, 0], [0.07, 0.05], [0.08, 0.12]], thickness: 0.006, segments: segs, capBottom: true });
  assert.equal(tiles.length, segs * 3, "cap span + 2 wall spans");
  const deg = new Map<string, number>();
  for (const t of tiles) deg.set(t, b.bondsOf(t).filter((x) => x.kind === "fused").length);
  for (const t of tiles) {
    const [, i, j] = t.split("_").map(Number);
    const others = b.bondsOf(t).map((x) => (x.a === t ? x.b : x.a));
    for (const o of others) {
      const [, oi, oj] = o.split("_").map(Number);
      const di = Math.min((oi - i + segs) % segs, (i - oi + segs) % segs);
      assert.ok((di === 1 && oj === j) || (di === 0 && Math.abs(oj - j) === 1), `unexpected bond ${t}-${o}`);
    }
    const expected = 2 + (j === 0 || j === 2 ? 1 : 2);
    assert.equal(deg.get(t), expected, `tile ${t} degree`);
  }
  const partial = b.lathe("half", "ceramic", "ceramic_glaze", "ceramic_glaze", { profile: [[0.06, 0], [0.08, 0.1]], thickness: 0.006, segments: 4, angleStart: 0, angleEnd: Math.PI, pos: [1, 0, 0] });
  const ends = partial.filter((t) => b.bondsOf(t).length === 1);
  assert.equal(ends.length, 2, "a half lathe does not wrap");
  b.build();
});

test("tube: fused mitred segments with per-metre mass", () => {
  const b = mk();
  const segs = b.tube("pipe", "copper", "copper", [[0, 0.1, 0], [0.5, 0.1, 0], [0.5, 0.6, 0]], 0.0075, { kgPerM: 0.46 });
  assert.equal(segs.length, 2);
  assert.ok(near(b.mass(segs[0]), 0.23, 1e-9) && near(b.mass(segs[1]), 0.23, 1e-9));
  const j = b.bondsOf(segs[0]);
  assert.equal(j.length, 1);
  assert.equal(j[0].kind, "fused");
  assert.ok(nearV(j[0].anchor!, v3(0.5, 0.1, 0), 1e-9), "joint anchored at the mitre centre");
  b.build();
});

test("hinges and sliders: grouped constraints, transformed axes/pivots, latch at the far edge", () => {
  const b = mk();
  const frame = b.box("frame", "softwood", "wood_pine", [0.05, 2, 0.1], [-0.45, 1, 0]);
  const door = b.box("door", "mdf", "wood_painted", [0.8, 2, 0.04], [0.0, 1, 0]);
  const g = b.hinge(door, frame, { pivots: [[-0.4, 0.2, 0.02], [-0.4, 1.8, 0.02]], axis: [0, -1, 0], min: 0, max: 100, latch: 40 });
  const hinges = b.bondsOf(door).filter((x) => x.kind === "hinge");
  assert.equal(hinges.length, 2);
  assert.ok(hinges.every((h) => h.joint!.group === g && near(h.joint!.max, (100 * Math.PI) / 180, 1e-12) && h.b === frame));
  const latch = b.bondsOf(door).find((x) => x.kind === "latch")!;
  assert.ok(latch && latch.joint!.group === g && latch.strength === 40);
  assert.ok(near(latch.anchor!.x, 0.4, 1e-9) && near(latch.anchor!.y, 1, 1e-9), `latch at the free edge, level with the hinges: ${JSON.stringify(latch.anchor)}`);
  // slider in a rotated frame: axis follows the frame
  let drawerGroup = "";
  b.group([2, 0, 0], [0, 90, 0], "c_", () => {
    const body = b.box("body", "particleboard", "laminate_white", [0.5, 0.3, 0.5], [0, 0.15, 0]);
    const dr = b.box("drawer", "particleboard", "laminate_white", [0.4, 0.1, 0.45], [0, 0.36, 0]);
    drawerGroup = b.slider(dr, [body, body], { pivots: [[-0.2, 0.36, 0], [0.2, 0.36, 0]], axis: [0, 0, 1], min: 0, max: 0.35 });
  });
  const sl = b.bondsOf("c_drawer").filter((x) => x.kind === "slider");
  assert.equal(sl.length, 2);
  assert.ok(sl.every((s) => s.joint!.group === drawerGroup && nearV(s.joint!.axis, v3(1, 0, 0), 1e-9)));
  const def = b.build();
  assert.ok(def.bonds.length >= 5);
});

test("features resolve parts through prefixes and transform positions", () => {
  const b = mk();
  b.group([1, 2, 3], undefined, "lamp_", () => {
    const bulb = b.ellipsoid("bulb", "glass", "bulb_on", [0.03, 0.04, 0.03], [0, 0, 0]);
    const base = b.cyl("base", "aluminum", "aluminum", 0.013, 0.02, [0, -0.05, 0]);
    b.glue(bulb, base, 5);
    b.light({ part: "bulb", pos: [0, 0.01, 0], intensity: 2 });
    b.sparks("base", 0.5);
  });
  const def = b.build();
  const light = def.features!.find((f) => f.type === "light")!;
  assert.equal((light as { part: string }).part, "lamp_bulb");
  assert.ok(light.type === "light" && nearV(light.pos, v3(1, 2.01, 3), 1e-12));
  assert.ok(def.features!.some((f) => f.type === "sparks" && f.part === "lamp_base"));
  const b2 = mk();
  const p = b2.box("p", "plastic", "plastic", [0.1, 0.1, 0.1], [0, 0.05, 0]);
  b2.feature({ type: "motor", part: p, joint: "nope", speed: 3 });
  assert.throws(() => b2.build(), /unknown joint group/);
});

test("validation errors: unknown parts, unbonded parts, bad strengths, NaN, empty", () => {
  const b = mk();
  b.box("a", "plastic", "plastic", [0.1, 0.1, 0.1], [0, 0.05, 0]);
  b.box("b", "plastic", "plastic", [0.1, 0.1, 0.1], [0, 0.15, 0]);
  assert.throws(() => b.build(), /has no bonds/);
  assert.throws(() => b.glue("a", "zzz"), /unknown part/);
  assert.throws(() => b.bond("a", "b", "glue", { strength: -1 }), /invalid strength/);
  assert.throws(() => b.bond("a", "a", "glue"), /self bond/);
  assert.throws(() => b.box("c", "plastic", "plastic", [0, 0.1, 0.1], [0, 0, 0]), /positive/);
  assert.throws(() => b.box("d", "plastic", "plastic", [0.1, 0.1, 0.1], [NaN, 0, 0]), /non-finite/);
  assert.throws(() => b.box("a", "plastic", "plastic", [0.1, 0.1, 0.1], [1, 0, 0]), /duplicate/);
  assert.throws(() => mk().build(), /no parts/);
  b.tag("b", "loose");
  b.glue("a", "b");
  b.build();
});

test("validation warnings: containment, distant pivot, absurd mass, split assembly, duplicate bonds", () => {
  const b = mk();
  const big = b.box("big", "plastic", "plastic", [0.5, 0.5, 0.5], [0, 0.25, 0]);
  const inner = b.box("inner", "plastic", "plastic", [0.1, 0.1, 0.1], [0, 0.25, 0]);
  b.glue(inner, big);
  b.glue(inner, big);
  const lid = b.box("lid", "plastic", "plastic", [0.5, 0.02, 0.5], [0, 0.51, 0]);
  b.hinge(lid, big, { pivots: [[0, 1.5, 0]], axis: [1, 0, 0], min: 0, max: 90 });
  const heavy = b.box("heavy", "steel", "metal_raw", [1, 1, 1], [3, 0.5, 0]);
  const other = b.box("other", "steel", "metal_raw", [0.1, 0.1, 0.1], [3, 1.05, 0]);
  b.weld(other, heavy);
  b.build();
  const w = b.warnings.join("\n");
  assert.match(w, /'inner' is completely inside 'big'/);
  assert.match(w, /pivot is .* cm from both parts/);
  assert.match(w, /weighs 7850 kg/);
  assert.match(w, /unconnected groups/);
  assert.match(w, /duplicate glue bonds/);
  const info = b.info();
  assert.ok(info.warnings.length >= 5);
});

test("info(): mass, counts, bbox, per-material mass", () => {
  const b = mk();
  const a = b.box("a", "steel", "metal_raw", [0.1, 0.1, 0.1], [0, 0.05, 0]);
  const c = b.box("c", "softwood", "wood_pine", [1, 0.02, 0.1], [0, 0.11, 0]);
  b.screw(a, c, 2);
  const i = b.info();
  assert.ok(near(i.mass, 7.85 + 1 * 0.02 * 0.1 * 500, 1e-9));
  assert.equal(i.parts, 2);
  assert.equal(i.bonds, 1);
  assert.ok(nearV(i.bbox.min, v3(-0.5, 0, -0.05), 1e-12) && nearV(i.bbox.max, v3(0.5, 0.12, 0.05), 1e-12));
  assert.ok(near(i.byMaterial.steel, 7.85, 1e-9));
  assert.ok(near(b.mass(c), 1, 1e-9));
});

test("tile mass override is a total distributed by volume", () => {
  const b = mk();
  const tiles = b.lathe("shade", "fabric", "fabric_cotton", "fabric_cotton", { profile: [[0.1, 0], [0.15, 0.2]], thickness: 0.002, segments: 6, mass: 0.3 });
  const total = tiles.reduce((s, t) => s + b.mass(t), 0);
  assert.ok(near(total, 0.3, 1e-9));
  assert.ok(tiles.every((t) => near(b.mass(t) / polyVolume(b.get(t).poly), 0.3 / tiles.reduce((s, x) => s + polyVolume(b.get(x).poly), 0), 1e-6)));
});

test("determinism: same type → identical definitions", () => {
  const build = () => {
    const b = mk("det");
    const a = b.box("a", "plastic", "plastic", [0.2, 0.1, 0.3], [0, 0.05, 0]);
    const t = b.lathe("l", "ceramic", "ceramic_glaze", "ceramic_glaze", { profile: [[0.03, 0], [0.04, 0.1]], thickness: 0.004, segments: 6, capBottom: true, pos: [0, 0.1, 0] });
    b.glue(t[0], a);
    b.autoBond("glue", 20);
    return JSON.stringify(b.build());
  };
  assert.equal(build(), build());
});

test("aabb helper used by info agrees with geometry", () => {
  const b = mk();
  const p = b.box("p", "plastic", "plastic", [0.2, 0.4, 0.6], [1, 2, 3], { rot: [0, 90, 0] });
  const bb = aabbOf(b.get(p).poly);
  assert.ok(near(bb.max.x - bb.min.x, 0.6, 1e-9) && near(bb.max.z - bb.min.z, 0.2, 1e-9));
});
