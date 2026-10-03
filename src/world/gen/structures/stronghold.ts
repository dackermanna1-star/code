/**
 * Stronghold (Minecraft `StrongholdPieces`, simplified): a network of stone-brick corridors,
 * turns, stairs, prison halls, room crossings, chest corridors and libraries grown from a start
 * staircase, always containing exactly one End portal room (12 `end_portal_frame` blocks, each
 * with a 10 % chance of an eye, around a lava pool, plus a silverfish spawner on the stairs).
 *
 * Placement: vanilla concentric rings (distance 32, spread 3, count 128: 3 strongholds on the
 * first ring at ~1280-2816 blocks, 6 on the second, 10 on the third ...), nudged onto land.
 * `locateStructure('stronghold', x, z)` on the overworld generator (or `locateStronghold(seed, x,
 * z)` from `src/world/gen/locate.ts`) returns the centre of the nearest portal room (the block
 * position of the portal's centre, at the frame's y) — use it for eyes of ender.
 */
import { Rng } from '../../../core/rng';
import { BIOMES } from '../../biomes';
import { registerStructure } from './registry';
import { type BlockBox, type StructureContext, type StructurePiece, type StructureStart, boxUnion } from './types';
import { LocalPiece } from './lib/piece';
import { originFor, rotOffset, type Builder } from './lib/builder';
import { B, stairs, wallTorch, SOUTH, NORTH, EAST, WEST } from './lib/blocks';
import { LOOT } from './lib/blockEntities';

type Kind = 'corridor' | 'chest_corridor' | 'prison' | 'turn_left' | 'turn_right' | 'crossing' | 'stairs' | 'library' | 'portal';

/** Local dimensions [sx, sy, sz], entrance x and entrance floor y. */
const DIM: Record<Kind, [number, number, number, number, number]> = {
  corridor: [5, 5, 7, 2, 0],
  chest_corridor: [5, 5, 7, 2, 0],
  prison: [9, 5, 11, 2, 0],
  turn_left: [5, 5, 5, 2, 0],
  turn_right: [5, 5, 5, 2, 0],
  crossing: [11, 7, 11, 5, 0],
  stairs: [5, 11, 10, 2, 6],
  library: [14, 6, 15, 4, 0],
  portal: [11, 8, 16, 5, 0],
};

/** Exits: local wall cell (x, floorY, z) and local travel direction (hfacing). */
const EXITS: Record<Kind, [number, number, number, number][]> = {
  corridor: [[2, 0, 6, SOUTH]],
  chest_corridor: [[2, 0, 6, SOUTH]],
  prison: [[2, 0, 10, SOUTH]],
  turn_left: [[4, 0, 2, EAST]],
  turn_right: [[0, 0, 2, WEST]],
  crossing: [[5, 0, 10, SOUTH], [0, 0, 5, WEST], [10, 0, 5, EAST]],
  stairs: [[2, 0, 9, SOUTH]],
  library: [],
  portal: [],
};

const WEIGHTS: [Kind, number][] = [
  ['corridor', 40], ['chest_corridor', 5], ['prison', 5], ['turn_left', 20], ['turn_right', 20], ['crossing', 10], ['stairs', 8], ['library', 5], ['portal', 20],
];

const bricks = (r: number) => (r < 0.12 ? B('cracked_stone_bricks') : r < 0.3 ? B('mossy_stone_bricks') : B('stone_bricks'));

class StrongholdPiece extends LocalPiece {
  constructor(readonly kind: Kind, ox: number, oy: number, oz: number, rot: number, seed: number, readonly door: number) {
    super(ox, oy, oz, rot, DIM[kind][0], DIM[kind][1], DIM[kind][2], seed);
  }

  private wall(b: Builder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    b.shell(x0, y0, z0, x1, y1, z1, (x, y, z) => bricks(this.rnd(x, y, z, 1)), 0);
  }

  /** Small door in the entrance wall (local z = 0). */
  private entrance(b: Builder, ex: number, fy: number) {
    b.fill(ex - 1, fy + 1, 0, ex + 1, fy + 3, 0, (x, y, z) => bricks(this.rnd(x, y, z, 2)));
    b.set(ex, fy + 1, 0, 0);
    b.set(ex, fy + 2, 0, 0);
    if (this.door === 1) {
      b.set(ex, fy + 1, 0, B('oak_door', SOUTH));
      b.set(ex, fy + 2, 0, B('oak_door', 8));
    } else if (this.door === 2) {
      b.set(ex - 1, fy + 1, 0, B('iron_bars'));
      b.set(ex - 1, fy + 2, 0, B('iron_bars'));
      b.set(ex + 1, fy + 1, 0, B('iron_bars'));
      b.set(ex + 1, fy + 2, 0, B('iron_bars'));
      b.set(ex, fy + 3, 0, B('iron_bars'));
    }
  }

  /** Open an exit hole (children overwrite it with their own entrance door). */
  private hole(b: Builder, x: number, fy: number, z: number) {
    b.set(x, fy + 1, z, 0);
    b.set(x, fy + 2, z, 0);
  }

  build(b: Builder, _ctx: StructureContext): void {
    const [sx, sy, sz, ex, ey] = DIM[this.kind];
    switch (this.kind) {
      case 'corridor':
      case 'chest_corridor':
        this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
        if (this.rnd(0, 0, 0, 3) < 0.5) b.set(1, 2, 3, wallTorch(EAST));
        if (this.kind === 'chest_corridor') {
          b.set(3, 1, 3, B('stone_brick_slab', 0));
          b.chest(3, 2, 3, WEST, LOOT.strongholdCorridor, this.seed);
        }
        break;
      case 'turn_left':
      case 'turn_right':
        this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
        break;
      case 'prison': {
        this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
        // cell block along x 4..8: bars facing the corridor, separated by brick walls
        for (let z = 1; z <= 9; z++) for (let y = 1; y <= 3; y++) b.set(4, y, z, z === 4 || z === 8 ? bricks(this.rnd(4, y, z, 4)) : B('iron_bars'));
        for (const z of [4, 8]) for (let x = 5; x <= 7; x++) for (let y = 1; y <= 3; y++) b.set(x, y, z, bricks(this.rnd(x, y, z, 5)));
        for (const z of [2, 6]) {
          b.set(4, 1, z, B('iron_door', WEST));
          b.set(4, 2, z, B('iron_door', 8));
        }
        break;
      }
      case 'crossing': {
        this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
        const t = this.rint(0, 0, 0, 3, 6);
        if (t === 0) {
          // pillar with torches
          b.fill(5, 1, 5, 5, sy - 2, 5, B('stone_bricks'));
          b.set(4, 3, 5, wallTorch(WEST));
          b.set(6, 3, 5, wallTorch(EAST));
          b.set(5, 3, 4, wallTorch(NORTH));
          b.set(5, 3, 6, wallTorch(SOUTH));
        } else if (t === 1) {
          // fountain
          for (let x = 3; x <= 7; x++) for (let z = 3; z <= 7; z++) if (x === 3 || x === 7 || z === 3 || z === 7) b.set(x, 1, z, B('smooth_stone_slab', 0));
          b.fill(5, 1, 5, 5, 3, 5, B('stone_bricks'));
          b.set(5, 4, 5, B('water'));
        } else {
          // gallery with a chest
          for (let x = 1; x <= 9; x++) b.set(x, 3, 1, B('stone_brick_slab', 1));
          b.fill(1, 1, 1, 1, 2, 1, B('stone_bricks'));
          b.set(2, 4, 1, B('torch', 1));
          b.chest(3, 4, 1, SOUTH, LOOT.strongholdCrossing, this.seed);
        }
        for (const [x, , z] of EXITS.crossing) this.hole(b, x, 0, z);
        break;
      }
      case 'stairs': {
        b.fill(0, 0, 0, sx - 1, sy - 1, sz - 1, (x, y, z) => bricks(this.rnd(x, y, z, 7)));
        for (let z = 1; z <= 8; z++) {
          const fy = Math.max(0, 7 - z);
          b.fill(1, fy + 1, z, 3, Math.min(sy - 2, fy + 4), z, 0);
          if (z >= 2 && z <= 7) for (let x = 1; x <= 3; x++) b.set(x, fy, z, stairs('stone_brick_stairs', NORTH));
        }
        break;
      }
      case 'library': {
        this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
        for (let z = 1; z < sz - 1; z++)
          for (let y = 1; y <= 3; y++) {
            if (z % 4 !== 0) {
              b.set(1, y, z, B('bookshelf'));
              b.set(sx - 2, y, z, B('bookshelf'));
            }
          }
        for (let z = 3; z <= sz - 4; z++) if (z !== 7) for (let y = 1; y <= 3; y++) for (const x of [5, 6, 8]) if (x !== 8 || z % 2) b.set(x, y, z, B('bookshelf'));
        for (let z = 1; z < sz - 1; z++) for (let x = 1; x < sx - 1; x++) if (this.rnd(x, 4, z, 8) < 0.07) b.set(x, 4, z, B('cobweb'));
        b.set(6, 4, 7, B('torch', 1));
        b.set(7, 1, 7, B('oak_planks'));
        b.chest(sx - 3, 1, sz - 2, NORTH, LOOT.strongholdLibrary, this.seed);
        b.set(3, 1, sz - 2, B('crafting_table'));
        break;
      }
      case 'portal':
        this.portalRoom(b);
        break;
    }
    this.entrance(b, ex, ey);
  }

  private portalRoom(b: Builder) {
    const [sx, sy, sz] = DIM.portal;
    this.wall(b, 0, 0, 0, sx - 1, sy - 1, sz - 1);
    // barred windows high on the side walls
    for (let z = 2; z < sz - 2; z += 3) for (const x of [0, sx - 1]) b.set(x, 4, z, B('iron_bars'));
    // lava strips along the side walls
    for (let z = 2; z <= sz - 3; z++) for (const x of [1, sx - 2]) b.set(x, 0, z, B('lava'));
    // stairs up to the platform
    for (let x = 4; x <= 6; x++) {
      b.set(x, 1, 4, stairs('stone_brick_stairs', SOUTH));
      b.set(x, 1, 5, B('stone_bricks'));
      b.set(x, 2, 5, stairs('stone_brick_stairs', SOUTH));
      b.fill(x, 1, 6, x, 2, 6, B('stone_bricks'));
      b.set(x, 3, 6, stairs('stone_brick_stairs', SOUTH));
      b.fill(x, 1, 7, x, 3, 7, B('stone_bricks'));
    }
    // platform under the frame, lava pool inside it
    b.fill(3, 1, 8, 7, 2, 12, B('stone_bricks'));
    b.fill(4, 2, 9, 6, 2, 11, B('lava'));
    // the 12 frame blocks, facing the centre; 10 % chance of an eye each
    let eyes = 0;
    const frame = (x: number, z: number, facing: number) => {
      const eye = this.rnd(x, 3, z, 9) < 0.1;
      if (eye) eyes++;
      b.set(x, 3, z, B('end_portal_frame', facing | (eye ? 4 : 0)));
    };
    for (let x = 4; x <= 6; x++) {
      frame(x, 8, SOUTH);
      frame(x, 12, NORTH);
    }
    for (let z = 9; z <= 11; z++) {
      frame(3, z, EAST);
      frame(7, z, WEST);
    }
    if (eyes === 12) b.fill(4, 3, 9, 6, 3, 11, B('end_portal'));
    // silverfish spawner at the top of the stairs
    b.spawner(5, 4, 7, 'silverfish');
    b.set(2, 4, 13, wallTorch(EAST));
    b.set(8, 4, 13, wallTorch(WEST));
  }
}

interface Exit {
  x: number;
  y: number;
  z: number;
  h: number;
  depth: number;
  parent: StrongholdPiece;
}

function makePiece(kind: Kind, e: { x: number; y: number; z: number; h: number }, seed: number, door: number): StrongholdPiece {
  const [sx, , sz, ex, ey] = DIM[kind];
  const rot = e.h & 3; // local +z (south) travels toward e.h
  const [ox, oz] = originFor(e.x, e.z, rot, sx, sz, ex, 0);
  return new StrongholdPiece(kind, ox, e.y - ey, oz, rot, seed, door);
}

function exitsOf(p: StrongholdPiece, depth: number): Exit[] {
  return EXITS[p.kind].map(([lx, ly, lz, lh]) => {
    const [dx, dz] = rotOffset(p.rot, p.sx, p.sz, lx, lz);
    return { x: p.ox + dx, y: p.oy + ly, z: p.oz + dz, h: (lh + p.rot) & 3, depth, parent: p };
  });
}

const inner = (b: BlockBox): BlockBox => ({ minX: b.minX + 1, minY: b.minY + 1, minZ: b.minZ + 1, maxX: b.maxX - 1, maxY: b.maxY - 1, maxZ: b.maxZ - 1 });
const hit = (a: BlockBox, b: BlockBox) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

const MAX_PIECES = 50;
const RADIUS = 112;

function layout(x: number, y: number, z: number, h: number, r: Rng, forcePortalAtStart: boolean): StrongholdPiece[] | null {
  const pieces: StrongholdPiece[] = [];
  const start = makePiece('stairs', { x, y: y, z, h }, r.nextU32(), 0);
  pieces.push(start);
  const fits = (p: StrongholdPiece) => {
    const b = p.box;
    if (b.minY < 6 || b.maxY > 100) return false;
    if (Math.max(Math.abs(b.minX - x), Math.abs(b.maxX - x), Math.abs(b.minZ - z), Math.abs(b.maxZ - z)) > RADIUS) return false;
    const ib = inner(b);
    for (const o of pieces) if (hit(ib, o.box)) return false;
    return true;
  };
  const queue: Exit[] = exitsOf(start, 1);
  const dead: Exit[] = [];
  let hasPortal = false, libraries = 0;
  if (forcePortalAtStart) {
    const e = queue.shift()!;
    const p = makePiece('portal', e, r.nextU32(), 0);
    if (!fits(p)) return null;
    pieces.push(p);
    hasPortal = true;
  }
  while (queue.length && pieces.length < MAX_PIECES) {
    const e = queue.splice(r.int(Math.min(queue.length, 3)), 1)[0];
    if (e.depth > 12) {
      dead.push(e);
      continue;
    }
    let placed = false;
    for (let tries = 0; tries < 5 && !placed; tries++) {
      let total = 0;
      const ws = WEIGHTS.map(([k, w]) => {
        let ww = w;
        if (k === 'portal' && (hasPortal || pieces.length < 12)) ww = 0;
        if (k === 'library' && libraries >= 2) ww = 0;
        total += ww;
        return [k, ww] as [Kind, number];
      });
      let pick = r.next() * total;
      let kind: Kind = 'corridor';
      for (const [k, w] of ws) if ((pick -= w) < 0) { kind = k; break; }
      const p = makePiece(kind, e, r.nextU32(), r.int(3));
      if (!fits(p)) continue;
      pieces.push(p);
      placed = true;
      if (kind === 'portal') hasPortal = true;
      if (kind === 'library') libraries++;
      queue.push(...exitsOf(p, e.depth + 1));
    }
    if (!placed) dead.push(e);
  }
  if (!hasPortal) {
    for (const e of [...queue, ...dead]) {
      const p = makePiece('portal', e, r.nextU32(), 0);
      if (fits(p)) {
        pieces.push(p);
        hasPortal = true;
        break;
      }
    }
  }
  return hasPortal ? pieces : null;
}

const BAD_BIOME = new Set(['ocean', 'river', 'beach']);

registerStructure({
  id: 'stronghold',
  dimension: 'overworld',
  placement: {
    kind: 'concentric_rings', distance: 32, spread: 3, count: 128, salt: 0x57a0d6,
    biomeOk: (b) => !BAD_BIOME.has(BIOMES[b].category),
  },
  maxReach: 9,
  step: 0,
  generate(ctx, chunkX, chunkZ, r): StructureStart | null {
    const x = chunkX * 16 + 4 + r.int(8), z = chunkZ * 16 + 4 + r.int(8);
    const surface = ctx.heightAt(x, z);
    const y = Math.max(20, Math.min(48, (surface > 0 ? surface : 63) - 25 - r.int(10)));
    const h = r.int(4);
    let pieces: StrongholdPiece[] | null = null;
    for (let attempt = 0; attempt < 6 && !pieces; attempt++) pieces = layout(x, y, z, h, new Rng(r.nextU32()), false);
    if (!pieces) pieces = layout(x, y, z, h, new Rng(r.nextU32()), true);
    if (!pieces) return null;
    const portal = pieces.find((p) => p.kind === 'portal')!;
    const [cx, cz] = rotOffset(portal.rot, portal.sx, portal.sz, 5, 10);
    const all: StructurePiece[] = pieces;
    return {
      type: 'stronghold', chunkX, chunkZ,
      x: portal.ox + cx, y: portal.oy + 3, z: portal.oz + cz,
      pieces: all, box: boxUnion(pieces.map((p) => p.box)), clearsVegetation: false,
    };
  },
});
