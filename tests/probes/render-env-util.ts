// Shared helpers for render-env-* probes: engine setup, a stand-in apartment built from
// plan.ts with plain PBR boxes (walls with the real openings, slabs, window frames, glass,
// simple furniture, balcony), and screenshot capture to data URLs.
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  UniversalCamera,
  PointLight,
  type AbstractMesh,
} from "@babylonjs/core";
import { WALLS, CEILING_H, BALCONY, wallLength, type Wall } from "../../src/world/plan.ts";
import { srgbToLinear } from "../../src/render/env/sunModel.ts";

export function makeEngine(): { engine: Engine; scene: Scene; canvas: HTMLCanvasElement } {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  return { engine, scene, canvas };
}

export function makeCamera(scene: Scene): UniversalCamera {
  const cam = new UniversalCamera("cam", new Vector3(7.4, 1.65, 2.2), scene);
  cam.minZ = 0.03;
  cam.maxZ = 3000;
  cam.fov = (75 * Math.PI) / 180;
  cam.inertia = 0;
  scene.activeCamera = cam;
  return cam;
}

const mats = new Map<string, PBRMaterial>();
export function pbr(scene: Scene, hex: number, rough = 0.85, metal = 0, alpha = 1): PBRMaterial {
  const key = `${hex}-${rough}-${metal}-${alpha}`;
  let m = mats.get(key);
  if (m) return m;
  m = new PBRMaterial("m" + key, scene);
  const r = srgbToLinear(((hex >> 16) & 255) / 255);
  const g = srgbToLinear(((hex >> 8) & 255) / 255);
  const b = srgbToLinear((hex & 255) / 255);
  m.albedoColor = new Color3(r, g, b);
  m.roughness = rough;
  m.metallic = metal;
  if (alpha < 1) {
    m.alpha = alpha;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  mats.set(key, m);
  return m;
}

export interface StandIn {
  meshes: Mesh[];
  casters: Mesh[];
  receivers: Mesh[];
  glass: Mesh[];
}

function box(scene: Scene, name: string, min: [number, number, number], max: [number, number, number], mat: PBRMaterial, out: StandIn, cast = true): Mesh {
  const w = max[0] - min[0];
  const h = max[1] - min[1];
  const d = max[2] - min[2];
  const m = MeshBuilder.CreateBox(name, { width: Math.max(w, 1e-3), height: Math.max(h, 1e-3), depth: Math.max(d, 1e-3) }, scene);
  m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  m.material = mat;
  m.isPickable = false;
  out.meshes.push(m);
  if (mat.alpha < 1) out.glass.push(m);
  else {
    out.receivers.push(m);
    if (cast) out.casters.push(m);
  }
  return m;
}

/** Wall pieces around the openings of one plan wall. */
function buildWall(scene: Scene, w: Wall, mat: PBRMaterial, frame: PBRMaterial, glass: PBRMaterial, out: StandIn): void {
  const L = wallLength(w);
  const alongX = Math.abs(w.b[1] - w.a[1]) < 1e-6;
  const t = w.thickness / 2;
  const dir = alongX ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const at = (s: number) => (alongX ? w.a[0] + dir * s : w.a[1] + dir * s);
  const piece = (s0: number, s1: number, y0: number, y1: number, name: string, m = mat, thick = t) => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return null;
    const u0 = Math.min(at(s0), at(s1));
    const u1 = Math.max(at(s0), at(s1));
    if (alongX) return box(scene, name, [u0, y0, w.a[1] - thick], [u1, y1, w.a[1] + thick], m, out);
    return box(scene, name, [w.a[0] - thick, y0, u0], [w.a[0] + thick, y1, u1], m, out);
  };
  const ops = w.openings.slice().sort((p, q) => p.from - q.from);
  let s = 0;
  for (const o of ops) {
    piece(s, o.from, 0, CEILING_H, `${w.id}_pier_${o.id}`);
    piece(o.from, o.to, 0, o.sill, `${w.id}_sill_${o.id}`);
    piece(o.from, o.to, o.head, CEILING_H, `${w.id}_head_${o.id}`);
    if (o.kind === "window" || o.kind === "slidingDoor") {
      const ft = 0.035;
      const f = 0.05;
      piece(o.from, o.from + f, o.sill, o.head, `${o.id}_fl`, frame, ft);
      piece(o.to - f, o.to, o.sill, o.head, `${o.id}_fr`, frame, ft);
      piece(o.from, o.to, o.sill, o.sill + f, `${o.id}_fb`, frame, ft);
      piece(o.from, o.to, o.head - f, o.head, `${o.id}_ft`, frame, ft);
      const mid = (o.from + o.to) / 2;
      if (o.to - o.from > 1.4) piece(mid - 0.025, mid + 0.025, o.sill, o.head, `${o.id}_fm`, frame, ft);
      piece(o.from + f, o.to - f, o.sill + f, o.head - f, `${o.id}_glass`, glass, 0.004);
    }
    s = o.to;
  }
  piece(s, L, 0, CEILING_H, `${w.id}_pier_end`);
}

/** Stand-in apartment shell + furniture with PBR boxes. */
export function buildStandIn(scene: Scene): StandIn {
  const out: StandIn = { meshes: [], casters: [], receivers: [], glass: [] };
  const wallMat = pbr(scene, 0xe9e1d2, 0.9);
  const concrete = pbr(scene, 0xb9b3a9, 0.95);
  const partition = pbr(scene, 0xeee7da, 0.88);
  const frame = pbr(scene, 0x2e2f33, 0.45, 0.6);
  const glass = pbr(scene, 0xcfe6e0, 0.05, 0, 0.12);
  const floorMat = pbr(scene, 0x8a6a4a, 0.7);
  const ceiling = pbr(scene, 0xf4f3ef, 0.95);
  for (const w of WALLS) buildWall(scene, w, w.kind === "exterior" || w.kind === "party" ? wallMat : partition, frame, glass, out);
  box(scene, "floorSlab", [-0.2, -0.25, -0.2], [13.0, 0, 9.0], floorMat, out);
  box(scene, "ceilingSlab", [-0.2, CEILING_H, -0.2], [13.0, CEILING_H + 0.25, 9.0], ceiling, out);
  // Balcony slab, glass railing and handrail.
  box(scene, "balconySlab", [BALCONY.x0, -0.27, BALCONY.z0], [BALCONY.x1, -0.02, BALCONY.z1], concrete, out);
  box(scene, "railGlass", [BALCONY.x0 + 0.05, 0.05, BALCONY.z0 + 0.03], [BALCONY.x1 - 0.05, BALCONY.railH - 0.05, BALCONY.z0 + 0.05], glass, out);
  box(scene, "handrail", [BALCONY.x0 + 0.03, BALCONY.railH - 0.05, BALCONY.z0 + 0.01], [BALCONY.x1 - 0.03, BALCONY.railH, BALCONY.z0 + 0.07], frame, out);
  // Living room furniture.
  const fabric = pbr(scene, 0x5a6b7a, 0.95);
  const wood = pbr(scene, 0x6b4a2e, 0.6);
  const darkWood = pbr(scene, 0x3a2a1e, 0.55);
  const white = pbr(scene, 0xf0f0ec, 0.5);
  const black = pbr(scene, 0x111214, 0.3);
  box(scene, "sofaSeat", [5.0, 0, 3.4], [7.4, 0.45, 4.3], fabric, out);
  box(scene, "sofaBack", [5.0, 0.45, 4.05], [7.4, 0.9, 4.3], fabric, out);
  box(scene, "sofaArmL", [5.0, 0.45, 3.4], [5.2, 0.65, 4.05], fabric, out);
  box(scene, "sofaArmR", [7.2, 0.45, 3.4], [7.4, 0.65, 4.05], fabric, out);
  box(scene, "coffeeTable", [5.6, 0.38, 2.2], [6.8, 0.43, 2.9], wood, out);
  for (const [x, z] of [
    [5.65, 2.25],
    [6.75, 2.25],
    [5.65, 2.85],
    [6.75, 2.85],
  ])
    box(scene, "ctLeg", [x - 0.025, 0, z - 0.025], [x + 0.025, 0.38, z + 0.025], darkWood, out);
  box(scene, "tvCabinet", [4.1, 0, 1.4], [4.55, 0.5, 3.4], darkWood, out);
  box(scene, "tv", [4.15, 0.75, 1.8], [4.22, 1.45, 3.0], black, out);
  box(scene, "diningTable", [7.2, 0.72, 5.8], [8.6, 0.76, 6.7], wood, out);
  for (const [x, z] of [
    [7.25, 5.85],
    [8.55, 5.85],
    [7.25, 6.65],
    [8.55, 6.65],
  ])
    box(scene, "dtLeg", [x - 0.03, 0, z - 0.03], [x + 0.03, 0.72, z + 0.03], darkWood, out);
  box(scene, "chair1", [7.5, 0, 5.3], [7.95, 0.46, 5.75], wood, out);
  box(scene, "chair1b", [7.5, 0.46, 5.3], [7.95, 0.95, 5.35], wood, out);
  box(scene, "shelf", [8.7, 0, 0.3], [9.1, 1.9, 1.3], white, out);
  box(scene, "kitchenRun", [4.1, 0, 8.2], [8.4, 0.9, 8.8], white, out);
  box(scene, "counter", [4.1, 0.9, 8.15], [8.4, 0.94, 8.8], pbr(scene, 0x30302f, 0.3), out);
  box(scene, "fridge", [8.45, 0, 8.05], [9.15, 1.85, 8.8], pbr(scene, 0xc8c8c8, 0.35, 0.8), out);
  // Master bedroom.
  box(scene, "bed", [0.6, 0, 1.6], [2.2, 0.55, 3.7], pbr(scene, 0xdcd6cc, 0.95), out);
  box(scene, "headboard", [0.6, 0.55, 3.6], [2.2, 1.1, 3.7], darkWood, out);
  box(scene, "dresser", [3.4, 0, 2.6], [3.9, 0.9, 3.9], wood, out);
  // Bedroom 2.
  box(scene, "desk", [12.0, 0.72, 1.3], [12.75, 0.76, 2.9], wood, out);
  box(scene, "bed2", [9.4, 0, 2.6], [10.4, 0.5, 4.3], pbr(scene, 0x7a8fa6, 0.95), out);
  return out;
}

/** A ceiling lamp per room (PBR-friendly physical falloff). */
export function addCeilingLights(scene: Scene): PointLight[] {
  const spots: Array<[number, number, string]> = [
    [2.0, 2.2, "master"],
    [6.6, 2.4, "living"],
    [11.0, 2.2, "bed2"],
    [5.4, 7.0, "kitchen"],
    [7.8, 7.0, "kitchen"],
    [11.0, 6.6, "foyer"],
    [2.0, 5.0, "hallW"],
    [1.25, 7.2, "bath"],
    [3.25, 7.2, "utility"],
  ];
  return spots.map(([x, z, room], i) => {
    const l = new PointLight(`lamp_${room}_${i}`, new Vector3(x, 2.45, z), scene);
    l.diffuse = new Color3(1.0, 0.78, 0.52);
    l.specular = new Color3(0.4, 0.32, 0.22);
    l.intensity = 2.2;
    l.range = 7;
    (l as unknown as { metadata: unknown }).metadata = { room };
    return l;
  });
}

export async function frames(scene: Scene, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    scene.render();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}

export function look(cam: UniversalCamera, pos: [number, number, number], target: [number, number, number]): void {
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.setTarget(new Vector3(target[0], target[1], target[2]));
}

export function shot(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function registerAll(lighting: { setShadowCaster(m: AbstractMesh, c: boolean, l?: boolean): void; registerReceiver(m: AbstractMesh): void }, s: StandIn): void {
  for (const m of s.receivers) lighting.registerReceiver(m);
  for (const m of s.casters) {
    const bb = m.getBoundingInfo().boundingBox.extendSizeWorld;
    lighting.setShadowCaster(m, true, bb.length() * 2 > 1.5);
  }
}
