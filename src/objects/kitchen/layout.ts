// World-space layout of the kitchen (x east, z north, y up; plan.ts coordinates). Shared by the
// built-in run builders (which convert these numbers into their local frames) and by the
// furnisher, so cabinets, appliance bays, the sink, the plumbing and every counter-top item agree
// on one set of measurements. PURE data.
//
// Room clear faces: x 4.0575 (plumbing partition face) .. 9.1425 (foyer partition face),
// z 5.0 (open to the living room) .. 8.8 (concrete party wall). Everything keeps >= 15 mm from
// finished wall faces. Base carcasses stand 60 mm off the walls (a service void for the sink
// supply/drain lines, as in European kitchens); worktops run to 15 mm from the wall.

import { roomFaces, SERVICE_POINTS } from "../../world/structure/levels.ts";
import type { Xform } from "../../geom/vec.ts";
import { yawXf } from "./lib.ts";

export const KF = roomFaces("kitchen");
export const WALL_GAP = 0.015;

// ------------------------------------------------------------------ casework standards
export const COUNTER_Y = 0.91; // finished worktop height
export const COUNTER_T = 0.03; // stone thickness
export const CARCASS_H = COUNTER_Y - COUNTER_T; // 0.88
export const CARCASS_D = 0.55; // incl. 3 mm back panel
export const FRONT_T = 0.018;
export const TOE_H = 0.1;
export const TOE_SET = 0.05;
export const SERVICE_VOID = 0.06;
export const WALL_CAB = { bottom: 1.45, h: 0.75, d: 0.33 } as const;

// ------------------------------------------------------------------ north run (faces south)
const NZ_WALL = KF.z1; // 8.8
export const NORTH = {
  carcassBackZ: NZ_WALL - SERVICE_VOID, // 8.74
  carcassFrontZ: NZ_WALL - SERVICE_VOID - CARCASS_D, // 8.19
  doorFrontZ: NZ_WALL - SERVICE_VOID - CARCASS_D - FRONT_T, // 8.172
  topBackZ: NZ_WALL - WALL_GAP, // 8.785
  topFrontZ: 8.145,
  topX0: KF.x0 + 0.02, // 4.0775
  /** Base units (carcass extents in world x). */
  n1: [4.72, 5.2] as const,
  dishwasherBay: [5.2, 5.8] as const,
  sinkBase: [5.8, 6.6] as const,
  n3: [6.6, 7.0] as const,
  rangeBay: [7.0, 7.762] as const,
  n4: [7.762, 8.265] as const,
  fridgeBay: [8.285, KF.x1 - 0.0175] as const, // 8.285 .. 9.125
  /** Under-mount sink cut-out and faucet hole. */
  cutout: { x0: 5.85, x1: 6.55, z0: 8.23, z1: 8.67 },
  tapHole: { x0: 6.18, x1: 6.22, z0: 8.7, z1: 8.74 },
  faucet: { x: 6.2, z: 8.72 },
} as const;

/** Stone pieces of the north worktop [x0, x1, z0, z1] (convex pieces around the cut-outs). */
export const NORTH_TOP: Record<string, [number, number, number, number]> = {
  top_w: [NORTH.topX0, NORTH.cutout.x0, NORTH.topFrontZ, NORTH.topBackZ],
  top_sink_f: [NORTH.cutout.x0, NORTH.cutout.x1, NORTH.topFrontZ, NORTH.cutout.z0],
  top_sink_bl: [NORTH.cutout.x0, NORTH.tapHole.x0, NORTH.cutout.z1, NORTH.topBackZ],
  top_sink_br: [NORTH.tapHole.x1, NORTH.cutout.x1, NORTH.cutout.z1, NORTH.topBackZ],
  top_tap_f: [NORTH.tapHole.x0, NORTH.tapHole.x1, NORTH.cutout.z1, NORTH.tapHole.z0],
  top_tap_b: [NORTH.tapHole.x0, NORTH.tapHole.x1, NORTH.tapHole.z1, NORTH.topBackZ],
  top_e: [NORTH.cutout.x1, NORTH.rangeBay[0] - 0.002, NORTH.topFrontZ, NORTH.topBackZ],
  top_r: [NORTH.n4[0] + 0.002, NORTH.n4[1], NORTH.topFrontZ, NORTH.topBackZ],
};

/** Placement frame of the north run assembly (origin at the worktop footprint centre). */
export const NORTH_XF: Xform = yawXf((NORTH.topX0 + NORTH.n4[1]) / 2, 0, (NORTH.topFrontZ + NORTH.topBackZ) / 2, Math.PI);

const SINK_SP = SERVICE_POINTS.find((s) => s.id === "kitchenSink")!;
/** Stub-out on the plumbing wall (built by the structure): valve bodies and drain stub. */
export const SINK_SERVICE = {
  face: SINK_SP.face, // 4.0575
  coldZ: SINK_SP.along - 0.1,
  hotZ: SINK_SP.along + 0.1,
  drainZ: SINK_SP.along,
  valveY: SINK_SP.valveY,
  drainY: SINK_SP.drainY ?? 0.42,
  /** Valve body runs 5..45 mm off the face (r 11 mm); drain stub-out ends 58 mm off the face. */
  valveTopY: SINK_SP.valveY + 0.011,
  drainEndX: SINK_SP.face + 0.058,
} as const;

// ------------------------------------------------------------------ west run (faces east)
const WX_WALL = KF.x0; // 4.0575
export const WEST = {
  carcassBackX: WX_WALL + SERVICE_VOID, // 4.1175
  carcassFrontX: WX_WALL + SERVICE_VOID + CARCASS_D, // 4.6675
  doorFrontX: WX_WALL + SERVICE_VOID + CARCASS_D + FRONT_T, // 4.6855
  topBackX: WX_WALL + 0.02, // 4.0775
  topFrontX: WX_WALL + 0.02 + 0.64, // 4.7175
  topZ0: 6.375,
  topZ1: NORTH.topFrontZ - 0.003, // 8.142
  endPanelZ: [6.382, 6.4] as const,
  w1: [6.4, 7.0] as const,
  w2: [7.0, 7.6] as const,
  w3: [7.6, 8.187] as const,
} as const;

export const WEST_XF: Xform = yawXf((WEST.topBackX + WEST.topFrontX) / 2, 0, (WEST.topZ0 + WEST.topZ1) / 2, Math.PI / 2);

// ------------------------------------------------------------------ island (doors face north)
export const ISLAND = {
  top: { x0: 5.68, x1: 7.92, z0: 6.1, z1: 7.02 },
  carcassBackZ: 6.42,
  carcassFrontZ: 6.97,
  backPanelZ: [6.402, 6.42] as const,
  units: [
    [5.7, 6.3],
    [6.3, 7.3],
    [7.3, 7.9],
  ] as const,
} as const;

export const ISLAND_XF: Xform = yawXf((ISLAND.units[0][0] + ISLAND.units[2][1]) / 2, 0, (ISLAND.top.z0 + ISLAND.top.z1) / 2, 0);

// ------------------------------------------------------------------ wall cabinets (face south)
/** Upper cabinets [x0, x1, doors]. The range hood sits between U4 and U5. */
export const UPPERS: Array<{ id: string; x0: number; x1: number; doors: 1 | 2; hinge?: "left" | "right" }> = [
  { id: "u1", x0: 4.0775, x1: 4.6775, doors: 1, hinge: "right" },
  { id: "u2", x0: 4.6775, x1: 5.4775, doors: 2 },
  { id: "u3", x0: 5.4775, x1: 6.2775, doors: 2 },
  { id: "u4", x0: 6.2775, x1: 6.9975, doors: 2 },
  { id: "u5", x0: 7.7625, x1: 8.2625, doors: 1, hinge: "left" },
];
export const UPPER_BACK_Z = KF.z1 - WALL_GAP; // 8.785

// ------------------------------------------------------------------ appliances
export const RANGE = { x: (NORTH.rangeBay[0] + NORTH.rangeBay[1]) / 2, backZ: KF.z1 - 0.025 } as const;
export const DISHWASHER = { x: (NORTH.dishwasherBay[0] + NORTH.dishwasherBay[1]) / 2, frontZ: NORTH.doorFrontZ } as const;
export const FRIDGE = { x: (NORTH.fridgeBay[0] + NORTH.fridgeBay[1]) / 2, backZ: KF.z1 - 0.05 } as const;
export const HOOD = { x: RANGE.x, bottomY: 1.56, backZ: KF.z1 - WALL_GAP } as const;
