/**
 * Moving bodies through a portal pair. The player crosses when the eye crosses the entry plane
 * (so the camera never sees the inside of the wall); position, previous position (for render
 * interpolation), velocity and view orientation all go through the same rigid transform, so the
 * view on the other side is exactly the image that was showing in the portal. Any view roll
 * (floor ↔ wall pairs) is returned for the camera to straighten out smoothly, and the body is
 * slid inside the exit opening if its box would otherwise poke into the surrounding wall.
 */
import * as THREE from 'three';
import { PORTAL_HH, PORTAL_HW, portalTransform, type PortalFrame } from './portalMath';

export interface TransitBody {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  prevYaw: number;
  prevPitch: number;
  width: number;
  height: number;
  onGround: boolean;
  fallDistance: number;
  airDragScale: number;
  updateBox(): void;
}

export interface TransitResult {
  /** Entry → exit world transform. */
  m: THREE.Matrix4;
  /** Its rotation. */
  q: THREE.Quaternion;
  /** View roll after the transit (radians). */
  roll: number;
  /** In-plane correction applied after the transform (world). */
  shift: THREE.Vector3;
}

const PITCH_LIMIT = Math.PI / 2 - 0.001;
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Minimum speed out of the exit: pop up out of floors, step clear of walls. */
export function exitSpeed(exit: PortalFrame): number {
  if (exit.n.y > 0.7) return 10.5;
  if (exit.n.y < -0.7) return 0.5;
  return 2.0;
}

/**
 * Teleport a body whose eye (at `eyeH` above its feet) crossed `entry`. `roll` is the current
 * camera roll (carried through so chained transits compose correctly).
 */
export function transitBody(b: TransitBody, eyeH: number, entry: PortalFrame, exit: PortalFrame, roll = 0): TransitResult {
  const m = portalTransform(entry, exit);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  // position + previous position (the eye goes through exactly)
  _v.set(b.pos.x, b.pos.y + eyeH, b.pos.z).applyMatrix4(m);
  b.pos.set(_v.x, _v.y - eyeH, _v.z);
  _v.set(b.prevPos.x, b.prevPos.y + eyeH, b.prevPos.z).applyMatrix4(m);
  b.prevPos.set(_v.x, _v.y - eyeH, _v.z);
  // momentum
  b.vel.applyQuaternion(q);
  const vn = b.vel.dot(exit.n);
  const minOut = exitSpeed(exit);
  if (vn < minOut) b.vel.addScaledVector(exit.n, minOut - vn);
  if (exit.n.y > 0.7) {
    // out of a floor: drift clear of the opening so you don't drop straight back in
    const along = b.vel.dot(exit.up);
    if (Math.abs(along) < 2.6) b.vel.addScaledVector(exit.up, 2.6 - along);
  }
  // view orientation
  _q.setFromEuler(_e.set(b.pitch, b.yaw, roll, 'YXZ'));
  _q.premultiply(q);
  _e.setFromQuaternion(_q, 'YXZ');
  b.yaw = _e.y;
  b.pitch = THREE.MathUtils.clamp(_e.x, -PITCH_LIMIT, PITCH_LIMIT);
  b.prevYaw = b.yaw;
  b.prevPitch = b.pitch;
  const newRoll = _e.z;
  // keep the box inside the exit opening (it is about to come out of the wall)
  const shift = new THREE.Vector3();
  const hw = b.width / 2 + 0.002;
  const cx = b.pos.x, cy = b.pos.y + b.height / 2, cz = b.pos.z;
  _s.set(cx - exit.c.x, cy - exit.c.y, cz - exit.c.z);
  const clampAxis = (axis: THREE.Vector3, half: number, extent: number) => {
    const d = _s.dot(axis);
    const lim = Math.max(0, half - extent);
    if (d > lim) shift.addScaledVector(axis, lim - d);
    else if (d < -lim) shift.addScaledVector(axis, -lim - d);
  };
  if (Math.abs(exit.n.y) < 0.5) {
    clampAxis(exit.right, PORTAL_HW, hw);
    clampAxis(exit.up, PORTAL_HH, b.height / 2 + 0.002);
  } else {
    clampAxis(exit.right, PORTAL_HW, hw);
    clampAxis(exit.up, PORTAL_HH, hw);
  }
  b.pos.add(shift);
  b.prevPos.add(shift);
  // flings keep their momentum until landing
  if (b.vel.length() > 6) b.airDragScale = 0.06;
  b.onGround = false;
  b.fallDistance = 0;
  b.updateBox();
  return { m, q, roll: newRoll, shift };
}

/** Teleport a passive entity whose centre crossed `entry` (items, mobs). */
export function transitEntity(e: TransitBody & { bodyYaw?: number; prevBodyYaw?: number }, entry: PortalFrame, exit: PortalFrame): THREE.Matrix4 {
  const h = e.height / 2;
  const m = portalTransform(entry, exit);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  _v.set(e.pos.x, e.pos.y + h, e.pos.z).applyMatrix4(m);
  e.pos.set(_v.x, _v.y - h, _v.z);
  _v.set(e.prevPos.x, e.prevPos.y + h, e.prevPos.z).applyMatrix4(m);
  e.prevPos.set(_v.x, _v.y - h, _v.z);
  e.vel.applyQuaternion(q);
  const vn = e.vel.dot(exit.n);
  const minOut = exitSpeed(exit) * 0.6;
  if (vn < minOut) e.vel.addScaledVector(exit.n, minOut - vn);
  // yaw follows the horizontal heading through the portal
  const look = _s.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)).applyQuaternion(q);
  if (Math.hypot(look.x, look.z) > 0.2) {
    const ny = Math.atan2(-look.x, -look.z);
    const dy = ny - e.yaw;
    e.yaw = ny;
    e.prevYaw = ny;
    if (e.bodyYaw !== undefined) {
      e.bodyYaw += dy;
      e.prevBodyYaw = e.bodyYaw;
    }
  }
  if (e.vel.length() > 6) e.airDragScale = 0.06;
  e.fallDistance = 0;
  e.onGround = false;
  e.updateBox();
  return m;
}
