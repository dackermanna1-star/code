/**
 * Villages (Minecraft 1.14+ jigsaw villages, approximated): a meeting point (well + bell) in the
 * centre, streets growing outward in straight segments that branch at their ends and follow the
 * terrain height (dirt path; smooth sandstone in deserts; plank bridges over water are avoided by
 * stopping at water), and buildings attached to both sides of every street with their doors facing
 * it: small / medium houses, job-site houses (armorer, butcher, cartographer, fisher, fletcher,
 * leatherworker, mason, shepherd, toolsmith), a blacksmith (weaponsmith), a library, a temple with a
 * bell tower, farms and lamp posts. Variants by biome: plains, desert, savanna, taiga, snowy.
 *
 * Placement like vanilla: spacing 34, separation 8, salt 10387312; the start must be in a village
 * biome on dry land. Everything stays within 6 chunks of the start chunk (maxReach 6).
 */
import type { Rng } from '../../../../core/rng';
import { registerStructure } from '../registry';
import { box, boxUnion, type BlockBox, type StructureContext, type StructurePiece, type StructureStart } from '../types';
import { originFor, rotFacing, localBox } from '../lib/builder';
import { HDX, HDZ } from '../lib/blocks';
import { rectsIntersect } from '../lib/piece';
import { palette, villageVariantFor, type Palette } from './palette';
import { SIZE, VillageBuilding, buildingHeight, type BuildingKind } from './buildings';
import type { ChunkWriter } from '../../common/writer';
import { B } from '../lib/blocks';

const SEA = 63;
const REACH = 6;
const MAX_BUILDINGS = 26;

/** A straight street segment, 3 blocks wide, following the terrain. */
class StreetPiece implements StructurePiece {
  readonly box: BlockBox;
  constructor(readonly cells: Int32Array, readonly pal: Palette) {
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9, minY = 999, maxY = -1;
    for (let i = 0; i < cells.length; i += 3) {
      minX = Math.min(minX, cells[i]); maxX = Math.max(maxX, cells[i]);
      minZ = Math.min(minZ, cells[i + 2]); maxZ = Math.max(maxZ, cells[i + 2]);
      minY = Math.min(minY, cells[i + 1]); maxY = Math.max(maxY, cells[i + 1]);
    }
    this.box = box(minX, minY - 1, minZ, maxX, maxY + 2, maxZ);
  }
  place(w: ChunkWriter, _ctx: StructureContext): void {
    const c = this.cells;
    for (let i = 0; i < c.length; i += 3) {
      const x = c[i], y = c[i + 1], z = c[i + 2];
      if (!w.inside(x, z)) continue;
      w.set(x, y, z, this.pal.path);
      if (this.pal.path === B('dirt_path')) w.set(x, y - 1, z, B('dirt'));
      for (let k = 1; k <= 2; k++) {
        const s = w.get(x, y + k, z);
        if (s !== 0 && s !== B('water') && s !== B('lava')) w.set(x, y + k, z, 0);
      }
    }
  }
}

interface Segment { x: number; z: number; h: number; depth: number }

const JOB_KINDS: BuildingKind[] = ['armorer', 'butcher', 'cartographer', 'fisher', 'fletcher', 'leatherworker', 'mason', 'shepherd', 'toolsmith', 'weaponsmith', 'library', 'temple'];

function pickKind(r: Rng, jobs: BuildingKind[], farms: number): BuildingKind {
  const roll = r.next();
  if (roll < 0.36 && jobs.length) return jobs.splice(r.int(jobs.length), 1)[0];
  if (roll < 0.5 && farms < 3) return 'farm';
  return roll < 0.78 ? 'small_house' : 'medium_house';
}

function generateVillage(ctx: StructureContext, chunkX: number, chunkZ: number, r: Rng): StructureStart | null {
  const cx = chunkX * 16 + 8, cz = chunkZ * 16 + 8;
  const variant = villageVariantFor(ctx.biomeAt(cx, cz));
  if (!variant) return null;
  const cy = ctx.heightAt(cx, cz);
  if (cy < SEA) return null;
  const pal = palette(variant);
  const lim = box((chunkX - REACH) * 16, 0, (chunkZ - REACH) * 16, (chunkX + REACH) * 16 + 15, 255, (chunkZ + REACH) * 16 + 15);
  const within = (b: BlockBox) => b.minX >= lim.minX && b.maxX <= lim.maxX && b.minZ >= lim.minZ && b.maxZ <= lim.maxZ;

  const pieces: StructurePiece[] = [];
  const occupied: BlockBox[] = [];
  const streets: StructurePiece[] = [];
  let buildings = 0, farms = 0, lamps = 0;
  const jobs = [...JOB_KINDS];
  /** Street rows planned for branches (kept free of buildings). */
  const reserved: BlockBox[] = [];

  // --- meeting point
  const [msx, msz] = SIZE.meeting_point;
  const mrot = r.int(4);
  const mx0 = cx - (msx >> 1), mz0 = cz - (msz >> 1);
  const plaza = new VillageBuilding('meeting_point', pal, mx0, cy, mz0, mrot, r.nextU32(), cy - 4, Math.max(cy, groundMax(ctx, mx0, mz0, mx0 + msx - 1, mz0 + msz - 1)));
  if (plaza.box.maxY - cy > 12) return null;
  pieces.push(plaza);
  occupied.push(plaza.box);

  /** Try to attach a building at street distance `t` on side `p` of a segment. */
  const tryBuilding = (kind: BuildingKind, seg: Segment, t: number, side: number): number => {
    const [sx, sz] = SIZE[kind];
    const p = (seg.h + side) & 3;
    const f = (p + 2) & 3;
    const rot = rotFacing(f);
    const doorX = kind === 'lamp' ? 0 : Math.floor(sx / 2);
    const ax = side === 1 ? t + doorX : t + (sx - 1 - doorX);
    const wx = seg.x + HDX[seg.h] * ax + HDX[p] * 2, wz = seg.z + HDZ[seg.h] * ax + HDZ[p] * 2;
    const [ox, oz] = originFor(wx, wz, rot, sx, sz, doorX, 0);
    const fb = localBox(ox, 0, oz, rot, sx, 1, sz);
    if (!within(fb)) return 0;
    for (const o of occupied) if (rectsIntersect(fb, o)) return 0;
    for (const o of reserved) if (rectsIntersect(fb, o)) return 0;
    // terrain: floor at the street level in front of the door
    const ry = ctx.heightAt(seg.x + HDX[seg.h] * ax + HDX[p], seg.z + HDZ[seg.h] * ax + HDZ[p]);
    if (ry < SEA) return 0;
    let mn = 999, mxH = -1;
    for (let x = fb.minX; x <= fb.maxX; x++)
      for (let z = fb.minZ; z <= fb.maxZ; z++) {
        const h = ctx.heightAt(x, z);
        if (h < mn) mn = h;
        if (h > mxH) mxH = h;
      }
    if (mn < SEA - 1 || mxH - ry > 6 || ry - mn > 7) return 0;
    const piece = new VillageBuilding(kind, pal, ox, ry, oz, rot, r.nextU32(), Math.min(mn, ry - 1), Math.max(ry, mxH));
    pieces.push(piece);
    occupied.push(piece.box);
    return sx;
  };

  // --- streets
  const queue: Segment[] = [];
  for (let d = 0; d < 4; d++) {
    if (r.next() < 0.15 && d > 1) continue;
    const off = (msx >> 1) + 1;
    queue.push({ x: cx + HDX[d] * off, z: cz + HDZ[d] * off, h: d, depth: 0 });
  }
  let guard = 0;
  while (queue.length && guard++ < 40) {
    const seg = queue.shift()!;
    const want = 14 + r.int(18);
    const cells: number[] = [];
    let len = 0;
    for (let t = 0; t < want; t++) {
      const x = seg.x + HDX[seg.h] * t, z = seg.z + HDZ[seg.h] * t;
      // the full 3-wide row must be on land, inside the village area and free of buildings
      const row = box(x - Math.abs(HDZ[seg.h]), 0, z - Math.abs(HDX[seg.h]), x + Math.abs(HDZ[seg.h]), 0, z + Math.abs(HDX[seg.h]));
      if (!within(row)) break;
      let blocked = false;
      for (const o of occupied) if (rectsIntersect(row, o)) { blocked = true; break; }
      if (blocked && t > 0) break;
      let ok = true;
      const ys: number[] = [];
      for (let k = -1; k <= 1; k++) {
        const px = x + HDX[(seg.h + 1) & 3] * k, pz = z + HDZ[(seg.h + 1) & 3] * k;
        const y = ctx.heightAt(px, pz);
        if (y < SEA) { ok = false; break; }
        ys.push(px, y, pz);
      }
      if (!ok) break;
      cells.push(...ys);
      len = t + 1;
    }
    if (len < 5) continue;
    const street = new StreetPiece(Int32Array.from(cells), pal);
    streets.push(street);
    // plan the branches first so their entrances stay free of buildings
    const children: Segment[] = [];
    if (seg.depth < 3 && buildings < MAX_BUILDINGS) {
      const ex = seg.x + HDX[seg.h] * len, ez = seg.z + HDZ[seg.h] * len;
      if (r.next() < 0.6) children.push({ x: ex, z: ez, h: seg.h, depth: seg.depth + 1 });
      for (const turn of [1, 3]) {
        if (r.next() < 0.55) {
          const h = (seg.h + turn) & 3;
          const at = 3 + r.int(Math.max(1, len - 5));
          const bx = seg.x + HDX[seg.h] * at, bz = seg.z + HDZ[seg.h] * at;
          const child = { x: bx + HDX[h] * 2, z: bz + HDZ[h] * 2, h, depth: seg.depth + 1 };
          children.push(child);
          const fx = child.x + HDX[h] * 10, fz = child.z + HDZ[h] * 10;
          const px = Math.abs(HDZ[h]), pz = Math.abs(HDX[h]);
          reserved.push(box(Math.min(child.x, fx) - px, 0, Math.min(child.z, fz) - pz, Math.max(child.x, fx) + px, 0, Math.max(child.z, fz) + pz));
        }
      }
    }
    // buildings on both sides
    for (const side of [1, 3]) {
      let t = 1;
      while (t < len - 2 && buildings < MAX_BUILDINGS) {
        const kind = pickKind(r, jobs, farms);
        let used = tryBuilding(kind, seg, t, side);
        if (used) {
          buildings++;
          if (kind === 'farm') farms++;
        } else {
          if (JOB_KINDS.includes(kind) && !jobs.includes(kind)) jobs.push(kind);
          // a lamp post fills the gap now and then
          if (lamps < 10 && r.next() < 0.1 && (used = tryBuilding('lamp', seg, t, side))) lamps++;
        }
        t += used ? used + 1 : 2;
      }
    }
    // the street itself is now occupied (children may start next to it)
    occupied.push(box(street.box.minX, 0, street.box.minZ, street.box.maxX, 0, street.box.maxZ));
    queue.push(...children);
  }
  if (buildings < 4) return null;
  const all = [...streets, ...pieces];
  return { type: 'village', chunkX, chunkZ, x: cx, y: cy, z: cz, pieces: all, box: boxUnion(all.map((p) => p.box)), clearsVegetation: true };
}

function groundMax(ctx: StructureContext, x0: number, z0: number, x1: number, z1: number): number {
  let m = -1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) m = Math.max(m, ctx.heightAt(x, z));
  return m;
}

registerStructure({
  id: 'village',
  dimension: 'overworld',
  placement: { kind: 'random_spread', spacing: 34, separation: 8, salt: 10387312 },
  maxReach: REACH,
  step: 10,
  generate: generateVillage,
});

export { buildingHeight };
