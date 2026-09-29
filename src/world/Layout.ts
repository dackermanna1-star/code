import * as THREE from 'three';

// World layout (meters). +z points out the front door toward the street,
// the kitchen sits at -z behind the service counter.
export const ROOM = {
  minX: -7,
  maxX: 7,
  minZ: -6.3,
  maxZ: 6.0,
  height: 3.3,
  wall: 0.25,
};

export const COUNTER = {
  z: -1.2,
  depth: 0.7,
  height: 1.05,
  minX: -6.0,
  maxX: 3.4,
  gapMinX: 3.4,
  gapMaxX: 4.3,
};

export const BACKLINE = {
  z: -5.75,
  depth: 0.8,
  height: 0.92,
  front: -5.35,
};

export const GRILL = {
  center: new THREE.Vector3(-3.0, 0.94, -5.72),
  width: 1.5,
  depth: 0.64,
};

export const WARMER = {
  center: new THREE.Vector3(-1.72, 0.97, -5.62),
  width: 0.62,
  depth: 0.46,
};

export const BUILD = {
  center: new THREE.Vector3(-0.28, 0.935, -5.5),
  plate: new THREE.Vector3(-0.28, 0.935, -5.48),
};

export const PICKUP = {
  tray: new THREE.Vector3(2.2, COUNTER.height + 0.01, -1.08),
  bell: new THREE.Vector3(2.75, COUNTER.height, -1.25),
};

export const REGISTER = new THREE.Vector3(-1.6, COUNTER.height, -1.28);

export const DOOR = {
  x: 1.2,
  z: ROOM.maxZ,
  width: 1.8,
  height: 2.35,
};

// ---- Customer navigation ----------------------------------------------------
const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

export const SPOTS = {
  spawnLeft: v(-14, 7.6),
  spawnRight: v(14, 7.6),
  outsideDoor: v(DOOR.x, 7.3),
  insideDoor: v(DOOR.x, 5.0),
  lobbyHub: v(0.4, 2.6),
  order: v(-1.0, -0.38),
  pickup: v(2.2, -0.38),
  queue: [v(-1.0, 0.55), v(-0.75, 1.45), v(-0.4, 2.3), v(0.0, 3.1), v(0.4, 3.9)],
  waiting: [
    { pos: v(-6.5, 0.85), face: Math.PI / 2, sit: true },
    { pos: v(-6.5, 1.8), face: Math.PI / 2, sit: true },
    { pos: v(-6.5, 2.75), face: Math.PI / 2, sit: true },
    { pos: v(-6.5, 3.7), face: Math.PI / 2, sit: true },
    { pos: v(-4.3, 0.55), face: Math.PI * 0.85, sit: false },
    { pos: v(-3.4, 0.4), face: Math.PI * 0.95, sit: false },
    { pos: v(0.9, 0.7), face: Math.PI, sit: false },
    { pos: v(-2.2, 0.35), face: Math.PI, sit: false },
  ],
};

export interface Seat {
  pos: THREE.Vector3; // where the character's root stands when seated
  face: number; // yaw
  table: THREE.Vector3; // table top center (for placing food)
  approach: THREE.Vector3; // where to walk before sitting
  occupied: boolean;
}

export const TABLE_TOP_Y = 0.76;

/** Build seat list from table definitions; filled by the dining builder. */
export const SEATS: Seat[] = [];
