// Follow-up 4: fast (spinning) small hull bodies vs a 5 cm static slab at 1..4 substeps (raw world steps).
import { NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShape, PhysicsShapeType } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

export async function probe() {
  const hk = (await HavokPhysics({ locateFile: () => havokWasmUrl })) as HavokPhysicsWithBindings;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, 0, 0), plugin);
  scene.physicsEnabled = false;
  const mkBody = (pos: Vector3, motion: PhysicsMotionType, rot?: Quaternion) => {
    const n = new TransformNode("n", scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, false, scene);
  };
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
  const slab = mkBody(Vector3.Zero(), PhysicsMotionType.STATIC);
  slab.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.05, 6, 6), scene);
  const stepSub = (n: number, b: PhysicsBody) => {
    const h = 1 / 60 / n;
    for (let i = 0; i < n; i++) {
      hk.HP_World_SetIdealStepTime(plugin.world, h);
      hk.HP_World_Step(plugin.world, h);
    }
    plugin.sync(b);
  };
  const shapes: Record<string, Vector3> = { cube2cm: new Vector3(0.02, 0.02, 0.02), sliver4x2x0_4cm: new Vector3(0.04, 0.02, 0.004), shard10x10x0_5cm: new Vector3(0.1, 0.1, 0.005), shard5x3x0_4cm: new Vector3(0.05, 0.03, 0.004) };
  const res: Record<string, string> = {};
  const trials = 10;
  const t0 = performance.now();
  for (const [name, size] of Object.entries(shapes)) {
    for (const spin of [0, 40, 100]) {
      for (const speed of [10, 30, 60]) {
        const row: string[] = [];
        for (const sub of [1, 2, 3, 4]) {
          let tunnels = 0;
          for (let t = 0; t < trials; t++) {
            const b = mkBody(new Vector3(-1.2, (t % 5) * 0.8 - 2, Math.floor(t / 5) * 1.5 - 0.75), PhysicsMotionType.DYNAMIC, Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1));
            const s = hullBox(size);
            s.density = 2500;
            b.shape = s;
            b.setLinearVelocity(new Vector3(speed, 0, 0));
            b.setAngularVelocity(new Vector3(spin * 0.6, spin * 0.8, spin * 0.3));
            let crossed = false;
            let prev = b.transformNode.position.x;
            for (let i = 0; i < 25; i++) {
              stepSub(sub, b);
              const x = b.transformNode.position.x;
              if (prev < 0 && x > 0) crossed = true;
              prev = x;
            }
            if (crossed) tunnels++;
            b.dispose();
            s.dispose();
          }
          row.push(`${sub}:${tunnels}/${trials}`);
        }
        res[`${name}_spin${spin}_v${speed}`] = row.join(" ");
      }
    }
  }
  return { hull_tunnels_by_substeps: res, ms: Math.round(performance.now() - t0) };
}
