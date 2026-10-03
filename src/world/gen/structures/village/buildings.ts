/**
 * Village buildings. Each building is a LocalPiece authored with its front (door side) facing local
 * north: the footprint is `sx` x `sz` including a one-block margin all around (eaves, door step);
 * walls run from x = 1..sx-2, z = 1..sz-2; the floor is local y = 0 (= road level at the door);
 * foundations are filled down to the ground and terrain above the floor is cleared.
 */
import { LocalPiece } from '../lib/piece';
import type { Builder } from '../lib/builder';
import type { StructureContext } from '../types';
import { B, stairs, wallTorch, SOUTH, NORTH, EAST, WEST } from '../lib/blocks';
import { LOOT } from '../lib/blockEntities';
import type { Palette } from './palette';

export type BuildingKind =
  | 'small_house' | 'medium_house' | 'armorer' | 'butcher' | 'cartographer' | 'fisher' | 'fletcher' | 'leatherworker'
  | 'mason' | 'shepherd' | 'toolsmith' | 'weaponsmith' | 'library' | 'temple' | 'farm' | 'lamp' | 'meeting_point';

/** [sx, sz, wall height] (sx along the street, sz away from it). */
export const SIZE: Record<BuildingKind, [number, number, number]> = {
  small_house: [7, 7, 3],
  medium_house: [9, 8, 4],
  armorer: [9, 8, 4],
  butcher: [9, 8, 4],
  cartographer: [9, 8, 4],
  fisher: [7, 8, 3],
  fletcher: [9, 8, 4],
  leatherworker: [9, 8, 4],
  mason: [9, 8, 4],
  shepherd: [9, 8, 4],
  toolsmith: [9, 8, 4],
  weaponsmith: [11, 9, 4],
  library: [11, 9, 5],
  temple: [9, 13, 5],
  farm: [9, 11, 0],
  lamp: [1, 1, 0],
  meeting_point: [11, 11, 0],
};

/** Job building -> [workstation state factory, loot table short name, villager profession]. */
const JOBS: Partial<Record<BuildingKind, [() => number, string | null, string]>> = {
  armorer: [() => B('blast_furnace', SOUTH), 'village_armorer', 'armorer'],
  butcher: [() => B('smoker', SOUTH), 'village_butcher', 'butcher'],
  cartographer: [() => B('cartography_table'), 'village_cartographer', 'cartographer'],
  fisher: [() => B('barrel', 1), 'village_fisher', 'fisherman'],
  fletcher: [() => B('fletching_table'), 'village_fletcher', 'fletcher'],
  leatherworker: [() => B('cauldron'), 'village_tannery', 'leatherworker'],
  mason: [() => B('stonecutter', SOUTH), 'village_mason', 'mason'],
  shepherd: [() => B('loom', SOUTH), 'village_shepherd', 'shepherd'],
  toolsmith: [() => B('smithing_table'), 'village_toolsmith', 'toolsmith'],
  weaponsmith: [() => B('grindstone', SOUTH), 'village_weaponsmith', 'weaponsmith'],
  library: [() => B('lectern', NORTH), null, 'librarian'],
  temple: [() => B('brewing_stand'), 'village_temple', 'cleric'],
  farm: [() => B('composter'), null, 'farmer'],
};

export const roofHeight = (sz: number) => Math.ceil(sz / 2) + 1;
export const buildingHeight = (kind: BuildingKind) => {
  const [, sz, wh] = SIZE[kind];
  if (kind === 'temple') return wh + 9;
  if (kind === 'farm' || kind === 'meeting_point') return 6;
  if (kind === 'lamp') return 5;
  return wh + 2 + roofHeight(sz);
};

export class VillageBuilding extends LocalPiece {
  constructor(
    readonly kind: BuildingKind,
    readonly pal: Palette,
    ox: number, oy: number, oz: number, rot: number, seed: number,
    /** Lowest world y the foundation may reach. */
    minY: number,
    /** Highest terrain y inside the footprint (cleared above the floor). */
    readonly topY: number,
  ) {
    super(ox, oy, oz, rot, SIZE[kind][0], Math.max(buildingHeight(kind), topY - oy + 1), SIZE[kind][1], seed, minY);
  }

  build(b: Builder, ctx: StructureContext): void {
    const { sx, sz, kind, pal } = this;
    const minY = this.box.minY;
    // 1) clear terrain above the floor, fill foundations, level the floor
    const clearTop = this.sy - 1;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        if (!b.inside(x, z)) continue;
        b.clearColumn(x, z, 1, clearTop);
        const margin = kind !== 'lamp' && (x === 0 || z === 0 || x === sx - 1 || z === sz - 1);
        if (margin) {
          // keep natural ground on the margin, level with the floor
          const g = ctx.heightAt(b.wx(x, z), b.wz(x, z));
          if (g >= this.oy) b.set(x, 0, z, pal.ground);
          else b.foundation(x, z, 0, pal.variant === 'desert' ? B('sand') : B('dirt'), minY);
          if (g >= this.oy && pal.variant !== 'desert' && pal.variant !== 'snowy') b.set(x, -1, z, B('dirt'));
        } else b.foundation(x, z, 0, pal.foundation, minY);
      }
    switch (kind) {
      case 'farm': return this.farm(b);
      case 'lamp': return this.lamp(b);
      case 'meeting_point': return this.meetingPoint(b);
      case 'weaponsmith': return this.blacksmith(b);
      case 'library': return this.library(b);
      case 'temple': return this.temple(b);
      default: return this.house(b);
    }
  }

  // ------------------------------------------------------------------------------- pieces
  private walls(b: Builder, x0: number, z0: number, x1: number, z1: number, h: number, wall = this.pal.wall): void {
    const p = this.pal;
    b.fill(x0, 0, z0, x1, 0, z1, p.floor);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
        if (!edgeX && !edgeZ) continue;
        if (edgeX && edgeZ) {
          b.fill(x, 0, z, x, h, z, p.post);
          continue;
        }
        b.set(x, 0, z, p.foundation);
        for (let y = 1; y <= h; y++) b.set(x, y, z, wall);
        // windows in the middle of each wall run, at y = 2
        const along = edgeZ ? x - x0 : z - z0, len = edgeZ ? x1 - x0 : z1 - z0;
        if (h >= 3 && along >= 2 && along <= len - 2 && (along % 2 === 0 || len <= 4)) b.set(x, 2, z, p.window);
      }
  }

  /** Gable roof over walls x0..x1, z0..z1 (ridge along x), eaves one block out. */
  private roof(b: Builder, x0: number, z0: number, x1: number, z1: number, y0: number): void {
    const p = this.pal;
    if (!p.roofStairs) {
      b.fill(x0, y0, z0, x1, y0, z1, p.roofBlock);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) b.set(x, y0 + 1, z, B(p.roofSlab, 0));
      return;
    }
    const za = z0 - 1, zb = z1 + 1;
    for (let k = 0; ; k++) {
      const zf = za + k, zr = zb - k, y = y0 + k;
      if (zf > zr) break;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (zf === zr) b.set(x, y, zf, B(p.roofSlab, 0));
        else {
          b.set(x, y, zf, stairs(p.roofStairs, SOUTH));
          b.set(x, y, zr, stairs(p.roofStairs, NORTH));
        }
      }
      // gable ends
      for (let z = zf + 1; z <= zr - 1; z++) {
        b.set(x0, y, z, p.gable);
        b.set(x1, y, z, p.gable);
      }
    }
  }

  private door(b: Builder, x: number, z: number): void {
    b.set(x, 1, z, B(this.pal.door, SOUTH));
    b.set(x, 2, z, B(this.pal.door, 8));
    b.set(x, 0, z - 1, this.pal.path);
  }

  private bed(b: Builder, x: number, zFoot: number): void {
    b.set(x, 1, zFoot, B(this.pal.bed, SOUTH));
    b.set(x, 1, zFoot + 1, B(this.pal.bed, SOUTH | 8));
  }

  private villager(b: Builder, x: number, z: number, profession: string): void {
    b.entity('villager', x, 1, z, { profession, variant: this.pal.variant });
  }

  private house(b: Builder): void {
    const { sx, sz, kind, pal } = this;
    const wh = SIZE[kind][2];
    const x0 = 1, z0 = 1, x1 = sx - 2, z1 = sz - 2;
    this.walls(b, x0, z0, x1, z1, wh);
    this.roof(b, x0, z0, x1, z1, wh + 1);
    const dx = Math.floor(sx / 2);
    this.door(b, dx, z0);
    // interior
    this.bed(b, x1 - 1, z1 - 2);
    b.set(x0 + 1, wh, z1 - 1 > z0 + 1 ? z0 + 2 : z0 + 1, wallTorch(EAST));
    const job = JOBS[kind];
    if (job) {
      b.set(x0 + 1, 1, z1 - 1, job[0]());
      if (job[1]) b.chest(x0 + 1, 1, z0 + 1, SOUTH, LOOT.village(job[1]), this.seed);
      this.villager(b, dx, z0 + 2, job[2]);
    } else {
      if (kind === 'medium_house') {
        b.set(x0 + 1, 1, z1 - 1, B('crafting_table'));
        this.bed(b, x1 - 2 > dx ? x1 - 2 : x1 - 1, z1 - 2);
      }
      if (this.rnd(0, 0, 0, 1) < 0.6) b.chest(x0 + 1, 1, z0 + 1, SOUTH, LOOT.village(pal.houseLoot), this.seed);
      this.villager(b, dx, z0 + 2, 'none');
    }
    if (kind === 'fisher') {
      // a small water barrel corner outside
      b.set(x1 - 1, 0, 0, B('water'));
    }
  }

  private blacksmith(b: Builder): void {
    const { sx, sz, pal } = this;
    // closed back room (x 1..5) and an open forge porch (x 5..9)
    this.walls(b, 1, 1, 5, sz - 2, 4);
    this.roof(b, 1, 1, 5, sz - 2, 5);
    this.door(b, 3, 1);
    b.fill(6, 0, 1, sx - 2, 0, sz - 2, B('cobblestone'));
    for (const [x, z] of [[sx - 2, 1], [sx - 2, sz - 2]]) b.fill(x, 1, z, x, 4, z, pal.post);
    b.fill(6, 5, 1, sx - 2, 5, sz - 2, B(pal.roofSlab, 0));
    // forge: lava pit behind iron bars, furnaces, anvil, grindstone
    b.fill(7, 0, sz - 3, 8, 0, sz - 3, B('lava'));
    b.fill(6, 0, sz - 2, 9, 0, sz - 2, B('cobblestone'));
    b.set(7, 1, sz - 2, B('furnace', NORTH));
    b.set(8, 1, sz - 2, B('furnace', NORTH));
    b.set(7, 1, sz - 3, B('iron_bars'));
    b.set(8, 1, sz - 3, B('iron_bars'));
    b.set(sx - 2, 1, 4, B('anvil', 0));
    b.set(6, 1, 2, B('grindstone', SOUTH));
    b.chest(2, 1, sz - 3, NORTH, LOOT.village('village_weaponsmith'), this.seed);
    this.bed(b, 4, sz - 4);
    b.set(2, 3, 3, wallTorch(EAST));
    this.villager(b, 7, 3, 'weaponsmith');
  }

  private library(b: Builder): void {
    const { sx, sz } = this;
    const wh = SIZE.library[2];
    this.walls(b, 1, 1, sx - 2, sz - 2, wh);
    this.roof(b, 1, 1, sx - 2, sz - 2, wh + 1);
    this.door(b, Math.floor(sx / 2), 1);
    for (let x = 2; x <= sx - 3; x++) for (let y = 1; y <= 3; y++) b.set(x, y, sz - 3, B('bookshelf'));
    for (let z = 3; z <= sz - 4; z++) for (let y = 1; y <= 2; y++) {
      b.set(2, y, z, B('bookshelf'));
      b.set(sx - 3, y, z, B('bookshelf'));
    }
    b.set(Math.floor(sx / 2), 1, 4, B('lectern', NORTH));
    b.set(3, 1, 2, B('crafting_table'));
    b.set(sx - 4, 4, 2, wallTorch(SOUTH));
    b.set(3, 4, 2, wallTorch(SOUTH));
    this.villager(b, Math.floor(sx / 2), 3, 'librarian');
  }

  private temple(b: Builder): void {
    const { sx, sz } = this;
    const wh = SIZE.temple[2];
    const stone = this.pal.variant === 'desert' ? B('cut_sandstone') : B('cobblestone');
    const towerZ = sz - 6;
    this.walls(b, 1, 1, sx - 2, sz - 2, wh, stone);
    // bell tower over the back part
    for (let z = towerZ; z <= sz - 2; z++)
      for (let x = 1; x <= sx - 2; x++) {
        if (x !== 1 && x !== sx - 2 && z !== towerZ && z !== sz - 2) continue;
        for (let y = wh + 1; y <= wh + 6; y++) b.set(x, y, z, (x === 1 || x === sx - 2) && (z === towerZ || z === sz - 2) ? this.pal.post : stone);
      }
    // tower belfry openings and a flat cap
    const mx = Math.floor(sx / 2), mz = Math.floor((towerZ + sz - 2) / 2);
    for (const [x, z] of [[mx, towerZ], [mx, sz - 2], [1, mz], [sx - 2, mz]]) {
      b.set(x, wh + 4, z, 0);
      b.set(x, wh + 5, z, 0);
    }
    b.fill(1, wh + 7, towerZ, sx - 2, wh + 7, sz - 2, B(this.pal.variant === 'desert' ? 'sandstone_slab' : 'cobblestone_slab', 0));
    b.fill(2, wh + 6, towerZ + 1, sx - 3, wh + 6, sz - 3, stone);
    b.set(mx, wh + 5, mz, B('bell', 1));
    b.fill(2, wh + 1, towerZ + 1, sx - 3, wh + 1, sz - 3, B('oak_planks'));
    for (let y = 1; y <= wh + 1; y++) b.set(2, y, sz - 3, B('ladder', NORTH));
    b.set(2, wh + 1, sz - 3, B('ladder', NORTH));
    b.set(2, wh + 2, sz - 3, B('ladder', NORTH));
    // nave roof
    this.roofStone(b, 1, 1, sx - 2, towerZ - 1, wh + 1);
    this.door(b, mx, 1);
    // altar
    b.set(mx, 1, towerZ - 2, B('brewing_stand'));
    b.set(mx - 1, 1, towerZ - 2, B('stone_bricks'));
    b.chest(mx + 1, 1, towerZ - 2, NORTH, LOOT.village('village_temple'), this.seed);
    for (let z = 3; z <= towerZ - 4; z += 2) {
      b.set(2, 1, z, stairs('oak_stairs', WEST));
      b.set(sx - 3, 1, z, stairs('oak_stairs', EAST));
    }
    b.set(2, 3, 2, wallTorch(EAST));
    b.set(sx - 3, 3, 2, wallTorch(WEST));
    this.villager(b, mx, towerZ - 3, 'cleric');
  }

  private roofStone(b: Builder, x0: number, z0: number, x1: number, z1: number, y0: number): void {
    const s = this.pal.variant === 'desert' ? 'sandstone_stairs' : 'cobblestone_stairs';
    const slabName = this.pal.variant === 'desert' ? 'sandstone_slab' : 'cobblestone_slab';
    // ridge along z for the nave (gable facing the street)
    const xa = x0 - 1, xb = x1 + 1;
    for (let k = 0; ; k++) {
      const xf = xa + k, xr = xb - k, y = y0 + k;
      if (xf > xr) break;
      for (let z = z0 - 1; z <= z1; z++) {
        if (xf === xr) b.set(xf, y, z, B(slabName, 0));
        else {
          b.set(xf, y, z, stairs(s, EAST));
          b.set(xr, y, z, stairs(s, WEST));
        }
      }
      for (let x = xf + 1; x <= xr - 1; x++) b.set(x, y, z0, this.pal.variant === 'desert' ? B('cut_sandstone') : B('cobblestone'));
    }
  }

  private farm(b: Builder): void {
    const { sx, sz, pal } = this;
    const border = pal.variant === 'desert' ? B('cut_sandstone') : pal.post;
    const crops = pal.variant === 'snowy' ? ['beetroots', 'potatoes'] : pal.variant === 'desert' ? ['wheat', 'beetroots'] : pal.variant === 'taiga' ? ['potatoes', 'wheat'] : ['wheat', 'carrots', 'potatoes'];
    const mid = Math.floor(sx / 2);
    for (let z = 1; z <= sz - 2; z++)
      for (let x = 1; x <= sx - 2; x++) {
        const edge = x === 1 || x === sx - 2 || z === 1 || z === sz - 2;
        if (edge) {
          b.set(x, 0, z, border);
          continue;
        }
        if (x === mid) {
          b.set(x, 0, z, B('water'));
          b.set(x, -1, z, B('dirt'));
          continue;
        }
        b.set(x, 0, z, B('farmland', 7));
        const crop = crops[(x < mid ? 0 : 1) % crops.length];
        const maxAge = crop === 'beetroots' ? 3 : 7;
        b.set(x, 1, z, B(crop, this.rint(x, 1, z, maxAge + 1, 3)));
      }
    b.set(1, 1, 1, B('composter'));
    this.villager(b, mid, 0, 'farmer');
  }

  private lamp(b: Builder): void {
    const p = this.pal;
    b.set(0, 0, 0, p.foundation);
    if (p.variant === 'desert') {
      b.set(0, 1, 0, B('sandstone_wall'));
      b.set(0, 2, 0, B('sandstone_wall'));
      b.set(0, 3, 0, B('torch', 1));
    } else {
      b.set(0, 1, 0, p.fence);
      b.set(0, 2, 0, p.fence);
      b.set(0, 3, 0, B('lantern', 0));
    }
  }

  private meetingPoint(b: Builder): void {
    const { sx, sz, pal } = this;
    const c = Math.floor(sx / 2);
    for (let z = 1; z < sz - 1; z++) for (let x = 1; x < sx - 1; x++) b.set(x, 0, z, pal.path);
    // well: 4x4 rim with water, posts and a roof
    const s = pal.variant === 'desert' ? B('sandstone') : pal.accent === B('packed_ice') ? B('stone_bricks') : B('cobblestone');
    for (let z = c - 2; z <= c + 2; z++)
      for (let x = c - 2; x <= c + 2; x++) {
        const rim = Math.abs(x - c) === 2 || Math.abs(z - c) === 2;
        b.fill(x, -3, z, x, -1, z, s);
        if (rim) b.set(x, 0, z, s), b.set(x, 1, z, s);
        else b.fill(x, -2, z, x, 0, z, B('water'));
      }
    for (const [x, z] of [[c - 2, c - 2], [c + 2, c - 2], [c - 2, c + 2], [c + 2, c + 2]]) {
      b.set(x, 2, z, pal.fence);
      b.set(x, 3, z, pal.fence);
    }
    b.fill(c - 2, 4, c - 2, c + 2, 4, c + 2, B(pal.roofSlab, 0));
    b.set(c, 4, c, pal.variant === 'desert' ? B('cut_sandstone') : pal.roofBlock);
    b.set(c, 3, c, B('bell', 1));
    for (const [x, z] of [[1, 1], [sx - 2, 1], [1, sz - 2], [sx - 2, sz - 2]]) {
      b.set(x, 1, z, pal.fence);
      b.set(x, 2, z, B('lantern', 0));
    }
    this.villager(b, c, 1, 'none');
  }
}
