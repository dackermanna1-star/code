/** Cube-sphere face frames and the tangent-warped cube→sphere mapping. */

// face normal n, axis u, axis v with u × v = n (outward winding)
export const FACES: readonly { n: number[]; u: number[]; v: number[] }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const QPI = Math.PI / 4;

/** Map face coords (a, b) ∈ [-1, 1]² to a unit direction. Writes into out[0..2]. */
export function faceToDir(face: number, a: number, b: number, out: Float64Array | number[], o = 0) {
  const F = FACES[face];
  const ta = Math.tan(a * QPI), tb = Math.tan(b * QPI);
  const x = F.n[0] + F.u[0] * ta + F.v[0] * tb;
  const y = F.n[1] + F.u[1] * ta + F.v[1] * tb;
  const z = F.n[2] + F.u[2] * ta + F.v[2] * tb;
  const l = 1 / Math.sqrt(x * x + y * y + z * z);
  out[o] = x * l; out[o + 1] = y * l; out[o + 2] = z * l;
}

/** Node face-coordinate bounds at quadtree level/indices. */
export function nodeBounds(level: number, ix: number, iy: number) {
  const n = 1 << level;
  const size = 2 / n;
  return { a0: -1 + ix * size, b0: -1 + iy * size, size };
}

/** Approximate arc length (m) of a node edge for a sphere of radius R. */
export function nodeArc(level: number, R: number) {
  return (Math.PI / 2) * R / (1 << level);
}
