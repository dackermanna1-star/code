// Shared helpers for render-lighting-* probes.
import { Engine, Scene, Vector3, Matrix, type Camera } from "@babylonjs/core";

export function makeEngine(): { engine: Engine; scene: Scene; canvas: HTMLCanvasElement } {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  return { engine, scene, canvas };
}

/** Project a world point to canvas pixel coords (origin top-left). */
export function toScreen(scene: Scene, camera: Camera, p: Vector3): { x: number; y: number } {
  const engine = scene.getEngine();
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const s = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
  return { x: Math.round(s.x), y: Math.round(s.y) };
}

/** Read the average RGB (0..255) of a small square of the default framebuffer around canvas pixel (x,y) (top-left origin). */
export async function readAvg(engine: Engine, x: number, y: number, r = 2): Promise<number[]> {
  const h = engine.getRenderHeight();
  const size = r * 2 + 1;
  const glY = h - 1 - y - r; // readPixels origin is bottom-left
  const data = (await engine.readPixels(x - r, glY, size, size, true, false)) as Uint8Array;
  let rr = 0, gg = 0, bb = 0;
  const n = size * size;
  for (let i = 0; i < n; i++) { rr += data[i * 4]; gg += data[i * 4 + 1]; bb += data[i * 4 + 2]; }
  return [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)];
}

export function lum(c: number[]): number {
  return Math.round(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
}

export async function renderFrames(scene: Scene, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    scene.render();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}

export function now(): number {
  return performance.now();
}
