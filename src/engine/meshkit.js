// Small geometry construction helper for props, weapons and characters.
// Emits boxes / tapered boxes / cylinders with vertex colours and atlas UVs,
// optionally tagged with a bone index for rigid skinning.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class MeshKit {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.bone = [];
    this.stack = [new THREE.Matrix4()];
    this.curBone = 0;
    this.defaultUV = [0, 0, 0.5, 0.5]; // atlas region u0,v0,u1,v1
  }
  get matrix() { return this.stack[this.stack.length - 1]; }
  push(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')), _s.set(...scale));
    this.stack.push(this.matrix.clone().multiply(_m));
    return this;
  }
  pushMatrix(m) { this.stack.push(this.matrix.clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }

  _tri(p, n, t, c) {
    const M = this.matrix;
    const nm = new THREE.Matrix3().getNormalMatrix(M);
    for (let k = 0; k < 3; k++) {
      const w = p[k].clone().applyMatrix4(M);
      const nn = n.clone().applyMatrix3(nm).normalize();
      this.pos.push(w.x, w.y, w.z); this.nrm.push(nn.x, nn.y, nn.z);
      this.uv.push(t[k][0], t[k][1]);
      this.col.push(c.r, c.g, c.b);
      this.bone.push(this.curBone);
    }
  }
  quad(a, b, c, d, color, uv) {
    const col = color && color.isColor ? color : new THREE.Color(color !== undefined ? color : 0xffffff);
    const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    const r = uv || this.defaultUV;
    const t = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    this._tri([a, b, c], n, [t[0], t[1], t[2]], col);
    this._tri([a, c, d], n, [t[0], t[2], t[3]], col);
  }
  /**
   * Box centred at c with size s. opts: taper [x,z] scale at top, shift [x,z] top offset,
   * colors per face {top,bottom,front,back,left,right}, uvs per face (same keys), skip {face:true}
   * front = +z.
   */
  box(c, s, color, opts = {}) {
    const [cx, cy, cz] = c; const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
    const tx = opts.taper ? opts.taper[0] : 1, tz = opts.taper ? opts.taper[1] : 1;
    const bx = opts.taperBottom ? opts.taperBottom[0] : 1, bz = opts.taperBottom ? opts.taperBottom[1] : 1;
    const sx = opts.shift ? opts.shift[0] : 0, sz = opts.shift ? opts.shift[1] : 0;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // bottom corners
    const b0 = V(cx - hx * bx, cy - hy, cz - hz * bz), b1 = V(cx + hx * bx, cy - hy, cz - hz * bz), b2 = V(cx + hx * bx, cy - hy, cz + hz * bz), b3 = V(cx - hx * bx, cy - hy, cz + hz * bz);
    const t0 = V(cx - hx * tx + sx, cy + hy, cz - hz * tz + sz), t1 = V(cx + hx * tx + sx, cy + hy, cz - hz * tz + sz), t2 = V(cx + hx * tx + sx, cy + hy, cz + hz * tz + sz), t3 = V(cx - hx * tx + sx, cy + hy, cz + hz * tz + sz);
    const col = (k) => (opts.colors && opts.colors[k] !== undefined ? opts.colors[k] : color);
    const uv = (k) => (opts.uvs && opts.uvs[k]) || opts.uv || undefined;
    const sk = opts.skip || {};
    if (!sk.top) this.quad(t3, t2, t1, t0, col('top'), uv('top'));
    if (!sk.bottom) this.quad(b0, b1, b2, b3, col('bottom'), uv('bottom'));
    if (!sk.front) this.quad(b3, b2, t2, t3, col('front'), uv('front'));
    if (!sk.back) this.quad(b1, b0, t0, t1, col('back'), uv('back'));
    if (!sk.right) this.quad(b2, b1, t1, t2, col('right'), uv('right'));
    if (!sk.left) this.quad(b0, b3, t3, t0, col('left'), uv('left'));
    return this;
  }
  /** Cylinder along axis ('x'|'y'|'z') centred at c. */
  cyl(c, r, len, color, opts = {}) {
    const seg = opts.seg || 6;
    const axis = opts.axis || 'y';
    const r2 = opts.r2 !== undefined ? opts.r2 : r;
    const rot = axis === 'y' ? [0, 0, 0] : axis === 'x' ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0];
    this.push(c, rot);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const h = len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = V(Math.cos(a0) * r, -h, Math.sin(a0) * r), p1 = V(Math.cos(a1) * r, -h, Math.sin(a1) * r);
      const q0 = V(Math.cos(a0) * r2, h, Math.sin(a0) * r2), q1 = V(Math.cos(a1) * r2, h, Math.sin(a1) * r2);
      this.quad(p1, p0, q0, q1, color, opts.uv);
      if (opts.caps !== false) {
        this._tri([V(0, h, 0), q1, q0], V(0, 1, 0), [[0, 0], [0, 0], [0, 0]], new THREE.Color(opts.capColor !== undefined ? opts.capColor : color));
        this._tri([V(0, -h, 0), p0, p1], V(0, -1, 0), [[0, 0], [0, 0], [0, 0]], new THREE.Color(opts.capColor !== undefined ? opts.capColor : color));
      }
    }
    this.pop();
    return this;
  }
  /** Low-poly sphere-ish (octahedron-subdivided) blob. */
  blob(c, r, color, opts = {}) {
    const geo = new THREE.IcosahedronGeometry(1, opts.detail || 0);
    const p = geo.getAttribute('position');
    const sc = opts.scale || [1, 1, 1];
    const col = new THREE.Color(color);
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), d = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const pts = [a, b, d].map((v) => new THREE.Vector3(c[0] + v.x * r * sc[0], c[1] + v.y * r * sc[1], c[2] + v.z * r * sc[2]));
      const n = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
      const u = opts.uv || this.defaultUV;
      this._tri(pts, n, [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]]], col);
    }
    geo.dispose();
    return this;
  }
  toGeometry(skinned = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (skinned) {
      const n = this.bone.length;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = this.bone[i]; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeBoundingSphere();
    return g;
  }
}
