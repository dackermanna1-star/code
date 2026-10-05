// Keyboard / mouse input with per-frame edge detection and pointer lock handling.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft'],
  turnRight: ['ArrowRight'],
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  kick: ['KeyF'],
  interact: ['KeyE'],
  potion: ['KeyQ', 'Digit1'],
  throw: ['KeyG', 'Digit2'],
  ability: ['KeyR'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  swap: ['KeyX'],
  inventory: ['Tab', 'KeyI'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
};

export class Input {
  constructor(element) {
    this.el = element;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: [false, false, false], pressed: [false, false, false], released: [false, false, false] };
    this.locked = false;
    this.lockSupported = 'requestPointerLock' in element;
    this.lockFailed = false;
    this.sensitivity = 1;
    this.onLockChange = null;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.buttons = [false, false, false];
    });

    element.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      this.mouse.buttons[e.button] = true;
      this.mouse.pressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.mouse.buttons[e.button]) this.mouse.released[e.button] = true;
      this.mouse.buttons[e.button] = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.lockFailed) return;
      // Ignore absurd spikes some browsers emit when pointer lock engages.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    this.everLocked = false;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) { this.everLocked = true; this.lockFailed = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      // Sandboxed frames may forbid pointer lock entirely: fall back to raw mouse movement.
      // (A refusal after a successful lock is just the browser's re-lock cooldown.)
      if (this.everLocked) return;
      this.lockFailed = true;
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    if (!this.lockSupported) {
      this.lockFailed = true;
      return;
    }
    try {
      const p = this.el.requestPointerLock();
      if (p && p.catch) p.catch(() => { if (!this.everLocked) this.lockFailed = true; });
    } catch {
      if (!this.everLocked) this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get active() {
    return this.locked || this.lockFailed;
  }

  action(name) {
    for (const c of BINDINGS[name]) if (this.down.has(c)) return true;
    return false;
  }

  actionPressed(name) {
    for (const c of BINDINGS[name]) if (this.pressed.has(c)) return true;
    return false;
  }

  actionReleased(name) {
    for (const c of BINDINGS[name]) if (this.released.has(c)) return true;
    return false;
  }

  consumeMouse() {
    const dx = this.mouse.dx * this.sensitivity;
    const dy = this.mouse.dy * this.sensitivity;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return [dx, dy];
  }

  // Call at end of each frame.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = [false, false, false];
    this.mouse.released = [false, false, false];
    this.mouse.wheel = 0;
  }
}
