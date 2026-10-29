// Joint sweep helper for the kitchen tests: moves each hinge/slider group's moving island through
// its range in the builder's assembly space and reports penetration with every other part of the
// same assembly (the static body and the other jointed islands in their built pose).
import type { AssemblyDef, BondDef } from "../../src/destruction/model/types.ts";
import { JOINT_KINDS } from "../../src/destruction/model/types.ts";
import { polyTransform, polyVolume } from "../../src/geom/poly.ts";
import { aabbOf, aabbOverlap, polyContact, type Aabb } from "../../src/objects/lib/contact.ts";
import type { ConvexPoly } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { qaxisAngle, qrot, vsub, vscale, vadd, type Vec3, type Xform } from "../../src/geom/vec.ts";

export interface SweepHit {
  group: string;
  at: number; // joint coordinate (deg for hinges, m for sliders)
  moving: string;
  other: string;
  depth: number; // m
}

/** Island id per part (union of every non-joint, non-latch, non-world bond). */
export function islandsOf(def: AssemblyDef): Map<string, number> {
  const idx = new Map(def.parts.map((p, i) => [p.name, i] as const));
  const parent = def.parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const b of def.bonds) {
    if (b.b === "world" || JOINT_KINDS.has(b.kind) || b.kind === "latch") continue;
    const i = idx.get(b.a),
      j = idx.get(b.b);
    if (i === undefined || j === undefined) continue;
    parent[find(i)] = find(j);
  }
  return new Map(def.parts.map((p, i) => [p.name, find(i)] as const));
}

/** Joint groups: first bond of each group (group id = joint.group or a synthetic key). */
export function jointGroups(def: AssemblyDef): Array<{ id: string; bond: BondDef }> {
  const seen = new Map<string, BondDef>();
  def.bonds.forEach((b, k) => {
    if (!JOINT_KINDS.has(b.kind) || !b.joint) return;
    const id = b.joint.group ?? `${b.a}#${k}`;
    if (!seen.has(id)) seen.set(id, b);
  });
  return [...seen].map(([id, bond]) => ({ id, bond }));
}

function moveXf(b: BondDef, s: number): Xform {
  const j = b.joint!;
  if (b.kind === "slider") return { p: vscale(j.axis, s), q: { x: 0, y: 0, z: 0, w: 1 } };
  const q = qaxisAngle(j.axis, s);
  return { p: vsub(j.pivot, qrot(q, j.pivot)), q };
}

/** Moving island's centre of mass at joint coordinate `s` (radians / metres). */
export function movedCom(def: AssemblyDef, group: string, s: number): Vec3 {
  const g = jointGroups(def).find((x) => x.id === group)!;
  const isl = islandsOf(def);
  const id = isl.get(g.bond.a)!;
  const xf = moveXf(g.bond, s);
  let m = 0;
  let c: Vec3 = { x: 0, y: 0, z: 0 };
  for (const p of def.parts) {
    if (isl.get(p.name) !== id) continue;
    const pm = p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
    const v = polyTransform(p.poly, xf).verts;
    let cc: Vec3 = { x: 0, y: 0, z: 0 };
    for (const q of v) cc = vadd(cc, q);
    cc = vscale(cc, 1 / v.length);
    c = vadd(c, vscale(cc, pm));
    m += pm;
  }
  return vscale(c, 1 / m);
}

/**
 * Sweep every joint group through [min, max] in `steps` steps; returns hits deeper than `tol`.
 * Obstacles are every part not moving with the group, in the built (closed) pose — except that
 * when a slider is swept, hinged islands that block its path while closed (the door in front of
 * an oven rack) are opened to `doorOpen` (default: their max) first. Islands jointed to the
 * moving island (nested joints) move with it.
 */
export function sweepJoints(def: AssemblyDef, steps = 24, tol = 0.001, doorOpen?: (group: string, max: number) => number): SweepHit[] {
  const isl = islandsOf(def);
  const out: SweepHit[] = [];
  const groups = jointGroups(def);
  const islandOfGroup = new Map(groups.map((g) => [g.id, isl.get(g.bond.a)!] as const));
  for (const { id, bond } of groups) {
    const j = bond.joint!;
    const mov = isl.get(bond.a)!;
    const movSet = new Set([mov]);
    for (let grow = true; grow; ) {
      grow = false;
      for (const g2 of groups) {
        const a = isl.get(g2.bond.a)!,
          b = isl.get(g2.bond.b);
        if (b !== undefined && movSet.has(b) && !movSet.has(a)) {
          movSet.add(a);
          grow = true;
        }
      }
    }
    const moving = def.parts.filter((p) => movSet.has(isl.get(p.name)!));
    const hitsAt = (others: Array<{ name: string; isl: number; poly: ConvexPoly; box: Aabb }>, s: number, emit: (mp: string, o: (typeof others)[number], depth: number) => void): void => {
      const xf = moveXf(bond, s);
      for (const mp of moving) {
        const poly = polyTransform(mp.poly, xf);
        const box = aabbOf(poly);
        for (const o of others) {
          if (!aabbOverlap(box, o.box, 0)) continue;
          const c = polyContact(poly, o.poly, 0);
          if (c && c.sep < -tol) emit(mp.name, o, -c.sep);
        }
      }
    };
    let others = def.parts.filter((p) => !movSet.has(isl.get(p.name)!)).map((p) => ({ name: p.name, isl: isl.get(p.name)!, poly: p.poly, box: aabbOf(p.poly) }));
    if (bond.kind === "slider") {
      // open the hinged islands in the way
      const hingeIsl = new Map<number, BondDef>();
      for (const g2 of groups) if (g2.bond.kind === "hinge" && !movSet.has(islandOfGroup.get(g2.id)!)) hingeIsl.set(islandOfGroup.get(g2.id)!, g2.bond);
      const block = new Set<number>();
      for (let k = 1; k <= steps; k++) hitsAt(others, j.min + ((j.max - j.min) * k) / steps, (_m, o) => hingeIsl.has(o.isl) && block.add(o.isl));
      if (block.size) {
        others = others.map((o) => {
          const hb = block.has(o.isl) ? hingeIsl.get(o.isl)! : null;
          if (!hb) return o;
          const id2 = groups.find((g2) => g2.bond === hb)!.id;
          const poly = polyTransform(o.poly, moveXf(hb, doorOpen ? doorOpen(id2, hb.joint!.max) : hb.joint!.max));
          return { ...o, poly, box: aabbOf(poly) };
        });
      }
    }
    for (let k = 1; k <= steps; k++) {
      const s = j.min + ((j.max - j.min) * k) / steps;
      hitsAt(others, s, (mp, o, depth) => out.push({ group: id, at: bond.kind === "slider" ? s : (s * 180) / Math.PI, moving: mp, other: o.name, depth }));
    }
  }
  return out;
}
