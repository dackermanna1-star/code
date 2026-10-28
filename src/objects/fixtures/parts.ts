// Shared building blocks for the apartment-wide fixtures (lights, fan, window coverings,
// electrics). Kept local to this area so the fixture builders do not depend on kit helpers that
// are still evolving; everything here only uses the stable Builder API. PURE MODULE.
//
// Frames used by the fixture builders (documented per builder as well):
//  * CEILING fixtures: origin at the ceiling mounting point (top centre), the fixture hangs
//    down along −Y. The furnisher places them at y = CEILING_Y (2.7).
//  * WALL fixtures: origin on the finished wall face, the fixture's back on z = 0, front +Z
//    (same convention as kit.pictureFrame). The furnisher yaws them so +Z faces into the room.
//  * FLOOR items (door stops, baseboard heaters): origin on the floor (y = 0), wall at z = 0.

import { qaxisAngle, qmul, v3, type Quat } from "../../geom/vec.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { BondKind } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import type { Builder, V3 } from "../lib/builder.ts";

const D2R = Math.PI / 180;

// ------------------------------------------------------------------ colours (sRGB hex of the
// black-body colour; the renderer treats light colours as linear, which reads as a pleasant warm
// white rather than orange).
/** 2700 K — incandescent / "soft white" LED. */
export const K2700 = 0xffa957;
/** 3000 K — "warm white" LED. */
export const K3000 = 0xffb46b;

export const NICKEL = 0xd8d6d0;
export const WHITE_PAINT = 0xf4f3ef;
export const BRONZE = 0x4a3b2e;

/** Quaternion: pitch about local X (deg), then yaw about Y (deg) — e.g. a pitched fan blade at a spoke angle. */
export function yawPitch(yawDeg: number, pitchDeg = 0): Quat {
  return qmul(qaxisAngle(v3(0, 1, 0), yawDeg * D2R), qaxisAngle(v3(1, 0, 0), pitchDeg * D2R));
}

/** Yaw (deg) that turns local +X towards the direction at angle `theta` (deg) in the XZ plane, (cos θ, 0, sin θ). */
export function radialYaw(thetaDeg: number): number {
  return -thetaDeg;
}

/** Run `fn` in a named group (prefix `${name}_`). */
export function scope<T>(b: Builder, name: string, pos: V3, rot: [number, number, number] | Quat | undefined, fn: () => T): T {
  let out!: T;
  b.group(pos, rot, `${name}_`, () => {
    out = fn();
  });
  return out;
}

// ------------------------------------------------------------------ bulbs

export type BulbKind = "a19" | "a15" | "g25" | "candle" | "st64";

interface BulbShape {
  /** Envelope max radius. */
  R: number;
  /** Envelope length above the screw base. */
  len: number;
  baseR: number;
  baseH: number;
  /** Real glass envelope mass (kg) — the hull is solid, so the mass is overridden. */
  kg: number;
}

const BULBS: Record<BulbKind, BulbShape> = {
  a19: { R: 0.03, len: 0.075, baseR: 0.0133, baseH: 0.024, kg: 0.026 },
  a15: { R: 0.024, len: 0.058, baseR: 0.0133, baseH: 0.022, kg: 0.018 },
  g25: { R: 0.04, len: 0.085, baseR: 0.0133, baseH: 0.024, kg: 0.042 },
  candle: { R: 0.0175, len: 0.07, baseR: 0.0065, baseH: 0.02, kg: 0.012 },
  st64: { R: 0.032, len: 0.115, baseR: 0.0133, baseH: 0.026, kg: 0.034 },
};

export interface LightSpec {
  color?: number;
  intensity?: number;
  range?: number;
  castShadows?: boolean;
  on?: boolean;
}

/** Overall length (screw base + envelope) of a bulb kind. */
export function bulbLength(kind: BulbKind): number {
  const s = BULBS[kind];
  return s.baseH + s.len;
}

/**
 * Light bulb: aluminium screw base on the local origin, glass envelope along +Y (rotate 180°
 * about X for a bulb hanging from a socket). The envelope carries the `light` feature (mains)
 * and the emissive `bulb_on` surface; it is glued into the base. Returns full part names.
 */
export function bulb(b: Builder, name: string, kind: BulbKind, light: LightSpec = {}, pos: V3 = [0, 0, 0], rot?: [number, number, number]): { glass: string; cap: string; tip: number } {
  const s = BULBS[kind];
  return scope(b, name, pos, rot, () => {
    const cap = b.cyl("cap", "aluminum", "aluminum", s.baseR, s.baseH, [0, s.baseH / 2, 0], { segments: 10, tess: 0 });
    // envelope: neck ring on the base + ellipsoidal bulb ending at baseH + len
    const neckR = s.baseR * 0.92;
    const Rv = Math.min(s.len * 0.5, s.R * (kind === "candle" ? 1.6 : kind === "st64" ? 1.35 : 1.05));
    const yc = s.baseH + s.len - Rv;
    const pts: V3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (2 * Math.PI * k) / 10;
      pts.push([neckR * Math.cos(a), s.baseH, neckR * Math.sin(a)]);
    }
    const rings = 6;
    for (let ring = 0; ring < rings; ring++) {
      const phi = -Math.PI / 2 + 0.45 + ((Math.PI / 2 - 0.45 + Math.PI / 2 - 0.25) * ring) / (rings - 1);
      const rr = s.R * Math.cos(phi);
      const yy = yc + Rv * Math.sin(phi);
      if (yy <= s.baseH + 0.002) continue;
      for (let k = 0; k < 10; k++) {
        const a = (2 * Math.PI * (k + 0.5 * (ring % 2))) / 10;
        pts.push([rr * Math.cos(a), yy, rr * Math.sin(a)]);
      }
    }
    pts.push([0, s.baseH + s.len, 0]);
    const on = light.on ?? true;
    const glass = b.hull("glass", "glass", on ? "bulb_on" : "bulb_off", pts, [0, 0, 0], { smooth: 1, mass: s.kg });
    b.glue(glass, cap, 6);
    b.light({
      part: glass,
      pos: [0, yc, 0],
      color: light.color ?? K2700,
      intensity: light.intensity ?? 2.5,
      range: light.range ?? 5.5,
      castShadows: light.castShadows,
      mains: true,
      on,
    });
    return { glass, cap, tip: s.baseH + s.len };
  });
}

// ------------------------------------------------------------------ rings and annuli

/**
 * Ring around the local X axis (curtain ring, washer) as `segs` convex tiles fused together.
 * Tile 0 is centred on +Y (top); tile i is centred at 90° + i·360°/segs (measured from +Z
 * towards +Y). Cross-section: a diamond of half-size r (4 points). Returns tile names.
 */
export function ringX(
  b: Builder,
  name: string,
  o: { R: number; r: number; segs?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; seam?: number },
  center: V3,
): string[] {
  const segs = Math.max(4, o.segs ?? 6);
  const c = Array.isArray(center) ? center : [center.x, center.y, center.z];
  const step = 360 / segs;
  const names: string[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = (90 + i * step - step / 2) * D2R,
      t1 = (90 + i * step + step / 2) * D2R;
    const pts: V3[] = [];
    for (const t of [t0, t1]) {
      const dy = Math.sin(t),
        dz = Math.cos(t);
      for (const [rad, ax] of [
        [o.R + o.r, 0],
        [o.R, o.r],
        [o.R - o.r, 0],
        [o.R, -o.r],
      ]) {
        pts.push([c[0] + ax, c[1] + rad * dy, c[2] + rad * dz]);
      }
    }
    names.push(b.hull(`${name}_${i}`, o.mat ?? "steel", o.surf ?? "steel_brushed", pts, [0, 0, 0], { tint: o.tint, smooth: 1, tess: 0 }));
  }
  b.fuseTouching(names, "fused", o.seam ?? 80);
  return names;
}

/**
 * Flat annulus (clock case, bezel) in the local XY plane spanning z ∈ [z0, z1], as `segs`
 * convex segments fused together. Segment k spans angles [k, k+1]·360°/segs from +X.
 */
export function annulusZ(
  b: Builder,
  name: string,
  o: { rOut: number; rIn: number; z0: number; z1: number; segs?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; seam?: number; kg?: number },
): string[] {
  const segs = Math.max(4, o.segs ?? 8);
  const names: string[] = [];
  const kg = o.kg !== undefined ? o.kg / segs : undefined;
  for (let k = 0; k < segs; k++) {
    const a0 = (2 * Math.PI * k) / segs,
      a1 = (2 * Math.PI * (k + 1)) / segs;
    const pts: V3[] = [];
    for (const a of [a0, a1])
      for (const r of [o.rOut, o.rIn]) for (const z of [o.z0, o.z1]) pts.push([r * Math.cos(a), r * Math.sin(a), z]);
    names.push(b.hull(`${name}_${k}`, o.mat ?? "plastic", o.surf ?? "plastic", pts, [0, 0, 0], { tint: o.tint, smooth: 1, mass: kg, tess: 0 }));
  }
  b.fuseTouching(names, "fused", o.seam ?? 40);
  return names;
}

// ------------------------------------------------------------------ bonding helpers

/** Bond `a` to each of `others` that lies within `tol` (m); returns the number of bonds made. */
export function bondNear(b: Builder, a: string, others: string[], kind: BondKind, strength: number, tol = 0.006, max = Infinity): number {
  let n = 0;
  for (const o of others) {
    if (n >= max) break;
    if (!b.contact(a, o, tol)) continue;
    b.bond(a, o, kind, { strength });
    n++;
  }
  return n;
}

/** Highest (max y) / lowest tiles of a tile set by their bounding boxes. */
export function extremeTiles(b: Builder, tiles: string[], which: "top" | "bottom", eps = 1e-4): string[] {
  const ys = tiles.map((t) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const v of b.get(t).poly.verts) {
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
    }
    return which === "top" ? hi : lo;
  });
  const best = which === "top" ? Math.max(...ys) : Math.min(...ys);
  return tiles.filter((_, i) => Math.abs(ys[i] - best) <= eps);
}
