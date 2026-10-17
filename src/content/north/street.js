// ул. Заводская: the heating main on its П-supports along the north verge (arches over the
// yard gates and the way to the platform, chambers where it dives underground), street lamps
// every ~35 m (sodium cobra heads mixed with cold mercury ДРЛ), the bus stop «Платформа
// «Заводская»», plough banks on both kerbs with gaps where people cross, a few parked cars,
// manholes steaming over the underground main, street plates, nav paths.

import { RNG } from '../../core/rng.js'
import { placeHeatPipe } from '../public/api.js'
import {
  placeStreetLamp, placeBusStop, placeStopPole, placeManhole, placeLitterBin, addPoleFlyer, placeRoadSign, placePayphone,
} from '../street/api.js'
import { snowBank, plowedPile, placeTreeRow, addSteam } from '../nature/api.js'
import { placeParkedCar } from '../vehicles/api.js'
import { addPlate, addNoticeCluster } from '../phone/api.js'
import { ROAD, WALK, VERGE, BER, DRIVES, GSK, BOILER, WAREHOUSE, SUBSTATION, STOP, HEAT, CROSS_PATH, GATES } from './layout.js'
import { nav, safe, PI, HALF_PI } from './lib.js'
import { CROSSING_TRAIL } from './ground.js'

/** Crossing points over the street (x): yard gates and the way to the crossing. */
const CROSS = {
  gsk: (GSK.gate[0] + GSK.gate[1]) / 2 + 1.6,
  boilerDoor: 249.25,
  boilerGate: (BOILER.gate[0] + BOILER.gate[1]) / 2,
  rail: CROSS_PATH.x,
  warehouse: WAREHOUSE.x - 5,
  substation: SUBSTATION.x,
}

export function buildStreet(ctx) {
  const out = { lights: 0 }
  // ---- heating main --------------------------------------------------------------------------
  safe('heat main', () => {
    placeHeatPipe(ctx, { points: HEAT.fromBoiler, arches: HEAT.archFence, seed: 1401 })
    placeHeatPipe(ctx, { points: HEAT.west, arches: HEAT.archesWest, seed: 1402 })
    placeHeatPipe(ctx, { points: HEAT.east, arches: HEAT.archesEast, seed: 1403 })
    // chambers where the main dives underground at both ends
    const wEnd = HEAT.west[HEAT.west.length - 1], eEnd = HEAT.east[HEAT.east.length - 1]
    ctx.world.place('north_chamber', { x: wEnd[0], z: wEnd[1], rot: 2, tag: 'heat_pipe' })
    ctx.world.place('north_chamber', { x: eEnd[0], z: eEnd[1], rot: 0, tag: 'heat_pipe' })
    // a leaking joint east of the platform path: steam and a thawed muddy patch under it
    const lx = 337, lz = VERGE.pipe
    ctx.terrain.paintCircle(lx, lz + 0.3, 1.7, { mat: ctx.M('earth'), only: new Set([ctx.M('snow'), ctx.M('snow_fresh'), ctx.M('snow_dirty')]) })
    ctx.terrain.paintCircle(lx, lz + 0.3, 2.6, { mat: ctx.M('snow_dirty'), only: new Set([ctx.M('snow'), ctx.M('snow_fresh')]) })
    ;(ctx.registry.steamVents ||= []).push({ x: lx, y: 2.0, z: lz, strength: 0.75, kind: 'heatpipe', auto: false })
    out.leak = { x: lx, y: 2.0, z: lz }
    // the underground main crosses the street at the west chamber: steaming manholes in a line
    for (const [mx, mz, s] of [[wEnd[0] - 1.2, 136.6, 0.5], [wEnd[0] - 2.0, 144.6, 0.8]]) placeManhole(ctx, { x: mx, z: mz, wet: true, steam: s })
    placeManhole(ctx, { x: 431.5, z: 139.0, wet: false })
    placeManhole(ctx, { x: 214.5, z: 135.2, wet: false })
  })

  // ---- lamps on the south sidewalk, heads reaching north over the road ---------------------------
  safe('street lamps', () => {
    const L = [
      [34, 'cobra'], [66.5, 'cobra'], [104, 'cobra'], [136.6, 'cobra', { flyers: true }],
      [172, 'courtyard'], [207, 'cobra', { flicker: 'cycle' }], [242, 'courtyard'], [277, 'courtyard'],
      [312, 'cobra'], [347, 'courtyard'], [382, 'courtyard', { broken: true }], [417, 'cobra'],
      [451.5, 'courtyard', { flicker: 'buzz' }], [487, 'cobra', { broken: true }], [516.5, 'courtyard'], [552, 'cobra', { flyers: true }], [587, 'courtyard'],
    ]
    L.forEach(([x, type, extra = {}], i) => {
      const r = placeStreetLamp(ctx, {
        x, z: WALK.z1 - 0.45, angle: PI, type, bulb: type === 'courtyard' ? 'mercury' : undefined, pole: type === 'courtyard' ? 'concrete' : undefined,
        broken: false, flicker: false, flyers: false, seed: 1500 + i, ...extra,
      })
      if (r?.light) out.lights++
    })
  })

  // ---- the bus stop «Платформа «Заводская»» (eastbound) and its westbound pole ------------------
  safe('bus stop', () => {
    out.stop = placeBusStop(ctx, {
      x: STOP.x, z: STOP.z, angle: PI, kind: 'bus', name: STOP.name, routes: ['276'], from: 'Платформа «Заводская»', to: 'Ст. м. «Заречная»',
      lit: true, seed: 1601, ad: 'megalink',
    })
    if (out.stop?.light) out.lights++
    placeStopPole(ctx, { x: STOP.x + 7.5, z: ROAD.z0 - 1.0, angle: HALF_PI, kind: 'bus', name: STOP.name, routes: ['276'], from: 'Ст. м. «Заречная»', to: 'Платформа «Заводская»' })
    placeLitterBin(ctx, { x: STOP.x - 4.2, z: WALK.z1 - 0.55, angle: PI, type: 'concrete' })
    // a payphone by the stop, its receiver hanging on the cord
    placePayphone(ctx, { x: STOP.x - 7.2, z: WALK.z1 - 0.4, angle: PI, offhook: true })
    addNoticeCluster(ctx, { x: STOP.x + 7.5, y: 1.55, z: ROAD.z0 - 1.0 + 0.14, angle: 0, w: 0.22, h: 0.7, count: 3, kinds: ['notice', 'ad'], subs: ['tearoff'], seed: 1602 })
  })

  // ---- small things along the sidewalk -----------------------------------------------------------
  safe('street furniture', () => {
    for (const [x, t] of [[102.5, 'metal'], [246, 'concrete'], [420.5, 'metal'], [548.5, 'concrete']]) placeLitterBin(ctx, { x, z: WALK.z1 - 0.5, angle: PI, type: t })
    addPoleFlyer(ctx, { x: 104, z: WALK.z1 - 0.45 - 0.14, y: 1.5, angle: 0, seed: 1611 })
    addPoleFlyer(ctx, { x: 312, z: WALK.z1 - 0.45 - 0.14, y: 1.45, angle: 0, seed: 1612 })
    // street name plates on the corner lamp and on the yard fences
    addPlate(ctx, { x: 136.6, y: 2.6, z: WALK.z1 - 0.45 + 0.27, angle: 0, id: 'street_zavodskaya', w: 0.8 })
    addPlate(ctx, { x: 204.0 - 2.6, y: 1.55, z: VERGE.fence + 0.15, angle: 0, id: 'street_zavodskaya', w: 0.8 })
    addPlate(ctx, { x: 470.0, y: 1.6, z: VERGE.fence + 0.16, angle: 0, id: 'street_zavodskaya', w: 0.8 })
    // «дети» sign before the school side, «no stopping» by the warehouse gate
    placeRoadSign(ctx, { x: 166.5, z: WALK.z0 + 0.4, angle: -HALF_PI, type: 'children' })
    placeRoadSign(ctx, { x: 380.0, z: ROAD.z0 - 0.9, angle: HALF_PI, type: 'nostopping' })
  })

  // ---- poplars on the verge in front of the garage fence (west of the heating main) -------------
  safe('verge trees', () => {
    placeTreeRow(ctx, {
      x0: 46, z0: 127.2, x1: 152, z1: 127.2, spacing: 9.5, species: { 'poplar:pollarded': 0.75, 'poplar:natural': 0.25 }, jitter: 0.6, missing: 0.12, seed: 1621,
      skip: (x) => x > GSK.gate[0] - 4 && x < GSK.gate[1] + 4,
    })
  })

  // ---- a few cars by the north kerb (nobody drives here at night) ---------------------------------
  safe('parked cars', () => {
    const cars = [
      { x: 96, type: 'vaz2107', snow: 'buried' }, { x: 108.5, type: 'moskvich2141', snow: 'heavy' },
      { x: 232, type: 'gazelle_van', snow: 'heavy' }, { x: 356, type: 'vaz2106', snow: 'heavy' },
      { x: 404, type: 'volga3110', snow: 'brushed' }, { x: 576, type: 'uaz452', snow: 'buried' },
    ]
    cars.forEach((c, i) => placeParkedCar(ctx, { x: c.x, z: ROAD.z0 + 1.15, angle: c.x % 2 ? HALF_PI : -HALF_PI, type: c.type, snow: c.snow, seed: 1630 + i }))
  })

  // ---- plough banks (after the road is painted; gaps where people cross) ---------------------------
  safe('banks', () => {
    const rel = (gaps, x0) => gaps.map(([a, b]) => [a - x0, b - x0])
    const nGaps = [
      [GSK.gate[0] - 2.5, GSK.gate[1] + 2.5], [CROSS.boilerDoor - 2.4, CROSS.boilerDoor + 2.4], [BOILER.gate[0] - 2, BOILER.gate[1] + 2],
      [STOP.x + 4.5, CROSS.rail + 3.5], [WAREHOUSE.x - 11, WAREHOUSE.x + 0.5], [SUBSTATION.x - 3.5, SUBSTATION.x + 3.5],
      [BER.x0 - 1, BER.x1 + 1],
    ]
    snowBank(ctx, ROAD.x0, ROAD.z0 - 2.25, ROAD.x1, ROAD.z0 - 0.05, 0.95, { seed: 1701, dirtySide: 's', gaps: rel(nGaps, ROAD.x0) })
    const sGaps = [
      [GSK.gate[0] - 3, BER.x1 + 1.5], [STOP.x - 4.5, CROSS.rail + 3.5],
      [CROSS.boilerDoor - 2.4, CROSS.boilerDoor + 2.4], [BOILER.gate[0] - 1, BOILER.gate[1] + 1],
      [WAREHOUSE.x - 11, WAREHOUSE.x + 0.5], [SUBSTATION.x - 3.5, SUBSTATION.x + 3.5],
      [DRIVES[0][0] - 1.5, DRIVES[0][1] + 1.5], [DRIVES[1][0] - 1.5, DRIVES[1][1] + 1.5],
      [GATES.north.x - 3, GATES.north.x + 3], [36, 39], [176, 179], [214, 217], [350, 353], [497, 500], [561, 564], [600, 603],
    ]
    snowBank(ctx, ROAD.x0, ROAD.z1 + 0.05, ROAD.x1, ROAD.z1 + 1.3, 0.55, { seed: 1702, dirtySide: 'n', chunks: false, gaps: rel(sGaps, ROAD.x0) })
    // where the plough turned at the Берёзовая corner
    plowedPile(ctx, BER.x0 - 3.8, ROAD.z0 - 3.2, { radius: 2.6, height: 1.9, seed: 1711, buried: 'tire' })
  })

  // ---- nav: the sidewalk, crossings to the yard gates and the way to the platform -----------------
  const W = WALK.line
  nav(ctx, [[24.5, W], [GATES.north.x, W], [GATES.main.x, W], [BER.x0 - 0.3, W]], 'sidewalk')
  nav(ctx, [[BER.x0 - 0.3, W], [BER.x1 + 0.6, W]], 'crossing')
  nav(ctx, [[BER.x1 + 0.6, W], [150.2, W], [CROSS.boilerDoor, W], [STOP.x - 6.5, W], [STOP.x - 4.5, WALK.z1 + 1.0], [STOP.x + 4.5, WALK.z1 + 1.0], [STOP.x + 6.5, W], [CROSS.rail, W], [305, W], [CROSS.warehouse, W], [459, W], [CROSS.substation, W], [615.5, W]], 'sidewalk')
  nav(ctx, [[GATES.main.x, W], [CROSS.gsk + 1.5, ROAD.z1 - 0.4], [CROSS.gsk, ROAD.z0 - 1.2], [CROSS.gsk, VERGE.fence + 0.6]], 'crossing')
  nav(ctx, [[CROSS.boilerDoor, W], [CROSS.boilerDoor, ROAD.z0 - 1.2], [CROSS.boilerDoor, VERGE.fence + 0.9]], 'crossing')
  nav(ctx, [[CROSS.rail, W], [CROSS.rail, ROAD.z1 - 0.4], ...CROSSING_TRAIL], 'crossing')
  nav(ctx, [[CROSS.warehouse, W], [CROSS.warehouse, 136]], 'crossing')
  nav(ctx, [[CROSS.substation, W], [CROSS.substation, ROAD.z0 - 1.4], [SUBSTATION.x, 120.2]], 'crossing')
  // the vehicles package's rare crawler may use these: a car creeping along Заводская at night,
  // turning in at the warehouse gate, or into the garage cooperative and down its lanes
  ;(ctx.registry.driveways ||= []).push(
    { name: 'ул. Заводская → база', points: [[20, 140.4], [WAREHOUSE.x - 5, 140.4], [WAREHOUSE.x - 5, 132], [WAREHOUSE.x - 5, 126]] },
    { name: 'ул. Заводская → ГСК', points: [[612, 136.7], [128, 136.7], [CROSS.gsk, 131], [CROSS.gsk, 112], [CROSS.gsk, 92.3], [64, 92.3]] },
    { name: 'ГСК lanes', points: [[CROSS.gsk, 124], [CROSS.gsk, 92.3], [192.5, 92.3], [194.5, 82], [192.5, 71.4], [62, 71.4]] },
  )
  ctx.registry.streets = ctx.registry.streets || []
  ctx.registry.streets.push({ name: 'ул. Заводская', en: 'Zavodskaya St.', axis: 'x', x0: ROAD.x0, x1: ROAD.x1, z0: ROAD.z0, z1: ROAD.z1, lanes: ROAD.lanes })
  return out
}

/** Lazily turn our own steam marker (auto:false) into a plume (nature must be loaded). */
export function initStreetSteam(ctx, out) {
  try {
    if (out?.leak) addSteam(ctx, { ...out.leak, kind: 'pipe', rate: 9, opacity: 0.9, tag: 'north_leak' })
    // the boiler hall breathes through its roof ventilators (the chimney plume is the public package's)
    for (const [x, z, r] of [[263.5, 107.5, 3], [274, 111, 2.2]]) addSteam(ctx, { x, y: 13.0, z, kind: 'vent', rate: r, vel: [0.25, 0.1], tag: 'north_boiler_vent' })
  } catch { /* nature optional */ }
}

export { CROSS }
void RNG
