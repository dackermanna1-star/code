interface Timer {
  at: number;
  fn: () => void;
  real: boolean;
}

/**
 * Game-time timers. Unlike setTimeout they respect pause / slow motion and are
 * discarded together with the round that created them.
 */
export class Scheduler {
  private timers: Timer[] = [];
  private time = 0;
  private realTime = 0;

  /** Run `fn` after `seconds` of game time (or real time when `real`). */
  after(seconds: number, fn: () => void, real = false): void {
    this.timers.push({ at: (real ? this.realTime : this.time) + seconds, fn, real });
  }

  update(dt: number, realDt: number): void {
    this.time += dt;
    this.realTime += realDt;
    if (!this.timers.length) return;
    const due: Timer[] = [];
    this.timers = this.timers.filter((t) => {
      if ((t.real ? this.realTime : this.time) >= t.at) {
        due.push(t);
        return false;
      }
      return true;
    });
    for (const t of due) t.fn();
  }

  clear(): void {
    this.timers.length = 0;
  }
}
