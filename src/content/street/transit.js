// Transit: the Luzhkov-era glass stop pavilion (ad light box, bench, «ОСТАНОВКА» fascia,
// faded interval timetable, a discarded ticket), stop sign poles («А» bus / «Т» trolleybus),
// trolleybus support poles + overhead contact wires (ctx.wires), road signs, and a traffic light
// that cycles by day and flashes yellow late at night.
// Convention: front = local +Z (the pavilion's open side, the face of a sign); pivot bottom-centre.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, seedInt, RNG, rotXZ, localToWorld, reg, angleFacing, getState, groundY } from './lib.js'
import { drawStopPlate, drawRoutes, drawTimetable, drawPoster, posterBySeed, drawRoadSign, drawSignBack, drawFlyer, signLocal } from './signs.js'
import { placeStreetLamp } from './lamps.js'
import { addSeat } from './seating.js'
import { placeLitterBin } from './waste.js'
import { TIMETABLE, TICKET, FLYERS, PLATES } from './texts.js'
import './materials.js'

export const PAVILION_TINTS = [0x474a50, 0x2b3a55, 0x3d4a44, 0x55585c]

// ---- stop pavilion ------------------------------------------------------------------------
function buildPavilion(tube) {
  const W = 20, D = 7, H = 11
  const m = new VoxelModel(W, H, D)
  const f = M('paint'), g = M('glass_clear')
  for (const x of [0, 6, 13, W - 1]) m.fill(x, 0, 0, 1, 9, 1, f)
  for (const x of [0, W - 1]) m.fill(x, 0, D - 1, 1, 9, 1, f)
  // rear glazing with a kick rail and a mid rail
  m.fill(1, 1, 0, W - 2, 7, 1, g)
  for (const x of [6, 13]) m.fill(x, 0, 0, 1, 9, 1, f)
  m.fill(0, 0, 0, W, 1, 1, f); m.fill(0, 4, 0, W, 1, 1, M('paint_matte'))
  // left side glass
  m.fill(0, 1, 1, 1, 7, D - 2, g)
  m.fill(0, 0, 1, 1, 1, D - 2, f)
  // right side: double-sided advertising light box
  m.fill(W - 2, 1, 1, 2, 7, D - 2, M('street_lightbox'))
  m.fill(W - 2, 0, 1, 2, 1, D - 2, f)
  // roof + front fascia
  m.fill(0, 8, 0, W, 1, D, f)
  m.fill(0, 8, D - 1, W, 2, 1, M('paint_matte'))
  m.fill(0, 9, 0, W, 1, D - 1, M('metal_gray'))
  // bench
  m.fill(3, 0, 1, 1, 1, 2, M('metal_dark')); m.fill(14, 0, 1, 1, 1, 2, M('metal_dark'))
  m.fill(3, 1, 1, 12, 1, 2, M('street_galvanized'))
  // tube light under the roof
  m.fill(5, 7, 1, 10, 1, 1, tube ? M('street_tube') : M('plastic_white'))
  m.fill(4, 7, 1, 1, 1, 1, M('metal_gray')); m.fill(15, 7, 1, 1, 1, 1, M('metal_gray'))
  rustify(m, rngFor('pavilion'), [f], 0.07, { bottomBias: 3 })
  snowTop(m, { chance: 0.97, seed: 12, vary: 1 })
  return m
}
defineModel('street_stop_pavilion', () => buildPavilion(true), { lods: [1, 2], lodDistances: [60], maxDistance: 260, occludesSnow: true })
defineModel('street_stop_pavilion_dark', () => buildPavilion(false), { lods: [1, 2], lodDistances: [60], maxDistance: 260, occludesSnow: true })

// ---- poles ----------------------------------------------------------------------------------
defineModel('street_stop_pole', () => {
  const m = new VoxelModel(3, 12, 3)
  m.fill(1, 0, 1, 1, 12, 1, M('street_galvanized'))
  m.fill(0, 4, 2, 3, 3, 1, M('metal_gray')) // timetable box
  m.set(1, 0, 1, M('concrete_dark'))
  snowTop(m, { chance: 0.9, seed: 3 })
  return m
}, { lods: [1], maxDistance: 140 })

defineModel('street_trolley_pole', () => {
  const m = new VoxelModel(1, 37, 3)
  m.fill(0, 0, 1, 1, 36, 1, M('street_galvanized'))
  m.set(0, 0, 1, M('metal_dark'))
  m.set(0, 29, 2, M('metal_dark')) // span-wire eye
  m.set(0, 30, 1, M('metal_dark'))
  m.set(0, 36, 1, M('metal_dark')) // cap
  m.set(0, 6, 1, M('street_paint_white')) // stencilled pole number band
  rustify(m, rngFor('trolleypole'), [M('street_galvanized')], 0.05)
  m.setPivot(0.5, 0, 1.5)
  return m
}, { lods: [1], maxDistance: 400 })

defineModel('street_sign_pole', () => {
  const m = new VoxelModel(1, 11, 1)
  m.fill(0, 0, 0, 1, 11, 1, M('street_galvanized'))
  m.set(0, 10, 0, M('metal_dark'))
  m.set(0, 0, 0, M('concrete_dark'))
  snowTop(m, { chance: 1, seed: 1 })
  return m
}, { lods: [1], maxDistance: 140 })

// ---- traffic light ------------------------------------------------------------------------
defineModel('street_traffic_light', () => {
  const m = new VoxelModel(1, 16, 3)
  m.fill(0, 0, 0, 1, 15, 1, M('street_galvanized'))
  m.fill(0, 11, 1, 1, 5, 1, M('street_paint_black'))
  m.set(0, 15, 2, M('street_paint_black')); m.set(0, 11, 2, M('street_paint_black'))
  snowTop(m, { chance: 1, seed: 2 })
  m.setPivot(0.5, 0, 0.5)
  return m
}, { lods: [1], maxDistance: 160 })
for (const [k, mat] of [['red', 'street_signal_red'], ['yellow', 'street_signal_yellow'], ['green', 'street_signal_green']]) {
  defineModel(`street_tl_${k}`, () => { const m = new VoxelModel(1, 1, 1); m.set(0, 0, 0, M(mat)); return m }, { lods: [1], maxDistance: 220, collide: false, contact: false })
}

const TL_LENS_Y = { red: 14, yellow: 13, green: 12 }

/**
 * Traffic light on a pole, lenses facing `angle`. Daytime cycle (green 12 s, blinking green 3 s,
 * yellow 3 s, red 10 s, red+yellow 2 s; `phase` shifts it, use +15 for the crossing direction);
 * flashing yellow at night from `flashFrom` (default 22:00) to 06:00.
 * opts: { x, z, angle, phase=0, flashFrom=1320, seed }
 */
export function placeTrafficLight(ctx, opts) {
  const angle = opts.angle ?? 0
  const body = put(ctx, 'street_traffic_light', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'traffic_light', seed: opts.seed })
  if (!body) return null
  const lens = {}
  for (const k of ['red', 'yellow', 'green']) {
    const w = body.voxelToWorld(0.5, TL_LENS_Y[k], 2.5)
    lens[k] = put(ctx, `street_tl_${k}`, { x: w.x, z: w.z, y: w.y, angle, flag: 0, collide: false })
  }
  const st = { body, lens, phase: opts.phase ?? 0, flashFrom: opts.flashFrom ?? 22 * 60, level: 0, color: 0xffa818 }
  const [fx, fz] = rotXZ(0, 0.75, angle)
  const ly = body.y + 3.3
  st.light = ctx.lights.add({ x: opts.x + fx, y: ly, z: opts.z + fz, color: 0xffa818, intensity: 2.2, range: 7, type: 'point', schedule: () => st.level, halo: true, haloSize: 0.35, tag: 'traffic_light' })
  getState(ctx).trafficLights.push(st)
  reg(ctx, 'trafficLights', { x: opts.x, z: opts.z, angle, state: st })
  return st
}

const TL_COL = { red: 0xff2a12, yellow: 0xffa818, green: 0x3cffa8 }
export function updateTrafficLights(ctx, dt, state) {
  const mins = ctx.atmos?.minutes ?? 720
  const night = ctx.game?.uniforms?.uNight?.value ?? 0
  const t = state.time
  for (const s of state.trafficLights) {
    let r = 0, y = 0, g = 0
    const flashing = mins >= s.flashFrom || mins < 6 * 60
    if (flashing) y = (t % 1.2) < 0.6 ? 1 : 0
    else {
      const c = ((t + s.phase) % 30 + 30) % 30
      if (c < 12) g = 1
      else if (c < 15) g = (c % 0.8) < 0.4 ? 1 : 0
      else if (c < 18) y = 1
      else if (c < 28) r = 1
      else { r = 1; y = 1 }
    }
    if (s.lens.red) s.lens.red.flag = r
    if (s.lens.yellow) s.lens.yellow.flag = y
    if (s.lens.green) s.lens.green.flag = g
    const col = g ? TL_COL.green : r ? TL_COL.red : TL_COL.yellow
    if (col !== s.color) { s.color = col; s.light.color.setHex(col) }
    s.level = (r || y || g ? 1 : 0) * (0.15 + 0.85 * night)
  }
}

// ---- road signs ---------------------------------------------------------------------------
const SIGN_SHAPE = { crossing: 'square', children: 'triangle', noparking: 'circle', nostopping: 'circle', residential: 'square' }

/**
 * Road sign on a galvanized pole. opts: { x, z, angle (face direction), type: 'crossing'|
 * 'children'|'noparking'|'nostopping'|'residential'|'dogs', plate?: 'children'|'dogs', seed }
 */
export function placeRoadSign(ctx, opts) {
  const angle = opts.angle ?? 0
  const p = put(ctx, 'street_sign_pole', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'sign' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  const type = opts.type ?? 'crossing'
  if (ctx.signs) {
    if (type === 'dogs') {
      signLocal(ctx, o, 0, 1.95, 0.135, { w: 0.6, h: 0.36, ppm: 120, draw: drawRoadSign('dogs'), aged: 0.35, seed: seedInt(opts.seed, 2) })
      signLocal(ctx, o, 0, 1.95, -0.135, { w: 0.6, h: 0.36, ppm: 32, draw: drawSignBack('rect'), flip: true })
    } else {
      const h = type === 'residential' ? 0.9 : 0.62
      const w = type === 'residential' ? 0.6 : 0.62
      signLocal(ctx, o, 0, 2.38, 0.135, { w, h, ppm: 120, draw: drawRoadSign(type), aged: 0.25, seed: seedInt(opts.seed, 4) })
      signLocal(ctx, o, 0, 2.38, -0.135, { w, h, ppm: 32, draw: drawSignBack(SIGN_SHAPE[type] ?? 'rect'), flip: true })
      const plate = opts.plate ?? (type === 'children' ? 'children' : null)
      if (plate) {
        signLocal(ctx, o, 0, 1.86, 0.135, { w: 0.62, h: 0.28, ppm: 120, draw: drawRoadSign(plate === 'children' ? 'childrenPlate' : 'dogs'), aged: 0.3, seed: 3 })
        signLocal(ctx, o, 0, 1.86, -0.135, { w: 0.62, h: 0.28, ppm: 32, draw: drawSignBack('rect'), flip: true })
      }
    }
  }
  reg(ctx, 'roadSigns', { x: opts.x, z: opts.z, angle, type })
  return p
}

// ---- stop pole ------------------------------------------------------------------------------
/**
 * Stop sign pole with «А»/«Т» plate, stop name, route numbers and a timetable box.
 * opts: { x, z, angle (plates face this way: toward the road/approaching traffic), kind:
 * 'bus'|'trolleybus', name, routes: ['36','73'], from, to, seed }
 */
export function placeStopPole(ctx, opts) {
  const angle = opts.angle ?? 0
  const kind = opts.kind === 'bus' ? 'bus' : 'trolleybus'
  const p = put(ctx, 'street_stop_pole', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'stop' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  const name = opts.name ?? 'Улица Берёзовая'
  const routes = opts.routes ?? (kind === 'bus' ? ['648'] : ['36', '73'])
  if (ctx.signs) {
    signLocal(ctx, o, 0, 2.62, 0.135, { w: 0.55, h: 0.55, ppm: 120, draw: drawRoadSign(kind === 'bus' ? 'stop_a' : 'stop_t'), aged: 0.2, seed: 1 })
    signLocal(ctx, o, 0, 2.62, -0.135, { w: 0.55, h: 0.55, ppm: 32, draw: drawSignBack('rect'), flip: true })
    signLocal(ctx, o, 0, 2.14, 0.135, { w: 0.8, h: 0.28, ppm: 120, draw: drawStopPlate(name), aged: 0.2, seed: 2 })
    signLocal(ctx, o, 0, 1.88, 0.135, { w: 0.18 * routes.length, h: 0.18, ppm: 140, draw: drawRoutes(routes, kind), aged: 0.2, seed: 3 })
    const tt = TIMETABLE(routes[0], opts.from ?? 'Ст. м. «Заречная»', opts.to ?? 'мкр. «Восточный»', kind)
    signLocal(ctx, o, 0, 1.38, 0.385, { w: 0.62, h: 0.66, ppm: 180, draw: drawTimetable(tt.ru), aged: 0.6, seed: 4 })
    addReadable(ctx, o, 0, 1.38, 0.4, { ru: tt.ru, en: tt.en, style: 'notice' }, { ru: 'Читать расписание', en: 'Read the timetable' })
  }
  return p
}

function addReadable(ctx, o, lx, ly, lz, note, prompt, size = [0.6, 0.6, 0.6]) {
  if (!ctx.interactions) return null
  const [dx, dz] = rotXZ(lx, lz, o.angle ?? 0)
  return ctx.interactions.add({ x: o.x + dx, y: o.y + ly, z: o.z + dz, size, reach: 2.2, tag: 'readable', prompt: prompt ?? { ru: 'Читать', en: 'Read' }, onUse(game) { game.ui.showNote(note) } })
}

/**
 * Bus/trolleybus stop: pavilion (+ bench, light box ad, timetable, flyers on the glass, a
 * discarded ticket), a stop pole at the kerb end and a litter bin. The open side faces the road
 * (local +Z = `angle`); the pavilion is 5 × 1.75 m. opts: { x, z, angle, name, routes, kind:
 * 'trolleybus'|'bus', from, to, pavilion=true, lit (tube light; default seeded), seed, ticket=true }
 * Registers ctx.registry.stops entry { x, z, angle, name, routes, kind, curb: [x,z] }.
 */
export function placeBusStop(ctx, opts) {
  const seed = seedInt(opts.seed ?? (opts.x * 19 + opts.z * 23), 87)
  const rng = new RNG(seed)
  const angle = opts.angle ?? 0
  const kind = opts.kind === 'bus' ? 'bus' : 'trolleybus'
  const routes = opts.routes ?? (kind === 'bus' ? ['648', '276'] : ['36', '73'])
  const name = opts.name ?? 'Улица Берёзовая'
  const out = { placement: null, pole: null, light: null }
  const o = { x: opts.x, z: opts.z, angle }
  if (opts.pavilion !== false) {
    const lit = opts.lit ?? rng.chance(0.6)
    const p = put(ctx, lit ? 'street_stop_pavilion' : 'street_stop_pavilion_dark', { x: opts.x, z: opts.z, y: opts.y, angle, seed, tint: opts.tint ?? PAVILION_TINTS[rng.int(0, PAVILION_TINTS.length - 1)], tag: 'stop' })
    out.placement = p
    const y = p ? p.y : groundY(ctx, opts.x, opts.z)
    o.y = y
    if (lit && p) {
      const [lx, lz] = rotXZ(0, -0.5, angle)
      const flick = rng.chance(0.3)
      out.light = ctx.lights.add({ x: opts.x + lx, y: y + 1.85, z: opts.z + lz, color: 0xdff4e8, intensity: 7, range: 8, type: 'spot', dir: [0, -1, 0], cone: 80, inner: 40, schedule: 'street', flicker: flick ? 'buzz' : 'none', placement: flick ? null : p, haloSize: 0.6, tag: 'stop_light' })
    }
    if (ctx.signs) {
      // fascia: ОСТАНОВКА + name
      signLocal(ctx, o, 0, 2.25, 0.885, { w: 2.6, h: 0.42, ppm: 100, draw: drawStopPlate(name), aged: 0.25, seed: seed + 1 })
      // light box posters, both faces
      const ad = opts.ad ?? posterBySeed(seed)
      const adBack = posterBySeed(seed + 7)
      const lbx = 2.5 + 0.012
      ctx.signs.add({ ...sideSign(o, lbx, 1.12, 0.0, angle - Math.PI / 2 + Math.PI), w: 1.18, h: 1.68, ppm: 90, draw: drawPoster(ad, seed), emissive: 0.85, schedule: 'street', aged: 0.15, seed })
      ctx.signs.add({ ...sideSign(o, 2.0 - 0.012, 1.12, 0.0, angle - Math.PI / 2), w: 1.18, h: 1.68, ppm: 90, draw: drawPoster(adBack, seed + 7), emissive: 0.85, schedule: 'street', aged: 0.15, seed: seed + 7 })
      addReadable(ctx, o, 2.0 - 0.1, 1.12, 0, { ru: ad.ru, en: ad.en, style: 'sign' }, { ru: 'Смотреть рекламу', en: 'Look at the ad' }, [0.4, 1.6, 1.2])
      // timetable stuck on the inside of the left glass
      const tt = TIMETABLE(routes[0], opts.from ?? 'Ст. м. «Заречная»', opts.to ?? 'мкр. «Восточный»', kind)
      ctx.signs.add({ ...sideSign(o, -2.25 + 0.012, 1.45, 0.05, angle + Math.PI / 2), w: 0.55, h: 0.6, ppm: 180, draw: drawTimetable(tt.ru), aged: 0.65, seed: seed + 3 })
      addReadable(ctx, o, -2.1, 1.45, 0.05, { ru: tt.ru, en: tt.en, style: 'notice' }, { ru: 'Читать расписание', en: 'Read the timetable' }, [0.3, 0.7, 0.7])
      // flyers on the inside of the rear glass
      const nf = rng.int(1, 3)
      for (let i = 0; i < nf; i++) {
        const item = FLYERS[rng.int(0, FLYERS.length - 1)]
        const lx = rng.float(-1.6, 1.0), ly = rng.float(1.1, 1.6)
        signLocal(ctx, { ...o, y: o.y }, lx, ly, -0.875 + 0.25 + 0.012, { w: 0.2, h: 0.28, ppm: 220, draw: drawFlyer(item, seed + 10 + i), aged: 0.4, seed: seed + 10 + i })
        addReadable(ctx, o, lx, ly, -0.6, { ru: `${item.ru}\n\n${item.tab}`, en: item.en, style: 'paper' }, { ru: 'Читать', en: 'Read' }, [0.3, 0.32, 0.25])
      }
    }
    // sit on the pavilion bench
    if (p) addSeat(ctx, { x: opts.x, z: opts.z, angle, seatY: o.y + 0.5, lx: -0.2, lz: -0.375, width: 3.0, depth: 0.55, tag: 'bench' })
    // litter bin by the open end
    const [bx, bz] = localToWorld(o, 2.85, 0.45)
    placeLitterBin(ctx, { x: bx, z: bz, angle, type: rng.chance(0.6) ? 'concrete' : 'metal', seed: seed + 5 })
    // the ticket
    if (opts.ticket !== false) {
      const lx = rng.float(-1.4, 1.2), lz = rng.float(0.1, 0.7)
      const [tx, tz] = localToWorld(o, lx, lz)
      const gy = groundY(ctx, tx, tz)
      if (ctx.signs) ctx.signs.add({ x: tx, y: gy + 0.035, z: tz, angle: angle + rng.float(-1.2, 1.2), w: 0.1, h: 0.06, ppm: 300, double: true, draw: (c, W, H) => { c.fillStyle = '#d8d0b8'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a5a8a'; c.fillRect(0, 0, W, H * 0.3); c.fillStyle = '#222'; c.fillRect(W * 0.1, H * 0.55, W * 0.6, 2) } })
      if (ctx.interactions) ctx.interactions.add({ x: tx, y: gy + 0.08, z: tz, size: [0.35, 0.18, 0.35], reach: 2.0, tag: 'story', prompt: { ru: 'Поднять билет', en: 'Pick up the ticket' }, onUse(game) { game.ui.showNote({ ru: TICKET.ru, en: TICKET.en, style: 'ticket' }) } })
    }
  }
  // stop pole at the kerb end
  // (right-hand traffic arrives from local +X: the pole stands at the downstream end, plates facing it)
  const [px, pz] = localToWorld(o, opts.pavilion === false ? 0 : -3.3, opts.pavilion === false ? 0 : 1.15)
  out.pole = placeStopPole(ctx, { x: px, z: pz, angle: angle + (opts.pavilion === false ? 0 : Math.PI / 2), kind, name, routes, from: opts.from, to: opts.to, seed: seed + 9 })
  const [cx, cz] = localToWorld(o, 0, 2.2)
  reg(ctx, 'stops', { x: opts.x, z: opts.z, angle, name, routes, kind, curb: [cx, cz], placement: out.placement })
  return out
}

function sideSign(o, lx, ly, lz, angle) {
  const [dx, dz] = rotXZ(lx, lz, o.angle)
  return { x: o.x + dx, y: o.y + ly, z: o.z + dz, angle }
}

// ---- trolleybus overhead line ------------------------------------------------------------

/**
 * Trolleybus support poles, span wires and contact-wire pairs along a road centreline.
 * Offsets are lateral, measured to the RIGHT of the travel direction of `points` (negative = left).
 * opts: { points: [[x,z],...], poles: [-16.8, 16.8], median: null|offset (cobra_double lamp there),
 *   pairs: [-12.5, 12.5] (one +/− pair per direction, 0.6 m apart), spacing=30, height=5.8,
 *   spanHeight=7.25, poleType: 'trolley'|'lamp' (steel cobra lamps that also carry the span), seed }
 * Returns { poles: [placements], lamps: [...], contact: [[pts]...] }. Registers registry.trolleyWires.
 */
export function placeTrolleyLine(ctx, opts) {
  const pts = opts.points || []
  const spacing = opts.spacing ?? 30
  const height = opts.height ?? 5.8
  const spanH = opts.spanHeight ?? 7.25
  const polesOff = opts.poles ?? [-16.8, 16.8]
  const pairs = opts.pairs ?? [-12.5, 12.5]
  const seed = seedInt(opts.seed, 5)
  const stations = []
  // resample the polyline every `spacing` metres
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 0.01) continue
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len
    const n = Math.max(1, Math.round(len / spacing))
    for (let i = (s === 0 ? 0 : 1); i <= n; i++) {
      const t = (i / n) * len
      stations.push({ x: x0 + ux * t, z: z0 + uz * t, ux, uz })
    }
  }
  const out = { poles: [], lamps: [], contact: [] }
  const wires = ctx.wires
  const contact = pairs.map(() => [[], []])
  stations.forEach((st, si) => {
    const nx = -st.uz, nz = st.ux // right-hand normal
    const span = []
    const sorted = [...polesOff].sort((a, b) => a - b)
    const anchors = []
    for (const off of sorted) {
      const x = st.x + nx * off, z = st.z + nz * off
      const face = angleFacing(-nx * Math.sign(off), -nz * Math.sign(off))
      if (opts.poleType === 'lamp') {
        const L = placeStreetLamp(ctx, { x, z, angle: face, type: 'cobra', pole: 'steel', seed: seed + si * 7 + off, broken: false })
        out.lamps.push(L)
      } else {
        const p = put(ctx, 'street_trolley_pole', { x, z, angle: face, tag: 'trolley_pole' })
        if (p) out.poles.push(p)
      }
      const gy = groundY(ctx, x, z)
      anchors.push({ off, pt: [x - nx * Math.sign(off) * 0.4, gy + spanH, z - nz * Math.sign(off) * 0.4] })
    }
    if (opts.median !== undefined && opts.median !== null) {
      const x = st.x + nx * opts.median, z = st.z + nz * opts.median
      const L = placeStreetLamp(ctx, { x, z, angle: angleFacing(nx, nz), type: 'cobra_double', seed: seed + si * 13, broken: false })
      out.lamps.push(L)
      const gy = groundY(ctx, x, z)
      anchors.push({ off: opts.median, pt: [x, gy + spanH, z] })
      anchors.sort((a, b) => a.off - b.off)
    }
    for (const a of anchors) span.push(a.pt)
    if (wires && span.length >= 2) wires.add(span, { sag: 0.18, color: 0x2a2a2c })
    // contact wires hang from the span; short droppers
    pairs.forEach((off, k) => {
      for (const side of [0, 1]) {
        const o2 = off + (side ? 0.3 : -0.3)
        const x = st.x + nx * o2, z = st.z + nz * o2
        const gy = Math.min(groundY(ctx, st.x, st.z), 0.25)
        contact[k][side].push([x, gy + height, z])
        if (wires && side === 0) wires.add([[st.x + nx * off, gy + spanH - 0.12, st.z + nz * off], [st.x + nx * off, gy + height + 0.02, st.z + nz * off]], { sag: 0, color: 0x2a2a2c, segments: 1 })
      }
    })
  })
  for (const pair of contact) for (const line of pair) {
    if (line.length >= 2 && wires) wires.add(line, { sag: 0.12, color: 0x3a3530 })
    out.contact.push(line)
    reg(ctx, 'trolleyWires', { points: line, height })
  }
  return out
}
