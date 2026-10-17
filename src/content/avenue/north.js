// North side of проспект Строителей: the spawn trolleybus stop (the first view), the tree strip
// in front of the district with its half-buried lawn fence, furniture along the sidewalk.

import { RNG } from '../../core/rng.js'
import {
  placeBusStop, placeStopPole, placeStreetLamp, placePayphone, placeManhole, placeAdColumn, placeLitterBin,
  placeElectricalCabinet, placePaymentTerminal, placeRoadSign, placeBillboard, placeFence, placeNoticeBoard,
  placeTrafficLight, addPoleFlyer,
} from '../street/api.js'
import { placeTree, placeBush, addCrows } from '../nature/api.js'
import { addPlate } from '../phone/api.js'
import { Z, STOP_N, BEREZOVAYA, DRIVEWAYS, PASSAGES, METRO, ZEBRA, safe, poster } from './layout.js'

/** Low green arched fence along the tree strip — placed BEFORE the banks bury it. */
export function placeNorthFence(ctx) {
  const gaps = [
    [BEREZOVAYA.x0 - 1.5, BEREZOVAYA.walk1 + 1], [PASSAGES[0] - 2.5, PASSAGES[0] + 3], [PASSAGES[1] - 2.5, PASSAGES[1] + 3],
    [DRIVEWAYS[0].x0 - 1.5, DRIVEWAYS[0].x1 + 1.5], [DRIVEWAYS[1].x0 - 1.5, DRIVEWAYS[1].x1 + 1.5],
    [METRO.x0 - 3, METRO.x1 + 3], [STOP_N.x - 9.5, STOP_N.x - 4.5],
  ]
  let x = 42
  const runs = []
  for (const [g0, g1] of gaps.sort((a, b) => a[0] - b[0])) {
    if (g0 > x + 2) runs.push([x, g0])
    x = Math.max(x, g1)
  }
  if (x < 598) runs.push([x, 598])
  runs.forEach(([a, b], i) => safe('north fence', () => placeFence(ctx, { points: [[a, Z.FENCE_N], [b, Z.FENCE_N]], type: 'lawn', seed: 300 + i, tint: 0x4d6248 })))
}

/** Tree strip z 500–508: a loose row of birches, pollarded poplars and lindens with gaps. */
export function placeNorthTrees(ctx) {
  const rng = new RNG(5081)
  const skip = [
    [BEREZOVAYA.x0 - 4, BEREZOVAYA.walk1 + 3], [PASSAGES[0] - 4.5, PASSAGES[0] + 4.5], [PASSAGES[1] - 4.5, PASSAGES[1] + 4.5],
    [DRIVEWAYS[0].x0 - 5, DRIVEWAYS[0].x1 + 5], [DRIVEWAYS[1].x0 - 5, DRIVEWAYS[1].x1 + 5], [METRO.x0 - 6, METRO.x1 + 6],
    [236, 262], // hand-placed around the spawn view
  ]
  const trees = []
  // the trees framing the first view (player at 248, 515.5 looking north)
  const hero = [
    { x: 242.6, z: 505.4, species: 'birch', variant: 1 },
    { x: 251.8, z: 504.6, species: 'birch', variant: 0 },
    { x: 237.4, z: 504.4, species: 'poplar', variant: 4 },
    { x: 257.6, z: 505.6, species: 'linden', variant: 2 },
  ]
  for (const t of hero) safe('hero tree', () => { const h = placeTree(ctx, { ...t, rot: 1 }); if (h) trees.push(h) })
  for (let x = 44; x <= 596;) {
    const step = rng.float(6.8, 9.2)
    if (!skip.some(([a, b]) => x > a && x < b) && !rng.chance(0.07)) {
      const r = rng.next()
      const species = r < 0.38 ? 'poplar:pollarded' : r < 0.74 ? 'birch:single' : 'linden'
      const size = species === 'birch:single' ? rng.pick([12, 13.5, 14]) : species === 'linden' ? rng.pick([12, 14]) : undefined
      safe('north tree', () => {
        const h = placeTree(ctx, { x: x + rng.float(-0.6, 0.6), z: 505 + rng.float(-0.9, 0.6), species, size, seed: rng.int(1, 1e6) })
        if (h) trees.push(h)
      })
    }
    x += step
  }
  // lilac clumps under the trees here and there
  for (const [bx, bz] of [[188, 503.2], [233.5, 502.8], [262.5, 503.4], [350, 503.1], [497, 503.3], [566, 502.9]]) {
    safe('lilac', () => placeBush(ctx, { x: bx, z: bz, kind: rng.chance(0.7) ? 'lilac' : 'snowberry', seed: rng.int(1, 1e5) }))
  }
  return trees
}

/** The spawn stop and its corner of the sidewalk. */
export function placeSpawnStop(ctx) {
  const out = {}
  safe('spawn stop', () => {
    out.stop = placeBusStop(ctx, {
      x: STOP_N.x, z: STOP_N.z, angle: 0, kind: 'trolleybus', name: 'Улица Берёзовая', routes: ['41', '63'],
      from: 'Ст. м. «Заречная»', to: 'Мкр. «Восточный»', lit: true, ticket: false, seed: 248, tint: 0x3d4a5c, ad: poster('megasvyaz'),
    })
  })
  // separate pole for the bus (А 648) a little downstream, as Mosgortrans often did
  safe('bus pole', () => placeStopPole(ctx, { x: 240.4, z: 522.4, angle: Math.PI / 2, kind: 'bus', name: 'Улица Берёзовая', routes: ['648'], from: 'Ст. м. «Заречная»', to: '9-й микрорайон', seed: 649 }))
  // «the stop's lamp»: a sidewalk cobra reaching over the walk, the snow falls through its cone
  safe('stop lamp', () => { out.lamp = placeStreetLamp(ctx, { x: 254.6, z: 509.5, angle: 0, type: 'cobra', broken: false, flicker: false, seed: 77, flyers: true }) })
  safe('payphone', () => placePayphone(ctx, { x: 240.9, z: 510.05, angle: 0, seed: 12 }))
  safe('manhole', () => placeManhole(ctx, { x: 253.4, z: 511.9, steam: 0.75 }))
  safe('ad column', () => placeAdColumn(ctx, { x: 264.2, z: 510.5, angle: 0, seed: 264 }))
  safe('bin', () => placeLitterBin(ctx, { x: 236.6, z: 510.1, angle: 0, type: 'concrete', seed: 236 }))
  return out
}

/** Everything else along the north sidewalk. */
export function placeNorthFurniture(ctx) {
  const rng = new RNG(5240)
  // litter bins along the walk
  for (const x of [72, 131, 198, 292, 352, 419, 482, 533, 582]) {
    safe('bin', () => placeLitterBin(ctx, { x: x + rng.float(-1, 1), z: 510.1, angle: 0, type: rng.chance(0.55) ? 'concrete' : 'metal', seed: x }))
  }
  safe('cabinet', () => placeElectricalCabinet(ctx, { x: 318.5, z: 509.75, angle: 0, seed: 318 }))
  safe('terminal', () => placePaymentTerminal(ctx, { x: 366.5, z: 509.9, angle: 0 }))
  safe('manholes', () => {
    placeManhole(ctx, { x: 433.2, z: 512.6, steam: 0.4 })
    placeManhole(ctx, { x: 118.6, z: 513.4, wet: false })
    placeManhole(ctx, { x: 471.3, z: 529.2, steam: 0.55 }) // between the westbound lanes
    ;(ctx.registry.manholes ||= []).push({ x: 253.4, z: 511.9 }, { x: 433.2, z: 512.6 }, { x: 471.3, z: 529.2 })
  })
  // «Жилая зона» at the driveway mouths, facing the cars turning in
  for (const d of DRIVEWAYS) safe('zone sign', () => placeRoadSign(ctx, { x: d.x0 - 1.1, z: 509.6, angle: 0, type: 'residential', seed: d.x0 }))
  // street name plates on a post at the corner of ул. Берёзовая
  safe('name plates', () => {
    const px = BEREZOVAYA.x1 + 0.6, pz = 509.4
    ctx.world.place('street_sign_pole', { x: px, z: pz, angle: 0, tag: 'sign' })
    const gy = ctx.terrain.heightAt(px, pz)
    addPlate(ctx, { x: px, y: gy + 2.62, z: pz + 0.13, angle: 0, id: 'street_prospekt', w: 0.9, h: 0.24 })
    addPlate(ctx, { x: px - 0.13, y: gy + 2.3, z: pz, angle: -Math.PI / 2, id: 'street_berezovaya', w: 0.9, h: 0.24 })
  })
  // billboards on the lawn strip, edge-on to the traffic
  safe('billboard n1', () => placeBillboard(ctx, { x: 166.5, z: 519.8, angle: Math.PI / 2, ad: 'luch', adBack: 'credit', seed: 166 }))
  safe('billboard n2', () => placeBillboard(ctx, { x: 499.5, z: 519.8, angle: Math.PI / 2, ad: 'flats', adBack: 'beer', seed: 499, lit: false }))
  // notice board where the footpath turns into Block D
  safe('notice board', () => placeNoticeBoard(ctx, { x: PASSAGES[0] + 4.2, z: 509.7, angle: 0, seed: 228, lostDog: true }))
  // a second ad column by the metro approach
  safe('ad column 2', () => placeAdColumn(ctx, { x: 412.6, z: 510.4, angle: 0, seed: 412 }))
  // flyers on the side trolley poles near the stop and the metro
  for (const [x, a] of [[259, Math.PI], [370, Math.PI], [222, Math.PI]]) {
    safe('pole flyer', () => addPoleFlyer(ctx, { x, z: 523.2, y: 1.6, angle: a, halfWidth: 0.125, seed: x }))
  }
  // zebra: flashing yellow (Т.7) and the 5.19 signs on the north kerb
  safe('zebra north', () => {
    placeTrafficLight(ctx, { x: ZEBRA.x1 + 1.8, z: Z.N_CURB - 0.7, angle: Math.PI / 2, flashFrom: 0, seed: 1 })
    placeRoadSign(ctx, { x: ZEBRA.x0 - 1.2, z: Z.N_CURB - 0.7, angle: Math.PI / 2, type: 'crossing', seed: 2 })
  })
  // crows on the span wire near the stop (they burst off when you come close)
  safe('crows', () => addCrows(ctx, { perch: 'wire', x: 259, y: 7.32, z: 532, angle: Math.PI / 2, count: 4, seed: 41 }))
}
