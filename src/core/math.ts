export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const fract = (x: number) => x - Math.floor(x);
export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const DEG = Math.PI / 180;

/** Packs chunk coordinates into a single number key (supports |c| < 2^20). */
export const chunkKey = (cx: number, cz: number) => (cx + 0x100000) * 0x200000 + (cz + 0x100000);
export const chunkKeyX = (k: number) => Math.floor(k / 0x200000) - 0x100000;
export const chunkKeyZ = (k: number) => (k % 0x200000) - 0x100000;

/** Packs a block position into a single safe integer key (|x|,|z| < 2^24, 0<=y<4096). */
export const blockKey = (x: number, y: number, z: number) =>
  ((x + 0x800000) * 0x1000000 + (z + 0x800000)) * 4096 + y;
export function unpackBlockKey(k: number): [number, number, number] {
  const y = k % 4096;
  const r = (k - y) / 4096;
  const z = (r % 0x1000000) - 0x800000;
  const x = Math.floor(r / 0x1000000) - 0x800000;
  return [x, y, z];
}

/** Integer hash (deterministic, 32-bit). */
export function hash32(x: number): number {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
export function hash3(x: number, y: number, z: number, seed = 0): number {
  return hash32(Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca77));
}
export function hash2(x: number, z: number, seed = 0): number {
  return hash32(Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca77));
}
/** Hash -> float in [0,1). */
export const hashToFloat = (h: number) => (h >>> 8) / 16777216;
