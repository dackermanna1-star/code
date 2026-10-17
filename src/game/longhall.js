// HW.longhall — the hall that loops (DESIGN §6 V.4, rule R4; CONTENT §5.6).
//
// Active on a map whose data has `longhall: { loopFromX, loopToX, kevinStopX }` (tile x) while flag
// longhall_cleared is unset.
//   WITHOUT the hall pass (item hall_pass): crossing x = loopFromX westward teleports Tess (and the
//     camera and followers) by (loopToX − loopFromX) tiles — seamless if the hall repeats itself
//     around both x's. Each loop: flag longhall_loops++, one ambience layer stripped
//     (HW.audio.stripAmbience), hall clocks +1 minute (HW.periods.clockBias), and the non-blocking
//     script `ch5.longhall_loop` runs with ctx { loop }; at loop 4 also `ch5.longhall_voice`
//     (non-blocking, ctx { loop }). Walking EAST is never touched: the map's east exit works as normal.
//   RUNNING (any time): the blocking script `ch5.kevin_whistle` (whistle → blackout → reset, breath
//     at the neck — the script does all of it, e.g. g.setPos('tess', 'loop_reset')).
//   WITH the pass: reaching x ≤ kevinStopX runs the blocking script `ch5.kevin_pass` once (ctx
//     { kevin }); the script takes the pass and sets longhall_cleared, after which this system is off.
// A Kevin sentinel (no whistle of his own — this system handles running) is spawned at anchor
// 'kevin' on entry if none exists.
//
// Seamless-loop requirement for map authors: the camera must not be clamped at either x, i.e.
// loopFromX ≥ 16 and loopToX ≤ map width − 16 tiles (the view is 30 tiles wide), and the hall's
// look should repeat with period (loopToX − loopFromX).
//
// API
//   active · loops (this visit's total = flag longhall_loops) · config
//   loop()     force one loop now (tests / scripts)
import HW from '../engine/hw.js';
import periods, { inFreePlay } from './periods.js';
import patrol from './patrol.js';

const TILE = 16;

export const longhall = {
  config: null,
  _prevX: null,
  _whistling: false,
  _whistleCool: 0,
  _passing: false,
  _passDone: false,
  _hooked: false,

  get active() {
    return !!this.config && !HW.state?.flags?.longhall_cleared;
  },

  get loops() {
    return Number(HW.state?.flags?.longhall_loops) || 0;
  },

  get hasPass() {
    return (HW.state?.inv?.hall_pass || 0) > 0;
  },

  /** Teleport one loop east (seamless). */
  loop() {
    const c = this.config;
    const p = HW.player;
    if (!c || !p) return 0;
    const dx = (c.loopToX - c.loopFromX) * TILE;
    p.x += dx;
    if (HW.camera) HW.camera.x += dx;
    // Followers keep their place behind her (the trail is re-laid where she now stands).
    HW.entities?.onPlayerMoved?.();
    this._prevX = p.x;
    const n = this.loops + 1;
    HW.state.flags.longhall_loops = n;
    HW.audio?.stripAmbience?.(n);
    periods.clockBias = n;
    HW.debug?.record?.('longhall', null, null, `loop:${n}`);
    HW.game?.emit?.('longhallLoop', n);
    if (HW.scripts?.has?.('ch5.longhall_loop')) HW.scripts.run('ch5.longhall_loop', { loop: n, map: HW.map }, { blocking: false });
    if (n === 4 && HW.scripts?.has?.('ch5.longhall_voice')) HW.scripts.run('ch5.longhall_voice', { loop: n, map: HW.map }, { blocking: false });
    return n;
  },

  async _whistle() {
    this._whistling = true;
    this._whistleCool = 2;
    HW.debug?.record?.('longhall', null, null, 'whistle');
    try {
      if (HW.scripts?.has?.('ch5.kevin_whistle')) await HW.scripts.run('ch5.kevin_whistle', { map: HW.map, kevin: HW.entities.get('kevin') });
      else HW.audio?.sfx?.('whistle');
    } finally {
      this._whistling = false;
      this._prevX = HW.player?.x ?? null;
    }
  },

  async _pass() {
    this._passing = true;
    HW.debug?.record?.('longhall', null, null, 'pass');
    try {
      if (HW.scripts?.has?.('ch5.kevin_pass')) await HW.scripts.run('ch5.kevin_pass', { map: HW.map, kevin: HW.entities.get('kevin') });
    } finally {
      this._passing = false;
      this._passDone = true;
    }
    if (HW.state?.flags?.longhall_cleared) this._off();
  },

  _off() {
    HW.audio?.stripAmbience?.(0);
    periods.clockBias = 0;
  },

  _hook() {
    if (this._hooked || !HW.game?.on) return;
    this._hooked = true;
    HW.game.on('flag', (name, v) => { if (name === 'longhall_cleared' && v && this.config) this._off(); });
  },

  onMapLoad(map) {
    this._hook();
    const c = map?.data?.longhall;
    this.config = c && Number.isFinite(c.loopFromX) && Number.isFinite(c.loopToX) ? { ...c } : null;
    this._prevX = HW.player?.x ?? null;
    this._whistling = false;
    this._passing = false;
    this._passDone = false;
    if (!this.config) { periods.clockBias = 0; return; }
    if (!this.active) { this._off(); return; }
    // The hall remembers: re-entering keeps its stripped ambience and its fast clocks.
    const n = this.loops;
    if (n) HW.audio?.stripAmbience?.(n, 0.5);
    periods.clockBias = n;
    if (!HW.entities.get('kevin') && map.anchor('kevin')) patrol.spawn('kevin', { at: 'kevin', dir: 'right', whistle: false });
  },

  update(dt) {
    this._hook();
    if (!this.active) return;
    if (this._whistleCool > 0) this._whistleCool -= dt;
    const p = HW.player;
    if (!p || !inFreePlay() || this._whistling || this._passing) { this._prevX = p?.x ?? null; return; }
    const c = this.config;
    const prev = this._prevX ?? p.x;
    this._prevX = p.x;
    if (p.running && this._whistleCool <= 0) { this._whistle(); return; }
    if (this.hasPass) {
      if (!this._passDone && Number.isFinite(c.kevinStopX) && p.x <= c.kevinStopX * TILE + 8) this._pass();
      return;
    }
    const edge = c.loopFromX * TILE;
    if (prev >= edge && p.x < edge) this.loop();
  },
};

export default longhall;
