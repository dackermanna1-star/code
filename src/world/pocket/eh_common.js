// Shared helpers for the two suburban pockets (hollowframes.js, culdesac.js).
//  * Frame: an oriented building frame. A building is written in local cell coordinates
//    (u along the facade to the viewer's right as seen from the street, v from the facade into
//    the building) and the Frame maps cells, thin-wall edges, decals and points to the world for
//    any of the four facings, so one plan can be stamped around a cul-de-sac.
//  * face()/slab(): helpers to build sloped, correctly wound polygons inside props.
import { M } from '../gen/common.js';
import { defineTexture } from '../../gfx/textures.js';

// painted road lines (solid colour decals)
defineTexture('eh_paint_y', (p) => { p.fill([222, 188, 50]); p.grain(0.08); p.speckle(60, [150, 126, 36], 0.3, 0.7); }, 4);
defineTexture('eh_paint_w', (p) => { p.fill([214, 212, 204]); p.grain(0.08); p.speckle(60, [150, 148, 140], 0.3, 0.7); }, 4);

// world unit vectors of the local axes for each facing (the facing is the direction from the
// building toward the street)
const AXU = { S: [1, 0], N: [-1, 0], E: [0, -1], W: [0, 1] };
const AXV = { S: [0, -1], N: [0, 1], E: [-1, 0], W: [1, 0] };
export const FACING_DIR = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };

export class Frame {
  // (ax, az): world position of the local origin (u = 0, v = 0): the left end of the facade
  // line as seen from the street. Must be an integer lattice point.
  // mirror: u runs to the viewer's left instead (a mirrored plan); the anchor is then the
  // right end of the facade.
  constructor(zb, facing, ax, az, mirror = false) {
    this.zb = zb; this.facing = facing; this.ax = ax; this.az = az; this.mirror = mirror;
    [this.ux, this.uz] = AXU[facing];
    if (mirror) { this.ux = -this.ux; this.uz = -this.uz; }
    [this.vx, this.vz] = AXV[facing];
    [this.fx, this.fz] = FACING_DIR[facing];
  }
  x(lu, lv) { return this.ax + lu * this.ux + lv * this.vx; }
  z(lu, lv) { return this.az + lu * this.uz + lv * this.vz; }
  // world cell of local cell (u, v)
  cell(u, v) { return [Math.floor(this.x(u + 0.5, v + 0.5)), Math.floor(this.z(u + 0.5, v + 0.5))]; }
  // world direction of a local direction
  dir(du, dv) { return [du * this.ux + dv * this.vx, du * this.uz + dv * this.vz]; }
  owns(lu, lv) { return this.zb.in(Math.floor(this.x(lu, lv)), Math.floor(this.z(lu, lv))); }
  // write cell attributes ({floor, ceil, fmat, cmat, wmat, flags, solid})
  setCell(u, v, o) {
    const zb = this.zb;
    const [x, z] = this.cell(u, v);
    if (!zb.in(x, z)) return;
    const i = zb.i(x, z);
    if (o.floor !== undefined) zb.floor[i] = o.floor;
    if (o.ceil !== undefined) zb.ceil[i] = o.ceil;
    if (o.fmat) zb.fmat[i] = o.fmat;
    if (o.cmat) zb.cmat[i] = o.cmat;
    if (o.wmat) zb.wmat[i] = o.wmat;
    if (o.flags !== undefined) zb.flags[i] = o.flags;
    if (o.solid !== undefined) zb.solid[i] = o.solid;
  }
  // thin wall between two adjacent local cells; matA is the face seen from cell ca
  edge(ca, cb, type, matA, matB) {
    const A = this.cell(ca[0], ca[1]), B = this.cell(cb[0], cb[1]);
    if (A[0] !== B[0]) {
      const aw = A[0] < B[0];
      this.zb.setWall(Math.max(A[0], B[0]), A[1], 'W', type, aw ? matA : matB, aw ? matB : matA);
    } else {
      const an = A[1] < B[1];
      this.zb.setWall(A[0], Math.max(A[1], B[1]), 'N', type, an ? matA : matB, an ? matB : matA);
    }
  }
  // wall along local line v for facade columns [u0, u1): front face = toward lower v
  hEdges(u0, u1, v, type, matFront, matBack) {
    for (let u = u0; u < u1; u++) this.edge([u, v - 1], [u, v], type, matFront, matBack);
  }
  // wall along local line u for rows [v0, v1): left face = toward lower u
  vEdges(u, v0, v1, type, matLeft, matRight) {
    for (let v = v0; v < v1; v++) this.edge([u - 1, v], [u, v], type, matLeft, matRight);
  }
  // decal on a wall: local anchor (lu, lv), local normal (nu, nv)
  decal(lu, ly, lv, nu, nv, w, h, tex, opts) {
    if (!this.owns(lu, lv)) return null;
    const [dx, dz] = this.dir(nu, nv);
    const face = dx > 0 ? 'px' : dx < 0 ? 'nx' : dz > 0 ? 'pz' : 'nz';
    return this.zb.decal(this.x(lu, lv), ly, this.z(lu, lv), face, w, h, tex, opts);
  }
}

// prop rotation so that the model's local +x points along world (dx, dz)
export const rotAlong = (dx, dz) => Math.atan2(dz, dx);

// ---------------------------------------------------------------- polygon helpers for props
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// Planar quad a,b,c,d (any order around the polygon) facing `hint` (a direction vector). UVs are
// projected on the quad's own axes in texture repeats (su/sv metres per repeat); the texture's
// v axis runs along `vdir` (default: world down projected onto the plane).
export function face(mb, a, b, c, d, hint, st, su = 1, sv = 1, vdir = [0, -1, 0]) {
  let n = cross(sub(b, a), sub(d, a));
  if (dot(n, hint) < 0) { const t = b; b = d; d = t; n = [-n[0], -n[1], -n[2]]; }
  const nl = len(n) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
  // in-plane axes: v = projection of vdir on the plane, u = n x v (runs to the viewer's right)
  let v = sub(vdir, [n[0] * dot(vdir, n), n[1] * dot(vdir, n), n[2] * dot(vdir, n)]);
  if (len(v) < 1e-4) v = sub(b, a);
  const vl = len(v); v = [v[0] / vl, v[1] / vl, v[2] / vl];
  const u = cross(n, v);
  const uv = [];
  for (const p of [a, b, c, d]) { const r = sub(p, a); uv.push(dot(r, u) / su, dot(r, v) / sv); }
  return mb.poly4(a, b, c, d, st, uv);
}

// Triangle facing `hint`.
export function tface(mb, a, b, c, hint, st, su = 1, sv = 1, vdir = [0, -1, 0]) {
  let n = cross(sub(b, a), sub(c, a));
  if (dot(n, hint) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
  const nl = len(n) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
  let v = sub(vdir, [n[0] * dot(vdir, n), n[1] * dot(vdir, n), n[2] * dot(vdir, n)]);
  if (len(v) < 1e-4) v = sub(b, a);
  const vl = len(v); v = [v[0] / vl, v[1] / vl, v[2] / vl];
  const u = cross(n, v);
  const uv = [];
  for (const p of [a, b, c]) { const r = sub(p, a); uv.push(dot(r, u) / su, dot(r, v) / sv); }
  return mb.tri3(a, b, c, st, uv);
}

export { M };
