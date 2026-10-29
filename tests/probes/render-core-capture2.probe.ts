// Probe: EnvironmentCapture correctness edge cases.
// A. Box-projected capture: the cube is rendered from the box centre even when the caller's
//    position differs (Babylon's parallax correction assumes that); a mirror on the floor right
//    under the box centre must reflect the red ceiling patch directly above it, not the blue
//    ceiling elsewhere. Also checks Render's capture box (living room, probe at its centre).
// B. A mesh that is not ready during the armed capture pass: the pass is discarded and
//    re-rendered, never while the cube is the active environment (no GL feedback loop).
// C. Superseded / disposed captures resolve false (no hanging promise).
// D. Resolution change: the active capture stays installed until the new one is ready.
import { Engine, Scene, Vector3, Color3, Color4, UniversalCamera, MeshBuilder, StandardMaterial, PBRMaterial, type AbstractMesh, type RenderTargetTexture } from "@babylonjs/core";
import { createInteriorEnvironment, EnvironmentCapture } from "../../src/render/reflections.ts";
import { captureBox } from "../../src/render/renderSystem.ts";
import { CEILING_H, ROOMS } from "../../src/world/plan.ts";

function unlit(scene: Scene, name: string, c: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = c;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  return m;
}

const frame = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  // a 6 x 2.7 x 5 m room centred at (3, 1.35, 2.5); blue ceiling, red patch above the centre
  const W = 6,
    D = 5,
    C = new Vector3(W / 2, CEILING_H / 2, D / 2);
  const room: AbstractMesh[] = [];
  const add = (m: AbstractMesh): AbstractMesh => (room.push(m), m);
  const ceil = add(MeshBuilder.CreatePlane("ceil", { width: W, height: D }, scene));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.set(W / 2, CEILING_H, D / 2);
  ceil.material = unlit(scene, "blue", new Color3(0, 0, 1));
  const patch = add(MeshBuilder.CreatePlane("patch", { width: 1.2, height: 1.2 }, scene));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(C.x, CEILING_H - 0.01, C.z);
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
  const mirror = MeshBuilder.CreateGround("mirror", { width: 1, height: 1 }, scene);
  mirror.position.set(C.x, 0.01, C.z);
  const mm = new PBRMaterial("mirrorMat", scene);
  mm.metallic = 1;
  mm.roughness = 0;
  mm.albedoColor = Color3.White();
  mirror.material = mm;
  const cam = new UniversalCamera("cam", new Vector3(C.x, 1.0, C.z), scene);
  cam.rotation.set(Math.PI / 2, 0, 0);
  cam.minZ = 0.01;
  cam.fov = 0.3;
  scene.activeCamera = cam;
  const fallback = createInteriorEnvironment(scene, 32);
  const cap = new EnvironmentCapture(scene, fallback);
  await scene.whenReadyAsync();
  const box = { center: C.clone(), size: new Vector3(W, CEILING_H, D) };
  const fail: string[] = [];

  const centre = async (): Promise<number[]> => {
    scene.render();
    const px = (await engine.readPixels(Math.floor(engine.getRenderWidth() / 2), Math.floor(engine.getRenderHeight() / 2), 1, 1, true, false)) as Uint8Array;
    return [px[0], px[1], px[2]];
  };
  const pump = async (pred: () => boolean, max = 120, each?: () => void): Promise<void> => {
    for (let i = 0; i < max && !pred(); i++) {
      scene.render();
      each?.();
      await frame();
    }
  };

  // ---- A: caller position far from the box centre; cube must still be rendered from the centre
  let okA: boolean | null = null;
  cap.capture({ position: new Vector3(1.0, 2.2, 0.8), size: 64, meshes: room, box }).then((r) => (okA = r));
  await pump(() => okA !== null);
  const rgbA = await centre();
  const probePos = scene.reflectionProbes?.find((p) => scene.environmentTexture === p.cubeTexture)?.position.asArray();
  if (okA !== true) fail.push("A: capture did not resolve true");
  if (!(rgbA[0] > 150 && rgbA[2] < 80)) fail.push(`A: mirror under the box centre reflects ${rgbA} (expected red)`);
  const living = ROOMS.find((r) => r.id === "living")!;
  const rb = captureBox();
  const renderBox = { center: rb.center.asArray(), size: rb.size.asArray() };
  if (Math.abs(rb.center.x - (living.x0 + living.x1) / 2) > 1e-6 || Math.abs(rb.center.z - (living.z0 + living.z1) / 2) > 1e-6 || Math.abs(rb.center.y - CEILING_H / 2) > 1e-6)
    fail.push("A: Render capture box is not centred on the living room");
  if (Math.abs(rb.size.x - (living.x1 - living.x0)) > 1e-6 || Math.abs(rb.size.z - (living.z1 - living.z0)) > 1e-6) fail.push("A: Render capture box is not the living-room size");

  // ---- B: one mesh misses the first armed render pass
  const flaky = room[0];
  const origReady = flaky.isReady.bind(flaky);
  let cube: RenderTargetTexture | null = null;
  let missesLeft = 1;
  flaky.isReady = (...args: Parameters<AbstractMesh["isReady"]>) => {
    if (cube && missesLeft > 0 && scene.customRenderTargets.includes(cube)) {
      missesLeft--;
      return false;
    }
    return origReady(...args);
  };
  const envBefore = scene.environmentTexture;
  let okB: boolean | null = null;
  const pB = cap.capture({ position: C, size: 64, meshes: room, box });
  pB.then((r) => (okB = r));
  cube = (scene.reflectionProbes ?? []).map((p) => p.cubeTexture).find((t) => t !== envBefore) ?? null;
  let facesTotal = 0,
    facesWhileActive = 0;
  const obs = cube?.onAfterRenderObservable.add(() => {
    facesTotal++;
    if (scene.environmentTexture === cube) facesWhileActive++;
  });
  await pump(() => okB !== null);
  for (let i = 0; i < 20; i++) {
    scene.render();
    await frame();
  }
  if (obs) cube?.onAfterRenderObservable.remove(obs);
  flaky.isReady = origReady;
  const rgbB = await centre();
  if (okB !== true) fail.push("B: capture with a not-ready mesh did not resolve true");
  if (missesLeft !== 0) fail.push("B: the not-ready path was not exercised");
  if (facesTotal < 12) fail.push(`B: incomplete pass was not re-rendered (faces ${facesTotal})`);
  if (facesWhileActive !== 0) fail.push(`B: cube rendered ${facesWhileActive} faces while it was the active environment`);
  if (!(rgbB[0] > 150 && rgbB[2] < 80)) fail.push(`B: mirror reflects ${rgbB} after recapture (expected red)`);

  // ---- C: superseded and disposed captures settle with false
  let first = "pending",
    second = "pending";
  cap.capture({ position: C, size: 64, meshes: room, box }).then((r) => (first = String(r)));
  cap.capture({ position: C, size: 64, meshes: room, box }).then((r) => (second = String(r)));
  await pump(() => second !== "pending");
  await Promise.resolve();
  if (first !== "false") fail.push(`C: superseded capture settled '${first}'`);
  if (second !== "true") fail.push(`C: superseding capture settled '${second}'`);

  // ---- D: resolution change keeps the active capture until the new one is ready
  let okD: boolean | null = null;
  let fellBack = 0;
  const activeBefore = scene.environmentTexture;
  cap.capture({ position: C, size: 32, meshes: room, box }).then((r) => (okD = r));
  await pump(
    () => okD !== null,
    120,
    () => {
      if (scene.environmentTexture === fallback) fellBack++;
    },
  );
  const newSize = scene.environmentTexture?.getSize().width;
  if (okD !== true) fail.push("D: resized capture did not resolve true");
  if (fellBack) fail.push(`D: fell back to the procedural environment for ${fellBack} frames`);
  if (scene.environmentTexture === activeBefore || newSize !== 32) fail.push(`D: new capture not installed (size ${newSize})`);

  // disposed during capture
  let disposedRes = "pending";
  cap.capture({ position: C, size: 32, meshes: room, box }).then((r) => (disposedRes = String(r)));
  cap.dispose();
  await Promise.resolve();
  await Promise.resolve();
  if (disposedRes !== "false") fail.push(`C: capture disposed mid-flight settled '${disposedRes}'`);
  if (scene.environmentTexture !== fallback) fail.push("dispose did not restore the fallback");

  const result = { pass: fail.length === 0, fail, probePos, rgbA, rgbB, renderBox, facesTotal, facesWhileActive, supersede: { first, second }, fellBack, newSize, disposedRes };
  if (fail.length) throw new Error(JSON.stringify(result));
  return result;
}
