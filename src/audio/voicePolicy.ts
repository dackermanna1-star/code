// Pure (Web-Audio-free) voice bookkeeping: per-sound sliding-window rate limiting, a global burst
// limiter, a low-priority sub-cap and a priority-aware global voice cap with stealing.
// Kept free of DOM types so it can be unit tested in Node.

export interface VoiceRecord<T> {
  readonly id: number;
  readonly name: string;
  readonly priority: number;
  readonly start: number;
  /** Absolute time (seconds, same clock as `now`) after which the voice is finished. */
  end: number;
  /** Current linear output level multiplier (merging raises it). */
  level: number;
  /** Level at allocation; merges are capped relative to this. */
  readonly baseLevel: number;
  readonly payload: T;
}

export type Admission<T> =
  | { readonly kind: 'play'; readonly steal: VoiceRecord<T> | null }
  | { readonly kind: 'merge'; readonly into: VoiceRecord<T> }
  | { readonly kind: 'drop'; readonly reason: 'rate' | 'lowcap' | 'burst' | 'cap' };

export interface PoolOptions {
  /** Hard cap on simultaneous voices. */
  cap: number;
  /** Sliding window (s) for the per-sound limit. */
  window: number;
  /** Sounds with priority <= this are "low priority" (footsteps, impacts, crackles...). */
  lowPriority: number;
  /** Max simultaneous low-priority voices so they can never crowd out important sounds. */
  lowCap: number;
  /** Global burst limiter: at most `burstMax` new non-protected voices per `burstWindow` seconds. */
  burstWindow: number;
  burstMax: number;
  /** Sounds with priority >= this bypass the burst limiter and the low cap. */
  protectedPriority: number;
}

export const DEFAULT_POOL_OPTIONS: PoolOptions = {
  cap: 32,
  window: 0.05,
  lowPriority: 2,
  lowCap: 12,
  burstWindow: 0.03,
  burstMax: 10,
  protectedPriority: 7,
};

/** Fixed-capacity ring of timestamps implementing an exact sliding-window counter. */
export class SlidingWindow {
  private readonly times: number[];
  private head = 0;

  constructor(readonly max: number, readonly window: number) {
    this.times = new Array<number>(Math.max(1, max)).fill(-Infinity);
  }

  /** True if one more event at `now` would stay within `max` events per `window`. */
  canAccept(now: number): boolean {
    // The oldest stored timestamp is the slot we would overwrite.
    return now - this.times[this.head] >= this.window;
  }

  record(now: number): void {
    this.times[this.head] = now;
    this.head = (this.head + 1) % this.times.length;
  }

  /** canAccept + record in one step. */
  tryAcquire(now: number): boolean {
    if (!this.canAccept(now)) return false;
    this.record(now);
    return true;
  }

  reset(): void {
    this.times.fill(-Infinity);
    this.head = 0;
  }
}

export class VoicePool<T> {
  readonly opts: PoolOptions;
  readonly voices: VoiceRecord<T>[] = [];
  private readonly perSound = new Map<string, SlidingWindow>();
  private readonly burst: SlidingWindow;
  private nextId = 1;

  constructor(opts: Partial<PoolOptions> = {}) {
    this.opts = { ...DEFAULT_POOL_OPTIONS, ...opts };
    this.burst = new SlidingWindow(this.opts.burstMax, this.opts.burstWindow);
  }

  get size(): number {
    return this.voices.length;
  }

  /** Removes voices whose end time has passed; invokes `onRemove` for each. Returns count removed. */
  reap(now: number, onRemove?: (v: VoiceRecord<T>) => void): number {
    let removed = 0;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v.end <= now) {
        this.voices.splice(i, 1);
        removed++;
        if (onRemove) onRemove(v);
      }
    }
    return removed;
  }

  /** Most recently started live voice of `name` (merge target), or null. */
  latest(name: string, now: number): VoiceRecord<T> | null {
    let best: VoiceRecord<T> | null = null;
    for (const v of this.voices) {
      if (v.name !== name || v.end <= now) continue;
      if (!best || v.start > best.start) best = v;
    }
    return best;
  }

  private limiterFor(name: string, maxPerWindow: number): SlidingWindow {
    let w = this.perSound.get(name);
    if (!w || w.max !== Math.max(1, maxPerWindow)) {
      w = new SlidingWindow(Math.max(1, maxPerWindow), this.opts.window);
      this.perSound.set(name, w);
    }
    return w;
  }

  private mergeOrDrop(name: string, now: number, reason: 'rate' | 'lowcap' | 'burst' | 'cap'): Admission<T> {
    const into = this.latest(name, now);
    return into ? { kind: 'merge', into } : { kind: 'drop', reason };
  }

  /**
   * Decide what to do with a new play request. Does not mutate the pool except for consuming
   * limiter slots when the answer is 'play' — the caller must then `commit` (and remove `steal`).
   */
  admit(name: string, priority: number, maxPerWindow: number, now: number, maxConcurrent = Infinity): Admission<T> {
    const o = this.opts;
    const limiter = this.limiterFor(name, maxPerWindow);
    if (!limiter.canAccept(now)) return this.mergeOrDrop(name, now, 'rate');

    const isProtected = priority >= o.protectedPriority;
    if (!isProtected) {
      if (!this.burst.canAccept(now)) return this.mergeOrDrop(name, now, 'burst');
      if (priority <= o.lowPriority) {
        let low = 0;
        for (const v of this.voices) if (v.priority <= o.lowPriority && v.end > now) low++;
        if (low >= o.lowCap) return this.mergeOrDrop(name, now, 'lowcap');
      }
    }

    let steal: VoiceRecord<T> | null = null;
    if (maxConcurrent < Infinity) {
      let same = 0;
      let oldest: VoiceRecord<T> | null = null;
      for (const v of this.voices) {
        if (v.name !== name || v.end <= now) continue;
        same++;
        if (!oldest || v.start < oldest.start) oldest = v;
      }
      if (same >= Math.max(1, maxConcurrent)) {
        // Important sounds keep their fresh transient by recycling their own oldest instance
        // (usually deep in its tail); everything else folds into the newest instance.
        if (!isProtected || !oldest) return this.mergeOrDrop(name, now, 'cap');
        steal = oldest;
      }
    }

    if (!steal && this.voices.length >= o.cap) {
      // Victim: lowest priority, then the one closest to finishing, then the oldest.
      for (const v of this.voices) {
        if (
          !steal ||
          v.priority < steal.priority ||
          (v.priority === steal.priority && (v.end < steal.end || (v.end === steal.end && v.start < steal.start)))
        ) {
          steal = v;
        }
      }
      if (!steal || steal.priority > priority) return this.mergeOrDrop(name, now, 'cap');
    }

    limiter.record(now);
    if (!isProtected) this.burst.record(now);
    return { kind: 'play', steal };
  }

  /** Register a voice after an admitted 'play'. */
  commit(name: string, priority: number, start: number, end: number, level: number, payload: T): VoiceRecord<T> {
    const rec: VoiceRecord<T> = { id: this.nextId++, name, priority, start, end, level, baseLevel: level, payload };
    this.voices.push(rec);
    return rec;
  }

  remove(rec: VoiceRecord<T>): boolean {
    const i = this.voices.indexOf(rec);
    if (i < 0) return false;
    this.voices.splice(i, 1);
    return true;
  }

  /**
   * Fold an extra hit of `addLevel` into `rec`. Energy-style sum (sqrt of summed squares) so a burst
   * of N hits grows like sqrt(N) instead of N, capped at `maxBoost` x the original level.
   * Returns the new level.
   */
  static mergeLevel(current: number, addLevel: number, base: number, maxBoost: number): number {
    const summed = Math.sqrt(current * current + addLevel * addLevel);
    return Math.min(summed, base * maxBoost);
  }

  clear(onRemove?: (v: VoiceRecord<T>) => void): void {
    const all = this.voices.splice(0, this.voices.length);
    if (onRemove) for (const v of all) onRemove(v);
  }
}
