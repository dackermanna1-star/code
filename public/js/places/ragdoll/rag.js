// Rag dolls for the Ragdoll Olympics.
//
// The R6 figure as six rigid bodies (torso, head, two arms, two legs) held
// together at the neck, shoulders and hips by ball-and-socket joints. Each
// joint limits how far the limb can swing and how far it can twist, the way
// a person's does. The swing limit is an ellipse: an arm goes up over the
// head but hardly behind the back, and a leg swings forward to sit but only
// a little backwards. Twist is measured with the swing taken out first, so
// a raised arm doesn't count as twisted.
//
// What keeps them believable and steady:
//  - joint friction: a limb's spin relative to the torso is damped. The body
//    as a whole keeps tumbling, but arms don't windmill forever.
//  - projection: after every physics step, a limb the solver let drift off
//    its socket (a hard landing) is put back, so no limb ever comes apart.
//  - the arms collide with the torso, so a figure lying on its side rests on
//    its arm instead of swallowing it. The shoulder sockets sit at the top of
//    the arm, so raising it never pushes it into the chest.
//  - the six bodies settle, and wake, together.
//  - motors: the joints can be driven towards a pose (tuck, pike, star,
//    brace) with a chosen strength. That is how a diver tucks.
//  - impacts are measured (speed along the contact normal), and a limb hit
//    hard enough breaks and goes floppy.
import * as THREE from 'three';
import * as CANNON from '../../vendor/cannon-es.js';
import { GROUP } from '../../engine/Part.js';

export const TORSO = 0, HEAD = 1, RARM = 2, LARM = 3, RLEG = 4, LLEG = 5;
export const PART_NAMES = ['torso', 'head', 'right arm', 'left arm', 'right leg', 'left leg'];
const STEP = 1 / 120;

// The figure at rest in the torso's frame (facing -Z, its right hand at +X):
// each part's centre, collision shape and mass.
const PARTS = [
  { at: [0, 0, 0], box: [1, 1, 0.5], mass: 10 },
  { at: [0, 1.55, 0], ball: 0.63, mass: 2.2 },
  { at: [1.5, 0, 0], box: [0.47, 0.98, 0.47], mass: 1.9 },
  { at: [-1.5, 0, 0], box: [0.47, 0.98, 0.47], mass: 1.9 },
  { at: [0.5, -2, 0], box: [0.47, 0.98, 0.47], mass: 3.4 },
  { at: [-0.5, -2, 0], box: [0.47, 0.98, 0.47], mass: 3.4 },
];
// Each joint, by the limb it holds:
//  - at: the socket, in the torso's frame.
//  - axis: the limb's direction away from the socket. This is in the limb's
//    frame, which is the torso's frame at rest.
//  - side: the limb's outward direction.
//  - lim: how far it may swing forward, back, out and in, and twist (radians).
const JOINTS = [
  { b: HEAD, at: [0, 1, 0], axis: [0, 1, 0], side: [1, 0, 0], lim: [0.75, 0.65, 0.5, 0.5, 1.0], collide: false, fric: 0.03 },
  { b: RARM, at: [1.5, 1, 0], axis: [0, -1, 0], side: [1, 0, 0], lim: [2.6, 0.85, 2.4, 0.15, 0.5], collide: true, fric: 0.018 },
  { b: LARM, at: [-1.5, 1, 0], axis: [0, -1, 0], side: [-1, 0, 0], lim: [2.6, 0.85, 2.4, 0.15, 0.5], collide: true, fric: 0.018 },
  { b: RLEG, at: [0.5, -1, 0], axis: [0, -1, 0], side: [1, 0, 0], lim: [1.85, 0.4, 0.8, 0.12, 0.4], collide: false, fric: 0.022 },
  { b: LLEG, at: [-0.5, -1, 0], axis: [0, -1, 0], side: [-1, 0, 0], lim: [1.85, 0.4, 0.8, 0.12, 0.4], collide: false, fric: 0.022 },
];
const FWD = [0, 0, -1];

// Poses for the motors: for each joint (head, right arm, left arm, right leg,
// left leg), the swing as [forward, outward] in radians.
export const POSES = {
  stand: [[0, 0], [0.05, 0.06], [0.05, 0.06], [0, 0.02], [0, 0.02]],
  tuck: [[0.55, 0], [1.25, 0.15], [1.25, 0.15], [1.75, 0.08], [1.75, 0.08]],
  pike: [[0.35, 0], [1.7, 0], [1.7, 0], [1.55, 0], [1.55, 0]],
  layout: [[-0.15, 0], [2.5, 0.12], [2.5, 0.12], [-0.05, 0], [-0.05, 0]],
  star: [[0, 0], [0.25, 1.45], [0.25, 1.45], [0.05, 0.55], [0.05, 0.55]],
  brace: [[0.3, 0], [1.35, 0.35], [1.35, 0.35], [0.5, 0.15], [0.5, 0.15]],
  superman: [[-0.4, 0], [2.55, 0.15], [2.55, 0.15], [-0.3, 0.1], [-0.3, 0.1]],
  sit: [[0.1, 0], [0.4, 0.2], [0.4, 0.2], [1.5, 0.12], [1.5, 0.12]],
};

// --- small vector helpers (no allocation in the per-step loops) -----------------------------------------------------------
const _a = new CANNON.Vec3(), _b = new CANNON.Vec3(), _c = new CANNON.Vec3(), _d = new CANNON.Vec3();
const _q1 = new CANNON.Quaternion(), _q2 = new CANNON.Quaternion(), _q3 = new CANNON.Quaternion();

/** The shortest rotation taking unit vector u to unit vector v (into q). */
function arc(u, v, q) {
  const d = u.x * v.x + u.y * v.y + u.z * v.z;
  if (d < -0.9999) {
    // opposite: any axis at right angles will do
    const ax = Math.abs(u.x) < 0.9 ? 1 : 0, ay = ax ? 0 : 1;
    let x = u.y * 0 - u.z * ay, y = u.z * ax - u.x * 0, z = u.x * ay - u.y * ax;
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    q.set(x, y, z, 0);
    return q;
  }
  q.set(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x, 1 + d);
  q.normalize();
  return q;
}

/** Relative orientation (limb in the torso's frame) for a swing [forward, out] about a joint. */
function swingQuat(j, f, o, out) {
  // forward swing turns the axis towards -Z about axis x fwd; outward about axis x side
  const a = j.axisL;
  const fx = a.y * FWD[2] - a.z * FWD[1], fy = a.z * FWD[0] - a.x * FWD[2], fz = a.x * FWD[1] - a.y * FWD[0];
  const s = j.side;
  const sx = a.y * s.z - a.z * s.y, sy = a.z * s.x - a.x * s.z, sz = a.x * s.y - a.y * s.x;
  let rx = fx * f + sx * o, ry = fy * f + sy * o, rz = fz * f + sz * o;
  const ang = Math.hypot(rx, ry, rz);
  if (ang < 1e-6) return out.set(0, 0, 0, 1);
  rx /= ang; ry /= ang; rz /= ang;
  const h = Math.sin(ang / 2);
  return out.set(rx * h, ry * h, rz * h, Math.cos(ang / 2));
}

/**
 * A ball-and-socket joint with an elliptical swing limit and a twist limit.
 * It reuses the equations of cannon's ConeTwistConstraint but aims them itself.
 */
class Joint extends CANNON.ConeTwistConstraint {
  constructor(A, B, def, pivotB) {
    super(A, B, {
      pivotA: new CANNON.Vec3(...def.at), pivotB,
      axisA: new CANNON.Vec3(...def.axis), axisB: new CANNON.Vec3(...def.axis),
      angle: 1, twistAngle: 1, collideConnected: def.collide, maxForce: 1e6,
    });
    this.def = def;
    this.axisL = new CANNON.Vec3(...def.axis);
    this.fwd = new CANNON.Vec3(...FWD);
    this.side = new CANNON.Vec3(...def.side);
    this.ref = new CANNON.Vec3(...FWD); // (perpendicular to every limb's axis)
    this.lim = def.lim.slice();
    this.fric = def.fric;
    this.motor = null; // {q: target relative orientation, k: strength per step, gain}
    for (const eq of this.equations) eq.setSpookParams(5e7, 3, STEP);
  }

  update() {
    const A = this.bodyA, B = this.bodyB, qa = A.quaternion, qb = B.quaternion;
    // the socket (as PointToPointConstraint does)
    const x = this.equationX, y = this.equationY, z = this.equationZ;
    qa.vmult(this.pivotA, x.ri); qb.vmult(this.pivotB, x.rj);
    y.ri.copy(x.ri); y.rj.copy(x.rj); z.ri.copy(x.ri); z.rj.copy(x.rj);
    // the swing: where the limb would point at rest against where it points
    const cone = this.coneEquation, tw = this.twistEquation;
    qa.vmult(this.axisL, cone.axisA);
    qb.vmult(this.axisL, cone.axisB);
    // the limit in the direction it has swung (in the torso's frame)
    qa.conjugate(_q1); _q1.vmult(cone.axisB, _a);
    const fx = _a.x * this.fwd.x + _a.y * this.fwd.y + _a.z * this.fwd.z;
    const sy = _a.x * this.side.x + _a.y * this.side.y + _a.z * this.side.z;
    const L = this.lim, lx = fx >= 0 ? L[0] : L[1], ly = sy >= 0 ? L[2] : L[3];
    const r = Math.hypot(fx, sy);
    if (r < 1e-6) cone.angle = Math.min(lx, ly);
    else { const c = fx / r, s = sy / r; cone.angle = 1 / Math.sqrt((c * c) / (lx * lx) + (s * s) / (ly * ly)); }
    // the twist: the reference direction carried along by the swing, against the limb's own
    arc(cone.axisA, cone.axisB, _q2);
    qa.vmult(this.ref, _b); _q2.vmult(_b, tw.axisA);
    qb.vmult(this.ref, tw.axisB);
    tw.maxAngle = L[4];
  }
}

// --- materials ------------------------------------------------------------------------------------------------------------------------
let ragMat = null;
export function ragMaterial(world) {
  if (ragMat && ragMat._world === world) return ragMat;
  ragMat = new CANNON.Material('ragdoll');
  ragMat._world = world;
  world.physics.addContactMaterial(new CANNON.ContactMaterial(ragMat, world.defaultPhysMaterial, { friction: 0.45, restitution: 0.06, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }));
  world.physics.addContactMaterial(new CANNON.ContactMaterial(ragMat, ragMat, { friction: 0.4, restitution: 0.04, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }));
  return ragMat;
}

const tv = new THREE.Vector3(), tq = new THREE.Quaternion();

/**
 * One rag doll. Made by RagdollSystem.fromCharacter / fromModel.
 * Listeners: onImpact({part, v, point, other, normal}), onBreak(part), onRest().
 */
export class Ragdoll {
  constructor(sys, meshes, poses, o = {}) {
    this.sys = sys;
    this.world = sys.world;
    this.meshes = meshes;
    this.bodies = [];
    this.joints = [];
    this.broken = [false, false, false, false, false, false];
    this.lastHit = new Float32Array(6).fill(-9);
    this.lastHitV = new Float32Array(6);
    this.pending = []; // impacts seen during the step, handed out after it
    this.still = 0;
    this.asleep = false;
    this.canSleep = o.canSleep !== false;
    this.owner = o.owner || null; // (a Player)
    this.ch = o.character || null;
    this.alive = true;
    this.age = 0;
    this.flailT = 0;
    this.camSubject = { alive: true, rootPosition: new THREE.Vector3(), root: { visible: true } };
    const mat = ragMaterial(this.world);
    for (let i = 0; i < 6; i++) {
      const d = PARTS[i], p = poses[i];
      const b = new CANNON.Body({ mass: d.mass * (o.massScale || 1), material: mat, linearDamping: 0.04, angularDamping: i === TORSO ? 0.06 : 0.12, allowSleep: true });
      b.sleepSpeedLimit = 0; // (they settle together: see _settle)
      if (d.ball) b.addShape(new CANNON.Sphere(d.ball));
      else b.addShape(new CANNON.Box(new CANNON.Vec3(...d.box)));
      b.position.set(p.p.x, p.p.y, p.p.z);
      b.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
      // (or the first frame would draw it between here and the origin)
      b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position);
      b.previousQuaternion.copy(b.quaternion); b.interpolatedQuaternion.copy(b.quaternion);
      b.collisionFilterGroup = GROUP.DEBRIS;
      b.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.DEBRIS;
      b.rag = this; b.ragPart = i;
      b.addEventListener('collide', (e) => this._collide(i, e));
      this.bodies.push(b);
    }
    // scalar inertias (for sharing out joint friction and motor torques)
    this.inertia = this.bodies.map((b) => 3 / (b.invInertia.x + b.invInertia.y + b.invInertia.z));
    const T = this.bodies[TORSO];
    for (const jd of JOINTS) {
      const B = this.bodies[jd.b];
      // the socket on the limb: where the torso's socket is now
      T.quaternion.vmult(new CANNON.Vec3(...jd.at), _a); _a.vadd(T.position, _a);
      const pb = B.pointToLocalFrame(_a, new CANNON.Vec3());
      const j = new Joint(T, B, jd, pb);
      j.ia = this.inertia[TORSO]; j.ib = this.inertia[jd.b];
      this.joints.push(j);
    }
    for (const b of this.bodies) this.world.physics.addBody(b);
    for (const j of this.joints) this.world.physics.addConstraint(j);
    for (const m of meshes) this.world.scene.add(m);
    this.sync(true);
  }

  // --- where it is -------------------------------------------------------------------------------------------------------
  get torso() { return this.bodies[TORSO]; }
  get position() { const p = this.bodies[TORSO].position; return tv.set(p.x, p.y, p.z); }
  /** The centre of mass. */
  center(out = new THREE.Vector3()) {
    let m = 0; out.set(0, 0, 0);
    for (const b of this.bodies) { out.x += b.position.x * b.mass; out.y += b.position.y * b.mass; out.z += b.position.z * b.mass; m += b.mass; }
    return out.multiplyScalar(1 / m);
  }
  velocity(out = new THREE.Vector3()) {
    let m = 0; out.set(0, 0, 0);
    for (const b of this.bodies) { out.x += b.velocity.x * b.mass; out.y += b.velocity.y * b.mass; out.z += b.velocity.z * b.mass; m += b.mass; }
    return out.multiplyScalar(1 / m);
  }
  /** Fastest any part is moving. */
  speed() { let s = 0; for (const b of this.bodies) s = Math.max(s, b.velocity.length()); return s; }
  lowest() { let y = Infinity; for (const b of this.bodies) y = Math.min(y, b.position.y); return y; }

  // --- pushing it about ---------------------------------------------------------------------------------------------------
  /** Add a velocity to every part (and a spin about the centre of mass, rad/s). */
  push(vx, vy, vz, spin = null) {
    this.wake();
    const c = spin ? this.center(new THREE.Vector3()) : null;
    for (const b of this.bodies) {
      b.velocity.x += vx; b.velocity.y += vy; b.velocity.z += vz;
      if (spin) {
        b.angularVelocity.x += spin.x; b.angularVelocity.y += spin.y; b.angularVelocity.z += spin.z;
        // w x r: the part's speed from the spin
        const rx = b.position.x - c.x, ry = b.position.y - c.y, rz = b.position.z - c.z;
        b.velocity.x += spin.y * rz - spin.z * ry; b.velocity.y += spin.z * rx - spin.x * rz; b.velocity.z += spin.x * ry - spin.y * rx;
      }
    }
  }
  /** Set every part's velocity. */
  setVelocity(vx, vy, vz) { this.wake(); for (const b of this.bodies) { b.velocity.set(vx, vy, vz); b.angularVelocity.scale(0.3, b.angularVelocity); } }
  /** An impulse on one part (studs/s worth of speed for that part), at a world point if given. */
  hit(part, ix, iy, iz, point = null) {
    this.wake();
    const b = this.bodies[part];
    const imp = new CANNON.Vec3(ix * b.mass, iy * b.mass, iz * b.mass);
    if (point) b.applyImpulse(imp, new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z));
    else b.applyImpulse(imp);
  }
  /** Torque-ish: spin the torso (rad/s added), the limbs follow through the joints. */
  spinTorso(wx, wy, wz) { this.wake(); const w = this.bodies[TORSO].angularVelocity; w.x += wx; w.y += wy; w.z += wz; }
  /** Move the whole figure (keeping its pose and motion). */
  translate(dx, dy, dz) { for (const b of this.bodies) { b.position.x += dx; b.position.y += dy; b.position.z += dz; b.previousPosition.x += dx; b.previousPosition.y += dy; b.previousPosition.z += dz; } this.sync(true); }

  // --- muscles -----------------------------------------------------------------------------------------------------------
  /**
   * Drive the joints towards a pose (a POSES name or an array of [forward,
   * out] per joint) with a strength 0..1 (how much of the error each step
   * fixes). null lets it go limp.
   */
  pose(p, strength = 0.2, gain = 14) {
    if (!p) { for (const j of this.joints) j.motor = null; this.poseName = null; return; }
    const list = typeof p === 'string' ? POSES[p] : p;
    this.poseName = typeof p === 'string' ? p : 'custom';
    this.joints.forEach((j, i) => {
      const s = list[i];
      if (!s || this.broken[j.def.b]) { j.motor = null; return; }
      const q = swingQuat(j, s[0], s[1], new CANNON.Quaternion());
      j.motor = { q, k: strength, gain };
    });
    this.wake();
  }
  /** Flailing: random poses, changed every few tenths of a second. */
  flail(on, strength = 0.12) { this.flailing = on ? strength : 0; if (!on) this.pose(null); }

  // --- life cycle --------------------------------------------------------------------------------------------------------------
  wake() {
    if (this.asleep) { this.asleep = false; for (const b of this.bodies) b.wakeUp(); }
    this.still = 0;
  }
  sleep() { this.asleep = true; for (const b of this.bodies) b.sleep(); }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    for (const j of this.joints) this.world.physics.removeConstraint(j);
    for (const b of this.bodies) this.world.physics.removeBody(b);
    for (const m of this.meshes) this.world.scene.remove(m);
    this.sys.rags.delete(this);
  }

  /** Hand the figure back to a person: the parts glide to a standing pose, then done(). */
  standUp(feet, yaw, secs, done) {
    for (const j of this.joints) this.world.physics.removeConstraint(j);
    for (const b of this.bodies) this.world.physics.removeBody(b);
    this.standing = { t: 0, secs, done, from: this.meshes.map((m) => [m.position.clone(), m.quaternion.clone()]), to: restPoses(feet, yaw) };
  }

  // --- each physics step -----------------------------------------------------------------------------------------------------------
  _collide(i, e) {
    const other = e.body;
    if (other.rag === this) return;
    const c = e.contact;
    const v = Math.abs(c.getImpactVelocityAlongNormal());
    if (v < 3) return;
    const self = this.bodies[i];
    const mine = c.bi === self;
    const bp = mine ? c.bi.position : c.bj.position, r = mine ? c.ri : c.rj;
    // (the contact normal points from bi to bj)
    const s = mine ? -1 : 1;
    this.pending.push({ part: i, v, x: bp.x + r.x, y: bp.y + r.y, z: bp.z + r.z, nx: c.ni.x * s, ny: c.ni.y * s, nz: c.ni.z * s, other });
  }

  _step() {
    if (this.standing) return;
    this.age += STEP;
    const B = this.bodies;
    if (this.asleep) {
      // something woke a part: wake them all
      if (B.some((b) => b.sleepState !== CANNON.Body.SLEEPING)) this.wake();
      else return;
    }
    // flailing: a new random pose now and then
    if (this.flailing) {
      this.flailT -= STEP;
      if (this.flailT <= 0) {
        this.flailT = 0.18 + Math.random() * 0.22;
        const r = (a, b) => a + Math.random() * (b - a);
        const k = this.flailing;
        this.pose([[r(-0.4, 0.6), r(-0.4, 0.4)], [r(-0.5, 2.5), r(0, 2.2)], [r(-0.5, 2.5), r(0, 2.2)], [r(-0.3, 1.6), r(0, 0.7)], [r(-0.3, 1.6), r(0, 0.7)]], k, 18);
        this.poseName = 'flail';
      }
    }
    const T = B[TORSO];
    for (const j of this.joints) {
      const A = j.bodyA, L = j.bodyB, wa = A.angularVelocity, wb = L.angularVelocity;
      const ia = j.ia, ib = j.ib, sum = ia + ib;
      // muscles: steer the limb's spin (relative to the torso) towards its pose
      if (j.motor) {
        const m = j.motor;
        A.quaternion.mult(m.q, _q1); L.quaternion.conjugate(_q2); _q1.mult(_q2, _q3);
        if (_q3.w < 0) { _q3.x = -_q3.x; _q3.y = -_q3.y; _q3.z = -_q3.z; _q3.w = -_q3.w; }
        const s = Math.hypot(_q3.x, _q3.y, _q3.z);
        const k = s > 1e-6 ? (2 * Math.atan2(s, _q3.w) / s) * m.gain : 2 * m.gain;
        const dx = (_q3.x * k - (wb.x - wa.x)) * m.k, dy = (_q3.y * k - (wb.y - wa.y)) * m.k, dz = (_q3.z * k - (wb.z - wa.z)) * m.k;
        wa.x -= dx * ib / sum; wa.y -= dy * ib / sum; wa.z -= dz * ib / sum;
        wb.x += dx * ia / sum; wb.y += dy * ia / sum; wb.z += dz * ia / sum;
      }
      // joint friction (sharing the change so the spin of the whole is kept)
      const f = this.broken[j.def.b] ? j.fric * 0.3 : j.fric;
      const rx = (wb.x - wa.x) * f, ry = (wb.y - wa.y) * f, rz = (wb.z - wa.z) * f;
      wa.x += rx * ib / sum; wa.y += ry * ib / sum; wa.z += rz * ib / sum;
      wb.x -= rx * ia / sum; wb.y -= ry * ia / sum; wb.z -= rz * ia / sum;
      // projection: a limb the solver let slip off its socket goes back on
      A.quaternion.vmult(j.pivotA, _a); _a.vadd(A.position, _a);
      L.quaternion.vmult(j.pivotB, _b); _b.vadd(L.position, _b);
      _a.vsub(_b, _c);
      const e2 = _c.lengthSquared();
      if (e2 > 0.0016) {
        const e = Math.sqrt(e2), k = (e - 0.02) / e;
        L.position.x += _c.x * k; L.position.y += _c.y * k; L.position.z += _c.z * k;
        // and stop it flying away from the socket
        const nx = _c.x / e, ny = _c.y / e, nz = _c.z / e;
        const rv = (L.velocity.x - A.velocity.x) * nx + (L.velocity.y - A.velocity.y) * ny + (L.velocity.z - A.velocity.z) * nz;
        if (rv < 0) { L.velocity.x -= nx * rv; L.velocity.y -= ny * rv; L.velocity.z -= nz * rv; }
      }
    }
    // water
    if (this.sys.water.length) this._water();
    // settling: when every part has (nearly) stopped for a while, they sleep
    let m = 0;
    for (const b of B) { const s = b.velocity.lengthSquared() + b.angularVelocity.lengthSquared() * 0.4; if (s > m) m = s; }
    if (m < 0.9) this.still += STEP; else this.still = 0;
    if (this.still > 0.6 && !this.restFired) { this.restFired = true; this.onRest?.(this); }
    if (this.still < 0.01) this.restFired = false;
    if (this.canSleep && this.still > 0.9 && !this.flailing && !this.joints.some((j) => j.motor)) this.sleep();
    this.inWater = this._wet;
    void T;
  }

  _water() {
    this._wet = false;
    for (const w of this.sys.water) {
      for (let i = 0; i < 6; i++) {
        const b = this.bodies[i], p = b.position;
        if (p.x < w.x0 || p.x > w.x1 || p.z < w.z0 || p.z > w.z1 || p.y > w.y + 1 || p.y < w.bottom) continue;
        if (w.round) { const dx = p.x - (w.x0 + w.x1) / 2, dz = p.z - (w.z0 + w.z1) / 2, r = (w.x1 - w.x0) / 2; if (dx * dx + dz * dz > r * r) continue; }
        const depth = Math.min(1.6, w.y + 0.8 - p.y);
        if (depth <= 0) continue;
        this._wet = true;
        if (!this.wetParts) this.wetParts = new Uint8Array(6);
        // floats (a little), and the water drags it to a stop
        const g = -this.world.physics.gravity.y;
        b.velocity.y += g * STEP * (depth / 1.6) * (i === TORSO ? 1.45 : 1.15);
        const drag = Math.max(0, 1 - STEP * (2.2 + depth * 1.8));
        b.velocity.scale(drag, b.velocity);
        b.angularVelocity.scale(Math.max(0, 1 - STEP * 3), b.angularVelocity);
        if (!this.wetParts[i]) { this.wetParts[i] = 1; this.onSplash?.(i, b.velocity.length(), p); }
      }
    }
    if (!this._wet && this.wetParts) this.wetParts.fill(0);
  }

  /** Hand out the step's impacts (strongest per part), break limbs, keep the meshes on the bodies. */
  _frame(dt) {
    if (this.standing) {
      const s = this.standing;
      s.t += dt;
      const k = Math.min(1, s.t / s.secs), e = k * k * (3 - 2 * k);
      this.meshes.forEach((m, i) => { m.position.lerpVectors(s.from[i][0], s.to[i][0], e); m.quaternion.slerpQuaternions(s.from[i][1], s.to[i][1], e); });
      if (k >= 1) { const done = s.done; this.standing = null; this.destroy(); done?.(); }
      return;
    }
    if (this.pending.length) {
      const best = new Map();
      for (const h of this.pending) { const k = h.part; if (!best.has(k) || best.get(k).v < h.v) best.set(k, h); }
      this.pending.length = 0;
      const now = this.world.time;
      for (const h of best.values()) {
        // the same knock shows up over a few steps: count it once
        if (now - this.lastHit[h.part] < 0.14 && h.v < this.lastHitV[h.part] * 1.5) continue;
        this.lastHit[h.part] = now; this.lastHitV[h.part] = h.v;
        h.point = new THREE.Vector3(h.x, h.y, h.z);
        h.normal = new THREE.Vector3(h.nx, h.ny, h.nz);
        const lim = BREAK[h.part];
        if (!this.broken[h.part] && h.v > lim * (this.toughness || 1)) this._break(h.part, h);
        this.onImpact?.(h, this);
      }
    }
    this.sync();
  }

  _break(part, h) {
    this.broken[part] = true;
    const j = this.joints.find((x) => x.def.b === part);
    if (j) { j.lim = j.lim.map((a, i) => (i < 4 ? Math.min(2.9, a * 1.35 + 0.15) : a * 1.5)); j.motor = null; }
    this.onBreak?.(part, h, this);
  }

  sync(force = false) {
    const B = this.bodies;
    for (let i = 0; i < 6; i++) {
      const b = B[i], m = this.meshes[i];
      const p = force ? b.position : b.interpolatedPosition, q = force ? b.quaternion : b.interpolatedQuaternion;
      m.position.set(p.x, p.y, p.z);
      m.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const t = this.meshes[TORSO].position;
    this.camSubject.rootPosition.copy(t);
    if (this.ch) this.ch.root.position.copy(t); // (the name tag follows)
  }
}

// how hard a part must hit something to break (studs/s along the normal)
const BREAK = [92, 78, 66, 66, 72, 72];

/** Where each part is when standing at feet (a point on the ground) facing yaw. */
function restPoses(feet, yaw) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const c = new THREE.Vector3(feet.x, feet.y + 3, feet.z);
  return PARTS.map((d) => [new THREE.Vector3(...d.at).applyQuaternion(q).add(c), q.clone()]);
}

/** Bones, joints and rag dolls for the world. Steps them with the physics and draws them after it. */
export class RagdollSystem {
  constructor(world) {
    this.world = world;
    this.rags = new Set();
    this.water = []; // [{x0, x1, z0, z1, y (surface), bottom}]
    ragMaterial(world);
    this._post = () => { for (const r of this.rags) if (r.alive) r._step(); };
    world.physics.addEventListener('postStep', this._post);
  }

  /** A rag doll that looks like the model (a CharacterModel), standing at its current place. */
  fromModel(model, o = {}) {
    model.root.updateMatrixWorld(true);
    const src = [model.torso, model.head, model.rightArm, model.leftArm, model.rightLeg, model.leftLeg];
    const meshes = src.map((m) => {
      const c = m.clone(true);
      // (a force field's outline is drawn on the limbs; leave it behind)
      c.traverse((o2) => { if (o2.isLineSegments) o2.visible = false; });
      c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.set(1, 1, 1);
      c.matrixAutoUpdate = true;
      return c;
    });
    // the parts where the model has them, then each limb slid onto its socket (keeping its angle)
    const poses = src.map((m) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.getWorldPosition(p); m.getWorldQuaternion(q); return { p, q }; });
    const T = poses[TORSO];
    for (const jd of JOINTS) {
      const P = poses[jd.b];
      const sock = new THREE.Vector3(...jd.at).applyQuaternion(T.q).add(T.p);
      // the limb's own end of the socket: for arms and legs the top of the limb, for the head its base
      const local = jd.b === HEAD ? new THREE.Vector3(0, -0.55, 0) : new THREE.Vector3(0, 1, 0);
      P.p.copy(sock).sub(local.applyQuaternion(P.q));
    }
    const rag = new Ragdoll(this, meshes, poses, o);
    this.rags.add(rag);
    return rag;
  }

  /**
   * Turn a living character into a rag doll: it is taken out of the world
   * (park) until it gets back up (see unpark). Keeps its momentum.
   */
  fromCharacter(ch, o = {}) {
    const m = ch.model;
    // arms raised over the head (jumping) would start past the shoulder's limit
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const mo = ch.motor;
    m.setAngles(cl(mo.rs, -0.8, 2.4), cl(mo.ls, -2.4, 0.8), cl(mo.rh, -0.35, 1.6), cl(mo.lh, -1.6, 0.35));
    m.rightShoulder.rotation.y = 0; m.leftShoulder.rotation.y = 0;
    ch.root.updateMatrixWorld(true);
    const rag = this.fromModel(m, { ...o, character: ch, owner: ch.player });
    const v = ch.body.velocity;
    for (const b of rag.bodies) b.velocity.set(v.x, v.y, v.z);
    park(ch);
    ch.rag = rag;
    return rag;
  }

  /** Called after each world step: impacts, breaks, drawing. */
  frame(dt) { for (const r of [...this.rags]) if (r.alive) r._frame(dt); }

  clear() { for (const r of [...this.rags]) r.destroy(); }
}

/** Take a character out of the world (its rag doll stands in for it). */
export function park(ch) {
  const w = ch.world;
  w.physics.removeEventListener('postStep', ch._onPhysStep);
  if (w.physics.bodies.includes(ch.body)) w.physics.removeBody(ch.body);
  w.characters.delete(ch);
  ch.unequip?.();
  ch.root.visible = false;
  ch.parked = true;
  ch.input.move.set(0, 0, 0); ch.input.jump = false;
}

/** Put a parked character back, standing at feet facing yaw. */
export function unpark(ch, feet, yaw) {
  ch.parked = false;
  ch.rag = null;
  ch.spawn(feet, yaw, 0);
  ch.body.velocity.set(0, 0, 0);
}
