// ChunkMesher: greedy meshing with per-vertex ambient occlusion and a sky-visibility bit.
// Produces compact Uint8 vertex streams. Opaque solids and translucent materials (liquids, ice, glass)
// are separate layers; gases and fire are emitted as point sprites.
// Hot loops use precomputed strides and preallocated typed arrays (no per-face allocations).
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
const skyCol = new Int16Array(P * P); // per (x,z): lowest padded y that sees the sky (999 = none)
const STRIDE = [1, P2, P]; // padded index stride for x, y, z

/** 1 if a material is drawn in the translucent layer */
const TRANSLUCENT = new Uint8Array(256);
MATERIALS.forEach((m, i) => {
  const k = m.kind;
  TRANSLUCENT[i] = i !== AIR && !OPAQUE[i] && (k === Kind.LIQUID || k === Kind.SOLID || k === Kind.POWDER) ? 1 : 0;
});

const LIGHT_RGB: [number, number, number][] = MATERIALS.map((m) => {
  const c = hexToRgb(m.light ?? m.colors[0]);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
});
const BURN_RGB: [number, number, number] = [1.0, 0.55, 0.2];

function pidx(x: number, y: number, z: number): number {
  return (y + 1) * P2 + (z + 1) * P + (x + 1);
}

const MAX_QUADS = CHUNK * CHUNK * CHUNK * 3;

class Builder {
  pos = new Uint8Array(MAX_QUADS * 4 * 3);
  info = new Uint8Array(MAX_QUADS * 4 * 2);
  index = new Uint32Array(MAX_QUADS * 6);
  n = 0;
  ni = 0;
  reset(): void {
    this.n = 0;
    this.ni = 0;
  }
  quad(
    x0: number, y0: number, z0: number,
    ux: number, uy: number, uz: number,
    vx: number, vy: number, vz: number,
    packedBase: number, mat: number, a0: number, a1: number, a2: number, a3: number, flipWinding: boolean,
  ): void {
    const base = this.n;
    const p = this.pos, f = this.info;
    const o = base * 3, q = base * 2;
    p[o] = x0; p[o + 1] = y0; p[o + 2] = z0;
    p[o + 3] = x0 + ux; p[o + 4] = y0 + uy; p[o + 5] = z0 + uz;
    p[o + 6] = x0 + ux + vx; p[o + 7] = y0 + uy + vy; p[o + 8] = z0 + uz + vz;
    p[o + 9] = x0 + vx; p[o + 10] = y0 + vy; p[o + 11] = z0 + vz;
    f[q] = packedBase | (a0 << 3); f[q + 1] = mat;
    f[q + 2] = packedBase | (a1 << 3); f[q + 3] = mat;
    f[q + 4] = packedBase | (a2 << 3); f[q + 5] = mat;
    f[q + 6] = packedBase | (a3 << 3); f[q + 7] = mat;
    this.n += 4;
    const idx = this.index;
    const oi = this.ni;
    // flip the diagonal to keep AO interpolation isotropic
    let t0: number, t1: number, t2: number, t3: number, t4: number, t5: number;
    if (a0 + a2 >= a1 + a3) {
      t0 = 0; t1 = 1; t2 = 2; t3 = 0; t4 = 2; t5 = 3;
    } else {
      t0 = 1; t1 = 2; t2 = 3; t3 = 1; t4 = 3; t5 = 0;
    }
    if (flipWinding) {
      const s1 = t1; t1 = t2; t2 = s1;
      const s2 = t4; t4 = t5; t5 = s2;
    }
    idx[oi] = base + t0; idx[oi + 1] = base + t1; idx[oi + 2] = base + t2;
    idx[oi + 3] = base + t3; idx[oi + 4] = base + t4; idx[oi + 5] = base + t5;
    this.ni += 6;
  }
  build(): LayerData | null {
    if (this.n === 0) return null;
    const vc = this.n, ic = this.ni;
    let index: Uint16Array | Uint32Array;
    if (vc > 65535) index = this.index.slice(0, ic);
    else {
      index = new Uint16Array(ic);
      for (let i = 0; i < ic; i++) index[i] = this.index[i];
    }
    return { pos: this.pos.slice(0, vc * 3), info: this.info.slice(0, vc * 2), index, vertexCount: vc, indexCount: ic };
  }
}

const opaqueB = new Builder();
const transB = new Builder();
const mask = new Int32Array(CHUNK * CHUNK);
const maskAo = new Uint8Array(CHUNK * CHUNK * 4);
const AXV = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const EMPTY: ChunkMeshData = { opaque: null, translucent: null, gas: null, fire: null, emitter: null };

export function meshChunk(world: VoxelWorld, c: Chunk): ChunkMeshData {
  const ox = c.ox, oy = c.oy, oz = c.oz;
  const mat = c.mat;
  const aux = c.aux;
  // ---- interior
  let anyNonAir = false, anyTrans = false, anyNonOpaque = false;
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++) {
      const li = (y << 8) | (z << 4);
      const pi = pidx(0, y, z);
      for (let x = 0; x < CHUNK; x++) {
        const m = mat[li + x];
        pad[pi + x] = m;
        padAux[pi + x] = aux ? aux[li + x] : 0;
        if (m !== AIR) anyNonAir = true;
        if (TRANSLUCENT[m]) anyTrans = true;
        if (!OPAQUE[m]) anyNonOpaque = true;
      }
    }
  if (!anyNonAir) return EMPTY;
  // ---- border shell from neighbours
  let borderOpen = false;
  for (let y = -1; y <= CHUNK; y++)
    for (let z = -1; z <= CHUNK; z++) {
      const interiorRow = y >= 0 && y < CHUNK && z >= 0 && z < CHUNK;
      for (let x = -1; x <= CHUNK; x++) {
        if (interiorRow && x === 0) x = CHUNK; // skip the interior
        const m = world.get(ox + x, oy + y, oz + z);
        const pi = pidx(x, y, z);
        pad[pi] = m;
        padAux[pi] = 0;
        if (!borderOpen && !OPAQUE[m]) {
          const edges = (x < 0 || x >= CHUNK ? 1 : 0) + (y < 0 || y >= CHUNK ? 1 : 0) + (z < 0 || z >= CHUNK ? 1 : 0);
          if (edges === 1) borderOpen = true;
        }
      }
    }
  // fast path: buried chunks have no visible faces
  if (!anyNonOpaque && !borderOpen) return EMPTY;

  // ---- sky visibility per column (only near the surface)
  const nearSurface = oy + CHUNK > SURFACE_Y - 48;
  if (nearSurface) {
    for (let z = -1; z <= CHUNK; z++)
      for (let x = -1; x <= CHUNK; x++) {
        let blocked = false;
        for (let y = oy + CHUNK + 40; y > oy + CHUNK; y--) {
          if (OPAQUE[world.get(ox + x, y, oz + z)]) {
            blocked = true;
            break;
          }
        }
        let lowest = 999;
        if (!blocked) {
          lowest = CHUNK + 1;
          for (let y = CHUNK; y >= -1; y--) {
            if (OPAQUE[pad[pidx(x, y, z)]]) break;
            lowest = y;
          }
        }
        skyCol[(z + 1) * P + (x + 1)] = lowest;
      }
  }

  opaqueB.reset();
  transB.reset();
  const passes = anyTrans ? 2 : 1;
  const origin = pidx(0, 0, 0);
  for (let pass = 0; pass < passes; pass++) {
    const out = pass === 0 ? opaqueB : transB;
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3, v = (a + 2) % 3;
      const sa = STRIDE[a], su = STRIDE[u], sv = STRIDE[v];
      const U = AXV[u], V = AXV[v];
      for (let dir = 0; dir < 2; dir++) {
        const sgn = dir === 0 ? 1 : -1;
        const nOff = sgn * sa;
        const normal = a * 2 + dir; // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
        for (let s = 0; s < CHUNK; s++) {
          let any = false;
          const sliceBase = origin + s * sa;
          for (let j = 0; j < CHUNK; j++) {
            const rowBase = sliceBase + j * sv;
            for (let i = 0; i < CHUNK; i++) {
              const ci = rowBase + i * su;
              const m = pad[ci];
              const mi = j * CHUNK + i;
              const nb = ci + nOff;
              const nm = pad[nb];
              const visible = pass === 0 ? OPAQUE[m] === 1 && OPAQUE[nm] === 0 : TRANSLUCENT[m] === 1 && nm !== m && OPAQUE[nm] === 0;
              if (!visible) {
                mask[mi] = 0;
                continue;
              }
              any = true;
              const o1a = OPAQUE[pad[nb - su]], o1b = OPAQUE[pad[nb + su]];
              const o2a = OPAQUE[pad[nb - sv]], o2b = OPAQUE[pad[nb + sv]];
              // corners: 0 (-u,-v) 1 (+u,-v) 2 (+u,+v) 3 (-u,+v)
              const c0 = o1a && o2a ? 0 : 3 - (o1a + o2a + OPAQUE[pad[nb - su - sv]]);
              const c1 = o1b && o2a ? 0 : 3 - (o1b + o2a + OPAQUE[pad[nb + su - sv]]);
              const c2 = o1b && o2b ? 0 : 3 - (o1b + o2b + OPAQUE[pad[nb + su + sv]]);
              const c3 = o1a && o2b ? 0 : 3 - (o1a + o2b + OPAQUE[pad[nb - su + sv]]);
              const m4 = mi * 4;
              maskAo[m4] = c0;
              maskAo[m4 + 1] = c1;
              maskAo[m4 + 2] = c2;
              maskAo[m4 + 3] = c3;
              let sky = 0;
              if (nearSurface) {
                const ax = a === 0 ? s + sgn : u === 0 ? i : j;
                const ay = a === 1 ? s + sgn : u === 1 ? i : j;
                const az = a === 2 ? s + sgn : u === 2 ? i : j;
                sky = ay >= skyCol[(az + 1) * P + (ax + 1)] ? 1 : 0;
              }
              mask[mi] = (m + 1) | (c0 << 9) | (c1 << 11) | (c2 << 13) | (c3 << 15) | (sky << 17);
            }
          }
          if (!any) continue;
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
                const rb = (j + h) * CHUNK + i;
                for (let k = 0; k < w; k++) if (mask[rb + k] !== key) break outer;
                h++;
              }
              const m = (key & 511) - 1;
              const m4 = (j * CHUNK + i) * 4;
              const sky = (key >> 17) & 1;
              const qa = dir === 0 ? s + 1 : s;
              const X = a === 0 ? qa : u === 0 ? i : j;
              const Y = a === 1 ? qa : u === 1 ? i : j;
              const Z = a === 2 ? qa : u === 2 ? i : j;
              out.quad(X, Y, Z, U[0] * w, U[1] * w, U[2] * w, V[0] * h, V[1] * h, V[2] * h, normal | (sky << 5), m, maskAo[m4], maskAo[m4 + 1], maskAo[m4 + 2], maskAo[m4 + 3], dir === 1);
              for (let y2 = 0; y2 < h; y2++) {
                const rb = (j + y2) * CHUNK + i;
                for (let x2 = 0; x2 < w; x2++) mask[rb + x2] = 0;
              }
              i += w;
            }
          }
        }
      }
    }
  }

  // ---- gas/fire points and light emitter cluster
  const gp: number[] = [], gi: number[] = [], fp: number[] = [], fi: number[] = [];
  let ex = 0, ey = 0, ez = 0, er = 0, eg = 0, eb = 0, ew = 0;
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++) {
      const rb = pidx(0, y, z);
      for (let x = 0; x < CHUNK; x++) {
        const pi = rb + x;
        const m = pad[pi];
        if (m === AIR) continue;
        const ax = padAux[pi];
        const g0 = GLOW[m];
        if (g0 === 0 && ax === 0 && OPAQUE[m]) continue;
        const k = KIND[m];
        if (k === Kind.GAS) {
          gp.push(x, y, z);
          gi.push(m, ax);
        } else if (k === Kind.FIRE) {
          fp.push(x, y, z);
          fi.push(m, ax);
        }
        const burning = (ax & 0x80) !== 0 && k !== Kind.GAS && k !== Kind.FIRE;
        const g = burning ? 0.8 : g0;
        if (g > 0) {
          if (
            k === Kind.FIRE ||
            OPAQUE[pad[pi + 1]] === 0 || OPAQUE[pad[pi - 1]] === 0 || OPAQUE[pad[pi + P]] === 0 ||
            OPAQUE[pad[pi - P]] === 0 || OPAQUE[pad[pi + P2]] === 0 || OPAQUE[pad[pi - P2]] === 0
          ) {
            const lc = burning ? BURN_RGB : LIGHT_RGB[m];
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
    opaque: opaqueB.build(),
    translucent: passes > 1 ? transB.build() : null,
    gas: gp.length ? { pos: new Uint8Array(gp), info: new Uint8Array(gi), count: gp.length / 3 } : null,
    fire: fp.length ? { pos: new Uint8Array(fp), info: new Uint8Array(fi), count: fp.length / 3 } : null,
    emitter,
  };
}
