// Close-ups of the hand models (Viewmodel fed with hand-made poses): right fist from the palm side
// (guard), from behind (punch), the knuckles, from above; the left fist; a hammer grip; a two-handed
// bat grip; a sledge grip. 3×3 grid.
// Run: node tests/probe.mjs tests/probes/tools-fist.probe.ts --screenshot /tmp/claude-0/tools-fist.png
import { Engine, Scene, UniversalCamera, Vector3, Color3, Color4, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { renderTiles } from "./tools-util.ts";
import { Viewmodel, type ViewState } from "../../src/player/tools/viewmodel.ts";
import { makePose, quatFromAxisFace, v3, type Pose, type V3 } from "../../src/player/tools/swing.ts";
import type { ToolId } from "../../src/core/context.ts";

interface Shot {
  label: string;
  tool: ToolId;
  right: { p: V3; axis: V3; face: V3 };
  left?: { p: V3; axis: V3; face: V3 };
}

const SHOTS: Shot[] = [
  { label: "R fist palm side (guard)", tool: "hands", right: { p: v3(0.0, -0.02, 0.28), axis: v3(0, 1, 0), face: v3(0, 0, 1) } },
  { label: "R fist from behind (punch)", tool: "hands", right: { p: v3(0.0, -0.03, 0.3), axis: v3(-1, 0.2, 0), face: v3(0, 0, 1) } },
  { label: "R fist knuckles", tool: "hands", right: { p: v3(0.0, -0.02, 0.3), axis: v3(0, 1, 0), face: v3(0, 0, -1) } },
  { label: "R fist back of hand", tool: "hands", right: { p: v3(0.0, -0.02, 0.3), axis: v3(0, 1, 0), face: v3(-1, 0, 0) } },
  { label: "L fist palm side", tool: "hands", right: { p: v3(0.5, -0.5, 0.3), axis: v3(0, 1, 0), face: v3(0, 0, 1) }, left: { p: v3(0.0, -0.02, 0.28), axis: v3(0, 1, 0), face: v3(0, 0, 1) } },
  { label: "L fist from behind", tool: "hands", right: { p: v3(0.5, -0.5, 0.3), axis: v3(0, 1, 0), face: v3(0, 0, 1) }, left: { p: v3(0.0, -0.03, 0.3), axis: v3(1, 0.2, 0), face: v3(0, 0, 1) } },
  { label: "hammer grip", tool: "hammer", right: { p: v3(0.06, -0.12, 0.33), axis: v3(-0.2, 0.92, 0.3), face: v3(-0.6, 0, 0.8) } },
  { label: "bat grip (two hands)", tool: "bat", right: { p: v3(0.08, -0.06, 0.36), axis: v3(0.29, 0.88, 0.32), face: v3(-0.2, 0.3, 0.93) } },
  { label: "sledge grip (two hands)", tool: "sledgehammer", right: { p: v3(0.08, -0.08, 0.34), axis: v3(0.12, 0.8, 0.5), face: v3(-0.35, 0, 0.94) } },
];

export async function probe() {
  await renderTiles(3, 3, SHOTS.length, async (i, canvas) => {
    const s = SHOTS[i];
    const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.55, 0.62, 0.7, 1);
    const cam = new UniversalCamera("cam", new Vector3(0, 1.65, 0), scene);
    cam.minZ = 0.03;
    cam.fov = (75 * Math.PI) / 180;
    const hemi = new HemisphericLight("h", new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = new Color3(0.35, 0.3, 0.27);
    const sun = new DirectionalLight("sun", new Vector3(0.45, -0.7, 0.55), scene);
    sun.diffuse = new Color3(1, 0.86, 0.7);
    const wall = MeshBuilder.CreateBox("w", { width: 6, height: 4, depth: 0.1 }, scene);
    wall.position.set(0, 1.6, 2.5);
    const wm = new StandardMaterial("wm", scene);
    wm.diffuseColor = new Color3(0.8, 0.78, 0.74);
    wall.material = wm;
    const vm = new Viewmodel(scene, cam);
    vm.setTool(s.tool);
    const pose: Pose = makePose();
    pose.right.p = { ...s.right.p };
    quatFromAxisFace(pose.right.q, s.right.axis, s.right.face);
    // single-fist shots park the other fist out of view
    const left = s.left ?? (s.tool === "hands" ? { p: v3(-0.6, -0.6, 0.2), axis: v3(0, 1, 0), face: v3(0, 0, 1) } : { p: v3(s.right.p.x, s.right.p.y, s.right.p.z), axis: s.right.axis, face: s.right.face });
    if (!s.left && s.tool !== "hands") {
      // second hand down the handle (bat 0.085 m, sledge 0.24 m)
      const off = s.tool === "bat" ? 0.085 : s.tool === "sledgehammer" ? 0.24 : 0;
      const a = s.right.axis,
        al = Math.hypot(a.x, a.y, a.z);
      left.p = v3(s.right.p.x - (a.x / al) * off, s.right.p.y - (a.y / al) * off, s.right.p.z - (a.z / al) * off);
    }
    pose.left.p = { ...left.p };
    quatFromAxisFace(pose.left.q, left.axis, left.face);
    const vs: ViewState = {
      tool: s.tool,
      pose,
      lower: 0,
      charge: 0,
      fullCharge: false,
      stress: 0,
      spraying: false,
      sprayPressure: 0,
      sprayBlend: 0,
      nozzleHold: 1,
      leg: { weight: 0, foot: v3(), dir: v3(0, 0, 1), kind: "kick" },
      speed: 0,
      kick: 0,
      phase: "idle",
    };
    for (let k = 0; k < 3; k++) vm.update(1 / 60, vs, new Vector3(0, 0, 1));
    await scene.whenReadyAsync();
    scene.render();
    scene.render();
    return { label: s.label, dispose: () => engine.dispose() };
  });
  return { ok: true };
}
