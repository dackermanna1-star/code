// HW.assembly — the Founder's Day Assembly (DESIGN §6 VII.3–5, rule R2; CONTENT §5.3, §5.8).
//
// The Colonel stands at the lectern reading the roll. The cycle:
//   READ 7–9 s       he reads (lectern_down); Tess may move, walking. Running ANYWHERE → immediate SCAN.
//   TELEGRAPH 2.0 s  page turn; "Hm." at −1.0 s; the spotlight drifts off the lectern over the house.
//   SCAN 3 s         he looks up (lectern_scan; 4.5 s after a silent roll #3): standing anywhere he can
//                    see = the detection meter fills fast (seated is safe at once in this mode) →
//                    "Who is out of their seat?" → he pours off the stage → caught ('out_of_seat').
// Telegraph and meters stretch ×HW.state.assist. The cycle only advances in free play, so the
// front-row scenes (cutscenes) pause it; scripts can also pause()/resume().
// Roll call #3: the first time Tess SITS in a seat whose object has `row` 1–4 (aud_seat instances
// carry `row`), the blocking script `ch7.roll3` runs (ctx { prop, row }) unless flag roll3_done.
// The spotlight is a dynamic `spot` light owned by this system (scoped to the map): its px/py drift.
// start() also switches the aud's map-light group 'assembly' on (Integration 2).
// Front row (Integration 2): the empty seats beside the friends carry `front: '<friend>'`
// (aud_seats.js). sitScriptFor(prop) gives such a seat the default sit script `ch7.front_<front>`
// (game/hiding.js runs it after Tess sits, queued behind roll call #3) once roll3_done, during the
// Assembly (active, or Chapter VII under way) and before register_done. `frontScenes`: 'auto'
// (default — stays out while a script-installed 'sit' hook already runs ch7.front_* itself, as
// ch7.js does today; see frontDeferred) | true (always) | false (never).
//
// API
//   start({ lectern = 'lectern', spot = true, radius = 3.2 }) → bool   (spawns him at the anchor)
//   stop({ despawn = true })      end the assembly (he sinks unless despawn: false)
//   pause() / resume() / scanNow()
//   active · paused · phase ('read' | 'telegraph' | 'scan' | 'off') · phaseLeft (s) · spot (the light)
//   onPhase(fn) → off             fn(phase); HW.game also emits 'assemblyPhase'
//   sitScriptFor(prop) → id|null  front-row default sit script · frontScenes · frontDeferred
// Persisted: flag assembly_on = { map, lectern } so a reload in the auditorium restarts the cycle.
import HW from '../engine/hw.js';
import colonel from './colonel_ai.js';
import { inFreePlay } from './periods.js';

const TILE = 16;
const READ_MIN = 7;
const READ_MAX = 9;
const TELEGRAPH = 2.0;
const HM_BEFORE = 1.0;
const SCAN = 3;
const SCAN_SILENT = 4.5;
const DRIFT = 1.6;            // 1/s spotlight easing

export const assembly = {
  active: false,
  paused: false,
  phase: 'off',
  spot: null,
  _t: 0,
  _len: 0,
  _hm: false,
  _mapId: null,
  _lectern: null,
  _home: null,          // spotlight rest point (in front of the lectern)
  _roll3: false,
  _hooks: new Set(),
  _hooked: false,
  frontScenes: 'auto',

  get phaseLeft() { return this.active ? Math.max(0, this._len - this._t) : 0; },

  start({ lectern = 'lectern', spot = true, radius = 3.2 } = {}) {
    const map = HW.map;
    const at = map?.anchor(lectern);
    if (!at) { console.warn('[assembly] no lectern anchor', lectern); return false; }
    this._mapId = map.id;
    this._lectern = lectern;
    this._home = { x: at.x, y: at.y + 2 * TILE };
    this.active = true;
    this.paused = false;
    if (HW.state) HW.state.flags.assembly_on = { map: map.id, lectern };
    // The house lights for the Assembly: the aud's map lights in group 'assembly'.
    try { HW.lighting?.setGroup?.('assembly', true, { mode: 'fade', time: 1.2 }); } catch (e) { console.error('[assembly] setGroup', e); }
    colonel.assembly({ at: lectern });
    this._removeSpot();
    if (spot && HW.lighting?.addLight) {
      this.spot = HW.lighting.addLight({ type: 'spot', px: this._home.x, py: this._home.y, map: map.id, radius, group: 'assembly_spot' });
    }
    colonel.assemblySpot = this.spot;
    this._enter('read');
    HW.debug?.record?.('assembly', null, null, 'start');
    return true;
  },

  stop({ despawn = true } = {}) {
    if (HW.state?.flags) delete HW.state.flags.assembly_on;
    this._suspend();
    if (despawn && colonel.mode === 'assembly') colonel.despawn({ sink: true });
    HW.debug?.record?.('assembly', null, null, 'stop');
  },

  _suspend() {
    this.active = false;
    this.phase = 'off';
    colonel.assemblyScan = false;
    colonel.assemblySpot = null;
    this._removeSpot();
  },

  _removeSpot() {
    if (this.spot) {
      try { HW.lighting?.removeLight?.(this.spot); } catch (e) { console.error('[assembly] removeLight', e); }
    }
    this.spot = null;
  },

  pause() { this.paused = true; },
  resume() { this.paused = false; },
  scanNow() { if (this.active && this.phase !== 'scan') this._enter('scan'); },

  onPhase(fn) { this._hooks.add(fn); return () => this._hooks.delete(fn); },

  /** Does a script-installed 'sit' hook already run the front-row scenes (ch7.js)? */
  get frontDeferred() {
    const set = HW.game?._listeners?.get?.('sit');
    if (!set) return false;
    for (const fn of set) {
      const src = String(fn);
      if (/\.front\b/.test(src) && /ch7\.front_/.test(src)) return true;
    }
    return false;
  },

  /** Default sit script for a front-row seat (`front: '<friend>'`) → 'ch7.front_<friend>' | null. */
  sitScriptFor(prop) {
    const friend = prop?.inst?.front;
    if (!friend || this.frontScenes === false) return null;
    const s = HW.state;
    const f = s?.flags || {};
    if (f.register_done || !f.roll3_done) return null;
    if (!this.active && !((s.chapter || 0) === 7 && f.ch7_started)) return null;
    if (this.frontScenes !== true && this.frontDeferred) return null;
    const id = `ch7.front_${friend}`;
    return HW.scripts?.has?.(id) ? id : null;
  },

  _enter(phase) {
    this.phase = phase;
    this._t = 0;
    this._hm = false;
    const assist = HW.state?.assist || 1;
    const e = colonel.entity;
    const f = HW.state?.flags || {};
    if (phase === 'read') {
      this._len = READ_MIN + Math.random() * (READ_MAX - READ_MIN);
      colonel.assemblyScan = false;
      if (e?.sheet?.anims?.lectern_down) e.playAnim('lectern_down');
    } else if (phase === 'telegraph') {
      this._len = TELEGRAPH * assist;
      HW.audio?.sfx?.('page_turn', e ? { x: e.x, y: e.y - 24 } : {});
    } else {
      this._len = (f.roll3_done && !f.roll3_answered ? SCAN_SILENT : SCAN) * assist;
      colonel.assemblyScan = true;
      if (e?.sheet?.anims?.lectern_scan) e.playAnim('lectern_scan');
    }
    HW.debug?.record?.('assembly', null, null, phase);
    for (const fn of this._hooks) { try { fn(phase); } catch (err) { console.error('[assembly] hook failed', err); } }
    HW.game?.emit?.('assemblyPhase', phase);
  },

  /** Roll call #3 fires the first time she sits in rows 1–4. */
  _onSit(prop) {
    if (!this.active || HW.map?.id !== this._mapId || this._roll3) return;
    const row = Number(prop?.inst?.row);
    if (!(row >= 1 && row <= 4) || HW.state?.flags?.roll3_done) return;
    this._roll3 = true;
    HW.debug?.record?.('assembly', null, null, `roll3:row${row}`);
    if (HW.scripts?.has?.('ch7.roll3')) HW.scripts.run('ch7.roll3', { prop, row, map: HW.map });
  },

  _driftSpot(dt) {
    const s = this.spot;
    if (!s) return;
    const p = HW.player;
    let tx = this._home.x;
    let ty = this._home.y;
    if (this.phase === 'telegraph' && p) {
      // Off the lectern, out over the house, toward where she is (but only halfway).
      tx = this._home.x + (p.x - this._home.x) * 0.45;
      ty = this._home.y + (p.y - this._home.y) * 0.45;
    } else if (this.phase === 'scan' && p) {
      tx = p.x;
      ty = p.y;
    }
    const k = 1 - Math.exp(-dt * (this.phase === 'scan' ? DRIFT * 0.7 : DRIFT));
    s.px += (tx - s.px) * k;
    s.py += (ty - s.py) * k;
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('sit', (prop) => this._onSit(prop));
    const reset = () => { this._suspend(); this._roll3 = false; };
    HW.game.on('newGame', reset);
    HW.game.on('load', () => { reset(); this._resumeFromFlag(HW.map); });
  },

  _resumeFromFlag(map) {
    const on = HW.state?.flags?.assembly_on;
    if (on && map && on.map === map.id) this.start({ lectern: on.lectern || 'lectern' });
  },

  onMapLoad(map) {
    this._hook();
    if (this.active) this._suspend();
    this._removeSpot();
    this._resumeFromFlag(map);
  },

  update(dt) {
    this._hook();
    if (!this.active) return;
    if (colonel.mode !== 'assembly') {
      // He left the lectern (a catch, a script): the cycle stops with him.
      if (colonel.mode !== 'chase') this._suspend();
      return;
    }
    if (this.paused || !inFreePlay()) return;
    this._t += dt;
    const p = HW.player;
    if (this.phase !== 'scan' && p?.running) { this._enter('scan'); return; }
    if (this.phase === 'telegraph' && !this._hm && this._t >= this._len - HM_BEFORE) {
      this._hm = true;
      const e = colonel.entity;
      HW.audio?.sfx?.('colonel_hm', e ? { x: e.x, y: e.y - 24 } : {});
    }
    this._driftSpot(dt);
    if (this._t >= this._len) this._enter(this.phase === 'read' ? 'telegraph' : this.phase === 'telegraph' ? 'scan' : 'read');
  },
};

export default assembly;
