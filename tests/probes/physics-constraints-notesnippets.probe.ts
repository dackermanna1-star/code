// Runs the snippets extracted verbatim from docs/api-notes/physics-constraints-character.md.
import { Vector3, Quaternion, BallAndSocketConstraint, PhysicsMotionType, PhysicsActivationControl } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, r3, v3, newHavok } from "./physics-constraints-util.ts";
import { GrabJoint, FpsMover, supportContacts, makeJointLoad, makeCrouch } from "./physics-constraints-notesnippets.ts";

const DT = 1 / 60;

export async function probe() {
  const out: Record<string, unknown> = {};
  // GrabJoint
  {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(20, 0.2, 20), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    const box = makeBox(w.scene, "box", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 0.15, 1.5), { mass: 5 });
    const heavy = makeBox(w.scene, "heavy", new Vector3(0.5, 0.5, 0.5), new Vector3(3, 0.25, 1.5), { mass: 60 });
    const g = new GrabJoint(w.scene);
    w.plugin.setActivationControl(box, PhysicsActivationControl.ALWAYS_ACTIVE);
    const yaw = Quaternion.Identity();
    let target = new Vector3(0, 1.2, 1.5);
    const obs = w.scene.onBeforePhysicsObservable.add(() => { if (g.held) g.update(target, yaw); });
    g.grab(box, box.transformNode.position.clone(), yaw);
    stepN(w.scene, 60);
    const held = { pos: v3(box.transformNode.position), forceN: v3(g.force()), expectY: r3(5 * 9.81) };
    g.setRotation(0, 0.5);
    stepN(w.scene, 60);
    const rotated = v3(box.transformNode.rotationQuaternion!.toEulerAngles());
    g.release();
    stepN(w.scene, 60);
    const dropped = r3(box.transformNode.position.y);
    target = new Vector3(3, 1.2, 1.5);
    g.grab(heavy, heavy.transformNode.position.clone(), yaw);
    stepN(w.scene, 90);
    const heavyRes = { pos: v3(heavy.transformNode.position), forceN: r3(g.force().length()) };
    g.release();
    w.scene.onBeforePhysicsObservable.remove(obs);
    out.grabJoint = { held, rotatedEuler: rotated, droppedY: dropped, heavy60kg: heavyRes };
    w.dispose();
  }
  // jointLoad
  {
    const w = await makeWorld(await newHavok());
    const jointLoad = makeJointLoad(w.scene);
    const ceil = makeBox(w.scene, "ceil", new Vector3(0.2, 0.2, 0.2), new Vector3(0, 3, 0), { motion: PhysicsMotionType.STATIC });
    const lamp = makeBox(w.scene, "lamp", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 2, 0), { mass: 4 });
    lamp.setLinearDamping(2);
    const c = new BallAndSocketConstraint(new Vector3(0, -0.1, 0), new Vector3(0, 0.15, 0), Vector3.Up(), Vector3.Up(), w.scene);
    const before = jointLoad(c, DT);
    ceil.addConstraint(lamp, c);
    stepN(w.scene, 120);
    const l = jointLoad(c, DT)!;
    c.dispose();
    out.jointLoad = { beforeAdd: before, linN: v3(l.lin), expectY: r3(4 * 9.81), afterDispose: jointLoad(c, DT) };
    w.dispose();
  }
  // FpsMover + crouch
  {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    makeBox(w.scene, "beam", new Vector3(4, 0.4, 1), new Vector3(0, 1.5, 2.5), { motion: PhysicsMotionType.STATIC });
    const mover = new FpsMover(w.scene, new Vector3(0, 1, -3));
    const crouch = makeCrouch(w.scene, w.plugin, mover, { PLAYER: 8, STATIC: 1, DYNAMIC: 2 });
    let landings = 0, landSpeed = 0;
    const step = (n: number, f: number, jump = false) => { for (let k = 0; k < n; k++) { mover.step(DT, { forward: f, right: 0, yaw: 0, speed: 3.6, jump: jump && k === 0 }); stepN(w.scene, 1); if (mover.landingSpeed > 0) { landings++; landSpeed = mover.landingSpeed; } } };
    step(60, 0);
    const restFeet = mover.feetY;
    const y0 = mover.feetY;
    let apex = 0;
    for (let k = 0; k < 70; k++) { mover.step(DT, { forward: 0, right: 0, yaw: 0, speed: 3.6, jump: k === 0 }); stepN(w.scene, 1); apex = Math.max(apex, mover.feetY - y0); if (mover.landingSpeed > 0) { landings++; landSpeed = mover.landingSpeed; } }
    step(150, 1); // walk to the beam: blocked
    const blockedZ = mover.cc.getPosition().z;
    crouch.crouch();
    step(15, 1); // under the beam (beam spans z 2..3)
    const underZ = mover.cc.getPosition().z;
    const standUnder = crouch.stand();
    step(40, 1); // out
    const outZ = mover.cc.getPosition().z;
    const standOut = crouch.stand();
    step(10, 0);
    out.mover = {
      restFeet: r3(restFeet), jumpApex: r3(apex), landings, lastLandingSpeed: r3(landSpeed), blockedZ: r3(blockedZ), underBeamZ: r3(underZ),
      standUnderBeam: standUnder, outZ: r3(outZ), standAfterLeaving: standOut, finalFeet: r3(mover.feetY), footOffset: mover.cc.footOffset,
      support: supportContacts(mover.cc).map((s) => s.body.transformNode.name),
    };
    mover.cc.dispose();
    w.dispose();
  }
  return out;
}
