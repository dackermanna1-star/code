// Procedural dungeon layout. Each floor is one great ruined building: a main block with wings and a
// boss wing, carved into rooms and long halls that share walls and connect through doorways. Wings and
// rooms sit at different heights joined by stairs. Rooms get a purpose (library, kitchen, chapel...)
// that decides their furnishing. Produces pure data (grid + rooms + entity spawn list); the world
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
  STAIR: 128,
};

const ENEMY_COST = {
  bat: 0.5, slime: 1, skeleton: 1, goblin: 0.85, skeletonArcher: 1.2, ghoul: 1.15, cultist: 1.5, bomber: 1, knight: 2, brute: 2.6,
  bandit: 1.2, banditArcher: 1.3, spearman: 1.5, sellsword: 2.6, spider: 0.9, skeletonGuard: 1.6,
};
const MIN_FLOOR = {
  bat: 1, slime: 1, skeleton: 1, goblin: 1, skeletonArcher: 1, ghoul: 1, cultist: 2, bomber: 2, knight: 3, brute: 2,
  bandit: 1, banditArcher: 1, spider: 1, spearman: 2, skeletonGuard: 2, sellsword: 3,
};

// height of one flight of stairs (one grid cell long)
export const RISE = 1.25;

// ceiling height above the floor, by room purpose
const FUNC_CEIL = {
  foyer: [6.6, 7.6], greathall: [6.6, 7.8], dining: [5.2, 6.2], library: [5.2, 6.6], chapel: [6.8, 8.2], throne: [7, 8.4],
  hall: [4.6, 5.6], kitchen: [4.2, 5], pantry: [3.5, 4], bedroom: [3.7, 4.3], dormitory: [3.9, 4.5], latrine: [3.3, 3.7],
  bath: [4.4, 5.4], armory: [4.4, 5.2], storeroom: [3.8, 4.6], study: [3.9, 4.5], prison: [3.7, 4.3], crypt: [4.2, 5.2],
  workshop: [4.4, 5.2], alchemy: [4.2, 5], treasury: [4.2, 5], stairs: [5.5, 6.5], ruin: [5.5, 6.8], shrine: [5.4, 6.6],
  shop: [4.4, 5], secret: [3.6, 3.6], boss: [8.5, 8.5], arena: [5.6, 6.6],
};

// room purposes by size, with per-theme flavour
const FUNCS_BIG = ['greathall', 'dining', 'library', 'chapel', 'armory', 'dormitory', 'ruin', 'crypt'];
const FUNCS_MID = ['kitchen', 'library', 'dormitory', 'armory', 'storeroom', 'study', 'prison', 'alchemy', 'workshop', 'bath', 'crypt', 'dining'];
const FUNCS_SMALL = ['bedroom', 'bedroom', 'latrine', 'pantry', 'storeroom', 'study', 'prison', 'bath', 'bedroom'];
const THEME_FLAVOUR = {
  crypt: { crypt: 2.5, chapel: 1.8, library: 1.5, study: 1.3 },
  warrens: { storeroom: 2, kitchen: 1.8, dormitory: 1.8, latrine: 1.6, pantry: 1.6 },
  catacombs: { bath: 2.2, crypt: 2, prison: 1.6, ruin: 1.4 },
  forge: { armory: 2.4, workshop: 2.2, storeroom: 1.4, ruin: 1.5 },
  abyss: { chapel: 2, alchemy: 2, prison: 1.6, library: 1.4 },
};

class UnionFind {
  constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(a) { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  union(a, b) { a = this.find(a); b = this.find(b); if (a === b) return false; this.p[a] = b; return true; }
}

export function generateDungeon(seed, floor, theme) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const d = tryGenerate(new RNG(`${seed}|floor${floor}|${attempt}`), floor, theme);
    if (d) return d;
  }
  throw new Error('Dungeon generation failed');
}

function tryGenerate(rng, floor, theme) {
  const W = Math.min(92, 70 + floor * 4);
  const H = W;
  const N = W * H;
  const cells = new Uint8Array(N);
  const roomOf = new Int16Array(N).fill(-1);
  const ceil = new Float32Array(N);
  const flags = new Uint8Array(N);
  const floorH = new Float32Array(N);
  const stairDir = new Int8Array(N);
  const stairRise = new Float32Array(N);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  const rooms = [];

  const addRoom = (x, y, w, h, type = 'normal') => {
    const room = {
      id: rooms.length, x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2),
      type, func: null, shape: 'rect', neighbors: new Set(), entrances: [], depth: 0,
      ceil: 4, ceilRel: 4, decor: null, water: false, hall: false, base: 0, stair: null, dais: null,
    };
    rooms.push(room);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      cells[idx(xx, yy)] = C.FLOOR;
      roomOf[idx(xx, yy)] = room.id;
    }
    return room;
  };

  // ---------------------------------------------------------------- building blocks
  // Blocks are rectangles given by their outer wall lines; neighbouring blocks share a wall line.
  const M = 4;
  const mw = rng.int(Math.round(W * 0.42), Math.round(W * 0.5));
  const mh = rng.int(Math.round(H * 0.42), Math.round(H * 0.5));
  const main = { x0: Math.round((W - mw) / 2), y0: Math.round((H - mh) / 2) };
  main.x1 = main.x0 + mw;
  main.y1 = main.y0 + mh;
  const attach = (side, depth, len, base) => {
    const span = side === 'E' || side === 'W' ? base.y1 - base.y0 : base.x1 - base.x0;
    len = Math.min(len, span);
    const off = rng.int(0, span - len);
    if (side === 'E') return { x0: base.x1, x1: base.x1 + depth, y0: base.y0 + off, y1: base.y0 + off + len };
    if (side === 'W') return { x0: base.x0 - depth, x1: base.x0, y0: base.y0 + off, y1: base.y0 + off + len };
    if (side === 'S') return { y0: base.y1, y1: base.y1 + depth, x0: base.x0 + off, x1: base.x0 + off + len };
    return { y0: base.y0 - depth, y1: base.y0, x0: base.x0 + off, x1: base.x0 + off + len };
  };
  const fits = (b) => b.x0 >= M && b.y0 >= M && b.x1 <= W - 1 - M && b.y1 <= H - 1 - M;
  const sides = rng.shuffle(['E', 'W', 'N', 'S']);
  const bossBlock = attach(sides[0], 14, 14, main);
  if (!fits(bossBlock)) return null;
  const wings = [];
  for (const side of sides.slice(1)) {
    if (!rng.chance(0.8)) continue;
    const span = side === 'E' || side === 'W' ? main.y1 - main.y0 : main.x1 - main.x0;
    const b = attach(side, rng.int(10, 15), rng.int(Math.round(span * 0.45), span), main);
    if (fits(b) && b.x1 - b.x0 >= 10 && b.y1 - b.y0 >= 10) wings.push(b);
  }

  // ---------------------------------------------------------------- partition into rooms & halls
  const MIN = 4, MAXD = 10, MAXA = 64;
  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0 - 1, h = y1 - y0 - 1;
    const area = w * h;
    const canX = w >= 2 * MIN + 1, canY = h >= 2 * MIN + 1;
    let leaf = (!canX && !canY) || (w <= MAXD && h <= MAXD && area <= MAXA && rng.chance(depth >= 2 ? 0.7 : 0.25));
    // occasionally keep a big chamber whole (great halls, chapels, libraries)
    if (!leaf && depth >= 1 && area >= 64 && area <= 150 && w <= 15 && h <= 15 && rng.chance(0.22)) leaf = true;
    if (leaf) { addRoom(x0 + 1, y0 + 1, w, h); return; }
    const alongX = canX && (!canY || w > h * 1.15 || (w >= h * 0.87 && rng.chance(0.5)));
    const dim = alongX ? w : h, other = alongX ? h : w;
    const lo = alongX ? x0 : y0, hi = alongX ? x1 : y1;
    const hallW = rng.chance(0.35) ? 3 : 2;
    if (depth <= 1 && other >= 11 && dim >= 2 * MIN + hallW + 2 && rng.chance(depth === 0 ? 0.95 : 0.55)) {
      // a long hall runs through the middle with rooms on both sides
      const s = rng.int(lo + MIN + 2, hi - MIN - hallW - 1);
      if (alongX) {
        split(x0, y0, s - 1, y1, depth + 1);
        split(s + hallW, y0, x1, y1, depth + 1);
        const hall = addRoom(s, y0 + 1, hallW, h);
        hall.hall = true;
      } else {
        split(x0, y0, x1, s - 1, depth + 1);
        split(x0, s + hallW, x1, y1, depth + 1);
        const hall = addRoom(x0 + 1, s, w, hallW);
        hall.hall = true;
      }
      return;
    }
    const s = rng.int(lo + MIN + 1, hi - MIN - 1);
    if (alongX) { split(x0, y0, s, y1, depth + 1); split(s, y0, x1, y1, depth + 1); }
    else { split(x0, y0, x1, s, depth + 1); split(x0, s, x1, y1, depth + 1); }
  };
  split(main.x0, main.y0, main.x1, main.y1, 0);
  for (const w of wings) split(w.x0, w.y0, w.x1, w.y1, 1);
  const boss = addRoom(bossBlock.x0 + 1, bossBlock.y0 + 1, bossBlock.x1 - bossBlock.x0 - 1, bossBlock.y1 - bossBlock.y0 - 1, 'boss');
  if (rooms.length < 14) return null;

  // ---------------------------------------------------------------- doorway candidates between rooms
  const pairs = new Map();
  const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (cells[idx(x, y)] !== C.SOLID) continue;
    for (const alongX of [true, false]) {
      const [ax, ay, bx, by] = alongX ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
      const a = roomOf[idx(ax, ay)], b = roomOf[idx(bx, by)];
      if (a < 0 || b < 0 || a === b) continue;
      const [p1, p2] = alongX ? [idx(x, y - 1), idx(x, y + 1)] : [idx(x - 1, y), idx(x + 1, y)];
      if (cells[p1] !== C.SOLID || cells[p2] !== C.SOLID) continue;
      const k = pairKey(a, b);
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push({ x, y, alongX, a, b, ia: [ax, ay], ib: [bx, by] });
    }
  }
  const doorCells = [];
  const doorAt = new Map();
  const tooClose = (x, y) => doorCells.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 3);
  const makeDoor = (k) => {
    const cands = pairs.get(k);
    if (!cands || !cands.length) return null;
    const mid = (cands.length - 1) / 2;
    const order = cands.map((c, i) => [Math.abs(i - mid) + rng.range(0, 2.2), c]).sort((p, q) => p[0] - q[0]);
    for (const [, c] of order) {
      if (tooClose(c.x, c.y)) continue;
      const door = { ...c, tree: false };
      doorCells.push(door);
      doorAt.set(idx(c.x, c.y), door);
      rooms[c.a].neighbors.add(c.b);
      rooms[c.b].neighbors.add(c.a);
      return door;
    }
    return null;
  };
  const removeDoor = (door) => {
    doorCells.splice(doorCells.indexOf(door), 1);
    doorAt.delete(idx(door.x, door.y));
    if (!doorCells.some((d) => (d.a === door.a && d.b === door.b) || (d.a === door.b && d.b === door.a))) {
      rooms[door.a].neighbors.delete(door.b);
      rooms[door.b].neighbors.delete(door.a);
    }
  };

  // spanning tree (halls form the backbone), boss wing attached by a single door
  const uf = new UnionFind(rooms.length);
  const isHall = (id) => rooms[id].hall;
  const edges = [...pairs.keys()].map((k) => {
    const a = Math.floor(k / 4096), b = k % 4096;
    return { k, a, b, w: rng.next() - (isHall(a) || isHall(b) ? 0.8 : 0) - (isHall(a) && isHall(b) ? 0.6 : 0) };
  }).filter((e) => rooms[e.a] !== boss && rooms[e.b] !== boss);
  edges.sort((p, q) => p.w - q.w);
  const treeKeys = new Set();
  for (const e of edges) {
    if (uf.find(e.a) === uf.find(e.b)) continue;
    const door = makeDoor(e.k);
    if (!door) continue;
    door.tree = true;
    uf.union(e.a, e.b);
    treeKeys.add(e.k);
  }
  const others = rooms.filter((r) => r !== boss);
  const root = uf.find(others[0].id);
  if (others.some((r) => uf.find(r.id) !== root)) return null;
  const bossPairs = [...pairs.keys()].filter((k) => Math.floor(k / 4096) === boss.id || k % 4096 === boss.id);
  if (!bossPairs.length) return null;
  bossPairs.sort((p, q) => {
    const op = Math.floor(p / 4096) === boss.id ? p % 4096 : Math.floor(p / 4096);
    const oq = Math.floor(q / 4096) === boss.id ? q % 4096 : Math.floor(q / 4096);
    return (isHall(oq) ? 1 : 0) - (isHall(op) ? 1 : 0) + (rng.next() - 0.5) * 0.5;
  });
  const bossDoor = makeDoor(bossPairs[0]);
  if (!bossDoor) return null;
  bossDoor.tree = true;
  treeKeys.add(bossPairs[0]);

  // ---------------------------------------------------------------- start (foyer) & graph depth
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
  let start = null, sd = -1;
  for (const r of others) {
    if (r.hall) continue;
    const d = fromBoss.get(r.id) ?? -1;
    const area = r.w * r.h;
    const score = d * 10 + Math.min(area, 90) * 0.12 - (area > 110 ? 20 : 0);
    if (d >= 0 && score > sd && area >= 20) { sd = score; start = r; }
  }
  if (!start) return null;
  start.type = 'start';

  // a locked vault: a dead end of the tree
  const degree = (r) => doorCells.filter((d) => d.a === r.id || d.b === r.id).length;
  let vault = null;
  {
    const treeDepth = bfsRooms(start);
    const cands = others.filter((r) => r.type === 'normal' && !r.hall && degree(r) === 1 && (treeDepth.get(r.id) || 0) >= 2 && r.w * r.h <= 56 && !r.neighbors.has(boss.id));
    if (cands.length && rng.chance(0.85)) { vault = rng.pick(cands); vault.type = 'vault'; }
  }

  // extra doors make loops (every hall connects to most of its neighbours)
  for (const k of pairs.keys()) {
    if (treeKeys.has(k)) continue;
    const a = Math.floor(k / 4096), b = k % 4096;
    if (rooms[a] === boss || rooms[b] === boss || rooms[a] === vault || rooms[b] === vault) continue;
    const p = isHall(a) || isHall(b) ? 0.6 : 0.2;
    if (rng.chance(p)) makeDoor(k);
  }

  const depth = bfsRooms(start);
  for (const r of rooms) r.depth = depth.get(r.id) ?? 0;
  const maxDepth = Math.max(...rooms.map((r) => r.depth));

  // ---------------------------------------------------------------- room roles
  const free = () => rooms.filter((r) => r.type === 'normal' && !r.hall);
  const mid = free().filter((r) => r.depth >= 2 && r.w * r.h >= 42 && r.w >= 6 && r.h >= 6);
  let miniboss = null;
  if (mid.length && (vault || rng.chance(0.6))) { miniboss = rng.pick(mid); miniboss.type = 'miniboss'; }
  const shopCands = free().filter((r) => r.depth >= 1 && r.depth <= Math.max(2, maxDepth - 1) && r.w >= 5 && r.h >= 5);
  if (shopCands.length) rng.pick(shopCands).type = 'shop';
  for (let i = 0, n = rng.int(1, 2); i < n; i++) {
    const c = free().filter((r) => r.depth >= 1 && r.w >= 4 && r.h >= 4);
    if (c.length) rng.pick(c).type = 'shrine';
  }
  const arenaCands = free().filter((r) => r.depth >= 2 && r.w >= 6 && r.h >= 6);
  for (let i = 0; i < 1 + (floor >= 3 ? 1 : 0) && arenaCands.length; i++) {
    const r = arenaCands.splice(rng.int(0, arenaCands.length - 1), 1)[0];
    r.type = 'arena';
  }
  for (const r of free()) r.type = rng.chance(0.08) ? 'treasure' : rng.chance(0.5) ? 'combat' : 'quiet';
  for (const r of rooms) if (r.hall && r.type === 'normal') r.type = rng.chance(0.4) ? 'combat' : 'quiet';

  // ---------------------------------------------------------------- room purposes
  const used = {};
  const flavour = THEME_FLAVOUR[theme.id] || {};
  const pickFunc = (list) => rng.weighted(list, (f) => (flavour[f] || 1) / (1 + (used[f] || 0) * 1.4));
  for (const r of rooms) {
    const area = r.w * r.h;
    if (r.hall) r.func = 'hall';
    else if (r.type === 'boss') r.func = 'boss';
    else if (r.type === 'start') r.func = 'foyer';
    else if (r.type === 'shop') r.func = 'shop';
    else if (r.type === 'vault') r.func = 'treasury';
    else if (r.type === 'shrine') r.func = area >= 30 ? 'chapel' : 'shrine';
    else if (r.type === 'arena') r.func = 'arena';
    else if (r.type === 'miniboss') r.func = area >= 64 ? 'throne' : 'greathall';
    else r.func = pickFunc(area >= 60 ? FUNCS_BIG : area >= 30 ? FUNCS_MID : FUNCS_SMALL);
    if (r.func === 'ruin' && (r.w < 8 || r.h < 8)) r.func = 'storeroom';
    used[r.func] = (used[r.func] || 0) + 1;
  }

  // grand staircases: a two-cell flight across the whole room or hall, climbing two storeys' worth
  {
    let stairs = 0;
    const cands = rng.shuffle(rooms.filter((r) => ['combat', 'quiet'].includes(r.type) && !['ruin', 'bath'].includes(r.func)));
    for (const r of cands) {
      if (stairs >= 2 + (floor >= 3 ? 1 : 0)) break;
      const alongX = r.w >= r.h;
      const len = alongX ? r.w : r.h, wid = alongX ? r.h : r.w;
      if (len < (r.hall ? 10 : 7) || wid > 6) continue;
      if (!rng.chance(r.hall ? 0.5 : 0.35)) continue;
      // band must not hold a doorway's inner cell
      const doorKs = doorCells.filter((d) => d.a === r.id || d.b === r.id).map((d) => {
        const [ix, iy] = d.a === r.id ? d.ia : d.ib;
        return alongX ? ix - r.x : iy - r.y;
      });
      const okK = [];
      for (let k0 = 2; k0 <= len - 4; k0++) if (!doorKs.some((k) => k === k0 || k === k0 + 1)) okK.push(k0);
      if (!okK.length) continue;
      const k0 = okK[Math.floor(okK.length / 2)];
      const dir = rng.sign();
      r.stair = { alongX, k0: dir > 0 ? k0 : len - 2 - k0, dir, len };
      if (!r.hall) r.func = 'stairs';
      stairs++;
    }
  }
  // floor height of a room cell (stair band cells report their low edge)
  const hAt = (r, x, y) => {
    const st = r.stair;
    if (!st) return r.base;
    let k = st.alongX ? x - r.x : y - r.y;
    if (st.dir < 0) k = st.len - 1 - k;
    if (k < st.k0) return r.base;
    if (k > st.k0 + 1) return r.base + 2 * RISE;
    return r.base + (k - st.k0) * RISE;
  };

  // ---------------------------------------------------------------- heights: walk the tree from the foyer
  const flatOnly = (r) => ['boss', 'arena', 'miniboss', 'vault', 'shop', 'start'].includes(r.type);
  {
    const done = new Set([start.id]);
    start.base = 0;
    const q = [start];
    while (q.length) {
      const r = q.shift();
      for (const d of doorCells) {
        if (!d.tree || (d.a !== r.id && d.b !== r.id)) continue;
        const o = rooms[d.a === r.id ? d.b : d.a];
        if (done.has(o.id)) continue;
        const [rx, ry] = d.a === r.id ? d.ia : d.ib;
        const [ox, oy] = d.a === r.id ? d.ib : d.ia;
        const hr = hAt(r, rx, ry);
        let delta = 0;
        if (!flatOnly(r) && !flatOnly(o) && rng.chance(0.24)) delta = rng.sign() * RISE;
        if (hr + delta < -2 * RISE || hr + delta > 4 * RISE) delta = 0;
        o.base = 0;
        o.base = hr + delta - hAt(o, ox, oy);
        done.add(o.id);
        q.push(o);
      }
    }
  }
  // loop doors must join compatible heights: level, or exactly one flight apart
  for (const d of doorCells.slice()) {
    const ha = hAt(rooms[d.a], d.ia[0], d.ia[1]), hb = hAt(rooms[d.b], d.ib[0], d.ib[1]);
    d.ha = ha;
    d.hb = hb;
    const diff = Math.abs(ha - hb);
    const special = flatOnly(rooms[d.a]) || flatOnly(rooms[d.b]);
    if (diff < 0.01) continue;
    if (!d.tree && (Math.abs(diff - RISE) > 0.01 || special)) removeDoor(d);
  }

  // ---------------------------------------------------------------- carve doorways & write heights
  for (const r of rooms) {
    const lo = r.base, hi = r.base + (r.stair ? 2 * RISE : 0);
    const range = FUNC_CEIL[r.func] || [4.2, 5];
    r.ceilRel = rng.range(range[0], range[1]) + (r.hall ? Math.min(1, Math.max(r.w, r.h) * 0.03) : 0);
    r.ceil = hi + r.ceilRel;
    r.floorY = lo;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = idx(x, y);
      floorH[i] = hAt(r, x, y);
      ceil[i] = r.ceil;
      const st = r.stair;
      if (st) {
        let k = st.alongX ? x - r.x : y - r.y;
        if (st.dir < 0) k = st.len - 1 - k;
        if (k === st.k0 || k === st.k0 + 1) {
          stairDir[i] = st.alongX ? (st.dir > 0 ? 1 : 2) : (st.dir > 0 ? 3 : 4);
          stairRise[i] = RISE;
          flags[i] |= F.STAIR;
        }
      }
    }
  }
  for (const d of doorCells) {
    const i = idx(d.x, d.y);
    cells[i] = C.FLOOR;
    flags[i] |= F.DOOR | F.CORRIDOR;
    floorH[i] = Math.min(d.ha, d.hb);
    ceil[i] = Math.max(d.ha, d.hb) + CORRIDOR_CEIL;
    if (Math.abs(d.ha - d.hb) > 0.01) {
      // a short flight of steps inside the doorway, climbing toward the higher room
      const up = d.hb > d.ha ? d.ib : d.ia;
      stairDir[i] = d.alongX ? (up[0] > d.x ? 1 : 2) : (up[1] > d.y ? 3 : 4);
      stairRise[i] = Math.abs(d.ha - d.hb);
      flags[i] |= F.STAIR;
      d.stair = true;
    }
  }

  // entrances & door ownership (special rooms own their doors so locks and gates land on their side)
  const OWN = { boss: 9, vault: 8, arena: 7, miniboss: 7, shrine: 5, shop: 4, start: 3, treasure: 2, combat: 1, quiet: 1 };
  const doorList = [];
  for (const d of doorCells) {
    for (const [rid, inner] of [[d.a, d.ia], [d.b, d.ib]]) {
      const side = d.alongX ? (d.x > inner[0] ? 'E' : 'W') : (d.y > inner[1] ? 'S' : 'N');
      rooms[rid].entrances.push({ side, ox: d.x, oy: d.y, ix: inner[0], iy: inner[1], room: rid, valid: true });
    }
    const ra = rooms[d.a], rb = rooms[d.b];
    const ownA = (OWN[ra.type] || 0) + (ra.hall ? -0.5 : 0) >= (OWN[rb.type] || 0) + (rb.hall ? -0.5 : 0);
    const owner = ownA ? ra : rb;
    const inner = ownA ? d.ia : d.ib;
    const side = d.alongX ? (d.x > inner[0] ? 'E' : 'W') : (d.y > inner[1] ? 'S' : 'N');
    doorList.push({ cx: d.x, cy: d.y, axis: d.alongX ? 'x' : 'z', roomId: owner.id, side, kind: null, stair: !!d.stair, valid: true, other: ownA ? rb.id : ra.id });
  }

  // ---------------------------------------------------------------- shapes, daises, water
  for (const r of rooms) {
    const big = r.w >= 7 && r.h >= 7;
    if (r.type === 'boss') r.shape = 'octagon';
    else if (r.func === 'ruin' && r.w >= 8 && r.h >= 8) r.shape = theme.lava ? 'lava' : 'pit';
    else if (big && ['foyer', 'greathall', 'chapel', 'throne', 'arena'].includes(r.func)) r.shape = 'pillars';
    else if (r.hall && r.w * r.h >= 30 && Math.min(r.w, r.h) === 3 && rng.chance(0.5)) r.shape = 'colonnade';
  }
  for (const r of rooms) {
    if (r.shape === 'octagon') {
      const k = 3;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const dx = Math.min(x, r.w - 1 - x), dy = Math.min(y, r.h - 1 - y);
        if (dx + dy < k) {
          const i = idx(r.x + x, r.y + y);
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
    // a raised dais along a wall with no doorways (thrones, altars)
    if (['throne', 'chapel'].includes(r.func) && !r.stair && r.w >= 5 && r.h >= 5) {
      const sideOpts = rng.shuffle(['N', 'S', 'E', 'W']).filter((s) => !r.entrances.some((e) => e.side === s));
      if (sideOpts.length) {
        const side = sideOpts[0];
        const deep = Math.min(r.w, r.h) >= 8 ? 2 : 1;
        const cellsD = [];
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          const k = side === 'N' ? y - r.y : side === 'S' ? r.y + r.h - 1 - y : side === 'W' ? x - r.x : r.x + r.w - 1 - x;
          const across = side === 'N' || side === 'S' ? x - r.x : y - r.y;
          const acrossLen = side === 'N' || side === 'S' ? r.w : r.h;
          if (k < deep && across >= 1 && across <= acrossLen - 2 && cells[idx(x, y)] === C.FLOOR) cellsD.push([x, y]);
        }
        for (const [x, y] of cellsD) floorH[idx(x, y)] += 0.35;
        r.dais = { side, deep, cells: cellsD };
      }
    }
    if (r.func === 'bath' || (theme.id === 'catacombs' && !['boss', 'shop', 'start'].includes(r.type) && !r.stair && rng.chance(0.25))) r.water = true;
    if (r.water) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (cells[idx(x, y)] === C.FLOOR && !stairDir[idx(x, y)]) flags[idx(x, y)] |= F.WATER;
  }

  // ---------------------------------------------------------------- secret rooms behind cracked walls
  const secretWalls = [];
  const secretTarget = rng.chance(0.6) ? 2 : 1;
  for (let tries = 0; tries < 600 && secretWalls.length < secretTarget; tries++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (cells[idx(x, y)] !== C.FLOOR || roomOf[idx(x, y)] < 0) continue;
    if (flags[idx(x, y)] & (F.DOOR | F.STAIR)) continue;
    const [dx, dy] = rng.pick(DIRS);
    const sx = x + dx, sy = y + dy;
    if (!inb(sx, sy) || cells[idx(sx, sy)] !== C.SOLID) continue;
    const rw = rng.int(3, 4), rh = rng.int(3, 4);
    let rx, ry;
    if (dx !== 0) { rx = dx > 0 ? sx + 1 : sx - rw; ry = sy - Math.floor(rh / 2); }
    else { ry = dy > 0 ? sy + 1 : sy - rh; rx = sx - Math.floor(rw / 2); }
    let ok = rx >= 2 && ry >= 2 && rx + rw < W - 2 && ry + rh < H - 2;
    for (let yy = ry - 1; ok && yy <= ry + rh; yy++) for (let xx = rx - 1; xx <= rx + rw; xx++) {
      if (cells[idx(xx, yy)] !== C.SOLID) { ok = false; break; }
    }
    if (ok) {
      const p1 = dx !== 0 ? idx(sx, sy - 1) : idx(sx - 1, sy);
      const p2 = dx !== 0 ? idx(sx, sy + 1) : idx(sx + 1, sy);
      if (cells[p1] !== C.SOLID || cells[p2] !== C.SOLID) ok = false;
    }
    if (!ok) continue;
    const host = rooms[roomOf[idx(x, y)]];
    const fh = floorH[idx(x, y)];
    const room = addRoom(rx, ry, rw, rh, 'secret');
    room.func = rng.pick(['study', 'crypt', 'treasury']);
    room.base = fh;
    room.floorY = fh;
    room.ceilRel = 3.6;
    room.ceil = fh + 3.6;
    for (let yy = ry; yy < ry + rh; yy++) for (let xx = rx; xx < rx + rw; xx++) { ceil[idx(xx, yy)] = room.ceil; floorH[idx(xx, yy)] = fh; }
    cells[idx(sx, sy)] = C.FLOOR;
    ceil[idx(sx, sy)] = fh + 3.0;
    floorH[idx(sx, sy)] = fh;
    flags[idx(sx, sy)] |= F.SECRET;
    secretWalls.push({ cx: sx, cy: sy, axis: dx !== 0 ? 'x' : 'z', roomId: room.id });
    room.depth = host.depth;
    room.entrances.push({ side: dx > 0 ? 'W' : dx < 0 ? 'E' : dy > 0 ? 'N' : 'S', ox: sx, oy: sy, ix: dx > 0 ? sx + 1 : dx < 0 ? sx - 1 : sx, iy: dy > 0 ? sy + 1 : dy < 0 ? sy - 1 : sy, room: room.id, valid: true, secret: true });
  }

  // ---------------------------------------------------------------- connectivity sanity check
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

  // ---------------------------------------------------------------- door kinds & gates
  const gates = [];
  for (const d of doorList) {
    const r = rooms[d.roomId];
    if (d.stair) d.kind = null;
    else if (r.type === 'boss') d.kind = 'boss';
    else if (r.type === 'vault') d.kind = 'locked';
    else if (r.type === 'arena' || r.type === 'miniboss') d.kind = null;
    else d.kind = rng.chance(r.hall || rooms[d.other].hall ? 0.28 : 0.55) ? 'wood' : null;
    if (r.type === 'arena' || r.type === 'miniboss') {
      gates.push({ cx: d.cx, cy: d.cy, axis: d.axis, roomId: r.id });
      flags[idx(d.cx, d.cy)] |= F.GATE;
    }
  }
  const doors = doorList.filter((d) => d.kind);

  // ---------------------------------------------------------------- population
  const ents = [];
  const torches = [];
  const occupied = new Uint8Array(N);
  for (const d of doorList) occupied[idx(d.cx, d.cy)] = 1;
  for (const s of secretWalls) occupied[idx(s.cx, s.cy)] = 1;
  const wc = (cx, cy) => [(cx + 0.5) * TILE, (cy + 0.5) * TILE];
  const walk = (x, y) => cells[idx(x, y)] === C.FLOOR;
  const flat = (x, y) => walk(x, y) && !stairDir[idx(x, y)];
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
  const freeCell = (x, y) => flat(x, y) && !occupied[idx(x, y)];
  const fyOf = (x, y) => floorH[idx(x, y)];

  // torches along room walls
  for (const r of rooms) {
    const step = r.type === 'boss' ? 2 : 3;
    let k = rng.int(0, step - 1);
    const perim = roomCells(r, (x, y) => wallNormalOf(x, y).length > 0);
    perim.sort((a, b) => Math.atan2(a[1] - r.cy, a[0] - r.cx) - Math.atan2(b[1] - r.cy, b[0] - r.cx));
    for (const [x, y] of perim) {
      if (k++ % step !== 0) continue;
      if (nearEntrance(r, x, y)) continue;
      const [nx, ny] = wallNormalOf(x, y)[0];
      const [wx, wz] = wc(x, y);
      torches.push({ x: wx - nx * (TILE / 2 - 0.08), y: fyOf(x, y) + 2.3, z: wz - ny * (TILE / 2 - 0.08), nx, nz: ny, kind: r.type === 'secret' ? 'candle' : 'torch' });
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

  // ---------------------------------------------------------------- furnishing helpers
  // Wall slots: cells against exactly one wall, away from doorways. n points into the room.
  const wallSlots = (r, margin = 1) => rng.shuffle(roomCells(r, (x, y) => freeCell(x, y) && wallNormalOf(x, y).length === 1 && !nearEntrance(r, x, y, margin))
    .map(([x, y]) => { const [nx, ny] = wallNormalOf(x, y)[0]; return { x, y, nx, ny }; }));
  const cornerSlots = (r) => rng.shuffle(roomCells(r, (x, y) => freeCell(x, y) && wallNormalOf(x, y).length >= 2 && !nearEntrance(r, x, y, 1)));
  const interior = (r, m = 1) => roomCells(r, (x, y) => freeCell(x, y) && x >= r.x + m && y >= r.y + m && x < r.x + r.w - m && y < r.y + r.h - m && !nearEntrance(r, x, y, 1));
  // how far a piece sits from the wall: its centre is pulled toward the wall by (cell half - depth/2)
  const DEPTH = {
    bed: 2.1, bunk: 2.1, wardrobe: 0.65, nightstand: 0.5, desk: 0.75, bookshelf: 0.55, shelf: 0.55, counter: 0.85, hearth: 0.9, privy: 0.95,
    weaponRack: 0.45, armorStand: 0.6, banner: 0.1, painting: 0.08, bust: 0.7, statue: 1.0, sarcophagus: 2.3, cage: 1.2, chains: 0.2,
    alchemy: 0.85, altar: 1.0, bench: 0.5, barrel: 0.9, crate: 0.9, sacks: 0.9, bathtub: 1.0, dummy: 0.8, anvil: 0.8, throne: 1.1,
    table: 1.0, cauldron: 1.1, straw: 1.2, bucket: 0.4, candles: 0.5, pot: 0.5, bookpile: 0.6, shackles: 0.1, coinpile: 0.9,
  };
  const putSlot = (r, s, kind, extra = {}) => {
    const [wx, wz] = wc(s.x, s.y);
    const off = TILE / 2 - (DEPTH[kind] ?? 0.8) / 2 - 0.05;
    occupied[idx(s.x, s.y)] = 1;
    return placeAt(kind, wx - s.nx * off, wz - s.ny * off, { rot: Math.atan2(s.nx, s.ny), nx: s.nx, nz: s.ny, wallX: wx - s.nx * TILE / 2, wallZ: wz - s.ny * TILE / 2, roomId: r.id, ...extra });
  };
  const putWall = (r, kinds, count, margin = 1, extra = {}) => {
    const slots = wallSlots(r, margin);
    let n = 0;
    for (const s of slots) {
      if (n >= count) break;
      if (!freeCell(s.x, s.y)) continue;
      const kind = Array.isArray(kinds) ? rng.pick(kinds) : kinds;
      putSlot(r, s, kind, extra);
      n++;
    }
    return n;
  };
  // wall decorations that don't take floor space (paintings, banners, shackles)
  const hangWall = (r, kinds, count) => {
    const slots = rng.shuffle(roomCells(r, (x, y) => walk(x, y) && wallNormalOf(x, y).length === 1 && !nearEntrance(r, x, y, 0)));
    for (const [x, y] of slots.slice(0, count)) {
      const [nx, ny] = wallNormalOf(x, y)[0];
      const [wx, wz] = wc(x, y);
      placeAt(rng.pick(kinds), wx - nx * (TILE / 2 - 0.06), wz - ny * (TILE / 2 - 0.06), { rot: Math.atan2(nx, ny), wallX: wx - nx * TILE / 2, wallZ: wz - ny * TILE / 2, roomId: r.id, fy: fyOf(x, y), seed: rng.int(0, 999) });
    }
  };
  const corners = (r, kinds, count) => {
    let n = 0;
    for (const [x, y] of cornerSlots(r)) {
      if (n >= count) break;
      const ns = wallNormalOf(x, y);
      const [wx, wz] = wc(x, y);
      const ox = -(ns[0][0] + ns[1][0]) * 0.6, oz = -(ns[0][1] + ns[1][1]) * 0.6;
      occupied[idx(x, y)] = 1;
      const kind = rng.pick(kinds);
      if (kind === 'clutter') {
        const k = rng.int(2, 4);
        for (let j = 0; j < k; j++) placeAt(rng.chance(0.5) ? 'barrel' : 'crate', wx + ox + rng.range(-0.5, 0.5), wz + oz + rng.range(-0.5, 0.5), { rot: rng.range(0, 6.28), stack: j === k - 1 && rng.chance(0.3), roomId: r.id });
      } else placeAt(kind, wx + ox, wz + oz, { rot: Math.atan2(-(ns[0][0] + ns[1][0]), -(ns[0][1] + ns[1][1])), roomId: r.id });
      n++;
    }
  };
  const centre = (r, kind, extra = {}) => {
    if (!freeCell(r.cx, r.cy)) return null;
    const [wx, wz] = wc(r.cx, r.cy);
    const ox = r.w % 2 === 0 ? -TILE / 2 : 0, oz = r.h % 2 === 0 ? -TILE / 2 : 0;
    occupied[idx(r.cx, r.cy)] = 1;
    return placeAt(kind, wx + ox, wz + oz, { roomId: r.id, ...extra });
  };
  const chandeliers = (r, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const alongX = r.w >= r.h;
      const x = alongX ? r.x + r.w * t : r.x + r.w / 2, y = alongX ? r.y + r.h / 2 : r.y + r.h * t;
      placeAt('chandelier', x * TILE, y * TILE, { y: r.ceil, roomId: r.id });
    }
  };
  const rugIn = (r, kind = 'rug') => {
    if (r.shape === 'pit' || r.shape === 'lava' || r.water || r.stair) return;
    const ox = r.w % 2 === 0 ? -TILE / 2 : 0, oz = r.h % 2 === 0 ? -TILE / 2 : 0;
    const [wx, wz] = wc(r.cx, r.cy);
    placeAt(kind, wx + ox, wz + oz, { rot: r.w > r.h ? 0 : Math.PI / 2, w: Math.max(2, Math.max(r.w, r.h) - 2) * TILE * (kind === 'runner' ? 0.95 : 0.5), h: Math.max(1.5, Math.min(r.w, r.h) - 2) * TILE * (kind === 'runner' ? 0.28 : 0.55), roomId: r.id });
  };
  // rows across the room (pews, beds, shelves) leaving a central aisle
  const rows = (r, kind, opts = {}) => {
    const alongX = r.w >= r.h;
    const len = alongX ? r.w : r.h, wid = alongX ? r.h : r.w;
    const aisle = Math.floor(wid / 2);
    const step = opts.step || 2;
    for (let k = opts.start ?? 1; k < len - (opts.end ?? 1); k += step) {
      for (let j = 1; j < wid - 1; j++) {
        if (Math.abs(j - aisle) < (wid >= 7 ? 1 : 1) && !opts.noAisle) continue;
        if (opts.noAisle && j !== aisle) continue;
        const x = alongX ? r.x + k : r.x + j, y = alongX ? r.y + j : r.y + k;
        if (!freeCell(x, y) || nearEntrance(r, x, y, 1)) continue;
        place(kind, x, y, { rot: alongX ? Math.PI / 2 * (opts.face ?? 1) : (opts.face === -1 ? Math.PI : 0), roomId: r.id, alongX });
      }
    }
  };
  const columns = (r) => {
    const sx = r.type === 'boss' ? 3 : 2;
    for (let y = r.y + 2; y < r.y + r.h - 2; y += sx + 1) for (let x = r.x + 2; x < r.x + r.w - 2; x += sx + 1) {
      if (!freeCell(x, y) || nearEntrance(r, x, y, 2)) continue;
      if (r.type === 'boss' && Math.abs(x - r.cx) < 3 && Math.abs(y - r.cy) < 3) continue;
      place('column', x, y, { roomId: r.id, h: r.ceil - fyOf(x, y) });
    }
  };
  const colonnade = (r) => {
    const alongX = r.w >= r.h;
    const len = alongX ? r.w : r.h;
    for (let k = 1; k < len - 1; k += 2) {
      for (const j of [0, (alongX ? r.h : r.w) - 1]) {
        const x = alongX ? r.x + k : r.x + j, y = alongX ? r.y + j : r.y + k;
        if (!freeCell(x, y) || nearEntrance(r, x, y, 1)) continue;
        const [wx, wz] = wc(x, y);
        const [nx, ny] = wallNormalOf(x, y)[0] || [0, 0];
        occupied[idx(x, y)] = 1;
        placeAt('column', wx - nx * 0.7, wz - ny * 0.7, { roomId: r.id, h: r.ceil - fyOf(x, y), slim: true });
      }
    }
  };
  const chestIn = (r, tier, opts = {}) => {
    const s = wallSlots(r, 1);
    if (!s.length) return;
    const slot = s[0];
    place('chest', slot.x, slot.y, { tier, rot: Math.atan2(slot.nx, slot.ny), roomId: r.id, ...opts });
  };

  // Furnish a room according to its purpose.
  const furnish = (r) => {
    const area = r.w * r.h;
    const f = r.func;
    if (r.shape === 'pillars' || r.type === 'boss') columns(r);
    if (r.shape === 'colonnade') colonnade(r);
    const dais = r.dais;
    const daisCentre = () => {
      if (!dais) return null;
      const cs = dais.cells.filter(([x, y]) => freeCell(x, y));
      if (!cs.length) return null;
      cs.sort((a, b) => Math.hypot(a[0] - r.cx, a[1] - r.cy) - Math.hypot(b[0] - r.cx, b[1] - r.cy));
      return cs[0];
    };
    const daisRot = dais ? { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[dais.side] : 0;
    switch (f) {
      case 'foyer':
        rugIn(r);
        putWall(r, ['statue', 'bust', 'bench'], Math.floor(area / 12));
        hangWall(r, ['banner', 'painting'], Math.floor(area / 9));
        chandeliers(r, area >= 60 ? 2 : 1);
        corners(r, ['statue', 'candles'], 2);
        break;
      case 'hall': {
        if (!r.stair) rugIn(r, 'runner');
        const len = Math.max(r.w, r.h);
        putWall(r, ['bust', 'statue', 'bench', 'bust', 'banner'], Math.floor(len / 3), 1);
        hangWall(r, ['painting', 'banner', 'painting'], Math.floor(len / 2));
        if (r.ceil - r.floorY >= 5 && len >= 10) chandeliers(r, Math.floor(len / 8));
        corners(r, ['pot', 'candles', 'clutter'], 2);
        break;
      }
      case 'greathall': case 'dining': {
        const alongX = r.w >= r.h;
        const len = alongX ? r.w : r.h, wid = alongX ? r.h : r.w;
        const tables = wid >= 8 ? 2 : 1;
        for (let t = 0; t < tables; t++) {
          const j = tables === 1 ? Math.floor(wid / 2) : Math.round(wid * (t === 0 ? 0.3 : 0.7));
          const cx = alongX ? r.x + len / 2 : r.x + j + 0.5, cy = alongX ? r.y + j + 0.5 : r.y + len / 2;
          const tl = Math.max(2, len - 4);
          let ok = true;
          for (let k = 0; k < tl; k++) {
            const x = alongX ? r.x + 2 + k : r.x + j, y = alongX ? r.y + j : r.y + 2 + k;
            if (!freeCell(x, y)) ok = false;
          }
          if (!ok) continue;
          for (let k = 0; k < tl; k++) occupied[idx(alongX ? r.x + 2 + k : r.x + j, alongX ? r.y + j : r.y + 2 + k)] = 1;
          placeAt('longtable', cx * TILE, cy * TILE, { rot: alongX ? Math.PI / 2 : 0, len: tl * TILE - 0.6, roomId: r.id, feast: f === 'greathall' || rng.chance(0.6) });
        }
        putWall(r, f === 'greathall' ? ['hearth'] : ['counter'], 1, 2);
        putWall(r, ['banner', 'weaponRack', 'statue', 'barrel', 'bench'], Math.floor(area / 16));
        hangWall(r, ['banner', 'painting'], Math.floor(area / 10));
        chandeliers(r, Math.max(1, Math.floor(len / 6)));
        corners(r, ['clutter', 'candles', 'pot'], 3);
        break;
      }
      case 'library': {
        const alongX = r.w >= r.h;
        const len = alongX ? r.w : r.h, wid = alongX ? r.h : r.w;
        // free-standing stacks across the room, with a walkway through the middle
        if (wid >= 5) {
          for (let k = 2; k < len - 2; k += 2) {
            for (let j = 1; j < wid - 1; j++) {
              if (Math.abs(j - (wid - 1) / 2) < 1) continue;
              const x = alongX ? r.x + k : r.x + j, y = alongX ? r.y + j : r.y + k;
              if (!freeCell(x, y) || nearEntrance(r, x, y, 1)) continue;
              place('bookshelf', x, y, { rot: alongX ? Math.PI / 2 : 0, roomId: r.id, double: true });
            }
          }
        }
        putWall(r, ['bookshelf', 'bookshelf', 'bookshelf', 'desk', 'bookpile'], Math.floor(area / 6));
        const t = interior(r, 1);
        if (t.length) { const [x, y] = rng.pick(t); place('table', x, y, { rot: rng.range(0, 3), roomId: r.id, books: true }); }
        corners(r, ['candles', 'bookpile', 'globe'], 3);
        if (r.ceil - r.floorY > 5) chandeliers(r, 1);
        break;
      }
      case 'kitchen':
        putWall(r, 'hearth', 1, 1);
        putWall(r, 'counter', Math.max(2, Math.floor(area / 10)));
        putWall(r, ['shelf', 'barrel', 'sacks'], Math.floor(area / 10));
        { const t = interior(r, 1); if (t.length) { const [x, y] = rng.pick(t); place('table', x, y, { rot: rng.range(0, 3), roomId: r.id, food: true }); } }
        { const t = interior(r, 1); if (t.length) { const [x, y] = rng.pick(t); place('cauldron', x, y, { roomId: r.id }); } }
        corners(r, ['clutter', 'sacks', 'barrel'], 3);
        hangWall(r, ['pans'], 2);
        break;
      case 'pantry': case 'storeroom':
        putWall(r, f === 'pantry' ? ['shelf', 'shelf', 'sacks', 'barrel'] : ['shelf', 'crate', 'barrel', 'sacks'], Math.floor(area / 4));
        corners(r, ['clutter'], 4);
        { const t = interior(r, 1); for (const [x, y] of t.slice(0, Math.floor(t.length / 4))) if (freeCell(x, y)) { occupied[idx(x, y)] = 1; const [wx, wz] = wc(x, y); placeAt(rng.pick(['crate', 'barrel', 'sacks']), wx + rng.range(-0.4, 0.4), wz + rng.range(-0.4, 0.4), { rot: rng.range(0, 6), roomId: r.id }); } }
        break;
      case 'bedroom':
        putWall(r, 'bed', 1, 1);
        putWall(r, ['wardrobe', 'nightstand', 'desk'], 2);
        if (rng.chance(0.45)) chestIn(r, 0);
        rugIn(r);
        corners(r, ['candles', 'pot', 'bucket'], 1);
        hangWall(r, ['painting'], 1);
        break;
      case 'dormitory':
        putWall(r, ['bunk', 'bunk', 'bed'], Math.floor(area / 5));
        corners(r, ['clutter', 'bucket', 'candles'], 2);
        if (rng.chance(0.4)) chestIn(r, 0);
        putWall(r, ['weaponRack', 'barrel'], 1);
        break;
      case 'latrine': {
        const alongX = r.w >= r.h;
        // a row of privy seats along one long wall
        const slots = wallSlots(r, 1).filter((s) => (alongX ? s.nx === 0 : s.ny === 0));
        const side = slots.length ? (alongX ? slots[0].ny : slots[0].nx) : 0;
        for (const s of slots) if ((alongX ? s.ny : s.nx) === side && freeCell(s.x, s.y)) putSlot(r, s, 'privy');
        putWall(r, ['bucket', 'barrel'], 2);
        corners(r, ['bucket', 'straw'], 1);
        break;
      }
      case 'bath':
        putWall(r, ['bathtub', 'bench', 'bucket'], Math.floor(area / 10) + 1);
        corners(r, ['pot', 'candles'], 2);
        break;
      case 'armory':
        putWall(r, ['weaponRack', 'weaponRack', 'armorStand', 'armorStand', 'barrel'], Math.floor(area / 5));
        { const t = interior(r, 1); if (t.length) { const [x, y] = rng.pick(t); place('anvil', x, y, { rot: rng.range(0, 3), roomId: r.id }); } }
        { const t = interior(r, 1); for (let i = 0; i < 2 && t.length; i++) { const [x, y] = t.splice(rng.int(0, t.length - 1), 1)[0]; if (freeCell(x, y)) place('dummy', x, y, { rot: rng.range(0, 6), roomId: r.id }); } }
        hangWall(r, ['banner', 'shield'], 3);
        corners(r, ['clutter'], 2);
        break;
      case 'workshop': case 'alchemy':
        putWall(r, f === 'alchemy' ? ['alchemy', 'alchemy', 'shelf', 'bookshelf'] : ['counter', 'shelf', 'anvil', 'crate'], Math.floor(area / 6));
        { const t = interior(r, 1); if (t.length) { const [x, y] = rng.pick(t); place(f === 'alchemy' ? 'cauldron' : 'table', x, y, { roomId: r.id, rot: 0, tools: true }); } }
        corners(r, ['clutter', 'sacks', 'candles'], 3);
        break;
      case 'study':
        putWall(r, 'desk', 1, 1);
        putWall(r, ['bookshelf', 'bookshelf', 'shelf'], Math.floor(area / 7) + 1);
        rugIn(r);
        corners(r, ['candles', 'globe', 'bookpile'], 2);
        if (rng.chance(0.4)) chestIn(r, 0);
        hangWall(r, ['painting'], 1);
        break;
      case 'prison':
        putWall(r, ['cage', 'straw', 'bucket'], Math.floor(area / 6));
        hangWall(r, ['shackles'], Math.floor(area / 6) + 1);
        corners(r, ['bones', 'straw'], 3);
        break;
      case 'crypt':
        rows(r, 'sarcophagus', { step: 2, start: 1, end: 1 });
        putWall(r, ['statue', 'candles', 'bones'], Math.floor(area / 10));
        corners(r, ['candles', 'bones', 'pot'], 3);
        break;
      case 'chapel': case 'shrine': {
        if (f === 'chapel' && !r.dais) rows(r, 'pew', { step: 2, start: 2, end: 2 });
        else if (f === 'chapel') {
          const alongDais = dais.side === 'N' || dais.side === 'S';
          const face = { N: 1, S: -1, W: 1, E: -1 }[dais.side];
          const wid = alongDais ? r.w : r.h, len = alongDais ? r.h : r.w;
          for (let k = dais.deep + 2; k < len - 1; k += 2) for (let j = 1; j < wid - 1; j++) {
            if (Math.abs(j - (wid - 1) / 2) < 1) continue;
            const x = alongDais ? r.x + j : (dais.side === 'W' ? r.x + k : r.x + r.w - 1 - k);
            const y = alongDais ? (dais.side === 'N' ? r.y + k : r.y + r.h - 1 - k) : r.y + j;
            if (!freeCell(x, y) || nearEntrance(r, x, y, 1)) continue;
            place('pew', x, y, { rot: alongDais ? (face > 0 ? Math.PI : 0) : (face > 0 ? -Math.PI / 2 : Math.PI / 2), roomId: r.id });
          }
        }
        const c = daisCentre();
        if (c && r.type !== 'shrine') { const [x, y] = c; place('altar', x, y, { rot: daisRot, roomId: r.id }); }
        hangWall(r, ['banner'], 2);
        corners(r, ['candles', 'statue'], 4);
        if (r.ceil - r.floorY > 6) chandeliers(r, 1);
        break;
      }
      case 'throne': {
        const c = daisCentre();
        if (c) { const [x, y] = c; place('throne', x, y, { rot: daisRot, roomId: r.id }); }
        rugIn(r, 'runner');
        hangWall(r, ['banner', 'banner', 'painting'], Math.floor(area / 8));
        corners(r, ['statue', 'candles'], 4);
        chandeliers(r, 2);
        break;
      }
      case 'treasury':
        corners(r, ['coinpile', 'statue', 'candles'], 4);
        hangWall(r, ['banner'], 2);
        break;
      case 'arena':
        putWall(r, ['weaponRack', 'dummy', 'barrel'], Math.floor(area / 12));
        hangWall(r, ['banner', 'shield'], 3);
        break;
      case 'ruin':
        corners(r, ['bones', 'clutter', 'pot'], 4);
        putWall(r, ['statue', 'crate', 'bones'], 3);
        break;
      case 'stairs':
        hangWall(r, ['banner', 'painting'], 3);
        putWall(r, ['statue', 'bust'], 2, 1);
        break;
      case 'boss':
        break;
      default:
        putWall(r, ['barrel', 'crate', 'banner', 'statue'], Math.floor(area / 14));
    }
    // a little everyday mess everywhere
    if (!['boss', 'treasury', 'shop'].includes(f) && r.type !== 'boss') {
      let pots = Math.floor(area / 22) + rng.int(0, 1);
      for (const s of wallSlots(r, 1)) {
        if (pots-- <= 0) break;
        const [wx, wz] = wc(s.x, s.y);
        occupied[idx(s.x, s.y)] = 1;
        for (let k = rng.int(1, 3); k > 0; k--) placeAt('pot', wx - s.nx * 0.75 + rng.range(-0.6, 0.6) * Math.abs(s.ny), wz - s.ny * 0.75 + rng.range(-0.6, 0.6) * Math.abs(s.nx), { rot: rng.range(0, 6), roomId: r.id });
      }
      if (rng.chance(0.4)) for (const [x, y] of cornerSlots(r).slice(0, 1)) {
        const ns = wallNormalOf(x, y);
        const [wx, wz] = wc(x, y);
        placeAt('cobweb', wx - (ns[0][0] + ns[1][0]) * 1.0, wz - (ns[0][1] + ns[1][1]) * 1.0, { rot: Math.atan2(-(ns[0][0] + ns[1][0]), -(ns[0][1] + ns[1][1])), y: r.ceil, roomId: r.id });
      }
    }
  };

  const chestTier = (base) => base + (rng.chance(0.2 + floor * 0.04) ? 1 : 0);

  for (const r of rooms) {
    if (r.type === 'shop') {
      r.decor = 'storage';
      place('shop', r.cx, r.cy, { roomId: r.id });
      for (let x = r.cx - 2; x <= r.cx + 2; x++) for (let y = r.cy - 1; y <= r.cy + 1; y++) if (walk(x, y)) occupied[idx(x, y)] = 1;
    }
    if (r.type === 'shrine' && freeCell(r.cx, r.cy)) place('shrine', r.cx, r.cy, { kind: rng.pick(['blood', 'fortune', 'fountain', 'anvil', 'gamble', 'challenge']), roomId: r.id });
    if (r.type === 'boss') place('exit', r.cx, r.cy, {});
    if (r.type === 'arena') place('chest', r.cx, r.cy, { tier: chestTier(1), hidden: true, rot: 0 });
    if (r.type === 'secret') {
      const roll = rng.next();
      if (roll < 0.45) place('pedestal', r.cx, r.cy, { item: 'relic', tier: 1 + (rng.chance(0.3) ? 1 : 0) });
      else if (roll < 0.75) place('chest', r.cx, r.cy, { tier: 2, rot: rng.range(0, 6.28) });
      else place('shrine', r.cx, r.cy, { kind: rng.pick(['fortune', 'blood', 'fountain']) });
    }
    if (r.type === 'vault') {
      const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 1));
      rng.shuffle(s);
      for (let k = 0; k < 2 && s.length; k++) { const [x, y] = s.pop(); place('chest', x, y, { tier: 2 + (rng.chance(0.3) ? 1 : 0), rot: rng.range(0, 6.28) }); }
      if (s.length) { const [x, y] = s.pop(); place('pedestal', x, y, { item: 'relic', tier: 2 }); }
    }
    furnish(r);
    switch (r.type) {
      case 'start': break;
      case 'combat': {
        spawnEnemies(r, budgetFor(r) * (r.hall ? 0.45 : 0.75));
        if (rng.chance(0.4)) {
          const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 2));
          if (s.length) { const [x, y] = rng.pick(s); place('explosiveBarrel', x, y); }
        }
        if (rng.chance(0.18)) chestIn(r, chestTier(0), { mimic: floor >= 2 && rng.chance(0.15) });
        break;
      }
      case 'quiet':
        if (rng.chance(0.3)) spawnEnemies(r, budgetFor(r) * 0.3);
        if (rng.chance(0.12)) chestIn(r, chestTier(0), { mimic: floor >= 2 && rng.chance(0.2) });
        break;
      case 'arena': {
        r.waves = 2 + (floor >= 3 ? 1 : 0);
        for (let w = 0; w < r.waves; w++) spawnEnemies(r, budgetFor(r) * (0.75 + w * 0.2), { wave: w + 1 });
        break;
      }
      case 'miniboss': {
        const kinds = enemyKinds.filter((k) => ENEMY_COST[k] >= 1);
        const [cxw, czw] = wc(r.cx, r.cy);
        placeAt('enemy', cxw, czw, { kind: rng.pick(kinds), roomId: r.id, elite: 3, miniboss: true, dropKey: !!vault, wave: 1 });
        spawnEnemies(r, budgetFor(r) * 0.5, { noElite: true, wave: 1 });
        break;
      }
      case 'treasure': {
        const s = roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 1));
        rng.shuffle(s);
        for (let k = 0; k < rng.int(1, 2) && s.length; k++) { const [x, y] = s.pop(); place('chest', x, y, { tier: chestTier(0), rot: rng.range(0, 6.28), mimic: floor >= 2 && rng.chance(0.12) }); }
        for (let k = 0; k < Math.floor(r.w * r.h / 8) && s.length; k++) { const [x, y] = s.pop(); if (!freeCell(x, y)) continue; place('trap', x, y, { kind: 'spikes' }); flags[idx(x, y)] |= F.TRAP; }
        spawnEnemies(r, budgetFor(r) * 0.4);
        break;
      }
      case 'shrine':
        if (rng.chance(0.4)) spawnEnemies(r, budgetFor(r) * 0.5);
        break;
      default:
    }
  }

  // hall traps and wanderers
  {
    const hallCells = [];
    for (const r of rooms) if (r.hall) for (const c of roomCells(r, (x, y) => freeCell(x, y) && !nearEntrance(r, x, y, 1))) hallCells.push(c);
    rng.shuffle(hallCells);
    const trapCount = Math.floor(hallCells.length * (0.03 + floor * 0.007));
    let placed = 0;
    const trapKinds = ['spikes', 'spikes'];
    if (theme.lava || floor >= 3) trapKinds.push('flame');
    for (const [x, y] of hallCells) {
      if (placed >= trapCount) break;
      if (!freeCell(x, y)) continue;
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < 10) continue;
      place('trap', x, y, { kind: rng.pick(trapKinds), axis: 'x' });
      flags[idx(x, y)] |= F.TRAP;
      placed++;
    }
    let wand = Math.floor(hallCells.length / 45) + floor;
    for (const [x, y] of hallCells) {
      if (wand <= 0) break;
      if (!freeCell(x, y)) continue;
      if (Math.abs(x - start.cx) + Math.abs(y - start.cy) < 12) continue;
      const [wx, wz] = wc(x, y);
      placeAt('enemy', wx, wz, { kind: rng.chance(0.4) ? 'bat' : pickEnemy(), roomId: roomOf[idx(x, y)], elite: 0 });
      occupied[idx(x, y)] = 1;
      wand--;
    }
  }

  // key placement fallback (no miniboss): put it in a chest somewhere reachable
  if (vault && !miniboss) {
    const cand = rooms.filter((r) => r.type === 'combat' || r.type === 'treasure' || r.type === 'quiet');
    const r = cand.length ? rng.pick(cand) : start;
    const s = roomCells(r, (x, y) => freeCell(x, y));
    if (s.length) { const [x, y] = rng.pick(s); place('chest', x, y, { tier: 1, rot: 0, key: true }); }
  }

  // floor loot sprinkles
  for (const r of rooms) {
    if (r.type === 'shop' || r.type === 'boss' || r.type === 'start') continue;
    if (rng.chance(0.25)) {
      const s = roomCells(r, (x, y) => freeCell(x, y));
      if (s.length) { const [x, y] = rng.pick(s); const [wx, wz] = wc(x, y); placeAt('loot', wx, wz, { what: rng.chance(0.7) ? 'gold' : 'potion' }); }
    }
  }

  const [sx, sz] = wc(start.cx, start.cy);
  return {
    W, H, cells, roomOf, ceil, flags, floorH, stairDir, stairRise, rooms, doors, gates, secretWalls, torches, entrances: doorList,
    entities: ents, start: { x: sx, z: sz }, startRoom: start.id, bossRoom: boss.id, floor, theme,
  };
}
