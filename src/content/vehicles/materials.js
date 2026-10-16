// Vehicle materials. Car bodies use the core per-instance `paint` (tint); everything here is the
// fixed-colour hardware around it: lamp lenses (emissive, gated by the placement flag so parked
// cars stay dark and moving ones glow), dirty rims, slush grime, transit liveries, the train.

import { defineMaterial, SURF, EMIT_CONST, EMIT_FLUOR } from '../../core/materials.js'

// lamps (EMIT_CONST × placement.flag: flag 0 = parked/off, 1 = driving)
defineMaterial('veh_headlamp', { color: 0xb9c0c4, emit: EMIT_CONST, emitColor: 0xfff0d2, emitIntensity: 7.0, gloss: 0.8, surface: SURF.METAL, variation: 0.3 })
defineMaterial('veh_taillamp', { color: 0x5c1612, emit: EMIT_CONST, emitColor: 0xff2210, emitIntensity: 3.2, gloss: 0.6, surface: SURF.METAL, variation: 0.4 })
defineMaterial('veh_indicator', { color: 0x9a6428, gloss: 0.5, surface: SURF.METAL, variation: 0.4 })
defineMaterial('veh_marker', { color: 0x8a5a1c, emit: EMIT_CONST, emitColor: 0xffa030, emitIntensity: 2.4, gloss: 0.5, surface: SURF.METAL })
defineMaterial('veh_beacon', { color: 0xa85c14, emit: EMIT_CONST, emitColor: 0xffa000, emitIntensity: 9.0, gloss: 0.6, surface: SURF.METAL })

// running gear, trim, dirt
defineMaterial('veh_rim', { color: 0x5d5f60, gloss: 0.3, surface: SURF.METAL, variation: 0.8 })
defineMaterial('veh_under', { color: 0x1c1b1a, surface: SURF.METAL, variation: 0.6 })
defineMaterial('veh_grime', { color: 0x5b5449, surface: SURF.METAL, variation: 1.5 })
defineMaterial('veh_salt', { color: 0x8d897f, surface: SURF.METAL, variation: 1.4 })

// glass: see-through for buses/trolleybuses/trains (lit interiors behind it), far LOD = lit pane
defineMaterial('veh_window_far', { color: 0x262b2e, emit: EMIT_CONST, emitColor: 0xd8dcc4, emitIntensity: 1.1, gloss: 0.6, surface: SURF.METAL })
defineMaterial('veh_glass_clear', { color: 0x93a6ad, transparent: true, gloss: 0.9, surface: SURF.METAL, lod: 'veh_window_far' })
defineMaterial('veh_ceiling_lamp', { color: 0xdfe6dc, emit: EMIT_FLUOR, emitColor: 0xe6f2e2, emitIntensity: 3.0 })
defineMaterial('veh_ceiling_warm', { color: 0xe8dcc0, emit: EMIT_CONST, emitColor: 0xffd9a0, emitIntensity: 2.6 })
defineMaterial('veh_seat', { color: 0x4a2e26, surface: SURF.WOOD, variation: 1.2 })
defineMaterial('veh_floor', { color: 0x3a3632, surface: SURF.METAL, variation: 1.2 })
defineMaterial('veh_handrail', { color: 0xa88a3c, gloss: 0.4, surface: SURF.METAL })

// transit liveries (Mosgortrans trolleybus 2002 scheme, toned down for the winter palette)
defineMaterial('veh_tb_blue', { color: 0x2b4f8c, gloss: 0.3, surface: SURF.METAL, variation: 0.8 })
defineMaterial('veh_tb_white', { color: 0xd9d8cf, gloss: 0.3, surface: SURF.METAL, variation: 0.7 })
defineMaterial('veh_tb_ochre', { color: 0xa98a4f, gloss: 0.2, surface: SURF.METAL, variation: 1.0 })
defineMaterial('veh_orange', { color: 0xc8611f, gloss: 0.25, surface: SURF.METAL, variation: 1.0 })

// elektrichka (ER2-style: green body, grey roof, cream stripe, red front)
defineMaterial('veh_train_green', { color: 0x3c5a45, gloss: 0.25, surface: SURF.METAL, variation: 0.9 })
defineMaterial('veh_train_stripe', { color: 0xbdb38f, gloss: 0.2, surface: SURF.METAL, variation: 0.8 })
defineMaterial('veh_train_red', { color: 0x8a2f27, gloss: 0.25, surface: SURF.METAL, variation: 0.9 })
defineMaterial('veh_train_roof', { color: 0x5f625f, gloss: 0.1, surface: SURF.METAL, variation: 1.3 })
