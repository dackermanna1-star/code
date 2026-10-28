// Shared helpers for input-loop-* probes (input, camera, game loop, viewmodel, engine options).
import { Engine, Scene, Vector3, HavokPlugin, FreeCamera, HemisphericLight, type EngineOptions } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

let havokPromise: Promise<unknown> | null = null;
export function getHavok(): Promise<unknown> {
  if (!havokPromise) havokPromise = HavokPhysics({ locateFile: () => havokWasmUrl });
  return havokPromise;
}

export function canvas(): HTMLCanvasElement {
  return document.getElementById("renderCanvas") as HTMLCanvasElement;
}

/** A brand-new full-window canvas (fresh WebGL context attributes); hides the others. */
export function freshCanvas(): HTMLCanvasElement {
  for (const c of Array.from(document.querySelectorAll("canvas"))) c.style.display = "none";
  const c = document.createElement("canvas");
  c.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;display:block";
  document.body.appendChild(c);
  return c;
}

export interface World {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  plugin: HavokPlugin;
}

/** Engine + scene + camera + Havok (gravity -9.81). */
export async function makeWorld(
  opts: { engine?: EngineOptions; useDelta?: boolean; physics?: boolean; canvas?: HTMLCanvasElement } = {},
): Promise<World> {
  const engine = new Engine(opts.canvas ?? canvas(), opts.engine?.antialias ?? false, opts.engine ?? {});
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(0, 2, -8), scene);
  camera.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  let plugin: HavokPlugin = null as unknown as HavokPlugin;
  if (opts.physics !== false) {
    const hk = await getHavok();
    plugin = new HavokPlugin(opts.useDelta ?? true, hk);
    scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  }
  return { engine, scene, camera, plugin };
}

export const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/** Resolve after n animation frames. */
export function frames(n: number): Promise<void> {
  return new Promise((res) => {
    let k = 0;
    const tick = () => (++k >= n ? res() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
