/**
 * Scripted beats: one-shot events at times and per-frame ticks with the
 * running time. Runs on scaled (game) time unless `real` is set.
 */
export class Timeline {
  t = 0;
  done = false;
  private events: { t: number; fn: () => void; fired: boolean }[] = [];
  private ticks: { from: number; to: number; fn: (k: number, t: number) => void }[] = [];
  private endT = 0;
  onEnd: (() => void) | null = null;

  constructor(readonly real = false) {}

  at(t: number, fn: () => void) {
    this.events.push({ t, fn, fired: false });
    this.endT = Math.max(this.endT, t);
    return this;
  }

  /** fn(k) every frame between from and to, k = 0..1 */
  during(from: number, to: number, fn: (k: number, t: number) => void) {
    this.ticks.push({ from, to, fn });
    this.endT = Math.max(this.endT, to);
    return this;
  }

  end(t: number) {
    this.endT = Math.max(this.endT, t);
    return this;
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    for (const e of this.events) {
      if (!e.fired && this.t >= e.t) {
        e.fired = true;
        e.fn();
      }
    }
    for (const k of this.ticks) if (this.t >= k.from && this.t <= k.to + dt) k.fn(Math.min(1, (this.t - k.from) / Math.max(1e-4, k.to - k.from)), this.t);
    if (this.t >= this.endT) {
      this.done = true;
      this.onEnd?.();
    }
  }
}
