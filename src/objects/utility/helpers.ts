// Shared helpers for the bathroom / laundry / foyer / balcony builders (src/objects/bath/**,
// src/objects/utility/**). Things the common kit does not provide: oval (non-uniformly scaled)
// lathe shells for toilet bowls, rounded-rectangle basin shells with a rim deck (bathtub, vanity
// basin), hollow panel boxes for cardboard/plastic/steel containers, bottles, and a few layout
// conveniences (coordinate-range boxes, seeded builder factory).
//
// Helper conventions follow kit.ts: helper(b, name, opts, pos?, rot?) builds parts named
// `${name}_*` in a local frame and returns FULL part names. PURE MODULE (no Babylon).

import { Builder, vec, type PartOpts, type Rot, type TiledOpts, type V3 } from "../lib/builder.ts";
import { v3, vnorm, vdot, xapply, xinv, type Vec3 } from "../../geom/vec.ts";
import { polyFromHull, type ConvexPoly, type PolyFace } from "../../geom/poly.ts";
import { latheTiles, type Tile } from "../../geom/primitives.ts";
import { seedFrom } from "../../core/rng.ts";
import type { AssemblyCategory, AssemblyDef, BondKind } from "../../destruction/model/types.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

export const D2R = Math.PI / 180;

/** Seam strength (J) for stitched / laminated soft tiles (fabric, paper, rubber have no fused toughness). */
export const SOFT_SEAM = 30;
/** Seam strength (J) for welded / rolled sheet-metal tiles (steel has no fused toughness in the model). */
export const METAL_SEAM = 120;

/** Chrome-plated brass fittings (no brass material: steel density is close enough). */
export const CHROME = { mat: "steel" as MaterialId, surf: "chrome" as SurfaceName, tint: 0xffffff };
/** Brass / copper-coloured fittings. */
export const BRASS = { mat: "copper" as MaterialId, surf: "steel_brushed" as SurfaceName, tint: 0xd9b25e };

/** Options every builder in this area accepts. */
export interface BaseOpts {
  /** Variant seed (uv offsets, small variations). */
  seed?: number;
  /** Room id copied into the AssemblyDef. */
  room?: string;
  /** Validation level passed to build() ("full" adds the sample-based overlap check). */
  validate?: "basic" | "full";
}

/** New Builder with a deterministic seed derived from the type id and the variant seed. */
export function mk(type: string, name: string, category: AssemblyCategory, value: number, o: BaseOpts = {}): Builder {
  const codes: number[] = [];
  for (let i = 0; i < type.length; i++) codes.push(type.charCodeAt(i));
  const b = new Builder(type, name, category, value, seedFrom(o.seed ?? 0, type.length, ...codes));
  if (o.room) b.room = o.room;
  return b;
}

/** Validate and return the AssemblyDef. */
export function finish(b: Builder, o: BaseOpts = {}): AssemblyDef {
  return b.build({ validate: o.validate ?? "basic" });
}

/** Run `fn` in a group named `${name}_` placed at pos/rot. */
export function scoped<T>(b: Builder, name: string, pos: V3, rot: Rot | undefined, fn: () => T): T {
  let out: T | undefined;
  b.group(pos, rot, name ? `${name}_` : "", () => {
    out = fn();
  });
  return out as T;
}

export type Range = readonly [number, number];

/** Axis-aligned box given by coordinate ranges in the current frame. */
export function boxR(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, x: Range, y: Range, z: Range, o: PartOpts = {}): string {
  const sx = Math.abs(x[1] - x[0]),
    sy = Math.abs(y[1] - y[0]),
    sz = Math.abs(z[1] - z[0]);
  return b.box(name, mat, surf, [sx, sy, sz], [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], o);
}

/** Mass per metre (kg/m) of a round tube of outer diameter od and wall thickness. */
export function tubeKgPerM(od: number, wall: number, density: number): number {
  const ro = od / 2,
    ri = Math.max(0, ro - wall);
  return Math.PI * (ro * ro - ri * ri) * density;
}

/** Mass (kg) of a rectangular hollow section bar (w × h outer, wall t) of length len. */
export function rhsKg(w: number, h: number, t: number, len: number, density: number): number {
  const a = w * h - Math.max(0, w - 2 * t) * Math.max(0, h - 2 * t);
  return a * len * density;
}

/**
 * Bond `part` to every candidate it touches (face contact, interpenetration or a line contact
 * longer than 4 mm within `tol`), splitting `total` between the joints. Warns when fewer than
 * `minCount` candidates touch. Returns the number of bonds made.
 */
export function bondTouching(b: Builder, part: string, candidates: string[], kind: BondKind, total: number, tol = 0.0015, minCount = 1): number {
  const hits: Array<{ name: string; at: Vec3 }> = [];
  const self = b.resolve(part);
  for (const c of candidates) {
    if (b.resolve(c) === self) continue;
    const ct = b.contact(part, c, tol);
    if (ct && (ct.kind === "face" || ct.penetrating || ct.length > 0.004)) hits.push({ name: c, at: contactAnchor(b, part, c, ct.point) });
  }
  if (hits.length < minCount) b.warn(`bondTouching: '${self}' touches ${hits.length} of the expected parts`);
  if (!hits.length) return 0;
  const each = Math.max(1, total / hits.length);
  // anchor at the measured contact patch (b.bond takes current-frame coordinates)
  const toLocal = xinv(b.frameXf());
  for (const h of hits) b.bond(part, h.name, kind, { strength: each, anchor: xapply(toLocal, h.at) });
  return hits.length;
}

/** AABB of a part (assembly space). */
function partBox(b: Builder, name: string): { min: Vec3; max: Vec3 } {
  const min = v3(Infinity, Infinity, Infinity),
    max = v3(-Infinity, -Infinity, -Infinity);
  for (const q of b.get(name).poly.verts) {
    min.x = Math.min(min.x, q.x);
    min.y = Math.min(min.y, q.y);
    min.z = Math.min(min.z, q.z);
    max.x = Math.max(max.x, q.x);
    max.y = Math.max(max.y, q.y);
    max.z = Math.max(max.z, q.z);
  }
  return { min, max };
}

/**
 * A trustworthy bond anchor for two touching parts: the contact patch centre when it lies on
 * both parts' bounds, else the centre of their (tolerance-padded) AABB overlap — the contact
 * solver can return a far-off point for long edge-to-edge contacts.
 */
export function contactAnchor(b: Builder, a: string, c: string, point: Vec3 | undefined, pad = 0.01): Vec3 {
  const A = partBox(b, a),
    C = partBox(b, c);
  const inBox = (q: Vec3, bx: { min: Vec3; max: Vec3 }) =>
    q.x >= bx.min.x - pad && q.x <= bx.max.x + pad && q.y >= bx.min.y - pad && q.y <= bx.max.y + pad && q.z >= bx.min.z - pad && q.z <= bx.max.z + pad;
  if (point && Number.isFinite(point.x + point.y + point.z) && inBox(point, A) && inBox(point, C)) return point;
  const lo = v3(Math.max(A.min.x, C.min.x), Math.max(A.min.y, C.min.y), Math.max(A.min.z, C.min.z));
  const hi = v3(Math.min(A.max.x, C.max.x), Math.min(A.max.y, C.max.y), Math.min(A.max.z, C.max.z));
  return v3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
}

// =============================================================================================
// Non-uniform scaling (oval lathes)
// =============================================================================================

/**
 * Non-uniform scale (sx, sy, sz > 0) of a convex polyhedron. An affine map keeps faces planar and
 * the hull convex; face planes, per-vertex normals and planar uv maps are transformed with the
 * inverse transpose so shading and textures stay attached.
 */
export function scalePoly(p: ConvexPoly, s: Vec3): ConvexPoly {
  if (!(s.x > 0 && s.y > 0 && s.z > 0)) throw new Error(`scalePoly: scale must be positive (${s.x}, ${s.y}, ${s.z})`);
  const verts = p.verts.map((v) => v3(v.x * s.x, v.y * s.y, v.z * s.z));
  const faces: PolyFace[] = p.faces.map((f) => {
    const n = vnorm(v3(f.n.x / s.x, f.n.y / s.y, f.n.z / s.z));
    const d = vdot(n, verts[f.idx[0]]);
    const uv = f.attr.uv;
    const nuv = uv
      ? { u: v3(uv.u.x / s.x, uv.u.y / s.y, uv.u.z / s.z), v: v3(uv.v.x / s.x, uv.v.y / s.y, uv.v.z / s.z), u0: uv.u0, v0: uv.v0 }
      : uv;
    const nf: PolyFace = { idx: f.idx.slice(), n, d, attr: { ...f.attr, uv: nuv } };
    if (f.vn) nf.vn = f.vn.map((m) => vnorm(v3(m.x / s.x, m.y / s.y, m.z / s.z)));
    return nf;
  });
  return { verts, faces };
}

export interface OvalLatheOpts extends TiledOpts {
  /** Outer profile [radius, y] bottom → top (before scaling). */
  profile: Array<[number, number]>;
  thickness: number;
  segments: number;
  capBottom?: boolean;
  angleStart?: number;
  angleEnd?: number;
  /** Scale along local X and Z (an elongated toilet bowl: sz > sx). */
  sx?: number;
  sz?: number;
  pos?: V3;
  innerTint?: number;
  edgeSurf?: SurfaceName;
}

/** Lathe shell scaled into an oval in plan (tiles fused into one shell). Returns tile names. */
export function ovalLathe(b: Builder, prefix: string, mat: MaterialId, surfOuter: SurfaceName, surfInner: SurfaceName, o: OvalLatheOpts): string[] {
  const tint = o.tint ?? 0xffffff;
  const tiles = latheTiles({
    profile: o.profile,
    thickness: o.thickness,
    segments: Math.max(3, o.segments),
    capBottom: o.capBottom,
    angleStart: o.angleStart,
    angleEnd: o.angleEnd,
    outer: b.attr(surfOuter, tint, 1),
    inner: b.attr(surfInner, o.innerTint ?? tint, 2),
    edge: b.attr(o.edgeSurf ?? surfOuter, tint, 0),
  });
  const s = v3(o.sx ?? 1, 1, o.sz ?? 1);
  const scaled: Tile[] = tiles.map((t) => ({ poly: scalePoly(t.poly, s), i: t.i, j: t.j }));
  return b.addTiles(prefix, mat, scaled, o.pos ?? [0, 0, 0], o);
}

// =============================================================================================
// Rounded-rectangle basins (bathtub, vanity basin)
// =============================================================================================

export interface OutlinePt {
  x: number;
  z: number;
  /** Outward horizontal direction (radial from the corner centre). */
  dx: number;
  dz: number;
}

/**
 * Rounded rectangle in plan (x, z), half sizes hx/hz, corner radius r with `n` facets per
 * corner, centred at (cx, cz). Points run counter-clockwise seen from above (+X → +Z → -X → -Z),
 * 4·(n+1) of them; each carries its outward radial direction.
 */
export function roundedRectOutline(hx: number, hz: number, r: number, n: number, cx = 0, cz = 0): OutlinePt[] {
  const rr = Math.max(0, Math.min(r, hx, hz));
  const segs = Math.max(1, Math.floor(n));
  const corners: Array<[number, number, number]> = [
    [hx - rr, hz - rr, 0],
    [-(hx - rr), hz - rr, 90],
    [-(hx - rr), -(hz - rr), 180],
    [hx - rr, -(hz - rr), 270],
  ];
  const out: OutlinePt[] = [];
  for (const [ox, oz, a0] of corners) {
    for (let k = 0; k <= segs; k++) {
      const a = (a0 + (90 * k) / segs) * D2R;
      const c = Math.cos(a),
        s = Math.sin(a);
      out.push({ x: cx + ox + rr * c, z: cz + oz + rr * s, dx: c, dz: s });
    }
  }
  return out;
}

export interface BasinOpts {
  /** Inner (visible) top opening: half sizes, corner radius, height of the wall tops. */
  top: { hx: number; hz: number; r: number; y: number; cx?: number; cz?: number };
  /** Inner bottom outline: half sizes, corner radius, height of the inner bottom surface. */
  bottom: { hx: number; hz: number; r: number; y: number; cx?: number; cz?: number };
  /** Horizontal wall thickness (m). */
  t: number;
  /** Bottom slab thickness (default t). */
  tb?: number;
  /** Facets per corner (default 2). */
  corner?: number;
  /** Flat rim deck from the top opening out to this rectangle (half sizes, thickness, centre). */
  deck?: { hx: number; hz: number; t: number; cx?: number; cz?: number };
  mat: MaterialId;
  surf: SurfaceName;
  /** Surface of the deck pieces (default surf). */
  deckSurf?: SurfaceName;
  tint?: number;
  /** Total mass override for the whole shell (reinforced/hollow shells). */
  kg?: number;
  seam?: BondKind;
  seamStrength?: number;
}

export interface BasinResult {
  walls: string[];
  deck: string[];
  bottom: string;
  all: string[];
}

/** Region of a convex polygon (x, z) — intersection of a ray from p along d with the rectangle boundary. */
function rayToRect(px: number, pz: number, dx: number, dz: number, x0: number, x1: number, z0: number, z1: number): [number, number] {
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (x1 - px) / dx);
  if (dx < -1e-9) t = Math.min(t, (x0 - px) / dx);
  if (dz > 1e-9) t = Math.min(t, (z1 - pz) / dz);
  if (dz < -1e-9) t = Math.min(t, (z0 - pz) / dz);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return [px + dx * t, pz + dz * t];
}

/**
 * Basin shell with sloped walls between a rounded-rectangle top opening and a rounded-rectangle
 * bottom, a bottom slab under the walls and an optional flat rim deck out to a rectangle. Every
 * wall tile is the hull of its 8 corners (inner surface = the given outlines, outer = offset by
 * `t` along the corner radials); consecutive tiles share their side faces, walls sit on the slab
 * and the deck pieces sit on the wall tops, so all seams are real face contacts (fused).
 * Local frame: plan centred on the origin, y up.
 */
export function basinShell(b: Builder, name: string, o: BasinOpts, pos: V3 = [0, 0, 0], rot?: Rot): BasinResult {
  const n = Math.max(1, o.corner ?? 2);
  const tb = o.tb ?? o.t;
  const tint = o.tint ?? 0xffffff;
  const top = roundedRectOutline(o.top.hx, o.top.hz, o.top.r, n, o.top.cx ?? 0, o.top.cz ?? 0);
  const bot = roundedRectOutline(o.bottom.hx, o.bottom.hz, o.bottom.r, n, o.bottom.cx ?? 0, o.bottom.cz ?? 0);
  const yT = o.top.y,
    yB = o.bottom.y;
  if (!(yT > yB + 0.01)) throw new Error(`basinShell '${name}': top must be above the bottom`);
  const attr = b.attr(o.surf, tint, 0);
  const deckAttr = b.attr(o.deckSurf ?? o.surf, tint, 0);
  return scoped(b, name, pos, rot, () => {
    const N = top.length;
    const wallTiles: Tile[] = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = top[i],
        c = top[j];
      if (Math.hypot(c.x - a.x, c.z - a.z) < 1e-5) continue; // zero-length (r == half size)
      const ba = bot[i],
        bc = bot[j];
      const pts: Vec3[] = [];
      for (const [p, q, y] of [
        [a, a, yT],
        [c, c, yT],
        [ba, a, yB],
        [bc, c, yB],
      ] as Array<[OutlinePt, OutlinePt, number]>) {
        pts.push(v3(p.x, y, p.z));
        pts.push(v3(p.x + o.t * q.dx, y, p.z + o.t * q.dz));
      }
      wallTiles.push({ poly: polyFromHull(pts, attr), i: wallTiles.length, j: 0 });
    }
    const totalKg = o.kg;
    const tileOpts: TiledOpts = { seam: o.seam, seamStrength: o.seamStrength, tint };
    const walls = b.addTiles("wall", o.mat, wallTiles, [0, 0, 0], tileOpts);
    // bottom slab under the outer bottom outline
    const bpts: Vec3[] = [];
    for (const p of bot) {
      bpts.push(v3(p.x + o.t * p.dx, yB, p.z + o.t * p.dz));
      bpts.push(v3(p.x + o.t * p.dx, yB - tb, p.z + o.t * p.dz));
    }
    const bottom = b.hull("bottom", o.mat, o.surf, bpts, [0, 0, 0], { tint });
    // deck pieces between the top opening and the outer rectangle
    const deck: string[] = [];
    if (o.deck) {
      const dx0 = (o.deck.cx ?? 0) - o.deck.hx,
        dx1 = (o.deck.cx ?? 0) + o.deck.hx,
        dz0 = (o.deck.cz ?? 0) - o.deck.hz,
        dz1 = (o.deck.cz ?? 0) + o.deck.hz;
      const rectCorners: Array<[number, number]> = [
        [dx1, dz1],
        [dx0, dz1],
        [dx0, dz0],
        [dx1, dz0],
      ];
      const deckTiles: Tile[] = [];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a = top[i],
          c = top[j];
        if (Math.hypot(c.x - a.x, c.z - a.z) < 1e-5) continue;
        const ra = rayToRect(a.x, a.z, a.dx, a.dz, dx0, dx1, dz0, dz1);
        const rc = rayToRect(c.x, c.z, c.dx, c.dz, dx0, dx1, dz0, dz1);
        const poly2: Array<[number, number]> = [
          [a.x, a.z],
          [c.x, c.z],
          rc,
        ];
        // rectangle corners strictly between the two rays (seen from where the rays meet: the
        // facet's corner centre) belong to this piece; parallel rays (straight edges) take none
        const cr = a.dx * c.dz - a.dz * c.dx;
        if (Math.abs(cr) > 1e-9) {
          // a + t·da = c + s·dc  →  t = cross(c − a, dc) / cross(da, dc)
          const tt = ((c.x - a.x) * c.dz - (c.z - a.z) * c.dx) / cr;
          const ox = a.x + tt * a.dx,
            oz = a.z + tt * a.dz;
          const angA = Math.atan2(a.dz, a.dx);
          let span = Math.atan2(c.dz, c.dx) - angA;
          while (span < 0) span += 2 * Math.PI;
          for (const [qx, qz] of rectCorners) {
            let ang = Math.atan2(qz - oz, qx - ox) - angA;
            while (ang < 0) ang += 2 * Math.PI;
            while (ang >= 2 * Math.PI) ang -= 2 * Math.PI;
            if (ang > 1e-6 && ang < span - 1e-6) poly2.push([qx, qz]);
          }
        }
        poly2.push(ra);
        const pts: Vec3[] = [];
        for (const [x, z] of poly2) {
          pts.push(v3(x, yT, z));
          pts.push(v3(x, yT + o.deck.t, z));
        }
        deckTiles.push({ poly: polyFromHull(pts, deckAttr), i: deckTiles.length, j: 1 });
      }
      deck.push(...b.addTiles("deck", o.mat, deckTiles, [0, 0, 0], tileOpts));
    }
    const all = [...walls, bottom, ...deck];
    b.fuseTouching(all, o.seam ?? "fused", o.seamStrength);
    if (totalKg !== undefined) {
      // distribute the mass override by volume (reinforced / hollow shells)
      let vol = 0;
      const vols = all.map((p) => {
        const m = b.mass(p);
        vol += m;
        return m;
      });
      all.forEach((p, k) => {
        b.get(p).mass = (totalKg * vols[k]) / Math.max(1e-9, vol);
      });
    }
    return { walls, deck, bottom, all };
  });
}

// =============================================================================================
// Containers, bottles, profiles
// =============================================================================================

export type PanelFace = "top" | "bottom" | "left" | "right" | "back" | "front";

export interface PanelBoxOpts {
  w: number;
  h: number;
  d: number;
  /** Wall thickness; `tb` = bottom thickness (default t). */
  t: number;
  tb?: number;
  mat: MaterialId;
  surf: SurfaceName;
  tint?: number;
  faces?: Partial<Record<PanelFace, boolean>>;
  /** Surface overrides per panel (e.g. a printed front). */
  faceSurf?: Partial<Record<PanelFace, SurfaceName>>;
  /** Seam bond kind and strength per seam (J). */
  bond?: BondKind;
  strength?: number;
  /** Mass override for the whole box (distributed by volume). */
  kg?: number;
  tess?: number;
}

/**
 * Hollow box of panels (cardboard box, plastic crate, steel tray): local x ∈ ±w/2, y ∈ [0, h],
 * z ∈ ±d/2. Bottom spans the full footprint; sides stand on it; front/back fit between the sides;
 * a top lid (if any) rests on the walls. Every touching pair gets one seam bond.
 */
export function panelBox(b: Builder, name: string, o: PanelBoxOpts, pos: V3 = [0, 0, 0], rot?: Rot): Partial<Record<PanelFace, string>> & { all: string[] } {
  const f: Record<PanelFace, boolean> = { top: false, bottom: true, left: true, right: true, back: true, front: true, ...(o.faces ?? {}) };
  const t = o.t,
    tb = o.tb ?? o.t;
  const { w, h, d } = o;
  const tint = o.tint ?? 0xffffff;
  if (!(w > 2 * t && d > 2 * t && h > tb + t)) throw new Error(`panelBox '${name}': too small for its wall thickness`);
  return scoped(b, name, pos, rot, () => {
    const out: Partial<Record<PanelFace, string>> = {};
    const po = (k: PanelFace): PartOpts => ({ tint, tess: o.tess });
    const s = (k: PanelFace): SurfaceName => o.faceSurf?.[k] ?? o.surf;
    const y0 = f.bottom ? tb : 0;
    const y1 = f.top ? h - t : h;
    if (f.bottom) out.bottom = boxR(b, "bottom", o.mat, s("bottom"), [-w / 2, w / 2], [0, tb], [-d / 2, d / 2], po("bottom"));
    if (f.left) out.left = boxR(b, "left", o.mat, s("left"), [-w / 2, -w / 2 + t], [y0, y1], [-d / 2, d / 2], po("left"));
    if (f.right) out.right = boxR(b, "right", o.mat, s("right"), [w / 2 - t, w / 2], [y0, y1], [-d / 2, d / 2], po("right"));
    const xa = f.left ? -w / 2 + t : -w / 2,
      xb = f.right ? w / 2 - t : w / 2;
    if (f.back) out.back = boxR(b, "back", o.mat, s("back"), [xa, xb], [y0, y1], [-d / 2, -d / 2 + t], po("back"));
    if (f.front) out.front = boxR(b, "front", o.mat, s("front"), [xa, xb], [y0, y1], [d / 2 - t, d / 2], po("front"));
    if (f.top) out.top = boxR(b, "top", o.mat, s("top"), [-w / 2, w / 2], [h - t, h], [-d / 2, d / 2], po("top"));
    const names = Object.values(out) as string[];
    const kind = o.bond ?? "glue";
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const c = b.contact(names[i], names[j], 0.0005);
        if (!c || (c.kind !== "face" && !c.penetrating)) continue;
        b.bond(names[i], names[j], kind, { strength: o.strength });
      }
    if (o.kg !== undefined) {
      const ms = names.map((p) => b.mass(p));
      const tot = ms.reduce((a, x) => a + x, 0);
      names.forEach((p, k) => {
        b.get(p).mass = (o.kg! * ms[k]) / Math.max(1e-9, tot);
      });
    }
    return { ...out, all: names };
  });
}

/** Points of a rounded rectangle prism (x ∈ ±w/2, z ∈ ±d/2, y ∈ [y0, y0 + h]) for b.hull. */
export function roundedPrismPoints(w: number, h: number, d: number, r: number, n = 3, y0 = 0): V3[] {
  const pts: V3[] = [];
  for (const p of roundedRectOutline(w / 2, d / 2, Math.min(r, w / 2, d / 2), n)) {
    pts.push([p.x, y0, p.z]);
    pts.push([p.x, y0 + h, p.z]);
  }
  return pts;
}

/** Points of an elliptic prism (radii rx, rz; y ∈ [y0, y0 + h]) for b.hull. */
export function ellipsePrismPoints(rx: number, rz: number, h: number, n = 16, y0 = 0): V3[] {
  const pts: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push([rx * Math.cos(a), y0, rz * Math.sin(a)]);
    pts.push([rx * Math.cos(a), y0 + h, rz * Math.sin(a)]);
  }
  return pts;
}

/** Points of a tapered rounded block: bottom outline (w0 × d0) at y0 to top outline (w1 × d1) at y1. */
export function taperedBlockPoints(w0: number, d0: number, w1: number, d1: number, y0: number, y1: number, r0 = 0, r1 = 0, n = 2): V3[] {
  const pts: V3[] = [];
  for (const p of roundedRectOutline(w0 / 2, d0 / 2, Math.min(r0, w0 / 2, d0 / 2), n)) pts.push([p.x, y0, p.z]);
  for (const p of roundedRectOutline(w1 / 2, d1 / 2, Math.min(r1, w1 / 2, d1 / 2), n)) pts.push([p.x, y1, p.z]);
  return pts;
}

export interface BottleOpts {
  /** Body footprint (w × d), body height, corner radius. */
  w: number;
  d: number;
  h: number;
  r?: number;
  /** Shoulder: top outline scale and height of the taper (0 = straight). */
  shoulder?: number;
  shoulderH?: number;
  bodyTint: number;
  bodySurf?: SurfaceName;
  /** Printed label on the front face (default label_bottle). */
  label?: SurfaceName | false;
  cap: { r: number; h: number; tint: number; kind?: "screw" | "flip" | "pump" };
  liquid?: { color: number; litres: number } | false;
  /** Total mass of the filled bottle (kg). */
  kg: number;
  mat?: MaterialId;
}

/**
 * Plastic bottle (shampoo, detergent, lotion): moulded body hull with a printed label on the
 * front (+Z), a press-fit cap (screw / flip / pump head) and a `liquid` feature on the body.
 * Sits on y = 0. Returns {body, cap, all}.
 */
export function plasticBottle(b: Builder, name: string, o: BottleOpts, pos: V3 = [0, 0, 0], rot?: Rot): { body: string; cap: string; all: string[] } {
  const mat = o.mat ?? "plastic";
  const r = o.r ?? Math.min(o.w, o.d) * 0.35;
  const sh = o.shoulderH ?? 0;
  const k = o.shoulder ?? 1;
  return scoped(b, name, pos, rot, () => {
    const pts: V3[] = [...roundedPrismPoints(o.w, o.h - sh, o.d, r, 3, 0)];
    if (sh > 0) {
      for (const p of roundedRectOutline((o.w * k) / 2, (o.d * k) / 2, Math.min(r * k, (o.w * k) / 2, (o.d * k) / 2), 3)) pts.push([p.x, o.h, p.z]);
    }
    const body = b.hull("body", mat, o.bodySurf ?? "plastic_glossy", pts, [0, 0, 0], { tint: o.bodyTint, mass: o.kg * 0.94 });
    // label: a printed face on the front — a thin film glued on (keeps the body hull simple)
    let label: string | null = null;
    if (o.label !== false) {
      const lw = (o.w - 2 * r) * 0.98 + r * 0.6;
      const lh = (o.h - sh) * 0.6;
      label = b.box("label", "paper", o.label ?? "label_bottle", [Math.max(0.01, lw), lh, 0.0006], [0, (o.h - sh) * 0.45, o.d / 2 + 0.0003], { mass: 0.002 });
      b.glue(label, body, 4);
    }
    const capH = o.cap.h;
    const cap = b.cyl("cap", "plastic", "plastic", o.cap.r, capH, [0, o.h + capH / 2, 0], { segments: 10, tint: o.cap.tint, mass: Math.max(0.004, o.kg * 0.03) });
    b.press(cap, body, o.cap.kind === "pump" ? 6 : 10);
    const all = [body, cap, ...(label ? [label] : [])];
    if (o.cap.kind === "pump") {
      const stem = b.cyl("pump_stem", "plastic", "plastic", o.cap.r * 0.35, 0.02, [0, o.h + capH + 0.01, 0], { segments: 8, tint: o.cap.tint, mass: 0.004 });
      const head = b.box("pump_head", "plastic", "plastic", [o.cap.r * 1.6, 0.014, o.cap.r * 3.2], [0, o.h + capH + 0.027, o.cap.r * 0.8], { tint: o.cap.tint, mass: 0.006 });
      b.press(stem, cap, 4);
      b.press(head, stem, 4);
      all.push(stem, head);
    }
    if (o.liquid !== false && o.liquid) b.liquid(body, o.liquid.color, o.liquid.litres);
    return { body, cap, all };
  });
}

/** Straight-ish bend helper: points of a circular arc in the XY / XZ / YZ plane (for hooks, J-handles). */
export function arcPath(cx: number, cy: number, cz: number, r: number, a0: number, a1: number, segs: number, plane: "xy" | "xz" | "zy"): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (a0 + ((a1 - a0) * i) / segs) * D2R;
    const c = Math.cos(a) * r,
      s = Math.sin(a) * r;
    if (plane === "xy") out.push([cx + c, cy + s, cz]);
    else if (plane === "xz") out.push([cx + c, cy, cz + s]);
    else out.push([cx, cy + s, cz + c]);
  }
  return out;
}

/** Convenience: vec() re-export for builders that take V3 options. */
export { vec };
