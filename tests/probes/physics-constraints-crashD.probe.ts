// Isolates WASM crashes around motor setters (edit CASE and rerun; a crash kills the page).
import { Vector3, HingeConstraint, PhysicsConstraintAxis, PhysicsConstraintMotorType, PhysicsMotionType } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, newHavok } from "./physics-constraints-util.ts";

const CASE: string = "D";

export async function probe() {
  const hk = await newHavok();
  const w = await makeWorld(hk);
  const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
  const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
  const c = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
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
  return { CASE, log };
}
