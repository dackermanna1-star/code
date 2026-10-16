// Public helpers of the life package (people, the stray dog, storytelling props).
//
//   import { placeStory, STORY_KINDS, placePerson, spawnWalker, lifeStats } from '../life/api.js'
//
// Layout packages call placeStory() during build(); the walker/dog systems run by themselves
// from the navPaths the layouts push (no setup needed).

import { PEOPLE, PERSON_TYPES } from './people.js'
import { DOG_MODELS } from './dog.js'
import { fixFine } from './vox.js'
import { life } from './rt.js'
import { spawnWalker as _spawn, peopleTarget } from './walkers.js'

export { placeStory, STORY, STORY_KINDS } from './story.js'
export { PEOPLE, PERSON_TYPES, DOG_MODELS, peopleTarget }

/**
 * A static (non-walking) figure, e.g. a smoker frozen mid-step far down a street, someone
 * standing at a bus stop. type: a PERSON_TYPES entry; o: { x, z, y?, angle (facing (sin a, cos a)),
 * frame: 0..3 walk frame or 'stand' (default), tint }. Returns the placement (dynamic, no
 * collision) so the caller may move it with p.set(x, y, z, angle) or hide it (p.visible = false).
 */
export function placePerson(ctx, type, o = {}) {
  const P = PEOPLE[type]
  if (!P) { console.warn(`placePerson: unknown type "${type}"`); return null }
  const name = o.frame === undefined || o.frame === 'stand' ? P.stand : P.frames[((o.frame | 0) % 4 + 4) % 4]
  fixFine(name)
  return ctx.world.place(name, {
    x: o.x, z: o.z, y: o.y, angle: o.angle ?? 0, dynamic: true, collide: false,
    tint: o.tint ?? P.tints[0], tag: 'person', visible: o.visible ?? true,
  })
}

/**
 * Spawn a walker now (debug or a scripted moment). opts: { type, rMin=8, rMax=60, visible:false
 * (true allows spawning in view), door:false (true: come out of an entrance) }. Runtime only
 * (after init). Returns the walker or null.
 */
export function spawnWalker(ctx, opts = {}) { return _spawn(ctx, opts) }

/** Multiply the time-of-day pedestrian density (1 = default, 0 = nobody). */
export function setPeopleDensity(k) { life.density = Math.max(0, k) }

/** Debug snapshot. */
export function lifeStats() {
  return {
    walkers: life.walkers.map(w => ({ type: w.type, x: +w.x.toFixed(1), z: +w.z.toFixed(1), state: w.state, intent: w.intent, visible: w.visible })),
    dog: life.dog ? { state: life.dog.state, x: +life.dog.x.toFixed(1), z: +life.dog.z.toFixed(1), act: life.dog.act } : null,
    graph: life.graph ? { nodes: life.graph.nodes.length, edges: life.graph.edges.length, metres: Math.round(life.graph.total), doors: life.graph.doors.length, fallback: life.graph.fallback } : null,
    story: life.story.length,
    ...life.stats,
  }
}
