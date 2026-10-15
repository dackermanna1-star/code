// Keyboard / mouse input with pointer lock and action bindings.
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'KeyC'],
  walk: ['ShiftLeft'],
  use: ['KeyE'],
  reload: ['KeyR'],
  flashlight: ['KeyF'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  lastWeapon: ['KeyQ'],
  scores: ['Tab'],
  pause: ['Escape', 'KeyP'],
  vocalize: ['KeyZ'],
  drop: ['KeyG'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // pressed this frame
    this.released = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = 0;
    this.mousePressed = 0;
    this.mouseReleased = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.virtual = new Set(); // for automated testing / bots driving the player
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= (1 << e.button);
      this.mousePressed |= (1 << e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
      this.mouseReleased |= (1 << e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(action) {
    if (this.virtual.has(action)) return true;
    const codes = BINDINGS[action];
    if (!codes) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }
  hit(action) {
    const codes = BINDINGS[action];
    if (!codes) return false;
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  mouse(b) { return (this.buttons & (1 << b)) !== 0; }
  mouseHit(b) { return (this.mousePressed & (1 << b)) !== 0; }
  mouseUp(b) { return (this.mouseReleased & (1 << b)) !== 0; }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.mousePressed = 0; this.mouseReleased = 0;
  }
}
