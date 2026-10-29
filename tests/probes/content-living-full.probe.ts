// Full-structure variant of content-living-room.probe.ts: the real apartment structure + the
// living-room fixtures (ceiling fan, curtains, mini-split) around the living-room content.
// Run: node tests/probe.mjs tests/probes/content-living-full.probe.ts --timeout 580000 --screenshot /tmp/claude-0/content-living-full.png

import { probe as roomProbe } from "./content-living-room.probe.ts";

export async function probe(): Promise<unknown> {
  (globalThis as { __livingFull?: boolean }).__livingFull = true;
  return roomProbe();
}
