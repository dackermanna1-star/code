// Keyboard/mouse input with CS 1.6 default bindings and pointer lock.

export const DEFAULT_BINDS = {
  KeyW: '+forward', KeyS: '+back', KeyA: '+moveleft', KeyD: '+moveright',
  Space: '+jump', ControlLeft: '+duck', ControlRight: '+duck', ShiftLeft: '+speed', ShiftRight: '+speed',
  KeyR: '+reload', KeyE: '+use', KeyQ: 'lastinv', KeyG: 'drop', KeyB: 'buymenu', KeyM: 'chooseteam',
  Tab: '+showscores', KeyY: 'messagemode', KeyU: 'messagemode2', Backquote: 'toggleconsole',
  KeyF: 'impulse 100', KeyT: 'impulse 201', KeyN: 'nightvision', Comma: 'buyammo1', Period: 'buyammo2',
  KeyZ: 'radio1', KeyX: 'radio2', KeyC: 'radio3', Escape: 'cancelselect', F1: 'autobuy', F2: 'rebuy',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5',
  Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8', Digit9: 'slot9', Digit0: 'slot10',
  Numpad1: 'slot1', Numpad2: 'slot2', Numpad3: 'slot3', Numpad4: 'slot4', Numpad5: 'slot5',
  Numpad6: 'slot6', Numpad7: 'slot7', Numpad8: 'slot8', Numpad9: 'slot9', Numpad0: 'slot10',
  F5: 'snapshot', KeyV: 'detonate',
  MOUSE1: '+attack', MOUSE2: '+attack2', MOUSE3: 'zm_focus', MWHEELUP: 'invprev', MWHEELDOWN: 'invnext',
  MOUSE4: 'shove', // zombie survival melee shove (shove.js; the Options shove key binds a key to it too)
  KeyI: 'zm_focus', // zombie survival "Focus target" (and Mouse 3): every bot on what you aim at (zsquad.js; H stays the tips' "got it")
};

export class Input {
  constructor(element) {
    this.el = element;
    this.binds = { ...DEFAULT_BINDS };
    this.down = new Set(); // active +commands
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.sensitivity = 2.5;
    this.invertY = false;
    this.handlers = []; // (cmd, pressed) => consumed?
    this.textCapture = null; // (event) => void when typing (chat/console)
    this.enabled = true;
    this.guardBack = false; // in a game (main.js): the mouse's side buttons never navigate the page

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    element.addEventListener('mousedown', (e) => this._mouse(e, true));
    window.addEventListener('mouseup', (e) => this._mouse(e, false));
    // the side buttons are the browser's Back / Forward: not while a game is on, menus up or not
    // (Mouse 4 is the shove: a press while shopping would leave the page)
    const side = (e) => { if (this.guardBack && (e.button === 3 || e.button === 4)) e.preventDefault(); };
    window.addEventListener('mousedown', side, true);
    window.addEventListener('mouseup', side, true);
    window.addEventListener('auxclick', side, true);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this._fire(e.deltaY < 0 ? 'MWHEELUP' : 'MWHEELDOWN', true);
    }, { passive: false });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.dragLook) return;
      if (!this.locked && !(e.buttons & 1)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.releaseAll();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.el.requestPointerLock(); } catch { /* ignore */ } });
    } catch {
      try { this.el.requestPointerLock(); } catch { /* ignore */ }
    }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  onCommand(fn) { this.handlers.push(fn); }

  _key(e, pressed) {
    if (this.textCapture) {
      if (pressed) this.textCapture(e);
      return;
    }
    const code = e.code;
    if (code === 'F5' || code === 'F11' || code === 'F12') return;
    if (this.binds[code] || code === 'Escape') e.preventDefault();
    if (pressed && e.repeat) {
      return;
    }
    this._fire(code, pressed);
  }

  _mouse(e, pressed) {
    if (!this.locked && pressed) return;
    const name = e.button === 0 ? 'MOUSE1' : e.button === 2 ? 'MOUSE2' : e.button === 1 ? 'MOUSE3' : e.button === 3 ? 'MOUSE4' : null;
    if (!name) return;
    if (e.button === 3 && this.locked) e.preventDefault(); // (the side button is the browser's Back otherwise; and guardBack)
    if (this.textCapture) return;
    this._fire(name, pressed);
  }

  _fire(code, pressed) {
    const cmd = this.binds[code];
    if (!cmd) {
      for (const h of this.handlers) if (h(null, pressed, code)) return;
      return;
    }
    if (cmd[0] === '+') {
      const name = cmd.slice(1);
      if (pressed) this.down.add(name); else this.down.delete(name);
      for (const h of this.handlers) if (h(cmd, pressed, code)) return;
    } else if (pressed) {
      for (const h of this.handlers) if (h(cmd, true, code)) return;
    }
  }

  /**
   * Bind cmd to key code alone (the Options shove key): a key that had cmd before goes back to
   * its default bind. code null / 'none': cmd keeps only its default binds (Mouse 4).
   */
  bindOnly(cmd, code) {
    for (const k of Object.keys(this.binds)) {
      if (this.binds[k] !== cmd || DEFAULT_BINDS[k] === cmd) continue;
      if (DEFAULT_BINDS[k]) this.binds[k] = DEFAULT_BINDS[k]; else delete this.binds[k];
    }
    if (code && code !== 'none') this.binds[code] = cmd;
  }

  is(name) { return this.enabled && this.down.has(name); }

  releaseAll() {
    for (const n of [...this.down]) {
      this.down.delete(n);
      for (const h of this.handlers) h('+' + n, false, null);
    }
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }
}
