import { Vec3, Quat } from '../physics/math.js';
import { Body } from '../physics/body.js';
import { Shape } from '../physics/shapes.js';
import { Joint } from '../physics/joints.js';
import { ContactCollector, collideShapes } from '../physics/collide.js';
import { buildSegmentList, jointDef, landmark, DIRS } from './anatomy.js';

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
    for (const b of this.bodies) this.world.removeBody(b);
    for (const j of this.jointList) this.world.removeJoint(j);
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
