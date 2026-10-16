// Kindergarten (детский сад): a 2-storey red-brick building with three group entrances, paper
// snowflakes on some windows, a faded painted mural on the end wall, open verandas (one per
// group) with murals inside, little wooden play-houses, a boat climbing frame, mushroom
// sandboxes, and a low painted fence with a gate and a «Выгул собак запрещён» notice.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, HALF_PI, frameFor, put, sign, readable, light, flatten, navPath, reg, seed01, seedInt,
  win, ffill, fset, streak, muralPainter, drawText, PLAIN_FONT, SERIF_FONT,
} from './lib.js'
import { addEmitter } from './runtime.js'

const KX = 160, KZ = 52, FH = 13, BASE = 3
const KTOP = BASE + 2 * FH
const ENTR = [24, 78, 132] // door u positions (4 wide) on the front
const WATCH_BAY = 1 // the watchman's lit window (ground floor, bay index)

defineModel('pub_kg_main', () => {
  const m = new VoxelModel(KX, KTOP + 5, KZ)
  const rng = new RNG(1543)
  const brick = M('brick_red'), lintel = M('concrete_light')
  m.fill(0, 0, 0, KX, KTOP + 1, KZ, M('concrete'))
  for (const face of ['front', 'back', 'left', 'right']) {
    const len = face === 'left' || face === 'right' ? KZ : KX
    ffill(m, face, 0, BASE, 0, len, KTOP - BASE, 1, brick)
    ffill(m, face, 0, 0, 0, len, BASE, 1, M('concrete_dark'))
    ffill(m, face, 0, KTOP - 1, 0, len, 2, 1, lintel)
    // pale tile band under the 1st-floor windows (1970s accent)
    ffill(m, face, 0, BASE + FH + 1, 0, len, 2, 1, M('tile_cream'))
  }
  m.fill(0, KTOP, 0, KX, 1, KZ, M('roof_tar'))
  m.walls(0, KTOP + 1, 0, KX, 1, KZ, M('metal_gray'), 1)
  m.fill(70, KTOP + 1, 24, 6, 3, 6, brick)
  // windows: 12-voxel bays, 7 × 6 windows; paper snowflakes on a few
  for (let f = 0; f < 2; f++) {
    const fy = BASE + f * FH
    for (let b = 0; b < Math.floor(KX / 12); b++) {
      const u = b * 12 + 3
      const nearDoor = ENTR.some(e => u + 7 > e - 1 && u < e + 5)
      if (!(f === 0 && nearDoor)) {
        const lit = f === 0 && b === WATCH_BAY
        win(m, 'front', u, fy + 4, 7, 6, { cols: 2, transom: 1, snow: 0.7, rng, glass: lit ? M('pub_glass_warm') : undefined })
        ffill(m, 'front', u - 1, fy + 10, 0, 9, 1, 1, lintel)
        if (!lit && rng.chance(0.3)) { fset(m, 'front', u + 2, fy + 6, 0, M('plastic_white')); if (rng.chance(0.5)) fset(m, 'front', u + 5, fy + 7, 0, M('plastic_white')) }
      }
      win(m, 'back', u, fy + 4, 7, 6, { cols: 2, transom: 1, snow: 0.6, rng })
      ffill(m, 'back', u - 1, fy + 10, 0, 9, 1, 1, lintel)
    }
  }
  // the watchman's room behind the lit window: whitewash, a chair, a bulb, a cat on the sill
  {
    const u = WATCH_BAY * 12 + 3, x0 = u - 2, x1 = u + 8, z0 = 2, z1 = 12, fy = BASE
    m.clear(x0, fy + 1, z0, x1 - x0 + 1, FH - 2, z1 - z0 + 1)
    m.addInterior(x0, fy + 1, z0, x1 - x0 + 1, FH - 2, z1 - z0 + 1)
    m.fill(x0, fy, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('linoleum'))
    for (let y = fy + 1; y < fy + FH - 1; y++) {
      const wm = y <= fy + 5 ? M('wall_paint_brown') : M('whitewash')
      m.fill(x0 - 1, y, z0, 1, 1, z1 - z0 + 1, wm); m.fill(x1 + 1, y, z0, 1, 1, z1 - z0 + 1, wm)
      m.fill(x0, y, z1 + 1, x1 - x0 + 1, 1, 1, wm)
      for (let x = x0; x <= x1; x++) if (m.get(x, y, 1) === M('concrete')) m.set(x, y, 1, wm)
    }
    m.fill(x0, fy + FH - 1, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('whitewash'))
    m.set(u + 3, fy + FH - 2, z0 + 4, M('lamp_bulb'))
    m.fill(u + 1, fy + 1, z0 + 2, 4, 3, 2, M('wood_dark'))
    m.set(u + 2, fy + 4, z0 + 2, M('chrome'))
    m.fill(u + 2, fy + 1, z0 + 5, 2, 2, 2, M('wood')); m.fill(u + 2, fy + 3, z0 + 6, 2, 2, 1, M('wood'))
    // the cat (dark grey) curled on the inside sill
    m.set(u + 5, fy + 4, 2, M('concrete_dark')); m.set(u + 4, fy + 4, 2, M('concrete_dark'))
  }
  // entrances: doors with small concrete canopies and steps
  for (const e of ENTR) {
    ffill(m, 'front', e, BASE, 0, 4, 9, 1, M('wood_painted_blue'))
    ffill(m, 'front', e, BASE, 1, 4, 9, 1, M('wood_painted_blue'))
    fset(m, 'front', e + 3, BASE + 4, 0, M('metal_gray'))
    ffill(m, 'front', e + 1, BASE + 5, 0, 2, 3, 1, M('pub_glass_dark'))
    ffill(m, 'front', e - 1, BASE + 9, 0, 6, 1, 1, lintel)
  }
  // downpipes
  for (const u of [10, 66, 120, 152]) { for (let y = 1; y < KTOP; y++) fset(m, 'front', u, y, 0, M('metal_gray')); fset(m, 'front', u, 0, 0, M('ice')) }
  for (let k = 0; k < 24; k++) streak(m, rng.chance(0.5) ? 'front' : 'back', rng.int(2, KX - 3), rng.int(BASE + 3, KTOP - 3), rng.int(2, 7), M('metal_rust'), rng, 0.45)
  m.addSnow({ mat: M('snow'), depth: 1, seed: 15 })
  for (let z = 1; z < KZ - 1; z++) for (let x = 1; x < KX - 1; x++) {
    if (m.get(x, KTOP + 1, z) === M('snow') && (Math.sin(x * 0.11 + z * 0.17) > 0.3 || x < 3 || z < 3 || x > KX - 4 || z > KZ - 4)) m.set(x, KTOP + 2, z, M('snow'))
  }
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [70, 180], maxDistance: 900 })

// porch with steps and a small canopy, placed in front of each entrance (4 voxels door)
defineModel('pub_kg_porch', () => {
  const m = new VoxelModel(10, 15, 7)
  m.fill(0, 0, 0, 10, 1, 7, M('concrete_light'))
  m.fill(0, 1, 2, 10, 1, 5, M('concrete_light'))
  m.fill(0, 2, 4, 10, 1, 3, M('concrete_light'))
  for (const x of [0, 9]) for (let y = 1; y <= 12; y++) m.set(x, y, 0, M('metal_dark'))
  m.fill(0, 13, 0, 10, 1, 7, M('concrete'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  // swept steps
  for (let x = 2; x <= 7; x++) for (let z = 0; z < 7; z++) for (let y = 1; y <= 3; y++) if (m.get(x, y, z) === M('snow')) m.set(x, y, z, 0)
  m.setPivot(5, 0, 7)
  return m
}, { occludesSnow: true, lods: [1], maxDistance: 200 })

// open veranda pavilion 6 × 3 m: back and side walls, mono-pitch roof, bench, open front (−Z)
defineModel('pub_kg_veranda', () => {
  const m = new VoxelModel(24, 12, 13)
  const p = M('paint_matte')
  m.fill(0, 0, 0, 24, 1, 12, M('concrete'))
  m.fill(1, 0, 1, 22, 1, 10, M('wood'))
  m.fill(0, 1, 11, 24, 9, 1, p)
  m.fill(0, 1, 0, 1, 9, 12, p); m.fill(23, 1, 0, 1, 9, 12, p)
  m.clear(0, 5, 1, 1, 3, 5); m.clear(23, 5, 1, 1, 3, 5)
  // roof sloping from back (y 10) to front (y 9), overhanging the front
  m.fill(0, 10, 6, 24, 1, 7, M('wood_dark'))
  m.fill(0, 9, 0, 24, 1, 6, M('wood_dark'))
  m.fill(0, 9, 12, 24, 1, 1, 0)
  // bench along the back wall, posts at the front corners
  m.fill(2, 1, 9, 20, 2, 2, M('wood'))
  for (const x of [0, 23]) for (let y = 1; y < 9; y++) m.set(x, y, 0, M('wood_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 2 })
  // snow blown in over the front edge
  for (let x = 1; x < 23; x++) if ((x * 7) % 5 < 3) m.set(x, 1, 1, M('snow'))
  m.setPivot(12, 0, 6)
  return m
}, { occludesSnow: true, lods: [1, 2], lodDistances: [45], maxDistance: 200 })

// little wooden play-house with a pitched roof (tint = paint)
defineModel('pub_kg_house', () => {
  const m = new VoxelModel(6, 9, 6)
  m.walls(0, 0, 0, 6, 5, 6, M('paint_matte'), 1)
  m.clear(2, 0, 0, 2, 4, 1)
  m.clear(0, 2, 2, 1, 2, 2); m.clear(5, 2, 2, 1, 2, 2)
  for (let k = 0; k < 4; k++) m.fill(0, 5 + k, k, 6, 1, 6 - 2 * k, M('wood_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { lods: [1], maxDistance: 160 })

// wooden "boat" climbing frame with a mast
defineModel('pub_kg_boat', () => {
  const m = new VoxelModel(14, 12, 6)
  const p = M('paint_matte')
  m.fill(1, 0, 1, 12, 1, 4, M('wood'))
  m.walls(0, 1, 0, 14, 3, 6, p, 1)
  m.fill(0, 1, 0, 2, 3, 6, 0); m.fill(0, 1, 1, 1, 2, 4, p)
  m.set(13, 4, 2, p); m.set(13, 4, 3, p)
  m.fill(7, 1, 2, 1, 11, 1, M('wood_dark'))
  m.fill(8, 6, 2, 4, 1, 1, M('wood_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { lods: [1], maxDistance: 160 })

// sandbox 2 × 2 m with a fly-agaric mushroom shade
defineModel('pub_kg_mushroom', () => {
  const m = new VoxelModel(9, 10, 9)
  m.walls(0, 0, 0, 9, 1, 9, M('wood_painted_green'), 1)
  m.fill(1, 0, 1, 7, 1, 7, M('snow_fresh'))
  m.fill(4, 1, 4, 1, 7, 1, M('wood'))
  m.ellipsoid(4.5, 8.2, 4.5, 3.4, 1.4, 3.4, M('metal_red'))
  m.fill(1, 0, 1, 7, 8, 7, 0); m.fill(1, 0, 1, 7, 1, 7, M('snow_fresh')); m.fill(4, 1, 4, 1, 7, 1, M('wood'))
  for (const [x, z] of [[2, 3], [5, 2], [6, 5], [3, 6], [4, 4]]) { for (let y = 9; y >= 7; y--) if (m.get(x, y, z) === M('metal_red') && !m.get(x, y + 1, z)) { m.set(x, y, z, M('pub_paint_white')); break } }
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { lods: [1], maxDistance: 160 })

// low fence panel 2.5 × 1.5 m: painted bars, top rail (tint)
defineModel('pub_fence_kg', () => {
  const m = new VoxelModel(10, 6, 1)
  const p = M('paint')
  for (let x = 0; x < 10; x += 2) m.fill(x, 0, 0, 1, 6, 1, p)
  m.fill(0, 1, 0, 10, 1, 1, p); m.fill(0, 5, 0, 10, 1, 1, p)
  m.fill(0, 0, 0, 1, 6, 1, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.85, seed: 5 })
  m.setPivot(0, 0, 0.5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 150 })

const MURAL_KINDS = ['sun', 'hedgehog', 'balloon', 'boat']

/**
 * Place a kindergarten with its yard. Site 64 × 52 m centred on (x, z); the building (40 × 13 m,
 * 2 storeys) stands at the back of the site with its three group entrances facing local −Z,
 * toward the yard and the gate in the middle of the front fence.
 * opts: { x, z, rot (quarter turns), y, seed, number (default 1543), fence=true, verandas=4, fenceTint }
 * Returns { main, verandas, frame, entrance, site }
 */
export function placeKindergarten(ctx, o) {
  const F = frameFor(ctx, { ...o, angle: (o.rot ?? 0) * HALF_PI })
  const rng = new RNG(seedInt(o.seed, 91))
  const number = o.number ?? 1543
  const y = F.y
  const SX = 32.5, SZ = 26.25
  const BZ = 10 // building centre z (front facade at BZ - 6.5)
  const front = BZ - KZ * V / 2
  flatten(ctx, F, -20.25, front - 0.25, 20.25, BZ + 6.75, y, M('snow_packed'))
  const main = put(ctx, F, 'pub_kg_main', 0, BZ, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'kindergarten' } })
  // porches + lamps (the middle one is dead)
  ENTR.forEach((e, i) => {
    const lx = (e + 2 - KX / 2) * V
    flatten(ctx, F, lx - 1.5, front - 2.2, lx + 1.5, front, y, M('snow_packed'))
    put(ctx, F, 'pub_kg_porch', lx, front, { tag: 'porch' })
    const lamp = put(ctx, F, 'pub_lamp_wall_bulb', lx, front, { ly: 3.02, tag: 'lamp', flag: i === 1 ? 0 : 1 })
    if (i !== 1) light(ctx, F, lx, 2.95, front - 0.6, { type: 'spot', dir: [0, -1, -0.3], cone: 70, inner: 30, color: 0xffc47e, intensity: 6, range: 8, schedule: 'night', placement: lamp, haloSize: 0.55, flicker: i === 2 ? 'dying' : 'none', tag: 'lamp' })
    navPath(ctx, F, [[lx, front - 2], [lx * 0.4, front - 8], [0, -SZ - 0.5], [0, -SZ - 8]], 'path', { to: 'kindergarten' })
    reg(ctx, 'entrances', { x: F.wx(lx, front - 1.5), z: F.wz(lx, front - 1.5), y, angle: F.ang(0, -1), kind: 'kindergarten', enterable: false })
  })
  // the watchman's lit room
  const wlx = (WATCH_BAY * 12 + 6.5 - KX / 2) * V
  light(ctx, F, wlx, 2.6, front + 1.6, { color: 0xffc27a, intensity: 1.3, range: 5, domain: 'indoor', schedule: env => env.night > 0.4 ? 1 : 0, placement: main, halo: false })
  light(ctx, F, wlx, 1.8, front - 0.5, { color: 0xffb870, intensity: 0.8, range: 4.5, schedule: env => env.night > 0.4 ? 1 : 0, halo: false })
  // signs
  const mainLx = (ENTR[1] + 2 - KX / 2) * V
  sign(ctx, F, mainLx + 1.6, 1.6, front, 0, -1, {
    w: 0.55, h: 0.4, ppm: 160, aged: 0.2, seed: 4,
    draw: (c, W, H) => { c.fillStyle = '#20304a'; c.fillRect(0, 0, W, H); drawText(c, W, H, { lines: ['ГОУ', `ДЕТСКИЙ САД № ${number}`, 'Северо-Восточное окружное', 'управление образования'], color: '#e8dcb0', font: SERIF_FONT, pad: 6 }) },
  })
  readable(ctx, F, mainLx + 1.6, 1.6, front - 0.2, [0.6, 0.45, 0.3], { ru: `Государственное образовательное учреждение\nДЕТСКИЙ САД № ${number}\nСеверо-Восточное окружное управление образования`, en: `State Educational Institution\nKINDERGARTEN No. ${number}\nNorth-Eastern District Education Authority`, style: 'sign' })
  sign(ctx, F, 0, 5.6, front, 0, -1, { w: 6.5, h: 0.62, ppm: 50, draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: [`ДЕТСКИЙ САД № ${number}`], color: '#efe3c4', shadow: 'rgba(40,30,20,0.6)' }) } })
  // faded mural fragment on the west end wall
  sign(ctx, F, -KX * V / 2, 3.2, BZ, -1, 0, { w: 7.5, h: 4.2, ppm: 30, draw: muralPainter(seedInt(o.seed, 7) % 997, 'sun') })
  readable(ctx, F, -KX * V / 2 - 0.2, 1.6, BZ, [0.4, 1.2, 6], { ru: 'Облупившаяся роспись: солнце, ёжик с яблоком, красный шарик. Краска осыпается вместе со штукатуркой.', en: 'A peeling painted mural: a sun, a hedgehog with an apple, a red balloon. The paint is coming off with the plaster.', style: 'paper' }, { prompt: { ru: 'Рассмотреть роспись', en: 'Look at the mural' } })
  // verandas (one per group) along the side fences, open toward the yard centre
  const verandas = []
  const vtints = [0x9aa88a, 0xb0a070, 0x8aa0aa, 0xa89080]
  const vpos = [[-26, -14, 3], [-26, -2, 3], [26, -14, 1], [26, -2, 1]]
  const nV = Math.min(4, o.verandas ?? 4)
  for (let i = 0; i < nV; i++) {
    const [vx, vz, q] = vpos[i]
    const vp = put(ctx, F, 'pub_kg_veranda', vx, vz, { q, tint: vtints[(i + rng.int(0, 3)) % 4], tag: 'veranda' })
    verandas.push(vp)
    // the mural painted on the back wall inside (faces the open front)
    const nx = q === 3 ? 1 : -1
    const backX = vx - nx * (11 * V - 6 * V + 0.01)
    sign(ctx, F, backX, 1.3, vz, nx, 0, { w: 4.6, h: 1.0, ppm: 40, draw: muralPainter(seedInt(o.seed, 20 + i) % 991, MURAL_KINDS[i % 4]) })
  }
  // play equipment in each group's yard
  put(ctx, F, 'pub_kg_house', -16, -18, { tint: 0xa8946a, ground: true, tag: 'play' })
  put(ctx, F, 'pub_kg_boat', 14, -18, { q: 1, tint: 0x7a96a8, ground: true, tag: 'play' })
  put(ctx, F, 'pub_kg_mushroom', -12, -6, { ground: true, tag: 'play' })
  put(ctx, F, 'pub_kg_mushroom', 13, -6, { ground: true, tag: 'play' })
  put(ctx, F, 'pub_kg_house', 18, -10, { q: 2, tint: 0x8a9a7a, ground: true, tag: 'play' })
  // fence + gate
  if (o.fence !== false) {
    const tint = o.fenceTint ?? 0x5a7a5a
    const run = (ax, az, bx, bz, skip) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 2.5 + 1e-6)
      const dx = (bx - ax) / len, dz = (bz - az) / len, da = Math.atan2(-dz, dx)
      for (let i = 0; i < n; i++) {
        const px = ax + dx * 2.5 * i, pz = az + dz * 2.5 * i
        if (skip && skip(px, pz)) continue
        put(ctx, F, 'pub_fence_kg', px, pz, { da, ground: true, tint, tag: 'fence' })
      }
    }
    run(-SX, -SZ, SX, -SZ, px => px > -3 && px < 4)
    run(SX, -SZ, SX, SZ)
    run(SX, SZ, -SX, SZ)
    run(-SX, SZ, -SX, -SZ)
    put(ctx, F, 'pub_gate_school', -2.25, -SZ, { ground: true, tint, tag: 'gate' })
    const gy = ctx.terrain.heightAt(F.wx(5, -SZ), F.wz(5, -SZ)) - y
    sign(ctx, F, 5.0, gy + 1.0, -SZ - 0.14, 0, -1, { w: 0.6, h: 0.32, ppm: 120, aged: 0.35, seed: 6, lines: ['Выгул собак', 'запрещён!'], bg: '#e6e2d4', color: '#8a1a1a', font: PLAIN_FONT })
    readable(ctx, F, 5.0, gy + 1.0, -SZ - 0.3, [0.7, 0.4, 0.3], { ru: 'Выгул собак запрещён!', en: 'No dog walking!', style: 'sign' })
    sign(ctx, F, -4.6, gy + 1.0, -SZ - 0.14, 0, -1, { w: 0.75, h: 0.42, ppm: 120, aged: 0.25, seed: 8, lines: ['Детский сад', `№ ${number}`, 'Приём с 7.00 до 19.00'], bg: '#1d3a66', color: '#eee', font: PLAIN_FONT })
    readable(ctx, F, -4.6, gy + 1.0, -SZ - 0.3, [0.8, 0.5, 0.3], { ru: `Детский сад № ${number}\nПриём детей с 7.00 до 19.00`, en: `Kindergarten No. ${number}\nChildren received from 7:00 to 19:00`, style: 'sign' })
  }
  const site = F.box(-SX, 0, -SZ, SX, 3, SZ)
  reg(ctx, 'kindergartens', { number, x: F.x, z: F.z, y, angle: F.a, site })
  return { main, verandas, frame: F, entrance: [F.wx(0, -SZ), F.wz(0, -SZ)], site }
}

export const KINDERGARTEN_DIMS = { site: [65, 52.5], building: [40, 13] }
