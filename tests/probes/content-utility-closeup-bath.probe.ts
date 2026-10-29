// Close-up 2×2 sheet of the bath (light shell) — see content-utility-rooms.probe.ts.
// Run: node tests/probe.mjs tests/probes/content-utility-closeup-bath.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-utility-bath.png

import { probe as roomsProbe } from "./content-utility-rooms.probe.ts";

export async function probe(): Promise<unknown> {
  (globalThis as { __utilityCloseup?: string }).__utilityCloseup = "bath";
  (globalThis as { __utilitySettle?: number }).__utilitySettle = 60;
  return roomsProbe();
}
