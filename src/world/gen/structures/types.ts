/**
 * Structure API types. See `structures/index.ts` for the overview and how to add a structure.
 */
import type { DimensionId } from '../generator';
import type { ChunkWriter } from '../common/writer';
import type { Rng } from '../../../core/rng';

/** Inclusive block-space box. */
export interface BlockBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): BlockBox => ({ minX, minY, minZ, maxX, maxY, maxZ });

export function boxUnion(boxes: BlockBox[]): BlockBox {
  const b = { ...boxes[0] };
  for (const o of boxes) {
    b.minX = Math.min(b.minX, o.minX); b.minY = Math.min(b.minY, o.minY); b.minZ = Math.min(b.minZ, o.minZ);
    b.maxX = Math.max(b.maxX, o.maxX); b.maxY = Math.max(b.maxY, o.maxY); b.maxZ = Math.max(b.maxZ, o.maxZ);
  }
  return b;
}

export const boxIntersectsChunk = (b: BlockBox, cx: number, cz: number) =>
  b.maxX >= cx * 16 && b.minX <= cx * 16 + 15 && b.maxZ >= cz * 16 && b.minZ <= cz * 16 + 15;

/**
 * Pure world queries available while planning/placing structures. They never depend on
 * generation order (they are computed from the seed, not from generated chunks).
 */
export interface StructureContext {
  readonly seed: number;
  readonly dimension: DimensionId;
  /** Biome id at a block column. */
  biomeAt(x: number, z: number): number;
  /** y of the top solid terrain block (before features); -1 if none. */
  heightAt(x: number, z: number): number;
  /** Block state the surface rules put at the top of a column (overworld; 0 if unknown). */
  groundBlockAt(x: number, z: number): number;
}

/**
 * One piece of a structure (a room, a corridor, a building ...). `place` writes the piece's blocks
 * through the chunk-clipped writer; it is called once for every chunk the piece's box intersects
 * and must produce identical blocks each time: decisions may use the piece's own data, its own
 * seeded Rng (re-created inside `place`), positional hashes and `ctx` — never blocks read outside
 * the chunk being generated.
 */
export interface StructurePiece {
  readonly box: BlockBox;
  place(w: ChunkWriter, ctx: StructureContext): void;
}

export interface StructureStart {
  readonly type: string;
  /** Start chunk. */
  readonly chunkX: number;
  readonly chunkZ: number;
  /** Representative position (returned by locateStructure). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pieces: StructurePiece[];
  /** Union of piece boxes. */
  readonly box: BlockBox;
  /** If true, trees/large vegetation are not grown in columns covered by `box` (surface structures). */
  readonly clearsVegetation: boolean;
}

/** Minecraft RandomSpreadStructurePlacement: one candidate start chunk per `spacing`² region. */
export interface RandomSpreadPlacement {
  kind: 'random_spread';
  /** Region size in chunks. */
  spacing: number;
  /** Minimum gap between candidates in chunks (< spacing). */
  separation: number;
  /** Per-structure salt. */
  salt: number;
  /** 'triangular' biases candidates to region centres (Minecraft uses it for e.g. end cities). */
  spread?: 'linear' | 'triangular';
  /** Probability that a region's candidate is kept (frequency reduction). */
  frequency?: number;
}

export type StructurePlacement = RandomSpreadPlacement;

export interface StructureType {
  /** Unique id, e.g. 'ruined_portal', 'village', 'stronghold'. Used by `locateStructure`. */
  readonly id: string;
  readonly dimension: DimensionId;
  readonly placement: StructurePlacement;
  /** Max distance in chunks from the start chunk that any piece may reach (search radius). */
  readonly maxReach: number;
  /** Write order between structure types (lower first; e.g. underground 0, surface 10). */
  readonly step: number;
  /**
   * Build the structure for a candidate start chunk, or return null if the location is invalid
   * (wrong biome, unsuitable terrain ...). `rng` is seeded from (world seed, chunk, salt).
   * Must be a pure function of its inputs.
   */
  generate(ctx: StructureContext, chunkX: number, chunkZ: number, rng: Rng): StructureStart | null;
}
