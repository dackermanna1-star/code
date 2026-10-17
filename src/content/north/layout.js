// Geometry of the north district in world metres (x east, z south): the park, ул. Заводская,
// the industrial edge and the railway. One place for every coordinate so the builders, the
// runtime, the API and the catalog agree. Heights: road 0.0, sidewalk/paths 0.25, lawn 0.5.

/** ул. Заводская: carriageway, kerbs, south sidewalk, north verge with the heating main. */
export const ROAD = { x0: 16, x1: 624, z0: 133, z1: 143, lanes: [135.5, 140.5] }
export const WALK = { z0: 143, z1: 146.5, line: 145.0 } // south sidewalk (y 0.25), nav line
export const VERGE = { fence: 124.5, pipe: 128.5, z1: 133 } // yard fences, heat-pipe axis, kerb
/** ул. Берёзовая (blocks_west) meets Заводская here: no sidewalk across it. */
export const BER = { x0: 139.75, x1: 148.25 }
/** N–S driveways of the blocks meeting the sidewalk at road level. */
export const DRIVES = [[302, 308], [456, 462]]

/** Park: lawn, cast-iron fence (east along Берёзовая, north along Заводская, south at the avenue). */
export const PARK = { x0: 24, x1: 139, z0: 147, z1: 499.5 }
export const FENCE = { x: 139.0, zN: 147.0, zS: 499.4, west: 30 }
/** Gates: [x, z, side] side = 'e' (east fence), 'n' (north fence), 's' (south fence). */
export const GATES = {
  main: { x: 131, z: FENCE.zN, side: 'n', w: 4.5 },      // corner of Заводская / Берёзовая
  north: { x: 71, z: FENCE.zN, side: 'n', w: 3.5 },      // into the birch grove
  e236: { x: FENCE.x, z: 236, side: 'e', w: 3.5 },        // opposite the school crossing
  e325: { x: FENCE.x, z: 325, side: 'e', w: 4.5 },        // on the axis of 3-й Молодёжный проезд
  e412: { x: FENCE.x, z: 412, side: 'e', w: 3.5 },        // opposite the Block D crossing
  south: { x: 133.5, z: FENCE.zS, side: 's', w: 3.5 },     // from the avenue corner
}
export const POND = { x: 80, z: 330, rx: 26, rz: 20 }
/** Memorial plaza on the alley axis from the z 325 gate (obelisk faces east, toward the gate). */
export const MEMORIAL = { x: 125, z: 325, plaza: [119.5, 318.5, 132.5, 331.5] }
export const CAFE = { x: 100, z: 374 }              // summer café «Берёзка», faces north (the pond)
export const BANDSTAND = { x: 72, z: 452 }           // concert shell, opens north to the benches
export const PLAYGROUND = { x: 113, z: 470 }          // park edge near Берёзовая / the avenue

/** Railway (vehicles: tracks z 46 west-bound / 50 east-bound, rail top 1.25, crossing x 300). */
export const RAIL = {
  tracks: [46, 50], railY: 1.25, bed: 1.0, z0: 40, z1: 56, top: [41, 55],
  gauge: 1.52, sleeperPitch: 0.75, sleeperHalf: 1.375,
  poleN: 42.125, poleS: 53.875, polePitch: 59.2, poleX0: 24 + 14.8,
  contactY: 7.2, messengerY: 9.4,
  crossingX: 300, fenceZ: 58.5,
}
/** Platform «Заводская» on the south side of the east-bound track (high platform, top 2.25). */
export const PLATFORM = { x0: 244.5, x1: 294.5, z0: 51.875, z1: 55.875, top: 2.25, stairsX: 294.5 }
/** Level crossing deck (both tracks), centred on the vehicles' crossing x. */
export const CROSSING = { x: 300, z0: 44.125, w: 6 }
/** The trodden way from the street to the crossing, between the boiler and the warehouse yards. */
export const CROSS_PATH = { x: 300 }

/** Industrial edge (z 60–124.5). */
export const GSK = { x0: 40, x1: 204, z0: RAIL.fenceZ, z1: VERGE.fence, gate: [118, 124.5], name: 'Мотор-7' }
export const GSK_ROWS = [
  { x: 122.375, z: 64.25, rot: 2, count: 42, n0: 1, seed: 701, brick: 'white' },   // doors south
  { x: 119.125, z: 78.25, rot: 0, count: 38, n0: 43, seed: 702, brick: 'red' },     // doors north
  { x: 124.0, z: 84.75, rot: 2, count: 40, n0: 81, seed: 703, brick: 'white' },   // doors south
]
export const BOILER = { chimney: [262, 95], rot: 2, yard: [214, RAIL.fenceZ, 292, VERGE.fence], gate: [262, 270], wicket: [247.6, 250.8] }
export const WAREHOUSE = { x: 395, z: 98, rot: 2, yard: [332, RAIL.fenceZ, 458, VERGE.fence] }
export const SUBSTATION = { x: 522, z: 116.5, rot: 2 }
export const PYLONS = [[492, 112], [536, 93], [580, 74]]
export const LONE_LAMP = { x: 529.5, z: 120.4 }

/** The bus stop on the south sidewalk (open side to the road) and its westbound pole. */
export const STOP = { x: 287, z: 145.65, name: 'Платформа «Заводская»' }

/** Heating main from the boiler house along the north verge (public package pipes). */
export const HEAT = {
  fromBoiler: [[284.0, 112.5], [289, 112.5], [289, VERGE.pipe]],
  west: [[289, VERGE.pipe], [158, VERGE.pipe]],
  east: [[289, VERGE.pipe], [598, VERGE.pipe]],
  archFence: [[289, 121.5]],
  archesWest: [[266, VERGE.pipe]],
  archesEast: [[300, VERGE.pipe], [390, VERGE.pipe], [522, VERGE.pipe]],
}

export const PLAY_MIN = 24
export const PLAY_MAX = 616
