// Shared helpers for tests/probes/destruction-*.probe.ts (not a probe itself): a real Physics +
// Destruction pair with lightweight render/vfx doubles (plain StandardMaterial meshes built from
// RenderGeom, counted VFX calls), test assemblies (floor, glued table, framed glass pane, hinged
// door with latch, drawer) and leak counters.

import { Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight, Mesh, VertexData, StandardMaterial, VertexBuffer, type TransformNode, type AbstractMesh, type Light, type UniversalCamera, type Material } from "@babylonjs/core";
import { createPhysics, type Physics } from "../../src/physics/physics.ts";
import type { EmitterHandle, IslandMeshes, RenderSystem, VfxKind, VfxSystem } from "../../src/core/context.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import type { QualityPreset } from "../../src/core/settings.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";
import { surfaceDef, S } from "../../src/render/surfaces.ts";
import { polyBox, faceAttr } from "../../src/geom/poly.ts";
import { qaxisAngle, type Vec3 } from "../../src/geom/vec.ts";
import type { AssemblyDef, BondDef, PartDef } from "../../src/destruction/model/types.ts";
import type { MaterialId } from "../../src/destruction/model/materials.ts";
import type { MicroKind } from "../../src/destruction/model/materials.ts";

// ------------------------------------------------------------------------------ render double
function srgbToLin(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export class MockRender implements RenderSystem {
  readonly worldMaterial: Material;
  readonly glassMaterial: Material;
  readonly camera: UniversalCamera;
  lights: Light[] = [];
  power = true;
  builds = 0;
  disposes = 0;
  liveMeshes = new Set<Mesh>();
  private scene: Scene;

  constructor(scene: Scene, camera: UniversalCamera) {
    this.scene = scene;
    this.camera = camera;
    const wm = new StandardMaterial("world", scene);
    wm.specularColor = new Color3(0.15, 0.15, 0.15);
    this.worldMaterial = wm;
    const gm = new StandardMaterial("glass", scene);
    gm.alpha = 0.35;
    gm.diffuseColor = new Color3(0.7, 0.9, 0.85);
    gm.specularColor = new Color3(1, 1, 1);
    gm.backFaceCulling = false;
    this.glassMaterial = gm;
  }

  buildIsland(node: TransformNode, geoms: RenderGeom[], prev: IslandMeshes | null, name: string): IslandMeshes {
    if (prev) this.disposeIsland(prev);
    this.builds++;
    const opaque = this.makeMesh(node, geoms, name, false);
    const glass = this.makeMesh(node, geoms, name + ":glass", true);
    return { opaque, glass };
  }

  private makeMesh(node: TransformNode, geoms: RenderGeom[], name: string, transparent: boolean): Mesh | null {
    const pos: number[] = [],
      nrm: number[] = [],
      col: number[] = [],
      idx: number[] = [];
    for (const g of geoms) {
      // keep only triangles whose surface matches the pass
      const base = pos.length / 3;
      const remap = new Int32Array(g.vertexCount).fill(-1);
      let k = 0;
      for (let t = 0; t < g.indices.length; t += 3) {
        const a = g.indices[t];
        const sd = surfaceDef(g.surf[a]);
        if (!!sd.transparent !== transparent) continue;
        for (let j = 0; j < 3; j++) {
          const v = g.indices[t + j];
          if (remap[v] < 0) {
            remap[v] = base + k++;
            pos.push(g.positions[3 * v], g.positions[3 * v + 1], g.positions[3 * v + 2]);
            nrm.push(g.normals[3 * v], g.normals[3 * v + 1], g.normals[3 * v + 2]);
            const s = surfaceDef(g.surf[v]);
            const tint = g.tint[v];
            const st = s.tint;
            col.push(
              srgbToLin(((tint >> 16) & 255) * (((st >> 16) & 255) / 255)),
              srgbToLin(((tint >> 8) & 255) * (((st >> 8) & 255) / 255)),
              srgbToLin((tint & 255) * ((st & 255) / 255)),
              1,
            );
          }
          idx.push(remap[v]);
        }
      }
    }
    if (!idx.length) return null;
    const m = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.normals = nrm;
    vd.colors = col;
    vd.indices = idx;
    vd.applyToMesh(m);
    m.material = transparent ? this.glassMaterial : this.worldMaterial;
    m.parent = node;
    m.isPickable = false;
    this.liveMeshes.add(m);
    return m;
  }

  disposeIsland(m: IslandMeshes): void {
    for (const x of [m.opaque, m.glass]) {
      if (x && !x.isDisposed()) {
        this.liveMeshes.delete(x);
        x.dispose();
        this.disposes++;
      }
    }
  }
  setShadowCaster(_m: AbstractMesh, _c: boolean): void {}
  addLight(light: Light): void {
    this.lights.push(light);
  }
  removeLight(light: Light): void {
    this.lights = this.lights.filter((l) => l !== light);
  }
  setPower(on: boolean): void {
    this.power = on;
  }
  shake(): void {}
  getShake() {
    return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
  }
  flash(): void {}
  setPS2Mode(): void {}
  captureEnvironment(): void {}
  applyQuality(_q: QualityPreset): void {}
  update(): void {}
}

// --------------------------------------------------------------------------------- vfx double
export class MockVfx implements VfxSystem {
  bursts: Record<string, number> = {};
  micros: Record<string, number> = {};
  emitters = 0;
  liveEmitters = 0;
  decals: Record<string, number> = {};
  particleCount = 0;
  microCount = 0;
  burst(kind: VfxKind): void {
    this.bursts[kind] = (this.bursts[kind] ?? 0) + 1;
  }
  emitter(_kind: VfxKind, _pos: Vec3, _dir: Vec3, _rate: number): EmitterHandle {
    this.emitters++;
    this.liveEmitters++;
    let stopped = false;
    return {
      setPosition: () => {},
      setDirection: () => {},
      setRate: () => {},
      stop: () => {
        if (!stopped) this.liveEmitters--;
        stopped = true;
      },
    };
  }
  micro(kind: MicroKind, pos: Vec3, vel: Vec3, size: number): void {
    if (!Number.isFinite(pos.x + pos.y + pos.z + vel.x + vel.y + vel.z + size)) throw new Error("micro: non-finite input");
    this.micros[kind] = (this.micros[kind] ?? 0) + 1;
    this.microCount++;
  }
  decal(kind: "impact" | "scorch" | "puddle" | "crack"): void {
    this.decals[kind] = (this.decals[kind] ?? 0) + 1;
  }
  fixedUpdate(): void {}
  update(): void {}
}

// ----------------------------------------------------------------------------------- the sim
export interface Sim {
  engine: Engine;
  scene: Scene;
  physics: Physics;
  render: MockRender;
  vfx: MockVfx;
  events: EventBus<GameEvents>;
  time: Time;
  settings: Settings;
  d: Destruction;
  ev: Record<string, number>;
  last: Partial<Record<keyof GameEvents, unknown>>;
  log: Array<{ t: number; type: string; ev: unknown }>;
  step(n?: number): void;
  counts(): Record<string, number>;
  render1(): void;
  /** Wait for shaders, then render a few frames (screenshots). */
  renderReady(frames?: number): Promise<void>;
}

const EVENT_TYPES: Array<keyof GameEvents> = ["impact", "fracture", "chip", "crack", "dent", "bondBreak", "split", "strain", "feature", "damage", "fellOut"];

export async function makeSim(opts: { webgl?: boolean; camPos?: Vector3; camTarget?: Vector3 } = {}): Promise<Sim> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.62, 0.7, 1);
  const cam = new FreeCamera("cam", opts.camPos ?? new Vector3(2.2, 1.8, -3.2), scene) as unknown as UniversalCamera;
  (cam as unknown as FreeCamera).setTarget(opts.camTarget ?? new Vector3(0, 0.7, 0));
  cam.minZ = 0.02;
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = new Color3(0.35, 0.33, 0.3);
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.5), scene);
  sun.intensity = 0.7;
  const physics = await createPhysics(scene, {});
  const render = new MockRender(scene, cam);
  const vfx = new MockVfx();
  const events = new EventBus<GameEvents>();
  const time = new Time();
  const settings = new Settings();
  const rng = new Rng(1234);
  const d = new Destruction({ physics, render, vfx, events, time, settings, rng, scene });
  const ev: Record<string, number> = {};
  const last: Partial<Record<keyof GameEvents, unknown>> = {};
  const log: Array<{ t: number; type: string; ev: unknown }> = [];
  for (const t of EVENT_TYPES) {
    events.on(t, (e: unknown) => {
      ev[t] = (ev[t] ?? 0) + 1;
      last[t] = e;
      if (log.length < 4000) log.push({ t: time.simTime, type: t, ev: e });
    });
  }
  const sim: Sim = {
    engine,
    scene,
    physics,
    render,
    vfx,
    events,
    time,
    settings,
    d,
    ev,
    last,
    log,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        d.beforePhysics(FIXED_DT);
        physics.step(FIXED_DT);
        time.tick();
        d.afterPhysics(FIXED_DT);
        vfx.fixedUpdate();
        d.update(FIXED_DT);
      }
    },
    counts() {
      const s = physics.hk.HP_GetStatistics()[1];
      const ps = physics.stats();
      const ds = d.stats();
      return {
        hkBodies: s[0],
        hkShapes: s[1],
        bodies: ps.bodies,
        constraints: ps.constraints,
        meshes: scene.meshes.length,
        liveMeshes: render.liveMeshes.size,
        nodes: scene.transformNodes.length,
        lights: scene.lights.length,
        islands: ds.islands,
        parts: ds.parts,
        assemblies: ds.assemblies,
      };
    },
    render1() {
      scene.render();
    },
    async renderReady(frames = 3) {
      await scene.whenReadyAsync();
      for (let i = 0; i < frames; i++) scene.render();
    },
  };
  return sim;
}

// ------------------------------------------------------------------------------ assemblies
const ID = { x: 0, y: 0, z: 0, w: 1 };

export function boxPart(name: string, mat: MaterialId, surf: keyof typeof S, size: Vec3, center: Vec3, o: Partial<PartDef> & { tint?: number; rotY?: number } = {}): PartDef {
  const q = o.rotY ? qaxisAngle({ x: 0, y: 1, z: 0 }, o.rotY) : ID;
  const a = faceAttr(S[surf], o.tint ?? 0xffffff);
  const { tint: _t, rotY: _r, ...rest } = o;
  return { name, mat, poly: polyBox(size, a, { p: center, q }), ...rest };
}

export function floorDef(size = 8): AssemblyDef {
  return {
    type: "testFloor",
    name: "Test Floor",
    category: "structure",
    value: 0,
    parts: [boxPart("slab", "concrete", "concrete", { x: size, y: 0.2, z: size }, { x: 0, y: -0.1, z: 0 })],
    bonds: [{ a: "slab", b: "world", kind: "mortar", strength: 1e9, anchor: { x: 0, y: -0.2, z: 0 } }],
  };
}

/** Pine table: 1.2 × 0.7 top, 4 legs glued. */
export function tableDef(): AssemblyDef {
  const parts: PartDef[] = [boxPart("top", "softwood", "wood_pine", { x: 1.2, y: 0.03, z: 0.7 }, { x: 0, y: 0.735, z: 0 }, { grain: { x: 1, y: 0, z: 0 } })];
  const bonds: BondDef[] = [];
  let i = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const n = `leg${i++}`;
      parts.push(boxPart(n, "softwood", "wood_pine", { x: 0.05, y: 0.72, z: 0.05 }, { x: sx * 0.55, y: 0.36, z: sz * 0.3 }, { grain: { x: 0, y: 1, z: 0 } }));
      bonds.push({ a: n, b: "top", kind: "glue", anchor: { x: sx * 0.55, y: 0.72, z: sz * 0.3 } });
    }
  return { type: "testTable", name: "Pine Table", category: "furniture", value: 120, parts, bonds };
}

/** 0.9 × 1.1 m annealed 4 mm pane in a world-anchored pine frame (window-like). */
export function paneDef(): AssemblyDef {
  const W = 0.9,
    H = 1.1,
    t = 0.05;
  const parts: PartDef[] = [
    boxPart("frameL", "softwood", "wood_painted", { x: t, y: H + 2 * t, z: 0.07 }, { x: -(W + t) / 2, y: H / 2, z: 0 }),
    boxPart("frameR", "softwood", "wood_painted", { x: t, y: H + 2 * t, z: 0.07 }, { x: (W + t) / 2, y: H / 2, z: 0 }),
    boxPart("frameT", "softwood", "wood_painted", { x: W, y: t, z: 0.07 }, { x: 0, y: H + t / 2, z: 0 }),
    boxPart("frameB", "softwood", "wood_painted", { x: W, y: t, z: 0.07 }, { x: 0, y: -t / 2, z: 0 }),
    boxPart("glass", "glass", "glass", { x: W, y: H, z: 0.004 }, { x: 0, y: H / 2, z: 0 }),
  ];
  const bonds: BondDef[] = [
    { a: "frameL", b: "frameT", kind: "screw", strength: 200 },
    { a: "frameR", b: "frameT", kind: "screw", strength: 200 },
    { a: "frameL", b: "frameB", kind: "screw", strength: 200 },
    { a: "frameR", b: "frameB", kind: "screw", strength: 200 },
    { a: "frameB", b: "world", kind: "screw", strength: 500, anchor: { x: 0, y: -t, z: 0 } },
    { a: "frameL", b: "world", kind: "screw", strength: 500, anchor: { x: -(W + t) / 2 - t / 2, y: H / 2, z: 0 } },
    { a: "frameR", b: "world", kind: "screw", strength: 500, anchor: { x: (W + t) / 2 + t / 2, y: H / 2, z: 0 } },
    { a: "glass", b: "frameL", kind: "clip", strength: 8, anchor: { x: -W / 2, y: H / 2, z: 0 } },
    { a: "glass", b: "frameR", kind: "clip", strength: 8, anchor: { x: W / 2, y: H / 2, z: 0 } },
    { a: "glass", b: "frameT", kind: "clip", strength: 8, anchor: { x: 0, y: H, z: 0 } },
    { a: "glass", b: "frameB", kind: "clip", strength: 8, anchor: { x: 0, y: 0, z: 0 } },
  ];
  return { type: "testPane", name: "Window Pane", category: "fixture", value: 200, parts, bonds };
}

/** Door 0.8 × 2.0 slab on 3 hinges (+Y axis at x = −0.4) in a world-anchored frame, with a latch. Opens towards −Z… for θ ∈ [0, 100°]. */
export function doorDef(opts: { latch?: number; spring?: number } = {}): AssemblyDef {
  const W = 0.8,
    H = 2.0,
    T = 0.04;
  const parts: PartDef[] = [
    boxPart("jambL", "softwood", "wood_painted", { x: 0.04, y: H + 0.04, z: 0.12 }, { x: -W / 2 - 0.022, y: H / 2, z: 0 }),
    boxPart("jambR", "softwood", "wood_painted", { x: 0.04, y: H + 0.04, z: 0.12 }, { x: W / 2 + 0.022, y: H / 2, z: 0 }),
    boxPart("head", "softwood", "wood_painted", { x: W + 0.084, y: 0.04, z: 0.12 }, { x: 0, y: H + 0.022, z: 0 }),
    boxPart("slab", "mdf", "wood_painted", { x: W, y: H - 0.01, z: T }, { x: 0, y: H / 2 + 0.005, z: 0 }, { tint: 0xd8cfc0 }),
    boxPart("handle", "steel", "chrome", { x: 0.12, y: 0.02, z: 0.06 }, { x: W / 2 - 0.1, y: 1.0, z: -0.05 }),
  ];
  const hingeX = -W / 2;
  const joint = (y: number) => ({ axis: { x: 0, y: 1, z: 0 }, pivot: { x: hingeX, y, z: 0 }, min: 0, max: (100 * Math.PI) / 180, friction: 0.5, group: "slab#hinge0", spring: opts.spring });
  const bonds: BondDef[] = [
    { a: "jambL", b: "head", kind: "nail", strength: 300 },
    { a: "jambR", b: "head", kind: "nail", strength: 300 },
    { a: "jambL", b: "world", kind: "screw", strength: 2000, anchor: { x: -W / 2 - 0.04, y: 1, z: 0 } },
    { a: "jambR", b: "world", kind: "screw", strength: 2000, anchor: { x: W / 2 + 0.04, y: 1, z: 0 } },
    { a: "handle", b: "slab", kind: "screw", strength: 70 },
    { a: "slab", b: "jambL", kind: "hinge", anchor: { x: hingeX, y: 0.25, z: 0 }, joint: joint(0.25) },
    { a: "slab", b: "jambL", kind: "hinge", anchor: { x: hingeX, y: 1.0, z: 0 }, joint: joint(1.0) },
    { a: "slab", b: "jambL", kind: "hinge", anchor: { x: hingeX, y: 1.75, z: 0 }, joint: joint(1.75) },
  ];
  if (opts.latch !== undefined)
    bonds.push({ a: "slab", b: "jambR", kind: "latch", strength: opts.latch, anchor: { x: W / 2, y: 1.0, z: 0 }, joint: { axis: { x: 0, y: 1, z: 0 }, pivot: { x: hingeX, y: 0.25, z: 0 }, min: 0, max: 0, group: "slab#hinge0" } });
  return { type: "testDoor", name: "Interior Door", category: "fixture", value: 250, parts, bonds };
}

/** Small box crate (dynamic) for drops / consolidation tests. */
export function blockDef(mat: MaterialId, size: Vec3, name = "block", surf: keyof typeof S = "plastic"): AssemblyDef {
  return { type: "testBlock", name, category: "misc", value: 5, parts: [boxPart("b", mat, surf, size, { x: 0, y: size.y / 2, z: 0 })], bonds: [] };
}

export const round = (x: number, k = 1000): number => Math.round(x * k) / k;
export { FIXED_DT };

/** Gate hinged directly to the WORLD (anchor body) about +Y at x = −0.45, limits [−90°, 90°]. */
export function gateDef(): AssemblyDef {
  const joint = (y: number) => ({ axis: { x: 0, y: 1, z: 0 }, pivot: { x: -0.45, y, z: 0 }, min: -Math.PI / 2, max: Math.PI / 2, friction: 0.3, group: "gate#hinge" });
  return {
    type: "testGate",
    name: "Garden Gate",
    category: "fixture",
    value: 90,
    parts: [boxPart("leaf", "softwood", "wood_pine", { x: 0.9, y: 1.0, z: 0.03 }, { x: 0, y: 0.6, z: 0 }, { grain: { x: 0, y: 1, z: 0 } })],
    bonds: [
      { a: "leaf", b: "world", kind: "hinge", anchor: { x: -0.45, y: 0.3, z: 0 }, joint: joint(0.3) },
      { a: "leaf", b: "world", kind: "hinge", anchor: { x: -0.45, y: 0.9, z: 0 }, joint: joint(0.9) },
    ],
  };
}

/** Wall cabinet (static, screwed to the world) with a drawer on two slider runners (opens along +Z up to 0.4 m). */
export function drawerDef(): AssemblyDef {
  const parts: PartDef[] = [
    boxPart("left", "particleboard", "laminate_white", { x: 0.018, y: 0.2, z: 0.5 }, { x: -0.291, y: 0.6, z: 0 }),
    boxPart("right", "particleboard", "laminate_white", { x: 0.018, y: 0.2, z: 0.5 }, { x: 0.291, y: 0.6, z: 0 }),
    boxPart("bottom", "particleboard", "laminate_white", { x: 0.6, y: 0.018, z: 0.5 }, { x: 0, y: 0.491, z: 0 }),
    boxPart("front", "mdf", "wood_painted", { x: 0.56, y: 0.17, z: 0.018 }, { x: 0, y: 0.6, z: 0.259 }),
    boxPart("box", "plywood", "plywood", { x: 0.54, y: 0.15, z: 0.46 }, { x: 0, y: 0.585, z: 0.02 }),
  ];
  const run = (x: number) => ({ axis: { x: 0, y: 0, z: 1 }, pivot: { x, y: 0.56, z: 0 }, min: 0, max: 0.4, friction: 2, group: "drawer#slide" });
  const bonds: BondDef[] = [
    { a: "left", b: "bottom", kind: "screw", strength: 140 },
    { a: "right", b: "bottom", kind: "screw", strength: 140 },
    { a: "left", b: "world", kind: "screw", strength: 400, anchor: { x: -0.3, y: 0.6, z: -0.25 } },
    { a: "right", b: "world", kind: "screw", strength: 400, anchor: { x: 0.3, y: 0.6, z: -0.25 } },
    { a: "front", b: "box", kind: "glue", strength: 120 },
    { a: "box", b: "left", kind: "slider", strength: 50, anchor: { x: -0.275, y: 0.56, z: 0 }, joint: run(-0.275) },
    { a: "box", b: "right", kind: "slider", strength: 50, anchor: { x: 0.275, y: 0.56, z: 0 }, joint: run(0.275) },
  ];
  return { type: "testDrawer", name: "Drawer Cabinet", category: "furniture", value: 150, parts, bonds };
}
