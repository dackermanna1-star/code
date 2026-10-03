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
type RawCallback = (data: Float32Array | null) => void;

interface Entry {
  key: string;
  job: RenderJob;
  prio: number;
  cbs: Callback[];
  /** in flight on a worker */
  busy: boolean;
  /** raw request: the samples go to `raw` as-is and nothing is cached */
  raw?: RawCallback;
}

interface Slot {
  w: Worker;
  /** only takes URGENT / SOON jobs while another worker is alive (keeps latency low) */
  urgentOnly: boolean;
  dead: boolean;
  /** has finished at least one job (its first job also pays for loading the worker script) */
  warm: boolean;
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
  /** why the last worker was retired, if one was */
  lastError: string;
}

/** A worker that doesn't answer within this long is presumed hung and replaced by the fallback. */
const JOB_TIMEOUT_MS = 20000;
/** The first job also loads + compiles the worker (slow on a busy dev server / low-end phone). */
const FIRST_JOB_TIMEOUT_MS = 90000;

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
  lastError = '';

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

  /** Renders a job and hands back the raw samples (not cached; e.g. the reverb impulse response). */
  requestRaw(key: string, job: RenderJob, prio: number, cb: RawCallback): void {
    if (this.disposed || this.pending.has(key)) return;
    if (this.syncMode) {
      safeRaw(cb, renderJob(job, this.sr));
      return;
    }
    const p = Math.max(0, Math.min(N_PRIO - 1, prio | 0));
    const e: Entry = { key, job, prio: p, cbs: [], busy: false, raw: cb };
    this.pending.set(key, e);
    this.queues[p].push(e);
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
    if (e?.busy || e?.raw) return null;
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
      lastError: this.lastError,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.slots) this.killSlot(s, false, '');
    if (this.mainTimer !== null) clearTimeout(this.mainTimer);
    this.mainTimer = null;
    for (const e of this.pending.values()) {
      for (const cb of e.cbs) safeCall(cb, null);
      if (e.raw) safeRaw(e.raw, null);
    }
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
        const slot: Slot = { w, urgentOnly: i === 1, dead: false, warm: false, job: null };
        w.onmessage = (ev: MessageEvent<RenderResponse>) => this.onMessage(slot, ev.data);
        w.onerror = (ev: ErrorEvent) => {
          ev.preventDefault?.();
          this.killSlot(slot, true, `worker error: ${ev.message || 'failed to load'}`);
        };
        w.onmessageerror = () => this.killSlot(slot, true, 'worker message error');
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
    const timer = setTimeout(
      () => {
        // a hung worker: give its job to someone else
        if (slot.job?.id === id) this.killSlot(slot, true, `worker timeout (${slot.warm ? 'job' : 'first job'})`);
      },
      slot.warm ? JOB_TIMEOUT_MS : FIRST_JOB_TIMEOUT_MS,
    );
    slot.job = { id, entry: e, timer };
    const req: RenderRequest = { id, sr: this.sr, job: e.job };
    try {
      slot.w.postMessage(req);
    } catch (err) {
      this.killSlot(slot, true, `postMessage failed: ${String(err)}`);
    }
  }

  private onMessage(slot: Slot, msg: RenderResponse): void {
    const j = slot.job;
    if (!j || !msg || j.id !== msg.id) return;
    clearTimeout(j.timer);
    slot.job = null;
    slot.warm = true;
    const e = j.entry;
    e.busy = false;
    if (e.raw) this.finishRaw(e, 'data' in msg && msg.data instanceof Float32Array ? msg.data : renderJob(e.job, this.sr));
    else if ('data' in msg && msg.data instanceof Float32Array) this.finish(e, this.toBuffer(msg.data));
    else {
      // worker-side failure: try once more on the main thread, silently
      this.failures++;
      this.finish(e, this.toBuffer(renderJob(e.job, this.sr)));
    }
    this.pump();
  }

  private killSlot(slot: Slot, requeue: boolean, reason: string): void {
    if (slot.dead) return;
    slot.dead = true;
    if (reason) this.lastError = reason;
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

  /**
   * Main-thread fallback: one job per tick — urgent / music jobs right away, background work only
   * in idle time (between frames) and spaced out, so the game keeps its frame rate.
   */
  private scheduleMain(): void {
    if (this.mainTimer !== null || this.disposed) return;
    const p = this.peekPrio();
    if (p < 0) return;
    const run = () => {
      this.mainTimer = null;
      const e = this.take(N_PRIO - 1);
      if (e?.raw) this.finishRaw(e, renderJob(e.job, this.sr));
      else if (e) this.finish(e, this.toBuffer(renderJob(e.job, this.sr)));
      this.pump();
    };
    const delay = p === PRIO_URGENT ? 0 : p === PRIO_SOON ? 8 : p === PRIO_BG ? 60 : 250;
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    this.mainTimer = setTimeout(() => {
      if (p >= PRIO_BG && typeof ric === 'function') ric(run, { timeout: 1500 });
      else run();
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

  private finishRaw(e: Entry, data: Float32Array): void {
    this.pending.delete(e.key);
    if (e.raw && !this.disposed) safeRaw(e.raw, data);
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

function safeRaw(cb: RawCallback, d: Float32Array | null): void {
  try {
    cb(d);
  } catch {
    /* ignore */
  }
}

function safeCall(cb: Callback, b: AudioBuffer | null): void {
  try {
    cb(b);
  } catch {
    /* a consumer callback must never break the bank */
  }
}
