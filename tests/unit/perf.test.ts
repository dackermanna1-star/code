import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../../src/render/dynres';

const run = (d: DynamicResolution, fps: number, seconds: number, active = true) => {
  let last: number | null = null;
  for (let t = 0; t < seconds; t += 1 / fps) {
    const k = d.update(1 / fps, active);
    if (k !== null) last = k;
  }
  return last;
};

describe('dynamic resolution', () => {
  it('drops the resolution when frames are slow, never below the floor', () => {
    const d = new DynamicResolution();
    d.targetFps = 45;
    run(d, 20, 20);
    expect(d.scale).toBeLessThan(0.8);
    expect(d.scale).toBeGreaterThanOrEqual(d.min);
  });

  it('recovers slowly when there is headroom, and holds steady near the target', () => {
    const d = new DynamicResolution();
    d.scale = 0.5;
    run(d, 90, 30);
    expect(d.scale).toBe(1);
    const before = d.scale;
    run(d, 44, 20); // within the dead band: no change
    expect(d.scale).toBe(before);
  });

  it('ignores frames that are not normal play, and stays at full size when disabled', () => {
    const d = new DynamicResolution();
    run(d, 10, 20, false);
    expect(d.scale).toBe(1);
    d.enabled = false;
    d.scale = 0.6;
    expect(d.update(1 / 10, true)).toBe(1);
    expect(d.scale).toBe(1);
  });
});
