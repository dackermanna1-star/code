/**
 * Dynamic resolution: scales the 3D render resolution to hold a target frame
 * rate. It measures real frame times over a short window, steps the scale
 * down quickly when frames are slow and back up slowly when there is
 * headroom (hysteresis, so it doesn't oscillate). The interface is never
 * scaled.
 */
export class DynamicResolution {
  /** current scale on top of the user's render scale (min..1) */
  scale = 1;
  enabled = true;
  targetFps = 45;
  min = 0.5;
  private samples: number[] = [];
  private since = 0;
  private cooldown = 0;

  /**
   * Feed one frame's real duration (s). Returns the new scale when it
   * changed, else null. `active` is false while frames don't reflect normal
   * play (title screen, loading, hidden tab): those are ignored.
   */
  update(frameSeconds: number, active: boolean): number | null {
    if (!this.enabled) {
      if (this.scale !== 1) { this.scale = 1; return 1; }
      return null;
    }
    if (!active || frameSeconds <= 0 || frameSeconds > 0.5) { this.samples.length = 0; this.since = 0; return null; }
    this.samples.push(frameSeconds);
    this.since += frameSeconds;
    this.cooldown = Math.max(0, this.cooldown - frameSeconds);
    if (this.since < 1.5 || this.cooldown > 0) return null;
    const s = this.samples.slice().sort((a, b) => a - b);
    const fps = 1 / s[Math.floor(s.length * 0.6)]; // a little pessimistic: slow frames are what you feel
    this.samples.length = 0;
    this.since = 0;
    let next = this.scale;
    if (fps < this.targetFps * 0.88) next = Math.max(this.min, this.scale * Math.max(0.7, Math.sqrt(fps / this.targetFps)));
    else if (fps > this.targetFps * 1.25 && this.scale < 1) next = Math.min(1, this.scale * 1.08);
    next = Math.round(next * 40) / 40; // coarse steps: each change reallocates render targets
    if (next === this.scale) return null;
    this.cooldown = next < this.scale ? 0.5 : 2;
    this.scale = next;
    return next;
  }
}
