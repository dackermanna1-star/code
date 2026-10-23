// Unified input: keyboard, mouse (pointer lock or drag-to-look), gamepad, and analog
// values injected by the touch controls.

const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.analogMove = { x: 0, y: 0 };
    this.analogLook = { x: 0, y: 0 };
    this.touchSprint = false;
    this.jumpQueued = false;
    this.enabled = false;
    this.pointerLocked = false;
    this.dragging = false;
    this.dragLookAllowed = true;
    this.actions = new Map();
    this.gamepadButtons = [];
    this.gamepadVertical = 0;
    this.touchUp = false;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      this._emit(this.pointerLocked ? 'lock' : 'unlock');
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked || this.dragging) {
        this.look.x += e.movementX || 0;
        this.look.y += e.movementY || 0;
      }
    });
    this.el.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.pointerLocked || e.button !== 0) return;
      if (this.dragLookAllowed) this.dragging = true;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
  }

  /** Register a handler for named one-shot actions ('menu', 'hud', 'photo', 'mute', ...). */
  on(action, fn) {
    if (!this.actions.has(action)) this.actions.set(action, new Set());
    this.actions.get(action).add(fn);
  }

  _emit(action, arg) {
    const set = this.actions.get(action);
    if (set) for (const fn of set) fn(arg);
  }

  _onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const code = e.code;
    if (down) {
      if (!this.keys.has(code)) this._keyAction(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
    if (this.enabled && BLOCKED_KEYS.has(code)) e.preventDefault();
  }

  _keyAction(code) {
    if (code === 'Space' && this.enabled) this.jumpQueued = true;
    if (!this.enabled && code !== 'Escape') return;
    switch (code) {
      case 'KeyH':
        this._emit('hud');
        break;
      case 'KeyF':
        this._emit('photo');
        break;
      case 'KeyG':
        this._emit('fly');
        break;
      case 'KeyM':
        this._emit('mute');
        break;
      case 'KeyP':
      case 'Escape':
        this._emit('menu');
        break;
      case 'KeyT':
        this._emit('fps');
        break;
      default:
    }
  }

  async requestPointerLock() {
    if (!this.el.requestPointerLock) return false;
    try {
      const r = this.el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.then === 'function') await r;
      return true;
    } catch {
      try {
        const r = this.el.requestPointerLock();
        if (r && typeof r.then === 'function') await r;
        return true;
      } catch {
        return false;
      }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.el && document.exitPointerLock) document.exitPointerLock();
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** x: strafe right, y: forward; length <= 1. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.down('KeyW', 'ArrowUp', 'KeyZ')) y += 1;
      if (this.down('KeyS', 'ArrowDown')) y -= 1;
      if (this.down('KeyD', 'ArrowRight')) x += 1;
      if (this.down('KeyA', 'ArrowLeft', 'KeyQ')) x -= 1;
      x += this.analogMove.x;
      y += this.analogMove.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  sprinting() {
    return this.enabled && (this.down('ShiftLeft', 'ShiftRight') || this.touchSprint || this.gamepadSprint);
  }

  /** Vertical input for flight and photo mode: +1 up, -1 down. */
  verticalAxis() {
    if (!this.enabled) return 0;
    const v = (this.down('Space', 'KeyE') || this.touchUp ? 1 : 0) - (this.down('KeyC', 'ControlLeft') ? 1 : 0) + this.gamepadVertical;
    return Math.max(-1, Math.min(1, v));
  }

  /** Time scrubbing: -1, 0 or +1 while [ or ] is held. */
  timeAxis() {
    if (!this.enabled) return 0;
    return (this.down('BracketRight', 'Period') ? 1 : 0) - (this.down('BracketLeft', 'Comma') ? 1 : 0);
  }

  consumeLook(dt) {
    const out = { x: this.look.x + this.analogLook.x * dt, y: this.look.y + this.analogLook.y * dt };
    this.look.x = 0;
    this.look.y = 0;
    return out;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j && this.enabled;
  }

  update() {
    this.gamepadSprint = false;
    this.gamepadVertical = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const lx = dz(pad.axes[0] || 0);
      const ly = dz(pad.axes[1] || 0);
      const rx = dz(pad.axes[2] || 0);
      const ry = dz(pad.axes[3] || 0);
      if (this.enabled) {
        this.analogMove.x = lx;
        this.analogMove.y = -ly;
        this.analogLook.x = rx * 900;
        this.analogLook.y = ry * 600;
      }
      const pressed = pad.buttons.map((b) => b.pressed);
      const edge = (i) => pressed[i] && !this.gamepadButtons[i];
      if (edge(0)) this.jumpQueued = true;
      if (edge(9)) this._emit('menu');
      if (edge(3)) this._emit('photo');
      if (edge(2)) this._emit('fly');
      this.gamepadVertical = (pressed[0] ? 1 : 0) - (pressed[1] ? 1 : 0);
      this.gamepadSprint = !!(pressed[4] || pressed[6] || pressed[10]);
      this.gamepadButtons = pressed;
      this.usingGamepad = true;
      break;
    }
  }
}
