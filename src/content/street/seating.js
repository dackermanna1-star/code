// Benches: Soviet park bench on cast-iron sides, courtyard bench (concrete legs, green slats,
// back), entrance bench without a back (where the бабушки sit in summer), metal stop bench.
// Every bench is sittable ('Сесть' → player.sit), carries snow on the seat (optionally
// brushed off where somebody sat), and may hold a pair of forgotten children's mittens.
//
// Model convention: pivot bottom-centre, the sitter faces local +Z (front).

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, rotXZ, seedInt, RNG, reg, groundY, getState, speckle } from './lib.js'
import './materials.js'

// seat geometry per type: length (voxels), seat row y, seat z range, back
const TYPES = {
  park: { len: 8, depth: 3, seatZ: [1, 2], back: true },
  courtyard: { len: 8, depth: 3, seatZ: [1, 2], back: true },
  entrance: { len: 7, depth: 2, seatZ: [0, 1], back: false },
  stop: { len: 6, depth: 2, seatZ: [0, 1], back: false },
}

function buildBench(type, snow) {
  const t = TYPES[type]
  const m = new VoxelModel(t.len, 5, t.depth)
  const rng = rngFor('bench_' + type)
  const L = t.len
  if (type === 'park') {
    const ci = M('street_cast_iron')
    // cast-iron side frames: foot, seat support, back post
    for (const x of [0, L - 1]) {
      m.fill(x, 0, 0, 1, 1, 1, ci); m.fill(x, 0, 2, 1, 1, 1, ci)
      m.fill(x, 1, 0, 1, 1, 3, ci)
      m.fill(x, 2, 0, 1, 2, 1, ci)
    }
    m.fill(1, 1, 1, L - 2, 1, 2, M('wood'))
    m.fill(1, 2, 0, L - 2, 2, 1, M('wood'))
    // the lower back plank is darker (old varnish), a broken slat gap
    m.fill(1, 2, 0, L - 2, 1, 1, M('wood_dark'))
    m.set(3, 3, 0, 0)
    speckle(m, rng, [M('wood')], M('wood_dark'), 0.12)
  } else if (type === 'courtyard') {
    const c = M('concrete')
    m.fill(0, 0, 1, 1, 1, 2, c); m.fill(L - 1, 0, 1, 1, 1, 2, c)
    m.fill(0, 1, 1, L, 1, 2, M('wood_painted_green'))
    // back on two steel brackets
    m.fill(1, 1, 0, 1, 2, 1, M('metal_dark')); m.fill(L - 2, 1, 0, 1, 2, 1, M('metal_dark'))
    m.fill(0, 2, 0, L, 1, 1, M('wood_painted_green'))
    m.fill(0, 3, 0, L, 1, 1, M('wood_painted_green'))
    m.set(5, 3, 0, 0); m.set(6, 3, 0, 0) // missing slat end
    speckle(m, rng, [M('wood_painted_green')], M('wood'), 0.2)
    speckle(m, rng, [M('concrete')], M('concrete_dark'), 0.4)
  } else if (type === 'entrance') {
    const c = M('concrete_dark')
    m.fill(0, 0, 0, 1, 1, 2, c); m.fill(L - 1, 0, 0, 1, 1, 2, c)
    m.fill(0, 1, 0, L, 1, 2, M('wood_painted_green'))
    speckle(m, rng, [M('wood_painted_green')], M('wood'), 0.25)
    m.set(2, 1, 0, M('wood_dark'))
  } else {
    // stop bench: galvanized slats on steel legs
    const g = M('street_galvanized')
    m.fill(0, 0, 0, 1, 1, 2, M('metal_dark')); m.fill(L - 1, 0, 0, 1, 1, 2, M('metal_dark'))
    m.fill(0, 1, 0, L, 1, 2, g)
    rustify(m, rng, [g], 0.1)
  }
  if (snow !== 'none') {
    snowTop(m, { seed: 3 + L, chance: 0.95 })
    if (snow === 'brushed') {
      // someone sat here: seat cleared on a 2-voxel stretch, a little ridge left either side
      for (const z of t.seatZ) { m.set(3, 2, z, 0); m.set(4, 2, z, 0) }
    }
  }
  return m
}

for (const type of Object.keys(TYPES))
  for (const snow of ['snow', 'brushed', 'none'])
    defineModel(`street_bench_${type}${snow === 'snow' ? '' : '_' + snow}`, () => buildBench(type, snow), { lods: [1], maxDistance: 130 })

defineModel('street_mittens', () => {
  const m = new VoxelModel(2, 1, 1)
  m.set(0, 0, 0, M('fabric_red'))
  m.set(1, 0, 0, M('fabric_red'))
  return m
}, { lods: [1], maxDistance: 60, collide: false, contact: false })

/** AABB size of a rotated rectangle (local w along X, d along Z). */
export function rotatedSize(w, d, angle) {
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  return [w * c + d * s, d * c + w * s]
}

/**
 * Add a 'Сесть' interaction for a seat. o: { x, z, angle (sitter faces (sin a, cos a)),
 * seatY (absolute top of the seat), lx (local offset along the bench of the sit spot),
 * width (bench length m), depth, tag }
 */
export function addSeat(ctx, o) {
  if (!ctx.interactions || !ctx.player) return null
  const angle = o.angle ?? 0
  const [ox, oz] = rotXZ(o.lx ?? 0, o.lz ?? 0, angle)
  const sx = o.x + ox, sz = o.z + oz
  const [fx, fz] = rotXZ(0, 1, angle)
  const [bw, bd] = rotatedSize(o.width ?? 1.8, o.depth ?? 0.6, angle)
  const standX = sx + fx * 0.75, standZ = sz + fz * 0.75
  const V3 = ctx.THREE?.Vector3
  const state = getState(ctx)
  const seatTop = o.seatY
  const it = ctx.interactions.add({
    x: sx, y: seatTop, z: sz, size: [bw, 0.55, bd], reach: 2.2, tag: o.tag ?? 'bench',
    prompt: { ru: 'Сесть', en: 'Sit' },
    enabled: game => game.player?.mode === 'walk',
    onUse(game) {
      const gy = groundY(ctx, standX, standZ)
      const standPos = V3 ? new V3(standX, Math.max(gy, seatTop - 0.5), standZ) : { x: standX, y: gy, z: standZ }
      game.player.sit({ x: sx, y: seatTop - 0.44, z: sz, standPos, yaw: angle + Math.PI })
      state.sit = { seat: game.player.seat, yaw: angle + Math.PI }
      game.events?.emit?.('sit', { x: sx, z: sz, kind: o.tag ?? 'bench' })
    },
  })
  return it
}

/**
 * Place a bench. opts: { x, z, y?, angle=0 (sitter faces (sin a, cos a)),
 *   type: 'park'|'courtyard'|'entrance'|'stop', sittable=true, snow: true|false|'brushed'|'auto',
 *   mittens=false, seed, tag='bench' }
 * Returns { placement, interaction, seat:{x,y,z} }.
 */
export function placeBench(ctx, opts = {}) {
  const type = TYPES[opts.type] ? opts.type : 'courtyard'
  const seed = seedInt(opts.seed ?? (opts.x * 31.7 + opts.z * 7.3), 5)
  const rng = new RNG(seed)
  let snow = opts.snow ?? 'auto'
  if (snow === 'auto') snow = rng.chance(0.2) ? 'brushed' : 'snow'
  if (snow === true) snow = 'snow'
  if (snow === false) snow = 'none'
  const model = `street_bench_${type}${snow === 'snow' ? '' : '_' + snow}`
  const angle = opts.angle ?? 0
  const t = TYPES[type]
  const placement = put(ctx, model, { x: opts.x, z: opts.z, y: opts.y, angle, seed, tag: opts.tag ?? 'bench' })
  const baseY = placement ? placement.y : groundY(ctx, opts.x, opts.z)
  const seatTop = baseY + 0.5
  // seat centre in local metres (pivot = centre of footprint)
  const seatZc = ((t.seatZ[0] + t.seatZ[1] + 1) / 2 - t.depth / 2) * 0.25
  const sitLx = 0
  let interaction = null
  if (opts.sittable !== false) interaction = addSeat(ctx, { x: opts.x, z: opts.z, angle, seatY: seatTop, lx: sitLx, lz: seatZc, width: t.len * 0.25, depth: t.depth * 0.25 + 0.1 })
  if (opts.mittens) {
    const [mx, mz] = rotXZ(rng.chance(0.5) ? -0.55 : 0.55, seatZc, angle)
    put(ctx, 'street_mittens', { x: opts.x + mx, z: opts.z + mz, y: seatTop + (snow === 'none' ? 0 : 0.25), angle: angle + rng.float(-0.4, 0.4), tag: 'story' })
  }
  const [sx, sz] = rotXZ(sitLx, seatZc, angle)
  const seat = { x: opts.x + sx, y: seatTop, z: opts.z + sz }
  reg(ctx, 'benches', { x: opts.x, z: opts.z, angle, type, seat, placement })
  return { placement, interaction, seat }
}

export const BENCH_TYPES = Object.keys(TYPES)
