import * as THREE from 'three';

// CDLOD terrain (Strugar 2010): a quadtree of fixed-resolution grid patches selected each
// frame by distance, drawn as two instanced meshes (full patches and half-resolution
// quarter patches). Vertices morph continuously toward the next coarser grid before a
// LOD boundary, so neighbouring LODs always meet without cracks or popping.
//
// The vertex position carries grid coordinates in x/z and the patch resolution in y, so
// both meshes share one material.

const Y_MIN = -90; // includes earth-curvature drop at the far end
const Y_MAX = 260;

function makeGrid(res) {
  const verts = new Float32Array((res + 1) * (res + 1) * 3);
  let o = 0;
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      verts[o++] = i;
      verts[o++] = res;
      verts[o++] = j;
    }
  }
  const idx = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * (res + 1) + i;
      const b = a + 1;
      const c = a + res + 1;
      const d = c + 1;
      // Alternate the diagonal for a more isotropic triangulation.
      if ((i + j) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  return geo;
}

export class TerrainMesh {
  constructor(material, { gridRes = 32, leafSize = 8, lodCount = 11, rangeRatio = 3.2, maxNodes = 3000 } = {}) {
    if (gridRes % 4 !== 0) throw new Error('gridRes must be a multiple of 4');
    this.G = gridRes;
    this.leaf = leafSize;
    this.lodCount = lodCount;
    this.maxNodes = maxNodes;
    this.ranges = [];
    for (let i = 0; i < lodCount; i++) this.ranges.push(leafSize * rangeRatio * 2 ** i);
    this.viewDistance = this.ranges[lodCount - 1];

    const morph = [];
    for (let i = 0; i < lodCount; i++) {
      const prev = i > 0 ? this.ranges[i - 1] : 0;
      const r = this.ranges[i];
      morph.push(new THREE.Vector2(prev + (r - prev) * 0.62, r * 0.97));
    }
    material.uniforms.uMorph = { value: morph };
    material.uniforms.uYRange = { value: new THREE.Vector2(Y_MIN, Y_MAX) };
    material.defines.TERRAIN_LODS = lodCount;

    this.full = this._makeMesh(gridRes, material);
    this.half = this._makeMesh(gridRes / 2, material);
    this.group = new THREE.Group();
    this.group.add(this.full.mesh, this.half.mesh);

    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this.stats = { nodes: 0, vertices: 0 };
  }

  _makeMesh(res, material) {
    const geo = makeGrid(res);
    const data = new Float32Array(this.maxNodes * 4);
    const attr = new THREE.InstancedBufferAttribute(data, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aNode', attr);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    return { mesh, geo, data, attr, count: 0, verts: (res + 1) * (res + 1) };
  }

  _boxDist(x, z, size, c) {
    const dx = Math.max(x - c.x, 0, c.x - (x + size));
    const dz = Math.max(z - c.z, 0, c.z - (z + size));
    const dy = Math.max(Y_MIN - c.y, 0, c.y - Y_MAX);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _visible(x, z, size) {
    this._box.min.set(x, Y_MIN, z);
    this._box.max.set(x + size, Y_MAX, z + size);
    return this.frustum.intersectsBox(this._box);
  }

  _add(target, x, z, size, lod) {
    if (target.count >= this.maxNodes) return;
    const o = target.count * 4;
    target.data[o] = x;
    target.data[o + 1] = z;
    target.data[o + 2] = size;
    target.data[o + 3] = lod;
    target.count++;
  }

  _select(x, z, size, lod, c) {
    const d = this._boxDist(x, z, size, c);
    if (d > this.ranges[lod]) return false;
    if (!this._visible(x, z, size)) return true;
    if (lod === 0 || d > this.ranges[lod - 1]) {
      this._add(this.full, x, z, size, lod);
      return true;
    }
    const h = size * 0.5;
    for (let q = 0; q < 4; q++) {
      const cx = x + (q & 1) * h;
      const cz = z + (q >> 1) * h;
      if (!this._select(cx, cz, h, lod - 1, c) && this._visible(cx, cz, h)) {
        this._add(this.half, cx, cz, h, lod);
      }
    }
    return true;
  }

  /** Select patches for this camera (call after the camera matrices are updated). */
  update(camera) {
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    this.full.count = 0;
    this.half.count = 0;
    const c = camera.position;
    const top = this.lodCount - 1;
    const root = this.leaf * 2 ** top;
    const R = this.ranges[top];
    const x0 = Math.floor((c.x - R) / root);
    const x1 = Math.floor((c.x + R) / root);
    const z0 = Math.floor((c.z - R) / root);
    const z1 = Math.floor((c.z + R) / root);
    for (let rx = x0; rx <= x1; rx++) {
      for (let rz = z0; rz <= z1; rz++) this._select(rx * root, rz * root, root, top, c);
    }
    for (const m of [this.full, this.half]) {
      m.geo.instanceCount = m.count;
      m.attr.clearUpdateRanges();
      m.attr.addUpdateRange(0, Math.max(4, m.count * 4));
      m.attr.needsUpdate = true;
      m.mesh.visible = m.count > 0;
    }
    this.stats.nodes = this.full.count + this.half.count;
    this.stats.vertices = this.full.count * this.full.verts + this.half.count * this.half.verts;
  }
}
