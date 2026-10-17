// South side of проспект Строителей: the eastbound bus stop, the kiosk row by the underpass exit,
// the 24-hour «ПРОДУКТЫ» pavilion, the pharmacy, the taxi lay-by, the row of 9-storey slabs with
// their backs to the avenue (entrances face south), trees and furniture.

import { RNG } from '../../core/rng.js'
import {
  placeBusStop, placeLitterBin, placeBillboard, placeAdColumn, placeMailbox, placePaymentTerminal, placeVendingMachine,
  placeNoticeBoard, placeTrafficLight, placeRoadSign, placeManhole, placeBench, placeGarbageArea,
  placeRakushkaRow, placeElectricalCabinet,
} from '../street/api.js'
import { placeKiosk, placeShop, placePharmacy } from '../public/api.js'
import { placeResidential } from '../residential/api.js'
import { placeTree, placeBush } from '../nature/api.js'
import { placeParkedCar, CAR_COLORS } from '../vehicles/api.js'
import { Z, STOP_S, ROW, ROW_Z, LAYBY, ZEBRA, METRO, safe, poster } from './layout.js'

export function placeSouthStop(ctx) {
  return safe('south stop', () => placeBusStop(ctx, {
    x: STOP_S.x, z: STOP_S.z, angle: Math.PI, kind: 'bus', name: 'Улица Берёзовая', routes: ['648', '613'],
    from: 'Ст. м. «Заречная»', to: '9-й микрорайон', lit: false, ticket: true, seed: 266, tint: 0x4a4f55, ad: poster('evrosvyaz'),
  }))
}

/** Kiosks, the shop and the pharmacy on the forecourt east of the underpass exit. */
export function placeForecourt(ctx) {
  const out = { kiosks: [] }
  const kiosks = [
    { x: 401.6, type: 'tabak', seed: 1 },
    { x: 408.8, type: 'pechat', seed: 2 },
    { x: 416.2, type: 'flowers', seed: 3 },
    { x: 423.4, type: 'closed', seed: 4, sign: 'ОВОЩИ • ФРУКТЫ' },
    { x: 430.8, type: 'shawarma', seed: 5 },
  ]
  for (const k of kiosks) safe('kiosk ' + k.type, () => out.kiosks.push(placeKiosk(ctx, { x: k.x, z: 576.4, y: 0.25, rot: 0, type: k.type, seed: k.seed, sign: k.sign })))
  safe('terminal', () => placePaymentTerminal(ctx, { x: 436.9, z: 575.4, y: 0.25, angle: Math.PI }))
  safe('vending', () => placeVendingMachine(ctx, { x: 439.6, z: 575.5, y: 0.25, angle: Math.PI, type: 'coffee', tint: 0x7a2a26 }))
  safe('shop', () => { out.shop = placeShop(ctx, { x: 460, z: 580, y: 0.25, rot: 0, seed: 11, tint: 0xa8b0a2 }) })
  safe('pharmacy', () => { out.pharmacy = placePharmacy(ctx, { x: 476.8, z: 577.6, y: 0.25, rot: 0, seed: 12 }) })
  safe('mailbox', () => placeMailbox(ctx, { x: 485.2, z: 571.4, angle: Math.PI }))
  safe('ad column', () => placeAdColumn(ctx, { x: 446.2, z: 569.0, angle: Math.PI, seed: 446 }))
  safe('plaza bins', () => {
    placeLitterBin(ctx, { x: 398.6, z: 572.6, angle: Math.PI, type: 'concrete', seed: 398 })
    placeLitterBin(ctx, { x: 444.2, z: 575.2, angle: Math.PI, type: 'metal', seed: 444 })
  })
  safe('plaza manhole', () => { placeManhole(ctx, { x: 421.4, z: 566.2, steam: 0.5 }); (ctx.registry.manholes ||= []).push({ x: 421.4, z: 566.2 }) })
  return out
}

/** Gypsy cabs waiting in the lay-by by the underpass (one with its engine running). */
export function placeLaybyCars(ctx) {
  const out = []
  const zc = 557.95
  safe('cab 1', () => out.push(placeParkedCar(ctx, { x: LAYBY.x0 + 4.4, z: zc, angle: -Math.PI / 2, type: 'volga3110', snow: 'light', tint: CAR_COLORS.black, seed: 71 })))
  safe('cab 2', () => out.push(placeParkedCar(ctx, { x: LAYBY.x0 + 10.6, z: zc, angle: -Math.PI / 2, type: 'vaz2107', warm: true, tint: CAR_COLORS.cherry, seed: 72 })))
  safe('cab 3', () => out.push(placeParkedCar(ctx, { x: LAYBY.x0 + 16.8, z: zc + 0.1, angle: -Math.PI / 2, type: 'vaz21099', snow: 'brushed', tint: CAR_COLORS.wetAsphalt, seed: 73 })))
  return out
}

/** The 9-storey row, backs to the avenue, entrances to the south. */
export function placeRow(ctx) {
  const blds = []
  for (const b of ROW) {
    safe('row ' + b.id, () => {
      const r = placeResidential(ctx, {
        series: b.series, floors: b.floors, sections: b.sections, x: b.x, z: ROW_Z, rot: 2, y: 0.25, seed: b.seed,
        address: { street: 'просп. Строителей', house: b.house }, lampsBroken: 0.25,
      })
      if (r) { r.def = b; blds.push(r) }
    })
  }
  return blds
}

/** Benches by some porches; drifts along the walls are left to the snow itself. */
export function furnishRow(ctx, blds) {
  const rng = new RNG(5940)
  const benches = []
  for (const b of blds) {
    for (const e of b.entrances || []) {
      if (!rng.chance(0.65)) continue
      const side = rng.chance(0.5) ? 1 : -1
      safe('entrance bench', () => {
        const r = placeBench(ctx, { x: e.x + side * 3.1, z: ROW_Z + 1.15, angle: 0, type: 'entrance', seed: rng.int(1, 1e5) })
        if (r) benches.push(r)
      })
    }
  }
  return benches
}

/** Trees: a row in front of the slabs, the yard behind the kiosks, the east yard. */
export function placeSouthTrees(ctx) {
  const rng = new RNG(5750)
  const trees = []
  const runs = [[47, 150], [176, 278], [310, 350]]
  for (const [a, b] of runs) {
    for (let x = a + rng.float(1, 3); x < b; x += rng.float(7, 9.5)) {
      if (rng.chance(0.08)) continue
      const r = rng.next()
      const species = r < 0.45 ? 'linden' : r < 0.82 ? 'poplar:pollarded' : 'maple:norway'
      safe('row tree', () => { const h = placeTree(ctx, { x, z: 575.6 + rng.float(-0.5, 0.5), species, size: species === 'maple:norway' ? 'small' : undefined, seed: rng.int(1, 1e6) }); if (h) trees.push(h) })
    }
  }
  // yard behind the kiosks and the shop, and the open ground east of the pharmacy
  const loose = [
    [404, 586.5, 'birch:single'], [419, 589.5, 'poplar:pollarded'], [447.5, 591, 'linden'], [472, 590.5, 'birch:clump'],
    [491.5, 586, 'birch:single'], [503, 593.5, 'linden'], [511.5, 579.5, 'maple:negundo'], [519.5, 590, 'birch:single'],
    [366.5, 581.5, 'poplar:pollarded'], [384.5, 586.5, 'apple'],
  ]
  for (const [x, z, species] of loose) safe('yard tree', () => { const h = placeTree(ctx, { x, z, species, seed: Math.round(x * 31 + z) }); if (h) trees.push(h) })
  for (const [x, z] of [[409.5, 581], [455, 588], [488, 594.5]]) safe('bush', () => placeBush(ctx, { x, z, kind: 'lilac', seed: Math.round(x) }))
  return trees
}

/** The rest of the south side furniture. */
export function placeSouthFurniture(ctx) {
  const rng = new RNG(5660)
  for (const x of [82, 141, 214, 301, 506, 574]) {
    safe('bin', () => placeLitterBin(ctx, { x: x + rng.float(-1, 1), z: 569.9, angle: Math.PI, type: rng.chance(0.5) ? 'concrete' : 'metal', seed: x + 7 }))
  }
  safe('billboard s', () => placeBillboard(ctx, { x: 301.5, z: 560.2, angle: -Math.PI / 2, ad: 'family', adBack: 'evrosvyaz', seed: 301 }))
  safe('notice board s', () => placeNoticeBoard(ctx, { x: 165.2, z: 569.95, angle: Math.PI, seed: 166 }))
  safe('cabinet s', () => placeElectricalCabinet(ctx, { x: 287.6, z: 570.0, angle: Math.PI, seed: 289 }))
  // garbage enclosure and rakushki in the yard behind the forecourt
  safe('garbage', () => placeGarbageArea(ctx, { x: 412.5, z: 595.2, angle: Math.PI, seed: 412, enclosure: 'brick', count: 3, tree: true }))
  safe('rakushki', () => placeRakushkaRow(ctx, { x0: 425.5, z0: 592.6, x1: 442, z1: 592.6, facing: 'left', seed: 425, missing: 0.1 }))
  // zebra, south kerb: flashing yellow for the eastbound traffic, the 5.19 sign
  safe('zebra south', () => {
    placeTrafficLight(ctx, { x: ZEBRA.x0 - 1.8, z: Z.S_CURB + 0.7, angle: -Math.PI / 2, flashFrom: 0, phase: 7, seed: 3 })
    placeRoadSign(ctx, { x: ZEBRA.x1 + 1.2, z: Z.S_CURB + 0.7, angle: -Math.PI / 2, type: 'crossing', seed: 4 })
  })
  // «Остановка запрещена» in front of the lay-by's exit, as everywhere near a metro
  safe('no stopping', () => placeRoadSign(ctx, { x: METRO.x0 - 0.8, z: Z.S_CURB + 0.6, angle: -Math.PI / 2, type: 'nostopping', seed: 5 }))
}
