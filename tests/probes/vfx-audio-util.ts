// Shared helpers for the vfx-audio-* probes (not a probe itself).
import { Engine, Scene, FreeCamera, Vector3, Color4, Color3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial } from "@babylonjs/core";
export type { Scene };

export interface ProbeScene {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
}

/** WebGL2 engine + scene with a grey floor, a back wall and a camera looking at the origin. */
export function makeScene(opts: { floor?: boolean; wall?: boolean } = {}): ProbeScene {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.09, 0.11, 1);
  const camera = new FreeCamera("cam", new Vector3(0, 2.2, -6.5), scene);
  camera.setTarget(new Vector3(0, 0.8, 0));
  camera.minZ = 0.05;
  new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 0.7;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.5), scene);
  sun.intensity = 0.6;
  if (opts.floor !== false) {
    const floor = MeshBuilder.CreateGround("floor", { width: 12, height: 12 }, scene);
    const fm = new StandardMaterial("floorMat", scene);
    fm.diffuseColor = new Color3(0.35, 0.33, 0.3);
    fm.specularColor = Color3.Black();
    floor.material = fm;
  }
  if (opts.wall) {
    const wall = MeshBuilder.CreatePlane("wall", { width: 12, height: 4 }, scene);
    wall.position.set(0, 2, 2);
    const wm = new StandardMaterial("wallMat", scene);
    wm.diffuseColor = new Color3(0.75, 0.72, 0.66);
    wm.specularColor = Color3.Black();
    wall.material = wm;
  }
  return { engine, scene, camera };
}

export function stats(xs: number[]): { med: number; mean: number; p90: number; max: number; n: number } {
  const s = [...xs].sort((a, b) => a - b);
  const pick = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { med: r3(pick(0.5)), mean: r3(mean), p90: r3(pick(0.9)), max: r3(s[s.length - 1]), n: s.length };
}

export function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Wait for the next animation frame (lets the browser composite / GC between measurements). */
export function nextFrame(): Promise<void> {
  return new Promise((res) => requestAnimationFrame(() => res()));
}

/** Yield to the event loop (dynamic shader imports / parallel shader compile need this). */
export function tick(ms = 0): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Block until the GPU process drained the command queue (SwiftShader backlog would otherwise
 *  stall later GL calls and pollute JS timings / time out screenshots). */
export function gpuSync(engine: Engine): void {
  (engine as unknown as { _gl: WebGL2RenderingContext })._gl.finish();
}

/** Render + yield until cond() is true. Returns { frames, ms } it took. */
export async function renderUntil(scene: Scene, cond: () => boolean, maxFrames = 600): Promise<{ frames: number; ms: number; ok: boolean }> {
  const t0 = performance.now();
  let frames = 0;
  while (!cond() && frames < maxFrames) {
    scene.render();
    gpuSync(scene.getEngine() as Engine);
    await tick();
    frames++;
  }
  return { frames, ms: r3(performance.now() - t0), ok: cond() };
}
