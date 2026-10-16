// TEMPORARY review test scene (?naturetest=1). Remove before finishing.
import { SPECIES, PLANTS } from './api.js'
import { placeTree, placeBush, placeHedge, placeWeeds, placePond, snowBank, plowedPile, snowDrift, addSteam, addCrows, addBag } from './api.js'
import { paintRoad } from '../base/api.js'

export function buildTest(ctx) {
  const L = ctx.lights
  // gallery rows (z = 200 + 30 i), 10 m apart, x from 200
  const rows = [['birch'], ['poplar'], ['maple'], ['linden'], ['apple', 'rowan', 'sapling'], ['spruce']]
  rows.forEach((sps, i) => {
    let x = 200
    const z = 200 + 30 * i
    for (const sp of sps) for (let v = 0; v < SPECIES[sp].variants.length; v++) { placeTree(ctx, { x, z, species: sp, variant: v, rot: 0 }); x += sps.length > 1 ? 7 : 10 }
    for (let k = 0; k < 3; k++) L.add({ x: 215 + k * 30, y: 9, z: z + 6, color: 0xffa040, intensity: 55, range: 24, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, schedule: 'street' })
  })
  // plants row
  let px = 200
  for (const kind of ['lilac', 'currant', 'snowberry', 'grass', 'burdock', 'tansy', 'reeds', 'cattail']) for (let v = 0; v < PLANTS[kind].length; v++) {
    const bush = kind === 'lilac' || kind === 'currant' || kind === 'snowberry'
    if (bush) placeBush(ctx, { x: px, z: 380, kind, variant: v, angle: 0 }); else placeWeeds(ctx, { x: px, z: 380, kind, variant: v, angle: 0 })
    px += bush ? 4 : 3
  }
  L.add({ x: 215, y: 7, z: 384, color: 0xffa040, intensity: 55, range: 24, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, schedule: 'street' })
  L.add({ x: 245, y: 7, z: 384, color: 0xffa040, intensity: 55, range: 24, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, schedule: 'street' })
  paintRoad(ctx, { axis: 'x', x0: 196, z0: 400, x1: 296, z1: 406, lanes: [401.5, 404.5], banks: false, seed: 4 })
  snowBank(ctx, 196, 406.25, 296, 408.5, 1.0, { gaps: [[40, 44]] })
  snowBank(ctx, 196, 397.5, 296, 399.75, 0.9, {})
  const row1 = [
    [205, 'birch', 1], [214, 'birch', 5], [224, 'poplar', 1], [232, 'poplar', 4], [238, 'poplar', 6], [246, 'maple', 1],
    [255, 'maple', 4], [263, 'linden', 1], [271, 'apple', 1], [278, 'spruce', 3], [286, 'spruce', 5],
  ]
  const trees = {}
  for (const [x, sp, v] of row1) trees[sp + v] = placeTree(ctx, { x, z: 425, species: sp, variant: v, rot: 0 })
  trees.rowan2 = placeTree(ctx, { x: 222, z: 436, species: 'rowan', variant: 2, rot: 0 })
  trees.sap2 = placeTree(ctx, { x: 228, z: 436, species: 'sapling', variant: 2, rot: 0 })
  placeBush(ctx, { x: 234, z: 436, kind: 'lilac', variant: 0 })
  placeBush(ctx, { x: 238.5, z: 436, kind: 'currant', variant: 0 })
  placeBush(ctx, { x: 242.5, z: 436, kind: 'snowberry', variant: 0 })
  placeHedge(ctx, { x0: 246, z0: 437, x1: 256, z1: 437, damaged: 0.3 })
  placeWeeds(ctx, { x: 258, z: 436, kind: 'burdock', variant: 0 })
  placeWeeds(ctx, { x: 260.5, z: 436, kind: 'tansy', variant: 0 })
  placeWeeds(ctx, { x: 263, z: 436, kind: 'grass', variant: 0 })
  placeWeeds(ctx, { x: 265.5, z: 436.5, kind: 'reeds', variant: 0 })
  trees.birch7 = placeTree(ctx, { x: 270, z: 436, species: 'birch', variant: 7, rot: 0 })
  trees.lin4 = placeTree(ctx, { x: 278, z: 436, species: 'linden', variant: 3, rot: 0 })
  trees.pop7 = placeTree(ctx, { x: 286, z: 436, species: 'poplar', variant: 7, rot: 0 })
  placePond(ctx, { x: 240, z: 462, rx: 14, rz: 9, seed: 5, sign: { angle: -Math.PI / 2 } })
  plowedPile(ctx, 288, 412, { radius: 3, height: 2.4, buried: 'yolka', seed: 3 })
  plowedPile(ctx, 204, 413, { radius: 2.6, height: 2.0, buried: 'sled', seed: 8 })
  snowDrift(ctx, 250, 417, { side: 's', length: 8, depth: 2.5, height: 0.8 })
  addSteam(ctx, { x: 250, y: 0.3, z: 413, kind: 'manhole' })
  addSteam(ctx, { x: 270, y: 0.1, z: 403, kind: 'exhaust', vel: [-0.5, 0] })
  addCrows(ctx, { perch: 'ground', x: 236, z: 431, count: 3, seed: 4, scareRadius: 2 })
  addCrows(ctx, { perch: 'tree', tree: trees.poplar6 || trees.poplar4, count: 3, seed: 9 })
  addBag(ctx, { tree: trees.birch1, seed: 3 })
  addCrows(ctx, { perch: 'ground', x: 272, z: 452, count: 4, seed: 12 })
  const gy = ctx.terrain.heightAt(241, 433)
  addCrows(ctx, { points: [[241, gy, 433], [242, gy, 433.4], [240.2, gy, 433.6]], count: 3, seed: 2, scareRadius: 0.5, perch: 'ground' })
  for (const [x, z] of [[214, 431], [246, 431], [278, 431], [240, 451], [253, 411]]) {
    L.add({ x, y: 9, z, color: 0xffa040, intensity: 55, range: 24, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, schedule: 'street' })
  }
}
