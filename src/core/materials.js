// Material palette. Every voxel stores a material id (0 = air). The GPU reads material
// properties from a palette texture, so colors can be tuned without re-meshing.
//
// Content modules may add materials with defineMaterial() at import time (before the
// palette texture is built in Game.init).

import * as THREE from 'three'

/** Emissive kinds (palette flag). */
export const EMIT_NONE = 0
/** Apartment window glass: lit/dark decided per window in the shader (hash of instance seed + window id). */
export const EMIT_WINDOW = 1
/** Constant emissive (lamp heads, lit signs, bulbs). Scaled by `night` factor if `nightOnly`. */
export const EMIT_CONST = 2
/** Fluorescent tube: constant with subtle 100 Hz shimmer and occasional flicker. */
export const EMIT_FLUOR = 3
/** CRT/TV screen: bluish flicker. */
export const EMIT_TV = 4
/** Stairwell / public window seen from afar (dim lit, LOD replacement for clear glass). */
export const EMIT_STAIRWIN = 5
/** Street light head: on only when street lights are on. */
export const EMIT_STREET = 6

/** Footstep surface classes. */
export const SURF = {
  NONE: 0, SNOW: 1, SNOW_PACKED: 2, ICE: 3, SLUSH: 4, CONCRETE: 5, ASPHALT: 6,
  METAL: 7, TILE: 8, WOOD: 9, LINOLEUM: 10, GRAVEL: 11, CARPET: 12, METAL_GRATE: 13,
}

const materials = [] // index = id
const byName = new Map()

/**
 * Define a material.
 * @param {string} name unique name
 * @param {object} p
 * @param {number} p.color sRGB hex albedo
 * @param {number} [p.emit] EMIT_* kind
 * @param {number} [p.emitColor] sRGB hex emissive color (defaults to color)
 * @param {number} [p.emitIntensity] emissive strength (HDR, 1 = albedo-white brightness)
 * @param {number} [p.gloss] 0..1 specular glossiness (wet asphalt, ice, glass, paint)
 * @param {boolean} [p.paint] albedo replaced by per-instance tint color
 * @param {boolean} [p.snow] snow-like surface (sparkles, accumulates)
 * @param {boolean} [p.transparent] clear glass; rendered in a separate blended pass
 * @param {boolean} [p.solid=true] collides with player
 * @param {number} [p.surface] SURF.* footstep class
 * @param {number} [p.variation=1] per-voxel brightness variation multiplier
 * @param {number} [p.lod] material used in place of this one in far LODs (by name)
 */
export function defineMaterial(name, p) {
  if (byName.has(name)) return byName.get(name).id
  const id = materials.length === 0 ? 1 : materials.length
  if (materials.length === 0) materials.push(null) // id 0 = air
  if (id > 255) throw new Error('Too many materials')
  const m = {
    id, name,
    color: p.color ?? 0xff00ff,
    emit: p.emit ?? EMIT_NONE,
    emitColor: p.emitColor ?? p.color ?? 0xffffff,
    emitIntensity: p.emitIntensity ?? 0,
    gloss: p.gloss ?? 0,
    paint: !!p.paint,
    snow: !!p.snow,
    transparent: !!p.transparent,
    solid: p.solid ?? true,
    surface: p.surface ?? SURF.CONCRETE,
    variation: p.variation ?? 1,
    lod: p.lod ?? null,
  }
  materials[id] = m
  byName.set(name, m)
  // keep hot-path tables valid during content build (before the palette texture exists)
  SOLID[id] = m.solid ? 1 : 0
  TRANSPARENT[id] = m.transparent ? 1 : 0
  SURFACE[id] = m.surface
  LOD_REMAP[id] = id
  return id
}

/** Material id by name (throws if missing — catches typos early). */
export function M(name) {
  const m = byName.get(name)
  if (!m) throw new Error(`Unknown material "${name}"`)
  return m.id
}
export function hasMaterial(name) { return byName.has(name) }
export function materialById(id) { return materials[id] }
export function materialCount() { return materials.length }

/** Lookup tables used by hot paths (mesher, collision). Rebuilt by buildPaletteTexture. */
export const SOLID = new Uint8Array(256)
export const TRANSPARENT = new Uint8Array(256)
export const SURFACE = new Uint8Array(256)
export const LOD_REMAP = new Uint8Array(256)

function refreshTables() {
  for (let i = 0; i < 256; i++) {
    const m = materials[i]
    SOLID[i] = m ? (m.solid ? 1 : 0) : 0
    TRANSPARENT[i] = m && m.transparent ? 1 : 0
    SURFACE[i] = m ? m.surface : 0
    LOD_REMAP[i] = i
  }
  for (let i = 1; i < materials.length; i++) {
    const m = materials[i]
    if (m && m.lod && byName.has(m.lod)) LOD_REMAP[i] = byName.get(m.lod).id
  }
}

const tmpColor = new THREE.Color()
let paletteTexture = null

/**
 * Palette texture layout (256 x 2, RGBA float, linear color):
 *   row 0: albedo.rgb, gloss
 *   row 1: emissive.rgb * intensity, packed flags (emit + 8*paint + 16*snow + 32*transparent) + variation/16 fractional
 */
export function buildPaletteTexture() {
  refreshTables()
  const data = new Float32Array(256 * 2 * 4)
  for (let i = 1; i < materials.length; i++) {
    const m = materials[i]
    if (!m) continue
    tmpColor.setHex(m.color, THREE.SRGBColorSpace) // converts to linear working space
    data[i * 4 + 0] = tmpColor.r
    data[i * 4 + 1] = tmpColor.g
    data[i * 4 + 2] = tmpColor.b
    data[i * 4 + 3] = m.gloss
    tmpColor.setHex(m.emitColor, THREE.SRGBColorSpace)
    const o = (256 + i) * 4
    data[o + 0] = tmpColor.r * m.emitIntensity
    data[o + 1] = tmpColor.g * m.emitIntensity
    data[o + 2] = tmpColor.b * m.emitIntensity
    const flags = m.emit + 8 * (m.paint ? 1 : 0) + 16 * (m.snow ? 1 : 0) + 32 * (m.transparent ? 1 : 0)
    data[o + 3] = flags + Math.min(0.99, m.variation / 4)
  }
  if (!paletteTexture) {
    paletteTexture = new THREE.DataTexture(data, 256, 2, THREE.RGBAFormat, THREE.FloatType)
    paletteTexture.magFilter = THREE.NearestFilter
    paletteTexture.minFilter = THREE.NearestFilter
    paletteTexture.generateMipmaps = false
  } else {
    paletteTexture.image.data = data
  }
  paletteTexture.needsUpdate = true
  return paletteTexture
}

export function getPaletteTexture() { return paletteTexture || buildPaletteTexture() }

// ---------------------------------------------------------------------------------------
// Core materials. Palette: dirty whites, blue-gray snow, desaturated cyan, faded concrete,
// muted brown, dull green, occasional warm amber light.
// ---------------------------------------------------------------------------------------

// Ground & snow
defineMaterial('snow', { color: 0xdfe4ea, snow: true, surface: SURF.SNOW, variation: 0.6 })
defineMaterial('snow_fresh', { color: 0xeef1f5, snow: true, surface: SURF.SNOW, variation: 0.4 })
defineMaterial('snow_packed', { color: 0xbfc3c6, snow: true, surface: SURF.SNOW_PACKED, variation: 0.9 })
defineMaterial('snow_dirty', { color: 0x9c9890, snow: true, surface: SURF.SNOW_PACKED, variation: 1.4 })
defineMaterial('snow_bank', { color: 0xb3b2ad, snow: true, surface: SURF.SNOW, variation: 1.2 })
defineMaterial('slush', { color: 0x5d564d, gloss: 0.55, surface: SURF.SLUSH, variation: 1.2 })
defineMaterial('ice', { color: 0x9fb0bb, gloss: 0.8, surface: SURF.ICE, variation: 0.5 })
defineMaterial('asphalt', { color: 0x4a4a4c, surface: SURF.ASPHALT, variation: 0.8 })
defineMaterial('asphalt_wet', { color: 0x38383a, gloss: 0.65, surface: SURF.SLUSH, variation: 0.6 })
defineMaterial('road_marking', { color: 0xa9a69c, gloss: 0.3, surface: SURF.ASPHALT })
defineMaterial('curb', { color: 0x8d8b86, surface: SURF.CONCRETE })
defineMaterial('earth', { color: 0x4b4038, surface: SURF.GRAVEL })
defineMaterial('gravel', { color: 0x6d675f, surface: SURF.GRAVEL })

// Concrete & building shells
defineMaterial('concrete', { color: 0x8f8d88, surface: SURF.CONCRETE })
defineMaterial('concrete_dark', { color: 0x67655f, surface: SURF.CONCRETE })
defineMaterial('concrete_light', { color: 0xaeaca5, surface: SURF.CONCRETE })
defineMaterial('panel_white', { color: 0xb9b6ad, surface: SURF.CONCRETE, variation: 0.7 })
defineMaterial('panel_gray', { color: 0x9a9893, surface: SURF.CONCRETE, variation: 0.7 })
defineMaterial('panel_beige', { color: 0xb5a58c, surface: SURF.CONCRETE, variation: 0.7 })
defineMaterial('panel_seam', { color: 0x6f6b64, surface: SURF.CONCRETE, variation: 0.5 })
defineMaterial('tile_blue', { color: 0x6f8590, surface: SURF.CONCRETE, variation: 1.2 })
defineMaterial('tile_teal', { color: 0x5f8580, surface: SURF.CONCRETE, variation: 1.2 })
defineMaterial('tile_brown', { color: 0x7c6655, surface: SURF.CONCRETE, variation: 1.2 })
defineMaterial('tile_cream', { color: 0xc4b89c, surface: SURF.CONCRETE, variation: 1.2 })
defineMaterial('brick_red', { color: 0x8a5444, surface: SURF.CONCRETE, variation: 1.6 })
defineMaterial('brick_silicate', { color: 0xb8b2a4, surface: SURF.CONCRETE, variation: 1.3 })
defineMaterial('plaster_yellow', { color: 0xbfa36e, surface: SURF.CONCRETE })
defineMaterial('plaster_pink', { color: 0xb08a80, surface: SURF.CONCRETE })
defineMaterial('roof_tar', { color: 0x3a3836, surface: SURF.ASPHALT })

// Metals
defineMaterial('metal_dark', { color: 0x3c3e40, gloss: 0.25, surface: SURF.METAL })
defineMaterial('metal_gray', { color: 0x777a7c, gloss: 0.3, surface: SURF.METAL })
defineMaterial('metal_rust', { color: 0x6b4434, surface: SURF.METAL, variation: 1.6 })
defineMaterial('metal_green', { color: 0x4f6450, gloss: 0.2, surface: SURF.METAL })
defineMaterial('metal_blue', { color: 0x47607a, gloss: 0.2, surface: SURF.METAL })
defineMaterial('metal_red', { color: 0x8a3a30, gloss: 0.2, surface: SURF.METAL })
defineMaterial('metal_yellow', { color: 0xb0903a, gloss: 0.2, surface: SURF.METAL })
defineMaterial('metal_brown', { color: 0x5a4636, gloss: 0.2, surface: SURF.METAL })
defineMaterial('chrome', { color: 0xa9adb0, gloss: 0.9, surface: SURF.METAL })
defineMaterial('pole_concrete', { color: 0x9d9a92, surface: SURF.CONCRETE })

// Wood & organic
defineMaterial('wood', { color: 0x7a5e44, surface: SURF.WOOD, variation: 1.3 })
defineMaterial('wood_dark', { color: 0x4a3a2c, surface: SURF.WOOD, variation: 1.3 })
defineMaterial('wood_painted_green', { color: 0x4d6248, surface: SURF.WOOD })
defineMaterial('wood_painted_blue', { color: 0x4f6a80, surface: SURF.WOOD })
defineMaterial('bark_birch', { color: 0xcfcbc0, surface: SURF.WOOD, variation: 2.0 })
defineMaterial('bark_birch_dark', { color: 0x2e2b28, surface: SURF.WOOD })
defineMaterial('bark', { color: 0x4a4036, surface: SURF.WOOD, variation: 1.4 })
defineMaterial('branch', { color: 0x3b332c, surface: SURF.WOOD, variation: 1.2 })
defineMaterial('twig', { color: 0x4d443b, surface: SURF.WOOD, solid: false })
defineMaterial('needles', { color: 0x2c3a30, surface: SURF.WOOD, variation: 1.4 })
defineMaterial('shrub', { color: 0x3d342c, surface: SURF.WOOD, solid: false })
defineMaterial('rubber', { color: 0x1f1f20, surface: SURF.CONCRETE })

// Glass
defineMaterial('window', { color: 0x1d2329, emit: EMIT_WINDOW, emitColor: 0xffc98a, emitIntensity: 1.6, gloss: 0.7, surface: SURF.CONCRETE })
defineMaterial('glass_clear', { color: 0x9fb4bf, transparent: true, gloss: 0.9, surface: SURF.CONCRETE, lod: 'stair_window_far' })
defineMaterial('stair_window_far', { color: 0x2a3036, emit: EMIT_STAIRWIN, emitColor: 0xc8d0b0, emitIntensity: 0.55, gloss: 0.5 })
defineMaterial('glass_car', { color: 0x1a1f24, gloss: 0.85, surface: SURF.METAL })
defineMaterial('glass_frosted', { color: 0x6d7b84, gloss: 0.3, surface: SURF.CONCRETE })
defineMaterial('window_frame_white', { color: 0xc9c7c0, surface: SURF.WOOD })
defineMaterial('window_frame_brown', { color: 0x5b4535, surface: SURF.WOOD })
defineMaterial('window_frame_wood', { color: 0x8b8378, surface: SURF.WOOD, variation: 1.4 })

// Lights / emissive
defineMaterial('lamp_sodium', { color: 0xffd0a0, emit: EMIT_STREET, emitColor: 0xffa244, emitIntensity: 9.0 })
defineMaterial('lamp_warm', { color: 0xffe0b0, emit: EMIT_CONST, emitColor: 0xffc070, emitIntensity: 6.0 })
defineMaterial('lamp_bulb', { color: 0xfff0d0, emit: EMIT_CONST, emitColor: 0xffd090, emitIntensity: 5.0 })
defineMaterial('lamp_cold', { color: 0xe8f0ff, emit: EMIT_CONST, emitColor: 0xd8e6ff, emitIntensity: 5.0 })
defineMaterial('fluorescent', { color: 0xf0fff8, emit: EMIT_FLUOR, emitColor: 0xdfffee, emitIntensity: 4.0 })
defineMaterial('lamp_red', { color: 0xff3020, emit: EMIT_CONST, emitColor: 0xff2010, emitIntensity: 6.0 })
defineMaterial('tv_screen', { color: 0x202833, emit: EMIT_TV, emitColor: 0x9fc0ff, emitIntensity: 2.0 })
defineMaterial('headlight', { color: 0xfff6e0, emit: EMIT_CONST, emitColor: 0xfff0d8, emitIntensity: 6.0 })
defineMaterial('taillight', { color: 0x701010, emit: EMIT_CONST, emitColor: 0xff1a0a, emitIntensity: 2.5 })

// Paint (per-instance tint): car bodies, accent panels, painted playground parts
defineMaterial('paint', { color: 0xffffff, paint: true, gloss: 0.35, surface: SURF.METAL })
defineMaterial('paint_matte', { color: 0xffffff, paint: true, gloss: 0.0, surface: SURF.METAL })

// Interior finishes
defineMaterial('linoleum', { color: 0x7a5f4a, gloss: 0.2, surface: SURF.LINOLEUM })
defineMaterial('floor_tile', { color: 0x8a7a6c, gloss: 0.15, surface: SURF.TILE, variation: 1.4 })
defineMaterial('floor_tile_red', { color: 0x80463a, gloss: 0.15, surface: SURF.TILE, variation: 1.4 })
defineMaterial('wall_paint_green', { color: 0x4f6e5c, gloss: 0.25, surface: SURF.CONCRETE })
defineMaterial('wall_paint_blue', { color: 0x4f6478, gloss: 0.25, surface: SURF.CONCRETE })
defineMaterial('wall_paint_brown', { color: 0x6a5040, gloss: 0.25, surface: SURF.CONCRETE })
defineMaterial('whitewash', { color: 0xc7c5bc, surface: SURF.CONCRETE, variation: 0.8 })
defineMaterial('wall_tile_white', { color: 0xc3c4bb, gloss: 0.35, surface: SURF.TILE, variation: 0.9 })
defineMaterial('wall_tile_beige', { color: 0xb8a98c, gloss: 0.35, surface: SURF.TILE, variation: 0.9 })
defineMaterial('marble_white', { color: 0xc8c4ba, gloss: 0.45, surface: SURF.TILE, variation: 1.1 })
defineMaterial('marble_gray', { color: 0x8e8c88, gloss: 0.45, surface: SURF.TILE, variation: 1.1 })
defineMaterial('granite', { color: 0x5e5a58, gloss: 0.35, surface: SURF.TILE, variation: 1.5 })
defineMaterial('wallpaper', { color: 0x9c8a6a, surface: SURF.CONCRETE })
defineMaterial('leatherette', { color: 0x4a2f26, surface: SURF.WOOD })
defineMaterial('fabric_red', { color: 0x6e2a26, surface: SURF.CARPET })
defineMaterial('plastic_white', { color: 0xc9c6bd, surface: SURF.CONCRETE })
defineMaterial('plastic_dark', { color: 0x2c2c2e, surface: SURF.CONCRETE })
defineMaterial('paper', { color: 0xd4cfbf, surface: SURF.CONCRETE, solid: false })
