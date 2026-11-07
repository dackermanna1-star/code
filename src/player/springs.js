// Small numeric helpers for the player module: damped springs, angle maths and
// easing curves. Everything here is allocation-free per frame.

export const TAU = Math.PI * 2;

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Frame-rate independent exponential approach for angles (shortest way round). */
export function dampAngle(current, target, lambda, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Critically/under-damped 1D spring (mass-spring-damper), integrated with
 * fixed sub-steps so stiff springs stay stable at low frame rates.
 *   omega: natural angular frequency (rad/s), zeta: damping ratio
 */
export class Spring {
  constructor(omega, zeta) {
    this.omega = omega;
    this.zeta = zeta;
    this.x = 0;
    this.v = 0;
  }

  step(target, dt) {
    if (dt <= 0) return this.x;
    const n = Math.min(40, Math.max(1, Math.ceil(dt / 0.004)));
    const h = dt / n, w = this.omega, k = w * w, c = 2 * this.zeta * w;
    let x = this.x, v = this.v;
    for (let i = 0; i < n; i++) {
      v += (k * (target - x) - c * v) * h;
      x += v * h;
    }
    // guard against numeric blow-ups (e.g. absurd input after a teleport)
    if (!Number.isFinite(x) || !Number.isFinite(v)) { x = 0; v = 0; }
    this.x = x; this.v = v;
    return x;
  }

  kick(dv) { this.v += dv; }
  reset(x = 0) { this.x = x; this.v = 0; }
}
