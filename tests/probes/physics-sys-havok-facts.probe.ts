// Raw Babylon 9.30 / Havok 1.3.14 behaviours that src/physics/physics.ts works around (regression guard for engine
// upgrades: if a FACT flips, revisit the matching workaround). Uses the engine directly, not the physics system.
//  F1 small rotated BOX shapes (≤ ~3 cm) fall through static floors; the same geometry as an 8-point hull does not
//     → boxShape() emits hulls for small boxes.
//  F2 a filter change on a body's ROOT leaf shape is ignored until HP_Body_SetShape(0) + SetShape(shape)
//     → setLayer() refreshes bodies; Babylon's `body.shape = null` is a no-op for Havok.
//  F3 constraint motor type NONE is ignored (type stays POSITION); max force 0 disables the motor → disableMotor().
//  F4 HP_Constraint_Release keeps the constraint alive while its bodies live; detaching parent/child first frees it.
//  F5 startAsleep + first shape + setEventMask keep a body asleep; a later shape swap wakes it.
import { NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShape, PhysicsShapeType, PhysicsConstraint, PhysicsConstraintType, PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, PhysicsConstraintMotorType } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

async function world() {
  const hk = (await HavokPhysics({ locateFile: () => havokWasmUrl })) as HavokPhysicsWithBindings;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  scene.physicsEnabled = false;
  const body = (pos: Vector3, motion: PhysicsMotionType, rot?: Quaternion, asleep = false) => {
    const n = new TransformNode("n", scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, asleep, scene);
  };
  const box = (s: Vector3) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), s, scene);
  const hullBox = (s: Vector3) => {
    const pts: number[] = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) pts.push(x * s.x, y * s.y, z * s.z);
    const ptr = hk._malloc(pts.length * 4);
    new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
    const res = hk.HP_Shape_CreateConvexHull(ptr, 8);
    hk._free(ptr);
    const sh = new PhysicsShape({ pluginData: res[1] }, scene);
    (sh as unknown as { _type: number })._type = PhysicsShapeType.CONVEX_HULL;
    return sh;
  };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(1000 / 60);
  };
  const awake = (b: PhysicsBody) => hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.ACTIVE;
  return { hk, engine, scene, plugin, body, box, hullBox, step, awake };
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const rots = [0, 1, 2, 3, 4, 5].map((t) => Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1));

  // F1
  {
    const w = await world();
    w.body(new Vector3(0, -0.1, 0), PhysicsMotionType.STATIC).shape = w.box(new Vector3(40, 0.2, 40));
    const run = (hull: boolean) => {
      const bs = rots.map((q, t) => {
        const b = w.body(new Vector3(t - 3, 1, hull ? 2 : -2), PhysicsMotionType.DYNAMIC, q);
        b.shape = hull ? w.hullBox(new Vector3(0.02, 0.02, 0.02)) : w.box(new Vector3(0.02, 0.02, 0.02));
        return b;
      });
      w.step(90);
      return bs.filter((b) => b.transformNode.position.y < -0.02).length;
    };
    const boxFell = run(false);
    const hullFell = run(true);
    out.F1_smallRotatedBoxesTunnel = { FACT: boxFell > 0 && hullFell === 0, boxFellThrough: `${boxFell}/6`, hullFellThrough: `${hullFell}/6` };
    w.engine.dispose();
  }

  // F2
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    const fs = w.box(new Vector3(40, 1, 40));
    w.hk.HP_Shape_SetFilterInfo(fs._pluginData, [1, -1]);
    floor.shape = fs;
    const mk = (x: number) => {
      const b = w.body(new Vector3(x, 0.25, 0), PhysicsMotionType.DYNAMIC);
      const s = w.box(new Vector3(0.5, 0.5, 0.5));
      w.hk.HP_Shape_SetFilterInfo(s._pluginData, [2, -1]);
      b.shape = s;
      return { b, s };
    };
    const plain = mk(-2), babylonNull = mk(0), refreshed = mk(2);
    w.step(10);
    for (const o of [plain, babylonNull, refreshed]) w.hk.HP_Shape_SetFilterInfo(o.s._pluginData, [2, 2]);
    babylonNull.b.shape = null;
    babylonNull.b.shape = babylonNull.s;
    w.hk.HP_Body_SetShape(refreshed.b._pluginData.hpBodyId, [BigInt(0)] as never);
    w.hk.HP_Body_SetShape(refreshed.b._pluginData.hpBodyId, refreshed.s._pluginData);
    w.step(30);
    const y = (o: { b: PhysicsBody }) => Math.round(o.b.transformNode.position.y * 1000) / 1000;
    out.F2_rootFilterNeedsShapeRefresh = { FACT: y(plain) > 0.2 && y(babylonNull) > 0.2 && y(refreshed) < 0, yPlain: y(plain), yBabylonNullReassign: y(babylonNull), yRawRefresh: y(refreshed) };
    w.engine.dispose();
  }

  // F3 + F4
  {
    const w = await world();
    const anchor = w.body(Vector3.Zero(), PhysicsMotionType.STATIC);
    const door = w.body(new Vector3(0.45, 1, 0), PhysicsMotionType.DYNAMIC);
    door.shape = w.box(new Vector3(0.9, 2, 0.04));
    const mkHinge = () => {
      const c = new PhysicsConstraint(PhysicsConstraintType.HINGE, { pivotA: new Vector3(0, 1, 0), pivotB: new Vector3(-0.45, 0, 0), axisA: new Vector3(0, 1, 0), axisB: new Vector3(0, 1, 0), perpAxisA: new Vector3(1, 0, 0), perpAxisB: new Vector3(1, 0, 0) }, w.scene);
      anchor.addConstraint(door, c);
      return c;
    };
    const ax = PhysicsConstraintAxis.ANGULAR_X;
    const c = mkHinge();
    w.plugin.setAxisMode(c, ax, PhysicsConstraintAxisLimitMode.FREE);
    w.plugin.setAxisMotorType(c, ax, PhysicsConstraintMotorType.POSITION);
    w.plugin.setAxisMotorMaxForce(c, ax, 30);
    w.plugin.setAxisMotorType(c, ax, PhysicsConstraintMotorType.NONE);
    const typeAfterNone = w.plugin.getAxisMotorType(c, ax);
    out.F3_motorTypeNoneIgnored = { FACT: typeAfterNone === PhysicsConstraintMotorType.POSITION, motorTypeAfterSettingNone: typeAfterNone };
    const count = () => w.hk.HP_GetStatistics()[1][2];
    const before = count();
    const plainId = c._pluginData[0];
    w.hk.HP_Constraint_SetEnabled(plainId, false as unknown as number);
    w.hk.HP_Constraint_Release(plainId);
    c._pluginData.length = 0;
    const afterPlain = count();
    const c2 = mkHinge();
    const id2 = c2._pluginData[0];
    w.hk.HP_Constraint_SetEnabled(id2, false as unknown as number);
    w.hk.HP_Constraint_SetParentBody(id2, [BigInt(0)] as never);
    w.hk.HP_Constraint_SetChildBody(id2, [BigInt(0)] as never);
    w.hk.HP_Constraint_Release(id2);
    c2._pluginData.length = 0;
    const afterDetach = count();
    out.F4_constraintReleaseNeedsDetach = { FACT: afterPlain === before && afterDetach === before, countWithOne: before, afterPlainRelease: afterPlain, afterDetachThenRelease_ofASecond: afterDetach };
    w.engine.dispose();
  }

  // F5
  {
    const w = await world();
    w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC).shape = w.box(new Vector3(20, 1, 20));
    const b = w.body(new Vector3(0, 0.25, 0), PhysicsMotionType.DYNAMIC, undefined, true);
    b.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    b.setEventMask(7);
    const asleepAfterSetup = !w.awake(b);
    w.step(5);
    b.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    const awakeAfterSwap = w.awake(b);
    out.F5_wakeSemantics = { FACT: asleepAfterSetup && awakeAfterSwap, asleepAfterFirstShapeAndMask: asleepAfterSetup, awakeAfterShapeSwap: awakeAfterSwap };
    w.engine.dispose();
  }
  return out;
}
