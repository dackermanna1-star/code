/* ==========================================================================
   SPLEEN: SEPSIS — world.js
   Tiles, collision, line of sight, flow fields, floor & room generation.
   Sim space: tile units, x right, y down. Tile (i,j) spans [i,i+1)x[j,j+1).
   ========================================================================== */
"use strict";

const T_FLOOR = 0, T_WALL = 1, T_ROCK = 2, T_CLOT = 3, T_HOLE = 4, T_ACID = 5, T_DOOR = 6;
const CELL_W = 17, CELL_H = 11;               // one map cell in tiles (incl. 1-tile walls)
const BOSS_W = 25, BOSS_H = 17;               // boss arenas are bigger (camera pulls back)

/* collision masks (bit per tile type) */
const bit = (t) => 1 << t;
const MASK_WALKER = bit(T_WALL) | bit(T_ROCK) | bit(T_CLOT) | bit(T_HOLE) | bit(T_DOOR);
const MASK_FLYER = bit(T_WALL) | bit(T_DOOR);
const MASK_PLAYER_OPEN = bit(T_WALL) | bit(T_ROCK) | bit(T_CLOT) | bit(T_HOLE);
const MASK_PLAYER_LOCKED = MASK_PLAYER_OPEN | bit(T_DOOR);
const MASK_SHOT = bit(T_WALL) | bit(T_ROCK) | bit(T_CLOT) | bit(T_DOOR);
const MASK_SHOT_SPECTRAL = bit(T_WALL) | bit(T_DOOR);
const MASK_LOS = bit(T_WALL) | bit(T_ROCK) | bit(T_CLOT) | bit(T_DOOR);

const World = (function () {
  const W = {};

  /* ---------------- tile queries ---------------- */
  W.tile = function (room, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= room.W || ty >= room.H) return T_WALL;
    return room.grid[ty * room.W + tx];
  };
  W.setTile = function (room, tx, ty, t) { if (tx >= 0 && ty >= 0 && tx < room.W && ty < room.H) room.grid[ty * room.W + tx] = t; };
  W.blocked = function (room, tx, ty, mask) { return ((mask >> W.tile(room, tx, ty)) & 1) === 1; };
  W.blockedAt = function (room, x, y, mask) { return W.blocked(room, Math.floor(x), Math.floor(y), mask); };

  /** Resolve circle against blocking tiles. Mutates ent.x/ent.y. Returns true if collided. */
  W.collideCircle = function (room, ent, r, mask) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor(ent.x - r), x1 = Math.floor(ent.x + r), y0 = Math.floor(ent.y - r), y1 = Math.floor(ent.y + r);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!W.blocked(room, tx, ty, mask)) continue;
        const cx = clamp(ent.x, tx, tx + 1), cy = clamp(ent.y, ty, ty + 1);
        let dx = ent.x - cx, dy = ent.y - cy; const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-9) {
          // centre inside tile: push out along the shallowest axis
          const l = ent.x - tx, rr = tx + 1 - ent.x, t = ent.y - ty, b = ty + 1 - ent.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) ent.x = tx - r; else if (m === rr) ent.x = tx + 1 + r; else if (m === t) ent.y = ty - r; else ent.y = ty + 1 + r;
        } else {
          const d = Math.sqrt(d2), push = r - d; dx /= d; dy /= d;
          ent.x += dx * push; ent.y += dy * push;
          if (ent.vx !== undefined) { const vn = ent.vx * dx + ent.vy * dy; if (vn < 0) { ent.vx -= vn * dx; ent.vy -= vn * dy; } }
        }
        moved = true; hit = true;
      }
      if (!moved) break;
    }
    return hit;
  };

  /** Grid line of sight (DDA). */
  W.los = function (room, x0, y0, x1, y1, mask = MASK_LOS) {
    let tx = Math.floor(x0), ty = Math.floor(y0); const ex = Math.floor(x1), ey = Math.floor(y1);
    const dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (tx + 1 - x0) : (x0 - tx)) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? (ty + 1 - y0) : (y0 - ty)) * tdy : Infinity;
    for (let i = 0; i < 200; i++) {
      if (tx === ex && ty === ey) return true;
      if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
      if (W.blocked(room, tx, ty, mask)) return tx === ex && ty === ey && false;
    }
    return true;
  };
  /** Distance a ray travels before hitting a blocking tile (max len). */
  W.rayLen = function (room, x0, y0, ang, maxLen, mask = MASK_SHOT) {
    const step = 0.1, cx = Math.cos(ang) * step, cy = Math.sin(ang) * step;
    let x = x0, y = y0;
    for (let d = 0; d < maxLen; d += step) {
      x += cx; y += cy;
      if (W.blockedAt(room, x, y, mask)) return d;
    }
    return maxLen;
  };

  /* ---------------- flow field toward the player ---------------- */
  W.flow = { dist: null, w: 0, h: 0, ptx: -1, pty: -1, roomId: -1 };
  W.updateFlow = function (room, px, py) {
    const tx = Math.floor(px), ty = Math.floor(py), F = W.flow;
    if (F.roomId === room.id && F.ptx === tx && F.pty === ty && !room.flowDirty) return;
    room.flowDirty = false;
    F.roomId = room.id; F.ptx = tx; F.pty = ty; F.w = room.W; F.h = room.H;
    const n = room.W * room.H;
    if (!F.dist || F.dist.length !== n) F.dist = new Float32Array(n);
    const dist = F.dist; dist.fill(1e9);
    const q = new Int32Array(n); let qh = 0, qt = 0;
    const startIdx = clamp(ty, 0, room.H - 1) * room.W + clamp(tx, 0, room.W - 1);
    dist[startIdx] = 0; q[qt++] = startIdx;
    const mask = MASK_WALKER & ~bit(T_DOOR);
    while (qh < qt) {
      const i = q[qh++], x = i % room.W, y = (i / room.W) | 0, d = dist[i];
      for (let k = 0; k < 8; k++) {
        const dx = DX8[k], dy = DY8[k], nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= room.W || ny >= room.H) continue;
        if (W.blocked(room, nx, ny, mask)) continue;
        if (dx && dy && (W.blocked(room, x + dx, y, mask) || W.blocked(room, x, y + dy, mask))) continue;
        const ni = ny * room.W + nx, nd = d + (dx && dy ? 1.414 : 1) + (room.grid[ni] === T_ACID ? 3 : 0);
        if (nd < dist[ni]) { dist[ni] = nd; q[qt++] = ni; }
      }
    }
  };
  const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
  /** direction (unit) a walker at x,y should move to approach the player */
  W.flowDir = function (room, x, y) {
    const F = W.flow; if (!F.dist || F.roomId !== room.id) return null;
    const tx = Math.floor(x), ty = Math.floor(y);
    let best = Infinity, bx = 0, by = 0;
    const here = (tx >= 0 && ty >= 0 && tx < room.W && ty < room.H) ? F.dist[ty * room.W + tx] : 1e9;
    for (let k = 0; k < 8; k++) {
      const nx = tx + DX8[k], ny = ty + DY8[k];
      if (nx < 0 || ny < 0 || nx >= room.W || ny >= room.H) continue;
      const d = F.dist[ny * room.W + nx];
      if (d < best) { best = d; bx = nx + 0.5 - x; by = ny + 0.5 - y; }
    }
    if (best >= 1e8 || best >= here + 0.01 && here < 1e8 && here === 0) return null;
    const l = Math.hypot(bx, by); if (l < 1e-6) return null;
    return { x: bx / l, y: by / l, d: here };
  };
  W.flowDist = function (room, x, y) {
    const F = W.flow; if (!F.dist || F.roomId !== room.id) return 1e9;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= room.W || ty >= room.H) return 1e9;
    return F.dist[ty * room.W + tx];
  };

  /* ---------------- obstacle templates (15 x 9 interior) ---------------- */
  // . floor  # rock  c clot  o hole  a acid  x rock-or-clot  r random-sparse
  const TPL = [
    ['...............', '...............', '...............', '...............', '...............', '...............', '...............', '...............', '...............'],
    ['...............', '...............', '...#.......#...', '...............', '...............', '...............', '...#.......#...', '...............', '...............'],
    ['...............', '...............', '...............', '......xxx......', '......xxx......', '......xxx......', '...............', '...............', '...............'],
    ['##...........##', '#.............#', '...............', '...............', '...............', '...............', '...............', '#.............#', '##...........##'],
    ['...............', '...............', '..c.c.....c.c..', '...............', '...............', '...............', '..c.c.....c.c..', '...............', '...............'],
    ['...............', '...............', '...oo.....oo...', '...oo.....oo...', '...............', '...oo.....oo...', '...oo.....oo...', '...............', '...............'],
    ['...............', '...#########...', '...............', '...............', '...............', '...............', '...............', '...#########...', '...............'],
    ['...............', '...............', '......x.x......', '.....x...x.....', '...............', '.....x...x.....', '......x.x......', '...............', '...............'],
    ['...............', '...............', '....ooo.ooo....', '....o.....o....', '...............', '....o.....o....', '....ooo.ooo....', '...............', '...............'],
    ['...............', '..#..#...#..#..', '...............', '...............', '...............', '...............', '...............', '..#..#...#..#..', '...............'],
    ['...............', '.##.........##.', '.#...........#.', '...............', '...............', '...............', '.#...........#.', '.##.........##.', '...............'],
    ['...............', '..aaa.....aaa..', '..aaa.....aaa..', '...............', '.......a.......', '...............', '..aaa.....aaa..', '..aaa.....aaa..', '...............'],
    ['...............', '...............', '.....ooooo.....', '.....ooooo.....', '.....oo.oo.....', '.....ooooo.....', '.....ooooo.....', '...............', '...............'],
    ['...............', '....#..........', '....#....#.....', '....#....#.....', '.........#.....', '....#..........', '....#....#.....', '.........#.....', '...............'],
    ['...............', '..xx.......xx..', '..x.........x..', '...............', '.......c.......', '...............', '..x.........x..', '..xx.......xx..', '...............'],
    ['...............', '...............', '..ccc.....ccc..', '...............', '...............', '...............', '..ccc.....ccc..', '...............', '...............'],
    ['...............', '.......#.......', '.......#.......', '...............', '.##.........##.', '...............', '.......#.......', '.......#.......', '...............'],
    ['...............', '...............', '...............', '...ooo...ooo...', '...ooo...ooo...', '...ooo...ooo...', '...............', '...............', '...............'],
  ];
  W.TPL_COUNT = TPL.length;

  function regionTile(ch, region, rng) {
    if (ch === '.') return T_FLOOR;
    if (ch === '#') return T_ROCK;
    if (ch === 'c') return T_CLOT;
    if (ch === 'o') return region.id === 'gut' && rng.chance(0.5) ? T_ACID : T_HOLE;
    if (ch === 'a') return (region.id === 'gut' || region.id === 'wound') ? T_ACID : (region.id === 'lungs' ? T_HOLE : T_ROCK);
    if (ch === 'x') return rng.chance(region.id === 'veins' || region.id === 'heart' ? 0.55 : 0.3) ? T_CLOT : T_ROCK;
    return T_FLOOR;
  }

  /* ---------------- floor generation ---------------- */
  const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  W.OPP = OPP;

  W.genFloor = function (floorIdx, seed) {
    const region = REGIONS[floorIdx];
    for (let attempt = 0; attempt < 200; attempt++) {
      const res = tryGen(floorIdx, region, seed + attempt * 7919);
      if (res) return res;
    }
    throw new Error('floor generation failed');
  };

  function tryGen(floorIdx, region, seed) {
    const rng = makeRng(seed);
    const SZ = 13, C = 6;
    const cells = new Map(); // "x,y" -> {x,y,room:null}
    const key = (x, y) => x + ',' + y;
    const nbCount = (x, y) => { let n = 0; for (const d in DIRS) if (cells.has(key(x + DIRS[d][0], y + DIRS[d][1]))) n++; return n; };
    const target = 9 + floorIdx + rng.int(0, 2);
    cells.set(key(C, C), { x: C, y: C });
    let frontier = [[C, C]];
    let guard = 0;
    while (cells.size < target && guard++ < 400) {
      if (!frontier.length) frontier = [...cells.values()].map(c => [c.x, c.y]);
      const next = [];
      for (const [x, y] of frontier) {
        for (const d of rng.shuffle(['N', 'S', 'E', 'W'])) {
          if (cells.size >= target) break;
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (nx < 1 || ny < 1 || nx >= SZ - 1 || ny >= SZ - 1) continue;
          if (cells.has(key(nx, ny))) continue;
          if (nbCount(nx, ny) > 1) continue;
          if (rng.chance(0.45)) continue;
          cells.set(key(nx, ny), { x: nx, y: ny }); next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    if (cells.size < target) return null;
    // BFS distances from start
    const distTo = new Map(); distTo.set(key(C, C), 0);
    const q = [[C, C]];
    while (q.length) { const [x, y] = q.shift(); for (const d in DIRS) { const k = key(x + DIRS[d][0], y + DIRS[d][1]); if (cells.has(k) && !distTo.has(k)) { distTo.set(k, distTo.get(key(x, y)) + 1); q.push([x + DIRS[d][0], y + DIRS[d][1]]); } } }
    const deadEnds = [...cells.values()].filter(c => !(c.x === C && c.y === C) && nbCount(c.x, c.y) === 1);
    deadEnds.sort((a, b) => distTo.get(key(b.x, b.y)) - distTo.get(key(a.x, a.y)));
    const wantTumor = floorIdx >= 1 && rng.chance(0.55);
    const wantElite = floorIdx >= 1 && rng.chance(0.6);
    const needed = 3 + (wantTumor ? 1 : 0) + (wantElite ? 1 : 0);
    if (deadEnds.length < needed) return null;
    const bossCell = deadEnds[0];
    if (distTo.get(key(bossCell.x, bossCell.y)) < 3) return null;
    // the boss cell must not neighbour the start
    const specials = {};
    specials[key(bossCell.x, bossCell.y)] = 'boss';
    const rest = rng.shuffle(deadEnds.slice(1));
    const order = ['mutation', 'shop'];
    if (wantElite) order.push('elite');
    if (wantTumor) order.push('tumor');
    for (const t of order) { const c = rest.shift(); specials[key(c.x, c.y)] = t; }

    // build rooms; merge some normal cells into larger rooms
    const rooms = []; const cellRoom = new Map();
    const isNormal = (x, y) => cells.has(key(x, y)) && !specials[key(x, y)] && !(x === C && y === C) && !cellRoom.has(key(x, y));
    const mkRoom = (type, cx0, cy0, cw, ch) => {
      const r = { id: rooms.length, type, cx0, cy0, cw, ch, cells: [] };
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { r.cells.push([cx0 + i, cy0 + j]); cellRoom.set(key(cx0 + i, cy0 + j), r); }
      rooms.push(r); return r;
    };
    mkRoom('start', C, C, 1, 1);
    for (const k in specials) { const [x, y] = k.split(',').map(Number); mkRoom(specials[k], x, y, 1, 1); }
    // try 2x2 merges
    const cellList = rng.shuffle([...cells.values()]);
    for (const c of cellList) {
      if (rng.chance(0.82)) continue;
      if (isNormal(c.x, c.y) && isNormal(c.x + 1, c.y) && isNormal(c.x, c.y + 1) && isNormal(c.x + 1, c.y + 1)) mkRoom('normal', c.x, c.y, 2, 2);
    }
    for (const c of cellList) {
      if (!isNormal(c.x, c.y)) continue;
      const r = rng.next();
      if (r < 0.2 && isNormal(c.x + 1, c.y)) mkRoom('normal', c.x, c.y, 2, 1);
      else if (r < 0.36 && isNormal(c.x, c.y + 1)) mkRoom('normal', c.x, c.y, 1, 2);
      else mkRoom('normal', c.x, c.y, 1, 1);
    }
    // finalise each room: tile grid + doors
    for (const r of rooms) {
      r.seed = (seed * 31 + r.id * 977) >>> 0;
      r.boss = r.type === 'boss';
      r.W = r.boss ? BOSS_W : r.cw * CELL_W;
      r.H = r.boss ? BOSS_H : r.ch * CELL_H;
      r.grid = new Uint8Array(r.W * r.H);
      r.doors = [];
      r.cleared = r.type !== 'normal' && r.type !== 'boss' && r.type !== 'elite';
      r.visited = false; r.seen = false;
      r.region = region;
    }
    // doors between different rooms on adjacent cells
    for (const r of rooms) {
      for (const [cx, cy] of r.cells) {
        for (const d in DIRS) {
          const nk = key(cx + DIRS[d][0], cy + DIRS[d][1]);
          const other = cellRoom.get(nk);
          if (!other || other === r) continue;
          const li = cx - r.cx0, lj = cy - r.cy0;
          let x, y;
          if (r.boss) {
            if (d === 'N') { x = Math.floor(r.W / 2) + 0.5; y = 0.5; } else if (d === 'S') { x = Math.floor(r.W / 2) + 0.5; y = r.H - 0.5; }
            else if (d === 'W') { x = 0.5; y = Math.floor(r.H / 2) + 0.5; } else { x = r.W - 0.5; y = Math.floor(r.H / 2) + 0.5; }
          } else {
            if (d === 'N') { x = li * CELL_W + 8.5; y = 0.5; } else if (d === 'S') { x = li * CELL_W + 8.5; y = r.H - 0.5; }
            else if (d === 'W') { x = 0.5; y = lj * CELL_H + 5.5; } else { x = r.W - 0.5; y = lj * CELL_H + 5.5; }
          }
          const kind = other.type === 'normal' ? 'normal' : other.type;
          r.doors.push({ dir: d, x, y, to: other.id, cell: [cx, cy], ncell: [cx + DIRS[d][0], cy + DIRS[d][1]], kind: (r.type !== 'normal' && r.type !== 'start' && other.type === 'normal') ? r.type : kind });
        }
      }
    }
    for (const r of rooms) buildRoomGrid(r, region, floorIdx);
    const floor = { idx: floorIdx, region, rooms, cellRoom, key, startId: 0, bossId: rooms.find(r => r.type === 'boss').id, seed };
    return floor;
  }

  function buildRoomGrid(r, region, floorIdx) {
    const rng = makeRng(r.seed);
    const Wd = r.W, Hd = r.H, g = r.grid;
    // border walls
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) if (x === 0 || y === 0 || x === Wd - 1 || y === Hd - 1) g[y * Wd + x] = T_WALL;
    // door gaps (3 wide)
    for (const d of r.doors) {
      const tx = Math.floor(d.x), ty = Math.floor(d.y);
      for (let k = -1; k <= 1; k++) {
        if (d.dir === 'N' || d.dir === 'S') g[ty * Wd + tx + k] = T_DOOR; else g[(ty + k) * Wd + tx] = T_DOOR;
      }
    }
    // obstacles for normal/elite rooms
    if (r.type === 'normal' || r.type === 'elite') {
      for (let j = 0; j < r.ch; j++) for (let i = 0; i < r.cw; i++) {
        const tid = (r.cw * r.ch > 1 && rng.chance(0.25)) ? 0 : rng.int(1, TPL.length - 1);
        let tpl = TPL[tid];
        if (tid === 11 && region.id !== 'gut' && region.id !== 'wound' && rng.chance(0.7)) tpl = TPL[rng.int(1, 10)];
        const fx = rng.chance(0.5), fy = rng.chance(0.5);
        for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 15; tx++) {
          const ch = tpl[fy ? 8 - ty : ty][fx ? 14 - tx : tx];
          const t = regionTile(ch, region, rng);
          if (t !== T_FLOOR) g[(j * CELL_H + 1 + ty) * Wd + (i * CELL_W + 1 + tx)] = t;
        }
      }
      // random clot sprinkle in flesh regions
      if (region.id === 'veins' || region.id === 'heart' || region.id === 'wound') {
        const n = rng.int(0, 3) * r.cw * r.ch;
        for (let k = 0; k < n; k++) { const x = rng.int(2, Wd - 3), y = rng.int(2, Hd - 3); if (g[y * Wd + x] === T_FLOOR) g[y * Wd + x] = T_CLOT; }
      }
      clearDoorLanes(r); ensureConnected(r);
    } else if (r.type === 'boss') {
      // a few pillars for cover in the bigger arenas
      const pillars = [[5, 4], [Wd - 6, 4], [5, Hd - 5], [Wd - 6, Hd - 5]];
      if (r.region.id !== 'gut') for (const [x, y] of pillars) if (rng.chance(0.75)) g[y * Wd + x] = T_ROCK;
      clearDoorLanes(r);
    }
    r.clotHp = {};
    for (let i = 0; i < g.length; i++) if (g[i] === T_CLOT) r.clotHp[i] = 10 + floorIdx * 3;
  }
  function clearDoorLanes(r) {
    const g = r.grid, Wd = r.W;
    for (const d of r.doors) {
      const tx = Math.floor(d.x), ty = Math.floor(d.y);
      for (let a = -2; a <= 2; a++) for (let b = 1; b <= 3; b++) {
        let x, y;
        if (d.dir === 'N') { x = tx + a; y = ty + b; } else if (d.dir === 'S') { x = tx + a; y = ty - b; }
        else if (d.dir === 'W') { x = tx + b; y = ty + a; } else { x = tx - b; y = ty + a; }
        if (x > 0 && y > 0 && x < r.W - 1 && y < r.H - 1) g[y * Wd + x] = T_FLOOR;
      }
    }
  }
  /** Flood fill from first door / centre; turn unreachable floor into holes, open blocked doors */
  function ensureConnected(r) {
    const g = r.grid, Wd = r.W, Hd = r.H;
    const walk = (t) => t === T_FLOOR || t === T_ACID || t === T_DOOR;
    for (let pass = 0; pass < 6; pass++) {
      const seen = new Uint8Array(Wd * Hd);
      let sx = Math.floor(Wd / 2), sy = Math.floor(Hd / 2);
      if (!walk(g[sy * Wd + sx])) { outer: for (let y = 1; y < Hd - 1; y++) for (let x = 1; x < Wd - 1; x++) if (walk(g[y * Wd + x])) { sx = x; sy = y; break outer; } }
      const st = [sy * Wd + sx]; seen[st[0]] = 1;
      while (st.length) {
        const i = st.pop(), x = i % Wd, y = (i / Wd) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
          const ni = ny * Wd + nx; if (seen[ni] || !walk(g[ni])) continue; seen[ni] = 1; st.push(ni);
        }
      }
      // any door tile unreached? carve a straight corridor toward centre
      let fixed = false;
      for (const d of r.doors) {
        const tx = Math.floor(d.x), ty = Math.floor(d.y);
        if (seen[ty * Wd + tx]) continue;
        let x = tx, y = ty;
        for (let s = 0; s < 40; s++) {
          if (Math.abs(x - sx) > Math.abs(y - sy)) x += Math.sign(sx - x); else y += Math.sign(sy - y);
          if (x <= 0 || y <= 0 || x >= Wd - 1 || y >= Hd - 1) continue;
          if (g[y * Wd + x] !== T_FLOOR && g[y * Wd + x] !== T_ACID) g[y * Wd + x] = T_FLOOR;
          if (x === sx && y === sy) break;
        }
        fixed = true;
      }
      if (!fixed) {
        // unreachable floor pockets become rock (prevents spawning there)
        for (let i = 0; i < g.length; i++) if ((g[i] === T_FLOOR || g[i] === T_ACID) && !seen[i]) g[i] = T_ROCK;
        return;
      }
    }
  }

  /** Floor tiles suitable for spawning (reachable, open, away from a point) */
  W.spawnSpots = function (room, avoidX, avoidY, minDist, flyer) {
    const out = [];
    for (let y = 2; y < room.H - 2; y++) for (let x = 2; x < room.W - 2; x++) {
      const t = room.grid[y * room.W + x];
      if (t !== T_FLOOR && !(flyer && (t === T_HOLE || t === T_ACID))) continue;
      if (!flyer) { // need a little breathing room
        let ok = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const tt = room.grid[(y + dy) * room.W + x + dx]; if (tt === T_WALL || tt === T_DOOR) ok = false; }
        if (!ok) continue;
      }
      if (dist(x + 0.5, y + 0.5, avoidX, avoidY) < minDist) continue;
      out.push([x + 0.5, y + 0.5]);
    }
    return out;
  };
  W.isOpenFloor = function (room, x, y) { const t = W.tile(room, Math.floor(x), Math.floor(y)); return t === T_FLOOR || t === T_ACID; };
  /** nearest walkable tile centre to (x,y) */
  W.nearestOpen = function (room, x, y) {
    let best = null, bd = 1e9;
    for (let r = 0; r < 8 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
        if (W.tile(room, tx, ty) !== T_FLOOR) continue;
        const d = dist(tx + 0.5, ty + 0.5, x, y); if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
      }
    }
    return best || { x: room.W / 2, y: room.H / 2 };
  };
  /** where the player appears after walking through door `d` (the door in the NEW room) */
  W.entryPoint = function (room, d) {
    const inset = 1.9;
    if (d.dir === 'N') return { x: d.x, y: d.y + inset };
    if (d.dir === 'S') return { x: d.x, y: d.y - inset };
    if (d.dir === 'W') return { x: d.x + inset, y: d.y };
    return { x: d.x - inset, y: d.y };
  };
  return W;
})();
