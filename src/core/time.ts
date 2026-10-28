// Fixed-step clock. The game advances simulation in FIXED_DT steps; rendering interpolates
// nothing (Havok bodies are synced each step) but runs at display rate.

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 4;

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
  private acc = 0;
  private hitStopTimer = 0;
  private hitStopScale = 1;

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
    if (n > MAX_STEPS_PER_FRAME) {
      n = MAX_STEPS_PER_FRAME;
      this.acc = 0;
    } else {
      this.acc -= n * FIXED_DT;
    }
    return n;
  }

  /** Called once per executed fixed step. */
  tick(): void {
    this.step++;
    this.simTime += FIXED_DT;
  }

  /** Brief slow-down for heavy hits (game feel). */
  hitStop(seconds: number, scale = 0.15): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, seconds);
    this.hitStopScale = Math.min(this.hitStopScale, scale);
  }

  get paused(): boolean {
    return this.scale === 0;
  }
}
