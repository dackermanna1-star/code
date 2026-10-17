// Debug & test API (TECH §14).
//
// HW.debug holds the live flags other modules read:
//   HW.debug.autoAdvance (bool)  dialogue/choices/cards resolve instantly (the engine bypasses the
//                                UI for them and records a transcript); waits & fades are shortened
//   HW.debug.nextChoice()        shift the next index from the choice queue (or 0)
//   HW.debug.god (bool)          the Colonel can't catch; game over is suppressed
//   HW.debug.timeScale (number)  simulation speed multiplier
//   HW.debug.errors []           captured errors (window.onerror, unhandledrejection, console.error)
//   HW.debug.transcript []       every line said/thought/narrated, choices taken, items, triggers…
//
// window.__HW is the test-facing facade (functions per TECH §14, plus a few extras listed in
// `api` below). It shares the same queue/errors arrays as HW.debug.
import HW from './hw.js';
import { cloneState } from './state.js';
import { MapRuntime } from './map.js';
import { resolvePoint } from './entities.js';
import { setFlag, giveItem } from './script.js';

const TRANSCRIPT_MAX = 2000;

function fmt(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object') {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}

export const debug = {
  ready: false,
  autoAdvance: false,
  god: false,
  timeScale: 1,
  showGrid: false,
  fullbright: false,      // skip the lighting pass (layout screenshots)
  infiniteBattery: false,
  choiceQueue: [],
  /** Forced results for modal screens under autoAdvance: { safe: true, breath: ['failed', 'held'] }. */
  screenAnswers: {},
  errors: [],
  transcript: [],
  autopilotPath: null,
  _ap: null,

  /** Hook global error capture as early as possible. */
  install() {
    window.addEventListener('error', (e) => {
      this._err(`Uncaught: ${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}${e.error?.stack ? `\n${e.error.stack}` : ''}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      if (r && r.name === 'ScriptAbort') { e.preventDefault(); return; }
      this._err(`Unhandled rejection: ${r?.stack || r}`);
    });
    const orig = console.error.bind(console);
    console.error = (...args) => {
      this._err(args.map(fmt).join(' '));
      orig(...args);
    };
    window.__HW = api;
  },

  _err(msg) {
    if (this.errors.length < 500) this.errors.push(msg);
  },

  markReady() {
    this.ready = true;
    window.__ready = true;
  },

  /** Consulted by the UI under autoAdvance; undefined = let the UI pick its default. */
  screenAnswer(name) {
    const v = this.screenAnswers[name];
    if (Array.isArray(v)) return v.length ? v.shift() : undefined;
    return v;
  },

  nextChoice() {
    const q = this.choiceQueue;
    return q.length ? Number(q.shift()) || 0 : 0;
  },

  record(type, who, expr, text) {
    const t = this.transcript;
    if (t.length >= TRANSCRIPT_MAX) t.splice(0, t.length - TRANSCRIPT_MAX + 1);
    t.push({ type, who, expr, text, map: HW.map?.id || null, time: Math.round(HW.time * 100) / 100 });
  },

  /** Called once per fixed step before entities update: drives the autopilot. */
  update(dt) {
    const ap = this._ap;
    if (!ap) return;
    const input = HW.input;
    const p = HW.player;
    const done = (ok) => {
      this._releaseKeys();
      this._ap = null;
      this.autopilotPath = null;
      ap.resolve(ok);
    };
    if (!p || !HW.map) { done(false); return; }
    if (HW.map !== ap.map) { done(true); return; } // walked into an exit: the walk ended in a transfer
    ap.elapsed += dt;
    if (ap.elapsed > ap.timeout) { done(false); return; }
    if (!HW.game.controllable) {
      // A cutscene/menu interrupted us (trigger, door text): wait without holding keys.
      this._releaseKeys();
      ap.stuck = 0;
      return;
    }
    const [tx, ty] = ap.path[ap.i];
    const dx = tx - p.x;
    const dy = ty - p.y;
    const tol = (ap.run ? 100 : 60) * dt + 0.15;
    if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) {
      ap.i++;
      ap.best = Infinity;
      ap.stuck = 0;
      if (ap.i >= ap.path.length) {
        // Snap the last sub-pixel so tests can compare positions exactly.
        if (p.free(tx, ty)) { p.x = tx; p.y = ty; }
        done(true);
      }
      return;
    }
    input.setVirtual('left', dx < -tol);
    input.setVirtual('right', dx > tol);
    input.setVirtual('up', dy < -tol);
    input.setVirtual('down', dy > tol);
    input.setVirtual('run', !!ap.run);
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < ap.best - 0.25) { ap.best = d; ap.stuck = 0; } else ap.stuck += dt;
    if (ap.stuck > 0.8) {
      // Blocked (closed door just opened? NPC in the way?) — re-plan once, then give up.
      if (ap.replans++ >= 2) { done(false); return; }
      const path = HW.map.findPath([p.x, p.y], ap.goal, { doors: true });
      if (!path || !path.length) { done(false); return; }
      ap.path = path;
      ap.i = 0;
      ap.best = Infinity;
      ap.stuck = 0;
      this.autopilotPath = path;
    }
  },

  _releaseKeys() {
    const input = HW.input;
    for (const a of ['left', 'right', 'up', 'down', 'run']) input.setVirtual(a, false);
  },

  /** Walk the player with simulated input along an A* path. → Promise<bool>. */
  walkTo(target, { run = false, timeout = 60 } = {}) {
    if (this._ap) { this._releaseKeys(); this._ap.resolve(false); this._ap = null; }
    const p = HW.player;
    const map = HW.map;
    const goal = resolvePoint(target);
    if (!p || !map || !goal) return Promise.resolve(false);
    const path = map.findPath([p.x, p.y], [goal.x, goal.y], { doors: true });
    if (!path) return Promise.resolve(false);
    if (!path.length) return Promise.resolve(true);
    this.autopilotPath = path;
    return new Promise((resolve) => {
      this._ap = { map, path, i: 0, goal: [goal.x, goal.y], run, timeout, elapsed: 0, best: Infinity, stuck: 0, replans: 0, resolve };
    });
  },
};

/** Wait for n fixed steps. */
const steps = (n) => {
  let left = n + 1; // until() evaluates once immediately
  return HW.game.until(() => --left <= 0);
};

const idlePred = () => HW.game.mode === 'play' && !HW.scripts.blocking && !HW.game.transferring
  && !HW.game._uiBusy() && !HW.player?.busy && !debug._ap;

// ---------------------------------------------------------------------------------------------
// window.__HW
const api = {
  get ready() { return debug.ready; },
  get errors() { return debug.errors; },
  get transcript() { return debug.transcript; },
  get choiceQueue() { return debug.choiceQueue; },
  set choiceQueue(v) { debug.choiceQueue.length = 0; debug.choiceQueue.push(...(v || [])); },
  get debug() { return debug; },
  get HW() { return HW; },

  state() { return cloneState(HW.state); },
  mode() { return HW.game.mode; },
  map() { return HW.map?.id || null; },

  /** { x, y, tx, ty, dir, map, hidden, seated, still, visible } */
  player() {
    const p = HW.player;
    if (!p) return null;
    return {
      x: p.x, y: p.y, tx: Math.floor(p.x / 16), ty: Math.floor(p.y / 16), dir: p.dir, map: HW.map?.id || null,
      hidden: p.hidden, seated: p.seated?.id || null, still: p.still, visible: p.visible, room: HW.game.room?.id || null,
    };
  },

  /** Plain snapshot of a prop on the current map. */
  prop(id) {
    const p = HW.map?.prop(id);
    if (!p) return null;
    return { id: p.id, type: p.type, x: p.x, y: p.y, w: p.w, h: p.h, state: p.state, present: p.present, taken: p.taken, solid: p.solid, opaque: p.opaque, params: { ...p.params } };
  },

  async newGame(opts = {}) {
    await HW.game.newGame({ skipIntro: false, ...opts });
    await steps(2);
    return HW.game.mode;
  },

  async teleport(mapId, anchorOrTx, ty) {
    const at = typeof anchorOrTx === 'number' ? [anchorOrTx, ty] : anchorOrTx;
    if (HW.game.mode === 'title' || HW.game.mode === 'boot' || !HW.player) await HW.game.newGame({ skipIntro: true });
    if (debug._ap) { debug._releaseKeys(); debug._ap.resolve(false); debug._ap = null; }
    HW.compact?.close?.(true);
    if (!HW.map || HW.map.id !== mapId) HW.game.loadMap(mapId, at);
    else {
      const pt = resolvePoint(at);
      if (pt) {
        HW.player.resetTransient();
        HW.player.x = pt.x;
        HW.player.y = pt.y;
        if (pt.dir) HW.player.face(pt.dir);
        HW.entities.onPlayerMoved();
        HW.camera.snap();
      }
    }
    if (HW.game.mode !== 'play' && !HW.scripts.blocking) HW.game.setMode('play');
    await steps(2);
    return api.player();
  },

  setFlag(k, v = true) { setFlag(k, v); return v; },
  give(item, n = 1) { giveItem(item, n, true); return HW.state.inv[item]; },
  setChapter(n) { HW.state.chapter = n; HW.game.refresh(); return n; },
  face(dir) { HW.player?.face(dir); },
  refresh() { HW.game.refresh(); },

  run(scriptId, ctx = {}) { return HW.scripts.run(scriptId, ctx); },

  autoAdvance(on = true) { debug.autoAdvance = !!on; return debug.autoAdvance; },
  /** Force a modal screen's result under autoAdvance (value, or an array consumed in order). */
  screenAnswer(name, value) { debug.screenAnswers[name] = value; },
  fullbright(on = true) { debug.fullbright = !!on; return debug.fullbright; },
  showGrid(on = true) { debug.showGrid = !!on; return debug.showGrid; },
  god(on = true) { debug.god = !!on; return debug.god; },
  timeScale(x = 1) { debug.timeScale = Math.max(0.05, Math.min(64, Number(x) || 1)); return debug.timeScale; },

  /** Hold an input action for `ms` of game time. */
  async press(action, ms = 100) {
    HW.input.setVirtual(action, true);
    await HW.game.afterSteps(ms / 1000);
    HW.input.setVirtual(action, false);
    await steps(1);
  },

  walkTo(target, opts) { return debug.walkTo(target, opts); },

  /** Press confirm once and wait until the game is idle again. */
  async interact() {
    HW.input.tap('confirm');
    await steps(3);
    return api.idle();
  },

  /** Resolve when no cutscene/menu/transfer is active (or after `timeout` s of game time). */
  async idle(timeout = 60) {
    return HW.game.until(idlePred, timeout);
  },

  steps(n = 1) { return steps(n); },

  /** BFS reachability on the collision grid (current door states; closed doors count as open). */
  /** BFS reachability; opts.doors as MapRuntime.reachable (true | false | 'locks' | 'all'). */
  pathExists(mapId, from, to, { doors = true } = {}) {
    let map = HW.map;
    if (!map || map.id !== mapId) {
      const data = HW.data.maps[mapId];
      if (!data) throw new Error(`pathExists: unknown map ${mapId}`);
      map = new MapRuntime(data, HW.state);
    }
    const pt = (v) => {
      if (typeof v === 'string') return map.anchor(v);
      if (Array.isArray(v)) return { x: v[0] * 16 + 8, y: v[1] * 16 + 12 };
      return v;
    };
    const a = pt(from);
    const b = pt(to);
    if (!a || !b) throw new Error('pathExists: bad endpoints');
    return map.reachable([a.x, a.y], [b.x, b.y], { doors });
  },

  save(slot = '1') { return HW.game.save(slot); },
  load(slot = '1') { return HW.game.loadSave(slot); },
  checkpoint(label = 'debug') { return HW.game.checkpoint(label); },
};

export default debug;
