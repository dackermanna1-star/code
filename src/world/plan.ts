// Floor plan of the apartment (pure data + queries). Coordinates: x east, z north, y up,
// metres. Interior floor surface at y = 0. See docs/ARCHITECTURE.md §10.

import type { MaterialId } from "../destruction/model/materials.ts";

export const CEILING_H = 2.7;
export const SLAB_T = 0.25; // concrete slab thickness; the finished floor surface is y = 0 (finish layers sit in y ∈ [-t, 0], slab below them)
export const CONCRETE_T = 0.2; // exterior/party wall thickness
export const PARTITION_T = 0.115; // 12.5 mm drywall + 90 mm stud + 12.5 mm drywall
export const STUD_SPACING = 0.4;
export const INTERIOR = { minX: 0, maxX: 12.8, minZ: 0, maxZ: 8.8 } as const;
export const FLOOR_LEVEL = 31; // storey (for the view)
export const STOREY_H = 3.0;

export type RoomId = "master" | "living" | "bed2" | "hallW" | "bath" | "utility" | "kitchen" | "foyer" | "balcony";

export interface Room {
  id: RoomId;
  name: string;
  /** Axis-aligned footprint (interior faces). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floor: "laminate" | "tile" | "carpet" | "concrete";
  floorMat: MaterialId;
  /** Wall paint tint 0xRRGGBB. */
  paint: number;
  /** Wall tiles height (m) for wet rooms (0 = none). */
  wallTiles: number;
  /** Acoustics. */
  rt60: number;
  brightness: number;
  wet: number;
  /** Ceiling light fixture positions (x, z) — a ceiling fan in the living room. */
  lights: Array<[number, number]>;
  outdoor?: boolean;
}

export const ROOMS: Room[] = [
  { id: "master", name: "Master Bedroom", x0: 0, x1: 4.0, z0: 0, z1: 4.4, floor: "laminate", floorMat: "hardwood", paint: 0xcfd9c8, wallTiles: 0, rt60: 0.35, brightness: 0.35, wet: 0.18, lights: [[2.0, 2.2]] },
  { id: "living", name: "Living Room", x0: 4.0, x1: 9.2, z0: 0, z1: 5.0, floor: "laminate", floorMat: "hardwood", paint: 0xeee7da, wallTiles: 0, rt60: 0.55, brightness: 0.5, wet: 0.22, lights: [[6.6, 2.4]] },
  { id: "bed2", name: "Bedroom 2", x0: 9.2, x1: 12.8, z0: 0, z1: 4.4, floor: "carpet", floorMat: "fabric", paint: 0xc9d8e6, wallTiles: 0, rt60: 0.3, brightness: 0.3, wet: 0.15, lights: [[11.0, 2.2]] },
  { id: "hallW", name: "Hallway", x0: 0, x1: 4.0, z0: 4.4, z1: 5.6, floor: "laminate", floorMat: "hardwood", paint: 0xe6e0d4, wallTiles: 0, rt60: 0.6, brightness: 0.55, wet: 0.25, lights: [[2.0, 5.0]] },
  { id: "bath", name: "Bathroom", x0: 0, x1: 2.5, z0: 5.6, z1: 8.8, floor: "tile", floorMat: "tile", paint: 0xf4f4f2, wallTiles: 1.25, rt60: 1.1, brightness: 0.85, wet: 0.45, lights: [[1.25, 7.2]] },
  { id: "utility", name: "Laundry", x0: 2.5, x1: 4.0, z0: 5.6, z1: 8.8, floor: "tile", floorMat: "tile", paint: 0xf1f1ee, wallTiles: 0, rt60: 0.7, brightness: 0.7, wet: 0.3, lights: [[3.25, 7.2]] },
  { id: "kitchen", name: "Kitchen", x0: 4.0, x1: 9.2, z0: 5.0, z1: 8.8, floor: "tile", floorMat: "tile", paint: 0xf3f1ea, wallTiles: 0, rt60: 0.65, brightness: 0.65, wet: 0.28, lights: [[5.4, 7.0], [7.8, 7.0]] },
  { id: "foyer", name: "Foyer", x0: 9.2, x1: 12.8, z0: 4.4, z1: 8.8, floor: "laminate", floorMat: "hardwood", paint: 0xe4ded2, wallTiles: 0, rt60: 0.6, brightness: 0.55, wet: 0.25, lights: [[11.0, 6.6]] },
  { id: "balcony", name: "Balcony", x0: 4.4, x1: 9.0, z0: -1.6, z1: -0.2, floor: "concrete", floorMat: "concrete", paint: 0xd8d4cc, wallTiles: 0, rt60: 0.1, brightness: 0.6, wet: 0.05, lights: [], outdoor: true },
];

export type WallKind = "exterior" | "party" | "partition" | "plumbing";

export type OpeningKind = "door" | "frontDoor" | "window" | "slidingDoor" | "opening";

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Distance along the wall from endpoint a (m). */
  from: number;
  to: number;
  sill: number;
  head: number;
  /** For doors: which room the door swings into, and hinge side ("a" = hinge at the end nearer endpoint a). */
  into?: RoomId;
  hinge?: "a" | "b";
}

export interface Wall {
  id: string;
  kind: WallKind;
  /** Centre-line endpoints [x, z]. Walls are axis-aligned. */
  a: [number, number];
  b: [number, number];
  thickness: number;
  openings: Opening[];
  insulated?: boolean;
}

const H = CONCRETE_T / 2;

export const WALLS: Wall[] = [
  // ---- concrete shell (centre lines just outside the interior faces)
  {
    id: "south",
    kind: "exterior",
    a: [-CONCRETE_T, -H],
    b: [12.8 + CONCRETE_T, -H],
    thickness: CONCRETE_T,
   
    openings: [
      { id: "win_master", kind: "window", from: 1.2, to: 3.2, sill: 0.9, head: 2.2 },
      { id: "slider_living", kind: "slidingDoor", from: 5.2, to: 7.6, sill: 0.0, head: 2.25 },
      { id: "win_living", kind: "window", from: 8.0, to: 9.0, sill: 0.9, head: 2.2 },
      { id: "win_bed2_s", kind: "window", from: 10.4, to: 12.0, sill: 0.9, head: 2.2 },
    ],
  },
  {
    id: "east",
    kind: "exterior",
    a: [12.8 + H, -CONCRETE_T],
    b: [12.8 + H, 8.8 + CONCRETE_T],
    thickness: CONCRETE_T,
   
    openings: [{ id: "win_bed2_e", kind: "window", from: 1.6, to: 3.2, sill: 0.9, head: 2.2 }],
  },
  {
    id: "north",
    kind: "party",
    a: [-CONCRETE_T, 8.8 + H],
    b: [12.8 + CONCRETE_T, 8.8 + H],
    thickness: CONCRETE_T,
   
    openings: [{ id: "front_door", kind: "frontDoor", from: 10.6, to: 11.6, sill: 0, head: 2.1, into: "foyer", hinge: "b" }],
  },
  { id: "west", kind: "party", a: [-H, -CONCRETE_T], b: [-H, 8.8 + CONCRETE_T], thickness: CONCRETE_T, openings: [] },

  // ---- partitions (drywall on wood studs)
  { id: "p_master_living", kind: "partition", a: [4.0, 0], b: [4.0, 4.4], thickness: PARTITION_T, openings: [], insulated: true },
  { id: "p_master_hall", kind: "partition", a: [0, 4.4], b: [4.0, 4.4], thickness: PARTITION_T, insulated: true, openings: [{ id: "door_master", kind: "door", from: 2.8, to: 3.7, sill: 0, head: 2.04, into: "master", hinge: "b" }] },
  {
    id: "p_hall_bath",
    kind: "partition",
    a: [0, 5.6],
    b: [4.0, 5.6],
    thickness: PARTITION_T,
   
    openings: [
      { id: "door_bath", kind: "door", from: 1.4, to: 2.2, sill: 0, head: 2.04, into: "bath", hinge: "a" },
      { id: "door_utility", kind: "door", from: 2.85, to: 3.65, sill: 0, head: 2.04, into: "utility", hinge: "b" },
    ],
  },
  { id: "p_bath_utility", kind: "plumbing", a: [2.5, 5.6], b: [2.5, 8.8], thickness: PARTITION_T, openings: [] },
  { id: "p_utility_kitchen", kind: "plumbing", a: [4.0, 5.6], b: [4.0, 8.8], thickness: PARTITION_T, openings: [] },
  { id: "p_living_bed2", kind: "partition", a: [9.2, 0], b: [9.2, 4.4], thickness: PARTITION_T, insulated: true, openings: [] },
  { id: "p_kitchen_foyer", kind: "partition", a: [9.2, 4.4], b: [9.2, 8.8], thickness: PARTITION_T, openings: [{ id: "arch_foyer", kind: "opening", from: 0.2, to: 1.4, sill: 0, head: 2.1 }] },
  { id: "p_bed2_foyer", kind: "partition", a: [9.2, 4.4], b: [12.8, 4.4], thickness: PARTITION_T, insulated: true, openings: [{ id: "door_bed2", kind: "door", from: 0.4, to: 1.3, sill: 0, head: 2.04, into: "bed2", hinge: "a" }] },
];

/** Balcony slab and railing (outside the south wall, in front of the living room). */
export const BALCONY = { x0: 4.4, x1: 9.0, z0: -1.6, z1: -0.2, railH: 1.05 } as const;

/** Player spawn: living room, looking towards the kitchen/TV wall. */
export const SPAWN = { pos: { x: 7.4, y: 1.65, z: 2.2 }, yaw: -Math.PI * 0.62, pitch: 0.05 } as const;

export function roomAt(x: number, z: number): Room | null {
  for (const r of ROOMS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

export function roomById(id: RoomId): Room {
  const r = ROOMS.find((q) => q.id === id);
  if (!r) throw new Error(`unknown room ${id}`);
  return r;
}

/** Length of a wall's centre line. */
export function wallLength(w: Wall): number {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

/** Unit normal of an axis-aligned wall pointing to its +x (walls along z) or +z (walls along x) side. */
export function wallNormal(w: Wall): [number, number] {
  return Math.abs(w.b[0] - w.a[0]) < 1e-6 ? [1, 0] : [0, 1];
}

/** Room on the given side (+1 = +normal side, -1 = -normal side) of a wall at distance s along it. */
export function sideRoom(w: Wall, s: number, sign: 1 | -1): Room | null {
  const [x, z] = wallPoint(w, s);
  const [nx, nz] = wallNormal(w);
  const off = w.thickness / 2 + 0.05;
  return roomAt(x + nx * off * sign, z + nz * off * sign);
}

/** Point along a wall's centre line at distance s from a. */
export function wallPoint(w: Wall, s: number): [number, number] {
  const L = wallLength(w);
  const t = L > 0 ? s / L : 0;
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
}
