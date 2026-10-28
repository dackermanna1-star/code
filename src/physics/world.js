import { Vec3, Quat } from './math.js';
import { positionalCorrection, angularCorrection } from './body.js';
import { ContactCollector, collideShapes, collideGround } from './collide.js';
import { rayShape } from './raycast.js';
import { SHAPE_BOX } from './shapes.js';

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();
const _v3 = new Vec3();
const _rA = new Vec3();
const _rB = new Vec3();
const _pA = new Vec3();
const _pB = new Vec3();
const _t = new Vec3();
const _negT = new Vec3();
const _dv = new Vec3();
const _q0 = new Quat();
const _cA = new Vec3();
const _cB = new Vec3();
const _nAvg = new Vec3();

class Contact {
  constructor() {
    this.bodyA = null;
    this.bodyB = null;
    this.shapeA = null;
    this.shapeB = null;
    this.n = new Vec3();
    this.rA = new Vec3(); // local to A
    this.rB = new Vec3(); // local to B, or world point when B is the static ground
    this.lambdaN = 0;
    this.vnPre = 0;
    this.friction = 0.6;
    this.staticFriction = 0.7;
    this.restitution = 0;
    this.compliance = 0;
    this.key = -1; // persistent feature key (ground contacts)
    this.anchor = null; // persistent friction anchor (world point on the ground)
  }
}

class Anchor {
  constructor() {
    this.p = new Vec3();
    this.stamp = 0;
  }
}

/**
 * Impact record aggregated per body pair per frame; drives blunt-trauma injuries, sounds and
 * startle reflexes.
 */
class Impact {
  constructor() {
    this.bodyA = null;
    this.bodyB = null;
    this.shapeA = null;
    this.shapeB = null;
    this.impulse = 0; // N*s accumulated over the frame
    this.speed = 0; // max approach speed (m/s)
    this.point = new Vec3();
    this.normal = new Vec3();
    this.weight = 0;
  }
}

/**
 * XPBD rigid body world (Müller et al. 2020, "Detailed Rigid Body Simulation with Extended Position
 * Based Dynamics"): many substeps with a single constraint iteration each, position-level contact
 * and joint projection, then velocity-level friction, restitution and damping.
 */
export class World {
  constructor(opts = {}) {
    this.gravity = new Vec3(0, opts.gravity ?? -9.81, 0);
    this.substeps = opts.substeps ?? 20;
    this.groundY = 0;
    this.groundHalfSize = opts.groundHalfSize ?? 12;
    this.groundFriction = opts.groundFriction ?? 0.85;
    this.groundRestitution = opts.groundRestitution ?? 0.1;
    this.groundMaterial = 'concrete';
    this.bodies = [];
    this.joints = [];
    this.constraints = []; // generic constraints with solvePosition/solveVelocity
    this.contacts = [];
    this.contactPool = [];
    this.numContacts = 0;
    this.pairs = []; // flat [bodyA, bodyB, ...]
    this.sortList = [];
    this.time = 0;
    this.restitutionThreshold = 0.35;
    this.margin = 0.006;
    this.substepHooks = []; // (h, world) => void, called before integrating each substep
    this.impacts = new Map();
    this.impactPool = [];
    this.impactList = [];
    this.collector = new ContactCollector(this._addContact.bind(this));
    this.collector.margin = this.margin;
    this.stats = { contacts: 0, pairs: 0, stepMs: 0 };
    this.killY = -30;
    this.patchAll = false;
    this.anchors = new Map(); // feature key -> Anchor
    this.anchorStamp = 0;
    this.torsionalFriction = true;
    this.onBodyRemoved = null;
  }

  addBody(b) {
    b.world = this;
    if (!this.bodies.includes(b)) this.bodies.push(b);
    b.framePos.copy(b.pos);
    b.frameRot.copy(b.rot);
    b.prevPos.copy(b.pos);
    b.prevRot.copy(b.rot);
    for (const s of b.shapes) s.updateWorld(b.pos, b.rot);
    return b;
  }

  removeBody(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    this.joints = this.joints.filter((j) => j.parent !== b && j.child !== b);
    this.constraints = this.constraints.filter((c) => c.body !== b);
    b.world = null;
  }

  addJoint(j) {
    this.joints.push(j);
    return j;
  }

  removeJoint(j) {
    const i = this.joints.indexOf(j);
    if (i >= 0) this.joints.splice(i, 1);
  }

  addConstraint(c) {
    this.constraints.push(c);
    return c;
  }

  removeConstraint(c) {
    const i = this.constraints.indexOf(c);
    if (i >= 0) this.constraints.splice(i, 1);
  }

  // ------------------------------------------------------------------------------------------
  step(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const bodies = this.bodies;
    for (const b of bodies) {
      b.framePos.copy(b.pos);
      b.frameRot.copy(b.rot);
      b.contactImpulse.setZero();
      b.groundImpulse = 0;
      b.contactCount = 0;
      b.groundContact = false;
      b.groundContactUsed = 0;
    }
    for (const j of this.joints) j.resetStats();
    this.beginImpacts();
    this.broadphase(dt);
    const h = dt / this.substeps;
    for (let s = 0; s < this.substeps; s++) {
      for (const hook of this.substepHooks) hook(h, this, s);
      this.integrate(h);
      this.generateContacts();
      this.solvePositions(h);
      this.updateVelocities(h);
      this.solveVelocities(h);
    }
    for (const b of bodies) {
      b.force.setZero();
      b.torque.setZero();
    }
    this.finishImpacts();
    this.time += dt;
    // Remove bodies that fell off the arena.
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.pos.y < this.killY && !b.userData.persistent) {
        this.removeBody(b);
        if (this.onBodyRemoved) this.onBodyRemoved(b);
      }
    }
    if (t0) this.stats.stepMs = performance.now() - t0;
  }

  integrate(h) {
    const g = this.gravity;
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      b.prevPos.copy(b.pos);
      b.prevRot.copy(b.rot);
      const gs = b.gravityScale;
      b.vel.x += h * (g.x * gs + b.force.x * b.invMass);
      b.vel.y += h * (g.y * gs + b.force.y * b.invMass);
      b.vel.z += h * (g.z * gs + b.force.z * b.invMass);
      if (b.linearDamping > 0) b.vel.scale(1 / (1 + h * b.linearDamping));
      const sp = b.vel.length();
      if (sp > b.maxLinearSpeed) b.vel.scale(b.maxLinearSpeed / sp);
      b.pos.addScaled(b.vel, h);
      // angular: w += h * I^-1 (tau - w x (I w))
      b.inertiaMul(b.angVel, _v0);
      _v1.crossVectors(b.angVel, _v0);
      _v2.subVectors(b.torque, _v1);
      b.invInertiaMul(_v2, _v3);
      b.angVel.addScaled(_v3, h);
      if (b.angularDamping > 0) b.angVel.scale(1 / (1 + h * b.angularDamping));
      const wl = b.angVel.length();
      if (wl > b.maxAngularSpeed) b.angVel.scale(b.maxAngularSpeed / wl);
      b.rot.integrate(b.angVel, h);
    }
  }

  updateVelocities(h) {
    const inv = 1 / h;
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      b.vel.subVectors(b.pos, b.prevPos).scale(inv);
      _q0.multiplyConjB(b.rot, b.prevRot);
      const s = _q0.w >= 0 ? 2 * inv : -2 * inv;
      b.angVel.set(_q0.x * s, _q0.y * s, _q0.z * s);
    }
  }

  // ------------------------------------------------------------------------------------------
  broadphase(dt) {
    const list = this.sortList;
    list.length = 0;
    for (const b of this.bodies) {
      b.computeAABB(dt, this.margin * 2);
      list.push(b);
    }
    list.sort((a, b) => a.aabbMin.x - b.aabbMin.x);
    const pairs = this.pairs;
    pairs.length = 0;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        if (B.aabbMin.x > A.aabbMax.x) break;
        if (A.invMass === 0 && B.invMass === 0) continue;
        if (B.aabbMin.y > A.aabbMax.y || B.aabbMax.y < A.aabbMin.y) continue;
        if (B.aabbMin.z > A.aabbMax.z || B.aabbMax.z < A.aabbMin.z) continue;
        if ((A.collisionGroup & B.collisionMask) === 0 || (B.collisionGroup & A.collisionMask) === 0) continue;
        if (A.ignore && A.ignore.has(B)) continue;
        if (B.ignore && B.ignore.has(A)) continue;
        pairs.push(A, B);
      }
    }
    this.stats.pairs = pairs.length / 2;
  }

  generateContacts() {
    this.numContacts = 0;
    this.anchorStamp++;
    if (this.anchorStamp % 64 === 0) {
      for (const [k, an] of this.anchors) if (an.stamp < this.anchorStamp - 120) this.anchors.delete(k);
    }
    for (const b of this.bodies) {
      for (const s of b.shapes) s.updateWorld(b.pos, b.rot);
    }
    const col = this.collector;
    col.flip = false;
    const pairs = this.pairs;
    const m = this.margin;
    for (let i = 0; i < pairs.length; i += 2) {
      const A = pairs[i], B = pairs[i + 1];
      for (const sa of A.shapes) {
        if (!sa.collides) continue;
        for (const sb of B.shapes) {
          if (!sb.collides) continue;
          if (
            sa.aabbMin.x > sb.aabbMax.x + m || sa.aabbMax.x < sb.aabbMin.x - m ||
            sa.aabbMin.y > sb.aabbMax.y + m || sa.aabbMax.y < sb.aabbMin.y - m ||
            sa.aabbMin.z > sb.aabbMax.z + m || sa.aabbMax.z < sb.aabbMin.z - m
          ) continue;
          collideShapes(sa, sb, col);
        }
      }
    }
    const gy = this.groundY + m;
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.aabbMin.y > gy + 0.5) continue;
      for (const s of b.shapes) {
        if (s.collides) collideGround(s, this.groundY, this.groundHalfSize, col);
      }
    }
    this.stats.contacts = this.numContacts;
  }

  _addContact(sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz) {
    // canonical pair order so that contacts of one body pair form a contiguous manifold
    if (sB && sB.body.id < sA.body.id) {
      const ts = sA;
      sA = sB;
      sB = ts;
      let t = ax; ax = bx; bx = t;
      t = ay; ay = by; by = t;
      t = az; az = bz; bz = t;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    let c = this.contactPool[this.numContacts];
    if (!c) {
      c = new Contact();
      this.contactPool.push(c);
    }
    this.numContacts++;
    const A = sA.body;
    const B = sB ? sB.body : null;
    c.bodyA = A;
    c.bodyB = B;
    c.shapeA = sA;
    c.shapeB = sB;
    c.n.set(nx, ny, nz);
    _pA.set(ax, ay, az);
    A.worldToLocal(_pA, c.rA);
    _pB.set(bx, by, bz);
    if (B) B.worldToLocal(_pB, c.rB);
    else c.rB.copy(_pB);
    c.lambdaN = 0;
    const fa = sA.friction, fb = sB ? sB.friction : this.groundFriction;
    c.friction = Math.sqrt(fa * fb);
    c.staticFriction = c.friction * 1.15;
    c.restitution = Math.max(sA.restitution, sB ? sB.restitution : this.groundRestitution);
    c.compliance = Math.max(sA.compliance ?? 0, sB ? sB.compliance ?? 0 : 0);
    c.key = -1;
    c.anchor = null;
    if (!sB && this.collector.feature >= 0 && sA.type === SHAPE_BOX && sA.radius <= 0.02) {
      c.key = sA.id * 16 + this.collector.feature;
      let an = this.anchors.get(c.key);
      _v2.copy(c.rA).applyQuat(A.prevRot).add(A.prevPos);
      // re-use an anchor across brief contact gaps (rocking feet) if the feature lands close to it
      const stale = !an || an.stamp < this.anchorStamp - 60 || (an.stamp < this.anchorStamp - 1 && Math.hypot(an.p.x - _v2.x, an.p.z - _v2.z) > 0.02);
      if (stale) {
        if (!an) {
          an = new Anchor();
          this.anchors.set(c.key, an);
        }
        // new anchor at the material point's position at the start of this substep
        an.p.copy(_v2);
        an.p.y = this.groundY;
      }
      an.stamp = this.anchorStamp;
      c.anchor = an;
    }
    // pre-solve approach velocity
    A.velocityAt(_pA, _v0);
    if (B) {
      B.velocityAt(_pB, _v1);
      _v0.sub(_v1);
    }
    c.vnPre = _v0.dot(c.n);
  }

  // ------------------------------------------------------------------------------------------
  solvePositions(h) {
    for (const j of this.joints) j.solvePosition(h);
    for (const c of this.constraints) c.solvePosition(h);
    const n = this.numContacts;
    const pool = this.contactPool;
    let i0 = 0;
    while (i0 < n) {
      const A = pool[i0].bodyA, B = pool[i0].bodyB;
      let i1 = i0 + 1;
      while (i1 < n && pool[i1].bodyA === A && pool[i1].bodyB === B) i1++;
      for (let i = i0; i < i1; i++) this.solveContactNormal(pool[i], h);
      if (B === null) {
        this.solveAnchoredFriction(pool, i0, i1, h);
        for (let i = i0; i < i1; i++) if (!pool[i].anchor) this.solveContactFriction(pool[i], h);
      }
      else if (this.patchAll) this.solvePatchFriction(pool, i0, i1, h);
      else for (let i = i0; i < i1; i++) this.solveContactFriction(pool[i], h);
      i0 = i1;
    }
  }

  solveContactNormal(c, h) {
    const A = c.bodyA, B = c.bodyB;
    _rA.copy(c.rA).applyQuat(A.rot);
    _pA.copy(_rA).add(A.pos);
    if (B) {
      _rB.copy(c.rB).applyQuat(B.rot);
      _pB.copy(_rB).add(B.pos);
    } else {
      _pB.copy(c.rB);
      _rB.setZero();
    }
    const n = c.n;
    const d = (_pB.x - _pA.x) * n.x + (_pB.y - _pA.y) * n.y + (_pB.z - _pA.z) * n.z;
    if (d <= 0) return;
    c.lambdaN += positionalCorrection(A, B, n, d, _rA, _rB, c.compliance, h);
  }

  /**
   * Ground static friction with persistent anchors: every contact feature (box corner, capsule end)
   * is pinned to the ground point where it first touched, as long as the manifold's total friction
   * demand stays inside mu * N. Prevents the slow "walking" drift of strongly actuated feet.
   */
  solveAnchoredFriction(pool, i0, i1, h) {
    let lsum = 0, mu = 0, demand = 0;
    const A = pool[i0].bodyA;
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0 || !c.anchor) continue;
      lsum += c.lambdaN;
      mu += c.staticFriction * c.lambdaN;
      _rA.copy(c.rA).applyQuat(A.rot);
      _pA.copy(_rA).add(A.pos);
      _t.subVectors(_pA, c.anchor.p);
      _t.y = 0;
      const tl = _t.length();
      if (tl < 1e-10) continue;
      _t.scale(1 / tl);
      demand += tl / Math.max(A.inverseMassAt(_rA, _t), 1e-9);
    }
    if (lsum <= 0) return;
    mu /= lsum;
    const budget = mu * lsum;
    const scale = demand > budget ? budget / demand : 1;
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0 || !c.anchor) continue;
      _rA.copy(c.rA).applyQuat(A.rot);
      _pA.copy(_rA).add(A.pos);
      _t.subVectors(_pA, c.anchor.p);
      _t.y = 0;
      const tl = _t.length();
      if (tl < 1e-10) continue;
      _t.scale(-1 / tl);
      positionalCorrection(A, null, _t, tl * scale, _rA, null, 0, h);
      if (scale < 1) {
        // sliding: drag the anchor along with the contact point
        _rA.copy(c.rA).applyQuat(A.rot);
        c.anchor.p.copy(_rA).add(A.pos);
        c.anchor.p.y = this.groundY;
      }
    }
  }

  // Per-contact static friction (Müller et al.): cancel tangential motion of the contact points.
  solveContactFriction(c, h) {
    if (c.lambdaN <= 0) return;
    const A = c.bodyA, B = c.bodyB;
    _rA.copy(c.rA).applyQuat(A.rot);
    _pA.copy(_rA).add(A.pos);
    _v0.copy(c.rA).applyQuat(A.prevRot).add(A.prevPos);
    _v1.subVectors(_pA, _v0);
    if (B) {
      _rB.copy(c.rB).applyQuat(B.rot);
      _pB.copy(_rB).add(B.pos);
      _v2.copy(c.rB).applyQuat(B.prevRot).add(B.prevPos);
      _v3.subVectors(_pB, _v2);
      _v1.sub(_v3);
    } else {
      _rB.setZero();
    }
    const n = c.n;
    _t.copy(_v1).addScaled(n, -_v1.dot(n));
    const tl = _t.length();
    if (tl < 1e-10) return;
    _t.scale(1 / tl);
    const w = A.inverseMassAt(_rA, _t) + (B ? B.inverseMassAt(_rB, _t) : 0);
    if (w < 1e-12) return;
    if (tl / w < c.staticFriction * c.lambdaN) {
      _negT.copy(_t).negate();
      positionalCorrection(A, B, _negT, tl, _rA, _rB, 0, h);
    }
  }

  contactDynamicFriction(c, h) {
    if (c.lambdaN <= 0) return;
    const A = c.bodyA, B = c.bodyB;
    _rA.copy(c.rA).applyQuat(A.rot);
    _pA.copy(_rA).add(A.pos);
    A.velocityAt(_pA, _v0);
    if (B) {
      _rB.copy(c.rB).applyQuat(B.rot);
      _pB.copy(_rB).add(B.pos);
      B.velocityAt(_pB, _v1);
      _v0.sub(_v1);
    } else {
      _rB.setZero();
    }
    const n = c.n;
    _t.copy(_v0).addScaled(n, -_v0.dot(n));
    const vt = _t.length();
    if (vt < 1e-9) return;
    _t.scale(1 / vt);
    const w = A.inverseMassAt(_rA, _t) + (B ? B.inverseMassAt(_rB, _t) : 0);
    if (w < 1e-12) return;
    const dv = Math.min((c.friction * c.lambdaN * w) / h, vt);
    _v3.copy(_t).scale(-dv / w);
    this.applyPairImpulse(A, B, _v3, _rA, _rB);
  }

  /**
   * Patch friction: static friction for a whole contact manifold, applied at the load-weighted
   * centroid with a budget of mu * (total normal impulse), plus torsional friction about the normal.
   * Aggregating avoids the per-corner slip that sequential solves cause on heavily driven feet.
   */
  solvePatchFriction(pool, i0, i1, h) {
    let lsum = 0;
    _cA.setZero();
    _cB.setZero();
    _nAvg.setZero();
    let mu = 0;
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0) continue;
      lsum += c.lambdaN;
      _cA.addScaled(c.rA, c.lambdaN);
      _cB.addScaled(c.rB, c.lambdaN);
      _nAvg.addScaled(c.n, c.lambdaN);
      mu += c.staticFriction * c.lambdaN;
    }
    if (lsum <= 0) return;
    _cA.scale(1 / lsum);
    _cB.scale(1 / lsum);
    _nAvg.normalize();
    mu /= lsum;
    const A = pool[i0].bodyA, B = pool[i0].bodyB;
    // patch radius (for torsional friction)
    let rad = 0, cnt = 0;
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0) continue;
      rad += _v0.subVectors(c.rA, _cA).length();
      cnt++;
    }
    rad = cnt ? rad / cnt : 0;
    const n = _nAvg;
    // torsional (first, so the linear pass below re-pins the patch centroid)
    if (rad > 1e-4 && this.torsionalFriction) {
      _q0.multiplyConjB(A.rot, A.prevRot).toRotVec(_v0);
      let tw = _v0.dot(n);
      if (B) {
        _q0.multiplyConjB(B.rot, B.prevRot).toRotVec(_v1);
        tw -= _v1.dot(n);
      }
      const atw = Math.abs(tw);
      if (atw > 1e-10) {
        const w = A.inverseMassAngular(n) + (B ? B.inverseMassAngular(n) : 0);
        if (w > 1e-12) {
          const cap = mu * lsum * rad;
          const corr = Math.min(atw, cap * w);
          angularCorrection(A, B, n, tw > 0 ? -corr : corr, 0, h);
        }
      }
    }
    // linear
    _rA.copy(_cA).applyQuat(A.rot);
    _pA.copy(_rA).add(A.pos);
    _v0.copy(_cA).applyQuat(A.prevRot).add(A.prevPos);
    _v1.subVectors(_pA, _v0);
    if (B) {
      _rB.copy(_cB).applyQuat(B.rot);
      _pB.copy(_rB).add(B.pos);
      _v2.copy(_cB).applyQuat(B.prevRot).add(B.prevPos);
      _v3.subVectors(_pB, _v2);
      _v1.sub(_v3);
    } else {
      _rB.setZero();
    }
    _t.copy(_v1).addScaled(n, -_v1.dot(n));
    const tl = _t.length();
    if (tl > 1e-10) {
      _t.scale(1 / tl);
      const w = A.inverseMassAt(_rA, _t) + (B ? B.inverseMassAt(_rB, _t) : 0);
      if (w > 1e-12) {
        const cap = mu * lsum;
        const corr = Math.min(tl, cap * w);
        _negT.copy(_t).negate();
        positionalCorrection(A, B, _negT, corr, _rA, _rB, 0, h);
      }
    }
  }

  solveVelocities(h) {
    const n = this.numContacts;
    const pool = this.contactPool;
    const g = Math.abs(this.gravity.y);
    const thr = Math.max(this.restitutionThreshold, 2 * g * h);
    let i0 = 0;
    while (i0 < n) {
      const A = pool[i0].bodyA, B = pool[i0].bodyB;
      let i1 = i0 + 1;
      while (i1 < n && pool[i1].bodyA === A && pool[i1].bodyB === B) i1++;
      // normal: remove approach velocity, apply restitution
      for (let i = i0; i < i1; i++) {
        const c = pool[i];
        if (c.lambdaN <= 0) continue;
        this.recordContact(c, h);
        _rA.copy(c.rA).applyQuat(A.rot);
        _pA.copy(_rA).add(A.pos);
        A.velocityAt(_pA, _v0);
        if (B) {
          _rB.copy(c.rB).applyQuat(B.rot);
          _pB.copy(_rB).add(B.pos);
          B.velocityAt(_pB, _v1);
          _v0.sub(_v1);
        } else {
          _rB.setZero();
        }
        const nrm = c.n;
        const vn = _v0.dot(nrm);
        const e = Math.abs(c.vnPre) > thr ? c.restitution : 0;
        const dvn = -vn + Math.max(-e * c.vnPre, 0);
        if (Math.abs(dvn) < 1e-9) continue;
        const w = A.inverseMassAt(_rA, nrm) + (B ? B.inverseMassAt(_rB, nrm) : 0);
        if (w < 1e-12) continue;
        _v3.copy(nrm).scale(dvn / w);
        this.applyPairImpulse(A, B, _v3, _rA, _rB);
      }
      if (B === null || this.patchAll) this.patchDynamicFriction(pool, i0, i1, h);
      else for (let i = i0; i < i1; i++) this.contactDynamicFriction(pool[i], h);
      i0 = i1;
    }
    for (const j of this.joints) j.solveVelocity(h);
    for (const c of this.constraints) c.solveVelocity(h);
  }

  applyPairImpulse(A, B, J, rA, rB) {
    if (A.invMass > 0) {
      A.vel.addScaled(J, A.invMass);
      _v1.crossVectors(rA, J);
      A.invInertiaMul(_v1, _v2);
      A.angVel.add(_v2);
    }
    if (B && B.invMass > 0) {
      B.vel.addScaled(J, -B.invMass);
      _v1.crossVectors(rB, J);
      B.invInertiaMul(_v1, _v2);
      B.angVel.sub(_v2);
    }
  }

  patchDynamicFriction(pool, i0, i1, h) {
    let lsum = 0, mu = 0, rad = 0, cnt = 0;
    _cA.setZero();
    _cB.setZero();
    _nAvg.setZero();
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0) continue;
      lsum += c.lambdaN;
      _cA.addScaled(c.rA, c.lambdaN);
      _cB.addScaled(c.rB, c.lambdaN);
      _nAvg.addScaled(c.n, c.lambdaN);
      mu += c.friction * c.lambdaN;
    }
    if (lsum <= 0) return;
    _cA.scale(1 / lsum);
    _cB.scale(1 / lsum);
    _nAvg.normalize();
    mu /= lsum;
    for (let i = i0; i < i1; i++) {
      const c = pool[i];
      if (c.lambdaN <= 0) continue;
      rad += _v0.subVectors(c.rA, _cA).length();
      cnt++;
    }
    rad = cnt ? rad / cnt : 0;
    const A = pool[i0].bodyA, B = pool[i0].bodyB;
    const n = _nAvg;
    if (rad > 1e-4 && this.torsionalFriction) {
      let wn = A.angVel.dot(n);
      if (B) wn -= B.angVel.dot(n);
      const awn = Math.abs(wn);
      if (awn > 1e-9) {
        const w = A.inverseMassAngular(n) + (B ? B.inverseMassAngular(n) : 0);
        if (w > 1e-12) {
          const dw = Math.min((mu * lsum * rad * w) / h, awn);
          _v3.copy(n).scale((wn > 0 ? -dw : dw) / w);
          if (A.invMass > 0) {
            A.invInertiaMul(_v3, _v2);
            A.angVel.add(_v2);
          }
          if (B && B.invMass > 0) {
            B.invInertiaMul(_v3, _v2);
            B.angVel.sub(_v2);
          }
        }
      }
    }
    _rA.copy(_cA).applyQuat(A.rot);
    _pA.copy(_rA).add(A.pos);
    A.velocityAt(_pA, _v0);
    if (B) {
      _rB.copy(_cB).applyQuat(B.rot);
      _pB.copy(_rB).add(B.pos);
      B.velocityAt(_pB, _v1);
      _v0.sub(_v1);
    } else {
      _rB.setZero();
    }
    _t.copy(_v0).addScaled(n, -_v0.dot(n));
    const vt = _t.length();
    if (vt > 1e-9) {
      _t.scale(1 / vt);
      const w = A.inverseMassAt(_rA, _t) + (B ? B.inverseMassAt(_rB, _t) : 0);
      if (w > 1e-12) {
        const dv = Math.min((mu * lsum * w) / h, vt);
        _v3.copy(_t).scale(-dv / w);
        this.applyPairImpulse(A, B, _v3, _rA, _rB);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  beginImpacts() {
    for (const imp of this.impactList) this.impactPool.push(imp);
    this.impactList.length = 0;
    this.impacts.clear();
  }

  recordContact(c, h) {
    const A = c.bodyA, B = c.bodyB;
    const J = c.lambdaN / h;
    _v0.copy(c.n).scale(J);
    A.contactImpulse.add(_v0);
    A.contactCount++;
    if (B) {
      B.contactImpulse.sub(_v0);
      B.contactCount++;
    } else {
      A.groundImpulse += J;
      A.groundContact = true;
      if (A.groundContactUsed < 16) {
        let p = A.groundContactPoints[A.groundContactUsed];
        if (!p) {
          p = new Vec3();
          A.groundContactPoints.push(p);
        }
        p.copy(c.rB);
        A.groundContactUsed++;
      }
    }
    const key = B ? (A.id < B.id ? A.id * 65536 + B.id : B.id * 65536 + A.id) : A.id * 65536;
    let imp = this.impacts.get(key);
    if (!imp) {
      imp = this.impactPool.pop() || new Impact();
      imp.bodyA = A;
      imp.bodyB = B;
      imp.shapeA = c.shapeA;
      imp.shapeB = c.shapeB;
      imp.impulse = 0;
      imp.speed = 0;
      imp.weight = 0;
      imp.point.setZero();
      imp.normal.copy(c.n);
      this.impacts.set(key, imp);
      this.impactList.push(imp);
    }
    imp.impulse += J;
    const approach = -c.vnPre;
    if (approach > imp.speed) {
      imp.speed = approach;
      imp.shapeA = c.shapeA;
      imp.shapeB = c.shapeB;
      imp.normal.copy(c.n);
    }
    if (J > 0) {
      // impulse-weighted contact point
      _pA.copy(c.rA).applyQuat(A.rot).add(A.pos);
      imp.point.scale(imp.weight).addScaled(_pA, J);
      imp.weight += J;
      imp.point.scale(1 / imp.weight);
    }
  }

  finishImpacts() {}

  // ------------------------------------------------------------------------------------------
  /**
   * Cast a ray and return every shape interval it crosses, sorted by entry distance.
   * Each hit: { body, shape, tIn, tOut, point, normal }.
   */
  raycastAll(origin, dir, maxDist, filter = null) {
    const hits = [];
    const tmp = { tIn: 0, tOut: 0, normal: new Vec3() };
    for (const b of this.bodies) {
      if (filter && !filter(b)) continue;
      for (const s of b.shapes) {
        if (!s.collides && !s.raycastable) continue;
        s.updateWorld(b.pos, b.rot);
        if (rayShape(s, origin, dir, maxDist, tmp)) {
          hits.push({
            body: b,
            shape: s,
            tIn: tmp.tIn,
            tOut: tmp.tOut,
            point: new Vec3().copy(origin).addScaled(dir, Math.max(tmp.tIn, 0)),
            normal: tmp.normal.clone(),
          });
        }
      }
    }
    // ground
    if (dir.y < -1e-6) {
      const t = (this.groundY - origin.y) / dir.y;
      if (t > 0 && t < maxDist) {
        const p = new Vec3().copy(origin).addScaled(dir, t);
        if (Math.abs(p.x) <= this.groundHalfSize && Math.abs(p.z) <= this.groundHalfSize) {
          hits.push({ body: null, shape: null, tIn: t, tOut: t + 1, point: p, normal: new Vec3(0, 1, 0), ground: true });
        }
      }
    }
    hits.sort((a, b) => a.tIn - b.tIn);
    return hits;
  }

  raycast(origin, dir, maxDist, filter = null) {
    const hits = this.raycastAll(origin, dir, maxDist, filter);
    return hits.length ? hits[0] : null;
  }
}
