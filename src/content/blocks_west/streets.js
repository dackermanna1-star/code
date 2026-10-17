// ул. Берёзовая (x 140–150) and the two western driveways (N–S x 302–308, E–W z 322–328 for x 150–308).

import { M } from '../../core/materials.js'
import { paintRoad, paintSidewalk, paintDriveway } from '../base/api.js'
import { placeStreetLamp, placeStopPole, placeRoadSign, placeLitterBin, placeManhole, placeElectricalCabinet, addPoleFlyer } from '../street/api.js'
import { placeTreeRow, placeTree, snowBank, plowedPile } from '../nature/api.js'
import { placeStory } from '../life/api.js'
import { addPlate, addNoticeCluster } from '../phone/api.js'
import { safe } from './util.js'

// Берёзовая cross-section (west → east): park fence (north pkg) | road 140–148 | curb |
// sidewalk 148–151.5 | tree lawn (blocks)
export const BER = { x0: 140, x1: 148, walk0: 148, walk1: 151.5, lanes: [142.3, 145.7], z0: 132, z1: 500, lampX: 148.85 }
export const NS = { x0: 302, x1: 308, cx: 305, z0: 144, z1: 500 }
export const EW = { z0: 322, z1: 328, cz: 325, x0: 148, x1: 308 }

/** Ground for the streets (call before the blocks so their mouths cut into it cleanly). */
export function paintStreets(ctx) {
  // sidewalk first (the road paints its curb on the sidewalk's first column)
  paintSidewalk(ctx, BER.walk0, 144, BER.walk1, BER.z1, 31)
  paintRoad(ctx, { axis: 'z', x0: BER.x0, z0: BER.z0, x1: BER.x1, z1: BER.z1, lanes: BER.lanes, laneWidth: 3.4, banks: false, seed: 41 })
  // driveways (y 0) — banks are added later with gaps
  paintDriveway(ctx, { points: [[NS.cx, NS.z0], [NS.cx, NS.z1]], width: 6, banks: false, seed: 43 })
  paintDriveway(ctx, { points: [[EW.x0, EW.cz], [EW.x1, EW.cz]], width: 6, banks: false, seed: 47 })
  // where the E–W driveway meets Берёзовая it crosses the sidewalk at road level
  ctx.terrain.apply(BER.walk0, EW.z0, BER.walk1, EW.z1, (x, z, h) => ({ h: 0, mat: M('snow_dirty') }))
  // the N–S driveway crossing the E–W one: dirty junction
  ctx.terrain.paintCircle?.(NS.cx, EW.cz, 3.2, { mat: M('slush') })
}

/** Lamps, signs, trees, banks, nav along the streets. Returns light count estimate. */
export function furnishStreets(ctx, keep, gaps = {}) {
  // gaps are absolute [from, to] along the bank axis; convert to bank-local metres
  const rel = (list, start) => (list || []).map(([a, b]) => [a - start, b - start])
  const reg = ctx.registry
  // ---- ул. Берёзовая ---------------------------------------------------------------------
  safe('berezovaya lamps', () => {
    // cobra heads on the east sidewalk, reaching west over the road; one dead, one cycling
    const zs = [158, 194, 231, 267, 304, 341, 377, 414, 450, 487]
    zs.forEach((z, i) => {
      placeStreetLamp(ctx, {
        x: BER.lampX, z, angle: -Math.PI / 2, type: 'cobra', seed: 9100 + i,
        broken: i === 6 ? true : false, flicker: i === 3 ? 'cycle' : false, flyers: i % 3 === 1,
      })
      keep.circle(BER.lampX, z, 1.2)
    })
  })
  safe('berezovaya signs', () => {
    // a bus stop pole by the school (plates toward northbound traffic), ticket, bin
    placeStopPole(ctx, { x: 149.2, z: 212, angle: 0, kind: 'bus', name: 'Школа', routes: ['648'], from: 'Ст. м. «Заречная»', to: '9-й микрорайон' })
    placeLitterBin(ctx, { x: 148.75, z: 209.6, angle: Math.PI / 2, type: 'metal' })
    placeStory(ctx, 'ticket', { x: 149.0, z: 214.3, angle: 0.7, seed: 31 })
    keep.circle(149.5, 211, 2)
    // «Осторожно, дети» for both directions around the school (signs face the oncoming traffic)
    placeRoadSign(ctx, { x: 149.1, z: 238, angle: 0, type: 'children' })
    placeRoadSign(ctx, { x: 149.1, z: 168, angle: Math.PI, type: 'children' })
    placeRoadSign(ctx, { x: 149.2, z: 331.5, angle: -Math.PI / 2, type: 'residential' })
    placeRoadSign(ctx, { x: 148.6, z: 470, angle: 0, type: 'noparking' })
    keep.circle(149.2, 238, 1).circle(149.2, 168, 1).circle(149.2, 331.5, 1).circle(148.6, 470, 1)
    // utility cabinet with flyers by the corner of the E–W driveway
    placeElectricalCabinet(ctx, { x: 152.4, z: 316.5, angle: -Math.PI / 2 })
    keep.circle(152.4, 316.5, 1.5)
    placeManhole(ctx, { x: 144.0, z: 286, wet: true, steam: 0.55 })
    placeManhole(ctx, { x: 146.4, z: 452, wet: true })
  })
  safe('berezovaya trees', () => {
    // linden / pollarded poplar row on the lawn behind the sidewalk
    const skip = (x, z) => keep.hit(x, z) || (z > 317 && z < 333)
    placeTreeRow(ctx, { x0: 153.6, z0: 150, x1: 153.6, z1: 496, spacing: 10.5, species: { linden: 0.55, 'poplar:pollarded': 0.45 }, jitter: 0.5, missing: 0.12, skip, seed: 9301 })
  })
  safe('berezovaya banks', () => {
    // plough windrows on both road edges (gaps: driveway mouth, crossings at the stop and the passage)
    snowBank(ctx, BER.x0 + 0.1, 146, BER.x0 + 1.3, 506, 1.0, { seed: 9401, gaps: rel([[232, 240], [318, 330], [408, 416], ...(gaps.berW || [])], 146) })
    snowBank(ctx, BER.x1 - 1.2, 146, BER.x1 - 0.05, 506, 0.85, { seed: 9402, gaps: rel([[208, 216], [232, 240], [319, 331], [408, 416], ...(gaps.berE || [])], 146) })
  })
  ctx.navPaths.push({ points: [[150.2, 144.5], [150.2, 324.8], [150.2, 508.6]], kind: 'sidewalk' })
  // crossings over Берёзовая toward the park (north package continues them)
  ctx.navPaths.push({ points: [[150.2, 236], [139.5, 236]], kind: 'crossing' })
  ctx.navPaths.push({ points: [[150.2, 412], [139.5, 412]], kind: 'crossing' })
  safe('street plates', () => {
    reg.streets = reg.streets || []
    reg.streets.push({ name: 'ул. Берёзовая', en: 'Beryozovaya St.', axis: 'z', x0: BER.x0, x1: BER.x1, z0: BER.z0, z1: BER.z1, lanes: BER.lanes })
  })

  // ---- N–S driveway x 302–308 -------------------------------------------------------------
  safe('ns driveway lamps', () => {
    const zs = [166, 208, 250, 292, 334, 376, 418, 460, 499]
    zs.forEach((z, i) => {
      placeStreetLamp(ctx, {
        x: NS.x0 - 0.9, z, angle: Math.PI / 2, type: 'courtyard', pole: i % 2 ? 'concrete' : 'metal',
        bulb: i === 2 || i === 7 ? 'mercury' : 'sodium', broken: i === 4, flicker: i === 5 ? 'dying' : false, seed: 9500 + i,
      })
      keep.circle(NS.x0 - 0.9, z, 1.2)
    })
  })
  safe('ns driveway banks', () => {
    // west edge bank (blocks A/D side), gaps at every mouth and path crossing
    snowBank(ctx, NS.x0 - 1.6, 150, NS.x0 - 0.2, 504, 0.75, {
      seed: 9601, dirtySide: 'e', gaps: rel([[319, 331], ...(gaps.ns || [])], 150),
    })
  })
  plowedPile(ctx, NS.x0 - 3.2, 148.5, { radius: 2.8, height: 2.1, seed: 9611, buried: 'tire' })
  ctx.navPaths.push({ points: [[NS.cx, NS.z0 + 0.5], [NS.cx, 271], [NS.cx, EW.cz], [NS.cx, 358], [NS.cx, 508.6]], kind: 'driveway' })

  // ---- E–W driveway z 322–328 -------------------------------------------------------------
  safe('ew driveway lamps', () => {
    ;[[186, 0], [232, 1], [272, 2]].forEach(([x, i]) => {
      placeStreetLamp(ctx, { x, z: EW.z0 - 2.3, angle: 0, type: 'courtyard', bulb: i === 1 ? 'mercury' : 'sodium', broken: false, seed: 9700 + i })
      keep.circle(x, EW.z0 - 2.3, 1.2)
    })
  })
  safe('ew driveway banks', () => {
    snowBank(ctx, 156, EW.z0 - 1.5, 299, EW.z0 - 0.15, 0.7, { seed: 9801, dirtySide: 's', gaps: rel(gaps.ewN, 156) })
    snowBank(ctx, 156, EW.z1 + 0.15, 299, EW.z1 + 1.5, 0.7, { seed: 9802, dirtySide: 'n', gaps: rel(gaps.ewS, 156) })
  })
  ctx.navPaths.push({ points: [[150.2, EW.cz], [180, EW.cz], [NS.cx, EW.cz]], kind: 'driveway' })

  // the courtyard crawler of the vehicles package
  reg.driveways = reg.driveways || []
  reg.driveways.push({ name: 'west N–S driveway', points: [[NS.cx, 150], [NS.cx, 330], [NS.cx, 506]] })
  reg.driveways.push({ name: '3rd Molodyozhny E–W (west part)', points: [[NS.cx, EW.cz], [180, EW.cz], [158, EW.cz]] })
  return 10 + 9 + 3
}
