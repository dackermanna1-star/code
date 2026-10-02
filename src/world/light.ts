/**
 * Light propagation: sky light (0..15) and coloured block light (R,G,B 0..15 each),
 * packed per block as sky<<12 | r<<8 | g<<4 | b.
 *
 * - `lightChunkLocal` lights a freshly generated chunk in isolation (worker-safe).
 * - `LightEngine` keeps light consistent across chunk borders and on block changes
 *   (incremental BFS with proper removal), operating through a `LightAccess`.
 */
import { WORLD_HEIGHT, SECTIONS_PER_CHUNK } from '../core/constants';
import { T_OPACITY, T_EMISSION } from './blocks/registry';
import type { Chunk } from './chunk';

const DX = [0, 0, 0, 0, -1, 1];
const DY = [-1, 1, 0, 0, 0, 0];
const DZ = [0, 0, -1, 1, 0, 0];

export interface LightAccess {
  /** Packed light, or -1 if the position is not loaded. */
  getLight(x: number, y: number, z: number): number;
  setLight(x: number, y: number, z: number, v: number): void;
  /** Block state at position (0 if unloaded). */
  getState(x: number, y: number, z: number): number;
  /** Whether the position is inside loaded space. */
  isLoaded(x: number, y: number, z: number): boolean;
  /** Called after a light value changed (for remeshing). */
  onChanged?(x: number, y: number, z: number): void;
}

/** Growable FIFO of (x,y,z[,v]) integer tuples. */
class Queue {
  private buf: Int32Array;
  private head = 0;
  private tail = 0;
  constructor(private stride: number, cap = 1 << 14) {
    this.buf = new Int32Array(cap * stride);
  }
  get size() {
    return (this.tail - this.head) / this.stride;
  }
  clear() {
    this.head = this.tail = 0;
  }
  push(a: number, b: number, c: number, d = 0) {
    if (this.tail + this.stride > this.buf.length) {
      // compact or grow
      const live = this.tail - this.head;
      if (this.head > 0 && live * 2 < this.buf.length) {
        this.buf.copyWithin(0, this.head, this.tail);
      } else {
        const nb = new Int32Array(this.buf.length * 2);
        nb.set(this.buf.subarray(this.head, this.tail));
        this.buf = nb;
      }
      this.head = 0;
      this.tail = live;
    }
    const t = this.tail;
    this.buf[t] = a;
    this.buf[t + 1] = b;
    this.buf[t + 2] = c;
    if (this.stride > 3) this.buf[t + 3] = d;
    this.tail += this.stride;
  }
  /** Returns the index into the buffer of the popped element or -1. */
  pop(): number {
    if (this.head >= this.tail) {
      this.head = this.tail = 0;
      return -1;
    }
    const h = this.head;
    this.head += this.stride;
    return h;
  }
  get data() {
    return this.buf;
  }
}

const opacityOf = (state: number) => T_OPACITY[state >>> 4];
const emissionOf = (state: number) => T_EMISSION[state >>> 4];
const emissionPacked = (state: number) => {
  const e = T_EMISSION[state >>> 4];
  return ((e >> 8) & 15) << 8 | ((e >> 4) & 15) << 4 | (e & 15);
};

/** Propagate light increases from all queued positions (all channels at once). */
function propagate(acc: LightAccess, q: Queue) {
  let idx: number;
  while ((idx = q.pop()) >= 0) {
    const d = q.data;
    const x = d[idx], y = d[idx + 1], z = d[idx + 2];
    const L = acc.getLight(x, y, z);
    if (L <= 0) continue;
    const s = (L >>> 12) & 15, r = (L >>> 8) & 15, g = (L >>> 4) & 15, b = L & 15;
    if (s <= 1 && r <= 1 && g <= 1 && b <= 1) continue;
    for (let dir = 0; dir < 6; dir++) {
      const nx = x + DX[dir], ny = y + DY[dir], nz = z + DZ[dir];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const NL = acc.getLight(nx, ny, nz);
      if (NL < 0) continue;
      const op = opacityOf(acc.getState(nx, ny, nz));
      if (op >= 15) continue;
      const dec = op > 1 ? op : 1;
      let ns = dir === 0 && s === 15 && op === 0 ? 15 : s - dec;
      let nr = r - dec, ng = g - dec, nb = b - dec;
      const cs = (NL >>> 12) & 15, cr = (NL >>> 8) & 15, cg = (NL >>> 4) & 15, cb = NL & 15;
      if (ns < cs) ns = cs;
      if (nr < cr) nr = cr;
      if (ng < cg) ng = cg;
      if (nb < cb) nb = cb;
      const nv = (ns << 12) | (nr << 8) | (ng << 4) | nb;
      if (nv !== NL) {
        acc.setLight(nx, ny, nz, nv);
        acc.onChanged?.(nx, ny, nz);
        q.push(nx, ny, nz);
      }
    }
  }
}

/**
 * Remove light of one channel (shift 12 sky, 8 r, 4 g, 0 b) that originated from the queued
 * positions (which already had their channel zeroed; the queue holds their old level).
 * Positions that must re-propagate are pushed to `refill`.
 */
function removeChannel(acc: LightAccess, rq: Queue, refill: Queue, shift: number) {
  const mask = ~(15 << shift);
  let idx: number;
  while ((idx = rq.pop()) >= 0) {
    const d = rq.data;
    const x = d[idx], y = d[idx + 1], z = d[idx + 2], old = d[idx + 3];
    for (let dir = 0; dir < 6; dir++) {
      const nx = x + DX[dir], ny = y + DY[dir], nz = z + DZ[dir];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const NL = acc.getLight(nx, ny, nz);
      if (NL < 0) continue;
      const nlev = (NL >>> shift) & 15;
      if (nlev === 0) continue;
      const direct = shift === 12 && dir === 0 && old === 15 && nlev === 15;
      if (nlev < old || direct) {
        // This neighbour was (possibly) lit by the removed light: clear and continue removal.
        const own = shift === 12 ? 0 : (emissionPacked(acc.getState(nx, ny, nz)) >>> shift) & 15;
        acc.setLight(nx, ny, nz, (NL & mask) | (own << shift));
        acc.onChanged?.(nx, ny, nz);
        rq.push(nx, ny, nz, nlev);
        if (own > 0) refill.push(nx, ny, nz);
      } else {
        refill.push(nx, ny, nz);
      }
    }
  }
}

const tmpQ = new Queue(3);
const rmQ = new Queue(4);

export class LightEngine {
  constructor(private acc: LightAccess) {}

  /**
   * A block changed at (x,y,z): fix light around it.
   */
  onBlockChanged(x: number, y: number, z: number, oldState: number, newState: number) {
    const acc = this.acc;
    const oldOp = opacityOf(oldState), newOp = opacityOf(newState);
    const oldEm = emissionOf(oldState), newEm = emissionOf(newState);
    if (oldOp === newOp && oldEm === newEm) return;
    const L = acc.getLight(x, y, z);
    if (L < 0) return;
    tmpQ.clear();
    // Remove each channel's light at this position and everything it fed.
    const shifts = [12, 8, 4, 0];
    acc.setLight(x, y, z, 0);
    acc.onChanged?.(x, y, z);
    for (const sh of shifts) {
      const lev = (L >>> sh) & 15;
      if (lev === 0) continue;
      rmQ.clear();
      rmQ.push(x, y, z, lev);
      removeChannel(acc, rmQ, tmpQ, sh);
    }
    // New emission
    if (newEm) {
      acc.setLight(x, y, z, acc.getLight(x, y, z) | emissionPacked(newState));
      tmpQ.push(x, y, z);
    }
    // Neighbours re-flood into this cell (if it became transparent) and refill removed areas.
    for (let dir = 0; dir < 6; dir++) {
      const ny = y + DY[dir];
      if (ny >= WORLD_HEIGHT) {
        // open sky above the world
        if (newOp < 15) {
          const cur = acc.getLight(x, y, z);
          const s = newOp === 0 ? 15 : Math.max(0, 15 - newOp);
          if (((cur >>> 12) & 15) < s) {
            acc.setLight(x, y, z, (cur & 0x0fff) | (s << 12));
            tmpQ.push(x, y, z);
          }
        }
        continue;
      }
      if (ny < 0) continue;
      if (acc.getLight(x + DX[dir], ny, z + DZ[dir]) > 0) tmpQ.push(x + DX[dir], ny, z + DZ[dir]);
    }
    propagate(acc, tmpQ);
  }

  /**
   * A chunk was added next to already-loaded chunks: exchange light across its 4 borders.
   * `cx,cz` chunk coords; `topY` highest y that may contain non-trivial light (+1).
   */
  integrateChunk(cx: number, cz: number, topY: number) {
    const acc = this.acc;
    tmpQ.clear();
    const x0 = cx * 16, z0 = cz * 16;
    const yMax = Math.min(WORLD_HEIGHT - 1, topY + 1);
    // For every border column pair (inside, outside) push both sides; propagate handles direction.
    for (let i = 0; i < 16; i++) {
      const pairs = [
        [x0 + i, z0, x0 + i, z0 - 1],
        [x0 + i, z0 + 15, x0 + i, z0 + 16],
        [x0, z0 + i, x0 - 1, z0 + i],
        [x0 + 15, z0 + i, x0 + 16, z0 + i],
      ];
      for (const [ax, az, bx, bz] of pairs) {
        if (!acc.isLoaded(bx, 0, bz)) continue;
        for (let y = 0; y <= yMax; y++) {
          const la = acc.getLight(ax, y, az), lb = acc.getLight(bx, y, bz);
          if (la !== lb) {
            if (la > 0) tmpQ.push(ax, y, az);
            if (lb > 0) tmpQ.push(bx, y, bz);
          }
        }
      }
    }
    propagate(acc, tmpQ);
  }

  /** Propagate from an explicit list of seeds. */
  propagateFrom(seeds: [number, number, number][]) {
    tmpQ.clear();
    for (const [x, y, z] of seeds) tmpQ.push(x, y, z);
    propagate(this.acc, tmpQ);
  }
}

/**
 * Light a chunk in isolation (neighbours treated as unloaded). Fills chunk.light/lightFill.
 * Works on `Chunk` instances in workers or on the main thread.
 */
export function lightChunkLocal(chunk: Chunk): void {
  const top = chunk.topSection(); // sections >= top are all air
  for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
    chunk.light[sy] = null;
    chunk.lightFill[sy] = sy >= top ? 15 << 12 : 0;
  }
  const topY = top * 16; // first y of all-air region
  // 1) direct sky light, column by column
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      let level = 15;
      for (let y = topY - 1; y >= 0; y--) {
        const st = chunk.get(x, y, z);
        const op = T_OPACITY[st >>> 4];
        if (op >= 15) level = 0;
        else if (op > 0) level = Math.max(0, level - op);
        if (level === 0) break;
        chunk.setLight(x, y, z, level << 12);
      }
    }
  // 2) BFS within the chunk: seed sky spreading and emitters
  const acc: LightAccess = {
    getLight: (x, y, z) => (x < 0 || x > 15 || z < 0 || z > 15 ? -1 : y >= WORLD_HEIGHT ? 15 << 12 : chunk.getLight(x, y, z)),
    setLight: (x, y, z, v) => chunk.setLight(x, y, z, v),
    getState: (x, y, z) => chunk.get(x, y, z),
    isLoaded: (x, y, z) => x >= 0 && x <= 15 && z >= 0 && z <= 15,
  };
  const q = tmpQ;
  q.clear();
  for (let sy = 0; sy < top; sy++) {
    const blocks = chunk.blocks[sy];
    const y0 = sy * 16;
    for (let ly = 0; ly < 16; ly++) {
      const y = y0 + ly;
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = (ly << 8) | (z << 4) | x;
          const st = blocks ? blocks[i] : 0;
          const em = T_EMISSION[st >>> 4];
          if (em) {
            const cur = chunk.getLight(x, y, z);
            chunk.setLight(x, y, z, cur | emissionPacked(st));
            q.push(x, y, z);
            continue;
          }
          const L = chunk.getLight(x, y, z);
          const s = L >>> 12;
          if (s <= 1) continue;
          // seed if a horizontal or lower neighbour is darker than s-1
          let need = false;
          for (let dir = 0; dir < 6 && !need; dir++) {
            if (dir === 1) continue;
            const nx = x + DX[dir], ny = y + DY[dir], nz = z + DZ[dir];
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0) continue;
            const nst = chunk.get(nx, ny, nz);
            if (T_OPACITY[nst >>> 4] >= 15) continue;
            if ((chunk.getLight(nx, ny, nz) >>> 12) < s - 1) need = true;
          }
          if (need) q.push(x, y, z);
        }
    }
  }
  propagate(acc, q);
}
