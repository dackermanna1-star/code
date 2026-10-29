// Furnishing index: gathers every content module's placements for the WorldSystem. PURE (no
// Babylon). Each area's furnisher builds its assemblies on call (they are not cheap: ~0.1–1.7 s
// each), so the world calls them one by one between loading-bar updates.
//
// To add an area: import its `furnish<Area>()` and append it to FURNISHERS. Order matters only for
// spawn order (structure-attached fixtures first, then big furniture, then small items on top).

import type { Placement } from "./types.ts";
import { furnishFixtures } from "./fixtures.ts";
import { furnishKitchen } from "./kitchen.ts";
import { furnishLiving } from "./living.ts";
import { furnishBedrooms } from "./bedrooms.ts";
import { furnishUtility } from "./utility.ts";

export type { Placement } from "./types.ts";

export interface Furnisher {
  /** Short id (loading label, stats). */
  id: string;
  label: string;
  build: () => Placement[];
}

/** Every furnishing module, in spawn order. */
export const FURNISHERS: readonly Furnisher[] = [
  { id: "fixtures", label: "Fixtures & electrics", build: furnishFixtures },
  { id: "kitchen", label: "Kitchen", build: furnishKitchen },
  { id: "living", label: "Living room", build: furnishLiving },
  { id: "bedrooms", label: "Bedrooms", build: furnishBedrooms },
  { id: "utility", label: "Bathroom, laundry, foyer & balcony", build: furnishUtility },
];

/** All placements at once (tests / tools; the world builds them area by area instead). */
export function furnishAll(): Placement[] {
  const out: Placement[] = [];
  for (const f of FURNISHERS) out.push(...f.build());
  return out;
}
