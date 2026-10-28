// Q1 (body on TransformNode, parent, prestep, teleport), Q5 (motion types), Q6 (velocity/forces/sleep)
import {
  Vector3, Quaternion, TransformNode, MeshBuilder, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsPrestepType,
  PhysicsActivationControl, PhysicsShapeSphere,
} from "@babylonjs/core";
import { makeWorld, stepN, r3, v3 } from "./physics-bodies-util";

export async function probe() {
  const out: Record<string, unknown> = {};
  const { scene, plugin, hk } = await makeWorld();
  const box = (size: number) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(size, size, size), scene);

  // ground
  const groundNode = new TransformNode("ground", scene);
  groundNode.position.y = -0.5;
  const ground = new PhysicsBody(groundNode, PhysicsMotionType.STATIC, false, scene);
  ground.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(100, 1, 100), scene);

  // ---------- Q1a: plain TransformNode as body node ----------
  {
    const tn = new TransformNode("tn", scene);
    tn.position.set(0, 5, 0);
    const child = MeshBuilder.CreateBox("visual", { size: 0.5 }, scene);
    child.parent = tn; // visual child follows the physics root
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = box(0.5);
    out.q1a_defaults = {
      disablePreStep: b.disablePreStep, prestepType: b.getPrestepType(), disableSync: b.disableSync,
      rotationQuaternionCreated: !!tn.rotationQuaternion,
      linDamping: b.getLinearDamping(), angDamping: b.getAngularDamping(), gravityFactor: b.getGravityFactor(),
      motionTypeGetter: b.motionType,
    };
    stepN(scene, 30);
    child.computeWorldMatrix(true);
    out.q1a_after30 = { tnY: r3(tn.position.y), childWorldY: r3(child.getAbsolutePosition().y) };
    b.dispose();
    tn.dispose();
  }

  // ---------- Q1b: node with a transformed parent ----------
  {
    const parent = new TransformNode("parent", scene);
    parent.position.set(10, 0, 0);
    parent.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
    parent.scaling.set(2, 2, 2);
    const tn = new TransformNode("childBody", scene);
    tn.parent = parent;
    tn.position.set(0, 5, 0); // local; world = (10, 10, 0) because parent scale 2
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = box(0.5);
    const hkPos0 = hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0];
    stepN(scene, 30);
    tn.computeWorldMatrix(true);
    const hkPos1 = hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0];
    out.q1b_parented = {
      havokInitialPos: hkPos0.map(r3),
      afterLocalPos: v3(tn.position),
      afterWorldPos: v3(tn.getAbsolutePosition()),
      havokPosAfter: hkPos1.map(r3),
      localScalingKept: v3(tn.scaling),
    };
    b.dispose();
    tn.dispose();
    parent.dispose();
  }

  // ---------- Q1c: teleporting a dynamic body ----------
  {
    const tn = new TransformNode("tele", scene);
    tn.position.set(0, 3, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = box(0.5);
    stepN(scene, 10);
    // (1) naive: just move node with disablePreStep=true (default) -> overwritten by sync
    tn.position.set(20, 3, 0);
    stepN(scene, 1);
    const naive = v3(tn.position);
    // (2) disablePreStep=false for one step
    tn.position.set(20, 3, 0);
    b.disablePreStep = false;
    stepN(scene, 1);
    b.disablePreStep = true;
    const viaPrestep = v3(tn.position);
    const velAfterPrestep = v3(b.getLinearVelocity());
    // (3) immediate: TELEPORT prestep + plugin.setPhysicsBodyTransformation, + zero velocities
    tn.position.set(-20, 6, 0);
    b.setPrestepType(PhysicsPrestepType.TELEPORT);
    plugin.setPhysicsBodyTransformation(b, tn);
    b.setPrestepType(PhysicsPrestepType.DISABLED);
    b.setLinearVelocity(Vector3.Zero());
    b.setAngularVelocity(Vector3.Zero());
    const hkImmediate = hk.HP_Body_GetQTransform(b._pluginData.hpBodyId)[1][0].map(r3);
    stepN(scene, 1);
    const viaSetTransformation = v3(tn.position);
    // (4) raw Havok
    hk.HP_Body_SetQTransform(b._pluginData.hpBodyId, [[5, 8, 5], [0, 0, 0, 1]]);
    stepN(scene, 1);
    const viaRaw = v3(tn.position);
    out.q1c_teleport = { naive, viaPrestep, velAfterPrestep, hkImmediate, viaSetTransformation, viaRaw };
    b.dispose();
    tn.dispose();
  }

  // ---------- Q5: motion type switching ----------
  {
    const tn = new TransformNode("s2d", scene);
    tn.position.set(3, 3, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.STATIC, false, scene);
    b.shape = box(0.5);
    const massStatic = b.getMassProperties();
    stepN(scene, 30);
    const yStatic = r3(tn.position.y);
    b.setMotionType(PhysicsMotionType.DYNAMIC);
    const massDyn = b.getMassProperties();
    const state0 = hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1];
    stepN(scene, 30);
    const yDyn = r3(tn.position.y);
    out.q5_static_to_dynamic = {
      yStatic, yDynAfter30: yDyn, disableSyncAfter: b.disableSync,
      massWhileStatic: r3(massStatic.mass!), massAfterSwitch: r3(massDyn.mass!),
      activationRightAfterSwitch: state0 === hk.ActivationState.ACTIVE ? "ACTIVE" : "INACTIVE",
    };
    // DYNAMIC -> STATIC mid-air
    tn.position.set(3, 4, 0);
    b.disablePreStep = false; stepN(scene, 1); b.disablePreStep = true;
    stepN(scene, 10);
    b.setMotionType(PhysicsMotionType.STATIC);
    const yAtFreeze = r3(tn.position.y);
    stepN(scene, 30);
    out.q5_dynamic_to_static = { yAtFreeze, yAfter30: r3(tn.position.y), vel: v3(b.getLinearVelocity()), disableSync: b.disableSync };
    b.dispose();
    tn.dispose();
  }
  // ANIMATED: (a) setTargetTransform each step, (b) prestep ACTION + move node, (c) setLinearVelocity
  {
    const pusherNode = new TransformNode("pusher", scene);
    pusherNode.position.set(-3, 0.5, 10);
    const pusher = new PhysicsBody(pusherNode, PhysicsMotionType.ANIMATED, false, scene);
    pusher.shape = box(1);
    const victimNode = new TransformNode("victim", scene);
    victimNode.position.set(0, 0.25, 10);
    const victim = new PhysicsBody(victimNode, PhysicsMotionType.DYNAMIC, false, scene);
    victim.shape = box(0.5);
    const target = new Vector3(-3, 0.5, 10);
    const q = Quaternion.Identity();
    let n = 0;
    const obs = scene.onBeforePhysicsObservable.add(() => {
      target.x = -3 + (n++ / 60) * 2; // 2 m/s along +x
      pusher.setTargetTransform(target, q);
    });
    stepN(scene, 120);
    scene.onBeforePhysicsObservable.remove(obs);
    out.q5_animated_setTargetTransform = {
      pusherX: r3(pusherNode.position.x), pusherY: r3(pusherNode.position.y), victimX: r3(victimNode.position.x),
      pusherVel: v3(pusher.getLinearVelocity()), animatedDisableSync: pusher.disableSync,
    };
    // (b) ACTION prestep: just move the node
    pusher.setPrestepType(PhysicsPrestepType.ACTION);
    for (let i = 0; i < 60; i++) {
      pusherNode.position.x += 2 / 60;
      stepN(scene, 1);
    }
    out.q5_animated_actionPrestep = { pusherX: r3(pusherNode.position.x), victimX: r3(victimNode.position.x), pusherVel: v3(pusher.getLinearVelocity()) };
    pusher.setPrestepType(PhysicsPrestepType.DISABLED);
    // (c) kinematic velocity
    pusher.setLinearVelocity(new Vector3(0, 1, 0));
    stepN(scene, 60);
    out.q5_animated_velocity = { pusherY: r3(pusherNode.position.y), velAfter: v3(pusher.getLinearVelocity()) };
    pusher.dispose(); victim.dispose(); pusherNode.dispose(); victimNode.dispose();
  }

  // ---------- Q6: velocities, impulses, forces, damping, gravity factor ----------
  {
    const tn = new TransformNode("v", scene);
    tn.position.set(0, 50, 50);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = box(1);
    b.setMassProperties({ mass: 2 });
    b.setGravityFactor(0);
    b.setLinearDamping(0);
    b.setAngularDamping(0);
    // setLinearVelocity then 60 steps -> distance
    b.setLinearVelocity(new Vector3(5, 0, 0));
    stepN(scene, 60);
    const distAfter1s = r3(tn.position.x);
    const vOut = new Vector3();
    b.getLinearVelocityToRef(vOut);
    // impulse at COM: mass 2, impulse 2 -> dv = 1
    b.setLinearVelocity(Vector3.Zero());
    b.applyImpulse(new Vector3(2, 0, 0), tn.position.clone());
    const vImmediate = v3(b.getLinearVelocity()); // before step
    stepN(scene, 1);
    const vAfterImpulse = v3(b.getLinearVelocity());
    // off-centre impulse -> spin
    b.setLinearVelocity(Vector3.Zero());
    b.applyImpulse(new Vector3(0, 0, 1), tn.position.add(new Vector3(0.5, 0, 0)));
    stepN(scene, 1);
    const angAfterOffImpulse = v3(b.getAngularVelocity());
    b.setAngularVelocity(Vector3.Zero());
    b.setLinearVelocity(Vector3.Zero());
    // applyForce single call: dv = F*fixedTimeStep/m
    b.applyForce(new Vector3(12, 0, 0), tn.position.clone());
    stepN(scene, 1);
    const vAfterOneForceCall = v3(b.getLinearVelocity());
    // damping
    b.setLinearVelocity(new Vector3(10, 0, 0));
    b.setLinearDamping(1);
    stepN(scene, 60);
    const vAfterDamping1for1s = v3(b.getLinearVelocity());
    b.setLinearDamping(0);
    // default angular damping effect
    b.setAngularDamping(0.05);
    b.setAngularVelocity(new Vector3(0, 10, 0));
    stepN(scene, 60);
    const angAfterDefaultDamp1s = v3(b.getAngularVelocity());
    out.q6_velocity = {
      distAfter1s, vOut: v3(vOut), vImmediate, vAfterImpulse, angAfterOffImpulse, vAfterOneForceCall,
      vAfterDamping1for1s, angAfterDefaultDamp1s, gravityFactor: b.getGravityFactor(), timeStep: plugin.getTimeStep(),
      maxLinVel: plugin.getMaxLinearVelocity(), maxAngVel: plugin.getMaxAngularVelocity(),
    };
    b.dispose(); tn.dispose();
  }

  // ---------- Q6: sleeping / activation ----------
  {
    const act = (b: PhysicsBody) => (hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.ACTIVE ? "A" : "I");
    const tn = new TransformNode("sleep", scene);
    tn.position.set(0, 0.25, -10);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = box(0.5);
    let sleptAt = -1;
    for (let i = 1; i <= 600; i++) {
      stepN(scene, 1);
      if (sleptAt < 0 && act(b) === "I") { sleptAt = i; break; }
    }
    // does setLinearVelocity wake? does applyImpulse wake?
    b.setLinearVelocity(new Vector3(0, 0, 1));
    const afterSetVel = act(b);
    stepN(scene, 1);
    const zAfterSetVel = r3(tn.position.z);
    // put back to sleep explicitly
    b.setLinearVelocity(Vector3.Zero());
    hk.HP_Body_SetActivationState(b._pluginData.hpBodyId, hk.ActivationState.INACTIVE);
    const afterForceSleep = act(b);
    b.applyImpulse(new Vector3(0, 0, 0.1), tn.position.clone());
    const afterImpulse = act(b);
    // startsAsleep in mid-air
    const tn2 = new TransformNode("asleep", scene);
    tn2.position.set(5, 3, -10);
    const b2 = new PhysicsBody(tn2, PhysicsMotionType.DYNAMIC, true, scene);
    b2.shape = box(0.5);
    const b2state0 = act(b2);
    stepN(scene, 60);
    const b2yAfter60 = r3(tn2.position.y);
    const b2state1 = act(b2);
    hk.HP_Body_SetActivationState(b2._pluginData.hpBodyId, hk.ActivationState.ACTIVE);
    stepN(scene, 30);
    const b2yAfterWake = r3(tn2.position.y);
    // ALWAYS_ACTIVE
    const tn3 = new TransformNode("aa", scene);
    tn3.position.set(-5, 0.25, -10);
    const b3 = new PhysicsBody(tn3, PhysicsMotionType.DYNAMIC, false, scene);
    b3.shape = new PhysicsShapeSphere(Vector3.Zero(), 0.25, scene);
    plugin.setActivationControl(b3, PhysicsActivationControl.ALWAYS_ACTIVE);
    stepN(scene, 600);
    out.q6_sleep = {
      stepsUntilRestingBoxSleeps: sleptAt, afterSetVel, zAfterSetVel, afterForceSleep, afterImpulse,
      startsAsleep: { b2state0, b2yAfter60, b2state1, b2yAfterWake },
      alwaysActiveAfter600: act(b3),
      activationEnumIsObject: typeof hk.ActivationState.ACTIVE,
    };
  }
  return out;
}
