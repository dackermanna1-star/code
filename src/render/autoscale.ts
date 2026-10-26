// Dynamic resolution: keeps the frame rate near the target by rendering fewer pixels when the GPU cannot
// keep up, and more again once there is headroom. When the resolution floor is reached and the game is
// still GPU-bound, it asks for a cheaper quality preset (only in "auto" quality).

const STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

export class AutoScale {
  /** index into STEPS of the current resolution factor */
  private step = 0;
  private winT = 0;
  private winFrames = 0;
  private winFrame = 0;
  private winCpu = 0;
  private fastWindows = 0;
  private slowWindows = 0;
  private sinceChange = 0;
  /** step that failed after a raise, and how long to stay away from it */
  private failedStep = -1;
  private failedT = 0;
  private lastRaise = -1;
  enabled = true;
  /** called when the floor is reached and frames are still too slow; returns true if it lowered quality */
  onFloor: (() => boolean) | null = null;

  constructor(private targetMs = 1000 / 60) {}

  /** Current resolution factor (multiplies the preset's scale). */
  get factor(): number { return STEPS[this.step]; }
  get stepIndex(): number { return this.step; }
  /** Start from a remembered step (e.g. what the last session settled on). */
  setStep(i: number): void { this.step = Math.max(0, Math.min(STEPS.length - 1, i | 0)); this.sinceChange = 0; }

  /** Start over at full resolution (after the quality preset changed). */
  reset(): void { this.step = 0; this.fastWindows = this.slowWindows = 0; this.sinceChange = 0; this.failedStep = -1; this.lastRaise = -1; this.clearWindow(); }

  private clearWindow(): void { this.winT = 0; this.winFrames = 0; this.winFrame = 0; this.winCpu = 0; }

  /**
   * Feed one frame: frameMs = time since the previous frame, cpuMs = main-thread work of this frame.
   * Returns true when the resolution factor changed.
   */
  update(frameMs: number, cpuMs: number): boolean {
    if (!this.enabled) return false;
    // pauses (menu, tab in background, loading hitches) say nothing about the GPU
    if (frameMs > 3000) { this.clearWindow(); return false; }
    this.winT += frameMs; this.winFrames++; this.winFrame += frameMs; this.winCpu += cpuMs;
    this.sinceChange += frameMs;
    if (this.failedT > 0) this.failedT -= frameMs;
    if (this.winT < 500) return false;
    const avg = this.winFrame / this.winFrames, cpu = this.winCpu / this.winFrames;
    this.clearWindow();
    const T = this.targetMs;
    // GPU-bound when frames are slow but the main thread is not what fills them
    const slow = avg > T * 1.15 && cpu < avg * 0.75;
    const fast = avg < T * 1.06;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.fastWindows = fast ? this.fastWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.sinceChange > 900) {
      this.slowWindows = 0;
      // a raise that made things slow again: don't retry that step for a while
      if (this.lastRaise === this.step && this.sinceChange < 4000) { this.failedStep = this.step; this.failedT = 30000; }
      if (this.step < STEPS.length - 1) {
        // far too slow: skip a step
        this.step = Math.min(STEPS.length - 1, this.step + (avg > T * 1.8 ? 2 : 1));
        this.sinceChange = 0; this.lastRaise = -1;
        return true;
      }
      if (this.onFloor?.()) { this.step = 1; this.sinceChange = 0; return true; }
      return false;
    }
    if (this.fastWindows >= 4 && this.step > 0 && this.sinceChange > 3000) {
      const next = this.step - 1;
      if (next === this.failedStep && this.failedT > 0) return false;
      this.fastWindows = 0;
      this.step = next; this.sinceChange = 0; this.lastRaise = next;
      return true;
    }
    return false;
  }
}
