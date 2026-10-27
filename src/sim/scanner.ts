/**
 * Scientific scanner: a survey of the selected object that takes a few
 * seconds and must be performed within range. Completed scans unlock the
 * full physical description (composition, atmosphere, life, geology).
 */
import { AU, LY } from '../core/constants';
import type { Target } from './targets';

export const SCAN_TIME = 3.5;

/** Maximum distance (m, from the object's centre) at which a scan works. */
export function scanRange(t: Target): number {
  if (t.kind === 'galaxy' || t.kind === 'nebula') return t.radius * 3;
  if (t.kind === 'system') return 2 * LY;
  const b = t.body!;
  if (b.isStarLike) return Math.max(b.radius * 300, 60 * AU);
  return Math.max(b.radius * 40, 5e7);
}

export class Scanner {
  target: Target | null = null;
  progress = 0;

  get active() {
    return this.target !== null;
  }

  start(t: Target) {
    this.target = t;
    this.progress = 0;
  }

  cancel() {
    this.target = null;
    this.progress = 0;
  }

  /** Advance; returns 'done' when complete, 'range' if the target left scanner range. */
  update(dt: number, distance: number): 'done' | 'range' | null {
    const t = this.target;
    if (!t) return null;
    if (distance > scanRange(t)) {
      this.cancel();
      return 'range';
    }
    this.progress += dt / SCAN_TIME;
    if (this.progress >= 1) {
      this.target = null;
      this.progress = 0;
      return 'done';
    }
    return null;
  }
}
