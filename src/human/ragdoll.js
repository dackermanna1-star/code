import { Vec3, Quat } from '../physics/math.js';
import { Body } from '../physics/body.js';
import { Shape } from '../physics/shapes.js';
import { Joint } from '../physics/joints.js';
import { ContactCollector, collideShapes } from '../physics/collide.js';
import { buildSegmentList, jointDef, landmark, DIRS, frameFromYZ } from './anatomy.js';

const _v0 = new Vec3();
const _v1 = new Vec3();
const _q0 = new Quat();

export const RAGDOLL_GROUP = 2;

function toVec(p) {
  return typeof p === 'string' ? landmark(p) : new Vec3(p[0], p[1], p[2]);
}

function makeShape(sd, seg) {
  const opts = { friction: 0.9, restitution: 0.05, material: 'flesh' };
  if (sd.type === 'capsule') {
    return Shape.capsuleBetween(toVec(sd.a), toVec(sd.b), sd.radius, opts);
  }
  if (sd.type === 'box') {
    const s = Shape.box(sd.half[0], sd.half[1], sd.half[2], { ...opts, radius: sd.radius });
    s.localPos.set(sd.center[0], sd.center[1], sd.center[2]);
    if (seg.name.startsWith('foot')) {
      s.friction = 1.0;
      s.material = 'shoe';
    }
    return s;
  }
  if (sd.type === 'hand') {
    const side = seg.side;
    const wrist = landmark(side === 'L' ? 'wristL' : 'wristR');
    const fdir = DIRS.forearmDirL.clone();
    if (side === 'R') fdir.x = -fdir.x;
    const s = Shape.box(0.006, 0.072, 0.033, { ...opts, radius: sd.radius });
    s.localPos.copy(wrist).addScaled(fdir, 0.083);
    s.localRot.setFromUnitVectors(new Vec3(0, -1, 0), fdir);
    return s;
  }
  throw new Error(`bad shape ${sd.type}`);
}

/**
 * Physical human: 17 rigid segments joined by anatomically limited joints with muscle drives.
 * Body frames are world-aligned in the bind pose (identity rotation) and centred on each segment's
 * centre of mass, which keeps joint frames, IK and skinning in one consistent space.
 */
export class Ragdoll {
  constructor(world, opts = {}) {
    this.world = world;
    this.segments = {};
    this.segList = [];
    this.joints = {};
    this.jointList = [];
    this.bodies = [];
    this.totalMass = 0;
    this.extraBodies = []; // bodies created by fractures
    this.fractureJoints = [];
    this.build();
    this.resetPose(opts.position ?? new Vec3(0, 0, 0), opts.yaw ?? 0);
  }

  build() {
    const defs = buildSegmentList();
    for (const def of defs) {
      const body = new Body({ name: def.name, linearDamping: 0.02, angularDamping: 0.15 });
      body.collisionGroup = RAGDOLL_GROUP;
      const seg = {
        name: def.name,
        def,
        side: def.side,
        body,
        bindPos: new Vec3(),
        parent: null,
        children: [],
        joint: null,
        bone: def.bone ?? null,
        fractured: null,
      };
      for (const sd of def.shapes) {
        const s = makeShape(sd, seg);
        s.tag = def.name;
        body.addShape(s);
      }
      const com = body.setMassFromShapes(def.mass);
      seg.bindPos.copy(com);
      body.userData = { ragdoll: this, segment: seg };
      this.segments[def.name] = seg;
      this.segList.push(seg);
      this.bodies.push(body);
      this.totalMass += def.mass;
    }
    for (const seg of this.segList) {
      const def = seg.def;
      if (!def.parent) continue;
      const parent = this.segments[def.parent];
      seg.parent = parent;
      parent.children.push(seg);
      const jd = jointDef(def.joint);
      const anchor = landmark(def.joint);
      let frameP = jd.frame.clone();
      let frameC = jd.frame.clone();
      if (jd.centerDir) {
        const sBind = new Quat().setFromUnitVectors(jd.centerDir, jd.boneDir);
        frameC = new Quat().multiplyQuats(sBind, frameP);
      }
      const joint = new Joint(parent.body, seg.body, {
        name: def.joint,
        anchorP: new Vec3().subVectors(anchor, parent.bindPos),
        anchorC: new Vec3().subVectors(anchor, seg.bindPos),
        frameP,
        frameC,
        swingInChildFrame: jd.swingChild,
        limits: jd.limits,
        limitCompliance: 1e-6,
      });
      joint.userData = { def: jd, segment: seg, bindAnchor: anchor };
      seg.joint = joint;
      this.joints[def.joint] = joint;
      this.jointList.push(joint);
    }
    this.setupCollisionFilter();
  }

  // Never collide parent/child pairs or pairs that already overlap in the bind pose.
  setupCollisionFilter() {
    for (const seg of this.segList) {
      seg.body.ignore = new Set();
      for (const s of seg.body.shapes) s.updateWorld(seg.bindPos, new Quat());
    }
    for (const seg of this.segList) {
      if (seg.parent) {
        seg.body.ignore.add(seg.parent.body);
        seg.parent.body.ignore.add(seg.body);
      }
    }
    let overlap = false;
    const col = new ContactCollector(() => {
      overlap = true;
    });
    col.margin = 0.004;
    for (let i = 0; i < this.segList.length; i++) {
      for (let j = i + 1; j < this.segList.length; j++) {
        const A = this.segList[i].body, B = this.segList[j].body;
        if (A.ignore.has(B)) continue;
        overlap = false;
        for (const sa of A.shapes) for (const sb of B.shapes) collideShapes(sa, sb, col);
        if (overlap) {
          A.ignore.add(B);
          B.ignore.add(A);
        }
      }
    }
  }

  addToWorld() {
    for (const b of this.bodies) this.world.addBody(b);
    for (const j of this.jointList) this.world.addJoint(j);
  }

  removeFromWorld() {
    for (const b of this.allBodies()) this.world.removeBody(b);
    for (const j of this.jointList) this.world.removeJoint(j);
    for (const j of this.fractureJoints) this.world.removeJoint(j);
  }

  /**
   * Break the long bone of `seg` at fraction t along it (0 = proximal joint). The segment body keeps
   * the proximal fragment (its frame is re-centred on the new centre of mass, every reference into
   * it is shifted accordingly); the distal fragment becomes a new body joined by a loose,
   * barely-resisting joint, so the limb bends where it broke. Returns fracture info or null.
   */
  fractureSegment(seg, t) {
    if (seg.fractured || !seg.bone) return null;
    const sd = seg.def.shapes[0];
    if (sd.type !== 'capsule') return null;
    t = Math.min(Math.max(t, 0.22), 0.78);
    const A = toVec(sd.a), B = toVec(sd.b);
    const F = new Vec3().lerpVectors(A, B, t);
    const axis = new Vec3().subVectors(B, A).normalize();
    const body = seg.body;
    const mass = body.mass;
    const opts = { friction: 0.9, restitution: 0.05, material: 'flesh' };
    // distal fragment
    const frag = new Body({ name: seg.name + 'Frag', linearDamping: body.linearDamping, angularDamping: body.angularDamping });
    frag.collisionGroup = RAGDOLL_GROUP;
    const cd = Shape.capsuleBetween(F, B, sd.radius, opts);
    cd.tag = seg.name;
    frag.addShape(cd);
    const fragBind = frag.setMassFromShapes(mass * (1 - t));
    // proximal fragment: rebuild the segment body's collider and mass
    const oldBind = seg.bindPos.clone();
    body.shapes.length = 0;
    const cp = Shape.capsuleBetween(A, F, sd.radius, opts);
    cp.tag = seg.name;
    body.addShape(cp);
    const proxBind = body.setMassFromShapes(mass * t);
    const delta = new Vec3().subVectors(proxBind, oldBind); // origin shift in the body frame
    const rDelta = delta.clone().applyQuat(body.rot);
    const w = body.angVel.clone(), v0 = body.vel.clone();
    const origin = body.pos.clone();
    body.pos.add(rDelta);
    body.prevPos.add(rDelta);
    body.framePos.add(delta.clone().applyQuat(body.frameRot));
    body.vel.add(new Vec3().crossVectors(w, rDelta));
    seg.bindPos.copy(proxBind);
    // place the distal fragment where that material currently is
    const rFrag = new Vec3().subVectors(fragBind, oldBind).applyQuat(body.rot);
    frag.setPose(new Vec3().addVectors(origin, rFrag), body.rot);
    frag.framePos.copy(body.framePos).add(new Vec3().subVectors(fragBind, proxBind).applyQuat(body.frameRot));
    frag.frameRot.copy(body.frameRot);
    frag.vel.copy(v0).add(new Vec3().crossVectors(w, rFrag));
    frag.angVel.copy(w);
    frag.userData = { ragdoll: this, segment: seg, fragment: true, bindPos: fragBind };
    // re-anchor joints
    for (const j of this.jointList) {
      if (j.child === body) j.anchorC.sub(delta);
      if (j.parent === body) {
        const anchorBind = new Vec3().addVectors(j.anchorP, oldBind);
        const distal = new Vec3().subVectors(anchorBind, F).dot(axis) > 0;
        if (distal) {
          j.parent = frag;
          j.anchorP.subVectors(anchorBind, fragBind);
        } else j.anchorP.sub(delta);
      }
    }
    // the broken bone: a joint with almost no resistance and wide limits
    const frame = frameFromYZ(axis, new Vec3(0, 0, 1));
    const fj = new Joint(body, frag, {
      name: seg.name + 'Fracture',
      anchorP: new Vec3().subVectors(F, proxBind),
      anchorC: new Vec3().subVectors(F, fragBind),
      frameP: frame,
      frameC: frame,
      limits: { swingX: [-1.0, 1.0], swingZ: [-0.9, 0.9], twist: [-0.7, 0.7], mode: 'ellipse' },
      limitCompliance: 2e-5,
    });
    fj.driveMode = 1; // relative: torn muscle and periosteum, weak and well damped
    fj.target.identity();
    fj.stiffness = 3;
    fj.damping = 0.5;
    fj.maxTorque = 12;
    fj.userData = { fracture: true, segment: seg };
    // collision filtering: the fragment behaves like the segment it came from
    frag.ignore = new Set(body.ignore);
    frag.ignore.add(body);
    body.ignore.add(frag);
    for (const b of this.allBodies()) if (b.ignore && b.ignore.has(body)) b.ignore.add(frag);
    this.world.addBody(frag);
    this.world.addJoint(fj);
    this.extraBodies.push(frag);
    this.fractureJoints.push(fj);
    seg.fractured = { extra: [frag], joint: fj, t, pointBind: F, axis, fragBind, delta };
    return { seg, fragment: frag, joint: fj, pointBind: F, axisBind: axis, delta };
  }

  /** Place every segment at its bind configuration, translated to `origin` and rotated by `yaw`. */
  resetPose(origin, yaw = 0) {
    this.origin = origin.clone();
    this.yaw = yaw;
    const qy = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), yaw);
    for (const seg of this.segList) {
      _v0.copy(seg.bindPos).applyQuat(qy).add(origin);
      seg.body.setPose(_v0, qy);
      seg.body.vel.setZero();
      seg.body.angVel.setZero();
    }
  }

  /** Apply a full pose given as relative joint rotations (name -> Quat) from a root transform. */
  applyPose(rootPos, rootRot, relRots) {
    const root = this.segments.pelvis;
    root.body.setPose(rootPos, rootRot);
    for (const seg of this.segList) {
      if (!seg.parent) continue;
      const j = seg.joint;
      const P = seg.parent.body;
      const rel = relRots[j.name] ?? _q0.identity();
      const rot = new Quat().multiplyQuats(P.rot, rel);
      // anchor world position from parent, then child COM = anchor - rot * anchorC
      const anchorW = P.localToWorld(j.anchorP, new Vec3());
      const pos = new Vec3().copy(j.anchorC).applyQuat(rot);
      pos.subVectors(anchorW, pos);
      seg.body.setPose(pos, rot);
    }
  }

  get pelvis() {
    return this.segments.pelvis.body;
  }

  computeCOM(out = new Vec3()) {
    out.setZero();
    let m = 0;
    for (const b of this.allBodies()) {
      out.addScaled(b.pos, b.mass);
      m += b.mass;
    }
    return out.scale(1 / m);
  }

  computeCOMVelocity(out = new Vec3()) {
    out.setZero();
    let m = 0;
    for (const b of this.allBodies()) {
      out.addScaled(b.vel, b.mass);
      m += b.mass;
    }
    return out.scale(1 / m);
  }

  allBodies() {
    return this.extraBodies.length ? this.bodies.concat(this.extraBodies) : this.bodies;
  }

  isRagdollBody(b) {
    return b && b.userData && b.userData.ragdoll === this;
  }

  segmentOf(body) {
    return body && body.userData && body.userData.ragdoll === this ? body.userData.segment : null;
  }

  kineticEnergy() {
    let e = 0;
    for (const b of this.allBodies()) e += b.kineticEnergy();
    return e;
  }
}
