// HW.periods — class periods (DESIGN §4.1, CONTENT §5.2, rule R1).
//
// Sequence: intercom crackle → two-tone chime (a semitone lower per act) → 10 s → the bell (free
// periods: short + distant; scripted: the full school bell) → `period` lights stutter on +
// `period_buzz` layer + 207's computers on → the Colonel emerges from a wall seam ≥ 12 tiles away,
// out of view (maps with `patrol`; elsewhere overhead footsteps and dust) → patrol → the period ends
// 10 s after he has peeked into the room where Tess is seated, or at `length` (60 s) → dismissal
// bell → he sinks back into the walls → lights die → hall clocks snap back to 1:40.
//
// API
//   enable({ maps, passing = 150, length = 60, max = 3 })  free periods on these map ids (chapters.js);
//                                       persisted in HW.state.periodsCfg so a reload keeps them.
//   disable({ end = false })            stop scheduling (end: also dismiss a running period).
//   start(opts) → Promise               start a period now; resolves at the bell (true) or false if it
//                                       could not start. opts:
//       scripted   false  script-driven: full bell, no auto Colonel, no auto end (unless `length`)
//       guided     false  Ch3 tutorial: full bell, waits for Tess to sit, auto Colonel
//       length     60     seconds of period (null = until end())
//       warning    true   crackle + chime + 10 s countdown (false = straight to the bell)
//       countdown  10     seconds from the chime to the bell
//       waitSeated false  hold the bell until Tess is seated (max `waitMax` = 45 s); guided → true
//       colonel    !scripted  spawn the Colonel at a fold when the bell rings (needs map.patrol)
//       reason     'manual'  tag ('auto' | 'whistle' | …); 'whistle' marks Tess as reported (R3)
//   end() → Promise                     dismissal now (cancels a pending warning); resolves when the
//                                       lights are out.
//   forceWarning(reason = 'whistle')    Kevin: a standard warning right now (if periods are enabled
//                                       on this map; a whistle ignores the chapter's max — the cap is for
//                                       the schedule). → bool
//   notePeek(roomId)                    the Colonel took attendance in a room (early end if Tess sits there)
//   active (bell → dismissal) · warning · phase ('idle'|'warning'|'active'|'dismissal') · enabled ·
//   config · length (s, 0 = open-ended) · timeLeft (s) · count (free periods this chapter) ·
//   reportedBy ('kevin' | null) · scripted
//   clockTime() → hours (1.6667 = 1:40): 1:40→1:45 over passing time, 1:45→1:46 during a period,
//                 1:40 otherwise; + clockBias minutes (the long hall adds a minute per loop).
//   onWarning(fn) / onStart(fn) / onEnd(fn) → off()   hooks; HW.game also emits 'periodWarning',
//                                       'periodStart', 'periodEnd' (with the period's opts).
//
// Guards (DESIGN §4.1): free warnings never start within 20 s of a map load, or while a cutscene,
// dialogue, document or menu is up, or during a chase; passing time only runs in free play on an
// enabled map, and not in a chapter's lull window (chapters.js `periodsLull`: Ch5's compact lull on west2,
// adair_met → false_leah_done; passing time restarts after it). Followers walk to a free seat in Tess's
// room on the warning (never the one nearest her) and stand up at dismissal. Holding Confirm while seated
// fast-forwards ×4 (engine-side, via hiding.js, which reads `active` and HW.colonel.peeking).
import HW from '../engine/hw.js';
import colonel from './colonel_ai.js';
import { chapterConfig } from './chapters.js';

const TILE = 16;
const COUNTDOWN = 10;
const EARLY_END = 10;
const LOAD_GUARD = 20;
const SPAWN_DELAY = 2.4;        // s after the bell: tubes stutter on, then he pours out of a seam
const MIDPERIOD_SPAWN = 6;      // entering a patrol map mid-period
const DISMISS_LIGHTS = 1.3;     // s from the dismissal bell to the lights dying
const CLOCK_PASS = 1 + 40 / 60;
const CLOCK_BELL = 1 + 45 / 60;
const DEFAULTS = { maps: [], passing: 150, length: 60, max: 3 };
const CLOCK_TYPES = new Set(['clock_hall', 'clock_wall']);

const act = (ch) => (ch <= 2 ? 1 : ch <= 5 ? 2 : 3);

/**
 * Free play: no cutscene, dialogue, document, menu or transfer. Shared by every system, so it is
 * evaluated once per fixed step (the UI's busy check is not free).
 */
const freeMemo = { step: -1, v: false };
export function inFreePlay() {
  const g = HW.game;
  if (!g) return false;
  if (freeMemo.step === g.steps) return freeMemo.v;
  let v = g.mode === 'play' && !g.transferring && !HW.scripts?.blocking;
  if (v) { try { v = !HW.ui?.isBusy?.(); } catch { v = true; } }
  freeMemo.step = g.steps;
  freeMemo.v = v;
  return v;
}

export const periods = {
  phase: 'idle',
  cfg: null,
  count: 0,
  clockBias: 0,
  reportedBy: null,
  _opts: null,
  _passT: 0,            // passing time accumulated toward the next free warning
  _sinceLoad: 0,
  _t: 0,                // time in the current phase
  _waitT: 0,            // bell held for Tess to sit
  _earlyT: Infinity,    // countdown to the early end (attendance taken in Tess's room)
  _spawnT: -1,          // countdown to the Colonel's emergence
  _overT: 0,            // overhead footsteps timer (maps without a patrol graph)
  _noRespawn: false,    // a chase ended by a map transfer: he waits for the next bell
  _bellWaiters: [],
  _endWaiters: [],
  _hooks: { warning: new Set(), start: new Set(), end: new Set() },
  _clocks: [],
  _computers: [],
  _seated: [],          // followers seated by the warning
  _hooked: false,

  get enabled() { return !!this.cfg; },
  get config() { return this.cfg ? { ...this.cfg, maps: [...this.cfg.maps] } : null; },
  get active() { return this.phase === 'active'; },
  get warning() { return this.phase === 'warning'; },
  get scripted() { return !!this._opts?.scripted; },

  /** Length (s) of the running period; 0 when idle or open-ended (scripted). The HUD clock reads it. */
  get length() {
    return this.phase === 'active' || this.phase === 'dismissal' ? (this._opts?.length || 0) : 0;
  },

  get timeLeft() {
    if (this.phase === 'warning') return Math.max(0, (this._opts?.countdown ?? COUNTDOWN) - this._t);
    if (this.phase !== 'active') return 0;
    let left = this._opts?.length ? Math.max(0, this._opts.length - this._t) : Infinity;
    left = Math.min(left, Math.max(0, this._earlyT));
    return left;
  },

  // ------------------------------------------------------------------------------ configuration
  enable(cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg, maps: [...(cfg.maps || DEFAULTS.maps)] };
    if (HW.state) HW.state.periodsCfg = { ...this.cfg, maps: [...this.cfg.maps] };
    this._passT = 0;
    this.count = this._chapterCount();
    return this.config;
  },

  disable({ end = false } = {}) {
    this.cfg = null;
    if (HW.state) HW.state.periodsCfg = null;
    if (end && this.phase !== 'idle') return this.end();
    return Promise.resolve();
  },

  _countKey() { return `periods_ch${HW.state?.chapter ?? 0}`; },
  _chapterCount() { return Number(HW.state?.flags?.[this._countKey()]) || 0; },

  /** The free-period schedule applies to the current map. */
  _mapEnabled() {
    return !!this.cfg && !!HW.map && this.cfg.maps.includes(HW.map.id);
  },

  /** A chapter lull window (chapters.js `periodsLull`) holds the schedule on this map right now. */
  _lull() {
    const s = HW.state;
    const lulls = s && chapterConfig(s.chapter ?? 0).periodsLull;
    if (!lulls || !HW.map) return false;
    const f = s.flags || {};
    return lulls.some((w) => w.maps.includes(HW.map.id) && (!w.after || f[w.after]) && !(w.until && f[w.until]));
  },

  // ------------------------------------------------------------------------------ hooks
  onWarning(fn) { this._hooks.warning.add(fn); return () => this._hooks.warning.delete(fn); },
  onStart(fn) { this._hooks.start.add(fn); return () => this._hooks.start.delete(fn); },
  onEnd(fn) { this._hooks.end.add(fn); return () => this._hooks.end.delete(fn); },
  _fire(kind) {
    const opts = this._opts ? { ...this._opts } : {};
    for (const fn of this._hooks[kind]) {
      try { fn(opts); } catch (e) { console.error(`[periods] ${kind} hook failed`, e); }
    }
    const ev = kind === 'warning' ? 'periodWarning' : kind === 'start' ? 'periodStart' : 'periodEnd';
    HW.game?.emit?.(ev, opts);
    HW.debug?.record?.('period', null, null, `${kind}:${opts.reason || ''}`);
  },

  // ------------------------------------------------------------------------------ control
  /** Start a period (see header). Resolves true at the bell, false if it couldn't start. */
  start(opts = {}) {
    if (this.phase === 'warning' || this.phase === 'active') {
      return this.phase === 'active' ? Promise.resolve(true) : new Promise((r) => this._bellWaiters.push(r));
    }
    if (this.phase === 'dismissal') this._finishDismissal();
    const scripted = !!opts.scripted;
    const guided = !!opts.guided;
    this._opts = {
      scripted,
      guided,
      length: opts.length !== undefined ? opts.length : (scripted ? null : (this.cfg?.length ?? DEFAULTS.length)),
      warning: opts.warning !== false,
      countdown: opts.countdown ?? COUNTDOWN,
      waitSeated: opts.waitSeated ?? guided,
      waitMax: opts.waitMax ?? 45,
      colonel: opts.colonel ?? !scripted,
      reason: opts.reason || 'manual',
      bell: opts.bell || (scripted || guided ? 'full' : 'short'),
    };
    this.reportedBy = this._opts.reason === 'whistle' ? 'kevin' : null;
    this._t = 0;
    this._waitT = 0;
    this._earlyT = Infinity;
    this._spawnT = -1;
    this._noRespawn = false;
    const bell = new Promise((r) => this._bellWaiters.push(r));
    if (this._opts.warning) {
      this.phase = 'warning';
      this._warningSounds();
      this._seatFollowers();
      this._fire('warning');
    } else {
      this._ring();
    }
    return bell;
  },

  /** Dismissal now; resolves when the lights are out. */
  end() {
    if (this.phase === 'idle') return Promise.resolve();
    const p = new Promise((r) => this._endWaiters.push(r));
    if (this.phase === 'warning') {
      // Never rang: just stand everyone down.
      this._resolve(this._bellWaiters, false);
      this._finishDismissal();
      return p;
    }
    if (this.phase === 'active') this._dismiss();
    return p;
  },

  /** A standard warning right now (Kevin's whistle). */
  forceWarning(reason = 'whistle') {
    if (this.phase !== 'idle' || !this._mapEnabled()) return false;
    if (reason !== 'whistle' && this.count >= this.cfg.max) return false;
    if (HW.scripts?.blocking) return false;
    this._countFree();
    this.start({ reason });
    return true;
  },

  /** The Colonel peeked into a room: if Tess sits in it, attendance is taken → end 10 s later. */
  notePeek(roomId) {
    if (this.phase !== 'active' || this._earlyT !== Infinity) return;
    const p = HW.player;
    const room = p && HW.map?.roomAt(p.x, p.y);
    if (p?.seated && room && room.id === roomId) this._earlyT = EARLY_END;
  },

  _countFree() {
    this.count = this._chapterCount() + 1;
    if (HW.state) HW.state.flags[this._countKey()] = this.count;
  },

  _resolve(list, v) {
    const ws = list.splice(0);
    for (const r of ws) r(v);
  },

  // ------------------------------------------------------------------------------ sequence
  _warningSounds() {
    const a = HW.audio;
    a?.sfx?.('intercom_crackle');
    a?.sfx?.('intercom_chime', { rate: 2 ** (-(act(HW.state?.chapter ?? 0) - 1) / 12), delay: 0.55 });
  },

  _ring() {
    this.phase = 'active';
    this._t = 0;
    const a = HW.audio;
    if (this._opts.bell === 'full') a?.sfx?.('school_bell');
    else {
      // Free-period bells are distant: placed down the hall, low-passed by distance/occlusion.
      const p = HW.player;
      a?.sfx?.('bell_short', p ? { x: p.x + (p.x < (HW.map?.pw || 0) / 2 ? 260 : -260), y: p.y - 24 } : {});
    }
    HW.lighting?.setGroup?.('period', true);
    a?.layer?.('period_buzz', true, 1.5);
    this._setComputers(true);
    if (this._opts.colonel && HW.map?.patrol) this._spawnT = SPAWN_DELAY;
    this._overT = 3;
    this._resolve(this._bellWaiters, true);
    this._fire('start');
  },

  _dismiss() {
    this.phase = 'dismissal';
    this._t = 0;
    const a = HW.audio;
    if (this._opts?.bell === 'full') a?.sfx?.('school_bell');
    else {
      const p = HW.player;
      a?.sfx?.('bell_short', p ? { x: p.x + (p.x < (HW.map?.pw || 0) / 2 ? 260 : -260), y: p.y - 24 } : {});
    }
    this._spawnT = -1;
    colonel.dismiss();
  },

  _finishDismissal() {
    HW.lighting?.setGroup?.('period', false);
    HW.audio?.layer?.('period_buzz', false, 1.2);
    this._setComputers(false);
    this._standFollowers();
    const opts = this._opts;
    this.phase = 'idle';
    this._passT = 0;
    this._earlyT = Infinity;
    this._spawnT = -1;
    this.reportedBy = null;
    this._opts = opts; // keep for the end hooks
    this._fire('end');
    this._opts = null;
    this._resolve(this._endWaiters, true);
  },

  /** Back to nothing, instantly (new game, load, game over). */
  reset() {
    this._resolve(this._bellWaiters, false);
    this._resolve(this._endWaiters, false);
    this.phase = 'idle';
    this._opts = null;
    this._t = 0;
    this._passT = 0;
    this._earlyT = Infinity;
    this._spawnT = -1;
    this.reportedBy = null;
    this.clockBias = 0;
    this._seated.length = 0;
    HW.lighting?.setGroup?.('period', null, { mode: 'instant' });
    HW.audio?.layer?.('period_buzz', false, 0.2);
    this._setComputers(false);
    const cfg = HW.state?.periodsCfg;
    this.cfg = cfg && Array.isArray(cfg.maps) ? { ...DEFAULTS, ...cfg, maps: [...cfg.maps] } : null;
    this.count = this._chapterCount();
  },

  // ------------------------------------------------------------------------------ followers
  /** Followers sit on the chime: a free seat in Tess's room (never the one nearest her). */
  _seatFollowers() {
    const fs = HW.entities?.followers;
    const p = HW.player;
    const map = HW.map;
    if (!fs?.length || !p || !map || !HW.hiding?.seatNpc) return;
    const room = map.roomAt(p.x, p.y);
    const inRoom = room && room.kind !== 'hall' && room.kind !== 'stair';
    const free = [];
    for (const q of map.props) {
      if (!q.def.seat || q.seatedBy || q.state === 'occupied' || q.inst.noSit) continue;
      const cx = (q.x + q.w / 2) * TILE;
      const cy = (q.y + q.h / 2) * TILE;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (inRoom ? map.roomAt(cx, cy)?.id !== room.id : d > 12 * TILE) continue;
      free.push({ q, d });
    }
    free.sort((a, b) => a.d - b.d);
    if (free.length > 1) free.shift(); // keep the nearest seat for Tess
    for (const f of fs) {
      if (f.seat) continue;
      let best = null;
      let bestD = Infinity;
      for (const s of free) {
        if (s.q.seatedBy) continue;
        const d = Math.hypot((s.q.x + 0.5) * TILE - f.x, (s.q.y + 0.5) * TILE - f.y);
        if (d < bestD) { bestD = d; best = s.q; }
      }
      if (!best) continue; // no seat: they stay at her side (the caterpillar stops when she does)
      this._seated.push(f);
      HW.hiding.seatNpc(f, best, { run: true }).then((ok) => {
        if (!ok) { const i = this._seated.indexOf(f); if (i >= 0) this._seated.splice(i, 1); }
      });
    }
  },

  _standFollowers() {
    for (const f of this._seated) {
      if (f.path) f.stopPath(false);
      HW.hiding?.unseatNpc?.(f);
    }
    this._seated.length = 0;
  },

  // ------------------------------------------------------------------------------ props
  _scanProps(map) {
    this._clocks.length = 0;
    this._computers.length = 0;
    if (!map) return;
    for (const p of map.props) {
      if (CLOCK_TYPES.has(p.type)) this._clocks.push(p);
      else if (p.type === 'computer_desk') this._computers.push(p);
    }
  },

  _setComputers(on) {
    const map = HW.map;
    if (!map) return;
    for (const p of this._computers) {
      if (!p.present) continue;
      const want = on ? 'on' : 'off';
      if (p.state !== want) map.setPropState(p.id, want, null, { persist: false });
    }
  },

  clockTime() {
    let h = CLOCK_PASS;
    if (this.phase === 'active' || this.phase === 'dismissal') {
      const len = this._opts?.length || 60;
      h = CLOCK_BELL + Math.min(1, this._t / len) / 60;
      if (this.phase === 'dismissal') h = CLOCK_BELL + 1 / 60;
    } else if (this.phase === 'warning') {
      h = CLOCK_BELL - (1 - Math.min(1, this._t / (this._opts?.countdown || COUNTDOWN))) / 60;
    } else if (this.cfg && this._mapEnabled()) {
      h = CLOCK_PASS + (5 * Math.min(1, this._passT / this.cfg.passing)) / 60;
    }
    return h + this.clockBias / 60;
  },

  _updateClocks() {
    if (!this._clocks.length) return;
    const t = this.clockTime();
    for (const p of this._clocks) {
      // Dynamic props read params on every draw; only write when the minute hand would move.
      const d = p.dparams;
      if (!d || (typeof d.time === 'number' && Math.abs(d.time - t) < 1 / 240)) continue;
      d.time = t;
      if (p.params) p.params.time = t;
    }
  },

  // ------------------------------------------------------------------------------ system
  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('newGame', () => this.reset());
    HW.game.on('load', () => { this.reset(); this._scanProps(HW.map); });
    HW.game.on('gameOver', () => this.reset());
    HW.game.on('chapter', () => { this.count = this._chapterCount(); });
  },

  onMapLoad(map) {
    this._hook();
    this._sinceLoad = 0;
    this._scanProps(map);
    if (this.phase === 'active') {
      this._setComputers(true);
      if (this._opts?.colonel && map?.patrol && !this._noRespawn) this._spawnT = MIDPERIOD_SPAWN;
      else this._spawnT = -1;
      this._overT = 2;
    }
    if (this.phase === 'warning' || this.phase === 'active') setTimeout0(() => this._reseat());
    this._updateClocks();
  },

  /** Followers re-created by a transfer mid-warning/period sit again near Tess. */
  _reseat() {
    if (this.phase !== 'warning' && this.phase !== 'active') return;
    this._seated = this._seated.filter((f) => HW.entities?.list?.includes(f) && f.seat);
    this._seatFollowers();
  },

  update(dt) {
    this._hook();
    this._sinceLoad += dt;
    const free = inFreePlay();
    switch (this.phase) {
      case 'idle':
        if (this._mapEnabled() && free && this.count < this.cfg.max) {
          if (this._lull()) { this._passT = 0; break; } // apparent safety; the clock restarts after it
          this._passT += dt;
          if (this._passT >= this.cfg.passing && this._sinceLoad >= LOAD_GUARD && colonel.mode !== 'chase') {
            this._countFree();
            this.start({ reason: 'auto' });
          }
        }
        break;
      case 'warning': {
        // Scripted warnings run through cutscenes; free ones pause while a scene is up.
        if (!free && !this._opts.scripted && !this._opts.guided) break;
        this._t += dt;
        if (this._t >= this._opts.countdown) {
          const seated = !!HW.player?.seated;
          if (this._opts.waitSeated && !seated && this._waitT < this._opts.waitMax) { this._waitT += dt; break; }
          this._ring();
        }
        break;
      }
      case 'active': {
        const runs = free || this._opts.scripted || this._opts.guided || colonel.mode === 'scripted';
        if (runs) {
          this._t += dt;
          this._earlyT -= dt;
        }
        if (this._spawnT >= 0 && free) {
          this._spawnT -= dt;
          if (this._spawnT < 0 && !colonel.entity) {
            if (!colonel.spawnPeriod()) this._overT = 1;
          }
        }
        if (!HW.map?.patrol || !this._opts.colonel) this._overhead(dt, free);
        const len = this._opts.length;
        if ((len && this._t >= len) || this._earlyT <= 0) this._dismiss();
        break;
      }
      case 'dismissal':
        this._t += dt;
        if (this._t >= DISMISS_LIGHTS) this._finishDismissal();
        break;
      default:
        break;
    }
    this._updateClocks();
  },

  /** He's on another floor: heavy steps overhead and dust sifting down (maps without a patrol graph). */
  _overhead(dt, free) {
    if (!free || !this._opts?.colonel) return;
    this._overT -= dt;
    if (this._overT > 0) return;
    this._overT = 3.5 + Math.random() * 4;
    const p = HW.player;
    if (!p) return;
    const ox = (Math.random() - 0.5) * 160;
    HW.audio?.sfx?.('footstep_heavy_above', { x: p.x + ox, y: p.y - 40, vol: 0.9 });
    HW.audio?.sfx?.('dust_fall', { x: p.x + ox * 0.5, y: p.y - 30, delay: 0.25, vol: 0.6 });
    HW.fx?.emit?.('dust', p.x + ox * 0.4, p.y - 70, 8);
  },
};

// Microtask helper (no timers in the fixed-step loop): run after the current map load finishes.
function setTimeout0(fn) {
  Promise.resolve().then(fn).catch((e) => console.error('[periods] deferred task failed', e));
}

export default periods;
