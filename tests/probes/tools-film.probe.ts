// Filmstrip of swings (viewmodel animation check): for each listed tool, frames sampled through a
// charged swing — wind-up, charge, strike (several frames), follow-through, recovery — rendered
// into a 6-column grid row per tool. Physics/hits are irrelevant here (open space).
// Run: node tests/probe.mjs tests/probes/tools-film.probe.ts --screenshot /tmp/claude-0/tools-film.png
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, renderTiles } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";

const TOOLS: ToolId[] = ["hands", "hammer", "sledgehammer", "bat", "axe", "extinguisher"];
const COLS = 6;

export async function probe() {
  const out: unknown[] = [];
  await renderTiles(COLS, TOOLS.length, TOOLS.length * COLS, async (i, canvas) => {
    const tool = TOOLS[Math.floor(i / COLS)];
    const f = i % COLS;
    const h = await makeHarness(canvas);
    h.addBox("backWall", new Vector3(0, 1.4, 3.2), new Vector3(8, 2.8, 0.2), { mat: "gypsum", color: new Color3(0.86, 0.84, 0.8) });
    h.tools.select(tool);
    h.step(30);
    const def = h.tools.defs[tool];
    // frame schedule: 0 idle, 1 mid-windup, 2 charged (held), then strike frames, follow-through, recovery
    h.input.press("fire");
    const windSteps = Math.max(1, Math.round(def.windup * 60));
    const m = (h.tools as unknown as { machine: { path: { T: number; tc: number }; phase: string } }).machine;
    let label = "";
    if (f === 0) {
      h.input.release("fire");
      h.step(0);
      label = `${tool} idle`;
    } else if (f === 1) {
      h.step(Math.max(1, Math.round(windSteps / 2)));
      label = "windup";
    } else {
      h.step(windSteps + Math.round(def.chargeTime * 60));
      if (f === 2) label = "charged";
      else {
        h.input.release("fire");
        h.step(1);
        const T = m.path.T,
          tc = m.path.tc;
        // strike fractions: before contact, at contact, after
        const times = [0, tc * 0.6, tc, tc + (T - tc) * 0.6];
        const target = f === 3 ? times[1] : f === 4 ? times[2] : times[3] + def.recover * 0.4;
        const steps = Math.max(0, Math.round(target * 60) - 1);
        h.step(steps);
        label = f === 3 ? "strike" : f === 4 ? "contact" : "recover";
      }
    }
    await h.renderReady(1);
    out.push({ tool, f, label, phase: m.phase });
    return { label, dispose: () => h.engine.dispose() };
  });
  return out;
}
