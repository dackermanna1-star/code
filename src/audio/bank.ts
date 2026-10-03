// Lazily rendered sound bank.
//
// Sounds are synthesised on demand into AudioBuffers by a small pool of Web Workers (so the game
// never hitches while ~4 s of DSP work trickles through in the background). If workers are not
// available the same jobs run on the main thread: background jobs one at a time between frames,
// urgent ones synchronously via `renderNow`.
//
// Priorities: URGENT (a sound wanted right now) > SOON (music a bar or two ahead) > BG (likely
// needed soon after unlock) > IDLE (extra variants, rarely used material).

import RenderWorker from './render.worker?worker&inline';
import { renderJob, type RenderJob, type RenderRequest, type RenderResponse } from './render';

export const PRIO_URGENT = 0;
export const PRIO_SOON = 1;
export const PRIO_BG = 2;
export const PRIO_IDLE = 3;
const N_PRIO = 4;

type Callback = (buf: AudioBuffer | null) => void;

interface Entry {
  key: string;
  job: RenderJob;
  prio: number;
  cbs: Callback[];
  /** in flight on a worker */
  busy: boolean;
}

interface Slot {
  w: Worker;
  /** only takes URGENT / SOON jobs while another worker is alive (keeps latency low) */
  urgentOnly: boolean;
  dead: boolean;
  job: { id: number; entry: Entry; timer: ReturnType<typeof setTimeout> } | null;
}

export interface BankStats {
  mode: 'worker' | 'main';
  workers: number;
  buffers: number;
  queued: number;
  inFlight: number;
  rendered: number;
  failures: number;
  /** bytes of PCM held */
  bytes: number;
}

const JOB_TIMEOUT_MS = 15000;

export class Bank {
  private bufs = new Map<string, AudioBuffer>();
  private pending = new Map<string, Entry>();
  private queues: Entry[][] = Array.from({ length: N_PRIO }, () => []);
  private slots: Slot[] = [];
  private nextId = 1;
  private mainTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  rendered = 0;
  failures = 0;
  bytes = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    /** sample rate of the rendered material (may differ from the context's) */
    readonly sr: number,
    useWorkers = true,
    /** render every request synchronously, right away (offline rendering / tests) */
    private readonly syncMode = false,
  ) {
    if (useWorkers && !syncMode) this.spawnWorkers();
  }

  get workerMode(): boolean {
    return this.slots.some((s) => !s.dead);
  }

  get(key: string): AudioBuffer | undefined {
    return this.bufs.get(key);
  }

  has(key: string): boolean {
    return this.bufs.has(key);
  }

  /** Is `key` queued or rendering? */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Asks for `key` to be rendered (no-op if cached; merges with an existing request and raises its
   * priority if needed). `cb` fires once with the buffer (or null on failure / disposal).
   */
  request(key: string, job: RenderJob, prio: number, cb?: Callback): void {
    if (this.disposed) {
      cb?.(null);
      return;
    }
    const have = this.bufs.get(key);
    if (have) {
      cb?.(have);
      return;
    }
    if (this.syncMode) {
      const b = this.renderNow(key, job);
      if (cb) safeCall(cb, b);
      return;
    }
    const p = Math.max(0, Math.min(N_PRIO - 1, prio | 0));
    let e = this.pending.get(key);
    if (e) {
      if (cb) e.cbs.push(cb);
      if (!e.busy && p < e.prio) {
        const q = this.queues[e.prio];
        const i = q.indexOf(e);
        if (i >= 0) q.splice(i, 1);
        e.prio = p;
        this.queues[p].push(e);
      }
    } else {
      e = { key, job, prio: p, cbs: cb ? [cb] : [], busy: false };
      this.pending.set(key, e);
      this.queues[p].push(e);
    }
    this.pump();
  }

  /**
   * Renders `key` synchronously on the calling thread (main-thread fallback / offline tests).
   * Returns null if the job is currently in flight on a worker.
   */
  renderNow(key: string, job: RenderJob): AudioBuffer | null {
    const have = this.bufs.get(key);
    if (have) return have;
    if (this.disposed) return null;
    const e = this.pending.get(key);
    if (e?.busy) return null;
    if (e) {
      const q = this.queues[e.prio];
      const i = q.indexOf(e);
      if (i >= 0) q.splice(i, 1);
    }
    const entry: Entry = e ?? { key, job, prio: PRIO_URGENT, cbs: [], busy: false };
    const buf = this.toBuffer(renderJob(job, this.sr));
    this.finish(entry, buf);
    return buf;
  }

  /** Forgets a cached buffer (playing sources keep their own reference). */
  drop(key: string): void {
    const b = this.bufs.get(key);
    if (!b) return;
    this.bufs.delete(key);
    this.bytes -= b.length * b.numberOfChannels * 4;
  }

  stats(): BankStats {
    let queued = 0;
    for (const q of this.queues) queued += q.length;
    const live = this.slots.filter((s) => !s.dead);
    return {
      mode: live.length ? 'worker' : 'main',
      workers: live.length,
      buffers: this.bufs.size,
      queued,
      inFlight: live.filter((s) => s.job).length,
      rendered: this.rendered,
      failures: this.failures,
      bytes: this.bytes,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.slots) this.killSlot(s, false);
    if (this.mainTimer !== null) clearTimeout(this.mainTimer);
    this.mainTimer = null;
    for (const e of this.pending.values()) for (const cb of e.cbs) safeCall(cb, null);
    this.pending.clear();
    for (const q of this.queues) q.length = 0;
  }

  // -------------------------------------------------------------------------------------------

  private spawnWorkers(): void {
    if (typeof Worker === 'undefined') return;
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    const n = cores >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      try {
        const w = new RenderWorker();
        const slot: Slot = { w, urgentOnly: i === 1, dead: false, job: null };
        w.onmessage = (ev: MessageEvent<RenderResponse>) => this.onMessage(slot, ev.data);
        w.onerror = (ev: ErrorEvent) => {
          ev.preventDefault?.();
          this.killSlot(slot, true);
        };
        w.onmessageerror = () => this.killSlot(slot, true);
        this.slots.push(slot);
      } catch {
        /* workers unavailable (CSP, file://...) -> main thread fallback */
      }
    }
  }

  private take(maxPrio: number): Entry | null {
    for (let p = 0; p <= maxPrio; p++) {
      const e = this.queues[p].shift();
      if (e) return e;
    }
    return null;
  }

  private peekPrio(): number {
    for (let p = 0; p < N_PRIO; p++) if (this.queues[p].length) return p;
    return -1;
  }

  private pump(): void {
    if (this.disposed) return;
    const live = this.slots.filter((s) => !s.dead);
    if (!live.length) {
      this.scheduleMain();
      return;
    }
    for (const s of live) {
      if (s.job) continue;
      const e = this.take(s.urgentOnly && live.length > 1 ? PRIO_SOON : N_PRIO - 1);
      if (!e) continue;
      this.send(s, e);
    }
  }

  private send(slot: Slot, e: Entry): void {
    const id = this.nextId++;
    e.busy = true;
    const timer = setTimeout(() => {
      // a hung worker: give its job to someone else
      if (slot.job?.id === id) this.killSlot(slot, true);
    }, JOB_TIMEOUT_MS);
    slot.job = { id, entry: e, timer };
    const req: RenderRequest = { id, sr: this.sr, job: e.job };
    try {
      slot.w.postMessage(req);
    } catch {
      this.killSlot(slot, true);
    }
  }

  private onMessage(slot: Slot, msg: RenderResponse): void {
    const j = slot.job;
    if (!j || !msg || j.id !== msg.id) return;
    clearTimeout(j.timer);
    slot.job = null;
    const e = j.entry;
    e.busy = false;
    if ('data' in msg && msg.data instanceof Float32Array) this.finish(e, this.toBuffer(msg.data));
    else {
      // worker-side failure: try once more on the main thread, silently
      this.failures++;
      this.finish(e, this.toBuffer(renderJob(e.job, this.sr)));
    }
    this.pump();
  }

  private killSlot(slot: Slot, requeue: boolean): void {
    if (slot.dead) return;
    slot.dead = true;
    try {
      slot.w.terminate();
    } catch {
      /* ignore */
    }
    const j = slot.job;
    slot.job = null;
    if (j) {
      clearTimeout(j.timer);
      j.entry.busy = false;
      if (requeue && !this.disposed) {
        this.failures++;
        this.queues[j.entry.prio].unshift(j.entry);
      }
    }
    if (requeue) this.pump();
  }

  /** Main-thread fallback: one job per timer tick (urgent ones right away). */
  private scheduleMain(): void {
    if (this.mainTimer !== null || this.disposed) return;
    const p = this.peekPrio();
    if (p < 0) return;
    const delay = p === PRIO_URGENT ? 0 : p === PRIO_SOON ? 8 : 40;
    this.mainTimer = setTimeout(() => {
      this.mainTimer = null;
      const e = this.take(N_PRIO - 1);
      if (e) this.finish(e, this.toBuffer(renderJob(e.job, this.sr)));
      this.pump();
    }, delay);
  }

  private toBuffer(data: Float32Array): AudioBuffer | null {
    try {
      const len = Math.max(1, data.length);
      const b = this.ctx.createBuffer(1, len, this.sr);
      const ch = b.getChannelData(0);
      ch.set(data.length ? data : [0]);
      return b;
    } catch {
      return null;
    }
  }

  private finish(e: Entry, buf: AudioBuffer | null): void {
    this.pending.delete(e.key);
    if (buf && !this.disposed) {
      this.bufs.set(e.key, buf);
      this.bytes += buf.length * buf.numberOfChannels * 4;
      this.rendered++;
    } else if (!buf) this.failures++;
    const cbs = e.cbs;
    e.cbs = [];
    for (const cb of cbs) safeCall(cb, this.disposed ? null : buf);
  }
}

function safeCall(cb: Callback, b: AudioBuffer | null): void {
  try {
    cb(b);
  } catch {
    /* a consumer callback must never break the bank */
  }
}
