// LIFE — the people who are almost never there. Rare distant pedestrians on the nav paths, a
// stray dog in the courtyards, and small storytelling props (placeStory in api.js) for the
// layout packages. Ordinary and plausible only: nothing here is uncanny on purpose.
//
// build(): places the frame-swapped people/dog placements (hidden; meshed with the world) and,
//          with ?lifetest=1 only, a private test scene.
// init():  builds the pedestrian graph from ctx.navPaths (+ registry.entrances).
// update(): walkers, the stray dog, entrance doors, delayed sounds.

import './materials.js'
import './people.js'
import './dog.js'
import './props.js'
import { life, tickQueue, tickDoors } from './rt.js'
import { buildNavGraph } from './nav.js'
import { createActors, updateWalkers } from './walkers.js'
import { createDog, updateDog } from './stray.js'
import { placeStory } from './story.js'
import { lifeStats, spawnWalker, placePerson, setPeopleDensity } from './api.js'

const SYSTEMS = [
  function view(ctx) { life.view.update(ctx) },
  function queue() { tickQueue() },
  function doors(ctx, dt) { tickDoors(dt) },
  function walkers(ctx, dt) { updateWalkers(ctx, dt) },
  function dog(ctx, dt) { updateDog(ctx, dt) },
]

const TEST = typeof location !== 'undefined' && /[?&]lifetest=1/.test(location.search)

export default {
  name: 'life',
  order: 70,
  async build(ctx) {
    life.ctx = ctx
    life.test = TEST
    if (TEST) {
      const { buildTestScene, buildStudio } = await import('./testscene.js')
      const params = new URLSearchParams(location.search)
      if (params.get('studio')) { buildStudio(ctx, params); life.density = 0; life.noDog = true }
      else buildTestScene(ctx)
    }
    if (typeof location !== 'undefined' && /[?&]lifeprops=1/.test(location.search)) {
      const { buildEntranceDemo } = await import('./testscene.js')
      buildEntranceDemo(ctx, new URLSearchParams(location.search))
    }
    createActors(ctx)
    createDog(ctx)
    ctx.registry.life = { placeStory: (kind, o) => placeStory(ctx, kind, o), placePerson: (type, o) => placePerson(ctx, type, o), spawnWalker: o => spawnWalker(ctx, o), setPeopleDensity, stats: lifeStats }
  },
  init(ctx) {
    life.ctx = ctx
    // straight links across the snow (entrance stubs to the nearest path) must be walkable:
    // test them with a ray at knee and chest height above the higher end
    const clear = (ax, az, bx, bz) => {
      const ya = ctx.terrain.heightAt(ax, az), yb = ctx.terrain.heightAt(bx, bz)
      const y = Math.max(Number.isFinite(ya) ? ya : 0, Number.isFinite(yb) ? yb : 0)
      return ctx.world.lineOfSight(ax, y + 0.6, az, bx, y + 0.6, bz, 0.3) && ctx.world.lineOfSight(ax, y + 1.3, az, bx, y + 1.3, bz, 0.3)
    }
    life.graph = buildNavGraph(ctx.navPaths, ctx.registry.entrances || [], { clear })
    if (typeof window !== 'undefined') window.__life = { stats: lifeStats, spawn: o => spawnWalker(ctx, o), life }
    // dev URL switches (screenshots): ?lifedog=1 calls the stray now, ?lifewalk=1 puts two
    // walkers in view at once (one coming out of a door if there is one within 40 m)
    const q = typeof location !== 'undefined' ? location.search : ''
    if (/[?&]lifedog=1/.test(q) && life.dog) life.dog.timer = 1
    if (/[?&]lifewalk=1/.test(q)) {
      life.view.update(ctx)
      spawnWalker(ctx, { visible: true, rMin: 10, rMax: 30 })
      spawnWalker(ctx, { visible: true, rMin: 6, rMax: 40, door: true })
    }
  },
  update(dt, ctx) {
    life.ctx = ctx
    life.t += dt
    // each system guarded on its own: a failure in one never stops the others (or the game)
    for (const fn of SYSTEMS) {
      try { fn(ctx, dt) } catch (e) {
        if (!fn._failed) { fn._failed = true; console.error('[content:life]', fn.name, e) }
      }
    }
  },
}
