import * as THREE from 'three';

/**
 * Merged-geometry builders. A `Bank` holds one `GeoBuilder` per material name; all builders of a
 * bank share one transform (so a house can put its walls in 'clapboard' and its roof in
 * 'shingles' under the same placement). Primitives get world-aligned UVs (metres / tile size, so
 * adjacent parts line up), flat normals (faceted, PS2-style) except round things, and a baked
 * vertex colour: base colour x ground ambient-occlusion band x an optional per-vertex function
 * (soot, grime, per-object tint). Each builder becomes one draw call.
 */

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class GeoBuilder {
  constructor(xf, opts = {}) {
    this.xf = xf; // shared { m: Matrix4, nm: Matrix3 }
    this.P = [];
    this.N = [];
    this.U = [];
    this.C = [];
    this.I = [];
    this.S = opts.sway ? [] : null;
    this.color = [1, 1, 1];
    this.sway = 0; // sway weight for the next vertices (or a function of local y)
    this.vc = null; // (wx, wy, wz, nx, ny, nz) -> colour factor
    this.aoMin = opts.aoMin ?? 0.58;
    this.aoH = opts.aoH ?? 1.1;
  }

  get count() {
    return this.P.length / 3;
  }

  setColor(r, g, b) {
    if (Array.isArray(r)) [r, g, b] = r;
    else if (g === undefined) {
      const c = new THREE.Color(r);
      [r, g, b] = [c.r, c.g, c.b];
    }
    this.color[0] = r;
    this.color[1] = g;
    this.color[2] = b;
    return this;
  }

  /** Add one vertex (local coordinates, local normal). Returns its index. */
  vert(x, y, z, nx, ny, nz, u, v, sw) {
    const m = this.xf.m.elements;
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    _n.set(nx, ny, nz).applyMatrix3(this.xf.nm).normalize();
    this.P.push(wx, wy, wz);
    this.N.push(_n.x, _n.y, _n.z);
    this.U.push(u, v);
    let k = this.aoMin + (1 - this.aoMin) * smooth01(0, this.aoH, wy);
    if (this.vc) k *= this.vc(wx, wy, wz, _n.x, _n.y, _n.z);
    this.C.push(this.color[0] * k, this.color[1] * k, this.color[2] * k);
    if (this.S) this.S.push(sw !== undefined ? sw : typeof this.sway === 'function' ? this.sway(y, x, z) : this.sway);
    return this.P.length / 3 - 1;
  }

  /** Quad a-b-c-d (counter-clockwise seen from the front), arrays [x,y,z], uvs [u,v]. */
  quad(a, b, c, d, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1], n) {
    if (!n) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      _v.crossVectors(_a, _b).normalize();
      n = [_v.x, _v.y, _v.z];
    }
    const i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]);
    const i1 = this.vert(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1]);
    const i2 = this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1]);
    const i3 = this.vert(d[0], d[1], d[2], n[0], n[1], n[2], ud[0], ud[1]);
    this.I.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  tri(a, b, c, ua = [0, 0], ub = [1, 0], uc = [0.5, 1], n) {
    if (!n) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _v.crossVectors(_a, _b).normalize();
      n = [_v.x, _v.y, _v.z];
    }
    const i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]);
    const i1 = this.vert(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1]);
    const i2 = this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1]);
    this.I.push(i0, i1, i2);
    return this;
  }

  /**
   * Axis-aligned box (in the current transform) centred at (cx, cy, cz), full sizes (sx, sy, sz).
   * o.uv = [metres per u repeat, metres per v repeat] for the sides; o.uvTop likewise for top and
   * bottom; o.off = [u0, v0]; o.skip = string of faces to omit ('px nx py ny pz nz');
   * o.atlas = { tex: [W, H], side: [x, y, w, h] (texels, top-left origin), top: [...], ...per face }
   * maps a face onto one atlas rect instead of tiling; o.split = local y at which to split the
   * sides (an extra vertex row for the ground AO band; default: at aoH when the box spans it).
   */
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const [tu, tv] = o.uv ?? [1, 1];
    const [tt, tt2] = o.uvTop ?? o.uv ?? [1, 1];
    const [ou, ov] = o.off ?? [0, 0];
    const skip = o.skip ?? '';
    const A = o.atlas;
    const uvOf = (face, u0, v0, u1, v1) => {
      if (A && (A[face] || A.side || A.all)) {
        const r = A[face] ?? (face === 'py' || face === 'ny' ? A.top ?? A.side ?? A.all : A.side ?? A.all);
        const [W, H] = A.tex;
        const ua = r[0] / W, ub = (r[0] + r[2]) / W, va = 1 - (r[1] + r[3]) / H, vb = 1 - r[1] / H;
        return [[ua, va], [ub, va], [ub, vb], [ua, vb]];
      }
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    };
    // split height for the AO band (local y)
    const ty = this.xf.m.elements[13];
    let ys = o.split === false ? undefined : o.split;
    if (o.split === undefined && !A) {
      const yl = this.aoH * 0.55 - ty;
      if (yl > y0 + 0.05 && yl < y1 - 0.05 && sy > 0.6) ys = yl;
    }
    const side = (face, p0, p1, n, ua, ub) => {
      // p0 -> p1 along the bottom edge (local x/z), counter-clockwise from outside
      const rows = ys !== undefined && !A ? [y0, ys, y1] : [y0, y1];
      for (let r = 0; r < rows.length - 1; r++) {
        const ya = rows[r], yb = rows[r + 1];
        const uv = uvOf(face, ua, (ya + ov) / tv, ub, (yb + ov) / tv);
        this.quad([p0[0], ya, p0[1]], [p1[0], ya, p1[1]], [p1[0], yb, p1[1]], [p0[0], yb, p0[1]], uv[0], uv[1], uv[2], uv[3], n);
      }
    };
    if (!skip.includes('pz')) side('pz', [x0, z1], [x1, z1], [0, 0, 1], (x0 + ou) / tu, (x1 + ou) / tu);
    if (!skip.includes('nz')) side('nz', [x1, z0], [x0, z0], [0, 0, -1], (-x1 + ou) / tu, (-x0 + ou) / tu);
    if (!skip.includes('px')) side('px', [x1, z1], [x1, z0], [1, 0, 0], (-z1 + ou) / tu, (-z0 + ou) / tu);
    if (!skip.includes('nx')) side('nx', [x0, z0], [x0, z1], [-1, 0, 0], (z0 + ou) / tu, (z1 + ou) / tu);
    if (!skip.includes('py')) {
      const uv = uvOf('py', (x0 + ou) / tt, (-z1 + ov) / tt2, (x1 + ou) / tt, (-z0 + ov) / tt2);
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv[0], uv[1], uv[2], uv[3], [0, 1, 0]);
    }
    if (!skip.includes('ny')) {
      const uv = uvOf('ny', (x0 + ou) / tt, (z0 + ov) / tt2, (x1 + ou) / tt, (z1 + ov) / tt2);
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv[0], uv[1], uv[2], uv[3], [0, -1, 0]);
    }
    return this;
  }

  /** A box between two points (a beam / strut) with a square section of side w. */
  beam(a, b, w, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const m = this.xf.m;
    const saved = m.clone();
    const dir = _v.set(dx, dy, dz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const t = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    m.multiply(t);
    this.xf.nm.getNormalMatrix(m);
    this.box(0, 0, 0, o.w2 ?? w, len, w, { ...o, uv: o.uv ?? [1, 1], skip: o.skip ?? 'py ny', split: false });
    m.copy(saved);
    this.xf.nm.getNormalMatrix(m);
    return this;
  }

  /**
   * Cylinder / frustum along +y from (cx, cy, cz): radius r (bottom) to o.r1 (top), height h.
   * o.seg sides, o.caps ('top' | 'bottom' | 'both' | ''), o.uv = [tu, tv], o.flat (faceted normals),
   * o.atlas = { tex: [W,H], side: rect, top: rect } maps onto atlas rects.
   */
  cyl(cx, cy, cz, r, h, o = {}) {
    const seg = o.seg ?? 8, r1 = o.r1 ?? r, [tu, tv] = o.uv ?? [1, 1];
    const caps = o.caps ?? 'top';
    const A = o.atlas;
    const sideUV = (k, top) => {
      if (A) {
        const [W, H] = A.tex, R = A.side;
        return [(R[0] + (R[2] * k) / seg) / W, 1 - (R[1] + (top ? 0 : R[3])) / H];
      }
      return [((k / seg) * Math.PI * 2 * Math.max(r, r1)) / tu, (top ? h : 0) / tv + cy / tv];
    };
    const slope = (r - r1) / h;
    const base = this.count;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2 + (o.phase ?? 0);
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const [ub, vb] = sideUV(k, false), [ut, vt] = sideUV(k, true);
      if (o.flat) continue;
      this.vert(cx + ca * r, cy, cz + sa * r, ca / nl, slope / nl, sa / nl, ub, vb);
      this.vert(cx + ca * r1, cy + h, cz + sa * r1, ca / nl, slope / nl, sa / nl, ut, vt);
    }
    if (!o.flat) {
      for (let k = 0; k < seg; k++) {
        const i = base + k * 2;
        this.I.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    } else {
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2 + (o.phase ?? 0), a1 = ((k + 1) / seg) * Math.PI * 2 + (o.phase ?? 0);
        const [ub0, vb0] = sideUV(k, false), [ut0, vt0] = sideUV(k, true), [ub1] = sideUV(k + 1, false), [ut1] = sideUV(k + 1, true);
        this.quad(
          [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], [cx + Math.cos(a0) * r1, cy + h, cz + Math.sin(a0) * r1],
          [cx + Math.cos(a1) * r1, cy + h, cz + Math.sin(a1) * r1], [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
          [ub0, vb0], [ut0, vt0], [ut1, vt0], [ub1, vb0],
        );
      }
    }
    const cap = (y, rr, up) => {
      if (rr <= 0) return;
      const c0 = this.count;
      const R = A && A.top;
      const cuv = (ca, sa) => (R ? [(R[0] + R[2] * (0.5 + 0.5 * ca)) / A.tex[0], 1 - (R[1] + R[3] * (0.5 + 0.5 * sa)) / A.tex[1]] : [(cx + ca * rr) / tu, (cz + sa * rr) / tu]);
      const [cu, cv] = R ? [(R[0] + R[2] / 2) / A.tex[0], 1 - (R[1] + R[3] / 2) / A.tex[1]] : [cx / tu, cz / tu];
      this.vert(cx, y, cz, 0, up ? 1 : -1, 0, cu, cv);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2 + (o.phase ?? 0);
        const [u, v] = cuv(Math.cos(a), Math.sin(a));
        this.vert(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, 0, up ? 1 : -1, 0, u, v);
      }
      for (let k = 0; k < seg; k++) up ? this.I.push(c0, c0 + k + 2, c0 + k + 1) : this.I.push(c0, c0 + k + 1, c0 + k + 2);
    };
    if (caps === 'top' || caps === 'both') cap(cy + h, r1, true);
    if (caps === 'bottom' || caps === 'both') cap(cy, r, false);
    return this;
  }

  /** Horizontal cylinder along local x (tanks, logs, bales): centre, radius, length. */
  hcyl(cx, cy, cz, r, len, o = {}) {
    const m = this.xf.m, saved = m.clone();
    m.multiply(new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)));
    this.xf.nm.getNormalMatrix(m);
    this.cyl(0, -len / 2, 0, r, len, { caps: 'both', ...o });
    m.copy(saved);
    this.xf.nm.getNormalMatrix(m);
    return this;
  }

  /** Merge an existing BufferGeometry (positions, normals, uvs) under the current transform. */
  geometry(g, matrix) {
    const m = this.xf.m, saved = m.clone();
    if (matrix) {
      m.multiply(matrix);
      this.xf.nm.getNormalMatrix(m);
    }
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      this.vert(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.I.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.I.push(base + i);
    m.copy(saved);
    this.xf.nm.getNormalMatrix(m);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (this.S) g.setAttribute('sway', new THREE.Float32BufferAttribute(this.S, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class Bank {
  constructor() {
    this.xf = { m: new THREE.Matrix4(), nm: new THREE.Matrix3() };
    this.builders = new Map();
    this.stack = [];
  }
  /** The builder for material `name` (created on first use; opts on creation only). */
  b(name, opts) {
    let b = this.builders.get(name);
    if (!b) {
      b = new GeoBuilder(this.xf, opts);
      this.builders.set(name, b);
    }
    return b;
  }
  /** Set the shared transform: translation + yaw (rotation about +Y, THREE convention). */
  at(x = 0, y = 0, z = 0, yaw = 0) {
    this.xf.m.makeRotationY(yaw).setPosition(x, y, z);
    this.xf.nm.getNormalMatrix(this.xf.m);
    return this;
  }
  identity() {
    return this.at(0, 0, 0, 0);
  }
  push() {
    this.stack.push(this.xf.m.clone());
    return this;
  }
  pop() {
    this.xf.m.copy(this.stack.pop());
    this.xf.nm.getNormalMatrix(this.xf.m);
    return this;
  }
  /** Compose a local transform on top of the current one. */
  local(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0) {
    const t = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')).setPosition(x, y, z);
    this.xf.m.multiply(t);
    this.xf.nm.getNormalMatrix(this.xf.m);
    return this;
  }
  /** One mesh per builder that has geometry; materials[name] must exist. */
  meshes(materials, parent) {
    const out = [];
    for (const [name, b] of this.builders) {
      if (!b.count) continue;
      const mat = materials[name];
      if (!mat) throw new Error(`no material for builder ${name}`);
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
      if (parent) parent.add(mesh);
    }
    return out;
  }
}
