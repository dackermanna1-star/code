import { Vec3, Quat } from './math.js';
import { positionalCorrection, angularCorrection } from './body.js';

export const DRIVE_OFF = 0;
export const DRIVE_RELATIVE = 1; // target = child orientation relative to parent (q_p^-1 q_c)
export const DRIVE_WORLD = 2; // target = child world orientation (reaction torque goes to parent)
export const DRIVE_PARENT_WORLD = 3; // target = parent world orientation (reaction goes to child)

const _qa = new Quat();
const _qb = new Quat();
const _qj = new Quat();
const _qj2 = new Quat();
const _qd = new Quat();
const _qt = new Quat();
const _qs = new Quat();
const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();
const _v3 = new Vec3();
const _n = new Vec3();
const _pa = new Vec3();
const _pc = new Vec3();
const _ra = new Vec3();
const _rc = new Vec3();

// Swing/twist decomposition result (twist about the joint frame's local Y axis).
const _dec = { twist: 0, sx: 0, sz: 0 };

/**
 * Decompose joint rotation q (in the joint frame) into a twist about local Y and a swing rotation
 * vector in the XZ plane. With `childFrame` the swing is expressed after the twist (q = T * S),
 * otherwise before it (q = S * T).
 */
export function decomposeSwingTwist(q, childFrame, out = _dec) {
  let w = q.w, x = q.x, y = q.y, z = q.z;
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const tn = Math.sqrt(w * w + y * y);
  let tw = 1, ty = 0;
  if (tn > 1e-9) {
    tw = w / tn;
    ty = y / tn;
  }
  out.twist = 2 * Math.atan2(ty, tw);
  let sx, sz;
  if (childFrame) {
    sx = tw * x - ty * z;
    sz = tw * z + ty * x;
  } else {
    sx = x * tw + z * ty;
    sz = z * tw - x * ty;
  }
  const sw = tn;
  const sn = Math.sqrt(sx * sx + sz * sz);
  if (sn < 1e-9) {
    out.sx = 2 * sx;
    out.sz = 2 * sz;
  } else {
    const ang = 2 * Math.atan2(sn, sw);
    out.sx = (sx / sn) * ang;
    out.sz = (sz / sn) * ang;
  }
  return out;
}

export function composeSwingTwist(twist, sx, sz, childFrame, out) {
  _qt.set(0, Math.sin(twist * 0.5), 0, Math.cos(twist * 0.5));
  _v3.set(sx, 0, sz);
  _qs.setFromRotVec(_v3);
  if (childFrame) out.multiplyQuats(_qt, _qs);
  else out.multiplyQuats(_qs, _qt);
  return out;
}

/**
 * Articulated joint: ball-socket anchor + optional swing/twist limits + a muscle drive.
 * The drive is an implicit XPBD spring toward a target orientation with a torque cap (muscle
 * strength) and velocity-level damping, so arbitrarily stiff muscles stay unconditionally stable.
 */
export class Joint {
  constructor(parent, child, opts = {}) {
    this.name = opts.name ?? 'joint';
    this.parent = parent;
    this.child = child;
    this.anchorP = new Vec3().copy(opts.anchorP ?? new Vec3());
    this.anchorC = new Vec3().copy(opts.anchorC ?? new Vec3());
    this.frameP = new Quat().copy(opts.frameP ?? new Quat());
    this.frameC = new Quat().copy(opts.frameC ?? new Quat());
    this.swingInChildFrame = opts.swingInChildFrame ?? false;
    // limits: { twist:[min,max], swingX:[min,max], swingZ:[min,max], mode:'ellipse'|'box' }
    this.limits = opts.limits ?? null;
    this.limitCompliance = opts.limitCompliance ?? 0;
    this.posCompliance = opts.posCompliance ?? 0;
    this.enabled = true;

    // Muscle drive.
    this.driveMode = DRIVE_OFF;
    this.target = new Quat();
    this.targetAngVel = new Vec3(); // world-frame relative angular velocity target
    this.stiffness = 0; // N*m/rad
    this.damping = 0; // N*m*s/rad
    this.maxTorque = Infinity; // N*m
    this.worldDamping = false; // damp child's absolute angular velocity instead of relative

    // Per-frame statistics.
    this.limitImpulse = 0; // N*m*s
    this.driveImpulse = 0;
    this.anchorImpulse = 0; // N*s
    this.userData = opts.userData ?? {};
  }

  setDrive(mode, target, stiffness, damping, maxTorque = Infinity) {
    this.driveMode = mode;
    if (target) this.target.copy(target);
    this.stiffness = stiffness;
    this.damping = damping;
    this.maxTorque = maxTorque;
  }

  // Current relative rotation q_p^-1 q_c (body frames).
  relativeRotation(out) {
    return out.multiplyConjA(this.parent.rot, this.child.rot);
  }

  // Current joint-frame rotation.
  jointRotation(out) {
    _qa.multiplyQuats(this.parent.rot, this.frameP);
    _qb.multiplyQuats(this.child.rot, this.frameC);
    return out.multiplyConjA(_qa, _qb);
  }

  worldAnchor(out) {
    return this.parent.localToWorld(this.anchorP, out);
  }

  resetStats() {
    this.limitImpulse = 0;
    this.driveImpulse = 0;
    this.anchorImpulse = 0;
  }

  solvePosition(h) {
    if (!this.enabled) return;
    if (this.driveMode !== DRIVE_OFF && this.stiffness > 0) this.solveDrive(h);
    if (this.limits) this.solveLimits(h);
    this.solveAnchor(h);
  }

  solveAnchor(h) {
    const P = this.parent, C = this.child;
    _ra.copy(this.anchorP).applyQuat(P.rot);
    _rc.copy(this.anchorC).applyQuat(C.rot);
    _pa.copy(_ra).add(P.pos);
    _pc.copy(_rc).add(C.pos);
    _n.subVectors(_pa, _pc);
    const d = _n.length();
    if (d < 1e-10) return;
    _n.scale(1 / d);
    // move child toward parent anchor (+n), parent along -n
    const dl = positionalCorrection(C, P, _n, d, _rc, _ra, this.posCompliance, h);
    this.anchorImpulse += Math.abs(dl) / h;
  }

  solveDrive(h) {
    const P = this.parent, C = this.child;
    if (this.driveMode === DRIVE_PARENT_WORLD) {
      // stance-hip style: rotate the parent toward its world target, pushing against the child
      _qj.multiplyConjB(this.target, P.rot);
      _qj.toRotVec(_v0);
      const a = _v0.length();
      if (a < 1e-8) return;
      _v0.scale(1 / a);
      const dlp = angularCorrection(P, C, _v0, a, 1 / this.stiffness, h, this.maxTorque * h * h);
      this.driveImpulse += Math.abs(dlp) / h;
      return;
    }
    if (this.driveMode === DRIVE_RELATIVE) _qd.multiplyQuats(P.rot, this.target);
    else _qd.copy(this.target);
    _qj.multiplyConjB(_qd, C.rot); // rotation taking current child orientation to desired
    _qj.toRotVec(_v0);
    const angle = _v0.length();
    if (angle < 1e-8) return;
    _v0.scale(1 / angle);
    const dl = angularCorrection(C, P, _v0, angle, 1 / this.stiffness, h, this.maxTorque * h * h);
    this.driveImpulse += Math.abs(dl) / h;
  }

  solveLimits(h) {
    const P = this.parent, C = this.child, L = this.limits;
    _qa.multiplyQuats(P.rot, this.frameP);
    _qb.multiplyQuats(C.rot, this.frameC);
    _qj.multiplyConjA(_qa, _qb);
    if (_qj.w < 0) {
      _qj.x = -_qj.x;
      _qj.y = -_qj.y;
      _qj.z = -_qj.z;
      _qj.w = -_qj.w;
    }
    const dec = decomposeSwingTwist(_qj, this.swingInChildFrame, _dec);
    let tw = dec.twist, sx = dec.sx, sz = dec.sz;
    let changed = false;
    if (L.twist) {
      if (tw < L.twist[0]) {
        tw = L.twist[0];
        changed = true;
      } else if (tw > L.twist[1]) {
        tw = L.twist[1];
        changed = true;
      }
    }
    if (L.swingX && L.swingZ) {
      if (L.mode === 'box') {
        if (sx < L.swingX[0]) {
          sx = L.swingX[0];
          changed = true;
        } else if (sx > L.swingX[1]) {
          sx = L.swingX[1];
          changed = true;
        }
        if (sz < L.swingZ[0]) {
          sz = L.swingZ[0];
          changed = true;
        } else if (sz > L.swingZ[1]) {
          sz = L.swingZ[1];
          changed = true;
        }
      } else {
        const axm = sx >= 0 ? L.swingX[1] : -L.swingX[0];
        const azm = sz >= 0 ? L.swingZ[1] : -L.swingZ[0];
        const ex = sx / Math.max(axm, 1e-4), ez = sz / Math.max(azm, 1e-4);
        const e2 = ex * ex + ez * ez;
        if (e2 > 1) {
          const s = 1 / Math.sqrt(e2);
          sx *= s;
          sz *= s;
          changed = true;
        }
      }
    }
    if (!changed) return;
    composeSwingTwist(tw, sx, sz, this.swingInChildFrame, _qj2);
    // correction in joint frame: dq = qj' * qj^-1, expressed in world via qa
    _qd.multiplyConjB(_qj2, _qj);
    _qd.toRotVec(_v0);
    _v0.applyQuat(_qa);
    const angle = _v0.length();
    if (angle < 1e-9) return;
    _v0.scale(1 / angle);
    const dl = angularCorrection(C, P, _v0, angle, this.limitCompliance, h);
    this.limitImpulse += Math.abs(dl) / h;
  }

  solveVelocity(h) {
    if (!this.enabled || this.damping <= 0) return;
    const P = this.parent, C = this.child;
    if (this.driveMode === DRIVE_PARENT_WORLD) _v0.copy(P.angVel).negate();
    else if (this.worldDamping) _v0.copy(C.angVel);
    else _v0.subVectors(C.angVel, P.angVel);
    _v0.sub(this.targetAngVel);
    const mag = _v0.length();
    if (mag < 1e-9) return;
    _v0.scale(1 / mag);
    const w = C.inverseMassAngular(_v0) + P.inverseMassAngular(_v0);
    if (w < 1e-12) return;
    const dh = this.damping * h;
    let J = (mag * dh) / (1 + dh * w);
    const maxJ = this.maxTorque * h;
    if (J > maxJ) J = maxJ;
    _v1.copy(_v0).scale(-J);
    C.invInertiaMul(_v1, _v2);
    C.angVel.add(_v2);
    _v1.scale(-1);
    P.invInertiaMul(_v1, _v2);
    P.angVel.add(_v2);
  }
}

/**
 * Soft point-to-target constraint (mouse grab / hand-of-god). Behaves like a critically damped spring
 * with a force cap so a dragged ragdoll part never explodes the simulation.
 */
export class PointConstraint {
  constructor(body, localPoint, target, opts = {}) {
    this.body = body;
    this.localPoint = new Vec3().copy(localPoint);
    this.target = new Vec3().copy(target);
    this.compliance = opts.compliance ?? 1e-4;
    this.maxForce = opts.maxForce ?? 2000;
    this.damping = opts.damping ?? 8; // 1/s
    this.enabled = true;
  }

  solvePosition(h) {
    if (!this.enabled) return;
    const B = this.body;
    _ra.copy(this.localPoint).applyQuat(B.rot);
    _pa.copy(_ra).add(B.pos);
    _n.subVectors(this.target, _pa);
    const d = _n.length();
    if (d < 1e-9) return;
    _n.scale(1 / d);
    positionalCorrection(B, null, _n, d, _ra, null, this.compliance, h, this.maxForce * h * h);
  }

  solveVelocity(h) {
    if (!this.enabled || this.damping <= 0) return;
    const B = this.body;
    _ra.copy(this.localPoint).applyQuat(B.rot);
    _pa.copy(_ra).add(B.pos);
    B.velocityAt(_pa, _v0);
    const speed = _v0.length();
    if (speed < 1e-6) return;
    _n.copy(_v0).scale(1 / speed);
    const w = B.inverseMassAt(_ra, _n);
    const k = Math.min(1, this.damping * h);
    const J = (speed * k) / w;
    _v1.copy(_n).scale(-Math.min(J, this.maxForce * h));
    B.applyImpulse(_v1, _pa);
  }
}

/**
 * Two-body "muscle" spring: keeps the world-space offset between a point on body A and a point on
 * body B near `offset`. Equal and opposite impulses keep it momentum-conserving (an internal force,
 * like a limb's muscles pulling a foot relative to the pelvis). Implicit (XPBD) and force-capped.
 */
export class RelativePointSpring {
  constructor(A, localA, B, localB, opts = {}) {
    this.A = A;
    this.B = B;
    this.localA = new Vec3().copy(localA);
    this.localB = new Vec3().copy(localB);
    this.offset = new Vec3();
    this.compliance = opts.compliance ?? 1 / 4000;
    this.maxForce = opts.maxForce ?? 600;
    this.damping = opts.damping ?? 0;
    this.enabled = false;
    this.body = A; // for world.removeBody filtering
  }

  solvePosition(h) {
    if (!this.enabled) return;
    const A = this.A, B = this.B;
    _ra.copy(this.localA).applyQuat(A.rot);
    _rc.copy(this.localB).applyQuat(B.rot);
    _pa.copy(_ra).add(A.pos);
    _pc.copy(_rc).add(B.pos);
    // error = (pA - pB) - offset ; move A along -error
    _n.subVectors(_pa, _pc).sub(this.offset);
    const d = _n.length();
    if (d < 1e-9) return;
    _n.scale(-1 / d);
    positionalCorrection(A, B, _n, d, _ra, _rc, this.compliance, h, this.maxForce * h * h);
  }

  solveVelocity(h) {
    if (!this.enabled || this.damping <= 0) return;
    const A = this.A, B = this.B;
    _ra.copy(this.localA).applyQuat(A.rot);
    _rc.copy(this.localB).applyQuat(B.rot);
    _pa.copy(_ra).add(A.pos);
    _pc.copy(_rc).add(B.pos);
    A.velocityAt(_pa, _v0);
    B.velocityAt(_pc, _v1);
    _v0.sub(_v1);
    const sp = _v0.length();
    if (sp < 1e-6) return;
    _n.copy(_v0).scale(1 / sp);
    const w = A.inverseMassAt(_ra, _n) + B.inverseMassAt(_rc, _n);
    if (w < 1e-12) return;
    const k = Math.min(1, this.damping * h);
    const J = Math.min((sp * k) / w, this.maxForce * h);
    _v2.copy(_n).scale(-J);
    A.applyImpulse(_v2, _pa);
    _v2.negate();
    B.applyImpulse(_v2, _pc);
  }
}
