// Death ragdoll: 11 Rapier rigid bodies (pelvis, torso, head, upper/lower arms, upper/lower legs) joined by
// spherical joints with per-axis limits (frames aligned to the death pose, elbows/knees limited to their
// flexion range) and joint friction motors, initialised from the current pose and velocity. When the bodies
// fall asleep (or after a timeout) the pose is frozen and the physics objects are released.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { RAPIER, Layer, Mask, groups } from '../../core/Physics';
import type { DamageInfo } from '../../core/types';
import type { Character } from '../Character';
import type { Rig, BoneKey } from './Rig';
import { setWorldQuat, worldPos, worldQuat } from './IK';

interface PartDef {
  key: BoneKey;
  end: BoneKey | BoneKey[];
  radius: number;
  mass: number;
  parent: number; // index into PARTS, -1 for the root
  kind: 'ball' | 'hinge';
  /** Swing/twist limits (rad) for ball joints, or [twist, side] tolerance for hinges. */
  limits: [number, number, number];
  /** Knees bend backward, elbows forward. */
  hingeSign?: 1 | -1;
}

const PARTS: PartDef[] = [
  { key: 'hips', end: ['spine'], radius: 0.13, mass: 12, parent: -1, kind: 'ball', limits: [0, 0, 0] },
  { key: 'spine', end: ['neck', 'head'], radius: 0.15, mass: 24, parent: 0, kind: 'ball', limits: [0.55, 0.35, 0.4] },
  { key: 'head', end: ['headTop'], radius: 0.11, mass: 5, parent: 1, kind: 'ball', limits: [0.6, 0.7, 0.45] },
  { key: 'upperArmL', end: ['lowerArmL'], radius: 0.055, mass: 2.5, parent: 1, kind: 'ball', limits: [1.3, 1.2, 1.3] },
  { key: 'lowerArmL', end: ['middle1L', 'handL'], radius: 0.045, mass: 2, parent: 3, kind: 'hinge', limits: [0.5, 0.15, 0], hingeSign: 1 },
  { key: 'upperArmR', end: ['lowerArmR'], radius: 0.055, mass: 2.5, parent: 1, kind: 'ball', limits: [1.3, 1.2, 1.3] },
  { key: 'lowerArmR', end: ['middle1R', 'handR'], radius: 0.045, mass: 2, parent: 5, kind: 'hinge', limits: [0.5, 0.15, 0], hingeSign: 1 },
  { key: 'upperLegL', end: ['lowerLegL'], radius: 0.085, mass: 9, parent: 0, kind: 'ball', limits: [1.0, 0.45, 0.5] },
  { key: 'lowerLegL', end: ['toesL', 'footL'], radius: 0.06, mass: 4.5, parent: 7, kind: 'hinge', limits: [0.25, 0.08, 0], hingeSign: -1 },
  { key: 'upperLegR', end: ['lowerLegR'], radius: 0.085, mass: 9, parent: 0, kind: 'ball', limits: [1.0, 0.45, 0.5] },
  { key: 'lowerLegR', end: ['toesR', 'footR'], radius: 0.06, mass: 4.5, parent: 9, kind: 'hinge', limits: [0.25, 0.08, 0], hingeSign: -1 },
];

interface Part {
  def: PartDef;
  bone: THREE.Bone;
  body: RAPIER.RigidBody;
  /** bone world quat = body quat * offset */
  offset: THREE.Quaternion;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _X = new THREE.Vector3(1, 0, 0);
const RAGDOLL_GROUPS = groups(Layer.Dynamic, Layer.Terrain | Layer.Static | Layer.Vehicle | Layer.Door | Layer.Glass);

function toR(v: THREE.Vector3) {
  return { x: v.x, y: v.y, z: v.z };
}
function toRQ(q: THREE.Quaternion) {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export class Ragdoll {
  private readonly parts: Part[] = [];
  private readonly joints: RAPIER.ImpulseJoint[] = [];
  private time = 0;
  private frozen = false;
  private readonly world: RAPIER.World;

  constructor(
    c: Character,
    private readonly rig: Rig,
    root: THREE.Object3D,
    info?: DamageInfo,
  ) {
    this.world = ctx.physics.world;
    root.updateMatrixWorld(true);
    const s = rig.height / 1.8;
    // ── bodies ──
    for (const def of PARTS) {
      const bone = rig.bones[def.key];
      if (!bone) throw new Error(`ragdoll: missing bone ${def.key}`);
      worldPos(bone, _a);
      const ends = Array.isArray(def.end) ? def.end : [def.end];
      let endBone: THREE.Bone | undefined;
      for (const e of ends) if ((endBone = rig.bones[e])) break;
      if (endBone) worldPos(endBone, _b);
      else _b.copy(_a).add(_d.set(0, 0.2 * s, 0));
      if (def.key === 'hips') {
        // Pelvis: short vertical segment toward the spine.
        _b.lerp(_a, 0.2);
      }
      if (def.key === 'head' && !rig.bones.headTop) _b.copy(_a).add(_d.set(0, 0.22 * s, 0));
      _d.subVectors(_b, _a);
      const len = Math.max(0.05, _d.length());
      _d.divideScalar(len);
      _q.setFromUnitVectors(_Y, _d);
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(_a.x, _a.y, _a.z)
        .setRotation(toRQ(_q))
        .setLinearDamping(0.35)
        .setAngularDamping(2.2)
        .setCcdEnabled(true)
        .setLinvel(c.velocity.x, c.velocity.y, c.velocity.z);
      const body = this.world.createRigidBody(desc);
      const r = def.radius * s;
      const half = Math.max(0.01, len / 2 - r * 0.5);
      const col = RAPIER.ColliderDesc.capsule(half, r)
        .setTranslation(0, len / 2, 0)
        .setMass(def.mass)
        .setFriction(0.9)
        .setRestitution(0.05)
        .setCollisionGroups(RAGDOLL_GROUPS)
        .setSolverGroups(RAGDOLL_GROUPS);
      const collider = this.world.createCollider(col, body);
      ctx.physics.tag(collider, { kind: 'dynamic', surface: 'flesh', owner: c });
      const offset = worldQuat(bone, new THREE.Quaternion());
      offset.premultiply(_q2.copy(_q).invert());
      this.parts.push({ def, bone, body, offset });
    }
    // ── joints ──
    for (let i = 1; i < this.parts.length; i++) {
      const p = this.parts[i];
      const parent = this.parts[p.def.parent];
      worldPos(p.bone, _a); // joint pivot = child bone joint
      const t1 = parent.body.translation(), q1r = parent.body.rotation();
      const t2 = p.body.translation(), q2r = p.body.rotation();
      const q1 = new THREE.Quaternion(q1r.x, q1r.y, q1r.z, q1r.w);
      const q2 = new THREE.Quaternion(q2r.x, q2r.y, q2r.z, q2r.w);
      const inv1 = q1.clone().invert(), inv2 = q2.clone().invert();
      const anchor1 = _b.set(_a.x - t1.x, _a.y - t1.y, _a.z - t1.z).applyQuaternion(inv1).clone();
      const anchor2 = _d.set(_a.x - t2.x, _a.y - t2.y, _a.z - t2.z).applyQuaternion(inv2).clone();
      // Joint frame (world): X = primary axis (hinge flexion axis), aligned in both bodies → zero = death pose.
      const frameW = new THREE.Quaternion();
      let bend0 = 0;
      if (p.def.kind === 'hinge') {
        const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(q1);
        const loDir = new THREE.Vector3(0, 1, 0).applyQuaternion(q2);
        bend0 = upDir.angleTo(loDir);
        let axis = new THREE.Vector3().crossVectors(upDir, loDir);
        if (axis.lengthSq() < 0.01) {
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).multiplyScalar(p.def.hingeSign ?? 1);
          axis = new THREE.Vector3().crossVectors(upDir, fwd);
          bend0 = 0;
        }
        axis.normalize();
        frameW.setFromUnitVectors(_X, axis);
      } else {
        frameW.copy(q2);
      }
      const f1 = inv1.clone().multiply(frameW);
      const f2 = inv2.clone().multiply(frameW);
      const data = RAPIER.JointData.spherical(toR(anchor1), toR(anchor2));
      const joint = this.world.createImpulseJoint(data, parent.body, p.body, true);
      joint.setLocalFrame1(toR(anchor1), toRQ(f1));
      joint.setLocalFrame2(toR(anchor2), toRQ(f2));
      joint.setContactsEnabled(false);
      const raw = (joint as unknown as { rawSet: { jointSetLimits(h: number, axis: number, min: number, max: number): void }; handle: number });
      const L = p.def.limits;
      if (p.def.kind === 'hinge') {
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngX, -bend0 + 0.02, 2.5 - bend0);
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngY, -L[0], L[0]);
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngZ, -L[1], L[1]);
      } else {
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngX, -L[0], L[0]);
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngY, -L[1], L[1]);
        raw.rawSet.jointSetLimits(raw.handle, RAPIER.JointAxis.AngZ, -L[2], L[2]);
      }
      // Joint friction: velocity motors toward zero (removes the rubbery look).
      const sj = joint as RAPIER.SphericalImpulseJoint;
      for (const ax of [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]) {
        try {
          sj.configureMotorVelocity(ax, 0, 0.6 * (p.def.mass / 5));
        } catch {
          /* motors unsupported → damping only */
        }
      }
      this.joints.push(joint);
    }
    // ── hit impulse ──
    if (info && info.amount > 0) {
      const dir = info.direction ? info.direction.clone().normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).negate();
      const strength = Math.min(120, Math.max(15, info.amount)) * (info.type === 'explosion' ? 0.6 : 0.12);
      const zone = info.zone ?? 'chest';
      const idx = zone === 'head' || zone === 'neck' ? 2 : zone === 'pelvis' ? 0 : zone === 'arm' || zone === 'hand' ? 6 : zone === 'leg' || zone === 'foot' ? 10 : 1;
      const imp = dir.multiplyScalar(strength);
      if (info.type === 'explosion') imp.y += strength * 0.6;
      const part = this.parts[idx];
      const at = info.point ?? part.body.translation();
      part.body.applyImpulseAtPoint(toR(imp), at, true);
    }
  }

  update(_dt: number): void {
    if (this.frozen) return;
    this.time += _dt;
    let asleep = true;
    for (const p of this.parts) {
      const t = p.body.translation(), r = p.body.rotation();
      _q.set(r.x, r.y, r.z, r.w).multiply(p.offset);
      if (p.def.key === 'hips') {
        const parent = p.bone.parent!;
        _a.set(t.x, t.y, t.z);
        parent.worldToLocal(_a);
        p.bone.position.copy(_a);
      }
      setWorldQuat(p.bone, _q, true);
      if (!p.body.isSleeping()) asleep = false;
    }
    if ((asleep && this.time > 1.5) || this.time > 12) this.freeze();
  }

  private freeze(): void {
    this.frozen = true;
    this.release();
  }

  private release(): void {
    for (const j of this.joints) if (j.isValid()) this.world.removeImpulseJoint(j, false);
    this.joints.length = 0;
    for (const p of this.parts) {
      const n = p.body.numColliders();
      for (let i = 0; i < n; i++) ctx.physics.info.delete(p.body.collider(i).handle);
      this.world.removeRigidBody(p.body);
    }
    this.parts.length = 0;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  dispose(): void {
    if (!this.frozen) this.release();
    this.frozen = true;
    void this.rig;
  }
}

export { Mask };
