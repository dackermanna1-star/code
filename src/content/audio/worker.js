// Render worker: synthesizes buffer recipes off the main thread.
import { renderRecipe } from './registry.js'
import './recipes/index.js'

self.onmessage = e => {
  const { id, key, v } = e.data
  const t0 = performance.now()
  try {
    const { sr, chs } = renderRecipe(key, v)
    self.postMessage({ id, sr, chs, ms: performance.now() - t0 }, chs.map(c => c.buffer))
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) })
  }
}
