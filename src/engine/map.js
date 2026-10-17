// MapRuntime — the live, queryable form of a map data module (TECH §5, §5.7a).
//
// Responsibilities: tile parsing (legend merge), wall autotiling (top / face_high / face_low +
// neighbour masks), automatic doors, prop instances (prop layer + objects + doors, conditional
// objects, persistent per-prop state), collision & opacity grids, rooms, anchors, exits, triggers,
// lights, past views, line of sight, pathfinding and the prerendered tile layers.
//
// Consumers (lighting, AI, audio, UI) must only use the documented interface; underscored members
// are internal.
import HW from './hw.js';
import { TILES, LEGEND } from '../data/tiles.js';
import { propDef } from '../data/props.js';
import { astar, reachable } from './pathfind.js';

export const TILE = 16;

const WK_NONE = 0;
const WK_TOP = 1;
const WK_HIGH = 2;
const WK_LOW = 3;
const WK_NAMES = [null, 'top', 'face_high', 'face_low'];

export const LOCKED_STATES = new Set(['locked', 'jammed', 'chained']);
const LIGHT_OFF_STATES = new Set(['off', 'dead', 'out']);
// Non-door props that stop blocking movement and sight when their state is 'open'.
const PASSABLE_WHEN_OPEN = new Set(['curtain']);
// Instance fields copied into prop params (art reads them from params for dynamic/variant props).
const PARAM_FIELDS = ['text', 'occupant', 'label', 'polaroids', 'tessFrame'];

export const isDoorProp = (p) => p.def.interact === 'door';

/**
 * Is a lock open? 'item:<id>' (holding it) | 'flag:<name>' (set) | (state) => bool where the
 * function returns TRUE WHILE LOCKED (CONTENT §1: gates are conditions with in-voice refusals).
 */
export function lockSatisfied(lock, state = HW.state) {
  if (!lock) return true;
  try {
    if (typeof lock === 'function') return !lock(state);
    if (typeof lock === 'string') {
      if (lock.startsWith('item:')) return (state.inv[lock.slice(5)] || 0) > 0;
      if (lock.startsWith('flag:')) return !!state.flags[lock.slice(5)];
    }
  } catch (e) {
    console.error('[map] lock evaluation failed', e);
  }
  return false;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function evalCond(cond, state, what) {
  if (!cond || !state) return true; // no state = structural use (prop index, previews)
  try {
    return !!cond(state);
  } catch (e) {
    console.error(`[map] cond failed for ${what}`, e);
    return false;
  }
}

const rectHas = (r, tx, ty) => tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3];

function makeLayer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export class MapRuntime {
  /**
   * @param data  map data module (src/data/maps/<id>.js default export)
   * @param state game state used for persistent prop state & conditions (default HW.state)
   */
  constructor(data, state = HW.state) {
    if (!data || !data.id) throw new Error('MapRuntime: map data needs an id');
    if (!Array.isArray(data.tiles) || !data.tiles.length) throw new Error(`map ${data.id}: missing tiles`);
    this.id = data.id;
    this.data = data;
    this.name = data.name || data.id;
    this.w = data.tiles[0].length;
    this.h = data.tiles.length;
    this.pw = this.w * TILE;
    this.ph = this.h * TILE;
    this._state = state;
    this._seed = hashStr(this.id);

    this._parseTiles();
    this._computeWallKinds();

    const n = this.w * this.h;
    this.solid = new Uint8Array(n);
    this.opaque = new Uint8Array(n);
    this._opaqueScratch = new Uint8Array(n);
    this.propGrid = new Int32Array(n); // index+1 into allProps of the solid prop covering a cell
    this.opaqueVersion = 0;
    this.lightsVersion = 0;
    this._lightDefs = null;

    this._buildProps();
    this._buildMeta();
    this._rebuildGrids(true);

    this._layers = { normal: null, clean: null };
    this._drawOpts = { kind: undefined, mask: 0, variant: 0, clean: false, t: 0 };
  }

  // ---------------------------------------------------------------------------------- tiles
  _parseTiles() {
    const { data, w, h } = this;
    const legend = { ...LEGEND, ...(data.legend || {}) };
    this.keyTable = [];
    const keyIndex = new Map();
    this.cells = new Uint16Array(w * h);
    this.tileSolid = new Uint8Array(w * h);
    this.tileOpaque = new Uint8Array(w * h);
    this.animatedCells = [];
    for (let y = 0; y < h; y++) {
      const row = data.tiles[y];
      if (typeof row !== 'string' || row.length !== w) {
        throw new Error(`map ${this.id}: row ${y} has length ${row?.length}, expected ${w}`);
      }
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        const key = legend[ch];
        if (!key) throw new Error(`map ${this.id}: unknown tile char '${ch}' at ${x},${y}`);
        const def = TILES[key];
        if (!def) throw new Error(`map ${this.id}: legend maps '${ch}' to unknown tile key '${key}'`);
        let k = keyIndex.get(key);
        if (k === undefined) { k = this.keyTable.length; this.keyTable.push(key); keyIndex.set(key, k); }
        const i = y * w + x;
        this.cells[i] = k;
        this.tileSolid[i] = def.solid ? 1 : 0;
        this.tileOpaque[i] = def.opaque ? 1 : 0;
        if (def.animated) this.animatedCells.push(i);
      }
    }
  }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  /** Tile key at a cell; 'void' outside the map. */
  tileAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return 'void';
    return this.keyTable[this.cells[ty * this.w + tx]];
  }

  tileDefAt(tx, ty) { return TILES[this.tileAt(tx, ty)]; }

  isWallCell(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const k = TILES[this.keyTable[this.cells[ty * this.w + tx]]].kind;
    return k === 'wall' || k === 'window';
  }

  isDoorCell(tx, ty) {
    return this.inBounds(tx, ty) && TILES[this.tileAt(tx, ty)].kind === 'door';
  }

  /** Open space a wall face can look onto: anything that is neither wall nor void. */
  _isOpenCell(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const key = this.tileAt(tx, ty);
    const k = TILES[key].kind;
    return k !== 'wall' && k !== 'window' && key !== 'void';
  }

  _computeWallKinds() {
    const { w, h } = this;
    this.wk = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) this.wk[y * w + x] = this._wallKindOf(x, y);
    }
  }

  _wallKindOf(x, y) {
    if (!this.isWallCell(x, y)) return WK_NONE;
    if (this._isOpenCell(x, y + 1)) return WK_LOW;
    if (this.isWallCell(x, y + 1) && this._isOpenCell(x, y + 2)) return WK_HIGH;
    return WK_TOP;
  }

  /** 'top' | 'face_high' | 'face_low' | null (not a wall). */
  wallKind(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    return WK_NAMES[this.wk[ty * this.w + tx]];
  }

  /** 4-bit wall-neighbour mask (N1 E2 S4 W8). */
  wallMask(tx, ty) {
    return (this.isWallCell(tx, ty - 1) ? 1 : 0) | (this.isWallCell(tx + 1, ty) ? 2 : 0)
      | (this.isWallCell(tx, ty + 1) ? 4 : 0) | (this.isWallCell(tx - 1, ty) ? 8 : 0);
  }

  /** Same-key neighbour mask (railings, pits, stage fronts). */
  sameMask(tx, ty) {
    const k = this.tileAt(tx, ty);
    return (this.tileAt(tx, ty - 1) === k ? 1 : 0) | (this.tileAt(tx + 1, ty) === k ? 2 : 0)
      | (this.tileAt(tx, ty + 1) === k ? 4 : 0) | (this.tileAt(tx - 1, ty) === k ? 8 : 0);
  }

  variantAt(tx, ty) {
    let h = Math.imul(tx + 7, 374761393) ^ Math.imul(ty + 13, 668265263) ^ this._seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) & 0xffff;
  }

  /** Footstep surface at a world point. */
  surfaceAt(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const def = this.tileDefAt(tx, ty);
    return def.surface || (def.kind === 'door' ? 'wood' : 'concrete');
  }

  /**
   * Replace a tile at runtime (collapses, scripted changes). Recomputes autotiling around the
   * cell, grids, and re-renders only the affected region of any built layers.
   */
  setTile(tx, ty, key) {
    if (!this.inBounds(tx, ty)) return;
    const def = TILES[key];
    if (!def) throw new Error(`setTile: unknown tile key ${key}`);
    let k = this.keyTable.indexOf(key);
    if (k < 0) { k = this.keyTable.length; this.keyTable.push(key); }
    const i = ty * this.w + tx;
    this.cells[i] = k;
    this.tileSolid[i] = def.solid ? 1 : 0;
    this.tileOpaque[i] = def.opaque ? 1 : 0;
    const x0 = Math.max(0, tx - 1);
    const x1 = Math.min(this.w - 1, tx + 1);
    const y0 = Math.max(0, ty - 3);
    const y1 = Math.min(this.h - 1, ty + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.wk[y * this.w + x] = this._wallKindOf(x, y);
    this.animatedCells = [];
    for (let j = 0; j < this.cells.length; j++) if (TILES[this.keyTable[this.cells[j]]].animated) this.animatedCells.push(j);
    this._rebuildGrids();
    for (const L of [this._layers.normal, this._layers.clean]) {
      if (!L) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          for (const c of [L.floorCtx, L.facesCtx, L.topsCtx]) c.clearRect(x * TILE, y * TILE, TILE, TILE);
          this._drawCell(L, x, y);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------- props
  _buildProps() {
    const { data } = this;
    const insts = new Map();
    const order = [];
    const add = (inst) => {
      if (insts.has(inst.id)) {
        Object.assign(insts.get(inst.id), inst);
      } else {
        insts.set(inst.id, inst);
        order.push(inst.id);
      }
    };

    // 1. Automatic doors from D runs.
    const doors = this._autoDoors();
    for (const d of doors) add(d);

    // 2. Prop layer (top-left footprint cell holds the char).
    if (data.propLayer) {
      const legend = data.propLegend || {};
      if (data.propLayer.length !== this.h) throw new Error(`map ${this.id}: propLayer has ${data.propLayer.length} rows, expected ${this.h}`);
      for (let y = 0; y < this.h; y++) {
        const row = data.propLayer[y];
        if (row.length !== this.w) throw new Error(`map ${this.id}: propLayer row ${y} length ${row.length}, expected ${this.w}`);
        for (let x = 0; x < this.w; x++) {
          const ch = row[x];
          if (ch === '.' || ch === ' ') continue;
          const type = legend[ch];
          if (!type) throw new Error(`map ${this.id}: unknown propLayer char '${ch}' at ${x},${y}`);
          propDef(type);
          add({ id: `${this.id}_${type}_${x}_${y}`, type, x, y });
        }
      }
    }

    // 3. Explicit objects. A door-type object whose footprint covers an auto door's bottom-left
    //    cell overrides that door (TECH §5.4).
    for (const o of data.objects || []) {
      if (!o || !o.type) throw new Error(`map ${this.id}: object without type`);
      const def = propDef(o.type);
      if (def.interact === 'door') {
        const door = doors.find((d) => d._kx >= o.x && d._kx < o.x + def.w && d._ky >= o.y && d._ky < o.y + def.h);
        if (door) {
          const { x, y, ...rest } = o; // keep the auto door's placement
          const oldId = door.id;
          Object.assign(door, rest);
          if (rest.id && rest.id !== oldId) {
            insts.delete(oldId);
            insts.set(rest.id, door);
            order[order.indexOf(oldId)] = rest.id;
          }
          continue;
        }
      }
      add({ ...o, id: o.id || `${this.id}_${o.type}_${o.x}_${o.y}` });
    }

    this.allProps = order.map((id) => this._makeProp(insts.get(id)));
    this.propById = new Map(this.allProps.map((p) => [p.id, p]));
    this.props = this.allProps.filter((p) => p.present && !p.pastOnly);
  }

  _autoDoors() {
    const { w, h } = this;
    this.lintel = new Uint8Array(w * h);
    const runs = [];
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (!this.isDoorCell(x, y)) continue;
        const y0 = y;
        while (y + 1 < h && this.isDoorCell(x, y + 1)) y++;
        runs.push({ x, y0, y1: y, used: false });
      }
    }
    const byBottom = new Map(runs.map((r) => [`${r.x},${r.y1}`, r]));
    const out = [];
    const overrides = this.data.doors || {};
    const make = (type, x, y, kx, ky) => {
      const key = `${kx},${ky}`;
      const inst = { id: `${this.id}_door_${kx}_${ky}`, type, x, y, auto: true, _kx: kx, _ky: ky };
      if (overrides[key]) Object.assign(inst, overrides[key]);
      return inst;
    };
    for (const r of runs) {
      if (r.used) continue;
      r.used = true;
      const len = r.y1 - r.y0 + 1;
      // A single D with walls above and below is a gap in a vertical (east/west) wall.
      if (len === 1 && this.isWallCell(r.x, r.y0 - 1) && this.isWallCell(r.x, r.y0 + 1)) {
        out.push(make('door_side', r.x, r.y0, r.x, r.y0));
        continue;
      }
      const partner = byBottom.get(`${r.x + 1},${r.y1}`);
      const isDouble = !!partner && !partner.used;
      if (isDouble) partner.used = true;
      const top = Math.max(r.y0, r.y1 - 1);
      // Cells of the run above the door leaf are open thresholds through the wall top.
      for (const run of isDouble ? [r, partner] : [r]) {
        for (let y = run.y0; y < top; y++) this.lintel[y * w + run.x] = 1;
      }
      if (len < 2) console.warn(`[map ${this.id}] door at ${r.x},${r.y1} is only one cell tall`);
      out.push(make(isDouble ? 'door_double' : 'door_class', r.x, top, r.x, r.y1));
    }
    return out;
  }

  _makeProp(inst, { persisted = true } = {}) {
    const def = propDef(inst.type);
    const saved = persisted ? this._state?.mapState?.[this.id]?.[inst.id] : null;
    const w = inst.w ?? def.w;
    const h = inst.h ?? def.h;
    const p = {
      kind: 'prop',
      id: inst.id,
      type: inst.type,
      def,
      inst,
      x: inst.x,
      y: inst.y,
      w,
      h,
      dir: inst.dir || 'down',
      variant: inst.variant ?? (hashStr(inst.id) & 0xff),
      mount: inst.mount || def.mount,
      state: saved?.state ?? inst.state ?? def.states[0],
      taken: !!saved?.taken,
      pparams: { ...(saved?.params || {}) },
      params: null,
      dparams: null,
      present: true,
      pastOnly: !!inst.pastOnly,
      hideInPast: !!inst.hideInPast,
      solid: false,
      opaque: false,
      sortKey: (inst.y + h) * TILE,
      // Render caches (art canvases); cleared whenever state/params change.
      _img: null,
      _imgClean: null,
      _frames: null,
      _framesClean: null,
      // Interaction prompt anchor (world px); refined by the renderer once art is known.
      promptX: (inst.x + w / 2) * TILE,
      promptY: inst.y * TILE - 4,
    };
    p.present = !p.taken && evalCond(inst.cond, this._state, inst.id);
    this._rebuildParams(p);
    return p;
  }

  _rebuildParams(p) {
    const params = { ...(p.inst.params || {}) };
    for (const f of PARAM_FIELDS) if (p.inst[f] !== undefined) params[f] = p.inst[f];
    Object.assign(params, p.pparams);
    p.params = params;
    p.dparams = { ...params, state: p.state, dir: p.dir, variant: p.variant, id: p.id };
    p._img = p._imgClean = p._frames = p._framesClean = null;
  }

  _propSolid(p) {
    if (!p.present || p.pastOnly) return false;
    if ((isDoorProp(p) || PASSABLE_WHEN_OPEN.has(p.type)) && p.state === 'open') return false;
    return p.inst.solid ?? p.def.solid;
  }

  _propOpaque(p) {
    if (!p.present || p.pastOnly) return false;
    if ((isDoorProp(p) || PASSABLE_WHEN_OPEN.has(p.type)) && p.state === 'open') return false;
    return p.inst.opaque ?? p.def.opaque;
  }

  _rebuildGrids(initial = false) {
    const { w, h } = this;
    const solid = this.solid;
    const next = this._opaqueScratch;
    solid.set(this.tileSolid);
    next.set(this.tileOpaque);
    this.propGrid.fill(0);
    const all = this.allProps;
    for (let k = 0; k < all.length; k++) {
      const p = all[k];
      p.solid = this._propSolid(p);
      p.opaque = this._propOpaque(p);
      if (!p.solid && !p.opaque) continue;
      for (let y = Math.max(0, p.y); y < Math.min(h, p.y + p.h); y++) {
        for (let x = Math.max(0, p.x); x < Math.min(w, p.x + p.w); x++) {
          const i = y * w + x;
          if (p.solid) { solid[i] = 1; this.propGrid[i] = k + 1; }
          if (p.opaque) next[i] = 1;
        }
      }
    }
    // Small non-solid props resting on furniture (lamps, books, pickups on desks) sort just after it.
    for (const p of all) {
      p.sortKey = (p.y + p.h) * TILE;
      if (p.solid || p.mount !== 'floor') continue;
      const under = this.solidPropAt(p.x, p.y + p.h - 1);
      if (under && under !== p && under.mount === 'floor') p.sortKey = Math.max(p.sortKey, under.sortKey + 0.5);
    }
    let changed = initial;
    if (!initial) {
      const cur = this.opaque;
      for (let i = 0; i < cur.length; i++) if (cur[i] !== next[i]) { changed = true; break; }
    }
    // Swap buffers so `opaque` always holds the current grid.
    this._opaqueScratch = this.opaque;
    this.opaque = next;
    if (changed && !initial) this.opaqueVersion++;
  }

  /** Props currently in the world (present, not taken, not past-only). */
  prop(id) {
    return this.propById.get(id) || null;
  }

  /** The solid prop occupying a cell, if any. */
  solidPropAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const k = this.propGrid[ty * this.w + tx];
    return k ? this.allProps[k - 1] : null;
  }

  /** All present props whose footprint covers a cell. */
  propsAt(tx, ty, out = []) {
    out.length = 0;
    for (const p of this.props) if (tx >= p.x && ty >= p.y && tx < p.x + p.w && ty < p.y + p.h) out.push(p);
    return out;
  }

  /**
   * Change a prop's state and/or params. Persistent by default (HW.state.mapState).
   * @returns the prop, or null if it isn't on this map.
   */
  setPropState(id, state, params, { persist = true } = {}) {
    const p = this.propById.get(id);
    if (!p) return null;
    if (state !== undefined && state !== null) p.state = state;
    if (params) Object.assign(p.pparams, params);
    this._rebuildParams(p);
    if (persist) this._persist(p);
    this._rebuildGrids();
    if (p.inst.light || p.def.light) this._invalidateLights();
    HW.game?.emit?.('propChange', p);
    return p;
  }

  /** Remove a prop permanently (pickups taken, things destroyed). */
  removeProp(id, { persist = true } = {}) {
    const p = this.propById.get(id);
    if (!p) return null;
    p.taken = true;
    p.present = false;
    if (persist) this._persist(p);
    this.props = this.allProps.filter((q) => q.present && !q.pastOnly);
    this._rebuildGrids();
    this._invalidateLights();
    HW.game?.emit?.('propChange', p);
    return p;
  }

  _persist(p) {
    const s = this._state;
    if (!s) return;
    const ms = s.mapState || (s.mapState = {});
    const m = ms[this.id] || (ms[this.id] = {});
    const rec = { state: p.state };
    if (p.taken) rec.taken = true;
    if (Object.keys(p.pparams).length) rec.params = { ...p.pparams };
    m[p.id] = rec;
  }

  /**
   * Re-evaluate conditional objects (`cond(state)`) — called by HW.game.refresh().
   * @returns true if the set of present props changed.
   */
  refresh(state = this._state) {
    this._state = state;
    let changed = false;
    for (const p of this.allProps) {
      const present = !p.taken && evalCond(p.inst.cond, state, p.id);
      if (present !== p.present) { p.present = present; changed = true; }
    }
    if (changed) {
      this.props = this.allProps.filter((p) => p.present && !p.pastOnly);
      this._rebuildGrids();
      this._invalidateLights();
    }
    return changed;
  }

  // ---------------------------------------------------------------------------------- grids
  isSolid(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.solid[ty * this.w + tx] === 1;
  }

  isOpaque(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.opaque[ty * this.w + tx] === 1;
  }

  /** Can a pathing walker use this cell? Closed (or unlockable) doors count when `doors` is set. */
  _pathCell(tx, ty, doors) {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * this.w + tx;
    if (!this.solid[i]) return true;
    if (!doors) return false;
    if (this.tileSolid[i]) return false;
    const p = this.solidPropAt(tx, ty);
    return !!p && isDoorProp(p) && this.doorPassable(p);
  }

  /** Would walking into this door open it (closed and unlocked, or lock now satisfied)? */
  doorPassable(p) {
    if (p.state === 'open') return true;
    const lock = p.inst.lock;
    if (LOCKED_STATES.has(p.state)) return !!lock && lockSatisfied(lock, this._state);
    return !lock || lockSatisfied(lock, this._state);
  }

  _passableFn(radius, doors) {
    const r = radius > 8 ? Math.ceil((radius - 8) / TILE) : 0;
    if (!r) return (x, y) => this._pathCell(x, y, doors);
    return (x, y) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!this._pathCell(x + dx, y + dy, doors)) return false;
      return true;
    };
  }

  /**
   * A* path between two world points (feet). Options: { radius (px clearance), doors (walk through
   * closed/unlockable doors) }. Returns waypoints [[x, y], ...] in world px (excluding the start,
   * collinear points removed), [] if already there, or null if unreachable. A blocked goal cell
   * falls back to its nearest walkable neighbour.
   */
  findPath(from, to, { radius = 0, doors = false } = {}) {
    const [fx, fy] = toXY(from);
    const [gx, gy] = toXY(to);
    const sx = Math.floor(fx / TILE);
    const sy = Math.floor(fy / TILE);
    let ex = Math.floor(gx / TILE);
    let ey = Math.floor(gy / TILE);
    const passable = this._passableFn(radius, doors);
    let exact = true;
    if (!passable(ex, ey) && !(ex === sx && ey === sy)) {
      const alt = this._nearestPassable(ex, ey, sx, sy, passable);
      if (!alt) return null;
      [ex, ey] = alt;
      exact = false;
    }
    const cells = astar(this.w, this.h, passable, sx, sy, ex, ey);
    if (!cells) return null;
    const pts = cells.map(([cx, cy]) => [cx * TILE + 8, cy * TILE + 12]);
    if (exact) {
      if (pts.length) pts[pts.length - 1] = [gx, gy];
      else if (Math.abs(gx - fx) > 0.5 || Math.abs(gy - fy) > 0.5) pts.push([gx, gy]);
    }
    return simplifyPath(pts, fx, fy);
  }

  _nearestPassable(ex, ey, sx, sy, passable) {
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 2 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = ex + dx;
          const y = ey + dy;
          if (!passable(x, y)) continue;
          // Prefer orthogonal neighbours, then closeness to the walker.
          const d = (dx && dy ? 1000 : 0) + Math.hypot(x - sx, y - sy);
          if (d < bestD) { bestD = d; best = [x, y]; }
        }
      }
    }
    return best;
  }

  /** BFS reachability between two world points on the collision grid (doors: closed = passable). */
  reachable(from, to, { doors = true } = {}) {
    const [fx, fy] = toXY(from);
    const [gx, gy] = toXY(to);
    const passable = this._passableFn(0, doors);
    return reachable(this.w, this.h, passable, Math.floor(fx / TILE), Math.floor(fy / TILE), Math.floor(gx / TILE), Math.floor(gy / TILE));
  }

  /** Line of sight between world points (opaque-aware; the start cell is ignored). */
  los(x0, y0, x1, y1) {
    return this.opaqueCount(x0, y0, x1, y1, 1) === 0;
  }

  /** Number of opaque cells crossed from (x0,y0) to (x1,y1), stopping at `max`. */
  opaqueCount(x0, y0, x1, y1, max = 64) {
    let tx = Math.floor(x0 / TILE);
    let ty = Math.floor(y0 / TILE);
    const ex = Math.floor(x1 / TILE);
    const ey = Math.floor(y1 / TILE);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let tMaxX = adx < 1e-9 ? Infinity : (sx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / adx;
    let tMaxY = ady < 1e-9 ? Infinity : (sy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / ady;
    const tdx = adx < 1e-9 ? Infinity : TILE / adx;
    const tdy = ady < 1e-9 ? Infinity : TILE / ady;
    let count = 0;
    let guard = 0;
    while ((tx !== ex || ty !== ey) && guard++ < 1024) {
      if (tMaxX < tMaxY) { tMaxX += tdx; tx += sx; } else { tMaxY += tdy; ty += sy; }
      if (this.isOpaque(tx, ty) && ++count >= max) return count;
    }
    return count;
  }

  // ---------------------------------------------------------------------------------- meta
  _buildMeta() {
    const { data, w, h } = this;
    this.rooms = (data.rooms || []).map((r) => ({ ...r }));
    this.roomGrid = new Int16Array(w * h);
    this.rooms.forEach((r, i) => {
      const [rx, ry, rw, rh] = r.rect;
      for (let y = Math.max(0, ry); y < Math.min(h, ry + rh); y++) {
        for (let x = Math.max(0, rx); x < Math.min(w, rx + rw); x++) if (!this.roomGrid[y * w + x]) this.roomGrid[y * w + x] = i + 1;
      }
    });
    this.anchors = data.anchors || {};
    this.exits = (data.exits || []).map((e, i) => ({ id: e.id || `exit_${i}`, fade: true, ...e }));
    this.triggers = (data.triggers || []).map((t, i) => {
      const id = t.id || `t${i}`;
      return { once: true, ...t, id, flag: `trig_${this.id}_${id}` };
    });
    this.past = (data.past || []).map((pe, i) => ({
      ...pe, id: pe.id || `${this.id}_past_${i}`, hideSet: new Set(pe.hide || []), _objects: null,
    }));
    this.patrol = data.patrol || null;
  }

  /** Room containing a world point (feet), or null. */
  roomAt(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!this.inBounds(tx, ty)) return null;
    const k = this.roomGrid[ty * this.w + tx];
    return k ? this.rooms[k - 1] : null;
  }

  /** Named anchor → { x, y, dir } in world px (feet point), or null. */
  anchor(name) {
    const a = this.anchors[name];
    if (!a) return null;
    return { x: a[0] * TILE + 8, y: a[1] * TILE + 12, dir: a[2] || 'down', tx: a[0], ty: a[1] };
  }

  exitAt(tx, ty, state = this._state) {
    for (const e of this.exits) if (rectHas(e.rect, tx, ty) && evalCond(e.cond, state, e.id)) return e;
    return null;
  }

  /** Past view (compact) whose rect contains the cell, or null. */
  pastAt(tx, ty) {
    for (const pe of this.past) if (pe.rect && rectHas(pe.rect, tx, ty)) return pe;
    return null;
  }

  /** Runtime props shown only inside a past view (built lazily, never collide). */
  pastObjects(pe) {
    if (!pe._objects) {
      pe._objects = (pe.objects || []).map((o, i) => {
        const p = this._makeProp({ ...o, id: o.id || `${pe.id}_${o.type}_${i}`, pastOnly: true }, { persisted: false });
        p.present = true;
        p.sortKey = (p.y + p.h) * TILE;
        return p;
      });
    }
    return pe._objects;
  }

  // ---------------------------------------------------------------------------------- lights
  /** Map lights + prop-attached lights, in tile coords (TECH §5.5). Rebuilt when props change. */
  get lightDefs() {
    if (!this._lightDefs) this._lightDefs = this._buildLights();
    return this._lightDefs;
  }

  _buildLights() {
    const out = [];
    (this.data.lights || []).forEach((l, i) => out.push({ id: `${this.id}_light_${i}`, ...l }));
    for (const p of this.props) {
      const spec = p.inst.light ?? p.def.light;
      if (!spec) continue;
      const L = typeof spec === 'string' ? { type: spec } : { ...spec };
      L.type = L.type || p.def.light;
      if (!L.type) continue;
      out.push({
        ...L,
        id: `${p.id}_light`,
        propId: p.id,
        x: L.x ?? p.x + (p.w - 1) / 2,
        y: L.y ?? p.y + (p.h - 1) / 2,
        on: L.on ?? !LIGHT_OFF_STATES.has(p.state),
        flicker: L.flicker ?? (p.state === 'flicker' ? true : undefined),
      });
    }
    return out;
  }

  _invalidateLights() {
    this._lightDefs = null;
    this.lightsVersion++;
    if (HW.map === this) {
      try { HW.lighting?.onLightsChanged?.(this); } catch (e) { console.error('[map] lighting.onLightsChanged failed', e); }
    }
  }

  /** Face-low window cells (moonlight emitters). */
  get windowCells() {
    if (!this._windowCells) {
      this._windowCells = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.wk[y * this.w + x] === WK_LOW && TILES[this.tileAt(x, y)].kind === 'window') this._windowCells.push({ tx: x, ty: y });
        }
      }
    }
    return this._windowCells;
  }

  // ---------------------------------------------------------------------------------- layers
  /**
   * Prerendered tile layers { floor, faces, tops } (canvases, map-sized). `clean` = the 1979 set
   * used by compact past views; both are built lazily on first use and kept for the map's life.
   */
  getLayers(clean = false) {
    const k = clean ? 'clean' : 'normal';
    if (!this._layers[k]) this._layers[k] = this._renderLayers(clean);
    return this._layers[k];
  }

  _renderLayers(clean) {
    const [floor, floorCtx] = makeLayer(this.pw, this.ph);
    const [faces, facesCtx] = makeLayer(this.pw, this.ph);
    const [tops, topsCtx] = makeLayer(this.pw, this.ph);
    const L = { floor, faces, tops, floorCtx, facesCtx, topsCtx, clean };
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this._drawCell(L, x, y);
    return L;
  }

  _drawCell(L, tx, ty) {
    const art = HW.art;
    if (!art) return;
    const i = ty * this.w + tx;
    const key = this.keyTable[this.cells[i]];
    const def = TILES[key];
    const o = this._drawOpts;
    o.kind = undefined;
    o.mask = 0;
    o.variant = this.variantAt(tx, ty);
    o.clean = L.clean;
    o.t = 0;
    let ctx;
    if (def.kind === 'wall' || def.kind === 'window') {
      o.kind = WK_NAMES[this.wk[i]];
      o.mask = this.wallMask(tx, ty);
      ctx = this.wk[i] === WK_TOP ? L.topsCtx : L.facesCtx;
    } else if (def.kind === 'door') {
      // Thresholds above a door leaf read as a gap in the wall top; drawn on the floor layer so
      // characters walking through stay visible.
      if (this.lintel[i]) { o.kind = 'top'; o.mask = this.wallMask(tx, ty); }
      ctx = L.floorCtx;
    } else if (key === 'railing' || key === 'stage_front') {
      o.mask = this.sameMask(tx, ty);
      ctx = L.facesCtx;
    } else {
      if (key === 'pit') o.mask = this.sameMask(tx, ty);
      ctx = L.floorCtx;
    }
    try {
      art.drawTile(ctx, key, tx * TILE, ty * TILE, o);
    } catch (e) {
      if (!this._artErrorShown) {
        this._artErrorShown = true;
        console.error(`[map ${this.id}] drawTile failed for ${key}`, e);
      }
    }
  }

  /** Draw animated floor cells (e.g. water) for the current frame, in screen space. */
  drawAnimatedTiles(ctx, cam, clean, t) {
    if (!this.animatedCells.length) return;
    const o = this._drawOpts;
    const x0 = Math.floor(cam.x / TILE) - 1;
    const y0 = Math.floor(cam.y / TILE) - 1;
    const x1 = x0 + Math.ceil(cam.w / TILE) + 2;
    const y1 = y0 + Math.ceil(cam.h / TILE) + 2;
    for (const i of this.animatedCells) {
      const tx = i % this.w;
      const ty = (i - tx) / this.w;
      if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
      o.kind = undefined;
      o.mask = 0;
      o.variant = this.variantAt(tx, ty);
      o.clean = clean;
      o.t = t;
      HW.art.drawTile(ctx, this.keyTable[this.cells[i]], tx * TILE - cam.x, ty * TILE - cam.y, o);
    }
  }
}

/** Accept [x, y] or { x, y }. */
function toXY(p) {
  if (Array.isArray(p)) return p;
  return [p.x, p.y];
}

/** Drop the waypoints that lie on a straight line between their neighbours. */
function simplifyPath(pts, fx, fy) {
  if (pts.length < 3) return pts;
  const out = [];
  let px = fx;
  let py = fy;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const next = pts[i + 1];
    if (next) {
      const d1x = Math.sign(Math.round(cur[0] - px));
      const d1y = Math.sign(Math.round(cur[1] - py));
      const d2x = Math.sign(Math.round(next[0] - cur[0]));
      const d2y = Math.sign(Math.round(next[1] - cur[1]));
      if (d1x === d2x && d1y === d2y) { px = cur[0]; py = cur[1]; continue; }
    }
    out.push(cur);
    px = cur[0];
    py = cur[1];
  }
  return out;
}

export default MapRuntime;
