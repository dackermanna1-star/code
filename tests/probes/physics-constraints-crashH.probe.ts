// Isolates WASM crashes around motor setters (edit CASE and rerun; a crash kills the page).
import { Vector3, HingeConstraint, Physics6DoFConstraint, PhysicsConstraintAxis, PhysicsConstraintMotorType, PhysicsMotionType, type PhysicsConstraint } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, newHavok } from "./physics-constraints-util.ts";

const CASE: string = "H";

export async function probe() {
  const hk = await newHavok();
  const w = await makeWorld(hk);
  const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
  const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
  let c: PhysicsConstraint;
  if (CASE >= "G") {
    const DEG = Math.PI / 180, Y = Vector3.Up(), X = new Vector3(1, 0, 0);
    c = new Physics6DoFConstraint({ pivotA: new Vector3(0.05, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: Y, axisB: Y, perpAxisA: X, perpAxisB: X }, [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -100 * DEG, maxLimit: 100 * DEG },
    ], w.scene);
  } else c = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
  frame.addConstraint(door, c);
  const p = w.plugin, A = PhysicsConstraintAxis.ANGULAR_X;
  const log: string[] = [];
  const step = (s: string, f: () => void) => { console.log(s); f(); log.push(s); };
  if (CASE === "A") { // maxForce while motor type was never set (NONE)
    step("setMaxForce(0) on NONE", () => p.setAxisMotorMaxForce(c, A, 0));
    step("step", () => stepN(w.scene, 2));
  } else if (CASE === "B") { // POSITION -> NONE -> maxForce(0)
    step("POSITION", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.POSITION));
    step("maxForce 30", () => p.setAxisMotorMaxForce(c, A, 30));
    step("step", () => stepN(w.scene, 2));
    step("NONE", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE));
    step("maxForce 0", () => p.setAxisMotorMaxForce(c, A, 0));
    step("step", () => stepN(w.scene, 2));
  } else if (CASE === "C") { // NONE -> setMaxForce(5)
    step("setMaxForce(5) on NONE", () => p.setAxisMotorMaxForce(c, A, 5));
    step("step", () => stepN(w.scene, 2));
  } else if (CASE === "D") { // NONE -> target
    step("setTarget on NONE", () => p.setAxisMotorTarget(c, A, 0.3));
    step("step", () => stepN(w.scene, 2));
  } else if (CASE === "E") { // read maxForce on NONE
    step("getMaxForce on NONE", () => log.push(String(p.getAxisMotorMaxForce(c, A))));
    step("step", () => stepN(w.scene, 2));
  } else if (CASE === "F") { // POSITION -> NONE -> get max force
    step("POSITION", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.POSITION));
    step("maxForce 30", () => p.setAxisMotorMaxForce(c, A, 30));
    step("NONE", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE));
    step("getMaxForce", () => log.push(String(p.getAxisMotorMaxForce(c, A))));
    step("step", () => stepN(w.scene, 2));
  }
  else if (CASE === "G") { // 6dof limited + POSITION -> step -> NONE -> maxForce 0
    step("POSITION", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.POSITION));
    step("target 0", () => p.setAxisMotorTarget(c, A, 0));
    step("maxForce 30", () => p.setAxisMotorMaxForce(c, A, 30));
    step("step10", () => stepN(w.scene, 10));
    step("NONE", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE));
    step("maxForce 0", () => p.setAxisMotorMaxForce(c, A, 0));
    step("step", () => stepN(w.scene, 60));
  } else if (CASE === "H") { // 6dof limited + NONE + maxForce 0 (never POSITION)
    step("NONE", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE));
    step("maxForce 0", () => p.setAxisMotorMaxForce(c, A, 0));
    step("step", () => stepN(w.scene, 60));
  } else if (CASE === "I") { // 6dof limited + POSITION -> step -> maxForce0 -> NONE
    step("POSITION", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.POSITION));
    step("target 0", () => p.setAxisMotorTarget(c, A, 0));
    step("maxForce 30", () => p.setAxisMotorMaxForce(c, A, 30));
    step("step10", () => stepN(w.scene, 10));
    step("maxForce 0", () => p.setAxisMotorMaxForce(c, A, 0));
    step("NONE", () => p.setAxisMotorType(c, A, PhysicsConstraintMotorType.NONE));
    step("step", () => stepN(w.scene, 60));
  }
  return { CASE, log };
}
