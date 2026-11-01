// Unified keyboard / mouse / gamepad input with edge detection and press buffering.
// Gameplay asks questions in terms of actions ("attack", "interact") rather than keys,
// which keeps the control scheme consistent across movement, combat, items and dialogue.

const KEY_BINDINGS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  walk: ['AltLeft', 'CapsLock'],
  attack: ['KeyJ'], heavy: ['KeyK'],
  block: ['KeyQ', 'KeyL', 'ControlLeft'],
  dodge: ['Space'],
  grab: ['KeyF'], interact: ['KeyE', 'Enter'], drop: ['KeyG'], use: ['KeyR'],
  lock: ['KeyT', 'KeyZ'], cycle: ['Tab'],
  notebook: ['KeyC', 'KeyN'], map: ['KeyM'], pause: ['Escape', 'KeyP'],
  camLeft: ['ArrowLeft'], camRight: ['ArrowRight'], camUp: ['ArrowUp'], camDown: ['ArrowDown'],
  menuUp: ['ArrowUp'], menuDown: ['ArrowDown'], confirm: ['Enter', 'KeyE'], back_ui: ['Escape', 'Backspace'],
  choice1: ['Digit1', 'Numpad1'], choice2: ['Digit2', 'Numpad2'], choice3: ['Digit3', 'Numpad3'],
  choice4: ['Digit4', 'Numpad4'], choice5: ['Digit5', 'Numpad5'], choice6: ['Digit6', 'Numpad6'],
  choice7: ['Digit7', 'Numpad7'], choice8: ['Digit8', 'Numpad8'],
};
const MOUSE_BINDINGS = { attack: [0], heavy: [2], lock: [1] };
// Standard Gamepad mapping indices.
const PAD_BINDINGS = {
  interact: [0], confirm: [0], dodge: [1], back_ui: [1], attack: [2], heavy: [3],
  grab: [4], lock: [5], block: [6], sprint: [7], notebook: [8], pause: [9],
  recenter: [11], drop: [10], menuUp: [12], menuDown: [13], use: [12], cycle: [15], cycleBack: [14],
};

export class Input {
  constructor(target = window) {
    this.down = new Set();          // currently held key codes
    this.mouseDown = new Set();
    this.padDown = new Set();
    this.actionState = new Map();   // action -> {down, pressedAt, releasedAt, downSince, consumed}
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.time = 0;
    this.enabled = true;
    this.pointerLocked = false;
    this.lastDevice = 'keyboard';
    this.padIndex = -1;
    this.padAxes = [0, 0, 0, 0];
    this.listeners = [];
    this._pendingEdges = [];        // raw edges queued between frames
    this.bindings = KEY_BINDINGS;
    if (target && target.addEventListener) this._attach(target);
  }

  _attach(target) {
    const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); this.listeners.push(() => t.removeEventListener(ev, fn, opts)); };
    on(target, 'keydown', (e) => {
      if (this._isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code); this.lastDevice = 'keyboard';
      this._pendingEdges.push({ src: 'key', code: e.code, down: true });
    });
    on(target, 'keyup', (e) => {
      this.down.delete(e.code);
      this._pendingEdges.push({ src: 'key', code: e.code, down: false });
    });
    on(target, 'blur', () => { this.down.clear(); this.mouseDown.clear(); });
    on(document, 'mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('.ui-interactive')) return;
      this.mouseDown.add(e.button); this.lastDevice = 'keyboard';
      this._pendingEdges.push({ src: 'mouse', code: e.button, down: true });
    });
    on(document, 'mouseup', (e) => {
      this.mouseDown.delete(e.button);
      this._pendingEdges.push({ src: 'mouse', code: e.button, down: false });
    });
    on(document, 'mousemove', (e) => {
      if (this.pointerLocked) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
      else if (this.dragLook && this.mouseDown.size) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
    });
    on(document, 'wheel', (e) => { if (!(e.target && e.target.closest && e.target.closest('.ui-scroll'))) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    on(document, 'contextmenu', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => { this.pointerLocked = !!document.pointerLockElement; });
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  /** Called once per rendered frame before simulation steps. */
  beginFrame(time) {
    this.time = time;
    this._pollGamepad();
    for (const edge of this._pendingEdges) this._applyEdge(edge);
    this._pendingEdges.length = 0;
  }

  /** Called after the frame's simulation to reset per-frame deltas. */
  endFrame() { this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }

  _actionsFor(src, code) {
    const out = [];
    const table = src === 'key' ? this.bindings : src === 'mouse' ? MOUSE_BINDINGS : PAD_BINDINGS;
    for (const action in table) if (table[action].includes(code)) out.push(action);
    return out;
  }

  _applyEdge({ src, code, down }) {
    for (const action of this._actionsFor(src, code)) {
      let st = this.actionState.get(action);
      if (!st) { st = { down: false, pressedAt: -1, releasedAt: -1, downSince: 0, consumedAt: -2, sources: 0 }; this.actionState.set(action, st); }
      if (down) {
        st.sources++;
        if (!st.down) { st.down = true; st.pressedAt = this.time; st.downSince = this.time; }
      } else {
        st.sources = Math.max(0, st.sources - 1);
        if (st.sources === 0 && st.down) { st.down = false; st.releasedAt = this.time; }
      }
    }
  }

  _pollGamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads || []) if (p && p.connected) { pad = p; break; }
    if (!pad) { this.padAxes = [0, 0, 0, 0]; return; }
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    this.padAxes = [dz(pad.axes[0] || 0), dz(pad.axes[1] || 0), dz(pad.axes[2] || 0), dz(pad.axes[3] || 0)];
    if (this.padAxes.some((a) => a !== 0)) this.lastDevice = 'gamepad';
    pad.buttons.forEach((b, i) => {
      const pressed = typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5;
      const was = this.padDown.has(i);
      if (pressed && !was) { this.padDown.add(i); this.lastDevice = 'gamepad'; this._pendingEdges.push({ src: 'pad', code: i, down: true }); }
      else if (!pressed && was) { this.padDown.delete(i); this._pendingEdges.push({ src: 'pad', code: i, down: false }); }
    });
  }

  isDown(action) { return this.enabled && !!this.actionState.get(action)?.down; }
  /** True on the first frame of a press (not consumed yet). */
  pressed(action, window = 0) {
    if (!this.enabled) return false;
    const st = this.actionState.get(action);
    if (!st) return false;
    const w = window || 1e-6;
    return st.pressedAt > st.consumedAt && this.time - st.pressedAt <= w + 1 / 30;
  }
  /** Buffered press: returns true (once) if pressed within `window` seconds. */
  consume(action, window = 0.25) {
    if (!this.pressed(action, window)) return false;
    this.actionState.get(action).consumedAt = this.actionState.get(action).pressedAt;
    return true;
  }
  released(action) {
    const st = this.actionState.get(action);
    return !!st && st.releasedAt >= 0 && this.time - st.releasedAt <= 1 / 30 && st.releasedAt >= st.pressedAt;
  }
  heldFor(action) {
    const st = this.actionState.get(action);
    return st && st.down ? this.time - st.downSince : 0;
  }
  clearAction(action) {
    const st = this.actionState.get(action);
    if (st) st.consumedAt = st.pressedAt;
  }
  clearAll() { for (const st of this.actionState.values()) st.consumedAt = st.pressedAt; }

  /** Movement vector in input space: x = right, y = forward. Magnitude 0..1. */
  moveVector() {
    if (!this.enabled) return { x: 0, y: 0, mag: 0 };
    let x = 0, y = 0;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    let mag = Math.hypot(x, y);
    if (mag > 0) { x /= mag; y /= mag; mag = 1; }
    const px = this.padAxes[0], py = -this.padAxes[1];
    const pm = Math.min(1, Math.hypot(px, py));
    if (pm > mag) { const l = Math.hypot(px, py) || 1; x = px / l; y = py / l; mag = pm; }
    return { x, y, mag };
  }
  lookVector(dt) {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.mouseDX, y = this.mouseDY;
    const keyRate = 900 * dt;
    if (this.isDown('camLeft')) x -= keyRate;
    if (this.isDown('camRight')) x += keyRate;
    x += this.padAxes[2] * 1100 * dt; y += this.padAxes[3] * 700 * dt;
    return { x, y };
  }

  /** Simulated input for automated tests. */
  simulate(action, down) { this._pendingEdges.push({ src: 'sim', code: action, down }); }
  _actionsForSim(code) { return [code]; }
  dispose() { this.listeners.forEach((f) => f()); }
}
// Simulated edges map directly to actions.
const origActionsFor = Input.prototype._actionsFor;
Input.prototype._actionsFor = function (src, code) { return src === 'sim' ? [code] : origActionsFor.call(this, src, code); };

export const BINDING_LABELS = {
  keyboard: {
    move: 'WASD', sprint: 'Shift', attack: 'LMB / J', heavy: 'RMB / K', block: 'Q / Ctrl', dodge: 'Space',
    grab: 'F', interact: 'E', drop: 'G', use: 'R', lock: 'T / MMB', cycle: 'Tab', notebook: 'C', map: 'M', pause: 'Esc',
    camera: 'Mouse / ← →',
  },
  gamepad: {
    move: 'L-Stick', sprint: 'RT', attack: 'X', heavy: 'Y', block: 'LT', dodge: 'B', grab: 'LB', interact: 'A',
    drop: 'R-Stick btn', use: 'D-Up', lock: 'RB', cycle: 'D-Right', notebook: 'Back', map: 'Back', pause: 'Start', camera: 'R-Stick',
  },
};
