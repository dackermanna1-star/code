// Procedural 16x16 block textures (Minecraft-style pixel art, autumn / post-apocalyptic small town).
//
//   generateTextures(names, size = 16) -> { size, layers: Map<name, layerIndex>, data: Uint8Array }
//
// data is RGBA8, layer-major (layer li occupies size*size*4 bytes starting at li*size*size*4), row 0 = TOP row of
// the image. Pure JS (no DOM) so it also runs in Node; deterministic (hash-seeded tileable noise, never
// Math.random). Textures are authored at 16x16; other sizes are produced by nearest-neighbour resampling.
//
// Generators live in ./textures/*.js. Each one receives a fresh 16x16 Img and a context {name, seed, rng}.
import { S, Img, seedFromString, makeRng } from './textures/core.js';
import { NATURE } from './textures/nature.js';
import { BUILDING } from './textures/building.js';
import { INTERIOR } from './textures/interior.js';
import { FURNITURE } from './textures/furniture.js';
import { PROPS } from './textures/props.js';
import { SIGNS, signGenerator } from './textures/signs.js';
import { OVERLAYS, overlayGenerator } from './textures/overlays.js';

export const TEXTURE_GENERATORS = { ...NATURE, ...BUILDING, ...INTERIOR, ...FURNITURE, ...PROPS, ...SIGNS, ...OVERLAYS };

// Alpha handling. Cutout textures are forced to alpha 0/255, translucent ones keep their alpha, and everything
// else is forced fully opaque (so a stray transparent pixel can never punch a hole into a wall).
const CUTOUT = new Set([
  'leaves_oak', 'leaves_birch', 'leaves_pine', 'leaves_autumn', 'leaves_autumn_red',
  'tall_grass', 'fern', 'flower_red', 'flower_yellow', 'flower_white', 'dead_bush', 'reeds', 'wheat',
  'corn_bottom', 'corn_top', 'bush', 'berry_bush',
  'fence_picket', 'fence_wood', 'fence_chainlink', 'iron_bars', 'barricade', 'ladder', 'barbed_wire', 'camo_net',
  'glass_broken', 'clothing_rack', 'fire', 'lantern', 'destroy_1', 'destroy_2', 'destroy_3', 'destroy_4',
]);
const TRANSLUCENT = new Set(['glass', 'glass_shop', 'water']);
export function alphaMode(name) {
  if (CUTOUT.has(name)) return 'cutout';
  if (TRANSLUCENT.has(name)) return 'blend';
  return 'opaque';
}

function resolveGenerator(name) {
  return TEXTURE_GENERATORS[name] || signGenerator(name) || overlayGenerator(name) || null;
}

/** Missing-texture fallback: magenta / black checker. */
function fallback(img) {
  img.each((x, y) => img.set(x, y, ((x >> 2) + (y >> 2)) & 1 ? [16, 16, 16] : [220, 0, 200]));
}

/** Render one texture by name into a new 16x16 Img (exported for tools / icons). */
export function renderTexture(name) {
  const img = new Img(S, S);
  const gen = resolveGenerator(name);
  const ctx = { name, seed: seedFromString(name), rng: makeRng(seedFromString(name)) };
  if (gen) {
    const out = gen(img, ctx);
    return out instanceof Img ? out : img;
  }
  fallback(img);
  return img;
}

export function hasTexture(name) {
  return !!resolveGenerator(name);
}

export function generateTextures(names, size = 16) {
  const layers = new Map();
  const data = new Uint8Array(size * size * 4 * names.length);
  const clamped = new Uint8ClampedArray(data.buffer); // same memory; assignments clamp + round
  const scale = S / size;
  names.forEach((name, li) => {
    layers.set(name, li);
    let img;
    try {
      img = renderTexture(name);
    } catch (e) {
      // never let one bad generator take down the whole atlas
      if (typeof console !== 'undefined') console.warn('[textures] generator failed for', name, e);
      img = new Img(S, S);
      fallback(img);
    }
    const mode = alphaMode(name);
    const d = img.d;
    const base = li * size * size * 4;
    if (size === S) {
      for (let i = 0; i < S * S * 4; i += 4) {
        const o = base + i;
        clamped[o] = d[i]; clamped[o + 1] = d[i + 1]; clamped[o + 2] = d[i + 2];
        const a = d[i + 3];
        clamped[o + 3] = mode === 'opaque' ? 255 : mode === 'cutout' ? (a >= 128 ? 255 : 0) : a;
      }
      return;
    }
    for (let y = 0; y < size; y++) {
      const sy = Math.floor(y * scale);
      for (let x = 0; x < size; x++) {
        const sx = Math.floor(x * scale);
        const si = (sy * S + sx) * 4;
        const o = base + (y * size + x) * 4;
        for (let k = 0; k < 3; k++) {
          const v = d[si + k];
          data[o + k] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
        }
        const a = d[si + 3];
        data[o + 3] = mode === 'opaque' ? 255 : mode === 'cutout' ? (a >= 128 ? 255 : 0) : a <= 0 ? 0 : a >= 255 ? 255 : Math.round(a);
      }
    }
  });
  return { size, layers, data };
}
