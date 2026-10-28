// Follow-up exploration: tunnelling vs. body reuse/stepping method; root-shape filter refresh.
import { NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType, PhysicsShapeBox } from "@babylonjs/core";
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
  const body = (pos: Vector3, motion: PhysicsMotionType, rot?: Quaternion) => {
    const n = new TransformNode("n", scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, false, scene);
  };
  const box = (size: Vector3) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size, scene);
  const awake = (b: PhysicsBody) => hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.ACTIVE;
  return { hk, engine, scene, plugin, body, box, awake };
}
const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export async function probe() {
  const out: Record<string, unknown> = {};
  // ---- tunnelling: 2 cm cube, no spin, 10 m/s vs 5 cm static slab, gravity 0
  for (const mode of ["babylonStep_freshWorld", "babylonStep_reuseWorld_dispose", "rawStep_reuseWorld_dispose", "babylonStep_reuseWorld_noDispose", "rawStep_noEvents_freshWorld"]) {
    let w = await world(0);
    let slab = w.body(Vector3.Zero(), PhysicsMotionType.STATIC);
    slab.shape = w.box(new Vector3(0.05, 4, 4));
    const results: string[] = [];
    for (let trial = 0; trial < 6; trial++) {
      if (mode.includes("fresh") && trial > 0) {
        w.engine.dispose();
        w = await world(0);
        slab = w.body(Vector3.Zero(), PhysicsMotionType.STATIC);
        slab.shape = w.box(new Vector3(0.05, 4, 4));
      }
      const y = 0.37 * trial - 1, z = 0.21 * trial - 0.5;
      const b = w.body(new Vector3(-1.5, y, z), PhysicsMotionType.DYNAMIC, Quaternion.RotationYawPitchRoll(trial * 0.7, trial * 1.3, trial * 0.4));
      const s = w.box(new Vector3(0.02, 0.02, 0.02));
      s.density = 2500;
      b.shape = s;
      b.setLinearVelocity(new Vector3(10, 0, 0));
      let crossed = false;
      let prev = b.transformNode.position.x;
      let minX = 99, maxX = -99;
      for (let i = 0; i < 30; i++) {
        if (mode.startsWith("raw")) {
          w.hk.HP_World_SetIdealStepTime(w.plugin.world, 1 / 60);
          w.hk.HP_World_Step(w.plugin.world, 1 / 60);
          if (!mode.includes("noEvents")) w.plugin._notifyCollisions(w.plugin.world);
          w.plugin.sync(b);
        } else w.scene._advancePhysicsEngineStep(1000 / 60);
        const x = b.transformNode.position.x;
        if (prev < 0 && x > 0) crossed = true;
        prev = x;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      }
      results.push(`${crossed ? "T" : "s"}(x=${r(b.transformNode.position.x, 2)},y=${r(b.transformNode.position.y, 2)})`);
      if (!mode.includes("noDispose")) { b.dispose(); s.dispose(); }
      else b.setLinearVelocity(Vector3.Zero());
    }
    out["tunnel_" + mode] = results.join(" ");
    w.engine.dispose();
  }

  // ---- root-shape filter change: does HP_Body_SetShape(same) refresh it? mass preserved?
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    const fs = w.box(new Vector3(20, 1, 20));
    w.hk.HP_Shape_SetFilterInfo(fs._pluginData, [1, -1]);
    floor.shape = fs;
    const mk = (x: number) => {
      const b = w.body(new Vector3(x, 0.25, 0), PhysicsMotionType.DYNAMIC);
      const s = w.box(new Vector3(0.5, 0.5, 0.5));
      w.hk.HP_Shape_SetFilterInfo(s._pluginData, [2, -1]);
      b.shape = s;
      return { b, s };
    };
    const A = mk(-3), B = mk(0), C = mk(3);
    for (let i = 0; i < 10; i++) w.scene._advancePhysicsEngineStep(1000 / 60); // awake, resting
    const massBefore = B.b.getMassProperties().mass;
    B.b.setMassProperties({ mass: 7 }); // user override must survive the raw refresh
    for (const o of [A, B, C]) w.hk.HP_Shape_SetFilterInfo(o.s._pluginData, [2, 2]);
    // A: nothing else; B: raw HP_Body_SetShape(same); C: babylon body.shape = same
    w.hk.HP_Body_SetShape(B.b._pluginData.hpBodyId, B.s._pluginData);
    C.b.shape = C.s;
    const massAfterRaw = B.b.getMassProperties().mass;
    const ys: string[] = [];
    for (let i = 0; i < 8; i++) {
      w.scene._advancePhysicsEngineStep(1000 / 60);
      ys.push([A, B, C].map((o) => r(o.b.transformNode.position.y, 3)).join("/"));
    }
    out.rootFilterRefresh = { awake: [A, B, C].map((o) => w.awake(o.b)), massBefore, massAfterRawSetShape: massAfterRaw, ys_A_none_B_raw_C_babylon: ys };
    w.engine.dispose();
  }
  return out;
}
