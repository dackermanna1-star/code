// Shared helpers for tests/probes/physics-sys-*.probe.ts (not a probe itself).
import { NullEngine, Engine, Scene, Vector3, Quaternion, TransformNode, FreeCamera, HemisphericLight, type PhysicsBody, type PhysicsShape } from "@babylonjs/core";
import { createPhysics, type Physics, type PhysicsOptions } from "../../src/physics/physics.ts";
import { Layer } from "../../src/core/context.ts";
import type { ShapeOpts } from "../../src/core/context.ts";

export interface World {
  engine: Engine;
  scene: Scene;
  physics: Physics;
  dispose(): void;
}

export async function makeWorld(opts: PhysicsOptions & { webgl?: boolean } = {}): Promise<World> {
  let engine: Engine;
  if (opts.webgl) {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  } else engine = new NullEngine();
  const scene = new Scene(engine);
  const cam = new FreeCamera("cam", new Vector3(0, 3, -8), scene);
  cam.setTarget(Vector3.Zero());
  new HemisphericLight("h", new Vector3(0.3, 1, 0.2), scene);
  const physics = await createPhysics(scene, opts);
  return {
    engine,
    scene,
    physics,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

export function node(w: World, name: string, pos: Vector3, rot?: Quaternion): TransformNode {
  const n = new TransformNode(name, w.scene);
  n.position.copyFrom(pos);
  n.rotationQuaternion = rot ? rot.clone() : Quaternion.Identity();
  return n;
}

export function body(w: World, name: string, pos: Vector3, motion: "static" | "dynamic" | "animated", shape: PhysicsShape, opts: { rot?: Quaternion; asleep?: boolean } = {}): PhysicsBody {
  const b = w.physics.createBody(node(w, name, pos, opts.rot), motion, opts.asleep ?? false);
  w.physics.setShape(b, shape);
  return b;
}

export function staticBox(w: World, pos: Vector3, size: Vector3, opts: ShapeOpts = {}): PhysicsBody {
  return body(w, "static", pos, "static", w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, size, { layer: Layer.STATIC, ...opts }), {});
}

export function floor(w: World, y = 0, size = 40): PhysicsBody {
  return staticBox(w, new Vector3(0, y - 0.1, 0), new Vector3(size, 0.2, size));
}

export function dynBox(w: World, pos: Vector3, size: Vector3, density: number, opts: ShapeOpts & { rot?: Quaternion; asleep?: boolean } = {}): PhysicsBody {
  const s = w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, size, { density, ...opts });
  return body(w, "box", pos, "dynamic", s, { rot: opts.rot, asleep: opts.asleep });
}

export function steps(w: World, n: number, dt = 1 / 60): void {
  for (let i = 0; i < n; i++) w.physics.step(dt);
}

/** Raw Havok object counters + Babylon/plugin map sizes (leak checks). */
export function counts(w: World) {
  const p = w.physics;
  const s = p.hk.HP_GetStatistics()[1];
  const P = p.plugin as unknown as {
    _bodies: Map<unknown, unknown>;
    _shapes: Map<unknown, unknown>;
    _bodyCollisionObservable: Map<unknown, unknown>;
    _bodyCollisionEndedObservable: Map<unknown, unknown>;
    _constraintToBodyIdPair: Map<unknown, unknown>;
  };
  return {
    hkBodies: s[0],
    hkShapes: s[1],
    hkConstraints: s[2],
    pluginBodies: P._bodies.size,
    pluginShapes: P._shapes.size,
    bodyObs: P._bodyCollisionObservable.size,
    bodyEndedObs: P._bodyCollisionEndedObservable.size,
    constraintPairs: P._constraintToBodyIdPair.size,
    engineBodies: p.engine.getBodies().length,
    own: p.debugStats().ownBodies,
    fast: p.debugStats().fastSynced,
    joints: p.stats().constraints,
  };
}

export const r = (x: number, d = 4): number => Math.round(x * 10 ** d) / 10 ** d;
export const v3 = (v: { x: number; y: number; z: number }, d = 3): number[] => [r(v.x, d), r(v.y, d), r(v.z, d)];

/** Seeded random points in a box of half-size h around the origin. */
export function randomPoints(seed: number, n: number, h: number): Float32Array {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = (rnd() * 2 - 1) * h;
  return pts;
}

export function check(results: Record<string, unknown>, name: string, ok: boolean, detail?: unknown): void {
  results[name] = ok ? (detail === undefined ? "PASS" : { pass: true, detail }) : { FAIL: true, detail };
}
