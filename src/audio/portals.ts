// Sound portals (pure): points through which sound can diffract between rooms — door and
// cased openings, the balcony slider, and open-plan room boundaries with no wall. The engine
// tests listener→portal→source paths with the occlusion hook, so a smash in the bathroom
// heard from the hallway comes "through the door" when the straight line hits a wall
// (and a closed door, being solid, still blocks it). Derived from src/world/plan.ts; the
// integrator may override with Audio.setPortals().

import type { Vec3 } from "../geom/vec.ts";
import { ROOMS, WALLS, wallPoint, type Room, type Wall } from "../world/plan.ts";

const PORTAL_KINDS = new Set(["door", "opening", "slidingDoor"]);

/** Sample height for portal points (ear height through a doorway). */
const EAR_Y = 1.4;

export function defaultPortals(rooms: readonly Room[] = ROOMS, walls: readonly Wall[] = WALLS): Vec3[] {
  const pts: Vec3[] = [];
  try {
    // 1. Openings in walls.
    for (const w of walls) {
      for (const o of w.openings ?? []) {
        if (!PORTAL_KINDS.has(o.kind)) continue;
        const [x, z] = wallPoint(w, (o.from + o.to) / 2);
        const y = Math.min(o.sill + (o.head - o.sill) / 2, EAR_Y);
        if (Number.isFinite(x) && Number.isFinite(z)) pts.push({ x, y, z });
      }
    }
    // 2. Open-plan boundaries: room edges shared by two rooms with no wall along them.
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        for (const seg of sharedEdges(rooms[i], rooms[j])) {
          for (const [a, b] of uncovered(seg, walls)) {
            const len = b - a;
            if (len < 0.4) continue;
            const n = Math.max(1, Math.round(len / 1.6));
            for (let k = 0; k < n; k++) {
              const t = a + ((k + 0.5) * len) / n;
              pts.push(seg.axis === "x" ? { x: t, y: EAR_Y, z: seg.at } : { x: seg.at, y: EAR_Y, z: t });
            }
          }
        }
      }
    }
  } catch {
    /* plan shape changed: no default portals */
  }
  return dedupe(pts, 0.3);
}

interface Edge {
  /** "x": edge runs along x at z = at; "z": runs along z at x = at. */
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
}

function sharedEdges(a: Room, b: Room): Edge[] {
  const out: Edge[] = [];
  const eps = 0.02;
  const ox0 = Math.max(a.x0, b.x0),
    ox1 = Math.min(a.x1, b.x1);
  const oz0 = Math.max(a.z0, b.z0),
    oz1 = Math.min(a.z1, b.z1);
  if (ox1 - ox0 > 0.3) {
    if (Math.abs(a.z1 - b.z0) < eps) out.push({ axis: "x", at: a.z1, from: ox0, to: ox1 });
    else if (Math.abs(b.z1 - a.z0) < eps) out.push({ axis: "x", at: a.z0, from: ox0, to: ox1 });
  }
  if (oz1 - oz0 > 0.3) {
    if (Math.abs(a.x1 - b.x0) < eps) out.push({ axis: "z", at: a.x1, from: oz0, to: oz1 });
    else if (Math.abs(b.x1 - a.x0) < eps) out.push({ axis: "z", at: a.x0, from: oz0, to: oz1 });
  }
  return out;
}

/** Sub-intervals of an edge not covered by any wall lying along it. */
function uncovered(e: Edge, walls: readonly Wall[]): Array<[number, number]> {
  let free: Array<[number, number]> = [[e.from, e.to]];
  for (const w of walls) {
    const alongX = Math.abs(w.a[1] - w.b[1]) < 1e-6;
    const alongZ = Math.abs(w.a[0] - w.b[0]) < 1e-6;
    let lo: number, hi: number;
    if (e.axis === "x" && alongX && Math.abs(w.a[1] - e.at) <= w.thickness / 2 + 0.15) {
      lo = Math.min(w.a[0], w.b[0]);
      hi = Math.max(w.a[0], w.b[0]);
    } else if (e.axis === "z" && alongZ && Math.abs(w.a[0] - e.at) <= w.thickness / 2 + 0.15) {
      lo = Math.min(w.a[1], w.b[1]);
      hi = Math.max(w.a[1], w.b[1]);
    } else continue;
    const next: Array<[number, number]> = [];
    for (const [a, b] of free) {
      if (hi <= a || lo >= b) next.push([a, b]);
      else {
        if (lo > a) next.push([a, lo]);
        if (hi < b) next.push([hi, b]);
      }
    }
    free = next;
  }
  return free;
}

function dedupe(pts: Vec3[], r: number): Vec3[] {
  const out: Vec3[] = [];
  for (const p of pts) if (!out.some((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < r)) out.push(p);
  return out;
}
