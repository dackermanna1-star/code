// Courtyard hockey box (хоккейная коробка): 1.25 m plank boards painted outside and white
// inside, rounded corners, a gate, two goals with nets, flooded ice, snow thrown over the
// boards, and two lamp poles with cold floodlights (one dying) that burn until 22:30.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, HALF_PI, frameFor, put, sign, readable, light, flatten, navPath, reg, seedInt, drawText,
  handText, PLAIN_FONT,
} from './lib.js'


const R = 8 // corner radius in voxels (2 m)

function boardColumn(m, x, z, outer, rng) {
  // 5 voxels of plank + rail, inner layer white (scuffed), outer painted
  for (let y = 0; y < 5; y++) {
    if (outer) m.set(x, y, z, M('paint_matte'))
    else m.set(x, y, z, rng.chance(0.12) ? M('concrete_light') : M('pub_paint_white'))
  }
  m.set(x, 5, z, M('metal_gray'))
}

// straight board 4 m; inner (ice) side = local −Z; pivot on the centre line at the start
defineModel('pub_hockey_board', () => {
  const m = new VoxelModel(16, 7, 3)
  const rng = new RNG(31)
  for (let x = 0; x < 16; x++) { boardColumn(m, x, 0, false, rng); boardColumn(m, x, 1, true, rng) }
  for (const x of [0, 8]) for (let y = 0; y < 6; y++) m.set(x, y, 2, M('wood_dark'))
  // a broken plank low down
  m.set(11, 1, 1, M('wood_dark')); m.set(12, 1, 0, 0)
  m.addSnow({ mat: M('snow'), depth: 1, seed: 2 })
  m.setPivot(0, 0, 1)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 220 })

// same with a 1 m gate opening (the gate leaf stands open against the board)
defineModel('pub_hockey_board_gate', () => {
  const m = new VoxelModel(16, 7, 6)
  const rng = new RNG(37)
  for (let x = 0; x < 16; x++) {
    if (x >= 6 && x < 10) continue
    boardColumn(m, x, 0, false, rng); boardColumn(m, x, 1, true, rng)
  }
  for (const x of [5, 10]) for (let y = 0; y < 6; y++) m.set(x, y, 2, M('wood_dark'))
  for (let z = 2; z < 6; z++) for (let y = 0; y < 5; y++) m.set(10, y, z, M('paint_matte'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 3 })
  m.setPivot(0, 0, 1)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 220 })

// rounded corner: arrives heading local +X, turns 90° toward local −Z (ice inside the turn)
defineModel('pub_hockey_corner', () => {
  const m = new VoxelModel(R + 2, 7, R + 2)
  const rng = new RNG(41)
  for (let z = 0; z < R + 2; z++) for (let x = 0; x < R + 2; x++) {
    const d = Math.hypot(x + 0.5, z + 0.5)
    if (d >= R - 1 && d < R) boardColumn(m, x, z, false, rng)
    else if (d >= R && d < R + 1) boardColumn(m, x, z, true, rng)
  }
  m.addSnow({ mat: M('snow'), depth: 1, seed: 4 })
  // local (0,0) arc start ↔ model (0, R); the arc centre (0, −R) ↔ model (0, 0)
  m.setPivot(0, 0, R)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 220 })

// hockey goal 1.8 × 1.2 m: red frame, net (non-solid), mouth toward local −Z
defineModel('pub_hockey_goal', () => {
  const m = new VoxelModel(8, 6, 4)
  const red = M('metal_red'), net = M('pub_net')
  for (let y = 0; y < 5; y++) { m.set(0, y, 0, red); m.set(7, y, 0, red) }
  m.fill(0, 4, 0, 8, 1, 1, red)
  m.fill(0, 0, 3, 8, 1, 1, red)
  for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) if ((x + y) % 2 === 0) m.set(x, y, 3, net)
  for (let z = 1; z < 4; z++) for (let y = 0; y < 4; y++) if ((z + y) % 2 === 0) { m.set(0, y, z, net); m.set(7, y, z, net) }
  for (let z = 1; z < 3; z++) for (let x = 0; x < 8; x += 2) m.set(x, 3, z, net)
  m.fill(0, 0, 0, 1, 1, 4, red); m.fill(7, 0, 0, 1, 1, 4, red)
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.6, seed: 5 })
  return m
}, { contact: false, lods: [1], maxDistance: 160 })

// lamp pole 8 m with a cross-arm and two floodlights pointing toward local −Z
defineModel('pub_hockey_lamp', () => {
  const m = new VoxelModel(7, 34, 4)
  m.fill(3, 0, 3, 1, 32, 1, M('metal_gray'))
  m.fill(0, 31, 3, 7, 1, 1, M('metal_dark'))
  for (const x of [0, 5]) {
    m.fill(x, 30, 1, 2, 2, 2, M('metal_dark'))
    m.fill(x, 30, 0, 2, 1, 1, M('lamp_cold'))
  }
  m.set(3, 1, 2, M('metal_dark')); m.set(3, 2, 2, M('plastic_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(3.5, 0, 3.5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [60], maxDistance: 320 })

// players' bench
defineModel('pub_hockey_bench', () => {
  const m = new VoxelModel(12, 3, 2)
  m.fill(0, 1, 0, 12, 1, 2, M('wood'))
  for (const x of [0, 11]) m.fill(x, 0, 0, 1, 1, 2, M('wood_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { lods: [1], maxDistance: 140 })

/**
 * Courtyard hockey box. Inner size w × d meters (rounded to 4 m steps: w 20/24/28…, d 36/40/44…),
 * long axis along local Z, centred on (x, z). Gate on the local −X (west at rot 0) side.
 * opts: { x, z, rot (quarter turns), y, w=24, d=44, seed, boardTint }
 * Returns { boards, lamps, goals, frame, ice: {min,max} }
 */
export function placeHockeyBox(ctx, o) {
  const F = frameFor(ctx, { ...o, angle: (o.rot ?? 0) * HALF_PI })
  const rng = new RNG(seedInt(o.seed, 23))
  const RM = R * V
  const w = Math.max(12, 4 + 4 * Math.round(((o.w ?? 24) - 4) / 4))
  const d = Math.max(20, 4 + 4 * Math.round(((o.d ?? 44) - 4) / 4))
  const y = F.y
  const tint = o.boardTint ?? rng.pick([0x41607e, 0x4a6a52, 0x5a6a7a])
  // ice: flattened and glossy, packed snow round the edge
  flatten(ctx, F, -w / 2 - 1.5, -d / 2 - 1.5, w / 2 + 1.5, d / 2 + 1.5, y, M('snow_packed'))
  flatten(ctx, F, -w / 2 + 0.25, -d / 2 + 0.25, w / 2 - 0.25, d / 2 - 0.25, y, M('ice'))
  const iceB = F.box(-w / 2, 0, -d / 2, w / 2, 0.2, d / 2)
  // snow thrown over the boards: banks along the outside
  for (let k = 0; k < 22; k++) {
    const side = k % 4
    const t = rng.float(-0.45, 0.45)
    const lx = side === 0 ? -w / 2 - 2.2 : side === 1 ? w / 2 + 2.2 : t * w
    const lz = side === 2 ? -d / 2 - 2.2 : side === 3 ? d / 2 + 2.2 : t * d
    const [wx, , wz] = F.p(lx, 0, lz)
    ctx.terrain.mound(wx, wz, rng.float(1.2, 2.4), rng.float(1.2, 2.4), rng.float(0.35, 0.8), M(k % 3 ? 'snow' : 'snow_bank'), 0.35, rng.int(0, 1e6))
  }
  // a little scraped snow left on the ice in the corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [wx, , wz] = F.p(sx * (w / 2 - 1.2), 0, sz * (d / 2 - 1.2))
    ctx.terrain.mound(wx, wz, 1.0, 1.0, 0.3, M('snow_packed'), 0.4, rng.int(0, 1e6))
  }
  const boards = []
  const runs = [
    { from: [-w / 2 + RM, d / 2], dir: [1, 0], len: w - 2 * RM, a: 0 },
    { from: [w / 2, d / 2 - RM], dir: [0, -1], len: d - 2 * RM, a: HALF_PI },
    { from: [w / 2 - RM, -d / 2], dir: [-1, 0], len: w - 2 * RM, a: Math.PI },
    { from: [-w / 2, -d / 2 + RM], dir: [0, 1], len: d - 2 * RM, a: -HALF_PI },
  ]
  runs.forEach((r, ri) => {
    const n = Math.round(r.len / 4)
    const gateAt = ri === 3 ? Math.floor(n / 2) : -1
    for (let i = 0; i < n; i++) {
      const lx = r.from[0] + r.dir[0] * 4 * i, lz = r.from[1] + r.dir[1] * 4 * i
      boards.push(put(ctx, F, i === gateAt ? 'pub_hockey_board_gate' : 'pub_hockey_board', lx, lz, { da: r.a, tint, tag: 'hockey' }))
    }
    const ex = r.from[0] + r.dir[0] * r.len, ez = r.from[1] + r.dir[1] * r.len
    boards.push(put(ctx, F, 'pub_hockey_corner', ex, ez, { da: r.a, tint, tag: 'hockey' }))
  })
  // goals near both ends, mouths toward the centre
  const goals = [
    put(ctx, F, 'pub_hockey_goal', 0, -d / 2 + 4, { q: 2, tag: 'hockey' }),
    put(ctx, F, 'pub_hockey_goal', 0, d / 2 - 4, { q: 0, tag: 'hockey' }),
  ]
  // lamp poles at the middle of the long sides, floodlights aimed in
  const lamps = []
  const sched = env => {
    const mn = env.game?.atmos?.minutes ?? 0
    return env.streetOn > 0.5 && mn >= 15 * 60 + 50 && mn < 22 * 60 + 30 ? 1 : 0
  }
  const dying = rng.int(0, 1)
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 + 1.0)
    const p = put(ctx, F, 'pub_hockey_lamp', lx, 0, { q: s < 0 ? 3 : 1, tag: 'lamp' })
    lamps.push(p)
    light(ctx, F, lx - s * 0.4, 7.6, 0, {
      type: 'spot', dir: [-s * 0.55, -1, 0], cone: 64, inner: 34, color: 0xe2ecf0, intensity: 34, range: 30,
      schedule: sched, placement: p, flicker: (s > 0 ? 1 : 0) === dying ? 'dying' : 'none', haloSize: 1.0, tag: 'lamp',
    })
  }
  // benches, the notice on the gate side
  put(ctx, F, 'pub_hockey_bench', -w / 2 - 2.6, -3.5, { q: 1, ground: true })
  const gz = (Math.floor(Math.round((d - 2 * RM) / 4) / 2) * 4 + 2) + (-d / 2 + RM)
  const gy = 0.9
  sign(ctx, F, -w / 2 - 0.52, gy, gz - 2.2, -1, 0, {
    w: 0.75, h: 0.55, ppm: 110, aged: 0.45, seed: 9,
    draw: (c, W, H) => drawText(c, W, H, { lines: ['КАТОК', 'Работает с 16 до 22 ч.', 'Выход на лёд', 'в обуви запрещён!', 'Управа района'], bg: '#e8e4d6', color: '#1c3266', font: PLAIN_FONT }),
  })
  readable(ctx, F, -w / 2 - 0.7, gy, gz - 2.2, [0.3, 0.6, 0.9], {
    ru: 'КАТОК\nРаботает с 16 до 22 ч.\nВыход на лёд в обуви запрещён!\nУправа района', en: 'SKATING RINK\nOpen 16:00 to 22:00\nNo walking on the ice in shoes!\nDistrict council', style: 'notice',
  })
  sign(ctx, F, w / 2 + 0.27, 0.7, 6, 1, 0, { w: 1.1, h: 0.4, ppm: 70, draw: (c, W, H) => { c.clearRect(0, 0, W, H); handText(c, W, H, { lines: ['ЦСКА — чемпион'], color: '#7a1a1a', seed: 4 }) } })
  navPath(ctx, F, [[-w / 2 - 3, gz], [-w / 2 + 3, gz], [0, 0]], 'path', { to: 'hockey' })
  reg(ctx, 'hockeyBoxes', { x: F.x, z: F.z, w, d, angle: F.a })
  return { boards, lamps, goals, frame: F, ice: iceB }
}

export const HOCKEY_DIMS = { boardHeight: 1.25, cornerRadius: R * V }
