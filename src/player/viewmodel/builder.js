// Box model builder for viewmodel meshes.
//
// Models are authored in centimetres in "model space": +X right, +Y up, -Z forward (barrel / blade direction).
// Boxes are given by centre + size (optionally rotated about their centre) inside the current transform frame
// (push/pop). Boxes are grouped into named *parts*: each part becomes one Mesh whose origin is the part's pivot
// (given in model space) so it can be translated / rotated by animations. Named *points* (muzzle, hand anchors,
// grab points...) become Object3D children of the part they were declared in.
import * as THREE from 'three';
import { M } from './material.js';

const _c = new THREE.Color();
/** sRGB hex -> linear rgb array (ColorManagement converts on setHex). */
export function lin(hex) {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
}
/** Multiply / mix helpers on hex colours (sRGB space). */
export function shade(hex, f) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
export function mixHex(a, b, t) {
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const A = ch(a), B = ch(b);
  const o = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return (o[0] << 16) | (o[1] << 8) | o[2];
}

// face table: normal, u axis, v axis (u x v = n)
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], ua: 2, va: 1, key: 'px' },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], ua: 2, va: 1, key: 'nx' },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], ua: 0, va: 2, key: 'py' },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], ua: 0, va: 2, key: 'ny' },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], ua: 0, va: 1, key: 'pz' },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], ua: 0, va: 1, key: 'nz' },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const ONE = new THREE.Vector3(1, 1, 1);

function makeMatrix(t, r, order = 'XYZ') {
  _e.set(r[0] || 0, r[1] || 0, r[2] || 0, order);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(t[0] || 0, t[1] || 0, t[2] || 0), _q, ONE);
}

export class ModelBuilder {
  constructor(opts = {}) {
    this.texel = opts.texel ?? 1;
    this.parts = new Map();
    this.order = [];
    this.stack = [new THREE.Matrix4()];
    this.seed = opts.seed ?? 1;
    this.part('body');
  }

  /** Switch to (create) a part. opts: {origin:[x,y,z] pivot in model space, parent:'body'} */
  part(name, opts = {}) {
    let p = this.parts.get(name);
    if (!p) {
      p = {
        name,
        origin: new THREE.Vector3(...(opts.origin || [0, 0, 0])),
        parent: name === 'body' ? null : opts.parent ?? 'body',
        pos: [], nrm: [], col: [], face: [], tex: [], idx: [],
        points: [],
      };
      this.parts.set(name, p);
      this.order.push(name);
    }
    this.cur = p;
    return this;
  }

  top() { return this.stack[this.stack.length - 1]; }
  /** Push a transform frame: translate t then rotate r (euler XYZ, radians) */
  push(t = [0, 0, 0], r = [0, 0, 0]) {
    this.stack.push(this.top().clone().multiply(makeMatrix(t, r)));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Transform a local point of the current frame into model space. */
  local(p) {
    return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.top());
  }

  /** Register a named point (in the current frame) on the current part. */
  point(name, p) {
    this.cur.points.push({ name, p: this.local(p) });
    return this;
  }

  /**
   * Box: centre (cx,cy,cz), size (sx,sy,sz), colour hex, material id.
   * o: {r:[rx,ry,rz] rotation about the centre, texel, faces:{px:hex,...} per-face colour, skip:'px,nx'}
   */
  box(cx, cy, cz, sx, sy, sz, col, mat = M.PLAIN, o = {}) {
    const p = this.cur;
    const mtx = o.r ? this.top().clone().multiply(makeMatrix([cx, cy, cz], o.r)) : this.top().clone().multiply(makeMatrix([cx, cy, cz], [0, 0, 0]));
    _n3.setFromMatrix4(mtx);
    const texel = o.texel ?? this.texel;
    const half = [sx / 2, sy / 2, sz / 2];
    const size = [sx, sy, sz];
    const seed = ((this.seed++ * 0.6180339887) % 1) * 97 + 1;
    const skip = o.skip || '';
    for (const f of FACES) {
      if (skip && skip.includes(f.key)) continue;
      const fc = lin(o.faces && o.faces[f.key] != null ? o.faces[f.key] : col);
      const w = size[f.ua] / texel, h = size[f.va] / texel;
      const base = p.pos.length / 3;
      _n.set(f.n[0], f.n[1], f.n[2]).applyMatrix3(_n3).normalize();
      for (let k = 0; k < 4; k++) {
        const su = k === 1 || k === 2 ? 1 : -1;
        const sv = k >= 2 ? 1 : -1;
        const x = f.n[0] * half[0] + f.u[0] * su * half[f.ua] + f.v[0] * sv * half[f.va];
        const y = f.n[1] * half[1] + f.u[1] * su * half[f.ua] + f.v[1] * sv * half[f.va];
        const z = f.n[2] * half[2] + f.u[2] * su * half[f.ua] + f.v[2] * sv * half[f.va];
        _v.set(x, y, z).applyMatrix4(mtx);
        p.pos.push(_v.x, _v.y, _v.z);
        p.nrm.push(_n.x, _n.y, _n.z);
        p.col.push(fc[0], fc[1], fc[2]);
        p.face.push(w, h, mat, seed);
        p.tex.push(su > 0 ? w : 0, sv > 0 ? h : 0);
      }
      p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** Box from min/max corners. */
  span(x0, x1, y0, y1, z0, z1, col, mat, o) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col, mat, o);
  }

  /** Rounded bar along Z (two crossed boxes => octagon-ish profile). */
  tubeZ(cx, cy, cz, d, len, col, mat, o = {}) {
    const k = o.k ?? 0.62;
    this.box(cx, cy, cz, d, d * k, len, col, mat, o);
    this.box(cx, cy, cz, d * k, d, len, col, mat, o);
    if (o.core !== false) this.box(cx, cy, cz, d * 0.86, d * 0.86, len * 0.998, col, mat, o);
    return this;
  }
  /** Rounded bar along Y. */
  tubeY(cx, cy, cz, d, len, col, mat, o = {}) {
    const k = o.k ?? 0.62;
    this.box(cx, cy, cz, d, len, d * k, col, mat, o);
    this.box(cx, cy, cz, d * k, len, d, col, mat, o);
    if (o.core !== false) this.box(cx, cy, cz, d * 0.86, len * 0.998, d * 0.86, col, mat, o);
    return this;
  }
  /** Rounded bar along X. */
  tubeX(cx, cy, cz, d, len, col, mat, o = {}) {
    const k = o.k ?? 0.62;
    this.box(cx, cy, cz, len, d, d * k, col, mat, o);
    this.box(cx, cy, cz, len, d * k, d, col, mat, o);
    if (o.core !== false) this.box(cx, cy, cz, len * 0.998, d * 0.86, d * 0.86, col, mat, o);
    return this;
  }

  /**
   * Build meshes. Returns {group, parts: {name: Object3D}, points: {name: Object3D}}.
   * group scale converts cm -> m (scale arg multiplies it).
   */
  build(material, scale = 1) {
    const group = new THREE.Group();
    group.scale.setScalar(0.01 * scale);
    const parts = {};
    const points = {};
    for (const name of this.order) {
      const p = this.parts.get(name);
      let obj;
      if (p.idx.length) {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(p.pos);
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] -= p.origin.x;
          pos[i + 1] -= p.origin.y;
          pos[i + 2] -= p.origin.z;
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(p.nrm), 3));
        g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(p.col), 3));
        g.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(p.face), 4));
        g.setAttribute('aTex', new THREE.BufferAttribute(new Float32Array(p.tex), 2));
        g.setIndex(p.idx.length > 65535 ? new THREE.Uint32BufferAttribute(p.idx, 1) : new THREE.Uint16BufferAttribute(p.idx, 1));
        g.computeBoundingSphere();
        obj = new THREE.Mesh(g, material);
        obj.frustumCulled = false;
      } else {
        obj = new THREE.Group();
      }
      obj.name = name;
      parts[name] = obj;
      for (const pt of p.points) {
        const o = new THREE.Object3D();
        o.name = pt.name;
        o.position.copy(pt.p).sub(p.origin);
        obj.add(o);
        points[pt.name] = o;
      }
    }
    for (const name of this.order) {
      const p = this.parts.get(name);
      const obj = parts[name];
      if (!p.parent) {
        group.add(obj);
        continue;
      }
      const par = this.parts.get(p.parent);
      obj.position.copy(p.origin).sub(par.origin);
      parts[p.parent].add(obj);
    }
    // remember rest transforms for animation resets
    for (const name in parts) {
      const o = parts[name];
      o.userData.restPos = o.position.clone();
      o.userData.restQuat = o.quaternion.clone();
    }
    return { group, parts, points };
  }
}

/** Dispose all geometries under an object. */
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
