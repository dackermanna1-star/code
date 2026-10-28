import { test } from "node:test";
import assert from "node:assert/strict";
import { faceAttr, polyPrism, polyBox, polyBeveledBox, polyCylinder, polyFromHull, polyClip, polyTransform, type ConvexPoly } from "../../src/geom/poly.ts";
import { polyToRenderGeom, mergeRenderGeoms, applyDents, growCracks, CRACK_OFFSET, type Dent, type RenderGeom } from "../../src/geom/meshgen.ts";
import { latheTiles, polyPillow } from "../../src/geom/primitives.ts";
import { voronoiFracture, generateSeeds } from "../../src/geom/fracture.ts";
import { qeuler } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { watertight, windingAgainstNormals, finiteGeom, near, bench, assertPerf, v } from "./geom-helpers.ts";

const A = faceAttr(1);
const SMOOTH = faceAttr(2, 0xffffff, { smooth: 1 });

function shapes(): Array<[string, ConvexPoly]> {
  const rng = new Rng(21);
  const box = polyBox(v(0.5, 0.3, 0.4), [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s, 0xffffff)));
  const cells = voronoiFracture(polyBox(v(0.4, 0.3, 0.2), A), generateSeeds(polyBox(v(0.4, 0.3, 0.2), A), { pattern: "chunks", impact: v(0.1, 0.15, 0), dir: v(0, -1, 0), radius: 0.12, count: 8, rng }), { interiorAttr: faceAttr(9) });
  const tile = latheTiles({ profile: [[0.06, 0], [0.09, 0.05], [0.1, 0.08]], thickness: 0.006, segments: 16, capBottom: true, outer: SMOOTH, inner: faceAttr(3, 0xffffff, { smooth: 2 }), edge: faceAttr(4) });
  return [
    ["box", box],
    ["bevel", polyBeveledBox(v(0.6, 0.2, 0.4), 0.02, A)],
    ["cylinder", polyCylinder(0.1, 0.08, 0.3, 16, SMOOTH, A)],
    ["cone", polyCylinder(0.1, 0, 0.2, 12, SMOOTH, A)],
    ["hull", polyFromHull(Array.from({ length: 40 }, () => rng.onSphere()), A)],
    ["clipped", polyClip(polyTransform(box, { p: v(1, 2, 3), q: qeuler(0.3, 0.7, 0.1) }), v(1, 0.6, 0.2), 2.85, faceAttr(9))!],
    ["voronoi cell", cells[3].poly],
    ["lathe cap tile", tile[0].poly],
    ["lathe wall tile", tile[20].poly],
    ["pillow", polyPillow(v(0.5, 0.15, 0.45), 0.3, SMOOTH)],
  ];
}

const dentsFor = (p: ConvexPoly): Dent[] => {
  const c = p.verts.reduce((s, q) => v(s.x + q.x / p.verts.length, s.y + q.y / p.verts.length, s.z + q.z / p.verts.length), v(0, 0, 0));
  const top = p.verts.reduce((a, b) => (b.y > a.y ? b : a));
  return [
    { p: v(top.x * 0.5 + c.x * 0.5, top.y, top.z * 0.5 + c.z * 0.5), dir: v(0, -1, 0), r: 0.08, depth: 0.01 },
    { p: p.verts[0], dir: v(0.3, 0.2, -1), r: 0.05, depth: 0.004 },
  ];
};

test("meshgen is watertight with and without tessellation and dents (all shape kinds)", () => {
  for (const [name, p] of shapes()) {
    for (const tess of [0, 0.03]) {
      for (const withDents of [false, true]) {
        const g = polyToRenderGeom(p, { tessCell: tess, dents: withDents ? dentsFor(p) : undefined });
        finiteGeom(g);
        const w = watertight(g);
        assert.equal(w.bad, 0, `${name} tess=${tess} dents=${withDents}: ${w.bad} bad edges of ${w.edges}`);
        assert.ok(g.indices.length > 0);
      }
    }
  }
});

test("triangle winding is Babylon front-facing: cross(p1-p0, p2-p0) opposes the outward normal", () => {
  for (const [name, p] of shapes()) {
    for (const tess of [0, 0.03]) {
      const g = polyToRenderGeom(p, { tessCell: tess });
      const w = windingAgainstNormals(g);
      assert.equal(w.wrong, 0, `${name} tess=${tess}: ${w.wrong}/${w.total} triangles wound the wrong way`);
    }
  }
});

test("flat faces: crisp face normals, planar uvs, surf and tint per face", () => {
  const attrs = [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s + 10, 0x102030 * (s + 1)));
  const b = polyBox(v(1, 2, 3), attrs);
  const g = polyToRenderGeom(b);
  assert.equal(g.vertexCount, 24);
  assert.equal(g.indices.length, 36);
  for (let i = 0; i < g.vertexCount; i++) {
    const s = g.surf[i] - 10;
    const f = b.faces[s];
    near(g.normals[3 * i] - f.n.x + g.normals[3 * i + 1] - f.n.y + g.normals[3 * i + 2] - f.n.z, 0, 1e-6, "face normal");
    assert.equal(g.tint[i], f.attr.tint);
    const p = v(g.positions[3 * i], g.positions[3 * i + 1], g.positions[3 * i + 2]);
    const u = p.x * f.attr.uv.u.x + p.y * f.attr.uv.u.y + p.z * f.attr.uv.u.z + f.attr.uv.u0;
    near(g.uvs[2 * i], u, 1e-6, "planar u");
  }
});

test("smooth shading: vn and smoothing groups give continuous unit normals", () => {
  const c = polyCylinder(0.2, 0.2, 0.5, 12, SMOOTH, A);
  const g = polyToRenderGeom(c);
  // vertices at the same position on two side faces share the normal
  const byPos = new Map<string, number[][]>();
  for (let i = 0; i < g.vertexCount; i++) {
    const n = [g.normals[3 * i], g.normals[3 * i + 1], g.normals[3 * i + 2]];
    near(Math.hypot(n[0], n[1], n[2]), 1, 1e-6);
    if (Math.abs(n[1]) > 0.5) continue; // caps
    const k = `${g.positions[3 * i].toFixed(6)},${g.positions[3 * i + 1].toFixed(6)},${g.positions[3 * i + 2].toFixed(6)}`;
    (byPos.get(k) ?? byPos.set(k, []).get(k)!).push(n);
  }
  for (const list of byPos.values()) for (const n of list) near(n[0] - list[0][0] + n[2] - list[0][2], 0, 1e-6, "shared smooth normal");
  // smoothing group without vn: hull with smooth attr averages normals at shared vertices
  const hull = polyFromHull(Array.from({ length: 30 }, (_, i) => v(Math.cos(i * 2.4) * 0.2, Math.sin(i * 1.3) * 0.2, Math.cos(i * 0.7) * 0.2)), SMOOTH);
  const gh = polyToRenderGeom(hull);
  finiteGeom(gh);
  for (let i = 0; i < gh.vertexCount; i++) near(Math.hypot(gh.normals[3 * i], gh.normals[3 * i + 1], gh.normals[3 * i + 2]), 1, 1e-6);
  // tessellated smooth faces interpolate normals (still unit, still outward-ish)
  const gt = polyToRenderGeom(c, { tessCell: 0.05 });
  finiteGeom(gt);
  for (let i = 0; i < gt.vertexCount; i++) {
    const n = v(gt.normals[3 * i], gt.normals[3 * i + 1], gt.normals[3 * i + 2]);
    near(Math.hypot(n.x, n.y, n.z), 1, 1e-6);
    if (Math.abs(n.y) < 0.5) assert.ok(n.x * gt.positions[3 * i] + n.z * gt.positions[3 * i + 2] > 0, "outward");
  }
});

test("tessellation: 0.4 m panel with 4 cm cells subdivides edges and fills the interior", () => {
  const panel = polyBox(v(0.4, 0.0012, 0.4), A);
  const g = polyToRenderGeom(panel, { tessCell: 0.04 });
  finiteGeom(g);
  assert.equal(watertight(g).bad, 0);
  // longest triangle edge on the big faces ≤ ~1.5 cells
  let maxEdge = 0;
  for (let t = 0; t < g.indices.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = g.indices[3 * t + k],
        b = g.indices[3 * t + ((k + 1) % 3)];
      const l = Math.hypot(g.positions[3 * a] - g.positions[3 * b], g.positions[3 * a + 1] - g.positions[3 * b + 1], g.positions[3 * a + 2] - g.positions[3 * b + 2]);
      maxEdge = Math.max(maxEdge, l);
    }
  }
  assert.ok(maxEdge <= 0.04 * 1.5, `max edge ${maxEdge}`);
  assert.ok(g.vertexCount > 200 && g.vertexCount < 600, `vertex count ${g.vertexCount}`);
  // small faces are not subdivided
  assert.equal(polyToRenderGeom(polyBox(v(0.03, 0.03, 0.03), A), { tessCell: 0.04 }).vertexCount, 24);
});

test("dents: smooth continuous displacement, rim unchanged, tint scuffed on the struck side, normals tilted", () => {
  const panel = polyBox(v(0.4, 0.002, 0.4), [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s, 0xffffff)));
  const dent: Dent = { p: v(0, 0.001, 0), dir: v(0, -1, 0), r: 0.1, depth: 0.02 };
  const g0 = polyToRenderGeom(panel, { tessCell: 0.02 });
  const g = polyToRenderGeom(panel, { tessCell: 0.02, dents: [dent], dentDarken: 0.5 });
  assert.equal(g.vertexCount, g0.vertexCount);
  let maxDepth = 0,
    tilted = 0,
    darkTop = 0,
    darkBottom = 0;
  for (let i = 0; i < g.vertexCount; i++) {
    const dy = g.positions[3 * i + 1] - g0.positions[3 * i + 1];
    const r = Math.hypot(g0.positions[3 * i], g0.positions[3 * i + 1] - 0.001, g0.positions[3 * i + 2]);
    if (r >= 0.1) near(dy, 0, 1e-9, "outside the radius: untouched");
    else {
      const s = 1 - (r / 0.1) ** 2;
      near(dy, -0.02 * s * s, 1e-6, "falloff (1-(d/r)²)²");
    }
    maxDepth = Math.max(maxDepth, -dy);
    if (Math.abs(g.normals[3 * i + 1]) < 0.999 && Math.abs(g0.normals[3 * i + 1]) > 0.999) tilted++;
    if (g.tint[i] !== 0xffffff) {
      if (g.surf[i] === 2) darkTop++;
      if (g.surf[i] === 3) darkBottom++;
    }
  }
  near(maxDepth, 0.02, 0.0015, "peak depth");
  assert.ok(tilted > 10, "normals follow the dent");
  assert.ok(darkTop > 5, "struck (+Y) side scuffed");
  assert.equal(darkBottom, 0, "back side not scuffed");
  assert.equal(watertight(g).bad, 0);
  // dentDarken 0 → no tint change
  const g2 = polyToRenderGeom(panel, { tessCell: 0.02, dents: [dent], dentDarken: 0 });
  assert.ok(Array.from(g2.tint).every((t) => t === 0xffffff));
  // invalid dents are ignored
  const g3 = polyToRenderGeom(panel, { dents: [{ p: v(NaN, 0, 0), dir: v(0, -1, 0), r: 0.1, depth: 0.1 }, { p: v(0, 0, 0), dir: v(0, -1, 0), r: 0, depth: 1 }] });
  finiteGeom(g3);
});

test("applyDents matches meshgen displacement", () => {
  const dents: Dent[] = [
    { p: v(0.05, 0.1, 0), dir: v(0, -2, 0), r: 0.1, depth: 0.03 },
    { p: v(-0.05, 0.1, 0.02), dir: v(0.2, -1, 0), r: 0.06, depth: 0.01 },
  ];
  const b = polyBox(v(0.3, 0.2, 0.3), A);
  const g0 = polyToRenderGeom(b, { tessCell: 0.03 });
  const g1 = polyToRenderGeom(b, { tessCell: 0.03, dents });
  const pos = g0.positions.slice();
  applyDents(pos, dents);
  for (let i = 0; i < pos.length; i++) near(pos[i], g1.positions[i], 1e-6);
  const empty = new Float32Array([1, 2, 3]);
  applyDents(empty, []);
  assert.deepEqual(Array.from(empty), [1, 2, 3]);
});

test("growCracks: points on the hit face plane and inside it, deterministic, severity scaling", () => {
  const pane = polyBox(v(1, 1.2, 0.004), A);
  const imp = v(0.1, -0.2, -0.002);
  const dir = v(0, 0, 1); // hitting the -Z face
  const a = growCracks(pane, imp, dir, 0.7, new Rng(5), { radial: true });
  const b = growCracks(pane, imp, dir, 0.7, new Rng(5), { radial: true });
  assert.deepEqual(a, b, "deterministic for a fixed rng seed");
  assert.ok(a.length >= 6, "radial star has 6–12 rays plus rings");
  for (const c of a) {
    near(c.n.z, -1, 1e-12, "crack normal = hit face normal");
    assert.ok(c.width > 0);
    for (const p of c.points) {
      near(p.z, -0.002, 1e-12, "on the face plane");
      assert.ok(Math.abs(p.x) <= 0.5 + 1e-9 && Math.abs(p.y) <= 0.6 + 1e-9, "inside the face");
    }
  }
  assert.equal(growCracks(pane, imp, dir, 0, new Rng(1)).length, 0, "severity 0 → none");
  const len = (cs: ReturnType<typeof growCracks>) => cs.reduce((s, c) => s + c.points.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - c.points[i].x, p.y - c.points[i].y), 0), 0);
  let lo = 0,
    hi = 0;
  for (let s = 0; s < 10; s++) {
    lo += len(growCracks(pane, imp, dir, 0.15, new Rng(s)));
    hi += len(growCracks(pane, imp, dir, 0.95, new Rng(s)));
  }
  assert.ok(hi > 2 * lo, "more severe → more/longer cracks");
  // impact near a corner on a small block: cracks stay on the face
  const blk = polyBox(v(0.1, 0.05, 0.08), A, { p: v(1, 1, 1), q: qeuler(0.3, 0.4, 0.5) });
  const cs = growCracks(blk, blk.verts[0], v(0, -1, 0), 1, new Rng(3), { maxLength: 0.3 });
  for (const c of cs) {
    const f = blk.faces.find((x) => Math.abs(x.n.x - c.n.x) + Math.abs(x.n.y - c.n.y) + Math.abs(x.n.z - c.n.z) < 1e-9)!;
    for (const p of c.points) near(f.n.x * p.x + f.n.y * p.y + f.n.z * p.z, f.d, 1e-9);
  }
});

test("cracks render as thin ribbons offset along n, clipped to the face that holds them", () => {
  const box = polyBox(v(0.5, 0.5, 0.5), A);
  const cracks = growCracks(box, v(0, 0.25, 0), v(0, -1, 0), 0.8, new Rng(2), { width: 0.002 });
  const base = polyToRenderGeom(box);
  const g = polyToRenderGeom(box, { cracks, crackSurf: 77 });
  finiteGeom(g);
  assert.ok(g.vertexCount > base.vertexCount);
  let crackVerts = 0;
  for (let i = 0; i < g.vertexCount; i++) {
    if (g.surf[i] !== 77) continue;
    crackVerts++;
    near(g.positions[3 * i + 1], 0.25 + CRACK_OFFSET, 1e-6, "offset 0.5 mm above the top face");
    near(g.normals[3 * i + 1], 1, 1e-6);
  }
  assert.ok(crackVerts > 0);
  const w = windingAgainstNormals(g);
  assert.equal(w.wrong, 0, "ribbons face outward (Babylon order)");
  // without crackSurf: face surface, dark tint
  const g2 = polyToRenderGeom(box, { cracks });
  assert.ok(Array.from(g2.tint).some((t) => t === 0x1c1916));
  // cracks of a parent part are clipped to a fragment's face; cracks on other planes ignored
  const half = polyClip(box, v(1, 0, 0), 0, faceAttr(9))!;
  const gh = polyToRenderGeom(half, { cracks, crackSurf: 77 });
  for (let i = 0; i < gh.vertexCount; i++) if (gh.surf[i] === 77) assert.ok(gh.positions[3 * i] <= 0.0015, "clipped to the fragment");
  const moved = polyTransform(box, { p: v(0, 1, 0), q: { x: 0, y: 0, z: 0, w: 1 } });
  assert.equal(polyToRenderGeom(moved, { cracks, crackSurf: 77 }).vertexCount, polyToRenderGeom(moved).vertexCount);
});

test("mergeRenderGeoms concatenates and rebases indices", () => {
  const g1 = polyToRenderGeom(polyBox(v(1, 1, 1), A));
  const g2 = polyToRenderGeom(polyCylinder(0.2, 0.2, 0.4, 8, SMOOTH, A));
  const m = mergeRenderGeoms([g1, g2]);
  assert.equal(m.vertexCount, g1.vertexCount + g2.vertexCount);
  assert.equal(m.indices.length, g1.indices.length + g2.indices.length);
  for (let i = 0; i < g2.indices.length; i++) assert.equal(m.indices[g1.indices.length + i], g2.indices[i] + g1.vertexCount);
  assert.deepEqual(Array.from(m.positions.subarray(g1.vertexCount * 3)), Array.from(g2.positions));
  const e = mergeRenderGeoms([]);
  assert.equal(e.vertexCount, 0);
});

test("degenerate and T-junction inputs", () => {
  const empty: RenderGeom = polyToRenderGeom({ verts: [], faces: [] });
  assert.equal(empty.vertexCount, 0);
  // hand-made T-junction: a box whose +X face is split into two quads while the +Y face keeps a long edge
  const b = polyBox(v(1, 1, 1), A);
  const mid1 = b.verts.length,
    mid2 = mid1 + 1;
  const verts = [...b.verts, v(0.5, 0.5, 0), v(0.5, -0.5, 0)];
  const faces = b.faces.filter((f) => f.n.x < 0.5).map((f) => ({ ...f }));
  // +X face corners: 1(+,-,-) 3(+,+,-) 7(+,+,+) 5(+,-,+); split at z = 0
  const px = b.faces.find((f) => f.n.x > 0.5)!;
  faces.push({ ...px, idx: [1, 3, mid1, mid2] }, { ...px, idx: [mid2, mid1, 7, 5] });
  const tj: ConvexPoly = { verts, faces };
  for (const tess of [0, 0.3]) {
    const g = polyToRenderGeom(tj, { tessCell: tess, dents: [{ p: v(0.5, 0.5, 0), dir: v(-1, -1, 0), r: 0.4, depth: 0.05 }] });
    finiteGeom(g);
    assert.equal(watertight(g).bad, 0, `T-junction repaired (tess ${tess})`);
  }
});

test("regression: edges barely longer than tessCell split identically on both faces (no T-junction)", () => {
  // the short triangle caps take the fast path unless their split test matches the edge split test
  for (const k of [1.00005, 1.0000001, 1 + 1e-8, 1.0002]) {
    const prism = polyPrism([[0, 0], [0.04 * k, 0], [0.02 * k, 0.0346]], 0.4, A, A);
    for (const dents of [undefined, [{ p: v(0.02, 0, 0), dir: v(0, 1, 0), r: 0.05, depth: 0.003 }]]) {
      const g = polyToRenderGeom(prism, { tessCell: 0.04, dents });
      finiteGeom(g);
      assert.equal(watertight(g).bad, 0, `prism scale ${k} dents ${!!dents}`);
    }
  }
});

test("meshgen performance: 0.4 m panel with tessCell 0.04 < 1 ms", () => {
  const panel = polyBox(v(0.4, 0.0012, 0.4), A);
  assertPerf("polyToRenderGeom 0.4 m panel tess 0.04", bench(() => polyToRenderGeom(panel, { tessCell: 0.04 }), 40, 30), 1);
  const cell = polyClip(polyBox(v(0.4, 0.3, 0.2), A), v(1, 0.3, 0.2), 0.05, faceAttr(9))!;
  const r = bench(() => polyToRenderGeom(cell), 200, 200);
  console.log(`  polyToRenderGeom plain 7-face cell: min ${(r.min * 1000).toFixed(1)} µs, median ${(r.median * 1000).toFixed(1)} µs`);
});

test("tessellation vertex budget keeps huge parts bounded and watertight", async () => {
  const { TESS_VERTEX_BUDGET } = await import("../../src/geom/meshgen.ts");
  const slab = polyBox(v(5, 0.2, 2.4), A);
  const g = polyToRenderGeom(slab, { tessCell: 0.01 });
  assert.ok(g.vertexCount < TESS_VERTEX_BUDGET * 2.5, `vertices ${g.vertexCount}`);
  assert.equal(watertight(g).bad, 0);
});
