// Room-aligned micro-debris zones (PURE MODULE — no Babylon imports, unit-tested).
//
// Micro-debris instances are split into bins per zone so each bin mesh gets a bounding box the
// Lighting system can assign to ONE room (room-masked lights). A fixed metre grid straddles
// walls, so the default zoning follows the apartment's room rectangles (src/world/plan.ts):
// zone k < ROOMS.length is room k (bounds = its footprint), anything outside every room (balcony
// overhang, outside the windows) falls back to a 4 m grid offset by ROOM_ZONE_GRID_BASE.

import { ROOMS } from "../world/plan.ts";
import { defaultZoneOf, zoneBounds, MAX_ZONES } from "./microSim.ts";

export interface ZoneRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** First fallback grid zone (after the rooms). */
export const ROOM_ZONE_GRID_BASE = 16;

/** Zone of a point: the room containing it, else a grid cell. */
export function roomZoneOf(x: number, _y: number, z: number): number {
  for (let i = 0; i < ROOMS.length && i < ROOM_ZONE_GRID_BASE; i++) {
    const r = ROOMS[i];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return i;
  }
  const g = ROOM_ZONE_GRID_BASE + defaultZoneOf(x, 0, z);
  return g < MAX_ZONES ? g : 0;
}

/** Horizontal bounds of a room zone (the room footprint) or of a fallback grid cell. */
export function roomZoneBounds(zone: number): ZoneRect {
  if (zone >= 0 && zone < ROOMS.length && zone < ROOM_ZONE_GRID_BASE) {
    const r = ROOMS[zone];
    return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
  }
  return zoneBounds(Math.max(0, zone - ROOM_ZONE_GRID_BASE));
}
