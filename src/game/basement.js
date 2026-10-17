// HW.basement — the sleeper in the coal bin (DESIGN §6 III.2, §9.1; CONTENT §5.5, rule R3).
//
// Active on any map with a present `coal_heap` prop in state 'occupied' (the basement's b_coal_heap)
// while flag coalbin_empty is unset. The Colonel is in 'sleep' mode there (no entity: the heap's art
// shows him). WALKING NEVER STIRS. Noises of kind run / door / item / mixer / panel / bolt_cutters
// whose source is ≤ 8 tiles from the heap add one stir (3 s cooldown); the breaker panel's CLUNK
// only sets stir 1 when stir is 0 (from anywhere on the map). Stir decays by 1 after 20 s of quiet.
//   stir 1 → coal slides, the breath quickens, script `ch3.stir1` (blocking, if defined)
//   stir 2 → script `ch3.stir2` (blocking, if defined), then he RISES and hunts (HW.colonel.rise →
//            chase, always knowing where she is on this map). He doesn't follow up the stairs: a map
//            transfer ends it and the heap re-settles (stir 0). Caught → 'woke'.
// Audio: positional boiler loop (anchor 'boiler' or the `boiler` prop), the sleeper's breath at the
// heap, ambience ducked −18 dB within 10 tiles of the occupied heap (HW.audio.duck).
// Flag ch3_colonel_stirred mirrors the stir level (0..2).
//
// API
//   stir (0..2) · heap (prop | null) · active · risen
//   addStir(n = 1, kind = 'script') → the new level (scripts: e.g. a dropped item)
//   setStir(n)                       force a level (1 plays stir 1, ≥ 2 rises)
//   reset()                          heap re-settles (stir 0)
//   NOISE SOURCES scripts must emit: HW.noise.emit(x, y, null, 'bolt_cutters' | 'item' | 'mixer' | 'panel')
import HW from '../engine/hw.js';
import noise from './noise.js';
import colonel from './colonel_ai.js';

const TILE = 16;
const STIR_KINDS = new Set(['run', 'door', 'item', 'mixer', 'panel', 'bolt_cutters']);
const STIR_RANGE = 8 * TILE;
const COOLDOWN = 3;
const QUIET_DECAY = 20;
const DUCK_RANGE = 10 * TILE;
const DUCK_LEVEL = 0.125;       // −18 dB

export const basement = {
  stir: 0,
  heap: null,
  risen: false,
  _cool: 0,
  _quiet: 0,
  _ducked: false,
  _boiler: null,
  _breath: null,
  _breathId: null,
  _busy: false,
  _hooked: false,

  get active() {
    const h = this.heap;
    return !!h && h.present && h.state === 'occupied' && !HW.state?.flags?.coalbin_empty;
  },

  /** Centre of the heap in world px. */
  _center() {
    const h = this.heap;
    if (!h) return null;
    const a = HW.map?.anchor('coal_heap');
    if (a && h.x <= a.tx && a.tx < h.x + h.w + 1 && Math.abs(a.ty - h.y) < h.h + 2) return { x: a.x, y: a.y };
    return { x: (h.x + h.w / 2) * TILE, y: (h.y + h.h / 2) * TILE };
  },

  addStir(n = 1, kind = 'script') {
    if (!this.active || this.risen) return this.stir;
    return this.setStir(this.stir + n, kind);
  },

  setStir(n, kind = 'script') {
    const prev = this.stir;
    this.stir = Math.max(0, Math.min(2, n));
    this._quiet = 0;
    if (HW.state) HW.state.flags.ch3_colonel_stirred = this.stir;
    HW.debug?.record?.('stir', null, null, `${prev}>${this.stir}:${kind}`);
    if (this.stir > prev) {
      if (this.stir === 1) this._stir1();
      else this._stir2();
    } else if (this.stir === 0) {
      this._breathLoop('colonel_breath');
    }
    return this.stir;
  },

  _stir1() {
    const c = this._center();
    if (c) HW.audio?.sfx?.('coal_slide', { x: c.x, y: c.y });
    HW.fx?.emit?.('coal_dust', c?.x ?? 0, (c?.y ?? 0) - 8, 10);
    this._breathLoop('colonel_breath_fast');
    if (HW.scripts?.has?.('ch3.stir1')) HW.scripts.run('ch3.stir1', { map: HW.map, heap: this.heap, stir: 1 });
  },

  async _stir2() {
    if (this.risen || this._busy) return;
    this._busy = true;
    const map = HW.map;
    const heap = this.heap;
    const c = this._center();
    if (HW.scripts?.has?.('ch3.stir2')) await HW.scripts.run('ch3.stir2', { map, heap, stir: 2 });
    this._busy = false;
    if (HW.map !== map || !heap || this.risen) return;
    if (colonel.entity && colonel.mode === 'chase') { this.risen = true; return; } // the script raised him
    this.risen = true;
    this._stopBreath();
    map.setPropState(heap.id, 'hollow', null, { persist: false });
    colonel.sleep(c);
    colonel.rise({ at: c, reason: 'woke', track: true });
  },

  reset() {
    this.stir = 0;
    this._cool = 0;
    this._quiet = 0;
    this.risen = false;
    this._busy = false;
    if (HW.state?.flags && this.heap) HW.state.flags.ch3_colonel_stirred = 0;
  },

  _breathLoop(id) {
    if (this._breathId === id && this._breath) return;
    this._stopBreath();
    const c = this._center();
    if (!c) return;
    this._breath = HW.audio?.loop?.(id, { x: c.x, y: c.y - 8, vol: 0.7 }) || null;
    this._breathId = id;
  },

  _stopBreath() {
    try { this._breath?.stop?.(0.8); } catch (e) { console.error('[basement] breath stop', e); }
    this._breath = null;
    this._breathId = null;
  },

  _duck(on) {
    if (on === this._ducked) return;
    this._ducked = on;
    HW.audio?.duck?.(on ? DUCK_LEVEL : 1, 1);
  },

  /** Noise rule: walking never stirs; loud things near the heap do. */
  _hear(ev) {
    if (!this.active || this.risen || ev.map !== HW.map?.id || !STIR_KINDS.has(ev.kind)) return;
    if (ev.by === 'colonel') return;
    if (ev.kind === 'panel') {
      if (this.stir === 0) this.setStir(1, 'panel');
      return;
    }
    const c = this._center();
    if (!c || Math.hypot(ev.x - c.x, ev.y - c.y) > STIR_RANGE) return;
    if (this._cool > 0) return;
    this._cool = COOLDOWN;
    this.setStir(this.stir + 1, ev.kind);
  },

  _scan(map) {
    this.heap = null;
    if (!map) return;
    const byId = map.prop('b_coal_heap');
    if (byId && byId.present) { this.heap = byId; return; }
    for (const p of map.props) if (p.type === 'coal_heap') { this.heap = p; return; }
  },

  _enter(map) {
    this._scan(map);
    this.reset();
    this._stopBreath();
    try { this._boiler?.stop?.(1); } catch (e) { console.error('[basement] boiler stop', e); }
    this._boiler = null;
    if (!map) return;
    // Positional boiler hum wherever there is one.
    const boiler = map.props.find((p) => p.type === 'boiler');
    const bp = map.anchor('boiler') || (boiler && { x: (boiler.x + boiler.w / 2) * TILE, y: (boiler.y + boiler.h / 2) * TILE });
    if (bp) this._boiler = HW.audio?.loop?.('boiler', { x: bp.x, y: bp.y, vol: 0.9 }) || null;
    if (this.active) {
      colonel.sleep(this._center());
      this._breathLoop('colonel_breath');
    }
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    noise.on((ev) => this._hear(ev));
    HW.game.on('refresh', () => {
      const was = this.active;
      this._scan(HW.map);
      if (this.active && !was) { this.reset(); colonel.sleep(this._center()); this._breathLoop('colonel_breath'); }
      if (!this.active && was) { this._stopBreath(); this._duck(false); if (colonel.mode === 'sleep') colonel.mode = 'off'; }
    });
  },

  onMapLoad(map) {
    this._hook();
    this._duck(false);
    this._enter(map);
  },

  update(dt) {
    this._hook();
    if (!this.heap) return;
    const active = this.active && !this.risen;
    if (active) {
      if (this._cool > 0) this._cool -= dt;
      if (this.stir > 0) {
        this._quiet += dt;
        if (this._quiet >= QUIET_DECAY) this.setStir(this.stir - 1, 'quiet');
      }
    }
    const p = HW.player;
    const c = this._center();
    this._duck(!!(active && p && c && Math.hypot(p.x - c.x, p.y - c.y) <= DUCK_RANGE));
  },
};

export default basement;
