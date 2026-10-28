// Builder DSL for destructible assemblies. Object/structure builders describe real
// construction (panels, internals, fasteners, joints) and get a validated AssemblyDef.
//
// CONVENTIONS (read before writing an object):
//  * Assembly frame: origin at the object's base centre (floor contact point), +Y up,
//    the object's FRONT (doors, screen, controls) faces +Z. The furnisher rotates it into place.
//  * Units: metres / kg. Rotations: Euler DEGREES [x, y, z] (applied yaw Y, pitch X, roll Z)
//    or a Quat.
//  * Every part must be convex. Build curved shells from tiles (lathe/torus/arc helpers).
//  * Use real dimensions and thicknesses; masses come from material densities (check b.mass()).
//  * Bond what is really attached, with the fastener that really attaches it.
//
// PURE MODULE (no Babylon imports).

import { v3, qeuler, qrot, xform, vadd, vsub, vscale, vnorm, vlen, vdot, type Vec3, type Quat, type Xform, xapply, xapplyDir } from "../../geom/vec.ts";
import {
  polyBox,
  polyBeveledBox,
  polyCylinder,
  polyPrism,
  polyFromHull,
  polyTransform,
  polyVolume,
  polyBounds,
  polyCentroid,
  polyClosestPoint,
  polySignedDist,
  autoUV,
  type ConvexPoly,
  type FaceAttr,
} from "../../geom/poly.ts";
import { latheTiles, torusTiles, arcPanelTiles, polyEllipsoid, polyPillow, type LatheOptions, type Tile } from "../../geom/primitives.ts";
import { Rng, seedFrom } from "../../core/rng.ts";
import { S, type SurfaceName } from "../../render/surfaces.ts";
import { MATERIALS, type MaterialId } from "../../destruction/model/materials.ts";
import type { AssemblyCategory, AssemblyDef, BondDef, BondKind, FeatureDef, JointDef, PartDef } from "../../destruction/model/types.ts";

export type V3 = Vec3 | [number, number, number];
export type Rot = Quat | [number, number, number];

const D2R = Math.PI / 180;

export const vec = (a: V3): Vec3 => (Array.isArray(a) ? v3(a[0], a[1], a[2]) : v3(a.x, a.y, a.z));
export const rot = (r?: Rot): Quat => {
  if (!r) return { x: 0, y: 0, z: 0, w: 1 };
  if (Array.isArray(r)) return qeuler(r[0] * D2R, r[1] * D2R, r[2] * D2R);
  return r;
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

export interface SurfSpec {
  surf?: SurfaceName;
  tint?: number;
}

export interface PartOpts {
  rot?: Rot;
  tint?: number;
  /** Per-face overrides for boxes (px = +X face, ...). */
  faces?: Partial<Record<FaceKey, SurfSpec>>;
  /** Wood grain axis in PART-LOCAL space ("x" | "y" | "z" or a vector). Default: longest box axis for wood. */
  grain?: "x" | "y" | "z" | V3;
  /** Use an end-grain surface on faces perpendicular to the grain (wood). Default true for wood. */
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
  /** Smoothing group for curved primitives (default 1 for cylinders/ellipsoids). */
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

export interface HingeSpec {
  /** One pivot per physical hinge (all on the same axis). */
  pivots: V3[];
  axis: V3;
  /** Degrees relative to the built pose. */
  min: number;
  max: number;
  /** Energy capacity per hinge (J). Default 90 (interior door), use ~30 for cabinet hinges. */
  strength?: number;
  friction?: number;
  /** Latch strength (J) holding it closed (door latch / magnetic catch / lock). Omit for none. */
  latch?: number;
  spring?: number;
}

export interface SliderSpec {
  pivots: V3[];
  axis: V3;
  /** Metres (e.g. 0 .. 0.45 for a drawer). */
  min: number;
  max: number;
  strength?: number;
  friction?: number;
}

interface GroupFrame {
  xf: Xform;
  prefix: string;
}

export class Builder {
  readonly type: string;
  readonly name: string;
  readonly category: AssemblyCategory;
  readonly value: number;
  private parts: PartDef[] = [];
  private partIndex = new Map<string, PartDef>();
  private bonds: BondDef[] = [];
  private features: FeatureDef[] = [];
  private frames: GroupFrame[] = [{ xf: xform(v3()), prefix: "" }];
  private groupCounter = 0;
  readonly rng: Rng;

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

  /** Run `fn` in a nested local frame (offset + rotation) with an optional name prefix. */
  group(offset: V3, rotation: Rot | undefined, prefix: string, fn: () => void): void {
    const parent = this.frame;
    const local = xform(vec(offset), rot(rotation));
    const xf: Xform = { p: xapply(parent.xf, local.p), q: qmulSafe(parent.xf.q, local.q) };
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

  /** Transform a local direction of the current frame to assembly space. */
  d(local: V3): Vec3 {
    return vnorm(xapplyDir(this.frame.xf, vec(local)));
  }

  // ------------------------------------------------------------------ attrs
  attr(surf: SurfaceName, tint = 0xffffff, smooth = 0): FaceAttr {
    return { surf: S[surf], tint, uv: { u: v3(), v: v3(), u0: 0, v0: 0 }, interior: false, smooth };
  }

  private uvOffset(o?: [number, number]): [number, number] {
    return o ?? [this.rng.range(0, 3), this.rng.range(0, 3)];
  }

  // ------------------------------------------------------------------ parts
  /** Register a fully specified part (poly already in assembly space). */
  addPart(def: PartDef): string {
    if (this.partIndex.has(def.name)) throw new Error(`${this.type}: duplicate part name '${def.name}'`);
    this.parts.push(def);
    this.partIndex.set(def.name, def);
    return def.name;
  }

  private finishPart(name: string, mat: MaterialId, localPoly: ConvexPoly, pos: V3, o: PartOpts, grainLocal?: Vec3): string {
    const full = this.n(name);
    const q = rot(o.rot);
    const local = xform(vec(pos), q);
    const xf: Xform = { p: xapply(this.frame.xf, local.p), q: qmulSafe(this.frame.xf.q, local.q) };
    const poly = polyTransform(localPoly, xf);
    const isSheet = mat === "steelSheet" || mat === "aluminum";
    const def: PartDef = {
      name: full,
      mat,
      poly,
      grain: grainLocal ? vnorm(qrot(xf.q, grainLocal)) : undefined,
      tessCell: o.tess ?? (isSheet ? 0.04 : 0),
      supported: o.supported,
      strength: o.strength,
      mass: o.mass,
      noCollide: o.noCollide,
      tags: o.tags,
    };
    return this.addPart(def);
  }

  private grainVec(g: PartOpts["grain"], size?: Vec3): Vec3 | undefined {
    if (g === "x") return v3(1, 0, 0);
    if (g === "y") return v3(0, 1, 0);
    if (g === "z") return v3(0, 0, 1);
    if (g) return vnorm(vec(g));
    if (size) {
      if (size.x >= size.y && size.x >= size.z) return v3(1, 0, 0);
      if (size.y >= size.z) return v3(0, 1, 0);
      return v3(0, 0, 1);
    }
    return undefined;
  }

  /** Box part. `size` = full extents; `pos` = centre in the current frame. */
  box(name: string, mat: MaterialId, surf: SurfaceName, size: V3, pos: V3, o: PartOpts = {}): string {
    const sz = vec(size);
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
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 0);
    const poly = polyBeveledBox(sz, bevel, a);
    const grain = MATERIALS[mat].mode === "splinter" ? this.grainVec(o.grain, sz) : undefined;
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Cylinder / frustum part along `axis` (default y), centred at pos. */
  cyl(name: string, mat: MaterialId, surf: SurfaceName, radius: number, height: number, pos: V3, o: CylOpts = {}): string {
    const side = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const caps = this.attr(o.capSurf ?? surf, o.capTint ?? o.tint ?? 0xffffff, 0);
    let axisRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
    if (o.axis === "x") axisRot = qeuler(0, 0, -90 * D2R);
    else if (o.axis === "z") axisRot = qeuler(90 * D2R, 0, 0);
    const poly0 = polyCylinder(radius, o.rTop ?? radius, height, o.segments ?? 12, side, caps);
    const poly = polyTransform(poly0, xform(v3(), axisRot));
    const axisVec = o.axis === "x" ? v3(1, 0, 0) : o.axis === "z" ? v3(0, 0, 1) : v3(0, 1, 0);
    const grain = MATERIALS[mat].mode === "splinter" ? (o.grain ? this.grainVec(o.grain) : axisVec) : undefined;
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Convex hull of points given in the current frame (pos offsets them). */
  hull(name: string, mat: MaterialId, surf: SurfaceName, points: V3[], pos: V3 = [0, 0, 0], o: PartOpts = {}): string {
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 0);
    const poly = polyFromHull(points.map(vec), a);
    const grain = o.grain ? this.grainVec(o.grain) : undefined;
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  /** Convex 2D profile (x,y) extruded along local Z by depth. */
  prism(name: string, mat: MaterialId, surf: SurfaceName, profile: Array<[number, number]>, depth: number, pos: V3, o: PartOpts = {}): string {
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 0);
    const poly = polyPrism(profile, depth, a, a);
    const grain = o.grain ? this.grainVec(o.grain) : undefined;
    return this.finishPart(name, mat, poly, pos, o, grain);
  }

  ellipsoid(name: string, mat: MaterialId, surf: SurfaceName, radii: V3, pos: V3, o: PartOpts & { segments?: number; rings?: number } = {}): string {
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const poly = polyEllipsoid(vec(radii), o.segments ?? 10, o.rings ?? 6, a);
    return this.finishPart(name, mat, poly, pos, o);
  }

  pillow(name: string, mat: MaterialId, surf: SurfaceName, size: V3, roundness: number, pos: V3, o: PartOpts = {}): string {
    const a = this.attr(surf, o.tint ?? 0xffffff, o.smooth ?? 1);
    const poly = polyPillow(vec(size), roundness, a);
    return this.finishPart(name, mat, poly, pos, o);
  }

  /**
   * Thick-walled lathe (bowl, toilet bowl, vase, mug, basin) as convex tiles fused together.
   * Returns tile part names. Adjacent tiles get `fused` bonds (material strength × seam area).
   */
  lathe(
    prefix: string,
    mat: MaterialId,
    surfOuter: SurfaceName,
    surfInner: SurfaceName,
    opts: Omit<LatheOptions, "outer" | "inner" | "edge" | "xf"> & { pos?: V3; rot?: Rot; tint?: number; edgeSurf?: SurfaceName; strength?: number; tags?: string[] },
  ): string[] {
    const tiles = latheTiles({
      ...opts,
      outer: this.attr(surfOuter, opts.tint ?? 0xffffff, 1),
      inner: this.attr(surfInner, opts.tint ?? 0xffffff, 2),
      edge: this.attr(opts.edgeSurf ?? surfOuter, opts.tint ?? 0xffffff, 0),
    });
    return this.addTiles(prefix, mat, tiles, opts.pos ?? [0, 0, 0], { rot: opts.rot, strength: opts.strength, tags: opts.tags });
  }

  torus(prefix: string, mat: MaterialId, surf: SurfaceName, majorR: number, minorR: number, segments: number, sides: number, pos: V3, o: PartOpts & { arc?: number } = {}): string[] {
    const tiles = torusTiles(majorR, minorR, segments, sides, this.attr(surf, o.tint ?? 0xffffff, 1), undefined, o.arc);
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
    o: PartOpts = {},
  ): string[] {
    const tiles = arcPanelTiles(
      radius,
      arcDeg * D2R,
      height,
      thickness,
      segments,
      this.attr(surfOuter, o.tint ?? 0xffffff, 1),
      this.attr(surfInner, o.tint ?? 0xffffff, 2),
      this.attr(surfOuter, o.tint ?? 0xffffff, 0),
    );
    return this.addTiles(prefix, mat, tiles, pos, o);
  }

  /** Add pre-made tiles (local to the current frame + pos) and fuse neighbours. */
  addTiles(prefix: string, mat: MaterialId, tiles: Tile[], pos: V3, o: PartOpts = {}): string[] {
    const names: string[] = [];
    const byIJ = new Map<string, string>();
    for (const t of tiles) {
      const nm = `${prefix}_${t.i}_${t.j}`;
      const full = this.finishPart(nm, mat, t.poly, pos, o);
      names.push(full);
      byIJ.set(`${t.i},${t.j}`, full);
    }
    // fuse grid neighbours (wrap-around in i is detected by geometry contact below)
    for (const t of tiles) {
      const a = byIJ.get(`${t.i},${t.j}`)!;
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ]) {
        const b = byIJ.get(`${t.i + di},${t.j + dj}`);
        if (b) this.bond(a, b, "fused");
      }
    }
    // close rings: connect last column to first if they touch
    const maxI = Math.max(...tiles.map((t) => t.i));
    for (const t of tiles) {
      if (t.i !== maxI) continue;
      const a = byIJ.get(`${t.i},${t.j}`)!;
      const b = byIJ.get(`0,${t.j}`);
      if (b && b !== a && this.touching(a, b, 0.004)) this.bond(a, b, "fused");
    }
    return names;
  }

  // ------------------------------------------------------------------ bonds
  bond(a: string, b: string, kind: BondKind, o: { strength?: number; anchor?: V3; joint?: JointDef } = {}): void {
    const A = this.resolve(a);
    const B = b === "world" ? "world" : this.resolve(b);
    if (A === B) throw new Error(`${this.type}: self bond on '${A}'`);
    this.bonds.push({ a: A, b: B, kind, strength: o.strength, anchor: o.anchor ? this.p(o.anchor) : this.autoAnchor(A, B), joint: o.joint });
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

  /** Anchor a part to the building (static until the bond breaks). */
  world(a: string, kind: BondKind = "screw", strength?: number, anchor?: V3): void {
    this.bond(a, "world", kind, { strength, anchor });
  }

  /** Hinged part (door/lid). One hinge bond per pivot, grouped into one constraint. */
  hinge(moving: string, fixed: string, h: HingeSpec): void {
    const group = `${this.n(moving)}#hinge${this.groupCounter++}`;
    const axis = this.d(h.axis);
    for (const pv of h.pivots) {
      const pivot = this.p(pv);
      this.bonds.push({
        a: this.resolve(moving),
        b: fixed === "world" ? "world" : this.resolve(fixed),
        kind: "hinge",
        strength: h.strength,
        anchor: pivot,
        joint: { axis, pivot, min: h.min * D2R, max: h.max * D2R, friction: h.friction, group, spring: h.spring },
      });
    }
    if (h.latch !== undefined) {
      const pivot = this.p(h.pivots[0]);
      this.bonds.push({
        a: this.resolve(moving),
        b: fixed === "world" ? "world" : this.resolve(fixed),
        kind: "latch",
        strength: h.latch,
        anchor: pivot,
        joint: { axis, pivot, min: 0, max: 0, group },
      });
    }
  }

  /** Sliding part (drawer). One slider bond per pivot (left/right runners), grouped. */
  slider(moving: string, fixed: string, s: SliderSpec): void {
    const group = `${this.n(moving)}#slide${this.groupCounter++}`;
    const axis = this.d(s.axis);
    for (const pv of s.pivots) {
      const pivot = this.p(pv);
      this.bonds.push({
        a: this.resolve(moving),
        b: fixed === "world" ? "world" : this.resolve(fixed),
        kind: "slider",
        strength: s.strength,
        anchor: pivot,
        joint: { axis, pivot, min: s.min, max: s.max, friction: s.friction, group },
      });
    }
  }

  /**
   * Bond every pair of (not yet bonded) parts whose hulls touch within `tol` metres.
   * `filter` can restrict which pairs (e.g. only parts with a prefix).
   */
  autoBond(kind: BondKind, strength?: number, tol = 0.003, filter?: (a: string, b: string) => boolean): number {
    let count = 0;
    const bonded = new Set(this.bonds.map((b) => pairKey(b.a, b.b)));
    const boxes = this.parts.map((p) => polyBounds(p.poly));
    for (let i = 0; i < this.parts.length; i++) {
      for (let j = i + 1; j < this.parts.length; j++) {
        const A = this.parts[i],
          B = this.parts[j];
        if (bonded.has(pairKey(A.name, B.name))) continue;
        if (filter && !filter(A.name, B.name)) continue;
        const ba = boxes[i],
          bb = boxes[j];
        if (ba.min.x > bb.max.x + tol || bb.min.x > ba.max.x + tol) continue;
        if (ba.min.y > bb.max.y + tol || bb.min.y > ba.max.y + tol) continue;
        if (ba.min.z > bb.max.z + tol || bb.min.z > ba.max.z + tol) continue;
        if (!this.touching(A.name, B.name, tol)) continue;
        this.bonds.push({ a: A.name, b: B.name, kind, strength, anchor: this.autoAnchor(A.name, B.name) });
        bonded.add(pairKey(A.name, B.name));
        count++;
      }
    }
    return count;
  }

  // ------------------------------------------------------------------ features
  feature(f: FeatureDef): void {
    const g = f as FeatureDef & { part: string };
    this.features.push({ ...g, part: this.resolve(g.part) } as FeatureDef);
  }

  light(o: { part: string; pos: V3; kind?: "point" | "spot"; dir?: V3; color?: number; intensity?: number; range?: number; angle?: number; castShadows?: boolean; mains?: boolean; on?: boolean }): void {
    this.feature({
      type: "light",
      part: o.part,
      pos: this.p(o.pos),
      kind: o.kind ?? "point",
      dir: o.dir ? this.d(o.dir) : undefined,
      color: o.color ?? 0xffe2b8,
      intensity: o.intensity ?? 1,
      range: o.range ?? 6,
      angle: o.angle,
      castShadows: o.castShadows,
      mains: o.mains ?? true,
      on: o.on ?? true,
    });
  }

  water(part: string, pos: V3, dir: V3, pressure = 0.7, litres?: number): void {
    this.feature({ type: "water", part, pos: this.p(pos), dir: this.d(dir), pressure, litres });
  }

  // ------------------------------------------------------------------ queries
  has(name: string): boolean {
    return this.partIndex.has(this.n(name)) || this.partIndex.has(name);
  }

  /** Mass in kg of the whole assembly (or a single part). */
  mass(part?: string): number {
    const list = part ? [this.partIndex.get(this.resolve(part))!] : this.parts;
    let m = 0;
    for (const p of list) m += p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
    return m;
  }

  partNames(): string[] {
    return this.parts.map((p) => p.name);
  }

  private resolve(name: string): string {
    if (name === "world") return name;
    const full = this.n(name);
    if (this.partIndex.has(full)) return full;
    if (this.partIndex.has(name)) return name;
    throw new Error(`${this.type}: unknown part '${name}' (prefix '${this.frame.prefix}')`);
  }

  private touching(a: string, b: string, tol: number): boolean {
    const A = this.partIndex.get(a)!.poly,
      B = this.partIndex.get(b)!.poly;
    const ca = polyCentroid(A);
    const pb = polyClosestPoint(B, ca);
    const pa = polyClosestPoint(A, pb);
    const pb2 = polyClosestPoint(B, pa);
    return vlen(vsub(pa, pb2)) <= tol || polySignedDist(B, pa) <= tol;
  }

  private autoAnchor(a: string, b: string): Vec3 {
    const A = this.partIndex.get(a)!.poly;
    if (b === "world") {
      // anchor at the lowest-centre point of the part (typical floor/wall contact); callers pass explicit anchors for walls
      const bb = polyBounds(A);
      return v3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    }
    const B = this.partIndex.get(b)!.poly;
    const pb = polyClosestPoint(B, polyCentroid(A));
    const pa = polyClosestPoint(A, pb);
    const pb2 = polyClosestPoint(B, pa);
    return vscale(vadd(pa, pb2), 0.5);
  }

  // ------------------------------------------------------------------ build
  build(): AssemblyDef {
    const errors: string[] = [];
    const bondedParts = new Set<string>();
    for (const b of this.bonds) {
      if (!this.partIndex.has(b.a)) errors.push(`bond references unknown part '${b.a}'`);
      if (b.b !== "world" && !this.partIndex.has(b.b)) errors.push(`bond references unknown part '${b.b}'`);
      if ((b.kind === "hinge" || b.kind === "slider" || b.kind === "latch") && !b.joint) errors.push(`joint bond ${b.a}-${b.b} lacks joint def`);
      bondedParts.add(b.a);
      bondedParts.add(b.b);
    }
    for (const p of this.parts) {
      const v = polyVolume(p.poly);
      if (!(v > 1e-9)) errors.push(`part '${p.name}' has degenerate volume ${v}`);
      if (this.parts.length > 1 && !bondedParts.has(p.name) && !(p.tags ?? []).includes("loose")) {
        errors.push(`part '${p.name}' has no bonds (tag it 'loose' if intentional)`);
      }
    }
    for (const f of this.features) {
      const part = (f as { part: string }).part;
      if (!this.partIndex.has(part)) errors.push(`feature ${f.type} references unknown part '${part}'`);
    }
    if (errors.length) throw new Error(`${this.type}: invalid assembly:\n  ${errors.join("\n  ")}`);
    return {
      type: this.type,
      name: this.name,
      category: this.category,
      value: this.value,
      parts: this.parts,
      bonds: this.bonds,
      features: this.features,
    };
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function qmulSafe(a: Quat, b: Quat): Quat {
  // local copy of quaternion multiply to avoid importing qmul name clash in consumers
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
