// Build and compile a built-in map (src/map/maps/*): the part of loading that world.js,
// tools/bake.mjs, tools/mapstats.mjs and the tests share. DOM-free.
import { compileMap } from './compile.js';
import { allocateLightmaps } from './lightmap.js';
import { hashMap } from './bakeio.js';

/** Bake settings: 'high' ships in public/maps (tools/bake.mjs), 'low' for quick looks, 'load' when a page bakes. */
export const BAKE_QUALITY = {
  high: { skySamples: 48, sunSamples: 4 },
  low: { skySamples: 12, sunSamples: 2 },
  load: { skySamples: 8, sunSamples: 2 },
};

/**
 * def: a built-in map definition (src/map/maps/index.js). Returns { map (the MapDSL /
 * AreaMap, .name = the id), compiled, alloc, lighting (what the baker gets and the hash
 * covers: the def's lighting + the map's point lights), hash, encoding, ms }.
 */
export function prepareMap(def) {
  const t0 = globalThis.performance ? performance.now() : Date.now();
  const map = def.build();
  if (!map?.brushes || !map.entities || !Array.isArray(map.bounds)) throw new Error(`${def.id}: build() must return a MapDSL with brushes, entities and bounds`);
  map.name = def.id;
  const compiled = compileMap(map.brushes);
  const alloc = allocateLightmaps(compiled.faces);
  const lighting = { ...def.lighting, lights: map.lights };
  const hash = hashMap(map.brushes, lighting);
  const ms = (globalThis.performance ? performance.now() : Date.now()) - t0;
  return { map, compiled, alloc, lighting, hash, encoding: lighting.lmEncoding || 'linear', ms };
}
