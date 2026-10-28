// Runtime probe for the apartment structure: spawn every structural assembly into the real
// Physics + Render + Destruction systems (VFX mocked), settle 2 s, verify nothing moved or fell,
// report counts/timings, and render a 3×3 contact sheet of the rooms (stand-in ceiling lights at
// the plan's light positions; fixtures are another module's job).
// Run: PROBE_LOGS=1 node tests/probe.mjs tests/probes/structure-spawn.probe.ts --timeout 1800000 --screenshot /tmp/claude-0/structure-sheet.png

import { structureStats } from "../../src/world/structure.ts";
import { setupStructure, shoot, contactSheet, type View } from "./structure-util.ts";

const VIEWS: View[] = [
  ["living → TV wall / hall", [8.9, 1.6, 0.45], [4.3, 1.2, 4.2]],
  ["living → kitchen", [6.6, 1.65, 0.9], [6.4, 1.1, 8.8]],
  ["balcony slider", [6.4, 1.6, 3.2], [6.2, 0.9, -1.6]],
  ["master bedroom", [3.6, 1.6, 4.05], [0.9, 1.1, 0.0]],
  ["hallway → west", [4.6, 1.6, 5.0], [0.0, 1.0, 5.0]],
  ["bathroom", [2.25, 1.6, 5.85], [0.4, 0.9, 8.6]],
  ["laundry plumbing", [3.85, 1.6, 6.1], [2.55, 0.9, 7.8]],
  ["foyer → front door", [9.7, 1.6, 4.75], [11.1, 1.1, 8.8]],
  ["bedroom 2", [9.6, 1.6, 4.05], [12.6, 1.1, 1.6]],
];

export async function probe(): Promise<unknown> {
  const log = (m: string) => console.log(`[structure-spawn] ${m}`);
  const sim = await setupStructure(log, "medium");
  const { d, physics, pieces, ids, scene } = sim;
  const before = ids.map((id) => d.positionOf(id));
  const afterSpawn = { destruction: d.stats(), physics: physics.stats() };
  const t = performance.now();
  sim.step(120);
  const stepMs = (performance.now() - t) / 120;
  log(`settled (${stepMs.toFixed(1)} ms/step)`);
  const moved: Array<{ name: string; dist: number }> = [];
  ids.forEach((id, i) => {
    const a = before[i],
      b = d.positionOf(id);
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (dist > 0.002) moved.push({ name: pieces[i].def.name, dist: Math.round(dist * 1000) / 1000 });
  });
  const tr = performance.now();
  const shots = await shoot(sim, VIEWS, log, 2);
  const frameMs = (performance.now() - tr) / (VIEWS.length * 2);
  const draw = { meshes: scene.meshes.length, activeMeshes: scene.getActiveMeshes().length, activeTris: Math.round(scene.getActiveIndices() / 3) };
  await contactSheet(VIEWS, shots);
  return {
    texMode: sim.texMode,
    structure: structureStats(pieces),
    timingsMs: { ...sim.timings, stepAvg: Math.round(stepMs * 10) / 10, frameAvg: Math.round(frameMs) },
    afterSpawn,
    afterSettle: { destruction: d.stats(), physics: physics.stats() },
    moved,
    draw,
  };
}
