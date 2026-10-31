import * as THREE from 'three';
import { G, groups, Physics, RAPIER, toQ, toV } from './physics';
import { B, BONE_COUNT, PARENT, SkeletonDef } from '../anim/skeleton';
import { Pose, PoseFK } from '../anim/pose';
import { ExternalPose } from '../anim/animator';
import { rotY } from '../core/math';

interface Part {
  name: string;
  bone: number; // bone whose frame the body uses
  child: number; // segment end bone (for collider extent), -1 = sphere
  radius: number;
  mass: number;
  parent: number; // parent part index
  rb?: RAPIER.RigidBody;
}

const PART_DEFS: Omit<Part, 'rb'>[] = [
  { name: 'pelvis', bone: B.hips, child: B.spine, radius: 0.13, mass: 12, parent: -1 },
  { name: 'chest', bone: B.chest, child: B.neck, radius: 0.15, mass: 16, parent: 0 },
  { name: 'head', bone: B.neck, child: B.head, radius: 0.105, mass: 5, parent: 1 },
  { name: 'uarmL', bone: B.uarmL, child: B.farmL, radius: 0.05, mass: 2.5, parent: 1 },
  { name: 'farmL', bone: B.farmL, child: B.handL, radius: 0.045, mass: 2, parent: 3 },
  { name: 'uarmR', bone: B.uarmR, child: B.farmR, radius: 0.05, mass: 2.5, parent: 1 },
  { name: 'farmR', bone: B.farmR, child: B.handR, radius: 0.045, mass: 2, parent: 5 },
  { name: 'thighL', bone: B.thighL, child: B.shinL, radius: 0.075, mass: 8, parent: 0 },
  { name: 'shinL', bone: B.shinL, child: B.footL, radius: 0.055, mass: 4.5, parent: 7 },
  { name: 'thighR', bone: B.thighR, child: B.shinR, radius: 0.075, mass: 8, parent: 0 },
  { name: 'shinR', bone: B.shinR, child: B.footR, radius: 0.055, mass: 4.5, parent: 9 },
];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

export interface RagdollInit {
  def: SkeletonDef;
  fk: PoseFK; // root-space FK of the current pose
  prevFk?: PoseFK; // previous frame (for velocities)
  dt: number;
  rootX: number;
  rootZ: number;
  rootYaw: number;
  vel: THREE.Vector3; // whole-body velocity (world)
  scale: number;
}

/** Physics ragdoll that can drive an Animator (ExternalPose). */
export class Ragdoll implements ExternalPose {
  parts: Part[] = [];
  joints: RAPIER.ImpulseJoint[] = [];
  /** Body world transforms at the last read. */
  pos: THREE.Vector3[] = [];
  rot: THREE.Quaternion[] = [];
  /** Extra local rotation of foot relative to shin. */
  time = 0;
  calmTime = 0;
  settled = false;
  disposed = false;
  private boneW: THREE.Quaternion[] = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());
  private boneP: THREE.Vector3[] = Array.from({ length: BONE_COUNT }, () => new THREE.Vector3());
  /** World rotation of root (yaw) at creation; poses are written relative to animator root. */
  constructor(public physics: Physics, init: RagdollInit) {
    const w = physics.world;
    const { def, fk, rootX, rootZ, rootYaw } = init;
    const rootQ = new THREE.Quaternion().setFromAxisAngle(Y, rootYaw);
    const toWorld = (p: THREE.Vector3, out: THREE.Vector3) => {
      const [x, z] = rotY(p.x, p.z, rootYaw);
      return out.set(rootX + x, p.y, rootZ + z);
    };
    const S = init.scale;
    PART_DEFS.forEach((pd, idx) => {
      const part: Part = { ...pd };
      const bp = toWorld(fk.pos[pd.bone], new THREE.Vector3());
      const bq = rootQ.clone().multiply(fk.rot[pd.bone]);
      // velocity from previous frame
      const vel = init.vel.clone();
      if (init.prevFk && init.dt > 1e-4) {
        const pp = toWorld(init.prevFk.pos[pd.bone], new THREE.Vector3());
        const v = bp.clone().sub(pp).divideScalar(init.dt);
        if (v.length() < 12) vel.add(v.sub(init.vel).multiplyScalar(0.8));
      }
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(bp.x, bp.y, bp.z)
        .setRotation({ x: bq.x, y: bq.y, z: bq.z, w: bq.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setLinearDamping(0.08)
        .setAngularDamping(0.6)
        .setCcdEnabled(idx <= 2);
      const rb = w.createRigidBody(desc);
      // collider along segment in bone-local space
      const seg = pd.child >= 0 ? def.offsets[pd.child].clone() : new THREE.Vector3(0, 0.1, 0);
      if (pd.name === 'head') seg.copy(def.offsets[B.head]).add(new THREE.Vector3(0, 0.1 * S, 0.01));
      if (pd.name === 'farmL' || pd.name === 'farmR') seg.multiplyScalar(1.3); // include hand
      if (pd.name === 'shinL' || pd.name === 'shinR') seg.multiplyScalar(1.05);
      const len = seg.length();
      const r = pd.radius * S;
      let cd: RAPIER.ColliderDesc;
      if (pd.name === 'head') cd = RAPIER.ColliderDesc.ball(r);
      else cd = RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2 - r * 0.6), r);
      const center = seg.clone().multiplyScalar(pd.name === 'head' ? 0.75 : 0.5);
      const cq = new THREE.Quaternion().setFromUnitVectors(Y, seg.clone().normalize());
      cd.setTranslation(center.x, center.y, center.z)
        .setRotation({ x: cq.x, y: cq.y, z: cq.z, w: cq.w })
        .setMass(pd.mass * S * S)
        .setFriction(0.85)
        .setRestitution(0.05)
        .setCollisionGroups(groups(G.RAGDOLL, G.STATIC | G.CORPSE | G.PROP | G.RAGDOLL));
      w.createCollider(cd, rb);
      part.rb = rb;
      this.parts.push(part);
      this.pos.push(bp.clone());
      this.rot.push(bq.clone());
    });
    // joints
    for (let i = 1; i < this.parts.length; i++) {
      const p = this.parts[i];
      const par = this.parts[p.parent];
      const pPos = this.pos[p.parent], pRot = this.rot[p.parent];
      const cPos = this.pos[i];
      // anchor at child body origin
      const a1 = cPos.clone().sub(pPos).applyQuaternion(pRot.clone().invert());
      let jd: RAPIER.JointData;
      const isHinge = p.name.startsWith('farm') || p.name.startsWith('shin');
      if (isHinge) {
        // Hinge axis in bone-local (rest-aligned) frames; positive angle = flexion.
        // knee: shin dir (0,-1,0) bending towards -Z => axis +X. elbow: forearm dir bending towards +Z => dir x Z.
        let ax: THREE.Vector3;
        if (p.name.startsWith('shin')) ax = new THREE.Vector3(1, 0, 0);
        else ax = def.restDir[p.bone].clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
        jd = RAPIER.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 }, { x: ax.x, y: ax.y, z: ax.z });
      } else {
        jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 });
      }
      const j = w.createImpulseJoint(jd, par.rb!, p.rb!, true);
      j.setContactsEnabled(false);
      if (isHinge) {
        const rj = j as RAPIER.RevoluteImpulseJoint;
        // current relative angle range
        rj.setLimits(-0.08, 2.45);
        rj.configureMotorVelocity(0, 0.4);
      } else {
        // joint friction via velocity motors (call the raw API: typed class may be generic)
        const raw = j as unknown as { rawSet: { jointConfigureMotorVelocity?: (h: number, ax: number, v: number, f: number) => void }; handle: number };
        for (const ax of [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]) raw.rawSet.jointConfigureMotorVelocity?.(raw.handle, ax, 0, p.name === 'head' ? 1.2 : 0.8);
      }
      this.joints.push(j);
    }
    this.read();
  }

  /** Apply an impulse (world, N*s) at a part index or the nearest part to a point. */
  impulse(imp: THREE.Vector3, at?: THREE.Vector3, partName?: string) {
    let idx = 0;
    if (partName) idx = Math.max(0, this.parts.findIndex((p) => p.name === partName));
    else if (at) {
      let bd = Infinity;
      this.parts.forEach((p, i) => {
        const d = this.pos[i].distanceToSquared(at);
        if (d < bd) {
          bd = d;
          idx = i;
        }
      });
    }
    const rb = this.parts[idx].rb!;
    if (at) rb.applyImpulseAtPoint({ x: imp.x, y: imp.y, z: imp.z }, { x: at.x, y: at.y, z: at.z }, true);
    else rb.applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true);
  }
  /** Add velocity to every body (whole-body launch). */
  launch(v: THREE.Vector3, spin = 0) {
    for (const p of this.parts) {
      const lv = p.rb!.linvel();
      p.rb!.setLinvel({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z }, true);
      if (spin) {
        const av = p.rb!.angvel();
        p.rb!.setAngvel({ x: av.x + (Math.random() - 0.5) * spin, y: av.y + (Math.random() - 0.5) * spin, z: av.z + (Math.random() - 0.5) * spin }, true);
      }
    }
  }

  read() {
    for (let i = 0; i < this.parts.length; i++) {
      const rb = this.parts[i].rb!;
      toV(rb.translation(), this.pos[i]);
      toQ(rb.rotation(), this.rot[i]);
    }
  }

  update(dt: number) {
    if (this.disposed) return;
    this.time += dt;
    this.read();
    let maxV = 0;
    let sleeping = true;
    for (const p of this.parts) {
      const rb = p.rb!;
      if (!rb.isSleeping()) sleeping = false;
      const lv = rb.linvel();
      const av = rb.angvel();
      maxV = Math.max(maxV, Math.hypot(lv.x, lv.y, lv.z), Math.hypot(av.x, av.y, av.z) * 0.15);
    }
    if (maxV < 0.12 || sleeping) this.calmTime += dt;
    else this.calmTime = 0;
    if ((this.calmTime > 0.45 && this.time > 0.8) || this.time > 7) this.settled = true;
  }

  /** Pelvis ground position. */
  rootPos(out: THREE.Vector3) {
    return out.copy(this.pos[0]).setY(0);
  }
  /** Is the body lying face up? */
  faceUp() {
    _v.set(0, 0, 1).applyQuaternion(this.rot[1]);
    return _v.y > 0;
  }

  /** Compute bone world transforms (world space). */
  boneWorld() {
    const W = this.boneW, P = this.boneP;
    const bodyOf: Record<number, number> = {
      [B.hips]: 0, [B.chest]: 1, [B.neck]: 2, [B.uarmL]: 3, [B.farmL]: 4, [B.uarmR]: 5, [B.farmR]: 6, [B.thighL]: 7, [B.shinL]: 8, [B.thighR]: 9, [B.shinR]: 10,
    };
    for (let i = 0; i < BONE_COUNT; i++) {
      const bi = bodyOf[i];
      if (bi !== undefined) {
        W[i].copy(this.rot[bi]);
        P[i].copy(this.pos[bi]);
      }
    }
    W[B.spine].slerpQuaternions(W[B.hips], W[B.chest], 0.5);
    W[B.head].copy(W[B.neck]);
    W[B.clavL].copy(W[B.chest]);
    W[B.clavR].copy(W[B.chest]);
    W[B.handL].copy(W[B.farmL]);
    W[B.handR].copy(W[B.farmR]);
    _q.setFromAxisAngle(_v.set(1, 0, 0), 0.35);
    W[B.footL].copy(W[B.shinL]).multiply(_q);
    W[B.footR].copy(W[B.shinR]).multiply(_q);
    W[B.toeL].copy(W[B.footL]);
    W[B.toeR].copy(W[B.footR]);
    return { W, P };
  }

  writePose(def: SkeletonDef, rootX: number, rootZ: number, rootYaw: number, out: Pose) {
    const { W } = this.boneWorld();
    // root-space rotations: rootQ^-1 * W
    _qi.setFromAxisAngle(Y, -rootYaw);
    // hips local (relative to root bone which is identity in root space)
    out.q[B.root].identity();
    out.q[B.hips].copy(_qi).multiply(W[B.hips]);
    for (let i = 2; i < BONE_COUNT; i++) {
      const p = PARENT[i];
      // local = (rootQ^-1 Wp)^-1 (rootQ^-1 Wi) = Wp^-1 Wi
      _q2.copy(W[p]).invert().multiply(W[i]);
      out.q[i].copy(_q2);
    }
    const [x, z] = rotY(this.pos[0].x - rootX, this.pos[0].z - rootZ, -rootYaw);
    out.hips.set(x, this.pos[0].y, z);
    void def;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const w = this.physics.world;
    for (const j of this.joints) w.removeImpulseJoint(j, true);
    for (const p of this.parts) if (p.rb) w.removeRigidBody(p.rb);
    this.joints = [];
  }
}

export const _ragUnused = { _v2 };
