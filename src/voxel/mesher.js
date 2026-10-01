// Greedy voxel mesher with per-vertex ambient occlusion.
//
// Output vertex format (all attributes separate buffers):
//   position  Float32x3  meters (model space)
//   normal    Int8x3     normalized
//   vcol      Uint8x4    sRGB albedo + per-voxel variation amount (a)
//   vmat      Uint8x4    roughness, metalness, material class, ambient occlusion
//   vox       Float32x3  local voxel coordinate pushed half a voxel inward along
//                        the face normal (+ per-instance seed offset), so
//                        floor(vox) in the fragment shader is the voxel cell.
//
// Faces are merged only when material and (uniform) AO match, which keeps
// AO gradients correct while still collapsing large flat areas.
import * as THREE from 'three';

class GrowF32 {
  constructor(n = 4096) {
    this.a = new Float32Array(n);
    this.n = 0;
  }
  ensure(k) {
    if (this.n + k > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + k));
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
  view() {
    return this.a.slice(0, this.n);
  }
}

class GrowTyped {
  constructor(Ctor, n = 4096) {
    this.Ctor = Ctor;
    this.a = new Ctor(n);
    this.n = 0;
  }
  ensure(k) {
    if (this.n + k > this.a.length) {
      const b = new this.Ctor(Math.max(this.a.length * 2, this.n + k));
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
  view() {
    return this.a.slice(0, this.n);
  }
}

export class MeshData {
  constructor() {
    this.pos = new GrowF32(1 << 14);
    this.vox = new GrowF32(1 << 14);
    this.nrm = new GrowTyped(Int8Array, 1 << 14);
    this.col = new GrowTyped(Uint8Array, 1 << 14);
    this.mat = new GrowTyped(Uint8Array, 1 << 14);
    this.idx = new GrowTyped(Uint32Array, 1 << 14);
    this.vertexCount = 0;
  }

  get quadCount() {
    return this.idx.n / 6;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.view(), 3, true));
    g.setAttribute('vcol', new THREE.BufferAttribute(this.col.view(), 4, true));
    g.setAttribute('vmat', new THREE.BufferAttribute(this.mat.view(), 4, true));
    g.setAttribute('vox', new THREE.BufferAttribute(this.vox.view(), 3));
    g.setIndex(new THREE.BufferAttribute(this.idx.view(), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const AO_LEVELS = [0.42, 0.62, 0.82, 1.0];

/**
 * Mesh a voxel grid.
 * @param {import('./VoxelGrid.js').VoxelGrid} grid
 * @param {import('./VoxelGrid.js').Palette} palette
 * @param {object} opts
 *   voxelSize  meters per voxel
 *   origin     [x,y,z] meters added to positions
 *   skip       { px, nx, py, ny, pz, nz } face directions to omit
 *   seed       [x,y,z] integer offset added to vox attribute
 *   ao         boolean (default true)
 *   out        MeshData to append to (optional)
 *   aoLevels   override AO brightness table
 *   transparent Set of palette indices that do not occlude neighbours
 */
export function greedyMesh(grid, palette, opts = {}) {
  const { nx, ny, nz, data } = grid;
  const dims = [nx, ny, nz];
  const strides = [1, nx, nx * ny];
  const vs = opts.voxelSize ?? 0.05;
  const origin = opts.origin ?? [0, 0, 0];
  const skip = opts.skip ?? {};
  const seed = opts.seed ?? [0, 0, 0];
  const aoOn = opts.ao !== false;
  const aoLevels = opts.aoLevels ?? AO_LEVELS;
  const out = opts.out ?? new MeshData();

  const ents = palette.entries;
  const P = ents.length;
  const pr = new Uint8Array(P), pg = new Uint8Array(P), pb = new Uint8Array(P), pv = new Uint8Array(P);
  const pro = new Uint8Array(P), pme = new Uint8Array(P), pcl = new Uint8Array(P);
  for (let i = 1; i < P; i++) {
    const e = ents[i];
    pr[i] = e.color[0];
    pg[i] = e.color[1];
    pb[i] = e.color[2];
    pv[i] = Math.round(Math.min(1, e.vari) * 255);
    pro[i] = Math.round(Math.min(1, Math.max(0, e.rough)) * 255);
    pme[i] = Math.round(Math.min(1, Math.max(0, e.metal)) * 255);
    pcl[i] = e.cls & 255;
  }
  const aoByte = aoLevels.map((v) => Math.round(v * 255));

  const dirNames = [
    ['px', 'nx'],
    ['py', 'ny'],
    ['pz', 'nz'],
  ];

  const corner = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = dims[u];
    const dv = dims[v];
    const dd = dims[d];
    const sd = strides[d];
    const su = strides[u];
    const sv = strides[v];
    const mask = new Int32Array(du * dv);

    for (const s of [1, -1]) {
      if (skip[dirNames[d][s > 0 ? 0 : 1]]) continue;
      const nrm = [0, 0, 0];
      nrm[d] = s;
      const n0 = nrm[0] * 127, n1 = nrm[1] * 127, n2 = nrm[2] * 127;

      for (let q = 0; q < dd; q++) {
        const qn = q + s;
        const frontIn = qn >= 0 && qn < dd;
        let n = 0;
        let any = false;
        for (let iv = 0; iv < dv; iv++) {
          const baseV = q * sd + iv * sv;
          for (let iu = 0; iu < du; iu++) {
            const idx = baseV + iu * su;
            const a = data[idx];
            if (a === 0) {
              mask[n++] = 0;
              continue;
            }
            if (frontIn && data[idx + s * sd] !== 0) {
              mask[n++] = 0;
              continue;
            }
            let key = a << 9;
            if (aoOn && frontIn) {
              const f = idx + s * sd;
              const um = iu > 0, up = iu < du - 1, vm = iv > 0, vp = iv < dv - 1;
              const sUm = um && data[f - su] !== 0 ? 1 : 0;
              const sUp = up && data[f + su] !== 0 ? 1 : 0;
              const sVm = vm && data[f - sv] !== 0 ? 1 : 0;
              const sVp = vp && data[f + sv] !== 0 ? 1 : 0;
              const cMM = um && vm && data[f - su - sv] !== 0 ? 1 : 0;
              const cPM = up && vm && data[f + su - sv] !== 0 ? 1 : 0;
              const cPP = up && vp && data[f + su + sv] !== 0 ? 1 : 0;
              const cMP = um && vp && data[f - su + sv] !== 0 ? 1 : 0;
              const a0 = sUm && sVm ? 0 : 3 - (sUm + sVm + cMM);
              const a1 = sUp && sVm ? 0 : 3 - (sUp + sVm + cPM);
              const a2 = sUp && sVp ? 0 : 3 - (sUp + sVp + cPP);
              const a3 = sUm && sVp ? 0 : 3 - (sUm + sVp + cMP);
              const uni = a0 === a1 && a1 === a2 && a2 === a3 ? 1 : 0;
              key |= ((a0 | (a1 << 2) | (a2 << 4) | (a3 << 6)) << 1) | uni;
            } else {
              key |= (0xff << 1) | 1;
            }
            mask[n++] = key;
            any = true;
          }
        }
        if (!any) continue;

        const plane = s > 0 ? q + 1 : q;
        for (let iv = 0; iv < dv; iv++) {
          for (let iu = 0; iu < du; ) {
            const key = mask[iv * du + iu];
            if (key === 0) {
              iu++;
              continue;
            }
            let w = 1;
            let h = 1;
            if (key & 1) {
              while (iu + w < du && mask[iv * du + iu + w] === key) w++;
              outer: while (iv + h < dv) {
                const row = (iv + h) * du + iu;
                for (let k = 0; k < w; k++) if (mask[row + k] !== key) break outer;
                h++;
              }
            }
            // emit quad
            const m = key >>> 9;
            const aoBits = (key >>> 1) & 0xff;
            const ao = [aoBits & 3, (aoBits >> 2) & 3, (aoBits >> 4) & 3, (aoBits >> 6) & 3];
            const base = out.vertexCount;
            out.pos.ensure(12);
            out.vox.ensure(12);
            out.nrm.ensure(12);
            out.col.ensure(16);
            out.mat.ensure(16);
            out.idx.ensure(6);
            for (let c = 0; c < 4; c++) {
              const cu = c === 1 || c === 2 ? iu + w : iu;
              const cv = c >= 2 ? iv + h : iv;
              corner[d] = plane;
              corner[u] = cu;
              corner[v] = cv;
              const pp = out.pos.n;
              out.pos.a[pp] = origin[0] + corner[0] * vs;
              out.pos.a[pp + 1] = origin[1] + corner[1] * vs;
              out.pos.a[pp + 2] = origin[2] + corner[2] * vs;
              out.pos.n += 3;
              const vp = out.vox.n;
              out.vox.a[vp] = corner[0] - 0.5 * nrm[0] + seed[0];
              out.vox.a[vp + 1] = corner[1] - 0.5 * nrm[1] + seed[1];
              out.vox.a[vp + 2] = corner[2] - 0.5 * nrm[2] + seed[2];
              out.vox.n += 3;
              const np = out.nrm.n;
              out.nrm.a[np] = n0;
              out.nrm.a[np + 1] = n1;
              out.nrm.a[np + 2] = n2;
              out.nrm.n += 3;
              const cp = out.col.n;
              out.col.a[cp] = pr[m];
              out.col.a[cp + 1] = pg[m];
              out.col.a[cp + 2] = pb[m];
              out.col.a[cp + 3] = pv[m];
              out.col.n += 4;
              const mp = out.mat.n;
              out.mat.a[mp] = pro[m];
              out.mat.a[mp + 1] = pme[m];
              out.mat.a[mp + 2] = pcl[m];
              out.mat.a[mp + 3] = aoByte[ao[c]];
              out.mat.n += 4;
            }
            out.vertexCount += 4;
            const flip = ao[0] + ao[2] < ao[1] + ao[3];
            const I = out.idx.a;
            let ip = out.idx.n;
            if (s > 0) {
              if (!flip) {
                I[ip++] = base; I[ip++] = base + 1; I[ip++] = base + 2;
                I[ip++] = base; I[ip++] = base + 2; I[ip++] = base + 3;
              } else {
                I[ip++] = base + 1; I[ip++] = base + 2; I[ip++] = base + 3;
                I[ip++] = base + 1; I[ip++] = base + 3; I[ip++] = base;
              }
            } else {
              if (!flip) {
                I[ip++] = base; I[ip++] = base + 2; I[ip++] = base + 1;
                I[ip++] = base; I[ip++] = base + 3; I[ip++] = base + 2;
              } else {
                I[ip++] = base + 1; I[ip++] = base + 3; I[ip++] = base + 2;
                I[ip++] = base + 1; I[ip++] = base; I[ip++] = base + 3;
              }
            }
            out.idx.n = ip;
            // clear mask region
            for (let hh = 0; hh < h; hh++) {
              const row = (iv + hh) * du + iu;
              for (let k = 0; k < w; k++) mask[row + k] = 0;
            }
            iu += w;
          }
        }
      }
    }
  }
  return out;
}

/** Convenience: mesh a VoxelModel to a BufferGeometry. */
export function meshModel(model, opts = {}) {
  const md = greedyMesh(model.grid, model.palette, {
    voxelSize: model.voxelSize,
    origin: model.origin,
    ...opts,
  });
  return md.toGeometry();
}
