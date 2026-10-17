// Ground of the north district, painted before anything is placed: the railway embankment with
// ballast and sleepers, ул. Заводская (carriageway, kerbs, south sidewalk, north verge), the
// industrial yards and their access drives, the trodden way to the level crossing. The park's
// lawn and alleys are painted in park.js (after the pond has dug its bowl).

import { M } from '../../core/materials.js'
import { fbm2, valueNoise2 } from '../../core/rng.js'
import { paintRoad, paintPath } from '../base/api.js'
import { ROAD, WALK, VERGE, BER, DRIVES, RAIL, GSK, BOILER, WAREHOUSE, SUBSTATION, CROSS_PATH, PARK, STOP } from './layout.js'

const inGap = (x, gaps) => gaps.some(([a, b]) => x >= a && x < b)

/** Raised double-track embankment across the whole world (x 0–640, through the wrap bands). */
export function paintRailway(ctx) {
  const t = ctx.terrain
  const gravel = M('gravel'), snow = M('snow'), packed = M('snow_packed'), dirty = M('snow_dirty')
  const conc = M('concrete'), wood = M('wood_dark'), cdark = M('concrete_dark')
  const [zA, zB] = RAIL.tracks
  t.apply(0, RAIL.z0, 640, RAIL.z1, (x, z) => {
    // height: 0.75 on the slopes, 1.0 on the top (sleeper-top level)
    const onTop = z >= RAIL.top[0] && z < RAIL.top[1]
    const h = onTop ? 4 : 3
    let mat = snow
    if (!onTop) {
      mat = valueNoise2(x * 0.4, z * 0.9, 5) > 0.72 ? M('snow_fresh') : snow
      return { h, mat }
    }
    // ballast shoulder with snow lying on it, cleaner (wind-blown) near the rails
    const dTrack = Math.min(Math.abs(z - zA), Math.abs(z - zB))
    const n = fbm2(x * 0.35, z * 0.5, 3, 41)
    if (dTrack < 2.3) mat = n > 0.6 ? dirty : gravel
    else if (dTrack < 3.4) mat = n > 0.45 ? snow : gravel
    else mat = n > 0.3 ? snow : packed
    // sleepers every 0.75 m under each track: mostly concrete, a stretch of old wooden ones
    if (dTrack <= RAIL.sleeperHalf) {
      const k = Math.floor(x / RAIL.sleeperPitch + 1e-6)
      const along = x - k * RAIL.sleeperPitch
      if (along < 0.25) {
        const woodStretch = valueNoise2(x * 0.012, z * 0.01 + (z > 48 ? 7 : 0), 77) > 0.62
        mat = woodStretch ? wood : (valueNoise2(x * 2.1, z, 3) > 0.85 ? cdark : conc)
        // a little snow caught on the sleeper ends
        if (dTrack > 1.0 && valueNoise2(x * 1.7, z * 1.7, 9) > 0.55) mat = snow
      }
    }
    return { h, mat }
  })
}

/** ул. Заводская: north verge (yard fences, heat pipe), carriageway, kerbs, south sidewalk. */
export function paintStreet(ctx) {
  const t = ctx.terrain
  const packed = M('snow_packed'), dirty = M('snow_dirty'), snow = M('snow'), ice = M('ice')
  // north verge: lawn snow behind the fences' line, a packed shoulder along the kerb
  t.apply(ROAD.x0, VERGE.fence, ROAD.x1, ROAD.z0, (x, z) => {
    if (z >= ROAD.z0 - 1.75) return { h: 1, mat: valueNoise2(x * 0.5, z, 12) > 0.5 ? dirty : packed }
    return { h: 2, mat: fbm2(x * 0.3, z * 0.3, 2, 13) > 0.6 ? M('snow_fresh') : snow }
  })
  // south sidewalk (0.25) except across ул. Берёзовая and at the driveway mouths (road level)
  t.apply(ROAD.x0, WALK.z0, ROAD.x1, WALK.z1, (x, z, h) => {
    if (x >= BER.x0 && x < BER.x1) return null
    if (h >= 4 && z > WALK.z1 - 1.2) return null // a neighbour's plough pile spilling onto the back of the walk
    const n = fbm2(x * 0.35, z * 0.35, 3, 17)
    for (const [a, b] of DRIVES) if (x >= a && x < b) return { h: 0, mat: n > 0.55 ? dirty : packed }
    let mat = packed
    if (n > 0.66) mat = snow
    else if (n < 0.3) mat = dirty
    if (valueNoise2(x * 1.3, z * 1.3, 19) > 0.94) mat = ice
    return { h: 1, mat }
  })
  // the walk swings round behind the bus-stop pavilion (a trodden pocket on the lawn edge)
  t.apply(STOP.x - 5.5, WALK.z1 - 0.25, STOP.x + 6.5, WALK.z1 + 2.1, (x, z) => ({ h: 1, mat: valueNoise2(x * 0.9, z * 0.9, 18) > 0.55 ? dirty : packed }))
  // the carriageway (curb rows: the verge shoulder on the north, the sidewalk's first row south)
  paintRoad(ctx, { axis: 'x', x0: ROAD.x0, z0: ROAD.z0, x1: ROAD.x1, z1: ROAD.z1, lanes: ROAD.lanes, laneWidth: 3.4, banks: false, seed: 1381 })
  // Берёзовая's west kerb meets the sidewalk at kerb height (not the 0.5 m lawn) so it can be crossed
  t.apply(BER.x0, WALK.z0, BER.x0 + 0.25, WALK.z1, () => ({ h: 1, mat: M('curb') }))
  // no kerb across Берёзовая's mouth or the driveway mouths
  t.apply(BER.x0, ROAD.z1, BER.x1, ROAD.z1 + 0.25, () => null)
  for (const [a, b] of DRIVES) t.paintRect(a, ROAD.z1, b, ROAD.z1 + 0.25, dirty)
  // access drives through the verge (road level): garage cooperative, boiler house, warehouse base
  const drive = (x0, x1, seed) => {
    t.apply(x0, VERGE.fence - 0.5, x1, ROAD.z0, (x, z) => {
      const c = (x0 + x1) / 2
      const rut = Math.abs(Math.abs(x - c) - 0.85) < 0.3
      return { h: 0, mat: rut ? dirty : (valueNoise2(x, z, seed) > 0.7 ? M('slush') : packed) }
    })
  }
  drive(GSK.gate[0] - 0.5, GSK.gate[1] + 0.5, 21)
  drive(BOILER.gate[0] - 0.5, BOILER.gate[1] + 0.5, 22)
  drive(WAREHOUSE.x - 9, WAREHOUSE.x - 1.5, 23) // the base gate is 5 m west of the shed centre (rot 2)
}

/** Yards of the industrial edge (packed snow at 0.25 inside the fences). */
export function paintYards(ctx) {
  const t = ctx.terrain
  const packed = M('snow_packed'), dirty = M('snow_dirty'), snow = M('snow')
  const yard = (x0, z0, x1, z1, seed, clean = 0.5) => t.apply(x0, z0, x1, z1, (x, z) => {
    const n = fbm2(x * 0.18, z * 0.18, 3, seed)
    return { h: n > 0.78 ? 2 : 1, mat: n > clean ? snow : n < 0.25 ? dirty : packed }
  })
  // garage cooperative: lanes are packed, the rest snowy; rows flatten their own footprints
  yard(GSK.x0 + 0.5, GSK.z0 + 0.5, GSK.x1 - 0.5, GSK.z1 - 0.25, 31, 0.62)
  // boiler house yard
  yard(BOILER.yard[0] + 0.5, BOILER.yard[1] + 0.5, BOILER.yard[2] - 0.5, BOILER.yard[3] - 0.25, 32, 0.6)
  // warehouse base
  yard(WAREHOUSE.yard[0] + 0.5, WAREHOUSE.yard[1] + 0.5, WAREHOUSE.yard[2] - 0.5, WAREHOUSE.yard[3] - 0.25, 33, 0.58)
  // a trodden path from the street to the substation door
  paintPath(ctx, { points: [[SUBSTATION.x + 0.3, ROAD.z0 - 1.6], [SUBSTATION.x - 0.4, 125.5], [SUBSTATION.x, 119.6]], width: 1.3, wobble: 0.3, seed: 34 })
}

/** The trodden way from the street to the crossing and on into the white field north of the line. */
export const CROSSING_TRAIL = [
  [CROSS_PATH.x - 1.2, ROAD.z0 - 1.5], [CROSS_PATH.x - 0.4, 118], [CROSS_PATH.x + 1.1, 96], [CROSS_PATH.x + 0.2, 74],
  [CROSS_PATH.x - 0.3, RAIL.fenceZ + 1.5], [CROSS_PATH.x, RAIL.z1 + 1.6],
]
export const NORTH_TRAIL = [[CROSS_PATH.x, RAIL.z0 + 0.1], [CROSS_PATH.x + 1.5, 34], [CROSS_PATH.x + 4, 26], [CROSS_PATH.x + 5, 18]]

export function paintCrossingPath(ctx) {
  const t = ctx.terrain
  paintPath(ctx, { points: CROSSING_TRAIL, width: 1.5, wobble: 0.5, seed: 41 })
  // up the embankment in 0.25 m steps: 0.5 at its foot, 0.75 on the slope, 1.0 on the top
  t.apply(CROSS_PATH.x - 1.2, RAIL.top[1] - 0.25, CROSS_PATH.x + 1.2, RAIL.z1 + 1.5, (x, z) => ({ h: z < RAIL.top[1] ? 4 : z < RAIL.z1 ? 3 : 2, mat: M('snow_packed') }))
  t.apply(CROSS_PATH.x - 1.0, RAIL.z0, CROSS_PATH.x + 1.0, RAIL.top[0] + 0.25, (x, z) => ({ h: z < RAIL.top[0] ? 3 : 4, mat: M('snow_packed') }))
  // north of the line: a narrow trodden track through the deep snow (no step down), into the whiteout
  for (let i = 0; i < NORTH_TRAIL.length - 1; i++) t.paintLine(NORTH_TRAIL[i][0], NORTH_TRAIL[i][1], NORTH_TRAIL[i + 1][0], NORTH_TRAIL[i + 1][1], 0.9, { mat: M('snow_packed'), height: 0.5 })
  ctx.footprints?.addTrail(NORTH_TRAIL.map(([x, z]) => [x + 0.2, z]), t, 0.6)
  ctx.footprints?.addTrail(CROSSING_TRAIL.map(([x, z]) => [x + 0.25, z]), t, 0.35)
}

/** Park lawn: undulating snow, deeper drifts toward the open west. */
export function paintParkLawn(ctx) {
  const snow = M('snow'), fresh = M('snow_fresh')
  ctx.terrain.apply(PARK.x0 - 8, PARK.z0, PARK.x1, PARK.z1, (x, z) => {
    const n = fbm2(x * 0.06, z * 0.06, 3, 51)
    const west = x < 46 ? (46 - x) / 22 : 0
    const h = n + west * 0.35 > 0.64 ? 3 : 2
    return { h, mat: fbm2(x * 0.45, z * 0.45, 2, 52) > 0.56 ? fresh : snow }
  })
  // a narrow packed footing under the east fence, between the lawn and Берёзовая's kerb
  ctx.terrain.apply(PARK.x1 - 0.25, PARK.z0, BER.x0, PARK.z1, (x, z) => ({ h: 2, mat: valueNoise2(x, z * 0.7, 53) > 0.6 ? M('snow_dirty') : M('snow_bank') }))
}

export { inGap }
