// Shared harness for the player-* probes: a real Babylon scene + Havok (fixed 1/60 s steps), the
// real Input / Player / Hud, and small stand-ins for the systems the player consumes (physics
// queries, destruction, render camera/shake, audio, vfx, world). The stand-ins implement exactly
// the contract methods the player uses and record calls for assertions.
import {
  Engine,
  Scene,
  Vector3,
  Quaternion,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  PhysicsMotionType,
  type HavokPlugin,
  type PhysicsBody,
  type PhysicsShape,
  type Mesh,
} from "@babylonjs/core";
import { Layer, type GameContext, type StrikeInput, type TargetInfo } from "../../src/core/context.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Rng } from "../../src/core/rng.ts";
import type { MaterialId } from "../../src/destruction/model/materials.ts";
import { Input } from "../../src/player/input.ts";
import { createPhysics, defaultCollideMask, type Physics } from "../../src/physics/physics.ts";

export const ALL = 0xffffffff;
export const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const v3 = (v: { x: number; y: number; z: number }) => [r3(v.x), r3(v.y), r3(v.z)];

export const defaultCollide = defaultCollideMask;

// ------------------------------------------------------------------ destruction stand-in
export interface BodyInfo {
  name: string;
  mat: MaterialId;
  isStatic: boolean;
  grabbable: boolean;
  usable: TargetInfo["usable"];
  damage?: number;
}

export class ProbeDestruction {
  strikes: Array<StrikeInput & { step: number }> = [];
  pulls: Array<{ body: PhysicsBody; point: Vector3; force: Vector3; dt: number; step: number }> = [];
  uses: Array<{ body: PhysicsBody; point: Vector3 }> = [];
  info = new Map<PhysicsBody, BodyInfo>();
  step = 0;
  register(body: PhysicsBody, i: BodyInfo) {
    this.info.set(body, i);
  }
  spawn() {
    return 0;
  }
  strike(s: StrikeInput) {
    this.strikes.push({ ...s, point: s.point.clone(), dir: s.dir.clone(), step: this.step });
    const i = this.info.get(s.body);
    return { energy: 0.5 * s.mass * s.speed * s.speed, impulse: s.mass * s.speed, hardness: 0.5, targetMat: i?.mat ?? null, partName: i?.name ?? null, assemblyName: i?.name ?? null, broke: false };
  }
  pry() {
    return 0;
  }
  pull(body: PhysicsBody, point: Vector3, force: Vector3, dt: number) {
    this.pulls.push({ body, point: point.clone(), force: force.clone(), dt, step: this.step });
  }
  use(body: PhysicsBody, point: Vector3) {
    this.uses.push({ body, point: point.clone() });
    return true;
  }
  target(body: PhysicsBody, _point: Vector3, _child: number): TargetInfo | null {
    const i = this.info.get(body);
    if (!i) return null;
    return {
      assemblyId: 1,
      assemblyType: i.name.toLowerCase(),
      assemblyName: i.name,
      partName: "body",
      mat: i.mat,
      damage: i.damage ?? 0,
      mass: this.massOf(body) ?? 0,
      isStatic: i.isStatic,
      grabbable: i.grabbable,
      usable: i.usable,
    };
  }
  massOf(body: PhysicsBody): number | null {
    if (!this.info.has(body)) return null;
    try {
      return body.getMassProperties().mass ?? null;
    } catch {
      return null;
    }
  }
  isStatic(body: PhysicsBody) {
    const i = this.info.get(body);
    return i ? i.isStatic : body.getMotionType() !== PhysicsMotionType.DYNAMIC;
  }
  materialAt(body: PhysicsBody): MaterialId | null {
    return this.info.get(body)?.mat ?? null;
  }
  beforePhysics() {}
  afterPhysics() {}
  update() {}
  stats() {
    return { assemblies: 12, islands: 40, dynamicIslands: 9, parts: 380, fractures: 23, bondsBroken: 57, debrisIslands: 31, consolidated: 4, valueDestroyed: 1234, totalValue: 48000, msLastStep: 0.4 };
  }
  list() {
    return [];
  }
  positionOf() {
    return null;
  }
}

// ------------------------------------------------------------------ world
export interface ProbeWorld {
  engine: Engine;
  scene: Scene;
  plugin: HavokPlugin;
  ctx: GameContext;
  physics: Physics;
  destruction: ProbeDestruction;
  input: Input;
  events: EventBus<GameEvents>;
  log: Record<string, Array<unknown>>;
  shakes: number[];
  /** One full fixed step in game order (input → player → physics). */
  step(n?: number, render?: boolean): void;
  box(name: string, size: [number, number, number], pos: [number, number, number], o?: BoxOpts): PhysicsBody;
}

export interface BoxOpts {
  motion?: PhysicsMotionType;
  mass?: number;
  layer?: number;
  color?: Color3;
  rot?: Quaternion;
  container?: boolean; // wrap the box in a 2-child container (tests leaf-mask handling)
  friction?: number;
}

export async function makeWorld(opts: { gravity?: number } = {}): Promise<ProbeWorld> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.62, 0.7, 1);
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = new Color3(0.25, 0.22, 0.2);
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 0.6;
  // the real physics module (fixed steps, substeps, layers, queries, impacts)
  const physics = await createPhysics(scene, { gravity: -(opts.gravity ?? 9.81) });
  const plugin = physics.plugin;
  const camera = new UniversalCamera("cam", new Vector3(0, 1.65, 0), scene);
  camera.minZ = 0.03;
  camera.maxZ = 500;
  camera.inertia = 0;
  scene.activeCamera = camera;

  const settings = new Settings();
  settings.data.showHints = false;
  const time = new Time();
  const events = new EventBus<GameEvents>();
  const destruction = new ProbeDestruction();
  const input = new Input(canvas, settings);
  const shakes: number[] = [];
  const log: Record<string, Array<unknown>> = {};
  for (const k of ["footstep", "land", "grab", "throw", "drop"] as const) {
    log[k] = [];
    events.on(k, (e) => log[k].push(e));
  }
  const render = {
    camera,
    worldMaterial: null,
    glassMaterial: null,
    getShake: () => ({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }),
    shake: (t: number) => shakes.push(t),
    flash: () => {},
    applyQuality: () => {},
    setPS2Mode: () => {},
    setPower: () => {},
    addLight: () => {},
    removeLight: () => {},
    setShadowCaster: () => {},
    captureEnvironment: () => {},
    buildIsland: () => ({ opaque: null, glass: null }),
    disposeIsland: () => {},
    update: () => {},
  };
  const audio = { resume: async () => {}, setListener: () => {}, play: () => {}, loop: () => ({ setPosition() {}, setGain() {}, stop() {} }), setMasterVolume: () => {}, update: () => {}, activeVoices: 3 };
  const vfx = { burst: () => {}, emitter: () => ({ setPosition() {}, setDirection() {}, setRate() {}, stop() {} }), micro: () => {}, decal: () => {}, fixedUpdate: () => {}, update: () => {}, particleCount: 120, microCount: 45 };
  const world = { build: async () => {}, roomAt: () => null, rooms: [], spawn: { pos: { x: 0, y: 1.65, z: 0 }, yaw: 0, pitch: 0 } };
  const hud = { update: () => {}, toast: (t: string) => (log.toast ??= []).push(t), setLoading: () => {}, hideLoading: () => {}, menuOpen: false };
  const ctx = {
    engine,
    scene,
    canvas,
    time,
    settings,
    rng: new Rng(7),
    events,
    physics,
    render,
    destruction,
    audio,
    vfx,
    input,
    world,
    hud,
    debug: { update: () => {} },
  } as unknown as GameContext;

  const w: ProbeWorld = {
    engine,
    scene,
    plugin,
    ctx,
    physics,
    destruction,
    input,
    events,
    log,
    shakes,
    step(n = 1, render = false) {
      for (let i = 0; i < n; i++) {
        input.update();
        ctx.player?.fixedUpdate(FIXED_DT);
        physics.step(FIXED_DT);
        time.tick();
        destruction.step++;
        if (render) {
          ctx.player?.update(FIXED_DT);
        }
      }
    },
    box(name, size, pos, o = {}) {
      const node = new TransformNode(name, scene);
      node.position.set(pos[0], pos[1], pos[2]);
      node.rotationQuaternion = o.rot ? o.rot.clone() : Quaternion.Identity();
      node.computeWorldMatrix(true);
      const motion = o.motion ?? PhysicsMotionType.STATIC;
      const m = motion === PhysicsMotionType.STATIC ? "static" : motion === PhysicsMotionType.ANIMATED ? "animated" : "dynamic";
      const body = physics.createBody(node, m);
      const layer = o.layer ?? (motion === PhysicsMotionType.STATIC ? Layer.STATIC : Layer.DYNAMIC);
      const vol = size[0] * size[1] * size[2];
      const density = o.mass !== undefined ? o.mass / vol : 600;
      const opts = { layer, collideWith: defaultCollide(layer), friction: o.friction ?? 0.6, restitution: 0.05, density };
      const I = { x: 0, y: 0, z: 0, w: 1 };
      let shape: PhysicsShape;
      if (o.container) {
        const hx = size[0] / 2;
        const a = physics.boxShape({ x: -hx / 2, y: 0, z: 0 }, I, { x: hx, y: size[1], z: size[2] }, opts);
        const b = physics.boxShape({ x: hx / 2, y: 0, z: 0 }, I, { x: hx, y: size[1], z: size[2] }, opts);
        shape = physics.containerShape([a, b]);
      } else shape = physics.boxShape({ x: 0, y: 0, z: 0 }, I, { x: size[0], y: size[1], z: size[2] }, opts);
      physics.setShape(body, shape);
      const mesh: Mesh = MeshBuilder.CreateBox(name + "_m", { width: size[0], height: size[1], depth: size[2] }, scene);
      const mat = new StandardMaterial(name + "_mat", scene);
      mat.diffuseColor = o.color ?? (motion === PhysicsMotionType.STATIC ? new Color3(0.62, 0.6, 0.56) : new Color3(0.8, 0.45, 0.2));
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;
      mesh.parent = node;
      return body;
    },
  };
  return w;
}

/** Simulate a physical key press/release on window (Input listens there). */
export function key(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
}

// ------------------------------------------------------------------ HUD probe helpers
/** A simple furnished room (floor, walls, a few boxes) as a backdrop for HUD screenshots. */
export function buildBackdrop(w: ProbeWorld): { crate: PhysicsBody } {
  w.box("floor", [10, 0.2, 10], [0, -0.1, 0], { color: new Color3(0.55, 0.42, 0.3) });
  w.box("wallN", [10, 2.7, 0.2], [0, 1.35, 4], { color: new Color3(0.86, 0.84, 0.78) });
  w.box("wallW", [0.2, 2.7, 10], [-3.5, 1.35, 0], { color: new Color3(0.8, 0.84, 0.78) });
  w.box("wallE", [0.2, 2.7, 10], [3.5, 1.35, 0], { color: new Color3(0.82, 0.8, 0.76) });
  w.box("counter", [2.4, 0.9, 0.6], [-1.6, 0.45, 3.5], { color: new Color3(0.9, 0.9, 0.88) });
  const crate = w.box("microwave", [0.5, 0.3, 0.36], [0.2, 0.15, 1.6], { motion: PhysicsMotionType.DYNAMIC, mass: 13, color: new Color3(0.78, 0.78, 0.8) });
  w.destruction.register(crate, { name: "Microwave Oven", mat: "steelSheet", isStatic: false, grabbable: true, usable: null, damage: 0.34 });
  w.box("tv", [1.2, 0.7, 0.08], [1.8, 1.3, 3.85], { color: new Color3(0.08, 0.08, 0.1) });
  w.box("table", [1.0, 0.75, 0.6], [1.6, 0.375, 1.8], { motion: PhysicsMotionType.DYNAMIC, mass: 18, color: new Color3(0.45, 0.3, 0.18) });
  return { crate };
}

/** A tool system stand-in (selected tool + charge) so the hotbar/charge meter can be shown. */
export function stubTools(current: string, charge = 0) {
  const names: Record<string, string> = { hands: "Fists", hammer: "Claw Hammer", sledgehammer: "Sledgehammer", crowbar: "Crowbar", bat: "Baseball Bat", axe: "Axe", extinguisher: "Extinguisher" };
  const defs: Record<string, { name: string }> = {};
  for (const [k, v] of Object.entries(names)) defs[k] = { name: v };
  return {
    current,
    defs,
    charge,
    busy: false,
    select(id: string) {
      this.current = id;
    },
    fixedUpdate() {},
    update() {},
    kick() {},
    stomp() {},
    debugSwing() {},
  };
}

/** Render a few frames through the real render loop (rAF) so the canvas has content. */
export function renderFrames(w: ProbeWorld, n: number, perFrame?: () => void): Promise<void> {
  return new Promise((res) => {
    let k = 0;
    const fn = () => {
      perFrame?.();
      w.scene.render();
      if (++k >= n) {
        w.engine.stopRenderLoop(fn);
        res();
      }
    };
    w.engine.runRenderLoop(fn);
  });
}
