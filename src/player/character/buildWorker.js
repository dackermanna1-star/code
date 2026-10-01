// Builds the walker's meshes off the main thread (voxelizing the fields takes
// a few seconds) and hands the vertex arrays back without copying them.
import { buildCharacterMeshes } from './model.js';

self.onmessage = (ev) => {
  try {
    const res = buildCharacterMeshes(new Map(ev.data.boneIndex));
    const transfer = new Set();
    const parts = res.parts.map(({ name, geo }) => {
      const attrs = {};
      for (const [k, a] of Object.entries(geo.attributes)) {
        attrs[k] = { array: a.array, itemSize: a.itemSize, normalized: a.normalized };
        transfer.add(a.array.buffer);
      }
      const index = geo.index ? geo.index.array : null;
      if (index) transfer.add(index.buffer);
      return { name, attrs, index };
    });
    self.postMessage({ parts, timings: res.timings }, [...transfer]);
  } catch (e) {
    self.postMessage({ error: String(e?.stack ?? e) });
  }
};
