/**
 * Tileable 3D noise volume (R8, SIZE³) for the raymarched storm volumes: three octaves of
 * periodic value noise with a slightly billowy remap. Generated incrementally (a few slices
 * per call, ~2-3 ms) so creating a tornado never stalls a frame; the raw data is cached for
 * the session, the GPU texture belongs to its owner and is disposed with it.
 */
import * as THREE from 'three';

export const NOISE_SIZE = 64;
const OCTAVES: [number, number][] = [
  [4, 0.55],
  [8, 0.3],
  [16, 0.15],
];

let cached: Uint8Array | null = null;

function lattice(period: number, seed: number): Float32Array {
  const n = period * period * period;
  const a = new Float32Array(n);
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    a[i] = s / 4294967296;
  }
  return a;
}

export class NoiseVolume {
  readonly texture: THREE.Data3DTexture;
  private data: Uint8Array;
  private z = 0;
  private lat: Float32Array[] = [];
  constructor() {
    const N = NOISE_SIZE;
    this.data = cached ?? new Uint8Array(N * N * N);
    if (cached) this.z = N;
    else this.lat = OCTAVES.map(([p], i) => lattice(p, 1234 + i * 77));
    const tex = new THREE.Data3DTexture(this.data, N, N, N);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.unpackAlignment = 1;
    tex.generateMipmaps = false;
    tex.needsUpdate = this.z >= N;
    this.texture = tex;
  }

  get ready() {
    return this.z >= NOISE_SIZE;
  }

  /** Generate up to `slices` z-slices; uploads the texture when complete. Returns `ready`. */
  step(slices = 6): boolean {
    const N = NOISE_SIZE;
    if (this.z >= N) return true;
    const d = this.data;
    const end = Math.min(N, this.z + slices);
    for (let z = this.z; z < end; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          let v = 0;
          for (let o = 0; o < OCTAVES.length; o++) {
            const [P, amp] = OCTAVES[o];
            const L = this.lat[o];
            const f = P / N;
            const fx = x * f, fy = y * f, fz = z * f;
            const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
            let tx = fx - ix, ty = fy - iy, tz = fz - iz;
            tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); tz = tz * tz * (3 - 2 * tz);
            const x0 = ix % P, x1 = (ix + 1) % P, y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P, z0 = (iz % P) * P * P, z1 = ((iz + 1) % P) * P * P;
            const c00 = L[x0 + y0 + z0] + (L[x1 + y0 + z0] - L[x0 + y0 + z0]) * tx;
            const c10 = L[x0 + y1 + z0] + (L[x1 + y1 + z0] - L[x0 + y1 + z0]) * tx;
            const c01 = L[x0 + y0 + z1] + (L[x1 + y0 + z1] - L[x0 + y0 + z1]) * tx;
            const c11 = L[x0 + y1 + z1] + (L[x1 + y1 + z1] - L[x0 + y1 + z1]) * tx;
            const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
            v += (c0 + (c1 - c0) * tz) * amp;
          }
          // billowy remap: puffy cores, wispy gaps
          v = Math.min(1, Math.max(0, (v - 0.22) / 0.56));
          v = v * v * (3 - 2 * v);
          d[x + y * N + z * N * N] = Math.round(v * 255);
        }
      }
    }
    this.z = end;
    if (this.z >= N) {
      cached = d;
      this.lat = [];
      this.texture.needsUpdate = true;
    }
    return this.z >= N;
  }

  dispose() {
    this.texture.dispose();
  }
}
