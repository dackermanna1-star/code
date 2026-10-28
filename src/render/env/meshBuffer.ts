// Geometry accumulator for the procedural exterior (pure, no Babylon).
//
// Vertex layout: position (3), normal (3), uv (2, metres along the surface), color (4,
// linear RGB + A), data (4, free per-vertex parameters for the exterior shaders).
// Triangles are emitted with Babylon's front-face winding: seen from the side the normal
// points to, the right-hand cross product of (b − a, c − a) points AWAY from the viewer
// (verified in tests/probes/render-materials-winding.probe.ts), so callers just pass the
// outward normal and the buffer orients every triangle.
//
// Storage is growable typed arrays (the city is ~200k vertices; plain arrays + object
// literals per vertex were ~5× slower).

import type { Vec3 } from "../../geom/vec.ts";

export type RGBA = readonly [number, number, number, number];
export type Data4 = readonly [number, number, number, number];

export interface BuiltGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  data: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  min: Vec3;
  max: Vec3;
}

const ZERO4: Data4 = [0, 0, 0, 0];
const WHITE: RGBA = [1, 1, 1, 1];

type BoxFace = "top" | "bottom" | "px" | "nx" | "pz" | "nz";

export interface BoxOptions {
  skip?: ReadonlyArray<BoxFace>;
  /** Added to world y to form the facade v coordinate. */
  vOffset?: number;
  /** Start of the facade u coordinate (continuous around the box). */
  uOffset?: number;
}

function grow<T extends Float32Array | Uint32Array>(a: T, need: number): T {
  if (need <= a.length) return a;
  let n = a.length * 2;
  while (n < need) n *= 2;
  const b = new (a.constructor as { new (n: number): T })(n);
  b.set(a);
  return b;
}

export class MeshBuffer {
  private pos = new Float32Array(3 * 256);
  private nrm = new Float32Array(3 * 256);
  private tex = new Float32Array(2 * 256);
  private col = new Float32Array(4 * 256);
  private dat = new Float32Array(4 * 256);
  private idx = new Uint32Array(3 * 256);
  private nv = 0;
  private ni = 0;

  get vertexCount(): number {
    return this.nv;
  }

  get triangleCount(): number {
    return this.ni / 3;
  }

  /** Live views of the used part of each stream (do not keep across further appends). */
  get positions(): Float32Array {
    return this.pos.subarray(0, this.nv * 3);
  }
  get normals(): Float32Array {
    return this.nrm.subarray(0, this.nv * 3);
  }
  get uvs(): Float32Array {
    return this.tex.subarray(0, this.nv * 2);
  }
  get colors(): Float32Array {
    return this.col.subarray(0, this.nv * 4);
  }
  get data(): Float32Array {
    return this.dat.subarray(0, this.nv * 4);
  }
  get indices(): Uint32Array {
    return this.idx.subarray(0, this.ni);
  }

  private reserve(verts: number, inds: number): void {
    const nv = this.nv + verts;
    if (nv * 3 > this.pos.length) {
      this.pos = grow(this.pos, nv * 3);
      this.nrm = grow(this.nrm, nv * 3);
      this.tex = grow(this.tex, nv * 2);
      this.col = grow(this.col, nv * 4);
      this.dat = grow(this.dat, nv * 4);
    }
    if (this.ni + inds > this.idx.length) this.idx = grow(this.idx, this.ni + inds);
  }

  /** Append one vertex from scalars; returns its index. */
  v(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, w: number, c: RGBA, d: Data4): number {
    this.reserve(1, 0);
    const i = this.nv++;
    const p3 = i * 3;
    this.pos[p3] = px;
    this.pos[p3 + 1] = py;
    this.pos[p3 + 2] = pz;
    this.nrm[p3] = nx;
    this.nrm[p3 + 1] = ny;
    this.nrm[p3 + 2] = nz;
    this.tex[i * 2] = u;
    this.tex[i * 2 + 1] = w;
    const p4 = i * 4;
    this.col[p4] = c[0];
    this.col[p4 + 1] = c[1];
    this.col[p4 + 2] = c[2];
    this.col[p4 + 3] = c[3];
    this.dat[p4] = d[0];
    this.dat[p4 + 1] = d[1];
    this.dat[p4 + 2] = d[2];
    this.dat[p4 + 3] = d[3];
    return i;
  }

  /** Append one vertex; returns its index. */
  vertex(p: Vec3, n: Vec3, u: number, v: number, color: RGBA = WHITE, data: Data4 = ZERO4): number {
    return this.v(p.x, p.y, p.z, n.x, n.y, n.z, u, v, color, data);
  }

  /** Triangle from existing vertex indices, oriented so its front face looks along (nx, ny, nz). */
  triN(a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
    const P = this.pos;
    const ax = P[a * 3],
      ay = P[a * 3 + 1],
      az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax,
      e1y = P[b * 3 + 1] - ay,
      e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax,
      e2y = P[c * 3 + 1] - ay,
      e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    this.reserve(0, 3);
    const I = this.idx;
    const k = this.ni;
    I[k] = a;
    if (cx * nx + cy * ny + cz * nz > 0) {
      I[k + 1] = c;
      I[k + 2] = b;
    } else {
      I[k + 1] = b;
      I[k + 2] = c;
    }
    this.ni += 3;
  }

  tri(a: number, b: number, c: number, n: Vec3): void {
    this.triN(a, b, c, n.x, n.y, n.z);
  }

  /** Planar quad from 12 scalars (perimeter order), facing (nx, ny, nz), uv rect (u0,v0)…(u1,v1). */
  quadS(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    nx: number, ny: number, nz: number,
    u0: number, v0: number, u1: number, v1: number,
    c: RGBA, d: Data4,
  ): void {
    this.reserve(4, 6);
    const i0 = this.v(x0, y0, z0, nx, ny, nz, u0, v0, c, d);
    const i1 = this.v(x1, y1, z1, nx, ny, nz, u1, v0, c, d);
    const i2 = this.v(x2, y2, z2, nx, ny, nz, u1, v1, c, d);
    const i3 = this.v(x3, y3, z3, nx, ny, nz, u0, v1, c, d);
    this.triN(i0, i1, i2, nx, ny, nz);
    this.triN(i0, i2, i3, nx, ny, nz);
  }

  /**
   * Planar quad p0..p3 (in perimeter order, either direction) facing `n`, uv rectangle
   * (u0,v0) at p0 … (u1,v1) at p2.
   */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: Vec3, u0: number, v0: number, u1: number, v1: number, color: RGBA = WHITE, data: Data4 = ZERO4): void {
    this.quadS(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, n.x, n.y, n.z, u0, v0, u1, v1, color, data);
  }

  /**
   * Axis-aligned box. Facade UVs: u = horizontal metres along the face (continuous around the
   * box starting at the −Z face), v = world height (y + vOffset). Faces in `skip` are omitted
   * ("bottom" saves triangles for buildings standing on the ground).
   */
  box(min: Vec3, max: Vec3, color: RGBA = WHITE, data: Data4 = ZERO4, opts: BoxOptions = {}): void {
    const skip = opts.skip;
    let mask = 0;
    if (skip) for (const f of skip) mask |= f === "top" ? 1 : f === "bottom" ? 2 : f === "px" ? 4 : f === "nx" ? 8 : f === "pz" ? 16 : 32;
    const vo = opts.vOffset ?? 0;
    let u = opts.uOffset ?? 0;
    const ax = min.x,
      ay = min.y,
      az = min.z,
      bx = max.x,
      by = max.y,
      bz = max.z;
    const sx = bx - ax;
    const sz = bz - az;
    const v0 = ay + vo,
      v1 = by + vo;
    // −Z face (south), u runs +X
    if (!(mask & 32)) this.quadS(ax, ay, az, bx, ay, az, bx, by, az, ax, by, az, 0, 0, -1, u, v0, u + sx, v1, color, data);
    u += sx;
    // +X face (east), u runs +Z
    if (!(mask & 4)) this.quadS(bx, ay, az, bx, ay, bz, bx, by, bz, bx, by, az, 1, 0, 0, u, v0, u + sz, v1, color, data);
    u += sz;
    // +Z face (north), u runs −X
    if (!(mask & 16)) this.quadS(bx, ay, bz, ax, ay, bz, ax, by, bz, bx, by, bz, 0, 0, 1, u, v0, u + sx, v1, color, data);
    u += sx;
    // −X face (west), u runs −Z
    if (!(mask & 8)) this.quadS(ax, ay, bz, ax, ay, az, ax, by, az, ax, by, bz, -1, 0, 0, u, v0, u + sz, v1, color, data);
    // top / bottom: planar XZ mapping
    if (!(mask & 1)) this.quadS(ax, by, az, bx, by, az, bx, by, bz, ax, by, bz, 0, 1, 0, ax, az, bx, bz, color, data);
    if (!(mask & 2)) this.quadS(ax, ay, az, bx, ay, az, bx, ay, bz, ax, ay, bz, 0, -1, 0, ax, az, bx, bz, color, data);
  }

  /** Append another buffer (vertex indices rebased). */
  append(other: MeshBuffer): void {
    const base = this.nv;
    const n = other.nv;
    this.reserve(n, other.ni);
    this.pos.set(other.pos.subarray(0, n * 3), base * 3);
    this.nrm.set(other.nrm.subarray(0, n * 3), base * 3);
    this.tex.set(other.tex.subarray(0, n * 2), base * 2);
    this.col.set(other.col.subarray(0, n * 4), base * 4);
    this.dat.set(other.dat.subarray(0, n * 4), base * 4);
    for (let i = 0; i < other.ni; i++) this.idx[this.ni + i] = other.idx[i] + base;
    this.nv += n;
    this.ni += other.ni;
  }

  /** Pack into tight typed arrays (+ bounds). */
  build(): BuiltGeometry {
    const positions = this.pos.slice(0, this.nv * 3);
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;
      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
    }
    if (positions.length === 0) {
      min.x = min.y = min.z = 0;
      max.x = max.y = max.z = 0;
    }
    return {
      positions,
      normals: this.nrm.slice(0, this.nv * 3),
      uvs: this.tex.slice(0, this.nv * 2),
      colors: this.col.slice(0, this.nv * 4),
      data: this.dat.slice(0, this.nv * 4),
      indices: this.idx.slice(0, this.ni),
      vertexCount: this.nv,
      min,
      max,
    };
  }
}
