// Constraint API semantics: attach, coordinate spaces, getters, enable/dispose, leaks, applied impulses.
import {
  Vector3,
  Quaternion,
  HingeConstraint,
  BallAndSocketConstraint,
  LockConstraint,
  PrismaticConstraint,
  SliderConstraint,
  DistanceConstraint,
  Physics6DoFConstraint,
  PhysicsConstraint,
  PhysicsConstraintType,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsConstraintMotorType,
  PhysicsMotionType,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, hkStats, jointId, DEG, r3, v3, deg, newHavok } from "./physics-constraints-util.ts";

export async function probe() {
  const out: Record<string, unknown> = {};
  const hk = await newHavok();

  // ---------- 1. calling axis setters before addConstraint, isEnabled before add
  {
    const w = await makeWorld(hk);
    const c = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB: Vector3.Zero() }, [], w.scene);
    let err = "none";
    try { c.setAxisFriction(PhysicsConstraintAxis.ANGULAR_X, 1); } catch (e) { err = String(e); }
    let enabledBefore: unknown;
    try { enabledBefore = c.isEnabled; } catch (e) { enabledBefore = "throws " + String(e); }
    let getBefore: unknown;
    try { getBefore = c.getAxisFriction(PhysicsConstraintAxis.ANGULAR_X); } catch (e) { getBefore = "throws " + String(e); }
    out.beforeAdd = { setAxisFrictionError: err.slice(0, 120), isEnabled: enabledBefore, getAxisFriction: getBefore, pluginData: (c as unknown as { _pluginData: unknown })._pluginData ?? "undefined" };
    w.dispose();
  }

  // ---------- 2. coordinate spaces: frame translated+rotated, door with COM offset; pivots body-local w.r.t. body ORIGIN?
  {
    const w = await makeWorld(hk, new Vector3(0, 0, 0)); // no gravity: any drift = constraint correction
    const frameRot = Quaternion.RotationAxis(Vector3.Up(), 30 * DEG);
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(5, 1, 3), { motion: PhysicsMotionType.STATIC, rot: frameRot });
    // world hinge point = frame local (0.05,0,0)
    const pivotA = new Vector3(0.05, 0, 0);
    const hingeWorld = localToWorld(frame, pivotA);
    // door: same rotation, its local (-0.45,0,0) at hingeWorld
    const doorPos = hingeWorld.subtract(new Vector3(-0.45, 0, 0).applyRotationQuaternion(frameRot));
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.04), doorPos, { rot: frameRot, mass: 20 });
    door.setMassProperties({ mass: 20, centerOfMass: new Vector3(0.3, 0.2, 0) }); // COM far from origin
    const pivotB = new Vector3(-0.45, 0, 0);
    const hinge = new HingeConstraint(pivotA, pivotB, new Vector3(0, 1, 0), new Vector3(0, 1, 0), w.scene);
    frame.addConstraint(door, hinge);
    const p0 = door.transformNode.position.clone();
    stepN(w.scene, 30);
    const p1 = door.transformNode.position.clone();
    const gap = localToWorld(door, pivotB).subtract(localToWorld(frame, pivotA)).length();
    out.localSpaces = { doorMovedM: r3(p1.subtract(p0).length()), pivotGapM: r3(gap), note: "0 => pivots/axes are body-local relative to the body ORIGIN (not COM), frame rotation honoured" };

    // a constraint with WORLD-space pivots (wrong usage) -> jump
    const door2 = makeBox(w.scene, "door2", new Vector3(0.9, 2.0, 0.04), doorPos.add(new Vector3(0, 0, 3)), { rot: frameRot, mass: 20 });
    const frame2 = makeBox(w.scene, "frame2", new Vector3(0.1, 2.1, 0.1), new Vector3(5, 1, 6), { motion: PhysicsMotionType.STATIC, rot: frameRot });
    const hw2 = localToWorld(frame2, pivotA);
    const wrong = new HingeConstraint(hw2, hw2, new Vector3(0, 1, 0), new Vector3(0, 1, 0), w.scene);
    frame2.addConstraint(door2, wrong);
    const q0 = door2.transformNode.position.clone();
    stepN(w.scene, 30);
    out.worldPivotsMistake = { doorJumpedM: r3(door2.transformNode.position.subtract(q0).length()) };

    // getters after creation
    const p = w.plugin;
    const axes = ["LINEAR_X", "LINEAR_Y", "LINEAR_Z", "ANGULAR_X", "ANGULAR_Y", "ANGULAR_Z", "LINEAR_DISTANCE"] as const;
    const modes: Record<string, unknown> = {};
    for (let i = 0; i < 7; i++) modes[axes[i]] = p.getAxisMode(hinge, i as PhysicsConstraintAxis);
    let motorTargetGet: unknown;
    try { p.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 0.7); motorTargetGet = p.getAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X); } catch (e) { motorTargetGet = "throws " + String(e).slice(0, 100); }
    const rawTarget = hk.HP_Constraint_GetAxisMotorTarget(jointId(hinge), hk.ConstraintAxis.ANGULAR_X)[1];
    p.setAxisMotorTarget(hinge, PhysicsConstraintAxis.ANGULAR_X, 0);
    out.hingeDefaults = {
      type: hinge.type,
      modes, // 0 FREE 1 LIMITED 2 LOCKED
      isEnabled: hinge.isEnabled,
      isCollisionsEnabled: hinge.isCollisionsEnabled,
      friction: p.getAxisFriction(hinge, PhysicsConstraintAxis.ANGULAR_X),
      motorType: p.getAxisMotorType(hinge, PhysicsConstraintAxis.ANGULAR_X),
      motorMaxForce: p.getAxisMotorMaxForce(hinge, PhysicsConstraintAxis.ANGULAR_X),
      minLimit: p.getAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X),
      maxLimit: p.getAxisMaxLimit(hinge, PhysicsConstraintAxis.ANGULAR_X),
      getAxisMotorTargetAfterSet07: motorTargetGet,
      rawGetAxisMotorTarget: rawTarget,
      initOptions: hinge._initOptions ? { perpAxisA: v3(hinge._initOptions.perpAxisA!), perpAxisB: v3(hinge._initOptions.perpAxisB!) } : null,
      bodies: hinge.getBodiesUsingConstraint().map((b) => [b.parentBody.transformNode.name, b.childBody.transformNode.name]),
    };
    // modes of the other built-in types
    const typeModes: Record<string, number[]> = {};
    const mk: Record<string, () => PhysicsConstraint> = {
      BALL: () => new BallAndSocketConstraint(Vector3.Zero(), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene),
      LOCK: () => new LockConstraint(Vector3.Zero(), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene),
      PRISMATIC: () => new PrismaticConstraint(Vector3.Zero(), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene),
      SLIDER: () => new SliderConstraint(Vector3.Zero(), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene),
      DISTANCE: () => new DistanceConstraint(1, w.scene),
      SIXDOF_EMPTY: () => new Physics6DoFConstraint({}, [], w.scene),
    };
    for (const k of Object.keys(mk)) {
      const a = makeBox(w.scene, "a" + k, new Vector3(0.2, 0.2, 0.2), new Vector3(20, 0, 0), { motion: PhysicsMotionType.STATIC });
      const b = makeBox(w.scene, "b" + k, new Vector3(0.2, 0.2, 0.2), new Vector3(20, 0, 0));
      const c = mk[k]();
      a.addConstraint(b, c);
      typeModes[k] = [0, 1, 2, 3, 4, 5, 6].map((i) => p.getAxisMode(c, i as PhysicsConstraintAxis) as number);
      if (k === "DISTANCE") typeModes[k + "_limits"] = [p.getAxisMinLimit(c, PhysicsConstraintAxis.LINEAR_DISTANCE)!, p.getAxisMaxLimit(c, PhysicsConstraintAxis.LINEAR_DISTANCE)!];
      c.dispose();
    }
    out.typeModes = typeModes; // order LINEAR_X,Y,Z, ANGULAR_X,Y,Z, LINEAR_DISTANCE
    w.dispose();
  }

  // ---------- 3. collisions between connected bodies, enable/disable, dispose, leak counts, double add
  {
    const w = await makeWorld(hk);
    const base = hkStats(hk);
    const ground = makeBox(w.scene, "ground", new Vector3(10, 0.2, 10), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    // A static post and an overlapping dynamic box attached by a ball socket at the post top
    const post = makeBox(w.scene, "post", new Vector3(0.2, 1, 0.2), new Vector3(0, 1.5, 0), { motion: PhysicsMotionType.STATIC });
    const bob = makeBox(w.scene, "bob", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 1.8, 0), { mass: 5 }); // overlaps post
    const ball = new BallAndSocketConstraint(new Vector3(0, 0.5, 0), new Vector3(0, 0.25, 0), Vector3.Up(), Vector3.Up(), w.scene);
    post.addConstraint(bob, ball);
    stepN(w.scene, 60);
    const posNoColl = bob.transformNode.position.clone();
    const statsWith = hkStats(hk);
    // toggle collisions on -> the overlapping box is pushed out
    ball.isCollisionsEnabled = true;
    stepN(w.scene, 60);
    const posColl = bob.transformNode.position.clone();
    ball.isCollisionsEnabled = false;
    // disable: the box falls freely
    ball.isEnabled = false;
    stepN(w.scene, 30);
    const posDisabled = bob.transformNode.position.clone();
    const enabledFlag = ball.isEnabled;
    ball.isEnabled = true; // re-enable while far away: snaps back?
    stepN(w.scene, 1);
    const vAfterReenable = bob.getLinearVelocity().length();
    stepN(w.scene, 59);
    const posReenabled = bob.transformNode.position.clone();
    ball.dispose();
    const pd = (ball as unknown as { _pluginData: unknown[] })._pluginData.length;
    let afterDisposeIsEnabled: unknown;
    try { afterDisposeIsEnabled = ball.isEnabled; } catch (e) { afterDisposeIsEnabled = "throws"; }
    let doubleDispose = "ok";
    try { ball.dispose(); } catch (e) { doubleDispose = "throws " + String(e).slice(0, 80); }
    stepN(w.scene, 30);
    const statsAfterDispose = hkStats(hk);
    out.connectedCollisions = {
      bobYDefault_noCollision: r3(posNoColl.y), bobYCollisionsEnabled: r3(posColl.y),
      afterDisable30steps: v3(posDisabled), isEnabledGetterAfterDisable: enabledFlag,
      reenabledFarAway_vAfter1Step: r3(vAfterReenable), reenabledPos: v3(posReenabled),
      pluginDataLenAfterDispose: pd, isEnabledAfterDispose: afterDisposeIsEnabled, doubleDispose,
      statsBase: base, statsWith, statsAfterDispose,
    };

    // same constraint object added to two pairs
    const a1 = makeBox(w.scene, "a1", new Vector3(0.2, 0.2, 0.2), new Vector3(3, 2, 0), { motion: PhysicsMotionType.STATIC });
    const b1 = makeBox(w.scene, "b1", new Vector3(0.2, 0.2, 0.2), new Vector3(3, 1.5, 0), { mass: 1 });
    const a2 = makeBox(w.scene, "a2", new Vector3(0.2, 0.2, 0.2), new Vector3(5, 2, 0), { motion: PhysicsMotionType.STATIC });
    const b2 = makeBox(w.scene, "b2", new Vector3(0.2, 0.2, 0.2), new Vector3(5, 1.5, 0), { mass: 1 });
    const shared = new DistanceConstraint(0.5, w.scene);
    a1.addConstraint(b1, shared);
    a2.addConstraint(b2, shared);
    stepN(w.scene, 60);
    out.sharedConstraint = {
      joints: (shared as unknown as { _pluginData: unknown[] })._pluginData.length,
      pairs: shared.getBodiesUsingConstraint().length,
      b1y: r3(b1.transformNode.position.y), b2y: r3(b2.transformNode.position.y),
      constraintsInHavok: hkStats(hk).constraints,
    };
    shared.dispose();

    // dispose a BODY that still has a constraint, then step, then dispose the constraint
    const a3 = makeBox(w.scene, "a3", new Vector3(0.2, 0.2, 0.2), new Vector3(-3, 2, 0), { motion: PhysicsMotionType.STATIC });
    const b3 = makeBox(w.scene, "b3", new Vector3(0.2, 0.2, 0.2), new Vector3(-3, 1.5, 0), { mass: 1 });
    const h3 = new BallAndSocketConstraint(new Vector3(0, -0.5, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    a3.addConstraint(b3, h3);
    stepN(w.scene, 5);
    let bodyDisposeResult = "ok";
    try {
      b3.shape?.dispose();
      b3.dispose();
      stepN(w.scene, 30);
      const s1 = hkStats(hk);
      const en = h3.isEnabled;
      h3.dispose();
      stepN(w.scene, 5);
      bodyDisposeResult = `ok: enabledAfterBodyDispose=${en} constraintsBeforeConstraintDispose=${s1.constraints} after=${hkStats(hk).constraints}`;
    } catch (e) { bodyDisposeResult = "throws " + String(e).slice(0, 160); }
    out.disposeBodyWithConstraint = bodyDisposeResult;
    // new body reusing the id after a constrained body was disposed (constraint not disposed!)
    const a4 = makeBox(w.scene, "a4", new Vector3(0.2, 0.2, 0.2), new Vector3(-6, 2, 0), { motion: PhysicsMotionType.STATIC });
    const b4 = makeBox(w.scene, "b4", new Vector3(0.2, 0.2, 0.2), new Vector3(-6, 1.5, 0), { mass: 1 });
    const h4 = new BallAndSocketConstraint(new Vector3(0, -0.5, 0), Vector3.Zero(), Vector3.Up(), Vector3.Up(), w.scene);
    a4.addConstraint(b4, h4);
    stepN(w.scene, 2);
    const b4Shape = b4.shape;
    b4.dispose(); // constraint h4 intentionally NOT disposed
    b4Shape?.dispose();
    const fresh = makeBox(w.scene, "freshAfterIdReuse", new Vector3(0.2, 0.2, 0.2), new Vector3(10, 3, 10), { mass: 1 });
    stepN(w.scene, 60);
    out.idReuseAfterDisposedConstrainedBody = {
      freshPos: v3(fresh.transformNode.position), expectedFreeFall: "x=10,z=10, y≈3-4.9*1=-1.9 (or ground)",
      h4Enabled: h4.isEnabled,
    };
    h4.dispose();
    ground.dispose();
    w.dispose();
  }

  // ---------- 4. applied impulses (HP_Constraint_GetAppliedImpulses)
  {
    const w = await makeWorld(hk);
    const g = 9.81, dt = 1 / 60;
    // (a) 20 kg door hanging from one ball socket at its top-left corner -> after settling: lin = m g dt up
    const ceil = makeBox(w.scene, "ceil", new Vector3(0.2, 0.2, 0.2), new Vector3(0, 3, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2, 0.04), new Vector3(0.45, 2, 0), { mass: 20 });
    door.setAngularDamping(5); door.setLinearDamping(1);
    const bs = new BallAndSocketConstraint(new Vector3(0, -0.1, 0), new Vector3(-0.45, 1, 0), Vector3.Up(), Vector3.Up(), w.scene);
    ceil.addConstraint(door, bs);
    stepN(w.scene, 600);
    const ia = appliedImpulses(hk, bs);
    const doorCom = door.transformNode.position;
    // (b) cantilever: 20 kg door on a vertical HINGE (axis Y) through its left edge, no limits -> torque m g d about horizontal axis
    const jamb = makeBox(w.scene, "jamb", new Vector3(0.1, 2.1, 0.1), new Vector3(5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const d2 = makeBox(w.scene, "d2", new Vector3(0.9, 2, 0.04), new Vector3(5.5, 1.05, 0), { mass: 20 });
    const hinge = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
    jamb.addConstraint(d2, hinge);
    stepN(w.scene, 120);
    const ib = appliedImpulses(hk, hinge);
    // (c) same but door rotated by an impulse: does the reading follow the motion? sample per step
    const samples: unknown[] = [];
    d2.applyImpulse(new Vector3(0, 0, 10), localToWorld(d2, new Vector3(0.45, 0, 0)), );
    for (let i = 0; i < 6; i++) { stepN(w.scene, 1); const s = appliedImpulses(hk, hinge); samples.push({ lin: v3(s.lin), ang: v3(s.ang), angle: deg(relAngle(jamb, d2, Vector3.Up(), new Vector3(1, 0, 0))) }); }
    out.appliedImpulses = {
      hangingBall: { lin: v3(ia.lin), ang: v3(ia.ang), expectLinY_mgdt: r3(20 * g * dt), doorCom: v3(doorCom), result: hk.HP_Constraint_GetAppliedImpulses(jointId(bs))[0] === hk.Result.RESULT_OK },
      cantileverHinge: { lin: v3(ib.lin), ang: v3(ib.ang), expectLinY: r3(20 * g * dt), expectAngAboutZ_mgd_dt: r3(20 * g * 0.45 * dt), forceN: r3(ib.lin.length() / dt), torqueNm: r3(ib.ang.length() / dt) },
      afterKickSamples: samples,
    };
    w.dispose();
  }

  // ---------- 5. Enum values
  out.enums = {
    PhysicsConstraintType: { BALL: PhysicsConstraintType.BALL_AND_SOCKET, DIST: PhysicsConstraintType.DISTANCE, HINGE: PhysicsConstraintType.HINGE, SLIDER: PhysicsConstraintType.SLIDER, LOCK: PhysicsConstraintType.LOCK, PRISMATIC: PhysicsConstraintType.PRISMATIC, SIX_DOF: PhysicsConstraintType.SIX_DOF },
    LimitMode: { FREE: PhysicsConstraintAxisLimitMode.FREE, LIMITED: PhysicsConstraintAxisLimitMode.LIMITED, LOCKED: PhysicsConstraintAxisLimitMode.LOCKED },
    Motor: { NONE: PhysicsConstraintMotorType.NONE, VELOCITY: PhysicsConstraintMotorType.VELOCITY, POSITION: PhysicsConstraintMotorType.POSITION },
  };
  return out;
}
