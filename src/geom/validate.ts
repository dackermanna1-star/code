// ConvexPoly invariant checker (tests / debug tooling). PURE.

import type { ConvexPoly } from "./poly.ts";
import { scaleOfPoints, newellNormal } from "./util.ts";

export interface ValidateOptions {
  /** Absolute tolerance (m); default 1e-6 × scale. */
  tol?: number;
  /** Require a closed manifold (every directed edge matched by its reverse). Default true. */
  closed?: boolean;
  /** Allow vertices that no face references. Default false. */
  allowUnused?: boolean;
}

/** Returns a list of human-readable problems (empty when the poly is valid). */
export function polyValidate(poly: ConvexPoly, opts: ValidateOptions = {}): string[] {
  const errs: string[] = [];
  const V = poly.verts;
  const scale = scaleOfPoints(V);
  const tol = opts.tol ?? 1e-6 * scale;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) errs.push(`vertex ${i} not finite`);
  }
  if (poly.faces.length < 4) errs.push(`only ${poly.faces.length} faces`);
  const used = new Uint8Array(V.length);
  const edges = new Map<string, number>();
  for (let fi = 0; fi < poly.faces.length; fi++) {
    const f = poly.faces[fi];
    const m = f.idx.length;
    if (m < 3) {
      errs.push(`face ${fi}: ${m} vertices`);
      continue;
    }
    if (new Set(f.idx).size !== m) errs.push(`face ${fi}: repeated vertex`);
    for (const i of f.idx) {
      if (!(i >= 0 && i < V.length)) {
        errs.push(`face ${fi}: bad index ${i}`);
        return errs;
      }
      used[i] = 1;
    }
    const nl = Math.hypot(f.n.x, f.n.y, f.n.z);
    if (!(Math.abs(nl - 1) < 1e-6)) errs.push(`face ${fi}: normal length ${nl}`);
    if (!Number.isFinite(f.d)) errs.push(`face ${fi}: d not finite`);
    for (const i of f.idx) {
      const s = f.n.x * V[i].x + f.n.y * V[i].y + f.n.z * V[i].z - f.d;
      if (Math.abs(s) > tol) errs.push(`face ${fi}: vertex ${i} off plane by ${s.toExponential(2)}`);
    }
    const N = newellNormal(V, f.idx);
    const area2 = Math.hypot(N.x, N.y, N.z);
    if (area2 > tol * tol && N.x * f.n.x + N.y * f.n.y + N.z * f.n.z <= 0) errs.push(`face ${fi}: winding not CCW from outside`);
    // polygon convexity in its plane
    for (let k = 0; k < m; k++) {
      const a = V[f.idx[k]],
        b = V[f.idx[(k + 1) % m]],
        c = V[f.idx[(k + 2) % m]];
      const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const e2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
      const cr = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
      const s = cr.x * f.n.x + cr.y * f.n.y + cr.z * f.n.z;
      const l1 = Math.hypot(e1.x, e1.y, e1.z),
        l2 = Math.hypot(e2.x, e2.y, e2.z);
      if (s < -1e-7 * l1 * l2 - tol * tol) errs.push(`face ${fi}: reflex corner at ${f.idx[(k + 1) % m]}`);
    }
    if (f.vn) {
      if (f.vn.length !== m) errs.push(`face ${fi}: vn length ${f.vn.length} != ${m}`);
      for (const q of f.vn) {
        const l = Math.hypot(q.x, q.y, q.z);
        if (!(Math.abs(l - 1) < 1e-5)) errs.push(`face ${fi}: vn not unit (${l})`);
      }
    }
    for (let k = 0; k < m; k++) {
      const key = `${f.idx[k]}>${f.idx[(k + 1) % m]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    // global convexity: every vertex behind every face plane
    for (let i = 0; i < V.length; i++) {
      const s = f.n.x * V[i].x + f.n.y * V[i].y + f.n.z * V[i].z - f.d;
      if (s > tol) {
        errs.push(`face ${fi}: vertex ${i} in front by ${s.toExponential(2)} (not convex)`);
        break;
      }
    }
  }
  if (!opts.allowUnused) for (let i = 0; i < V.length; i++) if (!used[i]) errs.push(`vertex ${i} unused`);
  if (opts.closed ?? true) {
    let open = 0,
      dup = 0;
    for (const [key, c] of edges) {
      if (c > 1) dup++;
      const [a, b] = key.split(">");
      if (!edges.has(`${b}>${a}`)) open++;
    }
    if (open) errs.push(`${open} open (unmatched) edges`);
    if (dup) errs.push(`${dup} duplicated directed edges`);
  }
  // duplicate vertices
  const weld = 1e-9 * scale;
  for (let i = 0; i < V.length; i++)
    for (let j = i + 1; j < V.length; j++) {
      if (Math.abs(V[i].x - V[j].x) <= weld && Math.abs(V[i].y - V[j].y) <= weld && Math.abs(V[i].z - V[j].z) <= weld) errs.push(`vertices ${i} and ${j} coincide`);
    }
  return errs;
}
