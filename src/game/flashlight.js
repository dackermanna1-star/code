// Tess's Maglite (TECH §11): battery drain (100 → 0 in ~300 s while on), low-battery flicker
// below 20 %, smooth aim along her facing, toggle / battery swap, and scripted overrides.
// Writes HW.lighting.flashlight = { on, x, y, angle, power, flicker } every step.
//
// Cutscenes: the battery doesn't drain while a cutscene runs and the beam holds its last aim.
// Scripts take explicit control with g.flashlight(true | false | 'restore'). Set
// `flashlight.offInCutscenes = true` to switch the beam off during cutscenes instead.
import HW from '../engine/hw.js';
import { DIR_ANGLE } from '../engine/entities.js';

const DRAIN_PER_SEC = 100 / 300;
const LOW = 20;
const AIM_RATE = 11;           // 1/s smoothing toward the facing angle
const HOLD_HEIGHT = 9;         // px above the feet (hand height)

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
  _burstT: 0,       // remaining time of a flicker burst
  _burstStep: 0,
  _burstLevel: 1,
  _nextBurst: 4,
  _beam: null,      // fallback object when lighting has none

  /** Is the beam emitting light right now? */
  get on() {
    const s = HW.state;
    if (!s) return false;
    if (this.forced !== null) return this.forced && (s.battery > 0 || this.forced === true);
    return !!s.flashlightOn && (s.inv.flashlight || 0) > 0 && s.battery > 0;
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
    if (!s || !(s.inv.flashlight > 0)) return false;
    s.flashlightOn = !s.flashlightOn;
    HW.audio?.sfx?.('flashlight_click');
    if (s.flashlightOn && s.battery <= 0) HW.ui?.toast?.('The batteries are dead.');
    return s.flashlightOn;
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
    let on = this.on && !p.hidden;
    if (cutscene && this.offInCutscenes && this.forced === null) on = false;

    // Drain only in free play while the switch is on.
    if (on && this.forced === null && mode === 'play' && !HW.debug?.infiniteBattery) {
      s.battery = Math.max(0, s.battery - DRAIN_PER_SEC * dt);
      if (s.battery <= 0) {
        HW.audio?.sfx?.('flashlight_flicker');
        HW.game.emit('batteryDead');
      }
    }

    // Aim: ease toward the movement/facing direction.
    if (!cutscene || p.path) {
      const target = Math.atan2(p.aimY, p.aimX);
      const k = 1 - Math.exp(-dt * AIM_RATE);
      this.angle = wrapAngle(this.angle + wrapAngle(target - this.angle) * k);
    }

    // Power: full above 20 %, dimming toward 45 % as the cells die, plus flicker bursts.
    const b = s.battery;
    let power = b >= LOW ? 1 : 0.45 + 0.55 * (b / LOW);
    let flicker = 0;
    if (on && b < LOW && this.forced === null) {
      flicker = 0.3;
      if (this._burstT > 0) {
        this._burstT -= dt;
        this._burstStep -= dt;
        if (this._burstStep <= 0) {
          this._burstStep = 0.03 + Math.random() * 0.07;
          this._burstLevel = Math.random() < 0.45 ? 0.08 + Math.random() * 0.2 : 0.7 + Math.random() * 0.3;
        }
        power *= this._burstLevel;
        flicker = 1;
      } else {
        this._nextBurst -= dt;
        if (this._nextBurst <= 0) {
          this._burstT = 0.25 + Math.random() * 0.5;
          this._burstStep = 0;
          // Bursts come more often as the battery dies.
          this._nextBurst = (1.5 + Math.random() * 5) * (0.35 + b / LOW);
          HW.audio?.sfx?.('flashlight_flicker', { x: p.x, y: p.y, vol: 0.5 });
        }
      }
    }
    this.power = on ? power : 0;

    L.on = on;
    L.angle = this.angle;
    L.x = p.x + Math.cos(this.angle) * 4;
    L.y = p.y - HOLD_HEIGHT + Math.sin(this.angle) * 3;
    L.power = this.power;
    L.flicker = flicker;
  },
};

export default flashlight;
