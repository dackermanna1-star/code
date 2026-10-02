/**
 * Desert well (Minecraft DesertWellFeature): a 5x5 sandstone basin with a water cross, slab rim,
 * four pillars and a slab roof, on flat sand in deserts (~1 per 1000 chunks).
 */
import { ST } from '../common/states';
import { biomeId } from '../../biomes';
import { registerStructure } from './registry';
import { box, type StructureContext, type StructurePiece, type StructureStart } from './types';
import type { ChunkWriter } from '../common/writer';

const DESERT = biomeId('desert');

class WellPiece implements StructurePiece {
  readonly box;
  constructor(readonly x: number, readonly y: number, readonly z: number) {
    this.box = box(x - 2, y - 1, z - 2, x + 2, y + 4, z + 2);
  }
  place(w: ChunkWriter, _ctx: StructureContext): void {
    const { x, y, z } = this;
    for (let l = -1; l <= 0; l++) for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) w.set(x + i, y + l, z + k, ST.sandstone);
    w.set(x, y, z, ST.water);
    w.set(x + 1, y, z, ST.water);
    w.set(x - 1, y, z, ST.water);
    w.set(x, y, z + 1, ST.water);
    w.set(x, y, z - 1, ST.water);
    for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) if (i === -2 || i === 2 || k === -2 || k === 2) w.set(x + i, y + 1, z + k, ST.sandstone);
    w.set(x + 2, y + 1, z, ST.sandstoneSlab);
    w.set(x - 2, y + 1, z, ST.sandstoneSlab);
    w.set(x, y + 1, z + 2, ST.sandstoneSlab);
    w.set(x, y + 1, z - 2, ST.sandstoneSlab);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) w.set(x + i, y + 4, z + k, i === 0 && k === 0 ? ST.sandstone : ST.sandstoneSlab);
    for (let h = 1; h <= 3; h++) {
      w.set(x - 1, y + h, z - 1, ST.sandstone);
      w.set(x - 1, y + h, z + 1, ST.sandstone);
      w.set(x + 1, y + h, z - 1, ST.sandstone);
      w.set(x + 1, y + h, z + 1, ST.sandstone);
    }
    // clear the space inside the well house (between the four pillars)
    for (let h = 1; h <= 3; h++)
      for (let i = -1; i <= 1; i++)
        for (let k = -1; k <= 1; k++) if (Math.abs(i) !== 1 || Math.abs(k) !== 1) w.set(x + i, y + h, z + k, 0);
  }
}

registerStructure({
  id: 'desert_well',
  dimension: 'overworld',
  placement: { kind: 'random_spread', spacing: 24, separation: 6, salt: 0xde5e47, frequency: 0.6 },
  maxReach: 1,
  step: 10,
  generate(ctx, chunkX, chunkZ, r): StructureStart | null {
    const x = chunkX * 16 + 2 + r.int(12), z = chunkZ * 16 + 2 + r.int(12);
    if (ctx.biomeAt(x, z) !== DESERT) return null;
    const y = ctx.heightAt(x, z);
    if (y < 63 || ctx.groundBlockAt(x, z) !== ST.sand) return null;
    for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) if (Math.abs(ctx.heightAt(x + i, z + k) - y) > 1) return null;
    const p = new WellPiece(x, y, z);
    return { type: 'desert_well', chunkX, chunkZ, x, y, z, pieces: [p], box: p.box, clearsVegetation: true };
  },
});
