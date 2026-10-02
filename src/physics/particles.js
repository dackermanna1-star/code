// Position-based (Verlet) particle physics: particles, distance constraints and
// 2D joint-angle limits. World collision lives in Level (it owns the geometry).

import { wrapAngle } from '../core/math.js';

export class Particle {
  constructor(x, y, r = 4, m = 1) {
    this.x = x;
    this.y = y;
    this.px = x; // previous position (Verlet velocity = x - px)
    this.py = y;
    this.ox = x; // position at start of the sim step (render interpolation)
    this.oy = y;
    this.r = r;
    this.m = m;
    this.w = 1 / m;
    this.ground = false;
    this.impact = 0; // strongest collision speed (units/s) this step
    this.impactNx = 0;
    this.impactNy = 0;
    this.drop = false; // ignore one-way platforms
  }

  setPos(x, y) {
    this.x = this.px = this.ox = x;
    this.y = this.py = this.oy = y;
  }

  // Velocity in units per second for substep length h.
  vx(h) {
    return (this.x - this.px) / h;
  }

  vy(h) {
    return (this.y - this.py) / h;
  }

  addVel(vx, vy, h) {
    this.px -= vx * h;
    this.py -= vy * h;
  }

  setVel(vx, vy, h) {
    this.px = this.x - vx * h;
    this.py = this.y - vy * h;
  }
}

export function integrate(p, h, gy, drag, maxDisp) {
  let vx = (p.x - p.px) * drag;
  let vy = (p.y - p.py) * drag;
  const d2 = vx * vx + vy * vy;
  if (d2 > maxDisp * maxDisp) {
    const k = maxDisp / Math.sqrt(d2);
    vx *= k;
    vy *= k;
  }
  p.px = p.x;
  p.py = p.y;
  p.x += vx;
  p.y += vy + gy * h * h;
}

export function solveDistance(a, b, rest, k) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const wsum = a.w + b.w;
  if (wsum === 0) return;
  const diff = ((d - rest) / (d * wsum)) * k;
  a.x += dx * diff * a.w;
  a.y += dy * diff * a.w;
  b.x -= dx * diff * b.w;
  b.y -= dy * diff * b.w;
}

export function solveMinDistance(a, b, min) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 1e-6;
  const wsum = a.w + b.w;
  const diff = (d - min) / (d * wsum);
  a.x += dx * diff * a.w;
  a.y += dy * diff * a.w;
  b.x -= dx * diff * b.w;
  b.y -= dy * diff * b.w;
}

// Keeps the angle at joint B (between segment A->B and B->C) inside [min, max].
// Angles use the skeleton's facing frame (see fighter/skeleton.js): an angle
// grows when a segment rotates from "up" through "forward" to "down" to "back".
// For a facing of -1 the screen-space rotation direction flips. Only the child
// end (C) is corrected so that stacked limits never fight over the torso.
export function solveAngle(a, b, c, min, max, f, k) {
  const pa = Math.atan2(b.y - a.y, b.x - a.x);
  const ca = Math.atan2(c.y - b.y, c.x - b.x);
  // measure around the middle of the allowed range so a fully folded joint
  // (near ±180°) is never mistaken for one bent the other way
  const mid = (min + max) * 0.5;
  const rel = mid + wrapAngle(wrapAngle(ca - pa) * f - mid);
  let target;
  if (rel < min) target = min;
  else if (rel > max) target = max;
  else return;
  let corr = (target - rel) * k;
  if (corr > 0.12) corr = 0.12;
  else if (corr < -0.12) corr = -0.12;
  const ang = f * corr;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const dx = c.x - b.x;
  const dy = c.y - b.y;
  const nx = b.x + dx * cs - dy * sn;
  const ny = b.y + dx * sn + dy * cs;
  c.x = nx;
  c.y = ny;
}

// Circle-vs-circle separation between particles of different bodies.
export function collideParticles(a, b, restitution) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 1e-9) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const pen = rr - d;
  const wsum = a.w + b.w;
  const ka = a.w / wsum;
  const kb = b.w / wsum;
  // relative velocity along the normal
  const avx = a.x - a.px;
  const avy = a.y - a.py;
  const bvx = b.x - b.px;
  const bvy = b.y - b.py;
  const rel = (bvx - avx) * nx + (bvy - avy) * ny;
  a.x -= nx * pen * ka;
  a.y -= ny * pen * ka;
  b.x += nx * pen * kb;
  b.y += ny * pen * kb;
  if (rel < 0) {
    const j = -(1 + restitution) * rel;
    a.px += nx * j * ka;
    a.py += ny * j * ka;
    b.px -= nx * j * kb;
    b.py -= ny * j * kb;
  }
  return true;
}
