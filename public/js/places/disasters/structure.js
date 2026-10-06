// Breakable buildings. A map is hundreds of anchored bricks; drawing each
// one separately would be slow, so anchored bricks are merged into one mesh
// per material in each cell of a grid. When a disaster breaks a brick loose
// it leaves its cell (the cell is rebuilt without it) and becomes a normal
// physics part with its own mesh. Loose debris is capped, floats on water,
// and hurts people when it hits them fast.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();

// Brick materials differ only in colour for a given surface (studs, inlets,
// smooth, glass...), so a cell's bricks are drawn with one vertex-coloured
// material per surface instead of one per colour: a few draw calls a cell.
// Glowing (neon) materials keep their own.
const merged = new Map();
function mergedMaterial(mat) {
  if (!mat.isMeshPhongMaterial || mat.vertexColors || (mat.emissive && mat.emissive.getHex())) return null;
  const key = [mat.map?.uuid, mat.transparent, mat.opacity, mat.shininess, mat.specular.getHex(), mat.side, mat.alphaTest, mat.depthWrite].join('|');
  let m = merged.get(key);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, map: mat.map, shininess: mat.shininess, specular: mat.specular, transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite, alphaTest: mat.alphaTest, side: mat.side });
    merged.set(key, m);
  }
  return m;
}

export class Structure {
  constructor(world, opts = {}) {
    this.world = world;
    this.cell = opts.cell || 36;
    this.maxDebris = opts.maxDebris || 200;
    this.chunks = new Map();
    this.parts = new Set();
    this.debris = [];
    this.group = new THREE.Group();
    world.scene.add(this.group);
  }

  _key(p) { return `${Math.floor(p.x / this.cell)},${Math.floor(p.z / this.cell)}`; }

  /** Add an anchored, breakable brick (same props as world.add). */
  add(props) {
    const p = this.world.add(props);
    this.world.scene.remove(p.mesh);
    p.structure = this;
    this.parts.add(p);
    if (props.loose) p.userData.loose = true; // furniture and the like: comes free first
    if (props.fixed || p.name === 'Rock' || p.name === 'Ground' || p.name === 'PoolWater') p.userData.fixed = true; // roads, cliffs, ponds: never break
    p.mesh.updateMatrixWorld(true);
    p.userData.box = new THREE.Box3().setFromObject(p.mesh); // where it sits (for what rests on what)
    if (!p.mesh.visible || p.transparency >= 1) return p;
    const key = this._key(p.mesh.position);
    p.chunkKey = key;
    let c = this.chunks.get(key);
    if (!c) { c = { parts: new Set(), meshes: [], dirty: false }; this.chunks.set(key, c); }
    c.parts.add(p); c.dirty = true;
    return p;
  }

  /** Give a brick its own mesh (still anchored), so it can be recoloured or animated. */
  detach(p) {
    if (!p.chunkKey) return;
    const c = this.chunks.get(p.chunkKey);
    if (c) { c.parts.delete(p); c.dirty = true; }
    p.chunkKey = null;
    if (!p.destroyed) this.world.scene.add(p.mesh);
    p.mesh.castShadow = !!this.world.shadows && !p.anchored; // still bricks cast no shadow (as in 2008)
    p.mesh.receiveShadow = !!this.world.shadows;
  }

  /** Break a brick loose: it becomes a physics part (optionally with a velocity). */
  release(p, vel) {
    if (!p || p.destroyed || !p.anchored || !this.parts.has(p) || p.userData.fixed) return false;
    this.detach(p);
    // one draw call while it tumbles (the side faces' material)
    if (Array.isArray(p.mesh.material)) p.mesh.material = p.mesh.material[0];
    p.unanchor();
    if (vel) { p.body.velocity.set(vel.x, vel.y, vel.z); }
    p.body.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    this.debris.push({ p, t: this.world.time });
    return true;
  }

  remove(p) {
    if (!p || p.destroyed) return;
    if (p.chunkKey) { const c = this.chunks.get(p.chunkKey); if (c) { c.parts.delete(p); c.dirty = true; } p.chunkKey = null; }
    this.parts.delete(p);
    p.destroy();
  }

  /** Anchored bricks within r of a point (by their centres), optionally filtered. */
  near(pos, r, filter) {
    const out = [];
    for (const p of this.parts) {
      if (!p.anchored || p.destroyed || p.userData.fixed) continue;
      const d = p.mesh.position.distanceTo(pos);
      if (d < r + Math.max(p.size.x, p.size.y, p.size.z) * 0.4 && (!filter || filter(p, d))) out.push(p);
    }
    return out;
  }

  /** Rebuild the merged meshes of cells that changed. */
  flush() {
    for (const c of this.chunks.values()) if (c.dirty) this._rebuild(c);
  }

  _rebuild(c) {
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    c.meshes = [];
    c.dirty = false;
    const byMat = new Map();
    for (const p of c.parts) {
      const mesh = p.mesh;
      mesh.updateMatrix();
      const g = mesh.geometry;
      const mats = Array.isArray(mesh.material) ? mesh.material : null;
      const total = g.index ? g.index.count : g.attributes.position.count;
      const groups = g.groups.length && mats ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
      for (const gr of groups) {
        const mat0 = mats ? mats[gr.materialIndex] : mesh.material;
        if (!mat0) continue;
        const mat = mergedMaterial(mat0) || mat0;
        let e = byMat.get(mat);
        if (!e) { e = { mat, list: [], n: 0 }; byMat.set(mat, e); }
        e.list.push({ g, start: gr.start, count: Math.min(gr.count, total - gr.start), matrix: mesh.matrix, color: mat0.color });
        e.n += Math.min(gr.count, total - gr.start);
      }
    }
    for (const { mat, list, n } of byMat.values()) {
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      const col = mat.vertexColors ? new Float32Array(n * 3) : null;
      let o = 0;
      for (const it of list) {
        _nm.getNormalMatrix(it.matrix);
        const P = it.g.attributes.position, N = it.g.attributes.normal, U = it.g.attributes.uv, I = it.g.index;
        for (let k = it.start; k < it.start + it.count; k++, o++) {
          const i = I ? I.getX(k) : k;
          _v.fromBufferAttribute(P, i).applyMatrix4(it.matrix);
          pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
          _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
          nrm[o * 3] = _v.x; nrm[o * 3 + 1] = _v.y; nrm[o * 3 + 2] = _v.z;
          if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
          if (col) { col[o * 3] = it.color.r; col[o * 3 + 1] = it.color.g; col[o * 3 + 2] = it.color.b; }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      m.receiveShadow = !!this.world.shadows;
      if (mat.transparent) m.renderOrder = 1;
      this.group.add(m);
      c.meshes.push(m);
    }
  }

  /**
   * Per frame: tidy up the debris (too much, sunk, or fallen out of the
   * world), float it on water, and let fast pieces hurt people.
   */
  update(dt, water, characters, onHit) {
    this.flush();
    const t = this.world.time;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], b = d.p.body;
      if (d.p.destroyed || !b) { this.debris.splice(i, 1); continue; }
      const y = b.position.y;
      if (y < (water?.level ?? 0) - 45 || y < -80 || Math.abs(b.position.x) > 1500 || Math.abs(b.position.z) > 1500) { this.remove(d.p); this.debris.splice(i, 1); continue; }
      // floating: wood and plastic bob on the surface and drift with the current
      if (water && y < water.level) {
        const depth = Math.min(3, water.level - y);
        b.wakeUp?.();
        b.velocity.y += (196.2 * 1.25 * depth / 3) * dt;
        b.velocity.x *= 1 - dt * 1.2; b.velocity.y *= 1 - dt * 1.5; b.velocity.z *= 1 - dt * 1.2;
        if (water.current) { b.velocity.x += water.current.x * dt; b.velocity.z += water.current.z * dt; }
      }
      // hurt people it hits hard
      const v = b.velocity, sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 45 && onHit && b.mass > 4) {
        for (const ch of characters) {
          if (!ch.alive) continue;
          if (ch.hitTest(d.p.mesh.position, Math.max(d.p.size.x, d.p.size.y, d.p.size.z) * 0.5)) {
            const rv = Math.hypot(v.x - ch.body.velocity.x, v.y - ch.body.velocity.y, v.z - ch.body.velocity.z);
            if (rv > 45 && (ch._lastCrush || 0) < t - 0.3) { ch._lastCrush = t; onHit(ch, (rv - 40) * Math.min(1.6, b.mass / 25), d.p); }
          }
        }
      }
    }
    // too much debris: the oldest pieces go (resting ones first)
    if (this.debris.length > this.maxDebris) {
      const sorted = [...this.debris].sort((a, b) => (a.p.body.sleepState === 2 ? 0 : 1) - (b.p.body.sleepState === 2 ? 0 : 1) || a.t - b.t);
      for (const d of sorted.slice(0, this.debris.length - this.maxDebris)) {
        this.remove(d.p);
        this.debris.splice(this.debris.indexOf(d), 1);
      }
    }
  }

  /** Remove everything (end of a round). */
  clear() {
    for (const p of [...this.parts]) if (!p.destroyed) p.destroy();
    for (const c of this.chunks.values()) for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    this.parts.clear();
    this.debris = [];
  }
}
