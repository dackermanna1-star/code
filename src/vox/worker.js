// Builds voxel models off the main thread (see library.js).

import { buildVoxelModel, compactModel } from './voxelize.js';

self.onmessage = (e) => {
  const { id, views, cfg } = e.data;
  let model = null;
  let error = null;
  try {
    const m = buildVoxelModel(views, { cfg });
    model = m ? compactModel(m) : null;
  } catch (err) {
    error = String(err && err.stack ? err.stack : err);
  }
  self.postMessage({ id, model, error }, model ? [model.data.buffer] : []);
};
