// Action-based input with rebindable bindings, pointer lock and tick-latched edge detection.
//
// Edge semantics: presses that happen between fixed ticks are latched and become visible to exactly
// ONE fixed tick via wasPressed(). Render-rate code (camera) uses consumeMouseDelta().

export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'walk'
  | 'crouch'
  | 'prone'
  | 'jump'
  | 'leanLeft'
  | 'leanRight'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'interact'
  | 'fireMode'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'holster'
  | 'inventory'
  | 'map'
  | 'freeLook'
  | 'togglePerspective'
  | 'useBandage'
  | 'useFirstAid'
  | 'useMedkit'
  | 'useBoost'
  | 'zeroUp'
  | 'zeroDown'
  | 'vehicleBoost'
  | 'vehicleHandbrake'
  | 'vehicleHorn'
  | 'seat1'
  | 'seat2'
  | 'seat3'
  | 'seat4'
  | 'pause';

/** Binding codes: KeyboardEvent.code values, or 'Mouse0'..'Mouse4', 'WheelUp', 'WheelDown'. */
export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft'],
  walk: ['ControlLeft'],
  crouch: ['KeyC'],
  prone: ['KeyZ'],
  jump: ['Space'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  fire: ['Mouse0'],
  aim: ['Mouse2'],
  reload: ['KeyR'],
  interact: ['KeyF'],
  fireMode: ['KeyB'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5', 'KeyG'],
  holster: ['KeyX'],
  inventory: ['Tab', 'KeyI'],
  map: ['KeyM'],
  freeLook: ['AltLeft'],
  togglePerspective: ['KeyV'],
  useBandage: ['Digit7'],
  useFirstAid: ['Digit8'],
  useMedkit: ['Digit9'],
  useBoost: ['Digit0'],
  zeroUp: ['PageUp'],
  zeroDown: ['PageDown'],
  vehicleBoost: ['ShiftLeft'],
  vehicleHandbrake: ['Space'],
  vehicleHorn: ['KeyH'],
  seat1: ['F1'],
  seat2: ['F2'],
  seat3: ['F3'],
  seat4: ['F4'],
  pause: ['Escape'],
};

export class Input {
  private bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  private codeToActions = new Map<string, Action[]>();
  private downCodes = new Set<string>();
  private pendingPressed = new Set<string>();
  private pendingReleased = new Set<string>();
  private tickPressed = new Set<string>();
  private tickReleased = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private tickWheel = 0;
  private pendingWheel = 0;
  private rebindCallback: ((code: string) => void) | null = null;
  /** When false, gameplay queries return nothing (menus open). */
  enabled = true;
  readonly canvas: HTMLElement;
  /** Raw listeners for UI (key code). */
  private keyListeners = new Set<(code: string, down: boolean, e: KeyboardEvent | MouseEvent) => void>();

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    this.rebuild();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.rebindCallback) {
        e.preventDefault();
        const cb = this.rebindCallback;
        this.rebindCallback = null;
        cb(e.code);
        return;
      }
      // keep browser shortcuts from stealing game keys
      if (['Tab', 'AltLeft', 'Space', 'F1', 'F2', 'F3', 'F4', 'ControlLeft'].includes(e.code) || this.locked) e.preventDefault();
      this.press(e.code);
      for (const l of this.keyListeners) l(e.code, true, e);
    });
    window.addEventListener('keyup', (e) => {
      this.release(e.code);
      for (const l of this.keyListeners) l(e.code, false, e);
    });
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.rebindCallback) {
        const cb = this.rebindCallback;
        this.rebindCallback = null;
        cb(code);
        return;
      }
      this.press(code);
      for (const l of this.keyListeners) l(code, true, e);
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      this.release(code);
      for (const l of this.keyListeners) l(code, false, e);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
        if (this.rebindCallback) {
          const cb = this.rebindCallback;
          this.rebindCallback = null;
          cb(code);
          return;
        }
        this.wheel += Math.sign(e.deltaY);
        this.pendingWheel += Math.sign(e.deltaY);
        this.pendingPressed.add(code);
      },
      { passive: true },
    );
    window.addEventListener('blur', () => {
      for (const c of this.downCodes) this.pendingReleased.add(c);
      this.downCodes.clear();
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    if (this.locked) return;
    try {
      const p = (this.canvas as any).requestPointerLock?.({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(() => (this.canvas as any).requestPointerLock?.());
    } catch {
      /* ignore */
    }
  }

  exitPointerLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private press(code: string): void {
    if (!this.downCodes.has(code)) {
      this.downCodes.add(code);
      this.pendingPressed.add(code);
    }
  }

  private release(code: string): void {
    if (this.downCodes.delete(code)) this.pendingReleased.add(code);
  }

  /** Synthetic input for automated tests. */
  simulate(code: string, down: boolean): void {
    if (down) this.press(code);
    else this.release(code);
  }

  simulateMouse(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  /** Called by the Engine before each fixed tick. */
  beginTick(): void {
    this.tickPressed = this.pendingPressed;
    this.tickReleased = this.pendingReleased;
    this.pendingPressed = new Set();
    this.pendingReleased = new Set();
    this.tickWheel = this.pendingWheel;
    this.pendingWheel = 0;
  }

  getBindings(): Record<Action, string[]> {
    return this.bindings;
  }

  setBindings(b: Partial<Record<Action, string[]>>): void {
    this.bindings = { ...structuredClone(DEFAULT_BINDINGS), ...b };
    this.rebuild();
  }

  /** Capture the next key/mouse press for rebinding UI. */
  listenForNextKey(cb: (code: string) => void): void {
    this.rebindCallback = cb;
  }

  onRawKey(fn: (code: string, down: boolean, e: KeyboardEvent | MouseEvent) => void): () => void {
    this.keyListeners.add(fn);
    return () => this.keyListeners.delete(fn);
  }

  private rebuild(): void {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [Action, string[]][]) {
      for (const c of codes) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(action);
        this.codeToActions.set(c, list);
      }
    }
  }

  /** Held right now. */
  isDown(action: Action): boolean {
    if (!this.enabled) return false;
    for (const c of this.bindings[action]) if (this.downCodes.has(c)) return true;
    return false;
  }

  /** Pressed since the previous fixed tick (visible during exactly one tick). */
  wasPressed(action: Action): boolean {
    if (!this.enabled) return false;
    for (const c of this.bindings[action]) if (this.tickPressed.has(c)) return true;
    return false;
  }

  wasReleased(action: Action): boolean {
    for (const c of this.bindings[action]) if (this.tickReleased.has(c)) return true;
    return false;
  }

  /** Wheel steps since the previous fixed tick (positive = down). */
  tickWheelDelta(): number {
    return this.enabled ? this.tickWheel : 0;
  }

  /** Mouse movement (pixels) since last call — call once per rendered frame from the camera controller. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const r = { dx: this.enabled ? this.mouseDX : 0, dy: this.enabled ? this.mouseDY : 0 };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return this.enabled ? w : 0;
  }

  /** Human-readable name for a binding code. */
  static codeLabel(code: string): string {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const map: Record<string, string> = {
      Mouse0: 'LMB',
      Mouse1: 'MMB',
      Mouse2: 'RMB',
      Mouse3: 'M4',
      Mouse4: 'M5',
      ShiftLeft: 'L-Shift',
      ControlLeft: 'L-Ctrl',
      AltLeft: 'L-Alt',
      Space: 'Space',
      Escape: 'Esc',
      WheelUp: 'Wheel ↑',
      WheelDown: 'Wheel ↓',
    };
    return map[code] ?? code;
  }
}
