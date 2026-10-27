/**
 * Two-body Keplerian orbits. Bodies in the current system follow analytic
 * Kepler "rails" (stable, deterministic, cheap at any time-warp); spacecraft
 * are integrated numerically in the summed gravity field of these bodies.
 *
 * Reference frame: system frame, Y up (north of the invariable plane).
 */
import { Vector3 } from 'three';

export interface OrbitElements {
  a: number;      // semi-major axis (m); negative for hyperbolic
  e: number;      // eccentricity
  i: number;      // inclination (rad) relative to the system XZ plane
  node: number;   // longitude of ascending node Ω (rad)
  peri: number;   // argument of periapsis ω (rad)
  M0: number;     // mean anomaly at epoch (rad)
  epoch: number;  // s (J2000 seconds)
  mu: number;     // G(M_parent + M_body) m³/s²
}

const TAU = Math.PI * 2;

/** Solve Kepler's equation M = E − e sin E (elliptic). */
export function solveKeplerE(M: number, e: number): number {
  M = M % TAU;
  if (M > Math.PI) M -= TAU;
  else if (M < -Math.PI) M += TAU;
  // Danby's starting guess converges for all 0 ≤ e < 1
  let E = M + 0.85 * e * (Math.sin(M) >= 0 ? 1 : -1);
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** Solve hyperbolic Kepler's equation M = e sinh H − H. */
export function solveKeplerH(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let k = 0; k < 60; k++) {
    const f = e * Math.sinh(H) - H - M;
    const fp = e * Math.cosh(H) - 1;
    const d = f / fp;
    H -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return H;
}

export function orbitalPeriod(o: OrbitElements): number {
  return o.a > 0 ? TAU * Math.sqrt((o.a * o.a * o.a) / o.mu) : Infinity;
}

/** Perifocal → system-frame rotation applied to (x, y) in the orbital plane. Y-up. */
function toSystem(o: OrbitElements, px: number, py: number, out: Vector3) {
  const cO = Math.cos(o.node), sO = Math.sin(o.node);
  const ci = Math.cos(o.i), si = Math.sin(o.i);
  const cw = Math.cos(o.peri), sw = Math.sin(o.peri);
  // standard ecliptic (X, Y, Z-north)
  const X = (cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py;
  const Y = (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py;
  const Z = sw * si * px + cw * si * py;
  // map to Y-up: (X, Z, -Y)
  out.set(X, Z, -Y);
  return out;
}

/** Position (and optionally velocity) relative to the parent at time t. */
export function orbitState(o: OrbitElements, t: number, pos: Vector3, vel?: Vector3) {
  const dt = t - o.epoch;
  if (o.e < 1) {
    const n = Math.sqrt(o.mu / (o.a * o.a * o.a));
    const M = o.M0 + n * dt;
    const E = solveKeplerE(M, o.e);
    const cE = Math.cos(E), sE = Math.sin(E);
    const b = o.a * Math.sqrt(1 - o.e * o.e);
    toSystem(o, o.a * (cE - o.e), b * sE, pos);
    if (vel) {
      const r = o.a * (1 - o.e * cE);
      const k = Math.sqrt(o.mu * o.a) / r;
      toSystem(o, -k * sE, k * Math.sqrt(1 - o.e * o.e) * cE, vel);
    }
  } else {
    const a = -Math.abs(o.a);
    const n = Math.sqrt(o.mu / -(a * a * a));
    const M = o.M0 + n * dt;
    const H = solveKeplerH(M, o.e);
    const cH = Math.cosh(H), sH = Math.sinh(H);
    const b = -a * Math.sqrt(o.e * o.e - 1);
    toSystem(o, a * (cH - o.e), b * sH, pos);
    if (vel) {
      const r = a * (1 - o.e * cH);
      const k = Math.sqrt(o.mu * -a) / r;
      toSystem(o, -k * sH, k * Math.sqrt(o.e * o.e - 1) * cH, vel);
    }
  }
  return pos;
}

/** Recover elements from a state vector (used for trajectory display & autopilot). */
export function elementsFromState(r: Vector3, v: Vector3, mu: number, t: number): OrbitElements {
  // convert from Y-up to Z-north
  const R = new Vector3(r.x, -r.z, r.y), V = new Vector3(v.x, -v.z, v.y);
  const h = new Vector3().crossVectors(R, V);
  const rl = R.length(), vl2 = V.lengthSq();
  const evec = new Vector3().crossVectors(V, h).multiplyScalar(1 / mu).sub(R.clone().multiplyScalar(1 / rl));
  const e = evec.length();
  const energy = vl2 / 2 - mu / rl;
  const a = Math.abs(e - 1) < 1e-10 ? 1e30 : -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, h.z / h.length())));
  const nvec = new Vector3(-h.y, h.x, 0);
  const nl = nvec.length();
  let node = nl > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, nvec.x / nl))) : 0;
  if (nvec.y < 0) node = TAU - node;
  let peri: number;
  if (nl > 1e-12 && e > 1e-10) {
    peri = Math.acos(Math.max(-1, Math.min(1, nvec.dot(evec) / (nl * e))));
    if (evec.z < 0) peri = TAU - peri;
  } else if (e > 1e-10) {
    peri = Math.atan2(evec.y, evec.x);
  } else peri = 0;
  let nu: number;
  if (e > 1e-10) {
    nu = Math.acos(Math.max(-1, Math.min(1, evec.dot(R) / (e * rl))));
    if (R.dot(V) < 0) nu = TAU - nu;
  } else {
    const ref = nl > 1e-12 ? nvec : new Vector3(1, 0, 0);
    nu = Math.acos(Math.max(-1, Math.min(1, ref.dot(R) / (ref.length() * rl))));
    if (R.z < 0 && nl > 1e-12) nu = TAU - nu;
  }
  let M0: number;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M0 = E - e * Math.sin(E);
  } else {
    const Hh = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    M0 = e * Math.sinh(Hh) - Hh;
  }
  return { a, e, i, node, peri, M0, epoch: t, mu };
}
