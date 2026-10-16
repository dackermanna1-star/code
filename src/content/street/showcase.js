// Private showcase scene for screenshots (?streettest=1&only=base,street). Never loaded in the
// real game. Exercises every public helper on a small patch of road, sidewalk and courtyard
// around (320, 320).

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from './lib.js'
import * as S from './api.js'

defineModel('street_test_wall', () => {
  const m = new VoxelModel(40, 24, 2)
  m.fill(0, 0, 0, 40, 24, 2, M('panel_gray'))
  m.fill(16, 0, 1, 8, 9, 1, M('metal_brown'))
  m.addSnow({ mat: M('snow') })
  return m
}, { occludesSnow: true })

export function buildShowcase(ctx) {
  const { terrain } = ctx
  // road, sidewalks, courtyard paths
  terrain.setHeightRect(260, 336, 390, 350, 0.0, M('asphalt_wet'))
  terrain.paintRect(260, 342.8, 390, 343.2, M('road_marking'))
  terrain.setHeightRect(260, 330, 390, 336, 0.25, M('snow_packed'))
  terrain.setHeightRect(260, 350, 390, 356, 0.25, M('snow_packed'))
  terrain.setHeightRect(316, 300, 324, 330, 0.25, M('snow_packed'))
  terrain.setHeightRect(270, 318, 316, 322, 0.25, M('snow_packed'))
  terrain.paintRect(262, 336, 390, 337.2, M('slush'))

  // the avenue: shared trolleybus/lighting poles, contact wires, a median-free street
  S.placeTrolleyLine(ctx, { points: [[262, 343], [388, 343]], poles: [-7.7, 7.7], pairs: [-4.4, 4.4], spacing: 28, poleType: 'lamp', seed: 4 })
  S.placeBusStop(ctx, { x: 322, z: 332.6, angle: 0, name: 'Улица Берёзовая', routes: ['36', '73'], kind: 'trolleybus', lit: true, seed: 8 })
  S.placeStopPole(ctx, { x: 352, z: 351.2, angle: Math.PI, kind: 'bus', name: 'Улица Берёзовая', routes: ['648', '276'] })
  S.placePayphone(ctx, { x: 312.5, z: 331.2, angle: 0 })
  S.placePaymentTerminal(ctx, { x: 310.2, z: 331.2, angle: 0 })
  S.placeVendingMachine(ctx, { x: 308.2, z: 331.2, angle: 0, type: 'coffee' })
  S.placeVendingMachine(ctx, { x: 306.0, z: 331.2, angle: 0, type: 'snack' })
  S.placeMailbox(ctx, { x: 303.5, z: 331.0, angle: 0 })
  S.placeTrafficLight(ctx, { x: 298.5, z: 335.6, angle: Math.PI / 2 })
  S.placeTrafficLight(ctx, { x: 293.5, z: 350.4, angle: -Math.PI / 2, phase: 15 })
  S.placeRoadSign(ctx, { x: 295.5, z: 335.6, angle: Math.PI / 2, type: 'crossing' })
  S.placeRoadSign(ctx, { x: 338, z: 335.6, angle: Math.PI / 2, type: 'children' })
  S.placeRoadSign(ctx, { x: 360, z: 350.5, angle: -Math.PI / 2, type: 'noparking' })
  terrain.paintRect(294, 336, 298, 350, M('road_marking'))
  S.placeManhole(ctx, { x: 310, z: 340, wet: false })
  S.placeManhole(ctx, { x: 330.5, z: 326, steam: true })
  S.placeBillboard(ctx, { x: 345, z: 360, angle: Math.PI, ad: 'mobitel', adBack: 'credit' })
  S.placeAdColumn(ctx, { x: 344, z: 332, angle: 0 })
  S.placeBollards(ctx, { x0: 326.5, z0: 330.4, x1: 336, z1: 330.4, type: 'post' })
  S.placeElectricalCabinet(ctx, { x: 340, z: 328.5, angle: 0 })

  // the courtyard
  S.placePlayground(ctx, { x: 320, z: 311, angle: 0, set: 'full', seed: 7, mittens: true })
  S.placePlayground(ctx, { x: 290, z: 309, angle: Math.PI / 2, set: 'small', seed: 3 })
  S.placeGarbageArea(ctx, { x: 356, z: 318, angle: 0, enclosure: 'brick', seed: 5 })
  S.placeGarbageArea(ctx, { x: 356, z: 304, angle: 0, enclosure: 'metal', seed: 6 })
  S.placeRakushkaRow(ctx, { x0: 330, z0: 293, x1: 352, z1: 293, seed: 9 })
  S.placeFence(ctx, { points: [[262, 287], [380, 287]], type: 'po2', seed: 2, outside: 'left', graffiti: 0.3 })
  S.placeFence(ctx, { points: [[262, 330], [262, 300]], type: 'bars', seed: 3 })
  S.placeFence(ctx, { points: [[365, 296], [380, 296]], type: 'chainlink', seed: 4 })
  S.placeFence(ctx, { points: [[366, 330], [380, 312]], type: 'construction', seed: 5 })
  S.placeFence(ctx, { points: [[300, 323], [314, 323]], type: 'tyres', seed: 6 })
  S.placeHeatPipe(ctx, { points: [[270, 292], [300, 292], [300, 300]], type: 'raised', seed: 3 })
  S.placeHeatPipeGate(ctx, { x: 310, z: 292, angle: 0 })
  S.placeHeatPipe(ctx, { points: [[312.5, 292], [328, 292]], type: 'low', seed: 4 })
  S.placeCarpetRack(ctx, { x: 282, z: 323.5, angle: 0, carpet: true })
  S.placeBench(ctx, { x: 302, z: 324.8, angle: Math.PI, type: 'entrance', snow: 'brushed' })
  S.placeBench(ctx, { x: 362, z: 327.5, angle: Math.PI, type: 'park' })
  S.placeStreetLamp(ctx, { x: 315.3, z: 322.7, type: 'courtyard', angle: Math.PI / 2, bulb: 'sodium', pole: 'concrete', broken: false })
  S.placeStreetLamp(ctx, { x: 340, z: 306, type: 'courtyard', angle: -Math.PI / 2, bulb: 'mercury', broken: false })
  S.placeStreetLamp(ctx, { x: 366, z: 324, type: 'park', broken: false })
  S.placeStreetLamp(ctx, { x: 370, z: 312, type: 'park', broken: true })
  S.placeStreetLamp(ctx, { x: 275, z: 327, type: 'cobra', angle: 0, broken: false, flicker: 'cycle' })
  S.placePayphone(ctx, { x: 277, z: 322.6, angle: 0, offhook: true })
  S.placeNoticeBoard(ctx, { x: 290, z: 326.5, angle: 0, lostDog: true })
  S.placeLitterBin(ctx, { x: 304.5, z: 324.6, type: 'concrete' })
  S.placeLitterBin(ctx, { x: 299.5, z: 324.6, type: 'metal' })

  // a wall with an entrance: wall lamp, wall mailbox, wall notice board
  ctx.world.place('street_test_wall', { x: 376, z: 340, angle: -Math.PI / 2 })
  S.placeStreetLamp(ctx, { x: 375.75, z: 340, type: 'wall', angle: -Math.PI / 2, broken: false })
  S.placeMailbox(ctx, { x: 375.75, z: 343, angle: -Math.PI / 2, wall: true })
  S.placeNoticeBoard(ctx, { x: 375.75, z: 336.6, angle: -Math.PI / 2, wall: true, seed: 12 })
  S.placeBench(ctx, { x: 374.5, z: 336.6, angle: -Math.PI / 2, type: 'entrance' })
}
