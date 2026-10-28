import { Engine, Scene, Vector3, MeshBuilder, HavokPlugin, PhysicsAggregate, PhysicsShapeType, FreeCamera, HemisphericLight } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 2, -6), scene).setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  const ground = MeshBuilder.CreateBox("g", { width: 10, height: 0.2, depth: 10 }, scene);
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  const box = MeshBuilder.CreateBox("b", { size: 0.5 }, scene);
  box.position.y = 2;
  const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 1 }, scene);
  for (let i = 0; i < 120; i++) scene.render();
  return { y: box.position.y, v: agg.body.getLinearVelocity().length() };
}
