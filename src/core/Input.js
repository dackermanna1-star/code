// Keyboard / mouse input with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // went down this frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, down: new Set(), pressed: new Set(), released: new Set(), wheel: 0 };
    this.locked = false;
    this.onKeyDown = null; // (e) => consumed
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code === 'KeyS')) e.preventDefault();
      if (e.ctrlKey && ['KeyW', 'KeyD', 'KeyR'].includes(e.code)) e.preventDefault();
      if (this.onKeyDown && this.onKeyDown(e)) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.down.add(e.button);
      this.mouse.pressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.down.delete(e.button);
      this.mouse.released.add(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.down.clear(); this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  mouseDown(b) { return this.mouse.down.has(b); }
  mousePressed(b) { return this.mouse.pressed.has(b); }
  mouseReleased(b) { return this.mouse.released.has(b); }

  /** call at end of frame */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed.clear();
    this.mouse.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}
