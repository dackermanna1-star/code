// Typical 1970s Moscow school (ГОУ СОШ): a 4-storey white silicate-brick classroom wing, a
// 2-storey entrance block with a porch, columns and canopy, a gym block with tall gridded
// windows, a fenced yard with a gate, a snowed-in sports ground (goal frames, basketball hoop,
// pull-up bars) and a flagpole. All windows dark at night except the caretaker's room (warm
// lamp and a flickering TV) and one classroom where a cleaner mops between upturned chairs.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, HALF_PI, frameFor, put, sign, readable, interact, light, flatten, paint, navPath, reg, seed01,
  seedInt, win, ffill, fset, streak, pasteFigure, drawText, ageCanvas, SIGN_FONT, PLAIN_FONT,
  SERIF_FONT,
} from './lib.js'
import { addEmitter } from './runtime.js'

// ---- wing geometry (voxels) -------------------------------------------------------------
const WX = 224, WZ = 52
const FH = 13 // floor-to-floor (3.25 m)
const BASE = 3 // ground-floor slab layer
const floorY = f => BASE + f * FH
const BAY = 14
// the classroom with the cleaner (3rd floor, front, bays 11..13)
const CLASS = { f: 2, b0: 11, b1: 13, depth: 24 }

function buildWing(floors) {
  const top = floorY(floors) // roof slab layer
  const Y = top + 7 // parapet, roof-exit box (4) + its cap + snow
  const m = new VoxelModel(WX, Y, WZ)
  const rng = new RNG(1970 + floors)
  const brick = M('brick_silicate'), plinth = M('concrete_dark'), lintel = M('concrete_light')
  m.fill(0, 0, 0, WX, top + 1, WZ, M('concrete'))
  // outer skin
  ffill(m, 'front', 0, BASE, 0, WX, top - BASE + 1, 1, brick)
  ffill(m, 'back', 0, BASE, 0, WX, top - BASE + 1, 1, brick)
  ffill(m, 'left', 0, BASE, 0, WZ, top - BASE + 1, 1, brick)
  ffill(m, 'right', 0, BASE, 0, WZ, top - BASE + 1, 1, brick)
  for (const face of ['front', 'back']) ffill(m, face, 0, 0, 0, WX, BASE, 1, plinth)
  for (const face of ['left', 'right']) ffill(m, face, 0, 0, 0, WZ, BASE, 1, plinth)
  // cornice band + parapet with flashing
  for (const face of ['front', 'back']) ffill(m, face, 0, top - 1, 0, WX, 2, 1, lintel)
  for (const face of ['left', 'right']) ffill(m, face, 0, top - 1, 0, WZ, 2, 1, lintel)
  m.fill(0, top, 0, WX, 1, WZ, M('roof_tar'))
  m.walls(0, top + 1, 0, WX, 1, WZ, M('metal_gray'), 1)
  // roof furniture: exit hatch box, vents
  m.fill(20, top + 1, 20, 8, 4, 8, brick); m.fill(20, top + 5, 20, 8, 1, 8, M('roof_tar'))
  m.fill(23, top + 1, 19, 2, 3, 1, M('metal_gray'))
  for (const x of [60, 110, 170]) { m.fill(x, top + 1, 30, 3, 2, 3, M('concrete')); m.set(x + 1, top + 3, 31, M('metal_dark')) }

  // ---- windows ----
  for (let f = 0; f < floors; f++) {
    const fy = floorY(f)
    for (let b = 0; b < WX / BAY; b++) {
      const u = b * BAY
      const isStair = b === 0 || b === WX / BAY - 1
      // front
      if (isStair) {
        // stairwell: tall narrow windows half a floor up
        const sy = fy + 8
        if (sy + 8 < top - 1) {
          win(m, 'front', u + 4, sy, 6, 8, { cols: 2, transom: 2, snow: 0.6, rng })
          ffill(m, 'front', u + 3, sy + 8, 0, 8, 1, 1, lintel)
        }
      } else if (!(f < 2 && b >= 6 && b <= 9)) {
        const inClass = f === CLASS.f && b >= CLASS.b0 && b <= CLASS.b1
        win(m, 'front', u + 2, fy + 4, 10, 8, inClass ? { cols: 2, snow: 0.75, rng, glass: M('pub_glass_cold') } : { cols: 3, transom: 2, snow: 0.75, rng })
        ffill(m, 'front', u + 1, fy + 12, 0, 12, 1, 1, lintel)
      }
      // back (corridor side): smaller windows
      if (!isStair && !(b >= 12 && f < 2)) {
        win(m, 'back', u + 4, fy + 5, 6, 7, { cols: 2, transom: 2, snow: 0.6, rng })
        ffill(m, 'back', u + 3, fy + 12, 0, 8, 1, 1, lintel)
      }
    }
  }
  // the occasional open fortochka (a dark gap) and a cardboard-patched pane
  for (let k = 0; k < 6; k++) {
    const b = rng.int(1, 14), f = rng.int(0, floors - 1)
    if (f < 2 && b >= 6 && b <= 9) continue
    const u = b * BAY + 2, y = floorY(f) + 4
    fset(m, 'front', u + 1, y + 6, 1, k % 2 ? M('pub_cardboard') : M('metal_dark'))
  }
  // the classroom room behind its windows: parquet, green dado, blackboard, desks with
  // chairs upturned on them, a cleaner with a mop and bucket, fluorescent fixtures
  {
    const fy = floorY(CLASS.f)
    const x0 = CLASS.b0 * BAY + 1, x1 = (CLASS.b1 + 1) * BAY - 2
    const z0 = 2, z1 = CLASS.depth + 1
    m.clear(x0, fy + 1, z0, x1 - x0 + 1, FH - 1, z1 - z0 + 1)
    m.addInterior(x0, fy + 1, z0, x1 - x0 + 1, FH - 1, z1 - z0 + 1)
    m.fill(x0, fy, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('wood'))
    // walls: green oil paint dado, whitewash above
    const wallMat = (y) => y <= fy + 5 ? M('wall_paint_green') : M('whitewash')
    for (let y = fy + 1; y < fy + FH; y++) {
      m.fill(x0 - 1, y, z0, 1, 1, z1 - z0 + 1, wallMat(y))
      m.fill(x1 + 1, y, z0, 1, 1, z1 - z0 + 1, wallMat(y))
      m.fill(x0, y, z1 + 1, x1 - x0 + 1, 1, 1, wallMat(y))
      // window wall inner face between windows
      for (let x = x0; x <= x1; x++) if (m.get(x, y, 1) === M('concrete')) m.set(x, y, 1, wallMat(y))
    }
    m.fill(x0, fy + FH, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('whitewash'))
    // blackboard on the east wall (pupils face east, windows on their left)
    m.fill(x1, fy + 4, z0 + 6, 1, 5, 12, M('needles'))
    m.fill(x1, fy + 3, z0 + 6, 1, 1, 12, M('wood'))
    // teacher's desk
    m.fill(x1 - 5, fy + 1, z0 + 8, 2, 3, 5, M('wood_dark'))
    // pupils' desks (paired) in 3 rows, chairs upturned on top
    for (let r = 0; r < 3; r++) {
      const dz = z0 + 3 + r * 7
      for (let c = 0; c < 5; c++) {
        const dx = x0 + 3 + c * 6
        if (dx + 3 > x1 - 7) continue
        m.fill(dx, fy + 3, dz, 2, 1, 4, M('wood'))
        m.set(dx, fy + 1, dz, M('metal_dark')); m.set(dx, fy + 2, dz, M('metal_dark'))
        m.set(dx, fy + 1, dz + 3, M('metal_dark')); m.set(dx, fy + 2, dz + 3, M('metal_dark'))
        // upturned chairs
        m.fill(dx, fy + 4, dz, 1, 1, 2, M('wood')); m.set(dx + 1, fy + 5, dz, M('metal_dark'))
        m.fill(dx, fy + 4, dz + 2, 1, 1, 2, M('wood')); m.set(dx + 1, fy + 5, dz + 3, M('metal_dark'))
      }
    }
    // radiators under the windows
    for (let b = CLASS.b0; b <= CLASS.b1; b++) m.fill(b * BAY + 3, fy + 1, 2, 8, 2, 1, M('whitewash'))
    // cleaner with a mop (handle leaning) and a bucket
    const cx = x0 + 17, cz = z0 + 14
    pasteFigure(m, cx, fy + 1, cz, 1, { top: M('pub_fabric_blue'), bottom: M('metal_dark'), skirt: M('pub_fabric_blue'), legs: M('pub_skin'), hat: M('plastic_white'), armsFront: true })
    m.set(cx - 1, fy + 1, cz + 1, M('metal_gray'))
    for (let k = 0; k < 4; k++) m.set(cx - 1 - (k >> 1), fy + 2 + k, cz, M('wood'))
    m.set(cx - 1, fy + 1, cz - 1, M('pub_cardboard'))
    // wet floor patch
    for (let k = 0; k < 14; k++) m.set(cx - rng.int(1, 5), fy, cz + rng.int(-3, 3), M('slush'))
    // ceiling fixtures
    for (const fx of [x0 + 6, x0 + 20]) for (const fz of [z0 + 5, z0 + 15]) {
      m.fill(fx, fy + FH - 1, fz, 6, 1, 2, M('plastic_white'))
      m.fill(fx + 1, fy + FH - 1, fz, 4, 1, 1, M('fluorescent'))
    }
    // potted plants on the sills
    for (let b = CLASS.b0; b <= CLASS.b1; b++) { m.set(b * BAY + 4, fy + 4, 2, M('metal_brown')); m.set(b * BAY + 4, fy + 5, 2, M('needles')); m.set(b * BAY + 9, fy + 4, 2, M('needles')) }
  }
  // downpipes with ice at the foot
  for (const u of [13, 97, 125, 209]) {
    for (let y = 1; y < top; y++) fset(m, 'front', u, y, 0, M('metal_gray'))
    fset(m, 'front', u, 0, 0, M('ice'))
  }
  // weathering: grime streaks under some sills, darker plinth splash
  for (let k = 0; k < 40; k++) {
    const u = rng.int(2, WX - 3), y = rng.int(BASE + 2, top - 3)
    streak(m, rng.chance(0.5) ? 'front' : 'back', u, y, rng.int(3, 9), M('concrete'), rng, 0.6)
  }
  m.addSnow({ mat: M('snow'), depth: 1, seed: 5 })
  // drifted second layer on the roof
  for (let z = 1; z < WZ - 1; z++) for (let x = 1; x < WX - 1; x++) {
    if (m.get(x, top + 1, z) !== M('snow')) continue
    const n = Math.sin(x * 0.09 + z * 0.13) + Math.sin(z * 0.21 + 2.0) * 0.6
    if (n > 0.4 || x < 3 || z < 3 || x > WX - 4 || z > WZ - 4) m.set(x, top + 2, z, M('snow'))
  }
  return m
}

defineModel('pub_school_wing', () => buildWing(4), { occludesSnow: true, lods: [1, 2, 4], lodDistances: [80, 200], maxDistance: 1000 })
defineModel('pub_school_wing3', () => buildWing(3), { occludesSnow: true, lods: [1, 2, 4], lodDistances: [80, 200], maxDistance: 1000 })

// ---- entrance block -------------------------------------------------------------------
const EX = 56, EZ = 32, EF = 8 // front wall at z = EF (porch in front)
const EY = BASE + 2 * FH + 4
defineModel('pub_school_entry', () => {
  const m = new VoxelModel(EX, EY + 2, EZ)
  m.setPivot(EX / 2, 0, EF + (EZ - EF) / 2)
  const rng = new RNG(7007)
  const brick = M('brick_silicate'), lintel = M('concrete_light')
  const top = BASE + 2 * FH + 1
  m.fill(0, 0, EF, EX, top + 1, EZ - EF, M('concrete'))
  m.fill(0, BASE, EF, EX, top - BASE + 1, 1, brick)
  m.fill(0, BASE, EF, 1, top - BASE + 1, EZ - EF, brick); m.fill(EX - 1, BASE, EF, 1, top - BASE + 1, EZ - EF, brick)
  m.fill(0, 0, EF, EX, BASE, 1, M('concrete_dark'))
  m.fill(0, top - 1, EF, EX, 2, 1, lintel)
  m.fill(0, top, EF, EX, 1, EZ - EF, M('roof_tar'))
  m.walls(0, top + 1, EF, EX, 1, EZ - EF, M('metal_gray'), 1)
  // upper floor: the long lobby glazing band
  for (let k = 0; k < 4; k++) win(m, 'front', 4 + k * 12, BASE + FH + 3, 11, 9, { d0: EF, cols: 3, transom: 2, snow: 0.7, rng })
  m.fill(3, BASE + FH + 12, EF, 50, 1, 1, lintel)
  // ground floor: double doors in the centre, caretaker's window (left), dark window (right)
  m.clear(24, BASE, EF, 8, 10, 2)
  m.fill(24, BASE, EF + 1, 8, 10, 1, M('window_frame_brown'))
  m.fill(25, BASE + 5, EF + 1, 2, 4, 1, M('pub_glass_dark')); m.fill(29, BASE + 5, EF + 1, 2, 4, 1, M('pub_glass_dark'))
  m.set(27, BASE + 4, EF + 1, M('chrome')); m.set(28, BASE + 4, EF + 1, M('chrome'))
  m.fill(23, BASE, EF, 1, 11, 1, lintel); m.fill(32, BASE, EF, 1, 11, 1, lintel); m.fill(23, BASE + 10, EF, 10, 1, 1, lintel)
  win(m, 'front', 8, BASE + 4, 10, 8, { d0: EF, cols: 2, snow: 0.6, rng, glass: M('pub_glass_warm') })
  win(m, 'front', 38, BASE + 4, 10, 8, { d0: EF, cols: 3, transom: 2, snow: 0.6, rng })
  // caretaker's room behind the left window
  {
    const x0 = 6, x1 = 19, z0 = EF + 2, z1 = EF + 13, fy = BASE
    m.clear(x0, fy + 1, z0, x1 - x0 + 1, 11, z1 - z0 + 1)
    m.addInterior(x0, fy + 1, z0, x1 - x0 + 1, 11, z1 - z0 + 1)
    m.fill(x0, fy, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('linoleum'))
    for (let y = fy + 1; y <= fy + 11; y++) {
      const wm = y <= fy + 5 ? M('wall_paint_blue') : M('whitewash')
      m.fill(x0 - 1, y, z0, 1, 1, z1 - z0 + 1, wm); m.fill(x1 + 1, y, z0, 1, 1, z1 - z0 + 1, wm)
      m.fill(x0, y, z1 + 1, x1 - x0 + 1, 1, 1, wm)
      for (let x = x0; x <= x1; x++) if (m.get(x, y, EF + 1) === M('concrete')) m.set(x, y, EF + 1, wm)
    }
    m.fill(x0, fy + 12, z0, x1 - x0 + 1, 1, z1 - z0 + 1, M('whitewash'))
    // desk under the window with a kettle, desk lamp, logbook; watchman on a chair; TV on a stool
    m.fill(9, fy + 1, z0, 8, 3, 3, M('wood_dark'))
    m.set(10, fy + 4, z0, M('chrome')); m.set(10, fy + 5, z0, M('plastic_dark'))
    m.set(15, fy + 4, z0 + 1, M('metal_green')); m.set(15, fy + 5, z0, M('lamp_warm'))
    m.fill(12, fy + 4, z0 + 1, 2, 1, 1, M('paper'))
    pasteFigure(m, 11, fy + 1, z0 + 4, 2, { pose: 'sit', top: M('metal_dark'), bottom: M('metal_dark'), hair: M('concrete_light'), armsFront: true })
    m.fill(12, fy + 1, z0 + 9, 2, 2, 2, M('wood'))
    m.fill(12, fy + 3, z0 + 9, 2, 2, 2, M('plastic_dark')); m.fill(12, fy + 3, z0 + 9, 2, 2, 1, M('tv_screen'))
    // key board and a coat rack
    m.fill(x1, fy + 6, z0 + 3, 1, 3, 4, M('wood'))
    for (let k = 0; k < 4; k++) m.set(x1, fy + 7, z0 + 3 + k, M('chrome'))
    m.fill(x0, fy + 1, z1 - 1, 1, 8, 1, M('wood_dark')); m.fill(x0, fy + 7, z1 - 2, 1, 2, 1, M('leatherette'))
    // ceiling bulb in a glass shade
    m.set(13, fy + 11, z0 + 6, M('lamp_bulb'))
  }
  // porch: three steps, a landing, two round columns and the concrete canopy
  for (let s = 0; s < 3; s++) m.fill(17, s, 1 + s * 2, 22, 1, EF - 1 - s * 2, M('concrete_light'))
  m.fill(17, 2, 5, 22, 1, EF - 5, M('granite'))
  for (const cx of [19, 36]) for (let y = 1; y < BASE + 10; y++) { m.fill(cx, y, 2, 2, 1, 2, M('concrete_light')) }
  m.fill(16, BASE + 10, 1, 24, 1, EF, M('concrete_light'))
  m.fill(16, BASE + 11, 1, 24, 1, 1, M('concrete'))
  // steel handrails on the steps
  for (const hx of [17, 38]) {
    for (let z = 1; z <= 7; z++) m.set(hx, (z < 3 ? 0 : z < 5 ? 1 : 2) + 4, z, M('metal_dark'))
    for (const z of [1, 7]) for (let y = 1; y <= (z < 3 ? 3 : 5); y++) m.set(hx, y, z, M('metal_dark'))
  }
  // flowerbed boxes either side (snow mounds)
  m.fill(4, 0, 2, 10, 2, 5, M('concrete')); m.fill(42, 0, 2, 10, 2, 5, M('concrete'))
  m.fill(5, 2, 3, 8, 1, 3, M('snow_fresh')); m.fill(43, 2, 3, 8, 1, 3, M('snow_fresh'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 9 })
  // a swept path on the steps (janitor was here)
  for (let s = 0; s < 3; s++) for (let x = 24; x <= 31; x++) for (let z = 1 + s * 2; z < EF; z++) if (m.get(x, s + 1, z) === M('snow')) m.set(x, s + 1, z, 0)
  for (let x = 24; x <= 31; x++) for (let z = 5; z < EF; z++) if (m.get(x, 3, z) === M('snow')) m.set(x, 3, z, 0)
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [70, 180], maxDistance: 900 })

// ---- gym block -------------------------------------------------------------------------
const GX = 48, GZ = 96, GY = 34
defineModel('pub_school_gym', () => {
  const m = new VoxelModel(GX, GY + 3, GZ)
  const rng = new RNG(4848)
  const brick = M('brick_silicate')
  m.fill(0, 0, 0, GX, GY, GZ, M('concrete'))
  for (const face of ['left', 'right', 'back', 'front']) {
    const len = face === 'left' || face === 'right' ? GZ : GX
    ffill(m, face, 0, 3, 0, len, GY - 3, 1, brick)
    ffill(m, face, 0, 0, 0, len, 3, 1, M('concrete_dark'))
    ffill(m, face, 0, GY - 2, 0, len, 2, 1, M('concrete_light'))
  }
  m.fill(0, GY - 1, 0, GX, 1, GZ, M('roof_tar'))
  m.walls(0, GY, 0, GX, 1, GZ, M('metal_gray'), 1)
  // tall gridded windows (protective mesh inside reads as a fine white grid)
  for (const face of ['left', 'right']) {
    for (let k = 0; k < 5; k++) {
      const u = 8 + k * 18
      win(m, face, u, 10, 12, 18, { cols: 4, transom: 6, snow: 0.6, rng })
      for (let y = 10 + 4; y < 27; y += 4) for (let uu = u; uu < u + 12; uu++) fset(m, face, uu, y, 1, M('window_frame_white'))
      ffill(m, face, u - 1, 28, 0, 14, 1, 1, M('concrete_light'))
    }
  }
  // gym side doors (double steel, painted green) with a small canopy
  ffill(m, 'right', 40, 3, 0, 8, 10, 1, M('metal_green'))
  ffill(m, 'right', 43, 3, 0, 1, 10, 1, M('metal_dark'))
  ffill(m, 'back', 18, 3, 0, 12, 10, 1, M('metal_green'))
  ffill(m, 'back', 23, 3, 0, 1, 10, 1, M('metal_dark'))
  ffill(m, 'back', 17, 13, 0, 14, 1, 1, M('concrete_light'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 7 })
  for (let z = 1; z < GZ - 1; z++) for (let x = 1; x < GX - 1; x++) {
    if (m.get(x, GY, z) === M('snow') && (Math.sin(z * 0.15 + x * 0.3) > 0.2 || x < 3 || x > GX - 4)) m.set(x, GY + 1, z, M('snow'))
  }
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [70, 180], maxDistance: 900 })

// ---- yard furniture ----------------------------------------------------------------------
// fence panel 2.5 m × 1.75 m, steel bars with points; colour = placement tint (paint)
defineModel('pub_fence_school', () => {
  const m = new VoxelModel(10, 8, 1)
  const p = M('paint')
  for (let x = 0; x < 10; x += 2) m.fill(x, 0, 0, 1, 7, 1, p)
  m.fill(0, 1, 0, 10, 1, 1, p); m.fill(0, 5, 0, 10, 1, 1, p)
  for (let x = 0; x < 10; x += 2) m.set(x, 7, 0, p)
  m.fill(0, 0, 0, 1, 8, 1, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.8, seed: 3 })
  m.setPivot(0, 0, 0.5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 160 })

// two-leaf gate 4 m (closed, chained) between square posts; pivot at the left post
defineModel('pub_gate_school', () => {
  const m = new VoxelModel(18, 9, 1)
  const p = M('paint')
  m.fill(0, 0, 0, 1, 9, 1, M('metal_dark')); m.fill(17, 0, 0, 1, 9, 1, M('metal_dark'))
  for (let x = 1; x < 17; x += 2) m.fill(x, 0, 0, 1, 8, 1, p)
  for (const y of [1, 4, 7]) m.fill(1, y, 0, 16, 1, 1, p)
  m.set(8, 4, 0, M('chrome')); m.set(9, 4, 0, M('chrome')); m.set(9, 3, 0, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 4 })
  m.setPivot(0, 0, 0.5)
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 180 })

// football goal frame 5 × 2 m, peeling white paint and rust, no net; front = local −Z
defineModel('pub_goal_frame', () => {
  const m = new VoxelModel(21, 9, 5)
  const w = M('pub_paint_white'), r = M('metal_rust')
  m.fill(0, 0, 0, 1, 8, 1, w); m.fill(20, 0, 0, 1, 8, 1, w)
  m.fill(0, 8, 0, 21, 1, 1, w)
  // back stays
  for (const x of [0, 20]) { for (let z = 1; z < 5; z++) m.set(x, Math.max(0, 7 - z * 2), z, M('metal_gray')); m.fill(x, 0, 4, 1, 1, 1, M('metal_gray')) }
  m.fill(0, 0, 4, 21, 1, 1, M('metal_gray'))
  const rng = new RNG(55)
  for (let k = 0; k < 12; k++) { const x = rng.pick([0, 20]); m.set(x, rng.int(0, 7), 0, r) }
  for (let k = 0; k < 6; k++) m.set(rng.int(1, 19), 8, 0, r)
  m.addSnow({ mat: M('snow'), depth: 1, seed: 6 })
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 200 })

// basketball hoop: pole, backboard, rim with a torn chain net; front = local −Z
defineModel('pub_basket_hoop', () => {
  const m = new VoxelModel(7, 16, 6)
  m.fill(3, 0, 5, 1, 14, 1, M('metal_gray'))
  m.fill(3, 13, 3, 1, 1, 3, M('metal_gray'))
  m.fill(0, 11, 2, 7, 5, 1, M('pub_paint_white'))
  m.fill(2, 12, 2, 3, 2, 1, M('metal_red'))
  m.set(2, 11, 1, M('metal_red')); m.set(4, 11, 1, M('metal_red')); m.set(2, 11, 0, M('metal_red')); m.set(3, 11, 0, M('metal_red')); m.set(4, 11, 0, M('metal_red'))
  m.set(3, 10, 0, M('pub_net'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 8 })
  return m
}, { contact: false, lods: [1, 2], lodDistances: [40], maxDistance: 200 })

// pull-up bars (турник): three bars at 1.5 / 2.0 / 2.5 m
defineModel('pub_pullup_bars', () => {
  const m = new VoxelModel(13, 11, 1)
  for (const x of [0, 4, 8, 12]) m.fill(x, 0, 0, 1, x === 0 ? 6 : x === 4 ? 6 : x === 8 ? 8 : 10, 1, M('metal_dark'))
  m.fill(0, 6, 0, 5, 1, 1, M('metal_gray')); m.fill(4, 8, 0, 5, 1, 1, M('metal_gray')); m.fill(8, 10, 0, 5, 1, 1, M('metal_gray'))
  m.fill(4, 6, 0, 1, 2, 1, M('metal_dark')); m.fill(8, 8, 0, 1, 2, 1, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, seed: 2 })
  return m
}, { contact: false, lods: [1], maxDistance: 150 })

// flagpole (8 m) on a small concrete base, halyard rope
defineModel('pub_flagpole', () => {
  const m = new VoxelModel(3, 33, 3)
  m.fill(0, 0, 0, 3, 1, 3, M('concrete'))
  m.fill(1, 1, 1, 1, 32, 1, M('metal_gray'))
  m.set(1, 32, 1, M('chrome'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { lods: [1], maxDistance: 300 })

// ---------------------------------------------------------------------------------------
function mosaicPainter(seed) {
  return (ctx, W, H) => {
    const rng = new RNG(seed)
    // small glazed tiles: base field + figures (sun, rocket, two children with a book)
    const T = Math.max(3, Math.round(W / 70))
    const cols = ['#c9c2a8', '#b8b19a', '#d2cbb4']
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      ctx.fillStyle = cols[rng.int(0, 2)]; ctx.fillRect(x, y, T - 1, T - 1)
    }
    const shape = (fn, palette) => {
      for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
        if (fn(x / W, y / H) && rng.next() > 0.06) { ctx.fillStyle = palette[rng.int(0, palette.length - 1)]; ctx.fillRect(x, y, T - 1, T - 1) }
      }
    }
    shape((u, v) => (u - 0.78) ** 2 + ((v - 0.2) * H / W) ** 2 < 0.012, ['#d8a640', '#e0b54a', '#c8962e'])
    // rocket rising diagonally
    shape((u, v) => { const a = (u - 0.18) * 0.8 + (v - 0.55) * 0.6, b = -(u - 0.18) * 0.6 + (v - 0.55) * 0.8; return Math.abs(b) < 0.035 - a * 0.05 && a > -0.15 && a < 0.12 }, ['#b8b8b0', '#a8a8a0', '#9a3a2c'])
    shape((u, v) => { const a = (u - 0.18) * 0.8 + (v - 0.55) * 0.6, b = -(u - 0.18) * 0.6 + (v - 0.55) * 0.8; return Math.abs(b) < 0.02 && a > 0.12 && a < 0.35 }, ['#c8762e', '#d8a640'])
    // two children (blue, red), a white book between them
    shape((u, v) => Math.abs(u - 0.45) < 0.05 && v > 0.45 && v < 0.9, ['#3a5a8a', '#2f4f7a'])
    shape((u, v) => (u - 0.45) ** 2 + ((v - 0.38) * H / W) ** 2 < 0.0018, ['#d4ab8c'])
    shape((u, v) => Math.abs(u - 0.6) < 0.05 && v > 0.45 && v < 0.9, ['#9a3a2c', '#a8463a'])
    shape((u, v) => (u - 0.6) ** 2 + ((v - 0.38) * H / W) ** 2 < 0.0018, ['#d4ab8c'])
    shape((u, v) => Math.abs(u - 0.525) < 0.03 && Math.abs(v - 0.55) < 0.05, ['#ece8dc'])
    // missing tiles
    for (let k = 0; k < 30; k++) { ctx.fillStyle = '#8e8c86'; ctx.fillRect(rng.int(0, W), rng.int(0, H), T * rng.int(1, 3), T * rng.int(1, 2)) }
    ageCanvas(ctx, W, H, 0.45, seed)
  }
}

/**
 * Place a school with its fenced yard. The site is 84 × 72 m centred on (x, z); the main facade
 * and entrance face local −Z (north at rot 0) with the gate in the middle of the front fence.
 * opts: { x, z, rot (quarter turns), y, seed, number (school number, default 1048), floors (3|4, default 4),
 *         fence=true, yard=true, fenceTint (default dark green) }
 * Returns { wing, entry, gym, frame, entrance: [x,z], site: {min,max} }
 */
export function placeSchool(ctx, o) {
  const F = frameFor(ctx, { ...o, angle: (o.rot ?? 0) * HALF_PI })
  const rng = new RNG(seedInt(o.seed, 61))
  const number = o.number ?? 1048
  const floors = o.floors === 3 ? 3 : 4
  const wingTop = floorY(floors) * V
  const y = F.y
  // footprints flattened to the base level
  flatten(ctx, F, -28.25, -24.25, 28.25, -10.75, y, M('snow_packed'))
  flatten(ctx, F, -7.25, -32.25, 7.25, -23.75, y, M('snow_packed'))
  flatten(ctx, F, 15.75, -11.25, 28.25, 13.25, y, M('snow_packed'))
  const wing = put(ctx, F, floors === 3 ? 'pub_school_wing3' : 'pub_school_wing', 0, -17.5, { seed: seed01(o.seed, 1), tag: 'building', userData: { kind: 'school_wing' } })
  const entry = put(ctx, F, 'pub_school_entry', 0, -27, { seed: seed01(o.seed, 2), tag: 'building', userData: { kind: 'school_entry' } })
  const gym = put(ctx, F, 'pub_school_gym', 22, 1, { seed: seed01(o.seed, 3), tag: 'building', userData: { kind: 'school_gym' } })
  // forecourt path from the gate to the porch, and a trodden path round to the gym
  flatten(ctx, F, -2, -37, 2, -32, y, M('snow_packed'))
  paint(ctx, F, -3, -33.5, 3, -32, M('asphalt'))

  // ---- lights ----------------------------------------------------------------------------
  // entrance bulb under the canopy (night)
  const lampP = put(ctx, F, 'pub_lamp_wall_bulb', 0, -30, { ly: (BASE + 10) * V - 0.3, tag: 'lamp' })
  light(ctx, F, 0, 2.9, -30.6, { type: 'spot', dir: [0, -1, -0.3], cone: 70, inner: 30, color: 0xffc47e, intensity: 7, range: 9, schedule: 'night', placement: lampP, haloSize: 0.6, tag: 'lamp' })
  // caretaker's room (warm bulb + TV) — flag-linked to the entry block (lamp, TV, far glass)
  const roomSched = env => env.night > 0.4 ? 1 : 0
  light(ctx, F, (12.5 - EX / 2) * V, 2.7, -30 + 5.5 * V, { color: 0xffc27a, intensity: 1.5, range: 5.5, domain: 'indoor', schedule: roomSched, placement: entry, halo: false })
  light(ctx, F, (13 - EX / 2) * V, 1.9, -30.4, { color: 0xffb870, intensity: 1.1, range: 5, schedule: roomSched, halo: false })
  // the cleaner's classroom (3rd floor): on in the evening only
  const classSched = env => {
    const mnt = env.game?.atmos?.minutes ?? 0
    return env.night > 0.4 && mnt > 16 * 60 + 30 && mnt < 22 * 60 + 15 ? 1 : 0
  }
  const cx = ((CLASS.b0 + CLASS.b1 + 1) / 2 * BAY - WX / 2) * V
  light(ctx, F, cx, floorY(CLASS.f) * V + 2.9, -24 + 3, { color: 0xe4efe8, intensity: 2.0, range: 9, domain: 'indoor', schedule: classSched, placement: wing, halo: false })

  // ---- signs -------------------------------------------------------------------------------
  // big letters on the entry block above the canopy
  sign(ctx, F, 0, (BASE + FH + 1.6) * V, -30, 0, -1, {
    w: 7.5, h: 0.7, ppm: 50,
    draw: (c, W, H) => { c.clearRect(0, 0, W, H); drawText(c, W, H, { lines: [`ШКОЛА № ${number}`], color: '#24365e', font: SIGN_FONT, weight: 'bold', shadow: 'rgba(20,20,20,0.35)' }) },
  })
  // official plaque by the door
  sign(ctx, F, 1.85, 1.65, -30, 0, -1, {
    w: 0.55, h: 0.4, ppm: 160, aged: 0.15, seed: 2,
    draw: (c, W, H) => {
      c.fillStyle = '#2a1c18'; c.fillRect(0, 0, W, H)
      c.strokeStyle = '#b8954a'; c.lineWidth = 2; c.strokeRect(3, 3, W - 6, H - 6)
      drawText(c, W, H, { lines: ['Департамент образования г. Москвы', 'ГОУ средняя', 'общеобразовательная школа', `№ ${number}`], color: '#d8b860', font: SERIF_FONT, weight: 'bold', pad: 8 })
    },
  })
  readable(ctx, F, 1.85, 1.65, -30.2, [0.6, 0.45, 0.3], {
    ru: `Департамент образования города Москвы\nГосударственное образовательное учреждение\nсредняя общеобразовательная школа № ${number}`,
    en: `Moscow Department of Education\nState Educational Institution\nSecondary School No. ${number}`, style: 'sign',
  })
  // notice on the door: winter holidays
  sign(ctx, F, -0.55, 1.45, -30 + 0.26, 0, -1, { w: 0.3, h: 0.42, ppm: 150, aged: 0.4, seed: 11, draw: (c, W, H) => drawText(c, W, H, { lines: ['ВНИМАНИЕ!', 'Зимние каникулы', 'с 29.12.07', 'по 11.01.08', 'Администрация'], bg: '#ecebe2', color: '#1a1a1a', font: PLAIN_FONT }) })
  interact(ctx, F, 0, 1.3, -30.1, [2.1, 2.4, 0.5], {
    tag: 'door', reach: 2.6,
    prompt: { ru: 'Дверь школы', en: 'School door' },
    onUse(game) {
      game.audio?.play?.('door_metal_open', { pos: F.p(0, 1.2, -30), gain: 0.25 })
      game.ui.showNote({ style: 'notice', ru: 'Заперто.\n\nВНИМАНИЕ! Зимние каникулы с 29.12.07 по 11.01.08.\nАдминистрация', en: 'Locked.\n\nATTENTION! Winter holidays from 29.12.07 to 11.01.08.\nThe Administration' })
    },
  })
  // the mosaic panel on the west end wall of the wing
  sign(ctx, F, -28, 6.5, -17.5, -1, 0, { w: 8.5, h: 6.5, ppm: 28, draw: mosaicPainter(seedInt(o.seed, 3) % 1000) })
  readable(ctx, F, -28.2, 1.6, -17.5, [0.4, 1.2, 6], { ru: 'Мозаичное панно: двое школьников с книгой, ракета, солнце. Половины плиток не хватает.', en: 'A mosaic panel: two schoolchildren with a book, a rocket, the sun. Half the tiles are missing.', style: 'paper' }, { prompt: { ru: 'Рассмотреть', en: 'Look closer' } })

  // ---- yard: fence, gate, sports ground ----------------------------------------------------
  const SX = 42.5, SZ = 36.25
  const site = F.box(-SX, 0, -SZ, SX, 3, SZ)
  if (o.fence !== false) {
    const tint = o.fenceTint ?? 0x46624e
    const run = (ax, az, bx, bz, skip) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 2.5 + 1e-6)
      const dx = (bx - ax) / len, dz = (bz - az) / len
      const da = Math.atan2(-dz, dx)
      for (let i = 0; i < n; i++) {
        const px = ax + dx * 2.5 * i, pz = az + dz * 2.5 * i
        if (skip && skip(px, pz)) continue
        put(ctx, F, 'pub_fence_school', px, pz, { da, ground: true, tint, tag: 'fence' })
      }
    }
    run(-SX, -SZ, SX, -SZ, (px) => px > -3 && px < 6)
    run(SX, -SZ, SX, SZ)
    run(SX, SZ, -SX, SZ)
    run(-SX, SZ, -SX, -SZ)
    put(ctx, F, 'pub_gate_school', -2.25, -SZ, { ground: true, tint, tag: 'gate' })
    // the wicket gap at x 2.25..5 stays open; a panel beside it carries the dog notice
    put(ctx, F, 'pub_fence_school', 5, -SZ, { ground: true, tint, tag: 'fence' })
    const gy = ctx.terrain.heightAt(F.wx(6.25, -SZ), F.wz(6.25, -SZ)) - F.y
    sign(ctx, F, 6.25, gy + 1.15, -SZ - 0.14, 0, -1, { w: 0.5, h: 0.3, ppm: 120, aged: 0.4, seed: 5, lines: ['Выгул собак', 'запрещён!'], bg: '#e2ddd0', color: '#8a1a1a', font: PLAIN_FONT })
    readable(ctx, F, 6.25, gy + 1.15, -SZ - 0.3, [0.6, 0.4, 0.3], { ru: 'Выгул собак запрещён!', en: 'No dog walking!', style: 'sign' })
  }
  if (o.yard !== false) {
    // football pitch under snow, goals at both ends, hoop, pull-up bars, flagpole
    put(ctx, F, 'pub_goal_frame', -36, 13, { q: 1, ground: true, tag: 'sport' })
    put(ctx, F, 'pub_goal_frame', 8, 13, { q: 3, ground: true, tag: 'sport' })
    put(ctx, F, 'pub_basket_hoop', 13, 28, { q: 3, ground: true, tag: 'sport' })
    put(ctx, F, 'pub_pullup_bars', -36, -6, { ground: true, tag: 'sport' })
    put(ctx, F, 'pub_flagpole', 9, -33, { ground: true })
    // a kids' trail across the snowed-in pitch
    if (ctx.footprints?.addTrail) {
      try {
        const pts = [[-30, 30], [-18, 18], [-10, 10], [0, 4], [12, -4], [14, -9]].map(([a, b]) => [F.wx(a, b), F.wz(a, b)])
        ctx.footprints.addTrail(pts, ctx.terrain, 0.6)
      } catch (e) { void e }
    }
  }
  // ---- navigation & registry ---------------------------------------------------------------
  const ent = [F.wx(0, -33), F.wz(0, -33)]
  navPath(ctx, F, [[0, -33], [0, -SZ - 0.5], [0, -SZ - 6]], 'entrance', { to: 'school' })
  reg(ctx, 'entrances', { x: ent[0], y, z: ent[1], angle: F.ang(0, -1), kind: 'school', enterable: false })
  reg(ctx, 'schools', { number, x: F.x, z: F.z, y, angle: F.a, entrance: ent, site })
  reg(ctx, 'landmarks', { kind: 'school', name: `Школа № ${number}`, x: F.wx(0, -17.5), z: F.wz(0, -17.5), height: wingTop })
  addEmitter({ name: 'tv_muffled', pos: F.p((12.5 - EX / 2) * V, 1.3, -28.5), gain: 0.25, radius: 18, refDistance: 1.5 })
  return { wing, entry, gym, frame: F, entrance: ent, site }
}

export const SCHOOL_DIMS = { site: [84, 72], wing: [56, 13], entry: [14, 6], gym: [12, 24] }
