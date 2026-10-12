// Keyboard, mouse (pointer lock) and gamepad input with rebindable actions.
// Look input is consumed every rendered frame for responsiveness; movement
// and buttons are sampled into a ticcmd at the 35 Hz simulation rate.

import { emptyCmd } from './game/player.js';

const WEAPON_ACTIONS = ['weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5', 'weapon6', 'weapon7'];

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressedQueue = new Set(); // codes pressed since last tic (edge)
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.listeners = [];
    this.captureNext = null; // for key rebinding
    this.textListeners = new Set();
    this.adsToggled = false;
    this.lastWeapon = -1;
    this.gamepadIndex = -1;
    this.padPrev = [];
    this.padLook = { x: 0, y: 0 };
    this.lockUnavailable = !canvas.requestPointerLock;
    this.lockFromClick = false;
    this.attach();
  }

  attach() {
    const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); this.listeners.push([t, ev, fn]); };
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => this.down.clear());
    on(this.canvas, 'mousedown', (e) => {
      e.preventDefault();
      if (!this.locked && this.wantLock && !this.captureNext) {
        // Browsers only re-lock on a click after Esc, so this click just grabs
        // the mouse back: don't also fire with it (unless locking is broken).
        this.lockFromClick = true;
        this.requestLock();
        if (!this.lockUnavailable) return;
      }
      this.press(`Mouse${e.button}`, true);
    });
    on(window, 'mouseup', (e) => this.press(`Mouse${e.button}`, false));
    on(this.canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    on(this.canvas, 'wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return; // horizontal scrolling is not a weapon switch
      const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
      this.pressedQueue.add(code);
      if (this.captureNext) { this.finishCapture(code); }
    }, { passive: false });
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockUnavailable = this.lockFromClick = false;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    on(document, 'pointerlockerror', () => {
      // Refused even for a click (e.g. a sandboxed iframe): clicks must fire.
      if (this.lockFromClick) this.lockUnavailable = true;
      this.lockFromClick = false;
    });
    on(window, 'gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    on(window, 'gamepaddisconnected', () => { this.gamepadIndex = -1; });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: !!this.settings.get('rawInput') });
      if (p && p.catch) p.catch(() => this.requestPlainLock());
    } catch {
      this.requestPlainLock();
    }
  }

  // Without options; failures (no user gesture yet) are expected and silent.
  requestPlainLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      this.lockUnavailable = true; // no pointer lock support
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onKey(e, isDown) {
    if (this.captureNext && isDown) {
      e.preventDefault();
      // An auto-repeat of the key that opened the capture is not a choice.
      if (!e.repeat) this.finishCapture(e.code);
      return;
    }
    if (isDown) {
      for (const fn of this.textListeners) fn(e);
    }
    // Avoid browser shortcuts stealing game keys while playing.
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'F6', 'F9', 'Backspace'].includes(e.code)
      || (this.locked && !e.metaKey)) e.preventDefault();
    this.press(e.code, isDown, e);
  }

  press(code, isDown, e) {
    if (this.captureNext && isDown && code.startsWith('Mouse')) { this.finishCapture(code); return; }
    if (isDown) {
      if (!this.down.has(code)) this.pressedQueue.add(code);
      this.down.add(code);
      if (this.onPress) this.onPress(code, e);
    } else {
      this.down.delete(code);
    }
  }

  captureKey(cb) { this.captureNext = cb; }

  finishCapture(code) {
    const cb = this.captureNext;
    this.captureNext = null;
    this.pressedQueue.clear();
    cb(code);
  }

  bindsFor(action) { return this.settings.get('binds')[action] || []; }

  isDown(action) {
    for (const c of this.bindsFor(action)) if (this.down.has(c)) return true;
    return this.padButton(action);
  }

  wasPressed(action) {
    for (const c of this.bindsFor(action)) if (this.pressedQueue.has(c)) return true;
    return this.padPressed(action);
  }

  // --- Gamepad --------------------------------------------------------------

  pollPad() {
    let pads = [];
    try {
      // Throws where the gamepad permissions policy is denied (some iframes).
      pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    } catch {
      pads = [];
    }
    let pad = null;
    if (this.gamepadIndex >= 0) pad = pads[this.gamepadIndex];
    if (!pad) for (const p of pads) if (p) { pad = p; this.gamepadIndex = p.index; break; }
    this.pad = pad && pad.mapping === 'standard' ? pad : (pad || null);
    if (!this.pad) { this.padState = null; return; }
    const dz = this.settings.get('gamepadDeadzone');
    const axis = (i) => {
      const v = this.pad.axes[i] || 0;
      if (Math.abs(v) < dz) return 0;
      return Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
    };
    const btn = (i) => !!(this.pad.buttons[i] && (this.pad.buttons[i].pressed || this.pad.buttons[i].value > 0.4));
    const state = {
      lx: axis(0), ly: axis(1), rx: axis(2), ry: axis(3),
      buttons: this.pad.buttons.map((_, i) => btn(i)),
    };
    this.padPrevState = this.padState;
    this.padState = state;
    // Menu navigation: rising edges of face buttons / d-pad become key presses.
    const prev = this.padMenuPrev || [];
    const menuMap = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 1: 'Backspace', 9: 'Escape' };
    for (const [i, code] of Object.entries(menuMap)) {
      if (state.buttons[i] && !prev[i] && this.onPress) this.onPress(code, { pad: true, key: '' });
    }
    this.padMenuPrev = state.buttons.slice();
  }

  static PAD_MAP = {
    jump: 0, crouch: 1, reload: 2, use: 2, nextWeapon: 3, melee: 5, prevWeapon: 4, ads: 6, fire: 7,
    automap: 8, sprint: 10, lastWeapon: 11,
  };

  padButton(action) {
    const s = this.padState;
    if (!s) return false;
    const i = Input.PAD_MAP[action];
    return i !== undefined && s.buttons[i];
  }

  padPressed(action) {
    const s = this.padState;
    if (!s) return false;
    const i = Input.PAD_MAP[action];
    if (i === undefined) return false;
    const prev = this.padEdgePrev || [];
    return s.buttons[i] && !prev[i];
  }

  // --- Per-frame look -------------------------------------------------------

  consumeLook(dt) {
    const s = this.settings;
    const sens = s.get('mouseSensitivity');
    // About 0.075 degrees per mouse count at sensitivity 1.
    const k = 0.0013 * sens;
    let yaw = -this.mouseDX * k;
    let pitch = -this.mouseDY * k * (s.get('invertY') ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    if (!s.get('mouseLook')) pitch = 0;
    // Keyboard turning
    const turn = (this.isDown('turnLeft') ? 1 : 0) - (this.isDown('turnRight') ? 1 : 0);
    yaw += turn * dt * 3.2;
    // Gamepad right stick with a response curve.
    if (this.padState) {
      const gs = s.get('gamepadSensitivity');
      const curve = (v) => Math.sign(v) * v * v;
      yaw -= curve(this.padState.rx) * dt * 4.2 * gs;
      pitch -= curve(this.padState.ry) * dt * 2.6 * gs * (s.get('gamepadInvertY') ? -1 : 1);
      this.padLook.x = this.padState.rx;
      this.padLook.y = this.padState.ry;
    }
    return { yaw, pitch };
  }

  // --- Per-tic command --------------------------------------------------------

  buildCmd(player) {
    const s = this.settings;
    const cmd = emptyCmd();
    const run = s.get('alwaysRun') !== this.isDown('walk');
    const fwdSpeed = run ? 50 : 25;
    const sideSpeed = run ? 40 : 24;
    let f = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    let sd = (this.isDown('strafeRight') ? 1 : 0) - (this.isDown('strafeLeft') ? 1 : 0);
    if (this.padState) {
      if (Math.abs(this.padState.ly) > 0) f = -this.padState.ly;
      if (Math.abs(this.padState.lx) > 0) sd = this.padState.lx;
    }
    const len = Math.hypot(f, sd);
    if (len > 1) { f /= len; sd /= len; }
    cmd.forwardmove = f * fwdSpeed;
    cmd.sidemove = sd * sideSpeed;
    // Presses shorter than a tic still count (latched since the last tic).
    const held = (a) => this.isDown(a) || this.wasPressed(a);
    cmd.attack = held('fire');
    cmd.use = held('use');
    if (s.get('adsToggle')) {
      if (this.wasPressed('ads')) this.adsToggled = !this.adsToggled;
      cmd.ads = this.adsToggled;
    } else {
      cmd.ads = this.isDown('ads');
    }
    cmd.reload = held('reload');
    cmd.jump = held('jump');
    cmd.crouch = held('crouch');
    cmd.sprint = this.isDown('sprint') || (this.padState && this.padState.buttons[10]);
    cmd.melee = held('melee');
    for (let i = 0; i < WEAPON_ACTIONS.length; i++) {
      if (this.wasPressed(WEAPON_ACTIONS[i])) {
        // Slot 1 = fist/chainsaw, 2 pistol, 3 shotgun, 4 chaingun, 5 rocket, 6 plasma, 7 bfg
        cmd.weapon = [0, 1, 2, 3, 4, 5, 6][i];
      }
    }
    if (this.wasPressed('nextWeapon')) cmd.nextWeapon = 1;
    if (this.wasPressed('prevWeapon')) cmd.nextWeapon = -1;
    if (this.wasPressed('lastWeapon') && player && this.lastWeapon >= 0) cmd.weapon = this.lastWeapon;
    if (player && player.readyweapon !== this.trackedWeapon) {
      this.lastWeapon = this.trackedWeapon ?? -1;
      this.trackedWeapon = player.readyweapon;
    }
    return cmd;
  }

  endTic() {
    this.pressedQueue.clear();
    this.padEdgePrev = this.padState ? this.padState.buttons.slice() : [];
  }
}
