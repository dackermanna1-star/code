// Materials for people, animals and the small storytelling props. Kept deliberately few
// (the palette holds 255 materials for the whole city): clothing colours that vary per person
// come from the placement tint on `paint_matte`, everything else reuses core materials.

import { defineMaterial, EMIT_CONST, EMIT_STREET, SURF } from '../../core/materials.js'

// people
defineMaterial('life_skin', { color: 0xb69886, surface: SURF.CARPET, variation: 0.3 })
defineMaterial('life_fur', { color: 0x4d3d31, surface: SURF.CARPET, variation: 1.8 })
defineMaterial('life_fur_light', { color: 0x8a7a68, surface: SURF.CARPET, variation: 1.6 })
defineMaterial('life_knit', { color: 0x5a5b60, surface: SURF.CARPET, variation: 1.0 })
defineMaterial('life_knit_dark', { color: 0x2c3242, surface: SURF.CARPET, variation: 0.9 })
defineMaterial('life_jeans', { color: 0x333c4e, surface: SURF.CARPET, variation: 0.7 })
defineMaterial('life_shawl', { color: 0x6d5a55, surface: SURF.CARPET, variation: 1.2 })
defineMaterial('life_tartan', { color: 0x5a2f33, surface: SURF.CARPET, variation: 0.6 })
defineMaterial('life_tartan_b', { color: 0x34413a, surface: SURF.CARPET, variation: 0.6 })
defineMaterial('life_kid', { color: 0x7e3546, surface: SURF.CARPET, variation: 0.5 })
// animals
defineMaterial('life_dog', { color: 0x76583d, surface: SURF.CARPET, variation: 1.4 })
defineMaterial('life_dog_pale', { color: 0xa6957c, surface: SURF.CARPET, variation: 1.2 })
defineMaterial('life_cat', { color: 0x5b554c, surface: SURF.CARPET, variation: 1.5 })
// eyeshine: only visible while the street lights are on (dusk and night)
defineMaterial('life_eye', { color: 0x2a2e20, emit: EMIT_STREET, emitColor: 0xc8e070, emitIntensity: 1.5 })
// a cigarette ember
defineMaterial('life_ember', { color: 0x7a3a20, emit: EMIT_CONST, emitColor: 0xff6a20, emitIntensity: 3.0 })
// props
defineMaterial('life_bread', { color: 0xa87a48, surface: SURF.CARPET, variation: 0.9 })
defineMaterial('life_carrot', { color: 0xb5582a, surface: SURF.WOOD, variation: 0.6 })
