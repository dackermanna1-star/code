/**
 * Keyboard / mouse input with pointer lock. Tracks held state plus
 * edge-triggered presses that are cleared at the end of each frame.
 */
export class Input {
  private held = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  private mouseHeld = [false, false, false];
  private mousePressed = [false, false, false];
  private mouseReleased = [false, false, false];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** When false, gameplay input is ignored (menus open). */
  enabled = true;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (this.locked || document.activeElement === document.body || document.activeElement === canvas) e.preventDefault();
      }
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressedSet.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouseHeld = [false, false, false];
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) {
        this.mouseHeld[e.button] = true;
        this.mousePressed[e.button] = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) {
        if (this.mouseHeld[e.button]) this.mouseReleased[e.button] = true;
        this.mouseHeld[e.button] = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against the occasional huge spike some browsers emit on lock
      const mx = Math.abs(e.movementX) > 400 ? 0 : e.movementX;
      const my = Math.abs(e.movementY) > 400 ? 0 : e.movementY;
      this.mouseDX += mx;
      this.mouseDY += my;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.mouseHeld = [false, false, false];
      }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as any) as unknown as Promise<void> | undefined;
      if (p && typeof (p as any).catch === 'function') {
        (p as Promise<void>).catch(() => {
          try {
            this.canvas.requestPointerLock();
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      try {
        this.canvas.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string) {
    return this.enabled && this.held.has(code);
  }
  pressed(code: string) {
    return this.enabled && this.pressedSet.has(code);
  }
  /** Pressed regardless of the enabled flag (for menu hotkeys). */
  pressedRaw(code: string) {
    return this.pressedSet.has(code);
  }
  released(code: string) {
    return this.releasedSet.has(code);
  }
  mouse(btn: number) {
    return this.enabled && this.mouseHeld[btn];
  }
  mousePress(btn: number) {
    return this.enabled && this.mousePressed[btn];
  }
  mouseRelease(btn: number) {
    return this.mouseReleased[btn];
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return this.enabled ? w : 0;
  }
  consumeMouse(): [number, number] {
    const r: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return this.enabled ? r : [0, 0];
  }
  /** Simulated input for automated tests / debug. */
  simulateKey(code: string, down: boolean) {
    if (down) {
      if (!this.held.has(code)) this.pressedSet.add(code);
      this.held.add(code);
    } else {
      this.held.delete(code);
      this.releasedSet.add(code);
    }
  }
  simulateMouse(btn: number, down: boolean) {
    if (down) {
      if (!this.mouseHeld[btn]) this.mousePressed[btn] = true;
      this.mouseHeld[btn] = true;
    } else {
      if (this.mouseHeld[btn]) this.mouseReleased[btn] = true;
      this.mouseHeld[btn] = false;
    }
  }
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
  }
}
