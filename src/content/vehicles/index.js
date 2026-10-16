// vehicles — parked cars (VAZ, Moskvich, Volga, foreign cars, GAZelle, UAZ «буханка») in five
// snow states plus the 'warm' story car; LiAZ bus, ZiU trolleybus, KAMAZ snowplow, ER2-style
// elektrichka; and the systems that move them: sparse avenue traffic (headlights, tail lamps,
// tyre-on-slush sound, the trolleybus pulling away from the spawn stop), the train on the
// railway, and a rare car crawling through a courtyard. Models are defined at import time;
// layout packages place parked vehicles through ./api.js.

import './materials.js'
import './cars.js'
import './big.js'
import './train.js'
import { Glows } from './glow.js'
import { DecalAtlas } from './decals.js'
import { Traffic } from './traffic.js'
import { Railway } from './rail.js'
import { Yard } from './yard.js'
import { ParkedRuntime } from './parked.js'
import { buildFallback, buildShowcase } from './fallback.js'

// nature's steam plumes (exhaust) — optional: import.meta.glob yields {} if the file is absent
const NATURE = import.meta.glob('../nature/api.js')

const STATE = new WeakMap() // game → runtime state

function state(ctx) { return STATE.get(ctx.game) }

export default {
  name: 'vehicles',
  order: 29,

  build(ctx) {
    const g = ctx.game
    const sys = {
      ctx, glows: null, atlas: null, steam: null,
      hour: () => (((ctx.atmos?.minutes ?? 1000) / 60) % 24 + 24) % 24,
      night: () => g.uniforms?.uNight?.value ?? 1,
      street: () => g.uniforms?.uStreetOn?.value ?? 1,
    }
    const S = { sys, list: [] }
    STATE.set(g, S)
    buildFallback(ctx)
    if (g.params?.vehtest) buildShowcase(ctx)
    // the moving fleet is placed now (hidden) so its meshes are built while loading
    S.traffic = new Traffic(sys)
    S.rail = new Railway(sys)
    S.yard = new Yard(sys)
    S.parked = new ParkedRuntime(sys)
    ctx.registry.traffic = S.list
    ctx.registry.vehicles = { avenue: { west: [527.5, 531, 534.5], east: [552.5, 549, 545.5] } }
  },

  async init(ctx) {
    const S = state(ctx)
    if (!S) return
    const sys = S.sys
    // exhaust steam only when the nature package (and its particle system) is running
    const natureLoaded = (ctx.game.modules || []).some(m => m.name === 'nature')
    const load = NATURE['../nature/api.js']
    if (natureLoaded && load) {
      try { const api = await load(); if (typeof api.addSteam === 'function') sys.steam = api.addSteam } catch { sys.steam = null }
    }
    sys.glows = new Glows(ctx)
    sys.atlas = new DecalAtlas(ctx.game.uniforms)
    S.traffic.init()
    S.rail.init()
    S.yard.init()
    S.parked.init()
    if (ctx.registry._vehTest) S.yard.timer = 0.5
    ctx.registry.traffic = S.list
  },

  update(dt, ctx) {
    const S = state(ctx)
    if (!S || !S.sys.glows) return
    const cam = ctx.camera.position
    const time = ctx.game.time
    try { S.traffic.update(dt, ctx, cam, time) } catch (e) { report(S, 'traffic', e) }
    try { S.rail.update(dt, ctx, cam, time) } catch (e) { report(S, 'rail', e) }
    try { S.yard.update(dt, ctx, cam, time) } catch (e) { report(S, 'yard', e) }
    try { S.parked.update(dt, ctx, cam) } catch (e) { report(S, 'parked', e) }
    try { S.sys.glows.update(ctx.camera) } catch (e) { report(S, 'glows', e) }
    // registry.traffic: every moving vehicle {x, z, speed, type, ...} (same objects every frame)
    const L = S.list
    L.length = 0
    for (const e of S.traffic.list) L.push(e)
    if (S.rail.active) L.push(S.rail.entry)
    if (S.yard.active) L.push(S.yard.entry)
  },
}

function report(S, what, e) {
  S.errs = S.errs || {}
  if (S.errs[what]) return
  S.errs[what] = true
  console.error(`[content:vehicles] ${what} update failed`, e)
}
