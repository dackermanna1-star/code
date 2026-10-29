// Probe: the render-env stack inside the real RenderSystem (render-core world material with
// texture arrays, batching, interior environment capture) on a stand-in apartment built from
// plan.ts as world-material islands, lit by fixture-like ceiling lights. Screenshots of the
// tuning viewpoints (+ PS2 mode and SSAO off). Query: ?quality=high&views=spawn,slider
// Run: node tests/probe.mjs tests/probes/render-env-integration.probe.ts (prints data URLs; use a
// wrapper that writes value.shots.* to files).
import { Color3, Engine, PointLight, Scene, SceneInstrumentation, TransformNode, Vector3 } from "@babylonjs/core";
import { Settings, type QualityLevel } from "../../src/core/settings.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { S } from "../../src/render/surfaces.ts";
import { polyBox, faceAttr } from "../../src/geom/poly.ts";
import { polyToRenderGeom, type RenderGeom } from "../../src/geom/meshgen.ts";
import { WALLS, CEILING_H, BALCONY, wallLength, type Wall } from "../../src/world/plan.ts";
import type { Lighting } from "../../src/render/lighting.ts";
import { whenReady } from "./render-env-util.ts";

type V3 = [number, number, number];

function bx(min: V3, max: V3, surf: number, tint = 0xffffff): RenderGeom {
  const size = { x: Math.max(max[0] - min[0], 1e-3), y: Math.max(max[1] - min[1], 1e-3), z: Math.max(max[2] - min[2], 1e-3) };
  const p = { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 };
  return polyToRenderGeom(polyBox(size, faceAttr(surf, tint), { p, q: { x: 0, y: 0, z: 0, w: 1 } }));
}

/** Wall pieces around a plan wall's openings (+ frames and glass for windows / sliders). */
function wallGeoms(w: Wall, out: RenderGeom[]): void {
  const L = wallLength(w);
  const alongX = Math.abs(w.b[1] - w.a[1]) < 1e-6;
  const t = w.thickness / 2;
  const dir = alongX ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const at = (s: number) => (alongX ? w.a[0] + dir * s : w.a[1] + dir * s);
  const surf = w.kind === "exterior" ? S.paint_wall : S.paint_wall;
  const tint = w.kind === "exterior" || w.kind === "party" ? 0xe9e1d2 : 0xeee7da;
  const piece = (s0: number, s1: number, y0: number, y1: number, sf = surf, tn = tint, thick = t) => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    const u0 = Math.min(at(s0), at(s1));
    const u1 = Math.max(at(s0), at(s1));
    if (alongX) out.push(bx([u0, y0, w.a[1] - thick], [u1, y1, w.a[1] + thick], sf, tn));
    else out.push(bx([w.a[0] - thick, y0, u0], [w.a[0] + thick, y1, u1], sf, tn));
  };
  const ops = w.openings.slice().sort((p, q) => p.from - q.from);
  let s = 0;
  for (const o of ops) {
    piece(s, o.from, 0, CEILING_H);
    piece(o.from, o.to, 0, o.sill);
    piece(o.from, o.to, o.head, CEILING_H);
    if (o.kind === "window" || o.kind === "slidingDoor") {
      const f = 0.05;
      piece(o.from, o.from + f, o.sill, o.head, S.aluminum, 0x3a3b3f, 0.035);
      piece(o.to - f, o.to, o.sill, o.head, S.aluminum, 0x3a3b3f, 0.035);
      piece(o.from, o.to, o.sill, o.sill + f, S.aluminum, 0x3a3b3f, 0.035);
      piece(o.from, o.to, o.head - f, o.head, S.aluminum, 0x3a3b3f, 0.035);
      const mid = (o.from + o.to) / 2;
      if (o.to - o.from > 1.4) piece(mid - 0.025, mid + 0.025, o.sill, o.head, S.aluminum, 0x3a3b3f, 0.035);
      piece(o.from + f, o.to - f, o.sill + f, o.head - f, S.glass, 0xffffff, 0.003);
    }
    s = o.to;
  }
  piece(s, L, 0, CEILING_H);
}

const VIEWS: Record<string, [V3, V3]> = {
  spawn: [[7.4, 1.65, 2.2], [4.0, 1.4, 0.9]],
  slider: [[8.6, 1.6, 4.2], [5.6, 1.0, -1.0]],
  sunPatch: [[5.2, 1.6, 3.6], [9.2, 1.0, 1.0]],
  kitchen: [[5.0, 1.6, 2.0], [8.0, 1.0, 8.0]],
  master: [[3.2, 1.6, 3.9], [1.6, 1.2, 0.0]],
  balcony: [[6.6, 1.6, -1.1], [-120, 40, -150]],
  balconyDown: [[6.6, 1.65, -1.2], [6.2, -6, -3.5]],
  bed2: [[9.8, 1.6, 3.8], [12.8, 1.3, 1.8]],
};

export async function probe(): Promise<unknown> {
  const params = new URLSearchParams(location.search);
  const only = params.get("views") ? params.get("views")!.split(",") : null;
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false, { stencil: true, preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  const settings = new Settings();
  settings.data.quality = (params.get("quality") ?? "high") as QualityLevel;
  settings.data.ps2Mode = false;
  const t0 = performance.now();
  const render = await createRender({ engine, scene, settings, textures: { proceduralOnly: true } });
  const createMs = performance.now() - t0;

  // ---- shell island: walls with openings, floor, ceiling, balcony
  const shell: RenderGeom[] = [];
  for (const w of WALLS) wallGeoms(w, shell);
  shell.push(bx([-0.2, -0.06, -0.2], [13.0, 0, 9.0], S.wood_oak));
  shell.push(bx([-0.2, CEILING_H, -0.2], [13.0, CEILING_H + 0.1, 9.0], S.plaster_ceiling, 0xf4f3ef));
  shell.push(bx([BALCONY.x0, -0.27, BALCONY.z0], [BALCONY.x1, -0.02, BALCONY.z1], S.concrete));
  shell.push(bx([BALCONY.x0 + 0.05, 0.05, BALCONY.z0 + 0.03], [BALCONY.x1 - 0.05, BALCONY.railH - 0.05, BALCONY.z0 + 0.05], S.glass));
  shell.push(bx([BALCONY.x0 + 0.03, BALCONY.railH - 0.05, BALCONY.z0 + 0.01], [BALCONY.x1 - 0.03, BALCONY.railH, BALCONY.z0 + 0.07], S.aluminum, 0x3a3b3f));
  render.buildIsland(new TransformNode("shell", scene), shell, null, "shell");

  // ---- furniture islands
  const furn: Array<[string, RenderGeom[]]> = [
    ["sofa", [bx([5.0, 0, 3.4], [7.4, 0.45, 4.3], S.fabric_upholstery, 0x6f7f96), bx([5.0, 0.45, 4.05], [7.4, 0.9, 4.3], S.fabric_upholstery, 0x6f7f96), bx([5.0, 0.45, 3.4], [5.2, 0.65, 4.05], S.fabric_upholstery, 0x6f7f96), bx([7.2, 0.45, 3.4], [7.4, 0.65, 4.05], S.fabric_upholstery, 0x6f7f96)]],
    ["rug", [bx([5.0, 0, 1.6], [7.6, 0.012, 3.3], S.rug_pattern)]],
    ["coffeeTable", [bx([5.6, 0.38, 2.2], [6.8, 0.43, 2.9], S.wood_walnut), ...[[5.65, 2.25], [6.75, 2.25], [5.65, 2.85], [6.75, 2.85]].map(([x, z]) => bx([x - 0.025, 0, z - 0.025], [x + 0.025, 0.38, z + 0.025], S.wood_walnut))]],
    ["tvCabinet", [bx([4.1, 0, 1.4], [4.55, 0.5, 3.4], S.wood_oak)]],
    ["tv", [bx([4.15, 0.75, 1.8], [4.22, 1.45, 3.0], S.plastic_glossy, 0x151517)]],
    ["dining", [bx([7.2, 0.72, 5.8], [8.6, 0.76, 6.7], S.wood_oak), ...[[7.25, 5.85], [8.55, 5.85], [7.25, 6.65], [8.55, 6.65]].map(([x, z]) => bx([x - 0.03, 0, z - 0.03], [x + 0.03, 0.72, z + 0.03], S.wood_oak))]],
    ["shelf", [bx([8.7, 0, 0.3], [9.1, 1.9, 1.3], S.wood_pine), ...Array.from({ length: 8 }, (_, i) => bx([8.75, 1.0, 0.4 + i * 0.1], [8.95, 1.25 + (i % 3) * 0.03, 0.47 + i * 0.1], S[`book_cover_${i % 4}` as "book_cover_0"]))]],
    ["kitchenRun", [bx([4.1, 0, 8.2], [8.4, 0.9, 8.8], S.laminate_white), bx([4.1, 0.9, 8.15], [8.4, 0.94, 8.8], S.granite)]],
    ["fridge", [bx([8.45, 0, 8.05], [9.15, 1.85, 8.8], S.steel_brushed)]],
    ["bed", [bx([0.6, 0, 1.6], [2.2, 0.55, 3.7], S.fabric_cotton, 0xdcd6cc), bx([0.6, 0.55, 3.6], [2.2, 1.1, 3.7], S.wood_walnut)]],
    ["dresser", [bx([3.4, 0, 2.6], [3.9, 0.9, 3.9], S.wood_oak)]],
    ["desk", [bx([12.0, 0.72, 1.3], [12.75, 0.76, 2.9], S.wood_pine)]],
    ["bed2", [bx([9.4, 0, 2.6], [10.4, 0.5, 4.3], S.fabric_cotton, 0x7a8fa6)]],
  ];
  for (const [n, g] of furn) render.buildIsland(new TransformNode(n, scene), g, null, n);

  // ---- ceiling fixtures (I_CEILING-like intensity, 3000 K)
  const spots: Array<[number, number, string]> = [
    [2.0, 2.2, "master"], [6.6, 2.4, "living"], [11.0, 2.2, "bed2"], [5.4, 7.0, "kitchen"], [7.8, 7.0, "kitchen"],
    [11.0, 6.6, "foyer"], [2.0, 5.0, "hallW"], [1.25, 7.2, "bath"], [3.25, 7.2, "utility"],
  ];
  for (const [x, z, room] of spots) {
    const l = new PointLight(`fixture_${room}_${x}`, new Vector3(x, 2.45, z), scene);
    l.diffuse = Color3.FromHexString("#ffb46b");
    l.specular = l.diffuse.scale(0.6);
    l.intensity = 1.5;
    l.range = 5.5;
    render.addLight(l, room, true);
  }
  const inst = new SceneInstrumentation(scene);
  await whenReady(scene, 400000);
  const step = () => {
    render.update(1 / 60);
    scene.render();
  };
  for (let i = 0; i < 3; i++) step();
  let captured = false;
  void render.captureEnvironmentAsync().then((ok) => (captured = ok));
  for (let i = 0; i < 80 && !captured; i++) {
    step();
    await new Promise((r) => setTimeout(r, 20));
  }
  const cam = render.camera;
  const shots: Record<string, string> = {};
  const look = (pos: V3, target: V3) => {
    cam.position.set(...pos);
    cam.setTarget(new Vector3(...target));
  };
  for (const [name, [pos, target]] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    look(pos, target);
    for (let i = 0; i < 4; i++) step();
    shots[name] = canvas.toDataURL("image/jpeg", 0.88);
  }
  if (!only || only.includes("ps2")) {
    look(...VIEWS.slider);
    render.setPS2Mode(true);
    for (let i = 0; i < 4; i++) step();
    shots.ps2 = canvas.toDataURL("image/jpeg", 0.92);
    render.setPS2Mode(false);
    for (let i = 0; i < 2; i++) step();
  }
  if (!only || only.includes("nossao")) {
    look(...VIEWS.spawn);
    render.postfx.applyQuality({ ...settings.quality, ssao: false });
    for (let i = 0; i < 4; i++) step();
    shots.nossao = canvas.toDataURL("image/jpeg", 0.88);
    render.postfx.applyQuality(settings.quality);
    for (let i = 0; i < 2; i++) step();
  }
  const lighting = render.lighting as unknown as Lighting;
  return {
    shots,
    createMs: Math.round(createMs),
    captured,
    drawCalls: inst.drawCallsCounter.current,
    lights: lighting.lightCount,
    clustered: lighting.clusteredCount,
    shadowed: lighting.shadowedLights.map((l) => l.name),
    casters: lighting.casterCount,
    receivers: lighting.receiverCount,
    meshes: scene.meshes.length,
  };
}
