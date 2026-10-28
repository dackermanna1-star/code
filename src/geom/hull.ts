// Robust 3D convex hull: incremental quickhull with conflict (outside) sets, tolerance-based
// visibility, horizon repair for numerically non-disc visible regions, and a final merge of
// coplanar triangles into convex polygons (collinear edge vertices removed). PURE.

import type { Vec3 } from "./vec.ts";

export interface HullFace {
  /** Vertex indices into HullResult.verts, CCW seen from outside. */
  idx: number[];
  /** Outward unit normal. */
  n: Vec3;
  d: number;
}

export interface HullResult {
  /** Hull vertices (exact copies of input points). */
  verts: Vec3[];
  /** Index of each hull vertex in the input array. */
  src: number[];
  faces: HullFace[];
}

export interface HullOptions {
  /** Visibility tolerance (m). Default 1e-10 × scale. */
  visEps?: number;
  /** Coplanarity tolerance for merging triangles into polygons (m). Default 1e-8 × scale. */
  mergeEps?: number;
}

/**
 * Convex hull of `points`. Returns null when the points do not span a volume (fewer than 4
 * non-coplanar points within tolerance).
 */
export function quickHull(points: readonly Vec3[], opts: HullOptions = {}): HullResult | null {
  // ---- gather finite points
  const src: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) src.push(i);
  }
  const n = src.length;
  if (n < 4) return null;
  const P = new Float64Array(n * 3);
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = points[src[i]];
    P[3 * i] = p.x;
    P[3 * i + 1] = p.y;
    P[3 * i + 2] = p.z;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  const scale = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-12);
  const visEps = opts.visEps ?? Math.max(1e-10 * scale, 1e-14);
  const mergeEps = opts.mergeEps ?? Math.max(1e-8 * scale, 1e-13);

  // ---- initial simplex
  const ext = [0, 0, 0, 0, 0, 0];
  for (let i = 1; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      if (P[3 * i + a] < P[3 * ext[2 * a] + a]) ext[2 * a] = i;
      if (P[3 * i + a] > P[3 * ext[2 * a + 1] + a]) ext[2 * a + 1] = i;
    }
  }
  let i0 = 0,
    i1 = 0,
    best = -1;
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      const d2 = dist2(P, ext[a], ext[b]);
      if (d2 > best) {
        best = d2;
        i0 = ext[a];
        i1 = ext[b];
      }
    }
  }
  if (best <= visEps * visEps) return null;
  // farthest from line i0-i1
  const lx = P[3 * i1] - P[3 * i0],
    ly = P[3 * i1 + 1] - P[3 * i0 + 1],
    lz = P[3 * i1 + 2] - P[3 * i0 + 2];
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  let i2 = -1;
  best = -1;
  for (let i = 0; i < n; i++) {
    const dx = P[3 * i] - P[3 * i0],
      dy = P[3 * i + 1] - P[3 * i0 + 1],
      dz = P[3 * i + 2] - P[3 * i0 + 2];
    const cx = dy * lz - dz * ly,
      cy = dz * lx - dx * lz,
      cz = dx * ly - dy * lx;
    const d = Math.sqrt(cx * cx + cy * cy + cz * cz) / ll;
    if (d > best) {
      best = d;
      i2 = i;
    }
  }
  if (best <= visEps) return null;
  // farthest from plane i0,i1,i2
  let pnx: number, pny: number, pnz: number;
  {
    const ax = P[3 * i1] - P[3 * i0],
      ay = P[3 * i1 + 1] - P[3 * i0 + 1],
      az = P[3 * i1 + 2] - P[3 * i0 + 2];
    const bx = P[3 * i2] - P[3 * i0],
      by = P[3 * i2 + 1] - P[3 * i0 + 1],
      bz = P[3 * i2 + 2] - P[3 * i0 + 2];
    pnx = ay * bz - az * by;
    pny = az * bx - ax * bz;
    pnz = ax * by - ay * bx;
    const l = Math.sqrt(pnx * pnx + pny * pny + pnz * pnz);
    pnx /= l;
    pny /= l;
    pnz /= l;
  }
  const pd = pnx * P[3 * i0] + pny * P[3 * i0 + 1] + pnz * P[3 * i0 + 2];
  let i3 = -1;
  best = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(pnx * P[3 * i] + pny * P[3 * i + 1] + pnz * P[3 * i + 2] - pd);
    if (d > best) {
      best = d;
      i3 = i;
    }
  }
  if (best <= visEps) return null;

  // ---- face storage
  const FV: number[] = []; // 3 vertex ids per face
  const FA: number[] = []; // 3 neighbour faces per face (edge k = v_k → v_k+1)
  const FN: number[] = []; // nx, ny, nz, d
  const alive: number[] = [];
  const outside: Array<number[] | null> = [];
  const mark: number[] = [];

  const addFace = (a: number, b: number, c: number, hint: number): number => {
    const f = alive.length;
    FV.push(a, b, c);
    FA.push(-1, -1, -1);
    const ax = P[3 * b] - P[3 * a],
      ay = P[3 * b + 1] - P[3 * a + 1],
      az = P[3 * b + 2] - P[3 * a + 2];
    const bx = P[3 * c] - P[3 * a],
      by = P[3 * c + 1] - P[3 * a + 1],
      bz = P[3 * c + 2] - P[3 * a + 2];
    let nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l > 1e-300 && l > 1e-24 * scale * scale) {
      nx /= l;
      ny /= l;
      nz /= l;
    } else if (hint >= 0) {
      nx = FN[4 * hint];
      ny = FN[4 * hint + 1];
      nz = FN[4 * hint + 2];
    } else {
      nx = 0;
      ny = 0;
      nz = 0;
    }
    const d = (nx * (P[3 * a] + P[3 * b] + P[3 * c]) + ny * (P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) + nz * (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2])) / 3;
    FN.push(nx, ny, nz, d);
    alive.push(1);
    outside.push(null);
    mark.push(0);
    return f;
  };
  const dist = (f: number, i: number): number => FN[4 * f] * P[3 * i] + FN[4 * f + 1] * P[3 * i + 1] + FN[4 * f + 2] * P[3 * i + 2] - FN[4 * f + 3];

  // tetrahedron, each face oriented away from the tetra centroid
  const tet = [i0, i1, i2, i3];
  const tcx = (P[3 * i0] + P[3 * i1] + P[3 * i2] + P[3 * i3]) / 4;
  const tcy = (P[3 * i0 + 1] + P[3 * i1 + 1] + P[3 * i2 + 1] + P[3 * i3 + 1]) / 4;
  const tcz = (P[3 * i0 + 2] + P[3 * i1 + 2] + P[3 * i2 + 2] + P[3 * i3 + 2]) / 4;
  const tf = [
    [0, 1, 2],
    [0, 3, 1],
    [1, 3, 2],
    [0, 2, 3],
  ];
  for (const t of tf) {
    const a = tet[t[0]],
      b = tet[t[1]],
      c = tet[t[2]];
    const f = addFace(a, b, c, -1);
    if (FN[4 * f] * tcx + FN[4 * f + 1] * tcy + FN[4 * f + 2] * tcz - FN[4 * f + 3] > 0) {
      // flip
      FV[3 * f + 1] = c;
      FV[3 * f + 2] = b;
      FN[4 * f] = -FN[4 * f];
      FN[4 * f + 1] = -FN[4 * f + 1];
      FN[4 * f + 2] = -FN[4 * f + 2];
      FN[4 * f + 3] = -FN[4 * f + 3];
    }
  }
  // adjacency of the tetrahedron by edge matching
  for (let f = 0; f < 4; f++) {
    for (let k = 0; k < 3; k++) {
      const u = FV[3 * f + k],
        v = FV[3 * f + ((k + 1) % 3)];
      for (let g = 0; g < 4; g++) {
        if (g === f) continue;
        for (let j = 0; j < 3; j++) {
          if (FV[3 * g + j] === v && FV[3 * g + ((j + 1) % 3)] === u) FA[3 * f + k] = g;
        }
      }
    }
  }

  // ---- assign points to faces
  const inTet = new Set(tet);
  for (let i = 0; i < n; i++) {
    if (inTet.has(i)) continue;
    let bf = -1,
      bd = visEps;
    for (let f = 0; f < 4; f++) {
      const d = dist(f, i);
      if (d > bd) {
        bd = d;
        bf = f;
      }
    }
    if (bf >= 0) (outside[bf] ??= []).push(i);
  }

  // ---- main loop
  const stack: number[] = [];
  for (let f = 0; f < 4; f++) if (outside[f]) stack.push(f);
  let stamp = 0;
  const hStart = new Int32Array(n).fill(-1);
  const hStamp = new Int32Array(n);
  let hStampVal = 0;

  const horizonOf = (visible: number[], st: number): Array<[number, number, number, number]> | null => {
    const edges: Array<[number, number, number, number]> = [];
    for (const g of visible) {
      for (let k = 0; k < 3; k++) {
        const h = FA[3 * g + k];
        if (h < 0 || mark[h] !== st) edges.push([FV[3 * g + k], FV[3 * g + ((k + 1) % 3)], h, g]);
      }
    }
    if (edges.length < 3) return null;
    hStampVal++;
    for (let e = 0; e < edges.length; e++) {
      const u = edges[e][0];
      if (hStamp[u] === hStampVal) return null; // pinch: vertex starts two horizon edges
      hStamp[u] = hStampVal;
      hStart[u] = e;
    }
    const ordered: Array<[number, number, number, number]> = [];
    let e = 0;
    for (let steps = 0; steps < edges.length; steps++) {
      ordered.push(edges[e]);
      const v = edges[e][1];
      if (hStamp[v] !== hStampVal) return null;
      e = hStart[v];
      if (e === 0) break;
    }
    return ordered.length === edges.length && e === 0 ? ordered : null;
  };

  let guard = 0;
  const maxIter = 64 * n + 1024; // safety net only
  while (stack.length && guard++ < maxIter) {
    const f = stack.pop()!;
    const os = outside[f];
    if (!alive[f] || !os || os.length === 0) continue;
    let eye = -1,
      bd = -Infinity;
    for (const i of os) {
      const d = dist(f, i);
      if (d > bd) {
        bd = d;
        eye = i;
      }
    }
    // visible faces (connected to f)
    const st = ++stamp;
    const visible = [f];
    mark[f] = st;
    for (let q = 0; q < visible.length; q++) {
      const g = visible[q];
      for (let k = 0; k < 3; k++) {
        const h = FA[3 * g + k];
        if (h >= 0 && mark[h] !== st && alive[h] && dist(h, eye) > visEps) {
          mark[h] = st;
          visible.push(h);
        }
      }
    }
    let horizon = horizonOf(visible, st);
    if (!horizon) {
      // repair: absorb every non-visible component except the largest one
      fillHoles(visible, st);
      horizon = horizonOf(visible, st);
    }
    if (!horizon) {
      // numerically hopeless point (within tolerance of several faces): drop it
      os.splice(os.indexOf(eye), 1);
      if (os.length) stack.push(f);
      continue;
    }
    const orphans: number[] = [];
    for (const g of visible) {
      const o = outside[g];
      if (o) for (const i of o) if (i !== eye) orphans.push(i);
      outside[g] = null;
      alive[g] = 0;
    }
    const first = alive.length;
    const H = horizon.length;
    for (let k = 0; k < H; k++) {
      const [u, v, nb, owner] = horizon[k];
      const nf = addFace(u, v, eye, owner);
      FA[3 * nf] = nb;
      if (nb >= 0) {
        for (let j = 0; j < 3; j++) {
          if (FV[3 * nb + j] === v && FV[3 * nb + ((j + 1) % 3)] === u) FA[3 * nb + j] = nf;
        }
      }
    }
    for (let k = 0; k < H; k++) {
      const a = first + k,
        b = first + ((k + 1) % H);
      FA[3 * a + 1] = b;
      FA[3 * b + 2] = a;
    }
    for (const i of orphans) {
      let bf = -1,
        bdist = visEps;
      for (let k = 0; k < H; k++) {
        const d = dist(first + k, i);
        if (d > bdist) {
          bdist = d;
          bf = first + k;
        }
      }
      if (bf >= 0) (outside[bf] ??= []).push(i);
    }
    for (let k = 0; k < H; k++) if (outside[first + k]) stack.push(first + k);
  }

  function fillHoles(visible: number[], st: number): void {
    const comp = new Map<number, number>();
    const comps: number[][] = [];
    for (let g = 0; g < alive.length; g++) {
      if (!alive[g] || mark[g] === st || comp.has(g)) continue;
      const id = comps.length;
      const list = [g];
      comp.set(g, id);
      for (let q = 0; q < list.length; q++) {
        const x = list[q];
        for (let k = 0; k < 3; k++) {
          const h = FA[3 * x + k];
          if (h >= 0 && alive[h] && mark[h] !== st && !comp.has(h)) {
            comp.set(h, id);
            list.push(h);
          }
        }
      }
      comps.push(list);
    }
    if (comps.length <= 1) return;
    let big = 0;
    for (let c = 1; c < comps.length; c++) if (comps[c].length > comps[big].length) big = c;
    for (let c = 0; c < comps.length; c++) {
      if (c === big) continue;
      for (const g of comps[c]) {
        mark[g] = st;
        visible.push(g);
      }
    }
  }

  // ---- merge coplanar triangles into polygons
  const F = alive.length;
  const live: number[] = [];
  const area = new Float64Array(F);
  for (let f = 0; f < F; f++) {
    if (!alive[f]) continue;
    live.push(f);
    area[f] = triArea(P, FV[3 * f], FV[3 * f + 1], FV[3 * f + 2]);
  }
  live.sort((a, b) => area[b] - area[a]);
  const region = new Int32Array(F).fill(-1);
  const regions: number[][] = [];
  for (const f of live) {
    if (region[f] >= 0) continue;
    const r = regions.length;
    const members = [f];
    region[f] = r;
    const nx = FN[4 * f],
      ny = FN[4 * f + 1],
      nz = FN[4 * f + 2],
      d = FN[4 * f + 3];
    for (let q = 0; q < members.length; q++) {
      const g = members[q];
      for (let k = 0; k < 3; k++) {
        const h = FA[3 * g + k];
        if (h < 0 || !alive[h] || region[h] >= 0) continue;
        let ok = FN[4 * h] * nx + FN[4 * h + 1] * ny + FN[4 * h + 2] * nz > -0.5;
        for (let j = 0; j < 3 && ok; j++) {
          const v = FV[3 * h + j];
          if (Math.abs(nx * P[3 * v] + ny * P[3 * v + 1] + nz * P[3 * v + 2] - d) > mergeEps) ok = false;
        }
        if (ok) {
          region[h] = r;
          members.push(h);
        }
      }
    }
    regions.push(members);
  }

  interface Poly {
    loop: number[];
    nx: number;
    ny: number;
    nz: number;
  }
  const polys: Poly[] = [];
  const emitTri = (f: number) => polys.push({ loop: [FV[3 * f], FV[3 * f + 1], FV[3 * f + 2]], nx: FN[4 * f], ny: FN[4 * f + 1], nz: FN[4 * f + 2] });
  const nextV = new Int32Array(n).fill(-1);
  for (let r = 0; r < regions.length; r++) {
    const members = regions[r];
    if (members.length === 1) {
      emitTri(members[0]);
      continue;
    }
    // area-weighted normal
    let nx = 0,
      ny = 0,
      nz = 0;
    for (const f of members) {
      const a = area[f];
      nx += FN[4 * f] * a;
      ny += FN[4 * f + 1] * a;
      nz += FN[4 * f + 2] * a;
    }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    // boundary loop (directed edges of member triangles whose neighbour is outside the region)
    let ok = true;
    let startV = -1;
    let count = 0;
    const touched: number[] = [];
    for (const f of members) {
      for (let k = 0; k < 3; k++) {
        const h = FA[3 * f + k];
        if (h >= 0 && region[h] === r) continue;
        const u = FV[3 * f + k],
          v = FV[3 * f + ((k + 1) % 3)];
        if (nextV[u] >= 0) ok = false;
        nextV[u] = v;
        touched.push(u);
        count++;
        if (startV < 0) startV = u;
      }
    }
    const loop: number[] = [];
    if (ok && startV >= 0) {
      let cur = startV;
      for (let s = 0; s <= count; s++) {
        loop.push(cur);
        const nx2 = nextV[cur];
        if (nx2 < 0) {
          ok = false;
          break;
        }
        cur = nx2;
        if (cur === startV) break;
      }
      if (cur !== startV || loop.length !== count) ok = false;
    }
    for (const u of touched) nextV[u] = -1;
    if (!ok || loop.length < 3) {
      for (const f of members) emitTri(f);
      continue;
    }
    polys.push({ loop, nx, ny, nz });
  }

  // Remove collinear vertices: a vertex used by exactly two polygons lies on their common
  // edge. Drop it from BOTH loops (only when both stay >= 3) so no T-junction is created.
  const useCnt = new Int32Array(n);
  const own0 = new Int32Array(n).fill(-1),
    own1 = new Int32Array(n).fill(-1);
  for (let pi = 0; pi < polys.length; pi++) {
    for (const v of polys[pi].loop) {
      const c = useCnt[v]++;
      if (c === 0) own0[v] = pi;
      else if (c === 1) own1[v] = pi;
    }
  }
  const plen = polys.map((p) => p.loop.length);
  const drop = new Uint8Array(n);
  let anyDrop = false;
  for (let v = 0; v < n; v++) {
    if (useCnt[v] !== 2 || own0[v] === own1[v]) continue;
    if (plen[own0[v]] > 3 && plen[own1[v]] > 3) {
      drop[v] = 1;
      anyDrop = true;
      plen[own0[v]]--;
      plen[own1[v]]--;
    }
  }
  if (anyDrop) for (const p of polys) p.loop = p.loop.filter((v) => !drop[v]);

  // ---- compact output
  const remap = new Int32Array(n).fill(-1);
  const verts: Vec3[] = [];
  const outSrc: number[] = [];
  const faces: HullFace[] = [];
  for (const p of polys) {
    const idx: number[] = [];
    let dsum = 0;
    for (const v of p.loop) {
      let r = remap[v];
      if (r < 0) {
        r = remap[v] = verts.length;
        verts.push({ x: P[3 * v], y: P[3 * v + 1], z: P[3 * v + 2] });
        outSrc.push(src[v]);
      }
      idx.push(r);
      dsum += p.nx * P[3 * v] + p.ny * P[3 * v + 1] + p.nz * P[3 * v + 2];
    }
    faces.push({ idx, n: { x: p.nx, y: p.ny, z: p.nz }, d: dsum / p.loop.length });
  }
  return { verts, src: outSrc, faces };
}

function dist2(P: Float64Array, a: number, b: number): number {
  const dx = P[3 * a] - P[3 * b],
    dy = P[3 * a + 1] - P[3 * b + 1],
    dz = P[3 * a + 2] - P[3 * b + 2];
  return dx * dx + dy * dy + dz * dz;
}

function triArea(P: Float64Array, a: number, b: number, c: number): number {
  const ax = P[3 * b] - P[3 * a],
    ay = P[3 * b + 1] - P[3 * a + 1],
    az = P[3 * b + 2] - P[3 * a + 2];
  const bx = P[3 * c] - P[3 * a],
    by = P[3 * c + 1] - P[3 * a + 1],
    bz = P[3 * c + 2] - P[3 * a + 2];
  const cx = ay * bz - az * by,
    cy = az * bx - ax * bz,
    cz = ax * by - ay * bx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}
