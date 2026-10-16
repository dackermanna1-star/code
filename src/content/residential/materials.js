// Residential materials. Kept deliberately few (the palette is shared by every package, max 255):
// everything else reuses core materials (panel_*, tile_*, brick_*, wall_paint_*, whitewash, ...).

import { defineMaterial, EMIT_CONST, SURF } from '../../core/materials.js'

// Facade shells
defineMaterial('res_tile_white', { color: 0xc6c4bc, surface: SURF.CONCRETE, variation: 0.9 }) // P-44 "signal white" tile
defineMaterial('res_panel_cream', { color: 0xbfb5a2, surface: SURF.CONCRETE, variation: 0.8 }) // P-44T cream / II-49 base
defineMaterial('res_seam', { color: 0x9e9a90, surface: SURF.CONCRETE, variation: 0.6 }) // fresh panel joint (subtle)
defineMaterial('res_mastic', { color: 0x4f4c47, surface: SURF.CONCRETE, variation: 0.8 }) // re-sealed joint, dark streak
defineMaterial('res_plinth', { color: 0x564c45, surface: SURF.CONCRETE, variation: 1.2 }) // цоколь, painted grey-brown
defineMaterial('res_rust_stain', { color: 0x8a7462, surface: SURF.CONCRETE, variation: 1.5 }) // rusty run-off below balconies
defineMaterial('res_siding', { color: 0xb3a88a, surface: SURF.METAL, variation: 0.6 }) // beige balcony siding
// Stairwells
defineMaterial('res_terrazzo', { color: 0x868379, gloss: 0.12, surface: SURF.CONCRETE, variation: 1.7 }) // precast flights
defineMaterial('res_stair_glow', { color: 0xc4bfb0, emit: EMIT_CONST, emitColor: 0xffc27a, emitIntensity: 0.55, surface: SURF.CONCRETE, variation: 0.6 })
defineMaterial('res_stair_glow_hi', { color: 0xd0cabb, emit: EMIT_CONST, emitColor: 0xffcf90, emitIntensity: 1.3, surface: SURF.CONCRETE, variation: 0.4 })
defineMaterial('res_laminate', { color: 0x9a7350, gloss: 0.15, surface: SURF.WOOD, variation: 1.8 }) // lift cab, wood-grain chipboard
defineMaterial('res_leather_red', { color: 0x561f23, surface: SURF.WOOD, variation: 1.1 }) // burgundy dermatin door
defineMaterial('res_cloth', { color: 0xa9a08c, surface: SURF.CARPET, variation: 2.2 }) // laundry frozen on lines
