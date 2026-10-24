import * as THREE from 'three';
import { clamp } from '../core/math';

/** Smooth pseudo-noise from summed sines with irrational frequencies. */
function noise1(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.31 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.77 + seed * 2.3) * 0.2
  );
}

class Spring {
  value = 0;
  vel = 0;
  constructor(
    public stiffness = 180,
    public damping = 16,
  ) {}
  impulse(v: number): void {
    this.vel += v;
  }
  update(dt: number): number {
    // semi-implicit euler, substepped for stability
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vel += (-this.stiffness * this.value - this.damping * this.vel) * h;
      this.value += this.vel * h;
    }
    return this.value;
  }
}

/**
 * Trauma based camera shake + spring "kicks" for punches, hits and recoil.
 * Runs on real time so shake continues during hit-stop freeze frames.
 */
export class CameraFX {
  trauma = 0;
  private t = 0;
  pitchKick = new Spring(170, 15);
  yawKick = new Spring(170, 15);
  rollKick = new Spring(150, 13);
  posKickX = new Spring(220, 18);
  posKickY = new Spring(220, 18);
  posKickZ = new Spring(220, 18);
  fovKick = new Spring(120, 14);
  /** extra sustained shake (e.g. while charging) 0..1 */
  rumble = 0;
  intensity = 1; // user setting

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount * this.intensity, 0, 1);
  }

  /** Rotational kick in radians/sec impulse. */
  kick(pitch: number, yaw = 0, roll = 0): void {
    this.pitchKick.impulse(pitch * this.intensity);
    this.yawKick.impulse(yaw * this.intensity);
    this.rollKick.impulse(roll * this.intensity);
  }

  /** Positional kick in camera space (x right, y up, z back). */
  push(x: number, y: number, z: number): void {
    this.posKickX.impulse(x * this.intensity);
    this.posKickY.impulse(y * this.intensity);
    this.posKickZ.impulse(z * this.intensity);
  }

  fovPunch(amount: number): void {
    this.fovKick.impulse(amount);
  }

  /** Returns offsets to apply to the camera this frame. */
  update(realDt: number, outPos: THREE.Vector3, outRot: THREE.Euler): number {
    this.t += realDt;
    this.trauma = Math.max(0, this.trauma - realDt * 1.5);
    const shake = this.trauma * this.trauma + this.rumble * 0.08;
    const f = 24;
    const tt = this.t * f;
    const maxAng = 0.06;
    const maxPos = 0.06;
    outRot.set(
      noise1(tt, 1.3) * maxAng * shake + this.pitchKick.update(realDt),
      noise1(tt, 7.1) * maxAng * shake + this.yawKick.update(realDt),
      noise1(tt, 3.7) * maxAng * 1.4 * shake + this.rollKick.update(realDt),
    );
    outPos.set(
      noise1(tt, 11.2) * maxPos * shake + this.posKickX.update(realDt),
      noise1(tt, 5.5) * maxPos * shake + this.posKickY.update(realDt),
      this.posKickZ.update(realDt),
    );
    return this.fovKick.update(realDt);
  }
}
