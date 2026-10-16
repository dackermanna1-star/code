// Courtyard playground (детская площадка): Soviet painted steel in faded red/yellow/blue/green
// with rust — rocket slide, «паутинка» climbing dome, swings on rigid rods (dynamic seat that
// sways in the wind and creaks), a carousel that sometimes turns by itself, bars, Swedish wall,
// monkey bars, see-saw, sandbox (with a fly-agaric canopy), wooden play-house, painted tyre
// planters and swans, carpet-beating rack. placePlayground() lays out a typical set + fence.
//
// Convention: pivot bottom-centre unless noted; front = local +Z.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, rotXZ, seedInt, RNG, reg, groundY, getState, localToWorld, angleFacing } from './lib.js'
import { placeBench } from './seating.js'
import { placeStreetLamp } from './lamps.js'
import { placeFence } from './fences.js'
import './materials.js'

const PAINTS = () => [M('metal_red'), M('metal_yellow'), M('metal_blue'), M('metal_green'), M('street_paint_cyan')]
const pgOpts = { lods: [1], maxDistance: 170 }
export const TYRE_TINTS = [0xaaa79e, 0x8e4a3e, 0x5a7282, 0xa08e52, 0x5c7254, 0xa09c94]
export const RACK_TINTS = [0x55705c, 0x5e7180, 0x7b6a4a, 0x6b6e6a, 0x7d4f42]

// ---- rocket slide (ракета) ------------------------------------------------------------
function buildRocket() {
  const m = new VoxelModel(26, 31, 13)
  const cx = 6.5, cz = 6.5, R = 3.5
  const rod = M('metal_blue'), ring = M('metal_yellow'), fin = M('metal_red')
  const inRing = (x, z, r0, r1) => { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); return d >= r0 && d < r1 }
  const ang = (x, z) => Math.atan2(z + 0.5 - cz, x + 0.5 - cx)
  // vertical rods
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4
    const x = Math.round(cx + R * Math.cos(a) - 0.5), z = Math.round(cz + R * Math.sin(a) - 0.5)
    for (let y = 0; y <= 20; y++) {
      if (k === 0 && y >= 12 && y <= 15) continue // doorway to the chute
      m.set(x, y, z, rod)
    }
  }
  // rings
  for (const y of [1, 6, 11, 16, 20])
    for (let z = 0; z < 13; z++)
      for (let x = 0; x < 13; x++) {
        if (!inRing(x, z, R - 0.55, R + 0.55)) continue
        if (y >= 11 && y <= 16 && Math.abs(ang(x, z)) < 0.45 && y !== 16) continue
        m.set(x, y, z, ring)
      }
  // platform at 2.75 m
  for (let z = 0; z < 13; z++) for (let x = 0; x < 13; x++) if (inRing(x, z, 0, R - 0.4)) m.set(x, 11, z, M('street_galvanized'))
  // internal ladder rungs on the far side
  for (let y = 2; y < 11; y += 2) m.fill(3, y, 5, 1, 1, 3, M('street_galvanized'))
  // nose cone: red / white bands
  for (let y = 21; y <= 28; y++) {
    const r = 3.7 * (1 - (y - 21) / 8.2)
    const mat = Math.floor((y - 21) / 2) % 2 === 0 ? M('metal_red') : M('street_paint_white')
    for (let z = 0; z < 13; z++) for (let x = 0; x < 13; x++) if (inRing(x, z, 0, Math.max(0.6, r))) m.set(x, y, z, mat)
  }
  m.set(6, 29, 6, M('metal_dark'))
  // three fins (sheet steel)
  for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (let r = 3.6; r <= 6.2; r += 0.25) {
      const x = Math.round(cx + r * Math.cos(a) - 0.5), z = Math.round(cz + r * Math.sin(a) - 0.5)
      const h = Math.round(7 - (r - 3.6) * 1.9)
      for (let y = 0; y < h; y++) m.set(x, y, z, fin)
    }
  }
  // chute from the doorway (+X) down to the ground, 3 wide with rails
  const bed = M('chrome'), rail = M('metal_yellow')
  for (let i = 0; i <= 14; i++) {
    const x = 10 + i
    const y = Math.max(1, Math.round(11 - i * 0.78))
    m.fill(x, y, 5, 1, 1, 3, bed)
    m.set(x, y + 1, 4, rail); m.set(x, y + 1, 8, rail)
    m.set(x, y, 4, rail); m.set(x, y, 8, rail)
  }
  for (let y = 0; y < 6; y++) { m.set(17, y, 5, rod); m.set(17, y, 7, rod) }
  const rng = rngFor('rocket')
  rustify(m, rng, [rod, ring, fin, M('street_paint_white')], 0.1)
  snowTop(m, { chance: 0.6, seed: 21 })
  m.setPivot(6.5, 0, 6.5)
  return m
}
defineModel('street_pg_rocket', buildRocket, { lods: [1, 2], lodDistances: [60], maxDistance: 260 })

// ---- climbing dome «паутинка» ---------------------------------------------------------
function buildDome() {
  const m = new VoxelModel(13, 9, 13)
  const rx = 6, ry = 7.2, c = 6.5
  const paints = PAINTS()
  const step = Math.PI / 4
  for (let y = 0; y < 8; y++)
    for (let z = 0; z < 13; z++)
      for (let x = 0; x < 13; x++) {
        const dx = x + 0.5 - c, dz = z + 0.5 - c, dy = y + 0.5
        const r = Math.sqrt((dx / rx) ** 2 + (dz / rx) ** 2 + (dy / ry) ** 2)
        if (Math.abs(r - 1) * rx > 0.55) continue
        const h = Math.hypot(dx, dz)
        const phi = Math.atan2(dz, dx)
        const k = Math.round(phi / step)
        const onMeridian = Math.abs(phi - k * step) * h < 0.55
        // open lattice: a ring every 0.75 m, so the dome reads as bars, not a heap
        const onRing = y % 3 === 0
        if (!onMeridian && !onRing && h > 1.2) continue
        m.set(x, y, z, onRing && !onMeridian ? M('metal_yellow') : paints[((k % 4) + 4) % 4])
      }
  m.set(6, 7, 6, M('metal_red'))
  rustify(m, rngFor('dome'), PAINTS(), 0.1)
  snowTop(m, { chance: 0.4, seed: 4 })
  return m
}
defineModel('street_pg_dome', buildDome, pgOpts)

// ---- swings -------------------------------------------------------------------------------
const SWING_FRAMES = 13
const SWING_STEP = 4 * Math.PI / 180
const SWING_R = 8 // rod length in voxels (2 m)
const HINGE_Y = 9.5, HINGE_Z = 4.5

function buildSwingFrame(len) {
  const m = new VoxelModel(len, 11, 9)
  const leg = M('paint_matte')
  for (const x of [0, len - 1]) {
    m.line(x, 0, 0, x, 9, 4, leg)
    m.line(x, 0, 8, x, 9, 4, leg)
    m.fill(x, 3, 2, 1, 1, 5, leg)
  }
  m.fill(0, 9, 4, len, 1, 1, M('metal_dark'))
  // hinge lugs above each seat position
  rustify(m, rngFor('swingframe' + len), [leg], 0.2)
  snowTop(m, { chance: 0.85, seed: len, onlyAbove: 9 })
  return m
}
defineModel('street_pg_swing_frame', () => buildSwingFrame(9), { ...pgOpts })
defineModel('street_pg_swing_frame_double', () => buildSwingFrame(15), { ...pgOpts })

/** Seat position (voxel space, continuous) for frame i. */
function seatPos(i) {
  const th = (i - (SWING_FRAMES - 1) / 2) * SWING_STEP
  return { th, z: HINGE_Z + SWING_R * Math.sin(th), y: HINGE_Y - SWING_R * Math.cos(th) }
}
for (let i = 0; i < SWING_FRAMES; i++) {
  defineModel(`street_pg_swing_seat_${i}`, () => {
    const m = new VoxelModel(3, 10, 9)
    const p = seatPos(i)
    const rodMat = M('street_galvanized')
    const sz = Math.round(p.z - 0.5), sy = Math.round(p.y - 0.5)
    const tz = HINGE_Z + 1.2 * Math.sin(p.th) - 0.5, ty = HINGE_Y - 1.2 * Math.cos(p.th) - 0.5
    for (const x of [0, 2]) m.line(x, ty, tz, x, sy + 1, sz, rodMat)
    m.fill(0, sy, sz, 3, 1, 1, M('wood_painted_blue'))
    m.set(1, sy, sz, M('wood'))
    if (i === (SWING_FRAMES - 1) / 2) m.set(1, sy + 1, sz, M('snow')) // a little snow on the seat at rest
    m.setPivot(1.5, 0, HINGE_Z)
    return m
  }, { lods: [1], maxDistance: 120, collide: false, contact: false })
}

/**
 * A swing frame with 1 or 2 seats hanging on rigid rods. The bar runs along local X; seats
 * swing toward ±Z. Seats sway with the wind and creak ('swing_creak', created lazily).
 * opts: { x, z, y?, angle, seats: 1|2, tint, seed, still: false }
 */
export function placeSwing(ctx, opts) {
  const seats = opts.seats === 2 ? 2 : 1
  const seed = seedInt(opts.seed, 41)
  const rng = new RNG(seed)
  const angle = opts.angle ?? 0
  const tint = opts.tint ?? RACK_TINTS[rng.int(0, RACK_TINTS.length - 1)]
  const frame = put(ctx, seats === 2 ? 'street_pg_swing_frame_double' : 'street_pg_swing_frame', { x: opts.x, z: opts.z, y: opts.y, angle, seed, tint, tag: 'playground' })
  const y = frame ? frame.y : groundY(ctx, opts.x, opts.z)
  const offs = seats === 2 ? [-0.85, 0.85] : [0]
  const state = getState(ctx)
  const out = []
  for (const ox of offs) {
    const [dx, dz] = rotXZ(ox, 0, angle)
    const sx = opts.x + dx, sz = opts.z + dz
    const frames = []
    for (let i = 0; i < SWING_FRAMES; i++) frames.push(put(ctx, `street_pg_swing_seat_${i}`, { x: sx, z: sz, y, angle, seed, collide: false, visible: i === (SWING_FRAMES - 1) / 2, tag: 'swing' }))
    const sw = { x: sx, y, z: sz, angle, sa: Math.sin(angle), ca: Math.cos(angle), frames, cur: (SWING_FRAMES - 1) / 2, phase: rng.float(0, 6.28), period: rng.float(2.8, 3.3), amp: 0, still: !!opts.still, emitter: null, bias: rng.float(0.6, 1.4) }
    state.swings.push(sw)
    out.push(sw)
  }
  return { placement: frame, seats: out }
}

/** Per-frame swing animation (called from the package update). */
export function updateSwings(ctx, dt, state, cam) {
  const wind = ctx.atmos?.windSpeed ?? 0.5
  const t = state.time
  const audio = ctx.audio
  for (const sw of state.swings) {
    const dx = sw.x - cam.x, dz = sw.z - cam.z
    const d2 = dx * dx + dz * dz
    if (d2 > 140 * 140) { if (sw.emitter) { sw.emitter.stop(0.3); sw.emitter = null } continue }
    const target = sw.still ? 0 : Math.min(0.32, (0.03 + wind * 0.045) * sw.bias)
    sw.amp += (target - sw.amp) * Math.min(1, dt * 0.3)
    const th = sw.amp * Math.sin((t / sw.period) * Math.PI * 2 + sw.phase) * (0.75 + 0.25 * Math.sin(t * 0.13 + sw.phase))
    let i = Math.round(th / SWING_STEP + (SWING_FRAMES - 1) / 2)
    i = Math.max(0, Math.min(SWING_FRAMES - 1, i))
    if (i !== sw.cur) { sw.frames[sw.cur] && (sw.frames[sw.cur].visible = false); sw.frames[i] && (sw.frames[i].visible = true); sw.cur = i }
    // smooth the voxel steps: offset the visible frame by the residual of the true arc
    const p = sw.frames[i]
    if (p) {
      const fz = (SWING_R * Math.sin((i - (SWING_FRAMES - 1) / 2) * SWING_STEP))
      const rz = (SWING_R * Math.sin(th) - fz) * 0.25
      // local (0, rz) rotated by the swing angle (no per-frame allocation)
      p.set(sw.x + rz * sw.sa, sw.y, sw.z + rz * sw.ca, sw.angle)
    }
    // creak loop near the player, louder with the swing amplitude
    if (audio?.ready && audio.has?.('swing_creak')) {
      if (!sw.emitter && d2 < 32 * 32 && sw.amp > 0.04) {
        sw.emitter = audio.play('swing_creak', { pos: [sw.x, sw.y + 1.2, sw.z], loop: true, gain: 0, bus: 'ambience', refDistance: 3, maxDistance: 60, period: sw.period })
      } else if (sw.emitter && (d2 > 48 * 48 || sw.amp < 0.02)) { sw.emitter.stop(0.5); sw.emitter = null }
      if (sw.emitter) sw.emitter.setGain(Math.min(0.9, sw.amp * 3.2), 0.4)
    }
  }
}

// ---- carousel -----------------------------------------------------------------------------
defineModel('street_pg_carousel_base', () => {
  const m = new VoxelModel(3, 1, 3)
  m.fill(0, 0, 0, 3, 1, 3, M('concrete_dark'))
  m.set(1, 0, 1, M('metal_dark'))
  return m
}, { lods: [1], maxDistance: 120 })

defineModel('street_pg_carousel_disc', () => {
  const m = new VoxelModel(9, 7, 9)
  const c = 4.5
  const paints = [M('metal_red'), M('metal_yellow'), M('metal_blue'), M('metal_green')]
  for (let z = 0; z < 9; z++)
    for (let x = 0; x < 9; x++) {
      const dx = x + 0.5 - c, dz = z + 0.5 - c
      const d = Math.hypot(dx, dz)
      if (d > 4.55) continue
      const sector = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8) % 8
      m.set(x, 1, z, d > 3.6 ? M('metal_dark') : paints[sector % 4])
    }
  m.fill(4, 2, 4, 1, 3, 1, M('metal_dark'))
  // steering wheel on top
  m.set(3, 5, 4, M('metal_red')); m.set(5, 5, 4, M('metal_red')); m.set(4, 5, 3, M('metal_red')); m.set(4, 5, 5, M('metal_red'))
  // four handlebars (П-shaped)
  const bars = [[7, 4, 0, 1], [1, 4, 0, 1], [4, 7, 1, 0], [4, 1, 1, 0]]
  for (const [x, z, ax, az] of bars) {
    m.set(x - ax, 2, z - az, M('metal_yellow')); m.set(x + ax, 2, z + az, M('metal_yellow'))
    m.set(x - ax, 3, z - az, M('metal_yellow')); m.set(x + ax, 3, z + az, M('metal_yellow'))
    m.set(x, 3, z, M('metal_yellow'))
  }
  rustify(m, rngFor('carousel'), [...paints, M('metal_yellow')], 0.18)
  snowTop(m, { chance: 0.7, seed: 9 })
  m.setPivot(4.5, 0, 4.5)
  return m
}, { lods: [1], maxDistance: 120, dynamic: true, contact: false })

/**
 * Carousel: a dynamic disc that turns by itself now and then (a gust, a ghost of a push),
 * creaking ('swing_creak' pitched down), and can be pushed by the player.
 * opts: { x, z, y?, angle, seed, pushable=true }
 */
export function placeCarousel(ctx, opts) {
  const seed = seedInt(opts.seed, 77)
  const rng = new RNG(seed)
  const angle = opts.angle ?? rng.float(0, Math.PI * 2)
  const base = put(ctx, 'street_pg_carousel_base', { x: opts.x, z: opts.z, y: opts.y, angle: 0, seed, tag: 'playground' })
  const y = base ? base.y : groundY(ctx, opts.x, opts.z)
  const disc = put(ctx, 'street_pg_carousel_disc', { x: opts.x, z: opts.z, y, angle, seed, dynamic: true, tag: 'carousel' })
  const st = { x: opts.x, y, z: opts.z, disc, angle, omega: 0, next: rng.float(40, 160), rng, emitter: null }
  getState(ctx).carousels.push(st)
  if (opts.pushable !== false && ctx.interactions) {
    ctx.interactions.add({
      x: opts.x, y: y + 0.6, z: opts.z, size: [2.2, 0.9, 2.2], reach: 2.0, tag: 'carousel',
      prompt: { ru: 'Толкнуть карусель', en: 'Push the carousel' },
      onUse() { st.omega += (st.omega >= 0 ? 1 : -1) * 0.9; if (Math.abs(st.omega) > 2.4) st.omega = Math.sign(st.omega) * 2.4 },
    })
  }
  return { placement: disc, base, state: st }
}

export function updateCarousels(ctx, dt, state, cam) {
  const audio = ctx.audio
  for (const c of state.carousels) {
    c.next -= dt
    if (c.next <= 0) {
      // nobody is there. it turns anyway, a little
      c.omega += (c.rng.chance(0.5) ? 1 : -1) * c.rng.float(0.25, 0.6)
      c.next = c.rng.float(70, 260)
    }
    if (Math.abs(c.omega) > 0.001) {
      c.angle += c.omega * dt
      c.omega *= Math.exp(-dt * 0.12)
      if (Math.abs(c.omega) < 0.01) c.omega = 0
      c.disc?.set(c.x, c.y, c.z, c.angle)
    }
    const dx = c.x - cam.x, dz = c.z - cam.z, d2 = dx * dx + dz * dz
    if (audio?.ready && audio.has?.('swing_creak')) {
      const moving = Math.abs(c.omega) > 0.05
      if (!c.emitter && moving && d2 < 30 * 30) c.emitter = audio.play('swing_creak', { pos: [c.x, c.y + 0.5, c.z], loop: true, gain: 0, bus: 'ambience', refDistance: 3, maxDistance: 55, period: 1.6, pitch: 0.7 })
      else if (c.emitter && (!moving || d2 > 45 * 45)) { c.emitter.stop(0.6); c.emitter = null }
      if (c.emitter) c.emitter.setGain(Math.min(0.8, Math.abs(c.omega) * 0.9), 0.3)
    }
  }
}

// ---- bars, Swedish wall, monkey bars, see-saw -----------------------------------------------
defineModel('street_pg_bars', () => {
  const m = new VoxelModel(13, 11, 1)
  const p = M('metal_blue')
  m.fill(0, 0, 0, 1, 6, 1, p); m.fill(4, 0, 0, 1, 8, 1, p); m.fill(8, 0, 0, 1, 10, 1, p); m.fill(12, 0, 0, 1, 10, 1, p)
  const b = M('street_galvanized')
  m.fill(1, 5, 0, 3, 1, 1, b); m.fill(5, 7, 0, 3, 1, 1, b); m.fill(9, 9, 0, 3, 1, 1, b)
  rustify(m, rngFor('bars'), [p], 0.2)
  snowTop(m, { chance: 0.6, seed: 13 })
  return m
}, pgOpts)

defineModel('street_pg_ladder', () => {
  const m = new VoxelModel(7, 11, 1)
  const p = M('metal_green')
  m.fill(0, 0, 0, 1, 10, 1, p); m.fill(6, 0, 0, 1, 10, 1, p)
  for (let y = 1; y < 10; y += 2) m.fill(1, y, 0, 5, 1, 1, y % 4 === 1 ? M('metal_yellow') : M('street_galvanized'))
  rustify(m, rngFor('ladder'), [p, M('metal_yellow')], 0.22)
  snowTop(m, { chance: 0.6, seed: 17 })
  return m
}, pgOpts)

defineModel('street_pg_monkeybars', () => {
  const m = new VoxelModel(13, 11, 5)
  const p = M('metal_red')
  for (const x of [0, 12]) for (const z of [0, 4]) m.fill(x, 0, z, 1, 9, 1, p)
  m.fill(0, 9, 0, 13, 1, 1, p); m.fill(0, 9, 4, 13, 1, 1, p)
  for (let x = 1; x < 12; x += 2) m.fill(x, 9, 1, 1, 1, 3, M('street_galvanized'))
  rustify(m, rngFor('monkey'), [p], 0.2)
  snowTop(m, { chance: 0.6, seed: 19 })
  return m
}, pgOpts)

defineModel('street_pg_seesaw', () => {
  const m = new VoxelModel(13, 6, 3)
  m.fill(6, 0, 0, 1, 2, 3, M('metal_dark'))
  const beam = M('metal_yellow')
  for (let x = 0; x < 13; x++) {
    const y = Math.floor(0.6 + x * 0.24)
    m.set(x, y, 1, beam)
    if (x <= 1 || x >= 11) { m.set(x, y, 0, M('wood')); m.set(x, y, 2, M('wood')); m.set(x, y, 1, M('wood')) }
  }
  for (const x of [3, 9]) {
    const y = Math.floor(0.6 + x * 0.24)
    m.set(x, y + 1, 1, M('metal_red')); m.set(x, y + 2, 1, M('metal_red'))
    m.set(x, y + 2, 0, M('metal_red')); m.set(x, y + 2, 2, M('metal_red'))
  }
  rustify(m, rngFor('seesaw'), [beam, M('metal_red')], 0.2)
  snowTop(m, { chance: 0.85, seed: 23 })
  return m
}, pgOpts)

// ---- sandbox ------------------------------------------------------------------------------
function buildSandbox(mushroom) {
  const m = new VoxelModel(9, mushroom ? 13 : 3, 9)
  const sides = [M('wood_painted_blue'), M('wood_painted_green'), M('wood'), M('wood_painted_blue')]
  for (let i = 0; i < 9; i++) {
    m.set(i, 0, 0, sides[0]); m.set(i, 0, 8, sides[1]); m.set(0, 0, i, sides[2]); m.set(8, 0, i, sides[3])
  }
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) m.set(x, 0, z, M('wood_dark')) // corner seats
  m.fill(1, 0, 1, 7, 1, 7, M('snow_fresh'))
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) m.set(x, 0, z, M('wood_dark'))
  m.fill(3, 1, 3, 3, 1, 2, M('snow_fresh')) // a small heap — a buried sandcastle?
  if (mushroom) {
    m.fill(4, 1, 4, 1, 8, 1, M('street_paint_white'))
    const red = M('metal_red'), white = M('street_paint_white')
    const rng = rngFor('mushroom')
    for (let y = 9; y <= 11; y++)
      for (let z = 0; z < 9; z++)
        for (let x = 0; x < 9; x++) {
          const dx = (x + 0.5 - 4.5) / 3.6, dz = (z + 0.5 - 4.5) / 3.6, dy = (y + 0.5 - 9) / 2.6
          if (dx * dx + dz * dz + dy * dy > 1) continue
          m.set(x, y, z, y === 9 ? white : (rng.chance(0.14) ? white : red))
        }
    rustify(m, rng, [M('street_paint_white')], 0.1)
  }
  snowTop(m, { chance: 0.9, seed: 29, depth: 1 })
  return m
}
defineModel('street_pg_sandbox', () => buildSandbox(false), pgOpts)
defineModel('street_pg_sandbox_mushroom', () => buildSandbox(true), pgOpts)

// ---- wooden play-house --------------------------------------------------------------------
defineModel('street_pg_house', () => {
  const m = new VoxelModel(8, 12, 8)
  const w = M('wood'), wd = M('wood_dark')
  for (let y = 0; y < 6; y++) {
    const mat = y % 2 ? wd : w
    m.fill(1, y, 1, 6, 1, 1, mat); m.fill(1, y, 6, 6, 1, 1, mat)
    m.fill(1, y, 1, 1, 1, 6, mat); m.fill(6, y, 1, 1, 1, 6, mat)
  }
  m.fill(2, 0, 2, 4, 1, 4, M('wood_dark')) // floor
  m.clear(3, 0, 6, 2, 4, 1) // door
  m.clear(1, 2, 3, 1, 2, 2); m.clear(6, 2, 3, 1, 2, 2) // windows
  // gable roof, ridge along X
  const roof = M('paint_matte')
  for (let z = 0; z < 8; z++) {
    const yr = 6 + Math.min(z, 7 - z)
    m.fill(0, yr, z, 8, 1, 1, roof)
    for (const x of [1, 6]) if (z >= 1 && z <= 6) m.fill(x, 6, z, 1, yr - 6, 1, w)
  }
  m.fill(0, 10, 3, 8, 1, 2, M('wood_dark'))
  snowTop(m, { chance: 0.95, seed: 31, depth: 1, vary: 1 })
  return m
}, { ...pgOpts, occludesSnow: true })

// ---- tyres ----------------------------------------------------------------------------------
defineModel('street_tyre_planter', () => {
  const m = new VoxelModel(3, 3, 3)
  const p = M('paint_matte')
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) if (x !== 1 || z !== 1) m.set(x, 0, z, p)
  m.set(1, 0, 1, M('earth'))
  for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]]) m.set(x, 1, z, p)
  m.set(1, 1, 1, M('snow'))
  snowTop(m, { chance: 0.6, seed: 43 })
  return m
}, { lods: [1], maxDistance: 90 })

defineModel('street_tyre_half', () => {
  const m = new VoxelModel(3, 3, 1)
  const p = M('paint_matte')
  m.set(0, 0, 0, p); m.set(0, 1, 0, p); m.set(1, 1, 0, p); m.set(2, 1, 0, p); m.set(2, 0, 0, p)
  snowTop(m, { chance: 0.7, seed: 44 })
  return m
}, { lods: [1], maxDistance: 90 })

defineModel('street_tyre_swan', () => {
  const m = new VoxelModel(3, 6, 7)
  const wht = M('street_paint_white')
  m.fill(0, 0, 0, 3, 1, 5, M('rubber'))
  m.fill(0, 1, 0, 3, 1, 5, wht)
  m.fill(1, 1, 1, 1, 1, 3, M('snow'))
  for (const z of [1, 3]) { m.set(0, 2, z, wht); m.set(2, 2, z, wht) }
  m.set(1, 2, 0, wht)
  m.set(1, 2, 4, wht); m.set(1, 3, 4, wht); m.set(1, 4, 4, wht); m.set(1, 4, 5, wht)
  m.set(1, 4, 6, M('metal_red'))
  m.set(1, 5, 5, M('snow'))
  return m
}, { lods: [1], maxDistance: 90 })

// ---- carpet-beating rack (выбивалка) ----------------------------------------------------
defineModel('street_carpet_rack', () => {
  const m = new VoxelModel(13, 10, 1)
  const p = M('paint_matte')
  m.fill(0, 0, 0, 1, 9, 1, p); m.fill(12, 0, 0, 1, 9, 1, p)
  m.fill(0, 8, 0, 13, 1, 1, p)
  m.fill(0, 4, 0, 13, 1, 1, p)
  rustify(m, rngFor('rack'), [p], 0.3)
  snowTop(m, { chance: 0.7, seed: 37 })
  return m
}, pgOpts)

defineModel('street_carpet_draped', () => {
  const m = new VoxelModel(11, 11, 3)
  const red = M('fabric_red'), beige = M('street_fabric_beige')
  const pat = (x, y) => {
    if (x === 0 || x === 10 || y === 3) return beige
    const dx = Math.abs(x - 5), dy = Math.abs(y - 6)
    return dx + dy === 2 || (dx === 0 && dy === 0) ? beige : red
  }
  for (let x = 0; x < 11; x++) {
    m.set(x, 9, 1, red)
    for (let y = 3; y <= 9; y++) { m.set(x, y, 0, pat(x, y)); m.set(x, y, 2, pat(10 - x, y)) }
  }
  snowTop(m, { chance: 0.6, seed: 41 })
  return m
}, { lods: [1], maxDistance: 110 })

// ---- individual helpers ---------------------------------------------------------------------
function simple(name, tag = 'playground') {
  return (ctx, o = {}) => put(ctx, name, { ...o, tag: o.tag ?? tag, seed: seedInt(o.seed, 3) })
}
export const placeRocketSlide = simple('street_pg_rocket')
export const placeClimbingDome = simple('street_pg_dome')
export const placeBars = simple('street_pg_bars')
export const placeLadder = simple('street_pg_ladder')
export const placeMonkeyBars = simple('street_pg_monkeybars')
export const placeSeesaw = simple('street_pg_seesaw')
export const placeSandbox = (ctx, o = {}) => put(ctx, o.mushroom ? 'street_pg_sandbox_mushroom' : 'street_pg_sandbox', { ...o, tag: o.tag ?? 'playground', seed: seedInt(o.seed, 3) })
export const placePlayhouse = (ctx, o = {}) => put(ctx, 'street_pg_house', { ...o, tag: o.tag ?? 'playground', tint: o.tint ?? [0x7d4f42, 0x5e7180, 0x55705c][seedInt(o.seed, 3) % 3] })
export function placeTyrePlanter(ctx, o = {}) {
  const r = new RNG(seedInt(o.seed ?? (o.x * 13 + o.z * 7), 9))
  return put(ctx, 'street_tyre_planter', { ...o, angle: o.angle ?? r.float(0, 1.5), tint: o.tint ?? TYRE_TINTS[r.int(0, TYRE_TINTS.length - 1)], tag: 'playground' })
}
export function placeTyreSwan(ctx, o = {}) { return put(ctx, 'street_tyre_swan', { ...o, tag: 'playground' }) }

/** Carpet rack, optionally with a red carpet draped over the top bar. opts: { x, z, angle, carpet, tint, seed } */
export function placeCarpetRack(ctx, o = {}) {
  const r = new RNG(seedInt(o.seed ?? (o.x * 3 + o.z), 11))
  const p = put(ctx, 'street_carpet_rack', { ...o, tint: o.tint ?? RACK_TINTS[r.int(0, RACK_TINTS.length - 1)], tag: 'yard' })
  let carpet = null
  if (o.carpet ?? r.chance(0.25)) carpet = put(ctx, 'street_carpet_draped', { x: o.x, z: o.z, y: p ? p.y : o.y, angle: o.angle, tag: 'yard' })
  return { placement: p, carpet }
}

// ---- layout -----------------------------------------------------------------------------------

/**
 * A typical courtyard playground set with a low arched fence and an entrance gap at the front
 * (local +Z). set 'full' ≈ 22 × 16 m, 'small' ≈ 12 × 9 m. opts: { x, z, angle, seed,
 * set: 'full'|'small', lamp: bool (full: true), fence: true, mittens: auto }
 * Returns { placements, swings, carousel, benches, lamp, bounds:{w,d} }.
 */
export function placePlayground(ctx, opts) {
  const seed = seedInt(opts.seed ?? (opts.x * 17 + opts.z * 3), 123)
  const rng = new RNG(seed)
  const angle = opts.angle ?? 0
  const full = (opts.set ?? 'full') !== 'small'
  const mirror = rng.chance(0.5) ? -1 : 1
  const o = { x: opts.x, z: opts.z, angle }
  const P = (lx, lz) => localToWorld(o, lx * mirror, lz)
  const A = a => angle + (mirror < 0 ? -a : a)
  const out = { placements: [], swings: [], carousel: null, benches: [], lamp: null, bounds: full ? { w: 22, d: 16 } : { w: 12, d: 9 } }
  const add = p => { if (p) out.placements.push(p); return p }
  const at = (lx, lz) => { const [x, z] = P(lx, lz); return { x, z } }
  const W = out.bounds.w / 2, D = out.bounds.d / 2
  if (full) {
    add(placeRocketSlide(ctx, { ...at(-8, -4), angle: A(0) + (mirror < 0 ? Math.PI : 0), seed: seed + 1 }))
    const sw = placeSwing(ctx, { ...at(0.5, -5.5), angle: A(0), seats: 2, seed: seed + 2 })
    add(sw.placement); out.swings.push(...sw.seats)
    if (rng.chance(0.75)) add(placeClimbingDome(ctx, { ...at(7, -4.5), angle: A(rng.float(0, 1)), seed: seed + 3 }))
    else add(placeMonkeyBars(ctx, { ...at(7, -4.5), angle: A(0), seed: seed + 3 }))
    if (rng.chance(0.75)) { const c = placeCarousel(ctx, { ...at(-1, 1.5), seed: seed + 4 }); out.carousel = c; add(c.base) }
    add(placeSandbox(ctx, { ...at(6.5, 2), angle: A(0), mushroom: rng.chance(0.7), seed: seed + 5 }))
    add(placeSeesaw(ctx, { ...at(-7.5, 3.5), angle: A(rng.chance(0.5) ? 0 : Math.PI), seed: seed + 6 }))
    add(rng.chance(0.5) ? placeBars(ctx, { ...at(8.6, 5.6), angle: A(0), seed: seed + 7 }) : placeLadder(ctx, { ...at(9, 5.6), angle: A(0), seed: seed + 7 }))
    if (rng.chance(0.6)) add(placePlayhouse(ctx, { ...at(9.4, -0.6), angle: A(-Math.PI / 2), seed: seed + 8 }))
    const mitt = opts.mittens ?? rng.chance(0.3)
    out.benches.push(placeBench(ctx, { ...at(-4.2, 6.9), angle: A(Math.PI), type: 'courtyard', seed: seed + 9, mittens: mitt }))
    out.benches.push(placeBench(ctx, { ...at(3.6, 6.9), angle: A(Math.PI), type: 'courtyard', seed: seed + 10 }))
    if (rng.chance(0.6)) out.benches.push(placeBench(ctx, { ...at(-10.1, -0.5), angle: A(Math.PI / 2), type: 'courtyard', seed: seed + 11 }))
    add(placeTyreSwan(ctx, { ...at(-1.9, 7.4), angle: A(0) }))
    add(placeTyreSwan(ctx, { ...at(1.9, 7.4), angle: A(0) }))
    for (let i = 0; i < 4; i++) add(placeTyrePlanter(ctx, { ...at(-10 + i * 0.85, 7.3), seed: seed + 20 + i }))
    for (let i = 0; i < 3; i++) add(placeTyrePlanter(ctx, { ...at(10.2, -7.2 + i * 0.85), seed: seed + 30 + i }))
    if (opts.lamp !== false) {
      // one courtyard lamp at the front edge, just past the benches, leaning over the set
      const [lx, lz] = P(-6.2, 7.7)
      const [tx, tz] = P(0, 0)
      out.lamp = placeStreetLamp(ctx, { x: lx, z: lz, type: 'courtyard', angle: angleFacing(tx - lx, tz - lz), seed: seed + 40 })
    }
  } else {
    const sw = placeSwing(ctx, { ...at(-3, -2.2), angle: A(0), seats: 1, seed: seed + 2 })
    add(sw.placement); out.swings.push(...sw.seats)
    add(placeSandbox(ctx, { ...at(2.6, -1.6), angle: A(0), mushroom: rng.chance(0.3), seed: seed + 5 }))
    if (rng.chance(0.5)) { const c = placeCarousel(ctx, { ...at(2.8, 2.2), seed: seed + 4 }); out.carousel = c; add(c.base) } else add(placeSeesaw(ctx, { ...at(2.6, 2.4), angle: A(0), seed: seed + 6 }))
    add(placeLadder(ctx, { ...at(-3.6, 2.6), angle: A(0), seed: seed + 7 }))
    out.benches.push(placeBench(ctx, { ...at(-0.2, 3.7), angle: A(Math.PI), type: 'courtyard', seed: seed + 9, mittens: opts.mittens ?? rng.chance(0.2) }))
    add(placeTyreSwan(ctx, { ...at(-1.6, 4.0), angle: A(0) }))
    add(placeTyrePlanter(ctx, { ...at(5.2, 3.8), seed: seed + 20 }))
    add(placeTyrePlanter(ctx, { ...at(5.2, 2.9), seed: seed + 21 }))
  }
  if (opts.fence !== false) {
    const g = full ? 1.4 : 1.0
    const pts = [[g, D], [W, D], [W, -D], [-W, -D], [-W, D], [-g, D]].map(([lx, lz]) => P(lx, lz))
    const f = placeFence(ctx, { points: pts, type: 'lawn', seed: seed + 50, tint: rng.chance(0.5) ? 0x5c7556 : 0x7a7748 })
    out.placements.push(...f)
  }
  reg(ctx, 'playgrounds', { x: opts.x, z: opts.z, angle, set: full ? 'full' : 'small', bounds: out.bounds })
  return out
}
