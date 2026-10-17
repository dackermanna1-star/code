// avenue — проспект Строителей (z 500–600, all x incl. the wrap bands): both sidewalks, the
// carriageways with slush ruts and windrows, the median with double cobra lamps and trolleybus
// wires (period 37 m, so the pattern tiles across the 592 m wrap), the spawn trolleybus stop,
// the tree strip in front of the district, the south strip with kiosks, the 24-hour shop, the
// pharmacy, a row of 9-storey slabs, and the bus terminal. See docs/catalog/avenue.md.

import { safe } from './layout.js'
import { paintGround, raiseBanks } from './ground.js'
import { buildOverhead, buildWalkLamps } from './overhead.js'
import { placeNorthTrees, placeSpawnStop, placeNorthFurniture } from './north.js'
import {
  placeSouthFence, placeSouthStop, placeForecourt, placeLaybyCars, placeRow, furnishRow, placeSouthTrees, placeSouthFurniture,
} from './south.js'
import { buildTerminal } from './terminal.js'
import { placeDetails } from './details.js'
import { registerNav, registerZones, registerAvenue } from './nav.js'
import { initTrails } from './trails.js'

const parts = {}

export default {
  name: 'avenue',
  order: 32,
  build(ctx) {
    const lights0 = ctx.lights?.list?.length ?? 0
    // 1. ground: roads, kerbs, median, sidewalks, lawns, forecourts, terminal, paths
    paintGround(ctx)
    // 2. low lawn fences (south walk only: on the north walk, the spawn view, the 25 cm hoops read
    //    as a dark wall) go in before the banks so the cleared snow banks up behind them
    safe('fences', () => placeSouthFence(ctx))
    // 3. windrows, the median ridge, banks of cleared snow, plough piles
    raiseBanks(ctx)
    // 4. median lamps, trolley poles, span and contact wires (wrap-periodic)
    parts.overhead = safe('overhead', () => buildOverhead(ctx))
    parts.walkLamps = safe('walk lamps', () => buildWalkLamps(ctx))
    // 5. north side
    parts.spawn = safe('spawn stop', () => placeSpawnStop(ctx))
    safe('north furniture', () => placeNorthFurniture(ctx))
    // 6. south side
    parts.southStop = placeSouthStop(ctx)
    parts.forecourt = safe('forecourt', () => placeForecourt(ctx))
    parts.cabs = safe('layby cars', () => placeLaybyCars(ctx))
    parts.row = safe('row', () => placeRow(ctx)) || []
    parts.benches = safe('row benches', () => furnishRow(ctx, parts.row))
    safe('south furniture', () => placeSouthFurniture(ctx))
    // 7. bus terminal (registers ctx.registry.busTerminal)
    parts.terminal = safe('terminal', () => buildTerminal(ctx))
    // 8. trees last, on the final ground
    parts.treesN = safe('north trees', () => placeNorthTrees(ctx)) || []
    parts.treesS = safe('south trees', () => placeSouthTrees(ctx)) || []
    // 9. notices, graffiti, story props, crows
    safe('details', () => placeDetails(ctx, parts))
    // 10. walkers, zones, registry
    registerNav(ctx)
    registerZones(ctx)
    safe('registry', () => registerAvenue(ctx, parts))
    // light budget bookkeeping (outdoor lights this package added, incl. lamps placed via helpers)
    if (ctx.registry.avenue && ctx.lights?.list) {
      const added = ctx.lights.list.slice(lights0)
      ctx.registry.avenue.lights = { total: added.length, outdoor: added.filter(l => l.domain !== 2).length }
    }
  },
  init(ctx) {
    safe('trails', () => initTrails(ctx))
  },
  update() {},
}
