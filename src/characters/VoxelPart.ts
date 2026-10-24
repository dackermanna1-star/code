import * as THREE from 'three';
import { boxFaceCoords, F, P, PART_KIND } from './Rig';
import { CharacterAtlas, FLESH } from './CharacterTexture';

const _st = { s: 0, t: 0 };
const _uv = { u: 0, v: 0 };

// direction table: dx, dy, dz, face index
const DIRS: [number, number, number, number][] = [
  [1, 0, 0, F.PX],
  [-1, 0, 0, F.NX],
  [0, 1, 0, F.PY],
  [0, -1, 0, F.NY],
  [0, 0, 1, F.PZ],
  [0, 0, -1, F.NZ],
];

// quad corner offsets for each face direction (unit cube from 0..1), CCW from outside
const FACE_CORNERS: number[][][] = [
  // +X
  [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  // -X
  [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // +Y
  [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ],
  // -Y
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  // +Z
  [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  // -Z
  [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
];

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface RemovedVoxel {
  x: number;
  y: number;
  z: number; // part-local center (box centered)
  surface: boolean;
}

/** A carve-able voxel volume for one body part. */
export class VoxelPart {
  readonly data: Uint8Array;
  readonly vs: THREE.Vector3;
  readonly half: THREE.Vector3;
  solid: number;
  readonly initial: number;

  constructor(
    public part: number,
    public nx: number,
    public ny: number,
    public nz: number,
    public size: THREE.Vector3,
  ) {
    this.data = new Uint8Array(nx * ny * nz).fill(1);
    this.vs = new THREE.Vector3(size.x / nx, size.y / ny, size.z / nz);
    this.half = size.clone().multiplyScalar(0.5);
    this.solid = this.initial = nx * ny * nz;
  }

  get integrity(): number {
    return this.solid / this.initial;
  }

  idx(x: number, y: number, z: number): number {
    return x + this.nx * (y + this.ny * z);
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 0;
    return this.data[x + this.nx * (y + this.ny * z)];
  }

  /** depth of voxel from the outer boundary in voxel units */
  depth(x: number, y: number, z: number): number {
    return Math.min(x, y, z, this.nx - 1 - x, this.ny - 1 - y, this.nz - 1 - z);
  }

  voxelCenter(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      -this.half.x + (x + 0.5) * this.vs.x,
      -this.half.y + (y + 0.5) * this.vs.y,
      -this.half.z + (z + 0.5) * this.vs.z,
    );
  }

  /**
   * Remove voxels around a box-local point. `dir` biases the carve inward
   * (along the hit direction) so punches dig craters rather than spheres.
   */
  carve(local: THREE.Vector3, radius: number, dir: THREE.Vector3 | null, maxRemove: number, out: RemovedVoxel[]): number {
    const { nx, ny, nz, vs, half } = this;
    const cx = (local.x + half.x) / vs.x - 0.5;
    const cy = (local.y + half.y) / vs.y - 0.5;
    const cz = (local.z + half.z) / vs.z - 0.5;
    const rv = radius / Math.min(vs.x, vs.y, vs.z);
    const x0 = Math.max(0, Math.floor(cx - rv - 1));
    const x1 = Math.min(nx - 1, Math.ceil(cx + rv + 1));
    const y0 = Math.max(0, Math.floor(cy - rv - 1));
    const y1 = Math.min(ny - 1, Math.ceil(cy + rv + 1));
    const z0 = Math.max(0, Math.floor(cz - rv - 1));
    const z1 = Math.min(nz - 1, Math.ceil(cz + rv + 1));
    // candidates sorted by distance (closest first)
    const cand: { i: number; x: number; y: number; z: number; d: number }[] = [];
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = x + nx * (y + ny * z);
          if (!this.data[i]) continue;
          let dx = x - cx,
            dy = y - cy,
            dz = z - cz;
          if (dir) {
            // stretch along dir: points deeper along the hit direction count as closer
            const along = dx * dir.x + dy * dir.y + dz * dir.z;
            if (along > 0) {
              dx -= dir.x * along * 0.45;
              dy -= dir.y * along * 0.45;
              dz -= dir.z * along * 0.45;
            }
          }
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * (0.82 + hash3(x, y, z) * 0.36);
          if (d <= rv) cand.push({ i, x, y, z, d });
        }
    cand.sort((a, b) => a.d - b.d);
    let removed = 0;
    const tmp = new THREE.Vector3();
    for (const c of cand) {
      if (removed >= maxRemove) break;
      this.data[c.i] = 0;
      removed++;
      this.voxelCenter(c.x, c.y, c.z, tmp);
      out.push({ x: tmp.x, y: tmp.y, z: tmp.z, surface: this.depth(c.x, c.y, c.z) === 0 });
    }
    this.solid -= removed;
    return removed;
  }

  /** Remove everything (head explosion). */
  obliterate(out: RemovedVoxel[], keepEvery = 3): void {
    const tmp = new THREE.Vector3();
    for (let z = 0; z < this.nz; z++)
      for (let y = 0; y < this.ny; y++)
        for (let x = 0; x < this.nx; x++) {
          const i = this.idx(x, y, z);
          if (!this.data[i]) continue;
          this.data[i] = 0;
          if ((x + y * 3 + z * 7) % keepEvery === 0) {
            this.voxelCenter(x, y, z, tmp);
            out.push({ x: tmp.x, y: tmp.y, z: tmp.z, surface: this.depth(x, y, z) === 0 });
          }
        }
    this.solid = 0;
  }

  /** Remove a horizontal slab of voxels (a clean cut) at local y. */
  sliceAt(localY: number, out: RemovedVoxel[]): void {
    const yi = Math.max(0, Math.min(this.ny - 1, Math.floor((localY + this.half.y) / this.vs.y)));
    const tmp = new THREE.Vector3();
    for (let z = 0; z < this.nz; z++)
      for (let x = 0; x < this.nx; x++) {
        const i = this.idx(x, yi, z);
        if (this.data[i]) {
          this.data[i] = 0;
          this.solid--;
          this.voxelCenter(x, yi, z, tmp);
          out.push({ x: tmp.x, y: tmp.y, z: tmp.z, surface: false });
        }
      }
  }

  private fleshCell(x: number, y: number, z: number): [number, number] {
    const d = this.depth(x, y, z);
    const h = hash3(x, y, z);
    const col = Math.floor(h * 8);
    const kind = PART_KIND[this.part];
    if (kind === 'head') {
      const cxn = Math.abs(x - (this.nx - 1) / 2) / (this.nx / 2);
      const cyn = Math.abs(y - (this.ny - 1) / 2) / (this.ny / 2);
      const czn = Math.abs(z - (this.nz - 1) / 2) / (this.nz / 2);
      const r = Math.max(cxn, cyn * 1.1, czn);
      if (d === 1 && h < 0.55) return [FLESH.BONE, col];
      if (r < 0.55 && y > this.ny * 0.3) return [h < 0.5 ? FLESH.BRAIN : FLESH.PINK, col];
      if (d === 0) return [h < 0.5 ? FLESH.BRIGHT : FLESH.LIGHT, col];
      return [h < 0.4 ? FLESH.MID : h < 0.8 ? FLESH.DARK : FLESH.DEEP, col];
    }
    if (kind === 'torso' || kind === 'pelvis') {
      if (d === 0) return [h < 0.6 ? FLESH.BRIGHT : FLESH.LIGHT, col];
      if (d >= 2 && h < 0.12) return [FLESH.PINK, col];
      if (d === 1 && h > 0.85) return [FLESH.BONE, col];
      return [h < 0.45 ? FLESH.MID : h < 0.85 ? FLESH.DARK : FLESH.DEEP, col];
    }
    // limbs: bone core
    const cxn = Math.abs(x - (this.nx - 1) / 2);
    const czn = Math.abs(z - (this.nz - 1) / 2);
    if (cxn <= 0.6 && czn <= 0.6) return [FLESH.BONE, col];
    if (d === 0) return [h < 0.6 ? FLESH.BRIGHT : FLESH.LIGHT, col];
    return [h < 0.5 ? FLESH.MID : FLESH.DARK, col];
  }

  /** Build a mesh geometry (joint-local: adds `offset` = box center relative to joint). */
  buildGeometry(atlas: CharacterAtlas, offset: THREE.Vector3): THREE.BufferGeometry {
    const { nx, ny, nz, vs, half } = this;
    const pos: number[] = [];
    const nor: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let vcount = 0;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          if (!this.data[x + nx * (y + ny * z)]) continue;
          for (let d = 0; d < 6; d++) {
            const [dx, dy, dz, face] = DIRS[d];
            const ox = x + dx,
              oy = y + dy,
              oz = z + dz;
            const outside = ox < 0 || oy < 0 || oz < 0 || ox >= nx || oy >= ny || oz >= nz;
            if (!outside && this.data[ox + nx * (oy + ny * oz)]) continue;
            const corners = FACE_CORNERS[d];
            let flesh: [number, number] | null = null;
            if (!outside) {
              flesh = this.fleshCell(x, y, z);
              atlas.fleshUV(flesh[0], flesh[1], _uv);
            }
            for (let c = 0; c < 4; c++) {
              const cc = corners[c];
              const lx = -half.x + (x + cc[0]) * vs.x;
              const ly = -half.y + (y + cc[1]) * vs.y;
              const lz = -half.z + (z + cc[2]) * vs.z;
              pos.push(lx + offset.x, ly + offset.y, lz + offset.z);
              nor.push(dx, dy, dz);
              if (outside) {
                boxFaceCoords(lx, ly, lz, half.x, half.y, half.z, _st, face);
                atlas.uv(this.part, face, _st.s, _st.t, _uv);
              }
              uvs.push(_uv.u, _uv.v);
            }
            idx.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
            vcount += 4;
          }
        }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Plain box geometry for an intact part with atlas UVs (joint-local). */
export function buildBoxPart(atlas: CharacterAtlas, part: number, size: THREE.Vector3, offset: THREE.Vector3, out: { pos: number[]; nor: number[]; uv: number[]; idx: number[]; skinIndex: number[]; bone: number }): void {
  const hx = size.x / 2,
    hy = size.y / 2,
    hz = size.z / 2;
  for (let d = 0; d < 6; d++) {
    const [dx, dy, dz, face] = DIRS[d];
    const corners = FACE_CORNERS[d];
    const base = out.pos.length / 3;
    for (let c = 0; c < 4; c++) {
      const cc = corners[c];
      const lx = cc[0] ? hx : -hx;
      const ly = cc[1] ? hy : -hy;
      const lz = cc[2] ? hz : -hz;
      out.pos.push(lx + offset.x, ly + offset.y, lz + offset.z);
      out.nor.push(dx, dy, dz);
      boxFaceCoords(lx, ly, lz, hx, hy, hz, _st, face);
      atlas.uv(part, face, _st.s, _st.t, _uv);
      out.uv.push(_uv.u, _uv.v);
      out.skinIndex.push(out.bone, 0, 0, 0);
    }
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export { P };
