/**
 * Generator factory. (Placeholder implementation — replaced by the full overworld/nether/end
 * generators in this directory.)
 */
import type { DimensionId, WorldGenerator } from './generator';
import type { GeneratedChunk } from '../chunk';
import { FbmNoise } from '../../core/noise';
import { S } from '../blocks/registry';
import '../blocks/blocks';
import { SEA_LEVEL } from '../../core/constants';
import { biomeId, BIOMES, biomeGrassColor, biomeFoliageColor } from '../biomes';

class PlaceholderGenerator implements WorldGenerator {
  private h: FbmNoise;
  constructor(readonly dimension: DimensionId, readonly seed: number) {
    this.h = new FbmNoise(seed, 5, 1 / 128);
  }
  surfaceHeightAt(x: number, z: number) {
    return Math.floor(SEA_LEVEL + 4 + this.h.get2(x, z) * 24);
  }
  biomeAt() {
    return biomeId('plains');
  }
  findSpawn() {
    return { x: 0.5, y: this.surfaceHeightAt(0, 0) + 1, z: 0.5 };
  }
  locateStructure() {
    return null;
  }
  generate(cx: number, cz: number): GeneratedChunk {
    const blocks: (Uint16Array | null)[] = new Array(16).fill(null);
    const set = (x: number, y: number, z: number, s: number) => {
      const sy = y >> 4;
      let a = blocks[sy];
      if (!a) a = blocks[sy] = new Uint16Array(4096);
      a[((y & 15) << 8) | (z << 4) | x] = s;
    };
    const stone = S('stone'), dirt = S('dirt'), grass = S('grass_block'), water = S('water'), sand = S('sand'), bedrock = S('bedrock');
    const heightmap = new Int16Array(256);
    const biomes = new Uint8Array(256).fill(biomeId('plains'));
    const b = BIOMES[biomeId('plains')];
    const grassColor = new Uint32Array(256).fill(biomeGrassColor(b));
    const foliageColor = new Uint32Array(256).fill(biomeFoliageColor(b));
    const waterColor = new Uint32Array(256).fill(b.water);
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const wx = cx * 16 + x, wz = cz * 16 + z;
        const h = this.surfaceHeightAt(wx, wz);
        for (let y = 0; y <= h; y++) {
          let s = stone;
          if (y === 0) s = bedrock;
          else if (y === h) s = h < SEA_LEVEL + 1 ? sand : grass;
          else if (y > h - 4) s = h < SEA_LEVEL + 1 ? sand : dirt;
          set(x, y, z, s);
        }
        for (let y = h + 1; y < SEA_LEVEL; y++) set(x, y, z, water);
        heightmap[z * 16 + x] = Math.max(h + 1, SEA_LEVEL);
      }
    return { cx, cz, blocks, biomes, heightmap, grassColor, foliageColor, waterColor };
  }
}

export function createGenerator(dimension: DimensionId, seed: number): WorldGenerator {
  return new PlaceholderGenerator(dimension, seed);
}
