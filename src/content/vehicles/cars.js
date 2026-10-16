// Passenger cars and vans of a Moscow courtyard, winter 2008, in fine 0.125 m voxels.
//
// Every car is built from a side-profile spec (hood / windshield / roof / rear glass / deck
// heights in metres) by one body builder, then a per-model fascia (lamps, grille, bumpers) and
// trim pass. Model frame: front at local −Z (z = 0), +X = the car's right side, pivot =
// bottom centre. Each body type is registered in six snow variants:
//   veh_<type>            clean (traffic)          veh_<type>_s1   light dusting
//   veh_<type>_s2         thick cap on roof/hood/trunk, glass snowed over
//   veh_<type>_s3         half-buried in a drift (pair with a terrain mound — placeParkedCar does)
//   veh_<type>_br         thick cap, windshield brushed clean
//   veh_<type>_warm       engine running: bare wet hood, fogged windows, cap on roof/trunk

import { M } from '../../core/materials.js'
import { VoxelModel, FV, v, defineVehicle, rngFor, boxF, discX, archX, speckle, grime, snowCap, topAt } from './vox.js'
import { valueNoise2 } from '../../core/rng.js'
import './materials.js'

/** Metadata per body type (local metres relative to the pivot; front = −Z). */
export const CAR_INFO = {}

const SNOW_VARIANTS = ['', '_s1', '_s2', '_s3', '_br', '_warm']

// ---------------------------------------------------------------------------------------------
// Specs. Lengths in metres. z is measured from the front bumper tip.
//  L W H: overall; fo: front axle from the front; wb: wheelbase; wr: wheel radius
//  sill: body bottom; bump: bumper [y0, y1]; nose: hood height at the front; hood: at the windshield
//  hoodEnd: windshield base z; wsTop: windshield top z; roofEnd: rear glass top z;
//  rwBase: rear glass bottom z (≈ L for hatchbacks); deck/tail: trunk deck heights
//  belt: window bottom; tumble: greenhouse inset [at belt, at roof] (voxels); bpil: B-pillar z
// ---------------------------------------------------------------------------------------------
const SPECS = {
  vaz2107: {
    title: 'ВАЗ-2107 «семёрка»', L: 4.145, W: 1.62, H: 1.44, fo: 0.80, wb: 2.424, wr: 0.29,
    sill: 0.24, bump: [0.26, 0.5], nose: 0.80, hood: 0.88, hoodEnd: 1.42, wsTop: 1.98, roofEnd: 3.02,
    rwBase: 3.42, deck: 0.92, tail: 0.86, belt: 0.92, tumble: [1, 1], bpil: 2.5,
    bumper: 'chrome', hub: 'chrome', rust: 0.06, mold: 'dark', classic: true,
  },
  vaz2106: {
    title: 'ВАЗ-2106 «шестёрка»', L: 4.166, W: 1.611, H: 1.44, fo: 0.80, wb: 2.424, wr: 0.29,
    sill: 0.24, bump: [0.26, 0.5], nose: 0.80, hood: 0.88, hoodEnd: 1.42, wsTop: 1.98, roofEnd: 3.02,
    rwBase: 3.42, deck: 0.92, tail: 0.86, belt: 0.92, tumble: [1, 1], bpil: 2.5,
    bumper: 'chrome', hub: 'chrome', rust: 0.12, mold: 'chrome', classic: true, rack: true,
  },
  vaz21099: {
    title: 'ВАЗ-21099', L: 4.205, W: 1.65, H: 1.40, fo: 0.74, wb: 2.46, wr: 0.28,
    sill: 0.24, bump: [0.24, 0.5], nose: 0.66, hood: 0.86, hoodEnd: 1.36, wsTop: 2.06, roofEnd: 3.08,
    rwBase: 3.56, deck: 0.92, tail: 0.92, belt: 0.88, tumble: [1, 1], bpil: 2.42,
    bumper: 'black', hub: 'steel', rust: 0.03, mold: 'wide',
  },
  vaz2110: {
    title: 'ВАЗ-2110 «десятка»', L: 4.265, W: 1.68, H: 1.42, fo: 0.80, wb: 2.492, wr: 0.29,
    sill: 0.24, bump: [0.24, 0.52], nose: 0.70, hood: 0.88, hoodEnd: 1.36, wsTop: 2.08, roofEnd: 3.16,
    rwBase: 3.66, deck: 0.98, tail: 0.95, belt: 0.92, tumble: [1, 1], bpil: 2.48,
    bumper: 'body', hub: 'plastic', rust: 0, mold: 'none', round: 2,
  },
  moskvich2141: {
    title: 'Москвич-2141', L: 4.35, W: 1.69, H: 1.40, fo: 0.86, wb: 2.58, wr: 0.29,
    sill: 0.25, bump: [0.24, 0.5], nose: 0.70, hood: 0.84, hoodEnd: 1.40, wsTop: 2.06, roofEnd: 3.08,
    rwBase: 4.16, deck: 0.88, tail: 0.88, belt: 0.88, tumble: [1, 1], bpil: 2.52, hatch: true,
    bumper: 'black', hub: 'steel', rust: 0.08, mold: 'wide',
  },
  volga3110: {
    title: 'ГАЗ-3110 «Волга»', L: 4.88, W: 1.80, H: 1.48, fo: 0.92, wb: 2.80, wr: 0.33,
    sill: 0.26, bump: [0.26, 0.5], nose: 0.82, hood: 0.92, hoodEnd: 1.62, wsTop: 2.24, roofEnd: 3.44,
    rwBase: 3.86, deck: 0.98, tail: 0.95, belt: 0.96, tumble: [1, 1], bpil: 2.82,
    bumper: 'volga', hub: 'chrome', rust: 0.03, mold: 'dark',
  },
  nexia: {
    title: 'Daewoo Nexia-like (иномарка)', L: 4.48, W: 1.66, H: 1.39, fo: 0.86, wb: 2.52, wr: 0.29,
    sill: 0.24, bump: [0.24, 0.52], nose: 0.70, hood: 0.86, hoodEnd: 1.42, wsTop: 2.14, roofEnd: 3.24,
    rwBase: 3.72, deck: 0.96, tail: 0.95, belt: 0.90, tumble: [1, 1], bpil: 2.56,
    bumper: 'body', hub: 'plastic', rust: 0, mold: 'dark', round: 2,
  },
  focus: {
    title: 'Ford Focus II-like hatchback (иномарка)', L: 4.34, W: 1.84, H: 1.48, fo: 0.86, wb: 2.64, wr: 0.31,
    sill: 0.26, bump: [0.24, 0.54], nose: 0.74, hood: 0.92, hoodEnd: 1.28, wsTop: 2.06, roofEnd: 3.62,
    rwBase: 4.18, deck: 1.0, tail: 1.0, belt: 0.98, tumble: [1, 1], bpil: 2.42, hatch: true,
    bumper: 'body', hub: 'alloy', rust: 0, mold: 'none', round: 2,
  },
}

// ---------------------------------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Frame geometry shared by builder + metadata. */
function frame(s) {
  const Wv = v(s.W), Lv = v(s.L), Hv = v(s.H)
  const sx = Wv + 2, sz = Lv, sy = Hv + 6
  return { Wv, Lv, Hv, sx, sz, sy, X0: 1, X1: 1 + Wv }
}

/** Local metres (relative to pivot) of a fine voxel centre. */
function loc(f, vx, vy, vz) { return [(vx + 0.5 - f.sx / 2) * FV, (vy + 0.5) * FV, (vz + 0.5 - f.sz / 2) * FV] }

function sedanBody(s, rng) {
  const f = frame(s)
  const { sx, sy, sz, X0, X1, Wv } = f
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, sz / 2)
  const P = M('paint'), G = M('glass_car')
  const sill = v(s.sill)
  const beltV = v(s.belt), roofV = v(s.H)
  const round = s.round ?? 1
  // ---- lower body: per z slice, rows [sill, top)
  for (let z = 1; z < sz - 1; z++) {
    const zm = (z + 0.5) * FV
    let yT
    if (zm < s.hoodEnd) yT = lerp(s.nose, s.hood, clamp01(zm / s.hoodEnd))
    else if (zm < s.rwBase || s.hatch) yT = s.belt
    else yT = lerp(s.deck, s.tail, clamp01((zm - s.rwBase) / Math.max(0.1, s.L - s.rwBase)))
    // nose and tail roll off by one row at the very ends
    let rows = v(yT)
    if (z === 1 || z === sz - 2) rows -= 1
    // plan-view rounding at the corners
    const endD = Math.min(z - 1, sz - 2 - z)
    const ins = endD === 0 ? round : endD === 1 && round > 1 ? 1 : 0
    m.fill(X0 + ins, sill, z, Wv - 2 * ins, rows - sill, 1, P)
    // top edge of the hood/deck rounds over by one voxel on the sides
    if (rows - 1 > sill) { m.set(X0 + ins, rows - 1, z, 0); m.set(X1 - 1 - ins, rows - 1, z, 0) }
  }
  // ---- greenhouse
  const ghRows = roofV - beltV
  for (let y = beltV; y < roofV; y++) {
    const t = (y + 0.5 - beltV) / ghRows
    const zf = lerp(s.hoodEnd, s.wsTop, t)
    const zr = lerp(s.rwBase, s.roofEnd, t)
    const top = y === roofV - 1
    const ins = Math.round(lerp(s.tumble[0], s.tumble[1], t)) + (top ? 1 : 0)
    const z0 = Math.ceil(zf / FV - 0.5), z1 = Math.floor(zr / FV - 0.5)
    if (z1 < z0) continue
    m.fill(X0 + ins, y, z0, Wv - 2 * ins, 1, z1 - z0 + 1, top ? P : G)
    if (!top) {
      // pillars: A at the front corners, C at the rear, B at the door split; door-top frame
      for (const x of [X0 + ins, X1 - 1 - ins]) {
        m.set(x, y, z0, P)
        m.set(x, y, z1, P)
        if (!s.hatch) m.set(x, y, z1 - 1, P)
        const zb = Math.round(s.bpil / FV)
        if (zb > z0 && zb < z1) m.set(x, y, zb, P)
      }
    }
  }
  return { m, f, sill, beltV, roofV }
}

function wheels(m, f, s, hubMat) {
  const { X0, X1 } = f
  const r = s.wr / FV
  const R = M('rubber'), U = M('veh_under')
  for (const za of [s.fo, s.fo + s.wb]) {
    const cz = za / FV, cy = r
    archX(m, cy, cz, r + 0.95, 0, X0, X1)
    archX(m, cy, cz, r + 0.95, U, X0 + 2, X1 - 2)
    discX(m, X0, X0 + 2, cy, cz, r, R)
    discX(m, X1 - 2, X1, cy, cz, r, R)
    if (hubMat) {
      discX(m, X0, X0 + 1, cy, cz, r * 0.55, hubMat)
      discX(m, X1 - 1, X1, cy, cz, r * 0.55, hubMat)
    }
  }
  // dark underbody strip between the axles (exhaust, sills' shadow)
  const zf = Math.round((s.fo + s.wr + 0.15) / FV), zr = Math.round((s.fo + s.wb - s.wr - 0.15) / FV)
  m.fill(X0 + 3, 1, zf, f.Wv - 6, 1, Math.max(1, zr - zf), U)
}

function bumpers(m, f, s) {
  const { sz, X0, X1, Wv } = f
  const y0 = v(s.bump[0]), y1 = Math.max(y0 + 1, v(s.bump[1]))
  const C = M('chrome'), B = M('plastic_dark'), P = M('paint')
  const fill = (z, mat, ins = 0) => m.fill(X0 + ins, y0, z, Wv - 2 * ins, y1 - y0, 1, mat)
  if (s.bumper === 'chrome') {
    fill(0, C, 1); fill(sz - 1, C, 1)
    // corner wrap and black rubber end caps
    for (const x of [X0, X1 - 1]) { m.fill(x, y0, 1, 1, y1 - y0, 1, C); m.fill(x, y0, sz - 2, 1, y1 - y0, 1, C) }
    m.fill(X0 + 1, y0, 0, 1, 1, 1, B); m.fill(X1 - 2, y0, 0, 1, 1, 1, B)
  } else if (s.bumper === 'black') {
    fill(0, B, 1); fill(sz - 1, B, 1)
    for (const x of [X0, X1 - 1]) { m.fill(x, y0, 1, 1, y1 - y0, 2, B); m.fill(x, y0, sz - 3, 1, y1 - y0, 2, B) }
  } else if (s.bumper === 'volga') {
    fill(0, B, 1); fill(sz - 1, B, 1)
    m.fill(X0 + 1, y1 - 1, 0, Wv - 2, 1, 1, C); m.fill(X0 + 1, y1 - 1, sz - 1, Wv - 2, 1, 1, C)
    for (const x of [X0, X1 - 1]) { m.fill(x, y0, 1, 1, y1 - y0, 1, B); m.fill(x, y0, sz - 2, 1, y1 - y0, 1, B) }
  } else {
    // body-coloured bumpers with a black lip
    fill(0, P, 2); fill(sz - 1, P, 2)
    m.fill(X0 + 2, y0, 0, Wv - 4, 1, 1, B); m.fill(X0 + 2, y0, sz - 1, Wv - 4, 1, 1, B)
    for (const x of [X0, X1 - 1]) { m.fill(x, y0, 2, 1, y1 - y0, 1, P); m.fill(x, y0, sz - 3, 1, y1 - y0, 1, P) }
  }
  return { y0, y1 }
}

/** Front and rear faces: lamps, grille, plates. Writes at z = 1 (front face) and sz-2 (rear face). */
function fascia(m, f, s, type, by) {
  const { sz, X0, X1, Wv } = f
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), C = M('chrome'), B = M('plastic_dark'), W = M('plastic_white')
  const zF = 1, zR = sz - 2
  const L = i => X0 + i, R = i => X1 - 1 - i // column i from the left / right edge of the body
  const both = (i, y, z, mat) => { m.set(L(i), y, z, mat); m.set(R(i), y, z, mat) }
  const yL = by.y1 // first row above the bumper
  const cx0 = X0 + Math.floor(Wv / 2) - 2 // plate start column (4 wide)
  // plates: white blanks, decals go on top
  m.fill(cx0, by.y0, 0, 4, 1, 1, W)
  switch (type) {
    case 'vaz2107': {
      for (let i = 1; i <= 2; i++) both(i, yL + 1, zF, H)
      both(1, yL, zF, I); both(2, yL, zF, B)
      for (let x = L(3); x <= R(3); x++) { m.set(x, yL + 1, zF, (x - L(3)) % 2 ? B : C); m.set(x, yL, zF, (x - L(3)) % 2 ? B : C) }
      // the protruding chrome "jaw" of the seven
      for (let x = L(4); x <= R(4); x++) { m.set(x, yL, 0, (x % 2) ? C : B); m.set(x, yL + 1, 0, C) }
      for (const i of [1, 2]) { both(i, yL, zR, T); both(i, yL + 1, zR, T) }
      both(3, yL + 1, zR, I); both(3, yL, zR, M('plastic_white'))
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'vaz2106': {
      both(1, yL + 1, zF, H); both(2, yL + 1, zF, H)
      both(1, yL, zF, I); both(2, yL, zF, C)
      for (let x = L(3); x <= R(3); x++) { m.set(x, yL + 1, zF, C); m.set(x, yL, zF, (x % 2) ? B : C) }
      for (let x = L(3); x <= R(3); x++) m.set(x, yL + 1, zF, (x % 2) ? C : B)
      for (const i of [1, 2]) both(i, yL + 1, zR, T)
      both(1, yL, zR, I); both(2, yL, zR, T)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'vaz21099': {
      for (let i = 1; i <= 3; i++) both(i, yL, zF, H)
      for (let x = L(4); x <= R(4); x++) m.set(x, yL, zF, (x % 2) ? B : M('veh_under'))
      both(1, by.y1 - 1, 0, I)
      // full-width dark rear panel with lamps at the ends
      for (let x = L(1); x <= R(1); x++) m.set(x, yL + 1, zR, B)
      for (let i = 1; i <= 3; i++) both(i, yL + 1, zR, T)
      both(1, yL, zR, I)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'vaz2110': {
      for (let i = 1; i <= 3; i++) both(i, yL + 1, zF, H)
      both(2, yL, zF, I)
      for (let x = L(5); x <= R(5); x++) m.set(x, yL + 1, zF, C)
      for (let x = L(4); x <= R(4); x++) m.set(x, yL - 1, 0, B)
      for (let i = 1; i <= 3; i++) both(i, yL + 2, zR, T)
      both(1, yL + 2, zR - 1, T)
      both(2, yL + 1, zR, I)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'moskvich2141': {
      for (let i = 1; i <= 3; i++) both(i, yL, zF, H)
      both(1, yL + 1, zF, I)
      for (let x = L(4); x <= R(4); x++) m.set(x, yL, zF, (x % 2) ? B : M('veh_under'))
      both(1, yL + 1, zR, T); both(1, yL + 2, zR, T); both(2, yL + 1, zR, T); both(1, yL, zR, I)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'volga3110': {
      for (let i = 1; i <= 2; i++) both(i, yL + 1, zF, H)
      both(1, yL, zF, I); both(2, yL, zF, B)
      for (let x = L(3); x <= R(3); x++) {
        m.set(x, yL, zF, (x % 2) ? C : B); m.set(x, yL + 1, zF, (x % 2) ? C : B); m.set(x, yL + 2, zF, C)
      }
      for (let i = 1; i <= 3; i++) { both(i, yL + 1, zR, T) }
      both(1, yL, zR, I); both(2, yL, zR, T)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'nexia': {
      for (let i = 1; i <= 3; i++) both(i, yL + 1, zF, H)
      both(1, yL, zF, I)
      for (let x = L(5); x <= R(5); x++) m.set(x, yL + 1, zF, C)
      for (let x = L(3); x <= R(3); x++) m.set(x, by.y0 + 1, 0, B)
      for (let i = 1; i <= 3; i++) both(i, yL + 2, zR, T)
      both(1, yL + 1, zR, I)
      m.fill(cx0, yL, zR, 4, 1, 1, W)
      break
    }
    case 'focus': {
      for (let i = 1; i <= 3; i++) both(i, yL + 1, zF, H)
      both(1, yL + 2, zF, H)
      for (let x = L(4); x <= R(4); x++) { m.set(x, yL + 1, zF, B); m.set(x, by.y0 + 1, 0, B) }
      both(1, by.y0 + 1, 0, I)
      // tall vertical tail lamps up the D-pillars
      for (let y = yL; y < v(s.belt) + 3; y++) { both(0, y, zR - 1, T); both(1, y, zR, T) }
      m.fill(cx0, yL + 1, zR, 4, 1, 1, W)
      break
    }
  }
}

function trim(m, f, s, rng) {
  const { X0, X1, sz } = f
  const beltV = v(s.belt)
  const C = M('chrome'), B = M('plastic_dark'), P = M('paint')
  // mirrors at the base of the A-pillars (outside the body width)
  const zm = Math.round(s.hoodEnd / FV) + 1
  const mirror = s.classic ? C : B
  m.set(X0 - 1, beltV, zm, mirror); m.set(X1, beltV, zm, mirror)
  // door handles
  const zh = [Math.round((s.bpil - 0.12) / FV), Math.round((s.bpil + 0.85) / FV)]
  for (const z of zh) for (const x of [X0, X1 - 1]) if (m.get(x, beltV - 1, z) === P) m.set(x, beltV - 1, z, s.classic ? C : B)
  // side moldings
  if (s.mold && s.mold !== 'none') {
    const ym = s.mold === 'wide' ? v(0.5) : v(0.62)
    const mat = s.mold === 'chrome' ? C : B
    for (let z = 2; z < sz - 2; z++) for (const x of [X0, X1 - 1]) {
      if (m.get(x, ym, z) === P) m.set(x, ym, z, mat)
      if (s.mold === 'wide' && m.get(x, ym + 1, z) === P) m.set(x, ym + 1, z, mat)
    }
  }
  // roof rack (classic 2106): two rails on four feet
  if (s.rack) {
    const roofV = v(s.H)
    const z0 = Math.round((s.wsTop + 0.15) / FV), z1 = Math.round((s.roofEnd - 0.1) / FV)
    for (const x of [X0 + 3, X1 - 4]) m.fill(x, roofV, z0, 1, 1, z1 - z0 + 1, M('metal_dark'))
    for (let z = z0 + 2; z < z1; z += 3) m.fill(X0 + 3, roofV, z, X1 - X0 - 6, 1, 1, M('metal_dark'))
  }
  // rust on the sills and arch lips of old cars
  if (s.rust) speckle(m, rng, P, M('metal_rust'), s.rust, v(0.5))
  grime(m, rng, [P], v(0.62), 0.32)
}

// ---- metadata ---------------------------------------------------------------------------------

function sedanInfo(type, s) {
  const f = frame(s)
  const by0 = v(s.bump[0]), by1 = Math.max(by0 + 1, v(s.bump[1]))
  const yHead = (type === 'vaz21099' || type === 'moskvich2141') ? by1 : by1 + 1
  const yTail = type === 'focus' ? by1 + 3 : (type === 'vaz2110' || type === 'nexia') ? by1 + 2 : by1 + 1
  const hx = (f.Wv / 2 - 1.6) * FV
  const rearPlateY = type === 'focus' ? by1 + 1 : by1
  return {
    type, title: s.title, L: f.sz * FV, W: f.Wv * FV, H: v(s.H) * FV, wr: s.wr,
    head: [[-hx, (yHead + 0.5) * FV, -f.sz / 2 * FV], [hx, (yHead + 0.5) * FV, -f.sz / 2 * FV]],
    tail: [[-hx - FV * 0.4, (yTail + 0.5) * FV, f.sz / 2 * FV], [hx + FV * 0.4, (yTail + 0.5) * FV, f.sz / 2 * FV]],
    plateFront: [0, (by0 + 0.5) * FV, -f.sz / 2 * FV - 0.012],
    plateRear: [0, (rearPlateY + 0.5) * FV, (f.sz / 2 - 1) * FV + 0.012],
    exhaust: [-(f.Wv / 2 - 3) * FV, 0.25, f.sz / 2 * FV + 0.1],
    hood: [0, s.hood + 0.05, -f.sz / 2 * FV + s.hoodEnd * 0.6],
  }
}

// ---- snow variants ------------------------------------------------------------------------------

/**
 * Apply a snow variant to a finished car. g = { hoodEndV, wsTopV, rwBaseV, beltV, X0, X1, frontV }
 */
export function applySnow(m, variant, g, rng) {
  const S = M('snow'), SF = M('snow_fresh')
  // the bumper rows (first/last z) stay bare: snow there would sit right in front of the lamps
  // and the plates on the vertical end faces
  const ends = (x, y, z) => z === 0 || z === m.sz - 1
  if (variant === '_s1') {
    snowCap(m, { mat: SF, maxD: 1, chance: 0.8, patchy: 0.35, profile: [1], rng, minY: 2, ledges: true, skip: ends })
  } else if (variant === '_s2') {
    snowCap(m, { mat: S, maxD: 3, profile: [2, 3], rng, bumps: 0.3, minY: 2, smooth: 0.5, ledges: true, skip: ends })
  } else if (variant === '_s3') {
    // drift: fill air around/below the body; deeper on the windward (left, x small) side,
    // with a soft wavy crest (placeParkedCar continues it outward as a terrain bank)
    const ns = rng.int(1, 9999)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const side = 1 - x / (m.sx - 1)
        const endD = Math.min(z, m.sz - 1 - z)
        const endK = endD < 3 ? 0.6 + 0.13 * endD : 1
        const n = valueNoise2(x * 0.3, z * 0.22, ns) - 0.5
        const h = Math.round((2 + side * side * (g.beltV - 3)) * endK + n * 2)
        for (let y = 0; y < h; y++) if (!m.get(x, y, z)) m.set(x, y, z, S)
      }
    snowCap(m, { mat: S, maxD: 3, profile: [2, 3], rng, bumps: 0.3, minY: 4, smooth: 0.5, ledges: true })
  } else if (variant === '_br') {
    snowCap(m, { mat: S, maxD: 3, profile: [2, 3], rng, bumps: 0.3, minY: 2, smooth: 0.5, ledges: true, skip: ends })
    // brushed windshield + rear half of the hood; the brushed snow piles up at the edges
    const zb0 = g.hoodEndV - 3, zb1 = g.wsTopV
    for (let z = zb0; z <= zb1; z++)
      for (let x = g.X0 + 1; x < g.X1 - 1; x++) {
        for (let y = m.sy - 1; y >= 0; y--) {
          const id = m.get(x, y, z)
          if (id === S || id === SF) m.set(x, y, z, 0)
          else if (id) break
        }
      }
    for (let z = zb0; z <= zb1; z++) for (const x of [g.X0, g.X1 - 1]) {
      const t = topAt(m, x, z)
      if (t > 0 && t + 1 < m.sy) m.set(x, t + 1, z, S)
    }
    for (let x = g.X0 + 1; x < g.X1 - 1; x++) {
      const t = topAt(m, x, zb0 - 1)
      if (t > 0 && t + 1 < m.sy) m.set(x, t + 1, zb0 - 1, S)
    }
  } else if (variant === '_warm') {
    // fogged glass; snow only on roof and trunk: the hood is bare and wet from the engine heat
    m.replace(M('glass_car'), M('glass_frosted'))
    snowCap(m, { mat: S, maxD: 2, profile: [1, 2], rng, bumps: 0.35, minY: g.beltV - 2, smooth: 0.5, ledges: true, skip: (x, y, z) => z < g.wsTopV || ends(x, y, z) })
  }
  return m
}

// ---- registration ---------------------------------------------------------------------------------

function buildSedan(type, variant) {
  const s = SPECS[type]
  const rng = rngFor('veh_' + type + variant)
  const { m, f, beltV } = sedanBody(s, rng)
  const by = bumpers(m, f, s)
  fascia(m, f, s, type, by)
  const hub = s.hub === 'chrome' ? M('chrome') : s.hub === 'alloy' ? M('metal_gray') : s.hub === 'plastic' ? M('plastic_dark') : M('veh_rim')
  wheels(m, f, s, hub)
  trim(m, f, s, rng)
  const hoodEndV = Math.round(s.hoodEnd / FV)
  const hoodTop = topAt(m, f.X0 + 4, hoodEndV - 1)
  applySnow(m, variant, {
    hoodEndV, wsTopV: Math.round(s.wsTop / FV), rwBaseV: Math.round(s.rwBase / FV),
    beltV, X0: f.X0, X1: f.X1,
  }, rng)
  // a Moscow habit: wipers lifted off the glass for the night so they do not freeze to it
  if ((variant === '_s2' || variant === '_s3') && WIPERS_UP.has(type)) {
    const D = M('plastic_dark')
    const SN = M('snow')
    for (const k of [0.27, 0.62]) {
      // the arm leans forward off its spindle at the foot of the windshield
      const x = f.X0 + Math.round(f.Wv * k)
      for (let i = 0; i < 9; i++) {
        const y = hoodTop + 1 + i, z = hoodEndV - Math.floor(i * 0.6)
        if (y >= m.sy || z < 1) break
        const t = topAt(m, x, z)
        if (y > t + 1 && i >= 3) break // one voxel proud of the snow, then stop
        const id = m.get(x, y, z)
        if (!id || id === SN) m.set(x, y, z, D)
      }
    }
  }
  return m
}
const WIPERS_UP = new Set(['vaz2107', 'vaz2106', 'vaz21099', 'moskvich2141', 'volga3110', 'nexia'])

for (const type of Object.keys(SPECS)) {
  CAR_INFO[type] = sedanInfo(type, SPECS[type])
  for (const variant of SNOW_VARIANTS) {
    defineVehicle('veh_' + type + variant, () => buildSedan(type, variant), { maxDistance: 260 })
  }
}

// ---------------------------------------------------------------------------------------------
// Vans: GAZelle (minibus «маршрутка» and cargo van) and UAZ-452 «буханка».
// ---------------------------------------------------------------------------------------------

const VANS = {
  gazelle: { title: 'ГАЗель ГАЗ-3221 (маршрутка)', L: 5.5, W: 2.06, H: 2.2, fo: 1.0, wb: 2.9, wr: 0.36, windows: true },
  gazelle_van: { title: 'ГАЗель ГАЗ-2705 (фургон)', L: 5.5, W: 2.06, H: 2.2, fo: 1.0, wb: 2.9, wr: 0.36, windows: false },
  uaz452: { title: 'УАЗ-452 «буханка»', L: 4.46, W: 1.94, H: 2.09, fo: 0.72, wb: 2.3, wr: 0.38, uaz: true },
}

function buildGazelle(s, rng, variant) {
  const Wv = v(s.W), Lv = v(s.L), Hv = v(s.H)
  const sx = Wv + 2, sz = Lv, sy = Hv + 6
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, sz / 2)
  const X0 = 1, X1 = 1 + Wv
  const P = M('paint'), G = M('glass_car'), B = M('plastic_dark'), C = M('chrome')
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), W = M('plastic_white')
  const sill = v(0.36)
  const zBox = v(0.95) // start of the full-height body (windshield base)
  for (let z = 1; z < sz - 1; z++) {
    const zm = (z + 0.5) * FV
    let top
    if (zm < 0.95) top = lerp(1.0, 1.18, zm / 0.95) // short sloping bonnet
    else if (zm < 1.55) top = lerp(1.18, s.H, (zm - 0.95) / 0.6) // raked windshield
    else top = s.H
    const endD = Math.min(z - 1, sz - 2 - z)
    const ins = endD === 0 ? 1 : 0
    m.fill(X0 + ins, sill, z, Wv - 2 * ins, v(top) - sill, 1, P)
    // roof edge rounding
    m.set(X0 + ins, v(top) - 1, z, 0); m.set(X1 - 1 - ins, v(top) - 1, z, 0)
  }
  // windshield: the sloped surface between bonnet and roof
  for (let z = zBox - 1; z < v(1.6); z++) {
    for (let x = X0 + 1; x < X1 - 1; x++) {
      const t = topAt(m, x, z)
      if (t >= v(1.2) && t < v(s.H) - 1) { m.set(x, t, z, G); if (m.get(x, t - 1, z) === P && t - 1 >= v(1.2)) m.set(x, t - 1, z, G) }
    }
  }
  // cab side windows (doors)
  const yw0 = v(1.22), yw1 = v(1.9)
  for (const x of [X0, X1 - 1]) {
    m.fill(x, yw0, v(1.2), 1, yw1 - yw0, v(0.75), G)
    if (s.windows) {
      // passenger windows along the body, with pillars
      for (let z = v(2.15); z < sz - v(0.45); z += 1) {
        const pillar = ((z - v(2.15)) % 7) === 6
        m.fill(x, yw0, z, 1, yw1 - yw0, 1, pillar ? P : G)
      }
    }
  }
  // sliding door seam (right side) and handle
  m.set(X1 - 1, v(1.0), v(2.2), B)
  // rear doors: two small windows, vertical lamps at the corners
  for (let x = X0 + 2; x < X1 - 2; x++) if (x !== X0 + Math.floor(Wv / 2)) m.fill(x, v(1.35), sz - 2, 1, v(0.45), 1, G)
  m.fill(X0 + Math.floor(Wv / 2), sill, sz - 2, 1, v(s.H) - sill - 1, 1, B)
  for (const x of [X0, X1 - 1]) { m.fill(x, v(0.55), sz - 2, 1, 3, 1, T); m.set(x, v(0.55) + 3, sz - 2, I) }
  // front: big grille, square lamps, black bumper
  const yb = v(0.38)
  m.fill(X0, yb, 0, Wv, 2, 1, B)
  m.fill(X0 + Math.floor(Wv / 2) - 2, yb, 0, 4, 1, 1, W)
  for (let x = X0 + 4; x < X1 - 4; x++) for (let y = yb + 2; y < yb + 4; y++) m.set(x, y, 1, (x + y) % 2 ? C : M('veh_under'))
  for (const i of [1, 2]) { m.set(X0 + i, yb + 3, 1, H); m.set(X1 - 1 - i, yb + 3, 1, H) }
  m.set(X0 + 1, yb + 2, 1, I); m.set(X1 - 2, yb + 2, 1, I)
  // rear bumper step
  m.fill(X0 + 1, sill, sz - 1, Wv - 2, 1, 1, B)
  m.fill(X0 + Math.floor(Wv / 2) - 2, sill + 2, sz - 2, 4, 1, 1, W)
  // wheels (rear: dual)
  const r = s.wr / FV, R = M('rubber'), U = M('veh_under')
  for (const za of [s.fo, s.fo + s.wb]) {
    const cz = za / FV
    archX(m, r, cz, r + 0.9, 0, X0, X1)
    archX(m, r, cz, r + 0.9, U, X0 + 2, X1 - 2)
    discX(m, X0, X0 + 2, r, cz, r, R); discX(m, X1 - 2, X1, r, cz, r, R)
    discX(m, X0, X0 + 1, r, cz, r * 0.5, M('veh_rim')); discX(m, X1 - 1, X1, r, cz, r * 0.5, M('veh_rim'))
  }
  m.set(X0 - 1, v(1.3), v(1.05), B); m.set(X1, v(1.3), v(1.05), B) // mirrors
  m.set(X0 - 1, v(1.2), v(1.05), B); m.set(X1, v(1.2), v(1.05), B)
  grime(m, rng, [P], v(0.75), 0.6)
  applySnow(m, variant, { hoodEndV: zBox, wsTopV: v(1.55), rwBaseV: sz, beltV: v(1.2), X0, X1 }, rng)
  return m
}

function buildUaz(s, rng, variant) {
  const Wv = v(s.W), Lv = v(s.L), Hv = v(s.H)
  const sx = Wv + 2, sz = Lv, sy = Hv + 6
  const m = new VoxelModel(sx, sy, sz)
  m.setPivot(sx / 2, 0, sz / 2)
  const X0 = 1, X1 = 1 + Wv
  const P = M('paint'), G = M('glass_car'), B = M('plastic_dark'), C = M('chrome')
  const H = M('veh_headlamp'), T = M('veh_taillamp'), I = M('veh_indicator'), W = M('plastic_white')
  const sill = v(0.48), top = v(s.H)
  // the loaf: a box with generously rounded vertical edges and roof
  for (let z = 1; z < sz - 1; z++) {
    const endD = Math.min(z - 1, sz - 2 - z)
    const ins = endD === 0 ? 2 : endD === 1 ? 1 : 0
    m.fill(X0 + ins, sill, z, Wv - 2 * ins, top - sill, 1, P)
    // roof: rounded off over two rows at the sides and ends
    m.set(X0 + ins, top - 1, z, 0); m.set(X1 - 1 - ins, top - 1, z, 0)
    if (endD === 0) m.fill(X0, top - 1, z, Wv, 1, 1, 0)
  }
  // slight forward lean of the windshield: top front row pulled back
  m.fill(X0, top - 2, 1, Wv, 2, 1, 0)
  // windshield (split by a centre bar), cab door glass, three side windows, rear door glass
  const yw0 = v(1.28), yw1 = v(1.78)
  const cxm = X0 + Math.floor(Wv / 2)
  for (let x = X0 + 2; x < X1 - 2; x++) for (let y = yw0; y < yw1; y++) {
    const zz = y >= top - 2 ? 2 : 1
    if (x !== cxm && x !== cxm - 1) m.set(x, y, zz, G)
  }
  for (const x of [X0, X1 - 1]) {
    m.fill(x, yw0, v(0.35), 1, yw1 - yw0, v(0.55), G)
    for (const z0 of [1.35, 2.15, 2.95]) m.fill(x, yw0, v(z0), 1, yw1 - yw0 - 1, v(0.55), G)
  }
  m.fill(cxm - 2, yw0, sz - 2, 4, yw1 - yw0 - 1, 1, G)
  // front: round lamps low on the face, a slotted grille between, heavy black bumper
  const yl = v(0.92)
  m.set(X0 + 2, yl, 1, H); m.set(X1 - 3, yl, 1, H)
  m.set(X0 + 2, yl - 2, 1, I); m.set(X1 - 3, yl - 2, 1, I)
  for (let x = cxm - 3; x <= cxm + 2; x++) for (let y = yl - 2; y <= yl; y++) m.set(x, y, 1, x % 2 ? B : M('veh_under'))
  m.fill(X0, sill - 1, 0, Wv, 2, 1, B)
  m.fill(cxm - 2, sill - 1, 0, 4, 1, 1, W)
  m.fill(X0, sill - 1, sz - 1, Wv, 1, 1, B)
  for (const x of [X0 + 1, X1 - 2]) { m.set(x, v(0.75), sz - 2, T); m.set(x, v(0.75) + 1, sz - 2, I) }
  m.fill(cxm - 2, v(0.62), sz - 2, 4, 1, 1, W)
  // handles, mirrors, spare-wheel-free tail, rain gutter
  for (const x of [X0 - 1, X1]) { m.set(x, yw0, v(0.5), B); m.set(x, yw0 + 1, v(0.5), B) }
  for (let z = 2; z < sz - 2; z++) for (const x of [X0, X1 - 1]) if (m.get(x, top - 2, z) === P) m.set(x, top - 2, z, M('metal_dark'))
  const r = s.wr / FV, R = M('rubber'), U = M('veh_under')
  for (const za of [s.fo, s.fo + s.wb]) {
    const cz = za / FV
    archX(m, r, cz, r + 1.0, 0, X0, X1)
    archX(m, r, cz, r + 1.0, U, X0 + 2, X1 - 2)
    discX(m, X0, X0 + 2, r, cz, r, R); discX(m, X1 - 2, X1, r, cz, r, R)
    discX(m, X0, X0 + 1, r, cz, r * 0.5, M('veh_rim')); discX(m, X1 - 1, X1, r, cz, r * 0.5, M('veh_rim'))
  }
  speckle(m, rng, P, M('metal_rust'), 0.06, v(0.8))
  grime(m, rng, [P], v(0.85), 0.6)
  applySnow(m, variant, { hoodEndV: 2, wsTopV: 3, rwBaseV: sz, beltV: v(1.25), X0, X1 }, rng)
  return m
}

function vanInfo(type, s) {
  const Wv = v(s.W), Lv = v(s.L)
  const hx = (Wv / 2 - 2) * FV
  const yh = s.uaz ? 0.92 : 0.38 + 3 * FV
  const yt = s.uaz ? 0.75 : 0.55 + FV
  return {
    type, title: s.title, L: Lv * FV, W: Wv * FV, H: v(s.H) * FV, wr: s.wr,
    head: [[-hx, yh + FV / 2, -Lv / 2 * FV], [hx, yh + FV / 2, -Lv / 2 * FV]],
    tail: [[-(Wv / 2 - 0.5) * FV, yt + 0.2, Lv / 2 * FV], [(Wv / 2 - 0.5) * FV, yt + 0.2, Lv / 2 * FV]],
    plateFront: [0, (s.uaz ? v(0.48) - 1 : v(0.38)) * FV + FV / 2, -Lv / 2 * FV - 0.012],
    plateRear: [0, (s.uaz ? v(0.62) : v(0.36) + 2) * FV + FV / 2, (Lv / 2 - 1) * FV + 0.012],
    exhaust: [-(Wv / 2 - 3) * FV, 0.3, Lv / 2 * FV + 0.1],
    hood: [0, s.uaz ? 1.0 : 1.2, -Lv / 2 * FV + 0.6],
    // marshrutka route card propped behind the windshield (just in front of the sloped glass)
    boardFront: s.uaz ? null : [0.42, 1.36, -Lv / 2 * FV + 1.04],
  }
}

for (const type of Object.keys(VANS)) {
  const s = VANS[type]
  CAR_INFO[type] = vanInfo(type, s)
  for (const variant of SNOW_VARIANTS) {
    defineVehicle('veh_' + type + variant, () => {
      const rng = rngFor('veh_' + type + variant)
      return s.uaz ? buildUaz(s, rng, variant) : buildGazelle(s, rng, variant)
    }, { maxDistance: 280 })
  }
}

export const CAR_TYPES = Object.keys(CAR_INFO)
export { SNOW_VARIANTS }
/** Model name for a car type + snow option. snow: 'none'|'light'|'heavy'|'buried'|'brushed', warm: bool */
export function carModelName(type, snow = 'heavy', warm = false) {
  if (!CAR_INFO[type]) type = 'vaz2107'
  if (warm) return `veh_${type}_warm`
  const suf = { none: '', clean: '', light: '_s1', heavy: '_s2', buried: '_s3', brushed: '_br' }[snow] ?? '_s2'
  return `veh_${type}${suf}`
}
export { loc as carLocal }
