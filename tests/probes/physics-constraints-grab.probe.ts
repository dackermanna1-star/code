// Grab/hold mechanic: (i) 6DoF motors to an ANIMATED anchor vs (ii) manual velocity controller with force cap.
import {
  Vector3,
  Quaternion,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsActivationControl,
  PhysicsBody,
  PhysicsShapeSphere,
  TransformNode,
  type Observer,
  type Scene,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, appliedImpulses, r3, v3, newHavok, type CWorld } from "./physics-constraints-util.ts";

const DT = 1 / 60;
const G = 9.81;
type Method = "motor3" | "motorDist" | "velctl";
type Scenario = "lift" | "swing" | "wall" | "heavyDrag";

interface Grabber { update(target: Vector3): void; force(): Vector3; dispose(): void }

/** (i) 6DoF constraint with POSITION motors from an ANIMATED anchor body to the object. */
function motorGrab(w: CWorld, obj: PhysicsBody, grabLocal: Vector3, fmax: number, isotropic: boolean, tmax: number): Grabber {
  const node = new TransformNode("anchor", w.scene);
  node.position.copyFrom(localToWorld(obj, grabLocal));
  node.rotationQuaternion = Quaternion.Identity();
  node.computeWorldMatrix(true);
  const anchor = new PhysicsBody(node, PhysicsMotionType.ANIMATED, false, w.scene);
  const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, w.scene);
  s.filterMembershipMask = 0; s.filterCollideMask = 0; // collides with nothing
  anchor.shape = s;
  // orientation of the object relative to the anchor at grab time is kept by the angular motors
  const qRel = Quaternion.Inverse(node.rotationQuaternion).multiply(obj.transformNode.rotationQuaternion!);
  const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);
  const c = new Physics6DoFConstraint({
    pivotA: Vector3.Zero(), pivotB: grabLocal,
    axisA: X, perpAxisA: Y,
    axisB: X.applyRotationQuaternion(Quaternion.Inverse(qRel)), perpAxisB: Y.applyRotationQuaternion(Quaternion.Inverse(qRel)),
  }, [], w.scene);
  anchor.addConstraint(obj, c);
  const lin = isotropic ? [PhysicsConstraintAxis.LINEAR_DISTANCE] : [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z];
  for (const ax of lin) {
    c.setAxisMotorType(ax, PhysicsConstraintMotorType.POSITION);
    c.setAxisMotorTarget(ax, 0);
    c.setAxisMotorMaxForce(ax, fmax);
  }
  if (tmax > 0) for (const ax of [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z]) {
    c.setAxisMotorType(ax, PhysicsConstraintMotorType.POSITION);
    c.setAxisMotorTarget(ax, 0);
    c.setAxisMotorMaxForce(ax, tmax);
  }
  const q = Quaternion.Identity();
  return {
    update(target: Vector3) { anchor.setTargetTransform(target, q); },
    force() { return appliedImpulses(w.hk, c).lin.scale(1 / DT); }, // force ON the object (N)
    dispose() { c.dispose(); anchor.dispose(); s.dispose(); node.dispose(); },
  };
}

/** (ii) manual velocity controller: drives the grab point toward the target with a capped impulse each step. */
function velGrab(obj: PhysicsBody, grabLocal: Vector3, fmax: number, tau: number, tmaxDamp: number): Grabber {
  const last = new Vector3();
  const prevTarget = new Vector3(NaN, 0, 0);
  const tmpV = new Vector3(), tmpW = new Vector3();
  obj.setAngularDamping(tmaxDamp);
  return {
    update(target: Vector3) {
      const m = obj.getMassProperties().mass ?? 1;
      const p = localToWorld(obj, grabLocal);
      const vT = Number.isNaN(prevTarget.x) ? Vector3.Zero() : target.subtract(prevTarget).scaleInPlace(1 / DT);
      prevTarget.copyFrom(target);
      obj.getLinearVelocityToRef(tmpV);
      obj.getAngularVelocityToRef(tmpW);
      const com = localToWorld(obj, obj.getMassProperties().centerOfMass ?? Vector3.Zero());
      const vPoint = tmpV.add(Vector3.Cross(tmpW, p.subtract(com))); // velocity of the grab point
      const vDes = target.subtract(p).scaleInPlace(1 / tau).addInPlace(vT);
      // impulse so that after this step (gravity included) the grab point moves at vDes
      const J = vDes.subtract(vPoint).scaleInPlace(m).addInPlace(new Vector3(0, m * G * DT, 0));
      const jmax = fmax * DT;
      const len = J.length();
      if (len > jmax) J.scaleInPlace(jmax / len);
      obj.applyImpulse(J, p);
      last.copyFrom(J).scaleInPlace(1 / DT);
    },
    force() { return last.clone(); },
    dispose() { /* nothing */ },
  };
}

function targetAt(sc: Scenario, i: number, start: Vector3): Vector3 {
  const hold = new Vector3(0, 1.2, 1.5);
  if (sc === "lift") return hold;
  if (sc === "heavyDrag") return new Vector3(1.2, 1.0, 1.5);
  if (sc === "wall") return i < 60 ? hold : new Vector3(0, 1.2, 3.0); // wall face at z = 2.4
  // swing: 90 deg yaw around the player at the origin in 0.25 s after 1 s of holding, then hold
  const t = Math.min(Math.max((i - 60) / 15, 0), 1);
  const a = (t * Math.PI) / 2;
  return new Vector3(1.5 * Math.sin(a), 1.2, 1.5 * Math.cos(a));
}

async function run(method: Method, mass: number, sc: Scenario, grabOffset: boolean) {
  const w = await makeWorld(await newHavok());
  makeBox(w.scene, "floor", new Vector3(20, 0.2, 20), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC, friction: 0.5 });
  makeBox(w.scene, "wall", new Vector3(6, 3, 0.2), new Vector3(0, 1.5, 2.5), { motion: PhysicsMotionType.STATIC, friction: 0.5 });
  const size = mass <= 1 ? 0.2 : mass <= 30 ? 0.4 : 0.6;
  const obj = makeBox(w.scene, "obj", new Vector3(size, size, size), new Vector3(0, size / 2, 1.5), { mass, friction: sc === "heavyDrag" ? 0.3 : 0.5 });
  w.plugin.setActivationControl(obj, PhysicsActivationControl.ALWAYS_ACTIVE);
  stepN(w.scene, 5);
  const grabLocal = grabOffset ? new Vector3(size / 2, size / 2, 0) : Vector3.Zero();
  const FMAX = 450;
  const g: Grabber = method === "velctl" ? velGrab(obj, grabLocal, FMAX, 0.1, 3) : motorGrab(w, obj, grabLocal, FMAX, method === "motorDist", grabOffset ? 0 : 60);
  if (method !== "velctl") obj.setAngularDamping(grabOffset ? 3 : 0.1);
  const start = localToWorld(obj, grabLocal);
  let i = 0;
  const target = new Vector3();
  const obs: Observer<Scene> = w.scene.onBeforePhysicsObservable.add(() => { target.copyFrom(targetAt(sc, i, start)); g.update(target); i++; });
  const N = sc === "wall" || sc === "swing" ? 150 : 120;
  const errs: number[] = [], forces: number[] = [], pts: Vector3[] = [], speeds: number[] = [];
  let reach = -1, wallPen = -1;
  for (let k = 0; k < N; k++) {
    stepN(w.scene, 1);
    const p = localToWorld(obj, grabLocal);
    const e = p.subtract(target).length();
    errs.push(e); forces.push(g.force().length()); pts.push(p); speeds.push(obj.getLinearVelocity().length());
    if (reach < 0 && e < 0.05) reach = k;
    if (sc === "wall") {
      // deepest point of the box into the wall face (z = 2.4)
      let maxZ = -1e9;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) maxZ = Math.max(maxZ, localToWorld(obj, new Vector3(sx * size / 2, sy * size / 2, sz * size / 2)).z);
      wallPen = Math.max(wallPen, maxZ - 2.4);
    }
  }
  w.scene.onBeforePhysicsObservable.remove(obs);
  const tail = pts.slice(-30);
  const mean = tail.reduce((a, b) => a.add(b), Vector3.Zero()).scale(1 / tail.length);
  const jitter = Math.sqrt(tail.reduce((acc, b) => acc + Vector3.DistanceSquared(b, mean), 0) / tail.length);
  const tailSpeed = Math.max(...speeds.slice(-30));
  const res = {
    reachStep: reach,
    finalErrCm: r3(errs[errs.length - 1] * 100),
    maxErrAfterReachCm: reach >= 0 ? r3(Math.max(...errs.slice(reach)) * 100) : null,
    jitterMm: r3(jitter * 1000),
    maxTailSpeed: r3(tailSpeed),
    maxForceN: r3(Math.max(...forces)),
    finalForceN: r3(forces[forces.length - 1]),
    finalPos: v3(obj.transformNode.position),
    wallPenMm: sc === "wall" ? r3(wallPen * 1000) : undefined,
    maxErrDuringSwingCm: sc === "swing" ? r3(Math.max(...errs.slice(60, 90)) * 100) : undefined,
    settleAfterSwing: sc === "swing" ? errs.slice(75).findIndex((e) => e < 0.02) : undefined,
  };
  g.dispose();
  w.dispose();
  return res;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const t0 = performance.now();
  for (const method of ["motor3", "motorDist", "velctl"] as Method[]) {
    for (const mass of [1, 30]) {
      for (const sc of ["lift", "swing", "wall"] as Scenario[]) {
        out[`${method}_${mass}kg_${sc}`] = await run(method, mass, sc, false);
      }
    }
    out[`${method}_100kg_heavyDrag`] = await run(method, 100, "heavyDrag", false);
    out[`${method}_30kg_lift_offsetGrab`] = await run(method, 30, "lift", true);
    out[`${method}_1kg_wall_offsetGrab`] = await run(method, 1, "wall", true);
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}
