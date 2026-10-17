// The railway along the north edge: double track on the embankment (rails on concrete and
// wooden sleepers), catenary poles every 59.2 m (wrap-periodic) with contact, messenger and
// feeder wires across the whole world, the high platform «Заводская» with its shelter, lamps,
// name board and timetable, the closed ticket booth, the pedestrian level crossing at x 300
// with red signals that flash when a train comes (runtime.js), «Берегись поезда!» signs, a
// relay cabinet, and the chain-link fence along the foot of the embankment.

import { RAIL_SEG, PLAT } from './models.js'
import { RAIL, PLATFORM, CROSSING, CROSS_PATH, GSK, BOILER, WAREHOUSE } from './layout.js'
import { placeFine, nav, reg, safe, HALF_PI, PI } from './lib.js'
import { placeStreetLamp, placeFence, placeLitterBin, placeBench } from '../street/api.js'
import { scatterWeeds, placeTree } from '../nature/api.js'
import { addNotice, addGraffiti, addPoster } from '../phone/api.js'
import { SIGN_FONT, PLAIN_FONT, HAND_FONT } from '../../render/Signs.js'

export const signal = { active: 0, phase: 0, bell: 0 } // updated by runtime.js

const TIMETABLE = {
  ru: 'РАСПИСАНИЕ ДВИЖЕНИЯ ПРИГОРОДНЫХ ПОЕЗДОВ\nплатформа «Заводская»\n\nНа Москву: 5.42 · 6.15 · 6.48 · 7.21 · 7.55 · 8.30 · 9.12 · 10.05 · 11.40 · 13.15 · 14.50 · 16.02 · 17.18 · 18.05 · 18.47 · 19.33 · 20.40 · 21.55 · 23.10\n\nОт Москвы: 6.03 · 7.10 · 8.22 · 9.47 · 11.05 · 12.40 · 14.18 · 15.30 · 16.45 · 17.40 · 18.20 · 19.02 · 19.48 · 20.35 · 21.30 · 22.45 · 0.12\n\nС 10.40 до 13.15 — перерыв в движении поездов по вторникам и четвергам.\nИзменения в расписании — в кассах.',
  en: 'SUBURBAN TRAIN TIMETABLE\n"Zavodskaya" platform\n\nTo Moscow: 5:42 · 6:15 · 6:48 · 7:21 · 7:55 · 8:30 · 9:12 · 10:05 · 11:40 · 13:15 · 14:50 · 16:02 · 17:18 · 18:05 · 18:47 · 19:33 · 20:40 · 21:55 · 23:10\n\nFrom Moscow: 6:03 · 7:10 · 8:22 · 9:47 · 11:05 · 12:40 · 14:18 · 15:30 · 16:45 · 17:40 · 18:20 · 19:02 · 19:48 · 20:35 · 21:30 · 22:45 · 0:12\n\nNo trains 10:40–13:15 on Tuesdays and Thursdays (track maintenance).\nTimetable changes: ask at the ticket office.',
}

function drawTimetable(c, W, H) {
  c.fillStyle = '#e6e3d8'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#1d3a66'; c.fillRect(0, 0, W, H * 0.16)
  c.fillStyle = '#eee'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `bold ${Math.round(H * 0.075)}px ${SIGN_FONT}`
  c.fillText('РАСПИСАНИЕ ДВИЖЕНИЯ', W / 2, H * 0.08)
  c.fillStyle = '#222'; c.textAlign = 'left'
  c.font = `${Math.round(H * 0.05)}px ${PLAIN_FONT}`
  c.fillText('На Москву', W * 0.06, H * 0.23)
  c.fillText('От Москвы', W * 0.54, H * 0.23)
  c.font = `${Math.round(H * 0.04)}px ${PLAIN_FONT}`
  const a = ['5.42', '6.15', '6.48', '7.21', '7.55', '8.30', '9.12', '10.05', '11.40', '13.15', '14.50', '16.02', '17.18', '18.05', '18.47', '19.33', '20.40', '21.55', '23.10']
  const b = ['6.03', '7.10', '8.22', '9.47', '11.05', '12.40', '14.18', '15.30', '16.45', '17.40', '18.20', '19.02', '19.48', '20.35', '21.30', '22.45', '0.12']
  a.forEach((s, i) => c.fillText(s, W * (0.06 + (i % 2) * 0.2), H * (0.3 + Math.floor(i / 2) * 0.062)))
  b.forEach((s, i) => c.fillText(s, W * (0.54 + (i % 2) * 0.2), H * (0.3 + Math.floor(i / 2) * 0.062)))
  c.fillStyle = 'rgba(120,20,20,0.85)'
  c.font = `${Math.round(H * 0.032)}px ${PLAIN_FONT}`
  c.fillText('Вт, Чт 10.40–13.15 — перерыв', W * 0.06, H * 0.94)
}

function drawCross(c, W, H) {
  // «Андреевский крест»: white X with red borders (single-track version is one cross)
  c.clearRect(0, 0, W, H)
  const L = Math.hypot(W, H)
  for (const s of [1, -1]) {
    c.save(); c.translate(W / 2, H / 2); c.rotate(s * Math.atan2(H, W))
    c.fillStyle = '#a3241c'; c.fillRect(-L / 2, -H * 0.13, L, H * 0.26)
    c.fillStyle = '#e8e4da'; c.fillRect(-L / 2 + 6, -H * 0.085, L - 12, H * 0.17)
    c.restore()
  }
}

function drawBeware(c, W, H) {
  c.fillStyle = '#ece8de'; c.fillRect(0, 0, W, H)
  c.strokeStyle = '#a3241c'; c.lineWidth = H * 0.06; c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth)
  c.fillStyle = '#a3241c'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `bold ${Math.round(H * 0.3)}px ${SIGN_FONT}`
  c.fillText('БЕРЕГИСЬ', W / 2, H * 0.34)
  c.fillText('ПОЕЗДА!', W / 2, H * 0.68)
}

/** Rails, catenary, wires (whole world), then the platform & crossing furniture. */
export function buildRailway(ctx) {
  const { world, wires, signs, interactions } = ctx
  const out = { lights: 0 }
  const [zW, zE] = RAIL.tracks
  // ---- rails: 15 m fine-voxel segments on both tracks, x −30 … 670 ---------------------------
  safe('rails', () => {
    for (const z of [zW, zE]) for (let x = -30; x < 670; x += RAIL_SEG) placeFine(ctx, 'north_rail', { x, y: RAIL.bed, z, angle: 0, tag: 'rail' })
  })
  // ---- catenary: poles both sides, cantilevers over the tracks ----------------------------------
  safe('catenary', () => {
    const xs = []
    for (let k = -2; ; k++) { const x = RAIL.poleX0 + k * RAIL.polePitch; if (x > 680) break; if (x > -60) xs.push(x) }
    // south poles: one would stand on the platform deck, so it moves off its west end
    const xsS = xs.map(x => (x + 0.5 > PLATFORM.x0 - 1 && x + 0.5 < PLATFORM.stairsX + 4 ? PLATFORM.x0 - 1.4 : x + 0.5))
    xs.forEach((x, i) => {
      world.place('north_cat_pole', { x, z: RAIL.poleN, y: RAIL.bed, rot: 0, tag: 'catenary', seed: (x * 0.013) % 1 })
      world.place('north_cat_pole', { x: xsS[i], z: RAIL.poleS, y: RAIL.bed, rot: 2, tag: 'catenary', seed: (x * 0.017) % 1 })
    })
    if (wires) {
      for (const [z, side] of [[zW, -1], [zE, 1]]) {
        const contact = [], messenger = []
        xs.forEach((x, i) => {
          const zig = (i % 2 ? 0.2 : -0.2)
          const px = side > 0 ? xsS[i] : x
          contact.push([px, RAIL.contactY, z + zig])
          messenger.push([px, RAIL.messengerY, z])
        })
        wires.add(contact, { sag: 0.04, color: 0x2a2724 })
        wires.add(messenger, { sag: 0.75, color: 0x1e1d1c })
      }
      // feeder on the pole tops (north side) and an earth wire low on the south poles
      wires.add(xs.map(x => [x, RAIL.bed + 10.1, RAIL.poleN - 0.1]), { sag: 0.9, color: 0x1a1a1c })
      wires.add(xsS.map(x => [x, RAIL.bed + 8.0, RAIL.poleS + 0.2]), { sag: 0.7, color: 0x1a1a1c })
    }
    out.poleXs = xs
  })
  ctx.registry.railway = { y: RAIL.railY, tracks: [zW, zE], crossingX: CROSSING.x, platform: { ...PLATFORM, name: 'Заводская' } }

  // ---- platform «Заводская» ------------------------------------------------------------------
  safe('platform', () => {
    const n = Math.round((PLATFORM.x1 - PLATFORM.x0) / PLAT.seg)
    for (let i = 0; i < n; i++) {
      const name = i === 0 ? 'north_platform_west' : (i % 2 ? 'north_platform' : 'north_platform_b')
      world.place(name, { x: PLATFORM.x0 + i * PLAT.seg, z: PLATFORM.z0, y: 0, rot: 0, tag: 'platform' })
    }
    world.place('north_platform_stairs', { x: PLATFORM.stairsX, z: PLATFORM.z0, y: 0, rot: 0, tag: 'platform' })
    const top = PLATFORM.top
    // shelter with a bench (open toward the track), timetable on the inside of the back wall
    const shX = 268.5
    world.place('north_platform_shelter', { x: shX, z: PLATFORM.z1 - 1.375, y: top, rot: 0, tag: 'shelter' })
    signs?.add({ x: shX + 2.2, y: top + 1.75, z: PLATFORM.z1 - 0.265, angle: PI, w: 0.75, h: 1.0, ppm: 160, draw: drawTimetable, aged: 0.5, seed: 61 })
    interactions?.add({ x: shX + 2.2, y: top + 1.75, z: PLATFORM.z1 - 0.6, size: [0.9, 1.1, 0.5], reach: 2.4, prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ...TIMETABLE, style: 'notice' }) } })
    addGraffiti(ctx, { x: shX - 1.9, y: top + 1.75, z: PLATFORM.z1 - 0.265, angle: PI, id: 'gr_tsoi', h: 0.32 })
    // name boards «ЗАВОДСКАЯ» (double-sided, on posts) near both ends
    for (const bx of [252.5, 286.5]) {
      world.place('north_board_posts', { x: bx, z: PLATFORM.z1 - 0.6, y: top, rot: 0, tag: 'sign' })
      signs?.add({ x: bx, y: top + 2.125, z: PLATFORM.z1 - 0.6 - 0.14, angle: PI, w: 2.9, h: 0.68, ppm: 90, lines: ['ЗАВОДСКАЯ'], bg: '#1d3a66', color: '#f2f0ea', font: SIGN_FONT, aged: 0.35, seed: Math.round(bx) })
      signs?.add({ x: bx, y: top + 2.125, z: PLATFORM.z1 - 0.6 + 0.14, angle: 0, w: 2.9, h: 0.68, ppm: 90, lines: ['ЗАВОДСКАЯ'], bg: '#1d3a66', color: '#f2f0ea', font: SIGN_FONT, aged: 0.35, seed: Math.round(bx) + 1 })
    }
    // two concrete lamps at the back edge reaching over the deck; one has given up
    const l1 = placeStreetLamp(ctx, { x: 259.5, z: PLATFORM.z1 - 0.5, y: top, angle: PI, type: 'courtyard', pole: 'concrete', bulb: 'mercury', broken: false, flicker: false, flyers: false, seed: 8101 })
    placeStreetLamp(ctx, { x: 279.5, z: PLATFORM.z1 - 0.5, y: top, angle: PI, type: 'courtyard', pole: 'concrete', bulb: 'mercury', broken: true, flyers: false, seed: 8102 })
    if (l1?.light) out.lights++
    // a bench at the open west end, a bin, notices on the shelter post
    placeBench(ctx, { x: 249.5, z: PLATFORM.z1 - 1.1, y: top, angle: PI, type: 'park', snow: true, seed: 8110 })
    placeLitterBin(ctx, { x: 274.2, z: PLATFORM.z1 - 0.6, y: top, angle: PI, type: 'metal' })
    addNotice(ctx, { x: shX + 3.51, y: top + 1.5, z: PLATFORM.z1 - 0.375, angle: HALF_PI, id: 'notice_vigilance', w: 0.2 })
    // «Выход к ул. Заводской» plate by the stairs
    signs?.add({ x: PLATFORM.stairsX - 3.5, y: top + 0.62, z: PLATFORM.z1 - 0.27, angle: PI, w: 0.9, h: 0.3, ppm: 100, lines: ['Выход к ул. Заводской →'], bg: '#1d3a66', color: '#eee', font: PLAIN_FONT, aged: 0.4, seed: 63 })
    nav(ctx, [[PLATFORM.x0 + 3, 52.5], [PLATFORM.stairsX - 0.5, 52.5], [PLATFORM.stairsX + 1.5, 53.6]], 'platform')
  })

  // ---- ticket booth (closed) east of the path, on the embankment top ---------------------------
  safe('ticket booth', () => {
    const bx = 308.6, bz = 53.2
    world.place('north_ticket_booth', { x: bx, z: bz, y: RAIL.bed, rot: 1, tint: 0x4f6d86, tag: 'building' })
    signs?.add({ x: bx - 1.14, y: RAIL.bed + 2.4, z: bz, angle: -HALF_PI, w: 1.2, h: 0.3, ppm: 100, lines: ['КАССА'], bg: '#1d3a66', color: '#eee', font: SIGN_FONT, aged: 0.5, seed: 64 })
    addNotice(ctx, {
      x: bx - 1.14, y: RAIL.bed + 1.55, z: bz + 0.3, angle: -HALF_PI, w: 0.2, h: 0.15, look: 'handwritten',
      item: { id: 'north_kassa', kind: 'notice', sub: 'plea', look: 'handwritten', style: 'hand', ru: 'Касса не работает.\nБилеты — у контролёров в поезде.', en: 'The ticket office is closed.\nBuy tickets from the inspectors on the train.' },
    })
  })

  // ---- the level crossing ------------------------------------------------------------------------
  safe('crossing', () => {
    world.place('north_crossing_deck', { x: CROSSING.x, z: CROSSING.z0, y: RAIL.bed, rot: 0, tag: 'crossing' })
    // signals: south side faces the approach from the street, north side faces the field
    const sigs = [
      { x: CROSSING.x + 3.6, z: 54.5, rot: 2 },
      { x: CROSSING.x - 3.6, z: 41.6, rot: 0 },
    ]
    out.signalLamps = []
    for (const s of sigs) {
      const p = world.place('north_crossing_signal', { x: s.x, z: s.z, y: RAIL.bed, rot: s.rot, tag: 'signal' })
      const front = s.rot === 2 ? 1 : -1 // world z of the face (south side faces +z)
      // Андреевский крест above the backboard, «Берегись поезда!» below it
      signs?.add({ x: s.x, y: RAIL.bed + 3.06, z: s.z + front * 0.14, angle: s.rot === 2 ? 0 : PI, w: 0.95, h: 0.5, ppm: 120, draw: drawCross, seed: 65 })
      signs?.add({ x: s.x, y: RAIL.bed + 1.45, z: s.z + front * 0.14, angle: s.rot === 2 ? 0 : PI, w: 0.62, h: 0.42, ppm: 140, draw: drawBeware, aged: 0.3, seed: 66 })
      interactions?.add({ x: s.x, y: RAIL.bed + 1.45, z: s.z + front * 0.45, size: [0.8, 0.6, 0.4], reach: 2.4, prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice', onUse(game) { game.ui.showNote({ ru: 'БЕРЕГИСЬ ПОЕЗДА!\n\nПри переходе через пути убедитесь в отсутствии приближающегося поезда.', en: 'BEWARE OF TRAINS!\n\nBefore crossing the tracks make sure no train is approaching.', style: 'sign' }) } })
      for (const k of [0, 1]) {
        const lx = (k ? 0.5 : -0.5) * (s.rot === 2 ? -1 : 1)
        const lp = world.place('north_signal_lamp', { x: s.x + lx, z: s.z + front * 0.25, y: RAIL.bed + 2.25, rot: 0, flag: 0, tag: 'signal_lamp' })
        const L = ctx.lights.add({
          x: s.x + lx, y: RAIL.bed + 2.4, z: s.z + front * 0.6, color: 0xff2a14, intensity: 5, range: 9, type: 'point',
          schedule: () => (signal.active > 0 ? ((signal.phase + k) % 2 === 0 ? signal.active : 0) : 0),
          placement: lp, haloSize: 0.55, scatter: 0.8, tag: 'signal',
        })
        out.signalLamps.push({ placement: lp, light: L })
      }
    }
    world.place('north_relay_box', { x: CROSSING.x + 5.6, z: 54.4, y: RAIL.bed, rot: 2, tag: 'cabinet' })
    addGraffiti(ctx, { x: CROSSING.x + 5.6, y: RAIL.bed + 1.0, z: 54.4 + 0.39, angle: 0, id: 'gr_tag_zubr', h: 0.2, readable: false })
    nav(ctx, [[CROSS_PATH.x, 56.4], [CROSS_PATH.x, 52.2], [CROSS_PATH.x, 44.0], [CROSS_PATH.x + 0.2, 40.2]], 'crossing')
  })

  // ---- chain-link fence along the foot of the embankment where no yard fence runs -----------------
  safe('rail fence', () => {
    const z = RAIL.fenceZ
    const runs = [
      [GSK.x1, BOILER.yard[0]],
      [BOILER.yard[2], CROSS_PATH.x - 3],
      [CROSS_PATH.x + 3, WAREHOUSE.yard[0]],
      [WAREHOUSE.yard[2], 512], [516, 566], [571.5, 612],
    ]
    runs.forEach(([a, b], i) => { if (b - a > 1) placeFence(ctx, { points: [[a, z], [b, z]], type: 'chainlink', seed: 8200 + i }) })
    // dry weeds and self-seeded ash-leaved maples along the embankment foot
    scatterWeeds(ctx, { rect: [458, 56.2, 616, 60], density: 3.5, kinds: { grass: 0.5, burdock: 0.25, tansy: 0.25 }, seed: 8210 })
    scatterWeeds(ctx, { rect: [204, 56.2, 214, 60], density: 3, kinds: { grass: 0.6, burdock: 0.4 }, seed: 8211 })
    for (const [x, zz, v] of [[468, 57.2, 3], [529, 57.4, 4], [593, 57.0, 5], [209, 57.3, 4]]) placeTree(ctx, { x, z: zz, species: 'maple', variant: v, seed: x })
  })
  return out
}
