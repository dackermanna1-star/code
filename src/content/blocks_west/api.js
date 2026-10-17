// Public API of blocks_west: the block configurations and the repeated-courtyard layout.
//
//   import { BLOCK_D, BLOCK_F, COURTYARD, HOME } from '../blocks_west/api.js'
//
// Coordinates are world metres (x east, z south). See docs/catalog/blocks_west.md.

export { COURTYARD, buildCourtyard, paintCourtyard } from './courtyard.js'
export { BER, NS, EW } from './streets.js'
export { A as BLOCK_A } from './blockA.js'

/** Block D — home. ул. Берёзовая, д. 12, корп. 1/2/3. */
export const BLOCK_D = {
  name: 'D', xW: 150, xE: 302, zN: 328, zS: 500, seed: 1000, house: '12',
  nN: 4, nS: 3, enterN: [2], homeLight: [2], eastDriveway: true, westStreet: true, westLawn: 1.5,
  v: {
    lamps: { passage: {}, nw: { bulb: 'sodium' }, east: null, pg: { bulb: 'sodium' }, west: { flicker: 'cycle', bulb: 'sodium' } },
    garbage: 'metal', containers: 4, playgroundSeed: 11, density: 0.72, warmCar: true, warmType: 'vaz2107',
    mittens: true, snowman: true, glove: true, frozenBag: false, key: [92, 151], pocket: true, trail: true,
    homeNotices: ['notice_heating', 'notice_mitten'], tp: 1417, tpGraffiti: 'gr_tsoi', heart: 'gr_lenasasha', chalk: true,
    stories: [
      { b: 'N', i: 2, kind: 'sled', side: -1 },
      { b: 'N', i: 0, kind: 'cat', side: 1, note: true },
      { b: 'W', i: 1, kind: 'butts', side: -1 },
      { b: 'S', i: 2, kind: 'bicycle', side: 1 },
    ],
    spruce: [128, 46], trees: 16, wind: 0.55, crows: 3,
  },
}

/** Block F — the same courtyard 312 m to the east. ул. Берёзовая, д. 14, корп. 1/2/3. */
export const BLOCK_F = {
  name: 'F', xW: 462, xE: 600, zN: 328, zS: 500, seed: 2000, house: '14',
  nN: 3, nS: 2, enterN: [1], eastDriveway: false, westStreet: false, westLawn: 1.5,
  v: {
    lamps: { passage: { broken: true }, nw: { bulb: 'mercury' }, east: { bulb: 'sodium' }, pg: { bulb: 'mercury', flicker: 'buzz' }, west: null },
    garbage: 'brick', containers: 3, playgroundSeed: 29, density: 0.55, warmCar: false,
    mittens: false, snowman: false, glove: false, frozenBag: true, key: null, pocket: false, trail: false,
    homeNotices: ['notice_meeting', 'notice_door'], tp: 1418, tpGraffiti: 'gr_kish', heart: 'gr_lenasasha', chalk: false,
    sledHill: [124, 128], lampsBroken: 0.3, tintW: 0x7a4b32,
    stories: [
      { b: 'N', i: 1, kind: 'sled', side: 1 },
      { b: 'W', i: 2, kind: 'cat', side: -1 },
      { b: 'N', i: 0, kind: 'butts', side: 1 },
      { b: 'W', i: 0, kind: 'bicycle', side: 1 },
    ],
    extraCars: [{ u: 112, v: 140, angle: 0.4, type: 'moskvich2141', snow: 'buried' }],
    spruce: [52, 132], trees: 13, wind: 0.35, silence: true, crows: 2, benchShift: 1,
    gate: { v: 165, u0: 76.2, u1: 80.2, open: 1.75 },
  },
}

/** The home entrance (filled at build time by index.js into ctx.registry.home). */
export const HOME = { block: 'D', street: 'ул. Берёзовая', house: '12', korpus: '2', entrance: 3, approx: [227.5, 350] }
