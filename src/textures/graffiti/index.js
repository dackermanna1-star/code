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
import { setCanvasFactory, clearScratchPool, createCanvas } from './core/canvas.js';
import { getWriterPool } from './world/writers.js';

function runSync(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/**
 * Yield to the event loop with a fresh macrotask (MessageChannel), so rendering,
 * input, timers and other tasks interleave fairly with generation.
 */
export function yieldToMain() {
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

/**
 * Like generatePaintBatch but spreads the surfaces over module Web Workers
 * (OffscreenCanvas in workers). Results are identical to the main-thread
 * versions. Falls back to generatePaintBatch when workers/OffscreenCanvas are
 * unavailable or a worker fails to start.
 * opts: { workers = min(4, cores - 1), canvases = true, onProgress(done, total, result) }
 */
export async function generatePaintBatchParallel(jobs, opts = {}) {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const n = Math.max(1, Math.min(opts.workers ?? Math.min(4, cores - 1), jobs.length));
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || n < 2) return generatePaintBatch(jobs, opts);
  let workers;
  try {
    workers = Array.from({ length: n }, () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  } catch (err) {
    return generatePaintBatch(jobs, opts);
  }
  const results = new Array(jobs.length);
  let next = 0, done = 0, failed = false;
  await new Promise((resolve) => {
    const finish = () => { if (done === jobs.length || failed) resolve(); };
    const feed = (w) => {
      if (failed || next >= jobs.length) return;
      const id = next++;
      w.postMessage({ id, type: jobs[id].type, spec: jobs[id].spec });
    };
    for (const w of workers) {
      w.onmessage = (e) => {
        const m = e.data;
        if (!m.ok) { failed = true; finish(); return; }
        const colorImage = new ImageData(new Uint8ClampedArray(m.color), m.w, m.h);
        const propsImage = new ImageData(new Uint8ClampedArray(m.props), m.w, m.h);
        let color = null, props = null;
        if (opts.canvases !== false) {
          color = createCanvas(m.w, m.h);
          color.getContext('2d').putImageData(colorImage, 0, 0);
          props = createCanvas(m.w, m.h);
          props.getContext('2d').putImageData(propsImage, 0, 0);
        }
        results[m.id] = { color, props, colorImage, propsImage, stats: m.stats };
        done++;
        if (opts.onProgress) opts.onProgress(done, jobs.length, results[m.id]);
        feed(w);
        finish();
      };
      w.onerror = () => { failed = true; finish(); };
      feed(w);
    }
  });
  for (const w of workers) w.terminate();
  if (failed) {
    // e.g. the bundler did not emit the worker: redo the missing ones on the main thread
    const rest = [];
    jobs.forEach((j, i) => { if (!results[i]) rest.push(i); });
    const redo = await generatePaintBatch(rest.map((i) => jobs[i]), { ...opts, onProgress: null });
    rest.forEach((i, k) => { results[i] = redo[k]; });
  }
  return results;
}

/** Writer names of the shared pool (for e.g. matching graffiti on custom props). */
export function getWriterNames(poolSeed = 'alley') {
  return getWriterPool(poolSeed).writers.map((w) => w.name);
}

export { setCanvasFactory, clearScratchPool, normalizeWallSpec, normalizePropSpec, DEFAULT_STYLE };
