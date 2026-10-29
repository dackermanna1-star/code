// Pure layout of the apartment structure derived from src/world/plan.ts: wall runs in local
// frames, junction rules (where partitions stop, butt or wrap corners), abutments (where one
// wall's end covers another wall's face), wall footprints, per-room floor/ceiling coverage
// rectangles and floor thresholds. No Babylon, no geometry kernel: just numbers.
//
// LOCAL WALL FRAME: origin on the wall centre line, u along the run direction d, y up, w across
// the wall with +w = (-d.z, d.x) — exactly the frame the builder gets from
// `b.group([ox, 0, oz], [0, yawDeg, 0], ...)` with yaw = atan2(-d.z, d.x) (see WallFrame).
// Concrete runs are oriented so that +w points INTO the apartment.
//
// JUNCTION RULES (partitions):
//  * end on a concrete wall's interior face → "concrete": extends 12.5 mm into the finish recess
//    so it butts the concrete itself; the concrete finish layer is interrupted there.
//  * end meets the side of another wall (T junction), or a corner where the other wall
//    continues collinearly → "butt": trimmed to that wall's face; it covers ("abuts") that
//    face over its thickness.
//  * collinear walls meeting end to end → "butt" at the shared point.
//  * L corner of two partitions: the wall running along z wraps the corner ("free" end with a
//    gypsum end cap); the wall along x is trimmed to its face ("butt").

import {
  INTERIOR,
  ROOMS,
  WALLS,
  roomAt,
  roomById,
  wallLength,
  wallPoint,
  type Opening,
  type OpeningKind,
  type Room,
  type RoomId,
  type Wall,
  type WallKind,
} from "../plan.ts";
import { CEILING_Y, SLAB_TOP_Y, STRUCTURE_TOP_Y, SLAB_BOTTOM_Y, WALL_FINISH_T } from "./levels.ts";
import { dropSlivers, intervalsSubtractAll, mergeRects, rect, rectInflate, rectsSubtract, type Interval, type Rect2 } from "./rects.ts";

// ------------------------------------------------------------------ frames
export class WallFrame {
  readonly ox: number;
  readonly oz: number;
  readonly dx: number;
  readonly dz: number;
  /** +w direction (horizontal unit normal). */
  readonly nx: number;
  readonly nz: number;
  readonly yawDeg: number;

  constructor(ox: number, oz: number, dx: number, dz: number) {
    const l = Math.hypot(dx, dz) || 1;
    this.ox = ox;
    this.oz = oz;
    this.dx = dx / l;
    this.dz = dz / l;
    this.nx = -this.dz;
    this.nz = this.dx;
    this.yawDeg = (Math.atan2(-this.dz, this.dx) * 180) / Math.PI;
  }

  toWorld(u: number, y: number, w: number): { x: number; y: number; z: number } {
    return { x: this.ox + this.dx * u + this.nx * w, y, z: this.oz + this.dz * u + this.nz * w };
  }

  u(x: number, z: number): number {
    return (x - this.ox) * this.dx + (z - this.oz) * this.dz;
  }

  w(x: number, z: number): number {
    return (x - this.ox) * this.nx + (z - this.oz) * this.nz;
  }

  /** Plan rectangle covered by local ranges [u0,u1] × [w0,w1]. */
  planRect(u0: number, u1: number, w0: number, w1: number): Rect2 {
    const a = this.toWorld(u0, 0, w0),
      b = this.toWorld(u1, 0, w1);
    return rect(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z));
  }
}

export type EndKind = "concrete" | "butt" | "free";

export interface RunOpening {
  op: Opening;
  /** Rough opening along the run (local u). */
  r0: number;
  r1: number;
  sill: number;
  head: number;
  /** Doors: which end carries the hinges (-1 = r0, +1 = r1). */
  hingeSide: -1 | 1;
  /** Doors: side the leaf swings into (+1 = +w). Windows/others: +1. */
  swingSide: -1 | 1;
}

export interface Abutment {
  /** Local u interval covered on this face. */
  lo: number;
  hi: number;
  /** Wall whose end covers this face. */
  by: string;
}

export interface PartitionRun {
  wall: Wall;
  frame: WallFrame;
  half: number;
  u0: number;
  u1: number;
  end0: EndKind;
  end1: EndKind;
  openings: RunOpening[];
  /** Abutments on the +w face and on the -w face. */
  abutPos: Abutment[];
  abutNeg: Abutment[];
}

export interface ConcreteSegment {
  /** Concrete extent (local u). */
  u0: number;
  u1: number;
  room: Room;
}

export interface ConcreteRun {
  wall: Wall;
  frame: WallFrame;
  half: number;
  /** Concrete extent along u. */
  u0: number;
  u1: number;
  /** Finish-layer extent along u (interior face). */
  f0: number;
  f1: number;
  openings: RunOpening[];
  /** Partition ends covering the interior face (finish interrupted). */
  abut: Abutment[];
  segments: ConcreteSegment[];
}

const EPS = 1e-6;

const isConcrete = (w: Wall): boolean => w.kind === "exterior" || w.kind === "party";
const alongX = (w: Wall): boolean => Math.abs(w.b[1] - w.a[1]) < EPS;
const INTERIOR_CX = (INTERIOR.minX + INTERIOR.maxX) / 2;
const INTERIOR_CZ = (INTERIOR.minZ + INTERIOR.maxZ) / 2;

/** Room on a side of a partition run at local u (side = ±1 for ±w). */
export function runSideRoom(run: { frame: WallFrame; half: number }, u: number, side: number): Room | null {
  const p = run.frame.toWorld(u, 0, side * (run.half + 0.05));
  return roomAt(p.x, p.z);
}

function openingFor(w: Wall, frame: WallFrame, op: Opening, half: number): RunOpening {
  const pa = wallPoint(w, op.from),
    pb = wallPoint(w, op.to);
  const ua = frame.u(pa[0], pa[1]),
    ub = frame.u(pb[0], pb[1]);
  const r0 = Math.min(ua, ub),
    r1 = Math.max(ua, ub);
  let hingeSide: -1 | 1 = -1;
  if (op.hinge) {
    const uh = op.hinge === "a" ? ua : ub;
    hingeSide = Math.abs(uh - r0) < Math.abs(uh - r1) ? -1 : 1;
  }
  let swingSide: -1 | 1 = 1;
  if (op.into) {
    const mid = (r0 + r1) / 2;
    const p = frame.toWorld(mid, 0, half + 0.3);
    const r = roomAt(p.x, p.z);
    swingSide = r && r.id === op.into ? 1 : -1;
  }
  return { op, r0, r1, sill: op.sill, head: op.head, hingeSide, swingSide };
}

// ------------------------------------------------------------------ concrete frames
function concreteFrame(w: Wall): { frame: WallFrame; half: number } {
  const half = w.thickness / 2;
  if (alongX(w)) {
    const c = w.a[1];
    const sgn = INTERIOR_CZ > c ? 1 : -1;
    return { frame: new WallFrame(0, c, sgn, 0), half };
  }
  const c = w.a[0];
  const sgn = INTERIOR_CX > c ? 1 : -1;
  return { frame: new WallFrame(c, 0, 0, -sgn), half };
}

/** Interior face line of a concrete wall: axis ("x" = wall along x, face is z = value). */
function concreteFace(w: Wall): { alongX: boolean; value: number; lo: number; hi: number } {
  const half = w.thickness / 2;
  if (alongX(w)) {
    const c = w.a[1];
    const sgn = INTERIOR_CZ > c ? 1 : -1;
    return { alongX: true, value: c + sgn * half, lo: Math.min(w.a[0], w.b[0]), hi: Math.max(w.a[0], w.b[0]) };
  }
  const c = w.a[0];
  const sgn = INTERIOR_CX > c ? 1 : -1;
  return { alongX: false, value: c + sgn * half, lo: Math.min(w.a[1], w.b[1]), hi: Math.max(w.a[1], w.b[1]) };
}

// ------------------------------------------------------------------ the layout
export interface Layout {
  partitions: PartitionRun[];
  concrete: ConcreteRun[];
  byId: Map<string, PartitionRun | ConcreteRun>;
}

let cached: Layout | null = null;

/** Compute (once) the structural layout of the plan. */
export function layout(): Layout {
  if (cached) return cached;
  const parts = WALLS.filter((w) => !isConcrete(w));
  const concs = WALLS.filter(isConcrete);

  // abutments collected in WORLD axis coordinates, converted to local u at the end
  const pending: Array<{ wallId: string; side: number; lo: number; hi: number; by: string }> = [];

  const onSegment = (E: [number, number], q: Wall): { on: boolean; atEnd: boolean } => {
    const L = wallLength(q);
    const dx = (q.b[0] - q.a[0]) / L,
      dz = (q.b[1] - q.a[1]) / L;
    const rx = E[0] - q.a[0],
      rz = E[1] - q.a[1];
    const t = rx * dx + rz * dz;
    const perp = Math.abs(rx * -dz + rz * dx);
    if (perp > EPS || t < -EPS || t > L + EPS) return { on: false, atEnd: false };
    return { on: true, atEnd: Math.abs(t) < EPS || Math.abs(t - L) < EPS };
  };

  const prelim = parts.map((w) => {
    const L = wallLength(w);
    const frame = new WallFrame(w.a[0], w.a[1], w.b[0] - w.a[0], w.b[1] - w.a[1]);
    return { w, frame, L, half: w.thickness / 2 };
  });

  const sideOf = (q: Wall, px: number, pz: number): number => {
    const f = new WallFrame(q.a[0], q.a[1], q.b[0] - q.a[0], q.b[1] - q.a[1]);
    return f.w(px, pz) >= 0 ? 1 : -1;
  };

  const runs: PartitionRun[] = [];
  for (const P of prelim) {
    const ends: Array<{ kind: EndKind; delta: number }> = [];
    for (let e = 0; e < 2; e++) {
      const E: [number, number] = e === 0 ? P.w.a : P.w.b;
      // interior point of P (to know which side of other walls it lies on)
      const mid = wallPoint(P.w, P.L / 2);
      let res: { kind: EndKind; delta: number } | null = null;

      // 1. concrete wall face
      for (const C of concs) {
        const f = concreteFace(C);
        const perpCoord = f.alongX ? E[1] : E[0];
        const along = f.alongX ? E[0] : E[1];
        if (Math.abs(perpCoord - f.value) < EPS && along >= f.lo - EPS && along <= f.hi + EPS) {
          res = { kind: "concrete", delta: WALL_FINISH_T };
          pending.push({ wallId: C.id, side: 1, lo: along - P.half, hi: along + P.half, by: P.w.id });
          break;
        }
      }
      // 2. other partitions
      if (!res) {
        const hits = prelim
          .filter((Q) => Q.w !== P.w)
          .map((Q) => ({ Q, ...onSegment(E, Q.w), collinear: alongX(Q.w) === alongX(P.w) }))
          .filter((h) => h.on);
        const register = (Q: Wall) => {
          // P's end covers Q's face over P's thickness, on the side of Q where P lies
          const along = alongX(Q) ? E[0] : E[1];
          const side = sideOf(Q, mid[0], mid[1]);
          pending.push({ wallId: Q.id, side, lo: along - P.half, hi: along + P.half, by: P.w.id });
        };
        if (hits.some((h) => h.collinear && h.atEnd)) {
          res = { kind: "butt", delta: 0 };
        } else {
          const strict = hits.find((h) => !h.collinear && !h.atEnd);
          if (strict) {
            res = { kind: "butt", delta: -strict.Q.half };
            register(strict.Q.w);
          } else {
            const corner = hits.find((h) => !h.collinear && h.atEnd);
            if (corner) {
              const cont = prelim.find(
                (R) => R.w !== P.w && R.w !== corner.Q.w && alongX(R.w) === alongX(corner.Q.w) && onSegment(E, R.w).on && onSegment(E, R.w).atEnd,
              );
              if (cont) {
                res = { kind: "butt", delta: -corner.Q.half };
                register(corner.Q.w);
                register(cont.w);
              } else if (!alongX(P.w)) {
                res = { kind: "free", delta: corner.Q.half };
              } else {
                res = { kind: "butt", delta: -corner.Q.half };
                register(corner.Q.w);
              }
            }
          }
        }
      }
      ends.push(res ?? { kind: "free", delta: 0 });
    }
    const openings = P.w.openings.map((op) => openingFor(P.w, P.frame, op, P.half)).sort((a, b) => a.r0 - b.r0);
    runs.push({
      wall: P.w,
      frame: P.frame,
      half: P.half,
      u0: 0 - ends[0].delta,
      u1: P.L + ends[1].delta,
      end0: ends[0].kind,
      end1: ends[1].kind,
      openings,
      abutPos: [],
      abutNeg: [],
    });
  }

  // concrete runs
  const cruns: ConcreteRun[] = concs.map((w) => {
    const { frame, half } = concreteFrame(w);
    let c0: number, c1: number, g0: number, g1: number;
    if (alongX(w)) {
      // x-walls own the corners: full plan length; the finish runs into the recess corners
      const xa = Math.min(w.a[0], w.b[0]),
        xb = Math.max(w.a[0], w.b[0]);
      const ua = frame.u(xa, w.a[1]),
        ub = frame.u(xb, w.a[1]);
      c0 = Math.min(ua, ub);
      c1 = Math.max(ua, ub);
      const fa = frame.u(INTERIOR.minX - WALL_FINISH_T, w.a[1]),
        fb = frame.u(INTERIOR.maxX + WALL_FINISH_T, w.a[1]);
      g0 = Math.min(fa, fb);
      g1 = Math.max(fa, fb);
    } else {
      // z-walls span between the x-walls' concrete; finish spans the interior exactly
      const ua = frame.u(w.a[0], INTERIOR.minZ - WALL_FINISH_T),
        ub = frame.u(w.a[0], INTERIOR.maxZ + WALL_FINISH_T);
      c0 = Math.min(ua, ub);
      c1 = Math.max(ua, ub);
      const fa = frame.u(w.a[0], INTERIOR.minZ),
        fb = frame.u(w.a[0], INTERIOR.maxZ);
      g0 = Math.min(fa, fb);
      g1 = Math.max(fa, fb);
    }
    const openings = w.openings.map((op) => openingFor(w, frame, op, half)).sort((a, b) => a.r0 - b.r0);
    return { wall: w, frame, half, u0: c0, u1: c1, f0: g0, f1: g1, openings, abut: [], segments: [] };
  });

  const byId = new Map<string, PartitionRun | ConcreteRun>();
  for (const r of runs) byId.set(r.wall.id, r);
  for (const r of cruns) byId.set(r.wall.id, r);

  // convert pending abutments to local u
  for (const p of pending) {
    const run = byId.get(p.wallId)!;
    const w = run.wall;
    const pa = alongX(w) ? run.frame.u(p.lo, w.a[1]) : run.frame.u(w.a[0], p.lo);
    const pb = alongX(w) ? run.frame.u(p.hi, w.a[1]) : run.frame.u(w.a[0], p.hi);
    const ab: Abutment = { lo: Math.min(pa, pb), hi: Math.max(pa, pb), by: p.by };
    if ("abutPos" in run) {
      ab.lo = Math.max(ab.lo, run.u0);
      ab.hi = Math.min(ab.hi, run.u1);
      if (ab.hi - ab.lo > EPS) (p.side > 0 ? run.abutPos : run.abutNeg).push(ab);
    } else {
      run.abut.push(ab);
    }
  }
  for (const r of runs) {
    r.abutPos.sort((a, b) => a.lo - b.lo);
    r.abutNeg.sort((a, b) => a.lo - b.lo);
  }

  // concrete segments: split at partition centre lines (abutment centres)
  for (const c of cruns) {
    c.abut.sort((a, b) => a.lo - b.lo);
    const cuts = c.abut.map((a) => (a.lo + a.hi) / 2).filter((u) => u > c.u0 + EPS && u < c.u1 - EPS);
    const bounds = [c.u0, ...cuts, c.u1];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const lo = Math.max(bounds[i], c.f0),
        hi = Math.min(bounds[i + 1], c.f1);
      const um = (lo + hi) / 2;
      const p = c.frame.toWorld(um, 0, c.half + 0.05);
      const room = roomAt(p.x, p.z);
      if (!room) throw new Error(`structure: no room inside concrete segment ${c.wall.id} @u=${um}`);
      c.segments.push({ u0: bounds[i], u1: bounds[i + 1], room });
    }
  }

  cached = { partitions: runs, concrete: cruns, byId };
  return cached;
}

// ------------------------------------------------------------------ faces of partitions
/** Exposed u-intervals of a partition face (side ±1), i.e. not covered by abutting walls. */
export function partitionFaceIntervals(run: PartitionRun, side: number): Interval[] {
  const ab = side > 0 ? run.abutPos : run.abutNeg;
  return intervalsSubtractAll([[run.u0, run.u1]], ab.map((a) => [a.lo, a.hi] as Interval));
}

/** Exposed u-intervals of a concrete wall's interior finish (inside a u range). */
export function concreteFaceIntervals(run: ConcreteRun, u0 = -Infinity, u1 = Infinity): Interval[] {
  const lo = Math.max(run.f0, u0),
    hi = Math.min(run.f1, u1);
  if (hi - lo <= EPS) return [];
  return intervalsSubtractAll([[lo, hi]], run.abut.map((a) => [a.lo, a.hi] as Interval));
}

// ------------------------------------------------------------------ footprints
export interface Footprint {
  wallId: string;
  kind: WallKind;
  /** Whole footprint in plan (concrete: including the finish recess). */
  full: Rect2;
  /** Rough openings through which the floor continues (doors, archways, sliding door). */
  passages: Rect2[];
  /** All openings (any sill) as plan rectangles across the full thickness. */
  openings: Rect2[];
}

let fpCache: Footprint[] | null = null;

export function footprints(): Footprint[] {
  if (fpCache) return fpCache;
  const L = layout();
  const out: Footprint[] = [];
  for (const r of L.partitions) {
    const full = r.frame.planRect(r.u0, r.u1, -r.half, r.half);
    const ops = r.openings.map((o) => r.frame.planRect(o.r0, o.r1, -r.half, r.half));
    out.push({ wallId: r.wall.id, kind: r.wall.kind, full, passages: r.openings.filter((o) => o.sill <= 1e-6).map((o) => r.frame.planRect(o.r0, o.r1, -r.half, r.half)), openings: ops });
  }
  for (const c of L.concrete) {
    const full = c.frame.planRect(c.u0, c.u1, -c.half, c.half);
    const ops = c.openings.map((o) => c.frame.planRect(o.r0, o.r1, -c.half, c.half));
    out.push({ wallId: c.wall.id, kind: c.wall.kind, full, passages: c.openings.filter((o) => o.sill <= 1e-6).map((o) => c.frame.planRect(o.r0, o.r1, -c.half, c.half)), openings: ops });
  }
  fpCache = out;
  return out;
}

/** Solid (non-passage) pieces of a footprint. */
export function solidPieces(fp: Footprint): Rect2[] {
  let pieces: Rect2[] = [fp.full];
  for (const p of fp.passages) pieces = rectsSubtract(pieces, p);
  return pieces;
}

// ------------------------------------------------------------------ thresholds
export interface Threshold {
  id: string;
  rect: Rect2;
  /** Floor assembly that owns the threshold part. */
  owner: RoomId;
  rooms: [RoomId, RoomId];
}

export const THRESHOLD_W = 0.08;

const FLOOR_PRIORITY: Record<string, number> = { tile: 3, carpet: 2, laminate: 1, concrete: 0 };

function ownerOf(a: Room, b: Room): RoomId {
  return (FLOOR_PRIORITY[a.floor] ?? 0) >= (FLOOR_PRIORITY[b.floor] ?? 0) ? a.id : b.id;
}

let thCache: Threshold[] | null = null;

export function thresholds(): Threshold[] {
  if (thCache) return thCache;
  const L = layout();
  const fps = footprints();
  const out: Threshold[] = [];
  const hw = THRESHOLD_W / 2;
  // 1. every door / archway through a partition gets a saddle across the full wall thickness
  //    (oak; the floors of both rooms stop at it, so no slivers of finish inside the opening)
  for (const r of L.partitions) {
    for (const o of r.openings) {
      if (o.sill > 1e-6) continue;
      const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => o.r0 + (o.r1 - o.r0) * t);
      let pair: [Room, Room] | null = null;
      for (const u of samples) {
        const a = runSideRoom(r, u, -1),
          b = runSideRoom(r, u, 1);
        if (!a || !b) continue;
        if (!pair || a.floor !== b.floor) pair = [a, b];
        if (a.floor !== b.floor) break;
      }
      if (!pair) continue;
      const into = o.op.into;
      const owner = pair[0].floor === pair[1].floor && into ? into : ownerOf(pair[0], pair[1]);
      out.push({
        id: `th_${o.op.id}`,
        rect: r.frame.planRect(o.r0, o.r1, -r.half, r.half),
        owner,
        rooms: [pair[0].id, pair[1].id],
      });
    }
  }
  // 2. open boundaries between rooms with different floors (no wall in between)
  const segs: Array<{ a: Room; b: Room; alongX: boolean; line: number; lo: number; hi: number }> = [];
  const indoor = ROOMS.filter((r) => !r.outdoor);
  for (let i = 0; i < indoor.length; i++) {
    for (let j = 0; j < indoor.length; j++) {
      if (i === j) continue;
      const A = indoor[i],
        B = indoor[j];
      if (Math.abs(A.x1 - B.x0) < EPS) {
        const lo = Math.max(A.z0, B.z0),
          hi = Math.min(A.z1, B.z1);
        if (hi - lo > EPS) segs.push({ a: A, b: B, alongX: false, line: A.x1, lo, hi });
      }
      if (Math.abs(A.z1 - B.z0) < EPS) {
        const lo = Math.max(A.x0, B.x0),
          hi = Math.min(A.x1, B.x1);
        if (hi - lo > EPS) segs.push({ a: A, b: B, alongX: true, line: A.z1, lo, hi });
      }
    }
  }
  const open: Array<{ a: Room; b: Room; r: Rect2; len: number }> = [];
  for (const s of segs) {
    if (s.a.floor === s.b.floor) continue;
    // the boundary line as a thin rectangle, minus solid wall pieces → open pieces
    let pieces: Rect2[] = [s.alongX ? rect(s.lo, s.hi, s.line - 1e-4, s.line + 1e-4) : rect(s.line - 1e-4, s.line + 1e-4, s.lo, s.hi)];
    for (const f of fps) for (const sp of solidPieces(f)) pieces = rectsSubtract(pieces, sp);
    for (const p of pieces) {
      const lo = s.alongX ? p.x0 : p.z0,
        hi = s.alongX ? p.x1 : p.z1;
      if (hi - lo < 0.02) continue;
      const r = s.alongX ? rect(lo - hw, hi + hw, s.line - hw, s.line + hw) : rect(s.line - hw, s.line + hw, lo - hw, hi + hw);
      open.push({ a: s.a, b: s.b, r, len: hi - lo });
    }
  }
  open.sort((p, q) => p.len - q.len);
  // snap the strip's long edges to nearby parallel wall faces (no finish slivers beside it)
  const SNAP = 0.03;
  for (const o of open) {
    const alongZ = o.r.z1 - o.r.z0 > o.r.x1 - o.r.x0;
    const edges = fps.flatMap((f) => (alongZ ? [f.full.x0, f.full.x1] : [f.full.z0, f.full.z1]));
    if (alongZ) {
      const lo = edges.filter((e) => e <= o.r.x0 + 1e-9 && e >= o.r.x0 - SNAP);
      const hi = edges.filter((e) => e >= o.r.x1 - 1e-9 && e <= o.r.x1 + SNAP);
      if (lo.length) o.r.x0 = Math.min(...lo);
      if (hi.length) o.r.x1 = Math.max(...hi);
    } else {
      const lo = edges.filter((e) => e <= o.r.z0 + 1e-9 && e >= o.r.z0 - SNAP);
      const hi = edges.filter((e) => e >= o.r.z1 - 1e-9 && e <= o.r.z1 + SNAP);
      if (lo.length) o.r.z0 = Math.min(...lo);
      if (hi.length) o.r.z1 = Math.max(...hi);
    }
  }
  let k = 0;
  for (const o of open) {
    let pieces: Rect2[] = [o.r];
    for (const t of out) pieces = rectsSubtract(pieces, t.rect);
    for (const f of fps) for (const sp of solidPieces(f)) pieces = rectsSubtract(pieces, sp);
    pieces = dropSlivers(mergeRects(pieces), 0.01);
    for (const p of pieces) {
      out.push({ id: `th_open_${o.a.id}_${o.b.id}_${k++}`, rect: p, owner: ownerOf(o.a, o.b), rooms: [o.a.id, o.b.id] });
    }
  }
  thCache = out;
  return out;
}

// ------------------------------------------------------------------ coverage
/**
 * Floor coverage of a room: its plan rectangle minus solid wall pieces (passages are covered by
 * thresholds) and minus every threshold, as disjoint merged rectangles. Finishes are laid by
 * clipping their plank/tile cells against this union (see clipToUnion), so the decomposition
 * itself does not create seams. `gap` optionally keeps the finish off the walls.
 */
export function floorCoverage(id: RoomId, gap = 0): Rect2[] {
  const room = roomById(id);
  let cov: Rect2[] = [rect(room.x0, room.x1, room.z0, room.z1)];
  for (const f of footprints()) {
    for (const piece of solidPieces(f)) cov = rectsSubtract(cov, gap > 0 ? rectInflate(piece, gap) : piece);
  }
  for (const t of thresholds()) cov = rectsSubtract(cov, t.rect);
  return dropSlivers(mergeRects(cov), 0.004);
}

/** Ceiling coverage of a room: plan rectangle minus full wall footprints. */
export function ceilingCoverage(id: RoomId): Rect2[] {
  const room = roomById(id);
  let cov: Rect2[] = [rect(room.x0, room.x1, room.z0, room.z1)];
  for (const f of footprints()) cov = rectsSubtract(cov, f.full);
  return dropSlivers(mergeRects(cov), 0.004);
}

// ------------------------------------------------------------------ metadata exports
export interface OpeningInfo {
  id: string;
  kind: OpeningKind;
  wallId: string;
  /** In an exterior wall (daylight, wind, light shafts). */
  exterior: boolean;
  /** Rooms on the -normal and +normal sides (null = outside / not modelled). */
  rooms: [RoomId | null, RoomId | null];
  /** Centre of the clear opening rectangle in the wall's centre plane. */
  center: { x: number; y: number; z: number };
  /** Horizontal unit normal of the wall plane, from rooms[0] towards rooms[1]. */
  normal: { x: number; y: number; z: number };
  /** Horizontal unit vector along the wall. */
  tangent: { x: number; y: number; z: number };
  /** Rough-opening width/height and vertical range (finished-floor based). */
  width: number;
  height: number;
  sill: number;
  head: number;
  /** Wall thickness (depth of the opening). */
  depth: number;
  /** Rough-opening corners in the wall's centre plane: bottom-a, bottom-b, top-b, top-a. */
  corners: Array<{ x: number; y: number; z: number }>;
  /** Door/window type filling it, or null for an open archway. */
  fill: "door" | "frontDoor" | "window" | "slidingDoor" | null;
}

export interface WallSegmentInfo {
  wallId: string;
  kind: WallKind;
  /** Centre-line endpoints (x, z) of this solid piece. */
  a: [number, number];
  b: [number, number];
  thickness: number;
  /** Vertical extent of the solid piece. */
  y0: number;
  y1: number;
  rooms: [RoomId | null, RoomId | null];
  /** Approximate airborne sound transmission loss (dB) of the construction. */
  transmissionLossDb: number;
  /** Surface density (kg/m²). */
  surfaceDensity: number;
}

const segRooms = (frame: WallFrame, half: number, u: number): [RoomId | null, RoomId | null] => {
  const a = frame.toWorld(u, 0, -(half + 0.05)),
    b = frame.toWorld(u, 0, half + 0.05);
  return [roomAt(a.x, a.z)?.id ?? null, roomAt(b.x, b.z)?.id ?? null];
};

export function openingInfos(): OpeningInfo[] {
  const L = layout();
  const out: OpeningInfo[] = [];
  const all: Array<{ run: PartitionRun | ConcreteRun; o: RunOpening }> = [];
  for (const r of L.partitions) for (const o of r.openings) all.push({ run: r, o });
  for (const r of L.concrete) for (const o of r.openings) all.push({ run: r, o });
  for (const { run, o } of all) {
    const f = run.frame;
    const um = (o.r0 + o.r1) / 2;
    const ym = (o.sill + o.head) / 2;
    const c = f.toWorld(um, ym, 0);
    const corners = [f.toWorld(o.r0, o.sill, 0), f.toWorld(o.r1, o.sill, 0), f.toWorld(o.r1, o.head, 0), f.toWorld(o.r0, o.head, 0)];
    out.push({
      id: o.op.id,
      kind: o.op.kind,
      wallId: run.wall.id,
      exterior: run.wall.kind === "exterior",
      rooms: segRooms(f, run.half, um),
      center: c,
      normal: { x: f.nx, y: 0, z: f.nz },
      tangent: { x: f.dx, y: 0, z: f.dz },
      width: o.r1 - o.r0,
      height: o.head - o.sill,
      sill: o.sill,
      head: o.head,
      depth: run.half * 2,
      corners,
      fill: o.op.kind === "opening" ? null : o.op.kind,
    });
  }
  return out;
}

/**
 * u values along a run where the room on either side can change: every room rectangle edge
 * crossing the run's axis (room boundaries lie on partition centre lines and open-plan edges,
 * so this includes the concrete segment boundaries of layout()).
 */
function roomCuts(run: PartitionRun | ConcreteRun, lo: number, hi: number): number[] {
  const f = run.frame;
  const vals = new Set<number>();
  for (const r of ROOMS) {
    for (const v of Math.abs(f.dx) > 0.5 ? [r.x0, r.x1] : [r.z0, r.z1]) {
      const u = Math.abs(f.dx) > 0.5 ? f.u(v, f.oz) : f.u(f.ox, v);
      if (u > lo + 1e-6 && u < hi - 1e-6) vals.add(u);
    }
  }
  return [...vals].sort((a, b) => a - b);
}

/**
 * Splits [u0, u1] of a run into pieces with constant rooms on both sides. Pieces that face no
 * room at all (corner stubs inside another wall's thickness) are merged into their neighbour.
 */
export function splitByRooms(run: PartitionRun | ConcreteRun, u0: number, u1: number): Array<{ u0: number; u1: number; rooms: [RoomId | null, RoomId | null] }> {
  const xs = [u0, ...roomCuts(run, u0, u1), u1];
  const raw = [];
  for (let i = 0; i + 1 < xs.length; i++) raw.push({ u0: xs[i], u1: xs[i + 1], rooms: segRooms(run.frame, run.half, (xs[i] + xs[i + 1]) / 2) });
  const out: typeof raw = [];
  const same = (a: [RoomId | null, RoomId | null], b: [RoomId | null, RoomId | null]) => a[0] === b[0] && a[1] === b[1];
  const empty = (r: [RoomId | null, RoomId | null]) => r[0] === null && r[1] === null;
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && (same(last.rooms, p.rooms) || empty(p.rooms))) last.u1 = p.u1;
    else if (last && empty(last.rooms)) out[out.length - 1] = { u0: last.u0, u1: p.u1, rooms: p.rooms };
    else out.push({ ...p });
  }
  return out;
}

export function wallSegmentInfos(): WallSegmentInfo[] {
  const L = layout();
  const out: WallSegmentInfo[] = [];
  const add = (run: PartitionRun | ConcreteRun, u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
    const f = run.frame;
    const concrete = !("abutPos" in run);
    const insulated = !concrete && !!run.wall.insulated;
    for (const piece of splitByRooms(run, u0, u1)) {
      if (piece.u1 - piece.u0 < 0.005) continue;
      const a = f.toWorld(piece.u0, 0, 0),
        b = f.toWorld(piece.u1, 0, 0);
      out.push({
        wallId: run.wall.id,
        kind: run.wall.kind,
        a: [a.x, a.z],
        b: [b.x, b.z],
        thickness: run.half * 2,
        y0,
        y1,
        rooms: piece.rooms,
        transmissionLossDb: concrete ? 55 : insulated ? 42 : 34,
        surfaceDensity: concrete ? 2400 * (run.half * 2 - WALL_FINISH_T) + 700 * WALL_FINISH_T : 2 * 700 * 0.0125 + (insulated ? 3 : 0) + 4,
      });
    }
  };
  for (const run of [...L.partitions, ...L.concrete]) {
    const isConc = !("abutPos" in run);
    const lo = run.u0,
      hi = run.u1;
    const yb = isConc ? SLAB_BOTTOM_Y : SLAB_TOP_Y;
    const yt = isConc ? STRUCTURE_TOP_Y : CEILING_Y + 0.05;
    let cursor = lo;
    for (const o of run.openings) {
      add(run, cursor, o.r0, yb, yt);
      add(run, o.r0, o.r1, yb, Math.max(yb, o.sill));
      add(run, o.r0, o.r1, o.head, yt);
      cursor = o.r1;
    }
    add(run, cursor, hi, yb, yt);
  }
  return out;
}
