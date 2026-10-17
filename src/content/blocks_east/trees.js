// Trees and bushes of the eastern blocks (~130 trees + ~30 staked saplings): pollarded poplars
// in rows along the driveways and behind the long building, lindens along the E–W driveway,
// birches loose in the yards, apple trees in the old 5-storey's yard, blue spruces by a tower,
// and young saplings in rows along the path to the metro across Block E's vast yard.

import { placeTree, placeTreeRow, scatterTrees, placeBush, addCrows } from '../nature/api.js'
import { safe, blocked } from './lib.js'

const free = r => (x, z) => blocked(x, z, r)

export function buildTrees(ctx) {
  const out = { crowsTree: null }
  // ---- Block B -----------------------------------------------------------------------------
  safe('trees B', () => {
    placeTreeRow(ctx, { x0: 340, z0: 188.9, x1: 432, z1: 188.9, spacing: 9, species: { 'poplar:pollarded': 0.8, 'poplar:natural': 0.2 }, missing: 0.1, skip: free(1.2), seed: 1001 })
    scatterTrees(ctx, { rect: [318, 254, 352, 317], count: 7, species: { birch: 0.6, 'maple:norway': 0.2, 'poplar:pollarded': 0.2 }, avoid: free(2.2), minSpacing: 6, clump: 0.3, seed: 1002 })
    // lindens either side of the kindergarten, outside its fence
    placeTreeRow(ctx, { x0: 349.5, z0: 268, x1: 349.5, z1: 312, spacing: 11, species: 'linden', skip: free(0.8), seed: 1003 })
    placeTreeRow(ctx, { x0: 430.5, z0: 268, x1: 430.5, z1: 312, spacing: 11, species: 'linden', skip: free(0.8), seed: 1004 })
    // inside the kindergarten: old birches in the corners, two spruces behind the building
    for (const [x, z, sp] of [[362, 265.5, 'birch'], [418, 265.5, 'birch'], [361.5, 309, 'birch'], [418.5, 309, 'birch:clump'], [380, 309.5, 'spruce:green'], [400, 309.5, 'spruce:green']]) {
      placeTree(ctx, { x, z, species: sp, size: sp.startsWith('spruce') ? 9 : 'medium', seed: Math.round(x * 7 + z) })
    }
    // lindens along the E–W driveway sidewalk west and east of the kindergarten
    placeTreeRow(ctx, { x0: 313, z0: 316.6, x1: 350, z1: 316.6, spacing: 10, species: 'linden', skip: free(0.6), seed: 1005 })
    placeTreeRow(ctx, { x0: 434, z0: 316.6, x1: 451, z1: 316.6, spacing: 9, species: 'linden', skip: free(0.6), seed: 1006 })
    // blue spruces by tower B2's entrance, a big birch between the towers
    placeTree(ctx, { x: 426.5, z: 212.5, species: 'spruce:blue', size: 9, seed: 1007 })
    placeTree(ctx, { x: 426.8, z: 232.5, species: 'spruce:blue', size: 11, seed: 1008 })
    placeTree(ctx, { x: 346, z: 197, species: 'birch:clump', size: 'large', seed: 1009 })
    placeTree(ctx, { x: 416, z: 198.5, species: 'maple:norway', size: 'medium', seed: 1010 })
  })

  // ---- Block E -----------------------------------------------------------------------------
  safe('trees E', () => {
    // a row of birches along the north edge of the vast yard, gaps where paths cross
    placeTreeRow(ctx, { x0: 318, z0: 369.4, x1: 450, z1: 369.4, spacing: 11, species: { birch: 0.8, linden: 0.2 }, missing: 0.22, skip: free(1.0), seed: 1101 })
    // young saplings planted in two rows either side of the spine (a 2007 «благоустройство»):
    // mostly single-stake birches and lindens, now and then the three-stake tripod; a few died
    const VAR = [1, 0, 3, 1, 2, 0, 3, 1, 0, 3, 1, 2, 0, 1]
    for (const [k, x] of [[0, 377.4], [1, 385.1]]) {
      let i = 0
      for (let z = 374 + k * 4; z < 480; z += 8, i++) {
        if ((i * 7 + k * 3) % 9 === 4) continue            // a dead one was pulled out
        const xx = x + ((i * 5 + k) % 3 - 1) * 0.12
        if (blocked(xx, z, 0.2)) continue
        placeTree(ctx, { x: xx, z, species: 'sapling', variant: VAR[(i + k * 5) % VAR.length], rot: (i + k) % 4, seed: 1102 + i * 13 + k })
      }
    }
    // tall poplars in the gaps between the towers
    for (const [x, z] of [[350.5, 341], [362, 340.5], [400.5, 337.5], [415.5, 340]]) placeTree(ctx, { x, z, species: 'poplar:natural', seed: Math.round(x * 3 + z) })
    // a few birches loose in the yard, round the playground and toward the shop
    scatterTrees(ctx, { rect: [316, 378, 372, 476], count: 6, species: { birch: 0.7, 'maple:norway': 0.3 }, avoid: free(3.0), minSpacing: 9, seed: 1104 })
    scatterTrees(ctx, { rect: [392, 404, 430, 456], count: 3, species: { birch: 1 }, avoid: free(3.0), minSpacing: 10, seed: 1105 })
    scatterTrees(ctx, { rect: [396, 486, 433, 499], count: 3, species: { birch: 0.6, linden: 0.4 }, avoid: free(2.0), minSpacing: 7, seed: 1106 })
    // ash-leaved maples by the substation
    placeTree(ctx, { x: 318.5, z: 476.5, species: 'maple:negundo', seed: 1107 })
    placeTree(ctx, { x: 337.5, z: 482.5, species: 'maple:negundo', seed: 1108 })
  })

  // ---- Block C -----------------------------------------------------------------------------
  safe('trees C', () => {
    const poplars = placeTreeRow(ctx, { x0: 470, z0: 171.6, x1: 590, z1: 171.6, spacing: 10, species: { 'poplar:pollarded': 0.7, 'poplar:natural': 0.3 }, missing: 0.1, skip: free(0.6), seed: 1201 })
    out.crowsTree = poplars[Math.floor(poplars.length * 0.6)] || null
    placeTreeRow(ctx, { x0: 467, z0: 316.6, x1: 596, z1: 316.6, spacing: 12, species: 'linden', missing: 0.12, skip: free(0.6), seed: 1202 })
    // the 5-storey's old yard: apple trees, whitewashed
    placeTreeRow(ctx, { x0: 492, z0: 309.5, x1: 566, z1: 309.5, spacing: 12.5, species: 'apple', jitter: 1.2, missing: 0.1, skip: free(0.4), seed: 1203 })
    scatterTrees(ctx, { rect: [468, 212, 537, 282], count: 7, species: { birch: 0.7, 'poplar:pollarded': 0.15, rowan: 0.15 }, avoid: free(2.5), minSpacing: 8, clump: 0.3, seed: 1204 })
    scatterTrees(ctx, { rect: [540, 272, 596, 284], count: 3, species: { birch: 0.6, 'maple:norway': 0.4 }, avoid: free(1.5), minSpacing: 9, seed: 1205 })
  })

  // ---- bushes: snowberry along the kindergarten fence, lilac behind the 5-storey ------------
  safe('bushes', () => {
    for (const [x, z, kind] of [[359.5, 258.8, 'snowberry'], [420.5, 258.8, 'snowberry'], [372, 258.8, 'lilac'], [500, 304.5, 'lilac'], [527, 305, 'lilac'], [552, 304.5, 'currant'], [592, 214.5, 'lilac']]) {
      if (!blocked(x, z, 0.2)) placeBush(ctx, { x, z, kind, seed: Math.round(x + z * 3) })
    }
  })

  // ---- crows ----------------------------------------------------------------------------
  safe('crows', () => {
    if (out.crowsTree) addCrows(ctx, { perch: 'tree', tree: out.crowsTree, count: 4, seed: 1301 })
    addCrows(ctx, { perch: 'ground', x: 444.5, z: 186.6, count: 3, seed: 1302 }) // by the B bins
  })
  return out
}
