// Shared helpers for the living/dining room builders (pure; no Babylon).
//
// Small sub-assemblies that several living-room objects share and that the common kit does not
// provide: fabric lamp shades with a wire spider, lamp harps, "bond to whatever this touches",
// leaf/foliage parts for house plants and a few finish palettes. Helper conventions follow
// kit.ts: helper(b, name, opts, pos?) builds parts named `${name}_*` in a local frame and returns
// FULL part names.

import { Builder, type V3, type Rot } from "../lib/builder.ts";
import type { BondKind } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

/** Seam strength (J) for stitched/laminated soft tiles (fabric/paper have no fused toughness). */
export const SOFT_SEAM = 35;

/** Brass look (no brass material: steel with a warm tint on the brushed surface). */
export const BRASS = { mat: "steel" as MaterialId, surf: "steel_brushed" as SurfaceName, tint: 0xd8b46a };

/** Run fn in a named local frame (like kit's internal scoped()). */
export function scoped<T>(b: Builder, name: string, pos: V3, rot: Rot | undefined, fn: () => T): T {
  let out: T | undefined;
  b.group(pos, rot, name ? `${name}_` : "", () => {
    out = fn();
  });
  return out as T;
}

/**
 * Bond `part` to every candidate it touches (face contact or interpenetration within `tol`),
 * splitting `total` strength between the joints. Returns the number of bonds made. Warns when
 * nothing touches (an unattached part would fall off the object).
 */
export function bondTouching(b: Builder, part: string, candidates: string[], kind: BondKind, total: number, tol = 0.0015, minCount = 1): number {
  const hits: string[] = [];
  for (const c of candidates) {
    if (b.resolve(c) === b.resolve(part)) continue;
    const ct = b.contact(part, c, tol);
    if (ct && (ct.kind === "face" || ct.penetrating || ct.length > 0.004)) hits.push(c);
  }
  if (hits.length < minCount) {
    b.warn(`bondTouching: '${b.resolve(part)}' touches ${hits.length} of the expected parts`);
    return hits.length;
  }
  const each = total / hits.length;
  for (const h of hits) b.bond(part, h, kind, { strength: Math.max(1, each) });
  return hits.length;
}

export interface ShadeOpts {
  /** Bottom and top radius (m) and height of the shade. */
  rBottom: number;
  rTop: number;
  h: number;
  segments?: number;
  surf?: SurfaceName;
  tint?: number;
  /** Total fabric+backing mass (kg). */
  kg?: number;
}

/**
 * Lamp shade: laminated fabric shell (tiles stitched together) with a 3-spoke steel spider and a
 * centre washer that sits on a harp/finial. Local frame: shade bottom rim at y = 0, axis +Y;
 * the washer's underside is at y = h - 0.02 on the axis. Returns the washer (to bond to the
 * harp), spokes and tiles.
 */
export function lampShade(b: Builder, name: string, o: ShadeOpts, pos: V3 = [0, 0, 0]): { washer: string; spokes: string[]; tiles: string[]; all: string[] } {
  const seg = o.segments ?? 8;
  const t = 0.002;
  return scoped(b, name, pos, undefined, () => {
    const tiles = b.lathe("cloth", "fabric", o.surf ?? "fabric_cotton", o.surf ?? "fabric_cotton", {
      profile: [
        [o.rBottom, 0],
        [o.rTop, o.h],
      ],
      thickness: t,
      segments: seg,
      capBottom: false,
      tint: o.tint ?? 0xf1e6d0,
      mass: o.kg ?? 0.14,
      seam: "glue",
      seamStrength: SOFT_SEAM,
    });
    const yW = o.h - 0.02;
    const washer = b.cyl("washer", "steel", "steel_brushed", 0.014, 0.003, [0, yW + 0.0015, 0], { segments: 8, tint: 0xd8b46a });
    const spokes: string[] = [];
    // spokes run from the washer rim to the inside of the top rim, at tile centres (no seams)
    const rIn = o.rTop - t * 0.5;
    for (let k = 0; k < 3; k++) {
      const tileIdx = Math.round((k * seg) / 3);
      const a = ((tileIdx + 0.5) * 2 * Math.PI) / seg;
      const c = Math.cos(a),
        s = Math.sin(a);
      const sp = b.tube(`spoke${k}`, "steel", "steel_brushed", [
        [0.006 * c, yW + 0.0015, 0.006 * s],
        [rIn * c, o.h - 0.004, rIn * s],
      ], 0.0016, { sides: 5, tint: 0xd8b46a, joint: null });
      b.weld(sp[0], washer, 20);
      bondTouching(b, sp[0], tiles, "glue", 10, 0.002);
      spokes.push(sp[0]);
    }
    return { washer, spokes, tiles, all: [...tiles, washer, ...spokes] };
  });
}

/**
 * Lamp harp: a steel wire U from a saddle level (y0, both ends sunk into `on`) up to an apex at
 * (0, y1) on the axis. Width = 2·halfW. Returns the segments (bonded at both ends to `on`).
 */
export function lampHarp(b: Builder, name: string, o: { on: string; y0: number; yShoulder: number; y1: number; halfW: number; startR: number; tint?: number }, pos: V3 = [0, 0, 0]): string[] {
  const tint = o.tint ?? 0xd8b46a;
  let segs: string[] = [];
  b.group(pos, undefined, "", () => {
    segs = b.tube(name, "steel", "steel_brushed", [
      [-o.startR, o.y0, 0],
      [-o.halfW, o.y0, 0],
      [-o.halfW, o.yShoulder, 0],
      [0, o.y1, 0],
      [o.halfW, o.yShoulder, 0],
      [o.halfW, o.y0, 0],
      [o.startR, o.y0, 0],
    ], 0.0025, { sides: 6, tint, joint: "weld", jointStrength: 60 });
  });
  b.bond(segs[0], o.on, "screw", { strength: 40 });
  b.bond(segs[segs.length - 1], o.on, "screw", { strength: 40 });
  return segs;
}

/** A single leaf (flattened ellipsoid) of `len` × `wid`, laid along local +X from its stem point. */
export function leaf(
  b: Builder,
  name: string,
  o: { len: number; wid: number; thick?: number; tint?: number; mat?: MaterialId; kg?: number },
  pos: V3,
  rot?: Rot,
): string {
  const th = o.thick ?? 0.004;
  let part = "";
  b.group(pos, rot, "", () => {
    part = b.ellipsoid(name, o.mat ?? "paper", "foliage", [o.len / 2, th / 2, o.wid / 2], [o.len / 2, 0, 0], {
      tint: o.tint ?? 0x4f7f3a,
      segments: 8,
      rings: 4,
      mass: o.kg ?? Math.max(0.002, o.len * o.wid * 0.6 * 0.35),
    });
  });
  return part;
}

/** Warm, plausible veneer/upholstery palettes used for seeded variation. */
export const PALETTE = {
  upholstery: [0x6f7d8c, 0x8a8f86, 0x5c6b5a, 0xa59a86, 0x4f5d73],
  leather: [0x8a4f2c, 0x5b3a26, 0x3d2b22],
  bookCovers: [0x7a1f24, 0x1f3d5c, 0x2f5a3a, 0xc9a227, 0x262626, 0xe8e0d0, 0x5a2d6b, 0xb0502a, 0x3f6f7f, 0x9c8a6a],
  ceramic: [0x3d6f8c, 0xe9e3d6, 0x9c4a3a, 0x2d2d2d, 0x7f9a7a, 0xd9b48a],
};
