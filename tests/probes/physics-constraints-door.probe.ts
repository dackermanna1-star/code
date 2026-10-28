// Door hinge with angular limits + friction, latch (position motor with capped torque), fan (velocity motor).
import {
  Vector3,
  HingeConstraint,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
  type PhysicsBody,
  type PhysicsConstraint,
  type Scene,
  type HavokPlugin,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, DEG, r3, v3, deg, newHavok, type CWorld } from "./physics-constraints-util.ts";

const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);
const PIVOT_A = new Vector3(0.05, 0, 0); // frame-local
const PIVOT_B = new Vector3(-0.45, 0, 0); // door-local (left edge)
const EDGE = new Vector3(0.45, 0, 0); // door-local free edge

interface Door { frame: PhysicsBody; door: PhysicsBody; c: PhysicsConstraint; angle(): number }

function makeDoor(w: CWorld, kind: "6dof" | "hinge", lim: number | null, friction = 0, x0 = 0): Door {
  const s: Scene = w.scene;
  const frame = makeBox(s, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(x0 - 0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
  const door = makeBox(s, "door", new Vector3(0.9, 2.0, 0.04), new Vector3(x0, 1.05, 0), { mass: 20 });
  let c: PhysicsConstraint;
  if (kind === "6dof") {
    const limits = [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
    ];
    if (lim !== null) limits.push({ axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: -lim, maxLimit: lim });
    c = new Physics6DoFConstraint({ pivotA: PIVOT_A, pivotB: PIVOT_B, axisA: Y, axisB: Y, perpAxisA: X, perpAxisB: X }, limits, s);
    frame.addConstraint(door, c);
  } else {
    c = new HingeConstraint(PIVOT_A, PIVOT_B, Y, Y, s);
    frame.addConstraint(door, c);
    if (lim !== null) {
      w.plugin.setAxisMode(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
      w.plugin.setAxisMinLimit(c, PhysicsConstraintAxis.ANGULAR_X, -lim);
      w.plugin.setAxisMaxLimit(c, PhysicsConstraintAxis.ANGULAR_X, lim);
    }
  }
  if (friction) w.plugin.setAxisFriction(c, PhysicsConstraintAxis.ANGULAR_X, friction);
  return { frame, door, c, angle: () => relAngle(frame, door, Y, X) };
}

function kick(d: Door, impulseZ: number) {
  d.door.applyImpulse(new Vector3(0, 0, impulseZ), localToWorld(d.door, EDGE));
}

function track(w: CWorld, d: Door, steps: number, every = 10) {
  let mn = 1e9, mx = -1e9;
  const samples: number[] = [];
  for (let i = 0; i < steps; i++) {
    stepN(w.scene, 1);
    const a = d.angle();
    mn = Math.min(mn, a); mx = Math.max(mx, a);
    if (i % every === every - 1) samples.push(deg(a));
  }
  return { minDeg: deg(mn), maxDeg: deg(mx), finalDeg: deg(d.angle()), samples };
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const hk = await newHavok();

  // ---------- (a) door with +-100 deg limits: kick both ways, 6dof vs hinge+plugin limits
  for (const kind of ["6dof", "hinge"] as const) {
    for (const dir of [1, -1]) {
      const w = await makeWorld(hk);
      const d = makeDoor(w, kind, 100 * DEG, 0.5);
      stepN(w.scene, 5);
      kick(d, 30 * dir); // 30 N*s at the free edge -> omega ~ 27/5.4 = 5 rad/s
      const t = track(w, d, 120, 10);
      const pivotGap = localToWorld(d.door, PIVOT_B).subtract(localToWorld(d.frame, PIVOT_A)).length();
      out[`a_${kind}_kick${dir > 0 ? "+Z" : "-Z"}`] = { ...t, pivotGapMm: r3(pivotGap * 1000), finalOmegaY: r3(d.door.getAngularVelocity().y) };
      w.dispose();
    }
  }
  // which limit is hit by a positive motor target? (sign convention): position motor target +0.5 rad, big force
  {
    const w = await makeWorld(hk);
    const d = makeDoor(w, "6dof", null);
    const six = d.c as Physics6DoFConstraint;
    six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
    six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0.5);
    six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 1000);
    stepN(w.scene, 120);
    out.signConvention = { motorTarget: 0.5, measuredAngleRad: r3(d.angle()), note: "measured = signed angle of door about +axisA (Y) by right-hand rule numerics: +theta maps local +X to (cos, 0, -sin)" };
    w.dispose();
  }

  // ---------- friction units: free-swinging door (no limits), angular damping 0, measure decel torque = I * domega/dt
  {
    const res: unknown[] = [];
    for (const f of [0, 2, 5, 10, 20]) {
      const w = await makeWorld(hk);
      const d = makeDoor(w, "6dof", null, f);
      d.door.setAngularDamping(0);
      stepN(w.scene, 2);
      kick(d, 15);
      stepN(w.scene, 2);
      const w0 = d.door.getAngularVelocity().y;
      stepN(w.scene, 20);
      const w1 = d.door.getAngularVelocity().y;
      const I = 20 * (0.81 + 0.0016) / 12 + 20 * 0.45 * 0.45; // about the hinge axis
      const decelTorque = (I * Math.abs(w1 - w0)) / (20 / 60);
      res.push({ friction: f, omega0: r3(w0), omega20: r3(w1), decelTorqueNm: r3(decelTorque) });
      w.dispose();
    }
    out.frictionUnits = res;
  }

  // ---------- (b) latch: position motor target 0, maxForce T (N*m); push with constant force at the edge
  {
    const T = 30;
    const holdRes: unknown[] = [];
    for (const F of [10, 20, 30, 32, 35, 40, 60]) {
      const w = await makeWorld(hk);
      const d = makeDoor(w, "6dof", 100 * DEG, 0);
      const six = d.c as Physics6DoFConstraint;
      six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
      six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, T);
      const obs = w.scene.onBeforePhysicsObservable.add(() => d.door.applyForce(new Vector3(0, 0, F), localToWorld(d.door, EDGE)));
      stepN(w.scene, 60);
      const imp = appliedImpulses(hk, d.c);
      w.scene.onBeforePhysicsObservable.remove(obs);
      holdRes.push({ pushN: F, torqueNm: r3(F * 0.9), angleAfter1sDeg: deg(d.angle()), constraintAngImpulse: v3(imp.ang), motorTorqueFromImpulseY: r3(imp.ang.y * 60) });
      w.dispose();
    }
    out.latchHold_T30 = holdRes;

    const kicks: unknown[] = [];
    for (const J of [2, 5, 10, 20, 40]) {
      const w = await makeWorld(hk);
      const d = makeDoor(w, "6dof", 100 * DEG, 0);
      const six = d.c as Physics6DoFConstraint;
      six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
      six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, T);
      stepN(w.scene, 2);
      kick(d, J);
      const t = track(w, d, 120, 20);
      kicks.push({ kickNs: J, ...t });
      w.dispose();
    }
    out.latchKick_T30 = kicks;

    // release variants
    const rel: unknown[] = [];
    for (const how of ["maxForce0", "typeNONE", "disableConstraint"] as const) {
      const w = await makeWorld(hk);
      const d = makeDoor(w, "6dof", 100 * DEG, 0);
      const six = d.c as Physics6DoFConstraint;
      six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0);
      six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, T);
      stepN(w.scene, 30);
      if (how === "maxForce0") six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 0);
      else if (how === "typeNONE") six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.NONE);
      else six.isEnabled = false;
      const obs = w.scene.onBeforePhysicsObservable.add(() => d.door.applyForce(new Vector3(0, 0, 5), localToWorld(d.door, EDGE)));
      stepN(w.scene, 60);
      w.scene.onBeforePhysicsObservable.remove(obs);
      rel.push({ how, angleAfter1sPush5N: deg(d.angle()), doorY: r3(d.door.transformNode.position.y) });
      w.dispose();
    }
    out.latchRelease = rel;

    // motor target set BEFORE motor type: does it stick?
    {
      const w = await makeWorld(hk);
      const d = makeDoor(w, "6dof", null, 0);
      const six = d.c as Physics6DoFConstraint;
      const id = (six as unknown as { _pluginData: [bigint][] })._pluginData[0];
      six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, 0.6);
      const rawAfterSetWithNone = hk.HP_Constraint_GetAxisMotorTarget(id, hk.ConstraintAxis.ANGULAR_X)[1];
      six.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
      six.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_X, 1000);
      const rawAfterType = hk.HP_Constraint_GetAxisMotorTarget(id, hk.ConstraintAxis.ANGULAR_X)[1];
      const posT = hk.HP_Constraint_GetAxisMotorPositionTarget(id, hk.ConstraintAxis.ANGULAR_X)[1];
      stepN(w.scene, 90);
      const angleA = d.angle();
      six.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, -0.4);
      const posT2 = hk.HP_Constraint_GetAxisMotorPositionTarget(id, hk.ConstraintAxis.ANGULAR_X)[1];
      const velT2 = hk.HP_Constraint_GetAxisMotorVelocityTarget(id, hk.ConstraintAxis.ANGULAR_X)[1];
      stepN(w.scene, 90);
      out.motorTargetOrder = { rawAfterSetWithNone: r3(rawAfterSetWithNone), rawAfterType: r3(rawAfterType), positionTargetAfterType: r3(posT), angleWithTarget06SetBeforeType: r3(angleA), afterSetMinus04: { posTarget: r3(posT2), velTarget: r3(velT2), angle: r3(d.angle()) } };
      w.dispose();
    }
  }

  // ---------- (f) fan: velocity motor
  {
    const w = await makeWorld(hk);
    const ceiling = makeBox(w.scene, "ceiling", new Vector3(1, 0.1, 1), new Vector3(0, 2.75, 0), { motion: PhysicsMotionType.STATIC });
    const fan = makeBox(w.scene, "fan", new Vector3(1.2, 0.05, 0.15), new Vector3(0, 2.3, 0), { mass: 2 });
    const hinge = new HingeConstraint(new Vector3(0, -0.05, 0), new Vector3(0, 0.4, 0), Y, Y, w.scene);
    ceiling.addConstraint(fan, hinge);
    const p: HavokPlugin = w.plugin;
    p.setAxisMotorType(hinge, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.VELOCITY);
    p.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 10);
    p.setAxisMotorMaxForce(hinge, PhysicsConstraintAxis.ANGULAR_X, 2);
    const spin: number[] = [];
    for (let i = 0; i < 12; i++) { stepN(w.scene, 15); spin.push(r3(fan.getAngularVelocity().y)); }
    const I = 2 * (1.44 + 0.0025) / 12;
    const imp = appliedImpulses(hk, hinge);
    // brake: target 0
    p.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 0);
    const brake: number[] = [];
    for (let i = 0; i < 6; i++) { stepN(w.scene, 15); brake.push(r3(fan.getAngularVelocity().y)); }
    // coast after removing the motor
    p.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 10);
    stepN(w.scene, 180);
    const wBefore = fan.getAngularVelocity().y;
    p.setAxisMotorMaxForce(hinge, PhysicsConstraintAxis.ANGULAR_X, 0);
    stepN(w.scene, 60);
    out.fan = {
      target: 10, maxForceNm: 2, inertia: r3(I), expectedSpinupS: r3((10 * I) / 2),
      omegaY_every0_25s: spin, steadyAngImpulse: v3(imp.ang), brakeTarget0: brake,
      coast: { before: r3(wBefore), after1sNoMotor: r3(fan.getAngularVelocity().y) },
      fanPos: v3(fan.transformNode.position),
    };
    w.dispose();
  }
  return out;
}
