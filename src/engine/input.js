// Input: keyboard + gamepad + simulated (debug/test) sources folded into named actions.
//
//   HW.input.down(a)      held this step
//   HW.input.pressed(a)   went down this step (taps shorter than a step still register)
//   HW.input.released(a)  went up this step
//   HW.input.repeat(a)    pressed, then auto-repeats while held (menus)
//   HW.input.consume(a)   clear this step's press so a later reader (e.g. the UI) won't see it again
//   HW.input.staleHeld(keep)  ignore movement directions held right now (except `keep`) until released
//   HW.input.beginText() / endText() / typed[]   raw text entry (terminal screen)
//   HW.input.mouse        { x, y (UI-buffer px), down, clicked, moved }
//
// Edge state is evaluated once per fixed step in update(), so every reader in that step agrees.
import HW from './hw.js';

export const ACTIONS = [
  'up', 'down', 'left', 'right', 'confirm', 'cancel', 'run', 'flashlight', 'inventory', 'sketchbook', 'compact', 'pause',
];
const A = Object.fromEntries(ACTIONS.map((a, i) => [a, i]));
const N = ACTIONS.length;

// KeyboardEvent.code → actions (physical keys, layout-independent).
const KEYMAP = {
  ArrowUp: ['up'], KeyW: ['up'], ArrowDown: ['down'], KeyS: ['down'],
  ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
  KeyZ: ['confirm'], Enter: ['confirm'], NumpadEnter: ['confirm'], Space: ['confirm'],
  KeyX: ['cancel'], Backspace: ['cancel'], Escape: ['cancel', 'pause'],
  ShiftLeft: ['run'], ShiftRight: ['run'],
  KeyF: ['flashlight'], KeyI: ['inventory'], Tab: ['inventory'], KeyM: ['sketchbook'], KeyQ: ['compact'],
};
const CODE_ACTIONS = Object.fromEntries(Object.entries(KEYMAP).map(([k, v]) => [k, v.map((a) => A[a])]));
/** action → [codes] in priority order (first = the key shown in prompts). */
const BINDINGS = Object.fromEntries(ACTIONS.map((a) => [a, Object.keys(KEYMAP).filter((c) => KEYMAP[c].includes(a))]));

// Standard-mapping gamepad buttons → actions.
const PAD_BUTTONS = [
  [0, 'confirm'], [1, 'cancel'], [2, 'flashlight'], [3, 'inventory'], [4, 'compact'], [5, 'run'], [7, 'run'],
  [8, 'sketchbook'], [9, 'pause'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
].map(([b, a]) => [b, A[a]]);
const STICK_DEADZONE = 0.45;

const REPEAT_DELAY = 0.34;
const REPEAT_RATE = 0.085;

// Special keys forwarded to text mode by name.
const TEXT_SPECIAL = new Set(['Enter', 'Backspace', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End']);

export const input = {
  ACTIONS,
  bindings: BINDINGS,
  held: new Set(),                 // physical key codes currently down
  keyDown: new Uint8Array(N),      // per action, from keyboard (recomputed per step)
  padDown: new Uint8Array(N),
  virtDown: new Uint8Array(N),     // simulated holds (debug / tests)
  pressEvents: new Uint8Array(N),  // keydown edges since last step
  releaseEvents: new Uint8Array(N),
  _down: new Uint8Array(N),
  _prev: new Uint8Array(N),
  _stale: new Uint8Array(N),       // held through a transfer: ignored until released (staleHeld)
  _pressed: new Uint8Array(N),
  _released: new Uint8Array(N),
  _repeat: new Uint8Array(N),
  _hold: new Float32Array(N),
  _repT: new Float32Array(N),
  _axis: { x: 0, y: 0 },

  textMode: false,
  typed: [],
  mouse: { x: 0, y: 0, down: false, clicked: false, moved: false, _click: false, _move: false },
  gamepad: null,
  lastDevice: 'keyboard',
  canvas: null,
  _gestured: false,

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => this._onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this._onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    canvas.addEventListener('pointerdown', (e) => {
      canvas.focus({ preventScroll: true });
      this._gesture();
      this.mouse.down = true;
      this.mouse._click = true;
      HW.display?.toUI(e.clientX, e.clientY, this.mouse);
      this.lastDevice = 'mouse';
    });
    window.addEventListener('pointerup', () => { this.mouse.down = false; });
    canvas.addEventListener('pointermove', (e) => {
      HW.display?.toUI(e.clientX, e.clientY, this.mouse);
      this.mouse._move = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => console.info(`[input] gamepad: ${e.gamepad.id}`));
    canvas.focus({ preventScroll: true });
  },

  _gesture() {
    // Browsers only allow audio after a user gesture; keep trying until the engine reports ready.
    if (this._gestured && HW.audio?.ready) return;
    this._gestured = true;
    try { HW.audio?.unlock?.(); } catch (e) { console.error('[input] audio unlock failed', e); }
  },

  _onKey(e, isDown) {
    if (isDown) this._gesture();
    // Fullscreen: F11 / Alt+Enter (handled here so the browser's own F11 doesn't fight us).
    if (isDown && (e.code === 'F11' || (e.code === 'Enter' && e.altKey))) {
      e.preventDefault();
      if (!e.repeat) HW.display?.toggleFullscreen();
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // leave browser shortcuts alone
    if (isDown && e.code === 'F3' && HW.debug?.enabled) {
      // Debug overlay (collision, triggers, exits): dev page, or the build opened with ?debug.
      e.preventDefault();
      HW.debug.showGrid = !HW.debug.showGrid;
      return;
    }

    if (this.textMode) {
      if (isDown) {
        if (e.key.length === 1) this.typed.push(e.key);
        else if (TEXT_SPECIAL.has(e.key)) this.typed.push(e.key);
        e.preventDefault();
      } else {
        this.held.delete(e.code);
      }
      return;
    }

    const acts = CODE_ACTIONS[e.code];
    if (!acts) return;
    e.preventDefault();
    this.lastDevice = 'keyboard';
    if (isDown) {
      if (e.repeat) return;
      this.held.add(e.code);
      for (const a of acts) if (this.pressEvents[a] < 255) this.pressEvents[a]++;
    } else {
      this.held.delete(e.code);
      for (const a of acts) if (this.releaseEvents[a] < 255) this.releaseEvents[a]++;
    }
  },

  _pollGamepad() {
    this.padDown.fill(0);
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.gamepad = pad;
    if (!pad) return;
    let any = false;
    for (const [b, a] of PAD_BUTTONS) {
      const btn = pad.buttons[b];
      if (btn && (btn.pressed || btn.value > 0.5)) { this.padDown[a] = 1; any = true; }
    }
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (ax < -STICK_DEADZONE) this.padDown[A.left] = 1;
    if (ax > STICK_DEADZONE) this.padDown[A.right] = 1;
    if (ay < -STICK_DEADZONE) this.padDown[A.up] = 1;
    if (ay > STICK_DEADZONE) this.padDown[A.down] = 1;
    if (any || Math.abs(ax) > STICK_DEADZONE || Math.abs(ay) > STICK_DEADZONE) {
      if (this.lastDevice !== 'gamepad') this._gesture();
      this.lastDevice = 'gamepad';
    }
  },

  /** Evaluate edges for this fixed step. Called first thing in every step. */
  update(dt) {
    this._pollGamepad();
    this.keyDown.fill(0);
    for (const code of this.held) {
      const acts = CODE_ACTIONS[code];
      if (acts) for (const a of acts) this.keyDown[a] = 1;
    }
    for (let i = 0; i < N; i++) {
      let now = this.keyDown[i] || this.padDown[i] || this.virtDown[i] ? 1 : 0;
      if (this._stale[i]) {
        // A direction still held from before a transfer stays "up" until released (or re-pressed).
        if (!now || this.pressEvents[i] > 0) this._stale[i] = 0;
        else now = 0;
      }
      const pressed = this.pressEvents[i] > 0 || (now && !this._prev[i]);
      const released = this.releaseEvents[i] > 0 || (!now && this._prev[i]);
      this._pressed[i] = pressed ? 1 : 0;
      this._released[i] = released ? 1 : 0;
      this._down[i] = now;
      // Menu auto-repeat.
      this._repeat[i] = pressed ? 1 : 0;
      if (now) {
        this._hold[i] = pressed ? 0 : this._hold[i] + dt;
        if (!pressed && this._hold[i] >= REPEAT_DELAY) {
          this._repT[i] -= dt;
          if (this._repT[i] <= 0) { this._repeat[i] = 1; this._repT[i] = REPEAT_RATE; }
        } else if (pressed) {
          this._repT[i] = 0;
        }
      } else {
        this._hold[i] = 0;
      }
      this._prev[i] = now;
      this.pressEvents[i] = 0;
      this.releaseEvents[i] = 0;
    }
    const m = this.mouse;
    m.clicked = m._click;
    m.moved = m._move;
    m._click = false;
    m._move = false;
  },

  down(a) { return this._down[A[a]] === 1; },
  pressed(a) { return this._pressed[A[a]] === 1; },
  released(a) { return this._released[A[a]] === 1; },
  repeat(a) { return this._repeat[A[a]] === 1; },
  /** KeyboardEvent.code of the primary key for an action (for on-screen key labels). */
  keyName(a) { return BINDINGS[a]?.[0] || a; },
  /** Seconds the action has been held (0 if up). */
  holdTime(a) { return this._down[A[a]] ? this._hold[A[a]] : 0; },

  /** Movement axis from the direction actions; returns a shared object (do not keep it). */
  axis() {
    this._axis.x = this._down[A.right] - this._down[A.left];
    this._axis.y = this._down[A.down] - this._down[A.up];
    return this._axis;
  },

  anyPressed() {
    for (let i = 0; i < N; i++) if (this._pressed[i]) return true;
    return this.mouse.clicked;
  },

  consume(a) {
    const i = A[a];
    this._pressed[i] = 0;
    this._repeat[i] = 0;
  },

  /**
   * Ignore the movement directions held right now — every source: keys, pad, simulated — until each
   * is released, except `keep` (e.g. the way the player arrives facing). Used after a map transfer so
   * a key held to climb a stair doesn't walk her straight back into the return exit.
   */
  staleHeld(keep) {
    for (const a of ['up', 'down', 'left', 'right']) {
      const i = A[a];
      if (a !== keep && this._down[i]) this._stale[i] = 1;
    }
  },

  consumeAll() {
    this._pressed.fill(0);
    this._repeat.fill(0);
    this.mouse.clicked = false;
  },

  /** Release everything (focus loss, mode switches). */
  clear() {
    this.held.clear();
    this.keyDown.fill(0);
    this.virtDown.fill(0);
    this._stale.fill(0);
    this.mouse.down = false;
  },

  // ---- simulated input (debug / tests) -----------------------------------------------------
  setVirtual(a, on) {
    const i = A[a];
    if (i === undefined) throw new Error(`Unknown input action: ${a}`);
    if (on && !this.virtDown[i] && this.pressEvents[i] < 255) this.pressEvents[i]++;
    this.virtDown[i] = on ? 1 : 0;
  },
  /** One-step press without a hold. */
  tap(a) {
    const i = A[a];
    if (i === undefined) throw new Error(`Unknown input action: ${a}`);
    if (this.pressEvents[i] < 255) this.pressEvents[i]++;
  },

  // ---- text entry --------------------------------------------------------------------------
  beginText() {
    this.textMode = true;
    this.typed.length = 0;
    this.clear();
  },
  endText() {
    this.textMode = false;
    this.typed.length = 0;
    this.clear();
  },
};

export default input;
