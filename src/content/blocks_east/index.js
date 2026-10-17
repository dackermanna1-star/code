// blocks_east — layout of Blocks B, E and C of микрорайон «Восточный» and the eastern driveways.
//
//   Block B (x 308–456, z 144–322): a 9-storey 1-515 along ул. Заводская, two P-44/P-44T towers,
//     kindergarten № 1543 with verandas, a floodlit hockey box, rakushki along the west edge.
//   Block E (x 308–456, z 328–500): three 17-storey P-44T towers in a row (корп. 2 enterable, with
//     the lift) over a vast windy yard: the «ПРОДУКТЫ 24 ЧАСА» shop (enterable) with its parking
//     lot and a warm idling car, a playground, a substation, saplings along the path to the metro.
//   Block C (x 462–600, z 144–322): the very long 9-storey P-44, a brick 5-storey, the ГСК brick
//     garages along ул. Заводская, an abandoned construction pit, a lone flickering lamp.
// See docs/catalog/blocks_east.md.

import './props.js'
import { paintGround, paintPaths } from './ground.js'
import { placeBuildings, dressEntrances, entranceStories, dressPublic } from './buildings.js'
import { buildDriveways, buildCourtyards, buildParking } from './streets.js'
import { buildSite } from './site.js'
import { buildTrees } from './trees.js'
import { BUILDINGS, LANDMARKS, SHOP_DOOR, PUBLIC, SITE } from './geo.js'
import { safe, resetKeep, PKG } from './lib.js'

function zones(ctx) {
  const Z = ctx.zones
  // enclosed yards: courtyard slapback; Block E's yard is open and windy
  Z.add({ name: 'yard_B', min: [331, -2, 176], max: [453, 40, 319], reverb: 'courtyard', wind: 0.85, traffic: 0.55, data: { pkg: PKG } })
  Z.add({ name: 'yard_E', min: [310, -2, 352], max: [456, 60, 500], reverb: 'courtyard', wind: 1, traffic: 0.7, data: { pkg: PKG } })
  Z.add({ name: 'yard_C', min: [462, -2, 193], max: [598, 40, 290], reverb: 'courtyard', wind: 0.8, traffic: 0.5, data: { pkg: PKG } })
  Z.add({ name: 'garage_lane_C', min: [466, -2, 150], max: [594, 8, 166], reverb: 'courtyard', wind: 0.7, traffic: 0.6, data: { pkg: PKG } })
  // down in the abandoned pit the wind drops and the district goes quiet
  const P = SITE.pit
  Z.add({ name: 'construction_pit', min: [P.x0 + 2, -3, P.z0 + 2], max: [P.x1 - 2, 0.3, P.z1 - 2], reverb: 'courtyard', wind: 0.35, traffic: 0.3, priority: 1, data: { pkg: PKG } })
}

function registry(ctx, out) {
  const reg = ctx.registry
  const et2 = out.res?.et2
  const shopRec = (reg.shops || []).find(s => Math.abs(s.x - PUBLIC.shop.x) < 1 && Math.abs(s.z - PUBLIC.shop.z) < 1)
  reg.blocksEast = {
    shop: { x: PUBLIC.shop.x, z: PUBLIC.shop.z, door: SHOP_DOOR, record: shopRec || null },
    enterable: et2 ? et2.entrances.filter(e => e.enterable) : [],
    buildings: Object.fromEntries(Object.entries(out.res || {}).map(([k, b]) => [k, { bounds: b.bounds, address: BUILDINGS[k].address, entrances: b.entrances.length }])),
    landmarks: LANDMARKS,
  }
  reg.landmarks = reg.landmarks || []
  reg.landmarks.push(
    { kind: 'tower', name: 'Block E towers', x: 382, z: 345, height: 51 },
    { kind: 'tower', name: 'Block B tower', x: 323, z: 220, height: 51 },
    { kind: 'shop', name: 'ПРОДУКТЫ 24 ЧАСА', x: PUBLIC.shop.x, z: PUBLIC.shop.z },
  )
}

export default {
  name: PKG,
  order: 36,
  build(ctx) {
    resetKeep()
    safe('ground', () => paintGround(ctx))
    safe('paths', () => paintPaths(ctx))
    const out = safe('buildings', () => placeBuildings(ctx)) || { res: {} }
    safe('entrances', () => dressEntrances(ctx, out))
    safe('public dressing', () => dressPublic(ctx, out))
    safe('courtyards', () => buildCourtyards(ctx))
    safe('driveways', () => buildDriveways(ctx))
    safe('construction site', () => buildSite(ctx))
    safe('parking', () => buildParking(ctx))
    safe('trees', () => buildTrees(ctx))
    safe('stories', () => entranceStories(ctx, out))
    safe('zones', () => zones(ctx))
    safe('registry', () => registry(ctx, out))
  },
}
