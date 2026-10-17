// ул. Берёзовая (x 140–150) and the two western driveways (N–S x 302–308, E–W z 322–328 for
// x 148–308). Three passes: paintStreets (ground, before the blocks), placeStreetFixtures
// (lamps, signs, cabinets — before the blocks so their trees keep clear of the poles) and
// finishStreets (windrows with every block's gaps, the street trees, nav, registry — last).

import { M } from '../../core/materials.js'
import { paintRoad, paintSidewalk, paintDriveway } from '../base/api.js'
import { placeStreetLamp, placeStopPole, placeRoadSign, placeLitterBin, placeManhole, placeElectricalCabinet } from '../street/api.js'
import { placeTreeRow, plowedPile } from '../nature/api.js'
import { placeStory } from '../life/api.js'
import { safe, windrow } from './util.js'

// Берёзовая cross-section (west → east): park fence x 139 (north pkg) | road 140–148 | kerb |
// sidewalk 148–151.5 | tree lawn (blocks). z 500–524 (the mouth at the avenue) is the avenue's.
export const BER = { x0: 140, x1: 148, walk0: 148, walk1: 151.5, lanes: [142.3, 145.7], z0: 132, z1: 500, lampX: 148.85, navX: 150.2 }
export const NS = { x0: 302, x1: 308, cx: 305, z0: 144, z1: 500 }
export const EW = { z0: 322, z1: 328, cz: 325, x0: 148, x1: 308 }
/** Lamp stations (z) along Берёзовая and the western N–S driveway; E–W driveway (x). */
export const LAMPS = {
  ber: [158, 194, 231, 267, 304, 341, 377, 414, 450, 487],
  ns: [162, 192, 252, 292, 334, 386, 431, 470],
  ew: [186, 232, 272],
}
/** Where pedestrians cross Берёзовая to the park gates (north package: gates at z 236, 325, 412). */
export const CROSSINGS = [236, 325, 412]

/** Ground for the streets (call before the blocks so their mouths cut into it cleanly). */
export function paintStreets(ctx) {
  // sidewalk first (the road paints its kerb on the sidewalk's first column)
  paintSidewalk(ctx, BER.walk0, 144, BER.walk1, BER.z1, 31)
  paintRoad(ctx, { axis: 'z', x0: BER.x0, z0: BER.z0, x1: BER.x1, z1: BER.z1, lanes: BER.lanes, laneWidth: 3.4, banks: false, seed: 41 })
  // driveways (y 0) — windrows are added at the end with every block's gaps
  paintDriveway(ctx, { points: [[NS.cx, NS.z0 + 3], [NS.cx, NS.z1]], width: 6, banks: false, seed: 43 })
  paintDriveway(ctx, { points: [[EW.x0 + 3, EW.cz], [EW.x1 - 3, EW.cz]], width: 6, banks: false, seed: 47 })
  // where the E–W driveway meets Берёзовая it crosses the sidewalk at road level
  ctx.terrain.apply(BER.walk0, EW.z0, BER.walk1 + 3, EW.z1, () => ({ h: 0, mat: M('snow_dirty') }))
  // the N–S driveway crossing the E–W one: a dirty junction
  ctx.terrain.paintCircle(NS.cx, EW.cz, 3.2, { mat: M('slush') })
}

/** Lamps, signs, the stop pole, cabinets, manholes. Registers keep-outs for the blocks' trees. */
export function placeStreetFixtures(ctx, keep) {
  // ---- ул. Берёзовая: cobra heads on the east sidewalk reaching over the road; one dead, one cycling
  safe('berezovaya lamps', () => {
    LAMPS.ber.forEach((z, i) => {
      placeStreetLamp(ctx, {
        x: BER.lampX, z, angle: -Math.PI / 2, type: 'cobra', seed: 9100 + i,
        broken: i === 6, flicker: i === 3 ? 'cycle' : false, flyers: i % 3 === 1,
      })
      keep.circle(BER.lampX, z, 1.2).circle(BER.lampX + 1.5, z, 2.5)
    })
  })
  safe('berezovaya signs', () => {
    // a bus stop pole by the school (plates toward the northbound traffic), a bin, one ticket
    placeStopPole(ctx, { x: 149.2, z: 212, angle: 0, kind: 'bus', name: 'Школа', routes: ['648'], from: 'Ст. м. «Заречная»', to: '9-й микрорайон' })
    placeLitterBin(ctx, { x: 148.75, z: 209.6, angle: Math.PI / 2, type: 'metal' })
    placeStory(ctx, 'ticket', { x: 149.0, z: 214.3, angle: 0.7, seed: 31 })
    keep.circle(149.5, 211, 2)
    // «Осторожно, дети» either side of the school, «Жилая зона» at the driveway mouth
    placeRoadSign(ctx, { x: 148.6, z: 240, angle: 0, type: 'children' })
    placeRoadSign(ctx, { x: 148.6, z: 166, angle: Math.PI, type: 'children' })
    placeRoadSign(ctx, { x: 148.6, z: 330.6, angle: -Math.PI / 2, type: 'residential' })
    placeRoadSign(ctx, { x: 148.6, z: 470, angle: 0, type: 'noparking' })
    for (const z of [240, 166, 330.6, 470]) keep.circle(148.6, z, 1)
    // utility cabinet with flyers by the corner of the E–W driveway (on the lawn, off the walk)
    placeElectricalCabinet(ctx, { x: 152.4, z: 316.5, angle: -Math.PI / 2 })
    keep.circle(152.4, 316.5, 1.5)
    placeManhole(ctx, { x: 144.0, z: 286, wet: true, steam: 0.55 })
    placeManhole(ctx, { x: 146.4, z: 452, wet: true })
  })
  // ---- N–S driveway: courtyard poles behind the west windrow, heads over the asphalt
  safe('ns driveway lamps', () => {
    LAMPS.ns.forEach((z, i) => {
      placeStreetLamp(ctx, {
        x: NS.x0 - 2.3, z, angle: Math.PI / 2, type: 'courtyard', pole: i % 2 ? 'concrete' : 'metal',
        bulb: i === 2 || i === 6 ? 'mercury' : 'sodium', broken: i === 4, flicker: i === 5 ? 'dying' : false, seed: 9500 + i,
      })
      keep.circle(NS.x0 - 2.3, z, 1.2).circle(NS.x0 - 1, z, 2.6)
    })
  })
  // ---- E–W driveway: three poles on the south side (Block D), heads reaching north
  safe('ew driveway lamps', () => {
    LAMPS.ew.forEach((x, i) => {
      placeStreetLamp(ctx, { x, z: EW.z1 + 2.2, angle: Math.PI, type: 'courtyard', bulb: i === 1 ? 'mercury' : 'sodium', broken: false, seed: 9700 + i })
      keep.circle(x, EW.z1 + 2.2, 1.2).circle(x, EW.z1 + 1, 2.6)
    })
  })
}

/** Windrows, the street trees, plough piles, nav and registry (after every block). */
export function finishStreets(ctx, keep, gaps = {}) {
  const reg = ctx.registry
  // ---- ул. Берёзовая ---------------------------------------------------------------------
  safe('berezovaya trees', () => {
    // linden / pollarded poplar row on the lawn behind the sidewalk
    const skip = (x, z) => keep.hit(x, z) || (z > 317 && z < 333)
    placeTreeRow(ctx, { x0: 153.6, z0: 150, x1: 153.6, z1: 496, spacing: 10.5, species: { linden: 0.55, 'poplar:pollarded': 0.45 }, jitter: 0.5, missing: 0.12, skip, seed: 9301 })
  })
  safe('berezovaya banks', () => {
    // plough windrows on both kerbs, in pieces (gaps: crossings, the stop, the driveway mouth)
    const cross = CROSSINGS.map(z => [z - 4, z + 4])
    windrow(ctx, 'z', BER.x0 + 0.1, BER.x0 + 1.3, 147, BER.z1 - 1.5, 0.95, [...cross, ...(gaps.berW || [])], 9401, 'e')
    windrow(ctx, 'z', BER.x1 - 1.2, BER.x1 - 0.05, 147, BER.z1 - 1.5, 0.8, [[207, 217], ...cross, [EW.z0 - 3, EW.z1 + 3], ...(gaps.berE || [])], 9402, 'w')
  })
  ctx.navPaths.push({ points: [[BER.navX, 144.5], [BER.navX, EW.cz], [BER.navX, 513.2]], kind: 'sidewalk' })
  // crossings over Берёзовая to the park gates (the north package continues them inside)
  for (const z of CROSSINGS) ctx.navPaths.push({ points: [[BER.navX, z], [138, z]], kind: 'crossing' })
  reg.streets = reg.streets || []
  reg.streets.push({ name: 'ул. Берёзовая', en: 'Beryozovaya St.', axis: 'z', x0: BER.x0, x1: BER.x1, z0: BER.z0, z1: 524, lanes: BER.lanes, pkg: 'blocks_west' })

  // ---- N–S driveway x 302–308 -------------------------------------------------------------
  safe('ns driveway banks', () => {
    // west edge windrow (blocks A/D side), gaps at every mouth and path crossing
    windrow(ctx, 'z', NS.x0 - 1.6, NS.x0 - 0.2, 150, NS.z1 - 2, 0.7, [[EW.z0 - 3, EW.z1 + 3], ...(gaps.ns || [])], 9601, 'e')
  })
  safe('ns pile', () => plowedPile(ctx, NS.x0 - 3.4, 149, { radius: 2.6, height: 2.0, seed: 9611, buried: 'tire' }))
  ctx.navPaths.push({ points: [[NS.cx, NS.z0 + 0.5], [NS.cx, 272], [NS.cx, EW.cz], [NS.cx, 358], [NS.cx, 513.2]], kind: 'driveway' })

  // ---- E–W driveway z 322–328 -------------------------------------------------------------
  safe('ew driveway banks', () => {
    windrow(ctx, 'x', EW.z0 - 1.5, EW.z0 - 0.15, 156, 299, 0.65, gaps.ewN, 9801, 's')
    windrow(ctx, 'x', EW.z1 + 0.15, EW.z1 + 1.5, 156, 299, 0.65, gaps.ewS, 9802, 'n')
  })
  ctx.navPaths.push({ points: [[BER.navX, EW.cz], [180, EW.cz], [NS.cx, EW.cz], [310.5, EW.cz]], kind: 'driveway' })

  // the courtyard crawler of the vehicles package
  reg.driveways = reg.driveways || []
  reg.driveways.push({ name: 'west N–S driveway', points: [[NS.cx, 150], [NS.cx, 330], [NS.cx, 498]] })
  reg.driveways.push({ name: '3-й Молодёжный проезд (west part)', points: [[NS.cx, EW.cz], [180, EW.cz], [156, EW.cz]] })
}
