/**
 * Block-derived particle data: which texture layer a block's crumbs use (Minecraft's model
 * "particle" texture), biome tint, cutout flag, and cached simplified collision boxes for
 * point-vs-voxel particle collision.
 */
import { BLOCKS, T_FULL_CUBE, T_LIQUID, T_SOLID, facesFor } from '../../world/blocks/registry';
import { getCollisionBoxes } from '../../world/blocks/models';
import { textureLayer } from '../materials/textureList';

export interface BlockParticleInfo {
  /** Main particle texture layer. */
  layer: number;
  /** Secondary (top face) layer used for a fraction of the crumbs (grass on grass blocks), or -1. */
  topLayer: number;
  /** 0 none, 1 grass, 2 foliage, 3 water, 4 constant (`tint`). */
  tintMode: number;
  tint: number;
  /** Whether the top layer is tinted (grass block top) while the main one is not. */
  topTinted: boolean;
  /** Cutout texture (alpha = opacity): crumbs alpha-test and tint every texel. */
  cutout: boolean;
  /** Approximate surface roughness class for sparks (metal) / sounds. */
  metal: boolean;
}

const infoCache = new Map<number, BlockParticleInfo>();

/** Particle texture info for a block state. */
export function blockParticleInfo(state: number): BlockParticleInfo {
  let inf = infoCache.get(state);
  if (inf) return inf;
  const def = BLOCKS[state >>> 4] ?? BLOCKS[0];
  const f = facesFor(def, state & 15);
  let main = f.north;
  let top = -1;
  let topTinted = false;
  if (def.shape === 'grass_block') {
    main = 'dirt';
    top = textureLayer(f.up);
    topTinted = true;
  } else if (def.shape === 'liquid') {
    main = f.up;
  } else if (def.shape === 'cube' && f.up !== f.north && /_log$|_stem$/.test(def.name) === false && /top/.test(f.up)) {
    // blocks with a distinct top (tnt, pumpkins, crafting table...): occasionally use it
    top = textureLayer(f.up);
  }
  const t = def.tint;
  const tintMode = t === 'none' ? 0 : t === 'grass' ? 1 : t === 'foliage' ? 2 : t === 'water' ? 3 : 4;
  inf = {
    layer: textureLayer(main),
    topLayer: top,
    tintMode,
    tint: typeof t === 'number' ? t : 0xffffff,
    topTinted,
    cutout: def.layer === 'cutout',
    metal: def.sound === 'metal' || def.sound === 'anvil' || def.sound === 'chain' || def.sound === 'lantern',
  };
  infoCache.set(state, inf);
  return inf;
}

/** Minimal world surface needed by particles. */
export interface ParticleWorld {
  getBlock(x: number, y: number, z: number): number;
  getLight(x: number, y: number, z: number): number;
  getChunk(cx: number, cz: number): { grassColor: Uint32Array; foliageColor: Uint32Array; waterColor: Uint32Array; biomes: Uint8Array } | undefined;
}

/** Resolves the tint (0xRRGGBB) for a block particle at a column. */
export function blockTint(world: ParticleWorld | null, info: BlockParticleInfo, x: number, z: number, top = false): number {
  const mode = top && info.topTinted ? 1 : info.tintMode;
  if (top && !info.topTinted && info.tintMode === 0) return 0xffffff;
  if (!top && info.topTinted) return 0xffffff; // dirt part of a grass block
  if (mode === 0) return 0xffffff;
  if (mode === 4) return info.tint;
  const c = world?.getChunk(x >> 4, z >> 4);
  if (!c) return mode === 3 ? 0x3f76e4 : mode === 2 ? 0x59ae30 : 0x79c05a;
  const i = (z & 15) * 16 + (x & 15);
  return mode === 1 ? c.grassColor[i] : mode === 2 ? c.foliageColor[i] : c.waterColor[i];
}

// ------------------------------------------------------------------------------- collision
const FULL = new Float32Array([0, 0, 0, 1, 1, 1]);
const EMPTY = new Float32Array(0);
const shapeCache: (Float32Array | undefined)[] = new Array(65536);
const tmp: number[] = [];
const noNeighbours = () => 0;

/** Simplified collision boxes (block-local [x0,y0,z0,x1,y1,z1]*) of a state; empty if passable. */
export function collisionShape(state: number): Float32Array {
  if (state === 0) return EMPTY;
  let s = shapeCache[state];
  if (s) return s;
  const id = state >>> 4;
  if (T_FULL_CUBE[id]) s = FULL;
  else if (!T_SOLID[id]) s = EMPTY;
  else {
    tmp.length = 0;
    try {
      getCollisionBoxes(state, noNeighbours, tmp);
    } catch {
      tmp.length = 0;
      tmp.push(0, 0, 0, 1, 1, 1);
    }
    s = tmp.length ? new Float32Array(tmp) : EMPTY;
  }
  shapeCache[state] = s;
  return s;
}

/** Result of a point query: hit box in world coordinates. */
export interface BoxHit {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  /** 0 none, 1 water, 2 lava (liquid at the point's block). */
  liquid: number;
}

/**
 * Tests whether the world point lies inside a block's collision box. Fills `out` with that box
 * (world coordinates) and returns true. Also reports the liquid at the point.
 */
export function pointSolid(world: ParticleWorld, x: number, y: number, z: number, out: BoxHit): boolean {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const st = world.getBlock(bx, by, bz);
  out.liquid = st ? T_LIQUID[st >>> 4] : 0;
  if (st === 0) return false;
  const s = collisionShape(st);
  if (s.length === 0) return false;
  const lx = x - bx, ly = y - by, lz = z - bz;
  for (let k = 0; k < s.length; k += 6) {
    if (lx >= s[k] && lx <= s[k + 3] && ly >= s[k + 1] && ly <= s[k + 4] && lz >= s[k + 2] && lz <= s[k + 5]) {
      out.x0 = bx + s[k]; out.y0 = by + s[k + 1]; out.z0 = bz + s[k + 2];
      out.x1 = bx + s[k + 3]; out.y1 = by + s[k + 4]; out.z1 = bz + s[k + 5];
      return true;
    }
  }
  return false;
}
