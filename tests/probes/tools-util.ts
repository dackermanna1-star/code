// Shared harness for the tools-* probes: a real Havok world stepped manually at 60 Hz plus a
// minimal GameContext around the ToolSystem (probe-local shims for the other systems):
//  - physics: raycast + sphereSweep on HavokPlugin (shape casts, filters per the verified notes)
//  - destruction: records strike()/pry() calls; strike applies J = (1+e)·μ·v to dynamic targets
//    and returns the dissipated energy ½·μ·v²·(1−e²) and a per-material hardness
//  - input: scriptable down/pressed/released; render/vfx/audio: recorders
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  HavokPlugin,
  PhysicsEngineV2,
  PhysicsRaycastResult,
  ShapeCastResult,
  PhysicsShapeSphere,
  PhysicsShapeBox,
  PhysicsBody,
  PhysicsMotionType,
  Quaternion,
  MeshBuilder,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  UniversalCamera,
  type Mesh,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { Layer, type Action, type GameContext, type StrikeInput, type StrikeResult, type RayHit, type SweepHit } from "../../src/core/context.ts";
import type { MaterialId } from "../../src/destruction/model/materials.ts";
import type { ToolContext } from "../../src/player/contracts.ts";
import { ToolSystem } from "../../src/player/tools/toolSystem.ts";

export const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
export const rv = (v: { x: number; y: number; z: number }, d = 3) => [r(v.x, d), r(v.y, d), r(v.z, d)];

export interface StrikeRec {
  step: number;
  point: number[];
  dir: number[];
  mass: number;
  speed: number;
  sharpness: number;
  contactRadius: number;
  strikerMat: string;
  source: string;
  tool?: string;
  bodyName: string;
  energy: number;
  impulse: number;
}

export interface BodyInfo {
  mesh: Mesh;
  body: PhysicsBody;
  mat: MaterialId;
  mass: number;
  dynamic: boolean;
  /** Pretend it breaks when struck with more than this energy (J). */
  breakAt?: number;
}

const HARD: Partial<Record<MaterialId, number>> = { concrete: 0.95, steel: 0.95, glass: 0.9, ceramic: 0.88, tile: 0.88, stone: 0.95, hardwood: 0.55, softwood: 0.45, gypsum: 0.3, plastic: 0.35, fabric: 0.03, foam: 0.02, cardboard: 0.1 };
const REST: Partial<Record<MaterialId, number>> = { concrete: 0.05, steel: 0.3, glass: 0.15, softwood: 0.25, gypsum: 0.05, plastic: 0.3, fabric: 0.05, cardboard: 0.1 };

class ScriptInput {
  private downs = new Set<Action>();
  private presses = new Set<Action>();
  private releases = new Set<Action>();
  readonly move = { x: 0, y: 0 };
  readonly locked = true;
  press(a: Action) {
    if (!this.downs.has(a)) this.presses.add(a);
    this.downs.add(a);
  }
  release(a: Action) {
    if (this.downs.has(a)) this.releases.add(a);
    this.downs.delete(a);
  }
  consumeLook() {
    return { dx: 0, dy: 0 };
  }
  consumeWheel() {
    return 0;
  }
  down(a: Action) {
    return this.downs.has(a);
  }
  pressed(a: Action) {
    const p = this.presses.has(a);
    this.presses.delete(a);
    return p;
  }
  released(a: Action) {
    const p = this.releases.has(a);
    this.releases.delete(a);
    return p;
  }
  requestLock() {}
  exitLock() {}
  update() {}
}

export interface Harness {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  plugin: HavokPlugin;
  ctx: GameContext;
  tools: ToolSystem;
  tc: ToolContext;
  input: ScriptInput;
  events: EventBus<GameEvents>;
  time: Time;
  strikes: StrikeRec[];
  pries: Array<{ step: number; point: number[]; dir: number[]; force: number; stress: number }>;
  shakes: number[];
  flashes: Array<{ i: number; c?: number }>;
  hitStops: number[];
  emitters: Array<{ kind: string; positions: number[][]; stopped: boolean }>;
  loops: Array<{ id: string; stopped: boolean }>;
  played: string[];
  eventsLog: Array<{ type: string; ev: unknown; step: number }>;
  bodies: BodyInfo[];
  stepCount: number;
  /** Place the gameplay camera (eye) with yaw/pitch (pitch > 0 looks down) — also moves the render camera. */
  setView(eye: Vector3, yaw: number, pitch: number): void;
  /** n fixed steps: tools.fixedUpdate → physics step → time.tick (+ per-frame viewmodel update). */
  step(n?: number): void;
  addBox(name: string, pos: Vector3, size: Vector3, opts?: { mass?: number; mat?: MaterialId; color?: Color3; breakAt?: number; layer?: number }): BodyInfo;
  render(frames?: number): void;
  /** Make pry() return this sequence of stresses (then 0); emits bondBreak at 1. */
  pryScript: number[];
}

let hkPromise: Promise<unknown> | null = null;
function havok(): Promise<unknown> {
  if (!hkPromise) hkPromise = HavokPhysics({ locateFile: () => havokWasmUrl });
  return hkPromise;
}

export async function makeHarness(canvas: HTMLCanvasElement, opts: { floor?: boolean; clear?: Color4; viewmodel?: boolean } = {}): Promise<Harness> {
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = opts.clear ?? new Color4(0.62, 0.7, 0.8, 1);
  const camera = new UniversalCamera("cam", new Vector3(0, 1.65, 0), scene);
  camera.minZ = 0.03;
  camera.maxZ = 200;
  camera.fov = (75 * Math.PI) / 180;
  camera.inertia = 0;
  scene.activeCamera = camera;
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.55;
  hemi.groundColor = new Color3(0.35, 0.3, 0.27);
  const sun = new DirectionalLight("sun", new Vector3(0.45, -0.7, 0.55), scene);
  sun.intensity = 1.0;
  sun.diffuse = new Color3(1, 0.86, 0.7);

  const hk = await havok();
  const plugin = new HavokPlugin(false, hk);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  scene.physicsEnabled = false; // we step manually; scene.render() must not step physics
  const pe = scene.getPhysicsEngine() as PhysicsEngineV2;

  const events = new EventBus<GameEvents>();
  const time = new Time();
  const settings = new Settings();
  const input = new ScriptInput();
  const strikes: StrikeRec[] = [];
  const pries: Harness["pries"] = [];
  const shakes: number[] = [];
  const flashes: Harness["flashes"] = [];
  const hitStops: number[] = [];
  const emitters: Harness["emitters"] = [];
  const loops: Harness["loops"] = [];
  const played: string[] = [];
  const eventsLog: Harness["eventsLog"] = [];
  const bodies: BodyInfo[] = [];
  const byBody = new Map<PhysicsBody, BodyInfo>();
  let stepCount = 0;
  const origHitStop = time.hitStop.bind(time);
  time.hitStop = (s: number, scale?: number) => {
    hitStops.push(r(s));
    origHitStop(s, scale);
  };
  for (const t of ["toolSwing", "toolHit", "strain", "bondBreak"] as const) events.on(t, (ev) => eventsLog.push({ type: t, ev, step: stepCount }));

  // ---------------------------------------------------------------- physics shim
  const rayRes = new PhysicsRaycastResult();
  const inRes = new ShapeCastResult();
  const hitRes = new ShapeCastResult();
  const spheres = new Map<number, PhysicsShapeSphere>();
  const physics = {
    minImpulse: 0.5,
    raycast(from: Vector3, to: Vector3, collideWith = -1, ignore: PhysicsBody | null = null): RayHit | null {
      pe.raycastToRef(from, to, rayRes, { membership: -1, collideWith, ignoreBody: ignore ?? undefined });
      if (!rayRes.hasHit || !rayRes.body) return null;
      return { body: rayRes.body, point: rayRes.hitPointWorld.clone(), normal: rayRes.hitNormalWorld.clone(), distance: rayRes.hitDistance, childIndex: -1 };
    },
    sphereSweep(from: Vector3, to: Vector3, radius: number, collideWith = -1, ignore: PhysicsBody | null = null): SweepHit | null {
      const key = Math.round(radius * 1e4);
      let sph = spheres.get(key);
      if (!sph) {
        sph = new PhysicsShapeSphere(Vector3.Zero(), radius, scene);
        spheres.set(key, sph);
      }
      sph.filterMembershipMask = -1;
      sph.filterCollideMask = collideWith;
      plugin.shapeCast({ shape: sph, rotation: Quaternion.Identity(), startPosition: from, endPosition: to, shouldHitTriggers: false, ignoreBody: ignore ?? undefined }, inRes, hitRes);
      if (!hitRes.hasHit || !hitRes.body) return null;
      const f = hitRes.hitFraction;
      return { body: hitRes.body, point: hitRes.hitPoint.clone(), normal: hitRes.hitNormal.clone(), distance: Vector3.Distance(from, to) * f, childIndex: -1, fraction: f };
    },
    wake(b: PhysicsBody) {
      b.setActivationState?.(0 as never);
    },
  };

  // ---------------------------------------------------------------- destruction stub
  let pryIdx = 0;
  const harness = {} as Harness;
  const destruction = {
    strike(s: StrikeInput): StrikeResult {
      const info = byBody.get(s.body);
      const mt = info && info.dynamic ? info.mass : Infinity;
      const mu = mt === Infinity ? s.mass : (s.mass * mt) / (s.mass + mt);
      const e = (info && REST[info.mat]) ?? 0.2;
      const J = (1 + e) * mu * s.speed;
      const E = 0.5 * mu * s.speed * s.speed * (1 - e * e);
      if (info?.dynamic) s.body.applyImpulse(s.dir.scale(J), s.point);
      const broke = !!info?.breakAt && E >= info.breakAt;
      strikes.push({
        step: stepCount,
        point: rv(s.point),
        dir: rv(s.dir),
        mass: s.mass,
        speed: r(s.speed),
        sharpness: s.sharpness,
        contactRadius: s.contactRadius,
        strikerMat: s.strikerMat,
        source: s.source,
        tool: s.tool,
        bodyName: info?.mesh.name ?? "?",
        energy: r(E, 1),
        impulse: r(J, 2),
      });
      return { energy: E, impulse: J, hardness: info ? HARD[info.mat] ?? 0.5 : 0.5, targetMat: info?.mat ?? null, partName: info?.mesh.name ?? null, assemblyName: info?.mesh.name ?? null, broke };
    },
    pry(body: PhysicsBody, point: Vector3, dir: Vector3, force: number, dt: number): number {
      const st = harness.pryScript[pryIdx++] ?? 0;
      pries.push({ step: stepCount, point: rv(point), dir: rv(dir), force, stress: st });
      if (st >= 1) events.emit("bondBreak", { pos: { x: point.x, y: point.y, z: point.z }, kind: "nail", matA: "softwood", matB: null, energy: 30 });
      return st;
    },
    materialAt(body: PhysicsBody) {
      return byBody.get(body)?.mat ?? null;
    },
    massOf(body: PhysicsBody) {
      const i = byBody.get(body);
      return i ? i.mass : null;
    },
    isStatic(body: PhysicsBody) {
      const i = byBody.get(body);
      return i ? !i.dynamic : true;
    },
  };

  const render = {
    camera,
    shake(t: number) {
      shakes.push(r(t));
    },
    getShake() {
      return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
    },
    flash(i: number, c?: number) {
      flashes.push({ i, c });
    },
  };
  const vfx = {
    emitter(kind: string, pos: { x: number; y: number; z: number }) {
      const rec = { kind, positions: [rv(pos)], stopped: false };
      emitters.push(rec);
      return {
        setPosition(p: { x: number; y: number; z: number }) {
          if (rec.positions.length < 400) rec.positions.push(rv(p));
        },
        setDirection() {},
        setRate() {},
        stop() {
          rec.stopped = true;
        },
      };
    },
    burst() {},
  };
  const audio = {
    play(id: string) {
      played.push(id);
    },
    loop(id: string) {
      const rec = { id, stopped: false };
      loops.push(rec);
      return { setPosition() {}, setGain() {}, stop() { rec.stopped = true; } };
    },
  };
  const ctx = { engine, scene, canvas, time, settings, rng: new Rng(1), events, physics, render, destruction, audio, vfx, input } as unknown as GameContext;

  const tc: ToolContext = { eye: new Vector3(0, 1.65, 0), forward: new Vector3(0, 0, 1), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), velocity: new Vector3(), ignore: null, holding: false };

  if (opts.floor !== false) {
    const floor = MeshBuilder.CreateBox("floor", { width: 20, height: 0.2, depth: 20 }, scene);
    floor.position.y = -0.1;
    const fm = new StandardMaterial("floorM", scene);
    fm.diffuseColor = new Color3(0.55, 0.5, 0.45);
    fm.specularColor = Color3.Black();
    floor.material = fm;
    const fb = new PhysicsBody(floor, PhysicsMotionType.STATIC, false, scene);
    const fs = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(20, 0.2, 20), scene);
    fs.filterMembershipMask = Layer.STATIC;
    fs.filterCollideMask = -1;
    fb.shape = fs;
    const info: BodyInfo = { mesh: floor, body: fb, mat: "concrete", mass: Infinity, dynamic: false };
    bodies.push(info);
    byBody.set(fb, info);
  }

  Object.assign(harness, {
    engine,
    scene,
    camera,
    plugin,
    ctx,
    tools: null as unknown as ToolSystem,
    tc,
    input,
    events,
    time,
    strikes,
    pries,
    shakes,
    flashes,
    hitStops,
    emitters,
    loops,
    played,
    eventsLog,
    bodies,
    pryScript: [] as number[],
    get stepCount() {
      return stepCount;
    },
    setView(eye: Vector3, yaw: number, pitch: number) {
      tc.eye.copyFrom(eye);
      tc.forward.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      tc.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      Vector3.CrossToRef(tc.forward, tc.right, tc.up);
      camera.position.copyFrom(eye);
      camera.rotation.set(pitch, yaw, 0);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        harness.tools.fixedUpdate(1 / 60, tc);
        scene._advancePhysicsEngineStep(1000 / 60);
        time.tick();
        stepCount++;
        harness.tools.update(1 / 60, tc);
      }
    },
    addBox(name: string, pos: Vector3, size: Vector3, o: { mass?: number; mat?: MaterialId; color?: Color3; breakAt?: number; layer?: number } = {}) {
      const m = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
      m.position.copyFrom(pos);
      const mat = new StandardMaterial(name + "M", scene);
      mat.diffuseColor = o.color ?? new Color3(0.7, 0.7, 0.72);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      m.material = mat;
      const dynamic = (o.mass ?? 0) > 0;
      const body = new PhysicsBody(m, dynamic ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.STATIC, false, scene);
      const sh = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), size.clone(), scene);
      sh.filterMembershipMask = o.layer ?? (dynamic ? Layer.DYNAMIC : Layer.STATIC);
      sh.filterCollideMask = -1;
      body.shape = sh;
      if (dynamic) body.setMassProperties({ mass: o.mass! });
      const info: BodyInfo = { mesh: m, body, mat: o.mat ?? "softwood", mass: dynamic ? o.mass! : Infinity, dynamic, breakAt: o.breakAt };
      bodies.push(info);
      byBody.set(body, info);
      return info;
    },
    render(frames = 1) {
      for (let i = 0; i < frames; i++) {
        harness.tools.update(1 / 60, tc);
        scene.render();
      }
    },
  });
  harness.tools = new ToolSystem(ctx);
  harness.setView(new Vector3(0, 1.65, 0), 0, 0);
  return harness;
}

/** One canvas per tile in a grid (cols × rows), hiding the default canvas. */
export function tileCanvas(i: number, cols: number, rows: number): HTMLCanvasElement {
  for (const c of Array.from(document.querySelectorAll("canvas"))) if (c.id === "renderCanvas") c.style.display = "none";
  const c = document.createElement("canvas");
  const w = 100 / cols,
    h = 100 / rows;
  c.style.cssText = `position:fixed;left:${(i % cols) * w}%;top:${Math.floor(i / cols) * h}%;width:${w}%;height:${h}%;display:block`;
  document.body.appendChild(c);
  return c;
}

/** Label overlay for a tile. */
export function tileLabel(i: number, cols: number, rows: number, text: string): void {
  const d = document.createElement("div");
  const w = 100 / cols,
    h = 100 / rows;
  d.textContent = text;
  d.style.cssText = `position:fixed;left:calc(${(i % cols) * w}% + 6px);top:calc(${Math.floor(i / cols) * h}% + 4px);font:12px monospace;color:#fff;text-shadow:0 0 3px #000;z-index:10`;
  document.body.appendChild(d);
}
