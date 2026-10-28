// Convex polyhedra with per-face appearance attributes — the representation used for part
// collision hulls, fracture (Voronoi via half-space clipping) and render-geometry generation.
// PURE MODULE: no Babylon imports. Contract owned by the orchestrator; implementation by the
// geometry agent. Keep signatures stable (other modules compile against them).
//
// Invariants maintained by every constructor/operation here:
//  * faces are convex, CCW seen from outside, unit outward normals, dot(n, p) == d on the face;
//  * every vertex is referenced by a face, no duplicate vertices (welded at 1e-7 × scale);
//  * no NaN: degenerate inputs give an empty poly ({verts: [], faces: []}) or a flat
//    two-sided poly (volume 0) instead of throwing.
// Tolerances are relative to the shape size (see util.ts).

import type { Vec3, Xform } from "./vec.ts";
import { qnorm, qrot } from "./vec.ts";
import { quickHull } from "./hull.ts";
import { wpolyFromConvex, wpolyClip, CLIP_UNCHANGED, CLIP_EMPTY, type WPoly, type WFace } from "./wpoly.ts";
import { scaleOfPoints, newellNormal, polygonArea, jacobiEigenSym3, convexHull2D, REL_PLANE_EPS, REL_WELD_EPS, ABS_EPS_FLOOR } from "./util.ts";

/**
 * Planar texture mapping in METRES: uv = (dot(p, u) + u0, dot(p, v) + v0) with p in the
 * polyhedron's own frame. The batcher divides by the surface's texture world size, so
 * geometry never needs to know texture scales. For wood, `u` points along the grain.
 */
export interface UVMap {
  u: Vec3;
  v: Vec3;
  u0: number;
  v0: number;
}

/** Appearance attributes of one face. Preserved through clipping/transforming. */
export interface FaceAttr {
  /** Surface index (see src/render/surfaces.ts `SURF`). */
  surf: number;
  /** Packed 0xRRGGBB tint multiplier (0xffffff = no tint). */
  tint: number;
  uv: UVMap;
  /** True for faces created by fracture cuts (shows the material's interior surface). */
  interior: boolean;
  /** Smoothing group: faces with the same non-zero group get averaged vertex normals. 0 = flat. */
  smooth: number;
}

export interface PolyFace {
  /** Indices into ConvexPoly.verts, counter-clockwise seen from OUTSIDE: normalize(cross(v1-v0, v2-v0)) == n. */
  idx: number[];
  /** Outward unit normal. */
  n: Vec3;
  /** Plane offset: face points satisfy dot(n, p) == d; interior points satisfy dot(n, p) < d. */
  d: number;
  attr: FaceAttr;
  /** Optional per-vertex normals (same order as idx) for smooth curved surfaces (lathe tiles, cylinders). */
  vn?: Vec3[];
}

export interface ConvexPoly {
  verts: Vec3[];
  faces: PolyFace[];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

// ====================================================================== small vector helpers
const vx = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => vx(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const sub = (a: Vec3, b: Vec3): Vec3 => vx(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const unit = (a: Vec3, fallback: Vec3 = vx(0, 1, 0)): Vec3 => {
  const l = len(a);
  return l > 1e-300 && Number.isFinite(l) ? vx(a.x / l, a.y / l, a.z / l) : vx(fallback.x, fallback.y, fallback.z);
};
const EMPTY = (): ConvexPoly => ({ verts: [], faces: [] });
/** Finite number or 0 (guards constructors against NaN/Infinity inputs). */
const fin = (x: number | undefined): number => (x !== undefined && Number.isFinite(x) ? x : 0);

// ====================================================================== attributes & UVs

/**
 * Planar UV map (metres) for a face with unit normal n:
 *  - if `grain` is given and not (nearly) parallel to n: u = grain projected onto the face plane
 *    (normalised), v = cross(n, u) — wood texture grain runs along the board;
 *  - else for walls (|n.y| < 0.9): u = horizontal tangent normalize(cross(Y, n)) flipped so that
 *    u is consistent around a box, v = +Y (textures upright on vertical faces);
 *  - else (floors/ceilings): u = +X, v = +Z (sign-adjusted by n.y so it is not mirrored).
 * u0/v0 = offsets (metres) to decorrelate identical parts.
 *
 * Implementation notes: the wall/floor axes are made exactly in-plane (Gram–Schmidt) so slanted
 * faces are not stretched; for vertical walls this is exactly u = cross(n, Y), v = +Y and for
 * horizontal faces exactly u = +X, v = ±Z. cross(u, v) = -n there, which is the non-mirrored
 * orientation in Babylon's left-handed world (u reads left→right seen from outside).
 */
export function autoUV(n: Vec3, offsetU = 0, offsetV = 0, grain?: Vec3): UVMap {
  const nn = unit(n);
  if (grain) {
    const g = unit(grain, vx(0, 0, 0));
    const gd = dot(g, nn);
    if (len(g) > 0.5 && Math.abs(gd) < 0.95) {
      const u = unit(vx(g.x - nn.x * gd, g.y - nn.y * gd, g.z - nn.z * gd));
      return { u, v: cross(nn, u), u0: offsetU, v0: offsetV };
    }
  }
  let u: Vec3;
  if (Math.abs(nn.y) < 0.9) {
    u = unit(cross(nn, vx(0, 1, 0)), vx(1, 0, 0));
  } else {
    u = unit(vx(1 - nn.x * nn.x, -nn.x * nn.y, -nn.x * nn.z), vx(1, 0, 0));
  }
  return { u, v: cross(u, nn), u0: offsetU, v0: offsetV };
}

/** Make a FaceAttr quickly (uv auto-derived per face when `uv` omitted at construction sites). */
export function faceAttr(surf: number, tint = 0xffffff, opts: Partial<FaceAttr> = {}): FaceAttr {
  return {
    surf,
    tint,
    uv: opts.uv ? cloneUV(opts.uv) : zeroUV(),
    interior: opts.interior ?? false,
    smooth: opts.smooth ?? 0,
  };
}

/** The "derive me" UV map (u = 0). */
export function zeroUV(): UVMap {
  return { u: vx(0, 0, 0), v: vx(0, 0, 0), u0: 0, v0: 0 };
}

/** True if the attr carries an explicit UV map (non-zero u axis). */
export function hasUV(a: FaceAttr): boolean {
  const u = a.uv?.u;
  return !!u && (u.x !== 0 || u.y !== 0 || u.z !== 0);
}

export function cloneUV(uv: UVMap): UVMap {
  return { u: vx(uv.u.x, uv.u.y, uv.u.z), v: vx(uv.v.x, uv.v.y, uv.v.z), u0: uv.u0, v0: uv.v0 };
}

/** Copy of an attr (optionally with a replacement uv map). Attrs are never shared between faces. */
export function cloneAttr(a: FaceAttr, uv?: UVMap): FaceAttr {
  return { surf: a.surf, tint: a.tint, uv: uv ? cloneUV(uv) : a.uv ? cloneUV(a.uv) : zeroUV(), interior: a.interior, smooth: a.smooth };
}

/** Attr copy whose uv is kept if explicit, else derived for normal n. */
export function attrFor(a: FaceAttr, n: Vec3, grain?: Vec3): FaceAttr {
  return hasUV(a) ? cloneAttr(a) : cloneAttr(a, autoUV(n, 0, 0, grain));
}

/**
 * Build a face from a vertex loop: computes the Newell normal, orients the loop CCW seen from
 * outside (away from `inside`), sets d = mean plane offset. Returns null for degenerate loops.
 */
export function makeFace(verts: Vec3[], idx: number[], attr: FaceAttr, inside: Vec3, vn?: Vec3[]): PolyFace | null {
  if (idx.length < 3) return null;
  let N = newellNormal(verts, idx);
  const l = len(N);
  if (!(l > 1e-300)) return null;
  N = vx(N.x / l, N.y / l, N.z / l);
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const i of idx) {
    cx += verts[i].x;
    cy += verts[i].y;
    cz += verts[i].z;
  }
  cx /= idx.length;
  cy /= idx.length;
  cz /= idx.length;
  let loop = idx.slice();
  let normals = vn ? vn.map((q) => vx(q.x, q.y, q.z)) : undefined;
  if (N.x * (cx - inside.x) + N.y * (cy - inside.y) + N.z * (cz - inside.z) < 0) {
    loop = loop.reverse();
    normals = normals?.reverse();
    N = vx(-N.x, -N.y, -N.z);
  }
  let d = 0;
  for (const i of loop) d += dot(N, verts[i]);
  d /= loop.length;
  const f: PolyFace = { idx: loop, n: N, d, attr };
  if (normals) f.vn = normals;
  return f;
}

// ====================================================================== constructors

/**
 * Axis-aligned box of full size `size` centred at the origin, then transformed by `xf`.
 * `attrs` is either one attr for all faces or 6 attrs in order +X,-X,+Y,-Y,+Z,-Z.
 * UV maps are derived per face (in metres) unless the attr carries a non-zero uv.u.
 */
export function polyBox(size: Vec3, attrs: FaceAttr | FaceAttr[], xf?: Xform): ConvexPoly {
  const hx = Math.abs(fin(size.x)) / 2,
    hy = Math.abs(fin(size.y)) / 2,
    hz = Math.abs(fin(size.z)) / 2;
  const verts: Vec3[] = [];
  for (let i = 0; i < 8; i++) verts.push(vx(i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz));
  const loops = [
    [1, 3, 7, 5],
    [0, 4, 6, 2],
    [2, 6, 7, 3],
    [0, 1, 5, 4],
    [4, 5, 7, 6],
    [0, 2, 3, 1],
  ];
  const normals = [vx(1, 0, 0), vx(-1, 0, 0), vx(0, 1, 0), vx(0, -1, 0), vx(0, 0, 1), vx(0, 0, -1)];
  const ds = [hx, hx, hy, hy, hz, hz];
  const faces: PolyFace[] = [];
  for (let k = 0; k < 6; k++) {
    const a = Array.isArray(attrs) ? (attrs[k] ?? attrs[0]) : attrs;
    faces.push({ idx: loops[k], n: normals[k], d: ds[k], attr: attrFor(a, normals[k]) });
  }
  const poly = { verts, faces };
  return xf ? polyTransform(poly, xf) : poly;
}

/** Box with chamfered edges (still convex). bevel in metres. */
export function polyBeveledBox(size: Vec3, bevel: number, attrs: FaceAttr | FaceAttr[], xf?: Xform): ConvexPoly {
  const hx = Math.abs(fin(size.x)) / 2,
    hy = Math.abs(fin(size.y)) / 2,
    hz = Math.abs(fin(size.z)) / 2;
  const hmin = Math.min(hx, hy, hz);
  const e = Math.min(Math.abs(fin(bevel)), hmin * 0.999);
  if (!(e > 1e-7 * Math.max(hx, hy, hz, 1e-9))) return polyBox(size, attrs, xf);
  const pts: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        pts.push(vx(sx * (hx - e), sy * (hy - e), sz * hz));
        pts.push(vx(sx * (hx - e), sy * hy, sz * (hz - e)));
        pts.push(vx(sx * hx, sy * (hy - e), sz * (hz - e)));
      }
  const axes = [vx(1, 0, 0), vx(-1, 0, 0), vx(0, 1, 0), vx(0, -1, 0), vx(0, 0, 1), vx(0, 0, -1)];
  const poly = hullPoly(pts, (n) => {
    let bk = 0,
      bd = -Infinity;
    for (let k = 0; k < 6; k++) {
      const d = dot(n, axes[k]);
      if (d > bd + 1e-9) {
        bd = d;
        bk = k;
      }
    }
    const a = Array.isArray(attrs) ? (attrs[bk] ?? attrs[0]) : attrs;
    // box projection: chamfers share the mapping of their dominant face (continuous texture)
    return attrFor(a, axes[bk]);
  });
  return xf ? polyTransform(poly, xf) : poly;
}

/**
 * Cylinder (or frustum when rTop != rBottom) along local +Y, centred at the origin.
 * Side faces share smoothing group `side.smooth` (set it non-zero for smooth shading).
 *
 * Smooth sides (side.smooth != 0) also carry analytic per-vertex normals so fragments stay
 * smoothly shaded. Side UVs (when not explicit) wrap around the axis: u = arc length, v = height.
 * A radius of 0 makes a cone (apex vertex, no cap on that end).
 */
export function polyCylinder(
  rBottom: number,
  rTop: number,
  height: number,
  segments: number,
  side: FaceAttr,
  caps: FaceAttr,
  xf?: Xform,
): ConvexPoly {
  const segs = Math.max(3, Math.floor(Number.isFinite(segments) ? segments : 12));
  const rb = Math.abs(fin(rBottom)),
    rt = Math.abs(fin(rTop)),
    h = Math.abs(fin(height));
  const scale = Math.max(2 * rb, 2 * rt, h, 1e-9);
  const tiny = 1e-7 * scale;
  if (h <= tiny || (rb <= tiny && rt <= tiny)) return EMPTY();
  const y0 = -h / 2,
    y1 = h / 2;
  const coneBot = rb <= tiny,
    coneTop = rt <= tiny;
  const verts: Vec3[] = [];
  const bot: number[] = [],
    top: number[] = [];
  const ang = (k: number) => (2 * Math.PI * k) / segs;
  if (coneBot) {
    verts.push(vx(0, y0, 0));
    for (let k = 0; k < segs; k++) bot.push(0);
  } else {
    for (let k = 0; k < segs; k++) {
      bot.push(verts.length);
      verts.push(vx(rb * Math.cos(ang(k)), y0, rb * Math.sin(ang(k))));
    }
  }
  if (coneTop) {
    const apex = verts.length;
    verts.push(vx(0, y1, 0));
    for (let k = 0; k < segs; k++) top.push(apex);
  } else {
    for (let k = 0; k < segs; k++) {
      top.push(verts.length);
      verts.push(vx(rt * Math.cos(ang(k)), y1, rt * Math.sin(ang(k))));
    }
  }
  const inside = vx(0, 0, 0);
  const smooth = side.smooth !== 0;
  const sideN = (a: number) => unit(vx(h * Math.cos(a), rb - rt, h * Math.sin(a)));
  const rRef = (rb + rt) / 2;
  const faces: PolyFace[] = [];
  for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs;
    const am = ang(k + 0.5);
    const idx: number[] = [];
    const vn: Vec3[] = [];
    const push = (i: number, a: number) => {
      if (idx.length && idx[idx.length - 1] === i) return;
      idx.push(i);
      vn.push(sideN(a));
    };
    push(bot[k], coneBot ? am : ang(k));
    push(bot[k1], coneBot ? am : ang(k + 1));
    push(top[k1], coneTop ? am : ang(k + 1));
    push(top[k], coneTop ? am : ang(k));
    if (idx.length > 1 && idx[0] === idx[idx.length - 1]) {
      idx.pop();
      vn.pop();
    }
    const f = makeFace(verts, idx, side, inside, smooth ? vn : undefined);
    if (!f) continue;
    f.attr = hasUV(side) ? cloneAttr(side) : cloneAttr(side, revolveUV(f.n, am, rRef, vx(rRef * Math.cos(am), y0, rRef * Math.sin(am)), 0));
    faces.push(f);
  }
  if (!coneBot) {
    const f = makeFace(verts, bot.slice(), caps, vx(0, 0, 0));
    if (f) {
      f.attr = attrFor(caps, f.n);
      faces.push(f);
    }
  }
  if (!coneTop) {
    const f = makeFace(verts, top.slice(), caps, vx(0, 0, 0));
    if (f) {
      f.attr = attrFor(caps, f.n);
      faces.push(f);
    }
  }
  const poly = { verts, faces };
  return xf ? polyTransform(poly, xf) : poly;
}

/**
 * UV map for a facet of a surface of revolution about Y: u runs along the circumference
 * (arc length at radius rRef, continuous between facets), v = cross(u, n) runs along the
 * meridian with v = vAt at point `vOrigin`.
 */
export function revolveUV(n: Vec3, midAngle: number, rRef: number, vOrigin: Vec3, vAt: number): UVMap {
  const t = vx(-Math.sin(midAngle), 0, Math.cos(midAngle));
  const nn = unit(n);
  // tangent made exactly in-plane (it already is for symmetric facets)
  const td = dot(t, nn);
  const u = unit(vx(t.x - nn.x * td, t.y - nn.y * td, t.z - nn.z * td), t);
  const v = cross(u, nn);
  return { u, v, u0: rRef * midAngle, v0: vAt - dot(vOrigin, v) };
}

/** Convex 2D polygon (x,y pairs, any winding) extruded along local Z by `depth`, centred. */
export function polyPrism(profile: Array<[number, number]>, depth: number, side: FaceAttr, caps: FaceAttr, xf?: Xform): ConvexPoly {
  const hull = convexHull2D(profile ?? []);
  const hz = Math.abs(fin(depth)) / 2;
  if (hull.length < 3 || !(hz > 0)) return EMPTY();
  const verts: Vec3[] = [];
  for (const [x, y] of hull) {
    verts.push(vx(x, y, -hz));
    verts.push(vx(x, y, hz));
  }
  const m = hull.length;
  let cx = 0,
    cy = 0;
  for (const [x, y] of hull) {
    cx += x;
    cy += y;
  }
  const inside = vx(cx / m, cy / m, 0);
  const faces: PolyFace[] = [];
  let perim = 0;
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    const f = makeFace(verts, [2 * k, 2 * k1, 2 * k1 + 1, 2 * k + 1], side, inside);
    const ex = hull[k1][0] - hull[k][0],
      ey = hull[k1][1] - hull[k][1];
    const el = Math.hypot(ex, ey);
    if (f) {
      if (hasUV(side)) f.attr = cloneAttr(side);
      else {
        // perimeter mapping: u = running edge length (continuous around the profile)
        const u = vx(ex / el, ey / el, 0);
        const v = cross(u, f.n);
        const p0 = verts[2 * k];
        f.attr = cloneAttr(side, { u, v, u0: perim - dot(p0, u), v0: -dot(p0, v) });
      }
      faces.push(f);
    }
    perim += el;
  }
  const front: number[] = [],
    back: number[] = [];
  for (let k = 0; k < m; k++) {
    front.push(2 * k + 1);
    back.push(2 * k);
  }
  for (const loop of [front, back]) {
    const f = makeFace(verts, loop, caps, inside);
    if (f) {
      f.attr = attrFor(caps, f.n);
      faces.push(f);
    }
  }
  const poly = { verts, faces };
  return xf ? polyTransform(poly, xf) : poly;
}

/** Convex hull of points (quickhull). Coplanar faces are merged. attr may depend on the face normal. */
export function polyFromHull(points: Vec3[], attr: FaceAttr | ((n: Vec3) => FaceAttr)): ConvexPoly {
  return hullPoly(points, (n) => attrFor(typeof attr === "function" ? attr(n) : attr, n));
}

/** Hull → ConvexPoly with attrs from `attrOf(n)` (used as is). Flat/degenerate fallbacks. */
export function hullPoly(points: Vec3[], attrOf: (n: Vec3) => FaceAttr): ConvexPoly {
  const h = quickHull(points);
  if (!h) return flatPoly(points, attrOf);
  return { verts: h.verts, faces: h.faces.map((f) => ({ idx: f.idx, n: f.n, d: f.d, attr: attrOf(f.n) })) };
}

/** Coplanar point set → two-sided flat polygon (volume 0); collinear/insufficient → empty. */
function flatPoly(points: Vec3[], attrOf: (n: Vec3) => FaceAttr): ConvexPoly {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 3) return EMPTY();
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= pts.length;
  cy /= pts.length;
  cz /= pts.length;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = [p.x - cx, p.y - cy, p.z - cz];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[3 * i + j] += d[i] * d[j];
  }
  const eig = jacobiEigenSym3(m);
  let k = 0;
  for (let i = 1; i < 3; i++) if (eig.values[i] < eig.values[k]) k = i;
  const n = unit(eig.vectors[k]);
  const e1 = unit(eig.vectors[(k + 1) % 3]);
  const e2 = cross(n, e1);
  const c = vx(cx, cy, cz);
  const p2 = pts.map((p) => [dot(sub(p, c), e1), dot(sub(p, c), e2)] as [number, number]);
  const scale = scaleOfPoints(pts);
  const hull2 = convexHull2D(p2, 1e-14 * scale * scale);
  if (hull2.length < 3) return EMPTY();
  const verts = hull2.map(([a, b]) => vx(c.x + e1.x * a + e2.x * b, c.y + e1.y * a + e2.y * b, c.z + e1.z * a + e2.z * b));
  const idx = verts.map((_, i) => i);
  const d = dot(n, c);
  const nb = vx(-n.x, -n.y, -n.z);
  return {
    verts,
    faces: [
      { idx, n, d, attr: attrOf(n) },
      { idx: idx.slice().reverse(), n: nb, d: -d, attr: attrOf(nb) },
    ],
  };
}

// ====================================================================== transforms & clipping

/** Rigidly transform (UV maps are carried along so textures stay attached to the surface). */
export function polyTransform(poly: ConvexPoly, xf: Xform): ConvexPoly {
  const q0 = xf?.q;
  const q = q0 && Number.isFinite(q0.x + q0.y + q0.z + q0.w) && Math.hypot(q0.x, q0.y, q0.z, q0.w) > 1e-12 ? qnorm(q0) : { x: 0, y: 0, z: 0, w: 1 };
  const t = vx(fin(xf?.p?.x), fin(xf?.p?.y), fin(xf?.p?.z));
  const verts = poly.verts.map((v) => {
    const r = qrot(q, v);
    return vx(r.x + t.x, r.y + t.y, r.z + t.z);
  });
  const faces = poly.faces.map((f) => {
    const n = qrot(q, f.n);
    const uv = f.attr.uv;
    let nuv: UVMap;
    if (uv) {
      // uv'(p') = uv(p) with p = R⁻¹(p' - t)  ⇒  u' = R u, u0' = u0 - dot(t, u')
      const u = qrot(q, uv.u),
        v = qrot(q, uv.v);
      nuv = { u, v, u0: uv.u0 - dot(t, u), v0: uv.v0 - dot(t, v) };
    } else nuv = zeroUV();
    const nf: PolyFace = { idx: f.idx.slice(), n, d: f.d + dot(n, t), attr: cloneAttr(f.attr, nuv) };
    if (f.vn) nf.vn = f.vn.map((m) => qrot(q, m));
    return nf;
  });
  return { verts, faces };
}

/** Tolerances for a poly: [planeEps, weldEps]. */
export function polyEps(poly: ConvexPoly): [number, number] {
  const s = scaleOfPoints(poly.verts);
  return [Math.max(REL_PLANE_EPS * s, ABS_EPS_FLOOR), Math.max(REL_WELD_EPS * s, ABS_EPS_FLOOR)];
}

/**
 * Clip by the half-space dot(n, p) <= d (keeps the inside). Returns null if nothing remains
 * (or the remainder is degenerate, volume < 1e-9). If `cap` is given, the new cut face gets
 * that attr; if cap.uv.u is the zero vector a planar map is auto-derived from n (using
 * `grain` for the u axis when supplied). If the plane does not cut, returns the input unchanged.
 *
 * `cap === null`: the cut face copies the attr of the clipped face whose normal is closest to n
 * (its uv map too when the normals are within ~45°, which keeps the texture continuous across
 * the new edge; otherwise a fresh planar map). The degenerate-volume threshold is
 * min(1e-9, 1e-3 × input volume) so millimetre-sized parts can still be clipped.
 * Returns the same object when nothing is cut away.
 */
export function polyClip(poly: ConvexPoly, n: Vec3, d: number, cap: FaceAttr | null, grain?: Vec3): ConvexPoly | null {
  const nl = len(n);
  if (!(nl > 1e-300) || !Number.isFinite(d) || poly.faces.length === 0) return poly.faces.length ? poly : null;
  const nx = n.x / nl,
    ny = n.y / nl,
    nz = n.z / nl,
    dd = d / nl;
  const [planeEps, weldEps] = polyEps(poly);
  const w = wpolyFromConvex(poly);
  const r = wpolyClip(w, nx, ny, nz, dd, -1, planeEps, weldEps);
  if (r === CLIP_UNCHANGED) return poly;
  if (r === CLIP_EMPTY) return null;
  const cn = vx(nx, ny, nz);
  let capAttr: FaceAttr;
  if (cap) capAttr = hasUV(cap) ? cloneAttr(cap) : cloneAttr(cap, autoUV(cn, 0, 0, grain));
  else {
    let best: PolyFace | null = null,
      bd = -Infinity;
    for (const f of poly.faces) {
      const q = dot(f.n, cn);
      if (q > bd) {
        bd = q;
        best = f;
      }
    }
    const a = best ? best.attr : faceAttr(0);
    capAttr = bd > 0.7 && hasUV(a) ? cloneAttr(a) : cloneAttr(a, autoUV(cn, a.uv?.u0 ?? 0, a.uv?.v0 ?? 0, grain));
  }
  const out = convexFromW(w, (f) => (f.tag >= 0 ? cloneAttr(poly.faces[f.tag].attr) : cloneAttr(capAttr)));
  const vol = polyVolume(out);
  if (vol < 1e-9 && vol < 1e-3 * polyVolume(poly)) return null;
  return out;
}

/** Working poly → ConvexPoly (face attrs supplied by the caller from each face's tag). */
export function convexFromW(w: WPoly, attrOf: (f: WFace) => FaceAttr): ConvexPoly {
  const p = w.p;
  const verts: Vec3[] = [];
  for (let i = 0; i < p.length; i += 3) verts.push(vx(p[i], p[i + 1], p[i + 2]));
  const faces: PolyFace[] = w.faces.map((f) => {
    const face: PolyFace = { idx: f.v.slice(), n: vx(f.nx, f.ny, f.nz), d: f.d, attr: attrOf(f) };
    if (f.vn) {
      const vn: Vec3[] = [];
      for (let k = 0; k < f.vn.length; k += 3) vn.push(vx(f.vn[k], f.vn[k + 1], f.vn[k + 2]));
      face.vn = vn;
    }
    return face;
  });
  return { verts, faces };
}

// ====================================================================== measures

/** Volume and centroid together (divergence theorem). */
export function polyMassProps(poly: ConvexPoly): { volume: number; centroid: Vec3 } {
  const V = poly.verts;
  if (V.length === 0) return { volume: 0, centroid: vx(0, 0, 0) };
  const o = V[0];
  let vol = 0,
    sx = 0,
    sy = 0,
    sz = 0;
  for (const f of poly.faces) {
    const idx = f.idx;
    if (idx.length < 3) continue;
    const a = V[idx[0]];
    const ax = a.x - o.x,
      ay = a.y - o.y,
      az = a.z - o.z;
    for (let k = 1; k + 1 < idx.length; k++) {
      const b = V[idx[k]],
        c = V[idx[k + 1]];
      const bx = b.x - o.x,
        by = b.y - o.y,
        bz = b.z - o.z;
      const cx = c.x - o.x,
        cy = c.y - o.y,
        cz = c.z - o.z;
      const t = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      vol += t;
      sx += t * (ax + bx + cx);
      sy += t * (ay + by + cy);
      sz += t * (az + bz + cz);
    }
  }
  if (!(Math.abs(vol) > 1e-300) || !Number.isFinite(vol)) {
    let mx = 0,
      my = 0,
      mz = 0;
    for (const v of V) {
      mx += v.x;
      my += v.y;
      mz += v.z;
    }
    return { volume: 0, centroid: vx(mx / V.length, my / V.length, mz / V.length) };
  }
  return { volume: vol, centroid: vx(o.x + sx / (4 * vol), o.y + sy / (4 * vol), o.z + sz / (4 * vol)) };
}

export function polyVolume(poly: ConvexPoly): number {
  return Math.max(0, polyMassProps(poly).volume);
}

export function polyCentroid(poly: ConvexPoly): Vec3 {
  return polyMassProps(poly).centroid;
}

export function polyBounds(poly: ConvexPoly): Bounds {
  const V = poly.verts;
  if (V.length === 0) return { min: vx(0, 0, 0), max: vx(0, 0, 0) };
  const min = vx(Infinity, Infinity, Infinity),
    max = vx(-Infinity, -Infinity, -Infinity);
  for (const v of V) {
    if (v.x < min.x) min.x = v.x;
    if (v.y < min.y) min.y = v.y;
    if (v.z < min.z) min.z = v.z;
    if (v.x > max.x) max.x = v.x;
    if (v.y > max.y) max.y = v.y;
    if (v.z > max.z) max.z = v.z;
  }
  return { min, max };
}

/** Width of the polyhedron along a unit direction (max-min of projections). */
export function polyWidth(poly: ConvexPoly, dir: Vec3): number {
  const d = unit(dir, vx(0, 0, 0));
  if (poly.verts.length === 0 || len(d) === 0) return 0;
  let lo = Infinity,
    hi = -Infinity;
  for (const v of poly.verts) {
    const s = dot(v, d);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return hi - lo;
}

/** Principal extents: sorted [largest, middle, smallest] widths along the poly's principal axes, plus those axes. */
export function polyExtents(poly: ConvexPoly): { ext: [number, number, number]; axes: [Vec3, Vec3, Vec3] } {
  const V = poly.verts;
  if (V.length === 0) return { ext: [0, 0, 0], axes: [vx(1, 0, 0), vx(0, 1, 0), vx(0, 0, 1)] };
  const { volume, centroid: c } = polyMassProps(poly);
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (volume > 0) {
    // solid second moments about the centroid (tetrahedra apex at the centroid)
    for (const f of poly.faces) {
      const idx = f.idx;
      const a = V[idx[0]];
      const A = [a.x - c.x, a.y - c.y, a.z - c.z];
      for (let k = 1; k + 1 < idx.length; k++) {
        const b = V[idx[k]],
          cc = V[idx[k + 1]];
        const B = [b.x - c.x, b.y - c.y, b.z - c.z];
        const C = [cc.x - c.x, cc.y - c.y, cc.z - c.z];
        const vt = (A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
        const S = [A[0] + B[0] + C[0], A[1] + B[1] + C[1], A[2] + B[2] + C[2]];
        const w = vt / 20;
        for (let i = 0; i < 3; i++)
          for (let j = i; j < 3; j++) m[3 * i + j] += w * (A[i] * A[j] + B[i] * B[j] + C[i] * C[j] + S[i] * S[j]);
      }
    }
  } else {
    for (const v of V) {
      const D = [v.x - c.x, v.y - c.y, v.z - c.z];
      for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) m[3 * i + j] += D[i] * D[j];
    }
  }
  m[3] = m[1];
  m[6] = m[2];
  m[7] = m[5];
  const eig = jacobiEigenSym3(m);
  const items = eig.vectors.map((ax) => {
    const a = unit(ax, vx(1, 0, 0));
    return { a, w: polyWidth(poly, a) };
  });
  items.sort((p, q) => q.w - p.w);
  return { ext: [items[0].w, items[1].w, items[2].w], axes: [items[0].a, items[1].a, items[2].a] };
}

/** Signed distance proxy: max over faces of dot(n,p) - d (<= 0 inside). */
export function polySignedDist(poly: ConvexPoly, p: Vec3): number {
  if (poly.faces.length === 0) return Infinity;
  let m = -Infinity;
  for (const f of poly.faces) {
    const s = f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d;
    if (s > m) m = s;
  }
  return m;
}

/** True if p is inside or on the poly (within eps, default 1e-9 × scale). */
export function polyContains(poly: ConvexPoly, p: Vec3, eps?: number): boolean {
  return polySignedDist(poly, p) <= (eps ?? polyEps(poly)[0]);
}

/** Closest point on/in the polyhedron to p (p itself if inside). */
export function polyClosestPoint(poly: ConvexPoly, p: Vec3): Vec3 {
  if (poly.faces.length === 0) return vx(p.x, p.y, p.z);
  if (polySignedDist(poly, p) <= 0) return vx(p.x, p.y, p.z);
  let best: Vec3 | null = null,
    bd = Infinity;
  for (const f of poly.faces) {
    const s = dot(f.n, p) - f.d;
    if (s <= 0) continue;
    const q = closestOnFace(poly, f, p);
    const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = q;
    }
  }
  return best ?? vx(p.x, p.y, p.z);
}

/** Closest point to p on a convex face polygon. */
export function closestOnFace(poly: ConvexPoly, f: PolyFace, p: Vec3): Vec3 {
  const V = poly.verts;
  const s = dot(f.n, p) - f.d;
  const q = vx(p.x - f.n.x * s, p.y - f.n.y * s, p.z - f.n.z * s);
  const idx = f.idx;
  const m = idx.length;
  let inside = true;
  for (let k = 0; k < m; k++) {
    const a = V[idx[k]],
      b = V[idx[k + 1 === m ? 0 : k + 1]];
    const e = sub(b, a);
    const c = cross(e, sub(q, a));
    if (dot(c, f.n) < 0) {
      inside = false;
      break;
    }
  }
  if (inside) return q;
  let best = q,
    bd = Infinity;
  for (let k = 0; k < m; k++) {
    const a = V[idx[k]],
      b = V[idx[k + 1 === m ? 0 : k + 1]];
    const e = sub(b, a);
    const el2 = dot(e, e);
    let t = el2 > 0 ? dot(sub(p, a), e) / el2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const c = vx(a.x + e.x * t, a.y + e.y * t, a.z + e.z * t);
    const dd = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = c;
    }
  }
  return best;
}

/**
 * Parametric interval [tMin, tMax] where origin + t·dir lies inside the poly, or null if the line
 * misses it. With a unit dir, tMax - tMin is the chord length (local thickness along dir).
 */
export function polyChord(poly: ConvexPoly, origin: Vec3, dir: Vec3): { tMin: number; tMax: number } | null {
  let t0 = -Infinity,
    t1 = Infinity;
  if (poly.faces.length === 0) return null;
  for (const f of poly.faces) {
    const den = dot(f.n, dir);
    const num = f.d - dot(f.n, origin);
    if (Math.abs(den) < 1e-15) {
      if (num < 0) return null;
      continue;
    }
    const t = num / den;
    if (den > 0) {
      if (t < t1) t1 = t;
    } else if (t > t0) t0 = t;
    if (t0 > t1) return null;
  }
  return Number.isFinite(t0) && Number.isFinite(t1) ? { tMin: t0, tMax: t1 } : null;
}

/** Unique vertex positions packed xyz (for Havok convex-hull shapes). */
export function polyPoints(poly: ConvexPoly): Float32Array {
  const used = new Uint8Array(poly.verts.length);
  for (const f of poly.faces) for (const i of f.idx) used[i] = 1;
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < poly.verts.length; i++) {
    if (!used[i]) continue;
    const v = poly.verts[i];
    const key = `${Math.fround(v.x)},${Math.fround(v.y)},${Math.fround(v.z)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.x, v.y, v.z);
  }
  return new Float32Array(out);
}

/** Area of one face. */
export function polyFaceArea(poly: ConvexPoly, face: PolyFace): number {
  return polygonArea(poly.verts, face.idx);
}

/** Total surface area. */
export function polySurfaceArea(poly: ConvexPoly): number {
  let a = 0;
  for (const f of poly.faces) a += polygonArea(poly.verts, f.idx);
  return a;
}

/**
 * Area of the intersection face between two touching cells along plane (n,d) — used for bond strength.
 * Sums the faces of `poly` lying in that plane (either orientation). eps default: max(1e-6 m, 1e-5 × size).
 */
export function polyFaceAreaOnPlane(poly: ConvexPoly, n: Vec3, d: number, eps?: number): number {
  const nl = len(n);
  if (!(nl > 1e-300)) return 0;
  const nn = vx(n.x / nl, n.y / nl, n.z / nl);
  const dd = d / nl;
  const tol = eps ?? Math.max(1e-6, 1e-5 * scaleOfPoints(poly.verts));
  let area = 0;
  for (const f of poly.faces) {
    if (Math.abs(dot(f.n, nn)) < 0.999) continue;
    let ok = true;
    for (const i of f.idx) {
      if (Math.abs(dot(nn, poly.verts[i]) - dd) > tol) {
        ok = false;
        break;
      }
    }
    if (ok) area += polygonArea(poly.verts, f.idx);
  }
  return area;
}

/**
 * Indices of the faces of `poly` that are completely covered by a coincident, opposite-facing
 * face of one of `others` (fused tiles, bonded fracture cells, stacked boards). When touching
 * parts are batched into one mesh, drawing such internal faces causes depth ties along the
 * shared edges, visible as thin dark seams on smooth surfaces; skip them when building render
 * geometry:  faces.filter((_, i) => !hidden.has(i)).  tol default: 1e-6 × size + 1e-7 m.
 */
export function polyHiddenFaces(poly: ConvexPoly, others: readonly ConvexPoly[], tol?: number): Set<number> {
  const hidden = new Set<number>();
  if (!poly.faces.length || !others.length) return hidden;
  const t = tol ?? 1e-6 * scaleOfPoints(poly.verts) + 1e-7;
  const b = polyBounds(poly);
  const cands = others.filter((o) => {
    if (o === poly || !o.faces.length) return false;
    const c = polyBounds(o);
    return !(c.min.x > b.max.x + t || c.max.x < b.min.x - t || c.min.y > b.max.y + t || c.max.y < b.min.y - t || c.min.z > b.max.z + t || c.max.z < b.min.z - t);
  });
  if (!cands.length) return hidden;
  for (let fi = 0; fi < poly.faces.length; fi++) {
    const f = poly.faces[fi];
    let covered = false;
    for (const o of cands) {
      for (const h of o.faces) {
        if (dot(f.n, h.n) > -1 + 1e-6 || Math.abs(f.d + h.d) > t) continue;
        // every vertex of f inside h's polygon (h is CCW around h.n)
        let inside = true;
        const m = h.idx.length;
        for (const vi of f.idx) {
          const p = poly.verts[vi];
          for (let k = 0; k < m && inside; k++) {
            const a = o.verts[h.idx[k]],
              c = o.verts[h.idx[k + 1 === m ? 0 : k + 1]];
            const e = sub(c, a);
            if (dot(cross(e, sub(p, a)), h.n) < -t * len(e)) inside = false;
          }
          if (!inside) break;
        }
        if (inside) {
          covered = true;
          break;
        }
      }
      if (covered) break;
    }
    if (covered) hidden.add(fi);
  }
  return hidden;
}

/** Deep copy. */
export function polyClone(poly: ConvexPoly): ConvexPoly {
  return {
    verts: poly.verts.map((v) => vx(v.x, v.y, v.z)),
    faces: poly.faces.map((f) => {
      const nf: PolyFace = { idx: f.idx.slice(), n: vx(f.n.x, f.n.y, f.n.z), d: f.d, attr: cloneAttr(f.attr) };
      if (f.vn) nf.vn = f.vn.map((m) => vx(m.x, m.y, m.z));
      return nf;
    }),
  };
}
