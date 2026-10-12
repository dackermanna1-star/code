// User settings with defaults, persisted to localStorage when available.

export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  turnLeft: ['ArrowLeft'],
  turnRight: ['ArrowRight'],
  fire: ['Mouse0', 'ControlLeft'],
  ads: ['Mouse2'],
  use: ['KeyE'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlRight'],
  sprint: ['ShiftLeft'],
  walk: ['AltLeft'],
  reload: ['KeyR'],
  melee: ['KeyV'],
  nextWeapon: ['WheelDown', 'BracketRight'],
  prevWeapon: ['WheelUp', 'BracketLeft'],
  lastWeapon: ['KeyQ'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  weapon5: ['Digit5'],
  weapon6: ['Digit6'],
  weapon7: ['Digit7'],
  automap: ['Tab'],
  quickSave: ['F6'],
  quickLoad: ['F9'],
};

export const BIND_LABELS = {
  forward: 'move forward', back: 'move backward', strafeLeft: 'strafe left', strafeRight: 'strafe right',
  turnLeft: 'turn left', turnRight: 'turn right', fire: 'fire', ads: 'aim down sights', use: 'use / open',
  jump: 'jump', crouch: 'crouch / slide', sprint: 'sprint', walk: 'walk', reload: 'reload', melee: 'quick melee',
  nextWeapon: 'next weapon', prevWeapon: 'previous weapon', lastWeapon: 'last weapon',
  weapon1: 'fist / chainsaw', weapon2: 'pistol', weapon3: 'shotgun', weapon4: 'chaingun', weapon5: 'rocket launcher',
  weapon6: 'plasma rifle', weapon7: 'bfg 9000', automap: 'automap', quickSave: 'quick save', quickLoad: 'quick load',
};

export const DEFAULTS = {
  // Controls
  mouseSensitivity: 1.0,
  invertY: false,
  mouseLook: true,
  rawInput: true,
  alwaysRun: true,
  adsToggle: false,
  gamepadSensitivity: 1.0,
  gamepadDeadzone: 0.15,
  gamepadInvertY: false,
  aimAssist: 0.3,
  // Gameplay
  skill: 2,
  autoaim: false,
  modernAI: true,
  allowJump: true,
  allowCrouch: true,
  allowSprint: true,
  allowSlide: true,
  autoReload: true,
  useMagazines: true,
  fastSwitch: true,
  quickMelee: true,
  autoSwitch: true,
  locationalDamage: true,
  airControl: 0.08,
  sprintSpeed: 1.3,
  // Feel
  recoil: 1.0,
  viewBob: 1.0,
  weaponBob: 1.0,
  weaponSway: 1.0,
  screenShake: 1.0,
  crosshair: 1,
  hitMarkers: true,
  damageIndicators: true,
  // Video
  fov: 90,
  adsZoom: true,
  renderScale: '2',
  aspectCorrect: true,
  smoothLighting: false,
  dynamicLights: true,
  gamma: 0,
  scanlines: false,
  hud: 'classic',
  messages: true,
  secretMessages: true,
  showFps: false,
  reduceFlashes: false,
  // Effects
  gore: 2,
  dismemberment: true,
  physics: true,
  particles: 2,
  maxDecals: 600,
  corpseLifetime: 0,
  shellCasings: true,
  knockback: 1.6,
  // Audio
  sfxVolume: 0.8,
  musicVolume: 0.55,
  reverb: true,
  occlusion: true,
  pitchVariation: true,
  extraSounds: true,
  hrtf: false,
  // Bindings
  binds: DEFAULT_BINDS,
};

const KEY = 'doom-modern-settings-v1';

export class Settings {
  constructor() {
    this.values = structuredClone(DEFAULTS);
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(saved)) {
          if (k in DEFAULTS) this.values[k] = saved[k];
        }
        this.values.binds = { ...structuredClone(DEFAULT_BINDS), ...(saved.binds || {}) };
      }
    } catch {
      // Storage unavailable: run with defaults.
    }
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    this.values[k] = v;
    this.save();
    for (const fn of this.listeners) fn(k, v);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // ignore
    }
  }

  reset() {
    // Mutate in place: the running world holds a reference to `values`.
    const fresh = structuredClone(DEFAULTS);
    for (const k of Object.keys(this.values)) delete this.values[k];
    Object.assign(this.values, fresh);
    this.save();
    for (const fn of this.listeners) fn('*', null);
  }

  onChange(fn) { this.listeners.add(fn); }

  // Plain object view used by the simulation (w.settings.*)
  get sim() {
    const v = this.values;
    return v;
  }
}
