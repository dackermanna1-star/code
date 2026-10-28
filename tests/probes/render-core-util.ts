// Shared helpers for render-core probes: a minimal lit scene and synthetic RenderGeoms.
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  UniversalCamera,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
} from "@babylonjs/core";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

export interface ProbeScene {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
  pipeline: DefaultRenderingPipeline | null;
}

/** Golden-hour-ish stand-in lighting (render-env owns the real one). */
export function makeScene(opts: { bloom?: boolean; clear?: number[] } = {}): ProbeScene {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const c = opts.clear ?? [0.42, 0.5, 0.62];
  scene.clearColor = new Color4(c[0], c[1], c[2], 1);
  scene.ambientColor = new Color3(0, 0, 0);
  const camera = new UniversalCamera("cam", new Vector3(0, 2.2, -4.5), scene);
  camera.minZ = 0.03;
  camera.maxZ = 300;
  camera.fov = (60 * Math.PI) / 180;
  camera.inertia = 0;
  scene.activeCamera = camera;
  const sun = new DirectionalLight("sun", new Vector3(0.55, -0.5, 0.65).normalize(), scene);
  sun.position = new Vector3(-8, 10, -9);
  sun.diffuse = Color3.FromHexString("#ffcf9a");
  sun.intensity = 3.2;
  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.015;
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.diffuse = Color3.FromHexString("#b8c8e8");
  hemi.groundColor = Color3.FromHexString("#5a4a3a");
  hemi.intensity = 0.55;
  let pipeline: DefaultRenderingPipeline | null = null;
  if (opts.bloom !== false) {
    pipeline = new DefaultRenderingPipeline("pp", true, scene, [camera]);
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.0;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.9;
    pipeline.bloomWeight = 0.35;
    pipeline.bloomKernel = 48;
    pipeline.fxaaEnabled = true;
  }
  return { engine, scene, camera, sun, shadows, pipeline };
}

/** Triangle order emitted by boxGeom: true = counter-clockwise seen from outside. */
export let BOX_WINDING_CCW = true;
export function setBoxWinding(ccw: boolean): void {
  BOX_WINDING_CCW = ccw;
}

/**
 * Axis-aligned box RenderGeom (flat faces, uv in metres projected like geom autoUV:
 * walls u = cross(n, +Y) (right when viewed from outside), v = +Y; floors u = +X, v = ±Z).
 * Winding: counter-clockwise seen from outside in Babylon's left-handed space is BACK-facing,
 * so triangles are emitted clockwise as seen from outside (Babylon default front face).
 */
export function boxGeom(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, surf: number, tint = 0xffffff, uvOffset = 0): RenderGeom {
  const faces: Array<{ n: [number, number, number] }> = [{ n: [1, 0, 0] }, { n: [-1, 0, 0] }, { n: [0, 1, 0] }, { n: [0, -1, 0] }, { n: [0, 0, 1] }, { n: [0, 0, -1] }];
  const P: number[] = [],
    N: number[] = [],
    UV: number[] = [],
    I: number[] = [];
  const h = [sx / 2, sy / 2, sz / 2];
  for (const f of faces) {
    const n = f.n;
    // tangent axes
    let u: number[], v: number[];
    if (Math.abs(n[1]) < 0.9) {
      // u = cross(n, Y) = (n.y*0 - n.z*1, n.z*0 - n.x*0, n.x*1 - n.y*0) = (-n.z, 0, n.x)
      u = [-n[2], 0, n[0]];
      v = [0, 1, 0];
    } else {
      u = [1, 0, 0];
      v = [0, 0, n[1] > 0 ? 1 : -1];
    }
    const base = P.length / 3;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const eu = Math.abs(u[0]) * h[0] + Math.abs(u[1]) * h[1] + Math.abs(u[2]) * h[2];
    const ev = Math.abs(v[0]) * h[0] + Math.abs(v[1]) * h[1] + Math.abs(v[2]) * h[2];
    for (const [a, b] of corners) {
      // corner = face centre (n*h) + a*u*extent_u + b*v*extent_v
      const p = [0, 0, 0];
      for (let k = 0; k < 3; k++) p[k] = n[k] * h[k] + u[k] * a * eu + v[k] * b * ev;
      P.push(cx + p[0], cy + p[1], cz + p[2]);
      N.push(n[0], n[1], n[2]);
      // planar uv (metres) relative to the box corner so one tile starts at the face corner
      UV.push((a + 1) * eu + uvOffset, (b + 1) * ev + uvOffset);
    }
    // corners go counter-clockwise in (u,v) = counter-clockwise seen from outside (u right, v up)
    if (BOX_WINDING_CCW) I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const vc = P.length / 3;
  return {
    positions: new Float32Array(P),
    normals: new Float32Array(N),
    uvs: new Float32Array(UV),
    surf: new Uint16Array(vc).fill(surf),
    tint: new Uint32Array(vc).fill(tint),
    indices: new Uint32Array(I),
    vertexCount: vc,
  };
}

/** Render n frames (lets shadow maps / pipelines settle). */
export function renderFrames(scene: Scene, n: number): void {
  for (let i = 0; i < n; i++) scene.render();
}

/** Render a few frames and grab the canvas as a PNG data URL (needs preserveDrawingBuffer). */
export function snap(scene: Scene, frames = 2): string {
  renderFrames(scene, frames);
  const c = scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
  return c.toDataURL("image/png");
}
