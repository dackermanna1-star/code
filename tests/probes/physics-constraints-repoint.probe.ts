// Can an existing Havok constraint be re-pointed to another child body (avoid create/dispose churn)?
import { Vector3, Quaternion, Physics6DoFConstraint, PhysicsConstraintAxis, PhysicsConstraintMotorType, PhysicsMotionType, PhysicsBody, PhysicsShapeSphere, TransformNode } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, jointId, appliedImpulses, r3, newHavok } from "./physics-constraints-util.ts";

type V = "disabledThenEnable" | "whileEnabled" | "reSetParentAndAnchors" | "toggleTwice" | "freshConstraintControl" | "disposeAndCreate";

export async function probe() {
  const out: Record<string, unknown> = {};
  for (const v of ["freshConstraintControl", "disabledThenEnable", "whileEnabled", "reSetParentAndAnchors", "toggleTwice"] as V[]) {
    const w = await makeWorld(await newHavok());
    const hk = w.hk;
    const mkB = (name: string, motion: PhysicsMotionType, pos: Vector3) => {
      const n = new TransformNode(name, w.scene); n.position.copyFrom(pos); n.rotationQuaternion = Quaternion.Identity(); n.computeWorldMatrix(true);
      const b = new PhysicsBody(n, motion, false, w.scene);
      const s = new PhysicsShapeSphere(Vector3.Zero(), 0.05, w.scene); s.filterMembershipMask = 0; s.filterCollideMask = 0; b.shape = s; return b;
    };
    const anchor = mkB("anchor", PhysicsMotionType.ANIMATED, new Vector3(0, 2, 0));
    const dummy = mkB("dummy", PhysicsMotionType.DYNAMIC, new Vector3(0, 2, 0));
    dummy.setGravityFactor(0);
    const obj = makeBox(w.scene, "obj", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 1, 0), { mass: 2 }); // hangs 1 m below the anchor, falls if not held
    const c = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB: Vector3.Zero() }, [], w.scene);
    if (v === "freshConstraintControl") anchor.addConstraint(obj, c); else anchor.addConstraint(dummy, c);
    for (const ax of [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z]) {
      c.setAxisMotorType(ax, PhysicsConstraintMotorType.POSITION); c.setAxisMotorTarget(ax, 0); c.setAxisMotorMaxForce(ax, 200);
    }
    const id = jointId(c);
    const objId = obj._pluginData.hpBodyId, anchorId = anchor._pluginData.hpBodyId;
    const results: string[] = [];
    const r = (x: unknown) => results.push(String((x as { value?: number })?.value ?? x));
    if (v === "disabledThenEnable") { c.isEnabled = false; r(hk.HP_Constraint_SetChildBody(id, objId)); c.isEnabled = true; }
    if (v === "whileEnabled") { r(hk.HP_Constraint_SetChildBody(id, objId)); }
    if (v === "reSetParentAndAnchors") {
      c.isEnabled = false;
      r(hk.HP_Constraint_SetParentBody(id, anchorId));
      r(hk.HP_Constraint_SetChildBody(id, objId));
      r(hk.HP_Constraint_SetAnchorInParent(id, [0, 0, 0], [1, 0, 0], [0, 1, 0]));
      r(hk.HP_Constraint_SetAnchorInChild(id, [0, 0, 0], [1, 0, 0], [0, 1, 0]));
      c.isEnabled = true;
    }
    if (v === "toggleTwice") { r(hk.HP_Constraint_SetChildBody(id, objId)); c.isEnabled = false; stepN(w.scene, 1); c.isEnabled = true; }
    const child = hk.HP_Constraint_GetChildBody(id)[1][0] === objId[0];
    stepN(w.scene, 60);
    out[v] = { results, getChildIsObj: child, objY: r3(obj.transformNode.position.y), expectHeldNear: 2, impulse: r3(appliedImpulses(hk, c).lin.length()) };
    w.dispose();
  }
  return out;
}
