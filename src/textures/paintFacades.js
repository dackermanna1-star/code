// Feeds every facade's layout into the graffiti generator and copies the
// results into the paint atlas layers sampled by the facade shader.
import { generateWallPaint } from './graffiti/index.js';
import { BRICK_SCHEMES, FACE_ROT } from '../world/layout.js';
import { PAINT_LAYER_H } from '../world/units.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// Fire-escape landings: writers tag from the platforms
const FE_LANDINGS = { L0: { u: 16.2, ys: [3.92, 7.22, 10.52] }, L1: { u: 6.1, ys: [4.52, 7.82] }, L3: { u: 10.6, ys: [4.12, 7.42] } };
// Dumpster spots along facades (tags above dumpster height)
const DUMPSTER_SPOTS = { R2: [8.8], L2: [1.9] };

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

export async function paintFacades(atlas, facades, fixtures) {
  const stats = { facades: 0, ms: 0 };
  const t0 = performance.now();
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
    // a "heaven spot" under the roofline of tall walls
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
      density: p.density ?? (f.blank ? 0.15 : 0.35),
      bands: (p.bands ?? [{ y0: 0, y1: 3.2, density: 0.6 }]).map((b) => ({ y0: b.y0 - v0, y1: b.y1 - v0, density: b.density })),
      hotspots,
      holes,
      groundLine: -v0,
      ageYears: 6 + ((f.seed ?? 3) % 12),
      style: { ...(p.style ?? {}), ghostSign: !!f.ghost },
    };
    if (f.backdrop) spec.density *= 0.4;
    let res;
    try {
      res = generateWallPaint(spec);
    } catch (err) {
      console.warn('graffiti failed for', f.id, err);
      continue;
    }
    atlas.blitFacade('color', f.id, res.color);
    atlas.blitFacade('props', f.id, downscale(res.props, atlas.propsPPM / atlas.colorPPM));
    stats.facades++;
    await yieldFrame();
  }
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}

export { FACE_ROT };
