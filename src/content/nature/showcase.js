// TEMPORARY test scene (?naturetest=...). Removed before delivery.
import { placeTree, scatterTrees } from './place.js'
import { SPECIES } from './trees.js'
import { placePond, snowBank, snowDrift, plowedPile, addCrows, addSteam, placeHedge, placeBush, scatterWeeds, placeTreeRow } from './api.js'

export function showcase(ctx) {
  const arg = String(ctx.game.params.naturetest)
  for (const [x, z] of [[214, 428], [246, 428], [230, 395]]) {
    ctx.lights.add({ x, y: 9, z, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, intensity: 55, range: 24, color: 0xffa040, schedule: 'street' })
  }
  if (arg !== 'scene') {
    const rows = arg === '1' ? Object.keys(SPECIES) : arg.split('|')
    rows.forEach((sp, r) => {
      SPECIES[sp].variants.forEach((v, i) => placeTree(ctx, { x: 200 + i * 9 + (r % 2) * 4, z: 420 - r * 14, species: sp, variant: i, rot: 0 }))
    })
    return
  }
  const { terrain, M } = ctx
  // a road with a windrow and a manhole
  terrain.setHeightRect(190, 432, 270, 440, 0, M('asphalt_wet'))
  snowBank(ctx, 196, 429.5, 266, 432, 1.0, { gaps: [[30, 33]] })
  addSteam(ctx, { x: 236, y: 0.05, z: 436, kind: 'manhole' })
  addSteam(ctx, { x: 252, y: 1.2, z: 424.5, kind: 'vent', vel: [0, 0.6] })
  plowedPile(ctx, 262, 425, { radius: 3, height: 2.3, buried: 'yolka' })
  const pond = placePond(ctx, { x: 228, z: 398, rx: 14, rz: 9, seed: 5, sign: { angle: Math.PI / 2 } })
  const avoid = (x, z) => pond.shapeAt(x, z) < 1.6 || (z > 412 && x > 220 && x < 240)
  const trees = scatterTrees(ctx, { rect: [196, 360, 266, 424], density: 0.55, species: { birch: 0.7, 'poplar:pollarded': 0.1, linden: 0.1, spruce: 0.1 }, avoid, seed: 9, clump: 0.4 })
  placeHedge(ctx, { x0: 200, z0: 426, x1: 218, z1: 426 })
  placeBush(ctx, { x: 245, z: 425, kind: 'lilac' })
  placeBush(ctx, { x: 241, z: 426, kind: 'snowberry' })
  snowDrift(ctx, 209, 426.5, { side: 's', length: 18, depth: 2.5, height: 0.6 })
  scatterWeeds(ctx, { rect: [196, 410, 266, 428], density: 1.2, avoid: (x, z) => z > 425 && x < 220, seed: 4 })
  const tr = trees.filter(t => t.species === 'birch').sort((a, b) => Math.hypot(a.x - 236, a.z - 412) - Math.hypot(b.x - 236, b.z - 412))[0]
  if (tr) addCrows(ctx, { perch: 'tree', tree: tr, count: 4 })
  addCrows(ctx, { perch: 'ground', x: 224, z: 420, count: 3, scareRadius: 4 })
  placeTreeRow(ctx, { x0: 196, z0: 444, x1: 266, z1: 444, spacing: 9, species: 'linden' })
}
