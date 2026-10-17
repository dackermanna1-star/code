// Tess's light (TECH §11, DESIGN v2 §9.5).
//   Maglite: drains 100 → 0 in ~600 s while on; flickers below 20 %; at 0 % runs on the "dregs"
//            (power ≈ 0.15 with irregular dropouts — never fully black).
//   Danny's flashlight: a weak, narrow beam (power 0.35) that never dies ('engine:use_danny_flashlight').
// Smooth aim along her facing, toggle / battery swap, scripted overrides. Writes
// HW.lighting.flashlight = { on, x, y, angle, power, flicker, cone, color, source } every step.
//
// Cutscenes: the battery doesn't drain while a cutscene runs and the beam holds its last aim.
// Scripts take explicit control with g.flashlight(true | false | 'restore'). Set
// `flashlight.offInCutscenes = true` to switch the beam off during cutscenes instead.
import HW from '../engine/hw.js';
import { DIR_ANGLE } from '../engine/entities.js';
import { LIGHT_COLORS } from '../art/palette.js';

const DRAIN_PER_SEC = 100 / 600;
const LOW = 20;
const DREGS = 0.15;
const AIM_RATE = 11;           // 1/s smoothing toward the facing angle
const HOLD_HEIGHT = 9;         // px above the feet (hand height)
const SOURCES = {
  maglite: { item: 'flashlight', cone: (55 * Math.PI) / 180, color: LIGHT_COLORS.flashlight, power: 1 },
  danny: { item: 'danny_flashlight', cone: (32 * Math.PI) / 180, color: '#ffe0c8', power: 0.35 },
};

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const flashlight = {
  /** null = player-controlled; true/false = forced by a script. */
  forced: null,
  offInCutscenes: false,
  angle: Math.PI / 2,
  power: 1,
  _burstT: 0,       // remaining time of a flicker burst / dregs dropout
  _burstStep: 0,
  _burstLevel: 1,
  _nextBurst: 4,
  _beam: null,      // fallback object when lighting has none

  /** 'maglite' | 'danny' (persisted in HW.state.lightSource). */
  get source() {
    const s = HW.state?.lightSource;
    return SOURCES[s] ? s : 'maglite';
  },

  /** Is the beam switched on (it may still be weak)? */
  get on() {
    const s = HW.state;
    if (!s) return false;
    if (this.forced !== null) return this.forced;
    return !!s.flashlightOn && (s.inv[SOURCES[this.source].item] || 0) > 0;
  },

  reset() {
    this.forced = null;
    this._burstT = 0;
    this._nextBurst = 4;
    this.power = 1;
    const p = HW.player;
    this.angle = p ? DIR_ANGLE[p.dir] : Math.PI / 2;
  },

  onMapLoad() {
    const p = HW.player;
    if (p) this.angle = Math.atan2(p.aimY, p.aimX);
  },

  /** F / inventory "Use": click the switch. Returns the new on/off intent. */
  toggle() {
    const s = HW.state;
    if (!s || !(s.inv[SOURCES[this.source].item] > 0)) {
      if (s?.inv.danny_flashlight > 0) return this.useSource('danny');
      if (s?.inv.flashlight > 0) return this.useSource('maglite');
      return false;
    }
    s.flashlightOn = !s.flashlightOn;
    HW.audio?.sfx?.('flashlight_click');
    return s.flashlightOn;
  },

  /** Switch to a light source and turn it on (item "Use"); using the active one toggles it. */
  useSource(name) {
    const s = HW.state;
    const src = SOURCES[name];
    if (!s || !src || !(s.inv[src.item] > 0)) return false;
    if (this.source === name) return this.toggle();
    s.lightSource = name;
    s.flashlightOn = true;
    this._burstT = 0;
    HW.audio?.sfx?.('flashlight_click');
    return true;
  },

  /** Swap in fresh D cells from the inventory. */
  useBattery() {
    const s = HW.state;
    if (!s || !(s.inv.battery > 0)) {
      HW.ui?.toast?.('No batteries.');
      return false;
    }
    s.inv.battery -= 1;
    if (s.inv.battery <= 0) delete s.inv.battery;
    s.battery = 100;
    s.lightSource = 'maglite';
    s.flashlightOn = true;
    this._burstT = 0;
    HW.audio?.sfx?.('battery_swap');
    HW.ui?.toast?.('Fresh batteries.');
    HW.game?.emit?.('item', 'battery', s.inv.battery || 0);
    return true;
  },

  /** Script override: true | false | 'restore' (back to the player's switch). */
  force(mode) {
    this.forced = mode === 'restore' || mode === null || mode === undefined ? null : !!mode;
  },

  update(dt) {
    const L = HW.lighting ? (HW.lighting.flashlight || (HW.lighting.flashlight = {})) : (this._beam || (this._beam = {}));
    const p = HW.player;
    const s = HW.state;
    if (!p || !HW.map || !s) { L.on = false; L.power = 0; return; }
    const mode = HW.game.mode;
    const cutscene = mode === 'cutscene' || mode === 'ending';
    const srcName = this.source;
    const src = SOURCES[srcName];
    let on = this.on && !p.hidden;
    if (cutscene && this.offInCutscenes && this.forced === null) on = false;
    const maglite = srcName === 'maglite';

    // Drain only in free play while the Maglite is on.
    if (on && maglite && this.forced === null && mode === 'play' && !HW.debug?.infiniteBattery && s.battery > 0) {
      s.battery = Math.max(0, s.battery - DRAIN_PER_SEC * dt);
      if (s.battery <= 0) {
        HW.audio?.sfx?.('flashlight_flicker');
        HW.game.emit('batteryDead');
      }
    }

    // Aim: ease toward the movement/facing direction.
    this._aim(dt, p, cutscene);

    // Power: Danny's is steady and weak. The Maglite is full above 20 %, dims toward 45 % with
    // flicker bursts below it, and runs on the dregs at 0 %.
    const b = s.battery;
    let power = src.power;
    let flicker = 0;
    if (maglite && this.forced === null && on) {
      if (b <= 0) power = DREGS;
      else if (b < LOW) power = 0.45 + 0.55 * (b / LOW);
      if (b < LOW) {
        flicker = 0.3;
        power *= this._flicker(dt, b, p);
        if (this._burstT > 0) flicker = 1;
      }
    }
    this.power = on ? power : 0;

    L.on = on;
    L.angle = this.angle;
    L.x = p.x + Math.cos(this.angle) * 4;
    L.y = p.y - HOLD_HEIGHT + Math.sin(this.angle) * 3;
    L.power = this.power;
    L.flicker = flicker;
    L.cone = src.cone;
    L.color = src.color;
    L.source = srcName;
  },

  /**
   * Beam aim. In free play (and scripted walks) it eases toward Tess's aim vector. In cutscenes it
   * holds still — until her facing changes (g.face('tess', dir | target), a turn at the end of a
   * walk), then it swings smoothly to the new aim and holds there. A script that writes
   * HW.flashlight.angle directly is a manual override: that angle holds until her next turn.
   */
  _aim(dt, p, cutscene) {
    const k = 1 - Math.exp(-dt * AIM_RATE);
    if (!cutscene || p.path) {
      const target = Math.atan2(p.aimY, p.aimX);
      this.angle = wrapAngle(this.angle + wrapAngle(target - this.angle) * k);
      this._aimTarget = null;
    } else {
      if (this._wrote !== undefined && this.angle !== this._wrote) this._aimTarget = null; // manual override
      else if ((p.aimSeq | 0) !== this._seenSeq || p.dir !== this._seenDir) {
        // She turned: aim along her aim vector (g.face toward a point sets it exactly), unless it is
        // stale against her facing (a system set p.dir directly) — then along the facing.
        let a = Math.atan2(p.aimY, p.aimX);
        const da = DIR_ANGLE[p.dir];
        if (da !== undefined && Math.abs(wrapAngle(a - da)) > 1.25) a = da;
        this._aimTarget = a;
      }
      if (this._aimTarget !== null && this._aimTarget !== undefined) {
        const d = wrapAngle(this._aimTarget - this.angle);
        if (Math.abs(d) < 0.002) { this.angle = this._aimTarget; this._aimTarget = null; }
        else this.angle = wrapAngle(this.angle + d * k);
      }
    }
    this._seenSeq = p.aimSeq | 0;
    this._seenDir = p.dir;
    this._wrote = this.angle;
  },

  /** Low-battery flicker bursts (more frequent as the cells die); dregs dropouts never reach 0. */
  _flicker(dt, b, p) {
    if (this._burstT > 0) {
      this._burstT -= dt;
      this._burstStep -= dt;
      if (this._burstStep <= 0) {
        this._burstStep = 0.03 + Math.random() * 0.07;
        const deep = Math.random() < 0.45;
        this._burstLevel = b <= 0
          ? (deep ? 0.35 + Math.random() * 0.2 : 0.75 + Math.random() * 0.25)
          : (deep ? 0.08 + Math.random() * 0.2 : 0.7 + Math.random() * 0.3);
      }
      return this._burstLevel;
    }
    this._nextBurst -= dt;
    if (this._nextBurst <= 0) {
      this._burstT = 0.25 + Math.random() * 0.5;
      this._burstStep = 0;
      this._nextBurst = (1.5 + Math.random() * 5) * (0.35 + Math.max(0, b) / LOW);
      HW.audio?.sfx?.('flashlight_flicker', { x: p.x, y: p.y, vol: 0.5 });
    }
    return 1;
  },
};

export default flashlight;
