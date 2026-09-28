// Keyboard / mouse / gamepad input with pointer lock and action bindings.

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'KeyC'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  use: ['KeyE'],
  reload: ['KeyR'],
  fire: ['Mouse0'],
  shove: ['Mouse2', 'KeyV'],
  zoom: ['Mouse1', 'KeyZ'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  lastWeapon: ['KeyQ'],
  flashlight: ['KeyF'],
  drop: ['KeyG'],
  scores: ['Tab'],
  pause: ['Escape', 'KeyP'],
  voice: ['KeyX'],
};

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.sensitivity = 1.0;
    this.invertY = false;
    this.enabled = true;
    this.onLockChange = null;
    this.gamepadIndex = -1;
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [] , prevButtons: [] };

    const kd = (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.ctrlKey && e.code === 'KeyW') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    const ku = (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => {
      for (const k of this.down) this.released.add(k);
      this.down.clear();
    });
    el.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      this.down.delete(code);
      this.released.add(code);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against browser pointer-lock spikes.
      const mx = Math.abs(e.movementX) > 400 ? 0 : e.movementX;
      const my = Math.abs(e.movementY) > 400 ? 0 : e.movementY;
      this.mouseDX += mx;
      this.mouseDY += my;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true }
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) {
        for (const k of this.down) this.released.add(k);
        this.down.clear();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('gamepadconnected', (e) => {
      if (this.gamepadIndex < 0) this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = -1;
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.el.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { this.el.requestPointerLock(); } catch (e2) { /* ignore */ }
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pollGamepad() {
    if (this.gamepadIndex < 0 || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.pad.lx = dz(gp.axes[0] || 0);
    this.pad.ly = dz(gp.axes[1] || 0);
    this.pad.rx = dz(gp.axes[2] || 0);
    this.pad.ry = dz(gp.axes[3] || 0);
    this.pad.prevButtons = this.pad.buttons;
    this.pad.buttons = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    // Map pad buttons to virtual codes
    const map = { 0: 'Space', 1: 'ControlLeft', 2: 'KeyR', 3: 'KeyQ', 4: 'KeyV', 5: 'KeyE', 6: 'Mouse1', 7: 'Mouse0', 10: 'ShiftLeft', 12: 'KeyF', 9: 'Escape', 14: 'Digit5', 15: 'Digit4', 13: 'Digit3' };
    for (const [idx, code] of Object.entries(map)) {
      const now = this.pad.buttons[idx];
      const was = this.pad.prevButtons[idx];
      if (now && !was) { this.pressed.add(code); this.down.add(code); }
      if (!now && was) { this.down.delete(code); this.released.add(code); }
    }
    this.mouseDX += this.pad.rx * 14;
    this.mouseDY += this.pad.ry * 10;
  }

  action(name) {
    const b = this.bindings[name];
    if (!b) return false;
    for (const c of b) if (this.down.has(c)) return true;
    return false;
  }
  actionPressed(name) {
    const b = this.bindings[name];
    if (!b) return false;
    for (const c of b) if (this.pressed.has(c)) return true;
    return false;
  }
  actionReleased(name) {
    const b = this.bindings[name];
    if (!b) return false;
    for (const c of b) if (this.released.has(c)) return true;
    return false;
  }
  moveAxis() {
    let x = 0, y = 0;
    if (this.action('forward')) y += 1;
    if (this.action('back')) y -= 1;
    if (this.action('right')) x += 1;
    if (this.action('left')) x -= 1;
    x += this.pad.lx;
    y -= this.pad.ly;
    return { x, y };
  }
  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const r = { dx: this.mouseDX * s, dy: this.mouseDY * s * (this.invertY ? -1 : 1) };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.wheel = 0;
  }
}
