// Big vehicles in fine 0.125 m voxels: LiAZ-5256 bus, ZiU-682 trolleybus (Mosgortrans 2002
// livery, trolley poles up to the 5.8 m contact wire), KAMAZ combined road machine (snowplow /
// gritter) and its roof beacon (a separate dynamic placement so it can flash on its own).
//
// Frame: front at local −Z (z = 0), +X = right side (doors), pivot = bottom centre of the body.
// Buses and trolleybuses have see-through windows (veh_glass_clear) onto a lit interior
// (fluorescent ceiling strips gated by the placement flag); in far LODs the panes become a dim
// lit material.

import { M } from '../../core/materials.js'
import { VoxelModel, FV, v, defineVehicle, rngFor, boxF, discX, archX, line, speckle, grime, snowCap } from './vox.js'
import './materials.js'

/** Metadata: lamps, plates, boards, poles (local metres, relative to pivot). */
export const BIG_INFO = {}

// ---------------------------------------------------------------------------------------------
// Shared transit body (bus / trolleybus)
// ---------------------------------------------------------------------------------------------

function transitBody(o, rng) {
  const Wv = v(o.W), Lv = v(o.L), Hv = v(o.H)
  const MX = 2 // side margin for mirrors
  const sx = Wv + 2 * MX, sz = Lv + (o.tailExtra ?? 0), sy = o.sy ?? Hv + 3
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, Lv / 2)
  const X0 = MX, X1 = MX + Wv
  const sill = v(o.sill), floorY = v(o.floor)
  const w0 = v(o.win[0]), w1 = v(o.win[1])
  const glass = M('veh_glass_clear'), frame = M('plastic_dark')
  const skin = y => o.livery(y)
  const zFront = 1, zRear = Lv - 2
  // ---- shell
  for (let z = zFront; z <= zRear; z++) {
    const corner = z === zFront || z === zRear
    for (let y = sill; y < Hv; y++) {
      const roofRow = y >= Hv - 1
      const xa = X0 + (corner ? 1 : 0) + (roofRow ? 1 : 0), xb = X1 - 1 - (corner ? 1 : 0) - (roofRow ? 1 : 0)
      if (roofRow || y <= floorY || corner) {
        // solid rows: roof, under-floor, front/rear walls
        for (let x = xa; x <= xb; x++) m.set(x, y, z, roofRow ? o.roofMat : y <= floorY ? (x === xa || x === xb ? skin(y) : M('veh_under')) : skin(y))
      } else {
        m.set(xa, y, z, skin(y)); m.set(xb, y, z, skin(y))
      }
    }
    // ceiling just under the roof (interior side), floor covering
    m.fill(X0 + 1, Hv - 2, z, Wv - 2, 1, 1, o.roofMat)
    m.fill(X0 + 1, floorY, z, Wv - 2, 1, 1, M('veh_floor'))
  }
  // round the front/rear roof edges
  m.fill(X0, Hv - 1, zFront, Wv, 1, 1, 0); m.fill(X0, Hv - 1, zRear, Wv, 1, 1, 0)
  // ---- side windows with black rubber pillars
  const pitch = o.pitch ?? 9
  for (const x of [X0, X1 - 1]) {
    for (let z = (o.winZ0 ?? v(0.4)); z < zRear - (o.winTail ?? v(0.4)); z++) {
      const pil = (z - (o.winZ0 ?? v(0.4))) % pitch === 0
      for (let y = w0; y < w1; y++) m.set(x, y, z, pil ? frame : glass)
      m.set(x, w1, z, frame)
      if (o.frameBelow !== false) m.set(x, w0 - 1, z, frame)
    }
  }
  // ---- doors on the right side (x = X1-1): glass leaves from the step to the window top
  for (const [za, zb] of o.doors) {
    const z0 = v(za), z1 = v(zb)
    for (let z = z0; z < z1; z++) {
      const seam = z === z0 || z === z1 - 1 || z === Math.floor((z0 + z1) / 2)
      for (let y = sill + 1; y <= w1; y++) m.set(X1 - 1, y, z, seam || y === sill + 1 || y === w1 ? frame : glass)
      // stairwell with two steps up into the saloon
      m.fill(X1 - 3, sill + 1, z, 2, floorY - sill, 1, 0)
      m.fill(X1 - 2, sill, z, 1, 1, 1, M('veh_floor'))
      m.fill(X1 - 3, sill + Math.max(1, Math.round((floorY - sill) / 2)), z, 1, 1, 1, M('veh_floor'))
    }
  }
  // ---- interior: seats, rails, ceiling lights
  const seatMat = M('veh_seat'), rail = M('veh_handrail')
  const cab = v(1.6) // driver's cab length behind the front wall
  const seatZ0 = cab + 2, seatZ1 = zRear - (o.engineLen ? v(o.engineLen) : 3)
  const doorAt = z => o.doors.some(([a, b]) => z >= v(a) - 1 && z < v(b) + 1)
  for (let z = seatZ0; z < seatZ1; z += 6) {
    for (const side of [0, 1]) {
      if (side === 1 && (doorAt(z) || doorAt(z + 4))) continue
      const xa = side === 0 ? X0 + 1 : X1 - 5
      m.fill(xa, floorY + 1, z, 4, 2, 4, seatMat) // base + cushion
      m.fill(xa, floorY + 3, z + 3, 4, 3, 1, seatMat) // backrest
      if (z % 12 === seatZ0 % 12) for (let y = floorY + 1; y < Hv - 2; y++) m.set(side === 0 ? X0 + 5 : X1 - 6, y, z + 4, rail)
    }
  }
  for (let z = cab; z < seatZ1; z++) {
    m.set(X0 + 5, Hv - 3, z, rail); m.set(X1 - 6, Hv - 3, z, rail)
    if (z % 6 < 4) { m.set(X0 + 3, Hv - 2, z, M('veh_ceiling_lamp')); m.set(X1 - 4, Hv - 2, z, M('veh_ceiling_lamp')) }
  }
  // driver's partition, seat, dashboard
  m.fill(X0 + 1, floorY + 1, cab, Wv / 2 - 1, v(1.2), 1, frame)
  m.fill(X0 + 2, floorY + 1, v(0.9), 3, 2, 3, seatMat)
  m.fill(X0 + 2, floorY + 3, v(0.9) + 3, 3, 3, 1, seatMat)
  m.fill(X0 + 1, floorY + 1, 2, Wv - 2, 3, 2, frame)
  // engine compartment at the back (bus)
  if (o.engineLen) m.fill(X0 + 1, floorY + 1, zRear - v(o.engineLen), Wv - 2, v(0.9), v(o.engineLen), M('veh_under'))
  // ---- wheels
  const r = o.wr / FV, R = M('rubber'), U = M('veh_under')
  for (const za of o.axles) {
    const cz = za / FV
    archX(m, r, cz, r + 1.1, 0, X0, X1)
    archX(m, r, cz, r + 1.1, U, X0 + 2, X0 + 5)
    archX(m, r, cz, r + 1.1, U, X1 - 5, X1 - 2)
    for (let y = 0; y < floorY; y++) for (let z = Math.floor(cz - r - 1.2); z <= Math.ceil(cz + r + 1.2); z++) for (let x = X0 + 5; x < X1 - 5; x++) if (y >= sill && !m.get(x, y, z)) m.set(x, y, z, U)
    m.fill(X0 + 5, floorY, Math.floor(cz - r - 1.2), Wv - 10, 1, Math.ceil(2 * r + 3.4), M('veh_floor'))
    discX(m, X0, X0 + 2, r, cz, r, R); discX(m, X1 - 2, X1, r, cz, r, R)
    discX(m, X0, X0 + 1, r, cz, r * 0.55, M('veh_rim')); discX(m, X1 - 1, X1, r, cz, r * 0.55, M('veh_rim'))
    discX(m, X0, X0 + 1, r, cz, 0.8, M('metal_dark')); discX(m, X1 - 1, X1, r, cz, 0.8, M('metal_dark'))
  }
  // big mirrors on arms ahead of the front corners
  for (const x of [X0 - 2, X1 + 1]) { m.fill(x, v(1.75), 0, 1, 4, 1, frame); m.set(x === X0 - 2 ? X0 - 1 : X1, v(2.3), 1, frame) }
  m.addInterior(X0 + 1, floorY + 1, 2, Wv - 2, Hv - floorY - 3, zRear - 2)
  return { m, X0, X1, Wv, Lv, Hv, sill, floorY, w0, w1, zFront, zRear, sx }
}

// ---------------------------------------------------------------------------------------------
// LiAZ-5256 — 11.4 × 2.5 × 3.0 m, 3 doors, rear engine. Body: paint (tint; white/cream).
// ---------------------------------------------------------------------------------------------

const LIAZ = {
  L: 11.4, W: 2.5, H: 3.0, sill: 0.38, floor: 0.88, win: [1.3, 2.5], wr: 0.5, axles: [2.3, 8.14],
  doors: [[0.3, 1.5], [4.6, 5.8], [9.05, 10.25]], engineLen: 1.6, pitch: 9,
}

function buildLiaz(variant) {
  const rng = rngFor('veh_liaz' + variant)
  const P = M('paint'), stripe = M('veh_tb_blue'), skirt = M('metal_dark')
  const o = {
    ...LIAZ, roofMat: P,
    livery: y => (y < v(0.55) ? skirt : y === v(0.95) || y === v(0.95) + 1 ? stripe : P),
  }
  const b = transitBody(o, rng)
  const { m, X0, X1, Wv, Hv, sill, zFront, zRear } = b
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), D = M('plastic_dark'), W = M('plastic_white')
  const glass = M('veh_glass_clear')
  // windshield (two panes) and the route board above it
  for (let x = X0 + 1; x < X1 - 1; x++) {
    const mid = x === X0 + Wv / 2 || x === X0 + Wv / 2 - 1
    for (let y = v(1.0); y < v(2.45); y++) m.set(x, y, zFront, mid ? D : glass)
    for (let y = v(2.5); y < v(2.85); y++) m.set(x, y, zFront, D)
  }
  // lower front: lamp clusters at the corners, grille slats, bumper, plate
  for (const x of [X0 + 1, X0 + 2, X1 - 2, X1 - 3]) { m.set(x, v(0.68), zFront, H); m.set(x, v(0.68) + 1, zFront, H) }
  for (const x of [X0 + 3, X1 - 4]) m.set(x, v(0.68), zFront, I)
  for (let x = X0 + 5; x < X1 - 5; x++) for (let y = v(0.62); y < v(0.95); y++) m.set(x, y, zFront, (y % 2) ? D : P)
  m.fill(X0, sill, 0, Wv, 2, 1, D)
  m.fill(X0 + Wv / 2 - 2, sill + 2, zFront - 1 < 0 ? 0 : 0, 4, 1, 1, M('veh_tb_ochre'))
  // rear: small window, engine grille, vertical lamp stacks, bumper
  for (let x = X0 + 3; x < X1 - 3; x++) for (let y = v(1.75); y < v(2.5); y++) m.set(x, y, zRear, glass)
  for (let x = X0 + 3; x < X1 - 3; x++) for (let y = v(2.55); y < v(2.85); y++) m.set(x, y, zRear, D)
  for (let x = X0 + 2; x < X1 - 2; x++) for (let y = v(0.7); y < v(1.4); y += 2) m.set(x, y, zRear, D)
  for (const x of [X0 + 1, X1 - 2]) { for (let y = v(0.55); y < v(0.95); y++) m.set(x, y, zRear, T); m.set(x, v(0.95), zRear, I) }
  m.fill(X0, sill, zRear + 1, Wv, 2, 1, D)
  m.fill(X0 + Wv / 2 - 2, v(0.55), zRear + 1, 4, 1, 1, M('veh_tb_ochre'))
  // roof: hatches and the rear air intake hump
  m.fill(X0 + 6, Hv, v(2.6), 6, 1, 6, D)
  m.fill(X0 + 6, Hv, v(6.4), 6, 1, 6, D)
  m.fill(X1 - 7, Hv, zRear - v(1.4), 5, 2, v(1.2), P)
  // amber clearance markers on the roof corners
  for (const x of [X0 + 1, X1 - 2]) { m.set(x, Hv - 1, zFront, M('veh_marker')); m.set(x, Hv - 1, zRear, M('veh_taillamp')) }
  grime(m, rng, [P, stripe], v(0.9), 0.4)
  if (variant === '_snow') snowCap(m, { mat: M('snow'), maxD: 2, profile: [1, 2], rng, vary: 0.3, minY: Hv - 2, smooth: true })
  return m
}

// ---------------------------------------------------------------------------------------------
// ZiU-682 trolleybus — 11.7 × 2.5 × 3.35 m, poles to 5.8 m. Mosgortrans 2002 livery.
// ---------------------------------------------------------------------------------------------

const ZIU = {
  L: 11.7, W: 2.5, H: 3.35, sill: 0.36, floor: 0.92, win: [1.38, 2.6], wr: 0.5, axles: [2.35, 8.35], frameBelow: false,
  doors: [[0.32, 1.52], [4.9, 6.1], [9.6, 10.8]], pitch: 10,
  poleBaseZ: 7.7, poleLen: 6.0, wireY: 5.8, poleX: 0.32,
}

function buildZiu(variant) {
  const rng = rngFor('veh_ziu' + variant)
  const Bl = M('veh_tb_blue'), Wh = M('veh_tb_white'), Oc = M('veh_tb_ochre')
  const yBlue = v(0.35 + 0.83)
  const down = variant === '_down'
  const tailExtra = down ? v(0.4) : v(2.4)
  const o = {
    ...ZIU, roofMat: Oc, tailExtra, sy: down ? v(3.35) + 4 : v(ZIU.wireY) + 1,
    livery: y => (y < yBlue ? Bl : y === yBlue + 1 ? Bl : Wh),
  }
  const b = transitBody(o, rng)
  const { m, X0, X1, Wv, Hv, sill, zFront, zRear } = b
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), D = M('plastic_dark'), MD = M('metal_dark')
  const glass = M('veh_glass_clear')
  // front: big raked windshield (two panes), route board under the brow
  for (let x = X0 + 1; x < X1 - 1; x++) {
    const mid = x === X0 + Wv / 2 || x === X0 + Wv / 2 - 1
    for (let y = v(1.05); y < v(2.45); y++) m.set(x, y, zFront, mid ? D : glass)
    for (let y = v(2.5); y < v(2.88); y++) m.set(x, y, zFront, D)
    m.set(x, v(2.95), 0, Wh) // the brow over the board
  }
  // four round headlamps in a row low on the front, indicators outboard
  for (const x of [X0 + 2, X0 + 4, X1 - 3, X1 - 5]) m.set(x, v(0.68), zFront, H)
  for (const x of [X0 + 1, X1 - 2]) m.set(x, v(0.68), zFront, I)
  for (let x = X0 + 7; x < X1 - 7; x++) for (let y = v(0.6); y < v(0.95); y += 2) m.set(x, y, zFront, D)
  m.fill(X0, sill, 0, Wv, 2, 1, D)
  // rear: window, lamps, ladder, rope catchers
  for (let x = X0 + 2; x < X1 - 2; x++) for (let y = v(1.5); y < v(2.5); y++) m.set(x, y, zRear, glass)
  for (let x = X0 + 4; x < X1 - 4; x++) for (let y = v(2.55); y < v(2.85); y++) m.set(x, y, zRear, D)
  for (const x of [X0 + 1, X1 - 2]) { for (let y = v(0.55); y < v(0.9); y++) m.set(x, y, zRear, T); m.set(x, v(0.9), zRear, I) }
  m.fill(X0, sill, zRear + 1, Wv, 2, 1, D)
  for (let y = v(1.0); y < Hv; y += 2) m.set(X1 - 3, y, zRear + 1, MD)
  const cx = X0 + Wv / 2 // centre line (between voxels)
  const catchers = [cx - 4, cx + 3]
  for (const x of catchers) m.fill(x, v(2.6), zRear + 1, 1, 3, 1, D)
  // roof: long equipment casing, pole bases, insulators
  m.fill(X0 + 5, Hv, v(1.6), Wv - 10, 2, v(5.6), Oc)
  m.fill(X0 + 6, Hv + 2, v(1.8), Wv - 12, 1, v(5.2), M('veh_tb_ochre'))
  const zb = v(ZIU.poleBaseZ)
  m.fill(cx - 4, Hv, zb - 1, 8, 1, 3, MD)
  if (!down) {
    // poles up: 6 m, rising to the 5.8 m contact wire, trailing backwards
    const yb = Hv + 1, yt = v(ZIU.wireY) - 1
    const dz = Math.sqrt(Math.max(1, (ZIU.poleLen / FV) ** 2 - (yt - yb) ** 2))
    for (const [k, xb] of [[-1, cx - 3], [1, cx + 2]]) {
      const xt = k < 0 ? cx - Math.round(ZIU.poleX / FV) : cx + Math.round(ZIU.poleX / FV) - 1
      line(m, [xb + 0.5, yb + 0.5, zb + 0.5], [xt + 0.5, yt + 0.5, zb + dz + 0.5], MD)
      m.fill(xt, yt, Math.round(zb + dz) - 1, 1, 1, 3, D) // trolley shoe
      // retriever rope from the catcher up to the pole
      const tR = 0.62
      line(m, [catchers[k < 0 ? 0 : 1] + 0.5, v(2.95), zRear + 1.5], [xb + (xt - xb) * tR + 0.5, yb + (yt - yb) * tR + 0.5, zb + dz * tR + 0.5], D)
    }
  } else {
    // poles lowered onto the hooks, lying along the roof
    for (const xb of [cx - 3, cx + 2]) {
      m.fill(xb, Hv + 1, zb - v(1.6), 1, 1, v(6.0), MD)
      m.set(xb, Hv, zb - v(1.6), D)
    }
  }
  for (const x of [X0 + 1, X1 - 2]) m.set(x, Hv - 1, zFront, M('veh_marker'))
  grime(m, rng, [Bl], v(0.85), 0.35)
  return m
}

// ---------------------------------------------------------------------------------------------
// KAMAZ КДМ (combined road machine): orange cab-over truck, front plow blade with hazard
// stripes, sand/reagent hopper with a spinner, roof beacons (separate model veh_beacon).
// ---------------------------------------------------------------------------------------------

const KAMAZ = { L: 9.6, W: 2.5, blade: 3.2, H: 3.05 }

function buildKamaz(variant) {
  const rng = rngFor('veh_kamaz' + variant)
  const Wv = v(KAMAZ.W), Lv = v(KAMAZ.L), Bw = v(KAMAZ.blade)
  const sx = Bw + 2, sz = Lv, sy = v(KAMAZ.H) + 4
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, sz / 2)
  const X0 = Math.round((sx - Wv) / 2), X1 = X0 + Wv
  const O = M('veh_orange'), D = M('plastic_dark'), MD = M('metal_dark'), G = M('glass_car'), C = M('chrome')
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), U = M('veh_under'), W = M('plastic_white')
  // ---- blade: 1.1 m tall moldboard angled ~25° across the front (left end leads)
  const zBlade = v(1.15)
  for (let x = 1; x < sx - 1; x++) {
    const t = (x - 1) / (sx - 3)
    const zf = Math.round(t * v(0.7)) // trailing toward the right (snow thrown to the curb side)
    for (let y = 1; y < v(1.15); y++) {
      const curve = y > v(0.8) ? -1 : y < v(0.3) ? 1 : 0 // concave moldboard: lip and top roll forward
      const z = zf + 1 + curve + (y > v(0.95) ? -1 : 0)
      const stripe = ((x + y * 0.8) % 8) < 3.5
      m.set(x, y, Math.max(0, z), stripe ? MD : O)
      m.set(x, y, Math.max(0, z) + 1, MD)
    }
    m.set(x, 0, zf + 2, MD) // cutting edge
  }
  // push frame to the chassis
  for (const x of [X0 + 3, X1 - 4]) m.fill(x, v(0.45), v(0.6), 1, 2, zBlade - v(0.6) + 2, MD)
  // ---- chassis frame, fuel tank, mudguards
  const zCab = zBlade + 2, cabL = v(2.15)
  m.fill(X0 + 2, v(0.55), zCab, Wv - 4, 2, Lv - zCab - 1, MD)
  m.fill(X0, v(0.6), zCab + cabL + 2, 2, v(0.5), v(0.9), M('metal_gray'))
  // ---- cab (cab-over): body orange, big windshield, grille, bumper with lamps
  const yc0 = v(1.05), yc1 = v(3.0)
  for (let z = zCab; z < zCab + cabL; z++) {
    const front = z === zCab
    for (let y = yc0; y < yc1; y++) {
      const top = y === yc1 - 1
      const ins = (front && y > v(2.55)) || top ? 1 : 0
      m.fill(X0 + ins, y, z, Wv - 2 * ins, 1, 1, O)
    }
  }
  for (let x = X0 + 1; x < X1 - 1; x++) for (let y = v(1.95); y < v(2.7); y++) m.set(x, y, zCab, x === X0 + Wv / 2 ? O : G)
  for (const x of [X0, X1 - 1]) for (let y = v(1.95); y < v(2.6); y++) for (let z = zCab + 1; z < zCab + v(1.0); z++) m.set(x, y, z, G)
  for (let x = X0 + 4; x < X1 - 4; x++) for (let y = v(1.25); y < v(1.65); y++) m.set(x, y, zCab, (x % 2) ? D : U)
  m.fill(X0, v(0.85), zCab - 1, Wv, 2, 1, D) // bumper
  for (const x of [X0 + 1, X0 + 2, X1 - 2, X1 - 3]) m.set(x, v(0.85) + 1, zCab - 1, H)
  for (const x of [X0, X1 - 1]) m.set(x, v(0.85), zCab - 1, I)
  // steps, mirrors, door lettering panel
  for (const x of [X0 - 1, X1]) { m.fill(x, v(2.1), zCab + 1, 1, 4, 1, D); m.fill(x, v(0.7), zCab + 2, 1, 1, 3, MD) }
  // beacon mounting bar on the cab roof (lamps are veh_beacon)
  m.fill(X0 + 3, yc1, zCab + 3, Wv - 6, 1, 2, MD)
  // ---- hopper (sand/reagent spreader): trapezoid box, open top with grey sand-salt
  const zH0 = zCab + cabL + 3, zH1 = Lv - 3
  for (let z = zH0; z < zH1; z++) {
    for (let y = v(1.15); y < v(2.75); y++) {
      const ins = Math.max(0, Math.round((v(1.9) - y) / 5))
      m.fill(X0 + ins, y, z, Wv - 2 * ins, 1, 1, O)
    }
  }
  m.fill(X0 + 1, v(2.75) - 1, zH0 + 1, Wv - 2, 1, zH1 - zH0 - 2, M('gravel'))
  for (let z = zH0; z < zH1; z += 6) for (const x of [X0, X1 - 1]) for (let y = v(1.2); y < v(2.75); y++) m.set(x, y, z, MD)
  // spinner disk and its chute at the back
  m.fill(X0 + Wv / 2 - 3, v(0.55), Lv - 3, 6, 1, 3, MD)
  m.fill(X0 + Wv / 2 - 1, v(0.65), Lv - 3, 2, v(0.5), 2, MD)
  for (const x of [X0, X1 - 1]) { m.fill(x, v(0.75), Lv - 2, 1, 2, 1, T); m.set(x, v(0.75) + 2, Lv - 2, I) }
  m.fill(X0 + Wv / 2 - 2, v(0.75), Lv - 1, 4, 1, 1, W)
  // ---- wheels: front under the cab, rear tandem
  const r = 0.52 / FV, R = M('rubber')
  for (const za of [zCab + v(1.2), Lv - v(2.35), Lv - v(1.0)]) {
    archX(m, r, za, r + 1.2, 0, X0, X1)
    discX(m, X0, X0 + 3, r, za, r, R); discX(m, X1 - 3, X1, r, za, r, R)
    discX(m, X0, X0 + 1, r, za, r * 0.5, M('veh_rim')); discX(m, X1 - 1, X1, r, za, r * 0.5, M('veh_rim'))
    m.fill(X0 + 3, Math.round(r) - 1, Math.round(za) - 1, Wv - 6, 2, 2, MD)
    for (const x of [X0, X0 + 1, X1 - 1, X1 - 2]) m.fill(x, Math.round(2 * r + 1), Math.round(za - r - 1), 1, 1, Math.round(2 * r + 2), D)
  }
  speckle(m, rng, O, M('metal_rust'), 0.03, v(1.6))
  grime(m, rng, [O], v(1.4), 0.45)
  snowCap(m, { mat: M('snow_dirty'), maxD: 1, chance: 0.5, profile: [1], rng, minY: v(2.6) })
  return m
}

function buildBeacon() {
  // two amber rotating beacons on a bar (1.2 m), pivot under the bar's centre
  const m = new VoxelModel(12, 3, 3)
  m.setPivot(6, 0, 1.5)
  m.fill(0, 0, 1, 12, 1, 1, M('metal_dark'))
  for (const x of [1, 9]) m.fill(x, 1, 0, 2, 2, 3, M('veh_beacon'))
  return m
}

// ---------------------------------------------------------------------------------------------

defineVehicle('veh_liaz5256', () => buildLiaz(''), { maxDistance: 420 })
defineVehicle('veh_liaz5256_snow', () => buildLiaz('_snow'), { maxDistance: 420 })
defineVehicle('veh_ziu682', () => buildZiu(''), { maxDistance: 420 })
// parked versions: head lamps are plain lenses (the placement flag only lights the saloon,
// the far windows and the parking/marker lamps)
defineVehicle('veh_liaz5256_parked', () => buildLiaz('').replace(M('veh_headlamp'), M('veh_rim')), { maxDistance: 420 })
defineVehicle('veh_ziu682_parked', () => buildZiu('').replace(M('veh_headlamp'), M('veh_rim')), { maxDistance: 420 })
defineVehicle('veh_ziu682_down', () => buildZiu('_down').replace(M('veh_headlamp'), M('veh_rim')), { maxDistance: 420 })
defineVehicle('veh_kamaz_plow', () => buildKamaz(''), { maxDistance: 420 })
defineVehicle('veh_beacon', () => buildBeacon(), { maxDistance: 300, collide: false, contact: false, dynamic: true, lods: [0.5], lodDistances: [] })

const hw = 1.25
BIG_INFO.liaz = {
  type: 'liaz', title: 'ЛиАЗ-5256', L: 11.4, W: 2.5, H: 3.0,
  head: [[-hw + 0.25, 0.75, -5.7], [hw - 0.25, 0.75, -5.7]],
  tail: [[-hw + 0.15, 0.7, 5.7], [hw - 0.15, 0.7, 5.7]],
  plateFront: [0, v(0.38) * FV + 2.5 * FV, -5.7 - 0.012],
  plateRear: [0, 0.62, 5.7 - FV + 0.012],
  boardFront: [0, 2.68, -5.7 + FV - 0.012], boardRear: [0, 2.7, 5.7 - 2 * FV + 0.012],
  boardSide: [hw + 0.012, 2.3, -4.7],
  exhaust: [-0.9, 0.35, 5.8],
  lightInterior: [0, 2.4, 0],
}
BIG_INFO.ziu = {
  type: 'ziu', title: 'ЗиУ-682', L: 11.7, W: 2.5, H: 3.35,
  head: [[-hw + 0.5, 0.75, -5.85], [hw - 0.5, 0.75, -5.85]],
  tail: [[-hw + 0.15, 0.68, 5.85], [hw - 0.15, 0.68, 5.85]],
  plateFront: [0, v(0.36) * FV + 2.5 * FV, -5.85 - 0.012],
  plateRear: [0, 1.1, 5.85 - FV + 0.012],
  boardFront: [0, 2.7, -5.85 + FV - 0.012], boardRear: [0, 2.7, 5.85 - 2 * FV + 0.012],
  boardSide: [hw + 0.012, 2.35, -4.9],
  fleetSide: [hw + 0.012, 0.9, -3.4], fleetFront: [0.75, 1.0, -5.85 + FV - 0.012],
  poleTip: [[-ZIU.poleX, ZIU.wireY, -5.85 + ZIU.poleBaseZ + 5.5], [ZIU.poleX, ZIU.wireY, -5.85 + ZIU.poleBaseZ + 5.5]],
  lightInterior: [0, 2.6, 0],
}
BIG_INFO.kamaz = {
  type: 'kamaz', title: 'КамАЗ КДМ', L: KAMAZ.L, W: KAMAZ.blade, H: KAMAZ.H,
  head: [[-1.0, v(0.85) * FV + 1.5 * FV, -KAMAZ.L / 2 + 1.25], [1.0, v(0.85) * FV + 1.5 * FV, -KAMAZ.L / 2 + 1.25]],
  tail: [[-1.2, 0.85, KAMAZ.L / 2 - 0.25], [1.2, 0.85, KAMAZ.L / 2 - 0.25]],
  plateRear: [0, v(0.75) * FV + 0.5 * FV, KAMAZ.L / 2 + 0.012 - FV],
  beacon: [0, (v(3.0) + 1) * FV, (v(1.15) + 2 + 4 - v(KAMAZ.L) / 2) * FV],
  doorLeft: [-1.25 - 0.012, 1.55, -KAMAZ.L / 2 + 1.75], doorRight: [1.25 + 0.012, 1.55, -KAMAZ.L / 2 + 1.75],
  exhaust: [-1.0, 3.1, -KAMAZ.L / 2 + 3.6],
}
