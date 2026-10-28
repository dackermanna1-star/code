// Working polyhedron + fast half-space clipper. Internal to the geometry module (used by
// polyClip and voronoiFracture). PURE (no Babylon).
//
// Representation: interleaved positions + faces holding vertex index loops (CCW seen from
// outside), the face plane, a caller-defined integer tag (original face index or cut id) and
// optional per-vertex normals. Clipping keeps face planes exact (they never change), shares
// new edge vertices between the two faces of an edge (watertight), welds near-duplicates,
// rebuilds the cap face from the open boundary edges (handles cuts exactly through vertices
// and edges) and compacts the vertex array so dead vertices never accumulate.

import type { ConvexPoly } from "./poly.ts";

export interface WFace {
  /** Vertex indices, CCW seen from outside. */
  v: number[];
  nx: number;
  ny: number;
  nz: number;
  d: number;
  /** Caller-defined tag: original face index (>= 0) or a cut id (< 0). */
  tag: number;
  /** Optional per-vertex normals, 3 numbers per entry of v. */
  vn: number[] | null;
}

export interface WPoly {
  /** Interleaved xyz positions. */
  p: number[];
  faces: WFace[];
}

export const CLIP_UNCHANGED = 0;
export const CLIP_CUT = 1;
export const CLIP_EMPTY = 2;

// ------------------------------------------------------------------ scratch buffers
let S = new Float64Array(512); // signed distances
let C = new Int8Array(512); // classification -1 in / 0 on / +1 out
let ON = new Uint8Array(512); // vertex lies on the cut plane (on, new or welded)
let MAP = new Int32Array(512); // compaction remap

function ensureScratch(n: number): void {
  if (S.length >= n) return;
  const m = Math.max(n, S.length * 2);
  S = new Float64Array(m);
  C = new Int8Array(m);
  ON = new Uint8Array(m);
  MAP = new Int32Array(m);
}

// per-clip state (module level to avoid closure allocation in the hot path)
let cp: number[] = [];
let cnv = 0;
let cWeld2 = 0;
let cDup2 = 0; // crossing-to-crossing weld radius² (true duplicates only, see wpolyClip)
const edgeKey: number[] = [];
const edgeVert: number[] = [];
const newVerts: number[] = [];
const newA: number[] = []; // edge endpoints of each new vertex (parallel to newVerts)
const newB: number[] = [];
const onVerts: number[] = [];
let cFaces: WFace[] = [];

/**
 * True when some face of the poly being clipped contains all the given (pre-clip) vertices.
 * Welding is only allowed between points that share a face: such points are consecutive on
 * the cap loop, so merging them is a plain edge collapse. Welding two crossing points of
 * edges that share no face would pinch the cap (non-manifold vertex, open edges).
 */
function shareFace(a: number, b: number, c: number, d: number): boolean {
  for (const f of cFaces) {
    const v = f.v;
    if (v.indexOf(a) >= 0 && v.indexOf(b) >= 0 && v.indexOf(c) >= 0 && (d < 0 || v.indexOf(d) >= 0)) return true;
  }
  return false;
}
// cap-construction scratch (reused between calls; lengths reset per call)
const EU: number[] = [];
const EV: number[] = [];
const CU: number[] = [];
const CV: number[] = [];
let USED = new Uint8Array(64);

function near2(i: number, x: number, y: number, z: number): number {
  const dx = cp[3 * i] - x,
    dy = cp[3 * i + 1] - y,
    dz = cp[3 * i + 2] - z;
  return dx * dx + dy * dy + dz * dz;
}

/** Vertex where the plane crosses edge (a,b); created once per edge, welded to nearby vertices. */
function edgeVertex(a: number, b: number): number {
  const lo = a < b ? a : b,
    hi = a < b ? b : a;
  const key = lo * cnv + hi;
  for (let k = 0; k < edgeKey.length; k++) if (edgeKey[k] === key) return edgeVert[k];
  // canonical direction lo→hi so both faces of the edge compute bit-identical positions
  const t = S[lo] / (S[lo] - S[hi]);
  const x = cp[3 * lo] + (cp[3 * hi] - cp[3 * lo]) * t;
  const y = cp[3 * lo + 1] + (cp[3 * hi + 1] - cp[3 * lo + 1]) * t;
  const z = cp[3 * lo + 2] + (cp[3 * hi + 2] - cp[3 * lo + 2]) * t;
  let idx = -1;
  const inV = C[lo] < 0 ? lo : hi;
  if (near2(inV, x, y, z) <= cWeld2) idx = inV;
  if (idx < 0) {
    for (let k = 0; k < newVerts.length; k++) {
      if (near2(newVerts[k], x, y, z) <= cDup2 && shareFace(lo, hi, newA[k], newB[k])) {
        idx = newVerts[k];
        break;
      }
    }
  }
  if (idx < 0) {
    for (let k = 0; k < onVerts.length; k++) {
      if (near2(onVerts[k], x, y, z) <= cWeld2 && shareFace(lo, hi, onVerts[k], -1)) {
        idx = onVerts[k];
        break;
      }
    }
  }
  if (idx < 0) {
    idx = cp.length / 3;
    cp.push(x, y, z);
    newVerts.push(idx);
    newA.push(lo);
    newB.push(hi);
  }
  ON[idx] = 1;
  edgeKey.push(key);
  edgeVert.push(idx);
  return idx;
}

/**
 * Clip `w` in place by the half-space nx*x + ny*y + nz*z <= d (n must be unit length).
 * The new cap face gets `tag`. Returns CLIP_UNCHANGED (nothing outside), CLIP_EMPTY
 * (nothing inside / degenerate remainder) or CLIP_CUT.
 */
export function wpolyClip(w: WPoly, nx: number, ny: number, nz: number, d: number, tag: number, planeEps: number, weldEps: number): number {
  const p = w.p;
  const nv = p.length / 3;
  let totalIdx = 0;
  for (const f of w.faces) totalIdx += f.v.length;
  ensureScratch(nv + totalIdx + 16);
  // Snap/weld tolerances. History: welding crossings to nearby vertices at the full weldEps
  // (1e-7×scale) moved them by up to that much, and when a cut passed ~1e-8×scale beside a
  // vertex the resulting sub-micron edges came out with slightly reflex corners. Now:
  //  * vertices within onEps (= 0.1·weldEps ≈ 1e-8×scale) of the plane are snapped "on" it
  //    (kept, not split; both complementary halves share them, so volume stays exact). Every
  //    crossing is therefore farther than onEps from both endpoints of its edge;
  //  * a crossing welds to an on-plane vertex only within onEps, and to another crossing only
  //    when they are numerically the same point (3·planeEps); both only if the two points share
  //    a face (consecutive on the cap loop → a plain edge collapse, never a pinch);
  //  * otherwise points stay apart and form exact, tiny but convex edges.
  // Net effect: geometry moves by at most ~1e-8×scale, far inside the validator tolerances.
  const onEps = Math.max(planeEps, 0.1 * weldEps);
  let nOut = 0,
    nIn = 0;
  for (let i = 0; i < nv; i++) {
    const s = nx * p[3 * i] + ny * p[3 * i + 1] + nz * p[3 * i + 2] - d;
    S[i] = s;
    if (s > onEps) {
      C[i] = 1;
      nOut++;
    } else if (s < -onEps) {
      C[i] = -1;
      nIn++;
    } else C[i] = 0;
  }
  if (nOut === 0) return CLIP_UNCHANGED;
  if (nIn === 0) return CLIP_EMPTY;

  cp = p;
  cnv = nv;
  cWeld2 = onEps * onEps;
  cDup2 = 3 * planeEps * (3 * planeEps);
  edgeKey.length = 0;
  edgeVert.length = 0;
  newVerts.length = 0;
  newA.length = 0;
  newB.length = 0;
  onVerts.length = 0;
  cFaces = w.faces;
  for (let i = 0; i < nv; i++) {
    const on = C[i] === 0 ? 1 : 0;
    ON[i] = on;
    if (on) onVerts.push(i);
  }
  // new vertices get indices >= nv; clear their ON flags lazily (edgeVertex sets them)
  for (let i = nv; i < nv + totalIdx + 16; i++) ON[i] = 0;

  const out: WFace[] = [];
  for (const f of w.faces) {
    const fv = f.v;
    const m = fv.length;
    let hasOut = false,
      hasIn = false;
    for (let k = 0; k < m; k++) {
      const c = C[fv[k]];
      if (c > 0) hasOut = true;
      else if (c < 0) hasIn = true;
    }
    if (!hasOut) {
      out.push(f);
      continue;
    }
    if (!hasIn) continue;
    const fvn = f.vn;
    const nvArr: number[] = [];
    const nvn: number[] | null = fvn ? [] : null;
    for (let k = 0; k < m; k++) {
      const kb = k + 1 === m ? 0 : k + 1;
      const a = fv[k],
        b = fv[kb];
      const ca = C[a],
        cb = C[b];
      if (ca <= 0 && nvArr[nvArr.length - 1] !== a) {
        nvArr.push(a);
        if (nvn && fvn) nvn.push(fvn[3 * k], fvn[3 * k + 1], fvn[3 * k + 2]);
      }
      if ((ca < 0 && cb > 0) || (ca > 0 && cb < 0)) {
        const e = edgeVertex(a, b);
        if (nvArr[nvArr.length - 1] !== e) {
          nvArr.push(e);
          if (nvn && fvn) {
            const t = S[a] / (S[a] - S[b]);
            let x = fvn[3 * k] + (fvn[3 * kb] - fvn[3 * k]) * t;
            let y = fvn[3 * k + 1] + (fvn[3 * kb + 1] - fvn[3 * k + 1]) * t;
            let z = fvn[3 * k + 2] + (fvn[3 * kb + 2] - fvn[3 * k + 2]) * t;
            const l = Math.sqrt(x * x + y * y + z * z);
            if (l > 1e-12) {
              x /= l;
              y /= l;
              z /= l;
            } else {
              x = f.nx;
              y = f.ny;
              z = f.nz;
            }
            nvn.push(x, y, z);
          }
        }
      }
    }
    if (nvArr.length > 1 && nvArr[0] === nvArr[nvArr.length - 1]) {
      nvArr.pop();
      if (nvn) nvn.length -= 3;
    }
    if (nvArr.length >= 3) out.push({ v: nvArr, nx: f.nx, ny: f.ny, nz: f.nz, d: f.d, tag: f.tag, vn: nvn });
  }

  // ---- cap: reversed open boundary edges lying on the plane
  const eu = EU,
    ev = EV,
    cu = CU,
    cv = CV;
  eu.length = ev.length = cu.length = cv.length = 0;
  for (const f of out) {
    const fv = f.v;
    const m = fv.length;
    for (let k = 0; k < m; k++) {
      const a = fv[k],
        b = fv[k + 1 === m ? 0 : k + 1];
      if (ON[a] && ON[b]) {
        eu.push(a);
        ev.push(b);
      }
    }
  }
  for (let i = 0; i < eu.length; i++) {
    let paired = false;
    for (let j = 0; j < eu.length; j++) {
      if (eu[j] === ev[i] && ev[j] === eu[i]) {
        paired = true;
        break;
      }
    }
    if (!paired) {
      cu.push(ev[i]);
      cv.push(eu[i]);
    }
  }
  let loop: number[] | null = null;
  if (cu.length >= 3) {
    loop = [];
    if (USED.length < cu.length) USED = new Uint8Array(cu.length * 2);
    const used = USED;
    used.fill(0, 0, cu.length);
    let cur = cu[0];
    const start = cur;
    for (let step = 0; step <= cu.length; step++) {
      loop.push(cur);
      let nxt = -1;
      for (let k = 0; k < cu.length; k++) {
        if (!used[k] && cu[k] === cur) {
          used[k] = 1;
          nxt = cv[k];
          break;
        }
      }
      if (nxt < 0) {
        loop = null;
        break;
      }
      cur = nxt;
      if (cur === start) break;
    }
    if (loop && (cur !== start || loop.length !== cu.length)) loop = null;
  }
  if (!loop) loop = capByAngle(cu.length ? cu.concat(cv) : collectOn(out), nx, ny, nz);
  if (loop.length >= 3) out.push({ v: loop, nx, ny, nz, d, tag, vn: null });
  if (out.length < 4) {
    p.length = nv * 3; // drop the vertices appended by edgeVertex; w stays as it was
    cp = [];
    cFaces = [];
    return CLIP_EMPTY;
  }

  // ---- compact: renumber referenced vertices, drop dead ones
  const total = cp.length / 3;
  for (let i = 0; i < total; i++) MAP[i] = -1;
  const np: number[] = [];
  let cnt = 0;
  for (const f of out) {
    const fv = f.v;
    for (let k = 0; k < fv.length; k++) {
      const i = fv[k];
      let r = MAP[i];
      if (r < 0) {
        r = MAP[i] = cnt++;
        np.push(cp[3 * i], cp[3 * i + 1], cp[3 * i + 2]);
      }
      fv[k] = r;
    }
  }
  w.p = np;
  w.faces = out;
  cp = [];
  cFaces = [];
  return CLIP_CUT;
}

function collectOn(faces: WFace[]): number[] {
  const r: number[] = [];
  for (const f of faces) for (const i of f.v) if (ON[i]) r.push(i);
  return r;
}

/** Fallback cap construction: sort the (unique) on-plane vertices by angle around n. */
function capByAngle(ids: number[], nx: number, ny: number, nz: number): number[] {
  const uniq = Array.from(new Set(ids));
  if (uniq.length < 3) return uniq;
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const i of uniq) {
    cx += cp[3 * i];
    cy += cp[3 * i + 1];
    cz += cp[3 * i + 2];
  }
  cx /= uniq.length;
  cy /= uniq.length;
  cz /= uniq.length;
  // in-plane basis e1, e2 = n × e1 (so angles increase CCW seen from +n)
  const ax = Math.abs(nx) < 0.9 ? 1 : 0,
    ay = Math.abs(nx) < 0.9 ? 0 : 1;
  let e1x = ny * 0 - nz * ay,
    e1y = nz * ax - nx * 0,
    e1z = nx * ay - ny * ax;
  const l = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= l;
  e1y /= l;
  e1z /= l;
  const e2x = ny * e1z - nz * e1y,
    e2y = nz * e1x - nx * e1z,
    e2z = nx * e1y - ny * e1x;
  const ang = new Map<number, number>();
  for (const i of uniq) {
    const dx = cp[3 * i] - cx,
      dy = cp[3 * i + 1] - cy,
      dz = cp[3 * i + 2] - cz;
    ang.set(i, Math.atan2(dx * e2x + dy * e2y + dz * e2z, dx * e1x + dy * e1y + dz * e1z));
  }
  return uniq.sort((a, b) => ang.get(a)! - ang.get(b)!);
}

// ------------------------------------------------------------------ conversion helpers

/** Copy a ConvexPoly into a working poly (face tags = face indices, unused vertices dropped). */
export function wpolyFromConvex(poly: ConvexPoly): WPoly {
  const remap = new Map<number, number>();
  const p: number[] = [];
  const faces: WFace[] = [];
  for (let fi = 0; fi < poly.faces.length; fi++) {
    const f = poly.faces[fi];
    const v: number[] = [];
    for (const i of f.idx) {
      let r = remap.get(i);
      if (r === undefined) {
        r = p.length / 3;
        remap.set(i, r);
        const q = poly.verts[i];
        p.push(q.x, q.y, q.z);
      }
      v.push(r);
    }
    let vn: number[] | null = null;
    if (f.vn && f.vn.length === f.idx.length) {
      vn = [];
      for (const q of f.vn) vn.push(q.x, q.y, q.z);
    }
    faces.push({ v, nx: f.n.x, ny: f.n.y, nz: f.n.z, d: f.d, tag: fi, vn });
  }
  return { p, faces };
}

/** Deep copy of a working poly. */
export function wpolyClone(w: WPoly): WPoly {
  return {
    p: w.p.slice(),
    faces: w.faces.map((f) => ({ v: f.v.slice(), nx: f.nx, ny: f.ny, nz: f.nz, d: f.d, tag: f.tag, vn: f.vn ? f.vn.slice() : null })),
  };
}

/** Area of one working face (Newell). */
export function wfaceArea(w: WPoly, f: WFace): number {
  const p = w.p;
  const v = f.v;
  const m = v.length;
  if (m < 3) return 0;
  const o = v[0];
  const ox = p[3 * o],
    oy = p[3 * o + 1],
    oz = p[3 * o + 2];
  let sx = 0,
    sy = 0,
    sz = 0;
  for (let k = 1; k + 1 < m; k++) {
    const a = v[k],
      b = v[k + 1];
    const ax = p[3 * a] - ox,
      ay = p[3 * a + 1] - oy,
      az = p[3 * a + 2] - oz;
    const bx = p[3 * b] - ox,
      by = p[3 * b + 1] - oy,
      bz = p[3 * b + 2] - oz;
    sx += ay * bz - az * by;
    sy += az * bx - ax * bz;
    sz += ax * by - ay * bx;
  }
  return 0.5 * Math.sqrt(sx * sx + sy * sy + sz * sz);
}

/** Volume and centroid of a working poly (divergence theorem, origin at the first vertex). */
export function wpolyMass(w: WPoly): { volume: number; cx: number; cy: number; cz: number } {
  const p = w.p;
  const nv = p.length / 3;
  if (nv === 0) return { volume: 0, cx: 0, cy: 0, cz: 0 };
  const ox = p[0],
    oy = p[1],
    oz = p[2];
  let vol = 0,
    sx = 0,
    sy = 0,
    sz = 0;
  for (const f of w.faces) {
    const v = f.v;
    const a = v[0];
    const ax = p[3 * a] - ox,
      ay = p[3 * a + 1] - oy,
      az = p[3 * a + 2] - oz;
    for (let k = 1; k + 1 < v.length; k++) {
      const b = v[k],
        c = v[k + 1];
      const bx = p[3 * b] - ox,
        by = p[3 * b + 1] - oy,
        bz = p[3 * b + 2] - oz;
      const cx = p[3 * c] - ox,
        cy = p[3 * c + 1] - oy,
        cz = p[3 * c + 2] - oz;
      const t = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      vol += t;
      sx += t * (ax + bx + cx);
      sy += t * (ay + by + cy);
      sz += t * (az + bz + cz);
    }
  }
  if (Math.abs(vol) < 1e-300) {
    let mx = 0,
      my = 0,
      mz = 0;
    for (let i = 0; i < nv; i++) {
      mx += p[3 * i];
      my += p[3 * i + 1];
      mz += p[3 * i + 2];
    }
    return { volume: 0, cx: mx / nv, cy: my / nv, cz: mz / nv };
  }
  return { volume: vol, cx: ox + sx / (4 * vol), cy: oy + sy / (4 * vol), cz: oz + sz / (4 * vol) };
}
