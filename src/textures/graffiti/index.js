// Procedural graffiti / paint-layer generator (Canvas 2D, deterministic).
//
//   generateWallPaint(spec)   -> { color, props, colorImage, propsImage, stats }
//   generatePropPaint(spec)   -> same shape, for dumpsters / doors / boxes / poles / fences / shutters
//   generateWallPaintAsync / generatePropPaintAsync -> Promise, yields to the event loop between eras
//   generatePaintBatch(jobs, { onProgress }) -> Promise<results[]>, yields between eras and segments
//
// See README.md in this folder for the full spec and the shader-side notes.

import { wallPaintGen, normalizeWallSpec, DEFAULT_STYLE } from './world/compose.js';
import { propPaintGen, normalizePropSpec } from './world/props.js';
import { setCanvasFactory, clearScratchPool } from './core/canvas.js';
import { getWriterPool } from './world/writers.js';

function runSync(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/** Yield to the event loop (scheduler.yield when available). */
export function yieldToMain() {
  if (typeof globalThis.scheduler !== 'undefined' && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => res();
      ch.port2.postMessage(0);
    });
  }
  return new Promise((res) => setTimeout(res, 0));
}

async function runAsync(gen, budgetMs = 12) {
  let r = gen.next();
  let last = performance.now();
  while (!r.done) {
    if (performance.now() - last > budgetMs) {
      await yieldToMain();
      last = performance.now();
    }
    r = gen.next();
  }
  return r.value;
}

/**
 * Generate the paint layers of one wall segment.
 * @param {object} spec see README (seed, widthM, heightM, pxPerMeter, wallTone, density,
 *   bands, hotspots, holes, groundLine, ageYears, style, poolSeed)
 */
export function generateWallPaint(spec) {
  return runSync(wallPaintGen(spec));
}

export function generateWallPaintAsync(spec, opts = {}) {
  return runAsync(wallPaintGen(spec), opts.budgetMs ?? 12);
}

/**
 * Generate the paint layers of a prop surface.
 * spec { seed, widthM, heightM, pxPerMeter, density, kind: 'dumpster'|'door'|'box'|'pole'|'fence'|'shutter',
 *        baseTone?, ageYears?, poolSeed? }
 */
export function generatePropPaint(spec) {
  return runSync(propPaintGen(spec));
}

export function generatePropPaintAsync(spec, opts = {}) {
  return runAsync(propPaintGen(spec), opts.budgetMs ?? 12);
}

/**
 * Generate many surfaces without blocking the main thread for long.
 * jobs: [{ type: 'wall'|'prop', spec }] ; onProgress(doneCount, total, result)
 */
export async function generatePaintBatch(jobs, opts = {}) {
  const out = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const gen = j.type === 'prop' ? propPaintGen(j.spec) : wallPaintGen(j.spec);
    const res = await runAsync(gen, opts.budgetMs ?? 12);
    out.push(res);
    if (opts.onProgress) opts.onProgress(i + 1, jobs.length, res);
    await yieldToMain();
  }
  if (opts.releaseScratch !== false) clearScratchPool();
  return out;
}

/** Writer names of the shared pool (for e.g. matching graffiti on custom props). */
export function getWriterNames(poolSeed = 'alley') {
  return getWriterPool(poolSeed).writers.map((w) => w.name);
}

export { setCanvasFactory, clearScratchPool, normalizeWallSpec, normalizePropSpec, DEFAULT_STYLE };
