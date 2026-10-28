import { Engine, Scene, Vector3, Color3, Color4, UniversalCamera, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, HavokPlugin, PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

async function boot() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.1, 0.12, 0.15, 1);
  const camera = new UniversalCamera("cam", new Vector3(0, 3, -8), scene);
  camera.setTarget(Vector3.Zero());
  camera.attachControl(canvas, true);
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.6;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.3), scene);
  sun.intensity = 0.8;

  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);

  const ground = MeshBuilder.CreateBox("ground", { width: 20, height: 0.2, depth: 20 }, scene);
  ground.position.y = -0.1;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  let impacts = 0;
  plugin.onCollisionObservable.add((ev) => {
    if ((ev.impulse ?? 0) > 0.5) impacts++;
  });
  for (let i = 0; i < 30; i++) {
    const b = MeshBuilder.CreateBox("b" + i, { size: 0.5 }, scene);
    b.position.set((i % 5) - 2, 1 + Math.floor(i / 5) * 0.6, 0);
    const mat = new StandardMaterial("m" + i, scene);
    mat.diffuseColor = Color3.FromHSV((i * 37) % 360, 0.6, 0.9);
    b.material = mat;
    const agg = new PhysicsAggregate(b, PhysicsShapeType.CONVEX_HULL, { mass: 1, restitution: 0.2 }, scene);
    agg.body.setCollisionCallbackEnabled(true);
  }
  (window as any).__sim = {
    ready: true,
    impacts: () => impacts,
    fps: () => engine.getFps(),
    meshes: () => scene.meshes.length,
  };
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("BOOT FAILED", e);
  (window as any).__simError = String(e?.stack ?? e);
});
