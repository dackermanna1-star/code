// Runtime dungeon: grid collision, raycasts, navigation flow field and exploration state.
import { C, TILE, PIT_DEPTH, LAVA_DEPTH } from './constants.js';
import { F } from './dungeon-gen.js';

export class World {
  constructor(d) {
    this.d = d;
    this.W = d.W;
    this.H = d.H;
    this.cells = d.cells;
    this.ceil = d.ceil;
    this.flags = d.flags;
    this.roomOf = d.roomOf;
    this.rooms = d.rooms;
    const N = d.W * d.H;
    this.blocked = new Uint8Array(N); // dynamic blockers (closed doors, gates, secret walls)
    this.navBlocked = new Uint8Array(N); // blocks AI pathing only
    this.seen = new Uint8Array(N);
    this.flow = new Int16Array(N).fill(-1);
    this.flowCell = -1;
    this._queue = new Int32Array(N);
    for (const s of d.secretWalls) this.blocked[s.cy * d.W + s.cx] = 1;
  }

  idx(cx, cy) { return cy * this.W + cx; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.W && cy < this.H; }

  cellAt(x, z) {
    const cx = Math.floor(x / TILE), cy = Math.floor(z / TILE);
    if (!this.inBounds(cx, cy)) return C.SOLID;
    return this.cells[cy * this.W + cx];
  }

  solidCell(cx, cy) {
    if (!this.inBounds(cx, cy)) return true;
    const i = cy * this.W + cx;
    return this.cells[i] === C.SOLID || this.blocked[i] === 1;
  }

  solidAt(x, z) {
    return this.solidCell(Math.floor(x / TILE), Math.floor(z / TILE));
  }

  // Walkable for AI (no pits/lava/blocked).
  navCell(cx, cy) {
    if (!this.inBounds(cx, cy)) return false;
    const i = cy * this.W + cx;
    return this.cells[i] === C.FLOOR && !this.blocked[i] && !this.navBlocked[i];
  }

  floorAt(x, z) {
    const c = this.cellAt(x, z);
    if (c === C.PIT) return -PIT_DEPTH;
    if (c === C.LAVA) return -LAVA_DEPTH;
    return 0;
  }

  ceilAt(x, z) {
    const cx = Math.floor(x / TILE), cy = Math.floor(z / TILE);
    if (!this.inBounds(cx, cy)) return 3;
    return this.ceil[cy * this.W + cx] || 3;
  }

  roomAt(x, z) {
    const cx = Math.floor(x / TILE), cy = Math.floor(z / TILE);
    if (!this.inBounds(cx, cy)) return null;
    const r = this.roomOf[cy * this.W + cx];
    return r >= 0 ? this.rooms[r] : null;
  }

  isWater(x, z) {
    const cx = Math.floor(x / TILE), cy = Math.floor(z / TILE);
    if (!this.inBounds(cx, cy)) return false;
    return (this.flags[cy * this.W + cx] & F.WATER) !== 0;
  }

  // Push a circle out of solid cells. Mutates pos (x,z). Returns collision normal (or null).
  collideCircle(pos, r, out = null) {
    let hit = false;
    let nx = 0, nz = 0;
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor((pos.x - r) / TILE), x1 = Math.floor((pos.x + r) / TILE);
      const z0 = Math.floor((pos.z - r) / TILE), z1 = Math.floor((pos.z + r) / TILE);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.solidCell(cx, cz)) continue;
          const bx0 = cx * TILE, bx1 = bx0 + TILE, bz0 = cz * TILE, bz1 = bz0 + TILE;
          const px = Math.max(bx0, Math.min(pos.x, bx1));
          const pz = Math.max(bz0, Math.min(pos.z, bz1));
          let dx = pos.x - px, dz = pos.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            dx /= d; dz /= d;
            pos.x = px + dx * r;
            pos.z = pz + dz * r;
          } else {
            // centre inside the box: push out along the shallowest axis
            const l = pos.x - bx0, rr = bx1 - pos.x, t = pos.z - bz0, b = bz1 - pos.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) { pos.x = bx0 - r; dx = -1; dz = 0; }
            else if (m === rr) { pos.x = bx1 + r; dx = 1; dz = 0; }
            else if (m === t) { pos.z = bz0 - r; dx = 0; dz = -1; }
            else { pos.z = bz1 + r; dx = 0; dz = 1; }
          }
          nx += dx; nz += dz;
          hit = true;
        }
      }
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    if (out) { out.x = nx / l; out.z = nz / l; return out; }
    return { x: nx / l, z: nz / l };
  }

  // Grid DDA raycast against walls + floor + ceiling. Returns {dist, x,y,z, nx,ny,nz, cx, cz} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let cx = Math.floor(ox / TILE), cz = Math.floor(oz / TILE);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * TILE - ox : ox - cx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * TILE - oz : oz - cz * TILE) / Math.abs(dz)) : Infinity;
    let t = 0;
    let lastAxis = -1;
    for (let i = 0; i < 128; i++) {
      // floor / ceiling inside the current cell
      const tNext = Math.min(tMaxX, tMaxZ, maxDist);
      if (!this.solidCell(cx, cz)) {
        const i2 = this.inBounds(cx, cz) ? cz * this.W + cx : -1;
        const cellType = i2 >= 0 ? this.cells[i2] : C.SOLID;
        const fy = cellType === C.PIT ? -PIT_DEPTH : cellType === C.LAVA ? -LAVA_DEPTH : 0;
        const cy = i2 >= 0 ? this.ceil[i2] : 3;
        if (dy < 0) {
          const tf = (fy - oy) / dy;
          if (tf >= t && tf <= tNext) return this._hit(tf, ox, oy, oz, dx, dy, dz, 0, 1, 0, cx, cz);
        } else if (dy > 0) {
          const tc = (cy - oy) / dy;
          if (tc >= t && tc <= tNext) return this._hit(tc, ox, oy, oz, dx, dy, dz, 0, -1, 0, cx, cz);
        }
      } else if (lastAxis >= 0) {
        // entered a solid cell: wall hit
        const nx = lastAxis === 0 ? -stepX : 0, nz = lastAxis === 1 ? -stepZ : 0;
        return this._hit(t, ox, oy, oz, dx, dy, dz, nx, 0, nz, cx, cz);
      } else {
        return this._hit(0, ox, oy, oz, dx, dy, dz, -dx, -dy, -dz, cx, cz);
      }
      if (tNext >= maxDist) return null;
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; lastAxis = 0; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; lastAxis = 1; }
    }
    return null;
  }

  _hit(t, ox, oy, oz, dx, dy, dz, nx, ny, nz, cx, cz) {
    return { dist: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx, ny, nz, cx, cz };
  }

  // Line of sight between two points (eye heights), ignoring floor/ceiling.
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
    return !h || h.dist >= d - 0.05;
  }

  // BFS distance field from the player's cell, used by every enemy for pathing.
  updateFlow(px, pz) {
    const cx = Math.floor(px / TILE), cz = Math.floor(pz / TILE);
    const c = cz * this.W + cx;
    if (c === this.flowCell) return;
    this.flowCell = c;
    const flow = this.flow;
    flow.fill(-1);
    if (!this.inBounds(cx, cz)) return;
    const q = this._queue;
    let head = 0, tail = 0;
    q[tail++] = c;
    flow[c] = 0;
    const W = this.W;
    while (head < tail) {
      const i = q[head++];
      const d = flow[i];
      if (d > 60) continue;
      const x = i % W;
      const ns = [x < W - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, i + W, i - W];
      for (const n of ns) {
        if (n < 0 || n >= flow.length || flow[n] >= 0) continue;
        if (this.cells[n] !== C.FLOOR || this.blocked[n] || this.navBlocked[n]) continue;
        flow[n] = d + 1;
        q[tail++] = n;
      }
    }
  }

  // Direction (unnormalized) toward the player following the flow field; null if unreachable.
  flowDir(x, z) {
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    if (!this.inBounds(cx, cz)) return null;
    const W = this.W;
    const i = cz * W + cx;
    const here = this.flow[i];
    let best = here >= 0 ? here : 9999, bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!this.inBounds(nx, nz)) continue;
      const f = this.flow[nz * W + nx];
      if (f < 0) continue;
      if (dx && dz) {
        // no corner cutting
        if (this.flow[cz * W + nx] < 0 || this.flow[nz * W + cx] < 0) continue;
      }
      const cost = f + (dx && dz ? 0.4 : 0);
      if (cost < best) { best = cost; bx = dx; bz = dz; }
    }
    if (bx === 0 && bz === 0) return null;
    // aim at the next cell's centre for smooth corridors
    return { x: (cx + bx + 0.5) * TILE - x, z: (cz + bz + 0.5) * TILE - z, dist: here };
  }

  flowDist(x, z) {
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    if (!this.inBounds(cx, cz)) return -1;
    return this.flow[cz * this.W + cx];
  }

  reveal(x, z, radius = 4) {
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    const room = this.roomAt(x, z);
    if (room && !room.revealed) {
      room.revealed = true;
      for (let yy = room.y - 1; yy <= room.y + room.h; yy++) for (let xx = room.x - 1; xx <= room.x + room.w; xx++) {
        if (this.inBounds(xx, yy)) this.seen[yy * this.W + xx] = 1;
      }
    }
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (!this.inBounds(nx, nz) || dx * dx + dz * dz > radius * radius) continue;
      const i = nz * this.W + nx;
      if (this.seen[i]) continue;
      if (this.los(x, 1.5, z, (nx + 0.5) * TILE, 1.5, (nz + 0.5) * TILE) || this.cells[i] === C.SOLID) {
        // solid cells get revealed only if adjacent to a visible open cell
        if (this.cells[i] !== C.SOLID || this._nearOpenSeen(nx, nz)) this.seen[i] = 1;
      }
    }
  }

  _nearOpenSeen(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (!this.inBounds(nx, nz)) continue;
      const i = nz * this.W + nx;
      if (this.cells[i] !== C.SOLID && this.seen[i]) return true;
    }
    return false;
  }
}
