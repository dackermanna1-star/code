// Small animation toolkit on game time: easing, tweens, springs, timers.

import * as THREE from 'three';

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  sine: (t: number) => 0.5 - Math.cos(t * Math.PI) / 2,
};

interface Job {
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
  done?: () => void;
  resolve: () => void;
  cancelled: boolean;
  owner?: object;
}

/** Runs tweens and timers on game time (pauses with the game). */
export class Animator {
  private jobs: Job[] = [];
  time = 0;

  update(dt: number) {
    this.time += dt;
    const jobs = this.jobs;
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (j.cancelled) continue;
      j.t += dt;
      const k = j.dur <= 0 ? 1 : Math.min(1, j.t / j.dur);
      j.tick(k, dt);
      if (k >= 1) {
        j.cancelled = true;
        j.done?.();
        j.resolve();
      }
    }
    if (jobs.some((j) => j.cancelled)) this.jobs = jobs.filter((j) => !j.cancelled);
  }

  /** Generic tween: tick(k) with eased k in 0..1. */
  run(dur: number, tick: (k: number, dt: number) => void, opts: { ease?: Ease; owner?: object; done?: () => void } = {}): Promise<void> {
    const e = opts.ease ?? ease.inOutQuad;
    return new Promise((resolve) => {
      this.jobs.push({ t: 0, dur, tick: (k, dt) => tick(e(k), dt), done: opts.done, resolve, cancelled: false, owner: opts.owner });
    });
  }

  wait(seconds: number, owner?: object): Promise<void> {
    return new Promise((resolve) => {
      this.jobs.push({ t: 0, dur: seconds, tick: () => {}, resolve, cancelled: false, owner });
    });
  }

  /** Tween a Vector3 towards a target. */
  vec(v: THREE.Vector3, to: THREE.Vector3, dur: number, e: Ease = ease.inOutQuad, owner?: object): Promise<void> {
    const from = v.clone();
    const target = to.clone();
    return this.run(dur, (k) => v.lerpVectors(from, target, k), { ease: e, owner });
  }

  /** Cancel all jobs of an owner (their promises resolve immediately). */
  cancel(owner: object) {
    for (const j of this.jobs)
      if (j.owner === owner && !j.cancelled) {
        j.cancelled = true;
        j.resolve();
      }
  }
}

/** Critically-damped-ish spring for smooth, bouncy follow motion. */
export class Spring {
  value: number;
  target: number;
  vel = 0;
  constructor(v = 0, public stiffness = 170, public damping = 18) {
    this.value = v;
    this.target = v;
  }
  update(dt: number): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const f = -this.stiffness * (this.value - this.target) - this.damping * this.vel;
      this.vel += f * h;
      this.value += this.vel * h;
    }
    return this.value;
  }
  kick(v: number) {
    this.vel += v;
  }
  snap(v: number) {
    this.value = this.target = v;
    this.vel = 0;
  }
}

export class Spring3 {
  readonly value = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  constructor(public stiffness = 170, public damping = 18) {}
  update(dt: number) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const f = new THREE.Vector3();
    for (let i = 0; i < steps; i++) {
      f.subVectors(this.value, this.target).multiplyScalar(-this.stiffness).addScaledVector(this.vel, -this.damping);
      this.vel.addScaledVector(f, h);
      this.value.addScaledVector(this.vel, h);
    }
    return this.value;
  }
  snap(v: THREE.Vector3) {
    this.value.copy(v);
    this.target.copy(v);
    this.vel.set(0, 0, 0);
  }
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampVec(v: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  return v.lerp(target, 1 - Math.exp(-lambda * dt));
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
