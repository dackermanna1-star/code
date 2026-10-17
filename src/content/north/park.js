// The park «Берёзовая роща» (x 24–139, z 147–499.5): a cast-iron fence with brick pillars and
// gates along Берёзовая, Заводская and the avenue; winding cleared alleys (packed snow over
// asphalt, shovelled edges) lit by low park lanterns far apart (many smashed); the frozen pond
// with benches and its «Выход на лёд запрещён!» sign; a modest war memorial on the axis of the
// gate opposite 3-й Молодёжный проезд; the summer café «Берёзка» shuttered for the winter; an
// old concert shell with buried benches; a playground at the edge by the avenue; a sledding
// hill; a ski track in the birch grove; crows, a bag in a birch, steam from a manhole on the
// main alley, a lost glove on a post.

import { M } from '../../core/materials.js'
import { RNG, fbm2, valueNoise2 } from '../../core/rng.js'
import { paintPath } from '../base/api.js'
import { placeStreetLamp, placeBench, placePlayground, placeManhole, placeLitterBin, placeNoticeBoard } from '../street/api.js'
import { placePond, scatterTrees, placeTree, placeTreeRow, addCrows, addBag, placeBush } from '../nature/api.js'
import { placeStory } from '../life/api.js'
import { addNotice, addPoster, addGraffiti } from '../phone/api.js'
import { SIGN_FONT, SERIF_FONT, PLAIN_FONT } from '../../render/Signs.js'
import { PARK, FENCE, GATES, POND, MEMORIAL, CAFE, BANDSTAND, PLAYGROUND, BER } from './layout.js'
import { nav, reg, safe, chaikin, distToPolyline, alongPolyline, polylineLength, placeFine, PI, HALF_PI } from './lib.js'

// ---- the alley network (world points; smoothed with Chaikin before painting) ---------------------
const ringAt = deg => {
  const a = deg * Math.PI / 180
  return [POND.x + Math.cos(a) * POND.rx * 1.42, POND.z + Math.sin(a) * POND.rz * 1.42]
}
export const ALLEYS = {
  A: { w: 2.8, pts: [[GATES.main.x, PARK.z0 - 0.4], [130.5, 156], [122, 177], [112, 205], [104.5, 236], [98, 263], [90.5, 289], ringAt(-100)] },
  B: { w: 2.1, pts: [[GATES.north.x, PARK.z0 - 0.4], [72, 171], [66.5, 200], [63, 229], [64, 259], [60.5, 285], ringAt(-126)] },
  C: { w: 2.2, pts: [[FENCE.x + 0.6, GATES.e236.z], [125, 237.5], [104.5, 236], [84, 233], [63, 229], [42, 225.5], [22, 221]] },
  D: { w: 3.4, pts: [[FENCE.x + 0.6, GATES.e325.z], [MEMORIAL.plaza[2], GATES.e325.z]] },
  D2: { w: 2.6, pts: [[MEMORIAL.plaza[0], GATES.e325.z], ringAt(-10)] },
  E: { w: 2.2, pts: [[FENCE.x + 0.6, GATES.e412.z], [125, 409], [112.5, 398], [106.2, 385], [105.2, 371.4], [97, 365], ringAt(76)] },
  F: { w: 2.1, pts: [[112.5, 398], [115.5, 424], [113.5, 448], [PLAYGROUND.x, 460.5]] },
  G: { w: 2.1, pts: [[113.5, 452], [125.5, 458.5], [129, 474], [131.5, 490], [GATES.south.x, PARK.z1 + 0.4], [138.2, 503.5], [139.1, 508.5], [139.1, 513.2]] },
  H: { w: 2.0, pts: [ringAt(124), [60.5, 372], [63.5, 395], [67.5, 418], [71, 438]] },
  I: { w: 1.8, pts: [[77.5, 440], [95, 438], [113.5, 448]] },
  J: { w: 1.6, pts: [[66, 441], [50, 451], [36, 469], [22, 482]] },
  K: { w: 1.6, pts: [ringAt(180), [32, 333.5], [20, 337]] },
}
/** Narrow trodden paths (paintPath + footprints) where people cut across. */
export const TRODDEN = [
  [[118.8, 403.7], [100, 418], [82, 431], [77.5, 440]],
  [[130.2, 156], [117, 158.5], [96, 166], [72.2, 171]],
  [ringAt(160), [44, 352], [50, 368], [60.5, 372]],
]
const HILL = { x: 53, z: 401, rx: 9, rz: 10.5, h: 2.4 }
const SKI_PTS = [[56, 158], [46, 176], [40, 205], [44, 238], [36, 268], [40, 292], [32, 318], [34, 352], [30, 380], [36, 412], [30, 440], [34, 470], [28, 494]]
const SKI = chaikin(SKI_PTS, 2)

const smoothed = {}
const pathPts = name => (smoothed[name] ||= chaikin(ALLEYS[name].pts, 2))
/** Distance (m) from (x, z) to the edge of the nearest alley (negative inside), up to 3 m; 99 beyond. */
const DG = { x0: 0, z0: 140, x1: 146, z1: 518, res: 0.25 }
let distGrid = null
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az
  const L2 = dx * dx + dz * dz || 1e-9
  let t = ((px - ax) * dx + (pz - az) * dz) / L2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(ax + dx * t - px, az + dz * t - pz)
}
function buildDistGrid() {
  const nx = Math.ceil((DG.x1 - DG.x0) / DG.res), nz = Math.ceil((DG.z1 - DG.z0) / DG.res)
  const g = new Float32Array(nx * nz).fill(99)
  for (const k of Object.keys(ALLEYS)) {
    const pts = pathPts(k), half = ALLEYS[k].w / 2, r = half + 3
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - DG.x0) / DG.res)), cx1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + r - DG.x0) / DG.res))
      const cz0 = Math.max(0, Math.floor((Math.min(az, bz) - r - DG.z0) / DG.res)), cz1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + r - DG.z0) / DG.res))
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const d = segDist(DG.x0 + (cx + 0.5) * DG.res, DG.z0 + (cz + 0.5) * DG.res, ax, az, bx, bz) - half
        const j = cx + cz * nx
        if (d < g[j]) g[j] = d
      }
    }
  }
  distGrid = { g, nx, nz }
}
export function alleyDist(x, z) {
  if (!distGrid) buildDistGrid()
  const cx = Math.floor((x - DG.x0) / DG.res), cz = Math.floor((z - DG.z0) / DG.res)
  if (cx < 0 || cz < 0 || cx >= distGrid.nx || cz >= distGrid.nz) return 99
  return distGrid.g[cx + cz * distGrid.nx]
}

/** Pass 1: the cleared surface of an alley (0.25 m: packed snow, asphalt showing through, ice). */
function paintAlley(ctx, pts, w, seed) {
  const t = ctx.terrain
  const packed = M('snow_packed'), asphalt = M('asphalt'), dirty = M('snow_dirty'), ice = M('ice')
  const road = new Set([M('slush'), M('asphalt_wet'), M('curb')])
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const seg = [[ax, az], [bx, bz]]
    const r = w / 2 + 0.3
    t.apply(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r, (x, z, h, mat) => {
      if (road.has(mat) || h < 1) return null // a road or the avenue's carriageway: leave it
      if (distToPolyline(x, z, seg) >= w / 2) return null
      const n = fbm2(x * 0.45, z * 0.45, 3, seed)
      let m = packed
      if (n < 0.24) m = asphalt
      else if (n < 0.34) m = dirty
      if (valueNoise2(x * 1.4, z * 1.4, seed + 3) > 0.92) m = ice
      return { h: 1, mat: m }
    })
  }
}

/** Pass 2: shovelled edges along every alley — a low shoulder, then a patchy ridge of snow. */
function alleyEdges(ctx) {
  const t = ctx.terrain
  const bank = M('snow_bank')
  const pathMats = new Set([M('snow_packed'), M('asphalt'), M('snow_dirty'), M('ice')])
  t.apply(PARK.x0 - 4, PARK.z0, PARK.x1, PARK.z1, (x, z, h, mat) => {
    if (h <= 1) return null // any paved or trodden surface (paths, the pond ring, the plaza)
    const pr = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz)
    if (pr > 1.2 && pr < 1.75) return null // the pond's ring path: no windrow across it
    const d = alleyDist(x, z)
    if (d > 1.3 || d < -0.01) return null
    if (d < 0.5) return { h: Math.min(h, 2), mat: h > 2 ? M('snow') : mat }
    // a low shovelled windrow along the edge, broken here and there where people step off the path
    if (d < 0.95 && valueNoise2(x * 0.16, z * 0.16, 6250) > 0.46) return { h: 3, mat: valueNoise2(x * 1.1, z * 1.1, 6251) > 0.7 ? bank : M('snow') }
    return null
  })
}

/** Cast-iron fence run from a to b with brick pillars every `pillarEvery` panels and at both ends. */
function fenceRun(ctx, a, b, opts = {}) {
  const [x0, z0] = a, [x1, z1] = b
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 1) return
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len
  const angle = Math.atan2(-uz, ux)
  const n = Math.max(1, Math.round(len / 2.5))
  const step = len / n
  const every = opts.pillarEvery ?? 10
  const rng = new RNG(opts.seed ?? 5)
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * step
    const off = i % 2 ? 0.012 : -0.012
    const x = x0 + ux * t - uz * off, z = z0 + uz * t + ux * off
    const p = ctx.world.place('north_fence_cast', { x, z, angle, seed: rng.next(), tag: 'fence' })
    if (p) placeFine(ctx, 'north_fence_cast_bars', { x, z, y: p.y + 0.5, angle, tag: 'fence' })
  }
  for (let i = 0; i <= n; i += every) {
    if (i === 0 && opts.skipStart) continue
    ctx.world.place('north_fence_pillar', { x: x0 + ux * step * i, z: z0 + uz * step * i, rot: 0, tag: 'fence' })
  }
  if (n % every && !opts.skipEnd) ctx.world.place('north_fence_pillar', { x: x1, z: z1, rot: 0, tag: 'fence' })
}

/** A gate in a fence: pillars both sides, two leaves swung into the park (rotation `inRot`, per leaf open angle). */
function parkGate(ctx, g, inAngle, open = [1, 1]) {
  const half = g.w / 2 + 0.375
  const along = g.side === 'e' ? [0, 1] : [1, 0]
  const p0 = [g.x - along[0] * half, g.z - along[1] * half], p1 = [g.x + along[0] * half, g.z + along[1] * half]
  for (const p of [p0, p1]) ctx.world.place('north_fence_pillar', { x: p[0], z: p[1], rot: 0, tag: 'gate' })
  // leaves hinge at the pillars' inner faces; open = fraction of the swing (1 = flat into the park)
  const hingeOff = 0.4
  const h0 = [p0[0] + along[0] * hingeOff, p0[1] + along[1] * hingeOff], h1 = [p1[0] - along[0] * hingeOff, p1[1] - along[1] * hingeOff]
  const closed0 = Math.atan2(-along[1], along[0]), closed1 = closed0 + PI
  const turn = (base, target, f) => base + f * (((target - base + 3 * PI) % (2 * PI)) - PI)
  placeFine(ctx, 'north_gate_cast', { x: h0[0], z: h0[1], y: ctx.terrain.heightAt(h0[0], h0[1]), angle: turn(closed0, inAngle, open[0]), tag: 'gate' })
  placeFine(ctx, 'north_gate_cast', { x: h1[0], z: h1[1], y: ctx.terrain.heightAt(h1[0], h1[1]), angle: turn(closed1, inAngle, open[1]), tag: 'gate' })
}

export function buildParkGround(ctx) {
  const t = ctx.terrain
  const out = {}
  // ---- the pond first (it reads the rim height of the lawn) ------------------------------------------
  safe('pond', () => {
    const shape = (x, z) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz)
    // even lawn (0.5) around the pond so the shore, the ring path and the alleys meet in 0.25 m steps
    t.apply(POND.x - POND.rx * 1.7, POND.z - POND.rz * 1.7, POND.x + POND.rx * 1.7, POND.z + POND.rz * 1.7, (x, z, h) => (shape(x, z) < 1.65 ? { h: 2 } : null))
    out.pond = placePond(ctx, { x: POND.x, z: POND.z, rx: POND.rx, rz: POND.rz, seed: 3301, sign: { angle: 0.32 }, avoid: (x, z) => x > 108 && z > 318 && z < 334 })
    // the trodden ring path sits a step down, like the alleys
    t.apply(POND.x - POND.rx * 1.6, POND.z - POND.rz * 1.6, POND.x + POND.rx * 1.6, POND.z + POND.rz * 1.6, (x, z, h, mat) => {
      const r = shape(x, z)
      return r > 1.33 && r < 1.55 && mat === M('snow_packed') ? { h: 1 } : null
    })
  })
  // ---- level beds for the plaza, café, bandstand, playground ------------------------------------------
  const [px0, pz0, px1, pz1] = MEMORIAL.plaza
  t.apply(px0, pz0, px1, pz1, (x, z) => {
    const ring = Math.max(Math.abs(x - MEMORIAL.x), Math.abs(z - MEMORIAL.z))
    const n = valueNoise2(x * 0.8, z * 0.8, 61)
    return { h: 1, mat: ring < 2.6 ? M('granite') : n > 0.62 ? M('snow') : n > 0.25 ? M('snow_packed') : M('concrete') }
  })
  t.setHeightRect(CAFE.x - 3.5, CAFE.z - 2.25, CAFE.x + 3.5, CAFE.z + 2.25, 0.5, M('snow_packed'))
  t.setHeightRect(BANDSTAND.x - 6, BANDSTAND.z - 4, BANDSTAND.x + 6, BANDSTAND.z + 4, 0.5, M('snow'))
  t.setHeightRect(BANDSTAND.x - 8, 430, BANDSTAND.x + 8, BANDSTAND.z - 3, 0.5, M('snow'))
  t.setHeightRect(PLAYGROUND.x - 12, PLAYGROUND.z - 9, PLAYGROUND.x + 12, PLAYGROUND.z + 9, 0.5, M('snow'))
  // ---- sledding hill ----------------------------------------------------------------------------
  t.mound(HILL.x, HILL.z, HILL.rx, HILL.rz, HILL.h, M('snow'), 0.15, 6101)
  paintPath(ctx, { points: [[HILL.x - 1, HILL.z - 1], [HILL.x + 4.5, HILL.z + 2], [HILL.x + 11, HILL.z + 4.5]], width: 1.1, wobble: 0.2, seed: 6102, mat: M('snow_packed') })
  // re-raise the slide (paintPath flattens to 0.25): follow the hill surface with packed snow instead
  t.apply(HILL.x - HILL.rx, HILL.z - HILL.rz, HILL.x + HILL.rx + 3, HILL.z + HILL.rz, (x, z, h, mat) => {
    if (mat !== M('snow_packed')) return null
    const dx = (x - HILL.x) / HILL.rx, dz = (z - HILL.z) / HILL.rz
    let d = 1 - (dx * dx + dz * dz)
    if (d <= 0) return null
    d = d * d * (3 - 2 * d)
    return { h: 2 + Math.round((HILL.h * d) / 0.25) - 1, mat: M('snow_packed') }
  })
  // ---- alleys -----------------------------------------------------------------------------------------
  safe('alleys', () => {
    Object.entries(ALLEYS).forEach(([k, a], i) => paintAlley(ctx, pathPts(k), a.w, 6200 + i))
    alleyEdges(ctx)
    TRODDEN.forEach((p, i) => {
      paintPath(ctx, { points: p, width: 1.1, wobble: 0.5, seed: 6300 + i })
      ctx.footprints?.addTrail(p.map(([x, z]) => [x + 0.15, z]), t, 0.5)
    })
    // trodden ways up the hill and along the bandstand benches
    ctx.footprints?.addTrail([[63.5, 395], [58, 398], [HILL.x + 1, HILL.z]], t, 0.6)
    ctx.footprints?.addTrail([[HILL.x + 11, HILL.z + 4.5], [62, HILL.z + 6], [64, 409]], t, 0.7)
  })
  // ---- gate thresholds: road-level kerb lowered, packed footing ---------------------------------------
  safe('gate thresholds', () => {
    for (const g of [GATES.e236, GATES.e325, GATES.e412]) t.apply(FENCE.x - 0.5, g.z - g.w / 2 - 0.2, BER.x0 + 0.25, g.z + g.w / 2 + 0.2, () => ({ h: 1, mat: M('snow_packed') }))
    for (const g of [GATES.main, GATES.north]) t.apply(g.x - g.w / 2 - 0.2, FENCE.zN - 0.6, g.x + g.w / 2 + 0.2, FENCE.zN + 1.2, () => ({ h: 1, mat: M('snow_packed') }))
    // from the avenue sidewalk through the gap in its lawn fence to the south gate
    t.apply(GATES.south.x - 2, FENCE.zS - 0.6, BER.x0, 509.2, (x, z) => {
      const d = distToPolyline(x, z, pathPts('G').slice(-8))
      return d < 1.1 ? { h: 1, mat: valueNoise2(x, z, 64) > 0.6 ? M('snow_dirty') : M('snow_packed') } : null
    })
  })
  // ---- ski track (лыжня): two parallel grooves through the grove, out into the white ------------------
  safe('ski track', () => {
    const ski = SKI
    const xs = ski.map(p => p[0]), zs = ski.map(p => p[1])
    t.apply(Math.min(...xs) - 1, Math.min(...zs) - 1, Math.max(...xs) + 1, Math.max(...zs) + 1, (x, z, h, mat) => {
      const d = distToPolyline(x, z, ski)
      if (d > 0.42) return null
      if (mat === M('snow_packed') || mat === M('asphalt') || mat === M('snow_dirty') || mat === M('ice')) return null
      if (d > 0.13 && d < 0.4) return { h: Math.max(1, Math.min(h, 2) - 1), mat: M('snow_packed') }
      return { h: Math.min(h, 2), mat: M('snow_fresh') }
    })
  })
  return out
}

export function buildPark(ctx) {
  const out = { lights: 0, lanterns: [] }
  const { world, signs } = ctx
  // ---- fence and gates ------------------------------------------------------------------------------
  safe('park fence', () => {
    const eGates = [GATES.e236, GATES.e325, GATES.e412].sort((a, b) => a.z - b.z)
    let z = FENCE.zN
    eGates.forEach((g, i) => { fenceRun(ctx, [FENCE.x, z], [FENCE.x, g.z - g.w / 2 - 0.75], { seed: 6400 + i, skipStart: i > 0 }); z = g.z + g.w / 2 + 0.75 })
    fenceRun(ctx, [FENCE.x, z], [FENCE.x, FENCE.zS], { seed: 6403, skipStart: true })
    // north along Заводская: west end → north gate → main gate → corner
    fenceRun(ctx, [FENCE.west, FENCE.zN], [GATES.north.x - GATES.north.w / 2 - 0.75, FENCE.zN], { seed: 6410 })
    fenceRun(ctx, [GATES.north.x + GATES.north.w / 2 + 0.75, FENCE.zN], [GATES.main.x - GATES.main.w / 2 - 0.75, FENCE.zN], { seed: 6411, skipStart: true })
    fenceRun(ctx, [GATES.main.x + GATES.main.w / 2 + 0.75, FENCE.zN], [FENCE.x, FENCE.zN], { seed: 6412, skipStart: true, skipEnd: true })
    // south along the avenue's tree strip
    fenceRun(ctx, [FENCE.west, FENCE.zS], [GATES.south.x - GATES.south.w / 2 - 0.75, FENCE.zS], { seed: 6420 })
    fenceRun(ctx, [GATES.south.x + GATES.south.w / 2 + 0.75, FENCE.zS], [FENCE.x, FENCE.zS], { seed: 6421, skipStart: true })
    // gates: east ones open into the park (west), north ones south, the south one north
    // (THREE angles: +X → west is π, → south is −π/2, → north is π/2)
    parkGate(ctx, GATES.e236, PI, [1, 0.35])
    parkGate(ctx, GATES.e325, PI, [1, 1])
    parkGate(ctx, GATES.e412, PI, [0.6, 1])
    parkGate(ctx, GATES.main, -HALF_PI, [1, 1])
    parkGate(ctx, GATES.north, -HALF_PI, [0.15, 0.8])
    parkGate(ctx, GATES.south, HALF_PI, [1, 0.5])
  })
  // ---- signs at the main gate ------------------------------------------------------------------------
  safe('park signs', () => {
    const g = GATES.main
    world.place('north_board_posts', { x: g.x - 6.2, z: FENCE.zN + 1.4, rot: 0, tag: 'sign' })
    const by = ctx.terrain.heightAt(g.x - 6.2, FENCE.zN + 1.4)
    signs?.add({ x: g.x - 6.2, y: by + 2.125, z: FENCE.zN + 1.4 - 0.14, angle: PI, w: 3.0, h: 0.72, ppm: 90, lines: ['ПАРК «БЕРЁЗОВАЯ РОЩА»'], bg: '#2b4a3a', color: '#efe9d6', font: SIGN_FONT, aged: 0.45, seed: 6501 })
    signs?.add({ x: g.x - 6.2, y: by + 2.125, z: FENCE.zN + 1.4 + 0.14, angle: 0, w: 3.0, h: 0.72, ppm: 60, lines: ['Правила пользования парком', 'см. на информационном щите'], bg: '#2b4a3a', color: '#d8d2c0', font: PLAIN_FONT, aged: 0.5, seed: 6502 })
    ctx.interactions?.add({ x: g.x - 6.2, y: by + 2.1, z: FENCE.zN + 1.4, size: [3.0, 0.9, 0.9], reach: 3, prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ru: 'ПАРК «БЕРЁЗОВАЯ РОЩА»\nГУП «Мосзеленхоз» · Управа района «Восточный»\n\nЗапрещается: разводить костры, выгуливать собак без поводка, выходить на лёд пруда, ломать деревья и кустарники.\n\nПарк открыт круглосуточно.', en: '"BIRCH GROVE" PARK\nMoszelenkhoz · Vostochny District Council\n\nIt is forbidden to light fires, walk dogs off the lead, go out on the pond ice, or break trees and shrubs.\n\nThe park is open day and night.', style: 'sign' }) } })
    placeNoticeBoard(ctx, { x: g.x + 4.2, z: FENCE.zN + 2.6, angle: -HALF_PI, count: 3, seed: 6503 })
    addNotice(ctx, { x: FENCE.x + 0.14, y: 1.3, z: GATES.e412.z - 3.0, angle: HALF_PI, id: 'notice_trees', w: 0.21 })
    addNotice(ctx, { x: FENCE.x + 0.14, y: 1.45, z: GATES.e236.z + 3.1, angle: HALF_PI, kind: 'notice', sub: 'lost', seed: 6505 })
  })
  // ---- the memorial --------------------------------------------------------------------------------
  safe('memorial', () => {
    world.place('north_memorial', { x: MEMORIAL.x, z: MEMORIAL.z, y: 0.25, rot: 3, tag: 'memorial' })
    world.place('north_wreath', { x: MEMORIAL.x + 1.3, z: MEMORIAL.z + 0.35, y: 0.75, rot: 3, tag: 'story' })
    const plaque = {
      ru: 'ВЕЧНАЯ ПАМЯТЬ\nЖИТЕЛЯМ ПОСЁЛКА ВОСТОЧНЫЙ,\nПАВШИМ ЗА РОДИНУ\nВ ВЕЛИКОЙ ОТЕЧЕСТВЕННОЙ ВОЙНЕ\n1941–1945',
      en: 'ETERNAL MEMORY\nTO THE PEOPLE OF VOSTOCHNY VILLAGE\nWHO FELL FOR THE MOTHERLAND\nIN THE GREAT PATRIOTIC WAR\n1941–1945',
    }
    signs?.add({
      x: MEMORIAL.x + 1.01, y: 0.25 + 1.0, z: MEMORIAL.z, angle: HALF_PI, w: 1.7, h: 0.82, ppm: 130, aged: 0.35, seed: 6601,
      draw: (c, W, H) => {
        c.fillStyle = '#3b3a38'; c.fillRect(0, 0, W, H)
        c.fillStyle = '#c9b27a'; c.textAlign = 'center'; c.textBaseline = 'middle'
        const L = plaque.ru.split('\n')
        L.forEach((s, i) => { c.font = `${i === 0 ? 'bold ' : ''}${Math.round(H * (i === 0 ? 0.16 : 0.105))}px ${SERIF_FONT}`; c.fillText(s, W / 2, H * (0.15 + i * 0.18)) })
      },
    })
    ctx.interactions?.add({ x: MEMORIAL.x + 1.3, y: 1.2, z: MEMORIAL.z, size: [0.6, 1.0, 1.8], reach: 2.6, prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ...plaque, style: 'sign', footer: { ru: 'Две замёрзшие гвоздики на ступени. Венок с выцветшей лентой.', en: 'Two frozen carnations on the step. A wreath with a faded ribbon.' } }) } })
    // two blue spruces behind the obelisk, benches facing it from both sides of the plaza
    out.spruces = [
      placeTree(ctx, { x: MEMORIAL.plaza[0] - 0.6, z: MEMORIAL.z - 5.2, species: 'spruce', variant: 4, rot: 0 }),
      placeTree(ctx, { x: MEMORIAL.plaza[0] - 0.6, z: MEMORIAL.z + 5.2, species: 'spruce', variant: 5, rot: 1 }),
    ]
    placeBench(ctx, { x: MEMORIAL.x + 1.5, z: MEMORIAL.plaza[1] + 1.2, angle: 0, type: 'park', snow: 'snow', seed: 6602 })
    placeBench(ctx, { x: MEMORIAL.x + 1.5, z: MEMORIAL.plaza[3] - 1.2, angle: PI, type: 'park', snow: 'brushed', seed: 6603 })
  })
  // ---- the summer café «Берёзка», closed for the winter --------------------------------------------
  safe('cafe', () => {
    world.place('north_cafe', { x: CAFE.x, z: CAFE.z, y: 0.5, rot: 0, tint: 0x6f8c7a, tag: 'building' })
    for (const [x, z, r] of [[95.6, 373.4, 0], [95.4, 375.3, 1], [102.6, 377.3, 2]]) world.place('north_cafe_stack', { x, z, y: 0.5, rot: r, tag: 'story' })
    signs?.add({ x: CAFE.x, y: 0.5 + 3.0, z: CAFE.z - 1.76, angle: PI, w: 5.4, h: 0.45, ppm: 70, lines: ['ЛЕТНЕЕ КАФЕ «БЕРЁЗКА»'], bg: '#e9e3d0', color: '#3d6a52', font: SIGN_FONT, aged: 0.6, seed: 6701 })
    addNotice(ctx, {
      x: CAFE.x + 3.01, y: 0.5 + 1.45, z: CAFE.z + 0.55, angle: HALF_PI, w: 0.22, h: 0.17,
      item: { id: 'north_cafe_closed', kind: 'notice', sub: 'plea', look: 'handwritten', style: 'hand', ru: 'Кафе закрыто\nдо 1 мая.\nАдминистрация', en: 'The café is closed\nuntil the 1st of May.\nThe management' },
    })
    addPoster(ctx, { x: CAFE.x - 3.01, y: 0.5 + 1.6, z: CAFE.z, angle: -HALF_PI, id: 'ad_disco80', w: 0.5, h: 0.7, fade: 0.7 })
    addGraffiti(ctx, { x: CAFE.x + 1.5, y: 0.5 + 0.7, z: CAFE.z + 1.76, angle: 0, id: 'gr_lenasasha' })
    placeLitterBin(ctx, { x: 105.6, z: 368.8, angle: 0, type: 'concrete' })
    out.cafeTree = placeTree(ctx, { x: 109.5, z: 380, species: 'birch', variant: 6, rot: 2 })
  })
  // ---- the concert shell and its buried benches ----------------------------------------------------
  safe('bandstand', () => {
    world.place('north_bandstand', { x: BANDSTAND.x, z: BANDSTAND.z, y: 0.5, rot: 0, tag: 'building' })
    let k = 0
    for (const z of [444.5, 440.5, 436.5]) for (const x of [BANDSTAND.x - 3.2, BANDSTAND.x + 3.2]) {
      placeBench(ctx, { x: x + (k % 3 === 1 ? 0.3 : 0), z, angle: 0, type: 'park', snow: 'snow', seed: 6800 + k, sittable: k % 2 === 0 })
      k++
    }
    addPoster(ctx, { x: BANDSTAND.x - 2.4, y: 0.5 + 0.5, z: BANDSTAND.z - 2.26, angle: PI, id: 'ad_concert', w: 0.42, h: 0.6, fade: 0.8, aged: 0.8 })
    ctx.zones?.add({ name: 'park_shell', min: [BANDSTAND.x - 5, 0, BANDSTAND.z - 2.5], max: [BANDSTAND.x + 5, 6, BANDSTAND.z + 3], reverb: 'courtyard', wind: 0.2, priority: 1, data: { pkg: 'north' } })
  })
  // ---- playground at the edge, by the avenue -------------------------------------------------------
  safe('playground', () => {
    out.playground = placePlayground(ctx, { x: PLAYGROUND.x, z: PLAYGROUND.z, angle: PI, seed: 6901, set: 'full' })
    if (out.playground?.lamp?.light) out.lights++
    placeStory(ctx, 'snowman', { x: PLAYGROUND.x - 13.5, z: PLAYGROUND.z - 9.5, angle: HALF_PI, seed: 6902, variant: 1 })
  })
  // ---- benches around the pond (facing the ice) and along the alleys --------------------------------
  safe('benches', () => {
    for (const [deg, kind, story] of [[-62, 'snow'], [-150, 'brushed'], [150, 'snow', 'frozen_bag'], [105, 'snow'], [40, 'brushed'], [-28, 'snow']]) {
      const [rx, rz] = ringAt(deg)
      const a = deg * Math.PI / 180
      const ox = Math.cos(a), oz = Math.sin(a) * POND.rx / POND.rz
      const L = Math.hypot(ox, oz)
      const bx = rx + (ox / L) * 1.9, bz = rz + (oz / L) * 1.9
      const angle = Math.atan2(POND.x - bx, POND.z - bz)
      const b = placeBench(ctx, { x: bx, z: bz, angle, type: 'park', snow: kind, seed: 6950 + deg })
      if (story && b) placeStory(ctx, story, { bench: { ...b, angle, type: 'park' }, seed: 6960 })
    }
    for (const [name, d, side] of [['A', 60, 1], ['A', 140, -1], ['C', 48, 1], ['E', 22, 1], ['H', 30, 1], ['B', 70, -1]]) {
      const pts = pathPts(name)
      const p = alongPolyline(pts, d)
      const nx = -p.dz * side, nz = p.dx * side
      const off = ALLEYS[name].w / 2 + 0.9
      const angle = Math.atan2(-nx, -nz)
      placeBench(ctx, { x: p.x + nx * off, z: p.z + nz * off, angle, type: 'park', seed: 6970 + d })
    }
  })
  // ---- lanterns: low cast-iron park lamps, pools of light far apart --------------------------------
  safe('lanterns', () => {
    const spots = [
      ['A', 12, 1, false], ['A', 48, -1, false], ['A', 86, 1, true], ['A', 120, -1, false], ['A', 152, 1, true],
      ['B', 24, 1, false], ['B', 68, 1, true], ['B', 112, -1, true], ['B', 150, 1, false],
      ['C', 16, 1, false], ['C', 66, -1, true],
      ['E', 16, -1, false], ['E', 52, 1, false], ['F', 30, 1, true], ['G', 18, -1, false], ['G', 52, 1, false],
      ['H', 28, -1, true], ['H', 62, 1, false], ['J', 20, 1, true],
    ]
    for (const [name, d, side, broken] of spots) {
      const pts = pathPts(name)
      if (d > polylineLength(pts)) continue
      const p = alongPolyline(pts, d)
      const off = ALLEYS[name].w / 2 + 0.7
      const x = p.x - p.dz * side * off, z = p.z + p.dx * side * off
      const r = placeStreetLamp(ctx, { x, z, type: 'park', broken, flicker: d === 120 ? 'buzz' : false, seed: 7000 + Math.round(x * 3 + z) })
      if (r?.light) out.lights++
      out.lanterns.push({ x, z, broken })
    }
    // the plaza: two lanterns at the entrance from the gate; the ring round the pond: three
    for (const [x, z, broken] of [[MEMORIAL.plaza[2] - 0.8, MEMORIAL.plaza[1] + 0.8, false], [MEMORIAL.plaza[2] - 0.8, MEMORIAL.plaza[3] - 0.8, true]]) {
      const r = placeStreetLamp(ctx, { x, z, type: 'park', broken, flicker: false, seed: 7101 + z })
      if (r?.light) out.lights++
    }
    for (const [deg, broken] of [[-80, false], [-170, true], [118, false], [30, true]]) {
      const [rx, rz] = ringAt(deg)
      const a = deg * Math.PI / 180
      const r = placeStreetLamp(ctx, { x: rx + Math.cos(a) * 1.3, z: rz + Math.sin(a) * 1.3, type: 'park', broken, flicker: false, seed: 7120 + deg })
      if (r?.light) out.lights++
    }
  })
  // ---- steam from a manhole on the main alley (the heating main runs under the park) --------------
  safe('manhole', () => {
    const p = alongPolyline(pathPts('A'), 30)
    placeManhole(ctx, { x: p.x + 0.4, z: p.z, wet: true, steam: 0.85 })
    ctx.terrain.paintCircle(p.x + 0.4, p.z, 2.4, { mat: M('snow_dirty'), only: new Set([M('snow'), M('snow_fresh'), M('snow_bank'), M('snow_packed')]) })
    ctx.terrain.paintCircle(p.x + 0.4, p.z, 1.4, { mat: M('earth'), only: new Set([M('snow_dirty')]) })
  })
  // ---- story -------------------------------------------------------------------------------------
  safe('park story', () => {
    placeStory(ctx, 'glove', { x: FENCE.x - 1.1, z: GATES.e412.z + 3.6, seed: 7201 })
    placeStory(ctx, 'sled', { x: HILL.x + 12.5, z: HILL.z + 5.2, angle: 1.9, seed: 7202 })
    placeStory(ctx, 'butts', { x: BANDSTAND.x + 4.4, z: BANDSTAND.z - 4.6, angle: 0.3, seed: 7203, inspect: false })
    addGraffiti(ctx, { x: BANDSTAND.x + 2.2, y: 0.5 + 0.55, z: BANDSTAND.z - 2.26, angle: PI, id: 'gr_tsoi', h: 0.36 })
  })
  // ---- trees: the birch grove, the fence rows, the pond and the rest -------------------------------
  safe('trees', () => {
    const keep = (x, z) => alleyDist(x, z) < 2.4 ||
      ((x - POND.x) / (POND.rx * 1.52)) ** 2 + ((z - POND.z) / (POND.rz * 1.52)) ** 2 < 1 ||
      (x > MEMORIAL.plaza[0] - 2 && x < MEMORIAL.plaza[2] + 7 && z > MEMORIAL.plaza[1] - 2 && z < MEMORIAL.plaza[3] + 2) ||
      Math.abs(x - CAFE.x) < 7 && Math.abs(z - CAFE.z) < 6 ||
      Math.abs(x - BANDSTAND.x) < 9 && z > 428 && z < 458 ||
      Math.abs(x - PLAYGROUND.x) < 14 && Math.abs(z - PLAYGROUND.z) < 11 ||
      ((x - HILL.x) / (HILL.rx + 2)) ** 2 + ((z - HILL.z) / (HILL.rz + 2)) ** 2 < 1 ||
      distToPolyline(x, z, SKI) < 1.6 ||
      x > FENCE.x - 2.2 || z < FENCE.zN + 2.2 || z > FENCE.zS - 2.2
    // the main alley is lined with old lindens (and a few maples) on both sides, like every Soviet park
    out.avenue = []
    {
      const pts = pathPts('A'), L = polylineLength(pts)
      const busy = [...out.lanterns.map(l => [l.x, l.z]), ...(ctx.registry.benches || []).map(b => [b.x, b.z])]
      for (let d = 10; d < L - 6; d += 9.2) {
        const p = alongPolyline(pts, d)
        for (const side of [-1, 1]) {
          const x = p.x - p.dz * side * 3.7, z = p.z + p.dx * side * 3.7
          if (busy.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 2.2) || x > FENCE.x - 2 || alleyDist(x, z) < 1.8) continue
          const t = placeTree(ctx, { x, z, species: (Math.round(d) + side) % 5 === 0 ? 'maple:norway' : 'linden', size: 'large', seed: Math.round(d * 13 + side * 7) })
          if (t) out.avenue.push(t)
        }
      }
    }
    // the birch grove: north-west and south-west, dense, in clumps
    out.grove = [
      ...scatterTrees(ctx, { rect: [26, 151, 94, 300], density: 0.72, species: { 'birch:single': 0.66, 'birch:clump': 0.14, spruce: 0.08, linden: 0.06, rowan: 0.06 }, avoid: keep, minSpacing: 3.6, clump: 0.65, seed: 7301 }),
      ...scatterTrees(ctx, { rect: [26, 360, 72, 497], density: 0.68, species: { 'birch:single': 0.68, 'birch:clump': 0.12, spruce: 0.1, maple: 0.1 }, avoid: keep, minSpacing: 3.6, clump: 0.65, seed: 7302 }),
    ]
    // sparser mixed planting in the east half
    out.east = [
      ...scatterTrees(ctx, { rect: [94, 151, 137, 300], density: 0.11, species: { birch: 0.5, linden: 0.25, maple: 0.15, spruce: 0.1 }, avoid: keep, minSpacing: 6, seed: 7303 }),
      ...scatterTrees(ctx, { rect: [72, 362, 137, 497], density: 0.11, species: { birch: 0.55, linden: 0.25, rowan: 0.1, spruce: 0.1 }, avoid: keep, minSpacing: 6, seed: 7304 }),
      ...scatterTrees(ctx, { rect: [26, 300, 44, 360], density: 0.3, species: { birch: 0.8, spruce: 0.2 }, avoid: keep, minSpacing: 5, seed: 7305 }),
    ]
    // old lindens and poplars along the fences
    const rowSkip = (x, z) => Object.values(GATES).some(g => Math.hypot(x - g.x, z - g.z) < 6) || alleyDist(x, z) < 2
    out.rows = [
      ...placeTreeRow(ctx, { x0: FENCE.x - 3.4, z0: 156, x1: FENCE.x - 3.4, z1: 493, spacing: 11.5, species: { linden: 0.6, 'poplar:natural': 0.25, birch: 0.15 }, jitter: 0.6, missing: 0.1, skip: (x, z) => rowSkip(x, z) || (z > 312 && z < 338), seed: 7310 }),
      ...placeTreeRow(ctx, { x0: 36, z0: FENCE.zN + 3.6, x1: 124, z1: FENCE.zN + 3.6, spacing: 11, species: { linden: 0.7, birch: 0.3 }, jitter: 0.6, missing: 0.1, skip: rowSkip, seed: 7311 }),
    ]
    // birches leaning over the pond shore
    for (const [x, z, v] of [[112, 312, 2], [50, 304, 7], [46, 349, 1], [108, 354, 0]]) placeTree(ctx, { x, z, species: 'birch', variant: v, seed: x * 11 + z })
    // snowberry and currant under the trees by the alleys
    for (const [name, d, side, kind] of [['B', 40, 1, 'snowberry'], ['B', 95, -1, 'currant'], ['C', 30, -1, 'snowberry'], ['E', 40, -1, 'currant'], ['H', 45, -1, 'snowberry'], ['A', 100, 1, 'currant'], ['F', 18, -1, 'snowberry']]) {
      const pts = pathPts(name)
      const p = alongPolyline(pts, d)
      const off = ALLEYS[name].w / 2 + 2.4
      placeBush(ctx, { x: p.x - p.dz * side * off, z: p.z + p.dx * side * off, kind, seed: d * 3 + side })
    }
    // lilac by the café and the plaza
    for (const [x, z] of [[94.5, 378.2], [108.6, 377.2], [118.6, 316.2], [118.6, 333.8]]) placeBush(ctx, { x, z, kind: 'lilac', seed: Math.round(x * 7 + z) })
    // crows: on a grove birch near the main alley and the café birch; on the ground by the café bin
    const all = [...out.grove, ...out.east, ...out.avenue]
    const near = (x, z) => all.reduce((b, t) => (!b || Math.hypot(t.x - x, t.z - z) < Math.hypot(b.x - x, b.z - z) ? t : b), null)
    const t1 = near(100, 230), t2 = out.cafeTree, t3 = near(60, 420)
    if (t1) addCrows(ctx, { perch: 'tree', tree: t1, count: 4, seed: 7321 })
    if (t2) addCrows(ctx, { perch: 'tree', tree: t2, count: 3, seed: 7322 })
    if (t3) addCrows(ctx, { perch: 'tree', tree: t3, count: 2, seed: 7323 })
    addCrows(ctx, { perch: 'ground', x: 107.5, z: 366.5, count: 3, seed: 7324 })
    const bagTree = near(102, 455)
    if (bagTree) addBag(ctx, { tree: bagTree, seed: 7325 })
    out.trees = all.length + out.rows.length + 10
  })
  // ---- nav: every alley, the trodden shortcuts --------------------------------------------------------
  for (const k of Object.keys(ALLEYS)) nav(ctx, pathPts(k), 'park')
  // the pond ring as a walkable loop
  const ring = []
  for (let d = 0; d <= 360; d += 15) ring.push(ringAt(d))
  nav(ctx, ring, 'park')
  TRODDEN.forEach(p => nav(ctx, p, 'trodden'))
  nav(ctx, [[MEMORIAL.plaza[2], MEMORIAL.z], [MEMORIAL.x + 3.8, MEMORIAL.z - 3.4], [MEMORIAL.x - 4, MEMORIAL.z - 3.4], [MEMORIAL.plaza[0], MEMORIAL.z]], 'park')
  nav(ctx, [[MEMORIAL.plaza[2], MEMORIAL.z], [MEMORIAL.x + 3.8, MEMORIAL.z + 3.4], [MEMORIAL.x - 4, MEMORIAL.z + 3.4], [MEMORIAL.plaza[0], MEMORIAL.z]], 'park')
  // crossings over Берёзовая meet blocks_west's ends at x 139.5 (z 236 and 412) and the E–W driveway axis
  nav(ctx, [[150.2, GATES.e325.z], [FENCE.x + 0.6, GATES.e325.z]], 'crossing')
  // ---- zones ------------------------------------------------------------------------------------------
  ctx.zones?.add({ name: 'park', min: [PARK.x0 - 10, -2, PARK.z0], max: [PARK.x1 + 0.5, 40, PARK.z1], reverb: 'park', wind: 0.78, traffic: 0.55, data: { pkg: 'north' } })
  ctx.zones?.add({ name: 'park_grove', min: [PARK.x0 - 10, -2, 151], max: [94, 40, 300], reverb: 'park', wind: 0.6, traffic: 0.45, priority: 1, data: { pkg: 'north' } })
  reg(ctx, 'landmarks', { kind: 'memorial', name: 'Памятник павшим 1941–1945', x: MEMORIAL.x, z: MEMORIAL.z, height: 7.5 })
  reg(ctx, 'landmarks', { kind: 'pond', name: 'Пруд в парке «Берёзовая роща»', x: POND.x, z: POND.z })
  reg(ctx, 'storySpots', { kind: 'lost_glove', x: FENCE.x - 1.1, z: GATES.e412.z + 3.6, pkg: 'north' })
  reg(ctx, 'storySpots', { kind: 'closed_cafe', x: CAFE.x, z: CAFE.z, pkg: 'north' })
  reg(ctx, 'storySpots', { kind: 'empty_stage', x: BANDSTAND.x, z: BANDSTAND.z, pkg: 'north' })
  return out
}
