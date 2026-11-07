// Instanced moving parts (carts, drawers, oven doors, lav door leaves, lids,
// jumpseat pans, ...). Every part type is ONE InstancedMesh per material, so
// e.g. all seven carts draw in two calls. Parts placed in a mirrored frame
// (left-hand lavatories) use world = S * base * local * S, which keeps the
// determinant positive (no winding problems) as long as the part geometry is
// symmetric about its local X axis — all part geometries here are built that way.
import * as THREE from 'three';

const S = new THREE.Matrix4().makeScale(-1, 1, 1);
const _m = new THREE.Matrix4();
const _id = new THREE.Matrix4();

export class PartType {
  /**
   * @param parent Object3D
   * @param name string
   * @param layers [{ geometry, material, castShadow }]
   * @param capacity max instances
   */
  constructor(parent, name, layers, capacity) {
    this.name = name;
    this.meshes = layers.map((L, i) => {
      const m = new THREE.InstancedMesh(L.geometry, L.material, capacity);
      m.name = `galley-part-${name}-${i}`;
      m.count = 0;
      m.castShadow = !!L.castShadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(m);
      return m;
    });
    this.instances = [];
    this.capacity = capacity;
    this._dirty = false;
  }
  get mesh() { return this.meshes[0]; }

  add(base, mirror = false) {
    if (this.instances.length >= this.capacity) { console.warn('[galley] part capacity', this.name); return null; }
    const inst = new PartInstance(this, this.instances.length, base, mirror);
    this.instances.push(inst);
    for (const m of this.meshes) m.count = this.instances.length;
    inst.setLocal(_id);
    return inst;
  }

  /** Call once per frame (cheap when nothing changed). */
  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.boundingSphere = null; }
  }
}

export class PartInstance {
  constructor(type, index, base, mirror) {
    this.type = type; this.index = index;
    this.base = base.clone(); this.mirror = mirror;
    this.world = new THREE.Matrix4();
    this.local = new THREE.Matrix4();
  }
  /** Set the animation transform in the part's own (unmirrored) frame. */
  setLocal(local) {
    this.local.copy(local);
    if (this.mirror) this.world.copy(S).multiply(this.base).multiply(local).multiply(S);
    else this.world.copy(this.base).multiply(local);
    for (const m of this.type.meshes) m.setMatrixAt(this.index, this.world);
    this.type._dirty = true;
  }
  /** Hide (scale to zero) or show. */
  setHidden(h) {
    if (h) { _m.makeScale(0, 0, 0); for (const m of this.type.meshes) m.setMatrixAt(this.index, _m); this.type._dirty = true; }
    else this.setLocal(this.local);
  }
  /** World position of a point given in part-local coordinates. */
  worldPoint(x, y, z, target = new THREE.Vector3()) { return target.set(x, y, z).applyMatrix4(this.world); }
}

/**
 * Dynamic glowing quads (lit signs, displays, light diffusers): one InstancedMesh,
 * per-instance atlas rectangle + colour (brightness).
 */
export class Glowers {
  constructor(parent, material, capacity = 64) {
    const g = new THREE.PlaneGeometry(1, 1);
    this.rects = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    g.setAttribute('uvRect', this.rects);
    const mat = material;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uvRect.xy + uv * uvRect.zw;\n#endif');
    };
    mat.customProgramCacheKey = () => 'galleyGlowers';
    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.name = 'galley-glowers';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.mesh);
    this.items = [];
    this.capacity = capacity;
    this._c = new THREE.Color();
  }
  /**
   * Add a quad: matrix places a 1x1 plane (facing +Z), w/h are the sizes, rect the atlas rect.
   * Returns an item with set(r, g, b) / setLevel(k).
   */
  add(matrix, w, h, rect, color = [1, 1, 1], level = 1) {
    const i = this.items.length;
    if (i >= this.capacity) { console.warn('[galley] glowers capacity'); return { set() {}, setLevel() {} }; }
    const m = matrix.clone().multiply(new THREE.Matrix4().makeScale(w, h, 1));
    this.mesh.setMatrixAt(i, m);
    this.rects.setXYZW(i, rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
    this.rects.needsUpdate = true;
    this.mesh.count = i + 1;
    const self = this;
    const item = {
      index: i, base: new THREE.Color(color[0], color[1], color[2]), level: -1,
      setLevel(k) {
        if (Math.abs(k - this.level) < 1e-4) return;
        this.level = k;
        self._c.copy(this.base).multiplyScalar(k);
        self.mesh.setColorAt(i, self._c);
        self.mesh.instanceColor.needsUpdate = true;
      },
      setRect(r) { self.rects.setXYZW(i, r[0], r[1], r[2] - r[0], r[3] - r[1]); self.rects.needsUpdate = true; },
    };
    item.setLevel(level);
    this.items.push(item);
    this.mesh.instanceMatrix.needsUpdate = true;
    return item;
  }
}
