// Buffer bank: renders recipes in a Web Worker (off the main thread) in priority order, caches
// the results and hands out AudioBuffers. If a buffer is needed synchronously before the worker
// delivered it, it is rendered on the main thread (small one-shots only take a few ms).

import { RECIPES, renderRecipe } from './registry.js'
import './recipes/index.js'

const raw = new Map() // id → { sr, chs }
const bufs = new Map() // id → AudioBuffer
const waiting = new Map() // id → [resolve]
const queue = [] // ids not yet sent
let worker = null
let busy = 0
let workerFailed = false
const MAX_INFLIGHT = 2
export const stats = { worker: 0, sync: 0, syncMs: 0, workerMs: 0, bytes: 0 }

const idOf = (key, v) => key + '#' + v

function ensureWorker() {
  if (worker || workerFailed) return worker
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = e => {
      const { id, sr, chs, ms, error } = e.data
      busy--
      if (error) { console.warn('[audio] worker render failed', id, error) } else {
        stats.worker++; stats.workerMs += ms
        if (!raw.has(id) && !bufs.has(id)) { raw.set(id, { sr, chs }); stats.bytes += chs.reduce((a, c) => a + c.byteLength, 0) }
        resolveWaiting(id)
      }
      pump()
    }
    worker.onerror = e => {
      console.warn('[audio] render worker unavailable, rendering on the main thread', e.message || '')
      workerFailed = true
      worker = null
      busy = 0
      pump()
    }
  } catch (e) {
    workerFailed = true
    worker = null
  }
  return worker
}

function resolveWaiting(id) {
  const w = waiting.get(id)
  if (!w) return
  waiting.delete(id)
  for (const fn of w) { try { fn() } catch (e) { console.error(e) } }
}

let idleScheduled = false
function pump() {
  if (ensureWorker()) {
    while (busy < MAX_INFLIGHT && queue.length) {
      const id = queue.shift()
      if (raw.has(id) || bufs.has(id)) { resolveWaiting(id); continue }
      const [key, v] = id.split('#')
      busy++
      worker.postMessage({ id, key, v: +v })
    }
    return
  }
  // no worker: render on the main thread one item per idle slice
  if (idleScheduled || !queue.length) return
  idleScheduled = true
  const step = () => {
    idleScheduled = false
    const t0 = performance.now()
    while (queue.length && performance.now() - t0 < 6) {
      const id = queue.shift()
      if (raw.has(id) || bufs.has(id)) { resolveWaiting(id); continue }
      const [key, v] = id.split('#')
      renderSync(key, +v)
      resolveWaiting(id)
    }
    if (queue.length) pump()
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 200 })
  else setTimeout(step, 16)
}

function renderSync(key, v) {
  const id = idOf(key, v)
  if (raw.has(id) || bufs.has(id)) return
  const t0 = performance.now()
  const res = renderRecipe(key, v)
  stats.sync++; stats.syncMs += performance.now() - t0
  raw.set(id, res)
  stats.bytes += res.chs.reduce((a, c) => a + c.byteLength, 0)
}

function toAudioBuffer(id, ctx) {
  const b = bufs.get(id)
  if (b) return b
  const r = raw.get(id)
  if (!r) return null
  let ab
  try {
    ab = typeof AudioBuffer === 'function'
      ? new AudioBuffer({ length: r.chs[0].length, numberOfChannels: r.chs.length, sampleRate: r.sr })
      : ctx.createBuffer(r.chs.length, r.chs[0].length, r.sr)
  } catch {
    ab = ctx.createBuffer(r.chs.length, r.chs[0].length, r.sr)
  }
  r.chs.forEach((d, c) => ab.copyToChannel(d, c))
  bufs.set(id, ab)
  raw.delete(id)
  return ab
}

export const bank = {
  /** AudioBuffer if ready (sync=true renders it now if missing). */
  get(key, v, ctx, sync = true) {
    const id = idOf(key, v)
    if (!bufs.has(id) && !raw.has(id)) {
      if (!sync) { this.request(key, v, true); return null }
      renderSync(key, v)
      resolveWaiting(id)
    }
    return toAudioBuffer(id, ctx)
  },
  has(key, v) { const id = idOf(key, v); return bufs.has(id) || raw.has(id) },
  /** Ask for a buffer; urgent requests jump the queue. Resolves when ready. */
  request(key, v = 0, urgent = false) {
    const id = idOf(key, v)
    if (bufs.has(id) || raw.has(id)) return Promise.resolve()
    const p = new Promise(res => { if (!waiting.has(id)) waiting.set(id, []); waiting.get(id).push(res) })
    const qi = queue.indexOf(id)
    if (qi >= 0) { if (urgent) { queue.splice(qi, 1); queue.unshift(id) } } else if (urgent) queue.unshift(id); else queue.push(id)
    pump()
    return p
  },
  /** Queue every recipe variant by priority (worker renders them in the background). */
  warmAll(filter = null) {
    const list = []
    for (const [key, spec] of RECIPES) {
      if (spec.lazy || (filter && !filter(key, spec))) continue
      for (let v = 0; v < spec.variants; v++) list.push([spec.prio, key, v])
    }
    list.sort((a, b) => a[0] - b[0])
    return Promise.all(list.map(([, key, v]) => this.request(key, v)))
  },
  pending() { return queue.length + busy },
  stats,
  /** Free memory of decoded buffers that were not used (keeps recipes). */
  drop(key) { for (const id of [...bufs.keys(), ...raw.keys()]) if (id.startsWith(key + '#')) { bufs.delete(id); raw.delete(id) } },
}
