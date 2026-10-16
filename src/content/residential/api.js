// Public API of the residential package.
//
//   import { placeResidential } from '../residential/api.js'
//   const b = placeResidential(ctx, { series: 'ii49', floors: 9, sections: 4, x: 290, z: 345, rot: 2,
//     enterable: [2], address: { street: 'ул. Берёзовая', house: '12', korpus: '2' } })
//
// (x, z) is the FRONT-LEFT CORNER of the building at grade: the corner of the entrance facade
// where section 0 starts. Sections extend along the building's local +X, the body extends to
// local +Z behind the entrance facade. With rot 0 the entrance facade faces NORTH (−z) and
// the building runs EAST (+x) and SOUTH (+z) from (x, z). rot 1: faces WEST, runs NORTH/EAST…
// see docs/catalog/residential.md for a table.

import './models.js'
import { VOXEL } from '../../core/constants.js'
import { RNG, hash2 } from '../../core/rng.js'
import { SERIES, sectionLayout, G } from './series.js'
import { ensureSectionModel, sectionModelName, VARIANTS } from './models.js'
import { PORCH } from './props.js'
import { RT, tick, addEntranceDoor, setupStairwell, faceAngle } from './runtime.js'
import { drawEntrancePlate, drawHousePlate, drawGableNumber, drawIntercom, drawNotice, NOTICES } from './draw.js'

export { SERIES, sectionLayout, sectionModelName, ensureSectionModel, VARIANTS, RT }

const DOOR_TINTS = [0x5a3e2e, 0x6f7270, 0x2f4a3a, 0x4a3a30, 0x5d6168]
const BRANDS = ['ВИЗАТ', 'ЦИФРОН', 'ЭЛЬТАС', 'МЕТАКС']

/** Footprint/height of a building in meters without placing it (for layout planning). */
export function residentialSize(series, floors, sections = 1) {
  const S = SERIES[series]
  const L = sectionLayout(series, floors ?? S.defaultFloors)
  return {
    length: L.SX * VOXEL * sections,
    depth: L.D * VOXEL,
    frontMargin: L.F * VOXEL + PORCH.D * VOXEL, // porch + balconies in front of the entrance facade
    backMargin: L.B * VOXEL,
    height: L.heightM,
    sectionLength: L.SX * VOXEL,
    flatsPerEntrance: L.flatsPerEntrance,
  }
}

function ensureRuntime(ctx) {
  RT.ctx = ctx
  const g = ctx.game
  if (RT.hooked || !g || !Array.isArray(g.modules)) return
  if (!g.modules.some(m => m.name === 'residential')) {
    g.modules.push({ name: 'residential_runtime', update: (dt, c) => tick(dt, c) })
  }
  RT.hooked = true
}

/**
 * Place a residential building made of `sections` entrances.
 * opts: { series: 'p44'|'ii49'|'1515'|'p44t'|'k7'|'ii32', floors, sections, x, z, rot | angle, y?,
 *   seed, enterable: [sectionIdx], loopStairs: [sectionIdx], address: {street, house, korpus},
 *   firstEntrance (1), firstApartment (1), tint (accent hex), variants: ['a','b',...],
 *   porch: false (skip porches), lampsBroken: 0..1 (share of dead entrance lamps, default 0.2),
 *   homeLight: [sectionIdx] (that stairwell's 1st-floor bulb always works) }
 * → { placements, sections, bounds:{minX,minZ,maxX,maxZ}, entrances:[…], height, length, depth, y }
 */
export function placeResidential(ctx, opts = {}) {
  ensureRuntime(ctx)
  const { world, terrain, lights, signs, navPaths } = ctx
  const series = SERIES[opts.series] ? opts.series : 'ii49'
  const S = SERIES[series]
  const floors = Math.max(2, Math.min(18, Math.round(opts.floors ?? S.defaultFloors)))
  const n = Math.max(1, Math.round(opts.sections ?? 1))
  const angle = opts.angle ?? (opts.rot ?? 0) * Math.PI / 2
  const seed = opts.seed ?? 1
  const L = sectionLayout(series, floors)
  const W = L.SX * VOXEL
  let c = Math.cos(angle), s = Math.sin(angle)
  if (Math.abs(c) < 1e-9) c = 0
  if (Math.abs(s) < 1e-9) s = 0
  const toW = (lx, lz) => [opts.x + lx * c + lz * s, opts.z - lx * s + lz * c]
  // ground level: given, or the lowest terrain along the facades (so nothing floats)
  let y = opts.y
  if (y === undefined) {
    y = Infinity
    for (let t = 0; t <= n * W; t += 2) for (const lz of [-0.4, L.D * VOXEL + 0.4]) {
      const [wx, wz] = toW(Math.min(t, n * W - 0.1), lz)
      const h = terrain.heightAt(wx, wz)
      if (Number.isFinite(h)) y = Math.min(y, h)
    }
    if (!Number.isFinite(y)) y = 0.25
    y = Math.max(0, Math.min(0.5, y))
  }
  const rng = new RNG(hash2((seed * 7919) | 0, n * 31 + floors))
  const tint = opts.tint ?? S.tint
  const addr = opts.address ?? null
  const enterable = new Set(opts.enterable ?? [])
  const loopSet = new Set(opts.loopStairs ?? [])
  const homeLight = new Set(opts.homeLight ?? [])
  const firstEntrance = opts.firstEntrance ?? 1
  const firstApartment = opts.firstApartment ?? 1
  const perEnt = L.flatsPerEntrance
  const out = { placements: [], sections: [], entrances: [], height: L.heightM, length: n * W, depth: L.D * VOXEL, y, series, floors }
  const reg = ctx.registry
  reg.entrances = reg.entrances || []
  reg.buildings = reg.buildings || []
  reg.stairwells = reg.stairwells || []
  const bId = reg.buildings.length
  const doorC = L.door.x0 + 2

  for (let i = 0; i < n; i++) {
    const loop = loopSet.has(i) && floors >= 9
    const ent = enterable.has(i) || loopSet.has(i)
    const mode = loop ? 'loop' : ent ? 'ent' : 'plain'
    const variant = opts.variants?.[i] ?? VARIANTS[(hash2((seed * 1000) | 0, i + 17) >>> 4) % 3]
    const name = ensureSectionModel(series, floors, variant, mode)
    const [px, pz] = toW(i * W, 0)
    const secSeed = ((seed * 0.6180339 + i * 0.1373 + bId * 0.0731) % 1 + 1) % 1
    const number = firstEntrance + i
    const flats = [firstApartment + i * perEnt, firstApartment + (i + 1) * perEnt - 1]
    const p = world.place(name, { x: px, y, z: pz, angle, seed: secSeed, tint, tag: 'building', userData: { residential: true, series, floors, entrance: number, building: bId } })
    out.placements.push(p)
    const sec = { p, L, number, flats, seed: secSeed, mode, address: addr, homeLight: homeLight.has(i) }
    out.sections.push(sec)
    // porch with canopy, entrance door, lamp
    const er = new RNG(hash2((seed * 1000) | 0, number * 131 + bId))
    if (opts.porch !== false) {
      const pv = p.voxelToWorld(doorC, G, L.F)
      out.placements.push(world.place(`res_porch_${VARIANTS[er.int(0, 2)]}`, { x: pv.x, y: pv.y, z: pv.z, angle, seed: secSeed, tag: 'porch' }))
    }
    const dv = p.voxelToWorld(L.door.x0, L.tambourY, L.F)
    const door = world.place('res_door_entrance', { x: dv.x, y: dv.y, z: dv.z, angle, dynamic: ent, tint: er.pick(DOOR_TINTS), tag: 'entrance', userData: { entrance: number, building: bId } })
    out.placements.push(door)
    const lampV = p.voxelToWorld(L.door.x0 - 0.5, G + 10.5, L.F)
    const broken = er.next() < (opts.lampsBroken ?? 0.2)
    const lamp = world.place('res_lamp_entrance', { x: lampV.x, y: lampV.y, z: lampV.z, angle, flag: broken ? 0 : 1, tag: 'lamp' })
    out.placements.push(lamp)
    let light = null
    if (!broken) {
      const lv = p.voxelToWorld(L.door.x0 - 0.5, G + 10.1, L.F - 1.8)
      const r = er.next()
      light = lights.add({ x: lv.x, y: lv.y, z: lv.z, color: 0xffd29a, intensity: 7.5, range: 9.5, type: 'point', schedule: 'night', domain: 'outdoor',
        flicker: r < 0.12 ? 'buzz' : r < 0.2 ? 'dying' : 'none', placement: lamp, halo: true, haloSize: 0.8, tag: 'entrance_lamp' })
    }
    // plate «Подъезд N · кв. a–b», intercom face
    const pl = p.voxelToWorld(doorC, G + 10.5, L.F)
    const fa = faceAngle(p, 0, -1)
    signs.add({ x: pl.x, y: pl.y, z: pl.z, angle: fa, w: 0.5, h: 0.23, ppm: 160, draw: drawEntrancePlate(number, flats[0], flats[1]), aged: 0.25, seed: number })
    const ic = p.voxelToWorld(doorC + 3.5, G + 8, L.F - 1)
    signs.add({ x: ic.x, y: ic.y, z: ic.z, angle: fa, w: 0.17, h: 0.42, ppm: 220, draw: drawIntercom(number * 7 + bId, er.pick(BRANDS)) })
    if (S.chute === 'half') {
      const rf = p.voxelToWorld(L.SX0 - 2.5, G + 9.5, L.F)
      signs.add({ x: rf.x, y: rf.y, z: rf.z, angle: fa, w: 0.6, h: 0.2, ppm: 120, draw: drawNotice([NOTICES.refuse.ru], { paper: '#c8c4b4' }), aged: 0.6, seed: number + 3 })
    }
    const doorRec = addEntranceDoor(ctx, sec, door, { enterable: ent, number, flats })
    sec.door = doorRec
    // where the entrance is, for layout / life / phone packages
    const front = p.voxelToWorld(doorC, G + 2, L.F - PORCH.D - 2)
    const doorPos = p.voxelToWorld(doorC, G + 2, L.F)
    const noticeSpot = p.voxelToWorld(L.door.x0 - 2.5, G + 6.5, L.F)
    const e = {
      index: i, number, building: bId, x: doorPos.x, y: doorPos.y, z: doorPos.z, angle: fa,
      outside: [front.x, front.z], doorPlacement: door, sectionPlacement: p, enterable: ent, loop, flats, address: addr,
      lamp: light, noticeSpot: { x: noticeSpot.x, y: noticeSpot.y, z: noticeSpot.z, angle: fa },
    }
    out.entrances.push(e)
    reg.entrances.push(e)
    const far = p.voxelToWorld(doorC, G, L.F - PORCH.D - 16)
    navPaths.push({ points: [[doorPos.x, doorPos.z], [front.x, front.z], [far.x, far.z]], kind: 'entrance', y })
    // stair window column (world positions) for anomaly directors
    const wins = []
    for (let k = 1; k <= floors; k++) {
      const wv = p.voxelToWorld(L.SX0 + 6, L.HL(k) + 6.5, L.F + 1)
      wins.push([wv.x, wv.y, wv.z])
    }
    reg.stairwells.push({ entrance: number, building: bId, windows: wins, enterable: ent, loop })
    if (ent) sec.stairwell = setupStairwell(ctx, sec)
  }

  // house-number plates at both ends (gables, near the entrance-side corners), painted end numbers
  if (addr) {
    const korp = addr.korpus ? String(addr.korpus) : ''
    const ends = [[out.sections[0].p, 0, -1], [out.sections[n - 1].p, L.SX, 1]]
    for (const [p, gx, dir] of ends) {
      const lit = rng.chance(0.5)
      for (const zz of [L.F + 3.2, L.F + L.D - 3.2]) {
        const v = p.voxelToWorld(gx, G + 12, zz)
        signs.add({ x: v.x, y: v.y, z: v.z, angle: faceAngle(p, dir, 0), w: 0.9, h: 0.5, ppm: 120, emissive: lit ? 0.9 : 0, schedule: 'night',
          draw: drawHousePlate(addr.street ?? '', addr.house ?? '', korp, lit), aged: 0.3, seed: zz | 0 })
      }
      const t = korp ? `${addr.house}/${korp}` : String(addr.house ?? '')
      if (t) {
        const v = p.voxelToWorld(gx, L.topCeil - 6, L.F + L.D / 2)
        signs.add({ x: v.x, y: v.y, z: v.z, angle: faceAngle(p, dir, 0), w: 3.2, h: 1.7, ppm: 40, draw: drawGableNumber(t), aged: 0.4, seed: 9 })
      }
    }
  }

  // bounds (including porches and balconies)
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of out.placements) {
    if (!p) continue
    minX = Math.min(minX, p.aabb[0]); minZ = Math.min(minZ, p.aabb[2]); maxX = Math.max(maxX, p.aabb[3]); maxZ = Math.max(maxZ, p.aabb[5])
  }
  out.bounds = { minX, minZ, maxX, maxZ }
  reg.buildings.push({ id: bId, series, floors, sections: n, address: addr, bounds: out.bounds, height: out.height, entrances: out.entrances.map(e => e.number), x: opts.x, z: opts.z, angle })
  return out
}
