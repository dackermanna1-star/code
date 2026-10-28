import { test } from "node:test";
import assert from "node:assert/strict";
import { UnionFind, planSplit, farMasses, planJointConstraints, resolveBondTransfers, type GraphBond } from "../../src/destruction/runtime/graph.ts";
import { near } from "./destruction-helpers.ts";

const rb = (a: number, b: number, alive = true): GraphBond => ({ a, b, rigid: true, alive });

test("union-find merges and finds", () => {
  const uf = new UnionFind(6);
  assert.equal(uf.union(0, 1), true);
  assert.equal(uf.union(1, 2), true);
  assert.equal(uf.union(0, 2), false);
  uf.union(4, 5);
  assert.equal(uf.find(0), uf.find(2));
  assert.notEqual(uf.find(0), uf.find(4));
  assert.equal(uf.find(3), 3);
});

test("planSplit: single component when intact", () => {
  const p = planSplit(4, [1, 2, 3, 4], [rb(0, 1), rb(1, 2), rb(2, 3)]);
  assert.equal(p.count, 1);
  assert.deepEqual(p.members, [[0, 1, 2, 3]]);
  assert.equal(p.mass[0], 10);
  assert.equal(p.keeper, 0);
  assert.equal(p.anchored[0], false);
});

test("planSplit: broken bond separates, heaviest keeps the body, anchoring tracked", () => {
  const bonds = [rb(0, 1), rb(1, 2, false), rb(2, 3), rb(3, -1)];
  const p = planSplit(4, [5, 1, 1, 1], bonds);
  assert.equal(p.count, 2);
  assert.equal(p.comp[0], p.comp[1]);
  assert.equal(p.comp[2], p.comp[3]);
  assert.notEqual(p.comp[0], p.comp[2]);
  const cHeavy = p.comp[0];
  assert.equal(p.keeper, cHeavy, "6 kg component keeps the body");
  assert.equal(p.anchored[p.comp[3]], true, "world bond on part 3 anchors its component");
  assert.equal(p.anchored[cHeavy], false);
});

test("planSplit: joint and dead bonds do not connect; ties prefer anchored", () => {
  const bonds: GraphBond[] = [
    { a: 0, b: 1, rigid: false, alive: true }, // hinge
    { a: 1, b: -1, rigid: true, alive: true },
  ];
  const p = planSplit(2, [2, 2], bonds);
  assert.equal(p.count, 2);
  assert.equal(p.keeper, p.comp[1], "equal mass: anchored component keeps the (static) body");
});

test("planSplit: bonds to parts outside the set are ignored, bad masses count as 0", () => {
  const p = planSplit(2, [1, NaN], [rb(0, 7), rb(1, 0)]);
  assert.equal(p.count, 1);
  assert.equal(p.mass[0], 1);
});

test("farMasses: table top with four legs", () => {
  // part 0 = top (10 kg), 1..4 = legs (1 kg)
  const bonds = [rb(0, 1), rb(0, 2), rb(0, 3), rb(0, 4)];
  const masses = [10, 1, 1, 1, 1];
  const fromTop = farMasses(5, masses, bonds, 0);
  for (let i = 0; i < 4; i++) assert.ok(near(fromTop[i], 1), `leg bond ${i} far = 1`);
  const fromLeg = farMasses(5, masses, bonds, 1);
  assert.ok(near(fromLeg[0], 13), "the struck leg's bond carries the top + 3 legs");
  for (let i = 1; i < 4; i++) assert.ok(near(fromLeg[i], 1));
});

test("farMasses: cycle loads stay bounded, world bonds carry everything", () => {
  const bonds = [rb(0, 1), rb(1, 2), rb(2, 3), rb(3, 0), rb(2, -1)];
  const fm = farMasses(4, [1, 1, 1, 1], bonds, 0);
  for (let i = 0; i < 4; i++) assert.ok(fm[i] > 0 && fm[i] <= 3 + 1e-9, `edge ${i}: ${fm[i]}`);
  assert.ok(near(fm[4], 4));
});

test("farMasses: disconnected bonds get the far part's own mass", () => {
  const bonds = [rb(0, 1), rb(2, 3)];
  const fm = farMasses(4, [1, 2, 3, 4], bonds, 0);
  assert.ok(near(fm[0], 2));
  assert.ok(near(fm[1], 3));
});

test("joint rules: 3 hinges -> hinge, 1 -> ball, 0 -> none", () => {
  const anchor = (y: number) => ({ x: 0, y, z: 0 });
  const bonds = [
    { alive: true, moving: 1, fixed: 0, anchor: anchor(0.2) },
    { alive: true, moving: 1, fixed: 0, anchor: anchor(1.0) },
    { alive: true, moving: 1, fixed: 0, anchor: anchor(1.8) },
  ];
  let plans = planJointConstraints("hinge", bonds);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].kind, "hinge");
  assert.ok(near(plans[0].pivot.y, 1.0));
  assert.deepEqual(plans[0].bonds, [0, 1, 2]);
  bonds[0].alive = false;
  bonds[2].alive = false;
  plans = planJointConstraints("hinge", bonds);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].kind, "ball");
  assert.ok(near(plans[0].pivot.y, 1.0));
  bonds[1].alive = false;
  assert.equal(planJointConstraints("hinge", bonds).length, 0);
});

test("joint rules: bonds split across islands form separate constraints; same island needs none", () => {
  const a = { x: 0, y: 0, z: 0 };
  const plans = planJointConstraints("hinge", [
    { alive: true, moving: 1, fixed: 0, anchor: a },
    { alive: true, moving: 1, fixed: 0, anchor: { x: 0, y: 1, z: 0 } },
    { alive: true, moving: 2, fixed: 0, anchor: { x: 0, y: 2, z: 0 } },
    { alive: true, moving: 3, fixed: 3, anchor: a },
  ]);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].kind, "hinge");
  assert.equal(plans[1].kind, "ball");
  assert.equal(plans[1].moving, 2);
  const sl = planJointConstraints("slider", [{ alive: true, moving: 5, fixed: -1, anchor: a }]);
  assert.equal(sl.length, 1);
  assert.equal(sl[0].kind, "slider");
  assert.equal(sl[0].fixed, -1);
});

test("bond transfer resolution", () => {
  const cells = [
    { role: "remain" as const, centroid: { x: 0, y: 0, z: 0 } },
    { role: "loose" as const, centroid: { x: 1, y: 0, z: 0 } },
    { role: "micro" as const, centroid: { x: 2, y: 0, z: 0 } },
    { role: "remain" as const, centroid: { x: 3, y: 0, z: 0 } },
  ];
  const bonds = [
    { id: 10, anchor: { x: 0, y: 0, z: 0 } },
    { id: 11, anchor: { x: 2, y: 0, z: 0 } },
    { id: 12, anchor: { x: 2.9, y: 0, z: 0 } }, // missing from plan -> nearest remain (3)
    { id: 13, anchor: { x: 0, y: 0, z: 0 } },
  ];
  const res = resolveBondTransfers(
    bonds,
    [
      { bondId: 10, cell: 0 },
      { bondId: 11, cell: 2 }, // micro -> broken
      { bondId: 13, cell: -1 },
    ],
    cells,
  );
  assert.deepEqual(res, [0, -1, 3, -1]);
});
