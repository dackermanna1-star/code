// Nature materials. Kept deliberately few (the palette is shared by every package, ≤255 ids).
// Every definition is guarded: if the palette is ever full, the material falls back to the
// closest core material instead of taking the whole package down at import time.

import { defineMaterial, M, SURF, hasMaterial } from '../../core/materials.js'

function def(name, props, fallback) {
  try {
    return defineMaterial(name, props)
  } catch (e) {
    console.warn(`[nature] material "${name}" unavailable (${e.message}); using "${fallback}"`)
    return hasMaterial(fallback) ? M(fallback) : M('snow')
  }
}

/** Material ids used by the nature package (resolved at import time). */
export const MAT = {
  // --- core materials we reuse
  air: 0,
  snow: M('snow'),
  snowFresh: M('snow_fresh'),
  snowPacked: M('snow_packed'),
  snowDirty: M('snow_dirty'),
  snowBank: M('snow_bank'),
  slush: M('slush'),
  ice: M('ice'),
  earth: M('earth'),
  barkBirch: M('bark_birch'),
  barkBirchDark: M('bark_birch_dark'),
  bark: M('bark'),
  branchSolid: M('branch'),
  twig: M('twig'), // non-solid, generic dark twig
  wood: M('wood'),
  woodDark: M('wood_dark'),
  rubber: M('rubber'),
  metalDark: M('metal_dark'),
  metalGray: M('metal_gray'),
  metalRust: M('metal_rust'),
  metalRed: M('metal_red'),
  chrome: M('chrome'),
  concreteDark: M('concrete_dark'),
  paint: M('paint'),
  plasticWhite: M('plastic_white'),

  // --- trunks (solid)
  barkPoplar: def('nature_bark_poplar', { color: 0x777b71, surface: SURF.WOOD, variation: 1.5 }, 'bark'),
  lime: def('nature_lime', { color: 0xc9cdcc, surface: SURF.WOOD, variation: 1.6 }, 'whitewash'),

  // --- branches & twigs (non-solid: the player never snags or climbs on them)
  limbBirch: def('nature_limb_birch', { color: 0xb3ada2, surface: SURF.WOOD, variation: 1.6, solid: false }, 'twig'),
  branch: def('nature_branch', { color: 0x463d35, surface: SURF.WOOD, variation: 1.3, solid: false }, 'twig'),
  twigBirch: def('nature_twig_birch', { color: 0x67534b, surface: SURF.WOOD, variation: 1.2, solid: false }, 'twig'),
  twigGrey: def('nature_twig_grey', { color: 0x6b685d, surface: SURF.WOOD, variation: 1.3, solid: false }, 'twig'),
  snowBranch: def('nature_snow_branch', { color: 0xe2e6ec, snow: true, surface: SURF.SNOW, variation: 0.5, solid: false }, 'snow'),
  needles: def('nature_needles', { color: 0x27362c, surface: SURF.WOOD, variation: 1.5, solid: false }, 'needles'),
  needlesBlue: def('nature_needles_blue', { color: 0x4a5b5c, surface: SURF.WOOD, variation: 1.3, solid: false }, 'needles'),
  seeds: def('nature_seeds', { color: 0x6f5a45, surface: SURF.WOOD, variation: 1.4, solid: false }, 'twig'),
  berryRed: def('nature_berry_red', { color: 0x8c2a21, surface: SURF.WOOD, variation: 1.2, solid: false }, 'twig'),
  berryWhite: def('nature_berry_white', { color: 0xd3d1c6, surface: SURF.WOOD, variation: 0.6, solid: false }, 'snow'),
  straw: def('nature_straw', { color: 0xa8976f, surface: SURF.WOOD, variation: 1.5, solid: false }, 'twig'),
  stalk: def('nature_stalk', { color: 0x67594a, surface: SURF.WOOD, variation: 1.4, solid: false }, 'twig'),

  // --- ground (terrain) materials
  icePond: def('nature_ice', { color: 0x8fa3ad, gloss: 0.8, surface: SURF.ICE, variation: 0.5 }, 'ice'),
  iceDark: def('nature_ice_dark', { color: 0x4f626c, gloss: 0.92, surface: SURF.ICE, variation: 0.35 }, 'ice'),
  iceCrack: def('nature_ice_crack', { color: 0xc7d2d8, gloss: 0.5, surface: SURF.ICE, variation: 0.4 }, 'ice'),
  snowGrime: def('nature_snow_grime', { color: 0x6b6358, snow: true, surface: SURF.SNOW_PACKED, variation: 1.6 }, 'snow_dirty'),
}

/** Wood/twig material classes used by the tree LOD reducer. */
export const THIN = new Set([MAT.twig, MAT.twigBirch, MAT.twigGrey, MAT.seeds, MAT.berryRed, MAT.berryWhite, MAT.straw, MAT.stalk])
export const SNOWY = new Set([MAT.snowBranch])
