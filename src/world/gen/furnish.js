// Room furnishing engine. Works in a Frame's local coordinates on a rectangular room (inner air cells).
//
// The furnisher keeps the room walkable: cells in front of doors / openings and in front of every container
// stay clear, and after each placement a flood fill verifies all those cells are still connected (otherwise the
// placement is undone). Furniture is placed against walls facing into the room.
import { B, BLOCKS, SOLID, IS_DOOR } from '../blocks.js';

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // outward: north(-z), south(+z), west(-x), east(+x)
// facing into the room for each outward dir: wall at -z -> face +z (0); +z -> 2; -x -> 3; +x -> 1
const INWARD_F = [0, 2, 3, 1];
const F_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];

export class Room {
  /**
   * @param fr Frame  @param r {x0,z0,x1,z1,y}  (y = floor block y; furniture goes at y+1)
   */
  constructor(fr, r, rng, opts = {}) {
    this.fr = fr; this.rng = rng;
    this.x0 = Math.min(r.x0, r.x1); this.x1 = Math.max(r.x0, r.x1);
    this.z0 = Math.min(r.z0, r.z1); this.z1 = Math.max(r.z0, r.z1);
    this.y = r.y; this.Y = r.y + 1;
    this.h = opts.height || 3; // air height
    this.W = this.x1 - this.x0 + 1; this.D = this.z1 - this.z0 + 1;
    this.state = new Uint8Array(this.W * this.D); // 0 free, 1 used, 2 keep clear, 3 blocked
    this.placed = [];
    this.containers = [];
    this.loot = opts.loot || null; // override map blockName -> table
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) {
      const id = fr.get(x, this.Y, z);
      const fl = fr.get(x, this.y, z);
      if (id !== 0 || !SOLID[fl] || BLOCKS[fl].name.startsWith('stairs')) this.state[this.i(x, z)] = 3;
    }
    // cells next to holes in the floor / stair tops stay clear too
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) {
      const fl = fr.get(x, this.y, z);
      if (!SOLID[fl] || BLOCKS[fl].name.startsWith('stairs')) for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) this.keep(x + dx, z + dz);
    }
    // keep clear: in front of openings / doors and around stairs or ladders
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        const inside = this.inside(nx, nz);
        const nid = fr.get(nx, this.Y, nz);
        const def = BLOCKS[nid];
        if (!inside) {
          if (IS_DOOR[nid] || fr.isOpening(nx, this.Y, nz) || (nid === 0 && fr.get(nx, this.Y + 1, nz) === 0)) this.keep(x, z);
        } else if (def.name.startsWith('stairs') || def.climbable) this.keep(x, z);
      }
    }
  }
  i(x, z) { return (z - this.z0) * this.W + (x - this.x0); }
  inside(x, z) { return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1; }
  st(x, z) { return this.inside(x, z) ? this.state[this.i(x, z)] : 3; }
  keep(x, z) { if (this.inside(x, z) && this.state[this.i(x, z)] === 0) this.state[this.i(x, z)] = 2; }
  isFree(x, z) { return this.st(x, z) === 0; }
  area() { return this.W * this.D; }

  /** wall slots: perimeter cells with a solid wall outside. returns [{x,z,f,side}] */
  slots(filterFree = true) {
    const out = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) {
      if (filterFree && !this.isFree(x, z)) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        if (this.inside(nx, nz)) continue;
        const id = this.fr.get(nx, this.Y, nz);
        if (!SOLID[id] || IS_DOOR[id]) continue;
        if (this.fr.isOpening(nx, this.Y, nz)) continue;
        out.push({ x, z, f: INWARD_F[d], side: d });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ primitive placement with undo
  _begin() { this._tx = []; }
  _put(x, y, z, block, f = 0, loot = undefined, opts = undefined) {
    const id = typeof block === 'string' ? B[block] : block;
    this.fr.clear(x, y, z, 0);
    const name = BLOCKS[id].name;
    const table = loot !== undefined ? loot : (this.loot && this.loot[name]) || null;
    if (BLOCKS[id].container && (table || opts)) this.fr.container(x, y, z, name, f, table, opts || {});
    else this.fr.place(x, y, z, id, f);
    this._tx.push([x, y, z]);
  }
  _mark(x, z, v) { if (this.inside(x, z) && (this.state[this.i(x, z)] !== 3 || v === 0)) this.state[this.i(x, z)] = v; }
  _commit(prev) {
    if (this._connected()) { this.placed.push(...this._tx); return true; }
    this._abort(prev);
    return false;
  }
  /** every keep-clear cell reachable from the first keep-clear cell through free / keep cells */
  _connected() {
    let start = -1, need = 0;
    for (let k = 0; k < this.state.length; k++) if (this.state[k] === 2) { need++; if (start < 0) start = k; }
    if (start < 0) return true;
    const seen = new Uint8Array(this.state.length);
    const q = [start]; seen[start] = 1; let got = 0;
    while (q.length) {
      const k = q.pop();
      if (this.state[k] === 2) got++;
      const x = k % this.W, z = (k - x) / this.W;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.W || nz >= this.D) continue;
        const nk = nz * this.W + nx;
        if (seen[nk]) continue;
        const s = this.state[nk];
        if (s === 0 || s === 2) { seen[nk] = 1; q.push(nk); }
      }
    }
    return got === need;
  }

  /**
   * Place a list of cells atomically: items [{x, z, block, f, top?, topBlock?, loot?, opts?, access?}]
   * access: front cell that must stay clear.
   */
  tryPlace(items) {
    for (const it of items) if (!this.isFree(it.x, it.z)) return false;
    this._begin();
    const prev = [];
    const setS = (x, z, v) => { if (this.inside(x, z)) { prev.push([x, z, this.state[this.i(x, z)]]); this.state[this.i(x, z)] = v; } };
    for (const it of items) {
      this._put(it.x, this.Y + (it.dy || 0), it.z, it.block, it.f || 0, it.loot, it.opts);
      if (it.top && this.h >= 3) this._put(it.x, this.Y + 1, it.z, it.top, it.f || 0, it.topLoot, it.topOpts);
      setS(it.x, it.z, 1);
    }
    for (const it of items) {
      if (it.access) {
        const [dx, dz] = F_DIR[it.f & 3];
        const ax = it.x + dx, az = it.z + dz;
        if (!this.inside(ax, az)) continue;
        const s = this.state[this.i(ax, az)];
        if (s === 1 || s === 3) { this._abort(prev); return false; }
        if (s === 0) setS(ax, az, 2);
      }
    }
    if (!this._commit(prev)) return false;
    return true;
  }
  _abort(prev) {
    for (const [x, y, z] of this._tx) this.fr.clear(x, y, z, 0);
    for (const [x, z, p] of prev) this.state[this.i(x, z)] = p;
  }

  // ------------------------------------------------------------------ furniture helpers
  /** single block against a wall. opts: {top, corner, loot, opts, access=true for containers} */
  wall(block, o = {}) {
    let slots = this.slots();
    if (o.side !== undefined) slots = slots.filter((s) => s.side === o.side);
    if (o.corner) {
      const c = slots.filter((s) => this._isCorner(s.x, s.z));
      if (c.length) slots = c;
    }
    this.rng.shuffle(slots);
    const isC = !!BLOCKS[B[block]].container;
    for (const s of slots.slice(0, 12)) {
      if (this.tryPlace([{ x: s.x, z: s.z, block, f: s.f, top: o.top, topLoot: o.topLoot, loot: o.loot, opts: o.opts, access: o.access ?? (isC || o.top) }])) return s;
    }
    return null;
  }
  _isCorner(x, z) {
    let n = 0;
    if (x === this.x0) n++; if (x === this.x1) n++; if (z === this.z0) n++; if (z === this.z1) n++;
    return n >= 2;
  }
  /** contiguous run of blocks along a wall (sequence of {block, top?, loot?}) */
  run(seq, o = {}) {
    const slots = this.slots();
    const byKey = new Map(slots.map((s) => [s.x + ',' + s.z + ',' + s.side, s]));
    const starts = this.rng.shuffle(slots.filter((s) => o.side === undefined || s.side === o.side));
    for (const s of starts) {
      // run direction along the wall: for north/south walls along x, else along z
      const [ax, az] = s.side <= 1 ? [1, 0] : [0, 1];
      for (const sg of [1, -1]) {
        const items = [];
        let ok = true;
        for (let k = 0; k < seq.length; k++) {
          const x = s.x + ax * sg * k, z = s.z + az * sg * k;
          const sl = byKey.get(x + ',' + z + ',' + s.side);
          if (!sl) { ok = false; break; }
          const e = typeof seq[k] === 'string' ? { block: seq[k] } : seq[k];
          items.push({ x, z, f: s.f, block: e.block, top: e.top, loot: e.loot, opts: e.opts, access: true });
        }
        if (ok && this.tryPlace(items)) return items;
      }
    }
    return null;
  }
  /** bed (head against a wall). double = 2 wide */
  bed(double = false, block = null) {
    const slots = this.rng.shuffle(this.slots());
    for (const s of slots) {
      const [dx, dz] = F_DIR[s.f];
      const items = [
        { x: s.x, z: s.z, block: block || 'bed_head', f: s.f },
        { x: s.x + dx, z: s.z + dz, block: block || 'bed_foot', f: s.f },
      ];
      if (block) items.pop();
      if (double) {
        const [lx, lz] = s.side <= 1 ? [1, 0] : [0, 1];
        const sg = this.rng.chance(0.5) ? 1 : -1;
        items.push({ x: s.x + lx * sg, z: s.z + lz * sg, block: 'bed_head', f: s.f });
        items.push({ x: s.x + lx * sg + dx, z: s.z + lz * sg + dz, block: 'bed_foot', f: s.f });
      }
      if (this.tryPlace(items)) return s;
    }
    return null;
  }
  /** free-standing table (w x d) with chairs around it */
  tableSet(w = 1, d = 1, chairs = 4, o = {}) {
    const cands = [];
    for (let z = this.z0 + 1; z + d - 1 <= this.z1 - 1; z++) for (let x = this.x0 + 1; x + w - 1 <= this.x1 - 1; x++) cands.push([x, z]);
    this.rng.shuffle(cands);
    for (const [x, z] of cands.slice(0, 20)) {
      const items = [];
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) items.push({ x: x + i, z: z + j, block: o.block || 'table' });
      const ring = [];
      for (let i = 0; i < w; i++) { ring.push([x + i, z - 1, 0]); ring.push([x + i, z + d, 2]); }
      for (let j = 0; j < d; j++) { ring.push([x - 1, z + j, 3]); ring.push([x + w, z + j, 1]); }
      this.rng.shuffle(ring);
      let n = 0;
      for (const [cx, cz, f] of ring) {
        if (n >= chairs) break;
        if (!this.isFree(cx, cz)) continue;
        items.push({ x: cx, z: cz, block: o.chair || 'chair', f });
        n++;
      }
      if (n < Math.min(chairs, 1)) continue;
      if (this.tryPlace(items)) return { x, z, w, d };
    }
    return null;
  }
  /** something free-standing in the interior (not touching walls) */
  center(block, f = 0, o = {}) {
    const cands = [];
    for (let z = this.z0 + 1; z <= this.z1 - 1; z++) for (let x = this.x0 + 1; x <= this.x1 - 1; x++) if (this.isFree(x, z)) cands.push([x, z]);
    this.rng.shuffle(cands);
    for (const [x, z] of cands.slice(0, 10)) if (this.tryPlace([{ x, z, block, f, loot: o.loot, opts: o.opts }])) return [x, z];
    return null;
  }
  /** anywhere free (incl. along walls) */
  anywhere(block, f = 0, o = {}) {
    const cands = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) if (this.isFree(x, z)) cands.push([x, z]);
    this.rng.shuffle(cands);
    for (const [x, z] of cands.slice(0, 10)) if (this.tryPlace([{ x, z, block, f, loot: o.loot, opts: o.opts }])) return [x, z];
    return null;
  }
  /** couch (n wide) against a wall + tv on a table facing it + optional coffee table */
  livingSet(n = 2, couch = 'couch') {
    const slots = this.rng.shuffle(this.slots());
    const byKey = new Set(slots.map((s) => s.x + ',' + s.z + ',' + s.side));
    for (const s of slots) {
      const [ax, az] = s.side <= 1 ? [1, 0] : [0, 1];
      const [dx, dz] = F_DIR[s.f];
      let ok = true;
      const items = [];
      for (let k = 0; k < n; k++) {
        const x = s.x + ax * k, z = s.z + az * k;
        if (!byKey.has(x + ',' + z + ',' + s.side)) { ok = false; break; }
        items.push({ x, z, block: couch, f: s.f });
      }
      if (!ok) continue;
      // tv 3-4 cells in front, centred
      const mid = Math.floor((n - 1) / 2);
      let tvd = 0;
      for (const dist of [4, 3, 5]) {
        const tx = s.x + ax * mid + dx * dist, tz = s.z + az * mid + dz * dist;
        if (this.isFree(tx, tz) && this.inside(tx, tz)) { tvd = dist; break; }
      }
      if (tvd) {
        const tx = s.x + ax * mid + dx * tvd, tz = s.z + az * mid + dz * tvd;
        items.push({ x: tx, z: tz, block: 'table', top: 'tv', f: (s.f + 2) & 3 });
        // coffee table
        if (tvd >= 3) items.push({ x: s.x + ax * mid + dx, z: s.z + az * mid + dz, block: 'slab_wood' });
      }
      if (this.tryPlace(items)) return { s, tvd };
    }
    return null;
  }
  /** desk + chair (chair in front facing the desk) */
  deskSet(desk = 'desk', o = {}) {
    const slots = this.rng.shuffle(this.slots());
    for (const s of slots) {
      const [dx, dz] = F_DIR[s.f];
      const items = [{ x: s.x, z: s.z, block: desk, f: s.f, loot: o.loot, opts: o.opts }, { x: s.x + dx, z: s.z + dz, block: 'chair', f: (s.f + 2) & 3 }];
      if (this.tryPlace(items)) return s;
    }
    return null;
  }
  /** wall-mounted thing at Y+dy above an existing slot item (e.g. medicine cabinet above a sink) */
  mountAbove(s, block, dy = 1) {
    if (!s) return;
    if (this.fr.get(s.x, this.Y + dy, s.z) !== 0) return;
    this.fr.place(s.x, this.Y + dy, s.z, block, s.f);
  }
  /** floor loot on random free cells */
  floorLoot(table, n = 1, chance = 0.6) {
    const cands = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) if (this.st(x, z) === 0 || this.st(x, z) === 2) cands.push([x, z]);
    this.rng.shuffle(cands);
    for (const [x, z] of cands.slice(0, n)) { this.fr.loot(x, this.Y, z, table, chance); this.keep(x, z); }
  }
  /** loot on top of a table cell if one exists */
  tableLoot(table, chance = 0.7) {
    for (const [x, y, z] of this.placed) {
      if (y === this.Y && this.fr.get(x, y, z) === B.table && this.fr.get(x, y + 1, z) === 0) {
        this.fr.loot(x, y + 1, z, table, chance);
        return true;
      }
    }
    return false;
  }
  freeCells() {
    const out = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) if (this.st(x, z) === 0 || this.st(x, z) === 2) out.push([x, z]);
    return out;
  }
  keepCells() {
    const out = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) if (this.st(x, z) === 2) out.push([x, z]);
    return out;
  }
  randomFree() { const c = this.freeCells(); return c.length ? this.rng.pick(c) : null; }
  /** free cell that may be filled with a block without blocking paths (state 0 + connectivity kept) */
  randomFreeStrict() {
    const c = [];
    for (let z = this.z0; z <= this.z1; z++) for (let x = this.x0; x <= this.x1; x++) if (this.st(x, z) === 0) c.push([x, z]);
    return c.length ? this.rng.pick(c) : null;
  }
}

// ---------------------------------------------------------------------------- room templates
/**
 * Furnish a room by type. opts: {loot: {blockName: table}, condition: 'normal'|'ransacked'|...}
 * Returns the Room (for further use).
 */
export function furnish(fr, rect, type, rng, opts = {}) {
  const room = new Room(fr, rect, rng, opts);
  fr.ctx.label(fr, rect, type);
  const ransacked = opts.condition === 'ransacked';
  const skip = (p) => ransacked && rng.chance(p);
  const big = room.area();
  switch (type) {
    case 'kitchen': {
      const L = Math.max(room.W, room.D);
      const seq = [{ block: 'fridge', top: rng.chance(0.7) ? 'freezer' : null }];
      const rest = ['kitchen_cabinet', 'stove', 'kitchen_cabinet', 'kitchen_sink', 'kitchen_cabinet', 'kitchen_cabinet'];
      if (rng.chance(0.5)) rest.reverse();
      const n = Math.min(L - 1, 5 + rng.int(0, 1));
      for (let i = 0; i < n - 1 && i < rest.length; i++) seq.push(rest[i]);
      if (!seq.some((e) => e === 'stove' || e.block === 'stove')) seq.push('stove');
      if (!seq.some((e) => e === 'kitchen_sink')) seq.push('kitchen_sink');
      if (rng.chance(0.5)) seq.reverse();
      let ok = room.run(seq);
      if (!ok) { room.wall('fridge', { top: 'freezer' }); room.wall('stove'); room.wall('kitchen_sink'); room.wall('kitchen_cabinet'); }
      if (big >= 20 && rng.chance(0.6)) room.run(['kitchen_cabinet', 'kitchen_cabinet', 'kitchen_cabinet'].slice(0, rng.int(2, 3)));
      if (opts.table !== false && big >= 16) room.tableSet(rng.chance(0.4) && big > 24 ? 2 : 1, 1, rng.int(2, 4));
      if (rng.chance(0.5)) room.wall('trash_can', { access: false });
      if (!skip(0.5)) room.tableLoot('floor_house', 0.6);
      break;
    }
    case 'dining': {
      room.tableSet(room.W >= 5 || room.D >= 5 ? 2 : 1, 1, rng.int(3, 6));
      if (rng.chance(0.6)) room.wall(rng.pick(['dresser', 'bookshelf']));
      room.tableLoot('floor_house', 0.5);
      break;
    }
    case 'living': {
      // area rug in the middle of wooden floors
      if (room.W >= 4 && room.D >= 4 && fr.get(room.x0 + 1, room.y, room.z0 + 1) === B.floor_wood) {
        const rug = rng.pick([B.carpet_red, B.carpet_beige, B.carpet_blue]);
        for (let x = room.x0 + 1; x <= room.x1 - 1; x++) for (let z = room.z0 + 1; z <= room.z1 - 1; z++) fr.set(x, room.y, z, rug);
      }
      room.livingSet(Math.min(3, Math.max(2, Math.floor(Math.max(room.W, room.D) / 2))), rng.pick(['couch', 'couch', 'couch_blue']));
      if (rng.chance(0.8)) room.wall('bookshelf');
      if (big > 20 && rng.chance(0.5)) room.wall('bookshelf');
      if (rng.chance(0.4)) room.wall(rng.pick(['couch', 'couch_blue']));
      if (rng.chance(0.25)) room.wall('table', { top: 'radio', access: false });
      if (rng.chance(0.3)) room.wall('dresser');
      room.floorLoot('floor_house', 1, 0.5);
      break;
    }
    case 'bedroom': case 'master': case 'kids': {
      const dbl = type === 'master' || (type === 'bedroom' && room.W >= 4 && room.D >= 4 && rng.chance(0.6));
      const bs = room.bed(dbl) || room.bed(false);
      // nightstand next to the head of the bed
      if (bs && rng.chance(0.6)) {
        const [lx, lz] = bs.side <= 1 ? [1, 0] : [0, 1];
        for (const sg of [1, -1, 2, -2]) { if (room.tryPlace([{ x: bs.x + lx * sg, z: bs.z + lz * sg, block: 'dresser', f: bs.f, access: true }])) break; }
      }
      if (!skip(0.4)) room.wall('wardrobe', { corner: true });
      if (!skip(0.4)) room.wall('dresser');
      if (type === 'kids' || rng.chance(0.3)) room.deskSet('desk');
      if (rng.chance(0.3)) room.wall('bookshelf');
      if (type === 'master' && rng.chance(0.5)) room.wall('dresser');
      if (rng.chance(0.15)) room.wall('table', { top: 'tv', access: false });
      room.floorLoot('floor_house', 1, 0.45);
      break;
    }
    case 'bathroom': {
      room.wall('toilet', { corner: rng.chance(0.5) });
      if (big >= 6) room.run(['bathtub', 'bathtub']) || room.wall('bathtub');
      const s = room.wall('kitchen_sink');
      if (s && !skip(0.5)) room.mountAbove(s, 'medicine_cabinet');
      if (big >= 9 && rng.chance(0.3)) room.wall('washing_machine');
      break;
    }
    case 'halfbath': {
      room.wall('toilet');
      const s = room.wall('kitchen_sink');
      if (s) room.mountAbove(s, 'medicine_cabinet');
      break;
    }
    case 'office': {
      room.deskSet('desk', opts.deskLoot ? { loot: opts.deskLoot, opts: opts.deskOpts } : {});
      room.wall('filing_cabinet');
      if (rng.chance(0.7)) room.wall('bookshelf');
      if (big >= 12 && rng.chance(0.5)) room.wall('bookshelf');
      if (rng.chance(0.4)) room.wall('safe');
      room.floorLoot('floor_office', 1, 0.5);
      break;
    }
    case 'laundry': {
      room.run(['washing_machine', 'washing_machine']) || room.wall('washing_machine');
      room.wall('metal_shelf');
      if (rng.chance(0.5)) room.wall('kitchen_sink');
      break;
    }
    case 'garage': {
      const s = room.wall('workbench', { access: true });
      if (s) room.mountAbove(s, 'toolbox', 1);
      room.wall('metal_shelf');
      if (big > 30) room.wall('metal_shelf');
      if (rng.chance(0.6)) room.wall('cardboard_box', { access: false });
      if (rng.chance(0.4)) room.wall('barrel_rust');
      if (rng.chance(0.3)) room.wall('toolbox', { access: false });
      room.floorLoot('floor_house', 1, 0.4);
      break;
    }
    case 'hall': {
      if (room.W >= 3 && room.D >= 3 && rng.chance(0.4)) room.wall(rng.pick(['bookshelf', 'dresser']));
      break;
    }
    case 'closet': case 'storage': {
      room.wall('metal_shelf');
      room.wall('cardboard_box', { access: false });
      if (rng.chance(0.5)) room.wall('cardboard_box', { access: false });
      break;
    }
    case 'den': {
      room.livingSet(2, 'couch_blue');
      room.wall('bookshelf');
      if (rng.chance(0.5)) room.wall('gun_cabinet');
      room.deskSet('desk');
      break;
    }
    default: break;
  }
  return room;
}
