/**
 * A* path finding on the voxel grid for walking (and swimming / wall-climbing) mobs.
 *
 * Nodes are block cells holding the entity's feet; each node knows its real floor height
 * (slabs, carpets, snow layers ...). Moves: 8 horizontal directions (no corner cutting),
 * step-ups up to 0.6 (walk) or 1.25 blocks (jump), drops up to `maxDrop` blocks (more into
 * water), swimming up/down in water, wall climbing (spiders). Lava, fire, fences/walls,
 * closed doors (unless the mob can open wooden doors) are impassable; water, cactus/berry
 * adjacency, magma and cobwebs carry a cost malus. The resulting path is smoothed (string
 * pulling over level, clear ground).
 */
import { BLOCKS, T_LIQUID } from '../../world/blocks/registry';
import { getCollisionBoxes } from '../../world/blocks/models';

export interface PathWorld {
  getBlock(x: number, y: number, z: number): number;
}

export interface PathOptions {
  width: number;
  height: number;
  /** Max safe drop (blocks). */
  maxDrop?: number;
  /** Can float/swim through water. */
  canSwim?: boolean;
  /** Extra cost per water node (land animals 8). */
  waterMalus?: number;
  canOpenDoors?: boolean;
  /** Spider-style wall climbing (max blocks). */
  climb?: number;
  fireImmune?: boolean;
  /** Search budget (expanded nodes). */
  maxNodes?: number;
  /** Max path length (blocks) from the start. */
  maxDist?: number;
  /** Aquatic: only water nodes are valid. */
  aquatic?: boolean;
}

export interface PathNode {
  x: number;
  y: number;
  z: number;
  /** Absolute feet height. */
  floor: number;
}

export class Path {
  index = 0;
  constructor(readonly nodes: PathNode[], readonly reached: boolean, readonly tx: number, readonly ty: number, readonly tz: number, readonly expanded: number) {}
  get done() {
    return this.index >= this.nodes.length;
  }
  get current(): PathNode | null {
    return this.nodes[this.index] ?? null;
  }
  get end(): PathNode | null {
    return this.nodes[this.nodes.length - 1] ?? null;
  }
}

// ------------------------------------------------------------------------- block info cache
const INFO_TOP = new Float32Array(65536).fill(NaN); // collision top per state (-1 none)
const INFO_FLAGS = new Uint8Array(65536); // computed lazily
const F_DONE = 1, F_DOOR = 2, F_IRON = 4, F_FIRE = 8, F_LAVA = 16, F_HURT = 32, F_SLOW = 64, F_TALL = 128;
const tmp: number[] = [];

function info(state: number): number {
  let f = INFO_FLAGS[state];
  if (f & F_DONE) return f;
  f = F_DONE;
  const def = BLOCKS[state >>> 4];
  const name = def?.name ?? 'air';
  let top = -1;
  if (def && def.solid) {
    tmp.length = 0;
    try {
      getCollisionBoxes(state, () => 0, tmp);
    } catch {
      tmp.push(0, 0, 0, 1, 1, 1);
    }
    for (let i = 0; i < tmp.length; i += 6) top = Math.max(top, tmp[i + 4]);
  }
  if (def?.shape === 'door' || def?.shape === 'fence_gate' || def?.shape === 'trapdoor') { f |= F_DOOR; if (name.startsWith('iron')) f |= F_IRON; }
  if (def?.shape === 'fence' || def?.shape === 'wall' || def?.shape === 'fence_gate') f |= F_TALL;
  if (name === 'fire' || name === 'soul_fire' || name === 'campfire') f |= F_FIRE;
  if (T_LIQUID[state >>> 4] === 2) f |= F_LAVA;
  if (name === 'cactus' || name === 'sweet_berry_bush' || name === 'magma_block') f |= F_HURT;
  if (name === 'cobweb' || name === 'honey_block' || name === 'soul_sand') f |= F_SLOW;
  INFO_FLAGS[state] = f;
  INFO_TOP[state] = top;
  return f;
}
function topOf(state: number): number {
  if (!(INFO_FLAGS[state] & F_DONE)) info(state);
  return INFO_TOP[state];
}

/** Is a door/gate state open? (doors: lower half bit2; upper half needs the lower half) */
function doorOpen(w: PathWorld, x: number, y: number, z: number, st: number): boolean {
  const def = BLOCKS[st >>> 4];
  if (def.shape === 'door') {
    const lower = st & 8 ? w.getBlock(x, y - 1, z) : st;
    return ((lower >> 2) & 1) === 1;
  }
  return ((st >> 2) & 1) === 1;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

interface SNode {
  x: number; y: number; z: number; floor: number;
  g: number; f: number; h: number;
  parent: SNode | null;
  heap: number;
  closed: boolean;
}

/** Binary min-heap on f. */
class Heap {
  a: SNode[] = [];
  push(n: SNode) {
    n.heap = this.a.length;
    this.a.push(n);
    this.up(n.heap);
  }
  pop(): SNode {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      last.heap = 0;
      this.down(0);
    }
    top.heap = -1;
    return top;
  }
  update(n: SNode) {
    this.up(n.heap);
  }
  get size() {
    return this.a.length;
  }
  private up(i: number) {
    const a = this.a;
    const n = a[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= n.f) break;
      a[i] = a[p]; a[i].heap = i; i = p;
    }
    a[i] = n; n.heap = i;
  }
  private down(i: number) {
    const a = this.a, len = a.length;
    const n = a[i];
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i, mf = n.f;
      if (l < len && a[l].f < mf) { m = l; mf = a[l].f; }
      if (r < len && a[r].f < mf) m = r;
      if (m === i) break;
      a[i] = a[m]; a[i].heap = i; i = m;
    }
    a[i] = n; n.heap = i;
  }
}

export class Pathfinder {
  private cells = new Map<number, number>();
  readonly o: Required<PathOptions>;
  private n: number;
  constructor(readonly w: PathWorld, opts: PathOptions) {
    this.o = {
      width: opts.width, height: opts.height, maxDrop: opts.maxDrop ?? 3, canSwim: opts.canSwim ?? true, waterMalus: opts.waterMalus ?? 8,
      canOpenDoors: opts.canOpenDoors ?? false, climb: opts.climb ?? 0, fireImmune: opts.fireImmune ?? false, maxNodes: opts.maxNodes ?? 500,
      maxDist: opts.maxDist ?? 48, aquatic: opts.aquatic ?? false,
    };
    this.n = opts.width > 1.01 ? 2 : 1;
  }

  private block(x: number, y: number, z: number): number {
    const k = ((x & 1023) * 1024 + (z & 1023)) * 512 + ((y + 64) & 511);
    let v = this.cells.get(k);
    if (v === undefined) {
      v = this.w.getBlock(x, y, z);
      this.cells.set(k, v);
    }
    return v;
  }

  /** Collision top of a cell for passage purposes (-1 = passable). */
  private cellTop(x: number, y: number, z: number): number {
    const st = this.block(x, y, z);
    if (st === 0) return -1;
    const f = info(st);
    if (f & F_DOOR) {
      if (doorOpen(this.w, x, y, z, st)) return -1;
      if (BLOCKS[st >>> 4].shape === 'door' && this.o.canOpenDoors && !(f & F_IRON)) return -1;
      return 1.5;
    }
    return topOf(st);
  }

  /** Danger / hazard flags of a cell. */
  private hazard(x: number, y: number, z: number): number {
    const st = this.block(x, y, z);
    return st === 0 ? 0 : info(st);
  }

  private isWater(x: number, y: number, z: number) {
    return T_LIQUID[this.block(x, y, z) >>> 4] === 1;
  }

  /**
   * Floor height for feet in cell (x,y,z) of a single column, or NaN if the entity cannot stand
   * there. Also checks body clearance.
   */
  private columnFloor(x: number, y: number, z: number): number {
    const top = this.cellTop(x, y, z);
    let floor: number;
    const water = this.isWater(x, y, z);
    if (this.o.aquatic) {
      if (!water) return NaN;
      floor = y;
    } else if (top > 0.65) return NaN;
    else if (top >= 0) {
      if (this.hazard(x, y, z) & F_TALL) return NaN;
      floor = y + top;
    } else {
      const below = this.cellTop(x, y - 1, z);
      if (below > 1.01) return NaN; // fence / wall top
      if (below >= 0.9) floor = y;
      else if (water && this.o.canSwim) floor = y;
      else if (below >= 0 && below < 0.9 && below > 0.4) floor = y - 1 + below; // partial below (handled at y-1 normally)
      else return NaN;
    }
    // clearance
    const h = this.o.height;
    const y0 = Math.floor(floor + 0.001), y1 = Math.floor(floor + h - 0.001);
    for (let yy = y0; yy <= y1; yy++) {
      if (yy !== y0 || top < 0) {
        const t = this.cellTop(x, yy, z);
        if (t >= 0 && yy + t > floor + 0.01 && !(yy === y0 && t <= floor - yy + 0.01)) return NaN;
      }
      const hz = this.hazard(x, yy, z);
      if (hz & F_LAVA && !this.o.fireImmune) return NaN;
      if (hz & F_FIRE && !this.o.fireImmune) return NaN;
      if (this.o.aquatic && !this.isWater(x, yy, z) && yy === y0) return NaN;
    }
    // lava directly below (standing in it is handled above)
    if (!this.o.fireImmune && this.hazard(x, y - 1, z) & F_LAVA && !water) return NaN;
    return floor;
  }

  /** Floor for the full footprint at node (x,y,z) (NaN if blocked). */
  floorAt(x: number, y: number, z: number): number {
    if (this.n === 1) return this.columnFloor(x, y, z);
    let mx = -Infinity, mn = Infinity;
    for (let dz = 0; dz < this.n; dz++)
      for (let dx = 0; dx < this.n; dx++) {
        const f = this.columnFloor(x + dx, y, z + dz);
        if (Number.isNaN(f)) return NaN;
        mx = Math.max(mx, f); mn = Math.min(mn, f);
      }
    return mx - mn > 0.6 ? NaN : mx;
  }

  /** Extra traversal cost of standing at a node. */
  private malus(x: number, y: number, z: number, floor: number): number {
    let m = 0;
    const fy = Math.floor(floor + 0.01);
    if (this.isWater(x, fy, z)) m += this.o.aquatic ? 0 : this.o.waterMalus;
    const under = this.hazard(x, fy - 1, z);
    if (under & F_HURT && !this.o.fireImmune) m += 8;
    if (under & F_SLOW) m += 2;
    for (const [dx, dz] of DIRS) {
      if (Math.abs(dx) + Math.abs(dz) > 1) continue;
      const hz = this.hazard(x + dx, fy, z + dz) | this.hazard(x + dx, fy + 1, z + dz);
      if (hz & F_HURT) m += 8;
      if (hz & (F_FIRE | F_LAVA) && !this.o.fireImmune) m += 8;
    }
    if (this.hazard(x, fy, z) & F_SLOW) m += 8;
    return m;
  }

  /** Find a standable node near a (fractional) position (search down a little). */
  nodeNear(px: number, py: number, pz: number): PathNode | null {
    const off = this.n === 2 ? 1 : 0.5;
    const x = Math.floor(px - off + 0.5), z = Math.floor(pz - off + 0.5);
    const y0 = Math.floor(py + 0.01);
    for (const dy of [0, 1, -1, -2, 2, -3]) {
      const f = this.floorAt(x, y0 + dy, z);
      if (!Number.isNaN(f)) return { x, y: y0 + dy, z, floor: f };
    }
    return null;
  }

  find(sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, reach = 1): Path | null {
    const start = this.nodeNear(sx, sy, sz);
    if (!start) return null;
    const off = this.n === 2 ? 1 : 0.5;
    const gx = tx - off, gz = tz - off;
    const nodes = new Map<number, SNode>();
    const key = (x: number, y: number, z: number) => ((x - start.x + 512) * 1024 + (z - start.z + 512)) * 512 + (y + 64);
    const heur = (x: number, y: number, z: number) => Math.hypot(x - gx, (y - ty) * 1.2, z - gz);
    const s: SNode = { ...start, g: 0, h: heur(start.x, start.floor, start.z), f: 0, parent: null, heap: -1, closed: false };
    s.f = s.h;
    nodes.set(key(s.x, s.y, s.z), s);
    const open = new Heap();
    open.push(s);
    let best = s;
    let expanded = 0;
    let found: SNode | null = null;
    const maxD2 = this.o.maxDist * this.o.maxDist;
    while (open.size && expanded < this.o.maxNodes) {
      const cur = open.pop();
      cur.closed = true;
      expanded++;
      if (cur.h < best.h) best = cur;
      if (Math.hypot(cur.x - gx, cur.floor - ty, cur.z - gz) <= reach + 0.01) { found = cur; break; }
      this.neighbors(cur, (x, y, z, floor, cost) => {
        if ((x - start.x) ** 2 + (z - start.z) ** 2 > maxD2) return;
        const k = key(x, y, z);
        let nb = nodes.get(k);
        const g = cur.g + cost;
        if (!nb) {
          nb = { x, y, z, floor, g, h: heur(x, floor, z), f: 0, parent: cur, heap: -1, closed: false };
          nb.f = g + nb.h;
          nodes.set(k, nb);
          open.push(nb);
        } else if (!nb.closed && g < nb.g) {
          nb.g = g; nb.f = g + nb.h; nb.parent = cur; nb.floor = floor;
          if (nb.heap >= 0) open.update(nb);
        }
      });
    }
    const end = found ?? best;
    if (!found && end === s) return new Path([], false, tx, ty, tz, expanded);
    const list: PathNode[] = [];
    for (let n: SNode | null = end; n; n = n.parent) list.push({ x: n.x, y: n.y, z: n.z, floor: n.floor });
    list.reverse();
    list.shift(); // the start node
    return new Path(this.smooth(start, list), !!found, tx, ty, tz, expanded);
  }

  private neighbors(c: SNode, emit: (x: number, y: number, z: number, floor: number, cost: number) => void) {
    const o = this.o;
    const inWater = this.isWater(c.x, Math.floor(c.floor + 0.01), c.z);
    const headroom = (dy: number) => {
      // free space above the current node for a jump of dy
      const top = c.floor + o.height;
      for (let yy = Math.floor(top - 0.001) + 1; yy <= Math.floor(top + dy - 0.001); yy++)
        for (let dz = 0; dz < this.n; dz++) for (let dx = 0; dx < this.n; dx++) if (this.cellTop(c.x + dx, yy, c.z + dz) >= 0) return false;
      return true;
    };
    const passOk = new Array(8).fill(false);
    for (let d = 0; d < 8; d++) {
      const [dx, dz] = DIRS[d];
      if (d >= 4 && !(passOk[dx > 0 ? 0 : 1] && passOk[dz > 0 ? 2 : 3])) continue;
      const nx = c.x + dx, nz = c.z + dz;
      const base = d >= 4 ? 1.4142 : 1;
      // same level / step up within 0.6 / jump up to 1.25
      let done = false;
      for (const dy of [0, 1]) {
        const f = this.floorAt(nx, c.y + dy, nz);
        if (Number.isNaN(f)) continue;
        const rise = f - c.floor;
        if (rise > 1.25 || rise < -0.6) continue;
        if (rise > 0.6 && !(headroom(rise) && (c.floor % 1 < 0.01 || inWater || true))) continue;
        const cost = base + (rise > 0.6 ? 0.6 : 0) + this.malus(nx, c.y + dy, nz, f);
        emit(nx, c.y + dy, nz, f, cost);
        if (dy === 0 && rise <= 0.6) passOk[d] = true;
        done = true;
        break;
      }
      if (done) continue;
      // drop down
      if (d < 4 || true) {
        // the cell at our level must be clear for the body to move over the edge
        let clear = true;
        for (let yy = Math.floor(c.floor + 0.01); yy <= Math.floor(c.floor + o.height - 0.001) && clear; yy++)
          for (let ez = 0; ez < this.n && clear; ez++) for (let ex = 0; ex < this.n; ex++) if (this.cellTop(nx + ex, yy, nz + ez) >= 0) { clear = false; break; }
        if (clear) {
          if (d < 4) passOk[d] = true;
          for (let k = 1; k <= o.maxDrop + 20; k++) {
            const yy = c.y - k;
            if (yy < -64) break;
            const f = this.floorAt(nx, yy, nz);
            if (!Number.isNaN(f)) {
              const water = this.isWater(nx, Math.floor(f + 0.01), nz);
              if (k > o.maxDrop && !water) break;
              emit(nx, yy, nz, f, base + k * 0.4 + this.malus(nx, yy, nz, f));
              break;
            }
            // stop if something solid blocks the fall column
            if (this.cellTop(nx, yy, nz) >= 0) break;
          }
        }
      }
      // wall climbing
      if (o.climb > 0 && d < 4) {
        for (let k = 1; k <= o.climb; k++) {
          // column above the current node must be clear
          const yy = Math.floor(c.floor + o.height - 0.001) + k;
          if (this.cellTop(c.x, yy, c.z) >= 0) break;
          let hit = false;
          for (const step of this.n === 2 ? [1, 2] : [1]) {
            const cx2 = c.x + dx * step, cz2 = c.z + dz * step;
            const f = this.floorAt(cx2, c.y + k, cz2);
            if (!Number.isNaN(f)) { emit(cx2, c.y + k, cz2, f, base * step + k * 0.8); hit = true; break; }
          }
          if (hit) break;
        }
      }
    }
    // swimming vertically
    if (inWater && o.canSwim) {
      for (const dy of [1, -1]) {
        const f = this.floorAt(c.x, c.y + dy, c.z);
        if (!Number.isNaN(f) && (this.isWater(c.x, c.y + dy, c.z) || dy > 0)) emit(c.x, c.y + dy, c.z, f, 1.2 + this.malus(c.x, c.y + dy, c.z, f));
      }
    }
  }

  /** String pulling: skip intermediate nodes where a straight walk on level ground is clear. */
  private smooth(start: PathNode, nodes: PathNode[]): PathNode[] {
    if (nodes.length < 3) return nodes;
    const out: PathNode[] = [];
    let from: PathNode = start;
    let i = 0;
    while (i < nodes.length) {
      let j = Math.min(nodes.length - 1, i + 10);
      for (; j > i; j--) if (this.straight(from, nodes[j])) break;
      out.push(nodes[j]);
      from = nodes[j];
      i = j + 1;
    }
    return out;
  }

  private straight(a: PathNode, b: PathNode): boolean {
    if (Math.abs(a.floor - b.floor) > 0.01) return false;
    const ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist * 4);
    const hw = this.n === 2 ? 0.95 : 0.45;
    const off = this.n === 2 ? 1 : 0.5;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = ax + off + (bx - ax) * t, pz = az + off + (bz - az) * t;
      for (const [ox, oz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) {
        const cx = Math.floor(px + ox), cz = Math.floor(pz + oz);
        const f = this.columnFloor(cx, a.y, cz);
        if (Number.isNaN(f) || Math.abs(f - a.floor) > 0.01) return false;
        if (this.malus(cx, a.y, cz, f) > 0) return false;
      }
    }
    return true;
  }
}

/** Convenience wrapper. */
export function findPath(w: PathWorld, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, opts: PathOptions, reach = 1): Path | null {
  return new Pathfinder(w, opts).find(from.x, from.y, from.z, to.x, to.y, to.z, reach);
}

/** Centre position of a path node for an entity of the given width. */
export function nodeCenter(n: PathNode, width: number): [number, number, number] {
  const off = width > 1.01 ? 1 : 0.5;
  return [n.x + off, n.floor, n.z + off];
}
