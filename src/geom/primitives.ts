// Curved-shape helpers that decompose non-convex objects into convex tiles (bowls, basins,
// tubs, rings, cushions, bottles). Each tile is a ConvexPoly; callers bond tiles together with
// `fused` bonds so the object behaves as one solid until it breaks along tile seams (and tiles
// themselves can further fracture). PURE MODULE. Implementation by the geometry agent.
//
// Conventions:
//  * Surfaces of revolution (lathe, torus, arc panel, ellipsoid) revolve about local +Y; the
//    angle θ is measured from +X towards +Z: point = (r cos θ, y, r sin θ).
//  * Each lathe/torus/arc tile is the convex hull of its corner points. Tiles are built with
//    their exact topology when that hull is the expected hexahedron (fast path) and fall back to
//    quickhull otherwise (tiles collapsing at the axis, non-convex miters).
//  * Smooth surfaces (outer/inner shells, tube surfaces) carry analytic per-vertex normals `vn`
//    so they shade smoothly across tiles AND across fracture fragments. Their UVs wrap around the
//    axis (u = arc length, v = meridian arc length) when the attr has no explicit uv.

import type { Vec3, Xform } from "./vec.ts";
import type { ConvexPoly, FaceAttr, PolyFace } from "./poly.ts";
import { polyTransform, makeFace, hasUV, cloneAttr, attrFor, autoUV, revolveUV, hullPoly, polyBox, polyPrism } from "./poly.ts";
import { quickHull } from "./hull.ts";

export interface Tile {
  poly: ConvexPoly;
  /** Grid coordinates of the tile (ring index around, row index along the profile). */
  i: number;
  j: number;
}

export interface LatheOptions {
  /** Profile as [radius, y] points from bottom to top (the outer surface). */
  profile: Array<[number, number]>;
  /** Wall thickness (m), measured inward along the profile normal. */
  thickness: number;
  /** Segments around the axis. */
  segments: number;
  /** Optional angular range (radians) for partial lathes (e.g. a basin's back cut-off). Default full 2π. */
  angleStart?: number;
  angleEnd?: number;
  /** Close the bottom with a cap tile set (bowls, cups). */
  capBottom?: boolean;
  outer: FaceAttr; // smooth group should be non-zero
  inner: FaceAttr;
  edge: FaceAttr; // rim / seams
  xf?: Xform;
}

const vx = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const TWO_PI = Math.PI * 2;

// ====================================================================== tile assembly core

/**
 * One convex tile from 8 labelled corner points (o = outer surface, i = inner surface; a/b =
 * first/second angle; 0/1 = first/second profile station). `on`/`inn` = analytic normals of the
 * outer/inner points (inner normals already point out of the solid, i.e. into the cavity).
 */
interface TileCorners {
  P: Vec3[]; // [o_a0, o_b0, o_b1, o_a1, i_a0, i_b0, i_b1, i_a1]
  N: Vec3[]; // analytic normals per point (outer: outward, inner: into the cavity)
}

interface TileStyle {
  outer: FaceAttr;
  inner: FaceAttr;
  edge: FaceAttr;
  /** UV for a smooth face with normal n whose outer/inner side is `inner`. */
  uv: (n: Vec3, inner: boolean) => ReturnType<typeof autoUV> | null;
}

const OUTER = [0, 1, 2, 3];
const INNER = [4, 7, 6, 5];
const SIDE_A = [0, 3, 7, 4];
const SIDE_B = [1, 5, 6, 2];
const ST_0 = [0, 4, 5, 1];
const ST_1 = [3, 2, 6, 7];

function buildTile(c: TileCorners, st: TileStyle, tol: number): ConvexPoly | null {
  const P = c.P;
  // collapsed corners (axis, zero thickness) → hull path
  let collapsed = false;
  for (let a = 0; a < 8 && !collapsed; a++)
    for (let b = a + 1; b < 8; b++) {
      const dx = P[a].x - P[b].x,
        dy = P[a].y - P[b].y,
        dz = P[a].z - P[b].z;
      if (dx * dx + dy * dy + dz * dz <= tol * tol) {
        collapsed = true;
        break;
      }
    }
  if (!collapsed) {
    const fast = tileFast(c, st, tol);
    if (fast) return fast;
  }
  return tileHull(c, st, tol);
}

function tileFast(c: TileCorners, st: TileStyle, tol: number): ConvexPoly | null {
  const verts = c.P.map((p) => vx(p.x, p.y, p.z));
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const p of verts) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const inside = vx(cx / 8, cy / 8, cz / 8);
  const defs: Array<[number[], 0 | 1 | 2]> = [
    [OUTER, 0],
    [INNER, 1],
    [SIDE_A, 2],
    [SIDE_B, 2],
    [ST_0, 2],
    [ST_1, 2],
  ];
  const faces: PolyFace[] = [];
  for (const [loop, kind] of defs) {
    const attr = kind === 0 ? st.outer : kind === 1 ? st.inner : st.edge;
    const smooth = kind !== 2 && attr.smooth !== 0;
    const f = makeFace(verts, loop, attr, inside, smooth ? loop.map((k) => c.N[k]) : undefined);
    if (!f) return null;
    // planarity + global convexity
    for (const k of loop) if (Math.abs(f.n.x * verts[k].x + f.n.y * verts[k].y + f.n.z * verts[k].z - f.d) > tol) return null;
    for (const p of verts) if (f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d > tol) return null;
    f.attr = styleAttr(st, kind, f.n);
    faces.push(f);
  }
  return { verts, faces };
}

function tileHull(c: TileCorners, st: TileStyle, tol: number): ConvexPoly | null {
  const h = quickHull(c.P);
  if (!h) return null;
  const verts = h.verts;
  const faces: PolyFace[] = [];
  for (const hf of h.faces) {
    const srcs = hf.idx.map((k) => h.src[k]);
    const allOuter = srcs.every((s) => s < 4);
    const allInner = srcs.every((s) => s >= 4);
    // outer/inner only if the face actually lies on that surface (not a station/side face whose
    // remaining corners collapsed) — check normal agreement with the analytic normals
    let kind: 0 | 1 | 2 = 2;
    if (allOuter || allInner) {
      let agree = 0;
      for (const s of srcs) agree += hf.n.x * c.N[s].x + hf.n.y * c.N[s].y + hf.n.z * c.N[s].z;
      if (agree / srcs.length > 0.3) kind = allOuter ? 0 : 1;
    }
    const attr = kind === 0 ? st.outer : kind === 1 ? st.inner : st.edge;
    const face: PolyFace = { idx: hf.idx, n: hf.n, d: hf.d, attr: styleAttr(st, kind, hf.n) };
    if (kind !== 2 && attr.smooth !== 0) face.vn = srcs.map((s) => vx(c.N[s].x, c.N[s].y, c.N[s].z));
    faces.push(face);
  }
  void tol;
  return { verts, faces };
}

function styleAttr(st: TileStyle, kind: 0 | 1 | 2, n: Vec3): FaceAttr {
  if (kind === 2) return attrFor(st.edge, n);
  const a = kind === 0 ? st.outer : st.inner;
  if (hasUV(a)) return cloneAttr(a);
  const uv = st.uv(n, kind === 1);
  return uv ? cloneAttr(a, uv) : attrFor(a, n);
}

// ====================================================================== lathe

interface Station {
  r: number;
  y: number;
}

/** Thick-walled surface of revolution split into convex tiles (segments × profile spans). */
export function latheTiles(opts: LatheOptions): Tile[] {
  const raw = (opts.profile ?? []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (raw.length < 2) return [];
  let maxR = 0,
    minY = Infinity,
    maxY = -Infinity;
  for (const [r, y] of raw) {
    maxR = Math.max(maxR, Math.abs(r));
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const scale = Math.max(2 * maxR, maxY - minY, 1e-6);
  const tiny = 1e-7 * scale;
  const prof: Station[] = [];
  for (const [r, y] of raw) {
    const s = { r: Math.max(0, r), y };
    const last = prof[prof.length - 1];
    if (last && Math.hypot(last.r - s.r, last.y - s.y) <= tiny) continue;
    prof.push(s);
  }
  if (opts.capBottom && prof.length && prof[0].r > tiny) prof.unshift({ r: 0, y: prof[0].y });
  if (prof.length < 2) return [];
  const t = Math.abs(opts.thickness);
  if (!(t > tiny)) return [];
  const a0 = opts.angleStart ?? 0;
  let a1 = opts.angleEnd ?? a0 + TWO_PI;
  if (!(a1 > a0)) return [];
  if (a1 - a0 > TWO_PI) a1 = a0 + TWO_PI;
  const full = a1 - a0 >= TWO_PI - 1e-9;
  const segs = Math.max(full ? 3 : 1, Math.floor(Number.isFinite(opts.segments) ? opts.segments : 16));

  // outward profile normals per span (2D in the r-y half plane)
  const P = prof.length;
  const segN: Array<[number, number]> = [];
  for (let s = 0; s + 1 < P; s++) {
    const dr = prof[s + 1].r - prof[s].r,
      dy = prof[s + 1].y - prof[s].y;
    const l = Math.hypot(dr, dy);
    segN.push([dy / l, -dr / l]);
  }
  // inner (offset) profile with mitred corners; smooth vertex normals at gentle corners
  const inner: Station[] = [];
  const stN: Array<[number, number]> = []; // averaged normal at each station
  const smoothAt: boolean[] = [];
  for (let k = 0; k < P; k++) {
    let n: [number, number];
    let dist = t;
    let smooth = false;
    if (k === 0) n = segN[0];
    else if (k === P - 1) n = segN[P - 2];
    else {
      const a = segN[k - 1],
        b = segN[k];
      const mx = a[0] + b[0],
        my = a[1] + b[1];
      const ml = Math.hypot(mx, my);
      n = ml > 1e-9 ? [mx / ml, my / ml] : b;
      const cosHalf = n[0] * b[0] + n[1] * b[1];
      dist = t / Math.max(cosHalf, 0.35);
      smooth = a[0] * b[0] + a[1] * b[1] > Math.cos((40 * Math.PI) / 180);
    }
    stN.push(n);
    smoothAt.push(smooth);
    inner.push({ r: Math.max(0, prof[k].r - n[0] * dist), y: prof[k].y - n[1] * dist });
  }
  // meridian arc length per station (for v) and reference radius (for u)
  const arcLen: number[] = [0];
  for (let k = 1; k < P; k++) arcLen.push(arcLen[k - 1] + Math.hypot(prof[k].r - prof[k - 1].r, prof[k].y - prof[k - 1].y));
  let rRef = 0;
  for (const s of prof) rRef += s.r;
  rRef = Math.max(rRef / P, 1e-6);

  const tol = 1e-7 * scale;
  const tiles: Tile[] = [];
  const angle = (i: number) => a0 + ((a1 - a0) * i) / segs;
  for (let s = 0; s + 1 < P; s++) {
    // normals at the two stations of this span (crease at sharp profile corners)
    const n0 = smoothAt[s] ? stN[s] : segN[s];
    const n1 = smoothAt[s + 1] ? stN[s + 1] : segN[s];
    for (let i = 0; i < segs; i++) {
      const ta = angle(i),
        tb = angle(i + 1);
      const ca = Math.cos(ta),
        sa = Math.sin(ta),
        cb = Math.cos(tb),
        sb = Math.sin(tb);
      const pt = (st: Station, c: number, sn: number) => vx(st.r * c, st.y, st.r * sn);
      const nr = (n: [number, number], c: number, sn: number, sign: number) => vx(sign * n[0] * c, sign * n[1], sign * n[0] * sn);
      const corners: TileCorners = {
        P: [
          pt(prof[s], ca, sa),
          pt(prof[s], cb, sb),
          pt(prof[s + 1], cb, sb),
          pt(prof[s + 1], ca, sa),
          pt(inner[s], ca, sa),
          pt(inner[s], cb, sb),
          pt(inner[s + 1], cb, sb),
          pt(inner[s + 1], ca, sa),
        ],
        N: [
          nr(n0, ca, sa, 1),
          nr(n0, cb, sb, 1),
          nr(n1, cb, sb, 1),
          nr(n1, ca, sa, 1),
          nr(n0, ca, sa, -1),
          nr(n0, cb, sb, -1),
          nr(n1, cb, sb, -1),
          nr(n1, ca, sa, -1),
        ],
      };
      const am = (ta + tb) / 2;
      const cm = Math.cos(am),
        sm = Math.sin(am);
      const style: TileStyle = {
        outer: opts.outer,
        inner: opts.inner,
        edge: opts.edge,
        uv: (n, isInner) => {
          const st = isInner ? inner[s] : prof[s];
          return revolveUV(n, am, rRef, vx(st.r * cm, st.y, st.r * sm), arcLen[s]);
        },
      };
      const poly = buildTile(corners, style, tol);
      if (!poly) continue;
      tiles.push({ poly: opts.xf ? polyTransform(poly, opts.xf) : poly, i, j: s });
    }
  }
  return tiles;
}

// ====================================================================== torus

/** Ring / torus segment tiles (toilet seat, steering-wheel-like rings, pipe elbows). */
export function torusTiles(
  majorR: number,
  minorR: number,
  segments: number,
  sides: number,
  attr: FaceAttr,
  xf?: Xform,
  arc?: number,
): Tile[] {
  const R = Math.abs(majorR),
    r = Math.abs(minorR);
  if (!(R > 0) || !(r > 0) || !Number.isFinite(R) || !Number.isFinite(r)) return [];
  const span = Math.min(Math.abs(arc ?? TWO_PI) || TWO_PI, TWO_PI);
  const full = span >= TWO_PI - 1e-9;
  const segs = Math.max(full ? 3 : 1, Math.floor(Number.isFinite(segments) ? segments : 16));
  const nSides = Math.max(3, Math.floor(Number.isFinite(sides) ? sides : 8));
  const scale = 2 * (R + r);
  const tol = 1e-7 * scale;
  const smooth = attr.smooth !== 0;
  const tiles: Tile[] = [];
  const phi = (i: number) => (span * i) / segs;
  const alpha = (k: number) => (TWO_PI * k) / nSides;
  for (let i = 0; i < segs; i++) {
    const pa = phi(i),
      pb = phi(i + 1);
    const pts: Vec3[] = [];
    const nrm: Vec3[] = [];
    for (const p of [pa, pb]) {
      const cp = Math.cos(p),
        sp = Math.sin(p);
      for (let k = 0; k < nSides; k++) {
        const ca = Math.cos(alpha(k)),
          sa = Math.sin(alpha(k));
        const rr = R + r * ca;
        pts.push(vx(rr * cp, r * sa, rr * sp));
        nrm.push(vx(ca * cp, sa, ca * sp));
      }
    }
    // tube faces k: [A_k, A_k+1, B_k+1, B_k]; caps: ring A, ring B
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const inside = vx(cx / pts.length, cy / pts.length, cz / pts.length);
    const pm = (pa + pb) / 2;
    let poly: ConvexPoly | null = { verts: pts.map((p) => vx(p.x, p.y, p.z)), faces: [] };
    for (let k = 0; k < nSides && poly; k++) {
      const k1 = (k + 1) % nSides;
      const loop = [k, k1, nSides + k1, nSides + k];
      const f = makeFace(poly.verts, loop, attr, inside, smooth ? loop.map((q) => nrm[q]) : undefined);
      if (!f) {
        poly = null;
        break;
      }
      const am = alpha(k);
      const cpm = Math.cos(pm),
        spm = Math.sin(pm);
      const org = vx((R + r * Math.cos(am)) * cpm, r * Math.sin(am), (R + r * Math.cos(am)) * spm);
      f.attr = hasUV(attr) ? cloneAttr(attr) : cloneAttr(attr, revolveUV(f.n, pm, R, org, r * am));
      poly.faces.push(f);
    }
    if (poly) {
      for (const ring of [0, 1]) {
        const loop: number[] = [];
        for (let k = 0; k < nSides; k++) loop.push(ring * nSides + k);
        const f = makeFace(poly.verts, loop, attr, inside);
        if (!f) {
          poly = null;
          break;
        }
        f.attr = attrFor(attr, f.n);
        poly.faces.push(f);
      }
    }
    // convexity check, else hull fallback
    if (poly && !isConvexWithin(poly, tol)) poly = null;
    if (!poly) {
      const isCap = (srcs: number[]) => srcs.every((s) => s < nSides) || srcs.every((s) => s >= nSides);
      const h = quickHull(pts);
      if (!h) continue;
      poly = {
        verts: h.verts,
        faces: h.faces.map((hf) => {
          const srcs = hf.idx.map((q) => h.src[q]);
          const cap = isCap(srcs) && srcs.length >= 3;
          const face: PolyFace = { idx: hf.idx, n: hf.n, d: hf.d, attr: attrFor(attr, hf.n) };
          if (!cap && smooth) face.vn = srcs.map((s) => vx(nrm[s].x, nrm[s].y, nrm[s].z));
          return face;
        }),
      };
    }
    tiles.push({ poly: xf ? polyTransform(poly, xf) : poly, i, j: 0 });
  }
  return tiles;
}

function isConvexWithin(poly: ConvexPoly, tol: number): boolean {
  for (const f of poly.faces) {
    for (const k of f.idx) if (Math.abs(f.n.x * poly.verts[k].x + f.n.y * poly.verts[k].y + f.n.z * poly.verts[k].z - f.d) > tol) return false;
    for (const p of poly.verts) if (f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d > tol) return false;
  }
  return true;
}

// ====================================================================== arc panel

/**
 * Curved panel (cylindrical arc) of given radius/arc/height/thickness split into convex strips.
 * Axis = local Y through the origin; the arc is centred on +Z (apex at z = radius); outer surface
 * at `radius`, inner at radius − thickness; y ∈ [−height/2, height/2]. Tiles: i = strip, j = 0.
 */
export function arcPanelTiles(
  radius: number,
  arc: number,
  height: number,
  thickness: number,
  segments: number,
  outer: FaceAttr,
  inner: FaceAttr,
  edge: FaceAttr,
  xf?: Xform,
): Tile[] {
  const R = Math.abs(radius),
    h = Math.abs(height);
  const span = Math.min(Math.abs(arc), TWO_PI);
  if (!(R > 0) || !(h > 0) || !(span > 0)) return [];
  const mid = Math.PI / 2;
  return latheTiles({
    profile: [
      [R, -h / 2],
      [R, h / 2],
    ],
    thickness: Math.min(Math.abs(thickness), R),
    segments,
    angleStart: mid - span / 2,
    angleEnd: mid + span / 2,
    outer,
    inner,
    edge,
    xf,
  });
}

// ====================================================================== ellipsoid & pillow

/** Convex approximation of an ellipsoid (smooth shaded) — fruit, knobs, bulbs. */
export function polyEllipsoid(radii: Vec3, segments: number, rings: number, attr: FaceAttr, xf?: Xform): ConvexPoly {
  const a = Math.abs(radii.x),
    b = Math.abs(radii.y),
    c = Math.abs(radii.z);
  if (!(a > 0 && b > 0 && c > 0) || !Number.isFinite(a + b + c)) return { verts: [], faces: [] };
  const segs = Math.max(3, Math.floor(Number.isFinite(segments) ? segments : 10));
  const nr = Math.max(2, Math.floor(Number.isFinite(rings) ? rings : 6));
  const verts: Vec3[] = [vx(0, -b, 0)];
  const normal = (p: Vec3) => {
    const nx = p.x / (a * a),
      ny = p.y / (b * b),
      nz = p.z / (c * c);
    const l = Math.hypot(nx, ny, nz) || 1;
    return vx(nx / l, ny / l, nz / l);
  };
  const ring: number[][] = [];
  for (let k = 1; k < nr; k++) {
    const beta = (Math.PI * k) / nr;
    const row: number[] = [];
    for (let j = 0; j < segs; j++) {
      const th = (TWO_PI * j) / segs;
      row.push(verts.length);
      verts.push(vx(a * Math.sin(beta) * Math.cos(th), -b * Math.cos(beta), c * Math.sin(beta) * Math.sin(th)));
    }
    ring.push(row);
  }
  const north = verts.length;
  verts.push(vx(0, b, 0));
  const smooth = attr.smooth !== 0;
  const inside = vx(0, 0, 0);
  const rRef = (a + c) / 2;
  const merid = (a + b + c) / 3;
  const faces: PolyFace[] = [];
  const add = (loop: number[], thMid: number, vRow: number, vOrg: Vec3) => {
    const f = makeFace(verts, loop, attr, inside, smooth ? loop.map((q) => normal(verts[q])) : undefined);
    if (!f) return;
    f.attr = hasUV(attr) ? cloneAttr(attr) : cloneAttr(attr, revolveUV(f.n, thMid, rRef, vOrg, vRow));
    faces.push(f);
  };
  for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs;
    const thm = (TWO_PI * (j + 0.5)) / segs;
    add([0, ring[0][j1], ring[0][j]], thm, 0, verts[0]);
    for (let k = 0; k + 1 < ring.length; k++) {
      add([ring[k][j], ring[k][j1], ring[k + 1][j1], ring[k + 1][j]], thm, (merid * Math.PI * (k + 1)) / nr, verts[ring[k][j]]);
    }
    const last = ring[ring.length - 1];
    add([last[j], last[j1], north], thm, (merid * Math.PI * (nr - 1)) / nr, verts[last[j]]);
  }
  const poly = { verts, faces };
  return xf ? polyTransform(poly, xf) : poly;
}

/**
 * Rounded "pillow" box (convex, smooth shaded): cushions, mattresses, pillows.
 * Superellipsoid |x/a|^(2/e) + |y/b|^(2/e) + |z/c|^(2/e) = 1 with e = roundness (0.03..1: ~box ..
 * ellipsoid), sampled on a cube-sphere grid and hulled; analytic normals; box-projected UVs.
 */
export function polyPillow(size: Vec3, roundness: number, attr: FaceAttr, xf?: Xform): ConvexPoly {
  const a = Math.abs(size.x) / 2,
    b = Math.abs(size.y) / 2,
    c = Math.abs(size.z) / 2;
  if (!(a > 0 && b > 0 && c > 0) || !Number.isFinite(a + b + c)) return { verts: [], faces: [] };
  const e = Math.min(1, Math.max(0.03, Number.isFinite(roundness) ? roundness : 0.3));
  const p = 2 / e;
  const N = 6;
  const pts: Vec3[] = [];
  const nrm: Vec3[] = [];
  const seen = new Set<string>();
  const sample = (qx: number, qy: number, qz: number) => {
    const key = `${qx.toFixed(6)},${qy.toFixed(6)},${qz.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const s = Math.pow(Math.pow(Math.abs(qx), p) + Math.pow(Math.abs(qy), p) + Math.pow(Math.abs(qz), p), -1 / p);
    const x = qx * s,
      y = qy * s,
      z = qz * s; // on the unit superellipsoid
    pts.push(vx(a * x, b * y, c * z));
    // gradient of F(x/a, y/b, z/c)
    const gx = (Math.sign(x) * Math.pow(Math.abs(x), p - 1)) / a;
    const gy = (Math.sign(y) * Math.pow(Math.abs(y), p - 1)) / b;
    const gz = (Math.sign(z) * Math.pow(Math.abs(z), p - 1)) / c;
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm.push(vx(gx / l, gy / l, gz / l));
  };
  for (let u = 0; u <= N; u++) {
    for (let v = 0; v <= N; v++) {
      const s = -1 + (2 * u) / N,
        t = -1 + (2 * v) / N;
      sample(1, s, t);
      sample(-1, s, t);
      sample(s, 1, t);
      sample(s, -1, t);
      sample(s, t, 1);
      sample(s, t, -1);
    }
  }
  const h = quickHull(pts);
  if (!h) return { verts: [], faces: [] };
  const axes = [vx(1, 0, 0), vx(-1, 0, 0), vx(0, 1, 0), vx(0, -1, 0), vx(0, 0, 1), vx(0, 0, -1)];
  const smooth = attr.smooth !== 0;
  const faces: PolyFace[] = h.faces.map((hf) => {
    let bk = 0,
      bd = -Infinity;
    for (let k = 0; k < 6; k++) {
      const d = hf.n.x * axes[k].x + hf.n.y * axes[k].y + hf.n.z * axes[k].z;
      if (d > bd) {
        bd = d;
        bk = k;
      }
    }
    const face: PolyFace = { idx: hf.idx, n: hf.n, d: hf.d, attr: hasUV(attr) ? cloneAttr(attr) : cloneAttr(attr, autoUV(axes[bk])) };
    if (smooth) face.vn = hf.idx.map((q) => {
      const m = nrm[h.src[q]];
      return vx(m.x, m.y, m.z);
    });
    return face;
  });
  const poly = { verts: h.verts, faces };
  return xf ? polyTransform(poly, xf) : poly;
}

// ====================================================================== frames & slabs

/**
 * Hollow rectangular frame (picture frame, window frame, door casing) as 4 convex bars with mitred ends.
 * Frame in the local XY plane centred at the origin (width along X, height along Y), depth along Z.
 * Returns [top, bottom, left, right]; UVs (when not explicit) run along each bar (grain).
 */
export function frameBars(
  outerW: number,
  outerH: number,
  bar: number,
  depth: number,
  attr: FaceAttr,
  xf?: Xform,
): ConvexPoly[] {
  const W = Math.abs(outerW) / 2,
    H = Math.abs(outerH) / 2;
  const t = Math.min(Math.abs(bar), Math.min(W, H) * 0.999);
  if (!(W > 0 && H > 0 && t > 0 && Math.abs(depth) > 0)) return [];
  const profiles: Array<{ prof: Array<[number, number]>; grain: Vec3 }> = [
    {
      prof: [
        [-W, H],
        [W, H],
        [W - t, H - t],
        [-W + t, H - t],
      ],
      grain: vx(1, 0, 0),
    },
    {
      prof: [
        [-W, -H],
        [-W + t, -H + t],
        [W - t, -H + t],
        [W, -H],
      ],
      grain: vx(1, 0, 0),
    },
    {
      prof: [
        [-W, -H],
        [-W, H],
        [-W + t, H - t],
        [-W + t, -H + t],
      ],
      grain: vx(0, 1, 0),
    },
    {
      prof: [
        [W, -H],
        [W - t, -H + t],
        [W - t, H - t],
        [W, H],
      ],
      grain: vx(0, 1, 0),
    },
  ];
  const out: ConvexPoly[] = [];
  for (const { prof, grain } of profiles) {
    const poly = polyPrism(prof, depth, attr, attr);
    for (const f of poly.faces) f.attr = hasUV(attr) ? cloneAttr(attr) : cloneAttr(attr, autoUV(f.n, 0, 0, grain));
    out.push(xf ? polyTransform(poly, xf) : poly);
  }
  return out;
}

/**
 * Split a box-shaped slab into an nx × ny grid of convex boxes (tiles, pre-scored panels).
 * The thinnest axis of `size` is the slab normal. nx runs along X (or Z when the slab faces X),
 * ny along Y (or Z when the slab is horizontal): thin Z → (X, Y); thin Y → (X, Z); thin X → (Z, Y).
 * `gap` separates neighbouring tiles; the outer edges are flush with the slab. Without explicit
 * uv every tile face's texture starts at the tile's own corner (one repeat per tile when the
 * surface world size equals the tile size).
 */
export function slabGrid(size: Vec3, nx: number, ny: number, gap: number, attr: FaceAttr, xf?: Xform): Tile[] {
  const S = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];
  if (!(S[0] > 0 && S[1] > 0 && S[2] > 0)) return [];
  const thin = S[0] <= S[1] && S[0] <= S[2] ? 0 : S[1] <= S[2] ? 1 : 2;
  const [ax, ay] = thin === 2 ? [0, 1] : thin === 1 ? [0, 2] : [2, 1];
  const cx = Math.max(1, Math.floor(nx) || 1),
    cy = Math.max(1, Math.floor(ny) || 1);
  const g = Math.max(0, Math.min(Math.abs(gap) || 0, Math.min(S[ax] / cx, S[ay] / cy) * 0.9));
  const w = (S[ax] - (cx - 1) * g) / cx,
    hgt = (S[ay] - (cy - 1) * g) / cy;
  const tiles: Tile[] = [];
  for (let i = 0; i < cx; i++) {
    for (let j = 0; j < cy; j++) {
      const sz = [S[0], S[1], S[2]];
      sz[ax] = w;
      sz[ay] = hgt;
      const c = [0, 0, 0];
      c[ax] = -S[ax] / 2 + i * (w + g) + w / 2;
      c[ay] = -S[ay] / 2 + j * (hgt + g) + hgt / 2;
      const box = polyBox(vx(sz[0], sz[1], sz[2]), attr, { p: vx(c[0], c[1], c[2]), q: { x: 0, y: 0, z: 0, w: 1 } });
      if (!hasUV(attr)) {
        for (const f of box.faces) {
          const uv = autoUV(f.n);
          let umin = Infinity,
            vmin = Infinity;
          for (const k of f.idx) {
            const p = box.verts[k];
            umin = Math.min(umin, p.x * uv.u.x + p.y * uv.u.y + p.z * uv.u.z);
            vmin = Math.min(vmin, p.x * uv.v.x + p.y * uv.v.y + p.z * uv.v.z);
          }
          uv.u0 = -umin;
          uv.v0 = -vmin;
          f.attr = cloneAttr(attr, uv);
        }
      }
      tiles.push({ poly: xf ? polyTransform(box, xf) : box, i, j });
    }
  }
  return tiles;
}

// re-export for callers that want hull-based custom tiles with attr callbacks
export { hullPoly };
