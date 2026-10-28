import { test } from "node:test";
import assert from "node:assert/strict";
import { faceAttr, polyVolume, polyBounds, polyFaceAreaOnPlane, polySignedDist, polyCentroid, type ConvexPoly, type FaceAttr } from "../../src/geom/poly.ts";
import { latheTiles, torusTiles, arcPanelTiles, polyEllipsoid, polyPillow, frameBars, slabGrid, type Tile } from "../../src/geom/primitives.ts";
import { qeuler } from "../../src/geom/vec.ts";
import { assertValid, near, bench, assertPerf, v } from "./geom-helpers.ts";

const OUT = faceAttr(1, 0xffffff, { smooth: 1 });
const IN = faceAttr(2, 0xffffff, { smooth: 2 });
const EDGE = faceAttr(3);
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Largest contact area between two polys: a face of a coplanar with an OPPOSITE-facing face of b. */
function sharedArea(a: ConvexPoly, b: ConvexPoly): number {
  let best = 0;
  for (const f of b.faces) {
    if (!a.faces.some((g) => dot(g.n, f.n) < -0.999 && Math.abs(g.d + f.d) < 1e-7)) continue;
    best = Math.max(best, polyFaceAreaOnPlane(a, f.n, f.d, 1e-7));
  }
  return best;
}

function byIJ(tiles: Tile[]): Map<string, ConvexPoly> {
  return new Map(tiles.map((t) => [`${t.i},${t.j}`, t.poly]));
}

test("latheTiles: convex tiles, fused grid touching (incl. wrap), volume ≈ analytic shell", () => {
  const R = 0.04,
    H = 0.1,
    T = 0.005,
    segs = 24;
  const tiles = latheTiles({ profile: [[R, 0], [R, H]], thickness: T, segments: segs, capBottom: true, outer: OUT, inner: IN, edge: EDGE });
  assert.equal(tiles.length, segs * 2, "cap row + wall row");
  let vol = 0;
  for (const t of tiles) {
    assertValid(t.poly, `tile ${t.i},${t.j}`);
    vol += polyVolume(t.poly);
  }
  // polygonal analytic: wall annulus + bottom disc (inner radius), with the 24-gon area factor
  const k = 0.5 * segs * Math.sin((2 * Math.PI) / segs);
  const exact = k * (R * R - (R - T) * (R - T)) * H + k * (R - T) * (R - T) * T;
  near(vol, exact, 1e-9, "shell volume");
  const map = byIJ(tiles);
  for (const t of tiles) {
    const right = map.get(`${(t.i + 1) % segs},${t.j}`)!;
    assert.ok(sharedArea(t.poly, right) > 1e-6, `tile ${t.i},${t.j} touches its ring neighbour`);
    const up = map.get(`${t.i},${t.j + 1}`);
    if (up) assert.ok(sharedArea(t.poly, up) > 1e-6, `tile ${t.i},${t.j} touches the row above`);
  }
});

test("latheTiles: curved bowl profile, analytic normals on smooth faces, edge attrs on seams", () => {
  const tiles = latheTiles({
    profile: [
      [0.04, 0],
      [0.07, 0.02],
      [0.09, 0.05],
      [0.1, 0.07],
    ],
    thickness: 0.005,
    segments: 20,
    capBottom: true,
    outer: OUT,
    inner: IN,
    edge: EDGE,
  });
  assert.equal(tiles.length, 20 * 4);
  for (const t of tiles) {
    assertValid(t.poly, `bowl tile ${t.i},${t.j}`);
    const c = polyCentroid(t.poly);
    for (const f of t.poly.faces) {
      if (f.attr.surf === 3) {
        assert.equal(f.vn, undefined, "seams are flat");
        continue;
      }
      assert.ok(f.vn && f.vn.length === f.idx.length, "smooth face has vn");
      for (const n of f.vn!) near(Math.hypot(n.x, n.y, n.z), 1, 1e-9);
      // vn agree with the face orientation (outer outward, inner into the cavity)
      const avg = f.vn!.reduce((s, n) => v(s.x + n.x, s.y + n.y, s.z + n.z), v(0, 0, 0));
      assert.ok(dot(avg, f.n) > 0, "vn on the face's outside");
      assert.ok(dot(f.n, v(f.n.x * f.d - c.x, f.n.y * f.d - c.y, f.n.z * f.d - c.z)) >= -1e-12);
    }
  }
  // every tile of the cap row converges at the axis and touches the wall row
  const map = byIJ(tiles);
  for (let i = 0; i < 20; i++) assert.ok(sharedArea(map.get(`${i},0`)!, map.get(`${i},1`)!) > 1e-7);
});

test("latheTiles: partial angular range, transform, uv continuity across seams", () => {
  const a0 = -Math.PI / 4,
    a1 = Math.PI + Math.PI / 4;
  const tiles = latheTiles({
    profile: [
      [0.2, 0],
      [0.25, 0.1],
      [0.27, 0.15],
    ],
    thickness: 0.012,
    segments: 12,
    angleStart: a0,
    angleEnd: a1,
    outer: OUT,
    inner: IN,
    edge: EDGE,
    xf: { p: v(1, 0.5, -2), q: qeuler(0, 0.3, 0) },
  });
  assert.equal(tiles.length, 12 * 2);
  for (const t of tiles) assertValid(t.poly, "partial tile");
  const map = byIJ(tiles);
  // no wrap-around contact for a partial lathe
  assert.equal(sharedArea(map.get("11,0")!, map.get("0,0")!), 0);
  // outer-surface u coordinate is continuous across a ring seam (within a few mm)
  const left = map.get("4,1")!,
    right = map.get("5,1")!;
  const fl = left.faces.find((f) => f.attr.surf === 1)!,
    fr = right.faces.find((f) => f.attr.surf === 1)!;
  const shared = fl.idx.map((i) => left.verts[i]).filter((p) => fr.idx.some((j) => Math.hypot(right.verts[j].x - p.x, right.verts[j].y - p.y, right.verts[j].z - p.z) < 1e-12));
  assert.equal(shared.length, 2);
  for (const p of shared) {
    const ul = dot(p, fl.attr.uv.u) + fl.attr.uv.u0,
      ur = dot(p, fr.attr.uv.u) + fr.attr.uv.u0;
    assert.ok(Math.abs(ul - ur) < 0.006, `u continuity ${ul} vs ${ur}`);
  }
});

test("latheTiles: degenerate inputs give no tiles and no NaN", () => {
  assert.equal(latheTiles({ profile: [[0.1, 0]], thickness: 0.01, segments: 8, outer: OUT, inner: IN, edge: EDGE }).length, 0);
  assert.equal(latheTiles({ profile: [[0.1, 0], [0.1, 0.1]], thickness: 0, segments: 8, outer: OUT, inner: IN, edge: EDGE }).length, 0);
  const t = latheTiles({ profile: [[0.1, 0], [NaN, 0.05], [0.1, 0.1]], thickness: 0.01, segments: 3, outer: OUT, inner: IN, edge: EDGE });
  assert.equal(t.length, 3);
  for (const x of t) assertValid(x.poly, "nan-filtered");
  // thickness larger than the radius: inner surface clamps at the axis, tiles stay valid
  const thick = latheTiles({ profile: [[0.02, 0], [0.03, 0.05]], thickness: 0.05, segments: 6, outer: OUT, inner: IN, edge: EDGE });
  for (const x of thick) assertValid(x.poly, "thick");
});

test("latheTiles 24×8 performance (< 3 ms)", () => {
  const prof: Array<[number, number]> = [];
  for (let k = 0; k <= 8; k++) {
    const a = ((k / 8) * Math.PI) / 2;
    prof.push([0.05 + 0.1 * Math.sin(a), 0.1 * (1 - Math.cos(a))]);
  }
  const r = bench(() => latheTiles({ profile: prof, thickness: 0.006, segments: 24, outer: OUT, inner: IN, edge: EDGE }), 25, 15);
  assertPerf("latheTiles 24x8", r, 3);
});

test("torusTiles: full ring, elbow arc, touching neighbours, volume", () => {
  const R = 0.2,
    r = 0.03;
  const ring = torusTiles(R, r, 16, 8, OUT);
  assert.equal(ring.length, 16);
  let vol = 0;
  for (const t of ring) {
    assertValid(t.poly, "torus tile");
    vol += polyVolume(t.poly);
    assert.equal(t.j, 0);
  }
  // between the inscribed and the analytic torus volume
  assert.ok(vol < 2 * Math.PI * Math.PI * R * r * r && vol > 0.85 * 2 * Math.PI * Math.PI * R * r * r, `torus volume ${vol}`);
  const map = byIJ(ring);
  for (let i = 0; i < 16; i++) assert.ok(sharedArea(map.get(`${i},0`)!, map.get(`${(i + 1) % 16},0`)!) > 1e-5, "ring neighbours touch");
  const elbow = torusTiles(0.1, 0.012, 4, 10, OUT, undefined, Math.PI / 2);
  assert.equal(elbow.length, 4);
  for (const t of elbow) assertValid(t.poly, "elbow");
  const b = polyBounds(elbow[3].poly);
  assert.ok(b.max.z > 0.1, "elbow reaches +Z after a quarter turn");
  assert.equal(torusTiles(0, 0.1, 8, 8, OUT).length, 0);
});

test("arcPanelTiles: centred on +Z, radius, height, thickness", () => {
  const tiles = arcPanelTiles(1, 1.2, 1.8, 0.008, 12, OUT, IN, EDGE);
  assert.equal(tiles.length, 12);
  let zmax = -Infinity,
    xmin = Infinity,
    xmax = -Infinity;
  for (const t of tiles) {
    assertValid(t.poly, "arc strip");
    const b = polyBounds(t.poly);
    zmax = Math.max(zmax, b.max.z);
    xmin = Math.min(xmin, b.min.x);
    xmax = Math.max(xmax, b.max.x);
    near(b.min.y, -0.9, 1e-12);
    near(b.max.y, 0.9, 1e-12);
  }
  near(zmax, 1, 0.01, "apex at z = radius");
  near(xmin, -xmax, 1e-9, "symmetric about the YZ plane");
  near(xmax, Math.sin(0.6), 1e-9);
});

test("polyEllipsoid and polyPillow: valid, smooth normals, plausible volumes", () => {
  const el = polyEllipsoid(v(0.1, 0.15, 0.08), 12, 8, OUT);
  assertValid(el, "ellipsoid");
  const ve = (4 / 3) * Math.PI * 0.1 * 0.15 * 0.08;
  const vol = polyVolume(el);
  assert.ok(vol < ve && vol > 0.85 * ve, `ellipsoid volume ${vol} vs ${ve}`);
  for (const f of el.faces) {
    assert.ok(f.vn);
    for (const n of f.vn!) near(Math.hypot(n.x, n.y, n.z), 1, 1e-9);
  }
  assert.ok(polyEllipsoid(v(0.1, 0.1, 0.1), 8, 6, faceAttr(1)).faces.every((f) => !f.vn), "smooth 0 → flat");
  assert.equal(polyEllipsoid(v(0, 1, 1), 8, 6, OUT).faces.length, 0);
  const size = v(0.5, 0.15, 0.45);
  let prev = 0;
  for (const rnd of [1, 0.5, 0.3, 0.1]) {
    const p = polyPillow(size, rnd, OUT);
    assertValid(p, `pillow ${rnd}`);
    const pv = polyVolume(p);
    assert.ok(pv <= 0.5 * 0.15 * 0.45 + 1e-12, "inside the box");
    assert.ok(pv > prev, "less round → fuller");
    prev = pv;
    for (const f of p.faces) for (const n of f.vn!) near(Math.hypot(n.x, n.y, n.z), 1, 1e-9);
  }
  near(polyVolume(polyPillow(size, 0.03, OUT)), 0.5 * 0.15 * 0.45, 0.02 * 0.5 * 0.15 * 0.45, "box-like at low roundness");
});

test("frameBars: 4 mitred bars tile the frame exactly and touch at the mitres", () => {
  const W = 0.5,
    H = 0.7,
    b = 0.04,
    d = 0.02;
  const bars = frameBars(W, H, b, d, faceAttr(5), { p: v(0, 1.5, 0), q: qeuler(0, 0.5, 0) });
  assert.equal(bars.length, 4);
  let vol = 0;
  for (const p of bars) {
    assertValid(p, "bar");
    vol += polyVolume(p);
  }
  near(vol, (W * H - (W - 2 * b) * (H - 2 * b)) * d, 1e-12);
  const [top, bottom, left, right] = bars;
  for (const [a, c] of [
    [top, left],
    [top, right],
    [bottom, left],
    [bottom, right],
  ])
    assert.ok(sharedArea(a, c) > 1e-5, "mitre contact");
  assert.equal(sharedArea(top, bottom), 0);
  // uv runs along each bar (grain)
  const f = top.faces.find((x) => Math.abs(x.n.y) < 0.1 && Math.abs(dot(x.n, v(Math.sin(0.5), 0, Math.cos(0.5)))) > 0.99)!;
  assert.ok(Math.abs(dot(f.attr.uv.u, v(Math.cos(0.5), 0, -Math.sin(0.5)))) > 0.99, "top bar texture along its length");
});

test("slabGrid: tiles, gaps, axis mapping, per-tile uv origin", () => {
  const tiles = slabGrid(v(1.2, 0.6, 0.01), 8, 4, 0.002, faceAttr(6));
  assert.equal(tiles.length, 32);
  let vol = 0;
  const w = (1.2 - 7 * 0.002) / 8,
    h = (0.6 - 3 * 0.002) / 4;
  for (const t of tiles) {
    assertValid(t.poly, "slab tile");
    vol += polyVolume(t.poly);
    const b = polyBounds(t.poly);
    near(b.max.x - b.min.x, w, 1e-12);
    near(b.max.y - b.min.y, h, 1e-12);
    // front face uv starts at 0 at the tile's corner
    const front = t.poly.faces.find((f) => f.n.z > 0.9)!;
    let umin = Infinity;
    for (const i of front.idx) umin = Math.min(umin, dot(t.poly.verts[i], front.attr.uv.u) + front.attr.uv.u0);
    near(umin, 0, 1e-12);
  }
  near(vol, w * h * 0.01 * 32, 1e-12);
  const floor = slabGrid(v(1, 0.01, 2), 2, 4, 0, faceAttr(6));
  const fb = polyBounds(floor[0].poly);
  near(fb.max.x - fb.min.x, 0.5, 1e-12, "thin Y → nx along X");
  near(fb.max.z - fb.min.z, 0.5, 1e-12, "ny along Z");
  const side = slabGrid(v(0.01, 2, 1), 2, 4, 0, faceAttr(6));
  const sb = polyBounds(side[0].poly);
  near(sb.max.z - sb.min.z, 0.5, 1e-12, "thin X → nx along Z");
  near(sb.max.y - sb.min.y, 0.5, 1e-12, "ny along Y");
  // tiles do not overlap: centroids are inside only their own tile
  for (const a of tiles) for (const c of tiles) if (a !== c) assert.ok(polySignedDist(c.poly, polyCentroid(a.poly)) > 0);
});

test("primitives keep explicit uv maps", () => {
  const uvA: FaceAttr = { ...faceAttr(1, 0xffffff, { smooth: 1 }), uv: { u: v(1, 0, 0), v: v(0, 1, 0), u0: 0.25, v0: 0 } };
  const t = latheTiles({ profile: [[0.1, 0], [0.1, 0.1]], thickness: 0.01, segments: 6, outer: uvA, inner: IN, edge: EDGE });
  const f = t[0].poly.faces.find((x) => x.attr.surf === 1)!;
  assert.equal(f.attr.uv.u0, 0.25);
});
