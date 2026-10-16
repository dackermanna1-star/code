// Materials of the public-buildings package. Kept deliberately few (the palette has a hard limit
// of 255 materials shared by every package) — everything else reuses core materials.

import { defineMaterial, SURF, EMIT_CONST } from '../../core/materials.js'

// dark, non-emissive window glass (schools, kindergartens, offices at night: always dark)
defineMaterial('pub_glass_dark', { color: 0x252c33, gloss: 0.75, surface: SURF.CONCRETE, variation: 0.4 })
// goods
defineMaterial('pub_sausage', { color: 0x8a4636, gloss: 0.25, surface: SURF.WOOD, variation: 1.4 })
defineMaterial('pub_cheese', { color: 0xc4a04e, surface: SURF.WOOD, variation: 1.0 })
defineMaterial('pub_bread', { color: 0xa06e3c, surface: SURF.WOOD, variation: 1.3 })
defineMaterial('pub_bread_dark', { color: 0x4d3323, surface: SURF.WOOD, variation: 1.2 })
defineMaterial('pub_cardboard', { color: 0x947a58, surface: SURF.WOOD, variation: 1.3 })
// people
defineMaterial('pub_skin', { color: 0xc09884, surface: SURF.CARPET, variation: 0.4 })
defineMaterial('pub_fabric_blue', { color: 0x37527a, surface: SURF.CARPET, variation: 0.8 })
// paint: clean-ish white (chimney bands, kiosk fronts, hockey boards)
defineMaterial('pub_paint_white', { color: 0xcac6bd, surface: SURF.CONCRETE, variation: 0.8 })
// thin non-solid net (hockey goals)
defineMaterial('pub_net', { color: 0xaeb0aa, solid: false, surface: SURF.METAL, variation: 0.6 })
// emissive
defineMaterial('pub_lamp_green', { color: 0x3fc070, emit: EMIT_CONST, emitColor: 0x22ff6a, emitIntensity: 4.0 })
defineMaterial('pub_screen', { color: 0x8aa6c2, emit: EMIT_CONST, emitColor: 0x9cc2ff, emitIntensity: 1.3, gloss: 0.5 })
defineMaterial('pub_win_lit_cold', { color: 0x7e939a, emit: EMIT_CONST, emitColor: 0xb4d2da, emitIntensity: 0.9, gloss: 0.4 })
defineMaterial('pub_win_lit_warm', { color: 0xb08a5a, emit: EMIT_CONST, emitColor: 0xffbe6e, emitIntensity: 1.1, gloss: 0.4 })
