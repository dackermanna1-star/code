// Geometry builder used by the cabin: accumulates vertices with a 4-channel
// `bake` attribute (x = ceiling-wash, y = sidewall-wash, z = ambient occlusion,
// w = cove glow) that the cabin materials turn into a light-map-like GI term.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export const BAKE_NONE = [0.12, 0.05, 1, 0];

export class GeoBuilder {
  constructor(name = 'geo') {
    this.name = name;
    this.pos = []; this.nrm = []; this.uv = []; this.bake = []; this.idx = [];
    this.n = 0;
    this.bakeFn = null;        // (x,y,z,nx,ny,nz) -> [4]
    this.defaultBake = BAKE_NONE;
  }

  vert(x, y, z, nx, ny, nz, u = 0, v = 0, bake = null) {
    this.pos.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    const b = bake || (this.bakeFn ? this.bakeFn(x, y, z, nx, ny, nz) : this.defaultBake);
    this.bake.push(b[0], b[1], b[2], b[3] || 0);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** quad a-b-c-d counter-clockwise when seen from the front */
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /**
   * Regular grid: fn(i, j, out) fills out = {p:[x,y,z], n:[x,y,z], uv:[u,v], bake?} for
   * i in [0, ni], j in [0, nj]. Faces are oriented so that (i -> +1, j -> +1) is CCW
   * unless flip is set.
   */
  grid(ni, nj, fn, flip = false) {
    const base = this.n;
    const o = { p: [0, 0, 0], n: [0, 0, 1], uv: [0, 0], bake: null };
    for (let j = 0; j <= nj; j++) {
      for (let i = 0; i <= ni; i++) {
        o.bake = null;
        fn(i, j, o);
        this.vert(o.p[0], o.p[1], o.p[2], o.n[0], o.n[1], o.n[2], o.uv[0], o.uv[1], o.bake);
      }
    }
    const row = ni + 1;
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const a = base + j * row + i, b = a + 1, c = a + row + 1, d = a + row;
        if (flip) this.quad(a, d, c, b); else this.quad(a, b, c, d);
      }
    }
  }

  /** Merge a THREE.BufferGeometry (non-indexed or indexed) transformed by matrix. */
  addGeometry(geo, matrix = null, bake = null, uvTransform = null) {
    const p = geo.attributes.position, nn = geo.attributes.normal, uv = geo.attributes.uv;
    const base = this.n;
    if (matrix) _m3.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (nn) _n.fromBufferAttribute(nn, i); else _n.set(0, 1, 0);
      if (matrix) { _v.applyMatrix4(matrix); _n.applyMatrix3(_m3).normalize(); }
      let u = uv ? uv.getX(i) : 0, w = uv ? uv.getY(i) : 0;
      if (uvTransform) { const r = uvTransform(u, w); u = r[0]; w = r[1]; }
      const b = typeof bake === 'function' ? bake(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z) : bake;
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, w, b);
    }
    const det = matrix ? matrix.determinant() : 1;
    if (geo.index) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        if (det < 0) this.idx.push(base + ix[i], base + ix[i + 2], base + ix[i + 1]);
        else this.idx.push(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
      }
    } else {
      for (let i = 0; i < p.count; i += 3) {
        if (det < 0) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    return this;
  }

  /** Append another builder's content. */
  append(b) {
    const base = this.n;
    for (let i = 0; i < b.pos.length; i++) this.pos.push(b.pos[i]);
    for (let i = 0; i < b.nrm.length; i++) this.nrm.push(b.nrm[i]);
    for (let i = 0; i < b.uv.length; i++) this.uv.push(b.uv[i]);
    for (let i = 0; i < b.bake.length; i++) this.bake.push(b.bake[i]);
    for (const i of b.idx) this.idx.push(i + base);
    this.n += b.n;
    return this;
  }

  /** Mirror x (left side copy) appended to this builder. */
  appendMirroredX(b) {
    const base = this.n;
    for (let i = 0; i < b.n; i++) {
      this.pos.push(-b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]);
      this.nrm.push(-b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
      this.uv.push(b.uv[i * 2], b.uv[i * 2 + 1]);
      this.bake.push(b.bake[i * 4], b.bake[i * 4 + 1], b.bake[i * 4 + 2], b.bake[i * 4 + 3]);
    }
    for (let i = 0; i < b.idx.length; i += 3) this.idx.push(b.idx[i] + base, b.idx[i + 2] + base, b.idx[i + 1] + base);
    this.n += b.n;
    return this;
  }

  /** Translate a copy of builder b by (dx,dy,dz) into this builder, optional uv offset. */
  appendTranslated(b, dx, dy, dz, du = 0, dv = 0) {
    const base = this.n;
    for (let i = 0; i < b.n; i++) {
      this.pos.push(b.pos[i * 3] + dx, b.pos[i * 3 + 1] + dy, b.pos[i * 3 + 2] + dz);
      this.nrm.push(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
      this.uv.push(b.uv[i * 2] + du, b.uv[i * 2 + 1] + dv);
      this.bake.push(b.bake[i * 4], b.bake[i * 4 + 1], b.bake[i * 4 + 2], b.bake[i * 4 + 3]);
    }
    for (const i of b.idx) this.idx.push(i + base);
    this.n += b.n;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(this.bake, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.name = this.name;
    return g;
  }
  get empty() { return this.n === 0; }
}

/** Extrude a 2D polyline profile [[x,y],...] along z values. Normals computed from the profile (pointing left of travel direction unless flip). */
export function extrudeProfile(b, pts, zs, { flip = false, uScale = 1, vScale = 1, normals = null, bake = null, uOffset = 0 } = {}) {
  const n = pts.length;
  // arc length & normals
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const nr = normals || pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    return flip ? [ty, -tx] : [-ty, tx];
  });
  b.grid(n - 1, zs.length - 1, (i, j, o) => {
    o.p[0] = pts[i][0]; o.p[1] = pts[i][1]; o.p[2] = zs[j];
    o.n[0] = nr[i][0]; o.n[1] = nr[i][1]; o.n[2] = 0;
    o.uv[0] = uOffset + s[i] * uScale; o.uv[1] = zs[j] * vScale;
    if (bake) o.bake = typeof bake === 'function' ? bake(o.p[0], o.p[1], o.p[2], o.n[0], o.n[1], 0, i, j) : bake;
  }, !flip);
  return s;
}

/** Uniform list of z values between a and b with maximum step. Includes extra breakpoints. */
export function zList(a, b, step, extra = []) {
  const set = new Set();
  const n = Math.max(1, Math.ceil((b - a) / step));
  for (let i = 0; i <= n; i++) set.add(+(a + (b - a) * i / n).toFixed(5));
  for (const e of extra) if (e > a && e < b) set.add(+e.toFixed(5));
  return [...set].sort((x, y) => x - y);
}

/** Box with bake (axis-aligned, all faces), into builder. */
export function addBox(b, x0, y0, z0, x1, y1, z1, bake = null, uvScale = 1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const uv = g.attributes.uv;
  if (uvScale !== 1) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  b.addGeometry(g, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), bake);
  g.dispose();
}

/** Rounded box geometry (three addon). */
export function roundedBoxGeometry(w, h, d, r = 0.01, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}
