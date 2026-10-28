// Motor release semantics on a hinge door: which call really frees the axis?
import {
  Vector3,
  Physics6DoFConstraint,
  HingeConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  type PhysicsConstraint,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, DEG, r3, deg, newHavok, jointId } from "./physics-constraints-util.ts";

const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);
const FRESH: boolean = true;

export async function probe() {
  const out: Record<string, unknown> = {};
  const hk = await newHavok();
  type Variant = "noMotorEver" | "maxForce0" | "typeNONE" | "typeNONE_maxForce0" | "velocity0_maxForce0" | "maxForce0_thenNONE" | "hingeClass_noMotor" | "typeNONE_neverPosition";
  const variants: Variant[] = ["noMotorEver", "maxForce0", "typeNONE", "typeNONE_maxForce0", "velocity0_maxForce0", "maxForce0_thenNONE", "hingeClass_noMotor", "typeNONE_neverPosition"];
  for (const v of variants) {
    const row: Record<string, unknown> = { v };
    console.log("variant " + v);
    for (const push of [5, 100]) {
      const w = await makeWorld(FRESH ? await newHavok() : hk);
      console.log("   world");
      const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
      const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
      door.setAngularDamping(0);
      console.log("   bodies");
      let c: PhysicsConstraint;
      if (v === "hingeClass_noMotor") {
        c = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Y, Y, w.scene);
        frame.addConstraint(door, c);
      } else {
        c = new Physics6DoFConstraint({ pivotA: new Vector3(0.05, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: Y, axisB: Y, perpAxisA: X, perpAxisB: X }, [
          { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
          { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -100 * DEG, maxLimit: 100 * DEG },
        ], w.scene);
        frame.addConstraint(door, c);
      }
      const p = w.plugin;
      const A = PhysicsConstraintAxis.ANGULAR_X;
      console.log("   constraint");
      if (v !== "noMotorEver" && v !== "hingeClass_noMotor" && v !== "typeNONE_neverPosition") {
        p.setAxisMotorType(c, A, PhysicsConstraintMotorType.POSITION);
        p.setAxisMotorTarget(c, A, 0);
        p.setAxisMotorMaxForce(c, A, 30);
      }
      console.log("   motor set");
      stepN(w.scene, 10);
      console.log("   stepped");
      if (v === "maxForce0") p.setAxisMotorMaxForce(c, A, 0);
      if (v === "typeNONE") p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE);
      if (v === "typeNONE_maxForce0") { p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE); p.setAxisMotorMaxForce(c, A, 0); }
      if (v === "velocity0_maxForce0") { p.setAxisMotorType(c, A, PhysicsConstraintMotorType.VELOCITY); p.setAxisMotorTarget(c, A, 0); p.setAxisMotorMaxForce(c, A, 0); }
      if (v === "maxForce0_thenNONE") { p.setAxisMotorMaxForce(c, A, 0); p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE); }
      if (v === "typeNONE_neverPosition") p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE);
      console.log("  push " + push + " before raw");
      const id = jointId(c);
      const H = w.hk;
      const raw = {
        type: (H.HP_Constraint_GetAxisMotorType(id, H.ConstraintAxis.ANGULAR_X)[1] as unknown as { value: number }).value,
        maxF: r3(H.HP_Constraint_GetAxisMotorMaxForce(id, H.ConstraintAxis.ANGULAR_X)[1]),
        mode: p.getAxisMode(c, A),
      };
      const obs = w.scene.onBeforePhysicsObservable.add(() => door.applyForce(new Vector3(0, 0, push), localToWorld(door, new Vector3(0.45, 0, 0))));
      stepN(w.scene, push > 50 ? 15 : 60);
      w.scene.onBeforePhysicsObservable.remove(obs);
      const imp = appliedImpulses(w.hk, c);
      row[`push${push}N`] = { angleDeg: deg(relAngle(frame, door, Y, X)), omega: r3(door.getAngularVelocity().y), angImpY: r3(imp.ang.y), raw };
      w.dispose();
    }
    out[v] = row;
  }
  out.expectFree5N = "free door, 4.5 N*m on I=5.40 for 1 s -> 0.417 rad = 23.9 deg (minus friction-less baseline); 100 N (90 N*m) for 0.25 s -> 0.52 rad = 30 deg";
  return out;
}
