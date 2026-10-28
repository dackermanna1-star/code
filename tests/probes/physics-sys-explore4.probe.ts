// Follow-up 3: box-vs-hull size sweep for the rotated-small-box tunnelling; wake semantics; filter refresh side effects.
import { NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShape, PhysicsShapeType } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

let hkShared: HavokPhysicsWithBindings | null = null;
async function world(gravity = -9.81) {
  if (!hkShared) hkShared = (await HavokPhysics({ locateFile: () => havokWasmUrl })) as HavokPhysicsWithBindings;
  const hk = hkShared;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, gravity, 0), plugin);
  scene.physicsEnabled = false;
  const body = (pos: Vector3, motion: PhysicsMotionType, rot?: Quaternion, asleep = false) => {
    const n = new TransformNode("n", scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, asleep, scene);
  };
  const box = (size: Vector3) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
  const hullBox = (size: Vector3) => {
    const pts: number[] = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) pts.push(sx * size.x, sy * size.y, sz * size.z);
    const ptr = hk._malloc(pts.length * 4);
    new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
    const res = hk.HP_Shape_CreateConvexHull(ptr, 8);
    hk._free(ptr);
    const s = new PhysicsShape({ pluginData: res[1] }, scene);
    (s as unknown as { _type: number })._type = PhysicsShapeType.CONVEX_HULL;
    return s;
  };
  const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dt * 1000); };
  const awake = (b: PhysicsBody) => hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.ACTIVE;
  return { hk, engine, scene, plugin, body, box, hullBox, step, awake };
}
const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export async function probe() {
  const out: Record<string, unknown> = {};
  const rots = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1));
  // ---- size sweep: drop rotated boxes / hulls from 1 m onto a 20 cm static floor; count fall-throughs
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.1, 0), PhysicsMotionType.STATIC);
    floor.shape = w.box(new Vector3(60, 0.2, 60));
    const sizes: Record<string, Vector3> = {
      cube2: new Vector3(0.02, 0.02, 0.02), cube2_5: new Vector3(0.025, 0.025, 0.025), cube3: new Vector3(0.03, 0.03, 0.03),
      cube4: new Vector3(0.04, 0.04, 0.04), plate30x30x0_4: new Vector3(0.3, 0.004, 0.3), plate30x30x1_25: new Vector3(0.3, 0.0125, 0.3),
      plate10x10x0_5: new Vector3(0.1, 0.005, 0.1), plate5x5x0_4: new Vector3(0.05, 0.004, 0.05), stick2x2x30: new Vector3(0.02, 0.3, 0.02),
      sliver4x2x0_4: new Vector3(0.04, 0.004, 0.02), plank90x200x4: new Vector3(0.9, 2.0, 0.04),
    };
    const res: Record<string, string> = {};
    for (const [name, size] of Object.entries(sizes)) {
      for (const kind of ["box", "hull"] as const) {
        let s = "";
        const bodies: PhysicsBody[] = [];
        rots.forEach((q, t) => {
          const b = w.body(new Vector3(t * 2.5 - 9, 1.0, name.length), PhysicsMotionType.DYNAMIC, q);
          const sh = kind === "box" ? w.box(size) : w.hullBox(size);
          sh.density = 2500;
          b.shape = sh;
          bodies.push(b);
        });
        w.step(90);
        for (const b of bodies) {
          s += b.transformNode.position.y < -0.02 ? "T" : "s";
          const sh = b.shape!;
          b.dispose();
          sh.dispose();
        }
        res[`${name}_${kind}`] = s;
      }
    }
    out.sizeSweep_dropFrom1m = res;
    w.engine.dispose();
  }
  // ---- wake semantics
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    floor.shape = w.box(new Vector3(20, 1, 20));
    const a: Record<string, unknown> = {};
    const b1 = w.body(new Vector3(0, 0.25, 0), PhysicsMotionType.DYNAMIC, undefined, true);
    a.created_startAsleep_noShape_awake = w.awake(b1);
    b1.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    a.afterShape_awake = w.awake(b1);
    b1.setEventMask(3);
    a.afterEventMask_awake = w.awake(b1);
    const b2 = w.body(new Vector3(2, 0.25, 0), PhysicsMotionType.DYNAMIC, undefined, true);
    b2.setEventMask(3);
    a.b2_maskBeforeShape_awake = w.awake(b2);
    b2.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    a.b2_thenShape_awake = w.awake(b2);
    const b3 = w.body(new Vector3(-2, 0.3, 0), PhysicsMotionType.DYNAMIC);
    const s3 = w.box(new Vector3(0.5, 0.5, 0.5));
    b3.shape = s3;
    w.step(150);
    a.b3_settled_awake = w.awake(b3);
    w.hk.HP_Body_SetShape(b3._pluginData.hpBodyId, [BigInt(0)] as unknown as never);
    w.hk.HP_Body_SetShape(b3._pluginData.hpBodyId, s3._pluginData);
    a.b3_afterRawShapeRefresh_awake = w.awake(b3);
    w.step(5);
    a.b3_y_after5 = r(b3.transformNode.position.y);
    b3.shape = w.box(new Vector3(0.5, 0.5, 0.5));
    a.b3_newShapeBabylon_awake = w.awake(b3);
    w.step(150);
    b3.setLinearDamping(0.1);
    a.b3_setDamping_awake = w.awake(b3);
    b3.setMotionType(PhysicsMotionType.STATIC);
    a.b3_toStatic_awake = w.awake(b3);
    b3.setMotionType(PhysicsMotionType.DYNAMIC);
    a.b3_toDynamic_awake = w.awake(b3);
    w.step(150);
    b3.setMotionType(PhysicsMotionType.ANIMATED);
    a.b3_toAnimated_awake = w.awake(b3);
    w.step(150);
    a.b3_animatedAfter150_awake = w.awake(b3);
    const st = w.body(new Vector3(5, 0, 0), PhysicsMotionType.STATIC);
    st.shape = w.box(new Vector3(1, 1, 1));
    a.static_awake = w.awake(st);
    out.wake = a;
    w.engine.dispose();
  }
  return out;
}
