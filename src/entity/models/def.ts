/**
 * Declarative mob model definitions (pure data + functions, worker-safe, no THREE).
 *
 * Conventions: model REST space, metres, feet centre at the origin, +Y up, the mob FACES -Z
 * (so the mob's right side is +X). Every primitive is authored directly in rest space; bones
 * only carry pivots. At runtime each part mesh's local space IS this rest space, which makes it
 * the coordinate system of the wound API (see rig.ts).
 *
 * Minecraft model pixels: 1 px = 1/16 block = 0.0625 m (`PX`).
 */
export type V3 = [number, number, number];
export const PX = 1 / 16;

export type FaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'surf';

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Joint position in model rest space. */
  pivot: V3;
  /** Ragdoll/physics box in rest space (min, max). Defaults to the bounds of the bone's prims. */
  box?: [V3, V3];
  /** Ragdoll mass (kg). Defaults to volume * 1000 * density factor. */
  mass?: number;
}

interface PrimBase {
  /** Unique id inside the model (painters switch on it). */
  id: string;
  bone: string;
  /** Material slot (default 'main' = the painted atlas). */
  mat?: string;
  /** Texel density multiplier. */
  density?: number;
  /** Reuse the texture rects of another prim with identical dimensions (mirrored limbs...). */
  share?: string;
  /** Mirror u when sharing (left/right faces swap). */
  mirror?: boolean;
  /** Displacement along the normal (metres) evaluated in rest space (lumpy wool, muscles). */
  displace?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
  /** Exclude from ragdoll bounds (accessories). */
  noBounds?: boolean;
}

export interface BoxPrim extends PrimBase {
  kind: 'box';
  from: V3;
  to: V3;
  /** Edge rounding radius (m). */
  r?: number;
  /** Segments per 45° of rounding. */
  seg?: number;
  /** Subdivisions of the flat part per axis. */
  div?: number | V3;
  /** Rest rotation (radians, applied Z then Y then X like Minecraft) about `origin`. */
  rot?: V3;
  /** Rotation origin (default box centre). */
  origin?: V3;
  /** Cross-section scale (x, z) at the bottom and top of the box (linear in between). */
  taper?: { bottom?: [number, number]; top?: [number, number] };
  /** Faces to omit. */
  skip?: FaceName[];
  /** Inflate the box by this amount on every side (Minecraft "dilation"). */
  inflate?: number;
}

export interface TubePrim extends PrimBase {
  kind: 'tube';
  /** Centre line control points (Catmull-Rom). */
  path: V3[];
  /** Radius along the tube: constant, per control point, or a function of t (0..1). */
  radius: number | number[] | ((t: number) => number);
  /** Elliptic cross-section scale (x = side, y = up) relative to radius. */
  aspect?: [number, number];
  sides?: number;
  segs?: number;
  /** Close the ends with rounded caps. */
  caps?: boolean;
}

export interface EllipsoidPrim extends PrimBase {
  kind: 'ellipsoid';
  center: V3;
  radius: V3;
  rot?: V3;
  rings?: number;
  sides?: number;
}

/** Thin (double-sided) membrane: a bilinear patch over 4 corners or a function. */
export interface SheetPrim extends PrimBase {
  kind: 'sheet';
  /** Surface point for (s,t) in [0,1]^2. */
  at: (s: number, t: number) => V3;
  /** Physical size (m) of the s and t directions for texel density. */
  size: [number, number];
  nu?: number;
  nv?: number;
  /** Thickness (m) — gives a slab with front/back faces; 0 = single double-sided surface. */
  thickness?: number;
}

export type PrimDef = BoxPrim | TubePrim | EllipsoidPrim | SheetPrim;

/** Values a painter writes for one texel. Inputs are filled by the atlas painter. */
export interface Sample {
  // ---- inputs
  prim: string;
  bone: string;
  face: FaceName;
  /** Face-local coordinates in metres: u to the right, v up, as seen from outside the face. */
  u: number;
  v: number;
  /** Face size (metres). */
  w: number;
  h: number;
  /** Rest-space position and normal of the (unrounded) surface. */
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  /** Texel size in metres. */
  du: number;
  // ---- outputs
  /** Linear albedo. */
  r: number;
  g: number;
  b: number;
  /** Displacement height (metres, + raised) -> normal map + cavity AO. */
  height: number;
  rough: number;
  ao: number;
  sss: number;
  /** Emissive strength 0..1 (x EMISSIVE_SCALE in the lighting pass). */
  em: number;
  metal: number;
  /** Coverage for alpha-tested slots. */
  alpha: number;
}

export type Painter = (s: Sample) => void;

export interface SlotDef {
  /** 'atlas' = painted textures, 'solid' = constant colour material. */
  kind: 'atlas' | 'solid';
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  sss?: number;
  doubleSided?: boolean;
  alphaTest?: number;
  /** Excluded from shadow casting. */
  noShadow?: boolean;
}

export interface ModelDef {
  /** Cache key (model name + variant). */
  key: string;
  bones: BoneDef[];
  prims: PrimDef[];
  /** Texel density in px per metre for the atlas. */
  density: number;
  /** Max atlas size (px). */
  maxTex?: number;
  paint: Painter;
  /** Material slots besides 'main' (which is always an atlas slot). */
  slots?: Record<string, SlotDef>;
  /** Base subsurface amount of the atlas material (per-texel `sss` multiplies it). */
  sss?: number;
  /** Blood type: 0 red, 1 none (bones), 2 green, 3 purple. */
  blood?: number;
  /** Use the alpha channel as coverage (alpha test) instead of sss. */
  alphaTest?: number;
  /** Normal map strength multiplier. */
  normalScale?: number;
  /** Named attachment points: bone + rest-space position (+ optional rest rotation). */
  attach?: Record<string, { bone: string; pos: V3; rot?: V3 }>;
}

// -----------------------------------------------------------------------------------------
// Small helpers for authoring

/** Box from Minecraft-style pixel coordinates (origin feet centre, y up, -z front). */
export function pxBox(id: string, bone: string, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, o: Partial<BoxPrim> = {}): BoxPrim {
  return { kind: 'box', id, bone, from: [x0 * PX, y0 * PX, z0 * PX], to: [(x0 + sx) * PX, (y0 + sy) * PX, (z0 + sz) * PX], ...o };
}

/** Box from centre + size (metres). */
export function cbox(id: string, bone: string, c: V3, s: V3, o: Partial<BoxPrim> = {}): BoxPrim {
  return { kind: 'box', id, bone, from: [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], to: [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2], ...o };
}

export function bone(name: string, parent: string | null, pivot: V3, o: Partial<BoneDef> = {}): BoneDef {
  return { name, parent, pivot, ...o };
}
