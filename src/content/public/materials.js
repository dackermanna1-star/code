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
// clear bottles, jars and the thin glass guards of the counters: opaque, glossy (the engine's
// transparent glass frosts and glows at the edges of every small pane — right for cold windows,
// wrong for a vodka bottle indoors)
defineMaterial('pub_glass_goods', { color: 0xa3b6bc, gloss: 0.75, surface: SURF.CONCRETE, variation: 0.6 })
// thin non-solid net (hockey goals)
defineMaterial('pub_net', { color: 0xaeb0aa, solid: false, surface: SURF.METAL, variation: 0.6 })
// emissive
defineMaterial('pub_lamp_green', { color: 0x3fc070, emit: EMIT_CONST, emitColor: 0x22ff6a, emitIntensity: 4.0 })
defineMaterial('pub_screen', { color: 0x8aa6c2, emit: EMIT_CONST, emitColor: 0x9cc2ff, emitIntensity: 1.3, gloss: 0.5 })
defineMaterial('pub_win_lit_cold', { color: 0x5e7078, emit: EMIT_CONST, emitColor: 0xa8c4cc, emitIntensity: 0.55, gloss: 0.4 })
// dirty industrial glazing lit from inside (boiler hall): dimmer, greenish, follows the placement flag
defineMaterial('pub_win_lit_dirty', { color: 0x4e5a56, emit: EMIT_CONST, emitColor: 0x9cb8aa, emitIntensity: 0.3, gloss: 0.3 })
defineMaterial('pub_win_lit_warm', { color: 0xb08a5a, emit: EMIT_CONST, emitColor: 0xffbe6e, emitIntensity: 1.1, gloss: 0.4 })
// clear glass whose far-LOD stand-in is a lit pane following the placement flag (rooms that are
// lit only at certain hours, shops lit round the clock). Near: real see-through glass.
defineMaterial('pub_glass_cold', { color: 0x9fb4bf, transparent: true, gloss: 0.9, surface: SURF.CONCRETE, lod: 'pub_win_lit_cold' })
defineMaterial('pub_glass_warm', { color: 0x9fb4bf, transparent: true, gloss: 0.9, surface: SURF.CONCRETE, lod: 'pub_win_lit_warm' })
