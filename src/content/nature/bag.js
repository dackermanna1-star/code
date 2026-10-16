// A plastic bag caught in a tree, fluttering when the wind gusts — micro-motion against stillness.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import { fineScale } from './voxutil.js'
import { MAT } from './materials.js'
import { natureState } from './state.js'

const FINE = 0.5 // 12.5 cm voxels
const PAINT = M('paint_matte'), TWIG = MAT.twigGrey

function bag(frame) {
  const m = new VoxelModel(7, 7, 4)
  // handles knotted round the twig at the top
  m.fill(2, 6, 1, 1, 1, 2, PAINT); m.fill(4, 6, 1, 1, 1, 2, PAINT)
  m.fill(0, 6, 1, 7, 1, 1, TWIG)
  if (frame === 0) {
    // hanging limp, slightly bunched
    m.fill(2, 2, 1, 3, 4, 2, PAINT)
    m.fill(3, 1, 1, 1, 1, 2, PAINT)
    m.set(1, 4, 1, PAINT)
  } else {
    // blown out sideways (+X), puffed
    m.fill(3, 3, 0, 3, 3, 4, PAINT)
    m.fill(5, 2, 1, 2, 3, 2, PAINT)
    m.set(2, 4, 1, PAINT)
  }
  m.setPivot(3.5, 6, 2)
  return fineScale(m)
}

const OPTS = { lods: [FINE], lodDistances: [], maxDistance: 110, collide: false, contact: false, dynamic: true }
defineModel('nature_bag_hang', () => bag(0), OPTS)
defineModel('nature_bag_blown', () => bag(1), OPTS)

const COLORS = [0xd9d7cf, 0xcfd2cc, 0x9fb2c0, 0xc9c0a8]

/**
 * A plastic bag snagged in a tree. o: { tree (handle from placeTree) | x, y, z, color, seed }.
 * Hangs from one of the tree's branch perches; flutters with the wind.
 */
export function addBag(ctx, o) {
  const s = natureState(ctx)
  const rng = new RNG(o.seed ?? 77)
  let x = o.x, y = o.y, z = o.z
  if (o.tree) {
    const pts = o.tree.perches().filter(p => p.y - o.tree.y > 2.5 && p.y - o.tree.y < 7)
    const q = pts.length ? pts[rng.int(0, pts.length - 1)] : o.tree.perches()[0]
    if (!q) return null
    x = q.x; y = q.y; z = q.z
  }
  const tint = o.color ?? rng.pick(COLORS)
  const a = ctx.world.place('nature_bag_hang', { x, y, z, dynamic: true, collide: false, tint, tag: 'bag' })
  const b = ctx.world.place('nature_bag_blown', { x, y, z, dynamic: true, collide: false, visible: false, tint, tag: 'bag' })
  if (!a || !b) return null
  const bagRec = { a, b, x, y, z, t: rng.next() * 5, blown: false, r: rng.int(1, 1e9) }
  ;(s.bags ||= []).push(bagRec)
  return bagRec
}

export function updateBags(ctx, s, dt) {
  if (!s.bags?.length) return
  const w = ctx.atmos.wind
  const ws = Math.hypot(w.x, w.z)
  const ang = Math.atan2(-w.z, w.x) // model +X points downwind
  for (const g of s.bags) {
    g.t -= dt
    if (g.t > 0) continue
    g.r = (Math.imul(g.r, 1664525) + 1013904223) >>> 0
    const rnd = g.r / 4294967296
    // flutter faster in stronger wind; rest now and then in the lulls
    const gusty = ws > 0.6
    g.blown = gusty ? !g.blown : (g.blown && rnd < 0.5)
    g.t = gusty ? 0.06 + 0.25 / ws + rnd * 0.12 : 0.6 + rnd * 1.5
    g.a.visible = !g.blown
    g.b.visible = g.blown
    if (g.blown) g.b.set(g.x, g.y, g.z, ang)
    else g.a.set(g.x, g.y, g.z, ang + 0.4)
  }
}
