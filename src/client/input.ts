import type { Action, Settings } from './settings';

/** Keyboard/mouse state with rebindable actions and pointer lock. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  clicked = 0;
  released = 0;
  locked = false;
  /** When true (UI open) gameplay keys are ignored. */
  uiMode = false;
  onKey: ((code: string, e: KeyboardEvent) => boolean | void) | null = null;

  constructor(private canvas: HTMLElement, private settings: Settings) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (this.onKey && this.onKey(e.code, e) === true) {
        e.preventDefault();
        return;
      }
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons = 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.uiMode) {
        this.requestLock();
        return;
      }
      if (!this.locked) return;
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.buttons & (1 << e.button)) this.released |= 1 << e.button;
      this.buttons &= ~(1 << e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.buttons = 0;
    });
  }

  requestLock() {
    try {
      const r = (this.canvas as HTMLCanvasElement).requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* not allowed now */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(a: Action) {
    return !this.uiMode && this.down.has(this.settings.keys[a]);
  }

  /** Edge-triggered: true once per key press. */
  wasPressed(a: Action) {
    return this.pressed.has(this.settings.keys[a]);
  }

  codePressed(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = 0;
    this.released = 0;
  }
}
