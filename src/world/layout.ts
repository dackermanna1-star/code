// Kitchen layout: one wide "dollhouse" diorama seen from the front (camera looks towards -Z).
// All values in metres. Floor at y = 0. Back wall plane at z = BACK_WALL_Z.
//
//  x:  -3.3 ........ -1.4 | -1.25 ................................................ 2.55 | 2.6 ..... 3.35
//      dining nook (Mochi) |  board  tools  bowl | stove (pan grill / pot kettle) | blender toaster fryer | fridge+freezer
//                          |                     |  oven under the stove           |  microwave on a shelf |

import * as THREE from 'three';

export const BACK_WALL_Z = -1.0;
export const LEFT_WALL_X = -3.4;
export const RIGHT_WALL_X = 3.45;
export const CEILING_Y = 2.75;

/** Counter run along the back wall. */
export const COUNTER = {
  x0: -1.25,
  x1: 2.55,
  zBack: -1.0,
  zFront: -0.38,
  /** Top surface height of the worktop. */
  topY: 0.92,
  thickness: 0.05,
};

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Where each station / prop sits (world space, ground contact point unless noted). */
export const LAYOUT = {
  // prep
  board: { pos: v3(-0.84, COUNTER.topY, -0.66), size: [0.5, 0.34] as [number, number] },
  toolCaddy: { pos: v3(-0.43, COUNTER.topY, -0.74) },
  bowl: { pos: v3(-0.12, COUNTER.topY, -0.68) },
  // stove: a free-standing range whose cooktop is flush with the counter
  stove: { pos: v3(0.55, 0, -0.69), width: 0.8, depth: 0.62 },
  pan: { burner: 0 }, // front-left burner
  grill: { burner: 1 }, // front-right burner
  pot: { burner: 2 }, // back-left burner
  kettle: { burner: 3 }, // back-right burner (decor)
  /** Burner centres in world space (cooktop level). */
  burners: [v3(0.35, COUNTER.topY, -0.53), v3(0.76, COUNTER.topY, -0.53), v3(0.35, COUNTER.topY, -0.84), v3(0.76, COUNTER.topY, -0.84)],
  blender: { pos: v3(1.17, COUNTER.topY, -0.76) },
  toaster: { pos: v3(1.53, COUNTER.topY, -0.74) },
  fryer: { pos: v3(1.98, COUNTER.topY, -0.7) },
  /** Free counter space for parking food. */
  parking: { pos: v3(2.33, COUNTER.topY, -0.62) },
  microwave: { pos: v3(1.62, 1.36, -0.8) }, // sits on a wall shelf; pos = bottom centre
  fridge: { pos: v3(2.98, 0, -0.66), width: 0.72, depth: 0.66, height: 1.9 },
  /** Freezer drawer at the bottom of the fridge (pos = drawer front-centre at floor level). */
  trash: { pos: v3(-1.44, 0, -0.62) },
  spiceShelf: { pos: v3(-0.45, 1.42, -0.92) },
  // dining nook
  table: { pos: v3(-2.12, 0, 0.08), radius: 0.46, topY: 0.74 },
  chair: { pos: v3(-2.2, 0, -0.5) },
  /** Mochi's seat: the character root stands here (bottom of the body on the chair seat). */
  character: { pos: v3(-2.18, 0.5, -0.46), yaw: 0.32 },
  plate: { pos: v3(-2.06, 0.74, 0.16) },
  bell: { pos: v3(-1.76, 0.74, 0.3) },
  chalkboard: { pos: v3(-1.0, 1.72, -0.985) },
};

export type StationId =
  | 'board'
  | 'bowl'
  | 'pan'
  | 'grill'
  | 'pot'
  | 'oven'
  | 'blender'
  | 'toaster'
  | 'fryer'
  | 'microwave'
  | 'freezer'
  | 'plate';

export interface ViewDef {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** Region that must stay visible (world-space box half extents around target), used to adapt to narrow screens. */
  fit?: [number, number];
}

/** Camera viewpoints. The overview adapts its distance to the screen aspect at runtime. */
export const VIEWS: Record<'overview' | 'table' | StationId, ViewDef> = {
  overview: { pos: v3(0.05, 1.72, 4.4), target: v3(0.05, 1.0, -0.45), fov: 36, fit: [3.25, 1.2] },
  table: { pos: v3(-1.7, 1.62, 1.72), target: v3(-2.1, 0.98, -0.18), fov: 38, fit: [0.62, 0.5] },
  plate: { pos: v3(-1.7, 1.62, 1.72), target: v3(-2.1, 0.98, -0.18), fov: 38, fit: [0.62, 0.5] },
  board: { pos: v3(-0.78, 1.62, 0.18), target: v3(-0.74, 0.93, -0.68), fov: 40, fit: [0.48, 0.3] },
  bowl: { pos: v3(-0.12, 1.55, 0.08), target: v3(-0.12, 0.98, -0.68), fov: 38, fit: [0.32, 0.25] },
  pan: { pos: v3(0.37, 1.58, 0.1), target: v3(0.37, 0.96, -0.56), fov: 38, fit: [0.34, 0.26] },
  grill: { pos: v3(0.76, 1.58, 0.1), target: v3(0.76, 0.96, -0.56), fov: 38, fit: [0.34, 0.26] },
  pot: { pos: v3(0.37, 1.78, -0.12), target: v3(0.37, 1.02, -0.84), fov: 38, fit: [0.3, 0.26] },
  oven: { pos: v3(0.55, 0.88, 0.78), target: v3(0.55, 0.44, -0.4), fov: 40, fit: [0.42, 0.34] },
  blender: { pos: v3(1.17, 1.56, 0.3), target: v3(1.17, 1.2, -0.76), fov: 38, fit: [0.3, 0.32] },
  toaster: { pos: v3(1.53, 1.4, 0.14), target: v3(1.53, 1.04, -0.74), fov: 38, fit: [0.28, 0.22] },
  fryer: { pos: v3(1.98, 1.55, 0.08), target: v3(1.98, 1.0, -0.7), fov: 38, fit: [0.3, 0.26] },
  microwave: { pos: v3(1.62, 1.6, 0.36), target: v3(1.62, 1.5, -0.8), fov: 38, fit: [0.36, 0.26] },
  // high and steep: the drawer sits at floor level and its front panel would hide the food
  freezer: { pos: v3(2.98, 1.78, 0.6), target: v3(2.98, 0.16, -0.22), fov: 40, fit: [0.4, 0.3] },
};
