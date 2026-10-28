// Probe: full RenderSystem (render-env Lighting/PostFX/Exterior/Atmosphere + render-core
// materials/batching/screens/env capture) on a stand-in living room at plan coordinates.
import { Engine, Scene, Vector3, TransformNode, PointLight, Color3 } from "@babylonjs/core";
import { boxGeom, snap } from "./render-core-util.ts";
import { createRender } from "../../src/render/renderSystem.ts";
import { createScreen } from "../../src/render/screens.ts";
import { Settings } from "../../src/core/settings.ts";
import { S } from "../../src/render/surfaces.ts";
import { polyBox, faceAttr } from "../../src/geom/poly.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";

/** Box from min/max corners. */
function bx(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, surf: number, tint = 0xffffff): RenderGeom {
  return boxGeom((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, surf, tint);
}

export async function probe(): Promise<unknown> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const settings = new Settings();
  const progress: string[] = [];
  const t0 = performance.now();
  const render = await createRender({ engine, scene, settings, textures: { proceduralOnly: true }, onProgress: (p, l) => progress.push(`${Math.round(p * 100)}%:${l}`) });
  const createMs = performance.now() - t0;
  const paint = 0xeee7da;
  // ---- structure island (static): floor, ceiling, walls with the south openings
  const shell: RenderGeom[] = [
    bx(4, -0.06, 0, 9.2, 0, 5, S.wood_oak),
    bx(4, 2.7, 0, 9.2, 2.8, 5, S.plaster_ceiling),
    // south wall z ∈ [-0.2, 0]: sliding door x 5.0–7.4 (head 2.2), window x 7.8–8.8 (sill 0.9, head 2.2)
    bx(4, 0, -0.2, 5.0, 2.7, 0, S.paint_wall, paint),
    bx(5.0, 2.2, -0.2, 7.4, 2.7, 0, S.paint_wall, paint),
    bx(7.4, 0, -0.2, 7.8, 2.7, 0, S.paint_wall, paint),
    bx(7.8, 0, -0.2, 8.8, 0.9, 0, S.paint_wall, paint),
    bx(7.8, 2.2, -0.2, 8.8, 2.7, 0, S.paint_wall, paint),
    bx(8.8, 0, -0.2, 9.2, 2.7, 0, S.paint_wall, paint),
    bx(3.88, 0, 0, 4.0, 2.7, 5, S.paint_wall, paint),
    bx(9.2, 0, 0, 9.32, 2.7, 5, S.paint_wall, paint),
    bx(4, 0, 5.0, 9.2, 2.7, 5.12, S.paint_wall, paint),
    // window/door frames (aluminium) + glass panes (glass mesh) + glass edges
    bx(5.0, 0, -0.14, 7.4, 0.05, -0.06, S.aluminum),
    bx(6.17, 0.05, -0.13, 6.23, 2.2, -0.07, S.aluminum),
    bx(5.02, 0.05, -0.105, 6.17, 2.18, -0.095, S.glass),
    bx(6.23, 0.05, -0.105, 7.38, 2.18, -0.095, S.glass),
    bx(7.82, 0.92, -0.105, 8.78, 2.18, -0.095, S.glass),
    bx(7.8, 0.9, -0.14, 8.8, 0.94, -0.06, S.aluminum),
  ];
  const shellNode = new TransformNode("shell", scene);
  const tb = performance.now();
  render.buildIsland(shellNode, shell, null, "shell");
  const shellMs = performance.now() - tb;
  // ---- furniture islands
  const furn: Array<[string, RenderGeom[]]> = [
    ["rug", [bx(4.9, 0, 1.0, 7.6, 0.012, 3.0, S.rug_pattern)]],
    ["sofa", [bx(7.6, 0, 1.2, 8.5, 0.42, 3.4, S.fabric_upholstery, 0x6f7f96), bx(8.3, 0.42, 1.2, 8.55, 0.9, 3.4, S.fabric_upholstery, 0x6f7f96), bx(7.6, 0.42, 1.05, 8.55, 0.65, 1.25, S.fabric_upholstery, 0x6f7f96), bx(7.6, 0.42, 3.35, 8.55, 0.65, 3.55, S.fabric_upholstery, 0x6f7f96)]],
    ["table", [bx(5.9, 0.38, 1.6, 6.9, 0.42, 2.4, S.wood_walnut), bx(5.95, 0, 1.65, 6.0, 0.38, 1.7, S.wood_walnut), bx(6.8, 0, 1.65, 6.85, 0.38, 1.7, S.wood_walnut), bx(5.95, 0, 2.3, 6.0, 0.38, 2.35, S.wood_walnut), bx(6.8, 0, 2.3, 6.85, 0.38, 2.35, S.wood_walnut), bx(6.0, 0.425, 1.7, 6.8, 0.435, 2.3, S.glass)]],
    ["tvstand", [bx(4.05, 0, 1.4, 4.5, 0.5, 3.0, S.wood_oak), bx(4.06, 0.5, 2.05, 4.16, 0.53, 2.35, S.metal_black)]],
    ["tv", [bx(4.1, 0.6, 1.62, 4.16, 1.27, 2.78, S.plastic_glossy, 0x151517)]],
    ["shelf", [bx(4.05, 0, 3.6, 4.4, 1.9, 4.6, S.wood_pine), ...Array.from({ length: 9 }, (_, i) => bx(4.1, 0.95, 3.7 + i * 0.09, 4.32, 1.2 + (i % 3) * 0.03, 3.77 + i * 0.09, S[`book_cover_${i % 4}` as "book_cover_0"]))]],
    ["lamp", [bx(6.5, 2.55, 2.4, 6.7, 2.7, 2.6, S.metal_painted), bx(6.55, 2.45, 2.45, 6.65, 2.55, 2.55, S.bulb_on)]],
  ];
  const nodes: TransformNode[] = [];
  for (const [n, g] of furn) {
    const node = new TransformNode(n, scene);
    render.buildIsland(node, g, null, n);
    nodes.push(node);
  }
  // TV screen on the panel facing +X
  const panel = polyBox({ x: 0.012, y: 0.62, z: 1.1 }, faceAttr(S.lcd_off), { p: { x: 4.16, y: 0.935, z: 2.2 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  createScreen(scene, { parent: nodes[4], poly: panel, front: { x: 1, y: 0, z: 0 } }, "tv", { state: "on" });
  // ceiling light (mains)
  const bulb = new PointLight("bulb", new Vector3(6.6, 2.35, 2.5), scene);
  bulb.diffuse = Color3.FromHexString("#ffd9a8");
  bulb.intensity = 4;
  bulb.range = 8;
  render.addLight(bulb, "living", true);

  const cam = render.camera;
  await scene.whenReadyAsync();
  for (let i = 0; i < 3; i++) {
    render.update(1 / 60);
    scene.render();
  }
  const sheets: string[] = [];
  sheets.push(snap(scene, 2));
  const tc = performance.now();
  const capP = render.captureEnvironmentAsync();
  let captured = false;
  capP.then((ok) => (captured = ok));
  for (let i = 0; i < 60 && !captured; i++) {
    render.update(1 / 60);
    scene.render();
    await new Promise((r) => setTimeout(r, 30));
  }
  const captureMs = performance.now() - tc;
  sheets.push(snap(scene, 2));
  // view towards the windows (exterior, shafts, glass)
  cam.position.set(7.0, 1.6, 3.8);
  cam.rotation.set(0.02, Math.PI * 0.96, 0);
  sheets.push(snap(scene, 3));
  // power cut
  render.setPower(false);
  for (let i = 0; i < 3; i++) {
    render.update(1 / 60);
    scene.render();
  }
  sheets.push(snap(scene, 2));
  render.setPower(true);
  // frame timing
  const tf = performance.now();
  for (let i = 0; i < 20; i++) {
    render.update(1 / 60);
    scene.render();
  }
  const frameMs = (performance.now() - tf) / 20;
  return {
    createMs: Math.round(createMs),
    shellMs: Math.round(shellMs * 100) / 100,
    captured,
    captureMs: Math.round(captureMs),
    frameMs: Math.round(frameMs * 10) / 10,
    meshes: scene.meshes.length,
    stats: render.stats(),
    progress: progress.join(" | "),
    sheets,
  };
}
