import * as THREE from 'three';
import { RAPIER, GROUPS, type RBody, type PhysOwner, type ContactImpact } from '../physics/Physics';
import { ctx } from '../game/ctx';
import { PART_COUNT, PARENT, P } from './Rig';
import type { CharacterModel } from './CharacterModel';
import { Pose } from './Pose';

type Limit =
  | { kind: 'sph'; x: [number, number]; y: [number, number]; z: [number, number] }
  | { kind: 'rev'; min: number; max: number };

const LIMITS: (Limit | null)[] = [
  null,
  { kind: 'sph', x: [-0.45, 1.1], y: [-0.6, 0.6], z: [-0.45, 0.45] },
  { kind: 'sph', x: [-0.75, 0.95], y: [-1.1, 1.1], z: [-0.55, 0.55] },
  { kind: 'sph', x: [-2.8, 0.9], y: [-0.9, 0.9], z: [-0.35, 2.4] },
  { kind: 'rev', min: -2.5, max: 0.02 },
  { kind: 'sph', x: [-2.8, 0.9], y: [-0.9, 0.9], z: [-2.4, 0.35] },
  { kind: 'rev', min: -2.5, max: 0.02 },
  { kind: 'sph', x: [-1.8, 0.55], y: [-0.45, 0.45], z: [-0.25, 0.9] },
  { kind: 'rev', min: -0.02, max: 2.4 },
  { kind: 'sph', x: [-1.8, 0.55], y: [-0.45, 0.45], z: [-0.9, 0.25] },
  { kind: 'rev', min: -0.02, max: 2.4 },
];

const DENSITY = [420, 420, 200, 380, 380, 380, 380, 400, 400, 400, 400];

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _c = new THREE.Vector3();

export interface RagdollOwner {
  onRagdollImpact?(part: number, ev: ContactImpact): void;
}

/** Physical ragdoll built from a character model's current pose. */
export class Ragdoll {
  readonly bodies: (RBody | null)[] = new Array(PART_COUNT).fill(null);
  readonly joints: (RAPIER.ImpulseJoint | null)[] = new Array(PART_COUNT).fill(null);
  private prevPos: THREE.Vector3[] = [];
  private currPos: THREE.Vector3[] = [];
  private prevRot: THREE.Quaternion[] = [];
  private currRot: THREE.Quaternion[] = [];
  restTime = 0;
  age = 0;
  frozen = false;

  constructor(
    public model: CharacterModel,
    baseVel: THREE.Vector3,
    owner: RagdollOwner & { id?: number },
    dt: number,
    public entity: unknown,
  ) {
    const { world } = ctx.physics;
    model.updateMatrices();
    for (let i = 0; i < PART_COUNT; i++) {
      this.prevPos.push(new THREE.Vector3());
      this.currPos.push(new THREE.Vector3());
      this.prevRot.push(new THREE.Quaternion());
      this.currRot.push(new THREE.Quaternion());
      if (model.severed[i] || model.destroyed[i]) continue;
      model.boxMatrix[i].decompose(_p, _q, _s);
      // velocity from tracked animation motion
      const v = new THREE.Vector3().subVectors(model.currCenters[i], model.prevCenters[i]).multiplyScalar(1 / Math.max(dt, 1 / 120));
      if (v.lengthSq() > 64) v.setLength(8);
      v.add(baseVel);
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(_p.x, _p.y, _p.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinvel(v.x, v.y, v.z)
        .setLinearDamping(0.08)
        .setAngularDamping(1.6)
        .setCcdEnabled(i === P.TORSO || i === P.HEAD || i === P.PELVIS);
      const body = world.createRigidBody(desc);
      const h = model.half[i];
      const shrink = i === P.TORSO || i === P.PELVIS || i === P.HEAD ? 0.92 : 0.86;
      const cd = RAPIER.ColliderDesc.cuboid(h.x * shrink, h.y * 0.94, h.z * shrink)
        .setDensity(DENSITY[i])
        .setFriction(0.75)
        .setRestitution(0.08)
        .setCollisionGroups(GROUPS.RAGDOLL);
      if (i === P.TORSO || i === P.HEAD || i === P.PELVIS || i === P.SHIN_L || i === P.SHIN_R) {
        cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(220);
      }
      const col = world.createCollider(cd, body);
      const po: PhysOwner = {
        kind: 'ragdoll',
        material: 'flesh',
        entity,
        part: i,
        onContactForce: (ev) => owner.onRagdollImpact?.(i, ev),
      };
      ctx.physics.register(col, po);
      this.bodies[i] = body;
      this.currPos[i].copy(_p);
      this.prevPos[i].copy(_p);
      this.currRot[i].copy(_q);
      this.prevRot[i].copy(_q);
    }
    // joints
    for (let i = 1; i < PART_COUNT; i++) {
      const par = PARENT[i];
      const b1 = this.bodies[par];
      const b2 = this.bodies[i];
      if (!b1 || !b2) continue;
      const rig = model.rig;
      const a1 = rig.joint[i].clone().sub(rig.center[par]);
      const a2 = rig.center[i].clone().negate();
      const lim = LIMITS[i]!;
      let jd: RAPIER.JointData;
      if (lim.kind === 'rev') {
        jd = RAPIER.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z }, { x: 1, y: 0, z: 0 });
        jd.limitsEnabled = true;
        jd.limits = [lim.min, lim.max];
      } else {
        jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
      }
      // The joint frames must reflect the current relative rotation as "rest": use bind frames (identity),
      // so limits are relative to the bind pose.
      const j = world.createImpulseJoint(jd, b1, b2, true);
      j.setContactsEnabled(false);
      const raw = (world.impulseJoints as any).raw;
      if (lim.kind === 'sph') {
        raw.jointSetLimits(j.handle, 3, lim.x[0], lim.x[1]);
        raw.jointSetLimits(j.handle, 4, lim.y[0], lim.y[1]);
        raw.jointSetLimits(j.handle, 5, lim.z[0], lim.z[1]);
        // joint friction: velocity motors targeting zero (raw API: spherical joints are generic here)
        for (const ax of [3, 4, 5]) raw.jointConfigureMotorVelocity(j.handle, ax, 0, 0.6);
      } else {
        raw.jointConfigureMotorVelocity(j.handle, 3, 0, 0.4);
      }
      this.joints[i] = j;
    }
  }

  /** Remove the joint connecting a part to its parent. */
  detach(part: number): void {
    const j = this.joints[part];
    if (j) {
      ctx.physics.world.removeImpulseJoint(j, true);
      this.joints[part] = null;
    }
  }

  /** Remove a part's body entirely (destroyed). */
  removePart(part: number): void {
    this.detach(part);
    for (let c = 0; c < PART_COUNT; c++) if (PARENT[c] === part) this.detach(c);
    const b = this.bodies[part];
    if (b) {
      ctx.physics.removeBody(b);
      this.bodies[part] = null;
    }
  }

  applyImpulse(part: number, impulse: THREE.Vector3, point?: THREE.Vector3): void {
    const b = this.bodies[part] ?? this.bodies[P.TORSO];
    if (!b) return;
    if (point) b.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: point.x, y: point.y, z: point.z }, true);
    else b.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }

  /** Apply impulse distributed over all parts (whole-body launch). */
  applyImpulseAll(impulse: THREE.Vector3, focusPart: number = P.TORSO, focus = 0.5): void {
    let n = 0;
    for (const b of this.bodies) if (b) n++;
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      if (!b) continue;
      const share = i === focusPart ? focus + (1 - focus) / n : (1 - focus) / n;
      b.applyImpulse({ x: impulse.x * share, y: impulse.y * share, z: impulse.z * share }, true);
    }
  }

  capture(): void {
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      if (!b) continue;
      this.prevPos[i].copy(this.currPos[i]);
      this.prevRot[i].copy(this.currRot[i]);
      const t = b.translation();
      const r = b.rotation();
      this.currPos[i].set(t.x, t.y, t.z);
      this.currRot[i].set(r.x, r.y, r.z, r.w);
    }
  }

  /** speed of the torso */
  speed(): number {
    const b = this.bodies[P.TORSO] ?? this.bodies[P.PELVIS];
    if (!b) return 0;
    const v = b.linvel();
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  maxSpeed(): number {
    let m = 0;
    for (const b of this.bodies) {
      if (!b) continue;
      const v = b.linvel();
      m = Math.max(m, v.x * v.x + v.y * v.y + v.z * v.z);
    }
    return Math.sqrt(m);
  }

  update(dt: number): void {
    this.age += dt;
    const s = this.maxSpeed();
    if (s < 0.35) this.restTime += dt;
    else this.restTime = 0;
  }

  /** Drive model bones from the simulated bodies (render interpolated). */
  syncModel(alpha: number): void {
    const model = this.model;
    const root = model.root;
    // move root under the pelvis/torso so culling and shadows behave
    const anchor = this.bodies[P.PELVIS] ? P.PELVIS : this.bodies[P.TORSO] ? P.TORSO : -1;
    if (anchor >= 0) {
      _c.lerpVectors(this.prevPos[anchor], this.currPos[anchor], alpha);
      root.position.set(_c.x, _c.y - model.rig.bindWorld[P.PELVIS].y, _c.z);
    }
    root.updateMatrixWorld();
    const boneWorld: THREE.Matrix4[] = (this as any)._bw ?? ((this as any)._bw = Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()));
    for (let i = 0; i < PART_COUNT; i++) {
      const bone = model.bones[i];
      const b = this.bodies[i];
      const par = PARENT[i];
      const parentWorld = par < 0 ? root.matrixWorld : boneWorld[par];
      if (b) {
        _p.lerpVectors(this.prevPos[i], this.currPos[i], alpha);
        _q.slerpQuaternions(this.prevRot[i], this.currRot[i], alpha);
        // bone world = body * translate(-center)
        _m.compose(_p, _q, _s.set(1, 1, 1));
        const c = model.rig.center[i];
        _m.multiply(_m2.makeTranslation(-c.x, -c.y, -c.z));
        boneWorld[i].copy(_m);
      } else {
        // no body (severed/destroyed): keep relative to parent with bind offset
        _m.compose(model.rig.joint[i], bone.quaternion, _s.set(1, 1, 1));
        boneWorld[i].multiplyMatrices(parentWorld, _m);
      }
      _inv.copy(parentWorld).invert();
      _m.multiplyMatrices(_inv, boneWorld[i]);
      _m.decompose(bone.position, bone.quaternion, _s);
    }
    model.updateMatrices();
  }

  /**
   * Express the current ragdoll pose relative to a new root transform as a Pose
   * (used to blend from ragdoll into a get-up animation).
   */
  toPose(rootPos: THREE.Vector3, rootYaw: number, out: Pose): void {
    const model = this.model;
    const rootM = new THREE.Matrix4().compose(rootPos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rootYaw), new THREE.Vector3(1, 1, 1));
    const worlds: THREE.Matrix4[] = [];
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      const m = new THREE.Matrix4();
      if (b) {
        const t = b.translation();
        const r = b.rotation();
        m.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s.set(1, 1, 1));
        const c = model.rig.center[i];
        m.multiply(_m2.makeTranslation(-c.x, -c.y, -c.z));
      } else {
        const par = PARENT[i];
        m.multiplyMatrices(par < 0 ? rootM : worlds[par], _m.compose(model.rig.joint[i], _q.identity(), _s.set(1, 1, 1)));
      }
      worlds.push(m);
      const par = PARENT[i];
      const pw = par < 0 ? rootM : worlds[par];
      _m.multiplyMatrices(_inv.copy(pw).invert(), m);
      _m.decompose(_p, out.q[i], _s);
      out.has[i] = true;
      if (i === P.PELVIS) {
        out.root.copy(_p).sub(model.rig.joint[P.PELVIS]);
        out.hasRoot = true;
      }
    }
  }

  /** Orientation summary for choosing a get-up animation. */
  orientation(): { faceUp: boolean; headDir: THREE.Vector3; pelvis: THREE.Vector3 } {
    const tb = this.bodies[P.TORSO] ?? this.bodies[P.PELVIS]!;
    const r = tb.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const pb = this.bodies[P.PELVIS] ?? tb;
    const t = pb.translation();
    return { faceUp: fwd.y > 0, headDir: new THREE.Vector3(up.x, 0, up.z).normalize(), pelvis: new THREE.Vector3(t.x, t.y, t.z) };
  }

  /** Make the ragdoll static (performance) */
  freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    for (const b of this.bodies) if (b) b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  }

  unfreeze(): void {
    if (!this.frozen) return;
    this.frozen = false;
    for (const b of this.bodies) if (b) b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }

  dispose(): void {
    const { world } = ctx.physics;
    for (let i = 0; i < PART_COUNT; i++) {
      const j = this.joints[i];
      if (j) world.removeImpulseJoint(j, false);
      this.joints[i] = null;
    }
    for (let i = 0; i < PART_COUNT; i++) {
      const b = this.bodies[i];
      if (b) ctx.physics.removeBody(b);
      this.bodies[i] = null;
    }
  }
}
