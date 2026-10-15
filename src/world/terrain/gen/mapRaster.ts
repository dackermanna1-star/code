// PUBG-style top-down map base raster: hillshaded relief, land colors blended from the splat weights,
// forest tint, water depth and contour lines. Roads and building footprints are drawn on top with Canvas2D at
// runtime (world/map/MapImage.ts).
import { CLS, CLS_CELL, MAP_RES, WORLD_SIZE } from '../TerrainData';
import { sampleBilinear } from './roadCarve';

/** Map colors per splat layer: grass, dry grass, forest floor, dirt, mud, rock, sand, gravel, field. */
const LAYER_COLORS = [
  [128, 150, 96],
  [152, 158, 104],
  [104, 124, 80],
  [156, 142, 108],
  [122, 114, 94],
  [142, 140, 130],
  [208, 196, 154],
  [162, 158, 148],
  [180, 162, 110],
];

export interface MapRasterInput {
  heights: Float32Array;
  splatA: Uint8Array;
  splatB: Uint8Array;
  tree: Uint8Array;
  pondLevels: Float32Array;
  ponds: { x: number; z: number; radius: number }[];
}

export function buildMapRaster(inp: MapRasterInput): Uint8ClampedArray {
  const { heights: h, splatA, splatB, tree, pondLevels, ponds } = inp;
  const R = MAP_RES;
  const px = WORLD_SIZE / R; // 1.5 m per pixel
  const out = new Uint8ClampedArray(R * R * 4);
  // heights at pixel centers (one bilinear sample per pixel; gradients/contours reuse them)
  const H = new Float32Array(R * R);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) H[y * R + x] = sampleBilinear(h, (x + 0.5) * px, (y + 0.5) * px);
  const lx = -0.55, ly = 0.62, lz = -0.55;
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const wts = new Float32Array(9);
  for (let y = 0; y < R; y++) {
    const z = (y + 0.5) * px;
    // classification grid coordinates (cell centers at (i+0.5)*CLS_CELL)
    const gz = Math.min(CLS - 1.001, Math.max(0, z / CLS_CELL - 0.5));
    const cj = gz | 0, tz = gz - cj;
    for (let x = 0; x < R; x++) {
      const wx = (x + 0.5) * px;
      const k = y * R + x;
      const hh = H[k];
      let water = hh < 0;
      let depth = -hh;
      for (let p = 0; p < ponds.length; p++) {
        const dxp = wx - ponds[p].x, dzp = z - ponds[p].z, rr = ponds[p].radius + 4;
        if (dxp * dxp + dzp * dzp < rr * rr && hh < pondLevels[p]) {
          water = true;
          depth = pondLevels[p] - hh;
        }
      }
      const o = k * 4;
      if (water) {
        const t = Math.min(1, Math.max(0, depth / 7));
        const tt = t * t * (3 - 2 * t);
        out[o] = 118 + (66 - 118) * tt;
        out[o + 1] = 160 + (110 - 160) * tt;
        out[o + 2] = 178 + (142 - 178) * tt;
        out[o + 3] = 255;
        continue;
      }
      // bilinear splat weights
      const gx = Math.min(CLS - 1.001, Math.max(0, wx / CLS_CELL - 0.5));
      const ci = gx | 0, tx = gx - ci;
      const c00 = cj * CLS + ci, c10 = c00 + 1, c01 = c00 + CLS, c11 = c01 + 1;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
      let sum = 0;
      for (let l = 0; l < 4; l++) {
        const a = (splatA[c00 * 4 + l] * w00 + splatA[c10 * 4 + l] * w10 + splatA[c01 * 4 + l] * w01 + splatA[c11 * 4 + l] * w11) / 255;
        const b = (splatB[c00 * 4 + l] * w00 + splatB[c10 * 4 + l] * w10 + splatB[c01 * 4 + l] * w01 + splatB[c11 * 4 + l] * w11) / 255;
        wts[1 + l] = a;
        wts[5 + l] = b;
        sum += a + b;
      }
      wts[0] = Math.max(0, 1 - sum);
      let r0 = 0, g0 = 0, b0 = 0;
      for (let l = 0; l < 9; l++) {
        const c = LAYER_COLORS[l];
        r0 += c[0] * wts[l];
        g0 += c[1] * wts[l];
        b0 += c[2] * wts[l];
      }
      const tr = (tree[c00] * w00 + tree[c10] * w10 + tree[c01] * w01 + tree[c11] * w11) / 255;
      const tf = Math.min(1, tr * 1.1) * 0.75;
      r0 += (78 - r0) * tf;
      g0 += (102 - g0) * tf;
      b0 += (64 - b0) * tf;
      // hillshade
      const xl = x > 0 ? k - 1 : k, xr = x < R - 1 ? k + 1 : k;
      const yu = y > 0 ? k - R : k, yd = y < R - 1 ? k + R : k;
      const ddx = (H[xr] - H[xl]) / ((xr - xl || 1) * px);
      const ddz = (H[yd] - H[yu]) / (((yd - yu) / R || 1) * px);
      const nx = -ddx * 1.6, nz = -ddz * 1.6;
      const nl = Math.sqrt(nx * nx + 1 + nz * nz);
      const shade = 0.72 + 0.8 * ((nx * lx + ly + nz * lz) / (nl * ll) - 0.62);
      const el = Math.min(1, Math.max(0, hh / 110));
      const s = Math.max(0.35, Math.min(1.35, shade));
      let cr = (r0 + el * 18) * s, cg = (g0 + el * 8) * s, cb = (b0 + el * 2) * s;
      // contour lines every 20 m (thin, subtle)
      if (hh > 1 && x > 0 && y > 0) {
        const kk = Math.floor(hh / 20);
        if (kk !== Math.floor(H[k - 1] / 20) || kk !== Math.floor(H[k - R] / 20)) {
          cr *= 0.86;
          cg *= 0.86;
          cb *= 0.86;
        }
      }
      out[o] = cr;
      out[o + 1] = cg;
      out[o + 2] = cb;
      out[o + 3] = 255;
    }
  }
  return out;
}
