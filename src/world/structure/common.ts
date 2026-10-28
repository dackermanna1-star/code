// Shared helpers for the structure builders: boxes from local ranges, bonds with explicit
// anchors, a local-box index for overlap queries (which sheet is screwed to which stud), seeds,
// palette. PURE (no Babylon).

import { Builder, type PartOpts, type FaceKey, type SurfSpec } from "../../objects/lib/builder.ts";
import type { BondKind } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { seedFrom } from "../../core/rng.ts";
import type { Interval } from "./rects.ts";

export type { Interval };
export type V3 = [number, number, number];

/** Colours (0xRRGGBB tints). */
export const PAL = {
  ceiling: 0xf6f6f2,
  trimWhite: 0xf3f1ea,
  doorWhite: 0xf4f2ec,
  plasticWhite: 0xf1efe9,
  boxBlue: 0x2f62a8,
  cable: 0xe9e7e0,
  pvc: 0xeceeee,
  underlay: 0x7f9fb6,
  carpetPad: 0x9a7d5c,
  carpet: 0x8f877b,
  porcelain: 0xd9d3c9,
  frameCharcoal: 0x30343a,
  galvanised: 0xd0d3d6,
} as const;

/** Deterministic builder seed from an assembly name. */
export function seedOf(name: string): number {
  const codes: number[] = [];
  for (let i = 0; i < name.length; i++) codes.push(name.charCodeAt(i));
  return seedFrom(name.length, ...codes);
}

export function newBuilder(type: string, name: string, category: "structure" | "fixture", value: number): Builder {
  return new Builder(type, name, category, value, seedOf(type + ":" + name));
}

/** Axis-aligned box in the CURRENT builder frame given by coordinate ranges. */
export function boxR(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, u: Interval, y: Interval, w: Interval, o: PartOpts = {}): string {
  const su = u[1] - u[0],
    sy = y[1] - y[0],
    sw = w[1] - w[0];
  if (!(su > 1e-5 && sy > 1e-5 && sw > 1e-5)) throw new Error(`structure: degenerate box '${name}' ${su}×${sy}×${sw}`);
  return b.box(name, mat, surf, [su, sy, sw], [(u[0] + u[1]) / 2, (y[0] + y[1]) / 2, (w[0] + w[1]) / 2], o);
}

/** Face overrides for a sheet whose room face is +w (side=1) or -w (side=-1). */
export function sheetFaces(side: number, roomSurf: SurfaceName, roomTint: number, backSurf: SurfaceName = "drywall_paper"): Partial<Record<FaceKey, SurfSpec>> {
  const front: FaceKey = side > 0 ? "pz" : "nz";
  const back: FaceKey = side > 0 ? "nz" : "pz";
  return { [front]: { surf: roomSurf, tint: roomTint }, [back]: { surf: backSurf } };
}

/** Face override for only the room-facing (±w) face. */
export function frontFace(side: number, surf: SurfaceName, tint = 0xffffff): Partial<Record<FaceKey, SurfSpec>> {
  return { [side > 0 ? "pz" : "nz"]: { surf, tint } };
}

export function bondAt(b: Builder, a: string, c: string, kind: BondKind, strength: number, at: V3): void {
  b.bond(a, c, kind, { strength: Math.max(0.5, strength), anchor: at });
}

export function worldAt(b: Builder, a: string, kind: BondKind, strength: number, at: V3): void {
  b.world(a, kind, Math.max(0.5, strength), at);
}

/**
 * Accumulates several fasteners of one kind on one part (pins every 0.6 m, hangers, shim nails)
 * into ONE bond with the summed strength anchored at the fasteners' centroid (the builder flags
 * duplicate same-kind bonds per pair). Call flush() inside the same builder frame.
 */
export class Fixings {
  private m = new Map<string, { a: string; b: string; kind: BondKind; s: number; x: number; y: number; z: number; n: number }>();

  add(a: string, b: string, kind: BondKind, strength: number, at: V3): void {
    const key = `${a}|${b}|${kind}`;
    const e = this.m.get(key) ?? { a, b, kind, s: 0, x: 0, y: 0, z: 0, n: 0 };
    e.s += strength;
    e.x += at[0];
    e.y += at[1];
    e.z += at[2];
    e.n++;
    this.m.set(key, e);
  }

  world(a: string, kind: BondKind, strength: number, at: V3): void {
    this.add(a, "world", kind, strength, at);
  }

  flush(bld: Builder): void {
    for (const e of this.m.values()) {
      const at: V3 = [e.x / e.n, e.y / e.n, e.z / e.n];
      if (e.b === "world") bld.world(e.a, e.kind, Math.max(0.5, e.s), at);
      else bld.bond(e.a, e.b, e.kind, { strength: Math.max(0.5, e.s), anchor: at });
    }
    this.m.clear();
  }
}

/** A box placed in a local frame, remembered for overlap queries. */
export interface LBox {
  name: string;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  w0: number;
  w1: number;
  /** Free-form role, e.g. "stud", "plate", "sheet", "cell". */
  role: string;
}

export class BoxIndex {
  readonly items: LBox[] = [];

  add(b: LBox): LBox {
    this.items.push(b);
    return b;
  }

  byRole(...roles: string[]): LBox[] {
    return this.items.filter((i) => roles.includes(i.role));
  }

  /** Items of the given roles overlapping the u/y rectangle by more than `min` in both axes. */
  overlapping(u0: number, u1: number, y0: number, y1: number, roles: string[], min = 0.004): Array<{ box: LBox; ou: Interval; oy: Interval }> {
    const out: Array<{ box: LBox; ou: Interval; oy: Interval }> = [];
    for (const it of this.items) {
      if (!roles.includes(it.role)) continue;
      const a = Math.max(u0, it.u0),
        bb = Math.min(u1, it.u1),
        c = Math.max(y0, it.y0),
        d = Math.min(y1, it.y1);
      if (bb - a > min && d - c > min) out.push({ box: it, ou: [a, bb], oy: [c, d] });
    }
    return out;
  }

  /** True when a 3D box intersects any item (optionally of given roles) by more than `tol`. */
  collides(u0: number, u1: number, y0: number, y1: number, w0: number, w1: number, roles?: string[], tol = 0.0005): boolean {
    for (const it of this.items) {
      if (roles && !roles.includes(it.role)) continue;
      if (Math.min(u1, it.u1) - Math.max(u0, it.u0) > tol && Math.min(y1, it.y1) - Math.max(y0, it.y0) > tol && Math.min(w1, it.w1) - Math.max(w0, it.w0) > tol) return true;
    }
    return false;
  }
}

/** Simple per-assembly name counter. */
export class Namer {
  private n = new Map<string, number>();
  next(prefix: string): string {
    const k = (this.n.get(prefix) ?? 0) + 1;
    this.n.set(prefix, k);
    return `${prefix}${k}`;
  }
}

export const mid = (a: number, b: number): number => (a + b) / 2;

/** Screw count for a fastened length with a given spacing (≥ 1). */
export const fasteners = (len: number, spacing: number): number => Math.max(1, Math.round(len / spacing));
