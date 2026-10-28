// Close-up views of structural details: bathroom tiles around the door and tub, kitchen
// backsplash and counter outlets, hall switches, window reveal + marble board, laundry stub-outs,
// foyer archway, the corridor stub outside the front door, the balcony from outside.
// Returns full-size JPEG data URLs in `shots` (decode them to inspect) and overlays a contact
// sheet for the runner's screenshot.
// Run: PROBE_LOGS=1 node tests/probe.mjs tests/probes/structure-details.probe.ts --timeout 1800000 --screenshot /tmp/claude-0/structure-details.png

import { setupStructure, shoot, contactSheet, type View } from "./structure-util.ts";

const VIEWS: View[] = [
  ["bath: door wall tiles", [1.15, 1.45, 7.7], [1.85, 0.9, 5.6]],
  ["bath: tub corner (full height)", [2.1, 1.55, 6.4], [0.25, 1.5, 8.75]],
  ["kitchen: backsplash + outlets", [6.6, 1.5, 6.3], [4.5, 1.05, 8.7]],
  ["hall: bath/utility switches", [1.4, 1.35, 4.75], [2.6, 1.0, 5.6]],
  ["master: window reveal + board", [2.0, 1.35, 1.5], [2.0, 1.05, -0.1]],
  ["laundry: washer box + heater", [3.55, 1.35, 7.7], [2.55, 1.2, 8.3]],
  ["foyer: archway", [11.6, 1.5, 5.4], [9.2, 1.15, 5.2]],
  ["corridor outside front door", [12.4, 1.6, 10.45], [10.9, 1.0, 9.0]],
  ["balcony from the railing", [8.7, 1.45, -1.35], [5.0, 0.8, -0.4]],
];

export async function probe(): Promise<unknown> {
  const log = (m: string) => console.log(`[structure-details] ${m}`);
  const sim = await setupStructure(log, "medium");
  sim.step(30);
  const shots = await shoot(sim, VIEWS, log, 2);
  await contactSheet(VIEWS, shots);
  return { texMode: sim.texMode, timings: sim.timings, views: VIEWS.map((v) => v[0]), shots };
}
