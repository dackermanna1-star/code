/**
 * Ambient block emitters near the camera (torch flames/smoke, fire, campfires, lava pops).
 * Loaded sections around the camera are scanned incrementally (a few per frame) with a block-id
 * lookup table; results are cached per section and invalidated on block changes.
 */
import { BLOCKS } from '../../world/blocks/registry';

export const enum EmitterKind {
  None = 0,
  Torch = 1,
  SoulTorch = 2,
  Fire = 3,
  SoulFire = 4,
  Campfire = 5,
  Lava = 6,
  RedstoneTorch = 7,
}

let TABLE: Uint8Array | null = null;

/** Block id -> EmitterKind. */
export function emitterTable(): Uint8Array {
  if (TABLE) return TABLE;
  const t = new Uint8Array(4096);
  for (const b of BLOCKS) {
    let k = EmitterKind.None;
    if (b.name === 'torch') k = EmitterKind.Torch;
    else if (b.name === 'soul_torch') k = EmitterKind.SoulTorch;
    else if (b.name === 'redstone_torch') k = EmitterKind.RedstoneTorch;
    else if (b.name === 'fire') k = EmitterKind.Fire;
    else if (b.name === 'soul_fire') k = EmitterKind.SoulFire;
    else if (b.name === 'campfire') k = EmitterKind.Campfire;
    else if (b.name === 'lava') k = EmitterKind.Lava;
    t[b.id] = k;
  }
  TABLE = t;
  return t;
}

export interface EmitterWorld {
  getBlock(x: number, y: number, z: number): number;
  getChunk(cx: number, cz: number): { blocks: (Uint16Array | null)[] } | undefined;
}

/**
 * Scans a 16³ section for emitter blocks; appends [x, y, z, kind, meta] (world coords) to `out`.
 * Lava only counts when exposed (air above), since pops only happen at the surface.
 */
export function scanSection(world: EmitterWorld, sec: Uint16Array, ox: number, oy: number, oz: number, out: number[]) {
  const T = emitterTable();
  for (let i = 0; i < 4096; i++) {
    const st = sec[i];
    if (st === 0) continue;
    const k = T[st >>> 4];
    if (k === 0) continue;
    const x = ox + (i & 15), y = oy + (i >> 8), z = oz + ((i >> 4) & 15);
    if (k === EmitterKind.Lava && world.getBlock(x, y + 1, z) !== 0) continue;
    if (k === EmitterKind.Campfire && (st & 4) !== 0) continue; // extinguished
    out.push(x, y, z, k, st & 15);
  }
}

const skey = (cx: number, sy: number, cz: number) => ((cx + 0x8000) * 0x10000 + (cz + 0x8000)) * 32 + sy;

export class EmitterScanner {
  /** Section key -> flat [x,y,z,kind,meta]* list. */
  readonly cache = new Map<number, number[]>();
  radiusChunks = 2;
  radiusSections = 2;

  invalidate(x: number, y: number, z: number) {
    this.cache.delete(skey(x >> 4, y >> 4, z >> 4));
    // lava exposure depends on the block above
    if ((y & 15) === 0) this.cache.delete(skey(x >> 4, (y >> 4) - 1, z >> 4));
  }

  clear() {
    this.cache.clear();
  }

  /** Scans up to `budget` uncached sections near the camera and drops far ones. */
  update(world: EmitterWorld, camX: number, camY: number, camZ: number, budget = 6): number {
    const pcx = Math.floor(camX) >> 4, pcz = Math.floor(camZ) >> 4, psy = Math.floor(camY) >> 4;
    const R = this.radiusChunks, RS = this.radiusSections;
    let scanned = 0;
    for (let d = 0; d <= R && scanned < budget; d++)
      for (let dz = -d; dz <= d && scanned < budget; dz++)
        for (let dx = -d; dx <= d && scanned < budget; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
          const c = world.getChunk(pcx + dx, pcz + dz);
          if (!c) continue;
          for (let sy = Math.max(0, psy - RS); sy <= Math.min(15, psy + RS) && scanned < budget; sy++) {
            const k = skey(pcx + dx, sy, pcz + dz);
            if (this.cache.has(k)) continue;
            const out: number[] = [];
            const sec = c.blocks[sy];
            if (sec) scanSection(world, sec, (pcx + dx) * 16, sy * 16, (pcz + dz) * 16, out);
            this.cache.set(k, out);
            scanned++;
          }
        }
    // evict far sections
    if (this.cache.size > (2 * R + 3) * (2 * R + 3) * (2 * RS + 3)) {
      for (const k of this.cache.keys()) {
        const sy = k % 32;
        const ck = (k - sy) / 32;
        const cx = Math.floor(ck / 0x10000) - 0x8000, cz = (ck % 0x10000) - 0x8000;
        if (Math.abs(cx - pcx) > R + 1 || Math.abs(cz - pcz) > R + 1 || Math.abs(sy - psy) > RS + 1) this.cache.delete(k);
      }
    }
    return scanned;
  }

  /** Calls fn for every cached emitter. */
  forEach(fn: (x: number, y: number, z: number, kind: number, meta: number) => void) {
    for (const list of this.cache.values()) for (let i = 0; i < list.length; i += 5) fn(list[i], list[i + 1], list[i + 2], list[i + 3], list[i + 4]);
  }

  get count() {
    let n = 0;
    for (const l of this.cache.values()) n += l.length / 5;
    return n;
  }
}

/** Flame position of a torch (Minecraft offsets). meta = Dir the torch points to (1 floor, 2..5 wall). */
export function torchFlamePos(x: number, y: number, z: number, meta: number, out: number[]) {
  if (meta >= 2 && meta <= 5) {
    // toward the wall (opposite of the pointing direction)
    const dx = meta === 4 ? 1 : meta === 5 ? -1 : 0, dz = meta === 2 ? 1 : meta === 3 ? -1 : 0;
    out[0] = x + 0.5 + dx * 0.27; out[1] = y + 0.86; out[2] = z + 0.5 + dz * 0.27;
  } else {
    out[0] = x + 0.5; out[1] = y + 0.68; out[2] = z + 0.5;
  }
  return out;
}
