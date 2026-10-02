/**
 * SoundBank: AudioBuffer cache + prioritized render queue.
 *
 * Rendering happens in a module Web Worker (src/audio/synth.worker.ts) when available, so
 * pre-rendering never blocks the game loop; otherwise jobs are rendered on the main thread
 * in small time slices from `pump()`. One-shot buffers are LRU-evicted above a memory budget
 * (they are re-rendered deterministically on demand).
 */
import { resample } from './dsp/core';
import { renderKey, type Rendered } from './render';

/** 0 = needed right now, 1 = soon (variant 0 / IRs), 2 = prewarm, 3 = background (music). */
export type Priority = 0 | 1 | 2 | 3;

type Callback = (b: AudioBuffer | null) => void;

interface Job {
  key: string;
  pri: number;
  seq: number;
}

interface Entry {
  buf: AudioBuffer;
  bytes: number;
  used: number;
  evictable: boolean;
}

export interface BankStats {
  buffers: number;
  bytes: number;
  queued: number;
  inflight: number;
  rendered: number;
  renderMs: number;
  worker: boolean;
}

interface WorkerResult {
  id: number;
  key: string;
  ch?: Float32Array[];
  sr?: number;
  loop?: boolean;
  ms?: number;
  error?: string;
}

export class SoundBank {
  private cache = new Map<string, Entry>();
  private waiting = new Map<string, Callback[]>();
  private queued = new Map<string, Job>();
  private inflight = new Map<number, string>();
  private worker: Worker | null = null;
  private nextId = 1;
  private seq = 0;
  private clock = 0;
  bytes = 0;
  rendered = 0;
  renderMs = 0;

  constructor(
    private ctx: BaseAudioContext,
    private opts: { useWorker: boolean; budgetBytes: number; maxInflight: number },
  ) {
    if (opts.useWorker) this.startWorker();
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get hasWorker(): boolean {
    return this.worker !== null;
  }

  private startWorker(): void {
    if (typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent) => this.onResult(e.data as WorkerResult);
      w.onerror = (e: ErrorEvent) => {
        console.warn('[audio] synthesis worker unavailable, rendering on the main thread:', e.message);
        e.preventDefault?.();
        this.killWorker();
      };
      this.worker = w;
    } catch (e) {
      console.warn('[audio] could not start synthesis worker:', e);
      this.worker = null;
    }
  }

  private killWorker(): void {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    // re-queue in-flight jobs for the main thread
    for (const key of this.inflight.values()) this.enqueue(key, 0);
    this.inflight.clear();
  }

  /** Cached buffer (touches LRU) or null. */
  get(key: string): AudioBuffer | null {
    const e = this.cache.get(key);
    if (!e) return null;
    e.used = ++this.clock;
    return e.buf;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  isPending(key: string): boolean {
    return this.queued.has(key) || this.waiting.has(key);
  }

  /**
   * Ensures `key` gets rendered; `cb` is called with the buffer (synchronously when cached).
   * Requesting an already-queued key upgrades its priority.
   */
  request(key: string, pri: Priority, cb?: Callback): void {
    const e = this.cache.get(key);
    if (e) {
      e.used = ++this.clock;
      cb?.(e.buf);
      return;
    }
    if (cb) {
      const list = this.waiting.get(key);
      if (list) list.push(cb);
      else this.waiting.set(key, [cb]);
    } else if (!this.waiting.has(key)) this.waiting.set(key, []);
    this.enqueue(key, pri);
    this.dispatch();
  }

  /** Promise flavour of `request`. */
  load(key: string, pri: Priority = 1): Promise<AudioBuffer | null> {
    return new Promise((res) => this.request(key, pri, res));
  }

  private enqueue(key: string, pri: number): void {
    for (const k of this.inflight.values()) if (k === key) return;
    const j = this.queued.get(key);
    if (j) {
      if (pri < j.pri) j.pri = pri;
      return;
    }
    this.queued.set(key, { key, pri, seq: this.seq++ });
  }

  private popBest(): Job | null {
    let best: Job | null = null;
    for (const j of this.queued.values()) if (!best || j.pri < best.pri || (j.pri === best.pri && j.seq < best.seq)) best = j;
    if (best) this.queued.delete(best.key);
    return best;
  }

  private dispatch(): void {
    const w = this.worker;
    if (!w) return;
    while (this.inflight.size < this.opts.maxInflight && this.queued.size > 0) {
      const j = this.popBest();
      if (!j) break;
      const id = this.nextId++;
      this.inflight.set(id, j.key);
      w.postMessage({ id, key: j.key, sr: this.ctx.sampleRate });
    }
  }

  private onResult(m: WorkerResult): void {
    const key = this.inflight.get(m.id) ?? m.key;
    this.inflight.delete(m.id);
    if (m.error || !m.ch || !m.sr) {
      console.warn(`[audio] render failed for ${key}: ${m.error ?? 'no data'}`);
      this.finish(key, null);
    } else {
      this.store(key, { ch: m.ch, sr: m.sr, loop: m.loop, ms: m.ms });
    }
    this.dispatch();
  }

  /** Main-thread rendering (no worker): render queued jobs for up to `budgetMs`. */
  pump(budgetMs: number): void {
    if (this.worker || this.queued.size === 0) return;
    const t0 = performance.now();
    do {
      const j = this.popBest();
      if (!j) break;
      this.renderNow(j.key);
    } while (performance.now() - t0 < budgetMs && this.queued.size > 0);
  }

  /** Synchronous render (main thread) — tests, harness, fallback. */
  renderNow(key: string): AudioBuffer | null {
    const hit = this.get(key);
    if (hit) return hit;
    this.queued.delete(key);
    let r: Rendered | null = null;
    try {
      r = renderKey(key, this.ctx.sampleRate);
    } catch (e) {
      console.warn(`[audio] render failed for ${key}:`, e);
    }
    if (!r) {
      this.finish(key, null);
      return null;
    }
    return this.store(key, r);
  }

  private store(key: string, r: Rendered): AudioBuffer | null {
    const buf = this.makeBuffer(r);
    if (buf) {
      const bytes = buf.length * buf.numberOfChannels * 4;
      const old = this.cache.get(key);
      if (old) this.bytes -= old.bytes;
      this.cache.set(key,{ buf, bytes, used: ++this.clock, evictable: key.charCodeAt(0) === 115 /* s: one-shots */ });
      this.bytes += bytes;
      this.rendered++;
      this.renderMs += r.ms ?? 0;
      if (this.bytes > this.opts.budgetBytes) this.evict();
    }
    this.finish(key, buf);
    return buf;
  }

  private finish(key: string, buf: AudioBuffer | null): void {
    const cbs = this.waiting.get(key);
    this.waiting.delete(key);
    if (cbs) for (const cb of cbs) cb(buf);
  }

  private makeBuffer(r: Rendered): AudioBuffer | null {
    let ch = r.ch;
    let sr = r.sr;
    const len = ch[0]?.length ?? 0;
    if (len === 0) return null;
    let buf: AudioBuffer;
    try {
      buf = this.ctx.createBuffer(ch.length, len, sr);
    } catch {
      // some engines reject low sample rates — upsample to the context rate
      const ratio = sr / this.ctx.sampleRate;
      ch = ch.map((c) => resample(c, ratio));
      sr = this.ctx.sampleRate;
      try {
        buf = this.ctx.createBuffer(ch.length, ch[0].length, sr);
      } catch (e) {
        console.warn('[audio] createBuffer failed', e);
        return null;
      }
    }
    for (let i = 0; i < ch.length; i++) buf.copyToChannel(ch[i] as Float32Array<ArrayBuffer>, i);
    return buf;
  }

  private evict(): void {
    const target = this.opts.budgetBytes * 0.85;
    const cand: [string, Entry][] = [];
    for (const kv of this.cache) if (kv[1].evictable) cand.push(kv);
    cand.sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of cand) {
      if (this.bytes <= target) break;
      this.cache.delete(k);
      this.bytes -= e.bytes;
    }
  }

  stats(): BankStats {
    return {
      buffers: this.cache.size,
      bytes: this.bytes,
      queued: this.queued.size,
      inflight: this.inflight.size,
      rendered: this.rendered,
      renderMs: Math.round(this.renderMs),
      worker: this.worker !== null,
    };
  }

  /** Resolves when the queue has drained (or `timeoutMs` elapsed). */
  idle(timeoutMs = 30000): Promise<void> {
    const t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        if ((this.queued.size === 0 && this.inflight.size === 0) || performance.now() - t0 > timeoutMs) res();
        else {
          this.pump(8);
          setTimeout(tick, 20);
        }
      };
      tick();
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.cache.clear();
    this.queued.clear();
    this.waiting.clear();
    this.inflight.clear();
    this.bytes = 0;
  }
}
