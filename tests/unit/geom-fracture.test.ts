import { test } from "node:test";
import assert from "node:assert/strict";
import { faceAttr, polyBox, polyCylinder, polyFromHull, polyTransform, polyVolume, polySignedDist, polyFaceAreaOnPlane, polyExtents, polyCentroid, type ConvexPoly } from "../../src/geom/poly.ts";
import { voronoiFracture, generateSeeds, type FractureCell, type SeedPattern } from "../../src/geom/fracture.ts";
import { latheTiles } from "../../src/geom/primitives.ts";
import { qeuler, type Vec3 } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { assertValid, near, bench, assertPerf, v } from "./geom-helpers.ts";

const A = faceAttr(1, 0xabcdef);
const INT = faceAttr(9, 0x777777);

function checkCells(poly: ConvexPoly, cells: FractureCell[], label: string, tol = 1e-6): void {
  const V = polyVolume(poly);
  let sum = 0;
  for (const c of cells) {
    assertValid(c.poly, `${label} cell`);
    near(c.volume, polyVolume(c.poly), 1e-12 + 1e-9 * c.volume, `${label} reported volume`);
    sum += c.volume;
    assert.ok(c.maxExtent > 0 && Number.isFinite(c.maxExtent));
    for (const k of ["x", "y", "z"] as const) assert.ok(Number.isFinite(c.centroid[k]));
  }
  near(sum, V, tol * V, `${label}: volumes sum to the input`);
  // neighbour symmetry with symmetric areas, matching the shared face area
  cells.forEach((c, i) => {
    for (const nb of c.neighbors) {
      assert.ok(nb.cell !== i && nb.cell >= 0 && nb.cell < cells.length);
      const back = cells[nb.cell].neighbors.find((q) => q.cell === i);
      assert.ok(back, `${label}: neighbour ${i}→${nb.cell} not symmetric`);
      assert.equal(back!.area, nb.area, `${label}: asymmetric area`);
      assert.ok(nb.area > 0);
      // the shared face lies on the bisector plane: its area matches the face of cell i on that plane
      const f = c.poly.faces.find((ff) => ff.attr.interior && cells[nb.cell].poly.faces.some((g) => g.attr.interior && g.n.x * ff.n.x + g.n.y * ff.n.y + g.n.z * ff.n.z < -0.999999 && Math.abs(g.d + ff.d) < 1e-9));
      if (f) near(polyFaceAreaOnPlane(c.poly, f.n, f.d, 1e-9), nb.area, 1e-6 * nb.area + 1e-12, "area = shared face area");
    }
  });
}

const randomSeeds = (rng: Rng, n: number, lo: Vec3, hi: Vec3) => Array.from({ length: n }, () => v(rng.range(lo.x, hi.x), rng.range(lo.y, hi.y), rng.range(lo.z, hi.z)));

test("voronoiFracture: random seeds in a box tile it exactly; attributes preserved", () => {
  const rng = new Rng(42);
  const box = polyBox(v(0.6, 0.4, 0.3), A, { p: v(1, 0.5, -2), q: qeuler(0.2, 0.4, 0.1) });
  const c0 = polyCentroid(box);
  const seeds = randomSeeds(rng, 30, v(c0.x - 0.25, c0.y - 0.2, c0.z - 0.12), v(c0.x + 0.25, c0.y + 0.2, c0.z + 0.12));
  const cells = voronoiFracture(box, seeds, { interiorAttr: INT });
  checkCells(box, cells, "box30");
  let interiorFaces = 0;
  for (const c of cells) {
    for (const f of c.poly.faces) {
      if (f.attr.interior) {
        interiorFaces++;
        assert.equal(f.attr.surf, 9);
        assert.equal(f.attr.tint, 0x777777);
        assert.ok(Math.hypot(f.attr.uv.u.x, f.attr.uv.u.y, f.attr.uv.u.z) > 0.99, "interior uv derived");
      } else {
        assert.equal(f.attr.surf, 1);
        assert.equal(f.attr.tint, 0xabcdef);
      }
    }
  }
  assert.ok(interiorFaces > 30);
  // every cell contains its seed when the seed is inside
  for (const c of cells) if (polySignedDist(box, c.seed) < 0) assert.ok(polySignedDist(c.poly, c.seed) <= 1e-12);
});

test("voronoiFracture: degenerate seed sets (grid on faces/edges/corners, coplanar, duplicates, outside)", () => {
  const box = polyBox(v(0.6, 0.4, 0.3), A);
  const grid: Vec3[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) grid.push(v(-0.3 + i * 0.2, -0.2 + (j * 0.4) / 3, -0.15 + k * 0.15));
  checkCells(box, voronoiFracture(box, grid, { interiorAttr: INT }), "grid on boundary");
  const rng = new Rng(7);
  const planar = randomSeeds(rng, 25, v(-0.29, -0.19, 0.05), v(0.29, 0.19, 0.05));
  const pc = voronoiFracture(box, planar, { interiorAttr: INT });
  checkCells(box, pc, "coplanar seeds");
  assert.equal(pc.length, 25);
  const dup = [v(0, 0, 0), v(0, 0, 0), v(0.1, 0, 0), v(5, 5, 5), v(0.1, 1e-12, 0), v(-0.2, 0.1, 0), v(NaN, 0, 0)];
  const dc = voronoiFracture(box, dup, { interiorAttr: INT });
  checkCells(box, dc, "duplicates/outside");
  assert.equal(dc.length, 3, "duplicates collapse, far outside seed gets nothing");
  // all seeds outside on one side still tile the box
  const out = voronoiFracture(box, [v(1, 0, 0), v(1, 0.3, 0), v(1, -0.3, 0.2)], { interiorAttr: INT });
  checkCells(box, out, "outside seeds");
  // single seed → the whole poly
  const one = voronoiFracture(box, [v(0, 0, 0)], { interiorAttr: INT });
  assert.equal(one.length, 1);
  near(one[0].volume, polyVolume(box), 1e-12);
  assert.equal(one[0].neighbors.length, 0);
  assert.equal(voronoiFracture(box, [], { interiorAttr: INT }).length, 0);
});

test("voronoiFracture: curved and smooth inputs (cylinder with vn, lathe tile, hull)", () => {
  const rng = new Rng(3);
  const cyl = polyCylinder(0.05, 0.04, 0.3, 16, faceAttr(2, 0xffffff, { smooth: 1 }), A, { p: v(0, 1, 0), q: qeuler(0.5, 0, 0.3) });
  const cc = polyCentroid(cyl);
  const cells = voronoiFracture(cyl, randomSeeds(rng, 12, v(cc.x - 0.05, cc.y - 0.15, cc.z - 0.05), v(cc.x + 0.05, cc.y + 0.15, cc.z + 0.05)), { interiorAttr: INT });
  checkCells(cyl, cells, "cylinder");
  // smooth side faces keep (interpolated) unit vn
  for (const c of cells) for (const f of c.poly.faces) if (f.vn) for (const n of f.vn) near(Math.hypot(n.x, n.y, n.z), 1, 1e-9);
  const tile = latheTiles({ profile: [[0.1, 0], [0.12, 0.08]], thickness: 0.008, segments: 8, outer: faceAttr(2, 0xffffff, { smooth: 1 }), inner: faceAttr(3, 0xffffff, { smooth: 2 }), edge: faceAttr(4) })[2].poly;
  const tc = polyCentroid(tile);
  checkCells(tile, voronoiFracture(tile, randomSeeds(rng, 6, v(tc.x - 0.03, tc.y - 0.03, tc.z - 0.03), v(tc.x + 0.03, tc.y + 0.03, tc.z + 0.03)), { interiorAttr: INT }), "lathe tile");
  const hull = polyFromHull(Array.from({ length: 50 }, () => rng.onSphere()), A);
  checkCells(hull, voronoiFracture(hull, randomSeeds(rng, 40, v(-0.6, -0.6, -0.6), v(0.6, 0.6, 0.6)), { interiorAttr: INT }), "hull");
});

test("voronoiFracture: anisotropy elongates cells along the axis; grain orients interior uv", () => {
  const plank = polyBox(v(1.2, 0.025, 0.2), A);
  const rng = new Rng(5);
  const seeds = randomSeeds(rng, 40, v(-0.5, 0, -0.09), v(0.5, 0, 0.09));
  const ratio = (cells: FractureCell[]) => {
    let along = 0,
      across = 0;
    for (const c of cells) {
      let x0 = Infinity,
        x1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity;
      for (const p of c.poly.verts) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z);
      }
      along += x1 - x0;
      across += z1 - z0;
    }
    return along / across;
  };
  const iso = voronoiFracture(plank, seeds, { interiorAttr: INT });
  const ani = voronoiFracture(plank, seeds, { interiorAttr: INT, anisotropy: { axis: v(1, 0, 0), factor: 4 }, grain: v(1, 0, 0) });
  checkCells(plank, iso, "iso");
  checkCells(plank, ani, "aniso");
  assert.ok(ratio(ani) > 1.8 * ratio(iso), `anisotropic cells elongated (${ratio(ani).toFixed(2)} vs ${ratio(iso).toFixed(2)})`);
  for (const c of ani)
    for (const f of c.poly.faces)
      if (f.attr.interior && Math.abs(f.n.x) < 0.95) assert.ok(Math.abs(f.attr.uv.u.x) > 0.3, "interior u follows the grain where possible");
});

test("voronoiFracture: minVolume drops slivers; default scales for tiny parts; deterministic", () => {
  const box = polyBox(v(0.1, 0.1, 0.1), A);
  // the bisector of the last two seeds cuts a 1.5 mm corner tetrahedron (≈ 5.6e-10 m³)
  const seeds = [v(-0.03, 0, 0), v(0.04, 0.04, 0.04), v(0.059, 0.059, 0.059)];
  const all = voronoiFracture(box, seeds, { interiorAttr: INT, minVolume: 0 });
  const some = voronoiFracture(box, seeds, { interiorAttr: INT, minVolume: 1e-9 });
  assert.equal(all.length, 3);
  assert.equal(some.length, 2, "corner sliver dropped");
  near(all[2].volume, 0.0015 ** 3 / 6, 1e-12, "sliver volume");
  for (const c of some) for (const nb of c.neighbors) assert.ok(nb.cell < some.length);
  // a 4 mm cube still fractures with the default minVolume
  const tiny = polyBox(v(0.004, 0.004, 0.004), A);
  const tc = voronoiFracture(tiny, [v(-0.001, 0, 0), v(0.001, 0, 0), v(0, 0.0015, 0)], { interiorAttr: INT });
  assert.equal(tc.length, 3);
  checkCells(tiny, tc, "tiny");
  const rng1 = new Rng(99),
    rng2 = new Rng(99);
  const s1 = randomSeeds(rng1, 20, v(-0.05, -0.05, -0.05), v(0.05, 0.05, 0.05));
  const s2 = randomSeeds(rng2, 20, v(-0.05, -0.05, -0.05), v(0.05, 0.05, 0.05));
  assert.deepEqual(voronoiFracture(box, s1, { interiorAttr: INT }), voronoiFracture(box, s2, { interiorAttr: INT }));
});

// ------------------------------------------------------------------ seed patterns
const PATTERNS: SeedPattern[] = ["radial", "dice", "chunks", "splinter", "crumble", "crack"];

test("generateSeeds: every pattern returns seeds strictly inside (thin, thick, rotated, tiny parts)", () => {
  const parts: Array<[string, ConvexPoly, Vec3, Vec3]> = [
    ["pane", polyBox(v(1, 1.2, 0.004), A, { p: v(2, 1.5, 0), q: qeuler(0.1, 0.5, 0) }), v(2.1, 1.3, 0.05), v(0, 0, -1)],
    ["block", polyBox(v(0.3, 0.2, 0.25), A), v(0.15, 0.05, 0), v(-1, 0, 0)],
    ["stud", polyBox(v(0.038, 2.4, 0.089), A), v(0, 1, 0.0445), v(0, 0, -1)],
    ["cylinder", polyCylinder(0.04, 0.04, 0.1, 12, A, A), v(0.04, 0, 0), v(-1, 0, 0)],
    ["button", polyBox(v(0.008, 0.004, 0.008), A), v(0, 0.002, 0), v(0, -1, 0)],
  ];
  for (const [name, poly, impact, dir] of parts) {
    for (const pattern of PATTERNS) {
      for (const seed of [1, 2]) {
        const s = generateSeeds(poly, { pattern, impact, dir, radius: 0.08, count: 24, cell: 0.03, rng: new Rng(seed) });
        assert.ok(s.length > 0, `${name}/${pattern}: no seeds`);
        for (const p of s) {
          assert.ok(Number.isFinite(p.x + p.y + p.z));
          assert.ok(polySignedDist(poly, p) < 0, `${name}/${pattern}: seed outside (${polySignedDist(poly, p)})`);
        }
      }
    }
  }
});

test("generateSeeds: deterministic, counts, degenerate options", () => {
  const block = polyBox(v(0.3, 0.2, 0.25), A);
  const o = { impact: v(0.15, 0, 0), dir: v(-1, 0, 0), radius: 0.06, count: 15 };
  for (const pattern of PATTERNS) {
    const a = generateSeeds(block, { ...o, pattern, rng: new Rng(4) });
    const b = generateSeeds(block, { ...o, pattern, rng: new Rng(4) });
    assert.deepEqual(a, b, `${pattern} deterministic`);
    if (pattern !== "dice") assert.equal(a.length, 15, `${pattern} count`);
  }
  assert.equal(generateSeeds(block, { ...o, pattern: "chunks", count: 0, rng: new Rng(1) }).length, 0);
  const weird = generateSeeds(block, { pattern: "chunks", impact: v(NaN, 5, 5), dir: v(0, 0, 0), radius: -1, count: 5, rng: new Rng(1) });
  assert.equal(weird.length, 5);
  for (const p of weird) assert.ok(polySignedDist(block, p) < 0);
  assert.equal(generateSeeds({ verts: [], faces: [] }, { ...o, pattern: "crack", rng: new Rng(1) }).length, 0);
});

test("generateSeeds radial: mid-plane web of rays/rings around the impact + far seeds", () => {
  const pane = polyBox(v(1, 1.2, 0.004), A);
  const impact = v(0.1, -0.2, -0.002);
  const s = generateSeeds(pane, { pattern: "radial", impact, dir: v(0, 0, 1), radius: 0.25, count: 40, far: 4, rng: new Rng(8) });
  assert.equal(s.length, 40);
  for (const p of s) near(p.z, 0, 1e-12, "seeds on the pane mid-plane");
  const inner = s.slice(0, 36),
    far = s.slice(36);
  for (const p of inner) assert.ok(Math.hypot(p.x - 0.1, p.y + 0.2) <= 0.25 * 1.2 * 1.1 + 1e-9, "inner seeds within the breakout radius");
  for (const p of far) assert.ok(Math.hypot(p.x - 0.1, p.y + 0.2) > 0.25 * 1.2 - 1e-9, "far seeds beyond the radius");
  // radii are geometric: several rings with clearly different radii
  const radii = inner.map((p) => Math.hypot(p.x - 0.1, p.y + 0.2)).sort((a, b) => a - b);
  assert.ok(radii[radii.length - 1] / radii[0] > 3, "geometric ring radii");
  // fracture with them: the impact region gets small shards, far cells are big
  const cells = voronoiFracture(pane, s, { interiorAttr: INT });
  checkCells(pane, cells, "radial pane");
  const nearC = cells.filter((c) => Math.hypot(c.centroid.x - 0.1, c.centroid.y + 0.2) < 0.08);
  const farC = cells.filter((c) => Math.hypot(c.centroid.x - 0.1, c.centroid.y + 0.2) > 0.35);
  assert.ok(nearC.length > 0 && farC.length > 0);
  const avg = (cs: FractureCell[]) => cs.reduce((x, c) => x + c.volume, 0) / cs.length;
  assert.ok(avg(farC) > 5 * avg(nearC), "shards grow away from the impact");
});

test("generateSeeds dice: jittered grid spacing ≈ cell over the whole pane; count is a budget", () => {
  const pane = polyBox(v(0.8, 1.8, 0.008), A);
  const s = generateSeeds(pane, { pattern: "dice", impact: v(0, 0, 0), dir: v(0, 0, -1), radius: 0.1, count: 3000, cell: 0.05, rng: new Rng(2) });
  const expected = (0.8 / 0.05) * (1.8 / 0.05);
  assert.ok(Math.abs(s.length - expected) <= 0.1 * expected, `dice count ${s.length} vs ${expected}`);
  for (const p of s) near(p.z, 0, 1e-12);
  // nearest-neighbour spacing ~ cell
  let sum = 0;
  for (let i = 0; i < s.length; i += 7) {
    let best = Infinity;
    for (let j = 0; j < s.length; j++) if (j !== i) best = Math.min(best, Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y));
    sum += best;
  }
  const mean = sum / Math.ceil(s.length / 7);
  assert.ok(mean > 0.025 && mean < 0.055, `mean NN spacing ${mean}`);
  const budget = generateSeeds(pane, { pattern: "dice", impact: v(0, 0, 0), dir: v(0, 0, -1), radius: 0.1, count: 200, cell: 0.02, rng: new Rng(2) });
  assert.ok(budget.length <= 260, `budget respected (${budget.length})`);
});

test("generateSeeds chunks / splinter / crumble / crack distributions", () => {
  const block = polyBox(v(0.4, 0.3, 0.3), A);
  const imp = v(0.2, 0, 0);
  const ch = generateSeeds(block, { pattern: "chunks", impact: imp, dir: v(-1, 0, 0), radius: 0.08, count: 12, far: 3, rng: new Rng(1) });
  for (const p of ch.slice(0, 9)) assert.ok(Math.hypot(p.x - 0.2, p.y, p.z) <= 0.08 + 1e-9, "chunk inner within radius");
  for (const p of ch.slice(9)) assert.ok(Math.hypot(p.x - 0.2, p.y, p.z) > 0.08, "far chunk seeds outside radius");
  const plank = polyBox(v(1.2, 0.025, 0.2), A);
  const sp = generateSeeds(plank, { pattern: "splinter", impact: v(0, 0.0125, 0), dir: v(0, -1, 0), radius: 0.05, count: 42, far: 2, grain: v(1, 0, 0), rng: new Rng(3) });
  const inner = sp.slice(0, 40);
  const varX = inner.reduce((s, p) => s + p.x * p.x, 0) / inner.length,
    varZ = inner.reduce((s, p) => s + p.z * p.z, 0) / inner.length;
  assert.ok(varX > 6 * varZ, "splinter cluster elongated along the grain");
  for (const p of inner) near(p.y, 0, 1e-12, "plank mid-plane");
  const wall = polyBox(v(1.2, 2.4, 0.0125), A);
  const cr = generateSeeds(wall, { pattern: "crumble", impact: v(0.1, 1, 0.00625), dir: v(0, 0, -1), radius: 0.06, count: 42, far: 2, rng: new Rng(4) });
  const innerC = cr.slice(0, 40);
  const crumbs = innerC.filter((p) => Math.hypot(p.x - 0.1, p.y - 1) <= 0.03 + 1e-9).length;
  near(crumbs, 26, 1, "65 % crumbs within 0.5·radius");
  for (const p of innerC) assert.ok(Math.hypot(p.x - 0.1, p.y - 1) <= 0.06 * 1.3 + 1e-9);
  const case_ = polyBox(v(0.3, 0.002, 0.2), A);
  const ck = generateSeeds(case_, { pattern: "crack", impact: v(0.1, 0.001, 0.05), dir: v(0, -1, 0), radius: 0.05, count: 4, rng: new Rng(5) });
  assert.equal(ck.length, 4);
  assert.ok(Math.hypot(ck[0].x - 0.1, ck[0].z - 0.05) <= 0.05 + 1e-9, "first crack seed near the impact");
  let minD = Infinity;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) minD = Math.min(minD, Math.hypot(ck[i].x - ck[j].x, ck[i].z - ck[j].z));
  assert.ok(minD > 0.04, "crack seeds spread across the part");
});

test("fracture performance: 30 seeds in a box < 5 ms, 300-seed dice < 60 ms", () => {
  const rng = new Rng(42);
  const box = polyBox(v(0.6, 0.4, 0.3), A);
  const s30 = randomSeeds(rng, 30, v(-0.3, -0.2, -0.15), v(0.3, 0.2, 0.15));
  assertPerf("voronoiFracture box 30 seeds", bench(() => voronoiFracture(box, s30, { interiorAttr: INT }), 30, 30), 5);
  const pane = polyBox(v(1.0, 1.2, 0.006), A);
  const dice = generateSeeds(pane, { pattern: "dice", impact: v(0, 0, 0), dir: v(0, 0, -1), radius: 0.1, count: 300, rng: new Rng(1) });
  assert.ok(dice.length >= 280 && dice.length <= 360, `dice seeds ${dice.length}`);
  assertPerf(`voronoiFracture dice ${dice.length} seeds`, bench(() => voronoiFracture(pane, dice, { interiorAttr: INT }), 8, 6), 60);
  assertPerf("generateSeeds dice 300", bench(() => generateSeeds(pane, { pattern: "dice", impact: v(0, 0, 0), dir: v(0, 0, -1), radius: 0.1, count: 300, rng: new Rng(1) }), 10, 5), 10);
});
