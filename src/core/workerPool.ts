/**
 * Simple worker pool with request/response matching and per-worker in-flight limits.
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private inflight: number[] = [];
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; worker: number }>();
  private nextId = 1;

  constructor(factory: () => Worker, count: number, readonly maxInflightPerWorker = 2) {
    for (let i = 0; i < count; i++) {
      const w = factory();
      const wi = i;
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        this.inflight[wi]--;
        if (m.type === 'error') p.reject(new Error(m.error));
        else p.resolve(m);
      };
      w.onerror = (e) => console.error('worker error', e.message ?? e);
      this.workers.push(w);
      this.inflight.push(0);
    }
  }

  get size() {
    return this.workers.length;
  }

  /** True if some worker can take another job. */
  hasCapacity(): boolean {
    for (const n of this.inflight) if (n < this.maxInflightPerWorker) return true;
    return false;
  }

  get busy(): number {
    return this.inflight.reduce((a, b) => a + b, 0);
  }

  request<T = any>(msg: any, transfer: Transferable[] = []): Promise<T> {
    let best = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.inflight[i] < this.inflight[best]) best = i;
    const id = this.nextId++;
    msg.id = id;
    this.inflight[best]++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, worker: best });
      this.workers[best].postMessage(msg, transfer);
    });
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('terminated'));
    this.pending.clear();
  }
}
