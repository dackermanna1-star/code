// HW.chase — chase set pieces (DESIGN §6 VI.4–5, VIII.6; CONTENT §5.8).
//
//   start(opts) → Promise<result>     generic: the Colonel (spawned at `from` if needed) optionally lunges
//                                     to `lungeTo`, then hunts. opts: { from, lungeTo, lungeSpeed = 150,
//                                     reason, track = false, rubber = null ([min, max] tiles kept ahead
//                                     while she moves well), cannotCatch = false }.
//                                     result: 'caught' | 'hidden' (she got into a hiding spot) | 'lost'
//                                     (he lost her and gave up) | 'transfer' | 'stopped'.
//   gym(opts) → Promise<result>       Ch6: his first lunge covers half the court (`lungeTo` = 'center',
//                                     300 px/s), then a rubber-banded chase [4, 8] that breaks off when
//                                     the locker-room route takes her out of his sight; when she climbs
//                                     into the locker the chase resolves 'hidden' and he goes 'scripted'
//                                     (stands still) for the ch6.locker scene. reason default 'out_of_seat'.
//   escape(opts) → Promise<result>    Ch8: relentless pursuit across maps. opts: { cannotCatch = false
//                                     (PRESENT: he can't catch), rubber = [4, 8], endMaps = ['exterior'],
//                                     entryDelay = 1.4 }. On every map load during the escape: a
//                                     checkpoint ('escape_<map>') and, entryDelay s later (or once she is
//                                     3 tiles clear), he pours in where she arrived. Persisted in flag
//                                     chase_escape so a retry from the checkpoint resumes the chase.
//                                     Resolves 'escaped' on an endMaps map, or 'stopped'.
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
  _respawnT: -1,
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

  escape({ cannotCatch = false, rubber = [4, 8], endMaps = ['exterior'], entryDelay = 1.4 } = {}) {
    const opts = { cannotCatch: !!cannotCatch, rubber, endMaps: [...endMaps], entryDelay };
    this._begin('escape', opts);
    if (HW.state) HW.state.flags.chase_escape = { ...opts, endMaps: [...opts.endMaps] };
    const done = new Promise((r) => this._waiters.push(r));
    if (colonel.entity) {
      colonel.escape({ cannotCatch: opts.cannotCatch, rubber });
      this._cpT = 0.05; // checkpoint here too, once the starting scene lets go
    } else this._arm(HW.map);
    return done;
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
    this._respawnT = -1;
    this._cpT = -1;
    HW.debug?.record?.('chase', null, null, `start:${kind}`);
  },

  _finish(result) {
    const kind = this.kind;
    this.active = false;
    this.kind = null;
    this.opts = null;
    this._respawnT = -1;
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
    this._entry = p ? { x: p.x, y: p.y } : null;
    this._respawnT = this.opts.entryDelay ?? 1.4;
    this._cpT = 0.05;
  },

  _spawnBehind() {
    const e = this._entry;
    if (!e) return;
    colonel.spawn({ x: e.x, y: e.y }, { mode: 'scripted', anim: null }).then(() => {
      if (!this.active || this.kind !== 'escape' || !colonel.entity) return;
      HW.audio?.sfx?.('colonel_lunge', { x: e.x, y: e.y });
      colonel.escape({ cannotCatch: this.opts.cannotCatch, rubber: this.opts.rubber });
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
      if (this._respawnT >= 0 && inFreePlay()) {
        this._respawnT -= dt;
        const p = HW.player;
        const clear = p && this._entry && Math.hypot(p.x - this._entry.x, p.y - this._entry.y) >= 3 * TILE;
        if (this._respawnT <= 0 && (clear || this._respawnT <= -1.2)) {
          this._respawnT = -1;
          this._spawnBehind();
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
