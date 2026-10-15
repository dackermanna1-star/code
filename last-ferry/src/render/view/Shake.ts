// Screen shake and camera punches (stage.shakeOffset, world units).
//
// Trauma model: shake events add trauma (0..1), the offset is trauma² times a
// smooth multi-frequency noise, trauma decays. Punches are directional kicks
// on a damped spring (cannon impacts push the view down, the harpoon's recoil
// nudges it toward the gun).
import * as THREE from 'three';

/** Offset (m) at full trauma: ~15 px at 1280 wide. */
const MAX_OFFSET = 0.55;

export class Shake {
  private trauma = 0;
  private t = 0;
  /** Punch spring state. */
  private px = new THREE.Vector3();
  private pv = new THREE.Vector3();
  /** Options scale 0..1. */
  scale = 1;
  /** Wall-clock time the presentation has been frozen (dt 0: pause or hit-stop). */
  private frozenAt = -1;
  /** Ease of the offset while frozen (1 = full shake shown). */
  private hold = 1;

  constructor(private out: THREE.Vector3) {}

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.scale);
  }

  /** A directional kick (world units of velocity, m/s). */
  punch(x: number, y: number, z: number): void {
    const s = this.scale;
    this.pv.x += x * s;
    this.pv.y += y * s;
    this.pv.z += z * s;
  }

  update(dt: number): void {
    // Frozen (dt 0): a hit-stop keeps the shake as it is (a freeze frame), but a
    // pause behind a menu must not leave the camera tilted: after a moment the
    // offset eases out (by wall-clock time) and comes back when time runs again.
    if (dt <= 0) {
      const now = performance.now() / 1000;
      if (this.frozenAt < 0) this.frozenAt = now;
      const held = now - this.frozenAt;
      this.hold = held < 0.3 ? 1 : Math.max(0, 1 - (held - 0.3) / 0.25);
    } else {
      this.frozenAt = -1;
      this.hold = Math.min(1, this.hold + dt * 6);
    }
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * (0.9 + this.trauma * 1.2));
    // Critically damped-ish spring back to rest.
    const k = 220;
    const c = 22;
    if (dt > 0) {
      this.pv.x += (-this.px.x * k - this.pv.x * c) * dt;
      this.pv.y += (-this.px.y * k - this.pv.y * c) * dt;
      this.pv.z += (-this.px.z * k - this.pv.z * c) * dt;
      this.px.addScaledVector(this.pv, dt);
    }
    const s = this.trauma * this.trauma * MAX_OFFSET;
    const t = this.t;
    const nx = Math.sin(t * 37.3) * 0.6 + Math.sin(t * 61.1 + 1.3) * 0.4;
    const ny = Math.sin(t * 41.9 + 2.1) * 0.6 + Math.sin(t * 57.7 + 0.4) * 0.4;
    const h = this.hold;
    this.out.set((this.px.x + nx * s) * h, (this.px.y + ny * s * 0.8) * h, (this.px.z + nx * s * 0.3) * h);
  }

  reset(): void {
    this.frozenAt = -1;
    this.hold = 1;
    this.trauma = 0;
    this.px.set(0, 0, 0);
    this.pv.set(0, 0, 0);
    this.out.set(0, 0, 0);
  }

  get level(): number {
    return this.trauma;
  }
}
