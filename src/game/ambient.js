// Map ambience points (Integration 2) — HW.ambient. Applies two optional map data fields while a map
// is loaded; both are rebuilt on every map load and their conditions re-checked on HW.game.refresh()
// (and every 0.5 s, so a flag set mid-scene takes effect without a refresh):
//
//   sounds: [{ loop, at: [tx, ty], vol = 0.6, radius (tiles) | far (px), fade = 0.6, cond(state), id }]
//     A positional HW.audio.loop(loop, { x, y, vol, far }) at the cell centre while `cond` holds
//     (no cond = always). west2's running tap: { loop: 'faucet', at: [4, 3], cond: !adair_met }.
//     Script compatibility: if another loop with the same id is already playing within 2 tiles of the
//     point when an entry would start (or starts while it plays) — a chapter script driving that sound
//     itself, as ch5.js does with the faucet — the entry stays silent for the rest of this map visit,
//     so the script keeps full control (it can stop the sound mid-scene without the map restarting it).
//     Entries start 0.3 s after the map loads, after the map's onEnter script has had its first tick.
//
//   fx: { <type>: [[tx, ty], ...], ... }                      (the vault/breaker form)
//     | [{ type, at: [tx, ty] | points: [[tx, ty], ...], every: [min, max] s, n, cond(state) }]
//     Ambient particle emitters: HW.fx.emit(type, tx*16+8, ty*16+8, n) at intervals, only for points
//     near the camera. Types are HW.fx particle types (drip, ember, steam, coal_dust, dust, amber_motes,
//     paper, spark, breath, splash); each has a default interval and count. A drip now and then makes a
//     quiet positional 'drip' as it lands.
//
// API: HW.ambient.sounds (live entries: { id, def, x, y, handle, deferred }), .emitters, .refresh(),
//      .mute(idOrLoop, fade) — silence an entry (by entry id or loop id) for the rest of this visit
//      (a scene that stops the sound itself: "the tap stops"), .stopSounds(fade).
//      Registered by game/index.js.
import HW from '../engine/hw.js';

const TILE = 16;
const GRACE = 0.3;          // s after a map load before sound entries may start
const RECHECK = 0.5;        // s between condition / duplicate checks
const DEDUP_PX = 2 * TILE;  // a foreign loop of the same id this close = the script owns the sound
const MARGIN = 48;          // px around the view in which emitters run
const FX_GAP = {
  drip: [1.4, 3.4], ember: [0.35, 0.95], steam: [0.45, 1.2], coal_dust: [0.9, 2.2], dust: [1.2, 2.6],
  amber_motes: [1.6, 3.2], paper: [4, 8], spark: [1.6, 4.2], breath: [2, 4], splash: [1.6, 3.2],
};
const FX_N = { drip: [1, 1], ember: [1, 2], steam: [1, 2], coal_dust: [1, 3], dust: [1, 2], spark: [2, 5] };
const DEFAULT_GAP = [1, 2.5];

const rand = (a, b) => a + Math.random() * Math.max(0, b - a);

function evalCond(cond, what) {
  if (!cond) return true;
  try {
    return !!cond(HW.state);
  } catch (e) {
    console.error(`[ambient] cond failed for ${what}`, e);
    return false;
  }
}

/** Normalise the map's `fx` field (object or array form) into emitter records. */
function parseFx(fx, mapId) {
  const out = [];
  const add = (type, pt, o = {}) => {
    if (typeof type !== 'string' || !Array.isArray(pt) || pt.length < 2) return;
    const gap = Array.isArray(o.every) ? o.every : typeof o.every === 'number' ? [o.every, o.every] : FX_GAP[type] || DEFAULT_GAP;
    const n = Array.isArray(o.n) ? o.n : typeof o.n === 'number' ? [o.n, o.n] : FX_N[type] || [1, 1];
    out.push({ type, x: pt[0] * TILE + 8, y: pt[1] * TILE + 8, gap, n, cond: o.cond || null, t: rand(0, gap[1]), id: `${mapId}_fx_${out.length}` });
  };
  if (Array.isArray(fx)) {
    for (const e of fx) {
      if (!e) continue;
      if (Array.isArray(e.points)) for (const pt of e.points) add(e.type, pt, e);
      else add(e.type, e.at, e);
    }
  } else if (fx && typeof fx === 'object') {
    for (const [type, pts] of Object.entries(fx)) if (Array.isArray(pts)) for (const pt of pts) add(type, pt);
  }
  return out;
}

export const ambient = {
  sounds: [],
  emitters: [],
  _map: null,
  _t: 0,
  _check: 0,
  _hooked: false,

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('refresh', () => this.refresh());
    HW.game.on('mode', (m) => { if (m === 'title' || m === 'gameover') this.stopSounds(0.3); });
  },

  onMapLoad(map) {
    this._hook();
    this.stopSounds(0.3);
    this._map = map;
    this._t = 0;
    this._check = 0;
    const d = map?.data || {};
    this.sounds = (Array.isArray(d.sounds) ? d.sounds : [])
      .filter((s) => s && typeof s.loop === 'string' && Array.isArray(s.at))
      .map((def, i) => ({ id: def.id || `${map.id}_sound_${i}`, def, x: def.at[0] * TILE + 8, y: def.at[1] * TILE + 8, handle: null, deferred: false }));
    this.emitters = parseFx(d.fx, map?.id);
  },

  /** Re-evaluate the sound conditions at the next step (HW.game.refresh() calls this). */
  refresh() { this._check = 0; },

  /** Silence matching entries (entry id or loop id) until the next map load. Returns how many. */
  mute(idOrLoop, fade = 0.4) {
    let n = 0;
    for (const s of this.sounds) {
      if (s.id !== idOrLoop && s.def.loop !== idOrLoop) continue;
      if (s.handle) { try { s.handle.stop?.(fade); } catch (e) { console.error('[ambient] stop', e); } s.handle = null; }
      s.deferred = true;
      n++;
    }
    return n;
  },

  stopSounds(fade = 0.4) {
    for (const s of this.sounds) {
      if (!s.handle) continue;
      try { s.handle.stop?.(fade); } catch (e) { console.error('[ambient] stop', e); }
      s.handle = null;
    }
  },

  update(dt) {
    const map = HW.map;
    if (!map || map !== this._map) {
      if (!map && this.sounds.length) { this.stopSounds(0.3); this.sounds = []; this.emitters = []; this._map = null; }
      return;
    }
    this._t += dt;
    if (this.sounds.length && this._t >= GRACE) {
      this._check -= dt;
      if (this._check <= 0) { this._check = RECHECK; this._evalSounds(); }
    }
    if (this.emitters.length) this._tickFx(dt);
  },

  /** Is a loop with this id, not ours, playing near the point? */
  _foreign(s) {
    let list = [];
    try { list = HW.audio?.activeLoops?.(s.def.loop) || []; } catch { list = []; }
    for (const L of list) {
      if (L.handle === s.handle || L.x === null || L.x === undefined) continue;
      if (Math.abs(L.x - s.x) <= DEDUP_PX && Math.abs(L.y - s.y) <= DEDUP_PX) return true;
    }
    return false;
  },

  _evalSounds() {
    for (const s of this.sounds) {
      if (s.deferred) continue;
      const want = evalCond(s.def.cond, s.id);
      if (want && this._foreign(s)) {
        // A script plays this sound itself: hand it over for this visit.
        if (s.handle) { try { s.handle.stop?.(0.2); } catch { /* ignore */ } s.handle = null; }
        s.deferred = true;
        HW.debug?.record?.('ambient', null, null, `${s.id}:deferred`);
        continue;
      }
      if (want && !s.handle) {
        const def = s.def;
        const opts = { x: s.x, y: s.y, vol: def.vol ?? 0.6 };
        if (def.far) opts.far = def.far;
        else if (def.radius) opts.far = def.radius * TILE;
        let h = null;
        try { h = HW.audio?.loop?.(def.loop, opts); } catch (e) { console.error('[ambient] loop', e); }
        s.handle = h && h.playing ? h : null;   // no audio engine yet → retry next check
        if (s.handle) HW.debug?.record?.('ambient', null, null, `${s.id}:on`);
      } else if (!want && s.handle) {
        try { s.handle.stop?.(s.def.fade ?? 0.6); } catch (e) { console.error('[ambient] stop', e); }
        s.handle = null;
        HW.debug?.record?.('ambient', null, null, `${s.id}:off`);
      }
    }
  },

  _tickFx(dt) {
    const cam = HW.camera?.view;
    const list = this.emitters;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.t -= dt;
      if (e.t > 0) continue;
      e.t = rand(e.gap[0], e.gap[1]);
      if (cam && (e.x < cam.x - MARGIN || e.x > cam.x + (cam.w || 480) + MARGIN || e.y < cam.y - MARGIN || e.y > cam.y + (cam.h || 270) + MARGIN)) continue;
      if (e.cond && !evalCond(e.cond, e.id)) continue;
      const n = Math.round(rand(e.n[0], e.n[1]));
      try {
        HW.fx?.emit?.(e.type, e.x, e.y, n);
      } catch (err) {
        console.error(`[ambient] fx '${e.type}' failed; emitter dropped`, err);
        list.splice(i, 1);
        continue;
      }
      if (e.type === 'drip' && Math.random() < 0.35) HW.audio?.sfx?.('drip', { x: e.x, y: e.y, vol: 0.28, delay: 0.38 });
    }
  },
};

export default ambient;
