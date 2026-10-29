// THROWAWAY review probe: box-projected env capture when the probe position != box centre
// (the exact numbers Render.captureEnvironmentAsync uses), and superseded capture promises.
import { Engine, Scene, Vector3, Color3, Color4, UniversalCamera, MeshBuilder, StandardMaterial, PBRMaterial, type AbstractMesh } from "@babylonjs/core";
import { createInteriorEnvironment, EnvironmentCapture } from "../../src/render/reflections.ts";
import { INTERIOR, CEILING_H, ROOMS } from "../../src/world/plan.ts";

function unlit(scene: Scene, name: string, c: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = c;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  return m;
}

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const W = INTERIOR.maxX - INTERIOR.minX,
    D = INTERIOR.maxZ - INTERIOR.minZ;
  const room: AbstractMesh[] = [];
  const add = (m: AbstractMesh): AbstractMesh => (room.push(m), m);
  // walls green, ceiling blue, floor grey, RED ceiling patch right above the living-room centre
  const living = ROOMS.find((r) => r.id === "living")!;
  const lc = new Vector3((living.x0 + living.x1) / 2, 1.45, (living.z0 + living.z1) / 2);
  const ceil = add(MeshBuilder.CreatePlane("ceil", { width: W, height: D }, scene));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.set(W / 2, CEILING_H, D / 2);
  ceil.material = unlit(scene, "blue", new Color3(0, 0, 1));
  const patch = add(MeshBuilder.CreatePlane("patch", { width: 2, height: 2 }, scene));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(lc.x, CEILING_H - 0.01, lc.z);
  patch.material = unlit(scene, "red", new Color3(1, 0, 0));
  const floor = add(MeshBuilder.CreatePlane("floor", { width: W, height: D }, scene));
  floor.rotation.x = Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.material = unlit(scene, "grey", new Color3(0.2, 0.2, 0.2));
  const green = unlit(scene, "green", new Color3(0, 1, 0));
  for (const [x, z, ry, w] of [
    [W / 2, 0, 0, W],
    [W / 2, D, Math.PI, W],
    [0, D / 2, -Math.PI / 2, D],
    [W, D / 2, Math.PI / 2, D],
  ] as const) {
    const p = add(MeshBuilder.CreatePlane("wall", { width: w, height: CEILING_H }, scene));
    p.position.set(x, CEILING_H / 2, z);
    p.rotation.y = ry;
    p.material = green;
  }
  // mirror patch on the floor right below the probe position
  const mirror = MeshBuilder.CreateGround("mirror", { width: 1, height: 1 }, scene);
  mirror.position.set(lc.x, 0.01, lc.z);
  const mm = new PBRMaterial("mirrorMat", scene);
  mm.metallic = 1;
  mm.roughness = 0;
  mm.albedoColor = Color3.White();
  mirror.material = mm;
  const cam = new UniversalCamera("cam", new Vector3(lc.x, 1.0, lc.z), scene);
  cam.rotation.set(Math.PI / 2, 0, 0);
  cam.minZ = 0.01;
  cam.fov = 0.3;
  scene.activeCamera = cam;
  const cap = new EnvironmentCapture(scene, createInteriorEnvironment(scene, 32));
  await scene.whenReadyAsync();

  const centre = async (): Promise<number[]> => {
    scene.render();
    const w = engine.getRenderWidth(),
      h = engine.getRenderHeight();
    const px = (await engine.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, true, false)) as Uint8Array;
    return [px[0], px[1], px[2]];
  };
  const run = async (box: { center: Vector3; size: Vector3 }): Promise<{ ok: boolean | null; rgb: number[] }> => {
    let ok: boolean | null = null;
    cap.capture({ position: lc.clone(), size: 64, meshes: room, box }).then((r) => (ok = r));
    for (let i = 0; i < 60 && ok === null; i++) {
      scene.render();
      await new Promise((r) => setTimeout(r, 20));
    }
    return { ok, rgb: await centre() };
  };
  // A: exactly what Render.captureEnvironmentAsync passes (probe at living centre, box = whole interior)
  const asShipped = await run({
    center: new Vector3((INTERIOR.minX + INTERIOR.maxX) / 2, CEILING_H / 2, (INTERIOR.minZ + INTERIOR.maxZ) / 2),
    size: new Vector3(W, CEILING_H, D),
  });
  // B: control with the box centred on the capture position (Babylon's requirement)
  const centred = await run({ center: lc.clone(), size: new Vector3(W, CEILING_H, D) });

  // superseded capture: does the first promise ever settle?
  let first: string = "pending",
    second: string = "pending";
  cap.capture({ position: lc.clone(), size: 64, meshes: room }).then((r) => (first = String(r)));
  cap.capture({ position: lc.clone(), size: 64, meshes: room }).then((r) => (second = String(r)));
  for (let i = 0; i < 80 && second === "pending"; i++) {
    scene.render();
    await new Promise((r) => setTimeout(r, 20));
  }
  for (let i = 0; i < 20; i++) {
    scene.render();
    await new Promise((r) => setTimeout(r, 20));
  }
  return { probePos: lc.asArray(), asShipped, centred, supersede: { first, second } };
}
