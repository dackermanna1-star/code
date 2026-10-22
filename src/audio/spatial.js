// Listener-relative acoustics: distance attenuation, air absorption, reverb
// send, stereo position, doppler and retarded source positions. All in metres
// and seconds, world space with +Y up.
import { clamp, smoothstep } from './dsp.js';

export const SPEED_OF_SOUND = 343;
export const MAX_DELAY = 8;

export const dbToGain = (db) => Math.pow(10, db / 20);

function norm3(x, y, z, fallback) {
  const l = Math.hypot(x, y, z);
  return l > 1e-6 ? [x / l, y / l, z / l] : fallback;
}

export class Listener {
  constructor() {
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.fx = 0;
    this.fy = 0;
    this.fz = -1;
    this.ux = 0;
    this.uy = 1;
    this.uz = 0;
    this.rx = 1;
    this.ry = 0;
    this.rz = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }

  set(l) {
    if (!l) return;
    if (l.position) {
      this.px = l.position.x || 0;
      this.py = l.position.y || 0;
      this.pz = l.position.z || 0;
    }
    const f = l.forward ? norm3(l.forward.x, l.forward.y, l.forward.z, [0, 0, -1]) : [this.fx, this.fy, this.fz];
    const u = l.up ? norm3(l.up.x, l.up.y, l.up.z, [0, 1, 0]) : [this.ux, this.uy, this.uz];
    // right = forward x up (three.js camera: forward -Z, up +Y -> right +X)
    // Looking straight along `up` makes the cross product vanish: keep the previous right.
    const r = norm3(f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0], [this.rx, this.ry, this.rz]);
    [this.fx, this.fy, this.fz] = f;
    [this.ux, this.uy, this.uz] = u;
    [this.rx, this.ry, this.rz] = r;
    const v = l.velocity;
    this.vx = v ? v.x || 0 : 0;
    this.vy = v ? v.y || 0 : 0;
    this.vz = v ? v.z || 0 : 0;
  }
}

// Gain (linear) of a source class at distance d: power-law spreading inside the
// class range, an excess-attenuation term (ground, foliage, turbulence) and a fade to silence.
export function distanceGain(def, d) {
  const r = Math.max(d, def.ref);
  let g = Math.pow(def.ref / r, def.roll);
  g *= Math.exp(-Math.max(0, d - def.ref) / def.range);
  if (d > def.range * 0.75) g *= 1 - smoothstep(def.range * 0.75, def.range, d);
  return g;
}

// Air absorption as a lowpass cutoff: ~10 kHz at 50 m, ~4 kHz at 300 m, ~1.7 kHz at 1 km.
export function airCutoff(d) {
  return clamp(17000 / (1 + Math.pow(Math.max(d, 0) / 60, 0.8)), 280, 20000);
}

// Fraction sent to the outdoor reverb (relative to the source level) and the
// direct-path multiplier: distant sounds arrive mostly as terrain reflections.
export function wetAmount(d) {
  return 0.1 + 0.62 * Math.pow(clamp(d / 1200, 0, 1), 0.6);
}

export function dryAmount(d) {
  return 1 - 0.45 * smoothstep(150, 2500, d);
}

// Fills `out` with distance, stereo pan, front/back factor and lowpass cutoff.
export function locate(L, x, y, z, out) {
  const dx = x - L.px;
  const dy = y - L.py;
  const dz = z - L.pz;
  const d = Math.hypot(dx, dy, dz);
  const inv = d > 1e-4 ? 1 / d : 0;
  const ux = dx * inv;
  const uy = dy * inv;
  const uz = dz * inv;
  const side = ux * L.rx + uy * L.ry + uz * L.rz;
  const front = ux * L.fx + uy * L.fy + uz * L.fz;
  out.d = d;
  out.ux = ux;
  out.uy = uy;
  out.uz = uz;
  out.pan = clamp(side * 0.88 * smoothstep(0.3, 2.5, d), -0.95, 0.95);
  out.front = front;
  // Sounds from behind lose a little treble (head shadow), a cheap front/back cue.
  out.cutoff = airCutoff(d) * (front < 0 ? 1 + 0.4 * front : 1);
  return out;
}

// Pan narrowing for a source of physical extent `size` seen from distance d.
export function panSpread(size, d) {
  return size > 0 ? clamp(1 - size / (2 * Math.max(d, 1)), 0.25, 1) : 1;
}

// Frequency ratio heard by the listener for a source moving with velocity v.
export function dopplerRatio(L, s, ux, uy, uz) {
  const vl = L.vx * ux + L.vy * uy + L.vz * uz;
  const vs = (s ? s.x || 0 : 0) * ux + (s ? s.y || 0 : 0) * uy + (s ? s.z || 0 : 0) * uz;
  const ratio = (SPEED_OF_SOUND + vl) / Math.max(1, SPEED_OF_SOUND + vs);
  return clamp(ratio, 0.5, 2);
}

// Where a constant-velocity source was when the sound now reaching the listener
// left it (so a jet is heard behind where it is seen). Writes into out {x, y, z, tau}.
export function retardedPosition(L, p, v, out) {
  const dx = p.x - L.px;
  const dy = p.y - L.py;
  const dz = p.z - L.pz;
  if (!v) {
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    out.tau = Math.hypot(dx, dy, dz) / SPEED_OF_SOUND;
    return out;
  }
  let vx = v.x || 0;
  let vy = v.y || 0;
  let vz = v.z || 0;
  const sp = Math.hypot(vx, vy, vz);
  const maxV = SPEED_OF_SOUND * 0.9;
  if (sp > maxV) {
    vx *= maxV / sp;
    vy *= maxV / sp;
    vz *= maxV / sp;
  }
  const dv = dx * vx + dy * vy + dz * vz;
  const dd = dx * dx + dy * dy + dz * dz;
  const a = vx * vx + vy * vy + vz * vz - SPEED_OF_SOUND * SPEED_OF_SOUND;
  let tau = (dv - Math.sqrt(dv * dv - a * dd)) / a;
  tau = clamp(tau, 0, MAX_DELAY);
  out.x = p.x - (v.x || 0) * tau;
  out.y = p.y - (v.y || 0) * tau;
  out.z = p.z - (v.z || 0) * tau;
  out.tau = tau;
  return out;
}
