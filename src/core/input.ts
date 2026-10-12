// Keyboard/mouse input with remappable bindings and pointer lock.

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch' | 'kick' | 'interact' | 'inventory'
  | 'pause' | 'drink' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8'
  | 'debug' | 'debugMenu' | 'map';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ShiftLeft', 'ShiftRight'],
  kick: ['KeyF'],
  interact: ['KeyE'],
  inventory: ['Tab', 'KeyI'],
  pause: ['Escape', 'KeyP'],
  drink: ['KeyR'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  slot7: ['Digit7'],
  slot8: ['Digit8'],
  debug: ['F3', 'Backquote'],
  debugMenu: ['F4'],
  map: ['KeyM'],
};

const STORE_KEY = 'noita3d.bindings';

export class Input {
  bindings: Record<Action, string[]>;
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0; // bitmask of held mouse buttons
  private clicked = 0;
  locked = false;
  /** When false, gameplay input is ignored (menus, text fields). */
  gameplayEnabled = true;
  sensitivity = 0.0022;
  invertY = false;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.bindings = { ...DEFAULT_BINDINGS };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(this.bindings, JSON.parse(raw));
      const sens = localStorage.getItem('noita3d.sens');
      if (sens) this.sensitivity = parseFloat(sens);
    } catch {
      /* storage unavailable */
    }
    window.addEventListener('keydown', (e) => {
      if (isTextField(e.target)) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Tab', 'Space', 'F3', 'F4', 'ArrowUp', 'ArrowDown', 'Backquote'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons = 0;
    });
    el.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
  }

  saveBindings(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.bindings));
      localStorage.setItem('noita3d.sens', String(this.sensitivity));
    } catch {
      /* ignore */
    }
  }

  requestLock(): void {
    if (!this.locked) {
      const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  held(a: Action): boolean {
    if (!this.gameplayEnabled && a !== 'pause' && a !== 'inventory') return false;
    for (const k of this.bindings[a]) if (this.down.has(k)) return true;
    return false;
  }

  /** True once per key press. */
  hit(a: Action): boolean {
    if (!this.gameplayEnabled && a !== 'pause' && a !== 'inventory') return false;
    for (const k of this.bindings[a]) if (this.pressed.has(k)) return true;
    return false;
  }

  keyHit(code: string): boolean {
    return this.pressed.has(code);
  }

  mouseHeld(button: number): boolean {
    return this.gameplayEnabled && (this.buttons & (1 << button)) !== 0;
  }

  mouseClicked(button: number): boolean {
    return this.gameplayEnabled && (this.clicked & (1 << button)) !== 0;
  }

  /** Inject synthetic input (automated tests). */
  simulateKey(code: string, down: boolean): void {
    if (down) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }
  simulateMouse(button: number, down: boolean): void {
    if (down) {
      this.buttons |= 1 << button;
      this.clicked |= 1 << button;
    } else this.buttons &= ~(1 << button);
  }

  endFrame(): void {
    this.pressed.clear();
    this.clicked = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}
