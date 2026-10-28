// Shared helpers for the geometry unit tests (not a test file itself).
import assert from "node:assert/strict";
import type { ConvexPoly } from "../../src/geom/poly.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import type { Vec3 } from "../../src/geom/vec.ts";

export function assertValid(poly: ConvexPoly, label = "poly", opts: Parameters<typeof polyValidate>[1] = {}): void {
  const errs = polyValidate(poly, opts);
  assert.equal(errs.length, 0, `${label} invalid:\n  ${errs.slice(0, 8).join("\n  ")}`);
}

export function near(a: number, b: number, tol: number, msg = ""): void {
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);
}

export function nearVec(a: Vec3, b: Vec3, tol: number, msg = ""): void {
  assert.ok(Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol, `${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

export function finiteGeom(g: RenderGeom): void {
  for (const arr of [g.positions, g.normals, g.uvs]) for (const x of arr) assert.ok(Number.isFinite(x), "non-finite render data");
  assert.equal(g.positions.length, g.vertexCount * 3);
  assert.equal(g.normals.length, g.vertexCount * 3);
  assert.equal(g.uvs.length, g.vertexCount * 2);
  assert.equal(g.surf.length, g.vertexCount);
  assert.equal(g.tint.length, g.vertexCount);
  for (const i of g.indices) assert.ok(i < g.vertexCount, "index out of range");
}

/**
 * Watertightness after welding vertices by exact (float32) position: every undirected edge must
 * be used by exactly two triangles, with opposite directions (consistent orientation).
 */
export function watertight(g: RenderGeom, triCount = g.indices.length / 3): { bad: number; edges: number } {
  const id = new Map<string, number>();
  const vid: number[] = [];
  for (let i = 0; i < g.vertexCount; i++) {
    const k = `${g.positions[3 * i]},${g.positions[3 * i + 1]},${g.positions[3 * i + 2]}`;
    let v = id.get(k);
    if (v === undefined) id.set(k, (v = id.size));
    vid.push(v);
  }
  const dir = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    const a = vid[g.indices[3 * t]],
      b = vid[g.indices[3 * t + 1]],
      c = vid[g.indices[3 * t + 2]];
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = `${u}>${v}`;
      dir.set(k, (dir.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, c] of dir) {
    const [u, v] = k.split(">");
    if (c !== 1 || dir.get(`${v}>${u}`) !== 1) bad++;
  }
  return { bad, edges: dir.size };
}

/** Max over triangles of dot(cross(pb-pa, pc-pa), mean vertex normal) normalised: must be < 0 (Babylon order). */
export function windingAgainstNormals(g: RenderGeom, triCount = g.indices.length / 3): { wrong: number; total: number } {
  let wrong = 0,
    total = 0;
  const P = g.positions,
    N = g.normals;
  for (let t = 0; t < triCount; t++) {
    const a = g.indices[3 * t],
      b = g.indices[3 * t + 1],
      c = g.indices[3 * t + 2];
    const ux = P[3 * b] - P[3 * a],
      uy = P[3 * b + 1] - P[3 * a + 1],
      uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a],
      vy = P[3 * c + 1] - P[3 * a + 1],
      vz = P[3 * c + 2] - P[3 * a + 2];
    const cx = uy * vz - uz * vy,
      cy = uz * vx - ux * vz,
      cz = ux * vy - uy * vx;
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 1e-14) continue;
    const nx = N[3 * a] + N[3 * b] + N[3 * c],
      ny = N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1],
      nz = N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2];
    total++;
    if ((cx * nx + cy * ny + cz * nz) / (cl * (Math.hypot(nx, ny, nz) || 1)) > -0.05) wrong++;
  }
  return { wrong, total };
}

/** Median and minimum of `runs` timings (ms) of fn after `warm` warm-up calls. */
export function bench(fn: () => void, runs = 20, warm = 10): { min: number; median: number } {
  for (let i = 0; i < warm; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return { min: t[0], median: t[Math.floor(t.length / 2)] };
}

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * Performance assertions run on a shared, often heavily loaded machine (~10 agents on 4 CPUs).
 * Timings are printed; the assertion allows target × GEOM_PERF_SLACK (default 4) so concurrent
 * load does not produce false failures. Run with GEOM_PERF_SLACK=1 on an idle machine.
 */
export const PERF_SLACK = Number(process.env.GEOM_PERF_SLACK ?? 4) || 4;

export function assertPerf(label: string, r: { min: number; median: number }, targetMs: number): void {
  console.log(`  ${label}: min ${r.min.toFixed(2)} ms, median ${r.median.toFixed(2)} ms (target < ${targetMs} ms)`);
  assert.ok(r.min < targetMs * PERF_SLACK, `${label}: ${r.min.toFixed(2)} ms ≥ ${targetMs} × slack ${PERF_SLACK}`);
}
