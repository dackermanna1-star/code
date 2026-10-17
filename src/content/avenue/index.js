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
  placeSouthStop, placeForecourt, placeLaybyCars, placeRow, furnishRow, placeSouthTrees, placeSouthFurniture,
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
    // 2. windrows, the median ridge, banks of cleared snow, plough piles (no low lawn fences along
    //    the walks: at 25 cm voxels their hoops read as a dark wall)
    raiseBanks(ctx)
    // 3. median lamps, trolley poles, span and contact wires (wrap-periodic)
    parts.overhead = safe('overhead', () => buildOverhead(ctx))
    parts.walkLamps = safe('walk lamps', () => buildWalkLamps(ctx))
    // 4. north side
    parts.spawn = safe('spawn stop', () => placeSpawnStop(ctx))
    safe('north furniture', () => placeNorthFurniture(ctx))
    // 5. south side
    parts.southStop = safe('south stop', () => placeSouthStop(ctx))
    parts.forecourt = safe('forecourt', () => placeForecourt(ctx))
    parts.cabs = safe('layby cars', () => placeLaybyCars(ctx))
    parts.row = safe('row', () => placeRow(ctx)) || []
    parts.benches = safe('row benches', () => furnishRow(ctx, parts.row))
    safe('south furniture', () => placeSouthFurniture(ctx))
    // 6. bus terminal (registers ctx.registry.busTerminal)
    parts.terminal = safe('terminal', () => buildTerminal(ctx))
    // 7. trees last, on the final ground
    parts.treesN = safe('north trees', () => placeNorthTrees(ctx)) || []
    parts.treesS = safe('south trees', () => placeSouthTrees(ctx)) || []
    // 8. notices, graffiti, story props, crows
    safe('details', () => placeDetails(ctx, parts))
    // 9. walkers, zones, registry
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
