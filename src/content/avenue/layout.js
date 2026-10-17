// проспект Строителей — geometry shared by every part of the avenue package.
// World metres: x east, z south. Road surface y 0, sidewalks 0.25, lawn snow 0.5.

import { POSTERS } from '../street/api.js'

export const PLAY_MIN = 24
export const PLAY_MAX = 616
export const SPAN = PLAY_MAX - PLAY_MIN // 592
/** Lamp / trolley-pole period: 592 = 16 × 37, so the pattern matches across the wrap. */
export const PERIOD = 37

export const Z = {
  TREES: [500, 508], // tree strip between the sidewalk and the district
  N_SIDE: [508, 524], // north sidewalk band (spec)
  N_WALK: [509, 516.5], // its paved walkway
  N_LAWN: [516.5, 523], // lawn strip with the poles and billboards
  N_CURB: 524, // kerb line
  ROAD_W: [524, 538], // westbound carriageway
  MEDIAN: [538, 542],
  ROAD_E: [542, 556], // eastbound carriageway
  S_CURB: 556,
  S_LAWN: [557, 563],
  S_WALK: [563, 570.5],
  S_SIDE: [556, 572],
  STRIP: [572, 600], // south strip: kiosks, shop, 9-storey row, terminal
  // low arched lawn fences stand on the outer edge cells of the walks; the cleared snow is heaped
  // in banks on the lawn just behind them (hoops stick out of the bank's foot)
  FENCE_N: 508.88,
  BANK_N: [505.4, 508.72],
  FENCE_S: 570.62,
  BANK_S: [570.78, 573.9],
}
export const LANES_W = [527.5, 531, 534.5]
export const LANES_E = [552.5, 549, 545.5]
export const MEDIAN_Z = 540

/**
 * Sidewalk lamps (cobras on concrete poles at the back of each walk, heads over the walk), every
 * 2 periods (74 m, also tiling the 592 m wrap) so the walks get pools of light with dark gaps.
 * The north row is phased on the spawn stop's lamp (x 254.6, placed with the stop); the south row
 * sits half a pitch (37 m) further on.
 */
export const WALK_LAMPS = {
  n: { x0: 254.6 - 3 * 74, z: 509.45, skip: [[248, 262], [368, 401]] },
  s: { x0: 254.6 - 3 * 74 + 37, z: 570.25, skip: [[352, 401], [430, 450], [580, 612], [255, 280]] },
  pitch: 74,
}

/** Metro package footprint: never paint or place inside. */
export const METRO = { x0: 374, x1: 396, z0: 504, z1: 574 }

/** Nav lines (walker centre lines) along both sidewalks. */
export const NAV_N = 513.2
export const NAV_S = 566.8
/** Detour past the metro stair pits (between the pits and the kerb). */
export const NAV_N_PIT = 521.4
export const NAV_S_PIT = 558.6

// ---- places ------------------------------------------------------------------------------
export const SPAWN = { x: 248, z: 515.5 }
export const STOP_N = { x: 248, z: 520.6 } // trolleybus stop (spawn)
export const STOP_S = { x: 266, z: 559.4 } // bus stop on the south side
// ул. Берёзовая meets the avenue (T-junction). Same cross-section as blocks_west: road x 140–148,
// east sidewalk 148–151.5 (the park fence of the north package is west of x 140).
export const BEREZOVAYA = { x0: 140, x1: 148, walk1: 151.5, lanes: [142.3, 145.7] }
export const DRIVEWAYS = [{ x0: 302, x1: 308 }, { x0: 456, x1: 462 }]
export const PASSAGES = [228, 540] // footpaths into Block D / Block F
export const ZEBRA = { x0: 509.5, x1: 514.5 } // the one zebra crossing (flashing yellow)
export const LAYBY = { x0: 337, x1: 359, z1: 559.5 } // taxi lay-by by the underpass
export const PLAZA = { x0: 396, x1: 494, z0: 556, z1: 578 } // kiosk / shop forecourt (paved)

// south 9-storey row (rot 2: entrance facade on z = 594, body z 582–594, porches to 596.5)
export const ROW_Z = 594
export const ROW = [
  { id: 'S1', series: 'ii49', floors: 9, sections: 4, x: 152, house: '27', seed: 41 }, // x 44–152
  { id: 'S2', series: '1515', floors: 9, sections: 4, x: 280, house: '29', seed: 43 }, // x 174–280
  { id: 'S3', series: 'ii49', floors: 9, sections: 2, x: 362, house: '31', seed: 47 }, // x 308–362
]

// bus terminal (конечная) — loop centreline in driving order
export const TERM = {
  loop: [[538, 566], [538, 576], [538, 589], [539.5, 594], [544, 596], [586, 596], [590.5, 594], [592, 589], [592, 576], [592, 566]],
  stand: [538, 583.5], // layover stand for moving buses (west edge, doors to the platform)
  platform: { x0: 528, x1: 534.25, z0: 572, z1: 595 },
  island: { x0: 541.75, x1: 583.5, z0: 572, z1: 587.5 },
  busBay: { x: 586, z: 579.5 }, // parked LiAZ, heading north
  trolleyBay: { x: 566, z: 590.25 }, // parked ZiU, heading east, under its own wire pair
  entry: [[527, 552.5], [534, 558.5], [538, 566]],
  exit: [[592, 566], [596, 559.25], [604, 552.5]],
}

/** A street-package poster record by id (placeBusStop wants the record, not the id). */
export const poster = id => POSTERS.find(p => p.id === id) ?? POSTERS[0]

/** Is x inside [a, b] (with margin)? */
export const within = (x, a, b, m = 0) => x >= a - m && x <= b + m
/** x positions of the trolley/lamp stations across the whole world (wrap-periodic). */
export function stations() {
  const out = []
  for (let k = 0; k * PERIOD <= 640; k++) out.push(k * PERIOD)
  return out
}
/** Seed that is identical for x and x ± 592 (so wrapped duplicates look the same). */
export const wrapSeed = (x, salt = 0) => (((Math.round(x) - PLAY_MIN) % SPAN + SPAN) % SPAN) * 7 + salt * 1013 + 11

/** Run fn, log and swallow errors (one failing helper must not take the avenue down). */
export function safe(label, fn) {
  try { return fn() } catch (e) {
    console.error(`[avenue] ${label} failed`, e)
    return null
  }
}
