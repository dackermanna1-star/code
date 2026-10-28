// Viewmodel screenshots (16:9 tiles): every tool's idle pose, the sledgehammer idle with a wall
// 0.35 m in front of the eye (its head is "behind" the wall: must still draw on top = no clipping),
// and a punch frozen at contact with a wall.
// Run: node tests/probe.mjs tests/probes/tools-viewmodel.probe.ts --screenshot /tmp/claude-0/tools-vm.png
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, renderTiles } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";

const TOOLS: ToolId[] = ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];

export async function probe() {
  const out: unknown[] = [];
  await renderTiles(3, 3, 9, async (i, canvas) => {
    const h = await makeHarness(canvas);
    h.addBox("backWall", new Vector3(0, 1.4, 3.2), new Vector3(8, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.86, 0.84, 0.8) });
    h.addBox("crate", new Vector3(0.8, 0.4, 2.0), new Vector3(0.8, 0.8, 0.8), { mat: "softwood", color: new Color3(0.6, 0.45, 0.3) });
    const tool: ToolId = i < 7 ? TOOLS[i] : i === 7 ? "sledgehammer" : "hands";
    h.tools.select(tool);
    let label = `${tool} idle`;
    if (i === 7) {
      h.addBox("nearWall", new Vector3(0, 1.4, 0.35 + 0.1), new Vector3(4, 2.8, 0.2), { mat: "concrete", color: new Color3(0.45, 0.5, 0.58) });
      label = "sledge idle, wall at 0.35 m (no clip)";
    }
    if (i === 8) h.addBox("nearWall", new Vector3(0, 1.4, 0.5 + 0.1), new Vector3(4, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.8, 0.78, 0.74) });
    h.step(30);
    if (i === 8) {
      h.tools.debugSwing(0, h.tc);
      for (let k = 0; k < 30 && h.strikes.length === 0; k++) h.step(1);
      label = `punch at contact: ${h.strikes[0] ? `${h.strikes[0].speed} m/s, ${h.strikes[0].energy} J` : "no hit"}`;
    }
    await h.renderReady(2);
    out.push({ tool, label, strikes: h.strikes.slice(0, 1) });
    return { label, dispose: () => h.engine.dispose() };
  });
  return out;
}
