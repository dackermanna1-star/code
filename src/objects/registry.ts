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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectBuilder = (opts?: any) => AssemblyDef;

export const OBJECT_REGISTRY: Record<string, ObjectBuilder> = {
  microwave: buildMicrowave,
  chair: buildChair,
  coffeeTable: buildCoffeeTable,
  mug: buildMug,
};

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

/** Registered type ids, sorted. */
export function objectTypes(): string[] {
  return Object.keys(OBJECT_REGISTRY).sort();
}
