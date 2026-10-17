// HW.noise — sound events the AI can hear (CONTENT §5.4, DESIGN R3).
//
// Anything loud calls HW.noise.emit(); listeners (the Colonel's hearing, the basement stir rule,
// the assembly's "running = immediate scan") receive the event at the start of the next system
// step, which lets the noise be attributed first (a door opened by a follower is not Tess's noise).
//
// API
//   HW.noise.emit(x, y, radiusTiles?, kind)   world px; radius in TILES (null → default for the kind;
//                                              Infinity or 'map' → map-wide). Returns the event.
//   HW.noise.on(fn) → off()                   fn(ev) once per event. ev = { x, y, radius (tiles),
//                                              r (px), kind, by, t, map } — a pooled object: copy what
//                                              you keep past the call.
//   HW.noise.recent(sec = 5, kind?)           → copies of recent events (debugging / tests)
//   HW.noise.last                             the most recent event (pooled)
//   HW.noise.RADII                            default radii (tiles) per kind
//
// Kinds and default radii (tiles): run 7 · walk 1.5 · door 5 · item 8 · mixer 12 · panel 10 ·
// bolt_cutters 6 · whistle map-wide. `by` is the entity id that made the noise when known
// ('colonel', 'danny', …); undefined = the player / the world. Doors opened by NPCs are tagged
// through the engine's 'doorOpen' event.
import HW from '../engine/hw.js';

const TILE = 16;
const POOL = 64;

export const RADII = Object.freeze({
  run: 7, walk: 1.5, door: 5, item: 8, mixer: 12, panel: 10, bolt_cutters: 6, whistle: Infinity,
});

function makeEvent() {
  return { x: 0, y: 0, radius: 0, r: 0, kind: '', by: undefined, t: 0, map: null };
}

export const noise = {
  RADII,
  last: null,
  _pool: Array.from({ length: POOL }, makeEvent),
  _head: 0,
  _count: 0,
  _pending: [],
  _listeners: new Set(),
  _hooked: false,

  /** Emit a noise at world px (x, y). */
  emit(x, y, radius, kind = 'item') {
    let rad = radius;
    if (rad === 'map') rad = Infinity;
    if (rad === null || rad === undefined || !(rad >= 0)) rad = RADII[kind] ?? 5;
    const ev = this._pool[this._head];
    this._head = (this._head + 1) % POOL;
    if (this._count < POOL) this._count++;
    ev.x = x;
    ev.y = y;
    ev.radius = rad;
    ev.r = rad * TILE;
    ev.kind = kind;
    ev.by = undefined;
    ev.t = HW.time;
    ev.map = HW.map?.id || null;
    this.last = ev;
    this._pending.push(ev);
    if (kind !== 'walk') HW.debug?.record?.('noise', null, null, `${kind}@${Math.round(x)},${Math.round(y)} r${rad}`);
    return ev;
  },

  /** Subscribe to noise events; returns an unsubscribe function. */
  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  /** Copies of the events of the last `sec` seconds (optionally one kind), oldest first. */
  recent(sec = 5, kind = null) {
    const out = [];
    for (let k = this._count; k >= 1; k--) {
      const ev = this._pool[(this._head - k + POOL) % POOL];
      if (HW.time - ev.t > sec || (kind && ev.kind !== kind)) continue;
      out.push({ ...ev });
    }
    return out;
  },

  /** Is a world point within earshot of an event? Walls muffle: two or more opaque cells halve the range. */
  hears(ev, x, y) {
    if (ev.r === Infinity) return true;
    const d = Math.hypot(ev.x - x, ev.y - y);
    if (d > ev.r) return false;
    const map = HW.map;
    if (map && d > TILE && map.opaqueCount(ev.x, ev.y - 6, x, y - 6, 2) >= 2) return d <= ev.r * 0.5;
    return true;
  },

  // ---- system ------------------------------------------------------------------------------------
  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    // interact.openDoor emits the door noise and then 'doorOpen' (prop, by): tag it with its maker.
    HW.game.on('doorOpen', (p, by) => {
      if (!by || by === 'player' || by === 'tess') return;
      const cx = (p.x + p.w / 2) * TILE;
      const cy = (p.y + p.h / 2) * TILE;
      for (let i = this._pending.length - 1; i >= 0; i--) {
        const ev = this._pending[i];
        if (ev.kind === 'door' && ev.by === undefined && Math.abs(ev.x - cx) < 2 && Math.abs(ev.y - cy) < 2) { ev.by = by; break; }
      }
    });
    const clear = () => { this._pending.length = 0; };
    HW.game.on('newGame', clear);
    HW.game.on('load', clear);
  },

  onMapLoad() {
    this._hook();
    this._pending.length = 0; // noises don't carry across maps
  },

  update() {
    this._hook();
    const q = this._pending;
    if (!q.length) return;
    for (let i = 0; i < q.length; i++) {
      const ev = q[i];
      for (const fn of this._listeners) {
        try { fn(ev); } catch (e) { console.error('[noise] listener failed', e); }
      }
    }
    q.length = 0;
  },
};

export default noise;
