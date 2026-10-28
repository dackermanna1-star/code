// Debug: (1) does motor type NONE really disable a position motor? (2) which disposal path leaks a Havok constraint?
import { Vector3, PhysicsConstraintAxis, PhysicsConstraintMotorType, type PhysicsBody, type PhysicsConstraint } from "@babylonjs/core";
import { makeWorld, body, staticBox, steps, counts, r, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

function door(w: World, z = 0, motor?: { target: number; maxForce: number }) {
  const P = w.physics;
  const frame = staticBox(w, new Vector3(-0.06, 1.0, z), new Vector3(0.1, 2.1, 0.12));
  const d = body(w, "door", new Vector3(0.45, 1.0, z), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.9, y: 2.0, z: 0.04 }, { density: 250 }));
  const c = P.hinge(frame, d, { pivotA: new Vector3(0.06, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: new Vector3(0, 1, 0), axisB: new Vector3(0, 1, 0), min: -1.7, max: 1.7, motor });
  return { frame, d, c };
}
function push(w: World, d: PhysicsBody, c: PhysicsConstraint, f: number, n: number) {
  for (let i = 0; i < n; i++) {
    const q = d.transformNode.rotationQuaternion!;
    d.applyForce(new Vector3(0, 0, 1).applyRotationQuaternion(q).scale(f), new Vector3(0.45, 0, 0).applyRotationQuaternion(q).add(d.transformNode.position));
    w.physics.step(1 / 60);
  }
  return w.physics.hingeAngle(c);
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const P_AX = PhysicsConstraintAxis.ANGULAR_X;
  for (const variant of ["noMotorEver", "typeNone", "typeNoneAndForce0", "force0Only", "typeVelocityZeroForce0", "recreate"]) {
    const w = await makeWorld();
    const P = w.physics;
    let { d, c } = door(w, 0, variant === "noMotorEver" ? undefined : { target: 0, maxForce: 30 });
    steps(w, 10);
    if (variant === "typeNone") P.plugin.setAxisMotorType(c, P_AX, PhysicsConstraintMotorType.NONE);
    if (variant === "typeNoneAndForce0") {
      P.plugin.setAxisMotorMaxForce(c, P_AX, 0);
      P.plugin.setAxisMotorType(c, P_AX, PhysicsConstraintMotorType.NONE);
    }
    if (variant === "force0Only") P.plugin.setAxisMotorMaxForce(c, P_AX, 0);
    if (variant === "typeVelocityZeroForce0") {
      P.plugin.setAxisMotorType(c, P_AX, PhysicsConstraintMotorType.VELOCITY);
      P.plugin.setAxisMotorTarget(c, P_AX, 0);
      P.plugin.setAxisMotorMaxForce(c, P_AX, 0);
    }
    if (variant === "recreate") {
      P.removeConstraint(c);
      c = P.hinge(w.scene.getTransformNodeByName("static")!.physicsBody!, d, { pivotA: new Vector3(0.06, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: new Vector3(0, 1, 0), axisB: new Vector3(0, 1, 0), min: -1.7, max: 1.7 });
    }
    const type = P.plugin.getAxisMotorType(c, P_AX);
    const mf = P.plugin.getAxisMotorMaxForce(c, P_AX);
    const ang = push(w, d, c, 20, 60);
    out["motor_" + variant] = { angleAfter1sAt18Nm: r(ang, 3), motorType: type, maxForce: mf };
    w.dispose();
  }

  // (2) constraint leak per disposal path
  {
    const w = await makeWorld();
    const P = w.physics;
    const stat = () => P.hk.HP_GetStatistics()[1][2];
    const res: Record<string, number> = { base: stat() };
    const a = door(w, 0);
    res.afterDoorA = stat();
    P.removeConstraint(a.c);
    res.afterRemoveConstraint = stat();
    const b = door(w, 2);
    res.afterDoorB = stat();
    P.disposeBody(b.d);
    res.afterDisposeBodyB = stat();
    const c = door(w, 4);
    res.afterDoorC = stat();
    c.d.transformNode.dispose();
    res.afterNodeDisposeC = stat();
    const dr = body(w, "dr", new Vector3(4, 1, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.3, y: 0.3, z: 0.3 }, { density: 100 }));
    P.slider(P.worldBody, dr, { pivotA: new Vector3(4, 1, 0), pivotB: new Vector3(0, 0, 0), axisA: new Vector3(1, 0, 0), axisB: new Vector3(1, 0, 0), min: -0.2, max: 0.2 });
    res.afterSlider = stat();
    dr.transformNode.dispose();
    res.afterNodeDisposeSlider = stat();
    const e = door(w, 6);
    res.afterDoorE = stat();
    e.c.dispose();
    res.afterRawDisposeE = stat();
    steps(w, 5);
    res.afterSteps = stat();
    out.constraintCounts = res;
    out.counts = counts(w);
    w.dispose();
  }
  return out;
}
