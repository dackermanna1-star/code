// Three escalators from the vestibule (y −4.25) down to the platform level (y −16): the north lane
// runs up, the south lane runs down, the middle one stands still (walkable). Steps are 1 voxel rise
// and 2 voxels run (≈27°). Collision comes from an invisible static staircase; the visible step
// bands of the moving lanes are dynamic placements shifted by a fraction of one step every frame
// (they slide one step diagonally and wrap), and conveyor zones carry the player.

import { defineModel } from '../../core/models.js'
import { MAT } from './materials.js'
import { WB, V, h3 } from './vox.js'
import { Y, ESC, escStepY } from './layout.js'
import { drawPoster, drawText, SIGN_FONT } from './drawings.js'
import { T } from './texts.js'

const X0 = 410, X1 = 437
export const TORSHERY_X = [415, 419.5, 424, 428.5, 433]

/** Ceiling underside of the inclined tunnel at x. */
export function escCeilY(x) {
  if (x < ESC.xTop + 1) return Y.CEIL
  return Math.max(Y.HALL_CEIL, Math.min(Y.CEIL - 0.25, escStepY(x) + 3.25))
}

const inZ = (z, r) => z >= r[0] && z < r[1]

defineModel('metro_escalator', () => {
  const b = new WB(X0, -17, ESC.wallN[0], X1, Y.CEIL_TOP, ESC.wallS[1])
  const m = b.m
  const bals = [ESC.balN, ESC.balA, ESC.balB, ESC.balS]
  for (let i = 0; i < m.sx; i++) {
    const x = b.wx(i) // voxel centre
    const xl = X0 + i * V // voxel left edge
    const ys = escStepY(xl + 1e-6)
    const tunnel = xl >= ESC.xTop + 1
    const yc = escCeilY(xl + 1e-6)
    for (let k = 0; k < m.sz; k++) {
      const z = b.wz(k)
      const col = (y0, y1, mat) => { for (let j = b.iy(y0); j < b.iy(y1); j++) if (j >= 0 && j < m.sy) m.set(i, j, k, mat) }
      const wall = inZ(z, ESC.wallN) || inZ(z, ESC.wallS)
      if (wall) { if (tunnel) col(-17, yc + V, MAT.tileCream); continue }
      if (tunnel) col(yc, yc + V, MAT.whitewash)
      if (xl < ESC.xTop) {
        // inside the vestibule: only the newels of the balustrades
        if (xl >= 410.5 && bals.some(r => inZ(z, r))) col(Y.FLOOR, Y.FLOOR + 1.0, MAT.wood)
        continue
      }
      if (bals.some(r => inZ(z, r))) {
        if (xl >= 436.5) continue
        col(-17, ys + 1.0, MAT.wood)
        continue
      }
      const gap = z < ESC.balN[0] || z >= ESC.balS[1]
      if (gap) { col(-17, ys + V, MAT.metalGray); continue }
      if (xl >= ESC.xBot) { col(-17, Y.PLAT, MAT.granite); continue } // bottom landing
      if (inZ(z, ESC.laneM)) { col(-17, ys, MAT.concrete); continue } // the stopped escalator
      col(-17, ys - 1.0, MAT.soot) // pits under the moving step bands
    }
  }
  // ---- materials: balustrade skirts / panels / handrails, step surfaces, comb plates
  for (let i = 0; i < m.sx; i++) {
    const xl = X0 + i * V
    const ys = escStepY(xl + 1e-6)
    for (let k = 0; k < m.sz; k++) {
      const z = b.wz(k)
      for (let j = 0; j < m.sy; j++) {
        const id = m.get(i, j, k)
        if (!id) continue
        const y = b.wy(j)
        if (id === MAT.wood) {
          const a = y - ys
          if (a > 0.75) m.set(i, j, k, MAT.rubber)
          else if (a < 0.25) m.set(i, j, k, MAT.metalGray)
          else if ((xl >= 436.25 || (xl >= 410.5 && xl < 410.75)) && a < 0.75) m.set(i, j, k, MAT.metalGray) // newel ends
        } else if (id === MAT.concrete && m.get(i, j + 1, k) === 0) {
          // stopped escalator: ribbed aluminium treads with yellow side lines
          const edge = z < ESC.laneM[0] + V || z >= ESC.laneM[1] - V
          m.set(i, j, k, edge ? MAT.metalYellow : MAT.step)
        } else if (id === MAT.granite && m.get(i, j + 1, k) === 0) {
          if (xl < ESC.xBot + 0.5) m.set(i, j, k, MAT.metalGray) // comb plate
          else if (h3(i, j, k, 3) > 0.7) m.set(i, j, k, MAT.graniteLight)
        } else if (id === MAT.tileCream) {
          const a = y - ys
          if (a > 0.7 && a < 1.0) m.set(i, j, k, MAT.tileBrown)
          else if (h3(i, j, k, 8) > 0.95) m.set(i, j, k, MAT.tileBeige)
        } else if (id === MAT.whitewash && Math.abs(((xl - 413) % 1.5)) < 1e-6) {
          m.set(i, j, k, MAT.concreteLight) // ceiling ribs
        }
      }
    }
  }
  // ---- torshery: bronze stalks on the middle balustrades with frosted globes
  for (const tx of TORSHERY_X) {
    const ys = escStepY(tx + 1e-6)
    for (const r of [ESC.balA, ESC.balB]) {
      b.fill(tx, ys + 1.0, r[0] + (r === ESC.balA ? V : 0), tx + V, ys + 2.0, r[0] + (r === ESC.balA ? 2 * V : V), MAT.metalBrown)
      b.fill(tx - V, ys + 2.0, r[0], tx + 2 * V, ys + 2.5, r[1], MAT.lampWarm)
    }
  }
  return m
}, { indoor: true, occludesSnow: false, contact: false, lods: [1, 2], lodDistances: [70], maxDistance: 160 })

/** Invisible collision staircase of one moving lane (1 m wide; placed with visible:false). */
defineModel('metro_esc_collide', () => {
  const b = new WB(ESC.xTop, -16.5, 0, ESC.xBot, Y.FLOOR, 1.0)
  for (let j = 1; j <= ESC.steps; j++) {
    const x0 = ESC.xTop + ESC.run * (j - 1)
    b.fill(x0, -16.5, 0, x0 + ESC.run, ESC.yTop - ESC.rise * j, 1.0, MAT.concrete)
  }
  return b.m
}, { indoor: true, contact: false, lods: [1], maxDistance: 1 })

function band(up) {
  const b = new WB(ESC.xTop - 0.5, -16.75, 0, ESC.xBot + 0.5, Y.FLOOR, 1.0)
  const j0 = up ? 1 : 0, j1 = up ? ESC.steps + 1 : ESC.steps
  for (let j = j0; j <= j1; j++) {
    const x0 = ESC.xTop + ESC.run * (j - 1), top = ESC.yTop - ESC.rise * j
    b.fill(x0, top - 0.75, 0, x0 + ESC.run, top, 1.0, MAT.step)
    b.fill(x0, top - V, 0, x0 + ESC.run, top, V, MAT.metalYellow)
    b.fill(x0, top - V, 1.0 - V, x0 + ESC.run, top, 1.0, MAT.metalYellow)
    b.fill(x0, top - 0.75, 0, x0 + V, top - V, 1.0, MAT.metalDark) // riser shadow line
  }
  return b.m
}
defineModel('metro_esc_band_up', () => band(true), { indoor: true, contact: false, collide: false, dynamic: true, lods: [1], maxDistance: 90 })
defineModel('metro_esc_band_down', () => band(false), { indoor: true, contact: false, collide: false, dynamic: true, lods: [1], maxDistance: 90 })

/** Attendant's glazed booth at the foot of the escalators (pivot: north-west corner, floor). */
defineModel('metro_esc_booth', () => {
  const b = new WB(0, 0, 0, 1.5, 2.5, 1.75)
  b.fill(0, 0, 0, 1.5, 1.0, 1.75, MAT.metalGray)
  b.fill(V, V, V, 1.5 - V, 1.0, 1.75 - V, MAT.air)
  b.fill(0, 1.0, 0, 1.5, 2.0, 1.75, MAT.glass)
  b.fill(V, 1.0, V, 1.5 - V, 2.0, 1.75 - V, MAT.air)
  for (const [x, z] of [[0, 0], [1.25, 0], [0, 1.5], [1.25, 1.5]]) b.fill(x, 0, z, x + V, 2.25, z + V, MAT.metalGray)
  b.fill(0, 2.0, 0, 1.5, 2.25, 1.75, MAT.plasticWhite)
  b.fill(V, V, V, 1.5 - V, 0.75, 0.75, MAT.wood) // console under the west window
  b.fill(0.5, 0.75, 0.25, 0.75, 1.0, 0.5, MAT.lampRed) // emergency stop buttons
  b.fill(0.75, 0.75, 0.25, 1.0, 1.0, 0.5, MAT.lampRed)
  b.fill(1.0, 0.75, 0.25, 1.25, 1.25, 0.5, MAT.metalDark) // gooseneck microphone
  b.fill(0.25, 0.75, 0.5, 0.5, 1.0, 0.75, MAT.lampBulb) // desk lamp
  b.fill(V, V, V, 1.5 - V, 2 * V, 1.75 - V, MAT.linoleum)
  return b.pivot(0, 0, 0)
}, { indoor: true, contact: false, lods: [1], maxDistance: 80 })

const ADS = [
  { band: '#c8261c', title: 'ЕВРОСВЯЗЬ', lines: ['Телефоны', 'от 990 р.'], foot: 'цены поразительные' },
  { band: '#e2b51c', titleColor: '#1b1b1b', title: 'ПЧЕЛАЛАЙН', lines: ['Говори', 'без границ'], foot: 'тариф «Ночной»' },
  { band: '#2b5aa0', title: 'МЕТРО-ЭКСПРЕСС', lines: ['ежедневная', 'бесплатная', 'газета'], foot: 'у входа в метро' },
  { band: '#4a6a3a', title: 'ОКНА ПВХ', lines: ['Замер —', 'бесплатно'], foot: 'тёплый дом к зиме' },
  { band: '#6a2a5a', title: 'ИНСТИТУТ', lines: ['экономики', 'и права', 'Приём 2008'], foot: 'заочное отделение' },
  { band: '#2a6a6a', title: 'КРЕДИТ', lines: ['за 15 минут'], foot: 'без справок' },
]

export function buildEscalators(ctx, out) {
  const { world, lights, signs, zones } = ctx
  const ud = { pkg: 'metro', noRelocate: true }
  out.deep.push(world.place('metro_escalator', { x: X0, y: -17, z: ESC.wallN[0], rot: 0, tag: 'escalator', userData: ud }))
  // invisible collision under the two moving lanes
  for (const r of [ESC.laneN, ESC.laneS]) world.place('metro_esc_collide', { x: ESC.xTop, y: -16.5, z: r[0], rot: 0, visible: false, tag: 'escalator_collide', userData: ud })
  const up = world.place('metro_esc_band_up', { x: ESC.xTop - 0.5, y: -16.75 - 0.01, z: ESC.laneN[0], rot: 0, dynamic: true, collide: false, tag: 'escalator', userData: ud })
  const down = world.place('metro_esc_band_down', { x: ESC.xTop - 0.5, y: -16.75 - 0.01, z: ESC.laneS[0], rot: 0, dynamic: true, collide: false, tag: 'escalator', userData: ud })
  out.deep.push(up, down)
  out.escalators = [
    { lane: 'N', dir: -1, band: up, base: [ESC.xTop - 0.5, -16.75 - 0.01, ESC.laneN[0]], phase: 0, running: true, zone: null },
    { lane: 'S', dir: +1, band: down, base: [ESC.xTop - 0.5, -16.75 - 0.01, ESC.laneS[0]], phase: 0, running: true, zone: null },
  ]
  // torshery lights (warm), along the centre line
  for (const tx of TORSHERY_X) {
    const ys = escStepY(tx + 1e-6)
    out.lightGroups.deep.push(lights.add({ x: tx + 0.125, y: ys + 2.3, z: 540, color: 0xffd6a0, intensity: 1.5, range: 7.5, domain: 'indoor', halo: true, haloSize: 0.35, scatter: 0.4, tag: 'metro_torsher' }))
  }
  // adverts on the tunnel walls between the torshery, and the escalator rules at the head
  ADS.forEach((ad, n) => {
    const x = 414.6 + n * 3.6
    const ys = escStepY(x)
    const north = n % 2 === 0
    signs.add({ x, y: ys + 1.75, z: north ? ESC.wallN[1] + 0.01 : ESC.wallS[0] - 0.01, angle: north ? 0 : Math.PI, w: 1.0, h: 0.75, ppm: 64,
      draw: (c, W, H) => drawPoster(c, W, H, { ...ad, seed: n + 3 }), emissive: 0.45, indoor: true, aged: 0.1, seed: n })
  })
  signs.add({ x: 410.62, y: Y.FLOOR + 0.62, z: 540.75, angle: -Math.PI / 2, w: 0.44, h: 0.3, ppm: 96, indoor: true, draw: (c, W, H) => drawText(c, W, H, { lines: ['СТОЙТЕ СПРАВА', 'ПРОХОДИТЕ СЛЕВА'], bg: '#e9e6dc', color: '#1b1b1b', font: SIGN_FONT }) })
  // zones: the inclined hall, and the two conveyors (priority over everything around)
  zones.add({ name: 'metro_escalator', type: 'metro', min: [ESC.xTop, -16.5, ESC.wallN[0]], max: [X1, -1.4, ESC.wallS[1]], indoor: true,
    reverb: 'hall', snow: false, wind: 0.05, traffic: 0, priority: 2, exposure: 0.8, data: { pkg: 'metro' } })
  const vx = ESC.speed * Math.cos(Math.atan2(ESC.rise, ESC.run))
  out.escalators[0].zone = zones.add({ name: 'metro_escalator_up', type: 'metro', min: [ESC.xTop, -17, ESC.laneN[0]], max: [ESC.xBot, -2, ESC.laneN[1]], indoor: true,
    reverb: 'hall', snow: false, wind: 0.05, traffic: 0, priority: 5, exposure: 0.8, conveyor: [-vx, 0, 0], data: { pkg: 'metro', escalator: 'up' } })
  out.escalators[1].zone = zones.add({ name: 'metro_escalator_down', type: 'metro', min: [ESC.xTop, -17, ESC.laneS[0]], max: [ESC.xBot, -2, ESC.laneS[1]], indoor: true,
    reverb: 'hall', snow: false, wind: 0.05, traffic: 0, priority: 5, exposure: 0.8, conveyor: [vx, 0, 0], data: { pkg: 'metro', escalator: 'down' } })
  out.escSpeedX = vx
  ctx.navPaths.push({ points: [[412, 538.5], [435, 538.5]], kind: 'metro', y: Y.PLAT })
  void T
}
