// Ground of проспект Строителей: carriageways with slush ruts, kerbs, the snowy median, both
// sidewalks with their lawn strips, the tree strip, the south strip, the bus-terminal loop, the
// lay-by, the kiosk forecourt and the trodden paths. Banks and windrows are raised afterwards
// (raiseBanks) so props that should be half-buried can be placed in between.

import { M } from '../../core/materials.js'
import { fbm2, valueNoise2 } from '../../core/rng.js'
import { paintRoad, paintSidewalk, paintDriveway, paintPath, paintYard } from '../base/api.js'
import { snowBank, plowedPile } from '../nature/api.js'
import {
  Z, LANES_W, LANES_E, METRO, BEREZOVAYA, DRIVEWAYS, PASSAGES, ZEBRA, LAYBY, PLAZA, STOP_N, STOP_S,
  ROW, ROW_Z, TERM, safe,
} from './layout.js'

const V = 0.25
/** The world split around the metro footprint. */
const SPANS = [[0, METRO.x0], [METRO.x1, 640]]

/** Ranges [a, b] minus holes → list of [a, b] pieces. */
function cut(a, b, holes) {
  let parts = [[a, b]]
  for (const [h0, h1] of holes) {
    const next = []
    for (const [p0, p1] of parts) {
      if (h1 <= p0 || h0 >= p1) { next.push([p0, p1]); continue }
      if (h0 > p0) next.push([p0, h0])
      if (h1 < p1) next.push([h1, p1])
    }
    parts = next
  }
  return parts.filter(([p0, p1]) => p1 - p0 > 0.2)
}

/** Lawn snow at 0.5 m with gentle swells and old plough heaps (lawn strips along the kerb). */
function paintLawn(ctx, x0, z0, x1, z1, seed) {
  const snow = M('snow'), fresh = M('snow_fresh'), bank = M('snow_bank'), dirty = M('snow_dirty')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    const n = fbm2(x * 0.11, z * 0.4, 3, seed)
    const g = valueNoise2(x * 0.9, z * 0.9, seed + 3)
    // swells only away from the edges, so a lawn meets the walk with a one-voxel step
    let h = n > 0.64 && Math.min(z - z0, z1 - z) > 0.9 ? 3 : 2
    let mat = g > 0.58 ? fresh : snow
    if (n > 0.7) mat = bank
    // grey spray from passing cars on the side facing the road
    const toRoad = Math.min(Math.abs(z - Z.N_CURB), Math.abs(z - Z.S_CURB))
    if (toRoad < 1.6 && g < 0.5) mat = dirty
    return { h, mat }
  })
}

/** Paved, trampled forecourt (more slush and grey snow than an ordinary sidewalk). */
function paintTrampled(ctx, x0, z0, x1, z1, seed) {
  const packed = M('snow_packed'), dirty = M('snow_dirty'), slush = M('slush'), ice = M('ice')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z) => {
    // finer grain than the walks, and less slush: big dark blotches read as puddles of tar
    const n = fbm2(x * 0.45, z * 0.45, 3, seed)
    const g = valueNoise2(x * 1.4, z * 1.4, seed + 7)
    let mat = packed
    if (n < 0.34) mat = dirty
    if (n < 0.2) mat = slush
    if (g > 0.95) mat = ice
    return { h: 1, mat }
  })
}

/** Worn zebra stripes (stripes run along the traffic, 0.5 m wide, 0.5 m apart). */
function paintZebra(ctx, x0, x1, z0, z1, axis = 'x', seed = 5) {
  const mark = M('road_marking')
  ctx.terrain.apply(x0, z0, x1, z1, (x, z, hv, mat) => {
    const across = axis === 'x' ? z : x
    const ph = ((across - (axis === 'x' ? z0 : x0)) % 1 + 1) % 1
    if (ph >= 0.5) return null
    // paint worn ~45 % away by studs and slush
    const w = valueNoise2(x * 1.7, z * 1.7, seed) * 0.7 + valueNoise2(x * 5, z * 5, seed + 1) * 0.3
    if (w < 0.42) return null
    return { mat: mark }
  })
}

/** Everything flat: roads, kerbs, median, sidewalks, lawns, forecourts, terminal, paths. */
export function paintGround(ctx) {
  const T = ctx.terrain
  const curb = M('curb'), snow = M('snow'), dirty = M('snow_dirty'), packed = M('snow_packed'), bankM = M('snow_bank')

  // ---- tree strip (z 500–508): lawn snow; the metro footprint begins at z 504 ----------------
  safe('tree strip', () => {
    for (const [a, b] of SPANS) paintYard(ctx, a, Z.TREES[0], b, Z.TREES[1], 31)
    paintYard(ctx, METRO.x0, Z.TREES[0], METRO.x1, METRO.z0, 32)
  })

  // ---- north sidewalk band z 508–524 --------------------------------------------------------
  safe('north sidewalk', () => {
    for (const [a, b] of SPANS) paintSidewalk(ctx, a, Z.N_SIDE[0], b, Z.N_SIDE[1], 13)
    // the strip at 508–509 is where the cleared snow goes (bank raised later): lawn under it
    for (const [a, b] of SPANS) paintLawn(ctx, a, Z.N_SIDE[0], b, Z.N_WALK[0] - 0.25, 17)
    // lawn strip between the walk and the kerb, with paved openings
    const holes = [
      [BEREZOVAYA.x0 - 2, BEREZOVAYA.x1 + 2],
      [STOP_N.x - 14, STOP_N.x + 14],
      [DRIVEWAYS[0].x0 - 4, DRIVEWAYS[0].x1 + 4],
      [DRIVEWAYS[1].x0 - 4, DRIVEWAYS[1].x1 + 4],
      [METRO.x0 - 18, METRO.x1 + 16],
      [ZEBRA.x0 - 2.5, ZEBRA.x1 + 2.5],
    ]
    for (const [a, b] of cut(0, 640, holes)) paintLawn(ctx, a, Z.N_LAWN[0], b, Z.N_LAWN[1], 19)
    // a few trodden short-cuts across the lawn strip toward the kerb (people cross mid-block)
    for (const x of [96, 196, 336, 425, 588]) paintPath(ctx, { points: [[x, Z.N_WALK[1] - 0.5], [x + 1.2, Z.N_LAWN[1] + 0.6]], width: 1.1, wobble: 0.2, seed: x })
  })

  // ---- carriageways (y 0) ---------------------------------------------------------------------
  safe('roads', () => {
    for (const [a, b] of SPANS) {
      paintRoad(ctx, { axis: 'x', x0: a, x1: b, z0: Z.ROAD_W[0], z1: Z.ROAD_W[1], lanes: LANES_W, banks: false, seed: 71 })
      paintRoad(ctx, { axis: 'x', x0: a, x1: b, z0: Z.ROAD_E[0], z1: Z.ROAD_E[1], lanes: LANES_E, banks: false, seed: 73 })
    }
  })

  // ---- median (y 0.25, kerbs both sides) ------------------------------------------------------
  safe('median', () => {
    for (const [a, b] of SPANS) {
      T.apply(a, Z.MEDIAN[0], b, Z.MEDIAN[1], (x, z) => {
        const n = valueNoise2(x * 0.6, z * 1.5, 77)
        return { h: 1, mat: n > 0.55 ? bankM : n > 0.3 ? dirty : snow }
      })
      T.paintRect(a, Z.MEDIAN[0], b, Z.MEDIAN[0] + V, curb)
      T.paintRect(a, Z.MEDIAN[1] - V, b, Z.MEDIAN[1], curb)
    }
  })

  // ---- south sidewalk band z 556–572 ---------------------------------------------------------
  safe('south sidewalk', () => {
    for (const [a, b] of SPANS) paintSidewalk(ctx, a, Z.S_SIDE[0], b, Z.S_SIDE[1], 23)
    for (const [a, b] of SPANS) T.paintRect(a, Z.S_CURB, b, Z.S_CURB + V, curb)
    for (const [a, b] of SPANS) paintLawn(ctx, a, Z.S_WALK[1] + 0.25, b, Z.S_SIDE[1], 27)
    const holes = [
      [STOP_S.x - 11, STOP_S.x + 13],
      [METRO.x0 - 22, METRO.x0],
      [PLAZA.x0, PLAZA.x1],
      [ZEBRA.x0 - 2.5, ZEBRA.x1 + 2.5],
      [524, 548], [586, 610], // terminal mouths
    ]
    for (const [a, b] of cut(0, 640, holes)) paintLawn(ctx, a, Z.S_LAWN[0], b, Z.S_LAWN[1], 29)
    for (const x of [118, 205, 560]) paintPath(ctx, { points: [[x, Z.S_WALK[0] + 0.5], [x - 1, Z.S_LAWN[0] - 0.6]], width: 1.1, wobble: 0.2, seed: x })
  })

  // ---- south strip z 572–600 (lawn snow) -----------------------------------------------------
  safe('south strip', () => {
    paintYard(ctx, 0, Z.STRIP[0], METRO.x0, Z.STRIP[1], 35)
    paintYard(ctx, METRO.x0, METRO.z1, METRO.x1, Z.STRIP[1], 36)
    paintYard(ctx, METRO.x1, Z.STRIP[0], 640, Z.STRIP[1], 37)
  })

  // ---- ул. Берёзовая mouth (the street itself is blocks_west's; repainted here so the sidewalk
  //      meets it even when that package is absent) -------------------------------------------
  safe('berezovaya mouth', () => {
    paintSidewalk(ctx, BEREZOVAYA.x1, Z.TREES[0], BEREZOVAYA.walk1, Z.N_SIDE[0], 82)
    paintRoad(ctx, { axis: 'z', x0: BEREZOVAYA.x0, x1: BEREZOVAYA.x1, z0: Z.TREES[0], z1: Z.N_CURB, lanes: BEREZOVAYA.lanes, laneWidth: 3.4, banks: false, seed: 81 })
    paintZebra(ctx, BEREZOVAYA.x0 + 0.5, BEREZOVAYA.x1 - 0.5, 510.5, 515, 'z', 83)
  })

  // ---- driveway mouths into the blocks (blocks paint the rest) ---------------------------------
  safe('driveway mouths', () => {
    for (const d of DRIVEWAYS) {
      const cx = (d.x0 + d.x1) / 2
      paintDriveway(ctx, { points: [[cx, Z.TREES[0]], [cx, Z.N_CURB]], width: d.x1 - d.x0, banks: false, seed: 90 + cx })
      // kerb cells either side where the mouth meets the raised sidewalk
      T.paintRect(d.x0 - V, Z.N_SIDE[0], d.x0, Z.N_CURB, curb)
      T.paintRect(d.x1, Z.N_SIDE[0], d.x1 + V, Z.N_CURB, curb)
    }
  })

  // ---- spawn stop: paved to the kerb, trampled slush where people wait ------------------------
  safe('stop platforms', () => {
    paintTrampled(ctx, STOP_N.x - 14, Z.N_LAWN[0], STOP_N.x + 14, Z.N_CURB - V, 51)
    paintTrampled(ctx, STOP_S.x - 11, Z.S_CURB + V, STOP_S.x + 13, Z.S_LAWN[1], 53)
  })

  // ---- metro approaches: fully paved, trampled -------------------------------------------------
  safe('metro approaches', () => {
    paintTrampled(ctx, METRO.x0 - 18, Z.N_WALK[0], METRO.x0, Z.N_CURB - V, 55)
    paintTrampled(ctx, METRO.x1, Z.N_WALK[0], METRO.x1 + 16, Z.N_CURB - V, 56)
    paintTrampled(ctx, METRO.x0 - 22, Z.S_CURB + V, METRO.x0, Z.S_WALK[1], 57)
    // the south stairs come up facing south: a trampled apron in front of them (z 572–578; the
    // metro package paints its footprint only to z 572), joining the forecourt and the paths
    paintTrampled(ctx, METRO.x0 - 3, Z.S_SIDE[1], METRO.x1, 578, 58)
  })

  // ---- kiosk / shop forecourt -------------------------------------------------------------------
  safe('plaza', () => {
    paintTrampled(ctx, PLAZA.x0, Z.S_CURB + V, PLAZA.x1, PLAZA.z1, 61)
    // grey slush fan where the underpass spits people out
    T.apply(METRO.x1, 568, METRO.x1 + 14, 577, (x, z) => {
      const n = valueNoise2(x * 0.8, z * 0.8, 63)
      return n > 0.45 ? { mat: n > 0.7 ? M('slush') : dirty } : null
    })
  })

  // ---- zebra (x ≈ 512): stripes, flat median gap, paved landings ---------------------------------
  safe('zebra', () => {
    paintZebra(ctx, ZEBRA.x0, ZEBRA.x1, Z.ROAD_W[0] + 0.5, Z.ROAD_W[1] - 0.25, 'x', 91)
    paintZebra(ctx, ZEBRA.x0, ZEBRA.x1, Z.ROAD_E[0] + 0.25, Z.ROAD_E[1] - 0.5, 'x', 92)
    T.apply(ZEBRA.x0 - 0.5, Z.MEDIAN[0] + V, ZEBRA.x1 + 0.5, Z.MEDIAN[1] - V, () => ({ h: 1, mat: packed }))
    paintTrampled(ctx, ZEBRA.x0 - 2.5, Z.N_LAWN[0], ZEBRA.x1 + 2.5, Z.N_CURB - V, 93)
    paintTrampled(ctx, ZEBRA.x0 - 2.5, Z.S_CURB + V, ZEBRA.x1 + 2.5, Z.S_LAWN[1], 94)
  })

  // ---- taxi lay-by (карман) by the underpass, south side --------------------------------------
  safe('layby', () => {
    paintRoad(ctx, { axis: 'x', x0: LAYBY.x0, x1: LAYBY.x1, z0: Z.S_CURB, z1: LAYBY.z1, lanes: [557.9], banks: false, curb: false, seed: 97 })
    T.paintRect(LAYBY.x0, LAYBY.z1, LAYBY.x1, LAYBY.z1 + V, curb)
    T.paintRect(LAYBY.x0 - V, Z.S_CURB, LAYBY.x0, LAYBY.z1 + V, curb)
    T.paintRect(LAYBY.x1, Z.S_CURB, LAYBY.x1 + V, LAYBY.z1 + V, curb)
  })

  // ---- bus terminal ----------------------------------------------------------------------------
  safe('terminal', () => paintTerminal(ctx))

  // ---- south 9-storey row: paved apron under the buildings and in front of the porches ---------
  safe('row aprons', () => {
    for (const b of ROW) {
      const len = b.sections * (b.series === '1515' ? 26.5 : 27)
      paintTrampled(ctx, b.x - len - 1, ROW_Z - 13, b.x + 1, ROW_Z + 3, 100 + b.seed)
      // keep fresh snow look in the apron behind (avenue side)
      T.apply(b.x - len - 1, ROW_Z - 13, b.x + 1, ROW_Z - 11.5, () => ({ mat: snow }))
    }
  })

  // ---- trodden paths -----------------------------------------------------------------------------
  safe('paths', () => paintPaths(ctx))
}

/** Loop road, bays, mouths, platform and island of the конечная. */
function paintTerminal(ctx) {
  const T = ctx.terrain
  const curb = M('curb')
  // mouths across the south sidewalk (y 0)
  paintDriveway(ctx, { points: [[530.5, 554.6], [535, 559.25], [538, 566], [538, 574]], width: 8, banks: false, seed: 111 })
  paintDriveway(ctx, { points: [[592, 574], [592, 566], [596, 559.25], [600.5, 554.6]], width: 8, banks: false, seed: 113 })
  // the loop
  paintDriveway(ctx, { points: TERM.loop, width: 7.5, banks: false, seed: 115 })
  // layover bays beside the loop (island side)
  T.apply(TERM.trolleyBay.x - 12, TERM.trolleyBay.z - 2, TERM.trolleyBay.x + 20, TERM.trolleyBay.z + 2.5, () => ({ h: 0, mat: M('snow_packed') }))
  T.apply(TERM.busBay.x - 1.75, 572, TERM.busBay.x + 2.5, TERM.busBay.z + 8, () => ({ h: 0, mat: M('snow_packed') }))
  // tyre-polished ice and slush at the stand where buses idle
  T.apply(TERM.stand[0] - 1.6, TERM.stand[1] - 6, TERM.stand[0] + 1.6, TERM.stand[1] + 6, (x, z) => {
    const n = valueNoise2(x * 1.1, z * 1.1, 117)
    return n > 0.62 ? { mat: M('ice') } : n < 0.3 ? { mat: M('slush') } : null
  })
  // platform (y 0.25) with a kerb toward the loop
  const P = TERM.platform
  paintSidewalk(ctx, P.x0, P.z0, P.x1, P.z1, 119)
  T.paintRect(P.x1 - V, P.z0, P.x1, P.z1, curb)
  // island: raised kerb ring, deep snow inside
  const I = TERM.island
  T.apply(I.x0, I.z0, I.x1, I.z1, (x, z) => {
    const edge = x < I.x0 + V || x > I.x1 - V || z > I.z1 - V
    if (edge) return { h: 1, mat: curb }
    const n = fbm2(x * 0.12, z * 0.12, 3, 121)
    return { h: n > 0.6 ? 3 : 2, mat: n > 0.66 ? M('snow_fresh') : M('snow') }
  })
}

/** Footpaths: into the courtyards, through the row, along the porches, from the underpass. */
function paintPaths(ctx) {
  // north: through the tree strip into Block D (228) and Block F (540)
  // (a paved mouth where the passage leaves the sidewalk — blocks_west paves x ± 2.5 down to z 508)
  for (const x of PASSAGES) paintSidewalk(ctx, x - 2.5, 506, x + 2.5, Z.N_WALK[0], 40 + x)
  for (const x of PASSAGES) paintPath(ctx, { points: [[x, Z.N_WALK[0] + 0.3], [x + 0.6, 504], [x - 0.4, Z.TREES[0] - 0.5]], width: 1.6, wobble: 0.5, seed: x })
  // metro's two footpaths north of the stairs end at z 504: carry them through the strip
  paintPath(ctx, { points: [[378.4, 504.2], [377.6, 499.5]], width: 1.6, wobble: 0.3, seed: 61 })
  paintPath(ctx, { points: [[391.8, 504.2], [392.6, 499.5]], width: 1.6, wobble: 0.3, seed: 62 })
  // south: gaps of the 9-storey row → along the porches (entrance side)
  paintPath(ctx, { points: [[163, Z.S_WALK[1] - 0.2], [162, 584], [163.5, 598.2]], width: 1.5, wobble: 0.6, seed: 163 })
  paintPath(ctx, { points: [[294, Z.S_WALK[1] - 0.2], [292.5, 586], [294, 598.2]], width: 1.5, wobble: 0.6, seed: 294 })
  paintPath(ctx, { points: [[46, 598.2], [152.5, 598.2]], width: 1.5, wobble: 0.35, seed: 401 })
  paintPath(ctx, { points: [[152.5, 598.2], [280.5, 598.2]], width: 1.5, wobble: 0.35, seed: 402 })
  paintPath(ctx, { points: [[280.5, 598.2], [362.5, 598.2]], width: 1.5, wobble: 0.35, seed: 403 })
  // from the sidewalk by the SW underpass exit round the east end of д. 31 to its porches
  paintPath(ctx, { points: [[372.6, 570.4], [372, 584], [366, 592], [362.5, 598.2]], width: 1.5, wobble: 0.7, seed: 377 })
  paintPath(ctx, { points: [[379, 575], [372.4, 580.5]], width: 1.3, wobble: 0.3, seed: 378 })
  // behind the kiosks to the courtyard of д. 31 / the garbage area
  paintPath(ctx, { points: [[396.8, 578], [396, 588], [386, 595]], width: 1.2, wobble: 0.6, seed: 399 })
  // east yard: from the pharmacy round the back to the terminal platform
  paintPath(ctx, { points: [[486, 574.5], [505, 581], [527.6, 582.9]], width: 1.3, wobble: 0.8, seed: 501 })
}

/** Windrows on the carriageway edges, the median ridge, banks of cleared sidewalk snow, piles. */
export function raiseBanks(ctx) {
  // windrow against the north kerb, on the road (gaps at the stop, mouths, zebra, now and then)
  safe('north windrow', () => {
    const gapsAbs = [
      [BEREZOVAYA.x0 - 3, BEREZOVAYA.x1 + 3], [STOP_N.x - 12, STOP_N.x + 9],
      [DRIVEWAYS[0].x0 - 3, DRIVEWAYS[0].x1 + 3], [DRIVEWAYS[1].x0 - 3, DRIVEWAYS[1].x1 + 3],
      [ZEBRA.x0 - 3, ZEBRA.x1 + 3], [86, 89], [198, 201], [338, 341], [427, 430], [566, 569], [590, 593],
    ]
    for (const [a, b] of SPANS) {
      const gaps = gapsAbs.filter(([g0, g1]) => g1 > a && g0 < b).map(([g0, g1]) => [g0 - a - 0.5, g1 - a - 0.5])
      snowBank(ctx, a + 0.5, Z.N_CURB + 0.25, b - 0.5, Z.N_CURB + 1.9, 0.7, { dirtySide: 's', gaps, chunks: false, seed: 7 + a })
    }
  })
  safe('south windrow', () => {
    const gapsAbs = [
      [STOP_S.x - 9, STOP_S.x + 12], [LAYBY.x0 - 3, LAYBY.x1 + 3], [ZEBRA.x0 - 3, ZEBRA.x1 + 3],
      [520, 550], [584, 612], [418, 423], [452, 470], [64, 67], [150, 153], [232, 235], [300, 303],
    ]
    for (const [a, b] of SPANS) {
      const gaps = gapsAbs.filter(([g0, g1]) => g1 > a && g0 < b).map(([g0, g1]) => [g0 - a - 0.5, g1 - a - 0.5])
      snowBank(ctx, a + 0.5, Z.S_CURB - 1.9, b - 0.5, Z.S_CURB - 0.25, 0.7, { dirtySide: 'n', gaps, chunks: false, seed: 9 + a })
    }
  })
  // ridge of ploughed snow along the median (grimy both sides)
  safe('median ridge', () => {
    const gapsAbs = [[ZEBRA.x0 - 1, ZEBRA.x1 + 1]]
    for (const [a, b] of SPANS) {
      const gaps = gapsAbs.filter(([g0, g1]) => g1 > a && g0 < b).map(([g0, g1]) => [g0 - a - 0.5, g1 - a - 0.5])
      snowBank(ctx, a + 0.5, Z.MEDIAN[0] + 0.3, b - 0.5, Z.MEDIAN[1] - 0.3, 0.45, { dirtySide: 'both', gaps, chunks: false, seed: 11 + a })
    }
  })
  // cleared-sidewalk snow heaped along the tree strip and the south strip edges
  safe('sidewalk banks', () => {
    const nGaps = [
      [BEREZOVAYA.x0 - 1, BEREZOVAYA.walk1 + 0.5], [PASSAGES[0] - 2.5, PASSAGES[0] + 3], [PASSAGES[1] - 2.5, PASSAGES[1] + 3],
      [DRIVEWAYS[0].x0 - 1, DRIVEWAYS[0].x1 + 1], [DRIVEWAYS[1].x0 - 1, DRIVEWAYS[1].x1 + 1],
      [METRO.x0 - 2, METRO.x1 + 2], [STOP_N.x - 9, STOP_N.x - 5],
    ]
    for (const [a, b] of cut(40, 600, nGaps)) {
      snowBank(ctx, a, Z.BANK_N[0], b, Z.BANK_N[1], 0.32, { dirtySide: 'none', chunks: false, seed: 13 + a })
    }
    const sGaps = [[160, 166], [290, 297], [METRO.x0 - 24, 500], [520, 549], [585, 612]]
    for (const [a, b] of cut(40, 600, sGaps)) {
      snowBank(ctx, a, Z.BANK_S[0], b, Z.BANK_S[1], 0.32, { dirtySide: 'none', chunks: false, seed: 15 + a })
    }
  })
  // plough piles where the snow from the terminal and the lay-by ends up
  safe('piles', () => {
    plowedPile(ctx, 580.5, 574.8, { radius: 2.4, height: 1.6, seed: 3, buried: false })
    plowedPile(ctx, 548.5, 589.8, { radius: 2.0, height: 1.4, seed: 4, buried: 'tire' })
    plowedPile(ctx, 525.5, 597.5, { radius: 2.6, height: 1.9, seed: 5, buried: 'yolka' })
    plowedPile(ctx, LAYBY.x0 - 3, 559.8, { radius: 1.8, height: 1.2, seed: 6, buried: false })
    plowedPile(ctx, 498.5, 576.5, { radius: 2.2, height: 1.5, seed: 7, buried: 'sled' })
  })
}
