// District boiler house (котельная): a red-brick hall with tall steel-framed industrial windows
// (some panes lit cold from inside, some boarded or bricked up), a roof lantern, an operator's
// annex, a flue duct to a 55 m chimney painted in red and white bands with service platforms
// and blinking red aviation lights — the landmark visible over the roofs. Plus insulated heat
// pipes on supports (with snow-free tops) and a П-shaped pipe arch over a driveway.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG, hashf } from '../../core/rng.js'
import {
  V, HALF_PI, Frame, frameFor, put, sign, readable, light, flatten, navPath, reg, seed01, seedInt,
  win, ffill, fset, streak, drawText, dangerPlate, PLAIN_FONT, SIGN_FONT,
} from './lib.js'
import { addEmitter, RT } from './runtime.js'

// ---- boiler hall ---------------------------------------------------------------------------
const BX = 152, BZ = 80, HALLX = 120, HALLZ = 64, HTOP = 48
const BPX = 60, BPZ = 32
const FLUE_X = 84 // flue duct x (voxels) — 6 m east of the hall centre

function industrialWindow(m, face, u, y, w, h, rng, litChance) {
  // steel frame grid with 2 × 2 panes; panes dark, lit, boarded, bricked or broken
  ffill(m, face, u, y, 0, w, h, 1, 0)
  const lit = rng.chance(litChance)
  const litTop = y + rng.int(2, 8), litBot = y + h - rng.int(2, 10)
  for (let yy = y; yy < y + h; yy++)
    for (let uu = u; uu < u + w; uu++) {
      const fu = (uu - u) % 3 === 0 || uu === u + w - 1, fy = (yy - y) % 3 === 0 || yy === y + h - 1
      if (fu || fy) { fset(m, face, uu, yy, 1, M('metal_dark')); continue }
      let mat = M('pub_glass_dark')
      const r = rng.next()
      // a lit window glows as a whole (the hall lamps are behind it), with a few dead panes
      if (lit && yy > litTop && yy < litBot && r > 0.2) mat = M('pub_win_lit_dirty')
      else if (r < 0.06) mat = M('wood')
      else if (r < 0.1) mat = M('brick_red')
      else if (r < 0.13) mat = M('metal_dark')
      fset(m, face, uu, yy, 1, mat)
    }
  ffill(m, face, u - 1, y + h, 0, w + 2, 1, 1, M('concrete'))
  for (let uu = u; uu < u + w; uu++) if (rng.chance(0.7)) fset(m, face, uu, y, 0, M('snow'))
}

defineModel('pub_boiler', () => {
  const m = new VoxelModel(BX, HTOP + 10, BZ)
  m.setPivot(BPX, 0, BPZ)
  const rng = new RNG(3333)
  const brick = M('brick_red')
  // hall
  m.fill(0, 0, 0, HALLX, HTOP + 1, HALLZ, M('concrete'))
  for (const [face, len] of [['front', HALLX], ['back', HALLX], ['left', HALLZ]]) {
    ffill(m, face, 0, 0, 0, len, HTOP, 1, brick)
    ffill(m, face, 0, 0, 0, len, 3, 1, M('concrete_dark'))
    ffill(m, face, 0, HTOP - 2, 0, len, 2, 1, M('concrete'))
  }
  // the back face of the model is at z = BZ-1 (flue zone); hall back wall at z = HALLZ-1
  for (let y = 0; y < HTOP; y++) for (let x = 0; x < HALLX; x++) m.set(x, y, HALLZ - 1, y < 3 ? M('concrete_dark') : y >= HTOP - 2 ? M('concrete') : brick)
  for (let y = 0; y < HTOP; y++) for (let z = 0; z < HALLZ; z++) m.set(HALLX - 1, y, z, y < 3 ? M('concrete_dark') : y >= HTOP - 2 ? M('concrete') : brick)
  m.fill(0, HTOP, 0, HALLX, 1, HALLZ, M('roof_tar'))
  m.walls(0, HTOP + 1, 0, HALLX, 1, HALLZ, M('metal_gray'), 1)
  // brick pilasters between the windows
  for (const u of [4, 32, 60, 88, 116]) for (let y = 3; y < HTOP - 2; y++) { m.set(u, y, 0, brick); m.set(u + 1, y, 0, brick) }
  // big windows: front ×4, back ×4, left ×1
  for (const u of [8, 36, 64, 92]) {
    industrialWindow(m, 'front', u, 8, 19, 28, rng, 0.6)
    for (let y = 8; y < 36; y++) { fset(m, 'front', u - 1, y, 0, brick) }
  }
  for (const u of [8, 36, 64, 92]) {
    // back windows (mirror coordinates on the back wall plane z = HALLZ-1)
    for (let yy = 8; yy < 36; yy++) for (let uu = u; uu < u + 19; uu++) {
      const fu = (uu - u) % 3 === 0 || uu === u + 18, fy = (yy - 8) % 3 === 0 || yy === 35
      const r = rng.next()
      m.set(uu, yy, HALLZ - 1, fu || fy ? M('metal_dark') : (u === 36 || u === 92) && yy > 14 && yy < 30 && r > 0.2 ? M('pub_win_lit_dirty') : r < 0.06 ? M('wood') : M('pub_glass_dark'))
    }
  }
  // left side: the coal/equipment gate (two steel leaves + wicket), «посторонним» door
  ffill(m, 'left', 18, 0, 0, 22, 22, 1, M('metal_green'))
  ffill(m, 'left', 29, 0, 0, 1, 22, 1, M('metal_dark'))
  ffill(m, 'left', 20, 1, 0, 4, 8, 1, M('metal_dark'))
  ffill(m, 'left', 21, 1, 0, 2, 8, 1, M('metal_green'))
  for (let k = 0; k < 30; k++) fset(m, 'left', rng.int(18, 39), rng.int(0, 21), 0, M('metal_rust'))
  ffill(m, 'left', 17, 22, 0, 24, 1, 1, M('concrete'))
  // roof lantern (фонарь) with lit glazing along both sides
  m.fill(10, HTOP + 1, 24, 100, 7, 16, M('concrete'))
  for (let x = 10; x < 110; x++) for (let y = HTOP + 2; y < HTOP + 6; y++) {
    const pane = (x % 4 !== 0)
    m.set(x, y, 24, pane ? (hashf(x >> 3, 1, 1) < 0.45 ? M('pub_win_lit_dirty') : M('pub_glass_dark')) : M('metal_dark'))
    m.set(x, y, 39, pane ? (hashf(x >> 3, 2, 2) < 0.45 ? M('pub_win_lit_dirty') : M('pub_glass_dark')) : M('metal_dark'))
  }
  m.fill(9, HTOP + 7, 23, 102, 1, 18, M('metal_gray'))
  // roof vents and a ventilation stack
  for (const x of [20, 70, 100]) { m.fill(x, HTOP + 1, 6, 4, 3, 4, M('metal_gray')); m.fill(x + 1, HTOP + 4, 7, 2, 1, 2, M('metal_dark')) }
  // ---- annex (operator room, pumps): x 120..151, z 0..39, 7 m
  const AT = 28
  m.fill(HALLX, 0, 0, BX - HALLX, AT, 40, M('concrete'))
  for (let y = 0; y < AT; y++) {
    const mat = y < 3 ? M('concrete_dark') : y >= AT - 2 ? M('concrete') : brick
    m.fill(HALLX, y, 0, BX - HALLX, 1, 1, mat); m.fill(BX - 1, y, 0, 1, 1, 40, mat); m.fill(HALLX, y, 39, BX - HALLX, 1, 1, mat)
  }
  m.fill(HALLX, AT, 0, BX - HALLX, 1, 40, M('roof_tar'))
  m.walls(HALLX, AT + 1, 0, BX - HALLX, 1, 40, M('metal_gray'), 1)
  win(m, 'front', 122, 8, 8, 8, { cols: 2, transom: 2, glass: M('pub_win_lit_warm'), snow: 0.6, rng })
  win(m, 'front', 141, 8, 8, 8, { cols: 2, transom: 2, snow: 0.6, rng })
  win(m, 'front', 122, 18, 8, 6, { cols: 2, snow: 0.6, rng })
  win(m, 'front', 141, 18, 8, 6, { cols: 2, glass: M('pub_win_lit_cold'), snow: 0.6, rng })
  // personnel door (annex front) with a small canopy
  ffill(m, 'front', 133, 0, 0, 4, 9, 2, M('metal_brown'))
  fset(m, 'front', 136, 4, 0, M('chrome'))
  // ---- flue duct from the back wall to the chimney (z 64..79) at 6–8 m
  m.fill(FLUE_X - 4, 24, HALLZ, 9, 9, BZ - HALLZ, M('metal_rust'))
  for (let z = HALLZ; z < BZ; z += 4) m.fill(FLUE_X - 5, 23, z, 11, 11, 1, M('metal_dark'))
  for (let z = HALLZ + 2; z < BZ; z += 6) m.fill(FLUE_X - 1, 0, z, 3, 24, 1, M('metal_dark'))
  // weathering: soot above the windows and down the walls
  for (let k = 0; k < 60; k++) streak(m, rng.chance(0.6) ? 'front' : 'left', rng.int(1, HALLX - 2), rng.int(10, HTOP - 3), rng.int(3, 14), M('concrete_dark'), rng, 0.5)
  m.addSnow({ mat: M('snow'), depth: 1, seed: 33 })
  // the warm flue keeps its top clear of snow
  for (let z = HALLZ; z < BZ; z++) for (let x = FLUE_X - 5; x <= FLUE_X + 5; x++) if (m.get(x, 33, z) === M('snow') || m.get(x, 34, z) === M('snow')) { m.set(x, 33, z, 0); m.set(x, 34, z, 0) }
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [80, 200], maxDistance: 1000 })

// ---- chimney --------------------------------------------------------------------------------
const CH = 220, CR0 = 9, CR1 = 5, CW = 21
const chR = y => CR0 - (CR0 - CR1) * (y / CH)
export const CHIMNEY_HEIGHT = CH * V
const PLATFORMS = [140, 206]

defineModel('pub_chimney', () => {
  const m = new VoxelModel(CW, CH + 4, CW)
  const c = CW / 2
  const rng = new RNG(5555)
  for (let y = 0; y < CH; y++) {
    const r = chR(y)
    let mat
    if (y < 40) mat = rng.chance(0.15) ? M('concrete_dark') : M('brick_red')
    else mat = Math.floor((y - 40) / 22) % 2 === 0 ? M('pub_paint_white') : M('metal_red')
    if (y >= CH - 3) mat = M('metal_dark')
    m.cylinderY(c, c, y, y + 1, r, mat)
    // soot/streak variation on the bands
    if (y >= 40 && rng.chance(0.25)) {
      const a = rng.float(0, Math.PI * 2)
      m.set(Math.floor(c + Math.cos(a) * (r - 0.5)), y, Math.floor(c + Math.sin(a) * (r - 0.5)), M('concrete_dark'))
    }
  }
  // hollow top
  m.cylinderY(c, c, CH - 2, CH, CR1 - 1.5, 0)
  m.cylinderY(c, c, CH - 3, CH - 2, CR1 - 1.5, M('metal_dark'))
  // concrete base and a cleanout door
  m.cylinderY(c, c, 0, 4, CR0 + 1.2, M('concrete'))
  m.fill(Math.floor(c) - 1, 0, 0, 3, 6, 2, M('metal_dark'))
  // platforms with railings
  for (const py of PLATFORMS) {
    const r = chR(py) + 2.4
    m.cylinderY(c, c, py, py + 1, r, M('metal_dark'))
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const x = Math.floor(c + Math.cos(a) * (r - 0.3)), z = Math.floor(c + Math.sin(a) * (r - 0.3))
      m.set(x, py + 4, z, M('metal_dark'))
      if (Math.round(a / 0.12) % 4 === 0) for (let y = py + 1; y < py + 4; y++) m.set(x, y, z, M('metal_dark'))
    }
  }
  // ladder up the north side (local −Z)
  for (let y = 4; y < CH - 2; y++) {
    const r = chR(y)
    const z = Math.floor(c - r - 0.6)
    if (y % 2 === 0) m.set(Math.floor(c), y, z, M('metal_dark'))
    if (y % 8 === 0) { m.set(Math.floor(c) - 1, y, z, M('metal_dark')); m.set(Math.floor(c) + 1, y, z, M('metal_dark')) }
  }
  m.addSnow({ mat: M('snow'), depth: 1, skip: new Set([M('metal_dark')]) })
  return m
}, { occludesSnow: false, lods: [1, 2, 4], lodDistances: [90, 260], maxDistance: 1400 })

// small aviation obstruction light (red lens on a bracket); flag-linked to its blinking light
defineModel('pub_aviation_light', () => {
  const m = new VoxelModel(1, 2, 1)
  m.set(0, 0, 0, M('metal_dark'))
  m.set(0, 1, 0, M('lamp_red'))
  return m
}, { contact: false, collide: false, lods: [1], maxDistance: 1400 })

// ---- heat pipes ----------------------------------------------------------------------------
function pipeInsulation(rng) {
  const r = rng.next()
  return r < 0.08 ? M('pub_cardboard') : r < 0.16 ? M('metal_rust') : M('metal_gray')
}
// 6 m straight segment: two insulated pipes on concrete П-supports; pivot at the start, centred
defineModel('pub_heat_pipe', () => {
  const m = new VoxelModel(24, 8, 8)
  const rng = new RNG(4)
  for (const x of [3, 15]) {
    m.fill(x, 0, 0, 2, 5, 1, M('concrete')); m.fill(x, 0, 7, 2, 5, 1, M('concrete'))
    m.fill(x, 4, 0, 2, 1, 8, M('concrete'))
  }
  for (const z0 of [1, 4]) for (let x = 0; x < 24; x++) for (let y = 5; y <= 6; y++) for (let z = z0; z <= z0 + 1; z++) m.set(x, y, z, pipeInsulation(rng))
  // icicles under the pipes where meltwater drips
  for (let k = 0; k < 5; k++) m.set(rng.int(0, 23), 4, rng.pick([2, 5]), M('ice'))
  // the mains leak heat: snow only in patches on the insulation, more on the cold supports
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.35, seed: 9 })
  m.setPivot(0, 0, 4)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

// 1 m filler piece (pipes only) so runs end exactly at corners, arches and run ends
defineModel('pub_heat_pipe_short', () => {
  const m = new VoxelModel(4, 8, 8)
  const rng = new RNG(5)
  for (const z0 of [1, 4]) for (let x = 0; x < 4; x++) for (let y = 5; y <= 6; y++) for (let z = z0; z <= z0 + 1; z++) m.set(x, y, z, pipeInsulation(rng))
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.35, seed: 10 })
  m.setPivot(0, 0, 4)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

// П-shaped arch carrying the pipes 6.5 m over a driveway (10 m span); pivot at the start
defineModel('pub_heat_pipe_arch', () => {
  const m = new VoxelModel(40, 30, 8)
  const rng = new RNG(8)
  const pipe = (x, y, z) => m.set(x, y, z, pipeInsulation(rng))
  for (const z0 of [1, 4]) for (let z = z0; z <= z0 + 1; z++) {
    for (let y = 5; y <= 27; y++) { pipe(0, y, z); pipe(1, y, z); pipe(38, y, z); pipe(39, y, z) }
    for (let x = 0; x < 40; x++) { pipe(x, 26, z); pipe(x, 27, z) }
  }
  // steel lattice columns and the top truss
  for (const x of [3, 36]) { m.fill(x, 0, 0, 1, 26, 1, M('metal_dark')); m.fill(x, 0, 7, 1, 26, 1, M('metal_dark')); for (let y = 2; y < 26; y += 4) m.fill(x, y, 0, 1, 1, 8, M('metal_dark')) }
  m.fill(2, 25, 0, 36, 1, 1, M('metal_dark')); m.fill(2, 25, 7, 36, 1, 1, M('metal_dark'))
  // low stubs on the ground at both ends
  for (const z0 of [1, 4]) for (let z = z0; z <= z0 + 1; z++) for (let y = 5; y <= 6; y++) { pipe(0, y, z); pipe(39, y, z) }
  m.addSnow({ mat: M('snow'), depth: 1, skip: new Set([M('metal_gray'), M('metal_rust'), M('pub_cardboard')]) })
  m.setPivot(0, 0, 4)
  return m
}, { lods: [1, 2], lodDistances: [60], maxDistance: 320 })

/**
 * Lay a heat-pipe run along a polyline (world meters). Segments are 6 m; `arches` lists world
 * points where a 10 m П-arch lifts the pipes over a driveway (aligned with the run).
 * opts: { points: [[x,z],...], arches: [[x,z],...], seed }
 */
export function placeHeatPipe(ctx, o) {
  const pts = o.points || []
  const arches = o.arches || []
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 0.5) continue
    const dx = (bx - ax) / len, dz = (bz - az) / len
    const ang = Math.atan2(-dz, dx)
    const myArches = arches.filter(([px, pz]) => {
      const t = (px - ax) * dx + (pz - az) * dz
      const d = Math.abs(-(px - ax) * dz + (pz - az) * dx)
      return t > 0 && t < len && d < 3
    }).map(([px, pz]) => (px - ax) * dx + (pz - az) * dz)
    const ud = { pkg: 'public', noRelocate: true }
    const at = t => ({ x: ax + dx * t, z: az + dz * t, angle: ang, tag: 'heat_pipe', userData: ud })
    // straight stretches between arches: 6 m segments, then 1 m fillers so nothing overshoots
    const stretch = (t0, t1) => {
      let t = t0
      while (t1 - t >= 5.99) { out.push(ctx.world.place('pub_heat_pipe', at(t))); t += 6 }
      while (t1 - t > 0.3) { out.push(ctx.world.place('pub_heat_pipe_short', at(t))); t += 1 }
    }
    let t0 = 0
    for (const a of myArches.sort((p, q) => p - q)) {
      const s0 = Math.max(t0, a - 5)
      stretch(t0, s0)
      out.push(ctx.world.place('pub_heat_pipe_arch', at(s0)))
      t0 = s0 + 10
    }
    stretch(t0, len)
    // now and then a leaking joint steams (heating-main leak)
    if (len > 12 && hashf(Math.round(ax * 7), Math.round(az * 13), 5) < 0.35) {
      const t = 6 * Math.max(1, Math.floor(len / 12))
      if (!myArches.some(a => Math.abs(a - t) < 6)) {
        const gy = ctx.terrain.heightAt(ax + dx * t, az + dz * t)
        RT.pendingSteam.push({ x: ax + dx * t, y: (Number.isFinite(gy) ? gy : 0.25) + 1.5, z: az + dz * t, kind: 'pipe', tag: 'heat_pipe_leak' })
      }
    }
    // melted strip of snow under the pipe line
    ctx.terrain.paintLine(ax, az, bx, bz, 2.2, { mat: M('snow_dirty'), only: new Set([M('snow'), M('snow_fresh')]) })
  }
  reg(ctx, 'heatPipes', { points: pts.map(p => [p[0], p[1]]), arches })
  return out
}

/**
 * Boiler house with its chimney. The hall is 30 × 16 m centred on (x, z) (front, windows and
 * personnel door on local −Z); an annex adds 8 m to the east; the chimney stands 6 m behind
 * the hall (local +Z), 55 m tall with blinking aviation lights.
 * opts: { x, z, rot (quarter turns), y, seed, number (default 3), pipes: [[x,z],...] world points
 *         for a heat-pipe run starting at the hall (optional), arches: [[x,z]] }
 * Returns { hall, chimney, frame, chimneyPos: [x,z] }
 */
export function placeBoilerHouse(ctx, o) {
  const F = frameFor(ctx, { ...o, angle: (o.rot ?? 0) * HALF_PI })
  const rng = new RNG(seedInt(o.seed, 13))
  const num = o.number ?? 3
  const y = F.y
  flatten(ctx, F, -15.25, -8.25, 23.25, 12.25, y, M('snow_dirty'))
  const hall = put(ctx, F, 'pub_boiler', 0, 0, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'boiler_house' } })
  const chx = (FLUE_X - BPX) * V, chz = (BZ - BPZ) * V + 2.4
  flatten(ctx, F, chx - 3, chz - 3, chx + 3, chz + 3, y, M('snow_dirty'))
  const chimney = put(ctx, F, 'pub_chimney', chx, chz, { seed: seed01(o.seed, 2), tag: 'landmark', userData: { kind: 'chimney' } })
  // aviation lights: top platform blinking (3), mid platform steady (one dead)
  PLATFORMS.forEach((py, pi) => {
    const r = (chR(py) + 1.6) * V
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2 + 0.5
      const lx = chx + Math.cos(a) * r, lz = chz + Math.sin(a) * r
      const dead = pi === 0 && k === 2
      const p = put(ctx, F, 'pub_aviation_light', lx, lz, { ly: (py + 1) * V, tag: 'aviation_light', flag: dead ? 0 : 1 })
      if (dead) continue
      const phase = rng.float(0, 1) * 0.1
      const sched = pi === 1
        ? (env => ((env.time * 0.75 + phase) % 1) < 0.42 ? 1 : 0)
        : (env => 0.25 + 0.75 * env.night)
      light(ctx, F, lx, (py + 1.6) * V, lz, { color: 0xff2412, intensity: pi === 1 ? 16 : 7, range: pi === 1 ? 9 : 6, schedule: sched, placement: p, haloSize: pi === 1 ? 2.4 : 1.4, scatter: 0.6, tag: 'aviation_light' })
    }
  })
  // door lamp, yard floodlight, a little cold spill from the big windows
  const DX = (135 - BPX) * V
  const lampP = put(ctx, F, 'pub_lamp_wall_bulb', DX, -BPZ * V, { ly: 2.45, tag: 'lamp' })
  light(ctx, F, DX, 2.4, -BPZ * V - 0.6, { type: 'spot', dir: [0, -1, -0.35], cone: 70, inner: 30, color: 0xffc47e, intensity: 6, range: 8, schedule: 'night', placement: lampP, haloSize: 0.6, tag: 'lamp' })
  const floodP = put(ctx, F, 'pub_lamp_wall_bulb', (-BPX + 1) * V, -BPZ * V, { ly: 7.5, tag: 'lamp' })
  light(ctx, F, (-BPX + 1) * V - 0.5, 7.4, -BPZ * V - 0.7, { type: 'spot', dir: [-0.45, -1, -0.6], cone: 62, inner: 28, color: 0xd6ecea, intensity: 30, range: 26, schedule: 'street', placement: floodP, flicker: rng.chance(0.4) ? 'dying' : 'none', tag: 'lamp' })
  // cold spill from the big windows; also drives the hall's lit panes (placement flag), which
  // fade to near-dark glass in daylight
  light(ctx, F, -4, 5, -BPZ * V - 1.2, { type: 'spot', dir: [0, -0.4, -1], cone: 80, inner: 40, color: 0xc8dce0, intensity: 5, range: 12, schedule: env => 0.15 + 0.85 * env.night, placement: hall, halo: false, scatter: 0.3 })
  // signs
  sign(ctx, F, (131.5 - BPX) * V, 1.5, -BPZ * V, 0, -1, {
    w: 0.62, h: 0.42, ppm: 150, aged: 0.4, seed: 21,
    draw: (cc, W, H) => { cc.fillStyle = '#1e3050'; cc.fillRect(0, 0, W, H); drawText(cc, W, H, { lines: [`КОТЕЛЬНАЯ № ${num}`, 'ГУП «МосТеплоСеть»', 'филиал № 7', 'Дисп. тел. 8-495-…-..-..'], color: '#e8e4d8', font: PLAIN_FONT, pad: 5 }) },
  })
  readable(ctx, F, (131.5 - BPX) * V, 1.5, -BPZ * V - 0.2, [0.7, 0.5, 0.3], { ru: `КОТЕЛЬНАЯ № ${num}\nГУП «МосТеплоСеть», филиал № 7\nДиспетчер: 8-495-…`, en: `BOILER HOUSE No. ${num}\nState Unitary Enterprise "MosTeploSet", branch No. 7\nDispatcher: 8-495-…`, style: 'sign' })
  sign(ctx, F, -BPX * V, 1.7, -BPZ * V + 7.4, -1, 0, { w: 0.85, h: 0.4, ppm: 110, aged: 0.5, seed: 22, lines: ['ПОСТОРОННИМ', 'ВХОД ВОСПРЕЩЁН'], bg: '#e2ddcf', color: '#8a1a14', font: SIGN_FONT })
  readable(ctx, F, -BPX * V - 0.2, 1.7, -BPZ * V + 7.4, [0.3, 0.5, 0.9], { ru: 'ПОСТОРОННИМ ВХОД ВОСПРЕЩЁН', en: 'NO UNAUTHORISED ENTRY', style: 'sign' })
  sign(ctx, F, -BPX * V, 1.6, -BPZ * V + 9.3, -1, 0, { w: 0.34, h: 0.34, ppm: 140, aged: 0.3, seed: 23, draw: dangerPlate })
  // stencilled height mark on the chimney base
  sign(ctx, F, chx, 1.5, chz - (CR0 + 1.2) * V - 0.02, 0, -1, { w: 1.2, h: 0.35, ppm: 90, aged: 0.6, seed: 24, draw: (cc, W, H) => { cc.clearRect(0, 0, W, H); drawText(cc, W, H, { lines: ['Н=55м  1974'], color: 'rgba(230,226,214,0.9)', font: SIGN_FONT }) } })
  // sound
  addEmitter({ name: 'boiler_hum', pos: F.p(0, 4, 0), gain: 0.55, radius: 70, refDistance: 6, maxDistance: 120 })
  addEmitter({ name: 'ventilation', pos: F.p(-2, HTOP * V + 1.5, 0), gain: 0.3, radius: 45, refDistance: 4 })
  // a plume of steam from the chimney top (nature package, if present)
  const top = F.p(chx, CH * V + 0.5, chz)
  RT.pendingSteam.push({ x: top[0], y: top[1], z: top[2], kind: 'chimney', tag: 'boiler_chimney' })
  // optional heat pipes from the hall
  if (o.pipes && o.pipes.length > 1) placeHeatPipe(ctx, { points: o.pipes, arches: o.arches })
  const cp = [F.wx(chx, chz), F.wz(chx, chz)]
  reg(ctx, 'landmarks', { kind: 'chimney', name: 'Труба котельной', x: cp[0], z: cp[1], height: CH * V })
  reg(ctx, 'industrial', { kind: 'boiler_house', x: F.x, z: F.z, y, angle: F.a, chimney: cp })
  navPath(ctx, F, [[DX, -BPZ * V - 1], [DX, -BPZ * V - 8]], 'entrance', { to: 'boiler_house' })
  return { hall, chimney, frame: F, chimneyPos: cp }
}

export const BOILER_DIMS = { hall: [30, 16], annex: [8, 10], total: [38, 20], chimneyHeight: CH * V }

/** Chimney offset from the hall centre in local meters (local +X right, +Z back). */
export const CHIMNEY_OFFSET = [(FLUE_X - BPX) * V, (BZ - BPZ) * V + 2.4]

/**
 * Where to put placeBoilerHouse's (x, z) so the chimney lands on (cx, cz) for a given rot.
 * e.g. PLAN chimney at (262, 95), front facing the street (south, rot 2): boilerCenterForChimney(262, 95, 2)
 */
export function boilerCenterForChimney(cx, cz, rot = 0) {
  const F = new Frame(0, 0, 0, rot * HALF_PI)
  const [ox, oz] = CHIMNEY_OFFSET
  return [cx - F.wx(ox, oz), cz - F.wz(ox, oz)]
}
