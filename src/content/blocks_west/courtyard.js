// The repeated courtyard (Block D = home, Block F = the same plan 312 m east, other seed).
//
// One layout function in block-local coordinates: u = metres east of the block's west edge,
// v = metres south of z 328 (the E–W driveway's south edge). Soviet planners repeated courtyards;
// so do we — Block F gets the same plan with its own seed, cars, lamps and playground pieces.
//
//   N  корп. 2  II-49 9 fl., rot 2 (entrances face south), x = xW + 38 … + 27·nN, facade v 22
//   W  корп. 1  P-44 9 fl., rot 3 (entrances face east), facade u 22, v 36 … 138
//   S  корп. 3  II-32 5 fl. brick, rot 0 (entrances face north), u 84 …, facade v 158
//   passage to the avenue at u 72–84 (D: x 222–234, F: x 534–546)
//   internal driveways: west u 27.5–32.5 (from the E–W driveway to a dead end at v 134),
//                       north v 27.5–32.5 (u 30 → the N–S driveway in D, a dead end in F)

import { M } from '../../core/materials.js'
import { paintDriveway } from '../base/api.js'
import { placeResidential } from '../residential/api.js'
import { placeSubstation } from '../public/api.js'
import {
  placeStreetLamp, placeBench, placePlayground, placeCarpetRack, placeGarbageArea, placeRakushkaRow,
  placeLitterBin, placeElectricalCabinet, angleFacing,
} from '../street/api.js'
import { placeTree, placeTreeRow, scatterTrees, placeBush, plowedPile, snowDrift, snowBank, addCrows, scatterWeeds } from '../nature/api.js'
import { parkRow, placeParkedCar, CAR_COLORS } from '../vehicles/api.js'
import { placeStory, placeStoryAtEntrance } from '../life/api.js'
import { addNotice, addNoticeCluster, addGraffiti, addPlate } from '../phone/api.js'
import { safe, pad, paveWalk, resBody, trodden, KeepOut, paintLawn, shoulderRect } from './util.js'

export const COURTYARD = {
  N: { series: 'ii49', floors: 9, u0: 38, v: 22, sec: 27, door: 14.5 },
  W: { series: 'p44', floors: 9, sections: 4, u: 22, v0: 36, sec: 25.5, door: 13.75 },
  S: { series: 'ii32', floors: 5, u0: 84, v: 158, sec: 21.5, door: 11.75 },
  passage: [72, 84],
  driveW: { u: 30, w: 5, v1: 134 },
  driveN: { v: 30, w: 5 },
  playground: [96, 96],
}

/** Intervals [a,b] minus the gap list → segments at least minLen long. */
function segments(a, b, gaps, minLen = 5) {
  const gs = gaps.filter(([g0, g1]) => g1 > a && g0 < b).sort((p, q) => p[0] - q[0])
  const out = []
  let cur = a
  for (const [g0, g1] of gs) {
    if (g0 - cur >= minLen) out.push([cur, g0])
    cur = Math.max(cur, g1)
  }
  if (b - cur >= minLen) out.push([cur, b])
  return out
}

/**
 * Paint the ground of a courtyard block (call before any placement).
 * cfg: { xW, xE, zN, zS, eastDriveway }
 */
export function paintCourtyard(ctx, cfg, gaps) {
  const W = cfg.xE - cfg.xW
  const X = u => cfg.xW + u, Z = v => cfg.zN + v
  const C = COURTYARD
  paintLawn(ctx, X(cfg.westLawn ?? 1.5), Z(0), cfg.xE, cfg.zS, cfg.seed + 3)
  // driveways at y 0
  const eastEnd = cfg.eastDriveway ? W + 3 : W - 6
  paintDriveway(ctx, { points: [[X(C.driveW.u), Z(-1.2)], [X(C.driveW.u), Z(C.driveN.v)], [X(C.driveW.u), Z(C.driveW.v1)]], width: C.driveW.w, banks: false, seed: cfg.seed + 5 })
  paintDriveway(ctx, { points: [[X(C.driveW.u), Z(C.driveN.v)], [X(eastEnd), Z(C.driveN.v)]], width: C.driveN.w, banks: false, seed: cfg.seed + 6 })
  // facade sidewalks (0.25)
  const nLen = C.N.sec * cfg.nN
  paveWalk(ctx, X(32.6), Z(24.5), X(cfg.eastDriveway ? W : Math.min(W - 4, C.N.u0 + nLen + 8)), Z(27.4), cfg.seed + 7)
  paveWalk(ctx, X(24.5), Z(C.W.v0 - 1), X(27.4), Z(C.W.v0 + C.W.sec * 4 + 1), cfg.seed + 8)
  paveWalk(ctx, X(C.passage[0]), Z(152.4), X(cfg.eastDriveway ? W : W - 4), Z(155.5), cfg.seed + 9)
  // passage paving out to the avenue's tree strip
  paveWalk(ctx, X(C.passage[0] + 3.5), Z(155.5), X(C.passage[1] - 3.5), cfg.zS, cfg.seed + 10)
  // building pads
  for (const r of buildingRects(cfg)) pad(ctx, r.x0, r.z0, r.x1, r.z1, 0.25)
  // bank gaps on the streets this block opens onto
  gaps.ewS.push([X(C.driveW.u) - 5, X(C.driveW.u) + 5])
  if (cfg.eastDriveway) {
    gaps.ns.push([Z(23), Z(34)])       // north sidewalk + driveway mouth
    gaps.ns.push([Z(68), Z(102)])      // parking pocket
    gaps.ns.push([Z(104), Z(113)])     // path toward the shop
    gaps.ns.push([Z(151), Z(157)])     // south sidewalk
  }
  if (cfg.westStreet) gaps.berE.push([Z(141), Z(150)])
}

function buildingRects(cfg) {
  const C = COURTYARD, X = u => cfg.xW + u, Z = v => cfg.zN + v
  return [
    resBody(C.N.series, C.N.floors, cfg.nN, X(C.N.u0 + C.N.sec * cfg.nN), Z(C.N.v), 2),
    resBody(C.W.series, C.W.floors, C.W.sections, X(C.W.u), Z(C.W.v0), 3),
    resBody(C.S.series, C.S.floors, cfg.nS, X(C.S.u0), Z(C.S.v), 0),
  ]
}

/**
 * Build the courtyard. cfg: { name, xW, xE, zN, zS, seed, house, nN, nS, enterN, home, eastDriveway,
 * westStreet, v: variant knobs }. Returns { buildings, entrances, home }.
 */
export function buildCourtyard(ctx, cfg, keepGlobal) {
  const C = COURTYARD
  const W = cfg.xE - cfg.xW
  const X = u => cfg.xW + u, Z = v => cfg.zN + v
  const P = (u, v) => [X(u), Z(v)]
  const V = cfg.v || {}
  const keep = new KeepOut()
  const out = { entrances: [], buildings: {} }
  const addr = k => ({ street: 'ул. Берёзовая', house: cfg.house, korpus: k })
  const reg = ctx.registry

  // ---- buildings ---------------------------------------------------------------------------
  safe(`${cfg.name} buildings`, () => {
    const n = placeResidential(ctx, {
      series: C.N.series, floors: C.N.floors, sections: cfg.nN, x: X(C.N.u0 + C.N.sec * cfg.nN), z: Z(C.N.v), rot: 2, y: 0.25,
      seed: cfg.seed + 11, enterable: cfg.enterN, homeLight: cfg.homeLight ?? cfg.enterN, address: addr('2'), lampsBroken: V.lampsBroken ?? 0.2,
      variants: V.variantsN,
    })
    const w = placeResidential(ctx, {
      series: C.W.series, floors: C.W.floors, sections: C.W.sections, x: X(C.W.u), z: Z(C.W.v0), rot: 3, y: 0.25,
      seed: cfg.seed + 12, address: addr('1'), lampsBroken: V.lampsBroken ?? 0.2, tint: V.tintW,
    })
    const s = placeResidential(ctx, {
      series: C.S.series, floors: C.S.floors, sections: cfg.nS, x: X(C.S.u0), z: Z(C.S.v), rot: 0, y: 0.25,
      seed: cfg.seed + 13, address: addr('3'), lampsBroken: 0.34,
    })
    out.buildings = { N: n, W: w, S: s }
    out.entrances.push(...n.entrances, ...w.entrances, ...s.entrances)
    for (const b of [n, w, s]) {
      keep.rect(b.bounds.minX, b.bounds.minZ, b.bounds.maxX, b.bounds.maxZ, 2.5)
      keepGlobal.rect(b.bounds.minX, b.bounds.minZ, b.bounds.maxX, b.bounds.maxZ, 2.5)
    }
    // porch fronts stay clear
    for (const e of out.entrances) keep.circle(e.outside[0], e.outside[1], 2.2)
  })
  const N = out.buildings.N, Wb = out.buildings.W, S = out.buildings.S
  if (!N || !Wb || !S) return out
  const home = N.entrances[cfg.enterN[0]]
  out.home = home
  const u = x => x - cfg.xW, v = z => z - cfg.zN
  const homeU = u(home.x)

  // driveways & parking keep-outs
  keep.rect(X(C.driveW.u - 2.5), Z(-2), X(C.driveW.u + 2.5), Z(C.driveW.v1 + 2), 0.6)
  keep.rect(X(C.driveW.u), Z(C.driveN.v - 2.5), X(cfg.eastDriveway ? W + 1 : W - 6), Z(C.driveN.v + 2.5), 0.6)
  keep.rect(X(C.N.u0 - 2), Z(24.3), X(W), Z(27.6), 0.5)
  keep.rect(X(24.3), Z(C.W.v0 - 1), X(27.6), Z(140), 0.5)
  keep.rect(X(C.passage[0]), Z(152.2), X(W), Z(155.7), 0.5)

  // ---- trodden paths (desire lines) -----------------------------------------------------------
  // hero path: avenue passage → past the playground → the parking gap → the home door
  const hub = [77, 131]
  const paths = {}
  const PG = C.playground
  paths.home = [[77.7, cfg.zS - cfg.zN], [78.5, 166], [79, 155.5], [hub[0], hub[1]], [75.5, 113], [75.8, 92], [homeU - 1.5, 62], [homeU, 41], [homeU, 38.6]]
  const n2 = N.entrances.find(e => Math.abs(u(e.x) - (homeU + 27)) < 2) || N.entrances[0]
  const n2U = u(n2.x)
  paths.ne = [[hub[0], hub[1]], [96, 116.5], [111, 109], [114, 84], [n2U + 1.5, 60], [n2U, 41], [n2U, 38.6]]
  // корп. 1 doors (west) → the hub and the passage
  const w3 = Wb.entrances[3], w2 = Wb.entrances[2], w1 = Wb.entrances[1]
  paths.w3 = [[38.6, v(w3.z)], [52, v(w3.z) + 6], [66, 146], [79, 155.5]]
  paths.w2 = [[38.6, v(w2.z)], [54, v(w2.z) + 10], [hub[0], hub[1]]]
  paths.w1 = [[38.6, v(w1.z)], [58, v(w1.z) + 6], [PG[0] - 12.5, PG[1] - 9]]
  // toward the shop: from the north parking gap past the playground's north side, east to the
  // N–S driveway (D: Block E's desire line to «Продукты» starts across it at x 310.5, z 438).
  // In F the same line just runs out into the open snow at the east edge of the block.
  paths.east = [[homeU, 41], [homeU + 14, 58], [120, 77], [136, 98], [cfg.eastDriveway ? W - 0.6 : W - 4, 108.5]]
  // SW corner → Берёзовая (D) / the mouth of the eastern N–S driveway by the avenue (F)
  paths.sw = cfg.westStreet
    ? [[27.4, 137.6], [22, 143], [8, 146.5], [-0.2, 147]]
    : [[27.4, 137.6], [20, 150], [6, 166], [1, 171.4]]
  for (const [k, pts] of Object.entries(paths)) {
    const world = pts.map(([a, b]) => P(a, b))
    keep.line(world, 2.3)
    const trail = k === 'home' && V.trail ? world : false
    safe(`path ${k}`, () => trodden(ctx, world, { seed: cfg.seed + k.length * 7, trail, age: 0.3, width: k === 'home' ? 1.5 : 1.25 }))
  }
  // nav: link path ends across the parking + driveway to the sidewalks and doors (not painted:
  // a 0.25 m path strip across 0 m asphalt would be a kerb in the road)
  const navLink = (a, b) => ctx.navPaths.push({ points: [P(...a), P(...b)], kind: 'crossing' })
  navLink([homeU, 38.6], [homeU, 25.9])
  navLink([n2U, 38.6], [n2U, 25.9])
  for (const e of [w3, w2, w1]) navLink([38.6, v(e.z)], [25.9, v(e.z)])
  navLink([C.driveW.u, C.driveW.v1], [27.4, 137.6])
  if (cfg.eastDriveway) navLink([W - 0.6, 108.5], [W + 8.5, 110])
  if (!cfg.westStreet) navLink([1, 171.4], [-4.6, 171.4])
  // sidewalks + driveways
  const eastEnd = cfg.eastDriveway ? W + 3 : W - 6
  ctx.navPaths.push({ points: [P(C.N.u0 - 1.5, 25.9), P(homeU, 25.9), P(cfg.eastDriveway ? W + 3 : W - 5, 25.9)], kind: 'sidewalk' })
  ctx.navPaths.push({ points: [P(25.9, C.W.v0 - 0.5), P(25.9, C.W.v0 + C.W.sec * 4 + 0.5)], kind: 'sidewalk' })
  ctx.navPaths.push({ points: [P(C.passage[0], 154), P(79, 154), P(cfg.eastDriveway ? W + 3 : W - 5, 154)], kind: 'sidewalk' })
  ctx.navPaths.push({ points: [P(C.driveW.u, -2), P(C.driveW.u, C.driveN.v), P(C.driveW.u, C.driveW.v1)], kind: 'driveway' })
  ctx.navPaths.push({ points: [P(C.driveW.u, C.driveN.v), P(homeU, C.driveN.v), P(eastEnd, C.driveN.v)], kind: 'driveway' })
  ctx.navPaths.push({ points: [P(25.9, C.W.v0 - 0.5), P(C.driveW.u, C.W.v0 - 3)], kind: 'crossing' })
  ctx.navPaths.push({ points: [P(C.N.u0 - 1.5, 25.9), P(C.driveW.u, 25.9)], kind: 'crossing' })
  reg.driveways = reg.driveways || []
  reg.driveways.push({ name: `${cfg.name} courtyard`, points: cfg.eastDriveway
    ? [P(W + 3, C.driveN.v), P(C.driveW.u, C.driveN.v), P(C.driveW.u, C.driveW.v1 - 2)]
    : [P(C.driveW.u, -2), P(C.driveW.u, C.driveN.v), P(W - 8, C.driveN.v)] })

  // ---- playground, rack, garbage, ТП, rakushki -----------------------------------------------
  const pgX = X(PG[0]), pgZ = Z(PG[1])
  safe(`${cfg.name} playground`, () => {
    const pg = placePlayground(ctx, { x: pgX, z: pgZ, angle: 0, set: 'full', seed: V.playgroundSeed ?? cfg.seed + 21, lamp: false, mittens: false })
    out.playground = pg
    keep.rect(pgX - 12.5, pgZ - 9, pgX + 12.5, pgZ + 9.5, 1.5)
  })
  safe(`${cfg.name} carpet rack`, () => {
    const [rx, rz] = P(48, 64)
    placeCarpetRack(ctx, { x: rx, z: rz, angle: Math.PI / 2, carpet: V.carpet ?? true, seed: cfg.seed + 22 })
    keep.circle(rx, rz, 3)
  })
  safe(`${cfg.name} garbage`, () => {
    const [gx, gz] = P(W - 12, 37.6)
    placeGarbageArea(ctx, { x: gx, z: gz, angle: Math.PI, seed: cfg.seed + 23, enclosure: V.garbage ?? 'metal', tree: false, count: V.containers ?? 4 })
    keep.rect(gx - 4.5, gz - 3.5, gx + 4.5, gz + 1.8, 0.5)
    // the thrown-out New Year tree (it is mid-January)
    placeStory(ctx, 'yolka', { x: gx + 4.6, z: gz - 1.6, angle: 2.2 + cfg.seed * 0.01, seed: cfg.seed + 24 })
    addCrows(ctx, { perch: 'ground', x: gx - 1, z: gz - 3.2, count: V.crows ?? 3, seed: cfg.seed + 25 })
  })
  safe(`${cfg.name} substation & rakushki`, () => {
    const [tx, tz] = P(66.5, 164)
    placeSubstation(ctx, { x: tx, z: tz, rot: 0, seed: cfg.seed + 26, number: V.tp ?? 1417 })
    keep.rect(tx - 4, tz - 3.5, tx + 4, tz + 3, 1)
    addGraffiti(ctx, { x: tx - 3.26, y: 1.25, z: tz + 0.6, angle: -Math.PI / 2, id: V.tpGraffiti ?? 'gr_tsoi', h: 0.45 })
    placeRakushkaRow(ctx, { x0: X(28), z0: Z(163.5), x1: X(59), z1: Z(163.5), angle: Math.PI, seed: cfg.seed + 27, missing: 0.12 })
    keep.rect(X(27), Z(160.5), X(60), Z(166.5), 0.5)
    placeElectricalCabinet(ctx, { x: X(C.passage[1] - 0.8), z: Z(157.8), angle: -Math.PI / 2 })
    keep.circle(X(C.passage[1] - 0.8), Z(157.8), 1.2)
  })

  // ---- entrances: benches, notices, story props -----------------------------------------------
  safe(`${cfg.name} entrances`, () => {
    out.entrances.forEach((e, i) => {
      const fx = Math.sin(e.angle), fz = Math.cos(e.angle)
      const tx = fz, tz = -fx
      const isHome = e === home
      const side = (i + cfg.seed) % 2 ? 1 : -1
      const want = isHome || (i + (V.benchShift ?? 0)) % 3 !== 1
      if (want) {
        const bx = e.x + tx * 3.05 * side + fx * 1.25, bz = e.z + tz * 3.05 * side + fz * 1.25
        const b = placeBench(ctx, { x: bx, z: bz, angle: e.angle, type: i % 2 ? 'entrance' : 'courtyard', seed: cfg.seed + 100 + i, mittens: isHome && !!V.mittens, snow: isHome ? 'brushed' : 'auto' })
        keep.circle(bx, bz, 1.5)
        if (isHome) out.homeBench = b
      }
      if (e.noticeSpot) {
        const ns = e.noticeSpot
        const include = isHome ? (V.homeNotices ?? ['notice_heating', 'notice_mitten']) : (V.notices?.[i] ?? undefined)
        addNoticeCluster(ctx, { x: ns.x, y: ns.y, z: ns.z, angle: ns.angle, w: 0.6, h: 0.5, count: isHome ? 3 : 2 + ((i + cfg.seed) % 2), seed: cfg.seed * 3 + i * 29, include })
      }
      if ((i + cfg.seed) % 3 === 0) {
        const lx = e.x - tx * 7 * side + fx * 2.4, lz = e.z - tz * 7 * side + fz * 2.4
        if (!keep.hit(lx, lz) || true) placeBush(ctx, { x: lx, z: lz, kind: (i % 2) ? 'lilac' : 'currant', seed: cfg.seed + 140 + i })
      }
    })
    // a «Пропала собака» flyer with one tab left on корп. 1, подъезд 3
    const ew = Wb.entrances[2]
    if (ew?.noticeSpot) {
      const ns = ew.noticeSpot, fx = Math.sin(ns.angle), fz = Math.cos(ns.angle)
      addNotice(ctx, { x: ns.x - fz * 0.55, y: ns.y - 0.2, z: ns.z + fx * 0.55, angle: ns.angle, id: 'notice_lostdog', tornTabs: 'allButOne', seed: cfg.seed + 7 })
    }
    for (const s of V.stories ?? []) {
      const e = s.b === 'N' ? N.entrances[s.i] : s.b === 'W' ? Wb.entrances[s.i] : S.entrances[s.i]
      if (e) placeStoryAtEntrance(ctx, e, s.kind, { side: s.side ?? 1, seed: cfg.seed + 160 + (s.i | 0), note: s.note })
    }
  })

  // ---- lamps: a few pools of light with dark gaps between ---------------------------------------
  safe(`${cfg.name} lamps`, () => {
    const L = V.lamps ?? {}
    const spot = (k, uu, vv, aim, extra = {}) => {
      if (L[k] === null) return
      const [x, z] = P(uu, vv)
      const [ax, az] = P(...aim)
      placeStreetLamp(ctx, { x, z, type: 'courtyard', angle: angleFacing(ax - x, az - z), seed: cfg.seed + 200 + k.length, broken: false, flicker: false, ...extra, ...(L[k] || {}) })
      keep.circle(x, z, 1.5)
    }
    spot('passage', 86.6, 150.4, [76, 140])
    spot('nw', 35.2, 35.4, [44, 44])
    spot('east', W - 4.2, 41.2, [W - 12, 50])
    spot('pg', PG[0] - 6.4, PG[1] + 9.8, [PG[0], PG[1]])
    spot('west', 41.4, 88.5, [31, 88])
  })

  // ---- parked cars ---------------------------------------------------------------------------------
  safe(`${cfg.name} cars`, () => {
    const gapsN = [[homeU - 3.2, homeU + 3.2], [n2U - 3.2, n2U + 3.2]]
    if (V.warmCar) gapsN.push([homeU + 6.6, homeU + 9.6])
    for (const [a, b] of segments(40.5, W - 17.5, gapsN)) {
      parkRow(ctx, { x0: X(a), z0: Z(35.7), x1: X(b), z1: Z(35.7), angle: 0, density: V.density ?? 0.7, seed: cfg.seed + 300 + Math.round(a), snow: V.snowMix ?? [['heavy', 5], ['brushed', 1], ['light', 1], ['buried', 1]], warmChance: 0 })
    }
    const gapsW = [w3, w2, w1].map(e => [v(e.z) - 3.2, v(e.z) + 3.2])
    for (const [a, b] of segments(43, 131, gapsW)) {
      parkRow(ctx, { x0: X(35.7), z0: Z(a), x1: X(35.7), z1: Z(b), angle: Math.PI / 2, density: (V.density ?? 0.7) * 0.85, seed: cfg.seed + 400 + Math.round(a), snow: V.snowMixW ?? [['heavy', 4], ['buried', 2], ['light', 1]], warmChance: 0 })
    }
    if (V.warmCar) {
      // the story car: engine running, windows fogged, right by the home entrance
      const [cx, cz] = P(homeU + 8.1, 35.8)
      placeParkedCar(ctx, { x: cx, z: cz, angle: 0.03, type: V.warmType ?? 'vaz2107', warm: true, tint: CAR_COLORS.cherry, seed: cfg.seed + 501 })
    }
    if (cfg.eastDriveway && V.pocket) {
      // perpendicular pocket on the west side of the N–S driveway
      parkRow(ctx, { x0: X(W - 2.8), z0: Z(70), x1: X(W - 2.8), z1: Z(100), angle: -Math.PI / 2, density: 0.65, seed: cfg.seed + 502, snow: [['heavy', 3], ['buried', 1], ['brushed', 1]] })
      keep.rect(X(W - 5.5), Z(69), X(W), Z(101), 0.4)
    }
    for (const c of V.extraCars ?? []) {
      const [cx, cz] = P(c.u, c.v)
      placeParkedCar(ctx, { x: cx, z: cz, angle: c.angle ?? 0, type: c.type, snow: c.snow ?? 'buried', tint: c.tint, seed: cfg.seed + 600 + Math.round(c.u) })
      keep.circle(cx, cz, 3)
    }
    keep.rect(X(40), Z(33), X(W - 17), Z(38.6), 0.3)
    keep.rect(X(33), Z(42), X(38.6), Z(132), 0.3)
  })

  // ---- story moments ------------------------------------------------------------------------------------
  safe(`${cfg.name} story`, () => {
    if (V.snowman) placeStory(ctx, 'snowman', { x: pgX + 4.5, z: pgZ + 14.2, angle: Math.PI * 0.92, seed: cfg.seed + 701, variant: 0 })
    if (V.glove) placeStory(ctx, 'glove', { x: X(C.passage[0] + 1.2), z: Z(150.8), seed: cfg.seed + 702 })
    const pgb = out.playground?.benches?.[1]
    if (pgb && V.frozenBag) placeStory(ctx, 'frozen_bag', { bench: pgb, seed: cfg.seed + 703 })
    if (V.key) { const [kx, kz] = P(V.key[0], V.key[1]); placeStory(ctx, 'key', { x: kx, z: kz, angle: 1.1, seed: cfg.seed + 704 }) }
    if (V.sledHill) {
      // a little sledging hill the kids built from shovelled snow, with a sled left on it
      const [hx, hz] = P(V.sledHill[0], V.sledHill[1])
      ctx.terrain.mound(hx, hz, 4.2, 3.2, 1.5, M('snow_packed'), 0.25, cfg.seed + 705)
      placeStory(ctx, 'sled', { x: hx + 2.6, z: hz + 2.2, angle: 0.8, seed: cfg.seed + 706 })
      keep.circle(hx, hz, 5)
    }
  })

  // ---- trees ------------------------------------------------------------------------------------------------
  safe(`${cfg.name} trees`, () => {
    const avoid = (x, z) => keep.hit(x, z) || keepGlobal.hit(x, z)
    const nEnd = C.N.u0 + C.N.sec * cfg.nN
    // pollarded poplars behind корп. 2 (between its back and the E–W driveway)
    placeTreeRow(ctx, { x0: X(C.N.u0 + 3), z0: Z(4.4), x1: X(nEnd - 3), z1: Z(4.4), spacing: 9.5, species: { 'poplar:pollarded': 0.8, linden: 0.2 }, missing: 0.1, jitter: 0.5, seed: cfg.seed + 801, skip: (x, z) => keepGlobal.hit(x, z) })
    // lindens along the south sidewalk (courtyard side)
    placeTreeRow(ctx, { x0: X(92), z0: Z(148.2), x1: X(W - 8), z1: Z(148.2), spacing: 12, species: { linden: 0.6, maple: 0.4 }, missing: 0.15, seed: cfg.seed + 802, skip: avoid })
    // the courtyard: birches, lindens, maples where nobody walks
    scatterTrees(ctx, { rect: [X(41), Z(42), X(W - 7), Z(146)], count: V.trees ?? 15, species: { birch: 0.45, linden: 0.2, maple: 0.15, 'poplar:pollarded': 0.1, rowan: 0.1 }, minSpacing: 9, clump: 0.3, avoid, seed: cfg.seed + 803 })
    // one courtyard spruce with a dry skirt near корп. 2, a blue spruce by корп. 1
    const sp = P(V.spruce?.[0] ?? 128, V.spruce?.[1] ?? 46)
    if (!avoid(sp[0], sp[1])) placeTree(ctx, { x: sp[0], z: sp[1], species: 'spruce', variant: 2 })
    // SW corner lawn and the back of корп. 1
    scatterTrees(ctx, { rect: [X(3), Z(140), X(26), Z(168)], count: 4, species: { birch: 0.7, 'maple:negundo': 0.3 }, minSpacing: 7, avoid, seed: cfg.seed + 804 })
    if (!cfg.westStreet) placeTreeRow(ctx, { x0: X(3.6), z0: Z(40), x1: X(3.6), z1: Z(136), spacing: 10.5, species: { 'poplar:pollarded': 0.6, birch: 0.4 }, missing: 0.1, seed: cfg.seed + 805, skip: avoid })
    if (!cfg.eastDriveway) {
      // the open east edge: a ragged line of old poplars and weeds, then nothing but snow and fog
      placeTreeRow(ctx, { x0: X(W - 3), z0: Z(12), x1: X(W - 3), z1: Z(146), spacing: 13, species: { 'poplar:natural': 0.5, 'poplar:pollarded': 0.3, 'maple:negundo': 0.2 }, missing: 0.25, jitter: 1.2, seed: cfg.seed + 806, skip: avoid })
      scatterWeeds(ctx, { rect: [X(W - 8), Z(10), X(W), Z(150)], density: 1.6, kinds: { grass: 0.6, burdock: 0.25, tansy: 0.15 }, avoid, seed: cfg.seed + 807 })
    }
    // three crows on the parapet of корп. 2, looking down into the yard
    if (V.crowsRoof !== false) addCrows(ctx, { perch: 'roof', x: X(C.N.u0 + 20), y: 0.25 + 28.75, z: Z(C.N.v) - 0.35, angle: 0, facing: -Math.PI / 2, count: 3, seed: cfg.seed + 808 })
  })

  // ---- snow ----------------------------------------------------------------------------------------------
  safe(`${cfg.name} snow`, () => {
    // windrow behind the north parking and along the west parking, gaps at every path
    const gN = [[homeU - 3, homeU + 3], [n2U - 3, n2U + 3]]
    const nLen = (W - 17.5) - 40.5
    snowBank(ctx, X(40.5), Z(38.9), X(W - 17.5), Z(40.5), 0.5, { seed: cfg.seed + 901, dirtySide: 'n', gaps: gN.map(([a, b]) => [a - 40.5, b - 40.5]).filter(([a]) => a < nLen) })
    snowBank(ctx, X(38.9), Z(44), X(40.5), Z(131), 0.5, { seed: cfg.seed + 902, dirtySide: 'w', gaps: [w3, w2, w1].map(e => [v(e.z) - 3 - 44, v(e.z) + 3 - 44]) })
    // dead end of the west driveway: the plough's pile
    plowedPile(ctx, X(C.driveW.u + 0.5), Z(C.driveW.v1 + 2.6), { radius: 3, height: 2.3, seed: cfg.seed + 903, buried: V.pileBuried ?? 'chair' })
    if (!cfg.eastDriveway) plowedPile(ctx, X(W - 3.5), Z(C.driveN.v), { radius: 3.2, height: 2.4, seed: cfg.seed + 904, buried: 'pallet' })
    // wind drifts along the long north wall and in the lee of корп. 3
    const nEnd = C.N.u0 + C.N.sec * cfg.nN
    snowDrift(ctx, X((C.N.u0 + nEnd) / 2), Z(8.4), { side: 'n', length: nEnd - C.N.u0 - 8, depth: 2.6, height: 0.55, seed: cfg.seed + 905 })
    snowDrift(ctx, X(C.S.u0 + C.S.sec * cfg.nS / 2), Z(171), { side: 's', length: C.S.sec * cfg.nS - 6, depth: 1.6, height: 0.45, seed: cfg.seed + 906 })
  })

  // ---- zones, plates, graffiti ------------------------------------------------------------------------
  ctx.zones.add({ name: `courtyard_${cfg.name}`, min: [X(24), -2, Z(24)], max: [X(W), 40, Z(157)], type: 'courtyard', reverb: 'courtyard', wind: V.wind ?? 0.55, priority: 1, data: { pkg: 'blocks_west', block: cfg.name } })
  if (V.silence) {
    // the inner yard where even the wind stops
    ctx.zones.add({ name: `courtyard_${cfg.name}_still`, min: [pgX - 26, -2, pgZ - 24], max: [pgX + 26, 30, pgZ + 26], type: 'courtyard', reverb: 'courtyard', wind: 0, silence: true, priority: 2, data: { pkg: 'blocks_west', block: cfg.name } })
  }
  ctx.zones.add({ name: `passage_${cfg.name}`, min: [X(C.passage[0]), -2, Z(156)], max: [X(C.passage[1]), 20, cfg.zS], type: 'courtyard', reverb: 'courtyard', wind: 1.2, priority: 2, data: { pkg: 'blocks_west', block: cfg.name } })
  safe(`${cfg.name} plates`, () => {
    // street name plate on the corner of корп. 3 by the passage, a heart on the gable
    addPlate(ctx, { x: X(C.S.u0) - 0.02, y: 3.4, z: Z(C.S.v + 2.4), angle: -Math.PI / 2, id: 'street_berezovaya' })
    addGraffiti(ctx, { x: X(C.S.u0) - 0.02, y: 1.25, z: Z(C.S.v + 6.5), angle: -Math.PI / 2, id: V.heart ?? 'gr_lenasasha' })
    if (V.chalk) addGraffiti(ctx, { x: X(C.S.u0) - 0.02, y: 0.85, z: Z(C.S.v + 8.8), angle: -Math.PI / 2, id: 'gr_masha', h: 0.22 })
  })
  return out
}
