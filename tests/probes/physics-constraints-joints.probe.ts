// (c) drawer prismatic with limits + removal, (d) hinge -> ball-and-socket swap, (e) re-create hinge at 60 deg, two hinges.
import {
  Vector3,
  Quaternion,
  HingeConstraint,
  PrismaticConstraint,
  BallAndSocketConstraint,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsBody,
  TransformNode,
  type PhysicsConstraint,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, DEG, r3, v3, deg, newHavok, type CWorld } from "./physics-constraints-util.ts";

const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1);

function hollowCabinet(w: CWorld, pos: Vector3): PhysicsBody {
  // 0.5 w x 0.2 h x 0.5 d carcass open at +Z, panels 2 cm
  const node = new TransformNode("cabinet", w.scene);
  node.position.copyFrom(pos);
  node.rotationQuaternion = Quaternion.Identity();
  node.computeWorldMatrix(true);
  const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, w.scene);
  const c = new PhysicsShapeContainer(w.scene);
  const panel = (center: Vector3, size: Vector3) => {
    const s = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, w.scene);
    s.material = { friction: 0.3, restitution: 0 };
    c.addChild(s, center);
  };
  panel(new Vector3(0, -0.09, 0), new Vector3(0.5, 0.02, 0.5)); // bottom
  panel(new Vector3(0, 0.09, 0), new Vector3(0.5, 0.02, 0.5)); // top
  panel(new Vector3(-0.24, 0, 0), new Vector3(0.02, 0.2, 0.5)); // left
  panel(new Vector3(0.24, 0, 0), new Vector3(0.02, 0.2, 0.5)); // right
  panel(new Vector3(0, 0, -0.24), new Vector3(0.5, 0.2, 0.02)); // back
  body.shape = c;
  return body;
}

function drawerOffset(cab: PhysicsBody, drawer: PhysicsBody, pivotA: Vector3): number {
  return Vector3.Dot(drawer.transformNode.position.subtract(localToWorld(cab, pivotA)), Z.applyRotationQuaternion(cab.transformNode.rotationQuaternion!));
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---------- (c) drawer
  for (const variant of ["hollowCabinet", "solidCabinetOverlap"] as const) {
    const w = await makeWorld(await newHavok());
    const ground = makeBox(w.scene, "ground", new Vector3(10, 0.2, 10), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    const cabPos = new Vector3(0, 0.8, 0);
    const cab = variant === "hollowCabinet" ? hollowCabinet(w, cabPos) : makeBox(w.scene, "cabSolid", new Vector3(0.5, 0.2, 0.5), cabPos, { motion: PhysicsMotionType.STATIC });
    // drawer: 0.44 x 0.14 x 0.46 box, 3 kg, closed position = cabinet-local (0, 0, 0.01)
    const pivotA = new Vector3(0, 0, 0.01);
    const drawer = makeBox(w.scene, "drawer", new Vector3(0.44, 0.14, 0.46), cabPos.add(pivotA), { mass: 3, friction: 0.3 });
    const pr = new PrismaticConstraint(pivotA, Vector3.Zero(), Z, Z, w.scene); // LINEAR_X = displacement along +Z
    cab.addConstraint(drawer, pr);
    const p = w.plugin;
    p.setAxisMode(pr, PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
    p.setAxisMinLimit(pr, PhysicsConstraintAxis.LINEAR_X, 0);
    p.setAxisMaxLimit(pr, PhysicsConstraintAxis.LINEAR_X, 0.45);
    p.setAxisFriction(pr, PhysicsConstraintAxis.LINEAR_X, 1); // N
    stepN(w.scene, 10);
    const res: Record<string, unknown> = { modes: [0, 1, 2, 3, 4, 5].map((i) => p.getAxisMode(pr, i as PhysicsConstraintAxis)) };
    // pull out hard: 6 N*s => 2 m/s
    drawer.applyImpulse(new Vector3(0, 0, 6), drawer.transformNode.position);
    let mx = -1, mn = 1;
    for (let i = 0; i < 60; i++) { stepN(w.scene, 1); const d = drawerOffset(cab, drawer, pivotA); mx = Math.max(mx, d); mn = Math.min(mn, d); }
    res.pull6Ns = { maxOut: r3(mx), final: r3(drawerOffset(cab, drawer, pivotA)), vz: r3(drawer.getLinearVelocity().z), loadN: r3(appliedImpulses(w.hk, pr).lin.length() * 60) };
    // slam it shut: -6 N*s
    drawer.applyImpulse(new Vector3(0, 0, -6), drawer.transformNode.position);
    mx = -1; mn = 1;
    for (let i = 0; i < 60; i++) { stepN(w.scene, 1); const d = drawerOffset(cab, drawer, pivotA); mx = Math.max(mx, d); mn = Math.min(mn, d); }
    res.push6Ns = { minIn: r3(mn), final: r3(drawerOffset(cab, drawer, pivotA)) };
    // pull to the end, then remove the constraint
    drawer.applyImpulse(new Vector3(0, 0, 3), drawer.transformNode.position);
    stepN(w.scene, 60);
    res.beforeRemove = { offset: r3(drawerOffset(cab, drawer, pivotA)), pos: v3(drawer.transformNode.position) };
    pr.dispose();
    const vmax: number[] = [];
    for (let i = 0; i < 90; i++) { stepN(w.scene, 1); if (i < 6) vmax.push(r3(drawer.getLinearVelocity().length())); }
    res.afterRemove = { first6StepsSpeed: vmax, pos1_5s: v3(drawer.transformNode.position), rotDeg: deg(2 * Math.acos(Math.min(1, Math.abs(drawer.transformNode.rotationQuaternion!.w)))) };
    out[`drawer_${variant}`] = res;
    ground.dispose();
    w.dispose();
  }

  // ---------- (d) door on one hinge -> dispose -> ball socket at the top hinge
  {
    const w = await makeWorld(await newHavok());
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
    const hinge = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Y, Y, w.scene); // axis through both hinges
    frame.addConstraint(door, hinge);
    stepN(w.scene, 30);
    door.applyImpulse(new Vector3(0, 0, 8), localToWorld(door, new Vector3(0.45, 0, 0)));
    stepN(w.scene, 20); // swinging ~ -30 deg
    const angleBefore = relAngle(frame, door, Y, X);
    const posBefore = door.transformNode.position.clone();
    const vBefore = door.getLinearVelocity().length();
    hinge.dispose();
    const topA = new Vector3(0.05, 0.7, 0), topB = new Vector3(-0.45, 0.7, 0);
    const ball = new BallAndSocketConstraint(topA, topB, Y, Y, w.scene);
    frame.addConstraint(door, ball);
    const speeds: number[] = [], gaps: number[] = [];
    let maxSpeed = 0;
    for (let i = 0; i < 180; i++) {
      stepN(w.scene, 1);
      const s = door.getLinearVelocity().length();
      maxSpeed = Math.max(maxSpeed, s);
      if (i < 5) { speeds.push(r3(s)); gaps.push(r3(localToWorld(door, topB).subtract(localToWorld(frame, topA)).length() * 1000)); }
    }
    const bottomFree = localToWorld(door, new Vector3(0.45, -1, 0));
    out.hingeToBall = {
      angleBeforeDeg: deg(angleBefore), speedBefore: r3(vBefore), posBefore: v3(posBefore),
      speedsFirst5: speeds, pivotGapMmFirst5: gaps, maxSpeed3s: r3(maxSpeed),
      after3s: { pos: v3(door.transformNode.position), freeBottomCorner: v3(bottomFree), comBelowPivot: r3(localToWorld(frame, topA).y - door.transformNode.position.y) },
      ballLoad: { lin: v3(appliedImpulses(w.hk, ball).lin), expect_mgdt: r3(20 * 9.81 / 60) },
    };
    ball.dispose();
    w.dispose();
  }

  // ---------- (e) re-create a hinge while the door is open at 60 deg
  for (const recreateWith of ["sameLocalFrames", "perpBFromCurrentPose"] as const) {
    const w = await makeWorld(await newHavok());
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
    const mk = (perpB: Vector3) => {
      const c = new Physics6DoFConstraint({ pivotA: new Vector3(0.05, 0, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: Y, axisB: Y, perpAxisA: X, perpAxisB: perpB }, [
        { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -100 * DEG, maxLimit: 100 * DEG },
      ], w.scene);
      frame.addConstraint(door, c);
      return c;
    };
    let c: Physics6DoFConstraint = mk(X);
    c.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
    c.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 60 * DEG);
    c.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 200);
    stepN(w.scene, 180);
    c.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 0);
    stepN(w.scene, 5);
    const a0 = relAngle(frame, door, Y, X);
    const p0 = door.transformNode.position.clone(), q0 = door.transformNode.rotationQuaternion!.clone();
    c.dispose();
    let perpB = X;
    if (recreateWith === "perpBFromCurrentPose") {
      // perpAxisB = frame's perp expressed in the door's CURRENT local frame -> zero angle = current pose
      const worldPerp = X.applyRotationQuaternion(frame.transformNode.rotationQuaternion!);
      perpB = worldPerp.applyRotationQuaternion(Quaternion.Inverse(door.transformNode.rotationQuaternion!));
    }
    c = mk(perpB);
    stepN(w.scene, 1);
    const jump = door.transformNode.position.subtract(p0).length();
    const rotJump = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(q0, door.transformNode.rotationQuaternion!))));
    // push the door open further (towards +), then the other way
    const pushTo = (sign: number) => {
      const obs = w.scene.onBeforePhysicsObservable.add(() => door.applyTorque(new Vector3(0, sign * 120, 0))); // pure torque about the hinge axis
      let mx = -1e9, mn = 1e9;
      for (let i = 0; i < 150; i++) { stepN(w.scene, 1); const a = relAngle(frame, door, Y, X); mx = Math.max(mx, a); mn = Math.min(mn, a); }
      w.scene.onBeforePhysicsObservable.remove(obs);
      return { maxDeg: deg(mx), minDeg: deg(mn), finalDeg: deg(relAngle(frame, door, Y, X)) };
    };
    const plus = pushTo(+1);
    const minus = pushTo(-1);
    out[`recreateAt60_${recreateWith}`] = { angleBeforeDeg: deg(a0), posJumpMm: r3(jump * 1000), rotJumpDeg: deg(rotJump), pushPlus: plus, pushMinus: minus };
    c.dispose();
    w.dispose();
  }

  // ---------- two separate hinges on the same axis (over-constrained) vs one
  for (const n of [1, 2]) {
    const w = await makeWorld(await newHavok());
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(0, 1.05, 0), { mass: 20 });
    const cs: PhysicsConstraint[] = [];
    const ys = n === 1 ? [0] : [0.7, -0.7];
    for (const y of ys) { const h = new HingeConstraint(new Vector3(0.05, y, 0), new Vector3(-0.45, y, 0), Y, Y, w.scene); frame.addConstraint(door, h); cs.push(h); }
    stepN(w.scene, 30);
    door.applyImpulse(new Vector3(0, 0, 20), localToWorld(door, new Vector3(0.45, 0, 0)));
    let maxSag = 0;
    for (let i = 0; i < 120; i++) { stepN(w.scene, 1); maxSag = Math.max(maxSag, Math.abs(door.transformNode.position.y - 1.05)); }
    out[`hinges_${n}`] = {
      angleAfter2s: deg(relAngle(frame, door, Y, X)), omega: r3(door.getAngularVelocity().y), maxSagMm: r3(maxSag * 1000),
      loads: cs.map((c) => { const i = appliedImpulses(w.hk, c); return { linN: r3(i.lin.length() * 60), angNm: r3(i.ang.length() * 60) }; }),
    };
    w.dispose();
  }
  return out;
}
