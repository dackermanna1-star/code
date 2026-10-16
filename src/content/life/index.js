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
    createActors(ctx)
    createDog(ctx)
    ctx.registry.life = { placeStory: (kind, o) => placeStory(ctx, kind, o), placePerson: (type, o) => placePerson(ctx, type, o), spawnWalker: o => spawnWalker(ctx, o), setPeopleDensity, stats: lifeStats }
  },
  init(ctx) {
    life.ctx = ctx
    life.graph = buildNavGraph(ctx.navPaths, ctx.registry.entrances || [])
    if (typeof window !== 'undefined') window.__life = { stats: lifeStats, spawn: o => spawnWalker(ctx, o), life }
    if (TEST && /[?&]lifewalk=1/.test(location.search)) {
      // test: put two walkers in plain view right away
      life.view.update(ctx)
      spawnWalker(ctx, { visible: true, rMin: 10, rMax: 30 })
      spawnWalker(ctx, { visible: true, rMin: 10, rMax: 30, door: true })
    }
  },
  update(dt, ctx) {
    life.ctx = ctx
    life.t += dt
    life.view.update(ctx)
    tickQueue()
    tickDoors(dt)
    updateWalkers(ctx, dt)
    updateDog(ctx, dt)
  },
}
