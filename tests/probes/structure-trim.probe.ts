// Close-ups of trim and hardware details: painted casing/baseboard edges around the interior
// doors (frames built into their partitions) and the foyer archway, a casement sash with its
// latch-side weatherstrip, and the balcony's glass clamps. Small view set (memory-friendly).
// Run: PROBE_LOGS=1 node tests/probe.mjs tests/probes/structure-trim.probe.ts --timeout 900000 --screenshot /tmp/claude-0/structure-trim.png

import { setupStructure, shoot, contactSheet, type View } from "./structure-util.ts";

const VIEWS: View[] = [
  ["hall: master door casing edges", [1.2, 1.3, 5.1], [3.25, 1.0, 4.4]],
  ["foyer: bedroom 2 door", [11.4, 1.5, 6.0], [9.95, 1.1, 4.4]],
  ["foyer: archway casings", [11.6, 1.5, 5.4], [9.2, 1.15, 5.2]],
  ["balcony: glass clamps on a post", [5.6, 0.95, -0.95], [4.44, 0.55, -1.56]],
  ["living: casement + weatherstrip", [8.1, 1.4, 0.9], [8.75, 1.4, -0.1]],
  ["hall: bath + laundry doors", [0.5, 1.5, 4.7], [3.0, 1.0, 5.6]],
  ["master door head casing from below", [2.9, 1.75, 4.85], [3.25, 2.12, 4.45]],
  ["master door head casing from above", [3.0, 2.55, 4.8], [3.25, 2.1, 4.45]],
  ["master door side casing edge", [2.55, 1.2, 4.62], [2.8, 1.1, 4.45]],
];

export async function probe(): Promise<unknown> {
  const log = (m: string) => console.log(`[structure-trim] ${m}`);
  const sim = await setupStructure(log, "low");
  sim.step(20);
  const shots = await shoot(sim, VIEWS, log, 2);
  await contactSheet(VIEWS, shots);
  return { texMode: sim.texMode, timings: sim.timings, views: VIEWS.map((v) => v[0]), shots };
}
