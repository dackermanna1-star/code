// Shared helpers for the physics-bodies probes (not a probe itself).
import { NullEngine, Engine, Scene, Vector3, HavokPlugin, PhysicsEngineV2, FreeCamera } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

let hkPromise: Promise<HavokPhysicsWithBindings> | null = null;
export function getHavok(): Promise<HavokPhysicsWithBindings> {
  if (!hkPromise) hkPromise = HavokPhysics({ locateFile: () => havokWasmUrl });
  return hkPromise;
}

export interface PhysWorld {
  engine: Engine;
  scene: Scene;
  plugin: HavokPlugin;
  hk: HavokPhysicsWithBindings;
  phys: PhysicsEngineV2;
}

export async function makeWorld(opts: { useDelta?: boolean; webgl?: boolean; gravity?: Vector3 } = {}): Promise<PhysWorld> {
  const hk = await getHavok();
  let engine: Engine;
  if (opts.webgl) {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    engine = new Engine(canvas, true);
  } else {
    engine = new NullEngine();
  }
  const scene = new Scene(engine);
  new FreeCamera("probeCam", new Vector3(0, 5, -20), scene).setTarget(Vector3.Zero());
  const plugin = new HavokPlugin(opts.useDelta ?? true, hk);
  scene.enablePhysics(opts.gravity ?? new Vector3(0, -9.81, 0), plugin);
  const phys = scene.getPhysicsEngine() as PhysicsEngineV2;
  return { engine, scene, plugin, hk, phys };
}

/** Advance exactly n physics steps of dt seconds (fires onBefore/AfterPhysicsObservable). Requires subTimeStep == 0. */
export function stepN(scene: Scene, n: number, dt = 1 / 60): void {
  for (let i = 0; i < n; i++) scene._advancePhysicsEngineStep(dt * 1000);
}

/** Raw Havok object counters: bodies, shapes, constraints, debugGeoms, worlds, queryCollectors. */
export function hkStats(hk: HavokPhysicsWithBindings) {
  const s = hk.HP_GetStatistics()[1];
  return { bodies: s[0], shapes: s[1], constraints: s[2], debugGeoms: s[3], worlds: s[4], collectors: s[5] };
}

export const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const v3 = (v: Vector3) => [r3(v.x), r3(v.y), r3(v.z)];
