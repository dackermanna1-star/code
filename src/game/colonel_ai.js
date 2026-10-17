// HW.colonel — the Colonel (DESIGN §4.1, §5; CONTENT §5.1, §5.3).
//
// One entity (id 'colonel', sprite 'colonel'), driven by a per-step state machine plus a small
// action queue (walk / wait / scan / anim / call) that both the autonomous planner and scripts use.
//
// MODES  off · patrol · investigate · chase · search · scripted · assembly · escape · sleep
//   patrol      periods: walks the map's patrol graph; peeks into rooms (no room twice per period,
//               ≤ 3 peeks), escalating by chapter: Ch≤3 'shadow' (pauses outside the door window),
//               Ch4 'doorway' (opens the door, the coat fills the doorway, "hm?"), Ch5+ 'step' (steps
//               in and drags along one row). A peek into the room where Tess sits takes attendance
//               (HW.periods ends 10 s later).
//   investigate walks to a noise he heard (HW.noise), looks around, resumes.
//   chase       the lurch: drag 30 px/s, then a 150 px/s lunge for 0.5 s every 1.4 s (≈ 73 px/s avg —
//               walking loses, running wins). Loses her after 3 s without line of sight → search.
//   search      goes to where she was last seen, looks around; checks a seat only if he saw her sit.
//   scripted    scripts drive him (walkTo / anim / face / peekInto / lunge); no vision unless
//               setMode('scripted', { vision: true }).
//   assembly    stands at the lectern; HW.assembly toggles `assemblyScan`; seated = safe at once.
//   escape      relentless pursuit with a rubber band keeping Tess 4–8 tiles ahead while she moves
//               well; `cannotCatch` for the PRESENT escape (HW.chase drives the per-map flow).
//   sleep       in the coal heap (no entity; the heap prop shows him); rise() wakes him into a chase.
//
// VISION 100° cone around his look angle, 7 tiles (10 if Tess's flashlight is on or
//   lightAt(Tess) > 0.45), line of sight through opaque cells. Detection/s = lerp(2.0 at ≤ 2 tiles,
//   0.5 at the range edge) × 1.5 moving × 2 running × 1.5 lit (÷ HW.state.assist); decays 0.4/s unseen.
//   Cue at 0.35 (soft "hm?", breath catch, vignette tightens; he stops and stares). At 1.0 →
//   "Who is out of their seat?" (first time per chapter) + 0.8 s notice → chase.
//   SEATED + STILL = INVISIBLE, unless he saw her sit in the last 1.5 s (sitting in his view counts
//   as moving — then he also comes to check that seat); seated but not still within 4 tiles fills.
// HEARING HW.noise events within their radius (walls muffle) → investigate. Noises made by NPCs
//   (doors opened by followers) are ignored; Kevin's whistle marks Tess as reported ('running').
// CATCH within 14 px → reach + colonel_grab → HW.game.gameOver(reason): 'hall_after_bell' (hall),
//   'out_of_seat' (rooms, assembly), 'running' (reported by Kevin), 'woke' (basement), 'chase'
//   (the Ch8 escape) — or `reason` if a script/chase set one. Respects HW.debug.god and cannotCatch.
// SHROUD `shrouded` is true while he is on the map until flag ch6_gym_lights (override: `shroud`
//   true/false/null). The renderer draws him near-black with brass/gold/crimson glints; lighting
//   kills `period` lights within 3.5 tiles of `entity` (recovering 1 s after he passes).
// CLOSE PASS within 1 tile of a seated, still Tess: 2.5 s micro-beat (vignette closes, breath beside
//   her, his hand rests on the next desk); no input lock.
// AUDIO positional breath loop following him (fast in a chase), dragging footsteps (id 'colonel'),
//   medal jingle, "hm"; doors he opens creak (door_creak_slow) and he closes them behind his peeks.
//
// API (all promise-returning calls resolve true when done, false if interrupted)
//   spawn(at = 'fold', { mode = 'scripted', anim = 'emerge' | 'idle' | null, dir, vision }) → Promise<entity>
//        at: anchor | [tx,ty] | {x,y} | 'fold' (a seam ≥ 12 tiles from Tess, out of view) | 'fold:<i>'
//   despawn({ sink = true }) → Promise         sink back into the floor/walls
//   setMode(mode, opts)                        'scripted' | 'patrol' | 'off' … (opts.vision for scripted)
//   walkTo(target, { speed = 26, run, lunge, doors = true }) → Promise   (run = 30 px/s chase drag)
//   anim(name, { once, hold }) → Promise · face(dirOrTarget) · lunge(target, { speed = 150 }) → Promise
//   peekInto(roomIdOrPeek, { style }) → Promise   style 'shadow' | 'doorway' | 'step' (default by chapter)
//   investigate(x, y) · chase({ reason, track, style }) · search(x, y) · catch(reason)
//   sleep(at) · rise({ at, reason = 'woke' }) → Promise · escape({ cannotCatch, rubber }) · assembly({ at })
//   closePass() → Promise                      play the micro-beat now (scripted scenes)
//   spawnPeriod() → bool · dismiss()           used by HW.periods
//   fields: mode, entity, x, y, shrouded, shroud, peeking, detection, cannotCatch, reason, peekStyle,
//           vision, assemblyScan, lastCatch, log (recent events), state() (debug snapshot)
//   on(ev, fn) → off   events: spawn, cue, notice, chase, lunge, lost, search, hear, peek, closePass,
//                       catch, despawn, huntEnd
import HW from '../engine/hw.js';
import { dirFromVec, resolvePoint } from '../engine/entities.js';
import noise from './noise.js';
import periods, { inFreePlay } from './periods.js';

const TILE = 16;
// CONTENT §5.1
const DRAG = 26;
const CHASE_BASE = 30;
const LUNGE = 150;
const LUNGE_T = 0.5;
const LUNGE_EVERY = 1.4;
const HALF_CONE = (50 * Math.PI) / 180;
const RANGE_DARK = 7 * TILE;
const RANGE_LIT = 10 * TILE;
const LIT_LEVEL = 0.45;
const RATE_NEAR = 2.0;
const RATE_FAR = 0.5;
const NEAR = 2 * TILE;
const DECAY = 0.4;
const CUE = 0.35;
const CUE_RESET = 0.15;
const NOTICE = 0.8;
const CATCH_R = 14;
const SIT_GRACE = 1.5;
const SEATED_MOVE_R = 4 * TILE;
// Behaviour tuning
const CHASE_SIGHT = 14 * TILE;    // once hunting he tracks her in any direction (line of sight)
const LOSE_T = 3;                 // s without sight → search
const REPATH = 0.3;
const MIN_FOLD = 12 * TILE;
const MAX_PEEKS = 3;
const CLOSE_R = 22;
const CLOSE_FX = 2.5;
const STRIDE = 22;
const EYE = 10;                   // px above the feet for sight lines
const ASSEMBLY_RANGE = 30 * TILE;
const POUNCE = 220;
const AUTONOMOUS = new Set(['patrol', 'investigate', 'search']);
const VISION = new Set(['patrol', 'investigate', 'search']);
const PERIOD_MODES = new Set(['patrol', 'investigate', 'search', 'chase']);

// Interned animation names (no string building per frame).
const DIRS = ['up', 'down', 'left', 'right'];
const AN = {};
for (const b of ['idle', 'drag', 'lunge', 'peek', 'reach']) {
  AN[b] = {};
  for (const d of DIRS) AN[b][d] = `${b}_${d}`;
}

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const DIR_ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const angToDir = (a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.abs(c) >= Math.abs(s) ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'down' : 'up');
};
const cellPt = (tx, ty) => ({ x: tx * TILE + 8, y: ty * TILE + 12 });

export const colonel = {
  mode: 'off',
  entity: null,
  detection: 0,
  peeking: false,
  cannotCatch: false,
  reason: null,
  peekStyle: null,      // null = by chapter
  shroud: null,         // null = automatic
  vision: false,        // scripted-mode vision
  assemblyScan: false,
  lastCatch: null,
  look: Math.PI / 2,
  log: [],
  _q: [],
  _hooks: new Map(),
  _breath: null,
  _breathId: null,
  _stride: 0,
  _jingleT: 5,
  _dragT: 3,
  _litT: 0,
  _lit: false,
  _cue: false,
  _stare: false,
  _noticeT: -1,
  _lastSeen: { x: 0, y: 0, t: -99 },
  _sawSeat: null,
  _reported: false,
  _woke: false,
  _home: null,
  _peeked: new Set(),
  _peeks: 0,
  _legs: 0,
  _node: null,
  _prevNode: null,
  _graph: null,
  _heldDoor: null,
  _closeAt: -99,
  _closeFxT: -1,
  _godT: 0,
  _c: null,             // chase state
  _hooked: false,
  _sleepAt: null,

  // ------------------------------------------------------------------------------ getters
  get x() { return this.entity ? this.entity.x : (this._sleepAt ? this._sleepAt.x : NaN); },
  get y() { return this.entity ? this.entity.y : (this._sleepAt ? this._sleepAt.y : NaN); },
  get shrouded() {
    if (!this.entity || !this.entity.visible) return false;
    if (this.shroud !== null) return !!this.shroud;
    return !HW.state?.flags?.ch6_gym_lights;
  },
  get spawned() { return !!this.entity; },

  /** Debug snapshot. */
  state() {
    return {
      mode: this.mode, x: this.x, y: this.y, detection: this.detection, peeking: this.peeking,
      peeks: this._peeks, peeked: [...this._peeked], queue: this._q.map((a) => a.type), shrouded: this.shrouded,
      lunging: !!this._c?.lunging, reason: this.reason, cannotCatch: this.cannotCatch, look: this.look,
    };
  },

  // ------------------------------------------------------------------------------ events
  on(ev, fn) {
    if (!this._hooks.has(ev)) this._hooks.set(ev, new Set());
    this._hooks.get(ev).add(fn);
    return () => this._hooks.get(ev)?.delete(fn);
  },
  _emit(ev, data) {
    const entry = { t: Math.round(HW.time * 1000) / 1000, ev, ...(data || {}) };
    this.log.push(entry);
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
    HW.debug?.record?.('colonel', null, null, data?.info ? `${ev}:${data.info}` : ev);
    const set = this._hooks.get(ev);
    if (set) for (const fn of set) { try { fn(entry); } catch (e) { console.error(`[colonel] ${ev} hook failed`, e); } }
  },

  // ------------------------------------------------------------------------------ spawning
  _spawnEntity(pt, dir = 'down') {
    if (this.entity) this._removeEntity();
    const e = HW.entities.spawn({ id: 'colonel', sprite: 'colonel', px: pt.x, py: pt.y, dir, solid: false });
    e.shadow = true;
    this.entity = e;
    this.look = DIR_ANG[dir] ?? Math.PI / 2;
    this.detection = 0;
    this._cue = false;
    this._stare = false;
    this._noticeT = -1;
    this._stride = 0;
    this._startBreath('colonel_breath');
    return e;
  },

  _removeEntity() {
    const e = this.entity;
    this.entity = null;
    this.peeking = false;
    this._stopBreath();
    if (e && HW.entities.get('colonel') === e) HW.entities.despawn('colonel');
  },

  _startBreath(id) {
    if (this._breathId === id && this._breath) return;
    this._stopBreath();
    const e = this.entity;
    const pt = e || this._sleepAt;
    if (!pt) return;
    try {
      this._breath = HW.audio?.loop?.(id, { x: pt.x, y: pt.y - 20, vol: 0.9 }) || null;
      this._breathId = id;
    } catch (err) {
      console.error('[colonel] breath loop failed', err);
      this._breath = null;
    }
  },

  _stopBreath() {
    try { this._breath?.stop?.(0.6); } catch (err) { console.error('[colonel] breath stop failed', err); }
    this._breath = null;
    this._breathId = null;
  },

  /** Spawn for a period: a fold ≥ 12 tiles from Tess, out of view; emerge; patrol. */
  spawnPeriod() {
    const map = HW.map;
    if (!map?.patrol) return false;
    const pt = this._pickFold() || this._farthestNode();
    if (!pt) return false;
    this._clearQueue();
    this._spawnEntity(pt, 'down');
    this._resetPeriodMemory();
    this._home = 'period';
    this._reported = !!periods.reportedBy;
    this._woke = false;
    this.reason = null;
    this.mode = 'patrol';
    HW.audio?.sfx?.('colonel_sink', { x: pt.x, y: pt.y, rate: 0.85 });
    this._push({ type: 'anim', name: 'emerge', once: true });
    this._emit('spawn', { info: 'period', x: Math.round(pt.x), y: Math.round(pt.y) });
    return true;
  },

  /** Script spawn. */
  async spawn(at = 'fold', { mode = 'scripted', anim = 'emerge', dir = 'down', vision = false } = {}) {
    let pt = null;
    if (at === 'fold') pt = this._pickFold() || this._farthestNode();
    else if (typeof at === 'string' && at.startsWith('fold:')) {
      const f = HW.map?.patrol?.folds?.[Number(at.slice(5))];
      pt = f ? this._foldSpot(f) : null;
    } else pt = resolvePoint(at);
    if (!pt) { console.warn('[colonel] spawn: no spot for', at); return null; }
    this._clearQueue();
    const e = this._spawnEntity(pt, pt.dir && DIR_ANG[pt.dir] !== undefined ? pt.dir : dir);
    this._home = mode === 'patrol' ? 'period' : mode;
    if (mode === 'patrol') this._resetPeriodMemory();
    this.vision = !!vision;
    this.mode = mode;
    this.reason = null;
    this._emit('spawn', { info: typeof at === 'string' ? at : 'point' });
    if (anim === 'emerge') {
      HW.audio?.sfx?.('colonel_sink', { x: pt.x, y: pt.y, rate: 0.85 });
      await this._pushP({ type: 'anim', name: 'emerge', once: true });
    } else if (anim && anim !== 'idle') {
      await this._pushP({ type: 'anim', name: anim, once: false });
    }
    return e;
  },

  /** Sink and remove (or remove at once with { sink: false }). */
  despawn({ sink = true } = {}) {
    if (!this.entity) { this.mode = this.mode === 'sleep' ? 'sleep' : 'off'; return Promise.resolve(true); }
    this._endChase();
    this._clearQueue();
    this._closeHeldDoor();
    this.mode = 'off';
    this.peeking = false;
    this.assemblyScan = false;
    if (!sink) {
      this._removeEntity();
      this._emit('despawn');
      return Promise.resolve(true);
    }
    const e = this.entity;
    HW.audio?.sfx?.('colonel_sink', { x: e.x, y: e.y });
    this._push({ type: 'anim', name: 'sink', once: true });
    return this._pushP({ type: 'fn', fn: () => { this._removeEntity(); this._emit('despawn'); } });
  },

  /** Periods: the dismissal bell — he sinks back into the walls wherever he is. */
  dismiss() {
    if (!this.entity) return;
    if (PERIOD_MODES.has(this.mode) || (this.mode === 'scripted' && this._home === 'period')) this.despawn({ sink: true });
  },

  setMode(mode, opts = {}) {
    if (mode === this.mode && mode !== 'scripted') return;
    if (this.mode === 'chase' || this.mode === 'escape') this._endChase();
    this._clearQueue();
    this._stare = false;
    this._noticeT = -1;
    if (mode === 'scripted') this.vision = !!opts.vision;
    if (mode === 'patrol' && this._home !== 'period') { this._home = 'period'; this._resetPeriodMemory(); }
    if (mode === 'off' && this.entity) { this.despawn({ sink: opts.sink !== false }); return; }
    this.mode = mode;
  },

  _resetPeriodMemory() {
    this._peeked.clear();
    this._peeks = 0;
    this._legs = 0;
    this._node = null;
    this._prevNode = null;
    this._sawSeat = null;
  },

  // ------------------------------------------------------------------------------ action queue
  _push(a) { this._q.push(a); return a; },
  _pushP(a) {
    return new Promise((resolve) => { a.resolve = resolve; this._q.push(a); });
  },
  _clearQueue() {
    const q = this._q;
    this._q = [];
    for (const a of q) a.resolve?.(false);
    const e = this.entity;
    if (e && e.animOnce) e.clearAnim();
  },

  /** Run queued actions; instant ones complete in the same step. */
  _runQueue(dt) {
    let guard = 0;
    while (this._q.length && guard++ < 16) {
      const a = this._q[0];
      const r = this._runAction(a, dt);
      if (r === null) return;              // still running
      this._q.shift();
      a.resolve?.(r);
      if (r === false && a.strict) {
        // An autonomous plan whose walk can't be made: drop the rest of it and re-plan.
        a.onFail?.();
        this._closeHeldDoor();
        this.peeking = false;
        this._clearQueue();
        return;
      }
      dt = 0;
    }
  },

  /** → null while running, true/false when finished. */
  _runAction(a, dt) {
    const e = this.entity;
    switch (a.type) {
      case 'fn':
        a.fn();
        return true;
      case 'wait':
        if (e) { this._pose('idle'); e.moving = false; }
        a.t -= dt;
        return a.t <= 0 ? true : null;
      case 'scan': {
        if (!e) return true;
        e.moving = false;
        if (this._stare) return null;
        if (a.base === undefined) a.base = this.look;
        if (a.e === undefined) a.e = 0;
        a.e += dt;
        this.look = a.base + Math.sin((a.e / a.t) * Math.PI * 2) * (a.amp ?? 0.8);
        if (!a.keepPose) { const d = angToDir(this.look); if (d !== e.dir) e.face(d); this._pose('idle'); }
        return a.e >= a.t ? true : null;
      }
      case 'face':
        if (e) this._faceAngle(a.angle);
        return true;
      case 'anim': {
        if (!e) return true;
        if (!a.started) {
          a.started = true;
          const name = a.name;
          const sheet = e.sheet;
          if (!sheet?.anims?.[name]) return true; // missing art: skip
          e.playAnim(name, { once: !!a.once, hold: !!a.hold });
          return a.once ? null : true;
        }
        return e.animOnce && e.animName === a.name ? null : true;
      }
      case 'walk':
        return this._walkStep(a, dt);
      default:
        return true;
    }
  },

  _pushWalk(pt, { speed = DRAG, doors = true, anim = 'drag', strict = false } = {}) {
    return this._push({ type: 'walk', to: { x: pt.x, y: pt.y }, speed, doors, anim, strict, path: null, i: 0 });
  },

  _walkStep(a, dt) {
    const e = this.entity;
    const map = HW.map;
    if (!e || !map) return false;
    if (!a.path) {
      a.path = map.findPath([e.x, e.y], [a.to.x, a.to.y], { doors: a.doors });
      if (!a.path && !a.doors) a.path = map.findPath([e.x, e.y], [a.to.x, a.to.y], { doors: true });
      if (!a.path) {
        if (a.strict) return false;
        a.path = [[a.to.x, a.to.y]]; // scripts: straight line, like g.walk
      }
      a.i = 0;
      if (a.anim === 'lunge') this._lungeFx();
    }
    if (this._stare) { this._pose('idle'); return null; }
    const done = this._advance(a.path, a, a.speed * dt, a.anim);
    return done ? true : null;
  },

  /** Move along waypoints by `budget` px. Returns true on arrival. */
  _advance(path, st, budget, anim) {
    const e = this.entity;
    const map = HW.map;
    let moved = false;
    while (budget > 0.0001 && st.i < path.length) {
      const pt = path[st.i];
      const dx = pt[0] - e.x;
      const dy = pt[1] - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        e.dir = dirFromVec(dx, dy, e.dir, 1.1);
        this._turnToward(Math.atan2(dy, dx), 0.35);
        this._openAhead(map, dx / d, dy / d);
      }
      if (d <= budget) {
        e.x = pt[0];
        e.y = pt[1];
        budget -= d;
        st.i++;
        this._feet(d);
      } else {
        const k = budget / d;
        e.x += dx * k;
        e.y += dy * k;
        this._feet(budget);
        budget = 0;
      }
      moved = true;
    }
    e.moving = moved;
    if (moved) this._pose(anim === 'lunge' ? 'lunge' : 'drag');
    else this._pose('idle');
    return st.i >= path.length;
  },

  _turnToward(ang, k) {
    this.look = wrap(this.look + wrap(ang - this.look) * k);
  },

  _faceAngle(ang) {
    this.look = wrap(ang);
    const e = this.entity;
    if (e) e.face(angToDir(this.look));
  },

  _pose(base) {
    const e = this.entity;
    if (!e || e.animOnce) return;
    const name = AN[base][e.dir] || AN[base].down;
    if (e.animName !== name) { e.animHold = false; e.animName = name; }
  },

  /** Doors in his way open with a slow creak (silent to HW.noise: it's his own sound). */
  _openAhead(map, ux, uy) {
    const e = this.entity;
    const p = map.solidPropAt(Math.floor((e.x + ux * 10) / TILE), Math.floor((e.y + uy * 10 - 1) / TILE));
    if (p && p.def.interact === 'door' && p.state !== 'open' && map.doorPassable(p)) {
      HW.interact?.openDoor?.(p, { by: 'colonel', silent: true });
      HW.audio?.sfx?.('door_creak_slow', { x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE });
    }
  },

  _feet(d) {
    const e = this.entity;
    this._stride += d;
    if (this._stride < STRIDE) return;
    this._stride -= STRIDE;
    const map = HW.map;
    try {
      HW.audio?.footstep?.(map.surfaceAt(e.x, e.y), { x: e.x, y: e.y, id: 'colonel' });
    } catch (err) { console.error('[colonel] footstep failed', err); }
  },

  // ------------------------------------------------------------------------------ script API
  walkTo(target, { speed, run = false, lunge = false, doors = true } = {}) {
    const pt = resolvePoint(target);
    if (!pt || !this.entity) return Promise.resolve(false);
    const sp = speed ?? (lunge ? LUNGE : run ? CHASE_BASE : DRAG);
    return this._pushP({ type: 'walk', to: { x: pt.x, y: pt.y }, speed: sp, doors, anim: lunge ? 'lunge' : 'drag', path: null, i: 0 });
  },

  anim(name, { once = false, hold = false } = {}) {
    if (!this.entity) return Promise.resolve(false);
    if (!name) { this.entity.clearAnim(); return Promise.resolve(true); }
    return this._pushP({ type: 'anim', name, once, hold });
  },

  /** Face a direction, or toward an anchor / [tx,ty] / {x,y} / entity id ('tess'). */
  face(target) {
    const e = this.entity;
    if (!e) return;
    if (DIR_ANG[target] !== undefined) { this._faceAngle(DIR_ANG[target]); return; }
    let pt = null;
    if (typeof target === 'string' && HW.entities.get(target)) pt = resolvePoint(`@${target}`);
    else pt = resolvePoint(target);
    if (pt) this._faceAngle(Math.atan2(pt.y - e.y, pt.x - e.x));
  },

  /** One lurch toward a target (anchor / point / 'tess'). */
  lunge(target = 'tess', { speed = LUNGE } = {}) {
    const pt = target === 'tess' ? HW.player && { x: HW.player.x, y: HW.player.y } : resolvePoint(target);
    if (!pt || !this.entity) return Promise.resolve(false);
    return this._pushP({ type: 'walk', to: { x: pt.x, y: pt.y }, speed, doors: true, anim: 'lunge', path: null, i: 0 });
  },

  peekInto(target, { style } = {}) {
    const map = HW.map;
    if (!this.entity || !map) return Promise.resolve(false);
    let pk = target;
    if (typeof target === 'string') pk = (map.patrol?.peeks || []).find((k) => k.room === target);
    if (!pk || !pk.door) { console.warn('[colonel] peekInto: no peek for', target); return Promise.resolve(false); }
    if (!this._planPeek(pk, style || this._peekStyle())) return Promise.resolve(false);
    return this._pushP({ type: 'fn', fn: () => {} });
  },

  closePass() {
    this._closePassFx(false);
    return Promise.resolve(true);
  },

  investigate(x, y, kind = 'noise') {
    if (!this.entity) return;
    if (this.mode === 'chase' || this.mode === 'escape') return;
    this._clearQueue();
    this._closeHeldDoor();
    this.peeking = false;
    this._stare = false;
    this.mode = 'investigate';
    const e = this.entity;
    HW.audio?.sfx?.('colonel_hm', { x: e.x, y: e.y - 20, vol: 0.7 });
    this._push({ type: 'face', angle: Math.atan2(y - e.y, x - e.x) });
    this._push({ type: 'wait', t: 0.5 });
    const map = HW.map;
    const tgt = map?.isSolid(Math.floor(x / TILE), Math.floor(y / TILE)) ? this._nearFree(x, y) : { x, y };
    this._pushWalk(tgt, { speed: DRAG * 1.25, strict: true });
    this._push({ type: 'scan', t: 2.6, amp: 1.0 });
    this._push({ type: 'fn', fn: () => this._resume() });
    this._emit('hear', { info: kind, x: Math.round(x), y: Math.round(y) });
  },

  search(x, y) {
    if (!this.entity) return;
    this._endChase();
    this._clearQueue();
    this.mode = 'search';
    this._stare = false;
    const map = HW.map;
    const tgt = map?.isSolid(Math.floor(x / TILE), Math.floor(y / TILE)) ? this._nearFree(x, y) : { x, y };
    this._pushWalk(tgt, { speed: DRAG * 1.2, strict: true });
    this._push({ type: 'scan', t: 3, amp: 1.2 });
    this._push({ type: 'fn', fn: () => this._checkSeat() });
    this._emit('search', { x: Math.round(x), y: Math.round(y) });
  },

  /** He saw her sit: go and check that seat. */
  _checkSeat() {
    const seat = this._sawSeat;
    const p = HW.player;
    this._sawSeat = null;
    if (seat && p && p.seated === seat && this.entity) {
      this._pushWalk({ x: p.x, y: p.y + 10 }, { speed: DRAG * 1.3 });
      this._push({ type: 'fn', fn: () => {
        const q = HW.player;
        if (q && q.seated === seat && this._dist(q) < 40) this.catch();
        else this._resume();
      } });
      return;
    }
    this._emit('huntEnd');
    this._resume();
  },

  /** Back to the routine after an investigation or search. */
  _resume() {
    this._stare = false;
    if (!this.entity) return;
    if (periods.active && HW.map?.patrol && this._home === 'period') {
      this.mode = 'patrol';
      this._clearQueue();
      return;
    }
    if (this._home === 'scripted') { this.mode = 'scripted'; return; }
    this.despawn({ sink: true });
  },

  chase({ reason = null, track = false, style = 'lurch', rubber = null, cannotCatch = this.cannotCatch } = {}) {
    if (!this.entity) return;
    this._clearQueue();
    this._closeHeldDoor();
    this.peeking = false;
    this._stare = false;
    this._noticeT = -1;
    if (reason) this.reason = reason;
    this.cannotCatch = !!cannotCatch;
    this.mode = style === 'escape' ? 'escape' : 'chase';
    const p = HW.player;
    this._c = {
      t: 0, lunging: false, path: null, i: 0, pathT: 0, lost: 0, track: !!track, style, rubber,
      tx: p ? p.x : this.entity.x, ty: p ? p.y : this.entity.y,
    };
    if (p) { this._lastSeen.x = p.x; this._lastSeen.y = p.y; this._lastSeen.t = HW.time; }
    this._startBreath('colonel_breath_fast');
    this._emit(this.mode === 'escape' ? 'escape' : 'chase', { info: style });
  },

  escape({ cannotCatch = false, rubber = [4, 8] } = {}) {
    this.chase({ style: 'escape', track: true, rubber, cannotCatch, reason: 'chase' });
  },

  _endChase() {
    if (!this._c) return;
    this._c = null;
    if (this.entity) this._startBreath('colonel_breath');
  },

  sleep(at) {
    this._clearQueue();
    if (this.entity) this._removeEntity();
    this._endChase();
    const pt = resolvePoint(at);
    this._sleepAt = pt ? { x: pt.x, y: pt.y } : null;
    this.mode = 'sleep';
    this._home = 'sleep';
  },

  /** The sleeper rises (basement stir 2) and hunts. */
  async rise({ at, reason = 'woke', track = true } = {}) {
    const pt = (at && resolvePoint(at)) || this._sleepAt || (HW.player && { x: HW.player.x, y: HW.player.y });
    if (!pt) return false;
    this._clearQueue();
    this._spawnEntity(pt, 'down');
    this._home = 'sleep';
    this._woke = reason === 'woke';
    this.reason = reason;
    this.mode = 'scripted';
    HW.audio?.sfx?.('coal_slide', { x: pt.x, y: pt.y });
    this._startBreath('colonel_breath_fast');
    this._emit('rise');
    const ok = await this._pushP({ type: 'anim', name: 'rise', once: true });
    if (!ok || !this.entity) return false;
    this.chase({ reason, track });
    return true;
  },

  assembly({ at = 'lectern' } = {}) {
    const pt = resolvePoint(at);
    if (!pt) { console.warn('[colonel] assembly: no lectern anchor', at); return null; }
    this._clearQueue();
    if (!this.entity) this._spawnEntity(pt, 'down');
    else { this.entity.x = pt.x; this.entity.y = pt.y; this.entity.face('down'); }
    this._home = 'assembly';
    this.mode = 'assembly';
    this.reason = 'out_of_seat';
    this.assemblyScan = false;
    this.look = Math.PI / 2;
    this.entity.playAnim('lectern_down');
    this._emit('assembly');
    return this.entity;
  },

  /** Caught. Ends in HW.game.gameOver(reason) (suppressed in god mode / cannotCatch). */
  catch(reason = null) {
    const p = HW.player;
    const why = reason || this._reasonNow();
    if (this.cannotCatch) return false;
    if (HW.debug?.god) {
      this.lastCatch = { reason: why, t: HW.time, suppressed: true };
      this._emit('catch', { info: `${why} (god)` });
      this._godT = 2;
      if (this.mode === 'chase') this.search(this._lastSeen.x, this._lastSeen.y);
      return false;
    }
    this.lastCatch = { reason: why, t: HW.time, suppressed: false };
    this._endChase();
    this._clearQueue();
    this.mode = 'caught';
    const e = this.entity;
    if (e && p) {
      e.face(dirFromVec(p.x - e.x, p.y - e.y, e.dir));
      if (e.sheet?.anims?.[AN.reach[e.dir]]) e.playAnim(AN.reach[e.dir], { once: true, hold: true });
      HW.audio?.sfx?.('colonel_grab', { x: p.x, y: p.y });
    }
    HW.fx?.shake?.(3, 0.35);
    HW.fx?.vignette?.(1, 0.4);
    this._emit('catch', { info: why });
    HW.scripts.runFn(async (g) => {
      await g.wait(0.6);
      await g.gameOver(why);
    }, {}, { id: 'colonel.catch' });
    return true;
  },

  _reasonNow() {
    if (this.reason) return this.reason;
    if (this.mode === 'escape') return 'chase';
    if (this._woke) return 'woke';
    if (this._reported || periods.reportedBy === 'kevin') return 'running';
    const p = HW.player;
    const room = p && HW.map?.roomAt(p.x, p.y);
    if (!room || room.kind === 'hall' || room.kind === 'stair') return 'hall_after_bell';
    return 'out_of_seat';
  },

  // ------------------------------------------------------------------------------ vision
  _dist(p) { const e = this.entity; return Math.hypot(p.x - e.x, p.y - e.y); },

  /** Is Tess lit (flashlight on, or standing in light > 0.45)? Cached for 0.12 s. */
  _tessLit(dt) {
    this._litT -= dt;
    if (this._litT > 0) return this._lit;
    this._litT = 0.12;
    const p = HW.player;
    const fl = HW.lighting?.flashlight;
    let lit = !!(HW.flashlight?.on && (fl?.power ?? 1) > 0.05);
    if (!lit && p && HW.lighting?.lightAt) {
      try { lit = HW.lighting.lightAt(p.x, p.y - 8) > LIT_LEVEL; } catch { lit = false; }
    }
    this._lit = lit;
    return lit;
  },

  /** Distance (px) at which he sees Tess right now, or -1. `cone` false = any direction (hunting). */
  _see(dt, { cone = true, range = null } = {}) {
    const e = this.entity;
    const p = HW.player;
    const map = HW.map;
    if (!e || !p || !map || !p.visible || p.hidden) return -1;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const lit = this._tessLit(dt);
    const r = range ?? (lit ? RANGE_LIT : RANGE_DARK);
    if (d > r) return -1;
    if (cone && d > 12 && Math.abs(wrap(Math.atan2(dy, dx) - this.look)) > HALF_CONE) return -1;
    if (!map.los(e.x, e.y - EYE, p.x, p.y - EYE)) return -1;
    return d;
  },

  _detect(dt) {
    const p = HW.player;
    if (!p) return;
    const lit = this._tessLit(0);
    const range = lit ? RANGE_LIT : RANGE_DARK;
    const d = this._see(dt);
    let gain = 0;
    if (d >= 0) {
      const rate = RATE_NEAR + (RATE_FAR - RATE_NEAR) * Math.max(0, Math.min(1, (d - NEAR) / Math.max(1, range - NEAR)));
      if (p.seated) {
        if (HW.time - p.sitTime < SIT_GRACE) {
          gain = rate * 1.5;           // sitting down in his view counts as moving (R2)
          this._sawSeat = p.seated;
        } else if (!p.still && d <= SEATED_MOVE_R) {
          gain = rate * 1.5;
        }
      } else {
        gain = rate * (p.moving ? 1.5 : 1) * (p.running ? 2 : 1) * (lit ? 1.5 : 1);
      }
      if (gain > 0) { this._lastSeen.x = p.x; this._lastSeen.y = p.y; this._lastSeen.t = HW.time; }
    }
    const assist = HW.state?.assist || 1;
    if (gain > 0) this.detection = Math.min(1, this.detection + (gain * dt) / assist);
    else this.detection = Math.max(0, this.detection - DECAY * dt);
    this._meter();
  },

  /** Cue / notice thresholds. */
  _meter() {
    const e = this.entity;
    if (!this._cue && this.detection >= CUE) {
      this._cue = true;
      this._stare = this.mode !== 'scripted';
      HW.audio?.sfx?.('colonel_hm', { x: e.x, y: e.y - 20 });
      HW.audio?.sfx?.('colonel_breath_fast', { x: e.x, y: e.y - 20, vol: 0.8 });
      HW.fx?.vignette?.(0.5, 0.4);
      this._emit('cue');
    } else if (this._cue && this.detection < CUE_RESET) {
      this._cue = false;
      this._stare = false;
      HW.fx?.vignette?.(0.25, 1.2);
      // He saw her sit and didn't like it: he'll come and look at that seat.
      if (this._sawSeat && AUTONOMOUS.has(this.mode)) this.search(this._lastSeen.x, this._lastSeen.y);
    }
    if (this._stare && this._lastSeen.t > HW.time - 0.5) {
      this._turnToward(Math.atan2(this._lastSeen.y - e.y, this._lastSeen.x - e.x), 0.2);
      const d = angToDir(this.look);
      if (d !== e.dir) e.face(d);
    }
    if (this.detection >= 1 && this._noticeT < 0) this._notice();
  },

  _notice() {
    const e = this.entity;
    const p = HW.player;
    this._noticeT = NOTICE * (HW.state?.assist || 1);
    this._stare = true;
    this._clearQueue();
    if (p) this._faceAngle(Math.atan2(p.y - e.y, p.x - e.x));
    const ch = HW.state?.chapter ?? 0;
    const key = `colonel_who_ch${ch}`;
    if (!HW.state.flags[key]) {
      HW.state.flags[key] = true;
      HW.ui?.toast?.('"Who is out of their seat?"');
      HW.audio?.murmur?.(1.6);
      HW.debug?.record?.('say', 'colonel', null, 'Who is out of their seat?');
    } else {
      HW.audio?.sfx?.('colonel_hm', { x: e.x, y: e.y - 20 });
    }
    HW.fx?.vignette?.(0.7, 0.3);
    this._emit('notice');
  },

  // ------------------------------------------------------------------------------ patrol
  _buildGraph(map) {
    const P = map?.patrol;
    if (!P?.nodes) { this._graph = null; return; }
    const pts = {};
    const adj = {};
    for (const [id, c] of Object.entries(P.nodes)) { pts[id] = cellPt(c[0], c[1]); adj[id] = []; }
    for (const [a, b] of P.edges || []) {
      if (!adj[a] || !adj[b]) continue;
      if (!adj[a].includes(b)) adj[a].push(b);
      if (!adj[b].includes(a)) adj[b].push(a);
    }
    this._graph = { pts, adj, ids: Object.keys(pts) };
  },

  _nearestNode(x, y) {
    const G = this._graph;
    if (!G) return null;
    let best = null;
    let bd = Infinity;
    for (const id of G.ids) {
      const pt = G.pts[id];
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  },

  _farthestNode() {
    const G = this._graph;
    const p = HW.player;
    if (!G || !p) return null;
    let best = null;
    let bd = -1;
    for (const id of G.ids) {
      const pt = G.pts[id];
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d > bd) { bd = d; best = pt; }
    }
    return best ? { x: best.x, y: best.y } : null;
  },

  _peekStyle() {
    if (this.peekStyle) return this.peekStyle;
    const ch = HW.state?.chapter ?? 0;
    return ch <= 3 ? 'shadow' : ch === 4 ? 'doorway' : 'step';
  },

  _planPatrol() {
    const e = this.entity;
    const G = this._graph;
    if (!G || !G.ids.length) { this._push({ type: 'scan', t: 2, amp: 1 }); return; }
    const pk = this._choosePeek();
    if (pk && this._planPeek(pk, this._peekStyle())) return;
    if (!this._node) {
      this._node = this._nearestNode(e.x, e.y);
      const pt = G.pts[this._node];
      if (Math.hypot(pt.x - e.x, pt.y - e.y) > 4) {
        this._pushWalk(pt, { strict: true, doors: false });
        return;
      }
    }
    const next = this._nextNode();
    if (!next) { this._push({ type: 'scan', t: 1.5 }); return; }
    const w = this._pushWalk(G.pts[next], { strict: true, doors: false });
    w.onFail = () => { this._node = null; };
    this._push({ type: 'fn', fn: () => { this._prevNode = this._node; this._node = next; this._legs++; } });
    if (Math.random() < 0.35) this._push({ type: 'scan', t: 1.2 + Math.random(), amp: 0.7 });
  },

  _nextNode() {
    const G = this._graph;
    const nb = G.adj[this._node] || [];
    if (!nb.length) return null;
    let opts = nb.filter((n) => n !== this._prevNode);
    if (!opts.length) opts = nb;
    // Drift toward Tess's room if it hasn't had attendance yet (every period is one encounter).
    const goal = this._tessPeek();
    if (goal && Math.random() < 0.75) {
      const ap = this._peekPoints(goal)?.outside;
      if (ap) {
        let best = null;
        let bd = Infinity;
        for (const n of nb) {
          const d = Math.hypot(G.pts[n].x - ap.x, G.pts[n].y - ap.y);
          if (d < bd) { bd = d; best = n; }
        }
        if (best) return best;
      }
    }
    return opts[Math.floor(Math.random() * opts.length)];
  },

  _tessPeek() {
    const p = HW.player;
    const map = HW.map;
    if (!p || !map?.patrol?.peeks || this._peeks >= MAX_PEEKS) return null;
    const room = map.roomAt(p.x, p.y);
    if (!room) return null;
    return map.patrol.peeks.find((k) => k.room === room.id && !this._peeked.has(k.room)) || null;
  },

  _choosePeek() {
    if (this._peeks >= MAX_PEEKS) return null;
    const map = HW.map;
    const e = this.entity;
    const tp = this._tessPeek();
    if (tp && this._legs >= 1 && this._peekPoints(tp)) return tp;
    let best = null;
    let bd = 6 * TILE;
    for (const pk of map.patrol.peeks || []) {
      if (this._peeked.has(pk.room)) continue;
      const pts = this._peekPoints(pk);
      if (!pts) continue;
      const d = Math.hypot(pts.outside.x - e.x, pts.outside.y - e.y);
      if (d < bd) { bd = d; best = pk; }
    }
    if (best && (best === tp || Math.random() < 0.6)) return best;
    if (best) this._peeked.add(best.room); // passed it by: no second chance this period
    return null;
  },

  /** The door prop of a peek and the stand points around it (cached on the peek def). */
  _peekPoints(pk) {
    const map = HW.map;
    if (!map) return null;
    if (pk._pts && pk._pts.map === map) return pk._pts.v;
    const [dx, dy] = pk.door;
    let door = null;
    for (const p of map.allProps) {
      if (p.def.interact !== 'door') continue;
      if (dx >= p.x && dx < p.x + p.w && dy >= p.y && dy < p.y + p.h) { door = p; break; }
    }
    let v = null;
    if (door) {
      const isDoorTile = (x, y) => map.tileAt(x, y) === 'door';
      let cand;
      if (door.type === 'door_side') {
        cand = [[door.x - 1, door.y], [door.x + door.w, door.y]];
      } else {
        let top = door.y - 1;
        while (top > 0 && isDoorTile(door.x, top)) top--;
        let bot = door.y + door.h;
        while (bot < map.h - 1 && isDoorTile(door.x, bot)) bot++;
        cand = [[door.x, top], [door.x, bot]];
      }
      const inRoom = (c) => map.roomAt(c[0] * TILE + 8, c[1] * TILE + 8)?.id === pk.room;
      let inside = cand.find(inRoom);
      let outside = cand.find((c) => !inRoom(c));
      if (!inside) inside = cand[0];
      if (!outside) outside = cand[1];
      const inPt = cellPt(inside[0], inside[1]);
      const outPt = cellPt(outside[0], outside[1]);
      const intoAng = Math.atan2(inPt.y - outPt.y, inPt.x - outPt.x);
      const way = outside[1] > door.y ? cellPt(door.x, door.y + door.h - 1)
        : outside[1] < door.y ? cellPt(door.x, door.y) : cellPt(door.x, door.y);
      const look = pk.look ? cellPt(pk.look[0], pk.look[1]) : inPt;
      v = { door, inside: inPt, outside: outPt, doorway: way, look, into: intoAng };
    }
    pk._pts = { map, v };
    return v;
  },

  /** Queue a peek. Returns false if the peek can't be done from here. */
  _planPeek(pk, style) {
    const pts = this._peekPoints(pk);
    const map = HW.map;
    if (!pts) return false;
    const room = pk.room;
    const d = pts.door;
    this._peeked.add(room);
    this._pushWalk(pts.outside, { strict: true, doors: false });
    this._push({ type: 'fn', fn: () => { this.peeking = true; this._legs = 0; this._faceAngle(pts.into); } });
    if (style === 'shadow' || !map.doorPassable(d)) {
      // Ch3: a shadow crosses the door window; he never opens it.
      this._push({ type: 'scan', t: 2.4, amp: 0.25, base: pts.into, keepPose: true });
      this._push({ type: 'fn', fn: () => periods.notePeek(room) });
    } else {
      this._push({ type: 'fn', fn: () => this._openPeekDoor(d) });
      this._push({ type: 'wait', t: 0.5 });
      if (style === 'doorway') {
        this._pushWalk(pts.doorway, { strict: false });
        this._push({ type: 'fn', fn: () => {
          this._faceAngle(pts.into);
          const e = this.entity;
          if (e) HW.audio?.sfx?.('colonel_hm', { x: e.x, y: e.y - 20 });
          periods.notePeek(room);
        } });
        this._push({ type: 'anim', name: AN.peek[angToDir(pts.into)], once: true, hold: true });
        this._push({ type: 'scan', t: 2.5, amp: 0.7, base: pts.into, keepPose: true });
      } else {
        // Ch5+: he steps in and drags along one row; the medals jingle beside the desks.
        this._pushWalk(pts.look, { strict: false });
        this._push({ type: 'fn', fn: () => {
          const e = this.entity;
          if (e) HW.audio?.sfx?.('colonel_jingle', { x: e.x, y: e.y - 16 });
          periods.notePeek(room);
        } });
        const row = this._rowEnd(pts.look);
        if (row) {
          this._pushWalk(row, { strict: false });
          this._push({ type: 'scan', t: 1.6, amp: 0.9 });
          this._pushWalk(pts.look, { strict: false });
        } else {
          this._push({ type: 'scan', t: 2.2, amp: 1 });
        }
      }
      this._pushWalk(pts.outside, { strict: false });
      this._push({ type: 'fn', fn: () => this._closeHeldDoor() });
    }
    this._push({ type: 'fn', fn: () => {
      this.peeking = false;
      this._peeks++;
      this._emit('peek', { info: `${room}:${style}` });
    } });
    return true;
  },

  _openPeekDoor(d) {
    if (d.state === 'open') return;
    HW.interact?.openDoor?.(d, { by: 'colonel', silent: true, hold: true });
    HW.audio?.sfx?.('door_creak_slow', { x: (d.x + d.w / 2) * TILE, y: (d.y + d.h / 2) * TILE });
    this._heldDoor = d;
  },

  /** The Colonel closes doors behind his peeks (unless someone stands in the doorway). */
  _closeHeldDoor() {
    const d = this._heldDoor;
    this._heldDoor = null;
    if (!d || d.state !== 'open' || !HW.map?.prop(d.id)) return;
    const p = HW.player;
    const x0 = (d.x - 1) * TILE;
    const x1 = (d.x + d.w + 1) * TILE;
    const y0 = (d.y - 2) * TILE;
    const y1 = (d.y + d.h + 1) * TILE;
    const busy = (q) => q && q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1;
    if (busy(p) || busy(this.entity)) return;
    HW.interact?.closeDoor?.(d);
  },

  /** The far end of the row he drags along inside a room (up to 4 tiles, the roomier side). */
  _rowEnd(look) {
    const map = HW.map;
    const tx = Math.floor(look.x / TILE);
    const ty = Math.floor(look.y / TILE);
    const run = (s) => {
      let n = 0;
      while (n < 4 && !map.isSolid(tx + s * (n + 1), ty)) n++;
      return n;
    };
    const l = run(-1);
    const r = run(1);
    const n = Math.max(l, r);
    if (n < 2) return null;
    const s = r >= l ? 1 : -1;
    return cellPt(tx + s * n, ty);
  },

  _nearFree(x, y) {
    const map = HW.map;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (!map.isSolid(tx + dx, ty + dy)) return cellPt(tx + dx, ty + dy);
        }
      }
    }
    return { x, y };
  },

  // ------------------------------------------------------------------------------ folds
  _foldSpot(f) {
    const map = HW.map;
    if (!map || !f) return null;
    const [tx, ty] = f;
    for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 0], [-1, 0], [0, -1]]) {
      if (map.inBounds(tx + dx, ty + dy) && !map.isSolid(tx + dx, ty + dy)) return cellPt(tx + dx, ty + dy);
    }
    return null;
  },

  _onScreen(pt) {
    const v = HW.camera?.view;
    if (!v) return false;
    return pt.x > v.x - 24 && pt.x < v.x + v.w + 24 && pt.y > v.y - 8 && pt.y < v.y + v.h + 64;
  },

  /** A seam ≥ 12 tiles from Tess and off screen (random among the good ones; else the farthest). */
  _pickFold() {
    const map = HW.map;
    const p = HW.player;
    const folds = map?.patrol?.folds || [];
    if (!p || !folds.length) return null;
    const good = [];
    let far = null;
    let fd = -1;
    for (const f of folds) {
      const s = this._foldSpot(f);
      if (!s) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      const hidden = !this._onScreen(s);
      if (d >= MIN_FOLD && hidden) good.push(s);
      const score = d + (hidden ? 10000 : 0);
      if (score > fd) { fd = score; far = s; }
    }
    if (good.length) return good[Math.floor(Math.random() * good.length)];
    return far;
  },

  // ------------------------------------------------------------------------------ close pass
  _closePassFx(pause) {
    const p = HW.player;
    const e = this.entity;
    if (!p || !e) return;
    this._closeAt = HW.time;
    this._closeFxT = CLOSE_FX;
    HW.fx?.vignette?.(0.9, 0.35);
    HW.audio?.sfx?.('colonel_breath', { x: p.x + (e.x - p.x) * 0.3, y: p.y - 12, vol: 1 });
    HW.audio?.sfx?.('colonel_jingle', { x: e.x, y: e.y - 16, delay: 0.6 });
    if (pause) {
      // His hand rests on the next desk; then he moves on.
      const dir = dirFromVec(p.x - e.x, p.y - e.y, e.dir);
      this._q.unshift(
        { type: 'face', angle: Math.atan2(p.y - e.y, p.x - e.x) },
        { type: 'anim', name: AN.reach[dir], once: true, hold: true },
        { type: 'wait', t: 1.1 },
      );
    }
    this._emit('closePass');
  },

  _checkClosePass() {
    const p = HW.player;
    if (!p?.seated || !p.still || HW.time - this._closeAt < 8) return;
    if (this._dist(p) > CLOSE_R) return;
    this._closePassFx(AUTONOMOUS.has(this.mode));
  },

  // ------------------------------------------------------------------------------ chase
  _updateChase(dt) {
    const c = this._c;
    const e = this.entity;
    const p = HW.player;
    const map = HW.map;
    if (!c || !e || !p || !map) return;
    c.t += dt;
    // Sight: hunting, he follows her in any direction while he has a line to her.
    const seen = this._see(dt, { cone: false, range: CHASE_SIGHT }) >= 0;
    if (seen || c.track) {
      this._lastSeen.x = p.x;
      this._lastSeen.y = p.y;
      this._lastSeen.t = HW.time;
      c.lost = 0;
      c.tx = p.x;
      c.ty = p.y;
    } else {
      c.lost += dt;
      if (c.lost >= LOSE_T && this.mode === 'chase') {
        this._emit('lost');
        this.search(this._lastSeen.x, this._lastSeen.y);
        return;
      }
    }
    // The lurch: drag 30 px/s, then a 150 px/s lunge for 0.5 s every 1.4 s.
    let speed;
    if (c.style === 'pounce') {
      speed = POUNCE;
      c.lunging = true;
    } else {
      const lunging = c.t % LUNGE_EVERY >= LUNGE_EVERY - LUNGE_T;
      if (lunging && !c.lunging) this._lungeFx();
      c.lunging = lunging;
      speed = lunging ? LUNGE : CHASE_BASE;
    }
    const dist = this._dist(p);
    if (c.rubber) {
      const dT = dist / TILE;
      const ps = p.moving ? (p.speed || 0) : 0;
      if (dT > c.rubber[1]) speed = Math.max(speed, 140);
      else if (dT < c.rubber[0] && ps > 40) { speed = Math.min(speed, ps * 0.85); c.lunging = false; }
      if (this.cannotCatch && dT < 2.5) { speed = Math.min(speed, ps * 0.7); c.lunging = false; }
    }
    // Path toward her (or where she was).
    c.pathT -= dt;
    if (c.pathT <= 0 || !c.path || c.i >= c.path.length) {
      c.pathT = REPATH;
      c.path = map.findPath([e.x, e.y], [c.tx, c.ty], { doors: true }) || [[c.tx, c.ty]];
      c.i = 0;
    }
    this._advance(c.path, c, speed * dt, c.lunging ? 'lunge' : 'drag');
    if (!seen && !c.track && c.i >= c.path.length && Math.hypot(e.x - c.tx, e.y - c.ty) < 6 && this.mode === 'chase') {
      this._emit('lost');
      this.search(this._lastSeen.x, this._lastSeen.y);
      return;
    }
    if (dist <= CATCH_R && !p.hidden && !this.cannotCatch && this._godT <= 0) this.catch();
  },

  _lungeFx() {
    const e = this.entity;
    if (!e) return;
    HW.audio?.sfx?.('colonel_lunge', { x: e.x, y: e.y - 16 });
    const p = HW.player;
    if (p && Math.hypot(p.x - e.x, p.y - e.y) < 8 * TILE) HW.fx?.shake?.(1.2, 0.25);
    this._emit('lunge');
  },

  // ------------------------------------------------------------------------------ assembly
  _updateAssembly(dt) {
    const e = this.entity;
    const p = HW.player;
    if (!e || !p) return;
    if (!this.assemblyScan) {
      this.detection = Math.max(0, this.detection - DECAY * dt);
      if (this._cue && this.detection < CUE_RESET) { this._cue = false; HW.fx?.vignette?.(0.25, 1); }
      return;
    }
    let gain = 0;
    if (p.visible && !p.hidden && !p.seated) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d <= ASSEMBLY_RANGE && HW.map.los(e.x, e.y - 20, p.x, p.y - EYE)) {
        const spot = this.assemblySpot;
        const inSpot = spot && Math.hypot(p.x - spot.px, p.y - spot.py) < (spot.radius ?? 3) * TILE * 0.8;
        const lit = inSpot || this._tessLit(dt);
        gain = RATE_NEAR * (p.moving ? 1.5 : 1) * (p.running ? 2 : 1) * (lit ? 1.5 : 1);
      }
    }
    const assist = HW.state?.assist || 1;
    if (gain > 0) this.detection = Math.min(1, this.detection + (gain * dt) / assist);
    else this.detection = Math.max(0, this.detection - DECAY * dt);
    if (!this._cue && this.detection >= CUE) {
      this._cue = true;
      HW.audio?.sfx?.('colonel_hm', { x: e.x, y: e.y - 20 });
      HW.fx?.vignette?.(0.5, 0.4);
      this._emit('cue');
    }
    if (this.detection >= 1 && this._noticeT < 0) this._notice();
  },

  // ------------------------------------------------------------------------------ system
  _reset() {
    this._clearQueue();
    this._endChase();
    if (this.entity) this._removeEntity();
    this._stopBreath();
    this.mode = 'off';
    this.detection = 0;
    this.peeking = false;
    this.cannotCatch = false;
    this.reason = null;
    this.vision = false;
    this.assemblyScan = false;
    this.assemblySpot = null;
    this.shroud = null;
    this._noticeT = -1;
    this._cue = false;
    this._stare = false;
    this._heldDoor = null;
    this._sleepAt = null;
    this._home = null;
    this._reported = false;
    this._woke = false;
    this._godT = 0;
    this._closeFxT = -1;
    this._resetPeriodMemory();
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('newGame', () => this._reset());
    HW.game.on('load', () => this._reset());
    HW.game.on('gameOver', () => { this._clearQueue(); this._endChase(); this._stopBreath(); });
    noise.on((ev) => this._hear(ev));
  },

  _hear(ev) {
    const e = this.entity;
    if (!e || !AUTONOMOUS.has(this.mode) || this._noticeT >= 0) return;
    if (ev.map !== HW.map?.id) return;
    if (ev.by && ev.by !== 'player' && ev.by !== 'tess') return;
    if (!noise.hears(ev, e.x, e.y)) return;
    if (ev.kind === 'whistle') this._reported = true;
    // A footstep right beside him only turns his head.
    if (ev.kind === 'walk') { this._faceAngle(Math.atan2(ev.y - e.y, ev.x - e.x)); return; }
    this.investigate(ev.x, ev.y, ev.kind);
  },

  onMapLoad(map) {
    this._hook();
    this._buildGraph(map);
    // The engine despawns every NPC on a map load: a transfer ends whatever he was doing here.
    const was = this.mode;
    this._clearQueue();
    this._endChase();
    this.entity = null;
    this._stopBreath();
    this.peeking = false;
    this._heldDoor = null;
    this.detection = 0;
    this._cue = false;
    this._stare = false;
    this._noticeT = -1;
    if (was === 'chase' || was === 'search') periods._noRespawn = true; // he reappears at the next bell
    if (was !== 'escape') {
      this.mode = 'off';
      this.assemblyScan = false;
      this.assemblySpot = null;
      if (was !== 'sleep') this._sleepAt = null;
    }
    HW.fx?.vignette?.(0.25, 0.3);
  },

  update(dt) {
    this._hook();
    const e = this.entity;
    if (this._closeFxT >= 0) {
      this._closeFxT -= dt;
      if (this._closeFxT < 0) HW.fx?.vignette?.(0.25, 1.2);
    }
    if (!e) return;
    if (e !== HW.entities.get('colonel')) { this.entity = null; this._stopBreath(); return; } // removed by someone else
    if (this._godT > 0) this._godT -= dt;
    if (this._breath) this._breath.setPos?.(e.x, e.y - 20);
    if (this.mode === 'caught') return;
    // The world holds its breath during scenes: only scripted movement runs in a cutscene.
    const free = inFreePlay();
    const scripted = this.mode === 'scripted' || this.mode === 'off';
    if (!free && !scripted) return;

    if (this._noticeT >= 0) {
      this._noticeT -= dt;
      this._pose('idle');
      if (this._noticeT < 0) {
        this._noticeT = -1;
        this._stare = false;
        this.chase({ style: this.mode === 'assembly' ? 'pounce' : 'lurch', track: this.mode === 'assembly' });
      }
      return;
    }

    switch (this.mode) {
      case 'chase':
      case 'escape':
        this._updateChase(dt);
        break;
      case 'assembly':
        this._updateAssembly(dt);
        break;
      case 'patrol':
        if (!this._q.length) this._planPatrol();
        this._runQueue(dt);
        if (this.entity && !e.animOnce) this._detect(dt);
        break;
      case 'investigate':
      case 'search':
        if (!this._q.length) this._resume();
        this._runQueue(dt);
        if (this.entity) this._detect(dt);
        break;
      case 'scripted':
        this._runQueue(dt);
        if (this.entity && this.vision && free) this._detect(dt);
        break;
      default:
        this._runQueue(dt);
        break;
    }
    if (this.entity && this.mode !== 'chase' && this.mode !== 'escape' && this.mode !== 'assembly') this._checkClosePass();
    if (this.entity && this.mode !== 'assembly' && this.mode !== 'off') this._ambientSounds(dt);
  },

  _ambientSounds(dt) {
    const e = this.entity;
    if (!e.moving) return;
    this._jingleT -= dt;
    if (this._jingleT <= 0) {
      this._jingleT = 4 + Math.random() * 5;
      HW.audio?.sfx?.('colonel_jingle', { x: e.x, y: e.y - 16, vol: 0.7 });
    }
    this._dragT -= dt;
    if (this._dragT <= 0) {
      this._dragT = 3 + Math.random() * 2.5;
      HW.audio?.sfx?.('colonel_drag', { x: e.x, y: e.y });
    }
  },
};

export default colonel;
