// Surface works of the underpass: terrain inside our footprint, the four stair pits (holes,
// stairs, parapets, railings, snow drifting onto the first steps), canopies over the north pair,
// red «М» pylons, blue «ПОДЗЕМНЫЙ ПЕРЕХОД» signs, and the stair lamps.

import { defineModel } from '../../core/models.js'
import { CRUST } from '../../core/Terrain.js'
import { MAT } from './materials.js'
import { WB, V, h3 } from './vox.js'
import { valueNoise2 } from '../../core/rng.js'
import { Y, STAIRS, STAIR_LEN, stairTreadY, FOOTPRINT } from './layout.js'
import { paintSidewalk, paintRoad, paintPath } from '../base/api.js'
import { drawMBox, drawNamePlate, drawUnderpassPictogram, drawUnderpassBand } from './drawings.js'

// ---------------------------------------------------------------------------------------------
// Stair pit model (stair-local frame: x 0..4 across, z 0..10 from the entrance, y in world m)
// ---------------------------------------------------------------------------------------------

const RAIL_TOP = 1.5 // world y of the railing top rail (parapet top is 0.5)

function buildStair(covered) {
  const b = new WB(0, Y.SLAB, 0, 4, RAIL_TOP + 0.5, STAIR_LEN)
  const m = b.m
  // treads: solid concrete under each tread, surface voxel on top
  for (let d = 0; d < STAIR_LEN; d += V) {
    const top = stairTreadY(d + 1e-4)
    b.fill(0.5, Y.SLAB, d, 3.5, top, d + V, MAT.concrete)
  }
  for (let k = 0; k < STAIR_LEN / V; k++) {
    const d = k * V
    const top = stairTreadY(d + 1e-4)
    const nose = Math.abs((d % 0.5)) < 1e-6 && (d < 4 || d >= 6) // front row of each tread
    for (let x = 0.5; x < 3.5; x += V) {
      const i = b.ix(x)
      const n = h3(i, k, 3, 11)
      let mat = nose ? MAT.concreteLight : (n < 0.55 ? MAT.concrete : MAT.concreteLight)
      // pram channels near the east wall (flush steel strips)
      if (Math.abs(x - 2.75) < 0.01 || Math.abs(x - 3.0) < 0.01) mat = MAT.metalGray
      // weather: snow drifted in at the top, ice patches, wet grey slush lower down
      const wall = x < 0.75 || x > 3.0
      if (d < (covered ? 0.75 : 1.75)) mat = n < 0.75 || wall ? MAT.snowPacked : MAT.snowDirty
      else if (d < (covered ? 1.5 : 2.75)) mat = n < (wall ? 0.8 : 0.35) ? MAT.snow : mat
      else if (d < 4 && n > 0.86) mat = MAT.ice
      else if (d >= 4 && d < 6 && n > 0.7) mat = MAT.slush
      else if (d >= 8.5 && n > 0.6) mat = MAT.wet
      b.set(x + 0.01, top - V / 2, d + 0.01, mat)
    }
    // a lip of drifted snow along the walls at the top (one voxel, out of the walking line)
    if (d < (covered ? 1.0 : 2.25)) {
      if (h3(1, k, 5) < 0.85) b.set(0.51, top + V / 2, d + 0.01, MAT.snow)
      if (h3(2, k, 5) < 0.7) b.set(3.26, top + V / 2, d + 0.01, MAT.snow)
    }
  }
  // side walls up to the sidewalk, tiled inside; granite parapet cap
  for (const [xo, xi] of [[0, 0.25], [3.75, 3.5]]) {
    b.fill(xo, Y.SLAB, 0, xo + V, Y.SIDEWALK, STAIR_LEN, MAT.concrete)
    b.fill(xi, Y.SLAB, 0, xi + V, Y.SIDEWALK, STAIR_LEN, MAT.tileWhite)
  }
  // portal lintel at the far end (hides the terrain crust face, carries the parapet)
  b.fill(0.5, Y.CEIL, STAIR_LEN - 0.5, 3.5, Y.SIDEWALK, STAIR_LEN, MAT.concrete)
  b.fill(0.5, Y.CEIL, STAIR_LEN - 0.5, 3.5, Y.SIDEWALK, STAIR_LEN - 0.25, MAT.tileWhite)
  b.fill(0, Y.SIDEWALK, 0, 0.5, 0.5, STAIR_LEN, MAT.concreteLight)
  b.fill(3.5, Y.SIDEWALK, 0, 4, 0.5, STAIR_LEN, MAT.concreteLight)
  b.fill(0.5, Y.SIDEWALK, STAIR_LEN - 0.5, 3.5, 0.5, STAIR_LEN, MAT.concreteLight)
  // tiles: beige band low on the walls, a brown stripe, mismatched patches, grime near the steps
  b.each(0.25, Y.SLAB, 0, 3.75, Y.SIDEWALK, STAIR_LEN, (i, j, k) => {
    if (m.get(i, j, k) !== MAT.tileWhite) return
    const y = b.wy(j), d = b.wz(k)
    const tread = stairTreadY(d)
    const above = y - tread
    let mat = MAT.tileWhite
    if (above < 0.75) mat = MAT.tileBeige
    else if (above < 1.0) mat = MAT.tileBrown
    const n = h3(i, j, k, 21)
    if (n > 0.93) mat = MAT.tileCream
    else if (n > 0.9 && above > 1) mat = MAT.concreteLight // missing tiles, cement patch
    if (above < 0.3 && h3(i, j, k, 4) > 0.5) mat = MAT.concreteDark // splash grime
    m.set(i, j, k, mat)
  })
  // handrails inside, on short brackets, 0.9 m above the treads (stepped like the stairs)
  for (let d = 0.25; d < STAIR_LEN - 0.75; d += V) {
    const ty = stairTreadY(d)
    for (const x of [0.5, 3.25]) {
      b.fill(x, ty + 0.75, d, x + V, ty + 1.0, d + V, MAT.metalGray)
      if (Math.abs((d % 1.5) - 0.75) < 0.01) b.fill(x, ty + 0.5, d, x + V, ty + 0.75, d + V, MAT.metalDark)
    }
  }
  // railings on the parapets: posts every ~1.5 m, mid and top rails; across the far end too
  const rail = MAT.metalDark
  for (const x of [0.125, 3.875]) {
    for (let z = 0; z <= STAIR_LEN - 0.25 + 1e-6; z += 1.5) b.fill(x - 0.125, 0.5, z, x + 0.125, RAIL_TOP, z + V, rail)
    b.fill(x - 0.125, 0.5, STAIR_LEN - V, x + 0.125, RAIL_TOP, STAIR_LEN, rail)
    b.fill(x - 0.125, RAIL_TOP - V, 0, x + 0.125, RAIL_TOP, STAIR_LEN, rail)
    b.fill(x - 0.125, 0.75, 0, x + 0.125, 1.0, STAIR_LEN, rail)
  }
  b.fill(0, RAIL_TOP - V, STAIR_LEN - V, 4, RAIL_TOP, STAIR_LEN, rail)
  b.fill(0, 0.75, STAIR_LEN - V, 4, 1.0, STAIR_LEN, rail)
  b.fill(1.375, 0.5, STAIR_LEN - V, 1.625, RAIL_TOP, STAIR_LEN, rail)
  b.fill(2.375, 0.5, STAIR_LEN - V, 2.625, RAIL_TOP, STAIR_LEN, rail)
  if (!covered) {
    // lamp mast at the middle of the far railing with a short arm out over the lower flight
    b.fill(1.875, 0.5, STAIR_LEN - V, 2.125, 2.75, STAIR_LEN, MAT.metalGray)
    b.fill(1.875, 2.5, STAIR_LEN - 1.0, 2.125, 2.75, STAIR_LEN - V, MAT.metalGray)
  }
  // snow on everything exposed above the sidewalk (parapets, rails)
  if (!covered) m.addSnow({ mat: MAT.snow, depth: 1, onlyAbove: b.iy(0.5), seed: 5 })
  else {
    // under the canopy: only the first metre of parapet catches blown snow
    for (const x of [0, 3.75]) for (let z = 0; z < 1.0; z += V) b.fill(x, 0.5, z, x + V, 0.75, z + V, MAT.snow)
  }
  return m
}

defineModel('metro_stair', () => buildStair(false), { contact: false, lods: [1, 2], lodDistances: [60], maxDistance: 220 })
defineModel('metro_stair_covered', () => buildStair(true), { contact: false, lods: [1, 2], lodDistances: [60], maxDistance: 220 })

/** Canopy over a stair: grey steel frame with greenish polycarbonate, sign fascia at the entrance. */
defineModel('metro_canopy', () => {
  const b = new WB(-0.25, 0.5, -0.5, 4.25, 4.0, STAIR_LEN)
  const steel = MAT.metalGray
  // posts on the parapet corners and halfway
  // posts on the inner half of the parapets (the railing posts take the outer half)
  for (const x of [0.25, 3.5]) for (const z of [0, 4.75, STAIR_LEN - 0.5]) b.fill(x, 0.5, z, x + V, 2.75, z + V, steel)
  // perimeter beams and rafters
  b.fill(-0.25, 2.75, -0.5, 4.25, 3.0, -0.25, steel)
  b.fill(-0.25, 2.75, STAIR_LEN - V, 4.25, 3.0, STAIR_LEN, steel)
  b.fill(-0.25, 2.75, -0.5, 0, 3.0, STAIR_LEN, steel)
  b.fill(4.0, 2.75, -0.5, 4.25, 3.0, STAIR_LEN, steel)
  // slightly pitched roof (ridge along the middle) of polycarbonate between ribs
  for (let z = -0.25; z < STAIR_LEN - V; z += V) {
    const rib = Math.abs(((z + 0.25) % 1.5)) < 1e-6
    for (let x = 0; x < 4.0; x += V) {
      const ridge = x >= 1.5 && x < 2.5
      const y = ridge ? 3.0 : 2.75
      b.fill(x, y, z, x + V, y + V, z + V, rib || Math.abs(x - 1.5) < 1e-6 || Math.abs(x - 2.25) < 1e-6 ? steel : MAT.polycarb)
    }
  }
  // fascia at the entrance end (carries the blue sign)
  b.fill(-0.25, 2.25, -0.5, 4.25, 2.75, -0.25, steel)
  b.m.addSnow({ mat: MAT.snow, depth: 1, seed: 9, vary: 1 })
  return b.m
}, { contact: false, occludesSnow: true, maxDistance: 260 })

/** Red «М» pylon: pole, cubic lightbox (sign faces added separately), name plate bracket. */
defineModel('metro_m_pylon', () => {
  const b = new WB(-0.5, 0, -0.5, 0.5, 4.5, 0.5)
  b.fill(-0.125, 0, -0.125, 0.125, 3.0, 0.125, MAT.metalGray)
  b.fill(-0.25, 0, -0.25, 0.25, 0.25, 0.25, MAT.concrete) // footing
  b.fill(-0.5, 3.0, -0.5, 0.5, 4.0, 0.5, MAT.plasticWhite) // lightbox body (faces carry signs)
  b.fill(-0.5, 4.0, -0.5, 0.5, 4.25, 0.5, MAT.metalDark) // cap
  b.fill(-0.375, 2.5, -0.125, 0.375, 2.875, 0.125, MAT.metalDark) // name plate holder
  b.m.addSnow({ mat: MAT.snow, depth: 1, seed: 3 })
  return b.pivot(0, 0, 0)
}, { maxDistance: 320 })

/** Thin sign post (road sign 5.17.2 / text plate). */
defineModel('metro_sign_post', () => {
  const b = new WB(-0.125, 0, -0.125, 0.125, 3.0, 0.125)
  b.fill(-0.125, 0, -0.125, 0.125, 2.75, 0.125, MAT.metalGray)
  b.fill(-0.125, 2.75, -0.125, 0.125, 3.0, 0.125, MAT.snow)
  return b.pivot(0, 0, 0)
}, { maxDistance: 200 })

/** A small wall/canopy lamp over the stair (outdoor fitting). */
defineModel('metro_stair_lamp', () => {
  const b = new WB(-0.25, 0, -0.25, 0.25, 0.5, 0.25)
  b.fill(-0.25, 0.25, -0.25, 0.25, 0.5, 0.25, MAT.metalDark)
  b.fill(-0.125, 0, -0.125, 0.125, 0.25, 0.125, MAT.lampBulb)
  return b.pivot(0, 0, 0)
}, { maxDistance: 160 })

// ---------------------------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------------------------

/** World position of stair-local point (lx, lz) for a stair record. */
export function stairToWorld(st, lx, lz) {
  return st.rot === 0 ? [st.x0 + lx, st.zTop + lz] : [st.x1 - lx, st.zTop - lz]
}
/** Placement origin for a WB model authored in stair-local coordinates with origin (ox, oz). */
function stairPlace(st, ox, oz) {
  return st.rot === 0 ? { x: st.x0 + ox, z: st.zTop + oz, rot: 0 } : { x: st.x1 - ox, z: st.zTop - oz, rot: 2 }
}
/** Sign angle for a face whose stair-local outward normal is (nx, nz). */
function stairAngle(st, nx, nz) {
  const wx = st.rot === 0 ? nx : -nx, wz = st.rot === 0 ? nz : -nz
  return Math.atan2(wx, wz)
}

export function holeRects() {
  return STAIRS.map(st => [st.x0, Math.min(st.zTop, st.zBot), st.x1, Math.max(st.zTop, st.zBot)])
}

/** Paint our footprint (fallback if the avenue package leaves it alone) and cut the stair pits. */
export function paintSurface(ctx) {
  const { terrain } = ctx
  const F = FOOTPRINT
  paintSidewalk(ctx, F.x0, 508, F.x1, 524, 31)
  paintRoad(ctx, { axis: 'x', x0: F.x0, x1: F.x1, z0: 524, z1: 538, lanes: [527.5, 531, 534.5], banks: false, seed: 41 })
  paintRoad(ctx, { axis: 'x', x0: F.x0, x1: F.x1, z0: 542, z1: 556, lanes: [545.5, 549, 552.5], banks: false, seed: 43 })
  terrain.apply(F.x0, 538.25, F.x1, 541.75, (x, z) => ({ h: 1, mat: h3(Math.floor(x * 2), 0, Math.floor(z * 2), 7) > 0.4 ? MAT.snowBank : MAT.snowDirty }))
  terrain.paintRect(F.x0, 538, F.x1, 538.25, MAT.curb)
  terrain.paintRect(F.x0, 541.75, F.x1, 542, MAT.curb)
  paintSidewalk(ctx, F.x0, 556, F.x1, 572, 33)
  // trodden grey slush where everybody turns into the stairs; footpaths north into the district
  for (const st of STAIRS) {
    const za = st.rot === 0 ? 508 : 571, zb = za + 1
    terrain.apply(st.x0 - 1, za, st.x1 + 1, zb, (x, z) => {
      const n = valueNoise2(x * 0.9, z * 0.9, 9)
      return { mat: n > 0.6 ? MAT.snowDirty : n > 0.4 ? MAT.slush : MAT.snowPacked }
    })
  }
  paintPath(ctx, { points: [[379, 508.2], [378.4, 504]], width: 1.6, seed: 61 })
  paintPath(ctx, { points: [[391, 508.2], [391.8, 504]], width: 1.6, seed: 62 })
  for (const r of holeRects()) terrain.holeRect(...r)
}

/**
 * Keep the stair pits open and their walls shallow:
 *  - re-carve our holes right before the world finalizes (a later layout package may paint over
 *    the footprint);
 *  - a terrain hole normally gets 12 m deep side faces, which would wall off the passage at the
 *    foot of each stair; faces bordering our holes are limited to the 1.5 m crust instead.
 * Both are instance-level wrappers (no engine file is touched); see engineRequests.
 */
export function guardTerrain(ctx) {
  const t = ctx.terrain, w = ctx.world
  const rects = holeRects()
  if (!w.__metroGuard && typeof w.finalize === 'function') {
    w.__metroGuard = true
    const fin = w.finalize
    w.finalize = function (...args) {
      try { for (const r of rects) t.holeRect(...r) } catch (e) { console.warn('[metro] re-carve failed', e) }
      return fin.apply(this, args)
    }
  }
  if (!t.__metroGuard && typeof t._sideQuad === 'function') {
    t.__metroGuard = true
    const orig = t._sideQuad
    const x0 = FOOTPRINT.x0 - 1, x1 = FOOTPRINT.x1 + 1, z0 = FOOTPRINT.z0 - 1, z1 = FOOTPRINT.z1 + 1
    t._sideQuad = function (buf, axis, sign, run, corners) {
      if (run && run.lo <= run.h - 48) {
        const len = run.end - run.start
        const ax = run.cx * V, az = run.cz * V
        const bx = axis === 'x' ? ax : ax + len * V, bz = axis === 'x' ? az + len * V : az
        if (ax >= x0 && bx <= x1 && az >= z0 && bz <= z1) run = { ...run, lo: run.h - CRUST }
      }
      return orig.call(this, buf, axis, sign, run, corners)
    }
  }
}

/** A red «М» pylon with its lit faces, the station-name plates and a faint red night glow. */
export function addPylon(ctx, px, pz, py = Y.SIDEWALK, name = 'ЗАРЕЧНАЯ') {
  const { world, signs, lights } = ctx
  const p = world.place('metro_m_pylon', { x: px, z: pz, y: py, tag: 'metro_sign', userData: { pkg: 'metro', noRelocate: true } })
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = Math.atan2(nx, nz)
    signs.add({ x: px + nx * 0.51, y: py + 3.5, z: pz + nz * 0.51, angle: a, w: 0.98, h: 0.98, ppm: 72, draw: drawMBox, emissive: 1.6, schedule: 'always' })
    if (nz !== 0) signs.add({ x: px + nx * 0.135, y: py + 2.69, z: pz + nz * 0.135, angle: a, w: 0.74, h: 0.36, ppm: 72, draw: (c2, W, H) => drawNamePlate(c2, W, H, name), emissive: 0.5, schedule: 'night', aged: 0.15, seed: 3 })
  }
  lights.add({ x: px, y: py + 3.5, z: pz, color: 0xff4630, intensity: 1.2, range: 4.5, schedule: 'night', placement: p, halo: true, haloSize: 0.9, domain: 'outdoor', tag: 'metro_m' })
  return p
}

/** Blue road sign 5.17.2 «подземный пешеходный переход» on a post, with a text plate under it. */
export function addUnderpassSign(ctx, x, z, a, py = Y.SIDEWALK) {
  const { world, signs } = ctx
  const p = world.place('metro_sign_post', { x, z, y: py, tag: 'sign' })
  const nx = Math.sin(a) * 0.14, nz = Math.cos(a) * 0.14
  signs.add({ x: x + nx, y: py + 2.35, z: z + nz, angle: a, w: 0.62, h: 0.62, ppm: 80, draw: drawUnderpassPictogram, aged: 0.2, seed: 5 })
  signs.add({ x: x - nx, y: py + 2.35, z: z - nz, angle: a + Math.PI, w: 0.62, h: 0.62, ppm: 40, draw: (c2, W, H) => { c2.fillStyle = '#8d9092'; c2.fillRect(0, 0, W, H) } })
  signs.add({ x: x + nx, y: py + 1.8, z: z + nz, angle: a, w: 1.2, h: 0.32, ppm: 64, draw: (c2, W, H) => drawUnderpassBand(c2, W, H, ['ПОДЗЕМНЫЙ ПЕРЕХОД']), aged: 0.3, seed: 6 })
  return p
}

/** Place the stairs, canopies, pylons, signs, stair lamps and stair zones. */
export function buildSurface(ctx, out) {
  const { world, signs, lights, zones } = ctx
  for (const st of STAIRS) {
    const p = world.place(st.canopy ? 'metro_stair_covered' : 'metro_stair', { ...stairPlace(st, 0, 0), y: Y.SLAB, tag: 'metro_stair', userData: { pkg: 'metro', noRelocate: true, stair: st.id } })
    out.stairs.push(p)
    if (st.canopy) {
      const c = world.place('metro_canopy', { ...stairPlace(st, -0.25, -0.5), y: 0.5, tag: 'metro_canopy', userData: { pkg: 'metro', noRelocate: true } })
      out.surface.push(c)
      // blue band on the fascia, facing the people walking up to the entrance
      const [fx, fz] = stairToWorld(st, 2, -0.5)
      const fa = stairAngle(st, 0, -1)
      signs.add({ x: fx + Math.sin(fa) * 0.01, y: 2.5, z: fz + Math.cos(fa) * 0.01, angle: fa, w: 3.9, h: 0.42, ppm: 64,
        draw: (c2, W, H) => drawUnderpassBand(c2, W, H, ['ПОДЗЕМНЫЙ ПЕРЕХОД  ·  МЕТРО «ЗАРЕЧНАЯ»']), emissive: 0.25, schedule: 'night', aged: 0.25, seed: 11 })
      // lamp under the canopy near the entrance and one over the lower flight
      for (const [lz, int] of [[1.2, 7], [6.5, 6]]) {
        const [lx2, lz2] = stairToWorld(st, 2, lz)
        const lp = world.place('metro_stair_lamp', { x: lx2, z: lz2, y: 2.25, tag: 'lamp' })
        lights.add({ x: lx2, y: 2.2, z: lz2, color: 0xffd8a0, intensity: int, range: 9, type: 'spot', dir: [0, -1, 0], cone: 75, inner: 40, schedule: 'night', placement: lp, halo: true, haloSize: 0.5, tag: 'metro_stair_light', domain: 'outdoor' })
      }
    } else {
      // open stairs: a lamp hanging from the mast arm over the lower flight
      const [lx2, lz2] = stairToWorld(st, 2, STAIR_LEN - 0.875)
      const lp = world.place('metro_stair_lamp', { x: lx2, z: lz2, y: 2.0, tag: 'lamp' })
      lights.add({ x: lx2, y: 1.95, z: lz2, color: 0xffd09a, intensity: 8, range: 11, type: 'spot', dir: [0, -0.8, st.rot === 0 ? -0.6 : 0.6], cone: 70, inner: 35, schedule: 'night', placement: lp, halo: true, haloSize: 0.5, tag: 'metro_stair_light', domain: 'outdoor' })
    }
    // the red М pylon at the outer corner of the entrance
    const px = st.id.endsWith('W') ? st.x0 - 0.6 : st.x1 + 0.6
    const pz = st.zTop + (st.rot === 0 ? 0.6 : -0.6)
    out.surface.push(addPylon(ctx, px, pz, Y.SIDEWALK))
    // stair zone (outdoor, but the underpass acoustics already start to swallow the street)
    const [ax, az] = stairToWorld(st, 0.5, 0), [bx, bz] = stairToWorld(st, 3.5, STAIR_LEN)
    zones.add({ name: 'underpass_stairs', type: 'underpass', min: [Math.min(ax, bx), -4.6, Math.min(az, bz)], max: [Math.max(ax, bx), 2.6, Math.max(az, bz)],
      reverb: 'underpass', indoor: false, snow: true, wind: 0.45, traffic: 0.75, priority: 1, data: { pkg: 'metro', stair: st.id } })
  }
  // blue road signs 5.17.2 between each pair of entrances
  addUnderpassSign(ctx, 385, 509.6, Math.PI)
  addUnderpassSign(ctx, 385, 570.4, 0)
}
