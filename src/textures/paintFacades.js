// Feeds every facade's layout into the graffiti generator and copies the
// results into the paint atlas layers sampled by the facade shader.
import { generateWallPaint } from './graffiti/index.js';
import { downsampleImage } from './paintImage.js';
import { BRICK_SCHEMES, FACE_ROT } from '../world/layout.js';
import { PAINT_LAYER_H } from '../world/units.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// Fire-escape landings: writers tag from the platforms
const FE_LANDINGS = { L0: { u: 16.2, ys: [3.92, 7.22, 10.52] }, L1: { u: 6.1, ys: [4.52, 7.82] }, L3: { u: 10.6, ys: [4.12, 7.42] } };
// Dumpster spots along facades (tags above dumpster height)
const DUMPSTER_SPOTS = { R2: [8.8], L2: [1.9] };
// Objects standing against walls: little paint behind them, more just above
const OCCLUDERS = {
  R2: [{ x: 7.85, w: 1.9, h: 1.3 }],
  L2: [{ x: 0.95, w: 1.9, h: 1.3 }],
  L0: [{ x: 9.3, w: 1.7, h: 1.1 }],
  R4: [{ x: 13.0, w: 1.8, h: 1.1 }, { x: 6.4, w: 1.3, h: 0.85 }, { x: 3.7, w: 1.0, h: 1.9 }],
  L3: [{ x: 11.1, w: 1.7, h: 1.1 }],
};

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function downscale(src, k) {
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** Build one generator spec per facade that wants paint. */
export function buildPaintJobs(atlas, facades, fixtures) {
  const jobs = [];
  for (const f of facades) {
    const e = atlas.entries.get(f.id);
    if (!e) continue;
    const v0 = e.v0;
    const holes = [];
    for (const fx of fixtures) {
      if (fx.facade !== f) continue;
      const kind = fx.kind === 'window' ? (fx.boarded ? 'door' : 'window') : fx.kind === 'glassblock' ? 'glass' : fx.kind === 'door' ? 'door' : ['rollup', 'garage', 'sliding'].includes(fx.kind) ? 'shutter' : 'door';
      holes.push({ x: fx.u, y: fx.y - v0, w: fx.w, h: fx.h, kind });
    }
    const hotspots = [];
    for (const h of holes) if (h.kind === 'door' || h.kind === 'shutter') hotspots.push({ x: h.x + h.w / 2, y: 1.5, r: 1.6, density: 1 });
    const fe = FE_LANDINGS[f.id];
    if (fe) for (const y of fe.ys) hotspots.push({ x: fe.u, y: y - v0 + 0.9, r: 1.8, density: 0.85 });
    for (const u of DUMPSTER_SPOTS[f.id] ?? []) hotspots.push({ x: u, y: 1.7, r: 1.5, density: 1 });
    if (f.height - v0 < PAINT_LAYER_H - 0.4 && !f.blank) hotspots.push({ x: f.width * 0.6, y: f.height - v0 - 1.2, r: 2.0, density: 0.5 });
    const sc = BRICK_SCHEMES[f.scheme] ?? BRICK_SCHEMES[0];
    const tone = sc.bricks.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]).map((v) => Math.round(v / sc.bricks.length));
    const p = f.paint ?? {};
    const spec = {
      seed: (f.seed ?? 1) * 7919 + 101,
      widthM: f.width,
      heightM: PAINT_LAYER_H,
      pxPerMeter: atlas.colorPPM,
      wallTone: tone,
      density: (p.density ?? (f.blank ? 0.15 : 0.35)) * (f.backdrop ? 0.4 : 1),
      bands: (p.bands ?? [{ y0: 0, y1: 3.2, density: 0.6 }]).map((b) => ({ y0: b.y0 - v0, y1: b.y1 - v0, density: b.density })),
      hotspots,
      holes,
      groundLine: -v0,
      ageYears: 6 + ((f.seed ?? 3) % 12),
      style: { ...(p.style ?? {}), ghostSign: !!f.ghost },
      occluders: (OCCLUDERS[f.id] ?? []).map((o) => ({ ...o })),
      poolSeed: 'alley',
    };
    jobs.push({ id: f.id, spec, cost: f.width * (p.density ?? 0.3) });
  }
  return jobs;
}

function runOnMain(job, atlas) {
  const res = generateWallPaint({ ...job.spec, canvases: false });
  atlas.blitFacade('color', job.id, res.colorImage);
  atlas.blitFacade('props', job.id, downsampleImage(res.propsImage, atlas.propsPPM / atlas.colorPPM));
}

/**
 * Generate all facade paint. Uses a pool of module workers (OffscreenCanvas)
 * so it overlaps with the rest of world generation; falls back to the main thread.
 */
export async function paintFacades(atlas, facades, fixtures, { workerFactory } = {}) {
  const t0 = performance.now();
  const jobs = buildPaintJobs(atlas, facades, fixtures).sort((a, b) => b.cost - a.cost);
  const canWork = workerFactory && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  let done = 0;
  if (canWork) {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    const workers = [];
    try {
      for (let i = 0; i < n; i++) workers.push(workerFactory());
    } catch (err) {
      console.warn('paint workers unavailable, using main thread', err);
    }
    if (workers.length) {
      const queue = jobs.slice();
      const failed = [];
      await Promise.all(workers.map((w) => new Promise((resolve) => {
        const next = () => {
          const job = queue.shift();
          if (!job) {
            w.terminate();
            resolve();
            return;
          }
          w.onmessage = (e) => {
            const m = e.data;
            if (m.ok) {
              atlas.blitFacade('color', m.id, m.color);
              atlas.blitFacade('props', m.id, m.props);
              done++;
            } else {
              console.warn('paint worker failed for', m.id, m.error);
              failed.push(job);
            }
            next();
          };
          w.onerror = (err) => {
            console.warn('paint worker error', err.message);
            failed.push(job);
            next();
          };
          w.postMessage({ id: job.id, spec: job.spec, propsScale: atlas.propsPPM / atlas.colorPPM });
        };
        next();
      })));
      for (const job of failed) {
        try {
          runOnMain(job, atlas);
          done++;
        } catch (err) {
          console.warn('graffiti failed for', job.id, err);
        }
      }
      return { facades: done, ms: Math.round(performance.now() - t0), workers: workers.length };
    }
  }
  for (const job of jobs) {
    try {
      runOnMain(job, atlas);
      done++;
    } catch (err) {
      console.warn('graffiti failed for', job.id, err);
    }
    await yieldFrame();
  }
  return { facades: done, ms: Math.round(performance.now() - t0), workers: 0 };
}

export { FACE_ROT };
