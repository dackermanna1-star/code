// =============================================================================
// Unit shapes for custom instancing (houses / barns / containers / trees) and a
// small helper that turns per-instance arrays into one instanced draw call.
// =============================================================================
import * as THREE from 'three';

/**
 * Box building with gabled (ridge along local x) or hipped roof, unit footprint
 * [-0.5, 0.5]^2, walls y 0..1, roof y 1..2 (scaled by iSize.w = rise).
 * Attributes: position, normal, aUAx (facade u axis), aPart (0 wall, 1 roof),
 * aOver (overhang direction for roof eaves).
 */
export function unitHouse(hip = false) {
  const P = [], N = [], U = [], A = [], O = [], I = [];
  const add = (p, n, u, part, o) => { P.push(...p); N.push(...n); U.push(...u); A.push(part); O.push(...o); return P.length / 3 - 1; };
  const quad = (ps, n, u, part, os) => {
    const k = ps.map((p, i) => add(p, n, u, part, os ? os[i] : [0, 0, 0]));
    I.push(k[0], k[1], k[2], k[0], k[2], k[3]);
  };
  const tri = (ps, n, u, part, os) => {
    const k = ps.map((p, i) => add(p, n, u, part, os ? os[i] : [0, 0, 0]));
    I.push(k[0], k[1], k[2]);
  };
  const h = 0.5;
  // walls (y 0..1)
  quad([[-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h]], [0, 0, 1], [1, 0, 0], 0);
  quad([[h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h]], [0, 0, -1], [-1, 0, 0], 0);
  quad([[h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h]], [1, 0, 0], [0, 0, -1], 0);
  quad([[-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h]], [-1, 0, 0], [0, 0, 1], 0);
  const nz = [0, 0.5, 1]; // slope normal in unit space (rise 1 over half-depth 0.5)
  const nl = Math.hypot(...nz);
  if (!hip) {
    // two roof planes, ridge along x at y = 2, eaves overhang outward/downward
    quad([[-h, 1, h], [h, 1, h], [h, 2, 0], [-h, 2, 0]], [0, nz[1] / nl, nz[2] / nl], [1, 0, 0], 1,
      [[-1, -1, 1], [1, -1, 1], [1, 0, 0], [-1, 0, 0]]);
    quad([[h, 1, -h], [-h, 1, -h], [-h, 2, 0], [h, 2, 0]], [0, nz[1] / nl, -nz[2] / nl], [-1, 0, 0], 1,
      [[1, -1, -1], [-1, -1, -1], [-1, 0, 0], [1, 0, 0]]);
    // gable ends (wall part, so they take the wall colour)
    tri([[h, 1, h], [h, 1, -h], [h, 2, 0]], [1, 0, 0], [0, 0, -1], 0);
    tri([[-h, 1, -h], [-h, 1, h], [-h, 2, 0]], [-1, 0, 0], [0, 0, 1], 0);
  } else {
    // hipped: ridge shortened to the middle 40 % of the length
    const r = 0.2;
    quad([[-h, 1, h], [h, 1, h], [r, 2, 0], [-r, 2, 0]], [0, nz[1] / nl, nz[2] / nl], [1, 0, 0], 1,
      [[-1, -1, 1], [1, -1, 1], [0, 0, 0], [0, 0, 0]]);
    quad([[h, 1, -h], [-h, 1, -h], [-r, 2, 0], [r, 2, 0]], [0, nz[1] / nl, -nz[2] / nl], [-1, 0, 0], 1,
      [[1, -1, -1], [-1, -1, -1], [0, 0, 0], [0, 0, 0]]);
    tri([[h, 1, h], [h, 1, -h], [r, 2, 0]], [0.958, 0.287, 0], [0, 0, -1], 1, [[1, -1, 1], [1, -1, -1], [0, 0, 0]]);
    tri([[-h, 1, -h], [-h, 1, h], [-r, 2, 0]], [-0.958, 0.287, 0], [0, 0, 1], 1, [[-1, -1, -1], [-1, -1, 1], [0, 0, 0]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aUAx', new THREE.Float32BufferAttribute(U, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setAttribute('aOver', new THREE.Float32BufferAttribute(O, 3));
  g.setIndex(I);
  return g;
}

/** Deterministic lumpy icosahedron crown (broadleaf), trunk below. Unit height ~1. */
export function unitBroadleaf() {
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = ico.attributes.position;
  const P = [], N = [], T = [];
  const lump = (x, y, z) => 1 + 0.16 * Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 7.3 - y * 5.1) + 0.08 * Math.sin(x * 17 + z * 13);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = lump(x, y, z);
    x *= l; y *= l * 0.92; z *= l;
    if (y < -0.2) y = -0.2 + (y + 0.2) * 0.5;   // flatter underside
    P.push(x, y + 0.62, z);
    const nl = Math.hypot(x, y, z) || 1;
    N.push(x / nl, y / nl, z / nl);
    T.push(0);
  }
  // trunk: 4-sided tapered post
  const tr = 0.045;
  const quads = [[[-tr, 0, tr], [tr, 0, tr], [tr * 0.6, 0.35, tr * 0.6], [-tr * 0.6, 0.35, tr * 0.6]], [[tr, 0, -tr], [-tr, 0, -tr], [-tr * 0.6, 0.35, -tr * 0.6], [tr * 0.6, 0.35, -tr * 0.6]],
    [[tr, 0, tr], [tr, 0, -tr], [tr * 0.6, 0.35, -tr * 0.6], [tr * 0.6, 0.35, tr * 0.6]], [[-tr, 0, -tr], [-tr, 0, tr], [-tr * 0.6, 0.35, tr * 0.6], [-tr * 0.6, 0.35, -tr * 0.6]]];
  for (const q of quads) {
    const n = [Math.sign(q[0][0] + q[1][0]), 0, Math.sign(q[0][2] + q[1][2])];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...q[k]); N.push(...n); T.push(1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTrunk', new THREE.Float32BufferAttribute(T, 1));
  return g;
}

/** Conifer: two stacked cones + trunk. Unit height 1. */
export function unitConifer() {
  const P = [], N = [], T = [];
  const cone = (y0, y1, r, n = 7) => {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const s = r / (y1 - y0);
      const nn = (a) => { const l = Math.hypot(1, s); return [Math.cos(a) / l, s / l, Math.sin(a) / l]; };
      P.push(Math.cos(a0) * r, y0, Math.sin(a0) * r, 0, y1, 0, Math.cos(a1) * r, y0, Math.sin(a1) * r);
      N.push(...nn(a0), ...nn((a0 + a1) / 2), ...nn(a1));
      T.push(0, 0, 0);
    }
  };
  cone(0.12, 0.7, 0.24);
  cone(0.42, 1.0, 0.17);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTrunk', new THREE.Float32BufferAttribute(T, 1));
  return g;
}

/** Palm: slender curved trunk + 7 drooping fronds. Unit height 1. */
export function unitPalm() {
  const P = [], N = [], T = [];
  const tr = 0.018;
  const segs = [[0, 0], [0.02, 0.35], [0.05, 0.7], [0.07, 0.95]];
  for (let s = 0; s < segs.length - 1; s++) {
    const [x0, y0] = segs[s], [x1, y1] = segs[s + 1];
    for (let i = 0; i < 4; i++) {
      const a0 = i / 4 * Math.PI * 2, a1 = (i + 1) / 4 * Math.PI * 2;
      const c0 = [x0 + Math.cos(a0) * tr, y0, Math.sin(a0) * tr], c1 = [x0 + Math.cos(a1) * tr, y0, Math.sin(a1) * tr];
      const c2 = [x1 + Math.cos(a1) * tr * 0.8, y1, Math.sin(a1) * tr * 0.8], c3 = [x1 + Math.cos(a0) * tr * 0.8, y1, Math.sin(a0) * tr * 0.8];
      const nA = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      for (const c of [c0, c2, c1, c0, c3, c2]) { P.push(...c); N.push(...nA); T.push(1); }
    }
  }
  const top = [0.07, 0.95, 0];
  for (let f = 0; f < 7; f++) {
    const a = f / 7 * Math.PI * 2 + 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const L = 0.3;
    const mid = [top[0] + dx * L * 0.5, top[1] + 0.04, top[2] + dz * L * 0.5];
    const tip = [top[0] + dx * L, top[1] - 0.12, top[2] + dz * L];
    const sx = -dz * 0.06, sz = dx * 0.06;
    const l1 = [mid[0] + sx, mid[1], mid[2] + sz], r1 = [mid[0] - sx, mid[1], mid[2] - sz];
    for (const c of [top, l1, mid, top, mid, r1, mid, l1, tip, mid, tip, r1]) { P.push(...c); N.push(dx * 0.3, 0.9, dz * 0.3); T.push(0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTrunk', new THREE.Float32BufferAttribute(T, 1));
  return g;
}

/**
 * Collects per-instance float data then builds a Mesh with an
 * InstancedBufferGeometry (one draw call). `layout` = {name: itemSize}.
 */
export class InstanceSet {
  constructor(layout, cap = 1024) {
    this.layout = layout;
    this.count = 0;
    this.cap = cap;
    this.data = {};
    for (const [k, n] of Object.entries(layout)) this.data[k] = new Float32Array(cap * n);
    this.minX = Infinity; this.maxX = -Infinity; this.minY = Infinity; this.maxY = -Infinity; this.minZ = Infinity; this.maxZ = -Infinity;
  }
  _grow() {
    this.cap *= 2;
    for (const [k, n] of Object.entries(this.layout)) { const a = new Float32Array(this.cap * n); a.set(this.data[k]); this.data[k] = a; }
  }
  /** values: {name: [..]} ; bounds point (x, y, z) for the bounding sphere. */
  push(values, x, y, z, r = 30) {
    if (this.count >= this.cap) this._grow();
    const i = this.count++;
    for (const [k, n] of Object.entries(this.layout)) {
      const v = values[k], d = this.data[k];
      for (let j = 0; j < n; j++) d[i * n + j] = v[j];
    }
    if (x - r < this.minX) this.minX = x - r; if (x + r > this.maxX) this.maxX = x + r;
    if (y - r < this.minY) this.minY = y - r; if (y + r > this.maxY) this.maxY = y + r;
    if (z - r < this.minZ) this.minZ = z - r; if (z + r > this.maxZ) this.maxZ = z + r;
    return i;
  }
  build(unitGeo, material, name) {
    if (this.count === 0) return null;
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(unitGeo.attributes)) g.setAttribute(k, a);
    if (unitGeo.index) g.setIndex(unitGeo.index);
    for (const [k, n] of Object.entries(this.layout)) g.setAttribute(k, new THREE.InstancedBufferAttribute(this.data[k].slice(0, this.count * n), n));
    g.instanceCount = this.count;
    const c = new THREE.Vector3((this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2, (this.minZ + this.maxZ) / 2);
    const r = Math.hypot(this.maxX - this.minX, this.maxY - this.minY, this.maxZ - this.minZ) / 2;
    g.boundingSphere = new THREE.Sphere(c, r);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(this.minX, this.minY, this.minZ), new THREE.Vector3(this.maxX, this.maxY, this.maxZ));
    const m = new THREE.Mesh(g, material);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
}

/** House-like instance helper: centre x,z, base y, width (local x), wall height, depth, roof rise, rotation, colours, styles. */
export const HOUSE_LAYOUT = { iPos: 4, iSize: 4, iWall: 3, iRoof: 3, iMisc: 2 };
export const TREE_LAYOUT = { iPos: 4, iCol: 4 };
const _v = { iPos: [0, 0, 0, 0], iSize: [0, 0, 0, 0], iWall: [0, 0, 0], iRoof: [0, 0, 0], iMisc: [0, 0] };
export function pushHouse(set, x, y, z, w, h, d, rise, rot, wall, roof, seed, wallStyle, roofStyle) {
  _v.iPos[0] = x; _v.iPos[1] = y; _v.iPos[2] = z; _v.iPos[3] = rot;
  _v.iSize[0] = w; _v.iSize[1] = h; _v.iSize[2] = d; _v.iSize[3] = rise;
  _v.iWall = wall; _v.iRoof = roof;
  _v.iMisc[0] = seed; _v.iMisc[1] = wallStyle + 16 * roofStyle;
  return set.push(_v, x, y, z, Math.max(w, d));
}
const _t = { iPos: [0, 0, 0, 0], iCol: [0, 0, 0, 0] };
export function pushTree(set, x, y, z, height, col, stretch = 1) {
  _t.iPos[0] = x; _t.iPos[1] = y; _t.iPos[2] = z; _t.iPos[3] = height;
  _t.iCol[0] = col[0]; _t.iCol[1] = col[1]; _t.iCol[2] = col[2]; _t.iCol[3] = stretch;
  return set.push(_t, x, y, z, height);
}
