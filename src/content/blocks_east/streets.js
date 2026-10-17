// Driveways and courtyard furniture of the eastern blocks: plough windrows, lamps (pools of
// light with dark gaps between them), parked cars, garbage areas, rakushki, playgrounds, benches,
// notice boards, steaming manholes over the heating main, and the driveway registry for the
// vehicles package's courtyard car.

import {
  placeStreetLamp, placeBench, placePlayground, placeGarbageArea, placeRakushkaRow, placeCarpetRack,
  placeNoticeBoard, placeManhole, placeLitterBin, placeRoadSign, placeElectricalCabinet,
} from '../street/api.js'
import { snowBank, plowedPile } from '../nature/api.js'
import { parkRow, placeParkedCar } from '../vehicles/api.js'
import { placeStory } from '../life/api.js'
import { DRIVE, LONE_LAMP, HILL } from './geo.js'
import { safe, keep, rngFor } from './lib.js'

const H = Math.PI / 2

/** A street lamp plus a keep-out round its pole and head (no tree crowns in the light). */
function lamp(ctx, o) {
  const r = placeStreetLamp(ctx, o)
  const f = o.type === 'cobra' ? 2.5 : 1.25
  keep(o.x, o.z, o.x, o.z, 2.4)
  keep(o.x + Math.sin(o.angle ?? 0) * f, o.z + Math.cos(o.angle ?? 0) * f, o.x, o.z, 2.4)
  return r
}

/**
 * A windrow along a driveway edge, split into pieces of ≤ 40 m with the given absolute gaps
 * (crossings) plus a few random openings. axis 'z': x0..x1 is the bank width, a..b its run.
 */
function windrow(ctx, axis, w0, w1, a, b, height, gaps, seed, dirtySide) {
  const rng = rngFor(seed)
  const cuts = gaps.map(g => [Math.min(g[0], g[1]), Math.max(g[0], g[1])]).sort((p, q) => p[0] - q[0])
  // free intervals
  let pieces = []
  let cur = a
  for (const [g0, g1] of cuts) {
    if (g1 <= cur || g0 >= b) continue
    if (g0 > cur) pieces.push([cur, g0])
    cur = Math.max(cur, g1)
  }
  if (cur < b) pieces.push([cur, b])
  // break long pieces with random 2.5–4 m openings every 18–34 m (people climb over at those)
  const out = []
  for (const [p0, p1] of pieces) {
    let s = p0
    while (p1 - s > 36) {
      const e = s + rng.float(18, 34)
      out.push([s, e])
      s = e + rng.float(2.5, 4)
    }
    if (p1 - s > 3) out.push([s, p1])
  }
  for (const [s, e] of out) {
    const h = height * rng.float(0.75, 1.15)
    if (axis === 'z') snowBank(ctx, w0, s, w1, e, h, { dirtySide, seed: rng.int(1, 1e6) })
    else snowBank(ctx, s, w0, e, w1, h, { dirtySide, seed: rng.int(1, 1e6) })
  }
}

export function buildDriveways(ctx) {
  const reg = ctx.registry
  // ---- plough windrows -------------------------------------------------------------------
  safe('windrows', () => {
    // N–S driveway, west edge (between the asphalt and the sidewalk)
    windrow(ctx, 'z', 456.0, 457.0, 150, 444,
      0.75, [[171, 180], [239, 249], [320, 330], [355, 364], [394, 402]], 301, 'e')
    // N–S driveway, east edge (Block C, then Block F's side): none where cars stand or rakushki open onto it
    windrow(ctx, 'z', 460.75, 462.25, 150, 512,
      0.9, [[156, 167], [196, 205], [210, 288], [288, 318], [320, 330], [334, 362], [398, 442], [500, 512]], 302, 'w')
    // E–W driveway, north edge (sidewalk side) and south edge
    windrow(ctx, 'x', 322.0, 323.0, 308, 598,
      0.7, [[318, 324], [329, 336], [351, 358], [419, 431], [452, 466], [474, 482], [579, 587]], 303, 's')
    windrow(ctx, 'x', 326.75, 327.95, 308, 598,
      0.85, [[308, 312], [330, 384], [352, 360], [436, 444], [452, 466], [485, 542]], 304, 'n')
  })
  // ---- plough piles at the dead ends and lot corners ---------------------------------------
  safe('piles', () => {
    plowedPile(ctx, 595.5, 325, { radius: 2.6, height: 2.2, seed: 11, buried: 'yolka' })
    plowedPile(ctx, 578.6, 200.6, { radius: 2.2, height: 1.9, seed: 12 })       // dead end of Block C's inner driveway
    plowedPile(ctx, 594.0, 160.0, { radius: 2.0, height: 1.9, seed: 13, buried: 'tire' })      // garage lane's dead end
    plowedPile(ctx, 452.0, 497.0, { radius: 2.5, height: 2.4, seed: 14 })
    plowedPile(ctx, 320.0, 180.8, { radius: 2.0, height: 1.6, seed: 15, buried: false })
    plowedPile(ctx, 452.5, 446.5, { radius: 1.8, height: 1.5, seed: 16, buried: 'sled' })
  })

  // ---- driveway lamps: one side, ~33 m apart ----------------------------------------------
  safe('driveway lamps', () => {
    // N–S: concrete cobra poles at the yard edge of the west sidewalk (out of the walkers' way),
    // heads over the asphalt; along the shop's parking lot they stand at the lot's kerb
    const zs = [160, 194, 228, 262, 296, 352, 386, 420, 454, 488]
    zs.forEach((z, i) => lamp(ctx, { x: z > 444 ? 454.9 : 453.2, z, angle: H, type: 'cobra', seed: 500 + i, broken: i === 6 ? true : undefined }))
    // E–W: lower courtyard poles at the back edge of the north sidewalk, heads over the asphalt
    const xs = [323, 357, 391, 425, 494, 528, 562]
    xs.forEach((x, i) => lamp(ctx, { x, z: 319.2, angle: 0, type: 'courtyard', seed: 520 + i, broken: i === 4 ? true : undefined }))
  })

  // ---- parked cars on the driveway edges (snowed in; the buried drifts fall away from the lane) --
  safe('driveway cars', () => {
    // (kept clear of the crawler routes below: N–S lane x ≤ 459.2, E–W lane z ≤ 325.3)
    const snow = [['heavy', 4], ['buried', 3], ['light', 1]]
    parkRow(ctx, { x0: 461.0, z0: 290, x1: 461.0, z1: 318, angle: Math.PI, density: 0.75, snow, seed: 601, warmChance: 0 })
    parkRow(ctx, { x0: 461.0, z0: 336, x1: 461.0, z1: 360, angle: Math.PI, density: 0.7, snow, seed: 602, warmChance: 0 })
    parkRow(ctx, { x0: 461.0, z0: 400, x1: 461.0, z1: 440, angle: Math.PI, density: 0.6, snow, seed: 603, warmChance: 0 })
    parkRow(ctx, { x0: 332, z0: 326.95, x1: 382, z1: 326.95, angle: H, density: 0.65, snow, seed: 604, warmChance: 0 })
    // (Block F's own driveway leaves the E–W driveway at x 489.5–494.5: no cars there)
    parkRow(ctx, { x0: 501, z0: 326.95, x1: 540, z1: 326.95, angle: H, density: 0.6, snow, seed: 605, warmChance: 0 })
  })

  // ---- registry for the vehicles package's rare courtyard car -----------------------------
  // The free lane of the N–S driveway is its west half (cars stand along the east kerb, x ≥ 460.1),
  // the E–W driveway's is its north half (cars along the south kerb, z ≥ 326.1).
  reg.driveways = reg.driveways || []
  const cx = 458.3, cz = 324.4
  reg.driveways.push(
    { points: [[cx, 150], [cx, 320]], name: 'east N–S, blocks B/C' },
    { points: [[cx, 330], [cx, 512]], name: 'east N–S, blocks E/F' },
    { points: [[312, cz], [cx, cz], [590, cz]], name: 'E–W 3-й Молодёжный' },
    { points: [[cx, 175.5], [314, 175.5]], name: 'Block B inner' },
    { points: [[cx, 359.5], [314, 359.5]], name: 'Block E inner' },
    { points: [[cx, 200.5], [574, 200.5]], name: 'Block C inner (dead end)' },
    { points: [[cx, 161.5], [588, 161.5]], name: 'Block C garage lane (dead end)' },
    { points: [[cx, 470], [445, 470], [445, 497]], name: 'shop parking lot' },
  )
  // driveways as pedestrian routes too (people walk 0.8 m right of the line)
  ctx.navPaths.push(
    { points: [[cx, 146], [cx, 322], [cx, 328], [cx, 520]], kind: 'driveway' },
    { points: [[310, cz], [cx, cz], [596, cz]], kind: 'driveway' },
    { points: [[305, 175.5], [cx, 175.5]], kind: 'driveway' },
    { points: [[310, 359.5], [cx, 359.5]], kind: 'driveway' },
    { points: [[cx, 200.5], [576, 200.5]], kind: 'driveway' },
    { points: [[cx, 161.8], [590, 161.8]], kind: 'driveway' },
  )
  // sidewalks (every line ends on another one, so the walkers' graph is one piece)
  ctx.navPaths.push(
    { points: [[454.75, 144.5], [454.75, 320.75], [309.25, 320.75]], kind: 'sidewalk' },
    { points: [[454.75, 320.75], [462, 320.75]], kind: 'crossing' },
    { points: [[462, 320.75], [597, 320.75]], kind: 'sidewalk' },
    { points: [[309.25, 320.75], [309.25, 329.25]], kind: 'crossing' },
    { points: [[309.25, 329.25], [454.75, 329.25], [454.75, 470.5]], kind: 'sidewalk' },
    { points: [[309.25, 329.25], [309.25, 513.2]], kind: 'sidewalk' },
    // across the shop's parking lot to the shop's back path (the lot's free lane, x 445)
    { points: [[434, 481], [445, 480], [445, 470.5], [454.75, 470.5], [458.3, 470.5]], kind: 'path' },
    // the spine's two ends on to the avenue's sidewalk (z 513.2), round the outside of the metro
    // stair pits (x 377–381 and 389–393, z 509–519); nothing is painted here, the avenue owns it
    { points: [[377.6, 499.8], [375.2, 504.5], [374.6, 509], [374.6, 513.2]], kind: 'path' },
    { points: [[392.6, 499.8], [395.0, 504.5], [395.6, 509], [395.6, 513.2]], kind: 'path' },
    { points: [[305.2, 171.5], [313, 170.5], [454.75, 170.5]], kind: 'sidewalk' },
    { points: [[319, 184.5], [454.75, 184.5]], kind: 'sidewalk' },
    { points: [[332.75, 184.5], [332.75, 251]], kind: 'sidewalk' },
    { points: [[433.25, 184.5], [433.25, 245]], kind: 'sidewalk' },
    { points: [[309.25, 354.5], [454.75, 354.5]], kind: 'sidewalk' },
    { points: [[309.25, 365.5], [454.75, 365.5]], kind: 'sidewalk' },
    { points: [[458.3, 197.2], [465, 195.5], [583, 195.5], [583, 196.4]], kind: 'sidewalk' },
    { points: [[458.3, 205.0], [465, 206.5], [580.4, 206.5], [580.9, 248.5]], kind: 'sidewalk' },
    { points: [[484, 286], [574, 286]], kind: 'sidewalk' },
  )
}

/** Courtyard lamps, benches, playgrounds, garbage areas, rakushki, notice boards, manholes. */
export function buildCourtyards(ctx) {
  // ---- courtyard lamps (pools of light, deliberately far apart) ---------------------------
  safe('courtyard lamps', () => {
    // Block B: over the parking where the yard path starts; at the kindergarten gate
    lamp(ctx, { x: 396.5, z: 186.3, angle: Math.PI, type: 'courtyard', seed: 701, broken: false })
    lamp(ctx, { x: 393.6, z: 257.6, angle: -H, type: 'courtyard', bulb: 'mercury', seed: 702, broken: false })
    lamp(ctx, { x: 338.5, z: 266.0, angle: H, type: 'courtyard', seed: 703, broken: true })   // the dark west yard
    // Block E: the spine to the metro, alternating sides, ~35 m apart
    lamp(ctx, { x: 383.6, z: 384, angle: -H, type: 'courtyard', bulb: 'sodium', seed: 711, broken: false })
    lamp(ctx, { x: 378.9, z: 419, angle: H, type: 'courtyard', bulb: 'sodium', seed: 712, broken: true })
    lamp(ctx, { x: 383.6, z: 454, angle: -H, type: 'courtyard', bulb: 'sodium', seed: 713, broken: false, flicker: 'buzz' })
    lamp(ctx, { x: 381.6, z: 491.6, angle: Math.PI, type: 'courtyard', bulb: 'sodium', seed: 714, broken: false })   // in the fork
    // Block C: where the yard path leaves the long building, and THE lone lamp at its far end
    lamp(ctx, { x: 486.6, z: 208.6, angle: 0, type: 'courtyard', bulb: 'mercury', seed: 721, broken: false })
    lamp(ctx, { x: LONE_LAMP[0], z: LONE_LAMP[1], angle: -H, type: 'courtyard', pole: 'concrete', bulb: 'sodium', seed: 722, broken: false, flicker: 'dying', flyers: true })
  })

  // ---- playgrounds ------------------------------------------------------------------------
  safe('playground E', () => placePlayground(ctx, { x: 350, z: 425, angle: H, set: 'full', seed: 31, lamp: true, mittens: false }))
  safe('playground C', () => placePlayground(ctx, { x: 506, z: 242, angle: 0, set: 'small', seed: 33, mittens: false }))
  safe('playground C lamp', () => lamp(ctx, { x: 513.6, z: 236.2, angle: Math.atan2(506 - 513.6, 242 - 236.2), type: 'courtyard', bulb: 'sodium', seed: 731, broken: false }))

  // ---- the snow hill: a forgotten sled at the end of the ice chute, prints up the back --------
  safe('hill story', () => {
    const [hx, hz] = HILL
    placeStory(ctx, 'sled', { x: hx + 2.4, z: hz + 12.6, angle: 2.6, seed: 63 })
    if (ctx.footprints) {
      try { ctx.footprints.addTrail([[hx - 3, hz - 13], [hx - 1.5, hz - 7], [hx - 0.3, hz - 2.5], [hx, hz]], ctx.terrain, 0.55) } catch (e) { /* optional */ }
    }
  })

  // ---- garbage areas by the driveways ------------------------------------------------------
  safe('garbage B', () => placeGarbageArea(ctx, { x: 446, z: 190.6, angle: Math.PI, seed: 41, enclosure: 'brick', tree: true }))
  safe('garbage E', () => placeGarbageArea(ctx, { x: 408, z: 344.6, angle: 0, seed: 42, enclosure: 'metal', tv: true }))
  safe('garbage C', () => placeGarbageArea(ctx, { x: 469, z: 212.2, angle: Math.PI, seed: 43, enclosure: 'brick' }))
  keep(441, 188, 451, 193, 0.6); keep(403, 342, 413, 349, 0.6); keep(464, 210, 474, 214, 0.6)
  safe('yolkas', () => {
    placeStory(ctx, 'yolka', { x: 404.2, z: 348.4, angle: 0.4, seed: 51 })
    placeStory(ctx, 'yolka', { x: 473.6, z: 209.0, angle: 2.2, seed: 52 })
  })

  // ---- rakushki (shell garages) ---------------------------------------------------------------
  safe('rakushki', () => {
    // Block B west edge, padlocks toward the western driveway
    ctx.terrain.apply(308, 254, 314.6, 316, () => ({ h: 1 }))
    placeRakushkaRow(ctx, { x0: 311.5, z0: 255, x1: 311.5, z1: 315, seed: 61, missing: 0.1 })
    // Block C along the N–S driveway's east edge
    ctx.terrain.apply(462, 215, 468.6, 285, () => ({ h: 1 }))
    placeRakushkaRow(ctx, { x0: 465.5, z0: 216, x1: 465.5, z1: 284, seed: 62, missing: 0.12 })
    keep(308, 254, 315, 316, 0.5); keep(462, 215, 469, 285, 0.5)
  })

  // ---- benches ------------------------------------------------------------------------------
  safe('benches', () => {
    // along the spine, facing the path; one with a child's mittens
    const b1 = placeBench(ctx, { x: 378.4, z: 437.5, angle: H, type: 'courtyard', seed: 81 })
    if (b1) placeStory(ctx, 'mittens', { bench: { ...b1, angle: H }, seed: 82 })
    placeBench(ctx, { x: 384.1, z: 470.5, angle: -H, type: 'courtyard', seed: 83, snow: 'snow' })
    const b3 = placeBench(ctx, { x: 378.4, z: 398.5, angle: H, type: 'courtyard', seed: 84 })
    if (b3) placeStory(ctx, 'frozen_bag', { bench: { ...b3, angle: H }, seed: 85 })
    // Block B west yard by the carpet rack; Block C by the long building's sidewalk
    placeBench(ctx, { x: 334.5, z: 270, angle: H, type: 'courtyard', seed: 86 })
    placeBench(ctx, { x: 520, z: 209.3, angle: 0, type: 'courtyard', seed: 87 })
    placeBench(ctx, { x: 553, z: 209.3, angle: 0, type: 'courtyard', seed: 88, snow: 'brushed' })
    placeLitterBin(ctx, { x: 379.0, z: 470.5, angle: H, type: 'concrete' })
    for (const [x, z] of [[378.4, 437.5], [384.1, 470.5], [378.4, 398.5], [334.5, 270], [520, 209.3], [553, 209.3], [379, 470.5]]) keep(x, z, x, z, 1.4)
    placeLitterBin(ctx, { x: 397.8, z: 187.2, angle: 0, type: 'metal' })
  })

  // ---- carpet rack, notice boards, electrical cabinet ------------------------------------------
  safe('yard things', () => {
    placeCarpetRack(ctx, { x: 338, z: 279, angle: 0.15, carpet: false, seed: 91 })
    placeNoticeBoard(ctx, { x: 376.8, z: 368.4, angle: Math.PI, seed: 92, lostDog: true })
    placeNoticeBoard(ctx, { x: 371.5, z: 186.6, angle: Math.PI, seed: 93 })
    keep(375.5, 367.5, 378.2, 369.4, 0.6); keep(370.4, 185.6, 372.6, 187.6, 0.6)
    placeElectricalCabinet(ctx, { x: 447.5, z: 331.6, angle: Math.PI, seed: 94 })
    placeRoadSign(ctx, { x: 453.2, z: 149.5, angle: Math.PI, type: 'children' })
  })

  // ---- the heating main: steaming manholes on the thawed strip ------------------------------
  safe('manholes', () => {
    placeManhole(ctx, { x: 340.5, z: 408.1, wet: true, steam: 0.75 })
    placeManhole(ctx, { x: 425.0, z: 401.0, wet: true, steam: 0.45 })
    placeManhole(ctx, { x: 459.0, z: 397.6, wet: true, steam: 0.3 })
    ctx.registry.manholes = ctx.registry.manholes || []
    ctx.registry.manholes.push({ x: 340.5, z: 408.1 }, { x: 425, z: 401 }, { x: 459, z: 397.6 })
  })
}

/** Parked cars in the courtyards: bays, parallel strips, the shop's lot with its warm car. */
export function buildParking(ctx) {
  const snow = [['heavy', 5], ['buried', 2], ['light', 1], ['brushed', 1]]
  safe('B bays', () => {
    parkRow(ctx, { x0: 323, z0: 180.8, x1: 393.5, z1: 180.8, angle: 0, density: 0.72, snow, seed: 801, warmChance: 0 })
    parkRow(ctx, { x0: 402, z0: 180.8, x1: 439, z1: 180.8, angle: 0, density: 0.7, snow, seed: 802, warmChance: 0 })
  })
  safe('E strip', () => {
    const rows = [[334, 377], [386, 429], [438, 449.5]]
    rows.forEach(([a, b], i) => parkRow(ctx, { x0: a, z0: 363.25, x1: b, z1: 363.25, angle: i % 2 ? -H : H, density: 0.62, snow, seed: 811 + i, warmChance: 0 }))
  })
  safe('shop lot', () => {
    // someone ran in for bread and left the engine running: warm hood, fogged windows
    placeParkedCar(ctx, { x: 437.6, z: 470.6, angle: H, type: 'vaz2107', warm: true, seed: 820 })
    parkRow(ctx, { x0: 437.6, z0: 446, x1: 437.6, z1: 467.5, angle: H, density: 0.75, snow, seed: 821, warmChance: 0 })
    parkRow(ctx, { x0: 437.6, z0: 474, x1: 437.6, z1: 495, angle: H, density: 0.6, snow, seed: 822, warmChance: 0 })
    // east row, with the lot's mouth from the N–S driveway left open at z 466–475
    parkRow(ctx, { x0: 451.6, z0: 449, x1: 451.6, z1: 465, angle: -H, density: 0.6, snow: [['buried', 3], ['heavy', 3]], seed: 823, warmChance: 0 })
    parkRow(ctx, { x0: 451.6, z0: 476, x1: 451.6, z1: 494, angle: -H, density: 0.55, snow: [['buried', 3], ['heavy', 3]], seed: 824, warmChance: 0 })
  })
  safe('C strip', () => {
    const rows = [[472, 485], [492, 527], [534, 573]]          // the strip ends at the dead end (x 576)
    rows.forEach(([a, b], i) => parkRow(ctx, { x0: a, z0: 204.25, x1: b, z1: 204.25, angle: -H, density: 0.6, snow, seed: 831 + i, warmChance: 0 }))
    // in front of the garages
    placeParkedCar(ctx, { x: 503.5, z: 163.2, angle: -H, snow: 'heavy', seed: 841 })
    placeParkedCar(ctx, { x: 571.2, z: 163.3, angle: H, snow: 'buried', seed: 842 })
  })
}
