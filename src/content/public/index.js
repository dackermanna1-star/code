// Public & non-residential buildings: school, kindergarten, the «Продукты» shop (enterable),
// kiosks, pharmacy, boiler house with its striped chimney, garage rows, warehouse base,
// transformer substation, dispatcher booth and the courtyard hockey box.
//
// build() places nothing in the real game — layout packages call the API in ./api.js.
// With ?pubtest=1 in the URL a private test lot is built for screenshots.

import './materials.js'
import * as api from './api.js'
import { RT, updateRuntime } from './runtime.js'
import { buildTestScene } from './testscene.js'

const TEST = typeof location !== 'undefined' && location.search.includes('pubtest=1')

export default {
  name: 'public',
  order: 26,
  async build(ctx) {
    ctx.registry.publicApi = api
    if (TEST) buildTestScene(ctx, api)
  },
  async init(ctx) {
    // optional steam plumes from the nature package (boiler chimney, booth stovepipes)
    if (!RT.pendingSteam.length) return
    try {
      const mods = import.meta.glob('../nature/api.js')
      const load = mods['../nature/api.js']
      if (!load) return
      const nature = await load()
      if (typeof nature.addSteam !== 'function') return
      for (const s of RT.pendingSteam) {
        try { nature.addSteam(ctx, s) } catch (e) { void e }
      }
    } catch (e) { void e }
  },
  update(dt, ctx) {
    updateRuntime(dt, ctx)
  },
}
