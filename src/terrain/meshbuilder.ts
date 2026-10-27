/**
 * Builds the vertex data of one cube-sphere quadtree node. Runs in workers.
 *
 * Per vertex:
 *   position (vec3, f32, relative to node centre — keeps float32 precise)
 *   normal   (vec3, planet-fixed frame)
 *   a0       (vec4: altitude above datum, rock, unit, moisture)
 *   a1       (vec4: temperature K, special, liquid depth, node arc length)
 *   morph    (vec3: offset to the parent-LOD surface, for geomorphing)
 *   detail   (vec3: planet-fixed position minus a per-node origin snapped to
 *             DETAIL_PERIOD, so periodic fragment noise is seamless & precise)
 */
import { SurfaceGenerator } from './surface';
import { faceToDir, nodeBounds, nodeArc } from './cubesphere';

export const GRID = 32; // segments per node edge
export const DETAIL_PERIOD = 4096; // metres; fragment detail noise period
export const VERTS_MAIN = (GRID + 1) * (GRID + 1);
export const VERTS_TOTAL = VERTS_MAIN + 4 * (GRID + 1);

export interface NodeMeshData {
  position: Float32Array;
  normal: Float32Array;
  a0: Float32Array;
  a1: Float32Array;
  morph: Float32Array;
  detail: Float32Array;
  /** displayed surface heights (m above radius, liquid-clamped) at the (GRID+1)² vertices */
  heights: Float32Array;
  center: [number, number, number];
  radius: number;
  minH: number;
  maxH: number;
}

/** Shared index buffer: grid triangles + double-sided skirts. */
export function buildIndices(): Uint32Array {
  const N = GRID, W = N + 1;
  const idx: number[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      idx.push(a, b, c, a, c, d);
    }
  // skirts: edge order bottom (j=0), right (i=N), top (j=N), left (i=0)
  const edges: number[][] = [[], [], [], []];
  for (let i = 0; i <= N; i++) edges[0].push(i);
  for (let j = 0; j <= N; j++) edges[1].push(j * W + N);
  for (let i = 0; i <= N; i++) edges[2].push(N * W + i);
  for (let j = 0; j <= N; j++) edges[3].push(j * W);
  let s = VERTS_MAIN;
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N; k++) {
      const a = edges[e][k], b = edges[e][k + 1], sa = s + k, sb = s + k + 1;
      idx.push(a, sa, b, b, sa, sb); // one winding
      idx.push(a, b, sa, b, sb, sa); // the other
    }
    s += N + 1;
  }
  return new Uint32Array(idx);
}

/**
 * parentHeights: optional (GRID/2+1)² displayed heights of the parent node over
 * this child's quadrant. When given, geomorph targets reproduce the parent mesh
 * exactly (no pop when the parent is swapped for its children) and those
 * samples need not be recomputed.
 */
export function buildNode(gen: SurfaceGenerator, face: number, level: number, ix: number, iy: number, parentHeights?: Float32Array): NodeMeshData {
  const N = GRID, W = N + 1, P = N + 3; // padded grid includes a 1-vertex border
  const R = gen.R;
  const { a0: fa0, b0: fb0, size } = nodeBounds(level, ix, iy);
  const step = size / N;
  const arc = nodeArc(level, R);
  const spacing = arc / N;
  const lambdaMin = spacing * 2.0;
  const sea = gen.liquidLevel();
  const hasSea = sea > -Infinity;

  // padded grid samples
  const px = new Float64Array(P * P * 3);
  const sh = new Float64Array(P * P); // surface height (after liquid clamp)
  const attrs = new Float32Array(W * W * 8);
  const dir = new Float64Array(3);
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < P; j++)
    for (let i = 0; i < P; i++) {
      const a = fa0 + (i - 1) * step, b = fb0 + (j - 1) * step;
      faceToDir(face, a, b, dir);
      const s = gen.sample(dir[0], dir[1], dir[2], lambdaMin);
      let h = s.height;
      let depth = 0;
      if (hasSea && h < sea) { depth = sea - h; h = sea; }
      const k = j * P + i;
      sh[k] = h;
      const r = R + h;
      px[k * 3] = dir[0] * r; px[k * 3 + 1] = dir[1] * r; px[k * 3 + 2] = dir[2] * r;
      if (i >= 1 && i <= N + 1 && j >= 1 && j <= N + 1) {
        const v = (j - 1) * W + (i - 1);
        const o = v * 8;
        attrs[o] = s.height - (hasSea ? sea : 0);
        attrs[o + 1] = s.rock; attrs[o + 2] = s.unit; attrs[o + 3] = s.moisture;
        attrs[o + 4] = s.temp; attrs[o + 5] = s.special; attrs[o + 6] = depth; attrs[o + 7] = arc;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }

  // node centre (planet-fixed, float64)
  const cIdx = ((N >> 1) + 1) * P + ((N >> 1) + 1);
  const cx = px[cIdx * 3], cy = px[cIdx * 3 + 1], cz = px[cIdx * 3 + 2];

  // morph targets: parent-LOD heights at even vertices
  const half = N >> 1;
  const parentLambda = lambdaMin * 2;
  const morphH = new Float64Array((half + 1) * (half + 1));
  if (parentHeights && parentHeights.length === morphH.length) morphH.set(parentHeights);
  else
    for (let j = 0; j <= half; j++)
      for (let i = 0; i <= half; i++) {
        faceToDir(face, fa0 + i * 2 * step, fb0 + j * 2 * step, dir);
        let h = gen.sample(dir[0], dir[1], dir[2], parentLambda).height;
        if (hasSea && h < sea) h = sea;
        morphH[j * (half + 1) + i] = h;
      }
  const evenPos = (i: number, j: number, out: number[]) => {
    faceToDir(face, fa0 + i * step, fb0 + j * step, dir);
    const r = R + morphH[(j >> 1) * (half + 1) + (i >> 1)];
    out[0] = dir[0] * r; out[1] = dir[1] * r; out[2] = dir[2] * r;
  };

  const total = VERTS_TOTAL;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const a0 = new Float32Array(total * 4);
  const a1 = new Float32Array(total * 4);
  const morph = new Float32Array(total * 3);
  const detail = new Float32Array(total * 3);
  const heights = new Float32Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) heights[j * W + i] = sh[(j + 1) * P + (i + 1)];
  const dox = Math.floor(cx / DETAIL_PERIOD) * DETAIL_PERIOD;
  const doy = Math.floor(cy / DETAIL_PERIOD) * DETAIL_PERIOD;
  const doz = Math.floor(cz / DETAIL_PERIOD) * DETAIL_PERIOD;

  let radius = 0;
  const e1 = [0, 0, 0], e2 = [0, 0, 0], t = [0, 0, 0];
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const v = j * W + i;
      const k = (j + 1) * P + (i + 1);
      const x = px[k * 3], y = px[k * 3 + 1], z = px[k * 3 + 2];
      position[v * 3] = x - cx; position[v * 3 + 1] = y - cy; position[v * 3 + 2] = z - cz;
      detail[v * 3] = x - dox; detail[v * 3 + 1] = y - doy; detail[v * 3 + 2] = z - doz;
      const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
      if (d2 > radius) radius = d2;
      // normal from central differences on the padded grid
      const kl = k - 1, kr = k + 1, kd = k - P, ku = k + P;
      const dxu = px[kr * 3] - px[kl * 3], dyu = px[kr * 3 + 1] - px[kl * 3 + 1], dzu = px[kr * 3 + 2] - px[kl * 3 + 2];
      const dxv = px[ku * 3] - px[kd * 3], dyv = px[ku * 3 + 1] - px[kd * 3 + 1], dzv = px[ku * 3 + 2] - px[kd * 3 + 2];
      let nx = dyu * dzv - dzu * dyv, ny = dzu * dxv - dxu * dzv, nz = dxu * dyv - dyu * dxv;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= nl; ny *= nl; nz *= nl;
      normal[v * 3] = nx; normal[v * 3 + 1] = ny; normal[v * 3 + 2] = nz;
      const o = v * 8;
      a0.set(attrs.subarray(o, o + 4), v * 4);
      a1.set(attrs.subarray(o + 4, o + 8), v * 4);
      // morph target
      const ie = (i & 1) === 0, je = (j & 1) === 0;
      if (ie && je) evenPos(i, j, t);
      else if (!ie && je) { evenPos(i - 1, j, e1); evenPos(i + 1, j, e2); t[0] = (e1[0] + e2[0]) / 2; t[1] = (e1[1] + e2[1]) / 2; t[2] = (e1[2] + e2[2]) / 2; }
      else if (ie && !je) { evenPos(i, j - 1, e1); evenPos(i, j + 1, e2); t[0] = (e1[0] + e2[0]) / 2; t[1] = (e1[1] + e2[1]) / 2; t[2] = (e1[2] + e2[2]) / 2; }
      else { evenPos(i - 1, j - 1, e1); evenPos(i + 1, j + 1, e2); t[0] = (e1[0] + e2[0]) / 2; t[1] = (e1[1] + e2[1]) / 2; t[2] = (e1[2] + e2[2]) / 2; }
      morph[v * 3] = t[0] - x; morph[v * 3 + 1] = t[1] - y; morph[v * 3 + 2] = t[2] - z;
    }

  // skirts: copies of edge vertices pushed down toward the planet centre
  const skirtDepth = Math.max(spacing * 3, (maxH - minH) * 0.1 + spacing);
  const edgeLists: number[][] = [[], [], [], []];
  for (let i = 0; i <= N; i++) edgeLists[0].push(i);
  for (let j = 0; j <= N; j++) edgeLists[1].push(j * W + N);
  for (let i = 0; i <= N; i++) edgeLists[2].push(N * W + i);
  for (let j = 0; j <= N; j++) edgeLists[3].push(j * W);
  let s = VERTS_MAIN;
  for (let e = 0; e < 4; e++)
    for (const v of edgeLists[e]) {
      const x = position[v * 3] + cx, y = position[v * 3 + 1] + cy, z = position[v * 3 + 2] + cz;
      const l = Math.sqrt(x * x + y * y + z * z);
      const f = (l - skirtDepth) / l;
      position[s * 3] = x * f - cx; position[s * 3 + 1] = y * f - cy; position[s * 3 + 2] = z * f - cz;
      detail[s * 3] = x * f - dox; detail[s * 3 + 1] = y * f - doy; detail[s * 3 + 2] = z * f - doz;
      normal.copyWithin(s * 3, v * 3, v * 3 + 3);
      a0.copyWithin(s * 4, v * 4, v * 4 + 4);
      a1.copyWithin(s * 4, v * 4, v * 4 + 4);
      morph.copyWithin(s * 3, v * 3, v * 3 + 3);
      s++;
    }

  return { position, normal, a0, a1, morph, detail, heights, center: [cx, cy, cz], radius: Math.sqrt(radius) + skirtDepth, minH, maxH };
}
