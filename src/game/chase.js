// HW.chase — chase set pieces (DESIGN §6 VI.4–5, VIII.6; CONTENT §5.8).
//
//   start(opts) → Promise<result>     generic: the Colonel (spawned at `from` if needed) optionally lunges
//                                     to `lungeTo`, then hunts. opts: { from, lungeTo, lungeSpeed = 150,
//                                     reason, track = false, rubber = null ([min, max] tiles kept ahead
//                                     while she runs; walking gets the full lurch), cannotCatch = false }.
//                                     result: 'caught' | 'hidden' (she got into a hiding spot) | 'lost'
//                                     (he lost her and gave up) | 'transfer' | 'stopped'.
//   gym(opts) → Promise<result>       Ch6: his first lunge covers half the court (`lungeTo` = 'center',
//                                     300 px/s), then a rubber-banded chase [4, 8] that breaks off when
//                                     the locker-room route takes her out of his sight; when she climbs
//                                     into the locker the chase resolves 'hidden' and he goes 'scripted'
//                                     (stands still) for the ch6.locker scene. reason default 'out_of_seat'.
//   escape(opts) → Promise<result>    Ch8: relentless pursuit across maps. opts: { cannotCatch = false
//                                     (PRESENT: he can't catch), rubber = [4, 8], endMaps = ['exterior'],
//                                     entryDelay = 1.4, grace = 2 }. If he is already on the map (the
//                                     Register), he looms but holds off for `grace` s or until she moves.
//                                     On every map load during the escape: a checkpoint ('escape_<map>')
//                                     and, once entryDelay s have passed AND she is 3 tiles clear of where
//                                     she arrived, he pours in there; if she is still in the doorway 1.2 s
//                                     later, he rises 1.5 tiles behind her instead (emerge; 1 s grace).
//                                     Persisted in flag chase_escape so a retry from the checkpoint resumes
//                                     the chase. Resolves 'escaped' on an endMaps map, or 'stopped'.
//   cancelEntry()                     escape: a script has put him on this map itself — no re-entry here.
//   pursue() → bool                   escape: (re)start his pursuit with the set piece's opts (after a
//                                     scene that spawned him; also cancels the pending entry).
//   setRubber([min, max])             escape: retune the band (persisted; live if he is chasing).
//   stop(result = 'stopped')          end the current set piece (he stays where he is, scripted).
//   active · kind ('chase' | 'gym' | 'escape' | null)
// HW.game emits 'chaseEnd' (kind, result).
import HW from '../engine/hw.js';
import colonel from './colonel_ai.js';
import { inFreePlay } from './periods.js';

const TILE = 16;

export const chase = {
  active: false,
  kind: null,
  opts: null,
  _waiters: [],
  _respawnT: null,    // escape re-entry countdown (null = none pending)
  _cpT: -1,
  _entry: null,
  _mapId: null,
  _starting: false,
  _hooked: false,

  async start(opts = {}) {
    const { from = null, lungeTo = null, lungeSpeed = 150, reason = null, track = false, rubber = null, cannotCatch = false } = opts;
    this._begin('chase', opts);
    const done = new Promise((r) => this._waiters.push(r));
    if (!colonel.entity && from) await colonel.spawn(from, { mode: 'scripted', anim: null });
    if (!colonel.entity) { this._finish('stopped'); return done; }
    if (lungeTo) {
      this._starting = true;
      colonel.setMode('scripted');
      await colonel.lunge(lungeTo, { speed: lungeSpeed });
      this._starting = false;
      if (!this.active) return done;
    }
    colonel.chase({ reason, track, rubber, cannotCatch });
    return done;
  },

  gym({ lungeTo = 'center', lungeSpeed = 300, reason = 'out_of_seat', rubber = [4, 8], from = 'colonel_hoop' } = {}) {
    const p = this.start({ from, lungeTo, lungeSpeed, reason, rubber });
    this.kind = 'gym';
    return p;
  },

  escape({ cannotCatch = false, rubber = [4, 8], endMaps = ['exterior'], entryDelay = 1.4, grace = 2 } = {}) {
    const opts = { cannotCatch: !!cannotCatch, rubber, endMaps: [...endMaps], entryDelay };
    this._begin('escape', opts);
    if (HW.state) HW.state.flags.chase_escape = { ...opts, endMaps: [...opts.endMaps] };
    const done = new Promise((r) => this._waiters.push(r));
    if (colonel.entity) {
      // He is right there (the Register): one beat to start running before he can take her.
      colonel.escape({ cannotCatch: opts.cannotCatch, rubber, grace });
      this._cpT = 0.05; // checkpoint here too, once the starting scene lets go
    } else this._arm(HW.map);
    return done;
  },

  /** Escape: a script has spawned him on this map itself — cancel the pending re-entry at her arrival point. */
  cancelEntry() {
    if (this.active && this.kind === 'escape') this._respawnT = null;
  },

  /** Escape: (re)start his pursuit with the set piece's opts once a scene that spawned him lets go. → bool */
  pursue() {
    if (!this.active || this.kind !== 'escape' || !colonel.entity) return false;
    this._respawnT = null;
    colonel.escape({ cannotCatch: this.opts.cannotCatch, rubber: this.opts.rubber });
    return true;
  },

  /** Escape: retune the rubber band ([min, max] tiles ahead of a running Tess) — persisted, live if chasing. */
  setRubber(rubber) {
    if (!this.active || this.kind !== 'escape' || !Array.isArray(rubber)) return;
    this.opts.rubber = [rubber[0], rubber[1]];
    const f = HW.state?.flags?.chase_escape;
    if (f && typeof f === 'object') f.rubber = [rubber[0], rubber[1]];
    if (colonel.mode === 'escape') colonel.setRubber(this.opts.rubber);
  },

  stop(result = 'stopped') {
    if (!this.active) return;
    if (HW.state?.flags) delete HW.state.flags.chase_escape;
    if (colonel.entity && (colonel.mode === 'chase' || colonel.mode === 'escape')) colonel.setMode('scripted');
    colonel.cannotCatch = false;
    this._finish(result);
  },

  _begin(kind, opts) {
    if (this.active) this._finish('stopped');
    this.active = true;
    this.kind = kind;
    this.opts = opts;
    this._mapId = HW.map?.id || null;
    this._respawnT = null;
    this._cpT = -1;
    HW.debug?.record?.('chase', null, null, `start:${kind}`);
  },

  _finish(result) {
    const kind = this.kind;
    this.active = false;
    this.kind = null;
    this.opts = null;
    this._respawnT = null;
    this._cpT = -1;
    this._starting = false;
    HW.debug?.record?.('chase', null, null, `end:${kind}:${result}`);
    const ws = this._waiters.splice(0);
    for (const r of ws) r(result);
    HW.game?.emit?.('chaseEnd', kind, result);
  },

  /** Escape: a fresh map — checkpoint, then he follows her in. */
  _arm(map) {
    const p = HW.player;
    this._mapId = map?.id || null;
    this._entry = p ? { x: p.x, y: p.y, dir: p.dir } : null;
    this._respawnT = this.opts.entryDelay ?? 1.4;
    this._cpT = 0.05;
  },

  /** He pours in where she arrived — or, if she is still standing in the doorway, rises 1.5 tiles behind her. */
  _spawnBehind(emerge = false) {
    const e = this._entry;
    if (!e) return;
    let at = { x: e.x, y: e.y };
    if (emerge) {
      const v = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[e.dir] || [0, 0];
      const bx = e.x + v[0] * 24;
      const by = e.y + v[1] * 24;
      if (HW.map && !HW.map.isSolid(Math.floor(bx / TILE), Math.floor(by / TILE))) at = { x: bx, y: by };
    }
    colonel.spawn(at, { mode: 'scripted', anim: emerge ? 'emerge' : null }).then(() => {
      if (!this.active || this.kind !== 'escape' || !colonel.entity) return;
      HW.audio?.sfx?.('colonel_lunge', at);
      colonel.escape({ cannotCatch: this.opts.cannotCatch, rubber: this.opts.rubber, grace: emerge ? 1 : 0 });
    });
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('newGame', () => { if (this.active) this._finish('stopped'); });
  },

  onMapLoad(map) {
    this._hook();
    const esc = HW.state?.flags?.chase_escape;
    if (esc) {
      // A reload mid-escape (retry) re-arms from the flag; a transfer continues it.
      if (!this.active || this.kind !== 'escape') {
        this.active = true;
        this.kind = 'escape';
        this.opts = { ...esc };
      }
      if ((esc.endMaps || []).includes(map?.id)) {
        delete HW.state.flags.chase_escape;
        colonel.setMode('off', { sink: false });
        this._finish('escaped');
        return;
      }
      this._arm(map);
      return;
    }
    if (this.active && this.kind !== 'escape') {
      // He doesn't follow through a transfer (the basement stairs, a door out of the gym).
      this._finish('transfer');
    }
  },

  update(dt) {
    this._hook();
    if (!this.active) return;
    if (this.kind === 'escape') {
      if (this._cpT >= 0) {
        this._cpT -= dt;
        if (this._cpT < 0) {
          if (HW.game.canCheckpoint?.()) HW.game.checkpoint(`escape_${HW.map?.id}`);
          else this._cpT = 0.25; // a scene is still running: try again shortly
        }
      }
      // (null = no entry pending. The old `>= 0` guard froze the countdown just below 0 when she had not yet
      // cleared her arrival point, so he never came onto that map at all.)
      if (this._respawnT !== null && inFreePlay()) {
        this._respawnT -= dt;
        const p = HW.player;
        const clear = p && this._entry && Math.hypot(p.x - this._entry.x, p.y - this._entry.y) >= 3 * TILE;
        if (this._respawnT <= 0 && (clear || this._respawnT <= -1.2)) {
          this._respawnT = null;
          this._spawnBehind(!clear);
        }
      }
      return;
    }
    if (this._starting) return;
    const p = HW.player;
    if (colonel.mode === 'caught') this._finish('caught');
    else if (p?.hidden) {
      if (colonel.entity) colonel.setMode('scripted');
      this._finish('hidden');
    } else if (colonel.mode !== 'chase' && colonel.mode !== 'escape' && colonel.mode !== 'search') {
      this._finish('lost');
    }
  },
};

export default chase;
