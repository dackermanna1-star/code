// Residential package: Soviet panel/brick blocks (P-44, II-49, 1-515/9Ш, P-44T, K-7, II-32).
// build() places nothing in the real game — layout packages call placeResidential() from ./api.js.
// The runtime (entrance doors, lifts, doorbells, the endless stairwell) is ticked from update().
//
// Dev showcase: ?resdemo=1 places a small test district (see docs/catalog/residential.md).

import './models.js'
import { tick, RT } from './runtime.js'
import { placeResidential } from './api.js'

export default {
  name: 'residential',
  order: 25,
  build(ctx) {
    RT.ctx = ctx
    const q = ctx.game?.params || {}
    if (q.resdemo) demo(ctx, String(q.resdemo))
  },
  init(ctx) { RT.ctx = ctx },
  update(dt, ctx) {
    try { tick(dt, ctx) } catch (e) {
      if (!RT._err) { RT._err = true; console.error('[residential] runtime', e) }
    }
  },
}

/** A compact test district on flat ground near the map centre (only with ?resdemo=1). */
function demo(ctx, which) {
  const { terrain, M } = ctx
  terrain.setHeightRect(150, 330, 460, 505, 0.25, M('snow_packed'))
  const addr = (h, k) => ({ street: 'ул. Берёзовая', house: h, korpus: k })
  // home: II-49, entrances facing south into the yard; entrance 3 enterable
  placeResidential(ctx, { series: 'ii49', floors: 9, sections: 3, x: 300, z: 352, rot: 2, y: 0.25, seed: 3, enterable: [2], homeLight: [2], address: addr('12', '2') })
  if (which === 'home') return
  placeResidential(ctx, { series: 'ii49', floors: 9, sections: 2, x: 170, z: 470, rot: 0, y: 0.25, seed: 5, address: addr('12', '3'), firstEntrance: 1 })
  placeResidential(ctx, { series: 'p44', floors: 17, sections: 1, x: 330, z: 360, rot: 0, y: 0.25, seed: 7, enterable: [0], tint: 0x4f6b8f, address: addr('14', '1') })
  placeResidential(ctx, { series: 'p44t', floors: 17, sections: 1, x: 370, z: 360, rot: 0, y: 0.25, seed: 8, address: addr('14', '2') })
  placeResidential(ctx, { series: '1515', floors: 9, sections: 2, x: 330, z: 420, rot: 0, y: 0.25, seed: 9, address: addr('16', '') })
  placeResidential(ctx, { series: 'k7', floors: 5, sections: 2, x: 190, z: 400, rot: 0, y: 0.25, seed: 11, address: addr('10', '') })
  placeResidential(ctx, { series: 'ii32', floors: 5, sections: 2, x: 400, z: 470, rot: 2, y: 0.25, seed: 13, address: addr('8', '') })
}
