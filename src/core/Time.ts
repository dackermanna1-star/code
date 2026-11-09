/**
 * Global game clock with time scaling (slow motion).
 * Physics and gameplay read `Time.dt` (scaled); UI/camera may use `Time.realDt`.
 */
export const Time = {
  /** Scaled delta time in seconds for the current frame. */
  dt: 0,
  /** Unscaled delta time in seconds. */
  realDt: 0,
  /** Scaled seconds since the game started. */
  now: 0,
  /** Unscaled seconds since the game started. */
  realNow: 0,
  /** Current time scale (1 = normal, 0.3 = slow-mo). */
  scale: 1,

  _slowmoTarget: 1,
  _slowmoRemaining: 0,

  /** Trigger slow motion; overlapping requests keep the strongest. */
  slowmo(scale: number, duration: number): void {
    if (this._slowmoRemaining > 0 && scale > this._slowmoTarget) return;
    this._slowmoTarget = scale;
    this._slowmoRemaining = duration;
  },

  tick(realDt: number): void {
    // Clamp huge frame gaps (tab switch) so physics doesn't explode.
    realDt = Math.min(realDt, 1 / 20);
    this.realDt = realDt;
    this.realNow += realDt;
    if (this._slowmoRemaining > 0) {
      this._slowmoRemaining -= realDt;
      this.scale += (this._slowmoTarget - this.scale) * Math.min(1, realDt * 25);
    } else {
      this.scale += (1 - this.scale) * Math.min(1, realDt * 6);
      if (Math.abs(1 - this.scale) < 0.01) this.scale = 1;
    }
    this.dt = realDt * this.scale;
    this.now += this.dt;
  },
};
