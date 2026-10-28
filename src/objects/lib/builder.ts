// Builder DSL for destructible assemblies. Object/structure builders describe real
// construction (panels, internals, fasteners, joints) and get a validated AssemblyDef.
//
// CONVENTIONS (read before writing an object; see also the guide at the top of kit.ts):
//  * Assembly frame: origin at the object's base centre (floor contact point), +Y up,
//    the object's FRONT (doors, screen, controls) faces +Z. The furnisher rotates it into place.
//  * Units: metres / kg / joules. Rotations: Euler DEGREES [x, y, z] applied like Babylon's
//    RotationYawPitchRoll (roll Z first, then pitch X, then yaw Y — i.e. yaw is outermost),
//    or a Quat. Positions/rotations passed to part methods are in the CURRENT GROUP FRAME
//    (b.group nests frames and name prefixes).
//  * Every part must be convex. Build curved shells from tiles (lathe/torus/arcPanel/tube).
//  * Use real dimensions and thicknesses; masses come from material densities (check
//    b.info().mass). Use `mass` overrides only for hollow/stuffed parts.
//  * Bond what is really attached, with the fastener that really attaches it.
//  * Joint angles follow the right-hand rule in coordinates: a positive hinge angle rotates the
//    moving part by qaxisAngle(axis, angle). For a door whose free edge points along e (from the
//    hinge line) and which opens towards o, use axis = cross(e, o) and limits [0, openDeg]
//    (kit.hingeAxis does this).
//  * Names: part names get the current group prefix. Methods accept either the local name
//    (resolved against the current prefix first) or a full name.
//
// PURE MODULE (no Babylon imports).

import { v3, qeuler, qrot, qmul, xform, xapply, xapplyDir, vadd, vsub, vscale, vnorm, vlen, vdot, type Vec3, type Quat, type Xform } from "../../geom/vec.ts";
import {
  polyBox,
  polyBeveledBox,
  polyCylinder,
  polyPrism,
  polyFromHull,
  polyTransform,
  polyVolume,
  polyExtents,
  autoUV,
  type ConvexPoly,
  type FaceAttr,
} from "../../geom/poly.ts";
import { latheTiles, torusTiles, arcPanelTiles, polyEllipsoid, polyPillow, type LatheOptions, type Tile } from "../../geom/primitives.ts";
import { Rng, seedFrom } from "../../core/rng.ts";
import { S, type SurfaceName } from "../../render/surfaces.ts";
import { MATERIALS, type MaterialId } from "../../destruction/model/materials.ts";
import type { AssemblyCategory, AssemblyDef, BondDef, BondKind, FeatureDef, JointDef, PartDef } from "../../destruction/model/types.ts";
import { aabbOf, aabbContains, overlappingPairs, polyContact, polyInside, polyPointDist, polySd, samplePoly, type Aabb, type Contact } from "./contact.ts";
import { tubeSegments } from "./shapes.ts";

export type V3 = Vec3 | [number, number, number];
export type Rot = Quat | [number, number, number];

const D2R = Math.PI / 180;

const isFiniteVec = (a: Vec3 | undefined): boolean => !!a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

export const vec = (a: V3): Vec3 => {
  const r = Array.isArray(a) ? v3(a[0], a[1], a[2]) : v3(a.x, a.y, a.z);
  if (!isFiniteVec(r)) throw new Error(`builder: non-finite vector ${JSON.stringify(a)}`);
  return r;
};

export const rot = (r?: Rot): Quat => {
  if (!r) return { x: 0, y: 0, z: 0, w: 1 };
  if (Array.isArray(r)) {
    if (!r.every((x) => Number.isFinite(x))) throw new Error(`builder: non-finite rotation ${JSON.stringify(r)}`);
    return qeuler(r[0] * D2R, r[1] * D2R, r[2] * D2R);
  }
  const l = Math.hypot(r.x, r.y, r.z, r.w);
  if (!(l > 1e-9) || !Number.isFinite(l)) throw new Error(`builder: invalid quaternion ${JSON.stringify(r)}`);
  return { x: r.x / l, y: r.y / l, z: r.z / l, w: r.w / l };
};

export type FaceKey = "px" | "nx" | "py" | "ny" | "pz" | "nz";
const FACE_ORDER: FaceKey[] = ["px", "nx", "py", "ny", "pz", "nz"];
const FACE_N: Record<FaceKey, Vec3> = {
  px: v3(1, 0, 0),
  nx: v3(-1, 0, 0),
  py: v3(0, 1, 0),
  ny: v3(0, -1, 0),
  pz: v3(0, 0, 1),
  nz: v3(0, 0, -1),
};

const BOND_KINDS: ReadonlySet<BondKind> = new Set<BondKind>([
  "glue",
  "screw",
  "nail",
  "dowel",
  "weld",
  "bolt",
  "press",
  "clip",
  "mortar",
  "fused",
  "friction",
  "hinge",
  "slider",
  "latch",
]);

export interface SurfSpec {
  surf?: SurfaceName;
  tint?: number;
}

export interface PartOpts {
  rot?: Rot;
  tint?: number;
  /** Per-face overrides for boxes (px = +X face, ...). */
  faces?: Partial<Record<FaceKey, SurfSpec>>;
  /** Wood grain axis in PART-LOCAL space ("x" | "y" | "z" or a vector). Default: longest axis for wood. */
  grain?: "x" | "y" | "z" | V3;
  /** Use an end-grain surface (wood_fiber) on faces perpendicular to the grain (wood). Default true for wood. */
  endGrain?: boolean;
  /** Render tessellation (m) for denting. Default: 0.04 for steelSheet/aluminum, 0 otherwise. */
  tess?: number;
  supported?: boolean;
  /** Strength multiplier on the material. */
  strength?: number;
  mass?: number;
  noCollide?: boolean;
  tags?: string[];
  /** Explicit uv offset in metres (default: random per part so copies don't look identical). */
  uvOffset?: [number, number];
  /** Smoothing group for curved primitives (default 1 for cylinders/ellipsoids/tubes). */
  smooth?: number;
}

export interface CylOpts extends PartOpts {
  rTop?: number;
  segments?: number;
  /** Cylinder axis in part space (default "y"). */
  axis?: "x" | "y" | "z";
  capSurf?: SurfaceName;
  capTint?: number;
}

/** Options shared by tiled primitives (lathe, torus, arcPanel, addTiles, tube). */
export interface TiledOpts extends Omit<PartOpts, "faces" | "mass"> {
  /** TOTAL mass (kg) of all tiles, distributed by tile volume (hollow/stuffed shells). */
  mass?: number;
  /** Bond kind joining touching tiles (default "fused"). */
  seam?: BondKind;
  /** Explicit seam strength (J); default: the runtime derives fused strength from the material and seam area. */
  seamStrength?: number;
}

export interface TubeOpts extends TiledOpts {
  /** Offset of the path in the current frame (default origin). */
  pos?: V3;
  /** Cross-section sides (default 8). */
  sides?: number;
  closed?: boolean;
  /** Bond kind between consecutive segments (default "fused"); null = leave unbonded. */
  joint?: BondKind | null;
  jointStrength?: number;
  /** Mass per metre (kg/m) — e.g. a hollow pipe or a cable; overrides material density. */
  kgPerM?: number;
  /** Surface of the segment end faces (default: same as the side). */
  capSurf?: SurfaceName;
}

export interface HingeSpec {
  /** One pivot per physical hinge (all on the same axis), current frame. */
  pivots: V3[];
  axis: V3;
  /** Degrees relative to the built pose (right-hand rule about `axis`). */
  min: number;
  max: number;
  /** Energy capacity per hinge (J). Default 90 (interior door), use ~30 for cabinet hinges. */
  strength?: number;
  friction?: number;
  /** Latch strength (J) holding it closed (door latch / magnetic catch / lock). Omit for none. */
  latch?: number;
  /** Where the latch engages (current frame). Default: the moving part's far edge, level with the pivots. */
  latchPos?: V3;
  /** Moving-side part carrying the latch bolt/hook (default: the moving part). */
  latchPart?: string;
  /** Fixed-side part the latch engages (strike plate / catch; default: the first fixed part). */
  latchFixed?: string;
  spring?: number;
  /** Join an existing joint group (several calls → one constraint). */
  group?: string;
}

export interface SliderSpec {
  pivots: V3[];
  axis: V3;
  /** Metres (e.g. 0 .. 0.45 for a drawer). */
  min: number;
  max: number;
  strength?: number;
  friction?: number;
  latch?: number;
  latchPos?: V3;
  latchPart?: string;
  latchFixed?: string;
  group?: string;
}

export interface BondOpts {
  strength?: number;
  /** Anchor in the current frame (default: centre of the contact patch between the parts). */
  anchor?: V3;
  joint?: JointDef;
}

export interface AutoBondOpts {
  /** Restrict to these parts (names resolved). */
  parts?: string[];
  /** Minimum face-contact area (m²) for a bond (default 1e-6). */
  minArea?: number;
  /** Accept line contacts at least this long (m, default 0.005); set allowEdge false to require faces. */
  minLength?: number;
  allowEdge?: boolean;
}

export type WarnMode = "collect" | "console" | "throw";
export type ValidationLevel = "basic" | "full";

/** True when running under `node --test` (or BUILDER_VALIDATE=full): full validation + printed warnings. */
function testContext(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return !!env && (!!env.NODE_TEST_CONTEXT || env.BUILDER_VALIDATE === "full");
}

export interface BuildInfo {
  mass: number;
  parts: number;
  bonds: number;
  bbox: { min: Vec3; max: Vec3; size: Vec3 };
  features: number;
  /** Number of joint groups (hinge/slider constraints). */
  joints: number;
  warnings: string[];
  /** Mass (kg) per material id. */
  byMaterial: Record<string, number>;
}

interface GroupFrame {
  xf: Xform;
  prefix: string;
}

export class Builder {
  /**
   * What build() does with validation warnings: keep them in `warnings` / info(), also print
   * them, or throw. Default: "console" under `node --test`, else "collect".
   */
  static warnMode: WarnMode = testContext() ? "console" : "collect";
  /**
   * Validation depth of build(): "basic" (cheap structural checks; the runtime default) or
   * "full" (adds proximity/containment/pivot checks and the sample-based overlap check; the
   * default under `node --test`).
   */
  static validation: ValidationLevel = testContext() ? "full" : "basic";

  readonly type: string;
  readonly name: string;
  readonly category: AssemblyCategory;
  readonly value: number;
  readonly rng: Rng;
  /** Copied into the AssemblyDef by build() when set. */
  room?: string;
  startAsleep?: boolean;
  /** Problems noticed while building and by build() validation. */
  readonly warnings: string[] = [];
  private parts: PartDef[] = [];
  private partIndex = new Map<string, PartDef>();
  private bonds: BondDef[] = [];
  private features: FeatureDef[] = [];
  private frames: GroupFrame[] = [{ xf: xform(v3()), prefix: "" }];
  private groupCounter = 0;
  /** Local-space primitive polys by parameter key (keycaps, feet, legs repeat a lot). */
  private primCache = new Map<string, ConvexPoly>();

  constructor(type: string, name: string, category: AssemblyCategory, value: number, seed?: number) {
    this.type = type;
    this.name = name;
    this.category = category;
    this.value = value;
    this.rng = new Rng(seed ?? seedFrom(type.length, ...Array.from(type).map((c) => c.charCodeAt(0))));
  }

  // ------------------------------------------------------------------ frames
  private get frame(): GroupFrame {
    return this.frames[this.frames.length - 1];
  }

  /** Run `fn` in a nested local frame (offset + rotation, in the current frame) with a name prefix. */
  group(offset: V3, rotation: Rot | undefined, prefix: string, fn: () => void): void {
    const parent = this.frame;
    const local = xform(vec(offset), rot(rotation));
    const xf: Xform = { p: xapply(parent.xf, local.p), q: qmul(parent.xf.q, local.q) };
    this.frames.push({ xf, prefix: parent.prefix + prefix });
    try {
      fn();
    } finally {
      this.frames.pop();
    }
  }

  /** Full part name with the current group prefix. */
  n(name: string): string {
    return name === "world" ? name : this.frame.prefix + name;
  }

  /** Transform a local point of the current frame to assembly space. */
  p(local: V3): Vec3 {
    return xapply(this.frame.xf, vec(local));
  }

  /** Transform a local direction of the current frame to assembly space (normalised). */
  d(local: V3): Vec3 {
    return vnorm(xapplyDir(this.frame.xf, vec(local)));
  }

  /** The current frame's transform (group frame → assembly). */
  frameXf(): Xform {
    const f = this.frame.xf;
    return { p: { ...f.p }, q: { ...f.q } };
  }

  // ------------------------------------------------------------------ attrs
  attr(surf: SurfaceName, tint = 0xffffff, smooth = 0): FaceAttr {
    const s = S[surf];
    if (s === undefined) throw new Error(`${this.type}: unknown surface '${surf}'`);
    return { surf: s, tint, uv: { u: v3(), v: v3(), u0: 0, v0: 0 }, interior: false, smooth };
  }

  /**
   * Local primitive from the cache (a copy whose faces can be re-attributed), or made by `make`.
   * Cached polys are never decorated themselves.
   */
  private cachedPrim(key: string, make: () => ConvexPoly): ConvexPoly {
    let p = this.primCache.get(key);
    if (!p) {
      p = make();
      this.primCache.set(key, p);
    }
    return { verts: p.verts, faces: p.faces.map((f) => ({ ...f })) };
  }

  private uvOffset(o?: [number, number]): [number, number] {
    return o ?? [this.rng.range(0, 3), this.rng.range(0, 3)];
  }

  /**
   * Per-face appearance finishing for primitives built from a shared attr: gives every face its
   * own attr object, applies the uv offset (deriving a planar map if the primitive left none),
   * re-derives grain-aligned maps for wood and puts end grain on faces across the grain.
   * Mutates and returns `poly` (callers pass freshly created polys).
   */
  private decorate(poly: ConvexPoly, mat: MaterialId, grain: Vec3 | undefined, ou: number, ov: number, endGrain: boolean): ConvexPoly {
    const wood = MATERIALS[mat].mode === "splinter";
    for (const f of poly.faces) {
      const a = f.attr;
      const hasMap = !!a.uv && (a.uv.u.x !== 0 || a.uv.u.y !== 0 || a.uv.u.z !== 0);
      let uv: FaceAttr["uv"];
      if (!hasMap) uv = autoUV(f.n, ou, ov, grain);
      else if (!grain) uv = { u: { ...a.uv.u }, v: { ...a.uv.v }, u0: a.uv.u0 + ou, v0: a.uv.v0 + ov };
      else {
        // Keep the primitive's (continuous, wrap-around) map when it can be grain-aligned:
        // textures put the grain along u, so swap u/v when the grain runs along v.
        const ug = Math.abs(vdot(vnorm(a.uv.u), grain)),
          vg = Math.abs(vdot(vnorm(a.uv.v), grain));
        if (ug > 0.95) uv = { u: { ...a.uv.u }, v: { ...a.uv.v }, u0: a.uv.u0 + ou, v0: a.uv.v0 + ov };
        else if (vg > 0.95) uv = { u: { ...a.uv.v }, v: { ...a.uv.u }, u0: a.uv.v0 + ou, v0: a.uv.u0 + ov };
        else uv = autoUV(f.n, ou, ov, grain);
      }
      let surf = a.surf;
      if (wood && grain && endGrain && Math.abs(vdot(f.n, grain)) > 0.9) surf = S.wood_fiber;
      f.attr = { ...a, uv, surf };
    }
    return poly;
  }

  // ------------------------------------------------------------------ parts
  /** Register a fully specified part (poly already in assembly space). */
  addPart(def: PartDef): string {
    if (!def.name || def.name === "world") throw new Error(`${this.type}: invalid part name '${def.name}'`);
    if (this.partIndex.has(def.name)) throw new Error(`${this.type}: duplicate part name '${def.name}'`);
    if (!MATERIALS[def.mat]) throw new Error(`${this.type}: part '${def.name}' has unknown material '${def.mat}'`);
    if (!def.poly || !def.poly.verts?.length || !def.poly.faces?.length) throw new Error(`${this.type}: part '${def.name}' has an empty polyhedron`);
    this.parts.push(def);
    this.partIndex.set(def.name, def);
    return def.name;
  }

  private finishPart(name: string, mat: MaterialId, localPoly: ConvexPoly, pos: V3, o: PartOpts, grainLocal?: Vec3): string {
    if (!MATERIALS[mat]) throw new Error(`${this.type}: unknown material '${mat}' for part '${name}'`);
    const full = this.n(name);
    const local = xform(vec(pos), rot(o.rot));
    const xf: Xform = { p: xapply(this.frame.xf, local.p), q: qmul(this.frame.xf.q, local.q) };
    const poly = polyTransform(localPoly, xf);
    const isSheet = mat === "steelSheet" || mat === "aluminum";
    const def: PartDef = { name: full, mat, poly };
    if (grainLocal) def.grain = vnorm(qrot(xf.q, grainLocal));
    const tess = o.tess ?? (isSheet ? 0.04 : 0);
    if (tess > 0) def.tessCell = tess;
    if (o.supported) def.supported = true;
    if (o.strength !== undefined) def.strength = o.strength;
    if (o.mass !== undefined) def.mass = o.mass;
    if (o.noCollide) def.noCollide = true;
    if (o.tags?.length) def.tags = o.tags.slice();
    return this.addPart(def);
  }

  private grainVec(g: PartOpts["grain"], size?: Vec3): Vec3 | undefined {
    if (g === "x") return v3(1, 0, 0);
    if (g === "y") return v3(0, 1, 0);
    if (g === "z") return v3(0, 0, 1);
    if (g) {
      const v = vnorm(vec(g));
      if (vlen(v) < 0.5) throw new Error(`${this.type}: zero grain vector`);
      return v;
    }
    if (size) {
      if (size.x >= size.y && size.x >= size.z) return v3(1, 0, 0);
      if (size.y >= size.z) return v3(0, 1, 0);
      return v3(0, 0, 1);
    }
    return undefined;
  }

  /** Grain for a part: explicit option, else the longest local axis for wood, else none. */
  private grainFor(mat: MaterialId, o: PartOpts, size: Vec3): Vec3 | undefined {
    if (o.grain) return this.grainVec(o.grain);
    return MATERIALS[mat].mode === "splinter" ? this.grainVec(undefined, size) : undefined;
  }

  private static extentOf(pts: readonly Vec3[]): Vec3 {
    let nx = Infinity,
      ny = Infinity,
      nz = Infinity,
      xx = -Infinity,
      xy = -Infinity,
      xz = -Infinity;
    for (const p of pts) {
      nx = Math.min(nx, p.x);
      ny = Math.min(ny, p.y);
      nz = Math.min(nz, p.z);
      xx = Math.max(xx, p.x);
      xy = Math.max(xy, p.y);
      xz = Math.max(xz, p.z);
    }
    return v3(xx - nx, xy - ny, xz - nz);
  }

  private checkPositive(what: string, ...xs: number[]): void {
    for (const x of xs) if (!(x > 0) || !Number.isFinite(x)) throw new Error(`${this.type}: ${what} must be positive and finite (got ${xs.join(", ")})`);
  }

  /** Box part. `size` = full extents; `pos` = centre in the current frame. */
  box(name: string, mat: MaterialId, surf: SurfaceName, size: V3, pos: V3, o: PartOpts = {}): string {
    const sz = vec(size);
    this.checkPositive(`box '${name}' size`, sz.x, sz.y, sz.z);
    const isWood = MATERIALS[mat].mode === "splinter";
    const grain = isWood || o.grain ? this.grainVec(o.grain, sz) : undefined;
    const [ou, ov] = this.uvOffset(o.uvOffset);
    const attrs: FaceAttr[] = FACE_ORDER.map((k) => {
      const spec = o.faces?.[k];
      const n = FACE_N[k];
      const endFace = !!grain && Math.abs(vdot(n, grain)) > 0.9;
      const useEnd = endFace && isWood && (o.endGrain ?? true) && !spec?.surf;
      const sname: SurfaceName = spec?.surf ?? (useEnd ? "wood_fiber" : surf);
      const a = this.attr(sname, spec?.tint ?? o.tint ?? 0xffffff, 0);
      a.uv = autoUV(n, ou, ov, grain);
      return a;
    });
    const poly = polyBox(sz, attrs);
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Box with chamfered edges (single convex part). */
  bevelBox(name: string, mat: MaterialId, surf: SurfaceName, size: V3, bevel: number, pos: V3, o: PartOpts = {}): string {
    const sz = vec(size);
    this.checkPositive(`bevelBox '${name}' size`, sz.x, sz.y, sz.z);
    const bv = Math.max(0, Math.min(bevel, 0.49 * Math.min(sz.x, sz.y, sz.z)));
    const tint = o.tint ?? 0xffffff,
      smooth = o.smooth ?? 0;
    const poly = this.cachedPrim(`bevel|${sz.x}|${sz.y}|${sz.z}|${bv}|${surf}|${tint}|${smooth}`, () => polyBeveledBox(sz, bv, this.attr(surf, tint, smooth)));
    const grain = this.grainFor(mat, o, sz);
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, grain, ou, ov, o.endGrain ?? true);
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Cylinder / frustum part along `axis` (default y), centred at pos. */
  cyl(name: string, mat: MaterialId, surf: SurfaceName, radius: number, height: number, pos: V3, o: CylOpts = {}): string {
    this.checkPositive(`cyl '${name}' radius/height`, radius, height);
    const tint = o.tint ?? 0xffffff,
      smooth = o.smooth ?? 1,
      capSurf = o.capSurf ?? surf,
      capTint = o.capTint ?? tint;
    const segs = Math.max(3, o.segments ?? 12);
    const key = `cyl|${radius}|${o.rTop ?? radius}|${height}|${segs}|${o.axis ?? "y"}|${surf}|${tint}|${smooth}|${capSurf}|${capTint}`;
    const poly = this.cachedPrim(key, () => {
      let axisRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
      if (o.axis === "x") axisRot = qeuler(0, 0, -90 * D2R);
      else if (o.axis === "z") axisRot = qeuler(90 * D2R, 0, 0);
      const poly0 = polyCylinder(radius, o.rTop ?? radius, height, segs, this.attr(surf, tint, smooth), this.attr(capSurf, capTint, 0));
      return polyTransform(poly0, xform(v3(), axisRot));
    });
    const axisVec = o.axis === "x" ? v3(1, 0, 0) : o.axis === "z" ? v3(0, 0, 1) : v3(0, 1, 0);
    const grain = o.grain ? this.grainVec(o.grain) : MATERIALS[mat].mode === "splinter" ? axisVec : undefined;
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, grain, ou, ov, (o.endGrain ?? true) && !o.capSurf);
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Convex hull of points given in the current frame (pos offsets them). */
  hull(name: string, mat: MaterialId, surf: SurfaceName, points: V3[], pos: V3 = [0, 0, 0], o: PartOpts = {}): string {
    if (points.length < 4) throw new Error(`${this.type}: hull '${name}' needs at least 4 points`);
    const pts = points.map(vec);
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 0);
    const poly = polyFromHull(pts, a);
    const grain = this.grainFor(mat, o, Builder.extentOf(pts));
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, grain, ou, ov, o.endGrain ?? true);
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Convex 2D profile (x,y) extruded along local Z by depth (centred). */
  prism(name: string, mat: MaterialId, surf: SurfaceName, profile: Array<[number, number]>, depth: number, pos: V3, o: PartOpts = {}): string {
    if (profile.length < 3) throw new Error(`${this.type}: prism '${name}' needs a profile of at least 3 points`);
    this.checkPositive(`prism '${name}' depth`, depth);
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 0);
    const poly = polyPrism(profile, depth, a, a);
    const ext = Builder.extentOf(profile.map(([x, y]) => v3(x, y, 0)));
    const grain = this.grainFor(mat, o, v3(ext.x, ext.y, depth));
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, grain, ou, ov, o.endGrain ?? true);
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  ellipsoid(name: string, mat: MaterialId, surf: SurfaceName, radii: V3, pos: V3, o: PartOpts & { segments?: number; rings?: number } = {}): string {
    const r = vec(radii);
    this.checkPositive(`ellipsoid '${name}' radii`, r.x, r.y, r.z);
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const poly = polyEllipsoid(r, o.segments ?? 10, o.rings ?? 6, a);
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, o.grain ? this.grainVec(o.grain) : undefined, ou, ov, false);
    return this.finishPart(name, mat, poly, pos, o, o.grain ? this.grainVec(o.grain) : undefined);
  }

  pillow(name: string, mat: MaterialId, surf: SurfaceName, size: V3, roundness: number, pos: V3, o: PartOpts = {}): string {
    const sz = vec(size);
    this.checkPositive(`pillow '${name}' size`, sz.x, sz.y, sz.z);
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const poly = polyPillow(sz, roundness, a);
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(poly, mat, undefined, ou, ov, false);
    return this.finishPart(name, mat, poly, pos, o);
  }

  /** Add a pre-made convex polyhedron given in the current frame (pos/rot offset it). */
  poly(name: string, mat: MaterialId, localPoly: ConvexPoly, pos: V3 = [0, 0, 0], o: PartOpts = {}): string {
    const copy: ConvexPoly = { verts: localPoly.verts.map((v) => ({ ...v })), faces: localPoly.faces.map((f) => ({ ...f })) };
    const grain = this.grainFor(mat, o, Builder.extentOf(copy.verts));
    const [ou, ov] = this.uvOffset(o.uvOffset);
    this.decorate(copy, mat, grain, ou, ov, o.endGrain ?? true);
    return this.finishPart(name, mat, copy, pos, o, grain);
  }

  /**
   * Thick-walled lathe (bowl, toilet bowl, vase, mug, basin) as convex tiles fused together.
   * Returns tile part names. Touching tiles (including the ring wrap-around and cap tiles) get
   * `fused` bonds; `mass` is the TOTAL mass if given.
   */
  lathe(
    prefix: string,
    mat: MaterialId,
    surfOuter: SurfaceName,
    surfInner: SurfaceName,
    opts: Omit<LatheOptions, "outer" | "inner" | "edge" | "xf"> & TiledOpts & { pos?: V3; edgeSurf?: SurfaceName; innerTint?: number },
  ): string[] {
    const tint = opts.tint ?? 0xffffff;
    if (opts.profile.length < 2) throw new Error(`${this.type}: lathe '${prefix}' needs >= 2 profile points`);
    this.checkPositive(`lathe '${prefix}' thickness`, opts.thickness);
    const tiles = latheTiles({
      profile: opts.profile,
      thickness: opts.thickness,
      segments: Math.max(3, opts.segments),
      angleStart: opts.angleStart,
      angleEnd: opts.angleEnd,
      capBottom: opts.capBottom,
      outer: this.attr(surfOuter, tint, 1),
      inner: this.attr(surfInner, opts.innerTint ?? tint, 2),
      edge: this.attr(opts.edgeSurf ?? surfOuter, tint, 0),
    });
    return this.addTiles(prefix, mat, tiles, opts.pos ?? [0, 0, 0], opts);
  }

  /** Ring / torus tiles (toilet seat, pipe elbow). `arc` in degrees (default full ring). */
  torus(prefix: string, mat: MaterialId, surf: SurfaceName, majorR: number, minorR: number, segments: number, sides: number, pos: V3, o: TiledOpts & { arc?: number } = {}): string[] {
    this.checkPositive(`torus '${prefix}' radii`, majorR, minorR);
    const tiles = torusTiles(majorR, minorR, Math.max(3, segments), Math.max(3, sides), this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1), undefined, o.arc !== undefined ? o.arc * D2R : undefined);
    return this.addTiles(prefix, mat, tiles, pos, o);
  }

  arcPanel(
    prefix: string,
    mat: MaterialId,
    surfOuter: SurfaceName,
    surfInner: SurfaceName,
    radius: number,
    arcDeg: number,
    height: number,
    thickness: number,
    segments: number,
    pos: V3,
    o: TiledOpts = {},
  ): string[] {
    this.checkPositive(`arcPanel '${prefix}' dims`, radius, arcDeg, height, thickness);
    const tiles = arcPanelTiles(
      radius,
      arcDeg * D2R,
      height,
      thickness,
      Math.max(1, segments),
      this.attr(surfOuter, o.tint ?? 0xffffff, 1),
      this.attr(surfInner, o.tint ?? 0xffffff, 2),
      this.attr(surfOuter, o.tint ?? 0xffffff, 0),
    );
    return this.addTiles(prefix, mat, tiles, pos, o);
  }

  /** Add pre-made tiles (local to the current frame + pos) and fuse every pair sharing a face. */
  addTiles(prefix: string, mat: MaterialId, tiles: Tile[], pos: V3, o: TiledOpts = {}): string[] {
    if (!tiles.length) {
      this.warn(`addTiles '${this.n(prefix)}': primitive produced no tiles`);
      return [];
    }
    const [ou, ov] = this.uvOffset(o.uvOffset);
    const grain = o.grain ? this.grainVec(o.grain) : undefined;
    let vols: number[] | null = null;
    let totalV = 0;
    if (o.mass !== undefined) {
      vols = tiles.map((t) => Math.max(0, polyVolume(t.poly)));
      totalV = vols.reduce((s, x) => s + x, 0);
    }
    const names: string[] = [];
    tiles.forEach((t, k) => {
      const poly = this.decorate(t.poly, mat, grain, ou, ov, o.endGrain ?? true);
      let nm = `${prefix}_${t.i}_${t.j}`;
      if (this.partIndex.has(this.n(nm))) nm = `${nm}_${k}`;
      const mass = vols && totalV > 0 ? (o.mass! * vols[k]) / totalV : undefined;
      const po: PartOpts = { ...o, mass, uvOffset: [ou, ov] };
      names.push(this.finishPart(nm, mat, poly, pos, po, grain));
    });
    this.fuseTouching(names, o.seam ?? "fused", o.seamStrength);
    return names;
  }

  /**
   * Bond every pair of the given parts that share a real face (not just an edge/corner). Used for
   * tile sets: works for any tile indexing (ring wrap-around, cap tiles, partial lathes).
   */
  fuseTouching(names: string[], kind: BondKind = "fused", strength?: number, tol?: number): number {
    const defs = names.map((n) => this.get(n));
    const polys = defs.map((d) => d.poly);
    const boxes = polys.map(aabbOf);
    const vols = polys.map((p) => Math.max(1e-12, polyVolume(p)));
    const bonded = new Set(this.bonds.map((b) => pairKey(b.a, b.b)));
    let count = 0;
    for (const [i, j] of overlappingPairs(boxes, tol ?? 1e-4)) {
      const A = defs[i].name,
        B = defs[j].name;
      if (bonded.has(pairKey(A, B))) continue;
      const size = Math.min(boxSize(boxes[i]), boxSize(boxes[j]));
      const c = polyContact(polys[i], polys[j], tol ?? Math.max(1e-5, 2e-3 * size));
      if (!c || c.kind !== "face") continue;
      const ref = Math.pow(Math.min(vols[i], vols[j]), 2 / 3);
      if (c.area < 0.02 * ref) continue; // edge/corner neighbours share no real face
      const def: BondDef = { a: A, b: B, kind, anchor: c.point };
      if (strength !== undefined) def.strength = strength;
      this.bonds.push(def);
      bonded.add(pairKey(A, B));
      count++;
    }
    return count;
  }

  /**
   * Tube swept along a polyline (current frame) as convex mitred segments — cables, pipes,
   * handles, rails, rings. Consecutive segments share their joint face and are bonded with
   * `joint` (default fused). Returns segment names `${prefix}_${i}`.
   */
  tube(prefix: string, mat: MaterialId, surf: SurfaceName, points: V3[], radius: number, o: TubeOpts = {}): string[] {
    const segs = tubeSegments(points.map(vec), radius, o.sides ?? 8, !!o.closed);
    const [ou, ov] = this.uvOffset(o.uvOffset);
    const totalLen = segs.reduce((s, g) => s + g.length, 0);
    const side = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const cap = this.attr(o.capSurf ?? surf, o.tint ?? 0xffffff, 0);
    const wood = MATERIALS[mat].mode === "splinter";
    const names: string[] = [];
    segs.forEach((s, i) => {
      const dir = s.dir;
      const poly = polyFromHull(s.points, (nrm: Vec3) => (Math.abs(vdot(nrm, dir)) > 0.5 ? cap : side));
      const grain = o.grain ? this.grainVec(o.grain) : wood ? dir : undefined;
      this.decorate(poly, mat, grain, ou, ov, o.endGrain ?? true);
      let mass: number | undefined;
      if (o.kgPerM !== undefined) mass = o.kgPerM * s.length;
      else if (o.mass !== undefined && totalLen > 0) mass = (o.mass * s.length) / totalLen;
      names.push(this.finishPart(`${prefix}_${i}`, mat, poly, o.pos ?? [0, 0, 0], { ...o, mass, uvOffset: [ou, ov] }, grain));
    });
    if (o.joint !== null) {
      const kind = o.joint ?? "fused";
      const count = o.closed ? names.length : names.length - 1;
      for (let i = 0; i < count; i++) {
        const a = names[i],
          b = names[(i + 1) % names.length];
        if (a !== b) this.bond(a, b, kind, { strength: o.jointStrength });
      }
    }
    return names;
  }

  // ------------------------------------------------------------------ bonds
  bond(a: string, b: string, kind: BondKind, o: BondOpts = {}): void {
    if (!BOND_KINDS.has(kind)) throw new Error(`${this.type}: unknown bond kind '${kind}'`);
    const A = this.resolve(a);
    const B = b === "world" ? "world" : this.resolve(b);
    if (A === B) throw new Error(`${this.type}: self bond on '${A}'`);
    if (o.strength !== undefined && !(o.strength >= 0 && Number.isFinite(o.strength))) {
      throw new Error(`${this.type}: bond ${A}-${B} has invalid strength ${o.strength}`);
    }
    const def: BondDef = { a: A, b: B, kind, anchor: o.anchor ? this.p(o.anchor) : this.autoAnchor(A, B) };
    if (o.strength !== undefined) def.strength = o.strength;
    if (o.joint) def.joint = o.joint;
    this.bonds.push(def);
  }

  glue(a: string, b: string, strength?: number): void {
    this.bond(a, b, "glue", { strength });
  }
  /** `count` screws → strength scales with count. */
  screw(a: string, b: string, count = 1, each = 35): void {
    this.bond(a, b, "screw", { strength: each * count });
  }
  nail(a: string, b: string, count = 1, each = 30): void {
    this.bond(a, b, "nail", { strength: each * count });
  }
  dowel(a: string, b: string, count = 1, each = 40): void {
    this.bond(a, b, "dowel", { strength: each * count });
  }
  weld(a: string, b: string, strength?: number): void {
    this.bond(a, b, "weld", { strength });
  }
  bolt(a: string, b: string, strength?: number): void {
    this.bond(a, b, "bolt", { strength });
  }
  press(a: string, b: string, strength?: number): void {
    this.bond(a, b, "press", { strength });
  }
  clip(a: string, b: string, strength?: number): void {
    this.bond(a, b, "clip", { strength });
  }
  fuse(a: string, b: string, strength?: number): void {
    this.bond(a, b, "fused", { strength });
  }
  mortar(a: string, b: string, strength?: number): void {
    this.bond(a, b, "mortar", { strength });
  }
  /** Resting/wedged contact that moves as one until disturbed. */
  friction(a: string, b: string, strength?: number): void {
    this.bond(a, b, "friction", { strength });
  }

  /** Anchor a part to the building (static until the bond breaks). Anchor in the current frame. */
  world(a: string, kind: BondKind = "screw", strength?: number, anchor?: V3): void {
    this.bond(a, "world", kind, { strength, anchor });
  }

  private resolveFixed(fixed: string | string[], count: number): string[] {
    const list = Array.isArray(fixed) ? fixed : new Array<string>(count).fill(fixed);
    if (list.length !== count) throw new Error(`${this.type}: ${list.length} fixed parts for ${count} pivots`);
    return list.map((f) => (f === "world" ? "world" : this.resolve(f)));
  }

  /** Point of `part` farthest from the axis line, brought level with the pivots' centre. */
  private farEdgePoint(part: string, pivots: Vec3[], axis: Vec3): Vec3 {
    const c = vscale(pivots.reduce((s, p) => vadd(s, p), v3()), 1 / pivots.length);
    let best = c,
      bestD = -1;
    for (const v of this.get(part).poly.verts) {
      const r = vsub(v, c);
      const perp = vsub(r, vscale(axis, vdot(r, axis)));
      const d = vlen(perp);
      if (d > bestD) {
        bestD = d;
        best = vadd(c, perp);
      }
    }
    return best;
  }

  /**
   * Hinged part (door/lid). One hinge bond per pivot, grouped into one constraint; `fixed` may
   * list one part per pivot. Returns the joint group id (for motors / extra hinge() calls).
   */
  hinge(moving: string, fixed: string | string[], h: HingeSpec): string {
    if (!h.pivots.length) throw new Error(`${this.type}: hinge on '${moving}' has no pivots`);
    if (!(h.max >= h.min) || !Number.isFinite(h.min) || !Number.isFinite(h.max)) throw new Error(`${this.type}: hinge on '${moving}' has bad limits ${h.min}..${h.max}`);
    const mv = this.resolve(moving);
    const fx = this.resolveFixed(fixed, h.pivots.length);
    const axis = this.d(h.axis);
    if (vlen(axis) < 0.5) throw new Error(`${this.type}: hinge on '${mv}' has a zero axis`);
    const group = h.group ?? `${mv}#hinge${this.groupCounter++}`;
    const pivots = h.pivots.map((pv) => this.p(pv));
    pivots.forEach((pivot, k) => {
      const joint: JointDef = { axis, pivot, min: h.min * D2R, max: h.max * D2R, group };
      if (h.friction !== undefined) joint.friction = h.friction;
      if (h.spring !== undefined) joint.spring = h.spring;
      const def: BondDef = { a: mv, b: fx[k], kind: "hinge", anchor: pivot, joint };
      if (h.strength !== undefined) def.strength = h.strength;
      this.bonds.push(def);
    });
    if (h.latch !== undefined) {
      const lp = h.latchPart ? this.resolve(h.latchPart) : mv;
      const lf = h.latchFixed ? (h.latchFixed === "world" ? "world" : this.resolve(h.latchFixed)) : fx[0];
      const anchor = h.latchPos ? this.p(h.latchPos) : this.farEdgePoint(lp, pivots, axis);
      this.bonds.push({ a: lp, b: lf, kind: "latch", strength: h.latch, anchor, joint: { axis, pivot: pivots[0], min: 0, max: 0, group } });
    }
    return group;
  }

  /** Sliding part (drawer). One slider bond per pivot (left/right runners), grouped. Returns the group id. */
  slider(moving: string, fixed: string | string[], s: SliderSpec): string {
    if (!s.pivots.length) throw new Error(`${this.type}: slider on '${moving}' has no pivots`);
    if (!(s.max >= s.min) || !Number.isFinite(s.min) || !Number.isFinite(s.max)) throw new Error(`${this.type}: slider on '${moving}' has bad limits ${s.min}..${s.max}`);
    const mv = this.resolve(moving);
    const fx = this.resolveFixed(fixed, s.pivots.length);
    const axis = this.d(s.axis);
    if (vlen(axis) < 0.5) throw new Error(`${this.type}: slider on '${mv}' has a zero axis`);
    const group = s.group ?? `${mv}#slide${this.groupCounter++}`;
    const pivots = s.pivots.map((pv) => this.p(pv));
    pivots.forEach((pivot, k) => {
      const joint: JointDef = { axis, pivot, min: s.min, max: s.max, group };
      if (s.friction !== undefined) joint.friction = s.friction;
      const def: BondDef = { a: mv, b: fx[k], kind: "slider", anchor: pivot, joint };
      if (s.strength !== undefined) def.strength = s.strength;
      this.bonds.push(def);
    });
    if (s.latch !== undefined) {
      const lp = s.latchPart ? this.resolve(s.latchPart) : mv;
      const lf = s.latchFixed ? (s.latchFixed === "world" ? "world" : this.resolve(s.latchFixed)) : fx[0];
      let anchor: Vec3;
      if (s.latchPos) anchor = this.p(s.latchPos);
      else {
        const bb = aabbOf(this.get(lp).poly);
        anchor = vscale(vadd(bb.min, bb.max), 0.5);
      }
      this.bonds.push({ a: lp, b: lf, kind: "latch", strength: s.latch, anchor, joint: { axis, pivot: pivots[0], min: 0, max: 0, group } });
    }
    return group;
  }

  /**
   * Bond every pair of (not yet bonded) parts whose hulls touch within `tol` metres: face
   * contacts, line contacts (unless opts.allowEdge === false) and interpenetrating parts.
   * Parts tagged 'loose' or 'noauto' are skipped. `filter` restricts pairs (full names);
   * `strength` may be a function of the contact (e.g. glue strength from area).
   */
  autoBond(
    kind: BondKind,
    strength?: number | ((a: string, b: string, c: Contact) => number | undefined),
    tol = 0.003,
    filter?: (a: string, b: string) => boolean,
    opts: AutoBondOpts = {},
  ): number {
    if (!BOND_KINDS.has(kind)) throw new Error(`${this.type}: unknown bond kind '${kind}'`);
    const pool = (opts.parts ? opts.parts.map((p) => this.resolve(p)) : this.parts.map((p) => p.name)).filter((n) => {
      const t = this.partIndex.get(n)!.tags;
      return !t || (!t.includes("loose") && !t.includes("noauto"));
    });
    const bonded = new Set(this.bonds.filter((b) => b.b !== "world").map((b) => pairKey(b.a, b.b)));
    const polys = pool.map((n) => this.partIndex.get(n)!.poly);
    const boxes = polys.map(aabbOf);
    const minArea = opts.minArea ?? 1e-6;
    const minLength = opts.minLength ?? 0.005;
    let count = 0;
    for (const [i, j] of overlappingPairs(boxes, tol)) {
      const A = pool[i],
        B = pool[j];
      if (bonded.has(pairKey(A, B))) continue;
      if (filter && !filter(A, B)) continue;
      const c = polyContact(polys[i], polys[j], tol);
      if (!c) continue;
      const ok = c.penetrating || c.area >= minArea || (opts.allowEdge !== false && c.length >= minLength);
      if (!ok) continue;
      const s = typeof strength === "function" ? strength(A, B, c) : strength;
      if (s !== undefined && !(s >= 0 && Number.isFinite(s))) throw new Error(`${this.type}: autoBond strength ${s} for ${A}-${B}`);
      const def: BondDef = { a: A, b: B, kind, anchor: c.point };
      if (s !== undefined) def.strength = s;
      this.bonds.push(def);
      bonded.add(pairKey(A, B));
      count++;
    }
    return count;
  }

  /** Contact between two parts within `tol` (null if farther apart). */
  contact(a: string, b: string, tol = 0.003): Contact | null {
    return polyContact(this.get(a).poly, this.get(b).poly, tol);
  }

  /** Filter for autoBond: both parts' full names start with one of the given (current-frame) prefixes. */
  within(...prefixes: string[]): (a: string, b: string) => boolean {
    const full = prefixes.map((p) => this.n(p));
    return (a, b) => full.some((p) => a.startsWith(p)) && full.some((p) => b.startsWith(p));
  }

  // ------------------------------------------------------------------ features
  /** Raw feature (positions/directions must already be in assembly space; prefer the helpers). */
  feature(f: FeatureDef): void {
    const g = f as FeatureDef & { part: string };
    this.features.push({ ...g, part: this.resolve(g.part) } as FeatureDef);
  }

  light(o: { part: string; pos: V3; kind?: "point" | "spot"; dir?: V3; color?: number; intensity?: number; range?: number; angle?: number; castShadows?: boolean; mains?: boolean; on?: boolean }): void {
    const f: FeatureDef = {
      type: "light",
      part: o.part,
      pos: this.p(o.pos),
      kind: o.kind ?? "point",
      color: o.color ?? 0xffe2b8,
      intensity: o.intensity ?? 1,
      range: o.range ?? 6,
      mains: o.mains ?? true,
      on: o.on ?? true,
    };
    if (o.dir) f.dir = this.d(o.dir);
    if (o.angle !== undefined) f.angle = o.angle;
    if (o.castShadows !== undefined) f.castShadows = o.castShadows;
    this.feature(f);
  }

  water(part: string, pos: V3, dir: V3, pressure = 0.7, litres?: number): void {
    const f: FeatureDef = { type: "water", part, pos: this.p(pos), dir: this.d(dir), pressure };
    if (litres !== undefined) f.litres = litres;
    this.feature(f);
  }

  sparks(part: string, chance?: number): void {
    const f: FeatureDef = { type: "sparks", part };
    if (chance !== undefined) f.chance = chance;
    this.feature(f);
  }

  screen(part: string, content: "tv" | "monitor" | "laptop" | "phone" | "microwave", o: { on?: boolean; mains?: boolean } = {}): void {
    const f: FeatureDef = { type: "screen", part, content };
    if (o.on !== undefined) f.on = o.on;
    if (o.mains !== undefined) f.mains = o.mains;
    this.feature(f);
  }

  stuffing(part: string, kind: "feathers" | "foam" | "fiber" | "paper"): void {
    this.feature({ type: "stuffing", part, kind });
  }

  liquid(part: string, color: number, litres: number): void {
    this.feature({ type: "liquid", part, color, litres });
  }

  soil(part: string): void {
    this.feature({ type: "soil", part });
  }

  power(part: string): void {
    this.feature({ type: "power", part });
  }

  /** Motor driving a hinge group (ceiling fan, turntable). `joint` = the id returned by hinge(). */
  motor(part: string, joint: string, speed: number, mains = true): void {
    this.feature({ type: "motor", part, joint, speed, mains });
  }

  hum(part: string, sound: string, mains = true): void {
    this.feature({ type: "hum", part, sound, mains });
  }

  alarm(part: string, sound: string): void {
    this.feature({ type: "alarm", part, sound });
  }

  // ------------------------------------------------------------------ queries
  has(name: string): boolean {
    return this.partIndex.has(this.n(name)) || this.partIndex.has(name);
  }

  /** Part definition by (local or full) name. */
  get(name: string): PartDef {
    return this.partIndex.get(this.resolve(name))!;
  }

  /** Add tags to an existing part (e.g. 'loose', 'noauto', 'switch:living'). */
  tag(name: string, ...tags: string[]): void {
    const p = this.get(name);
    const t = p.tags ? p.tags.slice() : [];
    for (const x of tags) if (!t.includes(x)) t.push(x);
    p.tags = t;
  }

  private partMass(p: PartDef): number {
    return p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
  }

  /** Mass in kg of the whole assembly (or a single part). */
  mass(part?: string): number {
    if (part) return this.partMass(this.get(part));
    let m = 0;
    for (const p of this.parts) m += this.partMass(p);
    return m;
  }

  partNames(): string[] {
    return this.parts.map((p) => p.name);
  }

  /** Bonds touching a part (copies). */
  bondsOf(name: string): BondDef[] {
    const n = this.resolve(name);
    return this.bonds.filter((b) => b.a === n || b.b === n).map((b) => ({ ...b }));
  }

  /** Resolve a local (current prefix) or full part name; throws if unknown. */
  resolve(name: string): string {
    if (name === "world") return name;
    const full = this.n(name);
    if (this.partIndex.has(full)) return full;
    if (this.partIndex.has(name)) return name;
    throw new Error(`${this.type}: unknown part '${name}' (prefix '${this.frame.prefix}')`);
  }

  /** Record a builder warning (also used by kit helpers). */
  warn(msg: string): void {
    this.warnings.push(msg);
  }

  /** Summary for tests and tuning: mass, counts, bounds, warnings, mass per material. */
  info(): BuildInfo {
    const byMaterial: Record<string, number> = {};
    let mass = 0;
    const min = v3(Infinity, Infinity, Infinity),
      max = v3(-Infinity, -Infinity, -Infinity);
    for (const p of this.parts) {
      const m = this.partMass(p);
      mass += m;
      byMaterial[p.mat] = (byMaterial[p.mat] ?? 0) + m;
      const b = aabbOf(p.poly);
      min.x = Math.min(min.x, b.min.x);
      min.y = Math.min(min.y, b.min.y);
      min.z = Math.min(min.z, b.min.z);
      max.x = Math.max(max.x, b.max.x);
      max.y = Math.max(max.y, b.max.y);
      max.z = Math.max(max.z, b.max.z);
    }
    if (!this.parts.length) {
      min.x = min.y = min.z = 0;
      max.x = max.y = max.z = 0;
    }
    const groups = new Set<string>();
    for (const b of this.bonds) if ((b.kind === "hinge" || b.kind === "slider") && b.joint?.group) groups.add(b.joint.group);
    return {
      mass,
      parts: this.parts.length,
      bonds: this.bonds.length,
      bbox: { min, max, size: vsub(max, min) },
      features: this.features.length,
      joints: groups.size,
      warnings: this.warnings.slice(),
      byMaterial,
    };
  }

  private autoAnchor(a: string, b: string): Vec3 {
    const A = this.partIndex.get(a)!.poly;
    if (b === "world") {
      // lowest-centre point of the part (typical floor contact); pass explicit anchors for walls
      const bb = aabbOf(A);
      return v3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    }
    const c = polyContact(A, this.partIndex.get(b)!.poly, Infinity, true);
    if (c && isFiniteVec(c.point)) return c.point;
    const ba = aabbOf(A);
    return vscale(vadd(ba.min, ba.max), 0.5);
  }

  // ------------------------------------------------------------------ build
  /**
   * Validate and return the AssemblyDef. Errors throw; warnings are handled per
   * Builder.warnMode. Validation depth: `o.validate` ?? Builder.validation.
   */
  build(o: { validate?: ValidationLevel } = {}): AssemblyDef {
    const { errors, warnings } = this.validate((o.validate ?? Builder.validation) === "full");
    if (errors.length) throw new Error(`${this.type}: invalid assembly:\n  ${errors.join("\n  ")}`);
    for (const w of warnings) if (!this.warnings.includes(w)) this.warnings.push(w);
    if (this.warnings.length) {
      if (Builder.warnMode === "throw") throw new Error(`${this.type}: assembly warnings:\n  ${this.warnings.join("\n  ")}`);
      if (Builder.warnMode === "console") for (const w of this.warnings) console.warn(`[builder] ${this.type}: ${w}`);
    }
    const def: AssemblyDef = {
      type: this.type,
      name: this.name,
      category: this.category,
      value: this.value,
      parts: this.parts.slice(),
      bonds: this.bonds.slice(),
      features: this.features.slice(),
    };
    if (this.room !== undefined) def.room = this.room;
    if (this.startAsleep !== undefined) def.startAsleep = this.startAsleep;
    return def;
  }

  private validate(full: boolean): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.parts.length) errors.push("assembly has no parts");

    // ---- parts
    const boxes: Aabb[] = [];
    const vols: number[] = [];
    for (const p of this.parts) {
      const bad = polyProblem(p.poly);
      if (bad) errors.push(`part '${p.name}': ${bad}`);
      const box = aabbOf(p.poly);
      boxes.push(box);
      const v = bad ? 0 : polyVolume(p.poly);
      vols.push(v);
      if (!(v > 1e-9)) {
        errors.push(`part '${p.name}' has degenerate volume ${v}`);
        continue;
      }
      if (full) {
        const thin = polyExtents(p.poly).ext[2];
        if (thin < 3e-4) warnings.push(`part '${p.name}' is only ${(thin * 1000).toFixed(2)} mm thick — too thin to simulate reliably`);
      }
      if (p.mass !== undefined) {
        if (!(p.mass > 0) || !Number.isFinite(p.mass)) errors.push(`part '${p.name}' has invalid mass override ${p.mass}`);
        else {
          const rho = p.mass / v;
          if (rho < 1 || rho > 25000) warnings.push(`part '${p.name}': mass override ${p.mass.toFixed(3)} kg implies an absurd density of ${rho.toFixed(0)} kg/m³`);
        }
      }
      const m = this.partMass(p);
      if (m > (this.category === "structure" ? 20000 : 1500)) warnings.push(`part '${p.name}' weighs ${m.toFixed(0)} kg — check its size/material`);
      if (m < 2e-4) warnings.push(`part '${p.name}' weighs only ${(m * 1000).toFixed(2)} g — too small to simulate; merge it into a neighbour`);
      if (p.grain && (!isFiniteVec(p.grain) || Math.abs(vlen(p.grain) - 1) > 1e-3)) errors.push(`part '${p.name}' has an invalid grain vector`);
      if (p.strength !== undefined && !(p.strength > 0 && Number.isFinite(p.strength))) errors.push(`part '${p.name}' has invalid strength ${p.strength}`);
      if (p.tessCell !== undefined && !(p.tessCell >= 0 && Number.isFinite(p.tessCell))) errors.push(`part '${p.name}' has invalid tessCell ${p.tessCell}`);
    }
    const total = this.parts.reduce((s, p, i) => s + (vols[i] > 0 ? this.partMass(p) : 0), 0);
    if (this.category !== "structure" && total > 3000) warnings.push(`assembly weighs ${total.toFixed(0)} kg — check dimensions/materials`);

    // ---- bonds
    const bondedParts = new Set<string>();
    const groups = new Map<string, { kind: BondKind; axis: Vec3; min: number; max: number; pivots: Vec3[] }>();
    const latchGroups: Array<{ group: string; tag: string }> = [];
    const seen = new Map<string, number>();
    for (const b of this.bonds) {
      const tag = `${b.kind} bond '${b.a}'–'${b.b}'`;
      const A = this.partIndex.get(b.a);
      const B = b.b === "world" ? null : this.partIndex.get(b.b);
      if (!BOND_KINDS.has(b.kind)) errors.push(`${tag}: unknown bond kind`);
      if (!A) errors.push(`bond references unknown part '${b.a}'`);
      if (b.b !== "world" && !B) errors.push(`bond references unknown part '${b.b}'`);
      if (b.a === b.b) errors.push(`${tag}: self bond`);
      if (b.strength !== undefined && !(b.strength >= 0 && Number.isFinite(b.strength))) errors.push(`${tag}: invalid strength ${b.strength}`);
      if (b.anchor !== undefined && !isFiniteVec(b.anchor)) errors.push(`${tag}: non-finite anchor`);
      const isJoint = b.kind === "hinge" || b.kind === "slider" || b.kind === "latch";
      if (isJoint && !b.joint) errors.push(`joint bond ${b.a}-${b.b} lacks joint def`);
      if (b.joint) {
        const j = b.joint;
        if (!isFiniteVec(j.axis) || Math.abs(vlen(j.axis) - 1) > 1e-3) errors.push(`${tag}: joint axis must be a unit vector`);
        if (!isFiniteVec(j.pivot)) errors.push(`${tag}: non-finite joint pivot`);
        if (!Number.isFinite(j.min) || !Number.isFinite(j.max) || j.min > j.max) errors.push(`${tag}: bad joint limits ${j.min}..${j.max}`);
        if (b.kind === "latch") {
          if (!j.group) errors.push(`${tag}: latch without a joint group`);
          else latchGroups.push({ group: j.group, tag });
        }
      }
      bondedParts.add(b.a);
      bondedParts.add(b.b);
      if (!A || (b.b !== "world" && !B)) continue;

      if ((b.kind === "hinge" || b.kind === "slider") && b.joint && isFiniteVec(b.joint.pivot)) {
        const dA = polyPointDist(A.poly, b.joint.pivot);
        const dB = B ? polyPointDist(B.poly, b.joint.pivot) : Infinity;
        if (dA > 0.05 && dB > 0.05) warnings.push(`${tag}: joint pivot is ${(Math.min(dA, dB) * 100).toFixed(1)} cm from both parts`);
        const g = b.joint.group ?? `${b.a}|${b.b}|${b.kind}`;
        const e = groups.get(g);
        if (!e) groups.set(g, { kind: b.kind, axis: b.joint.axis, min: b.joint.min, max: b.joint.max, pivots: [b.joint.pivot] });
        else {
          if (e.kind !== b.kind) errors.push(`joint group '${g}' mixes ${e.kind} and ${b.kind} bonds`);
          if (Math.abs(vdot(e.axis, b.joint.axis)) < 0.999) warnings.push(`joint group '${g}': bonds have different axes`);
          if (Math.abs(e.min - b.joint.min) > 1e-6 || Math.abs(e.max - b.joint.max) > 1e-6) warnings.push(`joint group '${g}': bonds have different limits`);
          e.pivots.push(b.joint.pivot);
        }
      } else if (b.kind !== "latch") {
        if (full && B && !polyContact(A.poly, B.poly, 0.02)) warnings.push(`${tag}: the parts are more than 2 cm apart`);
        if (full && b.anchor && isFiniteVec(b.anchor)) {
          const dA = polyPointDist(A.poly, b.anchor);
          const dB = B ? polyPointDist(B.poly, b.anchor) : 0;
          if (dA > 0.03 || dB > 0.03) warnings.push(`${tag}: anchor is ${(Math.max(dA, dB) * 100).toFixed(1)} cm away from a bonded part`);
        }
        const key = `${pairKey(b.a, b.b)}|${b.kind}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of seen) if (n > 1) warnings.push(`${n} duplicate ${key.split("|")[2]} bonds between '${key.split("|")[0]}' and '${key.split("|")[1]}' — merge them into one bond with the summed strength`);
    for (const [g, e] of groups) {
      if (e.kind !== "hinge" || e.pivots.length < 2) continue;
      const p0 = e.pivots[0];
      for (const p of e.pivots) {
        const r = vsub(p, p0);
        const off = vlen(vsub(r, vscale(e.axis, vdot(r, e.axis))));
        if (off > 0.005) warnings.push(`hinge group '${g}': pivots are not on one axis (${(off * 1000).toFixed(1)} mm off)`);
      }
    }
    for (const l of latchGroups) if (!groups.has(l.group)) errors.push(`${l.tag}: latch group '${l.group}' has no hinge/slider bonds`);

    // ---- features
    for (const f of this.features) {
      const part = (f as { part: string }).part;
      const P = this.partIndex.get(part);
      if (!P) {
        errors.push(`feature ${f.type} references unknown part '${part}'`);
        continue;
      }
      if (f.type === "light" || f.type === "water") {
        if (!isFiniteVec(f.pos)) errors.push(`feature ${f.type} on '${part}' has a non-finite position`);
        else if (polyPointDist(P.poly, f.pos) > 0.5) warnings.push(`feature ${f.type} on '${part}' is ${polyPointDist(P.poly, f.pos).toFixed(2)} m from its part`);
        const dir = f.type === "water" ? f.dir : f.dir;
        if (dir !== undefined && (!isFiniteVec(dir) || vlen(dir) < 0.5)) errors.push(`feature ${f.type} on '${part}' has an invalid direction`);
      }
      if (f.type === "motor" && !groups.has(f.joint)) errors.push(`motor feature on '${part}' drives unknown joint group '${f.joint}'`);
      if (f.type === "liquid" && !(f.litres > 0)) errors.push(`liquid feature on '${part}' needs litres > 0`);
      if (f.type === "water" && !(f.pressure >= 0 && f.pressure <= 1)) errors.push(`water feature on '${part}' needs pressure in 0..1`);
    }

    // ---- connectivity
    const loose = (p: PartDef): boolean => !!p.tags?.includes("loose");
    if (this.parts.length > 1) {
      for (const p of this.parts) if (!bondedParts.has(p.name) && !loose(p)) errors.push(`part '${p.name}' has no bonds (tag it 'loose' if intentional)`);
      const idx = new Map<string, number>(this.parts.map((p, i) => [p.name, i]));
      const parent = this.parts.map((_, i) => i);
      parent.push(this.parts.length); // world node
      const find = (i: number): number => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]];
          i = parent[i];
        }
        return i;
      };
      for (const b of this.bonds) {
        const ia = idx.get(b.a);
        const ib = b.b === "world" ? this.parts.length : idx.get(b.b);
        if (ia === undefined || ib === undefined) continue;
        const ra = find(ia),
          rb = find(ib);
        if (ra !== rb) parent[ra] = rb;
      }
      const comps = new Map<number, string[]>();
      this.parts.forEach((p, i) => {
        if (loose(p) || !bondedParts.has(p.name)) return;
        const r = find(i);
        const list = comps.get(r);
        if (list) list.push(p.name);
        else comps.set(r, [p.name]);
      });
      if (comps.size > 1) {
        const desc = [...comps.values()].map((l) => `[${l.slice(0, 3).join(", ")}${l.length > 3 ? `, +${l.length - 3}` : ""}]`).join(" ");
        warnings.push(`assembly falls apart into ${comps.size} unconnected groups: ${desc}`);
      }
    }

    // ---- geometry relations (containment, overlap) — full validation only
    if (full && this.parts.length > 1 && !errors.length) {
      const pairs = overlappingPairs(boxes, 0);
      const rng = new Rng(0x5eed);
      for (const [i, j] of pairs) {
        const A = this.parts[i],
          B = this.parts[j];
        if (aabbContains(boxes[j], boxes[i], 1e-5) && polyInside(A.poly, B.poly, 1e-5)) {
          warnings.push(`part '${A.name}' is completely inside '${B.name}'`);
          continue;
        }
        if (aabbContains(boxes[i], boxes[j], 1e-5) && polyInside(B.poly, A.poly, 1e-5)) {
          warnings.push(`part '${B.name}' is completely inside '${A.name}'`);
          continue;
        }
        const c = polyContact(A.poly, B.poly, 0);
        if (!c || c.sep > -0.002) continue;
        const [small, big] = vols[i] <= vols[j] ? [A, B] : [B, A];
        const pts = samplePoly(small.poly, 96, rng);
        let inside = 0;
        for (const q of pts) if (polySd(big.poly, q) < -5e-4) inside++;
        const frac = pts.length ? inside / pts.length : 0;
        if (frac > 0.1) warnings.push(`parts '${small.name}' and '${big.name}' overlap (~${Math.round(frac * 100)}% of '${small.name}')`);
      }
    }
    return { errors, warnings };
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function boxSize(b: Aabb): number {
  return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
}

/** Structural sanity of a polyhedron (finite data, valid indices, unit normals). */
function polyProblem(p: ConvexPoly): string | null {
  if (!p.verts.length || p.faces.length < 4) return `polyhedron has ${p.verts.length} vertices / ${p.faces.length} faces`;
  for (const v of p.verts) if (!isFiniteVec(v)) return "non-finite vertex";
  for (const f of p.faces) {
    if (f.idx.length < 3) return "face with fewer than 3 vertices";
    for (const i of f.idx) if (!(i >= 0 && i < p.verts.length)) return "face index out of range";
    if (!isFiniteVec(f.n) || Math.abs(vlen(f.n) - 1) > 1e-3 || !Number.isFinite(f.d)) return "invalid face plane";
  }
  return null;
}
