// Keyboard / mouse input with pointer lock.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  private btnPressed = 0;
  private btnReleased = 0;
  locked = false;
  sensitivity = 0.0022;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.locked) e.preventDefault(); return; }
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.buttons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons |= 1 << e.button;
      this.btnPressed |= 1 << e.button;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.buttons & (1 << e.button)) this.btnReleased |= 1 << e.button;
      this.buttons &= ~(1 << e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against occasional huge spikes some browsers produce on lock.
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.down.clear(); this.buttons = 0; }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignored */ });
  }

  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  wasReleased(code: string): boolean { return this.released.has(code); }
  mouseDown(b: number): boolean { return (this.buttons & (1 << b)) !== 0; }
  mousePressed(b: number): boolean { return (this.btnPressed & (1 << b)) !== 0; }
  mouseReleased(b: number): boolean { return (this.btnReleased & (1 << b)) !== 0; }

  /** Simulated input (used by automated tests / demo scripts). */
  simKey(code: string, isDown: boolean): void {
    if (isDown) { this.down.add(code); this.pressed.add(code); } else { this.down.delete(code); this.released.add(code); }
  }
  simButton(b: number, isDown: boolean): void {
    if (isDown) { this.buttons |= 1 << b; this.btnPressed |= 1 << b; } else { this.buttons &= ~(1 << b); this.btnReleased |= 1 << b; }
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.btnPressed = 0;
    this.btnReleased = 0;
  }
}
