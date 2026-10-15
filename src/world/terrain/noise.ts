// Fast seeded 2D gradient noise (Perlin "improved") + fBm / ridged / domain-warp helpers.
// Pure JS so it runs in the terrain worker and in node tests.

export class Noise2D {
  private perm = new Uint8Array(512);
  private gx = new Float32Array(16);
  private gz = new Float32Array(16);

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = (seed >>> 0) || 1;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.3;
      this.gx[i] = Math.cos(a);
      this.gz[i] = Math.sin(a);
    }
  }

  /** Gradient noise in about [-0.7, 0.7]. */
  noise(x: number, z: number): number {
    const xf = Math.floor(x), zf = Math.floor(z);
    const X = xf & 255, Z = zf & 255;
    const fx = x - xf, fz = z - zf;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const perm = this.perm, gx = this.gx, gz = this.gz;
    const aa = perm[perm[X] + Z] & 15;
    const ab = perm[perm[X] + Z + 1] & 15;
    const ba = perm[perm[X + 1] + Z] & 15;
    const bb = perm[perm[X + 1] + Z + 1] & 15;
    const n00 = gx[aa] * fx + gz[aa] * fz;
    const n10 = gx[ba] * (fx - 1) + gz[ba] * fz;
    const n01 = gx[ab] * fx + gz[ab] * (fz - 1);
    const n11 = gx[bb] * (fx - 1) + gz[bb] * (fz - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  /** Fractal Brownian motion, roughly [-1, 1]. `scale` = base wavelength in meters. */
  fbm(x: number, z: number, scale: number, octaves: number, gain = 0.5, lacunarity = 2.03): number {
    let f = 1 / scale, a = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * this.noise(x * f + o * 17.31, z * f - o * 9.73);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return (sum / norm) * 1.6;
  }

  /** Ridged multifractal, roughly [0, 1] with sharp crests. */
  ridged(x: number, z: number, scale: number, octaves: number): number {
    let f = 1 / scale, a = 1, sum = 0, norm = 0, w = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise(x * f + o * 31.7, z * f + o * 11.1) * 1.5);
      n *= n;
      n *= w;
      w = Math.min(1, n * 2);
      sum += n * a;
      norm += a;
      a *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
}

/** Tileable value noise on an integer lattice of period `period` (for procedural textures). */
export function tileableNoise(n: Noise2D, x: number, z: number, period: number): number {
  // Blend 4 samples of the infinite noise to make it periodic.
  const u = x / period, v = z / period;
  const a = n.noise(x, z), b = n.noise(x - period, z), c = n.noise(x, z - period), d = n.noise(x - period, z - period);
  const fu = u - Math.floor(u), fv = v - Math.floor(v);
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}
