// Adjusts the render scale to hold a steady frame rate. Frame times are capped by vsync,
// so the scale only creeps up after several smooth windows and drops quickly on stutter.
export class AdaptiveResolution {
  constructor(pipeline, { min = 0.5, max = 1 } = {}) {
    this.pipeline = pipeline;
    this.min = min;
    this.max = max;
    this.window = [];
    this.timer = 0;
    this.good = 0;
    this.vsync = 1000 / 60;
    this.onChange = null;
  }

  update(rawDt) {
    const ms = rawDt * 1000;
    if (ms <= 0 || ms > 250) return;
    this.window.push(ms);
    // The fastest frames approximate the display interval.
    this.vsync = Math.min(this.vsync * 1.0005, Math.max(ms, 4));
    this.timer += rawDt;
    if (this.timer < 1.5) return;
    this.timer = 0;
    const sorted = this.window.slice().sort((a, b) => a - b);
    this.window.length = 0;
    const median = sorted[Math.floor(sorted.length / 2)];
    const target = Math.max(this.vsync, 1000 / 60);
    const scale = this.pipeline.config.renderScale;
    let next = scale;
    if (median > target * 1.22) {
      next = scale - (median > target * 1.6 ? 0.1 : 0.05);
      this.good = 0;
    } else if (median < target * 1.06) {
      this.good++;
      if (this.good >= 3) {
        next = scale + 0.05;
        this.good = 0;
      }
    } else {
      this.good = 0;
    }
    next = Math.min(this.max, Math.max(this.min, next));
    if (Math.abs(next - scale) > 0.01) {
      this.pipeline.setRenderScale(next);
      if (this.onChange) this.onChange(next);
    }
  }
}
