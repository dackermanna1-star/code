// Buffer bank: renders recipes in a Web Worker (off the main thread) in priority order, caches
// the results and hands out AudioBuffers. Small interactive buffers can be rendered on the main
// thread if they are needed before the worker delivered them; long ones always come
// asynchronously. A soft memory cap evicts long-unused, low-priority buffers (they are simply
// re-rendered if needed again).

import { RECIPES, renderRecipe } from './registry.js'
import './recipes/index.js'

const raw = new Map() // id → { sr, chs }
const bufs = new Map() // id → AudioBuffer
const meta = new Map() // id → { bytes, used, prio }
const waiting = new Map() // id → [resolve]
const queue = [] // ids not yet sent
let worker = null
let busy = 0
let workerFailed = false
const MAX_INFLIGHT = 2
const CAP_BYTES = 44e6
export const stats = { worker: 0, sync: 0, syncMs: 0, workerMs: 0, bytes: 0, evicted: 0 }

const idOf = (key, v, p) => key + '#' + v + (p ? '#' + p : '')
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function ensureWorker() {
  if (worker || workerFailed) return worker
  if (typeof Worker === 'undefined') { workerFailed = true; return null }
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = e => {
      const { id, sr, chs, ms, error } = e.data
      busy = Math.max(0, busy - 1)
      if (error) console.warn('[audio] worker render failed', id, error)
      else {
        stats.worker++; stats.workerMs += ms
        store(id, { sr, chs })
      }
      resolveWaiting(id)
      pump()
    }
    worker.onerror = e => {
      console.warn('[audio] render worker unavailable, rendering on the main thread', e?.message || '')
      workerFailed = true
      worker = null
      busy = 0
      pump()
    }
  } catch {
    workerFailed = true
    worker = null
  }
  return worker
}

function store(id, res) {
  if (raw.has(id) || bufs.has(id)) return
  raw.set(id, res)
  const bytes = res.chs.reduce((a, c) => a + c.byteLength, 0)
  const key = id.split('#')[0]
  meta.set(id, { bytes, used: now(), prio: RECIPES.get(key)?.prio ?? 5 })
  stats.bytes += bytes
  if (stats.bytes > CAP_BYTES) evict()
}

function evict() {
  const t = now()
  const cands = [...meta.entries()].filter(([, m]) => m.prio >= 2 && t - m.used > 45000).sort((a, b) => a[1].used - b[1].used)
  for (const [id, m] of cands) {
    if (stats.bytes <= CAP_BYTES * 0.85) break
    bufs.delete(id); raw.delete(id); meta.delete(id)
    stats.bytes -= m.bytes
    stats.evicted++
  }
}

function resolveWaiting(id) {
  const w = waiting.get(id)
  if (!w) return
  waiting.delete(id)
  for (const fn of w) { try { fn() } catch (e) { console.error(e) } }
}

const params = new Map() // id → params object for parametric recipes
let idleScheduled = false
function pump() {
  if (ensureWorker()) {
    while (busy < MAX_INFLIGHT && queue.length) {
      const id = queue.shift()
      if (raw.has(id) || bufs.has(id)) { resolveWaiting(id); continue }
      const [key, v] = id.split('#')
      busy++
      worker.postMessage({ id, key, v: +v, params: params.get(id) })
    }
    return
  }
  // no worker: render on the main thread, a few ms per idle slice
  if (idleScheduled || !queue.length) return
  idleScheduled = true
  const step = () => {
    idleScheduled = false
    const t0 = now()
    while (queue.length && now() - t0 < 6) {
      const id = queue.shift()
      if (!raw.has(id) && !bufs.has(id)) renderSyncId(id)
      resolveWaiting(id)
    }
    if (queue.length) pump()
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 250 })
  else setTimeout(step, 16)
}

function renderSyncId(id) {
  if (raw.has(id) || bufs.has(id)) return
  const [key, v] = id.split('#')
  const t0 = now()
  try {
    const res = renderRecipe(key, +v, params.get(id))
    stats.sync++; stats.syncMs += now() - t0
    store(id, res)
  } catch (e) { console.error('[audio] render', id, e) }
}

function toAudioBuffer(id, ctx) {
  const b = bufs.get(id)
  const m = meta.get(id)
  if (m) m.used = now()
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
  /** AudioBuffer if ready; sync=true renders it on the spot if missing. */
  get(key, v, ctx, sync = true, p = null) {
    const id = idOf(key, v, p?.id)
    if (p) params.set(id, p)
    if (!bufs.has(id) && !raw.has(id)) {
      if (!sync) { this.request(key, v, true, p); return null }
      renderSyncId(id)
      resolveWaiting(id)
    }
    return toAudioBuffer(id, ctx)
  },
  has(key, v, p = null) { const id = idOf(key, v, p?.id); return bufs.has(id) || raw.has(id) },
  /** Ask for a buffer; urgent requests jump the queue. Resolves when ready (or failed). */
  request(key, v = 0, urgent = false, p = null) {
    if (!RECIPES.has(key)) return Promise.resolve()
    const id = idOf(key, v, p?.id)
    if (p) params.set(id, p)
    if (bufs.has(id) || raw.has(id)) return Promise.resolve()
    const pr = new Promise(res => { if (!waiting.has(id)) waiting.set(id, []); waiting.get(id).push(res) })
    const qi = queue.indexOf(id)
    if (qi >= 0) { if (urgent && qi > 0) { queue.splice(qi, 1); queue.unshift(id) } } else if (urgent) queue.unshift(id); else queue.push(id)
    pump()
    return pr
  },
  /** Request every variant of a key (e.g. ahead of use). */
  requestAll(key, urgent = false) {
    const n = RECIPES.get(key)?.variants ?? 0
    const ps = []
    for (let v = 0; v < n; v++) ps.push(this.request(key, v, urgent))
    return Promise.all(ps)
  },
  /** Queue recipe variants by priority (the worker renders them in the background). */
  warmAll(filter = null) {
    const list = []
    for (const [key, spec] of RECIPES) {
      if (spec.lazy || spec.param || (filter && !filter(key, spec))) continue
      for (let v = 0; v < spec.variants; v++) list.push([spec.prio, key, v])
    }
    list.sort((a, b) => a[0] - b[0])
    return Promise.all(list.map(([, key, v]) => this.request(key, v)))
  },
  pending() { return queue.length + busy },
  spec(key) { return RECIPES.get(key) },
  stats,
}
