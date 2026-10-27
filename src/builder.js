// Accumulates low-poly geometry into big static batches. Every vertex carries an
// atlas rect (the "texture page"), so the whole world draws with one material.
import * as THREE from 'three';

export const FLOOR_H = 4; // floor-to-floor height
export const CHUNK = 8; // static batch size in metres

class Grow {
  constructor(n = 1 << 16) {
    this.a = new Float32Array(n);
    this.n = 0;
  }
  push(...v) {
    if (this.n + v.length > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + v.length));
      b.set(this.a);
      this.a = b;
    }
    for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i];
  }
}

class GrowU32 {
  constructor(n = 1 << 16) {
    this.a = new Uint32Array(n);
    this.n = 0;
  }
  push(v) {
    if (this.n >= this.a.length) {
      const b = new Uint32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
}

export function floorOfY(y) {
  return Math.floor((y + 0.25) / FLOOR_H);
}

export function chunkKey(x, y, z) {
  const f = floorOfY(y);
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  return (f + 4) * 10000 + (cz + 10) * 100 + (cx + 10);
}

export function decodeChunkKey(key) {
  const f = Math.floor(key / 10000) - 4;
  const cz = Math.floor((key % 10000) / 100) - 10;
  const cx = (key % 100) - 10;
  return { f, cx, cz };
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export class MeshBuilder {
  constructor(atlas) {
    this.atlas = atlas;
    this.pos = new Grow();
    this.nrm = new Grow();
    this.uv = new Grow();
    this.at = new Grow();
    // per-vertex lighting mode: [mode, r, g, b, lampIndex]
    // mode 0 = baked normally, 1 = emissive (fixed colour), 2 = lamp panel (follows lamp level)
    this.lm = new Grow();
    this.key = new Grow();
    this.idx = new GrowU32();
    this.vcount = 0;
    this.mat = new THREE.Matrix4();
    this.nmat = new THREE.Matrix3();
    this.stack = [];
    this.fixedKey = null;
    this.mode = [0, 0, 0, 0, 0];
    this.rectCache = new Map();
    this.missing = new Set();
  }

  rect(name) {
    let r = this.rectCache.get(name);
    if (r) return r;
    const R = this.atlas.rects[name];
    if (!R) {
      if (!this.missing.has(name)) {
        this.missing.add(name);
        console.warn('missing texture', name);
      }
      return this.rect('white');
    }
    const W = this.atlas.width;
    const H = this.atlas.height;
    r = [R.x / W, 1 - (R.y + R.h) / H, R.w / W, R.h / H];
    this.rectCache.set(name, r);
    return r;
  }

  // --- transform stack (props are authored in local space) ---
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    this.stack.push(this.mat.clone());
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(s, s, s);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.mat.multiply(_m);
    this.nmat.getNormalMatrix(this.mat);
    return this;
  }
  pop() {
    this.mat.copy(this.stack.pop());
    this.nmat.getNormalMatrix(this.mat);
    return this;
  }
  // Group subsequent primitives into the chunk that contains this world point.
  group(x, y, z) {
    this.fixedKey = chunkKey(x, y, z);
  }
  ungroup() {
    this.fixedKey = null;
  }
  emissive(r, g, b) {
    this.mode = [1, r, g, b, 0];
  }
  lampPanel(index, r = 1, g = 1, b = 1) {
    this.mode = [2, r, g, b, index];
  }
  normalMode() {
    this.mode = [0, 0, 0, 0, 0];
  }

  // Quad from 4 local-space corners, counter-clockwise seen from the front:
  // p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left.
  quad(p0, p1, p2, p3, uvs, tex, flags = 0) {
    _a.fromArray(p0).applyMatrix4(this.mat);
    _b.fromArray(p1).applyMatrix4(this.mat);
    _c.fromArray(p2).applyMatrix4(this.mat);
    _d.fromArray(p3).applyMatrix4(this.mat);
    const noFlash = flags & 1;
    _n.subVectors(_b, _a).cross(_p.subVectors(_d, _a));
    if (_n.lengthSq() < 1e-12) _n.subVectors(_c, _b).cross(_p.subVectors(_d, _b));
    _n.normalize();
    const nx = noFlash ? 0 : _n.x;
    const ny = noFlash ? 0 : _n.y;
    const nz = noFlash ? 0 : _n.z;
    const r = this.rect(tex);
    const key =
      this.fixedKey ??
      chunkKey((_a.x + _b.x + _c.x + _d.x) / 4, (_a.y + _b.y + _c.y + _d.y) / 4, (_a.z + _b.z + _c.z + _d.z) / 4);
    const base = this.vcount;
    const pts = [_a, _b, _c, _d];
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(nx, ny, nz);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.at.push(r[0], r[1], r[2], r[3]);
      this.lm.push(this.mode[0], this.mode[1], this.mode[2], this.mode[3], this.mode[4]);
      this.key.push(key);
    }
    this.vcount += 4;
    this.idx.push(base);
    this.idx.push(base + 1);
    this.idx.push(base + 2);
    this.idx.push(base);
    this.idx.push(base + 2);
    this.idx.push(base + 3);
    if (flags & 2) {
      // double sided: emit the reversed quad too
      this.quad(p1, p0, p3, p2, [uvs[2], uvs[3], uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5]], tex, flags & ~2);
    }
  }

  triangle(p0, p1, p2, uvs, tex, flags = 0) {
    // degenerate quad keeps a single code path
    this.quad(p0, p1, p2, p2, [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5], uvs[4], uvs[5]], tex, flags);
  }

  // Axis-aligned (in local space) box. tex: string or {px,nx,py,ny,pz,nz,side,top,bottom}.
  // opts: { skip: 'py,ny', uv: 'world'|'fit', scale (texture repeats per metre), flags }
  box(x0, y0, z0, x1, y1, z1, tex, opts = {}) {
    const skip = opts.skip || '';
    const fit = opts.uv === 'fit';
    const s = opts.scale ?? 1;
    const flags = opts.flags || 0;
    const T = (face) => {
      if (typeof tex === 'string') return tex;
      return (
        tex[face] ??
        (face === 'py' ? tex.top : face === 'ny' ? tex.bottom : tex.side) ??
        tex.side ??
        tex.top
      );
    };
    const W = x1 - x0;
    const H = y1 - y0;
    const D = z1 - z0;
    const uvq = (w, h, ou = 0, ov = 0) =>
      fit ? [0, 0, 1, 0, 1, 1, 0, 1] : [ou, ov, ou + w * s, ov, ou + w * s, ov + h * s, ou, ov + h * s];
    if (!skip.includes('pz'))
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uvq(W, H, x0 * s, y0 * s), T('pz'), flags);
    if (!skip.includes('nz'))
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uvq(W, H, -x1 * s, y0 * s), T('nz'), flags);
    if (!skip.includes('px'))
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uvq(D, H, -z1 * s, y0 * s), T('px'), flags);
    if (!skip.includes('nx'))
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uvq(D, H, z0 * s, y0 * s), T('nx'), flags);
    if (!skip.includes('py'))
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uvq(W, D, x0 * s, -z1 * s), T('py'), flags);
    if (!skip.includes('ny'))
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uvq(W, D, x0 * s, z0 * s), T('ny'), flags);
  }

  // Box by centre/size (local space).
  cbox(cx, cy, cz, sx, sy, sz, tex, opts) {
    this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tex, opts);
  }

  // Vertical cylinder (local Y axis). opts: { caps: true, capTex, vrep, urep, flags }
  cyl(cx, y0, cz, r, y1, segs, tex, opts = {}) {
    const caps = opts.caps ?? true;
    const urep = opts.urep ?? 1;
    const vrep = opts.vrep ?? (y1 - y0);
    const flags = opts.flags || 0;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = cx + Math.sin(a0) * r;
      const z0 = cz + Math.cos(a0) * r;
      const x1 = cx + Math.sin(a1) * r;
      const z1 = cz + Math.cos(a1) * r;
      const u0 = (i / segs) * urep;
      const u1 = ((i + 1) / segs) * urep;
      // swap: run the texture's u along the cylinder's length (banded pipe lagging)
      const uv = opts.swap ? [0, u0, 0, u1, vrep, u1, vrep, u0] : [u0, 0, u1, 0, u1, vrep, u0, vrep];
      this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], uv, tex, flags);
    }
    if (caps) {
      const ct = opts.capTex || tex;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
        const uv0 = [0.5 + s0 * 0.48, 0.5 + c0 * 0.48];
        const uv1 = [0.5 + s1 * 0.48, 0.5 + c1 * 0.48];
        this.triangle(
          [cx, y1, cz],
          [cx + s0 * r, y1, cz + c0 * r],
          [cx + s1 * r, y1, cz + c1 * r],
          [0.5, 0.5, uv0[0], uv0[1], uv1[0], uv1[1]],
          ct,
          flags,
        );
        if (opts.bottomCap)
          this.triangle(
            [cx, y0, cz],
            [cx + s1 * r, y0, cz + c1 * r],
            [cx + s0 * r, y0, cz + c0 * r],
            [0.5, 0.5, uv1[0], uv1[1], uv0[0], uv0[1]],
            ct,
            flags,
          );
      }
    }
  }

  // Cylinder between two arbitrary local points (pipes, rails, tubes).
  tube(ax, ay, az, bx, by, bz, r, segs, tex, opts = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    const dir = _p.set(dx / len, dy / len, dz / len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), q, new THREE.Vector3(1, 1, 1));
    this.stack.push(this.mat.clone());
    this.mat.multiply(m);
    this.nmat.getNormalMatrix(this.mat);
    this.cyl(0, 0, 0, r, len, segs, tex, { caps: opts.caps ?? false, urep: opts.urep ?? 1, vrep: opts.vrep ?? len, flags: opts.flags, swap: opts.swap });
    this.pop();
  }

  // Flat textured panel facing +Z in local space, centred at x,y on z (for signs/posters).
  panel(cx, cy, z, w, h, tex, flags = 0) {
    const e = 0.004;
    this.quad(
      [cx - w / 2, cy - h / 2, z],
      [cx + w / 2, cy - h / 2, z],
      [cx + w / 2, cy + h / 2, z],
      [cx - w / 2, cy + h / 2, z],
      [e, e, 1 - e, e, 1 - e, 1 - e, e, 1 - e],
      tex,
      flags,
    );
  }

  // Horizontal decal on a floor (local space, facing +Y), rotated by rot.
  floorDecal(cx, y, cz, w, d, rot, tex, flags = 0) {
    this.push(cx, y, cz, rot);
    const e = 0.004;
    this.quad(
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
      [w / 2, 0, -d / 2],
      [-w / 2, 0, -d / 2],
      [e, e, 1 - e, e, 1 - e, 1 - e, e, 1 - e],
      tex,
      flags,
    );
    this.pop();
  }

  // Hand the raw arrays to the light baker: [{ x,y,z, nx,ny,nz, mode..., index }]
  get vertexCount() {
    return this.vcount;
  }

  // Split into per-chunk BufferGeometries. bake: { light: Uint8Array(4n), lamp: Uint8Array(4n) }
  buildChunks(bake) {
    const keyOf = this.key.a;
    const byKey = new Map();
    const idx = this.idx.a;
    for (let t = 0; t < this.idx.n; t += 3) {
      const k = keyOf[idx[t]];
      let list = byKey.get(k);
      if (!list) byKey.set(k, (list = []));
      list.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const out = [];
    for (const [key, list] of byKey) {
      out.push({ key, geometry: this.subGeometry(list, bake) });
    }
    return out;
  }

  buildSingle(bake) {
    return this.subGeometry(Array.from(this.idx.a.subarray(0, this.idx.n)), bake);
  }

  subGeometry(list, bake) {
    const remap = new Map();
    const order = [];
    const indices = new Uint32Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      let r = remap.get(v);
      if (r === undefined) {
        r = order.length;
        remap.set(v, r);
        order.push(v);
      }
      indices[i] = r;
    }
    const n = order.length;
    const pos = new Float32Array(n * 3);
    const nrm = new Int8Array(n * 3);
    const uv = new Float32Array(n * 2);
    const at = new Uint16Array(n * 4);
    const bl = new Uint8Array(n * 4);
    const lp = new Uint8Array(n * 4);
    const P = this.pos.a, N = this.nrm.a, U = this.uv.a, A = this.at.a;
    for (let i = 0; i < n; i++) {
      const v = order[i];
      pos[i * 3] = P[v * 3];
      pos[i * 3 + 1] = P[v * 3 + 1];
      pos[i * 3 + 2] = P[v * 3 + 2];
      nrm[i * 3] = Math.round(N[v * 3] * 127);
      nrm[i * 3 + 1] = Math.round(N[v * 3 + 1] * 127);
      nrm[i * 3 + 2] = Math.round(N[v * 3 + 2] * 127);
      uv[i * 2] = U[v * 2];
      uv[i * 2 + 1] = U[v * 2 + 1];
      for (let j = 0; j < 4; j++) {
        at[i * 4 + j] = Math.round(Math.min(1, Math.max(0, A[v * 4 + j])) * 65535);
        bl[i * 4 + j] = bake.light[v * 4 + j];
        lp[i * 4 + j] = bake.lamp[v * 4 + j];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aAtlas', new THREE.BufferAttribute(at, 4, true));
    g.setAttribute('aBake', new THREE.BufferAttribute(bl, 4, true));
    g.setAttribute('aLamp', new THREE.BufferAttribute(lp, 4, true));
    g.setIndex(new THREE.BufferAttribute(n < 65536 ? new Uint16Array(indices) : indices, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
