/**
 * Keyboard / mouse input with per-frame edge detection, pointer lock and
 * action bindings. Inputs can also be injected programmatically (used by the
 * automated playtest harness and the attract-mode demo).
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'dodge'
  | 'attack'
  | 'block'
  | 'kick'
  | 'interact'
  | 'throw'
  | 'drop'
  | 'rage'
  | 'pause'
  | 'scoreboard';

type Binding = { keys: string[]; mouse?: number[] };

const DEFAULT_BINDINGS: Record<Action, Binding> = {
  forward: { keys: ['KeyW', 'ArrowUp'] },
  back: { keys: ['KeyS', 'ArrowDown'] },
  left: { keys: ['KeyA', 'ArrowLeft'] },
  right: { keys: ['KeyD', 'ArrowRight'] },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'] },
  jump: { keys: ['Space'] },
  crouch: { keys: ['KeyC'] },
  dodge: { keys: ['KeyV', 'AltLeft'] },
  attack: { keys: [], mouse: [0] },
  block: { keys: [], mouse: [2] },
  kick: { keys: ['KeyQ'], mouse: [1] },
  interact: { keys: ['KeyE'] },
  throw: { keys: ['KeyF'], mouse: [4] },
  drop: { keys: ['KeyG'] },
  rage: { keys: ['KeyR'] },
  pause: { keys: ['Escape', 'KeyP'] },
  scoreboard: { keys: ['Tab'] },
};

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private mouseReleased = new Set<number>();
  private virtualDown = new Set<Action>();
  private virtualPressed = new Set<Action>();
  private virtualReleased = new Set<Action>();
  private lastTap = new Map<string, number>();
  private doubleTapped = new Set<string>();

  bindings: Record<Action, Binding> = structuredClone(DEFAULT_BINDINGS);
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  sensitivity = 1;
  invertY = false;
  locked = false;
  /** When false, gameplay input is ignored (menus open). */
  enabled = true;
  onLockChange: ((locked: boolean) => void) | null = null;
  private keyboardLocked = false;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('blur', () => this.clearAll());
  }

  requestLock(): void {
    if (document.pointerLockElement === this.element) return;
    try {
      const p = (this.element as any).requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // unadjustedMovement unsupported on some platforms - retry plain
          try {
            const p2 = (this.element as any).requestPointerLock();
            if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      try {
        this.element.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  async lockKeyboard(): Promise<void> {
    const kb = (navigator as any).keyboard;
    if (kb && kb.lock && document.fullscreenElement) {
      try {
        await kb.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'Escape', 'Tab']);
        this.keyboardLocked = true;
        if (!this.bindings.crouch.keys.includes('ControlLeft')) this.bindings.crouch.keys.push('ControlLeft');
      } catch {
        /* not supported */
      }
    }
  }

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) this.clearAll();
    this.onLockChange?.(this.locked);
  };

  private clearAll(): void {
    for (const k of this.down) this.released.add(k);
    this.down.clear();
    for (const b of this.mouseDown) this.mouseReleased.add(b);
    this.mouseDown.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    // prevent browser shortcuts / scrolling for game keys while playing
    if (this.locked) {
      if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow') || code === 'AltLeft' || (e.ctrlKey && code !== 'Escape')) {
        e.preventDefault();
      }
    }
    if (e.repeat) return;
    if (!this.down.has(code)) {
      this.pressed.add(code);
      const now = performance.now();
      const last = this.lastTap.get(code) ?? -1e9;
      if (now - last < 260) this.doubleTapped.add(code);
      this.lastTap.set(code, now);
    }
    this.down.add(code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    if (this.down.has(code)) this.released.add(code);
    this.down.delete(code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    if (!this.mouseDown.has(e.button)) this.mousePressed.add(e.button);
    this.mouseDown.add(e.button);
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.mouseDown.has(e.button)) this.mouseReleased.add(e.button);
    this.mouseDown.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    // guard against the occasional huge spike some browsers emit on lock
    const mx = Math.abs(e.movementX) > 600 ? 0 : e.movementX;
    const my = Math.abs(e.movementY) > 600 ? 0 : e.movementY;
    this.mouseDX += mx;
    this.mouseDY += my;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    this.wheel += Math.sign(e.deltaY);
  };

  // ------------- queries -------------
  isDown(a: Action): boolean {
    if (this.virtualDown.has(a)) return true;
    if (!this.enabled) return false;
    const b = this.bindings[a];
    for (const k of b.keys) if (this.down.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mouseDown.has(m)) return true;
    return false;
  }

  wasPressed(a: Action): boolean {
    if (this.virtualPressed.has(a)) return true;
    if (!this.enabled && a !== 'pause') return false;
    const b = this.bindings[a];
    for (const k of b.keys) if (this.pressed.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mousePressed.has(m)) return true;
    return false;
  }

  wasReleased(a: Action): boolean {
    if (this.virtualReleased.has(a)) return true;
    if (!this.enabled) return false;
    const b = this.bindings[a];
    for (const k of b.keys) if (this.released.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mouseReleased.has(m)) return true;
    return false;
  }

  wasDoubleTapped(a: Action): boolean {
    if (!this.enabled) return false;
    for (const k of this.bindings[a].keys) if (this.doubleTapped.has(k)) return true;
    return false;
  }

  keyPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Consume mouse look delta for this frame. */
  consumeLook(): { dx: number; dy: number } {
    const dx = this.mouseDX * this.sensitivity;
    const dy = this.mouseDY * this.sensitivity * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  // ------------- virtual input (tests / demo) -------------
  virtualPress(a: Action): void {
    if (!this.virtualDown.has(a)) this.virtualPressed.add(a);
    this.virtualDown.add(a);
  }

  virtualRelease(a: Action): void {
    if (this.virtualDown.has(a)) this.virtualReleased.add(a);
    this.virtualDown.delete(a);
  }

  virtualTap(a: Action): void {
    this.virtualPressed.add(a);
    this.virtualReleased.add(a);
  }

  /** Call at the end of every rendered frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    this.virtualPressed.clear();
    this.virtualReleased.clear();
    this.doubleTapped.clear();
    this.wheel = 0;
  }
}
