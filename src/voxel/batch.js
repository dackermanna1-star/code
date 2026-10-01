// Static batching: transforms many voxel meshes into world space and merges
// them into a handful of spatial chunks along the alley (z axis) so frustum
// culling still works while draw calls stay low.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class StaticBatcher {
  constructor({ chunkLength = 14, name = 'batch' } = {}) {
    this.chunkLength = chunkLength;
    this.name = name;
    this.chunks = new Map(); // key -> { pieces: [], vcount, icount }
    this.totalVerts = 0;
  }

  /**
   * @param {THREE.BufferGeometry} geo  voxel geometry (position, normal, vcol, vmat, vox, index)
   * @param {THREE.Matrix4} matrix      model -> world
   * @param {object} opts { seed:[x,y,z] added to vox, chunkKey?: override }
   */
  add(geo, matrix, opts = {}) {
    if (!geo.index || geo.index.count === 0) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
    const key = opts.chunkKey ?? Math.floor(c.z / this.chunkLength);
    let ch = this.chunks.get(key);
    if (!ch) {
      ch = { pieces: [], vcount: 0, icount: 0 };
      this.chunks.set(key, ch);
    }
    ch.pieces.push({ geo, matrix: matrix.clone(), seed: opts.seed ?? null });
    ch.vcount += geo.attributes.position.count;
    ch.icount += geo.index.count;
    this.totalVerts += geo.attributes.position.count;
  }

  build(material, { castShadow = true, receiveShadow = true, layers = null } = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, ch] of this.chunks) {
      const pos = new Float32Array(ch.vcount * 3);
      const nrm = new Int8Array(ch.vcount * 3);
      const col = new Uint8Array(ch.vcount * 4);
      const mat = new Uint8Array(ch.vcount * 4);
      const vox = new Float32Array(ch.vcount * 3);
      const idx = new Uint32Array(ch.icount);
      // passthrough attributes (copied verbatim, e.g. vfac)
      const extraNames = Object.keys(ch.pieces[0].geo.attributes).filter(
        (n) => !['position', 'normal', 'vcol', 'vmat', 'vox'].includes(n),
      );
      const extras = {};
      for (const n of extraNames) {
        const a = ch.pieces[0].geo.attributes[n];
        extras[n] = { arr: new a.array.constructor(ch.vcount * a.itemSize), itemSize: a.itemSize, normalized: a.normalized };
      }
      let vo = 0;
      let io = 0;
      for (const p of ch.pieces) {
        const g = p.geo;
        const P = g.attributes.position.array;
        const N = g.attributes.normal.array;
        const C = g.attributes.vcol.array;
        const M = g.attributes.vmat.array;
        const X = g.attributes.vox.array;
        const I = g.index.array;
        const n = g.attributes.position.count;
        _nm.getNormalMatrix(p.matrix);
        const e = p.matrix.elements;
        for (let i = 0; i < n; i++) {
          const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
          const o = (vo + i) * 3;
          pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          _n.set(N[i * 3] / 127, N[i * 3 + 1] / 127, N[i * 3 + 2] / 127).applyMatrix3(_nm).normalize();
          nrm[o] = Math.round(_n.x * 127);
          nrm[o + 1] = Math.round(_n.y * 127);
          nrm[o + 2] = Math.round(_n.z * 127);
          const sx = p.seed ? p.seed[0] : 0, sy = p.seed ? p.seed[1] : 0, sz = p.seed ? p.seed[2] : 0;
          vox[o] = X[i * 3] + sx;
          vox[o + 1] = X[i * 3 + 1] + sy;
          vox[o + 2] = X[i * 3 + 2] + sz;
        }
        col.set(C, vo * 4);
        mat.set(M, vo * 4);
        for (const n of extraNames) {
          const a = g.attributes[n];
          if (a) extras[n].arr.set(a.array, vo * extras[n].itemSize);
        }
        for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
        vo += n;
        io += I.length;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
      geo.setAttribute('vcol', new THREE.BufferAttribute(col, 4, true));
      geo.setAttribute('vmat', new THREE.BufferAttribute(mat, 4, true));
      geo.setAttribute('vox', new THREE.BufferAttribute(vox, 3));
      for (const n of extraNames) geo.setAttribute(n, new THREE.BufferAttribute(extras[n].arr, extras[n].itemSize, extras[n].normalized));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${this.name}:${key}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      if (layers) layers.forEach((l) => mesh.layers.enable(l));
      group.add(mesh);
    }
    return group;
  }
}
