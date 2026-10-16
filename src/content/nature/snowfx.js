// Terrain snow helpers for layouts: road windrows, drifts against walls, plough piles.
// They reshape the terrain heightfield (call them during build, before the world is finalized).

import { fbm2, valueNoise2, RNG, smoothstep, hash2 } from '../../core/rng.js'
import { VOXEL } from '../../core/constants.js'
import { M, hasMaterial, materialById } from '../../core/materials.js'
import { HOLE } from '../../core/Terrain.js'
import { MAT } from './materials.js'
import { BURIED, BURIED_TINT } from './props.js'

/**
 * Limit the step between neighbouring terrain columns to `maxStep` voxels inside a rect by raising
 * the lower column (a snow apron). The engine draws the part of any terrain drop deeper than two
 * voxels in dark concrete, which made steep snow piles read as masonry terraces. Raised columns
 * that were not snow become `fillMat`.
 */
export function relaxSlope(t, x0, z0, x1, z1, fillMat, maxStep = 2) {
  const n = t.n, Hh = t.h, Mt = t.mat
  const cx0 = Math.max(1, Math.floor(x0 / VOXEL)), cx1 = Math.min(n - 2, Math.floor(x1 / VOXEL))
  const cz0 = Math.max(1, Math.floor(z0 / VOXEL)), cz1 = Math.min(n - 2, Math.floor(z1 / VOXEL))
  if (cx1 < cx0 || cz1 < cz0) return
  const lift = (i, j) => {
    const hj = Hh[j]
    if (hj === HOLE || Hh[i] === HOLE) return
    if (hj - maxStep > Hh[i]) {
      Hh[i] = hj - maxStep
      if (fillMat && !materialById(Mt[i])?.snow) Mt[i] = fillMat
    }
  }
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) { const i = cx + cz * n; lift(i, i - 1); lift(i, i - n) }
  for (let cz = cz1; cz >= cz0; cz--)
    for (let cx = cx1; cx >= cx0; cx--) { const i = cx + cz * n; lift(i, i + 1); lift(i, i + n) }
}

const ROADISH = new Set(['asphalt', 'asphalt_wet', 'slush', 'road_marking', 'curb'].filter(hasMaterial).map(n => M(n)))

function sideIsRoad(t, x, z) {
  return ROADISH.has(t.materialAt(x, z))
}

/**
 * A plough windrow (снежный вал) filling the rect [x0,z0]–[x1,z1] (m), `height` m tall at the
 * crest. The long side of the rect is its length. opts: { dirtySide: 'auto'|'n'|'s'|'e'|'w'|'both'|'none',
 * seed, chunks (true: loose lumps on top), gaps: [[from,to],...] (m along the bank, cut for
 * crossings) }. The side facing the road is crusted grey-brown with soot and slush at its foot.
 */
export function snowBank(ctx, x0, z0, x1, z1, height = 1, opts = {}) {
  const t = ctx.terrain
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), az = Math.min(z0, z1), bz = Math.max(z0, z1)
  const alongX = bx - ax >= bz - az
  const L = alongX ? bx - ax : bz - az
  const W = alongX ? bz - az : bx - ax
  const seed = opts.seed ?? hash2(Math.round(ax * 4), Math.round(az * 4))
  const rng = new RNG(seed)
  // which side faces the road?
  let dirty = opts.dirtySide ?? 'auto'
  let dNeg = 0, dPos = 0 // negative-u side (n or w), positive-u side (s or e)
  if (dirty === 'auto') {
    let a = 0, b = 0
    for (let k = 0; k < 8; k++) {
      const s = (k + 0.5) / 8
      if (alongX) {
        const x = ax + s * L
        if (sideIsRoad(t, x, az - 0.8)) a++
        if (sideIsRoad(t, x, bz + 0.8)) b++
      } else {
        const z = az + s * L
        if (sideIsRoad(t, ax - 0.8, z)) a++
        if (sideIsRoad(t, bx + 0.8, z)) b++
      }
    }
    dNeg = a >= 3 ? 1 : 0.15
    dPos = b >= 3 ? 1 : 0.15
  } else {
    const negName = alongX ? 'n' : 'w', posName = alongX ? 's' : 'e'
    dNeg = dirty === negName || dirty === 'both' ? 1 : dirty === 'none' ? 0 : 0.15
    dPos = dirty === posName || dirty === 'both' ? 1 : dirty === 'none' ? 0 : 0.15
  }
  const gaps = opts.gaps || []
  t.apply(ax, az, bx, bz, (x, z, hv, mat) => {
    const v = alongX ? x - ax : z - az
    const u = ((alongX ? z - az : x - ax) / W) * 2 - 1 // −1..1 across
    for (const g of gaps) if (v > g[0] - 0.6 && v < g[1] + 0.6) return null
    let end = smoothstep(0, 1.4, v) * smoothstep(0, 1.4, L - v)
    for (const g of gaps) end *= smoothstep(g[0] - 0.6, g[0] - 1.8, v) + smoothstep(g[1] + 0.6, g[1] + 1.8, v)
    const au = Math.abs(u)
    let prof = smoothstep(1.0, 0.3, au)
    prof = Math.pow(prof, 0.85)
    const lump = 0.72 + 0.56 * fbm2(x * 0.45, z * 0.45, 3, seed)
    const add = height * prof * lump * Math.min(1, end)
    const dv = Math.round(add / VOXEL)
    if (dv <= 0) return null
    const dirtK = u < 0 ? dNeg : dPos
    // large soft patches (low frequency) so the bank reads as layered snow, not masonry
    const n = valueNoise2(x * 0.7, z * 0.7, seed + 5) * 0.75 + valueNoise2(x * 2.1, z * 2.1, seed + 6) * 0.25
    let m
    if (dirtK > 0.5 && au > 0.86) m = n < 0.5 ? MAT.snowGrime : MAT.snowDirty
    else if (dirtK > 0.5 && au > 0.45) m = n < 0.3 * dirtK ? MAT.snowGrime : n < 0.7 ? MAT.snowDirty : MAT.snowBank
    else if (au < 0.45) m = n < 0.6 ? MAT.snow : MAT.snowBank
    else m = n < 0.12 * dirtK + 0.06 ? MAT.snowDirty : n < 0.75 ? MAT.snowBank : MAT.snow
    return { h: hv + dv, mat: m }
  })
  relaxSlope(t, ax - 0.5, az - 0.5, bx + 0.5, bz + 0.5, MAT.snowDirty)
  // a few loose lumps of packed snow along the crest
  if (opts.chunks ?? true) {
    const n = Math.floor(L / rng.float(3.5, 6))
    for (let i = 0; i < n; i++) {
      const v = rng.float(0.8, L - 0.8)
      if (gaps.some(g => v > g[0] - 1 && v < g[1] + 1)) continue
      const u = rng.float(-0.35, 0.35) * W
      const x = alongX ? ax + v : (ax + bx) / 2 + u
      const z = alongX ? (az + bz) / 2 + u : az + v
      ctx.world.place(`nature_snow_chunk_${rng.int(0, 2)}`, { x, z, yOffset: -0.12, angle: rng.float(0, Math.PI * 2), tag: 'snow' })
    }
  }
  return { rect: [ax, az, bx, bz], height }
}

function parseDir(o) {
  if (Array.isArray(o.dir)) { const l = Math.hypot(o.dir[0], o.dir[1]) || 1; return [o.dir[0] / l, o.dir[1] / l] }
  switch (o.side ?? o.dir) {
    case 'n': return [0, -1]
    case 'e': return [1, 0]
    case 'w': return [-1, 0]
    default: return [0, 1]
  }
}

/**
 * Wind drift against a wall or fence. (x, z) = foot of the wall at the middle of the drift.
 * opts: { dir: [dx,dz] | side: 'n'|'s'|'e'|'w' (direction the drift spreads away from the wall,
 *         default 's'), length (along the wall, m, default 4), depth (away, default 2.2),
 *         height (at the wall, default 0.7), seed }
 */
export function snowDrift(ctx, x, z, opts = {}) {
  const t = ctx.terrain
  const [dx, dz] = parseDir(opts)
  const tx = -dz, tz = dx // along the wall
  const L = opts.length ?? 4, D = opts.depth ?? 2.2, H = opts.height ?? 0.7
  const seed = opts.seed ?? hash2(Math.round(x * 4), Math.round(z * 4) + 9)
  const R = Math.max(L / 2, D) + 0.5
  t.apply(x - R, z - R, x + R, z + R, (px, pz, hv, mat) => {
    const rx = px - x, rz = pz - z
    const w = rx * dx + rz * dz // away from the wall
    const s = rx * tx + rz * tz // along
    if (w < -0.05 || w > D) return null
    const sl = Math.abs(s) / (L / 2)
    if (sl > 1.15) return null
    const ends = 1 - Math.pow(Math.min(1, sl), 4)
    const wd = w / D
    // wind-scoured trough right at the wall, crest a little out, long tail
    let prof = wd < 0.12 ? 0.75 + 2.0 * wd : Math.pow(1 - (wd - 0.12) / 0.88, 1.6)
    prof *= ends * (0.85 + 0.3 * fbm2(px * 0.7, pz * 0.7, 2, seed))
    // sastrugi ripples
    prof += 0.06 * Math.sin(s * 3.1 + w * 2.0 + seed) * ends * (1 - wd)
    const dv = Math.round((H * prof) / VOXEL)
    if (dv <= 0) return null
    return { h: hv + dv, mat: wd > 0.75 ? mat : MAT.snowFresh }
  })
  relaxSlope(t, x - R, z - R, x + R, z + R, MAT.snowFresh)
  return { x, z, length: L, depth: D, height: H }
}

/**
 * Big plough pile (2–3 m) at the end of a driveway: lumpy, layered, grimy, with loose chunks at its
 * foot and — sometimes — something buried in it sticking out (a thrown-out New Year tree, a tyre,
 * a sled, a ski, a chair, a pallet).
 * opts: { radius (m, default 3), height (default 2.2), seed, buried: true|false|'yolka'|'tire'|
 *         'sled'|'ski'|'chair'|'pallet' (default: 45% chance of something), chunks (default true) }
 */
export function plowedPile(ctx, x, z, opts = {}) {
  const t = ctx.terrain
  const R = opts.radius ?? 3, H = opts.height ?? 2.2
  const seed = opts.seed ?? hash2(Math.round(x * 4) + 3, Math.round(z * 4))
  const rng = new RNG(seed)
  const lobes = [rng.float(0, 6.28), rng.float(0, 6.28), rng.float(0, 6.28)]
  // two or three heaps shoved together
  const heaps = [[0, 0, 1]]
  for (let k = 0; k < rng.int(1, 2); k++) {
    const a = rng.float(0, 6.28), d = rng.float(0.35, 0.6) * R
    heaps.push([Math.cos(a) * d, Math.sin(a) * d, rng.float(0.55, 0.8)])
  }
  const E = R * 1.6
  const items = []
  t.apply(x - E, z - E, x + E, z + E, (px, pz, hv, mat) => {
    let best = 0
    for (const [hx, hz, hk] of heaps) {
      const rx = px - x - hx, rz = pz - z - hz
      const th = Math.atan2(rz, rx)
      const Rt = R * hk * (1 + 0.14 * Math.sin(2 * th + lobes[0]) + 0.09 * Math.sin(3 * th + lobes[1]) + 0.06 * Math.sin(5 * th + lobes[2]))
      const r = Math.hypot(rx, rz) / Rt
      if (r >= 1) continue
      // steep pushed sides, rounded top
      const prof = Math.pow(smoothstep(1, 0.15, r), 0.8) * hk
      if (prof > best) best = prof
    }
    if (best <= 0) return null
    const lump = 0.7 + 0.42 * fbm2(px * 0.9, pz * 0.9, 3, seed) + 0.2 * (valueNoise2(px * 2.6, pz * 2.6, seed + 9) - 0.5)
    const dv = Math.round((H * best * lump) / VOXEL)
    if (dv <= 0) return null
    const n = valueNoise2(px * 1.8, pz * 1.8, seed + 2)
    // layers broken up by noise so the pile does not read as horizontal masonry courses
    const hRel = best + (valueNoise2(px * 1.1, pz * 1.1, seed + 4) - 0.5) * 0.6 + (valueNoise2(px * 3.1, pz * 3.1, seed + 8) - 0.5) * 0.25
    let m
    if (hRel > 0.62) m = n < 0.6 ? MAT.snow : MAT.snowBank
    else if (hRel > 0.25) m = n < 0.25 ? MAT.snowGrime : n < 0.62 ? MAT.snowDirty : MAT.snowBank
    else m = n < 0.18 ? MAT.slush : n < 0.6 ? MAT.snowDirty : MAT.snowGrime
    return { h: hv + dv, mat: m }
  })
  relaxSlope(t, x - E, z - E, x + E, z + E, MAT.snowDirty)
  if (opts.chunks ?? true) {
    for (let k = 0; k < rng.int(4, 8); k++) {
      const a = rng.float(0, 6.28), d = R * rng.float(0.85, 1.25)
      items.push(ctx.world.place(`nature_snow_chunk_${rng.int(0, 3)}`, { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, yOffset: -0.1, angle: rng.float(0, 6.28), tag: 'snow' }))
    }
  }
  let what = opts.buried
  if (what === undefined) what = rng.chance(0.45)
  if (what) {
    const kind = typeof what === 'string' ? what : rng.pick(BURIED)
    const a = rng.float(0, 6.28), d = R * rng.float(0.35, 0.65)
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
    const tints = BURIED_TINT[kind]
    items.push(ctx.world.place(`nature_buried_${kind}`, {
      x: px, z: pz, yOffset: -0.2, angle: rng.float(0, 6.28), tag: 'buried',
      tint: tints ? rng.pick(tints) : undefined,
    }))
  }
  return { x, z, radius: R, height: H, items: items.filter(Boolean) }
}
