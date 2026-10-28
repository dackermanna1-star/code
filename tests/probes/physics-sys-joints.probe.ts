// Physics system: hinge door with limits on a static frame (angle sign consistency), hinge friction, motor latch
// held/released, slider drawer with limits and removal, ball socket pendulum, constraint loads, runtime limit
// changes, disposal of jointed bodies.
import { Vector3, Quaternion, type PhysicsBody, type PhysicsConstraint } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, steps, check, counts, r, v3, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

/** 0.9 × 2.0 × 0.04 m hollow-core door (18 kg) hinged on a static jamb at x = 0 (hinge line = world Y axis at x = 0). */
function door(w: World, opts: { min?: number; max?: number; friction?: number; motor?: { target: number; maxForce: number }; z?: number } = {}) {
  const z = opts.z ?? 0;
  const P = w.physics;
  const frame = staticBox(w, new Vector3(-0.06, 1.0, z), new Vector3(0.1, 2.1, 0.12));
  const d = body(w, "door", new Vector3(0.45, 1.0, z), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.9, y: 2.0, z: 0.04 }, { density: 18 / (0.9 * 2 * 0.04) }));
  const c = P.hinge(frame, d, {
    pivotA: new Vector3(0.06, 0, 0), // frame-local (frame centre is at x = −0.06)
    pivotB: new Vector3(-0.45, 0, 0), // door-local hinge edge
    axisA: new Vector3(0, 1, 0),
    axisB: new Vector3(0, 1, 0),
    min: opts.min,
    max: opts.max,
    friction: opts.friction,
    motor: opts.motor,
  });
  return { frame, d, c };
}

/** Push the door's free edge horizontally (perpendicular to the door plane) for n steps; returns the angle trace. */
function push(w: World, d: PhysicsBody, c: PhysicsConstraint, force: number, n: number): number[] {
  const trace: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = d.transformNode.rotationQuaternion!;
    const edge = new Vector3(0.45, 0, 0).applyRotationQuaternion(q).add(d.transformNode.position);
    const normal = new Vector3(0, 0, 1).applyRotationQuaternion(q);
    d.applyForce(normal.scale(force), edge);
    w.physics.step(1 / 60);
    trace.push(w.physics.hingeAngle(c));
  }
  return trace;
}

const yawOf = (b: PhysicsBody) => {
  const q = b.transformNode.rotationQuaternion!;
  return 2 * Math.atan2(q.y, q.w);
};

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- J1: hinge door with limits [0, 1.7] on a static frame: both push directions stay inside the limits
  {
    const w = await makeWorld();
    const { d, c } = door(w, { min: 0, max: 1.7 });
    const P = w.physics;
    const a0 = P.hingeAngle(c);
    const tA = push(w, d, c, 40, 90); // one way
    const angA = P.hingeAngle(c);
    const yawA = yawOf(d);
    const tB = push(w, d, c, -40, 150); // the other way: must stop at 0 (jamb)
    const angB = P.hingeAngle(c);
    const tC = push(w, d, c, -40, 60);
    const all = [...tA, ...tB, ...tC];
    const lo = Math.min(...all), hi = Math.max(...all);
    // which push direction opens the door depends on the hinge-angle sign; both must respect [0, 1.7]
    const opened = Math.max(Math.abs(angA), Math.abs(angB));
    const hingePos = new Vector3(-0.45, 0, 0).applyRotationQuaternion(d.transformNode.rotationQuaternion!).add(d.transformNode.position);
    check(out, "J1_hingeDoorLimits", Math.abs(a0) < 1e-4 && lo > -0.05 && hi < 1.75 && opened > 1.6 && Vector3.Distance(hingePos, new Vector3(0, 1, 0)) < 0.01 && Math.abs(Math.abs(yawA) - Math.abs(angA)) < 0.03, {
      angle0: r(a0, 5),
      afterPushA: r(angA, 3),
      yawA: r(yawA, 3),
      afterPushB: r(angB, 3),
      minAngle: r(lo, 3),
      maxAngle: r(hi, 3),
      hingeEdgeDrift: r(Vector3.Distance(hingePos, new Vector3(0, 1, 0)), 4),
    });
    w.dispose();
  }

  // ---- J2: hinge friction damps a swinging door
  {
    const swing = async (friction: number) => {
      const w = await makeWorld();
      const { d, c } = door(w, { friction });
      d.setAngularVelocity(new Vector3(0, 3, 0));
      steps(w, 120);
      const ang = Math.abs(w.physics.hingeAngle(c));
      const omega = d.getAngularVelocity().length();
      w.dispose();
      return { ang: r(ang, 3), omega: r(omega, 3) };
    };
    const free = await swing(0);
    const fr = await swing(40);
    check(out, "J2_hingeFriction", fr.ang < free.ang * 0.6 && fr.omega < 0.05, { free, friction40: fr });
  }

  // ---- J3: latch = position motor (target 0, 30 N·m) holds below its strength, gives above; released → swings
  {
    const w = await makeWorld();
    const P = w.physics;
    const { d, c } = door(w, { min: -1.7, max: 1.7, motor: { target: 0, maxForce: 30 } });
    push(w, d, c, 20, 60); // 18 N·m < 30 N·m
    const held = P.hingeAngle(c);
    push(w, d, c, 60, 30); // 54 N·m > 30 N·m: the latch gives
    const forced = P.hingeAngle(c);
    // let the motor pull it back closed, then release the latch and push gently
    steps(w, 120);
    const recovered = P.hingeAngle(c);
    P.setHingeMotor(c, 0, 0);
    push(w, d, c, 20, 60);
    const released = P.hingeAngle(c);
    // drive it to a target angle (door closer / scripted open)
    P.setHingeMotor(c, 1.0, 300);
    steps(w, 120);
    const driven = P.hingeAngle(c);
    check(out, "J3_motorLatch", Math.abs(held) < 0.02 && Math.abs(forced) > 0.1 && Math.abs(recovered) < 0.05 && Math.abs(released) > 0.5 && Math.abs(driven - 1.0) < 0.05, {
      heldAt18Nm: r(held, 4),
      forcedAt54Nm: r(forced, 3),
      recoveredByMotor: r(recovered, 3),
      releasedSwing: r(released, 3),
      drivenTo1rad: r(driven, 3),
    });
    w.dispose();
  }

  // ---- J4: slider drawer with limits [0, 0.35], no rotation; removal lets it fall
  {
    const w = await makeWorld();
    const P = w.physics;
    const carcass = staticBox(w, new Vector3(0, 0.5, -0.3), new Vector3(0.5, 0.25, 0.1)); // back panel behind the drawer
    const drawer = body(w, "drawer", new Vector3(0, 0.5, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.4, y: 0.15, z: 0.45 }, { density: 3 / (0.4 * 0.15 * 0.45) }));
    const c = P.slider(carcass, drawer, { pivotA: new Vector3(0, 0, 0.3), pivotB: new Vector3(0, 0, 0), axisA: new Vector3(0, 0, 1), axisB: new Vector3(0, 0, 1), min: 0, max: 0.35 });
    const pull = (f: number, n: number) => {
      let lo = Infinity, hi = -Infinity, maxRot = 0;
      for (let i = 0; i < n; i++) {
        drawer.applyForce(new Vector3(0, 0, f), drawer.transformNode.position);
        w.physics.step(1 / 60);
        const s = P.sliderPosition(c);
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
        const q = drawer.transformNode.rotationQuaternion!;
        maxRot = Math.max(maxRot, 2 * Math.acos(Math.min(1, Math.abs(q.w))));
      }
      return { lo, hi, maxRot };
    };
    const s0 = P.sliderPosition(c);
    const out1 = pull(40, 60);
    const posOut = P.sliderPosition(c);
    const in1 = pull(-40, 90);
    const posIn = P.sliderPosition(c);
    const yHeld = drawer.transformNode.position.y;
    pull(40, 30);
    P.removeConstraint(c);
    steps(w, 40);
    const yAfter = drawer.transformNode.position.y;
    check(out, "J4_sliderDrawer", Math.abs(s0) < 1e-4 && Math.abs(posOut - 0.35) < 0.02 && out1.hi < 0.37 && Math.abs(posIn) < 0.02 && in1.lo > -0.02 && Math.max(out1.maxRot, in1.maxRot) < 0.01 && Math.abs(yHeld - 0.5) < 0.005 && yAfter < 0.2 && P.stats().constraints === 0, {
      start: r(s0, 5),
      pulledOut: r(posOut, 4),
      maxTravel: r(out1.hi, 4),
      pushedIn: r(posIn, 4),
      minTravel: r(in1.lo, 4),
      maxRotationRad: r(Math.max(out1.maxRot, in1.maxRot), 5),
      yWhileHeld: r(yHeld, 4),
      yAfterRemoval: r(yAfter, 3),
    });
    w.dispose();
  }

  // ---- J5: ball socket pendulum on the world body keeps its pivot; J6: constraint load of a hanging door ≈ m·g
  {
    const w = await makeWorld();
    const P = w.physics;
    const bob = body(w, "bob", new Vector3(0, 2, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.2, y: 0.2, z: 0.2 }, { density: 250 })); // 2 kg
    const c = P.ball(P.worldBody, bob, new Vector3(0, 3, 0), new Vector3(0, 1, 0));
    bob.setLinearVelocity(new Vector3(2, 0, 1));
    let maxErr = 0;
    let maxX = 0;
    for (let i = 0; i < 120; i++) {
      w.physics.step(1 / 60);
      const pv = new Vector3(0, 1, 0).applyRotationQuaternion(bob.transformNode.rotationQuaternion!).add(bob.transformNode.position);
      maxErr = Math.max(maxErr, Vector3.Distance(pv, new Vector3(0, 3, 0)));
      maxX = Math.max(maxX, Math.abs(bob.transformNode.position.x));
    }
    check(out, "J5_ballSocketPendulum", maxErr < 0.01 && maxX > 0.3, { maxPivotError: r(maxErr, 5), maxSwingX: r(maxX, 3) });
    P.removeConstraint(c);

    const hang = body(w, "hanging", new Vector3(5, 1.0, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.9, y: 2.0, z: 0.04 }, { density: 18 / (0.9 * 2 * 0.04) }));
    const c2 = P.ball(P.worldBody, hang, new Vector3(5, 2.0, 0), new Vector3(0, 1.0, 0));
    steps(w, 120);
    const load = P.constraintLoad(c2);
    check(out, "J6_constraintLoad", Math.abs(load.force - 18 * 9.81) / (18 * 9.81) < 0.05, { force: r(load.force, 2), expected: r(18 * 9.81, 2), torque: r(load.torque, 3) });
    w.dispose();
  }

  // ---- J7: runtime limit changes; hinge between two dynamic bodies (lid on a box, overlapping, no self-collision)
  {
    const w = await makeWorld();
    const P = w.physics;
    const { d, c } = door(w);
    P.setHingeLimits(c, -0.5, 0.5);
    const t1 = push(w, d, c, 50, 90);
    const t2 = push(w, d, c, -50, 120);
    const lim = [Math.min(...t1, ...t2), Math.max(...t1, ...t2)];
    P.setHingeLimits(c); // free
    const t3 = push(w, d, c, 50, 90);
    // lid hinged on a dynamic crate, slightly interpenetrating at the hinge: must stay calm (collideConnected = false)
    const crate = body(w, "crate", new Vector3(3, 0.25, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.5, y: 0.5, z: 0.5 }, { density: 100 }));
    staticBox(w, new Vector3(3, -0.1, 0), new Vector3(2, 0.2, 2));
    const lid = body(w, "lid", new Vector3(3, 0.51, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.5, y: 0.04, z: 0.5 }, { density: 600 }));
    P.hinge(crate, lid, { pivotA: new Vector3(0, 0.25, -0.25), pivotB: new Vector3(0, -0.02, -0.25), axisA: new Vector3(1, 0, 0), axisB: new Vector3(1, 0, 0), min: -2, max: 0.01 });
    steps(w, 120);
    const lidV = lid.getLinearVelocity().length() + lid.getAngularVelocity().length();
    check(out, "J7_runtimeLimits_dynamicPair", lim[0] > -0.55 && lim[1] < 0.55 && Math.max(...t3.map(Math.abs)) > 0.7 && lidV < 0.05 && Math.abs(crate.transformNode.position.y - 0.25) < 0.01, {
      limitedRange: lim.map((x) => r(x, 3)),
      freeAfterClear: r(Math.max(...t3.map(Math.abs)), 3),
      lidResidualSpeed: r(lidV, 4),
      crateY: r(crate.transformNode.position.y, 4),
    });
    w.dispose();
  }

  // ---- J8: disposing jointed bodies (disposeBody and node.dispose) removes their constraints, no leaks/crashes
  {
    const w = await makeWorld();
    const P = w.physics;
    const base = counts(w);
    const a = door(w, { min: 0, max: 1.7, z: 0 });
    const b = door(w, { min: 0, max: 1.7, z: 2 });
    const drawerish = body(w, "dr", new Vector3(4, 1, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: 0.3, y: 0.3, z: 0.3 }, { density: 100 }));
    P.slider(P.worldBody, drawerish, { pivotA: new Vector3(4, 1, 0), pivotB: new Vector3(0, 0, 0), axisA: new Vector3(1, 0, 0), axisB: new Vector3(1, 0, 0), min: -0.2, max: 0.2 });
    steps(w, 10);
    const mid = counts(w);
    P.disposeBody(a.d);
    a.d.transformNode.dispose();
    b.d.transformNode.dispose(); // node disposal path (Babylon disposes the body; our hook cleans up first)
    drawerish.transformNode.dispose();
    let err = "";
    try {
      steps(w, 30);
    } catch (e) {
      err = String(e);
    }
    for (const f of [a.frame, b.frame]) {
      P.disposeBody(f);
      f.transformNode.dispose();
    }
    const end = counts(w);
    check(out, "J8_disposeJointedBodies", !err && mid.hkConstraints === base.hkConstraints + 3 && end.hkConstraints === base.hkConstraints && end.joints === 0 && end.constraintPairs === base.constraintPairs && end.hkBodies === base.hkBodies && end.engineBodies === base.engineBodies && end.own === base.own, { base, mid, end, err });
    w.dispose();
  }
  void Layer;
  void v3;
  void Quaternion;
  return out;
}
