// Compiles the layout into simulation data: rooms, wall runs (for rendering), colliders,
// doors, fences, furniture instances, activity spots, zones and the navigation grid.
// Pure logic: no rendering here, so it runs in Node tests too.
import { ROOMS, CELLS, SOLITARY_CELLS, OPENINGS, FENCES, FURNITURE, BUILDING, WORLD_BOUNDS, CELL_H } from './layout.js';
import { FURNITURE_TYPES, furnitureToWorld, furnitureYaw } from './furniture.js';
import { ColliderSet } from './colliders.js';
import { NavGrid } from './navgrid.js';
import { Door } from './doors.js';

const U = 0.25;                       // edge resolution
export const WALL_T = 0.3, BARS_T = 0.14;
const INFLATE = 0.3;                  // nav clearance

const snap = (v) => Math.round(v / U);

export class WorldData {
  constructor() {
    this.bounds = WORLD_BOUNDS;
    this.building = BUILDING;
    this.rooms = [];
    this.roomById = new Map();
    this.colliders = new ColliderSet(WORLD_BOUNDS, 4);
    this.nav = new NavGrid(WORLD_BOUNDS, 0.5);
    this.walls = [];
    this.doors = [];
    this.doorById = new Map();
    this.fences = [];
    this.furniture = [];
    this.spots = [];
    this.spotsByRoom = new Map();
    this.cells = [];
    this._build();
  }

  _build() {
    this._makeRooms();
    this._makeZoneGrid();
    const edges = this._makeEdges();
    this._makeWallRuns(edges);
    this._makeDoors();
    this._makeFences();
    this._makeFurniture();
    this.nav.doors = this.doors;
    this.nav.computeClearanceCosts();
    this._makeSpots();
  }

  _makeRooms() {
    const add = (r) => { r.index = this.rooms.length; this.rooms.push(r); this.roomById.set(r.id, r); };
    for (const r of ROOMS) add({ ...r, indoor: r.ceil != null, cell: false });
    for (const c of CELLS) {
      const block = this.roomById.get(c.block === 'A' ? 'blockA' : 'blockB');
      add({ id: c.id, name: `Cell ${c.id}`, rect: c.rect, floor: 'concrete', wall: 'cell', ceil: CELL_H, indoor: true, cell: true, front: c.front, parent: block.id, block: c.block });
    }
    for (const c of SOLITARY_CELLS) add({ id: c.id, name: `Solitary ${c.id}`, rect: c.rect, floor: 'concreteDark', wall: 'grim', ceil: CELL_H, indoor: true, cell: true, solitary: true, front: c.front, parent: 'solitary', restricted: 'solitaryCell' });
    this.cells = this.rooms.filter((r) => r.cell && !r.solitary);
  }

  _makeZoneGrid() {
    const nav = this.nav;
    const order = [...this.rooms].sort((a, b) => (a.under ? 0 : a.cell ? 2 : 1) - (b.under ? 0 : b.cell ? 2 : 1));
    for (const r of order) {
      const [x0, z0, x1, z1] = r.rect;
      for (let cz = nav.cellZ(z0); cz <= nav.cellZ(z1 - 0.01); cz++) for (let cx = nav.cellX(x0); cx <= nav.cellX(x1 - 0.01); cx++) {
        if (!nav.inside(cx, cz)) continue;
        const x = nav.centerX(cx), z = nav.centerZ(cz);
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) nav.zone[nav.idx(cx, cz)] = r.index;
      }
    }
  }

  roomAt(x, z) {
    const i = this.nav.zoneAt(x, z);
    if (i >= 0) return this.rooms[i];
    // Precise fallback for points off the nav grid
    for (const r of this.rooms) { const [x0, z0, x1, z1] = r.rect; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r; }
    return null;
  }
  /** Room containing the point using exact rectangles (cells > rooms > outdoor). */
  roomAtExact(x, z) {
    let best = null, rank = -1;
    for (const r of this.rooms) {
      const [x0, z0, x1, z1] = r.rect;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const rk = r.under ? 0 : r.cell ? 2 : 1;
      if (rk > rank) { rank = rk; best = r; }
    }
    return best;
  }
  ceilingAt(x, z) {
    const r = this.roomAtExact(x, z);
    return r && r.indoor ? r.ceil : null;
  }

  _makeEdges() {
    const edges = new Map(); // key -> {type, door}
    const setH = (i, j, v) => edges.set(`h,${i},${j}`, v);
    const setV = (i, j, v) => edges.set(`v,${i},${j}`, v);
    const rectEdges = (r, v) => {
      const [x0, z0, x1, z1] = r.rect.map(snap);
      for (let i = x0; i < x1; i++) { setH(i, z0, v); setH(i, z1, v); }
      for (let j = z0; j < z1; j++) { setV(x0, j, v); setV(x1, j, v); }
    };
    for (const r of this.rooms) if (r.indoor) rectEdges(r, { type: 'wall' });
    // Barred cell fronts with a sliding door in the middle.
    for (const r of this.rooms) {
      if (!r.cell) continue;
      const [x0, z0, x1, z1] = r.rect;
      const zLine = r.front === 'S' ? z1 : z0;
      const j = snap(zLine);
      for (let i = snap(x0); i < snap(x1); i++) setH(i, j, { type: 'bars' });
      const w = x1 - x0, dw = r.solitary ? 1.5 : 1.5;
      const a = x0 + (w - dw) / 2, b = a + dw;
      const id = `d_cell_${r.id}`;
      for (let i = snap(a); i < snap(b); i++) setH(i, j, { type: 'door', door: id });
      r.doorId = id;
      this._pendingDoors = this._pendingDoors || [];
      this._pendingDoors.push({ id, style: 'cell', access: r.solitary ? 'solitary' : 'cell', orient: 'h', line: zLine, from: a, to: b, cell: r.id });
    }
    for (const o of OPENINGS) {
      const [ax, az] = o.a, [bx, bz] = o.b;
      const v = o.kind === 'door' ? { type: 'door', door: o.door.id } : null;
      if (az === bz) { for (let i = snap(Math.min(ax, bx)); i < snap(Math.max(ax, bx)); i++) v ? setH(i, snap(az), v) : edges.delete(`h,${i},${snap(az)}`); }
      else { for (let j = snap(Math.min(az, bz)); j < snap(Math.max(az, bz)); j++) v ? setV(snap(ax), j, v) : edges.delete(`v,${snap(ax)},${j}`); }
      if (o.kind === 'door') {
        this._pendingDoors = this._pendingDoors || [];
        const orient = az === bz ? 'h' : 'v';
        this._pendingDoors.push({ ...o.door, orient, line: orient === 'h' ? az : ax, from: orient === 'h' ? Math.min(ax, bx) : Math.min(az, bz), to: orient === 'h' ? Math.max(ax, bx) : Math.max(az, bz) });
      }
    }
    return edges;
  }

  /** Effective ceiling for wall heights (cells extend to their block's ceiling). */
  _ceilFor(room) {
    if (!room) return null;
    if (!room.indoor) return null;
    if (room.cell && room.parent) return Math.max(room.ceil, this.roomById.get(room.parent).ceil);
    return room.ceil;
  }

  _makeWallRuns(edges) {
    const runs = [];
    const sideRooms = (orient, line, mid) => {
      const e = 0.12;
      return orient === 'h'
        ? [this.roomAtExact(mid, line - e), this.roomAtExact(mid, line + e)]
        : [this.roomAtExact(line - e, mid), this.roomAtExact(line + e, mid)];
    };
    for (const orient of ['h', 'v']) {
      const byLine = new Map();
      for (const [key, v] of edges) {
        const [o, a, b] = key.split(',');
        if (o !== orient || !v || v.type === 'door') continue;
        const line = orient === 'h' ? +b : +a, pos = orient === 'h' ? +a : +b;
        if (!byLine.has(line)) byLine.set(line, []);
        byLine.get(line).push({ pos, type: v.type });
      }
      for (const [lineU, list] of byLine) {
        list.sort((p, q) => p.pos - q.pos);
        let cur = null;
        for (const e of list) {
          const line = lineU * U, mid = (e.pos + 0.5) * U;
          const [ra, rb] = sideRooms(orient, line, mid);
          const sig = `${e.type}|${ra ? ra.id : '-'}|${rb ? rb.id : '-'}`;
          if (cur && cur.sig === sig && cur.toU === e.pos) { cur.toU = e.pos + 1; continue; }
          if (cur) runs.push(cur);
          cur = { sig, orient, line, fromU: e.pos, toU: e.pos + 1, type: e.type, sideA: ra, sideB: rb };
        }
        if (cur) runs.push(cur);
      }
    }
    for (const r of runs) {
      r.from = r.fromU * U; r.to = r.toU * U;
      const ca = this._ceilFor(r.sideA), cb = this._ceilFor(r.sideB);
      const exterior = !r.sideA || !r.sideB || !r.sideA.indoor || !r.sideB.indoor;
      r.exterior = exterior;
      if (r.type === 'bars') r.h = CELL_H;
      else r.h = exterior ? BUILDING.height : Math.max(ca || 0, cb || 0);
      const t = r.type === 'bars' ? BARS_T : WALL_T;
      const box = r.orient === 'h'
        ? { minX: r.from, maxX: r.to, minZ: r.line - t / 2, maxZ: r.line + t / 2 }
        : { minX: r.line - t / 2, maxX: r.line + t / 2, minZ: r.from, maxZ: r.to };
      r.collider = this.colliders.add({ ...box, minY: 0, maxY: r.h, kind: r.type, opaque: r.type === 'wall', blocksCamera: true });
      this.nav.markRect(box.minX, box.minZ, box.maxX, box.maxZ, INFLATE, (i) => { this.nav.blocked[i] = 1; });
      if (r.type === 'wall') this.nav.markRect(box.minX, box.minZ, box.maxX, box.maxZ, 0.05, (i) => { this.nav.opaque[i] = 1; });
      delete r.sig; delete r.fromU; delete r.toU;
      this.walls.push(r);
    }
  }

  _makeDoors() {
    for (const d of this._pendingDoors || []) {
      const door = new Door(d, this.doors.length);
      const t = door.style === 'cell' || door.style === 'gate' ? BARS_T : 0.12;
      const box = d.orient === 'h'
        ? { minX: d.from, maxX: d.to, minZ: d.line - t / 2 - 0.02, maxZ: d.line + t / 2 + 0.02 }
        : { minX: d.line - t / 2 - 0.02, maxX: d.line + t / 2 + 0.02, minZ: d.from, maxZ: d.to };
      door.rect = box;
      door.collider = this.colliders.add({ ...box, minY: 0, maxY: 2.6, kind: 'door', opaque: false, ref: door, blocksCamera: door.style !== 'cell' && door.style !== 'gate' });
      // Mark cells in the opening (expanded across the thickness) as door cells.
      const across = 0.45;
      const r = d.orient === 'h'
        ? [d.from + 0.05, d.line - across, d.to - 0.05, d.line + across]
        : [d.line - across, d.from + 0.05, d.line + across, d.to - 0.05];
      this.nav.markRect(r[0], r[1], r[2], r[3], 0, (i) => { if (!this.nav.blocked[i]) this.nav.door[i] = door.index; });
      this.doors.push(door);
      this.doorById.set(door.id, door);
    }
    delete this._pendingDoors;
  }

  _makeFences() {
    for (const f of FENCES) {
      const [ax, az] = f.a, [bx, bz] = f.b;
      const orient = az === bz ? 'h' : 'v';
      const t = 0.12;
      const box = orient === 'h'
        ? { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: az - t / 2, maxZ: az + t / 2 }
        : { minX: ax - t / 2, maxX: ax + t / 2, minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
      const fence = { ...f, orient, box, h: 3.8, cutState: 0, id: f.cut || `fence${this.fences.length}` };
      fence.collider = this.colliders.add({ ...box, minY: 0, maxY: 3.8, kind: 'fence', opaque: false, blocksCamera: false, ref: fence });
      const cells = [];
      this.nav.markRect(box.minX, box.minZ, box.maxX, box.maxZ, INFLATE, (i) => { if (!this.nav.blocked[i]) cells.push(i); this.nav.blocked[i] = 1; });
      fence.navCells = cells;
      this.fences.push(fence);
    }
  }
  /** Cut a fence section (bolt cutters): removes collision and opens navigation. */
  cutFence(id) {
    const f = this.fences.find((x) => x.id === id);
    if (!f || f.cutState) return false;
    f.cutState = 1;
    f.collider.enabled = false;
    for (const i of f.navCells) this.nav.blocked[i] = 0;
    return true;
  }

  _makeFurniture() {
    for (const p of FURNITURE) {
      const def = FURNITURE_TYPES[p.type];
      if (!def) { console.warn('Unknown furniture', p.type); continue; }
      const f = { ...p, def, index: this.furniture.length, yaw: furnitureYaw(p) };
      const [w, d] = def.size || [1, 1];
      const odd = p.rot % 2 === 1;
      const hw = (odd ? d : w) / 2, hd = (odd ? w : d) / 2;
      f.aabb = { minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd };
      f.room = this.roomAtExact(p.x, p.z);
      f.colliders = [];
      const rects = def.colliders ? def.colliders.map(([a, b, c, e]) => {
        const p1 = furnitureToWorld(p, a, b), p2 = furnitureToWorld(p, c, e);
        return { minX: Math.min(p1[0], p2[0]), maxX: Math.max(p1[0], p2[0]), minZ: Math.min(p1[1], p2[1]), maxZ: Math.max(p1[1], p2[1]) };
      }) : def.collide === false ? [] : [f.aabb];
      for (const r of rects) {
        const c = this.colliders.add({ ...r, minY: 0, maxY: def.h || 1, kind: 'furniture', ref: f, opaque: false, blocksCamera: (def.h || 1) > 2.4 });
        f.colliders.push(c);
        this.nav.markRect(r.minX, r.minZ, r.maxX, r.maxZ, INFLATE, (i) => { this.nav.blocked[i] = 1; });
        if ((def.h || 0) >= 1.8) this.nav.markRect(r.minX, r.minZ, r.maxX, r.maxZ, 0, (i) => { this.nav.opaque[i] = 1; });
      }
      this.furniture.push(f);
    }
  }

  _makeSpots() {
    let n = 0;
    for (const f of this.furniture) {
      for (const [k, s] of (f.def.spots || []).entries()) {
        const [x, z] = furnitureToWorld(f, s.pos[0], s.pos[1]);
        let ax = x, az = z, ok = false;
        for (const a of s.approach || [s.pos]) {
          const [wx, wz] = furnitureToWorld(f, a[0], a[1]);
          if (this.nav.walkableAt(wx, wz)) { ax = wx; az = wz; ok = true; break; }
        }
        if (!ok) {
          const [wx, wz] = furnitureToWorld(f, (s.approach || [s.pos])[0][0], (s.approach || [s.pos])[0][1]);
          const near = this.nav.nearestWalkable(wx, wz, null, 4);
          if (near) { ax = near[0]; az = near[1]; }
        }
        const room = this.roomAtExact(x, z) || f.room;
        const spot = {
          id: `s${n++}`, key: `${f.index}:${k}`, furniture: f, type: f.type, activity: s.activity, pose: s.pose,
          x, z, y: s.y || 0, yaw: f.yaw + (s.yaw || 0), ax, az, room: room ? room.id : null,
          cell: f.cell || (room && room.cell ? room.id : null), job: s.job || null, staffOnly: !!s.staffOnly,
          bunk: s.bunk || null, snap: !!s.snap, tower: !!s.tower, occupant: null, reservedBy: null,
        };
        this.spots.push(spot);
        if (!this.spotsByRoom.has(spot.room)) this.spotsByRoom.set(spot.room, []);
        this.spotsByRoom.get(spot.room).push(spot);
      }
    }
  }

  spotsFor(activity, roomId = null) {
    return this.spots.filter((s) => s.activity === activity && (!roomId || s.room === roomId));
  }
  /** Random walkable point inside a room (rejection sampling on the nav grid). */
  randomPointIn(roomId, rng, agent = null, tries = 40) {
    const r = this.roomById.get(roomId);
    if (!r) return null;
    const [x0, z0, x1, z1] = r.rect;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(x0 + 0.6, x1 - 0.6), z = rng.range(z0 + 0.6, z1 - 0.6);
      if (this.nav.walkableAt(x, z, agent) && this.roomAt(x, z) === r) return [x, z];
    }
    return this.nav.nearestWalkable((x0 + x1) / 2, (z0 + z1) / 2, agent, 10);
  }
}
