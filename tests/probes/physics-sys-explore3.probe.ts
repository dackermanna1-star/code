// Follow-up 2: what makes small bodies tunnel through static slabs; how to refresh root-leaf filters.
import { NullEngine, Scene, Vector3, Quaternion, TransformNode, HavokPlugin, FreeCamera, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeSphere, PhysicsShapeContainer, PhysicsShape, PhysicsShapeType } from "@babylonjs/core";
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
  const body = (pos: Vector3, motion: PhysicsMotionType, rot?: Quaternion) => {
    const n = new TransformNode("n", scene);
    n.position.copyFrom(pos);
    n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
    n.computeWorldMatrix(true);
    return new PhysicsBody(n, motion, false, scene);
  };
  const box = (size: Vector3, rot?: Quaternion) => new PhysicsShapeBox(Vector3.Zero(), rot ?? Quaternion.Identity(), size, scene);
  const hull = (pts: number[]) => {
    const ptr = hk._malloc(pts.length * 4);
    new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
    const res = hk.HP_Shape_CreateConvexHull(ptr, pts.length / 3);
    hk._free(ptr);
    const s = new PhysicsShape({ pluginData: res[1] }, scene);
    (s as unknown as { _type: number })._type = PhysicsShapeType.CONVEX_HULL;
    return s;
  };
  const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dt * 1000); };
  return { hk, engine, scene, plugin, body, box, hull, step };
}
const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
type W = Awaited<ReturnType<typeof world>>;

function cubePts(half: number, q: Quaternion) {
  const pts: number[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = new Vector3(sx * half, sy * half, sz * half).applyRotationQuaternion(q);
    pts.push(v.x, v.y, v.z);
  }
  return pts;
}

/** Shoot a projectile along +x at the slab (x = 0), return "T" if it crossed. */
function shoot(w: W, opts: { pos: Vector3; rot?: Quaternion; shape: () => PhysicsShape; v: number; spin?: number; steps?: number }) {
  const b = w.body(opts.pos, PhysicsMotionType.DYNAMIC, opts.rot);
  const s = opts.shape();
  s.density = 2500;
  b.shape = s;
  b.setLinearVelocity(new Vector3(opts.v, 0, 0));
  if (opts.spin) b.setAngularVelocity(new Vector3(opts.spin * 0.6, opts.spin * 0.8, opts.spin * 0.3));
  let crossed = false;
  let prev = b.transformNode.position.x;
  for (let i = 0; i < (opts.steps ?? 40); i++) {
    w.step(1);
    const x = b.transformNode.position.x;
    if (prev < 0 && x > 0) crossed = true;
    prev = x;
  }
  b.dispose();
  s.dispose();
  return crossed ? "T" : "s";
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const rots = [0, 1, 2, 3, 4, 5].map((t) => Quaternion.RotationYawPitchRoll(t * 0.7, t * 1.3, t * 0.4));
  const positions = [0, 1, 2, 3, 4, 5].map((t) => new Vector3(-1.5, 0.37 * t - 1, 0.21 * t - 0.5));
  {
    const w = await world(0);
    const slab = w.body(Vector3.Zero(), PhysicsMotionType.STATIC);
    slab.shape = w.box(new Vector3(0.05, 4, 4));
    const cube = () => w.box(new Vector3(0.02, 0.02, 0.02));
    out.T1_identityRot_allPositions = positions.map((p) => shoot(w, { pos: p, shape: cube, v: 10 })).join("");
    out.T2_rotated_samePosition = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: cube, v: 10 })).join("");
    for (const v of [1, 2, 5, 10, 30]) out["T3_rotated_v" + v] = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: cube, v, steps: Math.ceil(2.2 / v * 60) })).join("");
    out.T5_rotationBakedInHull_identityBody = rots.map((q) => shoot(w, { pos: positions[0], shape: () => w.hull(cubePts(0.01, q)), v: 10 })).join("");
    out.T5b_rotationBakedInBoxShape_identityBody = rots.map((q) => shoot(w, { pos: positions[0], shape: () => w.box(new Vector3(0.02, 0.02, 0.02), q), v: 10 })).join("");
    out.T5c_sphere1cm_rotatedBody = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: () => new PhysicsShapeSphere(Vector3.Zero(), 0.01, w.scene), v: 10 })).join("");
    out.T5d_rotated10cmCube = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: () => w.box(new Vector3(0.1, 0.1, 0.1)), v: 10 })).join("");
    out.T5e_rotated30cmCube = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: () => w.box(new Vector3(0.3, 0.3, 0.3)), v: 10 })).join("");
    // rotation about the travel axis only / about y only
    out.T5f_rotAboutX = [0.1, 0.3, 0.5, 0.785].map((a) => shoot(w, { pos: positions[0], rot: Quaternion.RotationAxis(new Vector3(1, 0, 0), a), shape: cube, v: 10 })).join("");
    out.T5g_rotAboutY = [0.1, 0.3, 0.5, 0.785].map((a) => shoot(w, { pos: positions[0], rot: Quaternion.RotationAxis(new Vector3(0, 1, 0), a), shape: cube, v: 10 })).join("");
    w.engine.dispose();
  }
  {
    const w = await world(0);
    const slab = w.body(Vector3.Zero(), PhysicsMotionType.STATIC);
    slab.shape = w.box(new Vector3(0.2, 4, 4));
    out.T6_rotated_vs20cmSlab_v10 = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: () => w.box(new Vector3(0.02, 0.02, 0.02)), v: 10 })).join("");
    out.T6_rotated_vs20cmSlab_v30 = rots.map((q) => shoot(w, { pos: positions[0], rot: q, shape: () => w.box(new Vector3(0.02, 0.02, 0.02)), v: 30 })).join("");
    w.engine.dispose();
  }
  // T4: rotated small boxes falling under gravity onto a 20 cm static floor
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.1, 0), PhysicsMotionType.STATIC);
    floor.shape = w.box(new Vector3(40, 0.2, 40));
    const res: Record<string, string> = {};
    for (const h of [0.5, 2, 5]) {
      for (const size of [0.02, 0.05]) {
        let s = "";
        for (let t = 0; t < 6; t++) {
          const b = w.body(new Vector3(t * 1.5 - 4, h, 2), PhysicsMotionType.DYNAMIC, rots[t]);
          const sh = w.box(new Vector3(size, size, size));
          sh.density = 2500;
          b.shape = sh;
          w.step(Math.ceil(Math.sqrt((2 * h) / 9.81) * 60) + 30);
          s += b.transformNode.position.y < -0.05 ? "T" : "s";
          b.dispose();
          sh.dispose();
        }
        res[`h${h}_size${size}`] = s;
      }
    }
    out.T4_fallOntoFloor = res;
    w.engine.dispose();
  }

  // ---- filter refresh on root leaf shapes
  {
    const w = await world();
    const floor = w.body(new Vector3(0, -0.5, 0), PhysicsMotionType.STATIC);
    const fs = w.box(new Vector3(40, 1, 40));
    w.hk.HP_Shape_SetFilterInfo(fs._pluginData, [1, -1]);
    floor.shape = fs;
    const variants = ["none", "babylonNullThenSame", "rawZeroThenSame", "removeAddWorld", "container1child", "liftAndDrop"] as const;
    const objs = variants.map((v, i) => {
      const b = w.body(new Vector3(i * 2 - 5, 0.25, 0), PhysicsMotionType.DYNAMIC);
      const s = w.box(new Vector3(0.5, 0.5, 0.5));
      w.hk.HP_Shape_SetFilterInfo(s._pluginData, [2, -1]);
      if (v === "container1child") {
        const c = new PhysicsShapeContainer(w.scene);
        c.addChild(s);
        b.shape = c;
      } else b.shape = s;
      return { v, b, s };
    });
    w.step(10);
    for (const o of objs) {
      w.hk.HP_Shape_SetFilterInfo(o.s._pluginData, [2, 2]);
      const id = o.b._pluginData.hpBodyId;
      if (o.v === "babylonNullThenSame") { o.b.shape = null; o.b.shape = o.s; }
      if (o.v === "rawZeroThenSame") { w.hk.HP_Body_SetShape(id, [BigInt(0)] as unknown as never); w.hk.HP_Body_SetShape(id, o.s._pluginData); }
      if (o.v === "removeAddWorld") { w.hk.HP_World_RemoveBody(w.plugin.world, id); w.hk.HP_World_AddBody(w.plugin.world, id, false); }
      if (o.v === "liftAndDrop") o.b.setLinearVelocity(new Vector3(0, 2, 0));
    }
    const ys: Record<string, number[]> = {};
    for (let i = 0; i < 40; i++) {
      w.step(1);
      for (const o of objs) (ys[o.v] ??= []).push(r(o.b.transformNode.position.y, 2));
    }
    const summary: Record<string, string> = {};
    for (const o of objs) summary[o.v] = `y@5=${ys[o.v][4]} y@40=${ys[o.v][39]} mass=${r(o.b.getMassProperties().mass ?? -1, 1)}`;
    out.F_rootFilterRefresh = summary;
    w.engine.dispose();
  }
  return out;
}
