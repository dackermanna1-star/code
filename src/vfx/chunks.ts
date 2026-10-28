// Low-poly chunk meshes for micro-debris (PURE MODULE — no Babylon imports).
//
// Every micro-debris particle is a thin instance of one of a handful of generic chunk shapes,
// scaled per instance. Shapes are normalised so their largest extent is 1 (centred on the
// origin) and are flat-shaded (duplicated vertices per face) for a crisp late-PS2 look.
//
// Winding: Babylon (left-handed, default side orientation) treats a triangle (a, b, c) as
// front-facing when cross(b - a, c - a) points AWAY from the viewer, i.e. opposite to the
// outward normal (verified by tests/probes/render-materials-winding.probe.ts). The builder
// below orients every triangle against its intended outward normal, so callers never have to
// think about it.
//
// UVs are planar projections in texture REPEATS (the world material divides nothing for
// instances): a chunk shows a small patch of its surface texture (~0.08 repeats across).

export const SHAPE = {
  /** Thin irregular plate (glass/ceramic/plastic shards). */
  shardA: 0,
  shardB: 1,
  /** Slightly irregular cube (tempered-glass dice). */
  cube: 2,
  /** Chunky irregular nugget (ceramic, concrete, gypsum, plastic chips). */
  chipA: 3,
  chipB: 4,
  /** Elongated tapered sliver with jagged ends (wood). */
  splinter: 5,
  /** Lumpy roundish crumb (soil, foam, gypsum, concrete). */
  crumb: 6,
  /** Thin bent sheet (paper, sheet metal). */
  flake: 7,
} as const;
export type ShapeId = (typeof SHAPE)[keyof typeof SHAPE];
export const SHAPE_COUNT = 8;
export const SHAPE_NAMES = ["shardA", "shardB", "cube", "chipA", "chipB", "splinter", "crumb", "flake"] as const;

export interface ChunkGeom {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  /** Half extents of the axis-aligned bounding box (local frame). */
  half: [number, number, number];
}

const UV_SCALE = 0.08; // texture repeats across a unit chunk

type V = [number, number, number];

function sub(a: V, b: V): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V, b: V): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V, b: V): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: V): V {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Small deterministic PRNG (mulberry32) so chunk shapes are identical every run. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accumulates flat-shaded triangles; fixes winding against a reference interior point. */
class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /**
   * Add a flat triangle. `inside` is a point inside the solid: the outward normal points away
   * from it. Degenerate triangles are skipped.
   */
  tri(a: V, b: V, c: V, inside: V): void {
    let n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const centroid: V = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = dot(n, sub(centroid, inside)) >= 0 ? n : ([-n[0], -n[1], -n[2]] as V);
    // Babylon front face: cross(b - a, c - a) must point opposite to the outward normal.
    if (dot(cross(sub(b, a), sub(c, a)), outward) > 0) {
      const t = b;
      b = c;
      c = t;
    }
    // Planar UV projection along the dominant normal axis.
    const ax = Math.abs(outward[0]),
      ay = Math.abs(outward[1]),
      az = Math.abs(outward[2]);
    const base = this.pos.length / 3;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(outward[0], outward[1], outward[2]);
      let u: number, v: number;
      if (ax >= ay && ax >= az) {
        u = p[2];
        v = p[1];
      } else if (ay >= az) {
        u = p[0];
        v = p[2];
      } else {
        u = p[0];
        v = p[1];
      }
      this.uv.push(0.5 + u * UV_SCALE, 0.5 + v * UV_SCALE);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** Convex-ish polygon fan (vertices in any consistent order). */
  poly(points: V[], inside: V): void {
    for (let i = 1; i + 1 < points.length; i++) this.tri(points[0], points[i], points[i + 1], inside);
  }

  finish(): ChunkGeom {
    // Normalise: centre the bounding box on the origin and scale so the largest extent is 1.
    const p = this.pos;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]);
      maxX = Math.max(maxX, p[i]);
      minY = Math.min(minY, p[i + 1]);
      maxY = Math.max(maxY, p[i + 1]);
      minZ = Math.min(minZ, p[i + 2]);
      maxZ = Math.max(maxZ, p[i + 2]);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      cz = (minZ + maxZ) / 2;
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const s = 1 / ext;
    const positions = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      positions[i] = (p[i] - cx) * s;
      positions[i + 1] = (p[i + 1] - cy) * s;
      positions[i + 2] = (p[i + 2] - cz) * s;
    }
    return {
      positions,
      normals: new Float32Array(this.nrm),
      uvs: new Float32Array(this.uv),
      indices: new Uint16Array(this.idx),
      half: [((maxX - minX) * s) / 2, ((maxY - minY) * s) / 2, ((maxZ - minZ) * s) / 2],
    };
  }
}

/** Irregular convex polygon in the XZ plane (sorted by angle), radius ~0.5, elongation e. */
function irregularPolygon(rnd: () => number, n: number, elong: number): Array<[number, number]> {
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push((i + (rnd() - 0.5) * 0.7) * ((Math.PI * 2) / n));
  angles.sort((a, b) => a - b);
  return angles.map((a) => {
    const r = 0.38 + rnd() * 0.16;
    return [Math.cos(a) * r * elong, Math.sin(a) * r] as [number, number];
  });
}

/** Extrude a polygon (XZ) between two slightly non-parallel planes: a sharp-edged plate. */
function plate(rnd: () => number, n: number, elong: number, thickness: number): ChunkGeom {
  const b = new Builder();
  const pts = irregularPolygon(rnd, n, elong);
  // Tilted top/bottom planes give shards a wedge profile like real conchoidal fractures.
  const tx = (rnd() - 0.5) * thickness * 0.6,
    tz = (rnd() - 0.5) * thickness * 0.6;
  const top: V[] = pts.map(([x, z]) => [x, thickness / 2 + x * tx + z * tz, z]);
  const bot: V[] = pts.map(([x, z]) => [x, -thickness / 2 - x * tx * 0.5, z]);
  const inside: V = [0, 0, 0];
  b.poly(top, inside);
  b.poly(bot, inside);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.tri(top[i], top[j], bot[j], inside);
    b.tri(top[i], bot[j], bot[i], inside);
  }
  return b.finish();
}

/** Box with jittered corners (still nearly convex) — tempered-glass cube. */
function jitterBox(rnd: () => number, sx: number, sy: number, sz: number, jitter: number): ChunkGeom {
  const b = new Builder();
  const c: V[] = [];
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? 0.5 : -0.5) * sx + (rnd() - 0.5) * jitter;
    const y = (i & 2 ? 0.5 : -0.5) * sy + (rnd() - 0.5) * jitter;
    const z = (i & 4 ? 0.5 : -0.5) * sz + (rnd() - 0.5) * jitter;
    c.push([x, y, z]);
  }
  const inside: V = [0, 0, 0];
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  for (const f of faces) {
    b.tri(c[f[0]], c[f[1]], c[f[2]], inside);
    b.tri(c[f[0]], c[f[2]], c[f[3]], inside);
  }
  return b.finish();
}

// Icosahedron (unit circumradius) used for nuggets and crumbs.
const ICO_V: V[] = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  return raw.map(norm);
})();
const ICO_F = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/** Radially jittered, axis-scaled icosahedron. Low jitter keeps it convex enough to look solid. */
function nugget(rnd: () => number, sx: number, sy: number, sz: number, jitter: number, flatCut: number): ChunkGeom {
  const b = new Builder();
  const v: V[] = ICO_V.map((p) => {
    const r = 1 + (rnd() - 0.5) * 2 * jitter;
    let y = p[1] * r * sy;
    // Optional flat cut: chips broken off a surface have one flat (original) face.
    if (flatCut > 0 && y > sy * (1 - flatCut)) y = sy * (1 - flatCut);
    return [p[0] * r * sx, y, p[2] * r * sz];
  });
  const inside: V = [0, 0, 0];
  for (const f of ICO_F) b.tri(v[f[0]], v[f[1]], v[f[2]], inside);
  return b.finish();
}

/** Tapered quadrilateral sliver along X with jagged pointed ends. */
function splinter(rnd: () => number): ChunkGeom {
  const b = new Builder();
  const w = 0.16,
    t = 0.085;
  // Cross sections along the length: [x, halfWidth, halfThick, yOffset, zOffset]
  const xs = [-0.5, -0.36, -0.1, 0.15, 0.38, 0.5];
  const secs: V[][] = xs.map((x, i) => {
    const end = i === 0 || i === xs.length - 1;
    const taper = end ? 0.12 : 0.65 + rnd() * 0.35;
    const hw = (w / 2) * taper,
      ht = (t / 2) * taper;
    const oy = (rnd() - 0.5) * 0.02,
      oz = (rnd() - 0.5) * 0.03;
    return [
      [x, oy - ht, oz - hw],
      [x, oy + ht, oz - hw * 0.8],
      [x, oy + ht, oz + hw],
      [x, oy - ht, oz + hw * 0.9],
    ];
  });
  for (let s = 0; s + 1 < secs.length; s++) {
    const A = secs[s],
      B = secs[s + 1];
    const mid: V = [(xs[s] + xs[s + 1]) / 2, 0, 0];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      b.tri(A[k], A[k2], B[k2], mid);
      b.tri(A[k], B[k2], B[k], mid);
    }
  }
  // End caps
  b.poly(secs[0], [0, 0, 0]);
  b.poly(secs[secs.length - 1], [0, 0, 0]);
  return b.finish();
}

/** Thin sheet folded once along Z (paper scrap / torn sheet metal), with real thickness. */
function flake(rnd: () => number): ChunkGeom {
  const b = new Builder();
  const t = 0.035;
  const fold = 0.35 + rnd() * 0.4; // radians
  const fx = (rnd() - 0.5) * 0.3; // fold line position
  const xs = [-0.5, fx, 0.5];
  const zA = [-0.38 - rnd() * 0.08, -0.42, -0.36 + rnd() * 0.06];
  const zB = [0.4, 0.36 + rnd() * 0.1, 0.42];
  // Height profile: flat on one side, rising on the other side of the fold.
  const y = (x: number) => (x <= fx ? 0 : (x - fx) * Math.tan(fold));
  const top: V[] = xs.map((x, i) => [x, y(x) + t / 2, zA[i]]);
  const topB: V[] = xs.map((x, i) => [x, y(x) + t / 2, zB[i]]);
  const bot: V[] = xs.map((x, i) => [x, y(x) - t / 2, zA[i]]);
  const botB: V[] = xs.map((x, i) => [x, y(x) - t / 2, zB[i]]);
  for (let i = 0; i < 2; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const inside: V = [cx, y(cx), 0];
    b.tri(top[i], top[i + 1], topB[i + 1], inside);
    b.tri(top[i], topB[i + 1], topB[i], inside);
    b.tri(bot[i], bot[i + 1], botB[i + 1], inside);
    b.tri(bot[i], botB[i + 1], botB[i], inside);
    // side strips (thickness)
    b.tri(top[i], bot[i], bot[i + 1], inside);
    b.tri(top[i], bot[i + 1], top[i + 1], inside);
    b.tri(topB[i], botB[i + 1], botB[i], inside);
    b.tri(topB[i], topB[i + 1], botB[i + 1], inside);
  }
  // end caps
  b.tri(top[0], topB[0], botB[0], [xs[0] + 0.1, y(xs[0]), 0]);
  b.tri(top[0], botB[0], bot[0], [xs[0] + 0.1, y(xs[0]), 0]);
  b.tri(top[2], botB[2], topB[2], [xs[2] - 0.1, y(xs[2] - 0.1), 0]);
  b.tri(top[2], bot[2], botB[2], [xs[2] - 0.1, y(xs[2] - 0.1), 0]);
  return b.finish();
}

/** Build the chunk mesh for a shape (deterministic). */
export function buildChunk(shape: number): ChunkGeom {
  const rnd = prng(0x51ed270b + shape * 7919);
  switch (shape) {
    case SHAPE.shardA:
      return plate(rnd, 5, 1.25, 0.16);
    case SHAPE.shardB:
      return plate(rnd, 6, 1.6, 0.13);
    case SHAPE.cube:
      return jitterBox(rnd, 1, 0.82, 0.92, 0.08);
    case SHAPE.chipA:
      return nugget(rnd, 1, 0.55, 0.8, 0.18, 0.25);
    case SHAPE.chipB:
      return nugget(rnd, 0.9, 0.45, 1.0, 0.22, 0.0);
    case SHAPE.splinter:
      return splinter(rnd);
    case SHAPE.crumb:
      return nugget(rnd, 1, 0.82, 0.9, 0.24, 0.0);
    case SHAPE.flake:
      return flake(rnd);
    default:
      throw new Error(`vfx/chunks: unknown shape ${shape}`);
  }
}

/** Half extents of every shape (cached; used by the simulation for ground contact). */
export const SHAPE_HALF: Float32Array = (() => {
  const out = new Float32Array(SHAPE_COUNT * 3);
  for (let s = 0; s < SHAPE_COUNT; s++) {
    const g = buildChunk(s);
    out[s * 3] = g.half[0];
    out[s * 3 + 1] = g.half[1];
    out[s * 3 + 2] = g.half[2];
  }
  return out;
})();
