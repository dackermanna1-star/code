// Presentation time: hit-stop (a short freeze of logic AND presentation) and
// slow motion (an eased time scale applied to logic stepping and to the
// presentation dt). Pure (no DOM), driven by real frame time.
//
//   hitstop(ms)        freeze; stacked requests are capped to HITSTOP_CAP_MS
//                      within any HITSTOP_WINDOW_S of real time
//   slowmo(scale, s)   ease into `scale`, hold `s` seconds, ease back to 1
//   advance(dt)        per frame: returns the scaled dt (0 while frozen)

/** Most hit-stop granted inside one sliding window (ms). */
export const HITSTOP_CAP_MS = 120;
/** The sliding window (s). */
export const HITSTOP_WINDOW_S = 0.5;
/** Ease into slow motion (s). */
export const SLOWMO_EASE_IN = 0.07;
/** Ease back to full speed (s). */
export const SLOWMO_EASE_OUT = 0.3;

interface Grant {
  at: number;
  ms: number;
}

export class TimeControl {
  /** Real seconds since creation (advanced by advance()). */
  now = 0;
  /** Hit-stop left (s). */
  private freeze = 0;
  private grants: Grant[] = [];
  /** Slow motion: target scale, hold time left, phase. */
  private slowTarget = 1;
  private slowHold = 0;
  private slowCur = 1;
  private slowPhase: 'none' | 'in' | 'hold' | 'out' = 'none';
  /** The scale used for the last advance() (0 while frozen). */
  scale = 1;

  /** Request a freeze of `ms`. Returns the ms actually granted (cap per window). */
  hitstop(ms: number): number {
    if (!(ms > 0)) return 0;
    this.grants = this.grants.filter((g) => this.now - g.at < HITSTOP_WINDOW_S);
    let used = 0;
    for (const g of this.grants) used += g.ms;
    const ok = Math.max(0, Math.min(ms, HITSTOP_CAP_MS - used));
    if (ok <= 0) return 0;
    this.grants.push({ at: this.now, ms: ok });
    this.freeze += ok / 1000;
    return ok;
  }

  /** Slow motion to `scale` (0.05..1) for `seconds` (eased in and out). Overlapping requests keep the slowest scale and the longest hold. */
  slowmo(scale: number, seconds: number): void {
    const s = Math.max(0.05, Math.min(1, scale));
    if (!(seconds > 0) || s >= 1) return;
    if (this.slowPhase === 'none' || this.slowPhase === 'out') {
      this.slowTarget = s;
      this.slowHold = seconds;
      this.slowPhase = 'in';
      return;
    }
    this.slowTarget = Math.min(this.slowTarget, s);
    this.slowHold = Math.max(this.slowHold, seconds);
  }

  /** True while hit-stop holds everything. */
  get frozen(): boolean {
    return this.freeze > 0;
  }

  /** Slow-motion scale right now (1 = normal). */
  get slow(): number {
    return this.slowCur;
  }

  /** Cancel everything (new game, pause → quit). */
  reset(): void {
    this.freeze = 0;
    this.grants = [];
    this.slowTarget = 1;
    this.slowHold = 0;
    this.slowCur = 1;
    this.slowPhase = 'none';
    this.scale = 1;
  }

  /**
   * Advance by a real frame `dt` (s). Returns the game dt for this frame:
   * 0 while frozen, `dt × slow-motion scale` otherwise. A freeze that ends
   * mid-frame lets the rest of the frame through.
   */
  advance(dt: number): number {
    if (!(dt > 0)) {
      this.scale = this.freeze > 0 ? 0 : this.slowCur;
      return 0;
    }
    this.now += dt;
    let live = dt;
    if (this.freeze > 0) {
      const f = Math.min(this.freeze, dt);
      this.freeze -= f;
      if (this.freeze < 1e-6) this.freeze = 0;
      live = dt - f;
      if (live <= 0) {
        this.scale = 0;
        return 0;
      }
    }
    this.stepSlow(live);
    this.scale = this.slowCur * (live / dt);
    return live * this.slowCur;
  }

  private stepSlow(dt: number): void {
    switch (this.slowPhase) {
      case 'none':
        this.slowCur = 1;
        return;
      case 'in': {
        const k = dt / SLOWMO_EASE_IN;
        this.slowCur = Math.max(this.slowTarget, this.slowCur - (1 - this.slowTarget) * k);
        if (this.slowCur <= this.slowTarget + 1e-6) {
          this.slowCur = this.slowTarget;
          this.slowPhase = 'hold';
        }
        return;
      }
      case 'hold':
        this.slowCur = this.slowTarget;
        this.slowHold -= dt;
        if (this.slowHold <= 0) this.slowPhase = 'out';
        return;
      case 'out': {
        const k = dt / SLOWMO_EASE_OUT;
        // Ease out: quick at first, gentle at the end (smooth return to speed).
        this.slowCur = Math.min(1, this.slowCur + (1 - this.slowTarget) * k);
        if (this.slowCur >= 1 - 1e-6) {
          this.slowCur = 1;
          this.slowTarget = 1;
          this.slowPhase = 'none';
        }
        return;
      }
    }
  }
}
