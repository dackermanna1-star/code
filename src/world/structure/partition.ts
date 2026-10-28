// Stud partitions: pine studs 38×89 @ 400 mm between world-anchored bottom/top plates, king/jack
// studs and a header (+ cripples) over every opening, backing studs at T junctions, 12.5 mm
// gypsum sheets on both faces screwed to every framing member they cross, batt insulation in
// insulated walls, electrical boxes/cables/plates, copper supply + PVC drain stub-outs in
// plumbing walls, cased-archway trim, wall tiles (bathroom) and baseboards. One assembly per
// partition. Built in the wall's local frame (u along the wall, w across). PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { roomAt } from "../plan.ts";
import {
  BASEBOARD_T,
  CASING_REVEAL,
  CASING_T,
  CASING_W,
  CEILING_SLAB_Y,
  CEILING_Y,
  DRYWALL_T,
  FRAME_PLATE_H,
  JAMB_T,
  SERVICE_POINTS,
  SHIM,
  SLAB_TOP_Y,
  STUD_D,
  STUD_W,
  WALL_TILE_T,
} from "./levels.ts";
import { STUD_SPACING } from "../plan.ts";
import { partitionFaceIntervals, runSideRoom, type PartitionRun, type WallFrame } from "./layout.ts";
import { BoxIndex, Fixings, PAL, bondAt, boxR, fasteners, mid, newBuilder, sheetFaces, worldAt, type Interval, type LBox, type V3 } from "./common.ts";
import { intervalsSubtract, splitEven } from "./rects.ts";
import { addBaseboards, addPlate, addWallTiles, plateFits, tileZonesOnFace, visibleIntervals, type FaceCtx, type FaceRect } from "./walldeco.ts";
import { BOX_D, BOX_H, BOX_W, CABLE_KG_PER_M, CABLE_T, CABLE_W, ELECTRICAL, type ElecPoint } from "./services.ts";
import { casingRect, clearOpening } from "./openings.ts";
import { inFrame } from "./concrete.ts";

const W = STUD_W;
const SD2 = STUD_D / 2; // 0.0445
/** Back face of the sheets (0.5 mm off the studs). */
const SHEET_IN = SD2 + 0.0005; // 0.045
const STUD_Y0 = SLAB_TOP_Y + FRAME_PLATE_H; // 0.018
const STUD_Y1 = CEILING_SLAB_Y - FRAME_PLATE_H; // 2.712
const HEADER_H = 0.14;
const FRAMING_ROLES = ["stud", "king", "jack", "cripple", "header", "plateB", "plateT", "blocking"];
const CAVITY_ROLES = [...FRAMING_ROLES, "pipe", "box", "cable", "batt"];

interface Member extends LBox {
  full: boolean;
}

/** Local u of a world coordinate along the wall (x for walls along x, z for walls along z). */
export function uAlong(frame: WallFrame, v: number): number {
  return Math.abs(frame.dx) > 0.5 ? frame.u(v, 0) : frame.u(0, v);
}

export function buildPartition(run: PartitionRun): AssemblyDef {
  const um = mid(run.u0, run.u1);
  const roomP = runSideRoom(run, um, 1),
    roomN = runSideRoom(run, um, -1);
  const plumbing = run.wall.kind === "plumbing";
  const label = `${roomN?.name ?? "?"} / ${roomP?.name ?? "?"}`;
  const b = newBuilder("wall_partition", `${plumbing ? "Plumbing Wall" : "Stud Wall"} (${label})`, "structure", Math.round((run.u1 - run.u0) * 2.7 * 95));
  const idx = new BoxIndex();
  const fu0 = run.u0 + (run.end0 === "free" ? DRYWALL_T : 0);
  const fu1 = run.u1 - (run.end1 === "free" ? DRYWALL_T : 0);
  const sw: Interval = [-SD2, SD2];
  const frame = run.frame;

  // face contexts (visible intervals and obstacles do not depend on parts)
  const mkCtx = (s: 1 | -1): FaceCtx => {
    const exposed = partitionFaceIntervals(run, s);
    const cornerAt = (u: number) => !((run.end0 === "free" && Math.abs(u - run.u0) < 1e-6) || (run.end1 === "free" && Math.abs(u - run.u1) < 1e-6));
    return {
      b,
      idx,
      frame,
      side: s,
      faceW: run.half,
      visible: visibleIntervals(frame, s, run.half, exposed, cornerAt),
      substrateRoles: [s > 0 ? "sheetP" : "sheetN"],
      fixRoles: ["stud", "king", "jack", "plateB"],
      obstacles: run.openings.map((o) => casingRect(o)),
      prefix: s > 0 ? "P_" : "N_",
    };
  };
  const ctxP = mkCtx(1),
    ctxN = mkCtx(-1);
  const ctxOf = (s: number) => (s > 0 ? ctxP : ctxN);

  inFrame(b, run, () => {
    const fix = new Fixings();
    // ================================================================ framing
    const plates: LBox[] = [];
    let pk = 0;
    const plateRun = (a: number, c: number, y0: number, y1: number, role: "plateB" | "plateT") => {
      const cuts = splitEven(a, c, 3.0);
      let prev: LBox | null = null;
      for (let i = 0; i + 1 < cuts.length; i++) {
        const name = `${role}_${pk++}`;
        boxR(b, name, "softwood", "wood_pine", [cuts[i], cuts[i + 1]], [y0, y1], sw, { grain: "x", tags: ["framing"] });
        const box = idx.add({ name, u0: cuts[i], u1: cuts[i + 1], y0, y1, w0: sw[0], w1: sw[1], role });
        plates.push(box);
        // powder-actuated pins into the slab every ~0.6 m
        const pins = splitEven(cuts[i], cuts[i + 1], 0.6);
        for (let k = 0; k + 1 < pins.length; k++) fix.world(name, "nail", 45, [mid(pins[k], pins[k + 1]), role === "plateB" ? y0 : y1, 0]);
        if (prev) bondAt(b, prev.name, name, "nail", 30, [cuts[i], mid(y0, y1), 0]);
        prev = box;
      }
    };
    let bottom: Interval[] = [[fu0, fu1]];
    for (const o of run.openings) if (o.sill <= 1e-6) bottom = intervalsSubtract(bottom, [o.r0, o.r1]);
    for (const [a, c] of bottom) plateRun(a, c, SLAB_TOP_Y, STUD_Y0, "plateB");
    plateRun(fu0, fu1, STUD_Y1, CEILING_SLAB_Y, "plateT");

    const members: Member[] = [];
    const collides = (u0: number, u1: number, y0: number, y1: number, clear: number) =>
      members.some((m) => Math.min(u1, m.u1) - Math.max(u0, m.u0) > -clear && Math.min(y1, m.y1) - Math.max(y0, m.y0) > 1e-6);
    const addMember = (name: string, u0: number, u1: number, y0: number, y1: number, full: boolean, role: string): Member => {
      boxR(b, name, "softwood", "wood_pine", [u0, u1], [y0, y1], sw, { tags: ["framing"] });
      const m: Member = { name, u0, u1, y0, y1, w0: sw[0], w1: sw[1], role, full };
      idx.add(m);
      members.push(m);
      return m;
    };
    const end0 = addMember("stud_end0", fu0, fu0 + W, STUD_Y0, STUD_Y1, true, "stud");
    const end1 = addMember("stud_end1", fu1 - W, fu1, STUD_Y0, STUD_Y1, true, "stud");
    const headers: Member[] = [];
    for (const o of run.openings) {
      const id = o.op.id;
      const h = o.head;
      const jL = addMember(`jackL_${id}`, o.r0 - W, o.r0, STUD_Y0, h, false, "jack");
      const jR = addMember(`jackR_${id}`, o.r1, o.r1 + W, STUD_Y0, h, false, "jack");
      const kL = addMember(`kingL_${id}`, o.r0 - 2 * W, o.r0 - W, STUD_Y0, STUD_Y1, true, "king");
      const kR = addMember(`kingR_${id}`, o.r1 + W, o.r1 + 2 * W, STUD_Y0, STUD_Y1, true, "king");
      const hd = addMember(`header_${id}`, o.r0 - W, o.r1 + W, h, h + HEADER_H, false, "header");
      headers.push(hd);
      bondAt(b, jL.name, kL.name, "nail", 120, [o.r0 - W, mid(STUD_Y0, h), 0]);
      bondAt(b, jR.name, kR.name, "nail", 120, [o.r1 + W, mid(STUD_Y0, h), 0]);
      bondAt(b, hd.name, jL.name, "nail", 60, [o.r0 - W / 2, h, 0]);
      bondAt(b, hd.name, jR.name, "nail", 60, [o.r1 + W / 2, h, 0]);
      bondAt(b, hd.name, kL.name, "nail", 90, [o.r0 - W, h + HEADER_H / 2, 0]);
      bondAt(b, hd.name, kR.name, "nail", 90, [o.r1 + W, h + HEADER_H / 2, 0]);
    }
    // grid studs @ 400 mm from the run start; cripples above headers
    const crippleCount = new Map<string, number>();
    for (let k = 1; k < 200; k++) {
      const p = fu0 + k * STUD_SPACING;
      if (p + W > fu1 - W - 0.005) break;
      const o = run.openings.find((q) => p > q.r0 - W - 1e-6 && p + W < q.r1 + W + 1e-6);
      if (o) {
        const y0 = o.head + HEADER_H;
        if (STUD_Y1 - y0 > 0.05 && !collides(p, p + W, y0, STUD_Y1, 0.002)) {
          addMember(`cripple_${o.op.id}_${k}`, p, p + W, y0, STUD_Y1, false, "cripple");
          crippleCount.set(o.op.id, (crippleCount.get(o.op.id) ?? 0) + 1);
        }
        continue;
      }
      if (collides(p, p + W, STUD_Y0, STUD_Y1, 0.005)) continue;
      addMember(`stud_${k}`, p, p + W, STUD_Y0, STUD_Y1, true, "stud");
    }
    for (const o of run.openings) {
      const y0 = o.head + HEADER_H;
      if ((crippleCount.get(o.op.id) ?? 0) === 0 && STUD_Y1 - y0 > 0.05) {
        const c = mid(o.r0, o.r1);
        addMember(`cripple_${o.op.id}_c`, c - W / 2, c + W / 2, y0, STUD_Y1, false, "cripple");
      }
    }
    // backing studs where another wall butts into a face (drywall corner backing)
    for (const ab of [...run.abutPos, ...run.abutNeg]) {
      if (members.some((m) => m.full && m.u0 < ab.hi - 0.01 && m.u1 > ab.lo + 0.01)) continue;
      const c = mid(ab.lo, ab.hi);
      if (collides(c - W / 2, c + W / 2, STUD_Y0, STUD_Y1, 0.002)) continue;
      addMember(`backer_${ab.by}`, c - W / 2, c + W / 2, STUD_Y0, STUD_Y1, true, "stud");
    }
    // studs / jacks / kings / cripples nailed to plates (and cripples to headers)
    for (const m of members) {
      if (m.role === "header") continue;
      if (m.y0 <= STUD_Y0 + 1e-6) {
        for (const p of plates) {
          if (p.role !== "plateB") continue;
          const a = Math.max(m.u0, p.u0),
            c = Math.min(m.u1, p.u1);
          if (c - a > 0.005) bondAt(b, m.name, p.name, "nail", 60, [mid(a, c), STUD_Y0, 0]);
        }
      }
      if (m.y1 >= STUD_Y1 - 1e-6) {
        for (const p of plates) {
          if (p.role !== "plateT") continue;
          const a = Math.max(m.u0, p.u0),
            c = Math.min(m.u1, p.u1);
          if (c - a > 0.005) bondAt(b, m.name, p.name, "nail", 60, [mid(a, c), STUD_Y1, 0]);
        }
      }
      if (m.role === "cripple") {
        const hd = headers.find((h) => m.u0 >= h.u0 - 1e-6 && m.u1 <= h.u1 + 1e-6 && Math.abs(h.y1 - m.y0) < 1e-6);
        if (hd) bondAt(b, m.name, hd.name, "nail", 60, [mid(m.u0, m.u1), m.y0, 0]);
      }
    }
    // end studs fixed to the concrete (anchor screws) or nailed into the abutted wall
    const fixEnd = (st: Member, kind: string, u: number) => {
      if (kind === "concrete") for (const y of [0.5, 1.35, 2.2]) fix.world(st.name, "screw", 60, [u, y, 0]);
      else if (kind === "butt") for (const y of [0.8, 1.9]) fix.world(st.name, "nail", 40, [u, y, 0]);
    };
    fixEnd(end0, run.end0, fu0);
    fixEnd(end1, run.end1, fu1);
    fix.flush(b);

    // ================================================================ plumbing (in-wall part)
    const reserved: FaceRect[] = [];
    interface ValveTodo {
      id: string;
      side: number;
      u: number;
      y: number;
      stub: string;
      kind: "cold" | "hot" | "drain";
    }
    const valves: ValveTodo[] = [];
    const fullSorted = () => members.filter((m) => m.full).sort((a, c) => a.u0 - c.u0);
    for (const sp of SERVICE_POINTS) {
      if (sp.wall !== run.wall.id) continue;
      const uC = uAlong(frame, sp.along);
      const uCold = uAlong(frame, sp.along - 0.1),
        uHot = uAlong(frame, sp.along + 0.1);
      const lo = Math.min(uCold, uHot) - 0.0075,
        hi = Math.max(uCold, uHot) + 0.0075;
      const fs = fullSorted();
      const A = [...fs].reverse().find((m) => m.u1 <= lo - 0.003);
      const B = fs.find((m) => m.u0 >= hi + 0.003);
      if (!A || !B || B.u0 - A.u1 > 0.45) throw new Error(`structure: service point ${sp.id} does not fit a stud bay of ${run.wall.id}`);
      const s = runSideRoom(run, uC, 1)?.id === sp.room ? 1 : -1;
      const vy = sp.valveY;
      const blk = `${sp.id}_blocking`;
      const bw: Interval = s > 0 ? [-SD2, -0.0065] : [0.0065, SD2];
      boxR(b, blk, "softwood", "wood_pine", [A.u1, B.u0], [vy - 0.25, vy - 0.161], bw, { grain: "x", tags: ["framing"] });
      idx.add({ name: blk, u0: A.u1, u1: B.u0, y0: vy - 0.25, y1: vy - 0.161, w0: bw[0], w1: bw[1], role: "blocking" });
      bondAt(b, blk, A.name, "nail", 60, [A.u1, vy - 0.205, mid(bw[0], bw[1])]);
      bondAt(b, blk, B.name, "nail", 60, [B.u0, vy - 0.205, mid(bw[0], bw[1])]);
      const plateUnder = (u: number) => plates.find((p) => p.role === "plateB" && u > p.u0 && u < p.u1);
      for (const [uu, kind] of [
        [uCold, "cold"],
        [uHot, "hot"],
      ] as Array<[number, "cold" | "hot"]>) {
        const riser = `${sp.id}_${kind}_riser`;
        const ry1 = vy - 0.0075;
        b.cyl(riser, "copper", "copper", 0.0075, ry1 - STUD_Y0, [uu, mid(STUD_Y0, ry1), s * 0.002], { segments: 8, tags: ["pipe"] });
        idx.add({ name: riser, u0: uu - 0.0075, u1: uu + 0.0075, y0: STUD_Y0, y1: ry1, w0: Math.min(s * -0.0055, s * 0.0095), w1: Math.max(s * -0.0055, s * 0.0095), role: "pipe" });
        const stub = `${sp.id}_${kind}_stub`;
        const wa = s * -0.0055,
          wb = s * SHEET_IN;
        b.cyl(stub, "copper", "copper", 0.0075, Math.abs(wb - wa), [uu, vy, mid(wa, wb)], { axis: "z", segments: 8, tags: ["pipe"] });
        idx.add({ name: stub, u0: uu - 0.0075, u1: uu + 0.0075, y0: vy - 0.0075, y1: vy + 0.0075, w0: Math.min(wa, wb), w1: Math.max(wa, wb), role: "pipe" });
        bondAt(b, stub, riser, "weld", 60, [uu, ry1, s * 0.002]);
        bondAt(b, riser, blk, "nail", 15, [uu, vy - 0.205, s * -0.006]);
        const pu = plateUnder(uu);
        if (pu) bondAt(b, riser, pu.name, "nail", 10, [uu, STUD_Y0, s * 0.002]);
        b.water(riser, [uu, mid(STUD_Y0, ry1), s * 0.002], [0, 0, s], 0.75);
        b.water(stub, [uu, vy, s * 0.03], [0, 0, s], 0.75);
        valves.push({ id: sp.id, side: s, u: uu, y: vy, stub, kind });
      }
      let top = vy;
      if (sp.drainY !== null) {
        const dy = sp.drainY;
        top = Math.max(top, dy);
        const riser = `${sp.id}_drain_riser`;
        const ry1 = dy - 0.02;
        b.cyl(riser, "plastic", "plastic", 0.02, ry1 - STUD_Y0, [uC, mid(STUD_Y0, ry1), s * 0.0195], { segments: 10, tint: PAL.pvc, tags: ["pipe", "drain"] });
        idx.add({ name: riser, u0: uC - 0.02, u1: uC + 0.02, y0: STUD_Y0, y1: ry1, w0: Math.min(s * -0.0005, s * 0.0395), w1: Math.max(s * -0.0005, s * 0.0395), role: "pipe" });
        const elbow = `${sp.id}_drain_elbow`;
        const wa = s * -0.0005,
          wb = s * SHEET_IN;
        b.cyl(elbow, "plastic", "plastic", 0.02, Math.abs(wb - wa), [uC, dy, mid(wa, wb)], { axis: "z", segments: 10, tint: PAL.pvc, tags: ["pipe", "drain"] });
        idx.add({ name: elbow, u0: uC - 0.02, u1: uC + 0.02, y0: dy - 0.02, y1: dy + 0.02, w0: Math.min(wa, wb), w1: Math.max(wa, wb), role: "pipe" });
        bondAt(b, elbow, riser, "glue", 80, [uC, ry1, s * 0.0195]);
        bondAt(b, riser, blk, "nail", 15, [uC, Math.min(ry1, vy - 0.205), s * -0.006]);
        const pu = plateUnder(uC);
        if (pu) bondAt(b, riser, pu.name, "nail", 10, [uC, STUD_Y0, s * 0.0195]);
        valves.push({ id: sp.id, side: s, u: uC, y: dy, stub: elbow, kind: "drain" });
      }
      reserved.push({ u0: A.u1, u1: B.u0, y0: 0, y1: top + 0.1 });
    }

    // ================================================================ electrical (boxes + cables)
    interface Placed {
      p: ElecPoint;
      side: 1 | -1;
      u: number;
      box: string;
    }
    const placed: Placed[] = [];
    const platesReserved: Array<FaceRect & { side: number }> = [];
    for (const p of ELECTRICAL) {
      if (p.wall !== run.wall.id) continue;
      let uReq: number;
      if (p.beside) {
        const o = run.openings.find((q) => q.op.id === p.beside!.opening);
        if (!o) throw new Error(`structure: ${p.id} references unknown opening ${p.beside.opening}`);
        const latchAtR1 = o.hingeSide < 0;
        const atR1 = p.beside.side === "latch" ? latchAtR1 : !latchAtR1;
        uReq = atR1 ? o.r1 + 2 * W + BOX_W / 2 + 0.001 : o.r0 - 2 * W - BOX_W / 2 - 0.001;
      } else {
        uReq = uAlong(frame, p.at!);
      }
      const s: 1 | -1 = runSideRoom(run, uReq, 1)?.id === p.room ? 1 : -1;
      if (runSideRoom(run, uReq, s)?.id !== p.room) throw new Error(`structure: ${p.id} is not on a ${p.room} face of ${run.wall.id}`);
      const ctx = ctxOf(s);
      const by0 = p.y - BOX_H / 2,
        by1 = p.y + BOX_H / 2;
      const bw: Interval = s > 0 ? [-0.005, -0.005 + BOX_D] : [0.005 - BOX_D, 0.005];
      const cw: Interval = s > 0 ? [0.03, 0.03 + CABLE_T] : [-0.03 - CABLE_T, -0.03];
      let best: { m: Member; dir: number; bu0: number; cu0: number; uc: number; d: number } | null = null;
      for (const m of members) {
        if (!m.full) continue;
        for (const dir of [1, -1]) {
          const bu0 = dir > 0 ? m.u1 + 0.001 : m.u0 - 0.001 - BOX_W;
          const bu1 = bu0 + BOX_W;
          const uc = mid(bu0, bu1);
          if (bu0 < fu0 || bu1 > fu1) continue;
          if (idx.collides(bu0, bu1, by0 - 0.005, by1 + 0.005, bw[0], bw[1], CAVITY_ROLES)) continue;
          const cu0 = dir > 0 ? m.u1 + 0.001 : m.u0 - 0.001 - CABLE_W;
          if (idx.collides(cu0, cu0 + CABLE_W, by1 + 0.001, STUD_Y1 - 0.001, cw[0], cw[1], CAVITY_ROLES)) continue;
          if (reserved.some((r) => Math.min(bu1, r.u1) > Math.max(bu0, r.u0) && Math.min(STUD_Y1, r.y1) > Math.max(by0, r.y0))) continue;
          if (!plateFits(ctx, uc, p.y)) continue;
          const pr = { u0: uc - 0.045, u1: uc + 0.045, y0: p.y - 0.07, y1: p.y + 0.07 };
          if (platesReserved.some((q) => q.side === s && Math.min(pr.u1, q.u1) > Math.max(pr.u0, q.u0) && Math.min(pr.y1, q.y1) > Math.max(pr.y0, q.y0))) continue;
          const d = Math.abs(uc - uReq);
          if (!best || d < best.d) best = { m, dir, bu0, cu0, uc, d };
        }
      }
      if (!best) throw new Error(`structure: no stud bay for ${p.id} on ${run.wall.id}`);
      const { m, bu0, cu0, uc } = best;
      const box = `${p.id}_box`;
      boxR(b, box, "plastic", "plastic", [bu0, bu0 + BOX_W], [by0, by1], bw, { tint: PAL.boxBlue, tags: ["electrical"] });
      idx.add({ name: box, u0: bu0, u1: bu0 + BOX_W, y0: by0, y1: by1, w0: bw[0], w1: bw[1], role: "box" });
      bondAt(b, box, m.name, "nail", 50, [best.dir > 0 ? m.u1 : m.u0, p.y, mid(bw[0], bw[1])]);
      b.feature({ type: "sparks", part: box, chance: 0.4 });
      // NM cable stapled up the stud to the top plate
      const cuts = splitEven(by1, STUD_Y1, 1.3);
      let prev = box;
      for (let i = 0; i + 1 < cuts.length; i++) {
        const seg = `${p.id}_cable${i}`;
        const len = cuts[i + 1] - cuts[i];
        boxR(b, seg, "copper", "plastic", [cu0, cu0 + CABLE_W], [cuts[i], cuts[i + 1]], cw, { tint: PAL.cable, mass: CABLE_KG_PER_M * len, tags: ["cable", "electrical"], tess: 0 });
        idx.add({ name: seg, u0: cu0, u1: cu0 + CABLE_W, y0: cuts[i], y1: cuts[i + 1], w0: cw[0], w1: cw[1], role: "cable" });
        bondAt(b, seg, prev, i === 0 ? "clip" : "press", i === 0 ? 8 : 12, [mid(cu0, cu0 + CABLE_W), cuts[i], mid(cw[0], cw[1])]);
        bondAt(b, seg, m.name, "nail", 6, [best.dir > 0 ? m.u1 : m.u0, mid(cuts[i], cuts[i + 1]), mid(cw[0], cw[1])]);
        b.feature({ type: "sparks", part: seg, chance: 0.6 });
        prev = seg;
      }
      const topPlate = plates.find((q) => q.role === "plateT" && cu0 >= q.u0 - 1e-6 && cu0 <= q.u1 + 1e-6);
      if (topPlate) bondAt(b, prev, topPlate.name, "nail", 6, [mid(cu0, cu0 + CABLE_W), STUD_Y1, mid(cw[0], cw[1])]);
      placed.push({ p, side: s, u: uc, box });
      platesReserved.push({ u0: uc - 0.045, u1: uc + 0.045, y0: p.y - 0.07, y1: p.y + 0.07, side: s });
    }

    // ================================================================ insulation
    if (run.wall.insulated) {
      const fs = fullSorted();
      let bk = 0;
      for (let i = 0; i + 1 < fs.length; i++) {
        const A = fs[i],
          B = fs[i + 1];
        const a = A.u1 + 0.01,
          c = B.u0 - 0.01;
        if (c - a < 0.08) continue;
        if (run.openings.some((o) => a < o.r1 + W && c > o.r0 - W)) continue;
        let ys: Interval[] = [[STUD_Y0 + 0.004, STUD_Y1 - 0.004]];
        for (const bx of idx.byRole("box")) if (bx.u1 > a && bx.u0 < c) ys = intervalsSubtract(ys, [bx.y0 - 0.04, bx.y1 + 0.04]);
        for (const [y0, y1] of ys) {
          if (y1 - y0 < 0.12) continue;
          const cuts = splitEven(y0, y1, 1.4);
          for (let k = 0; k + 1 < cuts.length; k++) {
            const name = `batt_${bk++}`;
            boxR(b, name, "insulation", "insulation", [a, c], [cuts[k], cuts[k + 1]], [-0.04, 0.04], { tags: ["insulation"] });
            idx.add({ name, u0: a, u1: c, y0: cuts[k], y1: cuts[k + 1], w0: -0.04, w1: 0.04, role: "batt" });
            const ym = mid(cuts[k], cuts[k + 1]);
            bondAt(b, name, A.name, "friction", 4, [A.u1, ym, 0]);
            bondAt(b, name, B.name, "friction", 4, [B.u0, ym, 0]);
          }
        }
      }
    }

    // ================================================================ sheets
    for (const s of [1, -1] as const) {
      const role = s > 0 ? "sheetP" : "sheetN";
      const w: Interval = s > 0 ? [SHEET_IN, SHEET_IN + DRYWALL_T] : [-(SHEET_IN + DRYWALL_T), -SHEET_IN];
      const pieces: LBox[] = [];
      let k = 0;
      for (const [a, c] of partitionFaceIntervals(run, s)) {
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
          const y0 = o ? o.head : SLAB_TOP_Y;
          if (CEILING_Y - y0 < 0.01) continue;
          const us = splitEven(p, q, 1.2);
          for (let j = 0; j + 1 < us.length; j++) {
            const name = `sh${s > 0 ? "P" : "N"}_${k++}`;
            const room = runSideRoom(run, mid(us[j], us[j + 1]), s);
            boxR(b, name, "gypsum", "gypsum", [us[j], us[j + 1]], [y0, CEILING_Y], w, {
              faces: sheetFaces(s, "paint_wall", room?.paint ?? 0xf0efe8),
              supported: true,
              tags: ["drywall"],
            });
            pieces.push(idx.add({ name, u0: us[j], u1: us[j + 1], y0, y1: CEILING_Y, w0: w[0], w1: w[1], role }));
          }
        }
      }
      for (const sh of pieces) {
        let n = 0;
        for (const h of idx.overlapping(sh.u0, sh.u1, sh.y0, sh.y1, ["stud", "king", "jack", "cripple"], 0.008)) {
          bondAt(b, sh.name, h.box.name, "screw", 25 * fasteners(h.oy[1] - h.oy[0], 0.3), [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), s * SHEET_IN]);
          n++;
        }
        for (const h of idx.overlapping(sh.u0, sh.u1, sh.y0, sh.y1, ["plateB", "plateT", "header"], 0.008)) {
          bondAt(b, sh.name, h.box.name, "screw", 25 * fasteners(h.ou[1] - h.ou[0], 0.3), [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), s * SHEET_IN]);
          n++;
        }
        if (!n) worldAt(b, sh.name, "screw", 60, [mid(sh.u0, sh.u1), mid(sh.y0, sh.y1), s * SHEET_IN]);
      }
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const A = pieces[i],
            B = pieces[j];
          const oy0 = Math.max(A.y0, B.y0),
            oy1 = Math.min(A.y1, B.y1);
          if (oy1 - oy0 > 0.05 && (Math.abs(A.u1 - B.u0) < 1e-6 || Math.abs(B.u1 - A.u0) < 1e-6)) {
            const u = Math.abs(A.u1 - B.u0) < 1e-6 ? A.u1 : A.u0;
            bondAt(b, A.name, B.name, "glue", 6, [u, mid(oy0, oy1), s > 0 ? w[1] : w[0]]);
          }
        }
      }
    }
    // gypsum end caps on free (corner-wrapping) ends
    const caps: Array<{ name: string; end: 0 | 1 }> = [];
    for (const end of [0, 1] as const) {
      if ((end === 0 ? run.end0 : run.end1) !== "free") continue;
      const ua = end === 0 ? run.u0 : fu1,
        ub = end === 0 ? fu0 : run.u1;
      const name = `cap_${end}`;
      const pt = frame.toWorld(end === 0 ? run.u0 - 0.05 : run.u1 + 0.05, 0, 0);
      const tint = roomAt(pt.x, pt.z)?.paint ?? 0xf0efe8;
      boxR(b, name, "gypsum", "gypsum", [ua, ub], [SLAB_TOP_Y, CEILING_Y], [-SHEET_IN, SHEET_IN], {
        faces: { [end === 0 ? "nx" : "px"]: { surf: "paint_wall", tint } },
        supported: true,
        tags: ["drywall"],
      });
      idx.add({ name, u0: ua, u1: ub, y0: SLAB_TOP_Y, y1: CEILING_Y, w0: -SHEET_IN, w1: SHEET_IN, role: "cap" });
      const st = end === 0 ? end0 : end1;
      bondAt(b, name, st.name, "screw", 25 * fasteners(CEILING_Y - STUD_Y0, 0.3), [end === 0 ? fu0 : fu1, 1.35, 0]);
      const uEnd = end === 0 ? run.u0 : run.u1;
      for (const sh of idx.byRole("sheetP", "sheetN")) {
        if (Math.abs((end === 0 ? sh.u0 : sh.u1) - uEnd) < 1e-6) bondAt(b, name, sh.name, "glue", 8, [uEnd, mid(sh.y0, sh.y1), sh.w0 > 0 ? SHEET_IN : -SHEET_IN]);
      }
      caps.push({ name, end });
    }

    // ================================================================ cased archway trim
    for (const o of run.openings) {
      if (o.op.kind !== "opening") continue;
      const { c0, c1, top } = clearOpening(o, JAMB_T);
      const T: Interval = [-run.half, run.half];
      const id = o.op.id;
      const L = `${id}_linerL`,
        R = `${id}_linerR`,
        H = `${id}_linerH`;
      const trim = { tint: PAL.trimWhite, tags: ["trim"] };
      boxR(b, L, "softwood", "wood_painted", [o.r0 + SHIM, c0], [0, o.head - SHIM], T, trim);
      boxR(b, R, "softwood", "wood_painted", [c1, o.r1 - SHIM], [0, o.head - SHIM], T, trim);
      boxR(b, H, "softwood", "wood_painted", [c0, c1], [top, o.head - SHIM], T, { ...trim, grain: "x" });
      bondAt(b, L, `jackL_${id}`, "nail", 90, [o.r0, 1.0, 0]);
      bondAt(b, R, `jackR_${id}`, "nail", 90, [o.r1, 1.0, 0]);
      bondAt(b, H, `header_${id}`, "nail", 90, [mid(o.r0, o.r1), o.head, 0]);
      bondAt(b, H, L, "nail", 40, [c0, mid(top, o.head), 0]);
      bondAt(b, H, R, "nail", 40, [c1, mid(top, o.head), 0]);
      for (const s of [1, -1] as const) {
        const wc: Interval = s > 0 ? [run.half, run.half + CASING_T] : [-(run.half + CASING_T), -run.half];
        const tag = s > 0 ? "P" : "N";
        const cL = `${id}_casing${tag}L`,
          cR = `${id}_casing${tag}R`,
          cH = `${id}_casing${tag}H`;
        const yTop = top + CASING_REVEAL;
        const cas = { faces: { [s > 0 ? "pz" : "nz"]: { surf: "wood_painted" as const, tint: PAL.trimWhite } }, tags: ["trim"] };
        boxR(b, cL, "mdf", "mdf", [c0 - CASING_REVEAL - CASING_W, c0 - CASING_REVEAL], [0, yTop], wc, cas);
        boxR(b, cR, "mdf", "mdf", [c1 + CASING_REVEAL, c1 + CASING_REVEAL + CASING_W], [0, yTop], wc, cas);
        boxR(b, cH, "mdf", "mdf", [c0 - CASING_REVEAL - CASING_W, c1 + CASING_REVEAL + CASING_W], [yTop, yTop + CASING_W], wc, { ...cas, grain: "x" });
        bondAt(b, cL, L, "nail", 45, [c0 - CASING_REVEAL, yTop / 2, s * run.half]);
        bondAt(b, cR, R, "nail", 45, [c1 + CASING_REVEAL, yTop / 2, s * run.half]);
        bondAt(b, cH, H, "nail", 30, [mid(c0, c1), yTop, s * run.half]);
        bondAt(b, cH, cL, "glue", 10, [c0 - CASING_REVEAL - CASING_W / 2, yTop, mid(wc[0], wc[1])]);
        bondAt(b, cH, cR, "glue", 10, [c1 + CASING_REVEAL + CASING_W / 2, yTop, mid(wc[0], wc[1])]);
        for (const [cn, u0, u1, y0, y1] of [
          [cL, c0 - CASING_REVEAL - CASING_W, c0 - CASING_REVEAL, 0, yTop],
          [cR, c1 + CASING_REVEAL, c1 + CASING_REVEAL + CASING_W, 0, yTop],
          [cH, c0 - CASING_REVEAL - CASING_W, c1 + CASING_REVEAL + CASING_W, yTop, yTop + CASING_W],
        ] as Array<[string, number, number, number, number]>) {
          for (const h of idx.overlapping(u0, u1, y0, y1, ["king", "jack", "header"], 0.005)) {
            bondAt(b, cn, h.box.name, "nail", 20, [mid(h.ou[0], h.ou[1]), mid(h.oy[0], h.oy[1]), s * run.half]);
          }
        }
      }
    }

    // ================================================================ face finishes
    for (const ctx of [ctxP, ctxN]) addWallTiles(ctx);
    const reaches: Record<string, boolean> = {};
    for (const ctx of [ctxP, ctxN]) {
      const cov = addBaseboards(ctx);
      for (const c of cov) {
        if (run.end0 === "free" && Math.abs(c.lo - run.u0) < 1e-6) reaches[`${ctx.side}:0`] = true;
        if (run.end1 === "free" && Math.abs(c.hi - run.u1) < 1e-6) reaches[`${ctx.side}:1`] = true;
      }
    }
    // baseboard wrapping a free wall end
    for (const cap of caps) {
      const pos = !!reaches[`1:${cap.end}`],
        neg = !!reaches[`-1:${cap.end}`];
      if (!pos && !neg) continue;
      const ua = cap.end === 0 ? run.u0 - BASEBOARD_T : run.u1,
        ub = cap.end === 0 ? run.u0 : run.u1 + BASEBOARD_T;
      const w0 = -(run.half + (neg ? BASEBOARD_T : 0)),
        w1 = run.half + (pos ? BASEBOARD_T : 0);
      const name = `base_cap${cap.end}`;
      boxR(b, name, "mdf", "mdf", [ua, ub], [0, 0.09], [w0, w1], {
        faces: { [cap.end === 0 ? "nx" : "px"]: { surf: "wood_painted", tint: PAL.trimWhite }, py: { surf: "wood_painted", tint: PAL.trimWhite } },
        tags: ["baseboard"],
      });
      bondAt(b, name, cap.name, "glue", 10, [cap.end === 0 ? run.u0 : run.u1, 0.045, 0]);
      bondAt(b, name, cap.end === 0 ? end0.name : end1.name, "nail", 20, [cap.end === 0 ? fu0 : fu1, 0.045, 0]);
    }
    for (const pl of placed) addPlate(ctxOf(pl.side), pl.p, pl.u, pl.p.y, pl.box, []);

    // valves / drain flanges on the finished face (on the tiles where tiled)
    for (const v of valves) {
      const ctx = ctxOf(v.side);
      const tiled = tileZonesOnFace(ctx).some((z) => v.u >= z.u0 && v.u <= z.u1 && v.y >= z.y0 && v.y <= z.y1);
      const fW = run.half + (tiled ? WALL_TILE_T : 0);
      const s = v.side;
      const faceParts = idx.overlapping(v.u - 0.01, v.u + 0.01, v.y - 0.01, v.y + 0.01, tiled ? ["walltile"] : [s > 0 ? "sheetP" : "sheetN"], 0.001);
      const at = (dw: number): V3 => [v.u, v.y, s * (fW + dw)];
      // fixings: threaded onto the stub through the sheet; on tiled walls the stub stops behind
      // the sheet, so the trim is sealed to the tiles and screwed through into the sheet
      const sheetBehind = idx.overlapping(v.u - 0.01, v.u + 0.01, v.y - 0.01, v.y + 0.01, [s > 0 ? "sheetP" : "sheetN"], 0.001);
      const fixTrim = (part: string, through: number) => {
        if (tiled) {
          for (const fp of faceParts) bondAt(b, part, fp.box.name, "glue", 20, at(0));
          for (const sh of sheetBehind) bondAt(b, part, sh.box.name, "screw", 30, [v.u, v.y, s * run.half]);
        } else {
          bondAt(b, part, v.stub, v.kind === "drain" ? "glue" : "screw", through, [v.u, v.y, s * SHEET_IN]);
          for (const fp of faceParts) bondAt(b, part, fp.box.name, "friction", 3, at(0));
        }
      };
      if (v.kind === "drain") {
        const fl = `${v.id}_drain_flange`,
          so = `${v.id}_drain_stubout`;
        b.cyl(fl, "steel", "chrome", 0.032, 0.008, at(0.004), { axis: "z", segments: 12, tags: ["plumbing"] });
        b.cyl(so, "plastic", "plastic", 0.02, 0.05, at(0.033), { axis: "z", segments: 10, tint: PAL.pvc, tags: ["plumbing", "drain"] });
        fixTrim(fl, 40);
        bondAt(b, so, fl, "glue", 40, at(0.008));
      } else {
        const es = `${v.id}_${v.kind}_escutcheon`,
          body = `${v.id}_${v.kind}_valve`,
          hd = `${v.id}_${v.kind}_handle`;
        b.cyl(es, "steel", "chrome", 0.028, 0.005, at(0.0025), { axis: "z", segments: 12, tags: ["plumbing"] });
        b.cyl(body, "steel", "chrome", 0.011, 0.04, at(0.025), { axis: "z", segments: 10, tags: ["plumbing", "valve"] });
        boxR(b, hd, "steel", "chrome", [v.u - 0.017, v.u + 0.017], [v.y - 0.006, v.y + 0.006], [Math.min(s * (fW + 0.045), s * (fW + 0.057)), Math.max(s * (fW + 0.045), s * (fW + 0.057))], {
          tint: v.kind === "hot" ? 0xffd6d0 : 0xd6e4ff,
          tags: ["plumbing"],
        });
        fixTrim(es, 40);
        bondAt(b, body, es, "press", 30, at(0.005));
        bondAt(b, hd, body, "press", 6, at(0.045));
        b.water(body, at(0.03), [0, 0, s], 0.75);
      }
    }
  });
  const def = b.build();
  def.room = (roomN ?? roomP)?.id;
  return def;
}
