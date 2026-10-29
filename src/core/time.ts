// Fixed-step clock. The game advances simulation in FIXED_DT steps; rendering interpolates
// nothing (Havok bodies are synced each step) but runs at display rate.
//
// Spiral-of-death guard: the accumulator runs at most MAX_STEPS_PER_FRAME (2: a 30 fps machine still runs
// in real time, anything slower runs in slight slow motion) steps per frame, and fewer
// while a fixed step is expensive (heavy destruction: hundreds of awake debris bodies). The real time
// each step takes is measured between beginFrame() and tick(); a frame runs at most
// STEP_BUDGET_MS / (measured step cost) steps (at least 1). A frame that falls behind therefore
// drops simulated time (brief slow motion) instead of running 4 expensive steps, which made the next
// frame even longer (measured: 4 × 100+ ms steps per rendered frame after a big wreck).

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 2;
/** Real time (ms) the fixed steps of one frame may take before fewer steps per frame are allowed. */
export const STEP_BUDGET_MS = 20;

const defaultNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Time {
  /** Simulation time scale: 0 = paused, 1 = normal, <1 slow-mo / hit-stop. */
  scale = 1;
  /** Total simulated seconds. */
  simTime = 0;
  /** Fixed steps executed since start. */
  step = 0;
  /** Real seconds since start. */
  realTime = 0;
  /** Last render frame delta (real seconds, clamped). */
  frameDt = 0;
  /** Real time one fixed step takes (ms, smoothed; measured inside beginFrame-driven frames). */
  stepCostMs = 0;
  /** Steps beginFrame() may run in the current frame (MAX_STEPS_PER_FRAME, fewer while steps are expensive). */
  maxSteps = MAX_STEPS_PER_FRAME;
  /** Clock for the step-cost measurement (ms; injectable for tests). */
  now: () => number = defaultNow;
  private acc = 0;
  private hitStopTimer = 0;
  private hitStopScale = 1;
  /** Steps of the current frame not yet ticked, and the time the previous one ended (step-cost measurement). */
  private pendingTicks = 0;
  private lastTickT = 0;

  /** Advance real time; returns how many fixed steps to run this frame. */
  beginFrame(realDt: number): number {
    const dt = Math.min(Math.max(realDt, 0), 0.25);
    this.frameDt = dt;
    this.realTime += dt;
    // Apply hit-stop to the portion of this frame it still covers, then advance its timer.
    let simDt = dt;
    if (this.hitStopTimer > 0) {
      const slow = Math.min(dt, this.hitStopTimer);
      simDt = slow * this.hitStopScale + (dt - slow);
      this.hitStopTimer -= dt;
      if (this.hitStopTimer <= 0) this.hitStopScale = 1;
    }
    this.acc += simDt * this.scale;
    let n = Math.floor(this.acc / FIXED_DT);
    const cap = this.stepCap();
    this.maxSteps = cap;
    if (n > cap) {
      n = cap;
      this.acc = 0;
    } else {
      this.acc -= n * FIXED_DT;
    }
    this.pendingTicks = n;
    this.lastTickT = this.now();
    return n;
  }

  /** Called once per executed fixed step. */
  tick(): void {
    this.step++;
    this.simTime += FIXED_DT;
    if (this.pendingTicks > 0) {
      // a step of the current frame: it ran from the previous tick (or beginFrame) until now
      this.pendingTicks--;
      const t = this.now();
      const ms = t - this.lastTickT;
      this.lastTickT = t;
      if (Number.isFinite(ms) && ms >= 0) this.stepCostMs = this.stepCostMs === 0 ? ms : this.stepCostMs + (Math.min(ms, 1000) - this.stepCostMs) * 0.25;
    }
  }

  /** Steps allowed this frame: as many as fit STEP_BUDGET_MS at the measured step cost (1..MAX_STEPS_PER_FRAME). */
  private stepCap(): number {
    const c = this.stepCostMs;
    if (!(c > STEP_BUDGET_MS / MAX_STEPS_PER_FRAME)) return MAX_STEPS_PER_FRAME;
    return Math.max(1, Math.min(MAX_STEPS_PER_FRAME, Math.floor(STEP_BUDGET_MS / c)));
  }

  /** Brief slow-down for heavy hits (game feel). */
  hitStop(seconds: number, scale = 0.15): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, seconds);
    this.hitStopScale = Math.min(this.hitStopScale, scale);
  }

  /** Interpolation factor (0..1) between the last two fixed steps for this render frame. */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.acc / FIXED_DT));
  }

  get paused(): boolean {
    return this.scale === 0;
  }
}
