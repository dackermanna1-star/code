import { Vec3, Quat, mat3Invert, mat3RotateDiag } from './math.js';

let bodyIdCounter = 1;

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();
const _q0 = new Quat();
const _m0 = new Float64Array(9);

/**
 * Rigid body for the XPBD solver. The body origin is always its centre of mass. Inertia is stored as
 * a full symmetric 3x3 tensor in the body frame so segment frames can stay aligned with the anatomy.
 */
export class Body {
  constructor(opts = {}) {
    this.id = bodyIdCounter++;
    this.name = opts.name ?? `body${this.id}`;
    this.pos = new Vec3();
    this.rot = new Quat();
    this.vel = new Vec3();
    this.angVel = new Vec3();
    this.prevPos = new Vec3();
    this.prevRot = new Quat();
    // Snapshot of the previous *frame* for render interpolation.
    this.framePos = new Vec3();
    this.frameRot = new Quat();

    this.mass = 0;
    this.invMass = 0;
    this.inertiaLocal = new Float64Array(9);
    this.invInertiaLocal = new Float64Array(9);
    this.isStatic = opts.isStatic ?? false;

    this.shapes = [];
    this.linearDamping = opts.linearDamping ?? 0.02;
    this.angularDamping = opts.angularDamping ?? 0.05;
    this.gravityScale = opts.gravityScale ?? 1;
    this.maxLinearSpeed = 250;
    this.maxAngularSpeed = 90;

    // External force / torque, world frame. Applied every substep, cleared after each frame step.
    this.force = new Vec3();
    this.torque = new Vec3();

    // Collision filtering.
    this.collisionGroup = opts.collisionGroup ?? 1;
    this.collisionMask = opts.collisionMask ?? 0xffff;
    this.ignore = null; // Set<Body> of bodies this one never collides with

    // Per-frame contact statistics (filled by the world).
    this.contactImpulse = new Vec3(); // summed normal impulse acting on this body (N*s)
    this.groundImpulse = 0; // normal impulse from the floor
    this.contactCount = 0;
    this.groundContact = false;
    this.groundContactPoints = []; // world points of floor contacts (pooled vectors)
    this.groundContactUsed = 0;

    this.sleeping = false;
    this.sleepTimer = 0;
    this.world = null;
    this.aabbMin = new Vec3();
    this.aabbMax = new Vec3();
    this.userData = opts.userData ?? {};
  }

  addShape(shape) {
    shape.body = this;
    this.shapes.push(shape);
    return shape;
  }

  /**
   * Distribute `mass` over the shapes by volume, move the body origin to the resulting centre of
   * mass (shifting shape offsets) and build the inertia tensor. Returns the local COM offset that
   * was removed so callers can keep world placement consistent.
   */
  setMassFromShapes(mass, opts = {}) {
    const recenter = opts.recenter ?? true;
    const shapes = this.shapes.filter((s) => !s.massless);
    let totalVol = 0;
    for (const s of shapes) totalVol += s.volume() * (s.densityScale ?? 1);
    const com = new Vec3();
    for (const s of shapes) com.addScaled(s.localPos, (s.volume() * (s.densityScale ?? 1)) / totalVol);
    if (opts.com) com.copy(opts.com);
    if (recenter) {
      for (const s of this.shapes) s.localPos.sub(com);
    }
    const I = new Float64Array(9);
    const pi = new Vec3();
    for (const s of shapes) {
      const m = (mass * s.volume() * (s.densityScale ?? 1)) / totalVol;
      s.principalInertia(m, pi);
      mat3RotateDiag(s.localRot, pi.x, pi.y, pi.z, _m0);
      const d = recenter ? s.localPos : _v0.subVectors(s.localPos, com);
      const d2 = d.lengthSq();
      I[0] += _m0[0] + m * (d2 - d.x * d.x);
      I[1] += _m0[1] - m * d.x * d.y;
      I[2] += _m0[2] - m * d.x * d.z;
      I[3] += _m0[3] - m * d.y * d.x;
      I[4] += _m0[4] + m * (d2 - d.y * d.y);
      I[5] += _m0[5] - m * d.y * d.z;
      I[6] += _m0[6] - m * d.z * d.x;
      I[7] += _m0[7] - m * d.z * d.y;
      I[8] += _m0[8] + m * (d2 - d.z * d.z);
    }
    if (opts.inertiaScale) {
      for (let i = 0; i < 9; i++) I[i] *= opts.inertiaScale;
    }
    this.setMassProperties(mass, I);
    return com;
  }

  setMassProperties(mass, inertia) {
    this.mass = mass;
    this.invMass = this.isStatic || mass <= 0 ? 0 : 1 / mass;
    this.inertiaLocal.set(inertia);
    if (this.isStatic || mass <= 0) {
      this.invInertiaLocal.fill(0);
    } else {
      mat3Invert(inertia, this.invInertiaLocal);
    }
  }

  makeStatic() {
    this.isStatic = true;
    this.invMass = 0;
    this.invInertiaLocal.fill(0);
    this.vel.setZero();
    this.angVel.setZero();
  }

  // out = I_world^-1 * v
  invInertiaMul(v, out) {
    const m = this.invInertiaLocal;
    out.copy(v).applyQuatInv(this.rot);
    const x = out.x, y = out.y, z = out.z;
    out.x = m[0] * x + m[1] * y + m[2] * z;
    out.y = m[3] * x + m[4] * y + m[5] * z;
    out.z = m[6] * x + m[7] * y + m[8] * z;
    return out.applyQuat(this.rot);
  }

  // out = I_world * v
  inertiaMul(v, out) {
    const m = this.inertiaLocal;
    out.copy(v).applyQuatInv(this.rot);
    const x = out.x, y = out.y, z = out.z;
    out.x = m[0] * x + m[1] * y + m[2] * z;
    out.y = m[3] * x + m[4] * y + m[5] * z;
    out.z = m[6] * x + m[7] * y + m[8] * z;
    return out.applyQuat(this.rot);
  }

  // Generalised inverse mass for a positional correction along unit n at world offset r (from COM).
  inverseMassAt(r, n) {
    if (this.invMass === 0) return 0;
    _v1.crossVectors(r, n);
    this.invInertiaMul(_v1, _v2);
    return this.invMass + _v1.dot(_v2);
  }

  // Generalised inverse mass for a rotation about unit axis n.
  inverseMassAngular(n) {
    if (this.invMass === 0) return 0;
    this.invInertiaMul(n, _v2);
    return n.dot(_v2);
  }

  // XPBD positional update for a "positional impulse" p applied at world offset r.
  applyPositionalImpulse(p, r, sign) {
    if (this.invMass === 0) return;
    this.pos.addScaled(p, sign * this.invMass);
    _v1.crossVectors(r, p);
    this.invInertiaMul(_v1, _v2);
    _v2.scale(sign);
    this.rot.integrate(_v2, 1);
  }

  // XPBD rotational update for an angular positional impulse (axis * magnitude).
  applyAngularPositionalImpulse(t, sign) {
    if (this.invMass === 0) return;
    this.invInertiaMul(t, _v2);
    _v2.scale(sign);
    this.rot.integrate(_v2, 1);
  }

  // Velocity-level impulse J at world point.
  applyImpulse(J, worldPoint) {
    if (this.invMass === 0) return;
    this.vel.addScaled(J, this.invMass);
    _v0.subVectors(worldPoint, this.pos);
    _v1.crossVectors(_v0, J);
    this.invInertiaMul(_v1, _v2);
    this.angVel.add(_v2);
    this.wake();
  }

  applyAngularImpulse(L) {
    if (this.invMass === 0) return;
    this.invInertiaMul(L, _v2);
    this.angVel.add(_v2);
    this.wake();
  }

  // Force at a world point, accumulated for the next step.
  applyForceAt(F, worldPoint) {
    this.force.add(F);
    _v0.subVectors(worldPoint, this.pos);
    _v1.crossVectors(_v0, F);
    this.torque.add(_v1);
  }

  velocityAt(worldPoint, out) {
    _v0.subVectors(worldPoint, this.pos);
    out.crossVectors(this.angVel, _v0);
    return out.add(this.vel);
  }

  localToWorld(local, out) {
    return out.copy(local).applyQuat(this.rot).add(this.pos);
  }

  worldToLocal(world, out) {
    return out.subVectors(world, this.pos).applyQuatInv(this.rot);
  }

  localDirToWorld(local, out) {
    return out.copy(local).applyQuat(this.rot);
  }

  worldDirToLocal(world, out) {
    return out.copy(world).applyQuatInv(this.rot);
  }

  setPose(pos, rot) {
    this.pos.copy(pos);
    this.rot.copy(rot).normalize();
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
    this.framePos.copy(this.pos);
    this.frameRot.copy(this.rot);
  }

  wake() {
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  kineticEnergy() {
    if (this.invMass === 0) return 0;
    this.inertiaMul(this.angVel, _v0);
    return 0.5 * this.mass * this.vel.lengthSq() + 0.5 * this.angVel.dot(_v0);
  }

  computeAABB(dt, margin) {
    const min = this.aabbMin, max = this.aabbMax;
    min.set(Infinity, Infinity, Infinity);
    max.set(-Infinity, -Infinity, -Infinity);
    for (const s of this.shapes) {
      if (!s.collides) continue;
      s.updateWorld(this.pos, this.rot);
      min.x = Math.min(min.x, s.aabbMin.x);
      min.y = Math.min(min.y, s.aabbMin.y);
      min.z = Math.min(min.z, s.aabbMin.z);
      max.x = Math.max(max.x, s.aabbMax.x);
      max.y = Math.max(max.y, s.aabbMax.y);
      max.z = Math.max(max.z, s.aabbMax.z);
    }
    let ext = margin;
    if (dt > 0 && !this.isStatic) {
      let br = 0;
      for (const s of this.shapes) br = Math.max(br, s.localPos.length() + s.boundingRadius());
      ext += (this.vel.length() + this.angVel.length() * br) * dt;
    }
    min.x -= ext;
    min.y -= ext;
    min.z -= ext;
    max.x += ext;
    max.y += ext;
    max.z += ext;
  }
}

/**
 * XPBD positional correction between two bodies. Moves the point of A at world offset rA along +n
 * and the point of B at offset rB along -n so that the gap C shrinks to zero (or springs toward it).
 * Either body may be null (static world). Returns the Lagrange multiplier increment.
 */
export function positionalCorrection(A, B, n, C, rA, rB, compliance, h, maxLambda = Infinity) {
  const wA = A ? A.inverseMassAt(rA, n) : 0;
  const wB = B ? B.inverseMassAt(rB, n) : 0;
  const alpha = compliance / (h * h);
  const w = wA + wB + alpha;
  if (w < 1e-12) return 0;
  let dl = C / w;
  if (dl > maxLambda) dl = maxLambda;
  else if (dl < -maxLambda) dl = -maxLambda;
  _pc.copy(n).scale(dl);
  if (A) A.applyPositionalImpulse(_pc, rA, 1);
  if (B) B.applyPositionalImpulse(_pc, rB, -1);
  return dl;
}
const _pc = new Vec3();

/**
 * XPBD angular correction: rotate A by +angle and B by -angle (inertia weighted) about unit axis.
 * Returns the applied Lagrange multiplier (angular positional impulse).
 */
export function angularCorrection(A, B, axis, angle, compliance, h, maxLambda = Infinity) {
  const wA = A ? A.inverseMassAngular(axis) : 0;
  const wB = B ? B.inverseMassAngular(axis) : 0;
  const alpha = compliance / (h * h);
  const w = wA + wB + alpha;
  if (w < 1e-12) return 0;
  let dl = angle / w;
  if (dl > maxLambda) dl = maxLambda;
  else if (dl < -maxLambda) dl = -maxLambda;
  _ac.copy(axis).scale(dl);
  if (A) A.applyAngularPositionalImpulse(_ac, 1);
  if (B) B.applyAngularPositionalImpulse(_ac, -1);
  return dl;
}
const _ac = new Vec3();

export { _q0 as _scratchQuat };
