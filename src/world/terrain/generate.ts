// Terrain generation pipeline (pure; runs in the Web Worker or synchronously as a fallback / in tests).
import type { WorldLayout } from '../layout/types';
import { Noise2D } from './noise';
import type { TerrainResult } from './TerrainData';
import { buildBaseTerrain } from './gen/baseTerrain';
import { carvePonds, carveRiver } from './gen/waterCarve';
import { carveRoads } from './gen/roadCarve';
import { flattenLots } from './gen/lotFlatten';
import { classify, computeNormals, computeReserved } from './gen/classify';
import { buildWaterData } from './gen/waterData';
import { buildMapRaster } from './gen/mapRaster';

export function generateTerrain(layout: WorldLayout): TerrainResult {
  const timings: Record<string, number> = {};
  let t = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - t);
    t = now;
  };
  const noise = new Noise2D(layout.seed);
  const base = buildBaseTerrain(layout, noise);
  lap('base');
  const h = base.h;
  const river = carveRiver(layout, h, noise);
  const pondLevel = carvePonds(layout, h);
  lap('water');
  const { field: roads, deck } = carveRoads(layout, h);
  lap('roads');
  const { ground, pad } = flattenLots(layout, h, roads);
  lap('lots');
  const normals = computeNormals(h);
  lap('normals');
  const { reserved, roadMask } = computeReserved(layout, roads);
  lap('reserved');
  const cls = classify({ layout, h, normals, coast: base.coast, flat: base.flat, river, roads, pad, reserved, pondLevels: pondLevel, noise });
  lap('classify');
  const water = buildWaterData(h, river);
  lap('waterData');
  const mapRaster = buildMapRaster({ heights: h, splatA: cls.splatA, splatB: cls.splatB, tree: cls.tree, pondLevels: pondLevel, ponds: layout.ponds });
  lap('map');
  return {
    heights: h,
    normals,
    surface: cls.surface,
    splatA: cls.splatA,
    splatB: cls.splatB,
    tree: cls.tree,
    cover: cls.cover,
    reserved,
    roadMask,
    water,
    mapRaster,
    lotGround: ground,
    bridgeDeck: deck,
    pondLevel,
    timings,
  };
}

/** Typed arrays to transfer from the worker. */
export function transferables(r: TerrainResult): Transferable[] {
  return [
    r.heights.buffer,
    r.normals.buffer,
    r.surface.buffer,
    r.splatA.buffer,
    r.splatB.buffer,
    r.tree.buffer,
    r.cover.buffer,
    r.reserved.buffer,
    r.roadMask.buffer,
    r.water.buffer,
    r.mapRaster.buffer,
    r.lotGround.buffer,
    r.bridgeDeck.buffer,
    r.pondLevel.buffer,
  ] as Transferable[];
}
