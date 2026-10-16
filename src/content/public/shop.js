// «ПРОДУКТЫ 24 ЧАСА» — one-storey grocery pavilion with a fully enterable interior: a 2008 mix
// of counter service (glass counters with sausage and cheese, scales, cash register, a cashier
// in a blue apron) and a few self-service fixtures (bread rack, gondola shelf, drink coolers,
// ice-cream chest). Tambour entrance with a heavy working door, fluorescent tubes (one
// flickering), warm light spilling onto the snow, and a lit light-box sign.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import {
  V, Frame, frameFor, put, sign, readable, interact, light, zone, flatten, paint, navPath, reg, seed01, seedInt,
  win, figureModel, lightBox, priceTag, handText, drawText, SIGN_FONT, PLAIN_FONT, HAND_FONT,
} from './lib.js'
import { addEmitter, addDoor } from './runtime.js'

// ---- geometry constants (voxels) ------------------------------------------------------
const X = 56, Y = 18, Z = 46
const PX = 28, PZ = 26 // pivot: centre of the 14 × 10 m building footprint (porch extends in front)
const FW = 6 // front wall outer layer z
const DOOR_X = 8 // door opening x .. x+3
/** voxel → local meters (relative to the pivot) */
const lx = vx => (vx - PX) * V
const lz = vz => (vz - PZ) * V
const ly = vy => vy * V

// goods palettes
const CANS = ['chrome', 'metal_gray', 'metal_red', 'metal_blue', 'metal_yellow', 'metal_green', 'chrome']
const BOXES = ['pub_cardboard', 'metal_yellow', 'metal_red', 'plastic_white', 'metal_blue', 'pub_cardboard', 'metal_green']
const BOTTLES = ['needles', 'metal_brown', 'glass_clear', 'metal_green', 'glass_clear', 'metal_brown']
const DAIRY = ['plastic_white', 'plastic_white', 'metal_blue', 'metal_yellow', 'plastic_white']

/** Fill one shelf row (along x or z) with runs of products. */
function goodsRow(m, rng, axis, a0, a1, y, fixed, palette, opts = {}) {
  let a = a0
  while (a <= a1) {
    const run = rng.int(1, opts.maxRun ?? 3)
    const mat = M(rng.pick(palette))
    const gap = rng.chance(opts.gap ?? 0.08)
    const tall = opts.tall && rng.chance(opts.tall)
    for (let k = 0; k < run && a <= a1; k++, a++) {
      if (gap) continue
      for (const f of fixed) {
        if (axis === 'x') { m.set(a, y, f, mat); if (tall) m.set(a, y + 1, f, mat) }
        else { m.set(f, y, a, mat); if (tall) m.set(f, y + 1, a, mat) }
      }
    }
  }
}

defineModel('pub_shop', () => {
  const m = new VoxelModel(X, Y, Z)
  m.setPivot(PX, 0, PZ)
  const rng = new RNG(4242)
  const paintM = M('paint_matte'), granite = M('granite'), tileW = M('wall_tile_white'), white = M('whitewash')
  const z0 = FW, z1 = Z - 1 // building footprint z range (inclusive)

  // ---- slab, walls, roof --------------------------------------------------------------
  m.fill(0, 0, z0, X, 1, Z - z0, granite)
  // interior floor: 300 mm tiles, two worn shades
  for (let z = z0 + 2; z <= z1 - 2; z++)
    for (let x = 2; x <= X - 3; x++) m.set(x, 0, z, (x + z) % 2 ? M('floor_tile') : M('marble_gray'))
  // outer shell (2 voxels thick): outer paint layer, inner tiled/whitewashed layer
  m.walls(0, 1, z0, X, 14, Z - z0, paintM, 1)
  m.walls(1, 1, z0 + 1, X - 2, 14, Z - z0 - 2, white, 1)
  for (let y = 1; y <= 5; y++) {
    m.fill(1, y, z0 + 1, 1, 1, Z - z0 - 2, tileW); m.fill(X - 2, y, z0 + 1, 1, 1, Z - z0 - 2, tileW)
    m.fill(1, y, z0 + 1, X - 2, 1, 1, tileW); m.fill(1, y, z1 - 1, X - 2, 1, 1, tileW)
  }
  // a thin blue tile stripe at 1.5 m (very typical)
  m.fill(1, 6, z0 + 1, 1, 1, Z - z0 - 2, M('tile_blue')); m.fill(X - 2, 6, z0 + 1, 1, 1, Z - z0 - 2, M('tile_blue'))
  m.fill(1, 6, z1 - 1, X - 2, 1, 1, M('tile_blue'))
  // granite plinth band outside
  for (let y = 1; y <= 2; y++) {
    m.fill(0, y, z0, X, 1, 1, granite); m.fill(0, y, z1, X, 1, 1, granite)
    m.fill(0, y, z0, 1, 1, Z - z0, granite); m.fill(X - 1, y, z0, 1, 1, Z - z0, granite)
  }
  // ceiling + roof
  m.fill(1, 13, z0 + 1, X - 2, 1, Z - z0 - 2, white)
  m.fill(0, 14, z0, X, 1, Z - z0, M('roof_tar'))
  m.fill(0, 13, z0, X, 1, 1, paintM); m.fill(0, 13, z1, X, 1, 1, paintM)
  m.fill(0, 13, z0, 1, 1, Z - z0, paintM); m.fill(X - 1, 13, z0, 1, 1, Z - z0, paintM)
  // parapet with galvanised flashing
  m.walls(0, 15, z0, X, 1, Z - z0, M('metal_gray'), 1)
  // roof clutter: ventilation box and an old air conditioner outdoor unit
  m.fill(40, 15, 36, 4, 2, 3, M('metal_gray'))
  m.fill(41, 17, 37, 2, 1, 1, M('metal_dark'))
  m.fill(10, 15, 38, 3, 1, 2, M('concrete'))

  // ---- front facade -------------------------------------------------------------------
  // shop windows: three big panes with white aluminium frames and a mullion
  for (const wx of [18, 30, 42]) {
    win(m, 'front', wx, 3, 11, 9, { d0: z0, depth: 1, glass: M('pub_glass_warm'), frame: M('plastic_white'), cols: 2, snow: 0.8, rng })
    for (let x = wx; x < wx + 11; x++) m.set(x, 2, z0, M('metal_gray')) // sill flashing
  }
  // the right side wall: one window near the front
  win(m, 'right', z0 + 6, 3, 8, 9, { depth: 1, glass: M('glass_clear'), frame: M('plastic_white'), cols: 1, snow: 0.8, rng })
  // door opening (the leaf is a separate dynamic model) with a brown steel frame
  m.clear(DOOR_X, 1, z0, 4, 9, 2)
  for (let y = 1; y <= 10; y++) { m.set(DOOR_X - 1, y, z0, M('metal_brown')); m.set(DOOR_X + 4, y, z0, M('metal_brown')) }
  m.fill(DOOR_X - 1, 10, z0, 6, 1, 1, M('metal_brown'))
  // light box sign band (sign texture is added by placeShop)
  m.fill(16, 11, z0 - 2, 36, 4, 2, M('plastic_white'))
  m.fill(16, 11, z0 - 2, 36, 1, 1, M('metal_gray'))
  m.fill(16, 14, z0 - 2, 36, 1, 1, M('metal_gray'))
  // brackets under the sign box ends
  m.set(17, 10, z0 - 1, M('metal_dark')); m.set(50, 10, z0 - 1, M('metal_dark'))
  // rust run-off under the sign box ends
  for (const x of [17, 50]) for (let y = 3; y <= 9; y++) if (rng.chance(0.6)) m.set(x, y, z0, M('metal_rust'))
  // entrance canopy (козырёк): cantilevered steel with diagonal braces
  m.fill(4, 11, 1, 12, 1, z0 - 1, M('metal_gray'))
  m.fill(4, 10, 1, 12, 1, 1, M('metal_dark'))
  for (const x of [4, 15]) { m.set(x, 10, 3, M('metal_dark')); m.set(x, 9, 4, M('metal_dark')); m.set(x, 8, 5, M('metal_dark')) }
  // porch: granite step with a ribbed steel plate in front of the door
  m.fill(3, 0, 1, 14, 1, z0 - 1, granite)
  m.fill(DOOR_X - 1, 0, 2, 6, 1, 4, M('metal_gray'))
  // handrail on the left side of the porch
  for (let z = 1; z <= 5; z++) m.set(3, 4, z, M('metal_dark'))
  m.set(3, 1, 1, M('metal_dark')); m.set(3, 2, 1, M('metal_dark')); m.set(3, 3, 1, M('metal_dark'))
  // small tambour window left of the door
  win(m, 'front', 4, 4, 3, 6, { d0: z0, depth: 1, glass: M('glass_clear'), frame: M('plastic_white') })

  // ---- back: service door, crates, AC unit --------------------------------------------
  m.clear(30, 1, z1 - 1, 4, 9, 2)
  m.fill(30, 1, z1, 4, 9, 1, M('metal_gray'))
  m.fill(30, 1, z1 - 1, 4, 9, 1, M('metal_gray'))
  m.set(31, 5, z1, M('metal_dark'))
  m.fill(29, 10, z1, 6, 1, 1, M('concrete_dark'))
  // wall-mounted AC unit on the back wall (2008)
  // (kept within the footprint: drawn flush into the outer layer)
  m.fill(44, 9, z1, 4, 3, 1, M('plastic_white'))
  m.fill(45, 10, z1, 2, 1, 1, M('metal_gray'))

  // ---- interior -----------------------------------------------------------------------
  const IZ0 = z0 + 2, IZ1 = z1 - 2 // interior z range (8..43)
  m.addInterior(2, 1, IZ0, X - 4, 12, IZ1 - IZ0 + 1)
  // tambour: thin partition walls, inner doorway opposite the outer door
  for (let y = 1; y <= 12; y++) {
    m.fill(4, y, IZ0, 1, 1, 6, y <= 5 ? tileW : white)
    m.fill(15, y, IZ0, 1, 1, 6, y <= 5 ? tileW : white)
    m.fill(4, y, IZ0 + 6, 12, 1, 1, y <= 5 ? tileW : white)
  }
  m.clear(DOOR_X, 1, IZ0 + 6, 4, 9, 1)
  // rubber mat in the tambour, wet cardboard sheets behind the inner doorway
  m.fill(5, 0, IZ0, 10, 1, 6, M('rubber'))
  m.fill(DOOR_X - 1, 0, IZ0 + 7, 6, 1, 3, M('pub_cardboard'))
  m.set(DOOR_X + 5, 0, IZ0 + 8, M('pub_cardboard'))
  // air curtain unit above the inner doorway (hall side)
  m.fill(DOOR_X - 1, 10, IZ0 + 7, 6, 2, 1, M('plastic_white'))
  m.fill(DOOR_X, 10, IZ0 + 7, 4, 1, 1, M('metal_gray'))
  // wet muddy tracks from the door to the counter
  for (let k = 0; k < 70; k++) {
    const t = rng.next()
    const x = Math.round(DOOR_X + 2 + (27 - DOOR_X - 2) * t + rng.float(-2.5, 2.5))
    const z = Math.round(IZ0 + 10 + (33 - IZ0 - 10) * t + rng.float(-2, 2))
    if (m.get(x, 0, z) !== 0 && x > 1 && x < X - 2) m.set(x, 0, z, M('slush'))
  }

  // payment terminal (stand-alone kiosk), screen facing the hall
  m.fill(17, 1, IZ0, 2, 7, 2, M('metal_dark'))
  m.fill(17, 1, IZ0, 2, 2, 2, M('metal_gray'))
  m.fill(17, 5, IZ0 + 1, 2, 2, 1, M('pub_screen'))
  m.set(18, 3, IZ0 + 1, M('taillight')) // bill acceptor
  m.fill(17, 7, IZ0, 2, 1, 2, M('metal_yellow')) // brand header

  // ice-cream chest freezer under the right window
  m.fill(44, 1, IZ0, 7, 2, 3, M('plastic_white'))
  m.walls(44, 3, IZ0, 7, 1, 3, M('plastic_white'), 1)
  goodsRow(m, rng, 'x', 45, 49, 3, [IZ0 + 1], ['metal_blue', 'plastic_white', 'metal_red', 'metal_yellow'], { gap: 0.05 })
  m.fill(44, 4, IZ0, 7, 1, 3, M('glass_clear'))
  m.fill(44, 1, IZ0 + 2, 7, 1, 1, M('metal_blue'))

  // bread rack against the left wall
  for (let y = 1; y <= 8; y++) { m.set(2, y, 17, M('wood')); m.set(2, y, 27, M('wood')); m.set(4, y, 17, M('wood')); m.set(4, y, 27, M('wood')) }
  for (const y of [1, 3, 5, 7]) m.fill(2, y, 17, 3, 1, 11, M('wood'))
  m.fill(2, 8, 17, 3, 1, 11, M('wood'))
  for (const y of [2, 4, 6]) {
    for (let z = 18; z <= 26; z++) {
      if (rng.chance(0.18)) continue
      const dark = y === 2 ? rng.chance(0.75) : y === 4 ? rng.chance(0.3) : rng.chance(0.1)
      m.set(3, y, z, M(dark ? 'pub_bread_dark' : 'pub_bread'))
      if (rng.chance(0.5)) m.set(2, y, z, M(dark ? 'pub_bread_dark' : 'pub_bread'))
    }
  }
  // drink coolers (3) against the left wall: glass doors facing the hall
  const coolerBody = ['metal_red', 'plastic_white', 'metal_blue']
  for (let i = 0; i < 3; i++) {
    const zc = 29 + i * 4
    m.fill(2, 1, zc, 3, 8, 4, M(coolerBody[i]))
    m.fill(2, 2, zc + 1, 2, 6, 2, 0)
    for (const y of [2, 4, 6]) goodsRow(m, rng, 'z', zc + 1, zc + 2, y, [2, 3], i === 1 ? ['metal_brown', 'needles', 'metal_brown'] : BOTTLES, { tall: 0.7, gap: 0.05, maxRun: 2 })
    m.fill(2, 7, zc + 1, 2, 1, 2, M('fluorescent'))
    m.fill(4, 2, zc + 1, 1, 6, 2, M('glass_clear'))
    m.fill(4, 8, zc, 1, 1, 4, M(coolerBody[i]))
  }
  // promo stack of mineral water six-packs in the dead-end corner (x 6..10, z 36..41)
  for (let y = 1; y <= 3; y++) for (let z = 37; z <= 40; z++) for (let x = 6; x <= 9; x++)
    if (y < 3 || rng.chance(0.6)) m.set(x, y, z, M(y === 1 ? 'wood' : 'glass_clear'))
  // staff partition at x = 13 with a closed door to the back
  for (let y = 1; y <= 12; y++) m.fill(13, y, 34, 1, 1, IZ1 - 34 + 1, y <= 5 ? tileW : white)
  m.fill(13, 1, 38, 1, 9, 3, M('wood_painted_blue'))
  m.set(13, 5, 38, M('metal_gray'))

  // gondola shelf (double-sided) in the middle of the hall: boards with lips, goods recessed
  m.fill(20, 1, 21, 17, 1, 5, M('metal_gray'))
  m.fill(20, 1, 23, 17, 7, 1, M('metal_gray'))
  for (const y of [3, 5]) m.fill(20, y, 21, 17, 1, 5, M('metal_gray'))
  for (const y of [2, 4, 6]) {
    goodsRow(m, rng, 'x', 21, 35, y, [22], y === 2 ? BOXES : y === 4 ? CANS : BOXES, { gap: 0.12 })
    goodsRow(m, rng, 'x', 21, 35, y, [24], y === 2 ? CANS : y === 4 ? BOXES : CANS, { gap: 0.12 })
  }
  for (let y = 1; y <= 7; y++) { m.fill(20, y, 21, 1, 1, 5, M('metal_gray')); m.fill(36, y, 21, 1, 1, 5, M('metal_gray')) }
  m.fill(20, 7, 21, 17, 1, 5, M('metal_gray'))
  goodsRow(m, rng, 'x', 22, 34, 8, [22, 23, 24], ['pub_cardboard', 'pub_cardboard', 'plastic_white'], { gap: 0.45 })
  m.fill(20, 5, 21, 1, 2, 5, M('metal_red')) // end-cap promo panels
  m.fill(36, 5, 21, 1, 2, 5, M('metal_red'))

  // ---- counters -----------------------------------------------------------------------
  // back counter x 14..45, z 34..37; right counter x 46..49, z 20..37
  const counter = (xa, xb, za, zb, glassFace, goods, kind) => {
    m.fill(xa, 1, za, xb - xa + 1, 2, zb - za + 1, M('plastic_white'))
    // kick plate
    if (glassFace === 'z') m.fill(xa, 1, za, xb - xa + 1, 1, 1, M('metal_gray'))
    else m.fill(xa, 1, za, 1, 1, zb - za + 1, M('metal_gray'))
    if (kind === 'desk') {
      m.fill(xa, 3, za, xb - xa + 1, 2, zb - za + 1, M('wood'))
      return
    }
    // display: goods on the cabinet top, glass front + glass top, open staff side
    if (glassFace === 'z') {
      for (const y of [3, 4, 5]) m.fill(xa, y, za, xb - xa + 1, 1, 1, M('glass_clear'))
      m.fill(xa, 5, zb, xb - xa + 1, 1, 1, M('wood'))
      m.fill(xa, 3, za + 1, xb - xa + 1, 1, zb - za, M('metal_gray'))
      goodsRow(m, rng, 'x', xa, xb, 3, [za + 1, za + 2], goods, { gap: 0.15 })
      for (let x = xa; x <= xb; x += 6) for (let y = 3; y <= 5; y++) m.set(x, y, za, M('metal_gray'))
    } else {
      for (const y of [3, 4, 5]) m.fill(xa, y, za, 1, 1, zb - za + 1, M('glass_clear'))
      m.fill(xb, 5, za, 1, 1, zb - za + 1, M('wood'))
      m.fill(xa + 1, 3, za, xb - xa, 1, zb - za + 1, M('metal_gray'))
      goodsRow(m, rng, 'z', za, zb, 3, [xa + 1, xa + 2], goods, { gap: 0.15, tall: 0.5 })
      for (let z = za; z <= zb; z += 6) for (let y = 3; y <= 5; y++) m.set(xa, y, z, M('metal_gray'))
    }
  }
  counter(14, 24, 34, 37, 'z', ['pub_sausage', 'pub_sausage', 'pub_cheese', 'pub_sausage', 'fabric_red'])
  counter(25, 30, 34, 37, 'z', null, 'desk')
  counter(31, 45, 34, 37, 'z', DAIRY.concat(['pub_cheese']))
  counter(46, 49, 20, 37, 'x', ['glass_clear', 'metal_brown', 'needles', 'metal_red', 'metal_blue', 'plastic_white'])
  // cash desk: register (dark body, green display), electronic scales with red LED, money tray
  m.fill(26, 5, 35, 3, 1, 2, M('plastic_dark'))
  m.fill(26, 6, 36, 3, 1, 1, M('plastic_dark'))
  m.set(27, 6, 35, M('pub_screen'))
  m.fill(29, 5, 35, 2, 1, 2, M('plastic_white'))
  m.set(30, 6, 35, M('taillight'))
  m.set(25, 5, 34, M('plastic_white')) // tray «на тарелочку»
  // goods on top of the glass: a jar of sweets, a calculator box
  m.set(22, 6, 35, M('glass_clear')); m.set(40, 6, 36, M('metal_yellow'))

  // back shelves (z 42..43) with a gap at the service door, and right-wall shelves (x 53)
  const shelves = (xa, xb) => {
    for (let y = 1; y <= 10; y++) { m.set(xa, y, 42, M('wood_dark')); m.set(xb, y, 42, M('wood_dark')) }
    for (const y of [1, 3, 5, 7, 9]) m.fill(xa, y, 42, xb - xa + 1, 1, 2, M('wood_dark'))
    for (const y of [2, 4, 6, 8]) {
      const pal = y === 2 ? BOXES : y === 4 ? CANS : y === 6 ? BOTTLES : ['glass_clear', 'glass_clear', 'needles', 'metal_brown']
      goodsRow(m, rng, 'x', xa + 1, xb - 1, y, [42], pal, { tall: y >= 6 ? 0.6 : 0, gap: 0.12 })
    }
  }
  shelves(14, 29)
  shelves(34, 52)
  for (let y = 1; y <= 10; y++) m.fill(53, y, 20, 1, 1, 22, M('wood_dark'))
  for (const y of [2, 4, 6, 8]) {
    m.fill(52, y - 1, 20, 1, 1, 22, M('wood_dark'))
    goodsRow(m, rng, 'z', 20, 41, y, [52], y === 8 ? BOXES : y === 6 ? ['glass_clear', 'needles', 'glass_clear'] : CANS, { tall: 0.4, gap: 0.15 })
  }
  // wall clock above the back shelves and a fire extinguisher by the staff door
  m.set(32, 11, 43, M('plastic_white'))
  m.set(14, 2, 33, M('metal_red')); m.set(14, 3, 33, M('metal_red'))

  // fluorescent fixtures (the flickering one at x 34..39, z 28 is a separate model)
  const fixture = (xa, z) => {
    m.fill(xa, 12, z, 6, 1, 2, M('plastic_white'))
    m.fill(xa + 1, 12, z, 4, 1, 1, M('fluorescent'))
  }
  for (const z of [12, 20]) for (const x of [6, 20, 34]) fixture(x, z)
  fixture(6, 28); fixture(20, 28)
  fixture(18, 39); fixture(34, 39)

  // ---- snow ---------------------------------------------------------------------------
  m.addSnow({ mat: M('snow'), depth: 1, seed: 11 })
  // a second, drifted layer on the roof (smooth low-frequency drifts, deeper by the parapet)
  for (let z = z0 + 1; z < z1; z++) for (let x = 1; x < X - 1; x++) {
    if (m.get(x, 15, z) !== M('snow')) continue
    const edge = Math.min(x - 1, X - 2 - x, z - z0 - 1, z1 - 1 - z)
    const n = Math.sin(x * 0.21 + z * 0.07) + Math.sin(z * 0.17 - x * 0.05 + 1.3)
    if (n > 0.6 || edge < 2) m.set(x, 16, z, M('snow'))
  }
  return m
}, { occludesSnow: true, lods: [1, 2, 4], lodDistances: [60, 160] })

// heavy steel shop door with a glass panel; pivot = hinge (left edge, outer face)
defineModel('pub_shop_door', () => {
  const m = new VoxelModel(4, 9, 1)
  m.fill(0, 0, 0, 4, 9, 1, M('metal_brown'))
  m.fill(1, 4, 0, 2, 4, 1, M('glass_clear'))
  m.set(3, 4, 0, M('chrome'))
  m.fill(0, 0, 0, 4, 1, 1, M('metal_dark'))
  m.setPivot(0, 0, 0)
  return m
}, { dynamic: true, contact: false, lods: [1] })

// ceiling fluorescent fixture (separate so it can flicker on its own)
defineModel('pub_tube_fixture', () => {
  const m = new VoxelModel(6, 1, 2)
  m.fill(0, 0, 0, 6, 1, 2, M('plastic_white'))
  m.fill(1, 0, 0, 4, 1, 1, M('fluorescent'))
  return m
}, { contact: false, lods: [1], maxDistance: 120 })

// wall-mounted «tablet» bulb fixture (НПП): pivot at the wall face (back), light centre ~0.12 m out
defineModel('pub_lamp_wall_bulb', () => {
  const m = new VoxelModel(1, 1, 2)
  m.set(0, 0, 1, M('metal_dark'))
  m.set(0, 0, 0, M('lamp_bulb'))
  m.setPivot(0.5, 0, 2)
  return m
}, { contact: false, lods: [1], maxDistance: 200 })

// cashier: a heavy-set woman in a white blouse and a blue apron, dyed burgundy hair in a bun
defineModel('pub_cashier', () => figureModel({
  top: M('plastic_white'), bottom: M('metal_dark'), apron: M('pub_fabric_blue'), hair: M('fabric_red'), bun: true, armsFront: true,
}), { contact: false, lods: [1], maxDistance: 120 })

// ---------------------------------------------------------------------------------------
const PRICE_DEPTS = {
  gastro: {
    title: 'Гастрономия',
    ru: 'Колбаса «Докторская» вар. в/с — 289-90 за 1 кг\nСервелат «Финский» — 389-00 за 1 кг\nСосиски «Молочные» — 210-00 за 1 кг\nСыр «Российский» — 199-00 за 1 кг\nСыр «Пошехонский» — 215-50 за 1 кг\nСельдь с/с — 89-00 за 1 кг',
    en: 'Deli\n"Doktorskaya" boiled sausage, top grade — 289.90 per kg\n"Finnish" servelat — 389.00 per kg\n"Milk" frankfurters — 210.00 per kg\n"Russian" cheese — 199.00 per kg\n"Poshekhonsky" cheese — 215.50 per kg\nSalted herring — 89.00 per kg',
  },
  dairy: {
    title: 'Молочные продукты',
    ru: 'Молоко 3,2% 1 л — 34-50\nКефир 2,5% 1 л — 36-00\nМасло сливочное 200 г — 52-00\nТворог 9% 250 г — 41-00\nЯйцо С1, 10 шт. — 44-90\nПельмени «Сибирские» 1 кг — 129-00',
    en: 'Dairy\nMilk 3.2%, 1 L — 34.50\nKefir 2.5%, 1 L — 36.00\nButter, 200 g — 52.00\nCottage cheese 9%, 250 g — 41.00\nEggs C1, 10 pcs — 44.90\n"Siberian" pelmeni, 1 kg — 129.00',
  },
  wine: {
    title: 'Вино-водка · Табак',
    ru: 'Водка «Столичная гора» 0,5 л — 189-00\nВодка «Берёзовый лист» 0,5 л — 142-00\nПиво «Клёвское» 0,5 л — 31-50\nПиво «Здоровяк» 1,5 л — 72-00\nСигареты «Ява золотая» — 28-00\n\nПродажа алкоголя и табака лицам до 18 лет запрещена.',
    en: 'Wine & vodka · Tobacco\n"Capital Mountain" vodka 0.5 L — 189.00\n"Birch Leaf" vodka 0.5 L — 142.00\n"Klyovskoye" beer 0.5 L — 31.50\n"Big Guy" beer 1.5 L — 72.00\n"Java Gold" cigarettes — 28.00\n\nSale of alcohol and tobacco to persons under 18 is prohibited.',
  },
  grocery: {
    title: 'Бакалея',
    ru: 'Сахар-песок 1 кг — 29-90\nГречка ядрица 900 г — 39-00\nМакароны «Рожки» 450 г — 18-50\nТушёнка говяжья 325 г — 64-00\nСгущёнка 380 г — 31-00\nЛапша б/п — 14-00\nЧай «Слон и чашка» 100 г — 36-00',
    en: 'Dry goods\nSugar, 1 kg — 29.90\nBuckwheat, 900 g — 39.00\nMacaroni "Horns", 450 g — 18.50\nStewed beef, 325 g tin — 64.00\nCondensed milk, 380 g — 31.00\nInstant noodles — 14.00\n"Elephant & Cup" tea, 100 g — 36.00',
  },
}

const CASHIER_LINES = [
  { ru: 'Что вам?', en: 'What would you like?' },
  { ru: 'Мелочь посмотрите.', en: 'Check if you have small change.' },
  { ru: 'Девушка, ну что брать будем?', en: 'Well, what are we buying?' },
  { ru: 'Хлеб привезли в шесть, свежий.', en: 'Bread came at six, it\'s fresh.' },
]

/**
 * Place the «ПРОДУКТЫ 24 ЧАСА» pavilion. Footprint 14 × 10 m centred on (x, z); the porch and
 * canopy extend 1.5 m further in front (local −Z). rot 0 → entrance faces north.
 * opts: { x, z, rot | angle, y, seed, tint (facade paint, default faded beige), name, flatten=true }
 * Returns { placement, door, cashier, frame, interior: {min,max}, entrance: [x,z] }
 */
export function placeShop(ctx, o) {
  const F = frameFor(ctx, o)
  const rng = new RNG(seedInt(o.seed, 31))
  const tints = [0xb7ab92, 0xa8b0a2, 0x9fa9ae, 0xb9a99a, 0xa9a48f]
  const tint = o.tint ?? tints[rng.int(0, tints.length - 1)]
  if (o.flatten !== false) {
    flatten(ctx, F, -7.25, -6.75, 7.25, 5.25, F.y, M('snow_packed'))
    flatten(ctx, F, lx(DOOR_X - 3), lz(-2), lx(DOOR_X + 7), lz(1), F.y, M('snow_packed'))
    paint(ctx, F, lx(DOOR_X - 1), lz(-4), lx(DOOR_X + 5), lz(1), M('snow_dirty'))
  }
  const shop = put(ctx, F, 'pub_shop', 0, 0, { tint, seed: seed01(o.seed, 3), tag: 'shop', userData: { kind: 'shop' } })

  // ---- door ---------------------------------------------------------------------------
  const doorP = put(ctx, F, 'pub_shop_door', lx(DOOR_X), lz(FW), { ly: V, dynamic: true, tag: 'entrance', userData: { kind: 'shop_door' } })
  const center = F.p(lx(DOOR_X + 2), 1.3, lz(FW + 0.5))
  const door = addDoor(ctx, {
    placement: doorP, closed: F.a, swing: 1, open: 1.5, width: 1, center,
    size: F.size(1.1, 2.3, 0.7), autoClose: 7,
    sounds: { open: 'door_metal_open', close: 'door_metal_slam', chime: 'shop_bell' },
  })

  // ---- cashier ------------------------------------------------------------------------
  const cashier = put(ctx, F, 'pub_cashier', lx(27.5), lz(40), { ly: V, indoor: true, tag: 'person', userData: { kind: 'cashier', role: 'cashier' } })

  // ---- flickering tube ----------------------------------------------------------------
  const tube = put(ctx, F, 'pub_tube_fixture', lx(37), lz(29), { ly: 12 * V, indoor: true })

  // ---- lights -------------------------------------------------------------------------
  const tubeCol = 0xf4f0dc
  const ceil = 2.95
  for (const [vx, vz] of [[14, 17], [40, 15], [15, 31]]) {
    light(ctx, F, lx(vx), ceil, lz(vz), { color: tubeCol, intensity: 2.4, range: 10, domain: 'indoor', halo: false, tag: 'shop_light' })
  }
  light(ctx, F, lx(37), ceil, lz(29), { color: tubeCol, intensity: 2.2, range: 9, domain: 'indoor', flicker: 'buzz', placement: tube, halo: false, tag: 'shop_light' })
  light(ctx, F, lx(30), ceil, lz(39), { color: tubeCol, intensity: 2.0, range: 8, domain: 'indoor', halo: false, tag: 'shop_light' })
  light(ctx, F, lx(10), 2.6, lz(10.5), { color: 0xffe2b0, intensity: 1.0, range: 4.5, domain: 'indoor', halo: false })
  // warm light spilling from the windows onto the snow
  light(ctx, F, lx(36), 2.4, lz(FW - 1.5), { type: 'spot', dir: [0, -0.62, -1], cone: 72, inner: 30, color: 0xffd9a6, intensity: 16, range: 13, schedule: 'night', halo: false, scatter: 0.5, tag: 'shop_spill' })
  // entrance bulb under the canopy
  const lampP = put(ctx, F, 'pub_lamp_wall_bulb', lx(DOOR_X + 2), lz(FW), { ly: 10 * V - 0.05, tag: 'lamp' })
  light(ctx, F, lx(DOOR_X + 2), 2.45, lz(FW - 0.5), { type: 'spot', dir: [0, -1, -0.25], cone: 75, inner: 35, color: 0xffc47e, intensity: 8, range: 9, schedule: 'night', placement: lampP, haloSize: 0.6, tag: 'lamp' })

  // ---- signs --------------------------------------------------------------------------
  const signName = o.name ?? 'ПРОДУКТЫ'
  sign(ctx, F, lx(34), ly(13), lz(FW - 2), 0, -1, {
    w: 8.6, h: 0.82, ppm: 48, emissive: 1.25, schedule: 'always',
    draw: lightBox({ lines: [`${signName}  24 ЧАСА`], color: '#b5221d', bg: '#f1efe4', vignette: 0.3 }),
  })
  // opening hours plate by the door
  sign(ctx, F, lx(15), 1.55, lz(FW), 0, -1, {
    w: 0.42, h: 0.3, ppm: 140, aged: 0.3, seed: 3,
    draw: (c, W, H) => drawText(c, W, H, { lines: ['МАГАЗИН «ПРОДУКТЫ»', 'Режим работы:', 'КРУГЛОСУТОЧНО', 'без перерыва', 'и выходных'], bg: '#e9e6da', color: '#1c2b55', font: PLAIN_FONT, weight: 'bold', border: '#1c2b55' }),
  })
  readable(ctx, F, lx(15), 1.55, lz(FW - 0.1), [0.5, 0.4, 0.2], {
    ru: 'МАГАЗИН «ПРОДУКТЫ»\nРежим работы: КРУГЛОСУТОЧНО\nбез перерыва и выходных', en: 'GROCERY SHOP\nOpening hours: 24 HOURS\nno breaks, no days off', style: 'sign',
  })
  // door stickers «ОТ СЕБЯ» / «К СЕБЕ» on the frame
  sign(ctx, F, lx(DOOR_X + 4.5), 1.3, lz(FW), 0, -1, { w: 0.2, h: 0.08, ppm: 300, lines: ['К СЕБЕ'], bg: '#d8d4c4', color: '#222', font: PLAIN_FONT })
  sign(ctx, F, lx(DOOR_X + 2), 1.3, lz(FW + 2), 0, 1, { w: 0.24, h: 0.08, ppm: 300, lines: ['ОТ СЕБЯ'], bg: '#d8d4c4', color: '#222', font: PLAIN_FONT, indoor: true })
  // posters inside the windows, facing out
  const posters = [
    { x: 21, y: 1.75, w: 1.0, h: 1.3, draw: (c, W, H) => { drawText(c, W, H, { lines: ['СВЕЖИЙ', 'ХЛЕБ', 'КАЖДОЕ', 'УТРО'], bg: '#e8dcb0', color: '#7a3a12' }) } },
    { x: 33.5, y: 1.4, w: 0.9, h: 0.6, draw: (c, W, H) => { drawText(c, W, H, { lines: ['АКЦИЯ!', 'Пельмени', '−15%'], bg: '#e6c63c', color: '#a01414' }) } },
    { x: 48, y: 1.55, w: 1.1, h: 0.8, draw: (c, W, H) => { drawText(c, W, H, { lines: ['ПИВО', '«КЛЁВСКОЕ»', 'Чрезмерное употребление пива', 'вредит вашему здоровью'], bg: '#2f4a2a', color: '#e8d9a0', lineGap: 0.1 }) } },
  ]
  for (const p of posters) {
    sign(ctx, F, lx(p.x), p.y, lz(FW + 2) + 0.03, 0, -1, { w: p.w, h: p.h, ppm: 80, draw: p.draw, aged: 0.25, seed: p.x, indoor: true })
  }
  readable(ctx, F, lx(33.5), 1.35, lz(FW), [1.0, 0.8, 0.3], { ru: 'АКЦИЯ! Пельмени «Сибирские» −15%', en: 'PROMOTION! "Siberian" pelmeni −15%', style: 'notice' })

  // inside: department signs above the counters
  const dept = (vx, vz, nx, nz, text, w = 2.4, h = 3.0) => sign(ctx, F, lx(vx), h, lz(vz), nx, nz, {
    w, h: 0.32, ppm: 90, indoor: true, lines: [text], bg: '#7a1f1c', color: '#efe6cf', font: SIGN_FONT,
  })
  dept(19.5, 44, 0, -1, 'ГАСТРОНОМИЯ')
  dept(38, 44, 0, -1, 'МОЛОЧНЫЕ ПРОДУКТЫ', 3.2)
  dept(54, 30, -1, 0, 'ВИНО-ВОДКА · ТАБАК', 3.2)
  dept(28.5, 21, 0, -1, 'БАКАЛЕЯ', 1.8, 2.6)
  // price-tag rows along the counter glass (decorative) + readable lists
  const tagRow = (xa, xb, vz, items) => {
    const n = items.length
    for (let i = 0; i < n; i++) {
      const vx = xa + (xb - xa) * (i + 0.5) / n
      sign(ctx, F, lx(vx), 0.66, lz(vz), 0, -1, { w: 0.26, h: 0.17, ppm: 220, indoor: true, draw: priceTag(items[i]) })
    }
  }
  tagRow(14, 25, 34, [
    { name: 'Колбаса «Докторская»', price: '289-90', unit: 'за 1 кг' },
    { name: 'Сервелат «Финский»', price: '389-00', unit: 'за 1 кг' },
    { name: 'Сыр «Российский»', price: '199-00', unit: 'за 1 кг', promo: true },
    { name: 'Сосиски «Молочные»', price: '210-00', unit: 'за 1 кг' },
  ])
  tagRow(31, 46, 34, [
    { name: 'Молоко 3,2% 1 л', price: '34-50' }, { name: 'Кефир 2,5% 1 л', price: '36-00' },
    { name: 'Масло сливочное', price: '52-00' }, { name: 'Творог 9%', price: '41-00' }, { name: 'Яйцо С1 10 шт', price: '44-90' },
  ])
  readable(ctx, F, lx(19.5), 0.9, lz(33.6), [2.8, 1.0, 0.5], { ...PRICE_DEPTS.gastro, style: 'ticket' }, { prompt: { ru: 'Смотреть ценники', en: 'Look at the price tags' } })
  readable(ctx, F, lx(38.5), 0.9, lz(33.6), [3.8, 1.0, 0.5], { ...PRICE_DEPTS.dairy, style: 'ticket' }, { prompt: { ru: 'Смотреть ценники', en: 'Look at the price tags' } })
  readable(ctx, F, lx(45.6), 0.9, lz(28.5), [0.5, 1.0, 4.2], { ...PRICE_DEPTS.wine, style: 'ticket' }, { prompt: { ru: 'Смотреть ценники', en: 'Look at the price tags' } })
  readable(ctx, F, lx(28.5), 0.9, lz(20.6), [4.2, 1.2, 0.4], { ...PRICE_DEPTS.grocery, style: 'ticket' }, { prompt: { ru: 'Смотреть ценники', en: 'Look at the price tags' } })
  readable(ctx, F, lx(28.5), 0.9, lz(26.4), [4.2, 1.2, 0.4], { ...PRICE_DEPTS.grocery, style: 'ticket' }, { prompt: { ru: 'Смотреть ценники', en: 'Look at the price tags' } })
  // money tray note
  sign(ctx, F, lx(25.5), 1.42, lz(34) - 0.01, 0, -1, { w: 0.3, h: 0.12, ppm: 250, indoor: true, draw: (c, W, H) => handText(c, W, H, { lines: ['Деньги кладите', 'на тарелочку'], bg: '#ece8da', color: '#223', seed: 5 }) })
  readable(ctx, F, lx(25.6), 1.35, lz(33.8), [0.4, 0.3, 0.3], { ru: 'Деньги кладите на тарелочку', en: 'Please put the money on the tray', style: 'hand' })

  // the hand-written bread notice above the rack
  sign(ctx, F, lx(2), 2.55, lz(22.5), 1, 0, {
    w: 0.62, h: 0.42, ppm: 120, indoor: true, aged: 0.35, seed: 18,
    draw: (c, W, H) => handText(c, W, H, { lines: ['Хлеб — 18 руб.', 'Батон — 16 руб.', 'свежий!'], bg: '#c9b58c', color: ['#1d2a6a', '#1d2a6a', '#7a1414'], seed: 18 }),
  })
  readable(ctx, F, lx(2.3), 2.55, lz(22.5), [0.3, 0.5, 0.7], {
    ru: 'Хлеб — 18 руб.\nБатон — 16 руб.\nсвежий!', en: 'Bread — 18 rub.\nWhite loaf — 16 rub.\nfresh!', style: 'hand',
  })
  // cooler brand headers
  const brands = [['КОЛОКОЛЬЧИК', '#a51c1c', '#f0e6d0'], ['ПИВО', '#e8e4d8', '#2a3a6a'], ['ЖИВАЯ ВОДА', '#2a4a8a', '#e8eef0']]
  for (let i = 0; i < 3; i++) {
    sign(ctx, F, lx(5), ly(8.5), lz(31 + i * 4), 1, 0, { w: 0.95, h: 0.2, ppm: 120, indoor: true, lines: [brands[i][0]], bg: brands[i][1], color: brands[i][2], emissive: 0.3 })
  }
  // «Уголок покупателя» board + complaints book on the tambour wall (hall side)
  sign(ctx, F, lx(16), 1.75, lz(11), 1, 0, {
    w: 1.0, h: 0.75, ppm: 110, indoor: true, aged: 0.2, seed: 41,
    draw: (c, W, H) => {
      c.fillStyle = '#6a4a30'; c.fillRect(0, 0, W, H)
      c.fillStyle = '#e8e2cf'; c.fillRect(W * 0.05, H * 0.2, W * 0.9, H * 0.75)
      drawText(c, W, H * 0.2, { lines: ['УГОЛОК ПОКУПАТЕЛЯ'], color: '#e8d9a0', font: SIGN_FONT })
      c.fillStyle = '#333'
      for (let k = 0; k < 4; k++) { c.fillRect(W * (0.08 + k * 0.22), H * 0.28, W * 0.18, H * 0.3) }
      c.fillStyle = '#7a1f1c'; c.fillRect(W * 0.3, H * 0.66, W * 0.4, H * 0.25)
      drawText(c, W * 1, H * 0.26, { lines: [''], color: '#000' })
    },
  })
  readable(ctx, F, lx(16.2), 1.75, lz(11), [0.3, 0.8, 1.1], {
    title: 'Уголок покупателя',
    ru: 'Лицензия на розничную продажу алкогольной продукции № 1408\nЗакон «О защите прав потребителей»\nТелефоны: 01, 02, 03\nКнига жалоб и предложений выдаётся по первому требованию.\n\nВ книге последняя запись: «Продавщица нахамила. 14.11.08» и ниже другим почерком: «Спасибо за вежливое обслуживание!»',
    en: 'Customer\'s corner\nLicence for retail sale of alcohol No. 1408\nConsumer Rights Protection Act\nPhones: 01, 02, 03\nThe complaints and suggestions book is given on first request.\n\nThe last entry in the book: "The saleswoman was rude. 14.11.08" and below, in another hand: "Thank you for the polite service!"',
    style: 'paper',
  }, { prompt: { ru: 'Читать «Уголок покупателя»', en: 'Read the customer\'s corner' } })
  // payment terminal
  interact(ctx, F, lx(18), 1.5, lz(9), [0.7, 1.0, 0.7], {
    prompt: { ru: 'Терминал оплаты', en: 'Payment terminal' }, tag: 'terminal',
    onUse(game) {
      game.audio?.play?.('phone_key', { gain: 0.3 })
      game.ui.showNote({
        style: 'screen', title: 'МОМЕНТ-ПЛАТЁЖ',
        ru: 'Выберите услугу:\n▸ Сотовая связь\n▸ Интернет\n▸ Коммерческое ТВ\n▸ Коммунальные платежи\n▸ Погашение кредитов\n\nКомиссия 0%*\nВНИМАНИЕ! Терминал сдачу не выдаёт',
        en: 'Choose a service:\n▸ Mobile\n▸ Internet\n▸ Commercial TV\n▸ Utility bills\n▸ Loan repayments\n\n0% commission*\nATTENTION! The terminal gives no change',
        footer: '*кроме ряда операторов',
      })
    },
  })

  // ---- buying bread -------------------------------------------------------------------
  const PRICES = { hleb: 18, baton: 16 }
  const buy = (kind) => (game) => {
    const s = game.state
    s.boughtBread = true
    s.bread = s.bread || []
    s.bread.push(kind)
    s.breadSpent = (s.breadSpent || 0) + PRICES[kind]
    game.audio?.play?.('scale_beep', { pos: F.p(lx(30), 1.5, lz(35)), gain: 0.25 })
    const first = s.bread.length === 1
    game.ui.say(first ? { ru: '— Пакет нужен?', en: '— Need a bag?' } : { ru: '— Ещё что-нибудь?', en: '— Anything else?' }, 4)
    game.audio?.play?.('cashier_voice', { pos: F.p(lx(27.5), 1.55, lz(40)), gain: 0.6 })
    game.events?.emit?.('bought', { item: kind, where: 'shop' })
  }
  const bought = k => (ctx.game.state.bread || []).includes(k)
  interact(ctx, F, lx(3.6), 1.15, lz(19.5), [0.9, 1.6, 1.2], {
    tag: 'buy', reach: 2.4,
    prompt: () => bought('hleb') ? { ru: 'Купить ещё хлеба — 18 руб.', en: 'Buy another bread — 18 rub.' } : { ru: 'Купить хлеб — 18 руб.', en: 'Buy bread — 18 rub.' },
    onUse: buy('hleb'),
  })
  interact(ctx, F, lx(3.6), 1.15, lz(24.5), [0.9, 1.6, 1.2], {
    tag: 'buy', reach: 2.4,
    prompt: () => bought('baton') ? { ru: 'Купить ещё батон — 16 руб.', en: 'Buy another white loaf — 16 rub.' } : { ru: 'Купить батон — 16 руб.', en: 'Buy a white loaf (baton) — 16 rub.' },
    onUse: buy('baton'),
  })
  // talk to the cashier
  let line = 0
  const NUM = { 16: 'шестнадцать', 18: 'восемнадцать', 32: 'тридцать два', 34: 'тридцать четыре', 36: 'тридцать шесть' }
  interact(ctx, F, lx(27.5), 1.3, lz(36), [1.8, 1.0, 1.2], {
    tag: 'cashier', reach: 2.8,
    prompt: { ru: 'Обратиться к продавщице', en: 'Speak to the cashier' },
    onUse(game) {
      const s = game.state
      let l
      if (s.boughtBread && s._cashierPaid !== s.breadSpent) {
        s._cashierPaid = s.breadSpent
        const sum = s.breadSpent
        l = { ru: `С вас ${NUM[sum] ?? sum + ' руб.'}. Пакет — два рубля.`, en: `That's ${sum} roubles. A bag is two roubles.` }
      } else l = CASHIER_LINES[line++ % CASHIER_LINES.length]
      game.ui.say({ ru: '— ' + l.ru, en: '— ' + l.en }, 4)
      game.audio?.play?.('cashier_voice', { pos: F.p(lx(27.5), 1.55, lz(40)), gain: 0.6 })
    },
  })

  // ---- zone, sound, navigation, registry ----------------------------------------------
  const inner = zone(ctx, F, lx(1), 0.1, lz(FW + 1), lx(X - 1), 3.3, lz(Z - 1), {
    name: 'shop', type: 'shop', indoor: true, reverb: 'shop', wind: 0.08, traffic: 0.15, snow: false, priority: 2,
    data: { shop: 'produkty' },
  })
  addEmitter({ name: 'fridge_hum', pos: F.p(lx(4), 1.2, lz(35)), gain: 0.4, radius: 24, refDistance: 1.5 })
  addEmitter({ name: 'fridge_hum', pos: F.p(lx(47), 0.7, lz(10)), gain: 0.25, radius: 20, refDistance: 1.2 })
  addEmitter({ name: 'fluorescent_buzz', pos: F.p(lx(37), 3.0, lz(29)), gain: 0.28, radius: 20, refDistance: 1.5 })
  addEmitter({ name: 'shop_ambience', pos: F.p(lx(28), 1.8, lz(28)), gain: 0.35, radius: 26, refDistance: 3 })
  addEmitter({ name: 'radio_distant', pos: F.p(lx(40), 2.2, lz(42)), gain: 0.16, radius: 22, refDistance: 2, cutoff: 3500 })
  addEmitter({ name: 'ventilation', pos: F.p(lx(DOOR_X + 2), 2.7, lz(FW + 8)), gain: 0.2, radius: 16, refDistance: 1.5 })
  addEmitter({ name: 'ventilation', pos: F.p(lx(42), 4.3, lz(37)), gain: 0.18, radius: 30, refDistance: 2 })

  const entrance = [F.wx(lx(DOOR_X + 2), lz(FW - 3)), F.wz(lx(DOOR_X + 2), lz(FW - 3))]
  navPath(ctx, F, [[lx(DOOR_X + 2), lz(FW - 3)], [lx(DOOR_X + 2), lz(-6)], [lx(DOOR_X + 2), lz(-22)]], 'path', { to: 'shop' })
  navPath(ctx, F, [[lx(DOOR_X + 2), lz(FW + 3)], [lx(DOOR_X + 2), lz(FW + 12)], [lx(24), lz(30)], [lx(28), lz(32.5)]], 'indoor', { y: F.y + V, to: 'shop_counter' })
  const rec = { kind: 'produkty', name: signName, x: F.x, z: F.z, y: F.y, angle: F.a, entrance, door, interior: { min: inner.min, max: inner.max }, open24: true, placement: shop, cashier }
  reg(ctx, 'shops', rec)
  reg(ctx, 'entrances', { x: entrance[0], y: F.y, z: entrance[1], angle: F.ang(0, -1), kind: 'shop', enterable: true })
  return { placement: shop, door, cashier, frame: F, interior: rec.interior, entrance }
}

export const SHOP_DIMS = { w: 14, d: 10, porch: 1.5, h: 4.25 }
void Frame
void HAND_FONT
