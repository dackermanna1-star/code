// A* pathfinding over walkable voxel cells for zombies.
// A node is a standing position (x, y, z): block (x, y-1, z) supports, cells y and y+1 are passable.
// Closed doors / glass / barricades are "bashable": passable at extra cost (the zombie breaks through).
import { BLOCKS, SOLID, IS_DOOR, B, FACING_DIR } from '../world/blocks.js';

const MAX_NODES = 900;

function passable(world, x, y, z) {
  const id = world.get(x, y, z);
  if (!SOLID[id]) return 0; // free
  if (IS_DOOR[id]) return world.getMeta(x, y, z) & 4 ? 0 : 2; // open door panel sits at the side
  if (id === B.glass || id === B.glass_shop || id === B.barricade) return 2;
  return 1;
}

const LOW_TOP = new Uint8Array(256);
const STAIRS = new Uint8Array(256);
for (const d of BLOCKS) {
  if (d.solid && d.render === 'boxes' && !d.door) {
    const top = Math.max(...(d.boxes || [[0, 0, 0, 1, 1, 1]]).map((bx) => bx[4]));
    LOW_TOP[d.id] = top <= 0.6 || d.name.includes('stairs') ? 1 : 0;
    if (d.name.includes('stairs') && d.oriented) STAIRS[d.id] = 1;
  }
}

/** Is (x,y,z) a standing cell (feet at y)? 0 = no, 1 = yes, 2 = yes but a door/window must be bashed */
export function standable(world, x, y, z) {
  if (y < 1 || y >= world.SY - 2) return 0;
  const here = world.get(x, y, z);
  if (LOW_TOP[here]) {
    // standing on a slab / stairs inside this cell: need headroom above
    if (passable(world, x, y + 1, z) === 1 || passable(world, x, y + 2, z) === 1) return 0;
    return 1;
  }
  const below = world.get(x, y - 1, z);
  if (!SOLID[below]) return 0;
  if (BLOCKS[below].damage > 0) return 0;
  const a = passable(world, x, y, z), b = passable(world, x, y + 1, z);
  if (a === 1 || b === 1) return 0;
  return a === 2 || b === 2 ? 2 : 1;
}

/** Drop (x,y,z) down to the nearest standable y (within 4). Returns y or -1. */
export function groundAt(world, x, y, z) {
  for (let dy = 0; dy <= 4; dy++) {
    if (standable(world, x, y - dy, z)) return y - dy;
  }
  for (let dy = 1; dy <= 2; dy++) if (standable(world, x, y + dy, z)) return y + dy;
  return -1;
}

/** Is the point (x, z) at standing height y inside one of the (rotated) vehicle colliders, grown by `pad`? */
export function vehicleBlocks(cars, x, y, z, pad = 0.3) {
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (y >= c.top - 0.2 || y + 1.8 <= c.bottom) continue;
    const rx = x - c.x, rz = z - c.z;
    if (rx * rx + rz * rz > (c.r + pad + 0.8) ** 2) continue;
    const lx = rx * c.cos - rz * c.sin, lz = rx * c.sin + rz * c.cos;
    if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) return true;
  }
  return false;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

/** Binary heap keyed by f */
class Heap {
  constructor() { this.a = []; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Find a path from (sx,sy,sz) to (tx,ty,tz) (integer standing cells).
 * Returns array of {x,y,z,bash} waypoints (excluding start) or null. Partial path toward the closest node if target unreachable.
 */
export function findPath(world, sx, sy, sz, tx, ty, tz, opts = {}) {
  const canJump = opts.canJump !== false;
  const noBash = !!opts.noBash; // wandering zombies don't break into buildings: doors / windows are walls
  const cars = opts.cars && opts.cars.length ? opts.cars : null; // vehicle colliders to walk around
  const maxNodes = opts.maxNodes || MAX_NODES;
  const key = (x, y, z) => (x * 64 + y) * 1100 + z;
  const open = new Heap();
  const nodes = new Map();
  const h = (x, y, z) => Math.hypot(x - tx, z - tz) + Math.abs(y - ty) * 1.5;
  const start = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), parent: null, bash: false, closed: false };
  nodes.set(key(sx, sy, sz), start);
  open.push(start);
  let best = start, bestH = start.f;
  let expanded = 0;
  while (open.size && expanded < maxNodes) {
    const cur = open.pop();
    if (cur.closed) continue;
    cur.closed = true;
    expanded++;
    const ch = h(cur.x, cur.y, cur.z);
    if (ch < bestH) { bestH = ch; best = cur; }
    if (cur.x === tx && cur.z === tz && Math.abs(cur.y - ty) <= 1) { best = cur; break; }
    const curId = world.get(cur.x, cur.y, cur.z);
    const curLow = LOW_TOP[curId] ? 0.5 : 0;
    const curStair = STAIRS[curId] ? world.getMeta(cur.x, cur.y, cur.z) & 3 : -1;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (dx && dz) {
        // no diagonal corner cutting
        if (!standable(world, cur.x + dx, cur.y, cur.z) && !standable(world, cur.x, cur.y, cur.z + dz)) continue;
        if (passable(world, cur.x + dx, cur.y + 1, cur.z) === 1 || passable(world, cur.x, cur.y + 1, cur.z + dz) === 1) continue;
      }
      // try same level, step up 1, drop down up to 3. Heights are real foot heights: a slab / stair cell is
      // stood on at +0.5 (a stair's back half at +1), so stairs are walked up from their low front side,
      // and a 1-block step needs a jump (which crawlers can't do).
      let hc = curLow;
      if (curStair >= 0 && dx === -FACING_DIR[curStair][0] && dz === -FACING_DIR[curStair][2]) hc = 1; // over the high back edge
      for (const dy of [0, 1, -1, -2, -3]) {
        const ny = cur.y + dy;
        const s = standable(world, nx, ny, nz);
        if (!s) continue;
        const nid = world.get(nx, ny, nz);
        let low = LOW_TOP[nid] ? 0.5 : 0;
        if (STAIRS[nid]) {
          const f = FACING_DIR[world.getMeta(nx, ny, nz) & 3];
          if (dx !== -f[0] || dz !== -f[2]) low = 1; // entering from the side / back: the high half is in the way
        }
        const rise = dy + low - hc;
        if (rise > 1.15) continue;
        const jump = rise > 0.6;
        if (jump && (!canJump || passable(world, cur.x, cur.y + 2, cur.z) === 1)) continue; // can't jump / no headroom
        if (s === 2 && noBash) break;
        if (cars && vehicleBlocks(cars, nx + 0.5, ny, nz + 0.5)) break;
        if (dy < 0) {
          // need free space to walk off the edge
          let ok = true;
          for (let yy = ny + 1; yy <= cur.y + 1; yy++) if (passable(world, nx, yy, nz) === 1) { ok = false; break; }
          if (!ok) break;
        }
        const k = key(nx, ny, nz);
        const g = cur.g + cost + (s === 2 ? 10 : 0) + (jump ? 0.8 : rise > 0.1 ? 0.15 : dy < 0 ? 0.3 * -dy : 0);
        let n = nodes.get(k);
        if (n && (n.closed || n.g <= g)) break;
        if (!n) { n = { x: nx, y: ny, z: nz, g, f: 0, parent: cur, bash: s === 2, closed: false }; nodes.set(k, n); }
        n.g = g; n.parent = cur; n.f = g + h(nx, ny, nz); n.bash = s === 2;
        open.push(n);
        break;
      }
    }
  }
  if (best === start) return null;
  const path = [];
  for (let n = best; n && n !== start; n = n.parent) path.push({ x: n.x + 0.5, y: n.y, z: n.z + 0.5, bash: n.bash });
  path.reverse();
  // simple smoothing: drop collinear points
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const a = out[out.length - 1], b = path[i], c = path[i + 1];
    if (a && c && !b.bash && a.y === b.y && b.y === c.y && Math.sign(b.x - a.x) === Math.sign(c.x - b.x) && Math.sign(b.z - a.z) === Math.sign(c.z - b.z)) continue;
    out.push(b);
  }
  return out;
}
