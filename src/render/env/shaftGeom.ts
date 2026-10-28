// Light-shaft volumes through the apartment's sunlit openings (pure, no Babylon).
//
// For every exterior window / sliding door the sun can shine through, the sunlit volume is
// the parallelepiped swept by the opening's *effective aperture* along the light direction:
//   P(u, v, w) = origin + u·U + v·V + w·D,   (u, v, w) ∈ [0, 1]³
// where the aperture is the interior opening rectangle intersected with the exterior one
// projected along the light (the 0.2 m wall reveal shades part of the opening at grazing
// sun angles), inset by the window frame. The parallelepiped is clipped to the interior
// box of the room behind the opening (extended across open-plan boundaries); the result is
// a convex polyhedron rendered by the atmosphere module with an analytic in-scattering
// shader, and sampled for dust motes.

import type { Vec3 } from "../../geom/vec.ts";
import { CEILING_H, INTERIOR, PARTITION_T, ROOMS, WALLS, sideRoom, wallLength, type Room, type RoomId, type Wall } from "../../world/plan.ts";

export interface ShaftVolume {
  /** Opening id from plan.ts. */
  id: string;
  room: RoomId;
  origin: Vec3;
  U: Vec3;
  V: Vec3;
  D: Vec3;
  /** Rows of the inverse basis: (u, v, w) = (dot(r0.xyz, p) + r0.w, …). */
  invRows: [number, number, number, number][];
  /** Interior clip box (world). */
  clipMin: Vec3;
  clipMax: Vec3;
  /** Clipped convex polyhedron, triangulated. Triangle winding: Babylon front face seen from OUTSIDE. */
  positions: number[];
  indices: number[];
  /** Volume (m³) of the clipped shape and aperture area (m²). */
  volume: number;
  apertureArea: number;
}

export interface ShaftOptions {
  /** Frame/sash inset of the clear glazing (m). */
  frameInset?: number;
  /** Minimum cos(incidence) for the sun to count as entering (grazing cutoff). */
  minCos?: number;
  /** Openings kinds that carry light. */
  kinds?: ReadonlyArray<string>;
}

type V3 = Vec3;
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V3): number => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};

// ------------------------------------------------------------------ convex polyhedron clipping

/** Convex polyhedron as a list of convex polygons, each ordered so cross(p1-p0, p2-p0) points outward. */
export type FacePoly = V3[];

/** Clip a convex polyhedron to the half-space dot(n, p) <= d. Returns the kept faces (+ cap). */
export function clipPolyhedron(faces: FacePoly[], n: V3, d: number, eps = 1e-7): FacePoly[] {
  const out: FacePoly[] = [];
  const capPts: V3[] = [];
  for (const f of faces) {
    const res: V3[] = [];
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      const da = dot(n, a) - d;
      const db = dot(n, b) - d;
      const aIn = da <= eps;
      const bIn = db <= eps;
      if (aIn) res.push(a);
      if (aIn !== bIn) {
        const t = da / (da - db);
        const p = add(a, scale(sub(b, a), t));
        res.push(p);
        capPts.push(p);
      } else if (aIn && Math.abs(da) <= eps) {
        capPts.push(a);
      }
    }
    if (res.length >= 3) out.push(dedupe(res));
  }
  const cap = dedupe(capPts);
  if (cap.length >= 3) {
    // Order the cap CCW around +n (its outward normal).
    const c = scale(cap.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / cap.length);
    const t1 = norm(Math.abs(n.x) < 0.9 ? cross(n, { x: 1, y: 0, z: 0 }) : cross(n, { x: 0, y: 1, z: 0 }));
    const t2 = cross(n, t1);
    cap.sort((p, q) => {
      const pp = sub(p, c);
      const qq = sub(q, c);
      return Math.atan2(dot(pp, t2), dot(pp, t1)) - Math.atan2(dot(qq, t2), dot(qq, t1));
    });
    // t1 × t2 = n, so increasing angle is CCW around n: outward-RH order.
    out.push(cap);
  }
  return out.filter((f) => f.length >= 3);
}

/** Drop (near-)duplicate points, keeping first occurrences in order (polygons are tiny). */
function dedupe(pts: V3[], eps = 1e-6): V3[] {
  const out: V3[] = [];
  for (const p of pts) {
    if (!out.some((q) => Math.abs(q.x - p.x) < eps && Math.abs(q.y - p.y) < eps && Math.abs(q.z - p.z) < eps)) out.push(p);
  }
  return out;
}

/** Faces of the parallelepiped origin + [0,1]³·(U, V, D), oriented outward. */
export function parallelepipedFaces(o: V3, U: V3, V: V3, D: V3): FacePoly[] {
  const P = (u: number, v: number, w: number) => add(o, add(scale(U, u), add(scale(V, v), scale(D, w))));
  const quads: V3[][] = [
    [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], // w = 0
    [P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1)], // w = 1
    [P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)], // u = 0
    [P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0)], // u = 1
    [P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0)], // v = 0
    [P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)], // v = 1
  ];
  const c = P(0.5, 0.5, 0.5);
  return quads.map((q) => orientOutward(q, c));
}

function orientOutward(poly: V3[], interior: V3): V3[] {
  const n = cross(sub(poly[1], poly[0]), sub(poly[2], poly[0]));
  return dot(n, sub(poly[0], interior)) < 0 ? poly.slice().reverse() : poly;
}

/** Clip a convex polyhedron to an AABB. */
export function clipToBox(faces: FacePoly[], min: V3, max: V3): FacePoly[] {
  let f = faces;
  f = clipPolyhedron(f, { x: 1, y: 0, z: 0 }, max.x);
  if (f.length) f = clipPolyhedron(f, { x: -1, y: 0, z: 0 }, -min.x);
  if (f.length) f = clipPolyhedron(f, { x: 0, y: 1, z: 0 }, max.y);
  if (f.length) f = clipPolyhedron(f, { x: 0, y: -1, z: 0 }, -min.y);
  if (f.length) f = clipPolyhedron(f, { x: 0, y: 0, z: 1 }, max.z);
  if (f.length) f = clipPolyhedron(f, { x: 0, y: 0, z: -1 }, -min.z);
  return f;
}

/** Volume of a closed convex polyhedron (outward faces). */
export function polyhedronVolume(faces: FacePoly[]): number {
  if (!faces.length) return 0;
  const ref = faces[0][0];
  let v = 0;
  for (const f of faces) {
    for (let i = 1; i + 1 < f.length; i++) {
      v += dot(sub(f[0], ref), cross(sub(f[i], ref), sub(f[i + 1], ref)));
    }
  }
  return Math.abs(v) / 6;
}

/** Triangulate faces into Babylon-ready arrays (front faces visible from outside). */
export function triangulate(faces: FacePoly[]): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f) positions.push(p.x, p.y, p.z);
    // Outward-RH polygon order → reverse per triangle: Babylon's front face has its
    // right-hand cross product pointing away from the viewer.
    for (let i = 1; i + 1 < f.length; i++) indices.push(base, base + i + 1, base + i);
  }
  return { positions, indices };
}

/** 3×3 inverse of the column basis [U V D]; null when degenerate. */
export function invertBasis(U: V3, V: V3, D: V3): [V3, V3, V3] | null {
  const c0 = cross(V, D);
  const det = dot(U, c0);
  if (!(Math.abs(det) > 1e-12)) return null;
  const r0 = scale(c0, 1 / det);
  const r1 = scale(cross(D, U), 1 / det);
  const r2 = scale(cross(U, V), 1 / det);
  return [r0, r1, r2];
}

// ------------------------------------------------------------------ plan → shafts

const BOUNDARY_EPS = 1e-6;

/** Interior clip box of a room, extended across full-width open-plan boundaries. */
export function roomClipBox(room: Room, walls: readonly Wall[] = WALLS): { min: V3; max: V3 } {
  let x0 = room.x0,
    x1 = room.x1,
    z0 = room.z0,
    z1 = room.z1;
  // Extend across boundaries shared over the full edge with no wall on them.
  for (const r of ROOMS) {
    if (r === room || r.outdoor) continue;
    const sameZ = Math.abs(r.z0 - z0) < BOUNDARY_EPS && Math.abs(r.z1 - z1) < BOUNDARY_EPS;
    const sameX = Math.abs(r.x0 - x0) < BOUNDARY_EPS && Math.abs(r.x1 - x1) < BOUNDARY_EPS;
    if (sameX && Math.abs(r.z0 - z1) < BOUNDARY_EPS && !wallOnLine(walls, false, z1, x0, x1)) z1 = r.z1;
    else if (sameX && Math.abs(r.z1 - z0) < BOUNDARY_EPS && !wallOnLine(walls, false, z0, x0, x1)) z0 = r.z0;
    else if (sameZ && Math.abs(r.x0 - x1) < BOUNDARY_EPS && !wallOnLine(walls, true, x1, z0, z1)) x1 = r.x1;
    else if (sameZ && Math.abs(r.x1 - x0) < BOUNDARY_EPS && !wallOnLine(walls, true, x0, z0, z1)) x0 = r.x0;
  }
  // Inset to the finished wall faces: concrete shell faces lie on the interior boundary,
  // partition faces are half a partition thickness in from their centre lines.
  const e = 0.004;
  const inset = (v: number, isMin: boolean, along: "x" | "z") => {
    const shell = along === "x" ? Math.abs(v - INTERIOR.minX) < BOUNDARY_EPS || Math.abs(v - INTERIOR.maxX) < BOUNDARY_EPS : Math.abs(v - INTERIOR.minZ) < BOUNDARY_EPS || Math.abs(v - INTERIOR.maxZ) < BOUNDARY_EPS;
    const d = shell ? e : PARTITION_T / 2 + e;
    return isMin ? v + d : v - d;
  };
  return {
    min: { x: inset(x0, true, "x"), y: e, z: inset(z0, true, "z") },
    max: { x: inset(x1, false, "x"), y: CEILING_H - e, z: inset(z1, false, "z") },
  };
}

function wallOnLine(walls: readonly Wall[], vertical: boolean, line: number, lo: number, hi: number): boolean {
  for (const w of walls) {
    const isV = Math.abs(w.b[0] - w.a[0]) < 1e-6;
    if (isV !== vertical) continue;
    const pos = vertical ? w.a[0] : w.a[1];
    if (Math.abs(pos - line) > w.thickness / 2 + 0.01) continue;
    const a = vertical ? w.a[1] : w.a[0];
    const b = vertical ? w.b[1] : w.b[0];
    if (Math.min(a, b) < hi - 0.05 && Math.max(a, b) > lo + 0.05) return true;
  }
  return false;
}

/**
 * Compute the sunlit shaft volume of every exterior opening the light (unit travel
 * direction `lightDir`) passes through into the apartment.
 */
export function computeShafts(lightDir: V3, opts: ShaftOptions = {}): ShaftVolume[] {
  const L = norm(lightDir);
  const inset = opts.frameInset ?? 0.05;
  const minCos = opts.minCos ?? 0.03;
  const kinds = opts.kinds ?? ["window", "slidingDoor"];
  const out: ShaftVolume[] = [];
  if (!(L.y < -0.01)) return out; // sun below/at the horizon: no shafts
  for (const w of WALLS) {
    if (w.kind !== "exterior") continue;
    const Lw = wallLength(w);
    if (!(Lw > 0)) continue;
    const t: V3 = norm({ x: w.b[0] - w.a[0], y: 0, z: w.b[1] - w.a[1] });
    const nPlus: V3 = Math.abs(t.x) < 1e-6 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    for (const o of w.openings) {
      if (!kinds.includes(o.kind)) continue;
      const sMid = (o.from + o.to) / 2;
      const inPlus = sideRoom(w, sMid, 1);
      const inMinus = sideRoom(w, sMid, -1);
      const room = inPlus && !inPlus.outdoor ? inPlus : inMinus && !inMinus.outdoor ? inMinus : null;
      if (!room) continue;
      const nIn = room === inPlus ? nPlus : scale(nPlus, -1);
      const cosI = dot(L, nIn);
      if (cosI < minCos) continue; // light leaves (or grazes) through this wall
      // Along-wall and vertical shift of the exterior reveal projected onto the interior plane.
      const k = w.thickness / cosI;
      const ds = dot(L, t) * k;
      const dy = L.y * k;
      const s0 = Math.max(o.from + inset, o.from + inset + ds);
      const s1 = Math.min(o.to - inset, o.to - inset + ds);
      const y0 = Math.max(o.sill + inset, o.sill + inset + dy);
      const y1 = Math.min(o.head - inset, o.head - inset + dy);
      if (s1 - s0 < 0.05 || y1 - y0 < 0.05) continue;
      const a3: V3 = { x: w.a[0], y: 0, z: w.a[1] };
      const plane = add(a3, scale(nIn, w.thickness / 2));
      const origin = add(add(plane, scale(t, s0)), { x: 0, y: y0, z: 0 });
      const U = scale(t, s1 - s0);
      const V: V3 = { x: 0, y: y1 - y0, z: 0 };
      const box = roomClipBox(room);
      // Extrude far enough for every aperture corner to leave the clip box.
      let reach = 0;
      for (const [cu, cv] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const p = add(origin, add(scale(U, cu), scale(V, cv)));
        reach = Math.max(reach, exitDistance(p, L, box.min, box.max));
      }
      reach = Math.min(Math.max(reach + 0.1, 0.5), 40);
      const D = scale(L, reach);
      const inv = invertBasis(U, V, D);
      if (!inv) continue;
      const faces = clipToBox(parallelepipedFaces(origin, U, V, D), box.min, box.max);
      if (faces.length < 4) continue;
      const { positions, indices } = triangulate(faces);
      const invRows = inv.map((r) => [r.x, r.y, r.z, -dot(r, origin)] as [number, number, number, number]);
      out.push({
        id: o.id,
        room: room.id,
        origin,
        U,
        V,
        D,
        invRows,
        clipMin: box.min,
        clipMax: box.max,
        positions,
        indices,
        volume: polyhedronVolume(faces),
        apertureArea: len(U) * len(V),
      });
    }
  }
  return out;
}

/** Distance along unit dir `d` from `p` until the ray leaves the AABB (0 if never inside). */
export function exitDistance(p: V3, d: V3, min: V3, max: V3): number {
  let tFar = Infinity;
  for (const ax of ["x", "y", "z"] as const) {
    const dv = d[ax];
    if (Math.abs(dv) < 1e-12) continue;
    const t = ((dv > 0 ? max[ax] : min[ax]) - p[ax]) / dv;
    tFar = Math.min(tFar, t);
  }
  return Number.isFinite(tFar) ? Math.max(0, tFar) : 0;
}

/** Shaft-space coordinates (u, v, w) of a world point. */
export function shaftCoords(s: ShaftVolume, p: V3): V3 {
  const r = s.invRows;
  return {
    x: r[0][0] * p.x + r[0][1] * p.y + r[0][2] * p.z + r[0][3],
    y: r[1][0] * p.x + r[1][1] * p.y + r[1][2] * p.z + r[1][3],
    z: r[2][0] * p.x + r[2][1] * p.y + r[2][2] * p.z + r[2][3],
  };
}

/** True when a world point lies inside the clipped shaft volume (with a margin in metres). */
export function insideShaft(s: ShaftVolume, p: V3, margin = 0): boolean {
  if (p.x < s.clipMin.x - margin || p.x > s.clipMax.x + margin) return false;
  if (p.y < s.clipMin.y - margin || p.y > s.clipMax.y + margin) return false;
  if (p.z < s.clipMin.z - margin || p.z > s.clipMax.z + margin) return false;
  const c = shaftCoords(s, p);
  const mu = margin / Math.max(len(s.U), 1e-6);
  const mv = margin / Math.max(len(s.V), 1e-6);
  const mw = margin / Math.max(len(s.D), 1e-6);
  return c.x >= -mu && c.x <= 1 + mu && c.y >= -mv && c.y <= 1 + mv && c.z >= -mw && c.z <= 1 + mw;
}
