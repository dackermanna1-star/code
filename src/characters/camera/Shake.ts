// Trauma-based camera shake (explosions, landings, hits): smooth noise rotation + small positional jitter.
import * as THREE from 'three';
import { DEG } from '../../core/math';

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();

/** Cheap smooth 1D noise (sum of sines with irrational frequencies). */
function noise(t: number, seed: number): number {
  return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.13 + seed * 2.1) * 0.3 + Math.sin(t * 7.37 + seed * 3.7) * 0.2;
}

export class Shake {
  private trauma = 0;
  private decay = 1;
  private time = 0;

  add(intensity: number, duration: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, intensity));
    this.decay = Math.max(this.decay, 1 / Math.max(0.05, duration));
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    if (this.trauma === 0) this.decay = 1;
  }

  apply(cam: THREE.Camera): void {
    if (this.trauma <= 0) return;
    const s = this.trauma * this.trauma;
    const t = this.time * 18;
    _e.set(noise(t, 1) * 2.2 * DEG * s, noise(t, 7) * 2.2 * DEG * s, noise(t, 13) * 3 * DEG * s);
    _q.setFromEuler(_e);
    cam.quaternion.multiply(_q);
    cam.position.x += noise(t, 21) * 0.04 * s;
    cam.position.y += noise(t, 27) * 0.04 * s;
  }
}
