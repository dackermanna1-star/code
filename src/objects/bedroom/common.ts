// Shared helpers for the bedroom content builders (src/objects/bedroom/**): builder factory with
// deterministic seeds, range boxes, hollow-section masses, palette. PURE MODULE (no Babylon).

import { Builder, type PartOpts } from "../lib/builder.ts";
import type { AssemblyCategory, AssemblyDef } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { seedFrom } from "../../core/rng.ts";

/** Options every bedroom builder accepts. */
export interface BaseOpts {
  /** Variant seed (uv offsets, small random variations). */
  seed?: number;
  /** Room id copied into the AssemblyDef (the furnisher sets it). */
  room?: string;
  /** Builder validation level ("full" adds the sample-based overlap check; tests use it). */
  validate?: "basic" | "full";
}

export type Range = readonly [number, number];

/** New Builder with a seed derived from the type id and the variant seed. */
export function mk(type: string, name: string, category: AssemblyCategory, value: number, o: BaseOpts = {}): Builder {
  const codes: number[] = [];
  for (let i = 0; i < type.length; i++) codes.push(type.charCodeAt(i));
  const b = new Builder(type, name, category, value, seedFrom(o.seed ?? 0, type.length, ...codes));
  if (o.room) b.room = o.room;
  return b;
}

/** Validate and return the AssemblyDef (honours BaseOpts.validate). */
export function finish(b: Builder, o: BaseOpts = {}): AssemblyDef {
  return b.build({ validate: o.validate ?? "basic" });
}

/** Axis-aligned box in the current builder frame given by coordinate ranges. */
export function boxR(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, x: Range, y: Range, z: Range, o: PartOpts = {}): string {
  const sx = x[1] - x[0],
    sy = y[1] - y[0],
    sz = z[1] - z[0];
  if (!(sx > 1e-6 && sy > 1e-6 && sz > 1e-6)) throw new Error(`${b.type}: degenerate box '${name}' (${sx} × ${sy} × ${sz})`);
  return b.box(name, mat, surf, [sx, sy, sz], [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], o);
}

/** Mass per metre (kg/m) of a rectangular hollow section w × h with wall thickness `wall`. */
export function rectTubeKgPerM(w: number, h: number, wall: number, density = 7850): number {
  const t = Math.min(wall, w / 2, h / 2);
  return (w * h - (w - 2 * t) * (h - 2 * t)) * density;
}

/** Mass per metre (kg/m) of a round tube (outer diameter od, wall thickness). */
export function roundTubeKgPerM(od: number, wall: number, density = 7850): number {
  const ro = od / 2,
    ri = Math.max(0, ro - wall);
  return Math.PI * (ro * ro - ri * ri) * density;
}

/** Mass (kg) of a thin sheet of area A (m²), thickness t and density rho, times a fill factor (perforations). */
export function sheetKg(area: number, t: number, rho: number, fill = 1): number {
  return area * t * rho * fill;
}

/** Points of a regular polygon (radius r, n sides) in the XZ plane at height y, first vertex at angle a0. */
export function ringXZ(r: number, n: number, y: number, a0 = 0): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (2 * Math.PI * k) / n;
    out.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  return out;
}

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Low-poly soft block (mattress, duvet slab, clothes, beanbag): convex hull of a superellipsoid
 * |x/a|^(2/e) + |y/b|^(2/e) + |z/c|^(2/e) = 1 sampled on a cube-sphere grid with `n` cells per
 * cube edge (rounded up to even, so the face centres are sampled and the extents are exact),
 * smooth shaded. n = 2 gives 26 hull vertices, n = 4 gives 98 (the kit's pillow uses ~218),
 * which keeps big soft slabs cheap for physics and batching. Centred at `pos` (current frame).
 */
export function softBlock(
  b: Builder,
  name: string,
  mat: MaterialId,
  surf: SurfaceName,
  size: readonly [number, number, number],
  roundness: number,
  pos: readonly [number, number, number],
  o: PartOpts = {},
  n = 4,
): string {
  const [sx, sy, sz] = size;
  if (!(sx > 0 && sy > 0 && sz > 0)) throw new Error(`${b.type}: softBlock '${name}' needs a positive size`);
  const e = Math.min(1, Math.max(0.05, roundness));
  const p = 2 / e;
  const a = sx / 2,
    bb = sy / 2,
    c = sz / 2;
  const seen = new Set<string>();
  const pts: Array<[number, number, number]> = [];
  const add = (qx: number, qy: number, qz: number): void => {
    const s = Math.pow(Math.pow(Math.abs(qx), p) + Math.pow(Math.abs(qy), p) + Math.pow(Math.abs(qz), p), -1 / p);
    const x = pos[0] + a * qx * s,
      y = pos[1] + bb * qy * s,
      z = pos[2] + c * qz * s;
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pts.push([x, y, z]);
  };
  const N = Math.max(2, 2 * Math.ceil(Math.floor(n) / 2));
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const u = -1 + (2 * i) / N,
        v = -1 + (2 * j) / N;
      add(1, u, v);
      add(-1, u, v);
      add(u, 1, v);
      add(u, -1, v);
      add(u, v, 1);
      add(u, v, -1);
    }
  return b.hull(name, mat, surf, pts, [0, 0, 0], { smooth: 1, ...o });
}

/** Colour palette shared by the bedroom objects (0xRRGGBB tints). */
export const PAL = {
  white: 0xf2f0ea,
  offWhite: 0xe9e4d8,
  black: 0x1b1c1e,
  charcoal: 0x2b2d31,
  graphite: 0x3a3d42,
  walnutTint: 0xffffff,
  pineStain: 0xd9b48a,
  linen: 0xe8e1d3,
  sheetBlue: 0x9fb4c8,
  duvetSage: 0xb7c2ad,
  denim: 0x41597a,
  cotton: 0xf4f1ea,
  brass: 0xd8b25a,
  rubber: 0x202020,
} as const;
