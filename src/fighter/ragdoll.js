// Verlet ragdoll for a stick figure: 11 particles, 10 bones and joint limits.
// Driven kinematically while a fighter has full muscle control, blended
// (active ragdoll) during hit reactions and fully simulated when knocked out.

import { Particle, integrate, solveDistance, solveAngle } from '../physics/particles.js';
import { DEG } from '../core/math.js';
import { HEAD, NECK, PELVIS, ELB_A, HAND_A, ELB_B, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B, NJ } from './skeleton.js';

const MASS = [1.2, 1.6, 2.2, 0.5, 0.35, 0.5, 0.35, 0.75, 0.55, 0.75, 0.55];

export class Ragdoll {
  constructor(d) {
    const s = d.s;
    const rad = [d.headR, 5 * s, 6 * s, 4 * s, 4 * s, 4 * s, 4 * s, 4.5 * s, d.footR + 1, 4.5 * s, d.footR + 1];
    this.p = [];
    for (let i = 0; i < NJ; i++) this.p.push(new Particle(0, 0, rad[i], MASS[i] * s * s));
    this.mass = MASS.reduce((a, b) => a + b, 0) * s * s;
    this.bones = [
      [HEAD, NECK, d.neck],
      [NECK, PELVIS, d.torso],
      [NECK, ELB_A, d.upper],
      [ELB_A, HAND_A, d.fore],
      [NECK, ELB_B, d.upper],
      [ELB_B, HAND_B, d.fore],
      [PELVIS, KNEE_A, d.thigh],
      [KNEE_A, FOOT_A, d.shin],
      [PELVIS, KNEE_B, d.thigh],
      [KNEE_B, FOOT_B, d.shin],
    ];
    this.limits = [
      [PELVIS, KNEE_A, FOOT_A, -8 * DEG, 150 * DEG],
      [PELVIS, KNEE_B, FOOT_B, -8 * DEG, 150 * DEG],
      [NECK, ELB_A, HAND_A, -155 * DEG, 8 * DEG],
      [NECK, ELB_B, HAND_B, -155 * DEG, 8 * DEG],
      [PELVIS, NECK, HEAD, -55 * DEG, 55 * DEG],
      [NECK, PELVIS, KNEE_A, -140 * DEG, 45 * DEG],
      [NECK, PELVIS, KNEE_B, -140 * DEG, 45 * DEG],
    ];
    this.f = 1;
    this.sleeping = false;
    this.sleepT = 0;
    this.maxImpact = 0;
    this.settle = 0; // 0..1 extra damping for slow, piled-up bodies
    this.coreAvg = 0; // smoothed core speed (sleep test ignores contact jitter)
    this.impNx = 0; // normal and point of the hardest core impact this step
    this.impX = 0;
    this.impY = 0;
  }

  // Speed of the heavy core (pelvis and neck), ignoring flailing limbs.
  coreSpeed(h) {
    const a = this.p[2];
    const b = this.p[1];
    return Math.max(Math.abs(a.x - a.px) + Math.abs(a.y - a.py), Math.abs(b.x - b.px) + Math.abs(b.y - b.py)) / h;
  }

  setFromJoints(j) {
    for (let i = 0; i < NJ; i++) this.p[i].setPos(j[i * 2], j[i * 2 + 1]);
  }

  // Kinematic drive: particles jump to the targets. The Verlet velocity is
  // stored per physics substep so a switch to simulation keeps the motion.
  drive(j, sub) {
    for (let i = 0; i < NJ; i++) {
      const p = this.p[i];
      const nx = j[i * 2];
      const ny = j[i * 2 + 1];
      p.px = nx - (nx - p.x) / sub;
      p.py = ny - (ny - p.y) / sub;
      p.x = nx;
      p.y = ny;
    }
  }

  saveOld() {
    for (let i = 0; i < NJ; i++) {
      const p = this.p[i];
      p.ox = p.x;
      p.oy = p.y;
      p.impact = 0;
    }
  }

  addVel(vx, vy, h) {
    for (let i = 0; i < NJ; i++) this.p[i].addVel(vx, vy, h);
    this.sleeping = false;
    this.sleepT = 0;
  }

  addVelAt(i, vx, vy, h, spread = 0.5) {
    this.p[i].addVel(vx, vy, h);
    // neighbouring particles get part of the impulse
    for (const [a, b] of this.bones) {
      if (a === i) this.p[b].addVel(vx * spread, vy * spread, h);
      else if (b === i) this.p[a].addVel(vx * spread, vy * spread, h);
    }
    this.sleeping = false;
    this.sleepT = 0;
  }

  // Spin the body: top half and bottom half get opposite tangential pushes.
  addSpin(omega, h) {
    const pc = this.p[PELVIS];
    for (let i = 0; i < NJ; i++) {
      const p = this.p[i];
      const rx = p.x - pc.x;
      const ry = p.y - pc.y;
      p.addVel(-ry * omega, rx * omega, h);
    }
    this.sleeping = false;
    this.sleepT = 0;
  }

  velocity(h) {
    const p = this.p[PELVIS];
    return [(p.x - p.px) / h, (p.y - p.py) / h];
  }

  speed(h) {
    const [vx, vy] = this.velocity(h);
    return Math.sqrt(vx * vx + vy * vy);
  }

  maxSpeed(h) {
    let m = 0;
    for (let i = 0; i < NJ; i++) {
      const p = this.p[i];
      const dx = p.x - p.px;
      const dy = p.y - p.py;
      const v = dx * dx + dy * dy;
      if (v > m) m = v;
    }
    return Math.sqrt(m) / h;
  }

  // One physics substep. targets/muscle: active-ragdoll pull towards a pose.
  step(h, g, level, targets, muscle, mu, bounce, iters, drag = 0.998) {
    const p = this.p;
    const gm = g * (1 - muscle * 0.92);
    const maxDisp = 34;
    const dr = drag - this.settle * 0.06;
    for (let i = 0; i < NJ; i++) {
      p[i].ground = false;
      integrate(p[i], h, gm, dr, maxDisp);
    }
    if (muscle > 0 && targets) {
      const k = muscle * muscle * 0.55 + muscle * 0.1;
      const vd = muscle * 0.22;
      for (let i = 0; i < NJ; i++) {
        const q = p[i];
        q.x += (targets[i * 2] - q.x) * k;
        q.y += (targets[i * 2 + 1] - q.y) * k;
        q.px += (q.x - q.px) * vd;
        q.py += (q.y - q.py) * vd;
      }
    }
    const bones = this.bones;
    const lim = this.limits;
    const f = this.f;
    for (let it = 0; it < iters; it++) {
      for (let b = 0; b < bones.length; b++) {
        const bn = bones[b];
        solveDistance(p[bn[0]], p[bn[1]], bn[2], 1);
      }
      for (let l = 0; l < lim.length; l++) {
        const L = lim[l];
        solveAngle(p[L[0]], p[L[1]], p[L[2]], L[3], L[4], f, 0.4);
      }
    }
    for (let i = 0; i < NJ; i++) level.collideParticle(p[i], bounce, mu, h);
    // only the heavy core (head, neck, pelvis) counts as the body slamming down
    for (let i = 0; i < 3; i++) {
      const q = p[i];
      if (q.impact > this.maxImpact) {
        this.maxImpact = q.impact;
        this.impNx = q.impactNx;
        this.impX = q.x - q.impactNx * q.r;
        this.impY = q.y - q.impactNy * q.r;
      }
    }
  }

  grounded() {
    for (let i = 0; i < NJ; i++) if (this.p[i].ground) return true;
    return false;
  }

  lowestY() {
    let m = -1e9;
    for (let i = 0; i < NJ; i++) if (this.p[i].y + this.p[i].r > m) m = this.p[i].y + this.p[i].r;
    return m;
  }

  centroid() {
    let x = 0;
    let y = 0;
    for (let i = 0; i < NJ; i++) {
      x += this.p[i].x;
      y += this.p[i].y;
    }
    return [x / NJ, y / NJ];
  }

  hasNaN() {
    for (let i = 0; i < NJ; i++) {
      const p = this.p[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.px) || !Number.isFinite(p.py)) return true;
    }
    return false;
  }
}

export { HEAD, NECK, PELVIS, ELB_A, HAND_A, ELB_B, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B };
