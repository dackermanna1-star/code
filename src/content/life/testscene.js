// Private test scene, built only with ?lifetest=1 (never in the real game): a strip of path with
// every storytelling prop, a line-up of all the people types, the stray dog, a bit of wall with
// a «подъезд» door node, and a loop of nav paths so the walker system has somewhere to walk.
//
//   node tools/shot.mjs --query "shot=1&only=base,life&lifetest=1&x=330&z=428&yaw=0&t=17:30&weather=light&timescale=0&frames=6"

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { PEOPLE } from './people.js'
import { DOG_MODELS } from './dog.js'
import { fixFine } from './vox.js'
import { placeStory, placeStoryAtEntrance } from './story.js'

defineModel('life_test_wall', () => {
  // a plinth-and-wall stub, 6 m long, front = local +Z
  const m = new VoxelModel(24, 14, 3)
  m.fill(0, 0, 0, 24, 5, 3, M('concrete_dark'))
  m.fill(0, 5, 0, 24, 9, 2, M('panel_white'))
  m.fill(9, 5, 2, 4, 9, 1, M('metal_brown')) // a door leaf
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
})
defineModel('life_test_bench', () => {
  const m = new VoxelModel(8, 4, 3)
  m.fill(0, 1, 0, 8, 1, 2, M('wood_painted_green'))
  m.fill(0, 2, 2, 8, 2, 1, M('wood_painted_green'))
  m.fill(0, 0, 0, 1, 1, 2, M('concrete')); m.fill(7, 0, 0, 1, 1, 2, M('concrete'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  return m
})

export function buildTestScene(ctx) {
  const { terrain, world, navPaths, lights } = ctx
  const Y = 0.25
  // paths at 0.25 m (packed snow) through the 0.5 m deep snow of the base layer
  terrain.setHeightRect(296, 417.5, 384, 420.5, Y, M('snow_packed'))
  terrain.setHeightRect(343.5, 380, 346.5, 470, Y, M('snow_packed'))
  terrain.setHeightRect(296, 380, 299, 470, Y, M('snow_packed'))
  terrain.setHeightRect(381, 380, 384, 470, Y, M('snow_packed'))
  terrain.setHeightRect(296, 380, 384, 383, Y, M('snow_packed'))
  terrain.setHeightRect(296, 467, 384, 470, Y, M('snow_packed'))
  terrain.setHeightRect(320, 410, 340, 417.5, Y, M('snow'))
  // wall with a door (back plane at z 410.75, front face z 411.5)
  world.place('life_test_wall', { x: 330, z: 411, y: Y, rot: 0 })
  // benches facing north across the path
  world.place('life_test_bench', { x: 326.5, z: 422.6, y: Y, rot: 2 })
  world.place('life_test_bench', { x: 333.5, z: 422.6, y: Y, rot: 2 })
  lights.add({ x: 330, y: 5.5, z: 420, type: 'spot', dir: [0, -1, 0], cone: 70, inner: 30, intensity: 40, range: 22, color: 0xffa040, schedule: 'street' })

  // ---- every story prop
  const benchA = { seat: { x: 326.5, y: Y + 0.5, z: 422.45 }, angle: Math.PI }
  const benchB = { seat: { x: 333.5, y: Y + 0.5, z: 422.45 }, angle: Math.PI }
  placeStory(ctx, 'mittens', { bench: benchA, along: 0.3, seed: 1 })
  placeStory(ctx, 'bread', { bench: benchB, along: -0.45, seed: 2 })
  placeStory(ctx, 'frozen_bag', { bench: benchB, along: 0.5, seed: 3 })
  placeStory(ctx, 'cat', { x: 327.4, z: 411.4, y: Y + 0.3, angle: 0, seed: 4, note: true })
  placeStory(ctx, 'sled', { x: 331.9, z: 411.4, y: Y, angle: 0, lean: true, seed: 5 })
  placeStory(ctx, 'butts', { x: 333.2, z: 412.4, y: Y, angle: 0, seed: 6 })
  placeStory(ctx, 'key', { x: 330.8, z: 419.4, y: Y, angle: 0.6, seed: 7 })
  placeStory(ctx, 'ticket', { x: 329.4, z: 418.3, y: Y, angle: 0.3, seed: 8 })
  placeStory(ctx, 'glove', { x: 335.6, z: 417.2, y: Y, post: true, seed: 9 })
  placeStory(ctx, 'snowman', { x: 323.2, z: 414.6, y: 0.5, angle: 0.5, seed: 10 })
  placeStory(ctx, 'bicycle', { x: 337.6, z: 413.6, y: 0.5, angle: Math.PI / 2, seed: 11 })
  placeStory(ctx, 'yolka', { x: 321.5, z: 421.6, y: 0.5, angle: 1.2, seed: 12 })
  placeStory(ctx, 'sled', { x: 336.0, z: 421.0, y: Y, angle: -0.4, seed: 13 })

  // ---- a line-up of every person type (standing on the path south of the camera spot)
  const types = Object.keys(PEOPLE)
  types.forEach((t, i) => {
    const P = PEOPLE[t]
    const name = i % 2 ? P.frames[i % 4] : P.stand
    fixFine(name)
    world.place(name, { x: 319 + i * 3.0, z: 437.5, y: Y, angle: Math.PI + (i % 3 - 1) * 0.5, dynamic: true, collide: false, tint: P.tints[i % P.tints.length], tag: 'person' })
  })
  terrain.setHeightRect(316, 435, 344, 440, Y, M('snow_packed'))
  // the stray, standing about
  fixFine(DOG_MODELS.stand)
  world.place(DOG_MODELS.stand, { x: 340.5, z: 419.2, y: Y, angle: -2.2, dynamic: true, collide: false, tag: 'dog' })

  // ---- nav paths: the loop, the crossing paths and an "entrance" stub at the wall door
  navPaths.push({ points: [[297.5, 381.5], [382.5, 381.5], [382.5, 468.5], [297.5, 468.5], [297.5, 381.5]], kind: 'sidewalk' })
  navPaths.push({ points: [[297.5, 419], [382.5, 419]], kind: 'sidewalk' })
  navPaths.push({ points: [[345, 381.5], [345, 468.5]], kind: 'path' })
  // a pretend entrance (registry-style record so walkers can go in and come out)
  const door = { x: 329.75, y: Y, z: 411.45, angle: 0, outside: [329.75, 414.5], enterable: false, doorPlacement: null, number: 0 }
  ;(ctx.registry.entrances || (ctx.registry.entrances = [])).push(door)
  navPaths.push({ points: [[329.75, 411.45], [329.75, 414.5], [329.75, 419]], kind: 'entrance', y: Y })
}

/**
 * Model studio for fine-voxel models (the stock viewer frames them by the engine's 0.25 m bounding
 * boxes, which are 4–8× too big for these). ?lifetest=1&studio=a,b,c&sview=0..3&sdist=1&slamp=1&stint=hex
 */
export function buildStudio(ctx, params) {
  const { world, terrain, lights, game } = ctx
  const THREE = ctx.THREE
  const names = String(params.get('studio')).split(',').filter(Boolean)
  const X0 = 320, Z = 200, Y = 0.25
  terrain.setHeightRect(X0 - 40, Z - 40, X0 + 60, Z + 40, Y, M('snow'))
  let x = X0, minX = Infinity, maxX = -Infinity, maxH = 0, maxD = 0
  const tint = params.get('stint') ? parseInt(params.get('stint'), 16) : 0x3a3f50
  for (const n of names) {
    const d = fixFine(n)
    if (!d) continue
    const w = Math.max(d.max[0] - d.min[0], params.get('sface') ? d.max[2] - d.min[2] : 0)
    const face = parseFloat(params.get('sface') ?? '0')
    const p = world.place(n, { x: x - d.min[0], z: Z, y: Y, angle: face, tint, seed: 0.37, dynamic: !!d.dynamic, collide: false })
    if (!p) continue
    minX = Math.min(minX, p.aabb[0]); maxX = Math.max(maxX, p.aabb[3])
    maxH = Math.max(maxH, p.aabb[4] - p.aabb[1]); maxD = Math.max(maxD, p.aabb[5] - p.aabb[2])
    x += w + 0.4
  }
  const cx = (minX + maxX) / 2, cy = Y + maxH * 0.5, cz = Z
  const size = Math.max(maxX - minX, maxH, maxD, 0.6)
  const view = parseInt(params.get('sview') ?? '0', 10)
  const k = parseFloat(params.get('sdist') ?? '1')
  const angles = [-0.65, 0.65, Math.PI - 0.7, 0, Math.PI / 2]
  const elev = [0.3, 0.25, 0.3, 0.08, 0.1]
  const a = angles[view % 5]
  const dist = (size * 1.25 + 0.8) * k
  const pos = new THREE.Vector3(cx + Math.sin(a) * dist, cy + dist * elev[view % 5] + 0.1, cz + Math.cos(a) * dist)
  game.cameraOverride = { pos, target: new THREE.Vector3(cx, cy, cz) }
  game.spawn = { x: pos.x, z: pos.z, yaw: 0 }
  if (params.get('slamp')) lights.add({ x: cx + 1.5, y: Y + 6, z: cz + 2, type: 'spot', dir: [-0.2, -1, -0.3], cone: 70, intensity: 50, range: 20, color: 0xffa040 })
}

/**
 * Dev switch ?lifeprops=1 (any scene with residential buildings, e.g. &resdemo=1): put story props
 * beside the entrances near the URL spawn point, to check placeStoryAtEntrance in context.
 */
export function buildEntranceDemo(ctx, params) {
  const x = parseFloat(params.get('x') ?? '0'), z = parseFloat(params.get('z') ?? '0')
  const ents = (ctx.registry.entrances || []).filter(e => Math.hypot(e.x - x, e.z - z) < 70)
  const kinds = ['sled', 'butts', 'cat', 'glove', 'key']
  ents.forEach((e, i) => {
    placeStoryAtEntrance(ctx, e, kinds[i % kinds.length], { side: i % 2 ? 1 : -1, seed: 31 + i, note: i === 2 })
    if (i % 2 === 0) placeStoryAtEntrance(ctx, e, 'butts', { side: i % 2 ? -1 : 1, seed: 47 + i })
  })
  const e0 = ents[0]
  if (e0) {
    const a = e0.angle ?? 0
    const sx = e0.x + Math.sin(a) * 9 + Math.cos(a) * 4, sz = e0.z + Math.cos(a) * 9 - Math.sin(a) * 4
    placeStory(ctx, 'snowman', { x: sx, z: sz, angle: a + 0.3, seed: 5 })
    placeStory(ctx, 'yolka', { x: sx + Math.cos(a) * 6, z: sz - Math.sin(a) * 6, angle: a + 1.2, seed: 6 })
    placeStory(ctx, 'bicycle', { x: e0.x + Math.cos(a) * -5 + Math.sin(a) * 1.0, z: e0.z - Math.sin(a) * -5 + Math.cos(a) * 1.0, angle: a + Math.PI / 2, seed: 7 })
  }
}
