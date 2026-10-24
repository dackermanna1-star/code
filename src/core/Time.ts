import { clamp } from './math';

/**
 * Game time control: hit-stop (brief freeze frames on heavy impacts) and
 * slow motion (finishers, rage activation). All durations are in real seconds.
 */
export class TimeControl {
  /** Current multiplier applied to game dt. */
  scale = 1;
  private hitStopTimer = 0;
  private hitStopScale = 0.05;
  private slowTimer = 0;
  private slowDuration = 0;
  private slowScale = 1;
  /** Persistent multiplier (e.g. pause = 0). */
  base = 1;
  elapsed = 0;
  realElapsed = 0;

  hitStop(seconds: number, scale = 0.04): void {
    if (seconds > this.hitStopTimer) {
      this.hitStopTimer = Math.min(seconds, 0.2);
      this.hitStopScale = scale;
    }
  }

  slowMo(seconds: number, scale: number): void {
    if (this.slowTimer > 0 && scale > this.slowScale) return;
    this.slowTimer = seconds;
    this.slowDuration = seconds;
    this.slowScale = scale;
  }

  update(realDt: number): number {
    this.realElapsed += realDt;
    let s = 1;
    if (this.slowTimer > 0) {
      this.slowTimer -= realDt;
      // ease back to normal speed over the last 35% of the slow-mo
      const t = clamp(this.slowTimer / Math.max(this.slowDuration, 1e-3), 0, 1);
      const ramp = t > 0.35 ? 1 : t / 0.35;
      s = Math.min(s, this.slowScale + (1 - this.slowScale) * (1 - ramp));
    }
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= realDt;
      s = Math.min(s, this.hitStopScale);
    }
    this.scale = s * this.base;
    const dt = realDt * this.scale;
    this.elapsed += dt;
    return dt;
  }

  /** Clear slow motion / hit stop (new round). */
  reset(): void {
    this.hitStopTimer = 0;
    this.slowTimer = 0;
    this.slowScale = 1;
    this.scale = 1;
    this.base = 1;
  }

  /** 0 = normal speed, 1 = heavy slow motion (for screen effects). */
  get slowness(): number {
    return this.slowTimer > 0 ? clamp((1 - this.slowScale) * Math.min(1, this.slowTimer / Math.max(0.2, this.slowDuration * 0.35)), 0, 1) : 0;
  }

  get inHitStop(): boolean {
    return this.hitStopTimer > 0;
  }
}
