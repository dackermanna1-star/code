// north — district layout: the park «Берёзовая роща» (x 24–139, z 147–500), ул. Заводская
// (z 133–146.5 with the heating main on its north verge), the industrial edge (garage
// cooperative, boiler house № 3 with the landmark chimney at (262, 95), warehouse base,
// substation and wasteland with a 110 kV line) and the railway (double track z 46 / 50 on an
// embankment, catenary, platform «Заводская», level crossing at x 300).
// See docs/catalog/north.md for the map, landmarks, doors and story spots.

import './models.js'
import { paintRailway, paintStreet, paintYards, paintCrossingPath, paintParkLawn } from './ground.js'
import { buildParkGround, buildPark } from './park.js'
import { buildGarages, buildBoiler, buildWarehouse, buildWasteland } from './industrial.js'
import { buildRailway } from './railway.js'
import { buildStreet, initStreetSteam } from './street.js'
import { initRuntime, updateRuntime } from './runtime.js'
import { safe } from './lib.js'
import { RAIL, ROAD, PARK, BOILER, PLATFORM, CROSSING, STOP, MEMORIAL, POND, GSK, WAREHOUSE, SUBSTATION } from './layout.js'

const built = {}

export default {
  name: 'north',
  order: 38,
  build(ctx) {
    // ---- ground first (roads, sidewalk, verge, yards, embankment, the park lawn) -------------------
    safe('paint railway', () => paintRailway(ctx))
    safe('paint street', () => paintStreet(ctx))
    safe('paint yards', () => paintYards(ctx))
    safe('paint crossing path', () => paintCrossingPath(ctx))
    safe('paint park lawn', () => paintParkLawn(ctx))
    built.parkGround = safe('park ground', () => buildParkGround(ctx))
    // ---- buildings and yards of the industrial edge (helpers flatten their footprints) ------------
    built.boiler = safe('boiler', () => buildBoiler(ctx))
    built.garages = safe('garages', () => buildGarages(ctx))
    built.warehouse = safe('warehouse', () => buildWarehouse(ctx))
    built.wasteland = safe('wasteland', () => buildWasteland(ctx))
    // ---- the railway, the street (heat pipes after the boiler), the park ----------------------------
    built.railway = safe('railway', () => buildRailway(ctx))
    built.street = safe('street', () => buildStreet(ctx))
    built.park = safe('park', () => buildPark(ctx))
    // ---- acoustic zones ------------------------------------------------------------------------------
    safe('zones', () => {
      const z = ctx.zones
      z.add({ name: 'zavodskaya', min: [0, -2, 124.5], max: [640, 40, PARK.z0], reverb: 'outdoor', traffic: 0.55, wind: 1, data: { pkg: 'north' } })
      z.add({ name: 'zavodskaya_stop', min: [STOP.x - 7, -2, PARK.z0 - 0.5], max: [STOP.x + 7, 40, PARK.z0 + 2], reverb: 'outdoor', traffic: 0.55, wind: 0.85, data: { pkg: 'north' } })
      z.add({ name: 'industrial', min: [0, -2, RAIL.fenceZ], max: [640, 60, 124.5], reverb: 'outdoor', traffic: 0.45, wind: 1.05, data: { pkg: 'north' } })
      z.add({ name: 'railway', min: [0, -2, 0], max: [640, 60, RAIL.fenceZ], reverb: 'outdoor', traffic: 0.3, wind: 1.15, data: { pkg: 'north' } })
      z.add({ name: 'platform_shelter', min: [265, 2, 53.1], max: [272, 5, 55.9], reverb: 'outdoor', wind: 0.5, priority: 1, data: { pkg: 'north' } })
    })
    // ---- registry ----------------------------------------------------------------------------------
    safe('registry', () => {
      const lights = ['railway', 'street', 'park', 'garages', 'boiler', 'warehouse', 'wasteland'].reduce((n, k) => n + (built[k]?.lights ?? 0), 0)
      ctx.registry.north = {
        lights,
        railway: { tracks: RAIL.tracks, railY: RAIL.railY, platform: PLATFORM, crossing: CROSSING },
        street: { name: 'ул. Заводская', road: ROAD, stop: STOP },
        park: { rect: [PARK.x0, PARK.z0, PARK.x1, PARK.z1], memorial: MEMORIAL, pond: POND },
        industrial: { garages: GSK, boilerChimney: BOILER.chimney, warehouse: WAREHOUSE, substation: SUBSTATION },
      }
      ;(ctx.registry.blocks ||= []).push({ name: 'park', pkg: 'north', rect: [PARK.x0, PARK.z0, PARK.x1, PARK.z1] })
      ;(ctx.registry.landmarks ||= []).push(
        { kind: 'platform', name: 'Платформа «Заводская»', x: (PLATFORM.x0 + PLATFORM.x1) / 2, z: (PLATFORM.z0 + PLATFORM.z1) / 2 },
        { kind: 'crossing', name: 'Переход через пути', x: CROSSING.x, z: 48 },
        { kind: 'garages', name: 'ГСК «Мотор-7»', x: (GSK.x0 + GSK.x1) / 2, z: 90 },
      )
    })
  },
  init(ctx) {
    safe('steam', () => initStreetSteam(ctx, built.street))
    safe('runtime', () => initRuntime(ctx, built))
  },
  update(dt, ctx) {
    updateRuntime(dt, ctx)
  },
}
