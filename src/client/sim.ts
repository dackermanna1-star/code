import type { WorldConfig } from '../shared/config';
import { BIN_CHUNK, type C2S, type S2C } from '../shared/net/protocol';

/**
 * Bridge to the simulation worker (singleplayer integrated server). Same
 * request/response protocol a network transport would use.
 */
export class LocalSim {
  private worker: Worker;
  onMessage: (m: S2C) => void = () => undefined;
  onChunk: (buf: Uint8Array) => void = () => undefined;
  onError: (e: string) => void = () => undefined;
  private waiters = new Map<string, Array<(v: unknown) => void>>();
  rtt = 0;

  constructor(url: string) {
    this.worker = new Worker(url, { type: 'module' });
    this.worker.onmessage = (ev) => {
      const d = ev.data;
      if (d instanceof Uint8Array) {
        if (d[0] === BIN_CHUNK) this.onChunk(d);
        return;
      }
      if (d && typeof d.type === 'string') {
        if (d.type === 'error') this.onError(d.error);
        const list = this.waiters.get(d.type);
        if (list) {
          this.waiters.delete(d.type);
          for (const f of list) f(d);
        }
        return;
      }
      this.onMessage(d as S2C);
    };
    this.worker.onerror = (e) => this.onError(e.message || 'Simulation crashed');
  }

  private wait(type: string): Promise<unknown> {
    return new Promise((resolve) => {
      const l = this.waiters.get(type) ?? [];
      l.push(resolve);
      this.waiters.set(type, l);
    });
  }

  async open(worldId: string, name: string, config?: Partial<WorldConfig>) {
    const ready = Promise.race([this.wait('ready'), this.wait('error').then((e) => Promise.reject(new Error((e as { error: string }).error)))]);
    this.worker.postMessage({ type: 'open', worldId, name, config });
    await ready;
  }

  send(m: C2S) {
    this.worker.postMessage({ type: 'c2s', m });
  }

  serverNow() {
    return Date.now();
  }

  /** Save and stop the simulation, then terminate the worker. */
  async close() {
    const done = this.wait('closed');
    this.worker.postMessage({ type: 'close' });
    await Promise.race([done, new Promise((r) => setTimeout(r, 4000))]);
    this.worker.terminate();
  }
}
