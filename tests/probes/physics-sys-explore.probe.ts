// Exploratory measurements that informed src/physics/physics.ts (kept as documentation of the facts).
// A: activation/wake semantics of setEventMask / shape assignment / startAsleep
// B: live leaf-filter changes on bodies already using the shape
// C: raw collision-event body ids vs Babylon body ids
// D: shape-less static body as a constraint anchor
// E: hinge POSITION motor as a latch (holds below max torque, gives above)
// F: spinning small shards vs 5 cm static slab at 1..4 substeps
import {
  NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType,
  PhysicsShapeBox, PhysicsShapeContainer, PhysicsConstraint, PhysicsConstraintType, PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode, PhysicsConstraintMotorType,
} from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

async function world(gravity = -9.81) {
  const hk = (await HavokPhysics({ locateFile: () => havokWasmUrl })) as HavokPhysicsWithBindings;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, gravity, 0), plugin);
  scene.physicsEnabled = false;
  const step = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dt * 1000);
  };
  const awake = (b: PhysicsBody) => hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.ACTIVE;
  const body = (pos: Vector3, motion: PhysicsMotionType, asleep = false, name = "b", rot?: Quaternion) => {
    const n = new TransformNode(name, scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, asleep, scene);
  };
  const box = (size: Vector3, center = Vector3.Zero()) => new PhysicsShapeBox(center, Quaternion.Identity(), size, scene);
  return { hk, engine, scene, plugin, step, awake, body, box };
}
const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---------------------------------------------------------------- A: wake semantics
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    floor.shape = w.box(new Vector3(20, 1, 20));
    const a: Record<string, unknown> = {};
    // startAsleep resting on the floor, shape assigned after construction
    const b1 = w.body(new Vector3(0, 0.25, 0), PhysicsMotionType.DYNAMIC, true, "b1");
    a.afterCreateNoShape = w.awake(b1);
    b1.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    a.afterShape = w.awake(b1);
    b1.setEventMask(3);
    a.afterEventMask = w.awake(b1);
    w.hk.HP_Body_SetActivationState(b1._pluginData.hpBodyId, w.hk.ActivationState.INACTIVE);
    a.afterForceInactive = w.awake(b1);
    w.step(30);
    a.after30Steps = w.awake(b1);
    // mid-air asleep
    const b2 = w.body(new Vector3(3, 2, 0), PhysicsMotionType.DYNAMIC, true, "b2");
    b2.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    b2.setEventMask(3);
    w.hk.HP_Body_SetActivationState(b2._pluginData.hpBodyId, w.hk.ActivationState.INACTIVE);
    w.step(30);
    a.midAirAsleep_y = r(b2.transformNode.position.y);
    // settled body: does re-assigning the shape wake it?
    const b3 = w.body(new Vector3(-3, 0.3, 0), PhysicsMotionType.DYNAMIC, false, "b3");
    const s3 = w.box(new Vector3(0.5, 0.5, 0.5));
    b3.shape = s3;
    w.step(120);
    a.settledAsleep = !w.awake(b3);
    b3.shape = s3;
    a.sameShapeReassignAwake = w.awake(b3);
    w.step(120);
    a.settledAgain = !w.awake(b3);
    b3.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    a.newShapeAwake = w.awake(b3);
    w.step(120);
    b3.setMotionType(PhysicsMotionType.STATIC);
    b3.setMotionType(PhysicsMotionType.DYNAMIC);
    a.staticToDynamicAwake = w.awake(b3);
    w.step(120);
    b3.setMassProperties({ mass: 3 });
    a.setMassPropsAwake = w.awake(b3);
    // impact wakes a force-slept body?
    const b4 = w.body(new Vector3(0, 3, 0), PhysicsMotionType.DYNAMIC, false, "b4");
    b4.shape = w.box(new Vector3(0.3, 0.3, 0.3));
    w.step(60);
    a.b1WokenByImpact = { b1y: r(b1.transformNode.position.y), b4y: r(b4.transformNode.position.y), b1Awake: w.awake(b1) };
    out.A_wake = a;
    w.engine.dispose();
  }

  // ---------------------------------------------------------------- B: live filter change
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    const fs = w.box(new Vector3(20, 1, 20));
    fs.filterMembershipMask = 1;
    fs.filterCollideMask = -1;
    floor.shape = fs;
    const mk = (x: number, container: boolean) => {
      const b = w.body(new Vector3(x, 0.25, 0), PhysicsMotionType.DYNAMIC, false, "f" + x);
      const leaf = w.box(new Vector3(0.5, 0.5, 0.5));
      leaf.filterMembershipMask = 2;
      leaf.filterCollideMask = -1;
      if (container) {
        const c = new PhysicsShapeContainer(w.scene);
        c.addChild(leaf);
        const leaf2 = w.box(new Vector3(0.5, 0.5, 0.5), new Vector3(0.6, 0, 0));
        leaf2.filterMembershipMask = 2;
        leaf2.filterCollideMask = -1;
        c.addChild(leaf2);
        b.shape = c;
        return { b, leaves: [leaf, leaf2] };
      }
      b.shape = leaf;
      return { b, leaves: [leaf] };
    };
    const awakeLeaf = mk(-4, false);
    const asleepLeaf = mk(0, false);
    const awakeCont = mk(4, true);
    w.step(150); // asleepLeaf settles & sleeps (others too); wake two of them
    const sleptBefore = [awakeLeaf, asleepLeaf, awakeCont].map((o) => !w.awake(o.b));
    w.hk.HP_Body_SetActivationState(awakeLeaf.b._pluginData.hpBodyId, w.hk.ActivationState.ACTIVE);
    w.hk.HP_Body_SetActivationState(awakeCont.b._pluginData.hpBodyId, w.hk.ActivationState.ACTIVE);
    for (const o of [awakeLeaf, asleepLeaf, awakeCont]) for (const l of o.leaves) w.hk.HP_Shape_SetFilterInfo(l._pluginData, [2, 2]); // no longer collides with floor (membership 1)
    const ys: number[][] = [];
    for (let i = 0; i < 10; i++) {
      w.step(1);
      ys.push([awakeLeaf, asleepLeaf, awakeCont].map((o) => r(o.b.transformNode.position.y, 3)));
    }
    out.B_liveFilter = { sleptBefore, yAfterSteps_awakeLeaf_asleepLeaf_awakeContainer: ys };
    w.engine.dispose();
  }

  // ---------------------------------------------------------------- C: raw event body ids
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    floor.shape = w.box(new Vector3(20, 1, 20));
    const ids: string[] = [String(floor._pluginData.hpBodyId[0])];
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 5; i++) {
      const b = w.body(new Vector3(i, 1 + i * 0.1, 0), PhysicsMotionType.DYNAMIC);
      b.shape = w.box(new Vector3(0.3, 0.3, 0.3));
      b.setEventMask(3);
      bodies.push(b);
      ids.push(String(b._pluginData.hpBodyId[0]));
    }
    // dispose one and create one: id reuse?
    bodies[2].dispose();
    const b6 = w.body(new Vector3(9, 1, 0), PhysicsMotionType.DYNAMIC);
    b6.shape = w.box(new Vector3(0.3, 0.3, 0.3));
    ids.push("new:" + String(b6._pluginData.hpBodyId[0]));
    const types: Record<number, number> = {};
    let rawEvents = 0;
    let pluginEvents = 0;
    w.plugin.onCollisionObservable.add(() => pluginEvents++);
    w.plugin.onCollisionEndedObservable.add(() => pluginEvents++);
    const hk = w.hk as unknown as { HP_World_GetCollisionEvents: (wd: unknown) => [unknown, number]; HP_World_GetNextCollisionEvent: (wd: number, p: number) => number };
    const origFirst = hk.HP_World_GetCollisionEvents.bind(w.hk);
    const origNext = hk.HP_World_GetNextCollisionEvent.bind(w.hk);
    const seenIds = new Set<number>();
    const visit = (addr: number) => {
      if (!addr) return;
      const i32 = new Int32Array(w.hk.HEAPU8.buffer, addr, 40);
      types[i32[0]] = (types[i32[0]] ?? 0) + 1;
      seenIds.add(i32[2]);
      seenIds.add(i32[18]);
      rawEvents++;
    };
    hk.HP_World_GetCollisionEvents = (wd) => { const res = origFirst(wd); visit(res[1]); return res; };
    hk.HP_World_GetNextCollisionEvent = (wd, p) => { const n = origNext(wd, p); visit(n); return n; };
    w.step(90);
    out.C_rawIds = { bodyIds: ids, rawEventTypes: types, rawEvents, pluginEvents, rawIdsSeen: [...seenIds].sort((x, y) => x - y), hpWords: String(b6._pluginData.hpBodyId.length) };
    w.engine.dispose();
  }

  // ---------------------------------------------------------------- D/E: shape-less anchor + motor latch
  {
    const w = await world();
    const anchor = w.body(Vector3.Zero(), PhysicsMotionType.STATIC, false, "anchor"); // no shape
    const door = w.body(new Vector3(0.45, 1.0, 0), PhysicsMotionType.DYNAMIC, false, "door");
    door.shape = w.box(new Vector3(0.9, 2.0, 0.04));
    door.shape.density = 500;
    door.shape = door.shape;
    const mass = door.getMassProperties().mass!;
    const c = new PhysicsConstraint(PhysicsConstraintType.HINGE, {
      pivotA: new Vector3(0, 1, 0), pivotB: new Vector3(-0.45, 0, 0),
      axisA: new Vector3(0, 1, 0), axisB: new Vector3(0, 1, 0),
      perpAxisA: new Vector3(1, 0, 0), perpAxisB: new Vector3(1, 0, 0), collision: false,
    }, w.scene);
    anchor.addConstraint(door, c);
    const P = w.plugin;
    P.setAxisMode(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
    P.setAxisMinLimit(c, PhysicsConstraintAxis.ANGULAR_X, -1.6);
    P.setAxisMaxLimit(c, PhysicsConstraintAxis.ANGULAR_X, 1.6);
    P.setAxisMotorType(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION);
    P.setAxisMotorTarget(c, PhysicsConstraintAxis.ANGULAR_X, 0);
    P.setAxisMotorMaxForce(c, PhysicsConstraintAxis.ANGULAR_X, 20); // N*m
    const yaw = () => {
      const q = door.transformNode.rotationQuaternion!;
      return r(2 * Math.atan2(q.y, q.w), 3);
    };
    w.step(30);
    const hang = { y: r(door.transformNode.position.y, 3), x: r(door.transformNode.position.x, 3), yaw: yaw() };
    const yawRad = () => { const q = door.transformNode.rotationQuaternion!; return 2 * Math.atan2(q.y, q.w); };
    // torque below the latch strength (push at the free edge with 15 N -> 13.5 N*m)
    const push = (forceN: number, steps: number) => {
      for (let i = 0; i < steps; i++) {
        const tip = door.transformNode.position.add(new Vector3(0.45 * Math.cos(-yawRad()), 0, 0.45 * Math.sin(-yawRad())));
        door.applyForce(new Vector3(0, 0, forceN), tip);
        w.step(1);
      }
    };
    push(15, 60);
    const below = yaw();
    push(60, 60);
    const above = yaw();
    // release the motor and fling it open
    P.setAxisMotorType(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.NONE);
    door.applyImpulse(new Vector3(0, 0, 10), door.transformNode.position.add(new Vector3(0.4, 0, 0)));
    let maxYaw = 0, minYaw = 0;
    for (let i = 0; i < 120; i++) { w.step(1); maxYaw = Math.max(maxYaw, yawRad()); minYaw = Math.min(minYaw, yawRad()); }
    const imp = (w.hk as unknown as { HP_Constraint_GetAppliedImpulses: (id: unknown) => [unknown, number[], number[]] }).HP_Constraint_GetAppliedImpulses(c._pluginData[0]);
    out.DE_anchorAndLatch = { doorMass: r(mass, 2), hang, yawUnder13_5Nm: below, yawUnder54Nm: above, afterRelease_yawRange: [r(minYaw, 3), r(maxYaw, 3)], appliedImpulses: imp.slice(1) };
    w.engine.dispose();
  }

  // ---------------------------------------------------------------- F: spinning shards vs static slab, substeps
  {
    const res: Record<string, string> = {};
    const w = await world(0);
    const slab = w.body(Vector3.Zero(), PhysicsMotionType.STATIC, false, "slab");
    slab.shape = w.box(new Vector3(0.05, 4, 4));
    const hkWorld = w.plugin.world;
    const stepSub = (n: number) => {
      const h = 1 / 60 / n;
      for (let i = 0; i < n; i++) {
        w.hk.HP_World_SetIdealStepTime(hkWorld, h);
        w.hk.HP_World_Step(hkWorld, h);
      }
      for (const b of w.scene.getPhysicsEngine()!.getBodies()) if (!b.disableSync) w.plugin.sync(b);
    };
    const shapes: Record<string, Vector3> = { cube2cm: new Vector3(0.02, 0.02, 0.02), sliver4x2x0_4cm: new Vector3(0.04, 0.02, 0.004), shard10x10x0_5cm: new Vector3(0.1, 0.1, 0.005) };
    for (const [name, size] of Object.entries(shapes)) {
      for (const spin of [0, 40, 100]) {
        for (const speed of [10, 30, 60]) {
          const row: string[] = [];
          for (const sub of [1, 2, 3, 4]) {
            let tunnels = 0;
            for (let trial = 0; trial < 6; trial++) {
              const b = w.body(new Vector3(-1.5, 0.37 * trial - 1, 0.21 * trial - 0.5), PhysicsMotionType.DYNAMIC, false, "p", Quaternion.RotationYawPitchRoll(trial * 0.7, trial * 1.3, trial * 0.4));
              const s = w.box(size);
              s.density = 2500;
              b.shape = s;
              b.setLinearVelocity(new Vector3(speed, 0, 0));
              b.setAngularVelocity(new Vector3(spin * 0.6, spin * 0.8, spin * 0.3));
              let crossed = false;
              let prev = b.transformNode.position.x;
              for (let i = 0; i < 30; i++) {
                stepSub(sub);
                const x = b.transformNode.position.x;
                if (prev < 0 && x > 0) crossed = true;
                prev = x;
              }
              if (crossed) tunnels++;
              b.dispose();
              s.dispose();
            }
            row.push(`${sub}:${tunnels}/6`);
          }
          res[`${name}_spin${spin}_v${speed}`] = row.join(" ");
        }
      }
    }
    out.F_ccd_tunnels_per_substeps = res;
    w.engine.dispose();
  }
  return out;
}
