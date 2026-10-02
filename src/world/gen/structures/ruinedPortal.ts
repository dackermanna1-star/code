/**
 * Ruined portal (Minecraft 1.16+): a broken obsidian / crying-obsidian nether portal frame,
 * surrounded by a patch of netherrack and magma, with a loot chest and the odd gold block.
 * Variants by biome: standard (partly buried), desert (sunk into sand), jungle (overgrown with
 * leaves), ocean (on the sea floor), mountain (perched as-is). Region placement like Minecraft
 * (spacing 40, separation 15 chunks). Pieces may cross chunk borders.
 */
import { hashF } from '../common/noise';
import { ST } from '../common/states';
import { BIOMES } from '../../biomes';
import { registerStructure } from './registry';
import { box, type StructureContext, type StructurePiece, type StructureStart } from './types';
import type { ChunkWriter } from '../common/writer';

class PortalPiece implements StructurePiece {
  readonly box;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly axis: number,
    readonly w: number,
    readonly h: number,
    readonly seed: number,
    readonly variant: 'standard' | 'desert' | 'jungle' | 'ocean' | 'mountain',
    readonly spread: number,
  ) {
    const R = spread + 1;
    const ex = axis === 0 ? w - 1 : 0, ez = axis === 0 ? 0 : w - 1;
    this.box = box(x - R, y - 4, z - R, x + ex + R, y + h + 2, z + ez + R);
  }

  private rnd(x: number, y: number, z: number, salt: number): number {
    return hashF(x, y, z, this.seed ^ salt);
  }

  place(wr: ChunkWriter, ctx: StructureContext): void {
    const { x, y, z, axis, w, h, variant } = this;
    const dx = axis === 0 ? 1 : 0, dz = axis === 0 ? 0 : 1;
    const b = this.box;
    // 1) netherrack / magma spread on the ground around the frame
    for (let px = b.minX; px <= b.maxX; px++)
      for (let pz = b.minZ; pz <= b.maxZ; pz++) {
        if (!wr.inside(px, pz)) continue;
        // distance to the frame's base line
        const t = Math.max(0, Math.min(w - 1, axis === 0 ? px - x : pz - z));
        const fx = x + dx * t, fz = z + dz * t;
        const d = Math.hypot(px - fx, pz - fz);
        const p = 1 - d / (this.spread + 0.5);
        if (p <= 0 || this.rnd(px, 0, pz, 0x11) > p) continue;
        const gy = ctx.heightAt(px, pz);
        if (gy < 1 || Math.abs(gy - (y - 1)) > 4) continue;
        const cur = wr.get(px, gy, pz);
        if (cur <= 0 || cur === ST.water || cur === ST.lava) continue;
        const r = this.rnd(px, 1, pz, 0x12);
        wr.set(px, gy, pz, r < 0.1 ? ST.magma : variant === 'ocean' && r < 0.3 ? ST.blackstone : ST.netherrack);
        const above = wr.get(px, gy + 1, pz);
        if (r > 0.985 && (above === 0 || above === ST.water) && variant !== 'ocean') wr.set(px, gy + 1, pz, ST.goldBlock);
        else if (r > 0.95 && variant === 'jungle' && above === 0) wr.set(px, gy + 1, pz, ST.oakLeaves);
        // clear plants standing on the replaced ground
        if (above > 0 && above !== ST.water && (above >>> 4) !== (ST.goldBlock >>> 4) && wr.get(px, gy + 2, pz) === 0 && (above === ST.shortGrass || above === ST.fern || above === ST.deadBush)) wr.set(px, gy + 1, pz, 0);
      }
    // 2) the frame: obsidian with crying obsidian, some blocks missing
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) {
        const px = x + dx * i, py = y + j, pz = z + dz * i;
        const edge = i === 0 || i === w - 1 || j === 0 || j === h - 1;
        if (!edge) {
          if (py >= y + 1) wr.set(px, py, pz, variant === 'ocean' && py < 63 ? ST.water : 0);
          continue;
        }
        const r = this.rnd(px, py, pz, 0x13);
        const missing = r < (j === h - 1 ? 0.45 : 0.22);
        if (missing) {
          if (wr.get(px, py, pz) !== -1 && py > y) wr.set(px, py, pz, variant === 'ocean' && py < 63 ? ST.water : 0);
          continue;
        }
        wr.set(px, py, pz, r < 0.36 ? ST.cryingObsidian : ST.obsidian);
        if (variant === 'jungle' && this.rnd(px, py, pz, 0x14) < 0.3) {
          const ox = px + (axis === 0 ? 0 : 1), oz = pz + (axis === 0 ? 1 : 0);
          if (wr.get(ox, py, oz) === 0) wr.set(ox, py, oz, ST.oakLeaves);
        }
      }
    // 3) fallen frame blocks on the ground
    for (let k = 0; k < 6; k++) {
      const fx = x + Math.floor(this.rnd(k, 0, 0, 0x15) * (w + 4)) - 2 * (1 - dx) - (dx ? 2 : 0);
      const fz = z + Math.floor(this.rnd(k, 1, 0, 0x16) * (w + 4)) - 2 * (1 - dz) - (dz ? 2 : 0);
      if (!wr.inside(fx, fz)) continue;
      const gy = ctx.heightAt(fx, fz);
      if (Math.abs(gy - (y - 1)) > 3) continue;
      const above = wr.get(fx, gy + 1, fz);
      if (above === 0 || (variant === 'ocean' && above === ST.water)) wr.set(fx, gy + 1, fz, this.rnd(k, 2, 0, 0x17) < 0.3 ? ST.cryingObsidian : ST.obsidian);
    }
    // 4) loot chest beside the frame
    const cx = x + dx * Math.floor(w / 2) - dz * 2, cz = z + dz * Math.floor(w / 2) - dx * 2;
    if (wr.inside(cx, cz)) {
      const gy = ctx.heightAt(cx, cz);
      if (Math.abs(gy - (y - 1)) <= 3) {
        wr.set(cx, gy + 1, cz, ST.chest | (axis === 0 ? 2 : 1));
        wr.blockEntity(cx, gy + 1, cz, { type: 'chest', loot: 'ruined_portal' });
      }
    }
  }
}

registerStructure({
  id: 'ruined_portal',
  dimension: 'overworld',
  placement: { kind: 'random_spread', spacing: 40, separation: 15, salt: 34222645 },
  maxReach: 1,
  step: 10,
  generate(ctx, chunkX, chunkZ, r): StructureStart | null {
    const x = chunkX * 16 + 3 + r.int(10), z = chunkZ * 16 + 3 + r.int(10);
    const axis = r.int(2);
    const giant = r.next() < 0.05;
    const w = giant ? 6 + r.int(3) : 4;
    const h = giant ? 8 + r.int(4) : 5;
    const seed = r.nextU32();
    const sinkRoll = r.next();
    const gy = ctx.heightAt(x, z);
    if (gy < 4 || gy > 220) return null;
    const biome = BIOMES[ctx.biomeAt(x, z)];
    let variant: PortalPiece['variant'] = 'standard';
    if (gy < 62 || biome.category === 'ocean') variant = 'ocean';
    else if (biome.name === 'desert') variant = 'desert';
    else if (biome.category === 'jungle') variant = 'jungle';
    else if (biome.category === 'mountain' || gy > 110) variant = 'mountain';
    const sink = variant === 'desert' ? 1 + Math.floor(sinkRoll * 3) : variant === 'mountain' || variant === 'ocean' ? 0 : sinkRoll < 0.4 ? 1 : 0;
    const y = gy + 1 - sink;
    const piece = new PortalPiece(x, y, z, axis, w, h, seed, variant, giant ? 6 : 4);
    return { type: 'ruined_portal', chunkX, chunkZ, x, y, z, pieces: [piece], box: piece.box, clearsVegetation: true };
  },
});
