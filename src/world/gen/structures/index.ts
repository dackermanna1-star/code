/**
 * Structures — extension point for villages, strongholds, fortresses, monuments, temples ...
 *
 * ## How it works
 *
 *  1. A structure type (`StructureType`, see types.ts) is registered with `registerStructure()`
 *     at import time. It declares its dimension, a deterministic region-grid placement
 *     (`random_spread`: one candidate start chunk per `spacing`x`spacing`-chunk region, offset by a
 *     seeded random in [0, spacing - separation), optional `frequency`), how far its pieces may reach
 *     from the start chunk (`maxReach`, in chunks) and a write order (`step`).
 *  2. `generate(ctx, chunkX, chunkZ, rng)` builds a `StructureStart` for a candidate chunk — or
 *     returns null when the spot is invalid (check `ctx.biomeAt`, `ctx.heightAt`,
 *     `ctx.groundBlockAt`). It returns a list of `StructurePiece`s (each with an inclusive block
 *     `box`) plus a representative position used by `locateStructure`. It must be a pure function
 *     of its arguments: `ctx` only offers seed-derived queries (no generated chunk data), and `rng`
 *     is seeded from (world seed, start chunk, placement salt). Starts are cached per generator.
 *  3. While generating chunk C, the `StructureManager` collects every start whose candidate chunk is
 *     within `maxReach` of C and whose box intersects C, then calls `piece.place(writer, ctx)` for
 *     each piece intersecting C. The `ChunkWriter` clips all writes to C, so a piece spanning several
 *     chunks is written by each of them — `place` must therefore produce the same blocks every time:
 *     derive randomness from the piece's own seed / positional hashes (`hashF`) and terrain heights
 *     from `ctx`, never from blocks outside C (reading C's own blocks for "replace only if ..." is
 *     fine). Block entities go through `writer.blockEntity(x, y, z, data)` (e.g.
 *     `{ type: 'chest', loot: 'village_plains' }`), entities through `writer.entity(...)` — both are
 *     kept only when inside C.
 *  4. Surface starts with `clearsVegetation` keep trees out of their bounding box (trees are
 *     planned before structures are written, from pure data).
 *  5. `locateStructure(type, x, z)` searches regions in growing rings around (x, z) and returns the
 *     nearest valid start's (x, y, z).
 *
 * ## Adding a structure (e.g. a village)
 *
 *  - Create `structures/village.ts`, implement `StructurePiece` classes (houses, roads, ...) and call
 *    `registerStructure({ id: 'village', dimension: 'overworld', placement: { kind: 'random_spread',
 *    spacing: 34, separation: 8, salt: 10387312 }, maxReach: 6, step: 10, generate })`.
 *  - Keep `maxReach` >= the largest chunk distance between the start chunk and any piece box.
 *  - Import the module below so it registers itself. Nothing else needs to change: the overworld,
 *    nether and end generators already create a StructureManager for their dimension, call
 *    `place()` for every chunk and forward `locateStructure()`.
 *  - For non-grid placements (Minecraft strongholds use rings around the origin) add a new
 *    `StructurePlacement` kind in types.ts and handle it in `manager.ts` (`startsFor` / `locate`).
 *
 * Small single-chunk features (dungeons, geodes) live in the dimension feature code instead.
 */
import './ruinedPortal';
import './desertWell';

export { StructureManager } from './manager';
export { registerStructure, structureTypesFor, structureType } from './registry';
export { regionCandidate, regionsFor, startSeed } from './placement';
export * from './types';
