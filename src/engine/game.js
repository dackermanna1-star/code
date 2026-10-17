// Game: fixed-step loop, game modes, map loading/transfers, saves & checkpoints, game over,
// endings, item use and the registry of game systems (TECH §4, §7).
//
// Modes: 'boot' → 'title' | 'play' | 'cutscene' (blocking script) | 'menu' (engine-opened UI
// screen; paused) | 'gameover' | 'ending'. HW.time advances only while not paused.
import HW from './hw.js';
import { MapRuntime } from './map.js';
import { createState, normalizeState, cloneState, saves, chapterTitle } from './state.js';
import { resolvePoint } from './entities.js';
import { ITEMS } from '../data/items.js';

export const DT = 1 / 60;
const PAUSED_MODES = new Set(['boot', 'title', 'menu', 'gameover']);
const MAX_FRAME = 0.25;           // s — longer gaps (tab switch, breakpoint) are dropped
const FADE_TIME = 0.35;
const NEW_GAME_FALLBACK = ['test', 'start'];

const rectHas = (r, tx, ty) => tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3];

// Calls into other subsystems are isolated so one module's bug can't stop the loop. Each distinct
// failure is reported once (console.error → captured by the debug API).
const reported = new Set();
function report(where, e) {
  const key = `${where}: ${e?.message || e}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`[game] ${where} failed:`, e);
}
function call(obj, method, where, a, b, c) {
  if (!obj) return undefined;
  const f = obj[method];
  if (typeof f !== 'function') return undefined;
  try {
    return f.call(obj, a, b, c);
  } catch (e) {
    report(where, e);
    return undefined;
  }
}

/** Await a promise, but never longer than `sec` (+ slack) of real time. */
function bounded(p, sec) {
  if (!p || typeof p.then !== 'function') return Promise.resolve(p);
  return Promise.race([p, new Promise((r) => setTimeout(r, sec * 1000 + 1500))]);
}

export const game = {
  mode: 'boot',
  systems: [],
  room: null,
  transferring: false,
  /** Set by game/chapters.js: (n) => void | Promise. */
  chapterSetup: null,
  frame: 0,
  steps: 0,
  fps: 60,
  _listeners: new Map(),
  _acc: 0,
  _last: 0,
  _running: false,
  _exitArmed: false,
  _trigInside: [],
  _menuToken: 0,
  _titleToken: 0,
  _waiters: [],
  _tweens: [],
  _fpsT: 0,
  _fpsN: 0,

  // ---------------------------------------------------------------------------------- events
  /** Subscribe: 'mode', 'mapLoad', 'roomEnter', 'propChange', 'doorOpen', 'flag', 'item', 'doc',
   *  'chapter', 'checkpoint', 'save', 'load', 'transfer', 'gameOver', 'ending', 'sit', 'stand',
   *  'hide', 'unhide', 'refresh'. Returns an unsubscribe function. */
  on(ev, fn) {
    if (!this._listeners.has(ev)) this._listeners.set(ev, new Set());
    this._listeners.get(ev).add(fn);
    return () => this.off(ev, fn);
  },
  off(ev, fn) {
    this._listeners.get(ev)?.delete(fn);
  },
  emit(ev, ...args) {
    const set = this._listeners.get(ev);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { report(`listener '${ev}'`, e); }
    }
  },

  // ---------------------------------------------------------------------------------- modes
  setMode(m) {
    if (m === this.mode) return;
    const prev = this.mode;
    this.mode = m;
    if (m !== 'play') HW.input?.clear?.();
    this.emit('mode', m, prev);
  },

  get paused() {
    return PAUSED_MODES.has(this.mode);
  },

  /** Can the player move and interact right now? */
  get controllable() {
    const p = HW.player;
    return this.mode === 'play' && !!HW.map && !!p && !this.transferring && !p.busy && !this._uiBusy();
  },

  _uiBusy() {
    try {
      return !!HW.ui?.isBusy?.();
    } catch (e) {
      report('ui.isBusy', e);
      return false;
    }
  },

  /** Called by the script runner when the first blocking script starts / the last one ends. */
  onCutscene(active) {
    if (active) {
      if (this.mode === 'play') {
        this.setMode('cutscene');
        HW.player?.stopPath?.(false);
        if (HW.player) { HW.player.moving = false; HW.player.running = false; }
        call(HW.ui, 'prompt', 'ui.prompt', null, null);
      }
    } else if (this.mode === 'cutscene') {
      this.setMode('play');
    }
  },

  // ---------------------------------------------------------------------------------- systems
  /** Register a game system: { update(dt), render?(ctx, cam), onMapLoad?(map) }. */
  addSystem(sys) {
    if (!this.systems.includes(sys)) this.systems.push(sys);
    if (HW.map && sys.onMapLoad) {
      try { sys.onMapLoad(HW.map); } catch (e) { report('system.onMapLoad', e); }
    }
    return sys;
  },
  removeSystem(sys) {
    const i = this.systems.indexOf(sys);
    if (i >= 0) this.systems.splice(i, 1);
  },

  // ---------------------------------------------------------------------------------- loop
  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const frame = (now) => {
      if (!this._running) return;
      requestAnimationFrame(frame);
      this._frame(now);
    };
    requestAnimationFrame(frame);
  },

  stop() {
    this._running = false;
  },

  _frame(now) {
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt >= 0)) dt = 0;
    dt = Math.min(dt, MAX_FRAME);
    const scale = HW.debug?.timeScale || 1;
    this._acc += dt * scale;
    const maxSteps = Math.max(8, Math.ceil(scale * 8));
    let n = 0;
    while (this._acc >= DT && n < maxSteps) {
      this.step(DT);
      this._acc -= DT;
      n++;
    }
    if (n >= maxSteps) this._acc = 0;
    this.render();
    this.frame++;
    this._fpsT += dt;
    this._fpsN++;
    if (this._fpsT >= 1) {
      this.fps = Math.round(this._fpsN / this._fpsT);
      this._fpsT = 0;
      this._fpsN = 0;
    }
  },

  /** One fixed simulation step (TECH §4 update order). */
  step(dt) {
    this.steps++;
    try {
      HW.input.update(dt);
      call(HW.debug, 'update', 'debug.update', dt);
      if (!this.paused) {
        HW.time += dt;
        if (this.mode === 'play' || this.mode === 'cutscene') HW.state.playtime += dt;
        HW.scripts.update(dt);
        this._updateTweens(dt);
        if (this.mode === 'play' && HW.map) this._globalKeys();
        HW.entities.update(dt);
        for (let i = 0; i < this.systems.length; i++) call(this.systems[i], 'update', 'system.update', dt);
        if (HW.map && HW.player) {
          HW.interact.update(dt);
          this._checkZones();
          this._trackRoom();
        }
        HW.camera.update(dt);
        if (HW.player && HW.map) call(HW.audio, 'setListener', 'audio.setListener', HW.player.x, HW.player.y);
        call(HW.lighting, 'update', 'lighting.update', dt);
      }
      call(HW.audio, 'update', 'audio.update', dt);
      if (this.mode !== 'menu') call(HW.fx, 'update', 'fx.update', dt);
      call(HW.ui, 'update', 'ui.update', dt);
    } catch (e) {
      report('step', e);
    }
    this._runWaiters(dt);
  },

  render() {
    const d = HW.display;
    call(HW.renderer, 'render', 'renderer.render');
    d.uiCtx.clearRect(0, 0, d.UI_W, d.UI_H);
    call(HW.ui, 'render', 'ui.render', d.uiCtx);
    d.present();
  },

  /** Engine-level keys in free play (TECH §4 / assignment): pause, inventory, sketchbook, compact, flashlight. */
  _globalKeys() {
    const input = HW.input;
    if (this.transferring || this._uiBusy() || HW.player?.busy) return;
    if (input.pressed('pause')) { input.consumeAll(); this.openMenu('pause'); return; }
    if (input.pressed('inventory')) { input.consumeAll(); this.openMenu('inventory'); return; }
    if (input.pressed('sketchbook')) { input.consumeAll(); this.openMenu('sketchbook'); return; }
    if (input.pressed('compact')) { input.consume('compact'); HW.compact?.use?.(); }
    if (input.pressed('flashlight')) { input.consume('flashlight'); HW.flashlight?.toggle?.(); }
  },

  /** Open a persistent UI screen as a pausing menu; resolves with the screen's result. */
  async openMenu(name, args) {
    if (this.mode !== 'play') return null;
    const token = ++this._menuToken;
    call(HW.ui, 'prompt', 'ui.prompt', null, null);
    if (HW.player) { HW.player.moving = false; HW.player.running = false; }
    this.setMode('menu');
    let result = null;
    try {
      result = await HW.ui?.open?.(name, args);
    } catch (e) {
      report(`ui.open(${name})`, e);
    }
    if (this.mode === 'menu' && token === this._menuToken) this.setMode(HW.scripts.blocking ? 'cutscene' : 'play');
    return result;
  },

  // ---------------------------------------------------------------------------------- timing helpers
  /** Resolve when pred() holds (checked after every step, paused or not). */
  until(pred, timeoutSec = Infinity) {
    return new Promise((resolve) => {
      if (safePred(pred)) { resolve(true); return; }
      this._waiters.push({ pred, t: timeoutSec, resolve });
    });
  },

  /** Resolve after `sec` of simulated steps (counts while paused too; for tools/tests). */
  afterSteps(sec) {
    return this.until(() => false, sec).then(() => undefined);
  },

  _runWaiters(dt) {
    const ws = this._waiters;
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      w.t -= dt;
      const ok = safePred(w.pred);
      if (ok || w.t <= 0) {
        ws.splice(i, 1);
        w.resolve(ok);
      }
    }
  },

  /** Game-time tween: fn(k) with k 0→1 over `sec`. */
  tween(sec, fn) {
    return new Promise((resolve) => {
      if (sec <= 0) { fn(1); resolve(); return; }
      this._tweens.push({ t: 0, dur: sec, fn, resolve });
    });
  },

  _updateTweens(dt) {
    const tw = this._tweens;
    for (let i = tw.length - 1; i >= 0; i--) {
      const t = tw[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      try { t.fn(k); } catch (e) { report('tween', e); }
      if (k >= 1) { tw.splice(i, 1); t.resolve(); }
    }
  },

  // ---------------------------------------------------------------------------------- maps
  /**
   * Load a map and place the player. `at`: anchor name | [tx,ty] | { x, y } world px | null
   * (keep HW.state.px/py). Synchronous; transfers wrap it with fades.
   */
  loadMap(mapId, at, { dir } = {}) {
    const data = HW.data?.maps?.[mapId];
    if (!data) throw new Error(`Unknown map: ${mapId}`);
    call(HW.compact, 'close', 'compact.close', true);
    const map = new MapRuntime(data, HW.state);
    HW.map = map;
    HW.state.map = mapId;
    let pos = null;
    if (at !== null && at !== undefined) pos = resolvePoint(at);
    if (!pos) {
      if (at !== null && at !== undefined) console.warn(`[game] spawn point ${JSON.stringify(at)} not found on ${mapId}`);
      pos = { x: HW.state.px || map.pw / 2, y: HW.state.py || map.ph / 2, dir: HW.state.dir };
    }
    HW.entities.onMapLoad(map, pos.x, pos.y, dir || pos.dir || HW.state.dir || 'down');
    HW.camera.reset();
    HW.camera.snap();
    this.room = null;
    this._exitArmed = false;
    const p = HW.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    this._trigInside = map.triggers.map((t) => rectHas(t.rect, tx, ty));
    call(HW.lighting, 'onMapLoad', 'lighting.onMapLoad', map);
    if (data.ambience !== undefined) call(HW.audio, 'ambience', 'audio.ambience', data.ambience);
    if (typeof data.music === 'string') call(HW.audio, 'music', 'audio.music', data.music);
    for (const s of this.systems) call(s, 'onMapLoad', 'system.onMapLoad', map);
    this.emit('mapLoad', map);
    this._trackRoom();
    if (data.onEnter) HW.scripts.run(data.onEnter, { map }, { blocking: false });
    return map;
  },

  /**
   * Transfer to another map with optional fade. `auto` marks player-initiated transfers
   * (exits/doors), which checkpoint when it's safe.
   */
  async transfer(mapId, at, { fade = true, dir, auto = false, color = '#000' } = {}) {
    if (this.transferring) return false;
    if (!HW.data.maps[mapId]) {
      console.error(`[game] transfer to unknown map '${mapId}'`);
      return false;
    }
    this.transferring = true;
    call(HW.ui, 'prompt', 'ui.prompt', null, null);
    const t = HW.debug?.autoAdvance ? 0.02 : FADE_TIME;
    const from = HW.map?.id;
    try {
      if (fade) await bounded(call(HW.fx, 'fade', 'fx.fade', 'out', t, color), t);
      this.loadMap(mapId, at, { dir });
      HW.debug?.record?.('transfer', null, null, `${from || '-'}>${mapId}:${typeof at === 'string' ? at : JSON.stringify(at)}${fade ? '' : ':seamless'}`);
      this.emit('transfer', mapId, from, fade);
      if (auto && this.canCheckpoint()) this.checkpoint('transfer');
      if (fade) await bounded(call(HW.fx, 'fade', 'fx.fade', 'in', t, color), t);
    } catch (e) {
      report('transfer', e);
    } finally {
      this.transferring = false;
    }
    return true;
  },

  /** Exits & triggers under the player's feet. */
  _checkZones() {
    const map = HW.map;
    const p = HW.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    const play = this.mode === 'play' && !this.transferring;
    const exit = map.exitAt(tx, ty, HW.state);
    if (!exit) {
      this._exitArmed = true;
    } else if (this._exitArmed && play) {
      this._exitArmed = false;
      this.transfer(exit.to, exit.anchor, { fade: exit.fade !== false, dir: exit.dir, auto: true });
      return;
    }
    const trig = map.triggers;
    for (let i = 0; i < trig.length; i++) {
      const t = trig[i];
      const inside = rectHas(t.rect, tx, ty);
      const was = this._trigInside[i];
      this._trigInside[i] = inside;
      if (!inside || was || !play) continue;
      if (t.once && HW.state.flags[t.flag]) continue;
      if (t.cond) {
        let ok = false;
        try { ok = !!t.cond(HW.state); } catch (e) { report(`trigger ${t.id} cond`, e); }
        if (!ok) continue;
      }
      if (t.once) HW.state.flags[t.flag] = true;
      HW.debug?.record?.('trigger', null, null, `${map.id}:${t.id}`);
      HW.scripts.run(t.script, { trigger: t, map }, { blocking: t.blocking !== false });
      break;
    }
  },

  _trackRoom() {
    const p = HW.player;
    if (!p || !HW.map) return;
    const r = HW.map.roomAt(p.x, p.y);
    if (r === this.room) return;
    const prev = this.room;
    this.room = r;
    if (r) {
      const first = !HW.state.visited[r.id];
      HW.state.visited[r.id] = true;
      this.emit('roomEnter', r, prev, first);
    }
  },

  // ---------------------------------------------------------------------------------- props
  /** Set a prop's state on the current map, or persist it for a map that isn't loaded. */
  setProp(id, state, params) {
    if (HW.map?.prop(id)) return HW.map.setPropState(id, state, params);
    const mapId = this.findPropMap(id);
    if (!mapId) { console.warn(`[game] setProp: unknown prop '${id}'`); return null; }
    const ms = HW.state.mapState[mapId] || (HW.state.mapState[mapId] = {});
    const rec = ms[id] || (ms[id] = {});
    if (state !== undefined && state !== null) rec.state = state;
    if (params) rec.params = { ...(rec.params || {}), ...params };
    return null;
  },

  removeProp(id) {
    if (HW.map?.prop(id)) return HW.map.removeProp(id);
    const mapId = this.findPropMap(id);
    if (!mapId) { console.warn(`[game] removeProp: unknown prop '${id}'`); return null; }
    const ms = HW.state.mapState[mapId] || (HW.state.mapState[mapId] = {});
    ms[id] = { ...(ms[id] || {}), taken: true };
    return null;
  },

  /** Which map defines a prop id (built lazily by instantiating map runtimes without rendering). */
  findPropMap(id) {
    if (!this._propIndex) {
      this._propIndex = new Map();
      for (const [mapId, data] of Object.entries(HW.data.maps)) {
        try {
          const m = new MapRuntime(data, null);
          for (const p of m.allProps) this._propIndex.set(p.id, mapId);
        } catch (e) {
          report(`index map ${mapId}`, e);
        }
      }
    }
    return this._propIndex.get(id) || null;
  },

  /** Re-evaluate conditional objects and party followers (TECH §5.2). */
  refresh() {
    if (!HW.map) return;
    HW.map.refresh(HW.state);
    HW.entities.syncParty();
    this.emit('refresh');
  },

  // ---------------------------------------------------------------------------------- flow
  /** Title screen → new game / load. Sets window.__ready once the title is up. */
  async toTitle() {
    HW.scripts.abortAll();
    call(HW.compact, 'close', 'compact.close', true);
    call(HW.ui, 'reset', 'ui.reset');
    HW.entities.reset();
    HW.map = null;
    this.room = null;
    this.transferring = false;
    this.setMode('title');
    const token = ++this._titleToken;
    let pending = null;
    try {
      pending = HW.ui?.title?.();
    } catch (e) {
      report('ui.title', e);
    }
    HW.debug?.markReady?.();
    let r = null;
    try {
      r = await pending;
    } catch (e) {
      report('ui.title', e);
    }
    if (token !== this._titleToken || this.mode !== 'title') return; // superseded (load / debug newGame)
    if (r && r.action === 'load' && r.slot !== undefined && r.slot !== null) {
      if (!this.loadSave(r.slot)) this.toTitle();
    } else {
      this.newGame();
    }
  },

  /**
   * Start a new game. Runs 'pro.start' if it exists; with skipIntro runs 'pro.skip' if present,
   * else drops the player at exterior:start (or the test map). Resolves when the intro script
   * finishes or the first map is loaded.
   */
  async newGame({ skipIntro = false } = {}) {
    HW.scripts.abortAll();
    this._titleToken++;
    call(HW.ui, 'close', 'ui.close', 'title');
    call(HW.ui, 'reset', 'ui.reset');
    HW.state = createState();
    call(HW.flashlight, 'reset', 'flashlight.reset');
    call(HW.compact, 'close', 'compact.close', true);
    HW.entities.reset();
    HW.map = null;
    this.transferring = false;
    this.setMode('play');
    this.emit('newGame', { skipIntro });
    const S = HW.data.scripts || {};
    if (!skipIntro && S['pro.start']) return HW.scripts.run('pro.start');
    if (skipIntro && S['pro.skip']) return HW.scripts.run('pro.skip');
    const [mapId, anchor] = skipIntro && HW.data.maps.exterior ? ['exterior', 'start'] : NEW_GAME_FALLBACK;
    this.loadMap(mapId, anchor);
    this.checkpoint('new game');
    call(HW.fx, 'fade', 'fx.fade', 'in', HW.debug?.autoAdvance ? 0.01 : 0.8, '#000');
    return undefined;
  },

  /** Where the player "really" stands (not inside a desk or locker) for saving. */
  _savePosition() {
    const p = HW.player;
    const pre = HW.hiding?.restorePoint?.();
    if (pre) return pre;
    return { x: p.x, y: p.y, dir: p.dir };
  },

  /** Write a save slot ('auto' | '1' | '2' | '3'). */
  save(slot) {
    if (!HW.map || !HW.player) return false;
    const s = HW.state;
    const pos = this._savePosition();
    s.map = HW.map.id;
    s.px = pos.x;
    s.py = pos.y;
    s.dir = pos.dir;
    const summary = {
      chapter: s.chapter,
      chapterTitle: chapterTitle(s.chapter),
      map: HW.map.id,
      mapName: HW.map.name,
      room: this.room?.name || null,
      playtime: Math.floor(s.playtime),
      date: new Date().toISOString(),
      objective: s.objective || '',
    };
    saves.write(slot, cloneState(s), summary);
    this.emit('save', slot);
    return true;
  },

  /** Alias of save(slot) (used by the UI's save screen). */
  saveTo(slot) {
    return this.save(slot);
  },

  /** Summaries for the save/load screen: [{ slot, summary | null }]. */
  saves() {
    return saves.list();
  },

  /** Summary of one slot: { chapter, chapterTitle, map, mapName, room, playtime, date, objective } | null. */
  saveSummary(slot) {
    return saves.read(slot)?.summary || null;
  },

  hasSave(slot) {
    return saves.exists(slot);
  },

  /** Load a slot; returns false if it doesn't exist. */
  loadSave(slot) {
    const data = saves.read(slot);
    if (!data) return false;
    HW.scripts.abortAll();
    this._titleToken++;
    call(HW.ui, 'close', 'ui.close', 'title');
    call(HW.ui, 'reset', 'ui.reset');
    HW.state = normalizeState(cloneState(data.state));
    call(HW.flashlight, 'reset', 'flashlight.reset');
    call(HW.compact, 'close', 'compact.close', true);
    HW.entities.reset();
    this.transferring = false;
    this.setMode('play');
    try {
      this.loadMap(HW.state.map, { x: HW.state.px, y: HW.state.py }, { dir: HW.state.dir });
    } catch (e) {
      report('loadSave', e);
      return false;
    }
    call(HW.fx, 'fade', 'fx.fade', 'in', HW.debug?.autoAdvance ? 0.01 : 0.6, '#000');
    this.emit('load', slot);
    return true;
  },

  /** Saving allowed from the pause menu (TECH §7). */
  canSave() {
    return !!HW.map && (this.mode === 'play' || this.mode === 'menu') && !HW.scripts.blocking
      && !this.transferring && !HW.periods?.active && HW.colonel?.mode !== 'chase';
  },

  canCheckpoint() {
    return !!HW.map && !HW.periods?.active && HW.colonel?.mode !== 'chase' && !HW.scripts.blocking;
  },

  /** Autosave to slot 'auto'. */
  checkpoint(label = '') {
    if (!this.save('auto')) return false;
    this.emit('checkpoint', label);
    HW.debug?.record?.('checkpoint', null, null, label);
    return true;
  },

  /** Game over → UI → reload the checkpoint (or the title). */
  async gameOver(reason = 'caught') {
    if (HW.debug?.god) {
      console.info(`[game] game over suppressed (god mode): ${reason}`);
      return;
    }
    if (this.mode === 'gameover') return;
    HW.scripts.abortAll();
    call(HW.compact, 'close', 'compact.close', true);
    call(HW.ui, 'prompt', 'ui.prompt', null, null);
    this.setMode('gameover');
    HW.debug?.record?.('gameover', null, null, reason);
    this.emit('gameOver', reason);
    let r = 'retry';
    try {
      r = (await HW.ui?.gameOver?.(reason)) || 'retry';
    } catch (e) {
      report('ui.gameOver', e);
    }
    if (this.mode !== 'gameover') return;
    if (r === 'title') { this.toTitle(); return; }
    if (!this.loadSave('auto')) this.newGame();
  },

  /** Ending sequence: 'end.<id>' script, then credits, then the title. */
  async ending(id) {
    HW.state.flags.ending = id;
    this.setMode('ending');
    this.emit('ending', id);
    HW.debug?.record?.('ending', null, null, id);
    if (HW.scripts.has(`end.${id}`)) await HW.scripts.run(`end.${id}`, { ending: id }, { blocking: true });
    if (this.mode !== 'ending') return;
    try {
      await HW.ui?.open?.('credits');
    } catch (e) {
      report('ui.open(credits)', e);
    }
    if (this.mode === 'ending') this.toTitle();
  },

  // ---------------------------------------------------------------------------------- items
  /**
   * Use an item or an item action: item id ('battery') → ITEMS[id].use; or the action itself:
   * 'engine:toggle_flashlight' | 'engine:use_battery' | 'engine:use_compact' |
   * 'engine:open_sketchbook' | 'doc:<docId>' | a script id (run once menus are closed).
   */
  async useItem(id) {
    let action = id;
    let ctx = {};
    if (ITEMS[id]) {
      action = ITEMS[id].use;
      ctx = { item: id };
      if (!action) return false;
    }
    switch (action) {
      case 'engine:toggle_flashlight': return !!HW.flashlight?.toggle?.();
      case 'engine:use_battery': return !!HW.flashlight?.useBattery?.();
      case 'engine:use_compact':
        await this._whenPlayable();
        return !!HW.compact?.use?.();
      case 'engine:open_sketchbook':
        if (this.mode === 'menu') { HW.ui?.open?.('sketchbook'); return true; }
        this.openMenu('sketchbook');
        return true;
      default:
        break;
    }
    if (typeof action === 'string' && action.startsWith('doc:')) {
      await this._whenPlayable();
      await HW.scripts.runFn((g) => g.doc(action.slice(4)), ctx, { id: `use:${id}` });
      return true;
    }
    if (HW.scripts.has(action)) {
      await this._whenPlayable();
      await HW.scripts.run(action, ctx);
      return true;
    }
    console.warn(`[game] useItem: nothing to do for '${id}'`);
    return false;
  },

  /** Inventory "Examine": item.examine (script id | 'doc:<id>') or Tess's description. */
  async examineItem(id) {
    const item = ITEMS[id];
    if (!item) return false;
    const ex = item.examine;
    await this._whenPlayable();
    if (ex && ex.startsWith('doc:')) {
      await HW.scripts.runFn((g) => g.doc(ex.slice(4)), { item: id }, { id: `examine:${id}` });
    } else if (ex && HW.scripts.has(ex)) {
      await HW.scripts.run(ex, { item: id });
    } else {
      const desc = typeof item.desc === 'function' ? item.desc(HW.state) : item.desc;
      await HW.scripts.runFn((g) => g.think('neutral', desc), { item: id }, { id: `examine:${id}` });
    }
    return true;
  },

  /** Resolve once the game is back in free play (menus closed). */
  _whenPlayable() {
    return this.until(() => this.mode === 'play' && !this._uiBusy(), 30);
  },
};

function safePred(pred) {
  try {
    return !!pred();
  } catch (e) {
    report('waiter', e);
    return true;
  }
}

export default game;
