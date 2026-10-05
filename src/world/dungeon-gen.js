// Procedural dungeon layout. Produces pure data (grid + rooms + entity spawn list); the world
// builder turns it into meshes and live entities.
import { RNG } from '../core/rng.js';
import { C, DIRS, TILE, CORRIDOR_CEIL } from './constants.js';

export const F = {
  WATER: 1,
  SECRET: 2,
  DOOR: 4,
  CORRIDOR: 8,
  RESERVED: 16,
  TRAP: 32,
  GATE: 64,
};

const ENEMY_COST = {
  bat: 0.5, slime: 1, skeleton: 1, goblin: 0.85, skeletonArcher: 1.2, ghoul: 1.15, cultist: 1.5, bomber: 1, knight: 2, brute: 2.6,
  bandit: 1.2, banditArcher: 1.3, spearman: 1.5, sellsword: 2.6, spider: 0.9, skeletonGuard: 1.6,
};
const MIN_FLOOR = {
  bat: 1, slime: 1, skeleton: 1, goblin: 1, skeletonArcher: 1, ghoul: 1, cultist: 2, bomber: 2, knight: 3, brute: 2,
  bandit: 1, banditArcher: 1, spider: 1, spearman: 2, skeletonGuard: 2, sellsword: 3,
};

class MinHeap {
  constructor() { this.a = []; }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export function generateDungeon(seed, floor, theme) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const d = tryGenerate(new RNG(`${seed}|floor${floor}|${attempt}`), floor, theme);
    if (d) return d;
  }
  throw new Error('Dungeon generation failed');
}

function tryGenerate(rng, floor, theme) {
  const W = Math.min(74, 50 + floor * 5);
  const H = W;
  const N = W * H;
  const cells = new Uint8Array(N);
  const roomOf = new Int16Array(N).fill(-1);
  const ceil = new Float32Array(N);
  const flags = new Uint8Array(N);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  const rooms = [];

  const overlaps = (x, y, w, h, m) => rooms.some((r) => x - m < r.x + r.w && x + w + m > r.x && y - m < r.y + r.h && y + h + m > r.y);

  const addRoom = (x, y, w, h, kind) => {
    const room = {
      id: rooms.length, x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2),
      type: kind || 'normal', shape: 'rect', neighbors: new Set(), entrances: [], depth: 0,
      ceil: Math.min(7.5, 4.2 + Math.sqrt(w * h) * 0.22 + rng.range(0, 0.6)), decor: null, water: false,
    };
    rooms.push(room);
    return room;
  };

  // --- boss arena first, against an edge region
  const bw = rng.int(11, 13), bh = rng.int(11, 13);
  const edge = rng.int(0, 3);
  let bx, by;
  if (edge === 0) { bx = 2; by = rng.int(2, H - bh - 2); }
  else if (edge === 1) { bx = W - bw - 2; by = rng.int(2, H - bh - 2); }
  else if (edge === 2) { bx = rng.int(2, W - bw - 2); by = 2; }
  else { bx = rng.int(2, W - bw - 2); by = H - bh - 2; }
  const boss = addRoom(bx, by, bw, bh, 'boss');
  boss.ceil = 8.5;

  const target = Math.min(18, 10 + floor + rng.int(0, 2));
  for (let i = 0; i < 600 && rooms.length < target; i++) {
    let w = rng.int(5, 10), h = rng.int(5, 10);
    if (rng.chance(0.15)) { w = rng.int(4, 5); h = rng.int(9, 13); if (rng.chance(0.5)) [w, h] = [h, w]; }
    const x = rng.int(2, W - w - 3), y = rng.int(2, H - h - 3);
    if (overlaps(x, y, w, h, 3)) continue;
    addRoom(x, y, w, h);
  }
  if (rooms.length < 8) return null;

  // carve rooms + shapes
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      cells[idx(x, y)] = C.FLOOR;
      roomOf[idx(x, y)] = r.id;
      ceil[idx(x, y)] = r.ceil;
    }
  }

  // --- connectivity: MST over non-boss rooms + a few loops, boss connects to nearest room only
  const others = rooms.filter((r) => r !== boss);
  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const inTree = new Set([others[0]]);
  const edges = [];
  while (inTree.size < others.length) {
    let best = null, bd = Infinity;
    for (const a of inTree) for (const b of others) {
      if (inTree.has(b)) continue;
      const dd = dist(a, b);
      if (dd < bd) { bd = dd; best = [a, b]; }
    }
    edges.push(best);
    inTree.add(best[1]);
  }
  // loops for alternate routes
  const extra = [];
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
    const a = others[i], b = others[j];
    if (edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
    const dd = dist(a, b);
    if (dd < 22) extra.push([dd, a, b]);
  }
  extra.sort((p, q) => p[0] - q[0]);
  let loops = 0;
  for (const [, a, b] of extra) {
    if (loops >= 2 + Math.floor(floor / 2)) break;
    if (rng.chance(0.45)) { edges.push([a, b]); loops++; }
  }
  let nearestToBoss = null, nb = Infinity;
  for (const r of others) { const dd = dist(r, boss); if (dd < nb) { nb = dd; nearestToBoss = r; } }
  edges.push([nearestToBoss, boss]);

  // --- corridors with A* (straight-preferring, avoids hugging rooms)
  const isDoorCell = (x, y) => (flags[idx(x, y)] & F.DOOR) !== 0;
  const nearRoom = (x, y) => {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (roomOf[idx(nx, ny)] >= 0) return true;
    }
    return false;
  };

  const pickExit = (room, toward) => {
    const dx = toward.cx - room.cx, dy = toward.cy - room.cy;
    let sides;
    if (Math.abs(dx) > Math.abs(dy)) sides = [dx > 0 ? 'E' : 'W', dy > 0 ? 'S' : 'N'];
    else sides = [dy > 0 ? 'S' : 'N', dx > 0 ? 'E' : 'W'];
    for (const side of sides) {
      // reuse an existing entrance on this side sometimes
      const existing = room.entrances.filter((e) => e.side === side);
      if (existing.length && rng.chance(0.55) && room.type !== 'boss') return existing[0];
      for (let tries = 0; tries < 12; tries++) {
        let ox, oy, ix, iy;
        const m = room.w >= 7 && room.h >= 7 ? 2 : 1;
        if (side === 'E' || side === 'W') {
          if (room.h - 2 * m < 1) break;
          oy = iy = rng.int(room.y + m, room.y + room.h - 1 - m);
          ix = side === 'E' ? room.x + room.w - 1 : room.x;
          ox = side === 'E' ? ix + 1 : ix - 1;
        } else {
          if (room.w - 2 * m < 1) break;
          ox = ix = rng.int(room.x + m, room.x + room.w - 1 - m);
          iy = side === 'S' ? room.y + room.h - 1 : room.y;
          oy = side === 'S' ? iy + 1 : iy - 1;
        }
        if (!inb(ox, oy)) continue;
        if (roomOf[idx(ox, oy)] >= 0) continue;
        // keep doors apart
        let bad = false;
        for (const e of room.entrances) if (Math.abs(e.ox - ox) + Math.abs(e.oy - oy) < 3) bad = true;
        if (bad) continue;
        const e = { side, ox, oy, ix, iy, room: room.id };
        room.entrances.push(e);
        return e;
      }
    }
    return null;
  };

  const astar = (sx, sy, tx, ty) => {
    const S = N * 4;
    const g = new Float32Array(S).fill(Infinity);
    const from = new Int32Array(S).fill(-1);
    const heap = new MinHeap();
    for (let d = 0; d < 4; d++) {
      const s = idx(sx, sy) * 4 + d;
      g[s] = 0;
      heap.push({ s, f: Math.abs(tx - sx) + Math.abs(ty - sy) });
    }
    while (heap.size) {
      const { s } = heap.pop();
      const ci = s >> 2, dir = s & 3;
      const x = ci % W, y = (ci / W) | 0;
      if (x === tx && y === ty) {
        const path = [];
        let cur = s;
        while (cur >= 0) { path.push(cur >> 2); cur = from[cur]; }
        return path.reverse();
      }
      for (let nd = 0; nd < 4; nd++) {
        const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1];
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (roomOf[ni] >= 0) continue;
        const isTarget = nx === tx && ny === ty;
        if (!isTarget && nearRoom(nx, ny)) continue;
        let cost = cells[ni] === C.FLOOR ? 0.55 : 1;
        if (nd !== dir) cost += 0.9;
        const ns = ni * 4 + nd;
        const ng = g[s] + cost;
        if (ng < g[ns]) {
          g[ns] = ng;
          from[ns] = s;
          heap.push({ s: ns, f: ng + Math.abs(tx - nx) + Math.abs(ty - ny) });
        }
      }
    }
    return null;
  };

  for (const [a, b] of edges) {
    const ea = pickExit(a, b), eb = pickExit(b, a);
    if (!ea || !eb) { if (a === boss || b === boss) return null; continue; }
    const path = astar(ea.ox, ea.oy, eb.ox, eb.oy);
    if (!path) { if (a === boss || b === boss) return null; continue; }
    for (const ci of path) {
      if (cells[ci] !== C.FLOOR) {
        cells[ci] = C.FLOOR;
        ceil[ci] = CORRIDOR_CEIL;
      }
      flags[ci] |= F.CORRIDOR;
    }
    flags[idx(ea.ox, ea.oy)] |= F.DOOR;
    flags[idx(eb.ox, eb.oy)] |= F.DOOR;
    a.neighbors.add(b.id);
    b.neighbors.add(a.id);
  }

  // door cells must be proper chokepoints (solid on both perpendicular sides); otherwise drop the flag
  const doorList = [];
  for (const r of rooms) {
    for (const e of r.entrances) {
      const i = idx(e.ox, e.oy);
      if (!(flags[i] & F.DOOR)) continue;
      const alongX = e.side === 'E' || e.side === 'W';
      const p1 = alongX ? idx(e.ox, e.oy - 1) : idx(e.ox - 1, e.oy);
      const p2 = alongX ? idx(e.ox, e.oy + 1) : idx(e.ox + 1, e.oy);
      e.valid = cells[p1] === C.SOLID && cells[p2] === C.SOLID;
      if (!e.valid) continue;
      if (doorList.some((d) => d.cx === e.ox && d.cy === e.oy)) continue;
      doorList.push({ cx: e.ox, cy: e.oy, axis: alongX ? 'x' : 'z', roomId: r.id, side: e.side, kind: null });
    }
  }

  // --- graph depth from start (start = farthest from boss)
  const bfsRooms = (src) => {
    const d = new Map([[src.id, 0]]);
    const q = [src];
    while (q.length) {
      const r = q.shift();
      for (const nid of r.neighbors) if (!d.has(nid)) { d.set(nid, d.get(r.id) + 1); q.push(rooms[nid]); }
    }
    return d;
  };
  const fromBoss = bfsRooms(boss);
  if (fromBoss.size < rooms.length - 1) return null;
  let start = null, sd = -1;
  for (const r of others) {
    const d = fromBoss.get(r.id) ?? -1;
    const score = d * 10 + r.w * r.h * 0.01;
    if (d >= 0 && score > sd && r.w * r.h <= 64) { sd = score; start = r; }
  }
  if (!start) return null;
  start.type = 'start';
  const depth = bfsRooms(start);
  for (const r of rooms) r.depth = depth.get(r.id) ?? 0;
  const maxDepth = Math.max(...rooms.map((r) => r.depth));

  // --- room roles
  const free = () => rooms.filter((r) => r.type === 'normal');
  const leaves = free().filter((r) => r.neighbors.size === 1 && !r.neighbors.has(boss.id) && r.depth > 1);
  let vault = null;
  if (leaves.length && rng.chance(0.85)) {
    vault = rng.pick(leaves);
    vault.type = 'vault';
  }
  const mid = free().filter((r) => r.depth >= 2 && r.w * r.h >= 42);
  let miniboss = null;
  if (mid.length && (vault || rng.chance(0.6))) {
    miniboss = rng.pick(mid);
    miniboss.type = 'miniboss';
  }
  const shopCands = free().filter((r) => r.depth >= 1 && r.depth <= Math.max(2, maxDepth - 1));
  if (shopCands.length) rng.pick(shopCands).type = 'shop';
  const shrineCount = rng.int(1, 2);
  for (let i = 0; i < shrineCount; i++) {
    const c = free().filter((r) => r.depth >= 1);
    if (c.length) rng.pick(c).type = 'shrine';
  }
  const arenaCands = free().filter((r) => r.depth >= 2 && r.w >= 6 && r.h >= 6);
  for (let i = 0; i < 1 + (floor >= 3 ? 1 : 0) && arenaCands.length; i++) {
    const r = arenaCands.splice(rng.int(0, arenaCands.length - 1), 1)[0];
    r.type = 'arena';
  }
  for (const r of free()) {
    if (r.depth === 0) continue;
    r.type = rng.chance(0.12) ? 'treasure' : 'combat';
  }
  for (const r of free()) r.type = 'combat';

  // shapes
  for (const r of rooms) {
    if (r.type === 'start' || r.type === 'shop' || r.type === 'vault') continue;
    const big = r.w >= 7 && r.h >= 7;
    const roll = rng.next();
    if (r.type === 'boss') { r.shape = 'octagon'; }
    else if (big && roll < 0.22) r.shape = 'octagon';
    else if (big && r.w >= 8 && r.h >= 8 && roll < 0.42 && !['shrine', 'miniboss', 'arena'].includes(r.type)) r.shape = theme.lava ? 'lava' : 'pit';
    else if (big && roll < 0.62) r.shape = 'pillars';
  }
  for (const r of rooms) {
    if (r.shape === 'octagon') {
      const k = r.type === 'boss' ? 3 : 2;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const dx = Math.min(x, r.w - 1 - x), dy = Math.min(y, r.h - 1 - y);
        if (dx + dy < k) {
          const i = idx(r.x + x, r.y + y);
          // never cut a cell next to an entrance
          if (r.entrances.some((e) => Math.abs(e.ix - (r.x + x)) + Math.abs(e.iy - (r.y + y)) <= 1)) continue;
          cells[i] = C.SOLID;
          roomOf[i] = -1;
        }
      }
    } else if (r.shape === 'pit' || r.shape === 'lava') {
      const type = r.shape === 'lava' ? C.LAVA : C.PIT;
      const x0 = r.x + 2, y0 = r.y + 2, x1 = r.x + r.w - 3, y1 = r.y + r.h - 3;
      const bridgeH = rng.chance(0.5);
      const bridge = bridgeH ? rng.int(y0, y1) : rng.int(x0, x1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if ((bridgeH && y === bridge) || (!bridgeH && x === bridge)) continue;
        cells[idx(x, y)] = type;
      }
    }
    if (theme.id === 'catacombs' && r.type !== 'boss' && r.type !== 'shop' && rng.chance(0.4)) r.water = true;
    if (r.water) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (cells[idx(x, y)] === C.FLOOR) flags[idx(x, y)] |= F.WATER;
  }

  // --- secret rooms carved into solid rock behind a cracked wall
  const secretWalls = [];
  const secretTarget = rng.chance(0.6) ? 2 : 1;
  for (let tries = 0; tries < 400 && secretWalls.length < secretTarget; tries++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (cells[idx(x, y)] !== C.FLOOR) continue;
    if (flags[idx(x, y)] & F.DOOR) continue;
    const [dx, dy] = rng.pick(DIRS);
    const sx = x + dx, sy = y + dy;
    if (!inb(sx, sy) || cells[idx(sx, sy)] !== C.SOLID) continue;
    const rw = rng.int(3, 4), rh = rng.int(3, 4);
    // room rect starting beyond the secret wall cell
    let rx, ry;
    if (dx !== 0) { rx = dx > 0 ? sx + 1 : sx - rw; ry = sy - Math.floor(rh / 2); }
    else { ry = dy > 0 ? sy + 1 : sy - rh; rx = sx - Math.floor(rw / 2); }
    let ok = rx >= 2 && ry >= 2 && rx + rw < W - 2 && ry + rh < H - 2;
    for (let yy = ry - 1; ok && yy <= ry + rh; yy++) for (let xx = rx - 1; xx <= rx + rw; xx++) {
      if (cells[idx(xx, yy)] !== C.SOLID) { ok = false; break; }
    }
    // the secret wall cell's side neighbours must be solid (so it reads as a wall)
    if (ok) {
      const p1 = dx !== 0 ? idx(sx, sy - 1) : idx(sx - 1, sy);
      const p2 = dx !== 0 ? idx(sx, sy + 1) : idx(sx + 1, sy);
      if (cells[p1] !== C.SOLID || cells[p2] !== C.SOLID) ok = false;
    }
    if (!ok) continue;
    const room = addRoom(rx, ry, rw, rh, 'secret');
    room.ceil = 3.6;
    for (let yy = ry; yy < ry + rh; yy++) for (let xx = rx; xx < rx + rw; xx++) {
      cells[idx(xx, yy)] = C.FLOOR;
      roomOf[idx(xx, yy)] = room.id;
      ceil[idx(xx, yy)] = room.ceil;
    }
    cells[idx(sx, sy)] = C.FLOOR;
    ceil[idx(sx, sy)] = 3.0;
    flags[idx(sx, sy)] |= F.SECRET;
    secretWalls.push({ cx: sx, cy: sy, axis: dx !== 0 ? 'x' : 'z', roomId: room.id });
    room.depth = roomOf[idx(x, y)] >= 0 ? rooms[roomOf[idx(x, y)]].depth : 1;
  }

  // --- connectivity sanity check (flood fill over walkable cells, pits count as walkable for reachability)
  {
    const seen = new Uint8Array(N);
    const q = [idx(start.cx, start.cy)];
    seen[q[0]] = 1;
    while (q.length) {
      const ci = q.pop();
      const x = ci % W, y = (ci / W) | 0;
      for (const [dx, dy] of DIRS) {
        const ni = idx(x + dx, y + dy);
        if (!seen[ni] && cells[ni] !== C.SOLID) { seen[ni] = 1; q.push(ni); }
      }
    }
    for (const r of rooms) {
      let any = false;
      for (let y = r.y; y < r.y + r.h && !any; y++) for (let x = r.x; x < r.x + r.w; x++) if (seen[idx(x, y)]) { any = true; break; }
      if (!any) return null;
    }
  }

  // --- door kinds & gates
  const gates = [];
  for (const d of doorList) {
    const r = rooms[d.roomId];
    // a door cell might border two rooms' corridors; use the room it belongs to
    if (r.type === 'boss') d.kind = 'boss';
    else if (r.type === 'vault') d.kind = 'locked';
    else if (r.type === 'arena' || r.type === 'miniboss') d.kind = null;
    else d.kind = rng.chance(0.45) ? 'wood' : null;
    if (r.type === 'arena' || r.type === 'miniboss') {
      gates.push({ cx: d.cx, cy: d.cy, axis: d.axis, roomId: r.id });
      flags[idx(d.cx, d.cy)] |= F.GATE;
    }
  }
  const doors = doorList.filter((d) => d.kind);
  // ensure a door cell is used by only one door (a corridor cell can be the entrance of only one room)
  const doorSet = new Set();
  for (let i = doors.length - 1; i >= 0; i--) {
    const k = doors[i].cx + ',' + doors[i].cy;
    if (doorSet.has(k)) doors.splice(i, 1);
    else doorSet.add(k);
  }

  // ---------------------------------------------------------------- population
  const ents = [];
  const torches = [];
  const occupied = new Uint8Array(N);
  for (const d of doorList) occupied[idx(d.cx, d.cy)] = 1;
  for (const s of secretWalls) occupied[idx(s.cx, s.cy)] = 1;
  const wc = (cx, cy) => [(cx + 0.5) * TILE, (cy + 0.5) * TILE];
  const walk = (x, y) => cells[idx(x, y)] === C.FLOOR;

  const nearEntrance = (r, x, y, dmax = 1) => r.entrances.some((e) => e.valid !== false && Math.abs(e.ix - x) + Math.abs(e.iy - y) <= dmax);

  const roomCells = (r, filter) => {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (roomOf[idx(x, y)] !== r.id || !walk(x, y)) continue;
      if (filter && !filter(x, y)) continue;
      out.push([x, y]);
    }
    return out;
  };
  const wallNormalOf = (x, y) => {
    const ns = [];
    for (const [dx, dy] of DIRS) if (cells[idx(x + dx, y + dy)] === C.SOLID && !(flags[idx(x + dx, y + dy)] & F.SECRET)) ns.push([-dx, -dy]);
    return ns;
  };
  const freeCell = (x, y) => walk(x, y) && !occupied[idx(x, y)];

  // torches along room walls
  for (const r of rooms) {
    const step = r.type === 'boss' ? 2 : 3;
    let k = rng.int(0, step - 1);
    const perim = roomCells(r, (x, y) => wallNormalOf(x, y).length > 0);
    // order perimeter roughly by angle around centre for even spacing
    perim.sort((a, b) => Math.atan2(a[1] - r.cy, a[0] - r.cx) - Math.atan2(b[1] - r.cy, b[0] - r.cx));
    for (const [x, y] of perim) {
      if (k++ % step !== 0) continue;
      if (nearEntrance(r, x, y)) continue;
      const [nx, ny] = wallNormalOf(x, y)[0];
      const [wx, wz] = wc(x, y);
      torches.push({ x: wx - nx * (TILE / 2 - 0.08), y: 2.3, z: wz - ny * (TILE / 2 - 0.08), nx, nz: ny, kind: r.type === 'secret' ? 'candle' : 'torch' });
    }
  }
  // torches along corridors
  {
    let k = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (!(flags[i] & F.CORRIDOR) || roomOf[i] >= 0 || (flags[i] & F.DOOR)) continue;
      if (k++ % 6 !== 0) continue;
      const ns = wallNormalOf(x, y);
      if (!ns.length) continue;
      const [nx, ny] = rng.pick(ns);
      const [wx, wz] = wc(x, y);
      torches.push({ x: wx - nx * (TILE / 2 - 0.08), y: 2.1, z: wz - ny * (TILE / 2 - 0.08), nx, nz: ny, kind: 'torch' });
    }
  }

  const place = (type, x, y, extra = {}) => {
    occupied[idx(x, y)] = 1;
    const [wx, wz] = wc(x, y);
    const e = { type, x: wx, z: wz, cx: x, cy: y, ...extra };
    ents.push(e);
    return e;
  };
  const placeAt = (type, wx, wz, extra = {}) => {
    const e = { type, x: wx, z: wz, ...extra };
    ents.push(e);
    return e;
  };

  const enemyKinds = Object.keys(theme.enemies).filter((k) => (MIN_FLOOR[k] || 1) <= floor);
  const pickEnemy = () => rng.weighted(enemyKinds, (k) => theme.enemies[k]);
  const eliteChance = 0.04 + floor * 0.03;

  const spawnEnemies = (r, budget, opts = {}) => {
    const spots = roomCells(r, (x, y) => !occupied[idx(x, y)] && !nearEntrance(r, x, y, 2));
    rng.shuffle(spots);
    let spent = 0;
    let misses = 0;
    const out = [];
    while (spent < budget && spots.length) {
      const kind = opts.kind || pickEnemy();
      const cost = ENEMY_COST[kind] || 1;
      // remaining budget can't afford this pick; give up after a few tries
      if (spent + cost > budget + 0.4) { if (cost <= 0.6 || ++misses > 10) break; continue; }
      const [x, y] = spots.pop();
      const elite = !opts.noElite && rng.chance(eliteChance) ? 1 + (floor >= 4 && rng.chance(0.4) ? 1 : 0) : 0;
      const [wx, wz] = wc(x, y);
      const e = placeAt('enemy', wx + rng.range(-0.5, 0.5), wz + rng.range(-0.5, 0.5), { kind, roomId: r.id, elite, wave: opts.wave || 0 });
      out.push(e);
      spent += cost * (elite ? 2 : 1);
    }
    return out;
  };

  const budgetFor = (r) => (3.4 + floor * 1.1) * Math.sqrt((r.w * r.h) / 30) * rng.range(0.85, 1.2);

  // decorations (also used as cover / physics toys)
  const decorate = (r) => {
    const styles = ['storage', 'crypt', 'library', 'barracks', 'ritual', 'hall'];
    r.decor = r.type === 'boss' ? 'hall' : r.type === 'secret' ? 'crypt' : rng.pick(styles);
    const area = r.w * r.h;
    const wallSpots = roomCells(r, (x, y) => wallNormalOf(x, y).length > 0 && !nearEntrance(r, x, y, 1));
    rng.shuffle(wallSpots);
    const cornerSpots = wallSpots.filter(([x, y]) => wallNormalOf(x, y).length >= 2);

    // columns
    if (r.shape === 'pillars' || (r.type === 'boss')) {
      const sx = r.type === 'boss' ? 3 : 2;
      for (let y = r.y + 2; y < r.y + r.h - 2; y += sx + 1) for (let x = r.x + 2; x < r.x + r.w - 2; x += sx + 1) {
        if (!freeCell(x, y) || nearEntrance(r, x, y, 2)) continue;
        if (r.type === 'boss' && Math.abs(x - r.cx) < 3 && Math.abs(y - r.cy) < 3) continue;
        place('column', x, y);
      }
    }
    // corner clutter
    for (const [x, y] of cornerSpots) {
      if (!freeCell(x, y)) continue;
      const ns = wallNormalOf(x, y);
      const [wx, wz] = wc(x, y);
      const ox = -(ns[0][0] + ns[1][0]) * 0.65, oz = -(ns[0][1] + ns[1][1]) * 0.65;
      const roll = rng.next();
      occupied[idx(x, y)] = 1;
      if (roll < 0.5) {
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) placeAt(rng.chance(0.5) ? 'barrel' : 'crate', wx + ox + rng.range(-0.5, 0.5), wz + oz + rng.range(-0.5, 0.5), { rot: rng.range(0, 6.28), stack: k === n - 1 && rng.chance(0.3) });
      } else if (roll < 0.75) {
        placeAt('cobweb', wx + ox * 1.6, wz + oz * 1.6, { rot: Math.atan2(-(ns[0][0] + ns[1][0]), -(ns[0][1] + ns[1][1])), y: r.ceil });
        placeAt(rng.chance(0.5) ? 'bones' : 'pot', wx + ox, wz + oz, { rot: rng.range(0, 6.28) });
      } else {
        placeAt('candles', wx + ox, wz + oz, {});
      }
    }
    // wall furniture
    let furn = Math.floor(area / 14);
    for (const [x, y] of wallSpots) {
      if (furn <= 0) break;
      if (!freeCell(x, y)) continue;
      const ns = wallNormalOf(x, y);
      if (ns.length !== 1) continue;
      const [nx, ny] = ns[0];
      const [wx, wz] = wc(x, y);
      const rot = Math.atan2(nx, ny);
      const px = wx - nx * 0.7, pz = wz - ny * 0.7;
      let kind;
      switch (r.decor) {
        case 'library': kind = rng.pick(['bookshelf', 'bookshelf', 'table', 'candles']); break;
        case 'storage': kind = rng.pick(['crate', 'barrel', 'pot', 'pot', 'weaponRack']); break;
        case 'crypt': kind = rng.pick(['sarcophagus', 'bones', 'candles', 'pot', 'statue']); break;
        case 'barracks': kind = rng.pick(['weaponRack', 'table', 'barrel', 'banner']); break;
        case 'ritual': kind = rng.pick(['candles', 'statue', 'banner', 'bones', 'cage']); break;
        default: kind = rng.pick(['banner', 'statue', 'pot', 'barrel', 'chains']);
      }
      occupied[idx(x, y)] = 1;
      placeAt(kind, px, pz, { rot, nx, nz: ny, wallX: wx - nx * TILE / 2, wallZ: wz - ny * TILE / 2 });
      if (kind === 'table' && rng.chance(0.7)) {
        placeAt('chair', px - ny * 0.9 + nx * 0.6, pz + nx * 0.9 + ny * 0.6, { rot: rot + rng.range(-0.6, 0.6) + Math.PI / 2 });
      }
      furn--;
    }
    // pots scattered along walls
    let pots = Math.floor(area / 18) + rng.int(0, 2);
    for (const [x, y] of wallSpots) {
      if (pots <= 0) break;
      if (!freeCell(x, y)) continue;
      const [nx, ny] = wallNormalOf(x, y)[0];
      const [wx, wz] = wc(x, y);
      occupied[idx(x, y)] = 1;
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) placeAt('pot', wx - nx * 0.75 + rng.range(-0.6, 0.6) * Math.abs(ny), wz - ny * 0.75 + rng.range(-0.6, 0.6) * Math.abs(nx), { rot: rng.range(0, 6) });
      pots--;
    }
    // hanging chains / rugs / centrepiece
    if (r.type !== 'boss' && rng.chance(0.4)) placeAt('chains', (r.cx + 0.5) * TILE + rng.range(-2, 2), (r.cy + 0.5) * TILE + rng.range(-2, 2), { y: r.ceil });
    if (rng.chance(0.35) && r.shape !== 'pit' && r.shape !== 'lava' && freeCell(r.cx, r.cy)) placeAt('rug', (r.cx + 0.5) * TILE, (r.cy + 0.5) * TILE, { rot: r.w > r.h ? 0 : Math.PI / 2, w: Math.min(r.w - 2, 4) * TILE * 0.5, h: Math.min(r.h - 2, 3) * TILE * 0.5 });
    // braziers in big rooms
    if (area >= 56 && r.type !== 'boss' && r.shape !== 'pit' && r.shape !== 'lava') {
      const spots = roomCells(r, (x, y) => freeCell(x, y) && !wallNormalOf(x, y).length && !nearEntrance(r, x, y, 2));
      if (spots.length) {
        const [x, y] = rng.pick(spots);
        place('brazier', x, y);
      }
    }
  };

  const chestTier = (base) => base + (rng.chance(0.2 + floor * 0.04) ? 1 : 0);

  for (const r of rooms) {
    if (r.type !== 'start') decorate(r);
    const [cxw, czw] = wc(r.cx, r.cy);
    switch (r.type) {
      case 'start': {
        r.decor = 'crypt';
        placeAt('candles', cxw + 1.5, czw + 1.2, {});
        placeAt('bones', cxw - 1.8, czw - 1.4, {});
        break;
      }
      case 'combat': {
        spawnEnemies(r, budgetFor(r));
        if (rng.chance(0.45)) {
          const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 2));
          if (s.length) { const [x, y] = rng.pick(s); place('explosiveBarrel', x, y); }
        }
        if (rng.chance(0.18)) {
          const s = roomCells(r, (x, y) => freeCell(x, y) && wallNormalOf(x, y).length > 0 && !nearEntrance(r, x, y, 1));
          if (s.length) { const [x, y] = rng.pick(s); const [nx, ny] = wallNormalOf(x, y)[0]; place('chest', x, y, { tier: chestTier(0), rot: Math.atan2(nx, ny), mimic: floor >= 2 && rng.chance(0.15) }); }
        }
        break;
      }
      case 'arena': {
        r.waves = 2 + (floor >= 3 ? 1 : 0);
        for (let w = 0; w < r.waves; w++) spawnEnemies(r, budgetFor(r) * (0.75 + w * 0.2), { wave: w + 1 });
        place('chest', r.cx, r.cy, { tier: chestTier(1), hidden: true, rot: 0 });
        break;
      }
      case 'miniboss': {
        const kinds = enemyKinds.filter((k) => ENEMY_COST[k] >= 1);
        placeAt('enemy', cxw, czw, { kind: rng.pick(kinds), roomId: r.id, elite: 3, miniboss: true, dropKey: !!vault, wave: 1 });
        spawnEnemies(r, budgetFor(r) * 0.5, { noElite: true, wave: 1 });
        break;
      }
      case 'treasure': {
        const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 1));
        rng.shuffle(s);
        for (let k = 0; k < rng.int(1, 2) && s.length; k++) { const [x, y] = s.pop(); place('chest', x, y, { tier: chestTier(0), rot: rng.range(0, 6.28), mimic: floor >= 2 && rng.chance(0.12) }); }
        // trapped floor
        for (let k = 0; k < Math.floor(r.w * r.h / 8) && s.length; k++) { const [x, y] = s.pop(); place('trap', x, y, { kind: 'spikes' }); flags[idx(x, y)] |= F.TRAP; }
        spawnEnemies(r, budgetFor(r) * 0.4);
        break;
      }
      case 'vault': {
        const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 1));
        rng.shuffle(s);
        for (let k = 0; k < 2 && s.length; k++) { const [x, y] = s.pop(); place('chest', x, y, { tier: 2 + (rng.chance(0.3) ? 1 : 0), rot: rng.range(0, 6.28) }); }
        if (s.length) { const [x, y] = s.pop(); place('pedestal', x, y, { item: 'relic', tier: 2 }); }
        break;
      }
      case 'secret': {
        const roll = rng.next();
        if (roll < 0.45) place('pedestal', r.cx, r.cy, { item: 'relic', tier: 1 + (rng.chance(0.3) ? 1 : 0) });
        else if (roll < 0.75) place('chest', r.cx, r.cy, { tier: 2, rot: rng.range(0, 6.28) });
        else place('shrine', r.cx, r.cy, { kind: rng.pick(['fortune', 'blood', 'fountain']) });
        break;
      }
      case 'shop': {
        r.decor = 'storage';
        place('shop', r.cx, r.cy, {});
        // reserve the shop strip
        for (let x = r.cx - 2; x <= r.cx + 2; x++) for (let y = r.cy - 1; y <= r.cy + 1; y++) if (walk(x, y)) occupied[idx(x, y)] = 1;
        break;
      }
      case 'shrine': {
        place('shrine', r.cx, r.cy, { kind: rng.pick(['blood', 'fortune', 'fountain', 'anvil', 'gamble', 'challenge']) });
        if (rng.chance(0.4)) spawnEnemies(r, budgetFor(r) * 0.5);
        break;
      }
      case 'boss': {
        place('exit', r.cx, r.cy, {});
        break;
      }
      default:
    }
  }

  // corridor wanderers and traps
  {
    const corridorCells = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if ((flags[i] & F.CORRIDOR) && roomOf[i] < 0 && !(flags[i] & (F.DOOR | F.SECRET)) && cells[i] === C.FLOOR) corridorCells.push([x, y]);
    }
    rng.shuffle(corridorCells);
    const trapCount = Math.floor(corridorCells.length * (0.035 + floor * 0.008));
    let placed = 0;
    const trapKinds = ['spikes', 'spikes', 'darts', 'blade'];
    if (theme.lava || floor >= 3) trapKinds.push('flame', 'flame');
    for (const [x, y] of corridorCells) {
      if (placed >= trapCount) break;
      if (occupied[idx(x, y)]) continue;
      // keep traps away from the start room
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < 10) continue;
      const kind = rng.pick(trapKinds);
      // straight corridor check for blades/darts
      const horiz = walk(x - 1, y) && walk(x + 1, y) && !walk(x, y - 1) && !walk(x, y + 1);
      const vert = walk(x, y - 1) && walk(x, y + 1) && !walk(x - 1, y) && !walk(x + 1, y);
      if ((kind === 'blade' || kind === 'darts') && !horiz && !vert) continue;
      place('trap', x, y, { kind, axis: horiz ? 'x' : 'z' });
      flags[idx(x, y)] |= F.TRAP;
      placed++;
    }
    let wand = Math.floor(corridorCells.length / 40) + floor;
    for (const [x, y] of corridorCells) {
      if (wand <= 0) break;
      if (occupied[idx(x, y)]) continue;
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < 12) continue;
      const [wx, wz] = wc(x, y);
      placeAt('enemy', wx, wz, { kind: rng.chance(0.5) ? 'bat' : pickEnemy(), roomId: -1, elite: 0 });
      occupied[idx(x, y)] = 1;
      wand--;
    }
  }

  // key placement fallback (no miniboss): put it in a chest somewhere reachable
  if (vault && !miniboss) {
    const cand = rooms.filter((r) => r.type === 'combat' || r.type === 'treasure');
    const r = cand.length ? rng.pick(cand) : start;
    const s = roomCells(r, (x, y) => freeCell(x, y));
    if (s.length) { const [x, y] = rng.pick(s); place('chest', x, y, { tier: 1, rot: 0, key: true }); }
  }

  // floor loot sprinkles
  for (const r of rooms) {
    if (r.type === 'shop' || r.type === 'boss' || r.type === 'start') continue;
    if (rng.chance(0.3)) {
      const s = roomCells(r, (x, y) => freeCell(x, y));
      if (s.length) { const [x, y] = rng.pick(s); const [wx, wz] = wc(x, y); placeAt('loot', wx, wz, { what: rng.chance(0.7) ? 'gold' : 'potion' }); }
    }
  }

  const [sx, sz] = wc(start.cx, start.cy);
  return {
    W, H, cells, roomOf, ceil, flags, rooms, doors, gates, secretWalls, torches, entrances: doorList,
    entities: ents, start: { x: sx, z: sz }, startRoom: start.id, bossRoom: boss.id, floor, theme,
  };
}
