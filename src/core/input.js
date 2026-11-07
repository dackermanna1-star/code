// Keyboard / mouse / pointer-lock input shared by the player, IFE and HUD.
//
// Modes (app.input.mode):
//   'menu'  – start screen / pause / settings: no look, no movement, cursor visible
//   'play'  – first-person: pointer locked, mouse look, WASD
//   'ife'   – using a seatback screen: cursor visible, clicks go to the IFE
//   'cinematic' – cinematic camera: cursor hidden, no movement
// Modules call app.input.setMode(); the HUD shows the pause menu if pointer
// lock is lost while in 'play' mode.
export class Input {
  constructor(app, element) {
    this.app = app;
    this.el = element;
    this.mode = 'menu';
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this.locked = false;
    this._wantLock = false;
    this._suppressUnlockPause = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) this.app.events.emit('input:keydown', { code: e.code, key: e.key, event: e });
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && this.mode !== 'menu') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.app.events.emit('input:keyup', { code: e.code, key: e.key, event: e });
    });
    window.addEventListener('blur', () => this.keys.clear());

    element.addEventListener('mousemove', (e) => this._onMove(e));
    document.addEventListener('mousemove', (e) => { if (this.locked) this._onMove(e); });
    element.addEventListener('mousedown', (e) => {
      this.mouse.buttons = e.buttons;
      this.app.events.emit('input:mousedown', { button: e.button, event: e, ndcX: this.mouse.ndcX, ndcY: this.mouse.ndcY, locked: this.locked });
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons = e.buttons;
      this.app.events.emit('input:mouseup', { button: e.button, event: e });
    });
    element.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); this.app.events.emit('input:wheel', { delta: Math.sign(e.deltaY) }); }, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      this.app.events.emit('input:lock', { locked: this.locked });
      if (was && !this.locked && this.mode === 'play' && !this._suppressUnlockPause) {
        this.app.events.emit('input:lostlock', {});
      }
      this._suppressUnlockPause = false;
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  _onMove(e) {
    if (this.locked) {
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    } else {
      const r = this.el.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
      if (this.mode === 'play' && this.mouse.buttons & 2) { // right-drag look fallback without pointer lock
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    }
  }

  isDown(code) { return this.keys.has(code); }
  axis(negCodes, posCodes) {
    let v = 0;
    for (const c of negCodes) if (this.keys.has(c)) { v -= 1; break; }
    for (const c of posCodes) if (this.keys.has(c)) { v += 1; break; }
    return v;
  }
  /** Returns and resets the accumulated mouse delta (pixels). */
  consumeMouseDelta() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0; this.mouse.dy = 0;
    return d;
  }
  consumeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = this.el.requestPointerLock(); p2?.catch?.(() => {}); } catch { /* ignore */ } });
    } catch { try { this.el.requestPointerLock(); } catch { /* ignore */ } }
  }
  releaseLock({ silent = true } = {}) {
    if (!this.locked) return;
    this._suppressUnlockPause = silent;
    document.exitPointerLock();
  }

  /** Switch input mode; handles pointer lock. */
  setMode(mode) {
    const prev = this.mode;
    if (prev === mode) return;
    this.mode = mode;
    if (mode === 'play') this.requestLock();
    else this.releaseLock({ silent: true });
    this.el.style.cursor = mode === 'ife' ? 'default' : (mode === 'menu' ? 'default' : 'none');
    this.keys.clear();
    this.consumeMouseDelta();
    this.app.events.emit('input:mode', { mode, prev });
  }
}
