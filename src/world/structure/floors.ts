// Floor finishes, one assembly per room: oak laminate planks (staggered rows, click joints,
// floating on an acoustic foam underlay), porcelain tiles on a mortar bed (grout shows in the
// joints), carpet slabs on a foam pad (tack strips at the walls), and the oak saddles/thresholds
// owned by the room. Finished surface at y = 0. World coordinates (identity frame). PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder } from "../../objects/lib/builder.ts";
import { Rng } from "../../core/rng.ts";
import { roomById, type RoomId } from "../plan.ts";
import {
  CARPET_T,
  FLOOR_JOINT,
  FLOOR_TILE,
  FLOOR_TILE_T,
  FLOOR_Y,
  LAMINATE_T,
  PLANK_LEN,
  PLANK_W,
  SLAB_TOP_Y,
  roomFaces,
} from "./levels.ts";
import { floorCoverage, thresholds } from "./layout.ts";
import { Fixings, PAL, bondAt, mid, newBuilder, seedOf, worldAt } from "./common.ts";
import { clipToUnion, rectArea, rectsBounds, splitEven, type Rect2 } from "./rects.ts";

const EPS = 1e-6;

/** Box from plan ranges (x, y, z) in world coordinates. */
function boxW(b: Builder, name: string, mat: Parameters<Builder["box"]>[1], surf: Parameters<Builder["box"]>[2], x: [number, number], y: [number, number], z: [number, number], o: Parameters<Builder["box"]>[5] = {}): string {
  return b.box(name, mat, surf, [x[1] - x[0], y[1] - y[0], z[1] - z[0]], [mid(x[0], x[1]), mid(y[0], y[1]), mid(z[0], z[1])], o);
}

interface Piece extends Rect2 {
  name: string;
  row: number;
}

/** Bond pieces that share an edge: `endJ` for x-adjacent (same row), `sideJ` per metre of z-adjacent overlap. */
function bondAdjacent(b: Builder, pieces: Piece[], y: number, kind: "friction" | "glue" | "mortar", endJ: number, sideJPerM: number, minJ: number): void {
  const sorted = [...pieces].sort((p, q) => p.x0 - q.x0);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const c = sorted[j];
      if (c.x0 > a.x1 + 1e-4) break;
      // x-adjacent (end joint)
      if (Math.abs(a.x1 - c.x0) < 1e-5 || Math.abs(c.x1 - a.x0) < 1e-5) {
        const oz0 = Math.max(a.z0, c.z0),
          oz1 = Math.min(a.z1, c.z1);
        if (oz1 - oz0 > 0.005) {
          const x = Math.abs(a.x1 - c.x0) < 1e-5 ? a.x1 : a.x0;
          bondAt(b, a.name, c.name, kind, endJ, [x, y, mid(oz0, oz1)]);
        }
        continue;
      }
      // z-adjacent (long side)
      if (Math.abs(a.z1 - c.z0) < 1e-5 || Math.abs(c.z1 - a.z0) < 1e-5) {
        const ox0 = Math.max(a.x0, c.x0),
          ox1 = Math.min(a.x1, c.x1);
        if (ox1 - ox0 > 0.02) {
          const z = Math.abs(a.z1 - c.z0) < 1e-5 ? a.z1 : a.z0;
          bondAt(b, a.name, c.name, kind, Math.max(minJ, sideJPerM * (ox1 - ox0)), [mid(ox0, ox1), y, z]);
        }
      }
    }
  }
}

/** Flat panels (underlay, beds, pads) covering the union, ≤ max per side, world-bonded. */
function addPanels(
  b: Builder,
  prefix: string,
  cov: Rect2[],
  max: number,
  y: [number, number],
  mat: Parameters<Builder["box"]>[1],
  surf: Parameters<Builder["box"]>[2],
  o: Parameters<Builder["box"]>[5],
  world: { kind: "friction" | "glue" | "mortar"; perM2: number; min: number },
): Piece[] {
  const out: Piece[] = [];
  let k = 0;
  for (const r of cov) {
    const xs = splitEven(r.x0, r.x1, max),
      zs = splitEven(r.z0, r.z1, max);
    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const name = `${prefix}${k++}`;
        boxW(b, name, mat, surf, [xs[i], xs[i + 1]], y, [zs[j], zs[j + 1]], o);
        const area = (xs[i + 1] - xs[i]) * (zs[j + 1] - zs[j]);
        worldAt(b, name, world.kind, Math.max(world.min, world.perM2 * area), [mid(xs[i], xs[i + 1]), y[0], mid(zs[j], zs[j + 1])]);
        out.push({ name, x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], row: j });
      }
    }
  }
  return out;
}

/** Tint variation for printed laminate planks. */
function plankTint(rng: Rng): number {
  const t = rng.range(0.9, 1.0);
  const warm = rng.range(-0.02, 0.02);
  const r = Math.round(255 * Math.min(1, t + warm)),
    g = Math.round(255 * t * 0.985),
    bl = Math.round(255 * Math.max(0, t - warm) * 0.96);
  return (r << 16) | (g << 8) | bl;
}

function addLaminate(b: Builder, id: RoomId, cov: Rect2[]): void {
  // 8 mm acoustic underlay sheets, floating (friction), seams taped
  const under = addPanels(b, "underlay_", cov, 1.25, [SLAB_TOP_Y, FLOOR_Y - LAMINATE_T], "foam", "foam", { tint: PAL.underlay, tags: ["underlay"] }, { kind: "friction", perM2: 6, min: 3 });
  bondAdjacent(b, under, SLAB_TOP_Y + 0.004, "glue", 3, 2, 2);
  const rng = new Rng(seedOf(`laminate:${id}`));
  const bb = rectsBounds(cov);
  const main = [...cov].sort((p, q) => rectArea(q) - rectArea(p))[0];
  const z0 = main.z0;
  const kMin = Math.floor((bb.z0 - z0) / PLANK_W - EPS),
    kMax = Math.ceil((bb.z1 - z0) / PLANK_W + EPS);
  const pieces: Piece[] = [];
  let prevOff = -1;
  let n = 0;
  const y0 = FLOOR_Y - LAMINATE_T;
  for (let k = kMin; k < kMax; k++) {
    const za = z0 + k * PLANK_W,
      zb = za + PLANK_W;
    const strip: Rect2 = { x0: bb.x0, x1: bb.x1, z0: za, z1: zb };
    const rowPieces = clipToUnion(strip, cov);
    if (!rowPieces.length) continue;
    // stagger: ≥ 0.3 m from the previous row's joints, and no end piece shorter than 0.25 m
    const longest = rowPieces.reduce((p, q) => (q.x1 - q.x0 > p.x1 - p.x0 ? q : p));
    let best = 0,
      bestScore = -Infinity;
    for (let t = 0; t < 16; t++) {
      const off = rng.range(0, PLANK_LEN);
      let d = Math.abs(off - prevOff) % PLANK_LEN;
      d = Math.min(d, PLANK_LEN - d);
      const staggerOk = prevOff < 0 || d >= 0.3;
      const first = ((longest.x0 - bb.x0 - off) % PLANK_LEN + PLANK_LEN) % PLANK_LEN;
      const head = PLANK_LEN - first; // length of the first piece in the longest run
      const tail = (((longest.x1 - bb.x0 - off) % PLANK_LEN) + PLANK_LEN) % PLANK_LEN;
      const minEnd = Math.min(head < 1e-6 ? PLANK_LEN : head, tail < 1e-6 ? PLANK_LEN : tail);
      const score = (staggerOk ? 10 : 0) + Math.min(minEnd, 0.4);
      if (score > bestScore) {
        bestScore = score;
        best = off;
      }
    }
    prevOff = best;
    const joints: number[] = [];
    for (let x = bb.x0 + best - PLANK_LEN; x < bb.x1 + PLANK_LEN; x += PLANK_LEN) joints.push(x);
    for (let j = 0; j + 1 < joints.length; j++) {
      const cell: Rect2 = { x0: joints[j], x1: joints[j + 1], z0: za, z1: zb };
      for (const p of clipToUnion(cell, cov)) {
        if (p.x1 - p.x0 < 0.02 || p.z1 - p.z0 < 0.01) continue;
        const name = `plank_${n++}`;
        // NOT `supported`: a pried-up plank is a free 1.2 m board that must be able to snap
        // (global failure; its slenderness already lowers the threshold realistically)
        boxW(b, name, "hardwood", "wood_oak", [p.x0, p.x1], [y0, FLOOR_Y], [p.z0, p.z1], {
          tint: plankTint(rng),
          grain: "x",
          endGrain: false,
          tags: ["plank", "floor"],
        });
        worldAt(b, name, "friction", 8 + 10 * (p.x1 - p.x0), [mid(p.x0, p.x1), y0, mid(p.z0, p.z1)]);
        pieces.push({ ...p, name, row: k });
        finishPieces.push({ ...p, name, row: k });
      }
    }
  }
  // click-lock joints: short ends and long sides
  bondAdjacent(b, pieces, FLOOR_Y - LAMINATE_T / 2, "friction", 6, 16, 3);
}

function addTiles(b: Builder, id: RoomId, cov: Rect2[]): void {
  const beds = addPanels(b, "bed_", cov, 1.2, [SLAB_TOP_Y, FLOOR_Y - FLOOR_TILE_T], "plaster", "grout", { supported: true, tags: ["tile-bed"] }, { kind: "mortar", perM2: 60, min: 12 });
  bondAdjacent(b, beds, FLOOR_Y - FLOOR_TILE_T - 0.005, "mortar", 10, 8, 4);
  const bb = rectsBounds(cov);
  // grid phase: tile centred or joint centred on the room centre, whichever leaves bigger edge cuts
  const best = (lo: number, hi: number): number => {
    const c = mid(lo, hi);
    let pick = c,
      score = -1;
    for (const o of [c - FLOOR_TILE / 2, c]) {
      const first = (((o - lo) % FLOOR_TILE) + FLOOR_TILE) % FLOOR_TILE || FLOOR_TILE;
      const last = (((hi - o) % FLOOR_TILE) + FLOOR_TILE) % FLOOR_TILE || FLOOR_TILE;
      const s = Math.min(first, last);
      if (s > score) {
        score = s;
        pick = o;
      }
    }
    return pick;
  };
  const gx = best(bb.x0, bb.x1),
    gz = best(bb.z0, bb.z1);
  const x0 = gx - Math.ceil((gx - bb.x0) / FLOOR_TILE + EPS) * FLOOR_TILE;
  const z0 = gz - Math.ceil((gz - bb.z0) / FLOOR_TILE + EPS) * FLOOR_TILE;
  const hj = FLOOR_JOINT / 2;
  const y0 = FLOOR_Y - FLOOR_TILE_T;
  let n = 0;
  for (let cx = x0; cx < bb.x1 - EPS; cx += FLOOR_TILE) {
    for (let cz = z0; cz < bb.z1 - EPS; cz += FLOOR_TILE) {
      const cell: Rect2 = { x0: cx, x1: cx + FLOOR_TILE, z0: cz, z1: cz + FLOOR_TILE };
      for (const p of clipToUnion(cell, cov)) {
        const a = Math.max(p.x0, cx + hj),
          c = Math.min(p.x1, cx + FLOOR_TILE - hj),
          d = Math.max(p.z0, cz + hj),
          e = Math.min(p.z1, cz + FLOOR_TILE - hj);
        if (c - a < 0.02 || e - d < 0.02) continue;
        const name = `tile_${n++}`;
        finishPieces.push({ name, x0: a, x1: c, z0: d, z1: e, row: 0 });
        boxW(b, name, "tile", "tile_porcelain", [a, c], [y0, FLOOR_Y], [d, e], {
          tint: PAL.porcelain,
          supported: true,
          tags: ["tile", "floor"],
          uvOffset: [mid(a, c) - cx, mid(d, e) - cz],
        });
        let bonded = 0;
        for (const bd of beds) {
          const ox = Math.min(c, bd.x1) - Math.max(a, bd.x0),
            oz = Math.min(e, bd.z1) - Math.max(d, bd.z0);
          if (ox > 0.002 && oz > 0.002) {
            bondAt(b, name, bd.name, "mortar", Math.max(3, (35 * ox * oz) / (FLOOR_TILE * FLOOR_TILE)), [mid(Math.max(a, bd.x0), Math.min(c, bd.x1)), y0, mid(Math.max(d, bd.z0), Math.min(e, bd.z1))]);
            bonded++;
          }
        }
        if (!bonded) worldAt(b, name, "mortar", 20, [mid(a, c), y0, mid(d, e)]);
      }
    }
  }
}

function addCarpet(b: Builder, id: RoomId, cov: Rect2[]): void {
  const pads = addPanels(b, "pad_", cov, 1.25, [SLAB_TOP_Y, FLOOR_Y - CARPET_T], "foam", "foam", { tint: PAL.carpetPad, tags: ["carpet-pad"] }, { kind: "glue", perM2: 8, min: 4 });
  bondAdjacent(b, pads, SLAB_TOP_Y + 0.005, "glue", 3, 2, 2);
  const faces = roomFaces(id);
  const pieces: Piece[] = [];
  let k = 0;
  for (const r of cov) {
    const xs = splitEven(r.x0, r.x1, 1.3),
      zs = splitEven(r.z0, r.z1, 1.3);
    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const name = `carpet_${k++}`;
        const x: [number, number] = [xs[i], xs[i + 1]],
          z: [number, number] = [zs[j], zs[j + 1]];
        boxW(b, name, "fabric", "carpet", x, [FLOOR_Y - CARPET_T, FLOOR_Y], z, { tint: PAL.carpet, tags: ["carpet", "floor"] });
        worldAt(b, name, "friction", 10, [mid(x[0], x[1]), FLOOR_Y - CARPET_T, mid(z[0], z[1])]);
        // tack strips along the walls
        const edges: Array<[boolean, number, number]> = [
          [Math.abs(x[0] - faces.x0) < 0.01, x[0], mid(z[0], z[1])],
          [Math.abs(x[1] - faces.x1) < 0.01, x[1], mid(z[0], z[1])],
        ];
        const fx = new Fixings();
        for (const [on, ex, ez] of edges) if (on) fx.world(name, "nail", 25, [ex, FLOOR_Y - CARPET_T, ez]);
        if (Math.abs(z[0] - faces.z0) < 0.01) fx.world(name, "nail", 25, [mid(x[0], x[1]), FLOOR_Y - CARPET_T, z[0]]);
        if (Math.abs(z[1] - faces.z1) < 0.01) fx.world(name, "nail", 25, [mid(x[0], x[1]), FLOOR_Y - CARPET_T, z[1]]);
        fx.flush(b);
        pieces.push({ name, x0: x[0], x1: x[1], z0: z[0], z1: z[1], row: j });
        finishPieces.push({ name, x0: x[0], x1: x[1], z0: z[0], z1: z[1], row: j });
      }
    }
  }
  // seam tape
  bondAdjacent(b, pieces, FLOOR_Y - CARPET_T / 2, "glue", 8, 6, 4);
}

/** Finish pieces (planks / tiles / carpet) of this floor, for edge bonds to thresholds. */
const finishPieces: Piece[] = [];

function addThresholds(b: Builder, id: RoomId): void {
  for (const t of thresholds()) {
    if (t.owner !== id) continue;
    const r = t.rect;
    const along = r.x1 - r.x0 >= r.z1 - r.z0 ? "x" : "z";
    const name = t.id;
    boxW(b, name, "hardwood", "wood_oak", [r.x0, r.x1], [SLAB_TOP_Y, FLOOR_Y], [r.z0, r.z1], { tint: 0xd9c3a3, grain: along, tags: ["threshold", "floor"] });
    const len = along === "x" ? r.x1 - r.x0 : r.z1 - r.z0;
    // glued and nailed down every ~0.6 m (one bond with the summed strength)
    const n = Math.max(1, Math.round(len / 0.6));
    worldAt(b, name, "nail", 40 * n, [mid(r.x0, r.x1), SLAB_TOP_Y, mid(r.z0, r.z1)]);
    // edge-glued to the finish it meets (transition strip)
    for (const p of finishPieces) {
      const tx = Math.abs(p.x1 - r.x0) < 1e-5 || Math.abs(p.x0 - r.x1) < 1e-5;
      const tz = Math.abs(p.z1 - r.z0) < 1e-5 || Math.abs(p.z0 - r.z1) < 1e-5;
      const oz = Math.min(p.z1, r.z1) - Math.max(p.z0, r.z0),
        ox = Math.min(p.x1, r.x1) - Math.max(p.x0, r.x0);
      if (tx && oz > 0.01) bondAt(b, name, p.name, "glue", 6, [Math.abs(p.x1 - r.x0) < 1e-5 ? r.x0 : r.x1, FLOOR_Y - 0.005, mid(Math.max(p.z0, r.z0), Math.min(p.z1, r.z1))]);
      else if (tz && ox > 0.01) bondAt(b, name, p.name, "glue", 6, [mid(Math.max(p.x0, r.x0), Math.min(p.x1, r.x1)), FLOOR_Y - 0.005, Math.abs(p.z1 - r.z0) < 1e-5 ? r.z0 : r.z1]);
    }
  }
}

const FINISH_NAMES: Record<string, string> = { laminate: "Laminate Floor", tile: "Tile Floor", carpet: "Carpet", concrete: "Concrete Floor" };
const FINISH_VALUE: Record<string, number> = { laminate: 38, tile: 85, carpet: 30, concrete: 20 };

export function buildFloor(id: RoomId): AssemblyDef {
  const room = roomById(id);
  const cov = floorCoverage(id);
  const area = cov.reduce((s, r) => s + rectArea(r), 0);
  const b = newBuilder(`floor_${room.floor}`, `${FINISH_NAMES[room.floor]} — ${room.name}`, "structure", Math.round(area * (FINISH_VALUE[room.floor] ?? 40)));
  finishPieces.length = 0;
  if (room.floor === "laminate") addLaminate(b, id, cov);
  else if (room.floor === "tile") addTiles(b, id, cov);
  else if (room.floor === "carpet") addCarpet(b, id, cov);
  else throw new Error(`structure: no indoor floor builder for ${room.floor}`);
  addThresholds(b, id);
  const def = b.build();
  def.room = id;
  return def;
}
