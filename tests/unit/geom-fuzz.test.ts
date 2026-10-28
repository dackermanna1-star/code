// Randomised robustness tests: repeated fracture generations, extreme scales and aspect ratios,
// degenerate seed placements, and meshing of every fragment (valid, conserved, watertight, finite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { faceAttr, polyBox, polyCylinder, polyFromHull, polyClip, polyTransform, polyVolume, polyCentroid, polyExtents, type ConvexPoly } from "../../src/geom/poly.ts";
import { voronoiFracture, generateSeeds, type SeedPattern } from "../../src/geom/fracture.ts";
import { polyToRenderGeom } from "../../src/geom/meshgen.ts";
import { latheTiles } from "../../src/geom/primitives.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { watertight, finiteGeom, near, v } from "./geom-helpers.ts";

const A = faceAttr(1);
const INT = faceAttr(9, 0xffffff, { interior: true });
const PATTERNS: SeedPattern[] = ["radial", "dice", "chunks", "splinter", "crumble", "crack"];

function valid(p: ConvexPoly, label: string): void {
  const e = polyValidate(p);
  assert.equal(e.length, 0, `${label}: ${e.slice(0, 5).join("; ")}`);
}

test("fuzz: three fracture generations stay valid, conserve volume and mesh watertight", () => {
  const rng = new Rng(2024);
  const starts: ConvexPoly[] = [
    polyBox(v(0.8, 0.02, 0.5), A, { p: v(1, 0.7, 2), q: qaxisAngle(v(0.3, 1, 0.2), 0.7) }),
    polyCylinder(0.08, 0.06, 0.25, 14, faceAttr(2, 0xffffff, { smooth: 1 }), A),
    polyFromHull(Array.from({ length: 30 }, () => rng.onSphere()).map((p) => v(p.x * 0.1, p.y * 0.3, p.z * 0.05)), A),
    latheTiles({ profile: [[0.05, 0], [0.09, 0.04], [0.1, 0.09]], thickness: 0.006, segments: 10, outer: faceAttr(2, 0xffffff, { smooth: 1 }), inner: faceAttr(3, 0xffffff, { smooth: 2 }), edge: A })[3].poly,
  ];
  let fragments = 0;
  for (const start of starts) {
    let gen: ConvexPoly[] = [start];
    for (let g = 0; g < 3; g++) {
      const next: ConvexPoly[] = [];
      for (const part of gen.slice(0, 3)) {
        const V = polyVolume(part);
        const { ext } = polyExtents(part);
        const c = polyCentroid(part);
        const pattern = PATTERNS[rng.int(0, PATTERNS.length - 1)];
        const seeds = generateSeeds(part, {
          pattern,
          impact: part.verts[rng.int(0, part.verts.length - 1)],
          dir: v(c.x - part.verts[0].x, c.y - part.verts[0].y, c.z - part.verts[0].z),
          radius: ext[0] * rng.range(0.1, 0.6),
          count: rng.int(3, 18),
          cell: ext[0] / 5,
          grain: v(1, 0, 0),
          rng,
        });
        for (const s of seeds) assert.ok(Number.isFinite(s.x + s.y + s.z));
        const cells = voronoiFracture(part, seeds, {
          interiorAttr: INT,
          anisotropy: pattern === "splinter" ? { axis: v(1, 0, 0), factor: 4 } : undefined,
          minVolume: 0,
        });
        let sum = 0;
        for (const cell of cells) {
          valid(cell.poly, `gen ${g} ${pattern}`);
          sum += cell.volume;
          const geom = polyToRenderGeom(cell.poly, {
            tessCell: rng.chance(0.5) ? ext[0] / 6 : 0,
            dents: rng.chance(0.5) ? [{ p: cell.centroid, dir: v(0, -1, 0), r: ext[0] * 0.3, depth: ext[2] * 0.2 }] : undefined,
          });
          finiteGeom(geom);
          assert.equal(watertight(geom).bad, 0, `gen ${g} ${pattern}: fragment mesh not watertight`);
          next.push(cell.poly);
          fragments++;
        }
        near(sum, V, 1e-6 * V, `gen ${g} ${pattern}: volume conserved`);
      }
      gen = next.sort((a, b) => polyVolume(b) - polyVolume(a));
    }
  }
  assert.ok(fragments > 50, `fragments: ${fragments}`);
});

test("fuzz: extreme scales and aspect ratios (5 m slab cell … 2 mm button)", () => {
  const rng = new Rng(77);
  const parts: ConvexPoly[] = [
    polyBox(v(5, 0.2, 2.4), A), // concrete wall section
    polyBox(v(2.4, 1.2, 0.0125), A), // drywall sheet
    polyBox(v(0.002, 0.002, 0.0005), A), // button / LED
    polyBox(v(2.4, 0.038, 0.089), A), // stud
  ];
  for (const p of parts) {
    const V = polyVolume(p);
    const { ext } = polyExtents(p);
    for (const pattern of PATTERNS) {
      const seeds = generateSeeds(p, { pattern, impact: polyCentroid(p), dir: v(0, 0, -1), radius: ext[1] * 0.4, count: 20, cell: ext[1] / 4, rng });
      const cells = voronoiFracture(p, seeds, { interiorAttr: INT, minVolume: 0 });
      let sum = 0;
      for (const c of cells) {
        valid(c.poly, `${ext[0]} ${pattern}`);
        sum += c.volume;
      }
      near(sum, V, 1e-6 * V, `scale ${ext[0]} ${pattern}`);
    }
  }
});

test("fuzz: seeds exactly at vertices, edge midpoints and face centres", () => {
  const box = polyBox(v(0.4, 0.3, 0.2), A);
  const seeds = [...box.verts];
  for (const f of box.faces) {
    const c = f.idx.reduce((s, i) => v(s.x + box.verts[i].x / f.idx.length, s.y + box.verts[i].y / f.idx.length, s.z + box.verts[i].z / f.idx.length), v(0, 0, 0));
    seeds.push(c);
    for (let k = 0; k < f.idx.length; k++) {
      const a = box.verts[f.idx[k]],
        b = box.verts[f.idx[(k + 1) % f.idx.length]];
      seeds.push(v((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
    }
  }
  const cells = voronoiFracture(box, seeds, { interiorAttr: INT, minVolume: 0 });
  let sum = 0;
  for (const c of cells) {
    valid(c.poly, "boundary seeds");
    sum += c.volume;
  }
  near(sum, polyVolume(box), 1e-9);
  // 8 corners + 6 face centres + 12 distinct edge midpoints (each listed twice)
  assert.equal(cells.length, 26);
});

test("fuzz: long random clip chains on random hulls", () => {
  const rng = new Rng(4242);
  for (let trial = 0; trial < 15; trial++) {
    let p: ConvexPoly | null = polyTransform(
      polyFromHull(Array.from({ length: rng.int(8, 80) }, () => rng.inSphere()).map((q) => v(q.x * rng.range(0.01, 2), q.y, q.z * 0.3)), A),
      { p: v(rng.range(-50, 50), rng.range(-5, 5), rng.range(-50, 50)), q: qaxisAngle(rng.onSphere(), rng.range(0, 6)) },
    );
    for (let k = 0; k < 30 && p && p.faces.length; k++) {
      const c = polyCentroid(p);
      const n = rng.onSphere();
      const { ext } = polyExtents(p);
      const d = n.x * c.x + n.y * c.y + n.z * c.z + rng.range(-0.3, 0.3) * ext[0];
      const q = polyClip(p, v(n.x, n.y, n.z), d, INT);
      if (q && q !== p) valid(q, `trial ${trial} clip ${k}`);
      if (q) p = q;
    }
  }
});
