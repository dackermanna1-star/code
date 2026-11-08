import * as THREE from 'three';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const Q = () => new THREE.Quaternion();
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const deg = Math.PI / 180;
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const fract = (x) => x - Math.floor(x);

const _m = new THREE.Matrix4();
const _x = V3(), _y = V3(), _z = V3(), _x2 = V3(), _y2 = V3(), _z2 = V3();
const _qa = Q(), _qb = Q();

/**
 * Quaternion that maps the rest basis (dir0, up0) onto (dir1, up1).
 * `up` vectors only need to be roughly perpendicular to `dir`.
 */
export function basisQuat(dir0, up0, dir1, up1, out = Q()) {
  _x.copy(dir0).normalize();
  _y.copy(up0).addScaledVector(_x, -up0.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  _x2.copy(dir1).normalize();
  _y2.copy(up1).addScaledVector(_x2, -up1.dot(_x2)).normalize();
  _z2.crossVectors(_x2, _y2);
  _m.makeBasis(_x, _y, _z);
  _qa.setFromRotationMatrix(_m);
  _m.makeBasis(_x2, _y2, _z2);
  _qb.setFromRotationMatrix(_m);
  return out.copy(_qb).multiply(_qa.invert());
}

export function axisAngle(axis, angle, out = Q()) { return out.setFromAxisAngle(axis, angle); }

/** Critically damped spring (scalar), Unity SmoothDamp style. state = {v} */
export function damp(current, target, state, smoothTime, dt, maxSpeed = Infinity) {
  if (!(dt > 0)) return current;
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const t = current - change;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = t + (change + temp) * exp;
  if ((target - current > 0) === (out > target)) { out = target; state.v = (out - target) / dt; }
  return out;
}

/** Underdamped spring for secondary motion: x'' = k(target-x) - c x' */
export class Spring {
  constructor(freq = 2, damping = 0.5, value = 0) {
    this.x = value; this.v = 0; this.setParams(freq, damping);
  }
  setParams(freq, damping) { this.w = 2 * Math.PI * freq; this.z = damping; }
  update(target, dt) {
    // semi-implicit integration, sub-stepped for stability
    const n = Math.max(1, Math.ceil(dt / 0.005));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

export class Spring3 {
  constructor(freq = 2, damping = 0.5) { this.x = V3(); this.v = V3(); this.setParams(freq, damping); this._a = V3(); }
  setParams(freq, damping) { this.w = 2 * Math.PI * freq; this.z = damping; }
  reset(p) { this.x.copy(p); this.v.set(0, 0, 0); }
  update(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.005));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this._a.subVectors(target, this.x).multiplyScalar(this.w * this.w).addScaledVector(this.v, -2 * this.z * this.w);
      this.v.addScaledVector(this._a, h);
      this.x.addScaledVector(this.v, h);
    }
    return this.x;
  }
}

/** Smooth value noise in [−1,1] for organic idle motion. */
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { const s = Math.sin((n + seed * 157.31) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
export function fbm1(t, seed = 0) {
  return noise1(t, seed) * 0.6 + noise1(t * 2.13, seed + 3) * 0.28 + noise1(t * 4.7, seed + 7) * 0.12;
}

/** Cubic Hermite step: advance (p,v) toward (p1,v1) arriving after `remaining` seconds. */
export function hermiteStep(p, v, p1, v1, remaining, dt, outP, outV) {
  if (remaining <= dt + 1e-5) { outP.copy(p1); outV.copy(v1); return; }
  const u = dt / remaining, T = remaining;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
  const px = h00 * p.x + h10 * T * v.x + h01 * p1.x + h11 * T * v1.x;
  const py = h00 * p.y + h10 * T * v.y + h01 * p1.y + h11 * T * v1.y;
  const pz = h00 * p.z + h10 * T * v.z + h01 * p1.z + h11 * T * v1.z;
  const vx = (d00 * p.x + d10 * T * v.x + d01 * p1.x + d11 * T * v1.x) / T;
  const vy = (d00 * p.y + d10 * T * v.y + d01 * p1.y + d11 * T * v1.y) / T;
  const vz = (d00 * p.z + d10 * T * v.z + d01 * p1.z + d11 * T * v1.z) / T;
  outP.set(px, py, pz); outV.set(vx, vy, vz);
}
