// The industrial edge (z 58.5–124.5): the garage cooperative ГСК «Мотор-7» (three brick rows
// behind a ПО-2 fence, half-open steel gate, guard booth with a lit window and a chained dog),
// the boiler house № 3 with THE chimney (262, 95) in its fenced yard, the warehouse base
// «СКЛАД № 2» with a lit gate lamp and containers, and the wasteland: transformer kiosk ТП-2417,
// a lonely buzzing mercury lamp, dry weeds, self-seeded maples and a 110 kV line marching
// north-east into the fog.

import {
  placeGarageRow, placeBoilerHouse, boilerCenterForChimney, placeWarehouse, placeGuardBooth, placeSubstation,
} from '../public/api.js'
import { placeFence, placeStreetLamp, placeGarbageArea, placeLitterBin } from '../street/api.js'
import { placeTree, scatterWeeds, plowedPile, addCrows, snowDrift, placeModel } from '../nature/api.js'
import { placeParkedCar } from '../vehicles/api.js'
import { placeStory, DOG_MODELS } from '../life/api.js'
import { fixFine } from '../life/vox.js'
import { addNotice, addGraffiti, addPlate } from '../phone/api.js'
import { SIGN_FONT, PLAIN_FONT } from '../../render/Signs.js'
import { PYLON_ATTACH, PYLON_PEAK } from './models.js'
import { GSK, GSK_ROWS, BOILER, WAREHOUSE, SUBSTATION, PYLONS, LONE_LAMP, VERGE, RAIL } from './layout.js'
import { nav, reg, safe, placeFine, PI, HALF_PI, alongAngle, distToPolyline } from './lib.js'

const FZ = VERGE.fence

/** Steel gate between two concrete posts. leaves: [{hinge:[x,z], rot}] */
function steelGate(ctx, posts, leaves, tint) {
  for (const [x, z] of posts) ctx.world.place('north_gate_post', { x, z, tag: 'gate' })
  for (const l of leaves) ctx.world.place('north_gate_leaf', { x: l.hinge[0], z: l.hinge[1], rot: l.rot, tint, tag: 'gate' })
}

// ---------------------------------------------------------------------------------------------
export function buildGarages(ctx) {
  const out = { lights: 0 }
  const [g0, g1] = GSK.gate
  safe('gsk fence', () => {
    placeFence(ctx, { points: [[g0 - 0.3, FZ], [GSK.x0, FZ], [GSK.x0, GSK.z0], [GSK.x1, GSK.z0], [GSK.x1, FZ], [g1 + 0.3, FZ]], type: 'po2', seed: 7001, graffiti: 0.2 })
    steelGate(ctx, [[g0, FZ], [g1, FZ]], [{ hinge: [g0 + 0.25, FZ], rot: 0 }, { hinge: [g1 - 0.25, FZ], rot: 1 }], 0x4a5a48)
    // the cooperative's plate on the fence, a warning about the dog on the closed leaf
    ctx.signs?.add({ x: g0 - 3.2, y: 1.55, z: FZ + 0.15, angle: 0, w: 1.5, h: 0.5, ppm: 90, lines: [`ГСК «${GSK.name.toUpperCase()}»`, 'ул. Заводская, вл. 7'], bg: '#2a4466', color: '#e8e4d8', font: SIGN_FONT, aged: 0.5, seed: 7002 })
    addNotice(ctx, {
      x: g0 + 1.9, y: 1.35, z: FZ + 0.08, angle: 0, w: 0.3, h: 0.21, flat: true,
      item: { id: 'north_dog', kind: 'notice', sub: 'plea', look: 'handwritten', style: 'hand', ru: 'ОСТОРОЖНО!\nЗЛАЯ СОБАКА', en: 'CAREFUL!\nVICIOUS DOG' },
    })
  })
  safe('gsk rows', () => {
    const opens = [-1, 21, 9]
    GSK_ROWS.forEach((r, i) => {
      const row = placeGarageRow(ctx, { x: r.x, z: r.z, rot: r.rot, y: 0.25, count: r.count, seed: r.seed, brick: r.brick, numberStart: r.n0, name: GSK.name, openIndex: opens[i] })
      if (opens[i] >= 0) out.lights += 2
      if (i === 0) out.row1 = row
    })
    // two bare bulbs under cages over the lanes, far apart (one dying)
    for (const [x, z, a, fl] of [[98.5, 67.8, 0, false], [161.2, 88.55, 0, 'dying']]) {
      const l = placeStreetLamp(ctx, { x, z, y: 0.25 + 2.85, angle: a, type: 'wall', broken: false, flicker: fl, seed: Math.round(x) })
      if (l?.light) out.lights++
    }
    // tags on the end walls facing the gate lane
    addGraffiti(ctx, { x: 190.64, y: 1.4, z: 64.5, angle: HALF_PI, id: 'gr_spartak', h: 0.45 })
    addGraffiti(ctx, { x: 189.0 + 0.02, y: 1.2, z: 85.5, angle: HALF_PI, kind: 'graffiti', seed: 7011, look: 'tag', h: 0.4 })
    addGraffiti(ctx, { x: 57.36, y: 1.3, z: 78.5, angle: -HALF_PI, id: 'gr_koni', h: 0.4 })
  })
  safe('gsk booth', () => {
    placeGuardBooth(ctx, { x: 128.2, z: 120.4, rot: 1, y: 0.25, seed: 7020, label: 'ОХРАНА ГСК' })
    out.lights += 2
    ctx.world.place('north_doghouse', { x: 131.2, z: 122.8, rot: 1, tag: 'story' })
    // the chained dog (the stray's model, standing guard); runtime.js swaps stand/bark frames
    fixFine(DOG_MODELS.stand); fixFine(DOG_MODELS.bark)
    const dog = { x: 129.75, z: 123.35, y: 0.25, angle: -2.2 }
    out.dog = {
      ...dog,
      stand: ctx.world.place(DOG_MODELS.stand, { ...dog, dynamic: true, collide: false, tag: 'dog' }),
      bark: ctx.world.place(DOG_MODELS.bark, { ...dog, dynamic: true, collide: false, visible: false, tag: 'dog' }),
    }
    placeStory(ctx, 'butts', { x: 127.0, z: 122.4, angle: 0.4, seed: 7021, inspect: false })
    placeGarbageArea(ctx, { x: 107.5, z: 122.4, angle: PI, seed: 7022, enclosure: 'metal', count: 2, tree: true, tv: false })
  })
  safe('gsk yard', () => {
    ctx.world.place('north_container', { x: 182.5, z: 110.5, angle: 0.06, tint: 0x6a3a2a, tag: 'container' })
    ctx.world.place('north_container', { x: 189.4, z: 111.2, angle: -0.04, tint: 0x3d5468, tag: 'container' })
    ctx.world.place('north_slabs', { x: 70, z: 108.5, rot: 0, tag: 'slabs' })
    ctx.world.place('north_slabs', { x: 70.6, z: 112.6, rot: 0, tag: 'slabs' })
    ctx.world.place('north_drum', { x: 96, z: 104.5, rot: 1, tag: 'drum' })
    ctx.world.place('north_drum', { x: 98.3, z: 105.2, rot: 0, tag: 'drum' })
    placeParkedCar(ctx, { x: 146, z: 104.5, angle: 0.05, type: 'vaz2106', snow: 'buried', seed: 7031 })
    placeParkedCar(ctx, { x: 152.6, z: 103.8, angle: -0.03, type: 'gazelle_van', snow: 'heavy', seed: 7032 })
    placeParkedCar(ctx, { x: 61.5, z: 114, angle: HALF_PI, type: 'uaz452', snow: 'buried', seed: 7033 })
    placeParkedCar(ctx, { x: 141.5, z: 94.9, angle: HALF_PI, type: 'vaz2107', snow: 'brushed', seed: 7034 })
    plowedPile(ctx, 165, 118.5, { radius: 2.8, height: 2.0, seed: 7035, buried: 'pallet' })
    scatterWeeds(ctx, { rect: [GSK.x0 + 0.6, 96, GSK.x0 + 6, FZ - 0.8], density: 4, kinds: { grass: 0.5, burdock: 0.3, tansy: 0.2 }, seed: 7036 })
    scatterWeeds(ctx, { rect: [GSK.x1 - 7, 92, GSK.x1 - 0.6, FZ - 0.8], density: 3, kinds: { grass: 0.5, burdock: 0.5 }, seed: 7037 })
    for (const [x, z, sp, v] of [[44.5, 96, 'birch', 3], [199.5, 100, 'maple', 3], [200, 118.5, 'birch', 0], [46, 120, 'poplar', 5]]) placeTree(ctx, { x, z, species: sp, variant: v, seed: x * 3 })
    addCrows(ctx, { perch: 'roof', x: 104, y: 3.5, z: 67.35, angle: 0, facing: -HALF_PI, count: 3, seed: 7038 })
  })
  // walkers: the lanes between the rows and the way from the gate
  nav(ctx, [[g1 - 1.6, FZ + 0.6], [g1 - 1.6, 112], [g1 - 1.6, 92.3]], 'path')
  nav(ctx, [[58, 92.3], [g1 - 1.6, 92.3], [190, 92.3]], 'path')
  nav(ctx, [[57, 71.4], [190, 71.4]], 'path')
  nav(ctx, [[192.5, 92.3], [194.5, 82], [192.5, 71.4]], 'path')
  ctx.zones?.add({ name: 'garages', min: [54, -1, 61], max: [191, 12, 96], reverb: 'courtyard', wind: 0.7, traffic: 0.6, data: { pkg: 'north' } })
  reg(ctx, 'storySpots', { kind: 'guard_dog', x: 129.75, z: 123.35, pkg: 'north' })
  return out
}

// ---------------------------------------------------------------------------------------------
export function buildBoiler(ctx) {
  const out = { lights: 8 }
  const [bx, bz] = boilerCenterForChimney(BOILER.chimney[0], BOILER.chimney[1], BOILER.rot)
  safe('boiler house', () => {
    out.house = placeBoilerHouse(ctx, { x: bx, z: bz, rot: BOILER.rot, y: 0.25, seed: 5, number: 3 })
  })
  safe('boiler fence', () => {
    const [x0, z0, x1] = BOILER.yard
    const [w0, w1] = BOILER.wicket, [g0, g1] = BOILER.gate
    placeFence(ctx, { points: [[w0, FZ], [x0, FZ], [x0, z0], [x1, z0], [x1, FZ], [g1 - 0.6, FZ]], type: 'po2', seed: 7101, graffiti: 0.18 })
    placeFence(ctx, { points: [[w1, FZ], [g0 + 0.6, FZ]], type: 'po2', seed: 7102, graffiti: 0.3 })
    steelGate(ctx, [[g0 + 0.4, FZ], [g1 - 0.4, FZ]], [{ hinge: [g0 + 0.65, FZ], rot: 1 }, { hinge: [g1 - 0.65, FZ], rot: 1 }], 0x5d4a3a)
    for (const x of [w0 - 0.1, w1 + 0.1]) ctx.world.place('north_gate_post', { x, z: FZ, tag: 'gate' })
    addNotice(ctx, { x: g0 - 2.2, y: 1.45, z: FZ + 0.15, angle: 0, id: 'notice_heating' })
  })
  safe('boiler yard', () => {
    placeParkedCar(ctx, { x: 233, z: 113.5, angle: -HALF_PI, type: 'uaz452', snow: 'light', tint: 0xd8cf9a, seed: 7111 })
    ctx.world.place('north_slabs', { x: 226, z: 78, rot: 1, tag: 'slabs' })
    ctx.world.place('north_drum', { x: 231, z: 84.5, rot: 0, tag: 'drum' })
    ctx.world.place('north_container', { x: 284.5, z: 72, rot: 1, tint: 0x55606a, tag: 'container' })
    plowedPile(ctx, 222.5, 104, { radius: 3.2, height: 2.4, seed: 7112, buried: 'yolka' })
    plowedPile(ctx, 287, 92, { radius: 2.6, height: 1.9, seed: 7113 })
    placeStory(ctx, 'cat', { x: 275.5, z: 117.42, angle: 0, y: 0.55, note: true, seed: 7114 })
    placeStory(ctx, 'butts', { x: 251.6, z: 118.3, angle: 0.2, seed: 7115, inspect: false })
    placeStory(ctx, 'bicycle', { x: 252.6, z: FZ + 0.7, angle: HALF_PI, seed: 7116 })
    placeLitterBin(ctx, { x: 246.2, z: FZ + 0.65, angle: 0, type: 'concrete' })
    // the gas supply: a yellow regulator cabinet by the fence and the yellow pipe on posts into the annex
    ctx.world.place('north_gas_cabinet', { x: 240.5, z: 122.6, rot: 2, tag: 'cabinet' })
    ctx.signs?.add({ x: 240.5, y: 0.25 + 1.0, z: 122.6 + 0.39, angle: 0, w: 0.5, h: 0.32, ppm: 140, lines: ['ГАЗ', 'ОГНЕОПАСНО'], bg: '#e2c23a', color: '#a3241c', font: SIGN_FONT, aged: 0.4, seed: 7120 })
    for (let k = 0; k < 3; k++) placeFine(ctx, 'north_gas_pipe', { x: 240.5, z: 121.8 - k * 3, y: 0.25, angle: HALF_PI, tag: 'gas_pipe' })
    for (let k = 0; k < 2; k++) placeFine(ctx, 'north_gas_pipe', { x: 240.5 + k * 3, z: 112.8, y: 0.25, angle: 0, tag: 'gas_pipe' })
    scatterWeeds(ctx, { rect: [BOILER.yard[0] + 0.6, 60, BOILER.yard[0] + 5, 96], density: 3, kinds: { grass: 0.5, burdock: 0.5 }, seed: 7117 })
    for (const [x, z, sp, v] of [[218, 64, 'birch', 1], [289, 64.5, 'maple', 4], [217.5, 120, 'poplar', 4]]) placeTree(ctx, { x, z, species: sp, variant: v, seed: x * 5 })
    addCrows(ctx, { perch: 'roof', x: 270, y: 12.75, z: 101.55, angle: 0, facing: HALF_PI, count: 4, seed: 7118 })
  })
  return out
}

// ---------------------------------------------------------------------------------------------
export function buildWarehouse(ctx) {
  const out = { lights: 3 }
  let gx = WAREHOUSE.x - 5
  safe('warehouse', () => {
    const w = placeWarehouse(ctx, { x: WAREHOUSE.x, z: WAREHOUSE.z, rot: WAREHOUSE.rot, y: 0.25, seed: 2, name: 'СКЛАД № 2' })
    if (w?.gatePos) gx = w.gatePos[0]
    out.warehouse = w
  })
  safe('warehouse fence', () => {
    const [x0, z0, x1] = WAREHOUSE.yard
    placeFence(ctx, { points: [[gx - 3.35, FZ], [x0, FZ], [x0, z0], [x1, z0], [x1, FZ], [gx + 3.35, FZ]], type: 'po2', seed: 7201, graffiti: 0.15 })
    // the lit gate lamp
    const l = placeStreetLamp(ctx, { x: gx - 4.7, z: FZ - 1.0, angle: 0, type: 'courtyard', pole: 'concrete', bulb: 'sodium', broken: false, flicker: false, seed: 7202 })
    if (l?.light) out.lights++
    addGraffiti(ctx, { x: 352, y: 1.1, z: FZ + 0.14, angle: 0, id: 'gr_kish', h: 0.5 })
    addGraffiti(ctx, { x: 441, y: 1.0, z: FZ + 0.14, angle: 0, kind: 'graffiti', seed: 7203, look: 'tag', h: 0.42 })
  })
  safe('warehouse yard', () => {
    const C = [
      [343, 66, 0.0, 0x6a3a2a, 0], [349.4, 66.2, 0.0, 0x3d5468, 0], [343.1, 66, 0.0, 0x4e5d44, 2.75],
      [355.8, 65.9, 0.02, 0x7a6a4a, 0], [446, 75, HALF_PI, 0x3d5468, 0], [446.2, 81.4, HALF_PI, 0x6a3a2a, 0], [446, 75.05, HALF_PI, 0x8a8478, 2.75],
    ]
    for (const [x, z, a, tint, dy] of C) ctx.world.place('north_container', { x, z, y: 0.25 + dy, angle: a, tint, tag: 'container' })
    for (const [x, z] of [[372, 66], [372.4, 69.6], [380, 66.4]]) ctx.world.place('north_slabs', { x, z, rot: 0, tag: 'slabs' })
    for (const [x, z, r] of [[426, 112, 0], [428.6, 113, 1], [362, 116, 0]]) ctx.world.place('north_drum', { x, z, rot: r, tag: 'drum' })
    for (const [x, z, a] of [[419, 117, 0.4], [420.4, 117.6, 1.3], [436, 66, 0.2]]) placeModel(ctx, 'nature_buried_pallet', { x, z, angle: a, tag: 'buried' })
    placeParkedCar(ctx, { x: 398.5, z: 112.6, angle: PI, type: 'gazelle_van', snow: 'heavy', seed: 7211 })
    placeParkedCar(ctx, { x: 450.5, z: 118.6, angle: 0.2, type: 'moskvich2141', snow: 'buried', seed: 7212 })
    plowedPile(ctx, 340, 118, { radius: 3.0, height: 2.2, seed: 7213 })
    scatterWeeds(ctx, { rect: [WAREHOUSE.yard[0] + 0.6, 60, WAREHOUSE.yard[2] - 0.6, 63.5], density: 3, kinds: { grass: 0.6, burdock: 0.25, tansy: 0.15 }, seed: 7214 })
    addCrows(ctx, { perch: 'ground', x: 371, z: 74, count: 3, seed: 7215 })
  })
  return out
}

// ---------------------------------------------------------------------------------------------
export function buildWasteland(ctx) {
  const out = { lights: 0 }
  safe('substation', () => {
    placeSubstation(ctx, { x: SUBSTATION.x, z: SUBSTATION.z, rot: SUBSTATION.rot, y: 0.5, seed: 1, number: 2417 })
    const l = placeStreetLamp(ctx, { x: LONE_LAMP.x, z: LONE_LAMP.z, angle: -HALF_PI, type: 'courtyard', pole: 'concrete', bulb: 'mercury', broken: false, flicker: 'buzz', seed: 7301 })
    if (l?.light) out.lights++
    addGraffiti(ctx, { x: SUBSTATION.x + 3.27, y: 1.3, z: SUBSTATION.z - 0.4, angle: HALF_PI, id: 'gr_anarchy', h: 0.5 })
  })
  safe('pylons', () => {
    const [ax, az] = PYLONS[0], [bx, bz] = PYLONS[PYLONS.length - 1]
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L
    const angle = alongAngle(dx, dz)
    const pls = PYLONS.map(([x, z], i) => ctx.world.place('north_pylon', { x, z, y: 0.5, angle, seed: i * 0.31, tag: 'pylon' }))
    if (!ctx.wires) return
    const step = L / (PYLONS.length - 1)
    const c = Math.cos(angle), s = Math.sin(angle)
    // local (0, y, lz) → world: x + lz * s, z + lz * c (THREE rotation about +Y)
    const pt = (px, pz, lz, y) => [px + lz * s, y, pz + lz * c]
    const far = [1, 2, 3].map(k => [bx + dx * step * k, bz + dz * step * k])
    for (const [lz, y] of PYLON_ATTACH) {
      const pts = PYLONS.map(([x, z]) => pt(x, z, lz, 0.5 + y))
      for (const [x, z] of far) pts.push(pt(x, z, lz, 0.5 + y))
      ctx.wires.add(pts, { sag: 1.6, color: 0x23252a })
    }
    const peak = PYLONS.map(([x, z]) => pt(x, z, 0, 0.5 + PYLON_PEAK))
    for (const [x, z] of far) peak.push(pt(x, z, 0, 0.5 + PYLON_PEAK))
    ctx.wires.add(peak, { sag: 1.2, color: 0x1c1d20 })
    out.pylons = pls
  })
  safe('wasteland', () => {
    const trail = [[SUBSTATION.x + 0.4, 121.2], [527.6, 121.0], [535, 108], [551, 86], [563.5, 68], [568.6, 59.6], [569.5, RAIL.top[1] + 0.3]]
    const avoid = (x, z) => (x > 516 && x < 528 && z > 111 && z < 125) || distToPolyline(x, z, trail) < 1.4 ||
      PYLONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4) || Math.hypot(x - LONE_LAMP.x, z - LONE_LAMP.z) < 1.5
    scatterWeeds(ctx, { rect: [463, 60.5, 615, FZ + 0.5], density: 2.4, kinds: { grass: 0.45, burdock: 0.3, tansy: 0.25 }, avoid, seed: 7311 })
    ctx.footprints?.addTrail(trail, ctx.terrain, 0.45)
    const T = [
      [474, 96, 'maple', 3], [479, 101, 'maple', 5], [470.5, 88, 'birch', 2], [507, 74, 'maple', 4], [512, 70.5, 'birch', 0],
      [548, 112, 'maple', 3], [583, 113, 'birch', 3], [596, 101, 'maple', 5], [601, 88, 'birch', 1], [559, 63.5, 'maple', 4],
      [532, 63, 'birch', 4],
    ]
    for (const [x, z, sp, v] of T) placeTree(ctx, { x, z, species: sp, variant: v, seed: x * 7 + z })
    placeParkedCar(ctx, { x: 566.5, z: 104.5, angle: 0.62, type: 'vaz2106', snow: 'buried', tint: 0x6b5a3a, seed: 7312 })
    ctx.world.place('north_container', { x: 590, z: 95, y: 0.35, angle: 0.31, tint: 0x5e3426, tag: 'container' })
    ctx.world.place('north_slabs', { x: 547, z: 70, angle: -0.2, tag: 'slabs' })
    ctx.world.place('north_drum', { x: 541.5, z: 72.5, rot: 1, tag: 'drum' })
    snowDrift(ctx, 590, 96.4, { side: 's', length: 6, depth: 2.4, height: 0.7, seed: 7313 })
  })
  nav(ctx, [[SUBSTATION.x, 120.2], [SUBSTATION.x + 0.4, 121.2], [527.6, 121.0], [535, 108], [551, 86], [563.5, 68], [568.6, 59.6]], 'trodden')
  reg(ctx, 'storySpots', { kind: 'lonely_lamp', x: LONE_LAMP.x, z: LONE_LAMP.z, pkg: 'north' })
  return out
}
