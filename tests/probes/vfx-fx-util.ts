// Shared helpers for the vfx-fx-* probes (not a probe itself).
import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  MeshBuilder,
  PBRMaterial,
  DynamicTexture,
  StandardMaterial,
  CascadedShadowGenerator,
  type Material,
  type Mesh,
} from "@babylonjs/core";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";
import { createVfx, type Vfx } from "../../src/vfx/vfx.ts";

export interface FxScene {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  sun: DirectionalLight;
  shadows: CascadedShadowGenerator | null;
  floor: Mesh;
  wall: Mesh;
}

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/** Engine + scene: floor at y = 0, back wall at z = wallZ, hemi + sun (+ optional point light). */
export function makeFxScene(opts: { wallZ?: number; shadows?: boolean; dark?: boolean; cam?: [number, number, number]; target?: [number, number, number] } = {}): FxScene {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.52, 0.6, 0.7, 1);
  const c = opts.cam ?? [0, 2.0, -6.5];
  const t = opts.target ?? [0, 0.8, 1];
  const camera = new FreeCamera("cam", new Vector3(c[0], c[1], c[2]), scene);
  camera.setTarget(new Vector3(t[0], t[1], t[2]));
  camera.minZ = 0.03;
  camera.maxZ = 200;
  camera.fov = (60 * Math.PI) / 180;
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = opts.dark ? 0.08 : 0.55;
  hemi.groundColor = new Color3(0.25, 0.22, 0.2);
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.55).normalize(), scene);
  sun.position = new Vector3(9, 18, -11);
  sun.intensity = opts.dark ? 0.1 : 2.2;
  sun.diffuse = new Color3(1, 0.85, 0.7);
  let shadows: CascadedShadowGenerator | null = null;
  if (opts.shadows) {
    shadows = new CascadedShadowGenerator(1024, sun);
    shadows.numCascades = 2;
    shadows.usePercentageCloserFiltering = true;
  }
  const floorMat = new PBRMaterial("floorMat", scene);
  floorMat.albedoColor = new Color3(0.42, 0.36, 0.3);
  floorMat.metallic = 0;
  floorMat.roughness = 0.85;
  const floor = MeshBuilder.CreateBox("floor", { width: 24, height: 0.2, depth: 16 }, scene);
  floor.position.set(0, -0.1, 3);
  floor.material = floorMat;
  floor.receiveShadows = true;
  const wallMat = new PBRMaterial("wallMat", scene);
  wallMat.albedoColor = new Color3(0.78, 0.75, 0.7);
  wallMat.metallic = 0;
  wallMat.roughness = 0.9;
  const wz = opts.wallZ ?? 3;
  const wall = MeshBuilder.CreateBox("wall", { width: 24, height: 4, depth: 0.2 }, scene);
  wall.position.set(0, 2, wz + 0.1);
  wall.material = wallMat;
  wall.receiveShadows = true;
  return { engine, scene, camera, sun, shadows, floor, wall };
}

/** Analytic ground probe: floor at y = 0 plus optional boxes (tables etc.). */
export function makeGroundProbe(boxes: Box[] = []): (x: number, y: number, z: number) => number | null {
  return (x, y, z) => {
    let best = 0;
    for (const b of boxes) {
      if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= y && b.max[1] > best) best = b.max[1];
    }
    return y >= 0 ? best : null;
  };
}

/** Optional real world material from render-core (procedural textures in the probe env). */
export async function tryWorldMaterial(scene: Scene): Promise<{ material: Material | null; info: string }> {
  try {
    const tex = await import("../../src/render/textures.ts");
    const wm = await import("../../src/render/worldMaterial.ts");
    const batch = await import("../../src/render/batch.ts");
    const lib = await tex.loadTextures(scene, {});
    const { material } = wm.createWorldMaterial(scene, lib);
    batch.setActiveSurfaceTable(new batch.SurfaceTable(lib));
    return { material, info: `world material ok (${lib.layerCounts.albedo} albedo layers)` };
  } catch (e) {
    return { material: null, info: "world material unavailable: " + String(e) };
  }
}

export function makeVfx(scene: Scene, ground: (x: number, y: number, z: number) => number | null, material: Material | null = null): { vfx: Vfx; events: EventBus<GameEvents>; settings: Settings } {
  const events = new EventBus<GameEvents>();
  const settings = new Settings();
  settings.data.quality = "high";
  const vfx = createVfx({ scene, events, settings, groundProbe: ground, worldMaterial: material ?? undefined });
  return { vfx, events, settings };
}

/** Advance `frames` frames of 1/60 s: fixed step + frame update + render. */
export function stepFrames(vfx: Vfx, scene: Scene, frames: number, onFrame?: (f: number) => void): void {
  for (let f = 0; f < frames; f++) {
    onFrame?.(f);
    vfx.fixedUpdate(1 / 60);
    vfx.update(1 / 60);
    scene.render();
  }
}

/** Render + yield until cond() (shader compiles / texture uploads are async). */
export async function renderUntil(scene: Scene, cond: () => boolean, maxFrames = 400): Promise<boolean> {
  for (let i = 0; i < maxFrames && !cond(); i++) {
    scene.render();
    await new Promise((r) => setTimeout(r, 0));
  }
  return cond();
}

/** A text label plane (screenshots). */
export function label(scene: Scene, text: string, x: number, y: number, z: number, w = 1.1): Mesh {
  const tex = new DynamicTexture("lbl_" + text, { width: 256, height: 48 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 48);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 33);
  tex.update();
  const m = MeshBuilder.CreatePlane("lblp_" + text, { width: w, height: w * 0.1875 }, scene);
  const mat = new StandardMaterial("lblm_" + text, scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.useAlphaFromDiffuseTexture = true;
  m.material = mat;
  m.position.set(x, y, z);
  return m;
}

export function addPointLight(scene: Scene, x: number, y: number, z: number, intensity = 2, color = new Color3(1, 0.9, 0.75)): PointLight {
  const l = new PointLight("pl" + Math.random(), new Vector3(x, y, z), scene);
  l.intensity = intensity;
  l.diffuse = color;
  l.range = 8;
  return l;
}

export function stats(xs: number[]): { med: number; mean: number; p90: number; max: number; n: number } {
  const s = [...xs].sort((a, b) => a - b);
  const pick = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { med: r(pick(0.5)), mean: r(mean), p90: r(pick(0.9)), max: r(s[s.length - 1] ?? 0), n: s.length };
}
