// blocks_west — district layout: ул. Берёзовая, Block A (school + khrushchyovkas), Block D (home:
// ул. Берёзовая 12, корп. 2, подъезд 3), Block F (the same courtyard again: д. 14), the western
// N–S driveway (x 302–308) and the west part of the E–W driveway (z 322–328).
// See docs/catalog/blocks_west.md.

import { paintStreets, furnishStreets } from './streets.js'
import { paintBlockA, buildBlockA } from './blockA.js'
import { paintCourtyard, buildCourtyard } from './courtyard.js'
import { BLOCK_D, BLOCK_F } from './api.js'
import { KeepOut, safe, layTrails, TRAILS } from './util.js'

export default {
  name: 'blocks_west',
  order: 34,
  build(ctx) {
    TRAILS.length = 0
    const keep = new KeepOut()
    const gaps = { berE: [], berW: [], ns: [], ewN: [], ewS: [] }
    // ---- ground first (roads, driveways, sidewalks, pads) --------------------------------------
    safe('paint streets', () => paintStreets(ctx))
    safe('paint block A', () => paintBlockA(ctx, gaps))
    safe('paint block D', () => paintCourtyard(ctx, BLOCK_D, gaps))
    safe('paint block F', () => paintCourtyard(ctx, BLOCK_F, gaps))
    // ---- buildings, props, trees -------------------------------------------------------------------
    const a = safe('block A', () => buildBlockA(ctx, keep))
    const d = safe('block D', () => buildCourtyard(ctx, BLOCK_D, keep))
    const f = safe('block F', () => buildCourtyard(ctx, BLOCK_F, keep))
    // ---- streets last (their banks need every block's gaps) --------------------------------------
    safe('streets', () => furnishStreets(ctx, keep, gaps))

    const reg = ctx.registry
    if (d?.home) {
      const h = d.home
      reg.home = {
        x: h.x, z: h.z, y: h.y, angle: h.angle, entrance: h, outside: h.outside,
        address: { street: 'ул. Берёзовая', house: '12', korpus: '2', entrance: 3 },
        en: '12 Beryozovaya St., bldg 2, entrance 3', flats: h.flats,
      }
    }
    reg.blocksWest = { A: a, D: d, F: f }
    reg.blocks = reg.blocks || []
    reg.blocks.push({ name: 'D', pkg: 'blocks_west', rect: [150, 328, 302, 508], house: '12', home: !!d?.home })
    reg.blocks.push({ name: 'F', pkg: 'blocks_west', rect: [462, 328, 600, 508], house: '14' })
    reg.landmarks = reg.landmarks || []
    if (d?.buildings?.N) reg.landmarks.push({ kind: 'home', name: 'ул. Берёзовая, 12/2', x: (d.buildings.N.bounds.minX + d.buildings.N.bounds.maxX) / 2, z: (d.buildings.N.bounds.minZ + d.buildings.N.bounds.maxZ) / 2, height: d.buildings.N.height })
  },
  init(ctx) {
    // old footprint trails, on the final terrain of every package
    safe('trails', () => layTrails(ctx))
  },
}
