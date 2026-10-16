// Recipe registry: every pre-rendered buffer is a pure function (key, variant) → samples.
// The same modules are imported by the render worker and by the main thread (sync fallback),
// so recipes must not touch Web Audio / DOM.

import { makeRng, hashStr, normalizePeak, normalizeRms, fadeEdges, dcBlock, loopify } from './dsp.js'

export const RECIPES = new Map()

/**
 * Define a buffer recipe.
 * spec: { sr, variants=1, gen(r, sr, v) → Float32Array | Float32Array[] (channels),
 *         loop: seconds of cross-fade when the buffer is a seamless loop (gen must render len+x),
 *         norm: { peak } | { rms, ceiling }, dc: highpass Hz (default 20, 0 = off),
 *         prio: 0 (first) … 9 (last) warm-up priority, lazy: true = only render on demand }
 */
export function def(key, spec) {
  RECIPES.set(key, { variants: 1, prio: 5, ...spec })
}

/** Render one variant. Returns { sr, chs: Float32Array[] }. */
export function renderRecipe(key, v = 0) {
  const spec = RECIPES.get(key)
  if (!spec) throw new Error('unknown recipe ' + key)
  const r = makeRng(hashStr(key) ^ Math.imul(v + 1, 0x9e3779b1))
  let out = spec.gen(r, spec.sr, v)
  let chs = Array.isArray(out) ? out : [out]
  const dc = spec.dc ?? 20
  if (dc) chs.forEach(d => dcBlock(d, spec.sr, dc))
  if (spec.loop) {
    const x = Math.floor(spec.loop * spec.sr)
    chs = chs.map(d => loopify(d, x))
  } else if (!spec.noFade) chs.forEach(d => fadeEdges(d, spec.sr, spec.fadeIn ?? 1.5, spec.fadeOut ?? 12))
  if (spec.norm?.peak) normalizePeak(chs, spec.norm.peak)
  else if (spec.norm?.rms) normalizeRms(chs, spec.norm.rms, spec.norm.ceiling ?? 0.95)
  else normalizePeak(chs, 0.89)
  for (const d of chs) for (let i = 0; i < d.length; i++) if (!(d[i] === d[i])) d[i] = 0 // NaN guard
  return { sr: spec.sr, chs }
}

export function variantsOf(key) { return RECIPES.get(key)?.variants ?? 1 }
