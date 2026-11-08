// Geometry builder for the coach interior (adapted from the flight cabin's
// src/aircraft/cabin/geom.js). Accumulates vertices with a 4-channel `bake`
// attribute — x = ceiling-cove LED wash, y = rack down-light wash, z = ambient
// occlusion, w = floor LED glow — which the interior materials turn into a
// light-map-like GI term (see materials.js). Optional per-vertex colour.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _m = new THREE.Matrix4();

export const BAKE_DEFAULT = [0.25, 0.2, 1, 0];

export class GeoBuilder {
  constructor(name = 'geo') {
    this.name = name;
    this.pos = []; this.nrm = []; this.uv = []; this.bake = []; this.col = []; this.idx = [];
    this.n = 0;
    this.bakeFn = null;            // (x,y,z,nx,ny,nz) -> [4]
    this.defaultBake = BAKE_DEFAULT;
    this.color = [1, 1, 1];        // current vertex colour
    this.useColor = false;
  }

  setColor(c) {
    if (c instanceof THREE.Color) this.color = [c.r, c.g, c.b];
    else if (typeof c === 'string' || typeof c === 'number') { const cc = new THREE.Color(c); this.color = [cc.r, cc.g, cc.b]; } else this.color = c;
    this.useColor = true;
    return this;
  }

  vert(x, y, z, nx, ny, nz, u = 0, v = 0, bake = null) {
    this.pos.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    const b = bake || (this.bakeFn ? this.bakeFn(x, y, z, nx, ny, nz) : this.defaultBake);
    this.bake.push(b[0], b[1], b[2], b[3] || 0);
    this.col.push(this.color[0], this.color[1], this.color[2]);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** quad a-b-c-d counter-clockwise when seen from the front */
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /** Regular grid; fn(i, j, o) fills o = {p, n, uv, bake?}. */
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

  /** Planar quad from 4 corners (CCW seen from the front), uv 0..1 (or given), normal computed. */
  quad4(p0, p1, p2, p3, bake = null, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const ps = [p0, p1, p2, p3];
    const ids = ps.map((p, i) => this.vert(p[0], p[1], p[2], nx, ny, nz, uv[i][0], uv[i][1], typeof bake === 'function' ? bake(p[0], p[1], p[2], nx, ny, nz) : bake));
    this.quad(ids[0], ids[1], ids[2], ids[3]);
    return ids;
  }

  /** Merge a THREE.BufferGeometry transformed by matrix. bake: [4] | fn | null (builder default). */
  addGeometry(geo, matrix = null, bake = null, uvTransform = null) {
    const p = geo.attributes.position, nn = geo.attributes.normal, uv = geo.attributes.uv;
    const base = this.n;
    if (matrix) _m3.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (nn) _n.fromBufferAttribute(nn, i); else _n.set(0, 1, 0);
      if (matrix) { _v.applyMatrix4(matrix); _n.applyMatrix3(_m3).normalize(); }
      let u = uv ? uv.getX(i) : 0, w = uv ? uv.getY(i) : 0;
      if (uvTransform) { const r = uvTransform(u, w, _v, _n); u = r[0]; w = r[1]; }
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
    geo.dispose?.();
    return this;
  }

  /** Append another builder's content (optionally mirrored in x). */
  append(b, mirrorX = false) {
    const base = this.n;
    for (let i = 0; i < b.n; i++) {
      this.pos.push(mirrorX ? -b.pos[i * 3] : b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]);
      this.nrm.push(mirrorX ? -b.nrm[i * 3] : b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
      this.uv.push(b.uv[i * 2], b.uv[i * 2 + 1]);
      this.bake.push(b.bake[i * 4], b.bake[i * 4 + 1], b.bake[i * 4 + 2], b.bake[i * 4 + 3]);
      this.col.push(b.col[i * 3], b.col[i * 3 + 1], b.col[i * 3 + 2]);
    }
    if (mirrorX) for (let i = 0; i < b.idx.length; i += 3) this.idx.push(b.idx[i] + base, b.idx[i + 2] + base, b.idx[i + 1] + base);
    else for (const i of b.idx) this.idx.push(i + base);
    this.n += b.n;
    this.useColor = this.useColor || b.useColor;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(this.bake, 4));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.name = this.name;
    return g;
  }
  get empty() { return this.n === 0; }
}

/** Extrude a 2D profile [[x,y],...] along the z list. Normals from the profile (left of travel unless flip). */
export function extrudeProfile(b, pts, zs, { flip = false, uScale = 1, vScale = 1, normals = null, bake = null, uOffset = 0, uFromZ = false } = {}) {
  const n = pts.length;
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
    if (uFromZ) { o.uv[0] = zs[j] * uScale; o.uv[1] = uOffset + s[i] * vScale; } else { o.uv[0] = uOffset + s[i] * uScale; o.uv[1] = zs[j] * vScale; }
    if (bake) o.bake = typeof bake === 'function' ? bake(o.p[0], o.p[1], o.p[2], o.n[0], o.n[1], 0, i, j) : bake;
  }, !flip);
  return s;
}

/** Uniform list of z values between a and b with maximum step, plus extra breakpoints. */
export function zList(a, b, step, extra = []) {
  const set = new Set();
  const n = Math.max(1, Math.ceil((b - a) / step));
  for (let i = 0; i <= n; i++) set.add(+(a + (b - a) * i / n).toFixed(5));
  for (const e of extra) if (e > a && e < b) set.add(+e.toFixed(5));
  return [...set].sort((x, y) => x - y);
}

/** Axis-aligned box into the builder (uv in metres / uvScale). */
export function addBox(b, x0, y0, z0, x1, y1, z1, bake = null, uvScale = 1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  const uv = g.attributes.uv, p = g.attributes.position, nn = g.attributes.normal;
  // world-scaled uvs (metres) so textures keep their density on every face
  for (let i = 0; i < uv.count; i++) {
    const x = p.getX(i) + (x0 + x1) / 2, y = p.getY(i) + (y0 + y1) / 2, z = p.getZ(i) + (z0 + z1) / 2;
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i));
    if (ax > 0.5) uv.setXY(i, z / uvScale, y / uvScale); else if (ay > 0.5) uv.setXY(i, x / uvScale, z / uvScale); else uv.setXY(i, x / uvScale, y / uvScale);
  }
  b.addGeometry(g, _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), bake);
}

/** Rounded box geometry (three addon), clamped radius. */
export function roundedBox(w, h, d, r = 0.01, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}

/** Tube along a polyline of [x,y,z] points (round section), merged into the builder. */
export function addTube(b, pts, radius, radial = 8, bake = null, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', 0.05);
  const seg = Math.max(2, Math.round(curve.getLength() / 0.03));
  b.addGeometry(new THREE.TubeGeometry(curve, seg, radius, radial, closed), null, bake);
}

/** Straight cylinder between two points. */
export function addCylinder(b, a, c, r, radial = 10, bake = null, caps = true) {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  const len = va.distanceTo(vc);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, !caps);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vc.clone().sub(va).normalize());
  _m.compose(va.clone().add(vc).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  b.addGeometry(g, _m, bake);
}

/** Fill a constant bake attribute on a plain geometry (for instanced parts). */
export function withBake(g, bk = BAKE_DEFAULT) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) arr.set(bk, i * 4);
  g.setAttribute('bake', new THREE.BufferAttribute(arr, 4));
  return g;
}

/** Builder -> Mesh with the usual flags. */
export function meshOf(b, mat, name, { cast = true, receive = true, parent = null, renderOrder = 0 } = {}) {
  if (!b || b.empty) return null;
  const m = new THREE.Mesh(b.build(), mat);
  m.name = name; m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = renderOrder;
  m.matrixAutoUpdate = false; m.updateMatrix();
  if (parent) parent.add(m);
  return m;
}
