// Trauma-based camera shake (pure). Impacts add trauma in [0, 1]; the shake amplitude is
// trauma² (so small knocks stay subtle and big hits are violent) times smooth noise per
// axis, and trauma decays linearly. Offsets are recomputed in place each update (the
// returned vectors are reused, no per-frame allocation).

import { noise1 } from "./noise.ts";

export interface ShakeVec {
  x: number;
  y: number;
  z: number;
}

export class ShakeModel {
  /** Current trauma 0..1. */
  trauma = 0;
  /** Trauma removed per second. */
  decay = 1.6;
  /** Noise frequency (Hz-ish): ~20 gives a punchy rattle. */
  frequency = 21;
  /** Max position offset (metres) at trauma 1. */
  maxPos = 0.045;
  /** Max rotation offsets (radians) at trauma 1: x = pitch, y = yaw, z = roll. */
  readonly maxRot: ShakeVec = { x: 0.032, y: 0.028, z: 0.05 };
  /** Offsets for this frame. */
  readonly pos: ShakeVec = { x: 0, y: 0, z: 0 };
  readonly rot: ShakeVec = { x: 0, y: 0, z: 0 };
  private t = 0;

  /** Add trauma (clamped to [0, 1]; NaN/negative ignored). */
  add(amount: number): void {
    if (!(amount > 0)) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Advance by dt seconds and recompute offsets. `scale` is the user's camera-shake setting
   * (0 disables shaking without losing trauma bookkeeping).
   */
  update(dt: number, scale = 1): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.t += step;
    if (this.t > 1e5) this.t -= 1e5; // keep float precision over very long sessions
    this.trauma = Math.max(0, this.trauma - this.decay * step);
    const s = this.trauma * this.trauma * Math.max(0, Math.min(1, Number.isFinite(scale) ? scale : 0));
    if (s <= 1e-6) {
      this.pos.x = this.pos.y = this.pos.z = 0;
      this.rot.x = this.rot.y = this.rot.z = 0;
      return;
    }
    const ft = this.t * this.frequency;
    this.pos.x = this.maxPos * s * noise1(ft, 11);
    this.pos.y = this.maxPos * s * noise1(ft, 23);
    this.pos.z = this.maxPos * s * 0.5 * noise1(ft, 37);
    this.rot.x = this.maxRot.x * s * noise1(ft, 41);
    this.rot.y = this.maxRot.y * s * noise1(ft, 53);
    this.rot.z = this.maxRot.z * s * noise1(ft * 0.8, 67);
  }
}

/**
 * Screen flash envelope: the strongest recent flash wins, then fades exponentially.
 * Colour is linear RGB in [0, 1].
 */
export class FlashModel {
  alpha = 0;
  readonly color: ShakeVec = { x: 1, y: 1, z: 1 };
  /** Fade time constant (seconds). */
  tau = 0.11;

  trigger(intensity: number, hex = 0xffffff): void {
    const a = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0));
    if (a <= 0 || a < this.alpha * 0.8) return; // a weaker flash does not override a strong one
    this.alpha = Math.max(this.alpha, a);
    this.color.x = ((hex >> 16) & 255) / 255;
    this.color.y = ((hex >> 8) & 255) / 255;
    this.color.z = (hex & 255) / 255;
  }

  update(dt: number): void {
    if (this.alpha <= 0) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.alpha *= Math.exp(-step / this.tau);
    if (this.alpha < 0.004) this.alpha = 0;
  }
}
