// Materials of the metro package. Deliberately few (the palette is shared by every package and
// holds at most 255 ids); every definition is guarded so a full palette degrades to the closest
// core material instead of taking the package down at import time.

import { defineMaterial, M, SURF, EMIT_CONST, hasMaterial } from '../../core/materials.js'

function def(name, props, fallback) {
  try {
    return defineMaterial(name, props)
  } catch (e) {
    console.warn(`[metro] material "${name}" unavailable (${e.message}); using "${fallback}"`)
    return hasMaterial(fallback) ? M(fallback) : M('concrete')
  }
}

/** Material ids used by the metro package (resolved at import time). */
export const MAT = {
  air: 0,
  // ---- core materials we reuse
  concrete: M('concrete'),
  concreteDark: M('concrete_dark'),
  concreteLight: M('concrete_light'),
  curb: M('curb'),
  whitewash: M('whitewash'),
  tileWhite: M('wall_tile_white'),
  tileBeige: M('wall_tile_beige'),
  tileBrown: M('tile_brown'),
  tileCream: M('tile_cream'),
  tileBlue: M('tile_blue'),
  tileTeal: M('tile_teal'),
  marbleWhite: M('marble_white'),
  marbleGray: M('marble_gray'),
  granite: M('granite'),
  floorTile: M('floor_tile'),
  floorTileRed: M('floor_tile_red'),
  metalDark: M('metal_dark'),
  metalGray: M('metal_gray'),
  metalRust: M('metal_rust'),
  metalBlue: M('metal_blue'),
  metalGreen: M('metal_green'),
  metalRed: M('metal_red'),
  metalYellow: M('metal_yellow'),
  metalBrown: M('metal_brown'),
  chrome: M('chrome'),
  rubber: M('rubber'),
  wood: M('wood'),
  woodDark: M('wood_dark'),
  glass: M('glass_clear'),
  glassFrosted: M('glass_frosted'),
  plasticWhite: M('plastic_white'),
  plasticDark: M('plastic_dark'),
  leatherette: M('leatherette'),
  linoleum: M('linoleum'),
  fabricRed: M('fabric_red'),
  needles: M('needles'),
  paper: M('paper'),
  fluorescent: M('fluorescent'),
  lampWarm: M('lamp_warm'),
  lampBulb: M('lamp_bulb'),
  lampCold: M('lamp_cold'),
  lampRed: M('lamp_red'),
  headlight: M('headlight'),
  taillight: M('taillight'),
  tv: M('tv_screen'),
  snow: M('snow'),
  snowFresh: M('snow_fresh'),
  snowPacked: M('snow_packed'),
  snowDirty: M('snow_dirty'),
  snowBank: M('snow_bank'),
  ice: M('ice'),
  slush: M('slush'),
  paint: M('paint'),
  paintMatte: M('paint_matte'),
  poleConcrete: M('pole_concrete'),

  // ---- metro-only materials
  /** glazed pale-yellow ceramic tile of the track walls */
  tileYellow: def('metro_tile_yellow', { color: 0xcdbb88, gloss: 0.4, surface: SURF.TILE, variation: 0.8 }, 'tile_cream'),
  /** black gabbro bands in the granite floor */
  gabbro: def('metro_gabbro', { color: 0x2a292a, gloss: 0.55, surface: SURF.TILE, variation: 0.6 }, 'granite'),
  /** a second, slightly lighter grey granite: alternating floor slabs */
  graniteGrey: def('metro_granite_grey', { color: 0x6b6966, gloss: 0.35, surface: SURF.TILE, variation: 1.2 }, 'granite'),
  /** light grey granite: platform edge stones, the limit line, salt-whitened floor */
  graniteLight: def('metro_granite_light', { color: 0x9a968e, gloss: 0.35, surface: SURF.TILE, variation: 1.0 }, 'concrete_light'),
  /** meltwater puddle, flush with the floor */
  wet: def('metro_floor_wet', { color: 0x2c2d2f, gloss: 0.9, surface: SURF.SLUSH, variation: 0.3 }, 'ice'),
  /** ribbed aluminium escalator steps */
  step: def('metro_esc_step', { color: 0x868b8e, gloss: 0.5, surface: SURF.METAL, variation: 0.5 }, 'metal_gray'),
  /** 81-717 livery: blue-green lower body */
  carLower: def('metro_car_lower', { color: 0x2b5461, gloss: 0.35, surface: SURF.METAL, variation: 0.4 }, 'metal_blue'),
  /** 81-717 livery: grey upper body / window band */
  carUpper: def('metro_car_upper', { color: 0x97a0a3, gloss: 0.3, surface: SURF.METAL, variation: 0.4 }, 'metal_gray'),
  /** beige decorative plastic inside the cars */
  carWall: def('metro_car_wall', { color: 0xd1c6ae, gloss: 0.2, surface: SURF.LINOLEUM, variation: 0.4 }, 'plastic_white'),
  /** lit kiosk interior (warm) — glows behind the glass whatever the lights do */
  kioskWarm: def('metro_kiosk_warm', { color: 0xb49870, emit: EMIT_CONST, emitColor: 0xffcf90, emitIntensity: 0.75 }, 'lamp_warm'),
  /** lit kiosk interior (cold fluorescent) */
  kioskCold: def('metro_kiosk_cold', { color: 0x9db0b6, emit: EMIT_CONST, emitColor: 0xd6ecff, emitIntensity: 0.7 }, 'lamp_cold'),
  /** sooty tunnel concrete */
  soot: def('metro_soot', { color: 0x37342f, surface: SURF.CONCRETE, variation: 1.3 }, 'concrete_dark'),
  /** green signal / turnstile arrow */
  signalGreen: def('metro_signal_green', { color: 0x1d6a3a, emit: EMIT_CONST, emitColor: 0x30ff80, emitIntensity: 1.6 }, 'lamp_cold'),
  /** faces and hands of the passenger silhouettes */
  skin: def('metro_skin', { color: 0xb09482, surface: SURF.CARPET, variation: 0.3 }, 'plastic_white'),
  /** dark-blue metro staff uniform */
  uniform: def('metro_uniform', { color: 0x25304a, surface: SURF.CARPET, variation: 0.6 }, 'metal_blue'),
  /** greenish polycarbonate of the stair canopies (see-through) */
  polycarb: def('metro_polycarb', { color: 0x86a596, transparent: true, gloss: 0.6, surface: SURF.METAL }, 'glass_clear'),
}
