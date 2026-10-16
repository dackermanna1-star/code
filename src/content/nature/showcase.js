// TEMPORARY test scene (?naturetest=1). Removed before delivery.
import { placeTree } from './place.js'
import { SPECIES } from './trees.js'

export function showcase(ctx) {
  const rows = (ctx.game.params.naturetest || '1') === '1' ? ['birch', 'poplar', 'linden', 'maple', 'spruce', 'apple', 'rowan', 'sapling'] : ctx.game.params.naturetest.split('|')
  for (const [x, z] of [[214, 428], [246, 428], [230, 395]]) {
    ctx.lights.add({ x, y: 9, z, type: 'spot', dir: [0, -1, 0], cone: 58, inner: 28, intensity: 55, range: 24, color: 0xffa040, schedule: 'street' })
  }
  rows.forEach((sp, r) => {
    const vs = SPECIES[sp].variants
    vs.forEach((v, i) => placeTree(ctx, { x: 200 + i * 9 + (r % 2) * 4, z: 420 - r * 14, species: sp, variant: i, rot: 0 }))
  })
}
