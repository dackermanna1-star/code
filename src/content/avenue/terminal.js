// Bus terminal (конечная «Ст. м. «Заречная»») at the east end of the south strip: the loop road
// around a snowy island with the dispatcher's hut, a boarding platform with a pavilion, a LiAZ and a
// trolleybus laid over in their bays, lamps, the trolleybus wire loop, a blue portable toilet.
// Registers ctx.registry.busTerminal for the vehicles package (moving buses lay over at the stand).

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { placeBusStop, placeStreetLamp, placeBench, placeLitterBin, placeFence } from '../street/api.js'
import { placeDispatcherBooth } from '../public/api.js'
import { placeParkedBus } from '../vehicles/api.js'
import { placeTree } from '../nature/api.js'
import { TERM, safe } from './layout.js'
import { buildTerminalWires } from './overhead.js'

// ---- биотуалет: blue plastic portable toilet (1.25 × 2.5 × 1.25 m), door at local +Z ----------
defineModel('avenue_toilet', () => {
  const m = new VoxelModel(5, 11, 5)
  m.fill(0, 0, 0, 5, 1, 5, M('plastic_dark'))
  m.fill(0, 1, 0, 5, 8, 5, M('paint'))
  m.fill(1, 1, 1, 3, 8, 3, 0) // hollow
  // door (lighter frame) on +Z with a vent and the latch
  m.fill(1, 1, 4, 3, 8, 1, M('paint'))
  m.fill(1, 8, 4, 3, 1, 1, M('plastic_white'))
  m.set(3, 4, 4, M('metal_gray'))
  // white roof dome
  m.fill(0, 9, 0, 5, 1, 5, M('plastic_white'))
  m.fill(1, 10, 1, 3, 1, 3, M('plastic_white'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
}, { maxDistance: 160 })

export function buildTerminal(ctx) {
  const out = {}
  const reg = ctx.registry
  // vehicles package: loop centreline in driving order, layover stands, rejoin eastbound
  reg.busTerminal = { loop: TERM.loop.map(p => [p[0], p[1]]), stops: [[TERM.stand[0], TERM.stand[1]]], exit: 'east', name: 'Ст. м. «Заречная»' }

  // ---- platform pavilion (doors of the laying-over bus open toward it) -----------------------
  safe('terminal pavilion', () => {
    out.stop = placeBusStop(ctx, {
      x: 530.6, z: 586.5, angle: Math.PI / 2, kind: 'bus', name: 'Ст. м. «Заречная»', routes: ['648', '276'],
      from: 'Ст. м. «Заречная»', to: '9-й микрорайон', lit: true, ticket: true, seed: 530, tint: 0x2f3e57, ad: 'disco',
    })
  })
  safe('platform bench', () => placeBench(ctx, { x: 529.4, z: 577.2, angle: Math.PI / 2, type: 'park', seed: 529 }))
  safe('platform bin', () => placeLitterBin(ctx, { x: 529.3, z: 574.2, angle: Math.PI / 2, type: 'concrete', seed: 533 }))
  // railing along the back of the platform
  safe('platform rail', () => {
    placeFence(ctx, { points: [[527.9, 573], [527.9, 581.2]], type: 'bars', seed: 77, tint: 0x3d4a3e })
    placeFence(ctx, { points: [[527.9, 584.2], [527.9, 594.5]], type: 'bars', seed: 78, tint: 0x3d4a3e })
  })

  // ---- dispatcher's hut on the island, window facing the stand ---------------------------------
  safe('dispatcher', () => { out.booth = placeDispatcherBooth(ctx, { x: 545.9, z: 580.5, rot: 1, route: '648', seed: 5 }) })
  safe('toilet', () => ctx.world.place('avenue_toilet', { x: 545.4, z: 586.0, angle: -Math.PI / 2, tint: 0x2a5ba8, tag: 'toilet', seed: 0.3 }))

  // ---- parked vehicles in their bays -------------------------------------------------------------
  safe('parked liaz', () => { out.bus = placeParkedBus(ctx, { x: TERM.busBay.x, z: TERM.busBay.z, angle: 0, kind: 'bus', route: 0, placard: 'В ПАРК', seed: 61 }) })
  safe('parked ziu', () => { out.trolley = placeParkedBus(ctx, { x: TERM.trolleyBay.x, z: TERM.trolleyBay.z, angle: -Math.PI / 2, kind: 'trolleybus', poles: 'up', route: 0, placard: 'ПОСАДКИ НЕТ', seed: 62 }) })

  // ---- lamps: few, at the platform and the far corner (pools with darkness between) -----------
  safe('terminal lamps', () => {
    out.lamps = [
      placeStreetLamp(ctx, { x: 528.6, z: 581.5, angle: Math.PI / 2, type: 'cobra', broken: false, seed: 531 }),
      placeStreetLamp(ctx, { x: 597.4, z: 583.0, angle: -Math.PI / 2, type: 'cobra', broken: false, flicker: 'cycle', seed: 597 }),
      placeStreetLamp(ctx, { x: 571.5, z: 586.9, angle: 0, type: 'courtyard', bulb: 'mercury', pole: 'concrete', broken: false, seed: 571 }),
    ]
  })

  // ---- island: a few birches, a bench nobody uses -------------------------------------------
  for (const [x, z, sp] of [[556.5, 575.5, 'birch:single'], [566, 579.5, 'birch:clump'], [577.5, 576, 'birch:single'], [552.5, 584.6, 'linden']]) {
    safe('island tree', () => placeTree(ctx, { x, z, species: sp, seed: Math.round(x * 13 + z), size: sp === 'birch:clump' ? 14 : undefined }))
  }
  safe('island bench', () => placeBench(ctx, { x: 561.5, z: 573.6, angle: Math.PI, type: 'park', seed: 561, snow: true }))

  // ---- wires over the loop ------------------------------------------------------------------------
  buildTerminalWires(ctx)
  return out
}
