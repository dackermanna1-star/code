// Web Worker: greedy-meshes voxel models off the main thread.
import { meshModel } from './mesher.js'

self.onmessage = e => {
  const { id, model, opts } = e.data
  try {
    const res = meshModel(model, opts)
    const transfer = []
    for (const k of ['opaque', 'transparent']) {
      const r = res[k]
      if (r) transfer.push(r.positions.buffer, r.data.buffer, r.size.buffer, r.indices.buffer)
    }
    self.postMessage({ id, res }, transfer)
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) })
  }
}
