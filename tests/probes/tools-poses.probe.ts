// Swing pose screenshots: for six tools, the fully charged wind-up and the frame where the head
// strikes a wall placed at its nominal reach (frozen right after the strike step), plus kick,
// stomp, crowbar pry and extinguisher spray. 4×4 grid of 16:9 tiles.
// Run: node tests/probe.mjs tests/probes/tools-poses.probe.ts --screenshot /tmp/claude-0/tools-poses.png
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, renderTiles, r } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";

const TOOLS: ToolId[] = ["hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];

export async function probe() {
  const out: unknown[] = [];
  const tiles: Array<{ tool: ToolId; mode: string }> = [];
  for (const t of TOOLS) tiles.push({ tool: t, mode: "charge" }, { tool: t, mode: "contact" });
  tiles.push({ tool: "hands", mode: "kick" }, { tool: "hands", mode: "stomp" }, { tool: "crowbar", mode: "pry" }, { tool: "extinguisher", mode: "spray" });
  await renderTiles(4, 4, tiles.length, async (i, canvas) => {
    const { tool, mode } = tiles[i];
    const h = await makeHarness(canvas);
    h.addBox("backWall", new Vector3(0, 1.4, 3.2), new Vector3(8, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.86, 0.84, 0.8) });
    const reach = h.tools.defs[tool].reach;
    h.tools.select(tool);
    h.step(30);
    let label = `${tool} ${mode}`;
    if (mode === "charge") {
      h.input.press("fire");
      h.step(Math.round((h.tools.defs[tool].windup + h.tools.defs[tool].chargeTime) * 60) + 2);
      label += ` (charge ${r((h.tools as unknown as { charge: number }).charge, 2)})`;
    } else if (mode === "contact") {
      // wall face at 95 % of the reach: the head meets it just before the nominal contact point
      const z = reach * 0.95;
      h.addBox("wall", new Vector3(0, 1.4, z + 0.1), new Vector3(4, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.78, 0.76, 0.72) });
      h.tools.debugSwing(0, h.tc);
      for (let k = 0; k < 90 && h.strikes.length === 0; k++) h.step(1);
      const s = h.strikes[0];
      label += s ? ` ${s.speed}m/s ${s.energy}J y=${r(s.point[1] - 1.65, 2)}` : " NO HIT";
    } else if (mode === "kick") {
      h.addBox("crate", new Vector3(0, 0.3, 0.95), new Vector3(0.6, 0.6, 0.4), { mat: "softwood", color: new Color3(0.6, 0.45, 0.3) });
      h.setView(new Vector3(0, 1.65, 0), 0, 0.35);
      h.tools.kick(h.tc);
      for (let k = 0; k < 40 && h.strikes.length === 0; k++) h.step(1);
      const s = h.strikes[0];
      label += s ? ` ${s.speed}m/s ${s.energy}J h=${r(s.point[1], 2)}` : " NO HIT";
    } else if (mode === "stomp") {
      h.addBox("box", new Vector3(0.05, 0.15, 0.6), new Vector3(0.45, 0.3, 0.35), { mat: "steel", color: new Color3(0.8, 0.8, 0.82) });
      h.setView(new Vector3(0, 1.65, 0), 0, 1.0);
      h.tools.stomp(h.tc);
      for (let k = 0; k < 40 && h.strikes.length === 0; k++) h.step(1);
      const s = h.strikes[0];
      label += s ? ` ${s.speed}m/s ${s.energy}J on ${s.bodyName}` : " NO HIT";
    } else if (mode === "pry") {
      h.addBox("board", new Vector3(0, 1.3, 0.85), new Vector3(1.2, 0.8, 0.05), { mat: "softwood", color: new Color3(0.62, 0.48, 0.32) });
      h.setView(new Vector3(0, 1.65, 0), 0, 0.35);
      h.pryScript = Array.from({ length: 40 }, (_, k) => Math.min(0.95, k * 0.03 + 0.05));
      h.input.press("alt");
      h.step(25);
      label += ` stress ${r(h.pries[h.pries.length - 1]?.stress ?? 0, 2)} (${h.pries.length} calls)`;
    } else if (mode === "spray") {
      h.input.press("alt");
      h.step(20);
      label += ` emitters ${h.emitters.length} loops ${h.loops.length}`;
    }
    await h.renderReady(2);
    out.push({ tool, mode, label, strike: h.strikes[0] ?? null, phase: (h.tools as unknown as { machine: { phase: string } }).machine?.phase });
    return { label, dispose: () => h.engine.dispose() };
  });
  return out;
}
