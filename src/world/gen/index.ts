/**
 * Generator factory used by the generation worker (`gen.worker.ts`).
 *
 *   overworld -> overworld/overworld.ts  (Minecraft 1.18+ multi-noise terrain, caves, features)
 *   nether    -> nether/nether.ts        (3D cave terrain, nether biomes & features)
 *   end       -> end/end.ts              (main island, spikes, exit podium, outer islands)
 *
 * Structures (villages, strongholds, fortresses ...) plug into `structures/` — see the
 * documentation at the top of `structures/index.ts`.
 */
import type { DimensionId, WorldGenerator } from './generator';
import { OverworldGenerator } from './overworld/overworld';
import { NetherGenerator } from './nether/nether';
import { EndGenerator } from './end/end';

export function createGenerator(dimension: DimensionId, seed: number): WorldGenerator {
  switch (dimension) {
    case 'nether':
      return new NetherGenerator(seed | 0);
    case 'end':
      return new EndGenerator(seed | 0);
    case 'overworld':
    default:
      return new OverworldGenerator(seed | 0);
  }
}
