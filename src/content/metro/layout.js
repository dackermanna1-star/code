// Geometry of the underpass and «Заречная» station, in world meters (x east, z south, y up).
// Everything else in the package derives from these numbers; docs/catalog/metro.md lists them.
//
//   surface   north sidewalk z 508–524 (y 0.25), carriageways z 524–538 / 542–556 (y 0),
//             median z 538–542, south sidewalk z 556–572. Our surface footprint: x 374–396.
//   underpass stairs NW/NE z 509–519, SW/SE z 561–571; halls z 519–524 / 556–561; corridor
//             z 524–556 (walkway x 382.5–387.5), floor y −4.25, ceiling underside y −1.5.
//   vestibule off the corridor's east wall (z 537–543) at x 390–413, same levels.
//   escalators x 412 (y −4.25) → x 435 (y −16), three lanes centred on z 540.
//   platform  x 444–544, island z 535–545 at y −16, tracks z 531–535 / 545–549, ceiling −12.
//   tunnels   west x 380–444 (from the city), east x 544–608 (turnaround), rail head y −17.

export const Y = {
  SIDEWALK: 0.25,
  ROAD: 0,
  SLAB: -4.5, // underside of the shallow floor slab
  FLOOR: -4.25, // underpass / vestibule floor
  CEIL: -1.5, // underside of shallow ceilings (terrain crust starts above)
  CEIL_TOP: -1.25,
  PLAT: -16, // platform & car floor
  RAIL: -17, // rail head
  BED: -17.5, // tunnel / trench floor (sleepers on top)
  HALL_CEIL: -12,
  TUN_CEIL: -13,
}

/** Stair pits. rot 0: entrance at zTop (north), descending south; rot 2: entrance south. */
export const STAIRS = [
  { id: 'NW', x0: 377, x1: 381, zTop: 509, zBot: 519, rot: 0, canopy: true },
  { id: 'NE', x0: 389, x1: 393, zTop: 509, zBot: 519, rot: 0, canopy: true },
  { id: 'SW', x0: 377, x1: 381, zTop: 571, zBot: 561, rot: 2, canopy: false },
  { id: 'SE', x0: 389, x1: 393, zTop: 571, zBot: 561, rot: 2, canopy: false },
]
export const STAIR_LEN = 10 // m (8 steps, 2 m landing, 8 steps, then the hall floor)

/** Height of the tread top at a distance d (m) from the stair entrance (0 ≤ d < 10). */
export function stairTreadY(d) {
  if (d < 0) return Y.SIDEWALK
  if (d < 4) return Y.SIDEWALK - 0.25 * (Math.floor(d / 0.5) + 1)
  if (d < 6) return -2.0
  if (d < 10) return Y.SIDEWALK - 0.25 * (Math.floor((d - 6) / 0.5) + 10)
  return Y.FLOOR
}

export const UNDERPASS = { x0: 376, x1: 394, z0: 519, z1: 561 }
export const HALL_N = { x0: 377.5, x1: 392.5, z0: 519.5, z1: 524 }
export const HALL_S = { x0: 377.5, x1: 392.5, z0: 556, z1: 560.5 }
export const CORRIDOR = { x0: 382.5, x1: 387.5, z0: 524, z1: 556 }
export const BAY = { w0: 380.5, w1: 382.5, e0: 387.5, e1: 389.5 } // kiosk bays (x)
export const VEST_DOOR = { z0: 537, z1: 543 } // opening in the corridor's east wall

export const VEST = { x0: 390, x1: 413, z0: 530.5, z1: 549.5, hx0: 393, hx1: 412, hz0: 531, hz1: 549 }
export const TURN = { x0: 401, x1: 402.5, z0: 536, cab: 0.5, lane: 0.75, n: 7 } // turnstile line

export const ESC = {
  xTop: 412, xBot: 435, yTop: Y.FLOOR, yBot: Y.PLAT, steps: 46, run: 0.5, rise: 0.25,
  wallN: [536.75, 537.25], wallS: [542.75, 543.25],
  // balustrades and lanes (z ranges)
  balN: [537.5, 538], laneN: [538, 539], balA: [539, 539.5], laneM: [539.5, 540.5],
  balB: [540.5, 541], laneS: [541, 542], balS: [542, 542.5],
  speed: 0.75, // m/s along the slope
}
/** Top of the escalator step surface at x (collision staircase). */
export function escStepY(x) {
  if (x < ESC.xTop) return ESC.yTop
  if (x >= ESC.xBot) return ESC.yBot
  const j = Math.floor((x - ESC.xTop) / ESC.run) + 1
  return ESC.yTop - ESC.rise * j
}

export const LOWER = { x0: 437, x1: 444, z0: 535.5, z1: 544.5 } // walls one voxel inside these

export const PLAT = {
  x0: 444, x1: 544, sectionLen: 20, sections: 5,
  edgeN: 535, edgeS: 545, colN: 537, colS: 543, pitch: 4,
  wallN: 531, wallS: 549,
}

export const TRACK = {
  N: { axis: 533.375, z0: 532, z1: 534.75, platSide: +1, stopHead: 543.5, dir: +1 },
  S: { axis: 546.625, z0: 545.25, z1: 548, platSide: -1, stopHead: 444.5, dir: -1 },
}

export const TUNNEL = { west: [380, 444], east: [544, 608] }

export const CAR = { len: 19.0, pitch: 19.25, n: 5 }
export const TRAIN_LEN = CAR.pitch * CAR.n

/** Footprint we own on the surface (terrain painting and holes stay inside it). */
export const FOOTPRINT = { x0: 374, x1: 396, z0: 504, z1: 574 }
