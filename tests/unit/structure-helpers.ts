// Shared helpers for the structure unit tests: world-space AABBs, SAT overlap depth between
// convex parts, ray casts against convex parts, point containment. PURE (Node).

import { JOINT_KINDS, type AssemblyDef, type BondDef, type PartDef } from "../../src/destruction/model/types.ts";
import type { ConvexPoly } from "../../src/geom/poly.ts";

export interface PartRef {
  asm: AssemblyDef;
  part: PartDef;
  min: [number, number, number];
  max: [number, number, number];
}

export function bounds(poly: ConvexPoly): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of poly.verts) {
    min[0] = Math.min(min[0], v.x);
    min[1] = Math.min(min[1], v.y);
    min[2] = Math.min(min[2], v.z);
    max[0] = Math.max(max[0], v.x);
    max[1] = Math.max(max[1], v.y);
    max[2] = Math.max(max[2], v.z);
  }
  return { min, max };
}

export function allParts(defs: AssemblyDef[]): PartRef[] {
  const out: PartRef[] = [];
  for (const asm of defs) for (const part of asm.parts) out.push({ asm, part, ...bounds(part.poly) });
  return out;
}

/** Penetration depth estimate between two convex polys via SAT over both polys' face normals. */
export function satDepth(a: ConvexPoly, b: ConvexPoly): number {
  let best = Infinity;
  const axes = [...a.faces.map((f) => f.n), ...b.faces.map((f) => f.n)];
  for (const n of axes) {
    let a0 = Infinity,
      a1 = -Infinity,
      b0 = Infinity,
      b1 = -Infinity;
    for (const v of a.verts) {
      const d = v.x * n.x + v.y * n.y + v.z * n.z;
      if (d < a0) a0 = d;
      if (d > a1) a1 = d;
    }
    for (const v of b.verts) {
      const d = v.x * n.x + v.y * n.y + v.z * n.z;
      if (d < b0) b0 = d;
      if (d > b1) b1 = d;
    }
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o < best) best = o;
    if (best <= 0) return best;
  }
  return best;
}

/** Pairs of parts (possibly from different assemblies) overlapping deeper than `tol`. */
export function overlaps(parts: PartRef[], tol: number, filter?: (a: PartRef, b: PartRef) => boolean): Array<{ a: PartRef; b: PartRef; depth: number }> {
  const cell = 0.5;
  const grid = new Map<string, number[]>();
  parts.forEach((p, i) => {
    for (let x = Math.floor(p.min[0] / cell); x <= Math.floor(p.max[0] / cell); x++)
      for (let y = Math.floor(p.min[1] / cell); y <= Math.floor(p.max[1] / cell); y++)
        for (let z = Math.floor(p.min[2] / cell); z <= Math.floor(p.max[2] / cell); z++) {
          const k = `${x},${y},${z}`;
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push(i);
        }
  });
  const seen = new Set<string>();
  const out: Array<{ a: PartRef; b: PartRef; depth: number }> = [];
  for (const l of grid.values()) {
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const ia = Math.min(l[i], l[j]),
          ib = Math.max(l[i], l[j]);
        const key = `${ia},${ib}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const A = parts[ia],
          B = parts[ib];
        if (A.part.noCollide || B.part.noCollide) continue;
        let sep = false;
        for (let k = 0; k < 3; k++) if (Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]) <= tol) sep = true;
        if (sep) continue;
        if (filter && !filter(A, B)) continue;
        const d = satDepth(A.part.poly, B.part.poly);
        if (d > tol) out.push({ a: A, b: B, depth: d });
      }
    }
  }
  return out;
}

/** Ray vs convex poly: entry distance in [0, tMax] or null. */
export function rayHit(poly: ConvexPoly, o: [number, number, number], d: [number, number, number], tMax: number): number | null {
  let t0 = 0,
    t1 = tMax;
  for (const f of poly.faces) {
    const dn = d[0] * f.n.x + d[1] * f.n.y + d[2] * f.n.z;
    const on = o[0] * f.n.x + o[1] * f.n.y + o[2] * f.n.z;
    const dist = f.d - on;
    if (Math.abs(dn) < 1e-12) {
      if (dist < 0) return null;
      continue;
    }
    const t = dist / dn;
    if (dn < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0;
}

export function inside(poly: ConvexPoly, p: [number, number, number], eps = 0): boolean {
  for (const f of poly.faces) if (p[0] * f.n.x + p[1] * f.n.y + p[2] * f.n.z - f.d > eps) return false;
  return true;
}

/** Uniform XZ grid over part AABBs for fast ray queries. */
export class PartGrid {
  readonly parts: PartRef[];
  private cell: number;
  private map = new Map<string, number[]>();

  constructor(parts: PartRef[], cell = 0.25) {
    this.parts = parts;
    this.cell = cell;
    parts.forEach((p, i) => {
      for (let x = Math.floor(p.min[0] / cell); x <= Math.floor(p.max[0] / cell); x++)
        for (let z = Math.floor(p.min[2] / cell); z <= Math.floor(p.max[2] / cell); z++) {
          const k = `${x},${z}`;
          let l = this.map.get(k);
          if (!l) this.map.set(k, (l = []));
          l.push(i);
        }
    });
  }

  /** All hits along a ray within [0, tMax], sorted by distance. */
  hits(o: [number, number, number], d: [number, number, number], tMax: number): Array<{ t: number; ref: PartRef }> {
    const e = [o[0] + d[0] * tMax, o[2] + d[2] * tMax];
    const x0 = Math.floor(Math.min(o[0], e[0]) / this.cell),
      x1 = Math.floor(Math.max(o[0], e[0]) / this.cell);
    const z0 = Math.floor(Math.min(o[2], e[1]) / this.cell),
      z1 = Math.floor(Math.max(o[2], e[1]) / this.cell);
    const seen = new Set<number>();
    const out: Array<{ t: number; ref: PartRef }> = [];
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const i of this.map.get(`${x},${z}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const ref = this.parts[i];
          if (ref.part.noCollide) continue;
          const t = rayHit(ref.part.poly, o, d, tMax);
          if (t !== null) out.push({ t, ref });
        }
    return out.sort((a, b) => a.t - b.t);
  }
}

/** Rigid islands of an assembly (union of non-joint, non-world bonds): part name → island root. */
export function rigidIslands(d: AssemblyDef): Map<string, number> {
  const idx = new Map(d.parts.map((p, i) => [p.name, i]));
  const parent = d.parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const b of d.bonds) {
    if (b.b === "world" || JOINT_KINDS.has(b.kind) || b.kind === "latch") continue;
    parent[find(idx.get(b.a)!)] = find(idx.get(b.b)!);
  }
  return new Map(d.parts.map((p, i) => [p.name, find(i)]));
}

/**
 * A moving unit hung on a joint group (door leaf, casement sash, sliding panel): the group's
 * joint bonds, its latch, the parts of the moving island and of the fixed island.
 */
export interface JointUnit {
  asm: AssemblyDef;
  group: string;
  joints: BondDef[];
  latch: BondDef | undefined;
  moving: PartDef[];
  fixed: PartDef[];
  /** `opening:<id>` tag of the moving parts (doors/windows), if any. */
  opening: string | undefined;
}

export function jointUnits(defs: AssemblyDef[]): JointUnit[] {
  const out: JointUnit[] = [];
  for (const asm of defs) {
    const groups = new Map<string, BondDef[]>();
    for (const b of asm.bonds) if (JOINT_KINDS.has(b.kind)) (groups.get(b.joint!.group!) ?? groups.set(b.joint!.group!, []).get(b.joint!.group!)!).push(b);
    if (!groups.size) continue;
    const isl = rigidIslands(asm);
    for (const [group, joints] of groups) {
      const mi = isl.get(joints[0].a)!,
        fi = joints[0].b === "world" ? -1 : isl.get(joints[0].b)!;
      const moving = asm.parts.filter((p) => isl.get(p.name) === mi);
      const tag = moving.flatMap((p) => p.tags ?? []).find((t) => t.startsWith("opening:"));
      out.push({
        asm,
        group,
        joints,
        latch: asm.bonds.find((b) => b.kind === "latch" && b.joint?.group === group),
        moving,
        fixed: asm.parts.filter((p) => isl.get(p.name) === fi),
        opening: tag?.slice(8),
      });
    }
  }
  return out;
}
