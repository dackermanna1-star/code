import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../../shared/constants';
import { BLOCKS, LIQUID } from '../../shared/world/blocks';
import { chunkKey, chunkKeyX, chunkKeyZ, type Chunk, type VoxelWorld } from '../../shared/world/chunk';

/**
 * Explored-terrain store for the world map and minimap.
 *
 * Each captured chunk is reduced to a compact column summary (4 bytes per
 * column: surface block, top y, water depth, plant/overlay block). Summaries
 * are the source of truth: they are shaded into pixels and written into large
 * "region" canvases (32x32 chunks = 512x512 blocks each), so drawing the map
 * is just a few drawImage calls. Shading looks at neighbouring columns (relief,
 * shorelines), so neighbouring chunks are re-shaded when a chunk changes.
 * Summaries are also what gets persisted per world (IndexedDB, best effort).
 */

export const REGION_SHIFT = 5;
export const REGION_CHUNKS = 1 << REGION_SHIFT;
export const REGION_BLOCKS = REGION_CHUNKS * CHUNK_SIZE;
const COL = 4; // bytes per column
const CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE * COL;
const F_SURF = 0, F_TOP = 1, F_DEPTH = 2, F_PLANT = 3;

// ------------------------------------------------------------------ palette
const PAL = new Uint8Array(256 * 3);
/** Cross-shaped blocks (plants, torches) are drawn as a tint over the block below. */
const OVERLAY = new Uint8Array(256);
const OVERLAY_MIX = new Float32Array(256);
const OVERRIDE: Record<string, number> = {
  // a touch darker than the grass block so grassy areas get some texture
  tall_grass: 0x4c8a30,
  // snow is toned down so relief shading still shows on bright peaks instead of clipping to white
  snow: 0xdce4ea,
  snowy_grass: 0xd6e0e3,
};
const MIX: Record<string, number> = {
  tall_grass: 0.35, flower_red: 0.55, flower_yellow: 0.55, berry_bush: 0.6, hemp: 0.4,
  mushroom: 0.5, dead_bush: 0.45, torch: 0.8, campfire: 0.85,
};
for (const d of BLOCKS) {
  if (!d) continue;
  const c = OVERRIDE[d.key] ?? d.mapColor;
  PAL[d.id * 3] = (c >> 16) & 255;
  PAL[d.id * 3 + 1] = (c >> 8) & 255;
  PAL[d.id * 3 + 2] = c & 255;
  if (d.shape === 'cross') {
    OVERLAY[d.id] = 1;
    OVERLAY_MIX[d.id] = MIX[d.key] ?? 0.45;
  }
}
const SHALLOW = [86, 168, 206];
const DEEP = [20, 46, 104];
const FOAM = [226, 238, 236];

export interface ColumnInfo {
  /** Surface block (for water: the floor block). */
  id: number;
  /** y of the top block (for water: the water surface). */
  y: number;
  /** Water depth in blocks (0 = dry land). */
  depth: number;
  /** Plant / torch on top (0 = none). */
  plant: number;
}

interface Region {
  rx: number;
  rz: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Chunk keys of explored chunks in this region. */
  chunks: Set<number>;
}

/** Reduce a chunk to column summaries. */
function extractColumns(blocks: Uint8Array, out: Uint8Array) {
  for (let base = 0; base < CHUNK_SIZE * CHUNK_SIZE; base++) {
    let y = WORLD_HEIGHT - 1, id = 0, plant = 0;
    for (; y >= 0; y--) {
      id = blocks[base | (y << 8)];
      if (id === 0) continue;
      if (OVERLAY[id]) {
        if (!plant) plant = id;
        continue;
      }
      break;
    }
    const o = base * COL;
    if (y < 0) {
      out[o] = out[o + 1] = out[o + 2] = 0;
      out[o + 3] = plant;
      continue;
    }
    let depth = 0, surf = id;
    if (LIQUID[id]) {
      let yy = y;
      while (yy >= 0 && LIQUID[blocks[base | (yy << 8)]]) {
        yy--;
        depth++;
      }
      surf = yy >= 0 ? blocks[base | (yy << 8)] : 0;
      if (OVERLAY[surf]) surf = 0;
      if (depth > 255) depth = 255;
    }
    out[o + F_SURF] = surf;
    out[o + F_TOP] = y;
    out[o + F_DEPTH] = depth;
    out[o + F_PLANT] = plant;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const regionKey = (rx: number, rz: number) => chunkKey(rx, rz);

export class MapTerrain {
  /** Incremented whenever any explored pixel changes (lets views skip redraws). */
  version = 0;
  private cols = new Map<number, Uint8Array>();
  private revs = new Map<number, number>();
  private regions = new Map<number, Region>();
  private scratch: ImageData;
  private lastPoll = 0;
  // persistence
  private worldKey: string | null = null;
  private loaded = false;
  private dirtyRegions = new Set<number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private onHide = () => {
    if (document.visibilityState === 'hidden') void this.flush(true);
  };
  private onPageHide = () => void this.flush(true);

  constructor() {
    this.scratch = new ImageData(CHUNK_SIZE, CHUNK_SIZE);
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
  }

  get exploredChunks() {
    return this.cols.size;
  }

  /** Summarise a chunk and update the map pixels if anything changed. */
  capture(c: Chunk): boolean {
    const key = c.key;
    this.revs.set(key, c.rev);
    const fresh = new Uint8Array(CHUNK_BYTES);
    extractColumns(c.blocks, fresh);
    const old = this.cols.get(key);
    if (old && sameBytes(old, fresh)) return false;
    this.cols.set(key, fresh);
    this.addToRegion(key);
    this.shadeWithNeighbours(key);
    this.version++;
    this.markDirty(key);
    return true;
  }

  /** Re-capture loaded chunks whose revision changed (block edits). Throttled. */
  pollEdits(world: VoxelWorld, now: number) {
    if (now - this.lastPoll < 400) return;
    this.lastPoll = now;
    for (const [key, c] of world.chunks) {
      if (this.revs.get(key) !== c.rev) this.capture(c);
    }
  }

  columnAt(x: number, z: number): ColumnInfo | null {
    const cols = this.cols.get(chunkKey(x >> 4, z >> 4));
    if (!cols) return null;
    const o = ((x & 15) + ((z & 15) << 4)) * COL;
    return { id: cols[o + F_SURF], y: cols[o + F_TOP], depth: cols[o + F_DEPTH], plant: cols[o + F_PLANT] };
  }

  /**
   * Draw explored terrain covering the world rectangle starting at (wx, wz)
   * onto `g` at device scale `s` (device pixels per block), with the world
   * point (wx, wz) at device pixel (0, 0). Only region canvases that
   * intersect the target are drawn; edges are rounded consistently so
   * adjacent regions never leave seams.
   */
  draw(g: CanvasRenderingContext2D, wx: number, wz: number, s: number, devW: number, devH: number) {
    const x1 = wx + devW / s, z1 = wz + devH / s;
    const rx0 = Math.floor(wx / REGION_BLOCKS), rx1 = Math.floor(x1 / REGION_BLOCKS);
    const rz0 = Math.floor(wz / REGION_BLOCKS), rz1 = Math.floor(z1 / REGION_BLOCKS);
    const ox = Math.round(wx * s), oz = Math.round(wz * s);
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const r = this.regions.get(regionKey(rx, rz));
        if (!r) continue;
        const bx = rx * REGION_BLOCKS, bz = rz * REGION_BLOCKS;
        // source rectangle (whole blocks) clipped to the view
        const sx0 = Math.max(0, Math.floor(wx - bx)), sz0 = Math.max(0, Math.floor(wz - bz));
        const sx1 = Math.min(REGION_BLOCKS, Math.ceil(x1 - bx)), sz1 = Math.min(REGION_BLOCKS, Math.ceil(z1 - bz));
        if (sx1 <= sx0 || sz1 <= sz0) continue;
        const dx0 = Math.round((bx + sx0) * s) - ox, dx1 = Math.round((bx + sx1) * s) - ox;
        const dz0 = Math.round((bz + sz0) * s) - oz, dz1 = Math.round((bz + sz1) * s) - oz;
        g.drawImage(r.canvas, sx0, sz0, sx1 - sx0, sz1 - sz0, dx0, dz0, dx1 - dx0, dz1 - dz0);
      }
    }
  }

  // ------------------------------------------------------------------ shading
  private addToRegion(key: number) {
    const cx = chunkKeyX(key), cz = chunkKeyZ(key);
    const rx = cx >> REGION_SHIFT, rz = cz >> REGION_SHIFT;
    const rk = regionKey(rx, rz);
    let r = this.regions.get(rk);
    if (!r) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = REGION_BLOCKS;
      const ctx = canvas.getContext('2d')!;
      r = { rx, rz, canvas, ctx, chunks: new Set() };
      this.regions.set(rk, r);
    }
    r.chunks.add(key);
    return r;
  }

  private shadeWithNeighbours(key: number) {
    const cx = chunkKeyX(key), cz = chunkKeyZ(key);
    this.shade(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = chunkKey(cx + dx, cz + dz);
      if (this.cols.has(nk)) this.shade(nk);
    }
  }

  /** Shade one chunk's columns into its region canvas. */
  private shade(key: number) {
    const cols = this.cols.get(key);
    if (!cols) return;
    const cx = chunkKeyX(key), cz = chunkKeyZ(key);
    const N = this.cols.get(chunkKey(cx, cz - 1));
    const S = this.cols.get(chunkKey(cx, cz + 1));
    const W = this.cols.get(chunkKey(cx - 1, cz));
    const E = this.cols.get(chunkKey(cx + 1, cz));
    /** Field of a 4-neighbour column (at most one coordinate out of range), or -1 if unexplored. */
    const nb = (lx: number, lz: number, f: number): number => {
      let arr: Uint8Array | undefined = cols;
      if (lx < 0) { arr = W; lx += 16; } else if (lx > 15) { arr = E; lx -= 16; } else if (lz < 0) { arr = N; lz += 16; } else if (lz > 15) { arr = S; lz -= 16; }
      return arr ? arr[((lx + (lz << 4)) << 2) + f] : -1;
    };
    const px = this.scratch.data;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const o = (x + (z << 4)) << 2;
        const surf = cols[o], top = cols[o + 1], depth = cols[o + 2], plant = cols[o + 3];
        let r: number, g: number, b: number;
        if (depth > 0) {
          // water: colour by depth; shallow water shows the floor; foam along shores
          const t = Math.sqrt(Math.min(1, (depth - 1) / 14));
          r = SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t;
          g = SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t;
          b = SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t;
          if (depth <= 2 && surf) {
            const k = depth === 1 ? 0.5 : 0.7;
            r = PAL[surf * 3] * (1 - k) + r * k;
            g = PAL[surf * 3 + 1] * (1 - k) + g * k;
            b = PAL[surf * 3 + 2] * (1 - k) + b * k;
          }
          if (depth <= 3 && (nb(x - 1, z, 2) === 0 || nb(x + 1, z, 2) === 0 || nb(x, z - 1, 2) === 0 || nb(x, z + 1, 2) === 0)) {
            r = r * 0.55 + FOAM[0] * 0.45;
            g = g * 0.55 + FOAM[1] * 0.45;
            b = b * 0.55 + FOAM[2] * 0.45;
          } else if (depth > 3 && ((x + z) & 1)) {
            // subtle checker dither gives open water a blocky texture
            r *= 0.95; g *= 0.95; b *= 0.96;
          }
          // depth contour: darker where the bottom drops away towards the north/west
          const dn = nb(x, z - 1, 2), dw = nb(x - 1, z, 2);
          if ((dn > 0 && dn < depth - 1) || (dw > 0 && dw < depth - 1)) {
            r *= 0.92; g *= 0.92; b *= 0.94;
          }
        } else if (surf === 0) {
          r = 20; g = 18; b = 16;
        } else {
          r = PAL[surf * 3];
          g = PAL[surf * 3 + 1];
          b = PAL[surf * 3 + 2];
          if (plant) {
            const k = OVERLAY_MIX[plant];
            r = r * (1 - k) + PAL[plant * 3] * k;
            g = g * (1 - k) + PAL[plant * 3 + 1] * k;
            b = b * (1 - k) + PAL[plant * 3 + 2] * k;
          }
          // relief: light from the north-west, stepped like the block world
          let hn = nb(x, z - 1, 1), hw = nb(x - 1, z, 1);
          if (hn < 0) hn = top;
          if (hw < 0) hw = top;
          const slope = (top - hn) + (top - hw);
          let shade = slope >= 3 ? 1.18 : slope === 2 ? 1.12 : slope === 1 ? 1.06 : slope === 0 ? 1 : slope === -1 ? 0.88 : slope === -2 ? 0.8 : 0.72;
          // elevation: lowlands slightly darker, peaks brighter
          const e = (top - SEA_LEVEL) / 64;
          shade *= 0.93 + (e < -0.2 ? -0.2 : e > 1 ? 1 : e) * 0.14;
          r *= shade; g *= shade; b *= shade;
        }
        const i = (x + (z << 4)) << 2;
        px[i] = r > 255 ? 255 : r;
        px[i + 1] = g > 255 ? 255 : g;
        px[i + 2] = b > 255 ? 255 : b;
        px[i + 3] = 255;
      }
    }
    const rx = cx >> REGION_SHIFT, rz = cz >> REGION_SHIFT;
    const reg = this.regions.get(regionKey(rx, rz)) ?? this.addToRegion(key);
    reg.ctx.putImageData(this.scratch, (cx - rx * REGION_CHUNKS) * CHUNK_SIZE, (cz - rz * REGION_CHUNKS) * CHUNK_SIZE);
  }

  // ------------------------------------------------------------------ persistence
  /**
   * Associate the store with a saved world: loads that world's explored map
   * (merged under anything captured this session) and from then on saves
   * changes in the background. Without it the map simply isn't persisted.
   */
  async setWorldKey(key: string) {
    if (key === this.worldKey) return;
    this.worldKey = key;
    this.loaded = false;
    forgotten.delete(key);
    const db = await mapDB();
    if (!db || this.worldKey !== key) {
      this.loaded = true;
      return;
    }
    let records: Array<[string, RegionRecord]> = [];
    try {
      records = await new Promise((resolve, reject) => {
        const out: Array<[string, RegionRecord]> = [];
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor(worldRange(key));
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return resolve(out);
          out.push([String(cur.key), cur.value as RegionRecord]);
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      records = [];
    }
    const added: number[] = [];
    for (const [k, rec] of records) {
      if (this.worldKey !== key) return;
      const m = /\|(-?\d+),(-?\d+)$/.exec(k);
      if (!m) continue;
      const rx = Number(m[1]), rz = Number(m[2]);
      const data = await decodeRecord(rec);
      if (!data) continue;
      for (let i = 0; i < rec.idx.length; i++) {
        const cx = rx * REGION_CHUNKS + (rec.idx[i] & 31), cz = rz * REGION_CHUNKS + (rec.idx[i] >> 5);
        const ck = chunkKey(cx, cz);
        if (this.cols.has(ck)) continue; // captured live this session: newer
        this.cols.set(ck, data.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
        this.addToRegion(ck);
        added.push(ck);
      }
    }
    if (this.worldKey !== key) return;
    // shade restored chunks (and live neighbours whose edges now have context)
    const toShade = new Set<number>(added);
    for (const ck of added) {
      const cx = chunkKeyX(ck), cz = chunkKeyZ(ck);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = chunkKey(cx + dx, cz + dz);
        if (this.cols.has(nk)) toShade.add(nk);
      }
    }
    for (const ck of toShade) this.shade(ck);
    if (toShade.size) this.version++;
    this.loaded = true;
    if (this.dirtyRegions.size) this.scheduleSave();
  }

  /** Remember the chunk's region needs saving (kept even before a world key is set). */
  private markDirty(chunk: number) {
    this.dirtyRegions.add(regionKey(chunkKeyX(chunk) >> REGION_SHIFT, chunkKeyZ(chunk) >> REGION_SHIFT));
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer || !this.loaded || !this.worldKey) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush(false);
    }, 5000);
  }

  /** Write changed regions. `sync` skips compression so the writes are queued immediately (page hide). */
  async flush(sync: boolean) {
    const key = this.worldKey;
    if (!key || !this.loaded || !this.dirtyRegions.size || forgotten.has(key)) return;
    const db = await mapDB();
    if (!db) return;
    const regions = [...this.dirtyRegions];
    this.dirtyRegions.clear();
    const puts: Array<[string, RegionRecord]> = [];
    for (const rk of regions) {
      const r = this.regions.get(rk);
      if (!r || !r.chunks.size) continue;
      const keys = [...r.chunks];
      const idx = new Uint16Array(keys.length);
      const data = new Uint8Array(keys.length * CHUNK_BYTES);
      keys.forEach((ck, i) => {
        idx[i] = (chunkKeyX(ck) & 31) | ((chunkKeyZ(ck) & 31) << 5);
        data.set(this.cols.get(ck)!, i * CHUNK_BYTES);
      });
      const packed = sync ? null : await deflate(data);
      puts.push([`${key}|${r.rx},${r.rz}`, packed ? { v: 1, enc: 'deflate-raw', idx, data: packed } : { v: 1, enc: 'raw', idx, data }]);
    }
    if (forgotten.has(key)) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const [k, v] of puts) st.put(v, k);
      tx.onerror = () => undefined;
    } catch {
      /* storage unavailable or full: the map still works for this session */
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.flush(false);
  }
}

// ------------------------------------------------------------------ IndexedDB helpers
const DB_NAME = 'corrode-map';
const STORE = 'regions';
const forgotten = new Set<string>();

interface RegionRecord {
  v: 1;
  enc: 'raw' | 'deflate-raw';
  /** Local chunk index within the region: lx | lz << 5. */
  idx: Uint16Array;
  data: Uint8Array;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function mapDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

const worldRange = (key: string) => IDBKeyRange.bound(`${key}|`, `${key}|￿`);

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function decodeRecord(rec: RegionRecord): Promise<Uint8Array | null> {
  try {
    if (!rec || rec.v !== 1 || !(rec.idx instanceof Uint16Array) || !(rec.data instanceof Uint8Array)) return null;
    let data = rec.data;
    if (rec.enc === 'deflate-raw') {
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return data.length === rec.idx.length * CHUNK_BYTES ? data : null;
  } catch {
    return null;
  }
}

/** Delete a world's saved map (call when the world itself is deleted). Never throws. */
export async function deleteSavedMap(worldKey: string): Promise<void> {
  forgotten.add(worldKey);
  try {
    const db = await mapDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(worldRange(worldKey));
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
