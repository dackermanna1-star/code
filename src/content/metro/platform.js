// «Заречная» platform hall: a 1970s column station («сороконожка») 100 m long — two rows of
// white-marble columns at 4 m pitch, granite floor with black gabbro bands and a light limit
// line, pale-yellow tiled track walls with the station name in metal capitals, fluorescent
// troughs in the ceiling, benches in the nave, hanging «ВЫХОД В ГОРОД» lightboxes. The lower hall
// at the foot of the escalators, the dead-end east wall, and four single-track tunnels.

import { defineModel } from '../../core/models.js'
import { MAT } from './materials.js'
import { WB, V, h3 } from './vox.js'
import { Y, PLAT, TRACK, LOWER, TUNNEL, ESC } from './layout.js'
import { drawWallLetters, drawLightbox, drawNotice, drawText, SIGN_FONT, PLAIN_FONT } from './drawings.js'
import { T } from './texts.js'

const P0 = Y.PLAT, HC = Y.HALL_CEIL
const COLS = [2, 6, 10, 14, 18] // column centres within a 20 m section

/** Rails (z ranges) of each track. */
export const RAILS = {
  N: [[532.5, 532.75], [534.0, 534.25]],
  S: [[545.75, 546.0], [547.25, 547.5]],
}

function trackFurniture(b, x0, x1, track, outerZ) {
  const T0 = TRACK[track]
  // sleepers every 0.75 m, rails, third rail with its wooden cover on the wall side
  for (let x = x0; x < x1; x += V) {
    const sleeper = Math.abs(((x - x0) % 0.75)) < 1e-6
    if (sleeper) b.fill(x, Y.BED, T0.axis - 1.0, x + V, Y.BED + V, T0.axis + 1.0, MAT.woodDark)
  }
  for (const [z0, z1] of RAILS[track]) {
    b.fill(x0, Y.BED, z0, x1, Y.RAIL - V, z1, MAT.metalRust)
    b.fill(x0, Y.RAIL - V, z0, x1, Y.RAIL, z1, MAT.chrome)
  }
  const tz = outerZ < T0.axis ? T0.axis - 1.75 : T0.axis + 1.5
  b.fill(x0, Y.BED, tz, x1, Y.RAIL, tz + V, MAT.metalGray)
  b.fill(x0, Y.RAIL, tz, x1, Y.RAIL + V, tz + V, MAT.wood)
}

// ---------------------------------------------------------------------------------------------
// Platform hall section (20 m, instanced 5×; variant b is shabbier)
// ---------------------------------------------------------------------------------------------
function hallSection(variant) {
  const b = new WB(0, -18, 530.5, 20, -11.75, 549.5)
  const m = b.m
  b.fill(0, -18, 530.5, 20, -11.75, 549.5, MAT.concrete)
  b.clear(0, P0, PLAT.edgeN, 20, HC, PLAT.edgeS) // platform space
  b.clear(0, Y.BED, PLAT.wallN, 20, HC, PLAT.edgeN) // north track trench
  b.clear(0, Y.BED, PLAT.edgeS, 20, HC, PLAT.wallS) // south track trench
  b.clear(0, Y.BED, PLAT.edgeN, 20, P0 - V, PLAT.edgeN + 0.5) // recess under the edge
  b.clear(0, Y.BED, PLAT.edgeS - 0.5, 20, P0 - V, PLAT.edgeS)
  // drainage gutter along each track axis
  for (const tr of ['N', 'S']) b.fill(0, Y.BED - V, TRACK[tr].axis - 0.125, 20, Y.BED, TRACK[tr].axis + 0.125, MAT.soot)
  // ---- skins before furniture
  const floorAt = (i, j, k) => {
    const x = b.wx(i), z = b.wz(k)
    if (b.wy(j) < P0 - 0.5) return h3(i, j, k, 2) > 0.6 ? MAT.concreteDark : MAT.soot // trench floor
    if (z < PLAT.edgeN + V || z > PLAT.edgeS - V) return MAT.concreteLight // edge stones
    if ((z >= 535.5 && z < 535.75) || (z >= 544.25 && z < 544.5)) return MAT.graniteLight // limit line
    if ((z >= PLAT.colN - 0.25 && z < PLAT.colN + 0.25) || (z >= PLAT.colS - 0.25 && z < PLAT.colS + 0.25)) return MAT.gabbro
    for (const c of COLS) if (Math.abs(x - c) < 0.25 && z > PLAT.colN && z < PLAT.colS) return MAT.gabbro
    const slab = h3(Math.floor(i / 2), 1, Math.floor(k / 2), 5 + variant)
    let mat = slab < 0.6 ? MAT.granite : MAT.graniteLight
    if (z > 538.5 && z < 541.5 && slab > 0.85) mat = MAT.floorTileRed // red granite insets in the nave
    if (variant === 1 && Math.hypot(x - 11, (z - 539.7) * 0.7) < 1.1 && h3(i, 3, k, 4) > 0.2) mat = MAT.wet // drip puddle
    return mat
  }
  const wallAt = (i, j, k, info) => {
    const y = b.wy(j), z = b.wz(k)
    const trackWall = z < PLAT.wallN + 0.01 || z > PLAT.wallS - 0.01
    if (trackWall) {
      if (y < P0) return MAT.soot
      if (y < P0 + 0.5) return MAT.tileBrown
      if (y > HC - 0.75) return MAT.tileBrown
      if (y > -14.75 && y < -14.5) return MAT.tileBrown
      const n = h3(i, j, k, 7 + variant)
      if (variant === 1 && n > 0.985) return MAT.concreteLight // a fallen tile, cemented over
      return n > 0.97 ? MAT.tileCream : MAT.tileYellow
    }
    // under-platform recess and trench walls
    return MAT.soot
  }
  const ceilAt = (i, j, k) => {
    const z = b.wz(k)
    const n = h3(i, j, k, 3)
    if (z < PLAT.edgeN || z > PLAT.edgeS) return n > 0.5 ? MAT.concrete : MAT.whitewash // sooty over the tracks
    return n > 0.93 ? MAT.concreteLight : MAT.whitewash
  }
  b.skin(0, -18, 530.5, 20, -11.75, 549.5, { floor: floorAt, wall: wallAt, ceil: ceilAt })
  // the platform's edge overhang face
  // ---- columns with gabbro plinths and flared capitals
  for (const c of COLS) {
    for (const zc of [PLAT.colN, PLAT.colS]) {
      b.fill(c - 0.25, P0, zc - 0.25, c + 0.25, HC, zc + 0.25, MAT.marbleWhite)
      b.fill(c - 0.25, P0, zc - 0.25, c + 0.25, P0 + V, zc + 0.25, MAT.gabbro)
      b.fill(c - 0.5, HC - V, zc - 0.5, c + 0.5, HC, zc + 0.5, MAT.concreteLight)
      // grey veins in the marble
      b.each(c - 0.25, P0 + V, zc - 0.25, c + 0.25, HC - V, zc + 0.25, (i, j, k) => { if (h3(i, j, k, 31) > 0.9) m.set(i, j, k, MAT.marbleGray) })
      if (variant === 1 && c === 10 && zc === PLAT.colS) b.fill(c - 0.25, P0 + 1.0, zc + V, c, P0 + 1.5, zc + 0.25, MAT.concrete) // chipped facing
    }
    // transverse ceiling beam over the whole hall
    b.fill(c - 0.25, HC - V, PLAT.wallN, c + 0.25, HC, PLAT.wallS, MAT.concreteLight)
  }
  // ---- fluorescent troughs (flush in the ceiling), with dead stretches in variant b
  for (const zt of [538.25, 541.5, 535.75, 544.0]) {
    for (let x = 0; x < 20; x += V) {
      if (COLS.some(c => Math.abs(x + 0.125 - c) < 0.3)) continue
      if (variant === 1 && zt === 541.5 && x > 6.5 && x < 9.5) continue
      b.fill(x, HC, zt, x + V, HC + V, zt + V, MAT.fluorescent)
    }
  }
  // ---- tracks
  trackFurniture(b, 0, 20, 'N', PLAT.wallN)
  trackFurniture(b, 0, 20, 'S', PLAT.wallS)
  // cable trays low on the track walls
  b.fill(0, P0 - 0.25, PLAT.wallN, 20, P0, PLAT.wallN + V, MAT.metalDark)
  b.fill(0, P0 - 0.25, PLAT.wallS - V, 20, P0, PLAT.wallS, MAT.metalDark)
  return m
}
defineModel('metro_hall_a', () => hallSection(0), { indoor: true, occludesSnow: false, contact: false, lods: [1, 2], lodDistances: [80], maxDistance: 220 })
defineModel('metro_hall_b', () => hallSection(1), { indoor: true, occludesSnow: false, contact: false, lods: [1, 2], lodDistances: [80], maxDistance: 220 })

// ---------------------------------------------------------------------------------------------
// Lower hall at the foot of the escalators (x 437–444) and the east end wall
// ---------------------------------------------------------------------------------------------
defineModel('metro_lower_hall', () => {
  const L = LOWER
  const b = new WB(L.x0, -16.75, L.z0 - V, L.x1, -11.75, L.z1 + V)
  b.fill(L.x0, -16.75, L.z0 - V, L.x1, -11.75, L.z1 + V, MAT.concrete)
  b.clear(L.x0, P0, L.z0, L.x1, HC, L.z1)
  b.clear(L.x0, P0, ESC.wallN[1], L.x0 + V, HC, ESC.wallS[0]) // opening to the escalators
  b.skin(L.x0, -16.75, L.z0 - V, L.x1, -11.75, L.z1 + V, {
    floor: (i, j, k) => {
      const z = b.wz(k)
      if (Math.abs(z - 540) < 0.25 || Math.abs(z - L.z0 - 0.375) < 0.13 || Math.abs(z - L.z1 + 0.375) < 0.13) return MAT.gabbro
      return h3(Math.floor(i / 2), 0, Math.floor(k / 2), 2) < 0.6 ? MAT.granite : MAT.graniteLight
    },
    wall: (i, j, k) => {
      const y = b.wy(j) - P0
      if (y < 0.25) return MAT.gabbro
      if (y < 1.5) return MAT.marbleGray
      return MAT.marbleWhite
    },
    ceil: (i, j, k) => (Math.abs(((b.wx(i) - L.x0 - 0.125) % 2)) < 0.2 ? MAT.concreteLight : MAT.whitewash),
  })
  for (const zt of [536.0, 544.0]) b.fill(L.x0 + 0.5, HC, zt, L.x1 - 0.5, HC + V, zt + V, MAT.fluorescent)
  return b.m
}, { indoor: true, contact: false, lods: [1], maxDistance: 160 })

defineModel('metro_hall_end', () => {
  const b = new WB(PLAT.x1, -17.75, PLAT.edgeN + V, PLAT.x1 + 1, -11.75, PLAT.edgeS - V)
  b.fill(PLAT.x1, -17.75, PLAT.edgeN + V, PLAT.x1 + 1, -11.75, PLAT.edgeS - V, MAT.concrete)
  const face = (i, j, k) => {
    const y = b.wy(j) - P0, z = b.wz(k)
    if (y < 0) return MAT.soot
    if (y < 0.25) return MAT.gabbro
    if (z > 541.0 && z < 542.5 && y < 2.25) return MAT.metalGray // service door
    if (y < 1.5) return MAT.marbleGray
    return MAT.marbleWhite
  }
  b.each(PLAT.x1, -17.75, PLAT.edgeN + V, PLAT.x1 + V, -11.75, PLAT.edgeS - V, (i, j, k) => b.m.set(i, j, k, face(i, j, k)))
  return b.m
}, { indoor: true, contact: false, lods: [1], maxDistance: 220 })

// ---------------------------------------------------------------------------------------------
// Tunnels: 64 m single-track boxes. Open end at local x = 64 (lintel up to the hall ceiling),
// closed far end at x = 0. Variant a: outer wall (cables, lamps, third rail) at local −z.
// ---------------------------------------------------------------------------------------------
function tunnel(outerAtMinZ) {
  const W = 4.75
  const b = new WB(0, -17.75, 0, 64, -11.75, W)
  const m = b.m
  b.fill(0, -17.75, 0, 64, -11.75, W, MAT.concrete)
  b.clear(V, Y.BED, V, 64, Y.TUN_CEIL, W - V)
  // lintel at the open end reaches the hall ceiling; elsewhere the box ends at −12.75
  b.clear(0, Y.TUN_CEIL + V, 0, 64 - V, -11.75, W)
  // local axis position (rails at axis ± 0.75)
  const axis = outerAtMinZ ? 2.625 : W - 2.625
  const outer = outerAtMinZ ? V : W - V
  b.skin(0, -17.75, 0, 64, -11.75, W, {
    floor: (i, j, k) => (h3(i, j, k, 4) > 0.75 ? MAT.concreteDark : MAT.soot),
    ceil: (i, j, k) => MAT.soot,
    wall: (i, j, k) => {
      const x = b.wx(i)
      const rib = Math.abs((x % 1.5) - 0.125) < 0.13
      const n = h3(i, j, k, 9)
      if (x > 63.5) return MAT.tileBrown // the portal face toward the platform
      if (n > 0.93) return MAT.metalRust // rust streaks
      if (n > 0.86) return MAT.whitewash // whitewashed patches
      return rib ? MAT.concreteDark : MAT.soot
    },
  })
  for (let x = V; x < 64; x += V) {
    if (Math.abs(((x - V) % 0.75)) < 1e-6) b.fill(x, Y.BED, axis - 1.0, x + V, Y.BED + V, axis + 1.0, MAT.woodDark)
  }
  for (const dz of [-0.875, 0.625]) {
    b.fill(V, Y.BED, axis + dz, 64, Y.RAIL - V, axis + dz + V, MAT.metalRust)
    b.fill(V, Y.RAIL - V, axis + dz, 64, Y.RAIL, axis + dz + V, MAT.chrome)
  }
  const tz = outerAtMinZ ? axis - 1.875 : axis + 1.625
  b.fill(V, Y.BED, tz, 64, Y.RAIL, tz + V, MAT.metalGray)
  b.fill(V, Y.RAIL, tz, 64, Y.RAIL + V, tz + V, MAT.wood)
  // cables in three tiers on the outer wall, on brackets every 2 m, sagging a little
  const cz = outerAtMinZ ? V : W - 2 * V
  for (const h of [-16.25, -15.75, -15.25]) {
    for (let x = V; x < 63.5; x += V) {
      const sag = Math.abs(((x % 2) - 1)) < 0.5 ? -V : 0
      b.fill(x, h + sag, cz, x + V, h + sag + V, cz + V, MAT.rubber)
    }
    for (let x = 1; x < 63.5; x += 2) b.fill(x, h - V, cz, x + V, h + V, cz + V, MAT.metalGray)
  }
  // bulkhead lamps every 16 m (dim warm), and the far end dark and blank
  for (const lx of LAMPS_X) b.fill(lx, -14.5, cz, lx + V, -14.25, cz + V, MAT.lampBulb)
  void outer
  return m
}
export const LAMPS_X = [8, 24, 40, 56]
defineModel('metro_tunnel_a', () => tunnel(true), { indoor: true, contact: false, lods: [1, 2], lodDistances: [60], maxDistance: 200 })
defineModel('metro_tunnel_b', () => tunnel(false), { indoor: true, contact: false, lods: [1, 2], lodDistances: [60], maxDistance: 200 })

/** Bench: oak slats on two granite blocks, back-to-back seats (pivot centre; long axis = x). */
defineModel('metro_bench', () => {
  const b = new WB(-1.5, 0, -0.625, 1.5, 1.0, 0.625)
  for (const x of [-1.25, 0.75]) b.fill(x, 0, -0.5, x + 0.5, 0.5, 0.5, MAT.marbleGray)
  b.fill(-1.5, 0.25, -0.625, 1.5, 0.5, 0.625, MAT.wood)
  b.fill(-1.5, 0.5, -0.125, 1.5, 1.0, 0.125, MAT.woodDark)
  b.each(-1.5, 0.25, -0.625, 1.5, 0.5, 0.625, (i, j, k) => { if (k % 2 === 0) b.m.set(i, j, k, MAT.woodDark) }) // slats
  b.fill(-1.25, 0.25, -0.5, -0.75, 0.5, 0.5, MAT.marbleGray)
  b.fill(0.75, 0.25, -0.5, 1.25, 0.5, 0.5, MAT.marbleGray)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 110 })

/** The interval-clock housing (black box; the digits are a separate canvas mesh). Pivot: back centre. */
defineModel('metro_clock_box', () => {
  const b = new WB(-0.25, -0.25, -0.875, 0, 0.25, 0.875)
  b.fill(-0.25, -0.25, -0.875, 0, 0.25, 0.875, MAT.plasticDark)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, collide: false, lods: [1], maxDistance: 160 })

/** Driver's convex mirror on a pole (pivot: base). */
defineModel('metro_mirror', () => {
  const b = new WB(-0.25, 0, -0.25, 0.25, 2.75, 0.25)
  b.fill(-0.125, 0, -0.125, 0.125, 2.25, 0.125, MAT.metalGray)
  b.fill(-0.25, 2.0, -0.25, 0.25, 2.75, 0.25, MAT.chrome)
  b.fill(-0.25, 2.0, -0.25, 0.25, 2.25, 0.25, MAT.metalDark)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 120 })

// ---------------------------------------------------------------------------------------------
export function buildPlatform(ctx, out) {
  const { world, lights, signs, zones, interactions } = ctx
  const ud = { pkg: 'metro', noRelocate: true }
  const variants = ['a', 'b', 'a', 'a', 'b']
  for (let s = 0; s < PLAT.sections; s++) {
    out.deep.push(world.place('metro_hall_' + variants[s], { x: PLAT.x0 + s * PLAT.sectionLen, y: -18, z: 530.5, rot: 0, tag: 'metro_hall', userData: ud }))
  }
  out.deep.push(world.place('metro_lower_hall', { x: LOWER.x0, y: -16.75, z: LOWER.z0 - V, rot: 0, tag: 'metro_hall', userData: ud }))
  out.deep.push(world.place('metro_hall_end', { x: PLAT.x1, y: -17.75, z: PLAT.edgeN + V, rot: 0, tag: 'metro_hall', userData: ud }))
  // tunnels: west (from the city) open toward +x, east (turnaround) open toward −x
  const tw = TUNNEL.west[0], te = TUNNEL.east[1]
  out.tunnels.push(world.place('metro_tunnel_a', { x: tw, y: -17.75, z: 530.75, rot: 0, tag: 'metro_tunnel', userData: ud }))
  out.tunnels.push(world.place('metro_tunnel_b', { x: tw, y: -17.75, z: 544.5, rot: 0, tag: 'metro_tunnel', userData: ud }))
  out.tunnels.push(world.place('metro_tunnel_b', { x: te, y: -17.75, z: 535.5, rot: 2, tag: 'metro_tunnel', userData: ud }))
  out.tunnels.push(world.place('metro_tunnel_a', { x: te, y: -17.75, z: 549.25, rot: 2, tag: 'metro_tunnel', userData: ud }))
  for (const p of out.tunnels) out.deep.push(p)
  // tunnel lamps (dim, warm) — these are what slide over a train leaving into the dark
  for (const [x0, dir] of [[tw, 1], [te, -1]]) {
    for (const lx of LAMPS_X) {
      const x = dir > 0 ? x0 + lx + 0.125 : x0 - lx - 0.125
      for (const z of [dir > 0 ? 531.2 : 531.2, dir > 0 ? 548.8 : 548.8]) {
        out.lightGroups.tunnel.push(lights.add({ x, y: -14.4, z, color: 0xffc87a, intensity: 0.9, range: 7, domain: 'indoor', halo: true, haloSize: 0.25, scatter: 0.6, tag: 'metro_tunnel_lamp' }))
      }
    }
  }
  // benches in the nave between column pairs
  for (let s = 0; s < PLAT.sections; s++) {
    for (const c of [4, 12]) {
      const x = PLAT.x0 + s * PLAT.sectionLen + c
      const p = world.place('metro_bench', { x, y: P0, z: 540, rot: 0, tag: 'bench', userData: ud })
      out.deep.push(p)
      out.benches.push({ x, z: 540, y: P0 })
      for (const side of [-1, 1]) {
        interactions.add({ x, y: P0 + 0.45, z: 540 + side * 0.4, size: [2.6, 0.5, 0.5], prompt: { ru: 'Сесть', en: 'Sit down' }, tag: 'bench', reach: 2.0,
          onUse(game) { game.player.sit({ x, y: P0 - 0.05, z: 540 + side * 0.35, standPos: new ctx.THREE.Vector3(x, P0, 540 + side * 0.95) }); ctx.events?.emit?.('sit', { x, z: 540, kind: 'metro_bench' }) } })
      }
    }
  }
  // lights: nave centre every 10 m, track sides alternating
  for (let s = 0; s < PLAT.sections; s++) {
    const x0 = PLAT.x0 + s * PLAT.sectionLen
    for (const lx of [5, 15]) out.lightGroups.deep.push(lights.add({ x: x0 + lx, y: HC - 0.4, z: 540, color: 0xe4efe8, intensity: 2.4, range: 12, domain: 'indoor', halo: false, tag: 'metro_platform_light' }))
    out.lightGroups.deep.push(lights.add({ x: x0 + 10, y: HC - 0.4, z: s % 2 ? 534 : 546, color: 0xe4efe8, intensity: 1.6, range: 10, domain: 'indoor', halo: false, tag: 'metro_platform_light' }))
  }
  for (const [x, z] of [[440.5, 538], [440.5, 542]]) out.lightGroups.deep.push(lights.add({ x, y: HC - 0.4, z, color: 0xeaf0ea, intensity: 1.8, range: 8, domain: 'indoor', halo: false, tag: 'metro_platform_light' }))

  // ---- station name on both track walls, in metal capitals
  for (const x of [462, 494, 526]) {
    signs.add({ x, y: -13.85, z: PLAT.wallN + 0.01, angle: 0, w: 4.4, h: 0.55, ppm: 72, draw: (c, W, H) => drawWallLetters(c, W, H, 'ЗАРЕЧНАЯ'), indoor: true })
    signs.add({ x, y: -13.85, z: PLAT.wallS - 0.01, angle: Math.PI, w: 4.4, h: 0.55, ppm: 72, draw: (c, W, H) => drawWallLetters(c, W, H, 'ЗАРЕЧНАЯ'), indoor: true })
  }
  // «ОСТАНОВКА ПЕРВОГО ВАГОНА» plates where each train's head stops
  signs.add({ x: TRACK.N.stopHead - 0.4, y: -14.1, z: PLAT.wallN + 0.01, angle: 0, w: 0.7, h: 0.5, ppm: 90, lines: ['ОСТАНОВКА', 'ПЕРВОГО', 'ВАГОНА'], bg: '#ecebe4', color: '#151515', font: SIGN_FONT, border: '#151515', indoor: true })
  signs.add({ x: TRACK.S.stopHead + 0.4, y: -14.1, z: PLAT.wallS - 0.01, angle: Math.PI, w: 0.7, h: 0.5, ppm: 90, lines: ['ОСТАНОВКА', 'ПЕРВОГО', 'ВАГОНА'], bg: '#ecebe4', color: '#151515', font: SIGN_FONT, border: '#151515', indoor: true })
  // hanging lightboxes in the nave
  for (const x of [468, 508]) {
    out.deep.push(world.place('metro_lightbox', { x, y: HC, z: 540, rot: 0, tag: 'metro_sign', userData: ud }))
    signs.add({ x: x + 0.135, y: HC - 0.5, z: 540, angle: Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['ВЫХОД В ГОРОД', 'к проспекту Строителей, к автобусам'], arrow: 'left', mark: '#c8261c' }), emissive: 1.0, indoor: true })
    signs.add({ x: x - 0.135, y: HC - 0.5, z: 540, angle: -Math.PI / 2, w: 2.2, h: 0.48, ppm: 72, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['ЗАРЕЧНАЯ'], mark: '#c8261c' }), emissive: 1.0, indoor: true })
  }
  // over the escalator foot (seen from the platform) and the direction board
  signs.add({ x: LOWER.x0 + 0.26, y: HC - 0.55, z: 540, angle: Math.PI / 2, w: 4.6, h: 0.5, ppm: 64, draw: (c, W, H) => drawLightbox(c, W, H, { lines: ['ВЫХОД В ГОРОД'], arrow: 'up', mark: '#c8261c' }), emissive: 1.0, indoor: true })
  signs.add({ x: 446.0 + 0.26, y: P0 + 1.9, z: PLAT.colS, angle: Math.PI / 2, w: 0.5 + 0.0, h: 1.6, ppm: 72, indoor: true, draw: (c, W, H) => {
    c.fillStyle = '#e8e6de'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#c8261c'; c.fillRect(0, 0, W, H * 0.08)
    drawText(c, W, H * 0.92, { lines: ['НА ЦЕНТР', '', 'Ул. Строит.', 'Молодёжная', 'Заводская', 'Пл. Труда', 'Театральная'], color: '#1b1b1b', font: PLAIN_FONT, size: 0.07, pad: 3 })
  } })
  interactions.add({ x: 446.4, y: P0 + 1.9, z: PLAT.colS, size: [0.3, 1.6, 0.6], prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ...T.directions, style: 'sign' }) } })
  // east end: service door and the platform-end gate notices
  signs.add({ x: PLAT.x1 - 0.01, y: P0 + 2.5, z: 541.75, angle: -Math.PI / 2, w: 1.2, h: 0.4, ppm: 80, lines: ['СЛУЖЕБНОЕ ПОМЕЩЕНИЕ', 'ВХОД ВОСПРЕЩЁН'], bg: '#e6e4dc', color: '#8a1f18', font: SIGN_FONT, indoor: true, aged: 0.2, seed: 8 })
  for (const z of [PLAT.edgeN + 0.9, PLAT.edgeS - 0.9]) {
    signs.add({ x: PLAT.x1 - 0.01, y: P0 + 1.3, z, angle: -Math.PI / 2, w: 0.8, h: 0.5, ppm: 80, lines: ['ПРОХОД', 'ЗАПРЕЩЁН'], bg: '#c8261c', color: '#f2f0ea', font: SIGN_FONT, indoor: true, aged: 0.2, seed: 9 })
  }
  // fare notice taped to a column, convex mirrors for the drivers
  signs.add({ x: 470.0, y: P0 + 1.5, z: PLAT.colN - 0.26, angle: Math.PI, w: 0.42, h: 0.6, ppm: 96, draw: (c, W, H) => drawNotice(c, W, H, { title: 'ВНИМАНИЕ!', lines: ['С 1 ЯНВАРЯ', '2008 Г.', 'ИЗМЕНЯЕТСЯ', 'СТОИМОСТЬ', 'ПРОЕЗДА'] }), indoor: true, aged: 0.3, seed: 12 })
  interactions.add({ x: 470.0, y: P0 + 1.5, z: PLAT.colN - 0.4, size: [0.45, 0.6, 0.3], prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ...T.fareNotice, style: 'notice' }) } })
  out.deep.push(world.place('metro_mirror', { x: PLAT.x1 - 1.0, y: P0, z: PLAT.edgeN + 0.9, rot: 0, tag: 'metro_prop', userData: ud }))
  out.deep.push(world.place('metro_mirror', { x: PLAT.x0 + 1.0, y: P0, z: PLAT.edgeS - 0.9, rot: 0, tag: 'metro_prop', userData: ud }))

  // ---- zones
  zones.add({ name: 'metro_platform', type: 'metro', min: [LOWER.x0, -18, PLAT.wallN], max: [PLAT.x1 + 1, -11.5, PLAT.wallS], indoor: true,
    reverb: 'metro', snow: false, wind: 0.08, traffic: 0, priority: 1, exposure: 0.8, data: { pkg: 'metro' } })
  for (const [x0, x1] of [TUNNEL.west, TUNNEL.east]) {
    zones.add({ name: 'metro_tunnel', type: 'tunnel', min: [x0, -18, 530.5], max: [x1, -12, 549.5], indoor: true, reverb: 'tunnel', snow: false, wind: 0.2, traffic: 0, priority: 0, data: { pkg: 'metro' } })
  }
  ctx.navPaths.push({ points: [[437, 540], [544, 540]], kind: 'platform', y: P0 })
}
