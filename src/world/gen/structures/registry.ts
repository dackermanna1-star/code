/**
 * Structure type registry. Structure modules call `registerStructure` at import time; generators
 * ask `structureTypesFor(dimension)` (sorted by `step`, then id) through the StructureManager.
 */
import type { DimensionId } from '../generator';
import type { StructureType } from './types';

const TYPES = new Map<string, StructureType>();

export function registerStructure(t: StructureType): StructureType {
  if (TYPES.has(t.id)) throw new Error(`Duplicate structure type ${t.id}`);
  TYPES.set(t.id, t);
  return t;
}

export function structureTypesFor(dimension: DimensionId): StructureType[] {
  return [...TYPES.values()].filter((t) => t.dimension === dimension).sort((a, b) => a.step - b.step || (a.id < b.id ? -1 : 1));
}

export function structureType(id: string): StructureType | undefined {
  return TYPES.get(id);
}
