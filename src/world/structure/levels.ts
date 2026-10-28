// Reference levels, finish dimensions and service points of the apartment STRUCTURE.
// PURE data (imports only plan.ts) so furnishing agents can depend on it cheaply.
//
// Coordinates: x east, z north, y up, metres (see src/world/plan.ts).
//
//  * FINISHED FLOOR: y = FLOOR_Y = 0 in every indoor room. All floor build-ups are 20 mm thick
//    and sit on the structural slab whose top is SLAB_TOP_Y = -0.02:
//      laminate : 12 mm oak planks on an 8 mm acoustic foam underlay
//      tile     : 10 mm porcelain tiles on a 10 mm mortar bed (grout shows in the 3 mm joints)
//      carpet   : 10 mm carpet on a 10 mm foam pad (bedroom 2)
//    The balcony slab top is BALCONY_FLOOR_Y = -0.02 (a small step down from the living room).
//  * FINISHED CEILING: y = CEILING_Y = 2.7 (underside of 12.5 mm gypsum boards), furring
//    channels above, the concrete slab of the storey above from CEILING_SLAB_Y = 2.75 to 3.0.
//  * WALL FACES: partitions' finished faces are at centre line ± PARTITION_FACE (0.0575).
//    Concrete walls keep their finished interior faces exactly ON the plan boundary (x = 0,
//    x = 12.8, z = 0, z = 8.8): a 12.5 mm gypsum finish layer sits INSIDE the concrete envelope.
//    Use roomFaces(id) for the clear rectangle between finished wall faces.
//  * THINGS PROUD OF THE WALL FACE (keep furniture clear of them, ≥ 1.5 cm from finished faces
//    is enough everywhere except where wall tiles are: there measure from the tile face):
//      baseboards  BASEBOARD_T (12 mm) × BASEBOARD_H (90 mm) along most walls (not in the bathroom,
//                  not along the kitchen's north wall / behind the west cabinet run / fridge corner)
//      wall tiles  WALL_TILE_T (10 mm = 7 mm glazed tile + 3 mm adhesive) in WALL_TILE_ZONES
//      door casings CASING_T (15 mm) × CASING_W (70 mm) around every door / cased opening
//      switch/outlet plates 8 mm (+ 6 mm rocker) at SWITCH_Y / OUTLET_Y
//      plumbing valves/flanges up to ~60 mm at SERVICE_POINTS
//      window boards (marble) WINDOW_BOARD_NOSING (30 mm) proud at WINDOW_BOARD_TOP_Y

import { CEILING_H, CONCRETE_T, INTERIOR, PARTITION_T, ROOMS, SLAB_T, STOREY_H, WALLS, type RoomId } from "../plan.ts";

// ------------------------------------------------------------------ vertical levels
export const FLOOR_Y = 0;
export const CEILING_Y = CEILING_H; // 2.7
/** Total thickness of every indoor floor build-up (finish + underlay/bed). */
export const FINISH_DEPTH = 0.02;
/** Top of the structural floor slab (under all floor finishes). */
export const SLAB_TOP_Y = FLOOR_Y - FINISH_DEPTH; // -0.02
export const SLAB_BOTTOM_Y = -SLAB_T; // -0.25
/** Underside of the concrete slab above (ceiling slab y ∈ [CEILING_SLAB_Y, STRUCTURE_TOP_Y]). */
export const CEILING_SLAB_Y = STOREY_H - SLAB_T; // 2.75
export const STRUCTURE_TOP_Y = STOREY_H; // 3.0
export const BALCONY_FLOOR_Y = -0.02;
export const BALCONY_SLAB_T = 0.18;
/** Balcony railing: top of the handrail above the balcony floor. */
export const BALCONY_RAIL_H = 1.05;

// ------------------------------------------------------------------ floor build-ups
export const LAMINATE_T = 0.012;
export const UNDERLAY_T = FINISH_DEPTH - LAMINATE_T; // 0.008
export const FLOOR_TILE_T = 0.01;
export const TILE_BED_T = FINISH_DEPTH - FLOOR_TILE_T; // 0.010
export const CARPET_T = 0.01;
export const CARPET_PAD_T = FINISH_DEPTH - CARPET_T; // 0.010
export const PLANK_LEN = 1.2;
export const PLANK_W = 0.19;
export const FLOOR_TILE = 0.3;
export const FLOOR_JOINT = 0.003;

// ------------------------------------------------------------------ ceiling build-up
export const CEILING_BOARD_T = 0.0125;
export const FURRING_H = 0.022;
export const FURRING_W = 0.035;
export const FURRING_SPACING = 0.4;

// ------------------------------------------------------------------ walls
/** Gypsum finish layer on concrete walls (inside the concrete envelope). */
export const WALL_FINISH_T = 0.0125;
export const DRYWALL_T = 0.0125;
export const STUD_W = 0.038;
export const STUD_D = 0.089;
/** Height of the framing top/bottom plates (38 mm lumber laid flat). */
export const FRAME_PLATE_H = 0.038;
/** Distance of a partition's finished face from its centre line. */
export const PARTITION_FACE = PARTITION_T / 2; // 0.0575
export const CONCRETE_HALF = CONCRETE_T / 2;
/** Wall tile (7 mm) + adhesive bed (3 mm) proud of the finished wall face. */
export const WALL_TILE_T = 0.01;
export const WALL_TILE_BED_T = 0.003;
export const WALL_TILE = 0.15;
export const WALL_JOINT = 0.002;
export const BASEBOARD_H = 0.09;
export const BASEBOARD_T = 0.012;
export const CASING_W = 0.07;
export const CASING_T = 0.015;
export const SWITCH_Y = 1.1;
export const OUTLET_Y = 0.3;
/** Switch/outlet cover plate size (width × height) and thickness. */
export const ELEC_PLATE_W = 0.07;
export const ELEC_PLATE_H = 0.115;
export const ELEC_PLATE_T = 0.008;

// ------------------------------------------------------------------ openings
/** Door frames: jamb thickness and shim gap inside the rough opening (interior doors). */
export const JAMB_T = 0.019;
export const SHIM = 0.005;
/** Casing inner edge sits this far back from the jamb's inner face (reveal). */
export const CASING_REVEAL = 0.005;
/** Interior door slab thickness, front door slab thickness. */
export const DOOR_T = 0.035;
export const FRONT_DOOR_T = 0.044;
export const FRONT_JAMB_T = 0.035;
/** Door handle height above the finished floor. */
export const HANDLE_Y = 1.0;
/** Windows: frame depth/face, position of the frame's interior face from the room face. */
export const WINDOW_FRAME_DEPTH = 0.07;
export const WINDOW_FRAME_FACE = 0.05;
export const WINDOW_REVEAL = 0.045;
/** Marble window board: top surface height (sill 0.9 + 20 mm board) and nosing past the face. */
export const WINDOW_BOARD_T = 0.02;
export const WINDOW_BOARD_NOSING = 0.03;

export interface Rect2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Clear rectangle of a room between finished wall faces (ignores baseboards/tiles/casings).
 * Sides bounded by a partition are moved in by PARTITION_FACE; concrete-bounded and open sides
 * keep the plan boundary. Outdoor balcony: its plan rectangle.
 */
export function roomFaces(id: RoomId): Rect2 {
  const r = ROOMS.find((q) => q.id === id);
  if (!r) throw new Error(`unknown room ${id}`);
  const out: Rect2 = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
  if (r.outdoor) return out;
  const EPS = 1e-6;
  for (const w of WALLS) {
    if (w.kind !== "partition" && w.kind !== "plumbing") continue;
    const alongX = Math.abs(w.b[1] - w.a[1]) < EPS;
    const half = w.thickness / 2;
    if (alongX) {
      const z = w.a[1];
      const lo = Math.min(w.a[0], w.b[0]),
        hi = Math.max(w.a[0], w.b[0]);
      if (hi <= r.x0 + EPS || lo >= r.x1 - EPS) continue;
      if (Math.abs(z - r.z0) < EPS) out.z0 = Math.max(out.z0, z + half);
      if (Math.abs(z - r.z1) < EPS) out.z1 = Math.min(out.z1, z - half);
    } else {
      const x = w.a[0];
      const lo = Math.min(w.a[1], w.b[1]),
        hi = Math.max(w.a[1], w.b[1]);
      if (hi <= r.z0 + EPS || lo >= r.z1 - EPS) continue;
      if (Math.abs(x - r.x0) < EPS) out.x0 = Math.max(out.x0, x + half);
      if (Math.abs(x - r.x1) < EPS) out.x1 = Math.min(out.x1, x - half);
    }
  }
  return out;
}

/** Which wall of a room a zone is on: n = the wall at the room's north side (z1), etc. */
export type RoomSide = "n" | "s" | "e" | "w";

/**
 * Wall-tile zones (glazed 150 mm tiles proud of the wall face by WALL_TILE_T). `from`/`to` run
 * along the wall (x for n/s walls, z for e/w walls), y0/y1 are heights above the finished floor.
 * East/west zones are inset by WALL_TILE_T at corners where the north/south walls are tiled.
 * The bathroom door opening + casings are cut out of the bathroom's south zone by the builder.
 */
export interface WallTileZone {
  room: RoomId;
  side: RoomSide;
  from: number;
  to: number;
  y0: number;
  y1: number;
  /** Glaze tint. */
  tint: number;
}

const BATH = roomFaces("bath");
const KITCHEN = roomFaces("kitchen");
const BATH_WAINSCOT = ROOMS.find((r) => r.id === "bath")!.wallTiles; // 1.25
/** Tub zone (full-height tiles): along the north wall x 0..1.7 and the west wall z 8.05..8.8. */
export const TUB_ZONE = { x0: 0, x1: 1.7, z0: 8.05, z1: 8.8 } as const;

export const WALL_TILE_ZONES: readonly WallTileZone[] = [
  // bathroom wainscot on all four walls
  { room: "bath", side: "n", from: BATH.x0, to: BATH.x1, y0: FLOOR_Y, y1: BATH_WAINSCOT, tint: 0xffffff },
  { room: "bath", side: "s", from: BATH.x0, to: BATH.x1, y0: FLOOR_Y, y1: BATH_WAINSCOT, tint: 0xffffff },
  { room: "bath", side: "w", from: BATH.z0 + WALL_TILE_T, to: BATH.z1 - WALL_TILE_T, y0: FLOOR_Y, y1: BATH_WAINSCOT, tint: 0xffffff },
  { room: "bath", side: "e", from: BATH.z0 + WALL_TILE_T, to: BATH.z1 - WALL_TILE_T, y0: FLOOR_Y, y1: BATH_WAINSCOT, tint: 0xffffff },
  // full height around the tub (shower)
  { room: "bath", side: "n", from: TUB_ZONE.x0, to: TUB_ZONE.x1, y0: BATH_WAINSCOT, y1: CEILING_Y, tint: 0xffffff },
  { room: "bath", side: "w", from: TUB_ZONE.z0, to: BATH.z1 - WALL_TILE_T, y0: BATH_WAINSCOT, y1: CEILING_Y, tint: 0xffffff },
  // kitchen backsplash on the north wall between the counter top (0.91) and the wall cabinets
  // (bottom 1.45), stopping before the fridge corner (x ≥ 8.3)
  { room: "kitchen", side: "n", from: KITCHEN.x0, to: 8.28, y0: 0.915, y1: 1.44, tint: 0xe9efeb },
];

/** Wall stretches without baseboards (cabinets/fridge stand there, or tiles). */
export const NO_BASEBOARD: ReadonlyArray<{ room: RoomId; side: RoomSide | "*"; from: number; to: number }> = [
  { room: "bath", side: "*", from: -Infinity, to: Infinity },
  { room: "kitchen", side: "n", from: -Infinity, to: Infinity },
  { room: "kitchen", side: "w", from: 6.35, to: Infinity },
  { room: "kitchen", side: "e", from: 7.85, to: Infinity },
];

/**
 * Plumbing stub-outs built into the plumbing partitions (copper supply pipes with angle-stop
 * valves on the finished face — on the tile face where tiled — and a PVC drain with a flange).
 * `x`/`z`: the wall face plane and the point along the wall; valves at `along ± 0.1`
 * (cold at the smaller coordinate, hot at the larger), drain at `along`.
 * Content agents connect their fixtures (vanity, washer, water heater, kitchen sink) here.
 */
export interface ServicePoint {
  id: "vanity" | "washer" | "waterHeater" | "kitchenSink";
  wall: string;
  room: RoomId;
  /** Coordinate of the finished wall face (x for walls along z). */
  face: number;
  /** Position along the wall (z for walls along z). */
  along: number;
  valveY: number;
  /** Drain stub height (null = no drain). */
  drainY: number | null;
}

// Positions sit at stud-bay centres of the partition framing (studs @ 400 mm from the run start).
export const SERVICE_POINTS: readonly ServicePoint[] = [
  { id: "vanity", wall: "p_bath_utility", room: "bath", face: 2.5 - PARTITION_FACE - WALL_TILE_T, along: 6.2765, valveY: 0.55, drainY: 0.45 },
  { id: "waterHeater", wall: "p_bath_utility", room: "utility", face: 2.5 + PARTITION_FACE, along: 7.0765, valveY: 1.55, drainY: null },
  { id: "washer", wall: "p_bath_utility", room: "utility", face: 2.5 + PARTITION_FACE, along: 8.635, valveY: 1.1, drainY: 0.95 },
  { id: "kitchenSink", wall: "p_utility_kitchen", room: "kitchen", face: 4.0 + PARTITION_FACE, along: 8.58375, valveY: 0.5, drainY: 0.42 },
];

/** Interior bounds incl. the concrete finish recess (slab extent). */
export const SHELL_INNER = {
  x0: INTERIOR.minX - WALL_FINISH_T,
  x1: INTERIOR.maxX + WALL_FINISH_T,
  z0: INTERIOR.minZ - WALL_FINISH_T,
  z1: INTERIOR.maxZ + WALL_FINISH_T,
} as const;
