// Keyboard / mouse state with per-frame edges and pointer-lock management.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.uiBlocking = 0; // >0 when a modal UI wants the mouse
    this.holdStart = new Map();
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;
    this.listeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code) || (e.code === 'KeyF' && this.locked)) e.preventDefault();
      if (!this.down.has(e.code)) { this.pressed.add(e.code); this.holdStart.set(e.code, performance.now()); }
      this.down.add(e.code);
      for (const l of this.listeners) l('keydown', e);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code); this.released.add(e.code);
      for (const l of this.listeners) l('keyup', e);
    });
    window.addEventListener('blur', () => { this.down.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (!this.locked) return;
      if (this.forceLock && e.target !== canvas) return;
      if (!this.down.has(code)) { this.pressed.add(code); this.holdStart.set(code, performance.now()); }
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      if (this.down.has(code)) { this.down.delete(code); this.released.add(code); }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // guard against spurious huge deltas some browsers emit on lock
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => { if (this.locked || e.target === canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { for (const c of [...this.down]) if (c.startsWith('Mouse')) { this.down.delete(c); this.released.add(c); } }
      this.onLockChange?.(this.locked);
    });
  }

  addListener(fn) { this.listeners.push(fn); }

  lock() {
    if (this.locked) return;
    if (this.forceLock) { this.locked = true; setTimeout(() => this.onLockChange?.(true), 0); return; }
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => { /* user gesture required */ });
    } catch { /* noop */ }
  }
  unlock() {
    if (this.forceLock) { if (this.locked) { this.locked = false; setTimeout(() => this.onLockChange?.(false), 0); } return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(c) { return this.down.has(c); }
  wasPressed(c) { return this.pressed.has(c); }
  wasReleased(c) { return this.released.has(c); }
  heldFor(c) { return this.down.has(c) ? (performance.now() - (this.holdStart.get(c) || performance.now())) / 1000 : 0; }

  consume(c) { this.pressed.delete(c); }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
