// World generation worker: builds chunk meshes / collision off the main thread.
import { textureIndex, generateLayer } from '../gfx/textures.js';
import { resolveMaterials } from './materials.js';
import { setPropTextures } from './props.js';
import { World } from './world.js';
import './gen/index.js';
import { buildChunkData, chunkTransfers } from './chunk.js';

let world = null;
let gen = 0;
let sent = new Set();   // texture layers whose pixels the main thread already has
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
      sent = new Set(m.haveLayers || []);
      world = new World(m.seed, index, null);
      world.zones.forceType = m.forceType || null;
      world.zones.forcePiece = m.forcePiece || null;
      for (const [k, v] of m.mutation || []) world.mutation.set(k, v);
    } else if (m.type === 'build') {
      if (!world || m.gen !== gen) return;
      const t0 = performance.now();
      const d = buildChunkData(world, m.dim, m.level, m.cx, m.cz);
      // generate the textures this chunk needs that have not been sent yet
      const tex = [];
      for (const l of d.layers) if (!sent.has(l)) { sent.add(l); const px = generateLayer(l); if (px) tex.push([l, px]); }
      d.ms = performance.now() - t0;
      const transfers = chunkTransfers(d);
      for (const [, px] of tex) transfers.push(px.buffer);
      scope.postMessage({ type: 'chunk', gen, key: m.key, data: d, tex }, transfers);
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
