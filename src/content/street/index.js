// Street furniture & courtyard props library. Models are defined at import time by the modules
// below; layout packages place them through ./api.js. build() places nothing in the real game
// (a private showcase scene is built only with ?streettest=1 for screenshots). update() animates
// the dynamic bits: swings, carousels, traffic lights, payphones, and turns a seated player to
// face out from the bench.

import './materials.js'
import './lamps.js'
import './seating.js'
import './playground.js'
import './waste.js'
import './garages.js'
import './fences.js'
import './transit.js'
import './utilities.js'
import { getState, wrapAngle } from './lib.js'
import { updateSwings, updateCarousels } from './playground.js'
import { updateTrafficLights } from './transit.js'
import { updatePayphones } from './utilities.js'

const TEST = typeof location !== 'undefined' && /[?&]streettest=1/.test(location.search)

// Steam markers (manholes, heat-pipe leaks) become real plumes through the nature package's
// shared particle system when that package is loaded. Each marker gets `plume` (the handle) so
// nobody adds a second plume for it; markers with `auto: false` are left to the layouts.
async function spawnSteam(ctx) {
  const vents = ctx.registry?.steamVents
  if (!vents?.length || !ctx.game?.modules?.some?.(m => m.name === 'nature')) return
  let addSteam
  try { ({ addSteam } = await import('../nature/api.js')) } catch { return }
  if (typeof addSteam !== 'function') return
  for (const v of vents) {
    if (v.plume || v.auto === false) continue
    const k = Math.max(0.15, Math.min(1, v.strength ?? 0.6))
    try {
      v.plume = addSteam(ctx, v.kind === 'heatpipe'
        ? { x: v.x, y: v.y, z: v.z, kind: 'pipe', rate: 2 + 5 * k, opacity: 0.1 + 0.12 * k, tag: 'street_steam' }
        : { x: v.x, y: v.y, z: v.z, kind: 'manhole', rate: 2 + 4 * k, opacity: 0.08 + 0.16 * k, tag: 'street_steam' })
    } catch { /* nature not ready: leave the marker for the layouts */ }
  }
}

export default {
  name: 'street',
  order: 27,
  async build(ctx) {
    if (!TEST) return
    const { buildShowcase } = await import('./showcase.js')
    buildShowcase(ctx)
  },
  async init(ctx) {
    getState(ctx)
    await spawnSteam(ctx)
  },
  update(dt, ctx) {
    const st = getState(ctx)
    st.time += dt
    const cam = ctx.camera?.position
    if (!cam) return
    if (st.swings.length) updateSwings(ctx, dt, st, cam)
    if (st.carousels.length) updateCarousels(ctx, dt, st, cam)
    if (st.trafficLights.length) updateTrafficLights(ctx, dt, st)
    if (st.payphones.length) updatePayphones(ctx, dt, st, cam)
    // sitting down: ease the view round to face out from the bench during the first second
    const pl = ctx.player
    if (st.sit) {
      if (pl && pl.mode === 'seated' && pl.seat === st.sit.seat) {
        st.sit.t = (st.sit.t ?? 0) + dt
        if (st.sit.t < 1.1) pl.yaw += wrapAngle(st.sit.yaw - pl.yaw) * Math.min(1, dt * 4.5)
      } else st.sit = null
    }
  },
}
