// Room topology for room-based interior light assignment (pure, no Babylon).
//
// Babylon materials evaluate a bounded number of lights per mesh. Instead of letting every
// interior bulb light every mesh (light leaking through walls + per-material light limits),
// each room gets one bit of a mesh layer mask:
//   * a registered world mesh carries the bits of every room its AABB overlaps
//     (plus WORLD_LAYER_BIT so it stays visible to the default camera mask);
//   * an interior light only affects meshes whose layer mask intersects
//     `light.includeOnlyWithLayerMask` = its room + the rooms connected to it through
//     door/window openings or open-plan boundaries.
// Partition walls overlap both of their rooms; Lambert N·L keeps the far face dark.

import { ROOMS, WALLS, sideRoom, wallLength, type Room, type RoomId, type Wall } from "../../world/plan.ts";

/** Bit always set on registered world meshes; never part of any light's include mask. */
export const WORLD_LAYER_BIT = 0x08000000;
/** Babylon's default camera/mesh layer mask. Room bits must stay inside it. */
export const DEFAULT_LAYER_MASK = 0x0fffffff;

export const ROOM_IDS: readonly RoomId[] = ROOMS.map((r) => r.id);

/** Room id → its layer-mask bit. */
export const ROOM_BIT: Readonly<Record<RoomId, number>> = Object.freeze(
  Object.fromEntries(ROOMS.map((r, i) => [r.id, 1 << i])) as Record<RoomId, number>,
);

/** OR of every room bit. */
export const ALL_ROOM_BITS = ROOMS.reduce((m, _r, i) => m | (1 << i), 0);

if (ROOMS.length > 26) throw new Error("roomGraph: too many rooms for the layer-mask bit budget");

/**
 * Bits of every room whose footprint overlaps the XZ box [minX,maxX]×[minZ,maxZ] shrunk by
 * `shrink` on each side (so a mesh merely touching a neighbouring room is not assigned to it).
 * Degenerate boxes (shrunk past zero size) collapse to their centre point.
 */
export function roomMaskForBox(minX: number, maxX: number, minZ: number, maxZ: number, shrink = 0.03): number {
  if (!(minX <= maxX) || !(minZ <= maxZ)) return 0; // also rejects NaN
  let x0 = minX + shrink,
    x1 = maxX - shrink,
    z0 = minZ + shrink,
    z1 = maxZ - shrink;
  if (x0 > x1) x0 = x1 = (minX + maxX) * 0.5;
  if (z0 > z1) z0 = z1 = (minZ + maxZ) * 0.5;
  let mask = 0;
  for (let i = 0; i < ROOMS.length; i++) {
    const r = ROOMS[i];
    if (x1 >= r.x0 && x0 <= r.x1 && z1 >= r.z0 && z0 <= r.z1) mask |= 1 << i;
  }
  return mask;
}

/** Squared distance from (x, z) to a room's footprint rectangle (0 inside). */
function rectDist2(r: Room, x: number, z: number): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dz = z < r.z0 ? r.z0 - z : z > r.z1 ? z - r.z1 : 0;
  return dx * dx + dz * dz;
}

/** The room containing (x, z), or the nearest one (portable lamps, lights in wall thickness). */
export function nearestRoom(x: number, z: number): Room {
  let best = ROOMS[0];
  let bestD = Infinity;
  for (const r of ROOMS) {
    const d = rectDist2(r, Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0);
    // Prefer indoor rooms on ties (a point on the balcony door line belongs inside).
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best.outdoor && !r.outdoor)) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ adjacency

/** Covered (walled) intervals of a boundary line, from walls lying on it, minus their openings. */
function wallCoverage(walls: readonly Wall[], vertical: boolean, line: number, lo: number, hi: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const w of walls) {
    const isVertical = Math.abs(w.b[0] - w.a[0]) < 1e-6; // runs along z
    if (isVertical !== vertical) continue;
    const pos = vertical ? w.a[0] : w.a[1];
    if (Math.abs(pos - line) > w.thickness / 2 + 0.01) continue;
    // Wall extent along the boundary axis, parametrised from endpoint a.
    const a = vertical ? w.a[1] : w.a[0];
    const b = vertical ? w.b[1] : w.b[0];
    const dir = b >= a ? 1 : -1;
    const L = wallLength(w);
    // Solid pieces = [0, L] minus openings.
    const cuts = w.openings.map((o) => [Math.max(0, o.from), Math.min(L, o.to)] as [number, number]).sort((p, q) => p[0] - q[0]);
    let s = 0;
    const pieces: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) {
      if (c0 > s) pieces.push([s, c0]);
      s = Math.max(s, c1);
    }
    if (s < L) pieces.push([s, L]);
    for (const [p0, p1] of pieces) {
      const u0 = a + dir * p0;
      const u1 = a + dir * p1;
      const c0 = Math.max(lo, Math.min(u0, u1));
      const c1 = Math.min(hi, Math.max(u0, u1));
      if (c1 > c0) out.push([c0, c1]);
    }
  }
  return out;
}

/** Total length of [lo, hi] not covered by the given intervals. */
function uncoveredLength(lo: number, hi: number, cover: Array<[number, number]>): number {
  const iv = cover.slice().sort((p, q) => p[0] - q[0]);
  let free = 0;
  let s = lo;
  for (const [c0, c1] of iv) {
    if (c0 > s) free += Math.min(c0, hi) - s;
    s = Math.max(s, c1);
    if (s >= hi) break;
  }
  if (s < hi) free += hi - s;
  return Math.max(0, free);
}

/**
 * Room adjacency graph: two rooms are connected when an opening (door, window, sliding door,
 * archway) joins them, or when they share a boundary with ≥ 10 cm not covered by any wall
 * (open-plan living/kitchen). Pure function of the plan data.
 */
export function computeAdjacency(rooms: readonly Room[] = ROOMS, walls: readonly Wall[] = WALLS): Map<RoomId, Set<RoomId>> {
  const adj = new Map<RoomId, Set<RoomId>>();
  for (const r of rooms) adj.set(r.id, new Set());
  const link = (a: RoomId, b: RoomId) => {
    if (a === b) return;
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  };
  // 1) openings — sampled along their width so a wide archway can join several rooms.
  for (const w of walls) {
    for (const o of w.openings) {
      const width = o.to - o.from;
      const n = Math.max(2, Math.ceil(width / 0.2));
      for (let i = 0; i <= n; i++) {
        const s = o.from + 0.05 + ((width - 0.1) * i) / n;
        const ra = sideRoom(w, s, 1);
        const rb = sideRoom(w, s, -1);
        if (ra && rb) link(ra.id, rb.id);
      }
    }
  }
  // 2) open boundaries between rooms sharing an edge.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      // vertical shared edge (constant x)
      for (const [xa, xb] of [
        [a.x1, b.x0],
        [b.x1, a.x0],
      ] as const) {
        if (Math.abs(xa - xb) > 1e-6) continue;
        const lo = Math.max(a.z0, b.z0);
        const hi = Math.min(a.z1, b.z1);
        if (hi - lo < 0.1) continue;
        if (uncoveredLength(lo, hi, wallCoverage(walls, true, xa, lo, hi)) >= 0.1) link(a.id, b.id);
      }
      // horizontal shared edge (constant z)
      for (const [za, zb] of [
        [a.z1, b.z0],
        [b.z1, a.z0],
      ] as const) {
        if (Math.abs(za - zb) > 1e-6) continue;
        const lo = Math.max(a.x0, b.x0);
        const hi = Math.min(a.x1, b.x1);
        if (hi - lo < 0.1) continue;
        if (uncoveredLength(lo, hi, wallCoverage(walls, false, za, lo, hi)) >= 0.1) link(a.id, b.id);
      }
    }
  }
  return adj;
}

let adjCache: Map<RoomId, Set<RoomId>> | null = null;

/** Cached adjacency of the apartment plan. */
export function roomAdjacency(): Map<RoomId, Set<RoomId>> {
  if (!adjCache) adjCache = computeAdjacency();
  return adjCache;
}

/** Include mask for a light in `room`: the room itself plus every connected room. */
export function lightMaskForRoom(room: RoomId): number {
  let mask = ROOM_BIT[room] ?? 0;
  const near = roomAdjacency().get(room);
  if (near) for (const r of near) mask |= ROOM_BIT[r];
  return mask;
}

/** Number of set bits (light counting per mask). */
export function popcount(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
