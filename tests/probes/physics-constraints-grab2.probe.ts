// Grab v2: persistent joint re-pointed with raw HP_Constraint_SetChildBody (no churn), POSITION vs raw SPRING motors,
// anisotropic caps (lift vs push), angular motor targets (rotate held object), pulling a hinged door / a static body,
// improved velocity controller (gravity-first budget).
import {
  Vector3,
  Quaternion,
  Physics6DoFConstraint,
  HingeConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsActivationControl,
  PhysicsBody,
  PhysicsShapeSphere,
  TransformNode,
  type Scene,
  type Observer,
} from "@babylonjs/core";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, jointId, hkStats, r3, v3, deg, newHavok, type CWorld } from "./physics-constraints-util.ts";

const DT = 1 / 60;
const LIN = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z];
const ANG = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z];
type MotorKind = "position" | "springAccel";

/** Persistent grab joint: one ANIMATED anchor + one 6DoF constraint created once, re-pointed at whatever is grabbed. */
class GrabJoint {
  readonly anchor: PhysicsBody;
  readonly dummy: PhysicsBody;
  readonly c: Physics6DoFConstraint;
  private readonly hk: HavokPhysicsWithBindings;
  private readonly rot = Quaternion.Identity();
  held: PhysicsBody | null = null;
  constructor(w: CWorld, kind: MotorKind, liftN: number, pushN: number, torqueNm: number) {
    this.hk = w.hk;
    const mk = (name: string, motion: PhysicsMotionType) => {
      const n = new TransformNode(name, w.scene);
      n.position.set(0, -50, 0); n.rotationQuaternion = Quaternion.Identity(); n.computeWorldMatrix(true);
      const b = new PhysicsBody(n, motion, false, w.scene);
      const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, w.scene);
      s.filterMembershipMask = 0; s.filterCollideMask = 0;
      b.shape = s;
      return b;
    };
    this.anchor = mk("grabAnchor", PhysicsMotionType.ANIMATED);
    this.dummy = mk("grabDummy", PhysicsMotionType.DYNAMIC);
    this.dummy.setGravityFactor(0);
    this.c = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB: Vector3.Zero(), axisA: new Vector3(1, 0, 0), perpAxisA: new Vector3(0, 1, 0), axisB: new Vector3(1, 0, 0), perpAxisB: new Vector3(0, 1, 0) }, [], w.scene);
    this.anchor.addConstraint(this.dummy, this.c);
    const id = jointId(this.c), hk = this.hk;
    const caps = [pushN, liftN, pushN]; // anchor frame: X, Y (up), Z
    LIN.forEach((ax, i) => {
      if (kind === "position") {
        this.c.setAxisMotorType(ax, PhysicsConstraintMotorType.POSITION);
        this.c.setAxisMotorTarget(ax, 0);
      } else {
        const nat = [hk.ConstraintAxis.LINEAR_X, hk.ConstraintAxis.LINEAR_Y, hk.ConstraintAxis.LINEAR_Z][i];
        hk.HP_Constraint_SetAxisMotorType(id, nat, hk.ConstraintMotorType.SPRING_ACCELERATION);
        hk.HP_Constraint_SetAxisMotorPositionTarget(id, nat, 0);
        hk.HP_Constraint_SetAxisMotorVelocityTarget(id, nat, 0);
        const omega = 2 * Math.PI * 3; // 3 Hz
        hk.HP_Constraint_SetAxisMotorStiffness(id, nat, omega * omega);
        hk.HP_Constraint_SetAxisMotorDamping(id, nat, 2 * 1.0 * omega);
      }
      this.c.setAxisMotorMaxForce(ax, caps[i]);
    });
    for (const ax of ANG) {
      this.c.setAxisMotorType(ax, PhysicsConstraintMotorType.POSITION);
      this.c.setAxisMotorTarget(ax, 0);
      this.c.setAxisMotorMaxForce(ax, torqueNm);
    }
    this.c.isEnabled = false;
  }
  /** Attach to `body` at world point `p` keeping the body's current orientation relative to the anchor rotation `rot`. */
  grab(body: PhysicsBody, p: Vector3, rot: Quaternion) {
    const hk = this.hk, id = jointId(this.c);
    const n = body.transformNode;
    const inv = Quaternion.Inverse(n.rotationQuaternion!);
    const pivotB = p.subtract(n.position).applyRotationQuaternion(inv);
    // child frame axes = anchor axes expressed in the body's local frame at grab time
    const ax = new Vector3(1, 0, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    const ay = new Vector3(0, 1, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    // put the anchor exactly at the grab point first (teleport), then re-point the joint
    this.anchor.transformNode.position.copyFrom(p);
    this.anchor.transformNode.rotationQuaternion!.copyFrom(rot);
    hk.HP_Body_SetQTransform(this.anchor._pluginData.hpBodyId, [[p.x, p.y, p.z], [rot.x, rot.y, rot.z, rot.w]]);
    hk.HP_Constraint_SetChildBody(id, body._pluginData.hpBodyId);
    hk.HP_Constraint_SetAnchorInChild(id, [pivotB.x, pivotB.y, pivotB.z], [ax.x, ax.y, ax.z], [ay.x, ay.y, ay.z]);
    this.c.isEnabled = true;
    this.held = body;
  }
  release() {
    this.c.isEnabled = false;
    this.hk.HP_Constraint_SetChildBody(jointId(this.c), this.dummy._pluginData.hpBodyId);
    this.held = null;
  }
  /** Call every fixed step before the physics step. */
  update(target: Vector3, rot?: Quaternion) { this.anchor.setTargetTransform(target, rot ?? this.rot); }
  /** Force the joint applied to the held body during the last step (world, N). */
  force(): Vector3 { return appliedImpulses(this.hk, this.c).lin.scale(1 / DT); }
}

interface Track { reach: number; finalErrCm: number; maxErrAfterReachCm: number | null; jitterMm: number; maxForce: number; finalForce: number; extra?: Record<string, unknown> }

function trackRun(w: CWorld, obj: PhysicsBody, grabLocal: Vector3, n: number, targetAt: (i: number) => Vector3, update: (t: Vector3) => void, force: () => Vector3): Track {
  let i = 0;
  const target = new Vector3();
  const obs: Observer<Scene> = w.scene.onBeforePhysicsObservable.add(() => { target.copyFrom(targetAt(i)); update(target); i++; });
  const errs: number[] = [], forces: number[] = [], pts: Vector3[] = [];
  let reach = -1;
  for (let k = 0; k < n; k++) {
    stepN(w.scene, 1);
    const p = localToWorld(obj, grabLocal);
    const e = p.subtract(target).length();
    errs.push(e); forces.push(force().length()); pts.push(p);
    if (reach < 0 && e < 0.05) reach = k;
  }
  w.scene.onBeforePhysicsObservable.remove(obs);
  const tail = pts.slice(-30);
  const mean = tail.reduce((a, b) => a.add(b), Vector3.Zero()).scale(1 / tail.length);
  const jitter = Math.sqrt(tail.reduce((acc, b) => acc + Vector3.DistanceSquared(b, mean), 0) / tail.length);
  return { reach, finalErrCm: r3(errs[errs.length - 1] * 100), maxErrAfterReachCm: reach >= 0 ? r3(Math.max(...errs.slice(reach)) * 100) : null, jitterMm: r3(jitter * 1000), maxForce: r3(Math.max(...forces)), finalForce: r3(forces[forces.length - 1]) };
}

async function scene0(): Promise<CWorld> {
  const w = await makeWorld(await newHavok());
  makeBox(w.scene, "floor", new Vector3(20, 0.2, 20), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
  makeBox(w.scene, "wall", new Vector3(6, 3, 0.2), new Vector3(0, 1.5, 2.5), { motion: PhysicsMotionType.STATIC });
  return w;
}

const hold = new Vector3(0, 1.2, 1.5);
const swing = (i: number) => { const t = Math.min(Math.max((i - 60) / 15, 0), 1), a = t * Math.PI / 2; return new Vector3(1.5 * Math.sin(a), 1.2, 1.5 * Math.cos(a)); };
const wall = (i: number) => (i < 60 ? hold : new Vector3(0, 1.2, 3.0));

export async function probe() {
  const out: Record<string, unknown> = {};

  // A+B+C: persistent joint, position vs spring motors, lift 450 / push 300
  for (const kind of ["position", "springAccel"] as MotorKind[]) {
    for (const mass of [1, 30, 60]) {
      for (const [scName, fn, n] of [["lift", () => hold, 120], ["swing", swing, 150], ["wall", wall, 150]] as [string, (i: number) => Vector3, number][]) {
        const w = await scene0();
        const size = mass <= 1 ? 0.2 : 0.4;
        const obj = makeBox(w.scene, "obj", new Vector3(size, size, size), new Vector3(0, size / 2, 1.5), { mass });
        w.plugin.setActivationControl(obj, PhysicsActivationControl.ALWAYS_ACTIVE);
        stepN(w.scene, 5);
        const g = new GrabJoint(w, kind, 450, 300, 60);
        g.grab(obj, localToWorld(obj, Vector3.Zero()), Quaternion.Identity());
        const tr = trackRun(w, obj, Vector3.Zero(), n, fn, (t) => g.update(t), () => g.force());
        let wallPen: number | undefined;
        if (scName === "wall") { let maxZ = -1e9; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) maxZ = Math.max(maxZ, localToWorld(obj, new Vector3(sx * size / 2, sy * size / 2, sz * size / 2)).z); wallPen = r3((maxZ - 2.4) * 1000); }
        out[`${kind}_${mass}kg_${scName}`] = { ...tr, finalPos: v3(obj.transformNode.position), wallPenMm: wallPen };
        w.dispose();
      }
    }
  }

  // re-pointing: grab A, release, grab B; constraint count stays constant; A falls after release
  {
    const w = await scene0();
    const a = makeBox(w.scene, "A", new Vector3(0.3, 0.3, 0.3), new Vector3(-1, 0.15, 1.5), { mass: 5 });
    const b = makeBox(w.scene, "B", new Vector3(0.3, 0.3, 0.3), new Vector3(1, 0.15, 1.5), { mass: 5 });
    const g = new GrabJoint(w, "position", 450, 300, 60);
    const c0 = hkStats(w.hk).constraints;
    let target = new Vector3(-1, 1.2, 1.5);
    const obs = w.scene.onBeforePhysicsObservable.add(() => g.update(target));
    g.grab(a, a.transformNode.position.clone(), Quaternion.Identity());
    stepN(w.scene, 60);
    const aHeld = a.transformNode.position.y;
    g.release();
    stepN(w.scene, 60);
    const aDropped = a.transformNode.position.y;
    target = new Vector3(1, 1.0, 1.5);
    g.grab(b, b.transformNode.position.add(new Vector3(0.15, 0.15, 0)), Quaternion.Identity()); // corner grab: hangs
    b.setAngularDamping(2);
    stepN(w.scene, 120);
    w.scene.onBeforePhysicsObservable.remove(obs);
    out.repoint = { aHeldY: r3(aHeld), aAfterReleaseY: r3(aDropped), bGrabPointY: r3(localToWorld(b, new Vector3(0.15, 0.15, 0)).y), bComY: r3(b.transformNode.position.y), constraintsBefore: c0, constraintsAfter: hkStats(w.hk).constraints, bodies: g.c.getBodiesUsingConstraint().map((p) => p.childBody.transformNode.name) };
    w.dispose();
  }

  // D: angular targets — rotate the held object relative to the anchor
  {
    const w = await makeWorld(await newHavok());
    const obj = makeBox(w.scene, "obj", new Vector3(0.4, 0.1, 0.2), new Vector3(0, 1.2, 1.5), { mass: 2 });
    w.plugin.setActivationControl(obj, PhysicsActivationControl.ALWAYS_ACTIVE);
    const g = new GrabJoint(w, "position", 450, 300, 60);
    g.grab(obj, obj.transformNode.position.clone(), Quaternion.Identity());
    const obs = w.scene.onBeforePhysicsObservable.add(() => g.update(hold));
    const res: Record<string, unknown> = {};
    for (const [name, ax] of [["ANGULAR_X", PhysicsConstraintAxis.ANGULAR_X], ["ANGULAR_Y", PhysicsConstraintAxis.ANGULAR_Y], ["ANGULAR_Z", PhysicsConstraintAxis.ANGULAR_Z]] as [string, PhysicsConstraintAxis][]) {
      g.c.setAxisMotorTarget(ax, 0.5);
      stepN(w.scene, 60);
      const q = obj.transformNode.rotationQuaternion!;
      const e = q.toEulerAngles();
      res[name] = { euler: v3(e), xAxis: v3(new Vector3(1, 0, 0).applyRotationQuaternion(q)), yAxis: v3(new Vector3(0, 1, 0).applyRotationQuaternion(q)) };
      g.c.setAxisMotorTarget(ax, 0);
      stepN(w.scene, 60);
    }
    // combined yaw 0.6 + pitch 0.3
    g.c.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, 0.6);
    g.c.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0.3);
    stepN(w.scene, 60);
    res.yaw06pitch03 = { euler: v3(obj.transformNode.rotationQuaternion!.toEulerAngles()) };
    // anchor yaw (camera turn) by 90 deg: object follows orientation?
    g.c.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, 0);
    g.c.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
    w.scene.onBeforePhysicsObservable.remove(obs);
    const yaw = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
    const obs2 = w.scene.onBeforePhysicsObservable.add(() => g.update(hold, yaw));
    stepN(w.scene, 90);
    w.scene.onBeforePhysicsObservable.remove(obs2);
    res.anchorYaw90 = { euler: v3(obj.transformNode.rotationQuaternion!.toEulerAngles()) };
    out.angularTargets = res;
    w.dispose();
  }

  // E: pulling a hinged door and a static body with the grab joint
  {
    const w = await makeWorld(await newHavok());
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
    const h = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
    frame.addConstraint(door, h);
    const g = new GrabJoint(w, "position", 450, 300, 0);
    const grabP = localToWorld(door, new Vector3(0.4, 0, -0.02));
    g.grab(door, grabP, Quaternion.Identity());
    const target = grabP.add(new Vector3(0, 0, -1.0)); // pull towards the player (-Z) by 1 m
    const obs = w.scene.onBeforePhysicsObservable.add(() => g.update(target));
    const angles: number[] = [], forces: number[] = [], hingeLoads: number[] = [];
    for (let k = 0; k < 60; k++) { stepN(w.scene, 1); if (k % 10 === 9) { angles.push(deg(relAngle(frame, door, Vector3.Up(), new Vector3(1, 0, 0)))); forces.push(r3(g.force().length())); hingeLoads.push(r3(appliedImpulses(w.hk, h).lin.length() * 60)); } }
    w.scene.onBeforePhysicsObservable.remove(obs);
    g.release();
    // static body: anchor pulled 1 m away from a point on a static box
    const wallBox = makeBox(w.scene, "cabinet", new Vector3(0.6, 0.6, 0.3), new Vector3(3, 1.5, 0), { motion: PhysicsMotionType.STATIC });
    const sp = new Vector3(3, 1.5, -0.15);
    g.grab(wallBox, sp, Quaternion.Identity());
    const t2 = sp.add(new Vector3(0, 0, -1));
    const obs2 = w.scene.onBeforePhysicsObservable.add(() => g.update(t2));
    stepN(w.scene, 30);
    w.scene.onBeforePhysicsObservable.remove(obs2);
    out.pull = { doorAngleEvery10: angles, grabForceN: forces, hingeLoadN: hingeLoads, staticBodyGrabForceN: r3(g.force().length()), anchorPos: v3(g.anchor.transformNode.position) };
    w.dispose();
  }
  return out;
}
