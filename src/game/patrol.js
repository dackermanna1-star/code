// HW.patrol — the Safety Patrol: Kevin Hoyt, sentinel (DESIGN §3, §5 R3/R4; CONTENT §5.7).
//
// A small figure with an orange belt at the end of a hall. He never walks while observed (he never
// walks at all on his own), his head turns to follow Tess, and if she RUNS in his line of sight
// within 10 tiles he whistles: the breathy pre-whistle, then the whistle. That is never a death by
// itself — he reports: outside a period a standard period warning starts now (HW.periods
// .forceWarning); during a period the Colonel goes to investigate where she was running (and a
// later catch reads "Running in the halls — reported by K. Hoyt, Safety Patrol").
//
// API
//   spawn(id = 'kevin', { at, dir = 'down', whistle = true, range = 10, glimpse = false }) → entity
//       at: anchor | [tx,ty] | {x,y}. glimpse: he vanishes once Tess has seen him and looks away
//       (Ch4: "gone on a second look").
//   despawn(id = 'kevin')
//   enable({ maps, chance = 1 }) / disable()   auto-spawn a sentinel on each load of these maps at
//       one of the map's `patrol.kevin` spots ([[tx, ty, dir?], …]) that is off screen at load (never
//       visible at load). Persisted in HW.state.patrolCfg.
//   whistle(id = 'kevin') → Promise            force a whistle (scripts)
//   dismiss()                                   DISMISSED: he lowers the whistle and takes off the
//       belt — never whistles again (art: holds `hand_out_down`; a belt-off frame is an art request).
//   sentinels → [{ id, entity, … }] · onWhistle(fn) → off   (fn({ id, x, y, tx, ty }))
//   HW.game also emits 'whistle' with the same object.
import HW from '../engine/hw.js';
import { dirFromVec, resolvePoint } from '../engine/entities.js';
import noise from './noise.js';
import periods, { inFreePlay } from './periods.js';

const TILE = 16;
const RANGE = 10 * TILE;
const TRACK_RANGE = 16 * TILE;
const PRE_WHISTLE = 0.45;     // breathy intake before the whistle
const COOLDOWN = 6;
const GLIMPSE_GONE = 0.35;    // s out of sight after being seen → gone

export const patrol = {
  sentinels: [],
  cfg: null,
  dismissed: false,
  _hooks: new Set(),
  _hooked: false,

  spawn(id = 'kevin', { at, dir = 'down', whistle = true, range = 10, glimpse = false } = {}) {
    const pt = resolvePoint(at ?? 'kevin');
    if (!pt) { console.warn('[patrol] spawn: no spot', at); return null; }
    this.despawn(id);
    const e = HW.entities.spawn({ id, sprite: 'kevin', px: pt.x, py: pt.y, dir: pt.dir || dir, solid: false });
    this.sentinels.push({
      id, entity: e, whistle: !!whistle && !this.dismissed, range: range * TILE, glimpse: !!glimpse,
      seen: false, unseenT: 0, cool: 0, pre: -1, holdT: 0,
    });
    HW.debug?.record?.('kevin', null, null, `spawn:${id}`);
    return e;
  },

  despawn(id = 'kevin') {
    const i = this.sentinels.findIndex((s) => s.id === id);
    if (i >= 0) this.sentinels.splice(i, 1);
    if (HW.entities?.get(id)) HW.entities.despawn(id);
  },

  enable({ maps = [], chance = 1 } = {}) {
    this.cfg = { maps: [...maps], chance };
    if (HW.state) HW.state.patrolCfg = { ...this.cfg, maps: [...this.cfg.maps] };
  },

  disable() {
    this.cfg = null;
    if (HW.state) HW.state.patrolCfg = null;
  },

  onWhistle(fn) { this._hooks.add(fn); return () => this._hooks.delete(fn); },

  /** Force a whistle now (scripts). Resolves after the whistle sounds. */
  whistle(id = 'kevin') {
    const s = this.sentinels.find((k) => k.id === id);
    if (!s) return Promise.resolve(false);
    s.pre = PRE_WHISTLE;
    HW.audio?.sfx?.('whistle_breath', { x: s.entity.x, y: s.entity.y - 20 });
    return HW.game.until(() => s.pre < 0, 3);
  },

  dismiss() {
    this.dismissed = true;
    for (const s of this.sentinels) {
      s.whistle = false;
      const e = s.entity;
      if (e?.sheet?.anims?.hand_out_down) e.playAnim('hand_out_down', { once: true, hold: true });
    }
  },

  // ---------------------------------------------------------------------------------- per step
  _visibleToTess(e) {
    const p = HW.player;
    const v = HW.camera?.view;
    if (!p || !v) return false;
    if (e.x < v.x - 8 || e.x > v.x + v.w + 8 || e.y < v.y || e.y > v.y + v.h + 30) return false;
    return !!HW.map?.los(p.x, p.y - 8, e.x, e.y - 8);
  },

  _fireWhistle(s) {
    const e = s.entity;
    const p = HW.player;
    e.face('down');
    if (e.sheet?.anims?.whistle_down) e.playAnim('whistle_down', { once: true, hold: true });
    s.holdT = 1.6;
    s.cool = COOLDOWN;
    HW.audio?.sfx?.('whistle', { x: e.x, y: e.y - 20 });
    // The report: where she was running. Map-wide, so the Colonel hears it wherever he is.
    const tx = p ? p.x : e.x;
    const ty = p ? p.y : e.y;
    noise.emit(tx, ty, Infinity, 'whistle');
    if (!periods.active && periods.phase === 'idle') periods.forceWarning('whistle');
    else if (periods.active) periods.reportedBy = 'kevin';
    const info = { id: s.id, x: e.x, y: e.y, tx, ty };
    HW.debug?.record?.('kevin', null, null, `whistle:${s.id}`);
    for (const fn of this._hooks) { try { fn(info); } catch (err) { console.error('[patrol] whistle hook failed', err); } }
    HW.game?.emit?.('whistle', info);
  },

  _update(s, dt, free) {
    const e = s.entity;
    const p = HW.player;
    if (!e || !p || HW.entities.get(s.id) !== e) return false;
    if (s.cool > 0) s.cool -= dt;
    if (s.holdT > 0) {
      s.holdT -= dt;
      if (s.holdT <= 0 && !this.dismissed) e.clearAnim();
    }
    if (s.pre >= 0) {
      s.pre -= dt;
      if (s.pre < 0) this._fireWhistle(s);
      return true;
    }
    if (!free) return true;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const los = d <= TRACK_RANGE && p.visible && !p.hidden && HW.map.los(e.x, e.y - 8, p.x, p.y - 8);
    // Head tracking: he turns to follow her.
    if (los && s.holdT <= 0 && !this.dismissed) {
      const dir = dirFromVec(dx, dy, e.dir, 1.2);
      if (dir !== e.dir) e.face(dir);
    }
    // R3: running in his sight.
    if (s.whistle && los && d <= s.range && p.running && s.cool <= 0) {
      s.pre = PRE_WHISTLE;
      HW.audio?.sfx?.('whistle_breath', { x: e.x, y: e.y - 20 });
    }
    // Glimpse: seen once, then gone the moment she looks away.
    if (s.glimpse) {
      const vis = this._visibleToTess(e);
      if (vis) { s.seen = true; s.unseenT = 0; } else if (s.seen) {
        s.unseenT += dt;
        if (s.unseenT >= GLIMPSE_GONE) return false;
      }
    }
    return true;
  },

  _autoSpawn(map) {
    const cfg = this.cfg;
    if (!cfg || !map || !cfg.maps.includes(map.id) || this.dismissed) return;
    if (Math.random() > (cfg.chance ?? 1)) return;
    const spots = map.patrol?.kevin || map.data?.kevin || [];
    const v = HW.camera?.view;
    const ok = [];
    for (const sp of spots) {
      const x = sp[0] * TILE + 8;
      const y = sp[1] * TILE + 12;
      const onScreen = v && x > v.x - 16 && x < v.x + v.w + 16 && y > v.y - 8 && y < v.y + v.h + 40;
      if (!onScreen) ok.push(sp);
    }
    if (!ok.length) return; // never visible at load
    const sp = ok[Math.floor(Math.random() * ok.length)];
    this.spawn('kevin', { at: [sp[0], sp[1]], dir: sp[2] || 'down' });
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    const reset = () => {
      this.sentinels.length = 0;
      this.dismissed = false;
      const c = HW.state?.patrolCfg;
      this.cfg = c && Array.isArray(c.maps) ? { ...c, maps: [...c.maps] } : null;
    };
    HW.game.on('newGame', reset);
    HW.game.on('load', reset);
  },

  onMapLoad(map) {
    this._hook();
    // The engine despawned every NPC; sentinels are per map load.
    this.sentinels.length = 0;
    if (!this.cfg && HW.state?.patrolCfg) this.cfg = { ...HW.state.patrolCfg };
    this._autoSpawn(map);
  },

  update(dt) {
    this._hook();
    if (!this.sentinels.length) return;
    const free = inFreePlay();
    for (let i = this.sentinels.length - 1; i >= 0; i--) {
      const s = this.sentinels[i];
      if (!this._update(s, dt, free)) {
        this.sentinels.splice(i, 1);
        if (HW.entities.get(s.id) === s.entity) HW.entities.despawn(s.id);
      }
    }
  },
};

export default patrol;
