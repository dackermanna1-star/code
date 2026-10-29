// Freestanding 30" electric range (0.757 × 0.915 × 0.64 m body, ~55 kg):
//  * 0.8 mm steel body (sides, back, base pan) on four feet; the right rear foot hooks into an
//    anti-tip bracket screwed to the floor (world bond) — rip it free before you can tip it.
//  * Glass-ceramic cooktop (4 mm, glass with 2.5× strength: shrugs off pans, shatters under a
//    hammer) over four radiant elements on a steel tray.
//  * Oven: 1 mm enamelled cavity in fibreglass insulation, bake/broil elements (steel tube loops),
//    an oven lamp, two wire racks on slider joints, and a bottom-hinged, spring-balanced door
//    with a detent: steel frame, dark tempered outer glass and a tempered inner window.
//  * Front control panel with six press-fit knobs, a clock display (screen-less 7-segment
//    surface) and the control board (sparks); a storage drawer on runners under the oven.
//  * Optional tea towel draped over the door handle (soft fabric held by friction).
// Origin: floor centre of the footprint, front +Z. PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import { barHandle, hingeAxis, knob, pcb, pullHandle } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { KPAL, bondTouching, centerOf, finish } from "./lib.ts";

export interface RangeOpts {
  finish?: "stainless" | "white" | "black";
  towel?: boolean;
  seed?: number;
}

export const RANGE_DIM = { w: 0.757, h: 0.915, zBack: -0.32, zFront: 0.29, doorFront: 0.335 } as const;

export function buildRange(o: RangeOpts = {}): AssemblyDef {
  const b = new Builder("range", "Electric Range", "appliance", 950, o.seed);
  const W = RANGE_DIM.w;
  const hw = W / 2;
  const t = 0.0008;
  const ZB = RANGE_DIM.zBack,
    ZF = RANGE_DIM.zFront;
  const front = o.finish === "white" ? { surf: "metal_painted" as const, tint: 0xf2f1ee } : o.finish === "black" ? { surf: "metal_painted" as const, tint: 0x222326 } : { surf: KPAL.stainless.surf, tint: 0xffffff };
  const side = o.finish === "white" ? { surf: "metal_painted" as const, tint: 0xf2f1ee } : { surf: "metal_painted" as const, tint: 0x3a3c3f };
  const yTop = 0.911; // underside of the glass
  // ------------------------------------------------------------------ body
  const feet: string[] = [];
  [
    [-hw + 0.04, ZB + 0.05],
    [hw - 0.04, ZB + 0.05],
    [-hw + 0.04, ZF - 0.05],
    [hw - 0.04, ZF - 0.05],
  ].forEach(([x, z], k) => feet.push(b.cyl(`foot${k}`, "steel", "metal_raw", 0.012, 0.02, [x, 0.01, z], { segments: 8 })));
  const pan = b.box("basepan", "steelSheet", "metal_raw", [W, 0.001, ZF - ZB], [0, 0.0205, (ZB + ZF) / 2], { tint: 0xb9bab7 });
  const sideL = b.box("side_l", "steelSheet", side.surf, [t, yTop - 0.021, ZF - ZB], [-hw + t / 2, (0.021 + yTop) / 2, (ZB + ZF) / 2], { tint: side.tint });
  const sideR = b.box("side_r", "steelSheet", side.surf, [t, yTop - 0.021, ZF - ZB], [hw - t / 2, (0.021 + yTop) / 2, (ZB + ZF) / 2], { tint: side.tint });
  const back = b.box("back", "steelSheet", "metal_raw", [W - 2 * t, yTop - 0.021, t], [0, (0.021 + yTop) / 2, ZB + t / 2], { tint: 0x9c9d9b });
  for (const f of feet) b.screw(f, pan, 1, 40);
  for (const p of [sideL, sideR, back]) b.weld(p, pan, 120);
  b.weld(sideL, back, 140);
  b.weld(sideR, back, 140);
  // anti-tip bracket on the right rear foot
  b.world(feet[1], "bolt", 150, [hw - 0.04, 0.005, ZB + 0.05]);
  // front frame: control panel + cross member under the glass, a sill under the door
  const panel = b.box("panel", "steelSheet", front.surf, [W - 2 * t, 0.11, t], [0, 0.835, ZF - t / 2], { tint: front.tint });
  const cross = b.box("cross", "steelSheet", "metal_raw", [W - 2 * t, 0.021, 0.015], [0, 0.9005, ZF - 0.0075 - t], { tint: 0x9c9d9b, mass: 0.3 });
  const sill = b.box("sill", "steelSheet", side.surf, [W - 2 * t, 0.01, 0.02], [0, 0.16, ZF - 0.01], { tint: side.tint, mass: 0.25 });
  b.weld(panel, sideL, 80);
  b.weld(panel, sideR, 80);
  b.weld(cross, sideL, 60);
  b.weld(cross, sideR, 60);
  b.weld(cross, panel, 40);
  b.weld(sill, sideL, 50);
  b.weld(sill, sideR, 50);
  // ------------------------------------------------------------------ cooktop
  const glass = b.box("cooktop", "glass", "plastic_glossy", [W, 0.004, ZF - ZB - 0.02], [0, yTop + 0.002, (ZB + ZF) / 2 - 0.01], {
    tint: 0x101113,
    strength: 2.5,
    faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" } },
  });
  bondTouching(b, glass, [sideL, sideR, back, cross], "glue", 60, 0.001, 3);
  const tray = b.box("tray", "steelSheet", "metal_raw", [W - 2 * t, 0.0006, ZF - ZB - 0.035 - t], [0, 0.84, ZB + t + (ZF - ZB - 0.035 - t) / 2], { tint: 0x8d8e8b });
  b.weld(tray, sideL, 50);
  b.weld(tray, sideR, 50);
  b.weld(tray, back, 40);
  const elems: Array<[number, number, number]> = [
    [-0.19, 0.08, 0.09],
    [0.19, 0.08, 0.075],
    [-0.19, -0.17, 0.075],
    [0.19, -0.17, 0.095],
  ];
  elems.forEach(([x, z, r], k) => {
    const e = b.cyl(`element${k}`, "steel", "metal_raw", r, 0.02, [x, 0.851, z], { segments: 12, mass: 0.55, tint: 0x6d6a66 });
    b.screw(e, tray, 2, 15);
  });
  // ------------------------------------------------------------------ oven cavity + insulation
  const cav = { x: 0.25, y0: 0.2, y1: 0.72, z0: -0.25, z1: ZF - 0.001 };
  const ct = 0.001;
  const cz0 = cav.z0 - ct; // panels run under/behind the back panel so every seam is a face joint
  const cdz = cav.z1 - cz0;
  const czc = (cz0 + cav.z1) / 2;
  const cavL = b.box("cav_l", "steelSheet", "metal_black", [ct, cav.y1 - cav.y0, cdz], [-cav.x - ct / 2, (cav.y0 + cav.y1) / 2, czc], { tint: 0x23262b });
  const cavR = b.box("cav_r", "steelSheet", "metal_black", [ct, cav.y1 - cav.y0, cdz], [cav.x + ct / 2, (cav.y0 + cav.y1) / 2, czc], { tint: 0x23262b });
  const cavT = b.box("cav_t", "steelSheet", "metal_black", [2 * cav.x + 2 * ct, ct, cdz], [0, cav.y1 + ct / 2, czc], { tint: 0x23262b });
  const cavB = b.box("cav_b", "steelSheet", "metal_black", [2 * cav.x + 2 * ct, ct, cdz], [0, cav.y0 - ct / 2, czc], { tint: 0x23262b });
  const cavK = b.box("cav_k", "steelSheet", "metal_black", [2 * cav.x, cav.y1 - cav.y0, ct], [0, (cav.y0 + cav.y1) / 2, cav.z0 - ct / 2], { tint: 0x23262b });
  b.autoBond("weld", 45, 0.0004, (a, c) => a.startsWith("cav_") && c.startsWith("cav_"));
  // front flange (bent sheet) welded to the cavity side edges and the body sides
  const rails: string[] = [];
  for (const sx of [-1, 1]) {
    const x0 = sx * cav.x,
      x1 = sx * (hw - t);
    rails.push(b.box(sx < 0 ? "flange_l" : "flange_r", "steelSheet", side.surf, [Math.abs(x1 - x0), cav.y1 - cav.y0 + 2 * ct, 0.001], [(x0 + x1) / 2, (cav.y0 + cav.y1) / 2, ZF + 0.0005], { tint: side.tint }));
  }
  b.weld(rails[0], cavL, 80);
  b.weld(rails[0], sideL, 80);
  b.weld(rails[1], cavR, 80);
  b.weld(rails[1], sideR, 80);
  // oven floor sheet: spans the body sides under the cavity and carries it (the storage drawer
  // slides underneath)
  const floor = b.box("cav_floor", "steelSheet", "metal_raw", [W - 2 * t, 0.0006, ZF - 0.002 - (ZB + t)], [0, cav.y0 - ct - 0.0003, (ZB + t + ZF - 0.002) / 2], { tint: 0x8d8e8b });
  b.weld(floor, sideL, 60);
  b.weld(floor, sideR, 60);
  b.weld(floor, back, 40);
  b.weld(floor, cavB, 60);
  // fibreglass batts: over the cavity, both sides, behind
  const insT = b.box("ins_top", "insulation", "insulation", [2 * cav.x, 0.1, cav.z1 - cav.z0 - 0.03], [0, cav.y1 + ct + 0.05, cav.z0 + (cav.z1 - cav.z0 - 0.03) / 2], { tint: 0xe8d07a });
  const insL = b.box("ins_l", "insulation", "insulation", [hw - t - cav.x - ct - 0.002, cav.y1 - cav.y0, cav.z1 - cav.z0 - 0.02], [-(cav.x + ct + (hw - t - cav.x - ct) / 2), (cav.y0 + cav.y1) / 2, cav.z0 + (cav.z1 - cav.z0 - 0.02) / 2 - 0.0], { tint: 0xe8d07a });
  const insR = b.box("ins_r", "insulation", "insulation", [hw - t - cav.x - ct - 0.002, cav.y1 - cav.y0, cav.z1 - cav.z0 - 0.02], [cav.x + ct + (hw - t - cav.x - ct) / 2, (cav.y0 + cav.y1) / 2, cav.z0 + (cav.z1 - cav.z0 - 0.02) / 2 - 0.0], { tint: 0xe8d07a });
  const insK = b.box("ins_k", "insulation", "insulation", [2 * cav.x, cav.y1 - cav.y0, cav.z0 - ct - (ZB + t) - 0.002], [0, (cav.y0 + cav.y1) / 2, (cav.z0 - ct + ZB + t) / 2], { tint: 0xe8d07a });
  b.friction(insT, cavT, 4);
  b.friction(insL, cavL, 4);
  b.friction(insR, cavR, 4);
  b.friction(insK, cavK, 4);
  // elements, lamp, racks
  const bake = b.tube(
    "bake",
    "steel",
    "metal_raw",
    [
      [-0.2, cav.y0 + 0.012, -0.22],
      [0.2, cav.y0 + 0.012, -0.22],
      [0.2, cav.y0 + 0.012, 0.15],
      [-0.2, cav.y0 + 0.012, 0.15],
    ],
    0.0045,
    { closed: true, sides: 6, kgPerM: 0.25, tess: 0, tint: 0x5b5753 },
  );
  const broil = b.tube(
    "broil",
    "steel",
    "metal_raw",
    [
      [-0.2, cav.y1 - 0.015, -0.22],
      [0.2, cav.y1 - 0.015, -0.22],
      [0.2, cav.y1 - 0.015, 0.12],
      [-0.2, cav.y1 - 0.015, 0.12],
    ],
    0.0045,
    { closed: true, sides: 6, kgPerM: 0.25, tess: 0, tint: 0x5b5753 },
  );
  // terminal brackets through the cavity back
  const bkB = b.box("bake_bracket", "steel", "metal_raw", [0.05, 0.02, -0.22 - 0.0045 - cav.z0], [0, cav.y0 + 0.012, (cav.z0 + (-0.22 - 0.0045)) / 2], { tess: 0 });
  const bkT = b.box("broil_bracket", "steel", "metal_raw", [0.05, 0.02, -0.22 - 0.0045 - cav.z0], [0, cav.y1 - 0.015, (cav.z0 + (-0.22 - 0.0045)) / 2], { tess: 0 });
  b.weld(bkB, cavK, 40);
  b.weld(bkT, cavK, 40);
  bondTouching(b, bkB, bake, "screw", 30, 0.0015);
  bondTouching(b, bkT, broil, "screw", 30, 0.0015);
  const lamp = b.cyl("lamp", "glass", "bulb_off", 0.016, 0.03, [cav.x - 0.04, cav.y1 - 0.015, cav.z0 + 0.04], { segments: 8 });
  b.clip(lamp, cavT, 4);
  [0.33, 0.5].forEach((y, k) => {
    const rack = b.box(`rack${k}`, "steel", "vent_grille", [2 * cav.x - 0.006, 0.008, cav.z1 - cav.z0 - 0.05], [0, y, cav.z0 + 0.01 + (cav.z1 - cav.z0 - 0.05) / 2], { mass: 1.6, tint: 0xd8d8d8, tess: 0 });
    const g = b.slider(rack, cavL, { pivots: [[-cav.x + 0.003, y, 0]], axis: [0, 0, 1], min: 0, max: 0.28, strength: 40, friction: 0.4 });
    b.slider(rack, cavR, { pivots: [[cav.x - 0.003, y, 0]], axis: [0, 0, 1], min: 0, max: 0.28, strength: 40, friction: 0.4, group: g });
  });
  // ------------------------------------------------------------------ oven door (bottom hinge)
  // Steel frame (side rails, bottom rail, full-width top rail carrying the handle), dark tempered
  // outer glass below the top rail, tempered inner window; it closes 1.5 mm proud of the flanges.
  const dz0 = ZF + 0.0015,
    dz1 = RANGE_DIM.doorFront;
  const dy0 = 0.17,
    dy1 = 0.775;
  const dW = W - 0.012;
  const railW = 0.03;
  const topH = 0.06;
  const glassT = 0.005;
  const dcz = (dz0 + dz1 - glassT) / 2; // frame depth behind the outer glass
  const fdz = dz1 - glassT - dz0;
  const dSideL = b.box("door_side_l", "steelSheet", "metal_raw", [railW, dy1 - topH - dy0, fdz], [-dW / 2 + railW / 2, (dy0 + dy1 - topH) / 2, dcz], { mass: 0.45, tint: 0x8e8f8c });
  const dSideR = b.box("door_side_r", "steelSheet", "metal_raw", [railW, dy1 - topH - dy0, fdz], [dW / 2 - railW / 2, (dy0 + dy1 - topH) / 2, dcz], { mass: 0.45, tint: 0x8e8f8c });
  const dTop = b.box("door_top", "steelSheet", front.surf, [dW, topH, dz1 - dz0], [0, dy1 - topH / 2, (dz0 + dz1) / 2], { mass: 0.6, tint: front.tint });
  const dBot = b.box("door_bot", "steelSheet", front.surf, [dW - 2 * railW, 0.05, fdz], [0, dy0 + 0.025, dcz], { mass: 0.4, tint: front.tint });
  const outer = b.box("door_glass", "temperedGlass", "glass_dark", [dW, dy1 - topH - dy0, glassT], [0, (dy0 + dy1 - topH) / 2, dz1 - glassT / 2], {
    faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } },
  });
  const inner = b.box("door_window", "temperedGlass", "glass", [dW - 2 * railW, dy1 - topH - dy0 - 0.05, 0.004], [0, (dy0 + 0.05 + dy1 - topH) / 2, dz0 + 0.002], {
    faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } },
  });
  b.weld(dTop, dSideL, 60);
  b.weld(dTop, dSideR, 60);
  b.weld(dBot, dSideL, 60);
  b.weld(dBot, dSideR, 60);
  for (const p of [dSideL, dSideR, dTop, dBot]) b.bond(outer, p, "glue", { strength: 25 });
  for (const p of [dSideL, dSideR, dTop, dBot]) b.bond(inner, p, "clip", { strength: 6 });
  const dh = barHandle(b, "door_handle", { on: dTop, len: dW - 0.12, size: 0.016, standoff: 0.04, mat: "steel", surf: "steel_brushed", screw: 60 }, [0, dy1 - topH / 2, dz1], undefined);
  // hinges at the bottom corners: free edge points up, opens towards +Z; spring-balanced, detent.
  // The pivot sits on the door's FRONT bottom edge (as on real hinge arms), so the whole leaf rises
  // as it swings: it never dips below dy0 and clears the storage drawer front 15 mm below it
  // (a pivot on the back edge swings the bottom rail down into the drawer).
  const axis = hingeAxis([0, 1, 0], [0, 0, 1]);
  const g = b.hinge(dSideL, sideL, { pivots: [[-dW / 2 + 0.01, dy0, dz1]], axis, min: 0, max: 88, strength: 70, friction: 0.6, spring: 22 });
  b.hinge(dSideR, sideR, { pivots: [[dW / 2 - 0.01, dy0, dz1]], axis, min: 0, max: 88, strength: 70, friction: 0.6, spring: 22, group: g, latch: 6, latchPos: [0, dy1 - 0.01, dz0], latchPart: dTop, latchFixed: panel });
  // ------------------------------------------------------------------ storage drawer
  const drY0 = 0.035,
    drY1 = 0.15;
  const drD = 0.5;
  const drW = 2 * (hw - t) - 0.03;
  const drFront = b.box("drawer_front", "steelSheet", front.surf, [dW, 0.125, 0.02], [0, 0.03 + 0.0625, ZF + 0.01], { mass: 0.9, tint: front.tint });
  const dt = 0.0006; // 0.6 mm drawer sheet
  const drBot = b.box("drawer_bot", "steelSheet", "metal_raw", [drW, dt, drD], [0, drY0 + dt / 2, ZF - drD / 2], { tint: 0x8d8e8b });
  const drL = b.box("drawer_l", "steelSheet", "metal_raw", [dt, drY1 - drY0 - dt, drD], [-drW / 2 + dt / 2, (drY0 + dt + drY1) / 2, ZF - drD / 2], { tint: 0x8d8e8b });
  const drR = b.box("drawer_r", "steelSheet", "metal_raw", [dt, drY1 - drY0 - dt, drD], [drW / 2 - dt / 2, (drY0 + dt + drY1) / 2, ZF - drD / 2], { tint: 0x8d8e8b });
  b.box("drawer_k", "steelSheet", "metal_raw", [drW - 2 * dt, drY1 - drY0 - dt, dt], [0, (drY0 + dt + drY1) / 2, ZF - drD + dt / 2], { tint: 0x8d8e8b });
  b.autoBond("weld", 40, 0.0004, (a, c) => a.startsWith("drawer_") && c.startsWith("drawer_"));
  pullHandle(b, "drawer_pull", { on: drFront, len: 0.3, depth: 0.018, width: 0.02, mat: "steel", surf: "steel_brushed", tint: 0xffffff }, [0, 0.0925, ZF + 0.02]);
  const dg = b.slider(drL, sideL, { pivots: [[-drW / 2, (drY0 + drY1) / 2, ZF - drD / 2]], axis: [0, 0, 1], min: 0, max: 0.42, strength: 50, friction: 0.3 });
  b.slider(drR, sideR, { pivots: [[drW / 2, (drY0 + drY1) / 2, ZF - drD / 2]], axis: [0, 0, 1], min: 0, max: 0.42, strength: 50, friction: 0.3, group: dg });
  // ------------------------------------------------------------------ controls
  const knobs: string[] = [];
  [-0.31, -0.22, -0.11, 0.11, 0.22, 0.31].forEach((x, k) => knobs.push(knob(b, `knob${k}`, { on: panel, r: 0.019, len: 0.028, kind: "press", strength: 2, mat: "plastic", surf: "plastic", tint: 0x1c1c1e }, [x, 0.835, ZF])));
  const disp = b.box("display", "plastic", "display_green", [0.09, 0.028, 0.004], [0, 0.835, ZF + 0.002], { tint: 0xffffff, faces: { nz: { surf: "plastic", tint: 0x101010 } } });
  b.press(disp, panel, 3);
  // control board on the back of the fascia (rotated so its components face into the body)
  pcb(b, "board", { w: 0.18, h: 0.07, mount: { to: panel, screws: 4, each: 10 }, sparks: 0.7, components: [{ kind: "relay", x: -0.05, y: 0 }, { kind: "relay", x: -0.02, y: 0 }, { kind: "chip", x: 0.04, y: 0.01 }, { kind: "cap", x: 0.075, y: -0.02 }] }, [0, 0.835, ZF - t - 0.0016], [0, 180, 0]);
  // ------------------------------------------------------------------ tea towel on the handle
  if (o.towel !== false) {
    const hb = dh.bar;
    const c = centerOf(b, hb);
    const bx = c[0] + 0.12;
    const yb = c[1];
    const zb = c[2];
    const tw = 0.24;
    const capT = b.box("towel_fold", "fabric", "fabric_cotton", [tw, 0.006, 0.026], [bx, yb + 0.008 + 0.003, zb], { tint: 0xc9483e, mass: 0.006 });
    const fr = b.box("towel_front", "fabric", "fabric_cotton", [tw, 0.21, 0.004], [bx, yb + 0.014 - 0.105, zb + 0.013 + 0.002], { tint: 0xc9483e, mass: 0.03 });
    const bk = b.box("towel_back", "fabric", "fabric_cotton", [tw, 0.16, 0.004], [bx, yb + 0.014 - 0.08, zb - 0.013 - 0.002], { tint: 0xc9483e, mass: 0.025 });
    b.bond(capT, fr, "fused", { strength: 30 });
    b.bond(capT, bk, "fused", { strength: 30 });
    b.friction(capT, hb, 3);
  }
  return finish(b);
}

/** Cooktop surface height of the range (top of the glass), for placing pans. */
export const RANGE_TOP_Y = 0.915;
/** Element centres in the range frame [x, z, r] (front-left, front-right, back-left, back-right). */
export const RANGE_BURNERS: ReadonlyArray<[number, number, number]> = [
  [-0.19, 0.08, 0.09],
  [0.19, 0.08, 0.075],
  [-0.19, -0.17, 0.075],
  [0.19, -0.17, 0.095],
];
export type { V3 };
