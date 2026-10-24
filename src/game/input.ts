// Keyboard, mouse, gamepad and touch input. Produces analog driving controls
// plus edge-triggered actions.

export type Action =
  | 'reset'
  | 'resetHome'
  | 'savePos'
  | 'loadPos'
  | 'camera'
  | 'slowmo'
  | 'pause'
  | 'menu'
  | 'help'
  | 'lights'
  | 'shiftUp'
  | 'shiftDown'
  | 'toggleManual'
  | 'ignition'
  | 'editor'
  | 'spawnProp'
  | 'nextVehicle'
  | 'horn'
  | 'freeze'
  | 'map';

const KEYMAP: Record<string, Action> = {
  KeyR: 'reset',
  Backspace: 'resetHome',
  Home: 'resetHome',
  Insert: 'savePos',
  KeyK: 'savePos',
  KeyL: 'loadPos',
  KeyC: 'camera',
  KeyT: 'slowmo',
  KeyP: 'pause',
  Escape: 'menu',
  KeyH: 'help',
  F1: 'help',
  KeyN: 'lights',
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  KeyM: 'toggleManual',
  KeyI: 'ignition',
  KeyB: 'editor',
  KeyO: 'spawnProp',
  Tab: 'nextVehicle',
  KeyG: 'horn',
  KeyF: 'freeze',
  KeyJ: 'map',
};

export class Input {
  private keys = new Set<string>();
  private pressed: Action[] = [];
  /** Analog outputs */
  throttle = 0;
  brake = 0;
  steer = 0;
  handbrake = 0;
  usingGamepad = false;
  /** Camera look from right stick / mouse drag */
  lookX = 0;
  lookY = 0;
  zoom = 0;
  mouseDown = false;
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  enabled = true;
  /** Free-camera movement keys */
  readonly move = { x: 0, y: 0, z: 0, fast: false };
  private gpPrev: boolean[] = [];
  // touch
  touch = { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false };
  private keyboardSteer = 0;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'F1'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        const a = KEYMAP[e.code];
        if (a) this.pressed.push(a);
      }
      this.keys.add(e.code);
      this.usingGamepad = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) this.mouseDown = true;
    });
    window.addEventListener('mouseup', () => (this.mouseDown = false));
    window.addEventListener('mousemove', (e) => {
      if (this.mouseDown || document.pointerLockElement) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    target.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Drain edge-triggered actions since last call. */
  consume(): Action[] {
    const a = this.pressed;
    this.pressed = [];
    return a;
  }

  push(a: Action): void {
    this.pressed.push(a);
  }

  update(dt: number): void {
    const k = this.keys;
    const up = k.has('KeyW') || k.has('ArrowUp');
    const down = k.has('KeyS') || k.has('ArrowDown');
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    let thr = up ? 1 : 0;
    let brk = down ? 1 : 0;
    // keyboard steering is smoothed by the vehicle; here just a target
    this.keyboardSteer = (left ? 1 : 0) - (right ? 1 : 0);
    let st = this.keyboardSteer;
    let hb = k.has('Space') ? 1 : 0;
    // free camera
    this.move.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this.move.z = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    this.move.y = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    this.move.fast = k.has('ShiftLeft') || k.has('ShiftRight');

    // gamepad
    // embedded in a cross-origin frame, the permissions policy can make this throw
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      /* no gamepad access here */
    }
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (gp) {
      const ax = gp.axes;
      const lx = deadzone(ax[0] ?? 0, 0.12);
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      const anyInput = Math.abs(lx) > 0 || rt > 0.05 || lt > 0.05 || gp.buttons.some((b) => b.pressed);
      if (anyInput) this.usingGamepad = true;
      if (this.usingGamepad) {
        st = -lx;
        thr = Math.max(thr, rt);
        brk = Math.max(brk, lt);
        hb = Math.max(hb, gp.buttons[0]?.pressed ? 1 : 0);
        this.lookX = deadzone(ax[2] ?? 0, 0.15);
        this.lookY = deadzone(ax[3] ?? 0, 0.15);
      }
      const map: [number, Action][] = [[3, 'reset'], [1, 'camera'], [9, 'menu'], [8, 'slowmo'], [5, 'shiftUp'], [4, 'shiftDown'], [2, 'lights'], [12, 'resetHome'], [13, 'pause'], [14, 'savePos'], [15, 'loadPos']];
      for (const [bi, act] of map) {
        const p = !!gp.buttons[bi]?.pressed;
        if (p && !this.gpPrev[bi]) this.pressed.push(act);
        this.gpPrev[bi] = p;
      }
    }
    // touch overrides when active
    if (this.touch.active) {
      st = this.touch.steer;
      thr = Math.max(thr, this.touch.throttle);
      brk = Math.max(brk, this.touch.brake);
      hb = Math.max(hb, this.touch.handbrake);
    }
    if (!this.enabled) {
      thr = brk = st = hb = 0;
    }
    this.throttle = thr;
    this.brake = brk;
    this.steer = st;
    this.handbrake = hb;
    void dt;
  }

  /** True when the current steering source is analog (gamepad/touch). */
  get analogSteering(): boolean {
    return this.usingGamepad || this.touch.active;
  }

  takeMouse(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheelDelta };
    this.mouseDX = this.mouseDY = 0;
    this.wheelDelta = 0;
    return r;
  }
}

function deadzone(v: number, d: number): number {
  if (Math.abs(v) < d) return 0;
  return Math.sign(v) * (Math.abs(v) - d) / (1 - d);
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
