// Thin sheet props shared by several generators: flattened cardboard, plywood.
import { VB, mat, MCLS, VS_FINE, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, vrand } from './kit.js';

/**
 * One flattened cardboard box sheet lying in the XZ plane (thickness 1 voxel, curled edges,
 * fold creases, print marks, wet stains). Origin: centre of the sheet, y = 0 underside.
 * opts: w, d (meters), wet 0..1, curl (voxels), vs
 */
export function cardboardSheet(rng, opts = {}) {
  const vs = opts.vs ?? VS_FINE;
  const w = opts.w ?? rng.range(0.5, 1.0), d = opts.d ?? rng.range(0.35, 0.7);
  const curl = opts.curl ?? rng.int(0, 3);
  const wet = opts.wet ?? rng.range(0, 1);
  const nx = Math.max(4, Math.round(w / vs)), nz = Math.max(4, Math.round(d / vs));
  const ny = 2 + curl + 1;
  const b = new VB(nx, ny, nz, vs, 'floor');
  const P = b.P;
  const base = rgbJitter(rng, rng.chance(0.15) ? [176, 160, 132] : COL.cardboard, 0.08);
  const board = mat.cardboard(P, 'board', base);
  const wetC = mat.cardboard(P, 'wet', rgbMul(rgbMix(base, [90, 66, 44], 0.5), 0.8), { rough: 0.6 });
  const crease = mat.cardboard(P, 'crease', rgbMul(base, 0.78));
  const ink = mat.cardboard(P, 'ink', rng.pick([[40, 40, 44], [120, 40, 34], [40, 64, 110], [60, 60, 54]]), { vari: 0.05 });
  const tape = mat.plastic(P, 'tape', rng.pick([[176, 140, 92], [196, 192, 180], [150, 120, 70]]), { rough: 0.3 });
  const seed = rng.int(1, 1e6);
  // fold lines (box panels)
  const folds = [];
  let fx = rng.range(0.2, 0.35) * nx;
  while (fx < nx - 3) {
    folds.push(Math.round(fx));
    fx += rng.range(0.22, 0.45) * nx;
  }
  const flap = Math.round(rng.range(0.15, 0.25) * nz);
  // print blocks
  const prints = [];
  for (let i = 0, n = rng.int(0, 3); i < n; i++) prints.push([rng.int(2, nx - 8), rng.int(2, nz - 6), rng.int(3, 9), rng.int(2, 4)]);
  const tapeRow = rng.chance(0.6) ? rng.int(2, nz - 3) : -1;
  const curlSide = rng.int(0, 3);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      // ragged / torn corners
      const corner = Math.min(x, nx - 1 - x) + Math.min(z, nz - 1 - z);
      if (corner < 2 && rng.chance(0.6)) continue;
      if (valueNoise2(x * 0.3, z * 0.3, seed) > 0.9 && (x < 3 || z < 3 || x > nx - 4 || z > nz - 4)) continue;
      // curl near one edge
      let h = 0;
      const e = curlSide === 0 ? x : curlSide === 1 ? nx - 1 - x : curlSide === 2 ? z : nz - 1 - z;
      if (curl > 0 && e < curl * 3) h = Math.round(((curl * 3 - e) / (curl * 3)) ** 2 * curl);
      h += Math.round((valueNoise2(x * 0.08, z * 0.08, seed + 1) - 0.5) * 1.2);
      h = Math.max(0, Math.min(ny - 2, h));
      let v = board;
      if (folds.includes(x) || z === flap || z === nz - flap) v = crease;
      for (const p of prints) if (x >= p[0] && x < p[0] + p[2] && z >= p[1] && z < p[1] + p[3] && vrand(x, 0, z, seed) < 0.75) v = ink;
      if (z === tapeRow || z === tapeRow + 1) v = tape;
      const wn = fbm2(x * 0.06, z * 0.06, 2, seed + 2);
      if (wn < wet * 0.75 - 0.05) v = wetC;
      b.set(x, h, z, v);
    }
  return { model: b.model(), meta: { size: b.sizeM(), footprint: [w, d], kind: 'cardboardSheet' } };
}
