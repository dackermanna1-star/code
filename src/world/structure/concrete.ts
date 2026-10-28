// Cast-in-place concrete: exterior/party wall segments (one assembly per wall per room) and the
// floor/ceiling slabs. Walls are grids of large concrete cells (~0.6–0.95 m) fused to each other
// and anchored to the building (rebar continuity), cut around window/door openings. The
// interior face carries a 12.5 mm gypsum finish glued to the cells (inside the concrete
// envelope, so rooms keep their plan dimensions), plus window reveals and marble boards, wall
// tiles, baseboards and switch/outlet plates. PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder } from "../../objects/lib/builder.ts";
import {
  CEILING_SLAB_Y,
  CEILING_Y,
  SHELL_INNER,
  SLAB_BOTTOM_Y,
  SLAB_TOP_Y,
  STRUCTURE_TOP_Y,
  WALL_FINISH_T,
  WINDOW_BOARD_NOSING,
  WINDOW_BOARD_T,
  WINDOW_REVEAL,
} from "./levels.ts";
import { concreteFaceIntervals, type ConcreteRun, type ConcreteSegment, type RunOpening } from "./layout.ts";
import { BoxIndex, Namer, bondAt, boxR, mid, newBuilder, sheetFaces, worldAt, type LBox, type V3 } from "./common.ts";
import { splitEven } from "./rects.ts";
import { addBaseboards, addPlate, addWallTiles, plateFits, visibleIntervals, type FaceCtx, type FaceRect } from "./walldeco.ts";
import { ELECTRICAL } from "./services.ts";
import { casingRectFront } from "./openings.ts";

/** Max concrete cell size in walls (m). */
const CELL_MAX = 0.95;
/** World bond (rebar continuity) of each concrete cell (J): practically unbreakable by blows; cells crumble instead. */
const CELL_ANCHOR_J = 20000;
/** Gypsum finish adhesive (J per m² of contact). */
const FINISH_GLUE_J_M2 = 60;

const WALL_NAMES: Record<string, string> = {
  south: "Exterior Wall (South)",
  east: "Exterior Wall (East)",
  north: "Party Wall (Corridor)",
  west: "Party Wall (Neighbour)",
};

/** Run `fn` inside the run's local frame. */
export function inFrame(b: Builder, run: { frame: { ox: number; oz: number; yawDeg: number } }, fn: () => void): void {
  b.group([run.frame.ox, 0, run.frame.oz], [0, run.frame.yawDeg, 0], "", fn);
}

/** Concrete cells of one wall segment: columns split at opening edges, rows per column skipping openings. */
function addCells(b: Builder, idx: BoxIndex, run: ConcreteRun, seg: ConcreteSegment, w: [number, number]): LBox[] {
  const ops = run.openings.filter((o) => o.r1 > seg.u0 + 1e-6 && o.r0 < seg.u1 - 1e-6);
  const brk = new Set<number>([seg.u0, seg.u1]);
  for (const o of ops) {
    if (o.r0 > seg.u0 + 1e-6) brk.add(o.r0);
    if (o.r1 < seg.u1 - 1e-6) brk.add(o.r1);
  }
  const xs = [...brk].sort((a, c) => a - c);
  const cols: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const s = splitEven(xs[i], xs[i + 1], CELL_MAX);
    for (let k = 0; k + 1 < s.length; k++) cols.push([s[k], s[k + 1]]);
  }
  const cells: LBox[][] = [];
  cols.forEach(([c0, c1], ci) => {
    const um = mid(c0, c1);
    const o = ops.find((q) => um > q.r0 && um < q.r1);
    const ranges: Array<[number, number]> = o
      ? [
          [SLAB_BOTTOM_Y, o.sill],
          [o.head, STRUCTURE_TOP_Y],
        ]
      : [[SLAB_BOTTOM_Y, STRUCTURE_TOP_Y]];
    const col: LBox[] = [];
    for (const [y0, y1] of ranges) {
      if (y1 - y0 < 0.02) continue;
      const ys = splitEven(y0, y1, CELL_MAX);
      for (let k = 0; k + 1 < ys.length; k++) {
        const name = `cell_c${ci}_r${col.length}`;
        boxR(b, name, "concrete", "concrete", [c0, c1], [ys[k], ys[k + 1]], w, { tags: ["concrete"], uvOffset: [run.frame.ox + c0, ys[k]] });
        const box = idx.add({ name, u0: c0, u1: c1, y0: ys[k], y1: ys[k + 1], w0: w[0], w1: w[1], role: "cell" });
        col.push(box);
        // anchored at the back face (craters on the struck face keep the back attached)
        worldAt(b, name, "fused", CELL_ANCHOR_J, [mid(c0, c1), mid(ys[k], ys[k + 1]), w[0]]);
      }
    }
    // fuse vertically adjacent cells of the column
    for (let k = 0; k + 1 < col.length; k++) {
      if (Math.abs(col[k].y1 - col[k + 1].y0) < 1e-6) b.bond(col[k].name, col[k + 1].name, "fused", { anchor: [mid(c0, c1), col[k].y1, mid(w[0], w[1])] });
    }
    cells.push(col);
  });
  // fuse horizontally adjacent cells of neighbouring columns
  for (let i = 0; i + 1 < cells.length; i++) {
    for (const a of cells[i]) {
      for (const c of cells[i + 1]) {
        const oy0 = Math.max(a.y0, c.y0),
          oy1 = Math.min(a.y1, c.y1);
        if (oy1 - oy0 > 0.01 && Math.abs(a.u1 - c.u0) < 1e-6) b.bond(a.name, c.name, "fused", { anchor: [a.u1, mid(oy0, oy1), mid(w[0], w[1])] });
      }
    }
  }
  return cells.flat();
}

/** Finish sheets on the interior face, cut around openings, glued to the cells. */
function addFinish(b: Builder, idx: BoxIndex, run: ConcreteRun, seg: ConcreteSegment, w: [number, number]): void {
  const intervals = concreteFaceIntervals(run, seg.u0, seg.u1);
  const tint = seg.room.paint;
  const sheets: LBox[] = [];
  let k = 0;
  for (const [a, c] of intervals) {
    const brk = new Set<number>([a, c]);
    for (const o of run.openings) {
      if (o.r0 > a + 1e-6 && o.r0 < c - 1e-6) brk.add(o.r0);
      if (o.r1 > a + 1e-6 && o.r1 < c - 1e-6) brk.add(o.r1);
    }
    const xs = [...brk].sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) {
      const p = xs[i],
        q = xs[i + 1];
      const o = run.openings.find((r) => mid(p, q) > r.r0 && mid(p, q) < r.r1);
      const ranges: Array<[number, number]> = o
        ? [
            [SLAB_TOP_Y, o.sill],
            [o.head, CEILING_Y],
          ]
        : [[SLAB_TOP_Y, CEILING_Y]];
      for (const [y0, y1] of ranges) {
        if (y1 - y0 < 0.05) continue;
        const us = splitEven(p, q, 1.2);
        for (let j = 0; j + 1 < us.length; j++) {
          const name = `finish_${k++}`;
          boxR(b, name, "gypsum", "gypsum", [us[j], us[j + 1]], [y0, y1], w, {
            faces: sheetFaces(1, "paint_wall", tint),
            supported: true,
            tags: ["drywall", "finish"],
          });
          sheets.push(idx.add({ name, u0: us[j], u1: us[j + 1], y0, y1, w0: w[0], w1: w[1], role: "finish" }));
        }
      }
    }
  }
  for (const s of sheets) {
    let bonded = 0;
    for (const h of idx.overlapping(s.u0, s.u1, s.y0, s.y1, ["cell"], 0.004)) {
      const area = (h.ou[1] - h.ou[0]) * (h.oy[1] - h.oy[0]);
      bondAt(b, s.name, h.box.name, "glue", FINISH_GLUE_J_M2 * area + 4, [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), s.w0]);
      bonded++;
    }
    if (!bonded) worldAt(b, s.name, "glue", 40, [mid(s.u0, s.u1), mid(s.y0, s.y1), s.w0]);
  }
  // taped joints between neighbouring sheets
  for (let i = 0; i < sheets.length; i++) {
    for (let j = i + 1; j < sheets.length; j++) {
      const a = sheets[i],
        c = sheets[j];
      const oy0 = Math.max(a.y0, c.y0),
        oy1 = Math.min(a.y1, c.y1);
      if (oy1 - oy0 > 0.05 && (Math.abs(a.u1 - c.u0) < 1e-6 || Math.abs(c.u1 - a.u0) < 1e-6)) {
        const u = Math.abs(a.u1 - c.u0) < 1e-6 ? a.u1 : a.u0;
        bondAt(b, a.name, c.name, "glue", 6, [u, mid(oy0, oy1), a.w1]);
      }
    }
  }
}

/** Gypsum reveal linings + marble window board for a window opening (inside the frame line). */
function addWindowReveal(b: Builder, idx: BoxIndex, run: ConcreteRun, o: RunOpening, tint: number): void {
  const half = run.half;
  const wIn = half - WINDOW_REVEAL; // frame's interior face
  const t = WALL_FINISH_T;
  const id = o.op.id;
  const board = `${id}_board`;
  const by1 = o.sill + WINDOW_BOARD_T;
  boxR(b, board, "stone", "marble", [o.r0, o.r1], [o.sill, by1], [wIn, half + WINDOW_BOARD_NOSING], { tags: ["window-board"], tint: 0xf2efe9 });
  idx.add({ name: board, u0: o.r0, u1: o.r1, y0: o.sill, y1: by1, w0: wIn, w1: half + WINDOW_BOARD_NOSING, role: "board" });
  const left = `${id}_revealL`,
    right = `${id}_revealR`,
    head = `${id}_revealH`;
  boxR(b, left, "gypsum", "gypsum", [o.r0, o.r0 + t], [by1, o.head], [wIn, half], { faces: { px: { surf: "paint_wall", tint } }, supported: true, tags: ["drywall"] });
  boxR(b, right, "gypsum", "gypsum", [o.r1 - t, o.r1], [by1, o.head], [wIn, half], { faces: { nx: { surf: "paint_wall", tint } }, supported: true, tags: ["drywall"] });
  boxR(b, head, "gypsum", "gypsum", [o.r0 + t, o.r1 - t], [o.head - t, o.head], [wIn, half], { faces: { ny: { surf: "paint_wall", tint } }, supported: true, tags: ["drywall"] });
  const cells = idx.byRole("cell");
  const fin = idx.byRole("finish");
  // board bedded in mortar on the cells below the opening
  for (const c of cells) {
    const ou = Math.min(o.r1, c.u1) - Math.max(o.r0, c.u0);
    if (ou > 0.01 && Math.abs(c.y1 - o.sill) < 1e-4) bondAt(b, board, c.name, "mortar", 90 * (ou / (o.r1 - o.r0)) + 10, [mid(Math.max(o.r0, c.u0), Math.min(o.r1, c.u1)), o.sill, mid(wIn, half)]);
  }
  for (const c of cells) {
    const oy = Math.min(o.head, c.y1) - Math.max(by1, c.y0);
    if (oy > 0.01 && Math.abs(c.u1 - o.r0) < 1e-4) bondAt(b, left, c.name, "glue", 25 * oy + 4, [o.r0, mid(Math.max(by1, c.y0), Math.min(o.head, c.y1)), mid(wIn, half)]);
    if (oy > 0.01 && Math.abs(c.u0 - o.r1) < 1e-4) bondAt(b, right, c.name, "glue", 25 * oy + 4, [o.r1, mid(Math.max(by1, c.y0), Math.min(o.head, c.y1)), mid(wIn, half)]);
    const ou = Math.min(o.r1, c.u1) - Math.max(o.r0, c.u0);
    if (ou > 0.01 && Math.abs(c.y0 - o.head) < 1e-4) bondAt(b, head, c.name, "glue", 25 * ou + 4, [mid(Math.max(o.r0, c.u0), Math.min(o.r1, c.u1)), o.head, mid(wIn, half)]);
  }
  bondAt(b, left, board, "glue", 5, [o.r0 + t / 2, by1, mid(wIn, half)]);
  bondAt(b, right, board, "glue", 5, [o.r1 - t / 2, by1, mid(wIn, half)]);
  bondAt(b, head, left, "glue", 4, [o.r0 + t, o.head - t / 2, mid(wIn, half)]);
  bondAt(b, head, right, "glue", 4, [o.r1 - t, o.head - t / 2, mid(wIn, half)]);
  // corner-bead joints with the face finish
  for (const f of fin) {
    if (Math.abs(f.u1 - o.r0) < 1e-4 && f.y1 > by1 && f.y0 < o.head) bondAt(b, left, f.name, "glue", 4, [o.r0, mid(Math.max(by1, f.y0), Math.min(o.head, f.y1)), half - t / 2]);
    if (Math.abs(f.u0 - o.r1) < 1e-4 && f.y1 > by1 && f.y0 < o.head) bondAt(b, right, f.name, "glue", 4, [o.r1, mid(Math.max(by1, f.y0), Math.min(o.head, f.y1)), half - t / 2]);
    if (Math.abs(f.y1 - o.sill) < 1e-4 && f.u1 > o.r0 && f.u0 < o.r1) bondAt(b, board, f.name, "glue", 6, [mid(Math.max(o.r0, f.u0), Math.min(o.r1, f.u1)), o.sill, half - t / 2]);
  }
}

/** Face obstacles of a concrete opening (things on the interior face plane). */
function openingObstacle(o: RunOpening): FaceRect {
  if (o.op.kind === "frontDoor") return casingRectFront(o);
  return { u0: o.r0, u1: o.r1, y0: o.sill, y1: o.head };
}

/** One concrete wall segment (the stretch of a concrete wall bounding one room). */
export function buildConcreteSegment(run: ConcreteRun, seg: ConcreteSegment): AssemblyDef {
  const area = (seg.u1 - seg.u0) * (STRUCTURE_TOP_Y - SLAB_BOTTOM_Y);
  const name = `${WALL_NAMES[run.wall.id] ?? "Concrete Wall"} — ${seg.room.name}`;
  const b = newBuilder("wall_concrete", name, "structure", Math.round(area * 420));
  const idx = new BoxIndex();
  const half = run.half;
  const cw: [number, number] = [-half, half - WALL_FINISH_T];
  const fw: [number, number] = [half - WALL_FINISH_T, half];
  inFrame(b, run, () => {
    addCells(b, idx, run, seg, cw);
    addFinish(b, idx, run, seg, fw);
    const obstacles: FaceRect[] = [];
    for (const o of run.openings) {
      if (o.r1 <= seg.u0 + 1e-6 || o.r0 >= seg.u1 - 1e-6) continue;
      obstacles.push(openingObstacle(o));
      if (o.op.kind === "window") addWindowReveal(b, idx, run, o, seg.room.paint);
    }
    const exposed = concreteFaceIntervals(run, seg.u0, seg.u1);
    const ctx: FaceCtx = {
      b,
      idx,
      frame: run.frame,
      side: 1,
      faceW: half,
      visible: visibleIntervals(run.frame, 1, half, exposed, () => true),
      substrateRoles: ["finish"],
      fixRoles: ["cell"],
      obstacles,
      prefix: "",
    };
    addWallTiles(ctx);
    addBaseboards(ctx);
    // switch / outlet plates on cast-in boxes
    for (const p of ELECTRICAL) {
      if (p.wall !== run.wall.id || p.room !== seg.room.id || p.at === undefined) continue;
      const ua = Math.abs(run.frame.dx) > 0.5 ? run.frame.u(p.at, 0) : run.frame.u(0, p.at);
      let placed = false;
      for (const du of [0, 0.05, -0.05, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3]) {
        const u = ua + du;
        if (!plateFits(ctx, u, p.y)) continue;
        const behind = idx.overlapping(u - 0.01, u + 0.01, p.y - 0.01, p.y + 0.01, ["cell"], 0.001).map((h) => h.box.name);
        addPlate(ctx, p, u, p.y, null, behind.slice(0, 1));
        placed = true;
        break;
      }
      if (!placed) throw new Error(`structure: no room for ${p.id} on ${run.wall.id}`);
    }
  });
  const def = b.build();
  def.room = seg.room.id;
  return def;
}

// ------------------------------------------------------------------ slabs
/** Floor slab (under all finishes) or ceiling slab (the storey above), large world-anchored cells. */
export function buildSlab(kind: "floor" | "ceiling"): AssemblyDef {
  const floor = kind === "floor";
  const y0 = floor ? SLAB_BOTTOM_Y : CEILING_SLAB_Y;
  const y1 = floor ? SLAB_TOP_Y : STRUCTURE_TOP_Y;
  const r = SHELL_INNER;
  const area = (r.x1 - r.x0) * (r.z1 - r.z0);
  const b = newBuilder(floor ? "slab_floor" : "slab_ceiling", floor ? "Floor Slab" : "Ceiling Slab", "structure", Math.round(area * 380));
  const xs = splitEven(r.x0, r.x1, 1.65);
  const zs = splitEven(r.z0, r.z1, 1.5);
  const names: string[][] = [];
  const nm = new Namer();
  for (let i = 0; i + 1 < xs.length; i++) {
    names.push([]);
    for (let j = 0; j + 1 < zs.length; j++) {
      const name = nm.next(`slab_${i}_${j}_`);
      boxR(b, name, "concrete", "concrete", [xs[i], xs[i + 1]], [y0, y1], [zs[j], zs[j + 1]], { tags: ["concrete"], uvOffset: [xs[i], zs[j]] });
      // anchored on the far face (columns/beams/rebar); hits come from the room side
      const at: V3 = [mid(xs[i], xs[i + 1]), floor ? y0 : y1, mid(zs[j], zs[j + 1])];
      worldAt(b, name, "fused", CELL_ANCHOR_J * 1.5, at);
      names[i].push(name);
    }
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names[i].length; j++) {
      if (i + 1 < names.length) b.bond(names[i][j], names[i + 1][j], "fused", { anchor: [xs[i + 1], mid(y0, y1), mid(zs[j], zs[j + 1])] });
      if (j + 1 < names[i].length) b.bond(names[i][j], names[i][j + 1], "fused", { anchor: [mid(xs[i], xs[i + 1]), mid(y0, y1), zs[j + 1]] });
    }
  }
  return b.build();
}
