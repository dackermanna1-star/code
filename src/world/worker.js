// World generation worker: builds chunk meshes / collision off the main thread.
import { textureIndex } from '../gfx/textures.js';
import { resolveMaterials } from './materials.js';
import { setPropTextures } from './props.js';
import { World } from './world.js';
import './gen/index.js';
import { buildChunkData, chunkTransfers } from './chunk.js';

let world = null;
let gen = 0;
const scope = typeof self !== 'undefined' && typeof self.postMessage === 'function' ? self : null;

if (scope) scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      // use exactly the layer mapping the main thread uploaded to the GPU
      const index = m.texIndex || textureIndex();
      resolveMaterials(index);
      setPropTextures(index);
      gen = m.gen;
      world = new World(m.seed, index, null);
      world.zones.forceType = m.forceType || null;
      world.zones.forcePiece = m.forcePiece || null;
      for (const [k, v] of m.mutation || []) world.mutation.set(k, v);
    } else if (m.type === 'build') {
      if (!world || m.gen !== gen) return;
      const t0 = performance.now();
      const d = buildChunkData(world, m.dim, m.level, m.cx, m.cz);
      d.ms = performance.now() - t0;
      scope.postMessage({ type: 'chunk', gen, key: m.key, data: d }, chunkTransfers(d));
    } else if (m.type === 'mutate') {
      if (!world) return;
      world.mutation.set(m.key, m.count);
      world.builders.delete(m.key);
    }
  } catch (err) {
    scope.postMessage({ type: 'error', key: m.key, message: String(err && err.stack || err) });
  }
};

if (scope) scope.postMessage({ type: 'hello' });
