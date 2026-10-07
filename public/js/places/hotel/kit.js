// The hotel's building kit. Visual geometry is merged: every static piece is
// transformed into world space and appended to a batch per material and
// per area of the building, so the whole hotel draws in a few hundred calls.
// Collision is separate: invisible anchored parts (boxes) for the walls,
// floors, stairs and big furniture. A "builder" (k.at(x, y, z, ry)) lets
// props be authored in their own frame.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _c = new THREE.Color();

// the six faces of a box: outward normal, the 4 corners as (x?,y?,z?) picks of [min,max], and how u,v come from x,y,z
const FACES = {
  px: { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: (p) => [-p.z, p.y] },
  nx: { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: (p) => [p.z, p.y] },
  py: { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: (p) => [p.x, -p.z] },
  ny: { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: (p) => [p.x, p.z] },
  pz: { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: (p) => [p.x, p.y] },
  nz: { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: (p) => [-p.x, p.y] },
};
const ALL = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

export class Kit {
  constructor(world, o = {}) {
    this.world = world;
    this.cell = o.cell || 30;
    this.batches = new Map();
    this.group = new THREE.Group();
    this.group.name = 'hotel';
    world.scene.add(this.group);
    this.meshes = [];
    this.colliders = [];
    this.stats = { tris: 0, batches: 0 };
  }

  _batch(mat, cast, x, y, z) {
    const key = `${mat.uuid}|${cast ? 1 : 0}|${Math.floor(x / this.cell)},${Math.floor(y / 14)},${Math.floor(z / this.cell)}`;
    let b = this.batches.get(key);
    if (!b) { b = { mat, cast, pos: [], nrm: [], uv: [], col: [], idx: [] }; this.batches.set(key, b); }
    return b;
  }
  _tile(mat, o) { const t = o.tile ?? mat.userData.tile ?? 4; return Array.isArray(t) ? t : [t, t]; }
  _color(o) { if (o.tint == null) return [1, 1, 1]; _c.set(o.tint); return [_c.r, _c.g, _c.b]; }

  /**
   * An axis-aligned box in world space with world-planar UVs (wallpaper runs on
   * across pieces). o.faces: which faces; o.uv 'local' maps each face 0..rep.
   */
  box(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const b = this._batch(mat, o.cast ?? false, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const [tu, tv] = this._tile(mat, o), col = this._color(o), off = o.uvOff || [0, 0];
    const L = [x0, y0, z0], H = [x1, y1, z1], S = [x1 - x0, y1 - y0, z1 - z0];
    for (const f of o.faces || ALL) {
      const F = FACES[f], base = b.pos.length / 3;
      for (const c of F.c) {
        const p = { x: c[0] ? H[0] : L[0], y: c[1] ? H[1] : L[1], z: c[2] ? H[2] : L[2] };
        b.pos.push(p.x, p.y, p.z); b.nrm.push(...F.n); b.col.push(...col);
        if (o.uv === 'local') {
          const q = { x: (p.x - x0) / (S[0] || 1), y: (p.y - y0) / (S[1] || 1), z: (p.z - z0) / (S[2] || 1) };
          const [u, v] = F.uv(q); const r = o.rep || [1, 1];
          b.uv.push((f === 'px' || f === 'nz' ? u + 1 : u) * r[0] + off[0], (f === 'py' ? v + 1 : v) * r[1] + off[1]);
        } else { const [u, v] = F.uv(p); b.uv.push(u / tu + off[0], v / tv + off[1]); }
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (o.solid) this.solid(x0, x1, y0, y1, z0, z1, o.solid === true ? {} : o.solid);
  }
  /** A box in a local frame (matrix m), with UVs from local coordinates. */
  _boxLocal(cx, cy, cz, sx, sy, sz, mat, o, m) {
    const x0 = cx - sx / 2, y0 = cy - sy / 2, z0 = cz - sz / 2;
    const L = [x0, y0, z0], H = [cx + sx / 2, cy + sy / 2, cz + sz / 2];
    _v.set(cx, cy, cz).applyMatrix4(m);
    const b = this._batch(mat, o.cast ?? true, _v.x, _v.y, _v.z);
    const [tu, tv] = this._tile(mat, o), col = this._color(o), off = o.uvOff || [0, 0];
    _m3.getNormalMatrix(m);
    for (const f of o.faces || ALL) {
      const F = FACES[f], base = b.pos.length / 3;
      _n.set(...F.n).applyMatrix3(_m3).normalize();
      for (const c of F.c) {
        const p = { x: c[0] ? H[0] : L[0], y: c[1] ? H[1] : L[1], z: c[2] ? H[2] : L[2] };
        _v.set(p.x, p.y, p.z).applyMatrix4(m);
        b.pos.push(_v.x, _v.y, _v.z); b.nrm.push(_n.x, _n.y, _n.z); b.col.push(...col);
        if (o.uv === 'local') {
          const q = { x: (p.x - x0) / sx, y: (p.y - y0) / sy, z: (p.z - z0) / sz };
          const [u, v] = F.uv(q); const r = o.rep || [1, 1];
          b.uv.push((f === 'px' || f === 'nz' ? u + 1 : u) * r[0] + off[0], (f === 'py' ? v + 1 : v) * r[1] + off[1]);
        } else { const [u, v] = F.uv(p); b.uv.push(u / tu + off[0], v / tv + off[1]); }
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  /** Any geometry (with uv), transformed by m into the batches. o.rep scales its UVs. */
  geo(g, m, mat, o = {}) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
    if (!g.boundingSphere) g.computeBoundingSphere();
    _v.copy(g.boundingSphere.center).applyMatrix4(m);
    const b = this._batch(mat, o.cast ?? true, _v.x, _v.y, _v.z);
    const base = b.pos.length / 3, col = this._color(o), r = o.rep || [1, 1], off = o.uvOff || [0, 0];
    _m3.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m); b.pos.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize(); b.nrm.push(_n.x, _n.y, _n.z); } else b.nrm.push(0, 1, 0);
      if (U) b.uv.push(U.getX(i) * r[0] + off[0], U.getY(i) * r[1] + off[1]); else b.uv.push(0, 0);
      b.col.push(...col);
    }
    const n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const a = I ? I.getX(i) : i, c1 = I ? I.getX(i + 1) : i + 1, c2 = I ? I.getX(i + 2) : i + 2;
      if (flip) b.idx.push(base + a, base + c2, base + c1); else b.idx.push(base + a, base + c1, base + c2);
    }
  }

  /** Invisible collision box (world axis-aligned). */
  solid(x0, x1, y0, y1, z0, z1, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const p = this.world.add({ size: [Math.max(0.05, x1 - x0), Math.max(0.05, y1 - y0), Math.max(0.05, z1 - z0)], position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], transparency: 1, name: o.name || 'Wall', top: 'Smooth', bottom: 'Smooth' });
    if (o.tag) p.tags.add(o.tag);
    if (o.surface) p.userData.surface = o.surface;
    this.colliders.push(p);
    return p;
  }

  /** A builder for authoring a prop in its own frame (origin x,y,z, turned ry about +y). */
  at(x, y, z, ry = 0) {
    const k = this;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), ONE);
    const tm = new THREE.Matrix4();
    const local = (cx, cy, cz, rx = 0, ryy = 0, rz = 0, s = null) => tm.compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ryy, rz, 'YXZ')), s ? new THREE.Vector3(...s) : ONE).premultiply(m);
    const B = {
      x, y, z, ry, m, kit: k,
      W: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(m),
      dir: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(Y, ry),
      box: (cx, cy, cz, sx, sy, sz, mat, o = {}) => {
        if (o.rx || o.rz || o.ry) k.geo(boxGeo(sx, sy, sz, k._tile(mat, o), o), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0), mat, o);
        else k._boxLocal(cx, cy, cz, sx, sy, sz, mat, o, m);
      },
      cyl: (cx, cy, cz, rTop, rBot, h, mat, o = {}) => {
        const g = cylGeo(rTop, rBot, h, o.seg || 14, o.open, o.rep || [1, 1]);
        k.geo(g, local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, { ...o, rep: [1, 1] });
      },
      sphere: (cx, cy, cz, r, mat, o = {}) => k.geo(sphereGeo(r, o.seg || 12, o.part), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, o),
      lathe: (pts, cx, cy, cz, mat, o = {}) => k.geo(latheGeo(pts, o.seg || 14), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, o),
      torus: (cx, cy, cz, R, r, mat, o = {}) => k.geo(torusGeo(R, r, o.seg || 16, o.arc), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, o),
      plane: (cx, cy, cz, w, h, mat, o = {}) => k.geo(planeGeo(w, h, o.dbl), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0), mat, o),
      shape: (shape, depth, cx, cy, cz, mat, o = {}) => k.geo(extrudeGeo(shape, depth, o.bevel), local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, o),
      geo: (g, cx, cy, cz, mat, o = {}) => k.geo(g, local(cx, cy, cz, o.rx || 0, o.ry || 0, o.rz || 0, o.s), mat, o),
      /** a collision box in this frame (turned with it) */
      solid: (cx, cy, cz, sx, sy, sz, o = {}) => {
        const w = new THREE.Vector3(cx, cy, cz).applyMatrix4(m);
        const p = k.world.add({ size: [sx, sy, sz], position: [w.x, w.y, w.z], rotation: [0, ry / DEG, 0], transparency: 1, name: o.name || 'Prop', top: 'Smooth', bottom: 'Smooth' });
        if (o.surface) p.userData.surface = o.surface;
        k.colliders.push(p);
        return p;
      },
      sub: (lx, ly, lz, lry = 0) => { const w = new THREE.Vector3(lx, ly, lz).applyMatrix4(m); return k.at(w.x, w.y, w.z, ry + lry); },
    };
    return B;
  }

  // --- the building's shell -------------------------------------------------------------------------------
  /**
   * A straight wall. axis 'x': at z = c from x = a0 to a1; axis 'z': at x = c from z = a0 to a1.
   * o.neg / o.pos: material of the -side / +side face. o.holes: [{a, b, y0, y1}] openings.
   * o.trim: {neg, pos}: {wain: {mat, h}, rail: mat, base: mat, crown: mat}.
   */
  wall(axis, c, a0, a1, y0, y1, o = {}) {
    if (a1 < a0) [a0, a1] = [a1, a0];
    const t = o.t ?? 1, holes = (o.holes || []).map((h) => ({ a: Math.max(a0, h.a), b: Math.min(a1, h.b), y0: h.y0 ?? y0, y1: h.y1 ?? y1 })).filter((h) => h.b > h.a);
    const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h.a, h.b])])].sort((p, q) => p - q);
    const A = (s, e, lo, hi, side) => {
      // a box for one side's half of the wall, between s and e along the axis, lo..hi up
      const d0 = side < 0 ? c - t / 2 : c, d1 = side < 0 ? c : c + t / 2;
      const faces = side < 0 ? (axis === 'x' ? ['nz'] : ['nx']) : (axis === 'x' ? ['pz'] : ['px']);
      if (lo > y0 + 0.01) faces.push('ny');
      if (hi < y1 - 0.01) faces.push('py');
      const atHoleStart = holes.some((h) => Math.abs(h.b - s) < 0.01 && h.y0 < hi && h.y1 > lo), atHoleEnd = holes.some((h) => Math.abs(h.a - e) < 0.01 && h.y0 < hi && h.y1 > lo);
      if (atHoleStart || (s === a0 && o.ends)) faces.push(axis === 'x' ? 'nx' : 'nz');
      if (atHoleEnd || (e === a1 && o.ends)) faces.push(axis === 'x' ? 'px' : 'pz');
      const mat = side < 0 ? o.neg : o.pos;
      if (!mat) return;
      if (axis === 'x') this.box(s, e, lo, hi, d0, d1, mat, { faces, tint: o.tint, tile: o.tile });
      else this.box(d0, d1, lo, hi, s, e, mat, { faces, tint: o.tint, tile: o.tile });
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const s = cuts[i], e = cuts[i + 1];
      if (e - s < 0.001) continue;
      const over = holes.filter((h) => h.a <= s + 0.001 && h.b >= e - 0.001).sort((p, q) => p.y0 - q.y0);
      let lo = y0;
      const spans = [];
      for (const h of over) { if (h.y0 > lo) spans.push([lo, h.y0]); lo = Math.max(lo, h.y1); }
      if (lo < y1) spans.push([lo, y1]);
      for (const [p, q] of spans) {
        A(s, e, p, q, -1); A(s, e, p, q, 1);
        if (o.collide !== false) {
          if (axis === 'x') this.solid(s, e, p, q, c - t / 2, c + t / 2);
          else this.solid(c - t / 2, c + t / 2, p, q, s, e);
        }
      }
    }
    // trims along each face
    for (const side of [-1, 1]) {
      const tr = o.trim?.[side < 0 ? 'neg' : 'pos'];
      if (!tr) continue;
      const face = c + side * t / 2;
      const runs = (pred) => { // intervals along the wall not interrupted by a hole that pred() rejects
        const out = []; let s = a0;
        for (const h of holes.filter(pred).sort((p, q) => p.a - q.a)) { if (h.a > s) out.push([s, h.a]); s = Math.max(s, h.b); }
        if (s < a1) out.push([s, a1]);
        return out;
      };
      const strip = (p0, p1, lo, hi, depth, mat, ends = true) => {
        const d0 = side < 0 ? face - depth : face, d1 = side < 0 ? face : face + depth;
        const faces = ['py', 'ny', side < 0 ? (axis === 'x' ? 'nz' : 'nx') : (axis === 'x' ? 'pz' : 'px')];
        if (ends) faces.push(...(axis === 'x' ? ['nx', 'px'] : ['nz', 'pz']));
        if (axis === 'x') this.box(p0, p1, lo, hi, d0, d1, mat, { faces, tile: mat.userData.trimTile });
        else this.box(d0, d1, lo, hi, p0, p1, mat, { faces, tile: mat.userData.trimTile });
      };
      const low = runs((h) => h.y0 <= y0 + 0.5);
      if (tr.wain) for (const [p, q] of low) strip(p, q, y0, y0 + tr.wain.h, 0.12, tr.wain.mat);
      if (tr.rail) for (const [p, q] of low) strip(p, q, y0 + (tr.wain?.h ?? 3.6) - 0.05, y0 + (tr.wain?.h ?? 3.6) + 0.3, 0.28, tr.rail);
      if (tr.base) for (const [p, q] of low) strip(p, q, y0, y0 + 0.75, 0.22, tr.base);
      if (tr.crown) for (const [p, q] of runs((h) => h.y1 >= y1 - 0.5)) { strip(p, q, y1 - 0.55, y1, 0.32, tr.crown); strip(p, q, y1 - 0.85, y1 - 0.55, 0.16, tr.crown); }
    }
  }
  /** A floor surface (top face) with a slab collider under it. */
  floor(x0, x1, z0, z1, y, mat, o = {}) {
    this.box(x0, x1, y - (o.t ?? 0.5), y, z0, z1, mat, { faces: o.faces || ['py'], tint: o.tint, tile: o.tile, uv: o.uv, rep: o.rep, uvOff: o.uvOff });
    if (o.collide !== false) this.solid(x0, x1, y - 2, y, z0, z1, { name: 'Floor', surface: o.surface || mat.userData.surface });
  }
  ceiling(x0, x1, z0, z1, y, mat, o = {}) {
    this.box(x0, x1, y, y + 0.5, z0, z1, mat, { faces: ['ny'], tint: o.tint, tile: o.tile });
    if (o.collide) this.solid(x0, x1, y, y + 1, z0, z1, { name: 'Ceiling' });
  }

  /** Build the merged meshes (can be called more than once while building). */
  flush() {
    for (const b of this.batches.values()) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (b.mat.transparent) mesh.renderOrder = 2;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.stats.tris += b.idx.length / 3; this.stats.batches++;
    }
    this.batches.clear();
  }
}

// --- geometry helpers ----------------------------------------------------------------------------------------------
export function boxGeo(sx, sy, sz, tile = [4, 4], o = {}) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (o.uv !== 'local') {
    // planar UVs in studs
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i));
      if (nx > 0.5) U.setXY(i, z / tile[0], y / tile[1]); else if (ny > 0.5) U.setXY(i, x / tile[0], z / tile[1]); else U.setXY(i, x / tile[0], y / tile[1]);
    }
  } else if (o.rep) { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * o.rep[0], U.getY(i) * o.rep[1]); }
  return g;
}
const geoCache = new Map();
function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
export function cylGeo(rt, rb, h, seg = 14, open = false, rep = [1, 1]) {
  return cached(`cyl:${rt}:${rb}:${h}:${seg}:${open}:${rep}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open);
    if (rep[0] !== 1 || rep[1] !== 1) { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * rep[0], U.getY(i) * rep[1]); }
    return g;
  });
}
export function sphereGeo(r, seg = 12, part = 1) { return cached(`sph:${r}:${seg}:${part}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg * 0.6 | 0), 0, Math.PI * 2, 0, Math.PI * part)); }
export function latheGeo(pts, seg = 14) { return cached(`lathe:${pts.join(';')}:${seg}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)); }
export function torusGeo(R, r, seg = 16, arc = Math.PI * 2) { return cached(`torus:${R}:${r}:${seg}:${arc}`, () => new THREE.TorusGeometry(R, r, 6, seg, arc)); }
export function planeGeo(w, h, dbl) {
  return cached(`plane:${w}:${h}:${dbl}`, () => {
    if (!dbl) return new THREE.PlaneGeometry(w, h);
    const a = new THREE.PlaneGeometry(w, h), b = new THREE.PlaneGeometry(w, h).rotateY(Math.PI);
    return mergeGeos([a, b]);
  });
}
export function extrudeGeo(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Merge geometries (non-indexed or indexed) into one indexed geometry. */
export function mergeGeos(list) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const g of list) {
    const base = pos.length / 3, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0); uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
    if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.setIndex(idx);
  return g;
}
/**
 * The hotel's materials use vertex colours (for tints in the merged batches). A mesh made on its own needs a white
 * colour attribute or it renders black: give every such mesh under root one.
 */
export function fixColors(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m?.vertexColors) || o.geometry.attributes.color) return;
    const n = o.geometry.attributes.position.count;
    o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  });
}
/** Bake a list of [geometry, matrix] into one geometry (for animated objects made of many pieces). */
export function bake(list) {
  return mergeGeos(list.map(([g, m]) => { const c = g.clone(); c.applyMatrix4(m); return c; }));
}
export const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
export { DEG };
