// Electrical points built into the walls (switches next to doors at SWITCH_Y, outlets at
// OUTLET_Y), with cables up the studs in partitions. Plumbing stub-outs are in levels.ts
// (SERVICE_POINTS) because furnishing agents connect fixtures to them. PURE data.

import type { RoomId } from "../plan.ts";
import { OUTLET_Y, SWITCH_Y } from "./levels.ts";

export interface ElecPoint {
  id: string;
  kind: "switch" | "outlet";
  /** Plan wall id the point is built into. */
  wall: string;
  /** Room whose wall face carries the plate. */
  room: RoomId;
  /** Switches: room whose lights it controls (part tag `switch:<controls>`). */
  controls?: RoomId;
  /** Requested position along the wall (world x for walls along x, z for walls along z). */
  at?: number;
  /** Or: beside a door/arch (latch side or hinge side), on `room`'s face. */
  beside?: { opening: string; side: "latch" | "hinge" };
  y: number;
}

export const ELECTRICAL: readonly ElecPoint[] = [
  // ---- switches (latch side of each door, inside the room; the bathroom's is outside in the hall)
  { id: "sw_master", kind: "switch", wall: "p_master_hall", room: "master", controls: "master", beside: { opening: "door_master", side: "latch" }, y: SWITCH_Y },
  { id: "sw_hall", kind: "switch", wall: "p_master_hall", room: "hallW", controls: "hallW", beside: { opening: "door_master", side: "hinge" }, y: SWITCH_Y },
  { id: "sw_bath", kind: "switch", wall: "p_hall_bath", room: "hallW", controls: "bath", beside: { opening: "door_bath", side: "latch" }, y: SWITCH_Y },
  { id: "sw_utility", kind: "switch", wall: "p_hall_bath", room: "utility", controls: "utility", beside: { opening: "door_utility", side: "latch" }, y: SWITCH_Y },
  { id: "sw_bed2", kind: "switch", wall: "p_bed2_foyer", room: "bed2", controls: "bed2", beside: { opening: "door_bed2", side: "latch" }, y: SWITCH_Y },
  { id: "sw_living", kind: "switch", wall: "p_master_living", room: "living", controls: "living", at: 4.38, y: SWITCH_Y },
  { id: "sw_kitchen", kind: "switch", wall: "p_kitchen_foyer", room: "kitchen", controls: "kitchen", at: 5.93, y: SWITCH_Y },
  { id: "sw_foyer", kind: "switch", wall: "north", room: "foyer", controls: "foyer", at: 10.25, y: SWITCH_Y },
  // ---- outlets
  { id: "o_master_bed_l", kind: "outlet", wall: "west", room: "master", at: 1.05, y: OUTLET_Y },
  { id: "o_master_bed_r", kind: "outlet", wall: "west", room: "master", at: 3.35, y: OUTLET_Y },
  { id: "o_master_dresser", kind: "outlet", wall: "p_master_living", room: "master", at: 2.2, y: OUTLET_Y },
  { id: "o_living_tv_l", kind: "outlet", wall: "p_master_living", room: "living", at: 1.6, y: OUTLET_Y },
  { id: "o_living_tv_r", kind: "outlet", wall: "p_master_living", room: "living", at: 3.2, y: OUTLET_Y },
  { id: "o_living_east_s", kind: "outlet", wall: "p_living_bed2", room: "living", at: 1.2, y: OUTLET_Y },
  { id: "o_living_east_n", kind: "outlet", wall: "p_living_bed2", room: "living", at: 3.8, y: OUTLET_Y },
  { id: "o_living_south", kind: "outlet", wall: "south", room: "living", at: 4.6, y: OUTLET_Y },
  { id: "o_bed2_west", kind: "outlet", wall: "p_living_bed2", room: "bed2", at: 2.2, y: OUTLET_Y },
  { id: "o_bed2_desk", kind: "outlet", wall: "east", room: "bed2", at: 3.35, y: OUTLET_Y },
  { id: "o_bed2_north", kind: "outlet", wall: "p_bed2_foyer", room: "bed2", at: 12.0, y: OUTLET_Y },
  { id: "o_hall", kind: "outlet", wall: "p_hall_bath", room: "hallW", at: 0.8, y: OUTLET_Y },
  { id: "o_utility_dryer", kind: "outlet", wall: "p_utility_kitchen", room: "utility", at: 8.2, y: 1.05 },
  { id: "o_kitchen_counter_1", kind: "outlet", wall: "p_utility_kitchen", room: "kitchen", at: 6.8, y: 1.1 },
  { id: "o_kitchen_counter_2", kind: "outlet", wall: "p_utility_kitchen", room: "kitchen", at: 7.3, y: 1.1 },
  { id: "o_kitchen_fridge", kind: "outlet", wall: "north", room: "kitchen", at: 8.75, y: OUTLET_Y },
  { id: "o_kitchen_range", kind: "outlet", wall: "north", room: "kitchen", at: 7.38, y: 0.13 },
  { id: "o_foyer_north", kind: "outlet", wall: "p_bed2_foyer", room: "foyer", at: 11.6, y: OUTLET_Y },
  { id: "o_foyer_west", kind: "outlet", wall: "p_kitchen_foyer", room: "foyer", at: 7.2, y: OUTLET_Y },
  { id: "o_bath_mirror", kind: "outlet", wall: "p_bath_utility", room: "bath", at: 7.32, y: 1.4 },
];

/** Electrical box size (u × y × depth) for boxes in stud walls. */
export const BOX_W = 0.054;
export const BOX_H = 0.085;
export const BOX_D = 0.05;
/** Cable cross-section (u × w) and linear mass (kg/m). */
export const CABLE_W = 0.008;
export const CABLE_T = 0.006;
export const CABLE_KG_PER_M = 0.12;
