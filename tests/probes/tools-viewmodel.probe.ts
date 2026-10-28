// Viewmodel screenshots: every tool's idle pose (7 tiles) + the sledgehammer swung into a wall
// 0.35 m in front of the eye (tile 8) to prove the viewmodel never clips into walls.
// Run: node tests/probe.mjs tests/probes/tools-viewmodel.probe.ts --screenshot /tmp/claude-0/tools-vm.png
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, tileCanvas, tileLabel, r } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";

const TOOLS: ToolId[] = ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];

export async function probe() {
  const out: unknown[] = [];
  const cols = 4,
    rows = 2;
  for (let i = 0; i < 8; i++) {
    const canvas = tileCanvas(i, cols, rows);
    const h = await makeHarness(canvas);
    // backdrop: a wall 3 m ahead and a table-ish box
    h.addBox("backWall", new Vector3(0, 1.4, 3.2), new Vector3(8, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.86, 0.84, 0.8) });
    h.addBox("crate", new Vector3(0.8, 0.4, 2.0), new Vector3(0.8, 0.8, 0.8), { mat: "softwood", color: new Color3(0.6, 0.45, 0.3) });
    const tool = i < 7 ? TOOLS[i] : "sledgehammer";
    h.tools.select(tool);
    if (i === 7) {
      // wall right in front: the swing hits it physically, the viewmodel must still draw over it
      h.addBox("nearWall", new Vector3(0, 1.4, 0.35 + 0.1), new Vector3(4, 2.8, 0.2), { mat: "concrete", color: new Color3(0.55, 0.57, 0.6) });
    }
    h.step(30); // finish the switch animation
    let note = "idle";
    if (i === 7) {
      h.tools.debugSwing(1, h.tc);
      // advance until the strike is resolved against the near wall
      for (let k = 0; k < 60 && h.strikes.length === 0; k++) h.step(1);
      h.step(1);
      note = `hit wall: ${h.strikes.length} strike(s) ${h.strikes[0] ? `${h.strikes[0].speed} m/s ${h.strikes[0].energy} J` : ""}`;
    }
    h.render(3);
    tileLabel(i, cols, rows, `${tool} — ${note}`);
    out.push({ tool, note, meshes: h.scene.meshes.filter((m) => m.name.startsWith("vm_") && m.isEnabled()).length, strikes: h.strikes.slice(0, 2), shakes: h.shakes.slice(0, 3) });
  }
  return out;
}
