// Shared helpers for the damage-model unit tests: realistic parts built from geom primitives and
// the energy pipeline the runtime uses for strikes and collisions (src/destruction/runtime/impacts.ts).

import { polyBox, polyCylinder, polyExtents, polyVolume, polyCentroid, faceAttr, type ConvexPoly } from "../../src/geom/poly.ts";
import { latheTiles } from "../../src/geom/primitives.ts";
import type { Vec3 } from "../../src/geom/vec.ts";
import { MATERIALS, type MaterialId } from "../../src/destruction/model/materials.ts";
import { impactEnergy, respond, type BondState, type ImpactOnPart, type PartOutcome, type PartState } from "../../src/destruction/model/damage.ts";
import { Rng } from "../../src/core/rng.ts";
import type { BondKind } from "../../src/destruction/model/types.ts";

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const A = faceAttr(1);

let nextId = 1000;

export function makePart(mat: MaterialId, poly: ConvexPoly, o: { id?: number; mass?: number; supported?: boolean; grain?: Vec3; strength?: number; bonds?: BondState[] } = {}): PartState {
  const volume = polyVolume(poly);
  const m = MATERIALS[mat];
  return {
    id: o.id ?? nextId++,
    mat: m,
    poly,
    volume,
    mass: o.mass ?? volume * m.density,
    centroid: polyCentroid(poly),
    ext: polyExtents(poly).ext,
    grain: o.grain,
    supported: !!o.supported,
    strength: o.strength ?? 1,
    dmg: [],
    dents: [],
    cracks: [],
    gen: 0,
    bonds: o.bonds ?? [],
  };
}

export function box(sx: number, sy: number, sz: number, c: Vec3 = v(0, 0, 0)): ConvexPoly {
  return polyBox(v(sx, sy, sz), A, { p: c, q: { x: 0, y: 0, z: 0, w: 1 } });
}

export function cylinder(r: number, h: number): ConvexPoly {
  return polyCylinder(r, r, h, 16, A, A);
}

/** Mug wall tiles exactly as the builder makes them (12 × 3 lathe, 5 mm ceramic wall). */
export function mugTiles(): ConvexPoly[] {
  return latheTiles({
    profile: [
      [0.041, 0],
      [0.041, 0.0317],
      [0.041, 0.0633],
      [0.041, 0.095],
    ],
    thickness: 0.005,
    segments: 12,
    capBottom: true,
    outer: faceAttr(1, 0xffffff, { smooth: 1 }),
    inner: faceAttr(1, 0xffffff, { smooth: 2 }),
    edge: A,
  }).map((t) => t.poly);
}

export function bond(id: number, kind: BondKind, anchor: Vec3, max: number, world = false, farMass = 5): BondState {
  return { id, kind, anchor, health: max, max, farMass, world };
}

/** Energy delivered to a static target by a striker with kinetic energy KE (runtime strike path). */
export function strikeEnergy(KE: number, strikerMass: number, striker: MaterialId, target: MaterialId, targetMass = Infinity): { E: number; J: number } {
  const sm = MATERIALS[striker],
    tm = MATERIALS[target];
  const speed = Math.sqrt((2 * KE) / strikerMass);
  const mu = Number.isFinite(targetMass) ? (strikerMass * targetMass) / (strikerMass + targetMass) : strikerMass;
  const e = Math.min(0.8, Math.sqrt(sm.restitution * tm.restitution));
  const J = (1 + e) * mu * speed;
  const ie = impactEnergy(J, strikerMass, targetMass, sm, tm);
  return { E: ie.E * (1 - ie.shareA), J };
}

/** Energy delivered to a falling body (mass m, speed v, material) landing on a static floor material. */
export function dropEnergy(m: number, speed: number, mat: MaterialId, floor: MaterialId): number {
  const J = m * speed;
  const ie = impactEnergy(J, m, Infinity, MATERIALS[mat], MATERIALS[floor]);
  return ie.E * ie.shareA;
}

export function hit(part: PartState, point: Vec3, dir: Vec3, energy: number, o: { contact?: number; sharp?: number; seed?: number; islandMass?: number; strike?: boolean } = {}): PartOutcome {
  const imp: ImpactOnPart = {
    point,
    dir,
    energy,
    impulse: 10,
    islandMass: o.islandMass ?? Infinity,
    contactRadius: o.contact ?? 0,
    sharpness: o.sharp ?? 1,
    strike: o.strike ?? true,
  };
  return respond(part, imp, new Rng(o.seed ?? 12345));
}

/** Apply an outcome's persistent state (dmg/dents/cracks) to the part, like the runtime does. */
export function applyOutcome(part: PartState, out: PartOutcome): void {
  part.dmg = out.dmg;
  part.dents.push(...out.addDents);
  part.cracks.push(...out.addCracks);
  const byId = new Map(out.bondDamage.map((b) => [b.bondId, b.amount] as const));
  for (const b of part.bonds) b.health = Math.max(0, b.health - (byId.get(b.id) ?? 0));
}

/** Turn a planned remain cell into a new part (fragments inherit nearby damage like the runtime). */
export function cellPart(parent: PartState, cell: { poly: ConvexPoly; volume: number }, id: number): PartState {
  const p = makePart(parent.mat.id, cell.poly, { id, supported: parent.supported, grain: parent.grain, mass: cell.volume * (parent.mass / parent.volume) });
  p.dmg = parent.dmg.map((d) => ({ p: { ...d.p }, e: d.e }));
  return p;
}
