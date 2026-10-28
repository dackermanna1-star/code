import { BodyShape } from '../human/bodyShape.js';
import { buildBodyMesh } from '../human/bodyMesh.js';

// Builds the sculpted body mesh off the main thread (~1 s of SDF evaluation).
self.onmessage = (e) => {
  const shape = new BodyShape(e.data.segNames);
  const m = buildBodyMesh(shape, e.data.opts || {});
  const transfer = [m.positions.buffer, m.normals.buffer, m.surface.buffer, m.indices.buffer, m.skinIndex.buffer, m.skinWeight.buffer, m.segment.buffer, m.region.buffer];
  self.postMessage(m, transfer);
};
