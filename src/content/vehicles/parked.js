// Parked cars and buses for the layout packages: static placements with plates (static signs),
// snow variants (with a terrain drift for half-buried cars), the 'warm' story car (engine
// running, fogged glass, exhaust, idle sound), and the parked bus / trolleybus at a terminal
// (interior lights at night, heater idling, exhaust steam).

import { RNG, hashf, valueNoise2 } from '../../core/rng.js'
import { CAR_INFO, carModelName } from './cars.js'
import { BIG_INFO } from './big.js'
import { makePlate, drawPlate, drawRouteBoard, drawPainted, ROUTES, plateString } from './plates.js'
import { TYPE_PALETTE, CAR_PALETTE } from './palette.js'

/** 2008 outskirts car mix for random parking (weights). */
export const PARK_MIX = [
  ['vaz2107', 15], ['vaz2106', 9], ['vaz21099', 12], ['vaz2110', 13], ['moskvich2141', 5], ['volga3110', 6],
  ['nexia', 11], ['focus', 9], ['gazelle_van', 4], ['gazelle', 2], ['uaz452', 3],
]
/** Snow state mix for cars in courtyards (weights). */
export const SNOW_MIX = [['heavy', 40], ['light', 22], ['buried', 16], ['brushed', 10], ['none', 4]]

function seedRng(o, x, z) {
  const s = o.seed
  if (s === undefined || s === null) return new RNG(Math.floor(hashf(Math.floor(x * 4), Math.floor(z * 4), 911) * 4294967295))
  return new RNG(s > 0 && s < 1 ? Math.floor(s * 4294967295) : Math.floor(s) || 1)
}

/** Shared per-game state of this module (warm cars, idling buses). */
export function parkedState(ctx) {
  return ctx.registry._vehParked || (ctx.registry._vehParked = { warm: [], idling: [], drift: new Map() })
}

function signsBuilt(ctx) { return !!(ctx.signs && ctx.signs.meshes && ctx.signs.meshes.length) }

function worldOf(x, y, z, angle, l) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [x + l[0] * c + l[2] * s, y + l[1], z - l[0] * s + l[2] * c]
}

/** Static plate sign. facing: 'front' | 'rear' of a vehicle at angle. */
function plateSign(ctx, plate, wp, angle, facing, seed) {
  if (!ctx.signs || signsBuilt(ctx)) return
  ctx.signs.add({
    x: wp[0], y: wp[1], z: wp[2], angle: facing === 'front' ? angle + Math.PI : angle,
    w: 0.52, h: 0.112, ppm: 240, draw: (c, W, H) => drawPlate(c, W, H, plate, { seed, dirt: 0.55 }),
  })
}

/**
 * Place a parked car. Call during build() (plates are static signs; the 'buried' drift shapes the
 * terrain). Also accepts the short form placeParkedCar(ctx, x, z, angle, opts).
 * o: { x, z, angle (facing: 0 = front to north, π/2 = west), type, snow: 'none'|'light'|'heavy'|
 *      'buried'|'brushed', tint, warm, seed, y, plate (false = none), drift: true }
 * Returns { placement, type, model, plate, info } or null.
 */
export function placeParkedCar(ctx, a, b, c, d) {
  let o = a
  if (typeof a === 'number') o = { ...(d || {}), x: a, z: b, angle: c }
  if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) return null
  const rng = seedRng(o, o.x, o.z)
  const type = CAR_INFO[o.type] ? o.type : rng.weighted(PARK_MIX)
  const warm = !!o.warm
  const snow0 = o.snow ?? rng.weighted(SNOW_MIX)
  const snow = warm ? 'heavy' : snow0 // the warm car has its own model; never a buried drift
  const model = carModelName(type, snow, warm)
  const info = CAR_INFO[type]
  const angle = o.angle ?? 0
  const tint = o.tint ?? rng.pick(TYPE_PALETTE[type] ?? CAR_PALETTE)
  if (!ctx.world.finalized && o.y === undefined) { try { clearDrift(ctx, o.x, o.z, angle, info) } catch { /* best effort */ } }
  const p = ctx.world.place(model, { x: o.x, z: o.z, y: o.y, angle, tint, seed: rng.next(), tag: 'car', userData: { type, snow, warm } })
  if (!p) return null
  p.flag = 0
  // a drift around the half-buried car (terrain), windward = the car's left
  if (snow === 'buried' && o.drift !== false && !ctx.world.finalized) {
    try { buriedDrift(ctx, o.x, o.z, angle, info, rng) } catch { /* terrain shaping is best effort */ }
  }
  let plate = null
  if (o.plate !== false) {
    plate = makePlate(rng, type === 'gazelle' ? 'route' : 'civil')
    const ps = rng.int(1, 999)
    if (snow !== 'buried') plateSign(ctx, plate, worldOf(o.x, p.y, o.z, angle, info.plateFront), angle, 'front', ps)
    plateSign(ctx, plate, worldOf(o.x, p.y, o.z, angle, info.plateRear), angle, 'rear', ps + 1)
  }
  const rec = { placement: p, type, model, snow, warm, plate: plate ? plateString(plate) : null, info, x: o.x, y: p.y, z: o.z, angle }
  ;(ctx.registry.parkedCars ||= []).push(rec)
  if (warm) {
    const st = parkedState(ctx)
    const ex = worldOf(o.x, p.y, o.z, angle, info.exhaust)
    const hood = worldOf(o.x, p.y, o.z, angle, info.hood)
    rec.exhaust = ex
    rec.idleVariant = type === 'volga3110' ? 1 : 0
    st.warm.push(rec)
    try {
      ctx.interactions.add({
        x: hood[0], y: hood[1], z: hood[2], size: [1.4, 0.6, 1.4], reach: 2.2,
        prompt: { ru: 'Капот', en: 'Hood' },
        onUse: game => game.ui?.say?.({ ru: 'Капот тёплый, снег на нём растаял. Мотор работает, стёкла запотели изнутри.', en: 'The hood is warm, the snow on it has melted. The engine is running; the windows are fogged from inside.' }, 5),
        tag: 'car',
      })
    } catch { /* interactions optional */ }
  }
  return rec
}

/** Is world point (px, pz) inside a parked car's footprint grown by `pad` metres? */
function inCar(r, px, pz, pad) {
  const c = Math.cos(r.angle), s = Math.sin(r.angle)
  const dx = px - r.x, dz = pz - r.z
  const lx = dx * c - dz * s, lz = dx * s + dz * c
  return Math.abs(lx) < r.info.W / 2 + pad && Math.abs(lz) < r.info.L / 2 + pad
}

/**
 * Terrain drift around a half-buried car: a long bank against the windward flank (the car's
 * left) that wraps a little round the nose and the tail and dies out on the lee side. Never
 * raises the ground under another parked car (cells are remembered so a car parked later
 * flattens the drift under itself again).
 */
function buriedDrift(ctx, x, z, angle, info, rng) {
  const t = ctx.terrain
  const c = Math.cos(angle), s = Math.sin(angle)
  const hw = info.W / 2, hl = info.L / 2
  const H0 = 0.72, reachW = 3.4, reachL = 1.3
  const R = Math.hypot(hl + reachW, hw + reachW) + 0.5
  const base = t.heightAt(x, z)
  if (!Number.isFinite(base)) return
  const M = ctx.M
  const snow = M('snow'), fresh = M('snow_fresh')
  const seed = rng.int(1, 9999)
  const st = parkedState(ctx)
  const near = (ctx.registry.parkedCars || []).filter(r => Math.hypot(r.x - x, r.z - z) < R + 4)
  t.apply(x - R, z - R, x + R, z + R, (px, pz, hVox, mat) => {
    if (hVox < -1000) return null
    const dx = px - x, dz = pz - z
    // to car-local: lx along +X (right), lz along +Z (back)
    const lx = dx * c - dz * s, lz = dx * s + dz * c
    const ex = Math.max(0, Math.abs(lx) - hw), ez = Math.max(0, Math.abs(lz) - hl)
    if (ex <= 0 && ez <= 0) return null // under the car: the model carries its own drift
    // windwardness: 1 along the left flank, fading to 0 across the ends toward the right
    const w = Math.min(1, Math.max(0, 0.5 - lx / (2 * hw)))
    if (w <= 0.02) return null
    const reach = reachL + (reachW - reachL) * w * w
    const e = Math.hypot(ex, ez)
    if (e >= reach) return null
    const k = 1 - e / reach
    const n = 0.8 + 0.4 * valueNoise2(px * 0.9, pz * 0.9, seed)
    const hTop = H0 * Math.pow(w, 1.5) * k * k * (3 - 2 * k) * n
    const target = Math.round((base + hTop) / 0.25)
    if (target <= hVox) return null
    for (const r of near) if (inCar(r, px, pz, 0.35)) return null
    const key = Math.floor(px / 0.25) * 65536 + Math.floor(pz / 0.25)
    if (!st.drift.has(key)) st.drift.set(key, [hVox, mat])
    return { h: target, mat: k > 0.55 ? fresh : snow }
  })
}

/** Flatten any buried-car drift under a car about to be parked at (x, z, angle). */
function clearDrift(ctx, x, z, angle, info) {
  const st = parkedState(ctx)
  if (!st.drift.size) return
  const r = { x, z, angle, info }
  const R = Math.hypot(info.L, info.W) / 2 + 0.6
  ctx.terrain.apply(x - R, z - R, x + R, z + R, (px, pz) => {
    const key = Math.floor(px / 0.25) * 65536 + Math.floor(pz / 0.25)
    const o = st.drift.get(key)
    if (!o || !inCar(r, px, pz, 0.35)) return null
    st.drift.delete(key)
    return { h: o[0], mat: o[1] }
  })
}

/**
 * A row of parked cars between (x0,z0) and (x1,z1). angle = facing of the cars. If the cars
 * stand across the row (perpendicular parking) slots are 2.6 m wide, else 5.8 m long.
 * o: { x0, z0, x1, z1, angle, density = 0.7, seed, types: [...], snow: fixed or mix, warmChance = 0.03, flip = 0.3 }
 * Returns the placed records.
 */
export function parkRow(ctx, o) {
  const rng = seedRng(o, o.x0 + o.x1, o.z0 + o.z1)
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0
  const len = Math.hypot(dx, dz)
  if (len < 1) return []
  const ux = dx / len, uz = dz / len
  const angle = o.angle ?? 0
  const fx = -Math.sin(angle), fz = -Math.cos(angle)
  const across = Math.abs(fx * ux + fz * uz) < 0.5
  const slot = o.slot ?? (across ? 2.6 : 5.8)
  const n = Math.max(1, Math.floor(len / slot))
  const pad = (len - n * slot) / 2
  const out = []
  const mix = o.types ? o.types.map(t => (Array.isArray(t) ? t : [t, 1])) : PARK_MIX
  let warmLeft = o.warm === false ? 0 : 1
  for (let i = 0; i < n; i++) {
    if (!rng.chance(o.density ?? 0.7)) continue
    const t = pad + slot * (i + 0.5)
    const jx = rng.float(-0.18, 0.18), jz = across ? rng.float(-0.25, 0.25) : rng.float(-0.12, 0.12)
    const x = o.x0 + ux * t + (across ? fx * jz : 0) + ux * jx
    const z = o.z0 + uz * t + (across ? fz * jz : 0) + uz * jx
    const flip = across && rng.chance(o.flip ?? 0.3)
    const a = angle + (flip ? Math.PI : 0) + rng.float(-0.07, 0.07)
    const warm = warmLeft > 0 && rng.chance(o.warmChance ?? 0.03)
    if (warm) warmLeft--
    const rec = placeParkedCar(ctx, {
      x, z, angle: a, type: rng.weighted(mix), snow: Array.isArray(o.snow) ? rng.weighted(o.snow) : o.snow, warm,
      seed: rng.next(), y: o.y,
    })
    if (rec) out.push(rec)
  }
  return out
}

/**
 * A parked bus or trolleybus (bus terminal, depot gate). Call during build().
 * o: { x, z, angle, kind: 'bus'|'trolleybus', lit (interior lights at night, default true), poles: 'up'|'down',
 *      route: {num, from, to} | index, idle (heater/engine running, default true for buses), seed, tint, snow }
 */
export function placeParkedBus(ctx, o) {
  const rng = seedRng(o, o.x, o.z)
  const kind = o.kind === 'trolleybus' ? 'trolleybus' : 'bus'
  const info = kind === 'bus' ? BIG_INFO.liaz : BIG_INFO.ziu
  const model = kind === 'bus' ? (o.snow ? 'veh_liaz5256_snow' : 'veh_liaz5256_parked') : (o.poles === 'down' ? 'veh_ziu682_down' : 'veh_ziu682_parked')
  const angle = o.angle ?? 0
  const p = ctx.world.place(model, { x: o.x, z: o.z, y: o.y, angle, seed: rng.next(), tint: o.tint ?? rng.pick([0xe4e2d8, 0xe4e2d8, 0xd9cfae]), tag: kind, flag: 0 })
  if (!p) return null
  const lit = o.lit !== false
  if (lit) {
    const wp = worldOf(o.x, p.y, o.z, angle, info.lightInterior)
    // the light drives the placement flag: ceiling tubes and far windows glow from dusk to dawn
    ctx.lights.add({ x: wp[0], y: wp[1], z: wp[2], color: 0xe6eedc, intensity: 6, range: 9, domain: 'all', schedule: 'night', placement: p, halo: false, scatter: 0.12, tag: 'bus_interior' })
  }
  const routes = ROUTES[kind]
  const route = typeof o.route === 'object' && o.route ? o.route : routes[(o.route ?? rng.int(0, routes.length - 1)) % routes.length]
  if (ctx.signs && !signsBuilt(ctx)) {
    const plate = makePlate(rng, 'route')
    plateSign(ctx, plate, worldOf(o.x, p.y, o.z, angle, info.plateFront), angle, 'front', 1)
    plateSign(ctx, plate, worldOf(o.x, p.y, o.z, angle, info.plateRear), angle, 'rear', 2)
    const bf = worldOf(o.x, p.y, o.z, angle, info.boardFront)
    const led = kind === 'bus'
    const placard = o.placard ?? (rng.chance(0.4) ? 'В ПАРК' : null)
    ctx.signs.add({ x: bf[0], y: bf[1], z: bf[2], angle: angle + Math.PI, w: 1.9, h: 0.32, ppm: 110, emissive: lit ? (led ? 1.4 : 0.4) : 0, schedule: 'night',
      draw: (c, W, H) => drawRouteBoard(c, W, H, { num: route.num, from: route.from, to: route.to, led }) })
    if (placard) {
      // «В ПАРК» (to the depot) card propped behind the windshield
      const pc = worldOf(o.x, p.y, o.z, angle, info.placard)
      ctx.signs.add({ x: pc[0], y: pc[1], z: pc[2], angle: angle + Math.PI, w: 0.62, h: 0.2, ppm: 120, lines: [placard], bg: '#e6e2cf', color: '#b0221c', aged: 0.3 })
    }
    if (kind === 'trolleybus') {
      const fl = String(rng.int(3, 9)) + String(rng.int(100, 999))
      const fs = worldOf(o.x, p.y, o.z, angle, info.fleetSide)
      ctx.signs.add({ x: fs[0], y: fs[1], z: fs[2], angle: angle + Math.PI / 2, w: 0.55, h: 0.2, ppm: 160, draw: (c, W, H) => drawPainted(c, W, H, fl, { color: '#e8e6dc' }) })
    }
  }
  const rec = { placement: p, kind, route, x: o.x, y: p.y, z: o.z, angle, info, idle: o.idle ?? kind === 'bus' }
  rec.exhaust = info.exhaust ? worldOf(o.x, p.y, o.z, angle, info.exhaust) : null
  ;(ctx.registry.parkedBuses ||= []).push(rec)
  if (rec.idle) parkedState(ctx).idling.push(rec)
  return rec
}

/** Runtime: idle sounds and exhaust for warm cars and idling buses near the player. */
export class ParkedRuntime {
  constructor(sys) {
    this.sys = sys
    this.st = parkedState(sys.ctx)
  }

  init() {
    const steam = this.sys.steam
    if (!steam) return
    for (const r of [...this.st.warm, ...this.st.idling]) {
      if (!r.exhaust) continue
      try { r.steamH = steam(this.sys.ctx, { x: r.exhaust[0], y: r.exhaust[1], z: r.exhaust[2], kind: 'exhaust', rate: r.kind ? 9 : 6, maxDist: 60 }) } catch { r.steamH = null }
    }
  }

  update(dt, ctx, cam) {
    const audio = ctx.audio
    if (!audio || !audio.ready) return
    this._t = (this._t ?? 0) - dt
    if (this._t > 0) return
    this._t = 0.25
    for (const r of this.st.warm) this._idle(audio, cam, r, 40, { variant: r.idleVariant ?? 0, gain: 0.8 })
    for (const r of this.st.idling) this._idle(audio, cam, r, 55, { variant: 1, gain: 0.9, rate: 0.82 })
  }

  _idle(audio, cam, r, range, o) {
    const d = Math.hypot(r.x - cam.x, r.z - cam.z)
    try {
      if (!r.em && d < range) {
        const e = r.exhaust || [r.x, r.y + 0.4, r.z]
        r.em = audio.play('car_idle', { pos: [e[0], e[1] + 0.2, e[2]], loop: true, variant: o.variant, gain: o.gain })
        if (r.em && o.rate) r.em.setRate(o.rate)
      } else if (r.em && d > range + 12) { r.em.stop(0.8); r.em = null }
    } catch { r.em = null }
  }
}
