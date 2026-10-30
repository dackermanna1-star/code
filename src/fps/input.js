/**
 * First-person controls: pointer lock for mouse look, WASD to move, Shift to sprint, C / Ctrl to
 * crouch, Space to jump (and climb), left button to fire, E to aim down the sights (toggles by
 * default - kinder on a touchpad than holding a button; set `adsHold` for hold-to-aim), R to
 * reload, 1-4 / Q / wheel to switch weapons, F to shove. Escape releases the pointer (pause).
 */
export class FpsInput {
  constructor(element, opts = {}) {
    this.el = element;
    this.enabled = false;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.sensitivity = opts.sensitivity ?? 0.0022;
    this.invertY = false;
    this.adsHold = false;
    this.ads = false;
    this.fire = false;
    this.pressed = new Set(); // edge-triggered this frame
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    this._down = (e) => this.keyDown(e);
    this._up = (e) => this.keyUp(e);
    this._move = (e) => {
      if (!this.enabled || !this.locked) return;
      // (some browsers report a huge jump on the first event after locking)
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    };
    this._mdown = (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.toggleAds(true);
    };
    this._mup = (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2 && this.adsHold) this.ads = false;
    };
    this._wheel = (e) => {
      if (!this.enabled || !this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    };
    this._lock = () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) {
        this.fire = false;
        this.keys.clear();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    document.addEventListener('mousemove', this._move);
    element.addEventListener('mousedown', this._mdown);
    window.addEventListener('mouseup', this._mup);
    element.addEventListener('wheel', this._wheel, { passive: true });
    document.addEventListener('pointerlockchange', this._lock);
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => this.el.requestPointerLock());
    } catch (e) {
      try {
        this.el.requestPointerLock();
      } catch (e2) {
        /* not available */
      }
    }
  }

  unlock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  toggleAds(fromMouse = false) {
    if (this.adsHold && !fromMouse) this.ads = true;
    else if (this.adsHold && fromMouse) this.ads = true;
    else this.ads = !this.ads;
  }

  keyDown(e) {
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (!this.keys.has(k)) this.pressed.add(k);
    this.keys.add(k);
    if (k === 'KeyE' && !e.repeat) this.toggleAds();
    if (['Space', 'Tab', 'ControlLeft', 'ControlRight'].includes(k) && this.locked) e.preventDefault();
  }

  keyUp(e) {
    const k = e.code;
    this.keys.delete(k);
    if (k === 'KeyE' && this.adsHold) this.ads = false;
  }

  /** One frame's input (look deltas in radians, movement axes, buttons, edge presses). */
  poll() {
    const k = this.keys;
    const sens = this.sensitivity * (this.ads ? 0.65 : 1);
    const out = {
      move: { x: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), z: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) },
      look: { dx: -this.dx * sens, dy: -this.dy * sens * (this.invertY ? -1 : 1) },
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      crouch: k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight'),
      jump: k.has('Space'),
      fire: this.fire && this.locked,
      ads: this.ads,
      pressed: new Set(this.pressed),
      wheel: this.wheel,
    };
    this.dx = this.dy = 0;
    this.wheel = 0;
    this.pressed.clear();
    return out;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    document.removeEventListener('mousemove', this._move);
    this.el.removeEventListener('mousedown', this._mdown);
    window.removeEventListener('mouseup', this._mup);
    this.el.removeEventListener('wheel', this._wheel);
    document.removeEventListener('pointerlockchange', this._lock);
  }
}
