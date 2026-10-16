// Street lighting: cobra-head sodium lamps on concrete (СВ-95) or steel poles, double-arm median
// poles that also carry trolleybus span wires, courtyard pole lamps (sodium ДНаТ or cold
// mercury ДРЛ), low park lanterns with frosted globes (many smashed), and wall bracket lamps
// over entrances. Each helper places the model, adds a calibrated light linked to the
// placement (so the emissive head dims, warms up and flickers with it) and registers it.
//
// Model convention: pivot = pole axis at ground; the arm/head points to local +Z ("front"),
// so `angle` is the direction the lamp head reaches toward (front faces (sin a, cos a)).

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, rotXZ, seedInt, RNG, reg, groundY } from './lib.js'
import { addPoleFlyer } from './signs.js'
import './materials.js'

const V = 0.25
const SODIUM = 0xff9a3c
const MERCURY = 0xcfe6e8
const INCAND = 0xffc27a

// ---- cobra-head luminaire (ЖКУ) drawn into a model ------------------------------------
// head occupies x∈[hx, hx+2), z∈[z0, z0+4), y∈[y0, y0+2); bowl underneath.
function cobraHead(m, hx, y0, z0, bulb) {
  const housing = M('metal_gray')
  m.fill(hx, y0 + 1, z0, 2, 1, 4, housing) // top shell
  m.fill(hx, y0, z0, 2, 1, 1, housing) // neck / ballast end
  m.fill(hx, y0, z0 + 1, 2, 1, 3, bulb) // bowl
  m.set(hx, y0 + 1, z0 + 3, M('metal_dark')) // slight nose shading
}

function concretePole(m, x, z, h) {
  const pc = M('pole_concrete')
  m.fill(x, 0, z, 1, h, 1, pc)
  // weathering: a darker damp band at the foot, soot near the top, a clamp with rust under it
  m.fill(x, 0, z, 1, 2, 1, M('concrete_dark'))
  m.set(x, h - 4, z, M('metal_dark'))
  m.set(x, h - 5, z, M('concrete_dark'))
}

// Concrete СВ-95 pole, 9.25 m, curved steel bracket to a cobra head.
function buildCobra(poleMat = 'concrete', h = 37) {
  const m = new VoxelModel(2, h + 4, 12)
  if (poleMat === 'concrete') concretePole(m, 0, 0, h)
  else {
    m.fill(0, 0, 0, 1, h, 1, M('street_galvanized'))
    m.fill(0, 0, 0, 1, 1, 1, M('metal_dark')) // flange
    m.set(0, 29, 1, M('metal_dark')) // span-wire eye (shared trolleybus/lighting pole)
  }
  const arm = M(poleMat === 'concrete' ? 'metal_dark' : 'street_galvanized')
  // bracket: clamp on the pole, curving up and out (≈12° rise toward the head)
  m.set(0, h - 2, 1, arm)
  m.set(0, h - 1, 1, arm)
  m.set(0, h, 1, arm)
  m.set(0, h, 2, arm)
  m.set(0, h + 1, 3, arm)
  m.set(0, h + 1, 4, arm)
  m.set(0, h + 1, 5, arm)
  m.set(0, h + 2, 6, arm)
  m.set(0, h + 2, 7, arm)
  cobraHead(m, 0, h + 1, 8, M('lamp_sodium'))
  m.setPivot(0.5, 0, 0.5)
  snowTop(m, { chance: 0.85, seed: h })
  return m
}

// Median pole: steel, two arms, span-wire eyes at 7.25 m on both sides.
function buildCobraDouble() {
  const h = 41
  const m = new VoxelModel(2, h + 4, 23)
  const c = 11
  const g = M('street_galvanized')
  m.fill(0, 0, c, 1, h, 1, g)
  m.fill(0, 0, c, 1, 1, 1, M('metal_dark'))
  m.fill(0, 1, c, 1, 1, 1, M('concrete_dark')) // splash dirt
  for (const s of [1, -1]) {
    const z = k => c + s * k
    m.set(0, h, z(1), g); m.set(0, h + 1, z(2), g); m.set(0, h + 1, z(3), g)
    m.set(0, h + 1, z(4), g); m.set(0, h + 2, z(5), g); m.set(0, h + 2, z(6), g)
    // head 4 long along the arm
    const zz = s > 0 ? c + 7 : c - 10
    m.fill(0, h + 2, zz, 2, 1, 4, M('metal_gray'))
    if (s > 0) { m.fill(0, h + 1, zz, 2, 1, 1, M('metal_gray')); m.fill(0, h + 1, zz + 1, 2, 1, 3, M('lamp_sodium')) } else { m.fill(0, h + 1, zz + 3, 2, 1, 1, M('metal_gray')); m.fill(0, h + 1, zz, 2, 1, 3, M('lamp_sodium')) }
    // span-wire bracket (insulator eye) at 7.25 m
    m.set(0, 29, z(1), M('metal_dark'))
    m.set(0, 29, z(2), M('street_cast_iron'))
  }
  m.set(0, h - 6, c, M('metal_dark'))
  m.setPivot(0.5, 0, c + 0.5)
  snowTop(m, { chance: 0.85, seed: 3 })
  return m
}

// Courtyard pole lamp: 6.5 m painted steel pipe or concrete, short bracket, sodium/mercury head.
function buildCourtyard(pole, bulb) {
  const h = 25
  const m = new VoxelModel(2, h + 4, 8)
  const rng = rngFor('courtyard' + pole + bulb)
  if (pole === 'concrete') concretePole(m, 0, 0, h)
  else {
    m.fill(0, 0, 0, 1, h, 1, M('paint_matte'))
    m.fill(0, 0, 0, 1, 2, 1, M('street_paint_black'))
    rustify(m, rng, [M('paint_matte')], 0.05, { bottomBias: 5 })
  }
  const arm = M(pole === 'concrete' ? 'metal_dark' : 'paint_matte')
  m.set(0, h, 0, arm); m.set(0, h, 1, arm); m.set(0, h + 1, 2, arm); m.set(0, h + 1, 3, arm)
  const housing = M('metal_gray')
  const lamp = M(bulb === 'mercury' ? 'street_lamp_mercury' : 'lamp_sodium')
  if (bulb === 'mercury') {
    // older РКУ: deeper bell-shaped housing
    m.fill(0, h + 2, 3, 2, 1, 4, housing)
    m.fill(0, h + 1, 4, 2, 1, 3, housing)
    m.fill(0, h, 4, 2, 1, 3, lamp)
  } else {
    m.fill(0, h + 2, 3, 2, 1, 4, housing)
    m.fill(0, h + 1, 3, 2, 1, 1, housing)
    m.fill(0, h + 1, 4, 2, 1, 3, lamp)
  }
  m.setPivot(0.5, 0, 0.5)
  snowTop(m, { chance: 0.85, seed: 11 })
  return m
}

// Park lantern: 4 m cast-iron post with a frosted globe; broken variant has a smashed globe.
function buildPark(broken) {
  const m = new VoxelModel(3, 20, 3)
  const ci = M('street_cast_iron')
  m.fill(0, 0, 0, 3, 1, 3, ci)
  m.fill(1, 1, 1, 1, 15, 1, ci)
  m.set(1, 6, 1, M('metal_dark'))
  m.fill(0, 15, 0, 3, 1, 3, ci) // cup
  const g = M('street_lamp_globe')
  if (!broken) {
    m.fill(0, 16, 0, 3, 2, 3, g)
    m.fill(1, 18, 1, 1, 1, 1, g)
    m.set(0, 16, 0, 0); m.set(2, 16, 0, 0); m.set(0, 16, 2, 0); m.set(2, 16, 2, 0)
    m.set(0, 17, 0, 0); m.set(2, 17, 0, 0); m.set(0, 17, 2, 0); m.set(2, 17, 2, 0)
    m.set(1, 19, 1, ci) // finial
  } else {
    // jagged remains of the globe around a bare socket
    m.set(1, 16, 1, M('metal_dark'))
    m.set(0, 16, 1, g); m.set(1, 16, 0, g); m.set(2, 16, 1, g)
    m.set(1, 17, 0, g)
  }
  rustify(m, rngFor('park' + broken), [ci], 0.12)
  snowTop(m, { chance: 0.9, seed: 5 })
  return m
}

// Wall bracket lamp: back plate on the wall (local z=0), arm out, round frosted fixture.
function buildWall(kind) {
  const m = new VoxelModel(3, 3, 3)
  const md = M('metal_dark')
  m.fill(1, 1, 0, 1, 2, 1, md)
  m.set(1, 2, 1, md)
  if (kind === 'cage') {
    m.fill(0, 2, 2, 3, 1, 1, md)
    m.set(1, 1, 2, M('street_lamp_incandescent'))
    m.set(0, 1, 2, md); m.set(2, 1, 2, md)
  } else {
    m.fill(0, 2, 1, 3, 1, 2, M('metal_gray'))
    m.fill(0, 1, 1, 3, 1, 2, M('street_lamp_incandescent'))
    m.set(0, 1, 1, 0); m.set(2, 1, 1, 0)
  }
  m.setPivot(1.5, 0, 0)
  snowTop(m, { chance: 0.8, seed: 2 })
  return m
}

const thin = { lods: [1], contact: false }
defineModel('street_lamp_cobra', () => buildCobra('concrete', 37), { ...thin, maxDistance: 420, contact: true })
defineModel('street_lamp_cobra_steel', () => buildCobra('steel', 41), { ...thin, maxDistance: 420, contact: true })
defineModel('street_lamp_cobra_double', () => buildCobraDouble(), { ...thin, maxDistance: 420, contact: true })
for (const pole of ['metal', 'concrete'])
  for (const bulb of ['sodium', 'mercury'])
    defineModel(`street_lamp_courtyard_${pole}_${bulb}`, () => buildCourtyard(pole, bulb), { ...thin, maxDistance: 300, contact: true })
defineModel('street_lamp_park', () => buildPark(false), { ...thin, maxDistance: 220, contact: true })
defineModel('street_lamp_park_broken', () => buildPark(true), { ...thin, maxDistance: 220, contact: true })
defineModel('street_lamp_wall', () => buildWall('tablet'), { ...thin, maxDistance: 140 })
defineModel('street_lamp_wall_cage', () => buildWall('cage'), { ...thin, maxDistance: 140 })

// ---- helper -----------------------------------------------------------------------------

const BROKEN_P = { cobra: 0.08, cobra_double: 0.05, courtyard: 0.2, park: 0.4, wall: 0.25 }
const FLICKER_P = { cobra: 0.06, cobra_double: 0.04, courtyard: 0.1, park: 0.1, wall: 0.15 }
const POLE_TINTS = [0x6f7a72, 0x5f6b6e, 0x7c7f78, 0x56625a, 0x8a8a82]

/**
 * Place a street lamp with its light.
 * opts: { x, z, y?, angle=0 (direction the head reaches toward), type: 'cobra'|'cobra_double'|
 *   'courtyard'|'park'|'wall', height?, pole?: 'concrete'|'steel'|'metal', bulb?: 'sodium'|'mercury',
 *   broken?: bool (undefined → seeded chance per type), flicker?: bool|'cycle'|'buzz'|'dying',
 *   seed, flyers?: bool, intensity?, tag='lamp' }
 * 'wall': x,z is the wall surface point, angle points away from the wall; y = absolute mount
 * height (default terrain + 2.55 m) — the fixture hangs just below y.
 * Returns { placement, light, lights }.
 */
export function placeStreetLamp(ctx, opts = {}) {
  const type = opts.type ?? 'cobra'
  const seed = seedInt(opts.seed ?? (opts.x * 73.1 + opts.z * 19.7), 99)
  const rng = new RNG(seed)
  const angle = opts.angle ?? 0
  const broken = opts.broken ?? rng.chance(BROKEN_P[type] ?? 0.1)
  let flicker = opts.flicker ?? (!broken && rng.chance(FLICKER_P[type] ?? 0.08))
  const fwd = rotXZ(0, 1, angle)
  const tag = opts.tag ?? 'lamp'
  let model, headY, headF, color = SODIUM, intensity, range, cone = 58, inner = 28, kind = 'spot'
  let tint, schedule = 'street', flickerKind = 'cycle', dir = null, haloSize = 1
  let bulb = opts.bulb
  switch (type) {
    case 'cobra_double': {
      model = 'street_lamp_cobra_double'
      headY = 10.45; headF = 2.25; intensity = 50; range = 24
      break
    }
    case 'courtyard': {
      const pole = opts.pole === 'concrete' ? 'concrete' : opts.pole === 'metal' ? 'metal' : (rng.chance(0.45) ? 'concrete' : 'metal')
      bulb = bulb ?? (rng.chance(0.3) ? 'mercury' : 'sodium')
      model = `street_lamp_courtyard_${pole}_${bulb}`
      tint = POLE_TINTS[rng.int(0, POLE_TINTS.length - 1)]
      headY = bulb === 'mercury' ? 6.2 : 6.45; headF = 1.4; intensity = 30; range = 18; cone = 62; inner = 26
      if (bulb === 'mercury') { color = MERCURY; flickerKind = 'buzz'; intensity = 26 }
      break
    }
    case 'park': {
      model = broken ? 'street_lamp_park_broken' : 'street_lamp_park'
      headY = 4.25; headF = 0; intensity = 9; range = 11; kind = 'point'; color = 0xffb868; flickerKind = 'buzz'; haloSize = 0.7
      break
    }
    case 'wall': {
      model = rng.chance(0.3) ? 'street_lamp_wall_cage' : 'street_lamp_wall'
      headY = 0.3; headF = 0.5; intensity = 8; range = 9; cone = 72; inner = 35; color = INCAND
      schedule = 'night'; flickerKind = 'dying'; haloSize = 0.5
      break
    }
    default: {
      const steel = opts.pole === 'steel' || (opts.height !== undefined && opts.height > 10)
      model = steel ? 'street_lamp_cobra_steel' : 'street_lamp_cobra'
      headY = steel ? 10.45 : 9.45; headF = 2.5; intensity = 55; range = 24
    }
  }
  if (typeof flicker === 'string') { flickerKind = flicker; flicker = true }
  const gy = groundY(ctx, opts.x, opts.z)
  const y = type === 'wall' ? (opts.y ?? gy + 2.55) - 0.75 : opts.y
  const placement = put(ctx, model, { x: opts.x, z: opts.z, y, angle, seed, tint, tag, flag: broken ? 0 : 1 })
  const baseY = placement ? placement.y : gy
  const lights = []
  if (!broken && placement) {
    const mk = (f, yOff = 0) => {
      const lx = opts.x + fwd[0] * f, lz = opts.z + fwd[1] * f
      if (kind === 'spot') {
        // cobra heads tilt up ~12°: throw light slightly forward of the pole
        const tilt = type === 'wall' ? 0.25 : 0.2
        dir = [fwd[0] * Math.sign(f || 1) * tilt, -1, fwd[1] * Math.sign(f || 1) * tilt]
      }
      return ctx.lights.add({
        x: lx, y: baseY + headY + yOff, z: lz, color, intensity: opts.intensity ?? intensity, range, type: kind, dir: dir ?? [0, -1, 0],
        cone, inner, schedule, flicker: flicker ? flickerKind : 'none', placement, tag, haloSize,
      })
    }
    if (type === 'cobra_double') { lights.push(mk(headF), mk(-headF)) } else lights.push(mk(headF))
  }
  // pole flyers (tear-off adverts) on concrete/metal poles in yards
  const wantFlyers = opts.flyers ?? ((type === 'courtyard' || type === 'cobra') && rng.chance(0.3))
  if (wantFlyers && placement && type !== 'wall' && type !== 'park') {
    const n = rng.int(1, 2)
    for (let i = 0; i < n; i++) addPoleFlyer(ctx, { x: opts.x, z: opts.z, y: baseY + 1.45 + i * 0.32 + rng.float(0, 0.12), angle: angle + Math.PI + rng.int(-1, 1) * Math.PI / 2, halfWidth: 0.125, seed: seed + i * 7 })
  }
  const entry = { x: opts.x, z: opts.z, y: baseY, type, placement, light: lights[0] ?? null, lights, broken }
  reg(ctx, 'streetLamps', entry)
  return { placement, light: lights[0] ?? null, lights }
}

/**
 * Lamps evenly along a straight line (sidewalk edge). opts: { x0, z0, x1, z1, spacing=30,
 * angle (head direction; default: perpendicular left of the line), type, seed, ...lamp opts }.
 */
export function placeLampRow(ctx, opts) {
  const dx = opts.x1 - opts.x0, dz = opts.z1 - opts.z0
  const len = Math.hypot(dx, dz)
  const spacing = opts.spacing ?? 30
  const n = Math.max(1, Math.floor(len / spacing) + 1)
  const out = []
  const base = seedInt(opts.seed, 7)
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    out.push(placeStreetLamp(ctx, { ...opts, x: opts.x0 + dx * t, z: opts.z0 + dz * t, seed: base + i * 131 }))
  }
  return out
}

export { SODIUM as SODIUM_COLOR, MERCURY as MERCURY_COLOR }
export const LAMP_SPEC = { V }
