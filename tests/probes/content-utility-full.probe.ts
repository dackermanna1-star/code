// Full-structure variant of content-utility-rooms.probe.ts: the real apartment structure + the
// fixtures in the bathroom, laundry, foyer and balcony around the content-utility placements.
// Slow on SwiftShader (the whole apartment is spawned): give it a long timeout.
// Run: node tests/probe.mjs tests/probes/content-utility-full.probe.ts --timeout 1500000 --screenshot /tmp/claude-0/content-utility-full.png

import { probe as roomsProbe } from "./content-utility-rooms.probe.ts";

export async function probe(): Promise<unknown> {
  (globalThis as { __utilityFull?: boolean }).__utilityFull = true;
  (globalThis as { __utilitySettle?: number }).__utilitySettle = 30;
  return roomsProbe();
}
