// Floor-plan grid. Each floor is a 2D grid of 0.5 m cells; every open cell has a
// vertical open span [lo, hi] above the floor base (doors have lintels, windows
// have sills). Geometry, collision and light occlusion are all derived from it.

export const CELL = 0.5;
export const GX0 = -1;
export const GZ0 = -1;
export const GW = 118;
export const GD = 60;
export const FLOORS = [-1, 0, 1];
export const FLOOR_NAMES = { '-1': 'BASEMENT', 0: 'GROUND FLOOR', 1: 'FIRST FLOOR' };

export const T = { OUT: 0, SOLID: 1, FLOOR: 2, DOOR: 3, WINDOW: 4, STAIR: 5, SHAFT: 6 };
export const F = { HOLE: 1, STAIN: 2, HASFLOOR: 4, HASCEIL: 8, NOLIGHT: 16 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const ci = (x) => Math.floor((x - GX0) / CELL + 1e-6);
export const cj = (z) => Math.floor((z - GZ0) / CELL + 1e-6);
export const cx = (i) => GX0 + (i + 0.5) * CELL;
export const cz = (j) => GZ0 + (j + 0.5) * CELL;
const ri = (x) => Math.round((x - GX0) / CELL);
const rj = (z) => Math.round((z - GZ0) / CELL);

export class Grid {
  constructor(k) {
    this.k = k;
    this.base = k * 4;
    const n = GW * GD;
    this.type = new Uint8Array(n);
    this.room = new Int16Array(n).fill(-1);
    this.lo = new Float32Array(n);
    this.hi = new Float32Array(n);
    this.flag = new Uint8Array(n);
  }
  inside(i, j) {
    return i >= 0 && j >= 0 && i < GW && j < GD;
  }
  at(i, j) {
    return this.inside(i, j) ? this.type[j * GW + i] : T.OUT;
  }
  roomAt(i, j) {
    return this.inside(i, j) ? this.room[j * GW + i] : -1;
  }
  fill(x0, z0, x1, z1, fn) {
    const i0 = ri(x0), i1 = ri(x1), j0 = rj(z0), j1 = rj(z1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (this.inside(i, j)) fn(j * GW + i, i, j);
  }
  set(x0, z0, x1, z1, type, room = -1) {
    this.fill(x0, z0, x1, z1, (n) => {
      this.type[n] = type;
      if (room >= 0) this.room[n] = room;
    });
  }
  isOpen(i, j) {
    const t = this.at(i, j);
    return t !== T.OUT && t !== T.SOLID;
  }
  // Does this cell block a body spanning [y0, y1] (world heights)?
  blocks(i, j, y0, y1) {
    const t = this.at(i, j);
    if (t === T.STAIR || t === T.SHAFT) return false;
    const top = this.base + 4;
    if (y1 <= this.base || y0 >= top) return false;
    if (t === T.OUT || t === T.SOLID || t === T.WINDOW) return true;
    const n = j * GW + i;
    const lo = this.base + this.lo[n];
    const hi = this.base + this.hi[n];
    return y0 < lo - 0.45 || y1 > hi;
  }
  // Blocks light travelling horizontally at mid height?
  opaque(i, j) {
    const t = this.at(i, j);
    return t === T.OUT || t === T.SOLID;
  }
}

// Wall/floor/ceiling texture sets. Variants are swapped in by decay level.
export const STYLES = {
  ward: { lower: 'wall_lower', upper: 'wall_paint', floor: 'floor_lino', ceil: 'ceiling_tile', surface: 'tile' },
  lobby: { lower: 'wall_lower', upper: 'wall_paint', floor: 'floor_terrazzo', ceil: 'ceiling_tile', surface: 'tile' },
  tile: { all: 'wall_tile', floor: 'floor_tile_small', ceil: 'ceiling_tile', surface: 'tile' },
  morgue: { all: 'wall_tile', floor: 'floor_tile_small', ceil: 'ceiling_concrete', surface: 'tile' },
  office: { all: 'wall_paint', floor: 'floor_carpet', ceil: 'ceiling_tile', surface: 'carpet' },
  basement: { all: 'wall_brick', floor: 'floor_concrete', ceil: 'ceiling_concrete', surface: 'concrete' },
  service: { all: 'wall_concrete', floor: 'floor_concrete', ceil: 'ceiling_concrete', surface: 'concrete' },
  chapel: { lower: 'wood_dark', upper: 'wall_paint', floor: 'floor_parquet', ceil: 'ceiling_tile', surface: 'wood' },
  stair: { all: 'wall_concrete', floor: 'floor_concrete', ceil: 'ceiling_concrete', surface: 'concrete' },
  shaft: { all: 'wall_concrete', floor: 'floor_concrete', ceil: 'ceiling_concrete', surface: 'concrete' },
};

export const VARIANTS = {
  wall_paint: ['wall_paint_stain', 'wall_paint_peel'],
  wall_lower: ['wall_lower_mold'],
  wall_tile: ['wall_tile_dirty'],
  wall_brick: ['wall_brick'],
  wall_concrete: ['wall_concrete'],
  ceiling_tile: ['ceiling_tile_stain'],
};

export class Level {
  constructor() {
    this.grids = new Map();
    for (const k of FLOORS) this.grids.set(k, new Grid(k));
    this.rooms = [];
    this.doors = [];
    this.windows = [];
    this.stairs = [];
    this.shafts = [];
    this.lamps = [];
    this.colliders = [];
    this.platforms = [];
    this.ramps = [];
    this.ladders = [];
    this.zones = []; // footstep surface overrides
    this.interactables = [];
    this.emitters = []; // audio emitters {type, x,y,z, lamp?}
    this.notes = [];
    this.verticalZones = []; // areas from which other floors can be seen
  }
  grid(k) {
    return this.grids.get(k);
  }

  room(k, x0, z0, x1, z1, style, name, opts = {}) {
    const id = this.rooms.length;
    const room = {
      id, k, x0, z0, x1, z1, name,
      style: STYLES[style] ? { ...STYLES[style] } : style,
      styleName: style,
      decay: opts.decay ?? 0.5,
      ambient: opts.ambient ?? [0.05, 0.05, 0.06],
      ceilH: opts.ceilH ?? 3,
      surface: opts.surface ?? (STYLES[style] ? STYLES[style].surface : 'tile'),
      ...opts,
    };
    if (opts.floor) room.style.floor = opts.floor;
    if (opts.ceil) room.style.ceil = opts.ceil;
    this.rooms.push(room);
    this.grid(k).set(x0, z0, x1, z1, T.FLOOR, id);
    return room;
  }

  // Exterior footprint: everything inside becomes wall until rooms carve it out.
  footprint(k, x0, z0, x1, z1) {
    this.grid(k).set(x0, z0, x1, z1, T.SOLID);
  }

  // A doorway carved through a wall. axis 'x': opening spans x (wall runs along x).
  door(k, x0, z0, x1, z1, opts = {}) {
    const g = this.grid(k);
    const axis = x1 - x0 >= z1 - z0 ? 'x' : 'z';
    const h = opts.h ?? 2.1;
    // the door cell borrows the floor style of the room it leads into
    const room = opts.room ?? this.neighbourRoom(k, x0, z0, x1, z1, axis);
    g.fill(x0, z0, x1, z1, (n) => {
      g.type[n] = T.DOOR;
      g.room[n] = room;
      g.hi[n] = h;
    });
    const d = { k, x0, z0, x1, z1, axis, h, room, ...opts };
    this.doors.push(d);
    return d;
  }

  neighbourRoom(k, x0, z0, x1, z1, axis) {
    const g = this.grid(k);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const probes = axis === 'x' ? [[mx, z0 - 0.25], [mx, z1 + 0.25]] : [[x0 - 0.25, mz], [x1 + 0.25, mz]];
    for (const [px, pz] of probes) {
      const r = g.roomAt(ci(px), cj(pz));
      if (r >= 0 && !this.rooms[r].corridor) return r;
    }
    for (const [px, pz] of probes) {
      const r = g.roomAt(ci(px), cj(pz));
      if (r >= 0) return r;
    }
    return -1;
  }

  window(k, x0, z0, x1, z1, opts = {}) {
    const g = this.grid(k);
    const axis = x1 - x0 >= z1 - z0 ? 'x' : 'z';
    const lo = opts.sill ?? 0.9;
    const hi = opts.head ?? 2.2;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // inward normal: the side that is not outside
    let nx = 0, nz = 0, room = -1;
    if (axis === 'x') {
      const a = g.at(ci(mx), cj(z0 - 0.25));
      if (a === T.OUT) nz = 1;
      else nz = -1;
      room = g.roomAt(ci(mx), cj(nz > 0 ? z1 + 0.25 : z0 - 0.25));
    } else {
      const a = g.at(ci(x0 - 0.25), cj(mz));
      if (a === T.OUT) nx = 1;
      else nx = -1;
      room = g.roomAt(ci(nx > 0 ? x1 + 0.25 : x0 - 0.25), cj(mz));
    }
    g.fill(x0, z0, x1, z1, (n) => {
      g.type[n] = T.WINDOW;
      g.lo[n] = lo;
      g.hi[n] = hi;
      g.room[n] = room;
    });
    const w = { k, x0, z0, x1, z1, axis, lo, hi, nx, nz, room, broken: opts.broken ?? true, boarded: !!opts.boarded };
    this.windows.push(w);
    return w;
  }

  // Resolve spans / floor & ceiling flags once all carving is done.
  finalize() {
    for (const k of FLOORS) {
      const g = this.grid(k);
      const up = this.grids.get(k + 1);
      const down = this.grids.get(k - 1);
      for (let j = 0; j < GD; j++)
        for (let i = 0; i < GW; i++) {
          const n = j * GW + i;
          const t = g.type[n];
          if (t === T.FLOOR) {
            g.lo[n] = 0;
            g.hi[n] = g.room[n] >= 0 ? this.rooms[g.room[n]].ceilH : 3;
          } else if (t === T.DOOR) {
            g.lo[n] = 0;
          } else if (t === T.STAIR || t === T.SHAFT) {
            g.lo[n] = 0;
            const ut = up ? up.type[n] : T.OUT;
            const dt = down ? down.type[n] : T.OUT;
            if (ut === T.STAIR || ut === T.SHAFT) g.hi[n] = 4;
            else {
              g.hi[n] = up ? 4 : 3;
              g.flag[n] |= F.HASCEIL;
            }
            if (!(dt === T.STAIR || dt === T.SHAFT)) g.flag[n] |= F.HASFLOOR;
          }
        }
    }
  }

  // ---------- spatial queries used by player/physics ----------
  addCollider(x0, y0, z0, x1, y1, z1, tag) {
    const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), tag };
    this.colliders.push(c);
    return c;
  }

  buildSpatialIndex() {
    this.bucket = new Map();
    const B = 2;
    for (const c of this.colliders) {
      for (let bz = Math.floor(c.z0 / B); bz <= Math.floor(c.z1 / B); bz++)
        for (let bx = Math.floor(c.x0 / B); bx <= Math.floor(c.x1 / B); bx++) {
          const key = bx * 1000 + bz;
          let l = this.bucket.get(key);
          if (!l) this.bucket.set(key, (l = []));
          l.push(c);
        }
    }
    this.surfBucket = new Map();
    const addS = (s) => {
      for (let bz = Math.floor(s.z0 / B); bz <= Math.floor(s.z1 / B); bz++)
        for (let bx = Math.floor(s.x0 / B); bx <= Math.floor(s.x1 / B); bx++) {
          const key = bx * 1000 + bz;
          let l = this.surfBucket.get(key);
          if (!l) this.surfBucket.set(key, (l = []));
          l.push(s);
        }
    };
    for (const p of this.platforms) addS(p);
    for (const r of this.ramps) addS(r);
    for (const c of this.colliders) if (c.walkable) addS({ x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, y: c.y1, zone: c.zone });
  }

  collidersNear(x, z, out) {
    out.length = 0;
    const l = this.bucket.get(Math.floor(x / 2) * 1000 + Math.floor(z / 2));
    if (l) for (const c of l) out.push(c);
    return out;
  }

  // Highest walkable surface at (x,z) not above maxY.
  groundAt(x, z, maxY) {
    let best = -1e9;
    let surf = null;
    const i = ci(x), j = cj(z);
    for (const k of FLOORS) {
      const g = this.grid(k);
      if (!g.inside(i, j)) continue;
      const n = j * GW + i;
      const t = g.type[n];
      let has = t === T.FLOOR || t === T.DOOR;
      if ((t === T.STAIR || t === T.SHAFT) && g.flag[n] & F.HASFLOOR) has = true;
      if (has) {
        const y = g.base + g.lo[n];
        if (y <= maxY && y > best) {
          best = y;
          surf = null;
        }
      }
    }
    const l = this.surfBucket.get(Math.floor(x / 2) * 1000 + Math.floor(z / 2));
    if (l)
      for (const s of l) {
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        let y;
        if (s.ramp) {
          const t = (z - s.z0) / (s.z1 - s.z0);
          y = s.ya + (s.yb - s.ya) * t;
        } else y = s.y;
        if (y <= maxY && y > best) {
          best = y;
          surf = s;
        }
      }
    this._lastSurf = surf;
    return best;
  }

  floorAt(y) {
    return Math.max(-1, Math.min(1, Math.floor((y + 1.0) / 4)));
  }

  roomAtPos(x, y, z) {
    const k = this.floorAt(y);
    const g = this.grid(k);
    const r = g.roomAt(ci(x), cj(z));
    return r >= 0 ? this.rooms[r] : null;
  }
}
