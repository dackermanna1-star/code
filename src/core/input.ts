/** Unified keyboard/mouse/gamepad input with edge detection and buffering. */
export type Action = 'attack' | 'counter' | 'dodge' | 'stun' | 'grab' | 'finisher' | 'throw' | 'pause' | 'walk' | 'block';

const KEYMAP: Record<string, Action> = {
  Space: 'dodge',
  KeyQ: 'stun',
  KeyE: 'grab',
  KeyF: 'finisher',
  KeyG: 'throw',
  Escape: 'pause',
  KeyP: 'pause',
  ShiftLeft: 'walk',
  KeyJ: 'attack',
  KeyK: 'counter',
  KeyL: 'dodge',
};

export class Input {
  moveX = 0; // -1..1 (right +)
  moveY = 0; // -1..1 (forward +)
  lookDX = 0;
  lookDY = 0;
  private keys = new Set<string>();
  private down = new Map<Action, number>(); // action -> time pressed (s)
  private held = new Set<Action>();
  private pressedQueue: { a: Action; t: number }[] = [];
  pointerLocked = false;
  usingGamepad = false;
  private padPrev: boolean[] = [];
  time = 0;
  enabled = true;
  /** For automated tests/bots. */
  virtual: { moveX: number; moveY: number } | null = null;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.press(a);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      this.usingGamepad = false;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.press('attack');
      if (e.button === 2) {
        this.press('counter');
        this.held.add('block');
      }
      if (e.button === 1) this.press('finisher');
      this.usingGamepad = false;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release('attack');
      if (e.button === 2) {
        this.release('counter');
        this.held.delete('block');
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === el;
    });
  }

  requestLock() {
    if (!this.pointerLocked) this.el.requestPointerLock?.();
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  press(a: Action) {
    if (!this.enabled && a !== 'pause') return;
    this.held.add(a);
    this.down.set(a, this.time);
    this.pressedQueue.push({ a, t: this.time });
    if (this.pressedQueue.length > 16) this.pressedQueue.shift();
  }
  release(a: Action) {
    this.held.delete(a);
  }

  isHeld(a: Action) {
    return this.held.has(a);
  }
  heldFor(a: Action) {
    if (!this.held.has(a)) return 0;
    return this.time - (this.down.get(a) ?? this.time);
  }

  /** Consume a buffered press of `a` that happened within `window` seconds. */
  consume(a: Action, window = 0.25): boolean {
    for (let i = this.pressedQueue.length - 1; i >= 0; i--) {
      const p = this.pressedQueue[i];
      if (p.a === a) {
        if (this.time - p.t <= window) {
          this.pressedQueue.splice(i, 1);
          return true;
        }
        this.pressedQueue.splice(i, 1);
      }
    }
    return false;
  }
  peek(a: Action, window = 0.25): boolean {
    return this.pressedQueue.some((p) => p.a === a && this.time - p.t <= window);
  }
  clearBuffer() {
    this.pressedQueue.length = 0;
  }

  update(dt: number) {
    this.time += dt;
    // keyboard move
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.moveX = mx;
    this.moveY = my;
    if (this.keys.has('ShiftLeft')) {
      this.moveX *= 0.45;
      this.moveY *= 0.45;
    }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      if (Math.abs(lx) + Math.abs(ly) > 0) {
        this.moveX = lx;
        this.moveY = -ly;
        this.usingGamepad = true;
      }
      if (Math.abs(rx) + Math.abs(ry) > 0) {
        this.lookDX += rx * 900 * dt;
        this.lookDY += ry * 600 * dt;
        this.usingGamepad = true;
      }
      // standard mapping: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start
      const map: [number, Action][] = [[2, 'attack'], [3, 'counter'], [0, 'dodge'], [1, 'stun'], [5, 'grab'], [4, 'finisher'], [7, 'finisher'], [6, 'block'], [9, 'pause'], [8, 'throw']];
      for (const [i, a] of map) {
        const b = !!pad.buttons[i]?.pressed;
        const was = !!this.padPrev[i];
        if (b && !was) {
          this.press(a);
          this.usingGamepad = true;
        }
        if (!b && was) this.release(a);
        this.padPrev[i] = b;
      }
      break;
    }
    if (this.virtual) {
      this.moveX = this.virtual.moveX;
      this.moveY = this.virtual.moveY;
    }
  }

  takeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }
}
