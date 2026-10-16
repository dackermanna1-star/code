// ER2/ED4-style elektrichka (commuter EMU) in fine 0.125 m voxels: head car with the cab,
// motor car with a raised diamond pantograph, trailer car. Green body, cream stripe, grey
// roof, red front band; big see-through windows onto a warm-lit interior with bay seats.
// Model y = 0 is the RAIL TOP (place at y = 1.25 on the embankment), front at local −Z.

import { M } from '../../core/materials.js'
import { VoxelModel, FV, v, defineVehicle, rngFor, discX, line, grime, snowCap, speckle } from './vox.js'
import './materials.js'

export const TRAIN = {
  carL: 19.6, W: 3.48, roof: 4.25, floor: 1.2, gap: 0.5, wr: 0.525, gauge: 1.52, wire: 5.95,
}
/** Distance between consecutive car centres (m). */
export const TRAIN_PITCH = TRAIN.carL + TRAIN.gap

function buildCar(kind) {
  const rng = rngFor('veh_er2_' + kind)
  const Wv = v(TRAIN.W), Lv = v(TRAIN.carL)
  const sx = Wv + 2, sz = Lv, sy = (kind === 'motor' ? v(TRAIN.wire) : v(TRAIN.roof)) + 2
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, sz / 2)
  const X0 = 1, X1 = 1 + Wv
  const Gr = M('veh_train_green'), St = M('veh_train_stripe'), Rd = M('veh_train_red'), Rf = M('veh_train_roof')
  const D = M('plastic_dark'), MD = M('metal_dark'), U = M('veh_under'), glass = M('veh_glass_clear')
  const yb = v(0.98), yf = v(TRAIN.floor), yr = v(TRAIN.roof)
  const yw0 = v(1.95), yw1 = v(2.9), ys = v(1.72)
  const head = kind === 'head' || kind === 'tail'
  const skin = (y, z) => (y === ys || y === ys + 1 ? St : head && z < v(1.6) && y < v(1.75) ? Rd : Gr)
  // ---- body shell with a curved roof
  for (let z = 0; z < sz; z++) {
    const endD = Math.min(z, sz - 1 - z)
    for (let y = yb; y < yr; y++) {
      // roof curvature: the top rows step in
      const fromTop = yr - 1 - y
      let ins = fromTop === 0 ? 4 : fromTop === 1 ? 2 : fromTop === 2 ? 1 : 0
      if (endD === 0) ins += 1
      const xa = X0 + ins, xb = X1 - 1 - ins
      if (xa > xb) continue
      const roofish = fromTop <= 2
      const wall = y <= yf || endD === 0 || roofish
      if (wall) for (let x = xa; x <= xb; x++) m.set(x, y, z, roofish ? Rf : y <= yf && x !== xa && x !== xb ? U : skin(y, z))
      else { m.set(xa, y, z, skin(y, z)); m.set(xb, y, z, skin(y, z)) }
    }
    m.fill(X0 + 1, yf, z, Wv - 2, 1, 1, M('veh_floor'))
  }
  // ---- doors (two per side per car, near the ends) and windows
  const doorZ = [v(1.25), sz - v(1.25) - v(1.25)]
  const inDoor = z => doorZ.some(d => z >= d && z < d + v(1.25))
  for (const x of [X0, X1 - 1]) {
    for (const d of doorZ) {
      for (let z = d; z < d + v(1.25); z++) {
        const seam = z === d || z === d + v(1.25) - 1 || z === d + Math.floor(v(1.25) / 2)
        for (let y = yf + 1; y < v(3.05); y++) {
          const win = y >= v(2.0) && y < v(2.75) && !seam
          m.set(x, y, z, seam ? D : win ? glass : Gr)
        }
      }
    }
    for (let z = v(2.9); z < sz - v(2.9); z++) {
      if (inDoor(z)) continue
      const pil = ((z - v(2.9)) % 10) >= 8
      for (let y = yw0; y < yw1; y++) m.set(x, y, z, pil ? Gr : glass)
      m.set(x, yw1, z, D)
    }
  }
  // ---- interior: bay seats across the car, warm ceiling lamps, luggage racks
  const seat = M('veh_seat')
  const cx = X0 + Wv / 2
  for (let z = v(2.9); z < sz - v(2.9); z += 10) {
    for (const [xa, w] of [[X0 + 1, 11], [X1 - 1 - 8, 8]]) {
      m.fill(xa, yf + 1, z + 1, w, 3, 3, seat)
      m.fill(xa, yf + 4, z + 1, w, 3, 1, seat)
      m.fill(xa, yf + 1, z + 6, w, 3, 3, seat)
      m.fill(xa, yf + 4, z + 8, w, 3, 1, seat)
    }
  }
  for (let z = 2; z < sz - 2; z++) {
    if (z % 8 < 5) m.set(cx, yr - 3, z, M('veh_ceiling_warm'))
    else m.set(cx, yr - 3, z, Rf)
    m.set(X0 + 1, yw1 + 2, z, MD); m.set(X1 - 2, yw1 + 2, z, MD)
  }
  m.fill(X0 + 1, yr - 2, 1, Wv - 2, 1, sz - 2, Rf) // ceiling (interior side of the roof)
  // gangway ends
  for (const z of [0, sz - 1]) if (!(head && z === 0)) m.fill(cx - 4, yf + 1, z, 8, v(1.85), 1, D)
  // ---- underframe: equipment boxes, bogies with wheels on the rails
  for (let z = v(4.5); z < sz - v(4.5); z++) if ((z % 14) < 11) m.fill(X0 + 3, v(0.55), z, Wv - 6, yb - v(0.55), 1, U)
  const r = TRAIN.wr / FV
  const gx = Math.round(TRAIN.gauge / 2 / FV)
  for (const bz of [v(2.65), sz - v(2.65)]) {
    m.fill(X0 + 4, v(0.45), bz - v(1.6), Wv - 8, 3, v(3.2), MD) // bogie frame
    for (const az of [bz - v(1.3), bz + v(1.3)]) {
      discX(m, cx - gx - 1, cx - gx + 1, r, az, r, MD)
      discX(m, cx + gx - 1, cx + gx + 1, r, az, r, MD)
      m.fill(cx - gx, Math.round(r) - 1, Math.round(az) - 1, 2 * gx, 1, 2, U)
    }
    // springs / axle boxes on the outside of the bogie
    for (const x of [X0 + 3, X1 - 4]) m.fill(x, v(0.4), bz - v(1.5), 1, 3, v(3.0), D)
  }
  // ---- head car: cab front
  if (head) {
    const zc = 0
    // two front windows, a headcode light box between, the big headlamp on top
    for (let x = X0 + 2; x < X1 - 2; x++) {
      const mid = Math.abs(x + 0.5 - cx) < 2
      for (let y = v(2.25); y < v(3.05); y++) m.set(x, y, zc, mid ? Gr : glass)
    }
    m.fill(cx - 2, v(3.3), zc, 4, 3, 1, M('veh_headlamp')) // прожектор
    m.fill(cx - 3, v(3.3) - 1, zc, 6, 1, 1, MD)
    // buffer lamps: white (headlights) outboard, red markers inboard
    for (const x of [X0 + 2, X1 - 3]) { m.set(x, v(1.35), zc, M('veh_headlamp')); m.set(x + (x < cx ? 1 : -1), v(1.35), zc, M('veh_taillamp')) }
    // red front band with yellow «усы» stripes, coupler, plough
    for (let x = X0 + 1; x < X1 - 1; x++) m.set(x, v(1.85), zc, M('veh_tb_ochre'))
    m.fill(cx - 1, v(0.85), 0, 2, 2, 1, MD)
    for (let x = X0 + 2; x < X1 - 2; x++) m.set(x, v(0.5), 1, MD)
    // driver's desk visible through the windows
    m.fill(X0 + 2, yf + 1, 2, Wv - 4, v(0.9), 3, D)
    m.fill(X0 + 1, yf + 1, v(2.6), Wv - 2, v(1.8), 1, D) // cab back wall
  }
  // ---- pantograph (motor car): diamond frame raised to the catenary
  if (kind === 'motor') {
    const pz = Math.round(sz * 0.5)
    const base = yr
    m.fill(cx - 5, base - 1, pz - v(1.0), 10, 1, v(2.0), MD)
    for (const x of [cx - 4, cx + 3]) for (const z of [pz - v(0.9), pz + v(0.9)]) m.set(x, base, z, M('plastic_white')) // insulators
    const top = v(TRAIN.wire) - 1
    const knee = Math.round((base + top) / 2)
    for (const x of [cx - 3, cx + 2]) {
      line(m, [x + 0.5, base + 0.5, pz - v(0.9) + 0.5], [x + 0.5, knee + 0.5, pz - v(0.25) + 0.5], MD)
      line(m, [x + 0.5, knee + 0.5, pz - v(0.25) + 0.5], [x + 0.5, top + 0.5, pz + 0.5], MD)
      line(m, [x + 0.5, base + 0.5, pz + v(0.9) + 0.5], [x + 0.5, knee + 0.5, pz + v(0.25) + 0.5], MD)
      line(m, [x + 0.5, knee + 0.5, pz + v(0.25) + 0.5], [x + 0.5, top + 0.5, pz + 0.5], MD)
    }
    m.fill(cx - 7, top, pz - 1, 14, 1, 2, M('metal_gray')) // collector bow
    // roof equipment: resistor boxes
    m.fill(cx - 3, yr - 1, v(3.0), 6, 1, v(4.0), MD)
  } else {
    m.fill(cx - 3, yr - 1, v(4.0), 6, 1, v(3.0), Rf)
  }
  m.addInterior(X0 + 1, yf + 1, 1, Wv - 2, yr - yf - 3, sz - 2)
  speckle(m, rng, Gr, M('veh_grime'), 0.04, v(1.7))
  grime(m, rng, [Gr, Rd], v(1.5), 0.35)
  snowCap(m, { mat: M('snow'), maxD: 1, chance: 0.62, patchy: 0.18, profile: [1], rng, minY: yr - 2 })
  return m
}

defineVehicle('veh_er2_head', () => buildCar('head'), { maxDistance: 700, lodDistances: [40, 160] })
defineVehicle('veh_er2_tail', () => {
  // the last car runs backwards: same cab, white lamps dark, red markers lit
  const m = buildCar('tail')
  m.replace(M('veh_headlamp'), M('veh_rim'))
  return m
}, { maxDistance: 700, lodDistances: [40, 160] })
defineVehicle('veh_er2_motor', () => buildCar('motor'), { maxDistance: 700, lodDistances: [40, 160] })
defineVehicle('veh_er2_trailer', () => buildCar('trailer'), { maxDistance: 700, lodDistances: [40, 160] })

const half = TRAIN.carL / 2
export const TRAIN_INFO = {
  headlamp: [0, v(3.3) * FV + 1.5 * FV, -half - 0.05],
  buffers: [[-1.35, 1.4, -half - 0.05], [1.35, 1.4, -half - 0.05]],
  tailMarkers: [[-1.2, 1.4, -half - 0.05], [1.2, 1.4, -half - 0.05]],
  numberFront: [0, 1.6, -half - 0.012],
}
