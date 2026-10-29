// Things mounted on a finished wall face, shared by concrete and stud walls: glazed wall tiles
// on an adhesive bed, MDF baseboards, switch/outlet cover plates. Works in the wall's local
// frame (u along the wall, y up, w across; the room lies on the `side`·w side). PURE.

import type { Builder } from "../../objects/lib/builder.ts";
import { roomAt, type Room, type RoomId } from "../plan.ts";
import {
  BASEBOARD_H,
  BASEBOARD_T,
  ELEC_PLATE_H,
  ELEC_PLATE_T,
  ELEC_PLATE_W,
  NO_BASEBOARD,
  WALL_JOINT,
  WALL_TILE,
  WALL_TILE_BED_T,
  WALL_TILE_T,
  WALL_TILE_ZONES,
  roomFaces,
  type RoomSide,
  type WallTileZone,
} from "./levels.ts";
import type { WallFrame } from "./layout.ts";
import { BoxIndex, PAL, bondAt, boxR, fasteners, frontFace, mid, trimFaces, type Interval, type V3 } from "./common.ts";
import { clipToUnion, intervalsSubtract, splitEven, type Rect2 } from "./rects.ts";
import type { ElecPoint } from "./services.ts";

/** Rectangle on a wall face in local (u, y). */
export interface FaceRect {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

export interface FaceCtx {
  b: Builder;
  idx: BoxIndex;
  frame: WallFrame;
  /** Room on the side·w side. */
  side: 1 | -1;
  /** |w| of the finished face plane. */
  faceW: number;
  /** Visible u-intervals of the face (clipped to the rooms' clear faces), with their room. */
  visible: Array<{ lo: number; hi: number; room: Room; loCorner: boolean; hiCorner: boolean }>;
  /** Roles of parts forming the finished face (sheets) — tiles/plates bond to them. */
  substrateRoles: string[];
  /** Roles of parts that take nails (studs, plates, concrete cells). */
  fixRoles: string[];
  /** Obstacles on the face (casings, openings, window boards). */
  obstacles: FaceRect[];
  /** Prefix for part names on this face. */
  prefix: string;
}

/** Which wall of the room this face is, from the room-facing normal. */
export function roomSideOf(frame: WallFrame, side: number): RoomSide {
  const rx = frame.nx * side,
    rz = frame.nz * side;
  if (rz > 0.5) return "s";
  if (rz < -0.5) return "n";
  if (rx > 0.5) return "w";
  return "e";
}

/** True for faces whose normal runs along x (rooms' east/west walls). */
export function isEWFace(frame: WallFrame): boolean {
  return Math.abs(frame.nx) > 0.5;
}

/** Local u-range of a room's clear face along this wall. */
export function roomFaceRange(frame: WallFrame, room: RoomId): Interval {
  const f = roomFaces(room);
  if (Math.abs(frame.dx) > 0.5) {
    const a = frame.u(f.x0, 0),
      b = frame.u(f.x1, 0);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const a = frame.u(0, f.z0),
    b = frame.u(0, f.z1);
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Visible intervals of a face: split exposed intervals where the room changes and clip each to
 * its room's clear face. `cornerAt(u)` says whether an interval end is an inside corner
 * (perpendicular wall face) — false for free wall ends.
 */
export function visibleIntervals(
  frame: WallFrame,
  side: number,
  faceW: number,
  exposed: Interval[],
  cornerAt: (u: number) => boolean,
): FaceCtx["visible"] {
  const out: FaceCtx["visible"] = [];
  const roomOf = (u: number): Room | null => {
    const p = frame.toWorld(u, 0, side * (faceW + 0.05));
    return roomAt(p.x, p.z);
  };
  for (const [a, b] of exposed) {
    // sample room changes along the interval
    const n = Math.max(2, Math.ceil((b - a) / 0.05));
    let segStart = a;
    let cur = roomOf(a + Math.min(0.02, (b - a) / 2));
    const flush = (end: number, room: Room | null) => {
      if (!room || room.outdoor) return;
      const [rl, rh] = roomFaceRange(frame, room.id);
      const lo = Math.max(segStart, rl),
        hi = Math.min(end, rh);
      if (hi - lo > 0.01) out.push({ lo, hi, room, loCorner: false, hiCorner: false });
    };
    for (let i = 1; i <= n; i++) {
      const u = a + ((b - a) * i) / n;
      const r = roomOf(Math.min(u, b - 0.02));
      if (i === n || (r && cur && r.id !== cur.id)) {
        const end = i === n ? b : u;
        flush(end, cur);
        segStart = end;
        cur = r;
      }
    }
  }
  for (const v of out) {
    v.loCorner = cornerAt(v.lo);
    v.hiCorner = cornerAt(v.hi);
  }
  return out;
}

// ------------------------------------------------------------------ baseboards
function noBaseboard(room: Room, rs: RoomSide, frame: WallFrame, lo: number, hi: number): Interval[] {
  let list: Interval[] = [[lo, hi]];
  for (const nb of NO_BASEBOARD) {
    if (nb.room !== room.id) continue;
    if (nb.side !== "*" && nb.side !== rs) continue;
    // nb.from/to are world coordinates along the wall (x for n/s walls, z for e/w)
    const ew = rs === "e" || rs === "w";
    const ua = ew ? frame.u(0, Math.max(-1e3, nb.from)) : frame.u(Math.max(-1e3, nb.from), 0);
    const ub = ew ? frame.u(0, Math.min(1e3, nb.to)) : frame.u(Math.min(1e3, nb.to), 0);
    list = intervalsSubtract(list, [Math.min(ua, ub), Math.max(ua, ub)]);
  }
  return list;
}

/**
 * MDF baseboards along the visible face, interrupted by obstacles and NO_BASEBOARD zones.
 * East/west faces stop BASEBOARD_T short of inside corners (north/south boards run into them).
 * Returns the u-ranges actually covered (for end caps).
 */
export function addBaseboards(ctx: FaceCtx): Array<{ lo: number; hi: number; room: Room }> {
  const { b, side, faceW, frame } = ctx;
  const ew = isEWFace(frame);
  const rs = roomSideOf(frame, side);
  const w0 = side * faceW,
    w1 = side * (faceW + BASEBOARD_T);
  const covered: Array<{ lo: number; hi: number; room: Room }> = [];
  for (const v of ctx.visible) {
    let lo = v.lo,
      hi = v.hi;
    if (ew && v.loCorner) lo += BASEBOARD_T;
    if (ew && v.hiCorner) hi -= BASEBOARD_T;
    let pieces = noBaseboard(v.room, rs, frame, lo, hi);
    for (const o of ctx.obstacles) if (o.y0 < BASEBOARD_H && o.y1 > 0) pieces = intervalsSubtract(pieces, [o.u0, o.u1]);
    for (const [a, c] of pieces) {
      if (c - a < 0.03) continue;
      const cuts = splitEven(a, c, 2.4);
      for (let i = 0; i + 1 < cuts.length; i++) {
        addBaseboardPiece(ctx, cuts[i], cuts[i + 1], w0, w1);
      }
      covered.push({ lo: a, hi: c, room: v.room });
    }
  }
  return covered;
}

export function addBaseboardPiece(ctx: FaceCtx, a: number, c: number, w0: number, w1: number): string {
  const { b, idx, side } = ctx;
  const name = `${ctx.prefix}base_${Math.round(a * 1000)}`;
  const wl = Math.min(w0, w1),
    wh = Math.max(w0, w1);
  // painted on every exposed face (front, top, cut ends); raw MDF only on the back
  boxR(b, name, "mdf", "mdf", [a, c], [0, BASEBOARD_H], [wl, wh], {
    faces: trimFaces(side),
    tags: ["baseboard"],
    grain: "x",
    uvOffset: [0, 0],
  });
  idx.add({ name, u0: a, u1: c, y0: 0, y1: BASEBOARD_H, w0: wl, w1: wh, role: "baseboard" });
  // finish nails through the wall finish into the framing (studs / plates) or concrete behind:
  // a fastener bond must join touching parts, so each nail group is a bond to the finish piece
  // the board sits on, as strong as the nails that reach framing behind that piece (the finish is
  // itself screwed / glued to that framing); plus a bead of adhesive on every piece
  const wBack = side > 0 ? wl : wh;
  let bonded = 0;
  for (const s of idx.overlapping(a, c, 0, BASEBOARD_H, ctx.substrateRoles, 0.003)) {
    let nails = 0;
    for (const h of idx.overlapping(s.ou[0], s.ou[1], 0, BASEBOARD_H, ctx.fixRoles, 0.003)) nails += h.box.role === "cell" ? 15 : 25 * fasteners(h.ou[1] - h.ou[0], 0.4);
    const at: V3 = [mid(s.ou[0], s.ou[1]), BASEBOARD_H / 2, wBack];
    if (nails > 0) bondAt(b, name, s.box.name, "nail", nails, at);
    bondAt(b, name, s.box.name, "glue", 12, at);
    bonded++;
  }
  if (bonded === 0) b.world(name, "nail", 20, [mid(a, c), BASEBOARD_H / 2, wBack]);
  return name;
}

// ------------------------------------------------------------------ wall tiles
/** Zones of WALL_TILE_ZONES on this face, converted to local face rectangles. */
export function tileZonesOnFace(ctx: FaceCtx): Array<FaceRect & { zone: WallTileZone }> {
  const rs = roomSideOf(ctx.frame, ctx.side);
  const out: Array<FaceRect & { zone: WallTileZone }> = [];
  for (const z of WALL_TILE_ZONES) {
    if (z.side !== rs) continue;
    for (const v of ctx.visible) {
      if (v.room.id !== z.room) continue;
      const ew = rs === "e" || rs === "w";
      const ua = ew ? ctx.frame.u(0, z.from) : ctx.frame.u(z.from, 0);
      const ub = ew ? ctx.frame.u(0, z.to) : ctx.frame.u(z.to, 0);
      const lo = Math.max(Math.min(ua, ub), v.lo),
        hi = Math.min(Math.max(ua, ub), v.hi);
      if (hi - lo > 0.01) out.push({ u0: lo, u1: hi, y0: z.y0, y1: z.y1, zone: z });
    }
  }
  return out;
}

/**
 * Glazed tiles (150 mm, 2 mm joints) on a 3 mm grout/adhesive bed over the face sheets.
 * Rows start at the lowest zone edge, columns at the face's first tiled corner, so all zones on a
 * face share one grid. Obstacles (door casings) are cut out.
 */
export function addWallTiles(ctx: FaceCtx): number {
  const zones = tileZonesOnFace(ctx);
  if (!zones.length) return 0;
  const { b, idx, side, faceW } = ctx;
  // union of zone rectangles minus obstacles (as 2D rects in (u, y) → reuse Rect2 with x=u, z=y)
  let union: Rect2[] = zones.map((z) => ({ x0: z.u0, x1: z.u1, z0: z.y0, z1: z.y1 }));
  for (const o of ctx.obstacles) {
    const cut: Rect2 = { x0: o.u0, x1: o.u1, z0: o.y0, z1: o.y1 };
    const next: Rect2[] = [];
    for (const r of union) {
      const ox0 = Math.max(r.x0, cut.x0),
        ox1 = Math.min(r.x1, cut.x1),
        oz0 = Math.max(r.z0, cut.z0),
        oz1 = Math.min(r.z1, cut.z1);
      if (ox1 - ox0 <= 1e-6 || oz1 - oz0 <= 1e-6) {
        next.push(r);
        continue;
      }
      if (ox0 - r.x0 > 1e-6) next.push({ x0: r.x0, x1: ox0, z0: r.z0, z1: r.z1 });
      if (r.x1 - ox1 > 1e-6) next.push({ x0: ox1, x1: r.x1, z0: r.z0, z1: r.z1 });
      if (oz0 - r.z0 > 1e-6) next.push({ x0: ox0, x1: ox1, z0: r.z0, z1: oz0 });
      if (r.z1 - oz1 > 1e-6) next.push({ x0: ox0, x1: ox1, z0: oz1, z1: r.z1 });
    }
    union = next;
  }
  if (!union.length) return 0;
  const tint = zones[0].zone.tint;
  const wb0 = side * faceW,
    wb1 = side * (faceW + WALL_TILE_BED_T),
    wt1 = side * (faceW + WALL_TILE_T);
  const bedW: Interval = [Math.min(wb0, wb1), Math.max(wb0, wb1)];
  const tileW: Interval = [Math.min(wb1, wt1), Math.max(wb1, wt1)];

  // ---- beds: each union rect split into ≤ 1.2 m panels
  const beds: string[] = [];
  let k = 0;
  for (const r of union) {
    const us = splitEven(r.x0, r.x1, 1.2),
      ys = splitEven(r.z0, r.z1, 1.2);
    for (let i = 0; i + 1 < us.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        const name = `${ctx.prefix}tbed_${k++}`;
        boxR(b, name, "plaster", "grout", [us[i], us[i + 1]], [ys[j], ys[j + 1]], bedW, { supported: true, tags: ["tile-bed"] });
        idx.add({ name, u0: us[i], u1: us[i + 1], y0: ys[j], y1: ys[j + 1], w0: bedW[0], w1: bedW[1], role: "tilebed" });
        beds.push(name);
        let bonded = 0;
        for (const h of idx.overlapping(us[i], us[i + 1], ys[j], ys[j + 1], ctx.substrateRoles, 0.003)) {
          const area = (h.ou[1] - h.ou[0]) * (h.oy[1] - h.oy[0]);
          bondAt(b, name, h.box.name, "mortar", 45 * area + 4, [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), side * faceW]);
          bonded++;
        }
        if (!bonded) b.world(name, "mortar", 30, [mid(us[i], us[i + 1]), mid(ys[j], ys[j + 1]), side * faceW]);
      }
    }
  }
  // ---- tiles: one grid per face
  const u0 = Math.min(...union.map((r) => r.x0)),
    u1 = Math.max(...union.map((r) => r.x1));
  const y0 = Math.min(...union.map((r) => r.z0)),
    y1 = Math.max(...union.map((r) => r.z1));
  // grid origin: the corner nearest the face start (tilers start at a corner)
  const gu = u0,
    gy = y0;
  const half = WALL_JOINT / 2;
  let count = 0;
  for (let cu = gu; cu < u1 - 1e-6; cu += WALL_TILE) {
    for (let cy = gy; cy < y1 - 1e-6; cy += WALL_TILE) {
      const cell: Rect2 = { x0: cu, x1: cu + WALL_TILE, z0: cy, z1: cy + WALL_TILE };
      for (const p of clipToUnion(cell, union)) {
        const a = p.x0 + half,
          c = p.x1 - half,
          d = p.z0 + half,
          e = p.z1 - half;
        if (c - a < 0.012 || e - d < 0.012) continue;
        const name = `${ctx.prefix}tile_${count++}`;
        const cuC = mid(a, c),
          cyC = mid(d, e);
        // keep the 150 mm texture repeat aligned with the tile grid on the room face
        const uo = side > 0 ? cu + WALL_TILE - cuC : cuC - cu;
        const vo = cyC - cy;
        boxR(b, name, "tile", "tile_glazed_white", [a, c], [d, e], tileW, {
          tint,
          faces: frontFace(side, "tile_glazed_white", tint),
          supported: true,
          tags: ["wall-tile"],
          uvOffset: [uo, vo],
        });
        idx.add({ name, u0: a, u1: c, y0: d, y1: e, w0: tileW[0], w1: tileW[1], role: "walltile" });
        let bonded = 0;
        for (const h of idx.overlapping(a, c, d, e, ["tilebed"], 0.002)) {
          const area = (h.ou[1] - h.ou[0]) * (h.oy[1] - h.oy[0]);
          bondAt(b, name, h.box.name, "mortar", Math.max(3, (28 * area) / (WALL_TILE * WALL_TILE)), [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), side * (faceW + WALL_TILE_BED_T)]);
          bonded++;
        }
        if (!bonded && beds.length) bondAt(b, name, beds[0], "mortar", 5, [cuC, cyC, side * (faceW + WALL_TILE_BED_T)]);
      }
    }
  }
  return count;
}

/** Face rectangles covered by wall tiles on this face (so plates/baseboards avoid them). */
export function tiledRects(ctx: FaceCtx): FaceRect[] {
  return tileZonesOnFace(ctx).map((z) => ({ u0: z.u0, u1: z.u1, y0: z.y0, y1: z.y1 }));
}

// ------------------------------------------------------------------ electrical cover plates
export interface PlateResult {
  plate: string;
  front: string;
}

/**
 * Cover plate (+ rocker for switches, receptacle face for outlets) on the finished face at
 * (u, y). `box` (stud walls) is the electrical box behind the sheet; `anchorParts` are parts
 * behind the plate the box is fixed to (concrete cell for cast-in boxes).
 */
export function addPlate(ctx: FaceCtx, p: ElecPoint, u: number, y: number, box: string | null, behind: string[]): PlateResult {
  const { b, idx, side, faceW } = ctx;
  const W = ELEC_PLATE_W,
    H = ELEC_PLATE_H,
    T = ELEC_PLATE_T;
  const wp0 = side * faceW,
    wp1 = side * (faceW + T);
  const plateW: Interval = [Math.min(wp0, wp1), Math.max(wp0, wp1)];
  const tag = p.kind === "switch" ? `switch:${p.controls ?? p.room}` : "outlet";
  const plate = `${ctx.prefix}${p.id}_plate`;
  boxR(b, plate, "plastic", "plastic_glossy", [u - W / 2, u + W / 2], [y - H / 2, y + H / 2], plateW, {
    tint: PAL.plasticWhite,
    tags: [tag, "electrical"],
  });
  idx.add({ name: plate, u0: u - W / 2, u1: u + W / 2, y0: y - H / 2, y1: y + H / 2, w0: plateW[0], w1: plateW[1], role: "plate" });
  let front: string;
  if (p.kind === "switch") {
    const r0 = side * (faceW + T),
      r1 = side * (faceW + T + 0.006);
    front = `${ctx.prefix}${p.id}_rocker`;
    boxR(b, front, "plastic", "plastic_glossy", [u - 0.012, u + 0.012], [y - 0.021, y + 0.021], [Math.min(r0, r1), Math.max(r0, r1)], {
      tint: 0xf7f6f2,
      tags: [tag, "electrical"],
    });
    bondAt(b, front, plate, "press", 3, [u, y, side * (faceW + T)]);
  } else {
    const r0 = side * (faceW + T),
      r1 = side * (faceW + T + 0.004);
    front = `${ctx.prefix}${p.id}_socket`;
    boxR(b, front, "plastic", "plastic", [u - 0.019, u + 0.019], [y - 0.036, y + 0.036], [Math.min(r0, r1), Math.max(r0, r1)], {
      tint: 0xeeece6,
      tags: [tag, "electrical"],
    });
    bondAt(b, front, plate, "screw", 15, [u, y, side * (faceW + T)]);
  }
  b.feature({ type: "sparks", part: plate, chance: 0.5 });
  b.feature({ type: "sparks", part: front, chance: 0.8 });
  // fixings: to the box through the sheet (stud walls) or to the cast-in box in the concrete
  if (box) bondAt(b, plate, box, "screw", 30, [u, y, side * (faceW - 0.006)]);
  for (const q of behind) bondAt(b, plate, q, "screw", 25, [u, y, side * (faceW - 0.006)]);
  for (const h of idx.overlapping(u - W / 2, u + W / 2, y - H / 2, y + H / 2, ctx.substrateRoles, 0.002)) {
    bondAt(b, plate, h.box.name, "friction", 4, [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), side * faceW]);
  }
  return { plate, front };
}

/** True when a face rectangle is free of obstacles, tiles and other plates and lies on the face. */
export function plateFits(ctx: FaceCtx, u: number, y: number): boolean {
  const W = ELEC_PLATE_W + 0.02,
    H = ELEC_PLATE_H + 0.02;
  const r = { u0: u - W / 2, u1: u + W / 2, y0: y - H / 2, y1: y + H / 2 };
  if (!ctx.visible.some((v) => r.u0 >= v.lo && r.u1 <= v.hi)) return false;
  const hit = (o: FaceRect) => Math.min(r.u1, o.u1) > Math.max(r.u0, o.u0) && Math.min(r.y1, o.y1) > Math.max(r.y0, o.y0);
  if (ctx.obstacles.some(hit)) return false;
  if (tiledRects(ctx).some(hit)) return false;
  if (ctx.idx.byRole("plate").some((p) => hit({ u0: p.u0, u1: p.u1, y0: p.y0, y1: p.y1 }))) return false;
  return true;
}
