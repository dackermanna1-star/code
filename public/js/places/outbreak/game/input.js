// Keyboard and mouse for the Outbreak: which keys are down, which were just
// pressed this frame, how far the mouse moved, the buttons and the wheel.
// The mouse is captured (pointer lock) while you play and let go whenever a
// screen (inventory, map, menu) is open.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); this._pressed = new Set();
    this.released = new Set(); this._released = new Set();
    this.mx = 0; this.my = 0; this._mx = 0; this._my = 0;
    this.buttons = new Set(); this.clicked = new Set(); this._clicked = new Set(); this.unclicked = new Set(); this._unclicked = new Set();
    this.wheel = 0; this._wheel = 0;
    this.ui = false; // a screen is open: the game doesn't get the mouse
    this.enabled = true;
    const key = (e) => {
      let k = e.key.toLowerCase();
      if (k === 'tab' || k === ' ' || k === 'alt' || (e.ctrlKey && k !== 'control')) e.preventDefault();
      if (k === 'escape') k = 'escape';
      return k;
    };
    this._down = (e) => {
      if (!this.enabled) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const k = key(e);
      if (!this.keys.has(k)) this._pressed.add(k);
      this.keys.add(k);
      if (e.code) { this.keys.add('code:' + e.code); if (!e.repeat) this._pressed.add('code:' + e.code); }
    };
    this._up = (e) => { const k = key(e); this.keys.delete(k); if (e.code) this.keys.delete('code:' + e.code); this._released.add(k); };
    this._blur = () => { this.keys.clear(); this.buttons.clear(); };
    this._move = (e) => { if (this.locked) { this._mx += e.movementX || 0; this._my += e.movementY || 0; } };
    this._mdown = (e) => {
      if (!this.enabled) return;
      if (this.ui) return;
      if (!this.locked) { this.lock(); return; }
      this.buttons.add(e.button); this._clicked.add(e.button);
    };
    this._mup = (e) => { this.buttons.delete(e.button); this._unclicked.add(e.button); };
    this._wheelFn = (e) => { if (this.locked) { this._wheel += Math.sign(e.deltaY); e.preventDefault(); } };
    this._ctx = (e) => e.preventDefault();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    window.addEventListener('mousemove', this._move);
    canvas.addEventListener('mousedown', this._mdown);
    window.addEventListener('mouseup', this._mup);
    canvas.addEventListener('wheel', this._wheelFn, { passive: false });
    canvas.addEventListener('contextmenu', this._ctx);
  }
  get locked() { return this.forceLocked || document.pointerLockElement === this.canvas; }
  lock() { try { const p = this.canvas.requestPointerLock?.(); if (p?.catch) p.catch(() => {}); } catch { /* not allowed now */ } }
  unlock() { if (this.locked) document.exitPointerLock?.(); }
  /** Start a frame: what happened since the last one. */
  frame() {
    this.pressed = this._pressed; this._pressed = new Set();
    this.released = this._released; this._released = new Set();
    this.clicked = this._clicked; this._clicked = new Set();
    this.unclicked = this._unclicked; this._unclicked = new Set();
    this.mx = this.ui ? 0 : this._mx; this.my = this.ui ? 0 : this._my; this._mx = 0; this._my = 0;
    this.wheel = this._wheel; this._wheel = 0;
    if (this.ui) { this.buttons.clear(); }
  }
  /** Simulated input (for tests): keys held, a mouse move. */
  sim(o = {}) { if (o.keys) for (const k of o.keys) this.keys.add(k); if (o.up) for (const k of o.up) this.keys.delete(k); if (o.press) for (const k of o.press) this._pressed.add(k); if (o.mx) this._mx += o.mx; if (o.my) this._my += o.my; if (o.click !== undefined) { this.buttons.add(o.click); this._clicked.add(o.click); } if (o.unclick !== undefined) { this.buttons.delete(o.unclick); this._unclicked.add(o.unclick); } }
  dispose() {
    window.removeEventListener('keydown', this._down); window.removeEventListener('keyup', this._up); window.removeEventListener('blur', this._blur);
    window.removeEventListener('mousemove', this._move); this.canvas.removeEventListener('mousedown', this._mdown); window.removeEventListener('mouseup', this._mup);
    this.canvas.removeEventListener('wheel', this._wheelFn); this.canvas.removeEventListener('contextmenu', this._ctx);
  }
}
