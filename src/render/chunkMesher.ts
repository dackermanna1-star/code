// ChunkMesher: greedy meshing with per-vertex ambient occlusion and a sky-visibility bit.
// Produces compact Uint8 vertex streams. Opaque solids and translucent materials (liquids, ice, glass)
// are separate layers; gases and fire are emitted as point sprites.
import { CHUNK, SURFACE_Y } from '../config';
import { Chunk } from '../world/chunk';
import { VoxelWorld } from '../world/world';
import { GLOW, KIND, Kind, OPAQUE, AIR, MATERIALS } from '../world/materials';
import { hexToRgb } from './materialTextures';

export interface LayerData {
  pos: Uint8Array; // xyz per vertex
  info: Uint8Array; // [packed normal|ao|sky, material] per vertex
  index: Uint16Array | Uint32Array;
  vertexCount: number;
  indexCount: number;
}

export interface PointData {
  pos: Uint8Array; // xyz
  info: Uint8Array; // material, life
  count: number;
}

export interface Emitter {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  strength: number;
}

export interface ChunkMeshData {
  opaque: LayerData | null;
  translucent: LayerData | null;
  gas: PointData | null;
  fire: PointData | null;
  emitter: Emitter | null;
}

const P = CHUNK + 2; // padded size
const P2 = P * P;
const pad = new Uint8Array(P * P * P);
const padAux = new Uint8Array(P * P * P);
const skyCol = new Uint8Array(P * P); // per (x,z) column: lowest y index (padded) that sees sky

// Light colour lookup per material
const LIGHT_RGB: [number, number, number][] = MATERIALS.map((m) => {
  const c = hexToRgb(m.light ?? m.colors[0]);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
});

const STRIDE = [1, P2, P]; // padded index stride for x, y, z

function pidx(x: number, y: number, z: number): number {
  return (y + 1) * P2 + (z + 1) * P + (x + 1);
}

class Builder {
  pos: number[] = [];
  info: number[] = [];
  index: number[] = [];
  n = 0;
  quad(
    x0: number, y0: number, z0: number,
    ux: number, uy: number, uz: number,
    vx: number, vy: number, vz: number,
    normal: number, mat: number, ao: number[], sky: number, flipWinding: boolean,
  ): void {
    const base = this.n;
    const corners = [
      [x0, y0, z0],
      [x0 + ux, y0 + uy, z0 + uz],
      [x0 + ux + vx, y0 + uy + vy, z0 + uz + vz],
      [x0 + vx, y0 + vy, z0 + vz],
    ];
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      this.pos.push(c[0], c[1], c[2]);
      this.info.push(normal | (ao[i] << 3) | (sky << 5), mat);
    }
    this.n += 4;
    // flip diagonal to keep AO interpolation isotropic
    const flipDiag = ao[0] + ao[2] < ao[1] + ao[3];
    let tris: number[];
    if (!flipDiag) tris = [0, 1, 2, 0, 2, 3];
    else tris = [1, 2, 3, 1, 3, 0];
    if (flipWinding) tris = [tris[0], tris[2], tris[1], tris[3], tris[5], tris[4]];
    for (const t of tris) this.index.push(base + t);
  }
  build(): LayerData | null {
    if (this.n === 0) return null;
    return {
      pos: new Uint8Array(this.pos),
      info: new Uint8Array(this.info),
      index: this.n > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index),
      vertexCount: this.n,
      indexCount: this.index.length,
    };
  }
}

// axis helpers: for axis a, u=(a+1)%3, v=(a+2)%3
const AX = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function meshChunk(world: VoxelWorld, c: Chunk): ChunkMeshData {
  // ---- fill padded material array
  const ox = c.ox, oy = c.oy, oz = c.oz;
  const mat = c.mat;
  let anyNonAir = false;
  for (let y = -1; y <= CHUNK; y++)
    for (let z = -1; z <= CHUNK; z++)
      for (let x = -1; x <= CHUNK; x++) {
        const inside = x >= 0 && y >= 0 && z >= 0 && x < CHUNK && y < CHUNK && z < CHUNK;
        let m: number;
        let a = 0;
        if (inside) {
          const li = (y << 8) | (z << 4) | x;
          m = mat[li];
          if (c.aux) a = c.aux[li];
          if (m !== AIR) anyNonAir = true;
        } else {
          m = world.get(ox + x, oy + y, oz + z);
        }
        const pi = pidx(x, y, z);
        pad[pi] = m;
        padAux[pi] = a;
      }
  if (!anyNonAir) return { opaque: null, translucent: null, gas: null, fire: null, emitter: null };

  // ---- sky visibility per column (only near the surface)
  const nearSurface = oy + CHUNK > SURFACE_Y - 48;
  if (nearSurface) {
    for (let z = -1; z <= CHUNK; z++)
      for (let x = -1; x <= CHUNK; x++) {
        // walk down from far above; find first opaque voxel above the chunk top
        let lowest = CHUNK + 1; // padded y index of lowest sky-visible cell
        let blocked = false;
        for (let y = oy + CHUNK + 40; y > oy + CHUNK; y--) {
          if (OPAQUE[world.get(ox + x, y, oz + z)]) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          for (let y = CHUNK; y >= -1; y--) {
            if (OPAQUE[pad[pidx(x, y, z)]]) break;
            lowest = y + 1;
          }
        } else lowest = 999;
        skyCol[(z + 1) * P + (x + 1)] = Math.min(255, lowest + 1);
      }
  }
  const skyAt = (x: number, y: number, z: number): number => {
    if (!nearSurface) return 0;
    const l = skyCol[(z + 1) * P + (x + 1)] - 1;
    return y >= l ? 1 : 0;
  };

  const opaque = new Builder();
  const trans = new Builder();
  const mask = new Int32Array(CHUNK * CHUNK);
  const maskAo = new Uint8Array(CHUNK * CHUNK * 4);
  const ao = [0, 0, 0, 0];
  const q = [0, 0, 0];

  // Two passes: 0 opaque, 1 translucent
  for (let pass = 0; pass < 2; pass++) {
    const out = pass === 0 ? opaque : trans;
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3, v = (a + 2) % 3;
      for (let dir = 0; dir < 2; dir++) {
        const sgn = dir === 0 ? 1 : -1;
        const normal = a * 2 + dir; // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
        for (let s = 0; s < CHUNK; s++) {
          // build mask
          let any = false;
          for (let j = 0; j < CHUNK; j++)
            for (let i = 0; i < CHUNK; i++) {
              q[a] = s;
              q[u] = i;
              q[v] = j;
              const m = pad[pidx(q[0], q[1], q[2])];
              q[a] = s + sgn;
              const nm = pad[pidx(q[0], q[1], q[2])];
              let visible = false;
              if (pass === 0) visible = OPAQUE[m] === 1 && OPAQUE[nm] === 0;
              else {
                const k = KIND[m];
                const trans = m !== AIR && OPAQUE[m] === 0 && (k === Kind.LIQUID || k === Kind.SOLID || k === Kind.POWDER);
                visible = trans && nm !== m && OPAQUE[nm] === 0;
              }
              const mi = j * CHUNK + i;
              if (!visible) {
                mask[mi] = 0;
                continue;
              }
              any = true;
              // AO from the air-side layer (q[a] = s + sgn)
              const nx = q[0], ny = q[1], nz = q[2];
              const nb = pidx(nx, ny, nz);
              const su = STRIDE[u], sv = STRIDE[v];
              for (let corner = 0; corner < 4; corner++) {
                const du = corner === 1 || corner === 2 ? su : -su;
                const dv = corner >= 2 ? sv : -sv;
                const o1 = OPAQUE[pad[nb + du]];
                const o2 = OPAQUE[pad[nb + dv]];
                const oc = OPAQUE[pad[nb + du + dv]];
                ao[corner] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
                maskAo[mi * 4 + corner] = ao[corner];
              }
              const sky = skyAt(nx, ny, nz);
              mask[mi] = (m + 1) | (ao[0] << 9) | (ao[1] << 11) | (ao[2] << 13) | (ao[3] << 15) | (sky << 17);
            }
          if (!any) continue;
          // greedy merge
          for (let j = 0; j < CHUNK; j++) {
            for (let i = 0; i < CHUNK; ) {
              const key = mask[j * CHUNK + i];
              if (key === 0) {
                i++;
                continue;
              }
              let w = 1;
              while (i + w < CHUNK && mask[j * CHUNK + i + w] === key) w++;
              let h = 1;
              outer: while (j + h < CHUNK) {
                for (let k = 0; k < w; k++) if (mask[(j + h) * CHUNK + i + k] !== key) break outer;
                h++;
              }
              const m = (key & 511) - 1;
              const mi = j * CHUNK + i;
              const sky = (key >> 17) & 1;
              ao[0] = maskAo[mi * 4];
              ao[1] = maskAo[mi * 4 + 1];
              ao[2] = maskAo[mi * 4 + 2];
              ao[3] = maskAo[mi * 4 + 3];
              // quad origin
              q[a] = dir === 0 ? s + 1 : s;
              q[u] = i;
              q[v] = j;
              const U = AX[u], V = AX[v];
              out.quad(q[0], q[1], q[2], U[0] * w, U[1] * w, U[2] * w, V[0] * h, V[1] * h, V[2] * h, normal, m, ao, sky, dir === 1);
              for (let y2 = 0; y2 < h; y2++) for (let x2 = 0; x2 < w; x2++) mask[(j + y2) * CHUNK + i + x2] = 0;
              i += w;
            }
          }
        }
      }
    }
  }

  // ---- points for gases and fire + emitter accumulation
  const gp: number[] = [], gi: number[] = [], fp: number[] = [], fi: number[] = [];
  let ex = 0, ey = 0, ez = 0, er = 0, eg = 0, eb = 0, ew = 0;
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const pi = pidx(x, y, z);
        const m = pad[pi];
        if (m === AIR) continue;
        const k = KIND[m];
        if (k === Kind.GAS) {
          gp.push(x, y, z);
          gi.push(m, padAux[pi]);
        } else if (k === Kind.FIRE) {
          fp.push(x, y, z);
          fi.push(m, padAux[pi]);
        }
        const burning = (padAux[pi] & 0x80) !== 0 && k !== Kind.GAS && k !== Kind.FIRE;
        const g = burning ? 0.8 : GLOW[m];
        if (g > 0) {
          // only count exposed emitters
          if (
            k === Kind.FIRE ||
            OPAQUE[pad[pi + 1]] === 0 || OPAQUE[pad[pi - 1]] === 0 || OPAQUE[pad[pi + P]] === 0 ||
            OPAQUE[pad[pi - P]] === 0 || OPAQUE[pad[pi + P2]] === 0 || OPAQUE[pad[pi - P2]] === 0
          ) {
            if (burning) {
              ex += x * g; ey += y * g; ez += z * g;
              er += 1.0 * g; eg += 0.55 * g; eb += 0.2 * g; ew += g;
            } else {
              const lc = LIGHT_RGB[m];
              ex += x * g; ey += y * g; ez += z * g;
              er += lc[0] * g; eg += lc[1] * g; eb += lc[2] * g; ew += g;
            }
          }
        }
      }
  const emitter = ew > 0.01
    ? { x: ox + ex / ew + 0.5, y: oy + ey / ew + 0.5, z: oz + ez / ew + 0.5, r: er / ew, g: eg / ew, b: eb / ew, strength: ew }
    : null;
  return {
    opaque: opaque.build(),
    translucent: trans.build(),
    gas: gp.length ? { pos: new Uint8Array(gp), info: new Uint8Array(gi), count: gp.length / 3 } : null,
    fire: fp.length ? { pos: new Uint8Array(fp), info: new Uint8Array(fi), count: fp.length / 3 } : null,
    emitter,
  };
}
