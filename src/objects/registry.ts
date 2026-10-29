// Object registry: type id → builder. The world/furnishers and the debug API (`spawn(type)`)
// build assemblies by type through here. Area content modules export `<AREA>_OBJECTS` maps that
// the integration step merges in (or call registerObject at module load).
//
// Builders take an optional options object (variants: colour, size, seed) and return a
// validated AssemblyDef. Each call builds fresh data (callers may mutate the result).

import type { AssemblyDef } from "../destruction/model/types.ts";
import { buildMicrowave } from "./reference/microwave.ts";
import { buildChair } from "./reference/chair.ts";
import { buildCoffeeTable } from "./reference/coffeeTable.ts";
import { buildMug } from "./reference/mug.ts";
import { FIXTURES_OBJECTS } from "./fixtures/index.ts";
import { KITCHEN_OBJECTS } from "./kitchen/index.ts";
import { BATH_OBJECTS } from "./bath/index.ts";
import { UTILITY_OBJECTS } from "./utility/index.ts";
import { BEDROOM_OBJECTS } from "./bedroom/index.ts";
import { LIVING_OBJECTS } from "./living/index.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectBuilder = (opts?: any) => AssemblyDef;

export const OBJECT_REGISTRY: Record<string, ObjectBuilder> = {
  microwave: buildMicrowave,
  chair: buildChair,
  coffeeTable: buildCoffeeTable,
  mug: buildMug,
};

/**
 * Area registries, merged in this order (a later area wins a type-id clash). Known clashes:
 * `chair` / `coffeeTable` (reference objects → the living-room versions) and `wallClock`
 * (fixtures → kitchen). Every area builder is also reachable as `<area>:<type>`
 * (e.g. `reference:chair`, `fixtures:wallClock`), so nothing is shadowed.
 */
const AREAS: ReadonlyArray<readonly [string, Record<string, ObjectBuilder>]> = [
  ["reference", { microwave: buildMicrowave, chair: buildChair, coffeeTable: buildCoffeeTable, mug: buildMug }],
  ["fixtures", FIXTURES_OBJECTS],
  ["kitchen", KITCHEN_OBJECTS],
  ["bath", BATH_OBJECTS],
  ["utility", UTILITY_OBJECTS],
  ["bedroom", BEDROOM_OBJECTS],
  ["living", LIVING_OBJECTS],
];
for (const [area, map] of AREAS) {
  for (const [type, fn] of Object.entries(map)) {
    if (typeof fn !== "function") continue;
    OBJECT_REGISTRY[type] = fn;
    OBJECT_REGISTRY[`${area}:${type}`] = fn;
  }
}

/** Add (or replace) builders, e.g. an area's `<AREA>_OBJECTS` map. */
export function registerObjects(map: Record<string, ObjectBuilder>): void {
  for (const [type, fn] of Object.entries(map)) OBJECT_REGISTRY[type] = fn;
}

/** Add one builder. */
export function registerObject(type: string, fn: ObjectBuilder): void {
  OBJECT_REGISTRY[type] = fn;
}

/** Build an assembly by type id (throws for unknown types). */
export function buildObject(type: string, opts?: unknown): AssemblyDef {
  const fn = OBJECT_REGISTRY[type];
  if (!fn) throw new Error(`unknown object type '${type}' (known: ${Object.keys(OBJECT_REGISTRY).sort().join(", ")})`);
  return fn(opts);
}

/** Registered type ids, sorted (the `<area>:<type>` aliases only when asked for). */
export function objectTypes(includeAliases = false): string[] {
  const all = Object.keys(OBJECT_REGISTRY);
  return (includeAliases ? all : all.filter((t) => !t.includes(":"))).sort();
}
