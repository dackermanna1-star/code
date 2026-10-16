// проспект Строителей — geometry shared by every part of the avenue package.
// World metres: x east, z south. Road surface y 0, sidewalks 0.25, lawn snow 0.5.

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
}
export const LANES_W = [527.5, 531, 534.5]
export const LANES_E = [552.5, 549, 545.5]
export const MEDIAN_Z = 540

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
export const BEREZOVAYA = { x0: 140, x1: 150 } // ул. Берёзовая meets the avenue (T-junction)
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
