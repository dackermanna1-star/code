// Shared scene builder for the viewmodel probes: a wall 0.6 m in front of a first-person camera and a
// red "tool" (handle + head) parented to the camera whose far half sits inside / behind the wall.
import {
  Engine, Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial, FreeCamera, HemisphericLight, DirectionalLight,
  ShadowGenerator, DefaultRenderingPipeline, SSAO2RenderingPipeline, ImageProcessingConfiguration, Matrix,
  type AbstractMesh,
} from "@babylonjs/core";
import { r } from "./input-loop-util.ts";

export interface VariantOpts {
  label: string;
  /** How the tool is rendered. */
  vm: "group0" | "group1" | "camera";
  ssao: "prepass" | "gbuffer" | "none";
  pipeline: boolean;
  excludeFromPrepass?: boolean;
  toolReceivesShadows?: boolean;
  /** For vm=camera: attach the DefaultRenderingPipeline to both cameras. */
  pipelineOnBoth?: boolean;
}

/** One canvas per variant in a 2x2 grid (index 0..3). */
export function placeCanvas(i: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const x = (i % 2) * 50;
  const y = Math.floor(i / 2) * 50;
  c.style.cssText = `position:fixed;left:${x}%;top:${y}%;width:50%;height:50%;display:block`;
  document.body.appendChild(c);
  return c;
}

export async function readRGB(engine: Engine, sx: number, sy: number): Promise<[number, number, number]> {
  const h = engine.getRenderHeight();
  const px = (await engine.readPixels(Math.round(sx) - 1, Math.round(h - sy) - 1, 3, 3)) as Uint8Array;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < 9; i++) {
    R += px[i * 4];
    G += px[i * 4 + 1];
    B += px[i * 4 + 2];
  }
  return [Math.round(R / 9), Math.round(G / 9), Math.round(B / 9)];
}

export async function variant(o: VariantOpts, idx: number) {
  const cv = placeCanvas(idx);
  const engine = new Engine(cv, false, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.7, 0.9, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 1.6, 0), scene);
  cam.minZ = 0.05;
  cam.maxZ = 200;
  cam.fov = (75 * Math.PI) / 180;
  cam.rotation.set(0.12, 0.25, 0); // pitch down a bit, yaw right a bit
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.35;
  const sun = new DirectionalLight("sun", new Vector3(0.35, -0.6, 1), scene);
  sun.position = new Vector3(-3.5, 7, -10);
  sun.intensity = 1.1;

  const wallMat = new StandardMaterial("wall", scene);
  wallMat.diffuseColor = new Color3(0.75, 0.75, 0.78);
  wallMat.specularColor = Color3.Black();
  const wall = MeshBuilder.CreateBox("wall", { width: 8, height: 3, depth: 0.2 }, scene);
  wall.position.set(0, 1.5, 0.6 + 0.1); // front face at z = 0.6
  wall.material = wallMat;
  wall.receiveShadows = true;
  const floor = MeshBuilder.CreateGround("floor", { width: 10, height: 10 }, scene);
  floor.material = wallMat;
  floor.receiveShadows = true;
  // floating green caster in front of the wall (upper left of the view)
  const caster = MeshBuilder.CreateBox("caster", { size: 0.3 }, scene);
  caster.position.set(-0.6, 1.9, 0.3);
  const casterMat = new StandardMaterial("casterMat", scene);
  casterMat.diffuseColor = new Color3(0.2, 0.6, 0.2);
  caster.material = casterMat;

  // viewmodel "tool" parented to the camera (camera-local coordinates)
  const toolMat = new StandardMaterial("tool", scene);
  toolMat.diffuseColor = new Color3(0.9, 0.1, 0.08);
  toolMat.emissiveColor = new Color3(0.25, 0.02, 0.02);
  toolMat.specularColor = new Color3(0.1, 0.1, 0.1);
  const handle = MeshBuilder.CreateBox("handle", { width: 0.04, height: 0.04, depth: 0.7 }, scene);
  handle.parent = cam;
  handle.position.set(0.22, -0.2, 0.25 + 0.35); // spans z 0.25..0.95 in camera space
  handle.material = toolMat;
  const head = MeshBuilder.CreateBox("head", { width: 0.16, height: 0.06, depth: 0.06 }, scene);
  head.parent = handle;
  head.position.set(0, 0, 0.33);
  head.material = toolMat;
  const toolMeshes: AbstractMesh[] = [handle, head];
  for (const m of toolMeshes) m.receiveShadows = !!o.toolReceivesShadows;

  const sg = new ShadowGenerator(1024, sun);
  sg.usePercentageCloserFiltering = true;
  sg.bias = 0.002;
  sg.addShadowCaster(caster);
  sg.addShadowCaster(wall);

  const cameras = [cam];
  if (o.vm === "group1") {
    for (const m of toolMeshes) m.renderingGroupId = 1;
    scene.setRenderingAutoClearDepthStencil(1, true, true, true); // (this is already the default)
  } else if (o.vm === "camera") {
    const VM_MASK = 0x10000000;
    const vmCam = new FreeCamera("vmCam", Vector3.Zero(), scene, false);
    vmCam.parent = cam; // inherits the pose
    vmCam.minZ = 0.01;
    vmCam.maxZ = 5;
    vmCam.fov = cam.fov;
    vmCam.layerMask = VM_MASK;
    for (const m of toolMeshes) m.layerMask = VM_MASK;
    scene.activeCameras = [cam, vmCam];
    if (o.pipelineOnBoth) cameras.push(vmCam);
  }

  if (o.ssao !== "none") {
    const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 1 }, [cam], o.ssao === "gbuffer");
    ssao.radius = 0.6;
    ssao.totalStrength = 1.6;
    ssao.samples = 16;
  }
  if (o.pipeline) {
    const pipe = new DefaultRenderingPipeline("pipe", true, scene, cameras);
    pipe.fxaaEnabled = true;
    pipe.bloomEnabled = true;
    pipe.bloomThreshold = 0.8;
    pipe.imageProcessingEnabled = true;
    pipe.imageProcessing.toneMappingEnabled = true;
    pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  }
  if (o.excludeFromPrepass && scene.prePassRenderer) scene.prePassRenderer.excludedMaterials.push(toolMat);

  await scene.whenReadyAsync();
  for (let i = 0; i < 4; i++) scene.render();

  // project camera-local points to screen (with the WORLD camera's transform)
  scene.activeCamera = cam;
  scene.updateTransformMatrix(true);
  const vp = cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const proj = (local: Vector3) =>
    Vector3.Project(Vector3.TransformCoordinates(local, cam.getWorldMatrix()), Matrix.Identity(), scene.getTransformMatrix(), vp);
  const tip = proj(new Vector3(0.22, -0.2, 0.9)); // behind the wall's front face (z > 0.6)
  const near = proj(new Vector3(0.22, -0.2, 0.3)); // in front of the wall
  const casterPx = proj(Vector3.TransformCoordinates(caster.position, cam.getViewMatrix()));
  scene.render();
  const rgbTip = await readRGB(engine, tip.x, tip.y);
  const rgbNear = await readRGB(engine, near.x, near.y);
  const rgbCaster = await readRGB(engine, casterPx.x, casterPx.y);
  const redness = (c: number[]) => c[0] - Math.max(c[1], c[2]);
  return {
    label: o.label,
    rgbToolTipBehindWall: rgbTip,
    rgbToolNearPart: rgbNear,
    rgbCaster,
    tipVisibleRed: redness(rgbTip) > 60,
    nearVisibleRed: redness(rgbNear) > 60,
    prePass: !!scene.prePassRenderer && scene.prePassRenderer.enabled,
    activeCameras: scene.activeCameras?.map((c) => c.name) ?? [],
    tipScreen: [r(tip.x, 1), r(tip.y, 1)],
  };
}

export function hideAllCanvases() {
  for (const c of Array.from(document.querySelectorAll("canvas"))) c.style.display = "none";
}
