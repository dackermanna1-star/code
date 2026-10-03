/**
 * Farming (Minecraft Java 1.20): hoe tilling, farmland moisture & trampling, crop growth on
 * random ticks with the vanilla growth-speed formula, stems & fruit, bone meal, saplings growing
 * into trees (world-generation tree shapes), plants popping off when their support goes.
 * Events: `boneMeal {x, y, z, player}`, `cropGrown {x, y, z, state}`, `treeGrown {x, y, z, kind}`.
 */
import { addBehavior } from '../../world/blocks/behaviors';
import { BLOCKS, BLOCK_BY_NAME, T_FULL_CUBE, T_SOLID, T_LIQUID, stateOf, type BlockDef } from '../../world/blocks/registry';
import { SetFlags, type World } from '../../world/world';
import { addItemBehavior, ITEMS, type ItemUseContext } from '../items/registry';
import { canPlantSurvive } from '../placement';
import { ChunkWriter } from '../../world/gen/common/writer';
import { TREE_REPLACEABLE, LEAF_REPLACEABLE } from '../../world/gen/common/states';
import { growTree, TreeKind } from '../../world/gen/overworld/trees';
import { gameFor, play, rawBrightness, destroyBlock, consumeUsed, damageUsed, H4, blockName } from './context';

const id = (n: string) => BLOCK_BY_NAME.get(n)!.id;
const FARMLAND = id('farmland');

/** Crops: block id -> max age */
export const CROP_MAX_AGE: Record<string, number> = { wheat: 7, carrots: 7, potatoes: 7, beetroots: 3 };

/** Minimal world view used by the pure growth helpers (tests pass a fake). */
export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * CropBlock.getGrowthSpeed: 1 + farmland under the crop (1 dry / 3 moist) + 1/4 of that for each of
 * the 8 surrounding farmland blocks, halved when same crops are planted in rows on both axes or diagonally.
 */
export function cropGrowthSpeed(w: BlockReader, x: number, y: number, z: number, cropId: number): number {
  let f = 1;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      let g = 0;
      const s = w.getBlock(x + i, y - 1, z + j);
      if (s >>> 4 === FARMLAND) g = (s & 15) > 0 ? 3 : 1;
      if (i !== 0 || j !== 0) g /= 4;
      f += g;
    }
  const same = (dx: number, dz: number) => w.getBlock(x + dx, y, z + dz) >>> 4 === cropId;
  const ew = same(-1, 0) || same(1, 0);
  const ns = same(0, -1) || same(0, 1);
  if (ew && ns) f /= 2;
  else if (same(-1, -1) || same(1, -1) || same(1, 1) || same(-1, 1)) f /= 2;
  return f;
}

/** Probability that one random tick advances a crop: 1 / (floor(25 / f) + 1). */
export function cropGrowthChance(speed: number): number {
  return 1 / (Math.floor(25 / speed) + 1);
}

/** Is there water within the vanilla 9x2x9 box (y and y+1) around farmland? */
function nearWater(w: World, x: number, y: number, z: number) {
  for (let dy = 0; dy <= 1; dy++)
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) if (T_LIQUID[w.getBlock(x + dx, y + dy, z + dz) >>> 4] === 1) return true;
  return false;
}

function rainingAt(w: World, x: number, y: number, z: number) {
  const g = gameFor(w);
  return !!g && g.weather.raining && g.dimension === 'overworld' && y >= w.getHeight(x, z);
}

function toDirt(w: World, x: number, y: number, z: number) {
  w.setBlock(x, y, z, stateOf(id('dirt'), 0), SetFlags.ALL);
  // push entities standing in the farmland up
  const g = gameFor(w);
  if (g) for (const e of g.entities.list) if (Math.floor(e.pos.x) === x && Math.floor(e.pos.z) === z && e.pos.y > y && e.pos.y < y + 1) e.setPos(e.pos.x, y + 1, e.pos.z);
}

// ------------------------------------------------------------------------------------- trees
/** World-backed ChunkWriter that records writes so a tree can be validated before placing. */
class TreeWriter extends ChunkWriter {
  readonly writes = new Map<string, [number, number, number, number]>();
  blockedTrunk = false;
  constructor(private world: World, private cleared: Set<string>, private trunk: Set<string>) {
    super();
  }
  override inside() { return true; }
  override intersects() { return true; }
  override get(x: number, y: number, z: number): number {
    if (y < 0 || y > 255) return -1;
    const k = `${x},${y},${z}`;
    const w = this.writes.get(k);
    if (w) return w[3];
    if (this.cleared.has(k)) return 0;
    return this.world.getBlock(x, y, z);
  }
  override set(x: number, y: number, z: number, state: number) {
    if (y < 0 || y > 255) return;
    this.writes.set(`${x},${y},${z}`, [x, y, z, state]);
  }
  override log(x: number, y: number, z: number, state: number) {
    const cur = this.get(x, y, z);
    if (cur >= 0 && TREE_REPLACEABLE[cur >>> 4]) this.set(x, y, z, state);
    else if (this.trunk.has(`${x},${z}`)) this.blockedTrunk = true;
  }
  override leaf(x: number, y: number, z: number, state: number) {
    const cur = this.get(x, y, z);
    if (cur >= 0 && LEAF_REPLACEABLE[cur >>> 4]) this.set(x, y, z, state);
  }
  override air(x: number, y: number, z: number, state: number) {
    if (this.get(x, y, z) === 0) this.set(x, y, z, state);
  }
  override replace(x: number, y: number, z: number, state: number, table: Uint8Array) {
    const cur = this.get(x, y, z);
    if (cur >= 0 && table[cur >>> 4]) this.set(x, y, z, state);
  }
  override blockEntity() {}
  override entity() {}
}

/** Try to grow a tree of `kind` with its base at (x, y, z). `saplings` are cleared first. Returns success. */
export function placeTree(world: World, kind: TreeKind, x: number, y: number, z: number, saplings: [number, number, number][]): boolean {
  if (y + 2 >= 256) return false;
  const cleared = new Set(saplings.map(([a, b, c]) => `${a},${b},${c}`));
  const trunk = new Set(saplings.map(([a, , c]) => `${a},${c}`));
  const w = new TreeWriter(world, cleared, trunk);
  growTree(kind, w, x, y, z, (Math.random() * 0x7fffffff) | 0);
  let logs = 0;
  for (const [, , , s] of w.writes.values()) if (BLOCKS[s >>> 4].tags.includes('logs') || BLOCKS[s >>> 4].name === 'mushroom_stem') logs++;
  if (w.blockedTrunk || logs === 0) return false;
  // the first trunk block must be placeable
  for (const [a, b, c] of saplings) world.setBlock(a, b, c, 0, SetFlags.ALL);
  for (const [a, b, c, s] of w.writes.values()) world.setBlock(a, b, c, s, SetFlags.ALL);
  gameFor(world)?.events.emit('treeGrown', { x, y, z, kind });
  return true;
}

/** Find the north-west corner of a 2x2 square of identical saplings containing (x,z), or null. */
function bigSaplingCorner(w: World, x: number, y: number, z: number, sid: number): [number, number] | null {
  for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const bx = x + ox, bz = z + oz;
    if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dz]) => w.getBlock(bx + dx, y, bz + dz) >>> 4 === sid)) return [bx, bz];
  }
  return null;
}

/** SaplingBlock.advanceTree: stage 0 -> 1, then grow. */
export function growSapling(world: World, x: number, y: number, z: number, state: number): boolean {
  if (!(state & 8)) {
    world.setBlock(x, y, z, state | 8, SetFlags.NONE);
    return true;
  }
  const name = BLOCKS[state >>> 4].name.replace('_sapling', '');
  const sid = state >>> 4;
  const big = bigSaplingCorner(world, x, y, z, sid);
  const square = (bx: number, bz: number): [number, number, number][] => [[bx, y, bz], [bx + 1, y, bz], [bx, y, bz + 1], [bx + 1, y, bz + 1]];
  if (big && (name === 'spruce' || name === 'jungle' || name === 'dark_oak')) {
    const kind = name === 'spruce' ? TreeKind.MEGA_SPRUCE : name === 'jungle' ? TreeKind.MEGA_JUNGLE : TreeKind.DARK_OAK;
    if (placeTree(world, kind, big[0], y, big[1], square(big[0], big[1]))) return true;
  }
  const single: Record<string, TreeKind> = {
    oak: Math.random() < 0.1 ? TreeKind.FANCY_OAK : TreeKind.OAK, birch: TreeKind.BIRCH, spruce: TreeKind.SPRUCE,
    jungle: TreeKind.JUNGLE, acacia: TreeKind.ACACIA, cherry: TreeKind.CHERRY,
  };
  const kind = single[name];
  if (kind === undefined) return false;
  return placeTree(world, kind, x, y, z, [[x, y, z]]);
}

// ------------------------------------------------------------------------------------- bone meal
function boneMealGrass(world: World, x: number, y: number, z: number) {
  const grass = stateOf(id('short_grass'), 0);
  const flowers = ['dandelion', 'poppy'];
  for (let i = 0; i < 128; i++) {
    let px = x, py = y + 1, pz = z;
    let ok = true;
    for (let j = 0; j < i / 16; j++) {
      px += Math.floor(Math.random() * 3) - 1;
      py += Math.floor((Math.floor(Math.random() * 3) - 1) * Math.floor(Math.random() * 3) / 2);
      pz += Math.floor(Math.random() * 3) - 1;
      if (blockName(world.getBlock(px, py - 1, pz)) !== 'grass_block' || T_SOLID[world.getBlock(px, py, pz) >>> 4]) { ok = false; break; }
    }
    if (!ok || world.getBlock(px, py, pz) !== 0 || blockName(world.getBlock(px, py - 1, pz)) !== 'grass_block') continue;
    const st = Math.random() < 0.125 ? stateOf(id(flowers[Math.floor(Math.random() * flowers.length)]), 0) : grass;
    world.setBlock(px, py, pz, st, SetFlags.ALL);
  }
}

/** Apply bone meal to the block. Returns true if it was used. */
export function applyBoneMeal(world: World, x: number, y: number, z: number): boolean {
  const st = world.getBlock(x, y, z);
  if (!st) return false;
  const def = BLOCKS[st >>> 4];
  const n = def.name;
  const max = CROP_MAX_AGE[n];
  if (max !== undefined) {
    const age = st & 15;
    if (age >= max) return false;
    let inc = 2 + Math.floor(Math.random() * 4);
    if (n === 'beetroots') inc = Math.floor(inc / 3);
    world.setBlock(x, y, z, (st & ~15) | Math.min(max, age + inc), SetFlags.ALL);
    return true;
  }
  if (def.shape === 'stem') {
    const age = st & 7;
    if (age >= 7) return false;
    const na = Math.min(7, age + 2 + Math.floor(Math.random() * 4));
    world.setBlock(x, y, z, (st & ~7) | na, SetFlags.ALL);
    if (na === 7) stemTick(world, x, y, z, world.getBlock(x, y, z), true);
    return true;
  }
  if (def.tags.includes('sapling')) {
    if (Math.random() < 0.45) growSapling(world, x, y, z, st);
    return true;
  }
  if (n === 'sweet_berry_bush') {
    if ((st & 3) >= 3) return false;
    world.setBlock(x, y, z, st + 1, SetFlags.ALL);
    return true;
  }
  if (n === 'grass_block') {
    if (world.getBlock(x, y + 1, z) !== 0) return false;
    boneMealGrass(world, x, y, z);
    return true;
  }
  if (n === 'short_grass' || n === 'fern') {
    if (world.getBlock(x, y + 1, z) !== 0) return false;
    const tall = id(n === 'fern' ? 'large_fern' : 'tall_grass');
    world.setBlock(x, y, z, stateOf(tall, 0), SetFlags.ALL);
    world.setBlock(x, y + 1, z, stateOf(tall, 8), SetFlags.ALL);
    return true;
  }
  if (n === 'brown_mushroom' || n === 'red_mushroom') {
    if (Math.random() < 0.4) {
      world.setBlock(x, y, z, 0, SetFlags.ALL);
      if (!placeTree(world, n === 'red_mushroom' ? TreeKind.RED_MUSHROOM : TreeKind.BROWN_MUSHROOM, x, y, z, [])) world.setBlock(x, y, z, st, SetFlags.ALL);
    }
    return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------- stems
function stemTick(world: World, x: number, y: number, z: number, st: number, force = false) {
  if (!force) {
    if (rawBrightness(world, x, y, z) < 9) return;
    const f = cropGrowthSpeed(world, x, y, z, st >>> 4);
    if (Math.random() >= cropGrowthChance(f)) return;
  }
  const age = st & 7;
  if (age < 7) { world.setBlock(x, y, z, st + 1, SetFlags.ALL); return; }
  const fruit = id(BLOCKS[st >>> 4].name === 'pumpkin_stem' ? 'pumpkin' : 'melon');
  for (const [dx, dz] of H4) if (world.getBlock(x + dx, y, z + dz) >>> 4 === fruit) return; // already attached
  const [dx, dz] = H4[Math.floor(Math.random() * 4)];
  const below = BLOCKS[world.getBlock(x + dx, y - 1, z + dz) >>> 4];
  if (world.getBlock(x + dx, y, z + dz) === 0 && (below.tags.includes('dirt') || below.id === FARMLAND)) {
    world.setBlock(x + dx, y, z + dz, stateOf(fruit, 0), SetFlags.ALL);
  }
}

// ------------------------------------------------------------------------------------- install
let installed = false;
export function installFarming() {
  if (installed) return;
  installed = true;

  // hoe: till dirt/grass/path into farmland, coarse dirt into dirt
  addItemBehavior((d) => d.tool?.type === 'hoe', {
    useOnBlock(ctx: ItemUseContext) {
      const h = ctx.hit;
      if (!h || h.face === 0) return false;
      const w = ctx.game.world as World;
      const st = w.getBlock(h.x, h.y, h.z);
      const n = blockName(st);
      if (w.getBlock(h.x, h.y + 1, h.z) !== 0) return false;
      let to: number | null = null;
      if (n === 'grass_block' || n === 'dirt' || n === 'dirt_path') to = stateOf(FARMLAND, 0);
      else if (n === 'coarse_dirt') to = stateOf(id('dirt'), 0);
      if (to === null) return false;
      w.setBlock(h.x, h.y, h.z, to, SetFlags.ALL);
      play(ctx.game, 'item.hoe.till', h.x + 0.5, h.y + 1, h.z + 0.5);
      damageUsed(ctx.player, ctx.hand);
      return true;
    },
  });

  // bone meal
  if (ITEMS.some((d) => d.name === 'bone_meal')) {
    addItemBehavior('bone_meal', {
      useOnBlock(ctx: ItemUseContext) {
        const h = ctx.hit;
        if (!h) return false;
        if (!applyBoneMeal(ctx.game.world, h.x, h.y, h.z)) return false;
        play(ctx.game, 'item.bonemeal.use', h.x + 0.5, h.y + 0.5, h.z + 0.5);
        ctx.game.events.emit('boneMeal', { x: h.x, y: h.y, z: h.z, player: ctx.player });
        consumeUsed(ctx.player, ctx.stack, ctx.hand);
        return true;
      },
    });
  }

  // farmland
  addBehavior('farmland', {
    onRandomTick(w, x, y, z, st) {
      const m = st & 15;
      if (!nearWater(w, x, y, z) && !rainingAt(w, x, y + 1, z)) {
        if (m > 0) w.setBlock(x, y, z, (st & ~15) | (m - 1), SetFlags.NOTIFY);
        else {
          const above = BLOCKS[w.getBlock(x, y + 1, z) >>> 4];
          if (!(above.shape === 'crop' || above.shape === 'stem')) toDirt(w, x, y, z);
        }
      } else if (m < 7) w.setBlock(x, y, z, (st & ~15) | 7, SetFlags.NOTIFY);
    },
    onNeighborChange(w, x, y, z, _st, fx, fy, fz) {
      if (fx === x && fy === y + 1 && fz === z) {
        const a = w.getBlock(x, y + 1, z);
        if (T_FULL_CUBE[a >>> 4] || (T_SOLID[a >>> 4] && BLOCKS[a >>> 4].shape !== 'fence_gate' && BLOCKS[a >>> 4].shape !== 'crop' && BLOCKS[a >>> 4].shape !== 'stem')) toDirt(w, x, y, z);
      }
    },
    onEntityFall(w, x, y, z, _st, e, dist) {
      const g = gameFor(w);
      if (!g || e.dead === undefined) return; // living entities only
      const isPlayer = e === g.player;
      if (!isPlayer && !g.gamerules.mobGriefing) return;
      if (Math.random() < dist - 0.5 && e.width * e.width * e.height > 0.512) toDirt(w, x, y, z);
    },
  });

  // crops
  for (const [name, max] of Object.entries(CROP_MAX_AGE)) {
    const cid = id(name);
    addBehavior(name, {
      onRandomTick(w, x, y, z, st) {
        if (rawBrightness(w, x, y, z) < 9) return;
        if (name === 'beetroots' && Math.random() < 2 / 3) return;
        const age = st & 15;
        if (age >= max) return;
        const f = cropGrowthSpeed(w, x, y, z, cid);
        if (Math.random() < cropGrowthChance(f)) {
          w.setBlock(x, y, z, (st & ~15) | (age + 1), SetFlags.NOTIFY);
          gameFor(w)?.events.emit('cropGrown', { x, y, z, state: w.getBlock(x, y, z) });
        }
      },
    });
  }
  addBehavior(['pumpkin_stem', 'melon_stem'], {
    onRandomTick(w, x, y, z, st) {
      stemTick(w, x, y, z, st);
    },
  });

  // saplings
  addBehavior('#sapling', {
    onRandomTick(w, x, y, z, st) {
      if (rawBrightness(w, x, y + 1, z) >= 9 && Math.random() < 1 / 7) growSapling(w, x, y, z, st);
    },
  });

  // plants pop off when the block below is removed/changed
  const plants = (n: string) => {
    const d: BlockDef | undefined = BLOCK_BY_NAME.get(n);
    if (!d) return false;
    if (n === 'kelp' || n === 'seagrass' || n === 'weeping_vines' || n === 'twisting_vines' || n === 'vine' || n === 'glow_lichen' || n === 'lily_pad' || n === 'amethyst_cluster') return false;
    return d.shape === 'crop' || d.shape === 'stem' || d.shape === 'cross' || d.name === 'cactus' || d.name === 'sugar_cane';
  };
  addBehavior(plants, {
    onNeighborChange(w, x, y, z, st, fx, fy, fz) {
      if (fx !== x || fz !== z || fy !== y - 1) return;
      if (!canPlantSurvive(BLOCKS[st >>> 4], w, x, y, z)) destroyBlock(w, x, y, z, true);
    },
  });
}
