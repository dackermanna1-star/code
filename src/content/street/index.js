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

export default {
  name: 'street',
  order: 27,
  async build(ctx) {
    if (!TEST) return
    const { buildShowcase } = await import('./showcase.js')
    buildShowcase(ctx)
  },
  init(ctx) {
    getState(ctx)
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
