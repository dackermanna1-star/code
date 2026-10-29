// Bedroom 2 contact sheet: same spawn / settle / analysis as content-bedrooms-room.probe.ts (which
// renders the master bedroom), rendering the six "bed2" views.
// Run: node tests/probe.mjs tests/probes/content-bedrooms-room2.probe.ts --timeout 1200000 --screenshot /tmp/claude-0/content-bedrooms-bed2.png

import { VIEWS, runRooms } from "./content-bedrooms-room.probe.ts";

export async function probe(): Promise<unknown> {
  return runRooms(VIEWS.filter((v) => v[0].startsWith("bed2")));
}
