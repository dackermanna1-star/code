/**
 * Caves: lava tubes, ice caves and solution (karst) caves, entered through a
 * skylight, a stretch of collapsed roof with a rubble ramp at one end.
 *
 * Sites are deterministic: at most one per 2.5-km cell of a cube face. The
 * skylight is carved into the terrain height itself, so rendering,
 * collisions and every LOD agree. The tunnel is a separate mesh
 * (render/cave.ts) whose mouth opens in the far wall of the skylight; its
 * path is traced by sim/caves.ts.
 *
 * Frame of a site: origin at the foot of the ramp on the skylight floor, U
 * along the tunnel (horizontal), V across it, up radial. The ramp climbs
 * toward −U at 28° (walkable), the floor runs flat to the mouth at u = lf,
 * and the walls are near-vertical.
 */
import { FACES, faceToDir } from './cubesphere';
import { mix32 } from '../core/rng';

export type CaveKind = 'lava-tube' | 'ice' | 'karst';
export const CAVE_CELL = 2500; // m
export const RAMP_SLOPE = Math.tan((28 * Math.PI) / 180);
const QPI = Math.PI / 4;

export interface CaveSite {
  /** numeric cell key (face, ci, cj) */
  key: number;
  kind: CaveKind;
  /** unit direction of the frame origin: the foot of the ramp */
  dir: [number, number, number];
  /** horizontal unit axes: U along the tunnel, V across */
  U: [number, number, number];
  V: [number, number, number];
  rt: number;     // tunnel half-width (m)
  hc: number;     // tunnel ceiling height above its floor (m)
  roof: number;   // rock over the tunnel at the mouth (m)
  depth: number;  // skylight floor below the surrounding surface (m)
  lr: number;     // ramp length (m)
  lf: number;     // flat floor from the ramp foot to the mouth (m)
  w: number;      // skylight half-width (m)
  wall: number;   // horizontal run of the steep walls (m)
  seed: number;
}

export const caveKey = (face: number, ci: number, cj: number) => (face * 65536 + (ci + 32768)) * 65536 + (cj + 32768);

/** Face and face coordinates (a, b ∈ [−1, 1]) of a unit direction (into a reused object). */
const _f = { face: 0, a: 0, b: 0 };
export function faceOf(x: number, y: number, z: number) {
  let face = 0, best = -Infinity;
  for (let f = 0; f < 6; f++) {
    const n = FACES[f].n;
    const v = x * n[0] + y * n[1] + z * n[2];
    if (v > best) { best = v; face = f; }
  }
  const F = FACES[face];
  _f.face = face;
  _f.a = Math.atan((x * F.u[0] + y * F.u[1] + z * F.u[2]) / best) / QPI;
  _f.b = Math.atan((x * F.v[0] + y * F.v[1] + z * F.v[2]) / best) / QPI;
  return _f;
}

/** Cell size in face coordinates for a planet of radius R. */
export const caveCellDa = (R: number) => CAVE_CELL / (R * QPI);

/** Cheap existence test for the candidate site of a cell. */
export function caveCandidate(seed: number, density: number, face: number, ci: number, cj: number): number {
  const h = mix32(((seed ^ 0x5bd1e995) >>> 0) + mix32(face * 7919 + mix32((Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663)) >>> 0)));
  return h / 4294967296 < density * 0.5 ? h : 0;
}

/**
 * The cave site of a cell, or null. size: typical tunnel half-width (m) for
 * this world (lava tubes are wider under low gravity).
 */
export function caveSite(seed: number, density: number, kind: CaveKind, size: number, R: number, face: number, ci: number, cj: number): CaveSite | null {
  let h = caveCandidate(seed, density, face, ci, cj);
  if (!h) return null;
  const r = () => (h = mix32(h + 0x9e3779b9)) / 4294967296;
  const da = caveCellDa(R);
  const a = (ci + 0.25 + 0.5 * r()) * da, b = (cj + 0.25 + 0.5 * r()) * da;
  if (Math.abs(a) > 0.97 || Math.abs(b) > 0.97) return null; // keep clear of face seams
  const d: [number, number, number] = [0, 0, 0];
  faceToDir(face, a, b, d);
  let ex = -d[2], ez = d[0];
  const el = Math.hypot(ex, ez);
  if (el < 1e-6) { ex = 1; ez = 0; } else { ex /= el; ez /= el; }
  // north = up × east
  const nx = d[1] * ez, ny = d[2] * ex - d[0] * ez, nz = -d[1] * ex;
  const th = r() * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
  const U: [number, number, number] = [c * nx + s * ex, c * ny, c * nz + s * ez];
  const V: [number, number, number] = [d[1] * U[2] - d[2] * U[1], d[2] * U[0] - d[0] * U[2], d[0] * U[1] - d[1] * U[0]];
  const rt = size * (0.7 + 0.6 * r());
  const hc = rt * (kind === 'karst' ? 1.4 : kind === 'ice' ? 1.1 : 1.25);
  const roof = Math.max(3, rt * (0.4 + 0.4 * r()));
  const depth = hc + roof;
  return {
    key: caveKey(face, ci, cj), kind, dir: d, U, V, rt, hc, roof, depth,
    lr: depth / RAMP_SLOPE, lf: Math.max(4, rt * (0.8 + 0.8 * r())), w: rt * 1.05 + 0.5, wall: Math.max(1.2, depth * 0.1),
    seed: h,
  };
}

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Is (u, v) within the skylight's footprint (including its walls)? */
export const inSkylight = (s: CaveSite, u: number, v: number) =>
  Math.abs(v) < s.w + s.wall && u < s.lf + s.wall && u > -s.lr - s.wall;

/**
 * Height inside the skylight at (u, v) given the natural height h and the
 * skylight floor height. Never raises the ground; `rock` is the share of
 * exposed rock (walls) for the material.
 */
export function carveSkylight(s: CaveSite, u: number, v: number, h: number, floor: number, out: { h: number; rock: number }) {
  out.h = h; out.rock = 0;
  if (!inSkylight(s, u, v)) return out;
  const m = (1 - sstep(s.w, s.w + s.wall, Math.abs(v))) * (1 - sstep(s.lf, s.lf + s.wall, u));
  const target = u >= 0 ? floor : floor - u * RAMP_SLOPE;
  if (target < h) {
    out.h = h + (target - h) * m;
    // walls are bare rock; the floor and the ramp are rubble
    out.rock = m > 0.02 && m < 0.98 ? 1 : m >= 0.98 ? 0.55 : 0;
  }
  return out;
}

/** Tunnel cross-section: does a point (v across, y above the floor) lie inside? (scale < 1 shrinks it) */
export function inTunnelSection(rt: number, hc: number, v: number, y: number, scale = 1) {
  const yc = 0.45 * hc;
  if (y < -0.3 || Math.abs(v) > rt * scale) return false;
  if (y <= yc) return true;
  const q = (v / (rt * scale)) ** 2 + ((y - yc) / ((hc - yc) * scale)) ** 2;
  return q < 1;
}
