// Pool of meshing workers. Falls back to the main thread if workers are unavailable.
import MeshWorker from './meshWorker.js?worker&inline'
import { meshModel } from './mesher.js'

export class MeshPool {
  constructor(size) {
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
    this.size = size ?? Math.max(1, Math.min(6, hc - 1))
    this.workers = []
    this.queue = []
    this.pending = new Map()
    this.nextId = 1
    try {
      for (let i = 0; i < this.size; i++) {
        const w = new MeshWorker()
        w.busy = false
        w.onmessage = e => this._done(w, e.data)
        w.onerror = err => { console.warn('mesh worker error', err); this.failed = true }
        this.workers.push(w)
      }
    } catch (e) {
      console.warn('Mesh workers unavailable, meshing on the main thread', e)
      this.workers = []
    }
  }

  /** Mesh a model; resolves to {opaque, transparent}. */
  mesh(model, opts) {
    if (!this.workers.length || this.failed) return Promise.resolve(meshModel(model, opts))
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const plain = { sx: model.sx, sy: model.sy, sz: model.sz, data: model.data, extra: model.extra, pivot: { ...model.pivot } }
      const o = { ...opts, interior: opts.interior !== undefined ? opts.interior : model.interiorMask() }
      this.pending.set(id, { resolve, reject, model, opts })
      this.queue.push({ id, model: plain, opts: o })
      this._pump()
    })
  }

  _pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue
      const job = this.queue.shift()
      w.busy = true
      w.postMessage(job)
    }
  }

  _done(w, msg) {
    w.busy = false
    const p = this.pending.get(msg.id)
    this.pending.delete(msg.id)
    if (p) {
      if (msg.error) {
        console.warn('mesh worker failed, retrying on main thread', msg.error)
        try { p.resolve(meshModel(p.model, p.opts)) } catch (e) { p.reject(e) }
      } else p.resolve(msg.res)
    }
    this._pump()
  }

  dispose() { for (const w of this.workers) w.terminate(); this.workers = [] }
}
