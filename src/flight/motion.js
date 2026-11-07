// =============================================================================
// Turbulence / airframe perturbations layered on top of the guided trajectory.
// Heave and sway are damped second-order responses to band-limited noise forcing
// (so displacement, velocity AND acceleration are consistent -> real g-loads),
// attitude perturbations are smooth noise. Intensity I: 0.05 light chop,
// 0.3 light turbulence, 0.5 moderate-light, 0.8 moderate.
// =============================================================================
import { G } from '../core/constants.js';
import { noise1, fbm1 } from '../core/util.js';
import { spring } from './fmath.js';

export class Perturb {
  constructor() { this.reset(); }
  reset() {
    this.heave = { x: 0, v: 0, a: 0 };   // m (world up)
    this.side = { x: 0, v: 0, a: 0 };    // m (body right, horizontal)
    this.roll = 0; this.pitch = 0; this.yaw = 0;
    this.t = 0;
  }
  step(dt, I) {
    this.t += dt;
    const t = this.t;
    const A = G * 0.55 * Math.pow(Math.max(0, I), 1.15);
    const f = A * (0.8 * fbm1(t * 0.62 + 13.1, 3) + 0.55 * noise1(t * 2.7 + 7.7) * Math.min(1, I * 2));
    spring(this.heave, 0, dt, 1.45, 0.62, f);
    spring(this.side, 0, dt, 1.0, 0.75, A * 0.22 * fbm1(t * 0.47 + 91.3, 2));
    this.roll = I * 0.052 * fbm1(t * 0.41 + 3.3, 3) + I * I * 0.03 * noise1(t * 1.65 + 9.1);
    this.pitch = I * 0.012 * fbm1(t * 0.57 + 21.7, 3);
    this.yaw = I * 0.008 * fbm1(t * 0.31 + 41.2, 2);
  }
}
