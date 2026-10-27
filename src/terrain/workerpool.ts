import type { NodeMeshData } from './meshbuilder';
import type { SurfaceParams } from './surface';

type Pending = { resolve: (d: NodeMeshData) => void; reject: (e: unknown) => void; worker: number };

/** Pool of terrain workers. Each planet's generator is initialised lazily on every worker. */
export class TerrainWorkerPool {
  private workers: Worker[] = [];
  private load: number[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private inited = new Set<string>();
  readonly size: number;

  constructor(size = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this.onMessage(i, ev.data);
      w.onerror = (e) => console.error('terrain worker error', e);
      this.workers.push(w);
      this.load.push(0);
    }
  }

  get inFlight() {
    return this.pending.size;
  }

  ensurePlanet(id: string, params: SurfaceParams) {
    if (this.inited.has(id)) return;
    this.inited.add(id);
    for (const w of this.workers) w.postMessage({ type: 'init', planet: id, params });
  }

  dropPlanet(id: string) {
    if (!this.inited.delete(id)) return;
    for (const w of this.workers) w.postMessage({ type: 'drop', planet: id });
  }

  build(planet: string, face: number, level: number, ix: number, iy: number, parent?: Float32Array): Promise<NodeMeshData> {
    let best = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.load[i] < this.load[best]) best = i;
    const id = this.nextId++;
    this.load[best]++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, worker: best });
      this.workers[best].postMessage({ type: 'build', id, planet, face, level, ix, iy, parent }, parent ? [parent.buffer] : []);
    });
  }

  private onMessage(wi: number, m: { type: string; id: number; data?: NodeMeshData; error?: string }) {
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    this.load[wi]--;
    if (m.type === 'built' && m.data) p.resolve(m.data);
    else p.reject(new Error(m.error ?? 'terrain worker failure'));
  }
}
