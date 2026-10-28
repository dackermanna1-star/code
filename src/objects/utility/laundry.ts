// Front-loading washing machine and tumble dryer (597 × 850 × 600 mm each).
//
// Both share a real appliance cabinet: four adjustable feet, a steel base frame, 0.8–1 mm painted
// steel side/back panels, a front panel built around the round door opening, a plastic control
// fascia (programme knob, display, buttons, control board) and a detergent drawer on a slider.
//
// Washer (~70 kg): a polypropylene tub hanging on two springs and standing on two friction
// dampers, a perforated stainless drum inside it on a bearing (it spins when knocked), three
// drum lifters, ~25 kg of CONCRETE counterweights bolted to the tub (top, sides, front), the
// motor under the tub, a rubber door bellow, the drain pump, inlet + drain hoses to the wall
// (water features) and a heavy door: plastic ring, thick glass bowl porthole, hinge + lock.
//
// Dryer (~38 kg): no tub, no concrete — a lighter steel drum on a rear bearing and front
// rollers, motor + blower + heater box at the back, felt door seal, a lint filter in a slot
// below the door opening (slider), a flexible aluminium vent duct to the wall and a power cord.
//
// Frame: origin on the floor at the centre of the footprint, door +Z, back −Z.

import { buttonGrid, pcb } from "../lib/kit.ts";
import { boxR, bondTouching, finish, mk, type BaseOpts, type Range } from "./helpers.ts";
import type { Builder, V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export const LAUNDRY = {
  w: 0.597,
  h: 0.85,
  d: 0.6,
  /** Door / drum axis height. */
  axisY: 0.43,
} as const;

interface CabinetParts {
  left: string;
  right: string;
  top: string;
  back: string;
  kick: string;
  frontL: string;
  frontR: string;
  frontLow: string;
  frontUp: string;
  fascia: string;
  fasciaEnd: string;
  rails: string[];
  cross: string;
  crossFront: string;
  feet: string[];
}

interface CabinetOpts {
  t: number;
  tint: number;
  /** Chipboard worktop (washer) or a steel lid (dryer). */
  worktop: boolean;
  /** Square door opening half size. */
  hole: number;
  fasciaTint: number;
}

const W = LAUNDRY.w,
  H = LAUNDRY.h,
  D = LAUNDRY.d,
  YC = LAUNDRY.axisY;
const Y0 = 0.02; // cabinet bottom (feet height)
/** Facets around tubs, drums, door rings (8: top/bottom/sides fall on tile vertices). */
const SEG = 8;
const COS_HALF = Math.cos(Math.PI / SEG);
/** Door rings are the most visible curve: rounder. */
const RING_SEG = 12;
const YF = 0.735; // fascia bottom

function cabinet(b: Builder, o: CabinetOpts): CabinetParts {
  const t = o.t;
  const paint = { tint: o.tint };
  // feet: rubber pads + threaded studs
  const feet: string[] = [];
  const rails: string[] = [];
  for (const [k, x] of [
    ["l", -0.27],
    ["r", 0.27],
  ] as Array<[string, number]>) {
    rails.push(boxR(b, `rail_${k}`, "steel", "metal_raw", [x - 0.015, x + 0.015], [Y0, Y0 + 0.03], [-D / 2 + o.t, D / 2 - 0.03], { tess: 0, mass: 0.7 }));
    for (const z of [-0.24, 0.24]) {
      const fk = `${k}${z < 0 ? "b" : "f"}`;
      const pad = b.cyl(`foot_${fk}`, "rubber", "rubber", 0.018, 0.012, [x, 0.006, z], { segments: 10, tint: 0x2a2a2a });
      const stud = b.cyl(`stud_${fk}`, "steel", "metal_raw", 0.006, Y0 - 0.012, [x, 0.012 + (Y0 - 0.012) / 2, z], { segments: 8 });
      b.press(pad, stud, 20);
      feet.push(pad, stud);
    }
  }
  for (let i = 0; i < 4; i++) b.bolt(feet[2 * i + 1], rails[i < 2 ? 0 : 1], 80);
  const cross = boxR(b, "rail_cross", "steel", "metal_raw", [-0.255, 0.255], [Y0, Y0 + 0.03], [-0.065, -0.035], { tess: 0, mass: 0.5 });
  b.weld(cross, rails[0], 120);
  b.weld(cross, rails[1], 120);
  const crossFront = boxR(b, "rail_front", "steel", "metal_raw", [-0.255, 0.255], [Y0, Y0 + 0.03], [0.15, 0.18], { tess: 0, mass: 0.5 });
  b.weld(crossFront, rails[0], 120);
  b.weld(crossFront, rails[1], 120);

  const yTopIn = o.worktop ? H - 0.02 : H - t;
  const left = boxR(b, "side_l", "steelSheet", "metal_painted", [-W / 2, -W / 2 + t], [Y0, yTopIn], [-D / 2, D / 2 - t], paint);
  const right = boxR(b, "side_r", "steelSheet", "metal_painted", [W / 2 - t, W / 2], [Y0, yTopIn], [-D / 2, D / 2 - t], paint);
  const back = boxR(b, "back", "steelSheet", "metal_painted", [-W / 2 + t, W / 2 - t], [Y0, yTopIn], [-D / 2, -D / 2 + t], paint);
  const top = o.worktop
    ? boxR(b, "worktop", "particleboard", "laminate_white", [-W / 2, W / 2], [H - 0.02, H], [-D / 2, D / 2], { tint: o.tint })
    : boxR(b, "lid", "steelSheet", "metal_painted", [-W / 2, W / 2], [H - t, H], [-D / 2, D / 2], paint);
  const zf0 = D / 2 - t;
  const hole = o.hole;
  const kick = boxR(b, "kick", "steelSheet", "metal_painted", [-W / 2 + t, W / 2 - t], [Y0, 0.1], [zf0, D / 2], paint);
  const frontL = boxR(b, "front_l", "steelSheet", "metal_painted", [-W / 2 + t, -hole], [0.1, YF], [zf0, D / 2], paint);
  const frontR = boxR(b, "front_r", "steelSheet", "metal_painted", [hole, W / 2 - t], [0.1, YF], [zf0, D / 2], paint);
  const frontLow = boxR(b, "front_low", "steelSheet", "metal_painted", [-hole, hole], [0.1, YC - hole], [zf0, D / 2], paint);
  const frontUp = boxR(b, "front_up", "steelSheet", "metal_painted", [-hole, hole], [YC + hole, YF], [zf0, D / 2], paint);
  // seams: spot welds on the shell, screws on the removable lid/panels
  const weld = (a: string, c: string, n: number) => b.weld(a, c, n * 18);
  weld(left, back, 9);
  weld(right, back, 9);
  for (const s of [left, right]) {
    weld(s, kick, 2);
    b.screw(s, rails[s === left ? 0 : 1], 2, 30);
  }
  weld(frontL, left, 7);
  weld(frontR, right, 7);
  weld(frontLow, kick, 3);
  weld(frontLow, frontL, 2);
  weld(frontLow, frontR, 2);
  weld(frontUp, frontL, 2);
  weld(frontUp, frontR, 2);
  weld(frontL, kick, 1);
  weld(frontR, kick, 1);
  b.screw(top, left, 2, 30);
  b.screw(top, right, 2, 30);
  b.screw(top, back, 2, 30);
  b.screw(back, rails[0], 1, 25);
  b.screw(back, rails[1], 1, 25);
  // control fascia: moulded plastic panel with the printed controls (drawer front sits left of it)
  const fz0 = D / 2 - 0.014;
  // drawer on the viewer's left (+X in the left-handed frame), controls to its right (−X)
  const fascia = boxR(b, "fascia", "plastic", "plastic", [-(W / 2 - t), 0.07], [YF, H - (o.worktop ? 0.02 : t)], [fz0, D / 2 + 0.002], {
    tint: o.fasciaTint,
    faces: { pz: { surf: "panel_appliance", tint: 0xffffff } },
  });
  const fasciaEnd = boxR(b, "fascia_end", "plastic", "plastic", [0.284, W / 2 - t], [YF, H - (o.worktop ? 0.02 : t)], [fz0, D / 2 + 0.002], { tint: o.fasciaTint });
  b.clip(fascia, top, 10);
  b.clip(fascia, frontUp, 10);
  b.clip(fascia, left, 8);
  b.clip(fasciaEnd, right, 8);
  b.clip(fasciaEnd, top, 6);
  return { left, right, top, back, kick, frontL, frontR, frontLow, frontUp, fascia, fasciaEnd, rails, cross, crossFront, feet };
}

/** Controls on the fascia + the control board behind it. */
function controls(b: Builder, c: CabinetParts, o: { display: "display_green" | "display_blue"; sparks: number }): void {
  const yc = (YF + H - 0.02) / 2;
  const zf = D / 2 + 0.002;
  const knobP = b.cyl("prog_knob", "plastic", "plastic_glossy", 0.028, 0.024, [0.005, yc, zf + 0.012], { axis: "z", segments: 14, tint: 0xd8d8d6, mass: 0.04 });
  b.press(knobP, c.fascia, 6);
  const lcd = boxR(b, "display", "lcd", "plastic", [-0.165, -0.065], [yc - 0.016, yc + 0.016], [zf, zf + 0.003], { tint: 0x101010, faces: { pz: { surf: o.display } } });
  b.glue(lcd, c.fascia, 6);
  buttonGrid(b, "btn", { on: c.fascia, rows: 1, cols: 3, size: [0.022, 0.012], pitch: [0.03, 0.02], tint: 0xe6e6e4, tints: [0x3a8a3a, 0xe6e6e4, 0xe6e6e4] }, [-0.235, yc, zf]);
  pcb(
    b,
    "ctrl",
    {
      w: 0.2,
      h: 0.07,
      components: [
        { kind: "chip", x: -0.03, y: 0.005 },
        { kind: "relay", x: 0.04, y: -0.012 },
        { kind: "relay", x: 0.065, y: 0.012 },
        { kind: "cap", x: -0.075, y: -0.015 },
        { kind: "connector", x: 0.0, y: -0.025 },
      ],
      mount: { to: c.fascia, screws: 4, each: 10 },
      sparks: o.sparks,
    },
    [-0.12, yc, D / 2 - 0.0156],
    [0, 180, 0],
  );
}

/** Detergent drawer on a slider, front flush with the fascia (left end). */
function detergentDrawer(b: Builder, c: CabinetParts, compartments: boolean): string {
  const x0 = 0.072,
    x1 = 0.282;
  const y0 = YF + 0.004,
    y1 = H - 0.026;
  const zf = D / 2 + 0.002;
  const front = boxR(b, "drawer_front", "plastic", "plastic_glossy", [x0, x1], [y0, y1], [zf - 0.015, zf], { tint: 0xf0f0ee });
  const zb = zf - 0.015 - 0.24;
  const bottom = boxR(b, "drawer_bottom", "plastic", "plastic", [x0 + 0.004, x1 - 0.004], [y0 + 0.004, y0 + 0.007], [zb, zf - 0.015], { tint: 0xe8e8e4 });
  const sideA = boxR(b, "drawer_side_l", "plastic", "plastic", [x0 + 0.004, x0 + 0.007], [y0 + 0.007, y1 - 0.01], [zb, zf - 0.015], { tint: 0xe8e8e4 });
  const sideB = boxR(b, "drawer_side_r", "plastic", "plastic", [x1 - 0.007, x1 - 0.004], [y0 + 0.007, y1 - 0.01], [zb, zf - 0.015], { tint: 0xe8e8e4 });
  const backP = boxR(b, "drawer_back", "plastic", "plastic", [x0 + 0.007, x1 - 0.007], [y0 + 0.007, y1 - 0.01], [zb, zb + 0.003], { tint: 0xe8e8e4 });
  for (const p of [bottom, sideA, sideB]) b.fuse(p, front, 20);
  b.fuse(sideA, bottom, 15);
  b.fuse(sideB, bottom, 15);
  b.fuse(backP, bottom, 10);
  b.fuse(backP, sideA, 8);
  b.fuse(backP, sideB, 8);
  if (compartments) {
    const div = boxR(b, "drawer_divider", "plastic", "plastic", [x0 + 0.07, x0 + 0.073], [y0 + 0.007, y1 - 0.02], [zb + 0.003, zf - 0.015], { tint: 0xe8e8e4, mass: 0.01 });
    b.fuse(div, bottom, 8);
  }
  const g = b.slider(front, c.top, { pivots: [[(x0 + x1) / 2, y1 - 0.004, zf - 0.12]], axis: [0, 0, 1], min: 0, max: 0.17, strength: 25, friction: 0.25, latch: 2 });
  b.slider(sideA, c.top, { pivots: [[x0 + 0.005, y1 - 0.004, zb + 0.06]], axis: [0, 0, 1], min: 0, max: 0.17, strength: 25, friction: 0.25, group: g });
  return front;
}

export interface HoseEnds {
  /** Wall valve outlet (inlet hose end) and drain standpipe point, local coordinates. */
  inlet?: V3;
  drain?: V3;
}

export interface WasherOpts extends BaseOpts {
  tint?: number;
  /** Wall connections; omitted = hose ends coiled loosely behind the machine. */
  hoses?: HoseEnds;
}

export function buildWasher(o: WasherOpts = {}): AssemblyDef {
  const b = mk("washer", "Washing Machine", "appliance", 650, o);
  const tint = o.tint ?? 0xf3f3f1;
  const t = 0.0008;
  const c = cabinet(b, { t, tint, worktop: true, hole: 0.165, fasciaTint: 0xf6f6f4 });
  controls(b, c, { display: "display_green", sparks: 0.7 });
  detergentDrawer(b, c, true);

  // ------------------------------------------------------------------ tub (hangs inside)
  const zt0 = -0.22,
    zt1 = D / 2 - 0.05;
  const tub = b.lathe("tub", "plastic", "plastic", "plastic", {
    profile: [
      [0.25, zt0],
      [0.25, zt1 - 0.03],
      [0.18, zt1],
    ],
    thickness: 0.006,
    segments: SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    tint: 0x9a9ea2,
  });
  const tubBack = b.cyl("tub_back", "plastic", "plastic", 0.25, 0.008, [0, YC, zt0 - 0.004], { axis: "z", segments: SEG, tint: 0x9a9ea2 });
  bondTouching(b, tubBack, tub, "fused", 300, 0.002);
  const tubTop = nearestTile(b, tub, [0, YC + 0.25, 0.1]);
  const tubBottom = nearestTile(b, tub, [0, YC - 0.25, -0.1]);

  // concrete counterweights (bolted on)
  const wTop = boxR(b, "weight_top", "concrete", "concrete", [-0.21, 0.21], [YC + 0.25 * COS_HALF, 0.74], [0.05, 0.21], { tint: 0xb9b4aa });
  b.bolt(wTop, tubTop, 220);
  const wFront = boxR(b, "weight_front", "concrete", "concrete", [-0.17, 0.17], [YC - 0.25, YC - 0.18], [zt1, zt1 + 0.04], { tint: 0xb9b4aa });
  b.bolt(wFront, nearestTile(b, tub, [0, YC - 0.21, zt1]), 180);
  for (const sx of [-1, 1]) {
    const side = boxR(b, `weight_${sx < 0 ? "l" : "r"}`, "concrete", "concrete", sx < 0 ? [-0.292, -0.252] : [0.252, 0.292], [YC - 0.12, YC + 0.12], [-0.05, 0.2], { tint: 0xb9b4aa });
    b.bolt(side, nearestTile(b, tub, [sx * 0.25, YC, 0.08]), 200);
  }

  // suspension: two springs up to the worktop frame, two dampers down to the base frame
  for (const sx of [-1, 1]) {
    const y0 = YC + Math.sqrt(0.25 * 0.25 - 0.2 * 0.2) + 0.006;
    const spring = b.cyl(`spring_${sx < 0 ? "l" : "r"}`, "steel", "metal_raw", 0.01, H - 0.02 - y0 - 0.001, [sx * 0.2, (y0 + H - 0.021) / 2, -0.12], { segments: 8, mass: 0.15 });
    b.clip(spring, c.top, 45);
    b.clip(spring, nearestTile(b, tub, [sx * 0.2, YC + 0.15, -0.12]), 45);
    const dy1 = YC - Math.sqrt(0.25 * 0.25 - 0.15 * 0.15) - 0.004;
    const damper = b.cyl(`damper_${sx < 0 ? "l" : "r"}`, "steel", "metal_painted", 0.012, dy1 - (Y0 + 0.03), [sx * 0.15, (dy1 + Y0 + 0.03) / 2, -0.05], { segments: 8, tint: 0x3a3a3a, mass: 0.35 });
    b.clip(damper, c.cross, 45);
    b.clip(damper, nearestTile(b, tub, [sx * 0.15, YC - 0.2, -0.05]), 45);
  }
  // motor hanging under the tub, drain pump behind the kick panel
  const motor = b.cyl("motor", "steel", "metal_raw", 0.055, 0.15, [0, YC - 0.25 - 0.017 - 0.055 + 0.012, -0.14], { axis: "x", segments: 12, mass: 4.5, tint: 0x8d8f91 });
  b.bolt(motor, tubBottom, 150);
  b.sparks(motor, 0.4);
  const pump = boxR(b, "pump", "plastic", "plastic", [0.12, 0.22], [Y0 + 0.012, 0.11], [0.2, D / 2 - t], { tint: 0x2f2f31, mass: 0.6 });
  b.screw(pump, c.kick, 2, 20);

  // ------------------------------------------------------------------ drum on its bearing
  const zd0 = -0.2,
    zd1 = zt1 - 0.02;
  const drum = b.lathe("drum", "steelSheet", "steel_brushed", "steel_brushed", {
    profile: [
      [0.225, zd0],
      [0.225, zd1 - 0.02],
      [0.17, zd1],
    ],
    thickness: 0.0008,
    segments: SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    seam: "weld",
    seamStrength: 120,
    tess: 0,
  });
  const drumBack = b.cyl("drum_back", "steelSheet", "steel_brushed", 0.225, 0.002, [0, YC, zd0 - 0.001], { axis: "z", segments: SEG, tess: 0 });
  bondTouching(b, drumBack, drum, "weld", 300, 0.002);
  const spider = b.cyl("drum_spider", "aluminum", "aluminum", 0.11, 0.016, [0, YC, zd0 - 0.002 - 0.008], { axis: "z", segments: 6, tess: 0 });
  b.bolt(spider, drumBack, 250);
  b.hinge(spider, tubBack, { pivots: [[0, YC, zt0]], axis: [0, 0, 1], min: -1e6, max: 1e6, strength: 400, friction: 0.08 });
  // three plastic lifters inside the drum, each on a facet centre (lathe θ maps to world −θ)
  for (let k = 0; k < 3; k++) {
    const a = ((247.5 + 135 * k) * Math.PI) / 180;
    const r = 0.225 * COS_HALF - 0.0008 - 0.014;
    const lift = b.box(`lifter${k}`, "plastic", "plastic", [0.04, 0.028, 0.3], [r * Math.cos(a), YC + r * Math.sin(a), (zd0 + zd1) / 2 - 0.02], { rot: [0, 0, (a * 180) / Math.PI - 90], tint: 0xd8d8d6, mass: 0.05 });
    bondTouching(b, lift, drum, "clip", 10, 0.004);
  }

  // ------------------------------------------------------------------ door bellow (rubber)
  const seal = b.lathe("seal", "rubber", "rubber", "rubber", {
    profile: [
      [0.175, zt1 + 0.002],
      [0.175, D / 2 - 0.0008],
    ],
    thickness: 0.012,
    segments: SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    tint: 0x3b3d40,
    seam: "glue",
    seamStrength: 25,
    mass: 0.6,
  });
  for (const s of seal) bondTouching(b, s, [c.frontL, c.frontR, c.frontLow, c.frontUp, ...tub], "clip", 8, 0.004, 0);

  door(b, c, { ring: 0.235, inner: 0.16, glassBowl: true, ringTint: 0xd8dadc, lockStrength: 18 });
  hoses(b, c, o.hoses);
  cord(b, c, undefined);
  b.water(tubBottom, [0, YC - 0.24, 0.0], [0, -1, 0.3], 0.15, 2); // sump water
  return finish(b, o);
}

export interface DryerOpts extends BaseOpts {
  tint?: number;
  /** Wall vent point (duct end), local; default straight back into the wall behind. */
  vent?: V3;
  /** Outlet position for the plug (local); omitted = plug lying behind the dryer. */
  plug?: V3;
}

export function buildDryer(o: DryerOpts = {}): AssemblyDef {
  const b = mk("dryer", "Tumble Dryer", "appliance", 480, o);
  const tint = o.tint ?? 0xf3f3f1;
  const t = 0.001;
  const c = cabinet(b, { t, tint, worktop: false, hole: 0.17, fasciaTint: 0xf6f6f4 });
  controls(b, c, { display: "display_blue", sparks: 0.7 });
  detergentDrawer(b, c, false); // water container drawer (condenser model)

  // ------------------------------------------------------------------ drum on rear bearing + front rollers
  const zd0 = -D / 2 + 0.06,
    zd1 = D / 2 - 0.05;
  const drum = b.lathe("drum", "steelSheet", "steel_brushed", "steel_brushed", {
    profile: [
      [0.25, zd0],
      [0.25, zd1 - 0.03],
      [0.19, zd1],
    ],
    thickness: 0.0008,
    segments: SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    seam: "weld",
    seamStrength: 120,
    tess: 0,
  });
  const drumBack = b.cyl("drum_back", "steelSheet", "metal_painted", 0.25, 0.0015, [0, YC, zd0 - 0.00075], { axis: "z", segments: SEG, tess: 0, tint: 0x8c8e90 });
  bondTouching(b, drumBack, drum, "weld", 300, 0.002);
  const hub = b.cyl("drum_hub", "steel", "metal_raw", 0.03, 0.04, [0, YC, zd0 - 0.0015 - 0.02], { axis: "z", segments: 8, mass: 0.5 });
  b.weld(hub, drumBack, 200);
  const bracket = boxR(b, "bearing_bracket", "steel", "metal_raw", [-0.05, 0.05], [YC - 0.05, YC + 0.05], [-D / 2 + t, zd0 - 0.0415], { tess: 0, mass: 0.6 });
  b.screw(bracket, c.back, 4, 30);
  b.hinge(hub, bracket, { pivots: [[0, YC, zd0 - 0.0415]], axis: [0, 0, 1], min: -1e6, max: 1e6, strength: 300, friction: 0.1 });
  for (const sx of [-1, 1]) {
    // rollers under the drum's front edge
    // touch the facet next to the drum's bottom vertex: n·c = R·cos(π/SEG) + r_roller
    const h = Math.PI / SEG;
    const ry = YC - (0.25 * Math.cos(h) + 0.02 - 0.07 * Math.sin(h)) / Math.cos(h) + 0.0005;
    const roller = b.cyl(`roller_${sx < 0 ? "l" : "r"}`, "rubber", "rubber", 0.02, 0.02, [sx * 0.07, ry, 0.165], { axis: "z", segments: 10, tint: 0x222222 });
    const axle = boxR(b, `roller_${sx < 0 ? "l" : "r"}_arm`, "steel", "metal_raw", [sx * 0.07 - 0.008, sx * 0.07 + 0.008], [Y0 + 0.03, ry - 0.02], [0.155, 0.175], { tess: 0, mass: 0.15 });
    b.press(roller, axle, 40);
    b.weld(axle, c.crossFront, 60);
    bondTouching(b, roller, drum, "friction", 3, 0.004);
  }
  // felt seal ring at the drum mouth
  const felt = b.lathe("felt", "fabric", "fabric_cotton", "fabric_cotton", {
    profile: [
      [0.19, zd1 + 0.001],
      [0.19, D / 2 - t],
    ],
    thickness: 0.012,
    segments: SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    tint: 0x3a3a3a,
    seam: "glue",
    seamStrength: 15,
    mass: 0.12,
  });
  for (const s of felt) bondTouching(b, s, [c.frontL, c.frontR, c.frontLow, c.frontUp], "glue", 6, 0.004, 0);

  // ------------------------------------------------------------------ drive + heat at the back bottom
  const motor = b.cyl("motor", "steel", "metal_raw", 0.05, 0.13, [0.1, Y0 + 0.03 + 0.05, -0.05], { axis: "x", segments: 12, mass: 4, tint: 0x8d8f91 });
  b.bolt(motor, c.cross, 120);
  b.sparks(motor, 0.4);
  const blower = boxR(b, "blower", "plastic", "plastic", [-0.255, -0.075], [Y0 + 0.03, 0.17], [-0.24, -0.08], { tint: 0x2f2f31, mass: 0.8 });
  b.screw(blower, c.rails[0], 2, 25);
  const heater = boxR(b, "heater", "steelSheet", "metal_raw", [-0.06, 0.06], [YC + 0.255, YC + 0.255 + 0.09], [-D / 2 + t, -D / 2 + t + 0.08], { mass: 1.8 });
  b.screw(heater, c.back, 4, 25);
  b.sparks(heater, 0.5);

  const liner = door(b, c, { ring: 0.235, inner: 0.165, glassBowl: false, ringTint: 0xdadcde, lockStrength: 10 });
  // fluff filter: a mesh plate clipped into the back of the door liner (pull it out)
  const lz = D / 2 + 0.003 + 0.05 - 0.014 - 0.04 - 0.004;
  const lint = boxR(b, "lint_filter", "plastic", "plastic", [-0.09, 0.09], [YC - 0.09, YC + 0.09], [lz, lz + 0.004], {
    tint: 0xe8e8e6,
    faces: { pz: { surf: "vent_grille", tint: 0xd0d0cc }, nz: { surf: "vent_grille", tint: 0xd0d0cc } },
    mass: 0.08,
  });
  b.clip(lint, liner, 4);

  // ------------------------------------------------------------------ vent duct + power cord
  const v = o.vent ?? ([-0.2, 0.15, -D / 2 - 0.06] as V3);
  const vx = Array.isArray(v) ? v : [v.x, v.y, v.z];
  const outlet = b.cyl("vent_outlet", "plastic", "plastic", 0.05, 0.03, [-0.2, 0.15, -D / 2 - 0.015 + 0.0001], { axis: "z", segments: 10, tint: 0x2f2f31, mass: 0.05 });
  b.screw(outlet, c.back, 2, 20);
  const duct = b.tube(
    "duct",
    "aluminum",
    "aluminum",
    [
      [-0.2, 0.15, -D / 2 - 0.03],
      [vx[0] * 0.5 - 0.1, (vx[1] + 0.15) / 2, (vx[2] - D / 2 - 0.03) / 2],
      [vx[0], vx[1], vx[2]],
    ],
    0.05,
    { sides: 8, kgPerM: 0.25, jointStrength: 20, tess: 0.05 },
  );
  b.clip(duct[0], outlet, 15);
  if (o.vent) b.world(duct[duct.length - 1], "clip", 15, vx);
  cord(b, c, o.plug, 0.22);
  return finish(b, o);
}

// =============================================================================================
// shared pieces
// =============================================================================================

function nearestTile(b: Builder, names: string[], p: [number, number, number]): string {
  let best = names[0],
    bd = Infinity;
  for (const n of names) {
    let cx = 0,
      cy = 0,
      cz = 0;
    const vs = b.get(n).poly.verts;
    for (const v of vs) {
      cx += v.x;
      cy += v.y;
      cz += v.z;
    }
    const d = Math.hypot(cx / vs.length - p[0], cy / vs.length - p[1], cz / vs.length - p[2]);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Round door: plastic ring frame, glass, hinge block (viewer's left = +X) and lock hook. Returns the inner part (bowl / liner). */
function door(b: Builder, c: CabinetParts, o: { ring: number; inner: number; glassBowl: boolean; ringTint: number; lockStrength: number }): string {
  const z0 = D / 2 + 0.003;
  const depth = 0.05;
  const ring = b.lathe("door_ring", "plastic", "plastic_glossy", "plastic", {
    profile: [
      [o.ring, z0],
      [o.ring, z0 + depth],
    ],
    thickness: o.ring - o.inner,
    segments: RING_SEG,
    pos: [0, YC, 0],
    rot: [90, 0, 0],
    tint: o.ringTint,
    mass: 1.1, // hollow moulding
    seam: "fused",
    seamStrength: 60,
  });
  const rIn = o.inner * Math.cos(Math.PI / RING_SEG) - 0.001; // inscribed radius of the ring's opening
  const glass = b.cyl("door_glass", "glass", "glass", rIn, 0.012, [0, YC, z0 + depth - 0.006 - 0.002], { axis: "z", segments: 12, capSurf: "glass", smooth: 0 });
  for (const t of ring) b.glue(glass, t, 8);
  let inner: string;
  if (o.glassBowl) {
    // thick glass bowl narrowing into the drum (hollow: mass of the real 5 mm bowl)
    inner = b.cyl("door_bowl", "glass", "glass", rIn * 0.68, 0.072, [0, YC, z0 + depth - 0.014 - 0.036], { axis: "z", rTop: rIn * 0.96, segments: 12, mass: 1.2 });
    b.fuse(inner, glass, 120);
  } else {
    inner = b.cyl("door_liner", "plastic", "plastic", rIn * 0.75, 0.04, [0, YC, z0 + depth - 0.014 - 0.02], { axis: "z", rTop: rIn * 0.9, segments: 10, tint: 0x9aa0a6, mass: 0.35 });
    b.glue(inner, glass, 20);
  }
  // hinge block on the viewer's left (+X), lock hook on the right (−X)
  const hingeBlk = boxR(b, "door_hinge", "plastic", "plastic", [o.ring - 0.01, o.ring + 0.03], [YC - 0.045, YC + 0.045], [D / 2 + 0.0005, D / 2 + 0.035], { tint: 0x9a9da0, mass: 0.12 });
  bondTouching(b, hingeBlk, ring, "bolt", 160, 0.004);
  b.hinge(hingeBlk, c.frontR, {
    pivots: [
      [o.ring + 0.02, YC - 0.035, D / 2],
      [o.ring + 0.02, YC + 0.035, D / 2],
    ],
    axis: [0, 1, 0],
    min: 0,
    max: 170,
    strength: 60,
    friction: 0.1,
    latch: o.lockStrength,
    latchFixed: c.frontL,
    latchPos: [-o.ring, YC, D / 2],
  });
  const grip = boxR(b, "door_grip", "plastic", "plastic_glossy", [-o.ring - 0.025, -o.ring + 0.0005], [YC - 0.05, YC + 0.05], [z0 + 0.01, z0 + depth - 0.005], { tint: 0xc8cacc, mass: 0.04 });
  bondTouching(b, grip, ring, "fused", 30, 0.004);
  return inner;
}

/** Inlet + drain hoses (water features) to the wall, or loose coils behind the machine. */
function hoses(b: Builder, c: CabinetParts, ends?: HoseEnds): void {
  const zb = -D / 2;
  const p = (v: V3): [number, number, number] => (Array.isArray(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);
  const inlet = ends?.inlet ? p(ends.inlet) : ([0.18, 0.86, zb - 0.06] as [number, number, number]);
  const drain = ends?.drain ? p(ends.drain) : ([0.1, 0.78, zb - 0.06] as [number, number, number]);
  const nipple = b.cyl("inlet_valve", "plastic", "plastic", 0.012, 0.03, [0.18, 0.78, zb - 0.015 + 0.0001], { axis: "z", segments: 8, tint: 0x2f2f31, mass: 0.05 });
  b.screw(nipple, c.back, 2, 20);
  const hIn = b.tube(
    "inlet_hose",
    "rubber",
    "rubber",
    [
      [0.18, 0.78, zb - 0.03],
      [0.18, 0.8, zb - 0.06],
      [(0.18 + inlet[0]) / 2, Math.max(0.82, inlet[1] - 0.08), (zb - 0.06 + inlet[2]) / 2],
      inlet,
    ],
    0.009,
    { sides: 6, tint: 0x9aa0a6, kgPerM: 0.18, jointStrength: 40 },
  );
  b.screw(hIn[0], nipple, 1, 40);
  if (ends?.inlet) {
    b.world(hIn[hIn.length - 1], "screw", 40, inlet);
    b.water(hIn[hIn.length - 1], inlet, [0, -0.3, 1], 0.7);
  } else b.water(hIn[hIn.length - 1], inlet, [0, -0.3, 1], 0.1, 0.3);
  const hDr = b.tube(
    "drain_hose",
    "rubber",
    "rubber",
    [
      [0.17, 0.08, zb + 0.0002],
      [0.17, 0.08, zb - 0.04],
      [(0.17 + drain[0]) / 2, (0.1 + drain[1]) / 2, zb - 0.05],
      [drain[0], drain[1] + 0.07, drain[2] + 0.03],
      [drain[0], drain[1] + 0.075, drain[2] - 0.01],
      [drain[0], drain[1], drain[2] - 0.03],
    ],
    0.011,
    { sides: 6, tint: 0x6b6f73, kgPerM: 0.2, jointStrength: 35 },
  );
  b.clip(hDr[0], c.back, 15);
  if (ends?.drain) b.world(hDr[hDr.length - 1], "friction", 12, [drain[0], drain[1], drain[2] - 0.03]);
  b.water(hDr[1], [0.17, 0.08, zb - 0.03], [0, -1, 0], 0.05, 1.5);
}

/** Power cord out of the back, to a wall socket (plug world-bonded) or lying behind. */
function cord(b: Builder, c: CabinetParts, plug?: V3, cx = -0.22): void {
  const zb = -D / 2;
  const relief = b.cyl("cord_relief", "rubber", "rubber", 0.007, 0.02, [cx, 0.7, zb - 0.01 + 0.0001], { axis: "z", segments: 8, tint: 0x1b1b1b, mass: 0.01 });
  b.clip(relief, c.back, 30);
  const end: [number, number, number] = plug ? (Array.isArray(plug) ? [plug[0], plug[1], plug[2]] : [plug.x, plug.y, plug.z]) : [cx, 0.012, zb - 0.12];
  const pts: Array<[number, number, number]> = plug
    ? [
        [cx, 0.7, zb - 0.02],
        [cx, 0.62, zb - 0.04],
        [(end[0] + cx) / 2, Math.max(0.65, end[1] - 0.12), (end[2] + zb - 0.04) / 2],
        [end[0], end[1] - 0.06, end[2]],
      ]
    : [
        [cx, 0.7, zb - 0.02],
        [cx, 0.4, zb - 0.04],
        [cx, 0.01, zb - 0.07],
        [cx - Math.sign(cx) * 0.1, 0.0045, zb - 0.12],
      ];
  const cordSegs = b.tube("cord", "copper", "rubber", pts, 0.0045, { sides: 6, tint: 0x1b1b1b, kgPerM: 0.09, jointStrength: 40 });
  b.fuse(cordSegs[0], relief, 40);
  const last = pts[pts.length - 1];
  const plugPart = plug
    ? boxR(b, "plug", "plastic", "plastic", [end[0] - 0.02, end[0] + 0.02], [end[1] - 0.06, end[1] - 0.02], [end[2] - 0.015, end[2] + 0.015], { tint: 0x1b1b1b, mass: 0.06 })
    : boxR(b, "plug", "plastic", "plastic", cx < 0 ? [last[0], last[0] + 0.04] : [last[0] - 0.04, last[0]], [0, 0.025], [last[2] - 0.015, last[2] + 0.015], { tint: 0x1b1b1b, mass: 0.06 });
  b.press(plugPart, cordSegs[cordSegs.length - 1], 30);
  if (plug) b.world(plugPart, "press", 15, end);
  b.sparks(plugPart, 0.4);
}

export type { Range };
