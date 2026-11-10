// Turns convex polyhedra into renderable THREE geometry, and provides the
// UV projections that keep textures continuous across fracture surfaces.
import * as THREE from 'three';
import { faceNormal } from './fracture.js';

const _n = [0, 0, 0];
const _uv = [0, 0];

/**
 * Build a flat-shaded (or smooth-grouped) BufferGeometry from a polyhedron.
 * @param poly   polyhedron in chunk-local coordinates
 * @param uvFn   (x,y,z, nx,ny,nz, tag, out, cx,cy,cz) -> writes out[0..1]; coordinates
 *               are in the ORIGINAL part space (local + off) so fragments keep the
 *               parent's texture placement.
 * @param off    chunk-local origin expressed in part space
 * Material groups are created per face tag (group.materialIndex === tag).
 */
export function buildPolyGeometry(poly, uvFn, off) {
  const faces = poly.faces;
  let tris = 0;
  for (const f of faces) tris += Math.max(0, f.pts.length - 2);
  const pos = new Float32Array(tris * 9);
  const nor = new Float32Array(tris * 9);
  const uv = new Float32Array(tris * 6);
  const ox = off ? off[0] : 0, oy = off ? off[1] : 0, oz = off ? off[2] : 0;

  // Per-face unit normals + optional smoothing accumulation.
  const normals = new Array(faces.length);
  let smooth = null;
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    faceNormal(f.pts, _n);
    const l = Math.hypot(_n[0], _n[1], _n[2]) || 1;
    const n = [_n[0] / l, _n[1] / l, _n[2] / l];
    normals[i] = n;
    if (f.smooth) {
      if (!smooth) smooth = new Map();
      for (const p of f.pts) {
        const key = f.smooth + ':' + Math.round(p[0] * 2e4) + ',' + Math.round(p[1] * 2e4) + ',' + Math.round(p[2] * 2e4);
        let acc = smooth.get(key);
        if (!acc) { acc = [0, 0, 0]; smooth.set(key, acc); }
        acc[0] += n[0] * l; acc[1] += n[1] * l; acc[2] += n[2] * l;
      }
    }
  }

  const order = faces.map((_, i) => i).sort((a, b) => (faces[a].tag || 0) - (faces[b].tag || 0));
  const geo = new THREE.BufferGeometry();
  let vi = 0, ui = 0;
  let curTag = -1, groupStart = 0;
  const writeVert = (p, f, n, cx, cy, cz) => {
    pos[vi] = p[0]; pos[vi + 1] = p[1]; pos[vi + 2] = p[2];
    let nx = n[0], ny = n[1], nz = n[2];
    if (f.smooth) {
      const key = f.smooth + ':' + Math.round(p[0] * 2e4) + ',' + Math.round(p[1] * 2e4) + ',' + Math.round(p[2] * 2e4);
      const acc = smooth.get(key);
      const l = Math.hypot(acc[0], acc[1], acc[2]) || 1;
      nx = acc[0] / l; ny = acc[1] / l; nz = acc[2] / l;
    }
    nor[vi] = nx; nor[vi + 1] = ny; nor[vi + 2] = nz;
    uvFn(p[0] + ox, p[1] + oy, p[2] + oz, n[0], n[1], n[2], f.tag || 0, _uv, cx, cy, cz);
    uv[ui] = _uv[0]; uv[ui + 1] = _uv[1];
    vi += 3; ui += 2;
  };
  for (const fi of order) {
    const f = faces[fi];
    const tag = f.tag || 0;
    if (tag !== curTag) {
      if (curTag >= 0 && vi / 3 > groupStart) geo.addGroup(groupStart, vi / 3 - groupStart, curTag);
      curTag = tag;
      groupStart = vi / 3;
    }
    const pts = f.pts, n = normals[fi];
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx = cx / pts.length + ox; cy = cy / pts.length + oy; cz = cz / pts.length + oz;
    for (let i = 1; i < pts.length - 1; i++) {
      writeVert(pts[0], f, n, cx, cy, cz);
      writeVert(pts[i], f, n, cx, cy, cz);
      writeVert(pts[i + 1], f, n, cx, cy, cz);
    }
  }
  if (curTag >= 0 && vi / 3 > groupStart) geo.addGroup(groupStart, vi / 3 - groupStart, curTag);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// UV projections
// ---------------------------------------------------------------------------

/**
 * Box / tri-planar projection in metres. `grain` (0|1|2|-1) is the part axis
 * the texture's vertical (V) direction should follow (wood grain direction).
 */
export function boxUV(scale = 0.6, grain = 1, offU = 0, offV = 0) {
  const inv = 1 / scale;
  return (x, y, z, nx, ny, nz, tag, out) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ax >= ay && ax >= az) {
      // face ⟂ X: in-plane axes are y, z
      if (grain === 2) { u = y; v = z; } else { u = z; v = y; }
    } else if (ay >= az) {
      // face ⟂ Y: in-plane axes x, z
      if (grain === 0) { u = z; v = x; } else { u = x; v = z; }
    } else {
      // face ⟂ Z: in-plane axes x, y
      if (grain === 0) { u = y; v = x; } else { u = x; v = y; }
    }
    out[0] = u * inv + offU;
    out[1] = v * inv + offV;
  };
}

/**
 * Stretch one image across the face perpendicular to `axisN` (screens, decals).
 * Other faces fall back to a box projection.
 */
export function fitUV(axisU, axisV, minU, minV, sizeU, sizeV, flipU = false, flipV = false) {
  const fb = boxUV(0.3, 1);
  const axisN = 3 - axisU - axisV;
  return (x, y, z, nx, ny, nz, tag, out) => {
    const n = axisN === 0 ? nx : axisN === 1 ? ny : nz;
    if (Math.abs(n) < 0.7) { fb(x, y, z, nx, ny, nz, tag, out); return; }
    const p = [x, y, z];
    let u = (p[axisU] - minU) / sizeU;
    let v = (p[axisV] - minV) / sizeV;
    if (flipU) u = 1 - u;
    if (flipV) v = 1 - v;
    out[0] = u;
    out[1] = v;
  };
}

/** Cylindrical wrap about the Y axis: u = angle, v = height. */
export function cylUV(y0, height, repeatU = 1) {
  return (x, y, z, nx, ny, nz, tag, out, cx, cy, cz) => {
    const ac = Math.atan2(cz, cx);
    let a = Math.atan2(z, x);
    let d = a - ac;
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    a = ac + d;
    out[0] = (-a / (Math.PI * 2)) * repeatU;
    out[1] = (y - y0) / height;
  };
}

// ---------------------------------------------------------------------------
// Helpers for hand-built (non-fracture) geometry
// ---------------------------------------------------------------------------

/** Re-project the UVs of any geometry with a uvFn, and collapse it to one material slot. */
export function applyUV(geo, uvFn, off) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  let uv = geo.attributes.uv;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    geo.setAttribute('uv', uv);
  }
  const ox = off ? off[0] : 0, oy = off ? off[1] : 0, oz = off ? off[2] : 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz;
    uvFn(x, y, z, nor.getX(i), nor.getY(i), nor.getZ(i), 0, _uv, x, y, z);
    uv.setXY(i, _uv[0], _uv[1]);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Subdivided box (for dentable sheet metal). Single material slot. */
export function panelGeometry(sx, sy, sz, uvFn, cell = 0.05) {
  const seg = (s) => Math.max(1, Math.min(24, Math.round(s / cell)));
  const geo = new THREE.BoxGeometry(sx, sy, sz, seg(sx), seg(sy), seg(sz));
  geo.clearGroups();
  geo.addGroup(0, geo.index.count, 0);
  applyUV(geo, uvFn);
  return geo;
}

const _v = new THREE.Vector3();

/**
 * Permanently dent a geometry: vertices within `radius` of `point` are pushed
 * along `dir` by up to `depth` with a smooth falloff. Returns true if changed.
 */
export function dentGeometry(geo, point, dir, radius, depth, maxOffset = 0.09) {
  const pos = geo.attributes.position;
  if (!geo.userData.rest) geo.userData.rest = pos.array.slice();
  const rest = geo.userData.rest;
  const r2 = radius * radius;
  let changed = false;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const d2 = _v.distanceToSquared(point);
    if (d2 > r2) continue;
    const f = 1 - Math.sqrt(d2) / radius;
    const push = depth * f * f * (3 - 2 * f);
    _v.addScaledVector(dir, push);
    // limit total displacement from the rest shape
    const rx = rest[i * 3], ry = rest[i * 3 + 1], rz = rest[i * 3 + 2];
    const ox = _v.x - rx, oy = _v.y - ry, oz = _v.z - rz;
    const ol = Math.hypot(ox, oy, oz);
    if (ol > maxOffset) {
      const k = maxOffset / ol;
      _v.set(rx + ox * k, ry + oy * k, rz + oz * k);
    }
    pos.setXYZ(i, _v.x, _v.y, _v.z);
    changed = true;
  }
  if (changed) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return changed;
}

/**
 * Curved shell tile on a surface of revolution about Y (vase walls, tubs).
 * corners: four [theta, y] parameter-space corners (CCW when unrolled), rFn(y)
 * gives the outer radius, `th` the wall thickness. Slot 0 = outer, 1 = cut edges,
 * 2 = inner surface. uv: u = theta/2π, v = (y - y0)/h.
 */
export function shellTileGeometry(corners, rFn, th, y0, h, sub = 3, repeatU = 1) {
  const pos = [], nor = [], uv = [];
  const groups = [[], [], []];
  const param = (s, t) => {
    const a0 = corners[0][0] + (corners[1][0] - corners[0][0]) * s;
    const a1 = corners[3][0] + (corners[2][0] - corners[3][0]) * s;
    const b0 = corners[0][1] + (corners[1][1] - corners[0][1]) * s;
    const b1 = corners[3][1] + (corners[2][1] - corners[3][1]) * s;
    return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];
  };
  const surf = (theta, y, inner) => {
    const r = Math.max(0.001, rFn(y) - (inner ? th : 0));
    const e = 0.002;
    const dr = (rFn(y + e) - rFn(y - e)) / (2 * e);
    const c = Math.cos(theta), s = Math.sin(theta);
    let nx = c, ny = -dr, nz = s;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    if (inner) { nx = -nx; ny = -ny; nz = -nz; }
    return { p: [c * r, y, s * r], n: [nx, ny, nz], uv: [(-theta / (Math.PI * 2)) * repeatU, (y - y0) / h] };
  };
  const push = (slot, a, b, c) => {
    const base = pos.length / 3;
    // make the winding agree with the supplied normal
    const gx = (b.p[1] - a.p[1]) * (c.p[2] - a.p[2]) - (b.p[2] - a.p[2]) * (c.p[1] - a.p[1]);
    const gy = (b.p[2] - a.p[2]) * (c.p[0] - a.p[0]) - (b.p[0] - a.p[0]) * (c.p[2] - a.p[2]);
    const gz = (b.p[0] - a.p[0]) * (c.p[1] - a.p[1]) - (b.p[1] - a.p[1]) * (c.p[0] - a.p[0]);
    if (gx * a.n[0] + gy * a.n[1] + gz * a.n[2] < 0) { const t = b; b = c; c = t; }
    for (const v of [a, b, c]) {
      pos.push(v.p[0], v.p[1], v.p[2]);
      nor.push(v.n[0], v.n[1], v.n[2]);
      uv.push(v.uv[0], v.uv[1]);
    }
    groups[slot].push(base, base + 1, base + 2);
  };
  // outer + inner surfaces
  for (const inner of [false, true]) {
    for (let i = 0; i < sub; i++) {
      for (let j = 0; j < sub; j++) {
        const q = [param(i / sub, j / sub), param((i + 1) / sub, j / sub), param((i + 1) / sub, (j + 1) / sub), param(i / sub, (j + 1) / sub)].map(
          ([a, y]) => surf(a, y, inner)
        );
        // theta increases counter-clockwise seen from +Y; outer faces need CW param order when viewed from outside
        if (!inner) { push(0, q[0], q[3], q[2]); push(0, q[0], q[2], q[1]); }
        else { push(2, q[0], q[1], q[2]); push(2, q[0], q[2], q[3]); }
      }
    }
  }
  // edge walls (flat-shaded fracture surfaces)
  const pc = param(0.5, 0.5);
  const cOut = surf(pc[0], pc[1], false).p, cIn = surf(pc[0], pc[1], true).p;
  const ctr = [(cOut[0] + cIn[0]) / 2, (cOut[1] + cIn[1]) / 2, (cOut[2] + cIn[2]) / 2];
  const edge = (s0, t0, s1, t1) => {
    for (let i = 0; i < sub; i++) {
      const k0 = i / sub, k1 = (i + 1) / sub;
      const pa = param(s0 + (s1 - s0) * k0, t0 + (t1 - t0) * k0);
      const pb = param(s0 + (s1 - s0) * k1, t0 + (t1 - t0) * k1);
      const oa = surf(pa[0], pa[1], false), ob = surf(pb[0], pb[1], false);
      const ia = surf(pa[0], pa[1], true), ib = surf(pb[0], pb[1], true);
      const e1 = [ob.p[0] - oa.p[0], ob.p[1] - oa.p[1], ob.p[2] - oa.p[2]];
      const e2 = [ia.p[0] - oa.p[0], ia.p[1] - oa.p[1], ia.p[2] - oa.p[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[0] * (oa.p[0] - ctr[0]) + n[1] * (oa.p[1] - ctr[1]) + n[2] * (oa.p[2] - ctr[2]) < 0) n = [-n[0], -n[1], -n[2]];
      const mk = (v) => ({ p: v.p, n, uv: [v.p[0] * 8 + v.p[2] * 8, v.p[1] * 8] });
      push(1, mk(oa), mk(ob), mk(ib));
      push(1, mk(oa), mk(ib), mk(ia));
    }
  };
  edge(0, 0, 1, 0);
  edge(1, 0, 1, 1);
  edge(1, 1, 0, 1);
  edge(0, 1, 0, 0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const index = [];
  let start = 0;
  for (let s = 0; s < 3; s++) {
    for (const i of groups[s]) index.push(i);
    if (groups[s].length) geo.addGroup(start, groups[s].length, s);
    start += groups[s].length;
  }
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** Shift a geometry so that `c` becomes its origin. */
export function recenter(geo, c) {
  geo.translate(-c[0], -c[1], -c[2]);
  return geo;
}
