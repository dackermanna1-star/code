// Street-furniture materials. Restrained, faded, weathered: Soviet playground paints that have
// seen thirty winters, galvanized steel gone dull, cast iron, tin cladding, and a few emissive
// heads (sodium, mercury, frosted globes, signal lenses, lit screens).

import { defineMaterial, SURF, EMIT_CONST, EMIT_STREET } from '../../core/materials.js'

// painted metal (fixed colours; per-instance colours use the core 'paint' material)
defineMaterial('street_paint_white', { color: 0xb2b1a8, gloss: 0.15, surface: SURF.METAL, variation: 1.2 })
defineMaterial('street_paint_cyan', { color: 0x67868e, gloss: 0.15, surface: SURF.METAL, variation: 1.2 })
defineMaterial('street_paint_orange', { color: 0x9f6a42, gloss: 0.15, surface: SURF.METAL, variation: 1.2 })
defineMaterial('street_paint_green_dark', { color: 0x34483a, gloss: 0.15, surface: SURF.METAL, variation: 1.1 })
defineMaterial('street_paint_black', { color: 0x262728, gloss: 0.2, surface: SURF.METAL })
defineMaterial('street_rust_light', { color: 0x87593b, surface: SURF.METAL, variation: 1.7 })
defineMaterial('street_galvanized', { color: 0x868b8c, gloss: 0.25, surface: SURF.METAL, variation: 0.9 })
defineMaterial('street_cast_iron', { color: 0x2f2e2c, gloss: 0.1, surface: SURF.METAL, variation: 1.2 })
defineMaterial('street_tin', { color: 0x9a9e9b, gloss: 0.35, surface: SURF.METAL, variation: 0.8 })
defineMaterial('street_glasswool', { color: 0xa8915a, surface: SURF.WOOD, variation: 1.6 })
defineMaterial('street_cardboard', { color: 0x84704f, surface: SURF.WOOD, variation: 1.2 })
defineMaterial('street_plastic_blue', { color: 0x3c5a7e, gloss: 0.3, surface: SURF.CONCRETE })
defineMaterial('street_mail_blue', { color: 0x2d4e78, gloss: 0.25, surface: SURF.METAL })
defineMaterial('street_fabric_beige', { color: 0x9c8664, surface: SURF.CARPET, variation: 1.3 })
defineMaterial('street_tinsel', { color: 0xbfa95e, gloss: 0.85, surface: SURF.WOOD, solid: false })
defineMaterial('street_po2_face', { color: 0x86837d, surface: SURF.CONCRETE, variation: 0.45 })
defineMaterial('street_po2_rib', { color: 0xa4a199, surface: SURF.CONCRETE, variation: 0.35 })

// emissive
defineMaterial('street_lamp_mercury', { color: 0xdce8e8, emit: EMIT_STREET, emitColor: 0xcfe6e8, emitIntensity: 7.0 })
defineMaterial('street_lamp_globe', { color: 0xcfcabd, emit: EMIT_STREET, emitColor: 0xffc27a, emitIntensity: 3.2, gloss: 0.3 })
defineMaterial('street_lamp_incandescent', { color: 0xf0dcb8, emit: EMIT_CONST, emitColor: 0xffc47a, emitIntensity: 3.6 })
defineMaterial('street_signal_red', { color: 0x5a1a14, emit: EMIT_CONST, emitColor: 0xff2a12, emitIntensity: 6.0, gloss: 0.6 })
defineMaterial('street_signal_yellow', { color: 0x5e4416, emit: EMIT_CONST, emitColor: 0xffa818, emitIntensity: 6.0, gloss: 0.6 })
defineMaterial('street_signal_green', { color: 0x14402e, emit: EMIT_CONST, emitColor: 0x3cffa8, emitIntensity: 5.0, gloss: 0.6 })
defineMaterial('street_led_green', { color: 0x1d3a2a, emit: EMIT_CONST, emitColor: 0x5cdc8c, emitIntensity: 1.2, gloss: 0.5 })
defineMaterial('street_screen', { color: 0x1c2630, emit: EMIT_CONST, emitColor: 0x8fb6e6, emitIntensity: 1.3, gloss: 0.6 })
defineMaterial('street_lightbox', { color: 0xc9cdca, emit: EMIT_STREET, emitColor: 0xeef4ff, emitIntensity: 1.6 })
defineMaterial('street_tube', { color: 0xe6efe8, emit: EMIT_STREET, emitColor: 0xd6f0e0, emitIntensity: 2.6 })
