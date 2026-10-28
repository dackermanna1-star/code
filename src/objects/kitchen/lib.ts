// Kitchen-local helpers (pure; no Babylon): finish palette, cheap thick-walled vessels for
// dishware, "bond to whatever this touches", and frame conversions for built-in runs whose
// layout is defined in world coordinates.
//
// Helper conventions follow kit.ts: helper(b, name, opts, pos?, rot?) builds parts named
// `${name}_*` in a local frame placed at pos/rot (current group frame) and returns FULL names.

import { qconj, qeuler, qrot, vsub, v3, type Quat, type Vec3, type Xform } from "../../geom/vec.ts";
import type { AssemblyDef, BondKind } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { Builder, type BuildInfo, type V3, type Rot } from "../lib/builder.ts";

// ============================================================================ palette

export interface Finish {
  surf: SurfaceName;
  tint: number;
}

/** Default kitchen finishes: sage painted lower fronts, off-white uppers, white marble tops. */
export const KPAL = {
  lowerFront: { surf: "wood_painted", tint: 0x587466 } as Finish,
  upperFront: { surf: "wood_painted", tint: 0xffffff } as Finish,
  carcass: { surf: "laminate_white", tint: 0xffffff } as Finish,
  counter: { surf: "marble", tint: 0xffffff } as Finish,
  /** Brushed brass hardware (steel with a warm tint; there is no brass material). */
  brass: { mat: "steel" as MaterialId, surf: "steel_brushed" as SurfaceName, tint: 0xd9b56c },
  stainless: { surf: "steel_brushed", tint: 0xffffff } as Finish,
  applianceSide: { surf: "metal_painted", tint: 0x8e9194 } as Finish,
  chrome: { surf: "chrome", tint: 0xffffff } as Finish,
  blackPlastic: { surf: "plastic", tint: 0x1d1e20 } as Finish,
  whitePlastic: { surf: "plastic", tint: 0xf1f0ec } as Finish,
} as const;

export type FrontColor = "sage" | "white" | "navy" | "oak";

/** Front finish by name (variants for the cabinet builders). */
export function frontFinish(c: FrontColor | undefined, fallback: Finish): Finish {
  switch (c) {
    case "sage":
      return { surf: "wood_painted", tint: 0x587466 };
    case "white":
      return { surf: "wood_painted", tint: 0xffffff };
    case "navy":
      return { surf: "wood_painted", tint: 0x34405a };
    case "oak":
      return { surf: "wood_oak", tint: 0xffffff };
    default:
      return fallback;
  }
}

// ============================================================================ build

/** Build settings for every kitchen builder (tests switch on full validation + recording). */
export const KBUILD: { validate: "basic" | "full"; record: boolean } = { validate: "basic", record: false };

/** Build info of recently built defs (only while KBUILD.record is on). */
export const BUILD_INFO = new WeakMap<AssemblyDef, BuildInfo>();

/** Validate and return the def (all kitchen builders end with this). */
export function finish(b: Builder): AssemblyDef {
  const def = b.build({ validate: KBUILD.validate });
  if (KBUILD.record) BUILD_INFO.set(def, b.info());
  return def;
}

// ============================================================================ frames

/** Run fn in a named local frame (like kit's internal scoped()). */
export function scoped<T>(b: Builder, name: string, pos: V3, rot: Rot | undefined, fn: () => T): T {
  let out: T | undefined;
  b.group(pos, rot, name ? `${name}_` : "", () => {
    out = fn();
  });
  return out as T;
}

/** World placement of an object: base point + yaw (radians) about +Y. */
export function yawXf(x: number, y: number, z: number, yaw: number): Xform {
  return { p: v3(x, y, z), q: qeuler(0, yaw, 0) };
}

/**
 * Converts world-space layout coordinates into the local frame of an object that will be placed
 * with `xf` (inverse rigid transform). Used by built-in runs whose layout comes from the plan.
 */
export class LocalFrame {
  readonly xf: Xform;
  private readonly qi: Quat;
  constructor(xf: Xform) {
    this.xf = xf;
    this.qi = qconj(xf.q);
  }
  /** World point → local point. */
  p(wx: number, wy: number, wz: number): [number, number, number] {
    const l = qrot(this.qi, vsub(v3(wx, wy, wz), this.xf.p));
    return [l.x, l.y, l.z];
  }
  /** World direction → local direction. */
  d(wx: number, wy: number, wz: number): [number, number, number] {
    const l = qrot(this.qi, v3(wx, wy, wz));
    return [l.x, l.y, l.z];
  }
  /** Local centre + size of a world-axis-aligned box given by its world extents (yaw must be a multiple of 90°). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): { pos: V3; size: V3 } {
    const c = this.p((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const ax = this.d(1, 0, 0);
    const sx = Math.abs(x1 - x0),
      sy = Math.abs(y1 - y0),
      sz = Math.abs(z1 - z0);
    // world x maps onto local x or z depending on the yaw
    const size: V3 = Math.abs(ax[0]) > 0.5 ? [sx, sy, sz] : [sz, sy, sx];
    return { pos: c, size };
  }
}

// ============================================================================ bonding

/**
 * Bond `part` to every candidate it touches (face contact, line contact ≥ 4 mm or
 * interpenetration within `tol`), splitting `total` strength between the joints. Returns the
 * number of bonds. Warns when fewer than `minCount` candidates touch.
 */
export function bondTouching(b: Builder, part: string, candidates: string[], kind: BondKind, total: number, tol = 0.0015, minCount = 1): number {
  const me = b.resolve(part);
  const hits: string[] = [];
  for (const c of candidates) {
    const other = b.resolve(c);
    if (other === me) continue;
    const ct = b.contact(me, other, tol);
    if (ct && (ct.kind === "face" || ct.penetrating || ct.length > 0.004)) hits.push(other);
  }
  if (hits.length < minCount) {
    b.warn(`bondTouching: '${me}' touches ${hits.length} of the expected parts`);
    return hits.length;
  }
  const each = total / Math.max(1, hits.length);
  for (const h of hits) b.bond(me, h, kind, { strength: Math.max(1, each) });
  return hits.length;
}

/** Like bondTouching but with a fixed strength per joint (glue lines, welds). */
export function bondEachTouching(b: Builder, part: string, candidates: string[], kind: BondKind, each: number, tol = 0.0015): number {
  const me = b.resolve(part);
  let n = 0;
  for (const c of candidates) {
    const other = b.resolve(c);
    if (other === me) continue;
    const ct = b.contact(me, other, tol);
    if (ct && (ct.kind === "face" || ct.penetrating || ct.length > 0.004)) {
      b.bond(me, other, kind, { strength: each });
      n++;
    }
  }
  return n;
}

// ============================================================================ vessels

export interface ShellOpts {
  /**
   * Outer wall profile [radius, y] from the bottom edge (y = 0) to the rim. The base disc spans
   * r ≤ profile[0][0]; the wall starts on the disc so its inner surface meets the disc top.
   */
  profile: Array<[number, number]>;
  /** Wall thickness (m). */
  t: number;
  /** Base disc thickness (m), from y = 0. */
  base: number;
  segments: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  innerSurf?: SurfaceName;
  edgeSurf?: SurfaceName;
  /** Surface of the base disc (default surf). */
  baseSurf?: SurfaceName;
  tint?: number;
  innerTint?: number;
  /** Mass override of the base disc (a hollow foot ring / recessed base). */
  baseKg?: number;
  /** Total mass of the wall tiles (default: material density). */
  wallKg?: number;
  /** Seam bond kind between wall tiles (default fused). */
  seam?: BondKind;
  seamStrength?: number;
}

/**
 * Thick-walled vessel of revolution as ONE base disc + an open lathe wall (segments tiles): half
 * the parts of a capped lathe, and the flat disc gives stacked dishes a stable seat. The wall's
 * first station is raised so its inner bottom edge lands exactly on the disc top (no gap, only a
 * sliver of overlap at the outer edge). Sits on y = 0. Returns the disc, the wall tiles and all.
 */
export function shell(b: Builder, name: string, o: ShellOpts, pos: V3 = [0, 0, 0], rot?: Rot): { base: string; wall: string[]; all: string[] } {
  if (o.profile.length < 2) throw new Error(`shell '${name}': profile needs >= 2 points`);
  const mat = o.mat ?? "ceramic";
  const glass = mat === "glass" || mat === "temperedGlass";
  const surf = o.surf ?? (glass ? "glass" : "ceramic_glaze");
  const r0 = o.profile[0][0];
  // wall start height: inner bottom corner (outer corner − n·t) at the disc top
  let yw = o.base;
  for (let it = 0; it < 4; it++) {
    const [r1, y1] = o.profile[1];
    const dr = r1 - r0,
      dy = y1 - yw;
    const l = Math.hypot(dr, dy) || 1;
    const ny = -dr / l; // outward normal y component
    yw = Math.max(0, o.base + ny * o.t);
  }
  const prof: Array<[number, number]> = [[r0, yw], ...o.profile.slice(1)];
  return scoped(b, name, pos, rot, () => {
    const base = b.cyl("base", mat, o.baseSurf ?? surf, r0, o.base, [0, o.base / 2, 0], {
      segments: o.segments,
      tint: o.tint,
      capSurf: o.baseSurf ?? surf,
      mass: o.baseKg,
    });
    const wall = b.lathe("wall", mat, surf, o.innerSurf ?? surf, {
      profile: prof,
      thickness: o.t,
      segments: o.segments,
      capBottom: false,
      tint: o.tint,
      innerTint: o.innerTint,
      edgeSurf: o.edgeSurf ?? (glass ? "glass_edge" : surf),
      mass: o.wallKg,
      seam: o.seam,
      seamStrength: o.seamStrength,
    });
    // fuse the bottom ring of tiles to the disc
    let joined = 0;
    for (const tile of wall) {
      const c = b.contact(base, tile, 0.0015);
      if (c && (c.penetrating || c.kind === "face" || c.length > 0.003)) {
        b.bond(base, tile, o.seam ?? "fused", { strength: o.seamStrength });
        joined++;
      }
    }
    if (joined < Math.min(3, wall.length)) b.warn(`shell '${name}': only ${joined} wall tiles meet the base`);
    return { base, wall, all: [base, ...wall] };
  });
}

/** Top of a part (max y of its hull) in assembly space. */
export function topOf(b: Builder, part: string): number {
  let y = -Infinity;
  for (const v of b.get(part).poly.verts) y = Math.max(y, v.y);
  return y;
}

/** Centre of a part's hull vertices (assembly space) — a safe anchor inside the part. */
export function centerOf(b: Builder, part: string): [number, number, number] {
  const vs = b.get(part).poly.verts;
  let x = 0,
    y = 0,
    z = 0;
  for (const v of vs) {
    x += v.x;
    y += v.y;
    z += v.z;
  }
  const n = Math.max(1, vs.length);
  return [x / n, y / n, z / n];
}

/** Convenience: [x, y, z] tuple from a Vec3. */
export function tup(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z];
}
