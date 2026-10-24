// The traps. Each one belongs to a hall of the course and has a scarab
// button on the Pharaoh's gallery above it. It can be fired once a round:
// it runs for `duration` seconds (its run(k) animates it, k = seconds since
// it fired), kills whoever its lethal(p) says is in harm's way, and then
// stays spent (some leave the way changed: a bridge that fell grows back,
// a boulder sinks into the sand). Round start puts everything back.
//
//   new Trap(C, { id, name, sec, duration, zone: {x0, x1, z0, z1} (local), button: [x, z] (local, on the gallery),
//                 fire(), run(k, dt), lethal(p local, ch) -> cause | null, reset(),
//                 wait: [x, y, z] (where a runner waits for it, local), hide: [[x, y, z]...] (safe spots inside),
//                 when(k) -> true when it's safe to go through while it runs })
import * as THREE from 'three';
import { V, clamp } from './kit.js';

export const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
export const easeIn = (k) => k * k;
export const easeOut = (k) => 1 - (1 - k) * (1 - k);
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** Is local point p (character root: feet 3 below) inside box b {x0,x1,y0,y1,z0,z1}, with a margin? */
export function inBox(p, b, m = 0.9) {
  const feet = p.y - 3, head = p.y + 2;
  return p.x > b.x0 - m && p.x < b.x1 + m && p.z > b.z0 - m && p.z < b.z1 + m && head > (b.y0 ?? -1e9) && feet < (b.y1 ?? 1e9);
}
/** Is local p within r of the vertical segment at (x, z) from y0 to y1 (a column of fire)? */
export function inColumn(p, x, z, r, y0 = -1e9, y1 = 1e9) {
  const feet = p.y - 3, head = p.y + 2;
  return Math.hypot(p.x - x, p.z - z) < r && head > y0 && feet < y1;
}
/** Distance from local p to segment a-b (Vector3s), measured from the character's body (feet to head). */
export function distToSeg(p, a, b) {
  let best = Infinity;
  const ab = _ab.subVectors(b, a), L2 = ab.lengthSq() || 1;
  for (const dy of [-2.2, 0, 1.8]) {
    _q.set(p.x, p.y + dy, p.z);
    const t = clamp(_ap.subVectors(_q, a).dot(ab) / L2, 0, 1);
    const d = _q.distanceTo(_c.copy(a).addScaledVector(ab, t));
    if (d < best) best = d;
  }
  return best;
}
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3(), _q = new THREE.Vector3(), _c = new THREE.Vector3();
/** Is local p inside an oriented box (centre c, half sizes h, rotation q), with margin m? */
const _inv = new THREE.Quaternion(), _l = new THREE.Vector3();
export function inOBB(p, c, h, q, m = 0.9) {
  _inv.copy(q).invert();
  for (const dy of [-2.2, 0, 1.8]) {
    _l.set(p.x - c.x, p.y + dy - c.y, p.z - c.z).applyQuaternion(_inv);
    if (Math.abs(_l.x) < h.x + m && Math.abs(_l.y) < h.y + m && Math.abs(_l.z) < h.z + m) return true;
  }
  return false;
}

export class Trap {
  constructor(C, o) {
    this.C = C;
    Object.assign(this, o);
    this.sec = C.sec;
    this.O = C.K.o.clone(); // the hall's origin
    this.state = 'ready'; this.t0 = 0; this.k = 0; this.by = null; this.kills = 0;
    this.zoneW = { x0: this.O.x + o.zone.x0, x1: this.O.x + o.zone.x1, z0: this.O.z + o.zone.z0, z1: this.O.z + o.zone.z1 };
    if (o.wait) this.waitW = V(this.O.x + o.wait[0], this.O.y + o.wait[1], this.O.z + o.wait[2]);
    this.hideW = (o.hide || []).map((h) => V(this.O.x + h[0], this.O.y + h[1], this.O.z + h[2]));
    C.traps.push(this);
    this.index = C.traps.length - 1;
  }
  get used() { return this.state !== 'ready'; }
  get firing() { return this.state === 'firing'; }
  local(p, out = _lp) { return out.set(p.x - this.O.x, p.y - this.O.y, p.z - this.O.z); }
  /** Is world point p (a character's root) in this trap's stretch of the course? */
  inZone(p, m = 0) { const z = this.zoneW; return p.x > z.x0 - m && p.x < z.x1 + m && p.z > z.z0 - m && p.z < z.z1 + m && Math.abs(p.y - 3 - this.O.y - (this.zoneY ?? 0)) < (this.zoneH ?? 30); }
  fire(by) {
    if (this.state !== 'ready') return false;
    this.state = 'firing'; this.t0 = this.C.time(); this.k = 0; this.by = by; this.fx = {};
    this.button?.arm(false);
    this.onFire?.();
    return true;
  }
  update(t, dt) {
    if (this.state !== 'firing') { this.idle?.(t, dt); return; }
    this.k = t - this.t0;
    this.run?.(Math.min(this.k, this.duration), dt);
    if (this.k >= this.duration) { this.state = 'spent'; this.end?.(); }
  }
  /** Who it kills right now (world root position p): a cause, or null. */
  check(p, ch) {
    if (this.state !== 'firing' && !this.alwaysLethal) return null;
    return this.lethal ? this.lethal(this.local(p), ch, this.k) : null;
  }
  /** Is it dangerous to go through right now? (for the bots) */
  dangerous() {
    if (this.state !== 'firing') return false;
    return this.when ? !this.when(this.k) : true;
  }
  reset() { this.state = 'ready'; this.k = 0; this.by = null; this.kills = 0; this.onReset?.(); this.button?.arm(true); }
}
const _lp = new THREE.Vector3();
/** Do fn once per firing, when the trap's clock k passes t (a slam, a splash, a puff of dust). */
export function at(T, k, t, fn) { const f = T.fx || (T.fx = {}); if (k >= t && !f[t]) { f[t] = 1; fn(); } }
