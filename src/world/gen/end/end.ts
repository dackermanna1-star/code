/**
 * End generator (Minecraft 1.9+ style).
 *
 *  - Terrain: Minecraft's `EndIslandDensityFunction` (main island of radius ~100 around (0,0); outer
 *    islands on a 16-block cell grid beyond 1024 blocks) + light 3D noise, with the End's top/bottom
 *    slides — giving a bowl-shaped floating island whose top is around y 56..64 and whose underside
 *    tapers down to y ~11 in the centre. Density sampled on 4x8x4 cells, trilinearly interpolated.
 *  - Ten obsidian spikes on a radius-42 ring (Minecraft SpikeFeature: radius 2..5, height 76..103,
 *    two with iron-bar cages), each with a bedrock block and an `end_crystal` entity on top.
 *  - The exit portal podium (EndPodiumFeature) at the origin, unlit (no end_portal blocks).
 *  - Outer islands: chorus plants on end highlands, small floating islands.
 */
import type { WorldGenerator } from '../generator';
import type { GeneratedChunk } from '../../chunk';
import { OctaveNoise, hash3i as hash3i_ } from '../common/noise';
import { Rng, seedFor } from '../../../core/rng';
import { ST as ST_ } from '../common/states';
import { finishChunk, uniformColors } from '../common/output';
import { ChunkWriter } from '../common/writer';
import { biomeId } from '../../biomes';
import { S } from '../../blocks/registry';
import { StructureManager } from '../structures/index';

const ST = ST_;
const hash3i = hash3i_;

const LEVELS = 33;
const B_END = biomeId('the_end');
const B_HIGH = biomeId('end_highlands');
const B_SMALL = biomeId('small_end_islands');

export interface EndSpike {
  x: number;
  z: number;
  radius: number;
  height: number;
  guarded: boolean;
}

class EndColumn {
  island = 0;
  readonly d = new Float32Array(LEVELS);
  kTop = 0;
  done = false;
  constructor(readonly qx: number, readonly qz: number) {}
}

export class EndGenerator implements WorldGenerator {
  readonly dimension = 'end' as const;
  private readonly base: OctaveNoise;
  private readonly cache = new Map<number, EndColumn>();
  private readonly work = new Uint16Array(65536);
  private readonly writer = new ChunkWriter();
  readonly spikes: EndSpike[];
  private podiumY = -1;
  /** Structure extension point (end cities ... register for dimension 'end'). */
  readonly structures: StructureManager;

  constructor(readonly seed: number) {
    this.base = new OctaveNoise((seed * 31 + 0x3e4d) | 0, 1 / 64, [1, 0.5, 0.25], { sigma: 0.06, yScale: 2 });
    // Minecraft SpikeFeature: 10 spikes on a ring of radius 42, sizes shuffled by the world seed
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const r = new Rng(seed ^ 0x5e1ce);
    for (let i = 9; i > 0; i--) {
      const j = r.int(i + 1);
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    this.spikes = [];
    for (let i = 0; i < 10; i++) {
      const a = 2 * (-Math.PI + (Math.PI / 10) * i);
      const l = order[i];
      this.spikes.push({ x: Math.floor(42 * Math.cos(a)), z: Math.floor(42 * Math.sin(a)), radius: 2 + Math.floor(l / 3), height: 76 + l * 3, guarded: l === 1 || l === 2 });
    }
    this.structures = new StructureManager('end', {
      seed,
      dimension: 'end',
      biomeAt: (x, z) => this.biomeAt(x, z),
      heightAt: (x, z) => this.topSolid(x, z),
      groundBlockAt: (x, z) => (this.topSolid(x, z) >= 0 ? ST.endStone : 0),
    });
  }

  // ------------------------------------------------------------------------------------------
  // density
  // ------------------------------------------------------------------------------------------

  /** Island cell test (outer islands on a 16-block grid beyond 1024 blocks). */
  private islandCell(k1: number, l1: number): boolean {
    if (k1 * k1 + l1 * l1 <= 4096) return false;
    return hash3i(k1, 0x15, l1, this.seed ^ 0xe11d) / 4294967296 < 0.012;
  }

  /** Minecraft EndIslandDensityFunction height value at (x/8, z/8) cell coordinates (float). */
  islandHeight(bx: number, bz: number): number {
    const x = bx / 8, z = bz / 8;
    const i = Math.floor(x / 2), j = Math.floor(z / 2);
    const k = x - i * 2, l = z - j * 2;
    let f = 100 - Math.sqrt(x * x + z * z) * 8;
    f = Math.max(-100, Math.min(80, f));
    if (bx * bx + bz * bz < 900 * 900) return f;
    for (let i1 = -12; i1 <= 12; i1++)
      for (let j1 = -12; j1 <= 12; j1++) {
        const k1 = i + i1, l1 = j + j1;
        if (!this.islandCell(k1, l1)) continue;
        const f1 = ((Math.abs(k1) * 3439 + Math.abs(l1) * 147) % 13) + 9;
        const f2 = k - i1 * 2, f3 = l - j1 * 2;
        let f4 = 100 - Math.sqrt(f2 * f2 + f3 * f3) * f1;
        f4 = Math.max(-100, Math.min(80, f4));
        if (f4 > f) f = f4;
      }
    return f;
  }

  private column(qx: number, qz: number): EndColumn {
    const key = (qx + 0x800000) * 0x1000000 + (qz + 0x800000);
    let c = this.cache.get(key);
    if (c) return c;
    if (this.cache.size > 16384) this.cache.clear();
    c = new EndColumn(qx, qz);
    const x = qx * 4, z = qz * 4;
    c.island = this.islandHeight(x, z);
    const isl = (c.island - 8) / 128;
    for (let k = 0; k < LEVELS; k++) {
      const y = k * 8;
      if (isl < -0.5 || y > 120) {
        c.d[k] = -1;
        continue;
      }
      let D = isl + this.base.noise3(x, y, z);
      // top slide (y 56 -> 312 towards -23.4375)
      const ft = Math.max(0, Math.min(1, 1 - (y - 56) / 256));
      D = -23.4375 + ft * (D + 23.4375);
      // bottom slide (y 4 -> 32 towards -0.234375)
      const fb = Math.max(0, Math.min(1, (y - 4) / 28));
      D = -0.234375 + fb * (D + 0.234375);
      c.d[k] = D;
    }
    this.cache.set(key, c);
    return c;
  }

  private density(x: number, y: number, z: number): number {
    const qx = x >> 2, qz = z >> 2, fx = (x & 3) * 0.25, fz = (z & 3) * 0.25;
    const k = y >> 3, t = (y & 7) * 0.125;
    const c00 = this.column(qx, qz), c10 = this.column(qx + 1, qz), c01 = this.column(qx, qz + 1), c11 = this.column(qx + 1, qz + 1);
    const a0 = c00.d[k] + fx * (c10.d[k] - c00.d[k]), b0 = c01.d[k] + fx * (c11.d[k] - c01.d[k]);
    const v0 = a0 + fz * (b0 - a0);
    const a1 = c00.d[k + 1] + fx * (c10.d[k + 1] - c00.d[k + 1]), b1 = c01.d[k + 1] + fx * (c11.d[k + 1] - c01.d[k + 1]);
    const v1 = a1 + fz * (b1 - a1);
    return v0 + t * (v1 - v0);
  }

  /** Top terrain y (end stone) at a column, or -1 (void). Pure. */
  topSolid(x: number, z: number): number {
    for (let y = 127; y >= 1; y--) if (this.density(x, y, z) > 0) return y;
    return -1;
  }

  // ------------------------------------------------------------------------------------------
  // WorldGenerator API
  // ------------------------------------------------------------------------------------------

  biomeAt(x: number, z: number): number {
    x = Math.floor(x); z = Math.floor(z);
    if (x * x + z * z <= 1024 * 1024) return B_END;
    const h = this.islandHeight(x, z);
    return h > 40 ? B_HIGH : B_SMALL;
  }

  surfaceHeightAt(x: number, z: number): number {
    const y = this.topSolid(Math.floor(x), Math.floor(z));
    return y < 0 ? 0 : y;
  }

  /**
   * Spawn on Minecraft's arrival platform: a 5x5 obsidian platform at y = 48 centred on (100, 0)
   * with 3 blocks of air above (generated by this generator, see `platform()`).
   */
  findSpawn(): { x: number; y: number; z: number } {
    return { x: 100.5, y: 49, z: 0.5 };
  }

  locateStructure(type: string, x: number, z: number): { x: number; y: number; z: number } | null {
    return this.structures.locate(type, Math.floor(x), Math.floor(z));
  }

  /** y of the exit portal floor (the top terrain block at the origin). */
  portalY(): number {
    if (this.podiumY < 0) this.podiumY = Math.max(40, this.topSolid(0, 0));
    return this.podiumY;
  }

  // ------------------------------------------------------------------------------------------
  // generation
  // ------------------------------------------------------------------------------------------

  generate(cx: number, cz: number): GeneratedChunk {
    const work = this.work;
    work.fill(0);
    const x0 = cx * 16, z0 = cz * 16;
    // terrain
    const q0x = cx * 4, q0z = cz * 4;
    const cols: EndColumn[] = [];
    let any = false;
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const c = this.column(q0x + i, q0z + j);
        cols.push(c);
        if (c.island > -10) any = true;
      }
    if (any) {
      for (let z = 0; z < 16; z++) {
        const qz = z >> 2, fz = (z & 3) * 0.25;
        for (let x = 0; x < 16; x++) {
          const qx = x >> 2, fx = (x & 3) * 0.25;
          const c00 = cols[qz * 5 + qx], c10 = cols[qz * 5 + qx + 1], c01 = cols[(qz + 1) * 5 + qx], c11 = cols[(qz + 1) * 5 + qx + 1];
          const col = (z << 4) | x;
          for (let k = 0; k < 16; k++) {
            const a0 = c00.d[k] + fx * (c10.d[k] - c00.d[k]), b0 = c01.d[k] + fx * (c11.d[k] - c01.d[k]);
            const v0 = a0 + fz * (b0 - a0);
            const a1 = c00.d[k + 1] + fx * (c10.d[k + 1] - c00.d[k + 1]), b1 = c01.d[k + 1] + fx * (c11.d[k + 1] - c01.d[k + 1]);
            const v1 = a1 + fz * (b1 - a1);
            if (v0 <= 0 && v1 <= 0) continue;
            for (let j = 0; j < 8; j++) if (v0 + j * 0.125 * (v1 - v0) > 0) work[((k * 8 + j) << 8) | col] = ST.endStone;
          }
        }
      }
    }
    const w = this.writer;
    w.reset(cx, cz, work);
    this.structures.place(cx, cz, w);
    // main island structures
    if (Math.abs(x0 + 8) < 200 && Math.abs(z0 + 8) < 200) {
      for (const s of this.spikes) this.spike(w, s);
      this.podium(w);
      this.platform(w);
    }
    // outer islands
    if ((x0 + 8) * (x0 + 8) + (z0 + 8) * (z0 + 8) > 950 * 950) {
      this.smallIsland(cx, cz, w);
      this.chorus(cx, cz, w);
    }
    const biomes = new Uint8Array(256);
    for (let c = 0; c < 256; c++) biomes[c] = this.biomeAt(x0 + (c & 15), z0 + (c >> 4));
    return finishChunk(cx, cz, work, biomes, uniformColors(B_END), w.blockEntities, w.entities);
  }

  private spike(w: ChunkWriter, s: EndSpike): void {
    const r = s.radius;
    if (!w.intersects(s.x - r - 2, s.z - r - 2, s.x + r + 2, s.z + r + 2)) return;
    for (let x = s.x - r; x <= s.x + r; x++)
      for (let z = s.z - r; z <= s.z + r; z++) {
        if (!w.inside(x, z)) continue;
        const inside = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) <= r * r + 1;
        for (let y = 0; y <= Math.min(255, s.height + 10); y++) {
          if (inside && y < s.height) w.set(x, y, z, ST.obsidian);
          else if (y > 65) w.set(x, y, z, 0);
        }
      }
    if (s.guarded) {
      for (let i1 = -2; i1 <= 2; i1++)
        for (let j1 = -2; j1 <= 2; j1++)
          for (let k1 = 0; k1 <= 3; k1++) {
            if (Math.abs(i1) === 2 || Math.abs(j1) === 2 || k1 === 3) w.set(s.x + i1, s.height + k1, s.z + j1, ST.ironBars);
          }
    }
    w.set(s.x, s.height, s.z, ST.bedrock);
    w.entity('end_crystal', s.x + 0.5, s.height + 1, s.z + 0.5);
  }

  /** Minecraft's obsidian arrival platform (ServerLevel.makeObsidianPlatform) at (100, 48, 0). */
  private platform(w: ChunkWriter): void {
    if (!w.intersects(98, -2, 102, 2)) return;
    for (let x = 98; x <= 102; x++)
      for (let z = -2; z <= 2; z++) {
        w.set(x, 48, z, ST.obsidian);
        for (let y = 49; y <= 51; y++) w.set(x, y, z, 0);
      }
  }

  /** Minecraft EndPodiumFeature (inactive: no end_portal blocks). */
  private podium(w: ChunkWriter): void {
    if (!w.intersects(-4, -4, 4, 4)) return;
    const oy = this.portalY();
    for (let x = -4; x <= 4; x++)
      for (let z = -4; z <= 4; z++)
        for (let y = oy - 1; y <= oy + 32; y++) {
          const d2 = x * x + (y - oy) * (y - oy) + z * z;
          const inner = d2 < 2.5 * 2.5;
          if (!inner && !(d2 < 3.5 * 3.5)) continue;
          if (y < oy) w.set(x, y, z, inner ? ST.bedrock : ST.endStone);
          else if (y > oy) w.set(x, y, z, 0);
          else if (!inner) w.set(x, y, z, ST.bedrock);
          else w.set(x, y, z, 0);
        }
    for (let i = 0; i < 4; i++) w.set(0, oy + i, 0, ST.bedrock);
    // wall torches on the pillar (meta = direction the torch points: 2 N, 3 S, 4 W, 5 E)
    w.set(0, oy + 2, -1, S('torch', 2));
    w.set(0, oy + 2, 1, S('torch', 3));
    w.set(-1, oy + 2, 0, S('torch', 4));
    w.set(1, oy + 2, 0, S('torch', 5));
  }

  /** Small floating islands (Minecraft EndIslandFeature), kept inside one chunk. */
  private smallIsland(cx: number, cz: number, w: ChunkWriter): void {
    const r = new Rng(seedFor(this.seed, cx, cz, 0xe151));
    if (r.int(14) !== 0) return;
    const x = cx * 16 + 6 + r.int(4), z = cz * 16 + 6 + r.int(4), y = 55 + r.int(16);
    let f = r.int(3) + 4;
    for (let i = 0; f > 0.5; i--) {
      for (let dx = Math.floor(-f); dx <= Math.ceil(f); dx++)
        for (let dz = Math.floor(-f); dz <= Math.ceil(f); dz++)
          if (dx * dx + dz * dz <= (f + 1) * (f + 1)) w.air(x + dx, y + i, z + dz, ST.endStone);
      f -= r.int(2) + 0.5;
    }
    if (r.int(2) === 0) this.chorusPlant(w, x, y + 1, z, r.nextU32());
  }

  /** Chorus plants on end highlands, from the 3x3 neighbourhood (reach < 8). */
  private chorus(cx: number, cz: number, w: ChunkWriter): void {
    for (let sz = cz - 1; sz <= cz + 1; sz++)
      for (let sx = cx - 1; sx <= cx + 1; sx++) {
        const r = new Rng(seedFor(this.seed, sx, sz, 0xc407));
        const n = r.int(5);
        for (let a = 0; a < n; a++) {
          const x = sx * 16 + r.int(16), z = sz * 16 + r.int(16);
          const seed = r.nextU32();
          if (!w.intersects(x - 8, z - 8, x + 8, z + 8)) continue;
          if (this.islandHeight(x, z) < 8) continue;
          const y = this.topSolid(x, z);
          if (y < 0) continue;
          this.chorusPlant(w, x, y + 1, z, seed);
        }
      }
  }

  /** Minecraft ChorusFlowerBlock.generatePlant with an internal occupancy set (pure). */
  private chorusPlant(w: ChunkWriter, x: number, y: number, z: number, seed: number): void {
    const r = new Rng(seed);
    const occ = new Set<number>();
    const K = (px: number, py: number, pz: number) => ((px - x + 16) * 256 + py) * 64 + (pz - z + 16);
    const put = (px: number, py: number, pz: number, s: number) => {
      occ.add(K(px, py, pz));
      const cur = w.get(px, py, pz);
      if (cur === 0 || cur === ST.chorusPlant) w.set(px, py, pz, s);
    };
    const empty = (px: number, py: number, pz: number) => !occ.has(K(px, py, pz)) && py < 255;
    const nbEmpty = (px: number, py: number, pz: number, except: number) => {
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) if (i !== except && !empty(px + d[i][0], py, pz + d[i][1])) return false;
      return true;
    };
    const HX = [1, -1, 0, 0], HZ = [0, 0, 1, -1], OPP = [1, 0, 3, 2];
    const grow = (bx: number, by: number, bz: number, it: number): void => {
      let i = r.int(4) + 1;
      if (it === 0) i++;
      for (let j = 0; j < i; j++) {
        if (!nbEmpty(bx, by + j + 1, bz, -1)) return;
        put(bx, by + j + 1, bz, ST.chorusPlant);
        put(bx, by + j, bz, ST.chorusPlant);
      }
      let grew = false;
      if (it < 4) {
        let l = r.int(4);
        if (it === 0) l++;
        for (let k = 0; k < l; k++) {
          const d = r.int(4);
          const px = bx + HX[d], py = by + i, pz = bz + HZ[d];
          if (Math.abs(px - x) < 8 && Math.abs(pz - z) < 8 && empty(px, py, pz) && empty(px, py - 1, pz) && nbEmpty(px, py, pz, OPP[d])) {
            grew = true;
            put(px, py, pz, ST.chorusPlant);
            put(bx, by + i, bz, ST.chorusPlant);
            grow(px, py, pz, it + 1);
          }
        }
      }
      if (!grew) put(bx, by + i, bz, ST.chorusFlower);
    };
    put(x, y, z, ST.chorusPlant);
    grow(x, y, z, 0);
  }
}
