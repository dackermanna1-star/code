// BLOCK A (x 150–302, z 144–322): school № 1048 with its fenced yard in the north half; two
// 5-storey khrushchyovkas (K-7) facing a small old courtyard in the south half; rakushki along
// the N–S driveway; a narrow dead-end courtyard driveway with cars on the snow.

import { M } from '../../core/materials.js'
import { paintDriveway } from '../base/api.js'
import { placeResidential } from '../residential/api.js'
import { placeSchool } from '../public/api.js'
import {
  placeStreetLamp, placeBench, placePlayground, placeCarpetRack, placeGarbageArea, placeRakushkaRow,
  placeLitterBin, placeNoticeBoard,
} from '../street/api.js'
import { placeTree, placeTreeRow, scatterTrees, placeBush, plowedPile, snowDrift, scatterWeeds } from '../nature/api.js'
import { parkRow, placeParkedCar } from '../vehicles/api.js'
import { placeStory, placeStoryAtEntrance } from '../life/api.js'
import { addNoticeCluster, addGraffiti, addPlate } from '../phone/api.js'
import { safe, pad, paveWalk, resBody, trodden, paintLawn, shoulderRect, windrow } from './util.js'
import { valueNoise2 } from '../../core/rng.js'

export const A = {
  school: { x: 214, z: 190, rot: 2, number: 1048 },   // site x 171.5–256.5, z 153.75–226.25, gate (214, 226.25) facing south
  k1: { series: 'k7', floors: 5, sections: 4, x: 290, z: 252, rot: 2 },  // x 204–290, entrances face south
  k2: { series: 'k7', floors: 5, sections: 5, x: 166, z: 292, rot: 0 },  // x 166–273.5, entrances face north
  drive: { z: 272, x0: 213, x1: 305, w: 4.5 },
  lot: { x0: 166, x1: 278, z0: 315.6 },
  schoolWalk: { z0: 229.25, z1: 231.75, x0: 151.5, x1: 262 },
}

/** Ground of Block A (lawn, sidewalks, the courtyard driveway, building pads). */
export function paintBlockA(ctx, gaps) {
  paintLawn(ctx, 151.5, 144, 302, 322, 101)
  // walk along the school fence (kids from the «Школа» stop on Берёзовая)
  paveWalk(ctx, A.schoolWalk.x0, A.schoolWalk.z0, A.schoolWalk.x1, A.schoolWalk.z1, 3)
  // sidewalks along the entrance facades, out to the N–S driveway
  paveWalk(ctx, 204, 254.5, 302, 256.75, 5)
  paveWalk(ctx, 166, 287.0, 302, 289.5, 6)
  // courtyard driveway (dead end at the west with a plough pile)
  paintDriveway(ctx, { points: [[A.drive.x1, A.drive.z], [A.drive.x0, A.drive.z]], width: A.drive.w, banks: false, seed: 151 })
  // building pads
  for (const k of [A.k1, A.k2]) {
    const r = resBody(k.series, k.floors, k.sections, k.x, k.z, k.rot)
    pad(ctx, r.x0, r.z0, r.x1, r.z1, 0.25)
  }
  gaps.ns.push([252, 292])          // courtyard mouth: both sidewalks + driveway
  gaps.ns.push([194, 250])          // rakushki facing the driveway
  // the parking strip along the E–W driveway (cars stand at road level, the windrow behind them)
  ctx.terrain.apply(A.lot.x0, A.lot.z0, A.lot.x1, 322, (x, z) => {
    const n = valueNoise2(x * 0.7, z * 0.7, 177)
    return { h: 0, mat: n > 0.62 ? M('snow_dirty') : n < 0.12 ? M('slush') : M('snow_packed') }
  })
  // and the bays on the north side of the courtyard driveway
  ctx.terrain.apply(230, 264.2, 290, A.drive.z - A.drive.w / 2 + 0.25, (x, z) => {
    const n = valueNoise2(x * 0.7, z * 0.7, 178)
    return { h: 0, mat: n > 0.62 ? M('snow_dirty') : n < 0.12 ? M('slush') : M('snow_packed') }
  })
  gaps.ewN.push([A.lot.x0 - 1, A.lot.x1 + 1])  // no windrow in front of the parked cars
  gaps.ewN.push([282, 294])                     // path from the courtyard to the E–W driveway
  gaps.berE.push([280, 286])        // path from the courtyard to Берёзовая
}

export function buildBlockA(ctx, keep) {
  const reg = ctx.registry
  const out = { entrances: [] }
  // ---- school ------------------------------------------------------------------------------
  safe('school', () => {
    const s = placeSchool(ctx, { x: A.school.x, z: A.school.z, rot: A.school.rot, seed: 7, number: A.school.number })
    out.school = s
    keep.rect(171, 153, 257, 227, 1.5)
  })
  // ---- khrushchyovkas ------------------------------------------------------------------------
  safe('k7 buildings', () => {
    const addr = { street: 'ул. Берёзовая', house: '8' }
    const b1 = placeResidential(ctx, { ...A.k1, y: 0.25, seed: 21, address: { ...addr, korpus: '1' }, lampsBroken: 0.3 })
    const b2 = placeResidential(ctx, { ...A.k2, y: 0.25, seed: 22, address: { ...addr, korpus: '2' }, lampsBroken: 0.25, firstApartment: 1 })
    out.b1 = b1; out.b2 = b2
    out.entrances.push(...b1.entrances, ...b2.entrances)
    for (const b of [b1, b2]) keep.rect(b.bounds.minX, b.bounds.minZ, b.bounds.maxX, b.bounds.maxZ, 3)
  })

  // ---- courtyard ------------------------------------------------------------------------------
  safe('A courtyard props', () => {
    // the old playground at the west end of the yard (small set, facing east into the yard)
    const pg = placePlayground(ctx, { x: 189, z: 272.5, angle: Math.PI / 2, set: 'small', seed: 301 })
    keep.rect(182, 265, 196, 280, 1.5)
    out.playground = pg
    placeCarpetRack(ctx, { x: 252, z: 282, angle: 0, carpet: true, seed: 302 })
    keep.circle(252, 282, 2.5)
    placeGarbageArea(ctx, { x: 293.5, z: 278.5, angle: Math.PI, seed: 303, enclosure: 'metal', tv: true })
    keep.rect(289, 275, 298, 281, 1)
    placeLitterBin(ctx, { x: 206.5, z: 257.6, angle: 0, type: 'concrete' })
    placeNoticeBoard(ctx, { x: 284.5, z: 285.6, angle: 0, count: 3, lostDog: true, seed: 304 })
    keep.circle(284.5, 285.6, 1.5)
  })
  safe('A benches & entrances', () => {
    const ents = out.entrances
    ents.forEach((e, i) => {
      const sgn = i % 2 ? 1 : -1
      const fx = Math.sin(e.angle), fz = Math.cos(e.angle)   // outward normal
      const tx = fz, tz = -fx                                  // along the facade
      if (i % 3 !== 2) {
        const bx = e.x + tx * 3.0 * sgn + fx * 1.2, bz = e.z + tz * 3.0 * sgn + fz * 1.2
        placeBench(ctx, { x: bx, z: bz, angle: e.angle, type: i % 2 ? 'entrance' : 'courtyard', seed: 400 + i })
        keep.circle(bx, bz, 1.4)
      }
      // notices on the wall left of every door
      if (e.noticeSpot) addNoticeCluster(ctx, { x: e.noticeSpot.x, y: e.noticeSpot.y, z: e.noticeSpot.z, angle: e.noticeSpot.angle, w: 0.55, h: 0.45, count: 2 + (i % 2), seed: 1200 + i * 17 })
      // lilac against the facade between some entrances
      if (i % 2 === 0) {
        const lx = e.x - tx * 7.5 * sgn + fx * 1.6, lz = e.z - tz * 7.5 * sgn + fz * 1.6
        placeBush(ctx, { x: lx, z: lz, kind: i % 4 === 0 ? 'lilac' : 'snowberry', seed: 500 + i })
      }
    })
    // story props beside a few doors
    if (ents[0]) placeStoryAtEntrance(ctx, ents[0], 'butts', { side: 1, seed: 41 })
    if (ents[5]) placeStoryAtEntrance(ctx, ents[5], 'bicycle', { side: -1, seed: 42 })
    if (ents[7]) placeStoryAtEntrance(ctx, ents[7], 'cat', { side: 1, seed: 43 })
    if (ents[2]) placeStoryAtEntrance(ctx, ents[2], 'sled', { side: -1, seed: 44 })
  })
  safe('A lamps', () => {
    placeStreetLamp(ctx, { x: 226.5, z: 268.6, angle: Math.PI * 0.85, type: 'courtyard', bulb: 'sodium', broken: false, seed: 601 })
    placeStreetLamp(ctx, { x: 201.5, z: 258.5, angle: Math.PI * 0.25, type: 'courtyard', bulb: 'mercury', broken: true, seed: 602 })
    placeStreetLamp(ctx, { x: 276.0, z: 285.8, angle: Math.PI, type: 'courtyard', bulb: 'sodium', broken: false, flicker: 'cycle', seed: 603 })
    keep.circle(226.5, 268.6, 1.2).circle(201.5, 258.5, 1.2).circle(276, 285.8, 1.2)
  })
  safe('A rakushki', () => {
    // a row of shell garages along the N–S driveway, east of the school
    const r = placeRakushkaRow(ctx, { x0: 298.6, z0: 247, x1: 298.6, z1: 197, angle: Math.PI / 2, seed: 701, missing: 0.1 })
    keep.rect(295.5, 195, 301.5, 249, 0.5)
    addGraffiti(ctx, { x: 299.95, y: 1.1, z: 214.5, angle: Math.PI / 2, id: 'gr_spartak', h: 0.4 })
    void r
  })

  // ---- parking ---------------------------------------------------------------------------------
  safe('A cars', () => {
    // perpendicular on the snow north of the courtyard driveway
    parkRow(ctx, { x0: 232, z0: 266.6, x1: 288, z1: 266.6, angle: 0, density: 0.6, seed: 801, snow: [['heavy', 4], ['light', 1], ['buried', 1], ['brushed', 1]] })
    // the strip along the E–W driveway, nose to the driveway, the windrow behind them
    parkRow(ctx, { x0: 168, z0: 318.9, x1: 214, z1: 318.9, angle: Math.PI, density: 0.6, seed: 802, snow: [['heavy', 3], ['buried', 1], ['light', 1], ['brushed', 1]] })
    parkRow(ctx, { x0: 220, z0: 318.9, x1: 276, z1: 318.9, angle: Math.PI, density: 0.55, seed: 803, snow: [['heavy', 3], ['buried', 1], ['brushed', 1]] })
    windrow(ctx, 'x', A.lot.z0 - 1.7, A.lot.z0 - 0.2, A.lot.x0 + 1, A.lot.x1 - 1, 0.6, [], 806, 's')
    // a Gazelle van left on the courtyard driveway's south edge
    placeParkedCar(ctx, { x: 258, z: 276.4, angle: -Math.PI / 2, type: 'gazelle_van', snow: 'heavy', seed: 804 })
    keep.rect(230, 263.5, 290, 269.7, 0.3).rect(166, 313.4, 278, 322, 0.3).circle(258, 276.4, 3.2)
  })

  // ---- paths & nav -------------------------------------------------------------------------------
  safe('A paths', () => {
    // the school walk and the gate
    ctx.navPaths.push({ points: [[151.2, 230.5], [214, 230.5], [262, 230.5]], kind: 'sidewalk' })
    // trodden: courtyard → around the west end of корп. 1 → the school walk
    trodden(ctx, [[204, 255.6], [199.2, 247], [200.5, 238], [205.5, 231.2]], { seed: 11 })
    // from the school walk's east end down to the courtyard (round корп. 1's east end)
    trodden(ctx, [[262, 230.5], [281, 235], [293, 246], [296.5, 255.6]], { seed: 12 })
    // the two facade sidewalks
    ctx.navPaths.push({ points: [[204, 255.6], [256.75, 255.6], [301.5, 255.6], [NS_X, 255.6]], kind: 'sidewalk' })
    ctx.navPaths.push({ points: [[166, 288.25], [220.75, 288.25], [301.5, 288.25], [NS_X, 288.25]], kind: 'sidewalk' })
    // courtyard driveway
    ctx.navPaths.push({ points: [[NS_X, A.drive.z], [A.drive.x0 + 1, A.drive.z]], kind: 'driveway' })
    // west: courtyard → Берёзовая
    trodden(ctx, [[166, 288.25], [159, 285.5], [150.2, 283]], { seed: 13 })
    // south: courtyard → E–W driveway between корп. 2 and the N–S driveway
    trodden(ctx, [[286, 289.6], [287.5, 300], [288.5, 312], [288.2, 321.4]], { seed: 14 })
    ctx.navPaths.push({ points: [[288.2, 321.4], [288.2, EW_CZ]], kind: 'crossing' })
    ctx.navPaths.push({ points: [[286, 289.6], [286, 288.25]], kind: 'crossing' })
    // the playground gate (east side) to корп. 1's sidewalk
    trodden(ctx, [[194.6, 272.5], [201, 266], [205, 257]], { seed: 15 })
    // old footprints from the stop «Школа» to the school gate
    trodden(ctx, [[150.2, 213], [160, 222], [172, 229.6]], { seed: 16, trail: [[150.6, 214], [160, 222], [172, 229.6], [205, 230.6], [214, 228]], age: 0.6 })
  })

  // ---- trees ---------------------------------------------------------------------------------------
  safe('A trees', () => {
    placeTreeRow(ctx, { x0: 172, z0: 309.5, x1: 272, z1: 309.5, spacing: 11, species: { 'poplar:pollarded': 0.7, 'poplar:natural': 0.3 }, missing: 0.1, seed: 901, skip: (x, z) => keep.hit(x, z) })
    // lindens along the school fence (outside, on the walk's north lawn is inside the fence: use south side)
    placeTreeRow(ctx, { x0: 160, z0: 234.2, x1: 196, z1: 234.2, spacing: 9, species: 'linden', missing: 0.1, seed: 902, skip: (x, z) => keep.hit(x, z) })
    placeTreeRow(ctx, { x0: 160, z0: 158, x1: 160, z1: 224, spacing: 10, species: { birch: 0.6, 'spruce:blue': 0.4 }, missing: 0.15, seed: 903, skip: (x, z) => keep.hit(x, z) })
    // old apple trees and birches in the courtyard lawns
    const avoid = (x, z) => keep.hit(x, z)
    scatterTrees(ctx, { rect: [206, 257.5, 300, 263], count: 5, species: { apple: 0.6, birch: 0.25, maple: 0.15 }, minSpacing: 9, avoid, seed: 904 })
    scatterTrees(ctx, { rect: [214, 275.5, 288, 286], count: 5, species: { apple: 0.5, linden: 0.3, rowan: 0.2 }, minSpacing: 9, avoid, seed: 905 })
    scatterTrees(ctx, { rect: [262, 156, 296, 228], count: 9, species: { 'poplar:natural': 0.4, birch: 0.4, 'maple:negundo': 0.2 }, minSpacing: 8, avoid, seed: 906 })
    scatterTrees(ctx, { rect: [154, 238, 200, 284], count: 6, species: { birch: 0.6, linden: 0.4 }, minSpacing: 8, avoid, seed: 907 })
    scatterWeeds(ctx, { rect: [262, 160, 294, 226], density: 1.2, kinds: { grass: 0.6, burdock: 0.25, tansy: 0.15 }, avoid, seed: 908 })
  })

  // ---- snow ------------------------------------------------------------------------------------
  safe('A snow', () => {
    plowedPile(ctx, A.drive.x0 - 2.5, A.drive.z, { radius: 2.6, height: 1.9, seed: 951, buried: 'sled' })
    snowDrift(ctx, 230, 240.5, { side: 'n', length: 22, depth: 3, height: 0.6, seed: 952 })
    snowDrift(ctx, 200, 303.5, { side: 's', length: 26, depth: 3, height: 0.55, seed: 953 })
  })

  // ---- zones, plates ---------------------------------------------------------------------------------
  ctx.zones.add({ name: 'courtyard_A', min: [166, -2, 254], max: [302, 30, 290], type: 'courtyard', reverb: 'courtyard', wind: 0.7, priority: 1, data: { pkg: 'blocks_west', block: 'A' } })
  safe('A plates', () => {
    addPlate(ctx, { x: 165.9, y: 3.6, z: 294.5, angle: -Math.PI / 2, id: 'street_berezovaya' })
  })
  reg.blocks = reg.blocks || []
  reg.blocks.push({ name: 'A', pkg: 'blocks_west', rect: [150, 144, 302, 322], school: [A.school.x, A.school.z] })
  return out
}

const NS_X = 305
const EW_CZ = 325
